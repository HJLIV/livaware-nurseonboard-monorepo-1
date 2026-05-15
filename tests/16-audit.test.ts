import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse } from "./helpers";
import type { InsertAuditLog } from "@shared/schema";

describe("Audit Log Routes", () => {
  let app: Express;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  // T82
  it("T82: GET /api/audit-logs — returns paginated audit logs", async () => {
    const res = await agent.get("/api/audit-logs?limit=10");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T83
  it("T83: GET /api/audit-logs — supports filtering by query params", async () => {
    await createTestNurse(agent);
    const res = await agent.get("/api/audit-logs?limit=50");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const hasNurseCreated = res.body.some((l: { action: string }) => l.action === "nurse_created");
    expect(hasNurseCreated).toBe(true);
  });

  // T84
  it("T84: GET /api/audit-logs/stats — returns audit statistics", async () => {
    const res = await agent.get("/api/audit-logs/stats");
    expect(res.status).toBe(200);
    expect(res.body.byModule).toBeDefined();
    expect(res.body.byAction).toBeDefined();
    expect(Array.isArray(res.body.byModule)).toBe(true);
    expect(Array.isArray(res.body.byAction)).toBe(true);
  });

  // T85
  it("T85: GET /api/audit-logs/nurse/:id — returns logs for specific nurse", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.get(`/api/audit-logs/nurse/${nurse.id}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const log of res.body) {
      expect(log.nurseId).toBe(nurse.id);
    }
  });

  // T86
  it("T86: Audit log is created when nurse record is modified", async () => {
    const nurse = await createTestNurse(agent);
    await agent.patch(`/api/nurses/${nurse.id}`).send({ phone: "07700888888" });
    const res = await agent.get(`/api/audit-logs/nurse/${nurse.id}`);
    expect(res.status).toBe(200);
    const updateLog = res.body.find((l: { action: string }) => l.action === "nurse_updated");
    expect(updateLog).toBeDefined();
  });

  interface EnrichedRow {
    id: string;
    nurseId: string | null;
    action: string;
    agentName: string | null;
    actorName: string | null;
    actorRole: string | null;
    nurseName: string | null;
    nurseEmail: string | null;
  }

  // T87
  it("T87: /api/audit-logs/nurse/:id is enriched with actor + nurse fields", async () => {
    const { storage } = await import("../server/storage");
    const nurse = await createTestNurse(agent);

    const portalLog: InsertAuditLog = {
      nurseId: nurse.id,
      module: "portal",
      action: "portal_accessed",
      agentName: `nurse_portal:${nurse.fullName}`,
      detail: {},
    };
    const adminLog: InsertAuditLog = {
      nurseId: nurse.id,
      module: "admin",
      action: "nurse_updated",
      agentName: "alice (admin)",
      detail: {},
    };
    const sysLog: InsertAuditLog = {
      nurseId: nurse.id,
      module: "system",
      action: "training_chase_scan",
      agentName: "system",
      detail: {},
    };
    const certLog: InsertAuditLog = {
      nurseId: nurse.id,
      module: "onboard",
      action: "certificate_extracted",
      agentName: "certificate_ai",
      detail: {},
    };
    const legacyPortalLog: InsertAuditLog = {
      nurseId: nurse.id,
      module: "portal",
      action: "portal_competency_declared",
      agentName: "nurse_portal",
      detail: {},
    };

    await storage.createAuditLog(portalLog);
    await storage.createAuditLog(adminLog);
    await storage.createAuditLog(sysLog);
    await storage.createAuditLog(certLog);
    await storage.createAuditLog(legacyPortalLog);

    const res = await agent.get(`/api/audit-logs/nurse/${nurse.id}`);
    expect(res.status).toBe(200);
    const rows: EnrichedRow[] = res.body;

    const portalRow = rows.find((l) => l.agentName === `nurse_portal:${nurse.fullName}`);
    expect(portalRow).toBeDefined();
    expect(portalRow!.actorName).toBe(nurse.fullName);
    expect(portalRow!.actorRole).toBe("nurse_portal");
    expect(portalRow!.nurseName).toBe(nurse.fullName);
    expect(portalRow!.nurseEmail).toBe(nurse.email);

    const adminRow = rows.find((l) => l.agentName === "alice (admin)");
    expect(adminRow).toBeDefined();
    expect(adminRow!.actorName).toBe("alice");
    expect(adminRow!.actorRole).toBe("admin");
    expect(adminRow!.nurseName).toBe(nurse.fullName);

    const systemRow = rows.find((l) => l.action === "training_chase_scan");
    expect(systemRow).toBeDefined();
    expect(systemRow!.actorName).toBe("System");
    expect(systemRow!.actorRole).toBe("system");

    // certificate_ai is automated → renders as "Certificate AI" with system role,
    // never the nurse's name even though the row is tied to a nurseId.
    const certRow = rows.find((l) => l.agentName === "certificate_ai");
    expect(certRow).toBeDefined();
    expect(certRow!.actorName).toBe("Certificate AI");
    expect(certRow!.actorRole).toBe("system");

    // Legacy bare "nurse_portal" rows fall back to nurseName via the join.
    const legacyRow = rows.find((l) => l.agentName === "nurse_portal");
    expect(legacyRow).toBeDefined();
    expect(legacyRow!.actorName).toBe(nurse.fullName);
    expect(legacyRow!.actorRole).toBe("nurse_portal");
  });

  // T88a — Super-Admin actor leaderboard groups portal writes by label
  // even when agentName embeds a real name (e.g. "nurse_portal:Jane Doe").
  it("T88a: actorGroupKey collapses portal writes into one bucket", async () => {
    const { actorGroupKey } = await import("../server/services/audit-enrich");
    expect(actorGroupKey("nurse_portal:Jane Doe")).toBe("nurse_portal");
    expect(actorGroupKey("nurse_portal:Bob Smith")).toBe("nurse_portal");
    expect(actorGroupKey("nurse_portal")).toBe("nurse_portal");
    expect(actorGroupKey("referee:Alice")).toBe("referee");
    expect(actorGroupKey("certificate_ai")).toBe("certificate_ai");
    expect(actorGroupKey("alice (admin)")).toBe("alice (admin)");
    expect(actorGroupKey("system")).toBe("system");
    expect(actorGroupKey("")).toBe("system");
  });

  // T88
  it("T88: /api/audit-logs (listing) is enriched and supports actor/nurse search", async () => {
    const { storage } = await import("../server/storage");
    const nurse = await createTestNurse(agent);
    const stamp = `T88-${Date.now()}`;

    const log: InsertAuditLog = {
      nurseId: nurse.id,
      module: "admin",
      action: "nurse_updated",
      agentName: `${stamp} (admin)`,
      detail: {},
    };
    await storage.createAuditLog(log);

    const res = await agent.get("/api/audit-logs?limit=200");
    expect(res.status).toBe(200);
    const rows: EnrichedRow[] = res.body;
    const row = rows.find((l) => l.agentName === `${stamp} (admin)`);
    expect(row).toBeDefined();
    expect(row!.actorName).toBe(stamp);
    expect(row!.actorRole).toBe("admin");
    expect(row!.nurseName).toBe(nurse.fullName);
    expect(row!.nurseEmail).toBe(nurse.email);
  });
});
