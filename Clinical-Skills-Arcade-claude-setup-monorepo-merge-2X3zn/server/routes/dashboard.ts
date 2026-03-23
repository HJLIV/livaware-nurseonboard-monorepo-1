import type { Express } from "express";
import { db } from "../db";
import { nurses, auditLogs } from "@shared/schema";
import { desc } from "drizzle-orm";

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard/stats", async (_req, res) => {
    const allNurses = await db.select().from(nurses);
    const total = allNurses.length;

    const funnelCounts = {
      preboard: allNurses.filter(n => n.currentStage === "preboard").length,
      onboard: allNurses.filter(n => n.currentStage === "onboard").length,
      skillsArcade: allNurses.filter(n => n.currentStage === "skills_arcade").length,
      completed: allNurses.filter(n => n.currentStage === "completed").length,
    };

    const preboardComplete = allNurses.filter(n => n.preboardStatus === "completed").length;
    const onboardCleared = allNurses.filter(n => n.onboardStatus === "cleared").length;
    const skillsCompetent = allNurses.filter(n => n.arcadeStatus === "competent").length;
    const escalations = allNurses.filter(n =>
      n.onboardStatus === "escalated" || n.preboardStatus === "flagged" || n.arcadeStatus === "remediation"
    ).length;

    const recentActivity = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(20);

    res.json({ totalNurses: total, preboardComplete, onboardCleared, skillsCompetent, escalations, funnelCounts, recentActivity });
  });

  app.get("/api/pipeline", async (_req, res) => {
    const allNurses = await db.select({
      id: nurses.id, fullName: nurses.fullName, email: nurses.email,
      currentStage: nurses.currentStage, preboardStatus: nurses.preboardStatus,
      onboardStatus: nurses.onboardStatus, arcadeStatus: nurses.arcadeStatus,
      createdAt: nurses.createdAt, updatedAt: nurses.updatedAt,
    }).from(nurses).orderBy(desc(nurses.updatedAt));

    const stages = {
      preboard: allNurses.filter(n => n.currentStage === "preboard"),
      onboard: allNurses.filter(n => n.currentStage === "onboard"),
      skills_arcade: allNurses.filter(n => n.currentStage === "skills_arcade"),
      completed: allNurses.filter(n => n.currentStage === "completed"),
    };
    res.json(stages);
  });
}
