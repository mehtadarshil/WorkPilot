import type { Application, Request, Response } from 'express';
import type { Pool } from 'pg';
import { assertStaffPermissionAny, getTenantScopeUserId } from '../tenantAccess';
import type { TenantAuthUser } from '../tenantAccess';

type AuthReq = Request & { user?: TenantAuthUser };

type TodoRouteDeps = {
  pool: Pool;
  authenticate: (req: Request, res: Response, next: () => void) => void;
};

export async function ensureTodoSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      due_date DATE,
      due_time TIME,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed)`);
}

function todoRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    user_name: (row.user_name as string | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    due_date: row.due_date instanceof Date
      ? row.due_date.toISOString().slice(0, 10)
      : row.due_date != null ? String(row.due_date).slice(0, 10) : null,
    due_time: (row.due_time as string | null) ?? null,
    completed: row.completed === true,
    completed_at: row.completed_at instanceof Date ? row.completed_at.toISOString() : null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : null,
  };
}

function str(raw: unknown, max = 500): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v.length > 0 ? v.slice(0, max) : null;
}

function parseDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^\d{4}-\d{2}-\d{2}$/);
  return m ? m[0] : null;
}

function parseTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^\d{2}:\d{2}(:\d{2})?$/);
  return m ? m[0] : null;
}

export function mountTodoRoutes(app: Application, deps: TodoRouteDeps): void {
  const { pool, authenticate } = deps;

  // GET /api/todos - list todos (own for regular users, all for admins/super admins)
  app.get('/api/todos', authenticate, async (req: AuthReq, res: Response) => {
    if (!assertStaffPermissionAny(req.user!, ['todos'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const userId = getTenantScopeUserId(req.user!);
    const role = req.user!.role;
    const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

    try {
      const completedFilter = typeof req.query.completed === 'string' ? req.query.completed : null;
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (!isAdmin) {
        conditions.push(`t.user_id = $${paramIdx++}`);
        params.push(userId);
      } else if (typeof req.query.user_id === 'string' && req.query.user_id.trim()) {
        const filterUserId = parseInt(req.query.user_id.trim(), 10);
        if (Number.isFinite(filterUserId)) {
          conditions.push(`t.user_id = $${paramIdx++}`);
          params.push(filterUserId);
        }
      }

      if (completedFilter === 'true') {
        conditions.push('t.completed = TRUE');
      } else if (completedFilter === 'false') {
        conditions.push('t.completed = FALSE');
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT t.id, t.user_id, u.full_name AS user_name, t.title, t.description,
                t.due_date, t.due_time, t.completed, t.completed_at, t.created_at, t.updated_at
         FROM todos t
         LEFT JOIN users u ON u.id = t.user_id
         ${whereClause}
         ORDER BY t.completed ASC, t.due_date ASC NULLS LAST, t.created_at DESC`,
        params,
      );

      return res.json({ todos: result.rows.map(todoRow) });
    } catch (err) {
      console.error('List todos error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // POST /api/todos - create a todo
  app.post('/api/todos', authenticate, async (req: AuthReq, res: Response) => {
    if (!assertStaffPermissionAny(req.user!, ['todos'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const userId = getTenantScopeUserId(req.user!);
    const body = req.body as Record<string, unknown>;

    const title = str(body.title, 500);
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 5000) : null;
    const dueDate = parseDate(body.due_date);
    const dueTime = parseTime(body.due_time);

    // Admins can assign to other users
    const role = req.user!.role;
    const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
    let assignedUserId = userId;
    if (isAdmin && typeof body.user_id === 'string') {
      const parsed = parseInt(body.user_id.trim(), 10);
      if (Number.isFinite(parsed)) assignedUserId = parsed;
    }

    try {
      const result = await pool.query(
        `INSERT INTO todos (user_id, title, description, due_date, due_time)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [assignedUserId, title, description, dueDate || null, dueTime || null],
      );

      const todoId = result.rows[0].id;

      const row = await pool.query(
        `SELECT t.id, t.user_id, u.full_name AS user_name, t.title, t.description,
                t.due_date, t.due_time, t.completed, t.completed_at, t.created_at, t.updated_at
         FROM todos t
         LEFT JOIN users u ON u.id = t.user_id
         WHERE t.id = $1`,
        [todoId],
      );

      return res.status(201).json({ todo: todoRow(row.rows[0]) });
    } catch (err) {
      console.error('Create todo error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // PATCH /api/todos/:id - update a todo
  app.patch('/api/todos/:id', authenticate, async (req: AuthReq, res: Response) => {
    if (!assertStaffPermissionAny(req.user!, ['todos'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const userId = getTenantScopeUserId(req.user!);
    const role = req.user!.role;
    const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
    const todoId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(todoId)) {
      return res.status(400).json({ message: 'Invalid todo id' });
    }

    try {
      // Check ownership (admins can edit any)
      const existing = await pool.query('SELECT user_id FROM todos WHERE id = $1', [todoId]);
      if ((existing.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Todo not found' });
      }
      if (!isAdmin && existing.rows[0].user_id !== userId) {
        return res.status(403).json({ message: 'You can only edit your own todos' });
      }

      const body = req.body as Record<string, unknown>;
      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (typeof body.title === 'string') {
        const title = body.title.trim().slice(0, 500);
        if (title) {
          updates.push(`title = $${paramIdx++}`);
          params.push(title);
        }
      }
      if (body.description !== undefined) {
        updates.push(`description = $${paramIdx++}`);
        params.push(typeof body.description === 'string' ? body.description.trim().slice(0, 5000) : null);
      }
      if (body.due_date !== undefined) {
        updates.push(`due_date = $${paramIdx++}`);
        params.push(parseDate(body.due_date));
      }
      if (body.due_time !== undefined) {
        updates.push(`due_time = $${paramIdx++}`);
        params.push(parseTime(body.due_time));
      }
      if (typeof body.completed === 'boolean') {
        updates.push(`completed = $${paramIdx++}`);
        params.push(body.completed);
        if (body.completed) {
          updates.push(`completed_at = NOW()`);
        } else {
          updates.push(`completed_at = NULL`);
        }
      }
      if (isAdmin && typeof body.user_id === 'string') {
        const parsed = parseInt(body.user_id.trim(), 10);
        if (Number.isFinite(parsed)) {
          updates.push(`user_id = $${paramIdx++}`);
          params.push(parsed);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      params.push(todoId);

      const result = await pool.query(
        `UPDATE todos SET ${updates.join(', ')} WHERE id = $${paramIdx}
         RETURNING id`,
        params,
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Todo not found' });
      }

      const row = await pool.query(
        `SELECT t.id, t.user_id, u.full_name AS user_name, t.title, t.description,
                t.due_date, t.due_time, t.completed, t.completed_at, t.created_at, t.updated_at
         FROM todos t
         LEFT JOIN users u ON u.id = t.user_id
         WHERE t.id = $1`,
        [todoId],
      );

      return res.json({ todo: todoRow(row.rows[0]) });
    } catch (err) {
      console.error('Update todo error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // DELETE /api/todos/:id - delete a todo
  app.delete('/api/todos/:id', authenticate, async (req: AuthReq, res: Response) => {
    if (!assertStaffPermissionAny(req.user!, ['todos'])) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    const userId = getTenantScopeUserId(req.user!);
    const role = req.user!.role;
    const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
    const todoId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(todoId)) {
      return res.status(400).json({ message: 'Invalid todo id' });
    }

    try {
      const existing = await pool.query('SELECT user_id FROM todos WHERE id = $1', [todoId]);
      if ((existing.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Todo not found' });
      }
      if (!isAdmin && existing.rows[0].user_id !== userId) {
        return res.status(403).json({ message: 'You can only delete your own todos' });
      }

      await pool.query('DELETE FROM todos WHERE id = $1', [todoId]);
      return res.json({ message: 'Todo deleted' });
    } catch (err) {
      console.error('Delete todo error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
