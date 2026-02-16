package Processpipline

import (
	"fmt"

	"github.com/notnil/chess"
	"github.com/notnil/chess/opening"
)

// Load once at package level
var ecoBook = opening.NewBookECO()

func GetOpening(game *chess.Game) (string, string, error) {
	if game == nil {
		return "", "", fmt.Errorf("game is nil")
	}

	o := ecoBook.Find(game.Moves())
	if o == nil {
		return "", "", fmt.Errorf("no opening found")
	}

	return o.Code(), o.Title(), nil
}
