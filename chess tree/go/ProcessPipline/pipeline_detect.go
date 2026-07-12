package Processpipline

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	types "chess/Types"

	stockfish "github.com/RajanDhamala/go-stockfish"
)

type confirmationResult struct {
	Evaluation     types.EvalResult
	Candidate      puzzleCandidate
	Puzzle         Puzzle
	Accepted       bool
	IssueConfirmed bool
}

type pendingPipelineStep struct {
	Diagnostic     PipelineDiagnostic
	Decision       DiagnosticDecision
	Reason         string
	Explanation    string
	CandidateIndex int
	HasCandidate   bool
}

type candidateConfirmationTask struct {
	Candidate  puzzleCandidate
	Diagnostic PipelineDiagnostic
}

type candidateConfirmationOutput struct {
	Confirmation confirmationResult
	Diagnostic   PipelineDiagnostic
}

func AnalyzeGame(
	ctx context.Context,
	input types.EvalGameInput,
	client *stockfish.Client,
	config PipelineConfig,
) PipelineResult {
	return NewProcessor(client, config).AnalyzeGame(ctx, input)
}

func (p *Processor) AnalyzeGame(ctx context.Context, input types.EvalGameInput) PipelineResult {
	result := PipelineResult{
		GameID:  input.GameID,
		Issues:  []types.MoveIssue{},
		Puzzles: []Puzzle{},
	}
	if p == nil || p.client == nil {
		result.Error = "stockfish client is not initialized"
		return result
	}

	snapshots, err := prepareSnapshots(input.Moves, input.IsWhite)
	return p.analyzePrepared(ctx, input, snapshots, err)
}

func (p *Processor) analyzePrepared(
	ctx context.Context,
	input types.EvalGameInput,
	snapshots []moveSnapshot,
	snapshotErr error,
) (result PipelineResult) {
	started := time.Now()
	metrics := &evaluationMetrics{}
	ctx = context.WithValue(ctx, evaluationMetricsContextKey{}, metrics)
	result = PipelineResult{
		GameID:  input.GameID,
		Issues:  []types.MoveIssue{},
		Puzzles: []Puzzle{},
		Stats: PipelineStats{
			Snapshots: len(snapshots),
		},
	}
	defer func() {
		result.Stats.EvalRequests = metrics.Requests.Load()
		result.Stats.EvalCacheHits = metrics.CacheHits.Load()
		result.Stats.EngineSearches = metrics.EngineEvaluations.Load()
		result.Stats.EngineTimeMS = metrics.EngineTimeNS.Load() / int64(time.Millisecond)
		result.Stats.ProcessingTimeMS = time.Since(started).Milliseconds()
	}()
	if p.config.Diagnostics.Enabled {
		result.Diagnostics = []PipelineDiagnostic{}
	}
	evaluationFailureCounts := make(map[string]int, 2)
	firstEvaluationFailure := ""
	recordEvaluationFailure := func(code string, explanation string) {
		if code == "" {
			code = ReasonEngineUnavailable
		}
		result.Stats.EvaluationErrors++
		evaluationFailureCounts[code]++
		if firstEvaluationFailure == "" {
			firstEvaluationFailure = explanation
		}
	}
	steps := make([]pendingPipelineStep, 0, len(snapshots))
	candidateTasks := make([]candidateConfirmationTask, 0)

	if snapshotErr != nil {
		result.Error = snapshotErr.Error()
		var moveIndex int
		var moveSAN string
		if parsed, ok := snapshotErr.(*snapshotError); ok {
			moveIndex = parsed.MoveIndex
			moveSAN = parsed.MoveSAN
		}
		diagnostic := PipelineDiagnostic{
			GameID:      input.GameID,
			MoveIndex:   moveIndex,
			TriggerSAN:  moveSAN,
			SolverColor: colorFromBool(input.IsWhite),
			Stage:       DiagnosticStageSnapshot,
		}
		p.finishDiagnostic(&result, diagnostic, DiagnosticError, ReasonInvalidSAN, snapshotErr.Error())
	}

	limit := len(snapshots)
	if p.config.MaxMovesPerGame > 0 && limit > p.config.MaxMovesPerGame {
		limit = p.config.MaxMovesPerGame
	}
	if err := p.acquireScoutSlot(ctx); err != nil {
		result.Error = err.Error()
		return result
	}
	p.prefetchScoutEvaluations(ctx, snapshots[:limit])
	p.releaseScoutSlot()

	for _, snapshot := range snapshots[:limit] {
		diagnostic := newDiagnostic(input, snapshot)
		if snapshot.MoveIndex <= p.config.SkipInitialPlies {
			steps = append(steps, terminalStep(
				diagnostic,
				DiagnosticRejected,
				ReasonOpeningPly,
				fmt.Sprintf("ply %d is inside the configured opening skip of %d", snapshot.MoveIndex, p.config.SkipInitialPlies),
			))
			continue
		}
		if snapshot.IsBookMove {
			steps = append(steps, terminalStep(
				diagnostic,
				DiagnosticRejected,
				ReasonBookMove,
				"move is still inside the opening book",
			))
			continue
		}
		if snapshot.IsRepeatedPosition {
			steps = append(steps, terminalStep(
				diagnostic,
				DiagnosticRejected,
				ReasonRepetition,
				"the puzzle start position already occurred earlier in the game",
			))
			continue
		}

		result.Stats.Scouted++
		beforeEval, err := p.evaluate(ctx, snapshot.FEN, p.config.ScoutDepth, 1, p.config.EvaluationMoveTime)
		if err != nil {
			code, explanation := engineReason(err)
			recordEvaluationFailure(code, explanation)
			steps = append(steps, terminalStep(diagnostic, DiagnosticError, code, explanation))
			continue
		}
		afterEval, err := p.evaluate(ctx, snapshot.AfterFEN, p.config.ScoutDepth, 1, p.config.EvaluationMoveTime)
		if err != nil {
			code, explanation := engineReason(err)
			recordEvaluationFailure(code, explanation)
			steps = append(steps, terminalStep(diagnostic, DiagnosticError, code, explanation))
			continue
		}

		fillScoutDiagnostic(&diagnostic, beforeEval, afterEval, input.IsWhite)
		swingCP, winSwing := opportunitySwing(snapshot, beforeEval, afterEval, input.IsWhite)
		diagnostic.SwingCP = swingCP
		diagnostic.WinChanceSwing = winSwing

		if sameUCIMove(snapshot.MoveUCI, beforeEval.BestMove) {
			steps = append(steps, terminalStep(
				diagnostic,
				DiagnosticRejected,
				ReasonPlayedBestMove,
				"the played move matches Stockfish's best move",
			))
			continue
		}
		meaningful, swingExplanation := meaningfulSwingDecision(
			beforeEval,
			afterEval,
			snapshot.SideToMove == "w",
			swingCP,
			winSwing,
			p.config,
		)
		if !meaningful {
			steps = append(steps, terminalStep(
				diagnostic,
				DiagnosticRejected,
				ReasonInsufficientSwing,
				swingExplanation,
			))
			continue
		}

		candidate := puzzleCandidate{
			Snapshot:      snapshot,
			Type:          diagnostic.CandidateType,
			StartFEN:      diagnostic.FEN,
			SolverIsWhite: input.IsWhite,
			SwingCP:       swingCP,
			WinSwing:      winSwing,
			BeforeEval:    beforeEval,
			AfterEval:     afterEval,
		}
		result.Stats.Candidates++

		candidateIndex := len(candidateTasks)
		candidateTasks = append(candidateTasks, candidateConfirmationTask{
			Candidate:  candidate,
			Diagnostic: diagnostic,
		})
		steps = append(steps, candidateStep(candidateIndex))
	}

	confirmations := p.confirmCandidates(ctx, candidateTasks)
	type acceptedPuzzleRecord struct {
		PuzzleIndex int
		IssueIndex  int
	}
	acceptedPuzzleKeys := make(map[string]acceptedPuzzleRecord)

	for _, step := range steps {
		if !step.HasCandidate {
			p.finishDiagnostic(&result, step.Diagnostic, step.Decision, step.Reason, step.Explanation)
			continue
		}

		task := candidateTasks[step.CandidateIndex]
		confirmation := confirmations[step.CandidateIndex].Confirmation
		diagnostic := confirmations[step.CandidateIndex].Diagnostic
		var issue *types.MoveIssue
		if task.Candidate.Snapshot.IsUserMove && confirmation.IssueConfirmed {
			confirmedCandidate := confirmation.Candidate
			value := buildMoveIssue(
				confirmedCandidate.Snapshot,
				confirmedCandidate.SolverIsWhite,
				confirmedCandidate.BeforeEval,
				confirmedCandidate.AfterEval,
				confirmedCandidate.SwingCP,
				p.config,
			)
			issue = &value
		}
		if confirmation.IssueConfirmed {
			result.Stats.Confirmed++
		}
		if confirmation.Accepted {
			puzzleKey := positionKey(confirmation.Puzzle.FEN)
			if existing, exists := acceptedPuzzleKeys[puzzleKey]; exists {
				// An opponent blunder and the user's immediately following miss share
				// the same puzzle position. Keep one puzzle, but prefer the user's
				// missed-move provenance so the persisted review points at the move
				// they could actually improve.
				if issue != nil &&
					result.Puzzles[existing.PuzzleIndex].CandidateType == PuzzleCandidateOpponentBlunder {
					enrichIssueFromConfirmation(issue, confirmation.Evaluation)
					issue.Solution = append([]string(nil), confirmation.Puzzle.PV...)
					issue.PV = append([]string(nil), confirmation.Puzzle.PV...)
					result.Puzzles[existing.PuzzleIndex] = confirmation.Puzzle
					result.Issues[existing.IssueIndex] = *issue
				}
				p.finishDiagnostic(
					&result,
					diagnostic,
					DiagnosticRejected,
					ReasonDuplicatePuzzle,
					"this game already produced a puzzle from the same canonical position",
				)
				continue
			}
			if len(result.Puzzles) >= p.config.MaxPuzzlesPerGame {
				if issue != nil {
					enrichIssueFromConfirmation(issue, confirmation.Evaluation)
					result.Issues = append(result.Issues, *issue)
				}
				p.finishDiagnostic(
					&result,
					diagnostic,
					DiagnosticRejected,
					ReasonMaxPuzzlesReached,
					"the per-game puzzle limit has been reached",
				)
				continue
			}

			record := acceptedPuzzleRecord{PuzzleIndex: len(result.Puzzles)}
			if issue != nil {
				enrichIssueFromConfirmation(issue, confirmation.Evaluation)
				issue.Solution = append([]string(nil), confirmation.Puzzle.PV...)
				issue.PV = append([]string(nil), confirmation.Puzzle.PV...)
				record.IssueIndex = len(result.Issues)
				result.Issues = append(result.Issues, *issue)
			}
			result.Puzzles = append(result.Puzzles, confirmation.Puzzle)
			if !task.Candidate.Snapshot.IsUserMove {
				record.IssueIndex = len(result.Issues)
				result.Issues = append(
					result.Issues,
					buildOpponentPuzzleIssue(confirmation.Candidate, confirmation.Evaluation, confirmation.Puzzle),
				)
			}
			acceptedPuzzleKeys[puzzleKey] = record
			p.finishDiagnostic(&result, diagnostic, DiagnosticAccepted, ReasonAccepted, "candidate passed swing, uniqueness, and continuation validation")
			continue
		}
		if issue != nil {
			enrichIssueFromConfirmation(issue, confirmation.Evaluation)
			result.Issues = append(result.Issues, *issue)
		}
		if diagnostic.Decision == "" {
			p.finishStandaloneDiagnostic(
				&diagnostic,
				DiagnosticRejected,
				ReasonNoEngineLine,
				"candidate confirmation ended without a terminal decision",
			)
		}
		if diagnostic.Decision == DiagnosticError {
			recordEvaluationFailure(diagnostic.ReasonCode, diagnostic.Explanation)
		}
		p.finishDiagnostic(&result, diagnostic, diagnostic.Decision, diagnostic.ReasonCode, diagnostic.Explanation)
	}
	if result.Stats.EvaluationErrors > 0 {
		engineError := evaluationFailureSummary(
			result.Stats.EvaluationErrors,
			evaluationFailureCounts,
			firstEvaluationFailure,
		)
		if result.Error == "" {
			result.Error = engineError
		} else {
			result.Error += "; " + engineError
		}
	}

	return result
}

func evaluationFailureSummary(
	total int,
	counts map[string]int,
	firstExplanation string,
) string {
	codes := make([]string, 0, len(counts))
	for code, count := range counts {
		if count > 0 {
			codes = append(codes, code)
		}
	}
	sort.Strings(codes)
	details := make([]string, 0, len(codes))
	for _, code := range codes {
		details = append(details, fmt.Sprintf("%s=%d", code, counts[code]))
	}

	message := fmt.Sprintf("%d engine evaluation(s) failed", total)
	if len(details) > 0 {
		message += " (" + strings.Join(details, ", ") + ")"
	}
	if firstExplanation != "" {
		message += "; first error: " + firstExplanation
	}
	return message + "; the game result is incomplete"
}

func terminalStep(
	diagnostic PipelineDiagnostic,
	decision DiagnosticDecision,
	reason string,
	explanation string,
) pendingPipelineStep {
	return pendingPipelineStep{
		Diagnostic:  diagnostic,
		Decision:    decision,
		Reason:      reason,
		Explanation: explanation,
	}
}

func candidateStep(index int) pendingPipelineStep {
	return pendingPipelineStep{
		CandidateIndex: index,
		HasCandidate:   true,
	}
}

func (p *Processor) confirmCandidates(
	ctx context.Context,
	tasks []candidateConfirmationTask,
) []candidateConfirmationOutput {
	results := make([]candidateConfirmationOutput, len(tasks))
	if len(tasks) == 0 {
		return results
	}

	workers := min(p.config.PositionConcurrency, len(tasks))
	jobs := make(chan int, workers)
	var wait sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			for index := range jobs {
				diagnostic := tasks[index].Diagnostic
				confirmation := p.confirmCandidate(ctx, tasks[index].Candidate, &diagnostic)
				results[index] = candidateConfirmationOutput{
					Confirmation: confirmation,
					Diagnostic:   diagnostic,
				}
			}
		}()
	}

	for index := range tasks {
		jobs <- index
	}
	close(jobs)
	wait.Wait()
	return results
}

func (p *Processor) prefetchScoutEvaluations(ctx context.Context, snapshots []moveSnapshot) {
	fens := uniqueScoutFENs(snapshots, p.config)
	if len(fens) == 0 {
		return
	}

	workers := min(p.config.PositionConcurrency, len(fens))
	jobs := make(chan string, workers)
	var wait sync.WaitGroup
	for range workers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			for fen := range jobs {
				_, _ = p.evaluate(ctx, fen, p.config.ScoutDepth, 1, p.config.EvaluationMoveTime)
			}
		}()
	}

	for _, fen := range fens {
		select {
		case jobs <- fen:
		case <-ctx.Done():
			close(jobs)
			wait.Wait()
			return
		}
	}
	close(jobs)
	wait.Wait()
}

func uniqueScoutFENs(snapshots []moveSnapshot, config PipelineConfig) []string {
	seen := make(map[string]struct{}, len(snapshots)+1)
	fens := make([]string, 0, len(snapshots)+1)
	for _, snapshot := range snapshots {
		if snapshot.MoveIndex <= config.SkipInitialPlies ||
			snapshot.IsBookMove || snapshot.IsRepeatedPosition {
			continue
		}
		for _, fen := range []string{snapshot.FEN, snapshot.AfterFEN} {
			if _, exists := seen[fen]; exists {
				continue
			}
			seen[fen] = struct{}{}
			fens = append(fens, fen)
		}
	}
	return fens
}

func newDiagnostic(input types.EvalGameInput, snapshot moveSnapshot) PipelineDiagnostic {
	candidateType := PuzzleCandidateOpponentBlunder
	startFEN := snapshot.AfterFEN
	if snapshot.IsUserMove {
		candidateType = PuzzleCandidateMissedMove
		startFEN = snapshot.FEN
	}
	return PipelineDiagnostic{
		GameID:        input.GameID,
		MoveIndex:     snapshot.MoveIndex,
		TriggerSAN:    snapshot.MoveSAN,
		TriggerUCI:    snapshot.MoveUCI,
		CandidateType: candidateType,
		SolverColor:   colorFromBool(input.IsWhite),
		FEN:           startFEN,
		Stage:         DiagnosticStageScout,
	}
}

func fillScoutDiagnostic(
	diagnostic *PipelineDiagnostic,
	before types.EvalResult,
	after types.EvalResult,
	solverIsWhite bool,
) {
	diagnostic.BeforeScoreCP = perspectiveCP(before.ScoreCP, solverIsWhite)
	diagnostic.AfterScoreCP = perspectiveCP(after.ScoreCP, solverIsWhite)
	diagnostic.BeforeMate = perspectiveMate(before.Mate, solverIsWhite)
	diagnostic.AfterMate = perspectiveMate(after.Mate, solverIsWhite)
	diagnostic.BeforeWinChance, _ = evaluationWinChance(before, solverIsWhite)
	diagnostic.AfterWinChance, _ = evaluationWinChance(after, solverIsWhite)
}

func perspectiveCP(score *int, sideIsWhite bool) *int {
	if score == nil {
		return nil
	}
	value := *score
	if !sideIsWhite {
		value = -value
	}
	return &value
}

func perspectiveMate(mate *int, sideIsWhite bool) *int {
	if mate == nil {
		return nil
	}
	value := *mate
	if !sideIsWhite {
		value = -value
	}
	return &value
}

func opportunitySwing(
	snapshot moveSnapshot,
	before types.EvalResult,
	after types.EvalResult,
	userIsWhite bool,
) (int, float64) {
	beforeScore, beforeOK := evaluationScoreForSide(before, userIsWhite)
	afterScore, afterOK := evaluationScoreForSide(after, userIsWhite)
	beforeWin, beforeWinOK := evaluationWinChance(before, userIsWhite)
	afterWin, afterWinOK := evaluationWinChance(after, userIsWhite)

	scoreSwing := 0
	winSwing := 0.0
	if snapshot.IsUserMove {
		if beforeOK && afterOK {
			scoreSwing = beforeScore - afterScore
		}
		if beforeWinOK && afterWinOK {
			winSwing = beforeWin - afterWin
		}
	} else {
		if beforeOK && afterOK {
			scoreSwing = afterScore - beforeScore
		}
		if beforeWinOK && afterWinOK {
			winSwing = afterWin - beforeWin
		}
	}

	if scoreSwing < 0 {
		scoreSwing = 0
	}
	if winSwing < 0 {
		winSwing = 0
	}
	return scoreSwing, winSwing
}

func isMeaningfulSwing(
	before types.EvalResult,
	after types.EvalResult,
	moverIsWhite bool,
	cpSwing int,
	winSwing float64,
	config PipelineConfig,
) bool {
	meaningful, _ := meaningfulSwingDecision(before, after, moverIsWhite, cpSwing, winSwing, config)
	return meaningful
}

func meaningfulSwingDecision(
	before types.EvalResult,
	after types.EvalResult,
	moverIsWhite bool,
	cpSwing int,
	winSwing float64,
	config PipelineConfig,
) (bool, string) {
	beforeMate, beforeHasMate := mateForSide(before.Mate, moverIsWhite)
	afterMate, afterHasMate := mateForSide(after.Mate, moverIsWhite)
	if beforeHasMate && beforeMate > 0 && (!afterHasMate || afterMate <= 0) {
		return true, ""
	}
	if afterHasMate && afterMate < 0 && (!beforeHasMate || beforeMate >= 0) {
		return true, ""
	}
	if beforeHasMate || afterHasMate {
		return false, "the position already contained a forced mate; changing only the mate distance is not treated as a new tactical opportunity"
	}
	if cpSwing >= config.MinCPLoss || winSwing >= config.MinWinChanceSwing {
		return true, ""
	}
	return false, fmt.Sprintf(
		"loss was %dcp and %.1f winning-chance points; thresholds are %dcp or %.1f",
		cpSwing,
		winSwing,
		config.MinCPLoss,
		config.MinWinChanceSwing,
	)
}

func (p *Processor) confirmCandidate(
	ctx context.Context,
	candidate puzzleCandidate,
	diagnostic *PipelineDiagnostic,
) confirmationResult {
	diagnostic.Stage = DiagnosticStageConfirmation
	result := confirmationResult{Candidate: candidate}
	legalMoves, err := legalMoveCount(candidate.StartFEN)
	if err != nil {
		p.finishStandaloneDiagnostic(diagnostic, DiagnosticError, ReasonInvalidUCI, err.Error())
		return result
	}
	if legalMoves < 2 {
		p.finishStandaloneDiagnostic(diagnostic, DiagnosticRejected, ReasonOnlyLegalMove, "the solver has fewer than two legal choices")
		return result
	}

	// First re-check the played move's swing with matching single-PV searches.
	// MultiPV is substantially more expensive and is only needed after the
	// candidate survives this confirmation gate.
	startEval, err := p.evaluate(
		ctx,
		candidate.StartFEN,
		p.config.ConfirmationDepth,
		1,
		p.config.EvaluationMoveTime,
	)
	if err != nil {
		code, explanation := engineReason(err)
		p.finishStandaloneDiagnostic(diagnostic, DiagnosticError, code, explanation)
		return result
	}
	startLabel := "before"
	if !candidate.Snapshot.IsUserMove {
		startLabel = "after"
	}
	if len(startEval.Lines) == 0 || len(startEval.Lines[0].PV) == 0 {
		p.finishStandaloneDiagnostic(
			diagnostic,
			DiagnosticRejected,
			ReasonNoEngineLine,
			startLabel+"-position single-PV evaluation returned no principal variation",
		)
		return result
	}
	if actualDepth, shallow := shallowConfirmationDepth(startEval, p.config.MinimumConfirmationDepth, 1); shallow {
		p.finishStandaloneDiagnostic(
			diagnostic,
			DiagnosticRejected,
			ReasonInsufficientDepth,
			fmt.Sprintf(
				"%s-position single-PV evaluation reached depth %d; confirmation requires at least depth %d (target %d)",
				startLabel,
				actualDepth,
				p.config.MinimumConfirmationDepth,
				p.config.ConfirmationDepth,
			),
		)
		return result
	}

	otherFEN := candidate.Snapshot.AfterFEN
	if !candidate.Snapshot.IsUserMove {
		otherFEN = candidate.Snapshot.FEN
	}
	otherEval := startEval
	if otherFEN != candidate.StartFEN {
		otherEval, err = p.evaluate(
			ctx,
			otherFEN,
			p.config.ConfirmationDepth,
			1,
			p.config.EvaluationMoveTime,
		)
		if err != nil {
			code, explanation := engineReason(err)
			p.finishStandaloneDiagnostic(diagnostic, DiagnosticError, code, explanation)
			return result
		}
	}
	otherLabel := "after"
	if !candidate.Snapshot.IsUserMove {
		otherLabel = "before"
	}
	if len(otherEval.Lines) == 0 || len(otherEval.Lines[0].PV) == 0 {
		p.finishStandaloneDiagnostic(
			diagnostic,
			DiagnosticRejected,
			ReasonNoEngineLine,
			otherLabel+"-position single-PV evaluation returned no principal variation",
		)
		return result
	}
	if actualDepth, shallow := shallowConfirmationDepth(otherEval, p.config.MinimumConfirmationDepth, 1); shallow {
		p.finishStandaloneDiagnostic(
			diagnostic,
			DiagnosticRejected,
			ReasonInsufficientDepth,
			fmt.Sprintf(
				"%s-position single-PV evaluation reached depth %d; confirmation requires at least depth %d (target %d)",
				otherLabel,
				actualDepth,
				p.config.MinimumConfirmationDepth,
				p.config.ConfirmationDepth,
			),
		)
		return result
	}

	beforeEval := otherEval
	afterEval := startEval
	if candidate.Snapshot.IsUserMove {
		beforeEval = startEval
		afterEval = otherEval
	} else {
		beforeEval = otherEval
		afterEval = startEval
	}

	fillScoutDiagnostic(diagnostic, beforeEval, afterEval, candidate.SolverIsWhite)
	confirmedSwingCP, confirmedWinSwing := opportunitySwing(
		candidate.Snapshot,
		beforeEval,
		afterEval,
		candidate.SolverIsWhite,
	)
	diagnostic.SwingCP = confirmedSwingCP
	diagnostic.WinChanceSwing = confirmedWinSwing
	candidate.BeforeEval = beforeEval
	candidate.AfterEval = afterEval
	candidate.SwingCP = confirmedSwingCP
	candidate.WinSwing = confirmedWinSwing
	result.Candidate = candidate
	if sameUCIMove(candidate.Snapshot.MoveUCI, beforeEval.BestMove) {
		p.finishStandaloneDiagnostic(
			diagnostic,
			DiagnosticRejected,
			ReasonPlayedBestMove,
			"the played move matches Stockfish's best move at confirmation depth",
		)
		return result
	}
	meaningful, swingExplanation := meaningfulSwingDecision(
		beforeEval,
		afterEval,
		candidate.Snapshot.SideToMove == "w",
		confirmedSwingCP,
		confirmedWinSwing,
		p.config,
	)
	if !meaningful {
		p.finishStandaloneDiagnostic(
			diagnostic,
			DiagnosticRejected,
			ReasonInsufficientSwing,
			"confirmation: "+swingExplanation,
		)
		return result
	}
	result.IssueConfirmed = true

	requiredLines := min(p.config.ConfirmationMultiPV, legalMoves)
	eval, err := p.evaluate(
		ctx,
		candidate.StartFEN,
		p.config.RootVerificationDepth,
		requiredLines,
		p.config.PuzzleMoveTime,
	)
	if err != nil {
		code, explanation := engineReason(err)
		p.finishStandaloneDiagnostic(diagnostic, DiagnosticError, code, explanation)
		return result
	}
	result.Evaluation = eval
	if len(eval.Lines) == 0 || len(eval.Lines[0].PV) == 0 {
		p.finishStandaloneDiagnostic(diagnostic, DiagnosticRejected, ReasonNoEngineLine, "Stockfish returned no principal variation")
		return result
	}
	if actualDepth, shallow := shallowConfirmationDepth(
		eval,
		p.config.ConfirmationDepth,
		requiredLines,
	); shallow {
		p.finishStandaloneDiagnostic(
			diagnostic,
			DiagnosticRejected,
			ReasonInsufficientDepth,
			fmt.Sprintf(
				"root MultiPV evaluation reached depth %d; confirmation requires at least depth %d (target %d)",
				actualDepth,
				p.config.ConfirmationDepth,
				p.config.RootVerificationDepth,
			),
		)
		return result
	}
	if len(eval.Lines) < requiredLines {
		p.finishStandaloneDiagnostic(
			diagnostic,
			DiagnosticRejected,
			ReasonIncompleteMultiPV,
			fmt.Sprintf(
				"Stockfish returned %d root lines; %d are required for %d legal moves",
				len(eval.Lines),
				requiredLines,
				legalMoves,
			),
		)
		return result
	}

	fillConfirmationDiagnostic(diagnostic, eval, candidate.SolverIsWhite)
	diagnostic.MaterialDifference = materialDifference(candidate.StartFEN, candidate.SolverIsWhite)
	if !hasWinningAdvantage(eval.Lines[0], candidate.SolverIsWhite, p.config.MinAdvantageCP) {
		p.finishStandaloneDiagnostic(
			diagnostic,
			DiagnosticRejected,
			ReasonAdvantageTooSmall,
			fmt.Sprintf("best line does not reach the required %dcp advantage or force mate", p.config.MinAdvantageCP),
		)
		return result
	}

	if code, explanation := rejectComfortableConversion(*diagnostic, p.config); code != "" {
		p.finishStandaloneDiagnostic(diagnostic, DiagnosticRejected, code, explanation)
		return result
	}
	if code, explanation := forcingMoveDecision(eval, candidate.SolverIsWhite, p.config); code != "" {
		p.finishStandaloneDiagnostic(diagnostic, DiagnosticRejected, code, explanation)
		return result
	}

	diagnostic.Stage = DiagnosticStageContinuation
	sequence := p.buildPuzzleSequence(ctx, candidate.StartFEN, candidate.SolverIsWhite, eval)
	diagnostic.ContinuationPlies = len(sequence.PV)
	if !sequence.Valid {
		explanation := sequence.Explanation
		if explanation == "" {
			explanation = "the principal variation did not produce a valid puzzle sequence"
		}
		p.finishStandaloneDiagnostic(diagnostic, DiagnosticRejected, reasonFromSequence(sequence), explanation)
		return result
	}

	result.Puzzle = buildPuzzle(candidate, eval, sequence, *diagnostic, p.config)
	result.Accepted = true
	return result
}

func fillConfirmationDiagnostic(diagnostic *PipelineDiagnostic, eval types.EvalResult, solverIsWhite bool) {
	top := eval.Lines[0]
	diagnostic.TopScoreCP = perspectiveCP(top.ScoreCP, solverIsWhite)
	diagnostic.TopMate = perspectiveMate(top.Mate, solverIsWhite)
	diagnostic.TopWinChance, _ = lineWinChance(top, solverIsWhite)
	if len(eval.Lines) < 2 {
		return
	}
	second := eval.Lines[1]
	diagnostic.SecondScoreCP = perspectiveCP(second.ScoreCP, solverIsWhite)
	diagnostic.SecondMate = perspectiveMate(second.Mate, solverIsWhite)
	diagnostic.SecondWinChance, _ = lineWinChance(second, solverIsWhite)
	diagnostic.UniquenessGap = diagnostic.TopWinChance - diagnostic.SecondWinChance
	topScore, topOK := lineScoreForSide(top, solverIsWhite)
	secondScore, secondOK := lineScoreForSide(second, solverIsWhite)
	if topOK && secondOK {
		diagnostic.UniquenessCPGap = topScore - secondScore
	}
}

// shallowConfirmationDepth reports a known search depth below the configured
// confirmation target. Depth zero is treated as unspecified so test doubles and
// alternative evaluators that do not report depth retain their existing
// behavior; the production Stockfish wrapper reports positive depths.
func shallowConfirmationDepth(eval types.EvalResult, requiredDepth int, lineLimit int) (int, bool) {
	if requiredDepth <= 0 {
		return 0, false
	}

	shallowest := 0
	consider := func(depth int) {
		if depth <= 0 || depth >= requiredDepth {
			return
		}
		if shallowest == 0 || depth < shallowest {
			shallowest = depth
		}
	}
	consider(eval.Depth)
	if lineLimit > len(eval.Lines) {
		lineLimit = len(eval.Lines)
	}
	for index := 0; index < lineLimit; index++ {
		consider(eval.Lines[index].Depth)
	}
	return shallowest, shallowest > 0
}

func rejectComfortableConversion(diagnostic PipelineDiagnostic, config PipelineConfig) (string, string) {
	if diagnostic.SecondScoreCP == nil && diagnostic.SecondMate == nil {
		return "", ""
	}
	if diagnostic.TopMate != nil && *diagnostic.TopMate > 0 {
		return "", ""
	}
	if diagnostic.TopWinChance >= config.DecisiveWinChance &&
		diagnostic.SecondWinChance >= config.DecisiveWinChance {
		return ReasonAlreadyDecisive, "both leading moves preserve a decisive winning outcome"
	}
	if diagnostic.TopWinChance >= config.DecisiveWinChance &&
		diagnostic.SecondWinChance >= config.ComfortableWinChance {
		return ReasonAlternativeStillWinning, "the second move still preserves a comfortable winning outcome"
	}
	return "", ""
}

func forcingMoveDecision(eval types.EvalResult, solverIsWhite bool, config PipelineConfig) (string, string) {
	return forcingMoveDecisionWithMateDistance(eval, solverIsWhite, config, true)
}

func continuationMoveDecision(eval types.EvalResult, solverIsWhite bool, config PipelineConfig) (string, string) {
	diagnostic := PipelineDiagnostic{}
	fillConfirmationDiagnostic(&diagnostic, eval, solverIsWhite)
	if code, explanation := rejectComfortableConversion(diagnostic, config); code != "" {
		return code, explanation
	}
	return forcingMoveDecisionWithMateDistance(eval, solverIsWhite, config, false)
}

func forcingMoveDecisionWithMateDistance(
	eval types.EvalResult,
	solverIsWhite bool,
	config PipelineConfig,
	enforceMateDistance bool,
) (string, string) {
	if len(eval.Lines) < 2 {
		return ReasonNoUniqueBestMove, "Stockfish returned fewer than two lines for a position with multiple legal moves"
	}

	topMate, topHasMate := mateForSide(eval.Lines[0].Mate, solverIsWhite)
	shortestMate, shortestMateMoves := shortestMatingMoves(eval.Lines, solverIsWhite)
	if shortestMate > 0 {
		if !topHasMate || topMate != shortestMate {
			return ReasonShorterMateAvailable, fmt.Sprintf(
				"PV1 is not the shortest mate; a mate in %d is available",
				shortestMate,
			)
		}
		if enforceMateDistance && topMate < config.MinMateIn {
			return ReasonMateTooEasy, fmt.Sprintf(
				"mate in %d is below the minimum mate distance of %d",
				topMate,
				config.MinMateIn,
			)
		}
		if enforceMateDistance && topMate > config.MaxMateIn {
			return ReasonMateTooDeep, fmt.Sprintf(
				"mate in %d exceeds the validated maximum of %d",
				topMate,
				config.MaxMateIn,
			)
		}
		if len(shortestMateMoves) > 1 {
			return ReasonMultipleMatingMoves, fmt.Sprintf(
				"%d different first moves deliver the same shortest mate in %d",
				len(shortestMateMoves),
				shortestMate,
			)
		}
		return "", ""
	}

	topWin, topWinOK := lineWinChance(eval.Lines[0], solverIsWhite)
	secondWin, secondWinOK := lineWinChance(eval.Lines[1], solverIsWhite)
	topScore, topScoreOK := lineScoreForSide(eval.Lines[0], solverIsWhite)
	secondScore, secondScoreOK := lineScoreForSide(eval.Lines[1], solverIsWhite)
	if !topWinOK || !secondWinOK || !topScoreOK || !secondScoreOK {
		return ReasonNoUniqueBestMove, "the top two lines cannot be compared"
	}
	cpGap := topScore - secondScore
	winGap := topWin - secondWin
	if cpGap < config.MinUniquenessCPGap || winGap < config.MinUniquenessWinChanceGap {
		return ReasonNoUniqueBestMove, fmt.Sprintf(
			"PV1/PV2 gap is %dcp and %.1f winning-chance points; at least %dcp and %.1f points are required",
			cpGap,
			winGap,
			config.MinUniquenessCPGap,
			config.MinUniquenessWinChanceGap,
		)
	}
	return "", ""
}

func shortestMatingMoves(lines []types.EvalLine, solverIsWhite bool) (int, map[string]struct{}) {
	shortestMate := 0
	rootMoves := map[string]struct{}{}
	for _, line := range lines {
		mate, hasMate := mateForSide(line.Mate, solverIsWhite)
		if !hasMate || mate <= 0 {
			continue
		}
		if shortestMate == 0 || mate < shortestMate {
			shortestMate = mate
			rootMoves = map[string]struct{}{}
		}
		if mate != shortestMate {
			continue
		}

		rootMove := fmt.Sprintf("multipv:%d", line.MultiPV)
		if len(line.PV) > 0 {
			if normalized := normalizeUCIMove(line.PV[0]); normalized != "" {
				rootMove = normalized
			}
		}
		rootMoves[rootMove] = struct{}{}
	}
	return shortestMate, rootMoves
}

func hasWinningAdvantage(line types.EvalLine, sideIsWhite bool, minimumCP int) bool {
	if mate, ok := mateForSide(line.Mate, sideIsWhite); ok {
		return mate > 0
	}
	score, ok := lineScoreForSide(line, sideIsWhite)
	return ok && score >= minimumCP
}

func buildPuzzle(
	candidate puzzleCandidate,
	eval types.EvalResult,
	sequence sequenceResult,
	diagnostic PipelineDiagnostic,
	config PipelineConfig,
) Puzzle {
	category := PuzzleCategoryTactical
	topMate, hasMate := mateForSide(eval.Lines[0].Mate, candidate.SolverIsWhite)
	if sequence.MateIn > 0 || hasMate && topMate > 0 {
		category = PuzzleCategoryForcedMate
	} else if candidate.SwingCP >= config.BlunderCPLoss {
		category = PuzzleCategoryBlunder
	}

	issueType := classifyIssueWithConfig(
		&candidate.BeforeEval,
		&candidate.AfterEval,
		candidate.Snapshot.SideToMove == "w",
		config,
	)
	if issueType == "" {
		if category == PuzzleCategoryForcedMate {
			issueType = types.MoveIssueForcedMateMissed
		} else if category == PuzzleCategoryBlunder {
			issueType = types.MoveIssueBlunder
		} else {
			issueType = types.MoveIssueMistake
		}
	}

	cpBefore, _ := evaluationScoreForSide(candidate.BeforeEval, candidate.SolverIsWhite)
	cpAfter, _ := evaluationScoreForSide(candidate.AfterEval, candidate.SolverIsWhite)
	materialStart := materialDifference(candidate.StartFEN, candidate.SolverIsWhite)
	return Puzzle{
		FEN:           candidate.StartFEN,
		Solution:      sequence.PV[0],
		PV:            append([]string(nil), sequence.PV...),
		Category:      category,
		CandidateType: candidate.Type,
		TriggerSAN:    candidate.Snapshot.MoveSAN,
		TriggerUCI:    candidate.Snapshot.MoveUCI,
		MateIn:        sequence.MateIn,
		IssueType:     issueType,
		MultiPVGap:    diagnostic.UniquenessGap,
		MultiPVCPGap:  diagnostic.UniquenessCPGap,
		CPBefore:      cpBefore,
		CPAfter:       cpAfter,
		MoveIndex:     candidate.Snapshot.MoveIndex,
		PlayerColor:   colorFromBool(candidate.SolverIsWhite),
		SolverColor:   colorFromBool(candidate.SolverIsWhite),
		SideToMove:    sideToMoveFromFEN(candidate.StartFEN),
		Depth:         (len(sequence.PV) + 1) / 2,
		MaterialStart: materialStart,
		MaterialEnd:   sequence.MaterialEnd,
	}
}

func buildMoveIssue(
	snapshot moveSnapshot,
	userIsWhite bool,
	before types.EvalResult,
	after types.EvalResult,
	cpLoss int,
	config PipelineConfig,
) types.MoveIssue {
	beforeWin, _ := evaluationWinChance(before, userIsWhite)
	afterWin, _ := evaluationWinChance(after, userIsWhite)
	return types.MoveIssue{
		MoveIndex:      snapshot.MoveIndex,
		MoveSAN:        snapshot.MoveSAN,
		MoveUCI:        snapshot.MoveUCI,
		Fen:            snapshot.FEN,
		SideToMove:     snapshot.SideToMove,
		PlayerColor:    colorFromBool(userIsWhite),
		UserColor:      colorFromBool(userIsWhite),
		IssueType:      classifyIssueWithConfig(&before, &after, userIsWhite, config),
		PlayedBestMove: false,
		BestMove:       before.BestMove,
		Ponder:         before.Ponder,
		PV:             append([]string(nil), before.PV...),
		Depth:          before.Depth,
		ScoreCP:        cloneInt(before.ScoreCP),
		Mate:           cloneInt(before.Mate),
		AfterScoreCP:   cloneInt(after.ScoreCP),
		AfterMate:      cloneInt(after.Mate),
		WinProbBefore:  beforeWin,
		WinProbAfter:   afterWin,
		CPDelta:        cpLoss,
		WinProbDelta:   beforeWin - afterWin,
	}
}

func enrichIssueFromConfirmation(issue *types.MoveIssue, eval types.EvalResult) {
	if issue == nil || len(eval.Lines) == 0 {
		return
	}
	issue.BestMove = eval.BestMove
	issue.Ponder = eval.Ponder
	issue.PV = append([]string(nil), eval.Lines[0].PV...)
	issue.Depth = eval.Depth
	issue.ScoreCP = cloneInt(eval.ScoreCP)
	issue.Mate = cloneInt(eval.Mate)
}

func buildOpponentPuzzleIssue(
	candidate puzzleCandidate,
	eval types.EvalResult,
	puzzle Puzzle,
) types.MoveIssue {
	beforeWin, _ := evaluationWinChance(candidate.BeforeEval, candidate.SolverIsWhite)
	afterWin, _ := evaluationWinChance(candidate.AfterEval, candidate.SolverIsWhite)
	return types.MoveIssue{
		MoveIndex:      candidate.Snapshot.MoveIndex,
		MoveSAN:        candidate.Snapshot.MoveSAN,
		MoveUCI:        candidate.Snapshot.MoveUCI,
		Fen:            puzzle.FEN,
		SideToMove:     puzzle.SideToMove,
		PlayerColor:    colorFromBool(candidate.SolverIsWhite),
		UserColor:      colorFromBool(candidate.SolverIsWhite),
		IssueType:      puzzle.IssueType,
		PlayedBestMove: false,
		BestMove:       puzzle.Solution,
		Ponder:         eval.Ponder,
		PV:             append([]string(nil), puzzle.PV...),
		Solution:       append([]string(nil), puzzle.PV...),
		Depth:          candidate.BeforeEval.Depth,
		ScoreCP:        cloneInt(candidate.BeforeEval.ScoreCP),
		Mate:           cloneInt(candidate.BeforeEval.Mate),
		AfterScoreCP:   cloneInt(candidate.AfterEval.ScoreCP),
		AfterMate:      cloneInt(candidate.AfterEval.Mate),
		WinProbBefore:  beforeWin,
		WinProbAfter:   afterWin,
		CPDelta:        candidate.SwingCP,
		WinProbDelta:   candidate.WinSwing,
	}
}

func classifyIssue(before *types.EvalResult, after *types.EvalResult, moverIsWhite bool) types.MoveIssueType {
	return classifyIssueWithConfig(before, after, moverIsWhite, DefaultPipelineConfig())
}

func classifyIssueWithConfig(
	before *types.EvalResult,
	after *types.EvalResult,
	moverIsWhite bool,
	config PipelineConfig,
) types.MoveIssueType {
	beforeMate, beforeHasMate := mateForSide(before.Mate, moverIsWhite)
	afterMate, afterHasMate := mateForSide(after.Mate, moverIsWhite)
	if beforeHasMate && beforeMate > 0 && (!afterHasMate || afterMate <= 0) {
		return types.MoveIssueForcedMateMissed
	}

	beforeScore, beforeOK := evaluationScoreForSide(*before, moverIsWhite)
	afterScore, afterOK := evaluationScoreForSide(*after, moverIsWhite)
	if !beforeOK || !afterOK {
		return types.MoveIssueMistake
	}
	loss := beforeScore - afterScore
	if loss >= config.BlunderCPLoss {
		return types.MoveIssueBlunder
	}
	if loss >= config.MinCPLoss+20 && beforeScore >= 150 && afterScore < 100 {
		return types.MoveIssueLostAdvantage
	}
	if loss >= config.MinCPLoss {
		return types.MoveIssueMistake
	}
	return ""
}

func (p *Processor) finishDiagnostic(
	result *PipelineResult,
	diagnostic PipelineDiagnostic,
	decision DiagnosticDecision,
	reason string,
	explanation string,
) {
	p.finishStandaloneDiagnostic(&diagnostic, decision, reason, explanation)
	switch decision {
	case DiagnosticAccepted:
		result.Stats.Accepted++
	case DiagnosticRejected:
		result.Stats.Rejected++
	case DiagnosticError:
		result.Stats.Rejected++
	}
	if p.config.Diagnostics.Enabled {
		result.Diagnostics = append(result.Diagnostics, diagnostic)
	}
	if p.config.Diagnostics.LogRejections && decision != DiagnosticAccepted {
		log.Printf(
			"[puzzle] game=%s ply=%d type=%s decision=%s reason=%s detail=%s",
			diagnostic.GameID,
			diagnostic.MoveIndex,
			diagnostic.CandidateType,
			decision,
			reason,
			explanation,
		)
	}
}

func (p *Processor) finishStandaloneDiagnostic(
	diagnostic *PipelineDiagnostic,
	decision DiagnosticDecision,
	reason string,
	explanation string,
) {
	diagnostic.Decision = decision
	diagnostic.ReasonCode = reason
	diagnostic.Explanation = strings.TrimSpace(explanation)
	if decision == DiagnosticAccepted {
		diagnostic.Stage = DiagnosticStageAccepted
	}
}

func reasonFromSequence(sequence sequenceResult) string {
	switch sequence.StopReason {
	case ReasonInvalidUCI,
		ReasonIncompleteMultiPV,
		ReasonRepetition,
		ReasonGameDrawn,
		ReasonMateTooEasy,
		ReasonMateTooDeep,
		ReasonMultipleMatingMoves,
		ReasonShorterMateAvailable,
		ReasonAdvantageDisappeared,
		ReasonContinuationNotForced,
		ReasonSolutionTooShort,
		ReasonSolutionTooLong,
		ReasonMateDistanceMismatch,
		ReasonInsufficientDepth,
		ReasonEngineTimeout,
		ReasonEngineUnavailable:
		return sequence.StopReason
	default:
		return ReasonSolutionTooShort
	}
}
