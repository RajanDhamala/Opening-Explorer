package Processpipline

import (
	"fmt"
	// "errors"
	"chess/Utils"
	lib "github.com/notnil/chess"
)

func ProcessPipeline(pgn *utils.Pgn, moves []utils.Move) error {
	fmt.Println("PGN header:", pgn)
	game := lib.NewGame()
	for _, m := range moves {
		fmt.Println("move played:", m.San)
		game.MoveStr(m.San)
	}
	data := game.MoveHistory()
	fmt.Println("History:")
	for _, move := range data {
		fmt.Println(move)
	}
	return nil
}
