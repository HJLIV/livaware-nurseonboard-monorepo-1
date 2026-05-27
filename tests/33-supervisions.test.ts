import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse } from "./helpers";

async function loginFresh(app: Express, username: string, password: string) {
  const agent = supertest.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

describe("Supervision & Appraisals (task 162)", () => {
  let app: Express;
  let admin: supertest.Agent;
  let superAdmin: supertest.Agent;
  let nurseId: string;

  beforeAll(async () => {
    app = (await getTestApp()).app;
    admin = await loginFresh(app, "admin", "admin");
    superAdmin = await loginFresh(app, "superadmin", "superpass");
    const nurse = await createTestNurse(admin);
    nurseId = nurse.id;
  });

  it("creates, lists, and audits a supervision entry", async () => {
    const create = await admin
      .post(`/api/admin/nurses/${nurseId}/supervisions`)
      .field("type", "supervision")
      .field("conversationDate", "2026-05-20")
      .field("title", "Monthly 1:1")
      .field("notes", "Discussed shift preferences\nand training plan.");
    expect(create.status).toBe(201);
    expect(create.body.id).toBeDefined();
    expect(create.body.type).toBe("supervision");
    expect(create.body.notes).toContain("Discussed");
    expect(create.body.createdBy).toMatch(/admin/);

    const list = await admin.get(`/api/admin/nurses/${nurseId}/supervisions`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((e: any) => e.id === create.body.id)).toBe(true);

    const audit = await admin.get(`/api/nurses/${nurseId}/audit-log`);
    expect(audit.status).toBe(200);
    expect(
      audit.body.some(
        (l: any) => l.module === "supervision" && l.action === "supervision_added",
      ),
    ).toBe(true);
  });

  it("accepts and serves a file attachment", async () => {
    const buf = Buffer.from("%PDF-1.4\nhello supervision attachment\n%%EOF");
    const create = await admin
      .post(`/api/admin/nurses/${nurseId}/supervisions`)
      .field("type", "appraisal")
      .field("conversationDate", "2026-05-21")
      .field("notes", "With attachment")
      .attach("file", buf, { filename: "summary.pdf", contentType: "application/pdf" });
    expect(create.status).toBe(201);
    expect(create.body.attachmentFilename).toBeTruthy();
    expect(create.body.attachmentOriginalFilename).toBe("summary.pdf");

    const dl = await admin.get(`/api/admin/supervisions/${create.body.id}/attachment`);
    expect(dl.status).toBe(200);
    expect(dl.body.toString?.() || dl.text).toContain("hello supervision attachment");
  });

  it("rejects missing notes", async () => {
    const res = await admin
      .post(`/api/admin/nurses/${nurseId}/supervisions`)
      .field("type", "supervision")
      .field("conversationDate", "2026-05-20")
      .field("notes", "");
    expect(res.status).toBe(400);
  });

  it("rejects invalid type / date", async () => {
    const bad1 = await admin
      .post(`/api/admin/nurses/${nurseId}/supervisions`)
      .field("type", "bogus")
      .field("conversationDate", "2026-05-20")
      .field("notes", "x");
    expect(bad1.status).toBe(400);
    const bad2 = await admin
      .post(`/api/admin/nurses/${nurseId}/supervisions`)
      .field("type", "supervision")
      .field("conversationDate", "yesterday")
      .field("notes", "x");
    expect(bad2.status).toBe(400);
  });

  it("blocks a different admin from editing/deleting another admin's entry, allows super-admin", async () => {
    const created = await admin
      .post(`/api/admin/nurses/${nurseId}/supervisions`)
      .field("type", "reflection")
      .field("conversationDate", "2026-05-22")
      .field("notes", "Original by admin");
    expect(created.status).toBe(201);
    const id = created.body.id;

    // team is a different actor; they can read (admin-tier) but not mutate someone else's row
    const team = await loginFresh(app, "team", "teampass");
    const teamEdit = await team
      .put(`/api/admin/supervisions/${id}`)
      .field("notes", "Hijack attempt");
    expect(teamEdit.status).toBe(403);

    const teamDel = await team.delete(`/api/admin/supervisions/${id}`);
    expect(teamDel.status).toBe(403);

    // super-admin can edit and delete
    const saEdit = await superAdmin
      .put(`/api/admin/supervisions/${id}`)
      .field("notes", "Edited by SA");
    expect(saEdit.status).toBe(200);
    expect(saEdit.body.notes).toBe("Edited by SA");

    const saDel = await superAdmin.delete(`/api/admin/supervisions/${id}`);
    expect(saDel.status).toBe(200);
    expect(saDel.body.ok).toBe(true);

    const audit = await admin.get(`/api/nurses/${nurseId}/audit-log`);
    expect(
      audit.body.some(
        (l: any) => l.module === "supervision" && l.action === "supervision_updated",
      ),
    ).toBe(true);
    expect(
      audit.body.some(
        (l: any) => l.module === "supervision" && l.action === "supervision_deleted",
      ),
    ).toBe(true);
  });

  it("author admin can edit and delete their own entry", async () => {
    const created = await admin
      .post(`/api/admin/nurses/${nurseId}/supervisions`)
      .field("type", "other")
      .field("conversationDate", "2026-05-23")
      .field("notes", "Mine");
    expect(created.status).toBe(201);
    const id = created.body.id;

    const edit = await admin
      .put(`/api/admin/supervisions/${id}`)
      .field("notes", "Mine — edited");
    expect(edit.status).toBe(200);
    expect(edit.body.notes).toBe("Mine — edited");

    const del = await admin.delete(`/api/admin/supervisions/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
  });

  it("accepts a TXT attachment (PDF / DOC / DOCX / TXT supported)", async () => {
    const buf = Buffer.from("hand-typed 1:1 notes\nwith line breaks");
    const create = await admin
      .post(`/api/admin/nurses/${nurseId}/supervisions`)
      .field("type", "reflection")
      .field("conversationDate", "2026-05-24")
      .field("notes", "TXT attached")
      .attach("file", buf, { filename: "notes.txt", contentType: "text/plain" });
    expect(create.status).toBe(201);
    expect(create.body.attachmentOriginalFilename).toBe("notes.txt");

    const dl = await admin
      .get(`/api/admin/supervisions/${create.body.id}/attachment`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(dl.status).toBe(200);
    expect(dl.headers["content-disposition"]).toMatch(/notes\.txt/);
    expect(Buffer.isBuffer(dl.body) ? dl.body.toString("utf8") : "").toContain(
      "hand-typed 1:1 notes",
    );
  });

  it("portal cannot read or write supervisions", async () => {
    // Issue a real portal magic link for this nurse, then prove that
    // neither an unauthenticated request nor a portal-token-bearing
    // request can list, create, edit, or delete supervisions — the
    // surface is intentionally admin-only.
    const link = await admin
      .post(`/api/nurses/${nurseId}/portal-link`)
      .send({ module: "onboard" });
    const portalToken: string | undefined = link.body?.token;
    expect(typeof portalToken).toBe("string");

    // Unauthenticated GET on the admin route.
    const unauthRead = await supertest(app).get(
      `/api/admin/nurses/${nurseId}/supervisions`,
    );
    expect(unauthRead.status).toBe(401);

    // Unauthenticated write on the admin route.
    const unauthWrite = await supertest(app)
      .post(`/api/admin/nurses/${nurseId}/supervisions`)
      .field("type", "supervision")
      .field("conversationDate", "2026-05-25")
      .field("notes", "should not be written");
    expect([401, 403]).toContain(unauthWrite.status);

    // A portal token must NOT unlock the admin surface — the admin
    // session cookie is the only valid auth, and `/api/portal/:token/*`
    // is intentionally never wired to supervisions.
    const portalRead = await supertest(app)
      .get(`/api/admin/nurses/${nurseId}/supervisions`)
      .set("Cookie", [`portal_token=${portalToken}`]);
    expect(portalRead.status).toBe(401);

    const portalRouteProbe = await supertest(app).get(
      `/api/portal/${portalToken}/supervisions`,
    );
    expect([404, 401]).toContain(portalRouteProbe.status);
  });
});
