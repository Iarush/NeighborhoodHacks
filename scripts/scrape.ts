// CLI: npm run scrape -- --source <id> [--mode rotation|near_term|results] [--meetings id1,id2] [--known <dir>]
//                       [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--out tmp/scrape] [--record]
// Results mode (Step 10) reads the known meetings and items from <dir>/meetings.json and <dir>/items.json
// (a saved rotation scrape) and writes result_updates.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { config as loadEnv } from 'dotenv';
import { DateTime } from 'luxon';
import { AdapterResultSchema, ItemSchema, MeetingSchema, type AdapterKind, type RunMode } from '@/lib/adapters/types';
import { loadAdapter } from '@/lib/ingest/adapters';
import { getSource } from '@/lib/ingest/registry';
import { ZONE, nearTermWindow, resultsWindow, rotationWindow } from '@/lib/ingest/normalize';

/** tests/golden/<folder>/ for --record. */
const GOLDEN_DIR: Record<AdapterKind, string> = {
  legistar: 'legistar',
  boardbook: 'boardbook',
  primegov: 'primegov',
  llm_extract: 'llm-extract',
  manual: 'manual',
  diligent: 'diligent',
  boarddocs: 'boarddocs',
  utilitytaxservice: 'utilitytaxservice',
  mud_agenda: 'mud-agenda',
};

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

export function parseCli(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: 'string' },
      mode: { type: 'string', default: 'rotation' },
      meetings: { type: 'string' },
      known: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      out: { type: 'string', default: 'tmp/scrape' },
      record: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!values.source) throw new Error('--source <id> is required');
  let mode: RunMode;
  if (values.mode === 'rotation') mode = { kind: 'rotation' };
  else if (values.mode === 'near_term') mode = { kind: 'near_term' };
  else if (values.mode === 'results') {
    const ids = (values.meetings ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) throw new Error('--mode results needs --meetings id1,id2');
    mode = { kind: 'results', meeting_external_ids: ids };
  } else throw new Error(`unknown --mode ${values.mode}`);
  if (values.known && mode.kind !== 'results') throw new Error('--known is only used with --mode results');
  return { source: values.source, mode, known: values.known, from: values.from, to: values.to, out: values.out!, record: values.record! };
}

export function windowFor(
  mode: RunMode,
  from: string | undefined,
  to: string | undefined,
  resultsMaxDays = 45,
): { from: Date; to: Date } {
  const base =
    mode.kind === 'near_term' ? nearTermWindow() : mode.kind === 'results' ? resultsWindow(resultsMaxDays) : rotationWindow();
  return {
    from: from ? DateTime.fromISO(from, { zone: ZONE }).startOf('day').toJSDate() : base.from,
    to: to ? DateTime.fromISO(to, { zone: ZONE }).endOf('day').toJSDate() : base.to,
  };
}

/** Known meetings and items for results mode, from a saved scrape directory. */
export function loadKnown(dir: string) {
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown;
  return { meetings: MeetingSchema.array().parse(read('meetings.json')), items: ItemSchema.array().parse(read('items.json')) };
}

async function main() {
  // GEMINI_* settings for llm_extract; a missing file just means no key (items are skipped with a warning).
  loadEnv({ path: '.env.local', quiet: true });
  let args: ReturnType<typeof parseCli>;
  try {
    args = parseCli(process.argv.slice(2));
  } catch (e) {
    fail(`scrape: ${(e as Error).message}`);
  }
  const source = getSource(args.source);
  const adapter = await loadAdapter(source.adapter);
  const maxDays = typeof source.config.results_max_days === 'number' ? source.config.results_max_days : 45;
  const window = windowFor(args.mode, args.from, args.to, maxDays);

  if (args.mode.kind === 'results' && args.known) args.mode.known = loadKnown(args.known);
  const result = AdapterResultSchema.parse(await adapter.run(source, args.mode, window));

  mkdirSync(args.out, { recursive: true });
  const write = (name: string, data: unknown) => writeFileSync(join(args.out, name), JSON.stringify(data, null, 2) + '\n');
  write('meetings.json', result.meetings);
  write('items.json', result.items);
  write('warnings.json', result.warnings);
  if (result.result_updates.length) write('result_updates.json', result.result_updates);

  if (args.record) {
    const dir = join('tests', 'golden', GOLDEN_DIR[source.adapter], source.id);
    mkdirSync(dir, { recursive: true });
    result.documents.forEach((d, i) => {
      const ext = d.kind === 'json' || d.kind === 'llm_output' ? 'json' : d.kind === 'html' ? 'html' : 'txt';
      writeFileSync(join(dir, `${String(i).padStart(3, '0')}-${d.content_hash.slice(0, 12)}.${ext}`), d.raw);
    });
    writeFileSync(
      join(dir, 'documents.index.json'),
      JSON.stringify(result.documents.map(({ raw: _raw, ...rest }) => rest), null, 2) + '\n',
    );
  }

  console.log(
    `${source.id}: meetings=${result.meetings.length} items=${result.items.length} ` +
      `result_updates=${result.result_updates.length} warnings=${result.warnings.length} -> ${args.out}`,
  );
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!);
if (isMain) {
  main().catch((e) => fail(`scrape: ${(e as Error).stack ?? e}`));
}
