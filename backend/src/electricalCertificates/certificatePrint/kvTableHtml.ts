export type KvEntry = { label: string; value: string };

const COMPACT_VALUE_MAX_LEN = 42;

export function isCompactKvValue(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (text.includes('\n')) return false;
  return text.length <= COMPACT_VALUE_MAX_LEN;
}

/** Renders key/value rows; pairs adjacent short values side-by-side when pairCompact is true. */
export function kvTableHtml(
  entries: KvEntry[],
  esc: (value: string) => string,
  pairCompact = true,
): string {
  const items = entries.filter((e) => e.value.trim());
  if (!items.length) return '';

  const rows: string[] = [];
  let i = 0;
  while (i < items.length) {
    const current = items[i]!;
    const next = items[i + 1];
    if (pairCompact && next && isCompactKvValue(current.value) && isCompactKvValue(next.value)) {
      rows.push(`<tr class="kv-pair">
        <td class="lbl">${esc(current.label)}</td><td>${esc(current.value)}</td>
        <td class="lbl">${esc(next.label)}</td><td>${esc(next.value)}</td>
      </tr>`);
      i += 2;
      continue;
    }
    rows.push(`<tr class="kv-full"><td class="lbl">${esc(current.label)}</td><td colspan="3">${esc(current.value)}</td></tr>`);
    i += 1;
  }

  return `<table class="kv kv-grid"><tbody>${rows.join('')}</tbody></table>`;
}
