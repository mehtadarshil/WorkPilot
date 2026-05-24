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

export function openCertificatePdfPreviewWindow(): Window | null {
  const previewWindow = window.open('', '_blank');
  if (previewWindow) {
    previewWindow.document.write('<p style="font-family: system-ui, sans-serif; padding: 24px;">Generating PDF preview...</p>');
  }
  return previewWindow;
}

export async function previewCertificatePdf(
  certificateId: number,
  token: string | null,
  previewWindow: Window | null = openCertificatePdfPreviewWindow(),
): Promise<void> {
  const blob = await getBlob(`/electrical-certificates/${certificateId}/pdf`, token);
  const url = URL.createObjectURL(blob);

  if (previewWindow) {
    previewWindow.location.href = url;
  } else {
    window.open(url, '_blank');
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
