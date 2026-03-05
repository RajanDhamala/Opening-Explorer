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

func PlayGame(moves []types.Move, client *stockfish.Client) {
	var wg sync.WaitGroup
	var mu sync.Mutex

	// limit concurrency to engine pool size
	sem := make(chan struct{}, 8)

	game := lib.NewGame()
	var gameData []types.PositonEval

	for _, item := range moves {
		err := game.PushNotationMove(item.San, lib.AlgebraicNotation{}, nil)
		if err != nil {
			fmt.Println("failed:", item.San)
		}

		position := game.Position().String()

		wg.Add(1)
		sem <- struct{}{}

		go func(pos string) {
			defer func() {
				<-sem
			}()

			result := EvalMe(&wg, client, pos, item.San)
			mu.Lock()
			gameData = append(gameData, *result)
			mu.Unlock()
		}(position)
	}
	fmt.Println("game result:", gameData)

	for _, item := range gameData {
		fmt.Println("move:", item.Move)
		fmt.Println("engine eval:", *item.Evaluation.ScoreCP)
	}

	wg.Wait()
	DiffEval(gameData)
}

func EvalMe(wg *sync.WaitGroup, client *stockfish.Client, position string, move string) *types.PositonEval {
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

	wg.Done()
	return &data
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

func DiffEval(eval []types.PositonEval) {
	fmt.Println("we want to detect the blunders and chances")
	var prevEval int = 0

	// var prepvMate int = 0
	for index, item := range eval {
		fmt.Println("BEST MOVE:", *&item.Evaluation.BestMove)
		fmt.Println("PLYED:", *&item.Move)
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
		diff := *item.Evaluation.ScoreCP - prevEval
		if prevEval > *item.Evaluation.ScoreCP {
			fmt.Println("advantage decrease vayo")
		} else {
			fmt.Println("advatage increase vayo hai")
		}
		fmt.Println("eval difference:", diff)
		prevEval = *item.Evaluation.ScoreCP
		fmt.Println("data:", *&item.Evaluation.PV)
	}
}
