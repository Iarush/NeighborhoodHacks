import { describe, expect, it } from 'vitest';
import { bucketize, fingerprint, mergeFingerprints, vendorKey } from '@/lib/ingest/siteSurvey';

const base = 'https://www.hcmud165.com/';

describe('vendor fingerprints (MUD rollout spec §2)', () => {
  it('reads the generator, theme, off-site assets, document hosts and footer credit', () => {
    const html = [
      '<meta name="generator" content="WordPress 6.6">',
      '<link rel="stylesheet" href="/wp-content/themes/mudsites/style.css">',
      '<script src="https://cdn.mudfirm.net/app.js"></script><script src="https://ajax.googleapis.com/jq.js"></script>',
      '<a href="https://drive.google.com/file/d/1/view">Agenda</a><a href="https://drive.google.com/file/d/2/view">Agenda</a><a href="/files/a.pdf">x</a>',
      '<footer>© 2026 District | Website by Mud Firm Design | All rights reserved</footer>',
    ].join('');
    expect(fingerprint(html, base)).toEqual({
      generator: 'WordPress 6.6',
      themes: ['mudsites'],
      cdnHosts: ['cdn.mudfirm.net'],
      docHosts: ['drive.google.com', 'hcmud165.com'],
      credit: 'mud firm design',
    });
  });

  it('merges pages, keeping the home page first', () => {
    const a = { generator: 'X', themes: ['t'], cdnHosts: [], docHosts: ['a.com'], credit: undefined };
    const b = { generator: 'Y', themes: ['t', 'u'], cdnHosts: ['c'], docHosts: ['b.com'], credit: 'firm' };
    expect(mergeFingerprints(a, b)).toEqual({ generator: 'X', themes: ['t', 'u'], cdnHosts: ['c'], docHosts: ['a.com', 'b.com'], credit: 'firm' });
  });

  it('picks one vendor key in priority order', () => {
    const fp = { themes: [], cdnHosts: [], docHosts: [] as string[] };
    expect(vendorKey(fp, ['boardbook', 'google-drive'], 'wordpress', 'x.com')).toBe('boardbook');
    expect(vendorKey({ ...fp, credit: 'firm' }, [], 'wordpress', 'x.com')).toBe('credit:firm');
    expect(vendorKey({ ...fp, docHosts: ['x.com', 'portal.firm.com'] }, [], 'wordpress', 'x.com')).toBe('docs:portal.firm.com');
    expect(vendorKey({ ...fp, themes: ['astra', 'mudsites'] }, [], 'wordpress', 'x.com')).toBe('theme:mudsites');
    expect(vendorKey({ ...fp, themes: ['astra'] }, ['google-drive'], 'wordpress', 'x.com')).toBe('google-drive/wordpress');
    expect(vendorKey(fp, [], 'wix', 'x.com')).toBe('wix');
  });

  it('buckets by vendor without splitting small vendors, W1 bucket first', () => {
    const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    const groups = new Map([['big', ids('b', 45)], ['mid', ids('m', 12)], ['small', ids('s', 8)], ['w1v', ['first', ...ids('w', 4)]]]);
    const buckets = bucketize(groups, 'first');
    expect(buckets[0]!.ids).toContain('first');
    expect(buckets.flatMap((b) => b.ids).sort()).toEqual([...groups.values()].flat().sort());
    for (const v of ['mid', 'small', 'w1v']) expect(buckets.filter((b) => b.vendors.includes(v))).toHaveLength(1);
    expect(buckets.filter((b) => b.vendors.includes('big')).map((b) => b.ids.length)).toEqual([15, 15, 15]);
    expect(buckets.every((b) => b.ids.length <= 20)).toBe(true);
  });
});
