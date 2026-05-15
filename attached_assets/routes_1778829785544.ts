import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { invoiceSchema, adminLoginSchema, insertInvoiceSchema, insertTimesheetEntrySchema } from "@shared/schema";
import pgSession from 'connect-pg-simple';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { db } from './storage';

// Declare session type interface with admin property
declare module 'express-session' {
  interface SessionData {
    admin?: {
      id: number;
      username: string;
    };
    authenticated?: boolean;
  }
}

// Middleware to check if user is authenticated
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.authenticated) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized - Please login' });
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Session setup
  const PgSession = pgSession(session);
  
  app.use(cookieParser());
  app.use(session({
    store: new PgSession({
      conObject: {
        connectionString: process.env.DATABASE_URL!,
      },
      tableName: 'session', // Sessions will be stored in a table named session
      createTableIfMissing: true // Create the session table if it doesn't exist
    }),
    secret: process.env.SESSION_SECRET || 'livaware-invoice-app-secret', // Use environment variable in production
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: false, // Allow cookies over HTTP for development and deployment
      sameSite: 'lax' // Helps with CSRF protection
    }
  }));
  
  // =====================
  // AUTH ROUTES
  // =====================
  
  // Login endpoint
  app.post('/api/auth/login', async (req, res) => {
    try {
      // Validate login data
      const validatedData = adminLoginSchema.parse(req.body);
      
      // Authenticate user
      const admin = await storage.validateAdminLogin(
        validatedData.username, 
        validatedData.password
      );
      
      if (!admin) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Store admin in session
      req.session.admin = {
        id: admin.id,
        username: admin.username
      };
      
      req.session.authenticated = true;
      
      // Return success
      return res.status(200).json({
        message: 'Login successful',
        admin: {
          id: admin.id,
          username: admin.username
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      return res.status(500).json({ message: 'Login failed' });
    }
  });
  
  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: 'Logout failed' });
      }
      res.clearCookie('connect.sid');
      return res.status(200).json({ message: 'Logged out successfully' });
    });
  });
  
  // Check auth status
  app.get('/api/auth/status', (req, res) => {
    if (req.session.authenticated && req.session.admin) {
      return res.status(200).json({
        authenticated: true,
        admin: req.session.admin
      });
    }
    
    return res.status(200).json({
      authenticated: false
    });
  });
  
  // =====================
  // INVOICE ROUTES
  // =====================
  
  // Create invoice
  app.post('/api/invoices', async (req, res) => {
    try {
      // Validate request body against the invoice schema
      const validatedData = invoiceSchema.parse(req.body);
      
      // Prepare invoice data for database
      const invoiceData = {
        fullName: validatedData.personalDetails.fullName,
        email: validatedData.personalDetails.email,
        address: validatedData.personalDetails.address,
        phoneNumber: validatedData.personalDetails.phoneNumber,
        companyDetails: validatedData.personalDetails.ltdCompany || null,
        bankName: validatedData.bankDetails.bankName,
        accountName: validatedData.bankDetails.accountName,
        accountNumber: validatedData.bankDetails.accountNumber,
        sortCode: validatedData.bankDetails.sortCode,
        hourlyRate: validatedData.hourlyRate,
        totalHours: validatedData.timesheetEntries.reduce((sum, entry) => sum + entry.hours, 0),
        totalAmount: validatedData.timesheetEntries.reduce((sum, entry) => sum + entry.amount, 0),
        additionalCosts: validatedData.additionalDetails?.additionalCost || 0,
        additionalCostDescription: validatedData.additionalDetails?.additionalCostDescription || null,
        paymentNotes: validatedData.additionalDetails?.paymentNotes || null,
        status: 'pending' as const
      };
      
      // Create invoice in database
      const invoice = await storage.createInvoice(invoiceData);
      
      // Create timesheet entries
      for (const entry of validatedData.timesheetEntries) {
        await storage.createTimesheetEntry({
          invoiceId: invoice.id,
          date: entry.date,
          patientInitials: entry.patientInitials,
          location: entry.location,
          startTime: entry.startTime,
          endTime: entry.endTime,
          hours: entry.hours,
          amount: entry.amount
        });
      }
      
      // Return success response
      res.status(201).json({ 
        message: "Invoice submitted successfully", 
        success: true,
        invoiceId: invoice.id
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Return validation errors
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      console.error('Error creating invoice:', error);
      
      // Return generic error
      return res.status(500).json({ 
        message: "Failed to submit invoice" 
      });
    }
  });
  
  // Get all invoices (admin only)
  app.get('/api/invoices', isAuthenticated, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const invoices = await storage.getAllInvoices(status);
      
      res.status(200).json({ invoices });
    } catch (error) {
      console.error('Error fetching invoices:', error);
      res.status(500).json({ message: 'Failed to fetch invoices' });
    }
  });
  
  // Get invoice statistics (admin only)
  app.get('/api/invoices/stats', isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getInvoiceStats();
      res.status(200).json(stats);
    } catch (error) {
      console.error('Error fetching invoice stats:', error);
      res.status(500).json({ message: 'Failed to fetch invoice statistics' });
    }
  });
  
  // Get single invoice details
  app.get('/api/invoices/:id', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      
      if (isNaN(invoiceId)) {
        return res.status(400).json({ message: 'Invalid invoice ID' });
      }
      
      const invoice = await storage.getInvoice(invoiceId);
      
      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }
      
      // Get timesheet entries for this invoice
      const entries = await storage.getTimesheetEntries(invoiceId);
      
      res.status(200).json({ 
        invoice,
        timesheetEntries: entries 
      });
    } catch (error) {
      console.error('Error fetching invoice:', error);
      res.status(500).json({ message: 'Failed to fetch invoice details' });
    }
  });
  
  // Update invoice status (approve/mark as paid)
  app.patch('/api/invoices/:id/status', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      
      if (isNaN(invoiceId)) {
        return res.status(400).json({ message: 'Invalid invoice ID' });
      }
      
      const { status } = req.body;
      
      if (!status || !['pending', 'approved', 'paid'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }
      
      // Get admin ID from session for tracking who approved
      const adminId = req.session.admin?.id;
      
      const updatedInvoice = await storage.updateInvoiceStatus(invoiceId, status as 'pending' | 'approved' | 'paid', adminId);
      
      if (!updatedInvoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }
      
      res.status(200).json({ 
        message: `Invoice status updated to ${status}`,
        invoice: updatedInvoice
      });
    } catch (error) {
      console.error('Error updating invoice status:', error);
      res.status(500).json({ message: 'Failed to update invoice status' });
    }
  });

  // Delete invoice (admin only)
  app.delete('/api/invoices/:id', isAuthenticated, async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      
      if (isNaN(invoiceId)) {
        return res.status(400).json({ message: 'Invalid invoice ID' });
      }
      
      // Check if invoice exists first
      const invoice = await storage.getInvoice(invoiceId);
      
      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }
      
      const success = await storage.deleteInvoice(invoiceId);
      
      if (!success) {
        return res.status(500).json({ message: 'Failed to delete invoice' });
      }
      
      res.status(200).json({ 
        message: 'Invoice deleted successfully',
        id: invoiceId
      });
    } catch (error) {
      console.error('Error deleting invoice:', error);
      res.status(500).json({ message: 'Failed to delete invoice' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
