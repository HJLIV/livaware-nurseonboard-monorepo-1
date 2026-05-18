import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import {
  getTestApp,
  loginAsAdmin,
  createTestNurse,
  createPortalLink,
} from "./helpers";

describe("32 — Uniform sizing (task 153)", () => {
  let admin: supertest.Agent;
  let anon: supertest.Agent;

  beforeAll(async () => {
    const { request } = await getTestApp();
    anon = request;
    admin = await loginAsAdmin();
  });

  it("T1: admin can PUT uniform sizing — values persist, updatedAt/By stamped, audit logged", async () => {
    const nurse = await createTestNurse(admin);
    const put = await admin.put(`/api/nurses/${nurse.id}/uniform-sizing`).send({
      uniformTopSize: "M",
      uniformTrouserSize: "M 12",
      uniformTrouserLength: "regular",
    });
    expect(put.status).toBe(200);
    expect(put.body.uniformTopSize).toBe("M");
    expect(put.body.uniformTrouserSize).toBe("M 12");
    expect(put.body.uniformTrouserLength).toBe("regular");
    expect(put.body.uniformSizingUpdatedAt).toBeTruthy();
    expect(put.body.uniformSizingUpdatedBy).toContain("admin");

    const get = await admin.get(`/api/nurses/${nurse.id}`);
    expect(get.body.uniformTopSize).toBe("M");

    const audit = await admin.get(`/api/nurses/${nurse.id}/audit-log`);
    expect(audit.status).toBe(200);
    expect(audit.body.some((l: any) => l.action === "uniform_sizing_updated" && l.module === "admin")).toBe(true);
  });

  it("T2: invalid length is rejected (400)", async () => {
    const nurse = await createTestNurse(admin);
    const res = await admin.put(`/api/nurses/${nurse.id}/uniform-sizing`).send({
      uniformTrouserLength: "extra-long",
    });
    expect(res.status).toBe(400);
  });

  it("T3: portal can self-correct via PUT — writes portal audit row", async () => {
    const nurse = await createTestNurse(admin);
    await admin.put(`/api/nurses/${nurse.id}/uniform-sizing`).send({
      uniformTopSize: "S", uniformTrouserSize: "S 10", uniformTrouserLength: "short",
    });
    const link = await createPortalLink(admin, nurse.id, "hub");
    const put = await anon.put(`/api/portal/${link.token}/uniform-sizing`).send({
      uniformTopSize: "M",
      uniformTrouserSize: "M 12",
      uniformTrouserLength: "regular",
    });
    expect(put.status).toBe(200);
    expect(put.body.uniformTopSize).toBe("M");
    expect(put.body.uniformTrouserLength).toBe("regular");

    const audit = await admin.get(`/api/nurses/${nurse.id}/audit-log`);
    expect(audit.body.some((l: any) => l.action === "portal_uniform_sizing_updated" && l.module === "portal")).toBe(true);
  });

  it("T4: partial PATCH only updates sent fields, nulls clear", async () => {
    const nurse = await createTestNurse(admin);
    await admin.put(`/api/nurses/${nurse.id}/uniform-sizing`).send({
      uniformTopSize: "L", uniformTrouserSize: "L 34", uniformTrouserLength: "long",
    });
    const onlyTop = await admin.put(`/api/nurses/${nurse.id}/uniform-sizing`).send({
      uniformTopSize: "XL",
    });
    expect(onlyTop.status).toBe(200);
    expect(onlyTop.body.uniformTopSize).toBe("XL");
    expect(onlyTop.body.uniformTrouserSize).toBe("L 34");
    expect(onlyTop.body.uniformTrouserLength).toBe("long");

    const clearLen = await admin.put(`/api/nurses/${nurse.id}/uniform-sizing`).send({
      uniformTrouserLength: null,
    });
    expect(clearLen.body.uniformTrouserLength).toBeNull();
  });

  it("T5: CSV export includes the three uniform columns", async () => {
    const nurse = await createTestNurse(admin);
    await admin.put(`/api/nurses/${nurse.id}/uniform-sizing`).send({
      uniformTopSize: "M", uniformTrouserSize: "M 12", uniformTrouserLength: "regular",
    });
    const res = await admin.get("/api/admin/uniform-sizing.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const text = res.text;
    expect(text).toContain("Uniform Top");
    expect(text).toContain("Uniform Trouser");
    expect(text).toContain("Uniform Trouser Length");
    // Our nurse should appear with its sizes
    const lines = text.split("\n");
    const ourLine = lines.find(l => l.includes(nurse.fullName));
    expect(ourLine).toBeTruthy();
    expect(ourLine).toContain("M");
    expect(ourLine).toContain("regular");
  });

  it("T6: anonymous client cannot PUT uniform sizing on admin route", async () => {
    const nurse = await createTestNurse(admin);
    const res = await anon.put(`/api/nurses/${nurse.id}/uniform-sizing`).send({
      uniformTopSize: "M",
    });
    expect([401, 403]).toContain(res.status);
  });

  it("T7: portal PUT requires a valid token", async () => {
    const res = await anon.put(`/api/portal/not-a-real-token/uniform-sizing`).send({
      uniformTopSize: "M",
    });
    expect([401, 403, 404]).toContain(res.status);
  });
});
