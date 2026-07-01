import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import { assertStaffPermissionAny, getTenantScopeUserId } from '../tenantAccess';
import type { TenantAuthUser } from '../tenantAccess';

type AuthReq = Request & { user?: TenantAuthUser };

type HolidayRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

function parseId(raw: unknown): number | null {
  const n = parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^\d{4}-\d{2}-\d{2}$/);
  return m ? m[0] : null;
}

function parseTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? new Date(raw).toISOString() : null;
}

function str(raw: unknown, max = 500): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v.length > 0 ? v.slice(0, max) : null;
}

function hasStaffPermission(user: TenantAuthUser): boolean {
  return assertStaffPermissionAny(user, ['field_users']);
}

function holidayRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    holiday_date: row.holiday_date instanceof Date
      ? row.holiday_date.toISOString().slice(0, 10)
      : String(row.holiday_date ?? '').slice(0, 10),
    is_recurring: row.is_recurring === true,
    created_by: row.created_by == null ? null : Number(row.created_by),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
  };
}

function holidayRequestRow(row: Record<string, unknown>) {
  const startRaw = row.start_date instanceof Date
    ? row.start_date.toISOString()
    : String(row.start_date ?? '');
  const endRaw = row.end_date instanceof Date
    ? row.end_date.toISOString()
    : String(row.end_date ?? '');
  const sqlDays = row.days_count != null ? Number(row.days_count) : null;
  return {
    id: Number(row.id),
    officer_id: row.officer_id == null ? null : Number(row.officer_id),
    officer_name: (row.officer_name as string | null) ?? null,
    start_date: startRaw,
    end_date: endRaw,
    leave_type: (row.leave_type as string) ?? 'annual',
    reason: (row.reason as string | null) ?? null,
    status: (row.status as string) ?? 'pending',
    approved_by: row.approved_by == null ? null : Number(row.approved_by),
    approved_by_name: (row.approved_by_name as string | null) ?? null,
    approved_at: row.approved_at instanceof Date ? row.approved_at.toISOString() : null,
    rejection_reason: (row.rejection_reason as string | null) ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
    days_count: computeHolidayDaysCount(startRaw, endRaw, sqlDays),
  };
}

function computeHolidayDaysCount(
  startDateStr: string,
  endDateStr: string,
  sqlDays: number | null,
): number | null {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return sqlDays;
  }
  const diffMs = end.getTime() - start.getTime();
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (diffMs <= 0 && sameDay) return 1;
  if (sameDay && diffMs < 24 * 60 * 60 * 1000) {
    if (diffMs < 60 * 60 * 1000) return 1;
    return Math.round((diffMs / (1000 * 60 * 60 * 24)) * 100) / 100;
  }
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const calendarDays = Math.round((endDay - startDay) / 86400000) + 1;
  if (calendarDays > 1 && diffMs >= (calendarDays - 1) * 86400000 * 0.9) {
    return calendarDays;
  }
  if (sqlDays != null && Number.isFinite(sqlDays)) return sqlDays;
  return Math.round((diffMs / 86400000) * 100) / 100;
}

async function fetchHolidayRequestById(pool: Pool, requestId: number) {
  const enriched = await pool.query(
    `SELECT hr.*,
            o.full_name AS officer_name,
            u.full_name AS approved_by_name,
            ROUND((EXTRACT(EPOCH FROM (hr.end_date - hr.start_date)) / 86400.0)::numeric, 2) AS days_count
     FROM holiday_requests hr
     JOIN officers o ON o.id = hr.officer_id
     LEFT JOIN users u ON u.id = hr.approved_by
     WHERE hr.id = $1`,
    [requestId],
  );
  const row = enriched.rows[0] as Record<string, unknown> | undefined;
  return row ? holidayRequestRow(row) : null;
}

export async function ensureHolidaySchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS holidays (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      holiday_date DATE NOT NULL,
      is_recurring BOOLEAN NOT NULL DEFAULT false,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_holidays_created_by ON holidays(created_by)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS holiday_requests (
      id SERIAL PRIMARY KEY,
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      leave_type VARCHAR(50) NOT NULL DEFAULT 'annual',
      reason TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('ALTER TABLE holiday_requests ALTER COLUMN start_date TYPE TIMESTAMPTZ USING start_date::timestamp WITH TIME ZONE');
  await pool.query('ALTER TABLE holiday_requests ALTER COLUMN end_date TYPE TIMESTAMPTZ USING end_date::timestamp WITH TIME ZONE');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_holiday_requests_officer ON holiday_requests(officer_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_holiday_requests_status ON holiday_requests(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_holiday_requests_dates ON holiday_requests(start_date, end_date)');
}

export function mountHolidayRoutes(app: Application, deps: HolidayRouteDeps): void {
  const { pool, authenticate } = deps;

  // ─── Company Holidays CRUD ───

  app.get('/api/holidays', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!hasStaffPermission(user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    try {
      let query = `SELECT * FROM holidays`;
      const params: unknown[] = [];
      const conditions: string[] = [];
      if (!isSuperAdmin) {
        conditions.push(`created_by = $${params.length + 1}`);
        params.push(userId);
      }
      if (from) {
        conditions.push(`holiday_date >= $${params.length + 1}::date`);
        params.push(from);
      }
      if (to) {
        conditions.push(`holiday_date <= $${params.length + 1}::date`);
        params.push(to);
      }
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      query += ` ORDER BY holiday_date ASC`;
      const result = await pool.query(query, params);
      return res.json({ holidays: result.rows.map(holidayRow) });
    } catch (error) {
      console.error('List holidays error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/holidays', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!hasStaffPermission(user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const body = req.body as Record<string, unknown>;
    const title = str(body.title, 255);
    if (!title) return res.status(400).json({ message: 'Title is required' });
    const holidayDate = parseDate(body.holiday_date);
    if (!holidayDate) return res.status(400).json({ message: 'Valid holiday_date is required (YYYY-MM-DD)' });
    const description = str(body.description, 2000);
    const isRecurring = body.is_recurring === true;
    try {
      const result = await pool.query(
        `INSERT INTO holidays (title, description, holiday_date, is_recurring, created_by)
         VALUES ($1, $2, $3::date, $4, $5)
         RETURNING *`,
        [title, description, holidayDate, isRecurring, user.userId],
      );
      return res.status(201).json({ holiday: holidayRow(result.rows[0] as Record<string, unknown>) });
    } catch (error) {
      console.error('Create holiday error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/holidays/:id', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!hasStaffPermission(user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const holidayId = parseId(req.params.id);
    if (!holidayId) return res.status(400).json({ message: 'Invalid holiday id' });
    const body = req.body as Record<string, unknown>;
    const title = str(body.title, 255);
    const holidayDate = parseDate(body.holiday_date);
    const description = str(body.description, 2000);
    const isRecurring = body.is_recurring === true;
    try {
      const result = await pool.query(
        `UPDATE holidays
         SET title = COALESCE($1, title),
             description = COALESCE($2, description),
             holiday_date = COALESCE($3::date, holiday_date),
             is_recurring = COALESCE($4, is_recurring)
         WHERE id = $5
         RETURNING *`,
        [title, description, holidayDate, isRecurring, holidayId],
      );
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Holiday not found' });
      return res.json({ holiday: holidayRow(result.rows[0] as Record<string, unknown>) });
    } catch (error) {
      console.error('Update holiday error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/holidays/:id', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!hasStaffPermission(user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const holidayId = parseId(req.params.id);
    if (!holidayId) return res.status(400).json({ message: 'Invalid holiday id' });
    try {
      const result = await pool.query('DELETE FROM holidays WHERE id = $1', [holidayId]);
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Holiday not found' });
      return res.json({ message: 'Holiday deleted' });
    } catch (error) {
      console.error('Delete holiday error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // ─── Holiday Requests ───

  app.get('/api/holiday-requests', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    if (!hasStaffPermission(user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const userId = getTenantScopeUserId(user);
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const officerId = parseId(req.query.officer_id);
    try {
      let query = `
        SELECT hr.*,
               o.full_name AS officer_name,
               u.full_name AS approved_by_name,
               ROUND((EXTRACT(EPOCH FROM (hr.end_date - hr.start_date)) / 86400.0)::numeric, 2) AS days_count
        FROM holiday_requests hr
        JOIN officers o ON o.id = hr.officer_id
        LEFT JOIN users u ON u.id = hr.approved_by
      `;
      const params: unknown[] = [];
      const conditions: string[] = [];
      if (!isSuperAdmin) {
        conditions.push(`o.created_by = $${params.length + 1}`);
        params.push(userId);
      }
      if (status && ['pending', 'approved', 'rejected'].includes(status)) {
        conditions.push(`hr.status = $${params.length + 1}`);
        params.push(status);
      }
      if (officerId) {
        conditions.push(`hr.officer_id = $${params.length + 1}`);
        params.push(officerId);
      }
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      query += ` ORDER BY hr.created_at DESC`;
      const result = await pool.query(query, params);
      return res.json({ requests: result.rows.map(holidayRequestRow) });
    } catch (error) {
      console.error('List holiday requests error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/holiday-requests', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    const body = req.body as Record<string, unknown>;
    const startDate = parseTimestamp(body.start_date);
    const endDate = parseTimestamp(body.end_date);
    if (!startDate) return res.status(400).json({ message: 'Valid start_date is required' });
    if (!endDate) return res.status(400).json({ message: 'Valid end_date is required' });
    if (startDate > endDate) return res.status(400).json({ message: 'start_date must be before or equal to end_date' });
    const leaveType = str(body.leave_type, 50) || 'annual';
    const reason = str(body.reason, 2000);
    const officerId = parseId(body.officer_id);
    let targetOfficerId: number;
    if (officerId && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'STAFF')) {
      targetOfficerId = officerId;
    } else if (user.officerId) {
      targetOfficerId = user.officerId;
    } else if (officerId) {
      targetOfficerId = officerId;
    } else {
      return res.status(400).json({ message: 'officer_id is required' });
    }
    try {
      const result = await pool.query(
        `INSERT INTO holiday_requests (officer_id, start_date, end_date, leave_type, reason, created_by)
         VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6)
         RETURNING *`,
        [targetOfficerId, startDate, endDate, leaveType, reason, user.userId],
      );
      return res.status(201).json({ request: holidayRequestRow(result.rows[0] as Record<string, unknown>) });
    } catch (error) {
      console.error('Create holiday request error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/holiday-requests/:id', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    const requestId = parseId(req.params.id);
    if (!requestId) return res.status(400).json({ message: 'Invalid request id' });
    const body = req.body as Record<string, unknown>;
    const status = typeof body.status === 'string' ? body.status.trim() : '';
    const hasStatusUpdate = ['approved', 'rejected'].includes(status);
    const startDate = body.start_date !== undefined ? parseTimestamp(body.start_date) : null;
    const endDate = body.end_date !== undefined ? parseTimestamp(body.end_date) : null;
    const leaveType = body.leave_type !== undefined ? (str(body.leave_type, 50) || 'annual') : null;
    const hasFieldUpdate =
      startDate != null ||
      endDate != null ||
      leaveType != null ||
      body.reason !== undefined;

    if (!hasStatusUpdate && !hasFieldUpdate) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    if ((hasStatusUpdate || hasFieldUpdate) && !hasStaffPermission(user)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    try {
      const current = await pool.query<{
        status: string;
        start_date: Date;
        end_date: Date;
      }>(
        'SELECT status, start_date, end_date FROM holiday_requests WHERE id = $1',
        [requestId],
      );
      if ((current.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Request not found' });
      const existing = current.rows[0]!;

      if (hasFieldUpdate) {
        const nextStart = startDate ?? existing.start_date.toISOString();
        const nextEnd = endDate ?? existing.end_date.toISOString();
        if (new Date(nextStart).getTime() > new Date(nextEnd).getTime()) {
          return res.status(400).json({ message: 'start_date must be before or equal to end_date' });
        }
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (startDate) {
        sets.push(`start_date = $${idx}::timestamptz`);
        params.push(startDate);
        idx += 1;
      }
      if (endDate) {
        sets.push(`end_date = $${idx}::timestamptz`);
        params.push(endDate);
        idx += 1;
      }
      if (leaveType != null) {
        sets.push(`leave_type = $${idx}`);
        params.push(leaveType);
        idx += 1;
      }
      if (body.reason !== undefined) {
        sets.push(`reason = $${idx}`);
        params.push(str(body.reason, 2000));
        idx += 1;
      }
      if (hasStatusUpdate) {
        const rejectionReason = status === 'rejected' ? str(body.rejection_reason, 2000) : null;
        sets.push(`status = $${idx}::varchar(30)`);
        params.push(status);
        idx += 1;
        sets.push(`approved_by = $${idx}`);
        params.push(user.userId);
        idx += 1;
        sets.push(`approved_at = CASE WHEN $${idx - 2}::varchar(30) = 'approved' THEN NOW() ELSE NULL END`);
        sets.push(`rejection_reason = $${idx}`);
        params.push(rejectionReason);
        idx += 1;
      }

      params.push(requestId);
      const result = await pool.query(
        `UPDATE holiday_requests SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id`,
        params,
      );
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Request not found' });

      const request = await fetchHolidayRequestById(pool, requestId);
      if (!request) return res.status(404).json({ message: 'Request not found' });
      return res.json({ request });
    } catch (error) {
      console.error('Update holiday request error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/holiday-requests/:id', authenticate, async (req: AuthReq, res: Response) => {
    const user = req.user!;
    const requestId = parseId(req.params.id);
    if (!requestId) return res.status(400).json({ message: 'Invalid request id' });
    try {
      let query = `DELETE FROM holiday_requests WHERE id = $1`;
      const params: unknown[] = [requestId];
      if (user.role === 'OFFICER' && user.officerId) {
        query += ` AND officer_id = $2`;
        params.push(user.officerId);
      }
      const result = await pool.query(query, params);
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Request not found' });
      return res.json({ message: 'Request deleted' });
    } catch (error) {
      console.error('Delete holiday request error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
