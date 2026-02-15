package types

type PositonInfo struct {
	Count     int
	DrawCount int
	WinCount  int
	LossCount int
	GamesId   []string
}

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

type UserGames struct {
	Games []*Game
}
