// Healthier Business Group (HBC) sync orchestration.
//
// Bridges the low-level HB API client (./client) and our storage layer:
//  - syncCourseCatalog()  — pulls HB's course list into hbc_courses
//  - pushCandidate(nurse) — creates/matches the nurse at HB, stores the link
//  - syncTrainingReport(nurse) — pulls the nurse's per-course results
//
// Every mutation writes an audit row under the "hbc" module. All functions
// assume the caller has already confirmed the integration is configured (or
// are happy to catch HbcNotConfiguredError).

import { storage } from "../storage";
import { logAction } from "../services/audit";
import type { Candidate } from "@shared/schema";
import {
  listTrainings,
  getCandidateTrainingReport,
  createCandidate,
  isHbcConfigured,
  type CreateCandidateResult,
} from "./client";

export { isHbcConfigured };

export interface CatalogSyncResult {
  count: number;
}

/** Pull HB's course catalogue and upsert it into hbc_courses. */
export async function syncCourseCatalog(agentName: string): Promise<CatalogSyncResult> {
  const courses = await listTrainings();
  for (const c of courses) {
    await storage.upsertHbcCourse({
      courseId: String(c.course_id),
      testId: c.testid != null ? String(c.testid) : null,
      courseName: c.course_name,
      notes: c.notes ?? null,
      groupTitle: c.group_title ?? null,
    });
  }
  await logAction(null, "hbc", "course_catalog_synced", agentName, { count: courses.length });
  return { count: courses.length };
}

export interface PushCandidateResult extends CreateCandidateResult {
  nurseId: string;
}

/**
 * Create (or match) the nurse as a candidate at HB and persist the returned
 * candidate_ref / candidate_id link. Idempotent: HB returns 202 + the same
 * ref when a candidate with that email already exists.
 */
export async function pushCandidate(nurse: Candidate, agentName: string): Promise<PushCandidateResult> {
  const firstName = (nurse.fullName || "").trim().split(/\s+/)[0] || nurse.fullName || "Unknown";
  const lastName = (nurse.fullName || "").trim().split(/\s+/).slice(1).join(" ") || firstName;
  if (!nurse.email) {
    throw new Error("Cannot push to HB: nurse has no email address.");
  }

  const result = await createCandidate({
    first_name: firstName,
    last_name: lastName,
    email: nurse.email,
    client_record_ref: nurse.id,
    job_role: "Nurse",
  });

  await storage.upsertHbcCandidateLink({
    nurseId: nurse.id,
    candidateRef: result.candidate_ref,
    candidateId: result.candidate_id ?? null,
    candidateStatus: result.alreadyExisted ? "existing" : "created",
    lastSyncedAt: new Date(),
    createdBy: agentName,
  });

  await logAction(nurse.id, "hbc", result.alreadyExisted ? "candidate_matched" : "candidate_created", agentName, {
    candidateRef: result.candidate_ref,
    candidateId: result.candidate_id,
  });

  return { ...result, nurseId: nurse.id };
}

export interface TrainingReportSyncResult {
  count: number;
  candidateRef: string;
}

/**
 * Pull a nurse's training results from HB and replace the cached rows. The
 * nurse must already be linked to an HB candidate (via pushCandidate or a
 * manual link).
 */
export async function syncTrainingReport(nurseId: string, agentName: string): Promise<TrainingReportSyncResult> {
  const link = await storage.getHbcCandidateLink(nurseId);
  if (!link) {
    throw new Error("Nurse is not linked to an HB candidate. Push them to HB first.");
  }

  const courses = await getCandidateTrainingReport(link.candidateRef);
  const rows = courses.map((c) => ({
    nurseId,
    courseId: String(c.course_id),
    courseName: c.course_name,
    dateAssigned: c.date_assigned || null,
    dateCompleted: c.date_completed || null,
    renewalDate: c.renewal_date || null,
    courseStatus: c.course_status || null,
    grade: c.grade || null,
  }));
  await storage.replaceHbcTrainingResults(nurseId, rows);
  await storage.upsertHbcCandidateLink({
    nurseId,
    candidateRef: link.candidateRef,
    candidateId: link.candidateId,
    candidateStatus: link.candidateStatus,
    lastSyncedAt: new Date(),
    createdBy: link.createdBy,
  });

  await logAction(nurseId, "hbc", "training_report_synced", agentName, {
    candidateRef: link.candidateRef,
    count: rows.length,
  });
  return { count: rows.length, candidateRef: link.candidateRef };
}
