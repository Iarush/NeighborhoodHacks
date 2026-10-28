import { describe, expect, it } from 'vitest'
import { stageHcadBoundaries, type BoundaryMapping } from '@/lib/lookup/boundaryStaging'

const ring = [[-95.37, 29.73], [-95.36, 29.73], [-95.36, 29.74], [-95.37, 29.73]]
const feature = (Code: string, coordinates: unknown = [ring]) => ({
  type: 'Feature', properties: { Code }, geometry: { type: 'Polygon', coordinates },
})
const collection = (...features: unknown[]) => JSON.stringify({ type: 'FeatureCollection', features })
const mappings: BoundaryMapping[] = [
  { code: '001', body_id: 'hisd_board', type: 'school_board' },
  { code: '004', body_id: 'cfisd_board', type: 'school_board' },
  { code: '061', body_id: 'houston_city_council', type: 'city_council' },
]

describe('stageHcadBoundaries', () => {
  it('maps only appropriate source layer codes and converts Polygon to MultiPolygon', () => {
    const result = stageHcadBoundaries(collection(feature('001'), feature('999')), 'School', mappings)
    expect(result.boundaries).toEqual([{ body_id: 'hisd_board', geometries: [{ type: 'MultiPolygon', coordinates: [[ring]] }] }])
    expect(result.skippedFeatureCount).toBe(1)
    expect(() => stageHcadBoundaries(collection(feature('001')), 'City', mappings)).toThrow(/No HCAD boundary features/)
    expect(stageHcadBoundaries(collection(feature('048')), 'College', [{ code: '048', body_id: 'hcc_board', type: 'college_board' }]).boundaries).toHaveLength(1)
  })

  it('rejects non-WGS84, empty, open, out-of-county, and unsupported inputs', () => {
    expect(() => stageHcadBoundaries(JSON.stringify({ type: 'FeatureCollection', crs: { properties: { name: 'EPSG:2278' } }, features: [feature('001')] }), 'School', mappings)).toThrow(/EPSG:4326/)
    expect(() => stageHcadBoundaries(collection(), 'School', mappings)).toThrow(/non-empty/)
    expect(() => stageHcadBoundaries(collection(feature('001', [[[1, 2], [2, 3], [3, 4]]])), 'School', mappings)).toThrow(/invalid/)
    expect(() => stageHcadBoundaries(collection(feature('001', [[[-100, 40], [-99, 40], [-99, 41], [-100, 40]]])), 'School', mappings)).toThrow(/invalid/)
    expect(() => stageHcadBoundaries(collection({ type: 'Feature', properties: { Code: '001' }, geometry: { type: 'Point', coordinates: [-95, 29] } }), 'School', mappings)).toThrow(/invalid/)
  })

  it('reads the county water-district layers by lowercase code and keeps only mud bodies', () => {
    const water = (code: string) => ({ type: 'Feature', properties: { code, name: 'x' }, geometry: { type: 'Polygon', coordinates: [ring] } })
    const map: BoundaryMapping[] = [{ code: '189', body_id: 'hcmud_489', type: 'mud' }, ...mappings]
    const result = stageHcadBoundaries(collection(water('189'), water('489'), water('001')), 'HCAD_MUD', map)
    expect(result.boundaries.map((b) => b.body_id)).toEqual(['hcmud_489'])
    expect(result.skippedFeatureCount).toBe(2)
  })
})
