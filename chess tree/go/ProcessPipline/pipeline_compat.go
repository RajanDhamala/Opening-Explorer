package Processpipline

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"

	types "chess/Types"

	stockfish "github.com/RajanDhamala/go-stockfish"
)

type preparedGame struct {
	index     int
	input     types.EvalGameInput
	snapshots []moveSnapshot
	err       error
}

func PlayGame(moves []types.Move, client *stockfish.Client, isWhite bool) ([]types.MoveIssue, []Puzzle) {
	config := DefaultPipelineConfig()
	config.Diagnostics = DiagnosticOptions{}
	result := NewProcessor(client, config).AnalyzeGame(context.Background(), types.EvalGameInput{
		Moves:   moves,
		IsWhite: isWhite,
	})
	return result.Issues, result.Puzzles
}

func AnalyzeGames(
	ctx context.Context,
	games []types.EvalGameInput,
	client *stockfish.Client,
	config PipelineConfig,
) []PipelineResult {
	if client == nil || len(games) == 0 {
		return nil
	}

	config = normalizePipelineConfig(config)
	processor := NewProcessor(client, config)
	results := make([]PipelineResult, len(games))
	workers := min(config.GameConcurrency, len(games))

	jobs := make(chan preparedGame, workers)
	var wg sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for item := range jobs {
				results[item.index] = processor.analyzePrepared(ctx, item.input, item.snapshots, item.err)
			}
		}()
	}
	for index, input := range games {
		snapshots, err := prepareSnapshots(input.Moves, input.IsWhite)
		select {
		case jobs <- preparedGame{
			index:     index,
			input:     input,
			snapshots: snapshots,
			err:       err,
		}:
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return results
		}
	}
	close(jobs)
	wg.Wait()
	return results
}

func PlayGamesStream(games []types.EvalGameInput, client *stockfish.Client) <-chan types.EvalGameResult {
	return PlayGamesStreamWithContext(context.Background(), games, client)
}

func PlayGamesStreamWithContext(
	ctx context.Context,
	games []types.EvalGameInput,
	client *stockfish.Client,
) <-chan types.EvalGameResult {
	config := DefaultPipelineConfig()
	config.Diagnostics = DiagnosticOptions{}
	config = normalizePipelineConfig(config)

	resultBuffer := 2
	if len(games) > 0 {
		resultBuffer = min(config.GameConcurrency, len(games))
		if resultBuffer < 2 {
			resultBuffer = 2
		}
	}
	results := make(chan types.EvalGameResult, resultBuffer)
	go func() {
		defer close(results)
		if client == nil || len(games) == 0 {
			return
		}

		processor := NewProcessor(client, config)
		workers := min(config.GameConcurrency, len(games))
		jobs := make(chan preparedGame, workers)
		var wg sync.WaitGroup
		var processed int32

		for worker := 0; worker < workers; worker++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for item := range jobs {
					pipelineResult := processor.analyzePrepared(
						ctx,
						item.input,
						item.snapshots,
						item.err,
					)
					result := buildEvalGameResult(item.input, pipelineResult)
					done := atomic.AddInt32(&processed, 1)
					fmt.Printf(
						"[eval] processed %d/%d games (id=%s, issues=%d, puzzles=%d, scouted=%d, candidates=%d, engine_searches=%d, cache_hits=%d, elapsed_ms=%d)\n",
						done,
						len(games),
						gameIDForLog(item.input.GameID),
						len(pipelineResult.Issues),
						len(pipelineResult.Puzzles),
						pipelineResult.Stats.Scouted,
						pipelineResult.Stats.Candidates,
						pipelineResult.Stats.EngineSearches,
						pipelineResult.Stats.EvalCacheHits,
						pipelineResult.Stats.ProcessingTimeMS,
					)
					select {
					case results <- result:
					case <-ctx.Done():
						return
					}
				}
			}()
		}

		for index, input := range games {
			snapshots, err := prepareSnapshots(input.Moves, input.IsWhite)
			select {
			case jobs <- preparedGame{
				index:     index,
				input:     input,
				snapshots: snapshots,
				err:       err,
			}:
			case <-ctx.Done():
				close(jobs)
				wg.Wait()
				return
			}
		}
		close(jobs)
		wg.Wait()
	}()
	return results
}

func PlayGames(games []types.EvalGameInput, client *stockfish.Client) []types.EvalGameResult {
	if client == nil || len(games) == 0 {
		return nil
	}
	config := DefaultPipelineConfig()
	config.Diagnostics = DiagnosticOptions{}
	pipelineResults := AnalyzeGames(context.Background(), games, client, config)
	results := make([]types.EvalGameResult, len(games))
	for index, result := range pipelineResults {
		results[index] = buildEvalGameResult(games[index], result)
	}
	return results
}

func buildEvalGameResult(item types.EvalGameInput, pipelineResult PipelineResult) types.EvalGameResult {
	return types.EvalGameResult{
		GameID:           item.GameID,
		GameURL:          item.GameURL,
		WhiteUsername:    item.WhiteUsername,
		BlackUsername:    item.BlackUsername,
		WhiteRating:      item.WhiteRating,
		BlackRating:      item.BlackRating,
		OpponentName:     item.OpponentName,
		OpponentRating:   item.OpponentRating,
		PlayerColor:      item.PlayerColor,
		TimeClass:        item.TimeClass,
		Result:           item.Result,
		IssueCount:       len(pipelineResult.Issues),
		PuzzleCount:      len(pipelineResult.Puzzles),
		CandidateCount:   pipelineResult.Stats.Candidates,
		ConfirmedCount:   pipelineResult.Stats.Confirmed,
		EvaluationErrors: pipelineResult.Stats.EvaluationErrors,
		EvalRequests:     pipelineResult.Stats.EvalRequests,
		EvalCacheHits:    pipelineResult.Stats.EvalCacheHits,
		EngineSearches:   pipelineResult.Stats.EngineSearches,
		EngineTimeMS:     pipelineResult.Stats.EngineTimeMS,
		ProcessingTimeMS: pipelineResult.Stats.ProcessingTimeMS,
		ProcessingError:  pipelineResult.Error,
		Issues:           pipelineResult.Issues,
	}
}

func gameIDForLog(id string) string {
	if id == "" {
		return "unknown"
	}
	return id
}

type FreemiumAnalysisOptions struct {
	SkipInitialPlies int
	MaxUserMoves     int
	MaxPuzzles       int
	EvalDepth        int
	AfterEvalDepth   int
	MultiPV          int
	MinCPLoss        int
	StrongCPLoss     int
	MinGapCP         int
	CooldownMoves    int
	MaxSolutionPlies int
	DecidedCPBound   int
}

func DefaultFreemiumAnalysisOptions() FreemiumAnalysisOptions {
	return FreemiumAnalysisOptions{
		SkipInitialPlies: 0,
		MaxUserMoves:     30,
		MaxPuzzles:       8,
		EvalDepth:        10,
		AfterEvalDepth:   8,
		MultiPV:          2,
		MinCPLoss:        180,
		StrongCPLoss:     300,
		MinGapCP:         120,
		CooldownMoves:    4,
		MaxSolutionPlies: 5,
		DecidedCPBound:   900,
	}
}

func GenerateFreemiumPuzzles(
	moves []types.Move,
	client *stockfish.Client,
	isWhite bool,
) ([]types.MoveIssue, []Puzzle) {
	return GenerateFreemiumPuzzlesWithOptions(
		moves,
		client,
		isWhite,
		DefaultFreemiumAnalysisOptions(),
	)
}

func GenerateFreemiumPuzzlesWithOptions(
	moves []types.Move,
	client *stockfish.Client,
	isWhite bool,
	options FreemiumAnalysisOptions,
) ([]types.MoveIssue, []Puzzle) {
	config := FreemiumPipelineConfig(options)

	result := NewProcessor(client, config).AnalyzeGame(context.Background(), types.EvalGameInput{
		Moves:   moves,
		IsWhite: isWhite,
	})
	return result.Issues, result.Puzzles
}

func FreemiumPipelineConfig(options FreemiumAnalysisOptions) PipelineConfig {
	defaults := DefaultFreemiumAnalysisOptions()
	if options.SkipInitialPlies <= 0 {
		options.SkipInitialPlies = defaults.SkipInitialPlies
	}
	if options.MaxUserMoves <= 0 {
		options.MaxUserMoves = defaults.MaxUserMoves
	}
	if options.MaxPuzzles <= 0 {
		options.MaxPuzzles = defaults.MaxPuzzles
	}
	if options.EvalDepth <= 0 {
		options.EvalDepth = defaults.EvalDepth
	}
	if options.AfterEvalDepth <= 0 {
		options.AfterEvalDepth = defaults.AfterEvalDepth
	}
	if options.MultiPV < 2 {
		options.MultiPV = defaults.MultiPV
	}
	if options.MinCPLoss <= 0 {
		options.MinCPLoss = defaults.MinCPLoss
	}
	if options.StrongCPLoss <= 0 {
		options.StrongCPLoss = defaults.StrongCPLoss
	}
	if options.MinGapCP <= 0 {
		options.MinGapCP = defaults.MinGapCP
	}
	if options.MaxSolutionPlies <= 0 {
		options.MaxSolutionPlies = defaults.MaxSolutionPlies
	}

	config := DefaultPipelineConfig()
	config.SkipInitialPlies = options.SkipInitialPlies
	config.MaxMovesPerGame = options.MaxUserMoves * 2
	config.MaxPuzzlesPerGame = options.MaxPuzzles
	config.ScoutDepth = options.EvalDepth
	config.ConfirmationDepth = max(options.EvalDepth, options.AfterEvalDepth)
	config.RootVerificationDepth = config.ConfirmationDepth
	config.MinimumConfirmationDepth = config.ConfirmationDepth
	config.ConfirmationMultiPV = options.MultiPV
	config.MinCPLoss = options.MinCPLoss
	config.BlunderCPLoss = options.StrongCPLoss
	config.MinUniquenessCPGap = options.MinGapCP
	config.MaxNonMateSolutionPlies = options.MaxSolutionPlies
	config.MinNonMateSolutionPlies = min(3, options.MaxSolutionPlies)
	config.Diagnostics = DiagnosticOptions{}

	return config
}
