import path from 'path';
import sharp from 'sharp';

// Pure-JS fallback when Sharp/libvips has no libheif (typical on minimal Linux images).
import heicConvert = require('heic-convert');

const HEIC_EXT = /\.(heic|heif)$/i;

function isHeicMajorBrand(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.slice(4, 8).toString('ascii') !== 'ftyp') return false;
  const brand = buf.slice(8, 12).toString('ascii').replace(/\0/g, '').toLowerCase();
  return ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand);
}

function looksLikeHeicBuffer(buffer: Buffer, declaredContentType: string | null, originalFilename: string): boolean {
  const ct = (declaredContentType || '').toLowerCase();
  if (ct.includes('image/heic') || ct.includes('image/heif')) return true;
  if (HEIC_EXT.test(originalFilename)) return true;
  if (isHeicMajorBrand(buffer)) return true;
  return false;
}

export type NormalizedCustomerImageUpload = {
  buffer: Buffer;
  contentType: string | null;
  storedExtension: string;
};

/**
 * HEIC/HEIF is common from iPhones but is not reliably decoded in Chromium (PDF) or many desktop browsers.
 * Convert to JPEG on ingest so previews, PDFs, and downloads work everywhere.
 */
export async function normalizeCustomerImageUpload(
  buffer: Buffer,
  declaredContentType: string | null,
  originalFilename: string,
): Promise<NormalizedCustomerImageUpload> {
  if (!looksLikeHeicBuffer(buffer, declaredContentType, originalFilename)) {
    const ext = path.extname(originalFilename).slice(0, 32) || '';
    const ct = declaredContentType?.trim() ? declaredContentType.trim().slice(0, 255) : null;
    return { buffer, contentType: ct, storedExtension: ext };
  }
  try {
    const out = await sharp(buffer).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    return { buffer: out, contentType: 'image/jpeg', storedExtension: '.jpg' };
  } catch (sharpErr) {
    console.warn('HEIC via Sharp failed (often missing libheif); trying heic-convert:', sharpErr);
    try {
      const raw = await heicConvert({ buffer, format: 'JPEG', quality: 0.88 });
      const jpegBuf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      return { buffer: jpegBuf, contentType: 'image/jpeg', storedExtension: '.jpg' };
    } catch (fallbackErr) {
      console.error('HEIC/HEIF conversion failed (Sharp and heic-convert):', fallbackErr);
      const e = new Error('HEIC_DECODE_FAILED');
      e.name = 'HEIC_DECODE_FAILED';
      throw e;
    }
  }
}
