package main

import (
	"bufio"
	"fmt"
	"os/exec"
	"strings"

	"github.com/gofiber/fiber/v2"
)

type evalRequest struct {
	FEN string `json:"fen"`
}

type PVLine struct {
	Moves     []string   `json:"moves"`     // full UCI moves, e.g., e2e4
	Score     int        `json:"score"`     // centipawn score
	Top5Pairs [][]string `json:"top5Pairs"` // top 5 moves as pairs: [[m1,m2],[m3,m4],[m5]]
}

func main() {
	app := fiber.New()

	app.Post("/eval", func(c *fiber.Ctx) error {
		data := evalRequest{}
		if err := c.BodyParser(&data); err != nil {
			fmt.Println("failed to parse the body")
			return c.Status(400).JSON(fiber.Map{
				"error": "failed to parse body",
			})
		}

		topLines, err := getTop3Lines(data.FEN)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error": "engine error: " + err.Error(),
			})
		}

		return c.Status(200).JSON(topLines)
	})

	app.Listen(":8080")
}

func getTop3Lines(fen string) ([]PVLine, error) {
	cmd := exec.Command("stockfish")
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	scanner := bufio.NewScanner(stdout)

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	// Engine options
	fmt.Fprintln(stdin, "uci")
	fmt.Fprintln(stdin, "setoption name Threads value 8")
	fmt.Fprintln(stdin, "setoption name Hash value 2048")
	fmt.Fprintln(stdin, "setoption name Skill Level value 20")
	fmt.Fprintln(stdin, "setoption name MultiPV value 3")
	fmt.Fprintln(stdin, "isready")

	// Set the position
	fmt.Fprintf(stdin, "position fen %s\n", fen)
	fmt.Fprintln(stdin, "isready")

	// fmt.Fprintln(stdin, "go depth 20")
	fmt.Fprintln(stdin, "go movetime 2000")

	pvMap := make(map[int]PVLine)

	for scanner.Scan() {
		line := scanner.Text()

		if strings.Contains(line, " pv ") {
			parts := strings.Fields(line)
			score := 0
			moves := []string{}
			multipv := 1

			for i, p := range parts {
				if p == "multipv" && i+1 < len(parts) {
					fmt.Sscanf(parts[i+1], "%d", &multipv)
				}
				if p == "score" && i+2 < len(parts) && parts[i+1] == "cp" {
					fmt.Sscanf(parts[i+2], "%d", &score)
				}
				if p == "pv" && i+1 < len(parts) {
					for j := i + 1; j < len(parts) && len(moves) < 20; j++ {
						moves = append(moves, parts[j])
					}
					break
				}
			}

			top5Pairs := [][]string{}
			for i := 0; i < 5 && i*2 < len(moves); i++ {
				pair := []string{}
				if i*2 < len(moves) {
					pair = append(pair, moves[i*2])
				}
				if i*2+1 < len(moves) {
					pair = append(pair, moves[i*2+1])
				}
				if len(pair) > 0 {
					top5Pairs = append(top5Pairs, pair)
				}
			}

			pvMap[multipv] = PVLine{
				Moves:     moves,
				Score:     score,
				Top5Pairs: top5Pairs,
			}
		}

		if strings.HasPrefix(line, "bestmove") {
			break
		}
	}

	// Collect top 3 lines in order
	var topLines []PVLine
	for i := 1; i <= 3; i++ {
		if pv, ok := pvMap[i]; ok {
			topLines = append(topLines, pv)
		}
	}

	fmt.Fprintln(stdin, "quit")
	cmd.Wait()
	return topLines, nil
}
