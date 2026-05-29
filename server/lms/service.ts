// LMS service: completion logic, certificate issuance, and chase reminders.
//
// A course is one of four source types:
//  - "internal"  — authored in-app; completed by the nurse reading every lesson
//                  and (if a quiz exists) scoring >= passThreshold.
//  - "hbc"       — links an hbcCourses.courseId; completion is read from the
//                  per-nurse hbcTrainingResults mirror.
//  - "arcade"    — links an arcadeModules.id; completion derives from the
//                  nurse's overall arcadeStatus being "competent".
//  - "mandatory" — links a MANDATORY_TRAINING_MODULES name; completion derives
//                  from the nurse's mandatoryTraining record being completed.
//
// For linked courses the LMS row is a tracker — the nurse completes the work in
// the source system and we surface status + due dates + chase. Completing any
// course whose certificateEnabled is true auto-issues a downloadable PDF.
import { storage } from "../storage";
import { issueLmsCertificate } from "./certificate";
import { logAction } from "../services/audit";
import { isOutlookConfigured, sendLmsCourseReminderEmail } from "../outlook";
import { mintChasePortalLinkForNurse } from "../training-notifications";
import type { LmsCourse, LmsCourseAssignment } from "@shared/schema";

export type LmsDerivedStatus = "assigned" | "in_progress" | "completed" | "overdue";

export interface LmsProgressView {
  status: LmsDerivedStatus;
  completed: boolean;
  completedAt: Date | null;
  overdue: boolean;
}

function isCompleteHbcStatus(status: string | null | undefined, dateCompleted: string | null | undefined): boolean {
  if (dateCompleted && dateCompleted.trim()) return true;
  if (!status) return false;
  return /complete|pass|valid|current/i.test(status);
}

/**
 * Derive whether a linked (non-internal) course is complete for a nurse, by
 * reading the relevant source system. Returns completion + best-effort date.
 */
export async function getLinkedCompletion(
  course: LmsCourse,
  nurseId: string,
): Promise<{ completed: boolean; completedAt: Date | null }> {
  if (course.sourceType === "hbc") {
    const results = await storage.getHbcTrainingResults(nurseId);
    const match = results.find((r) => r.courseId === course.sourceRef);
    if (match && isCompleteHbcStatus(match.courseStatus, match.dateCompleted)) {
      const when = match.dateCompleted ? new Date(match.dateCompleted) : new Date();
      return { completed: true, completedAt: isNaN(when.getTime()) ? new Date() : when };
    }
    return { completed: false, completedAt: null };
  }

  if (course.sourceType === "arcade") {
    const nurse = await storage.getCandidate(nurseId);
    if (nurse && nurse.arcadeStatus === "competent") {
      return { completed: true, completedAt: new Date() };
    }
    return { completed: false, completedAt: null };
  }

  if (course.sourceType === "mandatory") {
    const records = await storage.getMandatoryTraining(nurseId);
    const match = records.find((r) => r.moduleName === course.sourceRef);
    if (match && match.status === "completed") {
      const when = match.completedDate ? new Date(match.completedDate) : new Date();
      return { completed: true, completedAt: isNaN(when.getTime()) ? new Date() : when };
    }
    return { completed: false, completedAt: null };
  }

  return { completed: false, completedAt: null };
}

/** Is the assignment past its due date and not yet completed? */
export function computeOverdue(assignment: Pick<LmsCourseAssignment, "dueDate" | "status">): boolean {
  if (assignment.status === "completed") return false;
  if (!assignment.dueDate) return false;
  const due = new Date(assignment.dueDate);
  if (isNaN(due.getTime())) return false;
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
}

/**
 * Persist an internal-course assignment's completion if the nurse has finished
 * all lessons and (if a quiz exists) passed it. Issues a certificate. Returns
 * the (possibly updated) assignment.
 */
export async function maybeCompleteInternal(
  assignment: LmsCourseAssignment,
  course: LmsCourse,
): Promise<LmsCourseAssignment> {
  if (assignment.status === "completed") return assignment;
  if (course.sourceType !== "internal") return assignment;

  const lessons = await storage.getLmsLessons(course.id);
  const lessonIds = lessons.map((l) => l.id);
  const completedSet = new Set(assignment.completedLessonIds || []);
  const allLessonsDone = lessonIds.length === 0 || lessonIds.every((id) => completedSet.has(id));

  let quizPassed = true;
  if (typeof course.passThreshold === "number") {
    quizPassed = typeof assignment.quizScore === "number" && assignment.quizScore >= course.passThreshold;
  }

  if (allLessonsDone && quizPassed) {
    return finalizeCompletion(assignment, course, assignment.quizScore ?? null);
  }
  return assignment;
}

/**
 * Mark an assignment completed, issue a certificate (if enabled), and audit.
 * Shared by internal completion and linked refresh paths.
 */
export async function finalizeCompletion(
  assignment: LmsCourseAssignment,
  course: LmsCourse,
  score: number | null,
): Promise<LmsCourseAssignment> {
  const completedAt = new Date();
  let certificateDocumentId = assignment.certificateDocumentId;

  if (course.certificateEnabled && !certificateDocumentId) {
    try {
      const nurse = await storage.getCandidate(assignment.nurseId);
      const doc = await issueLmsCertificate({
        nurseId: assignment.nurseId,
        nurseName: nurse?.fullName || "Nurse",
        courseTitle: course.title,
        completedAt,
        score,
      });
      certificateDocumentId = doc.id;
    } catch (err) {
      console.error("[lms] failed to issue certificate:", (err as Error)?.message || err);
    }
  }

  const updated = await storage.updateLmsAssignment(assignment.id, {
    status: "completed",
    completedAt,
    quizScore: score ?? assignment.quizScore ?? null,
    certificateDocumentId: certificateDocumentId ?? null,
  });

  await logAction(assignment.nurseId, "lms", "course_completed", "system", {
    courseId: course.id,
    courseTitle: course.title,
    score,
    certificateIssued: !!certificateDocumentId,
  });

  return updated || assignment;
}

/**
 * Recompute a linked assignment's completion from its source system and persist
 * any change (issuing a certificate on first completion). No-op for internal
 * courses (those are driven by the portal lesson/quiz flow). Returns the
 * (possibly updated) assignment.
 */
export async function refreshAssignmentStatus(assignment: LmsCourseAssignment): Promise<LmsCourseAssignment> {
  const course = await storage.getLmsCourse(assignment.courseId);
  if (!course) return assignment;
  if (course.sourceType === "internal") return assignment;
  if (assignment.status === "completed") return assignment;

  const { completed } = await getLinkedCompletion(course, assignment.nurseId);
  if (completed) {
    return finalizeCompletion(assignment, course, null);
  }
  return assignment;
}

/** Build the display-status for an assignment (overdue is derived, not stored). */
export function viewStatus(assignment: LmsCourseAssignment): LmsProgressView {
  const overdue = computeOverdue(assignment);
  const status: LmsDerivedStatus = assignment.status === "completed"
    ? "completed"
    : overdue
      ? "overdue"
      : assignment.status;
  return {
    status,
    completed: assignment.status === "completed",
    completedAt: assignment.completedAt ?? null,
    overdue,
  };
}

/**
 * Send a single nurse a reminder listing their outstanding (incomplete) course
 * assignments. Mints a fresh 30-day portal link. Sets lastChasedAt on each
 * outstanding assignment. Throws if Outlook isn't configured or the nurse has
 * no email / no outstanding courses.
 */
export async function sendCourseReminder(opts: {
  nurseId: string;
  portalBaseUrl: string;
  sentBy: string;
}): Promise<{ courseNames: string[]; portalUrl: string }> {
  if (!isOutlookConfigured()) {
    throw new Error("Outlook integration not configured (set AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET).");
  }
  const nurse = await storage.getCandidate(opts.nurseId);
  if (!nurse) throw new Error("Nurse not found.");
  if (!nurse.email) throw new Error(`${nurse.fullName} has no email address on file.`);

  const assignments = await storage.getLmsAssignmentsForNurse(opts.nurseId);
  const outstanding = assignments.filter((a) => a.status !== "completed");
  if (outstanding.length === 0) {
    throw new Error(`${nurse.fullName} has no outstanding training courses to chase.`);
  }

  const courseNames: string[] = [];
  for (const a of outstanding) {
    const course = await storage.getLmsCourse(a.courseId);
    if (course) courseNames.push(course.title);
  }

  const minted = await mintChasePortalLinkForNurse({
    nurseId: opts.nurseId,
    sentBy: opts.sentBy,
    portalBaseUrl: opts.portalBaseUrl,
  });
  const expiryFmt = minted.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  await sendLmsCourseReminderEmail({
    recipientEmail: nurse.email,
    recipientName: nurse.fullName,
    courseNames,
    portalUrl: minted.portalUrl,
    expiryFormatted: expiryFmt,
  });

  const now = new Date();
  for (const a of outstanding) {
    await storage.updateLmsAssignment(a.id, { lastChasedAt: now });
  }

  await logAction(opts.nurseId, "lms", "course_reminder_sent", opts.sentBy, {
    courseCount: courseNames.length,
    courses: courseNames,
  });

  return { courseNames, portalUrl: minted.portalUrl };
}
