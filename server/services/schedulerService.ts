import cron from "node-cron";
import { randomUUID } from "node:crypto";
import Post from "../models/Post.js";
import Account from "../models/Account.js";
import zernio from "../config/zernio.js";
import ActiveLog from "../models/ActiveLog.js";

const STALE_CLAIM_MS = 5 * 60 * 1000;
const MAX_PUBLISH_WINDOW_MS = 24 * 60 * 60 * 1000; // give up 24h after scheduledFor
const ZERNIO_TIMEOUT_MS = 60 * 1000;
const BATCH_SIZE = 50;
const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 20;

type PostDoc = InstanceType<typeof Post>;
type AccountDoc = InstanceType<typeof Account>;

let isRunning = false;

const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const getHttpStatus = (err: any): number | undefined =>
  err?.status ?? err?.statusCode ?? err?.response?.status;

// Only a clear client-side rejection is a definite failure.
// Timeouts, network errors, 5xx, 408, 409, 429 are "unknown outcome".
const isDefinitiveRejection = (err: any) => {
  const status = getHttpStatus(err);
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    ![408, 409, 429].includes(status)
  );
};

// Conditional status change: never overwrites a status changed elsewhere.
type PostIdentifier = string | { toString(): string };

const setStatus = (
  postId: PostIdentifier,
  from: string[],
  to: string,
  publishError?: string,
) =>
  Post.updateOne(
    { _id: postId, status: { $in: from } } as any,
    {
      $set: {
        status: to,
        ...(publishError ? { publishError } : {}),
      },
      ...(!publishError ? { $unset: { publishError: 1 } } : {}),
    },
  );

const setRetryAt = (postId: PostIdentifier, retryAt: Date) =>
  Post.updateOne(
    { _id: postId, status: "publishing" } as any,
    { $set: { retryAt } },
  );

const logPublished = async (post: PostDoc, accounts: AccountDoc[]) => {
  try {
    await ActiveLog.create({
      user: post.user,
      actionType: "POST_PUBLISHED",
      description: `Published Post to ${accounts.map((a) => a.platform).join(", ")}`,
      relatedPost: post._id,
    });
  } catch (logError: any) {
    console.error(
      `Failed to log published post ${post._id}:`,
      logError?.message,
    );
  }
};

// Returns the Zernio post if it was already accepted, null if definitely not found.
// Throws if we cannot tell.
const findAcceptedZernioPost = async (
  post: PostDoc,
  accounts: AccountDoc[],
) => {
  const postId = String(post._id);
  const accountIds = accounts.map((a) => String(a.zernioAccountId));
  const claimStartedAt = post.claimedAt?.getTime() ?? post.updatedAt?.getTime() ?? 0;

  const matches = (candidate: any) => {
    const taggedId = candidate.metadata?.postPilotPostId;
    // Tagged by us -> the tag is the exact answer, never fall back to fuzzy matching.
    if (taggedId) return String(taggedId) === postId;

    const candidateAccountIds = (candidate.platforms || []).map((p: any) =>
      String(typeof p.accountId === "string" ? p.accountId : p.accountId?._id),
    );
    const createdAt = Date.parse(candidate.createdAt || "");

    return (
      candidate.content === post.content &&
      accountIds.length > 0 &&
      candidateAccountIds.length === accountIds.length &&
      accountIds.every((id) => candidateAccountIds.includes(id)) &&
      createdAt >= claimStartedAt - 5000
    );
  };

  let page = 1;
  let totalPages = 1;

  do {
    const response: any = await withTimeout(
      zernio.posts.listPosts({
        query: {
          ...(post.content ? { search: post.content } : {}),
          page,
          limit: LIST_PAGE_SIZE,
        },
      }),
      ZERNIO_TIMEOUT_MS,
      "Zernio listPosts",
    );
    const result = response.data as any;

    if (!Array.isArray(result?.posts)) {
      throw new Error("Invalid response while reconciling Zernio posts");
    }

    const match = result.posts.find(matches);
    if (match) return match;

    if (page === 1) {
      if (typeof result.pagination?.pages === "number") {
        totalPages = result.pagination.pages;
      } else if (result.posts.length === LIST_PAGE_SIZE) {
        throw new Error("Incomplete Zernio post results");
      }
    }
    page += 1;
  } while (page <= Math.min(totalPages, LIST_MAX_PAGES));

  if (totalPages > LIST_MAX_PAGES) {
    throw new Error("Too many Zernio results to reconcile safely");
  }
  return null;
};

const processPost = async (
  post: PostDoc,
  now: Date,
  staleClaimBefore: Date,
) => {
  const isStaleClaim = post.status === "publishing";
  const overdueMs = now.getTime() - post.scheduledFor.getTime();

  const accounts = await Account.find({
    user: post.user,
    platform: { $in: post.platform },
    status: "connected",
    zernioAccountId: { $exists: true },
  });

  const connected = new Set(accounts.map((a) => a.platform));
  const missing = (post.platform as string[]).filter(
    (p) => !connected.has(p as any),
  );

  // A previous attempt may have reached Zernio: check before publishing again.
  if (isStaleClaim) {
    let accepted: any;
    try {
      accepted = await findAcceptedZernioPost(post, accounts);
    } catch (e: any) {
      console.error(`Unable to reconcile stale post ${post._id}:`, e?.message);
      if (overdueMs >= MAX_PUBLISH_WINDOW_MS) {
        await setStatus(
          post._id,
          ["publishing"],
          "failed",
          "Could not confirm the publishing result within 24 hours.",
        );
        return;
      }

      await setRetryAt(post._id, new Date(now.getTime() + STALE_CLAIM_MS));
      return;
    }

    if (accepted) {
      const status = accepted.status;
      if (status === "published" || status === "failed" || status === "partial") {
        const message =
          status === "published"
            ? undefined
            : `Zernio reports this post as ${status}.`;
        console.log(
          `Reconciled stale post ${post._id} with Zernio post ${accepted._id} (${status})`,
        );
        await setStatus(post._id, ["publishing"], status, message);
        if (status === "published") await logPublished(post, accounts);
      } else {
        await setRetryAt(post._id, new Date(now.getTime() + STALE_CLAIM_MS));
      }
      return;
    }

    if (overdueMs >= MAX_PUBLISH_WINDOW_MS) {
      console.error(
        `Post ${post._id} never accepted by Zernio within window, marking failed`,
      );
      await setStatus(
        post._id,
        ["publishing"],
        "failed",
        "Zernio did not accept this post within 24 hours.",
      );
      return;
    }
  }

  if (accounts.length === 0 || missing.length > 0) {
    const publishError =
      missing.length > 0
        ? `Connect an account for: ${missing.join(", ")}.`
        : "No connected Zernio account was found for the selected platform(s).";
    console.warn(`Post ${post._id} cannot be published: ${publishError}`);
    await setStatus(
      post._id,
      ["scheduled", "publishing"],
      "failed",
      publishError,
    );
    return;
  }

  // Atomic claim (also acts as a lease for stale claims).
  const idempotencyKey = post.zernioIdempotencyKey || randomUUID();
  const claimedPost = await Post.findOneAndUpdate(
    isStaleClaim
      ? {
          _id: post._id,
          status: "publishing",
          claimedAt: { $lte: staleClaimBefore },
        }
      : { _id: post._id, status: "scheduled", scheduledFor: { $lte: now } },
    {
      $set: {
        status: "publishing",
        zernioIdempotencyKey: idempotencyKey,
        claimedAt: now,
        retryAt: null,
      },
      $unset: { publishError: 1 },
    },
    { new: true },
  );
  if (!claimedPost) return;

  const payload = {
    content: post.content,
    publishNow: true,
    ...(post.mediaUrl
      ? {
          mediaItems: [{ type: post.mediaType || "image", url: post.mediaUrl }],
        }
      : {}),
    metadata: { postPilotPostId: String(post._id) },
    platforms: accounts.map((acc) => ({
      platform: acc.platform as any,
      accountId: acc.zernioAccountId!,
    })),
  };

  console.log(
    `Publishing post ${post._id} to Zernio with media ${post.mediaUrl || "none"}`,
  );

  try {
    const result: any = await withTimeout(
      zernio.posts.createPost({
        body: payload,
        headers: { "Idempotency-Key": claimedPost.zernioIdempotencyKey! },
      }),
      ZERNIO_TIMEOUT_MS,
      "Zernio createPost",
    );

    // Some SDKs return { error } instead of throwing on 4xx/5xx.
    if (result?.error || !result?.data) {
      const e: any = new Error("Zernio did not return a post");
      e.status = result?.response?.status;
      e.details = result?.error;
      throw e;
    }

    const publishedPost = result.data?.post || result.data;
    const remoteStatus = publishedPost?.status;
    console.log(
      `Zernio Post created: ${publishedPost._id || publishedPost.id}`,
    );

    if (remoteStatus === "published") {
      await setStatus(post._id, ["publishing"], "published");
      await logPublished(post, accounts);
    } else if (
      remoteStatus === "failed" ||
      remoteStatus === "partial"
    ) {
      const platformErrors = (result.data?.platformResults || [])
        .filter((platformResult: any) => platformResult.status === "failed")
        .map(
          (platformResult: any) =>
            `${platformResult.platform}: ${platformResult.error || "publish failed"}`,
        );
      const publishError =
        platformErrors.join("; ") ||
        result.data?.error ||
        `Zernio reports this post as ${remoteStatus}.`;
      await setStatus(post._id, ["publishing"], remoteStatus, publishError);
    } else {
      await setRetryAt(post._id, new Date(now.getTime() + STALE_CLAIM_MS));
    }
  } catch (err: any) {
    const details = err?.details ?? err?.response?.data ?? err?.message;

    if (isDefinitiveRejection(err)) {
      console.error(`Zernio rejected post ${post._id}:`, details);
      await setStatus(
        post._id,
        ["publishing"],
        "failed",
        typeof details === "string" ? details : "Zernio rejected the post.",
      );
    } else {
      // Outcome unknown: leave as "publishing". After 5 minutes the stale-claim path
      // reconciles with Zernio and, if needed, retries with the SAME idempotency key.
      console.error(
        `Publish of post ${post._id} inconclusive, will reconcile later:`,
        details,
      );
    }
  }
};

export const initScheduler = () => {
  cron.schedule("* * * * *", async () => {
    if (isRunning) {
      console.warn(
        "Previous scheduler run still in progress, skipping this tick",
      );
      return;
    }
    isRunning = true;

    try {
      const now = new Date();
      const staleClaimBefore = new Date(now.getTime() - STALE_CLAIM_MS);

      const postsToPublish = await Post.find({
        scheduledFor: { $lte: now },
        $or: [
          { status: "scheduled" },
          {
            status: "publishing",
            claimedAt: { $lte: staleClaimBefore },
            $or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: now } }],
          },
        ],
      })
        .sort({ scheduledFor: 1 })
        .limit(BATCH_SIZE);

      for (const post of postsToPublish) {
        try {
          await processPost(post, now, staleClaimBefore);
        } catch (err: any) {
          // Unexpected/infrastructure error: don't mark the post failed, retry next tick.
          console.error(
            `Unexpected error processing post ${post._id}:`,
            err?.message,
          );
        }
      }

      if (postsToPublish.length > 0) {
        console.log(
          `Evaluated ${postsToPublish.length} posts at ${now.toISOString()}`,
        );
      }
    } catch (error) {
      console.error("Error in scheduler:", error);
    } finally {
      isRunning = false;
    }
  });

  console.log("Scheduler service initialized");
};