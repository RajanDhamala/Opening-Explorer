package Processpipline

import (
	"context"
	"testing"

	types "chess/Types"

	lib "github.com/RajanDhamala/chess/v2"
	stockfish "github.com/RajanDhamala/go-stockfish"
)

func TestBuildPuzzleSequenceNonMateHasTwoOrThreeSolverMoves(t *testing.T) {
	config := DefaultPipelineConfig()
	moves := []string{
		"e2e4", "e7e5",
		"g1f3", "b8c6",
		"f1b5", "a7a6",
		"b5a4", "g8f6",
		"e1g1", "f8e7",
	}
	startFEN, positions := sequenceTestPositions(t, moves)
	for _, test := range []struct {
		name             string
		boundaryPosition int
		wantPlies        int
	}{
		{name: "two solver moves", boundaryPosition: 4, wantPlies: 3},
		{name: "three solver moves", boundaryPosition: 6, wantPlies: 5},
	} {
		t.Run(test.name, func(t *testing.T) {
			results := sequenceTestEvaluations(config, positions, moves, 400, 0)
			boundaryFEN := positions[test.boundaryPosition]
			results[fakeEvaluationKey(
				boundaryFEN,
				config.ConfirmationDepth,
				config.ConfirmationMultiPV,
			)] = sequenceTestRawEval(boundaryFEN, moves[test.boundaryPosition], 400, 390)

			result := newProcessor(fakeEvaluator{results: results}, config).buildPuzzleSequence(
				context.Background(),
				startFEN,
				true,
				sequenceTestInitialEval(moves[0], 400, 0),
			)

			if !result.Valid {
				t.Fatalf("expected forced non-mate line to be accepted, got %s: %s", result.StopReason, result.Explanation)
			}
			if len(result.PV) != test.wantPlies {
				t.Fatalf("expected %d plies, got %d: %v", test.wantPlies, len(result.PV), result.PV)
			}
		})
	}
}

func TestBuildPuzzleSequenceRejectsLaterDisappearingAdvantage(t *testing.T) {
	config := DefaultPipelineConfig()
	moves := []string{"e2e4", "e7e5", "g1f3", "b8c6", "f1b5"}
	startFEN, positions := sequenceTestPositions(t, moves)
	results := sequenceTestEvaluations(config, positions, moves, 400, 0)
	results[fakeEvaluationKey(
		positions[4],
		config.ConfirmationDepth,
		config.ConfirmationMultiPV,
	)] = sequenceTestRawEval(positions[4], moves[4], 50, 0)

	result := newProcessor(fakeEvaluator{results: results}, config).buildPuzzleSequence(
		context.Background(),
		startFEN,
		true,
		sequenceTestInitialEval(moves[0], 400, 0),
	)

	if result.Valid {
		t.Fatalf("expected the line to be rejected when the solver advantage disappears, got accepted PV %v", result.PV)
	}
	if result.StopReason != ReasonAdvantageDisappeared {
		t.Fatalf("expected %s, got %s: %s", ReasonAdvantageDisappeared, result.StopReason, result.Explanation)
	}
}

func TestBuildPuzzleSequenceAcceptsSoundPrefixWhenNextSolverMoveIsNotUnique(t *testing.T) {
	config := DefaultPipelineConfig()
	moves := []string{"e2e4", "e7e5", "g1f3", "b8c6", "f1b5"}
	startFEN, positions := sequenceTestPositions(t, moves)
	results := sequenceTestEvaluations(config, positions, moves, 400, 0)
	results[fakeEvaluationKey(
		positions[4],
		config.ConfirmationDepth,
		config.ConfirmationMultiPV,
	)] = sequenceTestRawEval(positions[4], moves[4], 400, 390)

	result := newProcessor(fakeEvaluator{results: results}, config).buildPuzzleSequence(
		context.Background(),
		startFEN,
		true,
		sequenceTestInitialEval(moves[0], 400, 0),
	)

	if !result.Valid {
		t.Fatalf("expected the sound forced prefix to be accepted, got %s: %s", result.StopReason, result.Explanation)
	}
	if result.StopReason != ReasonContinuationNotForced {
		t.Fatalf("expected %s, got %s: %s", ReasonContinuationNotForced, result.StopReason, result.Explanation)
	}
	want := moves[:3]
	if len(result.PV) != len(want) {
		t.Fatalf("expected 3-ply prefix %v, got %v", want, result.PV)
	}
	for index := range want {
		if result.PV[index] != want[index] {
			t.Fatalf("expected 3-ply prefix %v, got %v", want, result.PV)
		}
	}
}

func sequenceTestPositions(t *testing.T, moves []string) (string, []string) {
	t.Helper()
	game := lib.NewGame()
	startFEN := game.Position().String()
	positions := make([]string, 1, len(moves)+1)
	positions[0] = startFEN
	for _, move := range moves {
		if err := playUCIMove(game, move); err != nil {
			t.Fatalf("play test move %s: %v", move, err)
		}
		positions = append(positions, game.Position().String())
	}
	return startFEN, positions
}

func sequenceTestEvaluations(
	config PipelineConfig,
	positions []string,
	moves []string,
	topWhiteCP int,
	secondWhiteCP int,
) map[string]stockfish.EvalResult {
	results := make(map[string]stockfish.EvalResult, len(moves)-1)
	for ply := 1; ply < len(moves); ply++ {
		fen := positions[ply]
		multiPV := config.ConfirmationMultiPV
		if sideToMoveFromFEN(fen) == "b" {
			multiPV = 1
		}
		results[fakeEvaluationKey(
			fen,
			config.ConfirmationDepth,
			multiPV,
		)] = sequenceTestRawEval(fen, moves[ply], topWhiteCP, secondWhiteCP)
	}
	return results
}

func sequenceTestInitialEval(bestMove string, topWhiteCP int, secondWhiteCP int) types.EvalResult {
	return types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, ScoreCP: intPtr(topWhiteCP), PV: []string{bestMove}},
		{MultiPV: 2, ScoreCP: intPtr(secondWhiteCP), PV: []string{"d2d4"}},
		{MultiPV: 3, ScoreCP: intPtr(secondWhiteCP - 20), PV: []string{"c2c4"}},
	}}
}

func sequenceTestRawEval(
	fen string,
	bestMove string,
	topWhiteCP int,
	secondWhiteCP int,
) stockfish.EvalResult {
	topEngineCP := topWhiteCP
	secondEngineCP := secondWhiteCP
	if sideToMoveFromFEN(fen) == "b" {
		topEngineCP = -topEngineCP
		secondEngineCP = -secondEngineCP
	}
	return stockfish.EvalResult{Lines: []stockfish.EvalLine{
		{MultiPV: 1, ScoreCP: intPtr(topEngineCP), PV: []string{bestMove}},
		{MultiPV: 2, ScoreCP: intPtr(secondEngineCP), PV: []string{"a2a3"}},
		{MultiPV: 3, ScoreCP: intPtr(secondEngineCP - 20), PV: []string{"h2h3"}},
	}}
}
