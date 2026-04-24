import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import { MANDATORY_TRAINING_MODULES, COMPETENCY_MATRIX } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export function isComplianceCheckAvailable(): boolean {
  return !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
}

type ComplianceStatus = "met" | "partially_met" | "not_met";

interface RequirementStatus {
  requirement: string;
  status: ComplianceStatus;
  gaps: string[];
  indicators: Record<string, string | number | boolean>;
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
        gaps.push(`${Math.round(diffDays)}-day unexplained gap detected between positions`);
      }
    } catch { /* skip invalid dates */ }
  }
  return gaps;
}

function isDateExpired(d: string | Date | null | undefined): boolean {
  if (!d) return false;
  try {
    return new Date(d) < new Date();
  } catch {
    return false;
  }
}

function isDateWithin90Days(d: string | Date | null | undefined): boolean {
  if (!d) return false;
  try {
    const date = new Date(d);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    return diffMs > 0 && diffMs < 90 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function computeComplianceStatuses(data: {
  candidate: any;
  nmcVerification: any;
  dbsVerification: any;
  competencies: any[];
  documents: any[];
  refs: any[];
  training: any[];
  healthDeclaration: any;
  indemnity: any;
  employmentHistory: any[];
  educationHistory: any[];
  inductionPolicies: any[];
}): RequirementStatus[] {
  const {
    candidate, nmcVerification, dbsVerification, competencies, documents,
    refs, training, healthDeclaration, indemnity,
    employmentHistory, educationHistory, inductionPolicies,
  } = data;

  const identityDocs = documents.filter(d =>
    d.category === "identity" || d.type === "passport" || d.type === "identity"
  );
  const rtwDocs = documents.filter(d =>
    d.category === "right_to_work" || d.type === "right_to_work"
  );
  const completedTraining = training.filter(t => t.completedDate);
  const expiredTraining = training.filter(t => {
    if (!t.expiryDate) return false;
    try { return new Date(t.expiryDate) < new Date(); } catch { return false; }
  });
  const receivedRefs = refs.filter(r => r.outcome === "received");
  const flaggedRefs = refs.filter(r => r.redFlagTriggered);
  const acknowledgedPolicies = inductionPolicies.filter(p => p.acknowledged);

  const statuses: RequirementStatus[] = [];

  // 1. Proof of Identity
  {
    const hasPassport = !!candidate.passportNumber;
    const hasIdentityDoc = identityDocs.length > 0;
    const gaps: string[] = [];
    if (!hasPassport && !hasIdentityDoc) gaps.push("No photo ID or passport on file");
    else if (!hasIdentityDoc) gaps.push("No identity document uploaded");

    statuses.push({
      requirement: "Proof of Identity",
      status: (hasPassport || hasIdentityDoc) ? "met" : "not_met",
      gaps,
      indicators: {
        passportNumberProvided: hasPassport,
        identityDocumentsOnFile: identityDocs.length,
      },
    });
  }

  // 2. Criminal Record Check (DBS)
  {
    const gaps: string[] = [];
    let status: ComplianceStatus = "not_met";
    if (dbsVerification) {
      const isVerified = dbsVerification.status === "verified";
      const hasCertificate = !!dbsVerification.certificateNumber;
      const hasUpdateService = !!dbsVerification.updateServiceSubscribed;
      if (!isVerified) gaps.push("DBS check not yet verified");
      if (!hasCertificate) gaps.push("DBS certificate number not provided");
      if (dbsVerification.checkResult && dbsVerification.checkResult !== "clear") gaps.push("DBS check result requires further review");
      status = isVerified && hasCertificate ? "met" : (hasCertificate || isVerified ? "partially_met" : "not_met");
      statuses.push({
        requirement: "Criminal Record Check (DBS)",
        status,
        gaps,
        indicators: {
          certificateProvided: hasCertificate,
          verified: isVerified,
          resultClear: !dbsVerification.checkResult || dbsVerification.checkResult === "clear",
          updateServiceSubscribed: hasUpdateService,
        },
      });
    } else {
      statuses.push({
        requirement: "Criminal Record Check (DBS)",
        status: "not_met",
        gaps: ["No DBS verification record exists"],
        indicators: { certificateProvided: false, verified: false },
      });
    }
  }

  // 3. Proof of Right to Work
  {
    const hasRtw = rtwDocs.length > 0;
    statuses.push({
      requirement: "Proof of Right to Work",
      status: hasRtw ? "met" : "not_met",
      gaps: hasRtw ? [] : ["No right-to-work documentation on file"],
      indicators: { rightToWorkDocumentsOnFile: rtwDocs.length },
    });
  }

  // 4. Professional Registration (NMC)
  {
    const gaps: string[] = [];
    if (nmcVerification) {
      const isActive = nmcVerification.registrationStatus === "active" || nmcVerification.status === "verified";
      const conditionsArray = Array.isArray(nmcVerification.conditions)
        ? (nmcVerification.conditions as string[]).filter((c) => typeof c === "string" && c.trim().length > 0)
        : [];
      const hasConditions = conditionsArray.length > 0;
      const hasPin = !!nmcVerification.pin;
      const renewalExpired = isDateExpired(nmcVerification.renewalDate);
      const renewalSoon = isDateWithin90Days(nmcVerification.renewalDate);
      if (!hasPin) gaps.push("NMC PIN not provided");
      if (!isActive) gaps.push("NMC registration is not currently active");
      if (hasConditions) {
        gaps.push(`NMC registration has conditions or restrictions noted: ${conditionsArray.join("; ")}`);
      }
      if (renewalExpired) gaps.push("NMC registration has expired");
      if (renewalSoon) gaps.push("NMC registration is due for renewal within 90 days");

      let status: ComplianceStatus = "met";
      if (!isActive || !hasPin || hasConditions || renewalExpired) status = "not_met";
      else if (renewalSoon) status = "partially_met";

      statuses.push({
        requirement: "Professional Registration (NMC)",
        status,
        gaps,
        indicators: {
          pinProvided: hasPin,
          registrationActive: isActive,
          hasConditions,
          conditionsCount: conditionsArray.length,
          renewalExpired,
          renewalDueWithin90Days: renewalSoon,
        },
      });
    } else {
      statuses.push({
        requirement: "Professional Registration (NMC)",
        status: "not_met",
        gaps: ["No NMC verification record exists"],
        indicators: { pinProvided: false, registrationActive: false },
      });
    }
  }

  // 5. Evidence of Qualifications
  {
    const gaps: string[] = [];
    const hasEducation = educationHistory.length > 0;
    const hasNursingQualification = educationHistory.some(e =>
      e.qualification && /nurs|rnc|bsc|msc|diploma/i.test(e.qualification)
    );
    if (!hasEducation) gaps.push("No education history entries provided");
    if (hasEducation && !hasNursingQualification) gaps.push("No nursing-specific qualification identified in education records");

    statuses.push({
      requirement: "Evidence of Qualifications",
      status: hasEducation && hasNursingQualification ? "met" : (hasEducation ? "partially_met" : "not_met"),
      gaps,
      indicators: {
        totalEducationEntries: educationHistory.length,
        nursingQualificationIdentified: hasNursingQualification,
      },
    });
  }

  // 6. Full Employment History
  {
    const employmentGaps = detectEmploymentGaps(employmentHistory);
    const entriesWithoutReason = employmentHistory.filter(e => !e.isCurrent && !e.reasonForLeaving).length;
    const gaps: string[] = [...employmentGaps];
    if (employmentHistory.length === 0) gaps.push("No employment history provided");
    if (entriesWithoutReason > 0) gaps.push(`${entriesWithoutReason} past position(s) missing reason for leaving`);

    let status: ComplianceStatus = "met";
    if (employmentHistory.length === 0) status = "not_met";
    else if (employmentGaps.length > 0 || entriesWithoutReason > 0) status = "partially_met";

    statuses.push({
      requirement: "Full Employment History",
      status,
      gaps,
      indicators: {
        totalEntries: employmentHistory.length,
        gapsDetected: employmentGaps.length,
        entriesMissingReasonForLeaving: entriesWithoutReason,
      },
    });
  }

  // 7. References
  {
    const gaps: string[] = [];
    const pendingCount = refs.filter(r => r.outcome === "pending" || r.outcome === "sent").length;
    const conductConcernCount = refs.filter(r => (r.conductFlags as any)?.conduct_concerns).length;
    const wouldNotReemployCount = refs.filter(r => {
      const val = (r.freeTextResponses as any)?.reemploy;
      return val === false || val === "no";
    }).length;

    if (refs.length === 0) gaps.push("No references provided");
    if (receivedRefs.length < 2) gaps.push(`Only ${receivedRefs.length} of minimum 2 references received`);
    if (flaggedRefs.length > 0) gaps.push(`${flaggedRefs.length} reference(s) have triggered red flags`);
    if (pendingCount > 0) gaps.push(`${pendingCount} reference(s) still pending/sent`);
    if (conductConcernCount > 0) gaps.push(`${conductConcernCount} reference(s) raised conduct concerns`);
    if (wouldNotReemployCount > 0) gaps.push(`${wouldNotReemployCount} referee(s) indicated they would not re-employ`);

    let status: ComplianceStatus = "met";
    if (receivedRefs.length < 2 || flaggedRefs.length > 0) status = receivedRefs.length === 0 ? "not_met" : "partially_met";
    if (conductConcernCount > 0 || wouldNotReemployCount > 0) status = "partially_met";

    statuses.push({
      requirement: "References",
      status,
      gaps,
      indicators: {
        totalRequested: refs.length,
        received: receivedRefs.length,
        pending: pendingCount,
        flagged: flaggedRefs.length,
        conductConcerns: conductConcernCount,
        wouldNotReemploy: wouldNotReemployCount,
      },
    });
  }

  // 8. Health Declaration
  {
    const gaps: string[] = [];
    if (healthDeclaration) {
      if (!healthDeclaration.completed) gaps.push("Health declaration not completed");
      const vaccinationsDone = [
        healthDeclaration.hepatitisBVaccinated,
        healthDeclaration.mmrVaccinated,
        healthDeclaration.varicellaVaccinated,
      ];
      const missingVaccinationCount = vaccinationsDone.filter(v => !v).length;
      if (missingVaccinationCount > 0) gaps.push(`${missingVaccinationCount} of 3 required vaccinations not confirmed`);
      if (!healthDeclaration.tbScreened) gaps.push("TB screening not completed");
      if (healthDeclaration.ohReferralRequired) gaps.push("Occupational health referral is required");
      const hasConditions = !!healthDeclaration.conditionsAffectingPractice &&
        healthDeclaration.conditionsAffectingPractice !== "None" &&
        healthDeclaration.conditionsAffectingPractice !== "none";
      if (hasConditions) gaps.push("Health conditions declared that may affect practice — further review required");

      let status: ComplianceStatus = "met";
      if (!healthDeclaration.completed) status = "not_met";
      else if (missingVaccinationCount > 0 || !healthDeclaration.tbScreened || healthDeclaration.ohReferralRequired || hasConditions) status = "partially_met";

      statuses.push({
        requirement: "Health Declaration",
        status,
        gaps,
        indicators: {
          declarationCompleted: !!healthDeclaration.completed,
          requiredVaccinations: 3,
          confirmedVaccinations: 3 - missingVaccinationCount,
          tbScreeningComplete: !!healthDeclaration.tbScreened,
          referralRequired: !!healthDeclaration.ohReferralRequired,
          furtherReviewNeeded: hasConditions,
        },
      });
    } else {
      statuses.push({
        requirement: "Health Declaration",
        status: "not_met",
        gaps: ["No health declaration record exists"],
        indicators: { declarationCompleted: false },
      });
    }
  }

  // 9. Competency Assessment
  {
    const gaps: string[] = [];
    const gapsIdentified = competencies.filter(c => c.gapIdentified).length;
    const flagged = competencies.filter(c => c.status === "flagged").length;
    if (competencies.length === 0) gaps.push("No competency declarations submitted");
    if (competencies.length < COMPETENCY_MATRIX.length) gaps.push(`${COMPETENCY_MATRIX.length - competencies.length} of ${COMPETENCY_MATRIX.length} required competencies not yet declared`);
    if (gapsIdentified > 0) gaps.push(`${gapsIdentified} competency gap(s) identified`);
    if (flagged > 0) gaps.push(`${flagged} competency declaration(s) flagged for review`);

    let status: ComplianceStatus = "met";
    if (competencies.length === 0) status = "not_met";
    else if (competencies.length < COMPETENCY_MATRIX.length || gapsIdentified > 0 || flagged > 0) status = "partially_met";

    statuses.push({
      requirement: "Competency Assessment",
      status,
      gaps,
      indicators: {
        totalDeclared: competencies.length,
        totalRequired: COMPETENCY_MATRIX.length,
        gapsIdentified,
        flagged,
      },
    });
  }

  // 10. Mandatory Training
  {
    const gaps: string[] = [];
    const missingModules = MANDATORY_TRAINING_MODULES
      .filter(m => !training.find(t => t.moduleName === m.name && t.completedDate))
      .map(m => m.name);

    if (missingModules.length > 0) gaps.push(`${missingModules.length} required module(s) not completed: ${missingModules.join(", ")}`);
    if (expiredTraining.length > 0) gaps.push(`${expiredTraining.length} module(s) have expired and require renewal`);

    let status: ComplianceStatus = "met";
    if (completedTraining.length === 0) status = "not_met";
    else if (missingModules.length > 0 || expiredTraining.length > 0) status = "partially_met";

    statuses.push({
      requirement: "Mandatory Training",
      status,
      gaps,
      indicators: {
        totalRequired: MANDATORY_TRAINING_MODULES.length,
        completed: completedTraining.length,
        expired: expiredTraining.length,
        missing: missingModules.length,
      },
    });
  }

  // 11. Professional Indemnity Insurance
  {
    const gaps: string[] = [];
    if (indemnity) {
      if (!indemnity.provider) gaps.push("Insurance provider not specified");
      if (!indemnity.policyNumber) gaps.push("Policy number not provided");
      if (isDateExpired(indemnity.coverEndDate)) gaps.push("Insurance cover has expired");
      if (isDateWithin90Days(indemnity.coverEndDate)) gaps.push("Insurance cover is due to expire within 90 days");
      if (indemnity.scopeAppropriate === false) gaps.push("Insurance scope flagged as not appropriate for role");
      if (!indemnity.verified) gaps.push("Insurance not yet verified");

      let status: ComplianceStatus = "met";
      if (!indemnity.provider || !indemnity.policyNumber || isDateExpired(indemnity.coverEndDate)) status = "not_met";
      else if (!indemnity.verified || indemnity.scopeAppropriate === false || isDateWithin90Days(indemnity.coverEndDate)) status = "partially_met";

      statuses.push({
        requirement: "Professional Indemnity Insurance",
        status,
        gaps,
        indicators: {
          providerSpecified: !!indemnity.provider,
          policyNumberProvided: !!indemnity.policyNumber,
          coverExpired: isDateExpired(indemnity.coverEndDate),
          coverExpiringWithin90Days: isDateWithin90Days(indemnity.coverEndDate),
          scopeAppropriate: indemnity.scopeAppropriate ?? "not_assessed",
          verified: !!indemnity.verified,
        },
      });
    } else {
      statuses.push({
        requirement: "Professional Indemnity Insurance",
        status: "not_met",
        gaps: ["No professional indemnity insurance record exists"],
        indicators: { providerSpecified: false },
      });
    }
  }

  // 12. Induction & Policies
  {
    const gaps: string[] = [];
    const unacknowledged = inductionPolicies.length - acknowledgedPolicies.length;
    if (inductionPolicies.length === 0) gaps.push("No induction policies configured");
    if (unacknowledged > 0) gaps.push(`${unacknowledged} of ${inductionPolicies.length} policies not yet acknowledged`);

    let status: ComplianceStatus = "met";
    if (inductionPolicies.length === 0 || acknowledgedPolicies.length === 0) status = "not_met";
    else if (unacknowledged > 0) status = "partially_met";

    statuses.push({
      requirement: "Induction & Policies",
      status,
      gaps,
      indicators: {
        totalPolicies: inductionPolicies.length,
        acknowledged: acknowledgedPolicies.length,
        outstanding: unacknowledged,
      },
    });
  }

  return statuses;
}

export async function runComplianceCheck(candidateId: string): Promise<string> {
  if (!isComplianceCheckAvailable()) {
    throw new Error("AI compliance check is not configured");
  }

  const candidate = await storage.getCandidate(candidateId);
  if (!candidate) throw new Error("Candidate not found");

  // AI FIREWALL: Equal opportunities data is NEVER fetched or included in any AI payload.
  // This is a deliberate exclusion to comply with Equality Act 2010 requirements.
  // Protected characteristics must not influence compliance or hiring decisions.
  // DO NOT add storage.getEqualOpportunities() to this list.
  const EXCLUDED_FROM_AI = ["equal_opportunities"] as const;
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

  const requirementStatuses = computeComplianceStatuses({
    candidate, nmcVerification, dbsVerification, competencies, documents,
    refs, training, healthDeclaration, indemnity,
    employmentHistory, educationHistory, inductionPolicies,
  });

  const metCount = requirementStatuses.filter(r => r.status === "met").length;
  const partialCount = requirementStatuses.filter(r => r.status === "partially_met").length;
  const notMetCount = requirementStatuses.filter(r => r.status === "not_met").length;
  const allGaps = requirementStatuses.flatMap(r => r.gaps);

  const complianceSummary = {
    overallCounts: {
      totalRequirements: 12,
      met: metCount,
      partiallyMet: partialCount,
      notMet: notMetCount,
      totalGaps: allGaps.length,
    },
    requirements: requirementStatuses,
    candidateContext: {
      band: candidate.band,
      contactDetailsProvided: !!(candidate.email && candidate.phone),
      dateOfBirthProvided: !!candidate.dateOfBirth,
      addressProvided: !!candidate.address,
      nextOfKinProvided: !!candidate.nextOfKin && (() => { try { const p = JSON.parse(candidate.nextOfKin!); return !!(p.name && p.contactNumber); } catch { return !!candidate.nextOfKin; } })(),
    },
    documentSummary: {
      totalDocuments: documents.length,
      aiFailedDocuments: documents.filter(d => d.aiStatus === "fail").length,
      aiWarningDocuments: documents.filter(d => d.aiStatus === "warning").length,
    },
    onboardingStep: onboardingState?.currentStep || 0,
  };

  // AI FIREWALL — code-level enforcement: strip any protected characteristics
  // from the payload before sending to external AI. These fields must never
  // appear in data sent to Anthropic or any other external AI provider.
  const PROTECTED_CHARACTERISTIC_KEYS = new Set([
    "gender", "ethnicity", "disabilityStatus", "disability_status",
    "religionBelief", "religion_belief", "sexualOrientation", "sexual_orientation",
    "ageBand", "age_band", "equalOpportunities", "equal_opportunities",
  ]);
  function sanitizeForAI(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (PROTECTED_CHARACTERISTIC_KEYS.has(key)) continue;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        sanitized[key] = sanitizeForAI(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  const sanitizedSummary = sanitizeForAI(complianceSummary as Record<string, unknown>);

  const systemPrompt = `You are a CQC compliance officer for Livaware Ltd, a UK healthcare staffing company. You are producing a structured compliance report for a nurse candidate against **CQC Regulation 19 (Fit and Proper Persons Employed)** and **Schedule 3** of the Health and Social Care Act 2008 (Regulated Activities) Regulations 2014.

You will receive a pre-computed compliance status summary. Each of the 12 Schedule 3 requirements has already been evaluated server-side with a status (met / partially_met / not_met), identified gaps, and supporting indicators. Your role is to interpret these statuses and produce a well-formatted, actionable compliance report.

### Schedule 3 Requirements:
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
State one of: **COMPLIANT** (all 12 met), **PARTIALLY COMPLIANT** (some met, some partial/not met), or **NON-COMPLIANT** (critical requirements not met). Add a brief summary sentence.

## Schedule 3 Assessment

For each of the 12 requirements, output:

### [Number]. [Requirement Name]
**Status:** ✅ Met / ⚠️ Partially Met / ❌ Not Met
[1-2 sentence explanation based on the pre-computed status, gaps, and indicators provided]

## Critical Gaps
Bullet list of the most urgent items that MUST be resolved before the candidate can be deployed. Derive these from the gaps marked "not_met". If none, state "No critical gaps identified."

## Recommendations
Bullet list of recommended actions for the compliance team, ordered by priority.

### Rules:
- Map statuses directly: "met" → ✅ Met, "partially_met" → ⚠️ Partially Met, "not_met" → ❌ Not Met
- Use the gap descriptions provided — do not invent additional data points
- Use British English
- Do not speculate about data that is not in the summary
- Be concise but actionable in your explanations
- Missing data should be flagged as a gap, not assumed to be fine`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Produce a CQC Regulation 19 / Schedule 3 compliance report based on the following pre-computed compliance status summary:\n\n${JSON.stringify(sanitizedSummary, null, 2)}`,
      },
    ],
  });

  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";
  if (!responseText) {
    throw new Error("AI returned an empty compliance check");
  }

  return responseText;
}
