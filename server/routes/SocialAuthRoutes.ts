import { Router } from "express";
import {
  generateAuthUrl,
  syncAccounts,
} from "../controllers/SocialAuthControllers.js";
import { protect } from "../middlewares/authMiddleware.js";

const socialAuthRouter = Router();

socialAuthRouter.get("/:platform/url", protect, generateAuthUrl);
socialAuthRouter.get("/sync", protect, syncAccounts);

export default socialAuthRouter;
