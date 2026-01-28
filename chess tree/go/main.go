package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	WorkerCount = 4
	QueueSize   = 100
	JobTimeout  = 5 * time.Second
)

type PvLine struct {
	Depth string   `json:"depth"`
	Eval  string   `json:"eval"`
	Moves []string `json:"moves"`
}

type EvalRequest struct {
	Fen string `json:"fen"`
}

type EvalResult struct {
	Best interface{} `json:"best"`
	PV   PvLine      `json:"pv"`
	Err  error       `json:"-"`
}

type EvalJob struct {
	Fen    string
	Result chan EvalResult
}

type WorkerPool struct {
	jobQueue chan EvalJob
	ctx      context.Context
	cancel   context.CancelFunc
	wg       sync.WaitGroup
}

var pool *WorkerPool

func NewWorkerPool(workerCount, queueSize int) *WorkerPool {
	ctx, cancel := context.WithCancel(context.Background())
	wp := &WorkerPool{
		jobQueue: make(chan EvalJob, queueSize),
		ctx:      ctx,
		cancel:   cancel,
	}

	for i := 0; i < workerCount; i++ {
		wp.wg.Add(1)
		go wp.worker(i)
	}

	return wp
}

func (wp *WorkerPool) worker(id int) {
	defer wp.wg.Done()

	for {
		select {
		case <-wp.ctx.Done():
			fmt.Printf("[Worker %d] Shutting down\n", id)
			return
		case job, ok := <-wp.jobQueue:
			if !ok {
				return
			}
			best, pv := EvaluateFen(job.Fen)
			job.Result <- EvalResult{Best: best, PV: pv}
		}
	}
}

func (wp *WorkerPool) Submit(fen string) (EvalResult, error) {
	resultChan := make(chan EvalResult, 1)
	job := EvalJob{Fen: fen, Result: resultChan}

	select {
	case wp.jobQueue <- job:
	default:
		return EvalResult{}, fmt.Errorf("queue full, try again later")
	}

	select {
	case result := <-resultChan:
		return result, result.Err
	case <-time.After(JobTimeout):
		return EvalResult{}, fmt.Errorf("evaluation timeout")
	}
}

func (wp *WorkerPool) Shutdown() {
	wp.cancel()
	close(wp.jobQueue)
	wp.wg.Wait()
	fmt.Println("[WorkerPool] All workers stopped")
}

func main() {
	pool = NewWorkerPool(WorkerCount, QueueSize)

	// Graceful shutdown on SIGINT/SIGTERM
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	app := fiber.New(fiber.Config{
		DisableStartupMessage: false,
	})

	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"message": "server is up and running",
			"workers": WorkerCount,
			"queue":   len(pool.jobQueue),
		})
	})

	app.Post("/eval", func(c *fiber.Ctx) error {
		data := EvalRequest{}

		if err := c.BodyParser(&data); err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error": "failed to parse body",
			})
		}

		result, err := pool.Submit(data.Fen)
		if err != nil {
			if err.Error() == "queue full, try again later" {
				return c.Status(503).JSON(fiber.Map{
					"error": err.Error(),
				})
			}
			return c.Status(500).JSON(fiber.Map{
				"error": err.Error(),
			})
		}

		return c.JSON(fiber.Map{
			"best": result.Best,
			"pv":   result.PV,
		})
	})

	go func() {
		if err := app.Listen(":8080"); err != nil {
			fmt.Printf("Server error: %v\n", err)
		}
	}()

	<-sigChan
	fmt.Println("\nShutting down gracefully...")
	pool.Shutdown()
	app.Shutdown()
}

func EvaluateFen(fen string) (interface{}, PvLine) {
	trimmedInput := strings.TrimSpace(fen)
	cmd := exec.Command("stockfish")

	stdin, err := cmd.StdinPipe()
	if err != nil {
		panic(err)
	}

	defer func() {
		stdin.Close()
		cmd.Process.Kill()
		cmd.Wait()
	}()

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		panic(err)
	}

	cmd.Stderr = os.Stderr

	cmd.Start()

	fmt.Fprintln(stdin, "uci")

	fmt.Fprintln(stdin, "setoption name Threads value 1")
	fmt.Fprintln(stdin, "setoption name Ponder value false")
	fmt.Fprintln(stdin, "setoption name Hash value 100")
	fmt.Fprintln(stdin, "setoption name MultiPV value 1")
	fmt.Fprintln(stdin, "isready")

	fmt.Fprintln(stdin, "position fen "+trimmedInput)

	fmt.Fprintln(stdin, "go movetime 500")
	// fmt.Fprintln(stdin, "go depth 20"

	scanner := bufio.NewScanner(stdout)

	MoveData := PvLine{}
	for scanner.Scan() {

		line := scanner.Text()
		if strings.HasPrefix(line, "option") {
			continue
		} else if strings.HasPrefix(line, "bestmove") {
			data := strings.Fields(line)

			fmt.Println("the final line:", MoveData)

			type BestData struct {
				BestMove string `json:"bestmove"`
				Ponder   string `json:"ponder,omitempty"`
			}
			newObj := BestData{}
			if len(data) >= 2 {
				newObj.BestMove = data[1]
			}
			if len(data) >= 4 && data[2] == "ponder" {
				newObj.Ponder = data[3]
			}
			fmt.Printf("%+v\n", newObj)

			return newObj, MoveData
		}

		if strings.HasPrefix(line, "info") && strings.Contains(line, "pv") {
			data := strings.Fields(line)

			for i, p := range data {
				if p == "depth" {
					MoveData.Depth = data[i+1]
				} else if p == "cp" {
					MoveData.Eval = data[i+1]
				} else if p == "pv" {
					MoveData.Moves = data[i+1:]
				}
			}
		}

		linedata := strings.Fields(line)
		fmt.Println("SF", linedata)
	}
	cmd.Wait()
	return nil, MoveData
}
