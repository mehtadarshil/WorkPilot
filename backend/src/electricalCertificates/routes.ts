import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import { getTenantScopeUserId, requireTenantCrmAccess } from '../tenantAccess';
import type { TenantAuthUser } from '../tenantAccess';
import { coerceDocument, createDefaultDocument } from './documentDefaults';
import { validateElectricalCertificate } from './validation';
import type { CertificateStatus, ElectricalCertificateDocument } from './types';
import { loadCompanyBranding } from './companyBranding';
import {
  applyPatTestEquipmentDefaults,
  ensurePatDefaultsSchema,
  loadPatTestEquipmentDefaults,
  savePatTestEquipmentDefaults,
} from './patDefaults';
import { generateElectricalCertificatePdfBuffer } from './generateCertificatePdf';
import { PdfRenderUnavailableError } from '../jobClientReportPdf';
import {
  loadCertificateTeamMembers,
  memberCanBeSignedBy,
  type CertificateTeamMember,
} from './certificateTeamMembers';

type AuthReq = Request & { user?: TenantAuthUser };

const EMPTY_PAT_SIGNATURE = {
  signatureDataUrl: '',
  signedAt: '',
  signedByUserId: null,
  signedByOfficerId: null,
};

type SignOffDefaults = {
  name: string;
  position: string;
};

export type ElectricalCertificateRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

export async function ensureElectricalCertificateSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS electrical_certificates (
      id SERIAL PRIMARY KEY,
      certificate_number VARCHAR(50) UNIQUE NOT NULL,
      job_number VARCHAR(100),
      type_slug VARCHAR(50) NOT NULL DEFAULT 'eicr_18e_a3',
      status VARCHAR(30) NOT NULL DEFAULT 'in_progress',
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE SET NULL,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      document JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_electrical_certificates_customer ON electrical_certificates(customer_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_electrical_certificates_created_by ON electrical_certificates(created_by)`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS electrical_certificate_number_settings (
      id SERIAL PRIMARY KEY,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type_slug VARCHAR(50) NOT NULL,
      prefix VARCHAR(30) NOT NULL,
      next_number INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(created_by, type_slug)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_electrical_certificate_number_settings_owner ON electrical_certificate_number_settings(created_by)`,
  );
  await ensurePatDefaultsSchema(pool);
}

function normalizeCertificateTypeSlug(raw: unknown): ElectricalCertificateDocument['typeSlug'] {
  if (raw === 'portable_appliance_test') return 'portable_appliance_test';
  if (raw === 'fi_insp_2025') return 'fi_insp_2025';
  if (raw === 'dfi_insp_2019_a1') return 'dfi_insp_2019_a1';
  return 'eicr_18e_a3';
}

function defaultCertificatePrefix(typeSlug: ElectricalCertificateDocument['typeSlug']): string {
  if (typeSlug === 'portable_appliance_test') return 'PAT';
  if (typeSlug === 'fi_insp_2025') return 'FI-INSP';
  if (typeSlug === 'dfi_insp_2019_a1') return 'DFI-INSP';
  return 'EICR';
}

async function applyBusinessDetailsDefaults(
  pool: Pool,
  authUser: TenantAuthUser,
  doc: ElectricalCertificateDocument,
): Promise<ElectricalCertificateDocument> {
  const userId = getTenantScopeUserId(authUser);
  doc = await applySystemSignOffDefaults(pool, authUser, doc);
  if (!doc.pat) return doc;
  const branding = await loadCompanyBranding(pool, userId);
  const address = [branding.company_address, branding.company_email, branding.company_website]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join('\n');
  doc.pat.registeredBusiness = {
    name: doc.pat.registeredBusiness.name.trim() || branding.company_name || '',
    address: doc.pat.registeredBusiness.address.trim() || address,
    phone: doc.pat.registeredBusiness.phone.trim() || branding.company_phone || '',
  };
  return applyPatTestEquipmentDefaults(pool, userId, doc);
}

async function loadSignOffDefaults(pool: Pool, authUser: TenantAuthUser): Promise<SignOffDefaults | null> {
  const userId = getTenantScopeUserId(authUser);
  if (authUser.officerId != null) {
    const officer = await pool.query<{ full_name: string; role_position: string | null }>(
      `SELECT full_name, role_position
       FROM officers
       WHERE id = $1 ${authUser.role === 'SUPER_ADMIN' ? '' : 'AND created_by = $2'}
       LIMIT 1`,
      authUser.role === 'SUPER_ADMIN' ? [authUser.officerId] : [authUser.officerId, userId],
    );
    if ((officer.rowCount ?? 0) > 0) {
      return {
        name: officer.rows[0].full_name,
        position: officer.rows[0].role_position ?? '',
      };
    }
  }

  const account = await pool.query<{ full_name: string | null; role: string }>(
    `SELECT full_name, role FROM users WHERE id = $1 LIMIT 1`,
    [authUser.userId],
  );
  if ((account.rowCount ?? 0) === 0) return null;
  return {
    name: account.rows[0].full_name ?? authUser.email,
    position: account.rows[0].role === 'ADMIN' ? 'Authorised person' : account.rows[0].role,
  };
}

async function applySystemSignOffDefaults(
  pool: Pool,
  authUser: TenantAuthUser,
  doc: ElectricalCertificateDocument,
): Promise<ElectricalCertificateDocument> {
  const defaults = await loadSignOffDefaults(pool, authUser);
  if (!defaults) return doc;
  const today = new Date().toISOString().slice(0, 10);

  doc.installation = {
    ...doc.installation,
    inspectedBy: doc.installation.inspectedBy.trim() || defaults.name,
    inspectedPosition: doc.installation.inspectedPosition.trim() || defaults.position,
    authorisedBy: doc.installation.authorisedBy.trim() || defaults.name,
    authorisedPosition: doc.installation.authorisedPosition.trim() || defaults.position,
    inspectedDate: doc.installation.inspectedDate || today,
    authorisedDate: doc.installation.authorisedDate || today,
  };

  if (doc.fireAlarm) {
    doc.fireAlarm.declaration = {
      ...doc.fireAlarm.declaration,
      inspectedBy: doc.fireAlarm.declaration.inspectedBy.trim() || defaults.name,
      inspectedPosition: doc.fireAlarm.declaration.inspectedPosition.trim() || defaults.position,
      authorisedBy: doc.fireAlarm.declaration.authorisedBy.trim() || defaults.name,
      authorisedPosition: doc.fireAlarm.declaration.authorisedPosition.trim() || defaults.position,
      inspectionDate: doc.fireAlarm.declaration.inspectionDate || today,
      authorisedDate: doc.fireAlarm.declaration.authorisedDate || today,
    };
  }

  if (doc.domesticFireAlarm) {
    doc.domesticFireAlarm.declaration = {
      ...doc.domesticFireAlarm.declaration,
      inspectedBy: doc.domesticFireAlarm.declaration.inspectedBy.trim() || defaults.name,
      inspectedPosition: doc.domesticFireAlarm.declaration.inspectedPosition.trim() || defaults.position,
      authorisedBy: doc.domesticFireAlarm.declaration.authorisedBy.trim() || defaults.name,
      authorisedPosition: doc.domesticFireAlarm.declaration.authorisedPosition.trim() || defaults.position,
      inspectionDate: doc.domesticFireAlarm.declaration.inspectionDate || today,
      authorisedDate: doc.domesticFireAlarm.declaration.authorisedDate || today,
    };
  }

  return doc;
}

function formatCertificateNumber(prefix: string, seq: number): string {
  const cleanPrefix = (prefix || 'CERT').trim().replace(/\s+/g, '-').slice(0, 30) || 'CERT';
  return `${cleanPrefix}-${String(Math.max(1, seq)).padStart(6, '0')}`;
}

async function ensureNumberSetting(pool: Pool, userId: number, typeSlug: ElectricalCertificateDocument['typeSlug']) {
  const prefix = defaultCertificatePrefix(typeSlug);
  await pool.query(
    `INSERT INTO electrical_certificate_number_settings (created_by, type_slug, prefix, next_number)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (created_by, type_slug) DO NOTHING`,
    [userId, typeSlug, prefix],
  );
}

async function generateCertificateNumber(pool: Pool, userId: number, typeSlug: ElectricalCertificateDocument['typeSlug']): Promise<string> {
  await ensureNumberSetting(pool, userId, typeSlug);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await client.query<{ prefix: string; next_number: number }>(
      `SELECT prefix, next_number FROM electrical_certificate_number_settings
       WHERE created_by = $1 AND type_slug = $2
       FOR UPDATE`,
      [userId, typeSlug],
    );
    let prefix = row.rows[0]?.prefix || defaultCertificatePrefix(typeSlug);
    let seq = Math.max(1, Number(row.rows[0]?.next_number) || 1);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const num = formatCertificateNumber(prefix, seq);
      const exists = await client.query('SELECT 1 FROM electrical_certificates WHERE certificate_number = $1', [num]);
      seq += 1;
      if ((exists.rowCount ?? 0) === 0) {
        await client.query(
          `UPDATE electrical_certificate_number_settings
           SET next_number = $3, updated_at = NOW()
           WHERE created_by = $1 AND type_slug = $2`,
          [userId, typeSlug, seq],
        );
        await client.query('COMMIT');
        return num;
      }
    }
    prefix = defaultCertificatePrefix(typeSlug);
    const num = `${prefix}-${Date.now()}`;
    await client.query('COMMIT');
    return num;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    certificate_number: row.certificate_number as string,
    job_number: (row.job_number as string | null) ?? null,
    type_slug: row.type_slug as string,
    status: row.status as CertificateStatus,
    customer_id: row.customer_id as number,
    work_address_id: (row.work_address_id as number | null) ?? null,
    job_id: (row.job_id as number | null) ?? null,
    document: coerceDocument({ ...((row.document as Record<string, unknown>) ?? {}), typeSlug: row.type_slug }),
    customer_full_name: (row.customer_full_name as string | null) ?? null,
    installation_label: (row.installation_label as string | null) ?? null,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

function withProtectedPatSignatureFields(
  incoming: ElectricalCertificateDocument,
  existing: ElectricalCertificateDocument,
): ElectricalCertificateDocument {
  if (!incoming.pat || !existing.pat) return incoming;

  const existingEngineer = existing.pat.engineer;
  const incomingEngineer = incoming.pat.engineer;
  const sameEngineerProfile =
    (existingEngineer.signedByOfficerId != null &&
      incomingEngineer.officerId === existingEngineer.signedByOfficerId) ||
    (existingEngineer.signedByUserId != null && incomingEngineer.userId === existingEngineer.signedByUserId);
  const canKeepExistingSignature =
    Boolean(existingEngineer.signatureDataUrl) && sameEngineerProfile && incomingEngineer.name.trim() === existingEngineer.name.trim();

  incoming.pat.engineer = {
    ...incomingEngineer,
    ...(canKeepExistingSignature
      ? {
          signatureDataUrl: existingEngineer.signatureDataUrl,
          signedAt: existingEngineer.signedAt,
          signedByUserId: existingEngineer.signedByUserId,
          signedByOfficerId: existingEngineer.signedByOfficerId,
        }
      : EMPTY_PAT_SIGNATURE),
  };
  return incoming;
}

function withoutPatSignatureFields(doc: ElectricalCertificateDocument): ElectricalCertificateDocument {
  if (!doc.pat) return doc;
  doc.pat.engineer = {
    ...doc.pat.engineer,
    ...EMPTY_PAT_SIGNATURE,
  };
  return doc;
}

async function loadCertificate(
  pool: Pool,
  id: number,
  userId: number,
  isSuperAdmin: boolean,
) {
  const r = await pool.query(
    `SELECT ec.*, c.full_name AS customer_full_name,
      COALESCE(
        NULLIF(TRIM(wa.name), ''),
        NULLIF(TRIM(CONCAT_WS(', ', wa.address_line_1, wa.town, wa.postcode)), ''),
        'Installation'
      ) AS installation_label
     FROM electrical_certificates ec
     JOIN customers c ON c.id = ec.customer_id
     LEFT JOIN customer_work_addresses wa ON wa.id = ec.work_address_id
     WHERE ec.id = $1 ${isSuperAdmin ? '' : 'AND ec.created_by = $2'}`,
    isSuperAdmin ? [id] : [id, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return mapRow(r.rows[0] as Record<string, unknown>);
}

export function mountElectricalCertificateRoutes(app: Application, deps: ElectricalCertificateRouteDeps): void {
  const { pool, authenticate } = deps;
  const guard = [authenticate, requireTenantCrmAccess('certifications')] as const;

  app.get('/api/electrical-certificates', ...guard, async (req: Request, res: Response) => {
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const params: unknown[] = [];
    const where: string[] = [];
    if (!isSuperAdmin) {
      params.push(userId);
      where.push(`ec.created_by = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(ec.certificate_number ILIKE $${params.length} OR ec.job_number ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`,
      );
    }
    if (status) {
      params.push(status);
      where.push(`ec.status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countR = await pool.query(
      `SELECT COUNT(*)::int AS total FROM electrical_certificates ec JOIN customers c ON c.id = ec.customer_id ${whereSql}`,
      params,
    );
    const total = (countR.rows[0] as { total: number }).total;

    params.push(limit, offset);
    const listR = await pool.query(
      `SELECT ec.*, c.full_name AS customer_full_name,
        COALESCE(NULLIF(TRIM(wa.name), ''), NULLIF(TRIM(CONCAT_WS(', ', wa.address_line_1, wa.town, wa.postcode)), ''), 'Installation') AS installation_label
       FROM electrical_certificates ec
       JOIN customers c ON c.id = ec.customer_id
       LEFT JOIN customer_work_addresses wa ON wa.id = ec.work_address_id
       ${whereSql}
       ORDER BY ec.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return res.json({
      certificates: listR.rows.map((row) => mapRow(row as Record<string, unknown>)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  });

  app.get('/api/electrical-certificates/branding', ...guard, async (req: Request, res: Response) => {
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    try {
      const branding = await loadCompanyBranding(pool, userId);
      return res.json({ branding });
    } catch (e) {
      console.error('Certificate branding error:', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/electrical-certificates/engineers', ...guard, async (req: Request, res: Response) => {
    const tenantOwnerUserId = getTenantScopeUserId((req as AuthReq).user!);
    try {
      const engineers = await loadCertificateTeamMembers(pool, tenantOwnerUserId);
      return res.json({ engineers });
    } catch (error) {
      console.error('Certificate engineers error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/electrical-certificates/numbering-settings', ...guard, async (req: Request, res: Response) => {
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const types: ElectricalCertificateDocument['typeSlug'][] = [
      'eicr_18e_a3',
      'portable_appliance_test',
      'fi_insp_2025',
      'dfi_insp_2019_a1',
    ];
    try {
      for (const typeSlug of types) await ensureNumberSetting(pool, userId, typeSlug);
      const rows = await pool.query<{ type_slug: string; prefix: string; next_number: number }>(
        `SELECT type_slug, prefix, next_number
         FROM electrical_certificate_number_settings
         WHERE created_by = $1
         ORDER BY type_slug ASC`,
        [userId],
      );
      return res.json({
        settings: rows.rows.map((row) => ({
          type_slug: row.type_slug,
          prefix: row.prefix,
          next_number: Number(row.next_number) || 1,
        })),
      });
    } catch (error) {
      console.error('Certificate numbering settings error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/electrical-certificates/numbering-settings', ...guard, async (req: Request, res: Response) => {
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const body = req.body as { settings?: unknown };
    const items = Array.isArray(body.settings) ? (body.settings as Record<string, unknown>[]) : [];
    try {
      for (const item of items) {
        const typeSlug = normalizeCertificateTypeSlug(item.type_slug);
        const prefixRaw = typeof item.prefix === 'string' ? item.prefix.trim() : defaultCertificatePrefix(typeSlug);
        const prefix = (prefixRaw || defaultCertificatePrefix(typeSlug)).replace(/\s+/g, '-').slice(0, 30);
        const nextNumberRaw =
          typeof item.next_number === 'number' && Number.isFinite(item.next_number)
            ? Math.trunc(item.next_number)
            : typeof item.next_number === 'string' && item.next_number.trim()
              ? parseInt(item.next_number.trim(), 10)
              : 1;
        const nextNumber = Math.max(1, Number.isFinite(nextNumberRaw) ? nextNumberRaw : 1);
        await pool.query(
          `INSERT INTO electrical_certificate_number_settings (created_by, type_slug, prefix, next_number, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (created_by, type_slug)
           DO UPDATE SET prefix = EXCLUDED.prefix, next_number = EXCLUDED.next_number, updated_at = NOW()`,
          [userId, typeSlug, prefix, nextNumber],
        );
      }
      const rows = await pool.query<{ type_slug: string; prefix: string; next_number: number }>(
        `SELECT type_slug, prefix, next_number
         FROM electrical_certificate_number_settings
         WHERE created_by = $1
         ORDER BY type_slug ASC`,
        [userId],
      );
      return res.json({
        settings: rows.rows.map((row) => ({
          type_slug: row.type_slug,
          prefix: row.prefix,
          next_number: Number(row.next_number) || 1,
        })),
      });
    } catch (error) {
      console.error('Update certificate numbering settings error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/electrical-certificates/pat-defaults', ...guard, async (req: Request, res: Response) => {
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    try {
      const testEquipment = await loadPatTestEquipmentDefaults(pool, userId);
      return res.json({ testEquipment });
    } catch (error) {
      console.error('PAT defaults settings error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/electrical-certificates/pat-defaults', ...guard, async (req: Request, res: Response) => {
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const body = req.body as { testEquipment?: unknown };
    const raw = body.testEquipment && typeof body.testEquipment === 'object'
      ? (body.testEquipment as Record<string, unknown>)
      : {};

    try {
      const testEquipment = await savePatTestEquipmentDefaults(pool, userId, {
        make: typeof raw.make === 'string' ? raw.make : '',
        serialNo: typeof raw.serialNo === 'string' ? raw.serialNo : '',
        notes: typeof raw.notes === 'string' ? raw.notes : '',
      });
      return res.json({ testEquipment });
    } catch (error) {
      console.error('Update PAT defaults settings error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/electrical-certificates/:id/pat-engineer-signature', ...guard, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const authUser = (req as AuthReq).user!;
    const userId = getTenantScopeUserId(authUser);
    const isSuperAdmin = authUser.role === 'SUPER_ADMIN';
    const body = req.body as { engineer_key?: unknown; officer_id?: unknown; user_id?: unknown; signature_data_url?: unknown };
    const signatureDataUrl = typeof body.signature_data_url === 'string' ? body.signature_data_url.trim() : '';
    const engineerKey = typeof body.engineer_key === 'string' ? body.engineer_key.trim() : '';

    if (!signatureDataUrl.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ message: 'A PNG signature is required' });
    }
    if (signatureDataUrl.length > 500_000) {
      return res.status(400).json({ message: 'Signature image is too large' });
    }

    const existing = await loadCertificate(pool, id, userId, isSuperAdmin);
    if (!existing) return res.status(404).json({ message: 'Certificate not found' });
    if (existing.type_slug !== 'portable_appliance_test' || !existing.document.pat) {
      return res.status(400).json({ message: 'Engineer signatures are only available for PAT certificates' });
    }

    const teamMembers = await loadCertificateTeamMembers(pool, userId);
    let selected: CertificateTeamMember | undefined;
    if (engineerKey) {
      selected = teamMembers.find((member) => member.key === engineerKey);
    } else {
      const selectedOfficerId =
        typeof body.officer_id === 'number' && Number.isFinite(body.officer_id)
          ? Math.trunc(body.officer_id)
          : typeof body.officer_id === 'string' && body.officer_id.trim()
            ? parseInt(body.officer_id.trim(), 10)
            : NaN;
      const selectedUserId =
        typeof body.user_id === 'number' && Number.isFinite(body.user_id)
          ? Math.trunc(body.user_id)
          : typeof body.user_id === 'string' && body.user_id.trim()
            ? parseInt(body.user_id.trim(), 10)
            : NaN;
      if (Number.isFinite(selectedOfficerId)) {
        selected = teamMembers.find((member) => member.officer_id === selectedOfficerId);
      } else if (Number.isFinite(selectedUserId)) {
        selected = teamMembers.find((member) => member.user_id === selectedUserId);
      }
    }
    if (!selected) return res.status(400).json({ message: 'Engineer is required' });
    if (!memberCanBeSignedBy(selected, authUser.userId, authUser.officerId)) {
      return res.status(403).json({ message: 'You can only sign certificates as your own profile' });
    }

    const signedAt = new Date().toISOString();
    const document = coerceDocument(existing.document);
    document.pat = {
      ...document.pat!,
      engineer: {
        ...document.pat!.engineer,
        officerId: selected.officer_id,
        userId: selected.user_id,
        name: selected.full_name,
        signatureDataUrl,
        signedAt,
        signedByUserId: authUser.userId,
        signedByOfficerId: selected.officer_id,
      },
    };

    await pool.query(
      `UPDATE electrical_certificates
       SET document = $2::jsonb, updated_at = NOW(), updated_by = $3
       WHERE id = $1 ${isSuperAdmin ? '' : 'AND created_by = $4'}`,
      isSuperAdmin ? [id, JSON.stringify(document), userId] : [id, JSON.stringify(document), userId, userId],
    );

    const cert = await loadCertificate(pool, id, userId, isSuperAdmin);
    return res.json({ certificate: cert });
  });

  app.get('/api/electrical-certificates/:id/pdf', ...guard, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';

    const cert = await loadCertificate(pool, id, userId, isSuperAdmin);
    if (!cert) return res.status(404).json({ message: 'Certificate not found' });

    const ownerR = await pool.query<{ created_by: number }>(
      'SELECT created_by FROM electrical_certificates WHERE id = $1',
      [id],
    );
    const ownerUserId = Number(ownerR.rows[0]?.created_by);
    if (!Number.isFinite(ownerUserId)) {
      return res.status(500).json({ message: 'Invalid certificate owner' });
    }

    try {
      const { pdf, filenameBase } = await generateElectricalCertificatePdfBuffer(pool, {
        certificateId: id,
        ownerUserId,
        certificateNumber: cert.certificate_number,
        jobNumber: cert.job_number,
        customerName: cert.customer_full_name,
        installationLabel: cert.installation_label,
        documentRaw: cert.document,
      });
      const asciiName = `${filenameBase.replace(/[^\x20-\x7E]/g, '_')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"`);
      res.setHeader('Content-Length', String(pdf.length));
      return res.send(pdf);
    } catch (error: unknown) {
      if (error instanceof PdfRenderUnavailableError) {
        return res.status(503).json({ message: error.message });
      }
      console.error('Certificate PDF error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/electrical-certificates/:id', ...guard, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';
    const cert = await loadCertificate(pool, id, userId, isSuperAdmin);
    if (!cert) return res.status(404).json({ message: 'Certificate not found' });
    return res.json({ certificate: cert });
  });

  app.post('/api/electrical-certificates', ...guard, async (req: Request, res: Response) => {
    const body = req.body as {
      customer_id?: number;
      work_address_id?: number | null;
      job_id?: number | null;
      job_number?: string;
      type_slug?: string;
      document?: ElectricalCertificateDocument;
    };
    const customerId = typeof body.customer_id === 'number' ? body.customer_id : null;
    if (!customerId) return res.status(400).json({ message: 'Client is required' });

    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';

    const custCheck = await pool.query(
      `SELECT id, full_name,
              NULLIF(TRIM(CONCAT_WS(', ', address_line_1, address_line_2, town, county, postcode)), '') AS customer_address
       FROM customers WHERE id = $1` + (isSuperAdmin ? '' : ' AND created_by = $2'),
      isSuperAdmin ? [customerId] : [customerId, userId],
    );
    if ((custCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid client' });

    let workAddressId: number | null =
      body.work_address_id != null && Number.isFinite(body.work_address_id) ? body.work_address_id : null;
    let selectedInstallationAddress = '';
    if (workAddressId) {
      const wa = await pool.query<{
        id: number;
        name: string | null;
        address_label: string | null;
      }>(
        `SELECT id, name,
                NULLIF(TRIM(CONCAT_WS(', ', address_line_1, address_line_2, address_line_3, town, county, postcode)), '') AS address_label
         FROM customer_work_addresses WHERE id = $1 AND customer_id = $2`,
        [workAddressId, customerId],
      );
      if ((wa.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid installation' });
      const selected = wa.rows[0];
      selectedInstallationAddress = [selected.name, selected.address_label].filter(Boolean).join('\n');
    }

    const customer = custCheck.rows[0] as { full_name: string; customer_address: string | null };
    const customerName = customer.full_name;
    if (!selectedInstallationAddress) selectedInstallationAddress = customer.customer_address ?? '';
    const typeSlug = normalizeCertificateTypeSlug(body.type_slug);
    const doc = await applyBusinessDetailsDefaults(
      pool,
      (req as AuthReq).user!,
      withoutPatSignatureFields(body.document ? coerceDocument({ ...body.document, typeSlug }) : createDefaultDocument(typeSlug, customerName)),
    );
    if (!body.document) {
      doc.installation.occupierName = customerName;
      if (typeSlug === 'portable_appliance_test' && doc.pat) {
        doc.pat.jobAddress.customerName = customerName;
        doc.pat.jobAddress.address = selectedInstallationAddress;
      }
      if (typeSlug === 'fi_insp_2025' && doc.fireAlarm) {
        doc.fireAlarm.installation.occupierName = customerName;
      }
      if (typeSlug === 'dfi_insp_2019_a1' && doc.domesticFireAlarm) {
        doc.domesticFireAlarm.installation.occupierName = customerName;
      }
    }

    const jobNumber = typeof body.job_number === 'string' ? body.job_number.trim() || null : null;
    const certNumber = await generateCertificateNumber(pool, userId, typeSlug);

    try {
      const ins = await pool.query(
        `INSERT INTO electrical_certificates (certificate_number, job_number, type_slug, status, customer_id, work_address_id, job_id, document, created_by, updated_by)
         VALUES ($1, $2, $3, 'in_progress', $4, $5, $6, $7::jsonb, $8, $8)
         RETURNING id`,
        [
          certNumber,
          jobNumber,
          typeSlug,
          customerId,
          workAddressId,
          body.job_id && Number.isFinite(body.job_id) ? body.job_id : null,
          JSON.stringify(doc),
          userId,
        ],
      );
      const newId = (ins.rows[0] as { id: number }).id;
      const cert = await loadCertificate(pool, newId, userId, isSuperAdmin);
      return res.status(201).json({ certificate: cert });
    } catch (e) {
      console.error('Create electrical certificate error:', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/electrical-certificates/:id', ...guard, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';

    const existing = await loadCertificate(pool, id, userId, isSuperAdmin);
    if (!existing) return res.status(404).json({ message: 'Certificate not found' });

    const body = req.body as {
      job_number?: string;
      status?: CertificateStatus;
      document?: ElectricalCertificateDocument;
    };

    const updates: string[] = ['updated_at = NOW()', 'updated_by = $1'];
    const values: unknown[] = [userId];
    let idx = 2;

    if (typeof body.job_number === 'string') {
      updates.push(`job_number = $${idx++}`);
      values.push(body.job_number.trim() || null);
    }
    if (body.status === 'in_progress' || body.status === 'completed' || body.status === 'archived') {
      updates.push(`status = $${idx++}`);
      values.push(body.status);
    }
    if (body.document) {
      const nextDocument = withProtectedPatSignatureFields(coerceDocument(body.document), existing.document);
      updates.push(`document = $${idx++}::jsonb`);
      values.push(JSON.stringify(nextDocument));
    }

    values.push(id);
    const idParam = idx++;
    const ownerClause = isSuperAdmin ? '' : ` AND created_by = $${idx}`;
    if (!isSuperAdmin) values.push(userId);

    await pool.query(
      `UPDATE electrical_certificates SET ${updates.join(', ')} WHERE id = $${idParam}${ownerClause}`,
      values,
    );

    const cert = await loadCertificate(pool, id, userId, isSuperAdmin);
    return res.json({ certificate: cert });
  });

  app.delete('/api/electrical-certificates/:id', ...guard, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';
    const r = await pool.query(
      `DELETE FROM electrical_certificates WHERE id = $1${isSuperAdmin ? '' : ' AND created_by = $2'} RETURNING id`,
      isSuperAdmin ? [id] : [id, userId],
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Certificate not found' });
    return res.json({ ok: true });
  });

  app.post('/api/electrical-certificates/:id/validate', ...guard, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });
    const userId = getTenantScopeUserId((req as AuthReq).user!);
    const isSuperAdmin = (req as AuthReq).user!.role === 'SUPER_ADMIN';
    const cert = await loadCertificate(pool, id, userId, isSuperAdmin);
    if (!cert) return res.status(404).json({ message: 'Certificate not found' });
    const issues = validateElectricalCertificate(cert.document);
    return res.json({ issues, issueCount: issues.length });
  });
}
