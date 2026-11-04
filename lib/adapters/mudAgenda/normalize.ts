// Text cleanup for MUD agendas (mud-code-parser-spec §3.2). Pure functions.
// The parser works on lines that keep a pointer to the original text, so every item's
// source_quote can be cut from the original (what the quote check sees), never from the
// cleaned copy.

export type Line = {
  /** Text of the line as it appears in the original (no trailing newline). */
  text: string;
  page: number;
  /** Index of this line among all lines of the document. */
  index: number;
  /** True for repeating page headers/footers, page numbers and doc-management IDs. */
  dropped: boolean;
};

/** Doc-management IDs (§3.3): "4934-3202-1463 v.1", "91248-002 604621.1", "960143vl", "ACTIVE 123456789v1". */
export const DOC_ID_LINE = [
  /^\s*\d{4}-\d{4}-\d{4}\.?\s*v\.?\s*[\dlI]+\s*$/i,
  /^\s*\d{5}-\d{3}\s+\d{5,7}\.\d+\s*$/,
  /^\s*\d{5}\.\d{6}\\\S*\s*$/,
  /^\s*\d{5,7}\s?v[l1I\d]+\s*$/,
  /^\s*ACTIVE\s+\d{6,10}v\d+\s*$/i,
];

/** Page numbers: "-2-", "- 3 -", "Page 2 of 3", "2". */
const PAGE_NUMBER = /^\s*(?:-\s*\d{1,2}\s*-|Page\s+\d{1,2}(?:\s+of\s+\d{1,2})?|\d{1,2})\s*$/i;

export function splitLines(text: string): Line[] {
  const out: Line[] = [];
  text.split('\f').forEach((page, p) => {
    for (const t of page.split(/\r?\n/)) out.push({ text: t, page: p, index: out.length, dropped: false });
  });
  return out;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Mark page furniture as dropped: doc IDs, page numbers, and short lines that repeat on at
 * least two pages (district name, running headers). Returns the same array.
 */
export function markFurniture(lines: Line[]): Line[] {
  const pages = new Set(lines.map((l) => l.page)).size;
  // Only the first and last 3 non-empty lines of a page can be running headers or footers.
  const edge = new Set<number>();
  for (let p = 0; p < pages; p++) {
    const onPage = lines.filter((l) => l.page === p && l.text.trim());
    for (const l of [...onPage.slice(0, 3), ...onPage.slice(-3)]) edge.add(l.index);
  }
  const seen = new Map<string, Set<number>>();
  for (const l of lines) {
    const k = squash(l.text);
    if (!k || !edge.has(l.index)) continue;
    (seen.get(k) ?? seen.set(k, new Set()).get(k)!).add(l.page);
  }
  for (const l of lines) {
    const k = squash(l.text);
    if (!k) continue;
    if (DOC_ID_LINE.some((re) => re.test(k)) || PAGE_NUMBER.test(k) || isNoise(k)) l.dropped = true;
    else if (pages > 1 && edge.has(l.index) && (seen.get(k)?.size ?? 0) >= 2 && k.length <= 200) l.dropped = true;
  }
  return lines;
}

/**
 * OCR noise from a seal or signature scribble ("UTILITYS.... %", "RCT NO 21 /Nx)SS III= R //S",
 * "90900000000000"): no lowercase word of 3+ letters, and not a plain capitals line either.
 */
export function isNoise(text: string): boolean {
  const t = text.trim();
  if (!t || /[a-z]{3,}/.test(t)) return false;
  if (/^\d{9,}$/.test(t)) return true; // a run of digits from a stamp
  return /[%=^<>|\\{}~§]/.test(t);
}

/** Hyphenation repair when joining two wrapped lines. */
export function joinWrapped(a: string, b: string): string {
  const left = a.replace(/\s+$/, '');
  const right = b.replace(/^\s+/, '');
  if (!left) return right;
  if (!right) return left;
  // "Assessor-" + "Collector" -> "Assessor-Collector" (keep the hyphen: it may be a real one).
  if (/[A-Za-z]-$/.test(left)) return left + right;
  return `${left} ${right}`;
}

const OCR_DIGIT: Record<string, string> = { l: '1', I: '1', '|': '1', i: '1', O: '0', o: '0' };

/**
 * Read a top-level item number from the start of a line, fixing OCR-style misreads only when
 * the result is the number the list needs next (§3.2). `S` -> `5` only in that case too.
 * Returns the number and the length of the marker (number + "." or ")" + spaces), or null.
 */
export function readItemNumber(text: string, expected: number, start?: RegExp, ocr = false): { n: number; marker: number } | null {
  if (start) {
    const m = start.exec(text);
    if (!m || m.index !== 0) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? { n, marker: m[0].length } : null;
  }
  // OCR text only: "2 Public Comments" (the period lost) and "il." (a speck read as a second "1").
  if (ocr) {
    const bare = /^(\s*)(\d{1,2})(\s+)(?=[A-Z])/.exec(text);
    if (bare && Number(bare[2]) === expected) return { n: expected, marker: bare[0].length };
    const doubled = /^(\s*)[iIl|]{2}[.)](\s+)/.exec(text);
    if (doubled && expected === 1) return { n: 1, marker: doubled[0].length };
  }
  const m = /^(\s*)([0-9lI|iOoS]{1,2})([.),])(\s+|$)/.exec(text);
  if (!m) return null;
  const raw = m[2]!;
  const want = String(expected);
  let fixed = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (/\d/.test(ch)) fixed += ch;
    else if (ch === 'S') fixed += want[i] === '5' ? '5' : 'S';
    else fixed += OCR_DIGIT[ch] ?? ch;
  }
  if (!/^\d+$/.test(fixed)) return null;
  // Only accept a misread (a letter for a digit, or "3," for "3.") when it yields exactly the expected number.
  if ((fixed !== raw || m[3] === ',') && fixed !== want) return null;
  // A lone letter ("i." roman sub-item, "I." heading) is only a number when it fixes to the expected one.
  return { n: Number(fixed), marker: m[0].length };
}
