package Processpipline

import (
	"context"
	"fmt"

	types "chess/Types"

	lib "github.com/RajanDhamala/chess/v2"
)

func (p *Processor) buildPuzzleSequence(
	ctx context.Context,
	startFEN string,
	solverIsWhite bool,
	initialEval types.EvalResult,
) sequenceResult {
	option, err := lib.FEN(startFEN)
	if err != nil {
		return invalidSequence(ReasonInvalidUCI, err.Error())
	}
	game := lib.NewGame(option)
	seen := map[string]int{positionKey(startFEN): 1}
	moves := make([]string, 0, p.config.MaxSolutionPlies)
	currentEval := initialEval
	mateIn := 0
	if len(currentEval.Lines) > 0 {
		if mate, ok := mateForSide(currentEval.Lines[0].Mate, solverIsWhite); ok && mate > 0 {
			mateIn = mate
		}
	}

	for ply := 0; ; ply++ {
		currentFEN := game.Position().String()
		solverTurn := sideToMoveFromFEN(currentFEN) == sideFromBool(solverIsWhite)
		requiredLines := 1
		if solverTurn {
			legalMoves, legalErr := legalMoveCount(currentFEN)
			if legalErr != nil {
				return invalidSequence(ReasonInvalidUCI, legalErr.Error())
			}
			requiredLines = min(p.config.ConfirmationMultiPV, legalMoves)
		}
		if ply > 0 {
			// A linear puzzle PV stores one engine-best defensive main line. The
			// defender may have equivalent replies; forcedness applies to every
			// solver choice, which is why only solver turns request MultiPV.
			multiPV := 1
			if solverTurn {
				multiPV = p.config.ConfirmationMultiPV
			}
			currentEval, err = p.evaluate(
				ctx,
				currentFEN,
				p.config.ConfirmationDepth,
				multiPV,
				p.config.PuzzleMoveTime,
			)
			if err != nil {
				code, explanation := engineReason(err)
				return invalidSequence(code, explanation)
			}
			if actualDepth, shallow := shallowConfirmationDepth(
				currentEval,
				p.config.ConfirmationDepth,
				requiredLines,
			); shallow {
				return invalidSequence(
					ReasonInsufficientDepth,
					fmt.Sprintf(
						"continuation evaluation reached depth %d; confirmation requires at least depth %d (target %d)",
						actualDepth,
						p.config.ConfirmationDepth,
						p.config.ConfirmationDepth,
					),
				)
			}
		}
		if len(currentEval.Lines) == 0 || len(currentEval.Lines[0].PV) == 0 {
			return invalidSequence(ReasonNoEngineLine, "Stockfish returned no continuation move")
		}
		if len(currentEval.Lines) < requiredLines {
			return invalidSequence(
				ReasonIncompleteMultiPV,
				fmt.Sprintf(
					"Stockfish returned %d continuation lines; %d are required",
					len(currentEval.Lines),
					requiredLines,
				),
			)
		}

		if solverTurn {
			if !hasWinningAdvantage(currentEval.Lines[0], solverIsWhite, p.config.ContinuationMinAdvantageCP) {
				return invalidSequence(
					ReasonAdvantageDisappeared,
					fmt.Sprintf(
						"the best line fell below the continuation requirement of %dcp",
						p.config.ContinuationMinAdvantageCP,
					),
				)
			}
			if requiredLines < 2 {
				trimmed := trimToSolverMove(moves)
				if mateIn == 0 && validSolutionLength(
					trimmed,
					mateIn,
					p.config.MinNonMateSolutionPlies,
					p.config.MaxNonMateSolutionPlies,
				) {
					return validSequence(
						startFEN,
						trimmed,
						solverIsWhite,
						mateIn,
						ReasonContinuationNotForced,
						"the remaining solver continuation is the only legal move",
					)
				}
				return invalidSequence(ReasonOnlyLegalMove, "the solver continuation has only one legal move")
			}
			trimmed := trimToSolverMove(moves)
			if mateIn == 0 && validSolutionLength(
				trimmed,
				mateIn,
				p.config.MinNonMateSolutionPlies,
				p.config.MaxNonMateSolutionPlies,
			) {
				materialGain := materialDifference(currentFEN, solverIsWhite) -
					materialDifference(startFEN, solverIsWhite)
				if materialGain >= p.config.MinTacticalMaterialGain {
					return validSequence(
						startFEN,
						trimmed,
						solverIsWhite,
						mateIn,
						ReasonTacticalPayoffReached,
						fmt.Sprintf(
							"the forced line secured %d point(s) of material and remains stable after best defense",
							materialGain,
						),
					)
				}
			}
			if code, explanation := continuationMoveDecision(currentEval, solverIsWhite, p.config); code != "" {
				if mateIn == 0 && validSolutionLength(
					trimmed,
					mateIn,
					p.config.MinNonMateSolutionPlies,
					p.config.MaxNonMateSolutionPlies,
				) {
					return validSequence(
						startFEN,
						trimmed,
						solverIsWhite,
						mateIn,
						ReasonContinuationNotForced,
						explanation,
					)
				}
				if mateIn > 0 {
					return invalidSequence(code, explanation)
				}
				return invalidSequence(ReasonSolutionTooShort, explanation)
			}
			if mateIn == 0 && solverMoveCount(moves) >= maxNonMateSolverMoves(p.config) {
				return invalidSequence(
					ReasonSolutionTooLong,
					fmt.Sprintf(
						"the tactic still requires a unique solver move after the configured maximum of %d solver moves",
						maxNonMateSolverMoves(p.config),
					),
				)
			}
		}
		if mateIn > 0 && len(moves) >= p.config.MaxSolutionPlies {
			return invalidSequence(
				ReasonMateTooDeep,
				"the mating line did not reach checkmate inside the configured solution limit",
			)
		}

		nextMove := normalizeUCIMove(currentEval.Lines[0].PV[0])
		if nextMove == "" {
			return invalidSequence(ReasonNoEngineLine, "the best principal variation has no move")
		}
		if err := playUCIMove(game, nextMove); err != nil {
			return invalidSequence(
				ReasonInvalidUCI,
				fmt.Sprintf("failed to play %s from %s: %v", nextMove, currentFEN, err),
			)
		}
		moves = append(moves, nextMove)

		status := game.Position().Status()
		if status == lib.Checkmate {
			if solverTurn {
				if mateIn == 0 {
					mateIn = solverMoveCount(moves)
				} else {
					expectedPlies := 2*mateIn - 1
					if len(moves) != expectedPlies {
						return invalidSequence(
							ReasonMateDistanceMismatch,
							fmt.Sprintf(
								"Stockfish announced mate in %d but the validated line ended after %d plies",
								mateIn,
								len(moves),
							),
						)
					}
				}
				return validSequence(
					startFEN,
					moves,
					solverIsWhite,
					mateIn,
					ReasonAccepted,
					"the validated line ends in checkmate",
				)
			}
			return invalidSequence(ReasonAdvantageDisappeared, "the defensive side checkmates the solver")
		}
		if status != lib.NoMethod {
			return invalidSequence(ReasonGameDrawn, fmt.Sprintf("the line ends with %s", status))
		}

		key := positionKey(game.Position().String())
		seen[key]++
		if seen[key] >= 2 {
			return invalidSequence(ReasonRepetition, "the validated line repeats a position")
		}
	}
}

func trimToSolverMove(moves []string) []string {
	trimmed := append([]string(nil), moves...)
	if len(trimmed)%2 == 0 && len(trimmed) > 0 {
		trimmed = trimmed[:len(trimmed)-1]
	}
	return trimmed
}

func validSolutionLength(moves []string, mateIn int, minimumNonMatePlies int, maximumNonMatePlies int) bool {
	if mateIn == 1 {
		return len(moves) >= 1
	}
	return len(moves) >= minimumNonMatePlies &&
		len(moves) <= maximumNonMatePlies &&
		len(moves)%2 == 1
}

func solverMoveCount(moves []string) int {
	return (len(moves) + 1) / 2
}

func maxNonMateSolverMoves(config PipelineConfig) int {
	return (config.MaxNonMateSolutionPlies + 1) / 2
}

func validSequence(
	startFEN string,
	moves []string,
	solverIsWhite bool,
	mateIn int,
	reason string,
	explanation string,
) sequenceResult {
	return sequenceResult{
		PV:          append([]string(nil), moves...),
		MateIn:      mateIn,
		MaterialEnd: materialAfterPV(startFEN, moves, solverIsWhite),
		StopReason:  reason,
		Explanation: explanation,
		Valid:       true,
	}
}

func invalidSequence(reason string, explanation string) sequenceResult {
	return sequenceResult{
		StopReason:  reason,
		Explanation: explanation,
	}
}

func materialAfterPV(startFEN string, moves []string, solverIsWhite bool) int {
	option, err := lib.FEN(startFEN)
	if err != nil {
		return materialDifference(startFEN, solverIsWhite)
	}
	game := lib.NewGame(option)
	for _, move := range moves {
		if err := playUCIMove(game, move); err != nil {
			return materialDifference(startFEN, solverIsWhite)
		}
	}
	return materialDifference(game.Position().String(), solverIsWhite)
}
