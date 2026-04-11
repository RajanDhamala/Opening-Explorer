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
	FEN           string
	Solution      string
	PV            []string
	Category      PuzzleCategory
	MateIn        int
	IssueType     types.MoveIssueType
	MultiPVGap    float64
	CPBefore      int
	CPAfter       int
	MoveIndex     int
	PlayerColor   string
	SideToMove    string
	Depth         int // puzzle depth (ply pairs walked in Layer 3)
	MaterialStart int // material diff at puzzle start (player - opponent)
	MaterialEnd   int // material diff at puzzle end (after full PV)
}

type puzzleSequenceStep struct {
	Move      string
	HasSecond bool
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

	layerOneDecidedCPBound   = 500
	layerTwoMinGapCP         = 200
	layerTwoMinWinChancesGap = 12.0
	layerTwoCooldownMoves    = 6
	forcedMateMinDistance    = 1
	forcedMateMaxDistance    = 4

	// Layer 1 enhanced filtering thresholds
	layerOneComfortCPBound  = 400 // skip if |cp| > this (position already decided for one side)
	layerOneOpponentSwingCP = 150 // min CP swing from opponent move to indicate blunder opportunity
	layerOneMinCPDrop       = 150 // min CP drop for played move to be worth analyzing
	layerOneAfterEvalDepth  = 10  // shallow depth for after-FEN quick check
	layerOneMaterialAdvMax  = 3   // skip if player already up more than this in material

	puzzleMistakeCPLoss          = 100
	puzzleBlunderCPLoss          = 300
	puzzleLostAdvantageMinCPLoss = 120

	// Layer 3 puzzle sequence walker thresholds
	puzzleSequenceMinGap                     = 50 // cp gap for forced opponent reply
	puzzleSequenceMinWinChancesGap           = 12.0
	puzzleSequenceForcingGapWC               = 12.0
	puzzleSequenceSingleMoveMinWinChancesGap = 70.0
	puzzleSequenceMinAdvantageCP             = 200
	puzzleSequenceMinNonMateLength           = 2
	// Guardrails to stop extending PVs in already-decided positions.
	puzzleSequenceDecisiveWinChances = 80.0 // both lines at/above this (or symmetrically low) are treated as same-outcome
	puzzleSequenceComfortWinChances  = 70.0 // if second line remains this high in a decisive spot, continuation is not forced
	puzzleSequenceMaxDepth           = 7    // max ply pairs to walk
	puzzleMaterialLostLimit          = 9    // material units — position moot if deficit exceeds this
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

func buildEvalGameResult(item types.EvalGameInput, issues []types.MoveIssue) types.EvalGameResult {
	return types.EvalGameResult{
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
}

func PlayGamesStream(games []types.EvalGameInput, client *stockfish.Client) <-chan types.EvalGameResult {
	results := make(chan types.EvalGameResult, defaultGameWorkers)

	go func() {
		defer close(results)

		if client == nil || len(games) == 0 {
			return
		}

		total := len(games)
		workers := min(defaultGameWorkers, total)
		var wg sync.WaitGroup
		sem := make(chan struct{}, workers)
		var processed int32

		for _, game := range games {
			item := game
			wg.Add(1)
			sem <- struct{}{}

			go func() {
				defer func() {
					wg.Done()
					<-sem
				}()

				issues, _ := PlayGame(item.Moves, client, item.IsWhite)
				result := buildEvalGameResult(item, issues)
				done := atomic.AddInt32(&processed, 1)
				fmt.Printf("[eval] processed %d/%d games (id=%s, issues=%d)\n", done, total, gameIDForLog(item.GameID), len(issues))
				results <- result
			}()
		}

		wg.Wait()
	}()

	return results
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
			results[idx] = buildEvalGameResult(item, issues)

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

		// 4: Skip if position already too one-sided (|cp| > 400 from mover's perspective)
		cpBeforeFromMoverPerspective, hasCPBefore := moverCentipawn(beforeEval.ScoreCP, moveIsWhite)
		if hasCPBefore && abs(cpBeforeFromMoverPerspective) > layerOneComfortCPBound {
			continue
		}

		// 5: Skip if player already up material (not from disadvantage)
		whiteM, blackM := materialCount(window.Snapshot.Fen)
		var playerMat, opponentMat int
		if moveIsWhite {
			playerMat, opponentMat = whiteM, blackM
		} else {
			playerMat, opponentMat = blackM, whiteM
		}
		if playerMat-opponentMat > layerOneMaterialAdvMax {
			continue
		}

		// 6: Skip if the move was fine enough (small CP damage)
		afterEval := evaluatePositionCached(client, window.Snapshot.AfterFen, layerOneAfterEvalDepth, layerOneEvalMultiPV, 0)
		if isEvaluationAvailable(afterEval) {
			cpDrop, hasDrop := centipawnLoss(beforeEval.ScoreCP, afterEval.ScoreCP, moveIsWhite)
			if hasDrop && cpDrop < layerOneMinCPDrop {
				continue
			}
		}

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

		isForcedMate, mateIn, matingMoves := isForcedMatePuzzle(beforeEval, candidate.MoveIsWhite)
		if !isForcedMate && !hasTacticalGap(beforeEval.Lines, candidate.MoveIsWhite, layerTwoMinGapCP) {
			continue
		}

		afterEval := evaluatePositionCached(client, candidate.Snapshot.AfterFen, layerOneEvalDepth, layerOneEvalMultiPV, 0)
		if !isEvaluationAvailable(afterEval) {
			continue
		}

		cpDelta, _ := centipawnLoss(beforeEval.ScoreCP, afterEval.ScoreCP, candidate.MoveIsWhite)

		category := puzzleCategoryForCandidate(isForcedMate, cpDelta)
		issueType := types.MoveIssueType("")
		switch category {
		case PuzzleCategoryForcedMate:
			issueType = types.MoveIssueForcedMateMissed
		case PuzzleCategoryBlunder:
			issueType = types.MoveIssueBlunder
		default:
			issueType = classifyIssue(&beforeEval, &afterEval, candidate.MoveIsWhite)
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
			for _, line := range beforeEval.Lines {
				if len(line.PV) > 0 && normalizeUCIMove(line.PV[0]) == matingMoves[0] {
					puzzle.PV = append([]string(nil), line.PV...)
					puzzle.Solution = normalizeUCIMove(line.PV[0])
					break
				}
			}
		}
		persistedPV := fallbackIssuePV(puzzle, beforeEval)
		persistedSolution := []string{}

		// Layer 3: Validate puzzle sequence with forced continuations
		valid, trimmedPV, puzzleDepth, matStart, matEnd := walkPuzzleSequence(client, puzzle, candidate.MoveIsWhite)
		if !valid {
			// Still emit the MoveIssue, just skip the puzzle
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
				PV:             append([]string(nil), persistedPV...),
				Solution:       append([]string(nil), persistedSolution...),
				Depth:          beforeEval.Depth,
				ScoreCP:        beforeEval.ScoreCP,
				Mate:           beforeEval.Mate,
				AfterScoreCP:   afterEval.ScoreCP,
				AfterMate:      afterEval.Mate,
				CPDelta:        cpDelta,
			})
			continue
		}

		puzzle.PV = append([]string(nil), trimmedPV...)
		if len(trimmedPV) > 0 {
			puzzle.Solution = trimmedPV[0]
		}
		persistedSolution = normalizePVForStorage(trimmedPV)
		persistedPV = append([]string(nil), persistedSolution...)
		puzzle.Depth = puzzleDepth
		puzzle.MaterialStart = matStart
		puzzle.MaterialEnd = matEnd

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
			PV:             append([]string(nil), persistedPV...),
			Solution:       append([]string(nil), persistedSolution...),
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

	lineOneScore, okOne := evalLineScoreForMover(lineOne, moverIsWhite)
	if !okOne || lineOneScore < minGap {
		return false
	}

	forcedGap, hasForcedGap := forcedMoveWinChancesGap(lines, moverIsWhite, layerTwoMinWinChancesGap)
	if !hasForcedGap {
		return false
	}
	return forcedGap >= layerTwoMinWinChancesGap
}

func isForcedMatePuzzle(eval types.EvalResult, moverIsWhite bool) (bool, int, []string) {
	// If no mate info and no lines have mate — return false
	if eval.Mate == nil && len(eval.Lines) == 0 {
		return false, 0, nil
	}

	// Scan all lines — collect every line where the mover is forcing mate
	var matingLines []types.EvalLine
	minMateDistance := int(^uint(0) >> 1) // max int

	for _, line := range eval.Lines {
		state := mateStateForMover(line.Mate, moverIsWhite)
		if state.ForcingMate && !state.BeingMated {
			matingLines = append(matingLines, line)
			if state.Distance < minMateDistance {
				minMateDistance = state.Distance
			}
		}
	}

	// If no mating lines found, check eval.Mate as fallback
	if len(matingLines) == 0 {
		if eval.Mate == nil {
			return false, 0, nil
		}
		state := mateStateForMover(eval.Mate, moverIsWhite)
		if !state.ForcingMate || state.BeingMated || state.Distance < forcedMateMinDistance || state.Distance > forcedMateMaxDistance {
			return false, 0, nil
		}
		// Single mating line from eval.BestMove
		if eval.BestMove != "" {
			return true, state.Distance, []string{normalizeUCIMove(eval.BestMove)}
		}
		return false, 0, nil
	}

	// Filter to only lines where Distance == minMateDistance
	var optimalLines []types.EvalLine
	for _, line := range matingLines {
		state := mateStateForMover(line.Mate, moverIsWhite)
		if state.Distance == minMateDistance {
			optimalLines = append(optimalLines, line)
		}
	}

	// If minMateDistance is outside [forcedMateMinDistance, forcedMateMaxDistance], reject.
	if minMateDistance < forcedMateMinDistance || minMateDistance > forcedMateMaxDistance {
		return false, 0, nil
	}

	// Collect the first move UCI from each of those lines
	seen := make(map[string]bool)
	var validMoves []string
	for _, line := range optimalLines {
		if len(line.PV) > 0 {
			move := normalizeUCIMove(line.PV[0])
			if move != "" && !seen[move] {
				seen[move] = true
				validMoves = append(validMoves, move)
			}
		}
	}

	// If no valid moves — return false
	if len(validMoves) == 0 {
		return false, 0, nil
	}

	// If multiple distinct first moves all lead to mate in same distance — ambiguous puzzle, discard
	if len(validMoves) > 1 {
		return false, 0, nil
	}

	// Exactly one unique mating first move
	return true, minMateDistance, validMoves
}

// isBlunderPuzzle determines if a puzzle represents a blunder based on CP loss
func isBlunderPuzzle(cpDelta int) bool {
	return cpDelta >= puzzleBlunderCPLoss
}

func puzzleCategoryForCandidate(isForcedMate bool, cpDelta int) PuzzleCategory {
	if isForcedMate {
		return PuzzleCategoryForcedMate
	}
	if isBlunderPuzzle(cpDelta) {
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

func winChances(cp int) float64 {
	return 50 + 50*(2/(1+math.Exp(-0.00368208*float64(cp)))-1)
}

func winChancesForLine(line types.EvalLine, moverIsWhite bool) (float64, bool) {
	if line.Mate != nil {
		moverMate := *line.Mate
		if !moverIsWhite {
			moverMate = -moverMate
		}
		if moverMate > 0 {
			return 100.0, true
		}
		if moverMate < 0 {
			return 0.0, true
		}
	}

	cp, ok := moverCentipawn(line.ScoreCP, moverIsWhite)
	if !ok {
		return 0, false
	}
	return winChances(cp), true
}

func winChancesGap(lines []types.EvalLine, moverIsWhite bool) (float64, bool) {
	if len(lines) < 2 {
		return 0, false
	}
	topWC, okTop := winChancesForLine(lines[0], moverIsWhite)
	secondWC, okSecond := winChancesForLine(lines[1], moverIsWhite)
	if !okTop || !okSecond {
		return 0, false
	}
	return topWC - secondWC, true
}

func topTwoWinChances(lines []types.EvalLine, moverIsWhite bool) (float64, float64, bool) {
	if len(lines) < 2 {
		return 0, 0, false
	}
	topWC, okTop := winChancesForLine(lines[0], moverIsWhite)
	secondWC, okSecond := winChancesForLine(lines[1], moverIsWhite)
	if !okTop || !okSecond {
		return 0, 0, false
	}
	return topWC, secondWC, true
}

func isDecisiveSameOutcomeByWinChances(topWC float64, secondWC float64) bool {
	decisiveLoss := 100.0 - puzzleSequenceDecisiveWinChances
	if topWC >= puzzleSequenceDecisiveWinChances && secondWC >= puzzleSequenceDecisiveWinChances {
		return true
	}
	return topWC <= decisiveLoss && secondWC <= decisiveLoss
}

func secondLineKeepsComfortableOutcome(topWC float64, secondWC float64) bool {
	decisiveLoss := 100.0 - puzzleSequenceDecisiveWinChances
	comfortLoss := 100.0 - puzzleSequenceComfortWinChances
	if topWC >= puzzleSequenceDecisiveWinChances && secondWC >= puzzleSequenceComfortWinChances {
		return true
	}
	return topWC <= decisiveLoss && secondWC <= comfortLoss
}

func forcedMoveWinChancesGap(lines []types.EvalLine, moverIsWhite bool, minGap float64) (float64, bool) {
	if len(lines) < 2 {
		return 0, false
	}

	// Mate lines are always forced for continuation purposes.
	lineOneState := mateStateForMover(lines[0].Mate, moverIsWhite)
	if lineOneState.ForcingMate {
		return 100.0, true
	}

	topWC, secondWC, ok := topTwoWinChances(lines, moverIsWhite)
	if !ok {
		return 0, false
	}
	gap := topWC - secondWC
	if gap < minGap {
		return gap, false
	}
	if isDecisiveSameOutcomeByWinChances(topWC, secondWC) {
		return gap, false
	}
	if secondLineKeepsComfortableOutcome(topWC, secondWC) {
		return gap, false
	}
	return gap, true
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

func buildPuzzle(candidate layerOneCandidate, deepEval types.EvalResult) Puzzle {
	gap, ok := winChancesGap(deepEval.Lines, candidate.MoveIsWhite)
	if !ok {
		gap = 0.0
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

func fallbackIssuePV(puzzle Puzzle, eval types.EvalResult) []string {
	candidates := make([][]string, 0, 3)
	candidates = append(candidates, puzzle.PV)
	if len(eval.Lines) > 0 {
		candidates = append(candidates, eval.Lines[0].PV)
	}
	candidates = append(candidates, eval.PV)

	for _, pv := range candidates {
		normalized := normalizePVForStorage(pv)
		if len(normalized) > 0 {
			return normalized
		}
	}

	best := normalizeUCIMove(eval.BestMove)
	if best == "" {
		best = normalizeUCIMove(puzzle.Solution)
	}
	if best != "" {
		return []string{best}
	}
	return []string{}
}

func normalizePVForStorage(raw []string) []string {
	if len(raw) == 0 {
		return []string{}
	}
	normalized := make([]string, 0, len(raw))
	for _, move := range raw {
		token := normalizeUCIMove(move)
		if token != "" {
			normalized = append(normalized, token)
		}
	}
	if len(normalized) == 0 {
		return []string{}
	}
	return normalized
}

// walkPuzzleSequence follows the best line from the puzzle start and extends it
// while the puzzle side still has a forcing continuation. This mirrors the
// Lichess generator shape: validate "attack" only on the puzzle side's turns,
// accept the engine's best defense on the opponent turns, then trim the tail of
// advantage puzzles once the forcing property disappears.
func walkPuzzleSequence(client *stockfish.Client, puzzle Puzzle, puzzleSideIsWhite bool) (bool, []string, int, int, int) {
	if puzzle.Category == PuzzleCategoryForcedMate {
		return walkForcedMateSequence(client, puzzle, puzzleSideIsWhite)
	}
	return walkAdvantageSequence(client, puzzle, puzzleSideIsWhite)
}

func walkAdvantageSequence(client *stockfish.Client, puzzle Puzzle, puzzleSideIsWhite bool) (bool, []string, int, int, int) {
	matStart := materialDiffForPuzzleSide(puzzle.FEN, puzzleSideIsWhite)

	fenOpt, err := lib.FEN(puzzle.FEN)
	if err != nil {
		return false, nil, 0, 0, 0
	}
	game := lib.NewGame(fenOpt)

	steps := make([]puzzleSequenceStep, 0, puzzleSequenceMaxDepth*2-1)
	currentMatDiff := matStart
	maxPlies := puzzleSequenceMaxDepth*2 - 1

	for ply := 0; ply < maxPlies; ply++ {
		currentFEN := game.Position().String()
		eval := evaluatePositionCached(client, currentFEN, layerOneEvalDepth, layerTwoEvalMultiPV, 0)
		if !isEvaluationAvailable(eval) {
			break
		}
		if !hasSustainedWinningAdvantage(eval, puzzleSideIsWhite) {
			return false, nil, 0, matStart, currentMatDiff
		}

		puzzleTurn := sideToMoveFromFEN(currentFEN) == sideFromBool(puzzleSideIsWhite)
		if puzzleTurn && !isPuzzleSideForcingMove(eval, puzzleSideIsWhite) {
			break
		}

		nextMove := bestSequenceMove(eval, false, puzzleSideIsWhite)
		if nextMove == "" {
			break
		}

		move, err := lib.UCINotation{}.Decode(game.Position(), nextMove)
		if err != nil {
			break
		}
		if err := game.Move(move, nil); err != nil {
			break
		}

		steps = append(steps, puzzleSequenceStep{
			Move:      nextMove,
			HasSecond: hasSecondSequenceMove(eval),
		})

		currentMatDiff = materialDiffForPuzzleSide(game.Position().String(), puzzleSideIsWhite)
		if currentMatDiff < -puzzleMaterialLostLimit {
			return false, nil, 0, matStart, currentMatDiff
		}

		status := game.Position().Status()
		if status == lib.Checkmate {
			break
		}
		if status != lib.NoMethod {
			return false, nil, 0, matStart, currentMatDiff
		}
	}

	return finalizePuzzleSequence(puzzle, steps, matStart, currentMatDiff, puzzleSideIsWhite)
}

func walkForcedMateSequence(client *stockfish.Client, puzzle Puzzle, puzzleSideIsWhite bool) (bool, []string, int, int, int) {
	matStart := materialDiffForPuzzleSide(puzzle.FEN, puzzleSideIsWhite)

	fenOpt, err := lib.FEN(puzzle.FEN)
	if err != nil {
		return false, nil, 0, 0, 0
	}
	game := lib.NewGame(fenOpt)

	moves := make([]string, 0, forcedMateMaxDistance*2-1)
	currentMatDiff := matStart
	maxPlies := forcedMateMaxDistance*2 - 1

	for ply := 0; ply < maxPlies; ply++ {
		currentFEN := game.Position().String()
		eval := evaluatePositionCached(client, currentFEN, layerOneEvalDepth, layerTwoEvalMultiPV, 0)
		if !isEvaluationAvailable(eval) {
			return false, nil, 0, matStart, currentMatDiff
		}
		if !hasForcedMateContinuation(eval, puzzleSideIsWhite) {
			return false, nil, 0, matStart, currentMatDiff
		}

		puzzleTurn := sideToMoveFromFEN(currentFEN) == sideFromBool(puzzleSideIsWhite)
		if puzzleTurn {
			ok, _, _ := isForcedMatePuzzle(eval, puzzleSideIsWhite)
			if !ok {
				return false, nil, 0, matStart, currentMatDiff
			}
		}

		nextMove := bestSequenceMove(eval, puzzleTurn, puzzleSideIsWhite)
		if nextMove == "" {
			return false, nil, 0, matStart, currentMatDiff
		}

		move, err := lib.UCINotation{}.Decode(game.Position(), nextMove)
		if err != nil {
			return false, nil, 0, matStart, currentMatDiff
		}
		if err := game.Move(move, nil); err != nil {
			return false, nil, 0, matStart, currentMatDiff
		}

		moves = append(moves, nextMove)
		currentMatDiff = materialDiffForPuzzleSide(game.Position().String(), puzzleSideIsWhite)
		if currentMatDiff < -puzzleMaterialLostLimit {
			return false, nil, 0, matStart, currentMatDiff
		}

		status := game.Position().Status()
		if status == lib.Checkmate {
			return buildFinalPuzzleSequence(puzzle, moves, matStart, currentMatDiff, puzzleSideIsWhite)
		}
		if status != lib.NoMethod {
			return false, nil, 0, matStart, currentMatDiff
		}
	}

	return false, nil, 0, matStart, currentMatDiff
}

func hasSustainedWinningAdvantage(eval types.EvalResult, puzzleSideIsWhite bool) bool {
	if len(eval.Lines) > 0 {
		topLine := eval.Lines[0]
		topMateState := mateStateForMover(topLine.Mate, puzzleSideIsWhite)
		if topMateState.ForcingMate {
			return true
		}
		if topMateState.BeingMated {
			return false
		}
		score, ok := evalLineScoreForMover(topLine, puzzleSideIsWhite)
		if ok {
			return score >= puzzleSequenceMinAdvantageCP
		}
	}

	topMateState := mateStateForMover(eval.Mate, puzzleSideIsWhite)
	if topMateState.ForcingMate {
		return true
	}
	if topMateState.BeingMated {
		return false
	}

	cp, ok := moverCentipawn(eval.ScoreCP, puzzleSideIsWhite)
	if !ok {
		return false
	}
	return cp >= puzzleSequenceMinAdvantageCP
}

func hasForcedMateContinuation(eval types.EvalResult, puzzleSideIsWhite bool) bool {
	if len(eval.Lines) > 0 {
		state := mateStateForMover(eval.Lines[0].Mate, puzzleSideIsWhite)
		if state.ForcingMate && !state.BeingMated {
			return true
		}
	}

	state := mateStateForMover(eval.Mate, puzzleSideIsWhite)
	return state.ForcingMate && !state.BeingMated
}

func isPuzzleSideForcingMove(eval types.EvalResult, puzzleSideIsWhite bool) bool {
	if len(eval.Lines) == 0 {
		// No multi-pv line data; fallback to allowing the walk to continue.
		return true
	}

	lineOneState := mateStateForMover(eval.Lines[0].Mate, puzzleSideIsWhite)
	if lineOneState.ForcingMate {
		if len(eval.Lines) < 2 {
			return true
		}
		lineTwoState := mateStateForMover(eval.Lines[1].Mate, puzzleSideIsWhite)
		if !lineTwoState.ForcingMate {
			return true
		}
		return lineOneState.Distance < lineTwoState.Distance
	}

	if len(eval.Lines) < 2 {
		return false
	}

	topWC, okTop := winChancesForLine(eval.Lines[0], puzzleSideIsWhite)
	secondWC, okSecond := winChancesForLine(eval.Lines[1], puzzleSideIsWhite)
	if !okTop || !okSecond {
		return false
	}
	if isDecisiveSameOutcomeByWinChances(topWC, secondWC) {
		return false
	}

	return (topWC - secondWC) >= puzzleSequenceForcingGapWC
}

func isValidAdvantageAttack(eval types.EvalResult, puzzleSideIsWhite bool) bool {
	return isPuzzleSideForcingMove(eval, puzzleSideIsWhite)
}

func bestSequenceMove(eval types.EvalResult, requireForcedMate bool, puzzleSideIsWhite bool) string {
	if requireForcedMate {
		ok, _, matingMoves := isForcedMatePuzzle(eval, puzzleSideIsWhite)
		if ok && len(matingMoves) > 0 {
			return normalizeUCIMove(matingMoves[0])
		}
	}
	if len(eval.Lines) > 0 && len(eval.Lines[0].PV) > 0 {
		return normalizeUCIMove(eval.Lines[0].PV[0])
	}
	return normalizeUCIMove(eval.BestMove)
}

func hasSecondSequenceMove(eval types.EvalResult) bool {
	if len(eval.Lines) < 2 || len(eval.Lines[1].PV) == 0 {
		return false
	}
	return normalizeUCIMove(eval.Lines[1].PV[0]) != ""
}

func materialDiffForPuzzleSide(fen string, puzzleSideIsWhite bool) int {
	white, black := materialCount(fen)
	if puzzleSideIsWhite {
		return white - black
	}
	return black - white
}

func movesFromSequenceSteps(steps []puzzleSequenceStep) []string {
	moves := make([]string, 0, len(steps))
	for _, step := range steps {
		move := normalizeUCIMove(step.Move)
		if move != "" {
			moves = append(moves, move)
		}
	}
	return moves
}

func finalizePuzzleSequence(puzzle Puzzle, steps []puzzleSequenceStep, matStart int, fallbackMatEnd int, puzzleSideIsWhite bool) (bool, []string, int, int, int) {
	if len(steps) == 0 {
		return false, nil, 0, matStart, fallbackMatEnd
	}

	rawPV := movesFromSequenceSteps(steps)
	if len(rawPV) < puzzleSequenceMinNonMateLength {
		return false, nil, 0, matStart, fallbackMatEnd
	}

	return buildFinalPuzzleSequence(puzzle, rawPV, matStart, fallbackMatEnd, puzzleSideIsWhite)
}

func buildFinalPuzzleSequence(puzzle Puzzle, rawPV []string, matStart int, fallbackMatEnd int, puzzleSideIsWhite bool) (bool, []string, int, int, int) {
	if len(rawPV) == 0 {
		return false, nil, 0, matStart, fallbackMatEnd
	}

	trimmedPV := append([]string(nil), rawPV...)

	materialEnd := fallbackMatEnd
	if diff, ok := materialDiffAfterPV(puzzle.FEN, trimmedPV, puzzleSideIsWhite); ok {
		materialEnd = diff
	}
	depth := (len(trimmedPV) + 1) / 2
	return true, trimmedPV, depth, matStart, materialEnd
}

func materialDiffAfterPV(startFEN string, pv []string, puzzleSideIsWhite bool) (int, bool) {
	if len(pv) == 0 {
		return 0, false
	}

	fenOpt, err := lib.FEN(startFEN)
	if err != nil {
		return 0, false
	}
	game := lib.NewGame(fenOpt)
	for _, uci := range pv {
		move, err := lib.UCINotation{}.Decode(game.Position(), uci)
		if err != nil {
			return 0, false
		}
		if err := game.Move(move, nil); err != nil {
			return 0, false
		}
	}

	white, black := materialCount(game.Position().String())
	if puzzleSideIsWhite {
		return white - black, true
	}
	return black - white, true
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

		playedBestMove := sameUCIMove(snapshot.MoveUCI, beforeEval.BestMove)
		if playedBestMove {
			continue
		}

		issueType := classifyIssue(&beforeEval, &afterEval, moveIsWhite)
		if issueType == "" {
			continue
		}
		cpDelta, _ := centipawnLoss(beforeEval.ScoreCP, afterEval.ScoreCP, moveIsWhite)

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
			CPDelta:        cpDelta,
		})
	}

	return issues
}

func classifyIssue(prevEval *types.EvalResult, curEval *types.EvalResult, moveIsWhite bool) types.MoveIssueType {
	beforeMateState := mateStateForMover(prevEval.Mate, moveIsWhite)
	afterMateState := mateStateForMover(curEval.Mate, moveIsWhite)

	if beforeMateState.ForcingMate {
		if !afterMateState.ForcingMate || afterMateState.Distance > beforeMateState.Distance+1 {
			return types.MoveIssueForcedMateMissed
		}
		return ""
	}

	cpLoss, hasCPLoss := centipawnLoss(prevEval.ScoreCP, curEval.ScoreCP, moveIsWhite)
	if isBlunder(cpLoss, hasCPLoss) {
		return types.MoveIssueBlunder
	}
	if isLostAdvantage(prevEval.ScoreCP, curEval.ScoreCP, cpLoss, hasCPLoss, moveIsWhite) {
		return types.MoveIssueLostAdvantage
	}
	if isMistake(cpLoss, hasCPLoss) {
		return types.MoveIssueMistake
	}

	return ""
}

func isBlunder(cpLoss int, hasCPLoss bool) bool {
	return hasCPLoss && cpLoss >= puzzleBlunderCPLoss
}

func isMistake(cpLoss int, hasCPLoss bool) bool {
	return hasCPLoss && cpLoss >= puzzleMistakeCPLoss
}

func isLostAdvantage(prevScoreCP *int, curScoreCP *int, cpLoss int, hasCPLoss bool, moveIsWhite bool) bool {
	if !hasCPLoss || cpLoss < puzzleLostAdvantageMinCPLoss {
		return false
	}
	// Lost advantage: player had winning position (high CP) but now it's closer to equal/lost
	prevCP, okPrev := moverCentipawn(prevScoreCP, moveIsWhite)
	curCP, okCur := moverCentipawn(curScoreCP, moveIsWhite)
	if !okPrev || !okCur {
		return false
	}
	// Had clear advantage (>= 150cp) and dropped to near-equal or worse
	return prevCP >= 150 && curCP < 100
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

func sideFromBool(isWhite bool) string {
	if isWhite {
		return "w"
	}
	return "b"
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

func abs(num int) int {
	if num < 0 {
		return -num
	}
	return num
}

// materialCount calculates material count for white and black from a FEN string.
// Returns (whiteMaterial, blackMaterial) using standard piece values:
// Pawn=1, Knight/Bishop=3, Rook=5, Queen=9
func materialCount(fen string) (int, int) {
	white := 0
	black := 0
	board := strings.SplitN(fen, " ", 2)[0]

	for _, ch := range board {
		switch ch {
		case 'P':
			white = white + 1
		case 'Q':
			white = white + 9
		case 'N', 'B':
			white = white + 3
		case 'R':
			white = white + 5
		case 'p':
			black = black + 1
		case 'q':
			black = black + 9
		case 'n', 'b':
			black = black + 3
		case 'r':
			black = black + 5
		}
	}
	return white, black
}
