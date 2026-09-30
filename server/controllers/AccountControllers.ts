import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import Account from "../models/Account.js";
import zernio from "../config/zernio.js";

//Get all accounts
//GET /api/accounts
export const getAccounts = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const accounts = await Account.find({ user: req.user._id });
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Server Error" });
  }
};

// Add Account
// POST /api/accounts
export const addAccount = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { platform, handle, avatarUrl } = req.body;
    const account = await Account.create({
      user: req.user._id,
      platform,
      handle,
      avatarurl: avatarUrl,
    });

    res.status(201).json(account);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Server Error" });
  }
};

// Disconnect Account
// DELETE /api/accounts/:id
export const disconnectAccount = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const account = await Account.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!account) {
      res.status(404).json({ message: "Account not found" });
      return;
    }
    if (account.zernioAccountId) {
      try {
        await zernio.accounts.deleteAccount({
          path: { accountId: account.zernioAccountId },
        });
      } catch (error: any) {
        const status = Number(
          error?.status ?? error?.statusCode ?? error?.response?.status,
        );
        if (status !== 404) {
          res
            .status(500)
            .json({ message: error?.response?.data?.message || error?.message });
          return;
        }
      }
    }
    await account.deleteOne();
    res.json({ message: "Account disconnected successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Server Error" });
  }
};
