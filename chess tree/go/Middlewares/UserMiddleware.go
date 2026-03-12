package middlewares

import (
	"fmt"
	"time"

	"chess/Types"
	"chess/Utils"

	"github.com/gofiber/fiber/v2"
)

func UserAuthenticate(c *fiber.Ctx) error {
	accessToken := c.Cookies("accessToken")
	refreshToken := c.Cookies("refreshToken")

	if accessToken != "" {
		data, err := utils.VerifyToken(accessToken)
		if err == nil {
			c.Locals("user", data)
			return c.Next()
		}
		fmt.Println("Access token invalid or expired:", err)
	}

	if refreshToken != "" {
		data, err := utils.VerifyToken(refreshToken)
		if err == nil {
			usr := types.JwtObj{
				ID:       data.ID,
				Fullname: data.Fullname,
				Email:    data.Email,
			}

			newAccessToken, err := utils.CreateToken(usr, "accessToken", time.Minute*15)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "Failed to generate new access token",
				})
			}

			c.Cookie(&fiber.Cookie{
				Name:     "accessToken",
				Value:    newAccessToken,
				Expires:  time.Now().Add(15 * time.Minute),
				HTTPOnly: true,
				Secure:   false,
			})

			c.Locals("user", data)
			fmt.Println("Access token refreshed via refresh token")
			return c.Next()
		}

		fmt.Println("Refresh token invalid or expired:", err)
	}

	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"error": "No valid token, login required",
	})
}
