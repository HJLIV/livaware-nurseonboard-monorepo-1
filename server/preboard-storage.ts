import { db } from "./db";
import { assessments, type Assessment, type InsertAssessment } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createAssessment(data: InsertAssessment): Promise<Assessment>;
  getAssessment(id: number): Promise<Assessment | undefined>;
  getAssessmentByNurseId(nurseId: string): Promise<Assessment | undefined>;
  getAllAssessments(): Promise<Assessment[]>;
  updateAssessmentAnalysis(id: number, aiAnalysis: string): Promise<Assessment | undefined>;
  markEmailSent(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createAssessment(data: InsertAssessment): Promise<Assessment> {
    const [assessment] = await db.insert(assessments).values(data).returning();
    return assessment;
  }

  async getAssessment(id: number): Promise<Assessment | undefined> {
    const [assessment] = await db.select().from(assessments).where(eq(assessments.id, id));
    return assessment;
  }

  async getAssessmentByNurseId(nurseId: string): Promise<Assessment | undefined> {
    const [assessment] = await db.select().from(assessments)
      .where(eq(assessments.nurseId, nurseId))
      .orderBy(desc(assessments.completedAt))
      .limit(1);
    return assessment;
  }

  async getAllAssessments(): Promise<Assessment[]> {
    return db.select().from(assessments).orderBy(desc(assessments.completedAt));
  }

  async updateAssessmentAnalysis(id: number, aiAnalysis: string): Promise<Assessment | undefined> {
    const [updated] = await db.update(assessments)
      .set({ aiAnalysis })
      .where(eq(assessments.id, id))
      .returning();
    return updated;
  }

  async markEmailSent(id: number): Promise<void> {
    await db.update(assessments)
      .set({ emailSent: true })
      .where(eq(assessments.id, id));
  }
}

export const storage = new DatabaseStorage();
