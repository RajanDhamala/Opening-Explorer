"use client"

import { Chessboard } from 'react-chessboard'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import useChessGameStore from '../ZustandStore/GameStore'
import useSocket from '../ZustandStore/SocketStore'

const BoardUi = function() {
  const socket = useSocket((state) => state.socket)
  
  // Get Zustand state
  const {
    chessGame,
    displayPosition,
    orientation,
    gameData,
    demoMode,
    currentMoveIndex,
    makeMove,
  } = useChessGameStore()
  
  const [showNotation, setShowNotation] = useState(true)
  const [moveFrom, setMoveFrom] = useState('')
  const [optionSquares, setOptionSquares] = useState({})
  const [showAnimations, setShowAnimations] = useState(true)
  const animationDuration = 200
  
  // Computed
  const moveHistory = chessGame.history()
  const isViewingHistory = currentMoveIndex < moveHistory.length
  
  // ════════════════════════════════════════════════
  // SOCKET LISTENER
  // ════════════════════════════════════════════════
  
  useEffect(() => {
    if (!socket || demoMode) return
    
    const handleOpponentMove = (data) => {
      console.log("📥 Opponent move:", data)
      makeMove(data.move)
      toast.success(`Opponent played: ${data.san || ''}`)
    }
    
    socket.on("moveMade", handleOpponentMove)
    
    return () => {
      socket.off("moveMade", handleOpponentMove)
    }
  }, [socket, makeMove, demoMode])
  
  // ════════════════════════════════════════════════
  // PIECE DROP
  // ════════════════════════════════════════════════
  
  function onPieceDrop({ sourceSquare, targetSquare }) {
    if (!targetSquare || sourceSquare === targetSquare) {
      toast.error("Illegal move")
      return false
    }
    
    if (isViewingHistory) {
      toast.error("Go to current position first!")
      return false
    }
    
    const result = makeMove({ 
      from: sourceSquare, 
      to: targetSquare, 
      promotion: 'q' 
    })
    
    if (!result.success) {
      toast.error(result.error || "Illegal move")
      return false
    }
    
    // Send to server
    if (!demoMode && socket) {
      socket.emit("makeMove", {
        gameId: gameData?.gameId,
        move: { from: sourceSquare, to: targetSquare, promotion: 'q' },
        san: result.move.san,
      })
    }
    
    setMoveFrom('')
    setOptionSquares({})
    return true
  }
  
  // ════════════════════════════════════════════════
  // SHOW LEGAL MOVES
  // ════════════════════════════════════════════════
  
  function getMoveOptions(square) {
    const moves = chessGame.moves({ square, verbose: true })
    
    if (moves.length === 0) {
      setOptionSquares({})
      return false
    }
    
    const newSquares = {}
    moves.forEach((move) => {
      newSquares[move.to] = {
        background:
          chessGame.get(move.to) && chessGame.get(move.to).color !== chessGame.get(square).color
            ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
        borderRadius: '50%',
      }
    })
    newSquares[square] = { background: 'rgba(255, 255, 0, 0.4)' }
    setOptionSquares(newSquares)
    return true
  }
  
  // ════════════════════════════════════════════════
  // SQUARE CLICK
  // ════════════════════════════════════════════════
  
  function onSquareClick({ square, piece }) {
    if (isViewingHistory) {
      toast.error("Viewing history - go to current first!")
      return
    }
    
    if (!moveFrom && piece) {
      if (getMoveOptions(square)) setMoveFrom(square)
      return
    }
    
    const moves = chessGame.moves({ square: moveFrom, verbose: true })
    const foundMove = moves.find((m) => m.from === moveFrom && m.to === square)
    
    if (!foundMove) {
      if (getMoveOptions(square)) setMoveFrom(square)
      else setMoveFrom('')
      return
    }
    
    const result = makeMove({ 
      from: moveFrom, 
      to: square, 
      promotion: 'q' 
    })
    
    if (result.success) {
      if (!demoMode && socket) {
        socket.emit("makeMove", {
          gameId: gameData?.gameId,
          move: { from: moveFrom, to: square, promotion: 'q' },
          san: result.move.san,
        })
      }
    }
    
    setMoveFrom('')
    setOptionSquares({})
  }
  
  // ════════════════════════════════════════════════
  // RIGHT CLICK
  // ════════════════════════════════════════════════
  
  function onSquareRightClick() {
    setMoveFrom('')
    setOptionSquares({})
    setShowAnimations(false)
    setTimeout(() => setShowAnimations(true), 50)
  }
  
  // ════════════════════════════════════════════════
  // BOARD OPTIONS
  // ════════════════════════════════════════════════
  
  const squareStyles = { ...optionSquares }
  
  const chessboardOptions = {
    position: displayPosition, // ← From Zustand
    onPieceDrop,
    onSquareClick,
    onSquareRightClick,
    squareStyles,
    showAnimations,
    allowDragging: !isViewingHistory, // ← Can't move when viewing history
    animationDurationInMs: animationDuration,
    boardOrientation: orientation, // ← From Zustand
    showNotation,
    draggingPieceStyle: {
      transform: `scale(1.2) rotate(0deg)`
    },
    draggingPieceGhostStyle: {
      opacity: "0.3",
      filter: `blur(0px)`
    },
    dropSquareStyle: {
      boxShadow: 'inset 0 0 0 2px rgba(0, 128, 255, 0.6)'
    },
    id: 'lucario-chess',
    alphaNotationStyle: {
      color: '#000000',
      fontSize: '18px',
      fontWeight: 'bold',
      textShadow: '1px 1px 2px white',
    },
  }
  
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      <Chessboard options={chessboardOptions} />
    </div>
  )
}

export default BoardUi