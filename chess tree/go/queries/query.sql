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
  payload.ids[idx],
  payload.gameurls[idx],
  payload.whiteusernames[idx],
  payload.blackusernames[idx],
  payload.whiteratings[idx],
  payload.blackratings[idx],
  payload.playercolors[idx],
  payload.timeclasses[idx],
  payload.results[idx],
  payload.issuecounts[idx],
  payload.userids[idx]
FROM payload,
  generate_subscripts(payload.ids, 1) AS idx
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
