import type { Pool } from 'pg';

export async function ensureDocuCenterSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS docu_folders (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER REFERENCES docu_folders(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      allowed_roles TEXT[] NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_docu_folders_tenant ON docu_folders(created_by)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_docu_folders_parent ON docu_folders(parent_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS docu_files (
      id SERIAL PRIMARY KEY,
      folder_id INTEGER NOT NULL REFERENCES docu_folders(id) ON DELETE CASCADE,
      original_filename VARCHAR(500) NOT NULL,
      stored_filename VARCHAR(255) NOT NULL,
      content_type VARCHAR(255),
      byte_size BIGINT NOT NULL,
      spaces_key TEXT,
      file_url TEXT,
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_docu_files_folder ON docu_files(folder_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_docu_files_tenant ON docu_files(created_by)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS docu_folder_access (
      id SERIAL PRIMARY KEY,
      folder_id INTEGER NOT NULL REFERENCES docu_folders(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      officer_id INTEGER REFERENCES officers(id) ON DELETE CASCADE,
      CONSTRAINT docu_folder_access_one_principal CHECK (
        (user_id IS NOT NULL AND officer_id IS NULL) OR
        (user_id IS NULL AND officer_id IS NOT NULL)
      )
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_docu_folder_access_user
      ON docu_folder_access(folder_id, user_id) WHERE user_id IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_docu_folder_access_officer
      ON docu_folder_access(folder_id, officer_id) WHERE officer_id IS NOT NULL
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_docu_folder_access_folder ON docu_folder_access(folder_id)`);
}
