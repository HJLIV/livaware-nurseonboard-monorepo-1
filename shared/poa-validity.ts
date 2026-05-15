export type PoaValidity = "valid" | "expired" | "unknown";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDocDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : startOfDay(input);
  }
  const s = String(input);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]) - 1;
    const d = Number(ymd[3]);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : startOfDay(dt);
}

export function threeMonthsAgo(today: Date = new Date()): Date {
  const t = startOfDay(today);
  const y = t.getFullYear();
  const m = t.getMonth();
  const d = t.getDate();
  const targetMonth = m - 3;
  const candidate = new Date(y, targetMonth, d);
  if (candidate.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    return new Date(y, targetMonth + 1, 0);
  }
  return candidate;
}

export function getProofOfAddressValidity(
  documentDate: string | Date | null | undefined,
  today: Date = new Date(),
): PoaValidity {
  const docDate = parseDocDate(documentDate);
  if (!docDate) return "unknown";
  const cutoff = threeMonthsAgo(today);
  return docDate.getTime() >= cutoff.getTime() ? "valid" : "expired";
}

export function isProofOfAddressWithinThreeMonths(
  documentDate: string | Date | null | undefined,
  today: Date = new Date(),
): boolean {
  return getProofOfAddressValidity(documentDate, today) === "valid";
}
