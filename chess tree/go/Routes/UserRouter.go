package Routes

import (
	"chess/Controllers"
	"chess/Middlewares"
	"github.com/gofiber/fiber/v2"
)

func UserRouter(app *fiber.App) {
	UserRouter := app.Group("/users")

	UserRouter.Get("/", func(c *fiber.Ctx) error {
		return c.Status(200).JSON(fiber.Map{
			"message": "user router is alive",
		})
	})

	UserRouter.Get("/me", middlewares.AuthMe)
	UserRouter.Post("/register", Controllers.RegisterUser)
	UserRouter.Post("/login", Controllers.LoginUser)
}
