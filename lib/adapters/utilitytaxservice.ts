import { load } from 'cheerio';
import { z } from 'zod';
import type { Adapter, AdapterResult, Meeting, RunMode, SourceConfig } from './types';
import { getText, type HttpOptions } from './http';
import { inWindow, parseDocDate } from './discover';
import { documentContentHash, sha1 } from '@/lib/ingest/hash';
import { toChicagoIso } from '@/lib/ingest/normalize';

// Utility Tax Service district listings (www.utilitytaxservice.com/DistrictDocsList/{district}).
// MUD rollout bucket M12. Inspected 2026-10-29:
//   The page has <base href="/">; each section is a Bootstrap card. The "Meeting Notices and
//   Agendas" card lists li.list-group-item > a[href="PDFViewerEx/{district}/{docId}"], with the
//   date as link text ("October 12, 2026", "10/20/2026") and an optional <small> label
//   ("Special Meeting - Internal", "Master", "Supplemental Agenda", "Cancelled - Master").
//   PDFViewerEx is a Syncfusion Blazor viewer: the PDF bytes arrive only over its SignalR
//   circuit, and no plain download URL exists. So this adapter is link-only: it records the
//   meeting date and the official viewer link, and never extracts items. Times stay 00:00.

export const UtilityTaxServiceConfigSchema = z.object({ district: z.string().regex(/^[A-Za-z0-9]+$/) }).loose();

export type UtilityTaxServiceDeps = { http?: HttpOptions };

export const SITE = 'https://www.utilitytaxservice.com/';
export const listUrl = (district: string) => `${SITE}DistrictDocsList/${district}`;

export const LINK_ONLY_WARNING = 'link_only: Utility Tax Service agendas open only in a viewer; items are never extracted';

export type ListedAgenda = { url: string; date: string; label: string };

/** Agenda links from the "Meeting Notices and Agendas" card, in page order. Undated links are skipped. */
export function parseAgendaList(html: string): ListedAgenda[] {
  const $ = load(html);
  const base = new URL($('base[href]').attr('href') ?? '/', SITE).toString();
  const card = $('.card')
    .filter((_, c) => /agendas/i.test($(c).children('.card-header').text()))
    .first();
  const out: ListedAgenda[] = [];
  card.find('a[href*="PDFViewerEx/"]').each((_, a) => {
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    const parsed = parseDocDate(text);
    if (!parsed?.day_known) return;
    const small = $(a).closest('li').find('small').text().replace(/\s+/g, ' ').trim();
    out.push({ url: new URL($(a).attr('href')!.trim(), base).toString(), date: parsed.date, label: `${text} ${small}`.trim() });
  });
  return out;
}

/** One agenda per date: the first that isn't the "Internal" copy, else the first listed. */
export function pickPerDate(listed: ListedAgenda[]): ListedAgenda[] {
  const byDate = new Map<string, ListedAgenda[]>();
  for (const l of listed) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
  return [...byDate.values()].map((group) => group.find((l) => !/internal/i.test(l.label)) ?? group[0]!);
}

export function mapMeeting(sourceId: string, bodyId: string, l: ListedAgenda): Meeting {
  return {
    external_id: sha1(sourceId + l.date),
    body_id: bodyId,
    date: toChicagoIso(l.date),
    type: /special|emergency/i.test(l.label) ? 'special' : 'regular',
    status: /cancel+ed/i.test(l.label) ? 'cancelled' : 'scheduled',
    agenda_url: l.url,
  };
}

export function createUtilityTaxServiceAdapter(deps: UtilityTaxServiceDeps = {}): Adapter {
  return {
    async run(source: SourceConfig, mode: RunMode, window): Promise<AdapterResult> {
      const result: AdapterResult = { meetings: [], items: [], documents: [], result_updates: [], warnings: [] };
      if (mode.kind === 'results') return result; // minutes are viewer-only too
      const { district } = UtilityTaxServiceConfigSchema.parse(source.config);
      const bodyId = source.body_id ?? source.id;
      const url = listUrl(district);
      const html = await getText(url, deps.http);
      result.documents.push({ url, fetched_at: new Date().toISOString(), content_hash: documentContentHash(html), raw: html, kind: 'html' });
      const picked = pickPerDate(parseAgendaList(html)).filter((l) => inWindow(l, window));
      result.meetings.push(...picked.map((l) => mapMeeting(source.id, bodyId, l)));
      if (picked.length) result.warnings.push(LINK_ONLY_WARNING);
      return result;
    },
  };
}

export const utilityTaxServiceAdapter: Adapter = createUtilityTaxServiceAdapter();
