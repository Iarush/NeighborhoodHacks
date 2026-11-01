import type { Metadata } from 'next'
import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { requireAdmin } from '@/lib/adminAuth'
import { db } from '@/lib/db'
import { rawDb, rows as rpcResult } from '@/lib/db/raw'
import { DATABASE_STOP_BYTES, STORAGE_STOP_BYTES, megabytes } from '@/lib/ingest/archive'
import { approveItem, rejectItem } from './actions'

// The review queue (agent-scraper-spec §9 P2-E, minimal version): pending items, soonest meeting
// first, with Approve and Reject. Source health sits above it. Edit and the notices panel come later.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin.review')
  return { title: t('title'), robots: { index: false } }
}

type Row = {
  id: string
  title: string
  agenda_number: string | null
  section: string | null
  tier: string | null
  rule_fired: string | null
  source_quote: string | null
  quote_verified: boolean | null
  source_url: string
  body_id: string | null
  meeting: { date: string } | null
}

export default async function ReviewPage() {
  await requireAdmin()
  const t = await getTranslations('Admin.review')
  const format = await getFormatter()

  const [items, sources, sizes] = await Promise.all([
    db()
      .from('items')
      .select('id, title, agenda_number, section, tier, rule_fired, source_quote, quote_verified, source_url, body_id, meeting:meetings!inner(date)')
      .eq('review_status', 'pending')
      .is('removed_at', null)
      .limit(200),
    db().from('sources').select('id, last_flags, last_error').order('id'),
    // Database and Storage sizes (district-coverage plan §2.5). Missing until the migration is applied.
    rpcResult<{ database_bytes: number; storage_bytes: number }>(rawDb().rpc('storage_sizes', {})).catch(() => []),
  ])
  if (items.error) throw new Error(items.error.message)
  if (sources.error) throw new Error(sources.error.message)

  const rows = ((items.data ?? []) as unknown as Row[]).sort((a, b) => Date.parse(a.meeting?.date ?? '') - Date.parse(b.meeting?.date ?? ''))
  const bodyIds = [...new Set(rows.map((r) => r.body_id).filter((id): id is string => !!id))]
  const bodies = bodyIds.length ? await db().from('bodies').select('id, name').in('id', bodyIds) : { data: [] }
  const nameOf = new Map((bodies.data ?? []).map((b) => [b.id, b.name]))
  const unhealthy = (sources.data ?? []).filter((s) => s.last_error || s.last_flags.length)

  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10">
      <p>
        <Link href="/admin" className="font-semibold text-denim underline underline-offset-2">
          {t('back')}
        </Link>
      </p>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">{t('intro')}</p>

      <section aria-labelledby="health" className="mt-10">
        <h2 id="health" className="text-xl font-bold text-ink">
          {t('healthTitle')}
        </h2>
        {sizes[0] ? (
          <p className="mt-2">
            {t('sizes', { database: megabytes(Number(sizes[0].database_bytes)), storage: megabytes(Number(sizes[0].storage_bytes)) })}
            {(Number(sizes[0].database_bytes) > DATABASE_STOP_BYTES || Number(sizes[0].storage_bytes) > STORAGE_STOP_BYTES) && (
              <strong className="ml-1 font-semibold text-brick">{t('sizeStop')}</strong>
            )}
          </p>
        ) : (
          <p className="mt-2 text-muted-foreground">{t('sizesMissing')}</p>
        )}
        {unhealthy.length === 0 ? (
          <p className="mt-2">{t('healthy')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {unhealthy.map((s) => (
              <li key={s.id} className="rounded-2xl bg-white p-4 ring-1 ring-brick">
                <p className="font-semibold text-ink">{s.id}</p>
                {s.last_flags.length > 0 && <p className="mt-1 text-sm">{t('flags', { flags: s.last_flags.join(', ') })}</p>}
                {s.last_error && <p className="mt-1 text-sm font-semibold text-brick">{t('error', { error: s.last_error })}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="queue" className="mt-10">
        <h2 id="queue" className="text-xl font-bold text-ink">
          {t('queueTitle', { count: rows.length })}
        </h2>
        {rows.length === 0 ? (
          <p className="mt-2">{t('empty')}</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {rows.map((r) => (
              <li key={r.id} className="rounded-3xl bg-white p-5 ring-1 ring-border">
                <p className="text-sm text-muted-foreground">{nameOf.get(r.body_id ?? '') ?? r.body_id}</p>
                {r.meeting && (
                  <p className="text-sm text-muted-foreground">
                    {t('meeting', { date: format.dateTime(new Date(r.meeting.date), { dateStyle: 'medium', timeStyle: 'short' }) })}
                  </p>
                )}
                <h3 className="mt-2 font-bold text-ink">
                  {r.agenda_number ? `${r.agenda_number}. ` : ''}
                  {r.title}
                </h3>
                {r.section && <p className="mt-1 text-sm">{t('section', { section: r.section })}</p>}
                <p className="mt-2 text-sm">{t('tier', { tier: r.tier ?? '-', rule: r.rule_fired ?? t('noRule') })}</p>
                {r.quote_verified === false && <p className="mt-3 rounded-xl bg-white p-3 text-sm font-semibold text-brick ring-1 ring-brick">{t('unverified')}</p>}
                {r.source_quote && (
                  <figure className="mt-3">
                    <figcaption className="text-sm font-semibold">{t('quote')}</figcaption>
                    <blockquote className="mt-1 border-l-4 border-denim pl-3 text-sm">{r.source_quote}</blockquote>
                  </figure>
                )}
                <p className="mt-3 text-sm">
                  <a href={r.source_url} target="_blank" rel="noreferrer" className="font-semibold text-denim underline underline-offset-2">
                    {t('source')}
                  </a>
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <form action={approveItem}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit">{t('approve')}</Button>
                  </form>
                  <form action={rejectItem}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" variant="outline">
                      {t('reject')}
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
