const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.82;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function prepareCertificateImage(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image must be under 8 MB');
  }
  const prepared = await maybeConvertHeic(file);
  return compressImageToDataUrl(prepared);
}

async function maybeConvertHeic(file: File): Promise<File> {
  const t = (file.type || '').toLowerCase();
  const n = file.name.toLowerCase();
  const isHeic =
    t === 'image/heic' || t === 'image/heif' || n.endsWith('.heic') || n.endsWith('.heif');
  if (!isHeic) return file;
  const base = file.name.replace(/\.[^.]+$/i, '') || 'photo';
  try {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.88 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process image'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };
    img.src = url;
  });
}
