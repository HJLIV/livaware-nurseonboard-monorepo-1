// Training Courses (LMS) admin routes.
//
// Mounted under /api/admin/* so they inherit the global requireAdmin guard from
// routes.ts. Admins build/link courses and assign them; chase reminders are
// gated to super-admin to match the existing training-chase convention
// (see the stage-and-role-gating + chase-and-notification-patterns skills).
//
// A matching nurse-facing surface lives in routes/portal.ts under
// /api/portal/:token/lms (portal-admin-parity).
import type { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { storage } from "../storage";
import { requireSuperAdmin, validatePortalToken, portalAgent, uploadsDir } from "../middleware";
import { logAction } from "../services/audit";
import { MANDATORY_TRAINING_MODULES, arcadeModules } from "@shared/schema";
import type { InsertLmsCourse, LmsCourse } from "@shared/schema";
import {
  refreshAssignmentStatus,
  getLinkedCompletion,
  computeOverdue,
  sendCourseReminder,
  maybeCompleteInternal,
  viewStatus,
} from "../lms/service";

function actorName(req: Request): string {
  const u = (req.session as any)?.username;
  const r = (req.session as any)?.role;
  if (!u) return "admin";
  return r ? `${u} (${r})` : u;
}

function portalBaseUrlFromReq(req: Request): string {
  const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["host"] as string) || "localhost:5000";
  return `${protocol}://${host}`;
}

function parseCourseBody(body: any): Partial<InsertLmsCourse> {
  const out: Partial<InsertLmsCourse> = {};
  if (typeof body.title === "string") out.title = body.title.trim();
  if (typeof body.description === "string") out.description = body.description;
  if (typeof body.sourceType === "string") out.sourceType = body.sourceType;
  if ("sourceRef" in body) out.sourceRef = body.sourceRef ? String(body.sourceRef) : null;
  if ("category" in body) out.category = body.category ? String(body.category) : null;
  if ("passThreshold" in body) {
    const n = body.passThreshold;
    out.passThreshold = n === null || n === "" || n === undefined ? null : Number(n);
  }
  if (typeof body.certificateEnabled === "boolean") out.certificateEnabled = body.certificateEnabled;
  if (typeof body.isActive === "boolean") out.isActive = body.isActive;
  return out;
}

// Replace the lesson/question rows of an internal course when the builder
// submits full arrays (simpler than per-row diffing on the client).
async function replaceLessons(courseId: string, lessons: any[]): Promise<void> {
  const existing = await storage.getLmsLessons(courseId);
  for (const l of existing) await storage.deleteLmsLesson(l.id);
  let i = 0;
  for (const l of lessons) {
    if (!l || typeof l.title !== "string" || !l.title.trim()) continue;
    await storage.createLmsLesson({
      courseId,
      title: l.title.trim(),
      content: typeof l.content === "string" ? l.content : "",
      orderIndex: i++,
    });
  }
}

async function replaceQuestions(courseId: string, questions: any[]): Promise<void> {
  const existing = await storage.getLmsQuizQuestions(courseId);
  for (const q of existing) await storage.deleteLmsQuizQuestion(q.id);
  let i = 0;
  for (const q of questions) {
    if (!q || typeof q.prompt !== "string" || !q.prompt.trim()) continue;
    const options = Array.isArray(q.options) ? q.options.map((o: any) => String(o)) : [];
    if (options.length < 2) continue;
    await storage.createLmsQuizQuestion({
      courseId,
      prompt: q.prompt.trim(),
      options,
      correctIndex: Math.max(0, Math.min(options.length - 1, Number(q.correctIndex) || 0)),
      orderIndex: i++,
    });
  }
}

export function registerLmsRoutes(app: Express): void {
  // --- Linkable sources for the builder dropdown -------------------------
  app.get("/api/admin/lms/sources", async (_req: Request, res: Response) => {
    try {
      const hbcCourses = await storage.getHbcCourses();
      const modules = await db.select().from(arcadeModules);
      res.json({
        hbc: hbcCourses.map((c) => ({ ref: c.courseId, name: c.courseName, group: c.groupTitle })),
        arcade: modules.map((m) => ({ ref: m.id, name: m.name })),
        mandatory: MANDATORY_TRAINING_MODULES.map((m) => ({ ref: m.name, name: m.name })),
      });
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  // --- Courses -----------------------------------------------------------
  app.get("/api/admin/lms/courses", async (_req: Request, res: Response) => {
    try {
      const courses = await storage.getLmsCourses(true);
      const enriched = await Promise.all(
        courses.map(async (c) => {
          const [lessons, questions, assignments] = await Promise.all([
            storage.getLmsLessons(c.id),
            storage.getLmsQuizQuestions(c.id),
            storage.getLmsAssignmentsForCourse(c.id),
          ]);
          return {
            ...c,
            lessonCount: lessons.length,
            questionCount: questions.length,
            assignedCount: assignments.length,
            completedCount: assignments.filter((a) => a.status === "completed").length,
          };
        }),
      );
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  app.get("/api/admin/lms/courses/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const course = await storage.getLmsCourse(id);
      if (!course) return res.status(404).json({ error: "not_found" });
      const [lessons, questions, assignments] = await Promise.all([
        storage.getLmsLessons(id),
        storage.getLmsQuizQuestions(id),
        storage.getLmsAssignmentsForCourse(id),
      ]);
      const candidates = await storage.getCandidates();
      const nameById = new Map(candidates.map((n) => [n.id, n.fullName]));
      res.json({
        ...course,
        lessons,
        questions,
        assignments: assignments.map((a) => ({
          ...a,
          nurseName: nameById.get(a.nurseId) || "Unknown",
          overdue: computeOverdue(a),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  app.post("/api/admin/lms/courses", async (req: Request, res: Response) => {
    try {
      const parsed = parseCourseBody(req.body);
      if (!parsed.title) return res.status(400).json({ error: "title_required" });
      const course = await storage.createLmsCourse({
        title: parsed.title,
        description: parsed.description ?? "",
        sourceType: parsed.sourceType ?? "internal",
        sourceRef: parsed.sourceRef ?? null,
        category: parsed.category ?? null,
        passThreshold: parsed.passThreshold ?? null,
        certificateEnabled: parsed.certificateEnabled ?? true,
        isActive: parsed.isActive ?? true,
        createdBy: actorName(req),
      } as InsertLmsCourse);
      if (course.sourceType === "internal") {
        if (Array.isArray(req.body.lessons)) await replaceLessons(course.id, req.body.lessons);
        if (Array.isArray(req.body.questions)) await replaceQuestions(course.id, req.body.questions);
      }
      await logAction(null, "lms", "course_created", actorName(req), { courseId: course.id, title: course.title, sourceType: course.sourceType });
      res.status(201).json(course);
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  // Nurse-faithful preview for admins: same shape the portal serves to a nurse
  // (quiz answer keys stripped) so the Course Builder can render exactly what
  // the nurse sees without leaking correctIndex into a less-privileged context.
  app.get("/api/admin/lms/courses/:id/preview", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const course = await storage.getLmsCourse(id);
      if (!course) return res.status(404).json({ error: "not_found" });
      const [lessons, questions] = await Promise.all([
        storage.getLmsLessons(id),
        storage.getLmsQuizQuestions(id),
      ]);
      res.json({
        id: course.id,
        title: course.title,
        description: course.description,
        passThreshold: course.passThreshold,
        certificateEnabled: course.certificateEnabled,
        lessons: lessons.map((l) => ({ id: l.id, title: l.title, content: l.content, orderIndex: l.orderIndex })),
        questions: questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options, orderIndex: q.orderIndex })),
      });
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  app.put("/api/admin/lms/courses/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const existing = await storage.getLmsCourse(id);
      if (!existing) return res.status(404).json({ error: "not_found" });
      const parsed = parseCourseBody(req.body);
      const course = await storage.updateLmsCourse(id, parsed);
      const effective: LmsCourse = course || existing;
      if (effective.sourceType === "internal") {
        if (Array.isArray(req.body.lessons)) await replaceLessons(id, req.body.lessons);
        if (Array.isArray(req.body.questions)) await replaceQuestions(id, req.body.questions);
      }
      await logAction(null, "lms", "course_updated", actorName(req), { courseId: id });
      res.json(course);
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  app.delete("/api/admin/lms/courses/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const existing = await storage.getLmsCourse(id);
      if (!existing) return res.status(404).json({ error: "not_found" });
      await storage.deleteLmsCourse(id);
      await logAction(null, "lms", "course_deleted", actorName(req), { courseId: id, title: existing.title });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  // --- Assignments + matrix ---------------------------------------------
  app.post("/api/admin/lms/assignments", async (req: Request, res: Response) => {
    try {
      const courseId = String(req.body.courseId || "");
      const nurseIds: string[] = Array.isArray(req.body.nurseIds) ? req.body.nurseIds.map(String) : [];
      const dueDate = req.body.dueDate ? String(req.body.dueDate) : null;
      if (!courseId || nurseIds.length === 0) return res.status(400).json({ error: "course_and_nurses_required" });
      const course = await storage.getLmsCourse(courseId);
      if (!course) return res.status(404).json({ error: "course_not_found" });

      const created: string[] = [];
      for (const nurseId of nurseIds) {
        const existing = await storage.getLmsAssignmentByCourseNurse(courseId, nurseId);
        if (existing) {
          if (dueDate) await storage.updateLmsAssignment(existing.id, { dueDate });
          continue;
        }
        await storage.createLmsAssignment({
          courseId,
          nurseId,
          dueDate,
          status: "assigned",
          assignedBy: actorName(req),
        });
        created.push(nurseId);
        await logAction(nurseId, "lms", "course_assigned", actorName(req), { courseId, courseTitle: course.title, dueDate });
      }
      res.status(201).json({ ok: true, created: created.length });
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  app.delete("/api/admin/lms/assignments/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const a = await storage.getLmsAssignment(id);
      if (!a) return res.status(404).json({ error: "not_found" });
      await storage.deleteLmsAssignment(id);
      await logAction(a.nurseId, "lms", "course_unassigned", actorName(req), { courseId: a.courseId });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  app.post("/api/admin/lms/assignments/:id/refresh", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const a = await storage.getLmsAssignment(id);
      if (!a) return res.status(404).json({ error: "not_found" });
      const updated = await refreshAssignmentStatus(a);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  // Matrix: nurses x courses with live-derived status for linked courses.
  app.get("/api/admin/lms/matrix", async (_req: Request, res: Response) => {
    try {
      const [courses, candidates, allAssignments] = await Promise.all([
        storage.getLmsCourses(true),
        storage.getCandidates(),
        storage.getLmsAssignments(),
      ]);
      const courseById = new Map(courses.map((c) => [c.id, c]));
      const cells = await Promise.all(
        allAssignments.map(async (a) => {
          const course = courseById.get(a.courseId);
          let completed = a.status === "completed";
          if (!completed && course && course.sourceType !== "internal") {
            const linked = await getLinkedCompletion(course, a.nurseId);
            completed = linked.completed;
          }
          const overdue = !completed && computeOverdue(a);
          const status = completed ? "completed" : overdue ? "overdue" : a.status;
          return {
            assignmentId: a.id,
            courseId: a.courseId,
            nurseId: a.nurseId,
            status,
            dueDate: a.dueDate,
            lastChasedAt: a.lastChasedAt,
            certificateDocumentId: a.certificateDocumentId,
          };
        }),
      );
      res.json({
        courses: courses.map((c) => ({ id: c.id, title: c.title, sourceType: c.sourceType, isActive: c.isActive })),
        nurses: candidates.map((n) => ({ id: n.id, fullName: n.fullName, currentStage: n.currentStage })),
        cells,
      });
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  // --- Chase reminders (super-admin) ------------------------------------
  app.post("/api/admin/lms/assignments/:id/remind", requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const a = await storage.getLmsAssignment(id);
      if (!a) return res.status(404).json({ error: "not_found" });
      const result = await sendCourseReminder({ nurseId: a.nurseId, portalBaseUrl: portalBaseUrlFromReq(req), sentBy: actorName(req) });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: "lms_reminder_failed", message: (err as Error).message });
    }
  });

  app.post("/api/admin/lms/remind-overdue", requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const assignments = await storage.getLmsAssignments();
      const nurseIds = new Set<string>();
      for (const a of assignments) {
        if (a.status !== "completed") nurseIds.add(a.nurseId);
      }
      const portalBaseUrl = portalBaseUrlFromReq(req);
      const sentBy = actorName(req);
      let sent = 0;
      const failures: { nurseId: string; message: string }[] = [];
      for (const nurseId of Array.from(nurseIds)) {
        try {
          await sendCourseReminder({ nurseId, portalBaseUrl, sentBy });
          sent++;
        } catch (err) {
          failures.push({ nurseId, message: (err as Error).message });
        }
      }
      await logAction(null, "lms", "course_reminder_bulk", sentBy, { sent, failed: failures.length });
      res.json({ ok: true, sent, failed: failures.length, failures });
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Portal (nurse-facing) surface — validatePortalToken only. Training is
  // available throughout onboarding (not gated to completed stage). See the
  // portal-admin-parity skill.
  // ─────────────────────────────────────────────────────────────────────

  // List my assigned courses with lessons (no answer keys) + my progress.
  app.get("/api/portal/:token/lms/courses", validatePortalToken, async (req: Request, res: Response) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const assignments = await storage.getLmsAssignmentsForNurse(nurseId);
      const out = await Promise.all(
        assignments.map(async (a) => {
          const course = await storage.getLmsCourse(a.courseId);
          if (!course) return null;
          const view = viewStatus(a);
          let lessons: { id: string; title: string; content: string; orderIndex: number }[] = [];
          let questions: { id: string; prompt: string; options: string[]; orderIndex: number }[] = [];
          let linkedComplete = false;
          if (course.sourceType === "internal") {
            lessons = (await storage.getLmsLessons(course.id)).map((l) => ({
              id: l.id, title: l.title, content: l.content, orderIndex: l.orderIndex,
            }));
            // Strip correctIndex from quiz questions sent to the nurse.
            questions = (await storage.getLmsQuizQuestions(course.id)).map((q) => ({
              id: q.id, prompt: q.prompt, options: q.options, orderIndex: q.orderIndex,
            }));
          } else {
            const linked = await getLinkedCompletion(course, nurseId);
            linkedComplete = linked.completed;
          }
          return {
            assignmentId: a.id,
            course: {
              id: course.id,
              title: course.title,
              description: course.description,
              sourceType: course.sourceType,
              category: course.category,
              passThreshold: course.passThreshold,
              certificateEnabled: course.certificateEnabled,
            },
            status: view.status,
            overdue: view.overdue,
            dueDate: a.dueDate,
            completedAt: a.completedAt,
            completedLessonIds: a.completedLessonIds || [],
            quizScore: a.quizScore,
            certificateDocumentId: a.certificateDocumentId,
            linkedComplete,
            lessons,
            questions,
          };
        }),
      );
      res.json(out.filter(Boolean));
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  // Mark a lesson complete (internal courses). Auto-completes + certifies
  // once every lesson is read and the quiz (if any) is passed.
  app.post("/api/portal/:token/lms/courses/:assignmentId/lessons/:lessonId/complete", validatePortalToken, async (req: Request, res: Response) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const assignmentId = String(req.params.assignmentId);
      const lessonId = String(req.params.lessonId);
      const a = await storage.getLmsAssignment(assignmentId);
      if (!a || a.nurseId !== nurseId) return res.status(404).json({ error: "not_found" });
      const course = await storage.getLmsCourse(a.courseId);
      if (!course || course.sourceType !== "internal") return res.status(400).json({ error: "not_internal_course" });

      const done = new Set(a.completedLessonIds || []);
      done.add(lessonId);
      let updated = await storage.updateLmsAssignment(assignmentId, {
        completedLessonIds: Array.from(done),
        status: a.status === "assigned" ? "in_progress" : a.status,
      });
      if (updated) updated = await maybeCompleteInternal(updated, course);
      await logAction(nurseId, "lms", "lesson_completed", portalAgent(req), { courseId: course.id, lessonId });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  // Submit quiz answers (internal courses). Grades server-side against the
  // stored answer keys, persists the score, and completes if passing.
  app.post("/api/portal/:token/lms/courses/:assignmentId/quiz", validatePortalToken, async (req: Request, res: Response) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const assignmentId = String(req.params.assignmentId);
      const a = await storage.getLmsAssignment(assignmentId);
      if (!a || a.nurseId !== nurseId) return res.status(404).json({ error: "not_found" });
      const course = await storage.getLmsCourse(a.courseId);
      if (!course || course.sourceType !== "internal") return res.status(400).json({ error: "not_internal_course" });

      const questions = await storage.getLmsQuizQuestions(course.id);
      if (questions.length === 0) return res.status(400).json({ error: "no_quiz" });
      const answers: Record<string, number> = req.body?.answers || {};
      let correct = 0;
      for (const q of questions) {
        if (Number(answers[q.id]) === q.correctIndex) correct++;
      }
      const score = Math.round((correct / questions.length) * 100);
      let updated = await storage.updateLmsAssignment(assignmentId, {
        quizScore: score,
        status: a.status === "assigned" ? "in_progress" : a.status,
      });
      if (updated) updated = await maybeCompleteInternal(updated, course);
      await logAction(nurseId, "lms", "quiz_submitted", portalAgent(req), { courseId: course.id, score });
      const passed = typeof course.passThreshold !== "number" || score >= course.passThreshold;
      res.json({ score, passed, assignment: updated });
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });

  // Download my completion certificate (streams the stored PDF after
  // verifying the assignment belongs to me).
  app.get("/api/portal/:token/lms/courses/:assignmentId/certificate", validatePortalToken, async (req: Request, res: Response) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const assignmentId = String(req.params.assignmentId);
      const a = await storage.getLmsAssignment(assignmentId);
      if (!a || a.nurseId !== nurseId) return res.status(404).json({ error: "not_found" });
      if (!a.certificateDocumentId) return res.status(404).json({ error: "no_certificate" });
      const doc = await storage.getDocument(a.certificateDocumentId);
      if (!doc || !doc.filePath) return res.status(404).json({ error: "no_certificate" });
      const basename = path.basename(doc.filePath);
      const absolute = path.join(uploadsDir, basename);
      if (!absolute.startsWith(uploadsDir)) return res.status(404).json({ error: "not_found" });
      if (!fs.existsSync(absolute)) {
        const { ensureLocalCopy } = await import("../object-storage");
        const restored = await ensureLocalCopy(basename);
        if (!restored) return res.status(404).json({ error: "file_missing" });
      }
      res.setHeader("Content-Type", doc.mimeType || "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${(doc.originalFilename || "certificate.pdf").replace(/[^\w. -]+/g, "_")}"`);
      res.sendFile(absolute);
    } catch (err) {
      res.status(500).json({ error: "lms_error", message: (err as Error).message });
    }
  });
}
