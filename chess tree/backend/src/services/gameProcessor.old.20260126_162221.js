import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function normalizeFen(fen) {
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
}

function extractTimeClass(timeControl) {
  if (!timeControl) return 'unknown';
  const seconds = parseInt(timeControl);
  if (seconds < 180) return 'bullet';
  if (seconds < 600) return 'blitz';
  if (seconds < 1800) return 'rapid';
  return 'classical';
}

export async function processGame(gameData, username) {
  try {
    const chess = new Chess();
    chess.loadPgn(gameData.pgn);
    const history = chess.history();
    
    const playerColor = gameData.white.username.toLowerCase() === username.toLowerCase() ? 'white' : 'black';
    const isPlayerWhite = playerColor === 'white';
    
    let result;
    if (gameData[playerColor].result === 'win') result = 'win';
    else if (gameData[playerColor].result === 'resigned' || 
             gameData[playerColor].result === 'checkmated' ||
             gameData[playerColor].result === 'timeout' ||
             gameData[playerColor].result === 'abandoned') result = 'loss';
    else result = 'draw';
    
    const opponentColor = isPlayerWhite ? 'black' : 'white';
    
    // Extract time class from time_control or use provided
    const timeClass = gameData.time_class || extractTimeClass(gameData.time_control);
    
    const game = await prisma.game.create({
      data: {
        chessComUrl: gameData.url,
        pgn: gameData.pgn,
        result,
        playerColor,
        playerRating: gameData[playerColor].rating,
        opponentName: gameData[opponentColor].username,
        opponentRating: gameData[opponentColor].rating,
        timeControl: gameData.time_control,
        timeClass,
        endTime: BigInt(gameData.end_time),
        eco: gameData.eco || null,
        playedAt: new Date(gameData.end_time * 1000),
        positionFens: []
      }
    });
    
    chess.reset();
    const positionsInGame = [];
    const movesToProcess = Math.min(30, history.length);
    
    for (let i = 0; i < movesToProcess; i++) {
      chess.move(history[i]);
      const fen = normalizeFen(chess.fen());
      const moveNumber = Math.floor(i / 2) + 1;
      
      positionsInGame.push({
        fen,
        moveNumber,
        moveSequence: history.slice(0, i + 1)
      });
    }
    
    const positionFens = positionsInGame.map(p => p.fen);
    await prisma.game.update({
      where: { id: game.id },
      data: { positionFens }
    });
    
    for (const pos of positionsInGame) {
      await upsertPosition(pos, game.id, result);
    }
    
    return { success: true, gameId: game.id };
  } catch (error) {
    console.error('Error processing game:', gameData.url, error.message);
    return { success: false, error: error.message };
  }
}

async function upsertPosition(posData, gameId, result) {
  const existing = await prisma.position.findUnique({
    where: { fen: posData.fen }
  });
  
  if (existing) {
    const newTotalGames = existing.totalGames + 1;
    const newWins = existing.wins + (result === 'win' ? 1 : 0);
    const winRate = (newWins / newTotalGames) * 100;
    
    const updates = {
      totalGames: { increment: 1 },
      gameIds: { push: gameId },
      lastPlayed: new Date(),
      winRate
    };
    
    if (result === 'win') updates.wins = { increment: 1 };
    else if (result === 'loss') updates.losses = { increment: 1 };
    else if (result === 'draw') updates.draws = { increment: 1 };
    
    await prisma.position.update({
      where: { fen: posData.fen },
      data: updates
    });
  } else {
    const wins = result === 'win' ? 1 : 0;
    const winRate = wins * 100;
    
    await prisma.position.create({
      data: {
        fen: posData.fen,
        moveNumber: posData.moveNumber,
        moveSequence: posData.moveSequence,
        totalGames: 1,
        wins,
        losses: result === 'loss' ? 1 : 0,
        draws: result === 'draw' ? 1 : 0,
        winRate,
        lastPlayed: new Date(),
        gameIds: [gameId]
      }
    });
  }
}

export async function processGamesFromFile(filepath, username) {
  const fs = await import('fs/promises');
  const data = JSON.parse(await fs.readFile(filepath, 'utf-8'));
  
  let totalProcessed = 0;
  let totalErrors = 0;
  
  for (const [month, games] of Object.entries(data)) {
    console.log(`Processing ${games.length} games from ${month}...`);
    
    for (const game of games) {
      const result = await processGame(game, username);
      if (result.success) totalProcessed++;
      else totalErrors++;
    }
  }
  
  return { totalProcessed, totalErrors };
}
