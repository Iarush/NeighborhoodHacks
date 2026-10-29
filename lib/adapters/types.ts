import { z } from 'zod';

// Shared P2 types (agent-scraper-spec §5.1). Each type has a zod schema; the TS
// type is inferred from it so the two can never drift.

export const MeetingSchema = z.object({
  external_id: z.string().min(1),
  body_id: z.string().min(1),
  date: z.string().min(1), // ISO 8601 with America/Chicago offset
  end_date: z.string().optional(),
  type: z.enum(['regular', 'special']),
  status: z.enum(['scheduled', 'cancelled']),
  agenda_url: z.string(),
  source_url_es: z.string().optional(),
  video_url: z.string().optional(),
  minutes_url: z.string().optional(),
  comment_rules_text: z.string().optional(),
  /** D18: true only for the team's fake demo data (manual YAML). Absent = false. */
  is_demo: z.boolean().optional(),
});
export type Meeting = z.infer<typeof MeetingSchema>;

export const AmountSchema = z.object({
  value: z.number(),
  text: z.string(), // exact substring the value came from
  kind: z.literal('rate').optional(), // §5.6: tax rates
});
export type Amount = z.infer<typeof AmountSchema>;

export const VoteResultSchema = z.enum(['passed', 'failed', 'no_action']);
export const ItemStatusSchema = z.enum(['upcoming', 'awaiting_result', 'decided']);

export const ItemSchema = z.object({
  external_id: z.string().min(1),
  meeting_external_id: z.string().min(1),
  body_id: z.string().min(1),
  agenda_number: z.string().optional(),
  title: z.string().min(1),
  section: z.string().optional(),
  description: z.string().optional(),
  matter_type: z.string().optional(),
  status: ItemStatusSchema,
  action: z.string().optional(),
  vote_result: VoteResultSchema.optional(),
  amounts: z.array(AmountSchema),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })),
  contains_private_person: z.boolean(),
  source_url: z.string().min(1),
  source_quote: z.string().optional(),
  quote_verified: z.boolean().optional(),
  /** D18: true only for the team's fake demo data (manual YAML). Absent = false. */
  is_demo: z.boolean().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const ResultUpdateSchema = z.object({
  meeting_external_id: z.string().min(1),
  item_external_id: z.string().min(1),
  action: z.string(),
  vote_result: VoteResultSchema,
  source_url: z.string().min(1),
  source_quote: z.string().optional(),
  quote_verified: z.boolean().optional(),
});
export type ResultUpdate = z.infer<typeof ResultUpdateSchema>;

export const DocumentSchema = z.object({
  url: z.string(),
  fetched_at: z.string(),
  content_hash: z.string(),
  raw: z.string(),
  kind: z.enum(['json', 'html', 'pdf_text', 'llm_output']),
});
export type AdapterDocument = z.infer<typeof DocumentSchema>;

export const AdapterResultSchema = z.object({
  meetings: z.array(MeetingSchema),
  items: z.array(ItemSchema),
  documents: z.array(DocumentSchema),
  result_updates: z.array(ResultUpdateSchema),
  warnings: z.array(z.string()),
});
export type AdapterResult = z.infer<typeof AdapterResultSchema>;

export type RunMode =
  | { kind: 'rotation' } // today → +30 days
  | { kind: 'near_term' } // now → +72 hours
  | {
      kind: 'results';
      meeting_external_ids: string[];
      /** Step 10: the stored meetings and items of those meetings (Phase 1: a saved scrape's JSON; Phase 2: the DB). */
      known?: { meetings: Meeting[]; items: Item[] };
    };

export const AdapterKindSchema = z.enum(['legistar', 'boardbook', 'primegov', 'llm_extract', 'manual', 'diligent', 'boarddocs', 'utilitytaxservice']);
export type AdapterKind = z.infer<typeof AdapterKindSchema>;

// §5.2 source registry entry. `config` is adapter-specific and validated by each adapter.
export const SourceConfigSchema = z.object({
  id: z.string().min(1),
  body_id: z.string().min(1).optional(), // manual sources carry body_id per file
  adapter: AdapterKindSchema,
  config: z.record(z.string(), z.unknown()).default({}),
});
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

export interface Adapter {
  run(
    source: SourceConfig,
    mode: RunMode,
    window: { from: Date; to: Date },
    prev?: { documentHashes: Record<string, string> },
  ): Promise<AdapterResult>;
}

// D26: news is a separate type and module. Not an Adapter, not part of AdapterResult.
export const NewsMentionSchema = z.object({
  external_id: z.string().min(1),
  outlet: z.string(),
  headline: z.string(),
  url: z.string(),
  published_at: z.string(),
  body_ids: z.array(z.string()),
  matched_terms: z.array(z.string()),
  forward_looking: z.boolean(),
});
export type NewsMention = z.infer<typeof NewsMentionSchema>;
export const NewsResultSchema = z.object({ mentions: z.array(NewsMentionSchema), warnings: z.array(z.string()) });
export type NewsResult = z.infer<typeof NewsResultSchema>;

// D27–D30 (v1.3)
export const NewsArticleSchema = z.object({
  external_id: z.string().min(1),
  outlet: z.string(),
  url: z.string(),
  headline: z.string(),
  published_at: z.string(),
  feed_updated_at: z.string().optional(),
  fetched_at: z.string(),
  text: z.string().optional(),
  word_count: z.number(),
  content_hash: z.string(),
  content_type: z.enum(['news', 'explainer']),
  status: z.enum(['ok', 'opinion_excluded', 'robots_blocked', 'paywalled', 'too_short', 'fetch_failed', 'removed']),
  body_ids: z.array(z.string()),
});
export type NewsArticle = z.infer<typeof NewsArticleSchema>;
export const ArticleItemLinkSchema = z.object({
  article_external_id: z.string().min(1),
  item_external_id: z.string().min(1),
  proof_quote: z.string(),
  model: z.string(),
});
export type ArticleItemLink = z.infer<typeof ArticleItemLinkSchema>;
export const ArticleResultSchema = z.object({
  articles: z.array(NewsArticleSchema),
  links: z.array(ArticleItemLinkSchema),
  warnings: z.array(z.string()),
});
export type ArticleResult = z.infer<typeof ArticleResultSchema>;

// §5.3 classifier interface (P3 owns the implementation)
export type Classification = { item_type: string; tier: 'sms' | 'weekly' | 'timeline'; rule_fired?: string };
export type Classifier = (
  item: Item,
  body: { id: string; sms_eligible: boolean; type: string },
  taxRates: unknown,
) => Classification;
