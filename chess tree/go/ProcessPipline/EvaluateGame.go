package Processpipline

import (
	"context"
	"fmt"
	"sync"
	"time"

	// "time"
	"chess/Types"

	stockfish "github.com/RajanDhamala/go-stockfish"

	lib "github.com/corentings/chess/v2"
)

func ConnectStockfish() (*stockfish.Client, error) {
	client, err := stockfish.New(context.Background(), stockfish.Config{
		PoolSize:         1,
		QueueSize:        16,
		PerEngineThreads: 1,
		TotalHashMB:      128,
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

	// limit concurrency to engine pool size
	sem := make(chan struct{}, 8)

	game := lib.NewGame()

	for _, item := range moves {
		err := game.PushNotationMove(item.San, lib.AlgebraicNotation{}, nil)
		if err != nil {
			fmt.Println("failed:", item.San)
		}

		position := game.Position().String()

		wg.Add(1)
		sem <- struct{}{}

		go func(pos string) {
			defer func() { <-sem }()

			EvalMe(&wg, client, pos)
		}(position)
	}

	wg.Wait()
}

func EvalMe(wg *sync.WaitGroup, client *stockfish.Client, position string) {
	result, err := client.Evaluate(context.Background(), stockfish.EvalRequest{
		FEN:      position,
		MoveTime: 150 * time.Millisecond,
		MultiPV:  1,
	})
	if err != nil {
		fmt.Println("error while loading postion:", err)
	}

	fmt.Println(result.BestMove)
	for _, line := range result.Lines {
		fmt.Printf("line=%d depth=%d pv=%v cp=%v mate=%v\n", line.MultiPV, line.Depth, line.PV, line.ScoreCP, line.Mate)
	}
	wg.Done()
}
