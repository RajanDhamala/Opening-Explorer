package Processpipline

import (
	"chess/Types"

	stockfish "github.com/RajanDhamala/go-stockfish"
)

const (
	defaultFreemiumSkipInitialPlies = 8
	defaultFreemiumMaxUserMoves     = 30
	defaultFreemiumMaxPuzzles       = 8
	defaultFreemiumEvalDepth        = 10
	defaultFreemiumAfterEvalDepth   = 8
	defaultFreemiumMultiPV          = 2
	defaultFreemiumMinCPLoss        = 180
	defaultFreemiumStrongCPLoss     = 300
	defaultFreemiumMinGapCP         = 120
	defaultFreemiumCooldownMoves    = 4
	defaultFreemiumMaxSolutionPlies = 3
	defaultFreemiumDecidedCPBound   = 900
)

type FreemiumAnalysisOptions struct {
	SkipInitialPlies int
	MaxUserMoves     int
	MaxPuzzles       int
	EvalDepth        int
	AfterEvalDepth   int
	MultiPV          int
	MinCPLoss        int
	StrongCPLoss     int
	MinGapCP         int
	CooldownMoves    int
	MaxSolutionPlies int
	DecidedCPBound   int
}

func DefaultFreemiumAnalysisOptions() FreemiumAnalysisOptions {
	return FreemiumAnalysisOptions{
		SkipInitialPlies: defaultFreemiumSkipInitialPlies,
		MaxUserMoves:     defaultFreemiumMaxUserMoves,
		MaxPuzzles:       defaultFreemiumMaxPuzzles,
		EvalDepth:        defaultFreemiumEvalDepth,
		AfterEvalDepth:   defaultFreemiumAfterEvalDepth,
		MultiPV:          defaultFreemiumMultiPV,
		MinCPLoss:        defaultFreemiumMinCPLoss,
		StrongCPLoss:     defaultFreemiumStrongCPLoss,
		MinGapCP:         defaultFreemiumMinGapCP,
		CooldownMoves:    defaultFreemiumCooldownMoves,
		MaxSolutionPlies: defaultFreemiumMaxSolutionPlies,
		DecidedCPBound:   defaultFreemiumDecidedCPBound,
	}
}

func GenerateFreemiumPuzzles(moves []types.Move, client *stockfish.Client, isWhite bool) ([]types.MoveIssue, []Puzzle) {
	return GenerateFreemiumPuzzlesWithOptions(moves, client, isWhite, DefaultFreemiumAnalysisOptions())
}

func GenerateFreemiumPuzzlesWithOptions(moves []types.Move, client *stockfish.Client, isWhite bool, opts FreemiumAnalysisOptions) ([]types.MoveIssue, []Puzzle) {
	if client == nil || len(moves) == 0 {
		return nil, nil
	}

	opts = normalizeFreemiumOptions(opts)
	snapshots := prepareSnapshots(moves, isWhite)
	if len(snapshots) == 0 {
		return nil, nil
	}

	windows := buildEvaluationWindows(snapshots, opts.SkipInitialPlies, opts.MaxUserMoves)
	if len(windows) == 0 {
		return nil, nil
	}

	return analyzeFreemiumWindows(client, windows, isWhite, opts)
}

func analyzeFreemiumWindows(client *stockfish.Client, windows []evaluationWindow, userIsWhite bool, opts FreemiumAnalysisOptions) ([]types.MoveIssue, []Puzzle) {
	userColor := colorFromBool(userIsWhite)
	issues := make([]types.MoveIssue, 0, opts.MaxPuzzles)
	puzzles := make([]Puzzle, 0, opts.MaxPuzzles)
	lastPuzzleMoveIndex := -opts.CooldownMoves

	for _, window := range windows {
		if len(puzzles) >= opts.MaxPuzzles {
			break
		}
		if window.Snapshot.MoveIndex-lastPuzzleMoveIndex < opts.CooldownMoves {
			continue
		}

		moveIsWhite := window.Snapshot.SideToMove == "w"
		beforeEval := evaluatePositionCached(client, window.Snapshot.Fen, opts.EvalDepth, opts.MultiPV, 0)
		if !isEvaluationAvailable(beforeEval) {
			continue
		}
		if freemiumPositionTooDecided(beforeEval, moveIsWhite, opts.DecidedCPBound) {
			continue
		}
		if sameUCIMove(window.Snapshot.MoveUCI, beforeEval.BestMove) {
			continue
		}

		afterEval := evaluatePositionCached(client, window.Snapshot.AfterFen, opts.AfterEvalDepth, 1, 0)
		if !isEvaluationAvailable(afterEval) {
			continue
		}

		cpDelta, hasCPLoss := centipawnLoss(beforeEval.ScoreCP, afterEval.ScoreCP, moveIsWhite)
		isForcedMate, mateIn, matingMoves := isForcedMatePuzzle(beforeEval, moveIsWhite)
		hasGap := hasTacticalGap(beforeEval.Lines, moveIsWhite, opts.MinGapCP)
		if !freemiumCandidateHasSignal(isForcedMate, hasGap, cpDelta, hasCPLoss, opts) {
			continue
		}

		solution := freemiumSolutionPV(beforeEval, opts.MaxSolutionPlies)
		if len(solution) == 0 && len(matingMoves) > 0 {
			solution = []string{matingMoves[0]}
		}
		if len(solution) == 0 {
			continue
		}

		category := puzzleCategoryForCandidate(isForcedMate, cpDelta)
		issueType := freemiumIssueType(category, beforeEval, afterEval, moveIsWhite, cpDelta)
		puzzle := Puzzle{
			FEN:         window.Snapshot.Fen,
			Solution:    solution[0],
			PV:          append([]string(nil), solution...),
			Category:    category,
			MateIn:      mateIn,
			IssueType:   issueType,
			CPBefore:    scoreOrZero(beforeEval.ScoreCP),
			CPAfter:     scoreOrZero(afterEval.ScoreCP),
			MoveIndex:   window.Snapshot.MoveIndex,
			PlayerColor: window.Snapshot.PlayerColor,
			SideToMove:  window.Snapshot.SideToMove,
			Depth:       (len(solution) + 1) / 2,
		}
		if gap, ok := winChancesGap(beforeEval.Lines, moveIsWhite); ok {
			puzzle.MultiPVGap = gap
		}
		if materialEnd, ok := materialDiffAfterPV(puzzle.FEN, solution, moveIsWhite); ok {
			puzzle.MaterialStart = materialDiffForPuzzleSide(puzzle.FEN, moveIsWhite)
			puzzle.MaterialEnd = materialEnd
		}

		puzzles = append(puzzles, puzzle)
		lastPuzzleMoveIndex = window.Snapshot.MoveIndex
		issues = append(issues, types.MoveIssue{
			MoveIndex:      window.Snapshot.MoveIndex,
			MoveSAN:        window.Snapshot.MoveSAN,
			MoveUCI:        window.Snapshot.MoveUCI,
			Fen:            window.Snapshot.Fen,
			SideToMove:     window.Snapshot.SideToMove,
			PlayerColor:    window.Snapshot.PlayerColor,
			UserColor:      userColor,
			IssueType:      issueType,
			PlayedBestMove: false,
			BestMove:       beforeEval.BestMove,
			Ponder:         beforeEval.Ponder,
			PV:             append([]string(nil), solution...),
			Solution:       append([]string(nil), solution...),
			Depth:          beforeEval.Depth,
			ScoreCP:        beforeEval.ScoreCP,
			Mate:           beforeEval.Mate,
			AfterScoreCP:   afterEval.ScoreCP,
			AfterMate:      afterEval.Mate,
			CPDelta:        cpDelta,
		})
	}

	return issues, puzzles
}

func normalizeFreemiumOptions(opts FreemiumAnalysisOptions) FreemiumAnalysisOptions {
	defaults := DefaultFreemiumAnalysisOptions()
	if opts.SkipInitialPlies <= 0 {
		opts.SkipInitialPlies = defaults.SkipInitialPlies
	}
	if opts.MaxUserMoves <= 0 {
		opts.MaxUserMoves = defaults.MaxUserMoves
	}
	if opts.MaxPuzzles <= 0 {
		opts.MaxPuzzles = defaults.MaxPuzzles
	}
	if opts.EvalDepth <= 0 {
		opts.EvalDepth = defaults.EvalDepth
	}
	if opts.AfterEvalDepth <= 0 {
		opts.AfterEvalDepth = defaults.AfterEvalDepth
	}
	if opts.MultiPV <= 0 {
		opts.MultiPV = defaults.MultiPV
	}
	if opts.MinCPLoss <= 0 {
		opts.MinCPLoss = defaults.MinCPLoss
	}
	if opts.StrongCPLoss <= 0 {
		opts.StrongCPLoss = defaults.StrongCPLoss
	}
	if opts.MinGapCP <= 0 {
		opts.MinGapCP = defaults.MinGapCP
	}
	if opts.CooldownMoves <= 0 {
		opts.CooldownMoves = defaults.CooldownMoves
	}
	if opts.MaxSolutionPlies <= 0 {
		opts.MaxSolutionPlies = defaults.MaxSolutionPlies
	}
	if opts.DecidedCPBound <= 0 {
		opts.DecidedCPBound = defaults.DecidedCPBound
	}
	if opts.MultiPV < 2 {
		opts.MultiPV = 2
	}
	return opts
}

func freemiumPositionTooDecided(eval types.EvalResult, moveIsWhite bool, cpBound int) bool {
	state := mateStateForMover(eval.Mate, moveIsWhite)
	if state.BeingMated {
		return true
	}
	cp, ok := moverCentipawn(eval.ScoreCP, moveIsWhite)
	return ok && abs(cp) > cpBound
}

func freemiumCandidateHasSignal(isForcedMate bool, hasGap bool, cpDelta int, hasCPLoss bool, opts FreemiumAnalysisOptions) bool {
	if isForcedMate {
		return true
	}
	if !hasCPLoss || cpDelta < opts.MinCPLoss {
		return false
	}
	return hasGap || cpDelta >= opts.StrongCPLoss
}

func freemiumIssueType(category PuzzleCategory, beforeEval types.EvalResult, afterEval types.EvalResult, moveIsWhite bool, cpDelta int) types.MoveIssueType {
	switch category {
	case PuzzleCategoryForcedMate:
		return types.MoveIssueForcedMateMissed
	case PuzzleCategoryBlunder:
		return types.MoveIssueBlunder
	}
	issueType := classifyIssue(&beforeEval, &afterEval, moveIsWhite)
	if issueType != "" {
		return issueType
	}
	if cpDelta >= puzzleBlunderCPLoss {
		return types.MoveIssueBlunder
	}
	return types.MoveIssueMistake
}

func freemiumSolutionPV(eval types.EvalResult, maxPlies int) []string {
	if maxPlies <= 0 {
		maxPlies = defaultFreemiumMaxSolutionPlies
	}

	var raw []string
	if len(eval.Lines) > 0 && len(eval.Lines[0].PV) > 0 {
		raw = eval.Lines[0].PV
	} else if len(eval.PV) > 0 {
		raw = eval.PV
	} else if eval.BestMove != "" {
		raw = []string{eval.BestMove}
	}

	normalized := normalizePVForStorage(raw)
	if len(normalized) > maxPlies {
		normalized = normalized[:maxPlies]
	}
	return normalized
}
