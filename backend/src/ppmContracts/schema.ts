import type { Pool } from 'pg';

export async function ensurePpmContractSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ppm_contracts (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      work_address_id INTEGER REFERENCES customer_work_addresses(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL,
      reference VARCHAR(100),
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      start_date DATE,
      end_date DATE,
      renewal_type VARCHAR(20) NOT NULL DEFAULT 'open_ended',
      renewal_notice_days INTEGER NOT NULL DEFAULT 60,
      price_book_id INTEGER REFERENCES price_books(id) ON DELETE SET NULL,
      job_description_id INTEGER REFERENCES job_descriptions(id) ON DELETE SET NULL,
      default_officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
      sla_response_minutes INTEGER,
      sla_completion_minutes INTEGER,
      auto_create_jobs_days_before INTEGER NOT NULL DEFAULT 14,
      asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      communications_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      invoicing_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      rate_overrides_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_activity_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ppm_contracts_customer ON ppm_contracts(customer_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ppm_contracts_status ON ppm_contracts(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ppm_contracts_created_by ON ppm_contracts(created_by)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ppm_contract_tasks (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL REFERENCES ppm_contracts(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      asset_id INTEGER REFERENCES customer_assets(id) ON DELETE SET NULL,
      interval_n INTEGER NOT NULL DEFAULT 6,
      interval_unit VARCHAR(20) NOT NULL DEFAULT 'months',
      next_due_date DATE NOT NULL,
      last_completed_at TIMESTAMPTZ,
      last_job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ppm_contract_tasks_contract ON ppm_contract_tasks(contract_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ppm_contract_tasks_next_due ON ppm_contract_tasks(next_due_date)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ppm_contract_task_history (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES ppm_contract_tasks(id) ON DELETE CASCADE,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      previous_due_date DATE,
      next_due_date DATE
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ppm_task_history_task ON ppm_contract_task_history(task_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ppm_contract_auto_jobs (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES ppm_contract_tasks(id) ON DELETE CASCADE,
      due_date DATE NOT NULL,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(task_id, due_date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ppm_contract_renewal_sent (
      contract_id INTEGER NOT NULL REFERENCES ppm_contracts(id) ON DELETE CASCADE,
      phase VARCHAR(20) NOT NULL,
      target_date DATE NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contract_id, phase, target_date)
    )
  `);

  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ppm_contract_id INTEGER REFERENCES ppm_contracts(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ppm_contract_task_id INTEGER REFERENCES ppm_contract_tasks(id) ON DELETE SET NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_jobs_ppm_contract ON jobs(ppm_contract_id) WHERE ppm_contract_id IS NOT NULL`);
}
