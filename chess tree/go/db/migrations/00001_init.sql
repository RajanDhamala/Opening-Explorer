-- +goose Up

CREATE TYPE plan_type AS ENUM ('freemium', 'premium');

CREATE TABLE Users(
  _id SERIAL PRIMARY KEY,
  fullname TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  chessComName TEXT,
  plan plan_type NOT NULL DEFAULT 'freemium',
  reviewCount integer DEFAULT 0,
  lastReviwed DATE DEFAULT CURRENT_DATE
);

CREATE TABLE Games(
  _id UUID PRIMARY KEY,
  gameurl TEXT NOT NULL,
  whiteusername TEXT NOT NULL,
  blackusername TEXT NOT NULL,
  whiterating integer NOT NULL,
  blackrating integer NOT NULL,
  playercolor TEXT NOT NULL,
  timeclass TEXT NOT NULL,
  result TEXT NOT NULL,
  issuecount integer NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL REFERENCES Users(_id) ON DELETE CASCADE,
  createdate DATE DEFAULT CURRENT_DATE
);

CREATE TABLE Issues(
  _id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES Games(_id) ON DELETE CASCADE,
	MoveIndex      int NOT NULL,
	MoveSAN        TEXT NOT NULL,
	MoveUCI        TEXT  NOT NULL,
	Fen            TEXT NOT NULL,
	SideToMove     TEXT NOT NULL,
	PlayerColor    TEXT NOT NULL,
	UserColor      TEXT NOT NULL,
	IssueType      TEXT NOT NULL,
	PlayedBestMove  BOOLEAN NOT NULL,
	BestMove TEXT NOT NULL,
	Ponder   TEXT NOT NULL,
	PV       TEXT [] NOT NULL,
	Depth    int NOT NULL,
	ScoreCP  int NOT NULL,
	Mate     int NOT NULL,
	AfterScoreCP int NOT NULL,
	AfterMate    int NOT NULL,
	WinProbBefore DOUBLE PRECISION NOT NULL,
	WinProbAfter  DOUBLE PRECISION NOT NULL,
  playedmoveuci TEXT NOT NULL,
  playedmovesan TEXT NOT NULL,
  cpdelta int NOT NULL,
  winprobdelta DOUBLE PRECISION NOT NULL,
  solution TEXT[] NOT NULL
);

CREATE TABLE Puzzles(
_id TEXT PRIMARY KEY,
fen TEXT NOT NULL,
moves TEXT NOT NULL,
rating int NOT NULL,
themes TEXT[] NOT NULL,
openingTags TEXT DEFAULT NULL,
source  TEXT DEFAULT 'lichess',
createdAt DATE DEFAULT CURRENT_DATE
);

CREATE INDEX idx_rating ON Puzzles (rating);
CREATE INDEX idx_themes ON Puzzles USING GIN (themes);

CREATE TABLE PuzzleSessions(
  _id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES Users(_id) ON DELETE CASCADE,  
  puzzle_id TEXT NOT NULL REFERENCES Puzzles(_id),                  
  assigned_at DATE DEFAULT CURRENT_DATE,
  isSolved BOOLEAN DEFAULT FALSE,
  solved_at DATE,                                                  
  UNIQUE(user_id, puzzle_id)                                        
);

CREATE INDEX idx_puzzlesession_user ON PuzzleSessions(user_id);      
CREATE INDEX idx_puzzlesession_puzzle ON PuzzleSessions(puzzle_id); 

-- +goose Down

DROP TABLE IF EXISTS PuzzelSessions;
DROP TABLE IF EXISTS Issues;
DROP TABLE IF EXISTS Games;
DROP TABLE IF EXISTS Users;
DROP TYPE IF EXISTS plan_type;
DROP TABLE IF EXISTS Puzzles;
