import { Request, Response } from "express";
import zernio from "../config/zernio.js";
import User from "../models/User.js";
import Account from "../models/Account.js";
import { AuthRequest } from "../middlewares/authMiddleware.js";

const zernioProfileRequests = new Map<string, Promise<string>>();

// Helper to ensure user has a Zernio Profile.
const getOrCreateZernioProfile = async (user: any): Promise<string> => {
  if (user.zernioProfileId) {
    return user.zernioProfileId;
  }

  const userId = user._id.toString();
  const pendingRequest = zernioProfileRequests.get(userId);
  if (pendingRequest) {
    return pendingRequest;
  }

  const profileRequest = (async (): Promise<string> => {
    try {
      const profileName = `${user.name || user.email}'s workspace (${user._id})`;
      const result = await zernio.profiles.listProfiles({
        query: { name: profileName },
      });
      const data = result.data as any;
      const profiles: any[] = Array.isArray(data)
        ? data
        : data?.profiles || data?.data || [];

      if (profiles.length > 0) {
        const pid = profiles[0]._id || profiles[0].id;
        if (pid) {
          await User.findByIdAndUpdate(user._id, { zernioProfileId: pid });
          return pid;
        }
      }

      const createResult = await zernio.profiles.createProfile({
        body: { name: profileName } as any,
      });
      const created = (createResult.data as any)?.profile || createResult.data;

      const pid = created?._id || created?.id;

      if (!pid) {
        throw new Error(
          "Failed to create Zernio Profile - no profile ID returned.",
        );
      }

      await User.findByIdAndUpdate(user._id, { zernioProfileId: pid });
      return pid;
    } catch (error: any) {
      console.error("getOrCreateZernioProfile Error:", error?.message || error);
      throw error;
    }
  })();

  zernioProfileRequests.set(userId, profileRequest);
  try {
    return await profileRequest;
  } finally {
    if (zernioProfileRequests.get(userId) === profileRequest) {
      zernioProfileRequests.delete(userId);
    }
  }
};

// Generate OAuth authorization URL
// GET /api/auth/:platform
export const generateAuthUrl = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { platform } = req.params;

    const profileId = await getOrCreateZernioProfile(req.user);

    const origin = req.headers.origin;
    const redirectUrl = `${origin}/accounts`;

    const result = await zernio.connect.getConnectUrl({
      path: { platform: platform as any },
      query: {
        profileId,
        redirect_url: redirectUrl,
      },
    });

    const data = result.data as any;
    console.log("getConnectedUrl response:", JSON.stringify(data, null, 2));

    const authUrl = data.authUrl;
    if (!authUrl) {
      throw new Error(
        `Zernio returned no authUrl. Full response: ${JSON.stringify(data)}`,
      );
    }

    res.json({ url: authUrl });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Server Error" });
  }
};

// Sync connected accounts from Zernio into our database
// GET /api/auth/sync
export const syncAccounts = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const profileId = await getOrCreateZernioProfile(req.user);
    const result = await zernio.accounts.listAccounts({
      query: { profileId } as any,
    });

    const data = result.data as any;
    const zernioAccounts: any[] =
      data?.accounts || (Array.isArray(data) ? data : []);
    const supportedPlatforms = ["facebook", "twitter", "instagram", "linkedin"];
    const syncedAccounts = [];

    for (const zAccount of zernioAccounts) {
      const zid = zAccount._id || zAccount.id;
      if (!zid) {
        console.warn("Skipping account with no ID:", zAccount);
        continue;
      }

      const rawPlatform = (
        zAccount.platform ||
        zAccount.type ||
        ""
      ).toLowerCase();
      const normalizedPlatform = supportedPlatforms.find((p) =>
        rawPlatform.includes(p),
      );

      if (!normalizedPlatform) {
        console.log(`Skipping unsupported platform: "${rawPlatform}"`);
        continue;
      }

      const account = await Account.findOneAndUpdate(
        { user: req.user._id, zernioAccountId: zid },
        {
          user: req.user._id,
          platform: normalizedPlatform,
          handle:
            zAccount.username || zAccount.name || zAccount.handle || "Unknown",
          zernioAccountId: zid,
          status: "connected",
          avatarurl:
            zAccount.avatarUrl ||
            zAccount.picture ||
            zAccount.profile_image_url,
        },
        { upsert: true, returnDocument: "after" },
      );

      syncedAccounts.push(account);
    }

    res.json(syncedAccounts);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Server Error" });
  }
};
