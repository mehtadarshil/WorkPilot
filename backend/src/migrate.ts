
import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    const poolConfig: PoolConfig = {
      connectionString: databaseUrl,
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

async function migrate() {
  try {
    console.log('Starting migration...');
    await pool.query(`
      ALTER TABLE customers 
      ADD COLUMN IF NOT EXISTS w3w TEXT,
      ADD COLUMN IF NOT EXISTS water_supply TEXT,
      ADD COLUMN IF NOT EXISTS power_supply TEXT,
      ADD COLUMN IF NOT EXISTS technical_notes TEXT;
    `);
    console.log('Migration successful: Added technical reference columns to customers table.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
