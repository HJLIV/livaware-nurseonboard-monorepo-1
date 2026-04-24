import PDFDocument from "pdfkit";
import { storage } from "./storage";
import type {
  Candidate, NmcVerification, DbsVerification, CompetencyDeclaration,
  Document as DocType, Reference, MandatoryTraining, HealthDeclaration,
  ProfessionalIndemnity, EmploymentHistory, EducationHistory,
} from "@shared/schema";
import { MANDATORY_TRAINING_MODULES, COMPETENCY_MATRIX } from "@shared/schema";

function parseNextOfKinServer(value: string | null | undefined): { name: string; relationship: string; contactNumber: string } {
  if (!value) return { name: "", relationship: "", contactNumber: "" };
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { name: parsed.name || "", relationship: parsed.relationship || "", contactNumber: parsed.contactNumber || "" };
    }
  } catch {}
  return { name: value, relationship: "", contactNumber: "" };
}

const NAVY = "#020121";
const GOLD = "#C8A96E";
const DARK_GREY = "#333333";
const MED_GREY = "#666666";
const LIGHT_GREY = "#999999";
const BG_LIGHT = "#F5F5F0";

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function levelLabel(level: string): string {
  const map: Record<string, string> = {
    not_declared: "Not Declared",
    level_1: "Level 1 – Novice",
    level_2: "Level 2 – Competent",
    level_3: "Level 3 – Proficient",
    level_4: "Level 4 – Expert",
  };
  return map[level] || level;
}

export async function generateCandidatePDF(candidateId: string): Promise<Buffer> {
  const candidate = await storage.getCandidate(candidateId);
  if (!candidate) throw new Error("Candidate not found");

  const [
    nmcVerification, dbsVerification, competencies, documents,
    refs, training, healthDeclaration, indemnity,
    employmentHistory, educationHistory,
  ] = await Promise.all([
    storage.getNmcVerification(candidateId),
    storage.getDbsVerification(candidateId),
    storage.getCompetencyDeclarations(candidateId),
    storage.getDocuments(candidateId),
    storage.getReferences(candidateId),
    storage.getMandatoryTraining(candidateId),
    storage.getHealthDeclaration(candidateId),
    storage.getProfessionalIndemnity(candidateId),
    storage.getEmploymentHistory(candidateId),
    storage.getEducationHistory(candidateId),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Onboarding Report – ${candidate.fullName}`,
        Author: "Livaware Ltd – NurseOnboard",
        Subject: "CQC Regulation 19 / Schedule 3 Compliance Report",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftMargin = doc.page.margins.left;

    function sectionHeader(title: string) {
      ensureSpace(40);
      doc.moveDown(0.8);
      doc.x = leftMargin;
      doc.fillColor(NAVY).fontSize(14).font("Helvetica-Bold").text(title.toUpperCase(), leftMargin, doc.y, { width: pageWidth });
      doc.moveTo(leftMargin, doc.y + 2).lineTo(leftMargin + pageWidth, doc.y + 2).strokeColor(GOLD).lineWidth(1.5).stroke();
      doc.moveDown(0.5);
    }

    function fieldRow(label: string, value: string | null | undefined, indent = 0) {
      ensureSpace(16);
      const labelWidth = 150;
      const xStart = leftMargin + indent;
      const yPos = doc.y;
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica")
        .text(label + ":", xStart, yPos, { width: labelWidth, lineBreak: false });
      doc.fillColor(DARK_GREY).fontSize(9).font("Helvetica-Bold")
        .text(value || "—", xStart + labelWidth, yPos, { width: pageWidth - labelWidth - indent });
    }

    function ensureSpace(needed: number) {
      if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 30) {
        doc.addPage();
        doc.x = leftMargin;
        doc.y = doc.page.margins.top;
        addFooter();
      }
    }

    function addFooter() {
      const savedX = doc.x;
      const savedY = doc.y;
      const bottom = doc.page.height - 30;
      doc.save();
      doc.fillColor(LIGHT_GREY).fontSize(7).font("Helvetica")
        .text("Livaware Ltd — NurseOnboard | CQC Regulation 19 / Schedule 3 Compliance Report | CONFIDENTIAL", 50, bottom, { align: "center", width: pageWidth, lineBreak: false });
      doc.restore();
      doc.x = savedX;
      doc.y = savedY;
    }

    // ===== COVER HEADER =====
    doc.rect(0, 0, doc.page.width, 120).fill(NAVY);
    doc.fillColor("#FFFFFF").fontSize(22).font("Helvetica-Bold")
      .text("ONBOARDING COMPLIANCE REPORT", 50, 35, { width: pageWidth });
    doc.fillColor(GOLD).fontSize(11).font("Helvetica")
      .text("Livaware Ltd — CQC Regulation 19 / Schedule 3", 50, 65, { width: pageWidth });
    doc.fillColor("#CCCCCC").fontSize(9)
      .text(`Generated: ${formatDate(new Date())}  |  CONFIDENTIAL`, 50, 85, { width: pageWidth });

    doc.y = 140;
    addFooter();

    // ===== 1. CANDIDATE IDENTITY =====
    sectionHeader("1. Candidate Identity & Contact");
    fieldRow("Full Name", candidate.fullName);
    fieldRow("Email", candidate.email);
    fieldRow("Phone", candidate.phone);
    fieldRow("Date of Birth", formatDate(candidate.dateOfBirth));
    fieldRow("Address", candidate.address);
    fieldRow("Pronouns", candidate.preferredPronouns);
    const nokData = parseNextOfKinServer(candidate.nextOfKin);
    fieldRow("Next of Kin — Name", nokData.name || null);
    fieldRow("Next of Kin — Relationship", nokData.relationship || null);
    fieldRow("Next of Kin — Contact", nokData.contactNumber || null);
    fieldRow("Passport Number", candidate.passportNumber);
    fieldRow("Onboarding Status", statusLabel(candidate.status));

    // ===== 2. NMC VERIFICATION =====
    sectionHeader("2. NMC PIN Verification");
    if (nmcVerification) {
      fieldRow("NMC PIN", nmcVerification.pin);
      fieldRow("Registered Name", nmcVerification.registeredName);
      fieldRow("Registration Status", nmcVerification.registrationStatus);
      fieldRow("Field of Practice", nmcVerification.fieldOfPractice);
      fieldRow("Effective Date", formatDate(nmcVerification.effectiveDate));
      fieldRow("Renewal Date", formatDate(nmcVerification.renewalDate));
      fieldRow("Verification Status", statusLabel(nmcVerification.status));
      if (nmcVerification.conditions && nmcVerification.conditions.length > 0) {
        fieldRow("Conditions", nmcVerification.conditions.join("; "));
      }
    } else {
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica-Oblique").text("No NMC verification on record.");
    }

    // ===== 3. DBS VERIFICATION =====
    sectionHeader("3. DBS Verification");
    if (dbsVerification) {
      fieldRow("Certificate Number", dbsVerification.certificateNumber);
      fieldRow("Issue Date", formatDate(dbsVerification.issueDate));
      fieldRow("Certificate Type", dbsVerification.certificateType);
      fieldRow("Update Service", dbsVerification.updateServiceSubscribed ? "Yes" : "No");
      fieldRow("Check Result", dbsVerification.checkResult);
      fieldRow("Verification Status", statusLabel(dbsVerification.status));
    } else {
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica-Oblique").text("No DBS verification on record.");
    }

    // ===== 4. PROFESSIONAL PROFILE =====
    sectionHeader("4. Professional Profile");
    fieldRow("Current Employer", candidate.currentEmployer);
    fieldRow("Band", candidate.band ? `Band ${candidate.band}` : null);
    fieldRow("Years Qualified", candidate.yearsQualified?.toString());
    fieldRow("Clinical Specialisms", candidate.specialisms?.join(", "));

    // ===== 5. EMPLOYMENT HISTORY =====
    sectionHeader("5. Employment History");
    if (employmentHistory.length === 0) {
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica-Oblique").text("No employment history recorded.");
    } else {
      employmentHistory.forEach((entry, i) => {
        ensureSpace(50);
        doc.fillColor(DARK_GREY).fontSize(10).font("Helvetica-Bold")
          .text(`${i + 1}. ${entry.jobTitle} — ${entry.employer}`);
        if (entry.department) fieldRow("Department", entry.department, 15);
        fieldRow("Period", `${formatDate(entry.startDate)} — ${entry.isCurrent ? "Present" : formatDate(entry.endDate)}`, 15);
        if (entry.reasonForLeaving) fieldRow("Reason for Leaving", entry.reasonForLeaving, 15);
        if (entry.duties) fieldRow("Key Duties", entry.duties, 15);
        doc.moveDown(0.3);
      });
    }

    // ===== 6. EDUCATION HISTORY =====
    sectionHeader("6. Education & Qualifications");
    if (educationHistory.length === 0) {
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica-Oblique").text("No education history recorded.");
    } else {
      educationHistory.forEach((entry, i) => {
        ensureSpace(40);
        doc.fillColor(DARK_GREY).fontSize(10).font("Helvetica-Bold")
          .text(`${i + 1}. ${entry.qualification}${entry.subject ? ` — ${entry.subject}` : ""}`);
        fieldRow("Institution", entry.institution, 15);
        fieldRow("Period", `${formatDate(entry.startDate)} — ${formatDate(entry.endDate)}`, 15);
        if (entry.grade) fieldRow("Grade", entry.grade, 15);
        doc.moveDown(0.3);
      });
    }

    // ===== 7. MANDATORY TRAINING =====
    sectionHeader("7. Mandatory Training");
    const completedModules = training.filter(t => t.completedDate);
    doc.fillColor(DARK_GREY).fontSize(9).font("Helvetica")
      .text(`${completedModules.length} of ${MANDATORY_TRAINING_MODULES.length} modules completed.`);
    doc.moveDown(0.3);

    MANDATORY_TRAINING_MODULES.forEach((mod) => {
      ensureSpace(16);
      const record = training.find(t => t.moduleName === mod.name);
      const tick = record?.completedDate ? "✓" : "✗";
      const tickColor = record?.completedDate ? "#22C55E" : "#EF4444";
      const suffix = record?.completedDate
        ? `  (Completed: ${formatDate(record.completedDate)}, Expires: ${formatDate(record.expiryDate)})`
        : `  (${mod.renewalFrequency} renewal)`;
      const yPos = doc.y;
      doc.fillColor(tickColor).fontSize(9).font("Helvetica-Bold").text(tick, leftMargin, yPos, { width: 12, lineBreak: false });
      doc.fillColor(DARK_GREY).fontSize(9).font("Helvetica").text(mod.name, leftMargin + 14, yPos, { width: 220, lineBreak: false });
      doc.fillColor(MED_GREY).fontSize(8).font("Helvetica").text(suffix, leftMargin + 240, yPos, { width: pageWidth - 240 });
    });

    // ===== 8. CLINICAL COMPETENCY =====
    sectionHeader("8. Clinical Competency Self-Assessment");
    if (competencies.length === 0) {
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica-Oblique").text("No competency declarations on record.");
    } else {
      const domains = Array.from(new Set(competencies.map(c => c.domain)));
      domains.forEach((domain) => {
        ensureSpace(25);
        doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text(domain, leftMargin, doc.y, { width: pageWidth });
        const domainComps = competencies.filter(c => c.domain === domain);
        domainComps.forEach((comp) => {
          ensureSpace(14);
          const yPos = doc.y;
          doc.fillColor(DARK_GREY).fontSize(8).font("Helvetica")
            .text(`  • ${comp.competencyName}:`, leftMargin, yPos, { width: 300, lineBreak: false });
          doc.fillColor(DARK_GREY).fontSize(8).font("Helvetica-Bold")
            .text(levelLabel(comp.selfAssessedLevel), leftMargin + 300, yPos, { width: pageWidth - 300 });
        });
        doc.moveDown(0.3);
      });
    }

    // ===== 9. HEALTH DECLARATION =====
    sectionHeader("9. Health Declaration");
    if (healthDeclaration) {
      fieldRow("Hepatitis B Vaccinated", healthDeclaration.hepatitisBVaccinated ? "Yes" : "No");
      fieldRow("MMR Vaccinated", healthDeclaration.mmrVaccinated ? "Yes" : "No");
      fieldRow("Varicella Vaccinated", healthDeclaration.varicellaVaccinated ? "Yes" : "No");
      fieldRow("TB Screened", healthDeclaration.tbScreened ? "Yes" : "No");
      fieldRow("Conditions Affecting Practice", healthDeclaration.conditionsAffectingPractice || "None declared");
      fieldRow("OH Referral Required", healthDeclaration.ohReferralRequired ? "Yes" : "No");
      fieldRow("Declaration Completed", healthDeclaration.completed ? "Yes" : "No");
      fieldRow("Declared At", formatDate(healthDeclaration.declaredAt));
      if (healthDeclaration.aiTriageStatus) {
        fieldRow("AI Triage Status", statusLabel(healthDeclaration.aiTriageStatus));
        if (healthDeclaration.aiTriageNote) fieldRow("AI Triage Note", healthDeclaration.aiTriageNote);
      }
    } else {
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica-Oblique").text("No health declaration on record.");
    }

    // ===== 10. REFERENCES =====
    sectionHeader("10. References");
    if (refs.length === 0) {
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica-Oblique").text("No references on record.");
    } else {
      refs.forEach((ref, i) => {
        ensureSpace(60);
        doc.fillColor(DARK_GREY).fontSize(10).font("Helvetica-Bold")
          .text(`Referee ${i + 1}: ${ref.refereeName}`, leftMargin, doc.y, { width: pageWidth });
        fieldRow("Organisation", ref.refereeOrg, 15);
        fieldRow("Role", ref.refereeRole, 15);
        fieldRow("Relationship", ref.relationshipToCandidate, 15);
        fieldRow("Outcome", statusLabel(ref.outcome), 15);
        fieldRow("Red Flag", ref.redFlagTriggered ? "⚠ YES — FLAGGED" : "No", 15);
        if (ref.formSubmittedAt) fieldRow("Form Submitted", formatDate(ref.formSubmittedAt), 15);
        if (ref.sicknessAbsenceBand) fieldRow("Sickness Absence Band", ref.sicknessAbsenceBand, 15);

        if (ref.ratings) {
          const ratings = ref.ratings as Record<string, number>;
          const ratingKeys = Object.keys(ratings);
          if (ratingKeys.length > 0) {
            ensureSpace(14);
            doc.fillColor(MED_GREY).fontSize(8).font("Helvetica")
              .text("Ratings: " + ratingKeys.map(k => `${k.replace(/_/g, " ")}: ${ratings[k]}/5`).join("  |  "), leftMargin + 15, doc.y, { width: pageWidth - 15 });
          }
        }

        if (ref.freeTextResponses) {
          const ftr = ref.freeTextResponses as Record<string, string>;
          Object.entries(ftr).forEach(([key, val]) => {
            if (val && typeof val === "string") {
              fieldRow(key.replace(/_/g, " "), val, 15);
            }
          });
        }

        doc.moveDown(0.3);
      });
    }

    // ===== 11. PROFESSIONAL INDEMNITY =====
    sectionHeader("11. Professional Indemnity Insurance");
    if (indemnity) {
      fieldRow("Provider", indemnity.provider);
      fieldRow("Policy Number", indemnity.policyNumber);
      fieldRow("Cover Start", formatDate(indemnity.coverStartDate));
      fieldRow("Cover End", formatDate(indemnity.coverEndDate));
      fieldRow("Scope Appropriate", indemnity.scopeAppropriate ? "Yes" : "No");
      fieldRow("Verified", indemnity.verified ? "Yes" : "No");
    } else {
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica-Oblique").text("No professional indemnity on record.");
    }

    // ===== 12. UPLOADED DOCUMENTS =====
    sectionHeader("12. Document Register");
    if (documents.length === 0) {
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica-Oblique").text("No documents uploaded.", leftMargin, doc.y, { width: pageWidth });
    } else {
      const colWidths = [pageWidth * 0.35, pageWidth * 0.2, pageWidth * 0.2, pageWidth * 0.25];
      const colX = [
        leftMargin,
        leftMargin + colWidths[0],
        leftMargin + colWidths[0] + colWidths[1],
        leftMargin + colWidths[0] + colWidths[1] + colWidths[2],
      ];
      const headers = ["Document", "Category", "Uploaded", "AI Check"];

      ensureSpace(20);
      const headerY = doc.y;
      headers.forEach((h, i) => {
        doc.fillColor(NAVY).fontSize(8).font("Helvetica-Bold").text(h, colX[i], headerY, { width: colWidths[i], lineBreak: false });
      });
      doc.y = headerY + 14;

      documents.forEach((d) => {
        ensureSpace(20);
        const rowY = doc.y;
        const displayName = (d.originalFilename || d.filename).length > 35
          ? (d.originalFilename || d.filename).slice(0, 32) + "..."
          : (d.originalFilename || d.filename);
        doc.fillColor(DARK_GREY).fontSize(8).font("Helvetica")
          .text(displayName, colX[0], rowY, { width: colWidths[0], lineBreak: false });
        doc.text(d.category || "—", colX[1], rowY, { width: colWidths[1], lineBreak: false });
        doc.text(formatDate(d.uploadedAt), colX[2], rowY, { width: colWidths[2], lineBreak: false });
        const aiLabel = d.aiStatus === "pass" ? "✓ Pass" : d.aiStatus === "warning" ? "⚠ Warning" : d.aiStatus === "fail" ? "✗ Fail" : "—";
        doc.text(aiLabel, colX[3], rowY, { width: colWidths[3], lineBreak: false });
        doc.y = rowY + 14;
      });
    }

    // ===== SIGN-OFF =====
    ensureSpace(80);
    doc.moveDown(1.5);
    doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).strokeColor(GOLD).lineWidth(1).stroke();
    doc.moveDown(0.5);
    doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("COMPLIANCE SIGN-OFF", leftMargin, doc.y, { width: pageWidth });
    doc.moveDown(0.4);
    doc.fillColor(DARK_GREY).fontSize(9).font("Helvetica")
      .text("Reviewed by: ________________________________     Date: _______________", leftMargin, doc.y, { width: pageWidth });
    doc.moveDown(0.3);
    doc.text("Signature:    ________________________________     Role: _______________", leftMargin, doc.y, { width: pageWidth });
    doc.moveDown(0.5);
    doc.fillColor(LIGHT_GREY).fontSize(7).font("Helvetica-Oblique")
      .text("This report has been generated by NurseOnboard for Livaware Ltd. All information is subject to verification. " +
        "This document is confidential and intended for CQC Regulation 19 / Schedule 3 compliance purposes only.", leftMargin, doc.y, { width: pageWidth });

    doc.end();
  });
}
