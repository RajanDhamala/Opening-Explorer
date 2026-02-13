CREATE TABLE positions (
    fen TEXT PRIMARY KEY,
    reach_count INT NOT NULL DEFAULT 0,
    white_wins INT NOT NULL DEFAULT 0,
    black_wins INT NOT NULL DEFAULT 0,
    draws INT NOT NULL DEFAULT 0
);

CREATE TABLE moves (
    fen TEXT NOT NULL,
    move TEXT NOT NULL,
    play_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (fen, move),
    FOREIGN KEY (fen) REFERENCES positions(fen) ON DELETE CASCADE
);

CREATE TABLE games (
    game_id TEXT PRIMARY KEY,
    white_player TEXT NOT NULL,
    black_player TEXT NOT NULL,
    white_rating INT,
    black_rating INT,
    result TEXT NOT NULL, 
    link TEXT,
    date_played TIMESTAMP
);

CREATE TABLE positions_in_games (
    game_id TEXT NOT NULL,
    fen TEXT NOT NULL,
    move_played TEXT,
    ply_number INT,  
    PRIMARY KEY (game_id, fen),
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    FOREIGN KEY (fen) REFERENCES positions(fen) ON DELETE CASCADE
);
