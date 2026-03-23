import { eq, and, sql, desc, count } from "drizzle-orm";
import { db } from "./db";
import {
  users, modules, moduleVersions, scenarios, assignments,
  attempts, remediationCases, remediationNotes, clearances,
  type User, type InsertUser, type Module, type Scenario,
  type Assignment, type Attempt, type RemediationCase,
  type RemediationNote, type Clearance, type ModuleVersion,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserCount(): Promise<number>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  getModule(id: string): Promise<Module | undefined>;
  getAllModules(): Promise<Module[]>;
  createModule(mod: Partial<Module>): Promise<Module>;
  getModuleVersion(id: string): Promise<ModuleVersion | undefined>;
  getLatestModuleVersion(moduleId: string): Promise<ModuleVersion | undefined>;
  createModuleVersion(mv: Partial<ModuleVersion>): Promise<ModuleVersion>;
  getScenario(id: string): Promise<Scenario | undefined>;
  getScenariosByModuleVersion(mvId: string): Promise<Scenario[]>;
  createScenario(s: Partial<Scenario>): Promise<Scenario>;
  getAssignment(id: string): Promise<Assignment | undefined>;
  getAssignmentsByUser(userId: string): Promise<Assignment[]>;
  createAssignment(a: Partial<Assignment>): Promise<Assignment>;
  updateAssignmentStatus(id: string, status: string): Promise<void>;
  getAttempt(id: string): Promise<Attempt | undefined>;
  getAttemptsByAssignment(assignmentId: string): Promise<Attempt[]>;
  getFailedAttemptCount(userId: string, moduleVersionId: string): Promise<number>;
  createAttempt(a: Partial<Attempt>): Promise<Attempt>;
  updateAttempt(id: string, data: Partial<Attempt>): Promise<void>;
  getRemediationCases(status?: string): Promise<RemediationCase[]>;
  getRemediationCase(id: string): Promise<RemediationCase | undefined>;
  createRemediationCase(rc: Partial<RemediationCase>): Promise<RemediationCase>;
  updateRemediationCase(id: string, data: Partial<RemediationCase>): Promise<void>;
  createRemediationNote(note: Partial<RemediationNote>): Promise<RemediationNote>;
  getClearance(userId: string, moduleId: string): Promise<Clearance | undefined>;
  upsertClearance(c: Partial<Clearance>): Promise<Clearance>;
  getAllAttempts(): Promise<Attempt[]>;
  getAssignmentCount(moduleId: string): Promise<number>;
  getScenarioCount(moduleVersionId: string): Promise<number>;
  getAttemptsByUserAndModule(userId: string, moduleVersionId: string): Promise<Attempt[]>;
  getRemediationNotes(caseId: string): Promise<RemediationNote[]>;
}

class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserCount() {
    const [result] = await db.select({ count: count() }).from(users);
    return result.count;
  }

  async createUser(user: InsertUser) {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getAllUsers() {
    return db.select().from(users).orderBy(users.name);
  }

  async getModule(id: string) {
    const [mod] = await db.select().from(modules).where(eq(modules.id, id));
    return mod;
  }

  async getAllModules() {
    return db.select().from(modules).where(eq(modules.isActive, true));
  }

  async createModule(mod: Partial<Module>) {
    const [created] = await db.insert(modules).values(mod as any).returning();
    return created;
  }

  async getModuleVersion(id: string) {
    const [mv] = await db.select().from(moduleVersions).where(eq(moduleVersions.id, id));
    return mv;
  }

  async getLatestModuleVersion(moduleId: string) {
    const [mv] = await db.select().from(moduleVersions)
      .where(eq(moduleVersions.moduleId, moduleId))
      .orderBy(desc(moduleVersions.publishedAt))
      .limit(1);
    return mv;
  }

  async createModuleVersion(mv: Partial<ModuleVersion>) {
    const [created] = await db.insert(moduleVersions).values(mv as any).returning();
    return created;
  }

  async getScenario(id: string) {
    const [s] = await db.select().from(scenarios).where(eq(scenarios.id, id));
    return s;
  }

  async getScenariosByModuleVersion(mvId: string) {
    return db.select().from(scenarios)
      .where(and(eq(scenarios.moduleVersionId, mvId), eq(scenarios.isActive, true)));
  }

  async createScenario(s: Partial<Scenario>) {
    const [created] = await db.insert(scenarios).values(s as any).returning();
    return created;
  }

  async getAssignment(id: string) {
    const [a] = await db.select().from(assignments).where(eq(assignments.id, id));
    return a;
  }

  async getAssignmentsByUser(userId: string) {
    return db.select().from(assignments).where(eq(assignments.userId, userId));
  }

  async createAssignment(a: Partial<Assignment>) {
    const [created] = await db.insert(assignments).values(a as any).returning();
    return created;
  }

  async updateAssignmentStatus(id: string, status: string) {
    await db.update(assignments).set({ status: status as any }).where(eq(assignments.id, id));
  }

  async getAttempt(id: string) {
    const [a] = await db.select().from(attempts).where(eq(attempts.id, id));
    return a;
  }

  async getAttemptsByAssignment(assignmentId: string) {
    return db.select().from(attempts)
      .where(eq(attempts.assignmentId, assignmentId))
      .orderBy(desc(attempts.startedAt));
  }

  async getFailedAttemptCount(userId: string, moduleVersionId: string) {
    const result = await db.select({ count: count() }).from(attempts)
      .where(and(
        eq(attempts.userId, userId),
        eq(attempts.moduleVersionId, moduleVersionId),
        eq(attempts.result, "fail")
      ));
    return result[0]?.count ?? 0;
  }

  async createAttempt(a: Partial<Attempt>) {
    const [created] = await db.insert(attempts).values(a as any).returning();
    return created;
  }

  async updateAttempt(id: string, data: Partial<Attempt>) {
    await db.update(attempts).set(data as any).where(eq(attempts.id, id));
  }

  async getRemediationCases(status?: string) {
    if (status) {
      return db.select().from(remediationCases)
        .where(eq(remediationCases.status, status as any))
        .orderBy(desc(remediationCases.lockedAt));
    }
    return db.select().from(remediationCases).orderBy(desc(remediationCases.lockedAt));
  }

  async getRemediationCase(id: string) {
    const [rc] = await db.select().from(remediationCases).where(eq(remediationCases.id, id));
    return rc;
  }

  async createRemediationCase(rc: Partial<RemediationCase>) {
    const [created] = await db.insert(remediationCases).values(rc as any).returning();
    return created;
  }

  async updateRemediationCase(id: string, data: Partial<RemediationCase>) {
    await db.update(remediationCases).set(data as any).where(eq(remediationCases.id, id));
  }

  async createRemediationNote(note: Partial<RemediationNote>) {
    const [created] = await db.insert(remediationNotes).values(note as any).returning();
    return created;
  }

  async getClearance(userId: string, moduleId: string) {
    const [c] = await db.select().from(clearances)
      .where(and(eq(clearances.userId, userId), eq(clearances.moduleId, moduleId)));
    return c;
  }

  async upsertClearance(c: Partial<Clearance>) {
    const existing = await this.getClearance(c.userId!, c.moduleId!);
    if (existing) {
      await db.update(clearances).set(c as any).where(eq(clearances.id, existing.id));
      return { ...existing, ...c } as Clearance;
    }
    const [created] = await db.insert(clearances).values(c as any).returning();
    return created;
  }

  async getAllAttempts() {
    return db.select().from(attempts).orderBy(desc(attempts.startedAt));
  }

  async getAssignmentCount(moduleId: string) {
    const result = await db.select({ count: count() }).from(assignments)
      .where(eq(assignments.moduleId, moduleId));
    return result[0]?.count ?? 0;
  }

  async getScenarioCount(moduleVersionId: string) {
    const result = await db.select({ count: count() }).from(scenarios)
      .where(eq(scenarios.moduleVersionId, moduleVersionId));
    return result[0]?.count ?? 0;
  }

  async getAttemptsByUserAndModule(userId: string, moduleVersionId: string) {
    return db.select().from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.moduleVersionId, moduleVersionId)))
      .orderBy(desc(attempts.startedAt));
  }

  async getRemediationNotes(caseId: string) {
    return db.select().from(remediationNotes)
      .where(eq(remediationNotes.remediationCaseId, caseId))
      .orderBy(desc(remediationNotes.createdAt));
  }
}

export const storage = new DatabaseStorage();
