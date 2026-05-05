// Single source of truth for "what status is each mandatory training module
// in?" Used both by the Training Matrix endpoint and by the chase-email
// "outstanding modules" calculation, so the two can never drift.

import { MANDATORY_TRAINING_MODULES, type MandatoryTraining } from "@shared/schema";

export type TrainingCellStatus = "green" | "amber" | "red";

export interface TrainingCell {
  status: TrainingCellStatus;
  label: string;
  date?: string | null;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDateGB(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Evaluate a single mandatory training module against a candidate's
 * mandatoryTraining rows. Returns a cell (status + display label) or null
 * if the module name isn't in the canonical CSTF list.
 */
export function evaluateMandatoryTrainingCell(
  nurseRecords: MandatoryTraining[],
  moduleName: string,
): TrainingCell {
  const records = nurseRecords.filter((t) => t.moduleName === moduleName);
  if (records.length === 0) {
    return { status: "red", label: "Not recorded" };
  }
  const sorted = [...records].sort((a, b) => {
    const ae = a.expiryDate ? new Date(a.expiryDate).getTime() : 0;
    const be = b.expiryDate ? new Date(b.expiryDate).getTime() : 0;
    return be - ae;
  });
  const rec = sorted[0];
  const days = daysUntil(rec.expiryDate);

  if (!rec.certificateUploaded && !rec.completedDate) {
    return { status: "amber", label: "Started — no cert" };
  }
  if (rec.expiryDate && days !== null && days < 0) {
    return { status: "red", label: `Expired ${formatDateGB(rec.expiryDate)}`, date: rec.expiryDate };
  }
  if (rec.expiryDate && days !== null && days <= 30) {
    return { status: "amber", label: `Expires ${formatDateGB(rec.expiryDate)}`, date: rec.expiryDate };
  }
  if (rec.certificateUploaded) {
    return {
      status: "green",
      label: rec.expiryDate ? `Valid to ${formatDateGB(rec.expiryDate)}` : "Certificate uploaded",
      date: rec.expiryDate,
    };
  }
  return {
    status: "amber",
    label: rec.completedDate ? `Completed ${formatDateGB(rec.completedDate)} — no cert` : "Pending",
    date: rec.completedDate,
  };
}

export interface OutstandingModule {
  moduleName: string;
  status: "red" | "amber";
  label: string;
  expiryDate?: string | null;
}

/**
 * Returns the modules a nurse is red/amber on (i.e. outstanding) — same
 * rules as the Training Matrix UI.
 */
export function computeOutstandingTrainingForRecords(
  nurseRecords: MandatoryTraining[],
): OutstandingModule[] {
  const out: OutstandingModule[] = [];
  for (const mod of MANDATORY_TRAINING_MODULES) {
    const cell = evaluateMandatoryTrainingCell(nurseRecords, mod.name);
    if (cell.status === "red" || cell.status === "amber") {
      out.push({
        moduleName: mod.name,
        status: cell.status,
        label: cell.label,
        expiryDate: cell.date ?? null,
      });
    }
  }
  return out;
}
