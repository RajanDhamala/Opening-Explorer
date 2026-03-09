package main

import (
	"fmt"

	"chess/Opening"
	"chess/ProcessPipline"
	"chess/Utils"

	stockfish "github.com/RajanDhamala/go-stockfish"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

var client *stockfish.Client

func main() {
	var err error
	client, err = Processpipline.ConnectStockfish() // assign to global variable
	if err != nil {
		fmt.Println("error while creating client:", err)
		return
	}

	app := fiber.New()
	opening.Loadtsv()
	app.Use(logger.New())
	app.Get("/", func(c *fiber.Ctx) error {
		fmt.Println("server is up btw")
		return c.Status(200).JSON(fiber.Map{
			"message": "server is up my friend",
		})
	})

	app.Get("/png", func(c *fiber.Ctx) error {
		fmt.Println("png route hitted")

		usrGames, err := utils.FetchProcess("tinku")
		if err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		username := "I_use_NVIM_Btw"
		utils.ParseAllGames(usrGames, username)
		// Processpipline.ProcessPipeline(png, moves, selectedGame)

		return c.Status(200).JSON(fiber.Map{
			"message": "we processed the pgn",
		})
	})

	app.Get("/arry", func(c *fiber.Ctx) error {
		games := Processpipline.HashMap
		fmt.Println("games:", games)
		return c.Status(200).JSON(fiber.Map{
			"message": "fetched the game data",
			"data":    games,
		})
	})

	type Postdata struct {
		Fen string `json:"fen"`
	}

	app.Post("/test", func(c *fiber.Ctx) error {
		data := Postdata{}
		err := c.BodyParser(&data)
		if err != nil {
			fmt.Println("failed to parse the body")
			return c.Status(400).JSON(fiber.Map{
				"error": "invalid data",
			})
		}
		fmt.Println("req:", data.Fen)
		resp := Processpipline.ReturnPosition(data.Fen)
		fmt.Println("data:", data)
		return c.Status(200).JSON(fiber.Map{
			"message": "welcome man",
			"data:":   resp,
		})
	})

	app.Get("/game/:id", func(c *fiber.Ctx) error {
		gameId := c.Params("id")
		data := Processpipline.GetGameData(gameId)
		if data == nil {
			return c.Status(400).JSON(fiber.Map{
				"error": "game not found",
			})
		}
		return c.Status(200).JSON(fiber.Map{
			"data":    data,
			"message": "game data found",
		})
	})

	app.Get("/eval", func(c *fiber.Ctx) error {
		fmt.Println("png route hitted")

		usrGames, err := utils.FetchProcess("tinku")
		if err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		username := "I_use_NVIM_Btw"
		moves, isWhite := utils.EvaluateGames(usrGames, username)
		Processpipline.PlayGame(moves, client, isWhite)

		// result, err := client.Evaluate(context.Background(), stockfish.EvalRequest{
		// 	FEN:      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		// 	MoveTime: 300 * time.Millisecond,
		// 	MultiPV:  3,
		// })
		// if err != nil { /* handle */
		// 	fmt.Println("error while evaluating positon")
		// }
		//
		// fmt.Println(result.BestMove) // top line (MultiPV=1)
		// for _, line := range result.Lines {
		// 	fmt.Printf("line=%d depth=%d pv=%v cp=%v mate=%v\n", line.MultiPV, line.Depth, line.PV, line.ScoreCP, line.Mate)
		// }

		return c.Status(200).JSON(fiber.Map{
			"message": "we evaluated the selectedGame",
			"data":    moves,
		})
	})

	app.Listen(":3030")
}
