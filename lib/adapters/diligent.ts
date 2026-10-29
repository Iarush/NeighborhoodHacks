import { load } from 'cheerio';
import { z } from 'zod';
import type { Adapter, AdapterResult, Meeting, RunMode, SourceConfig } from './types';
import { getJson, getText, type HttpOptions } from './http';
import { inWindow, parseDocDate } from './discover';
import { geminiFromEnv, modelsFromEnv, type GeminiModels, type LlmClient } from './gemini';
import { extractDocument } from './llmExtract';
import { pdfTextFromPages } from './pdfText';
import { stripHtml } from './legistar';
import { documentContentHash, sha1 } from '@/lib/ingest/hash';
import { toChicagoIso } from '@/lib/ingest/normalize';

// Diligent Community portal adapter (<portal>.diligent.community). Used by humble_isd_board.
// Endpoints (inspected 2026-10-28; the portal page's own scripts call them):
//   listing: /Portal/MeetingTypeList.aspx, a.list-link -> MeetingInformation.aspx?Id={id},
//     text "{Meeting name} - Oct 20 2026"
//   /Services/MeetingsService.svc/meetings/{id}/meetingData -> { Name, Time: "05:00 PM", ... }
//   /Services/MeetingsService.svc/meetings/{id}/meetingDocuments -> { Documents: [{ Type, IsPublic,
//     Format, Html, Id, LastModified }] }. Type 1 = agenda, 2 = minutes. The public agenda is the
//     HTML document; its text comes inline in Html. The agenda PDF is not public.

export const DiligentConfigSchema = z.object({ portal: z.string().regex(/^[a-z0-9-]+$/) }).loose();

export type DiligentDeps = {
  http?: HttpOptions;
  now?: () => Date;
  /** null = no key (items are skipped with a warning). Default: geminiFromEnv() at run time. */
  llm?: LlmClient | null;
  models?: GeminiModels;
};

export const portalBase = (portal: string) => `https://${portal}.diligent.community`;

export type ListedMeeting = { id: string; name: string; date: string };

export function parseMeetingList(html: string): ListedMeeting[] {
  const $ = load(html);
  const out = new Map<string, ListedMeeting>();
  $('a.list-link[href*="MeetingInformation.aspx"]').each((_, a) => {
    const id = $(a).attr('href')?.match(/[?&]Id=(\d+)/i)?.[1];
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    const parsed = parseDocDate(text);
    if (!id || !parsed || out.has(id)) return;
    out.set(id, { id, name: text.replace(/\s+-\s+[A-Z][a-z]{2} \d{1,2} \d{4}$/, ''), date: parsed.date });
  });
  return [...out.values()];
}

export type MeetingData = { Name?: string; Time?: string };
export type MeetingDocument = { Type: number; IsPublic: boolean; Format?: string; Html?: string; Id: number; LastModified?: number };

/** The public agenda text, or undefined when the portal hasn't released one. */
export function publicAgenda(docs: MeetingDocument[]): { id: number; text: string } | undefined {
  const d = docs.find((x) => x.Type === 1 && x.IsPublic && x.Html && x.Html.trim());
  return d ? { id: d.Id, text: stripHtml(d.Html!) } : undefined;
}

export function mapMeeting(sourceId: string, bodyId: string, portal: string, l: ListedMeeting, data: MeetingData): Meeting {
  const name = data.Name ?? l.name;
  return {
    external_id: sha1(`${sourceId}:${l.id}`),
    body_id: bodyId,
    date: toChicagoIso(l.date, data.Time?.trim() || undefined),
    type: /special|called|emergency/i.test(name) ? 'special' : 'regular',
    status: /cancel+ed/i.test(name) ? 'cancelled' : 'scheduled',
    agenda_url: `${portalBase(portal)}/Portal/MeetingInformation.aspx?Id=${l.id}`,
  };
}

export function createDiligentAdapter(deps: DiligentDeps = {}): Adapter {
  return {
    async run(source: SourceConfig, mode: RunMode, window, prev): Promise<AdapterResult> {
      const result: AdapterResult = { meetings: [], items: [], documents: [], result_updates: [], warnings: [] };
      if (mode.kind === 'results') return result; // no minutes reader yet
      const { portal } = DiligentConfigSchema.parse(source.config);
      const bodyId = source.body_id ?? source.id;
      const base = portalBase(portal);
      const now = (deps.now ?? (() => new Date()))();
      const llm = deps.llm === undefined ? geminiFromEnv() : deps.llm;
      const models = deps.models ?? modelsFromEnv();
      const stamp = () => new Date().toISOString();

      const listUrl = `${base}/Portal/MeetingTypeList.aspx`;
      const html = await getText(listUrl, deps.http);
      result.documents.push({ url: listUrl, fetched_at: stamp(), content_hash: documentContentHash(html), raw: html, kind: 'html' });
      const listed = parseMeetingList(html).filter((l) => inWindow(l, window));
      if (!llm && listed.length) {
        result.warnings.push('llm_unavailable: no OPENROUTER_API_KEY or GEMINI_API_KEY is set; agenda items were not extracted');
      }

      for (const l of listed) {
        const svc = `${base}/Services/MeetingsService.svc/meetings/${l.id}`;
        let data: MeetingData;
        let docs: MeetingDocument[];
        try {
          data = await getJson<MeetingData>(`${svc}/meetingData`, deps.http);
          docs = (await getJson<{ Documents?: MeetingDocument[] }>(`${svc}/meetingDocuments`, deps.http)).Documents ?? [];
        } catch (e) {
          result.warnings.push(`meeting ${l.id}: fetch failed: ${(e as Error).message}`);
          continue;
        }
        const meeting = mapMeeting(source.id, bodyId, portal, l, data);
        result.meetings.push(meeting);
        const agenda = publicAgenda(docs);
        if (!agenda) {
          result.warnings.push(`meeting ${l.id}: no public agenda yet`);
          continue;
        }
        const url = `${base}/document/${agenda.id}`;
        const hash = documentContentHash(agenda.text);
        if (prev?.documentHashes[url] === hash) continue; // D11: unchanged since last run
        result.documents.push({ url, fetched_at: stamp(), content_hash: hash, raw: agenda.text, kind: 'html' });
        if (!llm) continue;
        const out = await extractDocument({
          source_id: source.id,
          body_id: bodyId,
          url,
          pdf: new Uint8Array(),
          // HTML agenda: always a text layer, never sent to the model as (empty) PDF bytes.
          text: { ...pdfTextFromPages([agenda.text], hash), has_text_layer: true },
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

export const diligentAdapter: Adapter = createDiligentAdapter();
