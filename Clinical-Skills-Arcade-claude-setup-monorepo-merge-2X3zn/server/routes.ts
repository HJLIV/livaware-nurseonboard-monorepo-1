import type { Express } from "express";
import type { Server } from "http";
import { apiLimiter, loginLimiter, requireAuth, requireAdmin } from "./middleware";
import { logAction } from "./services/audit";

function getCredentials() {
  const adminUsername = process.env["ADMIN_USERNAME"] || "admin";
  const adminPassword = process.env["ADMIN_PASSWORD"] || "admin";
  const teamUsername = process.env["TEAM_USERNAME"] || "team";
  const teamPassword = process.env["TEAM_PASSWORD"] || "";
  return { adminUsername, adminPassword, teamUsername, teamPassword };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const { adminUsername, adminPassword, teamUsername, teamPassword } = getCredentials();

  app.use("/api", apiLimiter);

  // === AUTH ROUTES ===
  app.post("/api/auth/login", loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    if (username === adminUsername && password === adminPassword) {
      req.session.isAuthenticated = true;
      req.session.username = username;
      req.session.role = "admin";
      req.session.authMethod = "local";
      return res.json({ ok: true, username, role: "admin" });
    }
    if (teamPassword && username === teamUsername && password === teamPassword) {
      req.session.isAuthenticated = true;
      req.session.username = username;
      req.session.role = "team";
      req.session.authMethod = "local";
      return res.json({ ok: true, username, role: "team" });
    }
    return res.status(401).json({ message: "Invalid username or password" });
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

  app.get("/api/auth/me", (req, res) => {
    if (req.session?.isAuthenticated) {
      return res.json({
        authenticated: true,
        username: req.session.username,
        role: req.session.role,
        email: req.session.email,
        displayName: req.session.displayName,
        authMethod: req.session.authMethod,
      });
    }
    return res.status(401).json({ authenticated: false });
  });

  // === PROTECTED ROUTE MIDDLEWARE ===
  app.use("/api/nurses", requireAuth);
  app.use("/api/dashboard", requireAuth);
  app.use("/api/pipeline", requireAuth);
  app.use("/api/audit-logs", requireAdmin);

  // === NURSE MANAGEMENT (unified admin) ===
  const { registerNurseRoutes } = await import("./routes/admin");
  registerNurseRoutes(app);

  // === DASHBOARD ===
  const { registerDashboardRoutes } = await import("./routes/dashboard");
  registerDashboardRoutes(app);

  // === PREBOARD MODULE ===
  const { registerPreboardRoutes } = await import("./routes/preboard");
  registerPreboardRoutes(app);

  // === ONBOARD MODULE ===
  const { registerOnboardRoutes } = await import("./routes/onboard");
  registerOnboardRoutes(app);

  // === SKILLS ARCADE MODULE ===
  const { registerSkillsArcadeRoutes } = await import("./routes/skills-arcade");
  registerSkillsArcadeRoutes(app);

  // === PORTAL (nurse-facing) ===
  const { registerPortalRoutes } = await import("./routes/portal");
  registerPortalRoutes(app);

  // === AUDIT ===
  const { registerAuditRoutes } = await import("./routes/audit");
  registerAuditRoutes(app);

  return httpServer;
}
