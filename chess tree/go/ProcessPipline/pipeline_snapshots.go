package Processpipline

import (
	"fmt"
	"strings"
	"sync"

	opening "chess/Opening"
	types "chess/Types"

	lib "github.com/RajanDhamala/chess/v2"
)

// The chess fork currently reuses pooled SAN decoder state. Keep notation
// decoding serialized until that package guarantees concurrent safety.
var notationDecodeMu sync.Mutex

type snapshotError struct {
	MoveIndex int
	MoveSAN   string
	Err       error
}

func (e *snapshotError) Error() string {
	return fmt.Sprintf("invalid SAN at ply %d (%s): %v", e.MoveIndex, e.MoveSAN, e.Err)
}

func prepareSnapshots(moves []types.Move, userIsWhite bool) ([]moveSnapshot, error) {
	notationDecodeMu.Lock()
	defer notationDecodeMu.Unlock()

	game := lib.NewGame()
	userColor := colorFromBool(userIsWhite)
	bookPrefix := ""
	bookActive := true
	seenPositions := map[string]int{
		positionKey(game.Position().String()): 1,
	}
	snapshots := make([]moveSnapshot, 0, len(moves))

	for index, item := range moves {
		beforeFEN := game.Position().String()
		sideToMove := sideToMoveFromFEN(beforeFEN)
		moveColor := colorFromSide(sideToMove)

		move, err := lib.AlgebraicNotation{}.Decode(game.Position(), item.San)
		if err != nil {
			return snapshots, &snapshotError{
				MoveIndex: index + 1,
				MoveSAN:   item.San,
				Err:       err,
			}
		}
		moveUCI := normalizeUCIMove(lib.UCINotation{}.Encode(game.Position(), move))
		if err := game.Move(move, nil); err != nil {
			return snapshots, &snapshotError{
				MoveIndex: index + 1,
				MoveSAN:   item.San,
				Err:       err,
			}
		}

		bookMove := opening.NormalizeSANToken(item.San)
		isBookMove := false
		if bookActive && bookMove != "" {
			if bookPrefix == "" {
				bookPrefix = bookMove
			} else {
				bookPrefix += " " + bookMove
			}
			isBookMove = opening.IsBookPrefixKey(bookPrefix)
			bookActive = isBookMove
		} else {
			bookActive = false
		}

		afterFEN := game.Position().String()
		beforeRepeated := seenPositions[positionKey(beforeFEN)] > 1
		afterPositionKey := positionKey(afterFEN)
		afterRepeated := seenPositions[afterPositionKey] > 0
		seenPositions[afterPositionKey]++
		isUserMove := moveColor == userColor
		candidatePositionRepeated := beforeRepeated
		if !isUserMove {
			candidatePositionRepeated = afterRepeated
		}

		snapshots = append(snapshots, moveSnapshot{
			MoveIndex:          index + 1,
			MoveSAN:            item.San,
			MoveUCI:            moveUCI,
			FEN:                beforeFEN,
			AfterFEN:           afterFEN,
			SideToMove:         sideToMove,
			PlayerColor:        userColor,
			IsUserMove:         isUserMove,
			IsBookMove:         isBookMove,
			IsRepeatedPosition: candidatePositionRepeated,
		})
	}

	return snapshots, nil
}

func sideToMoveFromFEN(fen string) string {
	fields := strings.Fields(fen)
	if len(fields) < 2 {
		return ""
	}
	if fields[1] == "w" || fields[1] == "b" {
		return fields[1]
	}
	return ""
}

func colorFromSide(side string) string {
	if side == "b" {
		return "black"
	}
	return "white"
}

func colorFromBool(isWhite bool) string {
	if isWhite {
		return "white"
	}
	return "black"
}

func sideFromBool(isWhite bool) string {
	if isWhite {
		return "w"
	}
	return "b"
}

func playUCIMove(game *lib.Game, uci string) error {
	move, err := lib.UCINotation{}.Decode(game.Position(), normalizeUCIMove(uci))
	if err != nil {
		return err
	}
	return game.Move(move, nil)
}

func legalMoveCount(fen string) (int, error) {
	option, err := lib.FEN(fen)
	if err != nil {
		return 0, err
	}
	return len(lib.NewGame(option).ValidMoves()), nil
}

func materialDifference(fen string, sideIsWhite bool) int {
	white, black := materialCount(fen)
	if sideIsWhite {
		return white - black
	}
	return black - white
}

func materialCount(fen string) (int, int) {
	board := strings.SplitN(fen, " ", 2)[0]
	white := 0
	black := 0
	for _, piece := range board {
		switch piece {
		case 'P':
			white++
		case 'N', 'B':
			white += 3
		case 'R':
			white += 5
		case 'Q':
			white += 9
		case 'p':
			black++
		case 'n', 'b':
			black += 3
		case 'r':
			black += 5
		case 'q':
			black += 9
		}
	}
	return white, black
}

func positionKey(fen string) string {
	fields := strings.Fields(fen)
	if len(fields) < 4 {
		return fen
	}
	return strings.Join(fields[:4], " ")
}
