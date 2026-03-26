export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export function toObjects(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? '').trim();
    });
    return obj;
  });
}

export function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

/**
 * Parse CSV/API date cells to YYYY-MM-DD (UK DD/MM/YYYY, ISO, Excel serials).
 * Keeps calendar day stable for imports (matches server parseInvoiceDateForDb).
 */
export function normalizeCsvDateToIso(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  if (iso) {
    const m = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    const y = parseInt(iso[1], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const dmy = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
  if (dmy) {
    const a = parseInt(dmy[1], 10);
    const b = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && y >= 1900 && y <= 2100) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const dmyShort = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})$/.exec(s);
  if (dmyShort) {
    const a = parseInt(dmyShort[1], 10);
    const b = parseInt(dmyShort[2], 10);
    let yy = parseInt(dmyShort[3], 10);
    const y = yy >= 70 ? 1900 + yy : 2000 + yy;
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const monNames = /(\d{1,2})[\s\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-](\d{4})/i.exec(s);
  if (monNames) {
    const map: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const mo = map[monNames[2].toLowerCase().slice(0, 3)];
    const day = parseInt(monNames[1], 10);
    const y = parseInt(monNames[3], 10);
    if (mo && day >= 1 && day <= 31 && y >= 1900 && y <= 2100) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  if (/^\d{5,6}(\.\d+)?$/.test(s.replace(/\s/g, ''))) {
    const serial = Math.floor(parseFloat(s));
    if (serial > 20000 && serial < 100000) {
      const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
  }
  return null;
}
