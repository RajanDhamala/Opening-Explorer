package utils

import (
	"context"
	"fmt"

	stockfish "github.com/RajanDhamala/go-stockfish"
)

var Client *stockfish.Client

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

	Client = client
	return client, nil
}
