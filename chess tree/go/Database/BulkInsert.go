package Database

import (
	"chess/Types"
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// issueColumns defines the column order for Issues table bulk insert
var issueColumns = []string{
	"_id",
	"game_id",
	"moveindex",
	"movesan",
	"moveuci",
	"fen",
	"sidetomove",
	"playercolor",
	"usercolor",
	"issuetype",
	"playedbestmove",
	"bestmove",
	"ponder",
	"pv",
	"depth",
	"scorecp",
	"mate",
	"afterscorecp",
	"aftermate",
	"winprobbefore",
	"winprobafter",
}

// issueRowSource implements pgx.CopyFromSource for IssueRow slice
type issueRowSource struct {
	rows  []types.IssueRow
	index int
}

func (s *issueRowSource) Next() bool {
	s.index++
	return s.index < len(s.rows)
}

func (s *issueRowSource) Values() ([]interface{}, error) {
	row := s.rows[s.index]
	return row.Values(), nil
}

func (s *issueRowSource) Err() error {
	return nil
}

// BulkInsertIssues uses pgx CopyFrom for fast bulk insert of issues.
// Returns the number of rows inserted and any error.
func BulkInsertIssues(ctx context.Context, pool *pgxpool.Pool, issues []types.IssueRow) (int64, error) {
	if len(issues) == 0 {
		return 0, nil
	}

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return 0, err
	}
	defer conn.Release()

	source := &issueRowSource{rows: issues, index: -1}

	count, err := conn.CopyFrom(
		ctx,
		pgx.Identifier{"issues"},
		issueColumns,
		source,
	)

	return count, err
}
