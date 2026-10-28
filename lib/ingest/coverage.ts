// Which bodies we read agendas for (district coverage plan 0.6). A body is covered when a row in
// the `sources` table names it, directly or through section_body_map (one Legistar feed can write
// several bodies). A listed body with no source shows "We don't read this board's agendas yet".

export type SourceCoverageRow = { body_id: string | null; config: unknown };

export function bodiesWithAgendaSource(sources: readonly SourceCoverageRow[]): Set<string> {
  const covered = new Set<string>();
  for (const source of sources) {
    if (source.body_id) covered.add(source.body_id);
    const config = source.config && typeof source.config === 'object' ? (source.config as Record<string, unknown>) : {};
    const map = config.section_body_map;
    if (map && typeof map === 'object') {
      for (const id of Object.values(map as Record<string, unknown>)) if (typeof id === 'string') covered.add(id);
    }
  }
  return covered;
}

/** Only governing boards get the notice; "other" (CenterPoint and the like) holds no public meetings we'd read. */
export function agendaCoverage(type: string | null, bodyId: string, covered: ReadonlySet<string>): 'reading' | 'not_yet' | null {
  if (!type || type === 'other') return null;
  return covered.has(bodyId) ? 'reading' : 'not_yet';
}
