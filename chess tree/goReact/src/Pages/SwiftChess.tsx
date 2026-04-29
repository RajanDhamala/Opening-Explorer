import { useState, useEffect } from "react"
import { Chess } from "chess.js"
import { ChessBoard, type Arrow } from "swiftchess"
import "swiftchess/style.css"

const SwiftBoard = () => {
  const [chess] = useState(new Chess())
  const [fen, setFen] = useState(chess.fen())

  const [arrows, setArrows] = useState<Arrow[]>([
    { from: 'e2', to: 'e4', color: 'rgb(16,185,129)', opacity: 0.9 },
  ])
  const handleMove = (move: any) => {
    console.log("Move made:", move)
    console.log("Current FEN:", chess.fen())
  }

  const handlePositionChange = (newFen: string) => {
    console.log("Position changed to:", newFen)
    setFen(newFen)
  }


  useEffect(() => {
    if (chess.turn() == "b") {
      console.log("black turn")
      const legalmoves = chess.moves()
      const randomIndex = Math.floor(Math.random() * legalmoves.length);
      const playmove = legalmoves[randomIndex];
      try {
        chess.move(playmove)
      } catch (err) {
        console.log("not a legal move", err)
      }
      setFen(chess.fen())
    } else {
      console.log("ur turn btw")
      return
    }

  }, [fen])


  return (
    <div className="flex justify-center items-center h-screen ">
      <div className="w-[480px] max-w-[90vw] aspect-square">
        <ChessBoard
          chess={chess}
          position={fen}
          onPositionChange={handlePositionChange}
          onMove={handleMove}
          playerColor="w"
          flipped={false}
          enableSounds={true}
          boardThemePreset="chessComClassic"
          arrows={arrows}
          onArrowsChange={setArrows}
          arrowStyle={{
            color: 'rgb(16,185,129)',
            opacity: 0.85,
            liveColor: 'rgb(59,130,246)',
            liveOpacity: 0.7,
          }}
        />
      </div>
    </div>
  )
}
export default SwiftBoard
