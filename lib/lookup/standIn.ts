import type { BodyType } from '@/lib/contracts/bodyTypes'
import type { CensusMatch } from './census'

// TEMPORARY stand-in for P1's address lookup (Technical Plan §3-§4).
//
// P1's real lookup reads HCAD parcels and GIS boundaries; this only has what the Census
// Geocoder reports (county, city, school district), so it finds the bodies that come from
// those and nothing else: no MUDs, ESDs, water authorities, METRO or HOA. Replace it by
// pointing app/api/lookup/route.ts at P1's code. The ids below are the slugs already used
// in data/sources.yaml.

export type StandInBody = {
  id: string
  name: string
  type: BodyType
  category: 'tracked' | 'not_government'
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** "Houston Independent School District" -> "Houston ISD" */
const shortSchool = (name: string) => name.replace(/\s+Independent School District$/i, ' ISD').replace(/\s+Consolidated Independent School District$/i, ' CISD')

/** The body ID for a Census school-district name, e.g. "Katy Independent School District" -> "katy_isd_board". */
export const schoolBoardId = (censusName: string) => KNOWN_SCHOOLS[censusName]?.id ?? `${slug(shortSchool(censusName))}_board`

const KNOWN_SCHOOLS: Record<string, { id: string; college?: StandInBody }> = {
  'Houston Independent School District': {
    id: 'hisd_board',
    college: { id: 'hcc_board', name: 'Houston Community College Board of Trustees', type: 'college_board', category: 'tracked' },
  },
  'Cypress-Fairbanks Independent School District': {
    id: 'cfisd_board',
    college: { id: 'lone_star_board', name: 'Lone Star College Board of Trustees', type: 'college_board', category: 'tracked' },
  },
}

export function bodiesFromCensus(match: CensusMatch): StandInBody[] {
  const bodies: StandInBody[] = []
  if (match.place) {
    const city = match.place.replace(/\s+city$/i, '')
    bodies.push({
      id: city.toLowerCase() === 'houston' ? 'houston_city_council' : `${slug(city)}_city_council`,
      name: `${city} City Council`,
      type: 'city_council',
      category: 'tracked',
    })
  }
  bodies.push({ id: 'commissioners_court', name: 'Harris County Commissioners Court', type: 'commissioners_court', category: 'tracked' })
  bodies.push({ id: 'flood_control', name: 'Harris County Flood Control District', type: 'flood_control', category: 'tracked' })
  bodies.push({ id: 'port_houston', name: 'Port of Houston Authority', type: 'port', category: 'tracked' })
  if (match.schoolDistrict) {
    const known = KNOWN_SCHOOLS[match.schoolDistrict]
    bodies.push({
      id: schoolBoardId(match.schoolDistrict),
      name: `${shortSchool(match.schoolDistrict)} Board`,
      type: 'school_board',
      category: 'tracked',
    })
    if (known?.college) bodies.push(known.college)
  }
  bodies.push({ id: 'hcad', name: 'Harris Central Appraisal District', type: 'hcad', category: 'tracked' })
  return bodies
}

/** CenterPoint is always listed as "not a government, but affects you" (Project_Plan.md). */
export const NOT_GOVERNMENT: StandInBody[] = [{ id: 'centerpoint', name: 'CenterPoint Energy', type: 'other', category: 'not_government' }]
