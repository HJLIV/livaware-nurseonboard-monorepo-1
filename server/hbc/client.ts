// Healthier Business Group (HBC) API client.
//
// Authentication uses HB's V2 bearer-token flow: exchange `client_id` +
// `api_key` at POST /auth/token for a short-lived access token (3600s) and a
// longer-lived refresh token (7 days). We cache the access token in memory and
// refresh it lazily when it is within REFRESH_SKEW_MS of expiry.
//
// Candidate, training and certificate data are read/written via HB's
// documented resource endpoints (`/candidates`, `/training-list`,
// `/training-results/...`). HB still serves those under the V1 surface, so we
// additionally send the `API-Key` / `API-Version` headers some of those
// endpoints require alongside the bearer token. When HB graduates these
// endpoints to V2 only the header set changes, not the call sites.
//
// All configuration comes from env. The integration is "not configured" until
// HBC_CLIENT_ID + HBC_API_KEY + HBC_API_BASE_URL are all present, in which case
// every method throws a typed HbcNotConfiguredError instead of making a call.

export class HbcNotConfiguredError extends Error {
  constructor() {
    super(
      "Healthier Business Group integration is not configured. Set HBC_CLIENT_ID, HBC_API_KEY and HBC_API_BASE_URL.",
    );
    this.name = "HbcNotConfiguredError";
  }
}

export class HbcApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HbcApiError";
    this.status = status;
    this.body = body;
  }
}

export interface HbcConfig {
  clientId: string;
  apiKey: string;
  baseUrl: string;
  apiVersion: string;
}

export interface HbcCourse {
  course_id: string;
  testid?: string;
  course_name: string;
  notes?: string;
  group_title?: string;
}

export interface HbcTrainingResultCourse {
  course_id: string;
  course_name: string;
  date_assigned?: string;
  date_completed?: string;
  renewal_date?: string;
  course_status?: string;
  grade?: string;
}

export interface HbcCandidateSummary {
  candidate_ref: string;
  candidate_id?: string;
  client_record_ref?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  candidate_status?: string;
  [k: string]: unknown;
}

export interface CreateCandidateInput {
  first_name: string;
  last_name: string;
  email: string;
  client_record_ref?: string;
  consultant_name?: string;
  activate_candidate?: "0" | "1";
  send_activation_mail?: "0" | "1";
  job_role?: string;
  return_email?: string;
}

export interface CreateCandidateResult {
  candidate_ref: string;
  candidate_id?: string;
  /** HB returns 202 (rather than 201) when the candidate already existed. */
  alreadyExisted: boolean;
}

const REFRESH_SKEW_MS = 60_000; // refresh a minute before the token actually expires
const DEFAULT_API_VERSION = "1.0";

export function getHbcConfig(): HbcConfig | null {
  const clientId = (process.env.HBC_CLIENT_ID || "").trim();
  const apiKey = (process.env.HBC_API_KEY || "").trim();
  const baseUrl = (process.env.HBC_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const apiVersion = (process.env.HBC_API_VERSION || DEFAULT_API_VERSION).trim();
  if (!clientId || !apiKey || !baseUrl) return null;
  return { clientId, apiKey, baseUrl, apiVersion };
}

export function isHbcConfigured(): boolean {
  return getHbcConfig() !== null;
}

interface CachedToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
}

let tokenCache: CachedToken | null = null;
let inflightToken: Promise<CachedToken> | null = null;

function requireConfig(): HbcConfig {
  const cfg = getHbcConfig();
  if (!cfg) throw new HbcNotConfiguredError();
  return cfg;
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchAccessToken(cfg: HbcConfig): Promise<CachedToken> {
  const res = await fetch(`${cfg.baseUrl}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: Number(cfg.clientId), api_key: cfg.apiKey }),
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new HbcApiError(
      `HBC auth failed (${res.status})`,
      res.status,
      body,
    );
  }
  const data = body as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data?.access_token) {
    throw new HbcApiError("HBC auth response missing access_token", res.status, body);
  }
  const lifetimeMs = (data.expires_in ?? 3600) * 1000;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + lifetimeMs,
  };
}

async function getAccessToken(cfg: HbcConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - REFRESH_SKEW_MS > Date.now()) {
    return tokenCache.accessToken;
  }
  if (inflightToken) {
    const t = await inflightToken;
    return t.accessToken;
  }
  inflightToken = fetchAccessToken(cfg)
    .then((t) => {
      tokenCache = t;
      return t;
    })
    .finally(() => {
      inflightToken = null;
    });
  const t = await inflightToken;
  return t.accessToken;
}

/** Drop the cached token so the next call re-authenticates. */
export function resetHbcTokenCache(): void {
  tokenCache = null;
}

interface RequestOptions {
  method?: string;
  path: string;
  query?: Record<string, string | undefined>;
  /** JSON body */
  json?: unknown;
  /** form-urlencoded body (HB candidate endpoints expect this) */
  form?: Record<string, string | undefined>;
  accept?: string;
  /** When true, returns the raw Response (used for PDF/binary downloads). */
  raw?: boolean;
  /** Allow a 2nd attempt after a forced re-auth on 401. Internal use. */
  _retried?: boolean;
}

async function hbcRequest<T = unknown>(opts: RequestOptions): Promise<{ status: number; data: T }> {
  const cfg = requireConfig();
  const token = await getAccessToken(cfg);

  const url = new URL(cfg.baseUrl + opts.path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: opts.accept || "application/json",
    // HB's candidate/training endpoints still gate on these headers.
    "API-Key": cfg.apiKey,
    "API-Version": cfg.apiVersion,
  };

  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.form)) {
      if (v !== undefined) params.set(k, v);
    }
    body = params.toString();
  }

  const res = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers,
    body,
  });

  // Token may have been revoked server-side; re-auth once and retry.
  if (res.status === 401 && !opts._retried) {
    resetHbcTokenCache();
    return hbcRequest<T>({ ...opts, _retried: true });
  }

  if (opts.raw) {
    if (!res.ok) {
      throw new HbcApiError(`HBC request failed (${res.status}) ${opts.path}`, res.status, await parseJsonSafe(res));
    }
    return { status: res.status, data: res as unknown as T };
  }

  // 204 No Content is a documented "empty" response for several endpoints.
  if (res.status === 204) {
    return { status: 204, data: null as unknown as T };
  }

  const data = (await parseJsonSafe(res)) as T;
  if (!res.ok) {
    throw new HbcApiError(`HBC request failed (${res.status}) ${opts.path}`, res.status, data);
  }
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Verify credentials by minting a fresh access token. Throws on failure. */
export async function testConnection(): Promise<{ ok: true; expiresInMs: number }> {
  resetHbcTokenCache();
  const cfg = requireConfig();
  const t = await fetchAccessToken(cfg);
  tokenCache = t;
  return { ok: true, expiresInMs: t.expiresAt - Date.now() };
}

/** GET /training-list — the catalogue of courses HB provides to our account. */
export async function listTrainings(): Promise<HbcCourse[]> {
  const { status, data } = await hbcRequest<{ count?: number; trainings?: HbcCourse[] }>({
    path: "/training-list",
  });
  if (status === 204 || !data) return [];
  return data.trainings ?? [];
}

/** GET /training-results/{candidate_ref} — assigned-course results for a candidate. */
export async function getCandidateTrainingReport(candidateRef: string): Promise<HbcTrainingResultCourse[]> {
  const { status, data } = await hbcRequest<Array<{ courses?: HbcTrainingResultCourse[] }>>({
    path: `/training-results/${encodeURIComponent(candidateRef)}`,
  });
  if (status === 204 || !data) return [];
  // HB returns an array wrapping a single { courses: [...] } object.
  return data.flatMap((entry) => entry.courses ?? []);
}

/** POST /candidates — create (or match) a candidate at HB. */
export async function createCandidate(input: CreateCandidateInput): Promise<CreateCandidateResult> {
  const { status, data } = await hbcRequest<unknown>({
    method: "POST",
    path: "/candidates",
    accept: "application/json",
    form: {
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      client_record_ref: input.client_record_ref ?? "",
      consultant_name: input.consultant_name ?? "",
      activate_candidate: input.activate_candidate ?? "1",
      send_activation_mail: input.send_activation_mail ?? "1",
      archived: "0",
      job_role: input.job_role ?? "",
      return_email: input.return_email ?? "",
    },
  });
  // HB wraps the result in `{ response: { candidate_ref, candidate_id } }`,
  // sometimes inside a top-level array. Normalise both shapes.
  const first = Array.isArray(data) ? data[0] : data;
  const resp = (first as { response?: { candidate_ref?: string; candidate_id?: string | number } })?.response;
  if (!resp?.candidate_ref) {
    throw new HbcApiError("HBC create candidate response missing candidate_ref", status, data);
  }
  return {
    candidate_ref: String(resp.candidate_ref),
    candidate_id: resp.candidate_id !== undefined ? String(resp.candidate_id) : undefined,
    alreadyExisted: status === 202,
  };
}

/** GET /candidates/{candidate_ref} — full candidate record at HB. */
export async function getCandidate(candidateRef: string): Promise<HbcCandidateSummary | null> {
  const { status, data } = await hbcRequest<Array<{ candidate?: HbcCandidateSummary }>>({
    path: `/candidates/${encodeURIComponent(candidateRef)}`,
    accept: "application/json",
  });
  if (status === 204 || !data) return null;
  const first = Array.isArray(data) ? data[0] : data;
  return (first as { candidate?: HbcCandidateSummary })?.candidate ?? null;
}

/**
 * GET /training-results/{candidate_ref}/certificate/all — combined PDF of a
 * candidate's training certificates. Returns the raw bytes + content type.
 */
export async function downloadCertificates(candidateRef: string): Promise<{ buffer: Buffer; contentType: string }> {
  const { data } = await hbcRequest<Response>({
    path: `/training-results/${encodeURIComponent(candidateRef)}/certificate/all`,
    accept: "application/pdf",
    raw: true,
  });
  const res = data as Response;
  const arrayBuf = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuf),
    contentType: res.headers.get("content-type") || "application/pdf",
  };
}
