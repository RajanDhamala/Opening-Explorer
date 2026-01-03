
import asyncHandler from "../Utils/AsyncHandler.js";
import { CreateAccessToken, CreateClientId } from "../Utils/Authutils.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const Whoareu = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, client_id } = req.cookies;

  if (accessToken || refreshToken) {
    try {
      const decodedToken = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
      return res.json({
        id: decodedToken.id,
        fullname: decodedToken.fullname,
      });
    } catch (err) {
      console.log("Access token expired or invalid:", err.message);
    }

    if (!refreshToken) {
      return res.status(401).json({ message: "No refresh token" });
    }

    try {
      const decodedRefresh = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

      const user = {
        id: decodedRefresh.id,
        fullname: decodedRefresh.fullname,
      };

      const newAccessToken = CreateAccessToken(user.id, decodedRefresh.email, user.fullname);

      res.cookie("accessToken", newAccessToken, {
        httpOnly: true,
        secure: false,
        maxAge: 10 * 60 * 1000, // 10 mins
        path: "/",
      });

      return res.json(user);
    } catch (err) {
      console.log("Refresh token expired or invalid:", err.message);
    }
  }

  try {
    if (client_id) {
      const decodedClient = jwt.verify(client_id, process.env.CLIENT_TOKEN_SECRET);
      return res.json({
        id: decodedClient.id,
        fullname: "anonymous",
      });
    }
  } catch (err) {
    console.log("Client ID invalid or expired:", err.message);
  }

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const newClientToken = CreateClientId(ip);

  res.cookie("client_id", newClientToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  const decodedNewClient = jwt.verify(newClientToken, process.env.CLIENT_TOKEN_SECRET);

  return res.json({
    id: decodedNewClient.id,
    fullname: "anonymous",
  });
});

export default Whoareu;

