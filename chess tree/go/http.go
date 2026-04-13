package main

import (
	"fmt"

	"chess/Controllers"
	// "chess/Opening"
	"chess/Database"
	"chess/Routes"
	"chess/Utils"
	"chess/internal/db"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	var err error
	dbPool, err := Database.ConnectDB()
	if err != nil {
		fmt.Println("error while connecting to database:", err)
		return
	}
	Database.DbPool = dbPool
	defer dbPool.Close()

	_, errs := utils.ConnectStockfish()
	if errs != nil {
		fmt.Println("error while starting Stockfish:", errs)
		return
	}
	controller := Controllers.NewController(db.New(dbPool), dbPool)

	app := fiber.New()
	// opening.Loadtsv()
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     "http://localhost:5173",
		AllowCredentials: true,
	}))

	app.Get("/", func(c *fiber.Ctx) error {
		fmt.Println("server is up btw")
		return c.Status(200).JSON(fiber.Map{
			"message": "server is up my friend",
		})
	})

	Routes.UserRouter(app, controller)
	Routes.GameRouter(app, controller)
	Routes.WoodpeakerRouter(app, controller)
	if err := app.Listen(":3030"); err != nil {
		fmt.Println("server failed to start:", err)
	}
}
