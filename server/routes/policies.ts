// Admin-managed policy library + nurse-facing acknowledgement endpoints.
//
// Admin endpoints (auth-protected) let an admin manage the master list of
// policies (title, body, version, active flag, ordering). Portal endpoints
// (token-gated) let a nurse list active policies along with their own
// acknowledgement status, and record a fresh acknowledgement.

import type { Express, Request } from "express";
import multer from "multer";
import path from "path";
import { db } from "../db";
import {
  policies,
  policyAcknowledgements,
  insertPolicySchema,
  type Policy,
  type PolicyAcknowledgement,
} from "@shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireAdmin, validatePortalToken } from "../middleware";
import { logAction } from "../services/audit";
import { extractPolicyFromFile, PolicyExtractionError } from "../policy-extractor";

const policyImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function agentFor(req: Request): string {
  return req.session?.username || "system";
}

interface PolicyForNurse {
  id: string;
  title: string;
  body: string | null;
  pdfUrl: string | null;
  version: string;
  requireAcknowledgement: boolean;
  sortOrder: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedVersion: string | null;
  needsReacknowledgement: boolean;
}

async function buildPolicyListForNurse(nurseId: string): Promise<{
  policies: PolicyForNurse[];
  totalRequired: number;
  outstanding: number;
}> {
  const active = await db
    .select()
    .from(policies)
    .where(eq(policies.isActive, true))
    .orderBy(asc(policies.sortOrder), asc(policies.title));

  const acks = await db
    .select()
    .from(policyAcknowledgements)
    .where(eq(policyAcknowledgements.nurseId, nurseId));

  // Latest ack per policy id wins.
  const latestAck = new Map<string, PolicyAcknowledgement>();
  for (const a of acks) {
    const prev = latestAck.get(a.policyId);
    if (!prev || (a.acknowledgedAt > prev.acknowledgedAt)) {
      latestAck.set(a.policyId, a);
    }
  }

  const list: PolicyForNurse[] = active.map((p) => {
    const ack = latestAck.get(p.id);
    const versionMatches = ack ? ack.policyVersion === p.version : false;
    return {
      id: p.id,
      title: p.title,
      body: p.body,
      pdfUrl: p.pdfUrl,
      version: p.version,
      requireAcknowledgement: p.requireAcknowledgement,
      sortOrder: p.sortOrder,
      acknowledged: !!ack && versionMatches,
      acknowledgedAt: ack?.acknowledgedAt?.toISOString() ?? null,
      acknowledgedVersion: ack?.policyVersion ?? null,
      needsReacknowledgement: !!ack && !versionMatches,
    };
  });

  const required = list.filter((p) => p.requireAcknowledgement);
  const outstanding = required.filter((p) => !p.acknowledged).length;

  return {
    policies: list,
    totalRequired: required.length,
    outstanding,
  };
}

export function registerPolicyRoutes(app: Express) {
  // ─── Admin: extract title/body from an uploaded .pdf or .docx ────
  // One-shot helper that populates the New/Edit Policy form fields.
  // The uploaded file is NOT stored — we just parse it in memory.
  app.post(
    "/api/admin/policies/extract",
    requireAdmin,
    (req, res, next) => {
      policyImportUpload.single("file")(req, res, (err: any) => {
        if (!err) return next();
        if (err?.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File too large. Maximum size is 10 MB." });
        }
        return res.status(400).json({ message: err?.message || "Upload failed" });
      });
    },
    async (req, res) => {
      try {
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ message: "No file uploaded" });

        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== ".pdf" && ext !== ".docx") {
          return res.status(415).json({ message: "Unsupported file type. Please upload a .pdf or .docx file." });
        }

        const result = await extractPolicyFromFile(file.buffer, file.originalname, file.mimetype);
        res.json(result);
      } catch (err: any) {
        if (err instanceof PolicyExtractionError) {
          return res.status(err.status).json({ message: err.message });
        }
        console.error("[policies] extract failed:", err);
        res.status(500).json({ message: err?.message || "Failed to extract policy" });
      }
    },
  );

  // ─── Admin: list all policies (active + inactive) ────────────────
  app.get("/api/admin/policies", requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(policies)
        .orderBy(asc(policies.sortOrder), asc(policies.title));
      res.json(rows);
    } catch (err: any) {
      console.error("[policies] list failed:", err);
      res.status(500).json({ message: err?.message || "Failed to list policies" });
    }
  });

  // ─── Admin: create policy ────────────────────────────────────────
  app.post("/api/admin/policies", requireAdmin, async (req, res) => {
    try {
      const parsed = insertPolicySchema.safeParse({
        ...req.body,
        createdBy: agentFor(req),
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid policy", errors: parsed.error.errors });
      }
      // A policy with neither body text nor a PDF link would be unreadable
      // for nurses, so reject it up front.
      if (!parsed.data.body?.trim() && !parsed.data.pdfUrl?.trim()) {
        return res.status(400).json({ message: "Provide policy text or a PDF URL so nurses have something to read." });
      }
      const [created] = await db.insert(policies).values(parsed.data).returning();
      await logAction(null, "admin", "policy_created", agentFor(req), {
        policyId: created.id,
        title: created.title,
        version: created.version,
      });
      res.status(201).json(created);
    } catch (err: any) {
      console.error("[policies] create failed:", err);
      res.status(500).json({ message: err?.message || "Failed to create policy" });
    }
  });

  // ─── Admin: update policy ────────────────────────────────────────
  app.patch("/api/admin/policies/:id", requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const [existing] = await db.select().from(policies).where(eq(policies.id, id));
      if (!existing) return res.status(404).json({ message: "Policy not found" });

      const allowed: Partial<Policy> = {};
      const b = req.body || {};
      if (typeof b.title === "string") allowed.title = b.title;
      if (typeof b.body === "string" || b.body === null) allowed.body = b.body;
      if (typeof b.pdfUrl === "string" || b.pdfUrl === null) allowed.pdfUrl = b.pdfUrl;
      if (typeof b.version === "string") allowed.version = b.version;
      if (typeof b.isActive === "boolean") allowed.isActive = b.isActive;
      if (typeof b.requireAcknowledgement === "boolean") allowed.requireAcknowledgement = b.requireAcknowledgement;
      if (typeof b.sortOrder === "number") allowed.sortOrder = b.sortOrder;

      const finalBody = allowed.body !== undefined ? allowed.body : existing.body;
      const finalPdf = allowed.pdfUrl !== undefined ? allowed.pdfUrl : existing.pdfUrl;
      if (!finalBody?.trim() && !finalPdf?.trim()) {
        return res.status(400).json({ message: "Provide policy text or a PDF URL so nurses have something to read." });
      }

      const [updated] = await db
        .update(policies)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(policies.id, id))
        .returning();

      await logAction(null, "admin", "policy_updated", agentFor(req), {
        policyId: id,
        changes: allowed,
        previousVersion: existing.version,
        newVersion: updated.version,
      });
      res.json(updated);
    } catch (err: any) {
      console.error("[policies] update failed:", err);
      res.status(500).json({ message: err?.message || "Failed to update policy" });
    }
  });

  // ─── Admin: delete policy ────────────────────────────────────────
  app.delete("/api/admin/policies/:id", requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const [existing] = await db.select().from(policies).where(eq(policies.id, id));
      if (!existing) return res.status(404).json({ message: "Policy not found" });

      // Acknowledgements reference this policy. Remove them too so the
      // delete is unambiguous from the admin's perspective.
      await db.delete(policyAcknowledgements).where(eq(policyAcknowledgements.policyId, id));
      await db.delete(policies).where(eq(policies.id, id));

      await logAction(null, "admin", "policy_deleted", agentFor(req), {
        policyId: id,
        title: existing.title,
        version: existing.version,
      });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[policies] delete failed:", err);
      res.status(500).json({ message: err?.message || "Failed to delete policy" });
    }
  });

  // ─── Admin: list acknowledgements (audit/reporting) ──────────────
  app.get("/api/admin/policies/:id/acknowledgements", requireAdmin, async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(policyAcknowledgements)
        .where(eq(policyAcknowledgements.policyId, String(req.params.id)))
        .orderBy(desc(policyAcknowledgements.acknowledgedAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load acknowledgements" });
    }
  });

  // ─── Admin: list acknowledgements for a nurse ────────────────────
  app.get("/api/nurses/:id/policy-acknowledgements", requireAdmin, async (req, res) => {
    try {
      const summary = await buildPolicyListForNurse(String(req.params.id));
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load acknowledgements" });
    }
  });

  // ─── Portal: list policies + per-nurse status ────────────────────
  app.get("/api/portal/:token/policies", validatePortalToken, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const summary = await buildPolicyListForNurse(nurseId);
      res.json(summary);
    } catch (err: any) {
      console.error("[policies] portal list failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load policies" });
    }
  });

  // ─── Portal: acknowledge a policy ────────────────────────────────
  app.post("/api/portal/:token/policies/:id/acknowledge", validatePortalToken, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const policyId = String(req.params.id);

      const [policy] = await db.select().from(policies).where(eq(policies.id, policyId));
      if (!policy) return res.status(404).json({ message: "Policy not found" });
      if (!policy.isActive) return res.status(400).json({ message: "Policy is no longer active" });

      // Idempotent: if the nurse already acked this exact version, return
      // the existing row instead of inserting a duplicate.
      const [existing] = await db
        .select()
        .from(policyAcknowledgements)
        .where(and(
          eq(policyAcknowledgements.nurseId, nurseId),
          eq(policyAcknowledgements.policyId, policyId),
          eq(policyAcknowledgements.policyVersion, policy.version),
        ));
      if (existing) {
        return res.json({ ok: true, acknowledgement: existing, alreadyAcknowledged: true });
      }

      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
        || req.socket.remoteAddress
        || null;
      const userAgent = (req.headers["user-agent"] as string) || null;

      const [created] = await db
        .insert(policyAcknowledgements)
        .values({
          nurseId,
          policyId,
          policyVersion: policy.version,
          ipAddress,
          userAgent,
        })
        .returning();

      await logAction(nurseId, "portal", "policy_acknowledged", "nurse_portal", {
        policyId,
        title: policy.title,
        version: policy.version,
      });

      res.status(201).json({ ok: true, acknowledgement: created });
    } catch (err: any) {
      console.error("[policies] acknowledge failed:", err);
      res.status(500).json({ message: err?.message || "Failed to acknowledge policy" });
    }
  });
}
