package utils

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	// "github.com/notnil/chess"
	"errors"
	"math/rand"
	"time"
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

func FetchProcess() (*Pgn, []Move, *Game, error) {
	fmt.Println("welcome to the test server")

	response, err := http.Get("http://localhost:3000/archives")
	if err != nil {
		return nil, nil, nil, errors.New("error hitting endpoint")
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, nil, nil, errors.New("failed to read the body")
	}

	igotdata := ArchiveResponse{}
	if err := json.Unmarshal(data, &igotdata); err != nil {
		return nil, nil, nil, errors.New("failed to parse the JSON")
	}

	url := igotdata.Data.Archives[len(igotdata.Data.Archives)-1]
	parts := strings.Split(url, "/")
	timeframe := Timeline{
		Year:  parts[len(parts)-2],
		Month: parts[len(parts)-1],
	}

	gameData, err := http.Get("http://localhost:3000/fetchGames/" + timeframe.Year + "/" + timeframe.Month + "/" + "tinku")
	if err != nil {
		return nil, nil, nil, errors.New("error during API call")
	}
	defer gameData.Body.Close()

	parsedData, err := io.ReadAll(gameData.Body)
	if err != nil {
		return nil, nil, nil, errors.New("failed to read game data")
	}

	intermediate := IntermeObj{}
	if err := json.Unmarshal(parsedData, &intermediate); err != nil {
		return nil, nil, nil, errors.New("failed to unmarshal game data")
	}

	var userGames []*Game
	for i := range intermediate.Data.Games {
		userGames = append(userGames, &intermediate.Data.Games[i])
	}

	// pick a random game
	rand.Seed(time.Now().UnixNano())
	var selectedGame *Game
	if len(userGames) > 0 {
		selectedGame = userGames[rand.Intn(len(userGames))]
	} else {
		return nil, nil, nil, errors.New("no game found for user")
	}

	if selectedGame == nil {
		return nil, nil, nil, errors.New("no game found for user")
	}

	pgn := selectedGame.PGN
	parsedPgn, moves := SplitPgn(pgn)
	fmt.Println("moves:", moves, "pgn:", parsedPgn)

	return parsedPgn, moves, selectedGame, nil
}
