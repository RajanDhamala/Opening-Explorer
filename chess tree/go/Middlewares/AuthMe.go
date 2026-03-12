package middlewares

import (
	"time"

	"chess/Types"
	"chess/Utils"

	"github.com/gofiber/fiber/v2"
)

func AuthMe(c *fiber.Ctx) error {
	accessToken := c.Cookies("accessToken")
	refreshToken := c.Cookies("refreshToken")

	if accessToken != "" {
		data, err := utils.VerifyToken(accessToken)
		if err == nil {
			return c.JSON(fiber.Map{
				"_id":      data.ID,
				"fullname": data.Fullname,
				"email":    data.Email,
			})
		}
	}

	if refreshToken != "" {
		data, err := utils.VerifyToken(refreshToken)
		if err == nil {
			newAccessToken, err := utils.CreateToken(types.JwtObj{
				ID:       data.ID,
				Fullname: data.Fullname,
				Email:    data.Email,
			}, "accessToken", time.Minute*15)
			if err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error": "Failed to generate new access token",
				})
			}

			c.Cookie(&fiber.Cookie{
				Name:     "accessToken",
				Value:    newAccessToken,
				Expires:  time.Now().Add(15 * time.Minute),
				HTTPOnly: true,
				Secure:   false, // set true in production
			})

			return c.JSON(fiber.Map{
				"_id":      data.ID,
				"fullname": data.Fullname,
				"email":    data.Email,
			})
		}
	}

	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"error": "No valid token, login required",
	})
}
