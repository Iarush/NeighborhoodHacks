import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bodyLogo } from '@/lib/bodyLogos';
import { bodyPhoto } from '@/lib/bodyPhotos';
import { loadBodyCatalog } from '@/lib/ingest/catalog';
import { parseBatches, waterBody } from '@/lib/ingest/districtCatalog';
import { getRecipe } from '@/lib/registration/recipes';

// District coverage plan 0.10: a rollout district never borrows another body's logo, photo or
// speaker rules. Checked over the catalog plus every W batch's generated body.
const PILOT = new Set(['hisd_board', 'cfisd_board', 'hcmud_489']);
const water = [...parseBatches(readFileSync('.plans/district-rollout-batches.md', 'utf8')).values()]
  .filter((b) => b.id.startsWith('W'))
  .flatMap((b) => b.entries.map((e) => waterBody(e, new Map())));
const rollout = [...loadBodyCatalog().filter((b) => b.type === 'school_board' || b.type === 'mud'), ...water]
  .filter((b, i, all) => !PILOT.has(b.id) && all.findIndex((x) => x.id === b.id) === i);

describe('shared pages for rollout districts (plan 0.10)', () => {
  it('covers the generated districts', () => {
    expect(rollout.length).toBeGreaterThan(500);
  });

  it('shows no logo: the icon tile, never another district\'s seal', () => {
    expect(rollout.filter((b) => bodyLogo(b.id) !== null).map((b) => b.id)).toEqual([]);
  });

  it('uses the kind photo, never a specific body\'s building', () => {
    const own = new Set(['hisd_board', 'houston_city_council', 'commissioners_court'].map((id) => bodyPhoto(id).src));
    for (const b of rollout) expect(own.has(bodyPhoto(b.id, b.type === 'mud' ? 'mud' : 'school').src)).toBe(false);
  });

  it('claims no speaker sign-up rules (Speak up shows the "not verified" path)', () => {
    expect(rollout.filter((b) => getRecipe(b.id) !== null).map((b) => b.id)).toEqual([]);
  });
});
