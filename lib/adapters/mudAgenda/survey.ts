import { textLayerStats } from '../pdfText';
import { GENERIC, detectFirm, type FirmMatch } from './profiles';

// Phase 0 survey helpers (mud-code-parser-spec §7). Pure functions: the survey script
// (scripts/survey-agenda-pdfs.ts) fetches the PDFs and calls these on the page text.
// Until Phase 1's parser exists, the rung is estimated from the list's shape: a clean
// "1. 2. 3." list will most likely parse on rung 1, other text-layer documents need rung 2
// or 4, and documents with no text layer need OCR (rung 3).

/** Default top-level item marker (§3.4). */
export const ITEM_START = /^\s*(\d{1,2})[.)]\s+/;
/** Minimum run of in-order numbers for a list to count as numbered. */
export const MIN_NUMBERED_RUN = 4;

export type ListShape = 'numbered' | 'unnumbered' | 'scanned';
export type LikelyRung = '1' | '2/4' | '3' | 'none';

/**
 * The longest run of top-level numbers that starts at 1 and goes up by one, line by line.
 * Lines that start with other numbers (addresses, amounts) are skipped, not counted as breaks.
 */
export function numberedRun(text: string): number {
  let next = 1;
  for (const line of text.split(/\r?\n|\f/)) {
    const m = ITEM_START.exec(line);
    if (m && Number(m[1]) === next) next++;
  }
  return next - 1;
}

export function listShape(pages: string[]): { shape: ListShape; run: number } {
  if (!textLayerStats(pages).has_text_layer) return { shape: 'scanned', run: 0 };
  const run = numberedRun(pages.join('\n'));
  return { shape: run >= MIN_NUMBERED_RUN ? 'numbered' : 'unnumbered', run };
}

export function likelyRung(shape: ListShape | undefined): LikelyRung {
  if (shape === 'numbered') return '1';
  if (shape === 'unnumbered') return '2/4';
  if (shape === 'scanned') return '3';
  return 'none';
}

export type SurveyDoc = { url: string; date: string; pages: string[] };

export type SurveyRow = {
  id: string;
  water_district: boolean;
  /** Firm from the text-layer documents (null if none: scans can't be identified before OCR). */
  firm: FirmMatch | null;
  /** Shape of the newest document, or undefined when there is none. */
  shape?: ListShape;
  run?: number;
  rung: LikelyRung;
  docs: number;
  /** Documents with a text layer, of `docs`. */
  text_docs: number;
  newest_url?: string;
  newest_date?: string;
  error?: string;
};

export function surveyRow(input: { id: string; water_district: boolean; docs: SurveyDoc[]; error?: string }): SurveyRow {
  const docs = [...input.docs].sort((a, b) => b.date.localeCompare(a.date));
  const shapes = docs.map((d) => listShape(d.pages));
  // Newest text-layer document first; an older one can still name the firm when the newest doesn't.
  const firms = docs.filter((_, i) => shapes[i]!.shape !== 'scanned').map((d) => detectFirm(d.pages.join('\n')));
  const firm = firms.find((f) => f.id !== GENERIC.id) ?? firms[0] ?? null;
  const newest = shapes[0];
  return {
    id: input.id,
    water_district: input.water_district,
    firm,
    shape: newest?.shape,
    run: newest?.run,
    rung: likelyRung(newest?.shape),
    docs: docs.length,
    text_docs: shapes.filter((s) => s.shape !== 'scanned').length,
    newest_url: docs[0]?.url,
    newest_date: docs[0]?.date,
    ...(input.error ? { error: input.error } : {}),
  };
}

export type SurveySummary = {
  sources: number;
  water_districts: number;
  with_document: number;
  by_shape: Record<ListShape, number>;
  by_firm: Record<string, number>;
  /** Water districts with a text-layer document whose firm wasn't identified. */
  unidentified_text: number;
  /** unidentified_text / water districts with a text-layer document. */
  unidentified_share: number;
  failed: number;
};

/** Counts over water districts only (the spec's denominators). */
export function summarize(rows: SurveyRow[]): SurveySummary {
  const water = rows.filter((r) => r.water_district);
  const withDoc = water.filter((r) => r.docs > 0);
  const withText = water.filter((r) => r.firm);
  const by_shape: Record<ListShape, number> = { numbered: 0, unnumbered: 0, scanned: 0 };
  for (const r of withDoc) if (r.shape) by_shape[r.shape]++;
  const by_firm: Record<string, number> = {};
  for (const r of withText) by_firm[r.firm!.id] = (by_firm[r.firm!.id] ?? 0) + 1;
  const unidentified = withText.filter((r) => r.firm!.id === 'generic').length;
  return {
    sources: rows.length,
    water_districts: water.length,
    with_document: withDoc.length,
    by_shape,
    by_firm: Object.fromEntries(Object.entries(by_firm).sort((a, b) => b[1] - a[1])),
    unidentified_text: unidentified,
    unidentified_share: withText.length ? Math.round((unidentified / withText.length) * 1000) / 1000 : 0,
    failed: water.filter((r) => r.docs === 0).length,
  };
}
