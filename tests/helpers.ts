import express, { ErrorRequestHandler } from "express";
import session from "express-session";
import { createServer } from "http";
import type { Server } from "http";
import supertest from "supertest";

let cachedApp: express.Express | null = null;
let cachedServer: Server | null = null;
let cachedRequest: supertest.Agent | null = null;

const createdNurseIds: string[] = [];
const createdCandidateIds: string[] = [];

export async function getTestApp() {
  if (cachedApp && cachedServer && cachedRequest) {
    return { app: cachedApp, server: cachedServer, request: cachedRequest };
  }

  const app = express();
  app.set("trust proxy", 1);
  const httpServer = createServer(app);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(
    session({
      secret: "test-secret-key-for-vitest",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
    })
  );

  const { registerRoutes } = await import("../server/routes");
  await registerRoutes(httpServer, app);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = (err as { status?: number; statusCode?: number }).status ||
                   (err as { status?: number; statusCode?: number }).statusCode || 500;
    const message = (err as Error).message || "Internal Server Error";
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  };
  app.use(errorHandler);

  cachedApp = app;
  cachedServer = httpServer;
  cachedRequest = supertest.agent(app);

  return { app, server: httpServer, request: cachedRequest };
}

export async function loginAsAdmin() {
  const agent = supertest.agent((await getTestApp()).app);
  await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  return agent;
}

export async function loginAsTeam() {
  const agent = supertest.agent((await getTestApp()).app);
  await agent.post("/api/auth/login").send({ username: "team", password: "teampass" });
  return agent;
}

export async function createTestNurse(agent: supertest.Agent, overrides: Record<string, unknown> = {}) {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  const data = {
    fullName: `Test Nurse ${ts}-${rand}`,
    email: `testnurse-${ts}-${rand}@test.example.com`,
    phone: "07700900000",
    ...overrides,
  };
  const res = await agent.post("/api/nurses").send(data);
  if (res.body.id) createdNurseIds.push(res.body.id);
  return res.body;
}

export async function createTestCandidate(agent: supertest.Agent, overrides: Record<string, unknown> = {}) {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  const data = {
    fullName: `Test Candidate ${ts}-${rand}`,
    email: `testcandidate-${ts}-${rand}@test.example.com`,
    phone: "07700900001",
    ...overrides,
  };
  const res = await agent.post("/api/candidates").send(data);
  if (res.body.id) createdCandidateIds.push(res.body.id);
  return res.body;
}

export async function createPortalLink(agent: supertest.Agent, nurseId: string, module: string = "preboard") {
  const res = await agent.post(`/api/nurses/${nurseId}/portal-link`).send({ module });
  return res.body;
}

export function getTrackedNurseIds(): string[] {
  return [...createdNurseIds];
}

export function getTrackedCandidateIds(): string[] {
  return [...createdCandidateIds];
}

export async function cleanupTestData(agent: supertest.Agent) {
  for (const id of [...createdNurseIds]) {
    try {
      await agent.delete(`/api/nurses/${id}`);
    } catch (_e) { /* ignore cleanup errors */ }
  }
  for (const id of [...createdCandidateIds]) {
    try {
      await agent.delete(`/api/candidates/${id}`);
    } catch (_e) { /* ignore cleanup errors */ }
  }
  createdNurseIds.length = 0;
  createdCandidateIds.length = 0;
}
