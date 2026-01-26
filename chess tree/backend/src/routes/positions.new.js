import express from 'express';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';
import { normalizeFen } from '../services/gameProcessor.js';

const prisma = new PrismaClient();
const router = express.Router();

// Get root position (starting position)
router.get('/tree/root', async (req, res) => {
  try {
    const { playerColor = 'white', timeClass, userId } = req.query;
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

    const where = {
      fen: startFen,
      playerColor,
      userId: userId || null
    };

    const rootPosition = await prisma.position.findFirst({
      where
    });

    if (!rootPosition) {
      return res.json({
        fen: startFen,
        playerColor,
        stats: { totalGames: 0, wins: 0, losses: 0, draws: 0 },
        nextMoves: []
      });
    }

    // Get next moves for this color
    const nextMoves = await getNextMoves(startFen, playerColor, userId, timeClass);

    res.json({
      fen: startFen,
      playerColor,
      stats: {
        totalGames: rootPosition.totalGames,
        wins: rootPosition.wins,
        losses: rootPosition.losses,
        draws: rootPosition.draws
      },
      timeClassStats: {
        bullet: rootPosition.bulletGames,
        blitz: rootPosition.blitzGames,
        rapid: rootPosition.rapidGames,
        classical: rootPosition.classicalGames
      },
      nextMoves
    });
  } catch (error) {
    console.error('Error getting root:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific position
router.get('/position', async (req, res) => {
  try {
    const { fen: queryFen, playerColor = 'white', timeClass, userId } = req.query;

    if (!queryFen) {
      return res.status(400).json({ error: "fen query param is required" });
    }

    const fen = decodeURIComponent(queryFen);
    const normalizedFen = normalizeFen(fen);

    // Find position for specific player color
    const position = await prisma.position.findFirst({
      where: {
        fen: normalizedFen,
        playerColor,
        userId: userId || null
      }
    });

    if (!position) {
      return res.status(404).json({ 
        error: 'Position not found',
        message: `No games found where you played as ${playerColor} and reached this position`
      });
    }

    // Get next moves
    const nextMoves = await getNextMoves(fen, playerColor, userId, timeClass);

    // Get recent games for this position
    const positionGames = await prisma.positionInGame.findMany({
      where: { positionId: position.id },
      include: {
        game: {
          select: {
            id: true,
            opponentName: true,
            opponentRating: true,
            result: true,
            playerColor: true,
            timeClass: true,
            playedAt: true,
            chessComUrl: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Filter by time class if specified
    let recentGames = positionGames.map(pg => pg.game);
    if (timeClass) {
      recentGames = recentGames.filter(g => g.timeClass === timeClass);
    }

    res.json({
      position: {
        fen: position.fen,
        playerColor: position.playerColor,
        moveNumber: position.moveNumber,
        moveSequence: position.moveSequence,
        stats: {
          totalGames: position.totalGames,
          wins: position.wins,
          losses: position.losses,
          draws: position.draws,
          winRate: position.winRate
        },
        timeClassStats: {
          bullet: position.bulletGames,
          blitz: position.blitzGames,
          rapid: position.rapidGames,
          classical: position.classicalGames
        }
      },
      nextMoves,
      recentGames: recentGames.slice(0, 10)
    });
  } catch (error) {
    console.error('Error getting position:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get next moves
async function getNextMoves(currentFen, playerColor, userId = null, timeClass = null) {
  const chess = new Chess(currentFen);
  const legalMoves = chess.moves({ verbose: true });
  const nextMoves = [];

  for (const move of legalMoves) {
    chess.move(move.san);
    const nextFen = normalizeFen(chess.fen());
    
    // After player makes a move, it becomes opponent's turn
    // So we need to look for positions where opponent moved (next move in sequence)
    // This means we skip one move ahead to see our positions again
    
    // For now, get ALL next positions (opponent's moves)
    const nextPositions = await prisma.position.findMany({
      where: {
        fen: nextFen,
        // playerColor, // Comment out to see all moves, or keep to filter
        userId: userId || null
      }
    });

    chess.undo();

    if (nextPositions.length > 0) {
      // Sum up stats from all matching positions (if multiple exist)
      const aggregatedStats = nextPositions.reduce((acc, pos) => ({
        totalGames: acc.totalGames + pos.totalGames,
        wins: acc.wins + pos.wins,
        losses: acc.losses + pos.losses,
        draws: acc.draws + pos.draws,
        bulletGames: acc.bulletGames + pos.bulletGames,
        blitzGames: acc.blitzGames + pos.blitzGames,
        rapidGames: acc.rapidGames + pos.rapidGames,
        classicalGames: acc.classicalGames + pos.classicalGames,
      }), {
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        bulletGames: 0,
        blitzGames: 0,
        rapidGames: 0,
        classicalGames: 0
      });

      // Filter by time class if specified
      let gamesToShow = aggregatedStats.totalGames;
      if (timeClass) {
        const timeClassKey = `${timeClass}Games`;
        gamesToShow = aggregatedStats[timeClassKey] || 0;
      }

      if (gamesToShow > 0) {
        nextMoves.push({
          move: move.san,
          fen: nextFen,
          stats: {
            totalGames: gamesToShow,
            wins: aggregatedStats.wins,
            losses: aggregatedStats.losses,
            draws: aggregatedStats.draws
          },
          timeClassStats: {
            bullet: aggregatedStats.bulletGames,
            blitz: aggregatedStats.blitzGames,
            rapid: aggregatedStats.rapidGames,
            classical: aggregatedStats.classicalGames
          }
        });
      }
    }
  }

  // Sort by total games descending
  return nextMoves.sort((a, b) => b.stats.totalGames - a.stats.totalGames);
}

// Get opponent statistics
router.get('/opponents', async (req, res) => {
  try {
    const { userId, timeClass } = req.query;
    
    const where = {
      ...(userId && { userId }),
      ...(timeClass && { timeClass })
    };

    const opponents = await prisma.game.groupBy({
      by: ['opponentName'],
      where,
      _count: { id: true },
      _avg: { opponentRating: true },
      _max: { playedAt: true }
    });

    const opponentStats = await Promise.all(
      opponents.map(async (opp) => {
        const games = await prisma.game.findMany({
          where: { 
            opponentName: opp.opponentName,
            ...where
          },
          select: { result: true }
        });

        const wins = games.filter(g => g.result === 'win').length;
        const losses = games.filter(g => g.result === 'loss').length;
        const draws = games.filter(g => g.result === 'draw').length;

        return {
          username: opp.opponentName,
          gamesPlayed: opp._count.id,
          wins,
          losses,
          draws,
          avgRating: Math.round(opp._avg.opponentRating || 0),
          lastPlayedDate: opp._max.playedAt
        };
      })
    );

    res.json(opponentStats.sort((a, b) => b.gamesPlayed - a.gamesPlayed));
  } catch (error) {
    console.error('Error getting opponents:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get processing history
router.get('/processing-history', async (req, res) => {
  try {
    const { username, limit = 10 } = req.query;
    
    const where = username ? { username } : {};
    
    const history = await prisma.processingLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit)
    });

    res.json(history);
  } catch (error) {
    console.error('Error getting processing history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available time classes for a user
router.get('/time-classes', async (req, res) => {
  try {
    const { userId } = req.query;
    
    const where = userId ? { userId } : {};
    
    const games = await prisma.game.groupBy({
      by: ['timeClass'],
      where,
      _count: { id: true }
    });

    const timeClasses = games.map(g => ({
      timeClass: g.timeClass,
      count: g._count.id
    })).filter(tc => tc.timeClass && tc.timeClass !== 'unknown');

    res.json(timeClasses);
  } catch (error) {
    console.error('Error getting time classes:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
