import type { Pool } from 'pg';

export type CertificateTeamMember = {
  key: string;
  kind: 'dashboard' | 'field';
  id: number;
  user_id: number | null;
  officer_id: number | null;
  full_name: string;
  role_position: string | null;
  access_label: string;
  email: string | null;
};

/** Same people as Settings → Team & access, for certificate engineer pickers. */
export async function loadCertificateTeamMembers(pool: Pool, tenantOwnerUserId: number): Promise<CertificateTeamMember[]> {
  const staff = await pool.query<{
    id: number;
    email: string;
    full_name: string | null;
    role: string;
    status: string | null;
  }>(
    `SELECT id, email, full_name, role, status
     FROM users
     WHERE (tenant_admin_id = $1 AND role = 'STAFF') OR (id = $1 AND role = 'ADMIN')
     ORDER BY role DESC, id ASC`,
    [tenantOwnerUserId],
  );

  const officers = await pool.query<{
    id: number;
    email: string | null;
    full_name: string;
    role_position: string | null;
    state: string;
    linked_user_id: number | null;
  }>(
    `SELECT id, email, full_name, role_position, state, linked_user_id
     FROM officers
     WHERE created_by = $1
     ORDER BY full_name ASC`,
    [tenantOwnerUserId],
  );

  const linkedOfficerByUserId = new Map<number, { id: number; full_name: string; role_position: string | null }>();
  for (const row of officers.rows) {
    if (row.linked_user_id != null) {
      linkedOfficerByUserId.set(row.linked_user_id, {
        id: row.id,
        full_name: row.full_name,
        role_position: row.role_position,
      });
    }
  }

  const dashboardMembers: CertificateTeamMember[] = staff.rows.map((row) => {
    const linked = linkedOfficerByUserId.get(row.id);
    return {
      key: `dashboard:${row.id}`,
      kind: 'dashboard',
      id: row.id,
      user_id: row.id,
      officer_id: linked?.id ?? null,
      full_name: row.full_name?.trim() || row.email,
      role_position: linked?.role_position ?? (row.role === 'ADMIN' ? 'Authorised person' : row.role),
      access_label: row.role === 'ADMIN' ? 'Owner (web + mobile)' : 'Dashboard (web + mobile)',
      email: row.email,
    };
  });

  const fieldMembers: CertificateTeamMember[] = officers.rows.map((row) => ({
    key: `field:${row.id}`,
    kind: 'field',
    id: row.id,
    user_id: row.linked_user_id,
    officer_id: row.id,
    full_name: row.full_name,
    role_position: row.role_position,
    access_label:
      row.linked_user_id != null ? 'Field profile (mobile via dashboard login)' : 'Field (mobile app only)',
    email: row.email,
  }));

  return [...dashboardMembers, ...fieldMembers];
}

export function memberCanBeSignedBy(
  member: CertificateTeamMember,
  authUserId: number,
  authOfficerId: number | undefined,
): boolean {
  if (member.user_id != null && member.user_id === authUserId) return true;
  if (member.officer_id != null && authOfficerId != null && member.officer_id === authOfficerId) return true;
  return false;
}
