import { processGame } from './src/services/gameProcessor.js';

const testGame = {
  url: `https://www.chess.com/game/live/test-${Date.now()}`,
  pgn: '[Event "Test"]\n1. e4 e5 2. Nf3 Nc6',
  white: {
    username: "testuser",
    rating: 1500,
    result: "win"
  },
  black: {
    username: "opponent",
    rating: 1500,
    result: "resigned"
  },
  time_control: "600",
  time_class: "rapid",
  end_time: Math.floor(Date.now() / 1000),
  eco: "C20"
};

const result = await processGame(testGame, "testuser");
console.log("Process result:", result);
process.exit(0);
