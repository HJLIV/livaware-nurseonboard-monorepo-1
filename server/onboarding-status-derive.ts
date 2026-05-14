// Task 125 — derive step completion from the new declaration owners
// (with legacy column fallback) so every surface (sidebar, hub, admin)
// shows a consistent status without us having to re-write every
// per-route status flip.

import { storage } from "./storage";
import { listLatestPerKey } from "./declarations/storage";

type StepStatus = "pending" | "in_progress" | "completed";

const ORDER: Record<StepStatus, number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
};

function takeMax(a: StepStatus | undefined, b: StepStatus): StepStatus {
  if (!a) return b;
  return ORDER[b] > ORDER[a] ? b : a;
}

function declarationToStatus(
  status: string | undefined,
): StepStatus | undefined {
  if (!status) return undefined;
  if (status === "submitted") return "completed";
  if (status === "draft" || status === "reopened") return "in_progress";
  return undefined;
}

export async function enrichStepStatuses(
  nurseId: string,
  raw: Record<string, string> | null | undefined,
): Promise<Record<string, string>> {
  const out: Record<string, string> = { ...(raw || {}) };
  const decls = await listLatestPerKey(nurseId);

  // Right to Work — owned by age_and_eligibility. Legacy fallback:
  // any nurse with dateOfBirth + a right_to_work document was the
  // pre-task-125 "complete" signal.
  const ageDecl = decls.get("age_and_eligibility");
  const rtwFromDecl = declarationToStatus(ageDecl?.status);
  if (rtwFromDecl) {
    out.right_to_work = takeMax(out.right_to_work as StepStatus, rtwFromDecl);
  } else {
    try {
      const nurse = await storage.getCandidate(nurseId);
      if (nurse?.dateOfBirth) {
        const docs = await storage.getDocuments(nurseId);
        const hasRtw = (docs || []).some(
          (d: any) => d.category === "right_to_work",
        );
        if (hasRtw) {
          // Legacy "completed" signal pre-task-125 was DOB recorded +
          // an uploaded right-to-work document, since the old step
          // explicitly required both. Honour that so existing fully-
          // onboarded nurses don't regress to in_progress.
          out.right_to_work = takeMax(
            out.right_to_work as StepStatus,
            "completed",
          );
        }
      }
    } catch {
      // best-effort; keep raw status if anything goes wrong
    }
  }

  // Health step — Occupational Health declaration is now its
  // primary signal.
  const ohDecl = decls.get("occupational_health");
  const healthFromDecl = declarationToStatus(ohDecl?.status);
  if (healthFromDecl) {
    out.health = takeMax(out.health as StepStatus, healthFromDecl);
  }

  // Equal Opportunities is embedded under Demographics. If the
  // candidate has saved any EO row at all, treat it as in_progress;
  // mark completed only when their EO submission flag is set.
  // (We leave the existing stepStatuses.equal_opportunities value
  // alone — it is already updated by the EO step itself.)

  return out;
}
