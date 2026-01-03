
import { getIO } from "./SocketProvider.js";
import { RedisClient } from "./RedisClient.js";

const setupSocketHandlers = async () => {
  const io = await getIO();

  io.on("connection", async (socket) => {
    const { userId } = socket.handshake.query;

    if (!userId) {
      socket.emit("unauthorized", { reason: "Missing userId" });
      socket.disconnect();
      return;
    }

    await RedisClient.hSet(`user:${userId}`, {
      socketId: socket.id,
      userId,
    });
    await RedisClient.sAdd("connectedUsers", userId);

    console.log(`User connected: ${userId} → socket: ${socket.id}`);

    socket.on("disconnect", async (reason) => {
      console.log(`User disconnected: ${userId} → socket: ${socket.id}`);
      await RedisClient.del(`user:${userId}`);
      await RedisClient.sRem("connectedUsers", userId);
    });
  });
};

export default setupSocketHandlers;

