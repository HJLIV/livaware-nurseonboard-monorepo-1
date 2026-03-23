import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, boolean, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
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
export const auditModuleEnum = pgEnum("audit_module", ["preboard", "onboard", "skills_arcade", "admin", "portal", "system"]);

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const portalLinks = pgTable("portal_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nurseId: varchar("nurse_id").notNull().references(() => nurses.id),
  token: varchar("token").notNull().unique(),
  module: portalModuleEnum("module").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  usedAt: timestamp("used_at"),
  createdBy: text("created_by"),
}, (table) => [
  index("portal_links_nurse_id_idx").on(table.nurseId),
  index("portal_links_token_idx").on(table.token),
]);

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
});

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
  uploadedBy: text("uploaded_by").default("admin"),
  sharepointUrl: text("sharepoint_url"),
  aiStatus: text("ai_status"),
  aiIssues: jsonb("ai_issues"),
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
  { name: "Modern Slavery Awareness", renewalFrequency: "3 years" },
  { name: "Duty of Candour", renewalFrequency: "3 years" },
  { name: "Lone Working Safety", renewalFrequency: "Annual" },
  { name: "Food Hygiene Awareness", renewalFrequency: "3 years" },
] as const;

export const INDUCTION_POLICIES = [
  "Livaware Staff Handbook",
  "Duty of Candour Policy",
  "Freedom to Speak Up / Whistleblowing Policy",
  "Lone Working Policy",
  "Modern Slavery Statement",
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
