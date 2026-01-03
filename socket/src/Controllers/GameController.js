import asyncHandler from "../Utils/AsyncHandler.js"
import ApiError from "../Utils/ApiError.js"
import ApiResponse from "../Utils/ApiResponse.js"
import prisma from "../Utils/PrismaProvider.js"
import Joi from "joi"
import { gameStream } from "../Utils/StreamGrpc.js"


const PairMatchmaking=asyncHandler(async(req,res)=>{
  const id=req.user.id
  const fullname=req.user.fullname
  console.log(id,fullname)
  const { timecontrol, rating } = req.body;

  if (!timecontrol || !rating || !id|| !fullname) {
    return res.status(400).send("Please fill all form data");
  }

  if (!gameStream) {
    console.error("gameStream is undefined! Did you call startGameStream()?");
    return res.status(500).send("Stream not initialized");
  }

  const payload = {
    timeformat: timecontrol,
    player: {
      id:id,
      name:fullname,
      rating: Number(rating),
      preferred_color: "random"      }
  };

  console.log("Sending to gRPC stream:", payload);

  try {
    gameStream.write(payload);
  } catch (err) {
    console.error("Error writing to gRPC stream:", err);
    throw new ApiError(400,'Failed to send data to gRPC stream');
  }
  return res.send(new ApiResponse(200,'succesfully satrted matchmaking process'))
}
)


export{
  PairMatchmaking
}
