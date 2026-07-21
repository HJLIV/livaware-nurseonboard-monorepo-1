// Semble practice-management integration — API surface tests.
//
// SEMBLE_API_TOKEN is never set in the test environment, so every route that
// would call Semble must degrade to 503 { error: "semble_not_configured" }.
// The roster-patient link fields (sembleId/dob/email/phone) must be inert but
// harmless when unconfigured. Booking push is a confirm-and-push flow:
// allocations stay local ("pending") until an admin pushes them via
// POST /api/admin/semble/push-bookings; only booking *cancellation* (unassign
// or replace-of-a-booked-cell) remains automatic and fire-and-forget.

import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, loginAsAdmin, createTestNurse } from "./helpers";

async function loginFresh(app: Express, username: string, password: string) {
  const agent = supertest.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function addDays(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const patientBody = (extra: Record<string, unknown> = {}) => ({
  name: `Semble Test Patient ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  carePattern: "twenty_four_hour",
  active: true,
  slots: [
    { key: "day", label: "Day shift", startTime: "08:00", endTime: "20:00" },
    { key: "night", label: "Night shift", startTime: "20:00", endTime: "08:00" },
  ],
  ...extra,
});

describe("36 — Semble integration", () => {
  let app: Express;
  let anon: supertest.Agent;
  let admin: supertest.Agent;
  let superAdmin: supertest.Agent;
  const createdPatientIds: string[] = [];

  beforeAll(async () => {
    const t = await getTestApp();
    app = t.app;
    anon = t.request;
    admin = await loginAsAdmin();
    superAdmin = await loginFresh(app, "superadmin", "superpass");

    // Snapshot the real booking defaults so T5's writes never leak into the
    // dev database's live settings.
    const before = await admin.get("/api/admin/semble/status");
    const savedSettings = before.status === 200 ? before.body.settings : null;

    return async () => {
      for (const id of createdPatientIds) {
        try { await admin.delete(`/api/admin/rostering/patients/${id}`); } catch {}
      }
      if (savedSettings) {
        try {
          await superAdmin.put("/api/admin/semble/settings").send({
            locationId: savedSettings.locationId ?? null,
            locationName: savedSettings.locationName ?? null,
            bookingTypeId: savedSettings.bookingTypeId ?? null,
            bookingTypeName: savedSettings.bookingTypeName ?? null,
            doctorId: savedSettings.doctorId ?? null,
            doctorName: savedSettings.doctorName ?? null,
            timezone: savedSettings.timezone ?? null,
          });
        } catch {}
      }
    };
  });

  it("T1: status reports not configured and requires auth", async () => {
    expect((await anon.get("/api/admin/semble/status")).status).toBe(401);

    const res = await admin.get("/api/admin/semble/status");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.settings).toBeTruthy();
    expect(typeof res.body.settingsComplete).toBe("boolean");
    expect(typeof res.body.linkedPatientCount).toBe("number");
  });

  it("T2: Semble-backed reads degrade to 503 when unconfigured", async () => {
    const search = await admin.get("/api/admin/semble/patients?search=smith");
    expect(search.status).toBe(503);
    expect(search.body.error).toBe("semble_not_configured");

    const options = await admin.get("/api/admin/semble/booking-options");
    expect(options.status).toBe(503);
    expect(options.body.error).toBe("semble_not_configured");
  });

  it("T3: patient search validates minimum query length before touching Semble", async () => {
    const res = await admin.get("/api/admin/semble/patients?search=a");
    expect(res.status).toBe(400);
  });

  it("T4: test-connection is super-admin only and 503 when unconfigured", async () => {
    expect((await admin.post("/api/admin/semble/test-connection")).status).toBe(403);

    const res = await superAdmin.post("/api/admin/semble/test-connection");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("semble_not_configured");
  });

  it("T5: booking defaults PUT is super-admin only and persists", async () => {
    const body = {
      locationId: "loc-1",
      locationName: "Main Clinic",
      bookingTypeId: "bt-1",
      bookingTypeName: "Home Visit",
      doctorId: "doc-1",
      doctorName: "Dr Default",
      timezone: "Europe/London",
    };
    expect((await admin.put("/api/admin/semble/settings").send(body)).status).toBe(403);

    const saved = await superAdmin.put("/api/admin/semble/settings").send(body);
    expect(saved.status).toBe(200);
    expect(saved.body.settings.locationId).toBe("loc-1");
    expect(saved.body.settingsComplete).toBe(true);

    const status = await admin.get("/api/admin/semble/status");
    expect(status.body.settings.doctorName).toBe("Dr Default");
    expect(status.body.settingsComplete).toBe(true);

    // Clearing a required field flips settingsComplete back off.
    const cleared = await superAdmin.put("/api/admin/semble/settings").send({ ...body, doctorId: null, doctorName: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.settingsComplete).toBe(false);
  });

  it("T6: rejects malformed settings payloads", async () => {
    const res = await superAdmin.put("/api/admin/semble/settings").send({ locationId: 42 });
    expect(res.status).toBe(400);
  });

  it("T7: roster patient persists Semble link fields and unlinks with null", async () => {
    const create = await admin.post("/api/admin/rostering/patients").send(patientBody({
      sembleId: "sem-abc-123",
      dob: "1948-03-11",
      email: "patient@example.com",
      phone: "07700900123",
    }));
    expect(create.status).toBe(201);
    createdPatientIds.push(create.body.id);
    expect(create.body.sembleId).toBe("sem-abc-123");
    expect(create.body.dob).toBe("1948-03-11");
    expect(create.body.email).toBe("patient@example.com");
    expect(create.body.phone).toBe("07700900123");

    // Update WITHOUT semble fields → link untouched.
    const keep = await admin.put(`/api/admin/rostering/patients/${create.body.id}`).send(patientBody({
      name: create.body.name,
    }));
    expect(keep.status).toBe(200);
    expect(keep.body.sembleId).toBe("sem-abc-123");

    // Explicit null → unlink.
    const unlink = await admin.put(`/api/admin/rostering/patients/${create.body.id}`).send(patientBody({
      name: create.body.name,
      sembleId: null,
      dob: null,
      email: null,
      phone: null,
    }));
    expect(unlink.status).toBe(200);
    expect(unlink.body.sembleId).toBeNull();
  });

  it("T8: allocations for a linked patient still succeed when Semble is unconfigured", async () => {
    const nurse = await createTestNurse(admin);
    await admin.patch(`/api/nurses/${nurse.id}`).send({ currentStage: "completed" });

    const patient = await admin.post("/api/admin/rostering/patients").send(patientBody({
      sembleId: "sem-alloc-test",
    }));
    expect(patient.status).toBe(201);
    createdPatientIds.push(patient.body.id);

    const date = addDays(5);
    const alloc = await admin.post(`/api/admin/rostering/patients/${patient.body.id}/allocations`).send({
      nurseId: nurse.id,
      date,
      slotKey: "day",
    });
    expect(alloc.status).toBe(201);
    // No auto-push: the allocation stays local ("pending") until an admin
    // confirms it via the bulk push flow.
    expect(alloc.body.allocation.sembleBookingId ?? null).toBeNull();
    expect(alloc.body.allocation.sembleBookingError ?? null).toBeNull();

    // Deletion (which triggers the fire-and-forget cancel path) succeeds.
    const del = await admin.delete(`/api/admin/rostering/allocations/${alloc.body.allocation.id}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);
  });

  it("T9: semble audit rows are written for link/unlink", async () => {
    const create = await admin.post("/api/admin/rostering/patients").send(patientBody({
      sembleId: `sem-audit-${Date.now()}`,
    }));
    expect(create.status).toBe(201);
    createdPatientIds.push(create.body.id);

    const audit = await admin.get("/api/audit-logs?module=semble&limit=50");
    expect(audit.status).toBe(200);
    const rows = Array.isArray(audit.body) ? audit.body : audit.body.logs ?? [];
    const linked = rows.find(
      (r: any) => r.action === "patient_linked" && r.detail?.patientId === create.body.id,
    );
    expect(linked).toBeTruthy();
  });

  it("T10: pending-bookings lists linked patients' allocations with status, excludes unlinked", async () => {
    expect((await anon.get(`/api/admin/semble/pending-bookings?from=${addDays(0)}&to=${addDays(7)}`)).status).toBe(401);

    const nurse = await createTestNurse(admin);
    await admin.patch(`/api/nurses/${nurse.id}`).send({ currentStage: "completed" });

    const linked = await admin.post("/api/admin/rostering/patients").send(patientBody({
      sembleId: `sem-pend-${Date.now()}`,
    }));
    expect(linked.status).toBe(201);
    createdPatientIds.push(linked.body.id);

    const unlinked = await admin.post("/api/admin/rostering/patients").send(patientBody());
    expect(unlinked.status).toBe(201);
    createdPatientIds.push(unlinked.body.id);

    const date = addDays(10);
    const a1 = await admin.post(`/api/admin/rostering/patients/${linked.body.id}/allocations`).send({
      nurseId: nurse.id, date, slotKey: "day",
    });
    expect(a1.status).toBe(201);
    const a2 = await admin.post(`/api/admin/rostering/patients/${unlinked.body.id}/allocations`).send({
      nurseId: nurse.id, date, slotKey: "night",
    });
    expect(a2.status).toBe(201);

    const res = await admin.get(`/api/admin/semble/pending-bookings?from=${date}&to=${date}&patientId=${linked.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    const item = res.body.items.find((i: any) => i.allocationId === a1.body.allocation.id);
    expect(item).toBeTruthy();
    expect(item.status).toBe("pending");
    expect(item.patientName).toBe(linked.body.name);
    expect(item.nurseName).toBe(nurse.fullName);
    expect(res.body.counts.pending).toBeGreaterThanOrEqual(1);

    // Range-wide query never includes the unlinked patient's allocation.
    const all = await admin.get(`/api/admin/semble/pending-bookings?from=${date}&to=${date}`);
    expect(all.status).toBe(200);
    expect(all.body.items.find((i: any) => i.allocationId === a2.body.allocation.id)).toBeUndefined();
  });

  it("T11: pending-bookings validates the date range", async () => {
    expect((await admin.get("/api/admin/semble/pending-bookings?from=bad&to=worse")).status).toBe(400);
    expect((await admin.get(`/api/admin/semble/pending-bookings?from=${addDays(5)}&to=${addDays(0)}`)).status).toBe(400);
    expect((await admin.get(`/api/admin/semble/pending-bookings?from=${addDays(0)}&to=${addDays(150)}`)).status).toBe(400);
  });

  it("T12: push-bookings requires auth, validates body, and 503s when unconfigured or disabled", async () => {
    const { SEMBLE_PUSH_ENABLED } = await import("../shared/schema");

    expect((await anon.post("/api/admin/semble/push-bookings").send({ allocationIds: ["x"] })).status).toBe(401);

    // The feature-flag gate (when off) or the unconfigured gate is reported
    // up-front — before any per-row work.
    const res = await admin.post("/api/admin/semble/push-bookings").send({ allocationIds: ["any-id"] });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe(SEMBLE_PUSH_ENABLED ? "semble_not_configured" : "semble_push_disabled");

    // Body validation still guards the shape (checked after the gates,
    // so exercise it via a malformed payload too — same 503 short-circuit).
    const empty = await admin.post("/api/admin/semble/push-bookings").send({ allocationIds: [] });
    expect([400, 503]).toContain(empty.status);
  });

  it("T14: semble users list requires auth and 503s when unconfigured", async () => {
    expect((await anon.get("/api/admin/semble/users")).status).toBe(401);

    const res = await admin.get("/api/admin/semble/users");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("semble_not_configured");
  });

  it("T15: auto-match requires auth and 503s when unconfigured", async () => {
    expect((await anon.post("/api/admin/semble/auto-match-nurses")).status).toBe(401);

    const res = await admin.post("/api/admin/semble/auto-match-nurses");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("semble_not_configured");
  });

  it("T16: nurse-link PUT links, steals a claimed Semble user, unlinks, and audits", async () => {
    const nurseA = await createTestNurse(admin);
    const nurseB = await createTestNurse(admin);

    expect((await anon.put(`/api/admin/semble/nurse-link/${nurseA.id}`).send({ sembleUserId: "su-1" })).status).toBe(401);
    expect((await admin.put(`/api/admin/semble/nurse-link/${nurseA.id}`).send({ sembleUserId: 42 })).status).toBe(400);
    expect((await admin.put("/api/admin/semble/nurse-link/nonexistent-nurse").send({ sembleUserId: "su-1", sembleUserName: "X" })).status).toBe(404);

    // Link nurse A. This is a local write — works without a Semble token.
    const sembleUserId = `su-test-${Date.now()}`;
    const linked = await admin.put(`/api/admin/semble/nurse-link/${nurseA.id}`).send({
      sembleUserId, sembleUserName: "Semble Nurse A",
    });
    expect(linked.status).toBe(200);
    expect(linked.body.sembleUserId).toBe(sembleUserId);
    expect(linked.body.sembleUserName).toBe("Semble Nurse A");

    const nurseAAfter = await admin.get(`/api/nurses/${nurseA.id}`);
    expect(nurseAAfter.body.sembleUserId).toBe(sembleUserId);

    // Linking nurse B to the SAME Semble user steals the link from A.
    const stolen = await admin.put(`/api/admin/semble/nurse-link/${nurseB.id}`).send({
      sembleUserId, sembleUserName: "Semble Nurse A",
    });
    expect(stolen.status).toBe(200);
    expect((await admin.get(`/api/nurses/${nurseA.id}`)).body.sembleUserId).toBeNull();
    expect((await admin.get(`/api/nurses/${nurseB.id}`)).body.sembleUserId).toBe(sembleUserId);

    // Unlink nurse B.
    const unlinked = await admin.put(`/api/admin/semble/nurse-link/${nurseB.id}`).send({ sembleUserId: null });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.sembleUserId).toBeNull();
    expect((await admin.get(`/api/nurses/${nurseB.id}`)).body.sembleUserId).toBeNull();

    // Audit rows: nurse_linked + nurse_unlinked.
    const audit = await admin.get("/api/audit-logs?module=semble&limit=100");
    const rows = Array.isArray(audit.body) ? audit.body : audit.body.logs ?? [];
    expect(rows.find((r: any) => r.action === "nurse_linked" && r.detail?.sembleUserId === sembleUserId)).toBeTruthy();
    expect(rows.find((r: any) => r.action === "nurse_unlinked" && r.nurseId === nurseB.id)).toBeTruthy();
  });

  it("T17: pending-bookings reports which Semble account each shift books under", async () => {
    const nurse = await createTestNurse(admin);
    await admin.patch(`/api/nurses/${nurse.id}`).send({ currentStage: "completed" });

    const patient = await admin.post("/api/admin/rostering/patients").send(patientBody({
      sembleId: `sem-bookedas-${Date.now()}`,
    }));
    expect(patient.status).toBe(201);
    createdPatientIds.push(patient.body.id);

    const date = addDays(20);
    const alloc = await admin.post(`/api/admin/rostering/patients/${patient.body.id}/allocations`).send({
      nurseId: nurse.id, date, slotKey: "day",
    });
    expect(alloc.status).toBe(201);

    // Unlinked nurse → books as the default clinician.
    let res = await admin.get(`/api/admin/semble/pending-bookings?from=${date}&to=${date}&patientId=${patient.body.id}`);
    let item = res.body.items.find((i: any) => i.allocationId === alloc.body.allocation.id);
    expect(item.nurseLinked).toBe(false);
    expect(item.bookedAsName).toBeNull();

    // Linked nurse → books under their own Semble account.
    const link = await admin.put(`/api/admin/semble/nurse-link/${nurse.id}`).send({
      sembleUserId: `su-bookedas-${Date.now()}`, sembleUserName: "Own Account",
    });
    expect(link.status).toBe(200);

    res = await admin.get(`/api/admin/semble/pending-bookings?from=${date}&to=${date}&patientId=${patient.body.id}`);
    item = res.body.items.find((i: any) => i.allocationId === alloc.body.allocation.id);
    expect(item.nurseLinked).toBe(true);
    expect(item.bookedAsName).toBe("Own Account");
  });

  it("T13: replacing a booked cell with a different nurse resets it to pending", async () => {
    const nurseA = await createTestNurse(admin);
    const nurseB = await createTestNurse(admin);
    await admin.patch(`/api/nurses/${nurseA.id}`).send({ currentStage: "completed" });
    await admin.patch(`/api/nurses/${nurseB.id}`).send({ currentStage: "completed" });

    const patient = await admin.post("/api/admin/rostering/patients").send(patientBody({
      sembleId: `sem-replace-${Date.now()}`,
    }));
    expect(patient.status).toBe(201);
    createdPatientIds.push(patient.body.id);

    const date = addDays(15);
    const first = await admin.post(`/api/admin/rostering/patients/${patient.body.id}/allocations`).send({
      nurseId: nurseA.id, date, slotKey: "day",
    });
    expect(first.status).toBe(201);

    // Simulate a previously-pushed booking on the row.
    const { db } = await import("../server/db");
    const { rosterAllocations } = await import("../shared/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(rosterAllocations)
      .set({ sembleBookingId: "book-123", sembleBookingError: null })
      .where(eq(rosterAllocations.id, first.body.allocation.id));

    // Replace with a different nurse → semble fields cleared (stale booking
    // is cancelled fire-and-forget; harmless no-op when unconfigured).
    const replaced = await admin.post(`/api/admin/rostering/patients/${patient.body.id}/allocations`).send({
      nurseId: nurseB.id, date, slotKey: "day",
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.allocation.id).toBe(first.body.allocation.id);
    expect(replaced.body.allocation.sembleBookingId).toBeNull();
    expect(replaced.body.allocation.sembleBookingError).toBeNull();

    // Re-assigning the SAME nurse to the same unchanged cell keeps the
    // booking reference intact.
    await db.update(rosterAllocations)
      .set({ sembleBookingId: "book-456" })
      .where(eq(rosterAllocations.id, first.body.allocation.id));
    const same = await admin.post(`/api/admin/rostering/patients/${patient.body.id}/allocations`).send({
      nurseId: nurseB.id, date, slotKey: "day",
    });
    expect(same.status).toBe(200);
    expect(same.body.allocation.sembleBookingId).toBe("book-456");
  });
});
