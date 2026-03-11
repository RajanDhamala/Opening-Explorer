-- name: RegisterUser :one
INSERT INTO users (fullname,email,password)
VALUES ($1,$2,$3)
RETURNING _id;

-- name: CheckIfusrExists :one
SELECT _id FROM users WHERE email=$1;

-- name: LoginUser :one
SELECT _id, fullname,email FROM users WHERE email=$1;

