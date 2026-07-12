package Processpipline

import (
	"context"
	"strings"
	"testing"
	"time"

	types "chess/Types"

	lib "github.com/RajanDhamala/chess/v2"
	stockfish "github.com/RajanDhamala/go-stockfish"
)

func TestNormalizeToWhitePerspective(t *testing.T) {
	for _, test := range []struct {
		name     string
		fen      string
		score    *int
		mate     *int
		wantCP   *int
		wantMate *int
	}{
		{
			name:   "white to move keeps cp",
			fen:    "8/8/8/8/8/8/8/K6k w - - 0 1",
			score:  intPtr(42),
			wantCP: intPtr(42),
		},
		{
			name:   "black to move flips cp",
			fen:    "8/8/8/8/8/8/8/K6k b - - 0 1",
			score:  intPtr(42),
			wantCP: intPtr(-42),
		},
		{
			name:     "black to move flips mate",
			fen:      "8/8/8/8/8/8/8/K6k b - - 0 1",
			mate:     intPtr(3),
			wantMate: intPtr(-3),
		},
		{
			name: "nil values remain nil",
			fen:  "8/8/8/8/8/8/8/K6k b - - 0 1",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			gotCP, gotMate := normalizeToWhitePerspective(test.fen, test.score, test.mate)
			assertOptionalInt(t, "cp", gotCP, test.wantCP)
			assertOptionalInt(t, "mate", gotMate, test.wantMate)
		})
	}
}

func TestOpportunitySwingUsesAnalyzedUserPerspective(t *testing.T) {
	for _, test := range []struct {
		name        string
		userIsWhite bool
		isUserMove  bool
		beforeCP    int
		afterCP     int
		wantSwing   int
	}{
		{name: "white user mistake", userIsWhite: true, isUserMove: true, beforeCP: 200, afterCP: -100, wantSwing: 300},
		{name: "black user mistake", userIsWhite: false, isUserMove: true, beforeCP: -200, afterCP: 100, wantSwing: 300},
		{name: "white gains after opponent blunder", userIsWhite: true, beforeCP: 0, afterCP: 250, wantSwing: 250},
		{name: "black gains after opponent blunder", userIsWhite: false, beforeCP: 0, afterCP: -250, wantSwing: 250},
	} {
		t.Run(test.name, func(t *testing.T) {
			swing, _ := opportunitySwing(
				moveSnapshot{IsUserMove: test.isUserMove},
				types.EvalResult{ScoreCP: intPtr(test.beforeCP)},
				types.EvalResult{ScoreCP: intPtr(test.afterCP)},
				test.userIsWhite,
			)
			if swing != test.wantSwing {
				t.Fatalf("swing = %d, want %d", swing, test.wantSwing)
			}
		})
	}
}

func TestDefaultNonMateSequenceRangeIsTwoToThreeSolverMoves(t *testing.T) {
	config := DefaultPipelineConfig()
	if config.SkipInitialPlies != 0 {
		t.Fatalf("fixed opening skip = %d, want zero so off-book tactics are scouted", config.SkipInitialPlies)
	}
	if config.ScoutDepth != 15 {
		t.Fatalf("scout depth = %d, want 15", config.ScoutDepth)
	}
	if config.ConfirmationMultiPV != 2 {
		t.Fatalf("confirmation MultiPV = %d, want two comparison lines", config.ConfirmationMultiPV)
	}
	if config.MinNonMateSolutionPlies != 3 || config.MaxNonMateSolutionPlies != 5 {
		t.Fatalf(
			"non-mate range = %d..%d plies, want 3..5",
			config.MinNonMateSolutionPlies,
			config.MaxNonMateSolutionPlies,
		)
	}
	if config.MinCPLoss != 80 {
		t.Fatalf("candidate CP-loss floor = %d, want calibrated 80", config.MinCPLoss)
	}
	if config.MinAdvantageCP != 80 || config.ContinuationMinAdvantageCP != 80 {
		t.Fatalf(
			"tactical advantage floors = root %d continuation %d, want 80/80",
			config.MinAdvantageCP,
			config.ContinuationMinAdvantageCP,
		)
	}
	if config.ConfirmationDepth != 19 || config.RootVerificationDepth != 20 || config.MinimumConfirmationDepth != 18 || config.MinTacticalMaterialGain != 1 {
		t.Fatalf(
			"confirmation/payoff defaults = continuation/root/minimum %d/%d/%d material %d, want 19/20/18/1",
			config.ConfirmationDepth,
			config.RootVerificationDepth,
			config.MinimumConfirmationDepth,
			config.MinTacticalMaterialGain,
		)
	}
	if config.EvaluationMoveTime != 20*time.Second {
		t.Fatalf(
			"engine search budget = %s, want 20s so it remains below the client deadline",
			config.EvaluationMoveTime,
		)
	}
	if config.PuzzleMoveTime != 30*time.Second {
		t.Fatalf("puzzle search budget = %s, want 30s", config.PuzzleMoveTime)
	}
}

func TestForcingMoveDecisionRequiresCentipawnAndWinChanceSeparation(t *testing.T) {
	config := DefaultPipelineConfig()
	config.MinUniquenessWinChanceGap = 1
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, ScoreCP: intPtr(200), PV: []string{"e2e4"}},
		{MultiPV: 2, ScoreCP: intPtr(120), PV: []string{"d2d4"}},
	}}

	code, explanation := forcingMoveDecision(eval, true, config)
	if code != ReasonNoUniqueBestMove {
		t.Fatalf("expected %s, got %s: %s", ReasonNoUniqueBestMove, code, explanation)
	}
	if !strings.Contains(explanation, "80cp") {
		t.Fatalf("expected CP-gap explanation, got %q", explanation)
	}
}

func TestForcingMoveDecisionUsesBlackPerspective(t *testing.T) {
	config := DefaultPipelineConfig()
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, ScoreCP: intPtr(-300), PV: []string{"e7e5"}},
		{MultiPV: 2, ScoreCP: intPtr(-50), PV: []string{"d7d5"}},
	}}

	if code, explanation := forcingMoveDecision(eval, false, config); code != "" {
		t.Fatalf("expected a unique black move, got %s: %s", code, explanation)
	}
}

func TestForcingMoveDecisionRequiresWinChanceGapWhenCPGapPasses(t *testing.T) {
	config := DefaultPipelineConfig()
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, ScoreCP: intPtr(1000), PV: []string{"e2e4"}},
		{MultiPV: 2, ScoreCP: intPtr(900), PV: []string{"d2d4"}},
	}}

	code, explanation := forcingMoveDecision(eval, true, config)
	if code != ReasonNoUniqueBestMove {
		t.Fatalf("expected %s, got %s: %s", ReasonNoUniqueBestMove, code, explanation)
	}
	if !strings.Contains(explanation, "winning-chance") {
		t.Fatalf("expected win-chance-gap explanation, got %q", explanation)
	}
}

func TestFreemiumConfigMapsAccuracyOptions(t *testing.T) {
	options := DefaultFreemiumAnalysisOptions()
	config := FreemiumPipelineConfig(options)
	if config.SkipInitialPlies != 0 {
		t.Fatalf("freemium fixed opening skip = %d, want embedded-book handling", config.SkipInitialPlies)
	}
	if config.ConfirmationDepth != max(options.EvalDepth, options.AfterEvalDepth) {
		t.Fatalf("confirmation depth = %d, options = %#v", config.ConfirmationDepth, options)
	}
	if config.RootVerificationDepth != config.ConfirmationDepth {
		t.Fatalf("freemium root depth = %d, want %d", config.RootVerificationDepth, config.ConfirmationDepth)
	}
	if config.MinimumConfirmationDepth != config.ConfirmationDepth {
		t.Fatalf("freemium minimum depth = %d, want target %d", config.MinimumConfirmationDepth, config.ConfirmationDepth)
	}
	if config.MinUniquenessCPGap != options.MinGapCP {
		t.Fatalf("CP uniqueness gap = %d, want %d", config.MinUniquenessCPGap, options.MinGapCP)
	}
	if config.MaxNonMateSolutionPlies != options.MaxSolutionPlies {
		t.Fatalf(
			"freemium non-mate maximum = %d, want %d",
			config.MaxNonMateSolutionPlies,
			options.MaxSolutionPlies,
		)
	}
	if config.MinNonMateSolutionPlies != 3 || config.MaxNonMateSolutionPlies != 5 {
		t.Fatalf(
			"freemium non-mate range = %d..%d plies, want 3..5",
			config.MinNonMateSolutionPlies,
			config.MaxNonMateSolutionPlies,
		)
	}
	if config.MaxSolutionPlies != DefaultPipelineConfig().MaxSolutionPlies {
		t.Fatalf("freemium unexpectedly shortened the mate safety limit to %d", config.MaxSolutionPlies)
	}
}

func TestBuildPuzzleSequenceRejectsLineRequiringFourthSolverMove(t *testing.T) {
	config := DefaultPipelineConfig()
	moves := []string{
		"e2e4", "e7e5",
		"g1f3", "b8c6",
		"f1b5", "a7a6",
		"b5a4",
	}
	startFEN, positions := sequenceTestPositions(t, moves)
	results := sequenceTestEvaluations(config, positions, moves, 400, 0)

	result := newProcessor(fakeEvaluator{results: results}, config).buildPuzzleSequence(
		context.Background(),
		startFEN,
		true,
		sequenceTestInitialEval(moves[0], 400, 0),
	)
	if result.Valid {
		t.Fatalf("expected an overlong tactic to be rejected, got %v", result.PV)
	}
	if result.StopReason != ReasonSolutionTooLong {
		t.Fatalf("expected %s, got %s: %s", ReasonSolutionTooLong, result.StopReason, result.Explanation)
	}
}

func TestBuildPuzzleSequenceStopsAfterStableMaterialPayoff(t *testing.T) {
	config := DefaultPipelineConfig()
	moves := []string{"e2e4", "d7d5", "e4d5", "c7c6", "g1f3"}
	startFEN, positions := sequenceTestPositions(t, moves)
	results := sequenceTestEvaluations(config, positions, moves, 400, 0)

	result := newProcessor(fakeEvaluator{results: results}, config).buildPuzzleSequence(
		context.Background(),
		startFEN,
		true,
		sequenceTestInitialEval(moves[0], 400, 0),
	)
	if !result.Valid || len(result.PV) != 3 {
		t.Fatalf("expected a stable 3-ply material tactic, got %#v", result)
	}
	if result.StopReason != ReasonTacticalPayoffReached {
		t.Fatalf("expected %s, got %s", ReasonTacticalPayoffReached, result.StopReason)
	}
}

func TestBuildPuzzleSequenceRejectsMateDistanceMismatch(t *testing.T) {
	const fen = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"
	initial := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, Mate: intPtr(-2), PV: []string{"d8h4"}},
		{MultiPV: 2, ScoreCP: intPtr(0), PV: []string{"a7a6"}},
		{MultiPV: 3, ScoreCP: intPtr(20), PV: []string{"b7b6"}},
	}}

	result := newProcessor(fakeEvaluator{}, DefaultPipelineConfig()).buildPuzzleSequence(
		context.Background(),
		fen,
		false,
		initial,
	)
	if result.Valid || result.StopReason != ReasonMateDistanceMismatch {
		t.Fatalf("expected %s, got %#v", ReasonMateDistanceMismatch, result)
	}
}

func TestBuildPuzzleSequenceRejectsKnownShallowContinuation(t *testing.T) {
	config := DefaultPipelineConfig()
	moves := []string{"e2e4", "e7e5", "g1f3"}
	startFEN, positions := sequenceTestPositions(t, moves)
	shallow := sequenceTestRawEval(positions[1], moves[1], 400, 0)
	shallow.Depth = config.ConfirmationDepth - 1
	for index := range shallow.Lines {
		shallow.Lines[index].Depth = config.ConfirmationDepth - 1
	}
	results := map[string]stockfish.EvalResult{
		fakeEvaluationKey(positions[1], config.ConfirmationDepth, 1): shallow,
	}

	result := newProcessor(fakeEvaluator{results: results}, config).buildPuzzleSequence(
		context.Background(),
		startFEN,
		true,
		sequenceTestInitialEval(moves[0], 400, 0),
	)
	if result.Valid || result.StopReason != ReasonInsufficientDepth {
		t.Fatalf("expected %s, got %#v", ReasonInsufficientDepth, result)
	}
}

func TestBuildPuzzleSequenceRejectsIncompleteMultiPV(t *testing.T) {
	config := DefaultPipelineConfig()
	initial := sequenceTestInitialEval("e2e4", 400, 0)
	initial.Lines = initial.Lines[:1]

	result := newProcessor(fakeEvaluator{}, config).buildPuzzleSequence(
		context.Background(),
		lib.NewGame().Position().String(),
		true,
		initial,
	)
	if result.Valid || result.StopReason != ReasonIncompleteMultiPV {
		t.Fatalf("expected %s, got %#v", ReasonIncompleteMultiPV, result)
	}
}

func TestBuildPuzzleSequenceValidatesBlackSolverEndToEnd(t *testing.T) {
	config := DefaultPipelineConfig()
	const startFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
	option, err := lib.FEN(startFEN)
	if err != nil {
		t.Fatalf("parse start FEN: %v", err)
	}
	game := lib.NewGame(option)
	moves := []string{"e7e5", "e2e4", "g8f6", "b1c3"}
	positions := []string{game.Position().String()}
	for _, move := range moves {
		if err := playUCIMove(game, move); err != nil {
			t.Fatalf("play %s: %v", move, err)
		}
		positions = append(positions, game.Position().String())
	}
	results := map[string]stockfish.EvalResult{
		fakeEvaluationKey(positions[1], config.ConfirmationDepth, 1): {
			Depth:   config.ConfirmationDepth,
			ScoreCP: intPtr(-400),
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, Depth: config.ConfirmationDepth, ScoreCP: intPtr(-400), PV: []string{moves[1]}},
			},
		},
		fakeEvaluationKey(positions[2], config.ConfirmationDepth, config.ConfirmationMultiPV): blackSolverRawEval(
			config,
			moves[2],
			400,
			0,
		),
		fakeEvaluationKey(positions[3], config.ConfirmationDepth, 1): {
			Depth:   config.ConfirmationDepth,
			ScoreCP: intPtr(-400),
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, Depth: config.ConfirmationDepth, ScoreCP: intPtr(-400), PV: []string{moves[3]}},
			},
		},
		fakeEvaluationKey(positions[4], config.ConfirmationDepth, config.ConfirmationMultiPV): blackSolverRawEval(
			config,
			"d7d6",
			400,
			390,
		),
	}
	initial := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, Depth: config.ConfirmationDepth, ScoreCP: intPtr(-400), PV: []string{moves[0]}},
		{MultiPV: 2, Depth: config.ConfirmationDepth, ScoreCP: intPtr(0), PV: []string{"d7d5"}},
		{MultiPV: 3, Depth: config.ConfirmationDepth, ScoreCP: intPtr(20), PV: []string{"c7c5"}},
	}}

	result := newProcessor(fakeEvaluator{results: results}, config).buildPuzzleSequence(
		context.Background(),
		startFEN,
		false,
		initial,
	)
	if !result.Valid || len(result.PV) != 3 {
		t.Fatalf("expected a valid 3-ply black solution, got %#v", result)
	}
}

func blackSolverRawEval(
	config PipelineConfig,
	bestMove string,
	topBlackCP int,
	secondBlackCP int,
) stockfish.EvalResult {
	return stockfish.EvalResult{
		Depth:   config.ConfirmationDepth,
		ScoreCP: intPtr(topBlackCP),
		Lines: []stockfish.EvalLine{
			{MultiPV: 1, Depth: config.ConfirmationDepth, ScoreCP: intPtr(topBlackCP), PV: []string{bestMove}},
			{MultiPV: 2, Depth: config.ConfirmationDepth, ScoreCP: intPtr(secondBlackCP), PV: []string{"d7d6"}},
			{MultiPV: 3, Depth: config.ConfirmationDepth, ScoreCP: intPtr(secondBlackCP - 20), PV: []string{"c7c6"}},
		},
	}
}

func TestReasonFromSequencePreservesAccuracyRejections(t *testing.T) {
	for _, reason := range []string{
		ReasonAdvantageDisappeared,
		ReasonIncompleteMultiPV,
		ReasonSolutionTooLong,
		ReasonMateDistanceMismatch,
		ReasonInsufficientDepth,
		ReasonMultipleMatingMoves,
		ReasonShorterMateAvailable,
	} {
		if got := reasonFromSequence(sequenceResult{StopReason: reason}); got != reason {
			t.Fatalf("reason %s mapped to %s", reason, got)
		}
	}
}

func assertOptionalInt(t *testing.T, label string, got *int, want *int) {
	t.Helper()
	if got == nil || want == nil {
		if got != nil || want != nil {
			t.Fatalf("%s = %v, want %v", label, got, want)
		}
		return
	}
	if *got != *want {
		t.Fatalf("%s = %d, want %d", label, *got, *want)
	}
}
