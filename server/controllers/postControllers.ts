import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import { cloudinary } from "../config/cloudinary.js";
import Generation from "../models/Generation.js";
import Post from "../models/Post.js";

const getGeminiText = (response: any): string => {
  if (typeof response?.text === "string" && response.text.trim()) {
    return response.text.trim();
  }

  const candidateText = (response?.candidates ?? [])
    .flatMap((candidate: any) => candidate?.content?.parts ?? [])
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  return candidateText;
};

const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

class GeminiQuotaError extends Error {
  constructor() {
    super(
      "Gemini API quota is exhausted for the configured model. Check your project's Gemini API usage and billing/plan, or wait for the quota to reset before trying again.",
    );
    this.name = "GeminiQuotaError";
  }
}

const isGeminiQuotaError = (error: any): boolean => {
  const response = error?.response?.data?.error ?? error?.response?.data;
  const details = [
    ...(Array.isArray(error?.details) ? error.details : []),
    ...(Array.isArray(response?.details) ? response.details : []),
  ];
  const detailTypes = details
    .map((detail: any) => String(detail?.["@type"] ?? "").toLowerCase())
    .join(" ");
  const reasons = details
    .map((detail: any) => String(detail?.reason ?? "").toLowerCase())
    .join(" ");
  const status = String(error?.status ?? response?.status ?? "").toLowerCase();
  const statusCode = Number(
    error?.code ?? error?.statusCode ?? error?.status ?? response?.code,
  );
  const isRetryableRateLimit =
    detailTypes.includes("retryinfo") ||
    /rate.?limit|too.?many.?requests/.test(reasons);

  return (
    !isRetryableRateLimit &&
    (status === "resource_exhausted" ||
      status === "quota_exceeded" ||
      statusCode === 429 ||
      detailTypes.includes("quotafailure") ||
      /quota.?exhausted/.test(reasons))
  );
};

const getGeminiModelCandidates = () => {
  const configured = process.env.GEMINI_MODEL?.trim();
  return [
    ...new Set([
      ...(configured ? [configured] : []),
      "gemini-3.8-flash",
      "gemini-3.7-flash",
    ]),
  ];
};

const generateWithRetry = async (ai: GoogleGenAI, prompt: string, tone: string) => {
  const candidates = getGeminiModelCandidates();
  let lastError: any;
  let quotaExhausted = false;

  for (const model of candidates) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents: `Generate a social mediapost based on this prompt: "${prompt}". Tone: ${tone}. include relevant hashtags. Format the response as a JSON with "content" and "imagePrompt" fields. The "imagePrompt" should highly descriptive prompt for an image generator that complements the post.`,
        });
      } catch (error: any) {
        const status = error?.status ?? error?.statusCode ?? error?.response?.status;
        if (isGeminiQuotaError(error)) {
          quotaExhausted = true;
          lastError = error;
          break;
        }
        const isTransient =
          status === 429 ||
          status === 500 ||
          status === 503 ||
          error?.message?.toLowerCase().includes("unavailable") ||
          error?.message?.toLowerCase().includes("high demand") ||
          error?.message?.toLowerCase().includes("overloaded");

        lastError = error;

        if (!isTransient || attempt === 3) {
          break;
        }

        const delayMs = 1000 * attempt * 2;
        console.warn(
          `Gemini model ${model} unavailable (attempt ${attempt}/3), retrying in ${delayMs}ms`,
          error?.message,
        );
        await wait(delayMs);
      }
    }
  }

  if (quotaExhausted && isGeminiQuotaError(lastError)) {
    throw new GeminiQuotaError();
  }
  throw lastError ?? new Error("Gemini generation failed");
};

// Helper to poll Leonardo AI
const pollLeonardoJob = async (
  generationId: string,
  apiKey: string,
): Promise<string> => {
  const delay = 5000;
  const deadline = Date.now() + 3 * 60 * 1000;

  while (Date.now() < deadline) {
    let generation;
    try {
      const response = await axios.get(
        `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
        {
          timeout: 20000,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${apiKey}`,
          },
        },
      );
      generation = response.data.generations_by_pk;
    } catch (err: any) {
      const status = err?.response?.status;
      const isTransient =
        status === undefined ||
        status === 408 ||
        status === 429 ||
        status >= 500;
      if (!isTransient) throw err;

      console.error("polling error", err?.response?.data || err.message);
      await wait(Math.min(delay, Math.max(0, deadline - Date.now())));
      continue;
    }

    if (!generation) {
      throw new Error("Leonardo AI returned no generation status.");
    }

    if (
      generation?.status === "COMPLETE" ||
      generation?.status === "COMPLETED"
    ) {
      const imageUrl = generation.generated_images?.[0]?.url;
      if (typeof imageUrl === "string" && imageUrl) {
        return imageUrl;
      }
      throw new Error("Generation completed but no images found");
    }

    if (generation?.status === "FAILED") {
      throw new Error("Leonardo AI generation failed");
    }

    await wait(Math.min(delay, Math.max(0, deadline - Date.now())));
  }

  throw new Error("Leonardo AI generation timed out");
};

const getLeonardoGenerationId = (response: unknown): string | undefined => {
  const visited = new Set<object>();
  const pending: unknown[] = [response];

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || visited.has(current)) {
      continue;
    }
    visited.add(current);

    for (const [key, value] of Object.entries(current)) {
      if (
        /^(generation_?id|generationId)$/i.test(key) &&
        typeof value === "string" &&
        value.trim()
      ) {
        return value.trim();
      }
      if (value && typeof value === "object") {
        pending.push(value);
      }
    }
  }

  return undefined;
};

const describeLeonardoResponse = (response: unknown): string => {
  if (!response || typeof response !== "object") {
    return `response type: ${typeof response}`;
  }

  const responseObject = response as Record<string, unknown>;
  const topLevelKeys = Object.keys(responseObject);
  const nestedKeys = Object.fromEntries(
    topLevelKeys
      .filter(
        (key) =>
          responseObject[key] && typeof responseObject[key] === "object",
      )
      .map((key) => [
        key,
        Object.keys(responseObject[key] as object),
      ]),
  );
  return `response keys: ${JSON.stringify(topLevelKeys)}; nested keys: ${JSON.stringify(nestedKeys)}`;
};

// Generate Post
// POST /api/posts/generate
export const generatePost = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({ message: "Not authorized" });
      return;
    }

    const { prompt, tone, generateImage } = req.body;
    const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";

    if (!trimmedPrompt) {
      res.status(400).json({ message: "Prompt is required." });
      return;
    }

    const leonardoKey = process.env.LEONARDO_API_KEY;
    if (generateImage && !leonardoKey) {
      res.status(503).json({
        message:
          "Image generation is unavailable: LEONARDO_API_KEY is not configured.",
      });
      return;
    }
    if (
      generateImage &&
      (!process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET)
    ) {
      res.status(503).json({
        message: "Image generation is unavailable: Cloudinary is not configured.",
      });
      return;
    }

    const apikey = process.env.GEMINI_API_KEY;
    if (!apikey) {
      res.status(400).json({
        message:
          "Gemini API key is missing. Please set it in the server/.env file.",
      });
      return;
    }

    const ai = new GoogleGenAI({ apiKey: apikey });

    //Generate text with retry/backoff for temporary Google capacity issues.
    const textResponse = await generateWithRetry(ai, trimmedPrompt, tone);

    let content = "";
    let imagePrompt = trimmedPrompt;

    try {
      const rawText = getGeminiText(textResponse) || "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const data = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { content: rawText, imagePrompt: trimmedPrompt };
      content = data.content ?? rawText;
      imagePrompt = data.imagePrompt ?? trimmedPrompt;
    } catch (e) {
      content = getGeminiText(textResponse) || "";
    }
    content = typeof content === "string" ? content.trim() : "";
    if (!content) {
      res.status(502).json({ message: "Gemini returned no post content." });
      return;
    }
    imagePrompt =
      typeof imagePrompt === "string" && imagePrompt.trim()
        ? imagePrompt.trim()
        : trimmedPrompt;

    let mediaUrl = "";
    if (generateImage) {
      try {
        const leonardoKey = process.env.LEONARDO_API_KEY;
        if (leonardoKey) {
          // Use Leonardo API to generate image
          const leoResponse = await axios.post(
            "https://cloud.leonardo.ai/api/rest/v2/generations",
            {
              public: false,
              model: "gpt-image-2",
              parameters: {
                quality: "LOW",
                prompt: imagePrompt,
                quantity: 1,
                width: 1024,
                height: 1024,
                prompt_enhance: "OFF",
              },
            },
            {
              timeout: 30000,
              headers: {
                accept: "application/json",
                authorization: `Bearer ${leonardoKey}`,
                "content-type": "application/json",
              },
            },
          );

          const generationId = getLeonardoGenerationId(leoResponse.data);
          if (!generationId) {
            throw new Error(
              `Leonardo AI returned no generation ID (${describeLeonardoResponse(leoResponse.data)}).`,
            );
          }
          const tempUrl = await pollLeonardoJob(generationId, leonardoKey);

          // upload to cloudinary
          const uploadResult = await cloudinary.uploader.upload(tempUrl, {
            folder: "ai-generations",
          });
          if (!uploadResult.secure_url) {
            throw new Error("Cloudinary returned no public image URL.");
          }
          mediaUrl = uploadResult.secure_url;
        }
      } catch (err: unknown) {
        console.error(
          "Image generation failed:",
          axios.isAxiosError(err)
            ? err.response?.data || err.message
            : err instanceof Error
              ? err.message
              : err,
        );
        res.status(502).json({
          message:
            "Image generation failed. Check the Leonardo AI and Cloudinary server configuration, then try again.",
        });
        return;
      }
    }

    // Save Generation to DB
    const generation = await Generation.create({
      user: req.user._id,
      prompt: trimmedPrompt,
      content,
      mediaUrl,
      mediaType: mediaUrl ? "image" : undefined,
      tone,
    });

    res.status(201).json(generation);
  } catch (error: any) {
    if (error instanceof GeminiQuotaError) {
      console.warn("Gemini generation blocked by API quota.");
      res.status(429).json({
        message: `${error.message} Review https://ai.google.dev/gemini-api/docs/rate-limits.`,
      });
      return;
    }
    res.status(500).json({ message: error?.message || "Server Error" });
  }
};

// Get Generation
// Get /api/posts/generations
export const getGenerations = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const generations = await Generation.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(generations);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Server Error" });
  }
};

// Get Post
// Get /api/posts
export const getPosts = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const posts = await Post.find({ user: req.user._id });
    res.json(posts);
  } catch (error: any) {
    console.error("Failed to fetch posts:", error);
    res.status(500).json({ message: error?.message || "Server Error" });
  }
};

// Schedule Post
// Post /api/posts
export const schedulePost = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { content, platforms, scheduledFor, status } = req.body;

    if (status !== "draft" && status !== "scheduled") {
      res.status(400).json({ message: "Status must be draft or scheduled" });
      return;
    }
    if (typeof content !== "string" || !content.trim()) {
      res.status(400).json({ message: "Post content is required." });
      return;
    }

    const scheduledDate = new Date(scheduledFor);
    if (
      Number.isNaN(scheduledDate.getTime()) ||
      scheduledDate.getTime() < Date.now()
    ) {
      res.status(400).json({ message: "scheduledFor must be a valid future date" });
      return;
    }

    //Parse platforms if it comes as a stringified array from FormData
    let parsedPlatforms = platforms;
    if (typeof platforms === "string") {
      try {
        parsedPlatforms = JSON.parse(platforms);
      } catch {
        parsedPlatforms = platforms.split(",");
      }
    }
    if (
      !Array.isArray(parsedPlatforms) ||
      parsedPlatforms.length === 0 ||
      parsedPlatforms.some((platform) => typeof platform !== "string")
    ) {
      res.status(400).json({ message: "Select at least one valid platform." });
      return;
    }
    const supportedPlatforms = new Set([
      "facebook",
      "twitter",
      "instagram",
      "linkedin",
      "facebook_page",
      "linkedin_page",
      "instagram_business",
    ]);
    if (parsedPlatforms.some((platform) => !supportedPlatforms.has(platform))) {
      res.status(400).json({ message: "One or more platforms are not supported." });
      return;
    }

    let mediaUrl: string | undefined = req.body.mediaUrl;
    let mediaType: "image" | "video" | undefined = req.body.mediaType;

    if (req.file) {
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "auto", folder: "postpile-uploads" },
          (error, uploadedResult) => {
            if (error) reject(error);
            else if (!uploadedResult) {
              reject(new Error("Cloudinary upload returned no result"));
            } else {
              resolve(uploadedResult);
            }
          },
        );
        stream.end(req.file!.buffer);
      });
      mediaUrl = result.secure_url;
      mediaType = result.resource_type === "video" ? "video" : "image";
    }

    if (
      (parsedPlatforms.includes("instagram") ||
        parsedPlatforms.includes("instagram_business")) &&
      !mediaUrl
    ) {
      res.status(400).json({
        message: "Instagram posts require an image or video.",
      });
      return;
    }

    const post = await Post.create({
      user: req.user._id,
      content: content.trim(),
      platform: parsedPlatforms,
      mediaUrl,
      mediaType,
      scheduledFor,
      status,
    });
    res.status(201).json(post);
  } catch (error: any) {
    console.error("Failed to schedule post:", error);
    res.status(500).json({ message: error?.message || "Server Error" });
  }
};
