import { extractText, getDocumentProxy } from 'unpdf';
import { documentContentHash } from '@/lib/ingest/hash';

// PDF text-layer extraction (agent-scraper-spec §8 Step 5, D6).

/** Page separator used when pages are joined into one string (stored as `documents.raw`). */
export const PAGE_BREAK = '\f';

export type PdfText = {
  pages: string[];
  /** Pages joined with PAGE_BREAK. This is the exact text the LLM sees and the quote check runs on. */
  text: string;
  /** D6: false means the document is treated as scanned. */
  has_text_layer: boolean;
  avg_chars_per_page: number;
  /** Share of pages with more than 50 non-whitespace characters. */
  text_page_ratio: number;
  /** sha256 of the PDF bytes. */
  sha256: string;
};

export const MIN_AVG_CHARS = 200;
export const MIN_PAGE_CHARS = 50;
export const MIN_TEXT_PAGE_RATIO = 0.6;

/** D6 rule: >= 200 non-whitespace chars per page on average AND >= 60% of pages with > 50 chars. */
export function textLayerStats(pages: string[]): Pick<PdfText, 'has_text_layer' | 'avg_chars_per_page' | 'text_page_ratio'> {
  const counts = pages.map((p) => p.replace(/\s/g, '').length);
  const n = Math.max(pages.length, 1);
  const avg = counts.reduce((a, b) => a + b, 0) / n;
  const ratio = counts.filter((c) => c > MIN_PAGE_CHARS).length / n;
  return {
    has_text_layer: pages.length > 0 && avg >= MIN_AVG_CHARS && ratio >= MIN_TEXT_PAGE_RATIO,
    avg_chars_per_page: Math.round(avg),
    text_page_ratio: Math.round(ratio * 1000) / 1000,
  };
}

export function pdfTextFromPages(pages: string[], sha256: string): PdfText {
  return { pages, text: pages.join(PAGE_BREAK), sha256, ...textLayerStats(pages) };
}

/** Split stored text back into pages. */
export const splitPages = (text: string) => text.split(PAGE_BREAK);

/** Extract per-page text with unpdf. */
export async function getPdfText(bytes: Uint8Array): Promise<PdfText> {
  const sha = documentContentHash(bytes);
  // pdf.js may detach the buffer it is given; pass a copy so callers keep their bytes.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return pdfTextFromPages(text, sha);
}

type PositionedItem = { str: string; x: number; y: number; w: number; h: number };

/**
 * Lines rebuilt from word positions (mud-code-parser-spec §4 rung 2). Fixes text layers whose
 * reading order is jumbled: "1." "2." "3." in one run and the item text in another, columns read
 * one after the other, or run-on lines. Items are grouped into lines by y, ordered by x; a gap
 * wider than a quarter of the page splits a line into two columns (left first).
 */
export function linesFromPositions(items: PositionedItem[], pageWidth: number): string[] {
  const words = items.filter((i) => i.str.trim());
  // Top of the page first (PDF y grows upward).
  words.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PositionedItem[][] = [];
  for (const w of words) {
    const row = rows.at(-1);
    const tol = Math.max(2, Math.min(w.h || 10, row?.[0]?.h || 10) * 0.5);
    if (row && Math.abs(row[0]!.y - w.y) <= tol) row.push(w);
    else rows.push([w]);
  }
  const out: string[] = [];
  const colGap = pageWidth * 0.25;
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let line = '';
    let prevEnd: number | undefined;
    const parts: string[] = [];
    for (const w of row) {
      const gap = prevEnd === undefined ? 0 : w.x - prevEnd;
      if (prevEnd !== undefined && gap > colGap) {
        parts.push(line);
        line = '';
      } else if (prevEnd !== undefined && gap > Math.max(1, (w.h || 10) * 0.15) && !/\s$/.test(line) && !/^\s/.test(w.str)) {
        line += ' ';
      }
      line += w.str;
      prevEnd = w.x + w.w;
    }
    parts.push(line);
    out.push(...parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean));
  }
  return out;
}

/** Per-page text rebuilt from word positions (rung 2). Same shape as getPdfText(). */
export async function getPositionedText(bytes: Uint8Array): Promise<PdfText> {
  const sha = documentContentHash(bytes);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { width } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PositionedItem[] = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) });
    }
    pages.push(linesFromPositions(items, width).join('\n'));
  }
  return pdfTextFromPages(pages, sha);
}
