import { pgTable, text, serial, integer, boolean, timestamp, real, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Personal details schema
export const personalDetailsSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  ltdCompany: z.string().optional(),
  address: z.string().min(1, "Address is required"),
  email: z.string().email("Valid email is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  utr: z.string().optional(), // Unique Tax Reference for self-employed
});

// Bank details schema
export const bankDetailsSchema = z.object({
  accountType: z.enum(["personal", "business"], {
    required_error: "Account type is required",
    invalid_type_error: "Account type must be 'personal' or 'business'",
  }),
  accountName: z.string().min(1, "Account name is required"),
  bankName: z.string().min(1, "Bank name is required"),
  sortCode: z.string().min(1, "Sort code is required"),
  accountNumber: z.string().min(1, "Account number is required"),
});

// Timesheet entry schema
export const timesheetEntrySchema = z.object({
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  patientInitials: z.string().min(1, "Patient initials are required"),
  location: z.string().min(1, "Location is required"),
  hours: z.number().min(0, "Hours must be a positive number"),
  amount: z.number(),
});

// Additional cost item schema
export const additionalCostItemSchema = z.object({
  id: z.string(),
  description: z.string().min(1, "Description is required"),
  amount: z.number().min(0, "Amount must be a positive number"),
  receiptImage: z.string().optional(), // Base64 encoded image
});

// Additional details schema
export const additionalDetailsSchema = z.object({
  additionalCostItems: z.array(additionalCostItemSchema).default([]),
  paymentNotes: z.string().optional(),
});

// Full invoice schema
export const invoiceSchema = z.object({
  personalDetails: personalDetailsSchema,
  bankDetails: bankDetailsSchema,
  timesheetEntries: z.array(timesheetEntrySchema).min(1, "At least one timesheet entry is required"),
  hourlyRate: z.number().min(0, "Hourly rate must be a positive number"),
  additionalDetails: additionalDetailsSchema.optional(),
});

// Define the admin users table
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});

// Define database tables
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  companyDetails: text("company_details"),
  address: text("address").notNull(),
  email: text("email").notNull(),
  phoneNumber: text("phone_number").notNull(),
  accountName: text("account_name").notNull(),
  bankName: text("bank_name").notNull(),
  sortCode: text("sort_code").notNull(),
  accountNumber: text("account_number").notNull(),
  hourlyRate: real("hourly_rate").notNull(),
  totalHours: real("total_hours").notNull(),
  totalAmount: real("total_amount").notNull(),
  additionalCosts: real("additional_costs").default(0),
  additionalCostDescription: text("additional_cost_description"),
  paymentNotes: text("payment_notes"),
  status: text("status").notNull().default('pending'),  // pending, approved, paid
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  approvedBy: integer("approved_by").references(() => admins.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const timesheetEntries = pgTable("timesheet_entries", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  patientInitials: text("patient_initials").notNull(),
  location: text("location").notNull(),
  hours: real("hours").notNull(),
  amount: real("amount").notNull(),
});

// Define relationships
export const invoicesRelations = relations(invoices, ({ many, one }) => ({
  timesheetEntries: many(timesheetEntries),
  approvedByAdmin: one(admins, {
    fields: [invoices.approvedBy],
    references: [admins.id],
  }),
}));

export const timesheetEntriesRelations = relations(timesheetEntries, ({ one }) => ({
  invoice: one(invoices, {
    fields: [timesheetEntries.invoiceId],
    references: [invoices.id],
  }),
}));

// Admin schema
export const adminLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const adminSchema = adminLoginSchema.extend({
  id: z.number(),
  createdAt: z.date(),
});

// Create insert schemas from the tables
export const insertInvoiceSchema = createInsertSchema(invoices, {
  status: z.enum(['pending', 'approved', 'paid']),
}).omit({ approvedAt: true, paidAt: true, approvedBy: true });

export const insertTimesheetEntrySchema = createInsertSchema(timesheetEntries);
export const insertAdminSchema = createInsertSchema(admins).omit({ id: true, createdAt: true });

// Define types
export type PersonalDetails = z.infer<typeof personalDetailsSchema>;
export type BankDetails = z.infer<typeof bankDetailsSchema>;
export type TimesheetEntry = z.infer<typeof timesheetEntrySchema>;
export type AdditionalCostItem = z.infer<typeof additionalCostItemSchema>;
export type AdditionalDetails = z.infer<typeof additionalDetailsSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type AdminLogin = z.infer<typeof adminLoginSchema>;
export type Admin = z.infer<typeof adminSchema>;

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertTimesheetEntry = z.infer<typeof insertTimesheetEntrySchema>;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;

export type InvoiceRecord = typeof invoices.$inferSelect;
export type TimesheetEntryRecord = typeof timesheetEntries.$inferSelect;
export type AdminRecord = typeof admins.$inferSelect;
