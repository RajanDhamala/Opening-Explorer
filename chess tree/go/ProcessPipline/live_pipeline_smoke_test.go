package Processpipline_test

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	process "chess/ProcessPipline"
	"chess/Utils"
)

func TestLiveCachedGamePipelineSmoke(t *testing.T) {
	if os.Getenv("RUN_LIVE_PIPELINE_SMOKE") != "1" {
		t.Skip("set RUN_LIVE_PIPELINE_SMOKE=1 to fetch cached games and run Stockfish")
	}

	username := strings.TrimSpace(os.Getenv("LIVE_PIPELINE_USERNAME"))
	if username == "" {
		username = "Ashish1234555"
	}
	gameLimit := positiveIntEnv("LIVE_PIPELINE_GAME_LIMIT", 2)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(maxInt(2, gameLimit))*time.Minute)
	defer cancel()

	userGames, selectedUsername, err := utils.FetchProcessForAnalysis(username)
	if err != nil {
		t.Fatalf("fetch cached games: %v", err)
	}
	evalGames := utils.EvaluateAllGames(userGames, selectedUsername)
	if len(evalGames) == 0 {
		t.Fatal("expected cached games to produce evaluation inputs")
	}
	if len(evalGames) > gameLimit {
		evalGames = evalGames[:gameLimit]
	}

	client, err := utils.ConnectStockfish()
	if err != nil {
		t.Fatalf("connect stockfish: %v", err)
	}
	defer client.Close(context.Background())

	config := process.DefaultPipelineConfig()
	config.Diagnostics.Enabled = true
	config.Diagnostics.LogRejections = false
	config.SkipInitialPlies = 0
	config.MaxMovesPerGame = 40
	config.MaxPuzzlesPerGame = 3
	config.ScoutDepth = 6
	config.ConfirmationDepth = 8
	config.RootVerificationDepth = 8
	config.MinimumConfirmationDepth = 8
	config.EvaluationMoveTime = 200 * time.Millisecond
	config.PuzzleMoveTime = 200 * time.Millisecond

	results := process.AnalyzeGames(ctx, evalGames, client, config)
	if len(results) != len(evalGames) {
		t.Fatalf("expected %d pipeline results, got %d", len(evalGames), len(results))
	}

	totalCandidates := 0
	totalConfirmed := 0
	totalAccepted := 0
	totalErrors := 0
	reasonCounts := make(map[string]int)
	for _, result := range results {
		if result.Error != "" {
			t.Fatalf("game %s failed pipeline: %s", result.GameID, result.Error)
		}
		totalCandidates += result.Stats.Candidates
		totalConfirmed += result.Stats.Confirmed
		totalAccepted += result.Stats.Accepted
		totalErrors += result.Stats.EvaluationErrors
		for _, diagnostic := range result.Diagnostics {
			reasonCounts[diagnostic.ReasonCode]++
		}
	}
	reasons := make([]string, 0, len(reasonCounts))
	for reason, count := range reasonCounts {
		reasons = append(reasons, fmt.Sprintf("%s=%d", reason, count))
	}
	sort.Strings(reasons)
	t.Logf(
		"live pipeline smoke username=%s processed=%d candidates=%d confirmed=%d accepted=%d eval_errors=%d reasons=[%s]",
		selectedUsername,
		len(results),
		totalCandidates,
		totalConfirmed,
		totalAccepted,
		totalErrors,
		strings.Join(reasons, ", "),
	)
}

func positiveIntEnv(name string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(name)))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
