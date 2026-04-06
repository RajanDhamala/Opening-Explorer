package Routes

import (
	"chess/Controllers"
	"chess/Middlewares"
	"chess/Utils"
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

	GameRouter.Get("/issues/:game_id", middlewares.UserAuthenticate, controller.GetGameIssues)
	GameRouter.Get("/puzzles", middlewares.UserAuthenticate, controller.GetUserPuzzles)
	GameRouter.Get("/puzzles/:type", middlewares.UserAuthenticate, controller.GetPuzzlesByType)
	GameRouter.Post("/eval", controller.EvalPostion)

	GameRouter.Post("/count", func(c *fiber.Ctx) error {
		type Reqtype struct {
			Fen string `json:"fen"`
		}
		data := Reqtype{}
		if err := c.BodyParser(&data); err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error": "unbale to parse the body",
			})
		}
		white, black := utils.MaterialCount(data.Fen)
		return c.Status(200).JSON(fiber.Map{
			"message": "successfully evaluated postion",
			"white":   white,
			"black":   black,
		})
	})
}
