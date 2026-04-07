package tagger

type PuzzleTheme string

const (
	AdvancedPawn      PuzzleTheme = "advancedPawn"
	Advantage         PuzzleTheme = "advantage"
	AnastasiaMate     PuzzleTheme = "anastasiaMate"
	ArabianMate       PuzzleTheme = "arabianMate"
	AttackingF2F7     PuzzleTheme = "attackingF2F7"
	Attraction        PuzzleTheme = "attraction"
	BackRankMate      PuzzleTheme = "backRankMate"
	BishopEndgame     PuzzleTheme = "bishopEndgame"
	BodenMate         PuzzleTheme = "bodenMate"
	CapturingDefender PuzzleTheme = "capturingDefender"
	Castling          PuzzleTheme = "castling"
	Clearance         PuzzleTheme = "clearance"
	Coercion          PuzzleTheme = "coercion"
	Collinear         PuzzleTheme = "collinear"
	Crushing          PuzzleTheme = "crushing"
	DefensiveMove     PuzzleTheme = "defensiveMove"
	DiscoveredAttack  PuzzleTheme = "discoveredAttack"
	Deflection        PuzzleTheme = "deflection"
	DoubleBishopMate  PuzzleTheme = "doubleBishopMate"
	DoubleCheck       PuzzleTheme = "doubleCheck"
	DovetailMate      PuzzleTheme = "dovetailMate"
	Equality          PuzzleTheme = "equality"
	EnPassant         PuzzleTheme = "enPassant"
	ExposedKing       PuzzleTheme = "exposedKing"
	Fork              PuzzleTheme = "fork"
	HangingPiece      PuzzleTheme = "hangingPiece"
	HookMate          PuzzleTheme = "hookMate"
	Interference      PuzzleTheme = "interference"
	Intermezzo        PuzzleTheme = "intermezzo"
	KingsideAttack    PuzzleTheme = "kingsideAttack"
	KnightEndgame     PuzzleTheme = "knightEndgame"
	Long              PuzzleTheme = "long"
	Mate              PuzzleTheme = "mate"
	MateIn5           PuzzleTheme = "mateIn5"
	MateIn4           PuzzleTheme = "mateIn4"
	MateIn3           PuzzleTheme = "mateIn3"
	MateIn2           PuzzleTheme = "mateIn2"
	MateIn1           PuzzleTheme = "mateIn1"
	OneMove           PuzzleTheme = "oneMove"
	Overloading       PuzzleTheme = "overloading"
	PawnEndgame       PuzzleTheme = "pawnEndgame"
	Pin               PuzzleTheme = "pin"
	Promotion         PuzzleTheme = "promotion"
	QueenEndgame      PuzzleTheme = "queenEndgame"
	QueensideAttack   PuzzleTheme = "queensideAttack"
	QuietMove         PuzzleTheme = "quietMove"
	RookEndgame       PuzzleTheme = "rookEndgame"
	QueenRookEndgame  PuzzleTheme = "queenRookEndgame"
	Sacrifice         PuzzleTheme = "sacrifice"
	Short             PuzzleTheme = "short"
	Simplification    PuzzleTheme = "simplification"
	Skewer            PuzzleTheme = "skewer"
	SmotheredMate     PuzzleTheme = "smotheredMate"
	TrappedPiece      PuzzleTheme = "trappedPiece"
	UnderPromotion    PuzzleTheme = "underPromotion"
	VeryLong          PuzzleTheme = "veryLong"
	XRayAttack        PuzzleTheme = "xRayAttack"
	Zugzwang          PuzzleTheme = "zugzwang"
)

var AllPuzzleThemes = []PuzzleTheme{
	AdvancedPawn,
	Advantage,
	AnastasiaMate,
	ArabianMate,
	AttackingF2F7,
	Attraction,
	BackRankMate,
	BishopEndgame,
	BodenMate,
	CapturingDefender,
	Castling,
	Clearance,
	Coercion,
	Collinear,
	Crushing,
	DefensiveMove,
	DiscoveredAttack,
	Deflection,
	DoubleBishopMate,
	DoubleCheck,
	DovetailMate,
	Equality,
	EnPassant,
	ExposedKing,
	Fork,
	HangingPiece,
	HookMate,
	Interference,
	Intermezzo,
	KingsideAttack,
	KnightEndgame,
	Long,
	Mate,
	MateIn5,
	MateIn4,
	MateIn3,
	MateIn2,
	MateIn1,
	OneMove,
	Overloading,
	PawnEndgame,
	Pin,
	Promotion,
	QueenEndgame,
	QueensideAttack,
	QuietMove,
	RookEndgame,
	QueenRookEndgame,
	Sacrifice,
	Short,
	Simplification,
	Skewer,
	SmotheredMate,
	TrappedPiece,
	UnderPromotion,
	VeryLong,
	XRayAttack,
	Zugzwang,
}

func (t PuzzleTheme) IsValid() bool {
	switch t {
	case "advancedPawn":
	case "advantage":
	case "anastasiaMate":
	case "arabianMate":
	case "attackingF2F7":
	case "attraction":
	case "backRankMate":
	case "bishopEndgame":
	case "bodenMate":
	case "capturingDefender":
	case "castling":
	case "clearance":
	case "coercion":
	case "collinear":
	case "crushing":
	case "defensiveMove":
	case "discoveredAttack":
	case "deflection":
	case "doubleBishopMate":
	case "doubleCheck":
	case "dovetailMate":
	case "equality":
	case "enPassant":
	case "exposedKing":
	case "fork":
	case "hangingPiece":
	case "hookMate":
	case "interference":
	case "intermezzo":
	case "kingsideAttack":
	case "knightEndgame":
	case "long":
	case "mate":
	case "mateIn5":
	case "mateIn4":
	case "mateIn3":
	case "mateIn2":
	case "mateIn1":
	case "oneMove":
	case "overloading":
	case "pawnEndgame":
	case "pin":
	case "promotion":
	case "queenEndgame":
	case "queensideAttack":
	case "quietMove":
	case "rookEndgame":
	case "queenRookEndgame":
	case "sacrifice":
	case "short":
	case "simplification":
	case "skewer":
	case "smotheredMate":
	case "trappedPiece":
	case "underPromotion":
	case "veryLong":
	case "xRayAttack":
	case "zugzwang":
		return true
	}
	return false
}
