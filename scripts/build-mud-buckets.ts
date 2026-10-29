// MUD rollout spec §3: groups tmp/survey/all.json by vendor and writes .plans/mud-buckets.md.
//   npx tsx scripts/survey-district-sites.ts --combine && npx tsx scripts/build-mud-buckets.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { bucketize, type Fingerprint } from '../lib/ingest/siteSurvey'

type AllRow = { id: string; batch: string; vendor: string; website: string | null; fingerprint: Fingerprint | null }

const rows = JSON.parse(readFileSync('tmp/survey/all.json', 'utf8')) as AllRow[]
const firstId = rows.find((r) => r.batch === 'W1')?.id ?? ''
const groups = new Map<string, string[]>()
for (const r of rows) groups.set(r.vendor, [...(groups.get(r.vendor) ?? []), r.id])
const byId = new Map(rows.map((r) => [r.id, r]))
const buckets = bucketize(groups, firstId).map((b, i) => ({ ...b, id: `M${String(i + 1).padStart(2, '0')}` }))

/** What the vendor key was read from, for the vendor table. */
function describe(vendor: string, ids: string[]): string {
  const [kind, value] = vendor.includes(':') ? vendor.split(/:(.*)/) : ['', vendor]
  if (kind === 'credit') return `footer credit "${value}"`
  if (kind === 'docs') return `agenda links on ${value}`
  if (kind === 'theme') return `wp-content/themes/${value}`
  if (kind === 'listing') return `self-reported website is a page on ${value}`
  if (vendor === 'no site') return 'no website found (survey, Comptroller, guessed domains)'
  if (vendor === 'unknown') return 'site found but not fetched or not recognized'
  const gens = [...new Set(ids.map((id) => byId.get(id)?.fingerprint?.generator?.replace(/[\d.]+$/, '').trim()).filter(Boolean))]
  return [vendor.startsWith('google-drive') ? 'Drive file links' : '', gens.length ? `generator ${gens.slice(0, 2).join(', ')}` : 'asset hosts / page markers'].filter(Boolean).join(' · ')
}

const owner = new Map<string, string>()
for (const b of buckets) for (const v of b.vendors) if (!owner.has(v)) owner.set(v, b.id)
const vendors = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
const lines = [
  '# MUD rollout buckets',
  '',
  `Built from \`tmp/survey/all.json\` (${rows.length} water districts, W1–W55) by \`scripts/build-mud-buckets.ts\`, per \`.plans/mud-scrapers-rollout-spec.md\` §3. Vendor keys come from \`vendorKey()\` in \`lib/ingest/siteSurvey.ts\`: board platform, then footer credit, then off-site agenda host, then custom theme, then Drive plus builder, then builder. Generic builder keys (wordpress, wix, …) group sites that only share a builder, not a firm; the bucket's worker confirms whether one adapter fits them all. \`listing:\` means the self-reported website is a tax office's or law firm's page for the district. \`unknown\` is mostly sites whose fetch failed during the survey (retry first). The spec's 498 counts a blank, unnamed entry at the end of W48 in \`district-rollout-batches.md\`; it has no name, so no ID and no bucket here.`,
  '',
  '## Vendors',
  '',
  '| Vendor | Fingerprint | Districts | Owning bucket |',
  '|---|---|---|---|',
  ...vendors.map(([v, ids]) => `| \`${v}\` | ${describe(v, ids)} | ${ids.length} | ${owner.get(v)} |`),
  '',
  '## Buckets',
  '',
  'Format: ID · vendor(s) · districts (W batch) · status · commit. The first bucket holds W1 (Cy-Fair); then the largest.',
  '',
  ...buckets.map((b) => `- **${b.id}** · ${b.vendors.map((v) => `\`${v}\``).join(', ')} · ${b.ids.length}: ${b.ids.map((id) => `${id} (${byId.get(id)!.batch})`).join(', ')} · status: not started · commit: –`),
  '',
]
writeFileSync('.plans/mud-buckets.md', lines.join('\n'))
console.log(`.plans/mud-buckets.md: ${buckets.length} buckets, ${vendors.length} vendors`)
