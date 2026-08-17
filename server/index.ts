import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { pool } from "./db";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    isAuthenticated?: boolean;
    username?: string;
    role?: "admin" | "team" | "super_admin";
    email?: string;
    displayName?: string;
    authMethod?: "local" | "microsoft";
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 15,
    }),
    secret: (() => {
      const secret = process.env.SESSION_SECRET;
      if (!secret && process.env.NODE_ENV === "production") {
        throw new Error("SESSION_SECRET env var is required in production");
      }
      return secret || "livaware-platform-dev-secret";
    })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  }),
);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const sensitiveRoutes = ["/passport-parse", "/passport", "/compliance-check", "/health-declaration", "/portal/", "/referee/", "/magic-link", "/auth/"];
        const isSensitive = sensitiveRoutes.some(r => path.includes(r));
        if (isSensitive) {
          logLine += ` :: [REDACTED - sensitive PII]`;
        } else if (process.env.NODE_ENV === "production") {
          logLine += ` :: [${typeof capturedJsonResponse === 'object' && Array.isArray(capturedJsonResponse) ? capturedJsonResponse.length + ' items' : 'ok'}]`;
        } else {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Idempotent seed for the 21 induction items (task 114). Best-effort:
  // if the seeder fails (e.g. schema migration not yet run) we log and
  // continue rather than blocking startup.
  if (process.env.NODE_ENV !== "test") {
    try {
      const { seedInductionItems } = await import("./induction-seed");
      // Default boot mode: insert-only. Existing rows are NEVER
      // overwritten — admin edits are authoritative. Use
      // POST /api/admin/induction/reseed (super-admin) to force a
      // reconciliation back to the bundled handbook content.
      const result = await seedInductionItems();
      if (result.inserted || result.updated || result.backfilled) {
        log(
          `induction items seeded: ${result.inserted} inserted, ${result.updated} updated, ${result.backfilled} legacy acks back-filled`,
          "induction",
        );
      }
    } catch (err: any) {
      console.error("[induction] seed failed:", err?.message || err);
    }
    try {
      const { reconcileArcadeSopRefs } = await import("./arcade-sop-refs");
      const r = await reconcileArcadeSopRefs();
      if (r.patched) log(`arcade SOP refs patched on ${r.patched} modules`, "induction");
    } catch (err: any) {
      console.error("[induction] arcade SOP refs reconcile failed:", err?.message || err);
    }
  }

  // Mirror every existing /uploads file into Replit Object Storage so
  // files written before this layer existed stop being at risk on the
  // next autoscale event. Best-effort + idempotent — skips files
  // already in the bucket, logs anything missing from BOTH stores.
  // Run in the background so it doesn't slow startup.
  if (process.env.NODE_ENV !== "test") {
    void (async () => {
      try {
        const { backfillUploadsToBucket } = await import("./object-storage");
        await backfillUploadsToBucket();
      } catch (err: any) {
        console.error("[object-storage] startup backfill failed:", err?.message || err);
      }
    })();
  }

  // One-time backfill: rewrite any stored email_templates fields that still
  // contain the old product name "NurseOnboard" / "Nurse Onboarding" from
  // before the rename to Basecamp. Safe to run on every boot — it only
  // writes rows that still contain the old strings.
  if (process.env.NODE_ENV !== "test") {
    void (async () => {
      try {
        const { backfillEmailTemplateNames } = await import("./email-template-name-backfill");
        await backfillEmailTemplateNames();
      } catch (err: any) {
        console.error("[email-templates] name backfill failed:", err?.message || err);
      }
    })();
  }

  // Background scheduler for the two automated chase jobs:
  //   - Weekly bulk chase email (toggleable, default off)
  //   - Mailbox reply scan       (toggleable, default on, default 30 min)
  // Both are configured from /settings (admin-only). See
  // server/training-chase-scheduler.ts for the per-tick logic.
  if (process.env.NODE_ENV !== "test") {
    const { startTrainingChaseScheduler } = await import("./training-chase-scheduler");
    startTrainingChaseScheduler();
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
