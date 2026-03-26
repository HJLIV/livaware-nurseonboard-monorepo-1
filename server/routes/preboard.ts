import type { Express } from "express";
import { storage } from "../preboard-storage";
import { insertAssessmentSchema, assessmentResponseSchema, portalLinks, nurses } from "@shared/schema";
import { analyzeAssessment } from "../preboard-ai";
import { sendEmail } from "../preboard-outlook";
import { buildEmailHtml } from "../preboard-email-template";
import { generatePdfReport } from "../preboard-pdf-report";
import { logAction } from "../services/audit";
import { db } from "../db";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";

const RECIPIENT_EMAIL = process.env.REPORT_EMAIL || "";

const submitSchema = z.object({
  nurseName: z.string().min(2, "Name must be at least 2 characters"),
  nurseEmail: z.string().email("Invalid email address"),
  nursePhone: z.string().nullable().optional(),
  responses: z.array(assessmentResponseSchema).min(1, "At least one response required"),
  portalToken: z.string().optional(),
});

export async function registerRoutes(
  app: Express
): Promise<void> {

  app.get("/api/preboard/assessments", async (req, res) => {
    if (!req.session?.isAuthenticated) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const all = await storage.getAllAssessments();
      res.json(all);
    } catch (err) {
      console.error("Error fetching assessments:", err);
      res.status(500).json({ error: "Failed to fetch assessments" });
    }
  });

  app.get("/api/preboard/assessments/by-nurse/:nurseId", async (req, res) => {
    if (!req.session?.isAuthenticated) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const assessment = await storage.getAssessmentByNurseId(req.params.nurseId);
      if (!assessment) {
        return res.status(404).json({ message: "No assessment found" });
      }
      res.json(assessment);
    } catch (err) {
      console.error("Error fetching assessment by nurse ID:", err);
      res.status(500).json({ error: "Failed to fetch assessment" });
    }
  });

  app.post("/api/assessments", async (req, res) => {
    try {
      const parsed = submitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.issues });
      }

      let nurseId: string | null = null;
      if (parsed.data.portalToken) {
        try {
          const [link] = await db.select().from(portalLinks).where(
            and(eq(portalLinks.token, parsed.data.portalToken), gt(portalLinks.expiresAt, new Date()))
          );
          if (link) {
            nurseId = link.nurseId;
          }
        } catch (linkErr) {
          console.error("Failed to look up portal token:", linkErr);
        }
      }

      const assessmentData = nurseId
        ? { ...parsed.data, nurseId }
        : parsed.data;
      const assessment = await storage.createAssessment(assessmentData);

      if (nurseId) {
        try {
          await logAction(nurseId, "preboard", "assessment_submitted", parsed.data.nurseName, {
            assessmentId: assessment.id,
          });
        } catch (auditErr) {
          console.error("Failed to log assessment audit:", auditErr);
        }
      }

      res.json({ id: assessment.id, status: "received" });

      (async () => {
        try {
          const analysis = await analyzeAssessment(
            assessment.nurseName,
            parsed.data.responses
          );
          const updated = await storage.updateAssessmentAnalysis(assessment.id, analysis);

          if (updated && RECIPIENT_EMAIL) {
            try {
              const html = buildEmailHtml(updated);
              let attachments: { name: string; contentType: string; contentBytes: string }[] | undefined;

              try {
                const pdfBuffer = await generatePdfReport(updated);
                const safeName = updated.nurseName.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_");
                attachments = [{
                  name: `Livaware_Assessment_${safeName}.pdf`,
                  contentType: "application/pdf",
                  contentBytes: pdfBuffer.toString("base64"),
                }];
                console.log(`PDF generated for assessment ${assessment.id} (${(pdfBuffer.length / 1024).toFixed(1)}KB)`);
              } catch (pdfErr) {
                console.error(`PDF generation failed for assessment ${assessment.id}, sending email without attachment:`, pdfErr);
              }

              await sendEmail(
                RECIPIENT_EMAIL,
                `NURSE PREBOARDING ANSWER - ${updated.nurseName}`,
                html,
                attachments
              );
              await storage.markEmailSent(assessment.id);
              console.log(`Email sent for assessment ${assessment.id}`);
            } catch (emailErr) {
              console.error(`Failed to send email for assessment ${assessment.id}:`, emailErr);
            }
          }
        } catch (aiErr) {
          console.error(`Failed to analyze assessment ${assessment.id}:`, aiErr);
        }
      })();

    } catch (err) {
      console.error("Error creating assessment:", err);
      res.status(500).json({ error: "Failed to submit assessment" });
    }
  });
}
