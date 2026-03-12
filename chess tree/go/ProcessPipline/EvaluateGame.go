package Processpipline

import (
	"chess/Types"
	"context"
	"fmt"
	"math"
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
	defaultEvalMoveTime        = 250 * time.Millisecond
	defaultEvalConcurrency     = 8
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
		MultiPV:  1,
	})
	<-evalSem

	if err != nil {
		fmt.Println("error while loading position:", err)
		return types.EvalResult{}
	}

	normalizedScoreCP, normalizedMate := normalizeToWhitePerspective(position, result.ScoreCP, result.Mate)

	normalized := types.EvalResult{
		Ponder:   normalizeUCIMove(result.Ponder),
		BestMove: normalizeUCIMove(result.BestMove),
		PV:       append([]string(nil), result.PV...),
		Depth:    result.Depth,
		Mate:     normalizedMate,
		ScoreCP:  normalizedScoreCP,
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
		return types.MoveIssueForcedMate
	}

	if beforeMateState.BeingMated {
		return types.MoveIssueBeingMated
	}

	if playedBestMove {
		return ""
	}

	moveQuality := classifyMoveQuality(prevWP, curWP, prevEval, curEval, moveIsWhite)
	if moveQuality != "" {
		if moveQuality == types.MoveIssueInaccuracy && isMissedOpportunity(prevWP, curWP) {
			return types.MoveIssueMissedOpportunity
		}
		return moveQuality
	}

	if isMissedOpportunity(prevWP, curWP) {
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
	prevCP, hasPrevCP := moverCentipawn(prevEval.ScoreCP, moveIsWhite)
	curCP, hasCurCP := moverCentipawn(curEval.ScoreCP, moveIsWhite)

	if hasCPLoss && hasPrevCP && hasCurCP {
		// Conversion mode: when already clearly winning and still winning,
		// avoid over-flagging small eval dips.
		if prevCP >= 600 && curCP >= 500 {
			switch {
			case cpLoss < 250 || dropWP < 0.06:
				return ""
			case cpLoss < 400 && dropWP < 0.12:
				return types.MoveIssueInaccuracy
			case cpLoss < 650 && dropWP < 0.22:
				return types.MoveIssueMistake
			default:
				return types.MoveIssueBlunder
			}
		}

		if prevCP >= 350 && curCP >= 200 {
			switch {
			case cpLoss < 160 || dropWP < 0.04:
				return ""
			case cpLoss < 280 && dropWP < 0.10:
				return types.MoveIssueInaccuracy
			case cpLoss < 500 && dropWP < 0.18:
				return types.MoveIssueMistake
			default:
				return types.MoveIssueBlunder
			}
		}
	}

	if prevWP >= 0.90 {
		if deltaWP >= -0.02 {
			return ""
		}
		switch {
		case dropWP < 0.05:
			return types.MoveIssueInaccuracy
		case dropWP < 0.12:
			return types.MoveIssueMistake
		default:
			return types.MoveIssueBlunder
		}
	}

	if deltaWP >= -0.02 {
		return ""
	}
	switch {
	case dropWP < 0.06:
		return types.MoveIssueInaccuracy
	case dropWP < 0.15:
		return types.MoveIssueMistake
	default:
		return types.MoveIssueBlunder
	}
}

func isMissedOpportunity(prevWP float64, curWP float64) bool {
	deltaWP := curWP - prevWP
	if deltaWP >= 0 {
		return false
	}
	dropWP := -deltaWP

	const winningBeforeWP = 0.80
	const stillBetterAfterWP = 0.55
	const minDropWP = 0.05

	return prevWP >= winningBeforeWP && curWP >= stillBetterAfterWP && dropWP >= minDropWP
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
