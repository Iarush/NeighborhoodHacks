import { config } from 'dotenv'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, realpathSync, readFileSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { finished } from 'node:stream/promises'
import { join, relative, resolve } from 'node:path'
import { csvCell, hcadAccountFromRaw, hcadHeader, hcadJurisdictionFromRaw, parseHcadTsvRowLoose } from '../lib/lookup/hcadSource'

config({ path: '.env.local', quiet: true })
const repo = process.cwd()
mkdirSync(join(repo, 'tmp/scratch/hcad'), { recursive: true })
const root = realpathSync(join(repo, 'tmp/scratch/hcad'))
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1] }
const inScratch = (path: string) => {
  const resolved = resolve(path)
  if (relative(root, resolved).startsWith('..')) throw new Error('HCAD files must remain inside tmp/scratch/hcad/.')
  return resolved
}
async function hashFile(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

// Rows HCAD's export couldn't align, per file (reported, never fatal).
const malformed: Record<string, { padded: number; skipped: number }> = {}

async function* tsv(path: string, required: readonly string[], label: string) {
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })
  let header: string[] | null = null
  const counts = (malformed[label] = { padded: 0, skipped: 0 })
  for await (const line of lines) {
    if (!header) { header = hcadHeader(line, required, label); continue }
    if (!line.trim()) continue
    const parsed = parseHcadTsvRowLoose(line, header)
    if (parsed.status === 'skipped') { counts.skipped++; continue }
    if (parsed.status === 'padded') counts.padded++
    yield parsed.row
  }
  if (!header) throw new Error(`${label} is empty.`)
}

async function main() {
  const sourceDir = arg('--source-dir')
  const outputDir = arg('--output')
  const year = arg('--source-year')
  const zipInput = arg('--zips')
  if (!sourceDir || !outputDir || !/^20\d{2}$/.test(year ?? '') || !zipInput) {
    throw new Error('Usage: npm run stage:hcad -- --source-dir tmp/scratch/hcad/raw-YYYY --output tmp/scratch/hcad/<slice> --source-year YYYY --zips 77004,77433|all')
  }
  const source = realpathSync(inScratch(sourceDir))
  const outputRequest = inScratch(outputDir)
  if (relative(source, outputRequest) === '' || !relative(source, outputRequest).startsWith('..')) throw new Error('Use separate sibling source and staging directories.')
  mkdirSync(outputRequest, { recursive: true })
  const output = realpathSync(outputRequest)
  if (relative(root, output).startsWith('..')) throw new Error('Staging output must remain inside tmp/scratch/hcad/.')
  // "all" stages the whole county for the packed tables (district-coverage plan §2.1).
  const zips: ReadonlySet<string> | 'all' = zipInput === 'all'
    ? 'all'
    : new Set(zipInput.split(',').map((zip) => zip.trim()).filter((zip) => /^\d{5}$/.test(zip)))
  if (zips !== 'all' && !zips.size) throw new Error('Provide one or more five-digit ZIP codes, or all.')
  const accountFile = join(source, 'real_acct.txt')
  const jurisdictionFile = join(source, 'jur_value.txt')
  // Parcel points are optional: the lookup locates addresses with the Census point and uses a
  // parcel point only when the Census can't, so the GIS export (ogr2ogr) can be skipped.
  const centroidFile = join(source, 'parcel-centroids.geojson')
  const hasCentroids = existsSync(centroidFile)
  if (hasCentroids && statSync(centroidFile).size > 30 * 1024 * 1024) throw new Error('Filtered parcel-centroid GeoJSON exceeds the 30 MB staging limit.')
  const centroidsText = hasCentroids ? readFileSync(centroidFile, 'utf8') : '{"type":"FeatureCollection","features":[]}'
  const centroids = JSON.parse(centroidsText) as { type?: string; features?: Array<{ properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }> }
  if (centroids.type !== 'FeatureCollection' || !Array.isArray(centroids.features)) throw new Error('GIS centroid input is not a GeoJSON FeatureCollection.')
  const pointByAccount = new Map<string, [number, number]>()
  for (const feature of centroids.features) {
    const account = String(feature.properties?.HCAD_NUM ?? '').trim()
    const zip = String(feature.properties?.Zip ?? '').replace(/\D/g, '').slice(0, 5)
    const coordinates = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null
    if ((zips !== 'all' && !zips.has(zip)) || !/^\d{6,25}$/.test(account) || !Array.isArray(coordinates) || coordinates.length < 2) continue
    const point: [number, number] = [Number(coordinates[0]), Number(coordinates[1])]
    if (!point.every(Number.isFinite) || point[0] < -96 || point[0] > -94.8 || point[1] < 29.4 || point[1] > 30.2) throw new Error('GIS centroid file contains invalid Harris County coordinates.')
    if (pointByAccount.has(account)) throw new Error('GIS centroid file contains duplicate HCAD accounts.')
    pointByAccount.set(account, point)
  }

  const parcelPath = join(output, 'parcels.csv')
  const parcelWriter = createWriteStream(parcelPath, { encoding: 'utf8' })
  parcelWriter.write('account,site_address_norm,legal_description,longitude,latitude\n')
  const accounts = new Set<string>()
  let parcelCount = 0
  for await (const row of tsv(accountFile, ['acct', 'site_addr_1', 'site_addr_2', 'site_addr_3', 'lgl_1', 'lgl_2', 'lgl_3', 'lgl_4'], 'HCAD real_acct.txt')) {
    const account = hcadAccountFromRaw(row, zips)
    if (!account) continue
    if (accounts.has(account.account)) throw new Error('HCAD real_acct.txt contains a duplicate selected account.')
    accounts.add(account.account)
    const point = pointByAccount.get(account.account)
    parcelWriter.write([
      account.account, account.site_address_norm, account.legal_description ?? '', point?.[0] ?? '', point?.[1] ?? '',
    ].map(csvCell).join(',') + '\n')
    parcelCount++
  }
  parcelWriter.end()
  await finished(parcelWriter)
  if (!parcelCount) throw new Error('No HCAD accounts matched the selected ZIP codes.')

  const jurisdictionPath = join(output, 'jurisdictions.csv')
  const jurisdictionWriter = createWriteStream(jurisdictionPath, { encoding: 'utf8' })
  jurisdictionWriter.write('account,hcad_code\n')
  const accountsWithJurisdictions = new Set<string>()
  let jurisdictionCount = 0
  for await (const row of tsv(jurisdictionFile, ['acct', 'tax_district'], 'HCAD jur_value.txt')) {
    const jurisdiction = hcadJurisdictionFromRaw(row, accounts)
    if (!jurisdiction) continue
    jurisdictionWriter.write(`${csvCell(jurisdiction.account)},${csvCell(jurisdiction.hcad_code)}\n`)
    accountsWithJurisdictions.add(jurisdiction.account)
    jurisdictionCount++
  }
  jurisdictionWriter.end()
  await finished(jurisdictionWriter)
  const noJurisdictions = accounts.size - accountsWithJurisdictions.size
  const checksum = createHash('sha256')
  for (const path of [accountFile, jurisdictionFile]) checksum.update(await hashFile(path))
  checksum.update(centroidsText)
  console.log(`Staged ${parcelCount} accounts and ${jurisdictionCount} jurisdiction rows from HCAD year ${year}; ${pointByAccount.size} parcel centroids; ${noJurisdictions} accounts without jurisdiction rows.`)
  console.log(`Source files SHA-256: ${checksum.digest('hex')}. No owner, mail, valuation, or exemption fields were written.`)
  for (const [label, counts] of Object.entries(malformed)) {
    if (counts.padded || counts.skipped) console.log(`Note: ${label} had ${counts.padded} short rows (padded) and ${counts.skipped} long rows (skipped) out of line with its header.`)
  }
  // load:hcad leaves these out, so the lookup uses the Census answer for them.
  if (noJurisdictions) console.log(`Note: ${noJurisdictions} accounts have no tax jurisdiction rows; load:hcad will skip them.`)
  console.log(`Review staged output, then run npm run load:hcad -- --input ${relative(repo, output)} --source-year ${year} --source-url https://hcad.org/pdata/pdata-property-downloads.html`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'HCAD staging failed.')
  process.exitCode = 1
})
