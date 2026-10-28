import { config } from 'dotenv'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { rawDb } from '../lib/db/raw'
import { loadBodyCatalog, loadJurisdictionMap } from '../lib/ingest/catalog'
import { BOUNDARY_LAYERS, stageHcadBoundaries, type BoundaryLayer } from '../lib/lookup/boundaryStaging'
import { batchTargets, PILOT } from '../lib/ingest/batchCheck'
import { parseBatches } from '../lib/ingest/districtCatalog'

config({ path: '.env.local', quiet: true })
const repo = process.cwd()
mkdirSync(join(repo, 'tmp/scratch/hcad'), { recursive: true })
const root = realpathSync(join(repo, 'tmp/scratch/hcad'))
const sourceManifest = z.array(z.object({
  id: z.string(), source_url: z.string().url(), dictionary_url: z.string().url(), verified_on: z.string().date(),
  release_updated: z.string().date(), source_crs: z.string(), output_crs: z.string(),
  layers: z.array(z.object({ name: z.enum(BOUNDARY_LAYERS), allowed_body_types: z.array(z.string()), source_code_field: z.string() })),
})).parse(parse(readFileSync('data/boundary-sources.yaml', 'utf8')))
const typeByBodyId = new Map(loadBodyCatalog().map((body) => [body.id, body.type as string]))
const mapping = loadJurisdictionMap().map((row) => ({ code: row.code, body_id: row.body_id, type: typeByBodyId.get(row.body_id) ?? '' }))
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1] }

// --batch W1 (or pilot) loads only that batch's bodies. The RPC replaces polygons only for the
// body IDs it's given, so earlier batches' polygons stay (district coverage plan 0.4).
function batchBodyIds(batchId: string | undefined): Set<string> | undefined {
  if (!batchId) return undefined
  if (batchId.toLowerCase() === 'pilot') return new Set(PILOT.map((t) => t.bodyId))
  const batch = parseBatches(readFileSync('.plans/district-rollout-batches.md', 'utf8')).get(batchId)
  if (!batch) throw new Error(`No batch ${batchId} in .plans/district-rollout-batches.md.`)
  const hcad = z.object({ jurisdictions: z.record(z.string(), z.string()) }).parse(JSON.parse(readFileSync('data/hcad-jurisdictions.json', 'utf8'))).jurisdictions
  return new Set(batchTargets(batch, hcad).map((t) => t.bodyId))
}

async function main() {
  const input = arg('--input')
  const layer = arg('--layer')
  const sourceYear = arg('--source-year')
  const sourceUrl = arg('--source-url')
  if (!input || !BOUNDARY_LAYERS.includes(layer as BoundaryLayer) || !/^20\d{2}$/.test(sourceYear ?? '')) {
    throw new Error(`Usage: npm run load:boundaries -- --input tmp/scratch/hcad/<file.geojson> --layer ${BOUNDARY_LAYERS.join('|')} --source-year YYYY [--batch W1] [--apply]`)
  }
  const onlyBodies = batchBodyIds(arg('--batch'))
  if (onlyBodies === undefined && (layer === 'HCAD_MUD' || layer === 'HCAD_Water_Districts')) {
    throw new Error('Water-district layers load one batch at a time: add --batch <id>.')
  }
  const path = realpathSync(resolve(input))
  if (relative(root, path).startsWith('..') || !statSync(path).isFile()) throw new Error('Input must be a file inside tmp/scratch/hcad/.')
  if (statSync(path).size > 30 * 1024 * 1024) throw new Error('Boundary GeoJSON exceeds the 30 MB staging limit.')
  const text = readFileSync(path, 'utf8')
  const source = sourceManifest.find((item) => item.layers.some((candidate) => candidate.name === layer))
  const layerInfo = source?.layers.find((candidate) => candidate.name === layer)
  if (!source || !layerInfo || source.source_crs !== 'EPSG:2278' || source.output_crs !== 'EPSG:4326' || source.release_updated.slice(0, 4) !== sourceYear) {
    throw new Error('The requested HCAD layer or source vintage is not in the reviewed source manifest.')
  }
  if (process.argv.includes('--apply') && (!sourceUrl || new URL(sourceUrl).protocol !== 'https:' || sourceUrl !== source.source_url)) {
    throw new Error('Apply requires --source-url matching the HTTPS URL in data/boundary-sources.yaml.')
  }
  const layerMapping = mapping.filter((row) => layerInfo.allowed_body_types.includes(row.type) && (!onlyBodies || onlyBodies.has(row.body_id)))
  if (layerMapping.length === 0) throw new Error(`No ${layer} bodies in the catalog${onlyBodies ? ' for this batch; run the catalog builder first' : ''}.`)
  const result = stageHcadBoundaries(text, layer as BoundaryLayer, layerMapping)
  const checksum = createHash('sha256').update(text).digest('hex')
  console.log(`HCAD ${layer} boundary stage validated: ${result.boundaries.length} bodies, ${result.boundaries.reduce((sum, row) => sum + row.geometries.length, 0)} polygons, ${result.skippedFeatureCount} unmapped source features.`)
  console.log(`Source: ${source.id}; year: ${sourceYear}; file SHA-256: ${checksum}; reprojection: ${source.source_crs} to ${source.output_crs}.`)
  if (!process.argv.includes('--apply')) { console.log('Dry run only. Use --apply after reviewing the source archive and staging file.'); return }
  const expectedBodyIds = [...new Set(layerMapping.map((row) => row.body_id))]
  const missing = expectedBodyIds.filter((id) => !result.boundaries.some((b) => b.body_id === id))
  if (missing.length) console.log(`No polygon in this file for: ${missing.join(', ')} (their old polygons, if any, are removed).`)
  const { error } = await rawDb().rpc('replace_hcad_boundary_layer', { p_body_ids: expectedBodyIds, p_boundaries: result.boundaries })
  if (error) throw new Error('Atomic HCAD boundary-layer replacement failed; existing data was left unchanged.')
  console.log(`Loaded ${result.boundaries.length} HCAD ${layer} body boundaries.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Boundary load failed.')
  process.exitCode = 1
})
