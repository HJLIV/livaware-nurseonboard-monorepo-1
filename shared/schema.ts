import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, boolean, timestamp, jsonb, json, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== ENUMS ====================

// Unified nurse journey
export const nurseStageEnum = pgEnum("nurse_stage", ["preboard", "onboard", "skills_arcade", "completed"]);
export const preboardStatusEnum = pgEnum("preboard_status", ["not_started", "in_progress", "completed", "flagged"]);
export const onboardStatusEnum = pgEnum("onboard_status_enum", ["not_started", "in_progress", "cleared", "escalated", "blocked"]);
export const arcadeStatusEnum = pgEnum("arcade_status", ["not_started", "in_progress", "competent", "remediation"]);

// Portal & Audit
export const portalModuleEnum = pgEnum("portal_module", ["preboard", "onboard", "skills_arcade", "hub"]);
export const auditModuleEnum = pgEnum("audit_module", ["preboard", "onboard", "skills_arcade", "admin", "portal", "portal_auth", "system", "availability", "invoices", "announcements", "documents", "supervision", "hbc", "lms", "internal_training", "service_agreement"]);
export const supervisionTypeEnum = pgEnum("supervision_type", ["supervision", "appraisal", "reflection", "other"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["submitted", "approved", "paid", "reconciled", "rejected"]);

// Onboard enums
export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "application", "verification", "competency", "references", "induction", "cleared", "blocked", "escalated", "archived"
]);
export const verificationStatusEnum = pgEnum("verification_status", ["pending", "verified", "failed", "escalated"]);
export const competencyLevelEnum = pgEnum("competency_level", ["not_declared", "level_1", "level_2", "level_3", "level_4"]);
export const declarationStatusEnum = pgEnum("declaration_status", ["declared", "under_review", "approved", "flagged"]);
export const referenceOutcomeEnum = pgEnum("reference_outcome", ["pending", "sent", "received", "escalated", "expired", "flagged"]);

// Skills Arcade enums
export const roleEnum = pgEnum("role", ["nurse", "trainer", "admin"]);
export const assignmentStatusEnum = pgEnum("assignment_status", ["not_started", "in_progress", "passed", "failed", "locked"]);
export const attemptResultEnum = pgEnum("attempt_result", ["pass", "fail", "abandoned"]);
export const remediationStatusEnum = pgEnum("remediation_status", ["open", "in_progress", "completed"]);
export const clearanceStatusEnum = pgEnum("clearance_status", ["cleared", "restricted", "pending"]);

// ==================== UNIFIED CORE TABLES ====================

export const nurses = pgTable("nurses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  dateOfBirth: text("date_of_birth"),
  address: text("address"),
  preferredPronouns: text("preferred_pronouns"),
  nextOfKin: text("next_of_kin"),
  nmcPin: text("nmc_pin"),
  passportNumber: text("passport_number"),
  dbsNumber: text("dbs_number"),
  band: integer("band"),
  specialisms: text("specialisms").array(),
  currentEmployer: text("current_employer"),
  yearsQualified: integer("years_qualified"),
  currentStage: nurseStageEnum("current_stage").default("preboard").notNull(),
  preboardStatus: preboardStatusEnum("preboard_status").default("not_started").notNull(),
  onboardStatus: onboardStatusEnum("onboard_status").default("not_started").notNull(),
  arcadeStatus: arcadeStatusEnum("arcade_status").default("not_started").notNull(),
  onboardingStep: onboardingStatusEnum("onboarding_step").default("application"),
  fastTracked: boolean("fast_tracked").default(false).notNull(),
  fastTrackReason: text("fast_track_reason"),
  passportPhotoPath: text("passport_photo_path"),
  archivedAt: timestamp("archived_at"),
  archivedBy: text("archived_by"),
  // ─── Onboarding access gate (task 94) ─────────────────────────────
  // CV admin review (one of the three Assessment-group prerequisites
  // alongside the clinical examination and the competency self-rating).
  cvReviewedAt: timestamp("cv_reviewed_at"),
  cvReviewedBy: text("cv_reviewed_by"),
  // 'auto' (default) flips the lock open as soon as the three
  // prerequisites are satisfied; 'manual' requires an explicit admin
  // unlock action regardless of prerequisite state.
  onboardingUnlockMode: text("onboarding_unlock_mode").default("auto").notNull(),
  // When the gate flipped open. Once set, the nurse stays unlocked
  // unless an admin explicitly re-locks them (which clears this).
  onboardingUnlockedAt: timestamp("onboarding_unlocked_at"),
  onboardingUnlockedBy: text("onboarding_unlocked_by"),
  // Free-text reason recorded when an admin re-locks a previously
  // unlocked nurse (surfaced in the audit detail + admin panel).
  onboardingLockedReason: text("onboarding_locked_reason"),
  // ─── Compliance-approval gate for Induction & Training ─────────
  // Admin clicks "Approve compliance" once they're satisfied that
  // every Compliance-group questionnaire has been completed and
  // checked. Setting this timestamp unlocks the Induction & Training
  // group (Policies, Training documents, Induction handbook, SOP
  // comprehension and Skills Arcade) for the nurse. Clearing it
  // re-locks them.
  complianceApprovedAt: timestamp("compliance_approved_at"),
  complianceApprovedBy: text("compliance_approved_by"),
  // ─── Uniform sizing (task 153) ───────────────────────────────────
  // Captured once on the nurse profile so the office doesn't have to
  // keep re-asking. Top / trouser are free text (e.g. "M 40-42" or
  // "L 14"). Length is one of `short | regular | long` — only
  // meaningful for women's-cut trousers, optional otherwise.
  uniformTopSize: text("uniform_top_size"),
  uniformTrouserSize: text("uniform_trouser_size"),
  uniformTrouserLength: text("uniform_trouser_length"),
  uniformSizingUpdatedAt: timestamp("uniform_sizing_updated_at"),
  uniformSizingUpdatedBy: text("uniform_sizing_updated_by"),
  // ─── Invoice billing profile (task 134) ───────────────────────────
  // Last-used personal + bank details + hourly rate captured from any
  // invoice the nurse submits. Used to prefill the new-invoice wizard
  // so they don't re-enter the same details for each timesheet.
  invoiceBillingProfile: jsonb("invoice_billing_profile").$type<{
    personalDetails?: {
      fullName?: string;
      ltdCompany?: string | null;
      utr?: string | null;
      address?: string;
      email?: string;
      phoneNumber?: string;
    };
    bankDetails?: {
      accountType?: "personal" | "business";
      accountName?: string;
      bankName?: string;
      sortCode?: string;
      accountNumber?: string;
    };
    hourlyRatePence?: number;
    paymentNotes?: string | null;
    updatedAt?: string;
  } | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type NurseInvoiceBillingProfile = NonNullable<typeof nurses.$inferSelect.invoiceBillingProfile>;

export const portalLinks = pgTable("portal_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  token: varchar("token").notNull().unique(),
  module: portalModuleEnum("module").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  usedAt: timestamp("used_at"),
  // When the link was first redeemed to bootstrap a passwordless portal
  // session. After this is set the link is considered "consumed" — it
  // can no longer be used to mint a new session and the user is bounced
  // to /portal/sign-in to request a 6-digit email code.
  claimedAt: timestamp("claimed_at"),
  createdBy: text("created_by"),
}, (table) => [
  index("portal_links_nurse_id_idx").on(table.nurseId),
  index("portal_links_token_idx").on(table.token),
]);

// ──────────── Portal passwordless auth (task 107) ────────────
// Short-lived 6-digit email codes used by nurses to sign back into
// their portal after the initial bootstrap link is consumed. Codes
// expire after 10 minutes, are single-use, and have a small attempts
// counter so brute-forcing one code is bounded.
export const portalAuthCodes = pgTable("portal_auth_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  // SHA-256 of the 6-digit code. Only the hash is stored.
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attemptsRemaining: integer("attempts_remaining").default(5).notNull(),
  consumedAt: timestamp("consumed_at"),
  requestedIp: text("requested_ip"),
  requestedUserAgent: text("requested_user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("portal_auth_codes_nurse_id_idx").on(table.nurseId),
  index("portal_auth_codes_expires_at_idx").on(table.expiresAt),
]);

// Active passwordless portal sessions. The cookie value is the random
// session token; only its SHA-256 hash is stored here so a DB leak
// can't be replayed as a live session. Default lifetime is 7 days.
export const portalSessions = pgTable("portal_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  sessionTokenHash: text("session_token_hash").notNull().unique(),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  // How the session came into being — bootstrap link claim vs. email-code login.
  issuedVia: text("issued_via").default("code").notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
}, (table) => [
  index("portal_sessions_nurse_id_idx").on(table.nurseId),
  index("portal_sessions_token_hash_idx").on(table.sessionTokenHash),
  index("portal_sessions_expires_at_idx").on(table.expiresAt),
]);

export type PortalAuthCode = typeof portalAuthCodes.$inferSelect;
export type PortalSession = typeof portalSessions.$inferSelect;

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id"),
  module: auditModuleEnum("module").default("system").notNull(),
  action: text("action").notNull(),
  agentName: text("agent_name"),
  detail: jsonb("detail"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("audit_logs_nurse_id_idx").on(table.nurseId),
  index("audit_logs_timestamp_idx").on(table.timestamp),
  index("audit_logs_module_idx").on(table.module),
]);

// ==================== PREBOARD MODULE ====================

export const assessmentResponseSchema = z.object({
  questionId: z.number(),
  tag: z.string(),
  domain: z.string(),
  prompt: z.string(),
  response: z.string(),
  timeSpent: z.number(),
  timeLimit: z.number(),
  pasteAttempts: z.number().int().nonnegative().optional().default(0),
  keystrokeCount: z.number().int().nonnegative().optional().default(0),
  maxBurstChars: z.number().int().nonnegative().optional().default(0),
});

// Default threshold for flagging a response as having a "suspect typing
// pattern": any single chunk of >= this many characters appearing at once
// between keystrokes is treated as likely pasted/dictated content that
// bypassed the textarea paste block.
//
// This is the *default*. Admins can override the live value from the
// /settings page (stored under the `preboard_integrity` key in
// `appSettings`). Server + client both fetch the live value at runtime
// and fall back to this constant if nothing is configured.
export const SUSPECT_BURST_CHAR_THRESHOLD = 40;

// Hard bounds applied to the admin-tuned threshold so a typo can't
// disable the detector entirely (too high) or flag every answer (too low).
export const SUSPECT_BURST_CHAR_THRESHOLD_MIN = 10;
export const SUSPECT_BURST_CHAR_THRESHOLD_MAX = 500;

export type AssessmentResponse = z.infer<typeof assessmentResponseSchema>;

export const preboardAssessments = pgTable("preboard_assessments", {
  id: serial("id").primaryKey(),
  nurseId: varchar("nurse_id"),
  nurseName: text("nurse_name").notNull(),
  nurseEmail: text("nurse_email").notNull(),
  nursePhone: text("nurse_phone"),
  responses: jsonb("responses").notNull().$type<AssessmentResponse[]>(),
  aiAnalysis: text("ai_analysis"),
  emailSent: boolean("email_sent").default(false),
  completedAt: timestamp("completed_at").default(sql`CURRENT_TIMESTAMP`),
  // ─── Delivery pipeline status (task 111) ──────────────────────────
  // Tracks the post-submission AI + email pipeline so admins can see
  // when a transient failure has dropped the report email and re-run
  // the missing step manually. ai_status: pending|ok|failed.
  // email_status: pending|sent|failed|skipped_no_recipient.
  aiStatus: text("ai_status").default("pending").notNull(),
  aiError: text("ai_error"),
  aiAttempts: integer("ai_attempts").default(0).notNull(),
  aiAttemptedAt: timestamp("ai_attempted_at"),
  emailStatus: text("email_status").default("pending").notNull(),
  emailError: text("email_error"),
  emailAttempts: integer("email_attempts").default(0).notNull(),
  emailAttemptedAt: timestamp("email_attempted_at"),
  emailSentAt: timestamp("email_sent_at"),
});

// ==================== ONBOARD MODULE ====================

export const nmcVerifications = pgTable("nmc_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  pin: text("pin").notNull(),
  registeredName: text("registered_name"),
  registrationStatus: text("registration_status"),
  fieldOfPractice: text("field_of_practice"),
  conditions: text("conditions").array(),
  effectiveDate: text("effective_date"),
  renewalDate: text("renewal_date"),
  status: verificationStatusEnum("status").default("pending").notNull(),
  verifiedAt: timestamp("verified_at"),
  rawResponse: jsonb("raw_response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("nmc_verifications_nurse_id_idx").on(table.nurseId),
]);

export const dbsVerifications = pgTable("dbs_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  certificateNumber: text("certificate_number").notNull(),
  issueDate: text("issue_date"),
  certificateType: text("certificate_type"),
  updateServiceSubscribed: boolean("update_service_subscribed").default(false),
  checkResult: text("check_result"),
  status: verificationStatusEnum("status").default("pending").notNull(),
  verifiedAt: timestamp("verified_at"),
  // The uploaded DBS certificate (if any) this verification was
  // recorded against — set when an admin clicks "Verify this
  // certificate" from the DBS tab so we can later show "verified
  // from <file>".
  sourceDocumentId: varchar("source_document_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("dbs_verifications_nurse_id_idx").on(table.nurseId),
]);

export const competencyDeclarations = pgTable("competency_declarations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  domain: text("domain").notNull(),
  competencyName: text("competency_name").notNull(),
  mandatory: boolean("mandatory").default(false).notNull(),
  selfAssessedLevel: competencyLevelEnum("self_assessed_level").default("not_declared").notNull(),
  minimumRequiredLevel: text("minimum_required_level"),
  gapIdentified: boolean("gap_identified").default(false),
  status: declarationStatusEnum("status").default("declared").notNull(),
  evidenceNotes: text("evidence_notes"),
  declaredAt: timestamp("declared_at").defaultNow(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => [
  index("competency_declarations_nurse_id_idx").on(table.nurseId),
]);

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  type: text("type").notNull(),
  filename: text("filename").notNull(),
  originalFilename: text("original_filename"),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  category: text("category"),
  expiryDate: text("expiry_date"),
  notes: text("notes"),
  uploadedBy: text("uploaded_by").default("admin"),
  sharepointUrl: text("sharepoint_url"),
  aiStatus: text("ai_status"),
  aiIssues: jsonb("ai_issues"),
  // Structured fields the document AI extracted from the file (e.g.
  // certificateNumber/issueDate/certificateType for a DBS certificate,
  // policyNumber/coverEndDate for an indemnity certificate). Stored as
  // a key/value map so admin tabs can pre-fill verification forms
  // straight from the upload.
  aiExtractedFields: jsonb("ai_extracted_fields").$type<Record<string, string | null>>(),
  aiAnalyzedAt: timestamp("ai_analyzed_at"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (table) => [
  index("documents_nurse_id_idx").on(table.nurseId),
]);

export const references = pgTable("references", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  refereeName: text("referee_name").notNull(),
  refereeEmail: text("referee_email").notNull(),
  refereeOrg: text("referee_org"),
  refereeRole: text("referee_role"),
  relationshipToCandidate: text("relationship_to_candidate"),
  outcome: referenceOutcomeEnum("outcome").default("pending").notNull(),
  emailSentAt: timestamp("email_sent_at"),
  reminderCount: integer("reminder_count").default(0),
  formSubmittedAt: timestamp("form_submitted_at"),
  ratings: jsonb("ratings"),
  freeTextResponses: jsonb("free_text_responses"),
  conductFlags: jsonb("conduct_flags"),
  sicknessAbsenceBand: text("sickness_absence_band"),
  redFlagTriggered: boolean("red_flag_triggered").default(false),
  source: text("source").default("digital"),
  documentId: varchar("document_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("references_nurse_id_idx").on(table.nurseId),
]);

export const mandatoryTraining = pgTable("mandatory_training", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  moduleName: text("module_name").notNull(),
  renewalFrequency: text("renewal_frequency"),
  completedDate: text("completed_date"),
  expiryDate: text("expiry_date"),
  issuingBody: text("issuing_body"),
  certificateUploaded: boolean("certificate_uploaded").default(false),
  certificateDocumentId: varchar("certificate_document_id"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("mandatory_training_nurse_id_idx").on(table.nurseId),
]);

export const healthDeclarations = pgTable("health_declarations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  hepatitisBVaccinated: boolean("hepatitis_b_vaccinated"),
  mmrVaccinated: boolean("mmr_vaccinated"),
  varicellaVaccinated: boolean("varicella_vaccinated"),
  tbScreened: boolean("tb_screened"),
  conditionsAffectingPractice: text("conditions_affecting_practice"),
  ohReferralRequired: boolean("oh_referral_required").default(false),
  completed: boolean("completed").default(false),
  declaredAt: timestamp("declared_at").defaultNow(),
  aiTriageStatus: varchar("ai_triage_status", { length: 20 }),
  aiTriageNote: text("ai_triage_note"),
  aiTriagedAt: timestamp("ai_triaged_at"),
}, (table) => [
  index("health_declarations_nurse_id_idx").on(table.nurseId),
]);

export const inductionPolicies = pgTable("induction_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  policyName: text("policy_name").notNull(),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
}, (table) => [
  index("induction_policies_nurse_id_idx").on(table.nurseId),
]);

export const professionalIndemnity = pgTable("professional_indemnity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  provider: text("provider"),
  policyNumber: text("policy_number"),
  coverStartDate: text("cover_start_date"),
  coverEndDate: text("cover_end_date"),
  scopeAppropriate: boolean("scope_appropriate").default(false),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("professional_indemnity_nurse_id_idx").on(table.nurseId),
]);

export const onboardingStates = pgTable("onboarding_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  currentStep: integer("current_step").default(1).notNull(),
  stepStatuses: jsonb("step_statuses"),
  blockedSteps: text("blocked_steps").array(),
  escalations: jsonb("escalations"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("onboarding_states_nurse_id_idx").on(table.nurseId),
]);

export const refereeTokens = pgTable("referee_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referenceId: varchar("reference_id").notNull().references(() => references.id),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("referee_tokens_nurse_id_idx").on(table.nurseId),
  index("referee_tokens_reference_id_idx").on(table.referenceId),
]);

export const employmentHistory = pgTable("employment_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  employer: text("employer").notNull(),
  jobTitle: text("job_title").notNull(),
  department: text("department"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  isCurrent: boolean("is_current").default(false),
  reasonForLeaving: text("reason_for_leaving"),
  duties: text("duties"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("employment_history_nurse_id_idx").on(table.nurseId),
]);

export const educationHistory = pgTable("education_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  institution: text("institution").notNull(),
  qualification: text("qualification").notNull(),
  subject: text("subject"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  grade: text("grade"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("education_history_nurse_id_idx").on(table.nurseId),
]);

// Chat (from Nurse-Onboard)
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ==================== SKILLS ARCADE MODULE ====================

export const arcadeUsers = pgTable("arcade_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("nurse"),
  active: boolean("active").notNull().default(true),
  nurseId: varchar("nurse_id").references(() => nurses.id),
});

export const arcadeModules = pgTable("arcade_modules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  currentVersion: text("current_version").notNull().default("1.0.0"),
  isActive: boolean("is_active").notNull().default(true),
  icon: text("icon").notNull().default("Syringe"),
  color: text("color").notNull().default("blue"),
  // Task 114: Optional list of Staff-Handbook SOP slugs this module
  // aligns with (e.g. ["sop-04-medication-management",
  // "sop-08-infection-prevention"]). Used by the trainer/admin UI to
  // surface "this scenario tests SOP X" alongside arcade modules so
  // procedures + rationales stay anchored to the handbook.
  sopRefs: jsonb("sop_refs").$type<string[]>().default(sql`'[]'::jsonb`),
});

export const moduleVersions = pgTable("module_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moduleId: varchar("module_id").notNull().references(() => arcadeModules.id),
  version: text("version").notNull(),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  configJson: jsonb("config_json").notNull().default({}),
});

export const scenarios = pgTable("scenarios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moduleVersionId: varchar("module_version_id").notNull().references(() => moduleVersions.id),
  title: text("title").notNull(),
  contentJson: jsonb("content_json").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const assignments = pgTable("assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => arcadeUsers.id),
  moduleVersionId: varchar("module_version_id").notNull().references(() => moduleVersions.id),
  moduleId: varchar("module_id").notNull().references(() => arcadeModules.id),
  status: assignmentStatusEnum("status").notNull().default("not_started"),
  dueAt: timestamp("due_at"),
  assignedBy: varchar("assigned_by").references(() => arcadeUsers.id),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

export const attempts = pgTable("attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => arcadeUsers.id),
  moduleVersionId: varchar("module_version_id").notNull().references(() => moduleVersions.id),
  scenarioId: varchar("scenario_id").notNull().references(() => scenarios.id),
  assignmentId: varchar("assignment_id").notNull().references(() => assignments.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
  result: attemptResultEnum("result"),
  minorCount: integer("minor_count").notNull().default(0),
  majorCount: integer("major_count").notNull().default(0),
  responseJson: jsonb("response_json"),
  feedbackJson: jsonb("feedback_json"),
});

export const remediationCases = pgTable("remediation_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => arcadeUsers.id),
  moduleVersionId: varchar("module_version_id").notNull().references(() => moduleVersions.id),
  moduleId: varchar("module_id").notNull().references(() => arcadeModules.id),
  status: remediationStatusEnum("status").notNull().default("open"),
  lockedAt: timestamp("locked_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const remediationNotes = pgTable("remediation_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  remediationCaseId: varchar("remediation_case_id").notNull().references(() => remediationCases.id),
  trainerId: varchar("trainer_id").notNull().references(() => arcadeUsers.id),
  note: text("note").notNull(),
  trainingDate: timestamp("training_date"),
  competencyOutcome: text("competency_outcome"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const clearances = pgTable("clearances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => arcadeUsers.id),
  moduleId: varchar("module_id").notNull().references(() => arcadeModules.id),
  moduleVersionId: varchar("module_version_id").notNull().references(() => moduleVersions.id),
  status: clearanceStatusEnum("status").notNull().default("pending"),
  clearedBy: varchar("cleared_by").references(() => arcadeUsers.id),
  clearedAt: timestamp("cleared_at"),
});

// ==================== INSERT SCHEMAS ====================

export const insertNurseSchema = createInsertSchema(nurses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPortalLinkSchema = createInsertSchema(portalLinks).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });
export const insertPreboardAssessmentSchema = createInsertSchema(preboardAssessments).omit({ id: true, aiAnalysis: true, emailSent: true, completedAt: true });
export const insertNmcVerificationSchema = createInsertSchema(nmcVerifications).omit({ id: true, createdAt: true });
export const insertDbsVerificationSchema = createInsertSchema(dbsVerifications).omit({ id: true, createdAt: true });
export const insertCompetencyDeclarationSchema = createInsertSchema(competencyDeclarations).omit({ id: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, uploadedAt: true });
export const insertReferenceSchema = createInsertSchema(references).omit({ id: true, createdAt: true });
export const insertMandatoryTrainingSchema = createInsertSchema(mandatoryTraining).omit({ id: true, createdAt: true });
export const insertHealthDeclarationSchema = createInsertSchema(healthDeclarations).omit({ id: true });
export const insertInductionPolicySchema = createInsertSchema(inductionPolicies).omit({ id: true });
export const insertProfessionalIndemnitySchema = createInsertSchema(professionalIndemnity).omit({ id: true, createdAt: true });
export const insertOnboardingStateSchema = createInsertSchema(onboardingStates).omit({ id: true });
export const insertRefereeTokenSchema = createInsertSchema(refereeTokens).omit({ id: true, createdAt: true });
export const insertEmploymentHistorySchema = createInsertSchema(employmentHistory).omit({ id: true, createdAt: true });
export const insertEducationHistorySchema = createInsertSchema(educationHistory).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertArcadeUserSchema = createInsertSchema(arcadeUsers).omit({ id: true });
export const insertArcadeModuleSchema = createInsertSchema(arcadeModules).omit({ id: true });
export const insertModuleVersionSchema = createInsertSchema(moduleVersions).omit({ id: true });
export const insertScenarioSchema = createInsertSchema(scenarios).omit({ id: true });
export const insertAssignmentSchema = createInsertSchema(assignments).omit({ id: true, assignedAt: true });
export const insertAttemptSchema = createInsertSchema(attempts).omit({ id: true, startedAt: true });
export const insertRemediationCaseSchema = createInsertSchema(remediationCases).omit({ id: true, lockedAt: true });
export const insertRemediationNoteSchema = createInsertSchema(remediationNotes).omit({ id: true, createdAt: true });
export const insertClearanceSchema = createInsertSchema(clearances).omit({ id: true });

// ==================== TYPES ====================

export type Nurse = typeof nurses.$inferSelect;
export type InsertNurse = z.infer<typeof insertNurseSchema>;
export type PortalLink = typeof portalLinks.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type PreboardAssessment = typeof preboardAssessments.$inferSelect;
export type NmcVerification = typeof nmcVerifications.$inferSelect;
export type DbsVerification = typeof dbsVerifications.$inferSelect;
export type CompetencyDeclaration = typeof competencyDeclarations.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Reference = typeof references.$inferSelect;
export type MandatoryTraining = typeof mandatoryTraining.$inferSelect;
export type HealthDeclaration = typeof healthDeclarations.$inferSelect;
export type InductionPolicy = typeof inductionPolicies.$inferSelect;
export type ProfessionalIndemnity = typeof professionalIndemnity.$inferSelect;
export type OnboardingState = typeof onboardingStates.$inferSelect;
export type RefereeToken = typeof refereeTokens.$inferSelect;
export type EmploymentHistory = typeof employmentHistory.$inferSelect;
export type EducationHistory = typeof educationHistory.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ArcadeUser = typeof arcadeUsers.$inferSelect;
export type ArcadeModule = typeof arcadeModules.$inferSelect;
export type ModuleVersion = typeof moduleVersions.$inferSelect;
export type Scenario = typeof scenarios.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type RemediationCase = typeof remediationCases.$inferSelect;
export type RemediationNote = typeof remediationNotes.$inferSelect;
export type Clearance = typeof clearances.$inferSelect;

// ==================== ARCADE COMPATIBILITY ALIASES ====================
// The Arcade app used "users" and "modules"; monorepo uses "arcadeUsers", "arcadeModules"
export const users = arcadeUsers;
export const modules = arcadeModules;
export type User = ArcadeUser;
export type InsertUser = z.infer<typeof insertArcadeUserSchema>;
export type Module = ArcadeModule;

// ==================== EQUAL OPPORTUNITIES MONITORING ====================

// Per-nurse record of "outstanding mandatory training" chase emails sent by
// admins from the Training Matrix. Used to drive a "Last chased N days ago"
// indicator and to scope the mailbox auto-ingest to attachments received
// AFTER the most recent chase.
export const trainingNotifications = pgTable("training_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  sentBy: text("sent_by"),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  // Snapshot of which modules were red/amber at the time of sending, so the
  // mailbox auto-ingest knows what to look for in the reply.
  modulesIncluded: jsonb("modules_included").notNull(),
  portalLinkToken: varchar("portal_link_token"),
  portalLinkExpiresAt: timestamp("portal_link_expires_at"),
  // Graph conversationId of the sent chase email. Lets the reply scanner
  // restrict to attachments that arrived in the same Outlook thread.
  conversationId: text("conversation_id"),
}, (table) => [
  index("training_notifications_nurse_id_idx").on(table.nurseId),
  index("training_notifications_sent_at_idx").on(table.sentAt),
]);

export const insertTrainingNotificationSchema = createInsertSchema(trainingNotifications).omit({ id: true, sentAt: true });
export type TrainingNotification = typeof trainingNotifications.$inferSelect;
export type InsertTrainingNotification = z.infer<typeof insertTrainingNotificationSchema>;

// Idempotency log for chase-reply mailbox auto-ingest, keyed by Graph
// (messageId, attachmentId, nurseId).
export const processedChaseAttachments = pgTable("processed_chase_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  messageId: text("message_id").notNull(),
  attachmentId: text("attachment_id").notNull(),
  documentId: varchar("document_id"),
  autoAttached: boolean("auto_attached").default(false),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
}, (table) => [
  index("processed_chase_attachments_nurse_id_idx").on(table.nurseId),
  uniqueIndex("processed_chase_attachments_msg_att_nurse_unique").on(
    table.messageId,
    table.attachmentId,
    table.nurseId,
  ),
]);

export const insertProcessedChaseAttachmentSchema = createInsertSchema(processedChaseAttachments).omit({ id: true, processedAt: true });
export type ProcessedChaseAttachment = typeof processedChaseAttachments.$inferSelect;
export type InsertProcessedChaseAttachment = z.infer<typeof insertProcessedChaseAttachmentSchema>;

// History of completed scheduled-job runs (weekly chase + mailbox reply
// scan). One row per run, written once the run finishes. Powers the
// "Recent runs" panels on /settings so admins can see how the automation
// has been trending without digging through email or audit logs.
export const scheduledJobTypeEnum = pgEnum("scheduled_job_type", [
  "weekly_chase",
  "reply_scan",
]);
export const scheduledJobStatusEnum = pgEnum("scheduled_job_status", [
  "success",
  "partial_failure",
  "failure",
  "skipped",
]);

export const scheduledJobRuns = pgTable("scheduled_job_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: scheduledJobTypeEnum("job_type").notNull(),
  triggeredBy: text("triggered_by").notNull(),
  status: scheduledJobStatusEnum("status").notNull(),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at").notNull(),
  // Cross-job counters. Their precise meaning depends on jobType:
  //   weekly_chase: sent=emails sent ok, failed=emails that errored,
  //                 skipped=candidates skipped (recently chased / no email /
  //                 nothing outstanding), needsReview=0.
  //   reply_scan:   sent=attachments auto-attached, failed=per-nurse scan
  //                 errors recorded by the scanner, skipped=0,
  //                 needsReview=attachments routed to the flagged-document
  //                 review queue.
  sentCount: integer("sent_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  skippedCount: integer("skipped_count").default(0).notNull(),
  needsReviewCount: integer("needs_review_count").default(0).notNull(),
  // First-line error message when status != success. Full per-nurse breakdown
  // lives in `detail` so the row stays small for the table view.
  errorMessage: text("error_message"),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("scheduled_job_runs_job_type_idx").on(table.jobType),
  index("scheduled_job_runs_started_at_idx").on(table.startedAt),
]);

export type ScheduledJobRun = typeof scheduledJobRuns.$inferSelect;
export const insertScheduledJobRunSchema = createInsertSchema(scheduledJobRuns).omit({ id: true, createdAt: true });
export type InsertScheduledJobRun = z.infer<typeof insertScheduledJobRunSchema>;

// Generic key/value table for admin-tunable platform settings (e.g. the
// scheduled chase-email job toggles). Each row is a single JSON document so
// we don't need a new table per setting group.
export const appSettings = pgTable("app_settings", {
  key: varchar("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by"),
});
export type AppSetting = typeof appSettings.$inferSelect;

// Settings shape for the weekly chase + reply-scan scheduled jobs. Stored
// under key = "training_chase_schedule".
export const TRAINING_CHASE_SCHEDULE_SETTING_KEY = "training_chase_schedule";
export interface TrainingChaseScheduleSettings {
  // Weekly bulk chase of nurses with outstanding mandatory training.
  weeklyChaseEnabled: boolean;
  weeklyChaseDayOfWeek: number; // 0=Sun .. 6=Sat (default Monday=1)
  weeklyChaseHour: number; // 0..23 in the configured time zone (default 9)
  weeklyChaseTimeZone: string; // IANA zone the day/hour are interpreted in (default Europe/London)
  weeklyChaseMinGapDays: number; // skip nurses chased in the last N days (default 14)
  // Mailbox reply scan that picks up certificates returned by nurses.
  replyScanEnabled: boolean;
  replyScanIntervalMinutes: number; // default 30
  // Recipients for the weekly-chase admin summary email. Empty array = fall
  // back to AZURE_AD_SENDER_EMAIL (the shared mailbox).
  weeklyChaseSummaryRecipients: string[];
  // Recipients for the mailbox reply-scan admin summary email. Empty array =
  // fall back to AZURE_AD_SENDER_EMAIL. Kept independent from the weekly
  // list so on-call admins can get reply alerts while compliance gets the
  // weekly digest (or vice-versa).
  replyScanSummaryRecipients: string[];
  // Tracked by the scheduler — never edited from the UI directly.
  lastWeeklyChaseRunAt?: string | null;
  lastReplyScanRunAt?: string | null;
}
export const DEFAULT_TRAINING_CHASE_SCHEDULE: TrainingChaseScheduleSettings = {
  weeklyChaseEnabled: false,
  weeklyChaseDayOfWeek: 1,
  weeklyChaseHour: 9,
  weeklyChaseTimeZone: "Europe/London",
  weeklyChaseMinGapDays: 14,
  replyScanEnabled: true,
  replyScanIntervalMinutes: 30,
  weeklyChaseSummaryRecipients: [],
  replyScanSummaryRecipients: [],
  lastWeeklyChaseRunAt: null,
  lastReplyScanRunAt: null,
};

// Migrate the legacy single `summaryRecipients` field (which used to apply to
// BOTH the weekly chase and reply-scan summaries) into the two new
// independent fields. Applied on every read of the persisted settings so
// older app_settings rows seamlessly upgrade without a DB migration: the
// legacy value seeds either new field only if that field is currently
// empty/missing, so an admin who has already set one of the new lists won't
// have it clobbered by stale legacy data.
export function migrateLegacyTrainingChaseRecipients(
  stored: (Partial<TrainingChaseScheduleSettings> & { summaryRecipients?: unknown }) | null | undefined,
): Partial<TrainingChaseScheduleSettings> {
  if (!stored) return {};
  const { summaryRecipients: legacy, ...rest } = stored as Partial<TrainingChaseScheduleSettings> & {
    summaryRecipients?: unknown;
  };
  const out: Partial<TrainingChaseScheduleSettings> = { ...rest };
  if (Array.isArray(legacy) && legacy.length > 0) {
    const legacyList = legacy.filter((x): x is string => typeof x === "string");
    if (!Array.isArray(out.weeklyChaseSummaryRecipients) || out.weeklyChaseSummaryRecipients.length === 0) {
      out.weeklyChaseSummaryRecipients = [...legacyList];
    }
    if (!Array.isArray(out.replyScanSummaryRecipients) || out.replyScanSummaryRecipients.length === 0) {
      out.replyScanSummaryRecipients = [...legacyList];
    }
  }
  return out;
}

// Settings shape for the preboard integrity detector. Stored under
// key = "preboard_integrity". Admins can tune the suspect-typing burst
// threshold from /settings without a code change. Other integrity knobs
// (e.g. paste-block toggle) can be added here later.
export const PREBOARD_INTEGRITY_SETTING_KEY = "preboard_integrity";
export interface PreboardIntegritySettings {
  // Min length (in characters) of a single typing burst that flags a
  // response as "suspect typing". See SUSPECT_BURST_CHAR_THRESHOLD for the
  // default. Bounded by SUSPECT_BURST_CHAR_THRESHOLD_MIN/MAX on save.
  suspectBurstCharThreshold: number;
}
export const DEFAULT_PREBOARD_INTEGRITY_SETTINGS: PreboardIntegritySettings = {
  suspectBurstCharThreshold: SUSPECT_BURST_CHAR_THRESHOLD,
};

// Reading-behaviour columns (time spent, scrolled-to-end, pdf-opened, the
// median/skimmed summary) are visible only to the super_admin role —
// they can become an HR/disciplinary signal so we don't expose them to
// every team admin. Gated in middleware (`isSuperAdmin`) and at the
// relevant policy routes; no separate settings/allowlist required.

export const equalOpportunities = pgTable("equal_opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateRef: varchar("candidate_ref").notNull(),
  gender: text("gender"),
  ethnicity: text("ethnicity"),
  disabilityStatus: text("disability_status"),
  religionBelief: text("religion_belief"),
  sexualOrientation: text("sexual_orientation"),
  ageBand: text("age_band"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("equal_opportunities_candidate_ref_idx").on(table.candidateRef),
]);

export const insertEqualOpportunitiesSchema = createInsertSchema(equalOpportunities).omit({ id: true, submittedAt: true, updatedAt: true });
export type EqualOpportunities = typeof equalOpportunities.$inferSelect;
export type InsertEqualOpportunities = z.infer<typeof insertEqualOpportunitiesSchema>;

// ==================== POLICIES (admin-managed master list) ====================
// Admin-managed list of policies that every nurse must read & sign in the
// portal. Distinct from `inductionPolicies`, which is a per-nurse static
// checklist seeded from a constant.
export const policies = pgTable("policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  body: text("body"),
  pdfDocumentId: varchar("pdf_document_id"),
  pdfUrl: text("pdf_url"),
  version: text("version").notNull().default("1.0"),
  isActive: boolean("is_active").default(true).notNull(),
  requireAcknowledgement: boolean("require_acknowledgement").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  // Stable identifier used by the seeder so it can re-find a row across
  // restarts without depending on title text. NULL for ad-hoc admin-
  // created policies. Unique when present.
  slug: text("slug").unique(),
  // Tag used to group seeded items together (e.g. "induction" for the
  // 21 Staff-Handbook items). NULL for the standard admin-managed
  // master-list policies, which keeps the legacy /portal/policies UI
  // unchanged.
  category: text("category"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// One row per (nurse, policy version) acknowledgement. Storing the version
// snapshot means re-publishing a new version of a policy will surface as
// "needs re-acknowledgement" without losing the historical record.
export const policyAcknowledgements = pgTable("policy_acknowledgements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  policyId: varchar("policy_id").notNull().references(() => policies.id),
  policyVersion: text("policy_version").notNull(),
  acknowledgedAt: timestamp("acknowledged_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  // Reading-behaviour summary, rolled up from policyReadEvents at the
  // moment the acknowledgement is recorded. Admin-only signal — never
  // surfaced to the nurse.
  totalActiveSeconds: integer("total_active_seconds").default(0).notNull(),
  sessionCount: integer("session_count").default(0).notNull(),
  scrolledToEnd: boolean("scrolled_to_end").default(false).notNull(),
  openedPdf: boolean("opened_pdf").default(false).notNull(),
}, (table) => [
  index("policy_acks_nurse_id_idx").on(table.nurseId),
  index("policy_acks_policy_id_idx").on(table.policyId),
]);

// Raw read-event log for (nurse, policy, version). The portal page batches
// these up and POSTs them in the background; the admin UI never reads them
// directly — they are rolled up onto policyAcknowledgements when the nurse
// acknowledges.
export const policyReadEvents = pgTable("policy_read_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  policyId: varchar("policy_id").notNull().references(() => policies.id),
  policyVersion: text("policy_version").notNull(),
  // "session" rows carry an active visible-time duration (ms). "pdf_open"
  // and "scroll_end" are boolean signals (durationMs = 0).
  eventType: text("event_type").notNull(),
  durationMs: integer("duration_ms").default(0).notNull(),
  sessionId: text("session_id"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("policy_read_events_nurse_policy_idx").on(table.nurseId, table.policyId, table.policyVersion),
]);

// SOP comprehension MCQ attempts (task 114 follow-up). One row per
// (nurse, sopSlug, questionVersion, attemptCount). The latest row per
// (nurse, sopSlug) at the *current* questionVersion drives the
// "passed" / "needs retry" status. Earlier rows are kept for audit.
export const sopComprehensionAttempts = pgTable("sop_comprehension_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  sopSlug: text("sop_slug").notNull(),
  questionVersion: text("question_version").notNull(),
  chosenOptionId: text("chosen_option_id").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  attemptCount: integer("attempt_count").default(1).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => [
  index("sop_comp_attempts_nurse_idx").on(table.nurseId),
  index("sop_comp_attempts_nurse_slug_idx").on(table.nurseId, table.sopSlug),
]);
export type SopComprehensionAttempt = typeof sopComprehensionAttempts.$inferSelect;

export const insertPolicySchema = createInsertSchema(policies).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPolicyAcknowledgementSchema = createInsertSchema(policyAcknowledgements).omit({ id: true, acknowledgedAt: true });
export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type PolicyAcknowledgement = typeof policyAcknowledgements.$inferSelect;
export type InsertPolicyAcknowledgement = z.infer<typeof insertPolicyAcknowledgementSchema>;
export type PolicyReadEvent = typeof policyReadEvents.$inferSelect;

// ==================== NURSE SUPERVISIONS (task 162) ====================
// Per-nurse log of 1:1 supervision calls, appraisals, and reflective
// conversations. Admin-only — never surfaced via the nurse portal. The
// optional attachment is stored through the same multer + object-storage
// path as other nurse documents but kept *out* of the `documents` table
// so the nurse can't pull it down via /api/documents/:id/download.
export const nurseSupervisions = pgTable("nurse_supervisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  type: supervisionTypeEnum("type").notNull(),
  title: text("title"),
  conversationDate: text("conversation_date").notNull(),
  notes: text("notes").notNull(),
  attachmentFilename: text("attachment_filename"),
  attachmentOriginalFilename: text("attachment_original_filename"),
  attachmentMimeType: text("attachment_mime_type"),
  attachmentSize: integer("attachment_size"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("nurse_supervisions_nurse_id_idx").on(table.nurseId),
  index("nurse_supervisions_conversation_date_idx").on(table.conversationDate),
]);
export const insertNurseSupervisionSchema = createInsertSchema(nurseSupervisions).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type NurseSupervision = typeof nurseSupervisions.$inferSelect;
export type InsertNurseSupervision = z.infer<typeof insertNurseSupervisionSchema>;

// ==================== INTERNAL TRAINING CERTIFICATES ====================
// Roster-wide internal-training completion tracking. Nurses upload one
// certificate per fixed training type (sourced from external platforms);
// admins see a whole-roster traffic-light matrix and can download certs.
// Deliberately simple — a fixed list of trainings, one cert per nurse per
// training (re-upload replaces). No course click-through / LMS bloat.
export const INTERNAL_TRAININGS = [
  { key: "elearning_end_of_life", label: "E-learning for Health — End of Life" },
  { key: "palliative_care_fundamentals", label: "Livaware Palliative Care Fundamentals" },
  { key: "world_class_care_principles", label: "World Class Care Principles" },
  { key: "acute_to_community_transition", label: "Acute-to-Community Transition" },
] as const;
export type InternalTrainingKey = (typeof INTERNAL_TRAININGS)[number]["key"];
export const INTERNAL_TRAINING_KEYS = INTERNAL_TRAININGS.map((t) => t.key) as readonly InternalTrainingKey[];

export const internalTrainingCertificates = pgTable("internal_training_certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  trainingKey: text("training_key").notNull(),
  fileName: text("file_name").notNull(),
  originalFileName: text("original_file_name"),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  completedDate: text("completed_date"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  uploadedBy: text("uploaded_by").notNull(),
}, (table) => [
  uniqueIndex("internal_training_nurse_key_idx").on(table.nurseId, table.trainingKey),
  index("internal_training_nurse_id_idx").on(table.nurseId),
]);
export const insertInternalTrainingCertificateSchema = createInsertSchema(internalTrainingCertificates).omit({
  id: true, uploadedAt: true,
});
export type InternalTrainingCertificate = typeof internalTrainingCertificates.$inferSelect;
export type InsertInternalTrainingCertificate = z.infer<typeof insertInternalTrainingCertificateSchema>;

// ==================== HEALTHIER BUSINESS GROUP (HBC) TRAINING SYNC ====================
// Integration with the Healthier Business Group compliance/training portal
// (https://dev.hbcompliance.co.uk). HB hosts the mandatory CSTF training
// courses. We authenticate with the V2 bearer-token flow (client_id + api_key
// -> POST /auth/token) and read/write candidate + training data via HB's
// documented endpoints. Credentials + host live in env (HBC_*). All three
// tables below are admin-only mirrors of HB-side state; the nurse portal never
// reads them.

// Catalogue of training courses HB provides to our client account
// (GET /training-list). course_id is HB's stable identifier for the course.
export const hbcCourses = pgTable("hbc_courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: text("course_id").notNull().unique(),
  testId: text("test_id"),
  courseName: text("course_name").notNull(),
  notes: text("notes"),
  groupTitle: text("group_title"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
}, (table) => [
  index("hbc_courses_course_id_idx").on(table.courseId),
]);
export const insertHbcCourseSchema = createInsertSchema(hbcCourses).omit({ id: true, syncedAt: true });
export type HbcCourse = typeof hbcCourses.$inferSelect;
export type InsertHbcCourse = z.infer<typeof insertHbcCourseSchema>;

// Maps one of our nurses to their HB candidate record (candidate_ref UUID +
// numeric candidate_id). One row per nurse — this is the join key for every
// per-candidate HB call.
export const hbcCandidateLinks = pgTable("hbc_candidate_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id).unique(),
  candidateRef: text("candidate_ref").notNull(),
  candidateId: text("candidate_id"),
  candidateStatus: text("candidate_status"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("hbc_candidate_links_nurse_id_idx").on(table.nurseId),
  index("hbc_candidate_links_candidate_ref_idx").on(table.candidateRef),
]);
export const insertHbcCandidateLinkSchema = createInsertSchema(hbcCandidateLinks).omit({ id: true, createdAt: true });
export type HbcCandidateLink = typeof hbcCandidateLinks.$inferSelect;
export type InsertHbcCandidateLink = z.infer<typeof insertHbcCandidateLinkSchema>;

// Per-nurse per-course training results pulled from HB
// (GET /training-results/{candidate_ref}). Dates are HB strings in GMT.
export const hbcTrainingResults = pgTable("hbc_training_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  courseId: text("course_id").notNull(),
  courseName: text("course_name").notNull(),
  dateAssigned: text("date_assigned"),
  dateCompleted: text("date_completed"),
  renewalDate: text("renewal_date"),
  courseStatus: text("course_status"),
  grade: text("grade"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
}, (table) => [
  index("hbc_training_results_nurse_id_idx").on(table.nurseId),
  uniqueIndex("hbc_training_results_nurse_course_uq").on(table.nurseId, table.courseId),
]);
export const insertHbcTrainingResultSchema = createInsertSchema(hbcTrainingResults).omit({ id: true, syncedAt: true });
export type HbcTrainingResult = typeof hbcTrainingResults.$inferSelect;
export type InsertHbcTrainingResult = z.infer<typeof insertHbcTrainingResultSchema>;

// ==================== TRAINING COURSES (LMS) ====================
// A unified course builder inside Skills Arcade. A course is either authored
// in-app ("internal" — its own lessons + optional quiz) or a thin wrapper that
// links an existing training item so it can be assigned + chased alongside the
// rest ("hbc" -> an hbcCourses.courseId, "arcade" -> an arcadeModules.id,
// "mandatory" -> a MANDATORY_TRAINING_MODULES name). Completion for linked
// courses is derived from the source system; internal courses are completed by
// the nurse in the portal (read lessons + pass the optional quiz). Completing a
// course with certificateEnabled auto-issues a downloadable PDF certificate.
export const lmsCourseSourceEnum = pgEnum("lms_course_source", ["internal", "hbc", "arcade", "mandatory"]);
export const lmsAssignmentStatusEnum = pgEnum("lms_assignment_status", ["assigned", "in_progress", "completed"]);

export const lmsCourses = pgTable("lms_courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").default(""),
  sourceType: lmsCourseSourceEnum("source_type").notNull().default("internal"),
  // For non-internal courses, the identifier of the linked source item:
  // hbc -> hbcCourses.courseId, arcade -> arcadeModules.id, mandatory -> module name.
  sourceRef: text("source_ref"),
  category: text("category"),
  // Pass mark (%) for the optional internal quiz. Null = no quiz required.
  passThreshold: integer("pass_threshold"),
  certificateEnabled: boolean("certificate_enabled").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertLmsCourseSchema = createInsertSchema(lmsCourses).omit({ id: true, createdAt: true, updatedAt: true });
export type LmsCourse = typeof lmsCourses.$inferSelect;
export type InsertLmsCourse = z.infer<typeof insertLmsCourseSchema>;

// Ordered lesson/material pages for an internal course (rich text content).
export const lmsLessons = pgTable("lms_lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull().references(() => lmsCourses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("lms_lessons_course_id_idx").on(table.courseId),
]);
export const insertLmsLessonSchema = createInsertSchema(lmsLessons).omit({ id: true, createdAt: true });
export type LmsLesson = typeof lmsLessons.$inferSelect;
export type InsertLmsLesson = z.infer<typeof insertLmsLessonSchema>;

// Optional multiple-choice quiz questions for an internal course.
export const lmsQuizQuestions = pgTable("lms_quiz_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull().references(() => lmsCourses.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  options: jsonb("options").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  correctIndex: integer("correct_index").notNull().default(0),
  orderIndex: integer("order_index").notNull().default(0),
}, (table) => [
  index("lms_quiz_questions_course_id_idx").on(table.courseId),
]);
export const insertLmsQuizQuestionSchema = createInsertSchema(lmsQuizQuestions).omit({ id: true });
export type LmsQuizQuestion = typeof lmsQuizQuestions.$inferSelect;
export type InsertLmsQuizQuestion = z.infer<typeof insertLmsQuizQuestionSchema>;

// One row per (course, nurse). Tracks the assignment, the nurse's progress
// through internal lessons/quiz, completion, and the issued certificate.
export const lmsCourseAssignments = pgTable("lms_course_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull().references(() => lmsCourses.id, { onDelete: "cascade" }),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  dueDate: text("due_date"),
  status: lmsAssignmentStatusEnum("status").notNull().default("assigned"),
  completedLessonIds: jsonb("completed_lesson_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  quizScore: integer("quiz_score"),
  certificateDocumentId: varchar("certificate_document_id"),
  assignedBy: text("assigned_by"),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  lastChasedAt: timestamp("last_chased_at"),
}, (table) => [
  index("lms_course_assignments_nurse_id_idx").on(table.nurseId),
  index("lms_course_assignments_course_id_idx").on(table.courseId),
  uniqueIndex("lms_course_assignments_course_nurse_uq").on(table.courseId, table.nurseId),
]);
export const insertLmsCourseAssignmentSchema = createInsertSchema(lmsCourseAssignments).omit({ id: true, assignedAt: true });
export type LmsCourseAssignment = typeof lmsCourseAssignments.$inferSelect;
export type InsertLmsCourseAssignment = z.infer<typeof insertLmsCourseAssignmentSchema>;

// ==================== STAGE DISPLAY NAMES ====================
export const STAGE_DISPLAY_NAMES: Record<string, string> = {
  preboard: "Applicant",
  onboard: "Candidate",
  skills_arcade: "Skills Arcade",
  completed: "Nurse",
};

export function getStageDisplayName(stage: string): string {
  return STAGE_DISPLAY_NAMES[stage] || stage.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ==================== NURSE-ONBOARD COMPATIBILITY ALIASES ====================
// The Nurse-Onboard app used "candidates" naming; monorepo uses "nurses"
export const candidates = nurses;
export type Candidate = Nurse;
export type InsertCandidate = InsertNurse;
export const insertCandidateSchema = insertNurseSchema;

// The Nurse-Onboard app used "magicLinks"; monorepo uses "portalLinks"
export const magicLinks = portalLinks;
export type MagicLink = PortalLink;
export type InsertMagicLink = z.infer<typeof insertPortalLinkSchema>;

// Insert type aliases
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type InsertNmcVerification = z.infer<typeof insertNmcVerificationSchema>;
export type InsertDbsVerification = z.infer<typeof insertDbsVerificationSchema>;
export type InsertCompetencyDeclaration = z.infer<typeof insertCompetencyDeclarationSchema>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type InsertReference = z.infer<typeof insertReferenceSchema>;
export type InsertMandatoryTraining = z.infer<typeof insertMandatoryTrainingSchema>;
export type InsertHealthDeclaration = z.infer<typeof insertHealthDeclarationSchema>;
export type InsertInductionPolicy = z.infer<typeof insertInductionPolicySchema>;
export type InsertProfessionalIndemnity = z.infer<typeof insertProfessionalIndemnitySchema>;
export type InsertOnboardingState = z.infer<typeof insertOnboardingStateSchema>;
export type InsertRefereeToken = z.infer<typeof insertRefereeTokenSchema>;
export type InsertEmploymentHistory = z.infer<typeof insertEmploymentHistorySchema>;
export type InsertEducationHistory = z.infer<typeof insertEducationHistorySchema>;

// ==================== CONSTANTS ====================

export const ONBOARDING_STEPS = [
  { step: 1, name: "Identity & Contact", key: "identity" },
  { step: 2, name: "NMC PIN Verification", key: "nmc" },
  { step: 3, name: "DBS Verification", key: "dbs" },
  { step: 4, name: "Right to Work", key: "right_to_work" },
  { step: 5, name: "Professional Profile", key: "profile" },
  { step: 6, name: "Clinical Competency", key: "competency" },
  { step: 7, name: "Mandatory Training", key: "training" },
  { step: 8, name: "Health Declaration", key: "health" },
  { step: 9, name: "References", key: "references" },
  { step: 10, name: "Induction & Policies", key: "induction" },
  { step: 11, name: "Professional Indemnity", key: "indemnity" },
  { step: 12, name: "Equal Opportunities", key: "equal_opportunities" },
] as const;

export const MANDATORY_TRAINING_MODULES = [
  { name: "Basic Life Support (BLS)", renewalFrequency: "Annual" },
  { name: "Manual Handling", renewalFrequency: "Annual" },
  { name: "Safeguarding Adults Level 2", renewalFrequency: "3 years" },
  { name: "Safeguarding Children Level 2", renewalFrequency: "3 years" },
  { name: "Fire Safety", renewalFrequency: "Annual" },
  { name: "Infection Prevention and Control", renewalFrequency: "Annual" },
  { name: "Information Governance & Data Security", renewalFrequency: "Annual" },
  { name: "Equality, Diversity and Inclusion", renewalFrequency: "3 years" },
  { name: "Conflict Resolution / De-escalation", renewalFrequency: "3 years" },
  { name: "Mental Capacity Act & DoLS Awareness", renewalFrequency: "3 years" },
  { name: "Prevent Duty (Counter-Terrorism Awareness)", renewalFrequency: "3 years" },
  { name: "Duty of Candour", renewalFrequency: "3 years" },
  { name: "Lone Working Safety", renewalFrequency: "Annual" },
] as const;

export const PORTAL_STEPS = [
  { step: 1, name: "Identity & Contact", key: "identity" },
  { step: 2, name: "NMC PIN Verification", key: "nmc" },
  { step: 3, name: "DBS Verification", key: "dbs" },
  { step: 4, name: "Right to Work", key: "right_to_work" },
  { step: 5, name: "Professional Profile", key: "profile" },
  { step: 6, name: "Clinical Competency", key: "competency" },
  { step: 7, name: "Mandatory Training", key: "training" },
  { step: 8, name: "Health Declaration", key: "health" },
  { step: 9, name: "References", key: "references" },
  { step: 10, name: "Professional Indemnity", key: "indemnity" },
  { step: 11, name: "Equal Opportunities", key: "equal_opportunities" },
] as const;

export type PortalStepKey = (typeof PORTAL_STEPS)[number]["key"];

// Step keys that have been hoisted out of the Onboarding section into
// the new Assessment section (task 94). The portal sidebar should not
// list these under Onboarding even though they still exist in
// PORTAL_STEPS for internal step-index/render compatibility.
export const ASSESSMENT_HOISTED_STEP_KEYS: readonly PortalStepKey[] = [
  "competency",
];

// Items in the new Assessment sidebar group. These are the three
// prerequisites that must be satisfied before the candidate can move
// into Onboarding/Compliance/Skills Arcade.
export const ASSESSMENT_GROUP_ITEMS = [
  { key: "examination", name: "Clinical examination" },
  { key: "competency", name: "Clinical competency" },
  { key: "cv", name: "CV upload" },
] as const;
export type AssessmentItemKey = (typeof ASSESSMENT_GROUP_ITEMS)[number]["key"];

// ── Onboarding access gate helpers ──────────────────────────────────
// These are intentionally pure / side-effect free so they can be used
// from both server (gating + auto-unlock check) and client (sidebar
// render). The server is the authoritative gate; the client read is
// purely advisory for UX.
export interface OnboardingGateContext {
  examinationCompleted: boolean;
  competencyDeclared: boolean;
  cvReviewed: boolean;
}

export interface OnboardingGateNurse {
  onboardingUnlockMode?: string | null;
  onboardingUnlockedAt?: Date | string | null;
  cvReviewedAt?: Date | string | null;
}

export function isOnboardingUnlocked(
  nurse: OnboardingGateNurse | null | undefined,
  ctx: OnboardingGateContext,
): boolean {
  // Portal-write gate. Two modes:
  //   - "manual": only an explicit admin unlock (onboardingUnlockedAt) opens.
  //   - "auto"  : opens once all three prerequisites are satisfied
  //               (preboard examination, ≥1 competency declaration,
  //               admin CV-review) OR an explicit admin unlock is in place.
  // Either way, a stored onboardingUnlockedAt grandfathered by an admin is
  // honoured so previously-unlocked nurses are never re-locked behind their
  // backs.
  if (!nurse) return false;
  if (nurse.onboardingUnlockedAt) return true;
  const mode = nurse.onboardingUnlockMode || "auto";
  if (mode === "manual") return false;
  return !!(ctx.examinationCompleted && ctx.competencyDeclared && ctx.cvReviewed);
}

// Step keys whose final "completed" state requires an admin to verify the
// candidate's submission (NMC PIN check, DBS background check). When a
// candidate finishes their part of one of these steps the status flips to
// "awaiting_verification"; only the admin verification endpoints in
// server/routes/onboard.ts may promote it to "completed".
export const STEPS_REQUIRING_ADMIN_VERIFICATION: readonly PortalStepKey[] = [
  "nmc",
  "dbs",
];

// Canonical step status values stored in onboardingStates.stepStatuses.
// Plain strings (the column is jsonb<Record<string,string>>) — kept as a
// const map so server + client agree on the spelling.
export const STEP_STATUS = {
  pending: "pending",
  in_progress: "in_progress",
  awaiting_verification: "awaiting_verification",
  completed: "completed",
  failed: "failed",
} as const;
export type StepStatus = (typeof STEP_STATUS)[keyof typeof STEP_STATUS];

export const COMPETENCY_MATRIX = [
  { domain: "Core Clinical", competency: "Basic Life Support (adult)", mandatory: true, minimumLevel: "level_3" },
  { domain: "Core Clinical", competency: "Immediate Life Support", mandatory: false, minimumLevel: "level_2" },
  { domain: "Core Clinical", competency: "Clinical observations — NEWS2 assessment and escalation", mandatory: true, minimumLevel: "level_3" },
  { domain: "Core Clinical", competency: "Sepsis screening (Sepsis Six / NEWS2 trigger)", mandatory: true, minimumLevel: "level_3" },
  { domain: "Core Clinical", competency: "ABCDE systematic assessment", mandatory: true, minimumLevel: "level_3" },
  { domain: "Medication", competency: "Oral medication administration", mandatory: true, minimumLevel: "level_3" },
  { domain: "Medication", competency: "Subcutaneous injection", mandatory: true, minimumLevel: "level_3" },
  { domain: "Medication", competency: "Intramuscular injection", mandatory: true, minimumLevel: "level_3" },
  { domain: "Medication", competency: "Intravenous medication administration", mandatory: false, minimumLevel: "level_2" },
  { domain: "Medication", competency: "Syringe driver management", mandatory: false, minimumLevel: "level_2" },
  { domain: "Wound Care", competency: "Wound assessment and documentation", mandatory: true, minimumLevel: "level_3" },
  { domain: "Wound Care", competency: "Complex dressing application", mandatory: false, minimumLevel: "level_2" },
  { domain: "Catheter Care", competency: "Urinary catheter care (male & female)", mandatory: true, minimumLevel: "level_3" },
  { domain: "Catheter Care", competency: "Urinary catheter insertion (female)", mandatory: false, minimumLevel: "level_2" },
  { domain: "Enteral Feeding", competency: "Nasogastric tube feeding management", mandatory: false, minimumLevel: "level_2" },
  { domain: "Enteral Feeding", competency: "PEG/gastrostomy tube management", mandatory: false, minimumLevel: "level_2" },
  { domain: "Respiratory", competency: "Oxygen therapy administration", mandatory: true, minimumLevel: "level_3" },
  { domain: "Respiratory", competency: "Nebuliser therapy", mandatory: true, minimumLevel: "level_3" },
  { domain: "Respiratory", competency: "Tracheostomy care", mandatory: false, minimumLevel: "level_2" },
  { domain: "Palliative", competency: "End of life care and syringe driver management", mandatory: true, minimumLevel: "level_3" },
  { domain: "Palliative", competency: "Liverpool Care Pathway / individualised care plan", mandatory: false, minimumLevel: "level_2" },
] as const;

export const INDUCTION_POLICIES = [
  "Livaware Staff Handbook",
  "Duty of Candour Policy",
  "Freedom to Speak Up / Whistleblowing Policy",
  "Lone Working Policy",
  "Prevent Duty Awareness",
  "Information Governance Policy",
  "Clinical Governance Framework",
  "Safeguarding Policy",
  "Complaints Procedure",
] as const;

export const REFERENCE_QUESTIONS = [
  { key: "capacity", question: "In what capacity have you worked with the candidate?" },
  { key: "duration", question: "How long have you known the candidate and in what professional context?" },
  { key: "clinical_ability", question: "How would you rate their overall clinical ability?", type: "rating" },
  { key: "reliability", question: "How would you rate their reliability and attendance?", type: "rating" },
  { key: "communication", question: "How would you rate their communication skills?", type: "rating" },
  { key: "teamwork", question: "How would you rate their ability to work as part of a multidisciplinary team?", type: "rating" },
  { key: "initiative", question: "How would you rate their clinical initiative and problem-solving?", type: "rating" },
  { key: "documentation", question: "How would you rate the quality of their clinical documentation?", type: "rating" },
  { key: "strengths", question: "What would you describe as their key strengths?" },
  { key: "development", question: "Are there any areas where they could benefit from further development?" },
  { key: "conduct_concerns", question: "Are you aware of any conduct, capability, or fitness to practise concerns?", type: "yesno" },
  { key: "conduct_details", question: "If yes, please provide details:", dependsOn: "conduct_concerns" },
  { key: "sickness_absence", question: "How would you describe their sickness absence record?", type: "select", options: ["Excellent", "Good", "Fair", "Concerns", "Unable to comment"] },
  { key: "reemploy", question: "Would you re-employ this person or recommend them for a nursing role?", type: "yesno" },
  { key: "additional_comments", question: "Any additional comments you would like to make?" },
] as const;

// Skills Arcade interfaces
export interface ScenarioContent {
  tasks: ScenarioTask[];
}

export interface ScenarioTask {
  id: string;
  type: "ordering" | "matching" | "decision" | "calculation";
  title: string;
  description: string;
  data: OrderingTaskData | MatchingTaskData | DecisionTaskData | CalculationTaskData;
}

export interface OrderingTaskData {
  correctOrder: OrderingStep[];
  distractors?: OrderingStep[];
}

export interface OrderingStep {
  id: string;
  text: string;
  isDistractor?: boolean;
  errorClassification?: "MINOR" | "MAJOR";
  errorRationale?: string;
}

export interface MatchingTaskData {
  pairs: MatchingPair[];
  distractors?: MatchingItem[];
}

export interface MatchingPair {
  left: MatchingItem;
  right: MatchingItem;
}

export interface MatchingItem {
  id: string;
  text: string;
}

export interface DecisionTaskData {
  nodes: DecisionNode[];
  startNodeId: string;
}

export interface DecisionNode {
  id: string;
  prompt: string;
  options: DecisionOption[];
  isTerminal?: boolean;
  terminalMessage?: string;
}

export interface DecisionOption {
  id: string;
  text: string;
  nextNodeId?: string;
  isCorrect: boolean;
  errorClassification?: "MINOR" | "MAJOR";
  errorRationale?: string;
  feedback?: string;
}

export interface CalculationTaskData {
  question: string;
  formula: string;
  inputs: Record<string, number>;
  correctAnswer: number;
  tolerance: number;
  unit: string;
  errorClassification: "MINOR" | "MAJOR";
  errorRationale: string;
}

export interface ScoringResult {
  passed: boolean;
  minorCount: number;
  majorCount: number;
  errors: ScoringError[];
}

export interface ScoringError {
  taskId: string;
  classification: "MINOR" | "MAJOR";
  rationale: string;
  detail: string;
}

// Arcade auth schemas
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Full name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "Passwords do not match", path: ["confirmPassword"] },
);

// express-session table managed by `connect-pg-simple`. Declared here so
// `drizzle-kit push` (run from scripts/post-merge.sh) does not drop it
// during schema sync. Shape matches connect-pg-simple's createTableIfMissing
// output (sid PK, sess JSON, expire timestamp + index).
export const session = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey().notNull(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  }),
);

// ==================== ONBOARDING DECLARATIONS (task 121) ====================
// Six structured declarations a nurse completes during onboarding (EPP,
// Working Time Directive, Rehabilitation of Offenders, Occupational Health,
// Data Protection, Age & Eligibility). Each declaration is keyed by a stable
// declarationKey (defined in server/declarations/) and stored as a versioned
// row so admins can re-issue and see the history.
export const declarationStatusValueEnum = pgEnum("declaration_status_value", [
  "draft",
  "submitted",
  "reopened",
]);

export const nurseDeclarations = pgTable("nurse_declarations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  declarationKey: text("declaration_key").notNull(),
  version: integer("version").notNull().default(1),
  status: declarationStatusValueEnum("status").notNull().default("draft"),
  // Structured answers keyed by question id. Validated against the registry
  // for the declarationKey before submission.
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  signatureName: text("signature_name"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  submittedAt: timestamp("submitted_at"),
  reopenedAt: timestamp("reopened_at"),
  reopenedBy: text("reopened_by"),
  reopenReason: text("reopen_reason"),
  pdfDocumentId: varchar("pdf_document_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("nurse_declarations_nurse_id_idx").on(table.nurseId),
  index("nurse_declarations_key_idx").on(table.declarationKey),
  uniqueIndex("nurse_declarations_nurse_key_version_unique").on(
    table.nurseId,
    table.declarationKey,
    table.version,
  ),
]);

export const insertNurseDeclarationSchema = createInsertSchema(nurseDeclarations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type NurseDeclaration = typeof nurseDeclarations.$inferSelect;
export type InsertNurseDeclaration = z.infer<typeof insertNurseDeclarationSchema>;

// ==================== NURSE AVAILABILITY (task 124) ====================
// Per-nurse, per-day, per-shift (AM/PM/Night) availability for the
// rolling current-month + 6-month-ahead window. Designed for cross-app
// reads by a future rostering app — keep the table flat and query-friendly.
export const shiftEnum = pgEnum("shift", ["am", "pm", "night"]);
export const availabilityStatusEnum = pgEnum("availability_status", [
  "available",
  "preferred",
  "unavailable",
  "working_elsewhere",
]);

export const nurseAvailability = pgTable("nurse_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id, { onDelete: "cascade" }),
  // ISO date (YYYY-MM-DD). Stored as text so cross-app readers don't have to
  // worry about timezone drift on a calendar-day concept.
  date: text("date").notNull(),
  shift: shiftEnum("shift").notNull(),
  status: availabilityStatusEnum("status").notNull(),
  updatedBy: text("updated_by"),
  updatedByRole: text("updated_by_role"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("nurse_availability_nurse_date_shift_unique").on(table.nurseId, table.date, table.shift),
  index("nurse_availability_nurse_id_idx").on(table.nurseId),
  index("nurse_availability_date_idx").on(table.date),
]);

export const insertNurseAvailabilitySchema = createInsertSchema(nurseAvailability).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type NurseAvailability = typeof nurseAvailability.$inferSelect;
export type InsertNurseAvailability = z.infer<typeof insertNurseAvailabilitySchema>;
export type Shift = "am" | "pm" | "night";
export type AvailabilityStatus = "available" | "preferred" | "unavailable" | "working_elsewhere";
export const SHIFTS: Shift[] = ["am", "pm", "night"];
// UI shows a 2-shift Day / Night pattern. The legacy "pm" enum value is
// kept in the DB so historic rows are preserved, but it's no longer
// surfaced in either the portal or admin matrix.
export const VISIBLE_SHIFTS: Shift[] = ["am", "night"];
export const SHIFT_LABELS: Record<Shift, string> = { am: "Day", pm: "PM", night: "Night" };

// ==================== INVOICES (Task #134) ====================

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Sequential per-platform invoice number. Auto-assigned on insert
  // via Postgres SERIAL so it is monotonic, gap-free in normal use,
  // and safe under concurrent submissions. Surfaced in the UI / CSV /
  // payment-reference suggestion as `INV-{padStart(6, "0")}`.
  invoiceNumberSeq: serial("invoice_number_seq").notNull(),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id, { onDelete: "cascade" }),
  // Personal details (snapshotted at submission, editable per-invoice)
  fullName: text("full_name").notNull(),
  ltdCompany: text("ltd_company"),
  utr: text("utr"),
  address: text("address").notNull(),
  email: text("email").notNull(),
  phoneNumber: text("phone_number").notNull(),
  // Bank details
  accountType: text("account_type").notNull(), // personal | business
  accountName: text("account_name").notNull(),
  bankName: text("bank_name").notNull(),
  sortCode: text("sort_code").notNull(),
  accountNumber: text("account_number").notNull(),
  // Totals
  hourlyRate: integer("hourly_rate_pence").notNull(), // pence
  totalHours: integer("total_hours_minutes").notNull(), // minutes (avoids float)
  totalAmount: integer("total_amount_pence").notNull(), // pence
  additionalCostsTotal: integer("additional_costs_total_pence").default(0).notNull(),
  paymentNotes: text("payment_notes"),
  // Status & lifecycle
  status: invoiceStatusEnum("status").default("submitted").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  paidAt: timestamp("paid_at"),
  paidBy: text("paid_by"),
  reconciledAt: timestamp("reconciled_at"),
  reconciledBy: text("reconciled_by"),
  paymentReference: text("payment_reference"),
  paymentDate: text("payment_date"), // YYYY-MM-DD
  rejectedAt: timestamp("rejected_at"),
  rejectedBy: text("rejected_by"),
  rejectedReason: text("rejected_reason"),
  attachmentUrl: text("attachment_url"),
  attachmentFilename: text("attachment_filename"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("invoices_nurse_id_idx").on(table.nurseId),
  index("invoices_status_idx").on(table.status),
  index("invoices_submitted_at_idx").on(table.submittedAt),
]);

export const invoiceTimesheetEntries = pgTable("invoice_timesheet_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(),
  patientInitials: text("patient_initials").notNull(),
  location: text("location").notNull(),
  hoursMinutes: integer("hours_minutes").notNull(),
  amountPence: integer("amount_pence").notNull(),
  position: integer("position").default(0).notNull(),
}, (table) => [
  index("invoice_timesheet_entries_invoice_idx").on(table.invoiceId),
]);

export const invoiceAdditionalCosts = pgTable("invoice_additional_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amountPence: integer("amount_pence").notNull(),
  receiptImageUrl: text("receipt_image_url"),
  position: integer("position").default(0).notNull(),
}, (table) => [
  index("invoice_additional_costs_invoice_idx").on(table.invoiceId),
]);

export type InvoiceRecord = typeof invoices.$inferSelect;
export type InvoiceTimesheetEntryRecord = typeof invoiceTimesheetEntries.$inferSelect;
export type InvoiceAdditionalCostRecord = typeof invoiceAdditionalCosts.$inferSelect;
export type InvoiceStatus = "submitted" | "approved" | "paid" | "reconciled" | "rejected";
export const INVOICE_STATUSES: InvoiceStatus[] = ["submitted", "approved", "paid", "reconciled", "rejected"];

export const personalDetailsSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  ltdCompany: z.string().optional().nullable(),
  utr: z.string().optional().nullable(),
  address: z.string().min(1, "Address is required"),
  email: z.string().email("Valid email is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
});

export const bankDetailsSchema = z.object({
  accountType: z.enum(["personal", "business"]),
  accountName: z.string().min(1, "Account name is required"),
  bankName: z.string().min(1, "Bank name is required"),
  sortCode: z.string().min(1, "Sort code is required"),
  accountNumber: z.string().min(1, "Account number is required"),
});

export const timesheetEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "startTime must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "endTime must be HH:MM"),
  patientInitials: z.string().min(1),
  location: z.string().min(1),
});

export const additionalCostItemSchema = z.object({
  description: z.string().min(1),
  amountPence: z.number().int().nonnegative(),
  receiptImageUrl: z.string().optional().nullable(),
});

export const invoiceSubmissionSchema = z.object({
  personalDetails: personalDetailsSchema,
  bankDetails: bankDetailsSchema,
  timesheetEntries: z.array(timesheetEntrySchema).min(1, "At least one timesheet entry is required"),
  hourlyRatePence: z.number().int().positive("Hourly rate is required"),
  additionalCosts: z.array(additionalCostItemSchema).default([]),
  paymentNotes: z.string().optional().nullable(),
});

export type InvoiceSubmission = z.infer<typeof invoiceSubmissionSchema>;

// ==================== EMAIL TEMPLATES ====================
// Editable subject + HTML/text bodies for one-off broadcast announcements
// (and any future templated email). Tokens supported by the renderer:
//   {{NAME}}, {{PORTAL_URL}}, {{VIDEO_URL}}
// Conditional block: {{#VIDEO_URL}}...{{/VIDEO_URL}} is removed when the
// VIDEO_URL token is empty.
export const emailTemplates = pgTable("email_templates", {
  key: varchar("key").primaryKey(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text").notNull(),
  // Per-section plain-text fields (preferred over bodyHtml/bodyText for
  // structured templates — the renderer assembles these into the branded
  // HTML envelope so admins never touch markup). Shape per template is
  // defined in server/email-templates.ts.
  fields: jsonb("fields"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by"),
});
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ updatedAt: true });
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;

// Aliases for preboard-storage compatibility
export const assessments = preboardAssessments;
export const insertAssessmentSchema = createInsertSchema(preboardAssessments).omit({
  id: true,
  aiAnalysis: true,
  emailSent: true,
  completedAt: true,
});
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;
export type Assessment = typeof preboardAssessments.$inferSelect;
