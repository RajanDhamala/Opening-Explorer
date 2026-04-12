package Processpipline

import (
	"fmt"

	"github.com/RajanDhamala/chess/v2"
	opening "github.com/RajanDhamala/chess/v2/opening"
)

var book = opening.NewBookECO()

func GetOpening(game *chess.Game) (string, string, error) {
	if game == nil {
		return "", "", fmt.Errorf("game is nil")
	}

	o := book.Find(game.Moves())
	if o == nil {
		return "", "", fmt.Errorf("no opening found")
	}

	return o.Code(), o.Title(), nil
}
