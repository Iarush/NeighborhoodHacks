import { DateTime } from 'luxon';
import type { Item, Meeting } from '../types';
import { parseAmounts } from '@/lib/ingest/amounts';
import { llmItemExternalId, sha1 } from '@/lib/ingest/hash';
import { ZONE, parseClock, toChicagoIso } from '@/lib/ingest/normalize';
import { redactPersonnel } from '@/lib/ingest/redact';
import { itemStatus, quoteInSource } from '@/lib/ingest/validate';
import { GENERIC, type FirmProfile } from './profiles';
import { joinWrapped, markFurniture, readItemNumber, splitLines, type Line } from './normalize';

// The MUD agenda parser (mud-code-parser-spec §3). Pure: text in, Meeting + Items out.
// Titles and descriptions are cut verbatim from the agenda; nothing is reworded.

export type ParseRung = 1 | 2 | 3 | 4;

export type ParseContext = {
  source_id: string;
  body_id: string;
  url: string;
  now: Date;
  /** Date and type from the index link. The notice date must be within 1 day of it (§1). */
  link?: { date: string; type: 'regular' | 'special' };
  default_time?: string;
  /** OCR text: items are not quote-verified and go to review (D6). */
  ocr?: boolean;
  /** Rung 4: the loose parser (§4). */
  loose?: boolean;
};

export type ParseResult = {
  ok: boolean;
  /** Why the parse was rejected (empty when ok). */
  reasons: string[];
  meeting?: Meeting;
  items: Item[];
  profile: string;
  warnings: string[];
};

export const DEFAULT_LIST_INTRO =
  /(?:act\s+(?:up)?on|consider(?:ed)?|transacted|discuss(?:ed)?|take\s+action\s+on|business)[^:]{0,160}?\b(?:following|as\s+follows)\b[^:]{0,80}?:|\bfollowing\s+(?:items|matters|agenda|business)\b[^:\n]{0,80}?:|\bas\s+follows\s*:|\b(?:items|matters)\s+(?:listed\s+)?below\b[^\n]{0,40}?[.:]|\bfollowing\s+listed\s+below\s*[.:]/i;

/** Lettered or roman sub-items: "a.", "a)", "(a)", "(i)", "i.", "ii)", bullets. */
export const DEFAULT_SUB_ITEM = /^\s*(?:\(?[a-z]{1,2}\)|[a-z]\.|\(?[ivx]{1,5}\)|[ivx]{1,5}\.|\([A-Z]\)|[A-Z]\.(?=\s)|[•▪●◦·\-–*o](?=\s))\s*/;

/** Lines where the list ends and the closing boilerplate begins (§3.3). */
const END_MARKERS: RegExp[] = [
  /^\s*\(\s*(?:DISTRICT\s+)?S\s*E\s*A\s*L\s*\)/i,
  /^\s*\S{3,12}\s+(?:for|or)\s+the\s+District\s*$/i, // "Attorney for the District", OCR'd as "Agony or the District"
  /^\s*\(\s*SELLO\s*\)/i,
  /^\s*EXECUTED\b/i,
  /^\s*(?:WITNESS\s+MY\s+HAND|ISSUED|POSTED|DATED)\b/i,
  /^\s*Persons\s+with\s+disabilit/i,
  /^\s*(?:Any|All)\s+persons?\s+with\s+disabilit/i,
  /^\s*If,?\s+during\s+the\s+course\s+of\s+the\s+meeting/i,
  /^\s*(?:The\s+)?Board\s+(?:of\s+Directors\s+)?(?:may|reserves|is\s+authorized)\b[^.]*\b(?:executive|closed)\s+session/i,
  /^\s*(?:NOTE|NOTICE)\s*:/i,
  // Wallace & Philbin's closing (Phase 6 shadow run): "The public is invited to attend." and
  // "The Board of Directors of <district> reserves the right to meet in closed session".
  /^\s*The\s+public\s+is\s+invited\s+to\s+attend\b/i,
  /^\s*The\s+Board\b[^.]{0,120}\breserves\s+the\s+right\s+to\s+meet\s+in\s+(?:closed|executive)\s+session/i,
  /^\s*Attorneys?\s+for\b/i,
  /^[^;:]{3,60},\s*Attorneys?\s+for\b/i,
  /^\s*[A-Z][\w,.&'’ ]{2,60}\b(?:L\.\s?L\.\s?P\.?|LLP|P\.C\.|PLLC)\s*$/,
  /^\s*(?:Taxpayer\s+Impact\s+Statement|Compliance\s+with\s+Texas\s+Government\s+Code)\b/i,
  /^\s*(?:PROCEDURES|RULES)\s+FOR\b/,
  /^\s*(?:General\s+)?Counsel\s+for\s+(?:the\s+)?District/i,
  /^\s*By\s*:/i,
  /^\s*\/s\/\s/i,
  /^\s*_{5,}/,
  /^\s*AVISO\b/i,
  /^\s*Las\s+personas\s+con\s+discapacidad/i,
  /^\s*Pursuant\s*to\b.{0,120}(?:551|Open\s+Meetings|closed\s+session|executive\s+session)/,
  /^\s*In\s+accordance\s+with\b[^.]*551/,
  /^\s*ADJOURN(?:MENT)?\s*$/i,
];

/** Boilerplate lines that may repeat at the top of every page (ABHR's disability header). */
const HEADER_BOILERPLATE = /^\s*Persons\s+with\s+disabilities\s+who\s+plan\s+to\s+attend/i;

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATE_RE = new RegExp(`\\b(?:(${MONTHS})\\s+([\\dSlIO]{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})|(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?(${MONTHS}),?\\s+(\\d{4}))`, 'i');
/** "November 2nd," with no year (Phase 6): the year comes from the link date. */
const DATE_NO_YEAR_RE = new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*,?\\s*\\d)`, 'i');
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?|(noon))/i;

const CANCELLED = /\b(?:cancel+ed|cancel+ation|postponed)\b/i;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

const MEETS_RE = /\b(?:will\s+(?:hold|meet|be\s+held|convene)|held\s+(?:on|at)|meeting\s+(?:on|at))\b/i;

function parseNoticeDate(notice: string, linkYear?: string): { date?: string; time?: string } {
  const flat = squash(notice);
  // Prefer a date in a "will hold / will meet / will be held / held on" sentence, after those words
  // (a statute's date can come earlier in the same sentence).
  const sentences = flat.split(/(?<=[.;:])\s+(?=[A-Z])/);
  const ranked = [
    ...sentences.filter((s) => MEETS_RE.test(s)).map((s) => s.slice(MEETS_RE.exec(s)!.index)),
    ...sentences,
    ...(linkYear ? sentences.filter((s) => MEETS_RE.test(s)).map((s) => ({ noYear: s.slice(MEETS_RE.exec(s)!.index) })) : []),
  ];
  for (const entry of ranked) {
    const s = typeof entry === 'string' ? entry : entry.noYear;
    let mon: string, rawDay: string, year: string | undefined;
    if (typeof entry === 'string') {
      const m = DATE_RE.exec(s);
      if (!m) continue;
      [mon, rawDay, year] = m[1] ? [m[1], m[2]!, m[3]] : [m[5]!, m[4]!, m[6]];
    } else {
      const m = DATE_NO_YEAR_RE.exec(s);
      if (!m) continue;
      [mon, rawDay, year] = [m[1]!, m[2]!, linkYear];
    }
    // OCR misreads in the day ("November S, 2026"): S->5, l/I->1, O->0.
    const day = rawDay.replace(/S/g, '5').replace(/[lI]/g, '1').replace(/O/g, '0');
    const month = mon!.charAt(0).toUpperCase() + mon!.slice(1).toLowerCase();
    const d = DateTime.fromFormat(`${month} ${day} ${year}`, 'MMMM d yyyy', { zone: ZONE, locale: 'en-US' });
    if (!d.isValid) continue;
    const t = TIME_RE.exec(s);
    let time: string | undefined;
    if (t) time = t[4] ? '12:00' : `${t[1]}:${t[2] ?? '00'} ${t[3]!.toLowerCase()}m`;
    if (time && !parseClock(time)) time = undefined;
    return { date: d.toFormat('yyyy-MM-dd'), time };
  }
  return {};
}

function meetingType(notice: string, link?: ParseContext['link']): Meeting['type'] {
  const flat = squash(notice);
  if (/\b(?:special|emergency|joint)\b[^.]{0,40}\b(?:meeting|session)\b|\bAJOB\b/i.test(flat)) return 'special';
  if (/\bregular\b[^.]{0,40}\b(?:meeting|session)\b/i.test(flat)) return 'regular';
  return link?.type ?? 'regular';
}

const safeDecode = (url: string) => {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
};

type RawItem = {
  n: number;
  /** The number as printed, when it isn't n: "C.1" in a sectioned agenda (collectSectioned). */
  label?: string;
  /** Lines of the item, the first one with the marker removed. */
  lines: { text: string; line: Line; sub: boolean }[];
  section?: string;
  /** A nested "1. 2." list was opened inside this item by a line ending in ":". */
  nested?: boolean;
};

/** A short heading line ("Director-Requested Items") between two items. */
function looksLikeHeading(text: string): boolean {
  const t = squash(text);
  if (!t || t.length > 60 || /[;.,:]$/.test(t)) return false;
  const words = t.split(' ');
  return words.length <= 6 && words.every((w) => /^[A-Z0-9&(\-'’/]/.test(w) || /^(?:of|and|the|for|to|on|in)$/.test(w));
}

/** A signature line: a person's or firm's name right before "Attorney for the District". */
function looksLikeSignature(text: string): boolean {
  const t = squash(text);
  if (!t) return true;
  if (t.length > 70 || /[;:]$/.test(t)) return false;
  if (/^(?:By:?|\/s\/)/i.test(t)) return true;
  if (/\b(?:L\.?L\.?P\.?|P\.?C\.?|PLLC|Attorneys?|Firm)\b/.test(t)) return true;
  const words = t.replace(/[.,]$/, '').split(' ');
  return words.length <= 5 && words.every((w) => /^[A-Z][A-Za-z.'’-]*,?$/.test(w));
}

function findIntro(lines: Line[], profile: FirmProfile): number {
  const intro = profile.list_intro ?? DEFAULT_LIST_INTRO;
  // Search the joined text so an intro wrapped over two lines is found; map back to a line.
  let joined = '';
  const starts: number[] = [];
  for (const l of lines) {
    starts.push(joined.length);
    joined += l.text + '\n';
  }
  const m = intro.exec(joined);
  if (!m) return -1;
  const end = m.index + m[0].length;
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1]! <= end - 1) i++;
  return i;
}

/** Item text for the quote: the item's lines as they stand in the original, marker removed. */
function quoteFor(item: RawItem, original: string): string | undefined {
  const parts = item.lines.map((l) => l.text);
  const full = parts.join('\n').trim();
  if (full && quoteOk(full, original)) return full;
  // Page furniture inside the item: fall back to the longest run that is contiguous in the original.
  let best = '';
  let run: string[] = [];
  let prev = -2;
  for (const l of item.lines) {
    if (l.line.index !== prev + 1 && run.length) {
      const s = run.join('\n').trim();
      if (s.length > best.length) best = s;
      run = [];
    }
    run.push(l.text);
    prev = l.line.index;
  }
  const s = run.join('\n').trim();
  if (s.length > best.length) best = s;
  return best && quoteOk(best, original) ? best : undefined;
}

const repairHyphen = (t: string) => t.replace(/-[ \t]*\r?\n[ \t]*/g, '-').replace(/\f/g, '\n');
function quoteOk(quote: string, original: string): boolean {
  return quoteInSource(quote, original) || quoteInSource(repairHyphen(quote), repairHyphen(original));
}

const trimTitle = (t: string) =>
  squash(t)
    .replace(/[\s,;]*(?:;\s*and|;\s*or|,\s*and)$/i, '')
    .replace(/[\s;,.:]+$/, '');

function shapeItem(raw: RawItem): { title: string; description?: string } {
  // Title: first line plus wrapped lines up to the first sub-item or "including:".
  let title = '';
  const desc: string[] = [];
  let inTitle = true;
  for (const l of raw.lines) {
    if (inTitle && !l.sub) {
      title = joinWrapped(title, l.text);
      const inc = /^(.*?)(?:,\s*)?\bincluding(?:\s+the\s+following)?\s*:\s*(.*)$/i.exec(title);
      if (inc) {
        title = inc[1]!;
        if (inc[2]!.trim()) desc.push(inc[2]!.trim());
        inTitle = false;
      }
      continue;
    }
    inTitle = false;
    if (l.sub || !desc.length) desc.push(squash(l.text));
    else desc[desc.length - 1] = joinWrapped(desc[desc.length - 1]!, l.text);
  }
  const description = desc.map(squash).filter(Boolean).join('\n');
  return { title: trimTitle(title), ...(description ? { description } : {}) };
}

/**
 * Split the list into items. Strict mode (rungs 1-3) needs "1. 2. 3." markers in order;
 * loose mode (rung 4) numbers blocks separated by blank lines or bullets itself.
 */
function collectItems(lines: Line[], from: number, profile: FirmProfile, loose: boolean, reasons: string[], ocr = false): { items: RawItem[]; end: number; boilerplate: boolean } {
  const subRe = profile.sub_item_start ?? DEFAULT_SUB_ITEM;
  const endRes = [...END_MARKERS, ...(profile.extra_boilerplate ?? [])];
  const items: RawItem[] = [];
  let boilerplate = false;
  let end = lines.length;
  let pendingSection: string | undefined;
  let blankBefore = true;
  const strays: number[] = [];
  /** Lower numbers inside items: a second numbered list (consent + regular agenda) or nested numbering. */
  const restarts: number[] = [];
  /** A "CONSENT AGENDA" / "REGULAR AGENDA" heading inside the list. */
  let sections = false;
  let sectionHeading = false;
  // Loose mode splits on sentence ends only when the layout put the numbers on their own lines.
  const looseSentences = loose && lines.slice(from).filter((x) => /^\s*\d{1,2}[.)]\s*$/.test(x.text)).length >= 2;
  for (let i = from; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.dropped) continue;
    if (HEADER_BOILERPLATE.test(l.text)) {
      // A repeated disability header: skip it and its wrapped continuation line(s).
      boilerplate = true;
      l.dropped = true;
      while (i + 1 < lines.length && !/(?:made|meeting)\.\s*$/.test(lines[i]!.text) && !lines[i + 1]!.text.match(/^\s*\d{1,2}[.)]\s/)) {
        i++;
        lines[i]!.dropped = true;
      }
      continue;
    }
    if (endRes.some((re) => re.test(l.text))) {
      boilerplate = true;
      // Boilerplate in the middle of the list: "(SEAL)" stamped at the top of page 2, a disability
      // notice repeated as a page header, or the §551 paragraph under an "Executive Session" item.
      // The block runs to the first line ending in "." (at most 8 lines). When the list goes on
      // right after it (next item number, or a sub-item of the current item), skip the block.
      if (loose && items.length && /^\s*\(\s*S\s*E\s*A\s*L\s*\)\s*$/i.test(l.text)) {
        l.dropped = true;
        continue;
      }
      if (!loose && items.length) {
        let j = i;
        if (!/\.\s*$/.test(l.text) && !/^\s*\(\s*S\s*E\s*A\s*L\s*\)\s*$/i.test(l.text)) {
          while (j + 1 < lines.length && j - i < 8 && !/\.\s*$/.test(lines[j]!.text)) j++;
        }
        const next = lines.slice(j + 1).find((x) => !x.dropped && x.text.trim());
        const continues =
          next &&
          (readItemNumber(next.text, items.length + 1, profile.item_start, ocr)?.n === items.length + 1 ||
            (subRe.test(next.text) && !endRes.some((re) => re.test(next.text)) && items.at(-1)!.lines.some((x) => x.sub)));
        if (continues) {
          for (let k = i; k <= j; k++) lines[k]!.dropped = true;
          i = j;
          continue;
        }
      }
      end = i;
      break;
    }
    const text = l.text;
    if (!text.trim()) {
      blankBefore = true;
      continue;
    }
    const expected = items.length + 1;
    if (!loose) {
      const num = readItemNumber(text, expected, profile.item_start, ocr);
      if (num && num.n === expected) {
        items.push({ n: expected, lines: [{ text: text.slice(num.marker), line: l, sub: false }], ...(pendingSection ? { section: pendingSection } : {}) });
        pendingSection = undefined;
        blankBefore = false;
        continue;
      }
      // OCR text only: a garbled marker ("Di", "am", "25", "i." for "2.") on a line that starts after a
      // blank line, with item expected+1 next in the list, is item `expected` (Phase 6 shadow run).
      // Also right under the previous item when that one ended (";" or "."): "36 Hear", "i. Hear", "BE Security".
      const prevEnded = items.length > 0 && /[;.]\s*$/.test(items.at(-1)!.lines.at(-1)!.text);
      const garbled = ocr && (blankBefore || prevEnded) ? /^(\s*)(\S{1,3})(\s+)(?=[A-Z])/.exec(text) : null;
      const word = garbled && /^(?:A|An|The|Any|All|For|And|If|In|On|At|By|To|Of|No|Or|As|It|Its|Per|Not|May|Can|Has|Was|Are|Our)$/.test(garbled[2]!);
      // A sub-item marker ("a.", "i.") counts only when it isn't a sub-item: the item above has none of its own.
      const subLike = !!garbled && subRe.test(text) && (items.at(-1)?.lines.some((x) => x.sub) || !prevEnded);
      // The rest must read like an item, not a stamp or signature: 2+ words, mostly lowercase, no firm suffix.
      const rest = garbled ? text.slice(garbled[0].length) : '';
      const letters = rest.replace(/[^A-Za-z]/g, '');
      const itemLike = rest.trim().split(/\s+/).length >= 2 && letters.length >= 6 && letters.replace(/[^a-z]/g, '').length / letters.length >= 0.6 && !/\b(?:L\.?L\.?P|P\.C|PLLC)\b/.test(rest) && !endRes.some((re) => re.test(text));
      if (garbled && itemLike && !word && !subLike && !/^[A-Z][a-z]{2,}$/.test(garbled[2]!)) {
        // The next readable number is expected+1, or expected+2 with exactly one more garbled marker
        // (after a blank line, before a capital) in between: two misread numbers in a row.
        const after = lines.slice(i + 1);
        const reads = (x: Line, n: number) => !x.dropped && readItemNumber(x.text, n, profile.item_start, ocr)?.n === n;
        let nextNum = after.find((x) => reads(x, expected + 1));
        let between = nextNum ? lines.slice(i + 1, lines.indexOf(nextNum)) : [];
        if (!nextNum) {
          const n2 = after.find((x) => reads(x, expected + 2));
          const mid = n2 ? lines.slice(i + 1, lines.indexOf(n2)) : [];
          const cands = mid.filter((x, k) => !x.dropped && (k === 0 || !mid[k - 1]!.text.trim()) && /^\s*\S{1,3}\s+[A-Z][a-z]/.test(x.text) && !subRe.test(x.text) && !endRes.some((re) => re.test(x.text)));
          if (n2 && cands.length === 1) {
            nextNum = n2;
            between = mid.filter((x) => x !== cands[0]);
          }
        }
        if (nextNum && between.length <= 25 && !between.some((x) => !x.dropped && /^\s*\d{1,2}[.)]\s/.test(x.text))) {
          items.push({ n: expected, lines: [{ text: text.slice(garbled[0].length), line: l, sub: false }], ...(pendingSection ? { section: pendingSection } : {}) });
          pendingSection = undefined;
          blankBefore = false;
          continue;
        }
      }
      if (num && num.n > expected && num.n <= expected + 3 && items.length) {
        reasons.push(`item ${expected} missing: found ${num.n} after ${expected - 1}`);
      }
      if (!items.length) continue; // text between the intro and item 1
      const next = lines.slice(i + 1).find((x) => !x.dropped && x.text.trim());
      if (looksLikeHeading(text) && next && readItemNumber(next.text, expected, profile.item_start, ocr)?.n === expected && /[;.]\s*$/.test(items.at(-1)!.lines.at(-1)!.text)) {
        pendingSection = squash(text);
        continue;
      }
      // A lower number inside an item is a nested list when it follows a line ending in ":" or
      // continues one; otherwise the numbering restarted (a second list: consent + regular agenda).
      if (/^\s*(?:[A-Z][.)]\s+)?(?:CONSENT|REGULAR)\s+AGENDA\b/i.test(text)) sectionHeading = true;
      const nested = /^\s*(\d{1,2})[.)]\s+\S/.exec(text);
      const cur = items.at(-1)!;
      if (nested && Number(nested[1]) < expected) {
        const n = Number(nested[1]);
        const prevLine = cur.lines.at(-1)!.text;
        const opensList = /:\s*$/.test(prevLine) || (cur.lines.some((x) => x.sub) && !/\b(?:AGENDA|items)\b/.test(prevLine));
        if (n === 1 && sectionHeading) sections = true;
        if (n === 1 ? !opensList : !cur.nested) restarts.push(n);
        else cur.nested = true;
      }
      cur.lines.push({ text, line: l, sub: subRe.test(text) || !!(nested && cur.nested) });
      continue;
    }
    // Loose: stray numbers from a jumbled layout ("1." "2." ... on lines of their own) are
    // counted, not kept. A new block starts after a blank line, at a bullet, or (only when stray
    // numbers were seen) at a capitalized line after one ending in ";" or ".".
    if (/^\s*\d{1,2}[.)]?\s*$/.test(text)) {
      strays.push(Number(/\d+/.exec(text)![0]));
      continue;
    }
    const bullet = /^\s*[•▪●◦·*\-–]\s+/.exec(text);
    const prev = items.at(-1)?.lines.at(-1)?.text ?? '';
    const sub = subRe.test(text);
    const sentence = !sub && /[;.]\s*$/.test(prev) && /^\s*["'“A-Z]/.test(text);
    if (bullet || blankBefore || !items.length || (sentence && looseSentences)) {
      items.push({ n: expected, lines: [{ text: bullet ? text.slice(bullet[0].length) : text, line: l, sub: false }] });
    } else {
      items.at(-1)!.lines.push({ text, line: l, sub });
    }
    blankBefore = false;
  }
  // Signature lines right before the end marker ("Katie Sherborne" / "Attorney for the District").
  if (items.length) {
    const last = items.at(-1)!;
    // Right before "Attorney for the District" the name lines are a signature even when the item
    // above has no closing punctuation (some firms don't use any).
    const signedBelow = end < lines.length && /^\s*(?:Attorneys?|(?:General\s+)?Counsel)\s+for\b/i.test(lines[end]!.text);
    let popped = 0;
    while (last.lines.length > 1 && looksLikeSignature(last.lines.at(-1)!.text) && (/[;.:]\s*$/.test(last.lines.at(-2)!.text) || (signedBelow && popped < 2))) {
      last.lines.pop();
      popped++;
    }
    if (end === lines.length) {
      // No end marker: still accept a signature block at the very end as boilerplate.
      const tail = last.lines.at(-1)!.text;
      // Nothing follows the last item, so nothing can be misread as part of it.
      if (/[;.]\s*$/.test(tail) || last.lines.length <= 3) boilerplate = true;
    }
  }
  if (sections) reasons.push('numbering restarts under a CONSENT/REGULAR AGENDA heading; not a single 1..N list');
  if (!loose && restarts.includes(1) && restarts.includes(2)) {
    reasons.push('numbering restarts inside the list (sections or nested numbers); not a single 1..N list');
  }
  if (loose && lines.slice(from).filter((x) => !x.dropped && /^\s*\d{1,2}[.,)]\s+\S/.test(x.text)).length >= 3) {
    reasons.push('loose: the list is numbered, so it is for the strict parser');
  }
  if (loose) {
    // The stray numbers must run 1..N, and there must be exactly N blocks.
    if (strays.length) {
      const inOrder = strays.every((n, k) => n === k + 1);
      if (!inOrder) reasons.push(`loose: stray item numbers are not 1..${strays.length} in order`);
      else if (strays.length !== items.length) reasons.push(`loose: ${items.length} blocks but ${strays.length} item numbers`);
    } else if (items.some((it) => it.lines.length > 15)) {
      reasons.push('loose: a block is longer than 15 lines');
    }
  }
  return { items, end, boilerplate };
}

/** A CONSENT/REGULAR/ACTION section heading, after any outline marker. */
const SECTION_HEAD = /^\s*((?:CONSENT|REGULAR|ACTION|DISCUSSION)\s+(?:AGENDA|ITEMS)|ACTION\s+ITEMS|AGENDA\s+ITEMS\s+FOR\s+ACTION)\b\s*[:.\-–]?/i;
const OUTLINE_MARKER = /^(\s*)(\d{1,2}|[A-Z]|[IVX]{1,5})([.)])\s+(?=\S)/;
type MarkerKind = 'digit' | 'letter' | 'roman';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const markerValue = (kind: MarkerKind, n: number) => (kind === 'digit' ? String(n) : kind === 'letter' ? String.fromCharCode(64 + n) : ROMAN[n - 1] ?? '');
/** The kind a first marker ("1", "A", "I") starts; null if it doesn't start a list. */
const startKind = (tok: string): MarkerKind | null => (tok === '1' ? 'digit' : tok === 'A' ? 'letter' : tok === 'I' ? 'roman' : null);

/**
 * Agendas split into CONSENT / REGULAR (or ACTION ITEMS) sections whose numbering restarts in each
 * (Phase 6 shadow run, Iarush's decision Nov 5). Handles three outlines seen in the survey:
 *   unmarked headings with 1..N under each ("CONSENT AGENDA: ..." / "REGULAR AGENDA: ...");
 *   lettered top level with numbered sections ("A. Public comments", "C. CONSENT AGENDA:", "1. Minutes");
 *   roman top level with lettered sections ("I. Comments", "II. CONSENT AGENDA:", "A. Approve minutes").
 * Each section's children must run 1..N (or A..N) in order and the top level must run in order too.
 * An item's agenda_number is its printed number, prefixed by its section's marker when it has one
 * ("C.1", "II.A"); `section` is the heading ("Consent Agenda").
 */
function collectSectioned(lines: Line[], from: number, profile: FirmProfile, reasons: string[]): { items: RawItem[]; end: number; boilerplate: boolean } {
  const subRe = profile.sub_item_start ?? DEFAULT_SUB_ITEM;
  const endRes = [...END_MARKERS, ...(profile.extra_boilerplate ?? [])];
  const items: RawItem[] = [];
  let end = lines.length;
  let boilerplate = false;
  let outerKind: MarkerKind | 'none' | undefined;
  let outerPunct: string | undefined;
  let outerNext = 1;
  let section: { name: string; prefix: string; kind?: MarkerKind; punct?: string; next: number } | undefined;
  let sections = 0;
  let cur: RawItem | undefined;
  for (let i = from; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.dropped || HEADER_BOILERPLATE.test(l.text)) continue;
    if (endRes.some((re) => re.test(l.text))) {
      boilerplate = true;
      end = i;
      break;
    }
    const text = l.text;
    if (!text.trim()) continue;
    const m = OUTLINE_MARKER.exec(text);
    const tok = m?.[2];
    const punct = m?.[3];
    const body = m ? text.slice(m[0].length) : text;
    const head = SECTION_HEAD.exec(body);
    // Does this marker continue the top level?
    // Before the first section, a numbered top level ("1." ... "4. CONSENT AGENDA:") counts too.
    const outerOk = (t: string) => {
      if (outerKind === 'none') return false;
      if (outerKind) return t === markerValue(outerKind, outerNext) && punct === outerPunct;
      return startKind(t) !== null && (startKind(t) !== 'digit' || !sections);
    };
    // An unmarked heading must be in capitals ("REGULAR AGENDA:"), not a phrase wrapped onto its own line.
    if (head && (m ? outerOk(tok!) : head[1] === head[1]!.toUpperCase())) {
      if (m) {
        outerKind ??= startKind(tok!)!;
        outerPunct ??= punct;
        outerNext++;
      } else if (!outerKind) outerKind = 'none';
      const name = squash(head[1]!).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      section = { name, prefix: m ? `${tok}.` : '', next: 1 };
      sections++;
      cur = undefined; // the heading's explanation ("The following items are considered routine...") isn't an item
      continue;
    }
    if (m && section) {
      const want = section.kind ? markerValue(section.kind, section.next) : null;
      if (want ? tok === want && punct === section.punct : startKind(tok!) !== null) {
        section.kind ??= startKind(tok!)!;
        section.punct ??= punct;
        section.next++;
        cur = { n: items.length + 1, label: `${section.prefix}${tok}`, lines: [{ text: body, line: l, sub: false }], section: section.name };
        items.push(cur);
        continue;
      }
    }
    if (m && outerOk(tok!)) {
      outerKind ??= startKind(tok!)!;
      outerPunct ??= punct;
      outerNext++;
      section = undefined;
      cur = { n: items.length + 1, label: tok!, lines: [{ text: body, line: l, sub: false }] };
      items.push(cur);
      continue;
    }
    if (m && section?.kind && m[2] && markerValue(section.kind, section.next + 1) === tok) {
      reasons.push(`sectioned: ${section.name} item ${markerValue(section.kind, section.next)} missing`);
    }
    if (cur) cur.lines.push({ text, line: l, sub: subRe.test(text) || !!m });
  }
  if (!sections) reasons.push('sectioned: no CONSENT/REGULAR/ACTION section heading');
  if (items.some((it) => it.lines.length > 40)) reasons.push('sectioned: an item is longer than 40 lines');
  if (items.length) {
    const last = items.at(-1)!;
    const signedBelow = end < lines.length && /^\s*(?:Attorneys?|(?:General\s+)?Counsel)\s+for\b/i.test(lines[end]!.text);
    let popped = 0;
    while (last.lines.length > 1 && looksLikeSignature(last.lines.at(-1)!.text) && (/[;.:]\s*$/.test(last.lines.at(-2)!.text) || (signedBelow && popped < 2))) {
      last.lines.pop();
      popped++;
    }
    // The district's name in capitals heading the next page's boilerplate ("CYPRESS CREEK UTILITY DISTRICT").
    while (last.lines.length > 1 && end < lines.length && /^\s*[A-Z0-9 .,&'’-]+\bDISTRICT\b[A-Z0-9 .,]*$/.test(last.lines.at(-1)!.text)) last.lines.pop();
    if (end === lines.length && /[;.]\s*$/.test(last.lines.at(-1)!.text)) boilerplate = true;
  }
  return { items, end, boilerplate };
}

/** Parse one agenda's text (pages joined with \f). */
export function parseMudAgenda(text: string, profile: FirmProfile = GENERIC, ctx: ParseContext): ParseResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const lines = markFurniture(splitLines(text));

  // The list starts after the intro sentence, or at the first "1." when there's no intro.
  let introLine = findIntro(lines, profile);
  if (introLine < 0) {
    const first = lines.findIndex((l) => !l.dropped && readItemNumber(l.text, 1, profile.item_start, !!ctx.ocr)?.n === 1);
    if (first < 0 && CANCELLED.test(lines.slice(0, 12).map((l) => l.text).join(' '))) {
      // A cancellation notice: no list, just the meeting that won't happen.
      introLine = lines.length - 1;
    } else if (first < 0 || ctx.loose) {
      reasons.push('list intro not found');
      return { ok: false, reasons, items: [], profile: profile.id, warnings };
    } else introLine = first - 1;
  }
  const notice = lines
    .slice(0, introLine + 1)
    .map((l) => l.text)
    .join('\n');

  let { items: raw, end, boilerplate } = collectItems(lines, introLine + 1, profile, !!ctx.loose, reasons, !!ctx.ocr);
  // A list split into CONSENT/REGULAR sections: read it as an outline instead (collectSectioned).
  const listText = lines.slice(introLine + 1).map((l) => l.text);
  // Used when the 1..N reading failed, or found fewer items ("I." read as item 1 of a roman outline).
  if (!ctx.loose && listText.some((t) => SECTION_HEAD.test(t.replace(OUTLINE_MARKER, '')))) {
    const secReasons: string[] = [];
    // A text layer that ran a heading into the previous line ("encroachmentE. REGULAR AGENDA") is split there.
    const secLines = markFurniture(splitLines(text)).flatMap((l) => {
      const at = /[a-z;.](?=(?:[A-Z]|[IVX]{1,4}|\d{1,2})[.)]\s+(?:CONSENT|REGULAR|ACTION)\s+(?:AGENDA|ITEMS)\b)/.exec(l.text);
      return at ? [{ ...l, text: l.text.slice(0, at.index + 1) }, { ...l, text: l.text.slice(at.index + 1) }] : [l];
    });
    const sec = collectSectioned(secLines, introLine + 1, profile, secReasons);
    if (!secReasons.length && sec.items.length && (reasons.length > 0 || sec.items.length > raw.length)) {
      reasons.splice(0, reasons.length);
      ({ items: raw, end, boilerplate } = sec);
    }
  }

  // Confidence rule 1: items 1..N, and no further item numbers after the list ended.
  if (!raw.length) reasons.push('no items');
  if (!ctx.loose) {
    // An item number just past N after the list ended means the boilerplate swallowed part of it.
    const n = raw.some((r) => r.label) ? 99 : raw.length;
    const after = lines.slice(end).find((l) => {
      if (l.dropped) return false;
      const m = /^\s*(\d{1,2})[.)]\s+\S/.exec(l.text);
      return !!m && Number(m[1]) > n && Number(m[1]) <= n + 3;
    });
    if (after && end < lines.length && n) reasons.push(`item ${/\d+/.exec(after.text)![0]} found after the closing boilerplate`);
  }
  // Rule 3: boilerplate recognized and kept out of items.
  if (!boilerplate) reasons.push('closing boilerplate not recognized');

  // Rule 2: the notice date matches the link date within 1 day.
  const notice2 = notice || lines.map((l) => l.text).join('\n');
  const { date: noticeDate, time } = parseNoticeDate(notice2, ctx.link?.date.slice(0, 4));
  if (!noticeDate) reasons.push('meeting date not found in the notice');
  else if (ctx.link) {
    const diff = Math.abs(DateTime.fromISO(noticeDate, { zone: ZONE }).diff(DateTime.fromISO(ctx.link.date, { zone: ZONE }), 'days').days);
    if (diff > 1) reasons.push(`notice date ${noticeDate} is not within 1 day of the link date ${ctx.link.date}`);
  }

  const shaped = raw.map((r) => ({ raw: r, ...shapeItem(r) }));
  shaped.forEach((s) => {
    if (!s.title) reasons.push(`item ${s.raw.label ?? s.raw.n}: empty title`);
  });

  const date = ctx.link?.date ?? noticeDate;
  if (!date) return { ok: false, reasons, items: [], profile: profile.id, warnings };
  const header = lines
    .slice(0, Math.min(lines.length, Math.max(introLine + 1, 8)))
    .map((l) => l.text)
    .join(' ');
  const meeting: Meeting = {
    external_id: sha1(ctx.source_id + date),
    body_id: ctx.body_id,
    date: toChicagoIso(date, time ?? ctx.default_time),
    type: meetingType(notice2, ctx.link),
    status: CANCELLED.test(header) || /cancel+ed|postponed/i.test(safeDecode(ctx.url)) ? 'cancelled' : 'scheduled',
    agenda_url: ctx.url,
  };
  const comment = /^[^\n]*public\s+comments?\b[^\n]*\b\d+[\s-]*minutes?\b[^\n]*$/im.exec(text);
  if (comment) meeting.comment_rules_text = squash(comment[0]).replace(/^\d{1,2}[.)]\s*/, '').replace(/[\s;,]+$/, '');

  const items: Item[] = [];
  const used = new Set<string>();
  for (const s of shaped) {
    if (!s.title) continue;
    const agendaNumber = s.raw.label ?? String(s.raw.n);
    let id = llmItemExternalId(meeting.external_id, agendaNumber, s.title);
    if (used.has(id)) id = `${id}#${s.raw.n}`;
    used.add(id);
    const quote = quoteFor(s.raw, text);
    if (!quote && !ctx.ocr) reasons.push(`item ${s.raw.n}: source_quote not found in the text`);
    const item: Item = {
      external_id: id,
      meeting_external_id: meeting.external_id,
      body_id: ctx.body_id,
      agenda_number: agendaNumber,
      title: s.title,
      ...(s.raw.section ? { section: s.raw.section } : {}),
      ...(s.description ? { description: s.description } : {}),
      status: itemStatus({}, meeting.date, ctx.now),
      amounts: parseAmounts(`${s.title} ${s.description ?? ''}`),
      attachments: [],
      contains_private_person: false,
      source_url: ctx.url,
      ...(quote ? { source_quote: quote } : {}),
      quote_verified: !ctx.ocr && !!quote,
    };
    items.push(redactPersonnel(item));
  }
  if (meeting.status === 'cancelled' && !items.length) {
    // A cancellation notice has no list; accept it as a meeting with no items.
    return { ok: !!noticeDate, reasons: noticeDate ? [] : reasons, meeting, items: [], profile: profile.id, warnings };
  }
  return { ok: reasons.length === 0, reasons, meeting, items, profile: profile.id, warnings };
}
