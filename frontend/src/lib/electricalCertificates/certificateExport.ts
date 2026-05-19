import { getBlob } from '@/app/apiClient';

export async function downloadCertificatePdf(
  certificateId: number,
  certificateNumber: string,
  token: string | null,
): Promise<void> {
  const blob = await getBlob(`/electrical-certificates/${certificateId}/pdf`, token);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${certificateNumber.replace(/[^\w.-]+/g, '_')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
