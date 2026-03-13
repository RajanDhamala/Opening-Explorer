package Routes

import (
	"chess/Controllers"
	"chess/Middlewares"
	"github.com/gofiber/fiber/v2"
)

func GameRouter(app *fiber.App, controller *Controllers.Controller) {
	GameRouter := app.Group("/games")

	GameRouter.Get("/", func(c *fiber.Ctx) error {
		return c.Status(200).JSON(fiber.Map{
			"message": "game router is alive",
		})
	})

	GameRouter.Get("/process", middlewares.UserAuthenticate, controller.StartProcessing)

	GameRouter.Get("/list", middlewares.UserAuthenticate, controller.GetProcessedGames)
}
