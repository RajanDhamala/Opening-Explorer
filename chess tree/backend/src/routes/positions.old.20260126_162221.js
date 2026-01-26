import express from 'express';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';
import { normalizeFen } from '../services/gameProcessor.js';

const prisma = new PrismaClient();
const router = express.Router();

router.get('/tree/root', async (req, res) => {
  try {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

    const rootPosition = await prisma.position.findUnique({
      where: { fen: startFen }
    });

    if (!rootPosition) {
      return res.json({
        fen: startFen,
        stats: { totalGames: 0, wins: 0, losses: 0, draws: 0 },
        nextMoves: []
      });
    }

    const chess = new Chess();
    const legalMoves = chess.moves({ verbose: true });
    const nextMoves = [];

    for (const move of legalMoves) {
      chess.move(move.san);
      const nextFen = normalizeFen(chess.fen());
      chess.undo();

      const nextPos = await prisma.position.findUnique({
        where: { fen: nextFen }
      });

      if (nextPos) {
        nextMoves.push({
          move: move.san,
          fen: nextFen,
          stats: {
            totalGames: nextPos.totalGames,
            wins: nextPos.wins,
            losses: nextPos.losses,
            draws: nextPos.draws
          }
        });
      }
    }

    res.json({
      fen: startFen,
      stats: {
        totalGames: rootPosition.totalGames,
        wins: rootPosition.wins,
        losses: rootPosition.losses,
        draws: rootPosition.draws
      },
      nextMoves
    });
  } catch (error) {
    console.error('Error getting root:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/position', async (req, res) => {
  try {
    const { fen: demofen } = req.query;

    if (!demofen) {
      return res.status(400).json({ error: "fen query param is required" });
    }

    const fen = decodeURIComponent(demofen);
    const normalizedFen = normalizeFen(fen);

    const position = await prisma.position.findUnique({
      where: { fen: normalizedFen }
    });

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });
    const nextMoves = [];

    for (const move of legalMoves) {
      chess.move(move.san);
      const nextFen = normalizeFen(chess.fen());
      chess.undo();

      const nextPos = await prisma.position.findUnique({
        where: { fen: nextFen }
      });

      if (nextPos) {
        nextMoves.push({
          move: move.san,
          fen: nextFen,
          stats: {
            totalGames: nextPos.totalGames,
            wins: nextPos.wins,
            losses: nextPos.losses,
            draws: nextPos.draws,

            playerColor: nextPos.playerColor
          }
        });
      }
    }

    const games = await prisma.game.findMany({
      where: {
        id: { in: position.gameIds }
      },
      select: {
        opponentName: true,
        opponentRating: true,
        result: true,
        createdAt: true,
        chessComUrl: true,
        playerColor: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    res.json({
      position: {
        fen: position.fen,
        moveNumber: position.moveNumber,
        moveSequence: position.moveSequence,
        stats: {
          totalGames: position.totalGames,
          wins: position.wins,
          losses: position.losses,
          draws: position.draws
        }
      },
      nextMoves,
      recentGames: games
    });
  } catch (error) {
    console.error('Error getting position:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/opponents', async (req, res) => {
  try {
    const opponents = await prisma.game.groupBy({
      by: ['opponentName'],
      _count: { id: true },
      _sum: { opponentRating: true },
      _max: { createdAt: true }
    });

    const opponentStats = await Promise.all(
      opponents.map(async (opp) => {
        const games = await prisma.game.findMany({
          where: { opponentName: opp.opponentName },
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
          avgRating: Math.round(opp._sum.opponentRating / opp._count.id),
          lastPlayedDate: opp._max.createdAt
        };
      })
    );

    res.json(opponentStats.sort((a, b) => b.gamesPlayed - a.gamesPlayed));
  } catch (error) {
    console.error('Error getting opponents:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
