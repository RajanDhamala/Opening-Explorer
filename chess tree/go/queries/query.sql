-- name: RegisterUser :one
INSERT INTO users (fullname,email,password)
VALUES ($1,$2,$3)
RETURNING _id;

-- name: CheckIfusrExists :one
SELECT _id FROM users WHERE email=$1;

-- name: LoginUser :one
SELECT _id, fullname,email,password FROM users WHERE email=$1;

-- name: ChangePassword :exec
UPDATE users SET password=$1 WHERE _id=$2;

-- name: CreateGame :exec
INSERT INTO Games (_id, gameurl, whiteusername, blackusername, whiterating, blackrating, playercolor, timeclass, result, issuecount, user_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11);

-- name: CreateGamesBulk :exec
WITH payload AS (
  SELECT
    sqlc.arg(ids)::uuid[] AS ids,
    sqlc.arg(gameurls)::text[] AS gameurls,
    sqlc.arg(whiteusernames)::text[] AS whiteusernames,
    sqlc.arg(blackusernames)::text[] AS blackusernames,
    sqlc.arg(whiteratings)::int4[] AS whiteratings,
    sqlc.arg(blackratings)::int4[] AS blackratings,
    sqlc.arg(playercolors)::text[] AS playercolors,
    sqlc.arg(timeclasses)::text[] AS timeclasses,
    sqlc.arg(results)::text[] AS results,
    sqlc.arg(issuecounts)::int4[] AS issuecounts,
    sqlc.arg(userids)::int4[] AS userids
),
rows AS (
  SELECT
    ids_row.id,
    payload.gameurls[ids_row.idx] AS gameurl,
    payload.whiteusernames[ids_row.idx] AS whiteusername,
    payload.blackusernames[ids_row.idx] AS blackusername,
    payload.whiteratings[ids_row.idx] AS whiterating,
    payload.blackratings[ids_row.idx] AS blackrating,
    payload.playercolors[ids_row.idx] AS playercolor,
    payload.timeclasses[ids_row.idx] AS timeclass,
    payload.results[ids_row.idx] AS result,
    payload.issuecounts[ids_row.idx] AS issuecount,
    payload.userids[ids_row.idx] AS user_id
  FROM payload
  CROSS JOIN LATERAL unnest(payload.ids) WITH ORDINALITY AS ids_row(id, idx)
)
INSERT INTO games (
  _id,
  gameurl,
  whiteusername,
  blackusername,
  whiterating,
  blackrating,
  playercolor,
  timeclass,
  result,
  issuecount,
  user_id
)
SELECT
  rows.id,
  rows.gameurl,
  rows.whiteusername,
  rows.blackusername,
  rows.whiterating,
  rows.blackrating,
  rows.playercolor,
  rows.timeclass,
  rows.result,
  rows.issuecount,
  rows.user_id
FROM rows
ON CONFLICT (_id) DO UPDATE
SET
  gameurl = EXCLUDED.gameurl,
  whiteusername = EXCLUDED.whiteusername,
  blackusername = EXCLUDED.blackusername,
  whiterating = EXCLUDED.whiterating,
  blackrating = EXCLUDED.blackrating,
  playercolor = EXCLUDED.playercolor,
  timeclass = EXCLUDED.timeclass,
  result = EXCLUDED.result,
  issuecount = EXCLUDED.issuecount,
  user_id = EXCLUDED.user_id;

-- name: GetYourGame :many
SELECT * FROM games WHERE user_id=$1;

-- name: CreateIssue :exec
INSERT INTO Issues (
  _id,
  game_id,
  MoveIndex,
  MoveSAN,
  MoveUCI,
  PlayedMoveUCI,
  PlayedMoveSAN,
  Fen,
  SideToMove,
  PlayerColor,
  UserColor,
  IssueType,
  PlayedBestMove,
  BestMove,
  Ponder,
  PV,
  Solution,
  Depth,
  ScoreCP,
  Mate,
  AfterScoreCP,
  AfterMate,
  WinProbBefore,
  WinProbAfter,
  CPDelta,
  WinProbDelta
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
  $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
  $23, $24, $25, $26
);

-- name: GetIssues :many
SELECT * FROM issues WHERE game_id=$1;

-- name: GetUserIssues :many
SELECT i.* FROM issues i
JOIN games g ON i.game_id = g._id
WHERE g.user_id = $1
ORDER BY i.moveindex;

-- name: GetPuzzlesByType :many
SELECT i.* FROM issues i
JOIN games g ON i.game_id = g._id
WHERE g.user_id = $1 AND i.issuetype = $2
ORDER BY i.moveindex;

-- name: GetPuzzlesCount :one
SELECT COUNT(*) FROM issues i
JOIN games g ON i.game_id = g._id
WHERE g.user_id = $1;

-- name: GetFenEvaluation :many
SELECT
  fen,
  bestmove,
  pv,
  depth,
  scorecp,
  mate,
  playedmoveuci AS played_move_uci,
  playedmovesan AS played_move_san,
  cpdelta,
  winprobdelta
FROM issues
WHERE fen = $1
ORDER BY depth DESC, moveindex ASC;

-- name: GetPuzzlesFast :many
SELECT _id, fen, moves, rating, themes, openingtags
FROM puzzles
TABLESAMPLE BERNOULLI(50)
WHERE rating BETWEEN @min_rating AND @max_rating
  AND (
    array_length(@themes::TEXT[], 1) IS NULL
    OR themes && @themes::TEXT[]
  )
LIMIT @limit_count;


-- name: GetPuzzlesFallback :many
SELECT _id, fen, moves, rating, themes, openingtags
FROM puzzles
WHERE rating BETWEEN @min_rating AND @max_rating
  AND (
    array_length(@themes::TEXT[], 1) IS NULL
    OR themes && @themes::TEXT[]
  )
ORDER BY RANDOM()
LIMIT @limit_count;
