// Assigned actions (task 212) — super-admin → nurse structured write-ups
// (reflections & witness statements) completed through the portal.
//
// Admin surface mounts under /api/admin/* so it inherits the global
// requireAdmin guard; assign + mark-reviewed additionally require
// super-admin. Portal surface uses validatePortalToken only — these are
// supervision actions, not onboarding data, so the onboarding gate does
// not apply (same reasoning as prerequisite writes).
//
// Every write is audited under the `assigned_actions` module:
//   assigned_action_assigned / assigned_action_email_sent /
//   assigned_action_email_failed / assigned_action_submitted /
//   assigned_action_reviewed
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireSuperAdmin, validatePortalToken, portalAgent } from "../middleware";
import { logAction } from "../services/audit";
import {
  ASSIGNED_ACTION_TYPE_LABELS,
  REFLECTION_FRAMEWORKS,
  WITNESS_STATEMENT_PROMPTS,
  getReflectionFramework,
  type AssignedActionPrompt,
  type NurseAssignedAction,
} from "@shared/schema";
import { sendAssignedActionEmail } from "../assigned-action-notifications";

function agentFor(req: Request): string {
  const u = req.session?.username;
  const r = req.session?.role;
  if (!u) return "system";
  return r ? `${u} (${r})` : u;
}

// Resolve the public base URL for the emailed portal link from trusted
// configuration ONLY — never from request headers (the URL carries a
// 30-day bearer token). Same env-var order as individual-agreements.
function resolvePortalBaseUrl(): string {
  const portalBaseUrl = process.env.PORTAL_BASE_URL;
  if (portalBaseUrl && portalBaseUrl.trim()) return portalBaseUrl.trim();
  const publicAppUrl = process.env.PUBLIC_APP_URL;
  if (publicAppUrl && publicAppUrl.trim()) return publicAppUrl.trim();
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain && devDomain.trim()) return `https://${devDomain.trim()}`;
  return "http://localhost:5000";
}

// Guided prompts the nurse answers on the completion page. Reflections use
// the chosen framework's stages; witness statements prepend the
// admin-supplied event details / points-to-address as context panels and
// use the standard factual-account structure.
export function buildAssignedActionPrompts(
  action: Pick<
    NurseAssignedAction,
    "type" | "framework" | "focusContext" | "eventDetails" | "pointsToAddress"
  >,
): AssignedActionPrompt[] {
  if (action.type === "reflection") {
    const fw = action.framework ? getReflectionFramework(action.framework) : undefined;
    if (fw) return [...fw.prompts];
    // Reflection without a framework — single free-form prompt.
    return [
      {
        key: "reflection",
        title: "Your reflection",
        prompt: "Write your reflection in your own words, covering what happened, what you learned, and what you will take forward.",
      },
    ];
  }
  return WITNESS_STATEMENT_PROMPTS.map((p) => ({ ...p }));
}

const assignSchema = z
  .object({
    type: z.enum(["reflection", "witness_statement"]),
    framework: z.enum(["gibbs", "kolb", "driscoll", "schon"]).nullish(),
    focusContext: z.string().max(2000).nullish(),
    eventDetails: z.string().max(4000).nullish(),
    pointsToAddress: z.string().max(4000).nullish(),
    instructions: z.string().max(4000).nullish(),
  })
  .superRefine((val, ctx) => {
    const clean = (s?: string | null) => (typeof s === "string" && s.trim() ? s.trim() : null);
    if (val.type === "witness_statement" && !clean(val.eventDetails)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eventDetails"],
        message: "Event details are required for a witness statement",
      });
    }
  });

const submitSchema = z.object({
  answers: z.record(z.string().max(20000)),
  honestyDeclarationAccepted: z.boolean().optional(),
  pasteAttempts: z.number().int().min(0).max(100000).optional(),
  keystrokeCount: z.number().int().min(0).max(1000000).optional(),
  maxBurstChars: z.number().int().min(0).max(100000).optional(),
});

export function registerAssignedActionRoutes(app: Express) {
  // ─── Admin: assign an action to a nurse (super-admin only) ────────
  app.post(
    "/api/admin/nurses/:id/assigned-actions",
    requireSuperAdmin,
    async (req: Request, res: Response) => {
      try {
        const nurse = await storage.getCandidate(String(req.params.id));
        if (!nurse) return res.status(404).json({ message: "Nurse not found" });

        const parsed = assignSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.issues[0]?.message || "Invalid assignment",
            issues: parsed.error.issues,
          });
        }
        const clean = (s?: string | null) =>
          typeof s === "string" && s.trim() ? s.trim() : null;
        const data = parsed.data;
        if (data.type !== "reflection") data.framework = null;
        const agent = agentFor(req);

        const action = await storage.createAssignedAction({
          nurseId: nurse.id,
          type: data.type,
          framework: data.type === "reflection" ? (data.framework ?? null) : null,
          focusContext: clean(data.focusContext),
          eventDetails: clean(data.eventDetails),
          pointsToAddress: clean(data.pointsToAddress),
          instructions: clean(data.instructions),
          status: "assigned",
          createdBy: agent,
        });

        await logAction(nurse.id, "assigned_actions", "assigned_action_assigned", agent, {
          actionId: action.id,
          type: action.type,
          framework: action.framework,
          hasFocus: !!action.focusContext,
          hasEventDetails: !!action.eventDetails,
        });

        // Best-effort email — a mail failure must not fail the assignment.
        let email: { sent: boolean; error?: string } = { sent: false };
        try {
          const result = await sendAssignedActionEmail({
            nurse,
            action,
            portalBaseUrl: resolvePortalBaseUrl(),
            sentBy: agent,
          });
          email = { sent: result.sent };
          await logAction(nurse.id, "assigned_actions", "assigned_action_email_sent", agent, {
            actionId: action.id,
            type: action.type,
            recipientEmail: nurse.email,
            // In test mode sending is suppressed — record that explicitly
            // so the audit row isn't mistaken for a real delivery.
            suppressed: !result.sent,
          });
        } catch (mailErr: any) {
          const msg = mailErr?.message || String(mailErr);
          console.error("[assigned-actions] assignment email failed:", msg);
          email = { sent: false, error: msg };
          await logAction(nurse.id, "assigned_actions", "assigned_action_email_failed", agent, {
            actionId: action.id,
            type: action.type,
            recipientEmail: nurse.email,
            error: msg,
          });
        }

        res.status(201).json({ action, email });
      } catch (err: any) {
        console.error("[assigned-actions.assign] error:", err?.message || err);
        res.status(500).json({ message: err?.message || "Failed to assign action" });
      }
    },
  );

  // ─── Admin: list actions for a nurse ───────────────────────────────
  app.get(
    "/api/admin/nurses/:id/assigned-actions",
    async (req: Request, res: Response) => {
      const nurse = await storage.getCandidate(String(req.params.id));
      if (!nurse) return res.status(404).json({ message: "Nurse not found" });
      const rows = await storage.listAssignedActionsByNurse(nurse.id);
      res.json(
        rows.map((a) => ({
          ...a,
          typeLabel: ASSIGNED_ACTION_TYPE_LABELS[a.type] || a.type,
          prompts: buildAssignedActionPrompts(a),
        })),
      );
    },
  );

  // ─── Admin: mark a submission as reviewed (super-admin only) ──────
  app.post(
    "/api/admin/assigned-actions/:id/review",
    requireSuperAdmin,
    async (req: Request, res: Response) => {
      const row = await storage.getAssignedAction(String(req.params.id));
      if (!row) return res.status(404).json({ message: "Assigned action not found" });
      if (row.status !== "submitted") {
        return res
          .status(400)
          .json({ message: "Only submitted actions can be marked as reviewed" });
      }
      const agent = agentFor(req);
      const updated = await storage.updateAssignedAction(row.id, {
        status: "reviewed",
        reviewedBy: agent,
        reviewedAt: new Date(),
      });
      await logAction(row.nurseId, "assigned_actions", "assigned_action_reviewed", agent, {
        actionId: row.id,
        type: row.type,
      });
      res.json(updated);
    },
  );

  // ─── Portal: list the nurse's own actions ──────────────────────────
  app.get(
    "/api/portal/:token/assigned-actions",
    validatePortalToken,
    async (req: Request, res: Response) => {
      const nurseId = (req as any).nurseId as string;
      const rows = await storage.listAssignedActionsByNurse(nurseId);
      res.json(
        rows.map((a) => ({
          id: a.id,
          type: a.type,
          typeLabel: ASSIGNED_ACTION_TYPE_LABELS[a.type] || a.type,
          framework: a.framework,
          focusContext: a.focusContext,
          eventDetails: a.eventDetails,
          pointsToAddress: a.pointsToAddress,
          instructions: a.instructions,
          status: a.status,
          createdAt: a.createdAt,
          submittedAt: a.submittedAt,
        })),
      );
    },
  );

  // ─── Portal: fetch one action with its guided prompts ─────────────
  app.get(
    "/api/portal/:token/assigned-actions/:id",
    validatePortalToken,
    async (req: Request, res: Response) => {
      const nurseId = (req as any).nurseId as string;
      const row = await storage.getAssignedAction(String(req.params.id));
      if (!row || row.nurseId !== nurseId) {
        return res.status(404).json({ message: "Assigned action not found" });
      }
      // First open flips assigned → in_progress so the admin can tell the
      // nurse has at least seen it. Not audited — too noisy.
      if (row.status === "assigned") {
        const started = await storage.updateAssignedAction(row.id, {
          status: "in_progress",
          startedAt: new Date(),
        });
        if (started) row.status = started.status;
      }
      res.json({
        id: row.id,
        type: row.type,
        typeLabel: ASSIGNED_ACTION_TYPE_LABELS[row.type] || row.type,
        framework: row.framework,
        frameworkLabel: row.framework
          ? getReflectionFramework(row.framework)?.label ?? null
          : null,
        focusContext: row.focusContext,
        eventDetails: row.eventDetails,
        pointsToAddress: row.pointsToAddress,
        instructions: row.instructions,
        status: row.status,
        prompts: buildAssignedActionPrompts(row),
        createdAt: row.createdAt,
        submittedAt: row.submittedAt,
      });
    },
  );

  // ─── Portal: submit the completed write-up ─────────────────────────
  app.post(
    "/api/portal/:token/assigned-actions/:id/submit",
    validatePortalToken,
    async (req: Request, res: Response) => {
      try {
        const nurseId = (req as any).nurseId as string;
        const row = await storage.getAssignedAction(String(req.params.id));
        if (!row || row.nurseId !== nurseId) {
          return res.status(404).json({ message: "Assigned action not found" });
        }
        if (row.status === "submitted" || row.status === "reviewed") {
          return res.status(400).json({ message: "This action has already been submitted" });
        }

        const parsed = submitSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.issues[0]?.message || "Invalid submission",
            issues: parsed.error.issues,
          });
        }
        const body = parsed.data;

        // Every guided prompt must have a non-empty answer.
        const prompts = buildAssignedActionPrompts(row);
        const answers: Record<string, string> = {};
        for (const p of prompts) {
          const raw = body.answers?.[p.key];
          const trimmed = typeof raw === "string" ? raw.trim() : "";
          if (!trimmed) {
            return res
              .status(400)
              .json({ message: `Please answer every section before submitting (missing: ${p.title})` });
          }
          answers[p.key] = trimmed;
        }

        // Witness statements carry a mandatory honesty declaration.
        if (row.type === "witness_statement" && body.honestyDeclarationAccepted !== true) {
          return res
            .status(400)
            .json({ message: "You must confirm the honesty declaration before submitting" });
        }

        const updated = await storage.updateAssignedAction(row.id, {
          status: "submitted",
          response: { answers },
          honestyDeclarationAccepted:
            row.type === "witness_statement" ? true : body.honestyDeclarationAccepted === true,
          pasteAttempts: body.pasteAttempts ?? 0,
          keystrokeCount: body.keystrokeCount ?? 0,
          maxBurstChars: body.maxBurstChars ?? 0,
          submittedAt: new Date(),
        });

        await logAction(nurseId, "assigned_actions", "assigned_action_submitted", portalAgent(req), {
          actionId: row.id,
          type: row.type,
          framework: row.framework,
          pasteAttempts: body.pasteAttempts ?? 0,
          keystrokeCount: body.keystrokeCount ?? 0,
          maxBurstChars: body.maxBurstChars ?? 0,
        });

        res.json(updated);
      } catch (err: any) {
        console.error("[assigned-actions.submit] error:", err?.message || err);
        res.status(500).json({ message: err?.message || "Failed to submit" });
      }
    },
  );
}
