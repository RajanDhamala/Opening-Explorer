package Controllers

import (
	// "database/sql"
	"fmt"
	"strconv"

	"chess/ProcessPipline"
	// "chess/Types"
	"chess/Utils"
	"chess/internal/db"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func (ctrl *Controller) StartProcessing(c *fiber.Ctx) error {
	userClaims, ok := c.Locals("user").(*utils.JWTClaims)
	if !ok || userClaims == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}
	id, err := strconv.Atoi(userClaims.ID)
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid user id in token",
		})
	}
	if utils.Client == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "stockfish client not initialized",
		})
	}
	userID := int32(id)
	if userClaims.Email != "" {
		dbID, err := ctrl.queries.CheckIfusrExists(c.Context(), userClaims.Email)
		if err == nil {
			userID = dbID
		} else if err == pgx.ErrNoRows {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "user not found",
			})
		}
	}

	usrGames, err := utils.FetchProcess("tinku")
	if err != nil {
		fmt.Println("failed to fetch games:", err)
		return c.Status(400).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	username := "I_use_NVIM_Btw"
	evalGames := utils.EvaluateAllGames(usrGames, username)
	gameResults := Processpipline.PlayGames(evalGames, utils.Client)

	failedCount := 0
	successCount := 0

	totalIssues := 0
	gamesWithIssues := 0
	for _, item := range gameResults {
		totalIssues += item.IssueCount

		if item.IssueCount > 0 {
			gamesWithIssues++
		}

		var gameID pgtype.UUID
		if err := gameID.Scan(item.GameID); err != nil {
			failedCount++
			fmt.Println("failed to parse game id:", err)
			continue
		}

		err := ctrl.queries.CreateGame(c.Context(), db.CreateGameParams{
			ID:            gameID,
			Gameurl:       item.GameURL,
			Whiteusername: item.WhiteUsername,
			Blackusername: item.BlackUsername,
			Whiterating:   int32(item.WhiteRating),
			Blackrating:   int32(item.BlackRating),
			Playercolor:   item.PlayerColor,
			Timeclass:     item.TimeClass,
			Result:        item.Result,
			Issuecount:    int32(item.IssueCount),
			UserID:        userID,
		})

		if err != nil {
			failedCount++
			fmt.Println("failed to insert game:", err)
		} else {
			successCount++
		}
	}

	return c.Status(200).JSON(fiber.Map{
		"message":          "we evaluated all fetched games",
		"data":             gameResults,
		"total":            totalIssues,
		"processed_games":  len(gameResults),
		"games_with_issue": gamesWithIssues,
		"dbfailed":         failedCount,
		"dbsuccess":        successCount,
	})
}

func (ctrl *Controller) GetProcessedGames(c *fiber.Ctx) error {
	userClaims, ok := c.Locals("user").(*utils.JWTClaims)
	if !ok || userClaims == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}
	id, err := strconv.Atoi(userClaims.ID)
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid user id in token",
		})
	}
	game, err := ctrl.queries.GetYourGame(c.Context(), int32(id))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "failed to fetch game",
		})
	}
	return c.Status(200).JSON(fiber.Map{
		"message": "fetched game data successfully",
		"data":    game,
	})
}
