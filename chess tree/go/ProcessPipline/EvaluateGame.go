package Processpipline

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"chess/Types"

	opening "chess/Opening"

	stockfish "github.com/RajanDhamala/go-stockfish"
	lib "github.com/corentings/chess/v2"
)

type moveSnapshot struct {
	MoveIndex   int
	MoveSAN     string
	MoveUCI     string
	Fen         string
	AfterFen    string
	SideToMove  string
	PlayerColor string
	IsUserMove  bool
	IsBookMove  bool
}

type evaluationWindow struct {
	Snapshot        moveSnapshot
	PrevOpponentFen string // before-FEN of the most recent opponent move (empty if none)
}

type layerOneCandidate struct {
	Snapshot    moveSnapshot
	MoveIsWhite bool
}

type PuzzleCategory string

const (
	PuzzleCategoryTactical   PuzzleCategory = "tactical"
	PuzzleCategoryForcedMate PuzzleCategory = "forced_mate"
	PuzzleCategoryBlunder    PuzzleCategory = "blunder"
)

type Puzzle struct {
	FEN         string
	Solution    string
	PV          []string
	Category    PuzzleCategory
	MateIn      int
	IssueType   types.MoveIssueType
	MultiPVGap  int
	CPBefore    int
	CPAfter     int
	MoveIndex   int
	PlayerColor string
	SideToMove  string
}

const (
	defaultSkipInitialPlies    = 10
	defaultMaxUserMovesPerGame = 80
	defaultGameWorkers         = 8
	defaultEvalConcurrency     = 4

	layerOneEvalDepth   = 16
	layerOneEvalMultiPV = 1
	layerTwoEvalMultiPV = 3
	layerTwoMoveTime    = 800 * time.Millisecond

	layerOneDecidedCPBound = 500
	layerTwoMinGapCP       = 150
	layerTwoMinWPGap       = 0.15
	layerTwoCooldownMoves  = 4
	forcedMateMaxDistance  = 4

	// Layer 1 enhanced filtering thresholds
	layerOneWinProbComfortMin = 0.25 // skip if WP below this (opponent winning comfortably)
	layerOneWinProbComfortMax = 0.75 // skip if WP above this (player winning comfortably)
	layerOneOpponentSwingCP   = 150  // min CP swing from opponent move to indicate blunder opportunity
	layerOneMinCPDrop         = 80   // min CP drop for played move to be worth analyzing
	layerOneMinWPDrop         = 0.08 // min WP drop for played move to be worth analyzing
	layerOneAfterEvalDepth    = 10   // shallow depth for after-FEN quick check

	puzzleMistakeCPLoss = 100
	puzzleBlunderCPLoss = 300

	puzzleMistakeWinProbDrop = 0.10
	puzzleBlunderWinProbDrop = 0.20
	puzzleBlunderBeforeWP    = 0.45
	puzzleBlunderAfterWP     = 0.35

	puzzleLostAdvantageBeforeWP  = 0.72
	puzzleLostAdvantageAfterWP   = 0.52
	puzzleLostAdvantageMinDrop   = 0.16
	puzzleLostAdvantageMinCPLoss = 120
)

var (
	evalCache       sync.Map
	candiateCounter = 0
	evalSem         = make(chan struct{}, defaultEvalConcurrency)
)

func PlayGame(moves []types.Move, client *stockfish.Client, isWhite bool) ([]types.MoveIssue, []Puzzle) {
	if client == nil || len(moves) == 0 {
		return nil, nil
	}

	snapshots := prepareSnapshots(moves, isWhite)
	if len(snapshots) == 0 {
		return nil, nil
	}

	windows := buildEvaluationWindows(snapshots, defaultSkipInitialPlies, defaultMaxUserMovesPerGame)
	if len(windows) == 0 {
		return nil, nil
	}

	return evaluateWindows(client, windows, isWhite)
}

func PlayGames(games []types.EvalGameInput, client *stockfish.Client) []types.EvalGameResult {
	if client == nil || len(games) == 0 {
		return nil
	}

	total := len(games)
	results := make([]types.EvalGameResult, total)
	workers := min(defaultGameWorkers, total)

	var wg sync.WaitGroup
	sem := make(chan struct{}, workers)
	var processed int32

	for index, game := range games {
		wg.Add(1)
		sem <- struct{}{}

		go func(idx int, item types.EvalGameInput) {
			defer func() {
				wg.Done()
				<-sem
			}()

			issues, _ := PlayGame(item.Moves, client, item.IsWhite)
			results[idx] = types.EvalGameResult{
				GameID:         item.GameID,
				GameURL:        item.GameURL,
				WhiteUsername:  item.WhiteUsername,
				BlackUsername:  item.BlackUsername,
				WhiteRating:    item.WhiteRating,
				BlackRating:    item.BlackRating,
				OpponentName:   item.OpponentName,
				OpponentRating: item.OpponentRating,
				PlayerColor:    item.PlayerColor,
				TimeClass:      item.TimeClass,
				Result:         item.Result,
				IssueCount:     len(issues),
				Issues:         issues,
			}

			done := atomic.AddInt32(&processed, 1)
			fmt.Printf("[eval] processed %d/%d games (id=%s, issues=%d)\n", done, total, gameIDForLog(item.GameID), len(issues))
		}(index, game)
	}

	wg.Wait()
	return results
}

func prepareSnapshots(moves []types.Move, isWhite bool) []moveSnapshot {
	game := lib.NewGame()
	userColor := colorFromBool(isWhite)
	bookPrefixKey := ""

	snapshots := make([]moveSnapshot, 0, len(moves))

	for index, item := range moves {
		fenBefore := game.Position().String()
		sideToMove := sideToMoveFromFEN(fenBefore)
		playerColor := colorFromSide(sideToMove)

		moveUCI, err := sanToUCI(game.Position(), item.San)
		if err != nil {
			fmt.Printf("failed SAN->UCI conversion at move %d (%s): %v\n", index+1, item.San, err)
		}

		if err := game.PushNotationMove(item.San, lib.AlgebraicNotation{}, nil); err != nil {
			fmt.Printf("failed to apply SAN move %d (%s): %v\n", index+1, item.San, err)
			break
		}

		bookMove := opening.NormalizeSANToken(item.San)
		if bookMove != "" {
			if bookPrefixKey == "" {
				bookPrefixKey = bookMove
			} else {
				bookPrefixKey += " " + bookMove
			}
		}
		inBook := opening.IsBookPrefixKey(bookPrefixKey)

		fenAfter := game.Position().String()
		snapshots = append(snapshots, moveSnapshot{
			MoveIndex:   index + 1,
			MoveSAN:     item.San,
			MoveUCI:     moveUCI,
			Fen:         fenBefore,
			AfterFen:    fenAfter,
			SideToMove:  sideToMove,
			PlayerColor: playerColor,
			IsUserMove:  playerColor == userColor,
			IsBookMove:  inBook,
		})
	}

	return snapshots
}

func buildEvaluationWindows(snapshots []moveSnapshot, skipInitialPlies int, maxUserMoves int) []evaluationWindow {
	windows := make([]evaluationWindow, 0, len(snapshots))
	var lastOpponentFen string // tracks the before-FEN of the most recent opponent move

	for _, snapshot := range snapshots {
		if !snapshot.IsUserMove {
			// Track opponent move's before-FEN for blunder detection
			lastOpponentFen = snapshot.Fen
			continue
		}
		if snapshot.MoveIndex <= skipInitialPlies {
			continue
		}
		if snapshot.IsBookMove {
			continue
		}
		windows = append(windows, evaluationWindow{
			Snapshot:        snapshot,
			PrevOpponentFen: lastOpponentFen,
		})
		if maxUserMoves > 0 && len(windows) >= maxUserMoves {
			break
		}
	}
	return windows
}

func evaluateWindows(client *stockfish.Client, windows []evaluationWindow, userIsWhite bool) ([]types.MoveIssue, []Puzzle) {
	candidates := scanCandidatesLayerOne(client, windows)
	candiateCounter = candiateCounter + 1
	fmt.Println("candiateCounter:", candiateCounter)

	fmt.Printf("[layer1] windows=%d  candidates=%d  filtered=%d\n",
		len(windows),
		len(candidates),
		len(windows)-len(candidates),
	)
	if len(candidates) == 0 {
		return nil, nil
	}
	return confirmTacticsLayerTwo(client, candidates, userIsWhite)
}

func scanCandidatesLayerOne(client *stockfish.Client, windows []evaluationWindow) []layerOneCandidate {
	candidates := make([]layerOneCandidate, 0, len(windows))

	for _, window := range windows {
		// 1: Eval before-FEN at depth 16, single line
		beforeEval := evaluatePositionCached(client, window.Snapshot.Fen, layerOneEvalDepth, layerOneEvalMultiPV, 0)
		moveIsWhite := window.Snapshot.SideToMove == "w"
		if !isEvaluationAvailable(beforeEval) {
			continue
		}

		// 2: Skip if position is already decided (|cp| > 500)
		if isDecidedPosition(&beforeEval, moveIsWhite) {
			continue
		}

		// 3: Skip if player played the best move
		playedBestMove := sameUCIMove(window.Snapshot.MoveUCI, beforeEval.BestMove)
		if playedBestMove {
			continue
		}

		// 4: Skip if win probability is outside contested range (0.25 to 0.75)
		// Position already comfortable for one side — missing best move rarely creates meaningful puzzle
		beforeWP := getWinProb(beforeEval.ScoreCP, beforeEval.Mate, moveIsWhite)
		if beforeWP < layerOneWinProbComfortMin || beforeWP > layerOneWinProbComfortMax {
			continue
		}

		// 5: Skip if no opponent opportunity created (opponent blunder signal)
		// Compare eval between opponent's previous move and current position
		// if window.PrevOpponentFen != "" {
		// 	prevEval := evaluatePositionCached(client, window.PrevOpponentFen, layerOneEvalDepth, layerOneEvalMultiPV, 0)
		// 	if isEvaluationAvailable(prevEval) {
		// 		// Calculate CP swing from opponent's perspective to player's perspective
		// 		// Opponent move turned the previous position into current position
		// 		// A swing in player's favor indicates opponent blundered
		// 		prevCP := scoreOrZero(prevEval.ScoreCP)
		// 		currCP := scoreOrZero(beforeEval.ScoreCP)
		// 		// Both scores are normalized to white's perspective
		// 		// For white player: swing = curr - prev (positive = good for white)
		// 		// For black player: swing = prev - curr (positive = good for black)
		// 		var swing int
		// 		if moveIsWhite {
		// 			swing = currCP - prevCP
		// 		} else {
		// 			swing = prevCP - currCP
		// 		}
		// 		if swing < layerOneOpponentSwingCP {
		// 			// No significant opportunity created by opponent — skip
		// 			continue
		// 		}
		// 	}
		// }

		// 6: Skip if the move was fine enough (small damage)
		// Do cheap depth 10 eval on after-FEN to measure actual damage
		// afterEval := evaluatePositionCached(client, window.Snapshot.AfterFen, layerOneAfterEvalDepth, layerOneEvalMultiPV, 0)
		// if isEvaluationAvailable(afterEval) {
		// 	afterWP := getWinProb(afterEval.ScoreCP, afterEval.Mate, moveIsWhite)
		// 	cpDrop, _ := centipawnLoss(beforeEval.ScoreCP, afterEval.ScoreCP, moveIsWhite)
		// 	wpDrop := winProbDrop(beforeWP, afterWP)
		// 	// If both CP drop and WP drop are small, move was fine enough
		// 	if cpDrop < layerOneMinCPDrop && wpDrop < layerOneMinWPDrop {
		// 		continue
		// 	}
		// }

		// All checks passed — add to candidates for Layer 2
		candidates = append(candidates, layerOneCandidate{
			Snapshot:    window.Snapshot,
			MoveIsWhite: moveIsWhite,
		})
	}

	return candidates
}

func confirmTacticsLayerTwo(client *stockfish.Client, candidates []layerOneCandidate, userIsWhite bool) ([]types.MoveIssue, []Puzzle) {
	userColor := colorFromBool(userIsWhite)
	issues := make([]types.MoveIssue, 0, len(candidates))
	puzzles := make([]Puzzle, 0, len(candidates))
	lastPuzzleMoveIndex := -10

	for _, candidate := range candidates {
		if shouldSkipForPuzzleCooldown(candidate.Snapshot.MoveIndex, lastPuzzleMoveIndex) {
			continue
		}

		beforeEval := evaluatePositionCached(client, candidate.Snapshot.Fen, 0, layerTwoEvalMultiPV, layerTwoMoveTime)
		if !isEvaluationAvailable(beforeEval) {
			continue
		}
		if sameUCIMove(candidate.Snapshot.MoveUCI, beforeEval.BestMove) {
			continue
		}

		isForcedMate, mateIn := isForcedMatePuzzle(beforeEval, candidate.MoveIsWhite)
		if !isForcedMate && !hasTacticalGap(beforeEval.Lines, candidate.MoveIsWhite, layerTwoMinGapCP) {
			continue
		}

		afterEval := evaluatePositionCached(client, candidate.Snapshot.AfterFen, layerOneEvalDepth, layerOneEvalMultiPV, 0)
		if !isEvaluationAvailable(afterEval) {
			continue
		}

		beforeWP := getWinProb(beforeEval.ScoreCP, beforeEval.Mate, candidate.MoveIsWhite)
		afterWP := getWinProb(afterEval.ScoreCP, afterEval.Mate, candidate.MoveIsWhite)
		cpDelta, _ := centipawnLoss(beforeEval.ScoreCP, afterEval.ScoreCP, candidate.MoveIsWhite)
		winProbDelta := winProbDrop(beforeWP, afterWP)

		category := puzzleCategoryForCandidate(isForcedMate, beforeWP, afterWP)
		issueType := types.MoveIssueType("")
		switch category {
		case PuzzleCategoryForcedMate:
			issueType = types.MoveIssueForcedMateMissed
		case PuzzleCategoryBlunder:
			issueType = types.MoveIssueBlunder
		default:
			issueType = classifyIssue(beforeWP, afterWP, &beforeEval, &afterEval, candidate.MoveIsWhite)
			if issueType == "" {
				if cpDelta >= puzzleBlunderCPLoss {
					issueType = types.MoveIssueBlunder
				} else {
					issueType = types.MoveIssueMistake
				}
			}
		}

		puzzle := buildPuzzle(candidate, beforeEval)
		puzzle.Category = category
		puzzle.IssueType = issueType
		puzzle.CPAfter = scoreOrZero(afterEval.ScoreCP)
		if category == PuzzleCategoryForcedMate {
			puzzle.MateIn = mateIn
			if len(beforeEval.Lines) > 0 && len(beforeEval.Lines[0].PV) > 0 {
				puzzle.PV = append([]string(nil), beforeEval.Lines[0].PV...)
				puzzle.Solution = normalizeUCIMove(beforeEval.Lines[0].PV[0])
			}
		}
		puzzles = append(puzzles, puzzle)
		lastPuzzleMoveIndex = candidate.Snapshot.MoveIndex

		issues = append(issues, types.MoveIssue{
			MoveIndex:      candidate.Snapshot.MoveIndex,
			MoveSAN:        candidate.Snapshot.MoveSAN,
			MoveUCI:        candidate.Snapshot.MoveUCI,
			Fen:            candidate.Snapshot.Fen,
			SideToMove:     candidate.Snapshot.SideToMove,
			PlayerColor:    candidate.Snapshot.PlayerColor,
			UserColor:      userColor,
			IssueType:      issueType,
			PlayedBestMove: false,
			BestMove:       beforeEval.BestMove,
			Ponder:         beforeEval.Ponder,
			PV:             append([]string(nil), beforeEval.PV...),
			Depth:          beforeEval.Depth,
			ScoreCP:        beforeEval.ScoreCP,
			Mate:           beforeEval.Mate,
			AfterScoreCP:   afterEval.ScoreCP,
			AfterMate:      afterEval.Mate,
			WinProbBefore:  beforeWP,
			WinProbAfter:   afterWP,
			CPDelta:        cpDelta,
			WinProbDelta:   winProbDelta,
		})
	}

	return issues, puzzles
}

func evaluatePositionCached(client *stockfish.Client, position string, depth int, multiPV int, moveTime time.Duration) types.EvalResult {
	cacheKey := evalCacheKey(position, depth, multiPV)
	if cached, ok := evalCache.Load(cacheKey); ok {
		return cloneEvalResult(cached.(types.EvalResult))
	}

	evalSem <- struct{}{}
	result, err := client.Evaluate(context.Background(), stockfish.EvalRequest{
		FEN:      position,
		Depth:    depth,
		MultiPV:  multiPV,
		MoveTime: moveTime,
	})
	<-evalSem

	if err != nil {
		fmt.Println("error while loading position:", err)
		fmt.Println(position)
		return types.EvalResult{}
	}

	normalizedScoreCP, normalizedMate := normalizeToWhitePerspective(position, result.ScoreCP, result.Mate)
	normalizedLines := normalizeEvalLinesToWhitePerspective(position, result.Lines)

	normalized := types.EvalResult{
		Ponder:   normalizeUCIMove(result.Ponder),
		BestMove: normalizeUCIMove(result.BestMove),
		PV:       append([]string(nil), result.PV...),
		Depth:    result.Depth,
		Mate:     normalizedMate,
		ScoreCP:  normalizedScoreCP,
		Lines:    normalizedLines,
	}

	evalCache.Store(cacheKey, cloneEvalResult(normalized))
	return normalized
}

func isEvaluationAvailable(eval types.EvalResult) bool {
	if eval.BestMove != "" || eval.Ponder != "" || len(eval.PV) > 0 || len(eval.Lines) > 0 {
		return true
	}
	return eval.ScoreCP != nil || eval.Mate != nil
}

func evalCacheKey(position string, depth int, multiPV int) string {
	return fmt.Sprintf("%s|d%d|mpv%d", position, depth, multiPV)
}

func isDecidedPosition(eval *types.EvalResult, moverIsWhite bool) bool {
	if eval == nil {
		return false
	}
	if eval.Mate != nil {
		state := mateStateForMover(eval.Mate, moverIsWhite)
		return state.BeingMated
	}
	cp, ok := moverCentipawn(eval.ScoreCP, moverIsWhite)
	if !ok {
		return false
	}
	return abs(cp) > layerOneDecidedCPBound
}

func hasTacticalGap(lines []types.EvalLine, moverIsWhite bool, minGap int) bool {
	if len(lines) < 2 {
		return false
	}
	lineOne := lines[0]
	lineTwo := lines[1]
	lineOneState := mateStateForMover(lineOne.Mate, moverIsWhite)
	lineTwoState := mateStateForMover(lineTwo.Mate, moverIsWhite)

	if lineOneState.ForcingMate && !lineTwoState.ForcingMate {
		return true
	}
	if !lineOneState.BeingMated && lineTwoState.BeingMated {
		return true
	}

	gap, ok := multiPVTopGap(lines, moverIsWhite)
	if !ok {
		return false
	}
	lineOneScore, okOne := evalLineScoreForMover(lineOne, moverIsWhite)
	if !okOne {
		return false
	}

	lineOneWP := evalLineWinProb(lineOne, moverIsWhite)
	lineTwoWP := evalLineWinProb(lineTwo, moverIsWhite)
	conditionA := lineOneScore >= layerTwoMinGapCP
	conditionB := gap >= minGap
	conditionC := (lineOneWP - lineTwoWP) >= layerTwoMinWPGap
	return conditionA && conditionB && conditionC
}

func isForcedMatePuzzle(eval types.EvalResult, moverIsWhite bool) (bool, int) {
	if eval.Mate == nil {
		return false, 0
	}
	state := mateStateForMover(eval.Mate, moverIsWhite)
	if !state.ForcingMate || state.BeingMated || state.Distance > forcedMateMaxDistance {
		return false, 0
	}
	return true, state.Distance
}

func isBlunderPuzzle(beforeWP float64, afterWP float64) bool {
	return beforeWP >= puzzleBlunderBeforeWP &&
		afterWP <= puzzleBlunderAfterWP &&
		winProbDrop(beforeWP, afterWP) >= puzzleBlunderWinProbDrop
}

func puzzleCategoryForCandidate(isForcedMate bool, beforeWP float64, afterWP float64) PuzzleCategory {
	if isForcedMate {
		return PuzzleCategoryForcedMate
	}
	if isBlunderPuzzle(beforeWP, afterWP) {
		return PuzzleCategoryBlunder
	}
	return PuzzleCategoryTactical
}

func shouldSkipForPuzzleCooldown(currentMoveIndex int, lastPuzzleMoveIndex int) bool {
	return currentMoveIndex-lastPuzzleMoveIndex < layerTwoCooldownMoves
}

func multiPVTopGap(lines []types.EvalLine, moverIsWhite bool) (int, bool) {
	if len(lines) < 2 {
		return 0, false
	}
	topScore, okTop := evalLineScoreForMover(lines[0], moverIsWhite)
	secondScore, okSecond := evalLineScoreForMover(lines[1], moverIsWhite)
	if !okTop || !okSecond {
		return 0, false
	}
	return topScore - secondScore, true
}

func evalLineScoreForMover(line types.EvalLine, moverIsWhite bool) (int, bool) {
	if line.Mate != nil {
		const mateEquivalentCP = 100000
		mate := *line.Mate
		if !moverIsWhite {
			mate = -mate
		}
		score := mateEquivalentCP - abs(mate)*100
		if score < 1 {
			score = 1
		}
		if mate < 0 {
			score = -score
		}
		return score, true
	}
	return moverCentipawn(line.ScoreCP, moverIsWhite)
}

func evalLineWinProb(line types.EvalLine, moverIsWhite bool) float64 {
	mateState := mateStateForMover(line.Mate, moverIsWhite)
	if mateState.ForcingMate {
		return 0.99
	}
	if mateState.BeingMated {
		return 0.01
	}

	score, ok := evalLineScoreForMover(line, moverIsWhite)
	if !ok {
		return 0.5
	}
	return cpToWinProb(score)
}

func buildPuzzle(candidate layerOneCandidate, deepEval types.EvalResult) Puzzle {
	gap, ok := multiPVTopGap(deepEval.Lines, candidate.MoveIsWhite)
	if !ok {
		gap = 0
	}

	solution := deepEval.BestMove
	if len(deepEval.Lines) > 0 && len(deepEval.Lines[0].PV) > 0 {
		solution = normalizeUCIMove(deepEval.Lines[0].PV[0])
	}
	return Puzzle{
		FEN:         candidate.Snapshot.Fen,
		Solution:    solution,
		PV:          append([]string(nil), deepEval.PV...),
		IssueType:   "",
		MultiPVGap:  gap,
		CPBefore:    scoreOrZero(deepEval.ScoreCP),
		CPAfter:     0,
		MoveIndex:   candidate.Snapshot.MoveIndex,
		PlayerColor: candidate.Snapshot.PlayerColor,
		SideToMove:  candidate.Snapshot.SideToMove,
	}
}

func scoreOrZero(scoreCP *int) int {
	if scoreCP == nil {
		return 0
	}
	return *scoreCP
}

func cloneEvalResult(input types.EvalResult) types.EvalResult {
	clone := types.EvalResult{
		Ponder:   input.Ponder,
		BestMove: input.BestMove,
		PV:       append([]string(nil), input.PV...),
		Depth:    input.Depth,
		Lines:    cloneEvalLines(input.Lines),
	}
	if input.ScoreCP != nil {
		cp := *input.ScoreCP
		clone.ScoreCP = &cp
	}
	if input.Mate != nil {
		mate := *input.Mate
		clone.Mate = &mate
	}
	return clone
}

func cloneEvalLines(lines []types.EvalLine) []types.EvalLine {
	if len(lines) == 0 {
		return nil
	}
	out := make([]types.EvalLine, 0, len(lines))
	for _, line := range lines {
		clonedLine := types.EvalLine{
			MultiPV: line.MultiPV,
			PV:      append([]string(nil), line.PV...),
			Depth:   line.Depth,
		}
		if line.ScoreCP != nil {
			cp := *line.ScoreCP
			clonedLine.ScoreCP = &cp
		}
		if line.Mate != nil {
			mate := *line.Mate
			clonedLine.Mate = &mate
		}
		out = append(out, clonedLine)
	}
	return out
}

func normalizeEvalLinesToWhitePerspective(fen string, lines []stockfish.EvalLine) []types.EvalLine {
	if len(lines) == 0 {
		return nil
	}
	parts := strings.Fields(fen)
	flipScore := len(parts) >= 2 && parts[1] == "b"

	normalized := make([]types.EvalLine, 0, len(lines))
	for _, line := range lines {
		normalizedLine := types.EvalLine{
			MultiPV: line.MultiPV,
			PV:      append([]string(nil), line.PV...),
			Depth:   line.Depth,
		}

		if line.ScoreCP != nil {
			cp := *line.ScoreCP
			if flipScore {
				cp = -cp
			}
			normalizedLine.ScoreCP = &cp
		}
		if line.Mate != nil {
			mate := *line.Mate
			if flipScore {
				mate = -mate
			}
			normalizedLine.Mate = &mate
		}

		normalized = append(normalized, normalizedLine)
	}

	sort.SliceStable(normalized, func(i int, j int) bool {
		left := normalized[i].MultiPV
		if left <= 0 {
			left = i + 1
		}
		right := normalized[j].MultiPV
		if right <= 0 {
			right = j + 1
		}
		return left < right
	})
	return normalized
}

func gameIDForLog(id string) string {
	if strings.TrimSpace(id) == "" {
		return "unknown"
	}
	return id
}

func min(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

func DiffEval(snapshots []moveSnapshot, evals []types.EvalResult, userIsWhite bool) []types.MoveIssue {
	if len(snapshots) == 0 || len(evals) < 2 {
		return nil
	}

	issues := make([]types.MoveIssue, 0)
	userColor := colorFromBool(userIsWhite)

	for idx, snapshot := range snapshots {
		if !snapshot.IsUserMove {
			continue
		}
		if idx+1 >= len(evals) {
			break
		}

		beforeEval := evals[idx]
		afterEval := evals[idx+1]
		moveIsWhite := snapshot.SideToMove == "w"

		beforeWP := getWinProb(beforeEval.ScoreCP, beforeEval.Mate, moveIsWhite)
		afterWP := getWinProb(afterEval.ScoreCP, afterEval.Mate, moveIsWhite)
		playedBestMove := sameUCIMove(snapshot.MoveUCI, beforeEval.BestMove)
		if playedBestMove {
			continue
		}

		issueType := classifyIssue(beforeWP, afterWP, &beforeEval, &afterEval, moveIsWhite)
		if issueType == "" {
			continue
		}
		cpDelta, _ := centipawnLoss(beforeEval.ScoreCP, afterEval.ScoreCP, moveIsWhite)
		winProbDelta := winProbDrop(beforeWP, afterWP)

		issues = append(issues, types.MoveIssue{
			MoveIndex:      snapshot.MoveIndex,
			MoveSAN:        snapshot.MoveSAN,
			MoveUCI:        snapshot.MoveUCI,
			Fen:            snapshot.Fen,
			SideToMove:     snapshot.SideToMove,
			PlayerColor:    snapshot.PlayerColor,
			UserColor:      userColor,
			IssueType:      issueType,
			PlayedBestMove: playedBestMove,
			BestMove:       beforeEval.BestMove,
			Ponder:         beforeEval.Ponder,
			PV:             append([]string(nil), beforeEval.PV...),
			Depth:          beforeEval.Depth,
			ScoreCP:        beforeEval.ScoreCP,
			Mate:           beforeEval.Mate,
			AfterScoreCP:   afterEval.ScoreCP,
			AfterMate:      afterEval.Mate,
			WinProbBefore:  beforeWP,
			WinProbAfter:   afterWP,
			CPDelta:        cpDelta,
			WinProbDelta:   winProbDelta,
		})
	}

	return issues
}

func classifyIssue(prevWP float64, curWP float64, prevEval *types.EvalResult, curEval *types.EvalResult, moveIsWhite bool) types.MoveIssueType {
	beforeMateState := mateStateForMover(prevEval.Mate, moveIsWhite)
	afterMateState := mateStateForMover(curEval.Mate, moveIsWhite)

	if beforeMateState.ForcingMate {
		if !afterMateState.ForcingMate || afterMateState.Distance > beforeMateState.Distance+1 {
			return types.MoveIssueForcedMateMissed
		}
		return ""
	}

	dropWP := winProbDrop(prevWP, curWP)
	cpLoss, hasCPLoss := centipawnLoss(prevEval.ScoreCP, curEval.ScoreCP, moveIsWhite)
	if isBlunder(dropWP, cpLoss, hasCPLoss) {
		return types.MoveIssueBlunder
	}
	if isLostAdvantage(prevWP, curWP, dropWP, cpLoss, hasCPLoss) {
		return types.MoveIssueLostAdvantage
	}
	if isMistake(dropWP, cpLoss, hasCPLoss) {
		return types.MoveIssueMistake
	}

	return ""
}

func isBlunder(dropWP float64, cpLoss int, hasCPLoss bool) bool {
	return hasCPLoss && dropWP >= puzzleBlunderWinProbDrop && cpLoss >= puzzleBlunderCPLoss
}

func isMistake(dropWP float64, cpLoss int, hasCPLoss bool) bool {
	return hasCPLoss && dropWP >= puzzleMistakeWinProbDrop && cpLoss >= puzzleMistakeCPLoss
}

func isLostAdvantage(prevWP float64, curWP float64, dropWP float64, cpLoss int, hasCPLoss bool) bool {
	if prevWP < puzzleLostAdvantageBeforeWP || curWP > puzzleLostAdvantageAfterWP || dropWP < puzzleLostAdvantageMinDrop {
		return false
	}
	if hasCPLoss && cpLoss < puzzleLostAdvantageMinCPLoss {
		return false
	}
	return true
}

func winProbDrop(prevWP float64, curWP float64) float64 {
	if curWP >= prevWP {
		return 0
	}
	return prevWP - curWP
}

func moverCentipawn(scoreCP *int, moverIsWhite bool) (int, bool) {
	if scoreCP == nil {
		return 0, false
	}
	cp := *scoreCP
	if !moverIsWhite {
		cp = -cp
	}
	return cp, true
}

func centipawnLoss(prevScoreCP *int, curScoreCP *int, moverIsWhite bool) (int, bool) {
	prevCP, okPrev := moverCentipawn(prevScoreCP, moverIsWhite)
	curCP, okCur := moverCentipawn(curScoreCP, moverIsWhite)
	if !okPrev || !okCur {
		return 0, false
	}

	loss := prevCP - curCP
	if loss < 0 {
		return 0, true
	}
	return loss, true
}

type mateState struct {
	ForcingMate bool
	BeingMated  bool
	Distance    int
}

func mateStateForMover(mate *int, moverIsWhite bool) mateState {
	if mate == nil {
		return mateState{}
	}

	value := *mate
	state := mateState{Distance: abs(value)}

	if moverIsWhite {
		state.ForcingMate = value > 0
		state.BeingMated = value < 0
		return state
	}

	state.ForcingMate = value < 0
	state.BeingMated = value > 0
	return state
}

func sanToUCI(position *lib.Position, moveSAN string) (string, error) {
	move, err := lib.AlgebraicNotation{}.Decode(position, moveSAN)
	if err != nil {
		return "", err
	}

	return normalizeUCIMove(lib.UCINotation{}.Encode(position, move)), nil
}

func sideToMoveFromFEN(fen string) string {
	parts := strings.Fields(fen)
	if len(parts) < 2 {
		return ""
	}
	if parts[1] == "w" || parts[1] == "b" {
		return parts[1]
	}
	return ""
}

func colorFromSide(side string) string {
	if side == "b" {
		return "black"
	}
	return "white"
}

func colorFromBool(isWhite bool) string {
	if isWhite {
		return "white"
	}
	return "black"
}

func normalizeUCIMove(move string) string {
	fields := strings.Fields(strings.ToLower(strings.TrimSpace(move)))
	if len(fields) == 0 {
		return ""
	}

	token := fields[0]
	if token == "bestmove" && len(fields) > 1 {
		token = fields[1]
	}
	if token == "(none)" || token == "none" {
		return ""
	}
	return token
}

func sameUCIMove(left string, right string) bool {
	return normalizeUCIMove(left) != "" && normalizeUCIMove(left) == normalizeUCIMove(right)
}

func normalizeToWhitePerspective(fen string, scoreCP *int, mate *int) (*int, *int) {
	parts := strings.Fields(fen)
	if len(parts) < 2 || parts[1] != "b" {
		return scoreCP, mate
	}

	var normalizedScore *int
	if scoreCP != nil {
		score := -*scoreCP
		normalizedScore = &score
	}

	var normalizedMate *int
	if mate != nil {
		m := -*mate
		normalizedMate = &m
	}

	return normalizedScore, normalizedMate
}

func getWinProb(scoreCP *int, mate *int, moverIsWhite bool) float64 {
	if mate != nil {
		m := *mate
		if !moverIsWhite {
			m = -m
		}
		return mateToWinProb(m)
	}

	if scoreCP != nil {
		cp := *scoreCP
		if !moverIsWhite {
			cp = -cp
		}
		return cpToWinProb(cp)
	}

	return 0.5
}

func mateToWinProb(mate int) float64 {
	if mate > 0 {
		return 1.0 - 0.0001*float64(abs(mate))
	}
	if mate < 0 {
		return 0.0001 * float64(abs(mate))
	}
	return 0.5
}

func cpToWinProb(cp int) float64 {
	const scale = 271.43
	x := float64(cp) / scale
	return 1.0 / (1.0 + math.Exp(-x))
}

func abs(num int) int {
	if num < 0 {
		return -num
	}
	return num
}
