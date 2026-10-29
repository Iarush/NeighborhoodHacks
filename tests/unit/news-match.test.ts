import { describe, expect, it } from 'vitest';
import type { Item, Meeting, NewsMention } from '@/lib/adapters/types';
import { hasPhrase, isForwardLooking, linkMentions, loadTerms, matchBodies, sortMentions } from '@/lib/news/match';
import type { CatalogBody } from '@/lib/ingest/catalog';
import { districtTerms } from '@/lib/news/districtTerms';

const terms = loadTerms();
const bodies = (t: string) => matchBodies(t, terms).body_ids;

describe('matchBodies', () => {
  it('matches each body alias as a whole word', () => {
    expect(bodies('Harris County Commissioners Court approves budget')).toEqual(['commissioners_court']);
    expect(bodies('HCFCD buys out homes')).toEqual(['flood_control']);
    expect(bodies('Port Houston expands terminal')).toEqual(['port_houston']);
    expect(bodies("Houston ISD's board of managers meets")).toEqual(['hisd_board']);
    expect(bodies('CFISD trustees talk bonds')).toEqual(['cfisd_board']);
    expect(bodies('Lone Star College tuition')).toEqual(['lone_star_board']);
    expect(bodies('HCMUD 489 water rates')).toEqual(['hcmud_489']);
  });
  it('is case-insensitive but whole-word', () => {
    expect(bodies('hisd parents rally')).toEqual(['hisd_board']);
    expect(bodies('PHISDX is not a district')).toEqual([]);
  });
  it('near-miss: Fort Bend County Commissioners Court does not match', () => {
    expect(bodies('Fort Bend County Commissioners Court approves new tax rate')).toEqual([]);
  });
  it('near-miss: Dallas City Council does not match houston_city_council', () => {
    expect(bodies('Dallas City Council approves budget')).toEqual([]);
  });
  it('bare "City Council" needs Houston in the text', () => {
    expect(bodies('City Council delays vote on Houston trash fee')).toEqual(['houston_city_council']);
    expect(matchBodies('Houston City Council votes', terms).matched_terms).toEqual(['Houston City Council', 'City Council']);
  });
  it('hasPhrase allows flexible whitespace', () => {
    expect(hasPhrase('Commissioners\n Court', 'Commissioners Court')).toBe(true);
  });
});

describe('forward_looking', () => {
  it.each([
    'Council will vote on fee',
    'Board set to approve',
    'Proposed tax rate',
    'Court considers plan',
    'District weighs closures',
    'Public hearing on budget',
    'Bond election in November',
    'County could raise fees',
    'HISD plans to close schools',
  ])('cue: %s', (t) => expect(isForwardLooking(t)).toBe(true));
  it.each(['Commissioners approved the contract', 'Board honored teachers'])('no cue: %s', (t) =>
    expect(isForwardLooking(t)).toBe(false),
  );
  it('sorts forward-looking first, then newest', () => {
    const m = (id: string, f: boolean, d: string) => ({ external_id: id, forward_looking: f, published_at: d }) as NewsMention;
    const s = sortMentions([m('a', false, '2026-10-18'), m('b', true, '2026-10-01'), m('c', true, '2026-10-10')]);
    expect(s.map((x) => x.external_id)).toEqual(['c', 'b', 'a']);
  });
});

describe('linkMentions', () => {
  const meeting = { external_id: 'm1', date: '2026-10-27T10:00:00-05:00' } as Meeting;
  const it_ = (id: string, title: string, over: Partial<Item> = {}) =>
    ({ external_id: id, meeting_external_id: 'm1', body_id: 'commissioners_court', title, status: 'upcoming', ...over }) as Item;
  const mention = (headline: string): NewsMention => ({
    external_id: 'n1',
    outlet: 'HPM',
    headline,
    url: 'https://x.org/n1',
    published_at: '2026-10-15T12:00:00Z',
    body_ids: ['commissioners_court'],
    matched_terms: [],
    forward_looking: false,
  });
  const items = [
    it_('i1', 'Approval of an agreement with Flock Safety for license plate reader cameras for the Sheriff'),
    it_('i2', 'Request for approval of the regular board meeting schedule'),
    it_('i3', 'Flock cameras license plate readers (decided)', { status: 'decided' }),
  ];
  it('creates one true link to the best upcoming item', () => {
    const links = linkMentions([mention('Commissioners Court delays action on Flock cameras')], items, [meeting], terms);
    expect(links).toEqual([{ mention_id: 'n1', item_external_id: 'i1', score: expect.any(Number) }]);
    expect(links[0]!.score).toBeGreaterThanOrEqual(0.35);
  });
  it('near-miss: generic overlap ("board meeting") does not link', () => {
    expect(linkMentions([mention('County board meeting draws crowd')], items, [meeting], terms)).toEqual([]);
  });
  it('ignores meetings more than 30 days after publication or before it', () => {
    const late = { ...meeting, date: '2026-12-01T10:00:00-06:00' };
    expect(linkMentions([mention('Delays on Flock cameras')], items, [late], terms)).toEqual([]);
    const early = { ...meeting, date: '2026-10-01T10:00:00-05:00' };
    expect(linkMentions([mention('Delays on Flock cameras')], items, [early], terms)).toEqual([]);
  });
  it('ignores items of other bodies', () => {
    const other = [it_('i9', 'Flock cameras agreement', { body_id: 'hisd_board' })];
    expect(linkMentions([mention('Flock cameras agreement')], other, [meeting], terms)).toEqual([]);
  });
});

describe('matchBodies at rollout scale', () => {
  it('matches a 600-body synthetic catalog well under 1 s', () => {
    const catalog = Array.from({ length: 600 }, (_, i) => ({
      id: i % 5 === 0 ? `isd_${i}` : `mud_${i}`,
      name: i % 5 === 0 ? `District ${i} ISD Board of Trustees` : `${i % 2 ? 'Harris' : 'Fort Bend'} County Municipal Utility District No. ${i}`,
      type: i % 5 === 0 ? 'school_board' : 'mud',
      category: 'tracked',
    })) as unknown as CatalogBody[];
    const big = [...terms, ...districtTerms(catalog, terms)];
    const texts = Array.from({ length: 50 }, (_, i) => `Harris County MUD ${i * 12 + 1} weighs tax rate; District ${i * 5} ISD trustees meet`);
    const t0 = performance.now();
    const hits = texts.map((t) => matchBodies(t, big).body_ids);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(hits[1]).toEqual(['isd_5', 'mud_13']);
    expect(hits[2]).toEqual(['isd_10']); // 25 is a school district here, so no MUD 25
    expect(hits[3]).toEqual(['isd_15', 'mud_37']);
  });
});
