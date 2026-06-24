export type KvEntry = { label: string; value: string };

const COMPACT_VALUE_MAX_LEN = 42;

export function isCompactKvValue(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (text.includes('\n')) return false;
  return text.length <= COMPACT_VALUE_MAX_LEN;
}

export function buildKvTableRows(entries: KvEntry[], pairCompact = true): KvEntry[][] {
  const items = entries.filter((e) => e.value.trim());
  const rows: KvEntry[][] = [];
  let i = 0;
  while (i < items.length) {
    const current = items[i]!;
    const next = items[i + 1];
    if (pairCompact && next && isCompactKvValue(current.value) && isCompactKvValue(next.value)) {
      rows.push([current, next]);
      i += 2;
      continue;
    }
    rows.push([current]);
    i += 1;
  }
  return rows;
}
