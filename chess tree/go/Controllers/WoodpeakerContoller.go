package Controllers

import (
	"database/sql"
	"fmt"
	"strconv"

	"github.com/gofiber/fiber/v2"
	// "chess/Types"
	"chess/Utils"
	"chess/internal/db"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	// "chess/Database"
)

type RegisterWoodpeakerPuzzel struct {
	Count       int      `json:"count"`
	Difficulty  string   `json:"difficulty"`
	ShowTimmer  bool     `json:"showTimmer"`
	Shuffle     bool     `json:"shuffle"`
	RepeatWrong bool     `json:"repeatWrong"`
	Themes      []string `json:"themes"`
	Title       string   `json:"title"`
}

func (ctrl *Controller) CreateWoodpeakerPuzzel(c *fiber.Ctx) error {
	userClaims, ok := c.Locals("user").(*utils.JWTClaims)
	if !ok || userClaims == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}
	id, err := strconv.Atoi(userClaims.ID)
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid user id in token",
		})
	}

	data := RegisterWoodpeakerPuzzel{}

	if err := c.BodyParser(&data); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"error": "failed to parse body",
		})
	}

	if len(data.Themes) == 0 {
		data.Themes = []string{}
	}
	if data.Count <= 0 {
		return c.Status(400).JSON(fiber.Map{
			"error": "count should be greater than zero",
		})
	}

	resp, err := ctrl.queries.GetPuzzlesFast(c.Context(), db.GetPuzzlesFastParams{
		MinRating:  800,
		MaxRating:  2800,
		Themes:     data.Themes,
		LimitCount: int32(data.Count),
	})
	if err != nil {
		return c.Status(400).JSON(fiber.Map{
			"err": "error while db query",
		})
	}

	message := "woodpeaker puzzles"
	payload := any(resp)
	puzzleIDs := make([]string, 0, data.Count)

	if len(resp) < data.Count {
		backupData, errs := ctrl.queries.GetPuzzlesFallback(c.Context(), db.GetPuzzlesFallbackParams{
			MaxRating:  2800,
			MinRating:  800,
			Themes:     data.Themes,
			LimitCount: int32(data.Count),
		})
		if errs != nil {
			fmt.Println("failed to get fallback puzzles:", errs)
			return c.Status(500).JSON(fiber.Map{
				"error": "issue while initing puzzels",
			})
		}
		message = "succesfully fetched puzzel via fallback"
		payload = backupData
		for _, p := range backupData {
			puzzleIDs = append(puzzleIDs, p.ID)
		}
	} else {
		for _, p := range resp {
			puzzleIDs = append(puzzleIDs, p.ID)
		}
	}

	_id := uuid.New()
	pgID := pgtype.UUID{
		Bytes: _id,
		Valid: true,
	}
	_, initErr := ctrl.queries.InitWoodpeakerSet(c.Context(), db.InitWoodpeakerSetParams{
		ID:           pgID,
		Title:        data.Title,
		UserID:       int32(id),
		Setnumber:    int32(data.Count),
		Totalpuzzles: int32(len(puzzleIDs)),
		Minrating:    800,
		Maxrating:    2800,
		Themes:       data.Themes,
	})
	if initErr != nil {
		fmt.Println("error while initng woodpeaker set:", initErr)
		return c.Status(500).JSON(fiber.Map{
			"err": "error while initng woodepeaker set",
		})
	}

	if err := ctrl.queries.InsertWoodpeakerSetItems(c.Context(), db.InsertWoodpeakerSetItemsParams{
		Column1: pgID,
		Column2: puzzleIDs,
	}); err != nil {
		fmt.Println("error while inserting woodpeaker set items:", err)
		return c.Status(500).JSON(fiber.Map{
			"err": "error while creating woodpeaker set items",
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"message": message,
		"setId":   _id.String(),
		"data":    payload,
	})
}

func (ctrl *Controller) GetWoodpeakSetList(c *fiber.Ctx) error {
	userClaims, ok := c.Locals("user").(*utils.JWTClaims)
	if !ok || userClaims == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}
	id, err := strconv.Atoi(userClaims.ID)
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid user id in token",
		})
	}

	data, err := ctrl.queries.GetWoodpeakerSessions(c.Context(), int32(id))
	if err != nil {
		fmt.Println("no session found for user")
		return c.Status(400).JSON(fiber.Map{
			"error": "no session found for user",
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"message": "succesfully fetched set list",
		"data":    data,
	})
}

func (ctrl *Controller) GetWoodpeakSetItem(c *fiber.Ctx) error {
	userClaims, ok := c.Locals("user").(*utils.JWTClaims)
	if !ok || userClaims == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}
	id, err := strconv.Atoi(userClaims.ID)
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid user id in token",
		})
	}
	setId := c.Params("setId")
	if setId == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "invalid query",
		})
	}

	var pgSetId pgtype.UUID
	if err := pgSetId.Scan(setId); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"error": "invalid set id",
		})
	}

	data, err := ctrl.queries.GetWoodpeakSessionItems(c.Context(), pgSetId)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error": "error fetching set items",
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"message": "succesfully fetched set list",
		"data":    data,
	})
}

func (ctrl *Controller) DeleteWoodpeakerSet(c *fiber.Ctx) error {
	userClaims, ok := c.Locals("user").(*utils.JWTClaims)
	if !ok || userClaims == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}

	id, err := strconv.Atoi(userClaims.ID)
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid user id in token",
		})
	}

	_id := c.Params("setId")
	if _id == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "invalid params",
		})
	}

	var pgSetId pgtype.UUID
	if err := pgSetId.Scan(_id); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"error": "invalid set id",
		})
	}

	errs := ctrl.queries.DeleteWoodpeakerSession(c.Context(), db.DeleteWoodpeakerSessionParams{
		ID:     pgSetId,
		UserID: int32(id),
	})

	if errs != nil {
		if errs == sql.ErrNoRows {
			return c.Status(400).JSON(fiber.Map{
				"error": "asset not found",
			})
		}
		return c.Status(500).JSON(fiber.Map{
			"error": "internal server error",
		})
	}

	return c.Status(200).JSON(fiber.Map{
		"message": "succesfully deleted Woodpeaker Set",
	})
}
