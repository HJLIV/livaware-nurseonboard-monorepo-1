import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import {
  getTestApp,
  loginAsAdmin,
  createTestNurse,
  createPortalLink,
} from "./helpers";

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function todayIso() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function addDays(dateIso: string, n: number) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const DAY = addDays(todayIso(), 3);

const patient24h = () => ({
  name: `Test Patient ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  carePattern: "twenty_four_hour",
  engagementStart: todayIso(),
  engagementEnd: addDays(todayIso(), 60),
  notes: "24h package",
  active: true,
  slots: [
    { key: "day", label: "Day shift", startTime: "08:00", endTime: "20:00" },
    { key: "night", label: "Night shift", startTime: "20:00", endTime: "08:00" },
  ],
});

const patientVisits = () => ({
  name: `Test Visits ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  carePattern: "timed_visits",
  active: true,
  slots: [
    { key: "visit1", label: "Morning visit", startTime: "09:00", endTime: "11:00" },
    { key: "visit2", label: "Evening visit", startTime: "18:00", endTime: "20:00" },
  ],
});

async function makeCompletedNurse(admin: supertest.Agent) {
  const nurse = await createTestNurse(admin);
  await admin.patch(`/api/nurses/${nurse.id}`).send({ currentStage: "completed" });
  return nurse;
}

const createdPatientIds: string[] = [];
async function createPatient(admin: supertest.Agent, body: Record<string, unknown>) {
  const res = await admin.post("/api/admin/rostering/patients").send(body);
  expect(res.status).toBe(201);
  createdPatientIds.push(res.body.id);
  return res.body;
}

describe("35 — Rostering (task 176)", () => {
  let admin: supertest.Agent;
  let anon: supertest.Agent;

  beforeAll(async () => {
    const { request } = await getTestApp();
    anon = request;
    admin = await loginAsAdmin();
    return async () => {
      for (const id of createdPatientIds) {
        try { await admin.delete(`/api/admin/rostering/patients/${id}`); } catch {}
      }
    };
  });

  it("T1: patient CRUD (create, read, update, delete) with validation", async () => {
    const p = await createPatient(admin, patient24h());
    expect(p.carePattern).toBe("twenty_four_hour");
    expect(p.slots.length).toBe(2);

    const got = await admin.get(`/api/admin/rostering/patients/${p.id}`);
    expect(got.status).toBe(200);
    expect(got.body.name).toBe(p.name);

    const upd = await admin.put(`/api/admin/rostering/patients/${p.id}`).send({
      ...patient24h(),
      name: p.name,
      slots: [
        { key: "day", label: "Day shift", startTime: "07:00", endTime: "19:00" },
        { key: "night", label: "Night shift", startTime: "19:00", endTime: "07:00" },
      ],
    });
    expect(upd.status).toBe(200);
    expect(upd.body.slots[0].startTime).toBe("07:00");

    // Validation: 24h needs exactly 2 slots; >3 slots rejected.
    const bad = await admin.post("/api/admin/rostering/patients").send({
      ...patient24h(),
      slots: [{ key: "day", label: "Day", startTime: "08:00", endTime: "20:00" }],
    });
    expect(bad.status).toBe(400);

    const del = await admin.delete(`/api/admin/rostering/patients/${p.id}`);
    expect(del.status).toBe(200);
    const gone = await admin.get(`/api/admin/rostering/patients/${p.id}`);
    expect(gone.status).toBe(404);
  });

  it("T2: roster grid returns days x slots + engagement flags", async () => {
    const p = await createPatient(admin, { ...patient24h(), engagementStart: DAY });
    const res = await admin.get(`/api/admin/rostering/patients/${p.id}/roster?from=${todayIso()}&to=${addDays(todayIso(), 6)}`);
    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBe(2);
    expect(res.body.days.length).toBe(7);
    const before = res.body.days.find((d: any) => d.date === todayIso());
    const after = res.body.days.find((d: any) => d.date === DAY);
    expect(before.inEngagement).toBe(false);
    expect(after.inEngagement).toBe(true);
  });

  it("T3: allocate a nurse, replaces on re-assign, writes audit", async () => {
    const p = await createPatient(admin, patient24h());
    const n1 = await makeCompletedNurse(admin);
    const n2 = await makeCompletedNurse(admin);

    const a1 = await admin.post(`/api/admin/rostering/patients/${p.id}/allocations`)
      .send({ date: DAY, slotKey: "day", nurseId: n1.id });
    expect(a1.status).toBe(201);
    expect(a1.body.allocation.nurseId).toBe(n1.id);
    expect(a1.body.allocation.startTime).toBe("08:00");

    // Re-assign the same cell to another nurse (no self-conflict, 200).
    const a2 = await admin.post(`/api/admin/rostering/patients/${p.id}/allocations`)
      .send({ date: DAY, slotKey: "day", nurseId: n2.id });
    expect(a2.status).toBe(200);
    expect(a2.body.allocation.nurseId).toBe(n2.id);

    const audit = await admin.get(`/api/nurses/${n1.id}/audit-log`);
    const found = (audit.body as any[]).find((a) => a.action === "nurse_allocated");
    expect(found).toBeDefined();
    expect(found.module).toBe("rostering");
  });

  it("T4: crossover detection — overlapping window across patients returns 409, override allows", async () => {
    const p1 = await createPatient(admin, patient24h());
    const p2 = await createPatient(admin, patient24h());
    const nurse = await makeCompletedNurse(admin);

    const first = await admin.post(`/api/admin/rostering/patients/${p1.id}/allocations`)
      .send({ date: DAY, slotKey: "day", nurseId: nurse.id });
    expect(first.status).toBe(201);

    const clash = await admin.post(`/api/admin/rostering/patients/${p2.id}/allocations`)
      .send({ date: DAY, slotKey: "day", nurseId: nurse.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe("crossover_conflict");
    expect(clash.body.conflicts.length).toBe(1);
    expect(clash.body.conflicts[0].patientId).toBe(p1.id);

    const forced = await admin.post(`/api/admin/rostering/patients/${p2.id}/allocations`)
      .send({ date: DAY, slotKey: "day", nurseId: nurse.id, override: true });
    expect(forced.status).toBe(201);
    expect(forced.body.overridden).toBe(true);
  });

  it("T5: night shift crossing midnight conflicts with next-day early visit", async () => {
    const p1 = await createPatient(admin, patient24h());
    const p2 = await createPatient(admin, {
      ...patientVisits(),
      slots: [{ key: "visit1", label: "Early visit", startTime: "06:00", endTime: "08:00" }],
    });
    const nurse = await makeCompletedNurse(admin);

    const night = await admin.post(`/api/admin/rostering/patients/${p1.id}/allocations`)
      .send({ date: DAY, slotKey: "night", nurseId: nurse.id });
    expect(night.status).toBe(201);

    // 20:00 DAY → 08:00 DAY+1 overlaps a 06:00–08:00 visit on DAY+1.
    const clash = await admin.post(`/api/admin/rostering/patients/${p2.id}/allocations`)
      .send({ date: addDays(DAY, 1), slotKey: "visit1", nurseId: nurse.id });
    expect(clash.status).toBe(409);

    // Non-overlapping visit (09:00–11:00) on the same next day is fine.
    const p3 = await createPatient(admin, patientVisits());
    const ok = await admin.post(`/api/admin/rostering/patients/${p3.id}/allocations`)
      .send({ date: addDays(DAY, 1), slotKey: "visit1", nurseId: nurse.id });
    expect(ok.status).toBe(201);
  });

  it("T6: nurse-options returns compliance quick-ticks, availability + conflicts", async () => {
    const p = await createPatient(admin, patient24h());
    const nurse = await makeCompletedNurse(admin);
    await admin.post(`/api/admin/rostering/patients/${p.id}/allocations`)
      .send({ date: DAY, slotKey: "day", nurseId: nurse.id });

    // Give the nurse availability for the night shift on DAY.
    await admin.put(`/api/admin/nurses/${nurse.id}/availability`)
      .send({ cells: [{ date: DAY, shift: "night", status: "available" }] });

    const res = await admin.get(
      `/api/admin/rostering/nurse-options?date=${DAY}&startTime=20:00&endTime=08:00`,
    );
    expect(res.status).toBe(200);
    expect(res.body.shift).toBe("night");
    const row = (res.body.nurses as any[]).find((n) => n.id === nurse.id);
    expect(row).toBeDefined();
    expect(row.compliance).toEqual({ nmc: false, dbs: false, competency: false });
    expect(row.availability).toBe("available");
    expect(row.conflicts).toEqual([]);

    // Overlapping window (day) should surface the existing allocation as a conflict.
    const res2 = await admin.get(
      `/api/admin/rostering/nurse-options?date=${DAY}&startTime=08:00&endTime=20:00`,
    );
    const row2 = (res2.body.nurses as any[]).find((n) => n.id === nurse.id);
    expect(row2.conflicts.length).toBe(1);
    expect(row2.conflicts[0].patientId).toBe(p.id);
  });

  it("T7: consolidated rota returns staff totals, coverage and conflicts", async () => {
    const p1 = await createPatient(admin, patient24h());
    const p2 = await createPatient(admin, patient24h());
    const nurse = await makeCompletedNurse(admin);

    await admin.post(`/api/admin/rostering/patients/${p1.id}/allocations`)
      .send({ date: DAY, slotKey: "day", nurseId: nurse.id });
    await admin.post(`/api/admin/rostering/patients/${p2.id}/allocations`)
      .send({ date: DAY, slotKey: "day", nurseId: nurse.id, override: true });

    const res = await admin.get(`/api/admin/rostering/rota?from=${DAY}&to=${DAY}`);
    expect(res.status).toBe(200);
    const total = (res.body.staffTotals as any[]).find((t) => t.nurseId === nurse.id);
    expect(total).toBeDefined();
    expect(total.shifts).toBe(2);
    expect(total.hours).toBe(24); // 2 × 12h

    const cov1 = (res.body.coverage as any[]).find((c) => c.patientId === p1.id);
    expect(cov1.totalSlots).toBe(2); // day + night for 1 day
    expect(cov1.filled).toBe(1);
    expect(cov1.gaps).toBe(1);

    const conflict = (res.body.conflicts as any[]).find((c) => c.nurseId === nurse.id);
    expect(conflict).toBeDefined();

    // Conflicts-only endpoint agrees.
    const conf = await admin.get(`/api/admin/rostering/conflicts?from=${DAY}&to=${DAY}`);
    expect(conf.status).toBe(200);
    expect((conf.body.conflicts as any[]).some((c) => c.nurseId === nurse.id)).toBe(true);
  });

  it("T8: unassign removes the allocation and audits", async () => {
    const p = await createPatient(admin, patient24h());
    const nurse = await makeCompletedNurse(admin);
    const a = await admin.post(`/api/admin/rostering/patients/${p.id}/allocations`)
      .send({ date: DAY, slotKey: "night", nurseId: nurse.id });
    const del = await admin.delete(`/api/admin/rostering/allocations/${a.body.allocation.id}`);
    expect(del.status).toBe(200);
    const roster = await admin.get(`/api/admin/rostering/patients/${p.id}/roster?from=${DAY}&to=${DAY}`);
    expect(roster.body.allocations.length).toBe(0);
    const audit = await admin.get(`/api/nurses/${nurse.id}/audit-log`);
    expect((audit.body as any[]).some((x) => x.action === "nurse_unallocated")).toBe(true);
  });

  it("T9: allocation outside engagement window / unknown slot rejected", async () => {
    const p = await createPatient(admin, { ...patient24h(), engagementStart: DAY, engagementEnd: addDays(DAY, 5) });
    const nurse = await makeCompletedNurse(admin);
    const early = await admin.post(`/api/admin/rostering/patients/${p.id}/allocations`)
      .send({ date: addDays(DAY, -1), slotKey: "day", nurseId: nurse.id });
    expect(early.status).toBe(400);
    const badSlot = await admin.post(`/api/admin/rostering/patients/${p.id}/allocations`)
      .send({ date: DAY, slotKey: "nope", nurseId: nurse.id });
    expect(badSlot.status).toBe(400);
  });

  it("T10: portal My Shifts is gated and returns month-grouped shifts", async () => {
    const p = await createPatient(admin, patient24h());
    const nurse = await createTestNurse(admin); // pre-completed
    const link = await createPortalLink(admin, nurse.id, "onboard");

    const locked = await anon.get(`/api/portal/${link.token}/my-shifts`);
    expect(locked.status).toBe(403);

    // Grace access opens it without the completed stage.
    await admin.put(`/api/nurses/${nurse.id}/grace-access`).send({ enabled: true });
    const graceOk = await anon.get(`/api/portal/${link.token}/my-shifts`);
    expect(graceOk.status).toBe(200);

    await admin.patch(`/api/nurses/${nurse.id}`).send({ currentStage: "completed" });
    await admin.post(`/api/admin/rostering/patients/${p.id}/allocations`)
      .send({ date: DAY, slotKey: "day", nurseId: nurse.id });

    const res = await anon.get(`/api/portal/${link.token}/my-shifts`);
    expect(res.status).toBe(200);
    expect(res.body.totalShifts).toBe(1);
    expect(res.body.months.length).toBe(1);
    const month = res.body.months[0];
    expect(month.month).toBe(DAY.slice(0, 7));
    expect(month.totalHours).toBe(12);
    const shift = month.shifts[0];
    expect(shift.date).toBe(DAY);
    // Privacy: only the patient's first name is exposed.
    expect(shift.patient).toBe(p.name.split(" ")[0]);
    expect(shift.startTime).toBe("08:00");
  });

  it("T11: rostering endpoints reject unauthenticated callers", async () => {
    const res = await anon.get("/api/admin/rostering/patients");
    expect([401, 403]).toContain(res.status);
    const res2 = await anon.post("/api/admin/rostering/patients").send(patient24h());
    expect([401, 403]).toContain(res2.status);
  });
});
