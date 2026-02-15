package Processpipline

import (
	"fmt"
	// "errors"
	"chess/Utils"
	lib "github.com/notnil/chess"
)

type PositonInfo struct {
	Count     int
	DrawCount int
	WinCount  int
	LossCount int
	GamesId   []string
}

var HashMap = make(map[string]*PositonInfo)

func ProcessPipeline(pgn *utils.Pgn, moves []utils.Move, obj *utils.Game) error {
	fmt.Println("PGN header:", pgn)
	game := lib.NewGame()
	for i, m := range moves {
		if i > 30 {
			fmt.Println("we reached move 15 byee")
			return nil
		}
		game.MoveStr(m.San)
		positon := game.FEN()
		if info, exists := HashMap[positon]; exists {
			info.Count++
			info.GamesId = append(info.GamesId, obj.UUID)
		} else {
			data := PositonInfo{
				Count:   1,
				GamesId: []string{obj.UUID},
			}
			HashMap[positon] = &data
		}

	}

	data := game.MoveHistory()
	fmt.Println("History:")
	for _, move := range data {
		fmt.Println(move)
	}
	return nil
}
