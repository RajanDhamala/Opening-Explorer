// StreamGrpc.js
import grpcClient from "./grpcClient.js";
import { getIO } from "./SocketProvider.js";
import { RedisClient } from "./RedisClient.js";

let io;
setTimeout(()=>{
io = getIO();
},3000)
let gameStream = grpcClient.StartGame(); // initialize immediately
console.log("gRPC game stream started");



gameStream.on("data", async (response) => {
  if (!response.isSuccess) return;

  const whiteSocketId = await RedisClient.hGet(`user:${response.white.id}`, "socketId");
  const blackSocketId = await RedisClient.hGet(`user:${response.black.id}`, "socketId");

  if (whiteSocketId) io.to(whiteSocketId).emit("game-found", response);
  if (blackSocketId) io.to(blackSocketId).emit("game-found", response);
});

gameStream.on("end", () => console.log("Stream ended"));

gameStream.on("error", (err) => console.log("gRPC stream error:", err));

// optional: you can still have a startGameStream function for re-initialization
const startGameStream = () => {
  if (!gameStream) {
    gameStream = grpcClient.StartGame();
    console.log("gRPC game stream re-started");
  }
  return gameStream;
};

export { startGameStream, gameStream };
