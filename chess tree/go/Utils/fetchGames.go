package utils

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	// "github.com/notnil/chess"
	"chess/Types"
)

var (
	name     = "i_use_nvim_btw"
	gameJSON interface{}
)

func FetchProcess() (*types.UserGames, error) {
	fmt.Println("welcome to the test server")

	response, err := http.Get("http://localhost:3000/archives")
	if err != nil {
		return nil, errors.New("error hitting endpoint")
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, errors.New("failed to read the body")
	}

	igotdata := types.ArchiveResponse{}
	if err := json.Unmarshal(data, &igotdata); err != nil {
		return nil, errors.New("failed to parse the JSON")
	}

	url := igotdata.Data.Archives[len(igotdata.Data.Archives)-1]
	parts := strings.Split(url, "/")
	timeframe := types.Timeline{
		Year:  parts[len(parts)-2],
		Month: parts[len(parts)-1],
	}

	gameData, err := http.Get("http://localhost:3000/fetchGames/" + timeframe.Year + "/" + timeframe.Month + "/" + "tinku")
	if err != nil {
		return nil, errors.New("error during API call")
	}
	defer gameData.Body.Close()

	parsedData, err := io.ReadAll(gameData.Body)
	if err != nil {
		return nil, errors.New("failed to read game data")
	}

	intermediate := types.IntermeObj{}
	if err := json.Unmarshal(parsedData, &intermediate); err != nil {
		return nil, errors.New("failed to unmarshal game data")
	}

	uPlayed := types.UserGames{}
	count := 0
	for i := range intermediate.Data.Games {
		count++
		uPlayed.Games = append(uPlayed.Games, &intermediate.Data.Games[i])
	}
	fmt.Println("total no of games:", count)

	return &uPlayed, nil
}
