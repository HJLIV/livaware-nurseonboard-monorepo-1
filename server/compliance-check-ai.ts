import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import { MANDATORY_TRAINING_MODULES, COMPETENCY_MATRIX } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export function isComplianceCheckAvailable(): boolean {
  return !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
}

function safeDate(d: string | Date | null | undefined): string {
  if (!d) return "Not provided";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "Not provided";
  }
}

function detectEmploymentGaps(history: { startDate: string; endDate?: string | null; isCurrent?: boolean | null }[]): string[] {
  if (history.length < 2) return history.length === 0 ? ["No employment history provided"] : [];
  const sorted = [...history].sort((a, b) => {
    try { return new Date(a.startDate).getTime() - new Date(b.startDate).getTime(); } catch { return 0; }
  });
  const gaps: string[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const endStr = sorted[i].isCurrent ? null : sorted[i].endDate;
    if (!endStr) continue;
    try {
      const endDate = new Date(endStr);
      const nextStart = new Date(sorted[i + 1].startDate);
      const diffDays = (nextStart.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 30) {
        gaps.push(`${Math.round(diffDays)} day gap between ${endStr} and ${sorted[i + 1].startDate}`);
      }
    } catch { /* skip invalid dates */ }
  }
  return gaps;
}

export async function runComplianceCheck(candidateId: string): Promise<string> {
  if (!isComplianceCheckAvailable()) {
    throw new Error("AI compliance check is not configured");
  }

  const candidate = await storage.getCandidate(candidateId);
  if (!candidate) throw new Error("Candidate not found");

  const [
    nmcVerification, dbsVerification, competencies, documents,
    refs, training, healthDeclaration, indemnity,
    employmentHistory, educationHistory, onboardingState, inductionPolicies,
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
    storage.getOnboardingState(candidateId),
    storage.getInductionPolicies(candidateId),
  ]);

  const completedTraining = training.filter(t => t.completedDate);
  const expiredTraining = training.filter(t => {
    if (!t.expiryDate) return false;
    try { return new Date(t.expiryDate) < new Date(); } catch { return false; }
  });
  const receivedRefs = refs.filter(r => r.outcome === "received");
  const flaggedRefs = refs.filter(r => r.redFlagTriggered);
  const acknowledgedPolicies = inductionPolicies.filter(p => p.acknowledged);

  const docsByCategory: Record<string, number> = {};
  documents.forEach(d => {
    const cat = d.category || "uncategorised";
    docsByCategory[cat] = (docsByCategory[cat] || 0) + 1;
  });

  const identityDocs = documents.filter(d =>
    d.category === "identity" || d.type === "passport" || d.type === "identity"
  );
  const rtwDocs = documents.filter(d =>
    d.category === "right_to_work" || d.type === "right_to_work"
  );

  const candidateData = {
    fullName: `Candidate-${candidateId.slice(0, 8)}`,
    email: candidate.email ? "Provided" : "Missing",
    phone: candidate.phone ? "Provided" : "Missing",
    dateOfBirth: candidate.dateOfBirth ? "Provided" : "Missing",
    address: candidate.address ? "Provided" : "Missing",
    nextOfKin: candidate.nextOfKin ? "Provided" : "Missing",
    passportNumber: candidate.passportNumber ? "Provided" : "Missing",
    band: candidate.band,
    specialisms: candidate.specialisms,
    currentEmployer: candidate.currentEmployer,
    yearsQualified: candidate.yearsQualified,
    status: candidate.status,

    nmcVerification: nmcVerification ? {
      pin: nmcVerification.pin ? "Provided" : "Missing",
      status: nmcVerification.status,
      registrationStatus: nmcVerification.registrationStatus,
      conditions: nmcVerification.conditions,
      renewalDate: safeDate(nmcVerification.renewalDate),
    } : null,

    dbsVerification: dbsVerification ? {
      certificateNumber: dbsVerification.certificateNumber ? "Provided" : "Missing",
      status: dbsVerification.status,
      checkResult: dbsVerification.checkResult,
      updateServiceSubscribed: dbsVerification.updateServiceSubscribed,
      issueDate: safeDate(dbsVerification.issueDate),
    } : null,

    training: {
      totalRequired: MANDATORY_TRAINING_MODULES.length,
      completed: completedTraining.length,
      expired: expiredTraining.length,
      missingModules: MANDATORY_TRAINING_MODULES
        .filter(m => !training.find(t => t.moduleName === m.name && t.completedDate))
        .map(m => m.name),
    },

    competencies: {
      totalDeclared: competencies.length,
      totalRequired: COMPETENCY_MATRIX.length,
      gapsIdentified: competencies.filter(c => c.gapIdentified).length,
      flagged: competencies.filter(c => c.status === "flagged").length,
    },

    healthDeclaration: healthDeclaration ? {
      completed: healthDeclaration.completed,
      hepatitisB: healthDeclaration.hepatitisBVaccinated,
      mmr: healthDeclaration.mmrVaccinated,
      varicella: healthDeclaration.varicellaVaccinated,
      tb: healthDeclaration.tbScreened,
      conditionsAffectingPractice: healthDeclaration.conditionsAffectingPractice || "None",
      ohReferralRequired: healthDeclaration.ohReferralRequired,
      aiTriageStatus: healthDeclaration.aiTriageStatus,
    } : null,

    references: {
      total: refs.length,
      received: receivedRefs.length,
      flagged: flaggedRefs.length,
      pending: refs.filter(r => r.outcome === "pending" || r.outcome === "sent").length,
      details: refs.map((r, i) => ({
        refereeName: `Referee ${i + 1}`,
        organisation: r.refereeOrg || "Not specified",
        role: r.refereeRole || "Not specified",
        relationship: r.relationshipToCandidate || "Not specified",
        outcome: r.outcome,
        redFlagTriggered: r.redFlagTriggered || false,
        sicknessAbsenceBand: r.sicknessAbsenceBand || "Not assessed",
        conductConcerns: (r.conductFlags as any)?.conduct_concerns || false,
        wouldReemploy: (r.freeTextResponses as any)?.reemploy ?? "Not answered",
      })),
    },

    indemnity: indemnity ? {
      provider: indemnity.provider ? "Provided" : "Missing",
      policyNumber: indemnity.policyNumber ? "Provided" : "Missing",
      coverEndDate: safeDate(indemnity.coverEndDate),
      scopeAppropriate: indemnity.scopeAppropriate,
      verified: indemnity.verified,
    } : null,

    employmentHistory: {
      totalEntries: employmentHistory.length,
      gaps: detectEmploymentGaps(employmentHistory),
      entries: employmentHistory.map(e => ({
        employer: e.employer,
        jobTitle: e.jobTitle,
        department: e.department || "Not specified",
        startDate: e.startDate,
        endDate: e.isCurrent ? "Current" : (e.endDate || "Not specified"),
        reasonForLeaving: e.isCurrent ? "N/A" : (e.reasonForLeaving || "Not provided"),
      })),
    },

    educationHistory: {
      totalEntries: educationHistory.length,
      entries: educationHistory.map(e => ({
        institution: e.institution,
        qualification: e.qualification,
        subject: e.subject || "Not specified",
        startDate: e.startDate || "Not specified",
        endDate: e.endDate || "Not specified",
        grade: e.grade || "Not specified",
      })),
    },

    documents: {
      total: documents.length,
      byCategory: docsByCategory,
      hasIdentityDoc: identityDocs.length > 0,
      hasRightToWorkDoc: rtwDocs.length > 0,
      aiFailedDocs: documents.filter(d => d.aiStatus === "fail").length,
      aiWarningDocs: documents.filter(d => d.aiStatus === "warning").length,
    },

    inductionPolicies: {
      total: inductionPolicies.length,
      acknowledged: acknowledgedPolicies.length,
    },

    onboardingStep: onboardingState?.currentStep || 0,
    stepStatuses: onboardingState?.stepStatuses || {},
  };

  const systemPrompt = `You are a CQC compliance officer for Livaware Ltd, a UK healthcare staffing company. Your task is to conduct a thorough compliance assessment of a nurse candidate against **CQC Regulation 19 (Fit and Proper Persons Employed)** and **Schedule 3** of the Health and Social Care Act 2008 (Regulated Activities) Regulations 2014.

You MUST evaluate each of the following Schedule 3 requirements and produce a structured compliance report:

### Schedule 3 Requirements to Check:
1. **Proof of Identity** — Photo ID verified, passport or driving licence on file
2. **Criminal Record Check (DBS)** — Enhanced DBS certificate, Update Service status, any disclosed matters
3. **Proof of Right to Work** — Valid UK work authorisation documentation on file
4. **Professional Registration (NMC)** — Active NMC PIN, no conditions/restrictions, renewal date valid
5. **Evidence of Qualifications** — Relevant nursing qualifications documented, education history complete
6. **Full Employment History** — Complete employment history with no unexplained gaps, reasons for leaving recorded
7. **References** — Minimum 2 satisfactory references from recent employers, no red flags, all received
8. **Health Declaration** — Occupational health clearance, vaccination status, fitness to practise
9. **Competency Assessment** — Required clinical competencies declared and at minimum acceptable levels
10. **Mandatory Training** — All 15 required training modules completed and within renewal dates
11. **Professional Indemnity Insurance** — Valid policy covering scope of practice
12. **Induction & Policies** — All organisational policies acknowledged

### Output Format:
Use this exact markdown structure:

## Overall Compliance Verdict
State one of: **COMPLIANT**, **PARTIALLY COMPLIANT**, or **NON-COMPLIANT**. Add a brief summary sentence.

## Schedule 3 Assessment

For each of the 12 requirements above, output:

### [Number]. [Requirement Name]
**Status:** ✅ Met / ⚠️ Partially Met / ❌ Not Met
[1-2 sentence explanation of what was found and any gaps]

## Critical Gaps
Bullet list of the most urgent items that MUST be resolved before the candidate can be deployed. If none, state "No critical gaps identified."

## Recommendations
Bullet list of recommended actions for the compliance team, ordered by priority.

### Rules:
- Be factual and specific — cite actual data from the candidate record
- Use British English
- Do not speculate about data that isn't provided
- A candidate needs minimum 2 satisfactory references
- All 15 mandatory training modules must be completed and in-date
- NMC registration must be active with no restrictions
- DBS must be verified (not just pending)
- Missing data should be flagged as a gap, not assumed to be fine`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Conduct a CQC Regulation 19 / Schedule 3 compliance check for the following candidate:\n\n${JSON.stringify(candidateData, null, 2)}`,
      },
    ],
  });

  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";
  if (!responseText) {
    throw new Error("AI returned an empty compliance check");
  }

  return responseText;
}
