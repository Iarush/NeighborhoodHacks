import type { Item, ResultUpdate } from '../types';
import { quoteVerified } from '../llmExtract';
import { overlapScore, tokens, MATCH_THRESHOLD } from '../minutes';
import { redactText } from '@/lib/ingest/redact';

// Minutes -> outcomes without the LLM (mud-code-parser-spec §6). MUD minutes are narrative
// sections under ALL-CAPS headings ("ENGINEER'S REPORT"), usually in agenda order. Each section
// is matched to a KNOWN item (an "agenda item N" reference, then heading/title token overlap,
// then the section's opening against the item title), and its outcome comes from fixed phrases.
// The quote is the sentence holding the phrase, verbatim. Minutes never create items, and no
// field but the admin-only source_quote can hold a director's name.

export type MinutesOutcome = 'passed' | 'failed' | 'tabled' | 'no_action';

export type MinutesSection = {
  heading: string;
  /** Section text after the heading, exactly as in the minutes. */
  body: string;
};

/** Leading doc-management IDs and page numbers glued to a heading ("944689vlMATTERS", "-2-CAPITAL"). */
const GLUED_PREFIX = /^(?:\s*(?:\d{4}-\d{4}\s*-\s*\d{4}[.,]?\s*v\s*\.\s*\d+|\d{5,7}v[l1I]|-\s*\d+\s*-|\d{1,2}\.)\s*)+/;

/** A heading line: mostly capitals, a few words, no sentence punctuation at the end. */
export function headingText(line: string): string | null {
  const t = line.replace(GLUED_PREFIX, '').trim();
  if (t.length < 4 || t.length > 120) return null;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return null;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  if (upper / letters.length < 0.85) return null;
  if (/[.;]$/.test(t) && !/\b(?:INC|NO|CO)\.$/.test(t)) return null;
  if (/^\(?(?:SEAL|SELLO)\)?$|^ATTEST:?$/i.test(t)) return null;
  return t;
}

/** Split minutes into heading sections. Text before the first heading is dropped (roll call). */
export function splitMinutes(text: string): MinutesSection[] {
  const lines = text.split(/\n|\f/);
  const sections: { heading: string[]; body: string[] }[] = [];
  let inHeading = false;
  for (const line of lines) {
    const h = headingText(line);
    if (h) {
      if (inHeading && sections.length) sections.at(-1)!.heading.push(h);
      else sections.push({ heading: [h], body: [] });
      inHeading = true;
      continue;
    }
    inHeading = false;
    sections.at(-1)?.body.push(line);
  }
  return sections.map((s) => ({ heading: s.heading.join(' '), body: s.body.join('\n') }));
}

/** Build a case-insensitive regex where every space matches any run of whitespace (minutes wrap lines). */
const rx = (...alts: string[]) => new RegExp(alts.join('|').replace(/ /g, String.raw`\s+`), 'i');

const PATTERNS: { outcome: MinutesOutcome; re: RegExp; needsMotion?: boolean }[] = [
  { outcome: 'failed', re: rx(String.raw`\bmotion (?:failed|did not pass|was denied|died)\b`, String.raw`\bdid not pass\b`, String.raw`\bfailed (?:for lack of a second|to pass)\b`) },
  { outcome: 'tabled', re: rx(String.raw`\b(?:tabled|deferred|postponed)\b`) },
  {
    outcome: 'no_action',
    re: rx(String.raw`\bno action (?:was |is |will be )?(?:taken|required|necessary|needed)\b`, String.raw`\btook no action\b`, String.raw`\bdeclined to take (?:any )?action\b`),
  },
  {
    outcome: 'passed',
    re: rx(
      String.raw`\b(?:unanimously carried|carried unanimously|passed unanimously)\b`,
      String.raw`\b(?:which|motion|and) (?:passed|carried)\b`,
      String.raw`\bvoted (?:unanimously |\d+ to \d+ )?to (?:\(\d\) )?(?:approve|adopt|authorize|accept|ratify|award)`,
      String.raw`\bthe Board (?:approved|adopted|authorized|ratified|accepted|awarded)\b`,
      String.raw`\bvoting aye\b`,
    ),
  },
  // "that X be approved" is a vote only inside a motion sentence, not in "recommended that X be awarded".
  { outcome: 'passed', re: rx(String.raw`\b(?:be|was|were) (?:hereby )?(?:approved|adopted|authorized|ratified|accepted|awarded)\b`), needsMotion: true },
];

const MOTION = rx(String.raw`\b(?:moved|motion|seconded|carried|voted)\b`);

const ABBREV = /\b(?:Mr|Ms|Mrs|Dr|No|Nos|Inc|Co|Corp|Ltd|St|Jr|Sr|Asst|Ave|Blvd|vs|etc|P\.E|L\.L\.P|L\.P|U\.S|V\.T\.C\.A|(?<!(?:Exhibit|Appendix|Schedule|Attachment|Section|Item|Phase) )[A-Z])\.$/;

/** Sentence end offsets in `body` (after the period), skipping abbreviations like "Mr." and "No.". */
function sentenceEnds(body: string): number[] {
  const ends: number[] = [];
  const re = /\.(?=\s+[A-Z("“])/g;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (!ABBREV.test(body.slice(Math.max(0, m.index - 12), m.index + 1))) ends.push(m.index + 1);
  }
  return ends;
}

/** Page numbers and doc-management IDs left at a section's end ("- 3 -", "944689vl"). */
const TRAILING_FURNITURE = /(?:\s+(?:-\s*\d+\s*-|\d{5,7}v[l1I]|\d{4}-\d{4}\s*-\s*\d{4}[.,]?\s*v\s*\.\s*\d+|\d{1,2}\.?))+\s*$/;

const WHAT = /\b(?:approv|adopt|authoriz|accept|ratif|award)/i;

/**
 * The sentence around [from, to). "Director X seconded the motion, which passed unanimously." says
 * nothing about what passed, so a passing sentence without the verb takes the sentence before it too.
 */
function sentenceAround(body: string, ends: number[], from: number, to: number, withMotion = false): string {
  const before = ends.filter((e) => e <= from);
  let start = Math.max(0, ...before);
  const end = ends.find((e) => e >= to) ?? body.length;
  if (withMotion && before.length && !WHAT.test(body.slice(start, end))) start = Math.max(0, ...before.slice(0, -1));
  return body.slice(start, end).replace(TRAILING_FURNITURE, '').trim();
}

/**
 * Which outcome a section reports when it holds several: any passing vote means the item's action
 * was taken ("approved the report ... declined the customer's request"), then failed, tabled, no action.
 */
export const OUTCOME_RANK: Record<MinutesOutcome, number> = { passed: 3, failed: 2, tabled: 1, no_action: 0 };

/** The outcome a section records, and the sentence that says so: the highest-ranked kind, its first phrase. */
export function sectionOutcome(body: string): { outcome: MinutesOutcome; quote: string } | null {
  const ends = sentenceEnds(body);
  let best: { outcome: MinutesOutcome; index: number; end: number } | null = null;
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, 'gi');
    for (let m = re.exec(body); m; m = re.exec(body)) {
      if (p.needsMotion && !MOTION.test(sentenceAround(body, ends, m.index, m.index + m[0].length))) continue;
      const better = !best || OUTCOME_RANK[p.outcome] > OUTCOME_RANK[best.outcome] || (p.outcome === best.outcome && m.index < best.index);
      if (better) best = { outcome: p.outcome, index: m.index, end: m.index + m[0].length };
      break;
    }
  }
  return best ? { outcome: best.outcome, quote: sentenceAround(body, ends, best.index, best.end, best.outcome === 'passed') } : null;
}

/** Procedural sections that hold motions but no agenda item. */
const PROCEDURAL = /\b(?:ADJOURN|CALL(?:ED)? TO ORDER|ROLL CALL|RECONVENE|EXECUTIVE SESSION|CLOSED SESSION)/i;

/** The opening (title, roll call, who attended): not an agenda item. */
const PREAMBLE = /\broll (?:was )?called\b|\bmet in (?:regular|special) session\b|\bconstituting a quorum\b/i;

const ITEM_REF = /\b(?:agenda )?item (?:no\.\s*)?(\d{1,2})\b/i;

export type MinutesContext = {
  meeting_external_id: string;
  /** Minutes URL (source_url of every update). */
  url: string;
  /** True for OCR text: quotes stay unverified and every update goes to review (D6). */
  ocr?: boolean;
  /** The stored document text the quote check runs against (default: `text`). */
  fullText?: string;
};

export type MinutesParse = {
  updates: ResultUpdate[];
  warnings: string[];
  /** Sections that record an outcome (procedural ones excluded), and how many items got an update. */
  voted: number;
  matched: number;
  /** Every non-procedural section: the item it matched (if any) and the outcome it records (if any). */
  sections: { heading: string; agenda_number?: string; outcome?: MinutesOutcome }[];
  /** True when the text couldn't be split (readingOrderBroken): try the next rung. */
  unreadable?: boolean;
};

type Candidate = { item: Item; index: number; score: number; dice: number };

const score = (c: { item: Item; index: number }, fragment: string, text: string): Candidate => {
  const o = overlapScore(fragment, text);
  return { ...c, score: o.containment, dice: o.dice };
};

const logText = (s: string) => JSON.stringify(redactText(s).text.slice(0, 80));

/**
 * A text layer read in column order (one word per line, as in the MUD 489 May minutes) can't be
 * split into sections safely. The next rung (rebuilt text, then OCR) gets it instead.
 */
export function readingOrderBroken(text: string): boolean {
  const lines = text.split(/\n|\f/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 20) return false;
  const single = lines.filter((l) => !/\s/.test(l)).length;
  return single / lines.length > 0.2;
}

/** Match minutes sections to known items and read their outcomes. Pure: no I/O. */
export function parseMudMinutes(text: string, knownItems: Item[], ctx: MinutesContext): MinutesParse {
  const out: MinutesParse = { updates: [], warnings: [], voted: 0, matched: 0, sections: [] };
  if (readingOrderBroken(text)) {
    out.warnings.push(`minutes_unreadable: ${ctx.url}: text layer is out of reading order; no outcomes read`);
    out.unreadable = true;
    return out;
  }
  const items = knownItems.slice();
  const used = new Set<string>();
  let last = -1;

  let parent: Candidate | null = null;
  const byItem = new Map<string, ResultUpdate>();
  for (const s of splitMinutes(text)) {
    if (PROCEDURAL.test(s.heading) || PREAMBLE.test(s.body)) continue;
    const result = sectionOutcome(s.body);
    if (result) out.voted++;
    const label = `${ctx.url}: minutes section ${logText(s.heading)}`;

    const open = items.map((item, index) => ({ item, index })).filter((c) => !used.has(c.item.external_id));
    const ref = ITEM_REF.exec(`${s.heading} ${s.body.slice(0, 300)}`);
    const opening = s.body.slice(0, 400);
    // Tiers, strongest first. Each keeps agenda order: an item before the previous match needs a strong score.
    const tiers: (() => Candidate[])[] = [
      () => (ref ? open.filter((c) => (c.item.agenda_number ?? '').replace(/\D/g, '') === ref[1]).map((c) => ({ ...c, score: 1, dice: 1 })) : []),
      () => open.map((c) => score(c, s.heading, c.item.title)).filter((c) => c.score >= MATCH_THRESHOLD),
      // The heading names a sub-item ("CONSIDER SETTING TAX RATE" under "Financial Advisor's Report").
      () =>
        tokens(s.heading).size < 2
          ? []
          : open.map((c) => score(c, s.heading, `${c.item.title} ${c.item.description ?? ''}`)).filter((c) => c.score >= 0.75),
      // The heading names the item differently ("PEACE OFFICER'S REPORT" for "Security Report ..."):
      // most of the title's words must appear in the section's opening.
      () =>
        open
          .filter((c) => tokens(c.item.title).size >= 2)
          .map((c) => score(c, c.item.title, opening))
          .filter((c) => c.score >= 0.6),
    ];
    let cands: Candidate[] = [];
    for (const tier of tiers) {
      const all = tier();
      // A lone candidate may go backwards too: nothing else fits, so order adds no safety.
      cands = all.filter((c) => c.index > last || c.score >= 0.8 || all.length === 1).sort((x, y) => y.score - x.score || y.dice - x.dice);
      if (cands.length) break;
    }

    // A sub-heading under the item just matched ("LINNFIELD DETENTION POND REHABILITATION" under
    // "Engineering matters, including ...") belongs to that item when its words are in the item's text.
    if (cands.length === 0 && parent && overlapScore(s.heading, `${parent.item.title} ${parent.item.description ?? ''}`).containment >= MATCH_THRESHOLD) {
      cands = [parent];
    }
    if (cands.length === 0) {
      out.sections.push({ heading: s.heading, outcome: result?.outcome });
      if (result) out.warnings.push(`${label}: ${result.outcome} not applied: no matching item`);
      continue;
    }
    const [best, second] = cands;
    if (second && second.score === best!.score && second.dice === best!.dice) {
      out.sections.push({ heading: s.heading, outcome: result?.outcome });
      if (result) {
        out.warnings.push(`${label}: ${result.outcome} not applied: matches items ${best!.item.agenda_number ?? '?'} and ${second.item.agenda_number ?? '?'}`);
      }
      continue;
    }
    out.sections.push({ heading: s.heading, agenda_number: best!.item.agenda_number, outcome: result?.outcome });
    used.add(best!.item.external_id);
    last = Math.max(last, best!.index);
    parent = best!;
    if (!result) continue; // a report or "nothing new": the item stays awaiting_result
    if (best!.item.status === 'decided') continue;
    // Sub-sections of one item: the highest-ranked outcome wins, the first of equals.
    const prior = byItem.get(best!.item.external_id);
    if (prior && OUTCOME_RANK[result.outcome] <= OUTCOME_RANK[prior.action as MinutesOutcome]) continue;

    const verified = !ctx.ocr && quoteVerified(result.quote, ctx.fullText ?? text);
    if (!ctx.ocr && !verified) {
      out.warnings.push(`${label}: rejected: source_quote not in minutes: ${logText(result.quote)}`);
      continue;
    }
    const update: ResultUpdate = {
      meeting_external_id: ctx.meeting_external_id,
      item_external_id: best!.item.external_id,
      action: result.outcome,
      vote_result: result.outcome === 'tabled' ? 'no_action' : result.outcome,
      source_url: ctx.url,
      source_quote: redactText(result.quote).text,
      quote_verified: verified,
    };
    if (prior) out.updates[out.updates.indexOf(prior)] = update;
    else out.updates.push(update);
    byItem.set(best!.item.external_id, update);
  }
  out.matched = out.updates.length;
  // §6 rule 7: rung 5 (the LLM under the shared cap, Phase 5) is for minutes where code matched
  // fewer than half of the meeting's voted items. Sections for items we don't know (a partial item
  // list) can't count against the code, so the base is at most the number of open known items.
  const base = Math.min(out.voted, knownItems.filter((i) => i.status !== 'decided').length);
  if (base > 0 && out.matched * 2 < base) {
    out.warnings.push(`minutes_low_match: ${ctx.url}: code matched ${out.matched} of ${base} voted items (LLM rung not wired yet)`);
  }
  return out;
}
