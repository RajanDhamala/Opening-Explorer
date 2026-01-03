
import { createClient } from "redis";

let RedisClient;

const connectRedis = async () => {
  if (RedisClient) return RedisClient;

  try {
    RedisClient = createClient({
      url: "redis://localhost:6379",
    });

    RedisClient.on("error", (err) => console.error("Redis Error:", err));

    await RedisClient.connect();
    console.log("Connected to Redis ");

    return RedisClient;
  } catch (err) {
    console.error("Failed to connect to Redis ", err);
  }
};

export { RedisClient,connectRedis };

