import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMudAgenda } from '@/lib/adapters/mudAgenda/parse';
import { detectFirm, profileById } from '@/lib/adapters/mudAgenda/profiles';

// Loader for the mud_agenda golden set (see README.md in this folder).

export type GoldenMeta = {
  source_id: string;
  url: string;
  /** Date of the index link (the parser checks the notice date against it). */
  date: string;
  type: 'regular' | 'special';
  note: string;
  recorded_at: string;
  /** Where agenda.txt came from: the PDF text layer, Tesseract OCR, or written by hand. */
  text: 'pdf text layer' | 'tesseract ocr' | 'hand-written';
  pdf_sha256?: string;
};

/** The part of a parse a person checks by hand against the agenda. */
export type GoldenExpected = {
  ok: boolean;
  reasons: string[];
  profile: string;
  meeting?: { date: string; type: string; status: string; comment_rules_text?: string };
  items: { agenda_number?: string; title: string; description?: string; section?: string; quote_verified?: boolean; contains_private_person: boolean }[];
};

/** Fixed "now" for every case, so item status doesn't change with the calendar. */
export const GOLDEN_NOW = new Date('2026-11-04T12:00:00Z');

export function goldenCase(dir: string) {
  const text = readFileSync(join(dir, 'agenda.txt'), 'utf8');
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as GoldenMeta;
  const firm = detectFirm(text);
  const result = parseMudAgenda(text, profileById(firm.id), {
    source_id: meta.source_id,
    body_id: meta.source_id,
    url: meta.url,
    now: GOLDEN_NOW,
    link: { date: meta.date, type: meta.type },
    ocr: meta.text === 'tesseract ocr',
  });
  const actual: GoldenExpected = {
    ok: result.ok,
    reasons: result.reasons,
    profile: result.profile,
    ...(result.meeting
      ? {
          meeting: {
            date: result.meeting.date,
            type: result.meeting.type,
            status: result.meeting.status,
            ...(result.meeting.comment_rules_text ? { comment_rules_text: result.meeting.comment_rules_text } : {}),
          },
        }
      : {}),
    items: result.items.map((i) => ({
      agenda_number: i.agenda_number,
      title: i.title,
      ...(i.description ? { description: i.description } : {}),
      ...(i.section ? { section: i.section } : {}),
      quote_verified: i.quote_verified,
      contains_private_person: i.contains_private_person,
    })),
  };
  return { text, meta, result, actual };
}
