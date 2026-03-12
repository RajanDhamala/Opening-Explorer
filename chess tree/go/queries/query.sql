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

-- name: GetYourGame :many
SELECT * FROM games WHERE user_id=$1;
