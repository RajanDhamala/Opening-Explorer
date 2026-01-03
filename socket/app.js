import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import cors from "cors";
import UserRouter from "./src/Routes/UserRoute.js";
import GameRoute from "./src/Routes/GameRoute.js";
import grpcClient from "./src/Utils/grpcClient.js";
import {startGameStream} from "./src/Utils/StreamGrpc.js";
dotenv.config();
const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is up and running");
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: "Internal Server Error" });
});

app.use("/users",UserRouter)
app.use("/game",GameRoute)

startGameStream()
export default app;

