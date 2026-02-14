-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chess_com_username TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    link TEXT NOT NULL UNIQUE,
    white_username TEXT NOT NULL,
    black_username TEXT NOT NULL,
    white_elo INT,
    black_elo INT,
    result TEXT NOT NULL,
    time_class TEXT NOT NULL CHECK (time_class IN ('blitz', 'rapid', 'bullet')),
    time_control TEXT,
    pgn TEXT NOT NULL,
    played_at TIMESTAMPTZ NOT NULL,
    eco TEXT,
    termination TEXT,
    white_accuracy FLOAT,
    black_accuracy FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_games ON games(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_class ON games(user_id, time_class);

-- Position statistics per user
CREATE TABLE IF NOT EXISTS position_stats (
    id BIGSERIAL PRIMARY KEY,
    fen TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    color TEXT NOT NULL CHECK (color IN ('white', 'black')),
    time_class TEXT NOT NULL CHECK (time_class IN ('blitz', 'rapid', 'bullet')),
    win_count INT DEFAULT 0,
    loss_count INT DEFAULT 0,
    draw_count INT DEFAULT 0,
    game_count INT DEFAULT 0,
    latest_game_id UUID REFERENCES games(id),
    latest_played_at TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fen, user_id, color, time_class)
);

CREATE INDEX IF NOT EXISTS idx_position_lookup ON position_stats(user_id, fen, color, time_class);
CREATE INDEX IF NOT EXISTS idx_latest_game ON position_stats(user_id, latest_played_at DESC);

-- Move tree for position relationships
CREATE TABLE IF NOT EXISTS move_tree (
    fen TEXT PRIMARY KEY,
    parent_fen TEXT,
    move_number INT NOT NULL,
    last_move_san TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_parent_lookup ON move_tree(parent_fen);
CREATE INDEX IF NOT EXISTS idx_move_number ON move_tree(move_number);

-- Game positions junction table
CREATE TABLE IF NOT EXISTS game_positions (
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    fen TEXT NOT NULL,
    move_number INT NOT NULL,
    PRIMARY KEY (game_id, move_number)
);

CREATE INDEX IF NOT EXISTS idx_position_games ON game_positions(fen);
