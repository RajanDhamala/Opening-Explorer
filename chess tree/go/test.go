package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	// "github.com/notnil/chess"
)

var (
	name     = "i_use_nvim_btw"
	gameJSON interface{}
)

type ArchiveResponse struct {
	Data struct {
		Archives []string `json:"archives"`
	} `json:"data"`
}

type Accuracies struct {
	Black float64 `json:"black,omitempty"`
	White float64 `json:"white,omitempty"`
}

type IntermeObj struct {
	Data struct {
		Games []Game `json:"games"`
	} `json:"data"`
}

type Game struct {
	Accuracies   *Accuracies `json:"accuracies,omitempty"`
	Black        Player      `json:"black"`
	White        Player      `json:"white"`
	ECO          string      `json:"eco"`
	EndTime      int64       `json:"end_time"`
	FEN          string      `json:"fen"`
	InitialSetup string      `json:"initial_setup"`
	PGN          string      `json:"pgn"`
	Rated        bool        `json:"rated"`
	Rules        string      `json:"rules"`
	TCN          string      `json:"tcn"`
	TimeClass    string      `json:"time_class"`
	TimeControl  string      `json:"time_control"`
	URL          string      `json:"url"`
	UUID         string      `json:"uuid"`
}

type Player struct {
	ID       string `json:"@id"`
	Rating   int    `json:"rating"`
	Result   string `json:"result"`
	Username string `json:"username"`
	UUID     string `json:"uuid"`
}

type Timeline struct {
	Year  string `json:"year"`
	Month string `json:"month"`
}

func main() {
	fmt.Println("welcome to the teset server ")
	response, err := http.Get("http://localhost:3000/archives")
	if err != nil {
		fmt.Println("failed to read the body")
	}

	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		fmt.Println("failed to read the body")
	}
	igotdata := ArchiveResponse{}

	errors := json.Unmarshal(data, &igotdata)
	if errors != nil {
		fmt.Println("failed to parse the json")
	}
	pretty, _ := json.MarshalIndent(igotdata, "", "  ")
	fmt.Println(string(pretty))

	url := igotdata.Data.Archives[len(igotdata.Data.Archives)-1]
	parts := strings.Split(url, "/")
	timeframe := Timeline{
		Year:  parts[len(parts)-2],
		Month: parts[len(parts)-1],
	}

	fmt.Println("url:", url)
	fmt.Println("time line obj:", timeframe)

	gameData, err := http.Get("http://localhost:3000/fetchGames/" + timeframe.Year + "/" + timeframe.Month + "/" + "tinku")
	if err != nil {
		fmt.Println("error during api call", err)
	}
	defer gameData.Body.Close()

	parsedData, err := io.ReadAll(gameData.Body)
	if err != nil {
		fmt.Println("failed to parse the body")
	}
	err = json.Unmarshal(parsedData, &gameJSON)
	if err != nil {
		fmt.Println("failed to unmarshal game data", err)
		return
	}

	intermidiate := IntermeObj{}
	if err := json.Unmarshal(parsedData, &intermidiate); err != nil {
		fmt.Println("error during inintlizing games object")
	}
	var selectedGame *Game
	for i := range intermidiate.Data.Games {
		if intermidiate.Data.Games[i].White.Username == "I_use_NVIM_Btw" {
			selectedGame = &intermidiate.Data.Games[i]
			break
		}
	}
	pgn := selectedGame.PGN
	lines := strings.Split(pgn, "\n")

	// noraml unoptmized switch case to parse pgn
	for _, item := range lines {
		switch {
		case strings.HasPrefix(item, "[Site"):
			fmt.Println("Site:", item)

		case strings.HasPrefix(item, "[Date"):
			fmt.Println("Date:", item)

		case strings.HasPrefix(item, "[White"):
			fmt.Println("White:", item)

		case strings.HasPrefix(item, "[Black"):
			fmt.Println("Black:", item)

		case strings.HasPrefix(item, "[Result"):
			fmt.Println("Result:", item)

		case strings.HasPrefix(item, "[CurrentPosition"):
			fmt.Println("Current Position:", item)

		case strings.HasPrefix(item, "[ECOUrl"):
			fmt.Println("ECO URL:", item)

		case strings.HasPrefix(item, "[UTCTime"):
			fmt.Println("UTC Time:", item)

		case strings.HasPrefix(item, "[WhiteElo"):
			fmt.Println("White Elo:", item)

		case strings.HasPrefix(item, "[BlackElo"):
			fmt.Println("Black Elo:", item)

		case strings.HasPrefix(item, "[TimeControl"):
			fmt.Println("Time Control:", item)

		case strings.HasPrefix(item, "[Termination"):
			fmt.Println("Termination:", item)

		case strings.HasPrefix(item, "[StartTime"):
			fmt.Println("Start Time:", item)

		case strings.HasPrefix(item, "[EndTime"):
			fmt.Println("End Time:", item)

		case strings.HasPrefix(item, "[Link"):
			fmt.Println("Link:", item)

		case strings.HasPrefix(item, "1."):
			fmt.Println("Moves start here:", item)
		}
	}
}
