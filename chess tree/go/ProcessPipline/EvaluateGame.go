package Processpipline

import (
	"chess/Types"
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

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
	Snapshot moveSnapshot
}

const (
	defaultSkipInitialPlies    = 10
	defaultMaxUserMovesPerGame = 40
	defaultGameWorkers         = 8
	defaultEvalMoveTime        = 500 * time.Millisecond
	defaultEvalConcurrency     = 8
	defaultEvalMultiPV         = 3

	puzzleMinCPLoss   = 150
	puzzleMajorCPLoss = 300

	puzzleMinWinProbDrop     = 0.12
	puzzleBlunderWinProbDrop = 0.25
	puzzleAmbiguousGapWP     = 0.14

	puzzleConversionBeforeWP  = 0.85
	puzzleConversionAfterWP   = 0.65
	puzzleConversionMinDrop   = 0.35
	puzzleConversionMinCPLoss = 300

	puzzleMissedOpportunityBeforeWP  = 0.88
	puzzleMissedOpportunityAfterWP   = 0.60
	puzzleMissedOpportunityMinDrop   = 0.18
	puzzleMissedOpportunityMinCPLoss = 250
)

var (
	evalCache sync.Map
	evalSem   = make(chan struct{}, defaultEvalConcurrency)
)

func PlayGame(moves []types.Move, client *stockfish.Client, isWhite bool) []types.MoveIssue {
	if client == nil || len(moves) == 0 {
		return nil
	}

	snapshots := prepareSnapshots(moves, isWhite)
	if len(snapshots) == 0 {
		return nil
	}

	windows := buildEvaluationWindows(snapshots, defaultSkipInitialPlies, defaultMaxUserMovesPerGame)
	if len(windows) == 0 {
		return nil
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

			issues := PlayGame(item.Moves, client, item.IsWhite)
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
	for _, snapshot := range snapshots {
		if !snapshot.IsUserMove {
			continue
		}
		if snapshot.MoveIndex <= skipInitialPlies {
			continue
		}
		if snapshot.IsBookMove {
			continue
		}
		windows = append(windows, evaluationWindow{Snapshot: snapshot})
		if maxUserMoves > 0 && len(windows) >= maxUserMoves {
			break
		}
	}
	return windows
}

func evaluateWindows(client *stockfish.Client, windows []evaluationWindow, userIsWhite bool) []types.MoveIssue {
	userColor := colorFromBool(userIsWhite)
	issues := make([]types.MoveIssue, 0, len(windows))

	for _, window := range windows {
		beforeEval := evaluatePositionCached(client, window.Snapshot.Fen)
		afterEval := evaluatePositionCached(client, window.Snapshot.AfterFen)

		moveIsWhite := window.Snapshot.SideToMove == "w"
		beforeWP := getWinProb(beforeEval.ScoreCP, beforeEval.Mate, moveIsWhite)
		afterWP := getWinProb(afterEval.ScoreCP, afterEval.Mate, moveIsWhite)
		playedBestMove := sameUCIMove(window.Snapshot.MoveUCI, beforeEval.BestMove)
		if playedBestMove || isNearEquivalentMove(window.Snapshot.MoveUCI, &beforeEval, moveIsWhite) {
			continue
		}

		issueType := classifyIssue(beforeWP, afterWP, &beforeEval, &afterEval, moveIsWhite, playedBestMove)
		if issueType == "" {
			continue
		}

		issues = append(issues, types.MoveIssue{
			MoveIndex:      window.Snapshot.MoveIndex,
			MoveSAN:        window.Snapshot.MoveSAN,
			MoveUCI:        window.Snapshot.MoveUCI,
			Fen:            window.Snapshot.Fen,
			SideToMove:     window.Snapshot.SideToMove,
			PlayerColor:    window.Snapshot.PlayerColor,
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
		})
	}

	return issues
}

func evaluatePositionCached(client *stockfish.Client, position string) types.EvalResult {
	if cached, ok := evalCache.Load(position); ok {
		return cloneEvalResult(cached.(types.EvalResult))
	}

	evalSem <- struct{}{}
	result, err := client.Evaluate(context.Background(), stockfish.EvalRequest{
		FEN:      position,
		MoveTime: defaultEvalMoveTime,
		MultiPV:  defaultEvalMultiPV,
	})
	<-evalSem

	if err != nil {
		fmt.Println("error while loading position:", err)
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

	evalCache.Store(position, cloneEvalResult(normalized))
	return normalized
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

func isNearEquivalentMove(playedMove string, eval *types.EvalResult, moverIsWhite bool) bool {
	played := normalizeUCIMove(playedMove)
	if played == "" || eval == nil {
		return false
	}
	if sameUCIMove(played, eval.BestMove) {
		return true
	}
	if len(eval.Lines) == 0 {
		return false
	}

	bestLine := eval.Lines[0]
	if len(bestLine.PV) == 0 {
		return false
	}
	bestMove := normalizeUCIMove(bestLine.PV[0])
	if bestMove == "" {
		bestMove = normalizeUCIMove(eval.BestMove)
	}
	bestWP := getWinProb(bestLine.ScoreCP, bestLine.Mate, moverIsWhite)

	for _, line := range eval.Lines {
		if len(line.PV) == 0 {
			continue
		}
		candidateMove := normalizeUCIMove(line.PV[0])
		if candidateMove == "" || candidateMove != played {
			continue
		}
		if bestMove != "" && candidateMove == bestMove {
			return true
		}
		candidateWP := getWinProb(line.ScoreCP, line.Mate, moverIsWhite)
		if bestWP-candidateWP <= puzzleAmbiguousGapWP {
			return true
		}
	}

	return false
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
		if playedBestMove || isNearEquivalentMove(snapshot.MoveUCI, &beforeEval, moveIsWhite) {
			continue
		}

		issueType := classifyIssue(beforeWP, afterWP, &beforeEval, &afterEval, moveIsWhite, playedBestMove)
		if issueType == "" {
			continue
		}

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
		})
	}

	return issues
}

func classifyIssue(prevWP float64, curWP float64, prevEval *types.EvalResult, curEval *types.EvalResult, moveIsWhite bool, playedBestMove bool) types.MoveIssueType {
	beforeMateState := mateStateForMover(prevEval.Mate, moveIsWhite)
	afterMateState := mateStateForMover(curEval.Mate, moveIsWhite)

	if beforeMateState.ForcingMate {
		if !afterMateState.ForcingMate || afterMateState.Distance > beforeMateState.Distance+2 {
			return types.MoveIssueForcedMateMissed
		}
		return ""
	}

	if beforeMateState.BeingMated {
		if !afterMateState.BeingMated {
			return ""
		}
		if afterMateState.Distance <= beforeMateState.Distance {
			return types.MoveIssueBeingMated
		}
		return ""
	}

	if playedBestMove {
		return ""
	}

	moveQuality := classifyMoveQuality(prevWP, curWP, prevEval, curEval, moveIsWhite)
	if moveQuality != "" {
		return moveQuality
	}

	if isMissedOpportunity(prevWP, curWP, prevEval, curEval, moveIsWhite) {
		return types.MoveIssueMissedOpportunity
	}

	return ""
}

func classifyMoveQuality(prevWP float64, curWP float64, prevEval *types.EvalResult, curEval *types.EvalResult, moveIsWhite bool) types.MoveIssueType {
	deltaWP := curWP - prevWP
	if deltaWP >= 0 {
		return ""
	}

	dropWP := -deltaWP
	cpLoss, hasCPLoss := centipawnLoss(prevEval.ScoreCP, curEval.ScoreCP, moveIsWhite)

	if prevWP >= puzzleConversionBeforeWP && curWP >= puzzleConversionAfterWP {
		if !hasCPLoss || cpLoss < puzzleConversionMinCPLoss || dropWP < puzzleConversionMinDrop {
			return ""
		}
		return types.MoveIssueBlunder
	}

	if hasCPLoss && cpLoss < puzzleMinCPLoss {
		return ""
	}
	if !hasCPLoss && dropWP < puzzleBlunderWinProbDrop {
		return ""
	}
	if dropWP < puzzleMinWinProbDrop {
		if !hasCPLoss || cpLoss < puzzleMajorCPLoss {
			return ""
		}
	}

	if dropWP >= puzzleBlunderWinProbDrop || (hasCPLoss && cpLoss >= puzzleMajorCPLoss) {
		return types.MoveIssueBlunder
	}

	if hasCPLoss && cpLoss >= puzzleMinCPLoss && dropWP >= puzzleMinWinProbDrop {
		return types.MoveIssueMistake
	}

	return ""
}

func isMissedOpportunity(prevWP float64, curWP float64, prevEval *types.EvalResult, curEval *types.EvalResult, moveIsWhite bool) bool {
	deltaWP := curWP - prevWP
	if deltaWP >= 0 {
		return false
	}
	dropWP := -deltaWP

	if prevWP < puzzleMissedOpportunityBeforeWP || curWP < puzzleMissedOpportunityAfterWP || dropWP < puzzleMissedOpportunityMinDrop {
		return false
	}

	cpLoss, hasCPLoss := centipawnLoss(prevEval.ScoreCP, curEval.ScoreCP, moveIsWhite)
	if hasCPLoss && cpLoss < puzzleMissedOpportunityMinCPLoss {
		return false
	}
	return true
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
