package utils

import (
	"encoding/json"
	"fmt"
	"strings"
)

type Pgn struct {
	Event           string
	Site            string
	Date            string
	White           string
	Black           string
	Result          string
	CurrentPosition string
	Timezone        string
	ECO             string
	ECOUrl          string
	UTCDate         string
	UTCTime         string
	WhiteElo        string
	BlackElo        string
	TimeControl     string
	Termination     string
	StartTime       string
	EndDate         string
	EndTime         string
	Link            string
}

type Move struct {
	San   string
	Clock string
}

func SplitPgn(pgn string) {
	splitted := strings.SplitN(pgn, "\n\n", 2)
	ParsePngHeader(splitted[0])
	ParsePgnBody(splitted[1])
	// fmt.Printf("PGN Header Struct:\n%+v\n", addr)
}

func ParsePngHeader(header string) *Pgn {
	pg := Pgn{}
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

func ParsePgnBody(body string) []Move {
	bodyArray := strings.Fields(body)
	var moves []Move
	Result := ""

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
			fmt.Println("game is over")
			Result = item
			continue
		}

		moves = append(moves, Move{
			San: item,
		})
	}
	b, _ := json.MarshalIndent(moves, "", " ")
	fmt.Println(string(b))
	fmt.Println("result:", Result)
	return moves
}
