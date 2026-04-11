package utils

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"chess/Types"
)

func FetchProcess(username string) (*types.UserGames, error) {
	fmt.Println("welcome to the test server")
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, errors.New("username is required")
	}

	response, err := http.Get("http://localhost:3000/archives")
	if err != nil {
		return nil, errors.New("error hitting endpoint")
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, errors.New("failed to read the body")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("archives endpoint returned %d: %s", response.StatusCode, strings.TrimSpace(string(data)))
	}

	igotdata := types.ArchiveResponse{}
	fmt.Println("data received from endpoint:", string(data))
	if err := json.Unmarshal(data, &igotdata); err != nil {
		return nil, errors.New("failed to parse the JSON")
	}

	if len(igotdata.Data.Archives) == 0 {
		return nil, errors.New("no archives found")
	}
	url := igotdata.Data.Archives[len(igotdata.Data.Archives)-2]
	parts := strings.Split(url, "/")
	timeframe := types.Timeline{
		Year:  parts[len(parts)-2],
		Month: parts[len(parts)-1],
	}

	gameData, err := http.Get("http://localhost:3000/fetchGames/" + timeframe.Year + "/" + timeframe.Month + "/" + username)
	if err != nil {
		return nil, errors.New("error during API call")
	}
	defer gameData.Body.Close()

	parsedData, err := io.ReadAll(gameData.Body)
	if err != nil {
		return nil, errors.New("failed to read game data")
	}
	if gameData.StatusCode < 200 || gameData.StatusCode >= 300 {
		return nil, fmt.Errorf("fetchGames endpoint returned %d: %s", gameData.StatusCode, strings.TrimSpace(string(parsedData)))
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
