package Processpipline

import (
	"context"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"

	"chess/Types"

	stockfish "github.com/RajanDhamala/go-stockfish"

	lib "github.com/corentings/chess/v2"
)

func ConnectStockfish() (*stockfish.Client, error) {
	client, err := stockfish.New(context.Background(), stockfish.Config{
		PoolSize:         9,
		QueueSize:        16,
		PerEngineThreads: 1,
		TotalHashMB:      50,
		MaxMultiPV:       5,
	})
	if err != nil {
		fmt.Println("error while creating client")
		return nil, err
	}

	return client, nil
}

func PlayGame(moves []types.Move, client *stockfish.Client, isWhite bool) {
	var wg sync.WaitGroup

	// limit concurrency to engine pool size
	sem := make(chan struct{}, 8)

	game := lib.NewGame()

	gameData := make([]types.PositonEval, len(moves))

	for index, item := range moves {

		err := game.PushNotationMove(item.San, lib.AlgebraicNotation{}, nil)
		if err != nil {
			fmt.Println("failed:", item.San)
			continue
		}

		position := game.Position().String()

		wg.Add(1)
		sem <- struct{}{}

		go func(pos string, move string, moveIndex int) {
			defer func() {
				wg.Done()
				<-sem
			}()

			result, idx := EvalMe(client, pos, move, moveIndex)
			gameData[idx] = *result
		}(position, item.San, index)
	}

	wg.Wait()

	DiffEval(gameData, isWhite)
}

func EvalMe(client *stockfish.Client, position string, move string, index int) (*types.PositonEval, int) {
	result, err := client.Evaluate(context.Background(), stockfish.EvalRequest{
		FEN:      position,
		MoveTime: 1000 * time.Millisecond,
		MultiPV:  1,
	})
	if err != nil {
		fmt.Println("error while loading postion:", err)
	}
	normalizedScoreCP, normalizedMate := normalizeToWhitePerspective(position, result.ScoreCP, result.Mate)

	info := types.EvalResult{
		Ponder:   result.Ponder,
		BestMove: result.BestMove,
		PV:       result.PV,
		Depth:    result.Depth,
		Mate:     normalizedMate,
		ScoreCP:  normalizedScoreCP,
	}

	data := types.PositonEval{
		Fen:        position,
		Evaluation: info,
		Move:       move,
	}

	return &data, index
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

func WhoizWinning(mate int) {
	if mate < 0 {
		fmt.Println("black has mate")
	} else {
		fmt.Println("white has mate")
	}
}

func WhoizBetter(eval int) {
	if eval < 0 {
		fmt.Println("Black is better")
	} else {
		fmt.Println("White is better")
	}
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

	// No eval data, assume equal
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

func DiffEval(eval []types.PositonEval, isWhite bool) {
	fmt.Println("=== Game Evaluation ===")
	fmt.Printf("You are playing as: %s\n\n", map[bool]string{true: "White", false: "Black"}[isWhite])

	var prevEval *types.EvalResult

	for index, item := range eval {
		if item.Evaluation.ScoreCP == nil && item.Evaluation.Mate == nil {
			fmt.Printf("Move %d: %s - no eval data (skipped)\n", index+1, item.Move)
			prevEval = &item.Evaluation
			continue
		}

		moveIsWhite := index%2 == 0
		isUrTurn := moveIsWhite == isWhite
		color := "White"
		if !moveIsWhite {
			color = "Black"
		}

		if index == 0 || prevEval == nil || (prevEval.ScoreCP == nil && prevEval.Mate == nil) {
			evalStr := formatEval(item.Evaluation.ScoreCP, item.Evaluation.Mate)
			fmt.Printf("Move %d (%s): %s | Eval: %s", index+1, color, item.Move, evalStr)
			if isUrTurn {
				fmt.Printf(" [YOUR MOVE]")
			}
			fmt.Println()
			prevEval = &item.Evaluation
			continue
		}

		prevWP := getWinProb(prevEval.ScoreCP, prevEval.Mate, moveIsWhite)
		curWP := getWinProb(item.Evaluation.ScoreCP, item.Evaluation.Mate, moveIsWhite)

		label, missed := classifyMove(prevWP, curWP, prevEval, &item.Evaluation, moveIsWhite)

		prevStr := formatEval(prevEval.ScoreCP, prevEval.Mate)
		curStr := formatEval(item.Evaluation.ScoreCP, item.Evaluation.Mate)
		wpDelta := (curWP - prevWP) * 100

		fmt.Printf("Move %d (%s): %s | %s -> %s | WP%%: %.1f%%",
			index+1, color, item.Move, prevStr, curStr, wpDelta)

		if isUrTurn {
			fmt.Printf(" [YOUR MOVE]")
		}

		// Print classification
		fmt.Printf(" | %s", label)

		if missed {
			if isUrTurn {
				fmt.Printf(" (You missed a winning opportunity!)")
			} else {
				fmt.Printf(" (Opponent missed!)")
			}
		}

		if label == "Blunder" {
			if isUrTurn {
				fmt.Printf(" << YOU BLUNDERED")
			} else {
				fmt.Printf(" << OPPONENT BLUNDERED")
			}
		}

		if label == "Mistake" {
			if isUrTurn {
				fmt.Printf(" << YOUR MISTAKE")
			} else {
				fmt.Printf(" << OPPONENT MISTAKE")
			}
		}

		fmt.Println()

		prevEval = &item.Evaluation
	}
}

func classifyMove(prevWP float64, curWP float64, prevEval *types.EvalResult, curEval *types.EvalResult, moveIsWhite bool) (label string, missedOpportunity bool) {
	deltaWP := curWP - prevWP
	dropWP := -deltaWP

	isWinning := prevWP >= 0.90

	if isWinning {
		switch {
		case deltaWP >= 0.05:
			label = "Great move"
		case deltaWP >= -0.01:
			label = "Good move"
		case dropWP < 0.03:
			label = "Inaccuracy"
		case dropWP < 0.08:
			label = "Mistake"
		default:
			label = "Blunder"
		}
	} else {
		switch {
		case deltaWP >= 0.10:
			label = "Great move"
		case deltaWP >= -0.02:
			label = "Good move"
		case dropWP < 0.06:
			label = "Inaccuracy"
		case dropWP < 0.15:
			label = "Mistake"
		default:
			label = "Blunder"
		}
	}

	if deltaWP < 0 {
		const winningBeforeWP = 0.80
		const stillBetterAfterWP = 0.55
		const minDropWP = 0.05

		if prevWP >= winningBeforeWP && curWP >= stillBetterAfterWP && dropWP >= minDropWP {
			missedOpportunity = true
		}

		if prevEval.Mate != nil && curEval.Mate == nil {
			mateVal := *prevEval.Mate
			if moveIsWhite {
				if mateVal > 0 {
					missedOpportunity = true
				}
			} else {
				if mateVal < 0 {
					missedOpportunity = true
				}
			}
		}

		if prevEval.Mate != nil && curEval.Mate != nil {
			prevM := *prevEval.Mate
			curM := *curEval.Mate
			if moveIsWhite {
				if prevM > 0 && curM > 0 && curM > prevM+2 {
					missedOpportunity = true
				}
			} else {
				if prevM < 0 && curM < 0 && (-curM) > (-prevM)+2 {
					missedOpportunity = true
				}
			}
		}
	}

	return label, missedOpportunity
}

func formatEval(scoreCP *int, mate *int) string {
	if mate != nil {
		return fmt.Sprintf("M%d", *mate)
	}
	if scoreCP != nil {
		cp := *scoreCP
		sign := "+"
		if cp < 0 {
			sign = ""
		}
		return fmt.Sprintf("%s%.2f", sign, float64(cp)/100.0)
	}
	return "N/A"
}

func cpToWinProb(cp int) float64 {
	const scale = 271.43
	x := float64(cp) / scale
	return 1.0 / (1.0 + math.Exp(-x))
}

// helper
func abs(num int) int {
	if num < 0 {
		return -num
	}
	return num
}
