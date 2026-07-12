package Processpipline

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	types "chess/Types"
)

type PuzzleCategory string

const (
	PuzzleCategoryTactical   PuzzleCategory = "tactical"
	PuzzleCategoryForcedMate PuzzleCategory = "forced_mate"
	PuzzleCategoryBlunder    PuzzleCategory = "blunder"
)

type PuzzleCandidateType string

const (
	PuzzleCandidateMissedMove      PuzzleCandidateType = "missed_move"
	PuzzleCandidateOpponentBlunder PuzzleCandidateType = "opponent_blunder"
)

type DiagnosticDecision string

const (
	DiagnosticAccepted DiagnosticDecision = "accepted"
	DiagnosticRejected DiagnosticDecision = "rejected"
	DiagnosticError    DiagnosticDecision = "error"
)

type DiagnosticStage string

const (
	DiagnosticStageSnapshot     DiagnosticStage = "snapshot"
	DiagnosticStageScout        DiagnosticStage = "scout"
	DiagnosticStageConfirmation DiagnosticStage = "confirmation"
	DiagnosticStageContinuation DiagnosticStage = "continuation"
	DiagnosticStageAccepted     DiagnosticStage = "accepted"
)

const (
	ReasonAccepted                = "accepted"
	ReasonInvalidSAN              = "invalid_san"
	ReasonInvalidUCI              = "invalid_uci"
	ReasonBookMove                = "book_move"
	ReasonOpeningPly              = "opening_ply"
	ReasonInsufficientSwing       = "insufficient_swing"
	ReasonPlayedBestMove          = "played_best_move"
	ReasonOnlyLegalMove           = "only_legal_move"
	ReasonNoEngineLine            = "no_engine_line"
	ReasonIncompleteMultiPV       = "incomplete_multipv"
	ReasonNoUniqueBestMove        = "no_unique_best_move"
	ReasonAdvantageTooSmall       = "advantage_too_small"
	ReasonAlreadyDecisive         = "already_decisive"
	ReasonAlternativeStillWinning = "alternative_still_winning"
	ReasonMateTooEasy             = "mate_too_easy"
	ReasonMateTooDeep             = "mate_too_deep"
	ReasonMultipleMatingMoves     = "multiple_mating_moves"
	ReasonShorterMateAvailable    = "shorter_mate_available"
	ReasonSolutionTooShort        = "solution_too_short"
	ReasonSolutionTooLong         = "solution_too_long"
	ReasonContinuationNotForced   = "continuation_not_forced"
	ReasonTacticalPayoffReached   = "tactical_payoff_reached"
	ReasonAdvantageDisappeared    = "advantage_disappeared"
	ReasonMateDistanceMismatch    = "mate_distance_mismatch"
	ReasonInsufficientDepth       = "insufficient_depth"
	ReasonRepetition              = "repetition"
	ReasonGameDrawn               = "game_drawn"
	ReasonEngineTimeout           = "engine_timeout"
	ReasonEngineUnavailable       = "engine_unavailable"
	ReasonMaxPuzzlesReached       = "max_puzzles_reached"
	ReasonDuplicatePuzzle         = "duplicate_puzzle"
)

type DiagnosticOptions struct {
	Enabled       bool
	LogRejections bool
}

type PipelineConfig struct {
	SkipInitialPlies           int
	MaxMovesPerGame            int
	MaxPuzzlesPerGame          int
	ScoutDepth                 int
	ConfirmationDepth          int
	RootVerificationDepth      int
	MinimumConfirmationDepth   int
	ConfirmationMultiPV        int
	MinCPLoss                  int
	BlunderCPLoss              int
	MinWinChanceSwing          float64
	MinAdvantageCP             int
	ContinuationMinAdvantageCP int
	MinTacticalMaterialGain    int
	MinUniquenessCPGap         int
	MinUniquenessWinChanceGap  float64
	DecisiveWinChance          float64
	ComfortableWinChance       float64
	MinMateIn                  int
	MaxMateIn                  int
	MaxSolutionPlies           int
	MaxNonMateSolutionPlies    int
	MinNonMateSolutionPlies    int
	GameConcurrency            int
	ScoutGameConcurrency       int
	PositionConcurrency        int
	EvaluationMoveTime         time.Duration
	PuzzleMoveTime             time.Duration
	Diagnostics                DiagnosticOptions
}

func DefaultPipelineConfig() PipelineConfig {
	cpuCount := configuredPipelineConcurrency()

	return PipelineConfig{
		// Opening membership is handled by the embedded book. A fixed ply skip
		// hides real early-game tactics as soon as either player leaves theory.
		SkipInitialPlies:  0,
		MaxMovesPerGame:   160,
		MaxPuzzlesPerGame: 12,
		ScoutDepth:        15,
		ConfirmationDepth: 19,
		// Only candidates that survive both scout and single-PV swing checks pay
		// for this extra root iteration. It stabilizes threshold-borderline scores
		// without evaluating every game position at depth 20.
		RootVerificationDepth: 20,
		// A completed depth-18 iteration is sufficient for the single-PV swing
		// re-check. Puzzle uniqueness and continuation searches separately require
		// the full ConfirmationDepth and receive a larger time budget below.
		MinimumConfirmationDepth: 18,
		// The best and second-best lines are sufficient to prove whether the
		// solver has a unique move. A third line adds substantial engine work
		// without changing that decision.
		ConfirmationMultiPV:        2,
		MinCPLoss:                  80,
		BlunderCPLoss:              300,
		MinWinChanceSwing:          10,
		MinAdvantageCP:             80,
		ContinuationMinAdvantageCP: 80,
		MinTacticalMaterialGain:    1,
		MinUniquenessCPGap:         100,
		MinUniquenessWinChanceGap:  8,
		DecisiveWinChance:          80,
		ComfortableWinChance:       70,
		MinMateIn:                  1,
		MaxMateIn:                  5,
		MaxSolutionPlies:           10,
		MaxNonMateSolutionPlies:    5,
		MinNonMateSolutionPlies:    3,
		GameConcurrency:            cpuCount,
		ScoutGameConcurrency:       min(2, cpuCount),
		PositionConcurrency:        cpuCount,
		EvaluationMoveTime:         20 * time.Second,
		PuzzleMoveTime:             30 * time.Second,
		Diagnostics: DiagnosticOptions{
			Enabled:       true,
			LogRejections: true,
		},
	}
}

func configuredPipelineConcurrency() int {
	available := runtime.NumCPU()
	if available < 1 {
		available = 1
	}
	configured, err := strconv.Atoi(strings.TrimSpace(os.Getenv("STOCKFISH_POOL_SIZE")))
	if err != nil || configured < 1 {
		return available
	}
	return min(configured, available)
}

func normalizePipelineConfig(config PipelineConfig) PipelineConfig {
	defaults := DefaultPipelineConfig()
	if config.MaxMovesPerGame <= 0 {
		config.MaxMovesPerGame = defaults.MaxMovesPerGame
	}
	if config.MaxPuzzlesPerGame <= 0 {
		config.MaxPuzzlesPerGame = defaults.MaxPuzzlesPerGame
	}
	if config.ScoutDepth <= 0 {
		config.ScoutDepth = defaults.ScoutDepth
	}
	if config.ConfirmationDepth <= 0 {
		config.ConfirmationDepth = defaults.ConfirmationDepth
	}
	if config.RootVerificationDepth <= 0 {
		config.RootVerificationDepth = defaults.RootVerificationDepth
	}
	if config.RootVerificationDepth < config.ConfirmationDepth {
		config.RootVerificationDepth = config.ConfirmationDepth
	}
	if config.MinimumConfirmationDepth <= 0 {
		config.MinimumConfirmationDepth = defaults.MinimumConfirmationDepth
	}
	if config.MinimumConfirmationDepth > config.ConfirmationDepth {
		config.MinimumConfirmationDepth = config.ConfirmationDepth
	}
	if config.ConfirmationMultiPV < 2 {
		config.ConfirmationMultiPV = defaults.ConfirmationMultiPV
	}
	if config.MinCPLoss <= 0 {
		config.MinCPLoss = defaults.MinCPLoss
	}
	if config.BlunderCPLoss <= 0 {
		config.BlunderCPLoss = defaults.BlunderCPLoss
	}
	if config.MinWinChanceSwing <= 0 {
		config.MinWinChanceSwing = defaults.MinWinChanceSwing
	}
	if config.MinAdvantageCP <= 0 {
		config.MinAdvantageCP = defaults.MinAdvantageCP
	}
	if config.ContinuationMinAdvantageCP <= 0 {
		config.ContinuationMinAdvantageCP = defaults.ContinuationMinAdvantageCP
	}
	if config.MinTacticalMaterialGain <= 0 {
		config.MinTacticalMaterialGain = defaults.MinTacticalMaterialGain
	}
	if config.MinUniquenessCPGap <= 0 {
		config.MinUniquenessCPGap = defaults.MinUniquenessCPGap
	}
	if config.MinUniquenessWinChanceGap <= 0 {
		config.MinUniquenessWinChanceGap = defaults.MinUniquenessWinChanceGap
	}
	if config.DecisiveWinChance <= 0 {
		config.DecisiveWinChance = defaults.DecisiveWinChance
	}
	if config.ComfortableWinChance <= 0 {
		config.ComfortableWinChance = defaults.ComfortableWinChance
	}
	if config.MinMateIn <= 0 {
		config.MinMateIn = defaults.MinMateIn
	}
	if config.MaxMateIn <= 0 {
		config.MaxMateIn = defaults.MaxMateIn
	}
	if config.MaxSolutionPlies <= 0 {
		config.MaxSolutionPlies = defaults.MaxSolutionPlies
	}
	if config.MaxNonMateSolutionPlies <= 0 {
		config.MaxNonMateSolutionPlies = defaults.MaxNonMateSolutionPlies
	}
	if config.MinNonMateSolutionPlies <= 0 {
		config.MinNonMateSolutionPlies = defaults.MinNonMateSolutionPlies
	}
	if config.EvaluationMoveTime <= 0 {
		config.EvaluationMoveTime = defaults.EvaluationMoveTime
	}
	if config.PuzzleMoveTime <= 0 {
		config.PuzzleMoveTime = defaults.PuzzleMoveTime
	}
	if config.PuzzleMoveTime < config.EvaluationMoveTime {
		config.PuzzleMoveTime = config.EvaluationMoveTime
	}
	if config.MinNonMateSolutionPlies%2 == 0 {
		config.MinNonMateSolutionPlies++
	}
	if config.MaxNonMateSolutionPlies%2 == 0 {
		config.MaxNonMateSolutionPlies--
	}
	if config.MaxNonMateSolutionPlies < config.MinNonMateSolutionPlies {
		config.MaxNonMateSolutionPlies = config.MinNonMateSolutionPlies
	}
	if config.PositionConcurrency <= 0 {
		config.PositionConcurrency = defaults.PositionConcurrency
	}
	if config.GameConcurrency <= 0 {
		config.GameConcurrency = defaults.GameConcurrency
	}
	if config.GameConcurrency > config.PositionConcurrency {
		config.GameConcurrency = config.PositionConcurrency
	}
	if config.ScoutGameConcurrency <= 0 {
		config.ScoutGameConcurrency = defaults.ScoutGameConcurrency
	}
	if config.ScoutGameConcurrency > 2 {
		config.ScoutGameConcurrency = 2
	}
	if config.ScoutGameConcurrency > config.GameConcurrency {
		config.ScoutGameConcurrency = config.GameConcurrency
	}
	return config
}

type Puzzle struct {
	FEN           string              `json:"fen"`
	Solution      string              `json:"solution"`
	PV            []string            `json:"pv"`
	Category      PuzzleCategory      `json:"category"`
	CandidateType PuzzleCandidateType `json:"candidate_type"`
	TriggerSAN    string              `json:"trigger_san"`
	TriggerUCI    string              `json:"trigger_uci"`
	MateIn        int                 `json:"mate_in"`
	IssueType     types.MoveIssueType `json:"issue_type"`
	MultiPVGap    float64             `json:"multipv_gap"`
	MultiPVCPGap  int                 `json:"multipv_cp_gap"`
	CPBefore      int                 `json:"cp_before"`
	CPAfter       int                 `json:"cp_after"`
	MoveIndex     int                 `json:"move_index"`
	PlayerColor   string              `json:"player_color"`
	SolverColor   string              `json:"solver_color"`
	SideToMove    string              `json:"side_to_move"`
	Depth         int                 `json:"depth"`
	MaterialStart int                 `json:"material_start"`
	MaterialEnd   int                 `json:"material_end"`
}

type PipelineDiagnostic struct {
	GameID             string              `json:"game_id"`
	MoveIndex          int                 `json:"move_index"`
	TriggerSAN         string              `json:"trigger_san"`
	TriggerUCI         string              `json:"trigger_uci"`
	CandidateType      PuzzleCandidateType `json:"candidate_type"`
	SolverColor        string              `json:"solver_color"`
	FEN                string              `json:"fen"`
	BeforeScoreCP      *int                `json:"before_score_cp,omitempty"`
	AfterScoreCP       *int                `json:"after_score_cp,omitempty"`
	BeforeMate         *int                `json:"before_mate,omitempty"`
	AfterMate          *int                `json:"after_mate,omitempty"`
	BeforeWinChance    float64             `json:"before_win_chance"`
	AfterWinChance     float64             `json:"after_win_chance"`
	SwingCP            int                 `json:"swing_cp"`
	WinChanceSwing     float64             `json:"win_chance_swing"`
	TopScoreCP         *int                `json:"top_score_cp,omitempty"`
	SecondScoreCP      *int                `json:"second_score_cp,omitempty"`
	TopMate            *int                `json:"top_mate,omitempty"`
	SecondMate         *int                `json:"second_mate,omitempty"`
	TopWinChance       float64             `json:"top_win_chance"`
	SecondWinChance    float64             `json:"second_win_chance"`
	UniquenessGap      float64             `json:"uniqueness_gap"`
	UniquenessCPGap    int                 `json:"uniqueness_cp_gap"`
	MaterialDifference int                 `json:"material_difference"`
	ContinuationPlies  int                 `json:"continuation_plies"`
	Stage              DiagnosticStage     `json:"stage"`
	Decision           DiagnosticDecision  `json:"decision"`
	ReasonCode         string              `json:"reason_code"`
	Explanation        string              `json:"explanation"`
}

type PipelineStats struct {
	Snapshots        int   `json:"snapshots"`
	Scouted          int   `json:"scouted"`
	Candidates       int   `json:"candidates"`
	Confirmed        int   `json:"confirmed"`
	Rejected         int   `json:"rejected"`
	Accepted         int   `json:"accepted"`
	EvaluationErrors int   `json:"evaluation_errors"`
	EvalRequests     int64 `json:"evaluation_requests"`
	EvalCacheHits    int64 `json:"evaluation_cache_hits"`
	EngineSearches   int64 `json:"engine_searches"`
	EngineTimeMS     int64 `json:"engine_time_ms"`
	ProcessingTimeMS int64 `json:"processing_time_ms"`
}

type PipelineResult struct {
	GameID      string               `json:"game_id"`
	Issues      []types.MoveIssue    `json:"issues"`
	Puzzles     []Puzzle             `json:"puzzles"`
	Diagnostics []PipelineDiagnostic `json:"diagnostics,omitempty"`
	Stats       PipelineStats        `json:"stats"`
	Error       string               `json:"error,omitempty"`
}

type moveSnapshot struct {
	MoveIndex          int
	MoveSAN            string
	MoveUCI            string
	FEN                string
	AfterFEN           string
	SideToMove         string
	PlayerColor        string
	IsUserMove         bool
	IsBookMove         bool
	IsRepeatedPosition bool
}

type puzzleCandidate struct {
	Snapshot      moveSnapshot
	Type          PuzzleCandidateType
	StartFEN      string
	SolverIsWhite bool
	SwingCP       int
	WinSwing      float64
	BeforeEval    types.EvalResult
	AfterEval     types.EvalResult
}

type sequenceResult struct {
	PV          []string
	MateIn      int
	MaterialEnd int
	StopReason  string
	Explanation string
	Valid       bool
}
