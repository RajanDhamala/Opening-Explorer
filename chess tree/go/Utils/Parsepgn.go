package utils

import (
	"fmt"
	"strings"

	// "encoding/json"
	// demo "github.com/notnil/chess"
	"chess/ProcessPipline"
	"chess/Types"
)

func SplitPgn(pgn string) (*types.Pgn, []types.Move) {
	splitted := strings.SplitN(pgn, "\n\n", 2)
	header := ParsePngHeader(splitted[0])
	moves := ParsePgnBody(splitted[1])

	// pgnReader := strings.NewReader(pgn)
	// pgnData, err := demo.PGN(pgnReader) // returns *chess.PGN
	// if err != nil {
	// 	fmt.Println("failed to read the PGN")
	// }
	// game := demo.NewGame(pgnData)
	// for _, move := range game.Moves() {
	// 	fmt.Println("SAN:", move.String()) // or move.String()
	// }
	return header, moves
}

func ParsePngHeader(header string) *types.Pgn {
	pg := types.Pgn{}
	lines := strings.Split(header, "\n")
	for _, line := range lines {
		trimmed := strings.Trim(line, "[]")
		parts := strings.SplitN(trimmed, " ", 2)
		if len(parts) < 2 {
			continue
		}
		key := parts[0]
		val := strings.Trim(parts[1], `"`)

		switch key {
		case "Event":
			pg.Event = val
		case "Site":
			pg.Site = val
		case "Date":
			pg.Date = val
		case "White":
			pg.White = val
		case "Black":
			pg.Black = val
		case "Result":
			pg.Result = val
		case "CurrentPosition":
			pg.CurrentPosition = val
		case "Timezone":
			pg.Timezone = val
		case "ECO":
			pg.ECO = val
		case "ECOUrl":
			pg.ECOUrl = val
		case "UTCDate":
			pg.UTCDate = val
		case "UTCTime":
			pg.UTCTime = val
		case "WhiteElo":
			pg.WhiteElo = val
		case "BlackElo":
			pg.BlackElo = val
		case "TimeControl":
			pg.TimeControl = val
		case "Termination":
			pg.Termination = val
		case "StartTime":
			pg.StartTime = val
		case "EndDate":
			pg.EndDate = val
		case "EndTime":
			pg.EndTime = val
		case "Link":
			pg.Link = val
		}
	}
	return &pg
}

func ParsePgnBody(body string) []types.Move {
	bodyArray := strings.Fields(body)
	var moves []types.Move
	// Result := ""

	for i, item := range bodyArray {
		if strings.HasSuffix(item, ".") {
			continue
		}

		if strings.HasPrefix(item, "{[%clk") {
			if i+1 < len(bodyArray) {
				clock := bodyArray[i+1]
				sanitized := strings.Trim(clock, "]}")
				if len(moves) > 0 {
					moves[len(moves)-1].Clock = sanitized
				}
			}
			continue
		}

		if strings.HasPrefix(item, "0:") {
			continue
		}
		if isPGNResultToken(item) {
			continue
		}

		moves = append(moves, types.Move{
			San: item,
		})
	}
	// b, _ := json.MarshalIndent(moves, "", " ")
	// fmt.Println(string(b))
	// fmt.Println("result:", Result)
	return moves
}

func isPGNResultToken(token string) bool {
	switch strings.TrimSpace(token) {
	case "1-0", "0-1", "1/2-1/2", "*":
		return true
	default:
		return false
	}
}

func ParseAllGames(allgames *types.UserGames, username string) {
	for index, item := range allgames.Games {
		if index > 30 {
			return
		}
		yourcolor := "white"
		if item.Black.Username == username {
			yourcolor = "black"
		}
		splitted := strings.SplitN(item.PGN, "\n\n", 2)
		header := ParsePngHeader(splitted[0])
		moves := ParsePgnBody(splitted[1])
		Processpipline.ProcessPipeline(item, moves, header, yourcolor)
	}
}

func EvaluateAllGames(allgames *types.UserGames, username string) []types.EvalGameInput {
	if allgames == nil || len(allgames.Games) == 0 {
		return nil
	}

	evalGames := make([]types.EvalGameInput, 0, len(allgames.Games))

	for _, game := range allgames.Games {
		if game == nil {
			continue
		}

		splitted := strings.SplitN(game.PGN, "\n\n", 2)
		if len(splitted) < 2 {
			continue
		}
		moves := ParsePgnBody(splitted[1])
		if len(moves) == 0 {
			continue
		}

		isWhite := strings.EqualFold(game.White.Username, username)
		isBlack := strings.EqualFold(game.Black.Username, username)
		if !isWhite && !isBlack {
			continue
		}

		opponentName := game.Black.Username
		opponentRating := game.Black.Rating
		playerColor := "white"
		playerResult := game.White.Result
		if !isWhite {
			opponentName = game.White.Username
			opponentRating = game.White.Rating
			playerColor = "black"
			playerResult = game.Black.Result
		}

		evalGames = append(evalGames, types.EvalGameInput{
			GameID:         game.UUID,
			GameURL:        game.URL,
			WhiteUsername:  game.White.Username,
			BlackUsername:  game.Black.Username,
			WhiteRating:    game.White.Rating,
			BlackRating:    game.Black.Rating,
			OpponentName:   opponentName,
			OpponentRating: opponentRating,
			PlayerColor:    playerColor,
			TimeClass:      game.TimeClass,
			Result:         playerResult,
			Moves:          moves,
			IsWhite:        isWhite,
		})
	}

	return evalGames
}

func MaterialCount(fen string) (int, int) {
	white := 0
	black := 0
	fmt.Println("we got the posion:", fen)
	board := strings.SplitN(fen, " ", 2)[0]

	for _, ch := range board {
		switch ch {
		case 'P':
			white = white + 1
		case 'Q':
			white = white + 9
		case 'N', 'B':
			white = white + 3
		case 'R':
			white = white + 5
		case 'p':
			black = black + 1
		case 'q':
			black = black + 9
		case 'n', 'b':
			black = black + 3
		case 'r':
			black = black + 5
		}
	}
	return white, black
}
