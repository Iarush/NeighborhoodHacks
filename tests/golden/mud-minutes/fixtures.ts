import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { buildFromExtraction } from '@/lib/adapters/llmExtract';
import { parseMudAgenda } from '@/lib/adapters/mudAgenda/parse';
import { parseMudMinutes, type MinutesParse } from '@/lib/adapters/mudAgenda/minutes';
import { detectFirm, profileById } from '@/lib/adapters/mudAgenda/profiles';
import type { Item, Meeting } from '@/lib/adapters/types';
import { ZONE } from '@/lib/ingest/normalize';
import { loadOutput, read as readLlm, readJson as readLlmJson } from '../llm-extract/fixtures';

// Loader for the mud_agenda minutes golden set (see README.md in this folder).

export const DIR = fileURLToPath(new URL('.', import.meta.url));

export type MinutesMeta = {
  source_id: string;
  /** Meeting date (the agenda's). */
  date: string;
  firm: string;
  text: 'pdf text layer' | 'tesseract ocr';
  agenda_url: string | null;
  minutes_url: string;
  note: string;
};

/** The part of a parse a person checks by hand against the minutes. */
export type MinutesExpected = {
  voted: number;
  matched: number;
  updates: { agenda_number?: string; action: string; vote_result: string; quote_verified: boolean; source_quote: string }[];
  warnings: string[];
  sections: MinutesParse['sections'];
};

/** MUD 489's known items come from the llm_extract golden set (hand-checked extractions). */
const LLM_AGENDA: Record<string, { dir: string; date: string; minutes: string }> = {
  'hcmud_489-2026-07-20': { dir: 'mud489-2026-07-20', date: '2026-07-20', minutes: 'minutes/mud489-2026-07-20/source.txt' },
  'hcmud_489-2026-05-18': { dir: 'mud489-2026-05-19', date: '2026-05-19', minutes: 'minutes/mud489-2026-05-18/source.txt' },
};

export const CASES = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const read = (name: string, file: string) => readFileSync(join(DIR, name, file), 'utf8');

/** The meeting and items known before the minutes: the agenda's parse, the day after the meeting. */
export function knownItems(name: string, meta: MinutesMeta): { meeting: Meeting; items: Item[] } {
  const llm = LLM_AGENDA[name];
  if (llm) {
    const r = buildFromExtraction([loadOutput(`${llm.dir}/gemini_output.json`)], {
      source_id: meta.source_id,
      body_id: meta.source_id,
      url: readLlmJson<{ url: string }>(`${llm.dir}/meta.json`).url,
      fullText: readLlm(`${llm.dir}/source.txt`),
      scanned: false,
      now: DateTime.fromISO(llm.date, { zone: ZONE }).plus({ days: 1, hours: 12 }).toJSDate(),
      link: { date: llm.date, type: 'regular' },
      default_time: '11:00',
    });
    if (!r.meeting) throw new Error(`${name}: bad agenda fixture`);
    return { meeting: r.meeting, items: r.items };
  }
  const text = read(name, 'agenda.txt');
  const r = parseMudAgenda(text, profileById(detectFirm(text).id), {
    source_id: meta.source_id,
    body_id: meta.source_id,
    url: meta.agenda_url ?? '',
    now: DateTime.fromISO(meta.date, { zone: ZONE }).plus({ days: 1, hours: 12 }).toJSDate(),
    link: { date: meta.date, type: 'regular' },
  });
  if (!r.ok || !r.meeting) throw new Error(`${name}: agenda did not parse: ${r.reasons.join('; ')}`);
  return { meeting: r.meeting as Meeting, items: r.items as Item[] };
}

/** The minutes text the case is about: OCR text when there is some, else the text layer. */
export function minutesText(name: string): { text: string; ocr: boolean } {
  if (existsSync(join(DIR, name, 'minutes.ocr.txt'))) return { text: read(name, 'minutes.ocr.txt'), ocr: true };
  if (existsSync(join(DIR, name, 'minutes.txt'))) return { text: read(name, 'minutes.txt'), ocr: false };
  return { text: readLlm(LLM_AGENDA[name]!.minutes), ocr: false };
}

/** The text layer of a case whose fixture is OCR, when the set has one (MUD 489 May). */
export const textLayer = (name: string): string | null => (LLM_AGENDA[name] ? readLlm(LLM_AGENDA[name]!.minutes) : null);

export function minutesCase(name: string) {
  const meta = JSON.parse(read(name, 'meta.json')) as MinutesMeta;
  const known = knownItems(name, meta);
  const { text, ocr } = minutesText(name);
  const result = parseMudMinutes(text, known.items, { meeting_external_id: known.meeting.external_id, url: meta.minutes_url, ocr });
  const number = new Map(known.items.map((i) => [i.external_id, i.agenda_number]));
  const actual: MinutesExpected = {
    voted: result.voted,
    matched: result.matched,
    updates: result.updates.map((u) => ({
      agenda_number: number.get(u.item_external_id),
      action: u.action,
      vote_result: u.vote_result,
      quote_verified: u.quote_verified ?? false,
      source_quote: u.source_quote ?? '',
    })),
    warnings: result.warnings,
    sections: result.sections,
  };
  const expectedPath = join(DIR, name, 'expected.json');
  const expected = existsSync(expectedPath) ? (JSON.parse(readFileSync(expectedPath, 'utf8')) as MinutesExpected) : null;
  return { meta, known, text, ocr, result, actual, expected };
}
