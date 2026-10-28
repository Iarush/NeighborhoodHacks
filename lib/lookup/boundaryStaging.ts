export type BoundaryMapping = { code: string; body_id: string; type: string }
export type StagedBoundary = { body_id: string; geometries: Array<Record<string, unknown>> }
export type BoundaryStageResult = { boundaries: StagedBoundary[]; skippedFeatureCount: number }

type Position = number[]
type PolygonCoordinates = Position[][]
type Geometry =
  | { type: 'Polygon'; coordinates: PolygonCoordinates }
  | { type: 'MultiPolygon'; coordinates: PolygonCoordinates[] }

const inHarrisBounds = (lon: number, lat: number) => lon >= -96 && lon <= -94.8 && lat >= 29.4 && lat <= 30.2

function validRing(ring: Position[]) {
  if (ring.length < 4) return false
  const first = ring[0]!
  const last = ring[ring.length - 1]!
  if (first[0] !== last[0] || first[1] !== last[1]) return false
  return ring.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && inHarrisBounds(lon!, lat!))
}

function validGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== 'object') return false
  const geometry = value as { type?: unknown; coordinates?: unknown }
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.length > 0 && geometry.coordinates.every((ring) => Array.isArray(ring) && validRing(ring as Position[]))
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.length > 0 && geometry.coordinates.every((polygon) =>
      Array.isArray(polygon) && polygon.length > 0 && polygon.every((ring) => Array.isArray(ring) && validRing(ring as Position[])),
    )
  }
  return false
}

export const BOUNDARY_LAYERS = ['City', 'School', 'College', 'HCAD_MUD', 'HCAD_Water_Districts'] as const
export type BoundaryLayer = typeof BOUNDARY_LAYERS[number]

// HCAD's City/School/College downloads, and the county's two water-district layers
// (district coverage plan 0.4), which hold every Water Code district as type `mud`.
const LAYER_BODY_TYPES: Record<BoundaryLayer, string> = {
  City: 'city_council', School: 'school_board', College: 'college_board', HCAD_MUD: 'mud', HCAD_Water_Districts: 'mud',
}

/** Validates HCAD polygon exports after reprojection to GeoJSON's WGS84 coordinates. */
export function stageHcadBoundaries(text: string, sourceLayer: BoundaryLayer, mappings: readonly BoundaryMapping[]): BoundaryStageResult {
  if (Buffer.byteLength(text, 'utf8') > 30 * 1024 * 1024) throw new Error('Boundary GeoJSON exceeds the 30 MB staging limit.')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('Boundary staging input is not valid GeoJSON.') }
  if (!parsed || typeof parsed !== 'object') throw new Error('Boundary staging input is not a FeatureCollection.')
  const collection = parsed as { type?: unknown; crs?: { properties?: { name?: unknown } }; features?: unknown }
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) || collection.features.length === 0) {
    throw new Error('Boundary staging input must be a non-empty FeatureCollection.')
  }
  const crs = collection.crs?.properties?.name
  if (crs && !/4326|CRS84|WGS.?84/i.test(String(crs))) throw new Error('Reproject the boundary GeoJSON to EPSG:4326 first.')
  const allowedTypes = new Set([LAYER_BODY_TYPES[sourceLayer]])
  const bodyByCode = new Map(mappings.filter((row) => allowedTypes.has(row.type)).map((row) => [row.code, row.body_id]))
  const byBody = new Map<string, Array<Record<string, unknown>>>()
  let skippedFeatureCount = 0
  for (const raw of collection.features) {
    if (!raw || typeof raw !== 'object') throw new Error('Boundary staging contains an invalid feature.')
    const feature = raw as { type?: unknown; properties?: Record<string, unknown> | null; geometry?: unknown }
    if (feature.type !== 'Feature' || !feature.properties || !validGeometry(feature.geometry)) {
      throw new Error('Boundary staging contains an invalid or unsupported polygon feature.')
    }
    const code = String(feature.properties.Code ?? feature.properties.code ?? '').trim().padStart(3, '0')
    const bodyId = bodyByCode.get(code)
    if (!bodyId) { skippedFeatureCount++; continue }
    const geometry = feature.geometry.type === 'Polygon'
      ? { type: 'MultiPolygon', coordinates: [feature.geometry.coordinates] }
      : feature.geometry
    const list = byBody.get(bodyId) ?? []
    list.push(geometry)
    byBody.set(bodyId, list)
  }
  if (byBody.size === 0) throw new Error('No HCAD boundary features matched the curated body map.')
  return { boundaries: [...byBody].map(([body_id, geometries]) => ({ body_id, geometries })), skippedFeatureCount }
}
