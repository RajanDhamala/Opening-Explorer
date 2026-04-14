package Routes

import (
	"chess/Controllers"
	"chess/Middlewares"
	"github.com/gofiber/fiber/v2"
)

func WoodpeakerRouter(app *fiber.App, controller *Controllers.Controller) {
	WoodpeakerRouter := app.Group("/woodpeaker")

	WoodpeakerRouter.Get("/", func(c *fiber.Ctx) error {
		return c.Status(200).JSON(fiber.Map{
			"message": "woodpeaker router is up",
		})
	})

	WoodpeakerRouter.Post("/init", middlewares.UserAuthenticate, controller.CreateWoodpeakerPuzzel)
	WoodpeakerRouter.Get("/list", middlewares.UserAuthenticate, controller.GetWoodpeakSetList)
	WoodpeakerRouter.Get("/item/:setId", middlewares.UserAuthenticate, controller.GetWoodpeakSetItem)
}
