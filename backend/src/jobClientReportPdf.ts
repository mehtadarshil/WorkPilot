/**
 * Renders a full HTML document to PDF using headless Chromium (same engine as Print → Save as PDF).
 */
export async function renderHtmlReportToPdf(html: string): Promise<Buffer> {
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(120_000);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.evaluate(() => {
      const imgs = Array.from(document.images);
      return Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          });
        }),
      );
    });
    const buf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}
