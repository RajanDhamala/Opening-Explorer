package opening

import (
	"encoding/csv"
	"fmt"
	"os"
	"strings"
	"sync"
)

var (
	openingPrefixOnce sync.Once
	openingPrefixes   map[string]struct{}
	openingLoadErr    error
	openingWarnOnce   sync.Once
)

func IsBookPrefixKey(prefixKey string) bool {
	if strings.TrimSpace(prefixKey) == "" {
		return false
	}

	prefixes, err := loadOpeningPrefixes()
	if err != nil {
		openingWarnOnce.Do(func() {
			fmt.Println("failed to load opening TSV book:", err)
		})
		return false
	}

	_, ok := prefixes[prefixKey]
	return ok
}

func NormalizeSANToken(token string) string {
	trimmed := strings.TrimSpace(token)
	if trimmed == "" {
		return ""
	}

	if strings.Contains(trimmed, ".") {
		parts := strings.Split(trimmed, ".")
		trimmed = strings.TrimSpace(parts[len(parts)-1])
	}

	if trimmed == "" {
		return ""
	}

	switch trimmed {
	case "1-0", "0-1", "1/2-1/2", "*":
		return ""
	}

	trimmed = strings.TrimRight(trimmed, "!?+#")
	return strings.TrimSpace(trimmed)
}

func loadOpeningPrefixes() (map[string]struct{}, error) {
	openingPrefixOnce.Do(func() {
		openingPrefixes = make(map[string]struct{}, 250000)
		files := []string{
			"Opening/a.tsv",
			"Opening/b.tsv",
			"Opening/c.tsv",
			"Opening/d.tsv",
			"Opening/e.tsv",
		}

		for _, file := range files {
			if err := addPrefixesFromFile(openingPrefixes, file); err != nil {
				openingLoadErr = err
				return
			}
		}
	})

	return openingPrefixes, openingLoadErr
}

func addPrefixesFromFile(prefixes map[string]struct{}, path string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.Comma = '\t'

	records, err := reader.ReadAll()
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}

	for index, row := range records {
		if index == 0 || len(row) < 3 {
			continue
		}

		moves := pgnLineToMoves(row[2])
		if len(moves) == 0 {
			continue
		}

		builder := strings.Builder{}
		for i, move := range moves {
			if i > 0 {
				builder.WriteByte(' ')
			}
			builder.WriteString(move)
			prefixes[builder.String()] = struct{}{}
		}
	}

	return nil
}

func pgnLineToMoves(pgn string) []string {
	tokens := strings.Fields(pgn)
	moves := make([]string, 0, len(tokens))

	for _, token := range tokens {
		move := NormalizeSANToken(token)
		if move == "" {
			continue
		}
		moves = append(moves, move)
	}

	return moves
}
