/**
 * Renders a full HTML document to PDF using headless Chromium (same engine as Print → Save as PDF).
 *
 * Production: install Chromium/Chrome on the server and set `PUPPETEER_EXECUTABLE_PATH` (or `CHROME_BIN`)
 * to its binary. Docker images often need `--no-sandbox` (already passed below).
 */
export class PdfRenderUnavailableError extends Error {
  readonly code = 'PDF_RENDER_UNAVAILABLE' as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'PdfRenderUnavailableError';
    Object.setPrototypeOf(this, new.target.prototype);
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function resolveChromiumExecutablePath(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    process.env.CHROMIUM_PATH,
  ];
  for (const raw of candidates) {
    const t = typeof raw === 'string' ? raw.trim() : '';
    if (t) return t;
  }
  return undefined;
}

/**
 * Renders a full HTML document to PDF using headless Chromium (same engine as Print → Save as PDF).
 */
export async function renderHtmlReportToPdf(html: string): Promise<Buffer> {
  const { default: puppeteer } = await import('puppeteer');
  const executablePath = resolveChromiumExecutablePath();

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
      ],
    });
  } catch (launchErr) {
    console.error('puppeteer.launch failed', launchErr);
    throw new PdfRenderUnavailableError(
      'PDF engine (Chromium) could not start. On your production server install Chromium or Google Chrome, ' +
        'then set the environment variable PUPPETEER_EXECUTABLE_PATH to the browser binary ' +
        '(for example /usr/bin/chromium or /usr/bin/google-chrome-stable). ' +
        'If you use Docker, install chromium or google-chrome-stable in the image and set the same variable.',
      { cause: launchErr },
    );
  }

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
  } catch (err) {
    console.error('puppeteer PDF render failed', err);
    const isTimeout = err instanceof Error && /timeout|timed out/i.test(err.message);
    throw new PdfRenderUnavailableError(
      isTimeout
        ? 'PDF generation timed out. Try again, or reduce the number/size of images in the report.'
        : 'PDF generation failed while rendering the document.',
      { cause: err },
    );
  } finally {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
  }
}
