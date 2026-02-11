import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import gamesRouter from './routes/games.js';
import positionsRouter from './routes/positions.js';
import { fetchArchives, fetchMonthGame } from './services/handelMockApi.js';
dotenv.config
  ();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/games', gamesRouter);
app.use('/api', positionsRouter);
app.use("/archives", fetchArchives)
app.use("/fetchGames/:year/:month/:username", fetchMonthGame)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(` Chess Tree Server running on http://localhost:${PORT}`);
});
