import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { z } from 'zod'
import { db } from '../lib/db'
import { loadBodyCatalog, loadJurisdictionMap } from '../lib/ingest/catalog'

config({ path: '.env.local', quiet: true })

// The hand-checked map plus the generated district map, checked for repeated codes by the shared loader.
const map = { mappings: loadJurisdictionMap() }
const bodyIds = new Set(loadBodyCatalog().map((body) => body.id))
for (const row of map.mappings) if (!bodyIds.has(row.body_id)) throw new Error(`Jurisdiction map references an unknown body for code ${row.code}.`)
const verifiedOn = z.object({ verified_on: z.string().date() }).parse(parse(readFileSync('data/hcad-jurisdiction-map.yaml', 'utf8'))).verified_on

async function main() {
  if (process.argv.includes('--check')) {
    console.log(`Validated ${map.mappings.length} source-backed HCAD jurisdiction mappings (hand-checked map verified ${verifiedOn}).`)
    return
  }
  if (!process.argv.includes('--apply')) throw new Error('Dry run only. Use --apply to upsert the validated jurisdiction map into Supabase.')
  const { error } = await db().from('jurisdiction_map').upsert(map.mappings.map(({ code, body_id }) => ({ hcad_code: code, body_id })), { onConflict: 'hcad_code' })
  if (error) throw new Error('HCAD jurisdiction map upsert failed.')
  console.log(`Upserted ${map.mappings.length} verified HCAD jurisdiction mappings.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'HCAD jurisdiction map seed failed.')
  process.exitCode = 1
})
