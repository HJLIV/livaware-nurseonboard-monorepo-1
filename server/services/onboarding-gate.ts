import { db } from "../db";
import { nurses, preboardAssessments, competencyDeclarations, isOnboardingUnlocked as pureIsUnlocked } from "@shared/schema";
import type { Nurse } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logAction } from "./audit";

export interface GateState {
  unlocked: boolean;
  mode: "auto" | "manual";
  unlockedAt: Date | null;
  unlockedBy: string | null;
  lockedReason: string | null;
  // True once the candidate has been advanced to the final "Nurse" stage
  // (current_stage = "completed") by an admin. Drives access to the
  // employer-facing post-onboarding surfaces (policies, induction pack,
  // SOP comprehension) which must NOT be visible while the candidate is
  // still working through assessment / onboarding.
  stageCompleted: boolean;
  // True once an admin has explicitly approved that all Compliance-group
  // questionnaires have been completed and checked. Drives access to the
  // Induction & Training group (Policies, Training, Induction, SOP,
  // Skills Arcade).
  complianceApproved: boolean;
  complianceApprovedAt: Date | null;
  complianceApprovedBy: string | null;
  prerequisites: {
    examinationCompleted: boolean;
    competencyDeclared: boolean;
    cvReviewed: boolean;
  };
}

export async function loadGatePrerequisites(nurseId: string) {
  const [assessment] = await db
    .select({ id: preboardAssessments.id })
    .from(preboardAssessments)
    .where(eq(preboardAssessments.nurseId, nurseId))
    .limit(1);
  const [decl] = await db
    .select({ id: competencyDeclarations.id })
    .from(competencyDeclarations)
    .where(eq(competencyDeclarations.nurseId, nurseId))
    .limit(1);
  const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
  return {
    nurse,
    examinationCompleted: !!assessment || nurse?.preboardStatus === "completed",
    competencyDeclared: !!decl,
    cvReviewed: !!nurse?.cvReviewedAt,
  };
}

export function gateStateFromNurse(nurse: Nurse, prerequisites: GateState["prerequisites"]): GateState {
  const mode = (nurse.onboardingUnlockMode === "manual" ? "manual" : "auto") as "auto" | "manual";
  const unlocked = pureIsUnlocked(nurse, prerequisites);
  return {
    unlocked,
    mode,
    unlockedAt: nurse.onboardingUnlockedAt ?? null,
    unlockedBy: nurse.onboardingUnlockedBy ?? null,
    lockedReason: nurse.onboardingLockedReason ?? null,
    stageCompleted: nurse.currentStage === "completed",
    complianceApproved: !!nurse.complianceApprovedAt,
    complianceApprovedAt: nurse.complianceApprovedAt ?? null,
    complianceApprovedBy: nurse.complianceApprovedBy ?? null,
    prerequisites,
  };
}

export async function getGateState(nurseId: string): Promise<GateState | null> {
  const data = await loadGatePrerequisites(nurseId);
  if (!data.nurse) return null;
  return gateStateFromNurse(data.nurse, {
    examinationCompleted: data.examinationCompleted,
    competencyDeclared: data.competencyDeclared,
    cvReviewed: data.cvReviewed,
  });
}

// Best-effort auto-unlock trigger — invoked after each prerequisite
// changes (assessment submitted, competency declared, CV reviewed).
// A no-op if the nurse is in manual mode, already unlocked, or any
// prerequisite is still missing. Safe to call from any code path.
export async function maybeAutoUnlock(nurseId: string, agentName: string): Promise<boolean> {
  try {
    const data = await loadGatePrerequisites(nurseId);
    if (!data.nurse) return false;
    if (data.nurse.onboardingUnlockedAt) return false;
    if ((data.nurse.onboardingUnlockMode || "auto") !== "auto") return false;
    if (!data.examinationCompleted || !data.competencyDeclared || !data.cvReviewed) return false;
    const now = new Date();
    await db.update(nurses).set({
      onboardingUnlockedAt: now,
      onboardingUnlockedBy: agentName,
      onboardingLockedReason: null,
      updatedAt: now,
    }).where(eq(nurses.id, nurseId));
    await logAction(nurseId, "system", "onboarding_unlocked", agentName, {
      mode: "auto",
      trigger: "prerequisites_satisfied",
    });
    return true;
  } catch (err: any) {
    console.error("[onboarding-gate] maybeAutoUnlock failed:", err.message);
    return false;
  }
}
