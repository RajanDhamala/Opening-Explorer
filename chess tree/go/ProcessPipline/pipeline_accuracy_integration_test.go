package Processpipline

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	types "chess/Types"

	lib "github.com/RajanDhamala/chess/v2"
	stockfish "github.com/RajanDhamala/go-stockfish"
)

// TestLichessPuzzleAccuracy is intentionally gated because it starts real
// Stockfish workers. It measures recall against the checked-in Lichess corpus,
// verifies every accepted line from a fresh cache one depth deeper, and checks
// deeper-oracle best/near-best negative moves for false puzzle detections.
func TestLichessPuzzleAccuracy(t *testing.T) {
	if os.Getenv("RUN_PIPELINE_ACCURACY") != "1" {
		t.Skip("set RUN_PIPELINE_ACCURACY=1 to run the Stockfish accuracy check")
	}

	sampleSize := accuracySampleSize(t)
	rows := readAccuracyRows(t, sampleSize)
	binary := os.Getenv("STOCKFISH_BINARY")
	if binary == "" {
		binary = "/usr/games/stockfish"
	}

	poolSize := accuracyPoolSize()
	if poolSize < 1 {
		poolSize = 1
	}
	client, err := stockfish.New(context.Background(), stockfish.Config{
		BinaryPath:       binary,
		PoolSize:         poolSize,
		QueueSize:        poolSize * 4,
		PerEngineThreads: 1,
		TotalHashMB:      256,
		MaxMultiPV:       2,
		// Match production headroom: puzzle proof may search for up to 30 seconds,
		// so the hard client deadline must remain comfortably later.
		JobTimeout: 45 * time.Second,
	})
	if err != nil {
		t.Fatalf("start Stockfish: %v", err)
	}
	t.Cleanup(func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := client.Close(closeCtx); err != nil {
			t.Errorf("close Stockfish: %v", err)
		}
	})

	config := DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	config.GameConcurrency = poolSize
	config.ScoutGameConcurrency = 2
	config.PositionConcurrency = poolSize
	config.Diagnostics.Enabled = true
	config.Diagnostics.LogRejections = false
	processor := NewProcessor(client, config)
	verifierConfig := config
	verifierConfig.ConfirmationDepth = config.ConfirmationDepth + 1
	// Request one depth beyond production, but never misclassify a fully
	// completed production-depth search as an invalid line when the oracle's
	// time cap interrupts only its extra iteration.
	verifierConfig.MinimumConfirmationDepth = config.ConfirmationDepth
	// The oracle must be more reliable than production confirmation. Give its
	// deeper search enough time to finish instead of treating a shallow oracle
	// result as evidence about detector quality.
	verifierConfig.EvaluationMoveTime = 30 * time.Second
	verifier := NewProcessor(client, verifierConfig)

	type accuracyCase struct {
		row      accuracyRow
		input    types.EvalGameInput
		snapshot moveSnapshot
	}
	cases := make([]accuracyCase, len(rows))
	results := make([]PipelineResult, len(rows))
	for index, row := range rows {
		input, snapshot := accuracyInput(t, row)
		cases[index] = accuracyCase{row: row, input: input, snapshot: snapshot}
	}
	var wait sync.WaitGroup
	for index := range cases {
		wait.Add(1)
		go func() {
			defer wait.Done()
			item := cases[index]
			results[index] = processor.analyzePrepared(
				context.Background(),
				item.input,
				[]moveSnapshot{item.snapshot},
				nil,
			)
		}()
	}
	wait.Wait()

	accepted := 0
	semanticMatches := 0
	exactFullLines := 0
	reasons := make(map[string]int)
	type lineVerification struct {
		accepted bool
		exact    bool
		err      error
	}
	verifications := make([]lineVerification, len(cases))
	var verificationWait sync.WaitGroup
	oracleSlots := make(chan struct{}, max(1, poolSize/2))
	for index, item := range cases {
		row := item.row
		result := results[index]
		if result.Error != "" {
			t.Errorf("puzzle %s: pipeline error: %s", row.id, result.Error)
			continue
		}
		if len(result.Puzzles) == 0 {
			for _, diagnostic := range result.Diagnostics {
				if diagnostic.MoveIndex == item.snapshot.MoveIndex && diagnostic.ReasonCode != "" {
					reasons[diagnostic.ReasonCode]++
					t.Logf(
						"puzzle %s rejected: %s: %s (top_cp=%s second_cp=%s top_mate=%s rating=%s themes=%s)",
						row.id,
						diagnostic.ReasonCode,
						diagnostic.Explanation,
						optionalIntText(diagnostic.TopScoreCP),
						optionalIntText(diagnostic.SecondScoreCP),
						optionalIntText(diagnostic.TopMate),
						row.rating,
						row.themes,
					)
				}
			}
			continue
		}

		accepted++
		verifications[index].accepted = true
		puzzle := result.Puzzles[0]
		actual := normalizeUCIMove(puzzle.PV[0])
		expected := normalizeUCIMove(row.moves[1])
		if actual != expected {
			verifications[index].err = fmt.Errorf(
				"puzzle %s: accepted first move %s, published solution starts %s (fen=%s)",
				row.id,
				actual,
				expected,
				result.Puzzles[0].FEN,
			)
			continue
		}
		verificationWait.Add(1)
		go func(index int, row accuracyRow, puzzle Puzzle) {
			defer verificationWait.Done()
			oracleSlots <- struct{}{}
			defer func() { <-oracleSlots }()
			verifications[index].exact, verifications[index].err = verifyAcceptedPuzzleLine(
				context.Background(),
				verifier,
				verifierConfig,
				row,
				puzzle,
			)
		}(index, row, puzzle)
	}
	verificationWait.Wait()
	for index, verification := range verifications {
		if !verification.accepted {
			continue
		}
		if verification.err != nil {
			t.Errorf(
				"puzzle %s: generated line %v is not semantically valid: %v",
				cases[index].row.id,
				results[index].Puzzles[0].PV,
				verification.err,
			)
			continue
		}
		semanticMatches++
		if verification.exact {
			exactFullLines++
		}
	}

	negativeResult := verifyNearBestNegatives(
		t,
		context.Background(),
		processor,
		verifier,
		verifierConfig,
		rows,
	)
	recall := float64(semanticMatches) / float64(len(rows))
	acceptedLineCorrectness := 1.0
	if accepted > 0 {
		acceptedLineCorrectness = float64(semanticMatches) / float64(accepted)
	}
	t.Logf(
		"Lichess accuracy sample=%d accepted=%d semantic_full_line=%d exact_full_line=%d recall=%.1f%% accepted_line_correctness=%.1f%% near_best_negatives=%d negative_false_positives=%d rejection_reasons=%v",
		len(rows),
		accepted,
		semanticMatches,
		exactFullLines,
		100*recall,
		100*acceptedLineCorrectness,
		negativeResult.NearBest,
		negativeResult.FalsePositives,
		reasons,
	)
	if accepted == 0 {
		t.Fatal("pipeline accepted none of the known puzzle positions")
	}
	if semanticMatches != accepted {
		t.Fatalf(
			"accepted-line correctness %.1f%% is below the required 100%%",
			100*acceptedLineCorrectness,
		)
	}
	if negativeResult.FalsePositives != 0 {
		t.Fatalf("pipeline accepted %d deeper-oracle negative positions", negativeResult.FalsePositives)
	}
	// The corpus intentionally retains positions that current Stockfish rejects
	// as ambiguous, already mating, or below the configured payoff floor. Keep a
	// strong coverage floor while making 100% accepted-line correctness and zero
	// negative false positives the non-negotiable gates.
	const minimumRecall = 0.75
	if recall < minimumRecall {
		t.Fatalf("known-puzzle recall %.1f%% is below the %.1f%% regression floor", 100*recall, 100*minimumRecall)
	}
}

func accuracyPoolSize() int {
	available := runtime.NumCPU()
	if available < 1 {
		available = 1
	}
	configured, err := strconv.Atoi(strings.TrimSpace(os.Getenv("STOCKFISH_POOL_SIZE")))
	if err != nil || configured < 1 {
		return min(available, 12)
	}
	return min(configured, available)
}

type accuracyRow struct {
	id     string
	fen    string
	moves  []string
	rating string
	themes string
}

func accuracySampleSize(t *testing.T) int {
	t.Helper()
	// Keep the default in sync with the entire checked-in regression corpus so
	// newly added edge cases cannot silently sit outside the normal accuracy run.
	const defaultSampleSize = 25
	raw := strings.TrimSpace(os.Getenv("PIPELINE_ACCURACY_SAMPLE"))
	if raw == "" {
		return defaultSampleSize
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		t.Fatalf("PIPELINE_ACCURACY_SAMPLE must be a positive integer, got %q", raw)
	}
	return value
}

func readAccuracyRows(t *testing.T, limit int) []accuracyRow {
	t.Helper()
	corpusPath := strings.TrimSpace(os.Getenv("PIPELINE_ACCURACY_CORPUS"))
	if corpusPath == "" {
		corpusPath = "testdata/lichess_accuracy_sample.csv"
	}
	file, err := os.Open(corpusPath)
	if err != nil {
		t.Fatalf("open Lichess puzzle corpus %s: %v", corpusPath, err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	if _, err := reader.Read(); err != nil {
		t.Fatalf("read Lichess puzzle header: %v", err)
	}
	rows := make([]accuracyRow, 0, limit)
	idFilter := accuracyPuzzleIDFilter()
	for len(rows) < limit {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read Lichess puzzle row %d from %s: %v", len(rows)+1, corpusPath, err)
		}
		if len(idFilter) > 0 {
			if _, include := idFilter[strings.TrimSpace(record[0])]; !include {
				continue
			}
		}
		moves := strings.Fields(record[2])
		if len(moves) < 2 {
			continue
		}
		rows = append(rows, accuracyRow{
			id:     record[0],
			fen:    record[1],
			moves:  moves,
			rating: record[3],
			themes: record[4],
		})
	}
	if len(rows) == 0 {
		t.Fatalf("no valid Lichess puzzle rows found in %s", corpusPath)
	}
	return rows
}

func accuracyPuzzleIDFilter() map[string]struct{} {
	result := make(map[string]struct{})
	for _, id := range strings.Split(os.Getenv("PIPELINE_ACCURACY_IDS"), ",") {
		if id = strings.TrimSpace(id); id != "" {
			result[id] = struct{}{}
		}
	}
	return result
}

func optionalIntText(value *int) string {
	if value == nil {
		return "none"
	}
	return strconv.Itoa(*value)
}

func accuracyInput(t *testing.T, row accuracyRow) (types.EvalGameInput, moveSnapshot) {
	t.Helper()
	option, err := lib.FEN(row.fen)
	if err != nil {
		t.Fatalf("puzzle %s: parse FEN: %v", row.id, err)
	}
	game := lib.NewGame(option)
	trigger, err := lib.UCINotation{}.Decode(game.Position(), row.moves[0])
	if err != nil {
		t.Fatalf("puzzle %s: decode trigger %s: %v", row.id, row.moves[0], err)
	}
	triggerSAN := lib.AlgebraicNotation{}.Encode(game.Position(), trigger)
	beforeFEN := game.Position().String()
	triggerSide := sideToMoveFromFEN(beforeFEN)
	if err := game.Move(trigger, nil); err != nil {
		t.Fatalf("puzzle %s: play trigger %s: %v", row.id, row.moves[0], err)
	}
	afterFEN := game.Position().String()
	solverIsWhite := sideToMoveFromFEN(afterFEN) == "w"

	return types.EvalGameInput{
			GameID:      fmt.Sprintf("lichess-%s", row.id),
			PlayerColor: colorFromBool(solverIsWhite),
			IsWhite:     solverIsWhite,
		}, moveSnapshot{
			MoveIndex:   moveIndexFromFEN(beforeFEN),
			MoveSAN:     triggerSAN,
			MoveUCI:     normalizeUCIMove(row.moves[0]),
			FEN:         beforeFEN,
			AfterFEN:    afterFEN,
			SideToMove:  triggerSide,
			PlayerColor: colorFromBool(solverIsWhite),
			IsUserMove:  false,
			IsBookMove:  false,
		}
}

func moveIndexFromFEN(fen string) int {
	fields := strings.Fields(fen)
	if len(fields) < 6 {
		return 1
	}
	fullMove, err := strconv.Atoi(fields[5])
	if err != nil || fullMove < 1 {
		return 1
	}
	moveIndex := 2*fullMove - 1
	if fields[1] == "b" {
		moveIndex++
	}
	return moveIndex
}

func verifyAcceptedPuzzleLine(
	ctx context.Context,
	processor *Processor,
	config PipelineConfig,
	row accuracyRow,
	puzzle Puzzle,
) (bool, error) {
	if len(puzzle.PV) == 0 {
		return false, fmt.Errorf("accepted puzzle has an empty PV")
	}
	expected := row.moves[1:]
	exactFullLine := len(puzzle.PV) == len(expected)
	if puzzle.MateIn > 0 {
		expectedPlies := 2*puzzle.MateIn - 1
		if len(puzzle.PV) != expectedPlies {
			return false, fmt.Errorf(
				"mate in %d has %d plies; want %d",
				puzzle.MateIn,
				len(puzzle.PV),
				expectedPlies,
			)
		}
	} else if len(puzzle.PV) != 3 && len(puzzle.PV) != 5 {
		return false, fmt.Errorf("non-mate line has %d plies; want 3 or 5", len(puzzle.PV))
	}

	option, err := lib.FEN(puzzle.FEN)
	if err != nil {
		return false, fmt.Errorf("parse puzzle FEN: %w", err)
	}
	game := lib.NewGame(option)
	solverIsWhite := sideToMoveFromFEN(puzzle.FEN) == "w"
	publishedPositionStillMatches := true

	for index, move := range puzzle.PV {
		currentFEN := game.Position().String()
		solverTurn := sideToMoveFromFEN(currentFEN) == sideFromBool(solverIsWhite)
		if solverTurn != (index%2 == 0) {
			return false, fmt.Errorf("ply %d has the wrong side to move", index+1)
		}

		multiPV := 1
		if solverTurn {
			multiPV = config.ConfirmationMultiPV
		}
		eval, err := processor.evaluate(
			ctx,
			currentFEN,
			config.ConfirmationDepth,
			multiPV,
			config.EvaluationMoveTime,
		)
		if err != nil {
			return false, fmt.Errorf("evaluate ply %d: %w", index+1, err)
		}
		legalMoves, err := legalMoveCount(currentFEN)
		if err != nil {
			return false, fmt.Errorf("count legal moves at ply %d: %w", index+1, err)
		}
		requiredLines := min(multiPV, legalMoves)
		if actualDepth, shallow := shallowConfirmationDepth(eval, config.MinimumConfirmationDepth, requiredLines); shallow {
			return false, fmt.Errorf(
				"ply %d reached depth %d; want %d",
				index+1,
				actualDepth,
				config.MinimumConfirmationDepth,
			)
		}
		if len(eval.Lines) == 0 || len(eval.Lines[0].PV) == 0 {
			return false, fmt.Errorf("ply %d has no engine line", index+1)
		}
		if len(eval.Lines) < requiredLines {
			return false, fmt.Errorf("ply %d returned %d/%d required lines", index+1, len(eval.Lines), requiredLines)
		}
		actualMove := normalizeUCIMove(move)
		bestMove := normalizeUCIMove(eval.Lines[0].PV[0])
		if solverTurn {
			if actualMove != bestMove {
				return false, fmt.Errorf("solver ply %d uses %s; deeper engine best is %s", index+1, actualMove, bestMove)
			}
			if err := independentlyVerifySolverChoice(eval, solverIsWhite, config, index == 0); err != nil {
				return false, fmt.Errorf("solver ply %d is not forced: %w", index+1, err)
			}
		} else if !independentlyEquivalentDefensiveMove(eval, actualMove, !solverIsWhite) {
			equivalent, err := independentlyVerifyDefensiveMove(
				ctx,
				processor,
				config,
				currentFEN,
				eval,
				actualMove,
				solverIsWhite,
			)
			if err != nil {
				return false, fmt.Errorf("verify defensive ply %d: %w", index+1, err)
			}
			if !equivalent {
				return false, fmt.Errorf(
					"defensive ply %d uses %s, which is not a deeper-engine equivalent of %s",
					index+1,
					actualMove,
					bestMove,
				)
			}
		}

		if publishedPositionStillMatches {
			expectedMove := "<end-of-line>"
			if index < len(expected) {
				expectedMove = normalizeUCIMove(expected[index])
			}
			if actualMove != expectedMove {
				exactFullLine = false
				if solverTurn {
					return false, fmt.Errorf(
						"solver ply %d disagrees with published move %s while the position still matches",
						index+1,
						expectedMove,
					)
				}
				publishedPositionStillMatches = false
			}
		}

		if err := playUCIMove(game, actualMove); err != nil {
			return false, fmt.Errorf("play generated move %s at ply %d: %w", actualMove, index+1, err)
		}
	}

	status := game.Position().Status()
	if puzzle.MateIn > 0 {
		if status != lib.Checkmate {
			return false, fmt.Errorf("mate line ends with %s instead of checkmate", status)
		}
		return exactFullLine, nil
	}
	if status != lib.NoMethod {
		return false, fmt.Errorf("non-mate line ends with terminal status %s", status)
	}

	// The stored line ends on a solver move. Prove that it remains sound after
	// the defender's best response and that no fourth unique solver move is
	// required. This is what separates a complete 2-3 move tactic from a
	// truncated engine PV.
	opponentFEN := game.Position().String()
	opponentEval, err := processor.evaluate(
		ctx,
		opponentFEN,
		config.ConfirmationDepth,
		1,
		config.EvaluationMoveTime,
	)
	if err != nil {
		return false, fmt.Errorf("evaluate final defensive reply: %w", err)
	}
	if actualDepth, shallow := shallowConfirmationDepth(opponentEval, config.MinimumConfirmationDepth, 1); shallow {
		return false, fmt.Errorf("final defensive reply reached depth %d", actualDepth)
	}
	if len(opponentEval.Lines) == 0 || len(opponentEval.Lines[0].PV) == 0 {
		return false, fmt.Errorf("final position has no defensive engine line")
	}
	if err := playUCIMove(game, opponentEval.Lines[0].PV[0]); err != nil {
		return false, fmt.Errorf("play final defensive reply: %w", err)
	}
	if status := game.Position().Status(); status != lib.NoMethod {
		return false, fmt.Errorf("best defense ends the game with %s", status)
	}

	resolvedFEN := game.Position().String()
	resolvedEval, err := processor.evaluate(
		ctx,
		resolvedFEN,
		config.ConfirmationDepth,
		config.ConfirmationMultiPV,
		config.EvaluationMoveTime,
	)
	if err != nil {
		return false, fmt.Errorf("evaluate resolved tactic: %w", err)
	}
	if actualDepth, shallow := shallowConfirmationDepth(
		resolvedEval,
		config.MinimumConfirmationDepth,
		config.ConfirmationMultiPV,
	); shallow {
		return false, fmt.Errorf("resolved tactic reached depth %d", actualDepth)
	}
	if len(resolvedEval.Lines) == 0 || !hasWinningAdvantage(
		resolvedEval.Lines[0],
		solverIsWhite,
		config.ContinuationMinAdvantageCP,
	) {
		return false, fmt.Errorf("advantage does not survive the final best defense")
	}
	resolvedLegalMoves, err := legalMoveCount(resolvedFEN)
	if err != nil {
		return false, fmt.Errorf("count resolved legal moves: %w", err)
	}
	resolvedRequiredLines := min(config.ConfirmationMultiPV, resolvedLegalMoves)
	if len(resolvedEval.Lines) < resolvedRequiredLines {
		return false, fmt.Errorf(
			"resolved tactic returned %d/%d required lines",
			len(resolvedEval.Lines),
			resolvedRequiredLines,
		)
	}
	if independentlyVerifySolverChoice(resolvedEval, solverIsWhite, config, false) == nil {
		materialGain := materialDifference(resolvedFEN, solverIsWhite) -
			materialDifference(puzzle.FEN, solverIsWhite)
		if materialGain < config.MinTacticalMaterialGain {
			return false, fmt.Errorf("the tactic still requires another unique solver move")
		}
	}
	return exactFullLine, nil
}

func independentlyVerifySolverChoice(
	eval types.EvalResult,
	solverIsWhite bool,
	config PipelineConfig,
	enforceRootMateRange bool,
) error {
	if len(eval.Lines) < 2 {
		return fmt.Errorf("fewer than two engine lines")
	}
	top := eval.Lines[0]
	minimumAdvantage := config.ContinuationMinAdvantageCP
	if enforceRootMateRange {
		minimumAdvantage = config.MinAdvantageCP
	}
	if !hasWinningAdvantage(top, solverIsWhite, minimumAdvantage) {
		return fmt.Errorf("best line is below the %dcp payoff floor", minimumAdvantage)
	}

	shortestMate := 0
	shortestMoves := make(map[string]struct{})
	for _, line := range eval.Lines {
		mate, ok := mateForSide(line.Mate, solverIsWhite)
		if !ok || mate <= 0 {
			continue
		}
		if shortestMate == 0 || mate < shortestMate {
			shortestMate = mate
			shortestMoves = make(map[string]struct{})
		}
		if mate == shortestMate && len(line.PV) > 0 {
			shortestMoves[normalizeUCIMove(line.PV[0])] = struct{}{}
		}
	}
	if shortestMate > 0 {
		topMate, ok := mateForSide(top.Mate, solverIsWhite)
		if !ok || topMate != shortestMate {
			return fmt.Errorf("PV1 is not the shortest mate in %d", shortestMate)
		}
		if len(shortestMoves) != 1 {
			return fmt.Errorf("%d equal shortest mating moves", len(shortestMoves))
		}
		if enforceRootMateRange && (topMate < config.MinMateIn || topMate > config.MaxMateIn) {
			return fmt.Errorf("mate in %d is outside %d..%d", topMate, config.MinMateIn, config.MaxMateIn)
		}
		return nil
	}

	topScore, topScoreOK := lineScoreForSide(top, solverIsWhite)
	secondScore, secondScoreOK := lineScoreForSide(eval.Lines[1], solverIsWhite)
	topWin, topWinOK := lineWinChance(top, solverIsWhite)
	secondWin, secondWinOK := lineWinChance(eval.Lines[1], solverIsWhite)
	if !topScoreOK || !secondScoreOK || !topWinOK || !secondWinOK {
		return fmt.Errorf("top two non-mate lines are not comparable")
	}
	if topWin >= config.DecisiveWinChance && secondWin >= config.ComfortableWinChance {
		return fmt.Errorf("an alternative still preserves a comfortable win")
	}
	if cpGap := topScore - secondScore; cpGap < config.MinUniquenessCPGap {
		return fmt.Errorf("CP gap %d is below %d", cpGap, config.MinUniquenessCPGap)
	}
	if winGap := topWin - secondWin; winGap < config.MinUniquenessWinChanceGap {
		return fmt.Errorf("win-chance gap %.1f is below %.1f", winGap, config.MinUniquenessWinChanceGap)
	}
	return nil
}

func independentlyEquivalentDefensiveMove(
	eval types.EvalResult,
	move string,
	defenderIsWhite bool,
) bool {
	if len(eval.Lines) == 0 {
		return false
	}
	topScore, topScoreOK := lineScoreForSide(eval.Lines[0], defenderIsWhite)
	topWin, topWinOK := lineWinChance(eval.Lines[0], defenderIsWhite)
	for _, line := range eval.Lines {
		if len(line.PV) == 0 || !sameUCIMove(line.PV[0], move) {
			continue
		}
		if sameUCIMove(eval.Lines[0].PV[0], move) {
			return true
		}
		score, scoreOK := lineScoreForSide(line, defenderIsWhite)
		win, winOK := lineWinChance(line, defenderIsWhite)
		if topScoreOK && scoreOK {
			gap := topScore - score
			if gap >= 0 && gap <= 50 {
				return true
			}
		}
		if topWinOK && winOK {
			gap := topWin - win
			if gap >= 0 && gap <= 2 {
				return true
			}
		}
	}
	return false
}

func independentlyVerifyDefensiveMove(
	ctx context.Context,
	processor *Processor,
	config PipelineConfig,
	fen string,
	rootEval types.EvalResult,
	move string,
	solverIsWhite bool,
) (bool, error) {
	if len(rootEval.Lines) == 0 || len(rootEval.Lines[0].PV) == 0 {
		return false, fmt.Errorf("root evaluation has no best defense")
	}
	evaluateChild := func(candidateMove string) (types.EvalResult, error) {
		option, err := lib.FEN(fen)
		if err != nil {
			return types.EvalResult{}, fmt.Errorf("parse defensive position: %w", err)
		}
		game := lib.NewGame(option)
		if err := playUCIMove(game, candidateMove); err != nil {
			return types.EvalResult{}, fmt.Errorf("play defensive move %s: %w", candidateMove, err)
		}
		eval, err := processor.evaluate(
			ctx,
			game.Position().String(),
			config.ConfirmationDepth,
			1,
			config.EvaluationMoveTime,
		)
		if err != nil {
			return types.EvalResult{}, fmt.Errorf("evaluate defensive move %s: %w", candidateMove, err)
		}
		if actualDepth, shallow := shallowConfirmationDepth(eval, config.MinimumConfirmationDepth, 1); shallow {
			return types.EvalResult{}, fmt.Errorf(
				"defensive move %s reached depth %d; want %d",
				candidateMove,
				actualDepth,
				config.MinimumConfirmationDepth,
			)
		}
		if len(eval.Lines) == 0 || len(eval.Lines[0].PV) == 0 {
			return types.EvalResult{}, fmt.Errorf("defensive move %s has no reply evaluation", candidateMove)
		}
		return eval, nil
	}

	actualEval, err := evaluateChild(move)
	if err != nil {
		return false, err
	}
	bestMove := normalizeUCIMove(rootEval.Lines[0].PV[0])
	bestEval, err := evaluateChild(bestMove)
	if err != nil {
		return false, err
	}
	bestScore, bestScoreOK := evaluationScoreForSide(bestEval, solverIsWhite)
	actualScore, actualScoreOK := evaluationScoreForSide(actualEval, solverIsWhite)
	if bestScoreOK && actualScoreOK {
		// The defender's engine-best move minimizes the solver's outcome. A move
		// omitted from a small MultiPV is still equivalent when independently
		// searching its child position shows no more than a 50cp concession.
		if concession := actualScore - bestScore; concession <= 50 {
			return true, nil
		}
	}
	bestWin, bestWinOK := evaluationWinChance(bestEval, solverIsWhite)
	actualWin, actualWinOK := evaluationWinChance(actualEval, solverIsWhite)
	if bestWinOK && actualWinOK {
		if concession := actualWin - bestWin; concession <= 2 {
			return true, nil
		}
	}
	return false, nil
}

type nearBestNegativeResult struct {
	NearBest       int
	FalsePositives int
}

func verifyNearBestNegatives(
	t *testing.T,
	ctx context.Context,
	detector *Processor,
	oracle *Processor,
	oracleConfig PipelineConfig,
	rows []accuracyRow,
) nearBestNegativeResult {
	t.Helper()
	type negativeCase struct {
		input    types.EvalGameInput
		snapshot moveSnapshot
		nearBest bool
		valid    bool
	}
	cases := make([]negativeCase, len(rows))
	buildErrors := make([]error, len(rows))
	var buildWait sync.WaitGroup
	for index, row := range rows {
		buildWait.Add(1)
		go func(index int, row accuracyRow) {
			defer buildWait.Done()
			input, snapshot, nearBest, err := nearBestNegativeCase(ctx, oracle, oracleConfig, row)
			if err != nil {
				buildErrors[index] = err
				return
			}
			cases[index] = negativeCase{input: input, snapshot: snapshot, nearBest: nearBest, valid: true}
		}(index, row)
	}
	buildWait.Wait()
	for index, err := range buildErrors {
		if err != nil {
			t.Errorf("negative %s: %v", rows[index].id, err)
		}
	}

	results := make([]PipelineResult, len(cases))
	var wait sync.WaitGroup
	for index := range cases {
		if !cases[index].valid {
			continue
		}
		wait.Add(1)
		go func() {
			defer wait.Done()
			results[index] = detector.analyzePrepared(
				ctx,
				cases[index].input,
				[]moveSnapshot{cases[index].snapshot},
				nil,
			)
		}()
	}
	wait.Wait()

	verification := nearBestNegativeResult{}
	for index, item := range cases {
		if !item.valid {
			continue
		}
		result := results[index]
		if result.Error != "" {
			t.Errorf("negative %s pipeline error: %s", rows[index].id, result.Error)
			continue
		}
		if len(result.Puzzles) > 0 {
			verification.FalsePositives++
		}
		if item.nearBest {
			verification.NearBest++
		}
	}
	if verification.NearBest == 0 && len(rows) >= 5 {
		t.Error("deeper oracle produced no non-best negative moves")
	}
	return verification
}

func nearBestNegativeCase(
	ctx context.Context,
	oracle *Processor,
	config PipelineConfig,
	row accuracyRow,
) (types.EvalGameInput, moveSnapshot, bool, error) {
	beforeEval, err := oracle.evaluate(
		ctx,
		row.fen,
		config.MinimumConfirmationDepth,
		config.ConfirmationMultiPV,
		config.EvaluationMoveTime,
	)
	if err != nil {
		return types.EvalGameInput{}, moveSnapshot{}, false, fmt.Errorf("evaluate pre-trigger position: %w", err)
	}
	if len(beforeEval.Lines) == 0 || len(beforeEval.Lines[0].PV) == 0 {
		return types.EvalGameInput{}, moveSnapshot{}, false, fmt.Errorf("pre-trigger position has no oracle line")
	}
	legalMoves, err := legalMoveCount(row.fen)
	if err != nil {
		return types.EvalGameInput{}, moveSnapshot{}, false, fmt.Errorf("count pre-trigger legal moves: %w", err)
	}
	requiredLines := min(config.ConfirmationMultiPV, legalMoves)
	if len(beforeEval.Lines) < requiredLines {
		return types.EvalGameInput{}, moveSnapshot{}, false, fmt.Errorf(
			"pre-trigger oracle returned %d/%d required lines",
			len(beforeEval.Lines),
			requiredLines,
		)
	}
	if actualDepth, shallow := shallowConfirmationDepth(beforeEval, config.MinimumConfirmationDepth, requiredLines); shallow {
		return types.EvalGameInput{}, moveSnapshot{}, false, fmt.Errorf(
			"pre-trigger oracle reached depth %d; want %d",
			actualDepth,
			config.ConfirmationDepth,
		)
	}
	moverIsWhite := sideToMoveFromFEN(row.fen) == "w"
	bestMove := normalizeUCIMove(beforeEval.Lines[0].PV[0])
	nearBest := false
	topScore, topScoreOK := lineScoreForSide(beforeEval.Lines[0], moverIsWhite)
	topWin, topWinOK := lineWinChance(beforeEval.Lines[0], moverIsWhite)
	for _, line := range beforeEval.Lines[1:] {
		if len(line.PV) == 0 || sameUCIMove(line.PV[0], row.moves[0]) {
			continue
		}
		score, scoreOK := lineScoreForSide(line, moverIsWhite)
		win, winOK := lineWinChance(line, moverIsWhite)
		// A negative move must stay below both scout gates. The detector admits
		// a candidate when either CP loss or win-chance loss crosses its floor,
		// so using OR here would incorrectly label some real mistakes negative.
		closeCP := topScoreOK && scoreOK &&
			topScore-score >= 0 && topScore-score < config.MinCPLoss
		closeWin := topWinOK && winOK &&
			topWin-win >= 0 && topWin-win < config.MinWinChanceSwing
		if closeCP && closeWin {
			bestMove = normalizeUCIMove(line.PV[0])
			nearBest = true
			break
		}
	}
	if bestMove == "" {
		return types.EvalGameInput{}, moveSnapshot{}, false, fmt.Errorf("pre-trigger position has no selected move")
	}

	option, err := lib.FEN(row.fen)
	if err != nil {
		return types.EvalGameInput{}, moveSnapshot{}, false, fmt.Errorf("parse FEN: %w", err)
	}
	game := lib.NewGame(option)
	move, err := lib.UCINotation{}.Decode(game.Position(), bestMove)
	if err != nil {
		return types.EvalGameInput{}, moveSnapshot{}, false, fmt.Errorf("decode oracle move %s: %w", bestMove, err)
	}
	moveSAN := lib.AlgebraicNotation{}.Encode(game.Position(), move)
	beforeFEN := game.Position().String()
	triggerSide := sideToMoveFromFEN(beforeFEN)
	if err := game.Move(move, nil); err != nil {
		return types.EvalGameInput{}, moveSnapshot{}, false, fmt.Errorf("play oracle move %s: %w", bestMove, err)
	}
	afterFEN := game.Position().String()
	solverIsWhite := sideToMoveFromFEN(afterFEN) == "w"
	return types.EvalGameInput{
			GameID:      fmt.Sprintf("lichess-negative-%s", row.id),
			PlayerColor: colorFromBool(solverIsWhite),
			IsWhite:     solverIsWhite,
		}, moveSnapshot{
			MoveIndex:   moveIndexFromFEN(beforeFEN),
			MoveSAN:     moveSAN,
			MoveUCI:     bestMove,
			FEN:         beforeFEN,
			AfterFEN:    afterFEN,
			SideToMove:  triggerSide,
			PlayerColor: colorFromBool(solverIsWhite),
			IsUserMove:  false,
			IsBookMove:  false,
		}, nearBest, nil
}
