package Controllers

import (
	"database/sql"
	"fmt"
	"strconv"
	"time"

	"chess/Database"
	"chess/Types"
	"chess/Utils"
	"chess/internal/db"

	"github.com/gofiber/fiber/v2"
)

var userQueries *db.Queries

type RegisterUserReq struct {
	Email    string `json:"email"`
	FullName string `json:"fullname"`
	Password string `json:"password"`
}

func RegisterUser(c *fiber.Ctx) error {
	data := RegisterUserReq{}

	if errr := c.BodyParser(&data); errr != nil {
		fmt.Println("failed to parse the body")
		return c.Status(500).JSON(fiber.Map{
			"error": "error parsing body",
		})
	}

	if Database.DbPool == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "database not initialized",
		})
	}
	userQueries = db.New(Database.DbPool)

	email := data.Email

	_, err := userQueries.CheckIfusrExists(c.Context(), email)

	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("User does NOT exist")
		}
	} else {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "user already exists",
		})
	}
	hashedpwd, errs := utils.EncryptPaswrod(data.Password)

	if errs != nil {
		return c.Status(200).JSON(fiber.Map{
			"error": "internal server err",
		})
	}

	id, err := userQueries.RegisterUser(c.Context(), db.RegisterUserParams{
		Email:    data.Email,
		Password: hashedpwd,
		Fullname: data.FullName,
	})
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "failed to register user",
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{"id": id},
	})
}

type LoginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func LoginUser(c *fiber.Ctx) error {
	fmt.Println("user login called")

	data := LoginReq{}

	if errr := c.BodyParser(&data); errr != nil {
		fmt.Println("failed to parse the body")
		return c.Status(500).JSON(fiber.Map{
			"error": "error parsing body",
		})
	}

	if Database.DbPool == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "database not initialized",
		})
	}
	userQueries = db.New(Database.DbPool)

	email := data.Email
	user, err := userQueries.LoginUser(c.Context(), email)
	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("User does NOT exist")
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "invalid credentials",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "internal server error",
		})
	}

	err = utils.DecrptPassword(user.Password, data.Password)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid credentials",
		})
	}

	usr := types.JwtObj{
		ID:       strconv.Itoa(int(user.ID)),
		Fullname: user.Fullname,
		Email:    user.Email,
	}
	fmt.Println("user id:", usr.ID)
	accessToken, _ := utils.CreateToken(usr, "accessToken", time.Minute*15)
	refreshToken, _ := utils.CreateToken(usr, "refreshToken", time.Hour*24*7)

	c.Cookie(&fiber.Cookie{
		Name:     "accessToken",
		Value:    accessToken,
		Expires:  time.Now().Add(15 * time.Minute),
		HTTPOnly: true,
		Secure:   false, // Set to true in production
	})

	c.Cookie(&fiber.Cookie{
		Name:     "refreshToken",
		Value:    refreshToken,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HTTPOnly: true,
		Secure:   false,
	})

	return c.Status(200).JSON(fiber.Map{
		"message": "user created succesfully",
	})
}
