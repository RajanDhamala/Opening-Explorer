import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { processGamesFromFile } from '../services/gameProcessor.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/process', async (req, res) => {
  try {
    const filepath = path.resolve(__dirname, '../last_6_months_games_by_month.json');
    const username = "Ranjan911911";

    console.log("Using file:", filepath);

    const result = await processGamesFromFile(filepath, username);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error processing games:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
