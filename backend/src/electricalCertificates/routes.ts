import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import { getTenantScopeUserId, requireTenantCrmAccess } from '../tenantAccess';
import type { TenantAuthUser } from '../tenantAccess';
import { coerceDocument, createDefaultDocument } from './documentDefaults';
import { validateElectricalCertificate } from './validation';
import type { CertificateStatus, ElectricalCertificateDocument } from './types';
import { loadCompanyBranding } from './companyBranding';
import { generateElectricalCertificatePdfBuffer } from './generateCertificatePdf';
import { PdfRenderUnavailableError } from '../jobClientReportPdf';

type AuthReq = Request & { user?: TenantAuthUser };

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
}

async function generateCertificateNumber(pool: Pool): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const num = `EICR-${ymd}-${suffix}`;
    const exists = await pool.query('SELECT 1 FROM electrical_certificates WHERE certificate_number = $1', [num]);
    if ((exists.rowCount ?? 0) === 0) return num;
  }
  throw new Error('Failed to generate unique certificate number');
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
    document: coerceDocument(row.document),
    customer_full_name: (row.customer_full_name as string | null) ?? null,
    installation_label: (row.installation_label as string | null) ?? null,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
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
      'SELECT id, full_name FROM customers WHERE id = $1' + (isSuperAdmin ? '' : ' AND created_by = $2'),
      isSuperAdmin ? [customerId] : [customerId, userId],
    );
    if ((custCheck.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid client' });

    let workAddressId: number | null =
      body.work_address_id != null && Number.isFinite(body.work_address_id) ? body.work_address_id : null;
    if (workAddressId) {
      const wa = await pool.query(
        'SELECT id FROM customer_work_addresses WHERE id = $1 AND customer_id = $2',
        [workAddressId, customerId],
      );
      if ((wa.rowCount ?? 0) === 0) return res.status(400).json({ message: 'Invalid installation' });
    }

    const customerName = (custCheck.rows[0] as { full_name: string }).full_name;
    const typeSlug =
      typeof body.type_slug === 'string' && body.type_slug.trim() ? body.type_slug.trim() : 'eicr_18e_a3';
    const doc = body.document ? coerceDocument(body.document) : createDefaultDocument();
    if (!body.document) {
      doc.installation.occupierName = customerName;
    }

    const jobNumber = typeof body.job_number === 'string' ? body.job_number.trim() || null : null;
    const certNumber = await generateCertificateNumber(pool);

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
      updates.push(`document = $${idx++}::jsonb`);
      values.push(JSON.stringify(coerceDocument(body.document)));
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
