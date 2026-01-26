import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function normalizeFen(fen) {
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
}

function extractTimeClass(timeControl) {
  if (!timeControl) return 'unknown';
  const match = timeControl.match(/(\d+)/);
  if (!match) return 'unknown';

  const seconds = parseInt(match[1]);
  if (seconds < 180) return 'bullet';
  if (seconds < 600) return 'blitz';
  if (seconds < 1800) return 'rapid';
  return 'classical';
}

export async function startProcessing(username, metadata = {}) {
  const log = await prisma.processingLog.create({
    data: {
      username,
      status: 'processing',
      sourceFile: metadata.sourceFile,
      apiEndpoint: metadata.apiEndpoint,
      gamesFromDate: metadata.gamesFromDate,
      gamesToDate: metadata.gamesToDate,
    }
  });

  return log.id;
}

export async function completeProcessing(logId, stats, error = null) {
  await prisma.processingLog.update({
    where: { id: logId },
    data: {
      status: error ? 'failed' : 'completed',
      completedAt: new Date(),
      totalGames: stats.totalGames || 0,
      successCount: stats.successCount || 0,
      errorCount: stats.errorCount || 0,
      errorMessage: error,
    }
  });
}

export async function processGame(gameData, username, userId = null) {
  try {
    const chess = new Chess();
    chess.loadPgn(gameData.pgn);
    const history = chess.history();

    const playerColor = gameData.white.username.toLowerCase() === username.toLowerCase() ? 'white' : 'black';
    const isPlayerWhite = playerColor === 'white';

    // Determine result from player's perspective
    let result;
    if (gameData[playerColor].result === 'win') result = 'win';
    else if (gameData[playerColor].result === 'resigned' ||
      gameData[playerColor].result === 'checkmated' ||
      gameData[playerColor].result === 'timeout' ||
      gameData[playerColor].result === 'abandoned') result = 'loss';
    else result = 'draw';

    const opponentColor = isPlayerWhite ? 'black' : 'white';
    const timeClass = gameData.time_class || extractTimeClass(gameData.time_control);

    // Create game record
    const game = await prisma.game.create({
      data: {
        userId,
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
      }
    });

    // Process positions
    chess.reset();

    // Save starting position for white games only
    if (playerColor === 'white') {
      await upsertPosition({
        fen: normalizeFen(chess.fen()),
        playerColor: playerColor, // Color user played, not whose turn
        moveNumber: 0,
        moveSequence: [],
        userId,
        gameId: game.id,
        result,
        timeClass
      });
    }

    const movesToProcess = Math.min(30, history.length);

    for (let i = 0; i < movesToProcess; i++) {
      chess.move(history[i]);
      const fen = normalizeFen(chess.fen());
      const moveNumber = Math.floor(i / 2) + 1;
      const moveSequence = history.slice(0, i + 1);

      // Save position with playerColor = the color WE played in this game
      // This ensures stats are correctly separated by the color we played
      await upsertPosition({
        fen,
        playerColor: playerColor, // Color user played in THIS game
        moveNumber,
        moveSequence,
        userId,
        gameId: game.id,
        result,
        timeClass
      });
    }

    return { success: true, gameId: game.id };
  } catch (error) {
    console.error('Error processing game:', gameData.url, error.message);
    return { success: false, error: error.message };
  }
}

async function upsertPosition(data) {
  const { fen, playerColor, moveNumber, moveSequence, userId, gameId, result, timeClass } = data;

  // Find or create position for this specific color
  // Use findFirst since userId can be null
  const existing = await prisma.position.findFirst({
    where: {
      fen,
      playerColor,
      userId: userId || null
    }
  });

  let position;

  if (existing) {
    // Update existing position
    const newTotalGames = existing.totalGames + 1;
    const newWins = existing.wins + (result === 'win' ? 1 : 0);
    const winRate = (newWins / newTotalGames) * 100;

    const updates = {
      totalGames: { increment: 1 },
      lastPlayed: new Date(),
      winRate
    };

    if (result === 'win') updates.wins = { increment: 1 };
    else if (result === 'loss') updates.losses = { increment: 1 };
    else if (result === 'draw') updates.draws = { increment: 1 };

    // Update time class stats
    if (timeClass === 'bullet') updates.bulletGames = { increment: 1 };
    else if (timeClass === 'blitz') updates.blitzGames = { increment: 1 };
    else if (timeClass === 'rapid') updates.rapidGames = { increment: 1 };
    else if (timeClass === 'classical') updates.classicalGames = { increment: 1 };

    position = await prisma.position.update({
      where: { id: existing.id },
      data: updates
    });
  } else {
    // Create new position
    const wins = result === 'win' ? 1 : 0;
    const winRate = wins * 100;

    const timeClassData = {
      bulletGames: timeClass === 'bullet' ? 1 : 0,
      blitzGames: timeClass === 'blitz' ? 1 : 0,
      rapidGames: timeClass === 'rapid' ? 1 : 0,
      classicalGames: timeClass === 'classical' ? 1 : 0,
    };

    position = await prisma.position.create({
      data: {
        userId,
        fen,
        playerColor,
        moveNumber,
        moveSequence,
        totalGames: 1,
        wins,
        losses: result === 'loss' ? 1 : 0,
        draws: result === 'draw' ? 1 : 0,
        winRate,
        lastPlayed: new Date(),
        ...timeClassData
      }
    });
  }

  // Create junction record
  await prisma.positionInGame.create({
    data: {
      gameId,
      positionId: position.id,
      moveNumber,
      result
    }
  });
}

export async function processGamesFromFile(filepath, username) {
  const fs = await import('fs/promises');
  const data = JSON.parse(await fs.readFile(filepath, 'utf-8'));

  // Get or create user
  let user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user) {
    user = await prisma.user.create({
      data: { username }
    });
  }

  // Determine date range
  let minDate = null;
  let maxDate = null;

  for (const games of Object.values(data)) {
    for (const game of games) {
      const gameDate = new Date(game.end_time * 1000);
      if (!minDate || gameDate < minDate) minDate = gameDate;
      if (!maxDate || gameDate > maxDate) maxDate = gameDate;
    }
  }

  const logId = await startProcessing(username, {
    sourceFile: filepath,
    gamesFromDate: minDate,
    gamesToDate: maxDate
  });

  let totalProcessed = 0;
  let totalErrors = 0;
  let totalGames = 0;

  try {
    for (const [month, games] of Object.entries(data)) {
      console.log(`📅 Processing ${games.length} games from ${month}...`);
      totalGames += games.length;

      for (const game of games) {
        const result = await processGame(game, username, user.id);
        if (result.success) {
          totalProcessed++;
          if (totalProcessed % 10 === 0) {
            process.stdout.write(`\r✓ Processed: ${totalProcessed}/${totalGames} games`);
          }
        } else {
          totalErrors++;
        }
      }
    }

    console.log(`\n✅ Processing complete!`);
    await completeProcessing(logId, {
      totalGames,
      successCount: totalProcessed,
      errorCount: totalErrors
    });

  } catch (error) {
    console.error('\n❌ Processing failed:', error);
    await completeProcessing(logId, {
      totalGames,
      successCount: totalProcessed,
      errorCount: totalErrors
    }, error.message);
    throw error;
  }

  return { totalProcessed, totalErrors, totalGames };
}

export async function getProcessingHistory(username = null, limit = 10) {
  const where = username ? { username } : {};

  return await prisma.processingLog.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: limit
  });
}
