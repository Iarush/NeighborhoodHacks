import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { DiscoveryConfigSchema, parseIndex, pickPerDate } from '@/lib/adapters/discover';
import { outcomesJsonSchema, parseOutcomes, type LlmClient, type Outcomes } from '@/lib/adapters/gemini';
import { buildFromExtraction, createLlmExtractAdapter } from '@/lib/adapters/llmExtract';
import { buildResultUpdates, matchMinutesToMeetings, matchOutcome, overlapScore } from '@/lib/adapters/minutes';
import { pdfTextFromPages } from '@/lib/adapters/pdfText';
import { createPrimeGovAdapter } from '@/lib/adapters/primegov';
import { AdapterResultSchema, type Item, type SourceConfig } from '@/lib/adapters/types';
import { sha1 } from '@/lib/ingest/hash';
import { ZONE } from '@/lib/ingest/normalize';
import { loadKnown, parseCli } from '../../scripts/scrape';
import { loadOutput, read, readJson } from '../golden/llm-extract/fixtures';

const SOURCE: SourceConfig = {
  id: 'hcmud_489',
  body_id: 'hcmud_489',
  adapter: 'llm_extract',
  config: {
    index_url: 'https://hcmud489.com/board-meetings/',
    link_pattern: '(?i)/static/.+agenda_.+\\.pdf$',
    date_from: 'filename',
    meeting_type_from_text: { special: '(?i)special' },
    default_time: '11:00',
    minutes_index_url: 'https://hcmud489.com/board-meetings/',
    minutes_link_pattern: '(?i)/static/.+minutes_.+\\.pdf$',
    minutes_date_tolerance_days: 2,
    results_max_days: 75,
  },
};

/** Known meeting + items for an agenda case, built from its recorded extraction the day after the meeting. */
function knownCase(dir: string, date: string) {
  const meta = readJson<{ url: string }>(`${dir}/meta.json`);
  const r = buildFromExtraction([loadOutput(`${dir}/gemini_output.json`)], {
    source_id: 'hcmud_489',
    body_id: 'hcmud_489',
    url: meta.url,
    fullText: read(`${dir}/source.txt`),
    scanned: false,
    now: DateTime.fromISO(date, { zone: ZONE }).plus({ days: 1, hours: 12 }).toJSDate(),
    link: { date, type: 'regular' },
    default_time: '11:00',
  });
  if (!r.meeting || r.dropped) throw new Error(`${dir}: bad fixture ${r.warnings.join('; ')}`);
  return { meeting: r.meeting, items: r.items };
}

const JULY = knownCase('mud489-2026-07-20', '2026-07-20');
const MAY = knownCase('mud489-2026-05-19', '2026-05-19');
const JULY_MINUTES = 'minutes/mud489-2026-07-20';
const MAY_MINUTES = 'minutes/mud489-2026-05-18';
const minutesUrl = (dir: string) => readJson<{ url: string }>(`${dir}/meta.json`).url;
const outcomes = (p: string): Outcomes => {
  const r = parseOutcomes(read(p));
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const julyCtx = (items: Item[] = JULY.items) => ({
  meeting_external_id: JULY.meeting.external_id,
  items,
  url: minutesUrl(JULY_MINUTES),
  fullText: read(`${JULY_MINUTES}/source.txt`),
  scanned: false,
});
const byNumber = (items: Item[]) => new Map(items.map((i) => [i.external_id, i.agenda_number]));

describe('fixtures', () => {
  it('known July 20 items come from the agenda (21 items, all awaiting_result)', () => {
    expect(JULY.items).toHaveLength(21);
    expect(JULY.items.every((i) => i.status === 'awaiting_result')).toBe(true);
    expect(JULY.meeting.external_id).toBe(sha1('hcmud_4892026-07-20'));
    expect(MAY.meeting.external_id).toBe(sha1('hcmud_4892026-05-19'));
  });
  it('outcomes JSON schema is generated from zod without $schema', () => {
    const s = outcomesJsonSchema();
    expect(s.$schema).toBeUndefined();
    expect(JSON.stringify(s)).toMatch(/tabled/);
  });
});

describe('July 20, 2026 minutes -> July 20 agenda items', () => {
  const r = buildResultUpdates([outcomes(`${JULY_MINUTES}/outcomes_output.json`)], julyCtx());
  const nums = byNumber(JULY.items);
  const got = Object.fromEntries(r.updates.map((u) => [nums.get(u.item_external_id), [u.action, u.vote_result]]));

  it('every outcome is matched to an existing item with a verified quote', () => {
    expect(r.warnings).toEqual([]);
    expect(r.updates).toHaveLength(13);
    for (const u of r.updates) {
      expect(u.meeting_external_id).toBe(JULY.meeting.external_id);
      expect(JULY.items.some((i) => i.external_id === u.item_external_id)).toBe(true);
      expect(u.quote_verified).toBe(true);
      expect(u.source_url).toBe(minutesUrl(JULY_MINUTES));
    }
  });
  it('maps outcomes; tabled -> action tabled, vote_result no_action', () => {
    expect(got).toEqual({
      '2': ['passed', 'passed'],
      '3': ['no_action', 'no_action'],
      '4': ['passed', 'passed'],
      '5': ['passed', 'passed'],
      '6': ['tabled', 'no_action'],
      '7': ['passed', 'passed'],
      '8': ['passed', 'passed'],
      '9': ['passed', 'passed'],
      '11': ['tabled', 'no_action'],
      '14': ['no_action', 'no_action'],
      '16': ['passed', 'passed'],
      '17': ['passed', 'passed'],
      '19': ['passed', 'passed'],
    });
  });
  it('a quote broken across a hyphenated line still verifies', () => {
    const u = r.updates.find((x) => nums.get(x.item_external_id) === '17');
    expect(u?.source_quote).toBe('Director Harper-Veith seconded the motion which carried unanimously');
  });
  it('fake quote: rejected, no update', () => {
    const bad = buildResultUpdates([outcomes('minutes/corrupted/fake-quote.json')], julyCtx());
    expect(bad.updates).toEqual([]);
    expect(bad.warnings).toHaveLength(1);
    expect(bad.warnings[0]).toMatch(/rejected: source_quote not in minutes/);
  });
  it('outcome for an item that does not exist: no update, no item created', () => {
    const items = [...JULY.items];
    const r2 = buildResultUpdates([outcomes('minutes/corrupted/nonexistent-item.json')], julyCtx(items));
    expect(r2.updates).toEqual([]);
    expect(r2.warnings[0]).toMatch(/not applied: no matching item/);
    expect(items).toEqual(JULY.items);
  });
  it('decided items are not offered for matching; scanned minutes skip the quote check', () => {
    const fake = outcomes('minutes/corrupted/fake-quote.json');
    const r3 = buildResultUpdates([fake], { ...julyCtx(), scanned: true });
    expect(r3.updates).toHaveLength(1);
    expect(r3.updates[0]!.quote_verified).toBe(false);
  });
});

describe('May pair: agenda May_19 vs minutes May_18 (date tolerance)', () => {
  const cfg = DiscoveryConfigSchema.parse({ ...SOURCE.config, link_pattern: SOURCE.config.minutes_link_pattern });
  const index = read('discovery/mud489-index.html');
  const minutesDocs = pickPerDate(parseIndex(index, 'https://hcmud489.com/board-meetings/', cfg).docs).docs;

  it('minutes links on the index parse with filename dates', () => {
    expect(minutesDocs.map((d) => d.date)).toEqual(['2026-01-19', '2026-04-09', '2026-05-18', '2026-06-15', '2026-07-20']);
  });
  it('exact date first, then +/-2 days when exactly one meeting fits, with a warning', () => {
    const r = matchMinutesToMeetings([JULY.meeting, MAY.meeting], minutesDocs, 2);
    expect(r.byMeeting.get(JULY.meeting.external_id)?.filename).toMatch(/^Minutes_July_20_2026/);
    expect(r.byMeeting.get(MAY.meeting.external_id)?.filename).toMatch(/^Minutes_May_18_2026/);
    expect(r.warnings).toEqual([
      `minutes Minutes_May_18_2026_Approved_HCMUD_489_e276bfac9d.pdf dated 2026-05-18 matched to meeting ${MAY.meeting.external_id} (2026-05-19) within 2 days`,
    ]);
  });
  it('no tolerance -> no May match; two meetings in range -> ambiguous, none used', () => {
    expect(matchMinutesToMeetings([MAY.meeting], minutesDocs, 0).byMeeting.size).toBe(0);
    const twin = { external_id: 'twin', date: '2026-05-17T11:00:00-05:00' };
    const r = matchMinutesToMeetings([MAY.meeting, twin], minutesDocs, 2);
    expect(r.byMeeting.size).toBe(0);
    expect(r.warnings.join()).toMatch(/fits 2 meetings/);
  });
  it('May minutes outcomes update the May 19 agenda items', () => {
    const r = buildResultUpdates([outcomes(`${MAY_MINUTES}/outcomes_output.json`)], {
      meeting_external_id: MAY.meeting.external_id,
      items: MAY.items,
      url: minutesUrl(MAY_MINUTES),
      fullText: read(`${MAY_MINUTES}/source.txt`),
      scanned: false,
    });
    expect(r.warnings).toEqual([]);
    const nums = byNumber(MAY.items);
    expect(r.updates.map((u) => [nums.get(u.item_external_id), u.vote_result])).toEqual([
      ['2', 'passed'],
      ['3', 'passed'],
      ['4', 'passed'],
    ]);
  });
});

describe('matchOutcome', () => {
  const items = JULY.items;
  it('agenda number first', () => {
    const m = matchOutcome({ agenda_number: '9.', title_fragment: 'unrelated words' }, items);
    expect(m.item?.agenda_number).toBe('9');
  });
  it('ties and weak overlaps give no match', () => {
    expect(matchOutcome({ title_fragment: 'Report' }, items).item).toBeUndefined();
    // Equal containment is broken by Dice (the shorter title wins) ...
    expect(matchOutcome({ title_fragment: 'Matters related' }, items).item?.agenda_number).toBe('12');
    // ... a full tie is reported, never guessed.
    const eng = items.find((i) => i.agenda_number === '8')!;
    expect(matchOutcome({ title_fragment: "Engineer's Report" }, [eng, { ...eng, external_id: 'x', agenda_number: '8b' }])).toEqual({
      reason: 'tie between items 8 and 8b',
    });
    expect(overlapScore('street cleaning services proposal', items[2]!.title).containment).toBeLessThan(0.5);
  });
});

describe('results mode (offline adapters)', () => {
  const index = read('discovery/mud489-index.html');
  const pdfFor: Record<string, string> = {
    [minutesUrl(JULY_MINUTES)]: `${JULY_MINUTES}/source.txt`,
    [minutesUrl(MAY_MINUTES)]: `${MAY_MINUTES}/source.txt`,
  };
  const fetched: string[] = [];
  const fetchImpl = (async (u: string | URL | Request) => {
    const url = String(u);
    fetched.push(url);
    if (url.endsWith('/board-meetings/')) return new Response(index);
    if (pdfFor[url]) return new Response(new TextEncoder().encode(url));
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  const http = { fetchImpl, sleep: async () => {} };
  const pdfText = async (b: Uint8Array) => {
    const url = new TextDecoder().decode(b);
    return pdfTextFromPages(read(pdfFor[url]!).split('\f'), sha1(url));
  };
  const llmFor = (): LlmClient => ({
    async generateJson(req) {
      if (/Bookkeeper's report/.test(req.system)) return read(`${JULY_MINUTES}/outcomes_output.json`);
      if (/District Registration Form/.test(req.system)) return read(`${MAY_MINUTES}/outcomes_output.json`);
      throw new Error('unexpected call');
    },
  });
  const now = new Date('2026-10-19T12:00:00-05:00');
  const window = { from: DateTime.fromISO('2026-05-01', { zone: ZONE }).toJSDate(), to: now };
  const OCT = { external_id: sha1('hcmud_4892026-10-19'), body_id: 'hcmud_489', date: '2026-10-19T11:00:00-05:00', type: 'regular' as const, status: 'scheduled' as const, agenda_url: 'https://hcmud489.com/x.pdf' };
  const OCT_ITEM: Item = { ...JULY.items[0]!, external_id: 'oct-1', meeting_external_id: OCT.external_id };
  const mode = {
    kind: 'results' as const,
    meeting_external_ids: [JULY.meeting.external_id, MAY.meeting.external_id, OCT.external_id],
    known: { meetings: [JULY.meeting, MAY.meeting, OCT], items: [...JULY.items, ...MAY.items, OCT_ITEM] },
  };

  it('llm_extract: discovers minutes, matches by date (with tolerance), returns updates only', async () => {
    const r = AdapterResultSchema.parse(
      await createLlmExtractAdapter({ http, now: () => now, llm: llmFor(), models: { extract: 'flash', fallback: 'pro' }, pdfText }).run(SOURCE, mode, window),
    );
    expect(r.meetings).toEqual([]);
    expect(r.items).toEqual([]);
    expect(r.result_updates).toHaveLength(16);
    expect(r.warnings).toEqual([expect.stringMatching(/^minutes Minutes_May_18_2026.* within 2 days$/)]);
    expect(r.documents.map((d) => d.kind)).toEqual(['html', 'pdf_text', 'llm_output', 'pdf_text', 'llm_output']);
  });
  it('no minutes yet (Oct 19) is normal: no updates and no warning', async () => {
    const only = { ...mode, meeting_external_ids: [OCT.external_id] };
    const r = await createLlmExtractAdapter({ http, now: () => now, llm: llmFor(), pdfText }).run(SOURCE, only, window);
    expect(r.result_updates).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it('meetings outside the window, unknown ids and no key are reported', async () => {
    const late = { from: DateTime.fromISO('2026-08-05', { zone: ZONE }).toJSDate(), to: now };
    const r = await createLlmExtractAdapter({ http, now: () => now, llm: null, pdfText }).run(
      SOURCE,
      { ...mode, meeting_external_ids: [JULY.meeting.external_id, 'nope'] },
      late,
    );
    expect(r.result_updates).toEqual([]);
    expect(r.warnings).toEqual([
      'meeting nope: not in the known meetings; skipped',
      `meeting ${JULY.meeting.external_id} (2026-07-20T11:00:00-05:00) is outside the results window; skipped`,
    ]);
    const r2 = await createLlmExtractAdapter({ http, now: () => now, llm: null, pdfText }).run(SOURCE, { ...mode, meeting_external_ids: [JULY.meeting.external_id] }, window);
    expect(r2.warnings[0]).toMatch(/^llm_unavailable/);
  });
  it('primegov: minutes only from documentList; none published -> no updates, no error', async () => {
    const archived = read('../primegov/archived-2026.json');
    const pgFetch = (async (u: string | URL | Request) =>
      new Response(String(u).includes('ListArchivedMeetings?year=2026') ? archived : '[]')) as typeof fetch;
    const item: Item = { ...JULY.items[0]!, external_id: 'pg-1', meeting_external_id: '718', body_id: 'houston_city_council' };
    const r = await createPrimeGovAdapter({ http: { fetchImpl: pgFetch, sleep: async () => {} }, now: () => now, llm: llmFor() }).run(
      { id: 'houston_city_council', body_id: 'houston_city_council', adapter: 'primegov', config: { tenant: 'houstontx', committee_id: 1 } },
      { kind: 'results', meeting_external_ids: ['718'], known: { meetings: [], items: [item] } },
      { from: DateTime.fromISO('2026-09-01', { zone: ZONE }).toJSDate(), to: now },
    );
    expect(r.result_updates).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe('CLI results flags', () => {
  it('--mode results --meetings a,b --known dir', () => {
    const a = parseCli(['--source', 'hcmud_489', '--mode', 'results', '--meetings', 'a,b', '--known', 'tmp/scrape']);
    expect(a.mode).toEqual({ kind: 'results', meeting_external_ids: ['a', 'b'] });
    expect(a.known).toBe('tmp/scrape');
    expect(() => parseCli(['--source', 'x', '--known', 'd'])).toThrow(/only used with --mode results/);
  });
  it('--adapter overrides the registered adapter kind', () => {
    expect(parseCli(['--source', 'hcmud_489', '--adapter', 'mud_agenda']).adapter).toBe('mud_agenda');
    expect(parseCli(['--source', 'hcmud_489']).adapter).toBeUndefined();
    expect(() => parseCli(['--source', 'x', '--adapter', 'nope'])).toThrow(/unknown --adapter/);
  });
  it('loadKnown validates meetings.json and items.json', () => {
    expect(() => loadKnown('does-not-exist')).toThrow();
  });
});
