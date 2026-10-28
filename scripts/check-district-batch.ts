// District coverage plan 0.9: runs the §4 checklist for a batch and prints pass or fail for each
// district.
//   npx tsx scripts/check-district-batch.ts --batch W1 [--batch S1] [--batch pilot]
// Without Supabase keys it checks the files only (catalog, code map, sources) and marks the
// database checks "skip". It exits non-zero when any district fails. Steps 5 and 6 of the
// checklist (a real address per district, the pages at 390 px) stay manual.
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { z } from 'zod'
import { selectRows } from '../lib/db/raw'
import { PILOT, batchTargets, checkTargets, strayBoundaries, type LiveFacts, type NoAgendas, type Target } from '../lib/ingest/batchCheck'
import { loadBodyCatalog, loadJurisdictionMap } from '../lib/ingest/catalog'
import { parseBatches } from '../lib/ingest/districtCatalog'
import { loadSources } from '../lib/ingest/registry'

config({ path: '.env.local', quiet: true })
const batchIds = process.argv.flatMap((arg, i) => (process.argv[i - 1] === '--batch' ? arg.split(',') : []))

async function liveFacts(): Promise<LiveFacts | undefined> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return undefined
  const [bodies, map, boundaries] = await Promise.all([
    selectRows<{ id: string }>('bodies', 'id', (q) => q.limit(10000)),
    selectRows<{ hcad_code: string; body_id: string }>('jurisdiction_map', 'hcad_code, body_id', (q) => q.limit(10000)),
    selectRows<{ body_id: string }>('boundaries', 'body_id', (q) => q.limit(50000)),
  ])
  return {
    bodyIds: new Set(bodies.map((r) => r.id)),
    codeToBody: new Map(map.map((r) => [r.hcad_code, r.body_id])),
    boundaryBodyIds: new Set(boundaries.map((r) => r.body_id)),
  }
}

async function main() {
  if (batchIds.length === 0) throw new Error('Usage: npx tsx scripts/check-district-batch.ts --batch W1 [--batch pilot]')
  const batches = parseBatches(readFileSync('.plans/district-rollout-batches.md', 'utf8'))
  const hcad = z.object({ jurisdictions: z.record(z.string(), z.string()) }).parse(JSON.parse(readFileSync('data/hcad-jurisdictions.json', 'utf8'))).jurisdictions
  const noAgendas = new Map(
    z.array(z.object({ id: z.string(), no_agendas_online: z.object({ reason: z.string().min(1), checked_on: z.string().date() }).optional() }))
      .parse(parse(readFileSync('data/district-sites.yaml', 'utf8')) ?? [])
      .flatMap((s): [string, NoAgendas][] => (s.no_agendas_online ? [[s.id, { id: s.id, ...s.no_agendas_online }]] : [])),
  )
  const catalog = loadBodyCatalog()
  const live = await liveFacts()
  const input = { catalog, map: loadJurisdictionMap(), sources: loadSources().map((s) => ({ body_id: s.body_id ?? null, config: s.config })), noAgendas, hcad, live }

  let failed = 0
  for (const id of batchIds) {
    let targets: Target[]
    if (id.toLowerCase() === 'pilot') targets = [...PILOT]
    else {
      const batch = batches.get(id)
      if (!batch) throw new Error(`no batch ${id} in .plans/district-rollout-batches.md`)
      targets = batchTargets(batch, hcad)
    }
    console.log(`\n${id}: ${targets.length} districts${live ? '' : ' (files only: no Supabase keys)'}`)
    for (const result of checkTargets(targets, input)) {
      if (!result.ok) failed++
      console.log(`  ${result.ok ? 'PASS' : 'FAIL'}  ${result.target.label} -> ${result.target.bodyId}`)
      for (const c of result.checks) if (c.status !== 'pass') console.log(`        ${c.status.padEnd(4)} ${c.step}: ${c.detail}`)
    }
  }
  if (live) {
    const stray = strayBoundaries(live, catalog)
    if (stray.length) console.log(`\nBoundaries for bodies not in the catalog: ${stray.join(', ')}`)
  }
  console.log('\nBy hand (plan §4 steps 5-6): one real address per district, and the pages at 390 px by keyboard.')
  if (failed) {
    console.log(`${failed} district(s) failed.`)
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Batch check failed.')
  process.exitCode = 1
})
