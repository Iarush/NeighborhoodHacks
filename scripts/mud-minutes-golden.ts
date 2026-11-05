import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASES, DIR, minutesCase } from '../tests/golden/mud-minutes/fixtures';

// Print or rewrite the mud_agenda minutes golden set (tests/golden/mud-minutes/README.md).
//   npx tsx scripts/mud-minutes-golden.ts --print    show every case's outcomes
//   npx tsx scripts/mud-minutes-golden.ts --expect   rewrite expected.json from the parser (then read the diff)

const mode = process.argv.includes('--expect') ? 'expect' : 'print';
for (const name of CASES) {
  const c = minutesCase(name);
  if (mode === 'expect') {
    writeFileSync(join(DIR, name, 'expected.json'), `${JSON.stringify(c.actual, null, 2)}\n`);
    console.log(`${name}: wrote ${c.actual.updates.length} updates`);
    continue;
  }
  console.log(`\n== ${name} (${c.meta.firm}, ${c.meta.text}): ${c.actual.matched} of ${c.actual.voted} voted sections`);
  for (const u of c.actual.updates) console.log(`  ${u.agenda_number ?? '?'} ${u.action}: ${u.source_quote.replace(/\s+/g, ' ').slice(0, 110)}`);
  for (const w of c.actual.warnings) console.log(`  ! ${w}`);
}
