import type { Application, Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import crypto from 'crypto';
import path from 'path';
import jwt from 'jsonwebtoken';
import { getTenantScopeUserId } from './tenantAccess';
import type { AuthenticatedRequest } from './tenantAccess';
import {
  writeWorkpilotFile,
  loadWorkpilotFile,
  sendWorkpilotFile,
  workpilotFileKey,
  workpilotFileUrl
} from './workpilotFileStorage';
import { decodeBase64ImageUpload } from './inlineBlobStorage';

function storeStockToolImage(
  category: 'stock-photos' | 'tool-photos' | 'uniform-photos',
  image_base64: string,
  original_filename?: string | null,
  content_type?: string | null,
): Promise<string> {
  const decoded = decodeBase64ImageUpload(image_base64, content_type, original_filename);
  if (!decoded) {
    throw new Error('Invalid image data');
  }
  const ext = decoded.extension || path.extname(original_filename || '') || '.png';
  const storedFilename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
  return writeWorkpilotFile(category, [], storedFilename, decoded.buffer, decoded.contentType).then(
    () => `/api/stock-tools/files/${category}/${storedFilename}`,
  );
}

export async function ensureStockToolsSchema(pool: Pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        mpn VARCHAR(255),
        quantity INTEGER NOT NULL DEFAULT 0,
        category VARCHAR(100) NOT NULL,
        quality VARCHAR(100) NOT NULL,
        location VARCHAR(100) NOT NULL,
        image_url VARCHAR(1024),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS stock_transactions (
        id SERIAL PRIMARY KEY,
        stock_item_id INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
        job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
        job_part_id INTEGER,
        quantity INTEGER NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS tools (
        id SERIAL PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        category VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'available',
        location VARCHAR(100) NOT NULL,
        image_url VARCHAR(1024),
        assigned_officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS job_tools (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS diary_event_tools (
        id SERIAL PRIMARY KEY,
        diary_event_id INTEGER NOT NULL REFERENCES diary_events(id) ON DELETE CASCADE,
        tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    await pool.query(`
      ALTER TABLE job_parts ADD COLUMN IF NOT EXISTS stock_item_id INTEGER REFERENCES stock_items(id) ON DELETE SET NULL;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_tools_settings (
        created_by INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        location_options JSONB NOT NULL DEFAULT '["Van","House","Store","Other"]'::jsonb,
        stock_category_options JSONB NOT NULL DEFAULT '["Electrical","Locksmith","Plumbing","HVAC","General"]'::jsonb,
        tool_category_options JSONB NOT NULL DEFAULT '["Power Tools","Hand Tools","Measurement","Safety","Other"]'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE stock_tools_settings
        ADD COLUMN IF NOT EXISTS stock_category_options JSONB NOT NULL DEFAULT '["Electrical","Locksmith","Plumbing","HVAC","General"]'::jsonb;
    `);
    await pool.query(`
      ALTER TABLE stock_tools_settings
        ADD COLUMN IF NOT EXISTS tool_category_options JSONB NOT NULL DEFAULT '["Power Tools","Hand Tools","Measurement","Safety","Other"]'::jsonb;
    `);
    await pool.query(`
      ALTER TABLE tools ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
    `);
    await pool.query(`
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS locations JSONB;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS uniforms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        category VARCHAR(100) NOT NULL,
        size VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'available',
        location VARCHAR(100) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        assigned_officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
        image_url VARCHAR(1024),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    await pool.query(`
      ALTER TABLE stock_tools_settings
        ADD COLUMN IF NOT EXISTS uniform_category_options JSONB NOT NULL DEFAULT '["Jacket","Hi-Vis","PPE","Fire Safety","Footwear","Branded","Other"]'::jsonb;
    `);
    await pool.query(`
      ALTER TABLE stock_tools_settings
        ADD COLUMN IF NOT EXISTS uniform_size_options JSONB NOT NULL DEFAULT '["XS","S","M","L","XL","XXL","XXXL","28","30","32","34","36","38","40","42","8","9","10","11","12"]'::jsonb;
    `);
    console.log('Stock, Tools and Uniform schema verified successfully.');
  } catch (error) {
    console.error('Error ensuring Stock and Tools schema:', error);
  }
}

export async function syncStockTransaction(
  pool: Pool,
  partId: number,
  jobId: number,
  stockItemId: number | null,
  quantity: number,
  status: string,
  userId: number
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const transRes = await client.query<{
      id: number;
      stock_item_id: number;
      quantity: number;
    }>(
      'SELECT id, stock_item_id, quantity FROM stock_transactions WHERE job_part_id = $1',
      [partId]
    );

    const oldTrans = transRes.rows[0];
    const isConsumedState = status === 'installed' || status === 'picked_up';
    const wantsConsumption = isConsumedState && stockItemId !== null;

    if (wantsConsumption) {
      if (oldTrans) {
        if (oldTrans.stock_item_id === stockItemId) {
          const oldQtyConsumed = -oldTrans.quantity;
          const diff = quantity - oldQtyConsumed;
          if (diff !== 0) {
            await client.query(
              'UPDATE stock_items SET quantity = quantity - $1 WHERE id = $2',
              [diff, stockItemId]
            );
            await client.query(
              'UPDATE stock_transactions SET quantity = $1 WHERE id = $2',
              [-quantity, oldTrans.id]
            );
          }
        } else {
          await client.query(
            'UPDATE stock_items SET quantity = quantity + $1 WHERE id = $2',
            [-oldTrans.quantity, oldTrans.stock_item_id]
          );
          await client.query(
            'UPDATE stock_items SET quantity = quantity - $1 WHERE id = $2',
            [quantity, stockItemId]
          );
          await client.query(
            `UPDATE stock_transactions 
             SET stock_item_id = $1, quantity = $2 
             WHERE id = $3`,
            [stockItemId, -quantity, oldTrans.id]
          );
        }
      } else {
        await client.query(
          'UPDATE stock_items SET quantity = quantity - $1 WHERE id = $2',
          [quantity, stockItemId]
        );
        await client.query(
          `INSERT INTO stock_transactions (stock_item_id, job_id, job_part_id, quantity, transaction_type, created_by)
           VALUES ($1, $2, $3, $4, 'consumption', $5)`,
          [stockItemId, jobId, partId, -quantity, userId]
        );
      }
    } else {
      if (oldTrans) {
        await client.query(
          'UPDATE stock_items SET quantity = quantity + $1 WHERE id = $2',
          [-oldTrans.quantity, oldTrans.stock_item_id]
        );
        await client.query(
          'DELETE FROM stock_transactions WHERE id = $1',
          [oldTrans.id]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error in syncStockTransaction:', err);
    throw err;
  } finally {
    client.release();
  }
}

const DEFAULT_STOCK_LOCATIONS = ['Van', 'House', 'Store', 'Other'];
const DEFAULT_STOCK_CATEGORIES = ['Electrical', 'Locksmith', 'Plumbing', 'HVAC', 'General'];
const DEFAULT_TOOL_CATEGORIES = ['Power Tools', 'Hand Tools', 'Measurement', 'Safety', 'Other'];
const DEFAULT_UNIFORM_CATEGORIES = ['Jacket', 'Hi-Vis', 'PPE', 'Fire Safety', 'Footwear', 'Branded', 'Other'];
const DEFAULT_UNIFORM_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '28', '30', '32', '34', '36', '38', '40', '42', '8', '9', '10', '11', '12'];

function parseStringOptions(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const cleaned = raw
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0);
  return cleaned.length > 0 ? cleaned : [...fallback];
}

async function loadStockToolsSettingsRow(
  pool: Pool,
  userId: number,
): Promise<{
  location_options: string[];
  stock_category_options: string[];
  tool_category_options: string[];
  uniform_category_options: string[];
  uniform_size_options: string[];
}> {
  const row = await pool.query<{
    location_options: unknown;
    stock_category_options: unknown;
    tool_category_options: unknown;
    uniform_category_options: unknown;
    uniform_size_options: unknown;
  }>(
    `SELECT location_options, stock_category_options, tool_category_options,
            uniform_category_options, uniform_size_options
     FROM stock_tools_settings WHERE created_by = $1`,
    [userId],
  );
  if ((row.rowCount ?? 0) === 0) {
    return {
      location_options: [...DEFAULT_STOCK_LOCATIONS],
      stock_category_options: [...DEFAULT_STOCK_CATEGORIES],
      tool_category_options: [...DEFAULT_TOOL_CATEGORIES],
      uniform_category_options: [...DEFAULT_UNIFORM_CATEGORIES],
      uniform_size_options: [...DEFAULT_UNIFORM_SIZES],
    };
  }
  const r = row.rows[0];
  return {
    location_options: parseStringOptions(r.location_options, DEFAULT_STOCK_LOCATIONS),
    stock_category_options: parseStringOptions(r.stock_category_options, DEFAULT_STOCK_CATEGORIES),
    tool_category_options: parseStringOptions(r.tool_category_options, DEFAULT_TOOL_CATEGORIES),
    uniform_category_options: parseStringOptions(r.uniform_category_options, DEFAULT_UNIFORM_CATEGORIES),
    uniform_size_options: parseStringOptions(r.uniform_size_options, DEFAULT_UNIFORM_SIZES),
  };
}


export function mountStockToolsRoutes(app: Application, deps: { pool: Pool; authenticate: any }) {
  const { pool, authenticate } = deps;

  app.get('/api/settings/stock-tools', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    try {
      const settings = await loadStockToolsSettingsRow(pool, userId);
      return res.json(settings);
    } catch (error) {
      console.error('Get stock tools settings error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/settings/stock-tools', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const body = req.body as {
      location_options?: unknown;
      stock_category_options?: unknown;
      tool_category_options?: unknown;
      uniform_category_options?: unknown;
      uniform_size_options?: unknown;
    };

    const current = await loadStockToolsSettingsRow(pool, userId);
    const location_options = body.location_options !== undefined
      ? parseStringOptions(body.location_options, DEFAULT_STOCK_LOCATIONS).slice(0, 30)
      : current.location_options;
    const stock_category_options = body.stock_category_options !== undefined
      ? parseStringOptions(body.stock_category_options, DEFAULT_STOCK_CATEGORIES).slice(0, 30)
      : current.stock_category_options;
    const tool_category_options = body.tool_category_options !== undefined
      ? parseStringOptions(body.tool_category_options, DEFAULT_TOOL_CATEGORIES).slice(0, 30)
      : current.tool_category_options;
    const uniform_category_options = body.uniform_category_options !== undefined
      ? parseStringOptions(body.uniform_category_options, DEFAULT_UNIFORM_CATEGORIES).slice(0, 30)
      : current.uniform_category_options;
    const uniform_size_options = body.uniform_size_options !== undefined
      ? parseStringOptions(body.uniform_size_options, DEFAULT_UNIFORM_SIZES).slice(0, 40)
      : current.uniform_size_options;

    if (
      location_options.length === 0
      || stock_category_options.length === 0
      || tool_category_options.length === 0
      || uniform_category_options.length === 0
      || uniform_size_options.length === 0
    ) {
      return res.status(400).json({ message: 'Each options list must have at least one entry' });
    }

    try {
      await pool.query(
        `INSERT INTO stock_tools_settings (
           created_by, location_options, stock_category_options, tool_category_options,
           uniform_category_options, uniform_size_options, updated_at
         )
         VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, NOW())
         ON CONFLICT (created_by) DO UPDATE
         SET location_options = EXCLUDED.location_options,
             stock_category_options = EXCLUDED.stock_category_options,
             tool_category_options = EXCLUDED.tool_category_options,
             uniform_category_options = EXCLUDED.uniform_category_options,
             uniform_size_options = EXCLUDED.uniform_size_options,
             updated_at = NOW()`,
        [
          userId,
          JSON.stringify(location_options),
          JSON.stringify(stock_category_options),
          JSON.stringify(tool_category_options),
          JSON.stringify(uniform_category_options),
          JSON.stringify(uniform_size_options),
        ],
      );
      return res.json({
        location_options,
        stock_category_options,
        tool_category_options,
        uniform_category_options,
        uniform_size_options,
      });
    } catch (error) {
      console.error('Patch stock tools settings error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Serve Stock & Tool Photos securely (only authenticated users)
  app.get(
    '/api/stock-tools/files/:category/:filename',
    async (req: Request, res: Response) => {
      let token: string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else if (req.query.token && typeof req.query.token === 'string') {
        token = req.query.token;
      }

      if (!token) {
        return res.status(401).json({ message: 'Missing or invalid token' });
      }

      try {
        const JWT_SECRET = process.env.JWT_SECRET?.trim() || 'dev-only-workpilot-jwt-secret-do-not-use-in-prod';
        jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
      }

      const category = String(req.params.category);
      const filename = String(req.params.filename);
      if (category !== 'stock-photos' && category !== 'tool-photos' && category !== 'uniform-photos') {
        return res.status(400).json({ message: 'Invalid file category' });
      }

      if (!filename || filename.includes('..') || path.isAbsolute(filename)) {
        return res.status(400).json({ message: 'Invalid file path' });
      }

      try {
        const file = await loadWorkpilotFile(category as any, [], filename);
        if (!file) {
          return res.status(404).json({ message: 'File not found' });
        }
        const ext = path.extname(filename).toLowerCase();
        let ct = 'application/octet-stream';
        if (['.jpg', '.jpeg'].includes(ext)) ct = 'image/jpeg';
        else if (ext === '.png') ct = 'image/png';
        else if (ext === '.gif') ct = 'image/gif';
        else if (ext === '.webp') ct = 'image/webp';

        return sendWorkpilotFile(res, file, ct, { cacheControl: 'private, max-age=3600' });
      } catch (err) {
        console.error('Error loading stock/tool file:', err);
        return res.status(404).json({ message: 'File not found' });
      }
    }
  );

  // ─── Stock Item Endpoints ───

  app.get('/api/stock', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const location = typeof req.query.location === 'string' ? req.query.location.trim() : '';

    try {
      let query = `SELECT * FROM stock_items WHERE 1=1`;
      const params: any[] = [];

      if (!isSuperAdmin) {
        params.push(userId);
        query += ` AND created_by = $${params.length}`;
      }

      if (search) {
        params.push(`%${search}%`);
        query += ` AND (name ILIKE $${params.length} OR mpn ILIKE $${params.length})`;
      }

      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }

      if (location) {
        params.push(location);
        query += ` AND location = $${params.length}`;
      }

      query += ` ORDER BY name ASC`;

      const result = await pool.query(query, params);
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching stock:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/stock', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const { name, mpn, quantity, category, quality, location, locations, image_base64, original_filename, content_type } = req.body;

    if (!name || !category || !quality) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    let resolvedLocations = locations;
    if (!Array.isArray(resolvedLocations) || resolvedLocations.length === 0) {
      resolvedLocations = [{ location: location || 'Store', quantity: typeof quantity === 'number' ? quantity : parseInt(String(quantity || '0'), 10) || 0 }];
    }

    const qty = resolvedLocations.reduce((sum: number, loc: any) => sum + (Number(loc.quantity) || 0), 0);
    const primaryLocation = resolvedLocations[0]?.location || 'Store';

    try {
      let imageUrl: string | null = null;
      if (image_base64) {
        imageUrl = await storeStockToolImage('stock-photos', image_base64, original_filename, content_type);
      }

      const ins = await pool.query(
        `INSERT INTO stock_items (name, mpn, quantity, category, quality, location, image_url, created_by, locations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [name, mpn || null, qty, category, quality, primaryLocation, imageUrl, userId, JSON.stringify(resolvedLocations)]
      );

      const newItem = ins.rows[0];

      if (qty > 0) {
        await pool.query(
          `INSERT INTO stock_transactions (stock_item_id, quantity, transaction_type, created_by)
           VALUES ($1, $2, 'addition', $3)`,
          [newItem.id, qty, userId]
        );
      }

      return res.status(201).json(newItem);
    } catch (err) {
      console.error('Error creating stock item:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/stock/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const itemId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(itemId)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const { name, mpn, quantity, category, quality, location, locations, image_base64, original_filename, content_type } = req.body;

    try {
      const itemCheck = await pool.query('SELECT * FROM stock_items WHERE id = $1', [itemId]);
      if ((itemCheck.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Stock item not found' });
      }
      const existing = itemCheck.rows[0];
      if (!isSuperAdmin && existing.created_by !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      let imageUrl = existing.image_url;
      if (image_base64) {
        imageUrl = await storeStockToolImage('stock-photos', image_base64, original_filename, content_type);
      }

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(name);
      }
      if (mpn !== undefined) {
        updates.push(`mpn = $${idx++}`);
        values.push(mpn || null);
      }
      if (category !== undefined) {
        updates.push(`category = $${idx++}`);
        values.push(category);
      }
      if (quality !== undefined) {
        updates.push(`quality = $${idx++}`);
        values.push(quality);
      }
      if (imageUrl !== existing.image_url) {
        updates.push(`image_url = $${idx++}`);
        values.push(imageUrl);
      }

      let newQty = existing.quantity;
      if (Array.isArray(locations)) {
        newQty = locations.reduce((sum: number, loc: any) => sum + (Number(loc.quantity) || 0), 0);
        const primaryLocation = locations[0]?.location || 'Store';

        updates.push(`locations = $${idx++}`);
        values.push(JSON.stringify(locations));

        updates.push(`location = $${idx++}`);
        values.push(primaryLocation);

        updates.push(`quantity = $${idx++}`);
        values.push(newQty);
      } else {
        if (location !== undefined) {
          updates.push(`location = $${idx++}`);
          values.push(location);
          const arr = Array.isArray(existing.locations) ? [...existing.locations] : [{ location: existing.location, quantity: existing.quantity }];
          if (arr.length > 0) {
            arr[0].location = location;
          }
          updates.push(`locations = $${idx++}`);
          values.push(JSON.stringify(arr));
        }
        if (quantity !== undefined) {
          newQty = typeof quantity === 'number' ? quantity : parseInt(String(quantity), 10) || 0;
          updates.push(`quantity = $${idx++}`);
          values.push(newQty);
          const arr = Array.isArray(existing.locations) ? [...existing.locations] : [{ location: existing.location, quantity: existing.quantity }];
          if (arr.length > 0) {
            arr[0].quantity = newQty;
          }
          updates.push(`locations = $${idx++}`);
          values.push(JSON.stringify(arr));
        }
      }

      if (updates.length > 0) {
        values.push(itemId);
        await pool.query(
          `UPDATE stock_items SET ${updates.join(', ')} WHERE id = $${idx}`,
          values
        );
      }

      if (newQty !== existing.quantity) {
        const delta = newQty - existing.quantity;
        await pool.query(
          `INSERT INTO stock_transactions (stock_item_id, quantity, transaction_type, created_by)
           VALUES ($1, $2, 'manual_adjustment', $3)`,
          [itemId, delta, userId]
        );
      }

      const updatedRes = await pool.query('SELECT * FROM stock_items WHERE id = $1', [itemId]);
      return res.json(updatedRes.rows[0]);
    } catch (err) {
      console.error('Error updating stock item:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/stock/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const itemId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(itemId)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    try {
      const itemCheck = await pool.query('SELECT created_by FROM stock_items WHERE id = $1', [itemId]);
      if ((itemCheck.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Stock item not found' });
      }
      if (!isSuperAdmin && itemCheck.rows[0].created_by !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      await pool.query('DELETE FROM stock_items WHERE id = $1', [itemId]);
      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting stock item:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/stock/:id/convert-to-tool', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const itemId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(itemId)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const rawQty = req.body?.quantity;
    const convertQty = typeof rawQty === 'number'
      ? Math.trunc(rawQty)
      : parseInt(String(rawQty ?? '1'), 10) || 1;
    if (convertQty <= 0) {
      return res.status(400).json({ message: 'Quantity must be at least 1' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const itemRes = await client.query('SELECT * FROM stock_items WHERE id = $1 FOR UPDATE', [itemId]);
      if ((itemRes.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Stock item not found' });
      }
      const item = itemRes.rows[0];
      if (!isSuperAdmin && item.created_by !== userId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Forbidden' });
      }
      if (item.quantity < convertQty) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Only ${item.quantity} unit(s) available in stock` });
      }

      const settings = await loadStockToolsSettingsRow(pool, userId);
      const toolCategory = settings.tool_category_options.includes('Other')
        ? 'Other'
        : settings.tool_category_options[0];

      const toolIns = await client.query(
        `INSERT INTO tools (name, category, status, location, quantity, image_url, created_by)
         VALUES ($1, $2, 'available', $3, $4, $5, $6)
         RETURNING *`,
        [item.name, toolCategory, item.location, convertQty, item.image_url, userId],
      );

      const newQty = item.quantity - convertQty;
      await client.query('UPDATE stock_items SET quantity = $1 WHERE id = $2', [newQty, itemId]);
      await client.query(
        `INSERT INTO stock_transactions (stock_item_id, quantity, transaction_type, created_by)
         VALUES ($1, $2, 'convert_to_tool', $3)`,
        [itemId, -convertQty, userId],
      );

      await client.query('COMMIT');
      return res.status(201).json({ tool: toolIns.rows[0], stock_item_id: itemId, remaining_stock: newQty });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error converting stock to tool:', err);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  app.get('/api/stock/transactions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    try {
      let query = `
        SELECT t.*, 
               s.name AS item_name, 
               s.mpn AS item_mpn,
               COALESCE(u.full_name, u.email, 'User') AS user_name,
               j.job_number AS job_number
        FROM stock_transactions t
        JOIN stock_items s ON t.stock_item_id = s.id
        LEFT JOIN users u ON t.created_by = u.id
        LEFT JOIN jobs j ON t.job_id = j.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (!isSuperAdmin) {
        params.push(userId);
        query += ` AND s.created_by = $${params.length}`;
      }

      query += ` ORDER BY t.created_at DESC LIMIT 100`;

      const result = await pool.query(query, params);
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching stock transactions:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  const handleGetAnalytics = async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    try {
      // 1. stockCount
      let stockCountQuery = `SELECT COALESCE(COUNT(*), 0)::int AS count FROM stock_items WHERE 1=1`;
      const stockCountParams: any[] = [];
      if (!isSuperAdmin) {
        stockCountParams.push(userId);
        stockCountQuery += ` AND created_by = $1`;
      }
      const stockCountRes = await pool.query(stockCountQuery, stockCountParams);
      const stockCount = stockCountRes.rows[0]?.count || 0;

      // 2. lowStockCount (quantity <= 5 and quantity > 0)
      let lowStockQuery = `SELECT COALESCE(COUNT(*), 0)::int AS count FROM stock_items WHERE quantity > 0 AND quantity <= 5`;
      const lowStockParams: any[] = [];
      if (!isSuperAdmin) {
        lowStockParams.push(userId);
        lowStockQuery += ` AND created_by = $1`;
      }
      const lowStockRes = await pool.query(lowStockQuery, lowStockParams);
      const lowStockCount = lowStockRes.rows[0]?.count || 0;

      // 3. outOfStockCount (quantity = 0)
      let outStockQuery = `SELECT COALESCE(COUNT(*), 0)::int AS count FROM stock_items WHERE quantity = 0`;
      const outStockParams: any[] = [];
      if (!isSuperAdmin) {
        outStockParams.push(userId);
        outStockQuery += ` AND created_by = $1`;
      }
      const outStockRes = await pool.query(outStockQuery, outStockParams);
      const outOfStockCount = outStockRes.rows[0]?.count || 0;

      // 4. toolsCount
      let toolsQuery = `SELECT COALESCE(COUNT(*), 0)::int AS count FROM tools WHERE 1=1`;
      const toolsParams: any[] = [];
      if (!isSuperAdmin) {
        toolsParams.push(userId);
        toolsQuery += ` AND created_by = $1`;
      }
      const toolsRes = await pool.query(toolsQuery, toolsParams);
      const toolsCount = toolsRes.rows[0]?.count || 0;

      // 5. toolsByStatus
      let toolsStatusQuery = `SELECT status, COUNT(*)::int AS count FROM tools WHERE 1=1`;
      const toolsStatusParams: any[] = [];
      if (!isSuperAdmin) {
        toolsStatusParams.push(userId);
        toolsStatusQuery += ` AND created_by = $1`;
      }
      toolsStatusQuery += ` GROUP BY status`;
      const toolsStatusRes = await pool.query(toolsStatusQuery, toolsStatusParams);
      const toolsByStatus = {
        available: 0,
        in_use: 0,
        missing: 0,
        damaged: 0,
      };
      for (const row of toolsStatusRes.rows) {
        if (row.status in toolsByStatus) {
          (toolsByStatus as any)[row.status] = row.count;
        }
      }

      // 6. categoryStats (merged usage rate vs current stock)
      let usageQuery = `
        SELECT s.category, SUM(ABS(t.quantity))::int AS total_used
        FROM stock_transactions t
        JOIN stock_items s ON t.stock_item_id = s.id
        WHERE t.quantity < 0
      `;
      const usageParams: any[] = [];
      if (!isSuperAdmin) {
        usageParams.push(userId);
        usageQuery += ` AND s.created_by = $${usageParams.length}`;
      }
      usageQuery += ` GROUP BY s.category`;
      const usageRes = await pool.query(usageQuery, usageParams);

      let currentStockQuery = `
        SELECT category, SUM(quantity)::int AS current_stock
        FROM stock_items
        WHERE 1=1
      `;
      const currentStockParams: any[] = [];
      if (!isSuperAdmin) {
        currentStockParams.push(userId);
        currentStockQuery += ` AND created_by = $${currentStockParams.length}`;
      }
      currentStockQuery += ` GROUP BY category`;
      const currentStockRes = await pool.query(currentStockQuery, currentStockParams);

      const categoriesMap = new Map<string, { category: string; total_used: number; current_stock: number }>();
      for (const row of currentStockRes.rows) {
        categoriesMap.set(row.category, {
          category: row.category,
          total_used: 0,
          current_stock: row.current_stock || 0,
        });
      }
      for (const row of usageRes.rows) {
        const existing = categoriesMap.get(row.category);
        if (existing) {
          existing.total_used = row.total_used || 0;
        } else {
          categoriesMap.set(row.category, {
            category: row.category,
            total_used: row.total_used || 0,
            current_stock: 0,
          });
        }
      }
      const categoryStats = Array.from(categoriesMap.values());

      // 7. uniformsCount
      let uniformsQuery = `SELECT COALESCE(COUNT(*), 0)::int AS count FROM uniforms WHERE 1=1`;
      const uniformsParams: any[] = [];
      if (!isSuperAdmin) {
        uniformsParams.push(userId);
        uniformsQuery += ` AND created_by = $1`;
      }
      const uniformsRes = await pool.query(uniformsQuery, uniformsParams);
      const uniformsCount = uniformsRes.rows[0]?.count || 0;

      // 8. uniformsByStatus
      let uniformsStatusQuery = `SELECT status, COUNT(*)::int AS count FROM uniforms WHERE 1=1`;
      const uniformsStatusParams: any[] = [];
      if (!isSuperAdmin) {
        uniformsStatusParams.push(userId);
        uniformsStatusQuery += ` AND created_by = $1`;
      }
      uniformsStatusQuery += ` GROUP BY status`;
      const uniformsStatusRes = await pool.query(uniformsStatusQuery, uniformsStatusParams);
      const uniformsByStatus = {
        available: 0,
        issued: 0,
        retired: 0,
        lost: 0,
        damaged: 0,
      };
      for (const row of uniformsStatusRes.rows) {
        if (row.status in uniformsByStatus) {
          (uniformsByStatus as any)[row.status] = row.count;
        }
      }

      return res.json({
        stockCount,
        lowStockCount,
        outOfStockCount,
        toolsCount,
        toolsByStatus,
        uniformsCount,
        uniformsByStatus,
        categoryStats,
      });
    } catch (err) {
      console.error('Error loading stock-tools analytics:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  app.get('/api/stock/analytics', authenticate, handleGetAnalytics);
  app.get('/api/stock-tools/analytics', authenticate, handleGetAnalytics);

  // ─── Tools Endpoints ───

  app.get('/api/tools', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

    try {
      let query = `
        SELECT t.*, o.full_name AS assigned_officer_name
        FROM tools t
        LEFT JOIN officers o ON t.assigned_officer_id = o.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (!isSuperAdmin) {
        params.push(userId);
        query += ` AND t.created_by = $${params.length}`;
      }

      if (search) {
        params.push(`%${search}%`);
        query += ` AND t.name ILIKE $${params.length}`;
      }

      if (category) {
        params.push(category);
        query += ` AND t.category = $${params.length}`;
      }

      query += ` ORDER BY t.name ASC`;

      const result = await pool.query(query, params);
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching tools:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/tools', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const { name, category, status, location, assigned_officer_id, quantity, image_base64, original_filename, content_type } = req.body;

    if (!name || !category || !location) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const qty = typeof quantity === 'number' ? Math.max(1, Math.trunc(quantity)) : parseInt(String(quantity || '1'), 10) || 1;

    try {
      let imageUrl: string | null = null;
      if (image_base64) {
        imageUrl = await storeStockToolImage('tool-photos', image_base64, original_filename, content_type);
      }

      const assignedId = assigned_officer_id ? parseInt(String(assigned_officer_id), 10) || null : null;

      const ins = await pool.query(
        `INSERT INTO tools (name, category, status, location, quantity, assigned_officer_id, image_url, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [name, category, status || 'available', location, qty, assignedId, imageUrl, userId]
      );

      return res.status(201).json(ins.rows[0]);
    } catch (err) {
      console.error('Error creating tool:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/tools/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const toolId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(toolId)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const { name, category, status, location, assigned_officer_id, quantity, image_base64, original_filename, content_type } = req.body;

    try {
      const toolCheck = await pool.query('SELECT * FROM tools WHERE id = $1', [toolId]);
      if ((toolCheck.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Tool not found' });
      }
      const existing = toolCheck.rows[0];
      if (!isSuperAdmin && existing.created_by !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      let imageUrl = existing.image_url;
      if (image_base64) {
        imageUrl = await storeStockToolImage('tool-photos', image_base64, original_filename, content_type);
      }

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(name);
      }
      if (category !== undefined) {
        updates.push(`category = $${idx++}`);
        values.push(category);
      }
      if (status !== undefined) {
        updates.push(`status = $${idx++}`);
        values.push(status);
      }
      if (location !== undefined) {
        updates.push(`location = $${idx++}`);
        values.push(location);
      }
      if (quantity !== undefined) {
        const qty = typeof quantity === 'number' ? Math.max(1, Math.trunc(quantity)) : parseInt(String(quantity), 10) || 1;
        updates.push(`quantity = $${idx++}`);
        values.push(qty);
      }
      if (assigned_officer_id !== undefined) {
        updates.push(`assigned_officer_id = $${idx++}`);
        values.push(assigned_officer_id ? parseInt(String(assigned_officer_id), 10) || null : null);
      }
      if (imageUrl !== existing.image_url) {
        updates.push(`image_url = $${idx++}`);
        values.push(imageUrl);
      }

      if (updates.length > 0) {
        values.push(toolId);
        await pool.query(
          `UPDATE tools SET ${updates.join(', ')} WHERE id = $${idx}`,
          values
        );
      }

      const updatedRes = await pool.query(
        `SELECT t.*, o.full_name AS assigned_officer_name 
         FROM tools t 
         LEFT JOIN officers o ON t.assigned_officer_id = o.id 
         WHERE t.id = $1`,
        [toolId]
      );
      return res.json(updatedRes.rows[0]);
    } catch (err) {
      console.error('Error updating tool:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/tools/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const toolId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(toolId)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    try {
      const toolCheck = await pool.query('SELECT created_by FROM tools WHERE id = $1', [toolId]);
      if ((toolCheck.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Tool not found' });
      }
      if (!isSuperAdmin && toolCheck.rows[0].created_by !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      await pool.query('DELETE FROM tools WHERE id = $1', [toolId]);
      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting tool:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/tools/:id/convert-to-stock', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const toolId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(toolId)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const body = req.body as { quantity?: unknown; category?: string; quality?: string };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const toolRes = await client.query('SELECT * FROM tools WHERE id = $1 FOR UPDATE', [toolId]);
      if ((toolRes.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Tool not found' });
      }
      const tool = toolRes.rows[0];
      if (!isSuperAdmin && tool.created_by !== userId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Forbidden' });
      }

      const toolQty = typeof tool.quantity === 'number' ? tool.quantity : parseInt(String(tool.quantity || '1'), 10) || 1;
      const rawQty = body.quantity;
      const convertQty = rawQty === undefined
        ? toolQty
        : typeof rawQty === 'number'
          ? Math.trunc(rawQty)
          : parseInt(String(rawQty), 10) || 0;
      if (convertQty <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Quantity must be at least 1' });
      }
      if (convertQty > toolQty) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Only ${toolQty} unit(s) available for this tool` });
      }

      const settings = await loadStockToolsSettingsRow(pool, userId);
      const stockCategory = typeof body.category === 'string' && body.category.trim()
        ? body.category.trim()
        : settings.stock_category_options.includes('General')
          ? 'General'
          : settings.stock_category_options[0];
      const quality = typeof body.quality === 'string' && body.quality.trim() ? body.quality.trim() : 'Used - Good';

      const existingStock = await client.query<{ id: number; quantity: number }>(
        `SELECT id, quantity FROM stock_items
         WHERE created_by = $1 AND name = $2 AND location = $3 AND category = $4
         ORDER BY id ASC LIMIT 1`,
        [userId, tool.name, tool.location, stockCategory],
      );

      let stockItemId: number;
      let newStockQty: number;
      if ((existingStock.rowCount ?? 0) > 0) {
        stockItemId = existingStock.rows[0].id;
        newStockQty = existingStock.rows[0].quantity + convertQty;
        await client.query('UPDATE stock_items SET quantity = $1 WHERE id = $2', [newStockQty, stockItemId]);
      } else {
        const stockIns = await client.query(
          `INSERT INTO stock_items (name, mpn, quantity, category, quality, location, image_url, created_by)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)
           RETURNING id, quantity`,
          [tool.name, convertQty, stockCategory, quality, tool.location, tool.image_url, userId],
        );
        stockItemId = stockIns.rows[0].id;
        newStockQty = stockIns.rows[0].quantity;
      }

      await client.query(
        `INSERT INTO stock_transactions (stock_item_id, quantity, transaction_type, created_by)
         VALUES ($1, $2, 'convert_from_tool', $3)`,
        [stockItemId, convertQty, userId],
      );

      const remainingToolQty = toolQty - convertQty;
      if (remainingToolQty <= 0) {
        await client.query('DELETE FROM tools WHERE id = $1', [toolId]);
      } else {
        await client.query('UPDATE tools SET quantity = $1 WHERE id = $2', [remainingToolQty, toolId]);
      }

      await client.query('COMMIT');
      return res.status(201).json({
        stock_item_id: stockItemId,
        stock_quantity: newStockQty,
        tool_removed: remainingToolQty <= 0,
        remaining_tool_quantity: Math.max(0, remainingToolQty),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error converting tool to stock:', err);
      return res.status(500).json({ message: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  // ─── Job Tools Endpoints ───

  app.get('/api/jobs/:id/tools', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const jobId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(jobId)) {
      return res.status(400).json({ message: 'Invalid Job ID' });
    }

    try {
      const result = await pool.query(
        `SELECT jt.id AS link_id, jt.notes, t.*, o.full_name AS assigned_officer_name
         FROM job_tools jt
         JOIN tools t ON jt.tool_id = t.id
         LEFT JOIN officers o ON t.assigned_officer_id = o.id
         WHERE jt.job_id = $1
         ORDER BY t.name ASC`,
        [jobId]
      );
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching job tools:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/jobs/:id/tools', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const jobId = parseInt(String(req.params.id), 10);
    const { tool_id, notes } = req.body;
    if (!Number.isFinite(jobId) || !tool_id) {
      return res.status(400).json({ message: 'Invalid parameters' });
    }

    try {
      const existing = await pool.query('SELECT id FROM job_tools WHERE job_id = $1 AND tool_id = $2', [jobId, tool_id]);
      if ((existing.rowCount ?? 0) > 0) {
        return res.status(400).json({ message: 'Tool is already assigned to this job' });
      }

      await pool.query(
        `INSERT INTO job_tools (job_id, tool_id, notes) VALUES ($1, $2, $3)`,
        [jobId, tool_id, notes || '']
      );
      return res.status(201).json({ success: true });
    } catch (err) {
      console.error('Error assigning job tool:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/jobs/:id/tools/:toolId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const jobId = parseInt(String(req.params.id), 10);
    const toolId = parseInt(String(req.params.toolId), 10);
    if (!Number.isFinite(jobId) || !Number.isFinite(toolId)) {
      return res.status(400).json({ message: 'Invalid parameters' });
    }

    try {
      const result = await pool.query('DELETE FROM job_tools WHERE job_id = $1 AND tool_id = $2', [jobId, toolId]);
      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Link not found' });
      }
      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting job tool assignment:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // ─── Diary Event Tools Endpoints ───

  app.get('/api/diary-events/:id/tools', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const diaryEventId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(diaryEventId)) {
      return res.status(400).json({ message: 'Invalid Diary Event ID' });
    }

    try {
      const result = await pool.query(
        `SELECT det.id AS link_id, det.notes, t.*, o.full_name AS assigned_officer_name
         FROM diary_event_tools det
         JOIN tools t ON det.tool_id = t.id
         LEFT JOIN officers o ON t.assigned_officer_id = o.id
         WHERE det.diary_event_id = $1
         ORDER BY t.name ASC`,
        [diaryEventId]
      );
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching diary event tools:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/diary-events/:id/tools', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const diaryEventId = parseInt(String(req.params.id), 10);
    const { tool_id, notes } = req.body;
    if (!Number.isFinite(diaryEventId) || !tool_id) {
      return res.status(400).json({ message: 'Invalid parameters' });
    }

    try {
      const existing = await pool.query('SELECT id FROM diary_event_tools WHERE diary_event_id = $1 AND tool_id = $2', [diaryEventId, tool_id]);
      if ((existing.rowCount ?? 0) > 0) {
        return res.status(400).json({ message: 'Tool is already assigned to this visit' });
      }

      await pool.query(
        `INSERT INTO diary_event_tools (diary_event_id, tool_id, notes) VALUES ($1, $2, $3)`,
        [diaryEventId, tool_id, notes || '']
      );
      return res.status(201).json({ success: true });
    } catch (err) {
      console.error('Error assigning diary event tool:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/diary-events/:id/tools/:toolId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const diaryEventId = parseInt(String(req.params.id), 10);
    const toolId = parseInt(String(req.params.toolId), 10);
    if (!Number.isFinite(diaryEventId) || !Number.isFinite(toolId)) {
      return res.status(400).json({ message: 'Invalid parameters' });
    }

    try {
      const result = await pool.query('DELETE FROM diary_event_tools WHERE diary_event_id = $1 AND tool_id = $2', [diaryEventId, toolId]);
      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Link not found' });
      }
      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting diary event tool assignment:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // ─── Uniform Endpoints ───

  app.get('/api/uniforms', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const size = typeof req.query.size === 'string' ? req.query.size.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    try {
      let query = `
        SELECT u.*, o.full_name AS assigned_officer_name
        FROM uniforms u
        LEFT JOIN officers o ON u.assigned_officer_id = o.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (!isSuperAdmin) {
        params.push(userId);
        query += ` AND u.created_by = $${params.length}`;
      }

      if (search) {
        params.push(`%${search}%`);
        query += ` AND (u.name ILIKE $${params.length} OR u.notes ILIKE $${params.length})`;
      }

      if (category) {
        params.push(category);
        query += ` AND u.category = $${params.length}`;
      }

      if (size) {
        params.push(size);
        query += ` AND u.size = $${params.length}`;
      }

      if (status) {
        params.push(status);
        query += ` AND u.status = $${params.length}`;
      }

      query += ` ORDER BY u.category ASC, u.name ASC, u.size ASC`;

      const result = await pool.query(query, params);
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching uniforms:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/uniforms', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const {
      name, category, size, status, location, quantity, assigned_officer_id, notes,
      image_base64, original_filename, content_type,
    } = req.body;

    if (!name || !category || !size || !location) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const qty = typeof quantity === 'number' ? Math.max(1, Math.trunc(quantity)) : parseInt(String(quantity || '1'), 10) || 1;

    try {
      let imageUrl: string | null = null;
      if (image_base64) {
        imageUrl = await storeStockToolImage('uniform-photos', image_base64, original_filename, content_type);
      }

      const assignedId = assigned_officer_id ? parseInt(String(assigned_officer_id), 10) || null : null;
      const uniformStatus = status || (assignedId ? 'issued' : 'available');

      const ins = await pool.query(
        `INSERT INTO uniforms (name, category, size, status, location, quantity, assigned_officer_id, notes, image_url, created_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING *`,
        [name, category, size, uniformStatus, location, qty, assignedId, notes || null, imageUrl, userId],
      );

      const row = ins.rows[0];
      if (assignedId) {
        const officerRes = await pool.query('SELECT full_name FROM officers WHERE id = $1', [assignedId]);
        return res.status(201).json({ ...row, assigned_officer_name: officerRes.rows[0]?.full_name ?? null });
      }
      return res.status(201).json({ ...row, assigned_officer_name: null });
    } catch (err) {
      console.error('Error creating uniform:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/uniforms/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const uniformId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(uniformId)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const {
      name, category, size, status, location, quantity, assigned_officer_id, notes,
      image_base64, original_filename, content_type,
    } = req.body;

    try {
      const check = await pool.query('SELECT * FROM uniforms WHERE id = $1', [uniformId]);
      if ((check.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Uniform not found' });
      }
      const existing = check.rows[0];
      if (!isSuperAdmin && existing.created_by !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      let imageUrl = existing.image_url;
      if (image_base64) {
        imageUrl = await storeStockToolImage('uniform-photos', image_base64, original_filename, content_type);
      }

      const updates: string[] = ['updated_at = NOW()'];
      const values: any[] = [];
      let idx = 1;

      if (name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(name);
      }
      if (category !== undefined) {
        updates.push(`category = $${idx++}`);
        values.push(category);
      }
      if (size !== undefined) {
        updates.push(`size = $${idx++}`);
        values.push(size);
      }
      if (status !== undefined) {
        updates.push(`status = $${idx++}`);
        values.push(status);
      }
      if (location !== undefined) {
        updates.push(`location = $${idx++}`);
        values.push(location);
      }
      if (quantity !== undefined) {
        const qty = typeof quantity === 'number' ? Math.max(1, Math.trunc(quantity)) : parseInt(String(quantity), 10) || 1;
        updates.push(`quantity = $${idx++}`);
        values.push(qty);
      }
      if (assigned_officer_id !== undefined) {
        updates.push(`assigned_officer_id = $${idx++}`);
        values.push(assigned_officer_id ? parseInt(String(assigned_officer_id), 10) || null : null);
      }
      if (notes !== undefined) {
        updates.push(`notes = $${idx++}`);
        values.push(notes || null);
      }
      if (imageUrl !== existing.image_url) {
        updates.push(`image_url = $${idx++}`);
        values.push(imageUrl);
      }

      values.push(uniformId);
      await pool.query(
        `UPDATE uniforms SET ${updates.join(', ')} WHERE id = $${idx}`,
        values,
      );

      const updatedRes = await pool.query(
        `SELECT u.*, o.full_name AS assigned_officer_name
         FROM uniforms u
         LEFT JOIN officers o ON u.assigned_officer_id = o.id
         WHERE u.id = $1`,
        [uniformId],
      );
      return res.json(updatedRes.rows[0]);
    } catch (err) {
      console.error('Error updating uniform:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/uniforms/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const userId = getTenantScopeUserId(req.user!);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const uniformId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(uniformId)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    try {
      const check = await pool.query('SELECT created_by FROM uniforms WHERE id = $1', [uniformId]);
      if ((check.rowCount ?? 0) === 0) {
        return res.status(404).json({ message: 'Uniform not found' });
      }
      if (!isSuperAdmin && check.rows[0].created_by !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      await pool.query('DELETE FROM uniforms WHERE id = $1', [uniformId]);
      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting uniform:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}
