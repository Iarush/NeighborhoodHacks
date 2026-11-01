import { describe, expect, it } from 'vitest'
import { packHcadLoad, parseHcadStaging, planHcadLoad } from '@/lib/lookup/hcadStaging'
import { csvCell, hcadAccountFromRaw, hcadHeader, hcadJurisdictionFromRaw, parseHcadTsvRow, parseHcadTsvRowLoose } from '@/lib/lookup/hcadSource'

const parcels = (rows: string[]) => [
  'account,site_address_norm,legal_description,longitude,latitude',
  ...rows,
].join('\r\n')
const jurisdictions = (rows: string[]) => ['account,hcad_code', ...rows].join('\n')

describe('parseHcadStaging', () => {
  it('keeps only the approved parcel fields, associates jurisdictions, and handles CSV quotes/newlines', () => {
    const result = parseHcadStaging(
      '\uFEFF' + parcels(['1000000000001,"123 Main Street, Houston, TX 77004","LOT 1,\nBLOCK 2",-95.37,29.73']),
      jurisdictions(['1000000000001,189']),
      new Set(['189']),
    )
    expect(result).toEqual({
      parcels: [{ account: '1000000000001', site_address_norm: '123 MAIN ST', legal_description: 'LOT 1,\nBLOCK 2', longitude: -95.37, latitude: 29.73, jurisdiction_codes: ['189'] }],
      ambiguousAddressCount: 0,
      unmappedCodes: [],
    })
    expect(JSON.stringify(result)).not.toMatch(/owner|mailing|private/i)
  })

  it('reports duplicate normalized addresses and unmapped jurisdiction codes for operator review', () => {
    const result = parseHcadStaging(
      parcels([
        '1000000000001,123 Main St,, -95.37,29.73',
        '1000000000002,"123 MAIN STREET",,-95.37,29.73',
      ]),
      jurisdictions(['1000000000001,189', '1000000000002,999']),
      new Set(['189']),
    )
    expect(result.ambiguousAddressCount).toBe(1)
    expect(result.unmappedCodes).toEqual(['999'])
  })

  it('plans a load that keeps shared addresses and unmapped codes, and skips parcels with no tax codes', () => {
    const stage = parseHcadStaging(
      parcels([
        '1000000000001,123 Main St,,,',
        '1000000000002,123 Main Street,,,',
        '1000000000003,9 Elm St,,,',
      ]),
      jurisdictions(['1000000000001,189', '1000000000001,043', '1000000000002,189', '1000000000002,043']),
      new Set(['189']),
    )
    const plan = planHcadLoad(stage)
    expect(plan.parcels.map((p) => p.account)).toEqual(['1000000000001', '1000000000002'])
    expect(plan.skippedWithoutCodes).toBe(1)
    expect(plan.sharedAddressCount).toBe(1)
    expect(plan.unmappedCodes).toEqual(['043'])
  })

  it.each([
    ['invalid account/address', parcels(['abc,No address,,,-']), jurisdictions([])],
    ['duplicate account', parcels(['1000000000001,123 Main St,,,-', '1000000000001,124 Main St,,,-']), jurisdictions([])],
    ['partial coordinate pair', parcels(['1000000000001,123 Main St,,-95.37,']), jurisdictions([])],
    ['outside-county coordinates', parcels(['1000000000001,123 Main St,,-100,40']), jurisdictions([])],
    ['orphan jurisdiction rows', parcels(['1000000000001,123 Main St,,,-']), jurisdictions(['1000000000002,189'])],
    ['malformed CSV quote', parcels(['1000000000001,12"3 Main St,,,-']), jurisdictions([])],
  ])('rejects %s', (_name, parcelCsv, jurisdictionCsv) => {
    expect(() => parseHcadStaging(parcelCsv, jurisdictionCsv, new Set())).toThrow()
  })
})

describe('HCAD source field conversion', () => {
  it('maps only the documented site address/legal fields and filters to selected ZIPs', () => {
    expect(hcadAccountFromRaw({
      acct: '1000000000001', site_addr_1: '123 Main Street', site_addr_2: 'Houston', site_addr_3: '77004',
      lgl_1: 'LOT 1', lgl_2: 'BLOCK 2', owner_name: 'must not be retained', mail_addr_1: 'must not be retained',
    }, new Set(['77004']))).toEqual({
      account: '1000000000001', site_address_norm: '123 MAIN ST', legal_description: 'LOT 1\nBLOCK 2', zip: '77004',
    })
    expect(hcadAccountFromRaw({ acct: '1000000000001', site_addr_1: '123 Main Street', site_addr_2: 'Houston', site_addr_3: '77433' }, new Set(['77004']))).toBeNull()
  })

  it('tolerates malformed rows in the big HCAD export: pads short rows, skips long ones, never throws', () => {
    const header = ['acct', 'site_addr_1', 'site_addr_2', 'site_addr_3', 'lgl_1']
    expect(parseHcadTsvRowLoose('1000000000001\t123 Main St\tHouston\t77004\tLOT 1', header)).toEqual({
      status: 'ok',
      row: { acct: '1000000000001', site_addr_1: '123 Main St', site_addr_2: 'Houston', site_addr_3: '77004', lgl_1: 'LOT 1' },
    })
    expect(parseHcadTsvRowLoose('1000000000002\t9 Elm St\tHouston\t77004', header)).toEqual({
      status: 'padded',
      row: { acct: '1000000000002', site_addr_1: '9 Elm St', site_addr_2: 'Houston', site_addr_3: '77004', lgl_1: '' },
    })
    expect(parseHcadTsvRowLoose('1000000000003\t1 A St\tHouston\t77004\tLOT\textra', header)).toEqual({ status: 'skipped', row: null })
  })

  it('requires HCAD header fields, parses tab fields without logging, and filters jurisdiction rows by account', () => {
    const header = hcadHeader('acct\tsite_addr_1\tsite_addr_2\tsite_addr_3\tlgl_1\tlgl_2\tlgl_3\tlgl_4', ['acct', 'site_addr_1'], 'HCAD real_acct.txt')
    expect(parseHcadTsvRow('1000000000001\t123 Main St\tHouston\t77004\tLOT 1\t\t\t', header, 'HCAD real_acct.txt').acct).toBe('1000000000001')
    expect(hcadJurisdictionFromRaw({ acct: '1000000000001', tax_district: '189' }, new Set(['1000000000001']))).toEqual({ account: '1000000000001', hcad_code: '189' })
    expect(hcadJurisdictionFromRaw({ acct: '1000000000002', tax_district: '189' }, new Set(['1000000000001']))).toBeNull()
    expect(csvCell('LOT "A", BLOCK 2')).toBe('"LOT ""A"", BLOCK 2"')
    expect(() => hcadHeader('acct\tacct', ['acct'], 'input')).toThrow()
    expect(() => parseHcadTsvRow('a\tb', ['acct'], 'input')).toThrow()
  })
})

describe('packHcadLoad', () => {
  it('folds condo accounts with one code set into one row and keeps only the subdivision', () => {
    const plan = planHcadLoad(parseHcadStaging(
      parcels([
        '1000000000001,100 Main St,LOT 1 BLK 2 MAIN PLACE SEC 3,-95.37,29.73',
        '1000000000002,100 Main St,,-95.37,29.73',
        '1000000000003,100 Main St,LOT 4 MAIN PLACE,,',
        '1000000000004,200 Oak St,LT 9 OAK HOLLOW,,',
      ]),
      jurisdictions(['1000000000001,189', '1000000000001,001', '1000000000002,001', '1000000000002,189', '1000000000003,001', '1000000000004,001']),
      new Set(['001', '189']),
    ))
    const rows = packHcadLoad(plan)
    expect(rows).toEqual([
      { address: '100 MAIN ST', codes: ['001', '189'], subdivision: 'MAIN PLACE' },
      { address: '100 MAIN ST', codes: ['001'], subdivision: 'MAIN PLACE' },
      { address: '200 OAK ST', codes: ['001'], subdivision: 'OAK HOLLOW' },
    ])
    expect(JSON.stringify(rows)).not.toMatch(/1000000000/)
  })
})
