package main

import (
	"fmt"
	"strings"
)

var pieceValues = map[rune]int{
	'p': 1, 'P': 1,
	'n': 3, 'N': 3,
	'b': 3, 'B': 3,
	'r': 5, 'R': 5,
	'q': 9, 'Q': 9,
	'k': 0, 'K': 0,
}

func MaterialCount(fen string) (white int, black int) {
	board := strings.SplitN(fen, " ", 2)[0]
	for _, ch := range board {
		switch ch {
		case 'P':
			white += 1
		case 'N', 'B':
			white += 3
		case 'R':
			white += 5
		case 'Q':
			white += 9
		case 'p':
			black += 1
		case 'n', 'b':
			black += 3
		case 'r':
			black += 5
		case 'q':
			black += 9
		}
	}
	return
}

func main() {
	tests := []struct {
		name string
		fen  string
		expW int
		expB int
	}{
		{
			name: "starting position",
			fen:  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			expW: 39, expB: 39,
		},
		{
			name: "white missing a rook",
			fen:  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 1",
			expW: 34, expB: 39,
		},
		{
			name: "only kings",
			fen:  "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
			expW: 0, expB: 0,
		},
		{
			name: "queens only",
			fen:  "4k3/8/8/8/8/8/8/4KQ2 w - - 0 1",
			expW: 9, expB: 0,
		},
	}

	pass, fail := 0, 0
	for _, tt := range tests {
		w, b := MaterialCount(tt.fen)
		ok := w == tt.expW && b == tt.expB
		status := "PASS"
		if !ok {
			status = "FAIL"
			fail++
		} else {
			pass++
		}
		fmt.Printf("[%s] %s  got white=%d black=%d  want white=%d black=%d\n",
			status, tt.name, w, b, tt.expW, tt.expB)
	}
	fmt.Printf("\n%d passed, %d failed\n", pass, fail)
}
