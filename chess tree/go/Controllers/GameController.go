package Controllers

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
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

const fallbackProcessingUsername = "Ashish1234555"

var activeProcessingUsers sync.Map

func processingUsername() string {
	if configured := strings.TrimSpace(os.Getenv("PIPELINE_USERNAME")); configured != "" {
		return configured
	}
	return fallbackProcessingUsername
}

func beginUserProcessing(username string) bool {
	_, alreadyRunning := activeProcessingUsers.LoadOrStore(strings.ToLower(strings.TrimSpace(username)), struct{}{})
	return !alreadyRunning
}

func endUserProcessing(username string) {
	activeProcessingUsers.Delete(strings.ToLower(strings.TrimSpace(username)))
}

func filterIssuesWithSolution(issues []db.Issue) []db.Issue {
	filtered := make([]db.Issue, 0, len(issues))
	for _, issue := range issues {
		if len(issue.Solution) == 0 {
			continue
		}
		filtered = append(filtered, issue)
	}
	return filtered
}

func issueUUIDForRow(userID int32, gameID string, issue types.MoveIssue) uuid.UUID {
	key := types.MoveIssueIdentityKey(userID, gameID, issue)
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte(key))
}

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

	configuredUsername := processingUsername()
	usrGames, username, err := utils.FetchProcessForAnalysis(configuredUsername)
	if err != nil {
		fmt.Println("failed to fetch games:", err)
		return c.Status(400).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	if !strings.EqualFold(configuredUsername, username) {
		fmt.Printf(
			"[process] configured username %q differs from archive account %q; using archive account\n",
			configuredUsername,
			username,
		)
	}
	if !beginUserProcessing(username) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "game processing is already running for this username",
		})
	}
	defer endUserProcessing(username)
	evalGames := utils.EvaluateAllGames(usrGames, username)
	if len(evalGames) == 0 {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"error":             "selected archive contained no evaluatable standard games for its account",
			"username":          username,
			"fetched_games":     len(usrGames.Games),
			"evaluatable_games": 0,
		})
	}
	fmt.Printf(
		"[process] username=%s fetched_games=%d evaluatable_games=%d\n",
		username,
		len(usrGames.Games),
		len(evalGames),
	)
	resultStream := Processpipline.PlayGamesStreamWithContext(c.Context(), evalGames, utils.Client)
	gameResults := make([]types.EvalGameResult, 0, len(evalGames))

	failedCount := 0
	successCount := 0
	processingFailedCount := 0

	totalIssues := 0
	gamesWithIssues := 0
	issueInsertCount := int64(0)
	issueFailedCount := 0
	issueSkippedDuplicateCount := int64(0)

	ids := make([]pgtype.UUID, 0, len(evalGames))
	gameurls := make([]string, 0, len(evalGames))
	whiteusernames := make([]string, 0, len(evalGames))
	blackusernames := make([]string, 0, len(evalGames))
	whiteratings := make([]int32, 0, len(evalGames))
	blackratings := make([]int32, 0, len(evalGames))
	playercolors := make([]string, 0, len(evalGames))
	timeclasses := make([]string, 0, len(evalGames))
	results := make([]string, 0, len(evalGames))
	issuecounts := make([]int32, 0, len(evalGames))
	userids := make([]int32, 0, len(evalGames))
	issueRows := make([]types.IssueRow, 0, len(evalGames))
	seenIssueIDs := make(map[uuid.UUID]struct{})

	flushBatches := func() {
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

		if len(issueRows) > 0 {
			attemptedRows := int64(len(issueRows))
			inserted, err := Database.BulkInsertIssues(c.Context(), ctrl.pool, issueRows)
			if err != nil {
				fmt.Println("failed to bulk insert issues:", err)
				issueFailedCount += len(issueRows)
			} else {
				issueInsertCount += inserted
				if inserted < attemptedRows {
					issueSkippedDuplicateCount += attemptedRows - inserted
				}
			}
		}

		ids = ids[:0]
		gameurls = gameurls[:0]
		whiteusernames = whiteusernames[:0]
		blackusernames = blackusernames[:0]
		whiteratings = whiteratings[:0]
		blackratings = blackratings[:0]
		playercolors = playercolors[:0]
		timeclasses = timeclasses[:0]
		results = results[:0]
		issuecounts = issuecounts[:0]
		userids = userids[:0]
		issueRows = issueRows[:0]
	}

	flushTicker := time.NewTicker(time.Minute)
	defer flushTicker.Stop()

	for {
		select {
		case result, ok := <-resultStream:
			if !ok {
				flushBatches()
				goto done
			}

			gameResults = append(gameResults, result)
			if result.ProcessingError != "" || result.EvaluationErrors > 0 {
				processingFailedCount++
				fmt.Printf(
					"skipping incomplete game %s: error=%q evaluation_errors=%d\n",
					result.GameID,
					result.ProcessingError,
					result.EvaluationErrors,
				)
				continue
			}
			totalIssues += result.IssueCount
			if result.IssueCount > 0 {
				gamesWithIssues++
			}

			var gameID pgtype.UUID
			if err := gameID.Scan(result.GameID); err != nil {
				failedCount++
				issueFailedCount += len(result.Issues)
				fmt.Println("failed to parse game id:", err)
				continue
			}

			ids = append(ids, gameID)
			gameurls = append(gameurls, result.GameURL)
			whiteusernames = append(whiteusernames, result.WhiteUsername)
			blackusernames = append(blackusernames, result.BlackUsername)
			whiteratings = append(whiteratings, int32(result.WhiteRating))
			blackratings = append(blackratings, int32(result.BlackRating))
			playercolors = append(playercolors, result.PlayerColor)
			timeclasses = append(timeclasses, result.TimeClass)
			results = append(results, result.Result)
			issuecounts = append(issuecounts, int32(result.IssueCount))
			userids = append(userids, userID)

			if len(result.Issues) == 0 {
				continue
			}

			gameUUID, err := uuid.Parse(result.GameID)
			if err != nil {
				issueFailedCount += len(result.Issues)
				fmt.Println("failed to parse game UUID for issues:", err)
				continue
			}
			for _, issue := range result.Issues {
				issueUUID := issueUUIDForRow(userID, result.GameID, issue)
				if _, exists := seenIssueIDs[issueUUID]; exists {
					issueSkippedDuplicateCount++
					continue
				}
				seenIssueIDs[issueUUID] = struct{}{}

				row := types.MoveIssueToRow(issue, issueUUID, gameUUID)
				row.PuzzleKey = types.MoveIssuePuzzleKey(userID, issue)
				issueRows = append(issueRows, row)
			}
		case <-flushTicker.C:
			flushBatches()
		}
	}

done:
	return c.Status(200).JSON(fiber.Map{
		"message":            "we evaluated all fetched games",
		"username":           username,
		"fetched_games":      len(usrGames.Games),
		"evaluatable_games":  len(evalGames),
		"data":               gameResults,
		"total":              totalIssues,
		"processed_games":    len(gameResults),
		"processing_failed":  processingFailedCount,
		"processing_success": len(gameResults) - processingFailedCount,
		"games_with_issue":   gamesWithIssues,
		"dbfailed":           failedCount,
		"dbsuccess":          successCount,
		"issues_inserted":    issueInsertCount,
		"issues_failed":      issueFailedCount,
		"issues_duplicate":   issueSkippedDuplicateCount,
	})
}

func (ctrl *Controller) StartFreemiumAnalysis(c *fiber.Ctx) error {
	userClaims, ok := c.Locals("user").(*utils.JWTClaims)
	if !ok || userClaims == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}
	if utils.Client == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "stockfish client not initialized",
		})
	}

	username := strings.TrimSpace(c.Query("username"))
	if username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "username is required",
		})
	}

	maxGames := 3
	if rawMaxGames := strings.TrimSpace(c.Query("max_games")); rawMaxGames != "" {
		parsed, err := strconv.Atoi(rawMaxGames)
		if err != nil || parsed <= 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "max_games should be a positive number",
			})
		}
		if parsed < maxGames {
			maxGames = parsed
		}
	}

	usrGames, err := utils.FetchProcess(username)
	if err != nil {
		fmt.Println("failed to fetch games for freemium analysis:", err)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	evalGames := utils.EvaluateAllGames(usrGames, username)
	if len(evalGames) > maxGames {
		evalGames = evalGames[:maxGames]
	}

	type freemiumGameResult struct {
		GameID         string                  `json:"game_id"`
		GameURL        string                  `json:"game_url"`
		PlayerColor    string                  `json:"player_color"`
		OpponentName   string                  `json:"opponent_name"`
		OpponentRating int                     `json:"opponent_rating"`
		TimeClass      string                  `json:"time_class"`
		Result         string                  `json:"result"`
		IssueCount     int                     `json:"issue_count"`
		PuzzleCount    int                     `json:"puzzle_count"`
		Issues         []types.MoveIssue       `json:"issues"`
		Puzzles        []Processpipline.Puzzle `json:"puzzles"`
		Error          string                  `json:"error,omitempty"`
	}

	gameResults := make([]freemiumGameResult, 0, len(evalGames))
	totalIssues := 0
	totalPuzzles := 0

	config := Processpipline.FreemiumPipelineConfig(Processpipline.DefaultFreemiumAnalysisOptions())
	pipelineResults := Processpipline.AnalyzeGames(c.Context(), evalGames, utils.Client, config)
	for index, game := range evalGames {
		result := pipelineResults[index]
		totalIssues += len(result.Issues)
		totalPuzzles += len(result.Puzzles)
		gameResults = append(gameResults, freemiumGameResult{
			GameID:         game.GameID,
			GameURL:        game.GameURL,
			PlayerColor:    game.PlayerColor,
			OpponentName:   game.OpponentName,
			OpponentRating: game.OpponentRating,
			TimeClass:      game.TimeClass,
			Result:         game.Result,
			IssueCount:     len(result.Issues),
			PuzzleCount:    len(result.Puzzles),
			Issues:         result.Issues,
			Puzzles:        result.Puzzles,
			Error:          result.Error,
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"message":         "freemium analysis completed",
		"username":        username,
		"processed_games": len(gameResults),
		"total_issues":    totalIssues,
		"total_puzzles":   totalPuzzles,
		"data":            gameResults,
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
	issues = filterIssuesWithSolution(issues)

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
	issues = filterIssuesWithSolution(issues)

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

	result, err := Processpipline.EvaluateRawStockfish(evalCtx, utils.Client, stockfish.EvalRequest{
		FEN: req.FEN,
		// Depth: 17,
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

func (ctrl *Controller) CopyPuzzelsDb(c *fiber.Ctx) error {
	err := utils.ReadCsv(c.Context(), ctrl.pool)
	fmt.Println("error:", err)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"message": "failed to update ",
			"error":   err,
		})
	}
	return c.Status(200).JSON(fiber.Map{
		"message": "inserted to db",
	})
}
