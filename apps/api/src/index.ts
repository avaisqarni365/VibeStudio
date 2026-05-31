/**
 * VibeStudio API entry point.
 *
 * Boots Express, mounts the dev-portal router at /api/v1/dev-portal.
 * This is the ONLY business router — VibeStudio is the dev portal
 * extracted from ACCA as a standalone modernised project.
 *
 * Env loaded by @vibestudio/config at module top via its dotenv side
 * effect (resolves .env from monorepo root).
 */
import "@vibestudio/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createLogger } from "@vibestudio/logging";
import devPortalRouter from "./routes/dev-portal";

const logger = createLogger("vibestudio-api");

const app = express();
const PORT = parseInt(process.env.PORT || "4100", 10);

// ── Security + parsing ─────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Next.js handles its own CSP
  })
);
app.use(
  cors({
    origin: (process.env.WEB_ORIGIN || "http://localhost:3100").split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Request id (lightweight)
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).requestId =
    req.header("X-Request-Id") ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

// ── Health ─────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    service: "vibestudio-api",
    version: process.env.npm_package_version || "0.0.1",
    uptime_s: Math.round(process.uptime()),
  })
);

// ── Business routes ────────────────────────────────────────────────
app.use("/api/v1/dev-portal", devPortalRouter);

// ── 404 ────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
});

// ── Error handler ─────────────────────────────────────────────────
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as any).requestId;
  logger.error("unhandled error", { err: err?.message, stack: err?.stack, requestId });
  if (res.headersSent) return;
  res.status(err?.statusCode || 500).json({
    success: false,
    error: {
      code: err?.code || "INTERNAL_ERROR",
      message: err?.message || "Internal server error",
      requestId,
    },
  });
});

// ── Listen ─────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    logger.info(`vibestudio-api listening on :${PORT}`);
  });
}

export { app };
