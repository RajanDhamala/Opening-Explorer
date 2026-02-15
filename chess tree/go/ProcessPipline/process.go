package Processpipline

import (
	"fmt"
	// "errors"
	"chess/Types"
	lib "github.com/notnil/chess"
)

var HashMap = make(map[string]*types.PositonInfo)

func ProcessPipeline(root *types.Game, moves []types.Move, obj *types.Pgn, color string) error {
	game := lib.NewGame()
	UpdateUnitialPositon(root)
	result := obj.Result
	conclusion := CheckIfUsrWon(result, color)
	fmt.Println("conclusion:", conclusion)

	IsWin := false
	IsLoss := false
	IsDraw := false

	switch conclusion {
	case "win":
		IsWin = true
	case "loss":
		IsLoss = true
	case "draw":
		IsDraw = true
	}

	for i, m := range moves {
		if i > 30 {
			fmt.Println("we reached move 30, stopping early")
			break
		}

		game.MoveStr(m.San)
		position := game.FEN()

		if info, exists := HashMap[position]; exists {
			info.Count++
			info.GamesId = append(info.GamesId, root.UUID)
			info.WinCount += btoi(IsWin)
			info.LossCount += btoi(IsLoss)
			info.DrawCount += btoi(IsDraw)
		} else {
			HashMap[position] = &types.PositonInfo{
				Count:     1,
				GamesId:   []string{root.UUID},
				WinCount:  btoi(IsWin),
				LossCount: btoi(IsLoss),
				DrawCount: btoi(IsDraw),
			}
		}
	}

	data := game.MoveHistory()
	fmt.Println("History of moves:")
	for _, move := range data {
		fmt.Println(move)
	}

	return nil
}

func UpdateUnitialPositon(root *types.Game) {
	if info, exists := HashMap["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]; exists {
		info.Count++
		info.GamesId = append(info.GamesId, root.UUID)
	} else {
		data := types.PositonInfo{
			Count:   1,
			GamesId: []string{root.UUID},
		}
		HashMap["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"] = &data
	}
}

func btoi(b bool) int {
	if b {
		return 1
	}
	return 0
}

func CheckIfUsrWon(result string, color string) string {
	if color == "" {
		color = "white"
	}
	switch result {
	case "1-0":
		if color == "white" {
			return "win"
		}
		return "loss"
	case "0-1":
		if color == "black" {
			return "win"
		}
		return "loss"
	case "1/2-1/2":
		return "draw"
	default:
		return "unknown"
	}
}
