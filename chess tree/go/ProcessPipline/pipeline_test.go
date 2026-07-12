package Processpipline

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	types "chess/Types"

	lib "github.com/RajanDhamala/chess/v2"
	stockfish "github.com/RajanDhamala/go-stockfish"
)

type fakeEvaluator struct {
	results map[string]stockfish.EvalResult
	errors  map[string]error
}

type concurrencyEvaluator struct {
	active int32
	max    int32
	calls  int32
}

type flakyEvaluator struct {
	calls int32
}

func (f *flakyEvaluator) Evaluate(
	_ context.Context,
	_ stockfish.EvalRequest,
) (stockfish.EvalResult, error) {
	if atomic.AddInt32(&f.calls, 1) == 1 {
		return stockfish.EvalResult{}, errors.New("temporary engine failure")
	}
	return stockfish.EvalResult{
		ScoreCP: intPtr(42),
		PV:      []string{"e2e4"},
	}, nil
}

func (f *concurrencyEvaluator) Evaluate(
	_ context.Context,
	_ stockfish.EvalRequest,
) (stockfish.EvalResult, error) {
	atomic.AddInt32(&f.calls, 1)
	active := atomic.AddInt32(&f.active, 1)
	for {
		currentMax := atomic.LoadInt32(&f.max)
		if active <= currentMax || atomic.CompareAndSwapInt32(&f.max, currentMax, active) {
			break
		}
	}
	time.Sleep(20 * time.Millisecond)
	atomic.AddInt32(&f.active, -1)
	return stockfish.EvalResult{}, nil
}

func (f fakeEvaluator) Evaluate(
	_ context.Context,
	request stockfish.EvalRequest,
) (stockfish.EvalResult, error) {
	key := fakeEvaluationKey(request.FEN, request.Depth, request.MultiPV)
	if err := f.errors[key]; err != nil {
		return stockfish.EvalResult{}, err
	}
	result, ok := f.results[key]
	if !ok {
		return stockfish.EvalResult{}, fmt.Errorf("missing fake evaluation for %s", key)
	}
	return result, nil
}

func fakeEvaluationKey(fen string, depth int, multiPV int) string {
	return fmt.Sprintf("%s|%d|%d", fen, depth, multiPV)
}

func intPtr(value int) *int {
	return &value
}

func TestNormalizePipelineConfigSeparatesGameAndScoutConcurrency(t *testing.T) {
	config := normalizePipelineConfig(PipelineConfig{GameConcurrency: 20})
	if config.GameConcurrency != config.PositionConcurrency {
		t.Fatalf(
			"expected in-flight games to use available position capacity, got games=%d positions=%d",
			config.GameConcurrency,
			config.PositionConcurrency,
		)
	}
	if config.ScoutGameConcurrency != 2 {
		t.Fatalf("expected scout game concurrency to be capped at 2, got %d", config.ScoutGameConcurrency)
	}
	if config.PositionConcurrency < 2 {
		t.Fatalf("expected independent multi-position concurrency, got %d", config.PositionConcurrency)
	}
}

func TestDefaultPipelineConcurrencyMatchesStockfishPoolOverride(t *testing.T) {
	t.Setenv("STOCKFISH_POOL_SIZE", "3")
	config := DefaultPipelineConfig()
	if config.PositionConcurrency != 3 || config.GameConcurrency != 3 {
		t.Fatalf(
			"pipeline concurrency = games:%d positions:%d, want 3/3",
			config.GameConcurrency,
			config.PositionConcurrency,
		)
	}
}

func TestNormalizePipelineConfigDoesNotExceedConfiguredPositionCapacity(t *testing.T) {
	config := normalizePipelineConfig(PipelineConfig{
		GameConcurrency:      20,
		PositionConcurrency:  4,
		ScoutGameConcurrency: 20,
	})
	if config.GameConcurrency != 4 {
		t.Fatalf("expected four in-flight games, got %d", config.GameConcurrency)
	}
	if config.ScoutGameConcurrency != 2 {
		t.Fatalf("expected two games scouting concurrently, got %d", config.ScoutGameConcurrency)
	}
}

func TestProcessorsShareStockfishClientAdmissionLimit(t *testing.T) {
	client := &stockfish.Client{}
	config := DefaultPipelineConfig()
	config.PositionConcurrency = 3

	first := NewProcessor(client, config)
	second := NewProcessor(client, config)
	if first.sharedEvalSlots == nil || second.sharedEvalSlots == nil {
		t.Fatal("expected Stockfish-backed processors to have a shared admission limit")
	}
	if first.sharedEvalSlots != second.sharedEvalSlots {
		t.Fatal("processors using the same Stockfish client received different admission limits")
	}
	if capacity := cap(first.sharedEvalSlots); capacity != config.PositionConcurrency {
		t.Fatalf("shared admission capacity = %d, want %d", capacity, config.PositionConcurrency)
	}
}

func TestSharedAdmissionLimitBoundsMultipleProcessors(t *testing.T) {
	evaluator := &concurrencyEvaluator{}
	config := DefaultPipelineConfig()
	config.PositionConcurrency = 4
	sharedSlots := make(chan struct{}, 2)
	processors := []*Processor{
		newProcessorWithSharedSlots(evaluator, config, sharedSlots),
		newProcessorWithSharedSlots(evaluator, config, sharedSlots),
	}

	var wait sync.WaitGroup
	for index := range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			processor := processors[index%len(processors)]
			if _, err := processor.evaluate(
				context.Background(),
				fmt.Sprintf("shared-limit-%d", index),
				1,
				1,
				time.Second,
			); err != nil {
				t.Errorf("evaluate: %v", err)
			}
		}()
	}
	wait.Wait()

	if maximum := atomic.LoadInt32(&evaluator.max); maximum != int32(cap(sharedSlots)) {
		t.Fatalf("maximum shared concurrency = %d, want %d", maximum, cap(sharedSlots))
	}
	if occupied := len(sharedSlots); occupied != 0 {
		t.Fatalf("shared admission limit leaked %d slot(s)", occupied)
	}
}

func TestScoutGameSlotsAdmitWaitingGamesAfterRelease(t *testing.T) {
	config := DefaultPipelineConfig()
	config.GameConcurrency = 4
	config.PositionConcurrency = 4
	config.ScoutGameConcurrency = 2
	processor := newProcessor(&concurrencyEvaluator{}, config)

	var active int32
	var maximum int32
	var completed int32
	var wait sync.WaitGroup
	for range 4 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			if err := processor.acquireScoutSlot(context.Background()); err != nil {
				t.Errorf("acquire scout slot: %v", err)
				return
			}
			current := atomic.AddInt32(&active, 1)
			for {
				observed := atomic.LoadInt32(&maximum)
				if current <= observed || atomic.CompareAndSwapInt32(&maximum, observed, current) {
					break
				}
			}
			time.Sleep(20 * time.Millisecond)
			atomic.AddInt32(&active, -1)
			processor.releaseScoutSlot()
			atomic.AddInt32(&completed, 1)
		}()
	}
	wait.Wait()

	if maximum != 2 {
		t.Fatalf("expected exactly two games scouting concurrently, observed %d", maximum)
	}
	if completed != 4 {
		t.Fatalf("expected waiting games to be admitted, completed %d", completed)
	}
}

func TestScoutPrefetchUsesMoreThanTwoStockfishSlots(t *testing.T) {
	evaluator := &concurrencyEvaluator{}
	config := DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	config.PositionConcurrency = 4
	processor := newProcessor(evaluator, config)

	snapshots := make([]moveSnapshot, 4)
	for index := range snapshots {
		snapshots[index] = moveSnapshot{
			MoveIndex: index + 1,
			FEN:       fmt.Sprintf("before-%d", index),
			AfterFEN:  fmt.Sprintf("after-%d", index),
		}
	}

	processor.prefetchScoutEvaluations(context.Background(), snapshots)
	if maximum := atomic.LoadInt32(&evaluator.max); maximum <= 2 {
		t.Fatalf("expected more than two concurrent Stockfish jobs, observed %d", maximum)
	}
}

func TestUniqueScoutFENsCoalescesAdjacentPositions(t *testing.T) {
	config := DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	snapshots := []moveSnapshot{
		{MoveIndex: 1, FEN: "start", AfterFEN: "after-one"},
		{MoveIndex: 2, FEN: "after-one", AfterFEN: "after-two"},
		{MoveIndex: 3, FEN: "after-two", AfterFEN: "after-three", IsBookMove: true},
	}

	fens := uniqueScoutFENs(snapshots, config)
	want := []string{"start", "after-one", "after-two"}
	if len(fens) != len(want) {
		t.Fatalf("unique scout FENs = %v, want %v", fens, want)
	}
	for index := range want {
		if fens[index] != want[index] {
			t.Fatalf("unique scout FENs = %v, want %v", fens, want)
		}
	}
}

func TestConfirmCandidatesUseMultipleEvaluationSlots(t *testing.T) {
	evaluator := &concurrencyEvaluator{}
	config := DefaultPipelineConfig()
	config.PositionConcurrency = 4
	processor := newProcessor(evaluator, config)

	tasks := make([]candidateConfirmationTask, 4)
	for index := range tasks {
		tasks[index] = candidateConfirmationTask{
			Candidate: puzzleCandidate{
				StartFEN: fmt.Sprintf(
					"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 %d",
					index+1,
				),
				SolverIsWhite: true,
			},
			Diagnostic: PipelineDiagnostic{
				GameID:    "confirm-concurrency",
				MoveIndex: index + 1,
			},
		}
	}

	outputs := processor.confirmCandidates(context.Background(), tasks)
	if maximum := atomic.LoadInt32(&evaluator.max); maximum <= 1 {
		t.Fatalf("expected concurrent confirmation evaluations, observed %d", maximum)
	}
	for _, output := range outputs {
		if output.Diagnostic.ReasonCode != ReasonNoEngineLine {
			t.Fatalf("expected no-line rejection after fake eval, got %#v", output.Diagnostic)
		}
	}
}

func TestEvaluationCacheDoesNotRetainErrors(t *testing.T) {
	evaluator := &flakyEvaluator{}
	config := DefaultPipelineConfig()
	config.PositionConcurrency = 1
	processor := newProcessor(evaluator, config)

	_, err := processor.evaluate(context.Background(), "cache-test", 1, 1, 0)
	if err == nil {
		t.Fatal("expected first evaluation to fail")
	}
	result, err := processor.evaluate(context.Background(), "cache-test", 1, 1, 0)
	if err != nil {
		t.Fatalf("expected failed cache entry to be retried, got %v", err)
	}
	if result.ScoreCP == nil || *result.ScoreCP != 42 {
		t.Fatalf("unexpected retry result: %#v", result)
	}
	if calls := atomic.LoadInt32(&evaluator.calls); calls != 2 {
		t.Fatalf("expected two evaluator calls, got %d", calls)
	}
}

func TestEvaluationMetricsDistinguishCacheHitsFromEngineSearches(t *testing.T) {
	evaluator := &concurrencyEvaluator{}
	processor := newProcessor(evaluator, DefaultPipelineConfig())
	metrics := &evaluationMetrics{}
	ctx := context.WithValue(context.Background(), evaluationMetricsContextKey{}, metrics)

	for range 2 {
		if _, err := processor.evaluate(ctx, "metrics-fen", 1, 1, time.Second); err != nil {
			t.Fatalf("evaluate: %v", err)
		}
	}
	if requests := metrics.Requests.Load(); requests != 2 {
		t.Fatalf("evaluation requests = %d, want 2", requests)
	}
	if hits := metrics.CacheHits.Load(); hits != 1 {
		t.Fatalf("evaluation cache hits = %d, want 1", hits)
	}
	if searches := metrics.EngineEvaluations.Load(); searches != 1 {
		t.Fatalf("engine searches = %d, want 1", searches)
	}
	if engineTime := metrics.EngineTimeNS.Load(); engineTime <= 0 {
		t.Fatalf("engine time = %d, want a positive duration", engineTime)
	}
}

func TestConfirmationRejectsNoChoiceBeforeEngineSearch(t *testing.T) {
	evaluator := &concurrencyEvaluator{}
	config := DefaultPipelineConfig()
	processor := newProcessor(evaluator, config)
	candidate := puzzleCandidate{
		StartFEN:      "7k/5Q2/7K/8/8/8/8/8 b - - 0 1",
		SolverIsWhite: false,
	}
	diagnostic := PipelineDiagnostic{}

	confirmation := processor.confirmCandidate(context.Background(), candidate, &diagnostic)
	if confirmation.Accepted || confirmation.IssueConfirmed {
		t.Fatalf("unexpected confirmation: %#v", confirmation)
	}
	if diagnostic.ReasonCode != ReasonOnlyLegalMove {
		t.Fatalf("reason = %s, want %s", diagnostic.ReasonCode, ReasonOnlyLegalMove)
	}
	if calls := atomic.LoadInt32(&evaluator.calls); calls != 0 {
		t.Fatalf("engine was called %d time(s) for a position with no solver choice", calls)
	}
}

func TestInvalidSANProducesTerminalDiagnostic(t *testing.T) {
	config := DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	config.Diagnostics.LogRejections = false
	processor := newProcessor(fakeEvaluator{}, config)

	result := processor.AnalyzeGame(context.Background(), types.EvalGameInput{
		GameID:  "invalid-san",
		Moves:   []types.Move{{San: "definitely-not-san"}},
		IsWhite: true,
	})

	if result.Error == "" {
		t.Fatal("expected snapshot error")
	}
	if len(result.Diagnostics) != 1 {
		t.Fatalf("expected one diagnostic, got %d", len(result.Diagnostics))
	}
	diagnostic := result.Diagnostics[0]
	if diagnostic.Decision != DiagnosticError || diagnostic.ReasonCode != ReasonInvalidSAN {
		t.Fatalf("unexpected diagnostic: %#v", diagnostic)
	}
}

func TestEvaluationFailureMarksGameResultIncomplete(t *testing.T) {
	snapshots, err := prepareSnapshots([]types.Move{{San: "f3"}}, true)
	if err != nil {
		t.Fatalf("prepare snapshot: %v", err)
	}
	snapshot := snapshots[0]
	snapshot.IsBookMove = false

	config := DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	config.Diagnostics.LogRejections = false
	evaluationErr := errors.New("stockfish worker unavailable")
	fake := fakeEvaluator{
		results: map[string]stockfish.EvalResult{},
		errors: map[string]error{
			fakeEvaluationKey(snapshot.FEN, config.ScoutDepth, 1): evaluationErr,
		},
	}

	result := newProcessor(fake, config).analyzePrepared(
		context.Background(),
		types.EvalGameInput{GameID: "engine-error", IsWhite: true},
		[]moveSnapshot{snapshot},
		nil,
	)

	if result.Stats.EvaluationErrors != 1 {
		t.Fatalf("expected one evaluation error, got %#v", result.Stats)
	}
	if result.Error == "" {
		t.Fatal("expected an incomplete game result to carry an error")
	}
	if !strings.Contains(result.Error, "engine_unavailable=1") ||
		!strings.Contains(result.Error, evaluationErr.Error()) {
		t.Fatalf("expected concrete engine failure in result error, got %q", result.Error)
	}
	streamResult := buildEvalGameResult(types.EvalGameInput{GameID: result.GameID}, result)
	if streamResult.ProcessingError == "" || streamResult.EvaluationErrors != 1 {
		t.Fatalf("expected stream result to preserve pipeline failure state, got %#v", streamResult)
	}
}

func TestEvaluationTimeoutPreservesConcreteFailureReason(t *testing.T) {
	message := evaluationFailureSummary(
		2,
		map[string]int{ReasonEngineTimeout: 2},
		context.DeadlineExceeded.Error(),
	)
	if !strings.Contains(message, "engine_timeout=2") ||
		!strings.Contains(message, context.DeadlineExceeded.Error()) {
		t.Fatalf("expected timeout count and cause in summary, got %q", message)
	}
}

func TestAnalyzeGameSkipsEmbeddedBookMovesWithoutEvaluation(t *testing.T) {
	evaluator := &concurrencyEvaluator{}
	config := DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	config.Diagnostics.LogRejections = false
	processor := newProcessor(evaluator, config)

	result := processor.AnalyzeGame(context.Background(), types.EvalGameInput{
		GameID: "known-ruy-lopez",
		Moves: []types.Move{
			{San: "e4"},
			{San: "e5"},
			{San: "Nf3"},
			{San: "Nc6"},
			{San: "Bb5"},
		},
		IsWhite: true,
	})

	if result.Error != "" {
		t.Fatalf("book-only game returned an error: %s", result.Error)
	}
	if calls := atomic.LoadInt32(&evaluator.calls); calls != 0 {
		t.Fatalf("book-only game submitted %d engine evaluations, want zero", calls)
	}
	if result.Stats.Scouted != 0 {
		t.Fatalf("book-only game scouted %d moves, want zero", result.Stats.Scouted)
	}
	if len(result.Diagnostics) != 5 {
		t.Fatalf("book-only game produced %d diagnostics, want five", len(result.Diagnostics))
	}
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.ReasonCode != ReasonBookMove {
			t.Fatalf("ply %d reason = %q, want %q", diagnostic.MoveIndex, diagnostic.ReasonCode, ReasonBookMove)
		}
	}
}

func TestPrepareSnapshotsStopsBookClassificationAfterDeviation(t *testing.T) {
	snapshots, err := prepareSnapshots([]types.Move{
		{San: "e4"},
		{San: "e5"},
		{San: "Nf3"},
		{San: "Nc6"},
		{San: "Bb5"},
		{San: "Qh4"},
		{San: "Nxh4"},
	}, true)
	if err != nil {
		t.Fatalf("prepare opening deviation: %v", err)
	}
	for index := 0; index < 5; index++ {
		if !snapshots[index].IsBookMove {
			t.Fatalf("expected ply %d to remain in the Ruy Lopez book", index+1)
		}
	}
	for index := 5; index < len(snapshots); index++ {
		if snapshots[index].IsBookMove {
			t.Fatalf("expected ply %d to remain off-book after Qh4", index+1)
		}
	}
}

func TestRepeatedPuzzleStartIsRejectedWithoutEvaluation(t *testing.T) {
	snapshots, err := prepareSnapshots([]types.Move{
		{San: "Nf3"},
		{San: "Nf6"},
		{San: "Ng1"},
		{San: "Ng8"},
		{San: "Nf3"},
	}, true)
	if err != nil {
		t.Fatalf("prepare repeated line: %v", err)
	}
	if snapshots[0].IsRepeatedPosition || snapshots[1].IsRepeatedPosition || snapshots[2].IsRepeatedPosition {
		t.Fatalf("positions were marked repeated before the cycle completed: %#v", snapshots)
	}
	if !snapshots[3].IsRepeatedPosition || !snapshots[4].IsRepeatedPosition {
		t.Fatalf("expected repeated candidate positions after Ng8: %#v", snapshots)
	}

	snapshot := snapshots[3]
	snapshot.IsBookMove = false
	evaluator := &concurrencyEvaluator{}
	config := DefaultPipelineConfig()
	config.Diagnostics.LogRejections = false
	result := newProcessor(evaluator, config).analyzePrepared(
		context.Background(),
		types.EvalGameInput{GameID: "repeated-position", IsWhite: true},
		[]moveSnapshot{snapshot},
		nil,
	)
	if calls := atomic.LoadInt32(&evaluator.calls); calls != 0 {
		t.Fatalf("repeated position submitted %d engine evaluations, want zero", calls)
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].ReasonCode != ReasonRepetition {
		t.Fatalf("expected repetition rejection, got %#v", result.Diagnostics)
	}
}

func TestPrepareSnapshotsKeepsAnalyzedUserColor(t *testing.T) {
	moves := []types.Move{{San: "e4"}, {San: "e5"}}

	whiteSnapshots, err := prepareSnapshots(moves, true)
	if err != nil {
		t.Fatalf("prepare white snapshots: %v", err)
	}
	if len(whiteSnapshots) != 2 {
		t.Fatalf("expected two white snapshots, got %d", len(whiteSnapshots))
	}
	if whiteSnapshots[0].PlayerColor != "white" || whiteSnapshots[1].PlayerColor != "white" {
		t.Fatalf("expected every white-user snapshot to retain white player color: %#v", whiteSnapshots)
	}
	if !whiteSnapshots[0].IsUserMove || whiteSnapshots[1].IsUserMove {
		t.Fatalf("unexpected white-user move ownership: %#v", whiteSnapshots)
	}

	blackSnapshots, err := prepareSnapshots(moves, false)
	if err != nil {
		t.Fatalf("prepare black snapshots: %v", err)
	}
	if len(blackSnapshots) != 2 {
		t.Fatalf("expected two black snapshots, got %d", len(blackSnapshots))
	}
	if blackSnapshots[0].PlayerColor != "black" || blackSnapshots[1].PlayerColor != "black" {
		t.Fatalf("expected every black-user snapshot to retain black player color: %#v", blackSnapshots)
	}
	if blackSnapshots[0].IsUserMove || !blackSnapshots[1].IsUserMove {
		t.Fatalf("unexpected black-user move ownership: %#v", blackSnapshots)
	}
}

func TestCandidateRejectionReturnsNoUniqueBestMoveReason(t *testing.T) {
	snapshots, err := prepareSnapshots([]types.Move{{San: "f3"}}, true)
	if err != nil {
		t.Fatalf("prepare snapshot: %v", err)
	}
	snapshot := snapshots[0]
	snapshot.IsBookMove = false

	config := DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	config.Diagnostics.LogRejections = false
	fake := fakeEvaluator{results: map[string]stockfish.EvalResult{
		fakeEvaluationKey(snapshot.FEN, config.ScoutDepth, 1): {
			BestMove: "d2d4",
			ScoreCP:  intPtr(0),
			PV:       []string{"d2d4"},
		},
		fakeEvaluationKey(snapshot.AfterFEN, config.ScoutDepth, 1): {
			BestMove: "e7e5",
			ScoreCP:  intPtr(300),
			PV:       []string{"e7e5"},
		},
		fakeEvaluationKey(snapshot.FEN, config.RootVerificationDepth, config.ConfirmationMultiPV): {
			BestMove: "d2d4",
			ScoreCP:  intPtr(200),
			PV:       []string{"d2d4"},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, ScoreCP: intPtr(200), PV: []string{"d2d4"}},
				{MultiPV: 2, ScoreCP: intPtr(150), PV: []string{"e2e4"}},
				{MultiPV: 3, ScoreCP: intPtr(120), PV: []string{"g1f3"}},
			},
		},
		fakeEvaluationKey(snapshot.FEN, config.ConfirmationDepth, 1): {
			BestMove: "d2d4",
			ScoreCP:  intPtr(200),
			PV:       []string{"d2d4"},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, ScoreCP: intPtr(200), PV: []string{"d2d4"}},
			},
		},
		fakeEvaluationKey(snapshot.AfterFEN, config.ConfirmationDepth, 1): {
			BestMove: "e7e5",
			ScoreCP:  intPtr(200),
			PV:       []string{"e7e5"},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, ScoreCP: intPtr(200), PV: []string{"e7e5"}},
			},
		},
	}}
	processor := newProcessor(fake, config)

	result := processor.analyzePrepared(
		context.Background(),
		types.EvalGameInput{GameID: "no-unique", IsWhite: true},
		[]moveSnapshot{snapshot},
		nil,
	)

	if len(result.Puzzles) != 0 {
		t.Fatalf("expected no puzzles, got %d", len(result.Puzzles))
	}
	if len(result.Issues) != 1 {
		t.Fatalf("expected the move issue to survive puzzle rejection, got %d", len(result.Issues))
	}
	if result.Issues[0].CPDelta != 400 {
		t.Fatalf("expected the issue to use the confirmed 400cp loss, got %#v", result.Issues[0])
	}
	if result.Issues[0].AfterScoreCP == nil || *result.Issues[0].AfterScoreCP != -200 {
		t.Fatalf("expected the confirmed after score, got %#v", result.Issues[0])
	}
	if len(result.Diagnostics) != 1 {
		t.Fatalf("expected one terminal diagnostic, got %d", len(result.Diagnostics))
	}
	if result.Diagnostics[0].ReasonCode != ReasonNoUniqueBestMove {
		t.Fatalf("expected %s, got %#v", ReasonNoUniqueBestMove, result.Diagnostics[0])
	}
}

func TestConfirmationRejectsScoutSwingThatDisappearsAtDepth(t *testing.T) {
	snapshots, err := prepareSnapshots([]types.Move{{San: "f3"}}, true)
	if err != nil {
		t.Fatalf("prepare snapshot: %v", err)
	}
	snapshot := snapshots[0]
	snapshot.IsBookMove = false

	config := DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	config.Diagnostics.LogRejections = false
	fake := fakeEvaluator{results: map[string]stockfish.EvalResult{
		fakeEvaluationKey(snapshot.FEN, config.ScoutDepth, 1): {
			BestMove: "d2d4",
			ScoreCP:  intPtr(0),
			PV:       []string{"d2d4"},
		},
		fakeEvaluationKey(snapshot.AfterFEN, config.ScoutDepth, 1): {
			BestMove: "e7e5",
			ScoreCP:  intPtr(300),
			PV:       []string{"e7e5"},
		},
		fakeEvaluationKey(snapshot.FEN, config.RootVerificationDepth, config.ConfirmationMultiPV): {
			BestMove: "d2d4",
			ScoreCP:  intPtr(20),
			PV:       []string{"d2d4"},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, ScoreCP: intPtr(20), PV: []string{"d2d4"}},
				{MultiPV: 2, ScoreCP: intPtr(0), PV: []string{"e2e4"}},
			},
		},
		fakeEvaluationKey(snapshot.FEN, config.ConfirmationDepth, 1): {
			BestMove: "d2d4",
			ScoreCP:  intPtr(20),
			PV:       []string{"d2d4"},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, ScoreCP: intPtr(20), PV: []string{"d2d4"}},
			},
		},
		fakeEvaluationKey(snapshot.AfterFEN, config.ConfirmationDepth, 1): {
			BestMove: "e7e5",
			ScoreCP:  intPtr(-20),
			PV:       []string{"e7e5"},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, ScoreCP: intPtr(-20), PV: []string{"e7e5"}},
			},
		},
	}}

	result := newProcessor(fake, config).analyzePrepared(
		context.Background(),
		types.EvalGameInput{GameID: "false-scout-swing", IsWhite: true},
		[]moveSnapshot{snapshot},
		nil,
	)

	if len(result.Issues) != 0 || len(result.Puzzles) != 0 {
		t.Fatalf("expected the unconfirmed scout swing to produce no output, got %#v", result)
	}
	if result.Stats.Candidates != 1 || result.Stats.Confirmed != 0 {
		t.Fatalf("unexpected confirmation stats: %#v", result.Stats)
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].ReasonCode != ReasonInsufficientSwing {
		t.Fatalf("expected confirmation swing rejection, got %#v", result.Diagnostics)
	}
	if result.Diagnostics[0].SwingCP != 0 {
		t.Fatalf("expected diagnostic to report the confirmed swing, got %#v", result.Diagnostics[0])
	}
}

func TestConfirmationRejectsMoveThatBecomesBestAtDepth(t *testing.T) {
	snapshots, err := prepareSnapshots([]types.Move{{San: "f3"}}, true)
	if err != nil {
		t.Fatalf("prepare snapshot: %v", err)
	}
	snapshot := snapshots[0]
	snapshot.IsBookMove = false

	config := DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	config.Diagnostics.LogRejections = false
	fake := fakeEvaluator{results: map[string]stockfish.EvalResult{
		fakeEvaluationKey(snapshot.FEN, config.ScoutDepth, 1): {
			BestMove: "d2d4",
			ScoreCP:  intPtr(0),
			PV:       []string{"d2d4"},
		},
		fakeEvaluationKey(snapshot.AfterFEN, config.ScoutDepth, 1): {
			BestMove: "e7e5",
			ScoreCP:  intPtr(300),
			PV:       []string{"e7e5"},
		},
		fakeEvaluationKey(snapshot.FEN, config.RootVerificationDepth, config.ConfirmationMultiPV): {
			BestMove: snapshot.MoveUCI,
			ScoreCP:  intPtr(200),
			PV:       []string{snapshot.MoveUCI},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, ScoreCP: intPtr(200), PV: []string{snapshot.MoveUCI}},
				{MultiPV: 2, ScoreCP: intPtr(0), PV: []string{"d2d4"}},
			},
		},
		fakeEvaluationKey(snapshot.FEN, config.ConfirmationDepth, 1): {
			BestMove: snapshot.MoveUCI,
			ScoreCP:  intPtr(200),
			PV:       []string{snapshot.MoveUCI},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, ScoreCP: intPtr(200), PV: []string{snapshot.MoveUCI}},
			},
		},
		fakeEvaluationKey(snapshot.AfterFEN, config.ConfirmationDepth, 1): {
			BestMove: "e7e5",
			ScoreCP:  intPtr(300),
			PV:       []string{"e7e5"},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, ScoreCP: intPtr(300), PV: []string{"e7e5"}},
			},
		},
	}}

	result := newProcessor(fake, config).analyzePrepared(
		context.Background(),
		types.EvalGameInput{GameID: "deep-best-move", IsWhite: true},
		[]moveSnapshot{snapshot},
		nil,
	)

	if len(result.Issues) != 0 || len(result.Puzzles) != 0 {
		t.Fatalf("expected a confirmed best move to produce no output, got %#v", result)
	}
	if len(result.Diagnostics) != 1 || result.Diagnostics[0].ReasonCode != ReasonPlayedBestMove {
		t.Fatalf("expected deep best-move rejection, got %#v", result.Diagnostics)
	}
}

func TestOpponentMoveUsesOpponentBlunderCandidateType(t *testing.T) {
	diagnostic := newDiagnostic(
		types.EvalGameInput{GameID: "opponent", IsWhite: true},
		moveSnapshot{
			MoveIndex:  12,
			MoveSAN:    "Qh4",
			MoveUCI:    "d8h4",
			FEN:        "before",
			AfterFEN:   "after",
			IsUserMove: false,
		},
	)
	if diagnostic.CandidateType != PuzzleCandidateOpponentBlunder {
		t.Fatalf("unexpected candidate type: %s", diagnostic.CandidateType)
	}
	if diagnostic.FEN != "after" {
		t.Fatalf("expected puzzle to start after opponent move, got %q", diagnostic.FEN)
	}
}

func TestAnalyzePreparedMergesOpponentOpportunityIntoFollowingUserMiss(t *testing.T) {
	const startFEN = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"
	const afterFEN = "rnbqkbnr/1ppp1ppp/p7/4p3/6P1/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 3"

	config := DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	config.Diagnostics.LogRejections = false
	fake := fakeEvaluator{results: map[string]stockfish.EvalResult{
		fakeEvaluationKey(startFEN, config.ScoutDepth, 1): {
			BestMove: "d8h4",
			Mate:     intPtr(1),
			PV:       []string{"d8h4"},
		},
		fakeEvaluationKey(afterFEN, config.ScoutDepth, 1): {
			BestMove: "g1f2",
			ScoreCP:  intPtr(0),
			PV:       []string{"g1f2"},
		},
		fakeEvaluationKey(startFEN, config.RootVerificationDepth, config.ConfirmationMultiPV): {
			BestMove: "d8h4",
			Mate:     intPtr(1),
			PV:       []string{"d8h4"},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, Mate: intPtr(1), PV: []string{"d8h4"}},
				{MultiPV: 2, ScoreCP: intPtr(0), PV: []string{"a7a6"}},
				{MultiPV: 3, ScoreCP: intPtr(-20), PV: []string{"b7b6"}},
			},
		},
		fakeEvaluationKey(startFEN, config.ConfirmationDepth, 1): {
			BestMove: "d8h4",
			Mate:     intPtr(1),
			PV:       []string{"d8h4"},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, Mate: intPtr(1), PV: []string{"d8h4"}},
			},
		},
		fakeEvaluationKey(afterFEN, config.ConfirmationDepth, 1): {
			BestMove: "g1f2",
			ScoreCP:  intPtr(0),
			PV:       []string{"g1f2"},
			Lines: []stockfish.EvalLine{
				{MultiPV: 1, ScoreCP: intPtr(0), PV: []string{"g1f2"}},
			},
		},
	}}
	processor := newProcessor(fake, config)

	opponentBlunder := moveSnapshot{
		MoveIndex:  19,
		MoveSAN:    "a3",
		MoveUCI:    "a2a3",
		FEN:        afterFEN,
		AfterFEN:   startFEN,
		SideToMove: "w",
		IsUserMove: false,
	}
	userMiss := moveSnapshot{
		MoveIndex:  20,
		MoveSAN:    "a6",
		MoveUCI:    "a7a6",
		FEN:        startFEN,
		AfterFEN:   afterFEN,
		SideToMove: "b",
		IsUserMove: true,
	}

	result := processor.analyzePrepared(
		context.Background(),
		types.EvalGameInput{GameID: "duplicate", IsWhite: false},
		[]moveSnapshot{opponentBlunder, userMiss},
		nil,
	)

	if len(result.Puzzles) != 1 {
		t.Fatalf("expected one unique puzzle, got %d", len(result.Puzzles))
	}
	if len(result.Issues) != 1 {
		t.Fatalf("expected one persisted issue for the unique puzzle, got %d", len(result.Issues))
	}
	if result.Puzzles[0].CandidateType != PuzzleCandidateMissedMove {
		t.Fatalf("expected the shared puzzle to prefer missed-move provenance, got %#v", result.Puzzles[0])
	}
	if result.Issues[0].MoveIndex != userMiss.MoveIndex || result.Issues[0].MoveUCI != userMiss.MoveUCI {
		t.Fatalf("expected the persisted issue to point at the user's miss, got %#v", result.Issues[0])
	}
	duplicateDiagnostics := 0
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.ReasonCode == ReasonDuplicatePuzzle {
			duplicateDiagnostics++
		}
	}
	if duplicateDiagnostics != 1 {
		t.Fatalf("expected one duplicate diagnostic, got %d in %#v", duplicateDiagnostics, result.Diagnostics)
	}
}

func TestForcingMoveDecisionAllowsUniqueMateInOne(t *testing.T) {
	config := DefaultPipelineConfig()
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, Mate: intPtr(1), PV: []string{"g6g7"}},
		{MultiPV: 2, ScoreCP: intPtr(500), PV: []string{"g6h6"}},
	}}
	code, explanation := forcingMoveDecision(eval, true, config)
	if code != "" {
		t.Fatalf("expected unique mate-in-one to qualify, got %s: %s", code, explanation)
	}
}

func TestMeaningfulSwingRejectsAlreadyExistingMate(t *testing.T) {
	config := DefaultPipelineConfig()
	before := types.EvalResult{Mate: intPtr(-5)}
	after := types.EvalResult{Mate: intPtr(-2)}
	if isMeaningfulSwing(before, after, true, 300, 0, config) {
		t.Fatal("expected an already-forced mate becoming shorter to be rejected")
	}
}

func TestMeaningfulSwingExplainsAlreadyExistingMate(t *testing.T) {
	config := DefaultPipelineConfig()
	before := types.EvalResult{Mate: intPtr(-5)}
	after := types.EvalResult{Mate: intPtr(-2)}
	meaningful, explanation := meaningfulSwingDecision(before, after, true, 300, 0, config)
	if meaningful {
		t.Fatal("expected an already-forced mate becoming shorter to be rejected")
	}
	if !strings.Contains(explanation, "already contained a forced mate") {
		t.Fatalf("expected mate-policy explanation, got %q", explanation)
	}
}

func TestMeaningfulSwingAcceptsNewForcedMate(t *testing.T) {
	config := DefaultPipelineConfig()
	before := types.EvalResult{ScoreCP: intPtr(-20)}
	after := types.EvalResult{Mate: intPtr(-3)}
	if !isMeaningfulSwing(before, after, true, 0, 0, config) {
		t.Fatal("expected a new forced mate transition to qualify")
	}
}

func TestForcingMoveDecisionAllowsSlowerAlternativeMate(t *testing.T) {
	config := DefaultPipelineConfig()
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, Mate: intPtr(2), PV: []string{"g6g7"}},
		{MultiPV: 2, ScoreCP: intPtr(100), PV: []string{"g6h6"}},
		{MultiPV: 3, Mate: intPtr(4), PV: []string{"g6f6"}},
	}}
	code, explanation := forcingMoveDecision(eval, true, config)
	if code != "" {
		t.Fatalf("expected the unique shortest mate to qualify, got %s: %s", code, explanation)
	}
}

func TestForcingMoveDecisionRejectsMultipleShortestMates(t *testing.T) {
	config := DefaultPipelineConfig()
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, Mate: intPtr(2), PV: []string{"g6g7"}},
		{MultiPV: 2, Mate: intPtr(2), PV: []string{"g6h6"}},
		{MultiPV: 3, Mate: intPtr(4), PV: []string{"g6f6"}},
	}}
	code, _ := forcingMoveDecision(eval, true, config)
	if code != ReasonMultipleMatingMoves {
		t.Fatalf("expected %s, got %s", ReasonMultipleMatingMoves, code)
	}
}

func TestForcingMoveDecisionRejectsTopLineWhenShorterMateExists(t *testing.T) {
	config := DefaultPipelineConfig()
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, Mate: intPtr(3), PV: []string{"g6g7"}},
		{MultiPV: 2, Mate: intPtr(2), PV: []string{"g6h6"}},
	}}
	code, _ := forcingMoveDecision(eval, true, config)
	if code != ReasonShorterMateAvailable {
		t.Fatalf("expected %s, got %s", ReasonShorterMateAvailable, code)
	}
}

func TestContinuationAllowsUniqueMateInOne(t *testing.T) {
	config := DefaultPipelineConfig()
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, Mate: intPtr(1), PV: []string{"g6g7"}},
		{MultiPV: 2, ScoreCP: intPtr(500), PV: []string{"g6h6"}},
	}}
	code, explanation := continuationMoveDecision(eval, true, config)
	if code != "" {
		t.Fatalf("expected final unique mate-in-one to continue, got %s: %s", code, explanation)
	}
}

func TestContinuationRejectsMultipleEquivalentMatingFinishes(t *testing.T) {
	config := DefaultPipelineConfig()
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, Mate: intPtr(1), PV: []string{"g6g7"}},
		{MultiPV: 2, Mate: intPtr(1), PV: []string{"g6h6"}},
		{MultiPV: 3, Mate: intPtr(1), PV: []string{"g6f6"}},
	}}
	code, explanation := continuationMoveDecision(eval, true, config)
	if code != ReasonMultipleMatingMoves {
		t.Fatalf("expected %s, got %s: %s", ReasonMultipleMatingMoves, code, explanation)
	}
}

func TestContinuationRejectsAlternativeThatCrossesComfortableWinBoundary(t *testing.T) {
	config := DefaultPipelineConfig()
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, Depth: config.ConfirmationDepth, ScoreCP: intPtr(461), PV: []string{"c7a8"}},
		{MultiPV: 2, Depth: config.ConfirmationDepth, ScoreCP: intPtr(233), PV: []string{"c2c4"}},
	}}

	code, explanation := continuationMoveDecision(eval, true, config)
	if code != ReasonAlternativeStillWinning {
		t.Fatalf("expected %s at the calibrated boundary, got %s: %s", ReasonAlternativeStillWinning, code, explanation)
	}
}

func TestComfortableConversionDoesNotRejectMate(t *testing.T) {
	topMate := 1
	secondMate := 1
	code, explanation := rejectComfortableConversion(PipelineDiagnostic{
		TopMate:         &topMate,
		SecondMate:      &secondMate,
		TopWinChance:    100,
		SecondWinChance: 100,
	}, DefaultPipelineConfig())
	if code != "" {
		t.Fatalf("expected mate handling to reach the mate-specific uniqueness rule, got %s: %s", code, explanation)
	}
}

func TestForcingMoveDecisionRejectsSmallGap(t *testing.T) {
	config := DefaultPipelineConfig()
	eval := types.EvalResult{Lines: []types.EvalLine{
		{MultiPV: 1, ScoreCP: intPtr(200), PV: []string{"d2d4"}},
		{MultiPV: 2, ScoreCP: intPtr(180), PV: []string{"e2e4"}},
	}}
	code, _ := forcingMoveDecision(eval, true, config)
	if code != ReasonNoUniqueBestMove {
		t.Fatalf("expected %s, got %s", ReasonNoUniqueBestMove, code)
	}
}

func TestOpponentPuzzleIssueCarriesSolutionForPersistence(t *testing.T) {
	candidate := puzzleCandidate{
		Snapshot: moveSnapshot{
			MoveIndex:   20,
			MoveSAN:     "Qh4",
			MoveUCI:     "d8h4",
			PlayerColor: "black",
		},
		SolverIsWhite: true,
		SwingCP:       350,
		WinSwing:      25,
		BeforeEval: types.EvalResult{
			Depth:   19,
			ScoreCP: intPtr(-50),
		},
		AfterEval: types.EvalResult{
			Depth:   19,
			ScoreCP: intPtr(300),
		},
	}
	puzzle := Puzzle{
		FEN:         "test-fen",
		Solution:    "g2g3",
		PV:          []string{"g2g3", "h4e4", "f1e2"},
		SideToMove:  "w",
		IssueType:   types.MoveIssueBlunder,
		SolverColor: "white",
	}

	issue := buildOpponentPuzzleIssue(candidate, types.EvalResult{Depth: 18}, puzzle)
	if len(issue.Solution) != len(puzzle.PV) {
		t.Fatalf("expected persisted solution %v, got %v", puzzle.PV, issue.Solution)
	}
	if issue.Fen != puzzle.FEN || issue.UserColor != "white" {
		t.Fatalf("unexpected persisted opponent puzzle: %#v", issue)
	}
	if issue.PlayerColor != "white" {
		t.Fatalf("expected puzzle orientation to use the analyzed user color, got %s", issue.PlayerColor)
	}
	if issue.ScoreCP == nil || *issue.ScoreCP != -50 ||
		issue.AfterScoreCP == nil || *issue.AfterScoreCP != 300 {
		t.Fatalf("opponent issue did not preserve the chronological evaluation transition: %#v", issue)
	}
}

func TestLichessFixtureUsesOpponentMoveBeforeSolverLine(t *testing.T) {
	// Official Lichess database row pWsHD. Dataset FEN is before the
	// opponent's setup move; the solver starts from the position after move 1.
	const fen = "1k6/pp4pp/4p1q1/2B5/8/5R2/PPP2PPP/6K1 b - - 0 27"
	moves := []string{"g6c2", "c5d6", "b8c8", "f3c3", "c2c3", "b2c3"}

	option, err := lib.FEN(fen)
	if err != nil {
		t.Fatalf("load fixture FEN: %v", err)
	}
	game := lib.NewGame(option)
	if sideToMoveFromFEN(game.Position().String()) != "b" {
		t.Fatal("expected the published pre-puzzle position to be black to move")
	}
	if err := playUCIMove(game, moves[0]); err != nil {
		t.Fatalf("play setup move: %v", err)
	}
	if sideToMoveFromFEN(game.Position().String()) != "w" {
		t.Fatal("expected the solver to move after replaying the first dataset move")
	}
	for _, move := range moves[1:] {
		if err := playUCIMove(game, move); err != nil {
			t.Fatalf("play fixture move %s: %v", move, err)
		}
	}
}

func TestTrimToSolverMoveProducesOddLength(t *testing.T) {
	got := trimToSolverMove([]string{"a2a4", "a7a5", "b2b4", "b7b5"})
	if len(got) != 3 {
		t.Fatalf("expected forced line to end on solver move, got %v", got)
	}
}
