// Healthier Business Group (HBC) training-sync admin routes.
//
// Mounted under /api/admin/* so it inherits the global requireAdmin guard from
// routes.ts. State-changing operations that hit HB (catalogue sync, candidate
// push, report pull) are gated to super-admin — they create/modify records on
// our HB account and consume API quota. Read-only views stay admin-level.
//
// There is no portal surface by design: nurses never see their raw HB linkage
// or sync state. See the `portal-admin-parity` skill — this is admin-only.

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireSuperAdmin } from "../middleware";
import {
  isHbcConfigured,
  testConnection,
  getCandidate,
  downloadCertificates,
  HbcNotConfiguredError,
  HbcApiError,
} from "../hbc/client";
import { syncCourseCatalog, pushCandidate, syncTrainingReport } from "../hbc/service";

function actorName(req: Request): string {
  return (req.session as any)?.username || "admin";
}

function handleHbcError(res: Response, err: unknown): void {
  if (err instanceof HbcNotConfiguredError) {
    res.status(503).json({ error: "hbc_not_configured", message: err.message });
    return;
  }
  if (err instanceof HbcApiError) {
    res.status(502).json({ error: "hbc_api_error", message: err.message, status: err.status, body: err.body });
    return;
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  res.status(500).json({ error: "hbc_error", message });
}

export function registerHbcRoutes(app: Express): void {
  // --- Status (admin) -----------------------------------------------------
  app.get("/api/admin/hbc/status", async (_req: Request, res: Response) => {
    try {
      const configured = isHbcConfigured();
      const courses = await storage.getHbcCourses();
      const links = await storage.getHbcCandidateLinks();
      const lastCatalogSync = courses.reduce<string | null>((acc, c) => {
        const t = c.syncedAt instanceof Date ? c.syncedAt.toISOString() : (c.syncedAt as unknown as string);
        return !acc || t > acc ? t : acc;
      }, null);
      res.json({
        configured,
        courseCount: courses.length,
        linkedCandidateCount: links.length,
        lastCatalogSync,
      });
    } catch (err) {
      handleHbcError(res, err);
    }
  });

  // --- Test connection (super-admin) -------------------------------------
  app.post("/api/admin/hbc/test-connection", requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await testConnection();
      res.json({ ok: true, expiresInMs: result.expiresInMs });
    } catch (err) {
      handleHbcError(res, err);
    }
  });

  // --- Course catalogue ---------------------------------------------------
  app.get("/api/admin/hbc/courses", async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getHbcCourses());
    } catch (err) {
      handleHbcError(res, err);
    }
  });

  app.post("/api/admin/hbc/courses/sync", requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const result = await syncCourseCatalog(actorName(req));
      res.json(result);
    } catch (err) {
      handleHbcError(res, err);
    }
  });

  // --- Per-nurse linkage + training results ------------------------------
  app.get("/api/admin/hbc/nurses/:nurseId", async (req: Request, res: Response) => {
    try {
      const nurseId = String(req.params.nurseId);
      const link = await storage.getHbcCandidateLink(nurseId);
      const results = await storage.getHbcTrainingResults(nurseId);
      res.json({ link: link ?? null, results });
    } catch (err) {
      handleHbcError(res, err);
    }
  });

  // Push a nurse to HB (create/match candidate). Super-admin only.
  app.post("/api/admin/hbc/nurses/:nurseId/push", requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const nurseId = String(req.params.nurseId);
      const nurse = await storage.getCandidate(nurseId);
      if (!nurse) {
        res.status(404).json({ error: "nurse_not_found" });
        return;
      }
      const result = await pushCandidate(nurse, actorName(req));
      res.json(result);
    } catch (err) {
      handleHbcError(res, err);
    }
  });

  // Pull a nurse's training results from HB. Super-admin only.
  app.post("/api/admin/hbc/nurses/:nurseId/sync-report", requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const nurseId = String(req.params.nurseId);
      const result = await syncTrainingReport(nurseId, actorName(req));
      res.json(result);
    } catch (err) {
      handleHbcError(res, err);
    }
  });

  // Live HB candidate record (no persistence) — useful for verification.
  app.get("/api/admin/hbc/nurses/:nurseId/remote", async (req: Request, res: Response) => {
    try {
      const nurseId = String(req.params.nurseId);
      const link = await storage.getHbcCandidateLink(nurseId);
      if (!link) {
        res.status(404).json({ error: "not_linked" });
        return;
      }
      const candidate = await getCandidate(link.candidateRef);
      res.json({ candidate });
    } catch (err) {
      handleHbcError(res, err);
    }
  });

  // Download the combined certificates PDF for a linked nurse.
  app.get("/api/admin/hbc/nurses/:nurseId/certificates.pdf", async (req: Request, res: Response) => {
    try {
      const nurseId = String(req.params.nurseId);
      const link = await storage.getHbcCandidateLink(nurseId);
      if (!link) {
        res.status(404).json({ error: "not_linked" });
        return;
      }
      const { buffer, contentType } = await downloadCertificates(link.candidateRef);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="hbc-certificates-${nurseId}.pdf"`);
      res.send(buffer);
    } catch (err) {
      handleHbcError(res, err);
    }
  });
}
