import { beforeAll } from "vitest";

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "admin";
process.env.TEAM_USERNAME = "team";
process.env.TEAM_PASSWORD = "teampass";
process.env.SESSION_SECRET = "test-secret-key-for-vitest";

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
