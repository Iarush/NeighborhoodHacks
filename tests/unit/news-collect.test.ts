import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  collectNews,
  loadFeeds,
  mentionsFromFeed,
  mergeMentions,
  normalizeUrl,
  parseFeed,
  parseFeeds,
  type FeedConfig,
  type FeedItem,
} from '@/lib/news/collect';
import { loadTerms, type BodyTerms } from '@/lib/news/match';

const NOW = new Date('2026-10-19T12:00:00Z');
const fx = (name: string) => readFileSync(`tests/golden/news/feeds/${name}.xml`, 'utf8');
const BASE_FEED = parseFeeds(`- { outlet: Test, url: "https://example.org/feed" }`)[0]!;
const feed = (over: Partial<FeedConfig> = {}): FeedConfig => ({ ...BASE_FEED, ...over });
const item = (title: string, over: Partial<FeedItem> = {}): FeedItem => ({
  title,
  link: `https://example.org/news/${encodeURIComponent(title)}`,
  published_at: '2026-10-18T12:00:00.000Z',
  description: '',
  categories: [],
  ...over,
});

describe('news feeds config', () => {
  it('loads data/news_feeds.yaml with v1.3 defaults', () => {
    const feeds = loadFeeds();
    expect(feeds.map((f) => f.outlet)).toEqual(
      expect.arrayContaining(['Houston Public Media', 'Community Impact', 'KHOU 11', 'KPRC 2', 'ABC13', 'FOX 26 Houston']),
    );
    const hpm = feeds.find((f) => f.outlet === 'Houston Public Media')!;
    expect(hpm.opinion_path_patterns).toContain('/opinion');
    expect(hpm.explainer_patterns).toContain('(?i)what to know');
    expect(feeds.find((f) => f.outlet === 'Houston Landing')!.enabled).toBe(false);
  });
});

describe('parseFeed', () => {
  it('parses the recorded Houston Public Media feed', () => {
    const items = parseFeed(fx('houston-public-media'));
    expect(items).toHaveLength(40);
    for (const i of items) {
      expect(i.title).not.toBe('');
      expect(i.link).toMatch(/^https:\/\/www\.houstonpublicmedia\.org\//);
      expect(Number.isNaN(Date.parse(i.published_at))).toBe(false);
    }
    expect(items[0]!.categories).toContain('Engines Podcast');
  });
  it('parses the recorded Community Impact feed', () => {
    const items = parseFeed(fx('community-impact'));
    expect(items).toHaveLength(50);
    expect(items.some((i) => i.link.includes('/richardson/'))).toBe(true);
  });
  it('parses all four TV feeds', () => {
    for (const n of ['khou-11', 'kprc-2', 'abc13', 'fox-26-houston']) expect(parseFeed(fx(n)).length).toBeGreaterThan(10);
  });
});

describe('mentionsFromFeed', () => {
  const electionTerms: BodyTerms[] = [{ body_id: 'test_body', aliases: ['Election'], exclude_terms: [] }];
  it('Community Impact path filter drops Dallas/Austin editions', () => {
    const ci = loadFeeds().find((f) => f.outlet === 'Community Impact')!;
    const items = parseFeed(fx('community-impact'));
    const kept = mentionsFromFeed(ci, items, electionTerms, NOW).map((m) => m.mention.url);
    expect(kept.length).toBeGreaterThan(0);
    for (const u of kept) expect(ci.link_path_allow!.some((p) => new URL(u).pathname.startsWith(p))).toBe(true);
    expect(kept.some((u) => u.includes('/richardson/') || u.includes('/central-austin/'))).toBe(false);
    expect(kept.some((u) => u.includes('/heights-river-oaks-montrose/'))).toBe(true);
  });
  it('drops unmatched and old items and never stores the description', () => {
    const terms = loadTerms();
    const out = mentionsFromFeed(
      feed(),
      [
        item('HISD board to vote on budget', { description: 'SECRET-DESCRIPTION' }),
        item('Weather turns cold'),
        item('HISD news from last month', { published_at: '2026-09-01T00:00:00.000Z' }),
      ],
      terms,
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain('SECRET-DESCRIPTION');
    expect(out[0]!.mention.body_ids).toEqual(['hisd_board']);
    expect(out[0]!.mention.forward_looking).toBe(true);
  });
  it('matches on the description in memory', () => {
    const out = mentionsFromFeed(feed(), [item('School leaders meet', { description: 'Cy-Fair ISD trustees met Monday.' })], loadTerms(), NOW);
    expect(out[0]?.mention.body_ids).toEqual(['cfisd_board']);
    expect(out[0]?.mention.headline).toBe('School leaders meet');
  });
});

describe('dedup across feeds', () => {
  it('merges the same URL from two feeds', () => {
    const terms = loadTerms();
    const a = mentionsFromFeed(feed({ outlet: 'A' }), [item('HISD board meets', { link: 'https://x.org/a?utm_source=rss' })], terms, NOW);
    const b = mentionsFromFeed(
      feed({ outlet: 'B' }),
      [item('HISD and Houston City Council', { link: 'https://X.org/a#top' })],
      terms,
      NOW,
    );
    const merged = mergeMentions([...a, ...b].map((x) => x.mention));
    expect(merged).toHaveLength(1);
    expect(merged[0]!.outlet).toBe('A');
    expect(merged[0]!.body_ids.sort()).toEqual(['hisd_board', 'houston_city_council']);
  });
  it('normalizeUrl drops tracking params and fragments', () => {
    expect(normalizeUrl('https://WWW.Ex.org/a/?utm_source=x&id=2#c')).toBe('https://www.ex.org/a/?id=2');
  });
});

describe('collectNews on recorded feeds', () => {
  it('matches expected_mentions.json and reports failures as warnings', async () => {
    const feeds = loadFeeds();
    const files: Record<string, string> = {
      'Houston Public Media': 'houston-public-media',
      'Community Impact': 'community-impact',
      'KHOU 11': 'khou-11',
      'KPRC 2': 'kprc-2',
      ABC13: 'abc13',
      'FOX 26 Houston': 'fox-26-houston',
    };
    // Hand terms only: the golden file shouldn't change each time a rollout batch joins the catalog.
    const res = await collectNews(feeds, loadTerms(undefined, false), {
      now: NOW,
      feedText: async (f) => {
        if (f.outlet === 'FOX 26 Houston') throw new Error('boom');
        return fx(files[f.outlet]!);
      },
    });
    const expected = JSON.parse(readFileSync('tests/golden/news/expected_mentions.json', 'utf8'));
    expect(res.mentions).toEqual(expected);
    expect(res.warnings).toEqual(['news feed failed: FOX 26 Houston: boom']);
    expect(Object.keys(res.sources)).toEqual(res.mentions.map((m) => m.external_id));
  });
});
