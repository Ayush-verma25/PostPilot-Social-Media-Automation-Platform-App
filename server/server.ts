import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import authRouter from "./routes/authRoutes.js";
import socialAuthRouter from "./routes/SocialAuthRoutes.js";
import accountRouter from "./routes/accountRoutes.js";
import postRouter from "./routes/postRoutes.js";
import activityRouter from "./routes/activityRoutes.js";
import stripeRouter from "./routes/stripeRoutes.js";
import { initScheduler } from "./services/schedulerService.js";

const app = express();

const clientUrl = process.env.CLIENT_URL?.trim().replace(/\/$/, "");
if (process.env.NODE_ENV === "production" && !clientUrl) {
  throw new Error("CLIENT_URL must be configured in production");
}

const allowedOrigins = new Set(
  [
    clientUrl,
    ...(process.env.CORS_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
    ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173"]),
  ].filter((origin): origin is string => Boolean(origin)),
);

if (allowedOrigins.size === 0) {
  throw new Error("Configure at least one browser origin in CORS_ORIGINS");
}

app.set("trust proxy", 1);

// Database connection
await connectDB();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: [...allowedOrigins],
  }),
);

// Stripe routes must come before express.json() because webhook needs raw body
app.use("/api/stripe", stripeRouter);

app.use(express.json({ limit: "1mb" }));

// Rate limiting: applies to all /api/ routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { message: "Too many requests from this IP, please try again after 15 minutes" }
});
app.use("/api/", apiLimiter);

const PORT = process.env.PORT || 5000;

app.get("/", (_req: Request, res: Response) => {
  res.send("Server is Live!");
});

app.get("/health", (_req: Request, res: Response) => {
  const isDatabaseReady = mongoose.connection.readyState === 1;
  res.status(isDatabaseReady ? 200 : 503).json({
    status: isDatabaseReady ? "ok" : "unavailable",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/oauth", socialAuthRouter);
app.use("/api/accounts", accountRouter);
app.use("/api/posts", postRouter);
app.use("/api/activity", activityRouter);

// Initialize scheduler
initScheduler();

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const status = Number(err?.status ?? err?.statusCode);
  const responseStatus =
    status >= 400 && status < 500
      ? status
      : err?.name === "MulterError"
        ? err.code === "LIMIT_FILE_SIZE"
          ? 413
          : 400
        : 500;
  res
    .status(responseStatus)
    .json({ message: err?.response?.data?.message || err?.message || "Server Error" });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
