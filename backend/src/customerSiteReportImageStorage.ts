import path from 'path';
import fs from 'fs/promises';

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

export async function removeCustomerSiteReportImageFile(
  customerId: number,
  reportId: number,
  storedFilename: string,
): Promise<void> {
  const fullPath = await findCustomerSiteReportImageFile(customerId, reportId, storedFilename);
  if (fullPath) await fs.unlink(fullPath).catch(() => {});
}

export async function removeCustomerSiteReportImageDirs(customerId: number, reportId: number): Promise<void> {
  await Promise.all(
    getCustomerSiteReportImagesReadRootDirs().map((root) =>
      fs.rm(path.join(root, String(customerId), String(reportId)), { recursive: true, force: true }).catch(() => {}),
    ),
  );
}
