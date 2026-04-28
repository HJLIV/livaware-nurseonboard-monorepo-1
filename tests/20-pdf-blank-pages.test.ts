import { describe, it, expect, vi } from "vitest";
import type {
  Candidate,
  NmcVerification,
  DbsVerification,
  CompetencyDeclaration,
  Document as DocType,
  Reference,
  MandatoryTraining,
  HealthDeclaration,
  ProfessionalIndemnity,
  EmploymentHistory,
  EducationHistory,
  Assessment,
  AssessmentResponse,
} from "@shared/schema";
import { MANDATORY_TRAINING_MODULES, COMPETENCY_MATRIX } from "@shared/schema";

// ---------------------------------------------------------------------------
// Mock the storage module BEFORE importing the candidate PDF generator.
// This lets us drive the generator with deterministic, realistic large data
// without needing a database.
// ---------------------------------------------------------------------------

const mockData = vi.hoisted(() => ({ store: null as null | Record<string, unknown> }));

vi.mock("../server/storage", () => ({
  storage: {
    getCandidate: vi.fn(async () => mockData.store!.candidate),
    getNmcVerification: vi.fn(async () => mockData.store!.nmcVerification),
    getDbsVerification: vi.fn(async () => mockData.store!.dbsVerification),
    getCompetencyDeclarations: vi.fn(async () => mockData.store!.competencies),
    getDocuments: vi.fn(async () => mockData.store!.documents),
    getReferences: vi.fn(async () => mockData.store!.references),
    getMandatoryTraining: vi.fn(async () => mockData.store!.training),
    getHealthDeclaration: vi.fn(async () => mockData.store!.healthDeclaration),
    getProfessionalIndemnity: vi.fn(async () => mockData.store!.indemnity),
    getEmploymentHistory: vi.fn(async () => mockData.store!.employmentHistory),
    getEducationHistory: vi.fn(async () => mockData.store!.educationHistory),
  },
}));

// Imports of modules under test must come AFTER the vi.mock() call above so
// the mocked storage is what they see.
const { generateCandidatePDF } = await import("../server/pdf-generator");
const { generatePdfReport } = await import("../server/preboard-pdf-report");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CANDIDATE_FOOTER =
  "Livaware Ltd — NurseOnboard | CQC Regulation 19 / Schedule 3 Compliance Report | CONFIDENTIAL";

/**
 * Extract the visible text content of every page of a PDF buffer using
 * pdfjs-dist. Returns one string per page.
 */
async function extractTextPerPage(buffer: Buffer): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string }>;
    pages.push(items.map((it) => it.str).join(""));
  }
  return pages;
}

/**
 * Strip page-chrome (page number footer, fixed footer text, whitespace) from a
 * page's extracted text so we can decide whether it is "blank" — i.e. only
 * contains the footer and nothing else.
 */
function stripChrome(text: string): string {
  return text
    .replaceAll(CANDIDATE_FOOTER, "")
    // Page number footer styles we render: "1 / 3", "1/3", "Page 1 of 3", or
    // a bare page number.
    .replace(/Page\s+\d+\s+of\s+\d+/gi, "")
    .replace(/\b\d+\s*\/\s*\d+\b/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Assert no page in the rendered PDF is blank or only contains the page-number
 * footer. Throws a clear, actionable error naming the offending page numbers.
 */
function expectNoBlankPages(label: string, pages: string[]) {
  const blanks: number[] = [];
  pages.forEach((text, idx) => {
    if (stripChrome(text).length < 5) {
      blanks.push(idx + 1);
    }
  });

  if (blanks.length > 0) {
    const previews = pages
      .map(
        (text, idx) =>
          `  page ${idx + 1}${blanks.includes(idx + 1) ? " [BLANK]" : ""}: "${text
            .slice(0, 160)
            .replace(/\s+/g, " ")}"`
      )
      .join("\n");
    throw new Error(
      `${label}: ${blanks.length} blank page(s) detected (${blanks.join(", ")}) ` +
        `out of ${pages.length}. A blank page contains only the footer or page number.\n${previews}`
    );
  }
}

// ---------------------------------------------------------------------------
// Realistic large fixtures
// ---------------------------------------------------------------------------

function buildLargeCandidateFixture() {
  const candidate: Candidate = {
    id: "test-candidate-id",
    fullName: "Test Candidate Long Name For Compliance Report",
    email: "test.candidate@example.com",
    phone: "07700900123",
    dateOfBirth: "1985-06-15",
    address: "123 Long Street Name, Camden, London, NW1 4PQ, United Kingdom",
    preferredPronouns: "she/her",
    nextOfKin: JSON.stringify({
      name: "Spouse Name",
      relationship: "Partner",
      contactNumber: "07700900456",
    }),
    passportNumber: "P12345678",
    status: "in_progress",
    currentEmployer: "St. Mary's Hospital NHS Foundation Trust",
    band: "6",
    yearsQualified: 8,
    specialisms: ["Palliative Care", "Oncology", "Community Nursing", "End of Life Care"],
    portalToken: null,
    portalTokenExpiresAt: null,
    sharepointFolderId: null,
    sharepointFolderUrl: null,
    onboardingStartedAt: new Date(),
    onboardingCompletedAt: null,
    stage: "onboard",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Candidate;

  const nmcVerification: NmcVerification = {
    id: "nmc-1",
    nurseId: candidate.id,
    pin: "85A1234B",
    registeredName: "Test Candidate Long Name For Compliance Report",
    registrationStatus: "Registered (No conditions)",
    fieldOfPractice: "Adult Nursing, Community Specialist Practitioner — District Nursing",
    conditions: [],
    effectiveDate: "2018-09-01",
    renewalDate: "2027-09-30",
    status: "verified",
    verifiedAt: new Date(),
    rawResponse: null,
    createdAt: new Date(),
  } as NmcVerification;

  const dbsVerification: DbsVerification = {
    id: "dbs-1",
    nurseId: candidate.id,
    certificateNumber: "001234567890",
    issueDate: "2024-03-12",
    certificateType: "Enhanced with Adult & Child Barred Lists",
    updateServiceSubscribed: true,
    checkResult: "Clear",
    status: "verified",
    verifiedAt: new Date(),
    createdAt: new Date(),
  } as DbsVerification;

  // 15 employment entries with rich detail to push the section over multiple pages.
  const employmentHistory: EmploymentHistory[] = Array.from({ length: 15 }, (_, i) => ({
    id: `emp-${i}`,
    nurseId: candidate.id,
    employer: `Employer ${i + 1} NHS Foundation Trust — Long Name For Layout Stress`,
    jobTitle: `Staff Nurse — Band ${5 + (i % 3)}`,
    department: `Ward ${i + 1} (Acute Medical Admissions and Step-Down Care Unit)`,
    startDate: `${2010 + i}-01-15`,
    endDate: i === 14 ? null : `${2011 + i}-01-14`,
    isCurrent: i === 14,
    reasonForLeaving: i === 14 ? null : "Career progression and relocation to a larger trust.",
    duties:
      "Delivered direct patient care across acute medical wards, including administration of " +
      "intravenous medications, wound care, end-of-life care, escalation under NEWS2, and " +
      "mentorship of junior staff and student nurses on placement.",
    createdAt: new Date(),
  })) as EmploymentHistory[];

  // 10 education entries.
  const educationHistory: EducationHistory[] = Array.from({ length: 10 }, (_, i) => ({
    id: `edu-${i}`,
    nurseId: candidate.id,
    institution: `University of ${["London", "Manchester", "Edinburgh", "Birmingham", "Leeds"][i % 5]} — Faculty of Health Sciences`,
    qualification: i === 0 ? "BSc (Hons) Nursing" : `Post-Registration Module ${i}`,
    subject: `Subject ${i + 1} — Specialist Practice in Community Nursing`,
    startDate: `${2008 + i}-09-01`,
    endDate: `${2009 + i}-07-30`,
    grade: i === 0 ? "First Class Honours" : "Pass with Distinction",
    createdAt: new Date(),
  })) as EducationHistory[];

  // Mark all mandatory training modules as completed so the section renders fully.
  const training: MandatoryTraining[] = MANDATORY_TRAINING_MODULES.map((mod, i) => ({
    id: `train-${i}`,
    nurseId: candidate.id,
    moduleName: mod.name,
    renewalFrequency: mod.renewalFrequency,
    completedDate: "2025-04-01",
    expiryDate: "2026-04-01",
    issuingBody: "NHS England Statutory & Mandatory Training Provider",
    certificateUploaded: true,
    certificateDocumentId: null,
    status: "verified",
    createdAt: new Date(),
  })) as MandatoryTraining[];

  const competencies: CompetencyDeclaration[] = COMPETENCY_MATRIX.map((c, i) => ({
    id: `comp-${i}`,
    nurseId: candidate.id,
    domain: c.domain,
    competencyName: c.competency,
    mandatory: c.mandatory,
    selfAssessedLevel: "level_3",
    minimumRequiredLevel: c.minimumLevel,
    gapIdentified: false,
    status: "declared",
    evidenceNotes: null,
    declaredAt: new Date(),
    reviewedBy: null,
    reviewedAt: null,
  })) as CompetencyDeclaration[];

  const healthDeclaration: HealthDeclaration = {
    id: "hd-1",
    nurseId: candidate.id,
    hepatitisBVaccinated: true,
    mmrVaccinated: true,
    varicellaVaccinated: true,
    tbScreened: true,
    conditionsAffectingPractice:
      "None declared. Candidate confirms full fitness for clinical duties including manual handling, lone working and night shifts.",
    ohReferralRequired: false,
    completed: true,
    declaredAt: new Date(),
    aiTriageStatus: "clear",
    aiTriageNote: "No risk factors identified by AI triage.",
    aiTriagedAt: new Date(),
  } as HealthDeclaration;

  // 6 references with rating tables and free-text answers — pushes references
  // section across multiple pages.
  const references: Reference[] = Array.from({ length: 6 }, (_, i) => ({
    id: `ref-${i}`,
    nurseId: candidate.id,
    refereeName: `Referee Name ${i + 1}`,
    refereeEmail: `referee${i + 1}@example.com`,
    refereeOrg: `Hospital ${i + 1} NHS Trust — Tertiary Referral Centre`,
    refereeRole: "Senior Charge Nurse / Ward Manager",
    relationshipToCandidate: "Direct line manager for 3 years",
    outcome: "received",
    emailSentAt: new Date(),
    reminderCount: 0,
    formSubmittedAt: new Date(),
    ratings: {
      clinical_ability: 5,
      reliability: 5,
      communication: 4,
      teamwork: 5,
      initiative: 4,
      documentation: 5,
    },
    freeTextResponses: {
      strengths:
        "Exceptional clinical judgement and ability to escalate concerns appropriately. " +
        "Strong mentor to junior staff and well respected across the multidisciplinary team.",
      development:
        "Could benefit from further formal training in advanced clinical assessment to step up to a Band 7 role.",
      additional_comments:
        "Would absolutely re-employ. Candidate represents the highest standards of professional nursing practice.",
    },
    conductFlags: null,
    sicknessAbsenceBand: "Excellent",
    redFlagTriggered: false,
    createdAt: new Date(),
  })) as Reference[];

  const indemnity: ProfessionalIndemnity = {
    id: "ind-1",
    nurseId: candidate.id,
    provider: "Royal College of Nursing (RCN) Indemnity Scheme",
    policyNumber: "RCN-IND-2025-0098765",
    coverStartDate: "2025-01-01",
    coverEndDate: "2026-12-31",
    scopeAppropriate: true,
    verified: true,
    createdAt: new Date(),
  } as ProfessionalIndemnity;

  // 20 documents to push the document register table over a page break.
  const documents: DocType[] = Array.from({ length: 20 }, (_, i) => ({
    id: `doc-${i}`,
    nurseId: candidate.id,
    type: "compliance",
    filename: `document-${i}.pdf`,
    originalFilename: `Original Filename ${i} — Compliance Document.pdf`,
    filePath: `/uploads/document-${i}.pdf`,
    fileSize: 102400 + i * 1024,
    mimeType: "application/pdf",
    category: ["Identity", "Right to Work", "Qualification", "Training", "Reference"][i % 5],
    expiryDate: "2026-12-31",
    uploadedBy: "admin",
    sharepointUrl: null,
    aiStatus: ["pass", "warning", "fail"][i % 3],
    aiIssues: null,
    aiAnalyzedAt: new Date(),
    uploadedAt: new Date(),
  })) as DocType[];

  return {
    candidate,
    nmcVerification,
    dbsVerification,
    competencies,
    documents,
    references,
    training,
    healthDeclaration,
    indemnity,
    employmentHistory,
    educationHistory,
  };
}

function buildLargeAssessmentFixture(): Assessment {
  const longResponseText =
    "I would begin by performing a full A-to-E systematic assessment, calculating a NEWS2 score, " +
    "and escalating in line with local protocol. I would then ensure clear SBAR handover to the " +
    "medical team, prioritise immediate interventions (oxygen, IV access, fluid resuscitation as " +
    "indicated), document accurately in the patient record, and update the family in line with " +
    "the duty of candour. Throughout, I would reflect on the NMC Code, particularly the duties " +
    "of preserving safety, practising effectively, and prioritising people. ".repeat(4);

  const responses: AssessmentResponse[] = Array.from({ length: 30 }, (_, i) => ({
    questionId: i + 1,
    tag: ["clinical", "ethics", "communication", "leadership"][i % 4],
    domain: ["medication", "deterioration", "safeguarding", "end of life", "infection control"][i % 5],
    prompt:
      `Question ${i + 1}: Describe in detail how you would manage a deteriorating patient with ` +
      `complex multi-morbidity, including escalation, documentation, and family communication. ` +
      `Reference relevant NMC Code clauses and local Trust policy. (Long prompt to stress layout.)`,
    response: longResponseText,
    timeSpent: 90 + i,
    timeLimit: 180,
  }));

  const aiAnalysis = [
    "## Overall Summary",
    "Candidate demonstrates strong clinical reasoning across all 30 scenarios.",
    "",
    "## Strengths",
    "- Consistent escalation in line with NEWS2 and Sepsis Six.",
    "- Clear, structured SBAR communication.",
    "- Strong professional values aligned with the NMC Code.",
    "",
    "## Areas for Development",
    "- Could expand on advanced clinical assessment skills.",
    "- Some answers would benefit from more explicit reference to local policy.",
    "",
    "## Recommendation",
    "**Proceed to onboarding** with targeted induction on the trust deterioration pathway.",
  ].join("\n").repeat(3);

  return {
    id: 1,
    nurseId: "test-nurse-id",
    nurseName: "Test Nurse Long Name For Layout Stress Test",
    nurseEmail: "test.nurse@example.com",
    nursePhone: "07700900789",
    responses,
    aiAnalysis,
    emailSent: false,
    completedAt: new Date(),
  } as unknown as Assessment;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PDF reports — blank page regression check", () => {
  it("generateCandidatePDF: produces no blank pages with realistic large data", async () => {
    mockData.store = buildLargeCandidateFixture();

    const buffer = await generateCandidatePDF("test-candidate-id");
    expect(buffer.length).toBeGreaterThan(0);

    const pages = await extractTextPerPage(buffer);

    // Sanity: large fixture should produce a multi-page report. If this drops
    // to 1 we want to know — the data fixture has stopped being "large".
    expect(pages.length).toBeGreaterThan(1);

    expectNoBlankPages("generateCandidatePDF", pages);
  });

  it("generatePdfReport (preboard): produces no blank pages with realistic large data", async () => {
    const assessment = buildLargeAssessmentFixture();

    const buffer = await generatePdfReport(assessment);
    expect(buffer.length).toBeGreaterThan(0);

    const pages = await extractTextPerPage(buffer);

    expect(pages.length).toBeGreaterThan(1);

    expectNoBlankPages("generatePdfReport", pages);
  });
});
