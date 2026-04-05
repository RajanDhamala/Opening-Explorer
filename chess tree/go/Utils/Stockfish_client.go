package utils

import (
	"context"
	"fmt"
	"time"

	stockfish "github.com/RajanDhamala/go-stockfish"
)

var Client *stockfish.Client

func ConnectStockfish() (*stockfish.Client, error) {
	client, err := stockfish.New(context.Background(), stockfish.Config{
		PoolSize:         8,
		QueueSize:        16,
		PerEngineThreads: 1,
		TotalHashMB:      256,
		MaxMultiPV:       5,
		JobTimeout:       10 * time.Second,
	})
	if err != nil {
		fmt.Println("error while creating client")
		return nil, err
	}

	Client = client
	return client, nil
}
