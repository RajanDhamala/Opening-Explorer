package main

import (
	"fmt"

	"chess/Opening"
	"chess/ProcessPipline"
	"chess/Utils"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

func main() {
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

	app.Listen(":3030")
}
