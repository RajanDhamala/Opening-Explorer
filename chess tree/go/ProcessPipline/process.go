package Processpipline

import (
	"fmt"
	"strings"
	"time"

	// "errors"
	"chess/Types"
	lib "github.com/notnil/chess"
)

var (
	HashMap        = make(map[string]*types.PositonInfo)
	ProcessedGames = make(map[string]bool)
)

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

	openingName := GetOpeningName(root.ECO)

	var name *string
	gameData := types.DbStore{
		Id:            root.UUID,
		WhiteUsername: root.White.Username,
		BlackUsername: root.Black.Username,
		WhiteRating:   root.White.Rating,
		BlackRating:   root.Black.Rating,
		WhiteAccuracy: whiteAcc,
		BlackAccuracy: blackAcc,
		Result:        result,
		OpeningName:   name,
		ECO:           openingName,
		Format:        root.TimeClass,
		TimeControl:   root.TimeControl,
		PlayedAt:      obj.Date,
		FinalFen:      obj.CurrentPosition,
		Pgn:           moves,
		Termination:   obj.Termination,
		CreatedAt:     time.Now(),
		Url:           root.URL,
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
	// return nil
	var prevChildPosition *types.PositonInfo

	for i, m := range moves {
		if i > 30 {
			break
		}

		if i == 15 {
			eco, test, err := GetOpening(game)
			name = &test
			if err != nil {
				fmt.Println("No opening found")
			} else {
				fmt.Println("Opening:", name, "ECO:", eco)
			}
		}

		game.MoveStr(m.San)
		orginalPositon := game.FEN()
		// position := NormalizeFEN(game.FEN())
		fmt.Println("injected postion:", orginalPositon)

		var current *types.PositonInfo
		if info, exists := HashMap[orginalPositon]; exists {
			current = info
			current.Count++
			current.GamesId = append(current.GamesId, root.UUID)
			current.GamesRef = append(current.GamesRef, &gameData)
			current.WinCount += btoi(IsWin)
			current.LossCount += btoi(IsLoss)
			current.DrawCount += btoi(IsDraw)
			current.Fen = orginalPositon
		} else {
			current = &types.PositonInfo{
				Count:          1,
				GamesId:        []string{root.UUID},
				WinCount:       btoi(IsWin),
				LossCount:      btoi(IsLoss),
				DrawCount:      btoi(IsDraw),
				GamesRef:       []*types.DbStore{&gameData},
				ChildPositions: []*types.PositonInfo{},
				Fen:            orginalPositon,
			}
			HashMap[orginalPositon] = current
		}
		ProcessedGames[root.UUID] = true

		if prevChildPosition != nil {
			prevChildPosition.ChildPositions = append(prevChildPosition.ChildPositions, current)
		}

		prevChildPosition = current
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

func ReturnPosition(fenInput string) any {
	// normalfen := NormalizeFEN(fenInput)
	normalfen := fenInput
	fmt.Println("noramal den:", normalfen)
	if info, exists := HashMap[normalfen]; exists {
		return info
	}

	return nil
}

func NormalizeFEN(fen string) string {
	parts := strings.Split(fen, " ")
	for len(parts) < 4 {
		parts = append(parts, "-")
	}
	return strings.Join(parts[:4], " ")
}
