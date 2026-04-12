package Processpipline

import (
	"fmt"
	"strings"
	"time"

	// "errors"
	"chess/Types"
	lib "github.com/RajanDhamala/chess/v2"
)

var (
	HashMap        = make(map[string]*types.PositonInfo)
	ProcessedGames = make(map[string]*types.DbStore)
)

func ProcessPipeline(root *types.Game, moves []types.Move, obj *types.Pgn, color string) error {
	if _, exists := ProcessedGames[root.UUID]; exists {
		fmt.Println("game already processed")
		return nil
	}

	game := lib.NewGame()

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

	prevChildPosition := UpdateUnitialPositon(root, IsWin, IsLoss, IsDraw)

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

		err := game.PushNotationMove(m.San, lib.AlgebraicNotation{}, nil)
		if err != nil {
			return fmt.Errorf("invalid SAN move %s: %w", m.San, err)
		}

		orginalPosition := game.Position().String()
		parts := strings.Split(orginalPosition, " ")
		normalizedFEN := strings.Join(parts[:3], " ")
		// position := NormalizeFEN(game.FEN())
		fmt.Println("injected postion:", normalizedFEN)
		data2store := types.ImpThing{
			Move: m.San,
			Fen:  normalizedFEN,
		}

		var current *types.PositonInfo
		var linear bool
		if info, exists := HashMap[normalizedFEN]; exists {
			current = info
			current.Count++
			current.GamesId = append(current.GamesId, root.UUID)
			// current.GamesRef = append(current.GamesRef, &gameData)
			current.WinCount += btoi(IsWin)
			current.LossCount += btoi(IsLoss)
			current.DrawCount += btoi(IsDraw)
			current.Fen = normalizedFEN
			linear = true
		} else {
			current = &types.PositonInfo{
				Count:     1,
				GamesId:   []string{root.UUID},
				WinCount:  btoi(IsWin),
				LossCount: btoi(IsLoss),
				DrawCount: btoi(IsDraw),
				// GamesRef:       []*types.DbStore{&gameData},
				ChildPositions: []*types.PositonInfo{},
				Fen:            normalizedFEN,
			}
			HashMap[normalizedFEN] = current
			linear = false
		}
		ProcessedGames[root.UUID] = &gameData

		if prevChildPosition != nil {
			// prevChildPosition.ChildPositions = append(prevChildPosition.ChildPositions, current)
			if linear {
			} else {
				prevChildPosition.ChildFens = append(prevChildPosition.ChildFens, data2store)
			}
		}

		prevChildPosition = current
	}
	return nil
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
	normalfen := NormalizeFEN(fenInput)
	// normalfen := fenInput
	fmt.Println("noramal den:", normalfen)
	if info, exists := HashMap[normalfen]; exists {
		return info
	}

	return nil
}

func NormalizeFEN(fen string) string {
	parts := strings.Split(fen, " ")
	normalizedFEN := strings.Join(parts[:3], " ")
	fmt.Println("normalized query:", normalizedFEN)
	return normalizedFEN
}

func GetGameData(gameId string) *types.DbStore {
	if info, exists := ProcessedGames[gameId]; exists {
		fmt.Println("game found")
		return info
	} else {
		fmt.Println("game data not found")
		return nil
	}
}

func UpdateUnitialPositon(root *types.Game, IsWin bool, IsLoss bool, IsDraw bool) *types.PositonInfo {
	startFEN := "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq"

	if info, exists := HashMap[startFEN]; exists {
		info.Count++
		info.GamesId = append(info.GamesId, root.UUID)
		info.WinCount += btoi(IsWin)
		info.LossCount += btoi(IsLoss)
		info.DrawCount += btoi(IsDraw)
		return info
	}

	data := &types.PositonInfo{
		Count:     1,
		WinCount:  btoi(IsWin),
		LossCount: btoi(IsLoss),
		DrawCount: btoi(IsDraw),
		GamesId:   []string{root.UUID},
		Fen:       startFEN,
	}

	HashMap[startFEN] = data
	return data
}
