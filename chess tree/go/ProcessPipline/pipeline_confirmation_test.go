package Processpipline

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"

	types "chess/Types"

	stockfish "github.com/RajanDhamala/go-stockfish"
)

type confirmationTrackingEvaluator struct {
	mu      sync.Mutex
	results map[string]stockfish.EvalResult
	calls   map[string]int
}

func (e *confirmationTrackingEvaluator) Evaluate(
	_ context.Context,
	request stockfish.EvalRequest,
) (stockfish.EvalResult, error) {
	key := confirmationEvaluationKey(request.FEN, request.Depth, request.MultiPV)
	e.mu.Lock()
	defer e.mu.Unlock()
	e.calls[key]++
	result, ok := e.results[key]
	if !ok {
		return stockfish.EvalResult{}, fmt.Errorf("missing confirmation evaluation for %s", key)
	}
	return result, nil
}

func (e *confirmationTrackingEvaluator) callCount(key string) int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.calls[key]
}

func confirmationEvaluationKey(fen string, depth int, multiPV int) string {
	return fmt.Sprintf("%s|%d|%d", fen, depth, multiPV)
}

func confirmationCandidate(t *testing.T) puzzleCandidate {
	t.Helper()
	snapshots, err := prepareSnapshots([]types.Move{{San: "f3"}}, true)
	if err != nil {
		t.Fatalf("prepare confirmation snapshot: %v", err)
	}
	snapshot := snapshots[0]
	snapshot.IsBookMove = false
	return puzzleCandidate{
		Snapshot:      snapshot,
		Type:          PuzzleCandidateMissedMove,
		StartFEN:      snapshot.FEN,
		SolverIsWhite: true,
	}
}

func TestConfirmationSwingUsesMatchingSinglePVEvaluations(t *testing.T) {
	config := DefaultPipelineConfig()
	config.Diagnostics.LogRejections = false
	candidate := confirmationCandidate(t)
	rootKey := confirmationEvaluationKey(
		candidate.StartFEN,
		config.RootVerificationDepth,
		config.ConfirmationMultiPV,
	)
	beforeKey := confirmationEvaluationKey(candidate.StartFEN, config.ConfirmationDepth, 1)
	afterKey := confirmationEvaluationKey(candidate.Snapshot.AfterFEN, config.ConfirmationDepth, 1)
	evaluator := &confirmationTrackingEvaluator{
		results: map[string]stockfish.EvalResult{
			rootKey: {
				BestMove: "d2d4",
				Depth:    config.ConfirmationDepth,
				ScoreCP:  intPtr(900),
				PV:       []string{"d2d4"},
				Lines: []stockfish.EvalLine{
					{MultiPV: 1, Depth: config.ConfirmationDepth, ScoreCP: intPtr(900), PV: []string{"d2d4"}},
					{MultiPV: 2, Depth: config.ConfirmationDepth, ScoreCP: intPtr(890), PV: []string{"e2e4"}},
					{MultiPV: 3, Depth: config.ConfirmationDepth, ScoreCP: intPtr(880), PV: []string{"c2c4"}},
				},
			},
			beforeKey: {
				BestMove: "d2d4",
				Depth:    config.ConfirmationDepth,
				ScoreCP:  intPtr(200),
				PV:       []string{"d2d4"},
				Lines: []stockfish.EvalLine{
					{MultiPV: 1, Depth: config.ConfirmationDepth, ScoreCP: intPtr(200), PV: []string{"d2d4"}},
				},
			},
			afterKey: {
				BestMove: "e7e5",
				Depth:    config.ConfirmationDepth,
				// The evaluator reports side-to-move scores. Since Black is to
				// move after f3, normalization turns this into -100 for White.
				ScoreCP: intPtr(100),
				PV:      []string{"e7e5"},
				Lines: []stockfish.EvalLine{
					{MultiPV: 1, Depth: config.ConfirmationDepth, ScoreCP: intPtr(100), PV: []string{"e7e5"}},
				},
			},
		},
		calls: make(map[string]int),
	}
	processor := newProcessor(evaluator, config)

	diagnostic := PipelineDiagnostic{}
	confirmation := processor.confirmCandidate(context.Background(), candidate, &diagnostic)
	if !confirmation.IssueConfirmed {
		t.Fatalf("expected the matching single-PV scores to confirm the issue: %#v", diagnostic)
	}
	if diagnostic.SwingCP != 300 {
		t.Fatalf("confirmed swing = %d, want 300 from 200 - (-100)", diagnostic.SwingCP)
	}
	if confirmation.Candidate.BeforeEval.ScoreCP == nil || *confirmation.Candidate.BeforeEval.ScoreCP != 200 {
		t.Fatalf("before evaluation did not come from MultiPV=1: %#v", confirmation.Candidate.BeforeEval)
	}
	if confirmation.Candidate.AfterEval.ScoreCP == nil || *confirmation.Candidate.AfterEval.ScoreCP != -100 {
		t.Fatalf("after evaluation did not come from MultiPV=1: %#v", confirmation.Candidate.AfterEval)
	}
	if confirmation.Evaluation.ScoreCP == nil || *confirmation.Evaluation.ScoreCP != 900 {
		t.Fatalf("root uniqueness evaluation was not preserved separately: %#v", confirmation.Evaluation)
	}
	if diagnostic.ReasonCode != ReasonAlreadyDecisive {
		t.Fatalf("expected root MultiPV rejection after issue confirmation, got %#v", diagnostic)
	}

	// Reconfirming the same candidate should be served entirely by the
	// processor cache rather than submitting duplicate engine work.
	secondDiagnostic := PipelineDiagnostic{}
	_ = processor.confirmCandidate(context.Background(), candidate, &secondDiagnostic)
	for _, key := range []string{rootKey, beforeKey, afterKey} {
		if calls := evaluator.callCount(key); calls != 1 {
			t.Fatalf("evaluation %s submitted %d times, want one cached submission", key, calls)
		}
	}
}

func TestConfirmationRejectsKnownShallowSinglePVResult(t *testing.T) {
	config := DefaultPipelineConfig()
	config.Diagnostics.LogRejections = false
	candidate := confirmationCandidate(t)
	rootKey := confirmationEvaluationKey(
		candidate.StartFEN,
		config.RootVerificationDepth,
		config.ConfirmationMultiPV,
	)
	beforeKey := confirmationEvaluationKey(candidate.StartFEN, config.ConfirmationDepth, 1)
	afterKey := confirmationEvaluationKey(candidate.Snapshot.AfterFEN, config.ConfirmationDepth, 1)
	evaluator := &confirmationTrackingEvaluator{
		results: map[string]stockfish.EvalResult{
			rootKey: {
				BestMove: "d2d4",
				Depth:    config.ConfirmationDepth,
				ScoreCP:  intPtr(300),
				PV:       []string{"d2d4"},
				Lines: []stockfish.EvalLine{
					{MultiPV: 1, Depth: config.ConfirmationDepth, ScoreCP: intPtr(300), PV: []string{"d2d4"}},
					{MultiPV: 2, Depth: config.ConfirmationDepth, ScoreCP: intPtr(0), PV: []string{"e2e4"}},
				},
			},
			beforeKey: {
				BestMove: "d2d4",
				Depth:    config.MinimumConfirmationDepth - 1,
				ScoreCP:  intPtr(300),
				PV:       []string{"d2d4"},
				Lines: []stockfish.EvalLine{
					{MultiPV: 1, Depth: config.MinimumConfirmationDepth - 1, ScoreCP: intPtr(300), PV: []string{"d2d4"}},
				},
			},
		},
		calls: make(map[string]int),
	}

	diagnostic := PipelineDiagnostic{}
	confirmation := newProcessor(evaluator, config).confirmCandidate(
		context.Background(),
		candidate,
		&diagnostic,
	)
	if confirmation.IssueConfirmed || confirmation.Accepted {
		t.Fatalf("a shallow confirmation must not be accepted: %#v", confirmation)
	}
	if diagnostic.ReasonCode != ReasonInsufficientDepth || !strings.Contains(diagnostic.Explanation, "before-position") {
		t.Fatalf("expected a shallow before-position diagnostic, got %#v", diagnostic)
	}
	if calls := evaluator.callCount(afterKey); calls != 0 {
		t.Fatalf("after-position evaluation ran %d times after an earlier shallow result", calls)
	}
	if calls := evaluator.callCount(rootKey); calls != 0 {
		t.Fatalf("expensive MultiPV search ran %d time(s) before single-PV confirmation passed", calls)
	}
}
