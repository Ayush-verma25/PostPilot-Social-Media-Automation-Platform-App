import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  addAccount,
  disconnectAccount,
  getAccounts,
} from "../controllers/AccountControllers.js";

const accountRouter = express.Router();

accountRouter.get("/", protect, getAccounts);
accountRouter.post("/", protect, addAccount);
accountRouter.delete("/:id", protect, disconnectAccount);

export default accountRouter;
