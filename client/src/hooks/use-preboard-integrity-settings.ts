import { useQuery } from "@tanstack/react-query";
import {
  SUSPECT_BURST_CHAR_THRESHOLD,
  SUSPECT_BURST_CHAR_THRESHOLD_MIN,
  SUSPECT_BURST_CHAR_THRESHOLD_MAX,
  type PreboardIntegritySettings,
} from "@shared/schema";

export interface PreboardIntegritySettingsResponse {
  settings: PreboardIntegritySettings;
  bounds: { min: number; max: number };
}

// Live, admin-tunable suspect-typing burst threshold. Falls back to the
// hard-coded default while the request is in flight or if the user lacks
// permission to fetch the setting (the page would already be gated, but
// we don't want a 401 to crash the UI).
export function useSuspectBurstCharThreshold(): number {
  const { data } = useQuery<PreboardIntegritySettingsResponse>({
    queryKey: ["/api/admin/settings/preboard-integrity"],
    staleTime: 60_000,
  });
  const v = data?.settings?.suspectBurstCharThreshold;
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(
      SUSPECT_BURST_CHAR_THRESHOLD_MAX,
      Math.max(SUSPECT_BURST_CHAR_THRESHOLD_MIN, Math.round(v)),
    );
  }
  return SUSPECT_BURST_CHAR_THRESHOLD;
}
