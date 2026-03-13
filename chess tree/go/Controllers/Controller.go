package Controllers

import "chess/internal/db"

type Controller struct {
	queries *db.Queries
}

func NewController(queries *db.Queries) *Controller {
	return &Controller{queries: queries}
}
