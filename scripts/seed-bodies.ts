import { config } from 'dotenv'
import { db } from '../lib/db'
import { loadBodyCatalog } from '../lib/ingest/catalog'

config({ path: '.env.local', quiet: true })

// Every catalog file (data/bodies.yaml plus the generated district file), checked by the shared loader.
const rows = loadBodyCatalog()

async function main() {
  if (process.argv.includes('--check')) {
    console.log(`Validated ${rows.length} canonical body catalog entries.`)
    return
  }
  if (!process.argv.includes('--apply')) throw new Error('Dry run only. Use --apply to upsert the validated catalog into Supabase.')
  const { error } = await db().from('bodies').upsert(rows.map(({ source_url: _sourceUrl, ...body }) => body), { onConflict: 'id' })
  if (error) throw new Error('Body catalog upsert failed.')
  console.log(`Upserted ${rows.length} canonical body catalog entries.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Body catalog seed failed.')
  process.exitCode = 1
})
