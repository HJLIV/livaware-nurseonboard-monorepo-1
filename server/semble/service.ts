// Semble booking sync — confirm-and-push.
//
// Roster allocations for Semble-linked patients stay local ("pending")
// until an admin confirms them: the bulk push endpoint
// (POST /api/admin/semble/push-bookings) awaits pushAllocationBooking for
// each selected allocation and reports per-shift success/failure. A booking
// is created under the super-admin-configured defaults (location / booking
// type / default clinician) with the actual nurse's name in the comments.
//
// Cancellations remain automatic and fire-and-forget: unassigning an
// allocation — or replacing a cell whose old allocation was already booked —
// cancels the attached Semble booking so the diary never drifts from the
// roster.
//
// pushAllocationBooking/cancelAllocationBooking NEVER throw: every failure
// is caught, recorded on rosterAllocations.sembleBookingError for admin
// visibility, and audited (module `semble`).

import { eq } from "drizzle-orm";
import { db } from "../db";
import { rosterAllocations, rosterPatients, nurses } from "@shared/schema";
import { storage } from "../storage";
import {
  isSembleConfigured,
  createBooking,
  deleteBooking,
} from "./client";

export const SEMBLE_BOOKING_SETTINGS_KEY = "semble_booking_config";

export interface SembleBookingSettings {
  locationId: string | null;
  locationName: string | null;
  bookingTypeId: string | null;
  bookingTypeName: string | null;
  doctorId: string | null;
  doctorName: string | null;
  /** IANA timezone used to convert roster wall-clock times to instants. */
  timezone: string | null;
}

export const EMPTY_SEMBLE_BOOKING_SETTINGS: SembleBookingSettings = {
  locationId: null,
  locationName: null,
  bookingTypeId: null,
  bookingTypeName: null,
  doctorId: null,
  doctorName: null,
  timezone: null,
};

export async function getSembleBookingSettings(): Promise<SembleBookingSettings> {
  const stored = await storage.getAppSetting<Partial<SembleBookingSettings>>(SEMBLE_BOOKING_SETTINGS_KEY);
  return { ...EMPTY_SEMBLE_BOOKING_SETTINGS, ...(stored ?? {}) };
}

export function settingsComplete(s: SembleBookingSettings): boolean {
  return !!(s.locationId && s.bookingTypeId && s.doctorId);
}

// ── Timezone conversion ────────────────────────────────────────────────────
// Roster slots are wall-clock HH:MM in the practice's local timezone
// (default Europe/London). Semble expects ISO instants.

const DEFAULT_TZ = "Europe/London";

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

export function zonedIso(dateIso: string, hhmm: string, timeZone: string = DEFAULT_TZ): string {
  const naive = new Date(`${dateIso}T${hhmm}:00Z`);
  const guessOffset = tzOffsetMinutes(naive, timeZone);
  const utcGuess = new Date(naive.getTime() - guessOffset * 60000);
  const realOffset = tzOffsetMinutes(utcGuess, timeZone);
  return new Date(naive.getTime() - realOffset * 60000).toISOString();
}

function addDaysIso(dateIso: string, n: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  const pad = (x: number) => (x < 10 ? `0${x}` : `${x}`);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ── Booking push / cancel ──────────────────────────────────────────────────

interface PushResult {
  pushed: boolean;
  skippedReason?: string;
  bookingId?: string;
  error?: string;
}

/**
 * Push (or re-push) the Semble booking for an allocation. If the allocation
 * already holds a booking id (cell replaced), the old booking is cancelled
 * first — best effort. Returns a summary; never throws.
 */
export async function pushAllocationBooking(allocationId: string, agentName: string): Promise<PushResult> {
  try {
    const [row] = await db.select().from(rosterAllocations).where(eq(rosterAllocations.id, allocationId));
    if (!row) return { pushed: false, skippedReason: "allocation_gone" };
    const [patient] = await db.select().from(rosterPatients).where(eq(rosterPatients.id, row.patientId));
    if (!patient?.sembleId) return { pushed: false, skippedReason: "patient_not_linked" };
    if (!isSembleConfigured()) return { pushed: false, skippedReason: "not_configured" };
    const settings = await getSembleBookingSettings();
    if (!settingsComplete(settings)) {
      await db.update(rosterAllocations)
        .set({ sembleBookingError: "Semble booking defaults not configured (location / booking type / clinician)" })
        .where(eq(rosterAllocations.id, allocationId));
      return { pushed: false, skippedReason: "settings_incomplete" };
    }

    const [nurse] = await db
      .select({ fullName: nurses.fullName, sembleUserId: nurses.sembleUserId })
      .from(nurses)
      .where(eq(nurses.id, row.nurseId));
    const nurseName = nurse?.fullName || "Unassigned nurse";
    // Book under the nurse's own Semble account when linked; otherwise the
    // practice-wide default clinician from booking settings.
    const doctorId = nurse?.sembleUserId || settings.doctorId!;
    const bookedAsNurse = !!nurse?.sembleUserId;
    const tz = settings.timezone || DEFAULT_TZ;

    // End <= start means the shift crosses midnight into the next day.
    const endDate = toMinutes(row.endTime) <= toMinutes(row.startTime) ? addDaysIso(row.date, 1) : row.date;
    const start = zonedIso(row.date, row.startTime, tz);
    const end = zonedIso(endDate, row.endTime, tz);

    // Replacing an existing booking (nurse/slot changed): cancel first.
    if (row.sembleBookingId) {
      try {
        await deleteBooking(row.sembleBookingId);
      } catch (err) {
        console.error(`[semble] failed to cancel superseded booking ${row.sembleBookingId}:`, err);
      }
    }

    const booking = await createBooking({
      patientId: patient.sembleId,
      doctorId,
      locationId: settings.locationId!,
      bookingTypeId: settings.bookingTypeId!,
      start,
      end,
      comments: `Livaware roster — ${nurseName} · ${row.slotLabel} (${row.startTime}–${row.endTime})`,
    });

    await db.update(rosterAllocations)
      .set({ sembleBookingId: booking.id, sembleBookingError: null, updatedAt: new Date() })
      .where(eq(rosterAllocations.id, allocationId));
    await storage.createAuditLog({
      nurseId: row.nurseId,
      module: "semble",
      action: "booking_created",
      agentName,
      detail: {
        allocationId,
        patientId: row.patientId,
        semblePatientId: patient.sembleId,
        sembleBookingId: booking.id,
        sembleDoctorId: doctorId,
        bookedAsNurse,
        date: row.date,
        slotKey: row.slotKey,
        start,
        end,
      },
    });
    return { pushed: true, bookingId: booking.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[semble] booking push failed for allocation ${allocationId}:`, err);
    try {
      const [row] = await db.update(rosterAllocations)
        .set({ sembleBookingError: message.slice(0, 500) })
        .where(eq(rosterAllocations.id, allocationId))
        .returning();
      await storage.createAuditLog({
        nurseId: row?.nurseId,
        module: "semble",
        action: "booking_failed",
        agentName,
        detail: { allocationId, error: message.slice(0, 500) },
      });
    } catch (inner) {
      console.error("[semble] could not record booking failure:", inner);
    }
    return { pushed: false, error: message };
  }
}

/**
 * Cancel the Semble booking attached to a (just-deleted) allocation row.
 * Best effort; never throws.
 */
export async function cancelAllocationBooking(
  alloc: { id: string; nurseId: string; patientId: string; date: string; slotKey: string; sembleBookingId: string | null },
  agentName: string,
): Promise<void> {
  if (!alloc.sembleBookingId) return;
  if (!isSembleConfigured()) return;
  try {
    await deleteBooking(alloc.sembleBookingId);
    await storage.createAuditLog({
      nurseId: alloc.nurseId,
      module: "semble",
      action: "booking_cancelled",
      agentName,
      detail: {
        allocationId: alloc.id,
        patientId: alloc.patientId,
        sembleBookingId: alloc.sembleBookingId,
        date: alloc.date,
        slotKey: alloc.slotKey,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[semble] booking cancellation failed for allocation ${alloc.id}:`, err);
    try {
      await storage.createAuditLog({
        nurseId: alloc.nurseId,
        module: "semble",
        action: "booking_cancel_failed",
        agentName,
        detail: { allocationId: alloc.id, sembleBookingId: alloc.sembleBookingId, error: message.slice(0, 500) },
      });
    } catch (inner) {
      console.error("[semble] could not record cancellation failure:", inner);
    }
  }
}
