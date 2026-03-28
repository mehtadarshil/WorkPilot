import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { Pool, PoolConfig } from 'pg';
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
import { generateInvoicePdfBuffer } from './invoicePdf';
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

dotenv.config({ path: path.resolve(__dirname, '../.env') });

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

type UserRole = 'SUPER_ADMIN' | 'ADMIN';
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
  billing_address: string | null;
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
}

interface JwtPayload {
  userId: number;
  email: string;
  role: UserRole;
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
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_source VARCHAR(255);`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_book_id INTEGER REFERENCES price_books(id) ON DELETE SET NULL;`);

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
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expected_completion TIMESTAMP WITH TIME ZONE`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_service_items JSONB NOT NULL DEFAULT '[]'::jsonb`);

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
      public_token VARCHAR(100) UNIQUE
    );
  `);

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
      public_token VARCHAR(100) UNIQUE
    );
  `);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS public_token VARCHAR(100) UNIQUE;`);
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
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN')) {
    return res.status(403).json({ message: 'Forbidden: Admin access required' });
  }
  next();
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

  try {
    const result = await pool.query<DbUser>(
      'SELECT id, email, password_hash, role, full_name, company_name, phone, service_plan, status, address, notes FROM users WHERE email = $1',
      [email],
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);

    const responseUser: Record<string, unknown> = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
    if (user.role === 'ADMIN') {
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
  return res.json({ user: req.user });
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

app.get('/api/customers', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(5000, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const statusFilter = typeof req.query.status === 'string' && CUSTOMER_STATUSES.includes(req.query.status as typeof CUSTOMER_STATUSES[number])
      ? req.query.status
      : '';
    const offset = (page - 1) * limit;
    const userId = req.user!.userId;
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
              prefers_email, prefers_letter, lead_source, price_book_id,
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

app.get('/api/customers/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  
  const userId = req.user!.userId;
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
    
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Get customer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/customers', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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
  if (!fullName || !email) return res.status(400).json({ message: 'Full name and email are required' });
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
  
  const createdBy = req.user!.userId;

  try {
    const result = await pool.query<any>(
      `INSERT INTO customers (
         full_name, email, phone, company, address, city, region, country, status, notes, customer_type_id,
         address_line_1, address_line_2, address_line_3, town, county, postcode, landline, credit_days,
         contact_title, contact_first_name, contact_surname, contact_position, contact_mobile, contact_landline, contact_email,
         prefers_phone, prefers_sms, prefers_email, prefers_letter, lead_source, price_book_id,
         created_by
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19,
         $20, $21, $22, $23, $24, $25, $26,
         $27, $28, $29, $30, $31, $32, $33
       )
       RETURNING *`,
      [
        fullName, email, phone, company, address, city, region, country, status, notes, customerTypeId,
        addressLine1, addressLine2, addressLine3, town, county, postcode, landline, creditDays,
        contactTitle, contactFirstName, contactSurname, contactPosition, contactMobile, contactLandline, contactEmail,
        prefersPhone, prefersSms, prefersEmail, prefersLetter, leadSource, priceBookId,
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

app.patch('/api/customers/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid customer id' });

  const userId = req.user!.userId;
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
  if (str('lead_source') !== undefined) { updates.push(`lead_source = $${idx++}`); values.push(str('lead_source')); }
  if (body.price_book_id !== undefined) { updates.push(`price_book_id = $${idx++}`); values.push(typeof body.price_book_id === 'number' ? body.price_book_id : null); }

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

app.delete('/api/customers/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid customer id' });
  const userId = req.user!.userId;
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

app.get('/api/officers', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const stateFilter = typeof req.query.state === 'string' && OFFICER_STATES.includes(req.query.state as typeof OFFICER_STATES[number])
      ? req.query.state
      : '';
    const offset = (page - 1) * limit;
    const userId = req.user!.userId;
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
    const listResult = await pool.query<DbOfficer>(
      `SELECT id, full_name, role_position, department, phone, email, system_access_level, certifications, assigned_responsibilities, state, created_at, updated_at, created_by
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

app.get('/api/officers/list', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
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

app.post('/api/officers', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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
  const createdBy = req.user!.userId;

  try {
    const result = await pool.query<DbOfficer>(
      `INSERT INTO officers (full_name, role_position, department, phone, email, system_access_level, certifications, assigned_responsibilities, state, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, full_name, role_position, department, phone, email, system_access_level, certifications, assigned_responsibilities, state, created_at, updated_at, created_by`,
      [fullName, rolePosition, department, phone, email, systemAccessLevel, certifications, assignedResponsibilities, state, createdBy],
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
      },
    });
  } catch (error) {
    console.error('Create officer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/officers/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid officer id' });

  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const ownershipCheck = isSuperAdmin ? '' : ' AND created_by = $1';

  const body = req.body as Record<string, unknown>;
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : undefined);
  const strReq = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : undefined);
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
    const result = await pool.query<DbOfficer>(
      `UPDATE officers SET ${updates.join(', ')} WHERE id = $${idParamIdx}${ownershipClause} RETURNING *`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Officer not found' });
    const r = result.rows[0];
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
      },
    });
  } catch (error) {
    console.error('Update officer error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/officers/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid officer id' });
  const userId = req.user!.userId;
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
app.get('/api/certifications', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.post('/api/certifications', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as { name?: string; description?: string; validity_months?: number; reminder_days_before?: number };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ message: 'Certification name is required' });
  const validityMonths = typeof body.validity_months === 'number' && body.validity_months > 0 ? body.validity_months : 12;
  const reminderDays = typeof body.reminder_days_before === 'number' && body.reminder_days_before >= 0 ? body.reminder_days_before : 30;
  const description = typeof body.description === 'string' ? body.description.trim() || null : null;
  const createdBy = req.user!.userId;
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

app.patch('/api/certifications/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.delete('/api/certifications/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.get('/api/officers/:id/certifications', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const officerId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(officerId)) return res.status(400).json({ message: 'Invalid officer id' });
  const userId = req.user!.userId;
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

app.post('/api/officers/:id/certifications', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const officerId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(officerId)) return res.status(400).json({ message: 'Invalid officer id' });
  const body = req.body as { certification_id: number; issued_date?: string; expiry_date?: string; certificate_number?: string; issued_by?: string; notes?: string };
  const certId = typeof body.certification_id === 'number' && Number.isFinite(body.certification_id) ? body.certification_id : null;
  if (!certId) return res.status(400).json({ message: 'certification_id is required' });
  const userId = req.user!.userId;
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

app.patch('/api/officer-certifications/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.delete('/api/officer-certifications/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.get('/api/officer-certifications/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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

app.get('/api/certifications/compliance', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
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

app.get('/api/jobs', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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
    const userId = req.user!.userId;
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

app.get('/api/jobs/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  try {
    const result = await pool.query<DbJob & { customer_full_name?: string; customer_email?: string; customer_address?: string; officer_full_name?: string; description_name?: string }>(
      `SELECT j.*, c.full_name AS customer_full_name, c.email AS customer_email, 
              (c.address_line_1 || ', ' || COALESCE(c.town, '') || ', ' || COALESCE(c.postcode, '')) AS customer_address, 
              o.full_name AS officer_full_name, jd.name as description_name
       FROM jobs j
       LEFT JOIN customers c ON c.id = j.customer_id
       LEFT JOIN officers o ON o.id = j.officer_id
       LEFT JOIN job_descriptions jd ON jd.id = j.job_description_id
       WHERE j.id = $1${isSuperAdmin ? '' : ' AND j.created_by = $2'}`,
      isSuperAdmin ? [id] : [id, userId],
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    const r = result.rows[0];

    // Fetch pricing items for this specific job
    const pItems = await pool.query('SELECT * FROM job_pricing_items WHERE job_id=$1 ORDER BY sort_order', [id]);

    return res.json({
      job: {
        ...r,
        start_date: r.start_date ? (r.start_date as Date).toISOString() : null,
        deadline: r.deadline ? (r.deadline as Date).toISOString() : null,
        created_at: (r.created_at as Date).toISOString(),
        updated_at: (r.updated_at as Date).toISOString(),
        schedule_start: r.schedule_start ? (r.schedule_start as Date).toISOString() : null,
        expected_completion: r.expected_completion ? (r.expected_completion as Date).toISOString() : null,
        pricing_items: pItems.rows,
      },
    });
  } catch (error) {
    console.error('Get job error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/jobs', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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
  const completedServiceItems = Array.isArray(body.completed_service_items)
    ? body.completed_service_items
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
  const createdBy = req.user!.userId;

  const userId = req.user!.userId;
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

app.patch('/api/jobs/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid job id' });

  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const ownershipCheck = isSuperAdmin ? '' : ' AND created_by = $1';

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
  if (body.job_description_id !== undefined) { updates.push(`job_description_id = $${idx++}`); values.push(body.job_description_id || null); }
  if (str('contact_name') !== undefined) { updates.push(`contact_name = $${idx++}`); values.push(str('contact_name')); }
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
    const completedServiceItems = Array.isArray(body.completed_service_items)
      ? body.completed_service_items
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter(Boolean)
      : [];
    updates.push(`completed_service_items = $${idx++}`);
    values.push(JSON.stringify(completedServiceItems));
  }
  if (body.book_into_diary !== undefined) { updates.push(`book_into_diary = $${idx++}`); values.push(!!body.book_into_diary); }

  if (updates.length === 0 && body.pricing_items === undefined) return res.status(400).json({ message: 'No fields to update' });

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

app.get('/api/jobs/:jobId/office-tasks', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    const tasksResult = await pool.query(
      `SELECT ot.id, ot.job_id, ot.description, ot.assignee_officer_id, ot.created_by, ot.completed, ot.completed_at, ot.created_at, ot.updated_at,
              o.full_name AS assignee_name, COALESCE(u.full_name, u.email, 'System') AS created_by_name
       FROM office_tasks ot
       LEFT JOIN officers o ON o.id = ot.assignee_officer_id
       LEFT JOIN users u ON u.id = ot.created_by
       WHERE ot.job_id = $1
       ORDER BY ot.completed ASC, ot.created_at DESC`,
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
        created_at: (r.created_at as Date).toISOString(),
        updated_at: (r.updated_at as Date).toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get office tasks error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/jobs/:jobId/office-tasks', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as { description?: string; assignee_officer_id?: number | null };
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) return res.status(400).json({ message: 'Task description is required' });
  const assigneeOfficerId = body.assignee_officer_id === null || body.assignee_officer_id === undefined
    ? null
    : (typeof body.assignee_officer_id === 'number' ? body.assignee_officer_id : parseInt(String(body.assignee_officer_id), 10));

  try {
    const jobCheck = await pool.query<DbJob>('SELECT id, created_by FROM jobs WHERE id = $1', [jobId]);
    if ((jobCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Job not found' });
    if (!isSuperAdmin && jobCheck.rows[0].created_by !== userId) return res.status(404).json({ message: 'Job not found' });

    if (assigneeOfficerId && !isSuperAdmin) {
      const officerCheck = await pool.query('SELECT id FROM officers WHERE id = $1 AND created_by = $2', [assigneeOfficerId, userId]);
      if ((officerCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid assignee' });
    }

    const inserted = await pool.query(
      `INSERT INTO office_tasks (job_id, description, assignee_officer_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [jobId, description, assigneeOfficerId, userId],
    );
    return res.status(201).json({ task: { id: Number(inserted.rows[0].id) } });
  } catch (error) {
    console.error('Create office task error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/jobs/:jobId/office-tasks/:taskId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  const taskId = parseInt(String(req.params.taskId), 10);
  if (!Number.isFinite(jobId) || !Number.isFinite(taskId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const body = req.body as { description?: string; assignee_officer_id?: number | null; completed?: boolean };

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
    if (typeof body.completed === 'boolean') {
      updates.push(`completed = $${idx++}`);
      values.push(body.completed);
      updates.push(`completed_at = $${idx++}`);
      values.push(body.completed ? new Date() : null);
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

app.delete('/api/jobs/:jobId/office-tasks/:taskId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const jobId = parseInt(String(req.params.jobId), 10);
  const taskId = parseInt(String(req.params.taskId), 10);
  if (!Number.isFinite(jobId) || !Number.isFinite(taskId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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

app.delete('/api/jobs/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = req.user!.userId;
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
  try {
    const fromDate = typeof req.query.from === 'string' ? req.query.from : '2000-01-01';
    const toDate = typeof req.query.to === 'string' ? req.query.to : '3000-01-01';
    
    // We fetch diary events joined with jobs and customers
    const result = await pool.query(
      `SELECT d.id as diary_id, d.job_id, d.officer_id, d.start_time, d.duration_minutes, d.status as event_status,
              d.notes, d.created_by_name, d.created_at,
              j.title, j.description, j.location, j.customer_id,
              c.full_name as customer_full_name, c.email as customer_email,
              o.full_name as officer_full_name
       FROM diary_events d
       JOIN jobs j ON j.id = d.job_id
       LEFT JOIN customers c ON c.id = j.customer_id
       LEFT JOIN officers o ON o.id = d.officer_id
       WHERE d.start_time >= $1::timestamptz AND d.start_time < ($2::timestamptz + INTERVAL '1 day')
       ORDER BY d.start_time ASC`,
      [fromDate, toDate]
    );
    res.json({ events: result.rows });
  } catch (error) {
    console.error('get diary events error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/jobs/:id/diary-events', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const jobId = parseInt(String(req.params.id), 10);
    const result = await pool.query(
      `SELECT d.*, o.full_name as officer_full_name 
       FROM diary_events d
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

app.post('/api/jobs/:id/diary-events', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const jobId = parseInt(String(req.params.id), 10);
    const { officer_id, start_time, duration_minutes, notes } = req.body;
    
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
  const { status, feedback_notes } = req.body;
  const userId = req.user!.userId;

  try {
    const eventCheck = await pool.query('SELECT * FROM diary_events WHERE id = $1', [id]);
    if ((eventCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Event not found' });
    const event = eventCheck.rows[0];

    await pool.query(
      'UPDATE diary_events SET status = $1, notes = COALESCE($2, notes) WHERE id = $3',
      [status, feedback_notes || null, id]
    );

    if (status === 'completed') {
      // Trigger invoice generation
      await createInvoiceFromJob(event.job_id, userId);
      // Also update job state to completed
      await pool.query('UPDATE jobs SET state = \'completed\' WHERE id = $1', [event.job_id]);
    }

    res.json({ message: 'Diary event updated successfully' });
  } catch (error) {
    console.error('update diary event error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ----------------------------------------

// ---------- Scheduling & Dispatch ----------
app.get('/api/scheduling', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const fromDate = typeof req.query.from === 'string' ? req.query.from.slice(0, 10) : defaultFrom;
    const toDate = typeof req.query.to === 'string' ? req.query.to.slice(0, 10) : defaultTo;
    const officerId = typeof req.query.officer_id === 'string' ? parseInt(req.query.officer_id, 10) : null;
    const stateFilter = typeof req.query.state === 'string' && JOB_STATES.includes(req.query.state as typeof JOB_STATES[number]) ? req.query.state : '';
    const userId = req.user!.userId;
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

app.patch('/api/jobs/:id/schedule', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid job id' });
  const body = req.body as { schedule_start?: string | null; duration_minutes?: number; officer_id?: number | null; scheduling_notes?: string | null };
  const scheduleStart = body.schedule_start !== undefined ? (body.schedule_start ? new Date(body.schedule_start) : null) : undefined;
  const durationMinutes = body.duration_minutes !== undefined && typeof body.duration_minutes === 'number' && Number.isFinite(body.duration_minutes) ? body.duration_minutes : undefined;
  const officerId = body.officer_id !== undefined ? (typeof body.officer_id === 'number' && Number.isFinite(body.officer_id) ? body.officer_id : null) : undefined;
  const schedulingNotes = body.scheduling_notes !== undefined ? (typeof body.scheduling_notes === 'string' ? body.scheduling_notes.trim() || null : null) : undefined;

  const userId = req.user!.userId;
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

app.patch('/api/jobs/:id/dispatch', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid job id' });
  const userId = req.user!.userId;
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

async function ensureDefaultEmailTemplates(userId: number): Promise<void> {
  const defaults: { key: string; name: string; subject: string; body: string }[] = [
    {
      key: 'invoice',
      name: 'Invoice — send to customer',
      subject: '{{company_name}} — Invoice {{invoice_number}}',
      body:
        '<p>Hi {{customer_name}},</p><p>Your invoice <strong>{{invoice_number}}</strong> is ready.</p><p>Amount due: <strong>{{currency}} {{invoice_total}}</strong><br/>Invoice date: {{invoice_date}}<br/>Due date: {{due_date}}</p><p>View your invoice online: {{invoice_link}}</p><p>Customer address: {{customer_address}}<br/>Work / site: {{work_address}}</p><p>Thank you,<br/>{{company_name}}</p>',
    },
    {
      key: 'quotation',
      name: 'Quotation — send to customer',
      subject: '{{company_name}} — Quotation {{quotation_number}}',
      body:
        '<p>Hi {{customer_name}},</p><p>Your quotation <strong>{{quotation_number}}</strong> is ready.</p><p>Total: <strong>{{currency}} {{quotation_total}}</strong><br/>Valid until: {{valid_until}}<br/>Quotation date: {{quotation_date}}</p><p>Thank you,<br/>{{company_name}}</p>',
    },
    {
      key: 'general',
      name: 'General message',
      subject: 'Message from {{company_name}}',
      body: '<p>{{message}}</p>',
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

function canAccessInvoice(invoice: DbInvoice, userId: number, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return true;
  return invoice.created_by === userId;
}

/** Single-line customer address — same field order as customer detail page (`[id]/page.tsx`). */
function formatCustomerAddressSingleLine(row: Record<string, unknown>): string {
  const parts = [row.address_line_1, row.address_line_2, row.address_line_3, row.town, row.county, row.postcode]
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
  if (parts.length) return parts.join(', ');
  const legacy = typeof row.address === 'string' ? row.address.trim() : '';
  if (legacy) return legacy;
  const city = typeof row.city === 'string' ? row.city.trim() : '';
  const region = typeof row.region === 'string' ? row.region.trim() : '';
  const country = typeof row.country === 'string' ? row.country.trim() : '';
  const fb = [city, region, country].filter(Boolean).join(', ');
  return fb || '';
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
    invoice_link: `<a href="https://work-pilot.co/public/invoices/${inv.public_token}">${inv.invoice_number}</a>`,
  };
}

/** One comma-separated line for invoice PDF/UI (no newlines). */
function formatWorkAddressSingleLine(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (t) parts.push(t);
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
    if (t) parts.push(t);
  };
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

/** Normalize legacy invoice rows that stored work address with newlines. */
function workSiteAddressAsSingleLine(stored: string): string {
  return stored
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
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

async function createInvoiceFromJob(jobId: number, userId: number) {
  const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (jobResult.rowCount === 0) return null;
  const job = jobResult.rows[0];

  const pricingResult = await pool.query('SELECT * FROM job_pricing_items WHERE job_id = $1 ORDER BY sort_order', [jobId]);
  const pricingItems = pricingResult.rows;

  const settings = await getInvoiceSettings(userId);
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

  const invResult = await pool.query(
    `INSERT INTO invoices (invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, currency, state, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10)
     RETURNING id`,
    [invoiceNumber, job.customer_id, jobId, invoiceDate, dueDate, subtotal, taxAmount, totalAmount, settings.default_currency, userId]
  );
  
  const invoiceId = invResult.rows[0].id;

  for (let i = 0; i < pricingItems.length; i++) {
    const pi = pricingItems[i];
    await pool.query(
      'INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, amount, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
      [invoiceId, pi.item_name, pi.quantity, pi.unit_price, pi.total, i]
    );
  }

  await logInvoiceActivity(invoiceId, 'created', { invoice_number: invoiceNumber, auto_generated_from_job: jobId }, userId);
  return invoiceId;
}

app.get('/api/invoices', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const stateFilter = typeof req.query.state === 'string' && INVOICE_STATES.includes(req.query.state as typeof INVOICE_STATES[number])
      ? req.query.state
      : '';
    const customerId = typeof req.query.customer_id === 'string' ? parseInt(req.query.customer_id, 10) : null;
    const offset = (page - 1) * limit;
    const userId = req.user!.userId;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const conditions: string[] = [];
    const countParams: unknown[] = [];
    const listParams: unknown[] = [];
    let p = 1;
    if (!isSuperAdmin) {
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
    if (customerId && Number.isFinite(customerId)) {
      conditions.push(`i.customer_id = $${p++}`);
      countParams.push(customerId);
      listParams.push(customerId);
    }
    const jobId = typeof req.query.job_id === 'string' ? parseInt(req.query.job_id, 10) : null;
    if (jobId && Number.isFinite(jobId)) {
      conditions.push(`i.job_id = $${p++}`);
      countParams.push(jobId);
      listParams.push(jobId);
    }
    const invoiceWorkAddressId =
      typeof req.query.invoice_work_address_id === 'string' ? parseInt(req.query.invoice_work_address_id, 10) : null;
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
    const stateCounts: Record<string, number> = {};
    for (const s of INVOICE_STATES) {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS c FROM invoices ${ownerClause} ${isSuperAdmin ? 'WHERE' : 'AND'} state = $${isSuperAdmin ? 1 : 2}`,
        isSuperAdmin ? [s] : [userId, s],
      );
      stateCounts[s] = Number((r.rows[0] as { c: number }).c);
    }

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
      stateCounts,
    });
  } catch (error) {
    console.error('List invoices error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/invoices/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = req.user!.userId;
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
      }
    >(
      `SELECT i.*, c.full_name AS customer_full_name, c.email AS customer_email, c.phone AS customer_phone,
        c.address_line_1, c.address_line_2, c.address_line_3, c.town, c.county, c.postcode,
        c.address, c.city, c.region, c.country,
        j.title AS job_title,
        j.customer_reference AS job_customer_reference
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.id = $1`,
      [id],
    );
    if ((invResult.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
    const inv = invResult.rows[0];
    if (!canAccessInvoice(inv as DbInvoice, userId, isSuperAdmin)) return res.status(404).json({ message: 'Invoice not found' });

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

app.post('/api/invoices', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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
  };
  const customerId = typeof body.customer_id === 'number' && Number.isFinite(body.customer_id) ? body.customer_id : null;
  if (!customerId) return res.status(400).json({ message: 'Customer is required' });
  const userId = req.user!.userId;
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
    /** Work/site linkage is only set via POST .../work-addresses/:workAddressId/invoices, not the generic create endpoint. */
    const billingAddress = typeof body.billing_address === 'string' ? body.billing_address.trim() || null : null;
    const invoiceWorkAddressId: number | null = null;
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
    console.error('Create invoice error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/invoices/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<DbInvoice>('SELECT * FROM invoices WHERE id = $1', [id]);
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin)) return res.status(404).json({ message: 'Invoice not found' });

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

app.post('/api/invoices/:id/payments', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<DbInvoice>('SELECT * FROM invoices WHERE id = $1', [id]);
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin)) return res.status(404).json({ message: 'Invoice not found' });
  if (inv.state === 'cancelled') return res.status(400).json({ message: 'Cannot add payment to cancelled invoice' });

  const body = req.body as { amount?: number; payment_method?: string; payment_date?: string; reference_number?: string };
  const amount = typeof body.amount === 'number' && body.amount > 0 ? body.amount : null;
  if (!amount) return res.status(400).json({ message: 'Payment amount is required' });
  const paymentDate = body.payment_date ? new Date(body.payment_date) : new Date();
  const paymentMethod = body.payment_method && PAYMENT_METHODS.includes(body.payment_method as typeof PAYMENT_METHODS[number]) ? body.payment_method : 'other';
  const referenceNumber = typeof body.reference_number === 'string' ? body.reference_number.trim() || null : null;

  const totalPaid = parseFloat(inv.total_paid) + amount;
  const totalAmount = parseFloat(inv.total_amount);
  const newState = totalPaid >= totalAmount ? 'paid' : 'partially_paid';

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

app.post('/api/invoices/:id/issue', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<DbInvoice>('SELECT * FROM invoices WHERE id = $1', [id]);
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin)) return res.status(404).json({ message: 'Invoice not found' });
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

app.post('/api/invoices/:id/send', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = req.user!.userId;
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
    }
  >(
    `SELECT i.*, c.email AS customer_email, c.phone AS customer_phone, c.full_name AS customer_full_name,
            c.address_line_1 AS cust_addr_line_1, c.address_line_2 AS cust_addr_line_2, c.address_line_3 AS cust_addr_line_3,
            c.town AS cust_town, c.county AS cust_county, c.postcode AS cust_postcode
     FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin)) return res.status(404).json({ message: 'Invoice not found' });

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
    const pdfName = `${String(inv.invoice_number).replace(/[^\w.-]+/g, '_')}.pdf`;
    let pdfAttachment: { filename: string; content: Buffer; contentType: string };
    try {
      const pdfBuf = await generateInvoicePdfBuffer(pool, id);
      pdfAttachment = { filename: pdfName, content: pdfBuf, contentType: 'application/pdf' };
    } catch (pdfErr) {
      console.error('Invoice PDF generation error:', pdfErr);
      return res.status(500).json({ message: 'Could not generate invoice PDF for attachment.' });
    }
    await sendUserEmail(pool, userId, emailCfg, {
      from,
      to: inv.customer_email!.trim(),
      subject,
      html,
      replyTo: emailCfg.reply_to,
      attachments: [pdfAttachment],
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
        attachment_name: pdfName,
        attachment_names: [pdfName],
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

app.get('/api/invoices/:id/email-compose', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = req.user!.userId;
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
    }
  >(
    `SELECT i.*, c.email AS customer_email, c.full_name AS customer_full_name,
            c.address_line_1 AS cust_addr_line_1, c.address_line_2 AS cust_addr_line_2, c.address_line_3 AS cust_addr_line_3,
            c.town AS cust_town, c.county AS cust_county, c.postcode AS cust_postcode
     FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin)) return res.status(404).json({ message: 'Invoice not found' });

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
    const subject = row ? applyTemplateVars(row.subject, vars) : `${invSettings.company_name ?? 'Invoice'} — ${inv.invoice_number}`;
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
      smtp_ready: !!(emailCfg.smtp_enabled && transport && emailCfg.from_email?.trim()),
      can_send: inv.state === 'issued',
      invoice_state: inv.state,
      default_to: inv.customer_email ?? '',
      customer_name: inv.customer_full_name ?? '',
      to_email_options: toEmailOptions,
    });
  } catch (error) {
    console.error('Email compose draft error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/invoices/:id/send-email', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = req.user!.userId;
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
    DbInvoice & { customer_email?: string | null; customer_full_name?: string | null }
  >(
    `SELECT i.*, c.email AS customer_email, c.full_name AS customer_full_name
     FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = $1`,
    [id],
  );
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin)) return res.status(404).json({ message: 'Invoice not found' });

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
    const publicLink = `https://work-pilot.co/public/invoices/${inv.public_token || ''}`;
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
          userAttachments.push({
            filename: fn,
            content: Buffer.from(b64, 'base64'),
            contentType: typeof a.content_type === 'string' ? a.content_type : undefined,
          });
        } catch {
          return res.status(400).json({ message: `Invalid attachment data for ${fn}` });
        }
      }
    }

    const pdfName = `${String(inv.invoice_number).replace(/[^\w.-]+/g, '_')}.pdf`;
    let pdfBuf: Buffer;
    try {
      pdfBuf = await generateInvoicePdfBuffer(pool, id);
    } catch (pdfErr) {
      console.error('Invoice PDF generation error:', pdfErr);
      return res.status(500).json({ message: 'Could not generate invoice PDF for attachment.' });
    }
    const invoicePdfAtt = { filename: pdfName, content: pdfBuf, contentType: 'application/pdf' as const };
    const allAttachments = [invoicePdfAtt, ...userAttachments];

    await sendUserEmail(pool, userId, emailCfg, {
      from,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      html,
      replyTo: emailCfg.reply_to,
      attachments: allAttachments,
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
        attachment_name: pdfName,
        attachment_names: allAttachments.map((x) => x.filename),
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

app.post('/api/invoices/:id/communications', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<DbInvoice>('SELECT * FROM invoices WHERE id = $1', [id]);
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin)) return res.status(404).json({ message: 'Invoice not found' });

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

app.delete('/api/invoices/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid invoice id' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const invCheck = await pool.query<DbInvoice>('SELECT * FROM invoices WHERE id = $1', [id]);
  if ((invCheck.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
  const inv = invCheck.rows[0];
  if (!canAccessInvoice(inv, userId, isSuperAdmin)) return res.status(404).json({ message: 'Invoice not found' });

  try {
    await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
    return res.status(204).send();
  } catch (error) {
    console.error('Delete invoice error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/invoices/delete-all', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as { confirmation?: string };
  if (body.confirmation !== 'DELETE ALL INVOICES') {
    return res.status(400).json({ message: 'Confirmation must be exactly: DELETE ALL INVOICES' });
  }
  const userId = req.user!.userId;
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

app.get('/api/quotations', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const stateFilter = typeof req.query.state === 'string' && QUOTATION_STATES.includes(req.query.state as typeof QUOTATION_STATES[number]) ? req.query.state : '';
    const customerId = typeof req.query.customer_id === 'string' ? parseInt(req.query.customer_id, 10) : null;
    const offset = (page - 1) * limit;
    const userId = req.user!.userId;
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

app.get('/api/quotations/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  try {
    const qResult = await pool.query<DbQuotation & { customer_full_name?: string; customer_email?: string; customer_phone?: string; customer_address?: string; job_title?: string }>(
      `SELECT q.*, c.full_name AS customer_full_name, c.email AS customer_email, c.phone AS customer_phone,
        COALESCE(c.address, c.city || ', ' || c.region || ' ' || c.country) AS customer_address,
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
    const settings = await getQuotationSettings(q.created_by ?? userId);

    const quotation = {
      id: q.id,
      quotation_number: q.quotation_number,
      customer_id: q.customer_id,
      customer_full_name: q.customer_full_name ?? null,
      customer_email: q.customer_email ?? null,
      customer_phone: q.customer_phone ?? null,
      customer_address: q.billing_address ?? q.customer_address ?? null,
      job_id: q.job_id ?? null,
      job_title: q.job_title ?? null,
      quotation_date: (q.quotation_date as Date).toISOString().slice(0, 10),
      valid_until: (q.valid_until as Date).toISOString().slice(0, 10),
      subtotal: parseFloat(q.subtotal),
      tax_amount: parseFloat(q.tax_amount),
      total_amount: parseFloat(q.total_amount),
      currency: q.currency,
      notes: q.notes ?? null,
      billing_address: q.billing_address ?? null,
      state: q.state,
      created_at: (q.created_at as Date).toISOString(),
      updated_at: (q.updated_at as Date).toISOString(),
      created_by: q.created_by,
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
      settings,
    };

    return res.json({ quotation });
  } catch (error) {
    console.error('Get quotation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/quotations', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    customer_id?: number;
    job_id?: number;
    quotation_date?: string;
    valid_until?: string;
    currency?: string;
    notes?: string;
    billing_address?: string;
    line_items?: { description: string; quantity: number; unit_price: number }[];
    tax_percentage?: number;
  };
  const customerId = typeof body.customer_id === 'number' && Number.isFinite(body.customer_id) ? body.customer_id : null;
  if (!customerId) return res.status(400).json({ message: 'Customer is required' });
  const userId = req.user!.userId;
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
    const billingAddress = typeof body.billing_address === 'string' ? body.billing_address.trim() || null : null;
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
      `INSERT INTO quotations (quotation_number, customer_id, job_id, quotation_date, valid_until, subtotal, tax_amount, total_amount, currency, notes, billing_address, state, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', $12)
       RETURNING id, quotation_number, customer_id, job_id, quotation_date, valid_until, subtotal, tax_amount, total_amount, currency, notes, billing_address, state, created_at, updated_at, created_by`,
      [quotationNumber, customerId, jobId, quotationDate, validUntil, subtotal, taxAmount, totalAmount, currency, notes, billingAddress, userId],
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
        state: q.state,
        created_at: (q.created_at as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('Create quotation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/quotations/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = req.user!.userId;
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
  if (body.customer_id !== undefined && Number.isFinite(body.customer_id)) {
    const custCheck = await pool.query('SELECT id FROM customers WHERE id = $1' + (isSuperAdmin ? '' : ' AND created_by = $2'), isSuperAdmin ? [body.customer_id] : [body.customer_id, userId]);
    if ((custCheck.rowCount ?? 0) > 0) { updates.push(`customer_id = $${idx++}`); values.push(body.customer_id); }
  }
  if (body.job_id !== undefined) {
    const jid = body.job_id === null ? null : (Number.isFinite(body.job_id) ? body.job_id : parseInt(String(body.job_id), 10));
    if (jid === null || Number.isFinite(jid)) { updates.push(`job_id = $${idx++}`); values.push(jid); }
  }
  if (body.quotation_date) { updates.push(`quotation_date = $${idx++}`); values.push(new Date(body.quotation_date as string)); }
  if (body.valid_until) { updates.push(`valid_until = $${idx++}`); values.push(new Date(body.valid_until as string)); }
  if (str('currency') !== undefined) { updates.push(`currency = $${idx++}`); values.push(str('currency')); }
  if (str('notes') !== undefined) { updates.push(`notes = $${idx++}`); values.push(str('notes')); }
  if (str('billing_address') !== undefined) { updates.push(`billing_address = $${idx++}`); values.push(str('billing_address')); }
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

app.post('/api/quotations/:id/send', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = req.user!.userId;
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
    const invSettings = await getInvoiceSettings(userId);
    const tpl = await pool.query<{ subject: string; body_html: string }>(
      `SELECT subject, body_html FROM email_templates WHERE created_by = $1 AND template_key = 'quotation'`,
      [userId],
    );
    const row = tpl.rows[0];
    if (!row) {
      return res.status(500).json({ message: 'Quotation email template missing' });
    }
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
    const vars: Record<string, string> = {
      company_name: invSettings.company_name ?? 'WorkPilot',
      customer_name: q.customer_full_name ?? '',
      quotation_number: q.quotation_number,
      quotation_total: parseFloat(String(q.total_amount)).toFixed(2),
      currency: q.currency,
      quotation_date: qDate,
      valid_until: validUntil,
      customer_address,
      work_address: '',
    };
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

app.post('/api/quotations/:id/accept', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = req.user!.userId;
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

app.post('/api/quotations/:id/reject', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = req.user!.userId;
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

app.post('/api/quotations/:id/transfer-to-invoice', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const quotationId = parseInt(String(idParam), 10);
  if (!Number.isFinite(quotationId)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = req.user!.userId;
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

    const invResult = await pool.query<DbInvoice>(
      `INSERT INTO invoices (invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, total_paid, currency, notes, billing_address, invoice_work_address_id, customer_reference, state, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, NULL, NULL, 'draft', $12)
       RETURNING id, invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, total_paid, currency, notes, billing_address, invoice_work_address_id, customer_reference, state, created_at, updated_at, created_by`,
      [invoiceNumber, q.customer_id, q.job_id, invoiceDate, dueDate, subtotal, taxAmount, totalAmount, q.currency, q.notes, q.billing_address, userId],
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

app.delete('/api/quotations/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid quotation id' });
  const userId = req.user!.userId;
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
app.get('/api/settings/quotation', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  try {
    const settings = await getQuotationSettings(userId);
    return res.json({ settings });
  } catch (error) {
    console.error('Get quotation settings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/settings/quotation', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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
      };
      await pool.query(
        `INSERT INTO quotation_settings (created_by, default_currency, quotation_prefix, terms_and_conditions, default_valid_days, company_name, company_address, company_phone, company_email, company_logo, company_website, company_tax_id, tax_label, default_tax_percentage, footer_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (created_by) DO UPDATE SET default_currency = EXCLUDED.default_currency, quotation_prefix = EXCLUDED.quotation_prefix, terms_and_conditions = EXCLUDED.terms_and_conditions, default_valid_days = EXCLUDED.default_valid_days, company_name = EXCLUDED.company_name, company_address = EXCLUDED.company_address, company_phone = EXCLUDED.company_phone, company_email = EXCLUDED.company_email, company_logo = EXCLUDED.company_logo, company_website = EXCLUDED.company_website, company_tax_id = EXCLUDED.company_tax_id, tax_label = EXCLUDED.tax_label, default_tax_percentage = EXCLUDED.default_tax_percentage, footer_text = EXCLUDED.footer_text, updated_at = NOW()`,
        [userId, merged.default_currency, merged.quotation_prefix, merged.terms_and_conditions, merged.default_valid_days, merged.company_name, merged.company_address, merged.company_phone, merged.company_email, merged.company_logo, merged.company_website, merged.company_tax_id, merged.tax_label, merged.default_tax_percentage, merged.footer_text],
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
app.get('/api/settings/invoice', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  try {
    const settings = await getInvoiceSettings(userId);
    return res.json({ settings });
  } catch (error) {
    console.error('Get invoice settings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/settings/invoice', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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
app.get('/api/settings/email', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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

app.patch('/api/settings/email', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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

app.post('/api/settings/email/test', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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
      subject: 'WorkPilot — Email test',
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

app.get('/api/auth/google/url', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const url = await getGoogleAuthUrl();
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/auth/microsoft/url', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.post('/api/settings/email/oauth/exchange', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { code, provider } = req.body as { code: string; provider: 'google' | 'microsoft' };
  const userId = req.user!.userId;
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

app.post('/api/settings/email/oauth/disconnect', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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


app.get('/api/settings/email-templates', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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

app.patch('/api/settings/email-templates/:key', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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

const SYSTEM_EMAIL_TEMPLATE_KEYS = new Set(['invoice', 'quotation', 'general']);

app.post('/api/settings/email-templates', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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

app.delete('/api/settings/email-templates/:key', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const keyParam = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const templateKey = typeof keyParam === 'string' ? keyParam.trim() : '';
  if (!/^[a-z0-9_-]{1,64}$/i.test(templateKey)) {
    return res.status(400).json({ message: 'Invalid template key' });
  }
  if (SYSTEM_EMAIL_TEMPLATE_KEYS.has(templateKey.toLowerCase())) {
    return res.status(400).json({ message: 'Built-in templates (invoice, quotation, general) cannot be deleted' });
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
app.get('/api/settings/price-books', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM price_books ORDER BY id ASC');
    return res.json(result.rows);
  } catch (error) {
    console.error('List price books error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/price-books', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { name, description } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO price_books (name, description, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description?.trim() || null, req.user!.userId],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create price book error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/settings/price-books/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.delete('/api/settings/price-books/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.get('/api/settings/price-books/:id/details', authenticate, async (req: AuthenticatedRequest, res: Response) => {
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

app.post('/api/settings/price-books/:id/items', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.put('/api/settings/price-books/:id/items/:itemId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.delete('/api/settings/price-books/:id/items/:itemId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.post('/api/settings/price-books/:id/labour-rates', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.put('/api/settings/price-books/:id/labour-rates/:rateId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.delete('/api/settings/price-books/:id/labour-rates/:rateId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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
app.get('/api/settings/customer-types', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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

app.post('/api/settings/customer-types', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as { name?: string; description?: string; company_name_required?: boolean; allow_branches?: boolean; work_address_name?: string };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ message: 'Name is required' });
  
  const desc = typeof body.description === 'string' ? body.description.trim() : null;
  const companyReq = !!body.company_name_required;
  const branches = !!body.allow_branches;
  const workAddrName = typeof body.work_address_name === 'string' && body.work_address_name.trim() !== '' ? body.work_address_name.trim() : 'Work Address';
  const createdBy = req.user!.userId;

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

app.put('/api/settings/customer-types/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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
app.patch('/api/settings/customer-types/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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

app.delete('/api/settings/customer-types/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(idParam), 10);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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
app.get('/api/settings/job-descriptions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM job_descriptions ORDER BY name ASC');
    return res.json(result.rows);
  } catch (error) {
    console.error('List job descriptions error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get single job description with its default pricing items
app.get('/api/settings/job-descriptions/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
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
app.post('/api/settings/job-descriptions', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { name, default_skills, default_job_notes, default_priority, default_business_unit, is_service_job } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO job_descriptions (name, default_skills, default_job_notes, default_priority, default_business_unit, is_service_job, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name.trim(), default_skills || null, default_job_notes || null, default_priority || 'medium', default_business_unit || null, !!is_service_job, req.user!.userId]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create job description error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Update job description
app.patch('/api/settings/job-descriptions/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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
app.delete('/api/settings/job-descriptions/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

// ── Pricing items for a job description template ──

app.get('/api/settings/job-descriptions/:id/pricing-items', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid ID' });
  try {
    const result = await pool.query('SELECT * FROM job_description_pricing_items WHERE job_description_id = $1 ORDER BY sort_order ASC', [id]);
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/job-descriptions/:id/pricing-items', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

app.delete('/api/settings/job-descriptions/:descId/pricing-items/:itemId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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
app.get('/api/settings/business-units', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const r = await pool.query('SELECT * FROM business_units ORDER BY name ASC');
    res.json({ units: r.rows });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/business-units', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ message: 'Invalid name' });
  try {
    const r = await pool.query(
      'INSERT INTO business_units (name, created_by) VALUES ($1, $2) RETURNING *',
      [name.trim(), req.user!.userId]
    );
    res.json({ unit: r.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') return res.status(400).json({ message: 'Business unit already exists' });
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/business-units/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM business_units WHERE id = $1', [parseInt(String(req.params.id), 10)]);
    res.json({ message: 'Business unit deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Settings: User Groups
app.get('/api/settings/user-groups', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const r = await pool.query('SELECT * FROM user_groups ORDER BY name ASC');
    res.json({ groups: r.rows });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/settings/user-groups', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ message: 'Invalid name' });
  try {
    const r = await pool.query(
      'INSERT INTO user_groups (name, created_by) VALUES ($1, $2) RETURNING *',
      [name.trim(), req.user!.userId]
    );
    res.json({ group: r.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') return res.status(400).json({ message: 'User group already exists' });
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/user-groups/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM user_groups WHERE id = $1', [parseInt(String(req.params.id), 10)]);
    res.json({ message: 'User group deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/settings/service-checklist', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `SELECT id, name, sort_order, is_active, created_at, updated_at
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

app.post('/api/settings/service-checklist', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const sortOrder = Number.isFinite(req.body?.sort_order) ? Number(req.body.sort_order) : 0;
  const isActive = req.body?.is_active === undefined ? true : !!req.body.is_active;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO service_checklist_items (name, sort_order, is_active, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, sort_order, is_active, created_at, updated_at`,
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

app.patch('/api/settings/service-checklist/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const userId = req.user!.userId;
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid item id' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
  const sortOrder = req.body?.sort_order !== undefined ? Number(req.body.sort_order) : undefined;
  const isActive = req.body?.is_active !== undefined ? !!req.body.is_active : undefined;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name || null); }
  if (sortOrder !== undefined && Number.isFinite(sortOrder)) { updates.push(`sort_order = $${idx++}`); values.push(sortOrder); }
  if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); values.push(isActive); }
  if (!updates.length) return res.status(400).json({ message: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(id, userId);

  try {
    const result = await pool.query(
      `UPDATE service_checklist_items
       SET ${updates.join(', ')}
       WHERE id = $${idx++} AND created_by = $${idx}
       RETURNING id, name, sort_order, is_active, created_at, updated_at`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Service not found' });
    return res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Update service checklist item error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/settings/service-checklist/:id', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const userId = req.user!.userId;
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

// ───────────────────────────────── ENHANCED JOB CREATION (with pricing items) ─────────────────────────────────

app.post('/api/customers/:customerId/jobs', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });

  const {
    job_description_id, contact_name, expected_completion, priority, user_group, business_unit,
    skills, job_notes, is_service_job, quoted_amount, customer_reference, job_pipeline,
    book_into_diary, pricing_items, completed_service_items,
  } = req.body;

  const title = req.body.title?.trim() || 'Untitled Job';
  const createdBy = req.user!.userId;

  const completedServiceItems = Array.isArray(completed_service_items)
    ? completed_service_items
        .filter((v: unknown): v is string => typeof v === 'string')
        .map((v: string) => v.trim())
        .filter(Boolean)
    : [];

  try {
    const jobResult = await pool.query(
      `INSERT INTO jobs (title, description, priority, customer_id, state, created_by,
        job_description_id, contact_name, expected_completion, user_group, business_unit,
        skills, job_notes, is_service_job, quoted_amount, customer_reference, job_pipeline, book_into_diary, completed_service_items)
       VALUES ($1, $2, $3, $4, 'created', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        title, job_notes || null, priority || 'medium', customerId, createdBy,
        job_description_id || null, contact_name || null, expected_completion ? new Date(expected_completion) : null,
        user_group || null, business_unit || null, skills || null, job_notes || null,
        !!is_service_job, quoted_amount || null, customer_reference || null, job_pipeline || null,
        book_into_diary !== false, JSON.stringify(completedServiceItems),
      ]
    );

    const job = jobResult.rows[0];

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
  try {
    const result = await pool.query(
      `SELECT j.*, jd.name as description_name FROM jobs j 
       LEFT JOIN job_descriptions jd ON j.job_description_id = jd.id
       WHERE j.customer_id = $1 ORDER BY j.created_at DESC`,
      [customerId]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/customers/:customerId/contacts', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = req.user!.userId;
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
      whereClause += ` AND (COALESCE(title,'') ILIKE $2 OR COALESCE(first_name,'') ILIKE $2 OR surname ILIKE $2 OR COALESCE(position,'') ILIKE $2 OR COALESCE(email,'') ILIKE $2 OR COALESCE(mobile,'') ILIKE $2)`;
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

app.post('/api/customers/:customerId/contacts', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = req.user!.userId;
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
  const prefersLetter = body.prefers_letter === undefined ? true : !!body.prefers_letter;

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    if (isPrimary) {
      await pool.query('UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1', [customerId]);
    }

    const inserted = await pool.query(
      `INSERT INTO customer_contacts
       (customer_id, title, first_name, surname, position, email, mobile, landline, office_code, date_of_birth, twitter_handle, facebook_url, linkedin_url,
        is_primary, prefers_phone, prefers_sms, prefers_email, prefers_letter, created_by)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [customerId, title, firstName, surname, position, email, mobile, landline, officeCode, dateOfBirth, twitterHandle, facebookUrl, linkedinUrl, isPrimary, prefersPhone, prefersSms, prefersEmail, prefersLetter, userId],
    );

    return res.status(201).json({ contact: { id: Number(inserted.rows[0].id) } });
  } catch (error) {
    console.error('Create customer contact error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/customers/:customerId/contacts/:contactId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const contactId = parseInt(String(req.params.contactId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(contactId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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
      if (!!body.is_primary) await pool.query('UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1', [customerId]);
      updates.push(`is_primary = $${idx++}`);
      values.push(!!body.is_primary);
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

app.get('/api/customers/:customerId/branches', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = req.user!.userId;
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

app.post('/api/customers/:customerId/branches', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = req.user!.userId;
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

app.patch('/api/customers/:customerId/branches/:branchId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const branchId = parseInt(String(req.params.branchId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(branchId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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

app.delete('/api/customers/:customerId/branches/:branchId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const branchId = parseInt(String(req.params.branchId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(branchId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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

app.get('/api/customers/:customerId/work-addresses', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = req.user!.userId;
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

app.get('/api/customers/:customerId/work-addresses/:workAddressId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const workAddressId = parseInt(String(req.params.workAddressId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(workAddressId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = parseInt(String(req.params.customerId), 10);
    const workAddressId = parseInt(String(req.params.workAddressId), 10);
    if (!Number.isFinite(customerId) || !Number.isFinite(workAddressId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const userId = req.user!.userId;
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

      const invResult = await pool.query<DbInvoice>(
        `INSERT INTO invoices (invoice_number, customer_id, job_id, invoice_date, due_date, subtotal, tax_amount, total_amount, currency, notes, billing_address, invoice_work_address_id, customer_reference, state, created_by)
         VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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

app.post('/api/customers/:customerId/work-addresses', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = req.user!.userId;
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

app.patch('/api/customers/:customerId/work-addresses/:workAddressId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const workAddressId = parseInt(String(req.params.workAddressId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(workAddressId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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

app.delete('/api/customers/:customerId/work-addresses/:workAddressId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const workAddressId = parseInt(String(req.params.workAddressId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(workAddressId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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

app.get('/api/customers/:customerId/assets', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = req.user!.userId;
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const groupBy = typeof req.query.group_by === 'string' ? req.query.group_by.trim() : '';

  try {
    const customer = await pool.query<DbCustomer>('SELECT id, created_by FROM customers WHERE id = $1', [customerId]);
    if ((customer.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Customer not found' });
    if (!isSuperAdmin && customer.rows[0].created_by !== userId) return res.status(404).json({ message: 'Customer not found' });

    const params: unknown[] = [customerId];
    let whereClause = 'WHERE customer_id = $1';
    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (asset_group ILIKE $2 OR COALESCE(asset_type,'') ILIKE $2 OR description ILIKE $2 OR COALESCE(make,'') ILIKE $2 OR COALESCE(model,'') ILIKE $2 OR COALESCE(serial_number,'') ILIKE $2 OR COALESCE(location,'') ILIKE $2)`;
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

app.get('/api/customers/:customerId/assets/:assetId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const assetId = parseInt(String(req.params.assetId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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

app.post('/api/customers/:customerId/assets', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = req.user!.userId;
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

    const inserted = await pool.query(
      `INSERT INTO customer_assets
       (customer_id, asset_group, asset_type, description, make, model, serial_number, photo_url, barcode, installed_by_us, under_warranty, is_functioning, location, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [customerId, assetGroup, str('asset_type'), description, str('make'), str('model'), str('serial_number'), str('photo_url'), str('barcode'), !!body.installed_by_us, !!body.under_warranty, str('is_functioning'), str('location'), userId],
    );
    return res.status(201).json({ asset: { id: Number(inserted.rows[0].id) } });
  } catch (error) {
    console.error('Create customer asset error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/customers/:customerId/assets/:assetId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const assetId = parseInt(String(req.params.assetId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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

app.delete('/api/customers/:customerId/assets/:assetId', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  const assetId = parseInt(String(req.params.assetId), 10);
  if (!Number.isFinite(customerId) || !Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid id' });
  const userId = req.user!.userId;
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

app.post('/api/import/customers-sites', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
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

app.get('/api/customers/:customerId/communications', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });

  const userId = req.user!.userId;
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

app.post('/api/customers/:customerId/communications', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const customerId = parseInt(String(req.params.customerId), 10);
  if (!Number.isFinite(customerId)) return res.status(400).json({ message: 'Invalid customer ID' });
  const userId = req.user!.userId;
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

    const result = await pool.query(
      `INSERT INTO customer_communications
        (customer_id, record_type, subject, message, status, to_value, cc_value, bcc_value, from_value, object_type, object_id, attachment_name, scheduled_for, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, created_at`,
      [customerId, recordType, subject, message, status, toValue, ccValue, bccValue, fromValue, objectType, objectId, attachmentName, scheduledFor, userId],
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
    const invResult = await pool.query<
      DbInvoice & { 
        customer_full_name: string; 
        customer_email: string; 
        customer_phone: string; 
        customer_address: string;
        customer_type_name: string;
        work_address_line: string;
      }
    >(
      `SELECT i.*, 
              c.full_name AS customer_full_name, 
              c.email AS customer_email, 
              c.phone AS customer_phone, 
              c.address AS customer_address,
              ct.name AS customer_type_name,
              wad.address_line AS work_address_line
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN customer_types ct ON ct.id = c.customer_type_id
       LEFT JOIN customer_work_addresses wad ON wad.id = i.invoice_work_address_id
       WHERE i.public_token = $1`,
      [token]
    );

    if ((invResult.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Invoice not found' });
    const invoice = invResult.rows[0];

    const itemsResult = await pool.query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order ASC, id ASC',
      [invoice.id]
    );

    // Load business settings for logo/info (using the creator's ID as a proxy for the org)
    const creatorId = invoice.created_by || 1; 
    const logoResult = await pool.query('SELECT value FROM business_settings WHERE key = $1 AND created_by = $2', ['company_logo_url', creatorId]);
    const nameResult = await pool.query('SELECT value FROM business_settings WHERE key = $1 AND created_by = $2', ['company_display_name', creatorId]);
    const addrResult = await pool.query('SELECT value FROM business_settings WHERE key = $1 AND created_by = $2', ['company_address', creatorId]);
    
    res.json({
      invoice,
      line_items: itemsResult.rows,
      business: {
        logo: logoResult.rows[0]?.value || null,
        name: nameResult.rows[0]?.value || 'WorkPilot',
        address: addrResult.rows[0]?.value || '',
      }
    });
  } catch (error) {
    console.error('Public invoice fetch error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
