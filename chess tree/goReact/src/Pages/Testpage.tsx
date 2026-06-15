import { useState, useEffect, useRef, useCallback } from "react"
import { Chess } from "chess.js"
import { ChessBoard, type ChessBoardHandle } from "swiftchess"
import axios from "axios"
import "swiftchess/style.css"

const gameArray = [
  "e4", "e5",
  "Nf3", "Nc6",
  "d4", "exd4",
  "Nxd4", "Nxd4",
  "Qxd4", "Be7",
  "Nc3", "Nf6",
  "Bc4", "O-O",
  "O-O", "d6",
  "Re1", "Be6",
  "e5", "dxe5",
  "Qxd8", "Raxd8",
  "Bxe6", "fxe6",
  "Be3", "b6",
  "Bg5", "Bc5",
  "Rxe5", "h6",
  "Bh4", "Rd6",
  "Rae1", "Ng4",
  "R5e2", "g5",
  "Bg3", "Rd7",
  "Ne4", "Rfd8",
  "h3", "Nxf2",
  "Bxf2", "Bxf2+",
  "Kxf2", "Rf7+",
  "Kg1", "Rdf8",
  "c4", "Rf4",
  "b3", "g4",
  "hxg4", "Rxg4",
  "Rf1", "Rd8",
  "Nf6+",
]


const normalizeFen = (fen: string): string => {
  const parts = fen.split(" ")
  if (parts.length < 6) return fen
  parts[3] = "-"
  return parts.join(" ")
}

const getFenAtIndex = (index: number): string => {
  const tmp = new Chess()
  for (let i = 0; i < index; i++) {
    const result = tmp.move(gameArray[i])
    if (result === null) {
      console.error(`Invalid move: ${gameArray[i]} at index ${i}`)
      break
    }
  }
  return tmp.fen()
}

const fenTurn = (fen: string): "w" | "b" =>
  (fen.split(" ")[1] as "w" | "b") ?? "w"

// NormalizedScoreCP and NormalizedMate come pre-flipped from backend (always White POV)
// so no client-side flipping needed at all
const formatScore = (cp: number | null, mate: number | null): string => {
  if (mate !== null) return mate > 0 ? `+M${mate}` : `-M${Math.abs(mate)}`
  if (cp === null) return "–"
  const pawns = cp / 100
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`
}


const TestPage = () => {
  const boardRef = useRef<ChessBoardHandle>(null)

  const [chess] = useState(() => new Chess())
  const [fen, setFen] = useState<string>(() => getFenAtIndex(0))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [apidata, setApidata] = useState<Record<string, any>>({})

  const currentEval = apidata[normalizeFen(fen)] ?? null

  // Use NormalizedScoreCP / NormalizedMate directly — already White POV from backend
  const score: number | null = currentEval?.NormalizedScoreCP ?? null
  const mate: number | null = currentEval?.NormalizedMate ?? null

  const turn = fenTurn(fen)

  // Score bar: 0% = Black winning, 50% = equal, 100% = White winning
  const scoreBarPct = mate !== null
    ? (mate > 0 ? 100 : 0)
    : score !== null
      ? Math.min(Math.max((score + 800) / 1600, 0), 1) * 100
      : 50


  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = Math.max(prev - 1, 0)
      const nextFen = getFenAtIndex(next)
      setFen(nextFen)
      return next
    })
  }, [])

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = Math.min(prev + 1, gameArray.length)
      const nextFen = getFenAtIndex(next)
      setFen(nextFen)
      return next
    })
  }, [])


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev()
      if (e.key === "ArrowRight") goNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goPrev, goNext])


  const handleMove = (move: any) => {
    console.log("Move made:", move)
  }

  const handlePositionChange = (newFen: string) => {
    setFen(newFen)
  }


  const calldb = useCallback(async () => {
    try {
      const response = await axios.get("http://localhost:3030/games/hash")
      const raw: Record<string, any> = response.data.data

      const normalized: Record<string, any> = {}
      for (const [key, value] of Object.entries(raw)) {
        normalized[normalizeFen(key)] = value
      }

      console.log(`Loaded ${Object.keys(normalized).length} positions from backend`)
      setApidata(normalized)
    } catch (error) {
      console.error("Error fetching data from backend:", error)
    }
  }, [])

  useEffect(() => {
    calldb()
  }, [calldb])


  return (
    <div className="relative w-full h-screen bg-[#1a1a2e]">

      {/* Board */}
      <div className="absolute top-1/2 left-[35%] -translate-x-1/2 -translate-y-1/2">
        <ChessBoard
          chess={chess}
          position={fen}
          ref={boardRef}
          onPositionChange={handlePositionChange}
          onMove={handleMove}
          playerColor="w"
          flipped={false}
          enableSounds={true}
          boardSize={600}
        />
      </div>

      {/* Eval panel */}
      <div className="absolute top-4 right-4 bg-[#16213e] border border-[#0f3460] text-white p-4 rounded-xl w-[280px] space-y-3 shadow-xl">

        {/* Score bar */}
        <div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>Black</span>
            <span>White</span>
          </div>
          <div className="w-full h-5 rounded overflow-hidden bg-black flex">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${scoreBarPct}%` }}
            />
          </div>
          <div className="text-center mt-1 font-mono font-bold text-lg tracking-tight">
            {formatScore(score, mate)}
          </div>
        </div>

        <hr className="border-[#0f3460]" />

        {/* Turn indicator */}
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-3 h-3 rounded-full border border-gray-400 ${turn === "w" ? "bg-white" : "bg-black"}`} />
          <span className="text-gray-300">{turn === "w" ? "White" : "Black"} to move</span>
        </div>

        {/* Eval details */}
        <div className="space-y-1 text-sm font-mono">
          <div className="flex justify-between">
            <span className="text-gray-400">Best Move</span>
            <span>{currentEval?.BestMove ?? "–"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Ponder</span>
            <span>{currentEval?.Ponder ?? "–"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Depth</span>
            <span>{currentEval?.Depth ?? "–"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Raw Score</span>
            <span className="text-gray-500 text-xs">
              {currentEval?.ScoreCP != null
                ? `${currentEval.ScoreCP} cp (${turn === "b" ? "Black" : "White"} POV)`
                : "–"}
            </span>
          </div>
        </div>

        <hr className="border-[#0f3460]" />

        {/* PV */}
        <div>
          <p className="text-gray-400 text-xs mb-1">Principal Variation</p>
          <p className="font-mono text-xs text-gray-200 break-words leading-relaxed">
            {currentEval?.PV?.join(" ") ?? "–"}
          </p>
        </div>

        <hr className="border-[#0f3460]" />

        {/* FEN */}
        <div>
          <p className="text-gray-400 text-xs mb-1">FEN</p>
          <p className="font-mono text-[10px] text-gray-500 break-all leading-relaxed">
            {fen}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="absolute top-1/2 right-[310px] -translate-y-1/2 flex flex-col gap-4 items-center">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="px-6 py-3 rounded-lg bg-white text-black font-semibold shadow-md hover:bg-gray-100 active:scale-95 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Prev
        </button>

        <div className="text-white font-semibold text-sm text-center bg-[#16213e] border border-[#0f3460] rounded-lg px-4 py-2">
          {currentIndex} / {gameArray.length}
        </div>

        <button
          onClick={goNext}
          disabled={currentIndex === gameArray.length}
          className="px-6 py-3 rounded-lg bg-white text-black font-semibold shadow-md hover:bg-gray-100 active:scale-95 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>

    </div>
  )
}

export default TestPage
