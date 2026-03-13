package Routes

import (
	"chess/Controllers"
	"chess/Middlewares"
	"github.com/gofiber/fiber/v2"
)

func UserRouter(app *fiber.App, controller *Controllers.Controller) {
	UserRouter := app.Group("/users")

	UserRouter.Get("/", func(c *fiber.Ctx) error {
		return c.Status(200).JSON(fiber.Map{
			"message": "user router is alive",
		})
	})

	UserRouter.Get("/me", middlewares.AuthMe)
	UserRouter.Post("/register", controller.RegisterUser)
	UserRouter.Post("/login", controller.LoginUser)
}
