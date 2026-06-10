import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../arcade-storage";
import { storage as platformStorage } from "../storage";
import { scoreAttempt, type TaskResponse } from "../arcade-scoring";
import { seedDatabase } from "../arcade-seed";
import { loginSchema, registerSchema } from "@shared/schema";
import type { User, ScenarioContent } from "@shared/schema";
import { z } from "zod";
import { mintChasePortalLinkForNurse } from "../training-notifications";
import { requireInductionAcknowledged } from "../middleware";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function isPlatformAdmin(req: Request): boolean {
  const role = (req.session as any).role;
  return !!(req.session as any).isAuthenticated && (role === "admin" || role === "super_admin");
}

function isPlatformSuperAdmin(req: Request): boolean {
  return !!(req.session as any).isAuthenticated && (req.session as any).role === "super_admin";
}

// Gate for arcade routes that mutate platform-config (module imports,
// scenario content, admin/team user invites). Bridges platform-super-admin
// sessions into the arcade route's user-shaped req.user object so the
// downstream handler can keep using `(req as any).user.name` for audit
// logging.
function requireArcadeSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isPlatformSuperAdmin(req)) {
    if (!(req.session as any).isAuthenticated) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.status(403).json({ message: "Super admin access required" });
  }
  (req as any).user = {
    id: "platform-admin",
    name: (req.session as any).displayName || (req.session as any).username || "Super Admin",
    email: (req.session as any).email || "",
    role: "admin",
    active: true,
  } as User;
  next();
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId || isPlatformAdmin(req)) {
    if (!req.session.userId && isPlatformAdmin(req)) {
      req.session.userId = "platform-admin";
    }
    return next();
  }
  return res.status(401).json({ message: "Not authenticated" });
}

function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isPlatformAdmin(req) && roles.includes("admin")) {
      (req as any).user = {
        id: "platform-admin",
        name: (req.session as any).displayName || (req.session as any).username || "Platform Admin",
        email: (req.session as any).email || "",
        role: "admin",
        active: true,
      } as User;
      return next();
    }
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    (req as any).user = user;
    next();
  };
}

export async function registerRoutes(
  app: Express
): Promise<void> {
  await seedDatabase();

  app.get("/api/auth/setup-status", async (_req, res) => {
    try {
      const userCount = await storage.getUserCount();
      res.json({ needsSetup: userCount === 0 });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Username and password required" });
      }
      const { username, password } = parsed.data;
      let user = await storage.getUserByUsername(username);
      if (!user) {
        user = await storage.getUserByEmail(username.toLowerCase());
      }
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.session.userId = user.id;
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0]?.message ?? "Invalid registration data";
        return res.status(400).json({ message: firstError });
      }
      const { name, email, password } = parsed.data;

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      const username = email.toLowerCase();
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const allUsers = await storage.getAllUsers();
      const hasAdmin = allUsers.some(u => u.role === "admin");
      const isFirstUser = allUsers.length === 0;

      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name,
        email: email.toLowerCase(),
        role: (isFirstUser || !hasAdmin) ? "admin" : "nurse",
        active: true,
      });

      req.session.userId = user.id;
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/nurse/dashboard", requireAuth, async (req, res) => {
    try {
      const allModules = await storage.getAllModules();

      if (isPlatformAdmin(req)) {
        const moduleData = await Promise.all(
          allModules.map(async (mod) => {
            const mv = await storage.getLatestModuleVersion(mod.id);
            const scenarioCount = mv ? await storage.getScenarioCount(mv.id) : 0;
            const assignmentCount = await storage.getAssignmentCount(mod.id);
            return {
              id: mod.id,
              moduleId: mod.id,
              moduleName: mod.name,
              moduleDescription: mod.description ?? "",
              moduleIcon: mod.icon ?? "BookOpen",
              moduleColor: mod.color ?? "blue",
              status: "available",
              dueAt: null,
              attemptCount: 0,
              failedAttempts: 0,
              lastAttemptResult: null,
              moduleVersionId: mv?.id ?? "",
              scenarioCount,
              assignmentCount,
            };
          })
        );
        return res.json({
          isAdmin: true,
          assignments: moduleData,
          stats: {
            totalAssigned: allModules.length,
            completed: 0,
            inProgress: 0,
            locked: 0,
          },
        });
      }

      const userId = req.session.userId!;
      const userAssignments = await storage.getAssignmentsByUser(userId);

      const assignmentData = await Promise.all(
        userAssignments.map(async (a) => {
          const mod = allModules.find((m) => m.id === a.moduleId);
          const attemptsList = await storage.getAttemptsByAssignment(a.id);
          const failedAttempts = attemptsList.filter((at) => at.result === "fail").length;
          const lastAttempt = attemptsList[0];

          return {
            id: a.id,
            moduleId: a.moduleId,
            moduleName: mod?.name ?? "Unknown",
            moduleDescription: mod?.description ?? "",
            moduleIcon: mod?.icon ?? "BookOpen",
            moduleColor: mod?.color ?? "blue",
            status: a.status,
            dueAt: a.dueAt,
            attemptCount: attemptsList.length,
            failedAttempts,
            lastAttemptResult: lastAttempt?.result ?? null,
            moduleVersionId: a.moduleVersionId,
          };
        })
      );

      const stats = {
        totalAssigned: assignmentData.length,
        completed: assignmentData.filter((a) => a.status === "passed").length,
        inProgress: assignmentData.filter((a) => a.status === "in_progress" || a.status === "failed").length,
        locked: assignmentData.filter((a) => a.status === "locked").length,
      };

      res.json({ assignments: assignmentData, stats });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/nurse/assignments/:id", requireAuth, async (req, res) => {
    try {
      const assignment = await storage.getAssignment(req.params.id as string);
      if (!assignment || assignment.userId !== req.session.userId) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      const allModules = await storage.getAllModules();
      const mod = allModules.find((m) => m.id === assignment.moduleId);
      const attemptsList = await storage.getAttemptsByAssignment(assignment.id);
      const failedAttempts = attemptsList.filter((at) => at.result === "fail").length;

      res.json({
        moduleName: mod?.name ?? "Unknown",
        moduleDescription: mod?.description ?? "",
        status: assignment.status,
        attemptCount: attemptsList.length,
        failedAttempts,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const startAttemptSchema = z.object({ assignmentId: z.string().min(1) });

  app.post("/api/nurse/attempts/start", requireAuth, requireInductionAcknowledged, async (req, res) => {
    try {
      const parsed = startAttemptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "assignmentId is required" });
      }
      const { assignmentId } = parsed.data;
      const assignment = await storage.getAssignment(assignmentId);
      if (!assignment || assignment.userId !== req.session.userId) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      if (assignment.status === "locked") {
        return res.status(403).json({ message: "This module is locked. Face-to-face training required." });
      }

      const scenarioList = await storage.getScenariosByModuleVersion(assignment.moduleVersionId);
      if (scenarioList.length === 0) {
        return res.status(404).json({ message: "No scenarios available" });
      }

      const scenario = scenarioList[Math.floor(Math.random() * scenarioList.length)];

      const attempt = await storage.createAttempt({
        userId: req.session.userId!,
        moduleVersionId: assignment.moduleVersionId,
        scenarioId: scenario.id,
        assignmentId: assignment.id,
      });

      if (assignment.status === "not_started") {
        await storage.updateAssignmentStatus(assignment.id, "in_progress");
      }

      const allModules = await storage.getAllModules();
      const mod = allModules.find((m) => m.id === assignment.moduleId);

      res.json({
        attemptId: attempt.id,
        scenario: {
          id: scenario.id,
          title: scenario.title,
          contentJson: scenario.contentJson,
        },
        moduleName: mod?.name ?? "Unknown",
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const submitAttemptSchema = z.object({
    attemptId: z.string().min(1),
    responses: z.array(z.object({
      taskId: z.string(),
      type: z.string(),
      answer: z.any(),
    })),
  });

  app.post("/api/nurse/attempts/submit", requireAuth, requireInductionAcknowledged, async (req, res) => {
    try {
      const parsed = submitAttemptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid submission format" });
      }
      const { attemptId, responses } = parsed.data;
      const attempt = await storage.getAttempt(attemptId);
      if (!attempt || attempt.userId !== req.session.userId) {
        return res.status(404).json({ message: "Attempt not found" });
      }

      const scenario = await storage.getScenario(attempt.scenarioId);
      if (!scenario) {
        return res.status(404).json({ message: "Scenario not found" });
      }

      const content = scenario.contentJson as ScenarioContent;
      const result = scoreAttempt(content, responses as TaskResponse[]);

      await storage.updateAttempt(attemptId, {
        submittedAt: new Date(),
        result: result.passed ? "pass" : "fail",
        minorCount: result.minorCount,
        majorCount: result.majorCount,
        responseJson: responses,
        feedbackJson: result,
      });

      const assignment = await storage.getAssignment(attempt.assignmentId);
      if (assignment) {
        if (result.passed) {
          await storage.updateAssignmentStatus(assignment.id, "passed");
        } else {
          const failCount = await storage.getFailedAttemptCount(
            attempt.userId,
            attempt.moduleVersionId
          );
          if (failCount >= 4) {
            await storage.updateAssignmentStatus(assignment.id, "locked");
            await storage.createRemediationCase({
              userId: attempt.userId,
              moduleVersionId: attempt.moduleVersionId,
              moduleId: assignment.moduleId,
              status: "open",
            });
            await storage.upsertClearance({
              userId: attempt.userId,
              moduleId: assignment.moduleId,
              moduleVersionId: attempt.moduleVersionId,
              status: "restricted",
            });
          } else {
            await storage.updateAssignmentStatus(assignment.id, "failed");
          }
        }
      }

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/trainer/remediation-queue", requireRole("trainer", "admin"), async (req, res) => {
    try {
      const cases = await storage.getRemediationCases();
      const allUsers = await storage.getAllUsers();
      const allModules = await storage.getAllModules();

      const enriched = await Promise.all(
        cases.map(async (c) => {
          const user = allUsers.find((u) => u.id === c.userId);
          const mod = allModules.find((m) => m.id === c.moduleId);
          const failCount = await storage.getFailedAttemptCount(c.userId, c.moduleVersionId);

          return {
            id: c.id,
            userId: c.userId,
            userName: user?.name ?? "Unknown",
            userEmail: user?.email ?? "",
            moduleName: mod?.name ?? "Unknown",
            moduleId: c.moduleId,
            status: c.status,
            lockedAt: c.lockedAt,
            failedAttempts: failCount,
            majorErrors: 0,
            completedAt: c.completedAt,
          };
        })
      );

      res.json(enriched);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/trainer/remediation/:caseId/details", requireRole("trainer", "admin"), async (req, res) => {
    try {
      const rc = await storage.getRemediationCase(req.params.caseId as string);
      if (!rc) {
        return res.status(404).json({ message: "Case not found" });
      }
      const user = await storage.getUser(rc.userId);
      const mod = await storage.getModule(rc.moduleId);
      const attemptHistory = await storage.getAttemptsByUserAndModule(rc.userId, rc.moduleVersionId);
      const notes = await storage.getRemediationNotes(rc.id);

      const enrichedAttempts = attemptHistory.map((a) => ({
        id: a.id,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        result: a.result,
        minorCount: a.minorCount,
        majorCount: a.majorCount,
      }));

      res.json({
        id: rc.id,
        userId: rc.userId,
        userName: user?.name ?? "Unknown",
        userEmail: user?.email ?? "",
        moduleName: mod?.name ?? "Unknown",
        moduleId: rc.moduleId,
        status: rc.status,
        lockedAt: rc.lockedAt,
        completedAt: rc.completedAt,
        attempts: enrichedAttempts,
        notes: notes.map((n) => ({
          id: n.id,
          note: n.note,
          trainingDate: n.trainingDate,
          competencyOutcome: n.competencyOutcome,
          createdAt: n.createdAt,
        })),
        totalMajors: enrichedAttempts.reduce((sum, a) => sum + a.majorCount, 0),
        totalMinors: enrichedAttempts.reduce((sum, a) => sum + a.minorCount, 0),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const addNoteSchema = z.object({ note: z.string().min(1) });

  app.post("/api/trainer/remediation/:caseId/note", requireRole("trainer", "admin"), async (req, res) => {
    try {
      const parsed = addNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Note text is required" });
      }
      const rc = await storage.getRemediationCase(req.params.caseId as string);
      if (!rc) {
        return res.status(404).json({ message: "Case not found" });
      }

      await storage.createRemediationNote({
        remediationCaseId: rc.id,
        trainerId: req.session.userId!,
        note: parsed.data.note,
        trainingDate: new Date(),
      });

      if (rc.status === "open") {
        await storage.updateRemediationCase(rc.id, { status: "in_progress" });
      }

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const completeSchema = z.object({ competencyOutcome: z.enum(["cleared", "restricted"]) });

  app.post("/api/trainer/remediation/:caseId/complete", requireRole("trainer", "admin"), async (req, res) => {
    try {
      const parsed = completeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "competencyOutcome must be 'cleared' or 'restricted'" });
      }
      const rc = await storage.getRemediationCase(req.params.caseId as string);
      if (!rc) {
        return res.status(404).json({ message: "Case not found" });
      }

      const { competencyOutcome } = parsed.data;
      const clearanceStatus = competencyOutcome === "cleared" ? "cleared" : "restricted";

      await storage.updateRemediationCase(rc.id, {
        status: "completed",
        completedAt: new Date(),
      });

      await storage.createRemediationNote({
        remediationCaseId: rc.id,
        trainerId: req.session.userId!,
        note: `Competency sign-off: ${competencyOutcome}`,
        trainingDate: new Date(),
        competencyOutcome,
      });

      await storage.upsertClearance({
        userId: rc.userId,
        moduleId: rc.moduleId,
        moduleVersionId: rc.moduleVersionId,
        status: clearanceStatus,
        clearedBy: req.session.userId!,
        clearedAt: new Date(),
      });

      if (clearanceStatus === "cleared") {
        const userAssignments = await storage.getAssignmentsByUser(rc.userId);
        const lockedAssignment = userAssignments.find(
          (a) => a.moduleId === rc.moduleId && a.status === "locked"
        );
        if (lockedAssignment) {
          await storage.updateAssignmentStatus(lockedAssignment.id, "not_started");
        }
      }

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/modules/:moduleId/content", requireRole("admin"), async (req, res) => {
    try {
      const moduleId = req.params.moduleId as string;
      const mod = await storage.getModule(moduleId);
      if (!mod) return res.status(404).json({ message: "Module not found" });

      const mv = await storage.getLatestModuleVersion(moduleId);
      if (!mv) return res.status(404).json({ message: "No module version found" });

      const moduleScenarios = await storage.getScenariosByModuleVersion(mv.id);

      res.json({
        module: {
          id: mod.id,
          name: mod.name,
          description: mod.description,
          icon: mod.icon,
          color: mod.color,
          currentVersion: mod.currentVersion,
        },
        version: mv.version,
        config: mv.configJson,
        scenarios: moduleScenarios.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.contentJson as any,
        })),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/modules", requireRole("admin"), async (req, res) => {
    try {
      const allModules = await storage.getAllModules();
      const enriched = await Promise.all(
        allModules.map(async (mod) => {
          const mv = await storage.getLatestModuleVersion(mod.id);
          const scenarioCount = mv ? await storage.getScenarioCount(mv.id) : 0;
          const assignmentCount = await storage.getAssignmentCount(mod.id);
          return { ...mod, scenarioCount, assignmentCount };
        })
      );
      res.json(enriched);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/users", requireRole("admin", "trainer"), async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map((u) => ({ id: u.id, name: u.name, role: u.role })));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/users-detail", requireRole("admin"), async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const enriched = await Promise.all(
        allUsers.map(async (u) => {
          const userAssignments = await storage.getAssignmentsByUser(u.id);
          return {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            active: u.active,
            assignmentCount: userAssignments.length,
          };
        })
      );
      res.json(enriched);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/users/:userId/progress", requireRole("admin"), async (req, res) => {
    try {
      const userId = req.params.userId as string;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const userAssignments = await storage.getAssignmentsByUser(user.id);
      const allModules = await storage.getAllModules();
      const remCases = await storage.getRemediationCases();

      const moduleProgress = await Promise.all(
        userAssignments.map(async (assignment) => {
          const mod = allModules.find((m) => m.id === assignment.moduleId);
          const mv = await storage.getModuleVersion(assignment.moduleVersionId);
          const assignmentAttempts = await storage.getAttemptsByAssignment(assignment.id);
          const completedAttempts = assignmentAttempts.filter((a) => a.result !== null);
          const passedAttempts = completedAttempts.filter((a) => a.result === "pass");
          const failedAttempts = completedAttempts.filter((a) => a.result === "fail");
          const remCase = remCases.find((c) => c.userId === user.id && c.moduleId === assignment.moduleId && c.status !== "completed");

          return {
            assignmentId: assignment.id,
            moduleId: assignment.moduleId,
            moduleName: mod?.name ?? "Unknown",
            moduleIcon: mod?.icon ?? "BookOpen",
            moduleColor: mod?.color ?? "blue",
            version: mv?.version ?? "1.0.0",
            status: assignment.status,
            totalAttempts: completedAttempts.length,
            passCount: passedAttempts.length,
            failCount: failedAttempts.length,
            isLocked: !!remCase,
            remediationStatus: remCase?.status ?? null,
            attempts: completedAttempts.map((a) => ({
              id: a.id,
              result: a.result,
              minorCount: a.minorCount,
              majorCount: a.majorCount,
              submittedAt: a.submittedAt,
            })),
          };
        })
      );

      const totalModules = moduleProgress.length;
      const passedModules = moduleProgress.filter((m) => m.passCount > 0).length;
      const lockedModules = moduleProgress.filter((m) => m.isLocked).length;
      const notStarted = moduleProgress.filter((m) => m.totalAttempts === 0).length;

      res.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        summary: { totalModules, passedModules, lockedModules, notStarted },
        modules: moduleProgress,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const inviteNurseSchema = z.object({
    name: z.string().min(1, "Full name is required"),
    email: z.string().email("Valid email required"),
  });

  app.post("/api/admin/invite-nurse", requireArcadeSuperAdmin, async (req, res) => {
    try {
      const parsed = inviteNurseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid data" });
      }
      const { name, email } = parsed.data;

      const existing = await storage.getUserByEmail(email.toLowerCase());
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      const tempPassword = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const adminUser = (req as any).user as User;

      const user = await storage.createUser({
        username: email.toLowerCase(),
        password: hashedPassword,
        name,
        email: email.toLowerCase(),
        role: "nurse",
        active: true,
      });

      let emailSent = false;
      let emailError = "";
      try {
        const { sendNurseInviteEmail } = await import("../outlook");
        await sendNurseInviteEmail(email, name, tempPassword, adminUser.name);
        emailSent = true;
      } catch (e: any) {
        emailError = e.message ?? "Email failed";
      }

      const { password: _, ...safeUser } = user;

      await platformStorage.createAuditLog({
        module: "skills_arcade",
        action: "invite_nurse",
        agentName: adminUser?.name ?? "super_admin",
        detail: { invitedUserId: user.id, invitedEmail: email.toLowerCase(), invitedName: name, emailSent },
      });

      res.status(201).json({ user: safeUser, emailSent, emailError, tempPassword: emailSent ? undefined : tempPassword });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // List every platform nurse so the admin assign dialog can show them
  // even before they've been individually invited to the arcade.
  // For each nurse we return whether a matching arcade user exists yet.
  app.get("/api/admin/assignable-nurses", requireArcadeSuperAdmin, async (_req, res) => {
    try {
      const nurses = await platformStorage.getCandidates();
      const result = await Promise.all(
        nurses.map(async (n) => {
          const arcadeUser = await storage.getUserByNurseId(n.id);
          let assignmentCount = 0;
          let completedCount = 0;
          if (arcadeUser) {
            const userAssignments = await storage.getAssignmentsByUser(arcadeUser.id);
            assignmentCount = userAssignments.length;
            completedCount = userAssignments.filter((a: any) => a.status === "passed" || a.status === "completed").length;
          }
          return {
            nurseId: n.id,
            name: n.fullName,
            email: n.email,
            arcadeUserId: arcadeUser?.id ?? null,
            currentStage: n.currentStage,
            assignmentCount,
            completedCount,
          };
        })
      );
      result.sort((a, b) => a.name.localeCompare(b.name));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/nurse-assignments/:nurseId", requireArcadeSuperAdmin, async (req, res) => {
    try {
      const arcadeUser = await storage.getUserByNurseId(req.params.nurseId);
      if (!arcadeUser) return res.json({ moduleIds: [], assignments: [] });
      const userAssignments = await storage.getAssignmentsByUser(arcadeUser.id);
      res.json({
        moduleIds: userAssignments.map((a: any) => a.moduleId),
        assignments: userAssignments.map((a: any) => ({
          moduleId: a.moduleId,
          status: a.status,
        })),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const assignSchema = z.object({
    moduleId: z.string().min(1).optional(),
    moduleIds: z.array(z.string().min(1)).optional(),
    userIds: z.array(z.string().min(1)).optional(),
    nurseIds: z.array(z.string().min(1)).optional(),
    notify: z.boolean().optional(),
  }).refine(
    (v) => !!v.moduleId || (v.moduleIds && v.moduleIds.length > 0),
    { message: "moduleId or moduleIds is required" },
  ).refine(
    (v) => (v.userIds && v.userIds.length > 0) || (v.nurseIds && v.nurseIds.length > 0),
    { message: "userIds or nurseIds is required" },
  );

  // Create "not started" assignments for every current module the arcade
  // user isn't already assigned, reusing the same latest-module-version
  // resolution + skip-if-exists logic as the manual /api/admin/assign route.
  // Idempotent: safe to call repeatedly — never duplicates existing
  // assignments. Returns the count + names of the newly-created enrolments.
  async function enrolUserInAllModules(
    userId: string,
    assignedByArcadeUserId: string | null,
  ): Promise<{ created: number; moduleNames: string[] }> {
    const allModules = await storage.getAllModules();
    const existing = await storage.getAssignmentsByUser(userId);
    const existingModuleIds = new Set(existing.map((a) => a.moduleId));

    let created = 0;
    const moduleNames: string[] = [];
    for (const mod of allModules) {
      if (existingModuleIds.has(mod.id)) continue;
      const mv = await storage.getLatestModuleVersion(mod.id);
      if (!mv) continue; // module has no published version yet — skip
      await storage.createAssignment({
        userId,
        moduleVersionId: mv.id,
        moduleId: mod.id,
        status: "not_started",
        assignedBy: assignedByArcadeUserId,
      });
      created += 1;
      moduleNames.push(mod.name);
    }
    return { created, moduleNames };
  }

  // Bridge a platform nurse into the arcade users table on demand. Returns
  // the existing arcade user if one is already linked (by nurseId or email),
  // otherwise creates a fresh nurse-role arcade user with a random password
  // (no invite email is sent — the admin can use the existing
  // /api/admin/invite-nurse endpoint when they want to email credentials).
  // When a new arcade account is created, the nurse is immediately
  // auto-enrolled in every current module (best-effort — a hiccup here
  // never fails account creation). Pass { autoEnrol: false } when the
  // caller takes responsibility for enrolment + counting itself (e.g. the
  // backfill endpoint).
  async function ensureArcadeUserForNurse(
    nurseId: string,
    options?: { autoEnrol?: boolean },
  ): Promise<User | null> {
    const existingByNurse = await storage.getUserByNurseId(nurseId);
    if (existingByNurse) return existingByNurse;

    const nurse = await platformStorage.getCandidate(nurseId);
    if (!nurse) return null;

    const email = nurse.email.toLowerCase();
    const existingByEmail = await storage.getUserByEmail(email);
    if (existingByEmail) return existingByEmail;

    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const tempPassword = Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const created = await storage.createUser({
      username: email,
      password: hashedPassword,
      name: nurse.fullName,
      email,
      role: "nurse",
      active: true,
      nurseId: nurse.id,
    } as any);

    if (options?.autoEnrol !== false) {
      try {
        const { created: enrolled, moduleNames } = await enrolUserInAllModules(created.id, null);
        if (enrolled > 0) {
          await platformStorage.createAuditLog({
            nurseId,
            module: "skills_arcade",
            action: "assign_module",
            agentName: "system",
            detail: {
              auto: true,
              reason: "arcade_account_created",
              arcadeUserId: created.id,
              moduleNames,
              newlyAssignedCount: enrolled,
            },
          });
        }
      } catch (e: any) {
        console.warn("[arcade-auto-enrol] failed for nurse", nurseId, e?.message || e);
      }
    }

    return created;
  }

  app.post("/api/admin/assign", requireArcadeSuperAdmin, async (req, res) => {
    try {
      const parsed = assignSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid request" });
      }

      // Accept either moduleId (legacy) or moduleIds[] (new multi-module path).
      const moduleIds = parsed.data.moduleIds && parsed.data.moduleIds.length > 0
        ? parsed.data.moduleIds
        : parsed.data.moduleId
          ? [parsed.data.moduleId]
          : [];
      const notify = parsed.data.notify !== false; // default: send email

      // Pre-resolve every module + its latest version up-front so we fail
      // fast if anything is missing.
      const moduleCtx: Array<{ id: string; name: string; mvId: string }> = [];
      for (const mid of moduleIds) {
        const mod = await storage.getModule(mid);
        if (!mod) return res.status(404).json({ message: `Module ${mid} not found` });
        const mv = await storage.getLatestModuleVersion(mid);
        if (!mv) return res.status(404).json({ message: `No version for module ${mod.name}` });
        moduleCtx.push({ id: mid, name: mod.name, mvId: mv.id });
      }

      // Resolve every requested target into an arcade user id, auto-creating
      // arcade users for platform nurses that have never been invited yet.
      // Track the link back to the originating nurseId (when present) so we
      // can email the nurse after assigning.
      const targetUserIds = new Set<string>();
      const skippedNurseIds: string[] = [];
      const nurseByArcadeUserId = new Map<string, string>();

      for (const userId of parsed.data.userIds ?? []) {
        targetUserIds.add(userId);
      }
      for (const nurseId of parsed.data.nurseIds ?? []) {
        const arcadeUser = await ensureArcadeUserForNurse(nurseId);
        if (!arcadeUser) {
          skippedNurseIds.push(nurseId);
          continue;
        }
        targetUserIds.add(arcadeUser.id);
        nurseByArcadeUserId.set(arcadeUser.id, nurseId);
      }

      // assignments.assignedBy FKs to arcade_users.id, but the acting admin
      // is a platform-session user that may not exist in arcade_users.
      const sessionUserId = req.session.userId;
      let assignedByArcadeUserId: string | null = null;
      if (sessionUserId) {
        const arcadeActor = await storage.getUser(sessionUserId);
        if (arcadeActor) assignedByArcadeUserId = arcadeActor.id;
      }

      // For each (target user × module) create an assignment unless one
      // already exists. Track newly-assigned module names per arcade user
      // so we can send a single per-nurse email at the end.
      const newModuleNamesByUser = new Map<string, string[]>();
      let assignedCount = 0;
      for (const userId of targetUserIds) {
        const existing = await storage.getAssignmentsByUser(userId);
        for (const m of moduleCtx) {
          if (existing.find((a) => a.moduleId === m.id)) continue;
          await storage.createAssignment({
            userId,
            moduleVersionId: m.mvId,
            moduleId: m.id,
            status: "not_started",
            assignedBy: assignedByArcadeUserId,
          });
          assignedCount += 1;
          const list = newModuleNamesByUser.get(userId) ?? [];
          list.push(m.name);
          newModuleNamesByUser.set(userId, list);
        }
      }

      const adminUser = (req as any).user as User | undefined;

      // Send a single notification email per nurse listing all newly-
      // assigned modules. Best-effort: failures are logged but never
      // break the assignment itself.
      const emailResults: Array<{ nurseId: string; emailSent: boolean; error?: string }> = [];
      if (notify && newModuleNamesByUser.size > 0) {
        const { isOutlookConfigured, sendArcadeAssignmentEmail } = await import("../outlook");
        if (isOutlookConfigured()) {
          const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
          const host = (req.headers["host"] as string) || "localhost:5000";
          const portalBaseUrl = `${protocol}://${host}`;
          for (const [arcadeUserId, names] of newModuleNamesByUser) {
            const nurseId = nurseByArcadeUserId.get(arcadeUserId);
            if (!nurseId) continue; // legacy userIds path — no nurse to email
            try {
              const nurse = await platformStorage.getCandidate(nurseId);
              if (!nurse?.email) {
                emailResults.push({ nurseId, emailSent: false, error: "No email on file" });
                continue;
              }
              const minted = await mintChasePortalLinkForNurse({
                nurseId,
                sentBy: adminUser?.name ?? "admin",
                portalBaseUrl,
              });
              await sendArcadeAssignmentEmail({
                recipientEmail: nurse.email,
                recipientName: nurse.fullName,
                moduleNames: names,
                assignedBy: adminUser?.name ?? "Livaware admin",
                portalUrl: minted.portalUrl,
                expiryFormatted: minted.expiresAt.toLocaleDateString("en-GB", {
                  day: "numeric", month: "long", year: "numeric",
                }),
              });
              emailResults.push({ nurseId, emailSent: true });
            } catch (e: any) {
              console.warn("[arcade-assign] email send failed:", e?.message || e);
              emailResults.push({ nurseId, emailSent: false, error: e?.message ?? "send failed" });
            }
          }
        }
      }

      await platformStorage.createAuditLog({
        module: "skills_arcade",
        action: "assign_module",
        agentName: adminUser?.name ?? "super_admin",
        detail: {
          moduleIds: moduleCtx.map((m) => m.id),
          moduleNames: moduleCtx.map((m) => m.name),
          userIds: Array.from(targetUserIds),
          nurseIds: parsed.data.nurseIds ?? [],
          newlyAssignedCount: assignedCount,
          skippedNurseIds,
          emailResults,
        },
      });

      res.json({
        ok: true,
        assignedCount,
        skippedNurseIds,
        emailsSent: emailResults.filter((r) => r.emailSent).length,
        emailFailures: emailResults.filter((r) => !r.emailSent),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Enrol every assignable platform nurse into every current module they
  // aren't already assigned. Idempotent — safe to click repeatedly (never
  // duplicates existing assignments). Defaults to NOT emailing nurses
  // (mirrors the bulk-assign notify flag); pass { notify: true } to opt in.
  app.post("/api/admin/enrol-all", requireArcadeSuperAdmin, async (req, res) => {
    try {
      const notify = req.body?.notify === true; // default: do not email
      const adminUser = (req as any).user as User | undefined;

      // assignments.assignedBy FKs to arcade_users.id, but the acting admin
      // is a platform-session user that may not exist in arcade_users.
      const sessionUserId = req.session.userId;
      let assignedByArcadeUserId: string | null = null;
      if (sessionUserId) {
        const arcadeActor = await storage.getUser(sessionUserId);
        if (arcadeActor) assignedByArcadeUserId = arcadeActor.id;
      }

      const nurses = await platformStorage.getCandidates();
      let nursesProcessed = 0;
      let enrolmentsCreated = 0;
      const skippedNurseIds: string[] = [];
      // arcadeUserId → { nurseId, names } for newly-created enrolments.
      const newModuleNamesByUser = new Map<string, { nurseId: string; names: string[] }>();

      for (const nurse of nurses) {
        // autoEnrol:false — the backfill owns enrolment + counting + audit
        // uniformly for both brand-new and existing arcade users.
        const arcadeUser = await ensureArcadeUserForNurse(nurse.id, { autoEnrol: false });
        if (!arcadeUser) {
          skippedNurseIds.push(nurse.id);
          continue;
        }
        nursesProcessed += 1;
        const { created, moduleNames } = await enrolUserInAllModules(arcadeUser.id, assignedByArcadeUserId);
        enrolmentsCreated += created;
        if (created > 0) {
          newModuleNamesByUser.set(arcadeUser.id, { nurseId: nurse.id, names: moduleNames });
          await platformStorage.createAuditLog({
            nurseId: nurse.id,
            module: "skills_arcade",
            action: "assign_module",
            agentName: adminUser?.name ?? "super_admin",
            detail: {
              auto: true,
              reason: "enrol_all_backfill",
              arcadeUserId: arcadeUser.id,
              moduleNames,
              newlyAssignedCount: created,
            },
          });
        }
      }

      // Optionally email each nurse a single notification listing the
      // modules they were just enrolled in. Best-effort: failures are
      // logged but never break the backfill.
      const emailResults: Array<{ nurseId: string; emailSent: boolean; error?: string }> = [];
      if (notify && newModuleNamesByUser.size > 0) {
        const { isOutlookConfigured, sendArcadeAssignmentEmail } = await import("../outlook");
        if (isOutlookConfigured()) {
          const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
          const host = (req.headers["host"] as string) || "localhost:5000";
          const portalBaseUrl = `${protocol}://${host}`;
          for (const [, { nurseId, names }] of newModuleNamesByUser) {
            try {
              const nurse = await platformStorage.getCandidate(nurseId);
              if (!nurse?.email) {
                emailResults.push({ nurseId, emailSent: false, error: "No email on file" });
                continue;
              }
              const minted = await mintChasePortalLinkForNurse({
                nurseId,
                sentBy: adminUser?.name ?? "admin",
                portalBaseUrl,
              });
              await sendArcadeAssignmentEmail({
                recipientEmail: nurse.email,
                recipientName: nurse.fullName,
                moduleNames: names,
                assignedBy: adminUser?.name ?? "Livaware admin",
                portalUrl: minted.portalUrl,
                expiryFormatted: minted.expiresAt.toLocaleDateString("en-GB", {
                  day: "numeric", month: "long", year: "numeric",
                }),
              });
              emailResults.push({ nurseId, emailSent: true });
            } catch (e: any) {
              console.warn("[arcade-enrol-all] email send failed:", e?.message || e);
              emailResults.push({ nurseId, emailSent: false, error: e?.message ?? "send failed" });
            }
          }
        }
      }

      await platformStorage.createAuditLog({
        module: "skills_arcade",
        action: "assign_module",
        agentName: adminUser?.name ?? "super_admin",
        detail: {
          auto: true,
          reason: "enrol_all_backfill_run",
          nursesProcessed,
          enrolmentsCreated,
          skippedNurseIds,
          emailsSent: emailResults.filter((r) => r.emailSent).length,
        },
      });

      res.json({
        ok: true,
        nursesProcessed,
        enrolmentsCreated,
        skippedNurseIds,
        emailsSent: emailResults.filter((r) => r.emailSent).length,
        emailFailures: emailResults.filter((r) => !r.emailSent),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/scenarios/import", requireArcadeSuperAdmin, async (req, res) => {
    try {
      const { module: modData, scenarios: scenarioData } = req.body;
      if (!modData || !scenarioData) {
        return res.status(400).json({ message: "Invalid import format. Expected { module, scenarios }" });
      }

      let mod = (await storage.getAllModules()).find((m) => m.name === modData.name);
      if (!mod) {
        mod = await storage.createModule({
          name: modData.name,
          description: modData.description || "",
          currentVersion: modData.version || "1.0.0",
          isActive: true,
          icon: modData.icon || "BookOpen",
          color: modData.color || "blue",
        });
      }

      let mv = await storage.getLatestModuleVersion(mod.id);
      if (!mv) {
        mv = await storage.createModuleVersion({
          moduleId: mod.id,
          version: modData.version || "1.0.0",
          configJson: modData.config || {},
        });
      }

      let scenarioCount = 0;
      for (const s of scenarioData) {
        await storage.createScenario({
          moduleVersionId: mv.id,
          title: s.title,
          contentJson: s.contentJson || s.content,
          isActive: true,
        });
        scenarioCount++;
      }

      const adminUser = (req as any).user as User | undefined;
      await platformStorage.createAuditLog({
        module: "skills_arcade",
        action: "import_scenarios",
        agentName: adminUser?.name ?? "super_admin",
        detail: { moduleId: mod.id, moduleName: mod.name, scenarioCount },
      });

      res.json({ ok: true, moduleId: mod.id });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/reports", requireRole("admin"), async (req, res) => {
    try {
      const allAttempts = await storage.getAllAttempts();
      const allModules = await storage.getAllModules();

      const totalAttempts = allAttempts.filter((a) => a.result !== null).length;
      const passed = allAttempts.filter((a) => a.result === "pass").length;
      const passRate = totalAttempts > 0 ? Math.round((passed / totalAttempts) * 100) : 0;

      const passedAttempts = allAttempts.filter((a) => a.result === "pass");
      const avgAttemptsToPass = passedAttempts.length > 0 ? passedAttempts.length / new Set(passedAttempts.map((a) => a.userId)).size : 0;

      const remCases = await storage.getRemediationCases();
      const lockedCount = remCases.filter((c) => c.status !== "completed").length;

      const moduleStats = await Promise.all(
        allModules.map(async (mod) => {
          const mv = await storage.getLatestModuleVersion(mod.id);
          if (!mv) return { moduleName: mod.name, totalAttempts: 0, passRate: 0, lockoutRate: 0 };

          const modAttempts = allAttempts.filter((a) => a.moduleVersionId === mv.id && a.result !== null);
          const modPassed = modAttempts.filter((a) => a.result === "pass").length;
          const modTotal = modAttempts.length;
          const modPassRate = modTotal > 0 ? Math.round((modPassed / modTotal) * 100) : 0;

          const modRemCases = remCases.filter((c) => c.moduleId === mod.id);
          const uniqueUsers = new Set(modAttempts.map((a) => a.userId)).size;
          const lockoutRate = uniqueUsers > 0 ? Math.round((modRemCases.length / uniqueUsers) * 100) : 0;

          return {
            moduleName: mod.name,
            totalAttempts: modTotal,
            passRate: modPassRate,
            lockoutRate,
          };
        })
      );

      res.json({ totalAttempts, passRate, avgAttemptsToPass, lockedCount, moduleStats });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/reports/export.csv", requireRole("admin"), async (req, res) => {
    try {
      const allAttempts = await storage.getAllAttempts();
      const allUsers = await storage.getAllUsers();
      const allModules = await storage.getAllModules();

      let csv = "User,Email,Module,Version,Date,Result,Minors,Majors\n";
      for (const attempt of allAttempts) {
        if (!attempt.result) continue;
        const user = allUsers.find((u) => u.id === attempt.userId);
        const mv = await storage.getModuleVersion(attempt.moduleVersionId);
        const mod = mv ? allModules.find((m) => m.id === mv.moduleId) : null;

        csv += [
          `"${user?.name ?? ""}"`,
          `"${user?.email ?? ""}"`,
          `"${mod?.name ?? ""}"`,
          `"${mv?.version ?? ""}"`,
          `"${attempt.submittedAt?.toISOString() ?? ""}"`,
          attempt.result,
          attempt.minorCount,
          attempt.majorCount,
        ].join(",") + "\n";
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=skills-arcade-report.csv");
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

}
