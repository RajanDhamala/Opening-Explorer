
SELECT * 
FROM positions
WHERE fen = $1;

UPDATE positions
SET reach_count = reach_count + 1
WHERE fen = $1;

INSERT INTO positions (fen, reach_count, white_wins, black_wins, draws)
VALUES ($1, 0, 0, 0, 0)
RETURNING *;
