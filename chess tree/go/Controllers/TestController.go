package Controllers

import (
	"chess/ProcessPipline"
	"chess/Types"
	"chess/Utils"

	"github.com/gofiber/fiber/v2"
)

// SingleGame runs the real processing pipeline against a fixed game while the
// puzzle thresholds are being tuned. It does not read or write the database.
func (ctrl *Controller) SingleGame(c *fiber.Ctx) error {
	if utils.Client == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "stockfish client not initialized",
		})
	}

	sanMoves := []string{
		"e4",
		"e5",
		"Nf3",
		"Nc6",
		"Bc4",
		"Nf6",
		"Ng5",
		"d5",
		"exd5",
		"Nxd5",
		"Nxf7",
		"Kxf7",
		"Qf3+",
		"Ke6",
		"Nc3",
		"Nb4",
		"O-O",
	}
	moves := make([]types.Move, 0, len(sanMoves))
	for _, san := range sanMoves {
		moves = append(moves, types.Move{San: san})
	}

	config := Processpipline.DefaultPipelineConfig()
	config.SkipInitialPlies = 0
	config.Diagnostics.Enabled = true
	config.Diagnostics.LogRejections = true

	result := Processpipline.NewProcessor(utils.Client, config).AnalyzeGame(
		c.Context(),
		types.EvalGameInput{
			GameID:      "debug-hardcoded-game",
			PlayerColor: "white",
			Moves:       moves,
			IsWhite:     true,
		},
	)

	status := fiber.StatusOK
	if result.Error != "" {
		status = fiber.StatusUnprocessableEntity
	}
	return c.Status(status).JSON(result)
}
