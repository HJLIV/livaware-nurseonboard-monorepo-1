import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../arcade-storage";
import { scoreAttempt, type TaskResponse } from "../arcade-scoring";
import { seedDatabase } from "../arcade-seed";
import { loginSchema, registerSchema } from "@shared/schema";
import type { User, ScenarioContent } from "@shared/schema";
import { z } from "zod";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
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
      const userId = req.session.userId!;
      const userAssignments = await storage.getAssignmentsByUser(userId);
      const allModules = await storage.getAllModules();

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

  app.post("/api/nurse/attempts/start", requireAuth, async (req, res) => {
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

  app.post("/api/nurse/attempts/submit", requireAuth, async (req, res) => {
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

  app.post("/api/admin/invite-nurse", requireRole("admin"), async (req, res) => {
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
        const { sendNurseInviteEmail } = await import("./outlook");
        await sendNurseInviteEmail(email, name, tempPassword, adminUser.name);
        emailSent = true;
      } catch (e: any) {
        emailError = e.message ?? "Email failed";
      }

      const { password: _, ...safeUser } = user;
      res.status(201).json({ user: safeUser, emailSent, emailError, tempPassword: emailSent ? undefined : tempPassword });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const assignSchema = z.object({ moduleId: z.string().min(1), userIds: z.array(z.string().min(1)).min(1) });

  app.post("/api/admin/assign", requireRole("admin", "trainer"), async (req, res) => {
    try {
      const parsed = assignSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "moduleId and userIds are required" });
      }
      const { moduleId, userIds } = parsed.data;
      const mod = await storage.getModule(moduleId);
      if (!mod) {
        return res.status(404).json({ message: "Module not found" });
      }
      const mv = await storage.getLatestModuleVersion(moduleId);
      if (!mv) {
        return res.status(404).json({ message: "No module version found" });
      }

      for (const userId of userIds) {
        const existing = await storage.getAssignmentsByUser(userId);
        const alreadyAssigned = existing.find((a) => a.moduleId === moduleId);
        if (!alreadyAssigned) {
          await storage.createAssignment({
            userId,
            moduleVersionId: mv.id,
            moduleId: moduleId,
            status: "not_started",
            assignedBy: req.session.userId,
          });
        }
      }

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/scenarios/import", requireRole("admin"), async (req, res) => {
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

      for (const s of scenarioData) {
        await storage.createScenario({
          moduleVersionId: mv.id,
          title: s.title,
          contentJson: s.contentJson || s.content,
          isActive: true,
        });
      }

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
