import express from 'express';
import { processGamesFromFile } from '../services/gameProcessor.js';

const router = express.Router();

router.post('/process', async (req, res) => {
  try {
    const { filepath, username } = req.body;
    
    if (!filepath || !username) {
      return res.status(400).json({ error: 'filepath and username are required' });
    }
    
    console.log(`Starting to process games for user: ${username}`);
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
