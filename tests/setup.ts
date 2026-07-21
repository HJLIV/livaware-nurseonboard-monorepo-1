import { afterAll, beforeAll } from "vitest";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "admin";
process.env.TEAM_USERNAME = "team";
process.env.TEAM_PASSWORD = "teampass";
process.env.SUPER_ADMIN_USERNAME = "superadmin";
process.env.SUPER_ADMIN_PASSWORD = "superpass";
process.env.SESSION_SECRET = "test-secret-key-for-vitest";

// Never let the test suite touch the live Semble practice-management API:
// the dev environment may carry a real SEMBLE_API_TOKEN, but every Semble
// test asserts the "not configured" degradation paths (503s, inert hooks).
delete process.env.SEMBLE_API_TOKEN;
delete process.env.SEMBLE_API_URL;

beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL || "";
  if (dbUrl.includes("production") || dbUrl.includes("prod")) {
    throw new Error(
      "SAFETY: DATABASE_URL appears to point to a production database. " +
      "Tests must run against a development or test database. Aborting."
    );
  }

  const bcryptjs = await import("bcryptjs");
  (globalThis as Record<string, unknown>).bcrypt = bcryptjs.default || bcryptjs;
});

// `setupFiles` runs in each test file's worker, so this afterAll fires once per
// test file and tears down whatever nurses/candidates that file created. This
// keeps test people from piling up in the dev database across runs without
// having to add an afterAll to every individual suite. Best-effort: skips files
// that created nothing, and never fails the run on a cleanup error.
afterAll(async () => {
  try {
    const helpers = await import("./helpers");
    if (
      helpers.getTrackedNurseIds().length === 0 &&
      helpers.getTrackedCandidateIds().length === 0
    ) {
      return;
    }
    const agent = await helpers.loginAsAdmin();
    await helpers.cleanupTestData(agent);
  } catch {
    /* best-effort cleanup — never fail the suite on teardown */
  }
});
