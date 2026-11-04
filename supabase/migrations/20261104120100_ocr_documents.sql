-- mud-code-parser-spec §5 and §9: OCR for scanned MUD agendas. Additive only.
--   * documents.kind gains 'ocr_text' (text Tesseract read from a PDF, stored like pdf_text).
--   * needs_ocr marks a PDF the OCR job (.github/workflows/ocr.yml) should read; ocr_tried_at keeps
--     a failed PDF from being retried more than once a day.
--   * parse_rung / parse_profile record which ladder rung and law-firm profile parsed a document,
--     so health checks can count failures by firm.

alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents
  add constraint documents_kind_check
  check (kind in ('json', 'html', 'pdf_text', 'llm_output', 'ocr_text'));

alter table public.documents
  add column if not exists needs_ocr boolean not null default false,
  add column if not exists ocr_tried_at timestamptz,
  add column if not exists parse_rung smallint check (parse_rung between 1 and 5),
  add column if not exists parse_profile text;

-- The OCR queue reads only the few rows that still need OCR.
create index if not exists documents_needs_ocr_idx on public.documents (fetched_at) where needs_ocr;
