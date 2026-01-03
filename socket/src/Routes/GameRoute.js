import { Router } from "express";
import { PairMatchmaking} from "../Controllers/GameController.js";
import AuthUser from "../Middlewares/AuthMiddelware.js"; 
const ApiRouter = Router();


ApiRouter.get("/", (req, res) => {
  res.send("game api is up and running");
});

export default ApiRouter;
