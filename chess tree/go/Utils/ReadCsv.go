package utils

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"chess/Database"
	"chess/Types"

	"github.com/jackc/pgx/v5/pgxpool"
)

func ReadCsv(ctx context.Context, pool *pgxpool.Pool) error {
	file, err := os.Open("Opening/puzzles_200k.csv")
	if err != nil {
		return fmt.Errorf("error opening file: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.Comma = ','

	if _, err := reader.Read(); err != nil {
		return fmt.Errorf("error reading header: %w", err)
	}

	var batch []types.Puzzle
	total := 0

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil || len(record) < 5 {
			continue
		}

		rating, err := strconv.Atoi(strings.TrimSpace(record[3]))
		if err != nil {
			continue
		}

		puzzle := types.Puzzle{
			Id:     strings.TrimSpace(record[0]),
			Fen:    strings.TrimSpace(record[1]),
			Moves:  strings.TrimSpace(record[2]),
			Rating: rating,
			Themes: strings.Fields(record[4]),
		}
		if len(record) >= 6 {
			puzzle.OpeningTags = strings.TrimSpace(record[5])
		}

		batch = append(batch, puzzle)

		if len(batch) >= 1000 {
			count, err := Database.BulkInsertPuzzles(ctx, pool, batch)
			if err != nil {
				return fmt.Errorf("insert failed at row %d: %w", total, err)
			}
			total += int(count)
			batch = batch[:0]
		}
	}

	// flush remaining
	if len(batch) > 0 {
		count, err := Database.BulkInsertPuzzles(ctx, pool, batch)
		if err != nil {
			return fmt.Errorf("final insert failed: %w", err)
		}
		total += int(count)
	}

	fmt.Printf("done! inserted %d puzzles\n", total)
	return nil
}
