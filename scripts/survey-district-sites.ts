// District coverage plan 0.7: surveys each district's website for a batch and writes a report.
//   npx tsx scripts/survey-district-sites.ts --batch W1 [--batch pilot]
// For each district it finds a site (hand-checked data/district-sites.yaml, then an existing
// source's index page, then the website the district reported to the Comptroller), fetches it,
// names the vendor or board platform, and suggests an llm_extract config. Output goes to
// tmp/survey/<batch>.json and .md only, never to data/sources.yaml: a person checks each one and
// runs `npm run scrape -- --source <id>` before adding it (plan §4 step 4).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { DateTime } from 'luxon'
import { parse } from 'yaml'
import { z } from 'zod'
import { getJson, getText } from '../lib/adapters/http'
import { PILOT, batchTargets, type Target } from '../lib/ingest/batchCheck'
import { loadBodyCatalog } from '../lib/ingest/catalog'
import { parseBatches, waterDistrict } from '../lib/ingest/districtCatalog'
import { ZONE } from '../lib/ingest/normalize'
import { loadSources } from '../lib/ingest/registry'
import { agendaPageLinks, betterSuggestion, boardPlatforms, comptrollerKey, daysSince, guessedDomains, namesDistrict, siteBuilder, suggestConfig, type ConfigSuggestion, type Platform } from '../lib/ingest/siteSurvey'

const COMPTROLLER_API = 'https://api.comptroller.texas.gov/open-data/v1/spdpid/spdpid-entity'
const batchIds = process.argv.flatMap((arg, i) => (process.argv[i - 1] === '--batch' ? arg.split(',') : []))
const http = { retries: 0, timeoutMs: 20_000 }
const MAX_PAGES = 12
// Sources on a platform adapter (boardbook, legistar, primegov) need no survey.
const platformSources = new Map(loadSources().filter((s) => s.body_id && s.adapter !== 'llm_extract' && s.adapter !== 'manual').map((s) => [s.body_id!, s.adapter as string]))

type SiteFrom = 'checked' | 'source' | 'comptroller (self-reported)' | 'guessed domain (verify)'
type Row = {
  label: string
  bodyId: string
  site?: string
  siteFrom?: SiteFrom
  builder?: string
  platforms: Platform[]
  suggestion?: ConfigSuggestion
  pagesTried: string[]
  error?: string
}

/** Websites the district reported to the Comptroller, newest report year first. */
async function comptrollerSites(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const year = DateTime.now().setZone(ZONE).year
  for (const y of [year, year - 1]) {
    const res = await getJson<{ data?: { ent_dis_nm: string; wbst_url_tx: string }[] }>(`${COMPTROLLER_API}?cnty_nm=HARRIS&rpt_yr=${y}`, http).catch(() => ({ data: [] }))
    for (const row of res.data ?? []) {
      const url = row.wbst_url_tx.trim()
      const key = comptrollerKey(row.ent_dis_nm)
      if (url && !out.has(key)) out.set(key, /^https?:\/\//i.test(url) ? url : `https://${url}`)
    }
  }
  return out
}

/** Try the usual domain patterns; keep one only if its page names this district. */
async function guessSite(bodyId: string, name: string): Promise<string | undefined> {
  for (const url of guessedDomains(bodyId)) {
    const html = await getText(url, { ...http, timeoutMs: 8_000 }).catch(() => '')
    if (html && namesDistrict(html, bodyId, name)) return url
  }
  return undefined
}

async function survey(target: Target, name: string, sites: Map<string, { url: string; from: SiteFrom }>): Promise<Row> {
  const row: Row = { label: target.label, bodyId: target.bodyId, platforms: [], pagesTried: [] }
  const adapter = platformSources.get(target.bodyId)
  if (adapter) return { ...row, platforms: [{ platform: adapter, url: '' }], error: `already ingesting through the ${adapter} adapter` }
  const site = sites.get(target.bodyId)
  if (!site) return { ...row, error: `no website found for "${name}"; search by hand` }
  row.site = site.url
  row.siteFrom = site.from
  try {
    const home = await getText(site.url, http)
    row.pagesTried.push(site.url)
    row.builder = siteBuilder(home)
    row.platforms = boardPlatforms(home, site.url)
    row.suggestion = suggestConfig(home, site.url)
    // Two levels: the platform link is often under Board > Meetings. At most MAX_PAGES fetches.
    const queue = agendaPageLinks(home, site.url, 5).map((url) => ({ url, depth: 1 }))
    const seen = new Set([site.url, ...queue.map((q) => q.url)])
    while (queue.length && row.pagesTried.length < MAX_PAGES) {
      const { url: page, depth } = queue.shift()!
      const html = await getText(page, http).catch(() => '')
      if (!html) continue
      row.pagesTried.push(page)
      if (depth < 2) for (const next of agendaPageLinks(html, page, 3)) if (!seen.has(next)) { seen.add(next); queue.push({ url: next, depth: 2 }) }
      for (const p of boardPlatforms(html, page)) if (!row.platforms.some((q) => q.platform === p.platform)) row.platforms.push(p)
      const s = suggestConfig(html, page)
      if (s && betterSuggestion(s, row.suggestion)) row.suggestion = s
    }
  } catch (error) {
    row.error = (error as Error).message
  }
  return row
}

function report(batchId: string, rows: Row[], today: string): string {
  const lines = [
    `# Site survey: ${batchId} (${today})`,
    '',
    'Generated by `scripts/survey-district-sites.ts`. Suggestions only: check each one, then `npm run scrape -- --source <id>` before adding it to `data/sources.yaml`. Comptroller websites are self-reported by the district.',
    '',
    '| District | Site | Vendor | Suggested config | Newest agenda |',
    '|---|---|---|---|---|',
  ]
  for (const r of rows) {
    const vendor = [r.platforms.map((p) => p.platform).join(', '), r.builder].filter(Boolean).join(' / ') || '–'
    const cfg = r.suggestion ? `\`${r.suggestion.index_url}\` · \`${r.suggestion.link_pattern}\` · ${r.suggestion.date_from} · ${r.suggestion.dated} dated` : r.error ?? 'no dated agenda links found'
    const newest = r.suggestion?.newest ? `${r.suggestion.newest} (${daysSince(r.suggestion.newest, today)} days ago)` : '–'
    lines.push(`| ${r.label} → \`${r.bodyId}\` | ${r.site ? `${r.site} (${r.siteFrom})` : '–'} | ${vendor} | ${cfg} | ${newest} |`)
  }
  const byVendor = new Map<string, string[]>()
  for (const r of rows) {
    const key = r.platforms[0]?.platform ?? r.builder ?? 'no site'
    byVendor.set(key, [...(byVendor.get(key) ?? []), r.bodyId])
  }
  lines.push('', '## By vendor', '', ...[...byVendor].map(([v, ids]) => `- **${v}:** ${ids.join(', ')}`), '')
  return lines.join('\n')
}

async function main() {
  if (batchIds.length === 0) throw new Error('Usage: npx tsx scripts/survey-district-sites.ts --batch W1 [--batch pilot]')
  const batches = parseBatches(readFileSync('.plans/district-rollout-batches.md', 'utf8'))
  const hcad = z.object({ jurisdictions: z.record(z.string(), z.string()) }).parse(JSON.parse(readFileSync('data/hcad-jurisdictions.json', 'utf8'))).jurisdictions
  const catalog = new Map(loadBodyCatalog().map((b) => [b.id, b]))
  const comptroller = await comptrollerSites()
  console.log(`Comptroller: ${comptroller.size} Harris County districts report a website.`)

  // Site per body: hand-checked first, then an existing source's index page, then the Comptroller.
  const sites = new Map<string, { url: string; from: SiteFrom }>()
  for (const s of z.array(z.object({ id: z.string(), website: z.string().url() })).parse(parse(readFileSync('data/district-sites.yaml', 'utf8')) ?? [])) {
    sites.set(s.id, { url: s.website, from: 'checked' })
  }
  for (const s of loadSources()) {
    const index = (s.config as Record<string, unknown>).index_url
    if (s.body_id && typeof index === 'string' && !sites.has(s.body_id)) sites.set(s.body_id, { url: index, from: 'source' })
  }

  const today = DateTime.now().setZone(ZONE).toFormat('yyyy-MM-dd')
  mkdirSync('tmp/survey', { recursive: true })
  for (const id of batchIds) {
    const pilot = id.toLowerCase() === 'pilot'
    const batch = pilot ? undefined : batches.get(id)
    if (!pilot && !batch) throw new Error(`no batch ${id} in .plans/district-rollout-batches.md`)
    const targets = pilot ? [...PILOT] : batchTargets(batch!, hcad)
    const rows: Row[] = []
    for (const target of targets) {
      const entryName = target.label.replace(/^[0-9A-Z]{3} /, '')
      const name = catalog.get(target.bodyId)?.name ?? (id.startsWith('W') ? waterDistrict(entryName).name : target.label)
      const reported = comptroller.get(comptrollerKey(name))
      if (reported && !sites.has(target.bodyId)) sites.set(target.bodyId, { url: reported, from: 'comptroller (self-reported)' })
      if (!sites.has(target.bodyId) && !platformSources.has(target.bodyId)) {
        const guessed = await guessSite(target.bodyId, name)
        if (guessed) sites.set(target.bodyId, { url: guessed, from: 'guessed domain (verify)' })
      }
      const row = await survey(target, name, sites)
      rows.push(row)
      console.log(`  ${row.suggestion ? 'FOUND ' : row.site ? 'NONE  ' : platformSources.has(target.bodyId) ? 'ADAPTR' : 'NOSITE'}  ${target.bodyId.padEnd(28)} ${row.site ?? ''} ${row.suggestion ? `-> ${row.suggestion.dated} dated, newest ${row.suggestion.newest}` : row.error ?? ''}`)
    }
    writeFileSync(`tmp/survey/${id}.json`, JSON.stringify(rows, null, 2))
    writeFileSync(`tmp/survey/${id}.md`, report(id, rows, today))
    console.log(`${id}: wrote tmp/survey/${id}.md and .json`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Survey failed.')
  process.exitCode = 1
})
