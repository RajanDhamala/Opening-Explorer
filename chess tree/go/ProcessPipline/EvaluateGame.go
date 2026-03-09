package Processpipline

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	// "time"
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
	// var mu sync.Mutex

	// limit concurrency to engine pool size
	sem := make(chan struct{}, 8)

	game := lib.NewGame()
	// var gameData []types.PositonEval

	gameData := make([]types.PositonEval, len(moves))

	for index, item := range moves {
		err := game.PushNotationMove(item.San, lib.AlgebraicNotation{}, nil)
		if err != nil {
			fmt.Println("failed:", item.San)
		}

		position := game.Position().String()

		wg.Add(1)
		sem <- struct{}{}

		go func(pos string, move string, moveIndex int) {
			defer func() {
				wg.Done()
				<-sem
			}()

			result, index := EvalMe(client, pos, move, moveIndex)
			gameData[index] = *result
		}(position, item.San, index)
	}

	wg.Wait()
	fmt.Println("game result:", gameData)

	for _, item := range gameData {
		if item.Evaluation.ScoreCP == nil {
			fmt.Println("the positon eval is empty mate must be near")
			continue
		}
	}

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

func DiffEval(eval []types.PositonEval, isWhite bool) {
	fmt.Println("we want to detect the blunders and chances")
	var prevEval int = 0

	// var prepvMate int = 0
	for index, item := range eval {
		fmt.Print("MOVE PLAYED:", *&item.Move, "  ")
		fmt.Print("BEST REPLY:", *&item.Evaluation.BestMove, "  ")
		if item.Evaluation.ScoreCP == nil {
			fmt.Println("score cp is nill btw")
			continue
		}
		if item.Evaluation.ScoreCP == nil {
			fmt.Println("no eval forced mate found")
			WhoizWinning(*item.Evaluation.Mate)
			continue
		}
		if index == 0 {
			prevEval = *item.Evaluation.ScoreCP
			fmt.Println("inital eval:", prevEval)
			continue
		}
		// if index > 5 {
		// 	return
		// }
		diff := *item.Evaluation.ScoreCP - prevEval
		if prevEval > *item.Evaluation.ScoreCP {
			fmt.Println("advantage decrease vayo")
		} else {
			fmt.Println("advatage increase vayo hai")
		}
		fmt.Print("eval difference:", diff, "  ")
		fmt.Println("current eval:", *item.Evaluation.ScoreCP)
		prevEval = *item.Evaluation.ScoreCP
		if diff > 0 {
			// we know it is positive
			fmt.Print("diff increased")
			if diff < 40 {
				fmt.Println("decent move")
			} else if diff >= 70 {
				fmt.Println("mistake")
			} else if diff >= 40 {
				fmt.Println("inaccuracy")
			} else {
				fmt.Println("blunder")
			}

		} else if diff < 0 {
			// we know postion Difference went to minus
			fmt.Print("diff decrease")
		} else {
			// we know eval didnt changed btw
			fmt.Print("no diff eval remains constant")
		}
	}
}
