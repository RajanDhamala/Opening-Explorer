package types

import (
	"time"
)

type PositonInfo struct {
	Count          int
	DrawCount      int
	WinCount       int
	LossCount      int
	GamesId        []string
	GamesRef       []*DbStore
	ChildPositions []*PositonInfo
	Fen            string
	ChildFens      []ImpThing
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

type DbStore struct {
	Id string

	WhiteUsername string
	BlackUsername string
	WhiteRating   int
	BlackRating   int
	WhiteAccuracy *float64
	BlackAccuracy *float64

	Result      string
	OpeningName *string
	ECO         string

	Format      string
	TimeControl string
	Termination string

	PlayedAt  string
	FinalFen  string
	Pgn       []Move
	CreatedAt time.Time
	Url       string
}

type ImpThing struct {
	Fen  string
	Move string
}

type PositonEval struct {
	Move       string
	Fen        string
	Evaluation EvalResult
}

type EvalResult struct {
	BestMove string
	Ponder   string
	PV       []string
	Depth    int
	ScoreCP  *int
	Mate     *int
}

type MoveIssueType string

const (
	MoveIssueInaccuracy        MoveIssueType = "inaccuracy"
	MoveIssueMistake           MoveIssueType = "mistake"
	MoveIssueBlunder           MoveIssueType = "blunder"
	MoveIssueMissedOpportunity MoveIssueType = "missed_opportunity"
	MoveIssueForcedMate        MoveIssueType = "forced_mate_available"
	MoveIssueForcedMateMissed  MoveIssueType = "forced_mate_missed"
	MoveIssueBeingMated        MoveIssueType = "being_mated"
)

type MoveIssue struct {
	MoveIndex      int
	MoveSAN        string
	MoveUCI        string
	Fen            string
	SideToMove     string
	PlayerColor    string
	UserColor      string
	IssueType      MoveIssueType
	PlayedBestMove bool

	BestMove string
	Ponder   string
	PV       []string
	Depth    int
	ScoreCP  *int
	Mate     *int

	AfterScoreCP *int
	AfterMate    *int

	WinProbBefore float64
	WinProbAfter  float64
}

type EvalGameInput struct {
	GameID         string
	GameURL        string
	WhiteUsername  string
	BlackUsername  string
	WhiteRating    int
	BlackRating    int
	OpponentName   string
	OpponentRating int
	PlayerColor    string
	TimeClass      string
	Result         string
	Moves          []Move
	IsWhite        bool
}

type EvalGameResult struct {
	GameID         string
	GameURL        string
	WhiteUsername  string
	BlackUsername  string
	WhiteRating    int
	BlackRating    int
	OpponentName   string
	OpponentRating int
	PlayerColor    string
	TimeClass      string
	Result         string
	IssueCount     int
	Issues         []MoveIssue
}

type JwtObj struct {
	ID       string
	Fullname string
	Email    string
}
