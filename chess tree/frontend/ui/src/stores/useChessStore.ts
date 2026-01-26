import { create } from 'zustand';
import { Chess } from 'chess.js';
import type { Square } from 'react-chessboard/dist/chessboard/types';

type BoardOrientation = "white" | "black";

export const BoardOrientation = {
  WHITE: "white" as BoardOrientation,
  BLACK: "black" as BoardOrientation,
};

type TimeClass = "bullet" | "blitz" | "rapid" | "classical" | "all";

// Move tree node for handling variations
export interface MoveNode {
  move: string;
  fen: string;
  children: MoveNode[];
  parent: MoveNode | null;
}

interface ChessState {
  game: Chess;
  fen: string;
  moveHistory: string[];
  currentMoveIndex: number;
  moveFrom: Square | null;
  rightClickedSquares: Record<string, { backgroundColor: string }>;
  optionSquares: Record<string, { background: string; borderRadius?: string }>;
  boardOrientation: BoardOrientation;
  playerColor: BoardOrientation;
  timeClassFilter: TimeClass;
  
  // Move tree for variations
  moveTree: MoveNode | null;
  currentNode: MoveNode | null;
  
  setGame: (game: Chess) => void;
  setFen: (fen: string) => void;
  addMove: (move: string) => void;
  setMoveHistory: (history: string[]) => void;
  setCurrentMoveIndex: (index: number) => void;
  setMoveFrom: (square: Square | null) => void;
  setRightClickedSquares: (squares: Record<string, { backgroundColor: string }>) => void;
  setOptionSquares: (squares: Record<string, { background: string; borderRadius?: string }>) => void;
  flipBoard: () => void;
  setPlayerColor: (color: BoardOrientation) => void;
  setTimeClassFilter: (timeClass: TimeClass) => void;
  resetBoard: () => void;
  goToMove: (index: number) => void;
  nextMove: () => void;
  prevMove: () => void;
  selectVariation: (nodeIndex: number) => void;
}

export const useChessStore = create<ChessState>((set, get) => ({
  game: new Chess(),
  fen: new Chess().fen(),
  moveHistory: [],
  currentMoveIndex: -1,
  moveFrom: null,
  rightClickedSquares: {},
  optionSquares: {},
  boardOrientation: "white" as BoardOrientation,
  playerColor: "white" as BoardOrientation,
  timeClassFilter: "all" as TimeClass,
  moveTree: null,
  currentNode: null,

  setGame: (game) => set({ game }),
  setFen: (fen) => set({ fen }),
  
  addMove: (move) => set((state) => {
    const newGame = new Chess(state.game.fen());
    newGame.move(move);
    const newFen = newGame.fen();
    
    // Handle move tree
    let newNode: MoveNode;
    let newTree = state.moveTree;
    let newCurrentNode: MoveNode | null;
    
    if (!state.currentNode) {
      // First move - create root
      newNode = {
        move,
        fen: newFen,
        children: [],
        parent: null
      };
      newTree = newNode;
      newCurrentNode = newNode;
    } else {
      // Check if this move already exists as a child
      const existingChild = state.currentNode.children.find(child => child.move === move);
      
      if (existingChild) {
        newCurrentNode = existingChild;
      } else {
        // Add as new variation
        newNode = {
          move,
          fen: newFen,
          children: [],
          parent: state.currentNode
        };
        state.currentNode.children.push(newNode);
        newCurrentNode = newNode;
      }
    }
    
    return {
      moveHistory: [...state.moveHistory, move],
      currentMoveIndex: state.moveHistory.length,
      moveTree: newTree,
      currentNode: newCurrentNode,
      game: newGame,
      fen: newFen
    };
  }),
  
  setMoveHistory: (history) => set({ moveHistory: history }),
  setCurrentMoveIndex: (index) => set({ currentMoveIndex: index }),
  setMoveFrom: (square) => set({ moveFrom: square }),
  setRightClickedSquares: (squares) => set({ rightClickedSquares: squares }),
  setOptionSquares: (squares) => set({ optionSquares: squares }),
  
  flipBoard: () => set((state) => ({
    boardOrientation: state.boardOrientation === "white" 
      ? "black" as BoardOrientation
      : "white" as BoardOrientation
  })),
  
  setPlayerColor: (color) => set({ 
    playerColor: color,
    boardOrientation: color
  }),
  
  setTimeClassFilter: (timeClass) => set({ timeClassFilter: timeClass }),
  
  resetBoard: () => {
    const newGame = new Chess();
    set({
      game: newGame,
      fen: newGame.fen(),
      moveHistory: [],
      currentMoveIndex: -1,
      moveFrom: null,
      optionSquares: {},
      rightClickedSquares: {},
      moveTree: null,
      currentNode: null
    });
  },
  
  goToMove: (index) => {
    const { moveHistory, moveTree } = get();
    const newGame = new Chess();
    
    // Replay moves up to the index
    if (index >= 0) {
      for (let i = 0; i <= index; i++) {
        if (i < moveHistory.length) {
          newGame.move(moveHistory[i]);
        }
      }
    }
    
    // Find the corresponding node in the tree
    let node: MoveNode | null = null;
    if (index >= 0 && moveTree) {
      node = moveTree;
      for (let i = 0; i < index && node; i++) {
        const nextMove = moveHistory[i + 1];
        if (nextMove && node.children.length > 0) {
          const foundChild: MoveNode | undefined = node.children.find(c => c.move === nextMove);
          node = foundChild || node.children[0];
        } else {
          break;
        }
      }
    }
    
    set({
      game: newGame,
      fen: newGame.fen(),
      currentMoveIndex: index,
      currentNode: node,
      moveFrom: null,
      optionSquares: {},
    });
  },
  
  nextMove: () => {
    const { currentMoveIndex, moveHistory } = get();
    if (currentMoveIndex < moveHistory.length - 1) {
      get().goToMove(currentMoveIndex + 1);
    }
  },
  
  prevMove: () => {
    const { currentMoveIndex } = get();
    if (currentMoveIndex >= 0) {
      get().goToMove(currentMoveIndex - 1);
    }
  },
  
  selectVariation: (nodeIndex: number) => {
    const { currentNode } = get();
    if (currentNode && currentNode.children[nodeIndex]) {
      const selectedNode = currentNode.children[nodeIndex];
      const newGame = new Chess(selectedNode.fen);
      
      // Build move history from root to this node
      const history: string[] = [];
      let node: MoveNode | null = selectedNode;
      while (node) {
        history.unshift(node.move);
        node = node.parent;
      }
      
      set({
        currentNode: selectedNode,
        game: newGame,
        fen: selectedNode.fen,
        moveHistory: history,
        currentMoveIndex: history.length - 1
      });
    }
  }
}));
