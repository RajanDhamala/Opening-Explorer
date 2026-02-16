package Processpipline

import (
	"fmt"
	"strings"
	"time"

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

	var whiteAcc *float64
	var blackAcc *float64

	if root.Accuracies != nil {
		whiteAcc = &root.Accuracies.White
		blackAcc = &root.Accuracies.Black
	}

	gameData := types.DbStore{
		Id:            root.UUID,
		WhiteUsername: root.White.Username,
		BlackUsername: root.Black.Username,
		WhiteRating:   root.White.Rating,
		BlackRating:   root.Black.Rating,
		WhiteAccuracy: whiteAcc,
		BlackAccuracy: blackAcc,
		Result:        result,
		OpeningName:   "demo rn",
		ECO:           root.ECO,
		Format:        root.TimeClass,
		TimeControl:   root.TimeControl,
		PlayedAt:      obj.Date,
		FinalFen:      obj.CurrentPosition,
		Pgn:           moves,
		CreatedAt:     time.Now(),
	}
	fmt.Println("gameData:", gameData)

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
	GetOpeningName(root.ECO)
	// return nil
	var prevChildPosition *types.PositonInfo

	for i, m := range moves {
		if i > 30 {
			break
		}

		if i == 15 {
			eco, name, err := GetOpening(game)
			if err != nil {
				fmt.Println("No opening found")
			} else {
				fmt.Println("Opening:", name, "ECO:", eco)
			}
		}

		game.MoveStr(m.San)
		position := game.FEN()

		var current *types.PositonInfo
		if info, exists := HashMap[position]; exists {
			current = info
			current.Count++
			current.GamesId = append(current.GamesId, root.UUID)
			current.GamesRef = append(current.GamesRef, root)
			current.WinCount += btoi(IsWin)
			current.LossCount += btoi(IsLoss)
			current.DrawCount += btoi(IsDraw)
		} else {
			current = &types.PositonInfo{
				Count:          1,
				GamesId:        []string{root.UUID},
				WinCount:       btoi(IsWin),
				LossCount:      btoi(IsLoss),
				DrawCount:      btoi(IsDraw),
				GamesRef:       []*types.Game{root},
				ChildPositions: []*types.PositonInfo{},
			}
			HashMap[position] = current
		}

		if prevChildPosition != nil {
			prevChildPosition.ChildPositions = append(prevChildPosition.ChildPositions, current)
		}

		prevChildPosition = current
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

func GetOpeningName(eco string) string {
	fmt.Println("string:", eco)
	prefix := "https://www.chess.com/openings/"
	trimmed := strings.TrimPrefix(eco, prefix)
	fmt.Println("trimmed data:", trimmed)
	return trimmed
}
