import { config } from 'dotenv'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { rawDb } from '../lib/db/raw'
import { loadJurisdictionMap } from '../lib/ingest/catalog'
import { packHcadLoad, parseHcadStaging, planHcadLoad } from '../lib/lookup/hcadStaging'

config({ path: '.env.local', quiet: true })

const repo = process.cwd()
mkdirSync(join(repo, 'tmp/scratch/hcad'), { recursive: true })
const root = realpathSync(join(repo, 'tmp/scratch/hcad'))
const mappedCodes = new Set(loadJurisdictionMap().map((row) => row.code))
const arg = (name: string) => {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

function stagedFile(path: string) {
  const resolved = realpathSync(resolve(path))
  const relativePath = relative(root, resolved)
  if (relativePath.startsWith('..') || relativePath === '') throw new Error('Input files must be inside tmp/scratch/hcad/.')
  const stat = statSync(resolved)
  if (!stat.isFile() || stat.size > 512 * 1024 * 1024) throw new Error('Each sanitized staging CSV must be a file smaller than 512 MB.')
  return { path: resolved, contents: readFileSync(resolved, 'utf8') }
}

async function main() {
  const dir = arg('--input')
  const year = arg('--source-year')
  const source = arg('--source-url')
  if (!dir || !/^20\d{2}$/.test(year ?? '')) throw new Error('Usage: npm run load:hcad -- --input tmp/scratch/hcad/<demo-slice> --source-year YYYY --source-url <official HCAD URL> [--apply] [--legacy]')
  const resolvedDir = realpathSync(resolve(dir))
  if (relative(root, resolvedDir).startsWith('..')) throw new Error('Input directory must be inside tmp/scratch/hcad/.')
  const parcelFile = stagedFile(join(resolvedDir, 'parcels.csv'))
  const jurisdictionFile = stagedFile(join(resolvedDir, 'jurisdictions.csv'))
  // Shared addresses (condos) and unmapped codes are expected: the lookup accepts matching shared
  // addresses and lists unmapped codes by HCAD's name. Parcels with no codes at all are left out.
  const plan = planHcadLoad(parseHcadStaging(parcelFile.contents, jurisdictionFile.contents, mappedCodes))
  const parcelCount = plan.parcels.length
  if (!parcelCount) throw new Error('No parcel rows with tax codes were staged.')

  const checksum = createHash('sha256').update(parcelFile.contents).update(jurisdictionFile.contents).digest('hex')
  console.log(`HCAD stage validated: ${parcelCount} parcels to load, ${plan.skippedWithoutCodes} skipped without tax codes, ${plan.sharedAddressCount} shared street addresses, ${plan.unmappedCodes.length} codes the lookup will list as not covered.`)
  console.log(`Source year: ${year}; files SHA-256: ${checksum}`)
  if (!process.argv.includes('--apply')) {
    console.log('Dry run only. Use --apply after reviewing the source slice and its code mappings.')
    return
  }
  if (!source || new URL(source).protocol !== 'https:' || !['hcad.org', 'public.hcad.org'].includes(new URL(source).hostname)) {
    throw new Error('Applying requires --source-url using HTTPS on an official HCAD hostname.')
  }

  if (process.argv.includes('--legacy')) {
    // The old per-account tables, kept until the packed tables replace them (district plan §2.1).
    for (let start = 0; start < parcelCount; start += 250) {
      const parcels = plan.parcels.slice(start, start + 250)
      const jurisdictions = parcels.flatMap((parcel) => parcel.jurisdiction_codes.map((hcad_code) => ({ account: parcel.account, hcad_code })))
      const { error } = await rawDb().rpc('load_hcad_batch', { p_parcels: parcels, p_jurisdictions: jurisdictions })
      if (error) throw new Error(`HCAD batch ${Math.floor(start / 250) + 1} failed; no row contents were logged.`)
    }
    console.log(`Loaded ${parcelCount} HCAD parcels from source year ${year} into the legacy tables.`)
    return
  }

  // Packed tables: one row per address and code set, no accounts, the address stored as a hash.
  const rows = packHcadLoad(plan)
  for (let start = 0; start < rows.length; start += 2000) {
    const { error } = await rawDb().rpc('load_hcad_packed_batch', { p_rows: rows.slice(start, start + 2000) })
    if (error) throw new Error(`HCAD packed batch ${Math.floor(start / 2000) + 1} failed; no row contents were logged.`)
  }
  console.log(`Packed ${parcelCount} HCAD parcels into ${rows.length} address rows from source year ${year}.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'HCAD load failed.')
  process.exitCode = 1
})
