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
  winprobdelta DOUBLE PRECISION NOT NULL 
);

-- +goose Down

DROP TABLE IF EXISTS Issues;
DROP TABLE IF EXISTS Games;
DROP TABLE IF EXISTS Users;
DROP TYPE IF EXISTS plan_type;

