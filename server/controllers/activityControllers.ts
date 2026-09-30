import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import ActiveLog from "../models/ActiveLog.js";

// Get all activities
// GET /api/activities
export const getActivity = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const activity = await ActiveLog.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("relatedPost", "content");
    res.json(activity);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Server Error" });
  }
};
