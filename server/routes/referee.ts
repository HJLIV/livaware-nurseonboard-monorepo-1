import type { Express, Request } from "express";
import { storage } from "../storage";
import { refereeLimiter } from "../middleware";

function param(req: Request, name: string): string {
  return req.params[name] as string;
}

export function registerRefereeRoutes(app: Express) {
  app.get("/api/referee/:token", refereeLimiter, async (req, res) => {
    try {
      const refereeTokenRecord = await storage.getRefereeTokenByToken(param(req, "token"));
      if (!refereeTokenRecord) return res.status(404).json({ message: "Reference form not found" });
      if (refereeTokenRecord.completedAt) return res.status(410).json({ message: "This reference form has already been completed" });
      if (new Date() > refereeTokenRecord.expiresAt) return res.status(410).json({ message: "This reference link has expired" });

      const reference = await storage.getReference(refereeTokenRecord.referenceId);
      if (!reference) return res.status(404).json({ message: "Reference not found" });

      const candidate = await storage.getCandidate(refereeTokenRecord.nurseId);
      if (!candidate) return res.status(404).json({ message: "Candidate not found" });

      res.json({
        refereeName: reference.refereeName,
        refereeEmail: reference.refereeEmail,
        candidateName: candidate.fullName,
        candidateBand: candidate.band,
        refereeOrg: reference.refereeOrg,
        refereeRole: reference.refereeRole,
        completed: !!refereeTokenRecord.completedAt,
      });
    } catch (err: any) {
      console.error("[Referee Form Load] Error:", err.message);
      res.status(500).json({ message: "Failed to load reference form" });
    }
  });

  app.post("/api/referee/:token/submit", refereeLimiter, async (req, res) => {
    try {
      const refereeTokenRecord = await storage.getRefereeTokenByToken(param(req, "token"));
      if (!refereeTokenRecord) return res.status(404).json({ message: "Reference form not found" });
      if (refereeTokenRecord.completedAt) return res.status(410).json({ message: "This reference form has already been completed" });
      if (new Date() > refereeTokenRecord.expiresAt) return res.status(410).json({ message: "This reference link has expired" });

      const { ratings, freeTextResponses, conductFlags, sicknessAbsenceBand, competencyRatings } = req.body;

      const redFlagTriggered = !!(
        (conductFlags?.conduct_concerns === true) ||
        (freeTextResponses?.reemploy === false) ||
        (sicknessAbsenceBand === "Concerns — frequent or prolonged absences")
      );

      await storage.updateReference(refereeTokenRecord.referenceId, {
        ratings: { ...ratings, competencies: competencyRatings },
        freeTextResponses,
        conductFlags,
        sicknessAbsenceBand,
        redFlagTriggered,
        outcome: redFlagTriggered ? "flagged" : "received",
        formSubmittedAt: new Date(),
      } as any);

      await storage.markRefereeTokenCompleted(refereeTokenRecord.id);

      await storage.createAuditLog({
        nurseId: refereeTokenRecord.nurseId,
        action: "reference_form_submitted",
        agentName: "referee",
        detail: { referenceId: refereeTokenRecord.referenceId, redFlagTriggered },
      });

      res.json({ success: true, message: "Reference form submitted successfully" });
    } catch (err: any) {
      console.error("[Referee Form Submit] Error:", err.message);
      res.status(500).json({ message: "Failed to submit reference form" });
    }
  });
}
