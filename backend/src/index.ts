import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { Pool, PoolConfig, type PoolClient } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  applyTemplateVars,
  wrapEmailHtml,
  createMailTransport,
  formatFromHeader,
  sendSmtpMessage,
  type EmailSettingsPayload,
} from './emailHelpers';
import { encryptString, decryptString } from './cryptoHelper';
import {
  getGoogleAuthUrl,
  getMicrosoftAuthUrl,
  exchangeGoogleCode,
  exchangeMicrosoftCode,
  refreshGoogleToken,
  refreshMicrosoftToken,
  sendEmailViaGoogle,
  sendEmailViaMicrosoft
} from './oauthEmail';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import { mountJobClientPanelRoutes } from './jobClientPanelRoutes';
import { runAllScheduledReminders } from './reminders/runAllScheduledReminders';
import {
  SERVICE_REMINDER_INTERVAL_UNITS,
  SERVICE_REMINDER_EARLY_UNITS,
  SERVICE_REMINDER_RECIPIENT_MODES,
  normalizeCompletedServiceItemsForDb,
  utcDateOnlyFromDate,
  addCalendarInterval,
  resolveServiceReminderRecipientEmail,
} from './reminders/serviceReminderHelpers';
import { getCustomerServiceReminderSchedule } from './reminders/serviceReminderCustomerPreview';
import { mountJobFilesRoutes } from './jobFilesRoutes';
import { mountJobEmailRoutes } from './jobEmailRoutes';
import {
  getTenantScopeUserId,
  requirePermission,
  requireTenantCrmAccess,
  permissionsFromDb,
  assertStaffPermissionAny,
  parsePermissionsBody,
} from './tenantAccess';
import { mountTenantStaffRoutes } from './tenantStaffRoutes';
import { mountTenantTeamRoutes } from './tenantTeamRoutes';
import { presetFieldOfficerPermissions } from './tenantPermissions';
import {
  diaryActsAsFieldOfficer,
  fieldEffectivePerms,
  fieldMobileFeaturesEnabled,
  fieldMobileHasJobs,
  fieldMobileHasScheduling,
  fieldMobileSessionOk,
} from './mobileFieldAccess';
import { generateInvoicePdfBuffer } from './invoicePrintHtml';
import { generateQuotationPdfBuffer } from './quotationPdf';
import { normalizeTemplateSiteReportDocument, collectTemplateDocumentImageIds } from './siteReportTemplates/documentNormalize';
import type { TemplateSiteReportDocument } from './siteReportTemplates/types';
import { parseSiteReportTemplateDefinition } from './siteReportTemplates/validateDefinition';
import { ensureFireRiskAssessmentTemplate, fetchTemplateDefinition } from './siteReportTemplates/seedAndFetch';
import { getFraTemplateDefinition } from './siteReportTemplates/fraTemplateDefinition';
import { generateCustomerSiteReportPdfBuffer } from './siteReportPrintHtml';
import { PdfRenderUnavailableError } from './jobClientReportPdf';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/** Default 8 MB so base64 JSON stays under typical 12 MB body limits. */
const CUSTOMER_FILE_MAX_BYTES = (() => {
  const n = parseInt(process.env.CUSTOMER_FILE_MAX_BYTES || '8388608', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20 * 1024 * 1024) : 8388608;
})();

function getCustomerFilesRootDir(): string {
  const raw = process.env.CUSTOMER_FILES_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'customer-files');
}

const DIARY_EXTRA_MAX_FILES = 8;
const DIARY_EXTRA_FILE_MAX_BYTES = 6 * 1024 * 1024;

function getDiaryExtraSubmissionsRootDir(): string {
  const raw = process.env.DIARY_EXTRA_FILES_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'diary-extra-submissions');
}

async function ensureDiaryExtraSubmissionDir(diaryEventId: number, submissionId: number): Promise<string> {
  const dir = path.join(getDiaryExtraSubmissionsRootDir(), String(diaryEventId), String(submissionId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function getDiaryTechnicalNotesRootDir(): string {
  const raw = process.env.DIARY_TECHNICAL_NOTE_FILES_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'diary-technical-notes');
}

async function ensureDiaryTechnicalNoteDir(diaryEventId: number, noteId: number): Promise<string> {
  const dir = path.join(getDiaryTechnicalNotesRootDir(), String(diaryEventId), String(noteId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function ensureCustomerFilesDir(customerId: number): Promise<string> {
  const dir = path.join(getCustomerFilesRootDir(), String(customerId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function getCustomerSiteReportImagesRootDir(): string {
  const raw = process.env.CUSTOMER_SITE_REPORT_IMAGES_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'customer-site-report-images');
}

async function ensureCustomerSiteReportImageDir(customerId: number, reportId: number): Promise<string> {
  const dir = path.join(getCustomerSiteReportImagesRootDir(), String(customerId), String(reportId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function assertSiteReportTemplateImageIdsBelongToReport(
  client: Pool | PoolClient,
  reportId: number,
  doc: TemplateSiteReportDocument,
): Promise<boolean> {
  const arr = collectTemplateDocumentImageIds(doc);
  if (arr.length === 0) return true;
  const r = await client.query('SELECT id FROM customer_site_report_images WHERE report_id = $1 AND id = ANY($2::int[])', [
    reportId,
    arr,
  ]);
  return r.rowCount === arr.length;
}

const QUOTATION_INTERNAL_NOTE_MAX_FILES = DIARY_EXTRA_MAX_FILES;
const QUOTATION_INTERNAL_NOTE_FILE_MAX_BYTES = DIARY_EXTRA_FILE_MAX_BYTES;

function getQuotationInternalNotesRootDir(): string {
  const raw = process.env.QUOTATION_INTERNAL_NOTE_FILES_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'quotation-internal-notes');
}

async function ensureQuotationInternalNoteDir(quotationId: number, noteId: number): Promise<string> {
  const dir = path.join(getQuotationInternalNotesRootDir(), String(quotationId), String(noteId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function sanitizeStoredOriginalName(name: string): string {
  const base = path.basename(name.trim().replace(/[/\\]/g, '')) || 'upload';
  return base.length > 480 ? base.slice(0, 480) : base;
}

const JOB_PART_STATUSES = [
  'requested',
  'on_order',
  'available',
  'picked_up',
  'installed',
  'cancelled',
  'returned',
] as const;

function computeJobPartUnitSell(unitCost: number, markupPct: number): number {
  const c = Number.isFinite(unitCost) ? unitCost : 0;
  const m = Number.isFinite(markupPct) ? markupPct : 0;
  return Math.round(c * (1 + m / 100) * 100) / 100;
}

/**
 * Money amount for invoice payment lines (2 decimals, min 0.01 = one cent).
 * Accepts JSON number or string; tolerates "0,01" by normalizing decimal comma to dot.
 */
function parseInvoicePaymentAmountCents(raw: unknown): number | null {
  let n: number;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    n = raw;
  } else if (typeof raw === 'string') {
    const t = raw.trim().replace(',', '.');
    n = parseFloat(t);
  } else {
    return null;
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  if (cents < 1) return null;
  return cents;
}

/** Derive invoice workflow state from paid balance after a payment line add or edit. */
function computeInvoiceStateAfterPaymentBalance(opts: {
  totalPaidCents: number;
  totalAmountCents: number;
  previousState: string;
  dueDate: Date;
}): string {
  const { totalPaidCents, totalAmountCents, previousState, dueDate } = opts;
  if (totalAmountCents <= 0) {
    return previousState === 'cancelled' ? 'cancelled' : previousState;
  }
  if (totalPaidCents >= totalAmountCents) return 'paid';
  if (totalPaidCents > 0) return 'partially_paid';
  if (previousState === 'draft') return 'draft';
  if (previousState === 'issued') return 'issued';
  const dueOk = dueDate instanceof Date && !Number.isNaN(dueDate.getTime());
  const due = dueOk ? dueDate : new Date();
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const now = new Date();
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return nowDay > dueDay ? 'overdue' : 'pending_payment';
}

/** Validates work_address id belongs to customer; returns null if absent or invalid. */
async function resolveWorkAddressIdForCustomer(pool: Pool, customerId: number, raw: unknown): Promise<number | null> {
  if (raw === undefined || raw === null || raw === '') return null;
  const wid =
    typeof raw === 'number' && Number.isFinite(raw)
      ? Math.trunc(raw)
      : typeof raw === 'string' && String(raw).trim()
        ? parseInt(String(raw).trim(), 10)
        : NaN;
  if (!Number.isFinite(wid)) return null;
  const r = await pool.query('SELECT 1 FROM customer_work_addresses WHERE id = $1 AND customer_id = $2', [wid, customerId]);
  return (r.rowCount ?? 0) > 0 ? wid : null;
}

/** Ensures contact belongs to customer and is allowed for the job work site (site-specific contacts must match). */
async function validateJobContactForCustomer(
  pool: Pool,
  customerId: number,
  jobWorkAddressId: number | null,
  contactId: number,
): Promise<{ valid: true; display_name: string } | { valid: false }> {
  const r = await pool.query<{
    title: string | null;
    first_name: string | null;
    surname: string;
    work_address_id: number | null;
  }>(
    `SELECT title, first_name, surname, work_address_id FROM customer_contacts
     WHERE customer_id = $1 AND id = $2`,
    [customerId, contactId],
  );
  if ((r.rowCount ?? 0) === 0) return { valid: false };
  const row = r.rows[0];
  const cWa = row.work_address_id;
  if (cWa != null && (jobWorkAddressId == null || cWa !== jobWorkAddressId)) {
    return { valid: false };
  }
  const parts = [row.title, row.first_name, row.surname].filter((x) => x != null && String(x).trim() !== '');
  const display_name = parts.join(' ').trim() || row.surname;
  return { valid: true, display_name };
}

async function sendUserEmail(pool: Pool, userId: number, emailCfg: any, opts: any) {
  if (emailCfg.oauth_provider && emailCfg.oauth_access_token) {
    let accessToken = decryptString(emailCfg.oauth_access_token);
    let refreshToken = emailCfg.oauth_refresh_token ? decryptString(emailCfg.oauth_refresh_token) : null;
    let expiry = emailCfg.oauth_expiry || 0;

    // Refresh token if expired or close to expiry (within 5 minutes)
    if (Date.now() > expiry - 300000 && refreshToken) {
      const refreshed = emailCfg.oauth_provider === 'google'
        ? await refreshGoogleToken(refreshToken)
        : await refreshMicrosoftToken(refreshToken);

      accessToken = refreshed.access_token;
      expiry = refreshed.expiry;
      if ('refresh_token' in refreshed && refreshed.refresh_token) {
        refreshToken = refreshed.refresh_token as string;
      }

      await pool.query(
        'UPDATE email_settings SET oauth_access_token = $1, oauth_refresh_token = $2, oauth_expiry = $3 WHERE created_by = $4',
        [encryptString(accessToken), refreshToken ? encryptString(refreshToken) : null, expiry, userId]
      );
    }

    if (emailCfg.oauth_provider === 'google') {
      await sendEmailViaGoogle(accessToken, opts);
    } else {
      await sendEmailViaMicrosoft(accessToken, opts);
    }
    return;
  }

  // Fallback to SMTP/Mailgun configuration
  const transport = createMailTransport(emailCfg);
  if (!transport) throw new Error('No valid email configuration found (SMTP/Mailgun or OAuth).');
  await sendSmtpMessage(transport, opts);
}


const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const port = parseInt(process.env.PORT || '4000', 10);

const corsOrigins = process.env.CORS_ORIGIN?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (corsOrigins && corsOrigins.length > 0) {
  app.use(
    cors({
      origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
      credentials: true,
    }),
  );
} else {
  app.use(cors());
}
// Settings UI can upload base64 data URLs (logos). Increase request size limit to avoid 413 Payload Too Large.
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '12mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.REQUEST_BODY_LIMIT || '12mb' }));

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    const useSsl =
      process.env.DB_SSL === 'true' ||
      (isProduction && process.env.DB_SSL !== 'false');
    const poolConfig: PoolConfig = {
      connectionString: databaseUrl,
      ssl: useSsl
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined,
    };
    return new Pool(poolConfig);
  }
  return new Pool({
    user: process.env.DB_USER || 'workpilot_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'workpilot',
    password: process.env.DB_PASSWORD || 'workpilot_password',
    port: parseInt(process.env.DB_PORT || '5433', 10),
  });
}

const pool = createPool();

// Database initialization / migrations
pool.query('ALTER TABLE quotations ADD COLUMN IF NOT EXISTS description TEXT')
  .then(() => console.log('Checked quotations description column'))
  .catch(err => console.error('Migration error (quotations):', err));
pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description TEXT')
  .then(() => console.log('Checked invoices description column'))
  .catch(err => console.error('Migration error (invoices):', err));
pool.query(`
  CREATE TABLE IF NOT EXISTS customer_specific_notes (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`)
  .then(() => console.log('Checked customer_specific_notes table'))
  .catch(err => console.error('Migration error (customer_specific_notes):', err));
pool.query(`ALTER TABLE customer_specific_notes ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb`)
  .then(() => console.log('Checked customer_specific_notes media column'))
  .catch(err => console.error('Migration error (customer_specific_notes media):', err));
pool.query(`ALTER TABLE customer_specific_notes ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`)
  .then(() => console.log('Checked customer_specific_notes created_by column'))
  .catch(err => console.error('Migration error (customer_specific_notes created_by):', err));

type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'OFFICER';
type ClientStatus = 'ACTIVE' | 'PENDING_SETUP' | 'SUSPENDED';

interface DbServicePlan {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: Date;
}

interface DbCustomer {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  status: string;
  last_contact: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  w3w: string | null;
  water_supply: string | null;
  power_supply: string | null;
  technical_notes: string | null;
}

interface DbCustomerNote {
  id: number;
  customer_id: number;
  title: string;
  description: string;
  sort_order: number;
  created_at: Date;
}

interface DbJob {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  responsible_person: string | null;
  officer_id: number | null;
  start_date: Date | null;
  deadline: Date | null;
  customer_id: number | null;
  work_address_id?: number | null;
  location: string | null;
  required_certifications: string | null;
  attachments: unknown;
  state: string;
  schedule_start?: Date | null;
  duration_minutes?: number | null;
  scheduling_notes?: string | null;
  dispatched_at?: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  // new fields
  job_description_id?: number | null;
  skills?: string | null;
  job_notes?: string | null;
  business_unit?: string | null;
  user_group?: string | null;
  is_service_job?: boolean;
  quoted_amount?: number | null;
  customer_reference?: string | null;
  job_pipeline?: string | null;
  book_into_diary?: boolean;
  contact_name?: string | null;
  job_contact_id?: number | null;
  expected_completion?: Date | null;
  completed_service_items?: string[] | null;
}

interface DbOfficer {
  id: number;
  full_name: string;
  role_position: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  system_access_level: string | null;
  certifications: string | null;
  assigned_responsibilities: string | null;
  state: string;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
}

interface DbInvoice {
  id: number;
  invoice_number: string;
  customer_id: number;
  job_id: number | null;
  invoice_date: Date;
  due_date: Date;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  total_paid: string;
  currency: string;
  notes: string | null;
  description: string | null;
  billing_address: string | null;
  invoice_work_address_id?: number | null;
  customer_reference?: string | null;
  state: string;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  public_token: string | null;
}

interface DbQuotation {
  id: number;
  quotation_number: string;
  customer_id: number;
  job_id: number | null;
  quotation_date: Date;
  valid_until: Date;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  currency: string;
  notes: string | null;
  description: string | null;
  billing_address: string | null;
  quotation_work_address_id?: number | null;
  state: string;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  public_token: string | null;
}

interface DbUser {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  created_by: number | null;
  full_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  service_plan?: string | null;
  status?: string | null;
  address?: string | null;
  notes?: string | null;
  tenant_admin_id?: number | null;
  permissions?: unknown | null;
}

interface JwtPayload {
  userId: number;
  email: string;
  role: UserRole;
  /** Present when role is OFFICER (same as userId for officers), or STAFF/ADMIN linked to an officer row for mobile field features. */
  officerId?: number;
  /** CRM rows `created_by` / tenant scope (owner id for STAFF). */
  tenantScopeUserId?: number;
  /** DB `tenant_admin_id` for STAFF; null/omitted for owner ADMIN. */
  tenantAdminId?: number | null;
  /** STAFF / OFFICER permission flags; null/omitted for full-access ADMIN. */
  permissions?: Record<string, boolean> | null;
}

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

const jwtSecretEnv = process.env.JWT_SECRET?.trim();
if (isProduction && (!jwtSecretEnv || jwtSecretEnv.length < 32)) {
  console.error('FATAL: In production, JWT_SECRET must be set and at least 32 characters long.');
  process.exit(1);
}
const JWT_SECRET = jwtSecretEnv || 'dev-only-workpilot-jwt-secret-do-not-use-in-prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS service_plan VARCHAR(100) DEFAULT 'Standard';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_tenant_admin_id ON users(tenant_admin_id)`);
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await pool.query(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'STAFF'))
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_plans (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_books (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_book_items (
      id SERIAL PRIMARY KEY,
      price_book_id INTEGER REFERENCES price_books(id) ON DELETE CASCADE,
      item_name VARCHAR(255) NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_book_labour_rates (
      id SERIAL PRIMARY KEY,
      price_book_id INTEGER REFERENCES price_books(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      basic_rate_per_hr DECIMAL(10,2) NOT NULL DEFAULT 0,
      nominal_code VARCHAR(100),
      rounding_rule VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_units (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_units (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Job Description Templates (auto-fill system for new jobs)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_descriptions (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      default_skills TEXT,
      default_job_notes TEXT,
      default_priority VARCHAR(20) DEFAULT 'medium',
      default_business_unit VARCHAR(100),
      is_service_job BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Default pricing items attached to job description templates
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_description_pricing_items (
      id SERIAL PRIMARY KEY,
      job_description_id INTEGER NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      item_name VARCHAR(255) NOT NULL,
      time_included INT DEFAULT 0,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      vat_rate DECIMAL(5,2) NOT NULL DEFAULT 20.00,
      quantity INT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      company_name_required BOOLEAN DEFAULT false,
      allow_branches BOOLEAN DEFAULT false,
      work_address_name VARCHAR(100) NOT NULL DEFAULT 'Work Address',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      company VARCHAR(255),
      address TEXT,
      city VARCHAR(100),
      region VARCHAR(100),
      country VARCHAR(100),
      status VARCHAR(20) NOT NULL DEFAULT 'LEAD' CHECK (status IN ('ACTIVE', 'LEAD', 'INACTIVE')),
      last_contact TIMESTAMP WITH TIME ZONE,
      notes TEXT,
      customer_type_id INTEGER REFERENCES customer_types(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type_id INTEGER REFERENCES customer_types(id) ON DELETE SET NULL;`);

  // New Customer Details Fields
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line_3 VARCHAR(255);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS town VARCHAR(100);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS county VARCHAR(100);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS postcode VARCHAR(50);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS landline VARCHAR(50);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_days VARCHAR(50);`);

  // New Contact Details Fields
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_title VARCHAR(20);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_first_name VARCHAR(100);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_surname VARCHAR(100);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_position VARCHAR(100);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_mobile VARCHAR(50);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_landline VARCHAR(50);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);`);

  // Preferences & Meta
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS prefers_phone BOOLEAN DEFAULT false;`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS prefers_sms BOOLEAN DEFAULT false;`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS prefers_email BOOLEAN DEFAULT false;`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS prefers_letter BOOLEAN DEFAULT false;`);
  await pool.query(
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_reminders_enabled BOOLEAN NOT NULL DEFAULT true`,
  );
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_source VARCHAR(255);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_book_id INTEGER REFERENCES price_books(id) ON DELETE SET NULL;`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS w3w VARCHAR(255);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS water_supply TEXT;`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS power_supply TEXT;`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS technical_notes TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_contacts (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      title VARCHAR(20),
      first_name VARCHAR(100),
      surname VARCHAR(100) NOT NULL,
      position VARCHAR(100),
      email VARCHAR(255),
      mobile VARCHAR(50),
      landline VARCHAR(50),
      office_code VARCHAR(10),
      date_of_birth DATE,
      twitter_handle VARCHAR(255),
      facebook_url VARCHAR(500),
      linkedin_url VARCHAR(500),
      is_primary BOOLEAN NOT NULL DEFAULT false,
      prefers_phone BOOLEAN NOT NULL DEFAULT false,
      prefers_sms BOOLEAN NOT NULL DEFAULT false,
      prefers_email BOOLEAN NOT NULL DEFAULT false,
      prefers_letter BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON customer_contacts(customer_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_branches (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      branch_name VARCHAR(255) NOT NULL,
      address_line_1 VARCHAR(255) NOT NULL,
      address_line_2 VARCHAR(255),
      address_line_3 VARCHAR(255),
      town VARCHAR(100),
      county VARCHAR(100),
      postcode VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_branches_customer_id ON customer_branches(customer_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_work_addresses (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      branch_name VARCHAR(255),
      landlord VARCHAR(255),
      title VARCHAR(20),
      first_name VARCHAR(100),
      surname VARCHAR(100),
      company_name VARCHAR(255),
      address_line_1 VARCHAR(255) NOT NULL,
      address_line_2 VARCHAR(255),
      address_line_3 VARCHAR(255),
      town VARCHAR(100),
      county VARCHAR(100),
      postcode VARCHAR(50),
      landline VARCHAR(50),
      mobile VARCHAR(50),
      email VARCHAR(255),
      prefers_phone BOOLEAN NOT NULL DEFAULT false,
      prefers_sms BOOLEAN NOT NULL DEFAULT false,
      prefers_email BOOLEAN NOT NULL DEFAULT false,
      prefers_letter BOOLEAN NOT NULL DEFAULT true,
      uprn VARCHAR(100),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_work_addresses_customer_id ON customer_work_addresses(customer_id)`);
  await pool.query(
    `ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE SET NULL`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_contacts_work_address_id ON customer_contacts(work_address_id) WHERE work_address_id IS NOT NULL`);
  await pool.query(
    `ALTER TABLE customer_specific_notes ADD COLUMN IF NOT EXISTS work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE SET NULL`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_specific_notes_work_address_id ON customer_specific_notes(work_address_id) WHERE work_address_id IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_assets (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      asset_group VARCHAR(100) NOT NULL,
      asset_type VARCHAR(100),
      description TEXT NOT NULL,
      make VARCHAR(100),
      model VARCHAR(100),
      serial_number VARCHAR(100),
      photo_url TEXT,
      barcode VARCHAR(100),
      installed_by_us BOOLEAN NOT NULL DEFAULT false,
      under_warranty BOOLEAN NOT NULL DEFAULT false,
      is_functioning VARCHAR(20),
      location VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_assets_customer_id ON customer_assets(customer_id)`);
  await pool.query(
    `ALTER TABLE customer_assets ADD COLUMN IF NOT EXISTS work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE SET NULL`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_assets_work_address_id ON customer_assets(work_address_id) WHERE work_address_id IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_files (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE SET NULL,
      original_filename VARCHAR(500) NOT NULL,
      stored_filename VARCHAR(255) NOT NULL,
      content_type VARCHAR(255),
      byte_size BIGINT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_files_customer_id ON customer_files(customer_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_files_work_address_id ON customer_files(work_address_id) WHERE work_address_id IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_site_reports (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE CASCADE,
      report_title VARCHAR(500),
      document JSONB NOT NULL DEFAULT '{"sections":[]}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_site_reports_customer_id ON customer_site_reports(customer_id)`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_site_reports_scope ON customer_site_reports (customer_id, COALESCE(work_address_id, -1))`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_site_report_images (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES customer_site_reports(id) ON DELETE CASCADE,
      stored_filename VARCHAR(255) NOT NULL,
      original_filename VARCHAR(500) NOT NULL,
      content_type VARCHAR(255),
      byte_size BIGINT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_site_report_images_report_id ON customer_site_report_images(report_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_report_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100),
      definition JSONB NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_site_report_templates_created_by ON site_report_templates(created_by)`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_site_report_templates_owner_slug ON site_report_templates (created_by, slug) WHERE slug IS NOT NULL`,
  );

  await pool.query(`ALTER TABLE customer_site_reports ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES site_report_templates(id) ON DELETE SET NULL`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_customer_site_reports_template_id ON customer_site_reports(template_id) WHERE template_id IS NOT NULL`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_communications (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('note', 'email', 'sms', 'phone', 'schedule')),
      subject VARCHAR(255),
      message TEXT,
      status VARCHAR(30),
      to_value VARCHAR(255),
      cc_value VARCHAR(255),
      bcc_value VARCHAR(255),
      from_value VARCHAR(255),
      object_type VARCHAR(30) NOT NULL DEFAULT 'customer',
      object_id INTEGER,
      attachment_name VARCHAR(255),
      scheduled_for TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`ALTER TABLE customer_communications ADD COLUMN IF NOT EXISTS cc_value VARCHAR(255)`);
  await pool.query(`ALTER TABLE customer_communications ADD COLUMN IF NOT EXISTS bcc_value VARCHAR(255)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_communications_customer_id ON customer_communications(customer_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_communications_created_at ON customer_communications(created_at DESC)`);
  await pool.query(
    `ALTER TABLE customer_communications ADD COLUMN IF NOT EXISTS work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE SET NULL`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_communications_work_address_id ON customer_communications(work_address_id) WHERE work_address_id IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS officers (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      role_position VARCHAR(255),
      department VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      system_access_level VARCHAR(50),
      certifications TEXT,
      assigned_responsibilities TEXT,
      state VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'inactive', 'on_leave', 'suspended', 'archived')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);`);
  await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(128);`);
  await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS permissions JSONB`);
  await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS linked_user_id INTEGER`);
  await pool.query(`ALTER TABLE officers DROP CONSTRAINT IF EXISTS officers_linked_user_id_fkey`);
  await pool.query(
    `ALTER TABLE officers ADD CONSTRAINT officers_linked_user_id_fkey FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE CASCADE`,
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_officers_linked_user_unique ON officers(linked_user_id) WHERE linked_user_id IS NOT NULL`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      responsible_person VARCHAR(255),
      officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
      start_date TIMESTAMP WITH TIME ZONE,
      deadline TIMESTAMP WITH TIME ZONE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      location TEXT,
      required_certifications TEXT,
      attachments JSONB DEFAULT '[]',
      state VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'created', 'scheduled', 'assigned', 'in_progress', 'paused', 'completed', 'closed')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS schedule_start TIMESTAMP WITH TIME ZONE`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS duration_minutes INT`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduling_notes TEXT`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP WITH TIME ZONE`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS office_tasks (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      assignee_officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      completed BOOLEAN NOT NULL DEFAULT false,
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_office_tasks_job_id ON office_tasks(job_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_office_tasks_completed ON office_tasks(completed)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_office_tasks_assignee ON office_tasks(assignee_officer_id)`);
  await pool.query(
    `ALTER TABLE office_tasks ADD COLUMN IF NOT EXISTS completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL`,
  );
  await pool.query(
    `ALTER TABLE office_tasks ADD COLUMN IF NOT EXISTS completion_source VARCHAR(20)`,
  );
  await pool.query(`ALTER TABLE office_tasks ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE office_tasks ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_checklist_items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(created_by, name)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_checklist_items_created_by ON service_checklist_items(created_by)`);
  await pool.query(`ALTER TABLE service_checklist_items ADD COLUMN IF NOT EXISTS reminder_interval_n INTEGER`);
  await pool.query(`ALTER TABLE service_checklist_items ADD COLUMN IF NOT EXISTS reminder_interval_unit VARCHAR(20)`);
  await pool.query(`ALTER TABLE service_checklist_items ADD COLUMN IF NOT EXISTS reminder_early_n INTEGER`);
  await pool.query(`ALTER TABLE service_checklist_items ADD COLUMN IF NOT EXISTS reminder_early_unit VARCHAR(20)`);
  await pool.query(
    `ALTER TABLE service_checklist_items ADD COLUMN IF NOT EXISTS customer_reminder_weeks_before INTEGER`,
  );
  await pool.query(
    `ALTER TABLE service_checklist_items ADD COLUMN IF NOT EXISTS customer_email_subject TEXT`,
  );
  await pool.query(
    `ALTER TABLE service_checklist_items ADD COLUMN IF NOT EXISTS customer_email_body_html TEXT`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_reminder_settings (
      created_by INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      automated_enabled BOOLEAN NOT NULL DEFAULT true,
      recipient_mode VARCHAR(32) NOT NULL DEFAULT 'customer_account'
        CHECK (recipient_mode IN ('customer_account', 'job_contact', 'primary_contact')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_reminder_sent (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      service_name TEXT NOT NULL,
      phase VARCHAR(8) NOT NULL CHECK (phase IN ('early', 'due')),
      renewal_due_date DATE NOT NULL,
      tenant_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (job_id, service_name, phase, renewal_due_date)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_service_reminder_sent_tenant ON service_reminder_sent(tenant_user_id)`,
  );
  await pool.query(
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS service_reminders_enabled BOOLEAN NOT NULL DEFAULT true`,
  );
  await pool.query(
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS service_reminder_custom_email VARCHAR(320)`,
  );
  await pool.query(
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS service_reminder_recipient_mode VARCHAR(32)`,
  );

  // Enhanced job fields
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_description_id INTEGER REFERENCES job_descriptions(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills TEXT`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_notes TEXT`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS business_unit VARCHAR(100)`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS user_group VARCHAR(100)`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_service_job BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS quoted_amount DECIMAL(14,2)`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_reference VARCHAR(255)`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_pipeline VARCHAR(100)`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS book_into_diary BOOLEAN DEFAULT true`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255)`);
  await pool.query(
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_contact_id INTEGER REFERENCES customer_contacts(id) ON DELETE SET NULL`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_jobs_job_contact_id ON jobs(job_contact_id) WHERE job_contact_id IS NOT NULL`,
  );
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expected_completion TIMESTAMP WITH TIME ZONE`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_service_items JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE SET NULL`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_jobs_work_address_id ON jobs(work_address_id) WHERE work_address_id IS NOT NULL`);

  // Per-job pricing items (instantiated from template or manually added)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_pricing_items (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      item_name VARCHAR(255) NOT NULL,
      time_included INT DEFAULT 0,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      vat_rate DECIMAL(5,2) NOT NULL DEFAULT 20.00,
      quantity INT NOT NULL DEFAULT 1,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS part_catalog (
      id SERIAL PRIMARY KEY,
      name VARCHAR(500) NOT NULL,
      mpn VARCHAR(255),
      default_unit_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
      default_markup_pct DECIMAL(7,2) NOT NULL DEFAULT 0,
      default_vat_rate DECIMAL(5,2) NOT NULL DEFAULT 20,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_part_catalog_created_by ON part_catalog(created_by)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS part_kits (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_part_kits_created_by ON part_kits(created_by)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS part_kit_items (
      id SERIAL PRIMARY KEY,
      kit_id INTEGER NOT NULL REFERENCES part_kits(id) ON DELETE CASCADE,
      part_name VARCHAR(500) NOT NULL,
      mpn VARCHAR(255),
      quantity DECIMAL(14,4) NOT NULL DEFAULT 1,
      unit_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
      markup_pct DECIMAL(7,2) NOT NULL DEFAULT 0,
      vat_rate DECIMAL(5,2) NOT NULL DEFAULT 20,
      sort_order INT NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_part_kit_items_kit_id ON part_kit_items(kit_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_parts (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      part_catalog_id INTEGER REFERENCES part_catalog(id) ON DELETE SET NULL,
      part_name VARCHAR(500) NOT NULL,
      mpn VARCHAR(255),
      quantity DECIMAL(14,4) NOT NULL DEFAULT 1,
      fulfillment_type VARCHAR(100),
      status VARCHAR(30) NOT NULL DEFAULT 'requested',
      unit_cost_price DECIMAL(14,2) NOT NULL DEFAULT 0,
      markup_pct DECIMAL(7,2) NOT NULL DEFAULT 0,
      vat_rate DECIMAL(5,2) NOT NULL DEFAULT 20,
      unit_sell_price DECIMAL(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_parts_job_id ON job_parts(job_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_parts_status ON job_parts(job_id, status)`);

  await pool.query(`ALTER TABLE job_parts DROP CONSTRAINT IF EXISTS job_parts_status_check`);
  try {
    await pool.query(`
      ALTER TABLE job_parts ADD CONSTRAINT job_parts_status_check CHECK (status IN (
        'requested', 'on_order', 'available', 'picked_up', 'installed', 'cancelled', 'returned'
      ))
    `);
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
    if (code !== '42710') throw e;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS diary_events (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
      start_time TIMESTAMP WITH TIME ZONE NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      status VARCHAR(50) DEFAULT 'No status',
      notes TEXT,
      created_by_name VARCHAR(255) DEFAULT 'System User',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  await pool.query(
    `ALTER TABLE diary_events ADD COLUMN IF NOT EXISTS customer_confirmation_sent_at TIMESTAMPTZ`,
  );
  await pool.query(
    `ALTER TABLE diary_events ADD COLUMN IF NOT EXISTS address_reminder_sent_at TIMESTAMPTZ`,
  );
  await pool.query(
    `ALTER TABLE diary_events ADD COLUMN IF NOT EXISTS engineer_job_sheet_sent_at TIMESTAMPTZ`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_report_questions (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      sort_order INT NOT NULL DEFAULT 0,
      question_type VARCHAR(40) NOT NULL,
      prompt TEXT NOT NULL,
      helper_text TEXT,
      required BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_job_report_questions_job ON job_report_questions(job_id)`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_report_default_questions (
      id SERIAL PRIMARY KEY,
      sort_order INT NOT NULL DEFAULT 0,
      question_type VARCHAR(40) NOT NULL,
      prompt TEXT NOT NULL,
      helper_text TEXT,
      required BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_report_job_description_questions (
      id SERIAL PRIMARY KEY,
      job_description_id INTEGER NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      sort_order INT NOT NULL DEFAULT 0,
      question_type VARCHAR(40) NOT NULL,
      prompt TEXT NOT NULL,
      helper_text TEXT,
      required BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_job_report_jd_questions_desc ON job_report_job_description_questions(job_description_id)`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_report_answers (
      id SERIAL PRIMARY KEY,
      diary_event_id INTEGER NOT NULL REFERENCES diary_events(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES job_report_questions(id) ON DELETE CASCADE,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(diary_event_id, question_id)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_job_report_answers_diary ON job_report_answers(diary_event_id)`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS diary_event_extra_submissions (
      id SERIAL PRIMARY KEY,
      diary_event_id INTEGER NOT NULL REFERENCES diary_events(id) ON DELETE CASCADE,
      notes TEXT,
      media JSONB NOT NULL DEFAULT '[]',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_diary_event_extra_diary ON diary_event_extra_submissions(diary_event_id)`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS diary_event_technical_notes (
      id SERIAL PRIMARY KEY,
      diary_event_id INTEGER NOT NULL REFERENCES diary_events(id) ON DELETE CASCADE,
      notes TEXT,
      media JSONB NOT NULL DEFAULT '[]',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_diary_event_technical_notes_diary ON diary_event_technical_notes(diary_event_id)`,
  );
  await pool.query(`ALTER TABLE diary_events ADD COLUMN IF NOT EXISTS abort_reason TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS diary_abort_reasons (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_abort_reasons_label_norm ON diary_abort_reasons ((lower(trim(label))))`,
  );
  try {
    await pool.query(
      `INSERT INTO diary_abort_reasons (label, sort_order)
       SELECT v.label, v.ord
       FROM (VALUES
         ('Customer not available', 0),
         ('Site access or keys issue', 1),
         ('Weather or safety', 2),
         ('Equipment or parts issue', 3),
         ('Rescheduled to another date', 4),
         ('Customer cancelled', 5),
         ('Other', 6)
       ) AS v(label, ord)
       WHERE NOT EXISTS (SELECT 1 FROM diary_abort_reasons LIMIT 1)`,
    );
  } catch {
    /* ignore */
  }
  await pool.query(`ALTER TABLE job_report_answers ADD COLUMN IF NOT EXISTS prompt_snapshot TEXT`);
  await pool.query(
    `ALTER TABLE job_report_answers ADD COLUMN IF NOT EXISTS question_type_snapshot VARCHAR(40)`,
  );
  await pool.query(`ALTER TABLE job_report_answers ADD COLUMN IF NOT EXISTS helper_text_snapshot TEXT`);
  await pool.query(`ALTER TABLE job_report_answers DROP CONSTRAINT IF EXISTS job_report_answers_question_id_fkey`);
  try {
    await pool.query(`
      UPDATE job_report_answers jra
      SET prompt_snapshot = q.prompt,
          question_type_snapshot = q.question_type,
          helper_text_snapshot = q.helper_text
      FROM job_report_questions q
      WHERE q.id = jra.question_id
        AND (jra.prompt_snapshot IS NULL OR jra.question_type_snapshot IS NULL)
    `);
  } catch {
    /* ignore if tables empty */
  }

  try {
    await pool.query(`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_state_check`);
    await pool.query(`ALTER TABLE jobs ADD CONSTRAINT jobs_state_check CHECK (state IN ('draft', 'created', 'scheduled', 'assigned', 'in_progress', 'paused', 'completed', 'closed', 'unscheduled', 'rescheduled', 'dispatched'))`);
  } catch { /* constraint may already allow these */ }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      invoice_number VARCHAR(50) UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      invoice_date DATE NOT NULL,
      due_date DATE NOT NULL,
      subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      total_paid DECIMAL(14,2) NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      notes TEXT,
      billing_address TEXT,
      state VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'issued', 'pending_payment', 'partially_paid', 'paid', 'overdue', 'cancelled')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      public_token VARCHAR(100) UNIQUE,
      description TEXT
    );
  `);

  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description TEXT;`);
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_token VARCHAR(100) UNIQUE;`);

  // Backfill public_token for existing invoices
  const existingInvoices = await pool.query('SELECT id FROM invoices WHERE public_token IS NULL');
  for (const inv of existingInvoices.rows) {
    await pool.query('UPDATE invoices SET public_token = $1 WHERE id = $2', [crypto.randomBytes(32).toString('hex'), inv.id]);
  }

  // Same for quotations
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS public_token VARCHAR(100) UNIQUE;`);
  const existingQuotations = await pool.query('SELECT id FROM quotations WHERE public_token IS NULL');
  for (const q of existingQuotations.rows) {
    await pool.query('UPDATE quotations SET public_token = $1 WHERE id = $2', [crypto.randomBytes(32).toString('hex'), q.id]);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description VARCHAR(500) NOT NULL,
      quantity DECIMAL(14,2) NOT NULL DEFAULT 1,
      unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
      amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0
    );
  `);

  await pool.query(
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE SET NULL`,
  );
  await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_reference VARCHAR(255)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_payments (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      amount DECIMAL(14,2) NOT NULL,
      payment_method VARCHAR(50),
      payment_date DATE NOT NULL,
      reference_number VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_activities (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL,
      details JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_settings (
      id SERIAL PRIMARY KEY,
      created_by INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      default_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
      terms_and_conditions TEXT,
      default_due_days INT NOT NULL DEFAULT 30,
      company_name VARCHAR(255) DEFAULT 'WorkPilot',
      company_address TEXT,
      company_phone VARCHAR(50),
      company_email VARCHAR(255),
      tax_label VARCHAR(50) DEFAULT 'Tax',
      default_tax_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
      footer_text TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  try {
    await pool.query(`ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS default_tax_percentage DECIMAL(5,2) NOT NULL DEFAULT 0`);
  } catch { /* column may already exist from CREATE */ }
  try {
    await pool.query(`ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS company_logo TEXT`);
    await pool.query(`ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS company_website VARCHAR(255)`);
    await pool.query(`ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS company_tax_id VARCHAR(100)`);
    await pool.query(`ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS invoice_accent_color VARCHAR(16) NOT NULL DEFAULT '#14B8A6'`);
    await pool.query(`ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS invoice_accent_end_color VARCHAR(16) NOT NULL DEFAULT '#0d9488'`);
    await pool.query(`ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS payment_terms TEXT`);
    await pool.query(`ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS bank_details TEXT`);
  } catch { /* columns may already exist */ }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotations (
      id SERIAL PRIMARY KEY,
      quotation_number VARCHAR(50) UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      quotation_date DATE NOT NULL,
      valid_until DATE NOT NULL,
      subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      notes TEXT,
      billing_address TEXT,
      state VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      public_token VARCHAR(100) UNIQUE,
      description TEXT
    );
  `);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS description TEXT;`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS public_token VARCHAR(100) UNIQUE;`);
  await pool.query(
    `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE SET NULL`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotation_line_items (
      id SERIAL PRIMARY KEY,
      quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      description VARCHAR(500) NOT NULL,
      quantity DECIMAL(14,2) NOT NULL DEFAULT 1,
      unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
      amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotation_activities (
      id SERIAL PRIMARY KEY,
      quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL,
      details JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotation_internal_notes (
      id SERIAL PRIMARY KEY,
      quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_quotation_internal_notes_quotation_id ON quotation_internal_notes(quotation_id)`,
  );
  await pool.query(`ALTER TABLE quotation_internal_notes ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_client_report_default_questions (
      id SERIAL PRIMARY KEY,
      sort_order INT NOT NULL DEFAULT 0,
      question_type VARCHAR(40) NOT NULL,
      prompt TEXT NOT NULL,
      helper_text TEXT,
      required BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_client_report_questions (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      sort_order INT NOT NULL DEFAULT 0,
      question_type VARCHAR(40) NOT NULL,
      prompt TEXT NOT NULL,
      helper_text TEXT,
      required BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_job_client_report_questions_job ON job_client_report_questions(job_id)`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_client_template_settings (
      created_by INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      email_subject_template TEXT NOT NULL,
      email_body_html TEXT NOT NULL,
      print_document_html TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_client_submissions (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      submitter_name VARCHAR(200),
      submitter_email VARCHAR(255),
      notes TEXT,
      answers JSONB NOT NULL DEFAULT '[]',
      media JSONB NOT NULL DEFAULT '[]',
      include_flags JSONB NOT NULL DEFAULT '{}',
      pdf_public_token VARCHAR(100) UNIQUE NOT NULL,
      rendered_html TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_job_client_submissions_job ON job_client_submissions(job_id)`,
  );
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_portal_token VARCHAR(100) UNIQUE`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_panel_section_config JSONB DEFAULT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotation_settings (
      id SERIAL PRIMARY KEY,
      created_by INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      default_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      quotation_prefix VARCHAR(20) NOT NULL DEFAULT 'QUOT',
      terms_and_conditions TEXT,
      default_valid_days INT NOT NULL DEFAULT 30,
      company_name VARCHAR(255) DEFAULT 'WorkPilot',
      company_address TEXT,
      company_phone VARCHAR(50),
      company_email VARCHAR(255),
      tax_label VARCHAR(50) DEFAULT 'Tax',
      default_tax_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
      footer_text TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  try {
    await pool.query(`ALTER TABLE quotation_settings ADD COLUMN IF NOT EXISTS company_logo TEXT`);
    await pool.query(`ALTER TABLE quotation_settings ADD COLUMN IF NOT EXISTS company_website VARCHAR(255)`);
    await pool.query(`ALTER TABLE quotation_settings ADD COLUMN IF NOT EXISTS company_tax_id VARCHAR(100)`);
    await pool.query(`ALTER TABLE quotation_settings ADD COLUMN IF NOT EXISTS payment_terms TEXT`);
    await pool.query(`ALTER TABLE quotation_settings ADD COLUMN IF NOT EXISTS bank_details TEXT`);
    await pool.query(`ALTER TABLE quotation_settings ADD COLUMN IF NOT EXISTS quotation_accent_color VARCHAR(32)`);
    await pool.query(`ALTER TABLE quotation_settings ADD COLUMN IF NOT EXISTS quotation_accent_end_color VARCHAR(32)`);
  } catch { /* columns may already exist */ }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_settings (
      id SERIAL PRIMARY KEY,
      created_by INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      smtp_enabled BOOLEAN NOT NULL DEFAULT false,
      smtp_host VARCHAR(255),
      smtp_port INTEGER,
      smtp_secure BOOLEAN NOT NULL DEFAULT true,
      smtp_user VARCHAR(255),
      smtp_password TEXT,
      smtp_reject_unauthorized BOOLEAN NOT NULL DEFAULT true,
      from_name VARCHAR(255),
      from_email VARCHAR(255),
      reply_to VARCHAR(255),
      default_signature_html TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  try {
    await pool.query(`ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50)`);
    await pool.query(`ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS oauth_access_token TEXT`);
    await pool.query(`ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT`);
    await pool.query(`ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS oauth_expiry BIGINT`);
  } catch { /* columns may already exist */ }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id SERIAL PRIMARY KEY,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      template_key VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(created_by, template_key)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS certifications (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      validity_months INT NOT NULL DEFAULT 12,
      reminder_days_before INT NOT NULL DEFAULT 30,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS officer_certifications (
      id SERIAL PRIMARY KEY,
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
      certification_id INTEGER NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
      issued_date DATE NOT NULL,
      expiry_date DATE NOT NULL,
      certificate_number VARCHAR(100),
      issued_by VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS officer_staff_reminders (
      id SERIAL PRIMARY KEY,
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
      reminder_message TEXT NOT NULL,
      due_date DATE NOT NULL,
      notify_at DATE NOT NULL,
      extra_notify_emails TEXT,
      last_notified_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_officer_staff_reminders_officer ON officer_staff_reminders(officer_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_officer_staff_reminders_pending ON officer_staff_reminders(notify_at) WHERE last_notified_at IS NULL`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS timesheet_entries (
      id SERIAL PRIMARY KEY,
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
      clock_in TIMESTAMPTZ NOT NULL,
      clock_out TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_timesheet_entries_officer_clock ON timesheet_entries(officer_id, clock_in DESC)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_timesheet_entries_officer_open ON timesheet_entries(officer_id) WHERE clock_out IS NULL`,
  );
  await pool.query(`ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS segment_type VARCHAR(32)`);
  await pool.query(`
    ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS diary_event_id INTEGER
    REFERENCES diary_events(id) ON DELETE SET NULL
  `);

  const plansExist = await pool.query('SELECT 1 FROM service_plans LIMIT 1');
  if ((plansExist.rowCount ?? 0) === 0) {
    await pool.query(`
      INSERT INTO service_plans (name, description, sort_order) VALUES
      ('Standard', 'Base tier for small teams', 0),
      ('Professional', 'For growing businesses', 1),
      ('Enterprise', 'Full features and support', 2);
    `);
    console.log('Seeded default service plans');
  }

  const defaultSuperEmail = 'superadmin@workpilot.local';
  const defaultSuperPassword = 'superadmin123';

  const userCountRow = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM users');
  const userCount = parseInt(userCountRow.rows[0]?.c || '0', 10);

  if (userCount === 0 && isProduction) {
    const email = process.env.SUPER_ADMIN_EMAIL?.trim();
    const password = process.env.SUPER_ADMIN_PASSWORD;
    if (!email || !password || password.length < 12) {
      throw new Error(
        'Production bootstrap: set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (minimum 12 characters) in .env before the first server start with an empty database.',
      );
    }
  }

  const seedEmail = process.env.SUPER_ADMIN_EMAIL?.trim() || defaultSuperEmail;
  const seedPassword = process.env.SUPER_ADMIN_PASSWORD || defaultSuperPassword;

  const existingSuper = await pool.query<DbUser>('SELECT * FROM users WHERE email = $1', [seedEmail]);
  if ((existingSuper.rowCount ?? 0) === 0) {
    if (
      isProduction &&
      (!process.env.SUPER_ADMIN_EMAIL?.trim() ||
        !process.env.SUPER_ADMIN_PASSWORD ||
        process.env.SUPER_ADMIN_PASSWORD.length < 12)
    ) {
      console.warn(
        'Skipping SUPER_ADMIN auto-seed: set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (min 12 characters) to create this account.',
      );
    } else {
      const passwordHash = await bcrypt.hash(seedPassword, 10);
      await pool.query(
        'INSERT INTO users (email, password_hash, role, created_by) VALUES ($1, $2, $3, $4)',
        [seedEmail, passwordHash, 'SUPER_ADMIN', null],
      );
      console.log(`Seeded SUPER_ADMIN user with email ${seedEmail}`);
    }
  }
}

function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'TokenExpiredError') {
      // Expected when token expires; no need to log full stack
    } else {
      console.error('JWT verification error:', error);
    }
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Forbidden: Super admin access required' });
  }
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const r = req.user?.role;
  if (!req.user || (r !== 'ADMIN' && r !== 'SUPER_ADMIN' && r !== 'STAFF')) {
    return res.status(403).json({ message: 'Forbidden: Admin access required' });
  }
  next();
}

function requireOfficer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'OFFICER' || req.user.officerId == null) {
    return res.status(403).json({ message: 'Officer access required' });
  }
  next();
}

function requireFieldMobileSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!fieldMobileSessionOk(req.user)) {
    res.status(403).json({ message: 'Field mobile access required' });
    return;
  }
  next();
}

function requireFieldMobileJobs(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!fieldMobileSessionOk(req.user)) {
    res.status(403).json({ message: 'Field mobile access required' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && !fieldMobileHasJobs(req.user!)) {
    res.status(403).json({ message: 'Jobs permission required' });
    return;
  }
  next();
}

function requireFieldMobileDiary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!fieldMobileSessionOk(req.user)) {
    res.status(403).json({ message: 'Field mobile access required' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && !fieldMobileHasScheduling(req.user!)) {
    res.status(403).json({ message: 'Scheduling permission required' });
    return;
  }
  next();
}

/** Maps diary visit status to automatic timesheet segments (travelling vs on-site). */
function normalizeDiaryStatusForTimesheet(
  status: unknown,
): 'travelling_to_site' | 'arrived_at_site' | 'completed' | 'cancelled' | null {
  if (typeof status !== 'string') return null;
  const s = status.trim().toLowerCase().replace(/\s+/g, '_');
  if (!s) return null;
  if (s === 'completed') return 'completed';
  if (
    s === 'travelling_to_site' ||
    s === 'travelling' ||
    s === 'traveling_to_site' ||
    s === 'traveling'
  ) {
    return 'travelling_to_site';
  }
  if (s === 'arrived_at_site' || s === 'arrived') return 'arrived_at_site';
  if (s === 'cancelled' || s === 'aborted') return 'cancelled';
  return null;
}

function persistedDiaryStatus(status: unknown): string {
  const raw = typeof status === 'string' ? status.trim() : '';
  const n = normalizeDiaryStatusForTimesheet(raw);
  if (n) return n;
  if (!raw) return 'No status';
  return raw;
}

/** Field officers may save job report drafts while travelling or on site (before final submit). */
function diaryStatusAllowsJobReportDraft(status: unknown): boolean {
  const n = normalizeDiaryStatusForTimesheet(status);
  if (n === 'travelling_to_site' || n === 'arrived_at_site') return true;
  if (typeof status !== 'string') return false;
  const s = status.trim().toLowerCase().replace(/\s+/g, '_');
  return s === 'on_site';
}

async function resolveAbortReasonLabel(
  db: Pick<Pool, 'query'> | Pick<PoolClient, 'query'>,
  raw: unknown,
): Promise<{ ok: true; label: string } | { ok: false; message: string }> {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return { ok: false, message: 'Select an abort reason from the list.' };
  }
  const r = await db.query<{ label: string }>(
    `SELECT label FROM diary_abort_reasons WHERE lower(trim(label)) = lower(trim($1)) LIMIT 1`,
    [trimmed],
  );
  if ((r.rowCount ?? 0) === 0) {
    return {
      ok: false,
      message:
        'That abort reason is not in the current list. Refresh and pick a valid reason, or ask an admin to update Settings → Visit abort reasons.',
    };
  }
  return { ok: true, label: r.rows[0].label };
}

/** Admin may remove a visit only before travel / on-site / completion (cancelled rows may be removed). */
function diaryEventAllowsAdminDelete(status: string | null | undefined): boolean {
  const s = typeof status === 'string' ? status.trim().toLowerCase().replace(/\s+/g, '_') : '';
  if (s === 'completed') return false;
  if (s === 'cancelled' || s === 'aborted') return true;
  if (
    s === 'travelling_to_site' ||
    s === 'travelling' ||
    s === 'traveling_to_site' ||
    s === 'traveling' ||
    s === 'arrived_at_site' ||
    s === 'arrived' ||
    s === 'on_site'
  ) {
    return false;
  }
  return true;
}

const JOB_REPORT_QUESTION_TYPES = [
  'text',
  'textarea',
  'customer_signature',
  'officer_signature',
  'before_photo',
  'after_photo',
] as const;

function isJobReportQuestionType(s: string): boolean {
  return (JOB_REPORT_QUESTION_TYPES as readonly string[]).includes(s);
}

function jobReportAnswerIsPresent(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  if (t.length < 4) return false;
  return true;
}

/** Allowed `jobs.state` values after an officer submits a job report (visit completed). */
const POST_REPORT_NEXT_JOB_STATES = new Set<string>([
  'unscheduled',
  'scheduled',
  'rescheduled',
  'paused',
  'created',
  'in_progress',
  'completed',
]);

function parsePostReportNextJobState(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || !POST_REPORT_NEXT_JOB_STATES.has(s)) return null;
  return s;
}

async function countJobReportQuestionsForJob(
  client: Pool | PoolClient,
  jobId: number,
): Promise<number> {
  const r = await client.query<{ c: string }>(
    'SELECT COUNT(*)::text AS c FROM job_report_questions WHERE job_id = $1',
    [jobId],
  );
  return parseInt(r.rows[0]?.c || '0', 10);
}

type JobReportTemplateRow = {
  sort_order: number;
  question_type: string;
  prompt: string;
  helper_text: string | null;
  required: boolean;
};

function parseOptionalJobDescriptionId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n =
    typeof raw === 'number' && Number.isFinite(raw)
      ? Math.trunc(raw)
      : parseInt(String(raw), 10);
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

function jobReportQuestionDedupeKey(questionType: string, prompt: string): string {
  return `${String(questionType).trim().toLowerCase()}|${String(prompt).trim().toLowerCase()}`;
}

/**
 * When a job's job description is set or changed after creation, append that description's
 * report template rows that are not already on the job (same type + prompt).
 */
async function mergeJobDescriptionReportQuestionsIntoJob(
  db: Pool,
  jobId: number,
  jobDescriptionId: number,
): Promise<void> {
  const id = Math.trunc(jobDescriptionId);
  if (!Number.isFinite(id) || id < 1) return;

  const existing = await db.query<{ question_type: string; prompt: string }>(
    `SELECT question_type, prompt FROM job_report_questions WHERE job_id = $1`,
    [jobId],
  );
  const seen = new Set<string>();
  for (const r of existing.rows) {
    seen.add(jobReportQuestionDedupeKey(r.question_type, r.prompt));
  }

  const maxRes = await db.query<{ m: string }>(
    `SELECT COALESCE(MAX(sort_order), -1)::text AS m FROM job_report_questions WHERE job_id = $1`,
    [jobId],
  );
  let order = parseInt(maxRes.rows[0]?.m ?? '-1', 10);
  if (!Number.isFinite(order)) order = -1;

  const tpl = await db.query<JobReportTemplateRow>(
    `SELECT sort_order, question_type, prompt, helper_text, required
     FROM job_report_job_description_questions
     WHERE job_description_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [id],
  );

  for (const row of tpl.rows) {
    const key = jobReportQuestionDedupeKey(row.question_type, row.prompt);
    if (seen.has(key)) continue;
    seen.add(key);
    order += 1;
    await db.query(
      `INSERT INTO job_report_questions (job_id, sort_order, question_type, prompt, helper_text, required)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [jobId, order, row.question_type, row.prompt, row.helper_text, row.required],
    );
  }
}

/**
 * Seeds `job_report_questions` for a new job: global default (Settings → Job report template) first,
 * then extra rows from the job description template (Settings → Job descriptions → Job report for that type).
 */
async function seedJobReportQuestionsForNewJob(jobId: number, jobDescriptionId: number | null): Promise<void> {
  const globalRes = await pool.query<JobReportTemplateRow>(
    `SELECT sort_order, question_type, prompt, helper_text, required
     FROM job_report_default_questions
     ORDER BY sort_order ASC, id ASC`,
  );
  let descRes = { rows: [] as JobReportTemplateRow[] };
  const jd = jobDescriptionId != null && Number.isFinite(jobDescriptionId) ? Math.trunc(jobDescriptionId) : null;
  if (jd != null && jd > 0) {
    descRes = await pool.query<JobReportTemplateRow>(
      `SELECT sort_order, question_type, prompt, helper_text, required
       FROM job_report_job_description_questions
       WHERE job_description_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [jd],
    );
  }
  if (globalRes.rows.length === 0 && descRes.rows.length === 0) return;

  let order = 0;
  for (const row of globalRes.rows) {
    await pool.query(
      `INSERT INTO job_report_questions (job_id, sort_order, question_type, prompt, helper_text, required)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [jobId, order++, row.question_type, row.prompt, row.helper_text, row.required],
    );
  }
  for (const row of descRes.rows) {
    await pool.query(
      `INSERT INTO job_report_questions (job_id, sort_order, question_type, prompt, helper_text, required)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [jobId, order++, row.question_type, row.prompt, row.helper_text, row.required],
    );
  }
}

async function closeOpenTimesheetSegments(client: PoolClient, officerId: number): Promise<void> {
  await client.query(
    `UPDATE timesheet_entries SET clock_out = NOW(), updated_at = NOW()
     WHERE officer_id = $1 AND clock_out IS NULL`,
    [officerId],
  );
}

async function openTimesheetSegment(
  client: PoolClient,
  officerId: number,
  segmentType: 'travelling' | 'on_site',
  diaryEventId: number,
): Promise<void> {
  await client.query(
    `INSERT INTO timesheet_entries (officer_id, clock_in, clock_out, notes, segment_type, diary_event_id, updated_at)
     VALUES ($1, NOW(), NULL, NULL, $2, $3, NOW())`,
    [officerId, segmentType, diaryEventId],
  );
}

async function applyDiaryStatusToTimesheet(
  client: PoolClient,
  officerId: number,
  diaryEventId: number,
  normalized: 'travelling_to_site' | 'arrived_at_site' | 'completed' | 'cancelled' | null,
): Promise<void> {
  if (!normalized) return;
  if (normalized === 'completed' || normalized === 'cancelled') {
    await closeOpenTimesheetSegments(client, officerId);
    return;
  }
  if (normalized === 'travelling_to_site') {
    await closeOpenTimesheetSegments(client, officerId);
    await openTimesheetSegment(client, officerId, 'travelling', diaryEventId);
    return;
  }
  if (normalized === 'arrived_at_site') {
    await closeOpenTimesheetSegments(client, officerId);
    await openTimesheetSegment(client, officerId, 'on_site', diaryEventId);
  }
}

app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', timestamp: result.rows[0].now });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const emailNorm = email.trim().toLowerCase();

  try {
    const result = await pool.query<DbUser>(
      `SELECT id, email, password_hash, role, full_name, company_name, phone, service_plan, status, address, notes,
              tenant_admin_id, permissions
       FROM users WHERE LOWER(TRIM(email)) = $1`,
      [emailNorm],
    );

    if ((result.rowCount ?? 0) > 0) {
      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password_hash);

      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      if (user.role === 'STAFF') {
        if (user.tenant_admin_id == null) {
          return res.status(403).json({ message: 'This staff account is misconfigured. Contact support.' });
        }
        const ownerChk = await pool.query<{ id: number; role: string; tenant_admin_id: number | null }>(
          `SELECT id, role, tenant_admin_id FROM users WHERE id = $1`,
          [user.tenant_admin_id],
        );
        const ow = ownerChk.rows[0];
        if ((ownerChk.rowCount ?? 0) === 0 || ow.role !== 'ADMIN' || ow.tenant_admin_id != null) {
          return res.status(403).json({ message: 'This staff account is invalid. Contact your administrator.' });
        }
        if (user.status === 'SUSPENDED') {
          return res.status(403).json({ message: 'This account is suspended.' });
        }
      }

      const tenantScopeUserId =
        user.role === 'STAFF' && user.tenant_admin_id != null ? user.tenant_admin_id : user.id;
      const permObj = user.role === 'STAFF' ? permissionsFromDb(user.permissions) : null;

      let linkedOfficerId: number | undefined;
      if (user.role === 'ADMIN' || user.role === 'STAFF') {
        const lo = await pool.query<{ id: number }>(
          `SELECT id FROM officers WHERE linked_user_id = $1 LIMIT 1`,
          [user.id],
        );
        if ((lo.rowCount ?? 0) > 0) linkedOfficerId = lo.rows[0].id;
      }

      const payload: JwtPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantScopeUserId,
        tenantAdminId: user.role === 'STAFF' ? (user.tenant_admin_id ?? null) : null,
        permissions: permObj,
        ...(linkedOfficerId != null ? { officerId: linkedOfficerId } : {}),
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);

      const responseUser: Record<string, unknown> = {
        id: user.id,
        email: user.email,
        role: user.role,
        tenant_scope_user_id: tenantScopeUserId,
        is_tenant_owner: user.role === 'ADMIN',
        permissions: permObj,
      };
      if (user.role === 'ADMIN' || user.role === 'STAFF') {
        responseUser.full_name = user.full_name ?? null;
        responseUser.company_name = user.company_name ?? null;
        responseUser.phone = user.phone ?? null;
        responseUser.service_plan = user.service_plan ?? 'Standard';
        responseUser.status = user.status ?? 'ACTIVE';
      }
      return res.json({
        token,
        user: responseUser,
      });
    }

    const officerResult = await pool.query<{
      id: number;
      email: string;
      full_name: string;
      password_hash: string;
      state: string;
      permissions: unknown;
      linked_user_id: number | null;
      created_by: number | null;
    }>(
      `SELECT id, email, full_name, password_hash, state, permissions, linked_user_id, created_by FROM officers
       WHERE LOWER(TRIM(email)) = $1 AND password_hash IS NOT NULL`,
      [emailNorm],
    );

    if ((officerResult.rowCount ?? 0) === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const officer = officerResult.rows[0];
    if (officer.linked_user_id != null) {
      return res.status(403).json({
        message:
          'This field profile is linked to a dashboard login. Use the same email and password as WorkPilot on the web to sign in on the app.',
      });
    }
    if (officer.state !== 'active') {
      return res.status(403).json({ message: 'This account is not active. Contact your administrator.' });
    }

    const officerMatch = await bcrypt.compare(password, officer.password_hash);
    if (!officerMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const offPerm = permissionsFromDb(officer.permissions);
    const tenantScopeUserId =
      officer.created_by != null && Number.isFinite(officer.created_by) ? officer.created_by : undefined;

    const payload: JwtPayload = {
      userId: officer.id,
      email: officer.email,
      role: 'OFFICER',
      officerId: officer.id,
      permissions: offPerm,
      ...(tenantScopeUserId != null ? { tenantScopeUserId } : {}),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);

    return res.json({
      token,
      user: {
        id: officer.id,
        email: officer.email,
        role: 'OFFICER',
        full_name: officer.full_name,
        officer_id: officer.id,
        permissions: offPerm,
        ...(tenantScopeUserId != null ? { tenant_scope_user_id: tenantScopeUserId } : {}),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const CLIENT_STATUSES: ClientStatus[] = ['ACTIVE', 'PENDING_SETUP', 'SUSPENDED'];

app.post('/api/clients', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    email?: string;
    password?: string;
    full_name?: string;
    company_name?: string;
    phone?: string;
    service_plan?: string;
    status?: string;
    address?: string;
    notes?: string;
  };

  const { email, password } = body;
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ message: 'Email and initial password are required' });
  }

  let servicePlan = typeof body.service_plan === 'string' ? body.service_plan.trim() : null;
  if (servicePlan) {
    const planRow = await pool.query<DbServicePlan>('SELECT id FROM service_plans WHERE name = $1', [servicePlan]);
    if ((planRow.rowCount ?? 0) === 0) servicePlan = null;
  }
  if (!servicePlan) {
    const first = await pool.query<DbServicePlan>('SELECT name FROM service_plans ORDER BY sort_order ASC LIMIT 1');
    servicePlan = first.rows[0]?.name ?? 'Standard';
  }

  const status = body.status && CLIENT_STATUSES.includes(body.status as ClientStatus)
    ? body.status
    : 'PENDING_SETUP';

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() || null : null;
  const companyName = typeof body.company_name === 'string' ? body.company_name.trim() || null : null;
  const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;
  const address = typeof body.address === 'string' ? body.address.trim() || null : null;
  const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

  try {
    const existing = await pool.query<DbUser>('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if ((existing?.rowCount ?? 0) > 0) {
      return res.status(409).json({ message: 'A client with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const createdBy = req.user?.userId ?? null;
    const emailNorm = email.trim().toLowerCase();

    const result = await pool.query<DbUser>(
      `
        INSERT INTO users (
          email, password_hash, role, created_by,
          full_name, company_name, phone, service_plan, status, address, notes
        )
        VALUES ($1, $2, 'ADMIN', $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, email, role, created_at, created_by, full_name, company_name, phone, service_plan, status, address, notes
      `,
      [emailNorm, passwordHash, createdBy, fullName, companyName, phone, servicePlan, status, address, notes],
    );

    const client = result.rows[0];

    return res.status(201).json({
      client: {
        id: client.id,
        email: client.email,
        role: client.role,
        created_at: client.created_at,
        created_by: client.created_by,
        full_name: client.full_name ?? null,
        company_name: client.company_name ?? null,
        phone: client.phone ?? null,
        service_plan: client.service_plan ?? 'Standard',
        status: client.status ?? 'PENDING_SETUP',
        address: client.address ?? null,
        notes: client.notes ?? null,
      },
    });
  } catch (error) {
    console.error('Create client error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/clients/:id', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid client id' });

  const body = req.body as {
    full_name?: string;
    company_name?: string;
    phone?: string;
    service_plan?: string;
    status?: string;
    address?: string;
    notes?: string;
  };

  const fullName = body.full_name !== undefined ? (typeof body.full_name === 'string' ? body.full_name.trim() || null : null) : undefined;
  const companyName = body.company_name !== undefined ? (typeof body.company_name === 'string' ? body.company_name.trim() || null : null) : undefined;
  const phone = body.phone !== undefined ? (typeof body.phone === 'string' ? body.phone.trim() || null : null) : undefined;
  const address = body.address !== undefined ? (typeof body.address === 'string' ? body.address.trim() || null : null) : undefined;
  const notes = body.notes !== undefined ? (typeof body.notes === 'string' ? body.notes.trim() || null : null) : undefined;
  let servicePlan: string | undefined;
  if (typeof body.service_plan === 'string' && body.service_plan.trim()) {
    const planRow = await pool.query<DbServicePlan>('SELECT id FROM service_plans WHERE name = $1', [body.service_plan.trim()]);
    if ((planRow.rowCount ?? 0) > 0) servicePlan = body.service_plan.trim();
  }
  const status = body.status && CLIENT_STATUSES.includes(body.status as ClientStatus) ? body.status : undefined;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (fullName !== undefined) { updates.push(`full_name = $${idx++}`); values.push(fullName); }
  if (companyName !== undefined) { updates.push(`company_name = $${idx++}`); values.push(companyName); }
  if (phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(phone); }
  if (servicePlan !== undefined) { updates.push(`service_plan = $${idx++}`); values.push(servicePlan); }
  if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
  if (address !== undefined) { updates.push(`address = $${idx++}`); values.push(address); }
  if (notes !== undefined) { updates.push(`notes = $${idx++}`); values.push(notes); }

  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
  values.push(id);

  try {
    const result = await pool.query<DbUser>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} AND role = 'ADMIN' RETURNING id, email, role, created_at, created_by, full_name, company_name, phone, service_plan, status, address, notes`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Client not found' });
    const client = result.rows[0];
    return res.json({
      client: {
        id: client.id,
        email: client.email,
        role: client.role,
        created_at: client.created_at,
        created_by: client.created_by,
        full_name: client.full_name ?? null,
        company_name: client.company_name ?? null,
        phone: client.phone ?? null,
        service_plan: client.service_plan ?? 'Standard',
        status: client.status ?? 'ACTIVE',
        address: client.address ?? null,
        notes: client.notes ?? null,
      },
    });
  } catch (error) {
    console.error('Update client error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/clients', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const offset = (page - 1) * limit;

    const selectFields = `id, email, role, created_at, created_by, full_name, company_name, phone, service_plan, status, address, notes`;
    const baseWhere = `WHERE role = 'ADMIN'`;
    const searchCondition = search
      ? `AND (email ILIKE $1 OR full_name ILIKE $1 OR company_name ILIKE $1)`
      : '';
    const searchParam = search ? `%${search}%` : null;

    let countResult;
    let listResult;
    if (searchParam) {
      countResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM users ${baseWhere} ${searchCondition}`,
        [searchParam],
      );
      listResult = await pool.query<DbUser>(
        `SELECT ${selectFields} FROM users ${baseWhere} ${searchCondition} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [searchParam, limit, offset],
      );
    } else {
      countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM users ${baseWhere}`);
      listResult = await pool.query<DbUser>(
        `SELECT ${selectFields} FROM users ${baseWhere} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
    }

    const total = Number((countResult.rows[0] as { total: number }).total);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const countActiveResult = await pool.query(
      `SELECT COUNT(*)::int AS c FROM users WHERE role = 'ADMIN' AND (status IS NULL OR status = 'ACTIVE')`,
    );
    const countPendingResult = await pool.query(
      `SELECT COUNT(*)::int AS c FROM users WHERE role = 'ADMIN' AND status = 'PENDING_SETUP'`,
    );
    const totalActive = Number((countActiveResult.rows[0] as { c: number }).c);
    const totalPending = Number((countPendingResult.rows[0] as { c: number }).c);

    const clients = listResult.rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      created_at: row.created_at,
      created_by: row.created_by,
      full_name: row.full_name ?? null,
      company_name: row.company_name ?? null,
      phone: row.phone ?? null,
      service_plan: row.service_plan ?? 'Standard',
      status: row.status ?? 'ACTIVE',
      address: row.address ?? null,
      notes: row.notes ?? null,
    }));

    return res.json({
      clients,
      total,
      page,
      limit,
      totalPages,
      totalActive,
      totalPending,
    });
  } catch (error) {
    console.error('List clients error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  if (u.role === 'OFFICER') {
    try {
      const orow = await pool.query<{ permissions: unknown; created_by: number | null }>(
        `SELECT permissions, created_by FROM officers WHERE id = $1`,
        [u.officerId ?? u.userId],
      );
      const perm =
        (orow.rowCount ?? 0) > 0 ? permissionsFromDb(orow.rows[0].permissions) : permissionsFromDb(null);
      const ts =
        u.tenantScopeUserId ??
        ((orow.rowCount ?? 0) > 0 && orow.rows[0].created_by != null ? orow.rows[0].created_by : undefined);
      return res.json({
        user: {
          ...u,
          permissions: perm,
          ...(ts != null && Number.isFinite(ts) ? { tenant_scope_user_id: ts } : {}),
        },
      });
    } catch {
      return res.json({ user: u });
    }
  }
  try {
    const row = await pool.query<DbUser>(
      `SELECT id, email, role, full_name, company_name, phone, service_plan, status, address, notes,
              tenant_admin_id, permissions
       FROM users WHERE id = $1`,
      [u.userId],
    );
    if ((row.rowCount ?? 0) === 0) {
      return res.json({ user: u });
    }
    const db = row.rows[0];
    const tenantScopeUserId =
      db.role === 'STAFF' && db.tenant_admin_id != null ? db.tenant_admin_id : db.id;
    const permObj = db.role === 'STAFF' ? permissionsFromDb(db.permissions) : null;
    return res.json({
      user: {
        id: db.id,
        userId: db.id,
        email: db.email,
        role: db.role,
        tenantScopeUserId,
        tenantAdminId: db.tenant_admin_id ?? null,
        permissions: permObj,
        officer_id: u.officerId ?? null,
        full_name: db.full_name ?? null,
        company_name: db.company_name ?? null,
        phone: db.phone ?? null,
        service_plan: db.service_plan ?? 'Standard',
        status: db.status ?? 'ACTIVE',
        address: db.address ?? null,
        notes: db.notes ?? null,
        is_tenant_owner: db.role === 'ADMIN',
        tenant_scope_user_id: tenantScopeUserId,
      },
    });
  } catch (e) {
    console.error('auth/me', e);
    return res.json({ user: u });
  }
});

// ---------- Mobile app: home summary + timesheet (field officers) ----------
app.get('/api/mobile/home', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const mobilePerm = fieldEffectivePerms(u);
  if (!fieldMobileFeaturesEnabled(u) || u.officerId == null) {
    return res.json({
      officer_features: false,
      role: u.role,
      email: u.email,
      profile: null,
      stats: { assigned_jobs_open: 0, diary_upcoming_week: 0 },
      upcoming_diary: [],
      next_diary_event: null,
      active_timesheet: null,
      my_office_tasks_open: [],
      my_office_tasks_completed: [],
      mobile_permissions: mobilePerm,
    });
  }

  const oid = u.officerId;
  const hasJobs = fieldMobileHasJobs(u);
  const hasSched = fieldMobileHasScheduling(u);

  try {
    const profileRes = await pool.query<{
      id: number;
      full_name: string;
      email: string | null;
      phone: string | null;
      department: string | null;
      role_position: string | null;
      state: string;
    }>(
      `SELECT id, full_name, email, phone, department, role_position, state FROM officers WHERE id = $1`,
      [oid],
    );
    if ((profileRes.rowCount ?? 0) === 0) {
      return res.json({
        officer_features: false,
        role: u.role,
        email: u.email,
        profile: null,
        stats: { assigned_jobs_open: 0, diary_upcoming_week: 0 },
        upcoming_diary: [],
        next_diary_event: null,
        active_timesheet: null,
        my_office_tasks_open: [],
        my_office_tasks_completed: [],
        mobile_permissions: mobilePerm,
      });
    }
    const profile = profileRes.rows[0];

    const jobsOpen = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM jobs
       WHERE officer_id = $1 AND state NOT IN ('completed', 'closed')`,
      [oid],
    );
    let assignedJobsOpen = parseInt(jobsOpen.rows[0]?.c || '0', 10);
    if (!hasJobs) assignedJobsOpen = 0;

    const upcoming = hasSched
      ? await pool.query(
          `SELECT d.id AS diary_id, d.job_id, d.officer_id, d.start_time, d.duration_minutes, d.status AS event_status,
              d.notes, d.abort_reason, d.created_by_name, d.created_at,
              j.title, j.description, j.location, j.customer_id,
              c.full_name AS customer_full_name, c.email AS customer_email,
              o.full_name AS officer_full_name,
              (SELECT COUNT(*)::int FROM job_report_questions q WHERE q.job_id = j.id) AS job_report_question_count,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', jc.title, jc.first_name, jc.surname)), ''),
                NULLIF(TRIM(j.contact_name), ''),
                c.full_name
              ) AS site_contact_name
       FROM diary_events d
       JOIN jobs j ON j.id = d.job_id
       LEFT JOIN customers c ON c.id = j.customer_id
       LEFT JOIN customer_contacts jc ON jc.id = j.job_contact_id
       LEFT JOIN officers o ON o.id = d.officer_id
       WHERE (d.officer_id = $1 OR j.officer_id = $1)
         AND d.start_time < NOW() + INTERVAL '7 days'
         AND (d.start_time + (COALESCE(d.duration_minutes, 60) * INTERVAL '1 minute')) > NOW()
       ORDER BY d.start_time ASC
       LIMIT 50`,
          [oid],
        )
      : { rows: [] as Record<string, unknown>[] };

    const diaryUpcomingWeek = upcoming.rows.length;

    const mentionTag = `@${profile.full_name}`.trim();

    const myOpenOffice = hasJobs
      ? await pool.query(
          `SELECT ot.id, ot.job_id, ot.description, ot.created_at, ot.reminder_at,
              COALESCE(usr.full_name, usr.email, 'System') AS created_by_name,
              j.title AS job_title, j.state AS job_state, j.updated_at AS job_updated_at
       FROM office_tasks ot
       JOIN jobs j ON j.id = ot.job_id
       LEFT JOIN users usr ON usr.id = ot.created_by
       WHERE (
         ot.assignee_officer_id = $1
         OR (
           ot.assignee_officer_id IS NULL
           AND $2 <> '@'
           AND ot.description ILIKE '%' || $2 || '%'
         )
       )
         AND ot.completed = false
       ORDER BY ot.reminder_at ASC NULLS LAST, ot.created_at DESC
       LIMIT 50`,
          [oid, mentionTag],
        )
      : { rows: [] as Record<string, unknown>[] };
    const myDoneOffice = hasJobs
      ? await pool.query(
          `SELECT ot.id, ot.job_id, ot.description, ot.completed_at, ot.created_at,
              COALESCE(usr.full_name, usr.email, 'System') AS created_by_name,
              j.title AS job_title, j.state AS job_state, j.updated_at AS job_updated_at
       FROM office_tasks ot
       JOIN jobs j ON j.id = ot.job_id
       LEFT JOIN users usr ON usr.id = ot.created_by
       WHERE (
         ot.assignee_officer_id = $1
         OR (
           ot.assignee_officer_id IS NULL
           AND $2 <> '@'
           AND ot.description ILIKE '%' || $2 || '%'
         )
       )
         AND ot.completed = true
       ORDER BY ot.completed_at DESC NULLS LAST, ot.updated_at DESC
       LIMIT 40`,
          [oid, mentionTag],
        )
      : { rows: [] as Record<string, unknown>[] };

    const openTs = hasSched
      ? await pool.query<{
          id: number;
          clock_in: Date;
          notes: string | null;
          segment_type: string | null;
          diary_event_id: number | null;
        }>(
          `SELECT id, clock_in, notes, segment_type, diary_event_id FROM timesheet_entries
       WHERE officer_id = $1 AND clock_out IS NULL
       ORDER BY clock_in DESC
       LIMIT 1`,
          [oid],
        )
      : { rowCount: 0, rows: [] as { id: number; clock_in: Date; notes: string | null; segment_type: string | null; diary_event_id: number | null }[] };
    const activeTimesheet =
      hasSched && (openTs.rowCount ?? 0) > 0
        ? {
            id: openTs.rows[0].id,
            clock_in: (openTs.rows[0].clock_in as Date).toISOString(),
            notes: openTs.rows[0].notes,
            segment_type: openTs.rows[0].segment_type,
            diary_event_id: openTs.rows[0].diary_event_id,
          }
        : null;

    const nextEvent = upcoming.rows.length > 0 ? upcoming.rows[0] : null;

    return res.json({
      officer_features: true,
      role: u.role,
      email: u.email,
      mobile_permissions: mobilePerm,
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        department: profile.department,
        role_position: profile.role_position,
        state: profile.state,
      },
      stats: {
        assigned_jobs_open: assignedJobsOpen,
        diary_upcoming_week: diaryUpcomingWeek,
      },
      upcoming_diary: upcoming.rows,
      next_diary_event: nextEvent,
      active_timesheet: activeTimesheet,
      my_office_tasks_open: myOpenOffice.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        job_id: Number(r.job_id),
        description: (r.description as string) ?? '',
        created_by_name: (r.created_by_name as string) ?? 'System',
        job_title: (r.job_title as string) ?? 'Job',
        job_state: (r.job_state as string) ?? '',
        job_updated_at: (r.job_updated_at as Date).toISOString(),
        created_at: (r.created_at as Date).toISOString(),
        reminder_at: r.reminder_at ? (r.reminder_at as Date).toISOString() : null,
      })),
      my_office_tasks_completed: myDoneOffice.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        job_id: Number(r.job_id),
        description: (r.description as string) ?? '',
        created_by_name: (r.created_by_name as string) ?? 'System',
        job_title: (r.job_title as string) ?? 'Job',
        job_state: (r.job_state as string) ?? '',
        job_updated_at: (r.job_updated_at as Date).toISOString(),
        created_at: (r.created_at as Date).toISOString(),
        completed_at: r.completed_at ? (r.completed_at as Date).toISOString() : null,
      })),
    });
  } catch (error) {
    console.error('Mobile home error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Field officer: jobs assigned to me that are not completed/closed (matches home stats). */
app.get('/api/mobile/open-jobs', authenticate, requireFieldMobileJobs, async (req: AuthenticatedRequest, res: Response) => {
  const oid = req.user!.officerId!;
  try {
    const listResult = await pool.query<
      DbJob & { customer_full_name: string | null }
    >(
      `SELECT j.id, j.title, j.description, j.state, j.priority, j.location,
              j.schedule_start, j.duration_minutes, j.scheduling_notes,
              j.customer_id, j.job_notes, j.updated_at, j.dispatched_at,
              c.full_name AS customer_full_name
       FROM jobs j
       LEFT JOIN customers c ON c.id = j.customer_id
       WHERE j.officer_id = $1 AND j.state NOT IN ('completed', 'closed')
       ORDER BY j.schedule_start ASC NULLS LAST, j.updated_at DESC
       LIMIT 200`,
      [oid],
    );
    const jobs = listResult.rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? null,
      state: r.state,
      priority: r.priority ?? null,
      location: r.location ?? null,
      customer_full_name: r.customer_full_name ?? null,
      customer_id: r.customer_id ?? null,
      schedule_start: r.schedule_start ? (r.schedule_start as Date).toISOString() : null,
      duration_minutes: r.duration_minutes ?? null,
      scheduling_notes: r.scheduling_notes ?? null,
      job_notes: r.job_notes ?? null,
      dispatched_at: r.dispatched_at ? (r.dispatched_at as Date).toISOString() : null,
      updated_at: (r.updated_at as Date).toISOString(),
    }));
    return res.json({ jobs });
  } catch (error) {
    console.error('Mobile open jobs error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Field officer: mark an office task complete when it is assigned to this officer. */
app.patch(
  '/api/mobile/jobs/:jobId/office-tasks/:taskId',
  authenticate,
  requireFieldMobileJobs,
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = req.user!.officerId!;
    const jobId = parseInt(String(req.params.jobId), 10);
    const taskId = parseInt(String(req.params.taskId), 10);
    if (!Number.isFinite(jobId) || !Number.isFinite(taskId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const body = req.body as { completed?: boolean };
    if (body.completed !== true) {
      return res.status(400).json({ message: 'Set completed: true to finish the task' });
    }

    try {
      const result = await pool.query(
        `UPDATE office_tasks
         SET completed = true,
             completed_at = NOW(),
             completed_by = $4,
             completion_source = 'mobile',
             updated_at = NOW()
         WHERE id = $1 AND job_id = $2 AND assignee_officer_id = $3 AND completed = false
         RETURNING id`,
        [taskId, jobId, oid, req.user!.userId],
      );
      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Task not found or not assigned to you' });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error('Mobile complete office task error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.post('/api/timesheet/clock-in', authenticate, requireFieldMobileSession, async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    message:
      'Manual clock-in is disabled. Start time is recorded when you set a diary visit to “Travelling to site”.',
  });
});

app.post('/api/timesheet/clock-out', authenticate, requireFieldMobileSession, async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    message:
      'Manual clock-out is disabled. Time is recorded from diary status: travelling, on site, and completed.',
  });
});

app.get('/api/timesheet/history', authenticate, requireFieldMobileSession, async (req: AuthenticatedRequest, res: Response) => {
  const oid = req.user!.officerId!;
  const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  const fromDate =
    typeof req.query.from === 'string' && req.query.from.length >= 10 ? req.query.from.slice(0, 10) : null;
  const toDate = typeof req.query.to === 'string' && req.query.to.length >= 10 ? req.query.to.slice(0, 10) : null;

  try {
    const conditions: string[] = ['officer_id = $1'];
    const params: unknown[] = [oid];
    let p = 2;
    if (fromDate) {
      conditions.push(`clock_in >= $${p++}::date`);
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push(`clock_in < ($${p++}::date + INTERVAL '1 day')`);
      params.push(toDate);
    }
    params.push(limit);
    const lim = `LIMIT $${params.length}`;

    const result = await pool.query(
      `SELECT id, officer_id, clock_in, clock_out, notes, segment_type, diary_event_id,
              EXTRACT(EPOCH FROM (COALESCE(clock_out, NOW()) - clock_in))::bigint AS duration_seconds
       FROM timesheet_entries
       WHERE ${conditions.join(' AND ')}
       ORDER BY clock_in DESC
       ${lim}`,
      params,
    );

    const entries = result.rows.map((r) => ({
      id: r.id as number,
      officer_id: r.officer_id as number,
      clock_in: (r.clock_in as Date).toISOString(),
      clock_out: r.clock_out ? (r.clock_out as Date).toISOString() : null,
      notes: r.notes as string | null,
      segment_type: (r.segment_type as string | null) ?? null,
      diary_event_id: (r.diary_event_id as number | null) ?? null,
      duration_seconds: Number(r.duration_seconds),
    }));

    return res.json({ entries });
  } catch (error) {
    console.error('Timesheet history error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Admin: timesheet history for a field officer (same payload shape as GET /api/timesheet/history). */
app.get('/api/officers/:id/timesheet-history', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const officerId = parseInt(String(idParam), 10);
  if (!Number.isFinite(officerId)) return res.status(400).json({ message: 'Invalid officer id' });

  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const exists = await pool.query(
      `SELECT id FROM officers WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [officerId] : [officerId, userId],
    );
    if ((exists.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: 'Officer not found' });
    }

    const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const fromDate =
      typeof req.query.from === 'string' && req.query.from.length >= 10 ? req.query.from.slice(0, 10) : null;
    const toDate = typeof req.query.to === 'string' && req.query.to.length >= 10 ? req.query.to.slice(0, 10) : null;

    const conditions: string[] = ['officer_id = $1'];
    const params: unknown[] = [officerId];
    let p = 2;
    if (fromDate) {
      conditions.push(`clock_in >= $${p++}::date`);
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push(`clock_in < ($${p++}::date + INTERVAL '1 day')`);
      params.push(toDate);
    }
    params.push(limit);
    const lim = `LIMIT $${params.length}`;

    const result = await pool.query(
      `SELECT id, officer_id, clock_in, clock_out, notes, segment_type, diary_event_id,
              EXTRACT(EPOCH FROM (COALESCE(clock_out, NOW()) - clock_in))::bigint AS duration_seconds
       FROM timesheet_entries
       WHERE ${conditions.join(' AND ')}
       ORDER BY clock_in DESC
       ${lim}`,
      params,
    );

    const entries = result.rows.map((r) => ({
      id: r.id as number,
      officer_id: r.officer_id as number,
      clock_in: (r.clock_in as Date).toISOString(),
      clock_out: r.clock_out ? (r.clock_out as Date).toISOString() : null,
      notes: r.notes as string | null,
      segment_type: (r.segment_type as string | null) ?? null,
      diary_event_id: (r.diary_event_id as number | null) ?? null,
      duration_seconds: Number(r.duration_seconds),
    }));

    return res.json({ entries });
  } catch (error) {
    console.error('Officer timesheet history error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Service Plans (Super Admin only) ----------
app.get('/api/service-plans', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query<DbServicePlan>(
      'SELECT id, name, description, sort_order, created_at FROM service_plans ORDER BY sort_order ASC, name ASC',
    );
    return res.json({ plans: result.rows });
  } catch (error) {
    console.error('List service plans error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/service-plans', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as { name?: string; description?: string; sort_order?: number };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return res.status(400).json({ message: 'Plan name is required' });
  }
  const description = typeof body.description === 'string' ? body.description.trim() || null : null;
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0;
  try {
    const result = await pool.query<DbServicePlan>(
      'INSERT INTO service_plans (name, description, sort_order) VALUES ($1, $2, $3) RETURNING id, name, description, sort_order, created_at',
      [name, description, sortOrder],
    );
    return res.status(201).json({ plan: result.rows[0] });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === '23505') return res.status(409).json({ message: 'A plan with this name already exists' });
    console.error('Create service plan error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/service-plans/:id', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid plan id' });
  const body = req.body as { name?: string; description?: string; sort_order?: number };
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.push(`name = $${idx++}`);
    values.push(body.name.trim());
  }
  if (typeof body.description === 'string') {
    updates.push(`description = $${idx++}`);
    values.push(body.description.trim() || null);
  }
  if (typeof body.sort_order === 'number') {
    updates.push(`sort_order = $${idx++}`);
    values.push(body.sort_order);
  }
  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
  values.push(id);
  try {
    const result = await pool.query<DbServicePlan>(
      `UPDATE service_plans SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, description, sort_order, created_at`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Service plan not found' });
    return res.json({ plan: result.rows[0] });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === '23505') return res.status(409).json({ message: 'A plan with this name already exists' });
    console.error('Update service plan error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/service-plans/:id', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid plan id' });
  try {
    const planRow = await pool.query<DbServicePlan>('SELECT name FROM service_plans WHERE id = $1', [id]);
    if ((planRow.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Service plan not found' });
    const planName = planRow.rows[0].name;
    const inUse = await pool.query('SELECT 1 FROM users WHERE role = $1 AND service_plan = $2 LIMIT 1', ['ADMIN', planName]);
    if ((inUse.rowCount ?? 0) > 0) {
      return res.status(409).json({ message: 'Cannot delete: one or more clients use this plan. Change their plan first.' });
    }
    await pool.query('DELETE FROM service_plans WHERE id = $1', [id]);
    return res.status(204).send();
  } catch (error) {
    console.error('Delete service plan error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Customers (Admin only) ----------
const CUSTOMER_STATUSES = ['ACTIVE', 'LEAD', 'INACTIVE'] as const;

app.get('/api/customers', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(5000, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const statusFilter = typeof req.query.status === 'string' && CUSTOMER_STATUSES.includes(req.query.status as typeof CUSTOMER_STATUSES[number])
      ? req.query.status
      : '';
    const offset = (page - 1) * limit;
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const conditions: string[] = [];
    const countParams: unknown[] = [];
    const listParams: unknown[] = [];
    let p = 1;
    if (!isSuperAdmin) {
      conditions.push(`created_by = $${p++}`);
      countParams.push(userId);
      listParams.push(userId);
    }
    if (search) {
      conditions.push(`(full_name ILIKE $${p} OR email ILIKE $${p} OR company ILIKE $${p})`);
      countParams.push(`%${search}%`);
      listParams.push(`%${search}%`);
      p++;
    }
    if (statusFilter) {
      conditions.push(`status = $${p++}`);
      countParams.push(statusFilter);
      listParams.push(statusFilter);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    listParams.push(limit, offset);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM customers ${whereClause}`,
      countParams,
    );
    const limitIdx = listParams.length - 1;
    const offsetIdx = listParams.length;
    const listResult = await pool.query<any>(
      `SELECT id, full_name, email, phone, company, address, city, region, country, status, last_contact, notes, customer_type_id,
              address_line_1, address_line_2, address_line_3, town, county, postcode, landline, credit_days, contact_title, contact_first_name,
              contact_surname, contact_position, contact_mobile, contact_landline, contact_email, prefers_phone, prefers_sms,
              prefers_email, prefers_letter, COALESCE(invoice_reminders_enabled, true) AS invoice_reminders_enabled, lead_source, price_book_id,
              created_at, updated_at, created_by
       FROM customers ${whereClause} ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams,
    );

    const total = Number((countResult.rows[0] as { total: number }).total);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const ownerClause = isSuperAdmin ? '' : 'WHERE created_by = $1';
    const activeClause = isSuperAdmin ? "WHERE status = 'ACTIVE'" : 'AND status = \'ACTIVE\'';
    const leadClause = isSuperAdmin ? "WHERE status = 'LEAD'" : 'AND status = \'LEAD\'';
    const inactiveClause = isSuperAdmin ? "WHERE status = 'INACTIVE'" : 'AND status = \'INACTIVE\'';
    const countParams2 = isSuperAdmin ? [] : [userId];
    const activeResult = await pool.query(`SELECT COUNT(*)::int AS c FROM customers ${ownerClause} ${activeClause}`, countParams2);
    const leadResult = await pool.query(`SELECT COUNT(*)::int AS c FROM customers ${ownerClause} ${leadClause}`, countParams2);
    const inactiveResult = await pool.query(`SELECT COUNT(*)::int AS c FROM customers ${ownerClause} ${inactiveClause}`, countParams2);

    const totalActive = Number((activeResult.rows[0] as { c: number }).c);
    const totalLeads = Number((leadResult.rows[0] as { c: number }).c);
    const totalInactive = Number((inactiveResult.rows[0] as { c: number }).c);

    const monthStart = "date_trunc('month', NOW())";
    const newThisMonthResult = await pool.query(
      `SELECT COUNT(*)::int AS c FROM customers ${ownerClause} ${isSuperAdmin ? 'WHERE' : 'AND'} created_at >= ${monthStart}`,
      countParams2,
    );
    const newThisMonth = Number((newThisMonthResult.rows[0] as { c: number }).c);

    const totalAtStartOfMonthResult = await pool.query(
      `SELECT COUNT(*)::int AS c FROM customers ${ownerClause} ${isSuperAdmin ? 'WHERE' : 'AND'} created_at < ${monthStart}`,
      countParams2,
    );
    const totalAtStartOfMonth = Number((totalAtStartOfMonthResult.rows[0] as { c: number }).c);

    const newLastMonthResult = await pool.query(
      `SELECT COUNT(*)::int AS c FROM customers ${ownerClause} ${isSuperAdmin ? 'WHERE' : 'AND'} created_at >= ${monthStart} - interval '1 month' AND created_at < ${monthStart}`,
      countParams2,
    );
    const newLastMonth = Number((newLastMonthResult.rows[0] as { c: number }).c);

    const activeAtStartResult = await pool.query(
      `SELECT COUNT(*)::int AS c FROM customers ${ownerClause} ${isSuperAdmin ? 'WHERE' : 'AND'} status = 'ACTIVE' AND created_at < ${monthStart}`,
      countParams2,
    );
    const activeAtStart = Number((activeAtStartResult.rows[0] as { c: number }).c);
    const leadsAtStartResult = await pool.query(
      `SELECT COUNT(*)::int AS c FROM customers ${ownerClause} ${isSuperAdmin ? 'WHERE' : 'AND'} status = 'LEAD' AND created_at < ${monthStart}`,
      countParams2,
    );
    const leadsAtStart = Number((leadsAtStartResult.rows[0] as { c: number }).c);

    const pctChangeTotal = totalAtStartOfMonth > 0 ? Math.round(((total - totalAtStartOfMonth) / totalAtStartOfMonth) * 100) : null;
    const pctChangeLeads = leadsAtStart > 0 ? Math.round(((totalLeads - leadsAtStart) / leadsAtStart) * 100) : null;
    const retentionNow = total > 0 ? (totalActive / total) * 100 : 0;
    const retentionStart = totalAtStartOfMonth > 0 ? (activeAtStart / totalAtStartOfMonth) * 100 : 0;
    const pctChangeRetention = retentionStart > 0 ? Math.round(((retentionNow - retentionStart) / retentionStart) * 100) : null;
    const pctChangeNewThisMonth = newLastMonth > 0 ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100) : null;

    const customers = listResult.rows.map((r: any) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      phone: r.phone ?? null,
      company: r.company ?? null,
      address: r.address ?? null,
      city: r.city ?? null,
      region: r.region ?? null,
      country: r.country ?? null,
      status: r.status,
      last_contact: r.last_contact ? (r.last_contact as Date).toISOString() : null,
      notes: r.notes ?? null,
      customer_type_id: r.customer_type_id ?? null,
      address_line_1: r.address_line_1 ?? null,
      address_line_2: r.address_line_2 ?? null,
      address_line_3: r.address_line_3 ?? null,
      town: r.town ?? null,
      county: r.county ?? null,
      postcode: r.postcode ?? null,
      landline: r.landline ?? null,
      credit_days: r.credit_days ?? null,
      contact_title: r.contact_title ?? null,
      contact_first_name: r.contact_first_name ?? null,
      contact_surname: r.contact_surname ?? null,
      contact_position: r.contact_position ?? null,
      contact_mobile: r.contact_mobile ?? null,
      contact_landline: r.contact_landline ?? null,
      contact_email: r.contact_email ?? null,
      prefers_phone: !!r.prefers_phone,
      prefers_sms: !!r.prefers_sms,
      prefers_email: !!r.prefers_email,
      prefers_letter: !!r.prefers_letter,
      invoice_reminders_enabled: r.invoice_reminders_enabled !== false,
      lead_source: r.lead_source ?? null,
      price_book_id: r.price_book_id ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      created_by: r.created_by,
    }));

    return res.json({
      customers,
      total,
      page,
      limit,
      totalPages,
      totalActive,
      totalLeads,
      totalInactive,
      newThisMonth,
      pctChangeTotal,
      pctChangeLeads,
      pctChangeRetention,
      pctChangeNewThisMonth,
    });
  } catch (error) {
    console.error('List customers error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:id', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });

  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const ownerClause = isSuperAdmin ? '' : 'AND c.created_by = $2';
  const params = isSuperAdmin ? [id] : [id, userId];

  try {
    const result = await pool.query(`
      SELECT c.*, 
        t.name as customer_type_name, 
        t.allow_branches as customer_type_allow_branches,
        t.company_name_required as customer_type_company_name_required,
        t.work_address_name as customer_type_work_address_name,
        pb.name as price_book_name,
        u.full_name as created_by_name
      FROM customers c
      LEFT JOIN customer_types t ON c.customer_type_id = t.id
      LEFT JOIN price_books pb ON c.price_book_id = pb.id
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = $1 ${ownerClause}
    `, params);

    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    const customer = result.rows[0];

    const notesRes = await pool.query(
      'SELECT * FROM customer_specific_notes WHERE customer_id = $1 ORDER BY sort_order ASC, created_at ASC',
      [id],
    );
    
    return res.json({
      ...customer,
      specific_notes: notesRes.rows
    });
  } catch (error) {
    console.error('Get customer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get(
  '/api/customers/:id/service-reminder-schedule',
  authenticate,
  requireTenantCrmAccess('customers'),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    try {
      const ownerRes = await pool.query<{ created_by: number }>(
        `SELECT created_by FROM customers WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
        isSuperAdmin ? [id] : [id, userId],
      );
      if ((ownerRes.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
      const tenantUserId = ownerRes.rows[0]!.created_by;
      const schedule = await getCustomerServiceReminderSchedule(pool, { customerId: id, tenantUserId });
      if (!schedule) return res.status(404).json({ message: 'Customer not found' });
      return res.json(schedule);
    } catch (error) {
      console.error('Get service reminder schedule error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.post('/api/customers/:id/specific-notes', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const idRaw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const customerId = parseInt(String(idRaw), 10);
  const body = req.body as { title: string; description: string; work_address_id?: unknown };
  const { title, description } = body;
  if (!title || !description) return res.status(400).json({ message: 'Title and description are required' });

  try {
    const workAddressId = await resolveWorkAddressIdForCustomer(pool, customerId, body.work_address_id);
    const result = await pool.query(
      'INSERT INTO customer_specific_notes (customer_id, title, description, work_address_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [customerId, title.trim(), description.trim(), workAddressId],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create customer note error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/customers/:id/specific-notes/:noteId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const noteIdRaw = Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId;
  const noteId = parseInt(String(noteIdRaw), 10);
  const { title, description } = req.body as { title?: string; description?: string };

  try {
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title.trim()); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description.trim()); }

    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

    values.push(noteId);
    const result = await pool.query(
      `UPDATE customer_specific_notes SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Note not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Update customer note error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/customers/:id/specific-notes/:noteId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const noteIdRaw = Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId;
  const noteId = parseInt(String(noteIdRaw), 10);
  try {
    const result = await pool.query('DELETE FROM customer_specific_notes WHERE id = $1', [noteId]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Note not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete customer note error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/customers', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    full_name?: string;
    email?: string;
    phone?: string;
    company?: string;
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    status?: string;
    notes?: string;
    customer_type_id?: number;
  };
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!fullName) return res.status(400).json({ message: 'Full name is required' });
  const status = body.status && CUSTOMER_STATUSES.includes(body.status as typeof CUSTOMER_STATUSES[number])
    ? body.status
    : 'LEAD';

  const str = (val: any) => typeof val === 'string' ? val.trim() || null : null;
  const phone = str(body.phone);
  const company = str(body.company);
  const address = str(body.address);
  const city = str(body.city);
  const region = str(body.region);
  const country = str(body.country);
  const notes = str(body.notes);
  const customerTypeId = typeof body.customer_type_id === 'number' ? body.customer_type_id : null;

  const b = body as any;
  const addressLine1 = str(b.address_line_1);
  const addressLine2 = str(b.address_line_2);
  const addressLine3 = str(b.address_line_3);
  const town = str(b.town);
  const county = str(b.county);
  const postcode = str(b.postcode);
  const landline = str(b.landline);
  const creditDays = str(b.credit_days);
  const contactTitle = str(b.contact_title);
  const contactFirstName = str(b.contact_first_name);
  const contactSurname = str(b.contact_surname);
  const contactPosition = str(b.contact_position);
  const contactMobile = str(b.contact_mobile);
  const contactLandline = str(b.contact_landline);
  const contactEmail = str(b.contact_email);
  const prefersPhone = !!b.prefers_phone;
  const prefersSms = !!b.prefers_sms;
  const prefersEmail = !!b.prefers_email;
  const prefersLetter = !!b.prefers_letter;
  const leadSource = str(b.lead_source);
  const priceBookId = typeof b.price_book_id === 'number' ? b.price_book_id : null;
  const w3w = str(b.w3w);
  const waterSupply = str(b.water_supply);
  const powerSupply = str(b.power_supply);
  const technicalNotes = str(b.technical_notes);

  const createdBy = getTenantScopeUserId(req.user!);

  try {
    const result = await pool.query<any>(
      `INSERT INTO customers (
         full_name, email, phone, company, address, city, region, country, status, notes, customer_type_id,
         address_line_1, address_line_2, address_line_3, town, county, postcode, landline, credit_days,
         contact_title, contact_first_name, contact_surname, contact_position, contact_mobile, contact_landline, contact_email,
         prefers_phone, prefers_sms, prefers_email, prefers_letter, lead_source, price_book_id,
         w3w, water_supply, power_supply, technical_notes,
         created_by
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19,
         $20, $21, $22, $23, $24, $25, $26,
         $27, $28, $29, $30, $31, $32,
         $33, $34, $35, $36,
         $37
       )
       RETURNING *`,
      [
        fullName, email, phone, company, address, city, region, country, status, notes, customerTypeId,
        addressLine1, addressLine2, addressLine3, town, county, postcode, landline, creditDays,
        contactTitle, contactFirstName, contactSurname, contactPosition, contactMobile, contactLandline, contactEmail,
        prefersPhone, prefersSms, prefersEmail, prefersLetter, leadSource, priceBookId,
        w3w, waterSupply, powerSupply, technicalNotes,
        createdBy
      ],
    );
    const c = result.rows[0];
    return res.status(201).json({
      customer: {
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone ?? null,
        company: c.company ?? null,
        address: c.address ?? null,
        city: c.city ?? null,
        region: c.region ?? null,
        country: c.country ?? null,
        status: c.status,
        last_contact: c.last_contact ? (c.last_contact as Date).toISOString() : null,
        notes: c.notes ?? null,
        customer_type_id: c.customer_type_id ?? null,
        address_line_1: c.address_line_1 ?? null,
        address_line_2: c.address_line_2 ?? null,
        address_line_3: c.address_line_3 ?? null,
        town: c.town ?? null,
        county: c.county ?? null,
        postcode: c.postcode ?? null,
        landline: c.landline ?? null,
        credit_days: c.credit_days ?? null,
        contact_title: c.contact_title ?? null,
        contact_first_name: c.contact_first_name ?? null,
        contact_surname: c.contact_surname ?? null,
        contact_position: c.contact_position ?? null,
        contact_mobile: c.contact_mobile ?? null,
        contact_landline: c.contact_landline ?? null,
        contact_email: c.contact_email ?? null,
        prefers_phone: !!c.prefers_phone,
        prefers_sms: !!c.prefers_sms,
        prefers_email: !!c.prefers_email,
        prefers_letter: !!c.prefers_letter,
        invoice_reminders_enabled: c.invoice_reminders_enabled !== false,
        service_reminders_enabled: c.service_reminders_enabled !== false,
        lead_source: c.lead_source ?? null,
        price_book_id: c.price_book_id ?? null,
        created_at: c.created_at,
        updated_at: c.updated_at,
        created_by: c.created_by,
      },
    });
  } catch (error) {
    console.error('Create customer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/customers/:id', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid customer id' });

  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const ownershipCheck = isSuperAdmin ? '' : ' AND created_by = $1';

  const body = req.body as Record<string, unknown>;
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : undefined);
  const strReq = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : undefined);
  if (strReq('full_name') !== undefined) { updates.push(`full_name = $${idx++}`); values.push(strReq('full_name')); }
  if (strReq('email') !== undefined) { updates.push(`email = $${idx++}`); values.push(strReq('email')!.toLowerCase()); }
  if (str('phone') !== undefined) { updates.push(`phone = $${idx++}`); values.push(str('phone')); }
  if (str('company') !== undefined) { updates.push(`company = $${idx++}`); values.push(str('company')); }
  if (str('address') !== undefined) { updates.push(`address = $${idx++}`); values.push(str('address')); }
  if (str('city') !== undefined) { updates.push(`city = $${idx++}`); values.push(str('city')); }
  if (str('region') !== undefined) { updates.push(`region = $${idx++}`); values.push(str('region')); }
  if (str('country') !== undefined) { updates.push(`country = $${idx++}`); values.push(str('country')); }
  if (str('notes') !== undefined) { updates.push(`notes = $${idx++}`); values.push(str('notes')); }
  if (body.status && CUSTOMER_STATUSES.includes(body.status as typeof CUSTOMER_STATUSES[number])) {
    updates.push(`status = $${idx++}`);
    values.push(body.status);
  }
  if (body.last_contact !== undefined) {
    updates.push(`last_contact = $${idx++}`);
    values.push(body.last_contact ? new Date(body.last_contact as string) : null);
  }
  if (body.customer_type_id !== undefined) {
    updates.push(`customer_type_id = $${idx++}`);
    values.push(typeof body.customer_type_id === 'number' ? body.customer_type_id : null);
  }
  if (str('address_line_1') !== undefined) { updates.push(`address_line_1 = $${idx++}`); values.push(str('address_line_1')); }
  if (str('address_line_2') !== undefined) { updates.push(`address_line_2 = $${idx++}`); values.push(str('address_line_2')); }
  if (str('address_line_3') !== undefined) { updates.push(`address_line_3 = $${idx++}`); values.push(str('address_line_3')); }
  if (str('town') !== undefined) { updates.push(`town = $${idx++}`); values.push(str('town')); }
  if (str('county') !== undefined) { updates.push(`county = $${idx++}`); values.push(str('county')); }
  if (str('postcode') !== undefined) { updates.push(`postcode = $${idx++}`); values.push(str('postcode')); }
  if (str('landline') !== undefined) { updates.push(`landline = $${idx++}`); values.push(str('landline')); }
  if (str('credit_days') !== undefined) { updates.push(`credit_days = $${idx++}`); values.push(str('credit_days')); }
  if (str('contact_title') !== undefined) { updates.push(`contact_title = $${idx++}`); values.push(str('contact_title')); }
  if (str('contact_first_name') !== undefined) { updates.push(`contact_first_name = $${idx++}`); values.push(str('contact_first_name')); }
  if (str('contact_surname') !== undefined) { updates.push(`contact_surname = $${idx++}`); values.push(str('contact_surname')); }
  if (str('contact_position') !== undefined) { updates.push(`contact_position = $${idx++}`); values.push(str('contact_position')); }
  if (str('contact_mobile') !== undefined) { updates.push(`contact_mobile = $${idx++}`); values.push(str('contact_mobile')); }
  if (str('contact_landline') !== undefined) { updates.push(`contact_landline = $${idx++}`); values.push(str('contact_landline')); }
  if (str('contact_email') !== undefined) { updates.push(`contact_email = $${idx++}`); values.push(str('contact_email')); }
  if (body.prefers_phone !== undefined) { updates.push(`prefers_phone = $${idx++}`); values.push(!!body.prefers_phone); }
  if (body.prefers_sms !== undefined) { updates.push(`prefers_sms = $${idx++}`); values.push(!!body.prefers_sms); }
  if (body.prefers_email !== undefined) { updates.push(`prefers_email = $${idx++}`); values.push(!!body.prefers_email); }
  if (body.prefers_letter !== undefined) { updates.push(`prefers_letter = $${idx++}`); values.push(!!body.prefers_letter); }
  if (body.invoice_reminders_enabled !== undefined) {
    updates.push(`invoice_reminders_enabled = $${idx++}`);
    values.push(!!body.invoice_reminders_enabled);
  }
  if (body.service_reminders_enabled !== undefined) {
    updates.push(`service_reminders_enabled = $${idx++}`);
    values.push(!!body.service_reminders_enabled);
  }
  if (body.service_reminder_custom_email !== undefined) {
    const raw =
      typeof body.service_reminder_custom_email === 'string'
        ? (body.service_reminder_custom_email as string).trim()
        : '';
    updates.push(`service_reminder_custom_email = $${idx++}`);
    values.push(raw ? raw.toLowerCase() : null);
  }
  if (body.service_reminder_recipient_mode !== undefined) {
    const v = body.service_reminder_recipient_mode;
    if (v === null || v === '') {
      updates.push(`service_reminder_recipient_mode = $${idx++}`);
      values.push(null);
    } else if (typeof v === 'string' && SERVICE_REMINDER_RECIPIENT_MODES.has(v.trim())) {
      updates.push(`service_reminder_recipient_mode = $${idx++}`);
      values.push(v.trim());
    } else {
      return res.status(400).json({ message: 'Invalid service_reminder_recipient_mode' });
    }
  }
  if (str('lead_source') !== undefined) { updates.push(`lead_source = $${idx++}`); values.push(str('lead_source')); }
  if (body.price_book_id !== undefined) { updates.push(`price_book_id = $${idx++}`); values.push(typeof body.price_book_id === 'number' ? body.price_book_id : null); }
  if (str('w3w') !== undefined) { updates.push(`w3w = $${idx++}`); values.push(str('w3w')); }
  if (str('water_supply') !== undefined) { updates.push(`water_supply = $${idx++}`); values.push(str('water_supply')); }
  if (str('power_supply') !== undefined) { updates.push(`power_supply = $${idx++}`); values.push(str('power_supply')); }
  if (str('technical_notes') !== undefined) { updates.push(`technical_notes = $${idx++}`); values.push(str('technical_notes')); }

  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(id);
  const idParamIdx = idx;
  if (!isSuperAdmin) {
    values.push(userId);
    idx++;
  }
  const ownershipClause = isSuperAdmin ? '' : ` AND created_by = $${idParamIdx + 1}`;

  try {
    const result = await pool.query<DbCustomer>(
      `UPDATE customers SET ${updates.join(', ')} WHERE id = $${idParamIdx}${ownershipClause} RETURNING *`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    const c = result.rows[0];
    return res.json({
      customer: {
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone ?? null,
        company: c.company ?? null,
        address: c.address ?? null,
        city: c.city ?? null,
        region: c.region ?? null,
        country: c.country ?? null,
        status: c.status,
        last_contact: c.last_contact ? (c.last_contact as Date).toISOString() : null,
        notes: c.notes ?? null,
        customer_type_id: (c as any).customer_type_id ?? null,
        address_line_1: (c as any).address_line_1 ?? null,
        address_line_2: (c as any).address_line_2 ?? null,
        address_line_3: (c as any).address_line_3 ?? null,
        town: (c as any).town ?? null,
        county: (c as any).county ?? null,
        postcode: (c as any).postcode ?? null,
        landline: (c as any).landline ?? null,
        credit_days: (c as any).credit_days ?? null,
        contact_title: (c as any).contact_title ?? null,
        contact_first_name: (c as any).contact_first_name ?? null,
        contact_surname: (c as any).contact_surname ?? null,
        contact_position: (c as any).contact_position ?? null,
        contact_mobile: (c as any).contact_mobile ?? null,
        contact_landline: (c as any).contact_landline ?? null,
        contact_email: (c as any).contact_email ?? null,
        prefers_phone: !!(c as any).prefers_phone,
        prefers_sms: !!(c as any).prefers_sms,
        prefers_email: !!(c as any).prefers_email,
        prefers_letter: !!(c as any).prefers_letter,
        invoice_reminders_enabled: (c as any).invoice_reminders_enabled !== false,
        service_reminders_enabled: (c as any).service_reminders_enabled !== false,
        service_reminder_custom_email: (c as any).service_reminder_custom_email ?? null,
        service_reminder_recipient_mode: (c as any).service_reminder_recipient_mode ?? null,
        lead_source: (c as any).lead_source ?? null,
        price_book_id: (c as any).price_book_id ?? null,
        created_at: c.created_at,
        updated_at: c.updated_at,
        created_by: c.created_by,
      },
    });
  } catch (error) {
    console.error('Update customer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/customers/:id', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid customer id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const result = await pool.query(
      `DELETE FROM customers WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [id] : [id, userId],
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete customer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Officers (Admin only) ----------
const OFFICER_STATES = ['active', 'inactive', 'on_leave', 'suspended', 'archived'] as const;
const ACCESS_LEVELS = ['basic', 'standard', 'manager', 'admin', 'full'] as const;

app.get('/api/officers', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const stateFilter = typeof req.query.state === 'string' && OFFICER_STATES.includes(req.query.state as typeof OFFICER_STATES[number])
      ? req.query.state
      : '';
    const offset = (page - 1) * limit;
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const conditions: string[] = [];
    const countParams: unknown[] = [];
    const listParams: unknown[] = [];
    let p = 1;
    if (!isSuperAdmin) {
      conditions.push(`created_by = $${p++}`);
      countParams.push(userId);
      listParams.push(userId);
    }
    if (search) {
      conditions.push(`(full_name ILIKE $${p} OR email ILIKE $${p} OR role_position ILIKE $${p} OR department ILIKE $${p})`);
      countParams.push(`%${search}%`);
      listParams.push(`%${search}%`);
      p++;
    }
    if (stateFilter) {
      conditions.push(`state = $${p++}`);
      countParams.push(stateFilter);
      listParams.push(stateFilter);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    listParams.push(limit, offset);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM officers ${whereClause}`,
      countParams,
    );
    const limitIdx = listParams.length - 1;
    const offsetIdx = listParams.length;
    const listResult = await pool.query<DbOfficer & { has_mobile_login: boolean; permissions: unknown; linked_user_id: number | null }>(
      `SELECT id, full_name, role_position, department, phone, email, system_access_level, certifications, assigned_responsibilities, state, created_at, updated_at, created_by,
              permissions, linked_user_id,
              (password_hash IS NOT NULL OR linked_user_id IS NOT NULL) AS has_mobile_login
       FROM officers ${whereClause}
       ORDER BY full_name ASC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams,
    );

    const total = Number((countResult.rows[0] as { total: number }).total);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const ownerClause = isSuperAdmin ? '' : 'WHERE created_by = $1';
    const countParams2 = isSuperAdmin ? [] : [userId];
    const stateCounts: Record<string, number> = {};
    for (const s of OFFICER_STATES) {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS c FROM officers ${ownerClause} ${isSuperAdmin ? 'WHERE' : 'AND'} state = $${isSuperAdmin ? 1 : 2}`,
        isSuperAdmin ? [s] : [userId, s],
      );
      stateCounts[s] = Number((r.rows[0] as { c: number }).c);
    }

    const officers = listResult.rows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      role_position: r.role_position ?? null,
      department: r.department ?? null,
      phone: r.phone ?? null,
      email: r.email ?? null,
      system_access_level: r.system_access_level ?? null,
      certifications: r.certifications ?? null,
      assigned_responsibilities: r.assigned_responsibilities ?? null,
      state: r.state,
      created_at: (r.created_at as Date).toISOString(),
      updated_at: (r.updated_at as Date).toISOString(),
      created_by: r.created_by,
      has_mobile_login: !!r.has_mobile_login,
      permissions: permissionsFromDb(r.permissions),
      linked_user_id: r.linked_user_id ?? null,
    }));

    return res.json({
      officers,
      total,
      page,
      limit,
      totalPages,
      stateCounts,
    });
  } catch (error) {
    console.error('List officers error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/officers/list', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const result = await pool.query<DbOfficer>(
      `SELECT id, full_name, role_position, department, state
       FROM officers${isSuperAdmin ? '' : ' WHERE created_by = $1'}
       ORDER BY full_name ASC
       LIMIT 200`,
      isSuperAdmin ? [] : [userId],
    );
    const officers = result.rows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      role_position: r.role_position ?? null,
      department: r.department ?? null,
      state: r.state,
    }));
    return res.json({ officers });
  } catch (error) {
    console.error('List officers (minimal) error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/officers', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    full_name?: string;
    role_position?: string;
    department?: string;
    phone?: string;
    email?: string;
    system_access_level?: string;
    certifications?: string;
    assigned_responsibilities?: string;
    state?: string;
    /** Sets mobile app login (hashed); requires email. Min 8 characters. */
    initial_password?: string;
    permissions?: unknown;
    preset?: string;
  };
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  if (!fullName) return res.status(400).json({ message: 'Officer name is required' });
  const state = body.state && OFFICER_STATES.includes(body.state as typeof OFFICER_STATES[number])
    ? body.state
    : 'active';

  const rolePosition = typeof body.role_position === 'string' ? body.role_position.trim() || null : null;
  const department = typeof body.department === 'string' ? body.department.trim() || null : null;
  const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() || null : null;
  const systemAccessLevel = body.system_access_level && ACCESS_LEVELS.includes(body.system_access_level as typeof ACCESS_LEVELS[number])
    ? body.system_access_level
    : 'standard';
  const certifications = typeof body.certifications === 'string' ? body.certifications.trim() || null : null;
  const assignedResponsibilities = typeof body.assigned_responsibilities === 'string' ? body.assigned_responsibilities.trim() || null : null;
  const createdBy = getTenantScopeUserId(req.user!);

  const initialPassword = typeof body.initial_password === 'string' ? body.initial_password.trim() : '';
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  if (!initialPassword || initialPassword.length < 8) {
    return res.status(400).json({ message: 'Password is required and must be at least 8 characters' });
  }

  try {
    const dup = await pool.query(`SELECT id FROM officers WHERE LOWER(TRIM(email)) = $1`, [email]);
    if ((dup.rowCount ?? 0) > 0) {
      return res.status(409).json({ message: 'Another user already has this email' });
    }
    const dupUser = await pool.query(`SELECT id FROM users WHERE LOWER(TRIM(email)) = $1`, [email]);
    if ((dupUser.rowCount ?? 0) > 0) {
      return res.status(409).json({ message: 'This email is already used for a dashboard login' });
    }

    let offPerms = parsePermissionsBody(body.permissions ?? null);
    if (offPerms == null) {
      offPerms = presetFieldOfficerPermissions();
    }
    if (!Object.values(offPerms).some(Boolean)) {
      return res.status(400).json({ message: 'Select at least one permission for this field account' });
    }

    const passwordHash = await bcrypt.hash(initialPassword, 10);

    const result = await pool.query<DbOfficer>(
      `INSERT INTO officers (full_name, role_position, department, phone, email, system_access_level, certifications, assigned_responsibilities, state, created_by, password_hash, permissions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING id, full_name, role_position, department, phone, email, system_access_level, certifications, assigned_responsibilities, state, created_at, updated_at, created_by`,
      [
        fullName,
        rolePosition,
        department,
        phone,
        email,
        systemAccessLevel,
        certifications,
        assignedResponsibilities,
        state,
        createdBy,
        passwordHash,
        JSON.stringify(offPerms),
      ],
    );
    const r = result.rows[0];
    return res.status(201).json({
      officer: {
        id: r.id,
        full_name: r.full_name,
        role_position: r.role_position ?? null,
        department: r.department ?? null,
        phone: r.phone ?? null,
        email: r.email ?? null,
        system_access_level: r.system_access_level ?? null,
        certifications: r.certifications ?? null,
        assigned_responsibilities: r.assigned_responsibilities ?? null,
        state: r.state,
        created_at: (r.created_at as Date).toISOString(),
        updated_at: (r.updated_at as Date).toISOString(),
        created_by: r.created_by,
        has_mobile_login: !!(initialPassword && email),
        permissions: offPerms,
      },
    });
  } catch (error) {
    console.error('Create officer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/officers/:id', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid officer id' });

  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const ownershipCheck = isSuperAdmin ? '' : ' AND created_by = $1';

  const body = req.body as Record<string, unknown> & { initial_password?: string; clear_mobile_password?: boolean };
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : undefined);
  const strReq = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : undefined);

  if (body.clear_mobile_password === true) {
    updates.push(`password_hash = NULL`);
    updates.push(`password_reset_token = NULL`);
    updates.push(`password_reset_expires_at = NULL`);
  } else if (typeof body.initial_password === 'string' && body.initial_password.length > 0) {
    if (body.initial_password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const cur = await pool.query<{ email: string | null }>(`SELECT email FROM officers WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`, isSuperAdmin ? [id] : [id, userId]);
    if ((cur.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Officer not found' });
    const nextEmail = str('email') !== undefined ? str('email') : cur.rows[0].email;
    if (!nextEmail || !String(nextEmail).trim()) {
      return res.status(400).json({ message: 'Email is required to set a mobile password' });
    }
    const dup = await pool.query(`SELECT id FROM officers WHERE LOWER(TRIM(email)) = $1 AND id <> $2`, [String(nextEmail).trim().toLowerCase(), id]);
    if ((dup.rowCount ?? 0) > 0) {
      return res.status(409).json({ message: 'Another user already has this email' });
    }
    const hash = await bcrypt.hash(body.initial_password, 10);
    updates.push(`password_hash = $${idx++}`);
    values.push(hash);
    updates.push(`password_reset_token = NULL`);
    updates.push(`password_reset_expires_at = NULL`);
  }

  if (strReq('full_name') !== undefined) { updates.push(`full_name = $${idx++}`); values.push(strReq('full_name')); }
  if (str('role_position') !== undefined) { updates.push(`role_position = $${idx++}`); values.push(str('role_position')); }
  if (str('department') !== undefined) { updates.push(`department = $${idx++}`); values.push(str('department')); }
  if (str('phone') !== undefined) { updates.push(`phone = $${idx++}`); values.push(str('phone')); }
  if (str('email') !== undefined) { updates.push(`email = $${idx++}`); values.push(str('email')?.toLowerCase() ?? null); }
  if (body.system_access_level && ACCESS_LEVELS.includes(body.system_access_level as typeof ACCESS_LEVELS[number])) {
    updates.push(`system_access_level = $${idx++}`);
    values.push(body.system_access_level);
  }
  if (str('certifications') !== undefined) { updates.push(`certifications = $${idx++}`); values.push(str('certifications')); }
  if (str('assigned_responsibilities') !== undefined) { updates.push(`assigned_responsibilities = $${idx++}`); values.push(str('assigned_responsibilities')); }
  if (body.state && OFFICER_STATES.includes(body.state as typeof OFFICER_STATES[number])) {
    updates.push(`state = $${idx++}`);
    values.push(body.state);
  }
  if (body.permissions != null) {
    const parsed = parsePermissionsBody(body.permissions);
    if (parsed == null || !Object.values(parsed).some(Boolean)) {
      return res.status(400).json({ message: 'Invalid permissions' });
    }
    updates.push(`permissions = $${idx++}::jsonb`);
    values.push(JSON.stringify(parsed));
  }

  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(id);
  const idParamIdx = idx;
  if (!isSuperAdmin) {
    values.push(userId);
    idx++;
  }
  const ownershipClause = isSuperAdmin ? '' : ` AND created_by = $${idParamIdx + 1}`;

  try {
    if (str('email') !== undefined) {
      const newEm = str('email')?.trim().toLowerCase() ?? null;
      if (newEm) {
        const dup = await pool.query(`SELECT id FROM officers WHERE LOWER(TRIM(email)) = $1 AND id <> $2`, [newEm, id]);
        if ((dup.rowCount ?? 0) > 0) {
          return res.status(409).json({ message: 'Another user already has this email' });
        }
      }
    }

    const result = await pool.query<DbOfficer>(
      `UPDATE officers SET ${updates.join(', ')} WHERE id = $${idParamIdx}${ownershipClause} RETURNING *`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Officer not found' });
    const r = result.rows[0] as DbOfficer & { password_hash?: string | null };
    return res.json({
      officer: {
        id: r.id,
        full_name: r.full_name,
        role_position: r.role_position ?? null,
        department: r.department ?? null,
        phone: r.phone ?? null,
        email: r.email ?? null,
        system_access_level: r.system_access_level ?? null,
        certifications: r.certifications ?? null,
        assigned_responsibilities: r.assigned_responsibilities ?? null,
        state: r.state,
        created_at: (r.created_at as Date).toISOString(),
        updated_at: (r.updated_at as Date).toISOString(),
        created_by: r.created_by,
        has_mobile_login: !!r.password_hash || !!(r as { linked_user_id?: number | null }).linked_user_id,
        permissions: permissionsFromDb((r as { permissions?: unknown }).permissions),
        linked_user_id: (r as { linked_user_id?: number | null }).linked_user_id ?? null,
      },
    });
  } catch (error) {
    console.error('Update officer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/officers/:id', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid officer id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const result = await pool.query(
      `DELETE FROM officers WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [id] : [id, userId],
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Officer not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete officer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Certifications (Admin only) ----------
app.get('/api/certifications', authenticate, requireTenantCrmAccess('certifications'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, validity_months, reminder_days_before, created_at, updated_at
       FROM certifications
       ORDER BY name ASC`,
    );
    const certifications = result.rows.map((r: { id: number; name: string; description: string | null; validity_months: number; reminder_days_before: number; created_at: Date; updated_at: Date }) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      validity_months: r.validity_months,
      reminder_days_before: r.reminder_days_before,
      created_at: (r.created_at as Date).toISOString(),
      updated_at: (r.updated_at as Date).toISOString(),
    }));
    return res.json({ certifications });
  } catch (error) {
    console.error('List certifications error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/certifications', authenticate, requireTenantCrmAccess('certifications'), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as { name?: string; description?: string; validity_months?: number; reminder_days_before?: number };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ message: 'Certification name is required' });
  const validityMonths = typeof body.validity_months === 'number' && body.validity_months > 0 ? body.validity_months : 12;
  const reminderDays = typeof body.reminder_days_before === 'number' && body.reminder_days_before >= 0 ? body.reminder_days_before : 30;
  const description = typeof body.description === 'string' ? body.description.trim() || null : null;
  const createdBy = getTenantScopeUserId(req.user!);
  try {
    const r = await pool.query(
      `INSERT INTO certifications (name, description, validity_months, reminder_days_before, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, validity_months, reminder_days_before, created_at, updated_at`,
      [name, description, validityMonths, reminderDays, createdBy],
    );
    const row = r.rows[0] as { id: number; name: string; description: string | null; validity_months: number; reminder_days_before: number; created_at: Date; updated_at: Date };
    return res.status(201).json({
      certification: {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        validity_months: row.validity_months,
        reminder_days_before: row.reminder_days_before,
        created_at: (row.created_at as Date).toISOString(),
        updated_at: (row.updated_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Create certification error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/certifications/:id', authenticate, requireTenantCrmAccess('certifications'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid certification id' });
  const body = req.body as { name?: string; description?: string; validity_months?: number; reminder_days_before?: number };
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.push(`name = $${idx++}`);
    values.push(body.name.trim());
  }
  if (typeof body.description === 'string') {
    updates.push(`description = $${idx++}`);
    values.push(body.description.trim() || null);
  }
  if (typeof body.validity_months === 'number' && body.validity_months > 0) {
    updates.push(`validity_months = $${idx++}`);
    values.push(body.validity_months);
  }
  if (typeof body.reminder_days_before === 'number' && body.reminder_days_before >= 0) {
    updates.push(`reminder_days_before = $${idx++}`);
    values.push(body.reminder_days_before);
  }
  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(id);
  try {
    const r = await pool.query(
      `UPDATE certifications SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, description, validity_months, reminder_days_before, created_at, updated_at`,
      values,
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Certification not found' });
    const row = r.rows[0] as { id: number; name: string; description: string | null; validity_months: number; reminder_days_before: number; created_at: Date; updated_at: Date };
    return res.json({
      certification: {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        validity_months: row.validity_months,
        reminder_days_before: row.reminder_days_before,
        created_at: (row.created_at as Date).toISOString(),
        updated_at: (row.updated_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Update certification error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/certifications/:id', authenticate, requireTenantCrmAccess('certifications'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid certification id' });
  try {
    const result = await pool.query('DELETE FROM certifications WHERE id = $1', [id]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Certification not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete certification error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/officers/:id/certifications', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  const officerId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(officerId)) return res.status(400).json({ message: 'Invalid officer id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const officerCheck = await pool.query(
      `SELECT id FROM officers WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [officerId] : [officerId, userId],
    );
    if ((officerCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Officer not found' });
    const result = await pool.query(
      `SELECT oc.id, oc.officer_id, oc.certification_id, oc.issued_date, oc.expiry_date, oc.certificate_number, oc.issued_by, oc.notes, oc.created_at,
        c.name AS certification_name, c.validity_months, c.reminder_days_before
       FROM officer_certifications oc
       JOIN certifications c ON c.id = oc.certification_id
       WHERE oc.officer_id = $1
       ORDER BY oc.expiry_date ASC`,
      [officerId],
    );
    const today = new Date().toISOString().slice(0, 10);
    const assignments = result.rows.map((row: { id: number; officer_id: number; certification_id: number; issued_date: Date; expiry_date: Date; certificate_number: string | null; issued_by: string | null; notes: string | null; created_at: Date; certification_name: string; validity_months: number; reminder_days_before: number }) => {
      const expiry = (row.expiry_date as Date).toISOString().slice(0, 10);
      const issued = (row.issued_date as Date).toISOString().slice(0, 10);
      let status: 'valid' | 'expiring_soon' | 'expired' = 'valid';
      if (expiry < today) status = 'expired';
      else {
        const expDate = new Date(expiry);
        const reminderDate = new Date(expDate);
        reminderDate.setDate(reminderDate.getDate() - row.reminder_days_before);
        if (reminderDate.toISOString().slice(0, 10) <= today) status = 'expiring_soon';
      }
      return {
        id: row.id,
        officer_id: row.officer_id,
        certification_id: row.certification_id,
        certification_name: row.certification_name,
        issued_date: issued,
        expiry_date: expiry,
        certificate_number: row.certificate_number ?? null,
        issued_by: row.issued_by ?? null,
        notes: row.notes ?? null,
        status,
        created_at: (row.created_at as Date).toISOString(),
      };
    });
    return res.json({ assignments });
  } catch (error) {
    console.error('List officer certifications error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/officers/:id/certifications', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  const officerId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(officerId)) return res.status(400).json({ message: 'Invalid officer id' });
  const body = req.body as { certification_id: number; issued_date?: string; expiry_date?: string; certificate_number?: string; issued_by?: string; notes?: string };
  const certId = typeof body.certification_id === 'number' && Number.isFinite(body.certification_id) ? body.certification_id : null;
  if (!certId) return res.status(400).json({ message: 'certification_id is required' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const officerCheck = await pool.query(
      `SELECT id FROM officers WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [officerId] : [officerId, userId],
    );
    if ((officerCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Officer not found' });
    const certCheck = await pool.query('SELECT id, validity_months FROM certifications WHERE id = $1', [certId]);
    if ((certCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Certification not found' });
    const validityMonths = (certCheck.rows[0] as { validity_months: number }).validity_months;
    const issuedDate = typeof body.issued_date === 'string' && body.issued_date ? body.issued_date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    let expiryDate = typeof body.expiry_date === 'string' ? body.expiry_date.slice(0, 10) : null;
    if (!expiryDate) {
      const d = new Date(issuedDate);
      d.setMonth(d.getMonth() + validityMonths);
      expiryDate = d.toISOString().slice(0, 10);
    }
    const certNumber = typeof body.certificate_number === 'string' ? body.certificate_number.trim() || null : null;
    const issuedBy = typeof body.issued_by === 'string' ? body.issued_by.trim() || null : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
    const r = await pool.query(
      `INSERT INTO officer_certifications (officer_id, certification_id, issued_date, expiry_date, certificate_number, issued_by, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, officer_id, certification_id, issued_date, expiry_date, certificate_number, issued_by, notes, created_at`,
      [officerId, certId, issuedDate, expiryDate, certNumber, issuedBy, notes, userId],
    );
    const row = r.rows[0] as { id: number; officer_id: number; certification_id: number; issued_date: Date; expiry_date: Date; certificate_number: string | null; issued_by: string | null; notes: string | null; created_at: Date };
    const certName = (certCheck.rows[0] as { name: string }).name;
    const today = new Date().toISOString().slice(0, 10);
    const expiry = (row.expiry_date as Date).toISOString().slice(0, 10);
    let status: 'valid' | 'expiring_soon' | 'expired' = 'valid';
    if (expiry < today) status = 'expired';
    else {
      const expDate = new Date(expiry);
      const reminderDate = new Date(expDate);
      reminderDate.setDate(reminderDate.getDate() - 30);
      if (reminderDate.toISOString().slice(0, 10) <= today) status = 'expiring_soon';
    }
    return res.status(201).json({
      assignment: {
        id: row.id,
        officer_id: row.officer_id,
        certification_id: row.certification_id,
        certification_name: certName,
        issued_date: (row.issued_date as Date).toISOString().slice(0, 10),
        expiry_date: expiry,
        certificate_number: row.certificate_number ?? null,
        issued_by: row.issued_by ?? null,
        notes: row.notes ?? null,
        status,
        created_at: (row.created_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Assign certification error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/officer-certifications/:id', authenticate, requireTenantCrmAccess('certifications'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid assignment id' });
  const body = req.body as { issued_date?: string; expiry_date?: string; certificate_number?: string; issued_by?: string; notes?: string };
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (typeof body.issued_date === 'string' && body.issued_date) {
    updates.push(`issued_date = $${idx++}`);
    values.push(body.issued_date.slice(0, 10));
  }
  if (typeof body.expiry_date === 'string' && body.expiry_date) {
    updates.push(`expiry_date = $${idx++}`);
    values.push(body.expiry_date.slice(0, 10));
  }
  if (typeof body.certificate_number === 'string') {
    updates.push(`certificate_number = $${idx++}`);
    values.push(body.certificate_number.trim() || null);
  }
  if (typeof body.issued_by === 'string') {
    updates.push(`issued_by = $${idx++}`);
    values.push(body.issued_by.trim() || null);
  }
  if (typeof body.notes === 'string') {
    updates.push(`notes = $${idx++}`);
    values.push(body.notes.trim() || null);
  }
  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
  values.push(id);
  try {
    const r = await pool.query(
      `UPDATE officer_certifications oc SET ${updates.join(', ')}
       FROM certifications c
       WHERE oc.id = $${idx} AND oc.certification_id = c.id
       RETURNING oc.id, oc.officer_id, oc.certification_id, oc.issued_date, oc.expiry_date, oc.certificate_number, oc.issued_by, oc.notes, oc.created_at, c.name AS certification_name, c.reminder_days_before`,
      values,
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Assignment not found' });
    const row = r.rows[0] as { id: number; officer_id: number; certification_id: number; issued_date: Date; expiry_date: Date; certificate_number: string | null; issued_by: string | null; notes: string | null; created_at: Date; certification_name: string; reminder_days_before: number };
    const today = new Date().toISOString().slice(0, 10);
    const expiry = (row.expiry_date as Date).toISOString().slice(0, 10);
    let status: 'valid' | 'expiring_soon' | 'expired' = 'valid';
    if (expiry < today) status = 'expired';
    else {
      const expDate = new Date(expiry);
      const reminderDate = new Date(expDate);
      reminderDate.setDate(reminderDate.getDate() - row.reminder_days_before);
      if (reminderDate.toISOString().slice(0, 10) <= today) status = 'expiring_soon';
    }
    return res.json({
      assignment: {
        id: row.id,
        officer_id: row.officer_id,
        certification_id: row.certification_id,
        certification_name: row.certification_name,
        issued_date: (row.issued_date as Date).toISOString().slice(0, 10),
        expiry_date: expiry,
        certificate_number: row.certificate_number ?? null,
        issued_by: row.issued_by ?? null,
        notes: row.notes ?? null,
        status,
        created_at: (row.created_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Update officer certification error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/officer-certifications/:id', authenticate, requireTenantCrmAccess('certifications'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(404).json({ message: 'Invalid id' });
  try {
    const result = await pool.query('DELETE FROM officer_certifications WHERE id = $1', [id]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Assignment not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete officer certification error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/officers/:id/staff-reminders', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  const officerId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(officerId)) return res.status(400).json({ message: 'Invalid officer id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const officerCheck = await pool.query(
      `SELECT id FROM officers WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [officerId] : [officerId, userId],
    );
    if ((officerCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Officer not found' });
    const r = await pool.query(
      `SELECT id, officer_id, reminder_message, due_date::text AS due_date, notify_at::text AS notify_at,
              extra_notify_emails, last_notified_at, created_at, updated_at
       FROM officer_staff_reminders WHERE officer_id = $1 ORDER BY notify_at ASC, id ASC`,
      [officerId],
    );
    return res.json({
      reminders: r.rows.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        officer_id: Number(row.officer_id),
        reminder_message: String(row.reminder_message ?? ''),
        due_date: String(row.due_date ?? ''),
        notify_at: String(row.notify_at ?? ''),
        extra_notify_emails: (row.extra_notify_emails as string) ?? null,
        last_notified_at: row.last_notified_at ? (row.last_notified_at as Date).toISOString() : null,
        created_at: (row.created_at as Date).toISOString(),
        updated_at: (row.updated_at as Date).toISOString(),
      })),
    });
  } catch (error) {
    console.error('List staff reminders error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/officers/:id/staff-reminders', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  const officerId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(officerId)) return res.status(400).json({ message: 'Invalid officer id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as { reminder_message?: string; due_date?: string; notify_at?: string; extra_notify_emails?: string | null };
  const message = typeof body.reminder_message === 'string' ? body.reminder_message.trim() : '';
  const dueRaw = typeof body.due_date === 'string' ? body.due_date.trim().slice(0, 10) : '';
  const notifyRaw = typeof body.notify_at === 'string' ? body.notify_at.trim().slice(0, 10) : '';
  if (!message) return res.status(400).json({ message: 'reminder_message is required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(notifyRaw)) {
    return res.status(400).json({ message: 'due_date and notify_at must be YYYY-MM-DD' });
  }
  if (notifyRaw > dueRaw) {
    return res.status(400).json({ message: 'notify_at must be on or before due_date' });
  }
  const extras = typeof body.extra_notify_emails === 'string' ? body.extra_notify_emails.trim() || null : null;
  try {
    const officerCheck = await pool.query(
      `SELECT id FROM officers WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [officerId] : [officerId, userId],
    );
    if ((officerCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Officer not found' });
    const ins = await pool.query(
      `INSERT INTO officer_staff_reminders (officer_id, reminder_message, due_date, notify_at, extra_notify_emails, created_by)
       VALUES ($1, $2, $3::date, $4::date, $5, $6)
       RETURNING id, officer_id, reminder_message, due_date::text AS due_date, notify_at::text AS notify_at,
                 extra_notify_emails, last_notified_at, created_at, updated_at`,
      [officerId, message, dueRaw, notifyRaw, extras, userId],
    );
    const row = ins.rows[0] as Record<string, unknown>;
    return res.status(201).json({
      reminder: {
        id: Number(row.id),
        officer_id: Number(row.officer_id),
        reminder_message: String(row.reminder_message ?? ''),
        due_date: String(row.due_date ?? ''),
        notify_at: String(row.notify_at ?? ''),
        extra_notify_emails: (row.extra_notify_emails as string) ?? null,
        last_notified_at: row.last_notified_at ? (row.last_notified_at as Date).toISOString() : null,
        created_at: (row.created_at as Date).toISOString(),
        updated_at: (row.updated_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Create staff reminder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/officers/:id/staff-reminders/:reminderId', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  const officerId = parseInt(String(req.params.id), 10);
  const reminderId = parseInt(String(req.params.reminderId), 10);
  if (!Number.isFinite(officerId) || !Number.isFinite(reminderId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as { reminder_message?: string; due_date?: string; notify_at?: string; extra_notify_emails?: string | null };
  try {
    const existing = await pool.query<{ last_notified_at: Date | null }>(
      `SELECT sr.last_notified_at FROM officer_staff_reminders sr
       JOIN officers o ON o.id = sr.officer_id
       WHERE sr.id = $1 AND sr.officer_id = $2${isSuperAdmin ? '' : ' AND o.created_by = $3'}`,
      isSuperAdmin ? [reminderId, officerId] : [reminderId, officerId, userId],
    );
    if ((existing.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Reminder not found' });
    const alreadySent = existing.rows[0].last_notified_at != null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (typeof body.reminder_message === 'string') {
      updates.push(`reminder_message = $${idx++}`);
      values.push(body.reminder_message.trim());
    }
    if (!alreadySent) {
      if (typeof body.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date.trim())) {
        updates.push(`due_date = $${idx++}`);
        values.push(body.due_date.trim().slice(0, 10));
      }
      if (typeof body.notify_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.notify_at.trim())) {
        updates.push(`notify_at = $${idx++}`);
        values.push(body.notify_at.trim().slice(0, 10));
      }
      if (body.extra_notify_emails !== undefined) {
        updates.push(`extra_notify_emails = $${idx++}`);
        values.push(typeof body.extra_notify_emails === 'string' ? body.extra_notify_emails.trim() || null : null);
      }
    } else if (body.due_date !== undefined || body.notify_at !== undefined || body.extra_notify_emails !== undefined) {
      return res.status(400).json({ message: 'Cannot change dates or extra emails after notification was sent' });
    }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const whereIdIdx = values.length + 1;
    const whereOffIdx = values.length + 2;
    values.push(reminderId, officerId);
    const r = await pool.query(
      `UPDATE officer_staff_reminders sr SET ${updates.join(', ')}
       FROM officers o
       WHERE sr.id = $${whereIdIdx} AND sr.officer_id = $${whereOffIdx} AND sr.officer_id = o.id
       RETURNING sr.id, sr.officer_id, sr.reminder_message, sr.due_date::text AS due_date, sr.notify_at::text AS notify_at,
                 sr.extra_notify_emails, sr.last_notified_at, sr.created_at, sr.updated_at`,
      values,
    );
    const row = r.rows[0] as Record<string, unknown>;
    const dueD = String(row.due_date ?? '');
    const notifyD = String(row.notify_at ?? '');
    if (notifyD > dueD) {
      return res.status(400).json({ message: 'notify_at must be on or before due_date' });
    }
    return res.json({
      reminder: {
        id: Number(row.id),
        officer_id: Number(row.officer_id),
        reminder_message: String(row.reminder_message ?? ''),
        due_date: dueD,
        notify_at: notifyD,
        extra_notify_emails: (row.extra_notify_emails as string) ?? null,
        last_notified_at: row.last_notified_at ? (row.last_notified_at as Date).toISOString() : null,
        created_at: (row.created_at as Date).toISOString(),
        updated_at: (row.updated_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Patch staff reminder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/officers/:id/staff-reminders/:reminderId', authenticate, requireAdmin, requirePermission('field_users'), async (req: AuthenticatedRequest, res: Response) => {
  const officerId = parseInt(String(req.params.id), 10);
  const reminderId = parseInt(String(req.params.reminderId), 10);
  if (!Number.isFinite(officerId) || !Number.isFinite(reminderId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const result = await pool.query(
      `DELETE FROM officer_staff_reminders sr USING officers o
       WHERE sr.id = $1 AND sr.officer_id = $2 AND sr.officer_id = o.id${isSuperAdmin ? '' : ' AND o.created_by = $3'}`,
      isSuperAdmin ? [reminderId, officerId] : [reminderId, officerId, userId],
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Reminder not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete staff reminder error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/officer-certifications/:id', authenticate, requireTenantCrmAccess('certifications'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const result = await pool.query(
      `SELECT oc.id, oc.officer_id, oc.certification_id, oc.issued_date, oc.expiry_date, oc.certificate_number, oc.issued_by, oc.notes,
        o.full_name AS officer_name, o.role_position AS officer_role, o.department AS officer_department,
        c.name AS certification_name, c.description AS certification_description
       FROM officer_certifications oc
       JOIN officers o ON o.id = oc.officer_id
       JOIN certifications c ON c.id = oc.certification_id
       WHERE oc.id = $1${isSuperAdmin ? '' : ' AND o.created_by = $2'}`,
      isSuperAdmin ? [id] : [id, userId],
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Certificate not found' });
    const row = result.rows[0] as { id: number; officer_id: number; certification_id: number; issued_date: Date; expiry_date: Date; certificate_number: string | null; issued_by: string | null; notes: string | null; officer_name: string; officer_role: string | null; officer_department: string | null; certification_name: string; certification_description: string | null };
    const settings = await getInvoiceSettings(userId);
    return res.json({
      certificate: {
        id: row.id,
        officer_id: row.officer_id,
        officer_name: row.officer_name,
        officer_role: row.officer_role ?? null,
        officer_department: row.officer_department ?? null,
        certification_id: row.certification_id,
        certification_name: row.certification_name,
        certification_description: row.certification_description ?? null,
        issued_date: (row.issued_date as Date).toISOString().slice(0, 10),
        expiry_date: (row.expiry_date as Date).toISOString().slice(0, 10),
        certificate_number: row.certificate_number ?? null,
        issued_by: row.issued_by ?? null,
        notes: row.notes ?? null,
      },
      company: {
        company_name: settings.company_name,
        company_address: settings.company_address ?? null,
        company_phone: settings.company_phone ?? null,
        company_email: settings.company_email ?? null,
        company_logo: settings.company_logo ?? null,
        company_website: settings.company_website ?? null,
      },
    });
  } catch (error) {
    console.error('Get certificate error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/certifications/compliance', authenticate, requireTenantCrmAccess('certifications'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const today = new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `SELECT oc.id, oc.officer_id, oc.certification_id, oc.issued_date, oc.expiry_date, oc.certificate_number,
        o.full_name AS officer_name, o.email AS officer_email, o.department,
        c.name AS certification_name, c.reminder_days_before
       FROM officer_certifications oc
       JOIN officers o ON o.id = oc.officer_id
       JOIN certifications c ON c.id = oc.certification_id
       ${isSuperAdmin ? '' : 'WHERE o.created_by = $1'}
       ORDER BY oc.expiry_date ASC`,
      isSuperAdmin ? [] : [userId],
    );
    const expiringSoon: { id: number; officer_name: string; officer_email: string | null; certification_name: string; expiry_date: string; days_remaining: number }[] = [];
    const expired: { id: number; officer_name: string; officer_email: string | null; certification_name: string; expiry_date: string; days_overdue: number }[] = [];
    const valid: { id: number; officer_name: string; certification_name: string; expiry_date: string }[] = [];
    for (const row of result.rows as { id: number; officer_id: number; certification_id: number; issued_date: Date; expiry_date: Date; certificate_number: string | null; officer_name: string; officer_email: string | null; department: string | null; certification_name: string; reminder_days_before: number }[]) {
      const expiry = (row.expiry_date as Date).toISOString().slice(0, 10);
      const officerName = row.officer_name;
      const certName = row.certification_name;
      const officerEmail = row.officer_email ?? null;
      if (expiry < today) {
        const expDate = new Date(expiry);
        const daysOverdue = Math.floor((Date.now() - expDate.getTime()) / (24 * 60 * 60 * 1000));
        expired.push({ id: row.id, officer_name: officerName, officer_email: officerEmail, certification_name: certName, expiry_date: expiry, days_overdue: daysOverdue });
      } else {
        const expDate = new Date(expiry);
        const daysRemaining = Math.floor((expDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        const reminderDate = new Date(expDate);
        reminderDate.setDate(reminderDate.getDate() - row.reminder_days_before);
        if (reminderDate.toISOString().slice(0, 10) <= today) {
          expiringSoon.push({ id: row.id, officer_name: officerName, officer_email: officerEmail, certification_name: certName, expiry_date: expiry, days_remaining: daysRemaining });
        } else {
          valid.push({ id: row.id, officer_name: officerName, certification_name: certName, expiry_date: expiry });
        }
      }
    }
    return res.json({
      expiring_soon: expiringSoon,
      expired,
      valid,
      summary: {
        expiring_soon_count: expiringSoon.length,
        expired_count: expired.length,
        valid_count: valid.length,
      },
    });
  } catch (error) {
    console.error('Compliance report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Jobs (Admin only) ----------
const JOB_STATES = ['draft', 'created', 'unscheduled', 'scheduled', 'assigned', 'rescheduled', 'dispatched', 'in_progress', 'paused', 'completed', 'closed'] as const;
const JOB_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

app.get('/api/jobs', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const stateFilter = typeof req.query.state === 'string' && JOB_STATES.includes(req.query.state as typeof JOB_STATES[number])
      ? req.query.state
      : '';
    const customerId = typeof req.query.customer_id === 'string' ? parseInt(req.query.customer_id, 10) : null;
    const priorityFilter = typeof req.query.priority === 'string' && JOB_PRIORITIES.includes(req.query.priority as typeof JOB_PRIORITIES[number])
      ? req.query.priority
      : '';
    const offset = (page - 1) * limit;
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const conditions: string[] = [];
    const countParams: unknown[] = [];
    const listParams: unknown[] = [];
    let p = 1;
    if (!isSuperAdmin) {
      conditions.push(`j.created_by = $${p++}`);
      countParams.push(userId);
      listParams.push(userId);
    }
    if (search) {
      conditions.push(`(j.title ILIKE $${p} OR j.description ILIKE $${p} OR j.responsible_person ILIKE $${p} OR o.full_name ILIKE $${p})`);
      countParams.push(`%${search}%`);
      listParams.push(`%${search}%`);
      p++;
    }
    if (stateFilter) {
      conditions.push(`j.state = $${p++}`);
      countParams.push(stateFilter);
      listParams.push(stateFilter);
    }
    if (customerId && Number.isFinite(customerId)) {
      conditions.push(`j.customer_id = $${p++}`);
      countParams.push(customerId);
      listParams.push(customerId);
    }
    if (priorityFilter) {
      conditions.push(`j.priority = $${p++}`);
      countParams.push(priorityFilter);
      listParams.push(priorityFilter);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const joinClause = `LEFT JOIN customers c ON c.id = j.customer_id LEFT JOIN officers o ON o.id = j.officer_id`;
    listParams.push(limit, offset);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM jobs j ${joinClause} ${whereClause}`,
      countParams,
    );
    const limitIdx = listParams.length - 1;
    const offsetIdx = listParams.length;
    const listResult = await pool.query<DbJob & { customer_full_name?: string; officer_full_name?: string }>(
      `SELECT j.id, j.title, j.description, j.priority, j.responsible_person, j.officer_id, j.start_date, j.deadline,
        j.customer_id, j.location, j.required_certifications, j.attachments, j.state,
        j.schedule_start, j.duration_minutes, j.scheduling_notes, j.dispatched_at,
        j.created_at, j.updated_at, j.created_by,
        c.full_name AS customer_full_name,
        o.full_name AS officer_full_name
       FROM jobs j
       ${joinClause}
       ${whereClause}
       ORDER BY j.updated_at DESC NULLS LAST, j.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams,
    );

    const total = Number((countResult.rows[0] as { total: number }).total);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const ownerClause = isSuperAdmin ? '' : 'WHERE created_by = $1';
    const countParams2 = isSuperAdmin ? [] : [userId];
    const stateCounts: Record<string, number> = {};
    for (const s of JOB_STATES) {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS c FROM jobs ${ownerClause} ${isSuperAdmin ? 'WHERE' : 'AND'} state = $${isSuperAdmin ? 1 : 2}`,
        isSuperAdmin ? [s] : [userId, s],
      );
      stateCounts[s] = Number((r.rows[0] as { c: number }).c);
    }

    const jobs = listResult.rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? null,
      priority: r.priority,
      responsible_person: r.responsible_person ?? null,
      officer_id: r.officer_id ?? null,
      officer_full_name: (r as { officer_full_name?: string }).officer_full_name ?? null,
      start_date: r.start_date ? (r.start_date as Date).toISOString() : null,
      deadline: r.deadline ? (r.deadline as Date).toISOString() : null,
      customer_id: r.customer_id ?? null,
      customer_full_name: r.customer_full_name ?? null,
      location: r.location ?? null,
      required_certifications: r.required_certifications ?? null,
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      state: r.state,
      schedule_start: r.schedule_start ? (r.schedule_start as Date).toISOString() : null,
      duration_minutes: r.duration_minutes ?? null,
      scheduling_notes: r.scheduling_notes ?? null,
      dispatched_at: r.dispatched_at ? (r.dispatched_at as Date).toISOString() : null,
      created_at: (r.created_at as Date).toISOString(),
      updated_at: (r.updated_at as Date).toISOString(),
      created_by: r.created_by,
    }));

    return res.json({
      jobs,
      total,
      page,
      limit,
      totalPages,
      stateCounts,
    });
  } catch (error) {
    console.error('List jobs error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/jobs/:id', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const result = await pool.query<
      DbJob & {
        customer_full_name?: string;
        customer_email?: string;
        customer_phone?: string | null;
        customer_address?: string;
        officer_full_name?: string;
        description_name?: string;
        job_contact_join_id?: number | null;
        job_contact_title?: string | null;
        job_contact_first_name?: string | null;
        job_contact_surname?: string | null;
        job_contact_email?: string | null;
        job_contact_mobile?: string | null;
        job_contact_landline?: string | null;
        site_contact_name?: string | null;
        site_contact_email?: string | null;
        site_contact_phone?: string | null;
        job_wa_name?: string | null;
        job_wa_branch_name?: string | null;
        job_wa_address_line_1?: string | null;
        job_wa_town?: string | null;
        job_wa_postcode?: string | null;
      }
    >(
      `SELECT j.*, c.full_name AS customer_full_name, c.email AS customer_email,
              COALESCE(NULLIF(TRIM(c.contact_mobile), ''), NULLIF(TRIM(c.phone), '')) AS customer_phone,
              (c.address_line_1 || ', ' || COALESCE(c.town, '') || ', ' || COALESCE(c.postcode, '')) AS customer_address,
              o.full_name AS officer_full_name, jd.name AS description_name,
              jc.id AS job_contact_join_id, jc.title AS job_contact_title, jc.first_name AS job_contact_first_name,
              jc.surname AS job_contact_surname, jc.email AS job_contact_email, jc.mobile AS job_contact_mobile, jc.landline AS job_contact_landline,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', jc.title, jc.first_name, jc.surname)), ''),
                NULLIF(TRIM(j.contact_name), ''),
                c.full_name
              ) AS site_contact_name,
              COALESCE(NULLIF(TRIM(jc.email), ''), c.email) AS site_contact_email,
              COALESCE(
                CASE WHEN jc.id IS NOT NULL THEN COALESCE(NULLIF(TRIM(jc.mobile), ''), NULLIF(TRIM(jc.landline), '')) END,
                COALESCE(NULLIF(TRIM(c.contact_mobile), ''), NULLIF(TRIM(c.phone), ''))
              ) AS site_contact_phone,
              wa.name AS job_wa_name,
              wa.branch_name AS job_wa_branch_name,
              wa.address_line_1 AS job_wa_address_line_1,
              wa.town AS job_wa_town,
              wa.postcode AS job_wa_postcode
       FROM jobs j
       LEFT JOIN customers c ON c.id = j.customer_id
       LEFT JOIN customer_contacts jc ON jc.id = j.job_contact_id
       LEFT JOIN officers o ON o.id = j.officer_id
       LEFT JOIN job_descriptions jd ON jd.id = j.job_description_id
       LEFT JOIN customer_work_addresses wa ON wa.id = j.work_address_id AND wa.customer_id = j.customer_id
       WHERE j.id = $1${isSuperAdmin ? '' : ' AND j.created_by = $2'}`,
      isSuperAdmin ? [id] : [id, userId],
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    const r = result.rows[0];

    // Fetch pricing items for this specific job
    const pItems = await pool.query('SELECT * FROM job_pricing_items WHERE job_id=$1 ORDER BY sort_order', [id]);

    const {
      job_contact_join_id,
      job_contact_title,
      job_contact_first_name,
      job_contact_surname,
      job_contact_email,
      job_contact_mobile,
      job_contact_landline,
      site_contact_name,
      site_contact_email,
      site_contact_phone,
      job_wa_name,
      job_wa_branch_name,
      job_wa_address_line_1,
      job_wa_town,
      job_wa_postcode,
      ...jobRest
    } = r;
    const job_contact =
      job_contact_join_id != null
        ? {
            id: Number(job_contact_join_id),
            title: job_contact_title ?? null,
            first_name: job_contact_first_name ?? null,
            surname: (job_contact_surname as string) ?? '',
            email: job_contact_email ?? null,
            mobile: job_contact_mobile ?? null,
            landline: job_contact_landline ?? null,
          }
        : null;

    const waIdRaw = jobRest.work_address_id as number | null | undefined;
    const workAddress =
      waIdRaw != null && Number.isFinite(Number(waIdRaw))
        ? {
            id: Number(waIdRaw),
            name:
              job_wa_name != null && String(job_wa_name).trim() !== ''
                ? String(job_wa_name).trim()
                : 'Work site',
            branch_name: job_wa_branch_name != null && String(job_wa_branch_name).trim() !== '' ? String(job_wa_branch_name).trim() : null,
            address_line_1: job_wa_address_line_1 != null && String(job_wa_address_line_1).trim() !== '' ? String(job_wa_address_line_1).trim() : null,
            town: job_wa_town != null && String(job_wa_town).trim() !== '' ? String(job_wa_town).trim() : null,
            postcode: job_wa_postcode != null && String(job_wa_postcode).trim() !== '' ? String(job_wa_postcode).trim() : null,
          }
        : null;

    return res.json({
      job: {
        ...jobRest,
        start_date: jobRest.start_date ? (jobRest.start_date as Date).toISOString() : null,
        deadline: jobRest.deadline ? (jobRest.deadline as Date).toISOString() : null,
        created_at: (jobRest.created_at as Date).toISOString(),
        updated_at: (jobRest.updated_at as Date).toISOString(),
        schedule_start: jobRest.schedule_start ? (jobRest.schedule_start as Date).toISOString() : null,
        expected_completion: jobRest.expected_completion ? (jobRest.expected_completion as Date).toISOString() : null,
        job_contact,
        site_contact_name: site_contact_name ?? null,
        site_contact_email: site_contact_email ?? null,
        site_contact_phone: site_contact_phone ?? null,
        work_address: workAddress,
        pricing_items: pItems.rows,
      },
    });
  } catch (error) {
    console.error('Get job error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/jobs', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    title?: string;
    description?: string;
    priority?: string;
    responsible_person?: string;
    officer_id?: number;
    start_date?: string;
    deadline?: string;
    customer_id?: number;
    location?: string;
    required_certifications?: string;
    attachments?: unknown[];
    state?: string;
    completed_service_items?: unknown;
  };
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return res.status(400).json({ message: 'Job title is required' });
  const priority = body.priority && JOB_PRIORITIES.includes(body.priority as typeof JOB_PRIORITIES[number])
    ? body.priority
    : 'medium';
  const state = body.state && JOB_STATES.includes(body.state as typeof JOB_STATES[number])
    ? body.state
    : 'draft';

  const description = typeof body.description === 'string' ? body.description.trim() || null : null;
  const responsiblePerson = typeof body.responsible_person === 'string' ? body.responsible_person.trim() || null : null;
  const officerId = typeof body.officer_id === 'number' && Number.isFinite(body.officer_id) ? body.officer_id : null;
  const startDate = body.start_date ? new Date(body.start_date) : null;
  const deadline = body.deadline ? new Date(body.deadline) : null;
  const customerId = typeof body.customer_id === 'number' && Number.isFinite(body.customer_id) ? body.customer_id : null;
  const location = typeof body.location === 'string' ? body.location.trim() || null : null;
  const requiredCertifications = typeof body.required_certifications === 'string' ? body.required_certifications.trim() || null : null;
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const completedServiceItems = normalizeCompletedServiceItemsForDb(body.completed_service_items);
  const createdBy = getTenantScopeUserId(req.user!);

  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  if (customerId && !isSuperAdmin) {
    const custCheck = await pool.query('SELECT id FROM customers WHERE id = $1 AND created_by = $2', [customerId, userId]);
    if ((custCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid customer' });
  }
  if (officerId && !isSuperAdmin) {
    const offCheck = await pool.query('SELECT id FROM officers WHERE id = $1 AND created_by = $2', [officerId, userId]);
    if ((offCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid officer' });
  }

  try {
    const result = await pool.query<DbJob>(
      `INSERT INTO jobs (title, description, priority, responsible_person, officer_id, start_date, deadline, customer_id, location, required_certifications, attachments, state, created_by, completed_service_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, title, description, priority, responsible_person, officer_id, start_date, deadline, customer_id, location, required_certifications, attachments, state, created_at, updated_at, created_by, completed_service_items`,
      [title, description, priority, responsiblePerson, officerId, startDate, deadline, customerId, location, requiredCertifications, JSON.stringify(attachments), state, createdBy, JSON.stringify(completedServiceItems)],
    );
    const r = result.rows[0];
    try {
      await seedJobReportQuestionsForNewJob(r.id, null);
    } catch (e) {
      console.error('Seed job report questions for new job:', e);
    }
    return res.status(201).json({
      job: {
        id: r.id,
        title: r.title,
        description: r.description ?? null,
        priority: r.priority,
        responsible_person: r.responsible_person ?? null,
        officer_id: r.officer_id ?? null,
        start_date: r.start_date ? (r.start_date as Date).toISOString() : null,
        deadline: r.deadline ? (r.deadline as Date).toISOString() : null,
        customer_id: r.customer_id ?? null,
        location: r.location ?? null,
        required_certifications: r.required_certifications ?? null,
        attachments: Array.isArray(r.attachments) ? r.attachments : [],
        state: r.state,
        created_at: (r.created_at as Date).toISOString(),
        updated_at: (r.updated_at as Date).toISOString(),
        created_by: r.created_by,
        completed_service_items: Array.isArray(r.completed_service_items) ? r.completed_service_items : [],
      },
    });
  } catch (error) {
    console.error('Create job error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/jobs/:id', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid job id' });

  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const body = req.body as Record<string, unknown>;
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : undefined);
  const strReq = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : undefined);
  if (strReq('title') !== undefined) { updates.push(`title = $${idx++}`); values.push(strReq('title')); }
  if (str('description') !== undefined) { updates.push(`description = $${idx++}`); values.push(str('description')); }
  if (body.priority && JOB_PRIORITIES.includes(body.priority as typeof JOB_PRIORITIES[number])) {
    updates.push(`priority = $${idx++}`);
    values.push(body.priority);
  }
  if (str('responsible_person') !== undefined) { updates.push(`responsible_person = $${idx++}`); values.push(str('responsible_person')); }
  if (body.officer_id !== undefined) {
    const oid = body.officer_id === null ? null : (typeof body.officer_id === 'number' ? body.officer_id : parseInt(String(body.officer_id), 10));
    if (oid === null || Number.isFinite(oid)) {
      if (oid && !isSuperAdmin) {
        const offCheck = await pool.query('SELECT id FROM officers WHERE id = $1 AND created_by = $2', [oid, userId]);
        if ((offCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid officer' });
      }
      updates.push(`officer_id = $${idx++}`);
      values.push(oid);
    }
  }
  if (body.start_date !== undefined) { updates.push(`start_date = $${idx++}`); values.push(body.start_date ? new Date(body.start_date as string) : null); }
  if (body.deadline !== undefined) { updates.push(`deadline = $${idx++}`); values.push(body.deadline ? new Date(body.deadline as string) : null); }
  if (body.customer_id !== undefined) {
    const cid = body.customer_id === null ? null : (typeof body.customer_id === 'number' ? body.customer_id : parseInt(String(body.customer_id), 10));
    if (cid === null || Number.isFinite(cid)) {
      if (cid && !isSuperAdmin) {
        const custCheck = await pool.query('SELECT id FROM customers WHERE id = $1 AND created_by = $2', [cid, userId]);
        if ((custCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid customer' });
      }
      updates.push(`customer_id = $${idx++}`);
      values.push(cid);
    }
  }
  if (str('location') !== undefined) { updates.push(`location = $${idx++}`); values.push(str('location')); }
  if (str('required_certifications') !== undefined) { updates.push(`required_certifications = $${idx++}`); values.push(str('required_certifications')); }
  if (body.attachments !== undefined && Array.isArray(body.attachments)) {
    updates.push(`attachments = $${idx++}`);
    values.push(JSON.stringify(body.attachments));
  }
  if (body.state && JOB_STATES.includes(body.state as typeof JOB_STATES[number])) {
    updates.push(`state = $${idx++}`);
    values.push(body.state);
  }
  if (body.schedule_start !== undefined) { updates.push(`schedule_start = $${idx++}`); values.push(body.schedule_start ? new Date(body.schedule_start as string) : null); }
  if (body.duration_minutes !== undefined) { updates.push(`duration_minutes = $${idx++}`); values.push(typeof body.duration_minutes === 'number' && Number.isFinite(body.duration_minutes) ? body.duration_minutes : null); }
  if (str('scheduling_notes') !== undefined) { updates.push(`scheduling_notes = $${idx++}`); values.push(str('scheduling_notes')); }

  // New fields
  if (body.job_description_id !== undefined) {
    updates.push(`job_description_id = $${idx++}`);
    values.push(parseOptionalJobDescriptionId(body.job_description_id));
  }
  if (str('contact_name') !== undefined) { updates.push(`contact_name = $${idx++}`); values.push(str('contact_name')); }
  if (body.job_contact_id !== undefined) {
    const rawJc = body.job_contact_id;
    if (rawJc === null || rawJc === '') {
      updates.push(`job_contact_id = $${idx++}`);
      values.push(null);
    } else {
      const jcid = typeof rawJc === 'number' && Number.isFinite(rawJc) ? Math.trunc(rawJc) : parseInt(String(rawJc), 10);
      if (!Number.isFinite(jcid)) {
        return res.status(400).json({ message: 'Invalid job_contact_id' });
      }
      const jobRow = await pool.query<{ customer_id: number | null; work_address_id: number | null }>(
        `SELECT customer_id, work_address_id FROM jobs WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
        isSuperAdmin ? [id] : [id, userId],
      );
      if ((jobRow.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
      const custId = jobRow.rows[0].customer_id;
      if (custId == null) {
        return res.status(400).json({ message: 'Job has no customer; cannot set job contact' });
      }
      const wa = jobRow.rows[0].work_address_id;
      const v = await validateJobContactForCustomer(pool, custId, wa, jcid);
      if (!v.valid) return res.status(400).json({ message: 'Invalid job contact for this customer or work site' });
      updates.push(`job_contact_id = $${idx++}`);
      values.push(jcid);
      updates.push(`contact_name = $${idx++}`);
      values.push(v.display_name);
    }
  }
  if (body.expected_completion !== undefined) { updates.push(`expected_completion = $${idx++}`); values.push(body.expected_completion ? new Date(body.expected_completion as string) : null); }
  if (str('user_group') !== undefined) { updates.push(`user_group = $${idx++}`); values.push(str('user_group')); }
  if (str('business_unit') !== undefined) { updates.push(`business_unit = $${idx++}`); values.push(str('business_unit')); }
  if (str('skills') !== undefined) { updates.push(`skills = $${idx++}`); values.push(str('skills')); }
  if (str('job_notes') !== undefined) { updates.push(`job_notes = $${idx++}`); values.push(str('job_notes')); }
  if (body.is_service_job !== undefined) { updates.push(`is_service_job = $${idx++}`); values.push(!!body.is_service_job); }
  if (body.quoted_amount !== undefined) { updates.push(`quoted_amount = $${idx++}`); values.push(typeof body.quoted_amount === 'number' ? body.quoted_amount : null); }
  if (str('customer_reference') !== undefined) { updates.push(`customer_reference = $${idx++}`); values.push(str('customer_reference')); }
  if (str('job_pipeline') !== undefined) { updates.push(`job_pipeline = $${idx++}`); values.push(str('job_pipeline')); }
  if (body.completed_service_items !== undefined) {
    const completedServiceItems = normalizeCompletedServiceItemsForDb(body.completed_service_items);
    updates.push(`completed_service_items = $${idx++}`);
    values.push(JSON.stringify(completedServiceItems));
  }
  if (body.book_into_diary !== undefined) { updates.push(`book_into_diary = $${idx++}`); values.push(!!body.book_into_diary); }

  if (updates.length === 0 && body.pricing_items === undefined) return res.status(400).json({ message: 'No fields to update' });

  let previousJobDescriptionId: number | null | undefined = undefined;
  if (body.job_description_id !== undefined) {
    const prevDescRow = await pool.query<{ job_description_id: number | null }>(
      isSuperAdmin
        ? `SELECT job_description_id FROM jobs WHERE id = $1`
        : `SELECT job_description_id FROM jobs WHERE id = $1 AND created_by = $2`,
      isSuperAdmin ? [id] : [id, userId],
    );
    if ((prevDescRow.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    const p = prevDescRow.rows[0].job_description_id;
    previousJobDescriptionId = p != null ? Number(p) : null;
  }

  try {
    // Handle pricing items if provided
    if (body.pricing_items !== undefined && Array.isArray(body.pricing_items)) {
      await pool.query('DELETE FROM job_pricing_items WHERE job_id = $1', [id]);
      for (let i = 0; i < body.pricing_items.length; i++) {
        const pi = body.pricing_items[i];
        const total = Number(pi.unit_price || 0) * Number(pi.quantity || 1);
        await pool.query(
          `INSERT INTO job_pricing_items (job_id, item_name, time_included, unit_price, vat_rate, quantity, total, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, pi.item_name, pi.time_included || 0, pi.unit_price || 0, pi.vat_rate ?? 20.0, pi.quantity || 1, total, i]
        );
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      values.push(id);
      const idParamIdx = idx;
      const ownershipClause = isSuperAdmin ? '' : ` AND created_by = $${idParamIdx + 1}`;
      if (!isSuperAdmin) values.push(userId);

      const result = await pool.query<DbJob>(
        `UPDATE jobs SET ${updates.join(', ')} WHERE id = $${idParamIdx}${ownershipClause} RETURNING *`,
        values,
      );
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    }

    if (body.job_description_id !== undefined && previousJobDescriptionId !== undefined) {
      const newDescId = parseOptionalJobDescriptionId(body.job_description_id);
      if (newDescId != null && newDescId !== previousJobDescriptionId) {
        try {
          await mergeJobDescriptionReportQuestionsIntoJob(pool, id, newDescId);
        } catch (mergeErr) {
          console.error('Merge job description report questions:', mergeErr);
        }
      }
    }

    // Final fetch to return full object
    const finalResult = await pool.query<DbJob>(
      `SELECT * FROM jobs WHERE id = $1`, [id]
    );
    const r = finalResult.rows[0];
    return res.json({
      job: {
        ...r,
        start_date: r.start_date ? (r.start_date as Date).toISOString() : null,
        deadline: r.deadline ? (r.deadline as Date).toISOString() : null,
        created_at: (r.created_at as Date).toISOString(),
        updated_at: (r.updated_at as Date).toISOString(),
        schedule_start: r.schedule_start ? (r.schedule_start as Date).toISOString() : null,
        expected_completion: r.expected_completion ? (r.expected_completion as Date).toISOString() : null,
      },
    });
  } catch (error) {
    console.error('Update job error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/jobs/:jobId/office-tasks', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    const tasksResult = await pool.query(
      `SELECT ot.id, ot.job_id, ot.description, ot.assignee_officer_id, ot.created_by, ot.completed, ot.completed_at, ot.created_at, ot.updated_at,
              ot.completed_by, ot.completion_source, ot.reminder_at, ot.reminder_sent_at,
              o.full_name AS assignee_name, COALESCE(u.full_name, u.email, 'System') AS created_by_name,
              COALESCE(uc.full_name, uc.email) AS completed_by_name
       FROM office_tasks ot
       LEFT JOIN officers o ON o.id = ot.assignee_officer_id
       LEFT JOIN users u ON u.id = ot.created_by
       LEFT JOIN users uc ON uc.id = ot.completed_by
       WHERE ot.job_id = $1
       ORDER BY ot.completed ASC, ot.reminder_at ASC NULLS LAST, ot.created_at DESC`,
      [jobId],
    );

    return res.json({
      tasks: tasksResult.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        job_id: Number(r.job_id),
        description: (r.description as string) ?? '',
        assignee_officer_id: r.assignee_officer_id != null ? Number(r.assignee_officer_id) : null,
        assignee_name: (r.assignee_name as string) ?? null,
        created_by: r.created_by != null ? Number(r.created_by) : null,
        created_by_name: (r.created_by_name as string) ?? 'System',
        completed: !!r.completed,
        completed_at: r.completed_at ? (r.completed_at as Date).toISOString() : null,
        completed_by: r.completed_by != null ? Number(r.completed_by) : null,
        completed_by_name: (r.completed_by_name as string) ?? null,
        completion_source: (r.completion_source as string) ?? null,
        reminder_at: r.reminder_at ? (r.reminder_at as Date).toISOString() : null,
        reminder_sent_at: r.reminder_sent_at ? (r.reminder_sent_at as Date).toISOString() : null,
        created_at: (r.created_at as Date).toISOString(),
        updated_at: (r.updated_at as Date).toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get office tasks error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/jobs/:jobId/office-tasks', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as { description?: string; assignee_officer_id?: number | null; reminder_at?: string | null };
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) return res.status(400).json({ message: 'Task description is required' });
  const assigneeOfficerId = body.assignee_officer_id === null || body.assignee_officer_id === undefined
    ? null
    : (typeof body.assignee_officer_id === 'number' ? body.assignee_officer_id : parseInt(String(body.assignee_officer_id), 10));
  let reminderAt: Date | null = null;
  if (body.reminder_at !== undefined && body.reminder_at !== null && String(body.reminder_at).trim() !== '') {
    const d = new Date(String(body.reminder_at));
    if (Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid reminder_at' });
    reminderAt = d;
  }

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    if (assigneeOfficerId && !isSuperAdmin) {
      const officerCheck = await pool.query('SELECT id FROM officers WHERE id = $1 AND created_by = $2', [assigneeOfficerId, userId]);
      if ((officerCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid assignee' });
    }

    const inserted = await pool.query(
      `INSERT INTO office_tasks (job_id, description, assignee_officer_id, created_by, reminder_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [jobId, description, assigneeOfficerId, userId, reminderAt],
    );
    return res.status(201).json({ task: { id: Number(inserted.rows[0].id) } });
  } catch (error) {
    console.error('Create office task error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/jobs/:jobId/office-tasks/:taskId', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  const taskId = parseInt(String(req.params.taskId), 10);
  if (!Number.isFinite(jobId) || !Number.isFinite(taskId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as { description?: string; assignee_officer_id?: number | null; completed?: boolean; reminder_at?: string | null };

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (typeof body.description === 'string') { updates.push(`description = $${idx++}`); values.push(body.description.trim() || ''); }
    if (body.assignee_officer_id !== undefined) {
      const assignee = body.assignee_officer_id === null ? null : Number(body.assignee_officer_id);
      updates.push(`assignee_officer_id = $${idx++}`);
      values.push(Number.isFinite(assignee as number) ? assignee : null);
    }
    if (body.reminder_at !== undefined) {
      if (body.reminder_at === null || String(body.reminder_at).trim() === '') {
        updates.push(`reminder_at = $${idx++}`);
        values.push(null);
        updates.push(`reminder_sent_at = $${idx++}`);
        values.push(null);
      } else {
        const d = new Date(String(body.reminder_at));
        if (Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid reminder_at' });
        updates.push(`reminder_at = $${idx++}`);
        values.push(d);
        updates.push(`reminder_sent_at = $${idx++}`);
        values.push(null);
      }
    }
    if (typeof body.completed === 'boolean') {
      updates.push(`completed = $${idx++}`);
      values.push(body.completed);
      updates.push(`completed_at = $${idx++}`);
      values.push(body.completed ? new Date() : null);
      updates.push(`completed_by = $${idx++}`);
      values.push(body.completed ? userId : null);
      updates.push(`completion_source = $${idx++}`);
      values.push(body.completed ? 'web' : null);
    }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

    updates.push('updated_at = NOW()');
    values.push(jobId, taskId);
    const result = await pool.query(
      `UPDATE office_tasks SET ${updates.join(', ')} WHERE job_id = $${idx++} AND id = $${idx} RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Task not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Update office task error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/jobs/:jobId/office-tasks/:taskId', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  const taskId = parseInt(String(req.params.taskId), 10);
  if (!Number.isFinite(jobId) || !Number.isFinite(taskId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    const result = await pool.query('DELETE FROM office_tasks WHERE job_id = $1 AND id = $2', [jobId, taskId]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Task not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete office task error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Part catalog, kits & job parts ----------
app.get('/api/part-catalog', authenticate, requireTenantCrmAccess('parts_catalog'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '80'), 10) || 80));
  try {
    const params: unknown[] = [];
    let p = 1;
    let where = isSuperAdmin ? '1=1' : `created_by = $${p++}`;
    if (!isSuperAdmin) params.push(userId);
    if (search) {
      where += ` AND (name ILIKE $${p} OR COALESCE(mpn,'') ILIKE $${p})`;
      params.push(`%${search}%`);
      p++;
    }
    params.push(limit);
    const result = await pool.query(
      `SELECT id, name, mpn, default_unit_cost, default_markup_pct, default_vat_rate, created_at
       FROM part_catalog WHERE ${where} ORDER BY name ASC LIMIT $${p}`,
      params,
    );
    return res.json({
      parts: result.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        name: String(r.name ?? ''),
        mpn: (r.mpn as string) ?? null,
        default_unit_cost: Number(r.default_unit_cost ?? 0),
        default_markup_pct: Number(r.default_markup_pct ?? 0),
        default_vat_rate: Number(r.default_vat_rate ?? 20),
        created_at: (r.created_at as Date).toISOString(),
      })),
    });
  } catch (error) {
    console.error('List part catalog error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/part-catalog', authenticate, requireTenantCrmAccess('parts_catalog'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ message: 'Part name is required' });
  const mpn = typeof body.mpn === 'string' ? body.mpn.trim() || null : null;
  const defaultUnitCost = typeof body.default_unit_cost === 'number' && Number.isFinite(body.default_unit_cost) ? body.default_unit_cost : 0;
  const defaultMarkupPct = typeof body.default_markup_pct === 'number' && Number.isFinite(body.default_markup_pct) ? body.default_markup_pct : 0;
  const defaultVatRate = typeof body.default_vat_rate === 'number' && Number.isFinite(body.default_vat_rate) ? body.default_vat_rate : 20;

  try {
    const ins = await pool.query(
      `INSERT INTO part_catalog (name, mpn, default_unit_cost, default_markup_pct, default_vat_rate, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [name, mpn, defaultUnitCost, defaultMarkupPct, defaultVatRate, userId],
    );
    return res.status(201).json({ part: { id: Number(ins.rows[0].id) } });
  } catch (error) {
    console.error('Create part catalog error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/part-kits', authenticate, requireTenantCrmAccess('parts_catalog'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const result = await pool.query(
      `SELECT k.id, k.name, k.created_at, COUNT(i.id)::int AS item_count
       FROM part_kits k
       LEFT JOIN part_kit_items i ON i.kit_id = k.id
       WHERE ${isSuperAdmin ? '1=1' : 'k.created_by = $1'}
       GROUP BY k.id, k.name, k.created_at
       ORDER BY k.name ASC`,
      isSuperAdmin ? [] : [userId],
    );
    return res.json({
      kits: result.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        name: String(r.name ?? ''),
        item_count: Number(r.item_count ?? 0),
        created_at: (r.created_at as Date).toISOString(),
      })),
    });
  } catch (error) {
    console.error('List part kits error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/part-kits/:kitId', authenticate, requireTenantCrmAccess('parts_catalog'), async (req: AuthenticatedRequest, res: Response) => {
  const kitId = parseInt(String(req.params.kitId), 10);
  if (!Number.isFinite(kitId)) return res.status(400).json({ message: 'Invalid kit id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const kit = await pool.query(
      `SELECT id, name, created_at, created_by FROM part_kits WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [kitId] : [kitId, userId],
    );
    if ((kit.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Kit not found' });
    const items = await pool.query(
      `SELECT id, part_name, mpn, quantity, unit_cost, markup_pct, vat_rate, sort_order
       FROM part_kit_items WHERE kit_id = $1 ORDER BY sort_order ASC, id ASC`,
      [kitId],
    );
    return res.json({
      kit: {
        id: Number(kit.rows[0].id),
        name: String(kit.rows[0].name ?? ''),
        created_at: (kit.rows[0].created_at as Date).toISOString(),
        items: items.rows.map((r: Record<string, unknown>) => ({
          id: Number(r.id),
          part_name: String(r.part_name ?? ''),
          mpn: (r.mpn as string) ?? null,
          quantity: Number(r.quantity),
          unit_cost: Number(r.unit_cost),
          markup_pct: Number(r.markup_pct),
          vat_rate: Number(r.vat_rate),
        })),
      },
    });
  } catch (error) {
    console.error('Get part kit error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/part-kits', authenticate, requireTenantCrmAccess('parts_catalog'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const body = req.body as { name?: string; items?: unknown[] };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ message: 'Kit name is required' });
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return res.status(400).json({ message: 'At least one kit line is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const k = await client.query(
      `INSERT INTO part_kits (name, created_by) VALUES ($1, $2) RETURNING id`,
      [name, userId],
    );
    const kitId = Number(k.rows[0].id);
    let sort = 0;
    for (const raw of items) {
      const row = raw as Record<string, unknown>;
      const partName = typeof row.part_name === 'string' ? row.part_name.trim() : '';
      if (!partName) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Each kit line needs part_name' });
      }
      const mpn = typeof row.mpn === 'string' ? row.mpn.trim() || null : null;
      const qty = typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : parseFloat(String(row.quantity || '1'));
      const unitCost = typeof row.unit_cost === 'number' && Number.isFinite(row.unit_cost) ? row.unit_cost : 0;
      const markupPct = typeof row.markup_pct === 'number' && Number.isFinite(row.markup_pct) ? row.markup_pct : 0;
      const vatRate = typeof row.vat_rate === 'number' && Number.isFinite(row.vat_rate) ? row.vat_rate : 20;
      await client.query(
        `INSERT INTO part_kit_items (kit_id, part_name, mpn, quantity, unit_cost, markup_pct, vat_rate, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [kitId, partName, mpn, qty, unitCost, markupPct, vatRate, sort++],
      );
    }
    await client.query('COMMIT');
    return res.status(201).json({ kit: { id: kitId } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create part kit error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.get('/api/jobs/:jobId/parts', authenticate, requireTenantCrmAccess('parts_catalog'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
  const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    const params: unknown[] = [jobId];
    let where = 'WHERE jp.job_id = $1';
    let p = 2;
    if (status && (JOB_PART_STATUSES as readonly string[]).includes(status)) {
      where += ` AND jp.status = $${p++}`;
      params.push(status);
    }
    if (search) {
      where += ` AND (jp.part_name ILIKE $${p} OR COALESCE(jp.mpn,'') ILIKE $${p})`;
      params.push(`%${search}%`);
      p++;
    }
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT jp.*, COALESCE(u.full_name, u.email, 'User') AS created_by_name,
              COUNT(*) OVER() AS full_count
       FROM job_parts jp
       LEFT JOIN users u ON u.id = jp.created_by
       ${where}
       ORDER BY jp.created_at DESC
       LIMIT $${p++} OFFSET $${p}`,
      params,
    );
    const total = result.rows.length > 0 ? Number((result.rows[0] as Record<string, unknown>).full_count) : 0;
    const countsRes = await pool.query(`SELECT status, COUNT(*)::int AS c FROM job_parts WHERE job_id = $1 GROUP BY status`, [jobId]);
    const status_counts: Record<string, number> = {};
    for (const row of countsRes.rows) {
      status_counts[String((row as { status: string }).status)] = Number((row as { c: number }).c);
    }
    return res.json({
      parts: result.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        job_id: Number(r.job_id),
        part_catalog_id: r.part_catalog_id != null ? Number(r.part_catalog_id) : null,
        part_name: String(r.part_name ?? ''),
        mpn: (r.mpn as string) ?? null,
        quantity: Number(r.quantity),
        fulfillment_type: (r.fulfillment_type as string) ?? null,
        status: String(r.status ?? 'requested'),
        unit_cost_price: Number(r.unit_cost_price ?? 0),
        markup_pct: Number(r.markup_pct ?? 0),
        vat_rate: Number(r.vat_rate ?? 20),
        unit_sell_price: Number(r.unit_sell_price ?? 0),
        created_at: (r.created_at as Date).toISOString(),
        created_by: r.created_by != null ? Number(r.created_by) : null,
        created_by_name: (r.created_by_name as string) ?? 'User',
      })),
      total,
      status_counts,
    });
  } catch (error) {
    console.error('List job parts error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/jobs/:jobId/parts', authenticate, requireTenantCrmAccess('parts_catalog'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    let partName = typeof body.part_name === 'string' ? body.part_name.trim() : '';
    let mpn: string | null = typeof body.mpn === 'string' ? body.mpn.trim() || null : null;
    let unitCost = typeof body.unit_cost_price === 'number' && Number.isFinite(body.unit_cost_price) ? body.unit_cost_price : 0;
    let markupPct = typeof body.markup_pct === 'number' && Number.isFinite(body.markup_pct) ? body.markup_pct : 0;
    let vatRate = typeof body.vat_rate === 'number' && Number.isFinite(body.vat_rate) ? body.vat_rate : 20;
    let partCatalogId: number | null = null;

    const catalogIdRaw = body.part_catalog_id;
    if (catalogIdRaw !== undefined && catalogIdRaw !== null && catalogIdRaw !== '') {
      const cid = typeof catalogIdRaw === 'number' ? catalogIdRaw : parseInt(String(catalogIdRaw), 10);
      if (Number.isFinite(cid)) {
        const cat = await pool.query(
          `SELECT id, name, mpn, default_unit_cost, default_markup_pct, default_vat_rate
           FROM part_catalog WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
          isSuperAdmin ? [cid] : [cid, userId],
        );
        if ((cat.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid part catalog entry' });
        const c = cat.rows[0] as Record<string, unknown>;
        partCatalogId = Number(c.id);
        partName = String(c.name ?? partName);
        mpn = (c.mpn as string) ?? mpn;
        if (body.unit_cost_price === undefined) unitCost = Number(c.default_unit_cost ?? 0);
        if (body.markup_pct === undefined) markupPct = Number(c.default_markup_pct ?? 0);
        if (body.vat_rate === undefined) vatRate = Number(c.default_vat_rate ?? 20);
      }
    }

    if (!partName) return res.status(400).json({ message: 'Part name or catalog selection is required' });

    const qty =
      typeof body.quantity === 'number' && Number.isFinite(body.quantity)
        ? body.quantity
        : parseFloat(String(body.quantity ?? '1')) || 1;
    const fulfillmentType =
      typeof body.fulfillment_type === 'string' && body.fulfillment_type.trim() ? body.fulfillment_type.trim().slice(0, 100) : null;
    const statusRaw = typeof body.status === 'string' ? body.status.trim() : 'requested';
    const status = (JOB_PART_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : 'requested';

    const unitSell = computeJobPartUnitSell(unitCost, markupPct);

    const ins = await pool.query(
      `INSERT INTO job_parts (job_id, part_catalog_id, part_name, mpn, quantity, fulfillment_type, status,
         unit_cost_price, markup_pct, vat_rate, unit_sell_price, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [jobId, partCatalogId, partName, mpn, qty, fulfillmentType, status, unitCost, markupPct, vatRate, unitSell, userId],
    );
    return res.status(201).json({ part: { id: Number(ins.rows[0].id) } });
  } catch (error) {
    console.error('Create job part error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/jobs/:jobId/parts/from-kit', authenticate, requireTenantCrmAccess('parts_catalog'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const kitId = typeof (req.body as { kit_id?: unknown }).kit_id === 'number' ? (req.body as { kit_id: number }).kit_id : parseInt(String((req.body as { kit_id?: unknown }).kit_id), 10);
  if (!Number.isFinite(kitId)) return res.status(400).json({ message: 'kit_id is required' });

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    const kit = await pool.query(
      `SELECT id FROM part_kits WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [kitId] : [kitId, userId],
    );
    if ((kit.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Kit not found' });

    const items = await pool.query(
      `SELECT part_name, mpn, quantity, unit_cost, markup_pct, vat_rate FROM part_kit_items WHERE kit_id = $1 ORDER BY sort_order ASC, id ASC`,
      [kitId],
    );
    if ((items.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Kit has no lines' });

    let created = 0;
    for (const row of items.rows) {
      const r = row as Record<string, unknown>;
      const partName = String(r.part_name ?? '');
      const mpn = (r.mpn as string) ?? null;
      const qty = Number(r.quantity);
      const unitCost = Number(r.unit_cost ?? 0);
      const markupPct = Number(r.markup_pct ?? 0);
      const vatRate = Number(r.vat_rate ?? 20);
      const unitSell = computeJobPartUnitSell(unitCost, markupPct);
      await pool.query(
        `INSERT INTO job_parts (job_id, part_catalog_id, part_name, mpn, quantity, fulfillment_type, status,
           unit_cost_price, markup_pct, vat_rate, unit_sell_price, created_by)
         VALUES ($1,NULL,$2,$3,$4,NULL,'requested',$5,$6,$7,$8,$9)`,
        [jobId, partName, mpn, qty, unitCost, markupPct, vatRate, unitSell, userId],
      );
      created++;
    }
    return res.status(201).json({ created });
  } catch (error) {
    console.error('Add job parts from kit error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/jobs/:jobId/parts/:partId', authenticate, requireTenantCrmAccess('parts_catalog'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  const partId = parseInt(String(req.params.partId), 10);
  if (!Number.isFinite(jobId) || !Number.isFinite(partId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (typeof body.part_name === 'string' && body.part_name.trim()) {
      updates.push(`part_name = $${idx++}`);
      values.push(body.part_name.trim());
    }
    if (body.mpn !== undefined) {
      updates.push(`mpn = $${idx++}`);
      values.push(typeof body.mpn === 'string' ? body.mpn.trim() || null : null);
    }
    if (body.quantity !== undefined) {
      const q = typeof body.quantity === 'number' ? body.quantity : parseFloat(String(body.quantity));
      if (Number.isFinite(q) && q > 0) {
        updates.push(`quantity = $${idx++}`);
        values.push(q);
      }
    }
    if (body.fulfillment_type !== undefined) {
      updates.push(`fulfillment_type = $${idx++}`);
      values.push(typeof body.fulfillment_type === 'string' && body.fulfillment_type.trim() ? body.fulfillment_type.trim().slice(0, 100) : null);
    }
    if (typeof body.status === 'string' && (JOB_PART_STATUSES as readonly string[]).includes(body.status.trim())) {
      updates.push(`status = $${idx++}`);
      values.push(body.status.trim());
    }
    if (body.unit_cost_price !== undefined) {
      const uc = typeof body.unit_cost_price === 'number' ? body.unit_cost_price : parseFloat(String(body.unit_cost_price));
      if (Number.isFinite(uc)) {
        updates.push(`unit_cost_price = $${idx++}`);
        values.push(uc);
      }
    }
    if (body.markup_pct !== undefined) {
      const mk = typeof body.markup_pct === 'number' ? body.markup_pct : parseFloat(String(body.markup_pct));
      if (Number.isFinite(mk)) {
        updates.push(`markup_pct = $${idx++}`);
        values.push(mk);
      }
    }
    if (body.vat_rate !== undefined) {
      const vr = typeof body.vat_rate === 'number' ? body.vat_rate : parseFloat(String(body.vat_rate));
      if (Number.isFinite(vr)) {
        updates.push(`vat_rate = $${idx++}`);
        values.push(vr);
      }
    }

    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

    values.push(jobId, partId);
    const result = await pool.query(
      `UPDATE job_parts SET ${updates.join(', ')} WHERE job_id = $${idx++} AND id = $${idx} RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Part line not found' });
    await pool.query(
      `UPDATE job_parts SET unit_sell_price = ROUND((unit_cost_price::numeric * (1 + markup_pct::numeric / 100))::numeric, 2)
       WHERE job_id = $1 AND id = $2`,
      [jobId, partId],
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Update job part error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/jobs/:jobId/parts/:partId', authenticate, requireTenantCrmAccess('parts_catalog'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  const partId = parseInt(String(req.params.partId), 10);
  if (!Number.isFinite(jobId) || !Number.isFinite(partId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    const result = await pool.query('DELETE FROM job_parts WHERE job_id = $1 AND id = $2', [jobId, partId]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Part line not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete job part error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/jobs/:id', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const result = await pool.query(
      `DELETE FROM jobs WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [id] : [id, userId],
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete job error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


// ---------- Diary Events ----------
app.get('/api/diary-events', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const du = req.user!;
  if (du.role === 'STAFF' && !assertStaffPermissionAny(du, ['jobs', 'scheduling'])) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  }
  try {
    const rangeStartRaw = typeof req.query.range_start === 'string' ? req.query.range_start.trim() : '';
    const rangeEndRaw = typeof req.query.range_end === 'string' ? req.query.range_end.trim() : '';
    const hasRange =
      rangeStartRaw.length > 0 && rangeEndRaw.length > 0
        ? !Number.isNaN(new Date(rangeStartRaw).getTime()) && !Number.isNaN(new Date(rangeEndRaw).getTime())
        : false;
    if (hasRange) {
      const t0 = new Date(rangeStartRaw).getTime();
      const t1 = new Date(rangeEndRaw).getTime();
      if (t0 > t1) {
        return res.status(400).json({ message: 'Invalid range: range_start must be <= range_end' });
      }
    }

    const fromDate = typeof req.query.from === 'string' ? req.query.from : '2000-01-01';
    const toDate = typeof req.query.to === 'string' ? req.query.to : '3000-01-01';

    /** IANA name only (PG timezone() arg); unsafe strings rejected. */
    const timeZoneParam =
      typeof req.query.time_zone === 'string' && /^[A-Za-z0-9_/.+\-]{1,120}$/.test(req.query.time_zone)
        ? req.query.time_zone
        : '';

    /** e.g. Dart `DateTime.timeZoneOffset.inMinutes` (east of UTC is positive). */
    const clientOffsetHeader = req.get('x-client-utc-offset-minutes');
    const clientOffsetM =
      clientOffsetHeader != null && clientOffsetHeader.length > 0
        ? Number.parseInt(clientOffsetHeader, 10)
        : NaN;
    const hasClientOffset =
      Number.isFinite(clientOffsetM) && clientOffsetM >= -14 * 60 && clientOffsetM <= 14 * 60;

    const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    let timeWhere: string;
    const params: unknown[] = [];

    if (hasRange) {
      timeWhere = 'd.start_time >= $1::timestamptz AND d.start_time <= $2::timestamptz';
      params.push(rangeStartRaw, rangeEndRaw);
    } else if (timeZoneParam) {
      timeWhere =
        '(timezone($1::text, d.start_time))::date >= $2::date AND (timezone($1::text, d.start_time))::date <= $3::date';
      params.push(timeZoneParam, fromDate, toDate);
    } else if (hasClientOffset && isYmd(fromDate) && isYmd(toDate)) {
      /* Legacy `from`+`to` (no range_*): interpret as local calendar Y-M-D in the app’s fixed offset. */
      timeWhere = `d.start_time >= (($1::date::timestamp - ($3 * interval '1 minute')) at time zone 'UTC')
  AND d.start_time < ((($2::date + 1)::timestamp - ($3 * interval '1 minute')) at time zone 'UTC')`;
      params.push(fromDate, toDate, clientOffsetM);
    } else {
      timeWhere = 'd.start_time >= $1::timestamptz AND d.start_time < ($2::timestamptz + INTERVAL \'1 day\')';
      params.push(fromDate, toDate);
    }

    let nextParam = params.length + 1;
    let officerClause = '';
    const tokenOid = req.user!.officerId ?? null;
    if (tokenOid != null && diaryActsAsFieldOfficer(req, { role: req.user!.role, officerId: tokenOid, permissions: req.user!.permissions ?? null })) {
      officerClause = ` AND (d.officer_id = $${nextParam} OR j.officer_id = $${nextParam})`;
      params.push(tokenOid);
      nextParam += 1;
    } else if (typeof req.query.officer_id === 'string') {
      const oid = parseInt(req.query.officer_id, 10);
      if (Number.isFinite(oid)) {
        officerClause = ` AND d.officer_id = $${nextParam}`;
        params.push(oid);
        nextParam += 1;
      }
    } else if (req.user!.role !== 'SUPER_ADMIN') {
      officerClause = ` AND j.created_by = $${nextParam}`;
      params.push(getTenantScopeUserId(req.user!));
      nextParam += 1;
    }

    // We fetch diary events joined with jobs and customers
    const result = await pool.query(
      `SELECT d.id as diary_id, d.job_id, d.officer_id, d.start_time, d.duration_minutes, d.status as event_status,
              d.notes, d.abort_reason, d.created_by_name, d.created_at,
              j.title, j.description, j.location, j.customer_id,
              c.full_name as customer_full_name, c.email as customer_email,
              o.full_name as officer_full_name,
              (SELECT COUNT(*)::int FROM job_report_questions q WHERE q.job_id = j.id) AS job_report_question_count,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', jc.title, jc.first_name, jc.surname)), ''),
                NULLIF(TRIM(j.contact_name), ''),
                c.full_name
              ) AS site_contact_name,
              NULLIF(TRIM(CONCAT_WS(', ',
                NULLIF(TRIM(c.address_line_1), ''),
                NULLIF(TRIM(c.town), ''),
                NULLIF(TRIM(c.postcode), '')
              )), '') AS customer_address
       FROM diary_events d
       JOIN jobs j ON j.id = d.job_id
       LEFT JOIN customers c ON c.id = j.customer_id
       LEFT JOIN customer_contacts jc ON jc.id = j.job_contact_id
       LEFT JOIN officers o ON o.id = d.officer_id
       WHERE ${timeWhere}
       ${officerClause}
       ORDER BY d.start_time ASC`,
      params,
    );
    res.json({ events: result.rows });
  } catch (error) {
    console.error('get diary events error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/** Single diary visit with job + customer context (field officer or admin). */
app.get('/api/diary-events/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid event id' });

  const du0 = req.user!;
  if (du0.role === 'STAFF' && !assertStaffPermissionAny(du0, ['jobs', 'scheduling'])) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  }

  try {
    const result = await pool.query(
      `SELECT d.id AS diary_id, d.job_id, d.officer_id, d.start_time, d.duration_minutes, d.status AS event_status,
              d.notes, d.abort_reason, d.created_by_name, d.created_at, d.updated_at,
              j.title, j.description, j.location, j.state AS job_state, j.job_notes, j.customer_id,
              j.created_by AS job_created_by,
              j.work_address_id AS job_work_address_id,
              j.officer_id AS job_officer_id,
              j.quoted_amount, j.customer_reference,
              c.full_name AS customer_full_name, c.email AS customer_email,
              COALESCE(NULLIF(TRIM(c.contact_mobile), ''), NULLIF(TRIM(c.phone), '')) AS customer_phone,
              NULLIF(TRIM(c.address), '') AS customer_address,
              NULLIF(TRIM(c.address_line_1), '') AS customer_address_line_1,
              NULLIF(TRIM(c.town), '') AS customer_town,
              NULLIF(TRIM(c.postcode), '') AS customer_postcode,
              o.full_name AS officer_full_name,
              (SELECT COUNT(*)::int FROM job_report_questions q WHERE q.job_id = j.id) AS job_report_question_count,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', jc.title, jc.first_name, jc.surname)), ''),
                NULLIF(TRIM(j.contact_name), ''),
                c.full_name
              ) AS site_contact_name,
              COALESCE(NULLIF(TRIM(jc.email), ''), c.email) AS site_contact_email,
              COALESCE(
                CASE WHEN jc.id IS NOT NULL THEN COALESCE(NULLIF(TRIM(jc.mobile), ''), NULLIF(TRIM(jc.landline), '')) END,
                COALESCE(NULLIF(TRIM(c.contact_mobile), ''), NULLIF(TRIM(c.phone), ''))
              ) AS site_contact_phone
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       LEFT JOIN customers c ON c.id = j.customer_id
       LEFT JOIN customer_contacts jc ON jc.id = j.job_contact_id
       LEFT JOIN officers o ON o.id = d.officer_id
       WHERE d.id = $1`,
      [id],
    );
    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    const row = result.rows[0] as Record<string, unknown>;
    const role = req.user!.role;
    const tokenOfficerId = req.user!.officerId ?? null;
    const officerId = row.officer_id as number | null;
    const jobOfficerId = row.job_officer_id as number | null;

    if (diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null })) {
      const assigned = officerId === tokenOfficerId || jobOfficerId === tokenOfficerId;
      if (!assigned) {
        return res.status(403).json({ message: 'You can only view diary visits assigned to you' });
      }
    } else if (role !== 'SUPER_ADMIN') {
      const jcb = row.job_created_by as number | null;
      if (jcb == null || jcb !== getTenantScopeUserId(req.user!)) {
        return res.status(404).json({ message: 'Event not found' });
      }
    }

    const line1 = (row.customer_address_line_1 as string | null) || '';
    const town = (row.customer_town as string | null) || '';
    const pc = (row.customer_postcode as string | null) || '';
    const legacyAddr = (row.customer_address as string | null) || '';
    const composed =
      [line1, town, pc].filter((x) => x.length > 0).join(', ') ||
      legacyAddr ||
      (row.location as string | null) ||
      '';

    const customerId = row.customer_id as number | null;
    const jobWorkAddressId = row.job_work_address_id as number | null;
    const customerSpecificNotes: Array<{
      id: number;
      title: string;
      description: string;
      created_at: string;
      work_address_id: number | null;
      media: Array<{
        original_filename: string;
        content_type: string;
        kind: string;
        byte_size: number;
        file_path: string;
      }>;
      created_by_name: string | null;
    }> = [];
    if (customerId != null) {
      const notesRes = await pool.query<{
        id: number;
        title: string;
        description: string;
        created_at: Date;
        work_address_id: number | null;
        media: unknown;
        created_by_name: string | null;
      }>(
        `SELECT n.id, n.title, n.description, n.created_at, n.work_address_id, n.media,
                COALESCE(u.full_name, u.email) AS created_by_name
         FROM customer_specific_notes n
         LEFT JOIN users u ON u.id = n.created_by
         WHERE customer_id = $1
           AND (work_address_id IS NULL OR ($2::integer IS NOT NULL AND work_address_id = $2))
         ORDER BY sort_order ASC NULLS LAST, created_at ASC`,
        [customerId, jobWorkAddressId],
      );
      for (const r of notesRes.rows) {
        const mediaArr = Array.isArray(r.media) ? (r.media as Record<string, unknown>[]) : [];
        customerSpecificNotes.push({
          id: r.id,
          title: r.title,
          description: r.description,
          created_at: (r.created_at as Date).toISOString(),
          work_address_id: r.work_address_id ?? null,
          created_by_name: r.created_by_name ?? null,
          media: mediaArr.map((m) => {
            const stored = String(m.stored_filename ?? '');
            const orig = String(m.original_filename ?? 'file');
            const ct = String(m.content_type ?? 'application/octet-stream');
            return {
              original_filename: orig,
              content_type: ct,
              kind: 'image',
              byte_size: m.byte_size != null ? Number(m.byte_size) : 0,
              file_path: `/diary-events/${id}/technical-notes/${r.id}/files/${encodeURIComponent(stored)}`,
            };
          }),
        });
      }
    }

    const extraRes = await pool.query<{
      id: number;
      notes: string | null;
      media: unknown;
      created_at: Date;
      created_by_name: string | null;
    }>(
      `SELECT s.id, s.notes, s.media, s.created_at, COALESCE(u.full_name, u.email) AS created_by_name
       FROM diary_event_extra_submissions s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.diary_event_id = $1
       ORDER BY s.created_at ASC`,
      [id],
    );
    const visitEngineerName = (() => {
      const s = (row.officer_full_name as string | null) ?? null;
      return s != null && s.trim() !== '' ? s.trim() : null;
    })();
    const extraSubmissions = extraRes.rows.map((r) => {
      const mediaArr = Array.isArray(r.media) ? (r.media as Record<string, unknown>[]) : [];
      const uploader = r.created_by_name ?? null;
      return {
        id: r.id,
        notes: r.notes,
        created_at: (r.created_at as Date).toISOString(),
        created_by_name: uploader,
        /** Prefer visit engineer; avoids showing a staff / super-admin login when the mobile visit is assigned to a field officer. */
        display_name: visitEngineerName ?? uploader,
        media: mediaArr.map((m) => {
          const stored = String(m.stored_filename ?? '');
          const orig = String(m.original_filename ?? 'file');
          const ct = String(m.content_type ?? 'application/octet-stream');
          const kind = String(
            m.kind && String(m.kind).trim()
              ? m.kind
              : ct.startsWith('video/')
                ? 'video'
                : 'image',
          );
          return {
            original_filename: orig,
            content_type: ct,
            kind,
            byte_size: m.byte_size != null ? Number(m.byte_size) : 0,
            file_path: `/diary-events/${id}/extra-submissions/${r.id}/files/${encodeURIComponent(stored)}`,
          };
        }),
      };
    });

    const technicalNotes = customerSpecificNotes.map((n) => ({
      id: n.id,
      notes: n.description,
      created_at: n.created_at,
      created_by_name: n.created_by_name,
      display_name: n.created_by_name,
      media: n.media,
    }));

    return res.json({
      event: {
        diary_id: row.diary_id,
        job_id: row.job_id,
        officer_id: row.officer_id,
        start_time: (row.start_time as Date).toISOString(),
        duration_minutes: row.duration_minutes,
        event_status: row.event_status,
        notes: row.notes,
        created_by_name: row.created_by_name,
        created_at: (row.created_at as Date).toISOString(),
        updated_at: (row.updated_at as Date).toISOString(),
        title: row.title,
        description: row.description,
        location: row.location,
        job_state: row.job_state,
        job_notes: row.job_notes,
        quoted_amount: row.quoted_amount,
        customer_reference: row.customer_reference,
        customer_id: row.customer_id,
        customer_full_name: row.customer_full_name,
        customer_email: row.customer_email,
        customer_phone: row.customer_phone,
        site_address: composed || null,
        officer_full_name: row.officer_full_name,
        job_report_question_count: (row.job_report_question_count as number) ?? 0,
        site_contact_name: row.site_contact_name ?? null,
        site_contact_email: row.site_contact_email ?? null,
        site_contact_phone: row.site_contact_phone ?? null,
        abort_reason: row.abort_reason != null && String(row.abort_reason).trim() ? String(row.abort_reason).trim() : null,
        /** Also on root; duplicated here for clients that only read `event`. */
        customer_specific_notes: customerSpecificNotes,
      },
      extra_submissions: extraSubmissions,
      technical_notes: technicalNotes,
      customer_specific_notes: customerSpecificNotes,
    });
  } catch (error) {
    console.error('get diary event by id error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Optional photos/videos + notes on a visit, separate from the main job report form. */
app.post(
  '/api/diary-events/:id/extra-submissions',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const diaryEventId = parseInt(String(idParam), 10);
    if (!Number.isFinite(diaryEventId)) {
      return res.status(400).json({ message: 'Invalid event id' });
    }
    const userId = getTenantScopeUserId(req.user!);
    const access = await pool.query<{
      job_id: number;
      officer_id: number | null;
      job_officer_id: number | null;
      job_created_by: number | null;
    }>(
      `SELECT j.id AS job_id, d.officer_id, j.officer_id AS job_officer_id, j.created_by AS job_created_by
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       WHERE d.id = $1`,
      [diaryEventId],
    );
    if ((access.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    const acc = access.rows[0];
    const role = req.user!.role;
    const tokenOfficerId = req.user!.officerId ?? null;
    const isSuperAdmin = role === 'SUPER_ADMIN';
    if (diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null })) {
      const ok =
        acc.officer_id === tokenOfficerId || acc.job_officer_id === tokenOfficerId;
      if (!ok) {
        return res
          .status(403)
          .json({ message: 'You can only add submissions for visits assigned to you' });
      }
    } else if (role === 'OFFICER') {
      return res.status(403).json({ message: 'Forbidden' });
    } else if (!isSuperAdmin && acc.job_created_by !== userId) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const body = req.body as { notes?: unknown; media?: unknown };
    const notes =
      typeof body.notes === 'string' ? String(body.notes).trim() : '';
    const rawMedia = Array.isArray(body.media) ? body.media : [];
    if (notes.length === 0 && rawMedia.length === 0) {
      return res.status(400).json({
        message: 'Add a note and/or at least one photo or video (notes-only is allowed, or media without notes).',
      });
    }
    if (rawMedia.length > DIARY_EXTRA_MAX_FILES) {
      return res.status(400).json({ message: `At most ${DIARY_EXTRA_MAX_FILES} files per submission` });
    }

    const decoded: { buf: Buffer; contentType: string; original: string; kind: string }[] = [];
    for (const item of rawMedia) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ message: 'Invalid media item' });
      }
      const m = item as Record<string, unknown>;
      const b64 = typeof m.content_base64 === 'string' ? m.content_base64.trim() : '';
      if (!b64) {
        return res.status(400).json({ message: 'Each media item needs content_base64' });
      }
      let buf: Buffer;
      try {
        buf = Buffer.from(b64, 'base64');
      } catch {
        return res.status(400).json({ message: 'Invalid base64 in media' });
      }
      if (buf.length === 0) {
        return res.status(400).json({ message: 'Empty file' });
      }
      if (buf.length > DIARY_EXTRA_FILE_MAX_BYTES) {
        return res.status(400).json({
          message: `Each file must be at most ${Math.round(DIARY_EXTRA_FILE_MAX_BYTES / (1024 * 1024))} MB (compress on device before upload)`,
        });
      }
      const contentType = typeof m.content_type === 'string' ? m.content_type.trim().toLowerCase().slice(0, 80) : '';
      const baseCt = contentType.split(';')[0]!.trim();
      if (!baseCt.startsWith('image/') && !baseCt.startsWith('video/')) {
        return res.status(400).json({ message: 'Only image or video files are allowed' });
      }
      const original =
        typeof m.filename === 'string' && m.filename.trim() ? sanitizeStoredOriginalName(m.filename) : 'upload.bin';
      const ext = path.extname(original).slice(0, 32) || (baseCt.startsWith('video/') ? '.mp4' : '.jpg');
      const kind = baseCt.startsWith('video/') ? 'video' : 'image';
      decoded.push({ buf, contentType: baseCt, original, kind });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query<{ id: number }>(
        `INSERT INTO diary_event_extra_submissions (diary_event_id, notes, media, created_by)
         VALUES ($1, $2, '[]'::jsonb, $3)
         RETURNING id`,
        [diaryEventId, notes.length > 0 ? notes : null, userId],
      );
      const submissionId = ins.rows[0].id;
      const mediaJson: {
        stored_filename: string;
        original_filename: string;
        content_type: string;
        kind: string;
        byte_size: number;
      }[] = [];

      const dir = await ensureDiaryExtraSubmissionDir(diaryEventId, submissionId);
      for (const d of decoded) {
        const ext = path.extname(d.original).slice(0, 32) || (d.kind === 'video' ? '.mp4' : '.jpg');
        const storedFilename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
        const fullPath = path.join(dir, storedFilename);
        await fs.writeFile(fullPath, d.buf);
        mediaJson.push({
          stored_filename: storedFilename,
          original_filename: d.original,
          content_type: d.contentType,
          kind: d.kind,
          byte_size: d.buf.length,
        });
      }

      await client.query(`UPDATE diary_event_extra_submissions SET media = $1::jsonb WHERE id = $2`, [
        JSON.stringify(mediaJson),
        submissionId,
      ]);

      await client.query('COMMIT');
      return res.status(201).json({
        id: submissionId,
        message: 'Submission saved',
        media: mediaJson.map((m) => ({
          ...m,
          file_path: `/diary-events/${diaryEventId}/extra-submissions/${submissionId}/files/${encodeURIComponent(m.stored_filename)}`,
        })),
      });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* */
      }
      // best-effort cleanup folder
      console.error('extra submission error:', e);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  },
);

app.post(
  '/api/diary-events/:id/technical-notes',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const diaryEventId = parseInt(String(idParam), 10);
    if (!Number.isFinite(diaryEventId)) {
      return res.status(400).json({ message: 'Invalid event id' });
    }
    const userId = getTenantScopeUserId(req.user!);
    const access = await pool.query<{
      job_id: number;
      officer_id: number | null;
      job_officer_id: number | null;
      job_created_by: number | null;
    }>(
      `SELECT j.id AS job_id, d.officer_id, j.officer_id AS job_officer_id, j.created_by AS job_created_by
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       WHERE d.id = $1`,
      [diaryEventId],
    );
    if ((access.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    const acc = access.rows[0];
    const role = req.user!.role;
    const tokenOfficerId = req.user!.officerId ?? null;
    const isSuperAdmin = role === 'SUPER_ADMIN';
    if (diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null })) {
      const ok = acc.officer_id === tokenOfficerId || acc.job_officer_id === tokenOfficerId;
      if (!ok) {
        return res.status(403).json({ message: 'You can only add technical notes for visits assigned to you' });
      }
    } else if (role === 'OFFICER') {
      return res.status(403).json({ message: 'Forbidden' });
    } else if (!isSuperAdmin && acc.job_created_by !== userId) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const body = req.body as { notes?: unknown; media?: unknown };
    const notes = typeof body.notes === 'string' ? String(body.notes).trim() : '';
    const rawMedia = Array.isArray(body.media) ? body.media : [];
    if (notes.length === 0 && rawMedia.length === 0) {
      return res.status(400).json({
        message: 'Add a note and/or at least one image.',
      });
    }
    if (rawMedia.length > DIARY_EXTRA_MAX_FILES) {
      return res.status(400).json({ message: `At most ${DIARY_EXTRA_MAX_FILES} files per note` });
    }

    const decoded: { buf: Buffer; contentType: string; original: string }[] = [];
    for (const item of rawMedia) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ message: 'Invalid media item' });
      }
      const m = item as Record<string, unknown>;
      const b64 = typeof m.content_base64 === 'string' ? m.content_base64.trim() : '';
      if (!b64) {
        return res.status(400).json({ message: 'Each media item needs content_base64' });
      }
      let buf: Buffer;
      try {
        buf = Buffer.from(b64, 'base64');
      } catch {
        return res.status(400).json({ message: 'Invalid base64 in media' });
      }
      if (buf.length === 0) {
        return res.status(400).json({ message: 'Empty file' });
      }
      if (buf.length > DIARY_EXTRA_FILE_MAX_BYTES) {
        return res.status(400).json({
          message: `Each file must be at most ${Math.round(DIARY_EXTRA_FILE_MAX_BYTES / (1024 * 1024))} MB`,
        });
      }
      const contentType = typeof m.content_type === 'string' ? m.content_type.trim().toLowerCase().slice(0, 80) : '';
      const baseCt = contentType.split(';')[0]!.trim();
      if (!baseCt.startsWith('image/')) {
        return res.status(400).json({ message: 'Technical notes support image files only' });
      }
      const original =
        typeof m.filename === 'string' && m.filename.trim() ? sanitizeStoredOriginalName(m.filename) : 'upload.jpg';
      decoded.push({ buf, contentType: baseCt, original });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const owner = await client.query<{ customer_id: number | null; work_address_id: number | null }>(
        `SELECT j.customer_id, j.work_address_id
         FROM diary_events d
         INNER JOIN jobs j ON j.id = d.job_id
         WHERE d.id = $1`,
        [diaryEventId],
      );
      if ((owner.rowCount ?? 0) === 0 || owner.rows[0].customer_id == null) {
        throw new Error('Customer context missing for diary event');
      }
      const customerId = owner.rows[0].customer_id as number;
      const workAddressId = owner.rows[0].work_address_id ?? null;
      const ins = await client.query<{ id: number }>(
        `INSERT INTO customer_specific_notes (customer_id, title, description, work_address_id, media, created_by)
         VALUES ($1, $2, $3, $4, '[]'::jsonb, $5)
         RETURNING id`,
        [customerId, 'Technical note', notes, workAddressId, userId],
      );
      const noteId = ins.rows[0].id;
      const mediaJson: {
        stored_filename: string;
        original_filename: string;
        content_type: string;
        kind: string;
        byte_size: number;
      }[] = [];

      const dir = await ensureDiaryTechnicalNoteDir(diaryEventId, noteId);
      for (const d of decoded) {
        const ext = path.extname(d.original).slice(0, 32) || '.jpg';
        const storedFilename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
        const fullPath = path.join(dir, storedFilename);
        await fs.writeFile(fullPath, d.buf);
        mediaJson.push({
          stored_filename: storedFilename,
          original_filename: d.original,
          content_type: d.contentType,
          kind: 'image',
          byte_size: d.buf.length,
        });
      }

      await client.query(`UPDATE customer_specific_notes SET media = $1::jsonb WHERE id = $2`, [
        JSON.stringify(mediaJson),
        noteId,
      ]);
      await client.query('COMMIT');
      return res.status(201).json({
        id: noteId,
        message: 'Technical note saved',
        media: mediaJson.map((m) => ({
          ...m,
          file_path: `/diary-events/${diaryEventId}/technical-notes/${noteId}/files/${encodeURIComponent(m.stored_filename)}`,
        })),
      });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* */
      }
      console.error('technical note error:', e);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  },
);

app.get(
  '/api/diary-events/:id/extra-submissions/:sid/files/:file',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const eid = parseInt(String(req.params.id), 10);
    const sid = parseInt(String(req.params.sid), 10);
    const fileParam = req.params.file;
    const fileName = typeof fileParam === 'string' ? decodeURIComponent(fileParam) : '';
    if (!Number.isFinite(eid) || !Number.isFinite(sid) || !fileName || fileName.includes('..') || path.isAbsolute(fileName)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const access = await pool.query<{
      officer_id: number | null;
      job_officer_id: number | null;
      job_created_by: number | null;
    }>(
      `SELECT d.officer_id, j.officer_id AS job_officer_id, j.created_by AS job_created_by
       FROM diary_event_extra_submissions s
       INNER JOIN diary_events d ON d.id = s.diary_event_id
       INNER JOIN jobs j ON j.id = d.job_id
       WHERE s.diary_event_id = $1 AND s.id = $2`,
      [eid, sid],
    );
    if ((access.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: 'Not found' });
    }
    const acc = access.rows[0];
    const role = req.user!.role;
    const tokenOfficerId = req.user!.officerId ?? null;
    const isSuperAdmin = role === 'SUPER_ADMIN';
    if (diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null })) {
      const ok = acc.officer_id === tokenOfficerId || acc.job_officer_id === tokenOfficerId;
      if (!ok) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role === 'OFFICER') {
      return res.status(403).json({ message: 'Forbidden' });
    } else if (!isSuperAdmin && acc.job_created_by !== getTenantScopeUserId(req.user!)) {
      return res.status(404).json({ message: 'Not found' });
    }

    const fullPath = path.join(getDiaryExtraSubmissionsRootDir(), String(eid), String(sid), fileName);
    if (!fullPath.startsWith(getDiaryExtraSubmissionsRootDir())) {
      return res.status(400).json({ message: 'Invalid path' });
    }
    try {
      const st = await fs.stat(fullPath);
      const fileSize = st.size;
      const m = await pool.query<{ media: unknown }>(
        'SELECT media FROM diary_event_extra_submissions WHERE id = $1 AND diary_event_id = $2',
        [sid, eid],
      );
      if ((m.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Not found' });
      const list = m.rows[0].media as { stored_filename?: string; content_type?: string }[];
      const meta = Array.isArray(list) ? list.find((x) => x.stored_filename === fileName) : null;
      const ct = meta?.content_type && String(meta.content_type).trim() ? String(meta.content_type) : 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Accept-Ranges', 'bytes');

      /** AVPlayer / video_player use small Range probes; full-body 200 breaks CoreMedia (-12939). */
      const rangeRaw = req.headers.range;
      if (typeof rangeRaw === 'string') {
        const m = /^bytes=(.+)$/i.exec(rangeRaw.trim());
        if (m) {
          const spec = m[1].trim();
          let start = 0;
          let end = fileSize - 1;
          let parsed = false;
          if (spec.startsWith('-')) {
            const suffix = parseInt(spec.slice(1), 10);
            if (Number.isFinite(suffix) && suffix > 0) {
              start = Math.max(0, fileSize - suffix);
              end = fileSize - 1;
              parsed = true;
            }
          } else {
            const dash = spec.indexOf('-');
            if (dash >= 0) {
              const a = spec.slice(0, dash);
              const b = spec.slice(dash + 1);
              start = a === '' ? 0 : parseInt(a, 10);
              end = b === '' ? fileSize - 1 : parseInt(b, 10);
              if (!Number.isFinite(start) || start < 0) start = 0;
              if (!Number.isFinite(end)) end = fileSize - 1;
              parsed = true;
            }
          }
          if (parsed) {
            if (start >= fileSize || end < start) {
              res.status(416);
              res.setHeader('Content-Range', `bytes */${fileSize}`);
              return res.end();
            }
            if (end >= fileSize) end = fileSize - 1;
            const chunkSize = end - start + 1;
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', String(chunkSize));
            const stream = createReadStream(fullPath, { start, end });
            stream.on('error', () => {
              if (!res.writableEnded) res.destroy();
            });
            return stream.pipe(res);
          }
        }
      }

      res.setHeader('Content-Length', String(fileSize));
      const stream = createReadStream(fullPath);
      stream.on('error', () => {
        if (!res.writableEnded) res.destroy();
      });
      return stream.pipe(res);
    } catch {
      return res.status(404).json({ message: 'File not found' });
    }
  },
);

app.get(
  '/api/diary-events/:id/technical-notes/:sid/files/:file',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const eid = parseInt(String(req.params.id), 10);
    const sid = parseInt(String(req.params.sid), 10);
    const fileParam = req.params.file;
    const fileName = typeof fileParam === 'string' ? decodeURIComponent(fileParam) : '';
    if (!Number.isFinite(eid) || !Number.isFinite(sid) || !fileName || fileName.includes('..') || path.isAbsolute(fileName)) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const access = await pool.query<{
      officer_id: number | null;
      job_officer_id: number | null;
      job_created_by: number | null;
    }>(
      `SELECT d.officer_id, j.officer_id AS job_officer_id, j.created_by AS job_created_by
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       INNER JOIN customer_specific_notes n ON n.id = $2 AND n.customer_id = j.customer_id
         AND (n.work_address_id IS NULL OR n.work_address_id = j.work_address_id)
       WHERE d.id = $1`,
      [eid, sid],
    );
    if ((access.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: 'Not found' });
    }
    const acc = access.rows[0];
    const role = req.user!.role;
    const tokenOfficerId = req.user!.officerId ?? null;
    const isSuperAdmin = role === 'SUPER_ADMIN';
    if (diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null })) {
      const ok = acc.officer_id === tokenOfficerId || acc.job_officer_id === tokenOfficerId;
      if (!ok) return res.status(403).json({ message: 'Forbidden' });
    } else if (role === 'OFFICER') {
      return res.status(403).json({ message: 'Forbidden' });
    } else if (!isSuperAdmin && acc.job_created_by !== getTenantScopeUserId(req.user!)) {
      return res.status(404).json({ message: 'Not found' });
    }

    const fullPath = path.join(getDiaryTechnicalNotesRootDir(), String(eid), String(sid), fileName);
    if (!fullPath.startsWith(getDiaryTechnicalNotesRootDir())) {
      return res.status(400).json({ message: 'Invalid path' });
    }
    try {
      const st = await fs.stat(fullPath);
      const fileSize = st.size;
      const m = await pool.query<{ media: unknown }>(
        `SELECT n.media
         FROM customer_specific_notes n
         INNER JOIN diary_events d ON d.id = $2
         INNER JOIN jobs j ON j.id = d.job_id
         WHERE n.id = $1 AND n.customer_id = j.customer_id
           AND (n.work_address_id IS NULL OR n.work_address_id = j.work_address_id)`,
        [sid, eid],
      );
      if ((m.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Not found' });
      const list = m.rows[0].media as { stored_filename?: string; content_type?: string }[];
      const meta = Array.isArray(list) ? list.find((x) => x.stored_filename === fileName) : null;
      const ct = meta?.content_type && String(meta.content_type).trim() ? String(meta.content_type) : 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Length', String(fileSize));
      return createReadStream(fullPath).pipe(res);
    } catch {
      return res.status(404).json({ message: 'File not found' });
    }
  },
);

app.get('/api/jobs/:id/job-report-questions', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(jobId)) {
    return res.status(400).json({ message: 'Invalid job id' });
  }
  try {
    const result = await pool.query(
      `SELECT id, job_id, sort_order, question_type, prompt, helper_text, required
       FROM job_report_questions WHERE job_id = $1 ORDER BY sort_order ASC, id ASC`,
      [jobId],
    );
    return res.json({ questions: result.rows });
  } catch (error) {
    console.error('get job report questions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Plain-text summary from the most recent completed visit that has a job report (for invoice notes, etc.). */
app.get(
  '/api/jobs/:id/last-engineer-report-feedback',
  authenticate,
  requireTenantCrmAccess('jobs'),
  async (req: AuthenticatedRequest, res: Response) => {
    const jobId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(jobId)) {
      return res.status(400).json({ message: 'Invalid job id' });
    }
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    try {
      const jobChk = await pool.query<{ id: number }>(
        `SELECT id FROM jobs WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
        isSuperAdmin ? [jobId] : [jobId, userId],
      );
      if ((jobChk.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Job not found' });
      }

      const latest = await pool.query<{
        id: number;
        start_time: Date;
        notes: string | null;
        officer_full_name: string | null;
      }>(
        `SELECT d.id, d.start_time, d.notes, o.full_name AS officer_full_name
         FROM diary_events d
         INNER JOIN job_report_answers jra ON jra.diary_event_id = d.id
         LEFT JOIN officers o ON o.id = d.officer_id
         WHERE d.job_id = $1 AND LOWER(TRIM(d.status)) = 'completed'
         GROUP BY d.id, d.start_time, d.notes, o.full_name
         ORDER BY d.start_time DESC
         LIMIT 1`,
        [jobId],
      );
      if ((latest.rowCount ?? 0) === 0) {
        return res.json({ feedback: null as string | null });
      }
      const row = latest.rows[0];
      const diaryId = row.id;
      const visitStart = row.start_time as Date;
      const visitNotes = row.notes;
      const officerName = row.officer_full_name;
      const visitHeading = officerName?.trim()
        ? `${visitStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} — ${officerName.trim()}`
        : visitStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

      const answers = await pool.query<{
        value: string;
        prompt: string;
        question_type: string;
        sort_order: number;
      }>(
        `SELECT jra.value,
                COALESCE(NULLIF(TRIM(jra.prompt_snapshot), ''), NULLIF(TRIM(q.prompt), ''), 'Question') AS prompt,
                LOWER(TRIM(COALESCE(jra.question_type_snapshot, q.question_type, ''))) AS question_type,
                COALESCE(q.sort_order, 1000000)::int AS sort_order
         FROM job_report_answers jra
         LEFT JOIN job_report_questions q ON q.id = jra.question_id AND q.job_id = $2
         WHERE jra.diary_event_id = $1
         ORDER BY sort_order ASC, jra.question_id ASC`,
        [diaryId, jobId],
      );

      const extras = await pool.query<{ notes: string | null }>(
        `SELECT notes FROM diary_event_extra_submissions
         WHERE diary_event_id = $1 AND notes IS NOT NULL AND TRIM(notes) <> ''
         ORDER BY created_at ASC`,
        [diaryId],
      );

      const skipTypes = new Set(['customer_signature', 'officer_signature', 'before_photo', 'after_photo']);
      const parts: string[] = [];
      if (visitNotes != null && String(visitNotes).trim()) {
        parts.push(`Visit notes:\n${String(visitNotes).trim()}`);
      }
      for (const ex of extras.rows) {
        const n = ex.notes != null ? String(ex.notes).trim() : '';
        if (n) parts.push(`Engineer submission:\n${n}`);
      }
      for (const a of answers.rows) {
        if (skipTypes.has(a.question_type)) continue;
        const v = String(a.value || '').trim();
        if (!v || v.startsWith('data:')) continue;
        if (v.length > 12000) continue;
        parts.push(`${a.prompt}:\n${v}`);
      }

      if (parts.length === 0) {
        return res.json({ feedback: null as string | null });
      }
      const header = `Last job report — ${visitHeading}`;
      const feedback = `${header}\n\n${parts.join('\n\n')}`;
      return res.json({ feedback });
    } catch (error) {
      console.error('last engineer report feedback:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.get(
  '/api/settings/site-report-templates',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    const uid = getTenantScopeUserId(req.user!);
    try {
      await ensureFireRiskAssessmentTemplate(pool, uid);
      const result = await pool.query<{ id: number; name: string; slug: string | null; updated_at: Date }>(
        `SELECT id, name, slug, updated_at FROM site_report_templates
         WHERE created_by = $1
         ORDER BY CASE WHEN slug = 'fra' THEN 0 ELSE 1 END, name ASC`,
        [uid],
      );
      return res.json({
        templates: result.rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? ''),
          slug: r.slug,
          updated_at: (r.updated_at as Date).toISOString(),
        })),
      });
    } catch (error) {
      console.error('list site report templates error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.get(
  '/api/settings/site-report-templates/:templateId',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    const uid = getTenantScopeUserId(req.user!);
    const templateId = parseInt(String(req.params.templateId), 10);
    if (!Number.isFinite(templateId)) return res.status(400).json({ message: 'Invalid template id' });
    try {
      const row = await pool.query<{ id: number; name: string; slug: string | null; definition: unknown; updated_at: Date }>(
        `SELECT id, name, slug, definition, updated_at FROM site_report_templates WHERE id = $1 AND created_by = $2`,
        [templateId, uid],
      );
      if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Template not found' });
      const r = row.rows[0];
      return res.json({
        template: {
          id: Number(r.id),
          name: String(r.name ?? ''),
          slug: r.slug,
          definition: r.definition,
          updated_at: (r.updated_at as Date).toISOString(),
        },
      });
    } catch (error) {
      console.error('get site report template error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.put(
  '/api/settings/site-report-templates/:templateId',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    const uid = getTenantScopeUserId(req.user!);
    const templateId = parseInt(String(req.params.templateId), 10);
    if (!Number.isFinite(templateId)) return res.status(400).json({ message: 'Invalid template id' });
    const body = req.body as Record<string, unknown>;
    const defParsed = parseSiteReportTemplateDefinition(body.definition);
    if (!defParsed) return res.status(400).json({ message: 'Invalid definition JSON' });
    const nameRaw = typeof body.name === 'string' ? body.name.trim().slice(0, 255) : null;
    try {
      const own = await pool.query<{ slug: string | null }>(
        'SELECT slug FROM site_report_templates WHERE id = $1 AND created_by = $2',
        [templateId, uid],
      );
      if ((own.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Template not found' });
      const updates: string[] = ['definition = $1::jsonb', 'updated_at = NOW()', 'updated_by = $2'];
      const vals: unknown[] = [JSON.stringify(defParsed), uid];
      let n = 3;
      if (nameRaw) {
        updates.push(`name = $${n++}`);
        vals.push(nameRaw);
      }
      vals.push(templateId, uid);
      await pool.query(
        `UPDATE site_report_templates SET ${updates.join(', ')} WHERE id = $${n++} AND created_by = $${n}`,
        vals,
      );
      const row = await pool.query<{ id: number; name: string; slug: string | null; definition: unknown; updated_at: Date }>(
        `SELECT id, name, slug, definition, updated_at FROM site_report_templates WHERE id = $1`,
        [templateId],
      );
      const r = row.rows[0];
      return res.json({
        template: {
          id: Number(r.id),
          name: String(r.name ?? ''),
          slug: r.slug,
          definition: r.definition,
          updated_at: (r.updated_at as Date).toISOString(),
        },
      });
    } catch (error) {
      console.error('put site report template error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.post(
  '/api/settings/site-report-templates/fra/reset',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    const uid = getTenantScopeUserId(req.user!);
    try {
      const id = await ensureFireRiskAssessmentTemplate(pool, uid);
      const def = getFraTemplateDefinition();
      await pool.query(
        `UPDATE site_report_templates SET definition = $1::jsonb, name = $2, updated_at = NOW(), updated_by = $3 WHERE id = $4 AND created_by = $5`,
        [JSON.stringify(def), 'Fire Risk Assessment', uid, id, uid],
      );
      const row = await pool.query<{ id: number; name: string; slug: string | null; definition: unknown; updated_at: Date }>(
        `SELECT id, name, slug, definition, updated_at FROM site_report_templates WHERE id = $1`,
        [id],
      );
      const r = row.rows[0];
      return res.json({
        template: {
          id: Number(r.id),
          name: String(r.name ?? ''),
          slug: r.slug,
          definition: r.definition,
          updated_at: (r.updated_at as Date).toISOString(),
        },
      });
    } catch (error) {
      console.error('reset fra site report template error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.post(
  '/api/settings/site-report-templates',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    const uid = getTenantScopeUserId(req.user!);
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 255) : '';
    if (!name) return res.status(400).json({ message: 'name is required' });
    try {
      let definition = parseSiteReportTemplateDefinition(body.definition);
      if (!definition) {
        const dupId =
          typeof body.duplicate_from_template_id === 'number' && Number.isFinite(body.duplicate_from_template_id)
            ? Math.trunc(body.duplicate_from_template_id as number)
            : typeof body.duplicate_from_template_id === 'string' && String(body.duplicate_from_template_id).trim()
              ? parseInt(String(body.duplicate_from_template_id).trim(), 10)
              : NaN;
        if (!Number.isFinite(dupId)) {
          return res.status(400).json({ message: 'definition or duplicate_from_template_id is required' });
        }
        const src = await pool.query<{ definition: unknown }>(
          'SELECT definition FROM site_report_templates WHERE id = $1 AND created_by = $2',
          [dupId, uid],
        );
        if ((src.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Source template not found' });
        definition = parseSiteReportTemplateDefinition(src.rows[0].definition);
        if (!definition) return res.status(400).json({ message: 'Source template definition invalid' });
      }
      const ins = await pool.query<{ id: number; updated_at: Date }>(
        `INSERT INTO site_report_templates (name, slug, definition, created_by, updated_by, updated_at)
         VALUES ($1, NULL, $2::jsonb, $3, $3, NOW())
         RETURNING id, updated_at`,
        [name, JSON.stringify(definition), uid],
      );
      return res.status(201).json({
        template: {
          id: Number(ins.rows[0].id),
          name,
          slug: null as string | null,
          definition,
          updated_at: (ins.rows[0].updated_at as Date).toISOString(),
        },
      });
    } catch (error) {
      console.error('create site report template error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.put('/api/jobs/:id/job-report-questions', authenticate, requireTenantCrmAccess('jobs'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(jobId)) {
    return res.status(400).json({ message: 'Invalid job id' });
  }
  const raw = req.body as { questions?: unknown };
  if (!Array.isArray(raw.questions)) {
    return res.status(400).json({ message: 'Body must include questions array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const jobExists = await client.query('SELECT 1 FROM jobs WHERE id = $1', [jobId]);
    if ((jobExists.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Job not found' });
    }

    await client.query(
      `UPDATE job_report_answers jra
       SET prompt_snapshot = q.prompt,
           question_type_snapshot = q.question_type,
           helper_text_snapshot = q.helper_text
       FROM job_report_questions q
       WHERE jra.question_id = q.id AND q.job_id = $1`,
      [jobId],
    );

    await client.query('DELETE FROM job_report_questions WHERE job_id = $1', [jobId]);

    let order = 0;
    for (const item of raw.questions) {
      if (!item || typeof item !== 'object') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Each question must be an object' });
      }
      const q = item as Record<string, unknown>;
      const questionType = typeof q.question_type === 'string' ? q.question_type.trim() : '';
      const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : '';
      if (!prompt) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Each question needs a non-empty prompt' });
      }
      if (!isJobReportQuestionType(questionType)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Invalid question_type "${questionType}". Allowed: ${JOB_REPORT_QUESTION_TYPES.join(', ')}`,
        });
      }
      const helperText =
        typeof q.helper_text === 'string' && q.helper_text.trim() ? q.helper_text.trim() : null;
      const required = q.required === false ? false : true;
      const sortOrder =
        typeof q.sort_order === 'number' && Number.isFinite(q.sort_order)
          ? Math.round(q.sort_order)
          : order;
      await client.query(
        `INSERT INTO job_report_questions (job_id, sort_order, question_type, prompt, helper_text, required)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [jobId, sortOrder, questionType, prompt, helperText, required],
      );
      order += 1;
    }

    await client.query('COMMIT');
    const result = await pool.query(
      `SELECT id, job_id, sort_order, question_type, prompt, helper_text, required
       FROM job_report_questions WHERE job_id = $1 ORDER BY sort_order ASC, id ASC`,
      [jobId],
    );
    return res.json({ questions: result.rows });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('put job report questions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.get(
  '/api/settings/job-report-template',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT id, sort_order, question_type, prompt, helper_text, required
         FROM job_report_default_questions ORDER BY sort_order ASC, id ASC`,
      );
      return res.json({ questions: result.rows });
    } catch (error) {
      console.error('get default job report template error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.put(
  '/api/settings/job-report-template',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    const raw = req.body as { questions?: unknown };
    if (!Array.isArray(raw.questions)) {
      return res.status(400).json({ message: 'Body must include questions array' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM job_report_default_questions');
      let order = 0;
      for (const item of raw.questions) {
        if (!item || typeof item !== 'object') {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Each question must be an object' });
        }
        const q = item as Record<string, unknown>;
        const questionType = typeof q.question_type === 'string' ? q.question_type.trim() : '';
        const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : '';
        if (!prompt) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Each question needs a non-empty prompt' });
        }
        if (!isJobReportQuestionType(questionType)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: `Invalid question_type "${questionType}". Allowed: ${JOB_REPORT_QUESTION_TYPES.join(', ')}`,
          });
        }
        const helperText =
          typeof q.helper_text === 'string' && q.helper_text.trim() ? q.helper_text.trim() : null;
        const required = q.required === false ? false : true;
        const sortOrder =
          typeof q.sort_order === 'number' && Number.isFinite(q.sort_order)
            ? Math.round(q.sort_order)
            : order;
        await client.query(
          `INSERT INTO job_report_default_questions (sort_order, question_type, prompt, helper_text, required)
           VALUES ($1, $2, $3, $4, $5)`,
          [sortOrder, questionType, prompt, helperText, required],
        );
        order += 1;
      }
      await client.query('COMMIT');
      const result = await pool.query(
        `SELECT id, sort_order, question_type, prompt, helper_text, required
         FROM job_report_default_questions ORDER BY sort_order ASC, id ASC`,
      );
      return res.json({ questions: result.rows });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('put default job report template error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  },
);

/** Reasons shown when aborting a visit (mobile + web); list is editable under Settings (admin). */
app.get('/api/diary-abort-reasons', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query<{ id: number; label: string; sort_order: number }>(
      `SELECT id, label, sort_order FROM diary_abort_reasons ORDER BY sort_order ASC, id ASC`,
    );
    return res.json({ reasons: result.rows });
  } catch (error) {
    console.error('get diary abort reasons error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put(
  '/api/settings/diary-abort-reasons',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    const raw = req.body as { reasons?: unknown };
    if (!Array.isArray(raw.reasons)) {
      return res.status(400).json({ message: 'Body must include reasons array' });
    }
    if (raw.reasons.length === 0) {
      return res.status(400).json({ message: 'Keep at least one abort reason.' });
    }
    const labels: string[] = [];
    const seen = new Set<string>();
    for (const item of raw.reasons) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ message: 'Each reason must be an object with label' });
      }
      const o = item as Record<string, unknown>;
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      if (!label) {
        return res.status(400).json({ message: 'Each reason needs a non-empty label' });
      }
      if (label.length > 500) {
        return res.status(400).json({ message: 'Each reason label must be at most 500 characters' });
      }
      const key = label.toLowerCase();
      if (seen.has(key)) {
        return res.status(400).json({ message: 'Duplicate reason labels are not allowed' });
      }
      seen.add(key);
      labels.push(label);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM diary_abort_reasons`);
      let order = 0;
      for (const label of labels) {
        await client.query(
          `INSERT INTO diary_abort_reasons (label, sort_order) VALUES ($1, $2)`,
          [label, order],
        );
        order += 1;
      }
      await client.query('COMMIT');
      const result = await pool.query<{ id: number; label: string; sort_order: number }>(
        `SELECT id, label, sort_order FROM diary_abort_reasons ORDER BY sort_order ASC, id ASC`,
      );
      return res.json({ reasons: result.rows });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('put diary abort reasons error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  },
);

app.get('/api/diary-events/:id/job-report', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const diaryEventId = parseInt(String(idParam), 10);
  if (!Number.isFinite(diaryEventId)) {
    return res.status(400).json({ message: 'Invalid event id' });
  }

  try {
    const base = await pool.query<{
      job_id: number;
      officer_id: number | null;
      job_officer_id: number | null;
      event_status: string;
    }>(
      `SELECT d.job_id, d.officer_id, j.officer_id AS job_officer_id, d.status AS event_status
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       WHERE d.id = $1`,
      [diaryEventId],
    );
    if ((base.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    const row = base.rows[0];
    const role = req.user!.role;
    const tokenOfficerId = req.user!.officerId ?? null;
    if (diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null })) {
      const assigned =
        row.officer_id === tokenOfficerId || row.job_officer_id === tokenOfficerId;
      if (!assigned) {
        return res.status(403).json({ message: 'You can only view diary visits assigned to you' });
      }
    }

    const aRes = await pool.query<{
      question_id: number;
      value: string;
      prompt_snapshot: string | null;
      question_type_snapshot: string | null;
      helper_text_snapshot: string | null;
      q_prompt: string | null;
      q_type: string | null;
      q_helper: string | null;
      q_required: boolean | null;
      q_sort: number | null;
    }>(
      `SELECT jra.question_id, jra.value, jra.prompt_snapshot, jra.question_type_snapshot, jra.helper_text_snapshot,
              q.prompt AS q_prompt, q.question_type AS q_type, q.helper_text AS q_helper, q.required AS q_required, q.sort_order AS q_sort
       FROM job_report_answers jra
       LEFT JOIN job_report_questions q ON q.id = jra.question_id AND q.job_id = $1
       WHERE jra.diary_event_id = $2
       ORDER BY COALESCE(q.sort_order, 1000000), jra.question_id`,
      [row.job_id, diaryEventId],
    );

    const answers: Record<string, string> = {};
    for (const a of aRes.rows) {
      answers[String(a.question_id)] = a.value;
    }

    let questions: {
      id: number;
      job_id: number;
      sort_order: number;
      question_type: string;
      prompt: string;
      helper_text: string | null;
      required: boolean;
    }[];

    if (aRes.rows.length > 0) {
      questions = aRes.rows.map((a, idx) => {
        const prompt =
          (a.q_prompt && String(a.q_prompt).trim()) ||
          (a.prompt_snapshot && String(a.prompt_snapshot).trim()) ||
          `Question #${a.question_id}`;
        const questionType =
          (a.q_type && String(a.q_type).trim()) ||
          (a.question_type_snapshot && String(a.question_type_snapshot).trim()) ||
          'text';
        const helperText =
          a.q_helper != null && String(a.q_helper).trim()
            ? String(a.q_helper).trim()
            : a.helper_text_snapshot != null && String(a.helper_text_snapshot).trim()
              ? String(a.helper_text_snapshot).trim()
              : null;
        const sortOrder = a.q_sort != null ? Number(a.q_sort) : idx;
        const required = a.q_required != null ? !!a.q_required : false;
        return {
          id: a.question_id,
          job_id: row.job_id,
          sort_order: sortOrder,
          question_type: questionType,
          prompt,
          helper_text: helperText,
          required,
        };
      });
    } else {
      const qRes = await pool.query(
        `SELECT id, job_id, sort_order, question_type, prompt, helper_text, required
         FROM job_report_questions WHERE job_id = $1 ORDER BY sort_order ASC, id ASC`,
        [row.job_id],
      );
      questions = qRes.rows as typeof questions;
    }

    return res.json({
      diary_event_id: diaryEventId,
      job_id: row.job_id,
      event_status: row.event_status,
      questions,
      answers,
    });
  } catch (error) {
    console.error('get diary job report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Auto-save job report answers (partial) without completing the visit or changing job state. */
app.post('/api/diary-events/:id/job-report/draft', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const diaryEventId = parseInt(String(idParam), 10);
  const role = req.user!.role;
  const tokenOfficerId = req.user!.officerId ?? null;

  if (!Number.isFinite(diaryEventId)) {
    return res.status(400).json({ message: 'Invalid event id' });
  }

  const body = req.body as { answers?: unknown };
  if (!Array.isArray(body.answers)) {
    return res.status(400).json({ message: 'Body must include answers array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eventRes = await client.query<{
      job_id: number;
      officer_id: number | null;
      job_officer_id: number | null;
      event_status: string;
    }>(
      `SELECT d.job_id, d.officer_id, j.officer_id AS job_officer_id, d.status AS event_status
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       WHERE d.id = $1`,
      [diaryEventId],
    );
    if ((eventRes.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Event not found' });
    }
    const ev = eventRes.rows[0];

    if (diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null })) {
      const assigned = ev.officer_id === tokenOfficerId || ev.job_officer_id === tokenOfficerId;
      if (!assigned) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'You can only update job reports for your visits' });
      }
    } else if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Forbidden' });
    }

    const statusNorm = normalizeDiaryStatusForTimesheet(ev.event_status);
    if (statusNorm === 'completed' || statusNorm === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This visit is already closed' });
    }
    const isFieldOfficer = diaryActsAsFieldOfficer(req, {
      role,
      officerId: tokenOfficerId,
      permissions: req.user!.permissions ?? null,
    });
    if (isFieldOfficer && !diaryStatusAllowsJobReportDraft(ev.event_status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Draft save is only available while travelling to site or on site.',
      });
    }

    const questionsRes = await client.query<{
      id: number;
      question_type: string;
      required: boolean;
      prompt: string;
      helper_text: string | null;
    }>(
      `SELECT id, question_type, required, prompt, helper_text FROM job_report_questions WHERE job_id = $1 ORDER BY sort_order ASC, id ASC`,
      [ev.job_id],
    );
    const questions = questionsRes.rows;
    if (questions.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This job has no job report questions configured.' });
    }

    const allowedIds = new Set(questions.map((q) => q.id));
    const answerMap = new Map<number, string>();
    for (const raw of body.answers) {
      if (!raw || typeof raw !== 'object') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Each answer must be an object with question_id and value' });
      }
      const a = raw as Record<string, unknown>;
      const qid = typeof a.question_id === 'number' ? a.question_id : parseInt(String(a.question_id), 10);
      if (!Number.isFinite(qid) || !allowedIds.has(qid)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Unknown or invalid question_id: ${a.question_id}` });
      }
      const value = typeof a.value === 'string' ? a.value : '';
      answerMap.set(qid, value);
    }

    for (const q of questions) {
      const v = answerMap.get(q.id);
      if (v !== undefined && jobReportAnswerIsPresent(v)) {
        await client.query(
          `INSERT INTO job_report_answers (diary_event_id, question_id, value, prompt_snapshot, question_type_snapshot, helper_text_snapshot, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (diary_event_id, question_id)
           DO UPDATE SET value = EXCLUDED.value,
             prompt_snapshot = EXCLUDED.prompt_snapshot,
             question_type_snapshot = EXCLUDED.question_type_snapshot,
             helper_text_snapshot = EXCLUDED.helper_text_snapshot,
             updated_at = NOW()`,
          [
            diaryEventId,
            q.id,
            v.trim(),
            q.prompt,
            q.question_type,
            q.helper_text != null && String(q.helper_text).trim() ? String(q.helper_text).trim() : null,
          ],
        );
      } else if (v !== undefined && !jobReportAnswerIsPresent(v)) {
        await client.query('DELETE FROM job_report_answers WHERE diary_event_id = $1 AND question_id = $2', [
          diaryEventId,
          q.id,
        ]);
      }
    }

    await client.query('COMMIT');
    return res.json({ ok: true, saved_at: new Date().toISOString() });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('draft diary job report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

/** Completed visits on the same job with job report answers (excludes signature fields) plus extra submissions per visit. */
app.get(
  '/api/diary-events/:id/job-report-history',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const diaryEventId = parseInt(String(idParam), 10);
    if (!Number.isFinite(diaryEventId)) {
      return res.status(400).json({ message: 'Invalid event id' });
    }

    try {
      const base = await pool.query<{
        job_id: number;
        officer_id: number | null;
        job_officer_id: number | null;
      }>(
        `SELECT d.job_id, d.officer_id, j.officer_id AS job_officer_id
         FROM diary_events d
         INNER JOIN jobs j ON j.id = d.job_id
         WHERE d.id = $1`,
        [diaryEventId],
      );
      if ((base.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Event not found' });
      }
      const row = base.rows[0];
      const role = req.user!.role;
      const tokenOfficerId = req.user!.officerId ?? null;
      if (diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null })) {
        const assigned =
          row.officer_id === tokenOfficerId || row.job_officer_id === tokenOfficerId;
        if (!assigned) {
          return res.status(403).json({ message: 'You can only view diary visits assigned to you' });
        }
      }

      const histRes = await pool.query<{
        diary_event_id: number;
        start_time: Date;
        officer_full_name: string | null;
        question_id: number;
        value: string;
        prompt: string;
        question_type: string;
        sort_order: number;
        helper_text: string | null;
      }>(
        `SELECT d.id AS diary_event_id,
                d.start_time,
                o.full_name AS officer_full_name,
                jra.question_id,
                jra.value,
                COALESCE(NULLIF(TRIM(jra.prompt_snapshot), ''), NULLIF(TRIM(q.prompt), ''), 'Question') AS prompt,
                COALESCE(
                  NULLIF(TRIM(jra.question_type_snapshot), ''),
                  NULLIF(TRIM(q.question_type), ''),
                  'text'
                ) AS question_type,
                COALESCE(q.sort_order, 1000000)::int AS sort_order,
                NULLIF(
                  TRIM(
                    COALESCE(
                      NULLIF(TRIM(jra.helper_text_snapshot), ''),
                      NULLIF(TRIM(q.helper_text), '')
                    )
                  ),
                  ''
                ) AS helper_text
         FROM diary_events d
         INNER JOIN job_report_answers jra ON jra.diary_event_id = d.id
         LEFT JOIN job_report_questions q ON q.id = jra.question_id AND q.job_id = d.job_id
         LEFT JOIN officers o ON o.id = d.officer_id
         WHERE d.job_id = $1
           AND LOWER(TRIM(d.status)) = 'completed'
           AND LOWER(TRIM(COALESCE(jra.question_type_snapshot, q.question_type, ''))) NOT IN (
             'customer_signature',
             'officer_signature'
           )
         ORDER BY d.start_time DESC, sort_order ASC, jra.question_id ASC`,
        [row.job_id],
      );

      type ExtraSubmissionJson = {
        id: number;
        notes: string | null;
        created_at: string;
        created_by_name: string | null;
        display_name: string | null;
        media: Array<{
          original_filename: string;
          content_type: string;
          kind: string;
          byte_size: number;
          file_path: string;
        }>;
      };

      type Submission = {
        diary_event_id: number;
        start_time: string;
        officer_full_name: string | null;
        answers: Array<{
          question_id: number;
          prompt: string;
          question_type: string;
          value: string;
          helper_text: string | null;
        }>;
        extra_submissions: ExtraSubmissionJson[];
      };

      const byDiary = new Map<number, Submission>();
      for (const r of histRes.rows) {
        let sub = byDiary.get(r.diary_event_id);
        if (!sub) {
          sub = {
            diary_event_id: r.diary_event_id,
            start_time: (r.start_time as Date).toISOString(),
            officer_full_name: r.officer_full_name ?? null,
            answers: [],
            extra_submissions: [],
          };
          byDiary.set(r.diary_event_id, sub);
        }
        const ht = r.helper_text != null && String(r.helper_text).trim() ? String(r.helper_text).trim() : null;
        sub.answers.push({
          question_id: r.question_id,
          prompt: r.prompt,
          question_type: r.question_type,
          value: r.value,
          helper_text: ht,
        });
      }

      const diaryIds = Array.from(byDiary.keys());
      const extrasByDiary = new Map<number, ExtraSubmissionJson[]>();
      if (diaryIds.length > 0) {
        const exRes = await pool.query<{
          diary_event_id: number;
          id: number;
          notes: string | null;
          media: unknown;
          created_at: Date;
          created_by_name: string | null;
        }>(
          `SELECT s.diary_event_id, s.id, s.notes, s.media, s.created_at,
                  COALESCE(u.full_name, u.email) AS created_by_name
           FROM diary_event_extra_submissions s
           LEFT JOIN users u ON u.id = s.created_by
           WHERE s.diary_event_id = ANY($1::int[])
           ORDER BY s.diary_event_id, s.created_at ASC`,
          [diaryIds],
        );
        for (const r of exRes.rows) {
          const sub = byDiary.get(r.diary_event_id);
          const visitEngineerName = (() => {
            const s = sub?.officer_full_name ?? null;
            return s != null && s.trim() !== '' ? s.trim() : null;
          })();
          const uploader = r.created_by_name ?? null;
          const mediaArr = Array.isArray(r.media) ? (r.media as Record<string, unknown>[]) : [];
          const shaped: ExtraSubmissionJson = {
            id: r.id,
            notes: r.notes,
            created_at: (r.created_at as Date).toISOString(),
            created_by_name: uploader,
            display_name: visitEngineerName ?? uploader,
            media: mediaArr.map((m) => {
              const stored = String(m.stored_filename ?? '');
              const orig = String(m.original_filename ?? 'file');
              const ct = String(m.content_type ?? 'application/octet-stream');
              const kind = String(
                m.kind && String(m.kind).trim()
                  ? m.kind
                  : ct.startsWith('video/')
                    ? 'video'
                    : 'image',
              );
              return {
                original_filename: orig,
                content_type: ct,
                kind,
                byte_size: m.byte_size != null ? Number(m.byte_size) : 0,
                file_path: `/diary-events/${r.diary_event_id}/extra-submissions/${r.id}/files/${encodeURIComponent(stored)}`,
              };
            }),
          };
          const list = extrasByDiary.get(r.diary_event_id) ?? [];
          list.push(shaped);
          extrasByDiary.set(r.diary_event_id, list);
        }
      }
      for (const [did, sub] of byDiary) {
        sub.extra_submissions = extrasByDiary.get(did) ?? [];
      }

      return res.json({ submissions: Array.from(byDiary.values()) });
    } catch (error) {
      console.error('get diary job report history error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

/** Admin: timesheet segments tied to a diary visit (field app clock segments with diary_event_id). */
app.get('/api/diary-events/:id/timesheet', authenticate, requireAdmin, requirePermission('scheduling'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const diaryEventId = parseInt(String(idParam), 10);
  if (!Number.isFinite(diaryEventId)) {
    return res.status(400).json({ message: 'Invalid event id' });
  }

  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const access = await pool.query<{ id: number; created_by: number | null }>(
      `SELECT d.id, j.created_by
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       WHERE d.id = $1`,
      [diaryEventId],
    );
    if ((access.rowCount ?? 0) === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    const acc = access.rows[0];
    if (!isSuperAdmin && acc.created_by !== userId) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const result = await pool.query(
      `SELECT te.id, te.officer_id, te.clock_in, te.clock_out, te.notes, te.segment_type, te.diary_event_id,
              EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in))::bigint AS duration_seconds,
              o.full_name AS officer_full_name
       FROM timesheet_entries te
       LEFT JOIN officers o ON o.id = te.officer_id
       WHERE te.diary_event_id = $1
       ORDER BY te.clock_in ASC`,
      [diaryEventId],
    );

    const entries = result.rows.map((r) => ({
      id: r.id as number,
      officer_id: r.officer_id as number,
      officer_full_name: (r.officer_full_name as string | null) ?? null,
      clock_in: (r.clock_in as Date).toISOString(),
      clock_out: r.clock_out ? (r.clock_out as Date).toISOString() : null,
      notes: r.notes as string | null,
      segment_type: (r.segment_type as string | null) ?? null,
      diary_event_id: (r.diary_event_id as number | null) ?? null,
      duration_seconds: Number(r.duration_seconds),
    }));

    return res.json({ entries });
  } catch (error) {
    console.error('get diary event timesheet error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/diary-events/:id/job-report/submit', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const diaryEventId = parseInt(String(idParam), 10);
  const userId = getTenantScopeUserId(req.user!);
  const role = req.user!.role;
  const tokenOfficerId = req.user!.officerId ?? null;

  if (!Number.isFinite(diaryEventId)) {
    return res.status(400).json({ message: 'Invalid event id' });
  }

  const body = req.body as { answers?: unknown; next_job_state?: unknown };
  if (!Array.isArray(body.answers)) {
    return res.status(400).json({ message: 'Body must include answers array' });
  }
  const nextJobState = parsePostReportNextJobState(body.next_job_state);
  if (!nextJobState) {
    return res.status(400).json({
      message:
        'next_job_state is required. Allowed: unscheduled, scheduled, rescheduled, paused, created, in_progress, completed.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const eventRes = await client.query<{
      job_id: number;
      officer_id: number | null;
      job_officer_id: number | null;
      event_status: string;
    }>(
      `SELECT d.job_id, d.officer_id, j.officer_id AS job_officer_id, d.status AS event_status
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       WHERE d.id = $1
       FOR UPDATE OF d`,
      [diaryEventId],
    );
    if ((eventRes.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Event not found' });
    }
    const ev = eventRes.rows[0];

    if (diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null })) {
      const assigned =
        ev.officer_id === tokenOfficerId || ev.job_officer_id === tokenOfficerId;
      if (!assigned) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'You can only submit job reports for your visits' });
      }
    } else if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Forbidden' });
    }

    const statusNorm = normalizeDiaryStatusForTimesheet(ev.event_status);
    if (statusNorm === 'completed' || statusNorm === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This visit is already closed' });
    }
    const isFieldOfficer = diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null });
    if (isFieldOfficer && statusNorm !== 'arrived_at_site') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Job report can only be submitted while you are on site (mark “Arrived at site” first).',
      });
    }

    const questionsRes = await client.query<{
      id: number;
      question_type: string;
      required: boolean;
      prompt: string;
      helper_text: string | null;
    }>(
      `SELECT id, question_type, required, prompt, helper_text FROM job_report_questions WHERE job_id = $1 ORDER BY sort_order ASC, id ASC`,
      [ev.job_id],
    );
    const questions = questionsRes.rows;
    if (questions.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'This job has no job report questions configured. Complete the visit from the visit screen instead.',
      });
    }

    const allowedIds = new Set(questions.map((q) => q.id));
    const answerMap = new Map<number, string>();
    for (const raw of body.answers) {
      if (!raw || typeof raw !== 'object') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Each answer must be an object with question_id and value' });
      }
      const a = raw as Record<string, unknown>;
      const qid = typeof a.question_id === 'number' ? a.question_id : parseInt(String(a.question_id), 10);
      if (!Number.isFinite(qid) || !allowedIds.has(qid)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Unknown or invalid question_id: ${a.question_id}` });
      }
      const value = typeof a.value === 'string' ? a.value : '';
      answerMap.set(qid, value);
    }

    for (const q of questions) {
      if (!q.required) continue;
      const v = answerMap.get(q.id);
      if (!jobReportAnswerIsPresent(v)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Required answer missing or empty for question id ${q.id} (${q.question_type})`,
        });
      }
    }

    for (const q of questions) {
      const v = answerMap.get(q.id);
      if (jobReportAnswerIsPresent(v)) {
        await client.query(
          `INSERT INTO job_report_answers (diary_event_id, question_id, value, prompt_snapshot, question_type_snapshot, helper_text_snapshot, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (diary_event_id, question_id)
           DO UPDATE SET value = EXCLUDED.value,
             prompt_snapshot = EXCLUDED.prompt_snapshot,
             question_type_snapshot = EXCLUDED.question_type_snapshot,
             helper_text_snapshot = EXCLUDED.helper_text_snapshot,
             updated_at = NOW()`,
          [
            diaryEventId,
            q.id,
            v!.trim(),
            q.prompt,
            q.question_type,
            q.helper_text != null && String(q.helper_text).trim() ? String(q.helper_text).trim() : null,
          ],
        );
      } else {
        await client.query(
          'DELETE FROM job_report_answers WHERE diary_event_id = $1 AND question_id = $2',
          [diaryEventId, q.id],
        );
      }
    }

    const storedStatus = persistedDiaryStatus('completed');
    await client.query(
      'UPDATE diary_events SET status = $1, updated_at = NOW() WHERE id = $2',
      [storedStatus, diaryEventId],
    );

    const timesheetOfficerId = ev.officer_id ?? ev.job_officer_id;
    if (timesheetOfficerId != null) {
      await applyDiaryStatusToTimesheet(client, timesheetOfficerId, diaryEventId, 'completed');
    }

    await client.query(`UPDATE jobs SET state = $1, updated_at = NOW() WHERE id = $2`, [
      nextJobState,
      ev.job_id,
    ]);

    await client.query('COMMIT');

    let autoInvoiceId: number | null = null;
    if (nextJobState === 'completed') {
      try {
        autoInvoiceId = await createInvoiceFromJob(ev.job_id, userId);
      } catch (invErr) {
        console.error('Auto invoice after job report submit:', invErr);
      }
    }

    return res.json({
      message: 'Job report saved and visit completed',
      status: storedStatus,
      job_state: nextJobState,
      invoice_id: autoInvoiceId,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('submit diary job report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.get('/api/jobs/:id/diary-events', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const du1 = req.user!;
  if (du1.role === 'STAFF' && !assertStaffPermissionAny(du1, ['jobs', 'scheduling'])) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  }
  try {
    const jobId = parseInt(String(req.params.id), 10);
    if (du1.role !== 'SUPER_ADMIN' && du1.role !== 'OFFICER') {
      const own = await pool.query<{ created_by: number | null }>('SELECT created_by FROM jobs WHERE id = $1', [jobId]);
      if ((own.rowCount ?? 0) === 0 || own.rows[0].created_by !== getTenantScopeUserId(du1)) {
        return res.status(404).json({ message: 'Job not found' });
      }
    }
    const result = await pool.query(
      `SELECT d.*, o.full_name AS officer_full_name,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', jc.title, jc.first_name, jc.surname)), ''),
                NULLIF(TRIM(j.contact_name), ''),
                c.full_name
              ) AS site_contact_name,
              COALESCE(NULLIF(TRIM(jc.email), ''), c.email) AS site_contact_email,
              COALESCE(
                CASE WHEN jc.id IS NOT NULL THEN COALESCE(NULLIF(TRIM(jc.mobile), ''), NULLIF(TRIM(jc.landline), '')) END,
                COALESCE(NULLIF(TRIM(c.contact_mobile), ''), NULLIF(TRIM(c.phone), ''))
              ) AS site_contact_phone
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       LEFT JOIN customers c ON c.id = j.customer_id
       LEFT JOIN customer_contacts jc ON jc.id = j.job_contact_id
       LEFT JOIN officers o ON o.id = d.officer_id
       WHERE d.job_id = $1
       ORDER BY d.start_time ASC`,
      [jobId]
    );
    res.json({ events: result.rows });
  } catch (error) {
    console.error('get job diary events error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

function escapeHtmlForEmail(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Send customer / engineer diary reminder emails and record sent_at on the visit. */
app.post('/api/diary-events/:id/send-reminder', authenticate, requireAdmin, requirePermission('scheduling'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const diaryId = parseInt(String(idParam), 10);
  if (!Number.isFinite(diaryId)) return res.status(400).json({ message: 'Invalid event id' });

  const raw = req.body as { kind?: unknown };
  const kind =
    typeof raw.kind === 'string' && ['customer_confirmation', 'address_reminder', 'engineer_job_sheet'].includes(raw.kind)
      ? raw.kind
      : '';
  if (!kind) {
    return res.status(400).json({
      message: 'kind must be one of: customer_confirmation, address_reminder, engineer_job_sheet',
    });
  }

  const userId = getTenantScopeUserId(req.user!);
  const colMap: Record<string, string> = {
    customer_confirmation: 'customer_confirmation_sent_at',
    address_reminder: 'address_reminder_sent_at',
    engineer_job_sheet: 'engineer_job_sheet_sent_at',
  };
  const stampCol = colMap[kind];

  try {
    const ev = await pool.query<{
      id: number;
      job_id: number;
      start_time: Date;
      duration_minutes: number | null;
      job_title: string | null;
      customer_full_name: string | null;
      customer_email: string | null;
      customer_phone: string | null;
      site_address: string | null;
      officer_full_name: string | null;
      officer_email: string | null;
      site_contact_name: string | null;
      site_contact_email: string | null;
      site_contact_phone: string | null;
    }>(
      `SELECT d.id, d.job_id, d.start_time, d.duration_minutes,
              j.title AS job_title,
              c.full_name AS customer_full_name, c.email AS customer_email,
              COALESCE(NULLIF(TRIM(c.contact_mobile), ''), NULLIF(TRIM(c.phone), '')) AS customer_phone,
              TRIM(CONCAT_WS(', ',
                NULLIF(TRIM(c.address_line_1), ''),
                NULLIF(TRIM(c.town), ''),
                NULLIF(TRIM(c.postcode), '')
              )) AS site_address,
              o.full_name AS officer_full_name, o.email AS officer_email,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', jc.title, jc.first_name, jc.surname)), ''),
                NULLIF(TRIM(j.contact_name), ''),
                c.full_name
              ) AS site_contact_name,
              COALESCE(NULLIF(TRIM(jc.email), ''), c.email) AS site_contact_email,
              COALESCE(
                CASE WHEN jc.id IS NOT NULL THEN COALESCE(NULLIF(TRIM(jc.mobile), ''), NULLIF(TRIM(jc.landline), '')) END,
                COALESCE(NULLIF(TRIM(c.contact_mobile), ''), NULLIF(TRIM(c.phone), ''))
              ) AS site_contact_phone
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       LEFT JOIN customers c ON c.id = j.customer_id
       LEFT JOIN customer_contacts jc ON jc.id = j.job_contact_id
       LEFT JOIN officers o ON o.id = d.officer_id
       WHERE d.id = $1`,
      [diaryId],
    );
    if ((ev.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Diary event not found' });
    const row = ev.rows[0];

    const emailCfg = await loadEmailSettingsPayload(userId);
    const canSendMail = emailCfg.oauth_provider || (emailCfg.smtp_enabled && createMailTransport(emailCfg));
    if (!canSendMail) {
      return res.status(400).json({ message: 'Configure Email Settings before sending.' });
    }
    if (!emailCfg.from_email?.trim()) {
      return res.status(400).json({ message: 'Set From email in Settings → Email.' });
    }

    const custName = (row.site_contact_name ?? row.customer_full_name ?? 'Customer').trim() || 'Customer';
    const custEmail = (row.site_contact_email ?? row.customer_email ?? '').trim();
    const offEmail = (row.officer_email ?? '').trim();
    const jobTitle = escapeHtmlForEmail((row.job_title ?? 'Job').trim() || 'Job');
    const addr = escapeHtmlForEmail((row.site_address ?? '').trim() || 'Address on file');
    const visitStart = row.start_time instanceof Date ? row.start_time : new Date(row.start_time);
    const visitEnd = new Date(visitStart.getTime() + (row.duration_minutes ?? 60) * 60_000);
    const visitLine = `${visitStart.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} – ${visitEnd.toLocaleTimeString('en-GB', { timeStyle: 'short' })}`;
    const dashBase = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const jobLink = `${dashBase}/dashboard/jobs/${row.job_id}`;

    let to: string;
    let subject: string;
    let bodyInner: string;

    if (kind === 'engineer_job_sheet') {
      if (!offEmail) {
        return res.status(400).json({ message: 'Assigned engineer has no email address.' });
      }
      to = offEmail;
      subject = `Job sheet — ${row.job_title ?? 'Visit'}`;
      bodyInner = `<p>Hello ${escapeHtmlForEmail((row.officer_full_name ?? '').trim() || 'there')},</p>
<p>Here is a summary for your upcoming visit.</p>
<p><strong>Job:</strong> ${jobTitle}<br/>
<strong>When:</strong> ${escapeHtmlForEmail(visitLine)}<br/>
<strong>Site:</strong> ${addr}</p>
<p>Open the job in WorkPilot: <a href="${jobLink}">${jobLink}</a></p>`;
    } else {
      if (!custEmail) {
        return res.status(400).json({
          message: 'No recipient email: add a job contact with email or a customer email on the account.',
        });
      }
      to = custEmail;
      if (kind === 'customer_confirmation') {
        subject = `Visit confirmation — ${row.job_title ?? 'WorkPilot'}`;
        bodyInner = `<p>Hi ${escapeHtmlForEmail(custName)},</p>
<p>This confirms your scheduled visit.</p>
<p><strong>Job:</strong> ${jobTitle}<br/>
<strong>When:</strong> ${escapeHtmlForEmail(visitLine)}</p>
<p>If you need to reschedule, please contact us.</p>`;
      } else {
        subject = `Reminder — visit address — ${row.job_title ?? 'WorkPilot'}`;
        bodyInner = `<p>Hi ${escapeHtmlForEmail(custName)},</p>
<p>Reminder for your visit.</p>
<p><strong>When:</strong> ${escapeHtmlForEmail(visitLine)}<br/>
<strong>Address:</strong> ${addr}</p>`;
      }
    }

    const html = wrapEmailHtml(bodyInner, emailCfg.default_signature_html);
    const from = formatFromHeader(emailCfg.from_name, emailCfg.from_email);
    await sendUserEmail(pool, userId, emailCfg, {
      from,
      to,
      subject,
      html,
      replyTo: emailCfg.reply_to ?? undefined,
    });

    await pool.query(
      `UPDATE diary_events SET ${stampCol} = NOW(), updated_at = NOW() WHERE id = $1`,
      [diaryId],
    );

    const fresh = await pool.query<{
      customer_confirmation_sent_at: Date | null;
      address_reminder_sent_at: Date | null;
      engineer_job_sheet_sent_at: Date | null;
    }>(
      `SELECT customer_confirmation_sent_at, address_reminder_sent_at, engineer_job_sheet_sent_at
       FROM diary_events WHERE id = $1`,
      [diaryId],
    );
    const f = fresh.rows[0];
    return res.json({
      success: true,
      customer_confirmation_sent_at: f.customer_confirmation_sent_at
        ? (f.customer_confirmation_sent_at as Date).toISOString()
        : null,
      address_reminder_sent_at: f.address_reminder_sent_at
        ? (f.address_reminder_sent_at as Date).toISOString()
        : null,
      engineer_job_sheet_sent_at: f.engineer_job_sheet_sent_at
        ? (f.engineer_job_sheet_sent_at as Date).toISOString()
        : null,
    });
  } catch (error) {
    console.error('send-reminder error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ message: msg });
  }
});

app.post('/api/jobs/:id/diary-events', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const du2 = req.user!;
  if (du2.role === 'STAFF' && !assertStaffPermissionAny(du2, ['jobs', 'scheduling'])) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  }
  try {
    const jobId = parseInt(String(req.params.id), 10);
    const { officer_id, start_time, duration_minutes, notes } = req.body;

    if (du2.role !== 'SUPER_ADMIN' && du2.role !== 'OFFICER') {
      const own = await pool.query<{ created_by: number | null }>('SELECT created_by FROM jobs WHERE id = $1', [jobId]);
      if ((own.rowCount ?? 0) === 0 || own.rows[0].created_by !== getTenantScopeUserId(du2)) {
        return res.status(404).json({ message: 'Job not found' });
      }
    }

    const ures = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user!.userId]);
    const creatorName = ures.rows[0]?.full_name || 'System User';

    const result = await pool.query(
      `INSERT INTO diary_events (job_id, officer_id, start_time, duration_minutes, notes, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [jobId, officer_id || null, start_time, duration_minutes || 60, notes || null, creatorName]
    );

    // Update the job status to scheduled if it was created/draft
    await pool.query('UPDATE jobs SET state = \'scheduled\' WHERE id = $1 AND state IN (\'draft\', \'created\', \'unscheduled\')', [jobId]);

    res.status(201).json({ event: result.rows[0] });
  } catch (error) {
    console.error('create diary event error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/diary-events/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  const { status, feedback_notes, abort_reason } = req.body as {
    status?: unknown;
    feedback_notes?: unknown;
    abort_reason?: unknown;
  };
  const userId = getTenantScopeUserId(req.user!);
  const duPatch = req.user!;
  if (duPatch.role === 'STAFF' && !assertStaffPermissionAny(duPatch, ['jobs', 'scheduling'])) {
    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
  }

  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid event id' });
  }
  if (typeof status !== 'string' || !status.trim()) {
    return res.status(400).json({ message: 'status is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const eventRes = await client.query<{
      job_id: number;
      officer_id: number | null;
      job_officer_id: number | null;
    }>(
      `SELECT d.job_id, d.officer_id, j.officer_id AS job_officer_id
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       WHERE d.id = $1`,
      [id],
    );
    if ((eventRes.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Event not found' });
    }
    const row = eventRes.rows[0];
    const role = req.user!.role;
    const tokenOfficerId = req.user!.officerId ?? null;

    if (diaryActsAsFieldOfficer(req, { role, officerId: tokenOfficerId, permissions: req.user!.permissions ?? null })) {
      const assigned =
        row.officer_id === tokenOfficerId || row.job_officer_id === tokenOfficerId;
      if (!assigned) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'You can only update diary visits assigned to you' });
      }
    }

    const normalizedPre = normalizeDiaryStatusForTimesheet(status);
    if (normalizedPre === 'completed') {
      const qc = await countJobReportQuestionsForJob(client, row.job_id);
      if (qc > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message:
            'This job has a job report checklist. Complete it using Submit job report (officer app or web diary), which closes the visit and creates the invoice.',
        });
      }
    }

    const storedStatus = persistedDiaryStatus(status);
    const notesVal =
      typeof feedback_notes === 'string' ? feedback_notes.trim() || null : null;

    let abortReasonVal: string | null = null;
    if (storedStatus === 'cancelled') {
      const resolved = await resolveAbortReasonLabel(client, abort_reason);
      if (!resolved.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: resolved.message });
      }
      abortReasonVal = resolved.label;
    } else if (abort_reason != null && String(abort_reason).trim() !== '') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'abort_reason is only allowed when cancelling a visit.' });
    }

    await client.query(
      `UPDATE diary_events SET status = $1, notes = COALESCE($2, notes),
         abort_reason = $3, updated_at = NOW() WHERE id = $4`,
      [storedStatus, notesVal, storedStatus === 'cancelled' ? abortReasonVal : null, id],
    );

    const normalized = normalizeDiaryStatusForTimesheet(status);
    const timesheetOfficerId = row.officer_id ?? row.job_officer_id;
    if (timesheetOfficerId != null && normalized != null) {
      await applyDiaryStatusToTimesheet(client, timesheetOfficerId, id, normalized);
    }

    await client.query('COMMIT');

    if (normalized === 'completed') {
      try {
        await createInvoiceFromJob(row.job_id, userId);
      } catch (invErr) {
        console.error('Auto invoice after diary visit completed:', invErr);
      }
      await pool.query(`UPDATE jobs SET state = 'completed' WHERE id = $1`, [row.job_id]);
    }

    return res.json({ message: 'Diary event updated successfully', status: storedStatus });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('update diary event error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.delete('/api/diary-events/:id', authenticate, requireAdmin, requirePermission('scheduling'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid event id' });

  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const ev = await pool.query<{ status: string | null; job_created_by: number | null }>(
      `SELECT d.status, j.created_by AS job_created_by
       FROM diary_events d
       INNER JOIN jobs j ON j.id = d.job_id
       WHERE d.id = $1`,
      [id],
    );
    if ((ev.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Event not found' });
    const row = ev.rows[0];
    if (!isSuperAdmin && row.job_created_by !== userId) {
      return res.status(404).json({ message: 'Event not found' });
    }
    if (!diaryEventAllowsAdminDelete(row.status)) {
      return res.status(400).json({
        message: 'This visit has already started or finished; it cannot be deleted from the schedule.',
      });
    }

    await pool.query('DELETE FROM diary_events WHERE id = $1', [id]);
    return res.status(204).send();
  } catch (error) {
    console.error('delete diary event error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ----------------------------------------

// ---------- Scheduling & Dispatch ----------
app.get('/api/scheduling', authenticate, requireAdmin, requirePermission('scheduling'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const fromDate = typeof req.query.from === 'string' ? req.query.from.slice(0, 10) : defaultFrom;
    const toDate = typeof req.query.to === 'string' ? req.query.to.slice(0, 10) : defaultTo;
    const officerId = typeof req.query.officer_id === 'string' ? parseInt(req.query.officer_id, 10) : null;
    const stateFilter = typeof req.query.state === 'string' && JOB_STATES.includes(req.query.state as typeof JOB_STATES[number]) ? req.query.state : '';
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (!isSuperAdmin) {
      conditions.push(`j.created_by = $${p++}`);
      params.push(userId);
    }
    const includeUnscheduled = req.query.include_unscheduled === 'true';
    conditions.push(`(
      (j.schedule_start >= $${p}::timestamptz AND j.schedule_start < ($${p + 1}::date + INTERVAL '1 day'))
      OR (j.schedule_start IS NULL AND j.start_date >= $${p}::date AND j.start_date <= $${p + 1}::date)
      ${includeUnscheduled ? 'OR (j.schedule_start IS NULL AND j.start_date IS NULL)' : ''}
    )`);
    params.push(fromDate, toDate);
    p += 2;
    if (officerId && Number.isFinite(officerId)) {
      conditions.push(`j.officer_id = $${p++}`);
      params.push(officerId);
    }
    if (stateFilter) {
      conditions.push(`j.state = $${p++}`);
      params.push(stateFilter);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query<DbJob & { customer_full_name?: string; officer_full_name?: string }>(
      `SELECT j.id, j.title, j.description, j.priority, j.responsible_person, j.officer_id, j.start_date, j.deadline,
        j.customer_id, j.location, j.required_certifications, j.state,
        j.schedule_start, j.duration_minutes, j.scheduling_notes, j.dispatched_at,
        j.created_at, j.updated_at,
        c.full_name AS customer_full_name,
        o.full_name AS officer_full_name
       FROM jobs j
       LEFT JOIN customers c ON c.id = j.customer_id
       LEFT JOIN officers o ON o.id = j.officer_id
       ${whereClause}
       ORDER BY COALESCE(j.schedule_start, j.start_date) ASC NULLS LAST`,
      params,
    );

    const jobs = result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? null,
      priority: r.priority,
      responsible_person: r.responsible_person ?? null,
      officer_id: r.officer_id ?? null,
      officer_full_name: (r as { officer_full_name?: string }).officer_full_name ?? null,
      start_date: r.start_date ? (r.start_date as Date).toISOString() : null,
      deadline: r.deadline ? (r.deadline as Date).toISOString() : null,
      customer_id: r.customer_id ?? null,
      customer_full_name: r.customer_full_name ?? null,
      location: r.location ?? null,
      required_certifications: r.required_certifications ?? null,
      state: r.state,
      schedule_start: r.schedule_start ? (r.schedule_start as Date).toISOString() : null,
      duration_minutes: r.duration_minutes ?? null,
      scheduling_notes: r.scheduling_notes ?? null,
      dispatched_at: r.dispatched_at ? (r.dispatched_at as Date).toISOString() : null,
      created_at: (r.created_at as Date).toISOString(),
      updated_at: (r.updated_at as Date).toISOString(),
    }));

    return res.json({ jobs });
  } catch (error) {
    console.error('Scheduling list error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/jobs/:id/schedule', authenticate, requireAdmin, requirePermission('scheduling'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid job id' });
  const body = req.body as { schedule_start?: string | null; duration_minutes?: number; officer_id?: number | null; scheduling_notes?: string | null };
  const scheduleStart = body.schedule_start !== undefined ? (body.schedule_start ? new Date(body.schedule_start) : null) : undefined;
  const durationMinutes = body.duration_minutes !== undefined && typeof body.duration_minutes === 'number' && Number.isFinite(body.duration_minutes) ? body.duration_minutes : undefined;
  const officerId = body.officer_id !== undefined ? (typeof body.officer_id === 'number' && Number.isFinite(body.officer_id) ? body.officer_id : null) : undefined;
  const schedulingNotes = body.scheduling_notes !== undefined ? (typeof body.scheduling_notes === 'string' ? body.scheduling_notes.trim() || null : null) : undefined;

  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const check = await pool.query(
      `SELECT id, state FROM jobs WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
      isSuperAdmin ? [id] : [id, userId],
    );
    if ((check.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (officerId && !isSuperAdmin) {
      const offCheck = await pool.query('SELECT id FROM officers WHERE id = $1 AND created_by = $2', [officerId, userId]);
      if ((offCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid officer' });
    }

    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let idx = 1;
    if (scheduleStart !== undefined) { updates.push(`schedule_start = $${idx++}`); values.push(scheduleStart); }
    if (durationMinutes !== undefined) { updates.push(`duration_minutes = $${idx++}`); values.push(durationMinutes); }
    if (officerId !== undefined) { updates.push(`officer_id = $${idx++}`); values.push(officerId); }
    if (schedulingNotes !== undefined) { updates.push(`scheduling_notes = $${idx++}`); values.push(schedulingNotes); }

    if (scheduleStart !== undefined) {
      let newState = (check.rows[0] as { state: string }).state;
      if (scheduleStart && officerId) newState = 'assigned';
      else if (scheduleStart) newState = 'scheduled';
      else newState = 'unscheduled';
      updates.push(`state = $${idx++}`);
      values.push(newState);
    }

    if (updates.length <= 1) return res.status(400).json({ message: 'No schedule fields to update' });

    values.push(id);
    if (!isSuperAdmin) values.push(userId);
    const whereClause = isSuperAdmin ? '' : ` AND created_by = $${idx + 1}`;
    const r = await pool.query<DbJob>(
      `UPDATE jobs SET ${updates.join(', ')} WHERE id = $${idx}${whereClause} RETURNING *`,
      values,
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    const row = r.rows[0];
    return res.json({
      job: {
        id: row.id,
        title: row.title,
        state: row.state,
        schedule_start: row.schedule_start ? (row.schedule_start as Date).toISOString() : null,
        duration_minutes: row.duration_minutes ?? null,
        officer_id: row.officer_id ?? null,
        scheduling_notes: row.scheduling_notes ?? null,
        updated_at: (row.updated_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Schedule job error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/jobs/:id/dispatch', authenticate, requireAdmin, requirePermission('scheduling'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const result = await pool.query<DbJob>(
      `UPDATE jobs SET state = 'dispatched', dispatched_at = NOW(), updated_at = NOW()
       WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}
       RETURNING *`,
      isSuperAdmin ? [id] : [id, userId],
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    const r = result.rows[0];
    return res.json({
      job: {
        id: r.id,
        title: r.title,
        state: r.state,
        dispatched_at: r.dispatched_at ? (r.dispatched_at as Date).toISOString() : null,
        updated_at: (r.updated_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Dispatch job error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Email settings & templates (Admin) ----------
async function loadEmailSettingsPayload(userId: number): Promise<EmailSettingsPayload & { smtp_password_set: boolean }> {
  const r = await pool.query(
    `SELECT smtp_enabled, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_reject_unauthorized,
            from_name, from_email, reply_to, default_signature_html, oauth_provider, oauth_access_token, oauth_refresh_token, oauth_expiry
     FROM email_settings WHERE created_by = $1`,
    [userId],
  );
  if ((r.rowCount ?? 0) === 0) {
    return {
      smtp_enabled: false,
      smtp_host: null,
      smtp_port: 587,
      smtp_secure: false,
      smtp_user: null,
      smtp_password: null,
      smtp_reject_unauthorized: true,
      from_name: null,
      from_email: null,
      reply_to: null,
      default_signature_html: null,
      smtp_password_set: false,
    };
  }
  const row = r.rows[0] as Record<string, unknown>;
  const pass = row.smtp_password as string | null;
  return {
    smtp_enabled: !!row.smtp_enabled,
    smtp_host: (row.smtp_host as string) ?? null,
    smtp_port: row.smtp_port != null ? Number(row.smtp_port) : 587,
    smtp_secure: !!row.smtp_secure,
    smtp_user: (row.smtp_user as string) ?? null,
    smtp_password: pass,
    smtp_reject_unauthorized: row.smtp_reject_unauthorized !== false,
    from_name: (row.from_name as string) ?? null,
    from_email: (row.from_email as string) ?? null,
    reply_to: (row.reply_to as string) ?? null,
    default_signature_html: (row.default_signature_html as string) ?? null,
    smtp_password_set: !!(pass && String(pass).length > 0),
    oauth_provider: (row.oauth_provider as 'google' | 'microsoft') ?? null,
    oauth_access_token: (row.oauth_access_token as string) ?? null,
    oauth_refresh_token: (row.oauth_refresh_token as string) ?? null,
    oauth_expiry: row.oauth_expiry ? Number(row.oauth_expiry) : null,
  };
}

async function findFirstEmailConfigUserId(): Promise<number | null> {
  const r = await pool.query<{ id: number }>(
    `SELECT es.created_by AS id FROM email_settings es
     INNER JOIN users u ON u.id = es.created_by
     WHERE (es.smtp_enabled = true AND es.from_email IS NOT NULL AND TRIM(es.from_email) <> '')
        OR (es.oauth_provider IS NOT NULL AND es.oauth_access_token IS NOT NULL)
     ORDER BY CASE WHEN u.role = 'SUPER_ADMIN' THEN 0 ELSE 1 END
     LIMIT 1`,
  );
  return r.rows[0]?.id ?? null;
}

/** Officers with mobile password: request reset link by email (uses system email settings). */
app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
  const raw = req.body as { email?: string };
  const emailNorm = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  if (!emailNorm) {
    return res.status(400).json({ message: 'Email is required' });
  }
  const genericOk = { message: 'If an account exists with this email, you will receive reset instructions shortly.' };
  try {
    const o = await pool.query<{ id: number; full_name: string; email: string }>(
      `SELECT id, full_name, email FROM officers
       WHERE LOWER(TRIM(email)) = $1 AND password_hash IS NOT NULL`,
      [emailNorm],
    );
    if ((o.rowCount ?? 0) === 0) {
      return res.json(genericOk);
    }
    const officer = o.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      `UPDATE officers SET password_reset_token = $1, password_reset_expires_at = $2, updated_at = NOW() WHERE id = $3`,
      [resetToken, expires, officer.id],
    );
    const baseUrl = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
    const senderId = await findFirstEmailConfigUserId();
    if (senderId != null) {
      const emailCfg = await loadEmailSettingsPayload(senderId);
      if (emailCfg.from_email) {
        try {
          await sendUserEmail(pool, senderId, emailCfg, {
            from: formatFromHeader(emailCfg.from_name, emailCfg.from_email),
            to: officer.email.trim(),
            subject: 'Reset your WorkPilot password',
            html: `<p>Hi ${officer.full_name},</p><p><a href="${resetLink}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p><p>This link expires in one hour.</p>`,
            replyTo: emailCfg.reply_to ?? undefined,
          });
        } catch (sendErr) {
          console.error('forgot-password email send:', sendErr);
        }
      } else {
        console.warn('forgot-password: email settings missing from_email');
      }
    } else {
      console.warn('forgot-password: no system email configuration; officer id', officer.id);
    }
    if (!isProduction && process.env.DEBUG_PASSWORD_RESET === 'true') {
      return res.json({ ...genericOk, debug_reset_token: resetToken });
    }
    return res.json(genericOk);
  } catch (error) {
    console.error('forgot-password error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Complete password reset using token from forgot-password email. */
app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
  const raw = req.body as { token?: string; new_password?: string };
  const token = typeof raw.token === 'string' ? raw.token.trim() : '';
  const newPassword = typeof raw.new_password === 'string' ? raw.new_password : '';
  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }
  try {
    const r = await pool.query<{ id: number }>(
      `SELECT id FROM officers
       WHERE password_reset_token = $1 AND password_reset_expires_at IS NOT NULL AND password_reset_expires_at > NOW()`,
      [token],
    );
    if ((r.rowCount ?? 0) === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset link' });
    }
    const id = r.rows[0].id;
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE officers SET password_hash = $1, password_reset_token = NULL, password_reset_expires_at = NULL, updated_at = NOW() WHERE id = $2`,
      [hash, id],
    );
    return res.json({ message: 'Password updated. You can sign in with your new password.' });
  } catch (error) {
    console.error('reset-password error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

async function ensureDefaultEmailTemplates(userId: number): Promise<void> {
  const defaults: { key: string; name: string; subject: string; body: string }[] = [
    {
      key: 'invoice',
      name: 'Invoice - send to customer',
      subject: '{{company_name}} - Invoice {{invoice_number}}',
      body:
        '<p>Hi {{customer_name}},</p><p>Your invoice <strong>{{invoice_number}}</strong> is ready.</p><p>Amount due: <strong>{{currency}} {{invoice_total}}</strong><br/>Invoice date: {{invoice_date}}<br/>Due date: {{due_date}}</p><p>View your invoice online: {{invoice_link}}</p><p>Customer address: {{customer_address}}<br/>Work / site: {{work_address}}</p><p>Thank you,<br/>{{company_name}}</p>',
    },
    {
      key: 'quotation',
      name: 'Quotation - send to customer',
      subject: '{{company_name}} - Quotation {{quotation_number}}',
      body:
        '<p>Hi {{customer_name}},</p><p>Your quotation <strong>{{quotation_number}}</strong> is ready.</p><p>Total: <strong>{{currency}} {{quotation_total}}</strong><br/>Valid until: {{valid_until}}<br/>Quotation date: {{quotation_date}}</p><p>View your quotation online: {{quotation_link}}</p><p>Customer address: {{customer_address}}<br/>Work / site: {{work_address}}</p><p>Thank you,<br/>{{company_name}}</p>',
    },
    {
      key: 'general',
      name: 'General message',
      subject: 'Message from {{company_name}}',
      body: '<p>{{message}}</p>',
    },
    {
      key: 'service_reminder',
      name: 'Service renewal reminder',
      subject: '{{company_name}} — Service reminder ({{service_name}})',
      body:
        '<p>Hi {{customer_name}},</p><p>This is a {{phase_label}} for your <strong>{{service_name}}</strong> service.</p><p>Job: {{job_title}} (#{{job_id}})<br/>Next due: <strong>{{due_date}}</strong></p><p>Work / site (this job): {{work_address}}</p><p>Billing address: {{customer_address}}</p><p>Please contact us to book your next visit.</p><p>Kind regards,<br/>{{company_name}}</p>',
    },
  ];
  for (const d of defaults) {
    await pool.query(
      `INSERT INTO email_templates (created_by, template_key, name, subject, body_html)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (created_by, template_key) DO NOTHING`,
      [userId, d.key, d.name, d.subject, d.body],
    );
  }
}

// ---------- Invoices (Admin only) ----------
const INVOICE_STATES = ['draft', 'issued', 'pending_payment', 'partially_paid', 'paid', 'overdue', 'cancelled'] as const;
const PAYMENT_METHODS = ['bank_transfer', 'credit_card', 'cash', 'digital_payment', 'check', 'other'] as const;

/** Parse API/CSV date to YYYY-MM-DD for PostgreSQL DATE (avoids JS Date UTC/local off-by-one). */
function parseInvoiceDateForDb(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  if (iso) {
    const m = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    const y = parseInt(iso[1], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const dmy = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
  if (dmy) {
    const a = parseInt(dmy[1], 10);
    const b = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && y >= 1900 && y <= 2100) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const dmyShort = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})$/.exec(s);
  if (dmyShort) {
    const a = parseInt(dmyShort[1], 10);
    const b = parseInt(dmyShort[2], 10);
    let yy = parseInt(dmyShort[3], 10);
    const y = yy >= 70 ? 1900 + yy : 2000 + yy;
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const monNames = /(\d{1,2})[\s\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-](\d{4})/i.exec(s);
  if (monNames) {
    const map: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const mo = map[monNames[2].toLowerCase().slice(0, 3)];
    const day = parseInt(monNames[1], 10);
    const y = parseInt(monNames[3], 10);
    if (mo && day >= 1 && day <= 31 && y >= 1900 && y <= 2100) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  if (/^\d{5,6}(\.\d+)?$/.test(s.replace(/\s/g, ''))) {
    const serial = Math.floor(parseFloat(s));
    if (serial > 20000 && serial < 100000) {
      const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
  }
  return null;
}

function todayYyyyMmDdUtc(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
}

function addDaysYyyyMmDd(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map((x) => parseInt(x, 10));
  const t = Date.UTC(y, m - 1, d + days);
  return new Date(t).toISOString().slice(0, 10);
}

/** Format PostgreSQL DATE for JSON (avoid toISOString() shifting the calendar day). */
function formatInvoiceDateFromDb(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const mo = value.getMonth() + 1;
    const d = value.getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}

function parseSafeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const s = value.trim();
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(s)) return s;
  return fallback;
}

async function getInvoiceSettings(userId: number): Promise<{
  default_currency: string;
  invoice_prefix: string;
  terms_and_conditions: string | null;
  default_due_days: number;
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_logo: string | null;
  company_website: string | null;
  company_tax_id: string | null;
  tax_label: string;
  default_tax_percentage: number;
  footer_text: string | null;
  invoice_accent_color: string;
  invoice_accent_end_color: string;
  payment_terms: string | null;
  bank_details: string | null;
}> {
  const r = await pool.query(
    'SELECT * FROM invoice_settings WHERE created_by = $1',
    [userId],
  );
  if ((r.rowCount ?? 0) > 0) {
    const row = r.rows[0] as Record<string, unknown>;
    return {
      default_currency: (row.default_currency as string) ?? 'USD',
      invoice_prefix: (row.invoice_prefix as string) ?? 'INV',
      terms_and_conditions: (row.terms_and_conditions as string) ?? null,
      default_due_days: Number(row.default_due_days) ?? 30,
      company_name: (row.company_name as string) ?? 'WorkPilot',
      company_address: (row.company_address as string) ?? null,
      company_phone: (row.company_phone as string) ?? null,
      company_email: (row.company_email as string) ?? null,
      company_logo: (row.company_logo as string) ?? null,
      company_website: (row.company_website as string) ?? null,
      company_tax_id: (row.company_tax_id as string) ?? null,
      tax_label: (row.tax_label as string) ?? 'Tax',
      default_tax_percentage: row.default_tax_percentage != null ? Math.max(0, Math.min(100, Number(row.default_tax_percentage))) : 0,
      footer_text: (row.footer_text as string) ?? null,
      invoice_accent_color: parseSafeHexColor(row.invoice_accent_color, '#14B8A6'),
      invoice_accent_end_color: parseSafeHexColor(row.invoice_accent_end_color, '#0d9488'),
      payment_terms: (row.payment_terms as string) ?? null,
      bank_details: (row.bank_details as string) ?? null,
    };
  }
  return {
    default_currency: 'USD',
    invoice_prefix: 'INV',
    terms_and_conditions: null,
    default_due_days: 30,
    company_name: 'WorkPilot',
    company_address: null,
    company_phone: null,
    company_email: null,
    company_logo: null,
    company_website: null,
    company_tax_id: null,
    tax_label: 'Tax',
    default_tax_percentage: 0,
    footer_text: null,
    invoice_accent_color: '#14B8A6',
    invoice_accent_end_color: '#0d9488',
    payment_terms: null,
    bank_details: null,
  };
}

function formatJoinedAddressLines(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((s) => s.length > 0)
    .join(', ');
}

/** Work/site line for the job's linked customer work address only (j.work_address_id). */
function serviceReminderWorkSiteStrings(job: {
  wa_name: string | null;
  wa_branch_name: string | null;
  wa_line1: string | null;
  wa_line2: string | null;
  wa_line3: string | null;
  wa_town: string | null;
  wa_county: string | null;
  wa_postcode: string | null;
}): Record<string, string> {
  const street = formatJoinedAddressLines([
    job.wa_line1,
    job.wa_line2,
    job.wa_line3,
    job.wa_town,
    job.wa_county,
    job.wa_postcode,
  ]);
  const siteName = (job.wa_name || '').trim();
  const branch = (job.wa_branch_name || '').trim();
  const namePart = siteName ? (branch ? `${siteName} (${branch})` : siteName) : '';
  const workAddressLine =
    namePart && street ? `${namePart} — ${street}` : namePart || street || '';

  return {
    work_address_name: siteName,
    work_address_branch: branch,
    work_address_line_1: (job.wa_line1 || '').trim(),
    work_address_line_2: (job.wa_line2 || '').trim(),
    work_address_line_3: (job.wa_line3 || '').trim(),
    work_address_town: (job.wa_town || '').trim(),
    work_address_county: (job.wa_county || '').trim(),
    work_address_postcode: (job.wa_postcode || '').trim(),
    work_address: workAddressLine,
    site_address: workAddressLine,
  };
}

async function runAutomatedServiceReminders(pool: Pool): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const today = utcDateOnlyFromDate(new Date());
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  const tenantRows = await pool.query<{ created_by: number }>(
    `SELECT DISTINCT j.created_by AS created_by
     FROM jobs j
     WHERE j.is_service_job = true
       AND j.expected_completion IS NOT NULL
       AND j.customer_id IS NOT NULL
       AND j.state IN ('completed', 'closed')`,
  );

  for (const { created_by: tenantUserId } of tenantRows.rows) {
    if (!tenantUserId) continue;

    const settingsRes = await pool.query<{
      automated_enabled: boolean;
      recipient_mode: string;
    }>(
      `SELECT automated_enabled, recipient_mode FROM service_reminder_settings WHERE created_by = $1`,
      [tenantUserId],
    );
    const settingsRow = settingsRes.rows[0];
    const automatedEnabled = settingsRow ? settingsRow.automated_enabled !== false : true;
    if (!automatedEnabled) {
      skipped += 1;
      continue;
    }
    const recipientMode = SERVICE_REMINDER_RECIPIENT_MODES.has(settingsRow?.recipient_mode || '')
      ? (settingsRow!.recipient_mode as string)
      : 'customer_account';

    const emailCfg = await loadEmailSettingsPayload(tenantUserId);
    const canSend =
      !!emailCfg.from_email?.trim() &&
      (!!emailCfg.oauth_provider || (emailCfg.smtp_enabled && !!createMailTransport(emailCfg)));
    if (!canSend) {
      skipped += 1;
      continue;
    }

    await ensureDefaultEmailTemplates(tenantUserId);
    const tpl = await pool.query<{ subject: string; body_html: string }>(
      `SELECT subject, body_html FROM email_templates WHERE created_by = $1 AND template_key = 'service_reminder'`,
      [tenantUserId],
    );
    const tplRow = tpl.rows[0];
    if (!tplRow) {
      errors.push(`tenant ${tenantUserId}: missing service_reminder template`);
      continue;
    }

    const invSettings = await getInvoiceSettings(tenantUserId);
    const companyName = invSettings.company_name || 'WorkPilot';

    const checklistRes = await pool.query<{
      name: string;
      reminder_interval_n: number | null;
      reminder_interval_unit: string | null;
      reminder_early_n: number | null;
      reminder_early_unit: string | null;
      customer_reminder_weeks_before: number | null;
      customer_email_subject: string | null;
      customer_email_body_html: string | null;
    }>(
      `SELECT name, reminder_interval_n, reminder_interval_unit, reminder_early_n, reminder_early_unit,
              customer_reminder_weeks_before, customer_email_subject, customer_email_body_html
       FROM service_checklist_items
       WHERE created_by = $1 AND is_active = true`,
      [tenantUserId],
    );
    const checklistByKey = new Map<string, (typeof checklistRes.rows)[0]>();
    for (const row of checklistRes.rows) {
      checklistByKey.set(row.name.trim().toLowerCase(), row);
    }

    const jobsRes = await pool.query<{
      id: number;
      title: string | null;
      customer_id: number;
      expected_completion: Date;
      completed_service_items: unknown;
      job_contact_id: number | null;
      customer_name: string | null;
      customer_email: string | null;
      service_reminders_enabled: boolean;
      customer_phone: string | null;
      customer_landline: string | null;
      customer_contact_mobile: string | null;
      customer_address_line_1: string | null;
      customer_address_line_2: string | null;
      customer_address_line_3: string | null;
      customer_town: string | null;
      customer_county: string | null;
      customer_postcode: string | null;
      customer_contact_surname: string | null;
      service_reminder_custom_email: string | null;
      service_reminder_recipient_mode: string | null;
      job_contact_first_name: string | null;
      job_contact_surname: string | null;
      wa_name: string | null;
      wa_branch_name: string | null;
      wa_line1: string | null;
      wa_line2: string | null;
      wa_line3: string | null;
      wa_town: string | null;
      wa_county: string | null;
      wa_postcode: string | null;
    }>(
      `SELECT j.id, j.title, j.customer_id, j.expected_completion, j.completed_service_items, j.job_contact_id,
              c.full_name AS customer_name, c.email AS customer_email,
              COALESCE(c.service_reminders_enabled, true) AS service_reminders_enabled,
              c.phone AS customer_phone,
              c.landline AS customer_landline,
              c.contact_mobile AS customer_contact_mobile,
              c.address_line_1 AS customer_address_line_1,
              c.address_line_2 AS customer_address_line_2,
              c.address_line_3 AS customer_address_line_3,
              c.town AS customer_town,
              c.county AS customer_county,
              c.postcode AS customer_postcode,
              c.contact_surname AS customer_contact_surname,
              c.service_reminder_custom_email,
              c.service_reminder_recipient_mode,
              jcc.first_name AS job_contact_first_name,
              jcc.surname AS job_contact_surname,
              wa.name AS wa_name,
              wa.branch_name AS wa_branch_name,
              wa.address_line_1 AS wa_line1,
              wa.address_line_2 AS wa_line2,
              wa.address_line_3 AS wa_line3,
              wa.town AS wa_town,
              wa.county AS wa_county,
              wa.postcode AS wa_postcode
       FROM jobs j
       INNER JOIN customers c ON c.id = j.customer_id
       LEFT JOIN customer_contacts jcc ON jcc.id = j.job_contact_id AND jcc.customer_id = j.customer_id
       LEFT JOIN customer_work_addresses wa ON wa.id = j.work_address_id AND wa.customer_id = j.customer_id
       WHERE j.created_by = $1
         AND j.is_service_job = true
         AND j.expected_completion IS NOT NULL
         AND j.customer_id IS NOT NULL
         AND j.state IN ('completed', 'closed')`,
      [tenantUserId],
    );

    for (const job of jobsRes.rows) {
      if (job.service_reminders_enabled === false) continue;

      const items = normalizeCompletedServiceItemsForDb(job.completed_service_items);
      const anchor = new Date(job.expected_completion);
      if (Number.isNaN(anchor.getTime())) continue;

      for (const svc of items) {
        if (!svc.remind_email) continue;
        const ck = checklistByKey.get(svc.name.trim().toLowerCase());
        if (!ck) continue;

        let intervalN = ck.reminder_interval_n != null ? Math.trunc(Number(ck.reminder_interval_n)) : 1;
        let intervalU = (ck.reminder_interval_unit || 'years').trim().toLowerCase();
        if (!Number.isFinite(intervalN) || intervalN < 1) intervalN = 1;
        if (!SERVICE_REMINDER_INTERVAL_UNITS.has(intervalU)) intervalU = 'years';

        let earlyN = ck.reminder_early_n != null ? Math.trunc(Number(ck.reminder_early_n)) : 14;
        let earlyU = (ck.reminder_early_unit || 'days').trim().toLowerCase();
        if (!Number.isFinite(earlyN) || earlyN < 1) earlyN = 14;
        if (!SERVICE_REMINDER_EARLY_UNITS.has(earlyU)) earlyU = 'days';

        const anchorDay = new Date(
          Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()),
        );
        let nextDue = addCalendarInterval(anchorDay, intervalN, intervalU);
        const todayD = new Date(`${today}T00:00:00.000Z`);
        while (nextDue.getTime() < todayD.getTime()) {
          nextDue = addCalendarInterval(nextDue, intervalN, intervalU);
        }
        const renewalYmd = utcDateOnlyFromDate(nextDue);
        const weeksBefore =
          ck.customer_reminder_weeks_before != null
            ? Math.trunc(Number(ck.customer_reminder_weeks_before))
            : NaN;
        const earlyStart =
          Number.isFinite(weeksBefore) && weeksBefore >= 1 && weeksBefore <= 52
            ? addCalendarInterval(nextDue, -weeksBefore, 'weeks')
            : addCalendarInterval(nextDue, -earlyN, earlyU);
        const earlyStartYmd = utcDateOnlyFromDate(earlyStart);

        const inEarlyWindow = today >= earlyStartYmd && today < renewalYmd;
        const inDueWindow = today >= renewalYmd;

        let phase: 'early' | 'due' | null = null;
        if (inEarlyWindow) phase = 'early';
        else if (inDueWindow) phase = 'due';
        if (!phase) continue;

        const dup = await pool.query(
          `SELECT 1 FROM service_reminder_sent
           WHERE job_id = $1 AND service_name = $2 AND phase = $3 AND renewal_due_date = $4`,
          [job.id, svc.name, phase, renewalYmd],
        );
        if ((dup.rowCount ?? 0) > 0) continue;

        const modeRaw = (job.service_reminder_recipient_mode ?? '').trim();
        const effectiveRecipientMode = SERVICE_REMINDER_RECIPIENT_MODES.has(modeRaw)
          ? modeRaw
          : recipientMode;

        let toEmail = (job.service_reminder_custom_email ?? '').trim();
        if (!toEmail) {
          toEmail =
            (await resolveServiceReminderRecipientEmail(
              pool,
              job.customer_id,
              job.customer_email,
              job.job_contact_id,
              effectiveRecipientMode,
            )) || '';
        }
        if (!toEmail) continue;

        const phaseLabel = phase === 'early' ? 'friendly reminder' : 'reminder that your service is now due';
        const dueDisplay = nextDue.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        });
        const nameWords = (job.customer_name || '').trim().split(/\s+/).filter(Boolean);
        const customerSurname =
          (job.customer_contact_surname || '').trim() ||
          (nameWords.length > 1 ? nameWords[nameWords.length - 1]! : '');
        const jobContactDisplay = [job.job_contact_first_name, job.job_contact_surname]
          .map((x) => (x ?? '').trim())
          .filter(Boolean)
          .join(' ');
        const customerTel =
          (job.customer_landline || '').trim() || (job.customer_phone || '').trim() || (job.customer_contact_mobile || '').trim();
        const customerMobile = (job.customer_contact_mobile || '').trim() || (job.customer_phone || '').trim();
        const bookingPortal = (process.env.WORKPILOT_CUSTOMER_PORTAL_URL || '').trim();
        const customerAddressLine = formatJoinedAddressLines([
          job.customer_address_line_1,
          job.customer_address_line_2,
          job.customer_address_line_3,
          job.customer_town,
          job.customer_county,
          job.customer_postcode,
        ]);
        const siteVars = serviceReminderWorkSiteStrings(job);
        const vars: Record<string, string> = {
          company_name: companyName,
          customer_name: (job.customer_name || 'there').trim(),
          customer_surname: customerSurname,
          customer_account_no: String(job.customer_id),
          customer_email: (job.customer_email || '').trim(),
          customer_telephone: customerTel,
          customer_mobile: customerMobile,
          customer_address: customerAddressLine,
          customer_address_line_1: (job.customer_address_line_1 || '').trim(),
          customer_address_line_2: (job.customer_address_line_2 || '').trim(),
          customer_address_line_3: (job.customer_address_line_3 || '').trim(),
          customer_town: (job.customer_town || '').trim(),
          customer_county: (job.customer_county || '').trim(),
          customer_postcode: (job.customer_postcode || '').trim(),
          customer_advertising: '',
          service_name: svc.name,
          service_reminder_name: svc.name,
          service_contact: jobContactDisplay,
          service_reminder_booking_portal_url: bookingPortal,
          job_title: (job.title || 'Service job').trim(),
          job_id: String(job.id),
          due_date: dueDisplay,
          service_due_date: dueDisplay,
          phase_label: phaseLabel,
          ...siteVars,
        };
        const subjTpl =
          typeof ck.customer_email_subject === 'string' && ck.customer_email_subject.trim()
            ? ck.customer_email_subject.trim()
            : tplRow.subject;
        const bodyTpl =
          typeof ck.customer_email_body_html === 'string' && ck.customer_email_body_html.trim()
            ? ck.customer_email_body_html.trim()
            : tplRow.body_html;
        const subject = applyTemplateVars(subjTpl, vars);
        const bodyInner = applyTemplateVars(bodyTpl, vars);
        const html = wrapEmailHtml(bodyInner, emailCfg.default_signature_html);
        const from = formatFromHeader(emailCfg.from_name, emailCfg.from_email);

        try {
          await sendUserEmail(pool, tenantUserId, emailCfg, {
            from,
            to: toEmail,
            subject,
            html,
            replyTo: emailCfg.reply_to,
          });
          await pool.query(
            `INSERT INTO service_reminder_sent (job_id, service_name, phase, renewal_due_date, tenant_user_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [job.id, svc.name, phase, renewalYmd, tenantUserId],
          );
          await pool.query(
            `INSERT INTO customer_communications
              (customer_id, record_type, subject, message, status, to_value, object_type, object_id, created_by)
             VALUES ($1, 'email', $2, $3, 'sent', $4, 'job', $5, $6)`,
            [job.customer_id, subject, bodyInner, toEmail, job.id, tenantUserId],
          );
          sent += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`job ${job.id} / ${svc.name} / ${phase}: ${msg}`);
        }
      }
    }
  }

  return { sent, skipped, errors };
}

function escapeRegexChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Canonical display: PREFIX-000001 (variable width if sequence > 6 digits). */
function formatInvoiceSequenceNumber(p: string, n: number): string {
  const num = Math.max(0, Math.floor(n));
  const digits = String(num);
  const padded = digits.length <= 6 ? digits.padStart(6, '0') : digits;
  return `${p}-${padded}`;
}

/**
 * Map CSV / legacy values (INV545, INV-545, INV-000545) to canonical PREFIX-000545 using settings prefix.
 */
function normalizeInvoiceNumberFromImport(raw: string, prefix: string): string | null {
  const p = (prefix || 'INV').replace(/[^A-Za-z0-9_-]/g, '') || 'INV';
  const s = String(raw).trim();
  if (!s) return null;
  const ep = escapeRegexChars(p);
  let m = s.match(new RegExp(`^${ep}-(\\d+)$`, 'i'));
  if (m) return formatInvoiceSequenceNumber(p, parseInt(m[1], 10));
  m = s.match(new RegExp(`^${ep}(\\d+)$`, 'i'));
  if (m) return formatInvoiceSequenceNumber(p, parseInt(m[1], 10));
  const tail = s.match(/(\d+)$/);
  if (tail) {
    const n = parseInt(tail[1], 10);
    if (!Number.isNaN(n) && n >= 0) return formatInvoiceSequenceNumber(p, n);
  }
  return null;
}

/** Max numeric suffix for PREFIX-… and PREFIX… (no dash), so imports like INV545 participate in sequencing. */
async function getMaxInvoiceNumericSuffix(prefix: string): Promise<number> {
  const p = (prefix || 'INV').replace(/[^A-Za-z0-9_-]/g, '') || 'INV';
  const ep = escapeRegexChars(p);
  const r = await pool.query<{ invoice_number: string }>(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 OR invoice_number ~ $2`,
    [`${p}-%`, `^${ep}\\d+$`],
  );
  let max = 0;
  const reDash = new RegExp(`^${ep}-(\\d+)$`, 'i');
  const reNoDash = new RegExp(`^${ep}(\\d+)$`, 'i');
  for (const row of r.rows) {
    const num = row.invoice_number;
    const md = num.match(reDash);
    const mn = num.match(reNoDash);
    const n = md ? parseInt(md[1], 10) : mn ? parseInt(mn[1], 10) : 0;
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

async function generateInvoiceNumber(prefix: string): Promise<string> {
  const p = (prefix || 'INV').replace(/[^A-Za-z0-9_-]/g, '') || 'INV';
  const max = await getMaxInvoiceNumericSuffix(p);
  return formatInvoiceSequenceNumber(p, max + 1);
}

async function logInvoiceActivity(invoiceId: number, action: string, details: Record<string, unknown>, userId: number | null) {
  await pool.query(
    'INSERT INTO invoice_activities (invoice_id, action, details, created_by) VALUES ($1, $2, $3, $4)',
    [invoiceId, action, JSON.stringify(details), userId],
  );
}

/**
 * @param jobOwnerUserId When provided (from `jobs.created_by` for this invoice's job), the job owner may
 *   access invoices auto-created by a field officer (`invoices.created_by` is the officer's user id).
 */
function canAccessInvoice(
  invoice: DbInvoice,
  userId: number,
  isSuperAdmin: boolean,
  jobOwnerUserId?: number | null,
): boolean {
  if (isSuperAdmin) return true;
  if (invoice.created_by === userId) return true;
  if (
    invoice.job_id != null &&
    jobOwnerUserId !== undefined &&
    jobOwnerUserId !== null &&
    jobOwnerUserId === userId
  ) {
    return true;
  }
  return false;
}

/** Single-line customer address — same field order as customer detail page (`[id]/page.tsx`). */
function formatCustomerAddressSingleLine(row: Record<string, unknown>): string {
  const parts: string[] = [];
  [row.address_line_1, row.address_line_2, row.address_line_3, row.town, row.county, row.postcode].forEach((x) => {
    const t = typeof x === 'string' ? x.trim() : '';
    if (t && !parts.some((p) => p.toLowerCase() === t.toLowerCase())) {
      parts.push(t);
    }
  });
  if (parts.length) return parts.join(', ');
  const legacy = typeof row.address === 'string' ? row.address.trim() : '';
  if (legacy) return legacy;
  const city = typeof row.city === 'string' ? row.city.trim() : '';
  const region = typeof row.region === 'string' ? row.region.trim() : '';
  const country = typeof row.country === 'string' ? row.country.trim() : '';
  const fb = [city, region, country].filter(Boolean).join(', ');
  return fb || '';
}

/** Public web app origin for customer links (set PUBLIC_APP_URL in production). */
function getPublicAppBaseUrl(): string {
  const raw = (process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || 'https://work-pilot.co').trim();
  return raw.replace(/\/+$/, '');
}

/** Template vars for invoice emails (send + compose). */
async function buildInvoiceEmailTemplateVars(
  inv: DbInvoice & {
    customer_full_name?: string | null;
    cust_addr_line_1?: string | null;
    cust_addr_line_2?: string | null;
    cust_addr_line_3?: string | null;
    cust_town?: string | null;
    cust_county?: string | null;
    cust_postcode?: string | null;
  },
  invSettings: { company_name?: string | null },
): Promise<Record<string, string>> {
  const invDate = formatInvoiceDateFromDb(inv.invoice_date);
  const dueDate = formatInvoiceDateFromDb(inv.due_date);
  const customer_address = formatCustomerAddressSingleLine({
    address_line_1: inv.cust_addr_line_1,
    address_line_2: inv.cust_addr_line_2,
    address_line_3: inv.cust_addr_line_3,
    town: inv.cust_town,
    county: inv.cust_county,
    postcode: inv.cust_postcode,
  });
  let work_address = '';
  if (inv.invoice_work_address_id) {
    const wr = await pool.query(
      'SELECT * FROM customer_work_addresses WHERE id = $1 AND customer_id = $2',
      [inv.invoice_work_address_id, inv.customer_id],
    );
    if ((wr.rowCount ?? 0) > 0) {
      work_address = formatWorkAddressSingleLine(wr.rows[0]);
    }
  }
  let pToken = inv.public_token;
  if (!pToken) {
    pToken = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE invoices SET public_token = $1 WHERE id = $2', [pToken, inv.id]);
  }

  return {
    company_name: invSettings.company_name ?? 'WorkPilot',
    customer_name: inv.customer_full_name ?? '',
    invoice_number: inv.invoice_number,
    invoice_total: parseFloat(String(inv.total_amount)).toFixed(2),
    currency: inv.currency,
    invoice_date: invDate,
    due_date: dueDate,
    customer_address,
    work_address,
    invoice_link: `<a href="${getPublicAppBaseUrl()}/public/invoices/${pToken}">${inv.invoice_number}</a>`,
  };
}

/** Template vars for quotation emails (send + compose). */
async function buildQuotationEmailTemplateVars(
  q: DbQuotation & {
    customer_full_name?: string | null;
    cust_addr_line_1?: string | null;
    cust_addr_line_2?: string | null;
    cust_addr_line_3?: string | null;
    cust_town?: string | null;
    cust_county?: string | null;
    cust_postcode?: string | null;
  },
  qSettings: { company_name?: string | null },
): Promise<Record<string, string>> {
  const qDate = (q.quotation_date as Date).toISOString().slice(0, 10);
  const validUntil = (q.valid_until as Date).toISOString().slice(0, 10);
  const customer_address = formatCustomerAddressSingleLine({
    address_line_1: q.cust_addr_line_1,
    address_line_2: q.cust_addr_line_2,
    address_line_3: q.cust_addr_line_3,
    town: q.cust_town,
    county: q.cust_county,
    postcode: q.cust_postcode,
  });
  let pToken = q.public_token;
  if (!pToken) {
    pToken = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE quotations SET public_token = $1 WHERE id = $2', [pToken, q.id]);
  }
  let work_address = '';
  if (q.quotation_work_address_id) {
    const wr = await pool.query('SELECT * FROM customer_work_addresses WHERE id = $1 AND customer_id = $2', [
      q.quotation_work_address_id,
      q.customer_id,
    ]);
    if ((wr.rowCount ?? 0) > 0) {
      work_address = formatWorkAddressSingleLine(wr.rows[0]);
    }
  }
  const base = getPublicAppBaseUrl();
  return {
    company_name: qSettings.company_name ?? 'WorkPilot',
    customer_name: q.customer_full_name ?? '',
    quotation_number: q.quotation_number,
    quotation_total: parseFloat(String(q.total_amount)).toFixed(2),
    currency: q.currency,
    quotation_date: qDate,
    valid_until: validUntil,
    customer_address,
    work_address,
    quotation_link: `<a href="${base}/public/quotations/${pToken}">${q.quotation_number}</a>`,
  };
}

/** One comma-separated line for invoice PDF/UI (no newlines). */
function formatWorkAddressSingleLine(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (t && !parts.some((p) => p.toLowerCase() === t.toLowerCase())) parts.push(t);
  };
  push(row.name);
  push(row.branch_name);
  push(row.company_name);
  push(row.address_line_1);
  push(row.address_line_2);
  push(row.address_line_3);
  const town = typeof row.town === 'string' ? row.town.trim() : '';
  const county = typeof row.county === 'string' ? row.county.trim() : '';
  if (town || county) parts.push([town, county].filter(Boolean).join(', '));
  push(row.postcode);
  return parts.join(', ');
}

/** Site/work row without the site `name` — shown separately from site name on invoices. */
function formatWorkAddressSingleLineWithoutName(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (t && !parts.some((p) => p.toLowerCase() === t.toLowerCase())) {
      parts.push(t);
    }
  };
  push(row.branch_name);
  push(row.company_name);
  push(row.address_line_1);
  push(row.address_line_2);
  push(row.address_line_3);
  const town = typeof row.town === 'string' ? row.town.trim() : '';
  const county = typeof row.county === 'string' ? row.county.trim() : '';
  if (town) push(town);
  if (county) push(county);
  push(row.postcode);
  return parts.join(', ');
}

/** Normalize legacy invoice rows that stored work address with newlines. */
function workSiteAddressAsSingleLine(stored: string): string {
  const parts: string[] = [];
  stored.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(s => {
    if (!parts.some(p => p.toLowerCase() === s.toLowerCase())) {
      parts.push(s);
    }
  });
  return parts.join(', ');
}

/** Same resolution as invoice work/site display (GET invoice / public invoice). */
async function resolveWorkSiteDisplayForCustomer(
  customerId: number,
  workAddressId: number | null | undefined,
  billingAddress: string | null | undefined,
): Promise<{
  work_site_name: string | null;
  work_site_address: string | null;
  quotation_custom_address: string | null;
}> {
  let workSiteName: string | null = null;
  let workSiteAddressOnly: string | null = null;
  if (workAddressId) {
    const waRes = await pool.query('SELECT * FROM customer_work_addresses WHERE id = $1 AND customer_id = $2', [
      workAddressId,
      customerId,
    ]);
    if ((waRes.rowCount ?? 0) > 0) {
      const wa = waRes.rows[0] as Record<string, unknown>;
      const n = typeof wa.name === 'string' ? wa.name.trim() : '';
      workSiteName = n || null;
      const addrOnly = formatWorkAddressSingleLineWithoutName(wa).trim();
      workSiteAddressOnly = addrOnly || null;
    }
    if (!workSiteName && !workSiteAddressOnly && billingAddress?.trim()) {
      workSiteAddressOnly = workSiteAddressAsSingleLine(billingAddress.trim());
    }
  }
  const quotationCustomAddress =
    !workAddressId && billingAddress?.trim() ? billingAddress.trim() : null;
  return {
    work_site_name: workSiteName,
    work_site_address: workSiteAddressOnly,
    quotation_custom_address: quotationCustomAddress,
  };
}

/**
 * Parses quotation work/site address id from JSON bodies.
 * Some clients or proxies send numeric ids as strings; strict `typeof === 'number'` then skipped saving.
 */
function parseQuotationWorkAddressIdInput(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n > 0 ? n : undefined;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return null;
    const n = parseInt(t, 10);
    if (Number.isFinite(n) && n > 0) return n;
    return undefined;
  }
  return undefined;
}

async function resolveInvoiceBillingFromWorkAddress(
  customerId: number,
  workAddressId: number,
): Promise<{ billing_address: string; invoice_work_address_id: number }> {
  const wr = await pool.query('SELECT * FROM customer_work_addresses WHERE id = $1 AND customer_id = $2', [
    workAddressId,
    customerId,
  ]);
  if ((wr.rowCount ?? 0) === 0) {
    throw new Error('INVALID_WORK_ADDRESS');
  }
  return {
    billing_address: formatWorkAddressSingleLine(wr.rows[0]),
    invoice_work_address_id: workAddressId,
  };
}

async function createInvoiceFromJob(jobId: number, actingUserId: number): Promise<number | null> {
  const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (jobResult.rowCount === 0) return null;
  const job = jobResult.rows[0] as Record<string, unknown>;

  const rawJobOwner = job.created_by;
  let jobOwnerUserId = NaN;
  if (typeof rawJobOwner === 'number' && Number.isFinite(rawJobOwner) && rawJobOwner > 0) {
    jobOwnerUserId = rawJobOwner;
  } else if (typeof rawJobOwner === 'string' && /^\d+$/.test(rawJobOwner.trim())) {
    jobOwnerUserId = parseInt(rawJobOwner.trim(), 10);
  }
  const invoiceCreatedBy =
    Number.isFinite(jobOwnerUserId) && jobOwnerUserId > 0 ? jobOwnerUserId : actingUserId;

  const customerIdRaw = job.customer_id;
  const customerId =
    typeof customerIdRaw === 'number' && Number.isFinite(customerIdRaw)
      ? customerIdRaw
      : parseInt(String(customerIdRaw ?? ''), 10);
  if (!Number.isFinite(customerId) || customerId <= 0) {
    console.error('createInvoiceFromJob: job has no customer_id', { jobId });
    return null;
  }

  const pricingResult = await pool.query('SELECT * FROM job_pricing_items WHERE job_id = $1 ORDER BY sort_order', [jobId]);
  const pricingItems = pricingResult.rows;

  const settings = await getInvoiceSettings(invoiceCreatedBy);
  const invoiceNumber = await generateInvoiceNumber(settings.invoice_prefix);

  const invoiceDate = new Date();
  const dueDate = new Date(invoiceDate.getTime() + settings.default_due_days * 24 * 60 * 60 * 1000);

  let subtotal = 0;
  for (const item of pricingItems) {
    subtotal += Number(item.total);
  }

  const taxPercentage = settings.default_tax_percentage;
  const taxAmount = Math.round(subtotal * (taxPercentage / 100) * 100) / 100;
  const totalAmount = subtotal + taxAmount;

  const publicToken = crypto.randomBytes(32).toString('hex');
  const invResult = await pool.query(
    `INSERT INTO invoices (invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, currency, state, created_by, public_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11)
     RETURNING id`,
    [
      invoiceNumber,
      customerId,
      jobId,
      invoiceDate,
      dueDate,
      subtotal,
      taxAmount,
      totalAmount,
      settings.default_currency,
      invoiceCreatedBy,
      publicToken,
    ],
  );

  const invoiceId = invResult.rows[0].id;

  for (let i = 0; i < pricingItems.length; i++) {
    const pi = pricingItems[i];
    await pool.query(
      'INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, amount, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
      [invoiceId, pi.item_name, pi.quantity, pi.unit_price, pi.total, i],
    );
  }

  await logInvoiceActivity(
    invoiceId,
    'created',
    {
      invoice_number: invoiceNumber,
      auto_generated_from_job: jobId,
      acting_user_id: actingUserId,
    },
    actingUserId,
  );
  return invoiceId;
}

app.get('/api/invoices', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const stateFilter = typeof req.query.state === 'string' && INVOICE_STATES.includes(req.query.state as typeof INVOICE_STATES[number])
      ? req.query.state
      : '';
    const customerId = typeof req.query.customer_id === 'string' ? parseInt(req.query.customer_id, 10) : null;
    const jobIdForList = typeof req.query.job_id === 'string' ? parseInt(req.query.job_id, 10) : NaN;
    const listScopedToJob = Number.isFinite(jobIdForList) && jobIdForList > 0;
    const offset = (page - 1) * limit;
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const conditions: string[] = [];
    const countParams: unknown[] = [];
    const listParams: unknown[] = [];
    let p = 1;
    /* Listing a specific job's invoices must include auto-generated drafts owned by the job creator. */
    if (!isSuperAdmin && !listScopedToJob) {
      conditions.push(`i.created_by = $${p++}`);
      countParams.push(userId);
      listParams.push(userId);
    }
    if (search) {
      conditions.push(`(i.invoice_number ILIKE $${p} OR c.full_name ILIKE $${p})`);
      countParams.push(`%${search}%`);
      listParams.push(`%${search}%`);
      p++;
    }
    if (stateFilter) {
      conditions.push(`i.state = $${p++}`);
      countParams.push(stateFilter);
      listParams.push(stateFilter);
    }
    const jobId =
      typeof req.query.job_id === 'string' ? parseInt(req.query.job_id, 10) : null;
    const invoiceWorkAddressId =
      typeof req.query.invoice_work_address_id === 'string' ? parseInt(req.query.invoice_work_address_id, 10) : null;
    if (customerId && Number.isFinite(customerId)) {
      conditions.push(`i.customer_id = $${p++}`);
      countParams.push(customerId);
      listParams.push(customerId);
      if (!(invoiceWorkAddressId && Number.isFinite(invoiceWorkAddressId)) && !(jobId && Number.isFinite(jobId))) {
        /* Customer-level list: only invoices not tied to a work / site; work-site invoices use invoice_work_address_id. */
        conditions.push(`i.invoice_work_address_id IS NULL`);
      }
    }
    if (jobId && Number.isFinite(jobId)) {
      conditions.push(`i.job_id = $${p++}`);
      countParams.push(jobId);
      listParams.push(jobId);
    }
    if (invoiceWorkAddressId && Number.isFinite(invoiceWorkAddressId)) {
      conditions.push(`i.invoice_work_address_id = $${p++}`);
      countParams.push(invoiceWorkAddressId);
      listParams.push(invoiceWorkAddressId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    listParams.push(limit, offset);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM invoices i JOIN customers c ON c.id = i.customer_id ${whereClause}`,
      countParams,
    );
    const limitIdx = listParams.length - 1;
    const offsetIdx = listParams.length;
    const listResult = await pool.query<DbInvoice & { customer_full_name?: string; job_title?: string }>(
      `SELECT i.id, i.invoice_number, i.customer_id, i.job_id, i.invoice_date, i.due_date, i.subtotal, i.tax_amount, i.total_amount, i.total_paid, i.currency, i.state, i.created_at,
        c.full_name AS customer_full_name, j.title AS job_title
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN jobs j ON j.id = i.job_id
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams,
    );

    const total = Number((countResult.rows[0] as { total: number }).total);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const ownerClause = isSuperAdmin ? '' : 'WHERE created_by = $1';
    const countParams2 = isSuperAdmin ? [] : [userId];
    const stateStats: Record<string, { count: number; total_amount: number }> = {};
    for (const s of INVOICE_STATES) {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS c, SUM(total_amount)::numeric AS s FROM invoices
         ${ownerClause} ${ownerClause ? 'AND' : 'WHERE'} state = $${isSuperAdmin ? 1 : 2}`,
        isSuperAdmin ? [s] : [userId, s],
      );
      stateStats[s] = {
        count: Number((r.rows[0] as { c: number }).c),
        total_amount: parseFloat(String((r.rows[0] as { s: string | null }).s ?? '0')),
      };
    }

    const overallRes = await pool.query(
      `SELECT SUM(total_amount - total_paid)::numeric AS outstanding FROM invoices ${ownerClause}`,
      countParams2,
    );
    const overallOutstanding = parseFloat(String((overallRes.rows[0] as { outstanding: string | null }).outstanding ?? '0'));

    const invoices = listResult.rows.map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      customer_id: r.customer_id,
      customer_full_name: r.customer_full_name ?? null,
      job_id: r.job_id ?? null,
      job_title: r.job_title ?? null,
      invoice_date: formatInvoiceDateFromDb(r.invoice_date),
      due_date: formatInvoiceDateFromDb(r.due_date),
      subtotal: parseFloat(r.subtotal),
      tax_amount: parseFloat(r.tax_amount),
      total_amount: parseFloat(r.total_amount),
      total_paid: parseFloat(r.total_paid),
      currency: r.currency,
      state: r.state,
      created_at: (r.created_at as Date).toISOString(),
    }));

    return res.json({
      invoices,
      total,
      page,
      limit,
      totalPages,
      stateStats,
      overallOutstanding,
    });
  } catch (error) {
    console.error('List invoices error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/invoices/:id', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const invResult = await pool.query<
      DbInvoice & {
        customer_full_name?: string;
        customer_email?: string;
        customer_phone?: string;
        address_line_1?: string | null;
        address_line_2?: string | null;
        address_line_3?: string | null;
        town?: string | null;
        county?: string | null;
        postcode?: string | null;
        address?: string | null;
        city?: string | null;
        region?: string | null;
        country?: string | null;
        job_title?: string;
        job_customer_reference?: string | null;
        job_created_by?: number | null;
      }
    >(
      `SELECT i.*, c.full_name AS customer_full_name, c.email AS customer_email, c.phone AS customer_phone,
        c.address_line_1, c.address_line_2, c.address_line_3, c.town, c.county, c.postcode,
        c.address, c.city, c.region, c.country,
        j.title AS job_title,
        j.customer_reference AS job_customer_reference,
        j.created_by AS job_created_by
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1`,
      [id],
    );
    if ((invResult.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
    const inv = invResult.rows[0];
    if (!canAccessInvoice(inv as DbInvoice, userId, isSuperAdmin, inv.job_created_by ?? null)) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const lineItemsResult = await pool.query(
      'SELECT id, description, quantity, unit_price, amount, sort_order FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order ASC, id ASC',
      [id],
    );
    const paymentsResult = await pool.query(
      'SELECT id, amount, payment_method, payment_date, reference_number, created_at FROM invoice_payments WHERE invoice_id = $1 ORDER BY payment_date DESC',
      [id],
    );
    const activitiesResult = await pool.query(
      'SELECT id, action, details, created_at, created_by FROM invoice_activities WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 500',
      [id],
    );
    const settings = await getInvoiceSettings(inv.created_by ?? userId);

    const invRef = inv.customer_reference?.trim() || null;
    const jobRef = inv.job_customer_reference?.trim() || null;
    const customerReferenceDisplay = invRef || jobRef || null;

    const customerAddressFormatted = formatCustomerAddressSingleLine(inv as unknown as Record<string, unknown>) || null;

    const quotation = {
      id: inv.id,
      invoice_number: inv.invoice_number,
      customer_id: inv.customer_id,
      customer_full_name: inv.customer_full_name ?? null,
      customer_email: inv.customer_email ?? null,
      customer_phone: inv.customer_phone ?? null,
      customer_address: customerAddressFormatted,
      job_id: inv.job_id ?? null,
      job_title: inv.job_title ?? null,
      customer_reference: customerReferenceDisplay,
      invoice_date: (inv.invoice_date as Date).toISOString().slice(0, 10),
      due_date: (inv.due_date as Date).toISOString().slice(0, 10),
      subtotal: parseFloat(inv.subtotal),
      tax_amount: parseFloat(inv.tax_amount),
      total_amount: parseFloat(inv.total_amount),
      total_paid: parseFloat(inv.total_paid),
      currency: inv.currency,
      notes: inv.notes ?? null,
      description: inv.description ?? null,
      billing_address: inv.billing_address ?? null,
      invoice_work_address_id: inv.invoice_work_address_id ?? null,
      state: inv.state,
      created_at: (inv.created_at as Date).toISOString(),
      updated_at: (inv.updated_at as Date).toISOString(),
    };

    let workSiteName: string | null = null;
    let workSiteAddressOnly: string | null = null;
    if (inv.invoice_work_address_id) {
      const waRes = await pool.query('SELECT * FROM customer_work_addresses WHERE id = $1 AND customer_id = $2', [
        inv.invoice_work_address_id,
        inv.customer_id,
      ]);
      if ((waRes.rowCount ?? 0) > 0) {
        const wa = waRes.rows[0] as Record<string, unknown>;
        const n = typeof wa.name === 'string' ? wa.name.trim() : '';
        workSiteName = n || null;
        const addrOnly = formatWorkAddressSingleLineWithoutName(wa).trim();
        workSiteAddressOnly = addrOnly || null;
      }
      if (!workSiteName && !workSiteAddressOnly && inv.billing_address?.trim()) {
        workSiteAddressOnly = workSiteAddressAsSingleLine(inv.billing_address.trim());
      }
    }
    const invoiceCustomAddress =
      !inv.invoice_work_address_id && inv.billing_address?.trim() ? inv.billing_address.trim() : null;

    const invoice = {
      id: inv.id,
      invoice_number: inv.invoice_number,
      customer_id: inv.customer_id,
      customer_full_name: inv.customer_full_name ?? null,
      customer_email: inv.customer_email ?? null,
      customer_phone: inv.customer_phone ?? null,
      customer_address: customerAddressFormatted,
      work_site_name: workSiteName,
      work_site_address: workSiteAddressOnly,
      invoice_custom_address: invoiceCustomAddress,
      job_id: inv.job_id ?? null,
      job_title: inv.job_title ?? null,
      invoice_work_address_id: inv.invoice_work_address_id ?? null,
      customer_reference: invRef,
      job_customer_reference: jobRef,
      customer_reference_display: customerReferenceDisplay,
      invoice_date: formatInvoiceDateFromDb(inv.invoice_date),
      due_date: formatInvoiceDateFromDb(inv.due_date),
      subtotal: parseFloat(inv.subtotal),
      tax_amount: parseFloat(inv.tax_amount),
      total_amount: parseFloat(inv.total_amount),
      total_paid: parseFloat(inv.total_paid),
      currency: inv.currency,
      notes: inv.notes ?? null,
      description: inv.description ?? null,
      billing_address: inv.billing_address ?? null,
      state: inv.state,
      created_at: (inv.created_at as Date).toISOString(),
      updated_at: (inv.updated_at as Date).toISOString(),
      created_by: inv.created_by,
      line_items: lineItemsResult.rows.map((row: { id: number; description: string; quantity: string; unit_price: string; amount: string; sort_order: number }) => ({
        id: row.id,
        description: row.description,
        quantity: parseFloat(row.quantity),
        unit_price: parseFloat(row.unit_price),
        amount: parseFloat(row.amount),
        sort_order: row.sort_order,
      })),
      payments: paymentsResult.rows.map((row: { id: number; amount: string; payment_method: string | null; payment_date: Date; reference_number: string | null; created_at: Date }) => ({
        id: row.id,
        amount: parseFloat(row.amount),
        payment_method: row.payment_method ?? null,
        payment_date: (row.payment_date as Date).toISOString().slice(0, 10),
        reference_number: row.reference_number ?? null,
        created_at: (row.created_at as Date).toISOString(),
      })),
      activities: activitiesResult.rows.map((row: { id: number; action: string; details: unknown; created_at: Date; created_by: number | null }) => ({
        id: row.id,
        action: row.action,
        details: row.details ?? {},
        created_at: (row.created_at as Date).toISOString(),
        created_by: row.created_by,
      })),
      settings,
    };

    return res.json({ invoice });
  } catch (error) {
    console.error('Get invoice error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/invoices/:id/pdf', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const invResult = await pool.query<DbInvoice & { job_created_by: number | null }>(
      `SELECT i.*, j.created_by AS job_created_by
       FROM invoices i
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1`,
      [id],
    );
    if ((invResult.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
    const inv = invResult.rows[0];
    if (!canAccessInvoice(inv, userId, isSuperAdmin, inv.job_created_by ?? null)) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    const pdf = await generateInvoicePdfBuffer(pool, id);
    const safeTail = String(inv.invoice_number || `invoice-${id}`).replace(/[^\w.-]+/g, '_').slice(0, 80);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTail}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    return res.send(pdf);
  } catch (error) {
    if (error instanceof PdfRenderUnavailableError) {
      return res.status(503).json({ message: error.message });
    }
    console.error('Invoice PDF error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/invoices', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    customer_id?: number;
    job_id?: number;
    invoice_date?: string;
    due_date?: string;
    currency?: string;
    notes?: string;
    billing_address?: string;
    customer_reference?: string | null;
    line_items?: { description: string; quantity: number; unit_price: number }[];
    tax_percentage?: number;
    state?: string;
    /** Raw value from CSV import; normalized to PREFIX-000001 and checked for duplicates. */
    invoice_number?: string;
    invoice_work_address_id?: number;
    description?: string;
  };
  const customerId = typeof body.customer_id === 'number' && Number.isFinite(body.customer_id) ? body.customer_id : null;
  if (!customerId) return res.status(400).json({ message: 'Customer is required' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const custCheck = await pool.query(
    'SELECT id FROM customers WHERE id = $1' + (isSuperAdmin ? '' : ' AND created_by = $2'),
    isSuperAdmin ? [customerId] : [customerId, userId],
  );
  if ((custCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid customer' });

  const jobId = body.job_id && Number.isFinite(body.job_id) ? body.job_id : null;
  if (jobId && !isSuperAdmin) {
    const jobCheck = await pool.query('SELECT id FROM jobs WHERE id = $1 AND created_by = $2', [jobId, userId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid job' });
  }

  try {
    const settings = await getInvoiceSettings(userId);
    const invoiceDateStr = parseInvoiceDateForDb(body.invoice_date) ?? todayYyyyMmDdUtc();
    const dueDateStr =
      parseInvoiceDateForDb(body.due_date) ?? addDaysYyyyMmDd(invoiceDateStr, settings.default_due_days);
    const currency = typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim()
      : settings.default_currency;
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
    const custRef =
      typeof body.customer_reference === 'string' ? body.customer_reference.trim() || null : null;
    /** Work/site linkage: validate id belongs to customer; billing line follows site when set. */
    const resolvedWorkAddressId = await resolveWorkAddressIdForCustomer(pool, customerId, body.invoice_work_address_id);
    const rawWa = body.invoice_work_address_id;
    const requestedWa =
      rawWa !== undefined &&
      rawWa !== null &&
      !(typeof rawWa === 'string' && String(rawWa).trim() === '') &&
      (typeof rawWa === 'number' || (typeof rawWa === 'string' && String(rawWa).trim() !== ''));
    if (requestedWa && resolvedWorkAddressId === null) {
      return res.status(400).json({ message: 'Invalid work / site address for this customer' });
    }
    let billingAddress = typeof body.billing_address === 'string' ? body.billing_address.trim() || null : null;
    let invoiceWorkAddressId: number | null = resolvedWorkAddressId;
    if (resolvedWorkAddressId != null) {
      const resolvedBill = await resolveInvoiceBillingFromWorkAddress(customerId, resolvedWorkAddressId);
      billingAddress = resolvedBill.billing_address;
      invoiceWorkAddressId = resolvedBill.invoice_work_address_id;
    }
    const description = typeof body.description === 'string' ? body.description.trim() || null : null;
    const lineItems = Array.isArray(body.line_items) ? body.line_items : [];

    let subtotal = 0;
    for (const item of lineItems) {
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      const price = typeof item.unit_price === 'number' ? item.unit_price : 0;
      subtotal += qty * price;
    }
    const taxPercentage = typeof body.tax_percentage === 'number' ? Math.max(0, Math.min(100, body.tax_percentage)) : settings.default_tax_percentage;
    const taxAmount = Math.round(subtotal * (taxPercentage / 100) * 100) / 100;
    const totalAmount = subtotal + taxAmount;

    const requestedRaw = typeof body.invoice_number === 'string' ? body.invoice_number.trim() : '';
    let invoiceNumber: string;
    if (requestedRaw) {
      const normalized = normalizeInvoiceNumberFromImport(requestedRaw, settings.invoice_prefix);
      if (!normalized) {
        return res.status(400).json({ message: 'Could not parse invoice number; use e.g. INV545 or INV-000545' });
      }
      if (normalized.length > 50) {
        return res.status(400).json({ message: 'Invoice number must be 50 characters or less' });
      }
      const dup = await pool.query('SELECT id FROM invoices WHERE invoice_number = $1', [normalized]);
      if ((dup.rowCount ?? 0) > 0) {
        return res.status(400).json({ message: `Invoice number "${normalized}" already exists` });
      }
      invoiceNumber = normalized;
    } else {
      invoiceNumber = await generateInvoiceNumber(settings.invoice_prefix);
    }
    const validStates = ['draft', 'issued', 'pending_payment'];
    const targetState = body.state && validStates.includes(body.state) ? body.state : 'draft';
    const publicToken = crypto.randomBytes(32).toString('hex');

    const invResult = await pool.query<DbInvoice>(
      `INSERT INTO invoices (invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, currency, notes, billing_address, invoice_work_address_id, customer_reference, state, created_by, public_token, description)
       VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id, invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, total_paid, currency, notes, billing_address, invoice_work_address_id, customer_reference, state, created_at, updated_at, created_by, description`,
      [
        invoiceNumber,
        customerId,
        jobId,
        invoiceDateStr,
        dueDateStr,
        subtotal,
        taxAmount,
        totalAmount,
        currency,
        notes,
        billingAddress,
        invoiceWorkAddressId,
        custRef,
        targetState,
        userId,
        publicToken,
        description,
      ],
    );
    const inv = invResult.rows[0];
    const invId = inv.id;

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      const price = typeof item.unit_price === 'number' ? item.unit_price : 0;
      const amount = qty * price;
      await pool.query(
        'INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, amount, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
        [invId, item.description || 'Item', qty, price, amount, i],
      );
    }

    await logInvoiceActivity(invId, 'created', { invoice_number: invoiceNumber }, userId);

    return res.status(201).json({
      invoice: {
        id: inv.id,
        invoice_number: inv.invoice_number,
        customer_id: inv.customer_id,
        job_id: inv.job_id ?? null,
        invoice_date: formatInvoiceDateFromDb(inv.invoice_date),
        due_date: formatInvoiceDateFromDb(inv.due_date),
        subtotal: parseFloat(inv.subtotal),
        tax_amount: parseFloat(inv.tax_amount),
        total_amount: parseFloat(inv.total_amount),
        total_paid: parseFloat(inv.total_paid),
        currency: inv.currency,
        notes: inv.notes,
        description: inv.description,
        state: inv.state,
        created_at: (inv.created_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/invoices/:id', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<DbInvoice & { job_created_by?: number | null }>(
    `SELECT i.*, j.created_by AS job_created_by
     FROM invoices i
     LEFT JOIN jobs j ON j.id = i.job_id
     WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin, inv.job_created_by ?? null)) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  const body = req.body as Record<string, unknown>;
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : undefined);
  const explicitState =
    body.state && INVOICE_STATES.includes(body.state as (typeof INVOICE_STATES)[number])
      ? (body.state as (typeof INVOICE_STATES)[number])
      : undefined;

  let effectiveCustomerId = inv.customer_id;
  if (body.customer_id !== undefined && Number.isFinite(body.customer_id)) {
    const custCheck = await pool.query('SELECT id FROM customers WHERE id = $1' + (isSuperAdmin ? '' : ' AND created_by = $2'), isSuperAdmin ? [body.customer_id] : [body.customer_id, userId]);
    if ((custCheck.rowCount ?? 0) > 0) {
      updates.push(`customer_id = $${idx++}`);
      values.push(body.customer_id);
      effectiveCustomerId = body.customer_id as number;
    }
  }
  if (body.job_id !== undefined) {
    const jid = body.job_id === null ? null : (Number.isFinite(body.job_id as number) ? (body.job_id as number) : parseInt(String(body.job_id), 10));
    if (jid === null || Number.isFinite(jid)) { updates.push(`job_id = $${idx++}`); values.push(jid); }
  }
  if (str('invoice_number') !== undefined) {
    const num = str('invoice_number');
    if (num) {
      const dup = await pool.query('SELECT id FROM invoices WHERE invoice_number = $1 AND id <> $2', [num, id]);
      if ((dup.rowCount ?? 0) > 0) return res.status(400).json({ message: 'Invoice number already in use' });
      updates.push(`invoice_number = $${idx++}`);
      values.push(num);
    }
  }
  if (body.invoice_date !== undefined) {
    const ds = parseInvoiceDateForDb(body.invoice_date);
    if (ds) {
      updates.push(`invoice_date = $${idx++}`);
      values.push(ds);
    }
  }
  if (body.due_date !== undefined) {
    const ds = parseInvoiceDateForDb(body.due_date);
    if (ds) {
      updates.push(`due_date = $${idx++}`);
      values.push(ds);
    }
  }
  if (str('currency') !== undefined) { updates.push(`currency = $${idx++}`); values.push(str('currency')); }
  if (str('notes') !== undefined) { updates.push(`notes = $${idx++}`); values.push(str('notes')); }
  if (str('description') !== undefined) { updates.push(`description = $${idx++}`); values.push(str('description')); }

  const customerChanged =
    body.customer_id !== undefined &&
    Number.isFinite(body.customer_id as number) &&
    (body.customer_id as number) !== inv.customer_id;
  if (customerChanged && inv.invoice_work_address_id) {
    updates.push(`invoice_work_address_id = $${idx++}`);
    values.push(null);
  }
  const workSiteLocked =
    !!(inv.invoice_work_address_id && !customerChanged && effectiveCustomerId === inv.customer_id);
  if (!workSiteLocked && str('billing_address') !== undefined) {
    updates.push(`billing_address = $${idx++}`);
    values.push(str('billing_address'));
  }

  if (str('customer_reference') !== undefined) {
    updates.push(`customer_reference = $${idx++}`);
    values.push(str('customer_reference'));
  }

  let stateToSet: string | undefined;

  if (Array.isArray(body.line_items)) {
    await pool.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [id]);
    let subtotal = 0;
    for (let i = 0; i < body.line_items.length; i++) {
      const item = body.line_items[i] as { description?: string; quantity?: number; unit_price?: number };
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      const price = typeof item.unit_price === 'number' ? item.unit_price : 0;
      const amount = qty * price;
      subtotal += amount;
      await pool.query(
        'INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, amount, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, item.description || 'Item', qty, price, amount, i],
      );
    }
    const prevSubtotal = parseFloat(inv.subtotal);
    const prevTaxAmount = parseFloat(inv.tax_amount);
    const taxPercentage = typeof body.tax_percentage === 'number'
      ? Math.max(0, Math.min(100, body.tax_percentage))
      : (prevSubtotal > 0 ? (prevTaxAmount / prevSubtotal) * 100 : 0);
    const taxAmount = Math.round(subtotal * (taxPercentage / 100) * 100) / 100;
    const totalAmount = subtotal + taxAmount;
    const totalPaid =
      typeof body.total_paid === 'number' && Number.isFinite(body.total_paid)
        ? Math.max(0, body.total_paid)
        : parseFloat(inv.total_paid);
    updates.push(`subtotal = $${idx++}`);
    values.push(subtotal);
    updates.push(`tax_amount = $${idx++}`);
    values.push(taxAmount);
    updates.push(`total_amount = $${idx++}`);
    values.push(totalAmount);
    if (typeof body.total_paid === 'number' && Number.isFinite(body.total_paid)) {
      updates.push(`total_paid = $${idx++}`);
      values.push(Math.max(0, Math.round(body.total_paid * 100) / 100));
    }
    if (explicitState !== undefined) {
      stateToSet = explicitState;
    } else {
      if (totalPaid >= totalAmount && totalAmount > 0) stateToSet = 'paid';
      else if (totalPaid > 0) stateToSet = 'partially_paid';
    }
  } else {
    if (typeof body.total_paid === 'number' && Number.isFinite(body.total_paid)) {
      updates.push(`total_paid = $${idx++}`);
      values.push(Math.max(0, Math.round(body.total_paid * 100) / 100));
    }
    if (typeof body.tax_percentage === 'number') {
      const subtotal = parseFloat(inv.subtotal);
      const taxPct = Math.max(0, Math.min(100, body.tax_percentage));
      const taxAmount = Math.round(subtotal * (taxPct / 100) * 100) / 100;
      const totalAmount = subtotal + taxAmount;
      updates.push(`tax_amount = $${idx++}`);
      values.push(taxAmount);
      updates.push(`total_amount = $${idx++}`);
      values.push(totalAmount);
    }
    if (explicitState !== undefined) {
      stateToSet = explicitState;
    }
  }

  if (stateToSet !== undefined) {
    updates.push(`state = $${idx++}`);
    values.push(stateToSet);
  }

  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(id);

  try {
    const result = await pool.query<DbInvoice>(
      `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    const r = result.rows[0];
    await logInvoiceActivity(id, 'updated', {}, userId);
    return res.json({
      invoice: {
        id: r.id,
        invoice_number: r.invoice_number,
        customer_id: r.customer_id,
        job_id: r.job_id ?? null,
        invoice_date: formatInvoiceDateFromDb(r.invoice_date),
        due_date: formatInvoiceDateFromDb(r.due_date),
        subtotal: parseFloat(r.subtotal),
        tax_amount: parseFloat(r.tax_amount),
        total_amount: parseFloat(r.total_amount),
        total_paid: parseFloat(r.total_paid),
        currency: r.currency,
        state: r.state,
        updated_at: (r.updated_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Update invoice error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/invoices/:id/payments', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<DbInvoice & { job_created_by?: number | null }>(
    `SELECT i.*, j.created_by AS job_created_by
     FROM invoices i
     LEFT JOIN jobs j ON j.id = i.job_id
     WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin, inv.job_created_by ?? null)) {
    return res.status(404).json({ message: 'Invoice not found' });
  }
  if (inv.state === 'cancelled') return res.status(400).json({ message: 'Cannot add payment to cancelled invoice' });

  const body = req.body as { amount?: number; payment_method?: string; payment_date?: string; reference_number?: string };
  const amountCentsInput = parseInvoicePaymentAmountCents(body.amount);
  if (amountCentsInput === null) {
    return res.status(400).json({ message: 'Payment amount is required (minimum 0.01)' });
  }
  const amount = amountCentsInput / 100;
  const totalAmountNum = parseFloat(String(inv.total_amount));
  const totalPaidNum = parseFloat(String(inv.total_paid));
  const remainingCents = Math.max(0, Math.round((totalAmountNum - totalPaidNum) * 100));
  if (amountCentsInput > remainingCents) {
    return res.status(400).json({ message: 'Amount exceeds remaining balance' });
  }
  const paymentDate = body.payment_date ? new Date(body.payment_date) : new Date();
  const paymentMethod = body.payment_method && PAYMENT_METHODS.includes(body.payment_method as typeof PAYMENT_METHODS[number]) ? body.payment_method : 'other';
  const referenceNumber = typeof body.reference_number === 'string' ? body.reference_number.trim() || null : null;

  const newTotalPaidCents = Math.round(totalPaidNum * 100) + amountCentsInput;
  const newTotalAmountCents = Math.round(totalAmountNum * 100);
  const dueDateObj = inv.due_date instanceof Date ? inv.due_date : new Date(String(inv.due_date));
  const newState = computeInvoiceStateAfterPaymentBalance({
    totalPaidCents: newTotalPaidCents,
    totalAmountCents: newTotalAmountCents,
    previousState: inv.state,
    dueDate: dueDateObj,
  });

  try {
    await pool.query(
      'INSERT INTO invoice_payments (invoice_id, amount, payment_method, payment_date, reference_number, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, amount, paymentMethod, paymentDate, referenceNumber, userId],
    );
    await pool.query(
      'UPDATE invoices SET total_paid = total_paid + $1, state = $2, updated_at = NOW() WHERE id = $3',
      [amount, newState, id],
    );
    await logInvoiceActivity(id, 'payment_recorded', { amount, payment_method: paymentMethod, reference_number: referenceNumber }, userId);

    const updated = await pool.query<DbInvoice>('SELECT * FROM invoices WHERE id = $1', [id]);
    const r = updated.rows[0];
    return res.status(201).json({
      payment: { amount, payment_method: paymentMethod, payment_date: paymentDate.toISOString().slice(0, 10), reference_number: referenceNumber },
      invoice: {
        id: r.id,
        total_paid: parseFloat(r.total_paid),
        state: r.state,
      },
    });
  } catch (error) {
    console.error('Add payment error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch(
  '/api/invoices/:id/payments/:paymentId',
  authenticate,
  requireTenantCrmAccess('invoices'),
  async (req: AuthenticatedRequest, res: Response) => {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(String(idParam), 10);
    const pidParam = Array.isArray(req.params.paymentId) ? req.params.paymentId[0] : req.params.paymentId;
    const paymentId = parseInt(String(pidParam), 10);
    if (!Number.isFinite(id) || !Number.isFinite(paymentId)) {
      return res.status(400).json({ message: 'Invalid invoice or payment id' });
    }
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const invCheck = await pool.query<DbInvoice & { job_created_by?: number | null }>(
      `SELECT i.*, j.created_by AS job_created_by
       FROM invoices i
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1`,
      [id],
    );
    if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
    const inv = invCheck.rows[0];
    if (!canAccessInvoice(inv, userId, isSuperAdmin, inv.job_created_by ?? null)) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    if (inv.state === 'cancelled') return res.status(400).json({ message: 'Cannot edit payments on a cancelled invoice' });

    const body = req.body as { amount?: number; payment_method?: string; payment_date?: string; reference_number?: string };
    const hasAmount = body.amount !== undefined;
    const hasMethod = body.payment_method !== undefined;
    const hasDate = body.payment_date !== undefined;
    const hasRef = body.reference_number !== undefined;
    if (!hasAmount && !hasMethod && !hasDate && !hasRef) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const payRow = await pool.query<{
      amount: string;
      payment_method: string | null;
      payment_date: Date;
      reference_number: string | null;
    }>('SELECT amount, payment_method, payment_date, reference_number FROM invoice_payments WHERE id = $1 AND invoice_id = $2', [
      paymentId,
      id,
    ]);
    if ((payRow.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Payment not found' });
    const prev = payRow.rows[0];

    const oldAmountCents = Math.round(parseFloat(String(prev.amount)) * 100);
    let newAmountCents = oldAmountCents;
    if (hasAmount) {
      const parsed = parseInvoicePaymentAmountCents(body.amount);
      if (parsed === null) return res.status(400).json({ message: 'Payment amount must be at least 0.01' });
      newAmountCents = parsed;
    }
    const newAmount = newAmountCents / 100;

    const paymentMethod = hasMethod
      ? body.payment_method && PAYMENT_METHODS.includes(body.payment_method as (typeof PAYMENT_METHODS)[number])
        ? body.payment_method
        : 'other'
      : prev.payment_method;

    let paymentDate: Date;
    if (hasDate) {
      paymentDate = new Date(body.payment_date as string);
      if (Number.isNaN(paymentDate.getTime())) {
        return res.status(400).json({ message: 'Invalid payment date' });
      }
    } else {
      paymentDate = prev.payment_date instanceof Date ? prev.payment_date : new Date(String(prev.payment_date));
    }

    const referenceNumber = hasRef
      ? typeof body.reference_number === 'string'
        ? body.reference_number.trim() || null
        : null
      : prev.reference_number;

    const totalAmountNum = parseFloat(String(inv.total_amount));
    const totalPaidNum = parseFloat(String(inv.total_paid));
    const totalAmountCents = Math.round(totalAmountNum * 100);
    const currentTotalPaidCents = Math.round(totalPaidNum * 100);
    const newTotalPaidCents = currentTotalPaidCents - oldAmountCents + newAmountCents;
    if (newTotalPaidCents < 0) {
      return res.status(400).json({ message: 'Invalid adjustment' });
    }
    if (newTotalPaidCents > totalAmountCents) {
      return res.status(400).json({ message: 'Amount exceeds remaining balance' });
    }

    const dueDateObj = inv.due_date instanceof Date ? inv.due_date : new Date(String(inv.due_date));
    const newState = computeInvoiceStateAfterPaymentBalance({
      totalPaidCents: newTotalPaidCents,
      totalAmountCents,
      previousState: inv.state,
      dueDate: dueDateObj,
    });
    const newTotalPaid = newTotalPaidCents / 100;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE invoice_payments SET amount = $1, payment_method = $2, payment_date = $3::date, reference_number = $4 WHERE id = $5 AND invoice_id = $6`,
        [newAmount, paymentMethod, paymentDate, referenceNumber, paymentId, id],
      );
      await client.query('UPDATE invoices SET total_paid = $1, state = $2, updated_at = NOW() WHERE id = $3', [
        newTotalPaid,
        newState,
        id,
      ]);
      await client.query(
        'INSERT INTO invoice_activities (invoice_id, action, details, created_by) VALUES ($1, $2, $3, $4)',
        [
          id,
          'payment_updated',
          JSON.stringify({
            amount: newAmount,
            payment_method: paymentMethod,
            reference_number: referenceNumber,
          }),
          userId,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('Update payment error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }

    const updated = await pool.query<DbInvoice>('SELECT * FROM invoices WHERE id = $1', [id]);
    const r = updated.rows[0];
    return res.json({
      payment: {
        id: paymentId,
        amount: newAmount,
        payment_method: paymentMethod,
        payment_date: paymentDate.toISOString().slice(0, 10),
        reference_number: referenceNumber,
      },
      invoice: {
        id: r.id,
        total_paid: parseFloat(r.total_paid),
        state: r.state,
      },
    });
  },
);

app.post('/api/invoices/:id/issue', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<DbInvoice & { job_created_by?: number | null }>(
    `SELECT i.*, j.created_by AS job_created_by
     FROM invoices i
     LEFT JOIN jobs j ON j.id = i.job_id
     WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin, inv.job_created_by ?? null)) {
    return res.status(404).json({ message: 'Invoice not found' });
  }
  if (inv.state !== 'draft') return res.status(400).json({ message: 'Only draft invoices can be issued' });

  try {
    await pool.query("UPDATE invoices SET state = 'issued', updated_at = NOW() WHERE id = $1", [id]);
    await logInvoiceActivity(id, 'issued', {}, userId);
    return res.json({ success: true, state: 'issued' });
  } catch (error) {
    console.error('Issue invoice error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/invoices/:id/send', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const body = req.body as { channel?: string };
  const channel = body.channel === 'sms' ? 'sms' : 'email';

  const invCheck = await pool.query<
    DbInvoice & {
      customer_email?: string | null;
      customer_phone?: string | null;
      customer_full_name?: string | null;
      cust_addr_line_1?: string | null;
      cust_addr_line_2?: string | null;
      cust_addr_line_3?: string | null;
      cust_town?: string | null;
      cust_county?: string | null;
      cust_postcode?: string | null;
      job_created_by?: number | null;
    }
  >(
    `SELECT i.*, c.email AS customer_email, c.phone AS customer_phone, c.full_name AS customer_full_name,
            c.address_line_1 AS cust_addr_line_1, c.address_line_2 AS cust_addr_line_2, c.address_line_3 AS cust_addr_line_3,
            c.town AS cust_town, c.county AS cust_county, c.postcode AS cust_postcode,
            j.created_by AS job_created_by
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     LEFT JOIN jobs j ON j.id = i.job_id
     WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin, inv.job_created_by ?? null)) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  try {
    if (channel === 'email') {
      const emailCfg = await loadEmailSettingsPayload(userId);
      const canSendMail = emailCfg.oauth_provider || (emailCfg.smtp_enabled && createMailTransport(emailCfg));
      if (!canSendMail) {
        return res.status(400).json({
          message: 'Configure Email Settings before sending.',
        });
      }
      if (!emailCfg.from_email?.trim()) {
        return res.status(400).json({ message: 'Set From email in Settings → Email.' });
      }
      if (!inv.customer_email?.trim()) {
        return res.status(400).json({ message: 'Customer has no email address.' });
      }
    }

    const upd = await pool.query("UPDATE invoices SET state = 'pending_payment', updated_at = NOW() WHERE id = $1 AND state = 'issued' RETURNING id", [id]);
    if ((upd.rowCount ?? 0) === 0) {
      return res.status(400).json({ message: 'Only issued invoices can be sent. Issue the invoice first.' });
    }

    if (channel === 'sms') {
      await logInvoiceActivity(
        id,
        'comm_sms',
        {
          body: `Invoice ${inv.invoice_number} — SMS sent to client (integration placeholder).`,
          to_phone: inv.customer_phone ?? null,
          to_name: inv.customer_full_name ?? null,
        },
        userId,
      );
      return res.json({ success: true, message: 'Invoice SMS logged (integration placeholder)' });
    }

    const emailCfg = await loadEmailSettingsPayload(userId);
    const transport = createMailTransport(emailCfg)!;
    await ensureDefaultEmailTemplates(userId);
    const invSettings = await getInvoiceSettings(userId);
    const tpl = await pool.query<{ subject: string; body_html: string }>(
      `SELECT subject, body_html FROM email_templates WHERE created_by = $1 AND template_key = 'invoice'`,
      [userId],
    );
    const row = tpl.rows[0];
    if (!row) {
      return res.status(500).json({ message: 'Invoice email template missing' });
    }
    const vars = await buildInvoiceEmailTemplateVars(inv, invSettings);
    const subject = applyTemplateVars(row.subject, vars);
    const bodyInner = applyTemplateVars(row.body_html, vars);
    const html = wrapEmailHtml(bodyInner, emailCfg.default_signature_html);
    const from = formatFromHeader(emailCfg.from_name, emailCfg.from_email);
    await sendUserEmail(pool, userId, emailCfg, {
      from,
      to: inv.customer_email!.trim(),
      subject,
      html,
      replyTo: emailCfg.reply_to,
    });
    await logInvoiceActivity(
      id,
      'comm_email',
      {
        subject,
        body: bodyInner,
        to_email: inv.customer_email ?? null,
        to_name: inv.customer_full_name ?? null,
        status: 'sent',
        attachment_name: null,
        attachment_names: [],
        sent_via: 'smtp',
      },
      userId,
    );
    return res.json({ success: true, message: 'Invoice sent by email.' });
  } catch (error) {
    console.error('Send invoice error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ message: msg });
  }
});

app.get('/api/invoices/:id/email-compose', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<
    DbInvoice & {
      customer_email?: string | null;
      customer_full_name?: string | null;
      cust_addr_line_1?: string | null;
      cust_addr_line_2?: string | null;
      cust_addr_line_3?: string | null;
      cust_town?: string | null;
      cust_county?: string | null;
      cust_postcode?: string | null;
      job_created_by?: number | null;
      customer_invoice_reminders_enabled?: boolean;
    }
  >(
    `SELECT i.*, c.email AS customer_email, c.full_name AS customer_full_name,
            c.address_line_1 AS cust_addr_line_1, c.address_line_2 AS cust_addr_line_2, c.address_line_3 AS cust_addr_line_3,
            c.town AS cust_town, c.county AS cust_county, c.postcode AS cust_postcode,
            COALESCE(c.invoice_reminders_enabled, true) AS customer_invoice_reminders_enabled,
            j.created_by AS job_created_by
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     LEFT JOIN jobs j ON j.id = i.job_id
     WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin, inv.job_created_by ?? null)) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  try {
    await ensureDefaultEmailTemplates(userId);
    const invSettings = await getInvoiceSettings(userId);
    const emailCfg = await loadEmailSettingsPayload(userId);
    const tpl = await pool.query<{ subject: string; body_html: string }>(
      `SELECT subject, body_html FROM email_templates WHERE created_by = $1 AND template_key = 'invoice'`,
      [userId],
    );
    const row = tpl.rows[0];
    const vars = await buildInvoiceEmailTemplateVars(inv, invSettings);
    const subject = row ? applyTemplateVars(row.subject, vars) : `${invSettings.company_name ?? 'Invoice'} - ${inv.invoice_number}`;
    const bodyInner = row ? applyTemplateVars(row.body_html, vars) : `<p>Hi ${inv.customer_full_name || 'there'},</p><p>Please find your invoice <strong>${inv.invoice_number}</strong> attached below.</p><p>You can also view it online here: ${vars.invoice_link}</p>`;
    const transport = createMailTransport(emailCfg);

    const customerEmailRaw = (inv.customer_email ?? '').trim();
    const contactsForTo = await pool.query<{ email: string; first_name: string | null; surname: string }>(
      `SELECT email, first_name, surname FROM customer_contacts
       WHERE customer_id = $1 AND COALESCE(TRIM(email), '') <> ''
       ORDER BY is_primary DESC, created_at ASC`,
      [inv.customer_id],
    );
    const seenTo = new Set<string>();
    const toEmailOptions: { email: string; label: string }[] = [];
    const pushToOption = (email: string, label: string) => {
      const e = email.trim().toLowerCase();
      if (!e || seenTo.has(e)) return;
      seenTo.add(e);
      toEmailOptions.push({ email: email.trim(), label });
    };
    if (customerEmailRaw) {
      pushToOption(customerEmailRaw, `Customer (${inv.customer_full_name?.trim() || 'account'})`);
    }
    for (const c of contactsForTo.rows) {
      const name = [c.first_name, c.surname].filter(Boolean).join(' ').trim() || 'Contact';
      pushToOption(c.email, name);
    }

    return res.json({
      subject,
      body_html: bodyInner,
      signature_html: emailCfg.default_signature_html,
      from_display: formatFromHeader(emailCfg.from_name, emailCfg.from_email) || emailCfg.from_email || '',
      reply_to: emailCfg.reply_to,
      smtp_ready: !!((emailCfg.smtp_enabled && transport) || emailCfg.oauth_provider) && !!emailCfg.from_email?.trim(),
      can_send: inv.state === 'issued',
      invoice_state: inv.state,
      job_id: inv.job_id ?? null,
      default_to: inv.customer_email ?? '',
      customer_name: inv.customer_full_name ?? '',
      to_email_options: toEmailOptions,
      customer_invoice_reminders_enabled: inv.customer_invoice_reminders_enabled !== false,
    });
  } catch (error) {
    console.error('Email compose draft error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/invoices/:id/send-email', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const body = req.body as {
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    body_html?: string;
    append_signature?: boolean;
    attachments?: { filename?: string; content_base64?: string; content_type?: string }[];
  };

  const invCheck = await pool.query<
    DbInvoice & {
      customer_email?: string | null;
      customer_full_name?: string | null;
      job_created_by?: number | null;
    }
  >(
    `SELECT i.*, c.email AS customer_email, c.full_name AS customer_full_name, j.created_by AS job_created_by
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     LEFT JOIN jobs j ON j.id = i.job_id
     WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin, inv.job_created_by ?? null)) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const bodyHtmlRaw = typeof body.body_html === 'string' ? body.body_html.trim() : '';
  const cc = typeof body.cc === 'string' ? body.cc.trim() : '';
  const bcc = typeof body.bcc === 'string' ? body.bcc.trim() : '';
  const appendSig = body.append_signature !== false;

  if (!to) return res.status(400).json({ message: 'Recipient (To) is required' });
  if (!subject) return res.status(400).json({ message: 'Subject is required' });
  if (!bodyHtmlRaw) return res.status(400).json({ message: 'Message body is required' });

  const emailCfg = await loadEmailSettingsPayload(userId);
  const canSendMail = emailCfg.oauth_provider || (emailCfg.smtp_enabled && createMailTransport(emailCfg));
  if (!canSendMail) {
    return res.status(400).json({
      message: 'Configure Email Settings before sending.',
    });
  }
  if (!emailCfg.from_email?.trim()) {
    return res.status(400).json({ message: 'Set From email in Settings → Email.' });
  }

  try {
    const upd = await pool.query("UPDATE invoices SET state = 'pending_payment', updated_at = NOW() WHERE id = $1 AND state = 'issued' RETURNING id", [id]);
    if ((upd.rowCount ?? 0) === 0) {
      return res.status(400).json({ message: 'Only issued invoices can be sent. Issue the invoice first.' });
    }

    const sigHtml = appendSig ? emailCfg.default_signature_html : null;

    // Replace placeholder if exists, but DO NOT auto-append anymore
    let pToken = inv.public_token;
    if (!pToken) {
      pToken = crypto.randomBytes(32).toString('hex');
      await pool.query('UPDATE invoices SET public_token = $1 WHERE id = $2', [pToken, inv.id]);
    }
    const publicLink = `${getPublicAppBaseUrl()}/public/invoices/${pToken}`;
    let processedBody = bodyHtmlRaw;
    if (processedBody.includes('{{invoice_link}}')) {
      processedBody = processedBody.replace(/{{invoice_link}}/g, `<a href="${publicLink}">${publicLink}</a>`);
    }

    const html = wrapEmailHtml(processedBody, sigHtml);
    const from = formatFromHeader(emailCfg.from_name, emailCfg.from_email);

    const userAttachments: { filename: string; content: Buffer; contentType?: string }[] = [];
    if (Array.isArray(body.attachments)) {
      for (const a of body.attachments) {
        const fn = typeof a.filename === 'string' ? a.filename.trim() : '';
        const b64 = typeof a.content_base64 === 'string' ? a.content_base64.trim() : '';
        if (!fn || !b64) continue;
        try {
          const buf = Buffer.from(b64, 'base64');
          if (buf.length === 0 && b64.length > 0) {
            return res.status(400).json({ message: `Invalid base64 attachment data for ${fn}` });
          }
          userAttachments.push({
            filename: fn,
            content: buf,
            contentType: typeof a.content_type === 'string' ? a.content_type : undefined,
          });
        } catch {
          return res.status(400).json({ message: `Invalid attachment data for ${fn}` });
        }
      }
    }

    await sendUserEmail(pool, userId, emailCfg, {
      from,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      html,
      replyTo: emailCfg.reply_to,
      attachments: userAttachments.length > 0 ? userAttachments : undefined,
    });

    await logInvoiceActivity(
      id,
      'comm_email',
      {
        subject,
        body: bodyHtmlRaw,
        to_email: to,
        cc: cc || null,
        bcc: bcc || null,
        to_name: inv.customer_full_name ?? null,
        status: 'sent',
        sent_via: 'smtp',
        attachment_name: userAttachments[0]?.filename ?? null,
        attachment_names: userAttachments.map((x) => x.filename),
      },
      userId,
    );
    return res.json({ success: true, message: 'Invoice sent by email.' });
  } catch (error) {
    console.error('Send invoice email (compose) error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ message: msg });
  }
});

app.post('/api/invoices/:id/communications', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<DbInvoice & { job_created_by?: number | null }>(
    `SELECT i.*, j.created_by AS job_created_by
     FROM invoices i
     LEFT JOIN jobs j ON j.id = i.job_id
     WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin, inv.job_created_by ?? null)) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  const body = req.body as {
    type?: string;
    text?: string;
    subject?: string;
    body?: string;
    to_email?: string;
    to_phone?: string;
    summary?: string;
    duration_minutes?: number;
    email_status?: string;
    attachment_name?: string;
  };
  const type = typeof body.type === 'string' ? body.type.trim() : '';

  try {
    if (type === 'note') {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return res.status(400).json({ message: 'Note text is required' });
      await logInvoiceActivity(id, 'comm_note', { text }, userId);
      return res.status(201).json({ success: true });
    }
    if (type === 'email') {
      const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
      const emailBody = typeof body.body === 'string' ? body.body.trim() : '';
      const toEmail = typeof body.to_email === 'string' ? body.to_email.trim() : '';
      if (!subject || !emailBody) return res.status(400).json({ message: 'Subject and body are required' });
      await logInvoiceActivity(
        id,
        'comm_email',
        {
          subject,
          body: emailBody,
          to_email: toEmail || null,
          status: typeof body.email_status === 'string' ? body.email_status : 'sent',
          attachment_name: typeof body.attachment_name === 'string' ? body.attachment_name.trim() || null : null,
        },
        userId,
      );
      return res.status(201).json({ success: true });
    }
    if (type === 'sms') {
      const smsBody = typeof body.body === 'string' ? body.body.trim() : '';
      if (!smsBody) return res.status(400).json({ message: 'SMS body is required' });
      await logInvoiceActivity(
        id,
        'comm_sms',
        {
          body: smsBody,
          to_phone: typeof body.to_phone === 'string' ? body.to_phone.trim() || null : null,
        },
        userId,
      );
      return res.status(201).json({ success: true });
    }
    if (type === 'phone') {
      const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
      if (!summary) return res.status(400).json({ message: 'Call summary is required' });
      await logInvoiceActivity(
        id,
        'comm_phone',
        {
          summary,
          duration_minutes:
            typeof body.duration_minutes === 'number' && Number.isFinite(body.duration_minutes) ? body.duration_minutes : null,
        },
        userId,
      );
      return res.status(201).json({ success: true });
    }
    if (type === 'print') {
      await logInvoiceActivity(
        id,
        'comm_print',
        {
          label: 'Invoice printed',
          invoice_number: inv.invoice_number,
        },
        userId,
      );
      return res.status(201).json({ success: true });
    }
    return res.status(400).json({ message: 'Invalid communication type' });
  } catch (error) {
    console.error('Add invoice communication error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/invoices/:id', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<DbInvoice & { job_created_by?: number | null }>(
    `SELECT i.*, j.created_by AS job_created_by
     FROM invoices i
     LEFT JOIN jobs j ON j.id = i.job_id
     WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin, inv.job_created_by ?? null)) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  try {
    await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
    return res.status(204).send();
  } catch (error) {
    console.error('Delete invoice error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/invoices/delete-all', authenticate, requireTenantCrmAccess('invoices'), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as { confirmation?: string };
  if (body.confirmation !== 'DELETE ALL INVOICES') {
    return res.status(400).json({ message: 'Confirmation must be exactly: DELETE ALL INVOICES' });
  }
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    if (isSuperAdmin) {
      await pool.query('DELETE FROM invoices');
    } else {
      await pool.query('DELETE FROM invoices WHERE created_by = $1', [userId]);
    }
    return res.json({ success: true, message: 'All invoices deleted.' });
  } catch (error) {
    console.error('Delete all invoices error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Quotations (Admin only) ----------
const QUOTATION_STATES = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const;

async function getQuotationSettings(userId: number): Promise<{
  default_currency: string;
  quotation_prefix: string;
  terms_and_conditions: string | null;
  default_valid_days: number;
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_logo: string | null;
  company_website: string | null;
  company_tax_id: string | null;
  tax_label: string;
  default_tax_percentage: number;
  footer_text: string | null;
  payment_terms: string | null;
  bank_details: string | null;
  quotation_accent_color: string | null;
  quotation_accent_end_color: string | null;
}> {
  const r = await pool.query('SELECT * FROM quotation_settings WHERE created_by = $1', [userId]);
  if ((r.rowCount ?? 0) > 0) {
    const row = r.rows[0] as Record<string, unknown>;
    return {
      default_currency: (row.default_currency as string) ?? 'USD',
      quotation_prefix: (row.quotation_prefix as string) ?? 'QUOT',
      terms_and_conditions: (row.terms_and_conditions as string) ?? null,
      default_valid_days: Number(row.default_valid_days) ?? 30,
      company_name: (row.company_name as string) ?? 'WorkPilot',
      company_address: (row.company_address as string) ?? null,
      company_phone: (row.company_phone as string) ?? null,
      company_email: (row.company_email as string) ?? null,
      company_logo: (row.company_logo as string) ?? null,
      company_website: (row.company_website as string) ?? null,
      company_tax_id: (row.company_tax_id as string) ?? null,
      tax_label: (row.tax_label as string) ?? 'Tax',
      default_tax_percentage: row.default_tax_percentage != null ? Math.max(0, Math.min(100, Number(row.default_tax_percentage))) : 0,
      footer_text: (row.footer_text as string) ?? null,
      payment_terms: (row.payment_terms as string) ?? null,
      bank_details: (row.bank_details as string) ?? null,
      quotation_accent_color: (row.quotation_accent_color as string) ?? null,
      quotation_accent_end_color: (row.quotation_accent_end_color as string) ?? null,
    };
  }
  return {
    default_currency: 'USD',
    quotation_prefix: 'QUOT',
    terms_and_conditions: null,
    default_valid_days: 30,
    company_name: 'WorkPilot',
    company_address: null,
    company_phone: null,
    company_email: null,
    company_logo: null,
    company_website: null,
    company_tax_id: null,
    tax_label: 'Tax',
    default_tax_percentage: 0,
    footer_text: null,
    payment_terms: null,
    bank_details: null,
    quotation_accent_color: null,
    quotation_accent_end_color: null,
  };
}

async function generateQuotationNumber(prefix: string): Promise<string> {
  const p = (prefix || 'QUOT').replace(/[^A-Za-z0-9_-]/g, '') || 'QUOT';
  const r = await pool.query(
    `SELECT quotation_number FROM quotations WHERE quotation_number LIKE $1 ORDER BY id DESC LIMIT 1`,
    [`${p}-%`],
  );
  const last = r.rows[0] as { quotation_number: string } | undefined;
  const match = last ? last.quotation_number.match(new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`)) : null;
  const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
  return `${p}-${String(nextNum).padStart(6, '0')}`;
}

async function logQuotationActivity(quotationId: number, action: string, details: Record<string, unknown>, userId: number | null) {
  await pool.query(
    'INSERT INTO quotation_activities (quotation_id, action, details, created_by) VALUES ($1, $2, $3, $4)',
    [quotationId, action, JSON.stringify(details), userId],
  );
}

function canAccessQuotation(quotation: DbQuotation, userId: number, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return true;
  return quotation.created_by === userId;
}

app.get('/api/quotations', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const stateFilter = typeof req.query.state === 'string' && QUOTATION_STATES.includes(req.query.state as typeof QUOTATION_STATES[number]) ? req.query.state : '';
    const customerId = typeof req.query.customer_id === 'string' ? parseInt(req.query.customer_id, 10) : null;
    const offset = (page - 1) * limit;
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const conditions: string[] = [];
    const countParams: unknown[] = [];
    const listParams: unknown[] = [];
    let p = 1;
    if (!isSuperAdmin) {
      conditions.push(`q.created_by = $${p++}`);
      countParams.push(userId);
      listParams.push(userId);
    }
    if (search) {
      conditions.push(`(q.quotation_number ILIKE $${p} OR c.full_name ILIKE $${p})`);
      countParams.push(`%${search}%`);
      listParams.push(`%${search}%`);
      p++;
    }
    if (stateFilter) {
      conditions.push(`q.state = $${p++}`);
      countParams.push(stateFilter);
      listParams.push(stateFilter);
    }
    if (customerId && Number.isFinite(customerId)) {
      conditions.push(`q.customer_id = $${p++}`);
      countParams.push(customerId);
      listParams.push(customerId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    listParams.push(limit, offset);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM quotations q JOIN customers c ON c.id = q.customer_id ${whereClause}`,
      countParams,
    );
    const limitIdx = listParams.length - 1;
    const offsetIdx = listParams.length;
    const listResult = await pool.query<DbQuotation & { customer_full_name?: string; job_title?: string }>(
      `SELECT q.id, q.quotation_number, q.customer_id, q.job_id, q.quotation_date, q.valid_until, q.subtotal, q.tax_amount, q.total_amount, q.currency, q.state, q.created_at,
        c.full_name AS customer_full_name, j.title AS job_title
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN jobs j ON j.id = q.job_id
       ${whereClause}
       ORDER BY q.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams,
    );

    const total = Number((countResult.rows[0] as { total: number }).total);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const ownerClause = isSuperAdmin ? '' : 'WHERE created_by = $1';
    const countParams2 = isSuperAdmin ? [] : [userId];
    const stateCounts: Record<string, number> = {};
    for (const s of QUOTATION_STATES) {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS c FROM quotations ${ownerClause} ${isSuperAdmin ? 'WHERE' : 'AND'} state = $${isSuperAdmin ? 1 : 2}`,
        isSuperAdmin ? [s] : [userId, s],
      );
      stateCounts[s] = Number((r.rows[0] as { c: number }).c);
    }

    const quotations = listResult.rows.map((r) => ({
      id: r.id,
      quotation_number: r.quotation_number,
      customer_id: r.customer_id,
      customer_full_name: r.customer_full_name ?? null,
      job_id: r.job_id ?? null,
      job_title: r.job_title ?? null,
      quotation_date: (r.quotation_date as Date).toISOString().slice(0, 10),
      valid_until: (r.valid_until as Date).toISOString().slice(0, 10),
      subtotal: parseFloat(r.subtotal),
      tax_amount: parseFloat(r.tax_amount),
      total_amount: parseFloat(r.total_amount),
      currency: r.currency,
      state: r.state,
      created_at: (r.created_at as Date).toISOString(),
    }));

    return res.json({ quotations, total, page, limit, totalPages, stateCounts });
  } catch (error) {
    console.error('List quotations error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/quotations/:id', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const qResult = await pool.query<DbQuotation & { 
      customer_full_name?: string; 
      customer_email?: string; 
      customer_phone?: string; 
      address_line_1?: string;
      address_line_2?: string;
      town?: string;
      county?: string;
      postcode?: string;
      address?: string;
      city?: string;
      region?: string;
      country?: string;
      job_title?: string 
    }>(
      `SELECT q.*, c.full_name AS customer_full_name, c.email AS customer_email, c.phone AS customer_phone,
        c.address_line_1, c.address_line_2, c.town, c.county, c.postcode,
        c.address, c.city, c.region, c.country,
        j.title AS job_title
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN jobs j ON j.id = q.job_id
       WHERE q.id = $1`,
      [id],
    );
    if ((qResult.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
    const q = qResult.rows[0];
    if (!canAccessQuotation(q as DbQuotation, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });

    const lineItemsResult = await pool.query(
      'SELECT id, description, quantity, unit_price, amount, sort_order FROM quotation_line_items WHERE quotation_id = $1 ORDER BY sort_order ASC, id ASC',
      [id],
    );
    const activitiesResult = await pool.query(
      'SELECT id, action, details, created_at, created_by FROM quotation_activities WHERE quotation_id = $1 ORDER BY created_at DESC LIMIT 50',
      [id],
    );
    const internalNotesResult = await pool.query<{
      id: number;
      body: string;
      media: unknown;
      created_at: Date;
      created_by: number | null;
      created_by_label: string | null;
    }>(
      `SELECT n.id, n.body, n.media, n.created_at, n.created_by,
              COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS created_by_label
       FROM quotation_internal_notes n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.quotation_id = $1
       ORDER BY n.created_at DESC`,
      [id],
    );
    const settings = await getQuotationSettings(q.created_by ?? userId);

    const customerAddressFormatted =
      formatCustomerAddressSingleLine(q as unknown as Record<string, unknown>) || null;
    const workSite = await resolveWorkSiteDisplayForCustomer(
      q.customer_id,
      q.quotation_work_address_id,
      q.billing_address,
    );

    const quotation = {
      id: q.id,
      quotation_number: q.quotation_number,
      customer_id: q.customer_id,
      customer_full_name: q.customer_full_name ?? null,
      customer_email: q.customer_email ?? null,
      customer_phone: q.customer_phone ?? null,
      customer_address: customerAddressFormatted,
      quotation_work_address_id: q.quotation_work_address_id ?? null,
      work_site_name: workSite.work_site_name,
      work_site_address: workSite.work_site_address,
      quotation_custom_address: workSite.quotation_custom_address,
      job_id: q.job_id ?? null,
      job_title: q.job_title ?? null,
      quotation_date: (q.quotation_date as Date).toISOString().slice(0, 10),
      valid_until: (q.valid_until as Date).toISOString().slice(0, 10),
      subtotal: parseFloat(q.subtotal),
      tax_amount: parseFloat(q.tax_amount),
      total_amount: parseFloat(q.total_amount),
      currency: q.currency,
      notes: q.notes ?? null,
      description: q.description ?? null,
      billing_address: q.billing_address ?? null,
      state: q.state,
      created_at: (q.created_at as Date).toISOString(),
      updated_at: (q.updated_at as Date).toISOString(),
      created_by: q.created_by,
      public_token: q.public_token ?? null,
      line_items: lineItemsResult.rows.map((row: { id: number; description: string; quantity: string; unit_price: string; amount: string; sort_order: number }) => ({
        id: row.id,
        description: row.description,
        quantity: parseFloat(row.quantity),
        unit_price: parseFloat(row.unit_price),
        amount: parseFloat(row.amount),
        sort_order: row.sort_order,
      })),
      activities: activitiesResult.rows.map((row: { id: number; action: string; details: unknown; created_at: Date; created_by: number | null }) => ({
        id: row.id,
        action: row.action,
        details: row.details ?? {},
        created_at: (row.created_at as Date).toISOString(),
        created_by: row.created_by,
      })),
      internal_notes: internalNotesResult.rows.map((row) => {
        const rawMedia = Array.isArray(row.media) ? row.media : [];
        const media = rawMedia
          .filter((m: unknown) => m && typeof m === 'object' && typeof (m as { stored_filename?: unknown }).stored_filename === 'string')
          .map((m: unknown) => {
            const item = m as {
              stored_filename: string;
              original_filename?: string;
              content_type?: string;
              kind?: string;
              byte_size?: number;
            };
            return {
              stored_filename: item.stored_filename,
              original_filename: item.original_filename ?? null,
              content_type: item.content_type ?? null,
              kind: item.kind ?? 'image',
              byte_size: item.byte_size ?? null,
              file_path: `/quotations/${id}/internal-notes/${row.id}/files/${encodeURIComponent(item.stored_filename)}`,
            };
          });
        return {
          id: row.id,
          body: row.body,
          media,
          created_at: (row.created_at as Date).toISOString(),
          created_by: row.created_by,
          created_by_label: row.created_by_label ?? null,
        };
      }),
      settings,
    };

    return res.json({ quotation });
  } catch (error) {
    console.error('Get quotation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/quotations/:id/pdf', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const qResult = await pool.query<DbQuotation>(
      `SELECT q.* FROM quotations q WHERE q.id = $1`,
      [id],
    );
    if ((qResult.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
    const q = qResult.rows[0];
    if (!canAccessQuotation(q, userId, isSuperAdmin)) {
      return res.status(404).json({ message: 'Quotation not found' });
    }
    const pdf = await generateQuotationPdfBuffer(pool, id);
    const safeTail = String(q.quotation_number || `quotation-${id}`).replace(/[^\w.-]+/g, '_').slice(0, 80);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTail}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    return res.send(pdf);
  } catch (error) {
    if (error instanceof PdfRenderUnavailableError) {
      return res.status(503).json({ message: error.message });
    }
    console.error('Quotation PDF error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/quotations/:id/internal-notes', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const quotationId = parseInt(String(idParam), 10);
  if (!Number.isFinite(quotationId)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const body = req.body as { body?: unknown; media?: unknown };
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const rawMedia = Array.isArray(body.media) ? body.media : [];
  if (text.length === 0 && rawMedia.length === 0) {
    return res.status(400).json({ message: 'Add a note and/or at least one image.' });
  }
  if (text.length > 20000) return res.status(400).json({ message: 'Note is too long' });
  if (rawMedia.length > QUOTATION_INTERNAL_NOTE_MAX_FILES) {
    return res.status(400).json({ message: `At most ${QUOTATION_INTERNAL_NOTE_MAX_FILES} images per note` });
  }

  const decoded: { buf: Buffer; contentType: string; original: string }[] = [];
  for (const item of rawMedia) {
    if (!item || typeof item !== 'object') {
      return res.status(400).json({ message: 'Invalid media item' });
    }
    const m = item as Record<string, unknown>;
    const b64 = typeof m.content_base64 === 'string' ? m.content_base64.trim() : '';
    if (!b64) return res.status(400).json({ message: 'Each image needs content_base64' });
    let buf: Buffer;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      return res.status(400).json({ message: 'Invalid base64 in media' });
    }
    if (buf.length === 0) return res.status(400).json({ message: 'Empty image' });
    if (buf.length > QUOTATION_INTERNAL_NOTE_FILE_MAX_BYTES) {
      return res.status(400).json({
        message: `Each image must be at most ${Math.round(QUOTATION_INTERNAL_NOTE_FILE_MAX_BYTES / (1024 * 1024))} MB`,
      });
    }
    const contentType = typeof m.content_type === 'string' ? m.content_type.trim().toLowerCase().slice(0, 80) : '';
    const baseCt = contentType.split(';')[0]!.trim();
    if (!baseCt.startsWith('image/')) {
      return res.status(400).json({ message: 'Internal note attachments support image files only' });
    }
    const original =
      typeof m.filename === 'string' && m.filename.trim() ? sanitizeStoredOriginalName(m.filename) : 'upload.jpg';
    decoded.push({ buf, contentType: baseCt, original });
  }

  const client = await pool.connect();
  try {
    const qCheck = await client.query<DbQuotation>('SELECT * FROM quotations WHERE id = $1', [quotationId]);
    if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
    const qRow = qCheck.rows[0];
    if (!canAccessQuotation(qRow, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });

    await client.query('BEGIN');
    const ins = await client.query<{ id: number; body: string; created_at: Date; created_by: number | null }>(
      `INSERT INTO quotation_internal_notes (quotation_id, body, created_by, media)
       VALUES ($1, $2, $3, '[]'::jsonb)
       RETURNING id, body, created_at, created_by`,
      [quotationId, text, userId],
    );
    const noteRow = ins.rows[0];
    const noteId = noteRow.id;

    const mediaJson: {
      stored_filename: string;
      original_filename: string;
      content_type: string;
      kind: string;
      byte_size: number;
    }[] = [];

    if (decoded.length > 0) {
      const dir = await ensureQuotationInternalNoteDir(quotationId, noteId);
      for (const d of decoded) {
        const ext = path.extname(d.original).slice(0, 32) || '.jpg';
        const storedFilename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
        const fullPath = path.join(dir, storedFilename);
        await fs.writeFile(fullPath, d.buf);
        mediaJson.push({
          stored_filename: storedFilename,
          original_filename: d.original,
          content_type: d.contentType,
          kind: 'image',
          byte_size: d.buf.length,
        });
      }
      await client.query(`UPDATE quotation_internal_notes SET media = $1::jsonb WHERE id = $2`, [JSON.stringify(mediaJson), noteId]);
    }

    const labelRes = await client.query<{ created_by_label: string | null }>(
      `SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS created_by_label
       FROM quotation_internal_notes n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.id = $1`,
      [noteId],
    );
    await client.query('COMMIT');

    const createdByLabel = labelRes.rows[0]?.created_by_label ?? null;
    const mediaOut = mediaJson.map((m) => ({
      stored_filename: m.stored_filename,
      original_filename: m.original_filename,
      content_type: m.content_type,
      kind: m.kind,
      byte_size: m.byte_size,
      file_path: `/quotations/${quotationId}/internal-notes/${noteId}/files/${encodeURIComponent(m.stored_filename)}`,
    }));

    return res.status(201).json({
      note: {
        id: noteId,
        body: noteRow.body,
        media: mediaOut,
        created_at: (noteRow.created_at as Date).toISOString(),
        created_by: noteRow.created_by,
        created_by_label: createdByLabel,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* */
    }
    console.error('Create quotation internal note error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.delete('/api/quotations/:id/internal-notes/:noteId', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const quotationId = parseInt(String(idParam), 10);
  const noteId = parseInt(String(req.params.noteId), 10);
  if (!Number.isFinite(quotationId) || !Number.isFinite(noteId)) {
    return res.status(400).json({ message: 'Invalid id' });
  }
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const qCheck = await pool.query<DbQuotation>('SELECT * FROM quotations WHERE id = $1', [quotationId]);
    if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
    if (!canAccessQuotation(qCheck.rows[0], userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });

    const del = await pool.query('DELETE FROM quotation_internal_notes WHERE id = $1 AND quotation_id = $2', [noteId, quotationId]);
    if ((del.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Note not found' });
    const noteDir = path.join(getQuotationInternalNotesRootDir(), String(quotationId), String(noteId));
    await fs.rm(noteDir, { recursive: true, force: true }).catch(() => {});
    return res.status(204).send();
  } catch (error) {
    console.error('Delete quotation internal note error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get(
  '/api/quotations/:id/internal-notes/:noteId/files/:file',
  authenticate,
  requireTenantCrmAccess('quotations'),
  async (req: AuthenticatedRequest, res: Response) => {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const quotationId = parseInt(String(idParam), 10);
    const noteId = parseInt(String(req.params.noteId), 10);
    const fileParam = req.params.file;
    const fileName = typeof fileParam === 'string' ? decodeURIComponent(fileParam) : '';
    if (!Number.isFinite(quotationId) || !Number.isFinite(noteId) || !fileName || fileName.includes('..') || path.isAbsolute(fileName)) {
      return res.status(400).json({ message: 'Invalid request' });
    }
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    try {
      const qCheck = await pool.query<DbQuotation>('SELECT * FROM quotations WHERE id = $1', [quotationId]);
      if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
      if (!canAccessQuotation(qCheck.rows[0], userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });

      const m = await pool.query<{ media: unknown }>(
        'SELECT media FROM quotation_internal_notes WHERE id = $1 AND quotation_id = $2',
        [noteId, quotationId],
      );
      if ((m.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Not found' });
      const list = m.rows[0].media as { stored_filename?: string; content_type?: string }[];
      const meta = Array.isArray(list) ? list.find((x) => x.stored_filename === fileName) : null;
      if (!meta) return res.status(404).json({ message: 'Not found' });

      const fullPath = path.join(getQuotationInternalNotesRootDir(), String(quotationId), String(noteId), fileName);
      if (!fullPath.startsWith(getQuotationInternalNotesRootDir())) {
        return res.status(400).json({ message: 'Invalid path' });
      }
      const st = await fs.stat(fullPath);
      const ct = meta.content_type && String(meta.content_type).trim() ? String(meta.content_type) : 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Length', String(st.size));
      return createReadStream(fullPath).pipe(res);
    } catch {
      return res.status(404).json({ message: 'File not found' });
    }
  },
);

app.get('/api/quotations/:id/email-compose', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const qCheck = await pool.query<
    DbQuotation & {
      customer_email?: string | null;
      customer_full_name?: string | null;
      cust_addr_line_1?: string | null;
      cust_addr_line_2?: string | null;
      cust_addr_line_3?: string | null;
      cust_town?: string | null;
      cust_county?: string | null;
      cust_postcode?: string | null;
    }
  >(
    `SELECT q.*, c.email AS customer_email, c.full_name AS customer_full_name,
            c.address_line_1 AS cust_addr_line_1, c.address_line_2 AS cust_addr_line_2, c.address_line_3 AS cust_addr_line_3,
            c.town AS cust_town, c.county AS cust_county, c.postcode AS cust_postcode
     FROM quotations q JOIN customers c ON c.id = q.customer_id WHERE q.id = $1`,
    [id],
  );
  if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
  const qRow = qCheck.rows[0];
  if (!canAccessQuotation(qRow, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });

  try {
    await ensureDefaultEmailTemplates(userId);
    const qSettings = await getQuotationSettings(userId);
    const emailCfg = await loadEmailSettingsPayload(userId);
    const tpl = await pool.query<{ subject: string; body_html: string }>(
      `SELECT subject, body_html FROM email_templates WHERE created_by = $1 AND template_key = 'quotation'`,
      [userId],
    );
    const row = tpl.rows[0];
    const vars = await buildQuotationEmailTemplateVars(qRow, qSettings);
    const subject = row ? applyTemplateVars(row.subject, vars) : `${qSettings.company_name ?? 'Quotation'} - ${qRow.quotation_number}`;
    const bodyInner = row
      ? applyTemplateVars(row.body_html, vars)
      : `<p>Hi ${qRow.customer_full_name || 'there'},</p><p>Please find your quotation <strong>${qRow.quotation_number}</strong> attached below.</p><p>You can also view it online here: ${vars.quotation_link}</p>`;
    const transport = createMailTransport(emailCfg);

    const customerEmailRaw = (qRow.customer_email ?? '').trim();
    const contactsForTo = await pool.query<{ email: string; first_name: string | null; surname: string }>(
      `SELECT email, first_name, surname FROM customer_contacts
       WHERE customer_id = $1 AND COALESCE(TRIM(email), '') <> ''
       ORDER BY is_primary DESC, created_at ASC`,
      [qRow.customer_id],
    );
    const seenTo = new Set<string>();
    const toEmailOptions: { email: string; label: string }[] = [];
    const pushToOption = (email: string, label: string) => {
      const e = email.trim().toLowerCase();
      if (!e || seenTo.has(e)) return;
      seenTo.add(e);
      toEmailOptions.push({ email: email.trim(), label });
    };
    if (customerEmailRaw) {
      pushToOption(customerEmailRaw, `Customer (${qRow.customer_full_name?.trim() || 'account'})`);
    }
    for (const c of contactsForTo.rows) {
      const name = [c.first_name, c.surname].filter(Boolean).join(' ').trim() || 'Contact';
      pushToOption(c.email, name);
    }

    const canSend = qRow.state === 'draft' || qRow.state === 'sent';

    return res.json({
      subject,
      body_html: bodyInner,
      signature_html: emailCfg.default_signature_html,
      from_display: formatFromHeader(emailCfg.from_name, emailCfg.from_email) || emailCfg.from_email || '',
      reply_to: emailCfg.reply_to,
      smtp_ready: !!((emailCfg.smtp_enabled && transport) || emailCfg.oauth_provider) && !!emailCfg.from_email?.trim(),
      can_send: canSend,
      invoice_state: qRow.state,
      job_id: qRow.job_id ?? null,
      default_to: qRow.customer_email ?? '',
      customer_name: qRow.customer_full_name ?? '',
      to_email_options: toEmailOptions,
    });
  } catch (error) {
    console.error('Quotation email compose draft error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/quotations/:id/send-email', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const body = req.body as {
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    body_html?: string;
    append_signature?: boolean;
    attachments?: { filename?: string; content_base64?: string; content_type?: string }[];
  };

  const qCheck = await pool.query<
    DbQuotation & { customer_email?: string | null; customer_full_name?: string | null }
  >(
    `SELECT q.*, c.email AS customer_email, c.full_name AS customer_full_name
     FROM quotations q JOIN customers c ON c.id = q.customer_id WHERE q.id = $1`,
    [id],
  );
  if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
  const qRow = qCheck.rows[0];
  if (!canAccessQuotation(qRow, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const bodyHtmlRaw = typeof body.body_html === 'string' ? body.body_html.trim() : '';
  const cc = typeof body.cc === 'string' ? body.cc.trim() : '';
  const bcc = typeof body.bcc === 'string' ? body.bcc.trim() : '';
  const appendSig = body.append_signature !== false;

  if (!to) return res.status(400).json({ message: 'Recipient (To) is required' });
  if (!subject) return res.status(400).json({ message: 'Subject is required' });
  if (!bodyHtmlRaw) return res.status(400).json({ message: 'Message body is required' });

  if (qRow.state !== 'draft' && qRow.state !== 'sent') {
    return res.status(400).json({ message: 'Only draft or sent quotations can be emailed from here.' });
  }

  const emailCfg = await loadEmailSettingsPayload(userId);
  const canSendMail = emailCfg.oauth_provider || (emailCfg.smtp_enabled && createMailTransport(emailCfg));
  if (!canSendMail) {
    return res.status(400).json({
      message: 'Configure Email Settings before sending.',
    });
  }
  if (!emailCfg.from_email?.trim()) {
    return res.status(400).json({ message: 'Set From email in Settings → Email.' });
  }

  try {
    if (qRow.state === 'draft') {
      const upd = await pool.query(
        "UPDATE quotations SET state = 'sent', updated_at = NOW() WHERE id = $1 AND state = 'draft' RETURNING id",
        [id],
      );
      if ((upd.rowCount ?? 0) === 0) {
        return res.status(400).json({ message: 'Quotation state changed; refresh and try again.' });
      }
    }

    const sigHtml = appendSig ? emailCfg.default_signature_html : null;

    let pToken = qRow.public_token;
    if (!pToken) {
      pToken = crypto.randomBytes(32).toString('hex');
      await pool.query('UPDATE quotations SET public_token = $1 WHERE id = $2', [pToken, qRow.id]);
    }
    const publicLink = `${getPublicAppBaseUrl()}/public/quotations/${pToken}`;
    let processedBody = bodyHtmlRaw;
    if (processedBody.includes('{{quotation_link}}')) {
      processedBody = processedBody.replace(/{{quotation_link}}/g, `<a href="${publicLink}">${publicLink}</a>`);
    }

    const html = wrapEmailHtml(processedBody, sigHtml);
    const from = formatFromHeader(emailCfg.from_name, emailCfg.from_email);

    const userAttachments: { filename: string; content: Buffer; contentType?: string }[] = [];
    if (Array.isArray(body.attachments)) {
      for (const a of body.attachments) {
        const fn = typeof a.filename === 'string' ? a.filename.trim() : '';
        const b64 = typeof a.content_base64 === 'string' ? a.content_base64.trim() : '';
        if (!fn || !b64) continue;
        try {
          const buf = Buffer.from(b64, 'base64');
          if (buf.length === 0 && b64.length > 0) {
            return res.status(400).json({ message: `Invalid base64 attachment data for ${fn}` });
          }
          userAttachments.push({
            filename: fn,
            content: buf,
            contentType: typeof a.content_type === 'string' ? a.content_type : undefined,
          });
        } catch {
          return res.status(400).json({ message: `Invalid attachment data for ${fn}` });
        }
      }
    }

    await sendUserEmail(pool, userId, emailCfg, {
      from,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      html,
      replyTo: emailCfg.reply_to,
      attachments: userAttachments.length > 0 ? userAttachments : undefined,
    });

    await logQuotationActivity(id, 'comm_email', {
      subject,
      body: bodyHtmlRaw,
      to_email: to,
      cc: cc || null,
      bcc: bcc || null,
      to_name: qRow.customer_full_name ?? null,
      status: 'sent',
      sent_via: 'smtp',
      attachment_name: userAttachments[0]?.filename ?? null,
      attachment_names: userAttachments.map((x) => x.filename),
    }, userId);

    return res.json({ success: true, message: 'Quotation sent by email.' });
  } catch (error) {
    console.error('Send quotation email (compose) error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ message: msg });
  }
});

app.post('/api/quotations', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    customer_id?: number;
    job_id?: number;
    quotation_date?: string;
    valid_until?: string;
    currency?: string;
    notes?: string;
    billing_address?: string;
    quotation_work_address_id?: number;
    line_items?: { description: string; quantity: number; unit_price: number }[];
    tax_percentage?: number;
    description?: string;
  };
  const customerId = typeof body.customer_id === 'number' && Number.isFinite(body.customer_id) ? body.customer_id : null;
  if (!customerId) return res.status(400).json({ message: 'Customer is required' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const custCheck = await pool.query(
    'SELECT id FROM customers WHERE id = $1' + (isSuperAdmin ? '' : ' AND created_by = $2'),
    isSuperAdmin ? [customerId] : [customerId, userId],
  );
  if ((custCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid customer' });

  const jobId = body.job_id && Number.isFinite(body.job_id) ? body.job_id : null;
  if (jobId && !isSuperAdmin) {
    const jobCheck = await pool.query('SELECT id FROM jobs WHERE id = $1 AND created_by = $2', [jobId, userId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid job' });
  }

  try {
    const settings = await getQuotationSettings(userId);
    const quotationDate = body.quotation_date ? new Date(body.quotation_date) : new Date();
    const validUntil = body.valid_until
      ? new Date(body.valid_until)
      : new Date(quotationDate.getTime() + settings.default_valid_days * 24 * 60 * 60 * 1000);
    const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : settings.default_currency;
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
    let billingAddress = typeof body.billing_address === 'string' ? body.billing_address.trim() || null : null;
    let quotationWorkAddressId: number | null = null;
    if (body.quotation_work_address_id !== undefined && body.quotation_work_address_id !== null) {
      const wid = parseQuotationWorkAddressIdInput(body.quotation_work_address_id);
      if (wid === undefined || wid === null) {
        return res.status(400).json({ message: 'Invalid quotation_work_address_id' });
      }
      try {
        const resolved = await resolveInvoiceBillingFromWorkAddress(customerId, wid);
        billingAddress = resolved.billing_address;
        quotationWorkAddressId = resolved.invoice_work_address_id;
      } catch (e) {
        if ((e as Error).message === 'INVALID_WORK_ADDRESS') {
          return res.status(400).json({ message: 'Invalid work address for this customer' });
        }
        throw e;
      }
    }
    const description = typeof body.description === 'string' ? body.description.trim() || null : null;
    const lineItems = Array.isArray(body.line_items) ? body.line_items : [];

    let subtotal = 0;
    for (const item of lineItems) {
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      const price = typeof item.unit_price === 'number' ? item.unit_price : 0;
      subtotal += qty * price;
    }
    const taxPercentage = typeof body.tax_percentage === 'number' ? Math.max(0, Math.min(100, body.tax_percentage)) : settings.default_tax_percentage;
    const taxAmount = Math.round(subtotal * (taxPercentage / 100) * 100) / 100;
    const totalAmount = subtotal + taxAmount;

    const quotationNumber = await generateQuotationNumber(settings.quotation_prefix);
    const qResult = await pool.query<DbQuotation>(
      `INSERT INTO quotations (quotation_number, customer_id, job_id, quotation_date, valid_until, subtotal, tax_amount, total_amount, currency, notes, billing_address, quotation_work_address_id, state, created_by, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', $13, $14)
       RETURNING id, quotation_number, customer_id, job_id, quotation_date, valid_until, subtotal, tax_amount, total_amount, currency, notes, billing_address, quotation_work_address_id, state, created_at, updated_at, created_by, description`,
      [quotationNumber, customerId, jobId, quotationDate, validUntil, subtotal, taxAmount, totalAmount, currency, notes, billingAddress, quotationWorkAddressId, userId, description],
    );
    const q = qResult.rows[0];
    const qId = q.id;

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      const price = typeof item.unit_price === 'number' ? item.unit_price : 0;
      const amount = qty * price;
      await pool.query(
        'INSERT INTO quotation_line_items (quotation_id, description, quantity, unit_price, amount, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
        [qId, item.description || 'Item', qty, price, amount, i],
      );
    }

    await logQuotationActivity(qId, 'created', { quotation_number: quotationNumber }, userId);

    return res.status(201).json({
      quotation: {
        id: q.id,
        quotation_number: q.quotation_number,
        customer_id: q.customer_id,
        job_id: q.job_id ?? null,
        quotation_date: (q.quotation_date as Date).toISOString().slice(0, 10),
        valid_until: (q.valid_until as Date).toISOString().slice(0, 10),
        subtotal: parseFloat(q.subtotal),
        tax_amount: parseFloat(q.tax_amount),
        total_amount: parseFloat(q.total_amount),
        currency: q.currency,
        notes: q.notes,
        description: q.description,
        state: q.state,
        created_at: (q.created_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Create quotation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/quotations/:id', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const qCheck = await pool.query<DbQuotation>('SELECT * FROM quotations WHERE id = $1', [id]);
  if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
  const q = qCheck.rows[0];
  if (!canAccessQuotation(q, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });
  if (q.state !== 'draft' && q.state !== 'sent') return res.status(400).json({ message: 'Cannot edit quotation in this state' });

  const body = req.body as Record<string, unknown>;
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : undefined);
  let effectiveCustomerId = q.customer_id;
  if (body.customer_id !== undefined && Number.isFinite(body.customer_id)) {
    const custCheck = await pool.query('SELECT id FROM customers WHERE id = $1' + (isSuperAdmin ? '' : ' AND created_by = $2'), isSuperAdmin ? [body.customer_id] : [body.customer_id, userId]);
    if ((custCheck.rowCount ?? 0) > 0) {
      updates.push(`customer_id = $${idx++}`);
      values.push(body.customer_id);
      effectiveCustomerId = body.customer_id as number;
    }
  }
  const customerChanged = effectiveCustomerId !== q.customer_id;

  let workAddressFieldsHandled = false;
  if (body.quotation_work_address_id !== undefined) {
    const parsedWa = parseQuotationWorkAddressIdInput(body.quotation_work_address_id);
    if (parsedWa === null) {
      updates.push(`quotation_work_address_id = $${idx++}`);
      values.push(null);
      updates.push(`billing_address = $${idx++}`);
      values.push(str('billing_address') !== undefined ? str('billing_address') : null);
      workAddressFieldsHandled = true;
    } else if (parsedWa !== undefined) {
      try {
        const resolved = await resolveInvoiceBillingFromWorkAddress(effectiveCustomerId, parsedWa);
        updates.push(`quotation_work_address_id = $${idx++}`);
        values.push(resolved.invoice_work_address_id);
        updates.push(`billing_address = $${idx++}`);
        values.push(resolved.billing_address);
        workAddressFieldsHandled = true;
      } catch (e) {
        if ((e as Error).message === 'INVALID_WORK_ADDRESS') {
          return res.status(400).json({ message: 'Invalid work address for this customer' });
        }
        throw e;
      }
    } else {
      return res.status(400).json({ message: 'Invalid quotation_work_address_id' });
    }
  } else if (customerChanged && q.quotation_work_address_id) {
    updates.push(`quotation_work_address_id = $${idx++}`);
    values.push(null);
  }

  const workSiteLocked =
    !!(q.quotation_work_address_id && !customerChanged && effectiveCustomerId === q.customer_id);
  if (body.job_id !== undefined) {
    const jid = body.job_id === null ? null : (Number.isFinite(body.job_id) ? body.job_id : parseInt(String(body.job_id), 10));
    if (jid === null || Number.isFinite(jid)) { updates.push(`job_id = $${idx++}`); values.push(jid); }
  }
  if (body.quotation_date) { updates.push(`quotation_date = $${idx++}`); values.push(new Date(body.quotation_date as string)); }
  if (body.valid_until) { updates.push(`valid_until = $${idx++}`); values.push(new Date(body.valid_until as string)); }
  if (str('currency') !== undefined) { updates.push(`currency = $${idx++}`); values.push(str('currency')); }
  if (str('notes') !== undefined) { updates.push(`notes = $${idx++}`); values.push(str('notes')); }
  if (!workAddressFieldsHandled && !workSiteLocked && str('billing_address') !== undefined) {
    updates.push(`billing_address = $${idx++}`);
    values.push(str('billing_address'));
  }
  if (str('description') !== undefined) { updates.push(`description = $${idx++}`); values.push(str('description')); }
  if (body.state && QUOTATION_STATES.includes(body.state as typeof QUOTATION_STATES[number])) {
    updates.push(`state = $${idx++}`);
    values.push(body.state);
  }
  if (Array.isArray(body.line_items)) {
    await pool.query('DELETE FROM quotation_line_items WHERE quotation_id = $1', [id]);
    let subtotal = 0;
    for (let i = 0; i < body.line_items.length; i++) {
      const item = body.line_items[i] as { description?: string; quantity?: number; unit_price?: number };
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      const price = typeof item.unit_price === 'number' ? item.unit_price : 0;
      const amount = qty * price;
      subtotal += amount;
      await pool.query(
        'INSERT INTO quotation_line_items (quotation_id, description, quantity, unit_price, amount, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, item.description || 'Item', qty, price, amount, i],
      );
    }
    const prevSubtotal = parseFloat(q.subtotal);
    const prevTaxAmount = parseFloat(q.tax_amount);
    const taxPercentage = typeof body.tax_percentage === 'number' ? Math.max(0, Math.min(100, body.tax_percentage)) : (prevSubtotal > 0 ? (prevTaxAmount / prevSubtotal) * 100 : 0);
    const taxAmount = Math.round(subtotal * (taxPercentage / 100) * 100) / 100;
    const totalAmount = subtotal + taxAmount;
    updates.push(`subtotal = $${idx++}`);
    values.push(subtotal);
    updates.push(`tax_amount = $${idx++}`);
    values.push(taxAmount);
    updates.push(`total_amount = $${idx++}`);
    values.push(totalAmount);
  } else if (typeof body.tax_percentage === 'number') {
    const subtotal = parseFloat(q.subtotal);
    const taxPct = Math.max(0, Math.min(100, body.tax_percentage));
    const taxAmount = Math.round(subtotal * (taxPct / 100) * 100) / 100;
    const totalAmount = subtotal + taxAmount;
    updates.push(`tax_amount = $${idx++}`);
    values.push(taxAmount);
    updates.push(`total_amount = $${idx++}`);
    values.push(totalAmount);
  }

  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(id);

  try {
    const result = await pool.query<DbQuotation>(
      `UPDATE quotations SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    const r = result.rows[0];
    await logQuotationActivity(id, 'updated', {}, userId);
    return res.json({
      quotation: {
        id: r.id,
        quotation_number: r.quotation_number,
        customer_id: r.customer_id,
        job_id: r.job_id ?? null,
        quotation_date: (r.quotation_date as Date).toISOString().slice(0, 10),
        valid_until: (r.valid_until as Date).toISOString().slice(0, 10),
        subtotal: parseFloat(r.subtotal),
        tax_amount: parseFloat(r.tax_amount),
        total_amount: parseFloat(r.total_amount),
        currency: r.currency,
        state: r.state,
        updated_at: (r.updated_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Update quotation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/quotations/:id/send', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const qCheck = await pool.query<
    DbQuotation & {
      customer_email?: string | null;
      customer_full_name?: string | null;
      cust_addr_line_1?: string | null;
      cust_addr_line_2?: string | null;
      cust_addr_line_3?: string | null;
      cust_town?: string | null;
      cust_county?: string | null;
      cust_postcode?: string | null;
    }
  >(
    `SELECT q.*, c.email AS customer_email, c.full_name AS customer_full_name,
            c.address_line_1 AS cust_addr_line_1, c.address_line_2 AS cust_addr_line_2, c.address_line_3 AS cust_addr_line_3,
            c.town AS cust_town, c.county AS cust_county, c.postcode AS cust_postcode
     FROM quotations q JOIN customers c ON c.id = q.customer_id WHERE q.id = $1`,
    [id],
  );
  if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
  const q = qCheck.rows[0];
  if (!canAccessQuotation(q, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });
  if (q.state !== 'draft') return res.status(400).json({ message: 'Only draft quotations can be sent' });

  try {
    const emailCfg = await loadEmailSettingsPayload(userId);
    const canSendMail = emailCfg.oauth_provider || (emailCfg.smtp_enabled && createMailTransport(emailCfg));
    if (!canSendMail) {
      return res.status(400).json({
        message: 'Configure Email Settings before sending.',
      });
    }
    if (!emailCfg.from_email?.trim()) {
      return res.status(400).json({ message: 'Set From email in Settings → Email.' });
    }
    if (!q.customer_email?.trim()) {
      return res.status(400).json({ message: 'Customer has no email address.' });
    }

    await pool.query("UPDATE quotations SET state = 'sent', updated_at = NOW() WHERE id = $1", [id]);
    await ensureDefaultEmailTemplates(userId);
    const qSettings = await getQuotationSettings(userId);
    const tpl = await pool.query<{ subject: string; body_html: string }>(
      `SELECT subject, body_html FROM email_templates WHERE created_by = $1 AND template_key = 'quotation'`,
      [userId],
    );
    const row = tpl.rows[0];
    if (!row) {
      return res.status(500).json({ message: 'Quotation email template missing' });
    }
    const vars = await buildQuotationEmailTemplateVars(q, qSettings);
    const subject = applyTemplateVars(row.subject, vars);
    const bodyInner = applyTemplateVars(row.body_html, vars);
    const html = wrapEmailHtml(bodyInner, emailCfg.default_signature_html);
    const from = formatFromHeader(emailCfg.from_name, emailCfg.from_email);
    await sendUserEmail(pool, userId, emailCfg, {
      from,
      to: q.customer_email.trim(),
      subject,
      html,
      replyTo: emailCfg.reply_to,
    });
    await logQuotationActivity(
      id,
      'sent_to_client',
      {
        channel: 'email',
        subject,
        to_email: q.customer_email,
        sent_via: 'smtp',
      },
      userId,
    );
    return res.json({ success: true, state: 'sent', message: 'Quotation sent by email.' });
  } catch (error) {
    console.error('Send quotation error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ message: msg });
  }
});

app.post('/api/quotations/:id/accept', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const qCheck = await pool.query<DbQuotation>('SELECT * FROM quotations WHERE id = $1', [id]);
  if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
  const q = qCheck.rows[0];
  if (!canAccessQuotation(q, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });
  if (q.state !== 'sent') return res.status(400).json({ message: 'Only sent quotations can be accepted' });

  try {
    await pool.query("UPDATE quotations SET state = 'accepted', updated_at = NOW() WHERE id = $1", [id]);
    await logQuotationActivity(id, 'accepted', {}, userId);
    return res.json({ success: true, state: 'accepted' });
  } catch (error) {
    console.error('Accept quotation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/quotations/:id/reject', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const qCheck = await pool.query<DbQuotation>('SELECT * FROM quotations WHERE id = $1', [id]);
  if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
  const q = qCheck.rows[0];
  if (!canAccessQuotation(q, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });
  if (q.state !== 'sent') return res.status(400).json({ message: 'Only sent quotations can be rejected' });

  try {
    await pool.query("UPDATE quotations SET state = 'rejected', updated_at = NOW() WHERE id = $1", [id]);
    await logQuotationActivity(id, 'rejected', {}, userId);
    return res.json({ success: true, state: 'rejected' });
  } catch (error) {
    console.error('Reject quotation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/quotations/:id/transfer-to-invoice', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const quotationId = parseInt(String(idParam), 10);
  if (!Number.isFinite(quotationId)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const qCheck = await pool.query<DbQuotation>('SELECT * FROM quotations WHERE id = $1', [quotationId]);
  if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
  const q = qCheck.rows[0];
  if (!canAccessQuotation(q, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });
  if (q.state !== 'accepted') return res.status(400).json({ message: 'Only accepted quotations can be transferred to invoice' });

  try {
    const invSettings = await getInvoiceSettings(userId);
    const invoiceDate = new Date();
    const dueDate = new Date(invoiceDate.getTime() + invSettings.default_due_days * 24 * 60 * 60 * 1000);
    const invoiceNumber = await generateInvoiceNumber(invSettings.invoice_prefix);
    const subtotal = parseFloat(q.subtotal);
    const taxAmount = parseFloat(q.tax_amount);
    const totalAmount = parseFloat(q.total_amount);

    const publicToken = crypto.randomBytes(32).toString('hex');
    const invResult = await pool.query<DbInvoice>(
      `INSERT INTO invoices (invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, total_paid, currency, notes, description, billing_address, invoice_work_address_id, customer_reference, state, created_by, public_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13, NULL, 'draft', $14, $15)
       RETURNING id, invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, total_paid, currency, notes, description, billing_address, invoice_work_address_id, customer_reference, state, created_at, updated_at, created_by`,
      [invoiceNumber, q.customer_id, q.job_id, invoiceDate, dueDate, subtotal, taxAmount, totalAmount, q.currency, q.notes, q.description, q.billing_address, q.quotation_work_address_id ?? null, userId, publicToken],
    );
    const inv = invResult.rows[0];
    const invId = inv.id;

    const lineItems = await pool.query(
      'SELECT description, quantity, unit_price, amount, sort_order FROM quotation_line_items WHERE quotation_id = $1 ORDER BY sort_order ASC, id ASC',
      [quotationId],
    );
    for (let i = 0; i < lineItems.rows.length; i++) {
      const item = lineItems.rows[i] as { description: string; quantity: string; unit_price: string; amount: string; sort_order: number };
      await pool.query(
        'INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, amount, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
        [invId, item.description, parseFloat(item.quantity), parseFloat(item.unit_price), parseFloat(item.amount), item.sort_order],
      );
    }

    await logInvoiceActivity(invId, 'created', { invoice_number: invoiceNumber, from_quotation_id: quotationId }, userId);
    await logQuotationActivity(quotationId, 'transferred_to_invoice', { invoice_id: invId, invoice_number: invoiceNumber }, userId);

    return res.status(201).json({
      invoice: {
        id: inv.id,
        invoice_number: inv.invoice_number,
        customer_id: inv.customer_id,
        job_id: inv.job_id ?? null,
        invoice_date: formatInvoiceDateFromDb(inv.invoice_date),
        due_date: formatInvoiceDateFromDb(inv.due_date),
        subtotal: parseFloat(inv.subtotal),
        tax_amount: parseFloat(inv.tax_amount),
        total_amount: parseFloat(inv.total_amount),
        total_paid: parseFloat(inv.total_paid),
        currency: inv.currency,
        state: inv.state,
        created_at: (inv.created_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Transfer quotation to invoice error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Link an accepted quotation to a job after the job is created from the dashboard (PATCH quotation disallows accepted edits). */
app.post('/api/quotations/:id/link-job', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const quotationId = parseInt(String(idParam), 10);
  if (!Number.isFinite(quotationId)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const body = req.body as { job_id?: unknown };
  const jobIdRaw = body.job_id;
  const jobId =
    typeof jobIdRaw === 'number' && Number.isFinite(jobIdRaw)
      ? Math.trunc(jobIdRaw)
      : typeof jobIdRaw === 'string' && String(jobIdRaw).trim()
        ? parseInt(String(jobIdRaw).trim(), 10)
        : NaN;
  if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'job_id is required' });

  const qCheck = await pool.query<DbQuotation>('SELECT * FROM quotations WHERE id = $1', [quotationId]);
  if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
  const q = qCheck.rows[0];
  if (!canAccessQuotation(q, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });
  if (q.state !== 'accepted') {
    return res.status(400).json({ message: 'Only accepted quotations can be linked to a job' });
  }

  const jobRow = await pool.query<{ customer_id: number }>('SELECT customer_id FROM jobs WHERE id = $1', [jobId]);
  if ((jobRow.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
  if (jobRow.rows[0].customer_id !== q.customer_id) {
    return res.status(400).json({ message: 'Job must belong to the same customer as the quotation' });
  }

  if (q.job_id != null && q.job_id !== jobId) {
    const ex = await pool.query('SELECT id FROM jobs WHERE id = $1 AND customer_id = $2', [q.job_id, q.customer_id]);
    if ((ex.rowCount ?? 0) > 0) {
      return res.status(400).json({ message: 'This quotation is already linked to a different job' });
    }
  }

  await pool.query('UPDATE quotations SET job_id = $1, updated_at = NOW() WHERE id = $2', [jobId, quotationId]);
  await logQuotationActivity(quotationId, 'linked_job', { job_id: jobId, quotation_number: q.quotation_number }, userId);
  return res.json({ success: true, quotation_id: quotationId, job_id: jobId });
});

app.delete('/api/quotations/:id', authenticate, requireTenantCrmAccess('quotations'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const qCheck = await pool.query<DbQuotation>('SELECT * FROM quotations WHERE id = $1', [id]);
  if ((qCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
  const q = qCheck.rows[0];
  if (!canAccessQuotation(q, userId, isSuperAdmin)) return res.status(404).json({ message: 'Quotation not found' });
  if (q.state === 'accepted') return res.status(400).json({ message: 'Cannot delete accepted quotation' });

  try {
    await pool.query('DELETE FROM quotations WHERE id = $1', [id]);
    return res.status(204).send();
  } catch (error) {
    console.error('Delete quotation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Quotation Settings (Admin only) ----------
app.get('/api/settings/quotation', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  try {
    const settings = await getQuotationSettings(userId);
    return res.json({ settings });
  } catch (error) {
    console.error('Get quotation settings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/settings/quotation', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const body = req.body as Record<string, unknown>;
  const defaultCurrency = typeof body.default_currency === 'string' ? body.default_currency.trim() || 'USD' : undefined;
  const quotationPrefix = typeof body.quotation_prefix === 'string' ? body.quotation_prefix.trim().replace(/[^A-Za-z0-9_-]/g, '') || 'QUOT' : undefined;
  const termsAndConditions = typeof body.terms_and_conditions === 'string' ? body.terms_and_conditions.trim() || null : undefined;
  const defaultValidDays = typeof body.default_valid_days === 'number' ? Math.max(1, Math.min(365, body.default_valid_days)) : undefined;
  const companyName = typeof body.company_name === 'string' ? body.company_name.trim() || null : undefined;
  const companyAddress = typeof body.company_address === 'string' ? body.company_address.trim() || null : undefined;
  const companyPhone = typeof body.company_phone === 'string' ? body.company_phone.trim() || null : undefined;
  const companyEmail = typeof body.company_email === 'string' ? body.company_email.trim() || null : undefined;
  const companyLogo = typeof body.company_logo === 'string' ? (body.company_logo.trim() || null) : undefined;
  const companyWebsite = typeof body.company_website === 'string' ? body.company_website.trim() || null : undefined;
  const companyTaxId = typeof body.company_tax_id === 'string' ? body.company_tax_id.trim() || null : undefined;
  const taxLabel = typeof body.tax_label === 'string' ? body.tax_label.trim() || 'Tax' : undefined;
  const defaultTaxPercentage = typeof body.default_tax_percentage === 'number' ? Math.max(0, Math.min(100, body.default_tax_percentage)) : undefined;
  const footerText = typeof body.footer_text === 'string' ? body.footer_text.trim() || null : undefined;
  const paymentTerms = typeof body.payment_terms === 'string' ? body.payment_terms.trim() || null : undefined;
  const bankDetails = typeof body.bank_details === 'string' ? body.bank_details.trim() || null : undefined;
  const quotationAccentColor =
    typeof body.quotation_accent_color === 'string' ? parseSafeHexColor(body.quotation_accent_color, '#14B8A6') : undefined;
  const quotationAccentEndColor =
    typeof body.quotation_accent_end_color === 'string' ? parseSafeHexColor(body.quotation_accent_end_color, '#0d9488') : undefined;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (defaultCurrency !== undefined) { updates.push(`default_currency = $${idx++}`); values.push(defaultCurrency); }
  if (quotationPrefix !== undefined) { updates.push(`quotation_prefix = $${idx++}`); values.push(quotationPrefix); }
  if (termsAndConditions !== undefined) { updates.push(`terms_and_conditions = $${idx++}`); values.push(termsAndConditions); }
  if (defaultValidDays !== undefined) { updates.push(`default_valid_days = $${idx++}`); values.push(defaultValidDays); }
  if (companyName !== undefined) { updates.push(`company_name = $${idx++}`); values.push(companyName); }
  if (companyAddress !== undefined) { updates.push(`company_address = $${idx++}`); values.push(companyAddress); }
  if (companyPhone !== undefined) { updates.push(`company_phone = $${idx++}`); values.push(companyPhone); }
  if (companyEmail !== undefined) { updates.push(`company_email = $${idx++}`); values.push(companyEmail); }
  if (companyLogo !== undefined) { updates.push(`company_logo = $${idx++}`); values.push(companyLogo); }
  if (companyWebsite !== undefined) { updates.push(`company_website = $${idx++}`); values.push(companyWebsite); }
  if (companyTaxId !== undefined) { updates.push(`company_tax_id = $${idx++}`); values.push(companyTaxId); }
  if (taxLabel !== undefined) { updates.push(`tax_label = $${idx++}`); values.push(taxLabel); }
  if (defaultTaxPercentage !== undefined) { updates.push(`default_tax_percentage = $${idx++}`); values.push(defaultTaxPercentage); }
  if (footerText !== undefined) { updates.push(`footer_text = $${idx++}`); values.push(footerText); }
  if (paymentTerms !== undefined) { updates.push(`payment_terms = $${idx++}`); values.push(paymentTerms); }
  if (bankDetails !== undefined) { updates.push(`bank_details = $${idx++}`); values.push(bankDetails); }
  if (quotationAccentColor !== undefined) { updates.push(`quotation_accent_color = $${idx++}`); values.push(quotationAccentColor); }
  if (quotationAccentEndColor !== undefined) { updates.push(`quotation_accent_end_color = $${idx++}`); values.push(quotationAccentEndColor); }

  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(userId);

  try {
    const existing = await pool.query('SELECT id FROM quotation_settings WHERE created_by = $1', [userId]);
    if ((existing.rowCount ?? 0) > 0) {
      await pool.query(
        `UPDATE quotation_settings SET ${updates.join(', ')} WHERE created_by = $${idx}`,
        values,
      );
    } else {
      const def = await getQuotationSettings(userId);
      const merged = {
        default_currency: defaultCurrency ?? def.default_currency,
        quotation_prefix: quotationPrefix ?? def.quotation_prefix,
        terms_and_conditions: termsAndConditions !== undefined ? termsAndConditions : def.terms_and_conditions,
        default_valid_days: defaultValidDays ?? def.default_valid_days,
        company_name: companyName ?? def.company_name,
        company_address: companyAddress !== undefined ? companyAddress : def.company_address,
        company_phone: companyPhone !== undefined ? companyPhone : def.company_phone,
        company_email: companyEmail !== undefined ? companyEmail : def.company_email,
        company_logo: companyLogo !== undefined ? companyLogo : def.company_logo,
        company_website: companyWebsite !== undefined ? companyWebsite : def.company_website,
        company_tax_id: companyTaxId !== undefined ? companyTaxId : def.company_tax_id,
        tax_label: taxLabel ?? def.tax_label,
        default_tax_percentage: defaultTaxPercentage ?? def.default_tax_percentage,
        footer_text: footerText !== undefined ? footerText : def.footer_text,
        payment_terms: paymentTerms !== undefined ? paymentTerms : def.payment_terms,
        bank_details: bankDetails !== undefined ? bankDetails : def.bank_details,
        quotation_accent_color: quotationAccentColor !== undefined ? quotationAccentColor : def.quotation_accent_color,
        quotation_accent_end_color: quotationAccentEndColor !== undefined ? quotationAccentEndColor : def.quotation_accent_end_color,
      };
      await pool.query(
        `INSERT INTO quotation_settings (created_by, default_currency, quotation_prefix, terms_and_conditions, default_valid_days, company_name, company_address, company_phone, company_email, company_logo, company_website, company_tax_id, tax_label, default_tax_percentage, footer_text, payment_terms, bank_details, quotation_accent_color, quotation_accent_end_color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (created_by) DO UPDATE SET default_currency = EXCLUDED.default_currency, quotation_prefix = EXCLUDED.quotation_prefix, terms_and_conditions = EXCLUDED.terms_and_conditions, default_valid_days = EXCLUDED.default_valid_days, company_name = EXCLUDED.company_name, company_address = EXCLUDED.company_address, company_phone = EXCLUDED.company_phone, company_email = EXCLUDED.company_email, company_logo = EXCLUDED.company_logo, company_website = EXCLUDED.company_website, company_tax_id = EXCLUDED.company_tax_id, tax_label = EXCLUDED.tax_label, default_tax_percentage = EXCLUDED.default_tax_percentage, footer_text = EXCLUDED.footer_text, payment_terms = EXCLUDED.payment_terms, bank_details = EXCLUDED.bank_details, quotation_accent_color = EXCLUDED.quotation_accent_color, quotation_accent_end_color = EXCLUDED.quotation_accent_end_color, updated_at = NOW()`,
        [
          userId,
          merged.default_currency,
          merged.quotation_prefix,
          merged.terms_and_conditions,
          merged.default_valid_days,
          merged.company_name,
          merged.company_address,
          merged.company_phone,
          merged.company_email,
          merged.company_logo,
          merged.company_website,
          merged.company_tax_id,
          merged.tax_label,
          merged.default_tax_percentage,
          merged.footer_text,
          merged.payment_terms,
          merged.bank_details,
          merged.quotation_accent_color,
          merged.quotation_accent_end_color,
        ],
      );
    }
    const settings = await getQuotationSettings(userId);
    return res.json({ settings });
  } catch (error) {
    console.error('Update quotation settings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Invoice Settings (Admin only) ----------
app.get('/api/settings/invoice', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  try {
    const settings = await getInvoiceSettings(userId);
    return res.json({ settings });
  } catch (error) {
    console.error('Get invoice settings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/settings/invoice', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const body = req.body as Record<string, unknown>;
  const defaultCurrency = typeof body.default_currency === 'string' ? body.default_currency.trim() || 'USD' : undefined;
  const invoicePrefix = typeof body.invoice_prefix === 'string' ? body.invoice_prefix.trim().replace(/[^A-Za-z0-9_-]/g, '') || 'INV' : undefined;
  const termsAndConditions = typeof body.terms_and_conditions === 'string' ? body.terms_and_conditions.trim() || null : undefined;
  const defaultDueDays = typeof body.default_due_days === 'number' ? Math.max(1, Math.min(365, body.default_due_days)) : undefined;
  const companyName = typeof body.company_name === 'string' ? body.company_name.trim() || null : undefined;
  const companyAddress = typeof body.company_address === 'string' ? body.company_address.trim() || null : undefined;
  const companyPhone = typeof body.company_phone === 'string' ? body.company_phone.trim() || null : undefined;
  const companyEmail = typeof body.company_email === 'string' ? body.company_email.trim() || null : undefined;
  const companyLogo = typeof body.company_logo === 'string' ? (body.company_logo.trim() || null) : undefined;
  const companyWebsite = typeof body.company_website === 'string' ? body.company_website.trim() || null : undefined;
  const companyTaxId = typeof body.company_tax_id === 'string' ? body.company_tax_id.trim() || null : undefined;
  const taxLabel = typeof body.tax_label === 'string' ? body.tax_label.trim() || 'Tax' : undefined;
  const defaultTaxPercentage = typeof body.default_tax_percentage === 'number'
    ? Math.max(0, Math.min(100, body.default_tax_percentage))
    : undefined;
  const footerText = typeof body.footer_text === 'string' ? body.footer_text.trim() || null : undefined;
  const paymentTerms = typeof body.payment_terms === 'string' ? body.payment_terms.trim() || null : undefined;
  const bankDetails = typeof body.bank_details === 'string' ? body.bank_details.trim() || null : undefined;
  const invoiceAccentColor =
    typeof body.invoice_accent_color === 'string' ? parseSafeHexColor(body.invoice_accent_color, '#14B8A6') : undefined;
  const invoiceAccentEndColor =
    typeof body.invoice_accent_end_color === 'string' ? parseSafeHexColor(body.invoice_accent_end_color, '#0d9488') : undefined;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (defaultCurrency !== undefined) { updates.push(`default_currency = $${idx++}`); values.push(defaultCurrency); }
  if (invoicePrefix !== undefined) { updates.push(`invoice_prefix = $${idx++}`); values.push(invoicePrefix); }
  if (termsAndConditions !== undefined) { updates.push(`terms_and_conditions = $${idx++}`); values.push(termsAndConditions); }
  if (defaultDueDays !== undefined) { updates.push(`default_due_days = $${idx++}`); values.push(defaultDueDays); }
  if (companyName !== undefined) { updates.push(`company_name = $${idx++}`); values.push(companyName); }
  if (companyAddress !== undefined) { updates.push(`company_address = $${idx++}`); values.push(companyAddress); }
  if (companyPhone !== undefined) { updates.push(`company_phone = $${idx++}`); values.push(companyPhone); }
  if (companyEmail !== undefined) { updates.push(`company_email = $${idx++}`); values.push(companyEmail); }
  if (companyLogo !== undefined) { updates.push(`company_logo = $${idx++}`); values.push(companyLogo); }
  if (companyWebsite !== undefined) { updates.push(`company_website = $${idx++}`); values.push(companyWebsite); }
  if (companyTaxId !== undefined) { updates.push(`company_tax_id = $${idx++}`); values.push(companyTaxId); }
  if (taxLabel !== undefined) { updates.push(`tax_label = $${idx++}`); values.push(taxLabel); }
  if (defaultTaxPercentage !== undefined) { updates.push(`default_tax_percentage = $${idx++}`); values.push(defaultTaxPercentage); }
  if (footerText !== undefined) { updates.push(`footer_text = $${idx++}`); values.push(footerText); }
  if (paymentTerms !== undefined) { updates.push(`payment_terms = $${idx++}`); values.push(paymentTerms); }
  if (bankDetails !== undefined) { updates.push(`bank_details = $${idx++}`); values.push(bankDetails); }
  if (invoiceAccentColor !== undefined) { updates.push(`invoice_accent_color = $${idx++}`); values.push(invoiceAccentColor); }
  if (invoiceAccentEndColor !== undefined) { updates.push(`invoice_accent_end_color = $${idx++}`); values.push(invoiceAccentEndColor); }

  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(userId);

  try {
    const existing = await pool.query('SELECT id FROM invoice_settings WHERE created_by = $1', [userId]);
    if ((existing.rowCount ?? 0) > 0) {
      await pool.query(
        `UPDATE invoice_settings SET ${updates.join(', ')} WHERE created_by = $${idx}`,
        values,
      );
    } else {
      const def = await getInvoiceSettings(userId);
      const merged = {
        default_currency: defaultCurrency ?? def.default_currency,
        invoice_prefix: invoicePrefix ?? def.invoice_prefix,
        terms_and_conditions: termsAndConditions !== undefined ? termsAndConditions : def.terms_and_conditions,
        default_due_days: defaultDueDays ?? def.default_due_days,
        company_name: companyName ?? def.company_name,
        company_address: companyAddress !== undefined ? companyAddress : def.company_address,
        company_phone: companyPhone !== undefined ? companyPhone : def.company_phone,
        company_email: companyEmail !== undefined ? companyEmail : def.company_email,
        company_logo: companyLogo !== undefined ? companyLogo : def.company_logo,
        company_website: companyWebsite !== undefined ? companyWebsite : def.company_website,
        company_tax_id: companyTaxId !== undefined ? companyTaxId : def.company_tax_id,
        tax_label: taxLabel ?? def.tax_label,
        default_tax_percentage: defaultTaxPercentage ?? def.default_tax_percentage,
        footer_text: footerText !== undefined ? footerText : def.footer_text,
        payment_terms: paymentTerms !== undefined ? paymentTerms : def.payment_terms,
        bank_details: bankDetails !== undefined ? bankDetails : def.bank_details,
        invoice_accent_color: invoiceAccentColor ?? def.invoice_accent_color,
        invoice_accent_end_color: invoiceAccentEndColor ?? def.invoice_accent_end_color,
      };
      await pool.query(
        `INSERT INTO invoice_settings (created_by, default_currency, invoice_prefix, terms_and_conditions, default_due_days, company_name, company_address, company_phone, company_email, company_logo, company_website, company_tax_id, tax_label, default_tax_percentage, footer_text, payment_terms, bank_details, invoice_accent_color, invoice_accent_end_color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (created_by) DO UPDATE SET default_currency = EXCLUDED.default_currency, invoice_prefix = EXCLUDED.invoice_prefix, terms_and_conditions = EXCLUDED.terms_and_conditions, default_due_days = EXCLUDED.default_due_days, company_name = EXCLUDED.company_name, company_address = EXCLUDED.company_address, company_phone = EXCLUDED.company_phone, company_email = EXCLUDED.company_email, company_logo = EXCLUDED.company_logo, company_website = EXCLUDED.company_website, company_tax_id = EXCLUDED.company_tax_id, tax_label = EXCLUDED.tax_label, default_tax_percentage = EXCLUDED.default_tax_percentage, footer_text = EXCLUDED.footer_text, payment_terms = EXCLUDED.payment_terms, bank_details = EXCLUDED.bank_details, invoice_accent_color = EXCLUDED.invoice_accent_color, invoice_accent_end_color = EXCLUDED.invoice_accent_end_color, updated_at = NOW()`,
        [userId, merged.default_currency, merged.invoice_prefix, merged.terms_and_conditions, merged.default_due_days, merged.company_name, merged.company_address, merged.company_phone, merged.company_email, merged.company_logo, merged.company_website, merged.company_tax_id, merged.tax_label, merged.default_tax_percentage, merged.footer_text, merged.payment_terms, merged.bank_details, merged.invoice_accent_color, merged.invoice_accent_end_color],
      );
    }
    const settings = await getInvoiceSettings(userId);
    return res.json({ settings });
  } catch (error) {
    console.error('Update invoice settings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Email / SMTP settings & templates ----------
app.get('/api/settings/email', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  try {
    const s = await loadEmailSettingsPayload(userId);
    const { smtp_password: _pw, oauth_access_token, oauth_refresh_token, oauth_expiry, ...rest } = s;
    return res.json({
      settings: {
        ...rest,
        smtp_password: undefined,
        smtp_password_set: s.smtp_password_set,
        oauth_connected: !!oauth_access_token,
      },
    });
  } catch (error) {
    console.error('Get email settings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/settings/email', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const body = req.body as Record<string, unknown>;
  try {
    const cur = await loadEmailSettingsPayload(userId);
    const smtpEnabled = typeof body.smtp_enabled === 'boolean' ? body.smtp_enabled : cur.smtp_enabled;
    const smtpHost = typeof body.smtp_host === 'string' ? body.smtp_host.trim() || null : cur.smtp_host;
    const smtpPort =
      typeof body.smtp_port === 'number'
        ? Math.max(1, Math.min(65535, Math.floor(body.smtp_port)))
        : cur.smtp_port ?? 587;
    const smtpSecure = typeof body.smtp_secure === 'boolean' ? body.smtp_secure : cur.smtp_secure;
    const smtpUser = typeof body.smtp_user === 'string' ? body.smtp_user.trim() || null : cur.smtp_user;
    let smtpPassword = cur.smtp_password;
    if (typeof body.smtp_password === 'string' && body.smtp_password.length > 0) {
      smtpPassword = body.smtp_password;
    }
    const smtpReject =
      typeof body.smtp_reject_unauthorized === 'boolean' ? body.smtp_reject_unauthorized : cur.smtp_reject_unauthorized;
    const fromName = typeof body.from_name === 'string' ? body.from_name.trim() || null : cur.from_name;
    const fromEmail = typeof body.from_email === 'string' ? body.from_email.trim() || null : cur.from_email;
    const replyTo = typeof body.reply_to === 'string' ? body.reply_to.trim() || null : cur.reply_to;
    const defaultSig =
      typeof body.default_signature_html === 'string'
        ? body.default_signature_html.trim() || null
        : cur.default_signature_html;

    await pool.query(
      `INSERT INTO email_settings (
        created_by, smtp_enabled, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password,
        smtp_reject_unauthorized, from_name, from_email, reply_to, default_signature_html, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (created_by) DO UPDATE SET
        smtp_enabled = EXCLUDED.smtp_enabled,
        smtp_host = EXCLUDED.smtp_host,
        smtp_port = EXCLUDED.smtp_port,
        smtp_secure = EXCLUDED.smtp_secure,
        smtp_user = EXCLUDED.smtp_user,
        smtp_password = EXCLUDED.smtp_password,
        smtp_reject_unauthorized = EXCLUDED.smtp_reject_unauthorized,
        from_name = EXCLUDED.from_name,
        from_email = EXCLUDED.from_email,
        reply_to = EXCLUDED.reply_to,
        default_signature_html = EXCLUDED.default_signature_html,
        updated_at = NOW()`,
      [
        userId,
        smtpEnabled,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
        smtpPassword,
        smtpReject,
        fromName,
        fromEmail,
        replyTo,
        defaultSig,
      ],
    );

    const s = await loadEmailSettingsPayload(userId);
    const { smtp_password: _p, ...rest } = s;
    return res.json({
      settings: {
        ...rest,
        smtp_password: undefined,
        smtp_password_set: s.smtp_password_set,
      },
    });
  } catch (error) {
    console.error('Patch email settings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/email/test', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const body = req.body as { to?: string };
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!to) return res.status(400).json({ message: 'Recipient email (to) is required' });
  try {
    const s = await loadEmailSettingsPayload(userId);
    const canSendMail = s.oauth_provider || (s.smtp_enabled && createMailTransport(s));
    if (!canSendMail) {
      return res.status(400).json({ message: 'Configure Email Settings before sending a test email.' });
    }
    const from = formatFromHeader(s.from_name, s.from_email);
    if (!from || !s.from_email?.trim()) {
      return res.status(400).json({ message: 'Set From name and From email before sending.' });
    }
    const html = wrapEmailHtml(
      '<p>This is a test message from WorkPilot.</p><p>If you received this, your email settings are working.</p>',
      s.default_signature_html,
    );
    await sendUserEmail(pool, userId, s, {
      from,
      to,
      subject: 'WorkPilot - Email test',
      html,
      replyTo: s.reply_to,
    });
    return res.json({ success: true, message: 'Test email sent.' });
  } catch (error) {
    console.error('Email test error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to send test email';
    return res.status(500).json({ message: msg });
  }
});

// ---------- OAuth Email Auth flow ----------

app.get('/api/auth/google/url', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const url = await getGoogleAuthUrl();
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/auth/microsoft/url', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const url = await getMicrosoftAuthUrl();
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string; // Ideally you'd use state to verify the user
  // In our case we'll handle setting the tokens in a redirect or via a separate flow.
  // We'll provide a response that can be handled by the frontend.
  res.send(`<html><body><script>window.opener.postMessage({ type: 'GOOGLE_AUTH_CODE', code: '${code}' }, '*'); window.close();</script></body></html>`);
});

app.get('/api/auth/microsoft/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  res.send(`<html><body><script>window.opener.postMessage({ type: 'MS_AUTH_CODE', code: '${code}' }, '*'); window.close();</script></body></html>`);
});

app.post('/api/settings/email/oauth/exchange', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const { code, provider } = req.body as { code: string; provider: 'google' | 'microsoft' };
  const userId = getTenantScopeUserId(req.user!);
  if (!code || !provider) return res.status(400).json({ message: 'Code and provider required' });

  try {
    const tokens = provider === 'google' ? await exchangeGoogleCode(code) : await exchangeMicrosoftCode(code);

    await pool.query(
      `INSERT INTO email_settings (created_by, oauth_provider, oauth_access_token, oauth_refresh_token, oauth_expiry, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (created_by) DO UPDATE SET
         oauth_provider = EXCLUDED.oauth_provider,
         oauth_access_token = EXCLUDED.oauth_access_token,
         oauth_refresh_token = EXCLUDED.oauth_refresh_token,
         oauth_expiry = EXCLUDED.oauth_expiry,
         updated_at = NOW()`,
      [userId, provider, encryptString(tokens.access_token), tokens.refresh_token ? encryptString(tokens.refresh_token) : null, tokens.expiry]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error('OAuth exchange error:', err);
    res.status(500).json({ message: 'Failed to exchange tokens' });
  }
});

app.post('/api/settings/email/oauth/disconnect', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  try {
    await pool.query(
      `UPDATE email_settings SET oauth_provider = NULL, oauth_access_token = NULL, oauth_refresh_token = NULL, oauth_expiry = NULL, updated_at = NOW() WHERE created_by = $1`,
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.get('/api/settings/email-templates', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  try {
    await ensureDefaultEmailTemplates(userId);
    const r = await pool.query(
      `SELECT template_key, name, subject, body_html, updated_at FROM email_templates WHERE created_by = $1 ORDER BY template_key ASC`,
      [userId],
    );
    return res.json({ templates: r.rows });
  } catch (error) {
    console.error('List email templates error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/settings/email-templates/:key', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const keyParam = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const templateKey = typeof keyParam === 'string' ? keyParam.trim() : '';
  if (!/^[a-z0-9_-]{1,64}$/i.test(templateKey)) {
    return res.status(400).json({ message: 'Invalid template key' });
  }
  const body = req.body as { name?: string; subject?: string; body_html?: string };
  try {
    await ensureDefaultEmailTemplates(userId);
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (typeof body.name === 'string') {
      updates.push(`name = $${idx++}`);
      values.push(body.name.trim() || templateKey);
    }
    if (typeof body.subject === 'string') {
      updates.push(`subject = $${idx++}`);
      values.push(body.subject);
    }
    if (typeof body.body_html === 'string') {
      updates.push(`body_html = $${idx++}`);
      values.push(body.body_html);
    }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const whereUserIdx = values.length + 1;
    const whereKeyIdx = values.length + 2;
    values.push(userId, templateKey);
    const result = await pool.query(
      `UPDATE email_templates SET ${updates.join(', ')} WHERE created_by = $${whereUserIdx} AND template_key = $${whereKeyIdx}`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Template not found' });
    const r = await pool.query(
      `SELECT template_key, name, subject, body_html, updated_at FROM email_templates WHERE created_by = $1 AND template_key = $2`,
      [userId, templateKey],
    );
    return res.json({ template: r.rows[0] });
  } catch (error) {
    console.error('Patch email template error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

const SYSTEM_EMAIL_TEMPLATE_KEYS = new Set(['invoice', 'quotation', 'general', 'service_reminder']);

app.post('/api/settings/email-templates', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const body = req.body as { template_key?: string; name?: string; subject?: string; body_html?: string };
  const key = typeof body.template_key === 'string' ? body.template_key.trim() : '';
  if (!/^[a-z0-9_-]{1,64}$/i.test(key)) {
    return res.status(400).json({ message: 'template_key must be 1–64 characters: letters, numbers, underscore, hyphen' });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ message: 'name is required' });
  const subject = typeof body.subject === 'string' && body.subject.trim() ? body.subject : 'Message from {{company_name}}';
  const bodyHtml = typeof body.body_html === 'string' && body.body_html.trim() ? body.body_html : '<p>{{message}}</p>';
  try {
    const ins = await pool.query(
      `INSERT INTO email_templates (created_by, template_key, name, subject, body_html)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING template_key, name, subject, body_html, updated_at`,
      [userId, key, name, subject, bodyHtml],
    );
    return res.status(201).json({ template: ins.rows[0] });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === '23505') {
      return res.status(409).json({ message: 'A template with this key already exists' });
    }
    console.error('Create email template error:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/email-templates/:key', authenticate, requireAdmin, requirePermission('settings_company'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const keyParam = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const templateKey = typeof keyParam === 'string' ? keyParam.trim() : '';
  if (!/^[a-z0-9_-]{1,64}$/i.test(templateKey)) {
    return res.status(400).json({ message: 'Invalid template key' });
  }
  if (SYSTEM_EMAIL_TEMPLATE_KEYS.has(templateKey.toLowerCase())) {
    return res.status(400).json({
      message: 'Built-in templates (invoice, quotation, general, service_reminder) cannot be deleted',
    });
  }
  try {
    const r = await pool.query('DELETE FROM email_templates WHERE created_by = $1 AND template_key = $2', [
      userId,
      templateKey,
    ]);
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Template not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete email template error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Price Books ----------
app.get('/api/settings/price-books', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM price_books ORDER BY id ASC');
    return res.json(result.rows);
  } catch (error) {
    console.error('List price books error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/price-books', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const { name, description } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO price_books (name, description, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description?.trim() || null, getTenantScopeUserId(req.user!)],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create price book error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/settings/price-books/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });

  const { name, description } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Name is required' });
  }

  try {
    const result = await pool.query(
      `UPDATE price_books SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [name.trim(), description?.trim() || null, id],
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Price book not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Update price book error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/price-books/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });

  try {
    const check = await pool.query('SELECT 1 FROM customers WHERE price_book_id = $1 LIMIT 1', [id]);
    if ((check.rowCount ?? 0) > 0) {
      return res.status(400).json({ message: 'Cannot delete price book because it is used by customers' });
    }
    const result = await pool.query('DELETE FROM price_books WHERE id = $1', [id]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Price book not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete price book error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/settings/price-books/:id/details', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  try {
    const pbResult = await pool.query('SELECT * FROM price_books WHERE id = $1', [id]);
    if ((pbResult.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Price book not found' });
    const itemsResult = await pool.query('SELECT * FROM price_book_items WHERE price_book_id = $1 ORDER BY id ASC', [id]);
    const labourRatesResult = await pool.query('SELECT * FROM price_book_labour_rates WHERE price_book_id = $1 ORDER BY id ASC', [id]);
    return res.json({
      ...pbResult.rows[0],
      items: itemsResult.rows,
      labour_rates: labourRatesResult.rows,
    });
  } catch (error) {
    console.error('Get price book details error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/price-books/:id/items', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { item_name, unit_price, price } = req.body;
  if (!item_name) return res.status(400).json({ message: 'Item name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO price_book_items (price_book_id, item_name, unit_price, price) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, item_name, unit_price || 0, price || 0]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add price book item error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/settings/price-books/:id/items/:itemId', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const itemId = parseInt(String(req.params.itemId), 10);
  const { item_name, unit_price, price } = req.body;
  try {
    const result = await pool.query(
      `UPDATE price_book_items SET item_name = $1, unit_price = $2, price = $3, updated_at = NOW() WHERE id = $4 AND price_book_id = $5 RETURNING *`,
      [item_name, unit_price || 0, price || 0, itemId, id]
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Item not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Update price book item error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/price-books/:id/items/:itemId', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const itemId = parseInt(String(req.params.itemId), 10);
  try {
    const result = await pool.query('DELETE FROM price_book_items WHERE id = $1 AND price_book_id = $2', [itemId, id]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Item not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete price book item error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/price-books/:id/labour-rates', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { name, description, basic_rate_per_hr, nominal_code, rounding_rule } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO price_book_labour_rates (price_book_id, name, description, basic_rate_per_hr, nominal_code, rounding_rule) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, name, description || null, basic_rate_per_hr || 0, nominal_code || null, rounding_rule || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add labour rate error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/settings/price-books/:id/labour-rates/:rateId', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const rateId = parseInt(String(req.params.rateId), 10);
  const { name, description, basic_rate_per_hr, nominal_code, rounding_rule } = req.body;
  try {
    const result = await pool.query(
      `UPDATE price_book_labour_rates SET name = $1, description = $2, basic_rate_per_hr = $3, nominal_code = $4, rounding_rule = $5, updated_at = NOW() WHERE id = $6 AND price_book_id = $7 RETURNING *`,
      [name, description || null, basic_rate_per_hr || 0, nominal_code || null, rounding_rule || null, rateId, id]
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Labour rate not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Update labour rate error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/price-books/:id/labour-rates/:rateId', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const rateId = parseInt(String(req.params.rateId), 10);
  try {
    const result = await pool.query('DELETE FROM price_book_labour_rates WHERE id = $1 AND price_book_id = $2', [rateId, id]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Labour rate not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete labour rate error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ---------- Customer Types ----------
app.get('/api/settings/customer-types', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const ownerClause = isSuperAdmin ? '' : 'WHERE created_by = $1';
  const params = isSuperAdmin ? [] : [userId];

  try {
    const result = await pool.query(
      `SELECT id, name, description, company_name_required, allow_branches, work_address_name, created_at, created_by 
       FROM customer_types ${ownerClause} ORDER BY name ASC`,
      params
    );
    return res.json({ customerTypes: result.rows });
  } catch (error) {
    console.error('Get customer types error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/customer-types', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as { name?: string; description?: string; company_name_required?: boolean; allow_branches?: boolean; work_address_name?: string };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ message: 'Name is required' });

  const desc = typeof body.description === 'string' ? body.description.trim() : null;
  const companyReq = !!body.company_name_required;
  const branches = !!body.allow_branches;
  const workAddrName = typeof body.work_address_name === 'string' && body.work_address_name.trim() !== '' ? body.work_address_name.trim() : 'Work Address';
  const createdBy = getTenantScopeUserId(req.user!);

  try {
    const result = await pool.query(
      `INSERT INTO customer_types (name, description, company_name_required, allow_branches, work_address_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, desc, companyReq, branches, workAddrName, createdBy]
    );
    return res.status(201).json({ customerType: result.rows[0] });
  } catch (error) {
    console.error('Create customer type error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/settings/customer-types/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const body = req.body as any;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ message: 'Name is required' });

  const desc = typeof body.description === 'string' ? body.description.trim() : null;
  const companyReq = !!body.company_name_required;
  const branches = !!body.allow_branches;
  const workAddrName = typeof body.work_address_name === 'string' && body.work_address_name.trim() !== '' ? body.work_address_name.trim() : 'Work Address';

  const ownerClause = isSuperAdmin ? '' : ' AND created_by = $6';
  const params: any[] = [name, desc, companyReq, branches, workAddrName];
  if (!isSuperAdmin) {
    params.push(userId);
  }
  params.push(id);
  const idParamIdx = params.length;

  try {
    const result = await pool.query(
      `UPDATE customer_types SET name=$1, description=$2, company_name_required=$3, allow_branches=$4, work_address_name=$5 
       WHERE id=$${idParamIdx} ${ownerClause.replace('$6', '$6')} RETURNING *`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    return res.json({ customerType: result.rows[0] });
  } catch (error) {
    console.error('Update customer type error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// CustomerTypesSettings.tsx uses PATCH for edits; support PATCH as an alias of PUT.
app.patch('/api/settings/customer-types/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const body = req.body as any;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ message: 'Name is required' });

  const desc = typeof body.description === 'string' ? body.description.trim() : null;
  const companyReq = !!body.company_name_required;
  const branches = !!body.allow_branches;
  const workAddrName = typeof body.work_address_name === 'string' && body.work_address_name.trim() !== '' ? body.work_address_name.trim() : 'Work Address';

  const ownerClause = isSuperAdmin ? '' : ' AND created_by = $6';
  const params: any[] = [name, desc, companyReq, branches, workAddrName];
  if (!isSuperAdmin) params.push(userId);
  params.push(id);
  const idParamIdx = params.length;

  try {
    const result = await pool.query(
      `UPDATE customer_types SET name=$1, description=$2, company_name_required=$3, allow_branches=$4, work_address_name=$5 
       WHERE id=$${idParamIdx} ${ownerClause.replace('$6', '$6')} RETURNING *`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    return res.json({ customerType: result.rows[0] });
  } catch (error) {
    console.error('Update customer type (patch) error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/customer-types/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const ownerClause = isSuperAdmin ? '' : ' AND created_by = $2';
  const params = isSuperAdmin ? [id] : [id, userId];

  try {
    const result = await pool.query(`DELETE FROM customer_types WHERE id=$1 ${ownerClause}`, params);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete customer type error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ───────────────────────────────── JOB DESCRIPTIONS (Settings Templates) ─────────────────────────────────

// List all job descriptions
app.get('/api/settings/job-descriptions', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM job_descriptions ORDER BY name ASC');
    return res.json(result.rows);
  } catch (error) {
    console.error('List job descriptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get single job description with its default pricing items
app.get('/api/settings/job-descriptions/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  try {
    const descResult = await pool.query('SELECT * FROM job_descriptions WHERE id = $1', [id]);
    if ((descResult.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Not found' });

    const itemsResult = await pool.query('SELECT * FROM job_description_pricing_items WHERE job_description_id = $1 ORDER BY sort_order ASC', [id]);

    return res.json({
      ...descResult.rows[0],
      pricing_items: itemsResult.rows,
    });
  } catch (error) {
    console.error('Get job description error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Create job description
app.post('/api/settings/job-descriptions', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const { name, default_skills, default_job_notes, default_priority, default_business_unit, is_service_job } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO job_descriptions (name, default_skills, default_job_notes, default_priority, default_business_unit, is_service_job, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name.trim(), default_skills || null, default_job_notes || null, default_priority || 'medium', default_business_unit || null, !!is_service_job, getTenantScopeUserId(req.user!)]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create job description error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Update job description
app.patch('/api/settings/job-descriptions/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  const { name, default_skills, default_job_notes, default_priority, default_business_unit, is_service_job } = req.body;
  try {
    const result = await pool.query(
      `UPDATE job_descriptions SET name=COALESCE($1,name), default_skills=$2, default_job_notes=$3, default_priority=COALESCE($4,default_priority), default_business_unit=$5, is_service_job=COALESCE($6,is_service_job), updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name?.trim() || null, default_skills ?? null, default_job_notes ?? null, default_priority || null, default_business_unit ?? null, is_service_job ?? null, id]
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Update job description error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete job description
app.delete('/api/settings/job-descriptions/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  try {
    const result = await pool.query('DELETE FROM job_descriptions WHERE id=$1', [id]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete job description error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get(
  '/api/settings/job-descriptions/:id/job-report-questions',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    const descId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(descId)) return res.status(400).json({ message: 'Invalid ID' });
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    try {
      const own = await pool.query<{ id: number }>(
        `SELECT id FROM job_descriptions WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
        isSuperAdmin ? [descId] : [descId, userId],
      );
      if ((own.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Not found' });
      const result = await pool.query(
        `SELECT id, sort_order, question_type, prompt, helper_text, required
         FROM job_report_job_description_questions
         WHERE job_description_id = $1
         ORDER BY sort_order ASC, id ASC`,
        [descId],
      );
      return res.json({ questions: result.rows });
    } catch (error) {
      console.error('get job description job report template error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.put(
  '/api/settings/job-descriptions/:id/job-report-questions',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    const descId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(descId)) return res.status(400).json({ message: 'Invalid ID' });
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const raw = req.body as { questions?: unknown };
    if (!Array.isArray(raw.questions)) {
      return res.status(400).json({ message: 'Body must include questions array' });
    }
    const client = await pool.connect();
    try {
      const own = await client.query<{ id: number }>(
        `SELECT id FROM job_descriptions WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'}`,
        isSuperAdmin ? [descId] : [descId, userId],
      );
      if ((own.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Not found' });
      }
      await client.query('BEGIN');
      await client.query('DELETE FROM job_report_job_description_questions WHERE job_description_id = $1', [descId]);
      let order = 0;
      for (const item of raw.questions) {
        if (!item || typeof item !== 'object') {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Each question must be an object' });
        }
        const q = item as Record<string, unknown>;
        const questionType = typeof q.question_type === 'string' ? q.question_type.trim() : '';
        const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : '';
        if (!prompt) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Each question needs a non-empty prompt' });
        }
        if (!isJobReportQuestionType(questionType)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: `Invalid question_type "${questionType}". Allowed: ${JOB_REPORT_QUESTION_TYPES.join(', ')}`,
          });
        }
        const helperText =
          typeof q.helper_text === 'string' && q.helper_text.trim() ? q.helper_text.trim() : null;
        const required = q.required === false ? false : true;
        const sortOrder =
          typeof q.sort_order === 'number' && Number.isFinite(q.sort_order)
            ? Math.round(q.sort_order)
            : order;
        await client.query(
          `INSERT INTO job_report_job_description_questions (job_description_id, sort_order, question_type, prompt, helper_text, required)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [descId, sortOrder, questionType, prompt, helperText, required],
        );
        order += 1;
      }
      await client.query('COMMIT');
      const result = await pool.query(
        `SELECT id, sort_order, question_type, prompt, helper_text, required
         FROM job_report_job_description_questions
         WHERE job_description_id = $1
         ORDER BY sort_order ASC, id ASC`,
        [descId],
      );
      return res.json({ questions: result.rows });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('put job description job report template error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  },
);

// ── Pricing items for a job description template ──

app.get('/api/settings/job-descriptions/:id/pricing-items', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  try {
    const result = await pool.query('SELECT * FROM job_description_pricing_items WHERE job_description_id = $1 ORDER BY sort_order ASC', [id]);
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/job-descriptions/:id/pricing-items', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const descId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(descId)) return res.status(400).json({ message: 'Invalid ID' });
  const { item_name, time_included, unit_price, vat_rate, quantity } = req.body;
  if (!item_name?.trim()) return res.status(400).json({ message: 'Item name is required' });
  try {
    const countResult = await pool.query('SELECT COUNT(*)::int as c FROM job_description_pricing_items WHERE job_description_id=$1', [descId]);
    const sortOrder = Number(countResult.rows[0].c);
    const result = await pool.query(
      `INSERT INTO job_description_pricing_items (job_description_id, item_name, time_included, unit_price, vat_rate, quantity, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [descId, item_name.trim(), time_included || 0, unit_price || 0, vat_rate ?? 20.00, quantity || 1, sortOrder]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/job-descriptions/:descId/pricing-items/:itemId', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const itemId = parseInt(String(req.params.itemId), 10);
  if (!Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid ID' });
  try {
    await pool.query('DELETE FROM job_description_pricing_items WHERE id=$1', [itemId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Settings: Business Units
app.get('/api/settings/business-units', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const r = await pool.query('SELECT * FROM business_units ORDER BY name ASC');
    res.json({ units: r.rows });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/business-units', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ message: 'Invalid name' });
  try {
    const r = await pool.query(
      'INSERT INTO business_units (name, created_by) VALUES ($1, $2) RETURNING *',
      [name.trim(), getTenantScopeUserId(req.user!)]
    );
    res.json({ unit: r.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') return res.status(400).json({ message: 'Business unit already exists' });
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/business-units/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM business_units WHERE id = $1', [parseInt(String(req.params.id), 10)]);
    res.json({ message: 'Business unit deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Settings: User Groups
app.get('/api/settings/user-groups', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const r = await pool.query('SELECT * FROM user_groups ORDER BY name ASC');
    res.json({ groups: r.rows });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/user-groups', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ message: 'Invalid name' });
  try {
    const r = await pool.query(
      'INSERT INTO user_groups (name, created_by) VALUES ($1, $2) RETURNING *',
      [name.trim(), getTenantScopeUserId(req.user!)]
    );
    res.json({ group: r.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') return res.status(400).json({ message: 'User group already exists' });
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/user-groups/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM user_groups WHERE id = $1', [parseInt(String(req.params.id), 10)]);
    res.json({ message: 'User group deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/settings/service-checklist', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  try {
    const result = await pool.query(
      `SELECT id, name, sort_order, is_active,
              reminder_interval_n, reminder_interval_unit, reminder_early_n, reminder_early_unit,
              customer_reminder_weeks_before, customer_email_subject, customer_email_body_html,
              created_at, updated_at
       FROM service_checklist_items
       WHERE created_by = $1
       ORDER BY sort_order ASC, id ASC`,
      [userId],
    );
    return res.json({ items: result.rows });
  } catch (error) {
    console.error('List service checklist error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/service-checklist', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const sortOrder = Number.isFinite(req.body?.sort_order) ? Number(req.body.sort_order) : 0;
  const isActive = req.body?.is_active === undefined ? true : !!req.body.is_active;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO service_checklist_items (name, sort_order, is_active, created_by, reminder_interval_n, reminder_interval_unit, reminder_early_n, reminder_early_unit)
       VALUES ($1, $2, $3, $4, 1, 'years', 14, 'days')
       RETURNING id, name, sort_order, is_active, reminder_interval_n, reminder_interval_unit, reminder_early_n, reminder_early_unit,
                 customer_reminder_weeks_before, customer_email_subject, customer_email_body_html, created_at, updated_at`,
      [name, sortOrder, isActive, userId],
    );
    return res.status(201).json({ item: result.rows[0] });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505') {
      return res.status(400).json({ message: 'Service already exists' });
    }
    console.error('Create service checklist item error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/settings/service-checklist/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const userId = getTenantScopeUserId(req.user!);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid item id' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
  const sortOrder = req.body?.sort_order !== undefined ? Number(req.body.sort_order) : undefined;
  const isActive = req.body?.is_active !== undefined ? !!req.body.is_active : undefined;
  const body = req.body as Record<string, unknown>;
  const hasInterval =
    body.reminder_interval_n !== undefined || body.reminder_interval_unit !== undefined;
  const hasEarly = body.reminder_early_n !== undefined || body.reminder_early_unit !== undefined;
  const hasCustomerEmail =
    body.customer_reminder_weeks_before !== undefined ||
    body.customer_email_subject !== undefined ||
    body.customer_email_body_html !== undefined;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name || null); }
  if (sortOrder !== undefined && Number.isFinite(sortOrder)) { updates.push(`sort_order = $${idx++}`); values.push(sortOrder); }
  if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); values.push(isActive); }
  if (hasInterval) {
    const rawN = body.reminder_interval_n;
    const n =
      typeof rawN === 'number' && Number.isFinite(rawN)
        ? Math.trunc(rawN)
        : typeof rawN === 'string' && String(rawN).trim()
          ? parseInt(String(rawN).trim(), 10)
          : NaN;
    const u =
      typeof body.reminder_interval_unit === 'string' ? body.reminder_interval_unit.trim().toLowerCase() : '';
    if (!Number.isFinite(n) || n < 1 || !SERVICE_REMINDER_INTERVAL_UNITS.has(u)) {
      return res.status(400).json({ message: 'Invalid reminder interval (use amount ≥ 1 and unit: days, weeks, months, years)' });
    }
    updates.push(`reminder_interval_n = $${idx++}`);
    values.push(n);
    updates.push(`reminder_interval_unit = $${idx++}`);
    values.push(u);
  }
  if (hasEarly) {
    const rawEn = body.reminder_early_n;
    const en =
      typeof rawEn === 'number' && Number.isFinite(rawEn)
        ? Math.trunc(rawEn)
        : typeof rawEn === 'string' && String(rawEn).trim()
          ? parseInt(String(rawEn).trim(), 10)
          : NaN;
    const eu =
      typeof body.reminder_early_unit === 'string' ? body.reminder_early_unit.trim().toLowerCase() : '';
    if (!Number.isFinite(en) || en < 1 || !SERVICE_REMINDER_EARLY_UNITS.has(eu)) {
      return res.status(400).json({ message: 'Invalid early reminder (use amount ≥ 1 and unit: days or weeks)' });
    }
    updates.push(`reminder_early_n = $${idx++}`);
    values.push(en);
    updates.push(`reminder_early_unit = $${idx++}`);
    values.push(eu);
  }
  if (hasCustomerEmail) {
    if (body.customer_reminder_weeks_before !== undefined) {
      if (body.customer_reminder_weeks_before === null) {
        updates.push(`customer_reminder_weeks_before = $${idx++}`);
        values.push(null);
      } else {
        const w =
          typeof body.customer_reminder_weeks_before === 'number'
            ? Math.trunc(body.customer_reminder_weeks_before)
            : parseInt(String(body.customer_reminder_weeks_before).trim(), 10);
        if (!Number.isFinite(w) || w < 1 || w > 52) {
          return res.status(400).json({ message: 'customer_reminder_weeks_before must be 1–52 or null' });
        }
        updates.push(`customer_reminder_weeks_before = $${idx++}`);
        values.push(w);
      }
    }
    if (body.customer_email_subject !== undefined) {
      const s = typeof body.customer_email_subject === 'string' ? body.customer_email_subject.trim() : '';
      updates.push(`customer_email_subject = $${idx++}`);
      values.push(s || null);
    }
    if (body.customer_email_body_html !== undefined) {
      const h = typeof body.customer_email_body_html === 'string' ? body.customer_email_body_html.trim() : '';
      updates.push(`customer_email_body_html = $${idx++}`);
      values.push(h || null);
    }
  }
  if (!updates.length) return res.status(400).json({ message: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(id, userId);

  try {
    const result = await pool.query(
      `UPDATE service_checklist_items
       SET ${updates.join(', ')}
       WHERE id = $${idx++} AND created_by = $${idx}
       RETURNING id, name, sort_order, is_active, reminder_interval_n, reminder_interval_unit, reminder_early_n, reminder_early_unit,
                 customer_reminder_weeks_before, customer_email_subject, customer_email_body_html, created_at, updated_at`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Service not found' });
    return res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Update service checklist item error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/service-checklist/:id', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const userId = getTenantScopeUserId(req.user!);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid item id' });
  try {
    const result = await pool.query('DELETE FROM service_checklist_items WHERE id = $1 AND created_by = $2', [id, userId]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Service not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete service checklist item error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/settings/service-reminders', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  try {
    await pool.query(
      `INSERT INTO service_reminder_settings (created_by) VALUES ($1)
       ON CONFLICT (created_by) DO NOTHING`,
      [userId],
    );
    const r = await pool.query<{
      automated_enabled: boolean;
      recipient_mode: string;
    }>(
      `SELECT automated_enabled, recipient_mode FROM service_reminder_settings WHERE created_by = $1`,
      [userId],
    );
    const row = r.rows[0];
    return res.json({
      settings: {
        automated_enabled: row?.automated_enabled !== false,
        recipient_mode: SERVICE_REMINDER_RECIPIENT_MODES.has(row?.recipient_mode || '')
          ? row!.recipient_mode
          : 'customer_account',
      },
    });
  } catch (error) {
    console.error('Get service reminder settings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/settings/service-reminders', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const body = req.body as { automated_enabled?: unknown; recipient_mode?: unknown };
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (body.automated_enabled !== undefined) {
    updates.push(`automated_enabled = $${idx++}`);
    values.push(!!body.automated_enabled);
  }
  if (body.recipient_mode !== undefined) {
    const m = typeof body.recipient_mode === 'string' ? body.recipient_mode.trim() : '';
    if (!SERVICE_REMINDER_RECIPIENT_MODES.has(m)) {
      return res.status(400).json({
        message: 'recipient_mode must be customer_account, job_contact, or primary_contact',
      });
    }
    updates.push(`recipient_mode = $${idx++}`);
    values.push(m);
  }
  if (!updates.length) return res.status(400).json({ message: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(userId);
  try {
    await pool.query(
      `INSERT INTO service_reminder_settings (created_by) VALUES ($1)
       ON CONFLICT (created_by) DO NOTHING`,
      [userId],
    );
    await pool.query(`UPDATE service_reminder_settings SET ${updates.join(', ')} WHERE created_by = $${idx}`, values);
    const r = await pool.query<{
      automated_enabled: boolean;
      recipient_mode: string;
    }>(
      `SELECT automated_enabled, recipient_mode FROM service_reminder_settings WHERE created_by = $1`,
      [userId],
    );
    const row = r.rows[0];
    return res.json({
      settings: {
        automated_enabled: row?.automated_enabled !== false,
        recipient_mode: SERVICE_REMINDER_RECIPIENT_MODES.has(row?.recipient_mode || '')
          ? row!.recipient_mode
          : 'customer_account',
      },
    });
  } catch (error) {
    console.error('Patch service reminder settings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post(
  '/api/settings/service-reminders/run-now',
  authenticate,
  requireAdmin,
  requirePermission('settings_master_data'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await runAllScheduledReminders(pool, {
        loadEmailSettingsPayload,
        sendUserEmail,
        runServiceCustomerReminders: runAutomatedServiceReminders,
      });
      return res.json(result);
    } catch (error) {
      console.error('Run service reminders error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

async function handleInternalRemindersCron(req: Request, res: Response) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const hdr = req.headers['x-cron-secret'];
  const provided = typeof hdr === 'string' ? hdr : Array.isArray(hdr) ? hdr[0] : '';
  if (provided !== secret) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const result = await runAllScheduledReminders(pool, {
      loadEmailSettingsPayload,
      sendUserEmail,
      runServiceCustomerReminders: runAutomatedServiceReminders,
    });
    return res.json(result);
  } catch (error) {
    console.error('Cron reminders error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

app.post('/api/internal/service-reminders', handleInternalRemindersCron);
app.post('/api/internal/reminders', handleInternalRemindersCron);

// ───────────────────────────────── ENHANCED JOB CREATION (with pricing items) ─────────────────────────────────

app.post('/api/customers/:customerId/jobs', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });

  const {
    job_description_id, contact_name, expected_completion, priority, user_group, business_unit,
    skills, job_notes, is_service_job, quoted_amount, customer_reference, job_pipeline,
    book_into_diary, pricing_items, completed_service_items,
  } = req.body;

  const title = req.body.title?.trim() || 'Untitled Job';
  const createdBy = getTenantScopeUserId(req.user!);

  const completedServiceItems = normalizeCompletedServiceItemsForDb(completed_service_items);

  try {
    const workAddressIdJob = await resolveWorkAddressIdForCustomer(pool, customerId, (req.body as { work_address_id?: unknown }).work_address_id);
    const rawJobContact = (req.body as { job_contact_id?: unknown }).job_contact_id;
    let jobContactIdResolved: number | null = null;
    let contactNameResolved = typeof contact_name === 'string' && contact_name.trim() ? contact_name.trim() : null;
    if (rawJobContact != null && rawJobContact !== '') {
      const jcid =
        typeof rawJobContact === 'number' && Number.isFinite(rawJobContact)
          ? Math.trunc(rawJobContact)
          : parseInt(String(rawJobContact), 10);
      if (!Number.isFinite(jcid)) {
        return res.status(400).json({ message: 'Invalid job_contact_id' });
      }
      const v = await validateJobContactForCustomer(pool, customerId, workAddressIdJob, jcid);
      if (!v.valid) {
        return res.status(400).json({ message: 'Invalid job contact for this customer or work site' });
      }
      jobContactIdResolved = jcid;
      contactNameResolved = v.display_name;
    }

    const jobResult = await pool.query(
      `INSERT INTO jobs (title, description, priority, customer_id, work_address_id, state, created_by,
        job_description_id, contact_name, job_contact_id, expected_completion, user_group, business_unit,
        skills, job_notes, is_service_job, quoted_amount, customer_reference, job_pipeline, book_into_diary, completed_service_items)
       VALUES ($1, $2, $3, $4, $5, 'created', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [
        title, job_notes || null, priority || 'medium', customerId, workAddressIdJob, createdBy,
        job_description_id || null, contactNameResolved, jobContactIdResolved,
        expected_completion ? new Date(expected_completion) : null,
        user_group || null, business_unit || null, skills || null, job_notes || null,
        !!is_service_job, quoted_amount || null, customer_reference || null, job_pipeline || null,
        book_into_diary !== false, JSON.stringify(completedServiceItems),
      ],
    );

    const job = jobResult.rows[0];

    try {
      await seedJobReportQuestionsForNewJob(job.id, parseOptionalJobDescriptionId(job.job_description_id));
    } catch (e) {
      console.error('Seed job report questions for new job:', e);
    }
    // Insert pricing items if provided
    if (Array.isArray(pricing_items) && pricing_items.length > 0) {
      for (let i = 0; i < pricing_items.length; i++) {
        const pi = pricing_items[i];
        const total = Number(pi.unit_price || 0) * Number(pi.quantity || 1);
        await pool.query(
          `INSERT INTO job_pricing_items (job_id, item_name, time_included, unit_price, vat_rate, quantity, total, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [job.id, pi.item_name, pi.time_included || 0, pi.unit_price || 0, pi.vat_rate ?? 20.00, pi.quantity || 1, total, i]
        );
      }
    }

    // Fetch the inserted pricing items
    const pItems = await pool.query('SELECT * FROM job_pricing_items WHERE job_id=$1 ORDER BY sort_order', [job.id]);

    return res.status(201).json({ job: { ...job, pricing_items: pItems.rows } });
  } catch (error) {
    console.error('Create customer job error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get jobs for a customer
app.get('/api/customers/:customerId/jobs', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const workAddressId = typeof req.query.work_address_id === 'string' ? parseInt(req.query.work_address_id, 10) : null;
  try {
    const params: any[] = [customerId];
    let whereClause = 'WHERE j.customer_id = $1';
    if (workAddressId && Number.isFinite(workAddressId)) {
      whereClause += ' AND j.work_address_id = $2';
      params.push(workAddressId);
    } else {
      /* Customer (parent) view: do not list jobs that belong to a work address / site. */
      whereClause += ' AND j.work_address_id IS NULL';
    }
    const result = await pool.query(
      `SELECT j.*, jd.name as description_name FROM jobs j 
       LEFT JOIN job_descriptions jd ON j.job_description_id = jd.id
       ${whereClause} ORDER BY j.created_at DESC`,
      params
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/contacts', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const params: unknown[] = [customerId];
    let whereClause = 'WHERE customer_id = $1';
    const workAddressId = typeof req.query.work_address_id === 'string' ? parseInt(req.query.work_address_id, 10) : null;
    if (workAddressId && Number.isFinite(workAddressId)) {
      whereClause += ` AND work_address_id = $${params.length + 1}`;
      params.push(workAddressId);
    } else {
      whereClause += ' AND work_address_id IS NULL';
    }
    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (COALESCE(title,'') ILIKE $${params.length} OR COALESCE(first_name,'') ILIKE $${params.length} OR surname ILIKE $${params.length} OR COALESCE(position,'') ILIKE $${params.length} OR COALESCE(email,'') ILIKE $${params.length} OR COALESCE(mobile,'') ILIKE $${params.length})`;
    }

    const result = await pool.query(
      `SELECT id, customer_id, title, first_name, surname, position, email, mobile, landline, office_code, date_of_birth, twitter_handle, facebook_url, linkedin_url,
              is_primary, prefers_phone, prefers_sms, prefers_email, prefers_letter, created_at, updated_at
       FROM customer_contacts
       ${whereClause}
       ORDER BY is_primary DESC, created_at ASC`,
      params,
    );

    return res.json({
      contacts: result.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        customer_id: Number(r.customer_id),
        title: (r.title as string) ?? null,
        first_name: (r.first_name as string) ?? null,
        surname: (r.surname as string) ?? '',
        position: (r.position as string) ?? null,
        email: (r.email as string) ?? null,
        mobile: (r.mobile as string) ?? null,
        landline: (r.landline as string) ?? null,
        office_code: (r.office_code as string) ?? null,
        date_of_birth: r.date_of_birth ? (r.date_of_birth as Date).toISOString().slice(0, 10) : null,
        twitter_handle: (r.twitter_handle as string) ?? null,
        facebook_url: (r.facebook_url as string) ?? null,
        linkedin_url: (r.linkedin_url as string) ?? null,
        is_primary: !!r.is_primary,
        prefers_phone: !!r.prefers_phone,
        prefers_sms: !!r.prefers_sms,
        prefers_email: !!r.prefers_email,
        prefers_letter: !!r.prefers_letter,
        created_at: (r.created_at as Date).toISOString(),
        updated_at: (r.updated_at as Date).toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get customer contacts error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/customers/:customerId/contacts', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : null);
  const title = str('title');
  const firstName = str('first_name');
  const surname = str('surname');
  if (!surname) return res.status(400).json({ message: 'Surname is required' });
  const position = str('position');
  const email = str('email');
  const mobile = str('mobile');
  const landline = str('landline');
  const officeCode = str('office_code');
  const dateOfBirth = typeof body.date_of_birth === 'string' && body.date_of_birth ? new Date(body.date_of_birth) : null;
  const twitterHandle = str('twitter_handle');
  const facebookUrl = str('facebook_url');
  const linkedinUrl = str('linkedin_url');
  const isPrimary = !!body.is_primary;
  const prefersPhone = !!body.prefers_phone;
  const prefersSms = !!body.prefers_sms;
  const prefersEmail = !!body.prefers_email;
  const prefersLetter = !!body.prefers_letter;

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const workAddressId = await resolveWorkAddressIdForCustomer(pool, customerId, body.work_address_id);

    if (isPrimary) {
      await pool.query(
        'UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1 AND work_address_id IS NOT DISTINCT FROM $2',
        [customerId, workAddressId],
      );
    }

    const inserted = await pool.query(
      `INSERT INTO customer_contacts
       (customer_id, title, first_name, surname, position, email, mobile, landline, office_code, date_of_birth, twitter_handle, facebook_url, linkedin_url,
        is_primary, prefers_phone, prefers_sms, prefers_email, prefers_letter, work_address_id, created_by)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [
        customerId, title, firstName, surname, position, email, mobile, landline, officeCode, dateOfBirth, twitterHandle, facebookUrl, linkedinUrl,
        isPrimary, prefersPhone, prefersSms, prefersEmail, prefersLetter, workAddressId, userId,
      ],
    );

    return res.status(201).json({ contact: { id: Number(inserted.rows[0].id) } });
  } catch (error) {
    console.error('Create customer contact error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/customers/:customerId/contacts/:contactId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const contactId = parseInt(String(req.params.contactId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(contactId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : undefined);
    if (str('title') !== undefined) { updates.push(`title = $${idx++}`); values.push(str('title')); }
    if (str('first_name') !== undefined) { updates.push(`first_name = $${idx++}`); values.push(str('first_name')); }
    if (str('surname') !== undefined) { updates.push(`surname = $${idx++}`); values.push(str('surname')); }
    if (str('position') !== undefined) { updates.push(`position = $${idx++}`); values.push(str('position')); }
    if (str('email') !== undefined) { updates.push(`email = $${idx++}`); values.push(str('email')); }
    if (str('mobile') !== undefined) { updates.push(`mobile = $${idx++}`); values.push(str('mobile')); }
    if (str('landline') !== undefined) { updates.push(`landline = $${idx++}`); values.push(str('landline')); }
    if (str('office_code') !== undefined) { updates.push(`office_code = $${idx++}`); values.push(str('office_code')); }
    if (str('twitter_handle') !== undefined) { updates.push(`twitter_handle = $${idx++}`); values.push(str('twitter_handle')); }
    if (str('facebook_url') !== undefined) { updates.push(`facebook_url = $${idx++}`); values.push(str('facebook_url')); }
    if (str('linkedin_url') !== undefined) { updates.push(`linkedin_url = $${idx++}`); values.push(str('linkedin_url')); }
    if (body.date_of_birth !== undefined) {
      updates.push(`date_of_birth = $${idx++}`);
      values.push(typeof body.date_of_birth === 'string' && body.date_of_birth ? new Date(body.date_of_birth) : null);
    }
    if (body.prefers_phone !== undefined) { updates.push(`prefers_phone = $${idx++}`); values.push(!!body.prefers_phone); }
    if (body.prefers_sms !== undefined) { updates.push(`prefers_sms = $${idx++}`); values.push(!!body.prefers_sms); }
    if (body.prefers_email !== undefined) { updates.push(`prefers_email = $${idx++}`); values.push(!!body.prefers_email); }
    if (body.prefers_letter !== undefined) { updates.push(`prefers_letter = $${idx++}`); values.push(!!body.prefers_letter); }
    if (body.is_primary !== undefined) {
      const scopeWa =
        body.work_address_id !== undefined
          ? await resolveWorkAddressIdForCustomer(pool, customerId, body.work_address_id)
          : (
              await pool.query<{ work_address_id: number | null }>(
                'SELECT work_address_id FROM customer_contacts WHERE customer_id = $1 AND id = $2',
                [customerId, contactId],
              )
            ).rows[0]?.work_address_id ?? null;
      if (!!body.is_primary) {
        await pool.query(
          'UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1 AND work_address_id IS NOT DISTINCT FROM $2',
          [customerId, scopeWa],
        );
      }
      updates.push(`is_primary = $${idx++}`);
      values.push(!!body.is_primary);
    }
    if (body.work_address_id !== undefined) {
      const wid = await resolveWorkAddressIdForCustomer(pool, customerId, body.work_address_id);
      updates.push(`work_address_id = $${idx++}`);
      values.push(wid);
    }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

    updates.push('updated_at = NOW()');
    values.push(customerId, contactId);
    const result = await pool.query(
      `UPDATE customer_contacts SET ${updates.join(', ')} WHERE customer_id = $${idx++} AND id = $${idx} RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Contact not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Update customer contact error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/branches', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const params: unknown[] = [customerId];
    let whereClause = 'WHERE customer_id = $1';
    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (branch_name ILIKE $2 OR address_line_1 ILIKE $2 OR COALESCE(address_line_2,'') ILIKE $2 OR COALESCE(address_line_3,'') ILIKE $2 OR COALESCE(town,'') ILIKE $2 OR COALESCE(county,'') ILIKE $2 OR COALESCE(postcode,'') ILIKE $2)`;
    }
    const result = await pool.query(
      `SELECT id, customer_id, branch_name, address_line_1, address_line_2, address_line_3, town, county, postcode, created_at, updated_at
       FROM customer_branches ${whereClause}
       ORDER BY created_at ASC`,
      params,
    );
    return res.json({
      branches: result.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        customer_id: Number(r.customer_id),
        branch_name: (r.branch_name as string) ?? '',
        address_line_1: (r.address_line_1 as string) ?? '',
        address_line_2: (r.address_line_2 as string) ?? null,
        address_line_3: (r.address_line_3 as string) ?? null,
        town: (r.town as string) ?? null,
        county: (r.county as string) ?? null,
        postcode: (r.postcode as string) ?? null,
        created_at: (r.created_at as Date).toISOString(),
        updated_at: (r.updated_at as Date).toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get customer branches error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/customers/:customerId/branches', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  const branchName = typeof body.branch_name === 'string' ? body.branch_name.trim() : '';
  const addressLine1 = typeof body.address_line_1 === 'string' ? body.address_line_1.trim() : '';
  if (!branchName || !addressLine1) return res.status(400).json({ message: 'Branch name and address line 1 are required' });
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : null);

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const inserted = await pool.query(
      `INSERT INTO customer_branches (customer_id, branch_name, address_line_1, address_line_2, address_line_3, town, county, postcode, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [customerId, branchName, addressLine1, str('address_line_2'), str('address_line_3'), str('town'), str('county'), str('postcode'), userId],
    );
    return res.status(201).json({ branch: { id: Number(inserted.rows[0].id) } });
  } catch (error) {
    console.error('Create customer branch error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/customers/:customerId/branches/:branchId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const branchId = parseInt(String(req.params.branchId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(branchId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : undefined);
    if (str('branch_name') !== undefined) { updates.push(`branch_name = $${idx++}`); values.push(str('branch_name')); }
    if (str('address_line_1') !== undefined) { updates.push(`address_line_1 = $${idx++}`); values.push(str('address_line_1')); }
    if (str('address_line_2') !== undefined) { updates.push(`address_line_2 = $${idx++}`); values.push(str('address_line_2')); }
    if (str('address_line_3') !== undefined) { updates.push(`address_line_3 = $${idx++}`); values.push(str('address_line_3')); }
    if (str('town') !== undefined) { updates.push(`town = $${idx++}`); values.push(str('town')); }
    if (str('county') !== undefined) { updates.push(`county = $${idx++}`); values.push(str('county')); }
    if (str('postcode') !== undefined) { updates.push(`postcode = $${idx++}`); values.push(str('postcode')); }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

    updates.push('updated_at = NOW()');
    values.push(customerId, branchId);
    const result = await pool.query(
      `UPDATE customer_branches SET ${updates.join(', ')} WHERE customer_id = $${idx++} AND id = $${idx} RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Branch not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Update customer branch error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/customers/:customerId/branches/:branchId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const branchId = parseInt(String(req.params.branchId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(branchId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const result = await pool.query('DELETE FROM customer_branches WHERE customer_id = $1 AND id = $2', [customerId, branchId]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Branch not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete customer branch error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/work-addresses', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'active';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const params: unknown[] = [customerId];
    let whereClause = 'WHERE customer_id = $1';
    let p = 2;
    if (status === 'active') {
      whereClause += ` AND is_active = true`;
    } else if (status === 'dormant') {
      whereClause += ` AND is_active = false`;
    }
    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (name ILIKE $${p} OR COALESCE(branch_name,'') ILIKE $${p} OR COALESCE(company_name,'') ILIKE $${p} OR address_line_1 ILIKE $${p} OR COALESCE(address_line_2,'') ILIKE $${p} OR COALESCE(town,'') ILIKE $${p} OR COALESCE(county,'') ILIKE $${p} OR COALESCE(postcode,'') ILIKE $${p})`;
      p++;
    }
    const result = await pool.query(
      `SELECT * FROM customer_work_addresses ${whereClause} ORDER BY created_at ASC`,
      params,
    );
    return res.json({ work_addresses: result.rows });
  } catch (error) {
    console.error('Get customer work addresses error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/work-addresses/:workAddressId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const workAddressId = parseInt(String(req.params.workAddressId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(workAddressId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const result = await pool.query(
      `SELECT * FROM customer_work_addresses WHERE customer_id = $1 AND id = $2`,
      [customerId, workAddressId],
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Work address not found' });
    return res.json({ work_address: result.rows[0] });
  } catch (error) {
    console.error('Get customer work address error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/** Create an invoice tied to this work/site address (only way to set invoice_work_address_id). */
app.post(
  '/api/customers/:customerId/work-addresses/:workAddressId/invoices',
  authenticate,
  requireTenantCrmAccess('invoices'),
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = parseInt(String(req.params.customerId), 10);
    const workAddressId = parseInt(String(req.params.workAddressId), 10);
    if (!Number.isFinite(customerId) || !Number.isFinite(workAddressId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const custCheck = await pool.query(
      'SELECT id FROM customers WHERE id = $1' + (isSuperAdmin ? '' : ' AND created_by = $2'),
      isSuperAdmin ? [customerId] : [customerId, userId],
    );
    if ((custCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid customer' });

    let billingAddress: string;
    let invoiceWorkAddressId: number;
    try {
      const r = await resolveInvoiceBillingFromWorkAddress(customerId, workAddressId);
      billingAddress = r.billing_address;
      invoiceWorkAddressId = r.invoice_work_address_id;
    } catch (e) {
      if ((e as Error).message === 'INVALID_WORK_ADDRESS') {
        return res.status(400).json({ message: 'Invalid work address for this customer' });
      }
      throw e;
    }

    const body = req.body as {
      job_id?: number;
      invoice_date?: string;
      due_date?: string;
      currency?: string;
      notes?: string;
      customer_reference?: string | null;
      line_items?: { description: string; quantity: number; unit_price: number }[];
      tax_percentage?: number;
      state?: string;
      invoice_number?: string;
    };

    const jobId = body.job_id && Number.isFinite(body.job_id) ? body.job_id : null;
    if (jobId && !isSuperAdmin) {
      const jobCheck = await pool.query('SELECT id FROM jobs WHERE id = $1 AND created_by = $2', [jobId, userId]);
      if ((jobCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid job' });
    }

    try {
      const settings = await getInvoiceSettings(userId);
      const invoiceDateStr = parseInvoiceDateForDb(body.invoice_date) ?? todayYyyyMmDdUtc();
      const dueDateStr =
        parseInvoiceDateForDb(body.due_date) ?? addDaysYyyyMmDd(invoiceDateStr, settings.default_due_days);
      const currency = typeof body.currency === 'string' && body.currency.trim()
        ? body.currency.trim()
        : settings.default_currency;
      const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
      const custRef =
        typeof body.customer_reference === 'string' ? body.customer_reference.trim() || null : null;
      const lineItems = Array.isArray(body.line_items) ? body.line_items : [];

      let subtotal = 0;
      for (const item of lineItems) {
        const qty = typeof item.quantity === 'number' ? item.quantity : 1;
        const price = typeof item.unit_price === 'number' ? item.unit_price : 0;
        subtotal += qty * price;
      }
      const taxPercentage =
        typeof body.tax_percentage === 'number' ? Math.max(0, Math.min(100, body.tax_percentage)) : settings.default_tax_percentage;
      const taxAmount = Math.round(subtotal * (taxPercentage / 100) * 100) / 100;
      const totalAmount = subtotal + taxAmount;

      const requestedRaw = typeof body.invoice_number === 'string' ? body.invoice_number.trim() : '';
      let invoiceNumber: string;
      if (requestedRaw) {
        const normalized = normalizeInvoiceNumberFromImport(requestedRaw, settings.invoice_prefix);
        if (!normalized) {
          return res.status(400).json({ message: 'Could not parse invoice number; use e.g. INV545 or INV-000545' });
        }
        if (normalized.length > 50) {
          return res.status(400).json({ message: 'Invoice number must be 50 characters or less' });
        }
        const dup = await pool.query('SELECT id FROM invoices WHERE invoice_number = $1', [normalized]);
        if ((dup.rowCount ?? 0) > 0) {
          return res.status(400).json({ message: `Invoice number "${normalized}" already exists` });
        }
        invoiceNumber = normalized;
      } else {
        invoiceNumber = await generateInvoiceNumber(settings.invoice_prefix);
      }
      const validStates = ['draft', 'issued', 'pending_payment'];
      const targetState = body.state && validStates.includes(body.state) ? body.state : 'draft';

      const publicToken = crypto.randomBytes(32).toString('hex');
      const invResult = await pool.query<DbInvoice>(
        `INSERT INTO invoices (invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, currency, notes, billing_address, invoice_work_address_id, customer_reference, state, created_by, public_token)
         VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id, invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, total_paid, currency, notes, billing_address, invoice_work_address_id, customer_reference, state, created_at, updated_at, created_by`,
        [
          invoiceNumber,
          customerId,
          jobId,
          invoiceDateStr,
          dueDateStr,
          subtotal,
          taxAmount,
          totalAmount,
          currency,
          notes,
          billingAddress,
          invoiceWorkAddressId,
          custRef,
          targetState,
          userId,
          publicToken,
        ],
      );
      const inv = invResult.rows[0];
      const invId = inv.id;

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const qty = typeof item.quantity === 'number' ? item.quantity : 1;
        const price = typeof item.unit_price === 'number' ? item.unit_price : 0;
        const amount = qty * price;
        await pool.query(
          'INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, amount, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
          [invId, item.description || 'Item', qty, price, amount, i],
        );
      }

      await logInvoiceActivity(invId, 'created', { invoice_number: invoiceNumber }, userId);

      return res.status(201).json({
        invoice: {
          id: inv.id,
          invoice_number: inv.invoice_number,
          customer_id: inv.customer_id,
          job_id: inv.job_id ?? null,
          invoice_date: formatInvoiceDateFromDb(inv.invoice_date),
          due_date: formatInvoiceDateFromDb(inv.due_date),
          subtotal: parseFloat(inv.subtotal),
          tax_amount: parseFloat(inv.tax_amount),
          total_amount: parseFloat(inv.total_amount),
          total_paid: parseFloat(inv.total_paid),
          currency: inv.currency,
          state: inv.state,
          created_at: (inv.created_at as Date).toISOString(),
        },
      });
    } catch (error) {
      console.error('Create invoice from work address error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

app.post('/api/customers/:customerId/work-addresses', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const addressLine1 = typeof body.address_line_1 === 'string' ? body.address_line_1.trim() : '';
  if (!name || !addressLine1) return res.status(400).json({ message: 'Name and address line 1 are required' });
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : null);

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const inserted = await pool.query(
      `INSERT INTO customer_work_addresses (customer_id, name, branch_name, landlord, title, first_name, surname, company_name, address_line_1, address_line_2, address_line_3, town, county, postcode, landline, mobile, email, prefers_phone, prefers_sms, prefers_email, prefers_letter, uprn, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING id`,
      [
        customerId, name, str('branch_name'), str('landlord'), str('title'), str('first_name'), str('surname'), str('company_name'),
        addressLine1, str('address_line_2'), str('address_line_3'), str('town'), str('county'), str('postcode'), str('landline'),
        str('mobile'), str('email'), !!body.prefers_phone, !!body.prefers_sms, !!body.prefers_email,
        body.prefers_letter === undefined ? true : !!body.prefers_letter, str('uprn'), body.is_active === undefined ? true : !!body.is_active, userId,
      ],
    );
    return res.status(201).json({ work_address: { id: Number(inserted.rows[0].id) } });
  } catch (error) {
    console.error('Create customer work address error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/customers/:customerId/work-addresses/:workAddressId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const workAddressId = parseInt(String(req.params.workAddressId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(workAddressId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : undefined);
    const textFields = ['name', 'branch_name', 'landlord', 'title', 'first_name', 'surname', 'company_name', 'address_line_1', 'address_line_2', 'address_line_3', 'town', 'county', 'postcode', 'landline', 'mobile', 'email', 'uprn'];
    for (const f of textFields) {
      const v = str(f);
      if (v !== undefined) { updates.push(`${f} = $${idx++}`); values.push(v); }
    }
    if (body.prefers_phone !== undefined) { updates.push(`prefers_phone = $${idx++}`); values.push(!!body.prefers_phone); }
    if (body.prefers_sms !== undefined) { updates.push(`prefers_sms = $${idx++}`); values.push(!!body.prefers_sms); }
    if (body.prefers_email !== undefined) { updates.push(`prefers_email = $${idx++}`); values.push(!!body.prefers_email); }
    if (body.prefers_letter !== undefined) { updates.push(`prefers_letter = $${idx++}`); values.push(!!body.prefers_letter); }
    if (body.is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(!!body.is_active); }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

    updates.push('updated_at = NOW()');
    values.push(customerId, workAddressId);
    const result = await pool.query(
      `UPDATE customer_work_addresses SET ${updates.join(', ')} WHERE customer_id = $${idx++} AND id = $${idx} RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Work address not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Update customer work address error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/customers/:customerId/work-addresses/:workAddressId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const workAddressId = parseInt(String(req.params.workAddressId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(workAddressId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const result = await pool.query('DELETE FROM customer_work_addresses WHERE customer_id = $1 AND id = $2', [customerId, workAddressId]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Work address not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete customer work address error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/assets', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const groupBy = typeof req.query.group_by === 'string' ? req.query.group_by.trim() : '';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const params: unknown[] = [customerId];
    let whereClause = 'WHERE customer_id = $1';
    const workAddressId = typeof req.query.work_address_id === 'string' ? parseInt(req.query.work_address_id, 10) : null;
    if (workAddressId && Number.isFinite(workAddressId)) {
      whereClause += ` AND work_address_id = $${params.length + 1}`;
      params.push(workAddressId);
    } else {
      whereClause += ' AND work_address_id IS NULL';
    }
    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (asset_group ILIKE $${params.length} OR COALESCE(asset_type,'') ILIKE $${params.length} OR description ILIKE $${params.length} OR COALESCE(make,'') ILIKE $${params.length} OR COALESCE(model,'') ILIKE $${params.length} OR COALESCE(serial_number,'') ILIKE $${params.length} OR COALESCE(location,'') ILIKE $${params.length})`;
    }
    const orderBy = groupBy === 'group' ? 'ORDER BY asset_group ASC, created_at ASC' : 'ORDER BY created_at ASC';

    const result = await pool.query(
      `SELECT * FROM customer_assets ${whereClause} ${orderBy}`,
      params,
    );
    return res.json({ assets: result.rows });
  } catch (error) {
    console.error('Get customer assets error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/assets/:assetId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const assetId = parseInt(String(req.params.assetId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const result = await pool.query('SELECT * FROM customer_assets WHERE customer_id = $1 AND id = $2', [customerId, assetId]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Asset not found' });
    return res.json({ asset: result.rows[0] });
  } catch (error) {
    console.error('Get customer asset error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/customers/:customerId/assets', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  const assetGroup = typeof body.asset_group === 'string' ? body.asset_group.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!assetGroup || !description) return res.status(400).json({ message: 'Asset group and description are required' });
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : null);

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const workAddressId = await resolveWorkAddressIdForCustomer(pool, customerId, body.work_address_id);
    const inserted = await pool.query(
      `INSERT INTO customer_assets
       (customer_id, asset_group, asset_type, description, make, model, serial_number, photo_url, barcode, installed_by_us, under_warranty, is_functioning, location, work_address_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [customerId, assetGroup, str('asset_type'), description, str('make'), str('model'), str('serial_number'), str('photo_url'), str('barcode'), !!body.installed_by_us, !!body.under_warranty, str('is_functioning'), str('location'), workAddressId, userId],
    );
    return res.status(201).json({ asset: { id: Number(inserted.rows[0].id) } });
  } catch (error) {
    console.error('Create customer asset error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/customers/:customerId/assets/:assetId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const assetId = parseInt(String(req.params.assetId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : undefined);
    const textFields = ['asset_group', 'asset_type', 'description', 'make', 'model', 'serial_number', 'photo_url', 'barcode', 'is_functioning', 'location'];
    for (const f of textFields) {
      const v = str(f);
      if (v !== undefined) { updates.push(`${f} = $${idx++}`); values.push(v); }
    }
    if (body.installed_by_us !== undefined) { updates.push(`installed_by_us = $${idx++}`); values.push(!!body.installed_by_us); }
    if (body.under_warranty !== undefined) { updates.push(`under_warranty = $${idx++}`); values.push(!!body.under_warranty); }
    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

    updates.push('updated_at = NOW()');
    values.push(customerId, assetId);
    const result = await pool.query(
      `UPDATE customer_assets SET ${updates.join(', ')} WHERE customer_id = $${idx++} AND id = $${idx} RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Asset not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Update customer asset error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/customers/:customerId/assets/:assetId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const assetId = parseInt(String(req.params.assetId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const result = await pool.query('DELETE FROM customer_assets WHERE customer_id = $1 AND id = $2', [customerId, assetId]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Asset not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Delete customer asset error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/files', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const params: unknown[] = [customerId];
    let whereClause = 'WHERE f.customer_id = $1';
    const workAddressId = typeof req.query.work_address_id === 'string' ? parseInt(req.query.work_address_id, 10) : null;
    if (workAddressId && Number.isFinite(workAddressId)) {
      whereClause += ` AND f.work_address_id = $${params.length + 1}`;
      params.push(workAddressId);
    } else {
      whereClause += ' AND f.work_address_id IS NULL';
    }

    const result = await pool.query(
      `SELECT f.id, f.customer_id, f.work_address_id, f.original_filename, f.content_type, f.byte_size, f.created_at, f.created_by,
              COALESCE(u.full_name, u.email, 'User') AS created_by_name
       FROM customer_files f
       LEFT JOIN users u ON u.id = f.created_by
       ${whereClause}
       ORDER BY f.created_at DESC`,
      params,
    );

    return res.json({
      files: result.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        customer_id: Number(r.customer_id),
        work_address_id: r.work_address_id != null ? Number(r.work_address_id) : null,
        original_filename: String(r.original_filename ?? ''),
        content_type: (r.content_type as string) ?? null,
        byte_size: Number(r.byte_size),
        created_at: (r.created_at as Date).toISOString(),
        created_by: r.created_by != null ? Number(r.created_by) : null,
        created_by_name: (r.created_by_name as string) ?? 'User',
      })),
    });
  } catch (error) {
    console.error('List customer files error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/customers/:customerId/files', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;
  const filenameRaw = typeof body.filename === 'string' ? body.filename : '';
  const b64 = typeof body.content_base64 === 'string' ? body.content_base64.trim() : '';
  const contentType =
    typeof body.content_type === 'string' && body.content_type.trim() ? body.content_type.trim().slice(0, 255) : null;

  if (!filenameRaw.trim() || !b64) {
    return res.status(400).json({ message: 'filename and content_base64 are required' });
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return res.status(400).json({ message: 'Invalid base64 file data' });
  }
  if (buf.length === 0) return res.status(400).json({ message: 'Empty file' });
  if (buf.length > CUSTOMER_FILE_MAX_BYTES) {
    return res.status(400).json({ message: `File too large (max ${Math.round(CUSTOMER_FILE_MAX_BYTES / (1024 * 1024))} MB)` });
  }

  const originalFilename = sanitizeStoredOriginalName(filenameRaw);
  const ext = path.extname(originalFilename).slice(0, 32) || '';
  const storedFilename = `${Date.now()}_${crypto.randomBytes(12).toString('hex')}${ext}`;

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const workAddressId = await resolveWorkAddressIdForCustomer(pool, customerId, body.work_address_id);

    const dir = await ensureCustomerFilesDir(customerId);
    const fullPath = path.join(dir, storedFilename);
    await fs.writeFile(fullPath, buf);

    try {
      const inserted = await pool.query(
        `INSERT INTO customer_files (customer_id, work_address_id, original_filename, stored_filename, content_type, byte_size, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [customerId, workAddressId, originalFilename, storedFilename, contentType, buf.length, userId],
      );
      return res.status(201).json({
        file: {
          id: Number(inserted.rows[0].id),
          created_at: (inserted.rows[0].created_at as Date).toISOString(),
        },
      });
    } catch (dbErr) {
      await fs.unlink(fullPath).catch(() => {});
      throw dbErr;
    }
  } catch (error) {
    console.error('Upload customer file error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/files/:fileId/content', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const fileId = parseInt(String(req.params.fileId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(fileId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const row = await pool.query<{
      stored_filename: string;
      original_filename: string;
      content_type: string | null;
    }>('SELECT stored_filename, original_filename, content_type FROM customer_files WHERE id = $1 AND customer_id = $2', [fileId, customerId]);
    if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: 'File not found' });

    const dir = path.join(getCustomerFilesRootDir(), String(customerId));
    const fullPath = path.join(dir, row.rows[0].stored_filename);
    let data: Buffer;
    try {
      data = await fs.readFile(fullPath);
    } catch {
      return res.status(404).json({ message: 'File not found on disk' });
    }

    const ct = row.rows[0].content_type || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    const asciiName = String(row.rows[0].original_filename).replace(/[^\x20-\x7E]/g, '_') || 'download';
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"`);
    return res.send(data);
  } catch (error) {
    console.error('Download customer file error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/customers/:customerId/files/:fileId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const fileId = parseInt(String(req.params.fileId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(fileId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const row = await pool.query<{ stored_filename: string }>(
      'DELETE FROM customer_files WHERE id = $1 AND customer_id = $2 RETURNING stored_filename',
      [fileId, customerId],
    );
    if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: 'File not found' });

    const fullPath = path.join(getCustomerFilesRootDir(), String(customerId), row.rows[0].stored_filename);
    await fs.unlink(fullPath).catch(() => {});
    return res.status(204).send();
  } catch (error) {
    console.error('Delete customer file error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/site-report', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const waRaw = req.query.work_address_id;
  const waParsed = typeof waRaw === 'string' && waRaw.trim() ? parseInt(waRaw.trim(), 10) : null;
  if (waRaw != null && String(waRaw).trim() !== '' && !Number.isFinite(waParsed)) {
    return res.status(400).json({ message: 'Invalid work_address_id' });
  }

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const resolvedWa = waParsed && Number.isFinite(waParsed) ? await resolveWorkAddressIdForCustomer(pool, customerId, waParsed) : null;
    if (waParsed != null && Number.isFinite(waParsed) && resolvedWa == null) {
      return res.status(400).json({ message: 'Work address not found for this customer' });
    }

    const ownerUserId = Number(customer.rows[0].created_by);
    if (!Number.isFinite(ownerUserId)) return res.status(500).json({ message: 'Invalid customer owner' });
    const fraTemplateId = await ensureFireRiskAssessmentTemplate(pool, ownerUserId);
    const emptyDoc = normalizeTemplateSiteReportDocument(null, fraTemplateId);

    let row = await pool.query<{
      id: number;
      template_id: number | null;
      report_title: string | null;
      document: unknown;
      updated_at: Date;
    }>(
      `SELECT id, template_id, report_title, document, updated_at FROM customer_site_reports
       WHERE customer_id = $1 AND (
         ($2::integer IS NULL AND work_address_id IS NULL)
         OR (work_address_id = $2)
       )`,
      [customerId, resolvedWa],
    );
    if ((row.rowCount ?? 0) === 0) {
      try {
        const ins = await pool.query<{
          id: number;
          template_id: number | null;
          report_title: string | null;
          document: unknown;
          updated_at: Date;
        }>(
          `INSERT INTO customer_site_reports (customer_id, work_address_id, report_title, document, template_id, created_by, updated_by)
           VALUES ($1, $2, NULL, $3::jsonb, $4, $5, $5)
           RETURNING id, template_id, report_title, document, updated_at`,
          [customerId, resolvedWa, JSON.stringify(emptyDoc), fraTemplateId, userId],
        );
        row = ins;
      } catch (insErr: unknown) {
        const code = insErr && typeof insErr === 'object' && 'code' in insErr ? (insErr as { code?: string }).code : '';
        if (code !== '23505') throw insErr;
        row = await pool.query<{
          id: number;
          template_id: number | null;
          report_title: string | null;
          document: unknown;
          updated_at: Date;
        }>(
          `SELECT id, template_id, report_title, document, updated_at FROM customer_site_reports
           WHERE customer_id = $1 AND (
             ($2::integer IS NULL AND work_address_id IS NULL)
             OR (work_address_id = $2)
           )`,
          [customerId, resolvedWa],
        );
      }
    }

    const r0 = row.rows[0];
    const rawDoc = r0.document;
    const needsMigrate =
      r0.template_id == null ||
      !rawDoc ||
      typeof rawDoc !== 'object' ||
      (rawDoc as Record<string, unknown>).mode !== 'template_v1';
    if (needsMigrate) {
      const fresh = normalizeTemplateSiteReportDocument(null, fraTemplateId);
      await pool.query(
        `UPDATE customer_site_reports SET template_id = $1, document = $2::jsonb, updated_by = $3, updated_at = NOW() WHERE id = $4`,
        [fraTemplateId, JSON.stringify(fresh), userId, r0.id],
      );
    }

    const rFinal = await pool.query<{
      id: number;
      template_id: number | null;
      report_title: string | null;
      document: unknown;
      updated_at: Date;
    }>('SELECT id, template_id, report_title, document, updated_at FROM customer_site_reports WHERE id = $1', [r0.id]);
    const r = rFinal.rows[0];
    const tid = r.template_id != null ? Number(r.template_id) : fraTemplateId;
    const doc = normalizeTemplateSiteReportDocument(r.document, tid);
    const def = await fetchTemplateDefinition(pool, tid, ownerUserId);
    if (!def) return res.status(500).json({ message: 'Site report template could not be loaded' });

    return res.json({
      report: {
        id: Number(r.id),
        customer_id: customerId,
        work_address_id: resolvedWa,
        template_id: tid,
        report_title: r.report_title,
        document: doc,
        updated_at: (r.updated_at as Date).toISOString(),
      },
      template: { id: tid, definition: def },
    });
  } catch (error) {
    console.error('Get customer site report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/customers/:customerId/site-report', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;

  const waParsed =
    body.work_address_id === undefined || body.work_address_id === null || body.work_address_id === ''
      ? null
      : typeof body.work_address_id === 'number' && Number.isFinite(body.work_address_id)
        ? Math.trunc(body.work_address_id as number)
        : typeof body.work_address_id === 'string' && String(body.work_address_id).trim()
          ? parseInt(String(body.work_address_id).trim(), 10)
          : NaN;
  if (body.work_address_id != null && String(body.work_address_id).trim() !== '' && !Number.isFinite(waParsed)) {
    return res.status(400).json({ message: 'Invalid work_address_id' });
  }

  const reportIdRaw = body.report_id;
  const reportId =
    typeof reportIdRaw === 'number' && Number.isFinite(reportIdRaw)
      ? Math.trunc(reportIdRaw)
      : typeof reportIdRaw === 'string' && String(reportIdRaw).trim()
        ? parseInt(String(reportIdRaw).trim(), 10)
        : NaN;
  if (!Number.isFinite(reportId)) return res.status(400).json({ message: 'report_id is required' });

  const reportTitle =
    typeof body.report_title === 'string' ? body.report_title.trim().slice(0, 500) : body.report_title === null ? null : undefined;

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const ownerUserId = Number(customer.rows[0].created_by);
    const fraTemplateId = await ensureFireRiskAssessmentTemplate(pool, ownerUserId);

    const resolvedWa = waParsed && Number.isFinite(waParsed) ? await resolveWorkAddressIdForCustomer(pool, customerId, waParsed) : null;
    if (waParsed != null && Number.isFinite(waParsed) && resolvedWa == null) {
      return res.status(400).json({ message: 'Work address not found for this customer' });
    }

    const own = await pool.query<{ id: number; template_id: number | null }>(
      `SELECT id, template_id FROM customer_site_reports WHERE id = $1 AND customer_id = $2 AND (
         ($3::integer IS NULL AND work_address_id IS NULL)
         OR (work_address_id = $3)
       )`,
      [reportId, customerId, resolvedWa],
    );
    if ((own.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Report not found' });

    const templateIdForDoc =
      own.rows[0].template_id != null && Number.isFinite(Number(own.rows[0].template_id))
        ? Number(own.rows[0].template_id)
        : fraTemplateId;
    const documentNorm = normalizeTemplateSiteReportDocument(body.document, templateIdForDoc);
    documentNorm.template_id = templateIdForDoc;
    if (documentNorm.mode !== 'template_v1') {
      return res.status(400).json({ message: 'Invalid document: expected template_v1 payload' });
    }

    const okImages = await assertSiteReportTemplateImageIdsBelongToReport(pool, reportId, documentNorm);
    if (!okImages) return res.status(400).json({ message: 'One or more image references are invalid for this report' });

    const updates: string[] = ['document = $1::jsonb', 'updated_at = NOW()', 'updated_by = $2'];
    const vals: unknown[] = [JSON.stringify(documentNorm), userId];
    let idx = 3;
    if (reportTitle !== undefined) {
      updates.push(`report_title = $${idx++}`);
      vals.push(reportTitle);
    }
    vals.push(reportId, customerId);
    await pool.query(
      `UPDATE customer_site_reports SET ${updates.join(', ')} WHERE id = $${idx++} AND customer_id = $${idx}`,
      vals,
    );

    const r = await pool.query<{
      report_title: string | null;
      document: unknown;
      updated_at: Date;
      template_id: number | null;
    }>('SELECT report_title, document, updated_at, template_id FROM customer_site_reports WHERE id = $1', [reportId]);
    const row = r.rows[0];
    const tid = row.template_id != null ? Number(row.template_id) : templateIdForDoc;
    const doc = normalizeTemplateSiteReportDocument(row.document, tid);
    const def = await fetchTemplateDefinition(pool, tid, ownerUserId);
    if (!def) return res.status(500).json({ message: 'Site report template could not be loaded' });
    return res.json({
      report: {
        id: reportId,
        customer_id: customerId,
        work_address_id: resolvedWa,
        template_id: tid,
        report_title: row.report_title,
        document: doc,
        updated_at: (row.updated_at as Date).toISOString(),
      },
      template: { id: tid, definition: def },
    });
  } catch (error) {
    console.error('Put customer site report error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/customers/:customerId/site-report/:reportId/images', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const reportId = parseInt(String(req.params.reportId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(reportId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;
  const filenameRaw = typeof body.filename === 'string' ? body.filename : '';
  const b64 = typeof body.content_base64 === 'string' ? body.content_base64.trim() : '';
  const contentType =
    typeof body.content_type === 'string' && body.content_type.trim() ? body.content_type.trim().slice(0, 255) : null;

  if (!filenameRaw.trim() || !b64) {
    return res.status(400).json({ message: 'filename and content_base64 are required' });
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return res.status(400).json({ message: 'Invalid base64 file data' });
  }
  if (buf.length === 0) return res.status(400).json({ message: 'Empty file' });
  if (buf.length > CUSTOMER_FILE_MAX_BYTES) {
    return res.status(400).json({ message: `File too large (max ${Math.round(CUSTOMER_FILE_MAX_BYTES / (1024 * 1024))} MB)` });
  }

  const originalFilename = sanitizeStoredOriginalName(filenameRaw);
  const ext = path.extname(originalFilename).slice(0, 32) || '';
  const storedFilename = `${Date.now()}_${crypto.randomBytes(12).toString('hex')}${ext}`;

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const rep = await pool.query<{ id: number }>(
      'SELECT id FROM customer_site_reports WHERE id = $1 AND customer_id = $2',
      [reportId, customerId],
    );
    if ((rep.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Report not found' });

    const dir = await ensureCustomerSiteReportImageDir(customerId, reportId);
    const fullPath = path.join(dir, storedFilename);
    await fs.writeFile(fullPath, buf);

    try {
      const inserted = await pool.query(
        `INSERT INTO customer_site_report_images (report_id, stored_filename, original_filename, content_type, byte_size, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [reportId, storedFilename, originalFilename, contentType, buf.length, userId],
      );
      return res.status(201).json({
        image: {
          id: Number(inserted.rows[0].id),
          created_at: (inserted.rows[0].created_at as Date).toISOString(),
        },
      });
    } catch (dbErr) {
      await fs.unlink(fullPath).catch(() => {});
      throw dbErr;
    }
  } catch (error) {
    console.error('Upload customer site report image error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/site-report/:reportId/images/:imageId/content', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const reportId = parseInt(String(req.params.reportId), 10);
  const imageId = parseInt(String(req.params.imageId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(reportId) || !Number.isFinite(imageId)) {
    return res.status(400).json({ message: 'Invalid id' });
  }
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const row = await pool.query<{
      stored_filename: string;
      original_filename: string;
      content_type: string | null;
    }>(
      `SELECT i.stored_filename, i.original_filename, i.content_type
       FROM customer_site_report_images i
       INNER JOIN customer_site_reports r ON r.id = i.report_id
       WHERE i.id = $1 AND i.report_id = $2 AND r.customer_id = $3`,
      [imageId, reportId, customerId],
    );
    if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Image not found' });

    const fullPath = path.join(getCustomerSiteReportImagesRootDir(), String(customerId), String(reportId), row.rows[0].stored_filename);
    let data: Buffer;
    try {
      data = await fs.readFile(fullPath);
    } catch {
      return res.status(404).json({ message: 'Image not found on disk' });
    }

    const ct = row.rows[0].content_type || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    return res.send(data);
  } catch (error) {
    console.error('Get customer site report image error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/customers/:customerId/site-report/:reportId/images/:imageId', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const reportId = parseInt(String(req.params.reportId), 10);
  const imageId = parseInt(String(req.params.imageId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(reportId) || !Number.isFinite(imageId)) {
    return res.status(400).json({ message: 'Invalid id' });
  }
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const row = await pool.query<{ stored_filename: string }>(
      `DELETE FROM customer_site_report_images i
       USING customer_site_reports r
       WHERE i.id = $1 AND i.report_id = $2 AND i.report_id = r.id AND r.customer_id = $3
       RETURNING i.stored_filename`,
      [imageId, reportId, customerId],
    );
    if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Image not found' });

    const fullPath = path.join(getCustomerSiteReportImagesRootDir(), String(customerId), String(reportId), row.rows[0].stored_filename);
    await fs.unlink(fullPath).catch(() => {});
    return res.status(204).send();
  } catch (error) {
    console.error('Delete customer site report image error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/site-report/:reportId/pdf', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const reportId = parseInt(String(req.params.reportId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(reportId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const ownerUserId = Number(customer.rows[0].created_by);
    if (!Number.isFinite(ownerUserId)) return res.status(500).json({ message: 'Invalid customer owner' });

    const { pdf, filenameBase } = await generateCustomerSiteReportPdfBuffer(pool, {
      customerId,
      reportId,
      ownerUserId,
    });
    const asciiName = `${filenameBase.replace(/[^\x20-\x7E]/g, '_') || 'site-report'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"`);
    res.setHeader('Content-Length', String(pdf.length));
    return res.send(pdf);
  } catch (error: unknown) {
    if (error instanceof PdfRenderUnavailableError) {
      return res.status(503).json({ message: error.message });
    }
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'REPORT_NOT_FOUND') return res.status(404).json({ message: 'Report not found' });
    if (msg === 'INVALID_DOCUMENT' || msg === 'TEMPLATE_NOT_FOUND' || msg === 'INVALID_TEMPLATE') {
      return res.status(400).json({ message: 'Report data is incomplete. Save the report in the app and try again.' });
    }
    console.error('Customer site report PDF error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/import/customers-sites', authenticate, requireAdmin, requirePermission('settings_master_data'), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getTenantScopeUserId(req.user!);
  const body = req.body as Record<string, unknown>;
  const customers = Array.isArray(body.customers) ? (body.customers as Record<string, unknown>[]) : [];
  const sites = Array.isArray(body.sites) ? (body.sites as Record<string, unknown>[]) : [];

  const norm = (s: unknown) => String(typeof s === 'string' ? s : '').trim();
  const normKey = (s: unknown) => norm(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const asBool = (v: unknown) => {
    const t = norm(v).toLowerCase();
    if (t === 'yes' || t === 'true' || t === '1') return true;
    if (t === 'no' || t === 'false' || t === '0') return false;
    return null;
  };

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const customerIdByKey = new Map<string, number>();
      let createdCustomers = 0;
      let createdWorkAddresses = 0;

      for (const c of customers) {
        const fullName = norm(c.full_name) || norm(c.customer_name) || norm(c.name) || 'Imported customer';
        const emailRaw = norm(c.email) || norm(c.email_address);
        const email = emailRaw || `imported+${Date.now()}-${Math.random().toString(16).slice(2)}@workpilot.local`;

        const phone = norm(c.phone) || norm(c.mobile) || norm(c.mobile_number) || null;
        const landline = norm(c.landline) || norm(c.phone_number) || null;
        const company = norm(c.company) || null;
        const leadSource = norm(c.lead_source) || null;

        const address1 = norm(c.address_line_1) || norm(c.physical_address_street) || null;
        const town = norm(c.town) || norm(c.physical_address_city) || null;
        const county = norm(c.county) || norm(c.physical_address_region) || null;
        const postcode = norm(c.postcode) || norm(c.physical_address_postal_code) || null;
        const country = norm(c.country) || norm(c.physical_address_country) || null;

        const contactName = norm(c.contact_name);
        const [contactFirstName, ...restSurname] = contactName ? contactName.split(' ') : [];
        const contactSurname = restSurname.join(' ').trim();

        const status = (() => {
          const archived = asBool(c.archived);
          if (archived === true) return 'INACTIVE';
          return 'ACTIVE';
        })();

        const inserted = await client.query(
          `INSERT INTO customers
           (full_name, email, phone, company, status, lead_source, address_line_1, town, county, postcode, country, landline,
            contact_first_name, contact_surname, contact_email, contact_mobile, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           RETURNING id`,
          [
            fullName,
            email,
            phone,
            company,
            status,
            leadSource,
            address1,
            town,
            county,
            postcode,
            country,
            landline,
            contactFirstName || null,
            contactSurname || null,
            emailRaw || null,
            phone,
            userId,
          ],
        );

        const newId = Number(inserted.rows[0].id);
        createdCustomers++;
        customerIdByKey.set(normKey(fullName), newId);
      }

      const missingCustomerSites: { site_name: string; customer: string }[] = [];
      for (const s of sites) {
        const customerName = norm(s.customer) || norm(s.customer_name) || '';
        const key = normKey(customerName);
        const customerId = customerIdByKey.get(key);
        if (!customerId) {
          missingCustomerSites.push({ site_name: norm(s.site_name) || norm(s.name) || 'Site', customer: customerName || '(blank)' });
          continue;
        }

        const siteName = norm(s.site_name) || norm(s.name) || norm(s.address_street) || 'Imported site';
        const addr1 = norm(s.address_line_1) || norm(s.address_street) || 'Unknown address';
        const town = norm(s.town) || norm(s.address_city) || null;
        const county = norm(s.county) || norm(s.address_region) || null;
        const postcode = norm(s.postcode) || norm(s.address_postal_code) || null;
        // customer_work_addresses schema doesn't have a country column (keep in address fields if needed later)

        const contactName = norm(s.contact_name);
        const [firstName, ...rest] = contactName ? contactName.split(' ') : [];
        const surname = rest.join(' ').trim();

        const email = norm(s.email) || norm(s.email_address) || null;
        const mobile = norm(s.mobile) || norm(s.mobile_number) || null;
        const landline = norm(s.landline) || norm(s.phone_number) || null;
        const archived = asBool(s.archived);
        const isActive = archived === true ? false : true;

        await client.query(
          `INSERT INTO customer_work_addresses
           (customer_id, name, address_line_1, town, county, postcode, email, mobile, landline,
            first_name, surname, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            customerId,
            siteName,
            addr1,
            town,
            county,
            postcode,
            email,
            mobile,
            landline,
            firstName || null,
            surname || null,
            isActive,
            userId,
          ],
        );
        createdWorkAddresses++;
      }

      await client.query('COMMIT');
      return res.status(201).json({
        created_customers: createdCustomers,
        created_work_addresses: createdWorkAddresses,
        skipped_sites_missing_customer: missingCustomerSites.slice(0, 50),
        skipped_sites_missing_customer_count: missingCustomerSites.length,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Import customers+sites error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/communications', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });

  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';
  const createdBy = typeof req.query.created_by === 'string' ? parseInt(req.query.created_by, 10) : null;
  const objectType = typeof req.query.object_type === 'string' ? req.query.object_type.trim() : '';
  const fromDate = typeof req.query.from_date === 'string' ? req.query.from_date.trim() : '';
  const toDate = typeof req.query.to_date === 'string' ? req.query.to_date.trim() : '';

  try {
    const customer = await pool.query('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    const c = customer.rows[0] as { created_by: number | null };
    if (!isSuperAdmin && c.created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const conditions: string[] = ['cc.customer_id = $1'];
    const params: unknown[] = [customerId];
    let p = 2;

    const workAddressId = typeof req.query.work_address_id === 'string' ? parseInt(req.query.work_address_id, 10) : null;
    if (workAddressId && Number.isFinite(workAddressId)) {
      conditions.push(`cc.work_address_id = $${p++}`);
      params.push(workAddressId);
    } else {
      conditions.push(`cc.work_address_id IS NULL`);
    }

    if (type && ['note', 'email', 'sms', 'phone', 'schedule'].includes(type)) {
      conditions.push(`cc.record_type = $${p++}`);
      params.push(type);
    }
    if (createdBy && Number.isFinite(createdBy)) {
      conditions.push(`cc.created_by = $${p++}`);
      params.push(createdBy);
    }
    if (objectType && ['customer', 'job', 'invoice', 'property', 'branch', 'asset'].includes(objectType)) {
      conditions.push(`cc.object_type = $${p++}`);
      params.push(objectType);
    }
    if (fromDate) {
      conditions.push(`DATE(cc.created_at) >= $${p++}`);
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push(`DATE(cc.created_at) <= $${p++}`);
      params.push(toDate);
    }
    if (search) {
      conditions.push(`(cc.subject ILIKE $${p} OR cc.message ILIKE $${p} OR cc.to_value ILIKE $${p} OR cc.cc_value ILIKE $${p} OR cc.bcc_value ILIKE $${p} OR cc.from_value ILIKE $${p} OR cc.attachment_name ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const result = await pool.query(
      `SELECT cc.id, cc.customer_id, cc.record_type, cc.subject, cc.message, cc.status, cc.to_value, cc.cc_value, cc.bcc_value, cc.from_value, cc.object_type, cc.object_id, cc.attachment_name, cc.scheduled_for, cc.created_at, cc.created_by,
              COALESCE(u.full_name, u.email, 'System') AS created_by_name
       FROM customer_communications cc
       LEFT JOIN users u ON u.id = cc.created_by
       ${whereClause}
       ORDER BY cc.created_at DESC`,
      params,
    );

    const users = await pool.query(
      `SELECT DISTINCT u.id, COALESCE(u.full_name, u.email) AS label
       FROM customer_communications cc
       JOIN users u ON u.id = cc.created_by
       WHERE cc.customer_id = $1
       ORDER BY label ASC`,
      [customerId],
    );

    return res.json({
      communications: result.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        customer_id: Number(r.customer_id),
        record_type: r.record_type as string,
        subject: (r.subject as string) ?? null,
        message: (r.message as string) ?? null,
        status: (r.status as string) ?? null,
        to_value: (r.to_value as string) ?? null,
        cc_value: (r.cc_value as string) ?? null,
        bcc_value: (r.bcc_value as string) ?? null,
        from_value: (r.from_value as string) ?? null,
        object_type: (r.object_type as string) ?? 'customer',
        object_id: r.object_id != null ? Number(r.object_id) : null,
        attachment_name: (r.attachment_name as string) ?? null,
        scheduled_for: r.scheduled_for ? (r.scheduled_for as Date).toISOString() : null,
        created_at: (r.created_at as Date).toISOString(),
        created_by: r.created_by != null ? Number(r.created_by) : null,
        created_by_name: (r.created_by_name as string) ?? 'System',
      })),
      created_by_options: users.rows.map((u: Record<string, unknown>) => ({
        id: Number(u.id),
        label: (u.label as string) ?? 'User',
      })),
    });
  } catch (error) {
    console.error('Get customer communications error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/customers/:customerId/communications', authenticate, requireTenantCrmAccess('customers'), async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = getTenantScopeUserId(req.user!);
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as Record<string, unknown>;
  const recordType = typeof body.record_type === 'string' ? body.record_type.trim() : '';
  if (!['note', 'email', 'sms', 'phone', 'schedule'].includes(recordType)) {
    return res.status(400).json({ message: 'Invalid communication type' });
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() || null : null;
  const message = typeof body.message === 'string' ? body.message.trim() || null : null;
  const status = typeof body.status === 'string' ? body.status.trim() || null : null;
  const toValue = typeof body.to_value === 'string' ? body.to_value.trim() || null : null;
  const ccValue = typeof body.cc_value === 'string' ? body.cc_value.trim() || null : null;
  const bccValue = typeof body.bcc_value === 'string' ? body.bcc_value.trim() || null : null;
  const fromValue = typeof body.from_value === 'string' ? body.from_value.trim() || null : null;
  const objectType = typeof body.object_type === 'string' ? body.object_type.trim() || 'customer' : 'customer';
  const objectId = typeof body.object_id === 'number' && Number.isFinite(body.object_id) ? body.object_id : null;
  const attachmentName = typeof body.attachment_name === 'string' ? body.attachment_name.trim() || null : null;
  const scheduledFor = typeof body.scheduled_for === 'string' && body.scheduled_for ? new Date(body.scheduled_for) : null;

  if (!message && !subject) return res.status(400).json({ message: 'Subject or message is required' });
  if (!['customer', 'job', 'invoice', 'property', 'branch', 'asset'].includes(objectType)) {
    return res.status(400).json({ message: 'Invalid object type' });
  }

  try {
    const customer = await pool.query('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    const c = customer.rows[0] as { created_by: number | null };
    if (!isSuperAdmin && c.created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const workAddressId = await resolveWorkAddressIdForCustomer(pool, customerId, body.work_address_id);
    const result = await pool.query(
      `INSERT INTO customer_communications
        (customer_id, record_type, subject, message, status, to_value, cc_value, bcc_value, from_value, object_type, object_id, attachment_name, scheduled_for, work_address_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, created_at`,
      [customerId, recordType, subject, message, status, toValue, ccValue, bccValue, fromValue, objectType, objectId, attachmentName, scheduledFor, workAddressId, userId],
    );

    return res.status(201).json({
      communication: {
        id: Number(result.rows[0].id),
        created_at: (result.rows[0].created_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Create customer communication error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      const rawMs = process.env.SERVICE_REMINDER_INTERVAL_MS;
      const parsed = rawMs != null && String(rawMs).trim() !== '' ? parseInt(String(rawMs), 10) : NaN;
      const intervalMs = Number.isFinite(parsed) && parsed >= 60_000 ? parsed : 6 * 60 * 60 * 1000;
      const tick = () => {
        runAllScheduledReminders(pool, {
          loadEmailSettingsPayload,
          sendUserEmail,
          runServiceCustomerReminders: runAutomatedServiceReminders,
        })
          .then((r) => {
            const loggable =
              r.service_reminders.sent > 0 ||
              r.service_reminders.errors.length > 0 ||
              r.job_office_task_reminders.sent > 0 ||
              r.job_office_task_reminders.errors.length > 0 ||
              r.staff_reminders.sent > 0 ||
              r.staff_reminders.errors.length > 0;
            if (loggable) console.log('[scheduled-reminders]', r);
          })
          .catch((e) => console.error('[scheduled-reminders]', e));
      };
      setTimeout(tick, 90_000);
      setInterval(tick, intervalMs);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });

app.get('/api/public/invoices/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token) return res.status(400).json({ message: 'Token required' });

  try {
    const invResult = await pool.query<any>(
      `SELECT i.*, 
              c.full_name AS customer_full_name, 
              c.email AS customer_email, 
              c.phone AS customer_phone, 
              c.address AS address,
              c.address_line_1, c.address_line_2, c.address_line_3, 
              c.town, c.county, c.postcode, 
              c.city, c.region, c.country,
              ct.name AS customer_type_name
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN customer_types ct ON ct.id = c.customer_type_id
       WHERE i.public_token = $1`,
      [token]
    );

    if ((invResult.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
    const rawInv = invResult.rows[0];
    const customer_address = formatCustomerAddressSingleLine(rawInv);

    // Resolve work/site address (same logic as dashboard detail endpoint)
    let workSiteName: string | null = null;
    let workSiteAddress: string | null = null;
    if (rawInv.invoice_work_address_id) {
      const waRes = await pool.query('SELECT * FROM customer_work_addresses WHERE id = $1 AND customer_id = $2', [
        rawInv.invoice_work_address_id,
        rawInv.customer_id,
      ]);
      if ((waRes.rowCount ?? 0) > 0) {
        const wa = waRes.rows[0] as Record<string, unknown>;
        const n = typeof wa.name === 'string' ? wa.name.trim() : '';
        workSiteName = n || null;
        const addrOnly = formatWorkAddressSingleLineWithoutName(wa).trim();
        workSiteAddress = addrOnly || null;
      }
      if (!workSiteName && !workSiteAddress && rawInv.billing_address?.trim()) {
        workSiteAddress = workSiteAddressAsSingleLine(rawInv.billing_address.trim());
      }
    }

    const invoice = {
      ...rawInv,
      customer_address, // override with formatted
      work_site_name: workSiteName,
      work_site_address: workSiteAddress,
    };

    const itemsResult = await pool.query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order ASC, id ASC',
      [invoice.id]
    );

    // Load business settings for logo/info (using the creator's ID as a proxy for the org)
    const creatorId = invoice.created_by || 1;
    const invSettings = await getInvoiceSettings(creatorId);

    res.json({
      invoice: {
        ...invoice,
        settings: invSettings,
      },
      line_items: itemsResult.rows,
      business: {
        logo: invSettings.company_logo,
        name: invSettings.company_name,
        address: invSettings.company_address,
      }
    });
  } catch (error: any) {
    console.error('Public invoice fetch error:', error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  }
});

app.get('/api/public/quotations/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token) return res.status(400).json({ message: 'Token required' });

  try {
    const qResult = await pool.query<
      DbQuotation & {
        customer_full_name?: string | null;
        customer_email?: string | null;
        customer_phone?: string | null;
        address_line_1?: string | null;
        address_line_2?: string | null;
        address_line_3?: string | null;
        town?: string | null;
        county?: string | null;
        postcode?: string | null;
        address?: string | null;
        city?: string | null;
        region?: string | null;
        country?: string | null;
      }
    >(
      `SELECT q.*,
              c.full_name AS customer_full_name,
              c.email AS customer_email,
              c.phone AS customer_phone,
              c.address_line_1, c.address_line_2, c.address_line_3,
              c.town, c.county, c.postcode,
              c.address, c.city, c.region, c.country
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       WHERE q.public_token = $1`,
      [token],
    );

    if ((qResult.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Quotation not found' });
    const rawQ = qResult.rows[0];
    const customer_address = formatCustomerAddressSingleLine(rawQ as unknown as Record<string, unknown>);
    const workSite = await resolveWorkSiteDisplayForCustomer(
      rawQ.customer_id,
      rawQ.quotation_work_address_id,
      rawQ.billing_address,
    );

    const itemsResult = await pool.query(
      'SELECT id, description, quantity, unit_price, amount, sort_order FROM quotation_line_items WHERE quotation_id = $1 ORDER BY sort_order ASC, id ASC',
      [rawQ.id],
    );

    const creatorId = rawQ.created_by || 1;
    const mergedSettings = await getQuotationSettings(creatorId);

    const quotation = {
      id: rawQ.id,
      quotation_number: rawQ.quotation_number,
      customer_id: rawQ.customer_id,
      customer_full_name: rawQ.customer_full_name ?? null,
      customer_email: rawQ.customer_email ?? null,
      customer_phone: rawQ.customer_phone ?? null,
      customer_address,
      quotation_work_address_id: rawQ.quotation_work_address_id ?? null,
      work_site_name: workSite.work_site_name,
      work_site_address: workSite.work_site_address,
      quotation_custom_address: workSite.quotation_custom_address,
      quotation_date: (rawQ.quotation_date as Date).toISOString().slice(0, 10),
      valid_until: (rawQ.valid_until as Date).toISOString().slice(0, 10),
      subtotal: parseFloat(rawQ.subtotal),
      tax_amount: parseFloat(rawQ.tax_amount),
      total_amount: parseFloat(rawQ.total_amount),
      currency: rawQ.currency,
      notes: rawQ.notes ?? null,
      description: rawQ.description ?? null,
      billing_address: rawQ.billing_address ?? null,
      state: rawQ.state,
      settings: mergedSettings,
    };

    const line_items = itemsResult.rows.map((row: { id: number; description: string; quantity: string; unit_price: string; amount: string; sort_order: number }) => ({
      id: row.id,
      description: row.description,
      quantity: parseFloat(row.quantity),
      unit_price: parseFloat(row.unit_price),
      amount: parseFloat(row.amount),
      sort_order: row.sort_order,
    }));

    res.json({
      quotation,
      line_items,
      business: {
        logo: mergedSettings.company_logo,
        name: mergedSettings.company_name,
        address: mergedSettings.company_address,
      },
    });
  } catch (error: unknown) {
    console.error('Public quotation fetch error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ message: 'Internal server error', details: msg });
  }
});

mountTenantStaffRoutes(app, { pool, authenticate });
mountTenantTeamRoutes(app, { pool, authenticate });
mountJobEmailRoutes(app, { pool, authenticate, loadEmailSettingsPayload, sendUserEmail });
mountJobFilesRoutes(app, { pool, authenticate });

mountJobClientPanelRoutes(app, {
  pool,
  authenticate,
  getQuotationSettings,
  formatCustomerAddressSingleLine,
  loadEmailSettingsPayload,
  sendUserEmail,
  getPublicAppBaseUrl,
});
