package main

import (
	"fmt"

	"chess/ProcessPipline"
	"chess/Utils"
	"github.com/gofiber/fiber/v2"
)

func main() {
	app := fiber.New()

	app.Get("/", func(c *fiber.Ctx) error {
		fmt.Println("server is up btw")
		return c.Status(200).JSON(fiber.Map{
			"message": "server is up my friend",
		})
	})

	app.Get("/png", func(c *fiber.Ctx) error {
		fmt.Println("png route hitted")

		png, moves, err := utils.FetchProcess()
		if err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error": err.Error(),
			})
		}

		Processpipline.ProcessPipeline(png, moves)

		return c.Status(200).JSON(fiber.Map{
			"message": "we processed the pgn",
		})
	})

	app.Listen(":3030")
}
