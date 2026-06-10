import path from 'path';
import fs from 'fs/promises';

function getCustomerSiteReportImagesArchiveRootDir(): string {
  const raw = process.env.CUSTOMER_SITE_REPORT_IMAGES_ARCHIVE_DIR?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(path.dirname(getCustomerSiteReportImagesRootDir()), 'customer-site-report-images-archive');
}

function getCustomerSiteReportImagesMirrorRootDir(): string | null {
  const raw = process.env.CUSTOMER_SITE_REPORT_IMAGES_MIRROR_DIR?.trim();
  return raw ? path.resolve(raw) : null;
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

export async function ensureCustomerSiteReportImageDir(customerId: number, reportId: number): Promise<string> {
  const dir = path.join(getCustomerSiteReportImagesRootDir(), String(customerId), String(reportId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
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

export async function mirrorCustomerSiteReportImageFile(
  customerId: number,
  reportId: number,
  storedFilename: string,
  sourcePath: string,
): Promise<void> {
  const mirrorRoot = getCustomerSiteReportImagesMirrorRootDir();
  if (!mirrorRoot) return;

  const fileName = path.basename(storedFilename);
  if (!fileName) return;
  const mirrorPath = path.join(mirrorRoot, String(customerId), String(reportId), fileName);
  await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
  await fs.copyFile(sourcePath, mirrorPath).catch((error) => {
    console.error('Mirror customer site report image error:', error);
  });
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
