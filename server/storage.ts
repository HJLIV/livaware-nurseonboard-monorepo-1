import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "./db";
import {
  candidates, nmcVerifications, dbsVerifications, competencyDeclarations,
  documents, references, mandatoryTraining, healthDeclarations,
  inductionPolicies, professionalIndemnity, onboardingStates, auditLogs, magicLinks, refereeTokens,
  employmentHistory, educationHistory, equalOpportunities,
  type Candidate, type InsertCandidate,
  type NmcVerification, type InsertNmcVerification,
  type DbsVerification, type InsertDbsVerification,
  type CompetencyDeclaration, type InsertCompetencyDeclaration,
  type Document, type InsertDocument,
  type Reference, type InsertReference,
  type MandatoryTraining, type InsertMandatoryTraining,
  type HealthDeclaration, type InsertHealthDeclaration,
  type InductionPolicy, type InsertInductionPolicy,
  type ProfessionalIndemnity, type InsertProfessionalIndemnity,
  type OnboardingState, type InsertOnboardingState,
  type AuditLog, type InsertAuditLog,
  type MagicLink, type InsertMagicLink,
  type RefereeToken, type InsertRefereeToken,
  type EmploymentHistory, type InsertEmploymentHistory,
  type EducationHistory, type InsertEducationHistory,
  type EqualOpportunities, type InsertEqualOpportunities,
} from "@shared/schema";

export interface IStorage {
  getCandidates(): Promise<Candidate[]>;
  getCandidate(id: string): Promise<Candidate | undefined>;
  createCandidate(data: InsertCandidate): Promise<Candidate>;
  updateCandidate(id: string, data: Partial<InsertCandidate>): Promise<Candidate | undefined>;

  getNmcVerification(candidateId: string): Promise<NmcVerification | undefined>;
  createNmcVerification(data: InsertNmcVerification): Promise<NmcVerification>;

  getDbsVerification(candidateId: string): Promise<DbsVerification | undefined>;
  createDbsVerification(data: InsertDbsVerification): Promise<DbsVerification>;

  getCompetencyDeclarations(candidateId: string): Promise<CompetencyDeclaration[]>;
  createCompetencyDeclaration(data: InsertCompetencyDeclaration): Promise<CompetencyDeclaration>;
  updateCompetencyDeclaration(id: string, data: Partial<InsertCompetencyDeclaration>): Promise<CompetencyDeclaration | undefined>;

  getDocuments(candidateId: string): Promise<Document[]>;
  createDocument(data: InsertDocument): Promise<Document>;
  updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document | undefined>;
  deleteDocument(id: string): Promise<void>;

  getReferences(candidateId: string): Promise<Reference[]>;
  createReference(data: InsertReference): Promise<Reference>;
  updateReference(id: string, data: Partial<InsertReference>): Promise<Reference | undefined>;

  getMandatoryTraining(candidateId: string): Promise<MandatoryTraining[]>;
  createMandatoryTraining(data: InsertMandatoryTraining): Promise<MandatoryTraining>;
  updateMandatoryTraining(id: string, data: Partial<InsertMandatoryTraining>): Promise<MandatoryTraining | undefined>;

  getHealthDeclaration(candidateId: string): Promise<HealthDeclaration | undefined>;
  createHealthDeclaration(data: InsertHealthDeclaration): Promise<HealthDeclaration>;
  updateHealthDeclaration(id: string, data: Partial<InsertHealthDeclaration>): Promise<HealthDeclaration | undefined>;

  getInductionPolicies(candidateId: string): Promise<InductionPolicy[]>;
  createInductionPolicy(data: InsertInductionPolicy): Promise<InductionPolicy>;
  updateInductionPolicy(id: string, data: Partial<InsertInductionPolicy>): Promise<InductionPolicy | undefined>;

  getProfessionalIndemnity(candidateId: string): Promise<ProfessionalIndemnity | undefined>;
  createProfessionalIndemnity(data: InsertProfessionalIndemnity): Promise<ProfessionalIndemnity>;
  updateProfessionalIndemnity(id: string, data: Partial<InsertProfessionalIndemnity>): Promise<ProfessionalIndemnity | undefined>;

  getOnboardingState(candidateId: string): Promise<OnboardingState | undefined>;
  createOnboardingState(data: InsertOnboardingState): Promise<OnboardingState>;
  updateOnboardingState(id: string, data: Partial<InsertOnboardingState>): Promise<OnboardingState | undefined>;

  getAuditLogs(candidateId?: string): Promise<AuditLog[]>;
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;

  getDashboardStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    escalations: number;
    cleared: number;
    pendingReferences: number;
  }>;

  createMagicLink(data: InsertMagicLink): Promise<MagicLink>;
  getMagicLinkByToken(token: string): Promise<MagicLink | undefined>;
  markMagicLinkUsed(id: string): Promise<void>;
  getMagicLinksForCandidate(candidateId: string): Promise<MagicLink[]>;
  getDocument(id: string): Promise<Document | undefined>;

  createRefereeToken(data: InsertRefereeToken): Promise<RefereeToken>;
  getRefereeTokenByToken(token: string): Promise<RefereeToken | undefined>;
  markRefereeTokenCompleted(id: string): Promise<void>;
  getReference(id: string): Promise<Reference | undefined>;

  getEmploymentHistory(candidateId: string): Promise<EmploymentHistory[]>;
  createEmploymentHistory(data: InsertEmploymentHistory): Promise<EmploymentHistory>;
  updateEmploymentHistory(id: string, data: Partial<InsertEmploymentHistory>): Promise<EmploymentHistory | undefined>;
  deleteEmploymentHistory(id: string, candidateId?: string): Promise<boolean>;

  getEducationHistory(candidateId: string): Promise<EducationHistory[]>;
  createEducationHistory(data: InsertEducationHistory): Promise<EducationHistory>;
  updateEducationHistory(id: string, data: Partial<InsertEducationHistory>): Promise<EducationHistory | undefined>;
  deleteEducationHistory(id: string, candidateId?: string): Promise<boolean>;

  getEqualOpportunities(candidateRef: string): Promise<EqualOpportunities | undefined>;
  createEqualOpportunities(data: InsertEqualOpportunities): Promise<EqualOpportunities>;
  updateEqualOpportunities(id: string, data: Partial<InsertEqualOpportunities>): Promise<EqualOpportunities | undefined>;
  getEqualOpportunitiesAggregate(): Promise<{
    total: number;
    fields: Record<string, { counts: Record<string, number>; percentages: Record<string, number> }>;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getCandidates(): Promise<Candidate[]> {
    return db.select().from(candidates).orderBy(desc(candidates.createdAt));
  }

  async getCandidate(id: string): Promise<Candidate | undefined> {
    const [result] = await db.select().from(candidates).where(eq(candidates.id, id));
    return result;
  }

  async createCandidate(data: InsertCandidate): Promise<Candidate> {
    const [result] = await db.insert(candidates).values(data).returning();
    return result;
  }

  async updateCandidate(id: string, data: Partial<InsertCandidate>): Promise<Candidate | undefined> {
    const [result] = await db.update(candidates).set({ ...data, updatedAt: new Date() }).where(eq(candidates.id, id)).returning();
    return result;
  }

  async getNmcVerification(candidateId: string): Promise<NmcVerification | undefined> {
    const [result] = await db.select().from(nmcVerifications).where(eq(nmcVerifications.nurseId, candidateId)).orderBy(desc(nmcVerifications.createdAt)).limit(1);
    return result;
  }

  async createNmcVerification(data: InsertNmcVerification): Promise<NmcVerification> {
    const [result] = await db.insert(nmcVerifications).values(data).returning();
    return result;
  }

  async getDbsVerification(candidateId: string): Promise<DbsVerification | undefined> {
    const [result] = await db.select().from(dbsVerifications).where(eq(dbsVerifications.nurseId, candidateId)).orderBy(desc(dbsVerifications.createdAt)).limit(1);
    return result;
  }

  async createDbsVerification(data: InsertDbsVerification): Promise<DbsVerification> {
    const [result] = await db.insert(dbsVerifications).values(data).returning();
    return result;
  }

  async getCompetencyDeclarations(candidateId: string): Promise<CompetencyDeclaration[]> {
    return db.select().from(competencyDeclarations).where(eq(competencyDeclarations.nurseId, candidateId));
  }

  async createCompetencyDeclaration(data: InsertCompetencyDeclaration): Promise<CompetencyDeclaration> {
    const [result] = await db.insert(competencyDeclarations).values(data).returning();
    return result;
  }

  async updateCompetencyDeclaration(id: string, data: Partial<InsertCompetencyDeclaration>): Promise<CompetencyDeclaration | undefined> {
    const [result] = await db.update(competencyDeclarations).set(data).where(eq(competencyDeclarations.id, id)).returning();
    return result;
  }

  async getDocuments(candidateId: string): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.nurseId, candidateId)).orderBy(desc(documents.uploadedAt));
  }

  async getAllDocuments(): Promise<Document[]> {
    return db.select().from(documents);
  }

  async getAllMandatoryTraining(): Promise<MandatoryTraining[]> {
    return db.select().from(mandatoryTraining);
  }

  async getAllCompetencyDeclarations(): Promise<CompetencyDeclaration[]> {
    return db.select().from(competencyDeclarations);
  }

  async getAllInductionPolicies(): Promise<InductionPolicy[]> {
    return db.select().from(inductionPolicies);
  }

  async getAllProfessionalIndemnity(): Promise<ProfessionalIndemnity[]> {
    return db.select().from(professionalIndemnity);
  }

  async getAllHealthDeclarations(): Promise<HealthDeclaration[]> {
    return db.select().from(healthDeclarations);
  }

  async getAllReferences(): Promise<Reference[]> {
    return db.select().from(references);
  }

  async getAllNmcVerifications(): Promise<NmcVerification[]> {
    return db.select().from(nmcVerifications);
  }

  async getAllDbsVerifications(): Promise<DbsVerification[]> {
    return db.select().from(dbsVerifications);
  }

  async getAllOnboardingStates(): Promise<OnboardingState[]> {
    return db.select().from(onboardingStates);
  }

  async createDocument(data: InsertDocument): Promise<Document> {
    const [result] = await db.insert(documents).values(data).returning();
    return result;
  }

  async updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document | undefined> {
    const [result] = await db.update(documents).set(data).where(eq(documents.id, id)).returning();
    return result;
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async getReferences(candidateId: string): Promise<Reference[]> {
    return db.select().from(references).where(eq(references.nurseId, candidateId)).orderBy(desc(references.createdAt));
  }

  async createReference(data: InsertReference): Promise<Reference> {
    const [result] = await db.insert(references).values(data).returning();
    return result;
  }

  async updateReference(id: string, data: Partial<InsertReference>): Promise<Reference | undefined> {
    const [result] = await db.update(references).set(data).where(eq(references.id, id)).returning();
    return result;
  }

  async getMandatoryTraining(candidateId: string): Promise<MandatoryTraining[]> {
    return db.select().from(mandatoryTraining).where(eq(mandatoryTraining.nurseId, candidateId));
  }

  async createMandatoryTraining(data: InsertMandatoryTraining): Promise<MandatoryTraining> {
    const [result] = await db.insert(mandatoryTraining).values(data).returning();
    return result;
  }

  async updateMandatoryTraining(id: string, data: Partial<InsertMandatoryTraining>): Promise<MandatoryTraining | undefined> {
    const [result] = await db.update(mandatoryTraining).set(data).where(eq(mandatoryTraining.id, id)).returning();
    return result;
  }

  async getHealthDeclaration(candidateId: string): Promise<HealthDeclaration | undefined> {
    const [result] = await db.select().from(healthDeclarations).where(eq(healthDeclarations.nurseId, candidateId)).limit(1);
    return result;
  }

  async createHealthDeclaration(data: InsertHealthDeclaration): Promise<HealthDeclaration> {
    const [result] = await db.insert(healthDeclarations).values(data).returning();
    return result;
  }

  async updateHealthDeclaration(id: string, data: Partial<InsertHealthDeclaration>): Promise<HealthDeclaration | undefined> {
    const [result] = await db.update(healthDeclarations).set(data).where(eq(healthDeclarations.id, id)).returning();
    return result;
  }

  async getInductionPolicies(candidateId: string): Promise<InductionPolicy[]> {
    return db.select().from(inductionPolicies).where(eq(inductionPolicies.nurseId, candidateId));
  }

  async createInductionPolicy(data: InsertInductionPolicy): Promise<InductionPolicy> {
    const [result] = await db.insert(inductionPolicies).values(data).returning();
    return result;
  }

  async updateInductionPolicy(id: string, data: Partial<InsertInductionPolicy>): Promise<InductionPolicy | undefined> {
    const [result] = await db.update(inductionPolicies).set(data).where(eq(inductionPolicies.id, id)).returning();
    return result;
  }

  async getProfessionalIndemnity(candidateId: string): Promise<ProfessionalIndemnity | undefined> {
    const [result] = await db.select().from(professionalIndemnity).where(eq(professionalIndemnity.nurseId, candidateId)).limit(1);
    return result;
  }

  async createProfessionalIndemnity(data: InsertProfessionalIndemnity): Promise<ProfessionalIndemnity> {
    const [result] = await db.insert(professionalIndemnity).values(data).returning();
    return result;
  }

  async updateProfessionalIndemnity(id: string, data: Partial<InsertProfessionalIndemnity>): Promise<ProfessionalIndemnity | undefined> {
    const [result] = await db.update(professionalIndemnity).set(data).where(eq(professionalIndemnity.id, id)).returning();
    return result;
  }

  async getOnboardingState(candidateId: string): Promise<OnboardingState | undefined> {
    const [result] = await db.select().from(onboardingStates).where(eq(onboardingStates.nurseId, candidateId)).limit(1);
    return result;
  }

  async createOnboardingState(data: InsertOnboardingState): Promise<OnboardingState> {
    const [result] = await db.insert(onboardingStates).values(data).returning();
    return result;
  }

  async updateOnboardingState(id: string, data: Partial<InsertOnboardingState>): Promise<OnboardingState | undefined> {
    const [result] = await db.update(onboardingStates).set(data).where(eq(onboardingStates.id, id)).returning();
    return result;
  }

  async getAuditLogs(candidateId?: string): Promise<AuditLog[]> {
    if (candidateId) {
      return db.select().from(auditLogs).where(eq(auditLogs.nurseId, candidateId)).orderBy(desc(auditLogs.timestamp)).limit(100);
    }
    return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(200);
  }

  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [result] = await db.insert(auditLogs).values(data).returning();
    return result;
  }

  async getDashboardStats() {
    const statusCounts = await db
      .select({
        status: candidates.onboardStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(candidates)
      .groupBy(candidates.onboardStatus);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusCounts) {
      if (row.status) {
        byStatus[row.status] = row.count;
      }
      total += row.count;
    }

    const [refResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(references)
      .where(eq(references.outcome, "pending"));

    return {
      total,
      byStatus,
      escalations: byStatus["escalated"] || 0,
      cleared: byStatus["cleared"] || 0,
      pendingReferences: refResult?.count || 0,
    };
  }

  async createMagicLink(data: InsertMagicLink): Promise<MagicLink> {
    const [result] = await db.insert(magicLinks).values(data).returning();
    return result;
  }

  async getMagicLinkByToken(token: string): Promise<MagicLink | undefined> {
    const [result] = await db.select().from(magicLinks).where(eq(magicLinks.token, token)).limit(1);
    return result;
  }

  async markMagicLinkUsed(id: string): Promise<void> {
    await db.update(magicLinks).set({ usedAt: new Date() }).where(eq(magicLinks.id, id));
  }

  async getMagicLinksForCandidate(candidateId: string): Promise<MagicLink[]> {
    return db.select().from(magicLinks).where(eq(magicLinks.nurseId, candidateId)).orderBy(desc(magicLinks.createdAt));
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [result] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return result;
  }

  async createRefereeToken(data: InsertRefereeToken): Promise<RefereeToken> {
    const [result] = await db.insert(refereeTokens).values(data).returning();
    return result;
  }

  async getRefereeTokenByToken(token: string): Promise<RefereeToken | undefined> {
    const [result] = await db.select().from(refereeTokens).where(eq(refereeTokens.token, token)).limit(1);
    return result;
  }

  async markRefereeTokenCompleted(id: string): Promise<void> {
    await db.update(refereeTokens).set({ completedAt: new Date() }).where(eq(refereeTokens.id, id));
  }

  async getReference(id: string): Promise<Reference | undefined> {
    const [result] = await db.select().from(references).where(eq(references.id, id)).limit(1);
    return result;
  }

  async getEmploymentHistory(candidateId: string): Promise<EmploymentHistory[]> {
    return db.select().from(employmentHistory).where(eq(employmentHistory.nurseId, candidateId)).orderBy(desc(employmentHistory.createdAt));
  }

  async createEmploymentHistory(data: InsertEmploymentHistory): Promise<EmploymentHistory> {
    const [result] = await db.insert(employmentHistory).values(data).returning();
    return result;
  }

  async updateEmploymentHistory(id: string, data: Partial<InsertEmploymentHistory>): Promise<EmploymentHistory | undefined> {
    const [result] = await db.update(employmentHistory).set(data).where(eq(employmentHistory.id, id)).returning();
    return result;
  }

  async deleteEmploymentHistory(id: string, candidateId?: string): Promise<boolean> {
    if (candidateId) {
      const result = await db.delete(employmentHistory).where(and(eq(employmentHistory.id, id), eq(employmentHistory.nurseId, candidateId))).returning();
      return result.length > 0;
    }
    await db.delete(employmentHistory).where(eq(employmentHistory.id, id));
    return true;
  }

  async getEducationHistory(candidateId: string): Promise<EducationHistory[]> {
    return db.select().from(educationHistory).where(eq(educationHistory.nurseId, candidateId)).orderBy(desc(educationHistory.createdAt));
  }

  async createEducationHistory(data: InsertEducationHistory): Promise<EducationHistory> {
    const [result] = await db.insert(educationHistory).values(data).returning();
    return result;
  }

  async updateEducationHistory(id: string, data: Partial<InsertEducationHistory>): Promise<EducationHistory | undefined> {
    const [result] = await db.update(educationHistory).set(data).where(eq(educationHistory.id, id)).returning();
    return result;
  }

  async deleteEducationHistory(id: string, candidateId?: string): Promise<boolean> {
    if (candidateId) {
      const result = await db.delete(educationHistory).where(and(eq(educationHistory.id, id), eq(educationHistory.nurseId, candidateId))).returning();
      return result.length > 0;
    }
    await db.delete(educationHistory).where(eq(educationHistory.id, id));
    return true;
  }

  async getEqualOpportunities(candidateRef: string): Promise<EqualOpportunities | undefined> {
    const [result] = await db.select().from(equalOpportunities).where(eq(equalOpportunities.candidateRef, candidateRef)).limit(1);
    return result;
  }

  async createEqualOpportunities(data: InsertEqualOpportunities): Promise<EqualOpportunities> {
    const [result] = await db.insert(equalOpportunities).values(data).returning();
    return result;
  }

  async updateEqualOpportunities(id: string, data: Partial<InsertEqualOpportunities>): Promise<EqualOpportunities | undefined> {
    const [result] = await db.update(equalOpportunities).set({ ...data, updatedAt: new Date() }).where(eq(equalOpportunities.id, id)).returning();
    return result;
  }

  async getEqualOpportunitiesAggregate(): Promise<{
    total: number;
    fields: Record<string, { counts: Record<string, number>; percentages: Record<string, number> }>;
  }> {
    const allRecords = await db.select().from(equalOpportunities);
    const total = allRecords.length;
    const fieldNames = ["gender", "ethnicity", "disabilityStatus", "religionBelief", "sexualOrientation", "ageBand"] as const;
    const fields: Record<string, { counts: Record<string, number>; percentages: Record<string, number> }> = {};
    for (const field of fieldNames) {
      const counts: Record<string, number> = {};
      for (const record of allRecords) {
        const value = record[field] || "Not provided";
        counts[value] = (counts[value] || 0) + 1;
      }
      const percentages: Record<string, number> = {};
      if (total > 0) {
        for (const [key, count] of Object.entries(counts)) {
          percentages[key] = Math.round((count / total) * 1000) / 10;
        }
      }
      fields[field] = { counts, percentages };
    }
    return { total, fields };
  }
}

export const storage = new DatabaseStorage();
