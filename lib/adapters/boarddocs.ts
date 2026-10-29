import { DateTime } from 'luxon';
import { z } from 'zod';
import type { Adapter, AdapterResult, Meeting, RunMode, SourceConfig } from './types';
import { getText, type HttpOptions } from './http';
import { inWindow } from './discover';
import { geminiFromEnv, modelsFromEnv, type GeminiModels, type LlmClient } from './gemini';
import { extractDocument } from './llmExtract';
import { pdfTextFromPages } from './pdfText';
import { stripHtml } from './legistar';
import { documentContentHash, sha1 } from '@/lib/ingest/hash';
import { ZONE, toChicagoIso } from '@/lib/ingest/normalize';

// BoardDocs public-view adapter (go.boarddocs.com/{state}/{site}/Board.nsf). Used by katy_isd_board.
// Endpoints (inspected 2026-10-28; the public page's own scripts call them, both POST):
//   BD-GetMeetingsList?open  current_committee_id={id} -> [{ unique, name, numberdate: "20261026" }]
//   PRINT-AgendaDetailed     id={unique}&current_committee_id={id} -> the whole agenda as HTML,
//     opening with "Monday, October 26, 2026 Regular Board Meeting Agenda OPEN MEETING: 5:00 P.M."

export const BoardDocsConfigSchema = z
  .object({
    state: z.string().regex(/^[a-z]{2}$/),
    site: z.string().regex(/^[a-z0-9-]+$/),
    committee_id: z.string().regex(/^[A-Z0-9]+$/),
  })
  .loose();

export type BoardDocsDeps = {
  http?: HttpOptions;
  now?: () => Date;
  /** null = no key (items are skipped with a warning). Default: geminiFromEnv() at run time. */
  llm?: LlmClient | null;
  models?: GeminiModels;
};

export const boardDocsBase = (state: string, site: string) => `https://go.boarddocs.com/${state}/${site}/Board.nsf`;

export type ListedMeeting = { unique: string; name: string; date: string };

export function parseMeetingsList(json: string): ListedMeeting[] {
  const rows = JSON.parse(json) as { unique?: string; name?: string; numberdate?: string }[];
  return rows.flatMap((r) => {
    const d = r.numberdate ? DateTime.fromFormat(r.numberdate, 'yyyyMMdd', { zone: ZONE }) : null;
    return r.unique && d?.isValid ? [{ unique: r.unique, name: (r.name ?? '').trim(), date: d.toISODate()! }] : [];
  });
}

/** The first clock time in the agenda's opening lines ("OPEN MEETING: 5:00 P.M."). */
export function agendaTime(text: string): string | undefined {
  const m = text.slice(0, 600).match(/(\d{1,2}:\d{2})\s*([AP])\.?\s*M\.?/i);
  return m ? `${m[1]} ${m[2]!.toUpperCase()}M` : undefined;
}

export function mapMeeting(sourceId: string, bodyId: string, base: string, l: ListedMeeting, time?: string): Meeting {
  return {
    external_id: sha1(`${sourceId}:${l.unique}`),
    body_id: bodyId,
    date: toChicagoIso(l.date, time),
    type: /special|called|emergency/i.test(l.name) ? 'special' : 'regular',
    status: /cancel+ed/i.test(l.name) ? 'cancelled' : 'scheduled',
    agenda_url: `${base}/goto?open&id=${l.unique}`,
  };
}

export function createBoardDocsAdapter(deps: BoardDocsDeps = {}): Adapter {
  return {
    async run(source: SourceConfig, mode: RunMode, window, prev): Promise<AdapterResult> {
      const result: AdapterResult = { meetings: [], items: [], documents: [], result_updates: [], warnings: [] };
      if (mode.kind === 'results') return result; // no minutes reader yet
      const cfg = BoardDocsConfigSchema.parse(source.config);
      const bodyId = source.body_id ?? source.id;
      const base = boardDocsBase(cfg.state, cfg.site);
      const now = (deps.now ?? (() => new Date()))();
      const llm = deps.llm === undefined ? geminiFromEnv() : deps.llm;
      const models = deps.models ?? modelsFromEnv();
      const stamp = () => new Date().toISOString();

      const listUrl = `${base}/BD-GetMeetingsList?open`;
      const json = await getText(listUrl, { ...deps.http, form: { current_committee_id: cfg.committee_id } });
      result.documents.push({ url: `${listUrl}#committee=${cfg.committee_id}`, fetched_at: stamp(), content_hash: documentContentHash(json), raw: json, kind: 'json' });
      const listed = parseMeetingsList(json).filter((l) => inWindow(l, window));
      if (!llm && listed.length) {
        result.warnings.push('llm_unavailable: no OPENROUTER_API_KEY or GEMINI_API_KEY is set; agenda items were not extracted');
      }

      for (const l of listed) {
        const printUrl = `${base}/PRINT-AgendaDetailed`;
        let text: string;
        try {
          const html = await getText(printUrl, { ...deps.http, form: { id: l.unique, current_committee_id: cfg.committee_id } });
          text = stripHtml(html);
        } catch (e) {
          result.warnings.push(`meeting ${l.unique}: fetch failed: ${(e as Error).message}`);
          continue;
        }
        const meeting = mapMeeting(source.id, bodyId, base, l, agendaTime(text));
        result.meetings.push(meeting);
        const url = `${printUrl}#id=${l.unique}`;
        const hash = documentContentHash(text);
        if (prev?.documentHashes[url] === hash) continue; // D11: unchanged since last run
        result.documents.push({ url, fetched_at: stamp(), content_hash: hash, raw: text, kind: 'html' });
        if (!llm) continue;
        const out = await extractDocument({
          source_id: source.id,
          body_id: bodyId,
          url: meeting.agenda_url,
          pdf: new Uint8Array(),
          // HTML agenda: always a text layer, never sent to the model as (empty) PDF bytes.
          text: { ...pdfTextFromPages([text], hash), has_text_layer: true },
          known: meeting,
          llm,
          models,
          now,
        });
        result.documents.push(...out.documents);
        result.warnings.push(...out.warnings);
        result.items.push(...out.items.map((i) => ({ ...i, meeting_external_id: meeting.external_id })));
      }
      return result;
    },
  };
}

export const boardDocsAdapter: Adapter = createBoardDocsAdapter();
