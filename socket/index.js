import app from "./app.js"
import dotenv from "dotenv"
import http from "http";
import { initSocket } from "./src/Utils/SocketProvider.js";
import setupSocketHandlers from "./src/Utils/Socket.js";
import {connectRedis} from "./src/Utils/RedisClient.js"

dotenv.config({ quiet: true });

const PORT = process.env.PORT || 8000;

const server = http.createServer(app);
// connectRedis()
const io = initSocket(server);
setupSocketHandlers();

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});
