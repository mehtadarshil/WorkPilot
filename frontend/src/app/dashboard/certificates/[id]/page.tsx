import { redirect } from 'next/navigation';

export default async function CertificateEditorIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/certificates/${id}/installation-details`);
}
