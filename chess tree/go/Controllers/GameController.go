package Controllers

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"chess/Database"
	"chess/ProcessPipline"
	"chess/Types"
	"chess/Utils"
	"chess/internal/db"

	stockfish "github.com/RajanDhamala/go-stockfish"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
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
	username := "NbcWala"
	evalGames := utils.EvaluateAllGames(usrGames, username)
	gameResults := Processpipline.PlayGames(evalGames, utils.Client)

	failedCount := 0
	successCount := 0

	totalIssues := 0
	gamesWithIssues := 0

	ids := make([]pgtype.UUID, 0, len(gameResults))
	gameurls := make([]string, 0, len(gameResults))
	whiteusernames := make([]string, 0, len(gameResults))
	blackusernames := make([]string, 0, len(gameResults))
	whiteratings := make([]int32, 0, len(gameResults))
	blackratings := make([]int32, 0, len(gameResults))
	playercolors := make([]string, 0, len(gameResults))
	timeclasses := make([]string, 0, len(gameResults))
	results := make([]string, 0, len(gameResults))
	issuecounts := make([]int32, 0, len(gameResults))
	userids := make([]int32, 0, len(gameResults))

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

		ids = append(ids, gameID)
		gameurls = append(gameurls, item.GameURL)
		whiteusernames = append(whiteusernames, item.WhiteUsername)
		blackusernames = append(blackusernames, item.BlackUsername)
		whiteratings = append(whiteratings, int32(item.WhiteRating))
		blackratings = append(blackratings, int32(item.BlackRating))
		playercolors = append(playercolors, item.PlayerColor)
		timeclasses = append(timeclasses, item.TimeClass)
		results = append(results, item.Result)
		issuecounts = append(issuecounts, int32(item.IssueCount))
		userids = append(userids, userID)
	}

	if len(ids) > 0 {
		err := ctrl.queries.CreateGamesBulk(c.Context(), db.CreateGamesBulkParams{
			Ids:            ids,
			Gameurls:       gameurls,
			Whiteusernames: whiteusernames,
			Blackusernames: blackusernames,
			Whiteratings:   whiteratings,
			Blackratings:   blackratings,
			Playercolors:   playercolors,
			Timeclasses:    timeclasses,
			Results:        results,
			Issuecounts:    issuecounts,
			Userids:        userids,
		})
		if err != nil {
			failedCount += len(ids)
			fmt.Println("failed to bulk upsert games:", err)
		} else {
			successCount += len(ids)
		}
	}

	// Bulk insert issues using pgx CopyFrom
	issueInsertCount := int64(0)
	issueFailedCount := 0
	if totalIssues > 0 {
		issueRows := make([]types.IssueRow, 0, totalIssues)
		for _, gameResult := range gameResults {
			if len(gameResult.Issues) == 0 {
				continue
			}
			var gameUUID [16]byte
			parsed, err := uuid.Parse(gameResult.GameID)
			if err != nil {
				fmt.Println("failed to parse game UUID for issues:", err)
				issueFailedCount += len(gameResult.Issues)
				continue
			}
			gameUUID = parsed

			for _, issue := range gameResult.Issues {
				issueUUID := uuid.New()
				row := types.MoveIssueToRow(issue, issueUUID, gameUUID)
				issueRows = append(issueRows, row)
			}
		}

		if len(issueRows) > 0 {
			inserted, err := Database.BulkInsertIssues(c.Context(), ctrl.pool, issueRows)
			if err != nil {
				fmt.Println("failed to bulk insert issues:", err)
				issueFailedCount += len(issueRows)
			} else {
				issueInsertCount = inserted
			}
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
		"issues_inserted":  issueInsertCount,
		"issues_failed":    issueFailedCount,
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

// GetGameIssues returns all issues/puzzles for a specific game
func (ctrl *Controller) GetGameIssues(c *fiber.Ctx) error {
	userClaims, ok := c.Locals("user").(*utils.JWTClaims)
	if !ok || userClaims == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}

	gameIDStr := c.Params("game_id")
	if gameIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "game_id is required",
		})
	}

	var gameID pgtype.UUID
	if err := gameID.Scan(gameIDStr); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid game_id format",
		})
	}

	issues, err := ctrl.queries.GetIssues(c.Context(), gameID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to fetch issues",
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"message": "issues fetched successfully",
		"game_id": gameIDStr,
		"count":   len(issues),
		"issues":  issues,
	})
}

// GetUserPuzzles returns all puzzles/issues for the authenticated user
func (ctrl *Controller) GetUserPuzzles(c *fiber.Ctx) error {
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

	issues, err := ctrl.queries.GetUserIssues(c.Context(), int32(id))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to fetch puzzles",
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"message": "puzzles fetched successfully",
		"total":   len(issues),
		"puzzles": issues,
	})
}

// GetPuzzlesByType returns puzzles filtered by issue type (blunder, mistake, etc.)
func (ctrl *Controller) GetPuzzlesByType(c *fiber.Ctx) error {
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

	issueType := c.Params("type")
	if issueType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "issue type is required",
		})
	}

	issues, err := ctrl.queries.GetPuzzlesByType(c.Context(), db.GetPuzzlesByTypeParams{
		UserID:    int32(id),
		Issuetype: issueType,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to fetch puzzles",
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"message":    "puzzles fetched successfully",
		"issue_type": issueType,
		"total":      len(issues),
		"puzzles":    issues,
	})
}

type EvalRequest struct {
	FEN string `json:"fen"`
}

type EvalLineResponse struct {
	MultiPV int      `json:"multipv"`
	PV      []string `json:"pv"`
	Depth   int      `json:"depth"`
	ScoreCP *int     `json:"score_cp"`
	Mate    *int     `json:"mate"`
}

func (ctrl *Controller) EvalPostion(c *fiber.Ctx) error {
	var req EvalRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}
	req.FEN = strings.TrimSpace(req.FEN)
	if req.FEN == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "fen is required",
		})
	}
	if utils.Client == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "stockfish client not initialized",
		})
	}

	evalCtx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	result, err := utils.Client.Evaluate(evalCtx, stockfish.EvalRequest{
		FEN: req.FEN,
		// Depth: 18,
		MoveTime: 1500 * time.Millisecond,
		MultiPV:  3,
	})
	if err != nil {

		fmt.Println("error:", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to evaluate position",
			"err":   err,
		})
	}

	lines := make([]EvalLineResponse, 0, len(result.Lines))
	for _, line := range result.Lines {
		lines = append(lines, EvalLineResponse{
			MultiPV: line.MultiPV,
			PV:      append([]string(nil), line.PV...),
			Depth:   line.Depth,
			ScoreCP: line.ScoreCP,
			Mate:    line.Mate,
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"message": "position evaluated successfully",
		"fen":     req.FEN,
		"evaluation": fiber.Map{
			"best_move": result.BestMove,
			"ponder":    result.Ponder,
			"pv":        result.PV,
			"depth":     result.Depth,
			"score_cp":  result.ScoreCP,
			"mate":      result.Mate,
			"lines":     lines,
		},
	})
}
