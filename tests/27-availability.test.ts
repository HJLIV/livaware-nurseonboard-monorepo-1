import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import {
  getTestApp,
  loginAsAdmin,
  createTestNurse,
  createPortalLink,
} from "./helpers";

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function thisMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function isoDay(month: string, day: number) {
  return `${month}-${pad2(day)}`;
}

async function makeCompletedNurse(admin: supertest.Agent) {
  const nurse = await createTestNurse(admin);
  await admin.patch(`/api/nurses/${nurse.id}`).send({ currentStage: "completed" });
  return nurse;
}

describe("27 — Nurse Availability (task 124)", () => {
  let admin: supertest.Agent;
  let anon: supertest.Agent;

  beforeAll(async () => {
    const { request } = await getTestApp();
    anon = request;
    admin = await loginAsAdmin();
  });

  it("T1: portal availability is open to nurses at any stage (gate retired)", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const res = await anon.get(`/api/portal/${link.token}/availability?month=${thisMonth()}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it("T2: completed nurse can read window + write cells via portal", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const month = thisMonth();

    const initial = await anon.get(`/api/portal/${link.token}/availability?month=${month}`);
    expect(initial.status).toBe(200);
    expect(initial.body.entries).toEqual([]);
    expect(initial.body.windowMonths.min).toBe(month);

    const day = isoDay(month, 15);
    const write = await anon
      .put(`/api/portal/${link.token}/availability`)
      .send({ cells: [
        { date: day, shift: "am", status: "available" },
        { date: day, shift: "pm", status: "preferred" },
        { date: day, shift: "night", status: "unavailable" },
      ]});
    expect(write.status).toBe(200);
    expect(write.body.updated).toBe(3);

    const after = await anon.get(`/api/portal/${link.token}/availability?month=${month}`);
    expect(after.body.entries.length).toBe(3);
    const am = after.body.entries.find((e: any) => e.shift === "am");
    expect(am.status).toBe("available");
  });

  it("T3: 'unset' deletes the row", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const month = thisMonth();
    const day = isoDay(month, 10);
    await anon.put(`/api/portal/${link.token}/availability`)
      .send({ cells: [{ date: day, shift: "am", status: "available" }]});
    await anon.put(`/api/portal/${link.token}/availability`)
      .send({ cells: [{ date: day, shift: "am", status: "unset" }]});
    const after = await anon.get(`/api/portal/${link.token}/availability?month=${month}`);
    expect(after.body.entries.find((e: any) => e.date === day && e.shift === "am")).toBeUndefined();
  });

  it("T4: dates outside the 7-month window are rejected", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const res = await anon.put(`/api/portal/${link.token}/availability`)
      .send({ cells: [{ date: "2030-01-01", shift: "am", status: "available" }]});
    expect(res.status).toBe(400);
  });

  it("T5: admin matrix lists completed nurses with their cells", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const month = thisMonth();
    const day = isoDay(month, 5);
    await anon.put(`/api/portal/${link.token}/availability`)
      .send({ cells: [{ date: day, shift: "pm", status: "preferred" }]});

    const res = await admin.get(`/api/admin/availability/matrix?month=${month}`);
    expect(res.status).toBe(200);
    expect(res.body.days.length).toBeGreaterThan(20);
    const row = res.body.nurses.find((n: any) => n.id === nurse.id);
    expect(row).toBeDefined();
    expect(res.body.matrix[nurse.id]?.[day]?.pm).toBe("preferred");
  });

  it("T6: CSV export uses normalized row format (nurse_id,name,email,date,shift,status)", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const month = thisMonth();
    const day = isoDay(month, 7);
    await anon.put(`/api/portal/${link.token}/availability`)
      .send({ cells: [{ date: day, shift: "am", status: "preferred" }]});

    const res = await admin.get(`/api/admin/availability/export.csv?month=${month}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    const text = res.text;
    expect(text.split("\n")[0]).toBe("nurse_id,name,email,date,shift,status");
    const row = text.split("\n").find((l) => l.includes(nurse.id) && l.includes(day) && l.includes(",am,"));
    expect(row).toBeDefined();
    expect(row).toContain(",preferred");
  });

  it("T7: admin can write per-nurse + writes audit log", async () => {
    const nurse = await makeCompletedNurse(admin);
    const month = thisMonth();
    const day = isoDay(month, 20);
    const res = await admin.put(`/api/admin/nurses/${nurse.id}/availability`)
      .send({ cells: [{ date: day, shift: "night", status: "available" }]});
    expect(res.status).toBe(200);

    const audit = await admin.get(`/api/nurses/${nurse.id}/audit-log`);
    const found = (audit.body as any[]).find((a) => a.action === "availability_updated");
    expect(found).toBeDefined();
  });

  it("T8a: per-week 'mark whole week available' writes 7 days × 3 shifts", async () => {
    // Mirrors the per-week bulk button: a 7-day window starting on a Monday,
    // every shift set to available. Demonstrates the route accepts a week-sized
    // batch and writes exactly that range (server is the source of truth here;
    // the UI just sends the cells for one week).
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const month = thisMonth();
    // Pick the Monday on/after the 8th of the visible month so the whole 7-day
    // window stays inside the month regardless of weekday alignment.
    const [yr, mo] = month.split("-").map(Number);
    let mondayDay = 8;
    while (new Date(Date.UTC(yr, mo - 1, mondayDay)).getUTCDay() !== 1) mondayDay++;
    const weekDays: string[] = [];
    for (let i = 0; i < 7; i++) weekDays.push(`${month}-${pad2(mondayDay + i)}`);
    const cells = weekDays.flatMap((d) => ["am", "pm", "night"].map((s) => ({ date: d, shift: s, status: "available" })));
    const res = await anon.put(`/api/portal/${link.token}/availability`).send({ cells });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(21);
    const after = await anon.get(`/api/portal/${link.token}/availability?month=${month}`);
    const inWeek = after.body.entries.filter((e: any) => weekDays.includes(e.date));
    expect(inWeek.length).toBe(21);
  });

  it("T8b: bulk 'clear month' removes all entries (status=unset)", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const month = thisMonth();
    const day = isoDay(month, 12);
    await anon.put(`/api/portal/${link.token}/availability`)
      .send({ cells: [
        { date: day, shift: "am", status: "available" },
        { date: day, shift: "pm", status: "preferred" },
      ]});
    const clear = await anon.put(`/api/portal/${link.token}/availability`)
      .send({ cells: [
        { date: day, shift: "am", status: "unset" },
        { date: day, shift: "pm", status: "unset" },
        { date: day, shift: "night", status: "unset" },
      ]});
    expect(clear.status).toBe(200);
    const after = await anon.get(`/api/portal/${link.token}/availability?month=${month}`);
    expect(after.body.entries.find((e: any) => e.date === day)).toBeUndefined();
  });

  it("T8c: admin matrix stage filter defaults to completed; ?stage=all returns earlier-stage nurses too", async () => {
    const completed = await makeCompletedNurse(admin);
    const nonCompleted = await createTestNurse(admin); // remains pre-completed
    const month = thisMonth();
    const def = await admin.get(`/api/admin/availability/matrix?month=${month}`);
    expect(def.status).toBe(200);
    const defIds = (def.body.nurses as any[]).map((n) => n.id);
    expect(defIds).toContain(completed.id);
    expect(defIds).not.toContain(nonCompleted.id);

    const all = await admin.get(`/api/admin/availability/matrix?month=${month}&stage=all`);
    expect(all.status).toBe(200);
    const allIds = (all.body.nurses as any[]).map((n) => n.id);
    expect(allIds).toContain(completed.id);
    expect(allIds).toContain(nonCompleted.id);
  });

  it("T8d: CSV export honours stage and search filters (matches visible view)", async () => {
    const completed = await makeCompletedNurse(admin);
    const day = isoDay(thisMonth(), 14);
    await admin.put(`/api/admin/nurses/${completed.id}/availability?month=${thisMonth()}`)
      .send({ cells: [{ date: day, shift: "am", status: "available" }]});

    // Default (stage=completed) should include this nurse's row.
    const csvDefault = await admin.get(`/api/admin/availability/export.csv?month=${thisMonth()}`);
    expect(csvDefault.status).toBe(200);
    expect(csvDefault.text).toContain(completed.id);

    // Search filter that matches no nurse should produce a header-only CSV.
    const csvFiltered = await admin
      .get(`/api/admin/availability/export.csv?month=${thisMonth()}&search=__no_match_xyz__`);
    expect(csvFiltered.status).toBe(200);
    expect(csvFiltered.text.split("\n").length).toBe(1);
    expect(csvFiltered.text).not.toContain(completed.id);
  });

  it("T9: portal write is rejected without a valid token", async () => {
    const res = await anon.put(`/api/portal/not-a-real-token/availability`)
      .send({ cells: [{ date: isoDay(thisMonth(), 1), shift: "am", status: "available" }]});
    expect([401, 403, 404]).toContain(res.status);
  });
});
