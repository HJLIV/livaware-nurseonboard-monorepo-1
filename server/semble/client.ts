// Semble practice-management API client.
//
// Semble exposes a single GraphQL endpoint (https://open.semble.io/graphql)
// authenticated with a static API token sent in the `x-token` header. There
// is no OAuth flow and no token refresh — the token is generated in Semble's
// settings UI and remains valid until revoked.
//
// We use a small, hand-rolled GraphQL POST helper rather than a client
// library: the surface we need is four operations (patient search, booking
// options lookup, createBooking, deleteBooking) plus a cheap `practice`
// query for connection tests.
//
// All configuration comes from env. The integration is "not configured"
// until SEMBLE_API_TOKEN is present; every method throws a typed
// SembleNotConfiguredError instead of making a call. GraphQL-level errors
// (the `errors` array, or the `error` field Semble mutations return in
// their payload) surface as SembleApiError.

export class SembleNotConfiguredError extends Error {
  constructor() {
    super("Semble integration is not configured. Set SEMBLE_API_TOKEN.");
    this.name = "SembleNotConfiguredError";
  }
}

export class SembleApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "SembleApiError";
    this.status = status;
    this.body = body;
  }
}

export interface SembleConfig {
  token: string;
  url: string;
}

const DEFAULT_URL = "https://open.semble.io/graphql";

export function getSembleConfig(): SembleConfig | null {
  const token = (process.env.SEMBLE_API_TOKEN || "").trim();
  const url = (process.env.SEMBLE_API_URL || DEFAULT_URL).trim();
  if (!token) return null;
  return { token, url };
}

export function isSembleConfigured(): boolean {
  return getSembleConfig() !== null;
}

function requireConfig(): SembleConfig {
  const cfg = getSembleConfig();
  if (!cfg) throw new SembleNotConfiguredError();
  return cfg;
}

async function sembleGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const cfg = requireConfig();
  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-token": cfg.token,
      },
      body: JSON.stringify({ query, variables: variables ?? {} }),
    });
  } catch (err) {
    throw new SembleApiError(
      `Could not reach Semble: ${err instanceof Error ? err.message : String(err)}`,
      0,
      null,
    );
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // fall through — handled below
  }
  if (!res.ok) {
    throw new SembleApiError(`Semble API returned HTTP ${res.status}`, res.status, body);
  }
  if (body?.errors?.length) {
    const msg = body.errors.map((e: any) => e?.message).filter(Boolean).join("; ") || "GraphQL error";
    throw new SembleApiError(`Semble GraphQL error: ${msg}`, res.status, body.errors);
  }
  if (!body || typeof body.data === "undefined") {
    throw new SembleApiError("Semble returned an unexpected response shape", res.status, body);
  }
  return body.data as T;
}

// ── Connection test ────────────────────────────────────────────────────────

export interface SemblePracticeInfo {
  id: string;
  name: string | null;
  timezone: string | null;
}

export async function testConnection(): Promise<SemblePracticeInfo> {
  const data = await sembleGraphql<{ practice: SemblePracticeInfo }>(
    `query { practice { id name timezone } }`,
  );
  return data.practice;
}

// ── Patient search ─────────────────────────────────────────────────────────

export interface SemblePatientHit {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  dob: string | null;
  email: string | null;
  phones: { phoneType: string | null; phoneNumber: string | null }[] | null;
}

export async function searchPatients(search: string, pageSize = 20): Promise<{ patients: SemblePatientHit[]; hasMore: boolean }> {
  const data = await sembleGraphql<{
    patients: { data: SemblePatientHit[] | null; pageInfo: { hasMore: boolean | null } | null } | null;
  }>(
    `query SearchPatients($search: String, $pageSize: Int) {
      patients(search: $search, pagination: { page: 1, pageSize: $pageSize }) {
        data { id firstName lastName fullName dob email phones { phoneType phoneNumber } }
        pageInfo { hasMore }
      }
    }`,
    { search, pageSize },
  );
  return {
    patients: data.patients?.data ?? [],
    hasMore: data.patients?.pageInfo?.hasMore ?? false,
  };
}

// ── Booking options (locations / booking types / clinicians) ──────────────

export interface SembleOption {
  id: string;
  name: string;
}

export interface SembleBookingOptions {
  locations: SembleOption[];
  bookingTypes: (SembleOption & { duration: number | null })[];
  doctors: SembleOption[];
  timezone: string | null;
}

export async function getBookingOptions(): Promise<SembleBookingOptions> {
  // Booking types are the practice's *appointment types* (what `createBooking`
  // accepts as `bookingType`). NOT `products` — practices can have thousands
  // of products (labs, procedures) with none flagged bookable, which used to
  // leave this dropdown empty.
  const [practiceData, usersData] = await Promise.all([
    sembleGraphql<{
      practice: {
        locations: { id: string; name: string }[] | null;
        appointmentTypes: ({ id: string | null; title: string | null } | null)[] | null;
        timezone: string | null;
      };
    }>(
      `query { practice { timezone locations { id name } appointmentTypes { id title } } }`,
    ),
    sembleGraphql<{ users: { data: { id: string; fullName: string | null; deleted: boolean | null }[] | null } | null }>(
      `query { users(pagination: { page: 1, pageSize: 200 }) { data { id fullName deleted } } }`,
    ),
  ]);
  // Semble can return null placeholder rows and duplicate ids — drop/dedupe.
  const seen = new Set<string>();
  const bookingTypes: (SembleOption & { duration: number | null })[] = [];
  for (const t of practiceData.practice?.appointmentTypes ?? []) {
    if (!t?.id || seen.has(t.id)) continue;
    seen.add(t.id);
    bookingTypes.push({ id: t.id, name: t.title || t.id, duration: null });
  }
  bookingTypes.sort((a, b) => a.name.localeCompare(b.name));
  return {
    locations: (practiceData.practice?.locations ?? []).map((l) => ({ id: l.id, name: l.name })),
    bookingTypes,
    doctors: (usersData.users?.data ?? [])
      .filter((u) => !u.deleted)
      .map((u) => ({ id: u.id, name: u.fullName || u.id })),
    timezone: practiceData.practice?.timezone ?? null,
  };
}

// ── Users (clinician accounts) ─────────────────────────────────────────────

export interface SembleUser {
  id: string;
  fullName: string | null;
  email: string | null;
}

/**
 * Lists the practice's active (non-deleted) Semble user accounts. Used to
 * link each platform nurse to their own Semble account so pushed bookings
 * are created under the actual nurse rather than the default clinician.
 */
export async function listUsers(): Promise<SembleUser[]> {
  const data = await sembleGraphql<{
    users: { data: ({ id: string | null; fullName: string | null; email: string | null; deleted: boolean | null } | null)[] | null } | null;
  }>(
    `query { users(pagination: { page: 1, pageSize: 200 }) { data { id fullName email deleted } } }`,
  );
  const seen = new Set<string>();
  const users: SembleUser[] = [];
  for (const u of data.users?.data ?? []) {
    if (!u?.id || u.deleted || seen.has(u.id)) continue;
    seen.add(u.id);
    users.push({ id: u.id, fullName: u.fullName, email: u.email });
  }
  users.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
  return users;
}

// ── Bookings ───────────────────────────────────────────────────────────────

export interface CreateBookingInput {
  patientId: string;
  doctorId: string;
  locationId: string;
  bookingTypeId: string;
  /** ISO 8601 datetimes (UTC). */
  start: string;
  end: string;
  comments?: string;
}

export async function createBooking(input: CreateBookingInput): Promise<{ id: string }> {
  const data = await sembleGraphql<{
    createBooking: { data: { id: string } | null; error: string | null } | null;
  }>(
    `mutation CreateBooking($bookingData: BookingDataInput) {
      createBooking(bookingData: $bookingData) {
        data { id }
        error
      }
    }`,
    {
      bookingData: {
        patient: input.patientId,
        doctor: input.doctorId,
        location: input.locationId,
        bookingType: input.bookingTypeId,
        start: input.start,
        end: input.end,
        comments: input.comments ?? "",
      },
    },
  );
  const payload = data.createBooking;
  if (payload?.error) {
    throw new SembleApiError(`Semble rejected the booking: ${payload.error}`, 200, payload);
  }
  if (!payload?.data?.id) {
    throw new SembleApiError("Semble did not return a booking id", 200, payload);
  }
  return { id: payload.data.id };
}

export async function deleteBooking(bookingId: string): Promise<void> {
  const data = await sembleGraphql<{
    deleteBooking: { data: { id: string } | null; error: string | null } | null;
  }>(
    `mutation DeleteBooking($id: ID!) {
      deleteBooking(id: $id, sendCancellationMessages: false, notifyPractice: false) {
        data { id }
        error
      }
    }`,
    { id: bookingId },
  );
  const payload = data.deleteBooking;
  if (payload?.error) {
    throw new SembleApiError(`Semble rejected the cancellation: ${payload.error}`, 200, payload);
  }
}
