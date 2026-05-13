// Onboarding declarations registry (task 121).
//
// Each declaration is a stable, code-defined question set. The wording is
// based on standard NHS/UK templates as a first draft — admins refine the
// copy via code changes for now (out of scope: in-app editing).

export type DeclarationAnswerType =
  | "boolean"
  | "enum"
  | "short_text"
  | "long_text"
  | "date"
  | "number"
  | "file";

// Shape for uploaded-file answers. Persisted in the JSONB answers blob
// under the question id; matches what /api/portal/:token/upload returns
// plus an optional documentId once linked into the documents table.
export interface DeclarationFileAnswer {
  filename: string;
  originalFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  documentId?: string;
}

export function isFileAnswer(v: unknown): v is DeclarationFileAnswer {
  return !!v && typeof v === "object"
    && typeof (v as any).filename === "string"
    && typeof (v as any).filePath === "string";
}

export interface DeclarationQuestion {
  id: string;
  prompt: string;
  type: DeclarationAnswerType;
  required: boolean;
  helpText?: string;
  options?: { value: string; label: string }[];
  // Only show this question when another question's answer matches.
  conditionalOn?: { questionId: string; equals: string | boolean };
  // Required only when conditionalOn matches (otherwise optional).
  requiredWhenShown?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export interface DeclarationDefinition {
  key: string;
  title: string;
  intro: string;
  legalReferences?: string[];
  questions: DeclarationQuestion[];
  // Required typed-name signature confirmation prompt.
  signaturePrompt: string;
}

const yesNo = (id: string, prompt: string, helpText?: string): DeclarationQuestion => ({
  id, prompt, type: "boolean", required: true, helpText,
});

// ─── Rehabilitation of Offenders ───────────────────────────────────
const REHAB_OF_OFFENDERS: DeclarationDefinition = {
  key: "rehab_of_offenders",
  title: "Rehabilitation of Offenders Declaration",
  intro:
    "Nursing roles are exempt from the Rehabilitation of Offenders Act 1974 (Exceptions) Order 1975. You must therefore disclose all convictions, cautions, reprimands, final warnings and pending charges, including those that would otherwise be considered 'spent', except for protected cautions/convictions filtered under the Police Act 1997.",
  legalReferences: [
    "Rehabilitation of Offenders Act 1974 (Exceptions) Order 1975",
    "Police Act 1997",
    "NMC Code of Conduct (2018)",
  ],
  questions: [
    yesNo(
      "any_unspent_convictions",
      "Do you have any unspent criminal convictions in the UK or any other country?",
    ),
    {
      id: "unspent_convictions_detail",
      prompt: "Please provide details of each unspent conviction (offence, date, sentence, country).",
      type: "long_text",
      required: false,
      requiredWhenShown: true,
      conditionalOn: { questionId: "any_unspent_convictions", equals: true },
      maxLength: 4000,
    },
    yesNo(
      "any_spent_convictions",
      "Do you have any spent convictions, cautions, reprimands or final warnings (other than protected cautions/convictions)?",
      "Because nursing is exempt from the Rehabilitation of Offenders Act, spent convictions must also be disclosed.",
    ),
    {
      id: "spent_convictions_detail",
      prompt: "Please provide details of each spent conviction or caution (offence, date, sentence, country).",
      type: "long_text",
      required: false,
      requiredWhenShown: true,
      conditionalOn: { questionId: "any_spent_convictions", equals: true },
      maxLength: 4000,
    },
    yesNo(
      "any_pending_charges",
      "Are you currently the subject of any pending criminal charges, prosecutions or court proceedings?",
    ),
    {
      id: "pending_charges_detail",
      prompt: "Please provide details of any pending charges or proceedings.",
      type: "long_text",
      required: false,
      requiredWhenShown: true,
      conditionalOn: { questionId: "any_pending_charges", equals: true },
      maxLength: 4000,
    },
    yesNo(
      "any_safeguarding_referrals",
      "Have you ever been the subject of a safeguarding investigation, dismissal, or referral to a professional regulator (e.g. NMC, DBS Barred List, ISA)?",
    ),
    {
      id: "safeguarding_detail",
      prompt: "Please provide details of any safeguarding investigation, dismissal or referral.",
      type: "long_text",
      required: false,
      requiredWhenShown: true,
      conditionalOn: { questionId: "any_safeguarding_referrals", equals: true },
      maxLength: 4000,
    },
    {
      id: "confirm_truthful",
      prompt: "I confirm the information I have provided is true, complete and accurate to the best of my knowledge, and I understand that knowingly withholding information may lead to withdrawal of an offer or termination of employment.",
      type: "boolean",
      required: true,
    },
  ],
  signaturePrompt: "Type your full legal name to sign this declaration.",
};

// ─── Occupational Health Questionnaire ─────────────────────────────
const OCCUPATIONAL_HEALTH: DeclarationDefinition = {
  key: "occupational_health",
  title: "Occupational Health Questionnaire",
  intro:
    "This pre-employment health screen helps Occupational Health assess your fitness for the role and identify any reasonable adjustments needed. Your answers are confidential and shared only with the OH service.",
  legalReferences: [
    "Equality Act 2010",
    "Health & Safety at Work Act 1974",
  ],
  questions: [
    yesNo("current_chronic_condition", "Do you currently have any long-term physical health condition (e.g. diabetes, asthma, epilepsy, musculoskeletal)?"),
    {
      id: "chronic_condition_detail",
      prompt: "Please describe the condition(s), treatment, and any impact on work.",
      type: "long_text", required: false, requiredWhenShown: true,
      conditionalOn: { questionId: "current_chronic_condition", equals: true },
      maxLength: 2000,
    },
    yesNo("mental_health_condition", "Have you ever received treatment for a mental health condition (e.g. depression, anxiety, PTSD)?"),
    {
      id: "mental_health_detail",
      prompt: "Please describe the condition, dates and current status.",
      type: "long_text", required: false, requiredWhenShown: true,
      conditionalOn: { questionId: "mental_health_condition", equals: true },
      maxLength: 2000,
    },
    yesNo("musculoskeletal_issues", "Do you have any back, neck, shoulder or other musculoskeletal problems that affect lifting, bending or standing?"),
    yesNo("skin_conditions", "Do you have any skin conditions (e.g. eczema, dermatitis, psoriasis) that may affect frequent hand-washing or glove use?"),
    yesNo("needlestick_history", "Have you had a previous needlestick or sharps injury that required follow-up?"),
    yesNo("immunisations_up_to_date", "Are your routine immunisations up to date (Hepatitis B, MMR, Varicella, BCG/TB)?"),
    yesNo("hep_b_vaccinated", "Have you completed a course of Hepatitis B vaccination with documented response (anti-HBs >= 10 mIU/mL)?"),
    yesNo("tb_screened", "Have you been screened for TB (chest X-ray or IGRA) in the last 12 months?"),
    {
      id: "absence_last_2_years",
      prompt: "How many days of sickness absence have you had in the last 24 months (excluding pregnancy-related)?",
      type: "number", required: true, placeholder: "e.g. 3",
    },
    yesNo("disability_adjustments", "Do you consider yourself to have a disability under the Equality Act 2010 that requires reasonable adjustments?"),
    {
      id: "adjustments_detail",
      prompt: "What reasonable adjustments would help you carry out this role?",
      type: "long_text", required: false, requiredWhenShown: true,
      conditionalOn: { questionId: "disability_adjustments", equals: true },
      maxLength: 2000,
    },
    yesNo("currently_pregnant", "Are you currently pregnant?"),
    yesNo("regular_medication", "Do you take any regular medication that may affect your work or require monitoring?"),
    {
      id: "medication_detail",
      prompt: "Please list current medications.",
      type: "long_text", required: false, requiredWhenShown: true,
      conditionalOn: { questionId: "regular_medication", equals: true },
      maxLength: 1000,
    },
    {
      id: "consent_oh_referral",
      prompt: "I consent to being referred to Occupational Health for further assessment if any answer above requires it.",
      type: "boolean", required: true,
    },
  ],
  signaturePrompt: "Type your full legal name to confirm this OH questionnaire is true and complete.",
};

// ─── Exposure-Prone Procedures (EPP) ───────────────────────────────
const EPP_DECLARATION: DeclarationDefinition = {
  key: "epp_declaration",
  title: "Exposure-Prone Procedures (EPP) Declaration",
  intro:
    "An exposure-prone procedure (EPP) is one in which the worker's gloved hands may be in contact with sharp instruments, needle tips or sharp tissues inside a patient's open body cavity, wound or confined anatomical space. This declaration captures your EPP status and BBV (Hepatitis B, Hepatitis C, HIV) clearance.",
  legalReferences: [
    "Department of Health: Integrated guidance on health clearance of healthcare workers and the management of healthcare workers infected with bloodborne viruses (2007)",
    "PHE / UKHSA EPP guidance",
  ],
  questions: [
    {
      id: "performs_epp",
      prompt: "Will your role involve performing exposure-prone procedures (EPPs)?",
      type: "enum", required: true,
      options: [
        { value: "yes", label: "Yes — I will perform EPPs" },
        { value: "no", label: "No — my role does not involve EPPs" },
        { value: "unsure", label: "Unsure" },
      ],
    },
    yesNo("hbv_vaccinated", "Have you completed a Hepatitis B (HBV) vaccination course?"),
    {
      id: "hbv_anti_hbs_titre",
      prompt: "Most recent anti-HBs titre (mIU/mL).",
      type: "number", required: false, placeholder: "e.g. 100",
      helpText: "A response >= 10 mIU/mL is generally considered protective; >= 100 is preferred for EPP roles.",
    },
    yesNo("hbv_surface_antigen_negative", "Have you had a Hepatitis B surface antigen (HBsAg) test with a negative result?"),
    yesNo("hcv_negative", "Have you had a Hepatitis C (anti-HCV / HCV-RNA) test with a negative result?"),
    yesNo("hiv_negative", "Have you had an HIV antibody test with a negative result?"),
    {
      id: "epp_evidence_file",
      prompt: "Upload your EPV (employment proof of vaccination / clearance) certificate.",
      type: "file", required: false,
      helpText: "PDF, JPG, or PNG. Optional but strongly recommended for EPP roles.",
    },
    yesNo(
      "any_known_bbv_infection",
      "Are you aware of any current bloodborne virus infection (HBV, HCV, HIV) that would restrict you from performing EPPs?",
    ),
    {
      id: "bbv_detail",
      prompt: "Please provide details so Occupational Health can advise.",
      type: "long_text", required: false, requiredWhenShown: true,
      conditionalOn: { questionId: "any_known_bbv_infection", equals: true },
      maxLength: 2000,
    },
    {
      id: "confirm_epp",
      prompt: "I confirm the above is accurate and I will notify Occupational Health immediately if my BBV status changes.",
      type: "boolean", required: true,
    },
  ],
  signaturePrompt: "Type your full legal name to sign this EPP declaration.",
};

// ─── European Working Time Directive ───────────────────────────────
const WORKING_TIME_DIRECTIVE: DeclarationDefinition = {
  key: "working_time_directive",
  title: "European Working Time Directive",
  intro:
    "The Working Time Regulations 1998 limit the average working week to 48 hours, calculated over a 17-week reference period. You may choose to opt out of this limit. You can withdraw an opt-out at any time by giving 7 days' written notice (or up to 3 months if specified in your contract).",
  legalReferences: ["Working Time Regulations 1998"],
  questions: [
    {
      id: "current_weekly_hours",
      prompt: "Average hours you currently work per week (across all jobs).",
      type: "number", required: true, placeholder: "e.g. 37.5",
    },
    yesNo("works_other_jobs", "Do you currently work for any other employer or have any other paid engagements?"),
    {
      id: "other_jobs_detail",
      prompt: "Please give brief details (employer, role, average weekly hours).",
      type: "long_text", required: false, requiredWhenShown: true,
      conditionalOn: { questionId: "works_other_jobs", equals: true },
      maxLength: 1000,
    },
    {
      id: "opt_choice",
      prompt: "Do you wish to opt OUT of the 48-hour weekly limit?",
      type: "enum", required: true,
      options: [
        { value: "opt_in", label: "Opt IN — I want to remain within the 48-hour weekly limit" },
        { value: "opt_out", label: "Opt OUT — I agree to work more than 48 hours per week on average" },
      ],
    },
    {
      id: "opt_effective_date",
      prompt: "Effective date of this opt-in / opt-out choice.",
      type: "date", required: true,
    },
    {
      id: "acknowledge_withdrawal",
      prompt: "I understand that if I have opted out, I may withdraw the opt-out by giving 7 days' written notice (or such longer period, up to 3 months, as may be specified in my contract).",
      type: "boolean", required: true,
    },
    {
      id: "acknowledge_rest_breaks",
      prompt: "I understand my entitlement to daily rest (11 hours), weekly rest, and rest breaks under the Working Time Regulations.",
      type: "boolean", required: true,
    },
  ],
  signaturePrompt: "Type your full legal name to record your Working Time Directive choice.",
};

// ─── Data Protection & Confidentiality ─────────────────────────────
const DATA_PROTECTION: DeclarationDefinition = {
  key: "data_protection",
  title: "Data Protection & Confidentiality",
  intro:
    "As a healthcare professional you handle special-category personal data and are bound by UK GDPR, the Data Protection Act 2018, the Common Law Duty of Confidence, the Caldicott Principles and the NMC Code. This declaration confirms your understanding of those obligations.",
  legalReferences: [
    "UK GDPR / Data Protection Act 2018",
    "Common Law Duty of Confidence",
    "Caldicott Principles (2013, updated 2020)",
    "NMC Code (2018)",
  ],
  questions: [
    yesNo("ack_uk_gdpr", "I understand the UK GDPR principles (lawfulness, fairness, transparency; purpose limitation; data minimisation; accuracy; storage limitation; integrity and confidentiality; accountability)."),
    yesNo("ack_caldicott", "I understand and will apply the Caldicott Principles when handling patient identifiable information."),
    yesNo("ack_minimum_necessary", "I will only access patient information on a need-to-know basis to deliver care, and will not access records out of curiosity (including my own, family members', or colleagues')."),
    yesNo("ack_no_sharing_outside", "I will not share patient or staff identifiable information outside the organisation without lawful basis (consent, vital interests, statutory duty, court order)."),
    yesNo("ack_no_social_media", "I will not post patient information, ward scenes, identifiable images, or comments that could identify patients on social media or any public forum."),
    yesNo("ack_secure_devices", "I will keep work devices secure, lock screens when unattended, and only use approved systems/storage to handle patient data."),
    yesNo("ack_breach_reporting", "I will report any actual or suspected data breach to my line manager and the DPO without delay, and at the latest within 24 hours of becoming aware."),
    yesNo("ack_subject_rights", "I understand individuals have rights to access, rectify, erase (where applicable), restrict and object to processing of their personal data."),
    yesNo("ack_post_employment", "I understand my duty of confidentiality continues after my employment ends."),
    {
      id: "confirm_dpa",
      prompt: "I confirm I have read and understood the above and agree to comply with all data protection and confidentiality obligations.",
      type: "boolean", required: true,
    },
  ],
  signaturePrompt: "Type your full legal name to sign this data protection declaration.",
};

// ─── Age (18+) & Eligibility to Work ───────────────────────────────
const AGE_AND_ELIGIBILITY: DeclarationDefinition = {
  key: "age_and_eligibility",
  title: "Age (18+) & Eligibility to Work",
  intro:
    "We must verify that you are aged 18 or over and have the right to work in the United Kingdom under the Immigration, Asylum and Nationality Act 2006. This declaration captures your DOB, right-to-work category and (where applicable) Home Office share code.",
  legalReferences: [
    "Immigration, Asylum and Nationality Act 2006",
    "Home Office Right to Work checks: an employer's guide",
  ],
  questions: [
    {
      id: "date_of_birth",
      prompt: "Date of birth.",
      type: "date", required: true,
    },
    {
      id: "confirm_18_plus",
      prompt: "I confirm I am aged 18 or over.",
      type: "boolean", required: true,
    },
    {
      id: "rtw_category",
      prompt: "Right-to-work category.",
      type: "enum", required: true,
      options: [
        { value: "british_irish", label: "British or Irish citizen" },
        { value: "settled_status", label: "EU Settled / Pre-Settled Status" },
        { value: "ilr", label: "Indefinite Leave to Remain" },
        { value: "skilled_worker_visa", label: "Skilled Worker / Health & Care Worker visa" },
        { value: "student_visa", label: "Student visa with work allowance" },
        { value: "graduate_visa", label: "Graduate visa" },
        { value: "other_visa", label: "Other visa or status" },
      ],
    },
    {
      id: "share_code",
      prompt: "Home Office share code (if applicable).",
      type: "short_text", required: false, maxLength: 32,
      helpText: "Required for non-British/Irish citizens. Generate at gov.uk/prove-right-to-work.",
    },
    {
      id: "share_code_expiry",
      prompt: "Visa / share-code expiry date (if applicable).",
      type: "date", required: false,
    },
    {
      id: "rtw_document_type",
      prompt: "Primary right-to-work document type.",
      type: "enum", required: true,
      options: [
        { value: "passport", label: "Passport" },
        { value: "brp", label: "Biometric Residence Permit (BRP)" },
        { value: "evisa", label: "eVisa / digital status" },
        { value: "birth_certificate_ni", label: "UK birth certificate + NI proof" },
        { value: "other", label: "Other" },
      ],
    },
    {
      id: "rtw_document_reference",
      prompt: "Document number / reference (e.g. passport number).",
      type: "short_text", required: true, maxLength: 64,
    },
    {
      id: "rtw_document_file",
      prompt: "Upload a scan or photo of your right-to-work document.",
      type: "file", required: true,
      helpText: "PDF, JPG or PNG. Used by HR to verify your right to work.",
    },
    {
      id: "ack_notify_changes",
      prompt: "I will notify HR within 7 days of any change to my immigration status, visa expiry or right-to-work conditions.",
      type: "boolean", required: true,
    },
    {
      id: "confirm_truthful_rtw",
      prompt: "I confirm the information I have provided is true and I have the right to work in the United Kingdom in the role offered.",
      type: "boolean", required: true,
    },
  ],
  signaturePrompt: "Type your full legal name to confirm your age and right-to-work declaration.",
};

const REGISTRY: Record<string, DeclarationDefinition> = {
  rehab_of_offenders: REHAB_OF_OFFENDERS,
  occupational_health: OCCUPATIONAL_HEALTH,
  epp_declaration: EPP_DECLARATION,
  working_time_directive: WORKING_TIME_DIRECTIVE,
  data_protection: DATA_PROTECTION,
  age_and_eligibility: AGE_AND_ELIGIBILITY,
};

export const DECLARATION_KEYS = Object.keys(REGISTRY);

export function getDeclaration(key: string): DeclarationDefinition | undefined {
  return REGISTRY[key];
}

export function listDeclarations(): DeclarationDefinition[] {
  return DECLARATION_KEYS.map((k) => REGISTRY[k]);
}

// Decide whether a question must be answered, given the partial answers
// already supplied. Handles `required` and `requiredWhenShown` semantics.
export function isQuestionRequired(
  q: DeclarationQuestion,
  answers: Record<string, unknown>,
): boolean {
  if (q.conditionalOn) {
    const parent = answers[q.conditionalOn.questionId];
    const matches = parent === q.conditionalOn.equals;
    if (!matches) return false;
    return !!q.requiredWhenShown || q.required;
  }
  return q.required;
}

// Validate a complete answer set for submission. Returns a list of
// { questionId, message } errors; empty array means valid.
export interface DeclarationValidationError {
  questionId: string;
  message: string;
}

export function validateAnswersForSubmission(
  declaration: DeclarationDefinition,
  answers: Record<string, unknown>,
): DeclarationValidationError[] {
  const errors: DeclarationValidationError[] = [];
  for (const q of declaration.questions) {
    const required = isQuestionRequired(q, answers);
    const value = answers[q.id];
    if (!required) {
      // Still type-check supplied values so we don't store garbage.
      if (value === undefined || value === null || value === "") continue;
    } else if (value === undefined || value === null || value === "") {
      errors.push({ questionId: q.id, message: "This answer is required." });
      continue;
    }
    switch (q.type) {
      case "boolean":
        if (typeof value !== "boolean") {
          errors.push({ questionId: q.id, message: "Answer must be true or false." });
        } else if (required && q.id.startsWith("ack_") && value !== true) {
          // Acknowledgement-style booleans must be true to count.
          errors.push({ questionId: q.id, message: "You must acknowledge this statement." });
        } else if (required && q.id.startsWith("confirm_") && value !== true) {
          errors.push({ questionId: q.id, message: "You must confirm this statement." });
        }
        break;
      case "enum":
        if (typeof value !== "string" || !q.options?.some((o) => o.value === value)) {
          errors.push({ questionId: q.id, message: "Please select one of the available options." });
        }
        break;
      case "short_text":
      case "long_text":
        if (typeof value !== "string") {
          errors.push({ questionId: q.id, message: "Answer must be text." });
        } else if (q.maxLength && value.length > q.maxLength) {
          errors.push({ questionId: q.id, message: `Answer must be ${q.maxLength} characters or fewer.` });
        }
        break;
      case "date":
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          errors.push({ questionId: q.id, message: "Please enter a valid date (YYYY-MM-DD)." });
        }
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          errors.push({ questionId: q.id, message: "Please enter a non-negative number." });
        }
        break;
      case "file":
        if (!isFileAnswer(value)) {
          errors.push({ questionId: q.id, message: "Please upload a file." });
        }
        break;
    }
  }
  return errors;
}
