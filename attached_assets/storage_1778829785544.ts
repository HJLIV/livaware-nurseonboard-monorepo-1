import {
  admins, invoices, timesheetEntries,
  type AdminRecord, type InsertAdmin,
  type InvoiceRecord, type InsertInvoice,
  type TimesheetEntryRecord, type InsertTimesheetEntry
} from "@shared/schema";
import { eq, and, desc, isNull, count, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcrypt";

// Create a Postgres client
const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);

// define the interface with all the CRUD methods we need
export interface IStorage {
  // Admin methods
  getAdmin(id: number): Promise<AdminRecord | undefined>;
  getAdminByUsername(username: string): Promise<AdminRecord | undefined>;
  createAdmin(admin: InsertAdmin): Promise<AdminRecord>;
  validateAdminLogin(username: string, password: string): Promise<AdminRecord | null>;
  
  // Invoice methods
  getInvoice(id: number): Promise<InvoiceRecord | undefined>;
  getAllInvoices(status?: string): Promise<InvoiceRecord[]>;
  getInvoiceStats(): Promise<{ 
    total: number; 
    pending: number; 
    approved: number; 
    paid: number;
    totalAmount: number;
    pendingAmount: number;
    paidAmount: number;
  }>;
  createInvoice(invoice: InsertInvoice): Promise<InvoiceRecord>;
  updateInvoiceStatus(id: number, status: 'pending' | 'approved' | 'paid', adminId?: number): Promise<InvoiceRecord | undefined>;
  deleteInvoice(id: number): Promise<boolean>;
  
  // Timesheet methods
  getTimesheetEntries(invoiceId: number): Promise<TimesheetEntryRecord[]>;
  createTimesheetEntry(entry: InsertTimesheetEntry): Promise<TimesheetEntryRecord>;
}

export class PostgresStorage implements IStorage {
  // Admin methods
  async getAdmin(id: number): Promise<AdminRecord | undefined> {
    const results = await db.select().from(admins).where(eq(admins.id, id)).limit(1);
    return results[0];
  }

  async getAdminByUsername(username: string): Promise<AdminRecord | undefined> {
    const results = await db.select().from(admins).where(eq(admins.username, username)).limit(1);
    return results[0];
  }

  async createAdmin(admin: InsertAdmin): Promise<AdminRecord> {
    // Hash the password before storing
    const passwordHash = await bcrypt.hash(admin.passwordHash, 10);
    
    const results = await db.insert(admins).values({
      ...admin,
      passwordHash
    }).returning();
    
    return results[0];
  }

  async validateAdminLogin(username: string, password: string): Promise<AdminRecord | null> {
    const admin = await this.getAdminByUsername(username);
    
    if (!admin) {
      return null;
    }
    
    // Compare the provided password with the stored hash
    const passwordMatches = await bcrypt.compare(password, admin.passwordHash);
    
    return passwordMatches ? admin : null;
  }
  
  // Invoice methods
  async getInvoice(id: number): Promise<InvoiceRecord | undefined> {
    const results = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return results[0];
  }

  async getAllInvoices(status?: string): Promise<InvoiceRecord[]> {
    if (status) {
      return db.select().from(invoices).where(eq(invoices.status, status)).orderBy(desc(invoices.createdAt));
    }
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async getInvoiceStats(): Promise<{ 
    total: number; 
    pending: number; 
    approved: number; 
    paid: number;
    totalAmount: number;
    pendingAmount: number;
    paidAmount: number;
  }> {
    // Get counts by status
    const totalCount = await db.select({ value: count() }).from(invoices);
    const pendingCount = await db.select({ value: count() }).from(invoices).where(eq(invoices.status, 'pending'));
    const approvedCount = await db.select({ value: count() }).from(invoices).where(eq(invoices.status, 'approved'));
    const paidCount = await db.select({ value: count() }).from(invoices).where(eq(invoices.status, 'paid'));
    
    // Get sum amounts by status
    const totalAmount = await db.select({ value: sum(invoices.totalAmount) }).from(invoices);
    const pendingAmount = await db.select({ value: sum(invoices.totalAmount) }).from(invoices).where(eq(invoices.status, 'pending'));
    const paidAmount = await db.select({ value: sum(invoices.totalAmount) }).from(invoices).where(eq(invoices.status, 'paid'));
    
    // Convert possibly null sum values to numbers with fallback to 0
    const totalAmountValue = totalAmount[0].value ? Number(totalAmount[0].value) : 0;
    const pendingAmountValue = pendingAmount[0].value ? Number(pendingAmount[0].value) : 0;
    const paidAmountValue = paidAmount[0].value ? Number(paidAmount[0].value) : 0;
    
    return {
      total: totalCount[0].value || 0,
      pending: pendingCount[0].value || 0,
      approved: approvedCount[0].value || 0,
      paid: paidCount[0].value || 0,
      totalAmount: totalAmountValue,
      pendingAmount: pendingAmountValue,
      paidAmount: paidAmountValue
    };
  }

  async createInvoice(invoice: InsertInvoice): Promise<InvoiceRecord> {
    const results = await db.insert(invoices).values(invoice).returning();
    return results[0];
  }

  async updateInvoiceStatus(id: number, status: 'pending' | 'approved' | 'paid', adminId?: number): Promise<InvoiceRecord | undefined> {
    const updateData: any = { status };
    
    if (status === 'approved') {
      updateData.approvedAt = new Date();
      if (adminId) {
        updateData.approvedBy = adminId;
      }
    } else if (status === 'paid') {
      updateData.paidAt = new Date();
    }
    
    const results = await db
      .update(invoices)
      .set(updateData)
      .where(eq(invoices.id, id))
      .returning();
    
    return results[0];
  }
  
  // Timesheet methods
  async getTimesheetEntries(invoiceId: number): Promise<TimesheetEntryRecord[]> {
    return db.select().from(timesheetEntries).where(eq(timesheetEntries.invoiceId, invoiceId));
  }

  async createTimesheetEntry(entry: InsertTimesheetEntry): Promise<TimesheetEntryRecord> {
    const results = await db.insert(timesheetEntries).values(entry).returning();
    return results[0];
  }

  async deleteInvoice(id: number): Promise<boolean> {
    try {
      // First, delete all related timesheet entries
      await db.delete(timesheetEntries).where(eq(timesheetEntries.invoiceId, id));
      
      // Then delete the invoice
      const result = await db.delete(invoices).where(eq(invoices.id, id)).returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting invoice:", error);
      return false;
    }
  }
}

export const storage = new PostgresStorage();
