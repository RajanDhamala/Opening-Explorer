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

type EvalLine struct {
	MultiPV int
	PV      []string
	Depth   int
	ScoreCP *int
	Mate    *int
}

type EvalResult struct {
	BestMove string
	Ponder   string
	PV       []string
	Solution []string
	Depth    int
	ScoreCP  *int
	Mate     *int
	Lines    []EvalLine
}

type MoveIssueType string

const (
	MoveIssueMistake          MoveIssueType = "mistake"
	MoveIssueBlunder          MoveIssueType = "blunder"
	MoveIssueLostAdvantage    MoveIssueType = "lost_advantage"
	MoveIssueForcedMateMissed MoveIssueType = "forced_mate_missed"
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
	Solution []string
	Depth    int
	ScoreCP  *int
	Mate     *int

	AfterScoreCP *int
	AfterMate    *int

	WinProbBefore float64
	WinProbAfter  float64
	CPDelta       int
	WinProbDelta  float64
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

// IssueRow represents a row for pgx CopyFrom bulk insert into Issues table.
// All fields are non-pointer to match the NOT NULL constraints in schema.
type IssueRow struct {
	ID             [16]byte // UUID as raw bytes for pgx
	GameID         [16]byte
	MoveIndex      int32
	MoveSAN        string
	MoveUCI        string
	PlayedMoveUCI  string
	PlayedMoveSAN  string
	Fen            string
	SideToMove     string
	PlayerColor    string
	UserColor      string
	IssueType      string
	PlayedBestMove bool
	BestMove       string
	Ponder         string
	PV             []string
	Solution       []string
	Depth          int32
	ScoreCP        int32
	Mate           int32
	AfterScoreCP   int32
	AfterMate      int32
	WinProbBefore  float64
	WinProbAfter   float64
	CPDelta        int32
	WinProbDelta   float64
}

// Values returns the row values in column order for pgx CopyFrom
func (r IssueRow) Values() []interface{} {
	pv := r.PV
	if pv == nil {
		pv = []string{}
	}
	solution := r.Solution
	if solution == nil {
		solution = []string{}
	}
	return []interface{}{
		r.ID,
		r.GameID,
		r.MoveIndex,
		r.MoveSAN,
		r.MoveUCI,
		r.PlayedMoveUCI,
		r.PlayedMoveSAN,
		r.Fen,
		r.SideToMove,
		r.PlayerColor,
		r.UserColor,
		r.IssueType,
		r.PlayedBestMove,
		r.BestMove,
		r.Ponder,
		pv,
		solution,
		r.Depth,
		r.ScoreCP,
		r.Mate,
		r.AfterScoreCP,
		r.AfterMate,
		r.WinProbBefore,
		r.WinProbAfter,
		r.CPDelta,
		r.WinProbDelta,
	}
}

// MoveIssueToRow converts MoveIssue to IssueRow for bulk insert.
// Handles pointer-to-value conversion for ScoreCP/Mate fields (nil → 0).
func MoveIssueToRow(issue MoveIssue, issueID [16]byte, gameID [16]byte) IssueRow {
	scoreCP := int32(0)
	if issue.ScoreCP != nil {
		scoreCP = int32(*issue.ScoreCP)
	}
	mate := int32(0)
	if issue.Mate != nil {
		mate = int32(*issue.Mate)
	}
	afterScoreCP := int32(0)
	if issue.AfterScoreCP != nil {
		afterScoreCP = int32(*issue.AfterScoreCP)
	}
	afterMate := int32(0)
	if issue.AfterMate != nil {
		afterMate = int32(*issue.AfterMate)
	}
	pv := []string{}
	if len(issue.PV) > 0 {
		pv = append([]string(nil), issue.PV...)
	}
	solution := []string{}
	if len(issue.Solution) > 0 {
		solution = append([]string(nil), issue.Solution...)
	}

	return IssueRow{
		ID:             issueID,
		GameID:         gameID,
		MoveIndex:      int32(issue.MoveIndex),
		MoveSAN:        issue.MoveSAN,
		MoveUCI:        issue.MoveUCI,
		PlayedMoveUCI:  issue.MoveUCI,
		PlayedMoveSAN:  issue.MoveSAN,
		Fen:            issue.Fen,
		SideToMove:     issue.SideToMove,
		PlayerColor:    issue.PlayerColor,
		UserColor:      issue.UserColor,
		IssueType:      string(issue.IssueType),
		PlayedBestMove: issue.PlayedBestMove,
		BestMove:       issue.BestMove,
		Ponder:         issue.Ponder,
		PV:             pv,
		Solution:       solution,
		Depth:          int32(issue.Depth),
		ScoreCP:        scoreCP,
		Mate:           mate,
		AfterScoreCP:   afterScoreCP,
		AfterMate:      afterMate,
		WinProbBefore:  issue.WinProbBefore,
		WinProbAfter:   issue.WinProbAfter,
		CPDelta:        int32(issue.CPDelta),
		WinProbDelta:   issue.WinProbDelta,
	}
}

type Puzzle struct {
	Id          string
	Fen         string
	Moves       string
	Rating      int
	Themes      []string
	OpeningTags string
}
