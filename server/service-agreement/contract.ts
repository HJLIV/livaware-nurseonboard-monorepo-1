// Service Agreement (Registered Nurse) — single source of truth for the
// on-screen contract text, the configurable values (Recovery Fee figure +
// Livaware countersignatory), and the structured identity fields the nurse
// completes when signing (task 170).
//
// The clause text is transcribed verbatim from
// attached_assets/Service_AgreementRN_1780327017681.docx. It is a FIXED
// template: only the Recovery Fee figure (clause 12.1) and the Livaware
// countersignatory name/position are admin-configurable. Both the on-screen
// agreement and the generated PDF render from this module so they stay
// identical.

import { storage } from "../storage";

export const SERVICE_AGREEMENT_KEY = "service_agreement";
export const SERVICE_AGREEMENT_VERSION = 1;
export const SERVICE_AGREEMENT_TITLE = "Service Agreement — Registered Nurse";
export const SERVICE_AGREEMENT_CONFIG_KEY = "service_agreement_config";

// Token substituted into clause 12.1 at render time.
const RECOVERY_FEE_TOKEN = "{{RECOVERY_FEE}}";

// The full, editable Service Agreement. The hardcoded constants further down
// this file are the DEFAULT (seed) values — once a super-admin saves an edit,
// the stored config in appSettings becomes the single source of truth and the
// constants are only used as fallbacks for any field that is missing/invalid.
export interface ServiceAgreementConfig {
  // Auto-managed version. ANY content change (preamble/clauses/executionNote/
  // recoveryFee/countersignatory/title) bumps this so previously-signed nurses
  // are forced to re-sign.
  version: number;
  title: string;
  preamble: string[];
  clauses: ServiceAgreementClause[];
  executionNote: string;
  // Fixed-sum Recovery Fee inserted into clause 12.1 (rendered as "£<value>").
  recoveryFee: string;
  // Livaware's countersignatory printed in the execution block / PDF.
  countersignatoryName: string;
  countersignatoryPosition: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

// The subset of config fields that make up the legally-binding content. A
// change to ANY of these bumps the version and forces a re-sign.
export type ServiceAgreementContent = Pick<
  ServiceAgreementConfig,
  | "title"
  | "preamble"
  | "clauses"
  | "executionNote"
  | "recoveryFee"
  | "countersignatoryName"
  | "countersignatoryPosition"
>;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isClauseArray(v: unknown): v is ServiceAgreementClause[] {
  return (
    Array.isArray(v) &&
    v.every(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof (c as any).number === "string" &&
        typeof (c as any).title === "string" &&
        Array.isArray((c as any).items) &&
        (c as any).items.every(
          (it: any) => it && typeof it.n === "string" && typeof it.text === "string",
        ),
    )
  );
}

// Coerce arbitrary input into the canonical clause shape with a stable key
// order, so content signatures are deterministic.
function normalizeClauses(clauses: ServiceAgreementClause[]): ServiceAgreementClause[] {
  return clauses.map((c) => ({
    number: String(c.number),
    title: String(c.title),
    items: c.items.map((it) => ({ n: String(it.n), text: String(it.text) })),
  }));
}

// Deterministic signature of the legally-binding content (excludes version /
// updatedAt / updatedBy). Used to decide whether a save is a real amendment.
function contentSignature(c: ServiceAgreementContent): string {
  return JSON.stringify({
    title: c.title,
    preamble: c.preamble,
    clauses: normalizeClauses(c.clauses),
    executionNote: c.executionNote,
    recoveryFee: c.recoveryFee,
    countersignatoryName: c.countersignatoryName,
    countersignatoryPosition: c.countersignatoryPosition,
  });
}

export function getDefaultServiceAgreementConfig(): ServiceAgreementConfig {
  return {
    version: SERVICE_AGREEMENT_VERSION,
    title: SERVICE_AGREEMENT_TITLE,
    preamble: [...SERVICE_AGREEMENT_PREAMBLE],
    clauses: normalizeClauses(SERVICE_AGREEMENT_CLAUSES),
    executionNote: SERVICE_AGREEMENT_EXECUTION_NOTE,
    recoveryFee: "5,000",
    countersignatoryName: "Livaware Ltd",
    countersignatoryPosition: "Director",
    updatedAt: null,
    updatedBy: null,
  };
}

export async function getServiceAgreementConfig(): Promise<ServiceAgreementConfig> {
  const def = getDefaultServiceAgreementConfig();
  const stored = await storage.getAppSetting<Partial<ServiceAgreementConfig>>(
    SERVICE_AGREEMENT_CONFIG_KEY,
  );
  if (!stored) return def;
  const str = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v : fallback;
  return {
    version:
      typeof stored.version === "number" && Number.isFinite(stored.version) && stored.version >= 1
        ? Math.floor(stored.version)
        : def.version,
    title: str(stored.title, def.title),
    preamble: isStringArray(stored.preamble) ? stored.preamble : def.preamble,
    clauses: isClauseArray(stored.clauses) ? normalizeClauses(stored.clauses) : def.clauses,
    executionNote: str(stored.executionNote, def.executionNote),
    recoveryFee: str(stored.recoveryFee, def.recoveryFee),
    countersignatoryName: str(stored.countersignatoryName, def.countersignatoryName),
    countersignatoryPosition: str(stored.countersignatoryPosition, def.countersignatoryPosition),
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : null,
    updatedBy: typeof stored.updatedBy === "string" ? stored.updatedBy : null,
  };
}

export async function getCurrentServiceAgreementVersion(): Promise<number> {
  return (await getServiceAgreementConfig()).version;
}

export interface SaveServiceAgreementResult {
  config: ServiceAgreementConfig;
  versionBumped: boolean;
  previousVersion: number;
}

// Validate + coerce an incoming admin edit into a content patch. Returns the
// sanitized patch plus any validation errors (empty array = valid).
export function sanitizeServiceAgreementContentPatch(raw: unknown): {
  patch: Partial<ServiceAgreementContent>;
  errors: { field: string; message: string }[];
} {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const patch: Partial<ServiceAgreementContent> = {};
  const errors: { field: string; message: string }[] = [];

  if (body.title !== undefined) {
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    else errors.push({ field: "title", message: "Title is required." });
  }
  if (body.preamble !== undefined) {
    if (isStringArray(body.preamble))
      patch.preamble = body.preamble.map((p) => p).filter((p) => p.trim().length > 0);
    else errors.push({ field: "preamble", message: "Preamble must be a list of paragraphs." });
  }
  if (body.clauses !== undefined) {
    if (isClauseArray(body.clauses)) {
      const clauses = normalizeClauses(body.clauses)
        .map((c) => ({
          ...c,
          items: c.items.filter((it) => it.n.trim().length > 0 || it.text.trim().length > 0),
        }))
        .filter((c) => c.title.trim().length > 0 || c.items.length > 0);
      if (clauses.length === 0)
        errors.push({ field: "clauses", message: "At least one clause is required." });
      else patch.clauses = clauses;
    } else {
      errors.push({ field: "clauses", message: "Clauses are malformed." });
    }
  }
  if (body.executionNote !== undefined) {
    if (typeof body.executionNote === "string") patch.executionNote = body.executionNote.trim();
    else errors.push({ field: "executionNote", message: "Execution note must be text." });
  }
  if (body.recoveryFee !== undefined) {
    if (typeof body.recoveryFee === "string" && body.recoveryFee.trim())
      patch.recoveryFee = body.recoveryFee.trim();
    else errors.push({ field: "recoveryFee", message: "Recovery Fee is required." });
  }
  if (body.countersignatoryName !== undefined) {
    if (typeof body.countersignatoryName === "string" && body.countersignatoryName.trim())
      patch.countersignatoryName = body.countersignatoryName.trim();
    else errors.push({ field: "countersignatoryName", message: "Countersignatory name is required." });
  }
  if (body.countersignatoryPosition !== undefined) {
    if (typeof body.countersignatoryPosition === "string" && body.countersignatoryPosition.trim())
      patch.countersignatoryPosition = body.countersignatoryPosition.trim();
    else
      errors.push({
        field: "countersignatoryPosition",
        message: "Countersignatory position is required.",
      });
  }
  return { patch, errors };
}

export async function saveServiceAgreementConfig(
  patch: Partial<ServiceAgreementContent>,
  updatedBy: string,
): Promise<SaveServiceAgreementResult> {
  const current = await getServiceAgreementConfig();
  const nextContent: ServiceAgreementContent = {
    title: patch.title ?? current.title,
    preamble: patch.preamble ?? current.preamble,
    clauses: patch.clauses ?? current.clauses,
    executionNote: patch.executionNote ?? current.executionNote,
    recoveryFee: patch.recoveryFee ?? current.recoveryFee,
    countersignatoryName: patch.countersignatoryName ?? current.countersignatoryName,
    countersignatoryPosition: patch.countersignatoryPosition ?? current.countersignatoryPosition,
  };
  const versionBumped =
    contentSignature(nextContent) !==
    contentSignature({
      title: current.title,
      preamble: current.preamble,
      clauses: current.clauses,
      executionNote: current.executionNote,
      recoveryFee: current.recoveryFee,
      countersignatoryName: current.countersignatoryName,
      countersignatoryPosition: current.countersignatoryPosition,
    });
  const next: ServiceAgreementConfig = {
    ...nextContent,
    clauses: normalizeClauses(nextContent.clauses),
    version: versionBumped ? current.version + 1 : current.version,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  await storage.setAppSetting(SERVICE_AGREEMENT_CONFIG_KEY, next, updatedBy);
  return { config: next, versionBumped, previousVersion: current.version };
}

// ─── Identity fields the nurse completes in the signature block ──────────
export interface ServiceAgreementField {
  id: "nmcPin" | "rcnMembershipNo" | "utrCompanyNumber" | "businessName";
  label: string;
  required: boolean;
  helpText?: string;
}

export const SERVICE_AGREEMENT_FIELDS: ServiceAgreementField[] = [
  {
    id: "businessName",
    label: "Business / Company name (if applicable)",
    required: false,
    helpText: "Leave blank if you operate as a sole trader without a company name.",
  },
  {
    id: "utrCompanyNumber",
    label: "UTR / Company number",
    required: true,
    helpText: "Your Unique Taxpayer Reference, or your company registration number.",
  },
  {
    id: "nmcPin",
    label: "NMC PIN",
    required: true,
  },
  {
    id: "rcnMembershipNo",
    label: "RCN (or equivalent) membership no.",
    required: true,
    helpText: "Royal College of Nursing membership number, or equivalent professional body with professional liability insurance.",
  },
];

// ─── Contract body ───────────────────────────────────────────────────────
export interface ServiceAgreementClause {
  number: string;
  title: string;
  items: { n: string; text: string }[];
}

export const SERVICE_AGREEMENT_PREAMBLE: string[] = [
  "Contract for Services (Independent Contractor)",
  "This Agreement is made between:",
  "(1)  Livaware Ltd, a company registered in England and Wales, of 128 City Road, London EC1V 2NX (the “Contractor” / “Livaware”); and",
  "(2)  the individual or entity identified in the execution section below (the “Subcontractor”).",
  "This Agreement commences on the date of signature below and supersedes any previous agreement between the parties. It is to be read together with the Registered Nurse Expected Roles & Responsibilities document available on Practice Index, which forms part of this Agreement.",
];

export const SERVICE_AGREEMENT_CLAUSES: ServiceAgreementClause[] = [
  {
    number: "1",
    title: "Status and Purpose",
    items: [
      { n: "1.1", text: "This Agreement is a contract for services. It does not create a contract of employment, a worker relationship, a partnership, or an agency relationship between the parties, and nothing in it shall be construed as doing so." },
      { n: "1.2", text: "The Subcontractor operates as an independent business providing specialist healthcare and support services to Livaware. The Subcontractor is responsible for their own income tax, National Insurance, and compliance with all applicable laws and regulations relating to the operation of their business." },
      { n: "1.3", text: "The Subcontractor is not part of Livaware’s core business structure, is not entitled to participate in any Livaware benefits or pension scheme, and is not entitled to payment for holiday, sickness, absence, cancelled shifts, or site closures." },
      { n: "1.4", text: "The Subcontractor agrees to provide professional healthcare services in a competent and workmanlike manner, as and when agreed." },
    ],
  },
  {
    number: "2",
    title: "Scope and Place of Work",
    items: [
      { n: "2.1", text: "The Subcontractor may be offered visits or shifts (including 12-hour shifts) on a roster pattern as agreed, with remuneration agreed prior to each assignment." },
      { n: "2.2", text: "The Subcontractor will provide services at locations agreed at the start of each assignment. The Subcontractor is not obliged to work at alternative sites but may do so at their discretion, with the right to renegotiate terms." },
      { n: "2.3", text: "Each individual assignment represents a separate contract for services, commencing afresh with each assignment. For the avoidance of doubt, the obligations in clauses 7 to 12 (Confidentiality, Intellectual Property, Protection of Clients, Non-Solicitation of Personnel, and Recovery Fee) apply during and after each assignment and survive the ending of any individual assignment and of this Agreement as a whole, and the Restricted Period is calculated from the last date on which the Subcontractor provided services to or in respect of the relevant Client." },
    ],
  },
  {
    number: "3",
    title: "Availability and Other Engagements",
    items: [
      { n: "3.1", text: "Livaware may offer work opportunities, but the Subcontractor has the right to accept or decline. There is no obligation on Livaware to offer work, nor on the Subcontractor to accept it." },
      { n: "3.2", text: "The Subcontractor is free to undertake work for other organisations and clients before, during, and after this Agreement, and is not obliged to prioritise Livaware’s work over other engagements. This freedom is subject only to the restrictions in clauses 7 to 12, which are limited to the protection of Livaware’s confidential information, client connections, and goodwill, and do not otherwise restrict the Subcontractor from working in their profession." },
    ],
  },
  {
    number: "4",
    title: "Direction and Control",
    items: [
      { n: "4.1", text: "The Subcontractor operates independently and is responsible for managing their own workload and schedule." },
      { n: "4.2", text: "The Subcontractor must comply with health and safety regulations and any site-specific security or attendance procedures, and must follow the agreed care plan for each Client." },
    ],
  },
  {
    number: "5",
    title: "Payment Terms",
    items: [
      { n: "5.1", text: "Fees are agreed prior to each assignment and confirmed in writing where necessary. The Subcontractor must submit invoices for completed work, and payment will be made accordingly." },
      { n: "5.2", text: "No payment is due for holiday, sickness or absence, cancelled shifts, or site closures due to unforeseen circumstances (for example, weather events)." },
    ],
  },
  {
    number: "6",
    title: "Insurance, Liability, Tax",
    items: [
      { n: "6.1", text: "Livaware provides Medical Malpractice and Public Liability insurance for Registered Nurses working under this Agreement, provided the Subcontractor maintains membership of the Royal College of Nursing (RCN) or an equivalent professional body that includes professional liability insurance. The Subcontractor must provide their own safety equipment, transport, tools, business stationery, and any other costs of running their own business, and their own Employers’ Liability Insurance where required." },
      { n: "6.2", text: "The Subcontractor is fully responsible for their own tax and National Insurance obligations. The Subcontractor shall indemnify Livaware against any income tax, National Insurance, penalties, or interest for which Livaware is held liable arising from the Subcontractor’s engagement under this Agreement, save where caused by Livaware’s default." },
    ],
  },
  {
    number: "7",
    title: "Confidential Information",
    items: [
      { n: "7.1", text: "“Confidential Information” means all information relating to Livaware, its Clients, and its business which is not in the public domain, including: the identity, contact details, medical and personal circumstances of Clients and their families; care plans, clinical records, and assessments (including MATRON assessments); pricing, fee arrangements, and commercial terms; business methods, systems, and know-how; and any data held in Semble or other Livaware systems." },
      { n: "7.2", text: "The Subcontractor shall not, during the engagement or at any time after it ends, use or disclose any Confidential Information except as strictly required to perform the services or as required by law or professional regulation. This obligation is not limited in time." },
      { n: "7.3", text: "On the ending of any assignment or this Agreement, the Subcontractor shall return or securely destroy all Confidential Information and any Livaware property in their possession." },
    ],
  },
  {
    number: "8",
    title: "Data Protection",
    items: [
      { n: "8.1", text: "The Subcontractor shall comply with the UK GDPR and the Data Protection Act 2018, and with Livaware’s information governance policies, in respect of all personal data (including special category health data) accessed in the course of the services. The Subcontractor shall not retain, copy, or process Client personal data otherwise than as necessary to deliver the agreed care and shall report any data breach to Livaware without delay." },
    ],
  },
  {
    number: "9",
    title: "Intellectual Property and Records",
    items: [
      { n: "9.1", text: "All clinical records, documentation, notes, materials, and work product created by the Subcontractor in the course of providing the services, and all intellectual property in them, are and shall remain the property of Livaware. The Subcontractor assigns to Livaware all such rights and shall execute any document reasonably required to give effect to this clause." },
    ],
  },
  {
    number: "10",
    title: "Protection of Clients and Business Connections",
    items: [
      { n: "10.1", text: "Definitions. “Restricted Period” means the period of 6 months ending on the last date the Subcontractor provided services to or in respect of the relevant Client. “Restricted Client” means any person, patient, or family to whom the Subcontractor personally provided services, or with whom the Subcontractor had material dealings, or about whom the Subcontractor held Confidential Information, in the 12 months before the relevant date. “Restricted Services” means nursing, care, or support services of the kind provided by Livaware." },
      { n: "10.2", text: "Non-solicitation. During the Restricted Period and for 6 months afterwards, the Subcontractor shall not, directly or indirectly, solicit, approach, or canvass any Restricted Client with a view to providing Restricted Services otherwise than through Livaware." },
      { n: "10.3", text: "Non-dealing. During the Restricted Period and for 6 months afterwards, the Subcontractor shall not, directly or indirectly, provide Restricted Services to any Restricted Client otherwise than through Livaware, whether or not the Restricted Client first approached the Subcontractor. This includes providing services privately, through the Subcontractor’s own company, or through any other organisation." },
      { n: "10.4", text: "Acknowledgement. The Subcontractor acknowledges that these restrictions are limited to clients with whom they had a genuine connection through Livaware, are reasonable in scope and duration, and protect a legitimate business interest. Each restriction is separate and independently enforceable." },
    ],
  },
  {
    number: "11",
    title: "Non-Solicitation of Personnel",
    items: [
      { n: "11.1", text: "During the engagement and for 6 months after it ends, the Subcontractor shall not, directly or indirectly, solicit, entice, or attempt to entice away from Livaware any nurse, clinician, or other personnel with whom the Subcontractor worked or had dealings in the 12 months before that date, nor engage or employ any such person in a competing capacity." },
    ],
  },
  {
    number: "12",
    title: "Recovery Fee (Liquidated Damages)",
    items: [
      { n: "12.1", text: `If the Subcontractor breaches clause 10.2 or 10.3 (taking or dealing with a Restricted Client), the Subcontractor shall pay Livaware a Recovery Fee equal to the gross fees Livaware would reasonably have expected to earn from that Restricted Client over the Restricted Period, or a fixed sum of £${RECOVERY_FEE_TOKEN}, whichever is the greater.` },
      { n: "12.2", text: "The parties agree that the Recovery Fee is a genuine pre-estimate of the loss Livaware would suffer (including loss of revenue, and the cost of recruiting, onboarding, training, insuring, and building the client relationship), is proportionate to Livaware’s legitimate interest in protecting its client connections, and is not a penalty." },
      { n: "12.3", text: "The Recovery Fee is payable in addition to, and without limiting, any other remedy available to Livaware, including an injunction to restrain a breach of clauses 7 to 11." },
    ],
  },
  {
    number: "13",
    title: "Standards of Performance and Conduct",
    items: [
      { n: "13.1", text: "Livaware may discontinue offering work if the Subcontractor’s performance or conduct falls below an acceptable standard. The Subcontractor is responsible for rectifying any defective work at their own cost or in their own time." },
      { n: "13.2", text: "The Subcontractor must comply with the NMC Code, CQC Fundamental Standards, and Livaware’s clinical policies, and must represent Livaware professionally in all settings." },
    ],
  },
  {
    number: "14",
    title: "Equal Opportunities and Health & Safety",
    items: [
      { n: "14.1", text: "Livaware upholds an Equal Opportunities Policy to prevent discrimination based on any protected characteristic. The Subcontractor must not engage in discriminatory conduct toward Livaware’s personnel, clients, or other subcontractors." },
      { n: "14.2", text: "The Subcontractor must take reasonable measures to safeguard their own health and safety and that of those around them." },
    ],
  },
  {
    number: "15",
    title: "Termination",
    items: [
      { n: "15.1", text: "Either party may terminate this Agreement on one month’s written notice. In cases of gross misconduct, Livaware may terminate immediately." },
      { n: "15.2", text: "Clauses 7, 8, 9, 10, 11, and 12 survive termination of this Agreement and continue to bind the Subcontractor in accordance with their terms." },
    ],
  },
  {
    number: "16",
    title: "Severability, Entire Agreement, Governing Law",
    items: [
      { n: "16.1", text: "Each of the restrictions in clauses 7 to 12 is a separate and severable obligation. If any restriction is held by a court to be unenforceable but would be enforceable if part of its wording were deleted or its period or scope reduced, it shall apply with such modification as is necessary to make it enforceable, and the remaining restrictions shall be unaffected." },
      { n: "16.2", text: "This Agreement (together with the Roles & Responsibilities document) constitutes the entire agreement between the parties and supersedes any prior agreement." },
      { n: "16.3", text: "This Agreement is governed by the law of England and Wales, and the parties submit to the exclusive jurisdiction of the courts of England and Wales." },
    ],
  },
];

export const SERVICE_AGREEMENT_EXECUTION_NOTE =
  "Each party confirms they have read, understood, and agree to be bound by this Agreement.";

// Resolve clause text with the configurable Recovery Fee substituted in.
// Reads from the (editable) config clauses, not the seed constants.
export function renderClauses(
  config: ServiceAgreementConfig,
): ServiceAgreementClause[] {
  return config.clauses.map((clause) => ({
    ...clause,
    items: clause.items.map((item) => ({
      ...item,
      text: item.text.split(RECOVERY_FEE_TOKEN).join(config.recoveryFee),
    })),
  }));
}

// The full payload the portal page + admin both consume.
export async function buildServiceAgreementContract() {
  const config = await getServiceAgreementConfig();
  return {
    key: SERVICE_AGREEMENT_KEY,
    version: config.version,
    title: config.title,
    preamble: config.preamble,
    clauses: renderClauses(config),
    executionNote: config.executionNote,
    fields: SERVICE_AGREEMENT_FIELDS,
    countersignatory: {
      name: config.countersignatoryName,
      position: config.countersignatoryPosition,
    },
  };
}

// Read-only snapshot of the seed defaults, kept for existing imports. Defined
// after the seed constants above so it is initialized without a TDZ error.
export const DEFAULT_SERVICE_AGREEMENT_CONFIG: ServiceAgreementConfig =
  getDefaultServiceAgreementConfig();
