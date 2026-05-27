import crypto from "crypto";
import { db } from "../db";
import { nurses, portalLinks, preboardAssessments, competencyDeclarations, isOnboardingUnlocked as pureIsUnlocked } from "@shared/schema";
import type { Nurse } from "@shared/schema";
import { eq, and, gt, desc, isNull } from "drizzle-orm";
import { logAction } from "./audit";
import { sendOnboardingUnlockedEmail, isOutlookConfigured } from "../outlook";

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
    // Conditional update: only this caller wins if onboardingUnlockedAt
    // is still NULL. Parallel prerequisite events (e.g. simultaneous
    // CV review + competency declaration) won't double-unlock or
    // double-email — the loser's update affects 0 rows.
    const updated = await db
      .update(nurses)
      .set({
        onboardingUnlockedAt: now,
        onboardingUnlockedBy: agentName,
        onboardingLockedReason: null,
        updatedAt: now,
      })
      .where(and(eq(nurses.id, nurseId), isNull(nurses.onboardingUnlockedAt)))
      .returning({ id: nurses.id });
    if (updated.length === 0) return false;
    await logAction(nurseId, "system", "onboarding_unlocked", agentName, {
      mode: "auto",
      trigger: "prerequisites_satisfied",
    });
    // Fire-and-forget — the nurse should know the next part of their
    // portal just opened up. Failures are logged but never block the
    // unlock itself.
    void notifyOnboardingUnlocked(nurseId, "auto").catch((err) => {
      console.error("[onboarding-gate] notifyOnboardingUnlocked (auto) failed:", err.message);
    });
    return true;
  } catch (err: any) {
    console.error("[onboarding-gate] maybeAutoUnlock failed:", err.message);
    return false;
  }
}

// Email the nurse to let them know their onboarding has been unlocked
// and the Induction & Training group is now waiting. Re-uses any
// non-expired portal-hub link; mints a fresh 30-day one otherwise.
// Safe to call multiple times — caller is responsible for not spamming.
export async function notifyOnboardingUnlocked(
  nurseId: string,
  trigger: "auto" | "manual_admin",
): Promise<boolean> {
  if (!isOutlookConfigured()) return false;
  try {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
    if (!nurse || !nurse.email || !nurse.fullName) return false;

    // Hub links are single-use bootstrap tokens — once `claimedAt` is set,
    // the portal-auth resolver rejects them for fresh sign-in. Only reuse
    // a link that is both non-expired AND unclaimed; otherwise mint a new
    // 30-day one.
    const existing = await db
      .select()
      .from(portalLinks)
      .where(
        and(
          eq(portalLinks.nurseId, nurseId),
          eq(portalLinks.module, "hub"),
          gt(portalLinks.expiresAt, new Date()),
          isNull(portalLinks.claimedAt),
        ),
      )
      .orderBy(desc(portalLinks.createdAt))
      .limit(1);

    let token: string;
    let expiresAt: Date;
    if (existing.length > 0) {
      token = existing[0].token;
      expiresAt = existing[0].expiresAt;
    } else {
      token = crypto.randomBytes(32).toString("hex");
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.insert(portalLinks).values({
        nurseId,
        token,
        module: "hub",
        expiresAt,
        createdBy: "system:onboarding_unlocked",
      });
    }

    const base = (process.env.PORTAL_PUBLIC_URL || "https://onboard.livaware.co.uk").replace(/\/+$/, "");
    const portalUrl = `${base}/portal/${token}`;

    await sendOnboardingUnlockedEmail(nurse.email, nurse.fullName, portalUrl);
    await logAction(nurseId, "system", "onboarding_unlocked_email_sent", "system:onboarding_unlocked", {
      trigger,
      recipientEmail: nurse.email,
      expiresAt: expiresAt.toISOString(),
    });
    return true;
  } catch (err: any) {
    console.error("[onboarding-gate] notifyOnboardingUnlocked failed:", err.message);
    return false;
  }
}
