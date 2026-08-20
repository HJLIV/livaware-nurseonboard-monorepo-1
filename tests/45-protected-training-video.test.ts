import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import {
  createPortalLink,
  createTestNurse,
  getTestApp,
  loginAsAdmin,
} from "./helpers";

describe("45 — protected Excellence Blueprint training video", () => {
  let admin: supertest.Agent;
  let anonymous: supertest.Agent;

  beforeAll(async () => {
    const { request } = await getTestApp();
    anonymous = request;
    admin = await loginAsAdmin();
  });

  it("rejects requests without a portal session", async () => {
    const response = await anonymous
      .get("/api/portal/me/training/excellence-blueprint")
      .set("Range", "bytes=0-9");

    expect(response.status).toBe(401);
  });

  it("does not expose the former public video URL", async () => {
    const response = await anonymous.get("/videos/excellence-blueprint.mp4");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
  });

  it("hides the video from nurses who have not reached the completed stage", async () => {
    const nurse = await createTestNurse(admin, { currentStage: "onboard" });
    const link = await createPortalLink(admin, nurse.id, "onboard");

    const response = await anonymous
      .get(`/api/portal/${link.token}/training/excellence-blueprint`)
      .set("Range", "bytes=0-9");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("nurse_stage_incomplete");
  });

  it("streams byte ranges to a completed nurse using a portal link", async () => {
    const nurse = await createTestNurse(admin);
    await admin.patch(`/api/nurses/${nurse.id}`).send({ currentStage: "completed" });
    const link = await createPortalLink(admin, nurse.id, "onboard");

    const response = await anonymous
      .get(`/api/portal/${link.token}/training/excellence-blueprint`)
      .set("Range", "bytes=0-9")
      .buffer(true);

    expect(response.status).toBe(206);
    expect(response.headers["content-type"]).toMatch(/^video\/mp4/);
    expect(response.headers["content-range"]).toMatch(/^bytes 0-9\/\d+$/);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toHaveLength(10);
  });

  it("streams to a completed nurse through the passwordless portal session", async () => {
    const nurse = await createTestNurse(admin);
    await admin.patch(`/api/nurses/${nurse.id}`).send({ currentStage: "completed" });
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const portal = supertest.agent((await getTestApp()).app);
    await portal.get(`/api/portal/${link.token}`);

    const response = await portal
      .get("/api/portal/me/training/excellence-blueprint")
      .set("Range", "bytes=10-19")
      .buffer(true);

    expect(response.status).toBe(206);
    expect(response.headers["content-range"]).toMatch(/^bytes 10-19\/\d+$/);
    expect(response.body).toHaveLength(10);
  });

  it("rejects malformed or unsatisfiable byte ranges", async () => {
    const nurse = await createTestNurse(admin);
    await admin.patch(`/api/nurses/${nurse.id}`).send({ currentStage: "completed" });
    const link = await createPortalLink(admin, nurse.id, "onboard");

    const response = await anonymous
      .get(`/api/portal/${link.token}/training/excellence-blueprint`)
      .set("Range", "bytes=999999999-1000000000");

    expect(response.status).toBe(416);
    expect(response.headers["content-range"]).toMatch(/^bytes \*\/\d+$/);
  });
});