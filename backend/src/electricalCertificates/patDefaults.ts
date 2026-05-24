import type { Pool } from 'pg';
import type { ElectricalCertificateDocument, PatCertificateData } from './types';

export type PatTestEquipmentDefaults = {
  make: string;
  serialNo: string;
  notes: string;
};

const EMPTY_PAT_TEST_EQUIPMENT_DEFAULTS: PatTestEquipmentDefaults = {
  make: '',
  serialNo: '',
  notes: '',
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function ensurePatDefaultsSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS electrical_certificate_pat_defaults (
      created_by INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      equipment_make TEXT NOT NULL DEFAULT '',
      equipment_serial_no TEXT NOT NULL DEFAULT '',
      equipment_notes TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

export async function loadPatTestEquipmentDefaults(pool: Pool, userId: number): Promise<PatTestEquipmentDefaults> {
  const result = await pool.query<{
    equipment_make: string | null;
    equipment_serial_no: string | null;
    equipment_notes: string | null;
  }>(
    `SELECT equipment_make, equipment_serial_no, equipment_notes
     FROM electrical_certificate_pat_defaults
     WHERE created_by = $1`,
    [userId],
  );

  const row = result.rows[0];
  if (!row) return EMPTY_PAT_TEST_EQUIPMENT_DEFAULTS;

  return {
    make: row.equipment_make ?? '',
    serialNo: row.equipment_serial_no ?? '',
    notes: row.equipment_notes ?? '',
  };
}

export async function savePatTestEquipmentDefaults(
  pool: Pool,
  userId: number,
  defaults: Partial<PatTestEquipmentDefaults>,
): Promise<PatTestEquipmentDefaults> {
  const make = cleanText(defaults.make);
  const serialNo = cleanText(defaults.serialNo);
  const notes = cleanText(defaults.notes);

  await pool.query(
    `INSERT INTO electrical_certificate_pat_defaults (created_by, equipment_make, equipment_serial_no, equipment_notes, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (created_by)
     DO UPDATE SET
       equipment_make = EXCLUDED.equipment_make,
       equipment_serial_no = EXCLUDED.equipment_serial_no,
       equipment_notes = EXCLUDED.equipment_notes,
       updated_at = NOW()`,
    [userId, make, serialNo, notes],
  );

  return { make, serialNo, notes };
}

export async function applyPatTestEquipmentDefaults(
  pool: Pool,
  userId: number,
  doc: ElectricalCertificateDocument,
): Promise<ElectricalCertificateDocument> {
  if (!doc.pat) return doc;

  const defaults = await loadPatTestEquipmentDefaults(pool, userId);
  doc.pat.testEquipment = mergePatTestEquipmentDefaults(doc.pat.testEquipment, defaults);
  return doc;
}

function mergePatTestEquipmentDefaults(
  current: PatCertificateData['testEquipment'],
  defaults: PatTestEquipmentDefaults,
): PatCertificateData['testEquipment'] {
  return {
    make: current.make.trim() || defaults.make,
    serialNo: current.serialNo.trim() || defaults.serialNo,
    notes: current.notes.trim() || defaults.notes,
  };
}
