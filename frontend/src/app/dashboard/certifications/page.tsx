import { redirect } from 'next/navigation';

/** Legacy URL — staff training certifications moved to staff-certifications. */
export default function LegacyCertificationsRedirect() {
  redirect('/dashboard/staff-certifications');
}
