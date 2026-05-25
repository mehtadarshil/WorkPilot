import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import { getTenantScopeUserId, requireTenantCrmAccess } from './tenantAccess';
import type { TenantAuthUser } from './tenantAccess';

type AuthReq = Request & { user?: TenantAuthUser };

export type JobNotesRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

type JobNoteRow = {
  id: number;
  job_id: number;
  title: string;
  description: string;
  created_at: Date;
  updated_at: Date;
  created_by_name: string | null;
};

function toJobNote(row: JobNoteRow) {
  return {
    id: row.id,
    job_id: row.job_id,
    title: row.title,
    description: row.description,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    created_by_name: row.created_by_name ?? null,
  };
}

async function ensureJobNotesSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_specific_notes (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_job_specific_notes_job_id ON job_specific_notes(job_id)');
  await pool.query("ALTER TABLE job_specific_notes ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0");
  await pool.query("ALTER TABLE job_specific_notes ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE job_specific_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()");
}

async function jobIsVisible(pool: Pool, jobId: number, user: TenantAuthUser): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') {
    const result = await pool.query('SELECT id FROM jobs WHERE id = $1', [jobId]);
    return (result.rowCount ?? 0) > 0;
  }
  const result = await pool.query('SELECT id FROM jobs WHERE id = $1 AND created_by = $2', [
    jobId,
    getTenantScopeUserId(user),
  ]);
  return (result.rowCount ?? 0) > 0;
}

function parseJobId(req: Request): number | null {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const jobId = parseInt(String(raw), 10);
  return Number.isFinite(jobId) ? jobId : null;
}

export function mountJobNotesRoutes(app: Application, deps: JobNotesRouteDeps): void {
  const { pool, authenticate } = deps;
  void ensureJobNotesSchema(pool).catch((err) => console.error('Migration error (job_specific_notes):', err));

  app.get('/api/jobs/:id/notes', authenticate, requireTenantCrmAccess('jobs'), async (req: Request, res: Response) => {
    const jobId = parseJobId(req);
    if (jobId == null) return res.status(400).json({ message: 'Invalid job id' });
    const user = (req as AuthReq).user!;

    try {
      if (!(await jobIsVisible(pool, jobId, user))) return res.status(404).json({ message: 'Job not found' });
      const result = await pool.query<JobNoteRow>(
        `SELECT n.id, n.job_id, n.title, n.description, n.created_at, n.updated_at,
                COALESCE(u.full_name, u.email) AS created_by_name
         FROM job_specific_notes n
         LEFT JOIN users u ON u.id = n.created_by
         WHERE n.job_id = $1
         ORDER BY n.sort_order ASC NULLS LAST, n.created_at DESC, n.id DESC`,
        [jobId],
      );
      return res.json({ notes: result.rows.map(toJobNote) });
    } catch (error) {
      console.error('List job notes error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/jobs/:id/notes', authenticate, requireTenantCrmAccess('jobs'), async (req: Request, res: Response) => {
    const jobId = parseJobId(req);
    if (jobId == null) return res.status(400).json({ message: 'Invalid job id' });
    const user = (req as AuthReq).user!;
    const body = req.body as { title?: unknown; description?: unknown };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!title || !description) return res.status(400).json({ message: 'Title and description are required' });

    try {
      if (!(await jobIsVisible(pool, jobId, user))) return res.status(404).json({ message: 'Job not found' });
      const result = await pool.query<JobNoteRow>(
        `INSERT INTO job_specific_notes (job_id, title, description, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, job_id, title, description, created_at, updated_at,
                   (SELECT COALESCE(full_name, email) FROM users WHERE id = $4) AS created_by_name`,
        [jobId, title, description, user.userId],
      );
      return res.status(201).json(toJobNote(result.rows[0]));
    } catch (error) {
      console.error('Create job note error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/jobs/:id/notes/:noteId', authenticate, requireTenantCrmAccess('jobs'), async (req: Request, res: Response) => {
    const jobId = parseJobId(req);
    const noteId = parseInt(String(req.params.noteId), 10);
    if (jobId == null || !Number.isFinite(noteId)) return res.status(400).json({ message: 'Invalid id' });
    const user = (req as AuthReq).user!;
    const body = req.body as { title?: unknown; description?: unknown };
    const title = typeof body.title === 'string' ? body.title.trim() : undefined;
    const description = typeof body.description === 'string' ? body.description.trim() : undefined;
    if (title === undefined && description === undefined) return res.status(400).json({ message: 'No fields to update' });
    if (title === '' || description === '') return res.status(400).json({ message: 'Title and description are required' });

    try {
      if (!(await jobIsVisible(pool, jobId, user))) return res.status(404).json({ message: 'Job not found' });
      const result = await pool.query<JobNoteRow>(
        `UPDATE job_specific_notes n
         SET title = COALESCE($3, n.title),
             description = COALESCE($4, n.description),
             updated_at = NOW()
         WHERE n.id = $1 AND n.job_id = $2
         RETURNING n.id, n.job_id, n.title, n.description, n.created_at, n.updated_at,
                   (SELECT COALESCE(u.full_name, u.email) FROM users u WHERE u.id = n.created_by) AS created_by_name`,
        [noteId, jobId, title ?? null, description ?? null],
      );
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Note not found' });
      return res.json(toJobNote(result.rows[0]));
    } catch (error) {
      console.error('Update job note error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/jobs/:id/notes/:noteId', authenticate, requireTenantCrmAccess('jobs'), async (req: Request, res: Response) => {
    const jobId = parseJobId(req);
    const noteId = parseInt(String(req.params.noteId), 10);
    if (jobId == null || !Number.isFinite(noteId)) return res.status(400).json({ message: 'Invalid id' });
    const user = (req as AuthReq).user!;

    try {
      if (!(await jobIsVisible(pool, jobId, user))) return res.status(404).json({ message: 'Job not found' });
      const result = await pool.query('DELETE FROM job_specific_notes WHERE id = $1 AND job_id = $2', [noteId, jobId]);
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ message: 'Note not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('Delete job note error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
