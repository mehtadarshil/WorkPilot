import type { Pool } from 'pg';
import { getFraTemplateDefinition } from './fraTemplateDefinition';
import type { SiteReportTemplateDefinition } from './types';

const FRA_SLUG = 'fra';

export async function ensureFireRiskAssessmentTemplate(pool: Pool, userId: number): Promise<number> {
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM site_report_templates WHERE created_by = $1 AND slug = $2`,
    [userId, FRA_SLUG],
  );
  if ((existing.rowCount ?? 0) > 0) return Number(existing.rows[0].id);

  const def = getFraTemplateDefinition();
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO site_report_templates (name, slug, definition, created_by, updated_by, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $4, NOW())
     RETURNING id`,
    ['Fire Risk Assessment', FRA_SLUG, JSON.stringify(def), userId],
  );
  return Number(ins.rows[0].id);
}

export async function fetchTemplateDefinition(pool: Pool, templateId: number, userId: number): Promise<SiteReportTemplateDefinition | null> {
  const r = await pool.query<{ definition: unknown }>(
    `SELECT definition FROM site_report_templates WHERE id = $1 AND created_by = $2`,
    [templateId, userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  const raw = r.rows[0].definition;
  if (!raw || typeof raw !== 'object') return null;
  return raw as SiteReportTemplateDefinition;
}
