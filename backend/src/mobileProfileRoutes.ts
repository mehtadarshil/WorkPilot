import type { Express, NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
type AuthReq = Request & {
  user?: {
    userId: number;
    email: string;
    role: string;
    officerId?: number | null;
  };
};

const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function getProfilePhotosRoot(): string {
  const raw = process.env.WORKPILOT_MOBILE_PROFILE_PHOTOS_DIR;
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'mobile-profile-photos');
}

function profilePhotoDir(kind: 'officer' | 'user', id: number): string {
  return path.join(getProfilePhotosRoot(), `${kind}_${id}`);
}

function optionalTrim(v: unknown, maxLen: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}

type ProfileSubject =
  | { kind: 'officer'; id: number }
  | { kind: 'user'; id: number };

async function resolveProfileSubject(
  pool: Pool,
  u: NonNullable<AuthReq['user']>,
): Promise<ProfileSubject | null> {
  if (u.officerId != null && Number.isFinite(u.officerId)) {
    const chk = await pool.query<{ id: number }>(`SELECT id FROM officers WHERE id = $1`, [u.officerId]);
    if ((chk.rowCount ?? 0) > 0) return { kind: 'officer', id: u.officerId };
  }
  const uid = u.userId;
  if (Number.isFinite(uid)) {
    const chk = await pool.query<{ id: number }>(`SELECT id FROM users WHERE id = $1`, [uid]);
    if ((chk.rowCount ?? 0) > 0) return { kind: 'user', id: uid };
  }
  return null;
}

function rowToProfilePayload(
  subject: ProfileSubject,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const hasPhoto =
    typeof row.profile_photo_filename === 'string' && String(row.profile_photo_filename).trim().length > 0;
  const base: Record<string, unknown> = {
    subject_kind: subject.kind,
    id: subject.id,
    full_name: row.full_name ?? '',
    email: row.email ?? null,
    phone: row.phone ?? null,
    mobile_phone: row.mobile_phone ?? null,
    landline_phone: row.landline_phone ?? null,
    profile_address: row.profile_address ?? null,
    profile_notes: row.profile_notes ?? null,
    next_of_kin_name: row.next_of_kin_name ?? null,
    next_of_kin_phone: row.next_of_kin_phone ?? null,
    next_of_kin_relationship: row.next_of_kin_relationship ?? null,
    has_profile_photo: hasPhoto,
  };
  if (subject.kind === 'officer') {
    base.department = row.department ?? null;
    base.role_position = row.role_position ?? null;
    base.state = row.state ?? null;
  }
  return base;
}

async function loadProfileRow(pool: Pool, subject: ProfileSubject): Promise<Record<string, unknown> | null> {
  if (subject.kind === 'officer') {
    const r = await pool.query(
      `SELECT id, full_name, email, phone, mobile_phone, landline_phone, department, role_position, state,
              profile_address, profile_notes, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
              profile_photo_filename
       FROM officers WHERE id = $1`,
      [subject.id],
    );
    return (r.rowCount ?? 0) > 0 ? (r.rows[0] as Record<string, unknown>) : null;
  }
  const r = await pool.query(
    `SELECT id, email, full_name, phone, mobile_phone, landline_phone, address AS profile_address, notes AS profile_notes,
            next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, profile_photo_filename
     FROM users WHERE id = $1`,
    [subject.id],
  );
  return (r.rowCount ?? 0) > 0 ? (r.rows[0] as Record<string, unknown>) : null;
}

function parseDataUrlImage(dataUrl: string): { buf: Buffer; ext: string } | null {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'jpg' ? 'jpg' : m[1].toLowerCase();
  try {
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length === 0 || buf.length > PROFILE_PHOTO_MAX_BYTES) return null;
    return { buf, ext };
  } catch {
    return null;
  }
}

export function mountMobileProfileRoutes(
  app: Express,
  deps: {
    pool: Pool;
    authenticate: (req: Request, res: Response, next: NextFunction) => void;
  },
): void {
  const { pool, authenticate } = deps;

  app.get('/api/mobile/profile', authenticate, async (req: Request, res: Response) => {
    const u = (req as AuthReq).user;
    if (!u) return res.status(401).json({ message: 'Unauthorized' });
    try {
      const subject = await resolveProfileSubject(pool, u);
      if (!subject) return res.status(404).json({ message: 'Profile not found' });
      const row = await loadProfileRow(pool, subject);
      if (!row) return res.status(404).json({ message: 'Profile not found' });
      return res.json({ profile: rowToProfilePayload(subject, row) });
    } catch (e) {
      console.error('mobile profile get', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/mobile/profile', authenticate, async (req: Request, res: Response) => {
    const u = (req as AuthReq).user;
    if (!u) return res.status(401).json({ message: 'Unauthorized' });
    const body = req.body as Record<string, unknown>;
    try {
      const subject = await resolveProfileSubject(pool, u);
      if (!subject) return res.status(404).json({ message: 'Profile not found' });

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      const add = (col: string, val: unknown) => {
        updates.push(`${col} = $${idx++}`);
        values.push(val);
      };

      const fullName = optionalTrim(body.full_name, 255);
      if (fullName !== undefined) {
        if (subject.kind === 'officer' && fullName === null) {
          /* keep existing name — officers.full_name is NOT NULL */
        } else {
          add('full_name', fullName);
        }
      }

      const phone = optionalTrim(body.phone, 50);
      if (phone !== undefined) add('phone', phone);
      const mobile = optionalTrim(body.mobile_phone, 50);
      if (mobile !== undefined) add('mobile_phone', mobile);
      const landline = optionalTrim(body.landline_phone, 50);
      if (landline !== undefined) add('landline_phone', landline);

      const addr = optionalTrim(body.profile_address, 2000);
      if (addr !== undefined) {
        if (subject.kind === 'user') add('address', addr);
        else add('profile_address', addr);
      }

      const notes = optionalTrim(body.profile_notes, 4000);
      if (notes !== undefined) {
        if (subject.kind === 'user') add('notes', notes);
        else add('profile_notes', notes);
      }

      const kinName = optionalTrim(body.next_of_kin_name, 200);
      if (kinName !== undefined) add('next_of_kin_name', kinName);
      const kinPhone = optionalTrim(body.next_of_kin_phone, 50);
      if (kinPhone !== undefined) add('next_of_kin_phone', kinPhone);
      const kinRel = optionalTrim(body.next_of_kin_relationship, 100);
      if (kinRel !== undefined) add('next_of_kin_relationship', kinRel);

      if (subject.kind === 'officer') {
        const email = optionalTrim(body.email, 255);
        if (email !== undefined) add('email', email?.toLowerCase() ?? null);
        const dept = optionalTrim(body.department, 120);
        if (dept !== undefined) add('department', dept);
        const role = optionalTrim(body.role_position, 120);
        if (role !== undefined) add('role_position', role);
        updates.push('updated_at = NOW()');
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      values.push(subject.id);
      const table = subject.kind === 'officer' ? 'officers' : 'users';
      await pool.query(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = $${idx}`, values);

      const row = await loadProfileRow(pool, subject);
      if (!row) return res.status(404).json({ message: 'Profile not found' });
      return res.json({ profile: rowToProfilePayload(subject, row) });
    } catch (e) {
      console.error('mobile profile patch', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/mobile/profile/photo', authenticate, async (req: Request, res: Response) => {
    const u = (req as AuthReq).user;
    if (!u) return res.status(401).json({ message: 'Unauthorized' });
    const body = req.body as { image?: unknown; remove?: unknown };
    try {
      const subject = await resolveProfileSubject(pool, u);
      if (!subject) return res.status(404).json({ message: 'Profile not found' });

      if (body.remove === true) {
        const row = await loadProfileRow(pool, subject);
        const prev =
          row && typeof row.profile_photo_filename === 'string' ? row.profile_photo_filename.trim() : '';
        if (prev) {
          await fs.unlink(path.join(profilePhotoDir(subject.kind, subject.id), path.basename(prev))).catch(() => {});
        }
        const table = subject.kind === 'officer' ? 'officers' : 'users';
        await pool.query(`UPDATE ${table} SET profile_photo_filename = NULL WHERE id = $1`, [subject.id]);
        const updated = await loadProfileRow(pool, subject);
        return res.json({
          profile: rowToProfilePayload(subject, updated ?? {}),
        });
      }

      const image = typeof body.image === 'string' ? body.image : '';
      const parsed = parseDataUrlImage(image);
      if (!parsed) {
        return res.status(400).json({ message: 'Invalid image (use JPEG, PNG, or WebP under 5MB)' });
      }

      const dir = profilePhotoDir(subject.kind, subject.id);
      await fs.mkdir(dir, { recursive: true });
      const filename = `photo.${parsed.ext}`;
      const fullPath = path.join(dir, filename);
      await fs.writeFile(fullPath, parsed.buf);

      const table = subject.kind === 'officer' ? 'officers' : 'users';
      await pool.query(`UPDATE ${table} SET profile_photo_filename = $1 WHERE id = $2`, [filename, subject.id]);
      if (subject.kind === 'officer') {
        await pool.query(`UPDATE officers SET updated_at = NOW() WHERE id = $1`, [subject.id]);
      }

      const row = await loadProfileRow(pool, subject);
      return res.json({ profile: rowToProfilePayload(subject, row ?? {}) });
    } catch (e) {
      console.error('mobile profile photo', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/mobile/profile/photo', authenticate, async (req: Request, res: Response) => {
    const u = (req as AuthReq).user;
    if (!u) return res.status(401).json({ message: 'Unauthorized' });
    try {
      const subject = await resolveProfileSubject(pool, u);
      if (!subject) return res.status(404).json({ message: 'Not found' });
      const row = await loadProfileRow(pool, subject);
      const fn =
        row && typeof row.profile_photo_filename === 'string' ? path.basename(row.profile_photo_filename.trim()) : '';
      if (!fn) return res.status(404).json({ message: 'No photo' });
      const fullPath = path.join(profilePhotoDir(subject.kind, subject.id), fn);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat?.isFile()) return res.status(404).json({ message: 'Not found' });
      const ext = path.extname(fullPath).toLowerCase();
      const ct =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.setHeader('Content-Type', ct);
      res.setHeader('Content-Length', String(stat.size));
      return createReadStream(fullPath).pipe(res);
    } catch (e) {
      console.error('mobile profile photo get', e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}

export async function ensureMobileProfileColumns(pool: Pool): Promise<void> {
  const officerCols = [
    'mobile_phone VARCHAR(50)',
    'landline_phone VARCHAR(50)',
    'profile_address TEXT',
    'profile_notes TEXT',
    'next_of_kin_name VARCHAR(200)',
    'next_of_kin_phone VARCHAR(50)',
    'next_of_kin_relationship VARCHAR(100)',
    'profile_photo_filename VARCHAR(255)',
  ];
  for (const def of officerCols) {
    await pool.query(`ALTER TABLE officers ADD COLUMN IF NOT EXISTS ${def}`);
  }
  const userCols = [
    'mobile_phone VARCHAR(50)',
    'landline_phone VARCHAR(50)',
    'next_of_kin_name VARCHAR(200)',
    'next_of_kin_phone VARCHAR(50)',
    'next_of_kin_relationship VARCHAR(100)',
    'profile_photo_filename VARCHAR(255)',
  ];
  for (const def of userCols) {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${def}`);
  }
}
