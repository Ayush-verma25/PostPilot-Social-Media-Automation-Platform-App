import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { getActivity } from "../controllers/activityControllers.js";

const activityRouter = express.Router();

activityRouter.get("/", protect, getActivity);

export default activityRouter;
