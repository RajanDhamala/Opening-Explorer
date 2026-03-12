package utils

import (
	"errors"
	"time"

	"chess/Types"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var jwtSecret = []byte("secret-key")

type JWTClaims struct {
	Fullname string `json:"fullname"`
	ID       string `json:"id"`
	Email    string `json:"email"`
	Type     string `json:"type"` // access / refresh

	jwt.RegisteredClaims
}

func EncryptPaswrod(pwd string) (string, error) {
	bytepwd := []byte(pwd)

	hashed, error := bcrypt.GenerateFromPassword(bytepwd, 10)
	if error != nil {
		return "", error
	}
	strpwd := string(hashed)
	return strpwd, nil
}

func DecrptPassword(hashPwd string, normalPwd string) error {
	byteNormal := []byte(normalPwd)

	byteHash := []byte(hashPwd)

	err := bcrypt.CompareHashAndPassword(byteHash, byteNormal)
	if err != nil {
		return err
	}
	return nil
}

func CreateToken(user types.JwtObj, tokenType string, duration time.Duration) (string, error) {
	claims := JWTClaims{
		Fullname: user.Fullname,
		ID:       user.ID,
		Email:    user.Email,
		Type:     tokenType,

		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(duration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	return token.SignedString(jwtSecret)
}

func VerifyToken(tokenString string) (*JWTClaims, error) {
	claims := &JWTClaims{}

	token, err := jwt.ParseWithClaims(
		tokenString,
		claims,
		func(token *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		},
	)
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, errors.New("token expired")
		}
		return nil, err
	}

	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}
