// Builds the mud_agenda golden set (mud-code-parser-spec §7 Phase 1) in tests/golden/mud-agenda/.
//
//   npx tsx scripts/mud-agenda-golden.ts --record    copy agenda text from the Phase 0 survey
//                                                    (tmp/survey/agenda-pdfs/) into new case folders
//   npx tsx scripts/mud-agenda-golden.ts --expect    (re)write expected.json from the parser's output
//   npx tsx scripts/mud-agenda-golden.ts --print     show each case's items, to check them by hand
//
// Each case folder holds agenda.txt (pages joined with \f), meta.json and expected.json. After
// --expect, review the diff of every expected.json by hand before committing: the golden set is
// only useful if a person has read it against the agenda.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { goldenCase, type GoldenMeta } from '@/tests/golden/mud-agenda/fixtures';

const DIR = join('tests', 'golden', 'mud-agenda');
const SURVEY = join('tmp', 'survey', 'agenda-pdfs');

/** [source id, index of the document in the survey file (0 = newest), why it's in the set]. */
const CASES: [string, number, string][] = [
  // ABHR
  ['emerald_forest_ud', 0, 'ABHR: disability notice repeated as a page header'],
  ['hcmud_285', 0, 'ABHR'],
  ['hcmud_422', 0, 'ABHR'],
  ['hcmud_383', 0, 'ABHR: list not numbered on the text layer'],
  // Schwartz, Page & Harding
  ['hcmud_489', 0, 'SPH: HC MUD 489 (demo MUD) Oct 19'],
  ['hcmud_489', 1, 'SPH: HC MUD 489 Sep 21'],
  ['hcmud_418', 0, 'SPH'],
  ['hcmud_284', 0, 'SPH: a nested 1./2. list inside an item'],
  ['hcmud_370', 0, 'SPH: jumbled reading order (needs rung 2)'],
  // Coats Rose
  ['hcmud_102', 0, 'Coats Rose: "(SEAL)" at the top of page 2, "26 OCTOBER 2026" date'],
  ['hcmud_565', 0, 'Coats Rose'],
  ['woodcreek_mud', 0, 'Coats Rose'],
  ['kleinwood_mud', 0, 'Coats Rose: numbers in a column of their own (needs rung 2)'],
  // Radcliffe Bobbitt
  ['klein_pud', 0, 'Radcliffe Bobbitt'],
  ['hcwcid_156', 0, 'Radcliffe Bobbitt'],
  ['sunbelt_fwsd', 0, 'Radcliffe Bobbitt: OCR-layer date "November S, 2026"'],
  // Norton Rose Fulbright
  ['clear_brook_city_mud', 0, 'Norton Rose: a heading line inside the list'],
  ['hcmud_189', 0, 'Norton Rose'],
  ['hcmud_109', 0, 'Norton Rose'],
  // Johnson Petrov
  ['champions_mud', 0, 'Johnson Petrov: capital-letter sub-items'],
  ['hcwcid_70', 0, 'Johnson Petrov: §551 paragraph inside the Executive Session item'],
  ['hcwcid_36', 0, 'Johnson Petrov'],
  // Unnamed firms (template evidence only)
  ['hcmud_248', 0, 'Unnamed firm (matter IDs): no punctuation, signature with no marker'],
  ['hcmud_155', 0, 'Unnamed firm (matter IDs): consent + regular agenda, numbering restarts'],
  ['whcmud_10', 0, 'Unnamed firm (initials header): no closing boilerplate at all'],
  ['bammel_ud', 0, 'Unnamed firm (initials header)'],
  // Not identified
  ['hcmud_105', 0, 'Not identified'],
  ['weston_mud', 0, 'Not identified'],
  ['cypress_klein_ud', 0, 'Not identified'],
  ['sagemeadow_ud', 0, 'Not identified: special meeting'],
  ['shasla_pud', 0, 'Not identified'],
  ['charterwood_mud', 0, 'Not identified: special session, "November 9,2026"'],
  // Special meetings with 1-2 items
  ['pine_village_pud', 1, 'Special meeting, 2 items'],
  ['hcmud_230', 1, 'Special meeting, 2 items'],
  ['mission_bend_mud_1', 1, 'Special meeting, 1 item'],
  // Others
  ['bridgestone_mud', 0, 'Polley Garza: consent agenda with nested numbering'],
  ['sheldon_road_mud', 0, 'Roach: disability notice at the top of page 2, mid-item'],
];

function caseId(source: string, date: string) {
  return `${source}-${date}`;
}

function record() {
  for (const [source, index, note] of CASES) {
    const file = join(SURVEY, `${source}.json`);
    if (!existsSync(file)) {
      console.error(`${source}: ${file} missing (run npm run survey:agendas first)`);
      continue;
    }
    const doc = JSON.parse(readFileSync(file, 'utf8')).texts?.[index];
    if (!doc) {
      console.error(`${source}: no document ${index}`);
      continue;
    }
    const dir = join(DIR, caseId(source, doc.date));
    if (existsSync(join(dir, 'agenda.txt'))) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'agenda.txt'), doc.pages.join('\f'));
    const meta: GoldenMeta = { source_id: source, url: doc.url, date: doc.date, type: 'regular', note, recorded_at: '2026-11-04', text: 'pdf text layer' };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
    console.log(`recorded ${dir}`);
  }
}

function cases(): string[] {
  return readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(DIR, d.name, 'agenda.txt')))
    .map((d) => d.name)
    .sort();
}

const { values } = parseArgs({ options: { record: { type: 'boolean' }, expect: { type: 'boolean' }, print: { type: 'boolean' }, only: { type: 'string' } } });
if (values.record) record();
for (const name of cases()) {
  if (values.only && !name.startsWith(values.only)) continue;
  const c = goldenCase(join(DIR, name));
  if (values.expect) writeFileSync(join(DIR, name, 'expected.json'), JSON.stringify(c.actual, null, 2) + '\n');
  if (values.print) {
    console.log(`\n=== ${name} [${c.actual.profile}] ok=${c.actual.ok} ${c.actual.reasons.join(' | ')}`);
    console.log(`    ${JSON.stringify(c.actual.meeting)}`);
    for (const i of c.actual.items) console.log(`#${i.agenda_number} ${i.title}${i.description ? '\n      ' + i.description.replace(/\n/g, '\n      ') : ''}`);
  }
}
