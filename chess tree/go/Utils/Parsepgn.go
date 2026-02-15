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
		if strings.HasPrefix(item, "1-0") || strings.HasPrefix(item, "0-1") {
			// fmt.Println("game is over")
			// Result = item
			continue
		}

		moves = append(moves, types.Move{
			San: item,
		})
	}
	// b, _ := json.MarshalIndent(moves, "", " ")
	// fmt.Println(string(b))
	// fmt.Println("result:", Result)
	fmt.Println("moves array:", moves)
	return moves
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
