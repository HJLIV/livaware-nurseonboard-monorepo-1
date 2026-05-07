// Read/write helpers for the admin-tunable preboard integrity settings.
//
// Currently a single knob — the suspect-typing burst threshold — but
// kept in its own module so other detector tunables can be added here
// without touching every caller. Storage is the generic `appSettings`
// key/value table, mirroring the training-chase scheduler pattern.

import {
  PREBOARD_INTEGRITY_SETTING_KEY,
  DEFAULT_PREBOARD_INTEGRITY_SETTINGS,
  SUSPECT_BURST_CHAR_THRESHOLD,
  SUSPECT_BURST_CHAR_THRESHOLD_MIN,
  SUSPECT_BURST_CHAR_THRESHOLD_MAX,
  type PreboardIntegritySettings,
} from "@shared/schema";
import { storage } from "./storage";

export class PreboardIntegritySettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreboardIntegritySettingsValidationError";
  }
}

function clampThreshold(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return SUSPECT_BURST_CHAR_THRESHOLD;
  const i = Math.round(n);
  return Math.min(
    SUSPECT_BURST_CHAR_THRESHOLD_MAX,
    Math.max(SUSPECT_BURST_CHAR_THRESHOLD_MIN, i),
  );
}

export async function getPreboardIntegritySettings(): Promise<PreboardIntegritySettings> {
  const stored = await storage.getAppSetting<Partial<PreboardIntegritySettings>>(
    PREBOARD_INTEGRITY_SETTING_KEY,
  );
  return { ...DEFAULT_PREBOARD_INTEGRITY_SETTINGS, ...(stored || {}) };
}

// Convenience accessor for code paths that only need the threshold
// number (server-side flagging in the PDF report, etc.).
export async function getSuspectBurstCharThreshold(): Promise<number> {
  const s = await getPreboardIntegritySettings();
  return clampThreshold(s.suspectBurstCharThreshold);
}

export async function savePreboardIntegritySettings(
  patch: Partial<PreboardIntegritySettings>,
  updatedBy?: string,
): Promise<PreboardIntegritySettings> {
  const current = await getPreboardIntegritySettings();
  const merged: PreboardIntegritySettings = { ...current, ...patch };

  // Reject obviously bad values up front so admins see a 400 instead of
  // silently being clamped to a value they didn't pick.
  const raw = patch.suspectBurstCharThreshold;
  if (raw !== undefined) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || Math.round(n) !== n) {
      throw new PreboardIntegritySettingsValidationError(
        "suspectBurstCharThreshold must be a whole number.",
      );
    }
    if (
      n < SUSPECT_BURST_CHAR_THRESHOLD_MIN ||
      n > SUSPECT_BURST_CHAR_THRESHOLD_MAX
    ) {
      throw new PreboardIntegritySettingsValidationError(
        `suspectBurstCharThreshold must be between ${SUSPECT_BURST_CHAR_THRESHOLD_MIN} and ${SUSPECT_BURST_CHAR_THRESHOLD_MAX}.`,
      );
    }
  }

  merged.suspectBurstCharThreshold = clampThreshold(merged.suspectBurstCharThreshold);
  await storage.setAppSetting(PREBOARD_INTEGRITY_SETTING_KEY, merged, updatedBy);
  return merged;
}
