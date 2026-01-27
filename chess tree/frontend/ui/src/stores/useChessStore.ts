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

// Helper to build move history from root to a given node
const buildMoveHistoryFromNode = (node: MoveNode | null): string[] => {
  const history: string[] = [];
  let current = node;
  while (current) {
    history.unshift(current.move);
    current = current.parent;
  }
  return history;
};

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
  getVariationsAtCurrentPosition: () => MoveNode[];
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

    let newNode: MoveNode;
    let newTree = state.moveTree;
    let newCurrentNode: MoveNode | null;

    if (!state.moveTree) {
      newNode = {
        move,
        fen: newFen,
        children: [],
        parent: null
      };
      newTree = newNode;
      newCurrentNode = newNode;
    }
    else if (!state.currentNode) {
      if (state.moveTree.move === move) {
        newCurrentNode = state.moveTree;
      } else {
        newNode = {
          move,
          fen: newFen,
          children: [],
          parent: null
        };
        newTree = newNode;
        newCurrentNode = newNode;
      }
    }
    else {
      const existingChild = state.currentNode.children.find(child => child.move === move);

      if (existingChild) {
        newCurrentNode = existingChild;
      } else {
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

    // Build move history from root to current node
    const newMoveHistory = buildMoveHistoryFromNode(newCurrentNode);

    return {
      moveHistory: newMoveHistory,
      currentMoveIndex: newMoveHistory.length - 1,
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
    const { currentNode, moveTree } = get();

    const fullPath: MoveNode[] = [];

    const pathToCurrent: MoveNode[] = [];
    let node = currentNode;
    while (node) {
      pathToCurrent.unshift(node);
      node = node.parent;
    }

    for (const n of pathToCurrent) {
      fullPath.push(n);
    }

    let futureNode = currentNode?.children[0] || null;
    while (futureNode) {
      fullPath.push(futureNode);
      futureNode = futureNode.children[0] || null;
    }

    let targetNode: MoveNode | null = null;
    if (index >= 0 && index < fullPath.length) {
      targetNode = fullPath[index];
    } else if (index < 0) {
      targetNode = null; // Going to starting position
    }

    // Rebuild game state from target node's FEN
    const newGame = new Chess();
    if (targetNode) {
      newGame.load(targetNode.fen);
    }

    const newMoveHistory = buildMoveHistoryFromNode(targetNode);

    set({
      game: newGame,
      fen: newGame.fen(),
      currentMoveIndex: index,
      currentNode: targetNode,
      moveHistory: newMoveHistory,
      moveFrom: null,
      optionSquares: {},
    });
  },

  nextMove: () => {
    const { currentNode, moveTree } = get();

    if (!currentNode && moveTree) {
      const newGame = new Chess(moveTree.fen);
      const newMoveHistory = buildMoveHistoryFromNode(moveTree);

      set({
        currentNode: moveTree,
        game: newGame,
        fen: moveTree.fen,
        moveHistory: newMoveHistory,
        currentMoveIndex: 0,
        moveFrom: null,
        optionSquares: {},
      });
      return;
    }

    // Case 2: At a node with children, move to first child
    if (currentNode && currentNode.children.length > 0) {
      const nextNode = currentNode.children[0];
      const newGame = new Chess(nextNode.fen);
      const newMoveHistory = buildMoveHistoryFromNode(nextNode);

      set({
        currentNode: nextNode,
        game: newGame,
        fen: nextNode.fen,
        moveHistory: newMoveHistory,
        currentMoveIndex: newMoveHistory.length - 1,
        moveFrom: null,
        optionSquares: {},
      });
    }
  },

  prevMove: () => {
    const { currentNode } = get();

    if (currentNode) {
      const parentNode = currentNode.parent;
      const newGame = new Chess();

      if (parentNode) {
        newGame.load(parentNode.fen);
      }

      const newMoveHistory = buildMoveHistoryFromNode(parentNode);

      set({
        currentNode: parentNode,
        game: newGame,
        fen: newGame.fen(),
        moveHistory: newMoveHistory,
        currentMoveIndex: newMoveHistory.length - 1,
        moveFrom: null,
        optionSquares: {},
      });
    }
  },

  selectVariation: (nodeIndex: number) => {
    const { currentNode } = get();
    if (currentNode && currentNode.children[nodeIndex]) {
      const selectedNode = currentNode.children[nodeIndex];
      const newGame = new Chess(selectedNode.fen);

      const history = buildMoveHistoryFromNode(selectedNode);

      set({
        currentNode: selectedNode,
        game: newGame,
        fen: selectedNode.fen,
        moveHistory: history,
        currentMoveIndex: history.length - 1
      });
    }
  },

  getVariationsAtCurrentPosition: () => {
    const { currentNode } = get();
    if (currentNode && currentNode.children.length > 1) {
      return currentNode.children;
    }
    return [];
  }
}));
