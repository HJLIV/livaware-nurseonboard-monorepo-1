import type { Express } from "express";
import type { Server } from "http";
import { apiLimiter, loginLimiter, requireAuth, requireAdmin } from "./middleware";
import { logAction } from "./services/audit";

function getCredentials() {
  const adminUsername = process.env["ADMIN_USERNAME"] || "admin";
  const adminPassword = process.env["ADMIN_PASSWORD"] || "admin";
  const teamUsername = process.env["TEAM_USERNAME"] || "team";
  const teamPassword = process.env["TEAM_PASSWORD"] || "";
  const superAdminUsername = process.env["SUPER_ADMIN_USERNAME"] || "";
  const superAdminPassword = process.env["SUPER_ADMIN_PASSWORD"] || "";
  return {
    adminUsername,
    adminPassword,
    teamUsername,
    teamPassword,
    superAdminUsername,
    superAdminPassword,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use("/api", apiLimiter);

  // === AUTH ROUTES ===
  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    // Read credentials fresh on every request so that secrets added after
    // startup are picked up without requiring an app restart.
    const {
      adminUsername,
      adminPassword,
      teamUsername,
      teamPassword,
      superAdminUsername,
      superAdminPassword,
    } = getCredentials();
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    let role: "admin" | "team" | "super_admin" | null = null;
    // Super-admin check runs first so it wins even if its username/password
    // happens to collide with the regular admin credentials in dev.
    if (
      superAdminUsername &&
      superAdminPassword &&
      username === superAdminUsername &&
      password === superAdminPassword
    ) {
      role = "super_admin";
    } else if (username === adminUsername && password === adminPassword) {
      role = "admin";
    } else if (teamPassword && username === teamUsername && password === teamPassword) {
      role = "team";
    }
    if (!role) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    try {
      // Regenerate to issue a fresh session id post-login (mitigates session
      // fixation), then explicitly save before responding so the
      // Postgres-backed store has finished persisting the row before the
      // client follows up with /api/auth/me.
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });
      req.session.isAuthenticated = true;
      req.session.username = username;
      req.session.role = role;
      req.session.authMethod = "local";
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
      // Audit super-admin sign-in so the activity dashboard can surface
      // every privileged session. Best-effort — failures are logged only.
      if (role === "super_admin") {
        try {
          await logAction(null, "system", "super_admin_login", username, {
            method: "local",
          });
        } catch (auditErr: any) {
          console.error("[auth] super_admin_login audit error:", auditErr?.message || auditErr);
        }
      }
      return res.json({ ok: true, username, role });
    } catch (err: any) {
      console.error("[auth] session save error:", err?.message || err);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      return res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (req.session?.isAuthenticated) {
      // Reading-behaviour columns / summary are restricted to super_admin
      // only — they can become an HR/disciplinary signal so we don't show
      // them to every team admin.
      const canViewPolicyReadBehaviour = req.session.role === "super_admin";
      return res.json({
        authenticated: true,
        username: req.session.username,
        role: req.session.role,
        email: req.session.email,
        displayName: req.session.displayName,
        authMethod: req.session.authMethod,
        canViewPolicyReadBehaviour,
      });
    }
    return res.status(401).json({ authenticated: false });
  });

  // === MICROSOFT SSO ===
  const { registerMicrosoftAuthRoutes } = await import("./msal-auth");
  registerMicrosoftAuthRoutes(app);

  // === PROTECTED ROUTE MIDDLEWARE ===
  app.use("/api/nurses", requireAuth);
  app.use("/api/candidates", requireAuth);
  app.use("/api/documents", requireAdmin);
  app.use("/api/dashboard", requireAuth);
  app.use("/api/pipeline", requireAuth);
  app.use("/api/audit-logs", requireAdmin);
  app.use("/api/admin", requireAdmin);

  // === NURSE MANAGEMENT (legacy simple CRUD) ===
  const { registerNurseRoutes } = await import("./routes/admin");
  registerNurseRoutes(app);

  // === ADMIN COMPLIANCE MATRIX REPORTS ===
  const { registerAdminReportsRoutes } = await import("./routes/admin-reports");
  registerAdminReportsRoutes(app);

  // === ADMIN PLATFORM SETTINGS (toggles for scheduled jobs etc.) ===
  const { registerAdminSettingsRoutes } = await import("./routes/admin-settings");
  registerAdminSettingsRoutes(app);

  // === DASHBOARD ===
  const { registerDashboardRoutes } = await import("./routes/dashboard");
  registerDashboardRoutes(app);

  // === PREBOARD MODULE ===
  const { registerRoutes: registerPreboardRoutes } = await import("./routes/preboard");
  await registerPreboardRoutes(app);

  // === ONBOARD MODULE (full AI-powered compliance, NMC, DBS, references) ===
  const { registerAdminRoutes } = await import("./routes/onboard");
  registerAdminRoutes(app);

  // === PORTAL (nurse-facing self-service) ===
  const { registerPortalRoutes } = await import("./routes/portal");
  registerPortalRoutes(app);

  // === REFEREE FORM ===
  const { registerRefereeRoutes } = await import("./routes/referee");
  registerRefereeRoutes(app);

  // === SKILLS ARCADE MODULE ===
  const { registerRoutes: registerArcadeRoutes } = await import("./routes/skills-arcade");
  await registerArcadeRoutes(app);

  // === AUDIT ===
  const { registerAuditRoutes } = await import("./routes/audit");
  registerAuditRoutes(app);

  // === DOCUMENTS BROWSER ===
  const { registerDocumentRoutes } = await import("./routes/documents");
  registerDocumentRoutes(app);

  // === POLICIES (admin-managed library + nurse acknowledgements) ===
  const { registerPolicyRoutes } = await import("./routes/policies");
  registerPolicyRoutes(app);

  // === SUPER ADMIN (activity dashboard) ===
  const { registerSuperAdminRoutes } = await import("./routes/super-admin");
  registerSuperAdminRoutes(app);

  return httpServer;
}
