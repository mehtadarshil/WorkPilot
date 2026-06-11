import path from 'path';
import fs from 'fs/promises';
import { getSpacesBuffer, putSpacesBuffer, spacesKey, spacesObjectExists, spacesObjectUrl } from './spacesStorage';

function getCustomerSiteReportImagesArchiveRootDir(): string {
  const raw = process.env.CUSTOMER_SITE_REPORT_IMAGES_ARCHIVE_DIR?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(path.dirname(getCustomerSiteReportImagesRootDir()), 'customer-site-report-images-archive');
}

export function getCustomerSiteReportImagesRootDir(): string {
  const raw = process.env.CUSTOMER_SITE_REPORT_IMAGES_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data', 'customer-site-report-images');
}

export function getCustomerSiteReportImagesReadRootDirs(): string[] {
  const configured = process.env.CUSTOMER_SITE_REPORT_IMAGES_DIR?.trim();
  const roots = [
    ...(configured ? [path.resolve(configured)] : []),
    path.resolve(process.cwd(), 'data', 'customer-site-report-images'),
    path.resolve(process.cwd(), 'backend', 'data', 'customer-site-report-images'),
    path.resolve(process.cwd(), '..', 'data', 'customer-site-report-images'),
  ];
  return Array.from(new Set(roots));
}

export async function findCustomerSiteReportImageFile(
  customerId: number,
  reportId: number,
  storedFilename: string,
): Promise<string | null> {
  const fileName = path.basename(storedFilename);
  if (!fileName) return null;

  for (const root of getCustomerSiteReportImagesReadRootDirs()) {
    const fullPath = path.join(root, String(customerId), String(reportId), fileName);
    const rel = path.relative(root, fullPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;

    try {
      const st = await fs.stat(fullPath);
      if (st.isFile()) return fullPath;
    } catch {
      // Try the next legacy/dev storage root.
    }
  }

  return null;
}

export function customerSiteReportImageSpacesKey(customerId: number, reportId: number, storedFilename: string): string {
  return spacesKey('customer-site-report-images', customerId, reportId, path.basename(storedFilename));
}

export async function uploadCustomerSiteReportImageBufferToSpaces(
  customerId: number,
  reportId: number,
  storedFilename: string,
  buffer: Buffer,
  contentType?: string | null,
): Promise<{ spacesKey: string; fileUrl: string | null }> {
  const key = customerSiteReportImageSpacesKey(customerId, reportId, storedFilename);
  const uploaded = await putSpacesBuffer(key, buffer, contentType);
  if (!uploaded) {
    throw new Error('Spaces storage is not configured for customer site report images');
  }
  return { spacesKey: key, fileUrl: spacesObjectUrl(key) };
}

export async function loadCustomerSiteReportImageBuffer(
  customerId: number,
  reportId: number,
  storedFilename: string,
): Promise<Buffer | null> {
  const key = customerSiteReportImageSpacesKey(customerId, reportId, storedFilename);
  const fromSpaces = await getSpacesBuffer(key);
  if (fromSpaces) return fromSpaces;

  const fullPath = await findCustomerSiteReportImageFile(customerId, reportId, storedFilename);
  if (!fullPath) return null;
  return fs.readFile(fullPath);
}

export async function customerSiteReportImageExists(
  customerId: number,
  reportId: number,
  storedFilename: string,
): Promise<boolean> {
  const key = customerSiteReportImageSpacesKey(customerId, reportId, storedFilename);
  if (await spacesObjectExists(key)) return true;
  return (await findCustomerSiteReportImageFile(customerId, reportId, storedFilename)) != null;
}

async function movePathToArchive(sourcePath: string, archivePath: string): Promise<void> {
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  try {
    await fs.rename(sourcePath, archivePath);
    return;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : '';
    if (code !== 'EXDEV') throw error;
  }

  const st = await fs.stat(sourcePath);
  if (st.isDirectory()) {
    await fs.cp(sourcePath, archivePath, { recursive: true, force: false, errorOnExist: true });
    await fs.rm(sourcePath, { recursive: true, force: true });
  } else {
    await fs.copyFile(sourcePath, archivePath);
    await fs.unlink(sourcePath);
  }
}

export async function removeCustomerSiteReportImageFile(
  customerId: number,
  reportId: number,
  storedFilename: string,
): Promise<void> {
  const fullPath = await findCustomerSiteReportImageFile(customerId, reportId, storedFilename);
  if (!fullPath) return;

  const fileName = path.basename(storedFilename);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(
    getCustomerSiteReportImagesArchiveRootDir(),
    'single-image-deletes',
    String(customerId),
    String(reportId),
    `${stamp}_${fileName}`,
  );
  await movePathToArchive(fullPath, archivePath).catch((error) => {
    console.error('Archive customer site report image error:', error);
  });
}

export async function removeCustomerSiteReportImageDirs(customerId: number, reportId: number): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const root of getCustomerSiteReportImagesReadRootDirs()) {
    const dir = path.join(root, String(customerId), String(reportId));
    try {
      const st = await fs.stat(dir);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }

    const archivePath = path.join(
      getCustomerSiteReportImagesArchiveRootDir(),
      'report-deletes',
      String(customerId),
      `${reportId}_${stamp}`,
    );
    await movePathToArchive(dir, archivePath).catch((error) => {
      console.error('Archive customer site report image directory error:', error);
    });
  }
}
