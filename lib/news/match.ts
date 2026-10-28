// D26 body-term matching, forward-looking flag and mention -> item linking (Step 11).
// Deterministic: no LLM calls here. lib/adapters and lib/ingest must never import lib/news.
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { Item, Meeting, NewsMention } from '@/lib/adapters/types';
import { loadBodyCatalog } from '@/lib/ingest/catalog';
import { CENSUS_SCHOOL_NAMES } from '@/lib/ingest/districtCatalog';
import { districtTerms } from './districtTerms';

const AliasSchema = z.union([z.string().min(1), z.object({ term: z.string().min(1), requires: z.string().min(1) })]);
export const BodyTermsSchema = z.object({
  body_id: z.string().min(1),
  aliases: z.array(AliasSchema).min(1),
  exclude_terms: z.array(z.string().min(1)).default([]),
});
export type BodyTerms = z.infer<typeof BodyTermsSchema>;

export function parseTerms(yamlText: string): BodyTerms[] {
  return z.array(BodyTermsSchema).parse(parseYaml(yamlText));
}
/** Hand-written terms, plus pattern terms for the rollout's districts (lib/news/districtTerms.ts). */
export function loadTerms(path = 'data/news_terms.yaml', withDistricts = true): BodyTerms[] {
  const hand = parseTerms(readFileSync(path, 'utf8'));
  return withDistricts ? [...hand, ...districtTerms(loadBodyCatalog(), hand, CENSUS_SCHOOL_NAMES)] : hand;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-insensitive phrase test. "Word" edges are letters/digits, so "CFISD's" matches "CFISD". */
export function hasPhrase(text: string, phrase: string): boolean {
  const body = escapeRe(phrase.trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

export type BodyMatch = { body_ids: string[]; matched_terms: string[] };

/** Match the text (headline + description + categories, in memory only) against every body's aliases. */
export function matchBodies(text: string, terms: BodyTerms[]): BodyMatch {
  const body_ids: string[] = [];
  const matched_terms: string[] = [];
  for (const b of terms) {
    const hits: string[] = [];
    for (const a of b.aliases) {
      const term = typeof a === 'string' ? a : a.term;
      if (!hasPhrase(text, term)) continue;
      if (typeof a !== 'string' && !hasPhrase(text, a.requires)) continue;
      hits.push(term);
    }
    if (hits.length === 0) continue;
    if (b.exclude_terms.some((x) => hasPhrase(text, x))) continue;
    body_ids.push(b.body_id);
    for (const h of hits) if (!matched_terms.includes(h)) matched_terms.push(h);
  }
  return { body_ids, matched_terms };
}

export const FORWARD_CUES = [
  'will vote', 'to vote', 'set to', 'proposed', 'proposes', 'considers', 'considering', 'could',
  'plans to', 'weighs', 'hearing', 'budget', 'bond', 'tax rate', 'election',
];

/** Sort key only: never decides whether a mention is shown. */
export function isForwardLooking(text: string): boolean {
  return FORWARD_CUES.some((c) => hasPhrase(text, c));
}

/** Forward-looking first, then newest. */
export function sortMentions(mentions: NewsMention[]): NewsMention[] {
  return [...mentions].sort(
    (a, b) => Number(b.forward_looking) - Number(a.forward_looking) || b.published_at.localeCompare(a.published_at),
  );
}

// ---- linkMentions (pure; used in Phase 2) ----

const STOPWORDS = new Set(
  ('a an and are as at be by for from has have in into is it its of on or that the this to was were will with ' +
    'after about over under new says said more than amid could would should may might can not no its their they ' +
    'what when where who why how vote votes voting approve approves approved').split(' '),
);
export const GENERIC_TOKENS = new Set(['meeting', 'meetings', 'board', 'county', 'city']);
const LINK_DAYS = 30;
export const LINK_THRESHOLD = 0.35;

export function contentTokens(text: string, drop: Set<string> = new Set()): Set<string> {
  const out = new Set<string>();
  for (const t of text.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u)) {
    if (t.length < 3 || STOPWORDS.has(t) || drop.has(t)) continue;
    out.add(t);
  }
  return out;
}

export type MentionLink = { mention_id: string; item_external_id: string; score: number };

/**
 * For each mention and each `upcoming` item of the same body whose meeting is 0–30 days after
 * `published_at`: score = share of the headline's content tokens found in the item title (stopwords and
 * the body's own alias words ignored). Link at >= 0.35 with at least one shared non-generic token; keep
 * the best item per mention. Links only point from mention to item; items are never changed.
 */
export function linkMentions(
  mentions: NewsMention[],
  items: Item[],
  meetings: Meeting[],
  terms: BodyTerms[],
): MentionLink[] {
  const meetingDate = new Map(meetings.map((m) => [m.external_id, Date.parse(m.date)]));
  const aliasTokens = new Map(
    terms.map((t) => [t.body_id, contentTokens(t.aliases.map((a) => (typeof a === 'string' ? a : a.term)).join(' '))]),
  );
  const links: MentionLink[] = [];
  for (const m of mentions) {
    const pub = Date.parse(m.published_at);
    let best: MentionLink | undefined;
    for (const it of items) {
      if (it.status !== 'upcoming' || !m.body_ids.includes(it.body_id)) continue;
      const when = meetingDate.get(it.meeting_external_id);
      if (when === undefined || Number.isNaN(pub) || when < pub || when - pub > LINK_DAYS * 86_400_000) continue;
      const drop = aliasTokens.get(it.body_id) ?? new Set<string>();
      const h = contentTokens(m.headline, drop);
      const t = contentTokens(it.title, drop);
      if (h.size === 0) continue;
      const shared = [...h].filter((x) => t.has(x));
      if (!shared.some((x) => !GENERIC_TOKENS.has(x))) continue;
      const score = shared.length / h.size;
      if (score < LINK_THRESHOLD) continue;
      if (!best || score > best.score) best = { mention_id: m.external_id, item_external_id: it.external_id, score };
    }
    if (best) links.push(best);
  }
  return links;
}
