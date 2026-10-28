'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { BodyIcon } from '@/components/civic'
import { isQuizBodyType } from '@/lib/quiz'

type Detail = {
  id: string
  name: string
  type: string | null
  description: string | null
  elected_or_appointed: string | null
  meeting_info_url: string | null
  tax_set_by_name: string | null
  operations_by_name: string | null
  regulated_by: string | null
  operator_name: string | null
  tax_rate: number | null
  tax_year: number | null
  tax_source_url: string | null
  last_vote_date: string | null
  latest_election: null | { date: string | null; type: string | null; votes_cast: number | null; registered_voters: number | null; source_url: string | null }
  ballot_offices: Array<{ office_name: string | null; holder_name: string | null; next_election_date: string | null; source_url: string | null }>
  agenda_coverage?: 'reading' | 'not_yet' | null
  headlines: Array<{ outlet: string | null; headline: string; url: string; published_at: string | null }>
}

const money = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)

export function BodyDetailClient({ bodyId, token }: { bodyId: string; token: string }) {
  const t = useTranslations('BodyDetail')
  const locale = useLocale()
  const [body, setBody] = useState<Detail | null>(null)
  const [error, setError] = useState(false)
  const meetingInfoUrl = body?.id === 'commissioners_court'
    ? 'https://agenda.harriscountytx.gov/'
    : body?.meeting_info_url

  useEffect(() => {
    let active = true
    void fetch(`/api/bodies?t=${encodeURIComponent(token)}&id=${encodeURIComponent(bodyId)}&lang=${locale}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error('body unavailable')
        return data as { bodies: Detail[] }
      })
      .then((data) => { if (active) setBody(data.bodies[0] ?? null) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [bodyId, locale, token])

  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-10 md:px-8 md:py-14">
      <Link href={`/results?t=${encodeURIComponent(token)}`} className="text-sm font-semibold text-primary underline underline-offset-4">{t('back')}</Link>
      {error && <p role="alert" className="mt-6 font-semibold text-brick">{t('error')}</p>}
      {!body && !error && <p role="status" className="mt-6 text-muted-foreground">{t('loading')}</p>}
      {body && (
        <article className="mt-6">
          <header className="rounded-[28px] bg-primary p-5 text-white md:p-8">
            <div className="flex items-start gap-4">
              <BodyIcon type={isQuizBodyType(body.type) ? body.type : 'other'} id={body.id} />
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">{body.name}</h1>
                {body.description && <p className="mt-3 max-w-2xl text-white/80">{body.description}</p>}
              </div>
            </div>
          </header>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {body.elected_or_appointed && <Fact label={t('selection')} value={body.elected_or_appointed} />}
            {body.tax_set_by_name && <Fact label={t('taxSetBy')} value={body.tax_set_by_name} />}
            {body.operations_by_name && <Fact label={t('operationsBy')} value={body.operations_by_name} />}
            {body.regulated_by && <Fact label={t('regulatedBy')} value={body.regulated_by} />}
            {body.operator_name && <Fact label={t('operator')} value={body.operator_name} />}
            {body.tax_rate !== null && <Fact label={t('taxEstimate')} value={`${money(body.tax_rate * 2500)}/yr · ${body.tax_year ?? ''}`} />}
            {body.last_vote_date && <Fact label={t('lastVote')} value={body.last_vote_date} />}
            {body.latest_election?.date && <Fact label={t('latestElection')} value={`${body.latest_election.date}${body.latest_election.votes_cast !== null ? ` · ${body.latest_election.votes_cast} ${t('votesCast')}` : ''}`} />}
          </div>
          {body.tax_rate !== null && <p className="mt-3 text-xs text-muted-foreground">{t('taxCaveat')}</p>}
          <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-primary">
            {meetingInfoUrl && <a href={meetingInfoUrl} target="_blank" rel="noreferrer" className="underline">{t('meetings')}</a>}
            {body.tax_source_url && <a href={body.tax_source_url} target="_blank" rel="noreferrer" className="underline">{t('taxSource')}</a>}
            {body.latest_election?.source_url && <a href={body.latest_election.source_url} target="_blank" rel="noreferrer" className="underline">{t('electionSource')}</a>}
          </div>

          {body.agenda_coverage === 'not_yet' && (
            <section aria-labelledby="agenda-coverage-title" className="mt-9 rounded-[26px] bg-surface p-5 ring-1 ring-border md:p-7">
              <h2 id="agenda-coverage-title" className="text-xl font-extrabold text-ink">{t('notReadTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('notReadBody')}</p>
              {meetingInfoUrl && <a href={meetingInfoUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-primary underline underline-offset-4">{t('notReadLink')}</a>}
            </section>
          )}

          {body.ballot_offices.length > 0 && (
            <section className="mt-9">
              <h2 className="text-xl font-extrabold text-ink">{t('ballot')}</h2>
              <ul className="mt-3 grid gap-3">
                {body.ballot_offices.map((office, index) => (
                  <li key={`${office.office_name ?? 'office'}-${index}`} className="rounded-2xl bg-white p-4 ring-1 ring-border">
                    <p className="font-bold text-ink">{office.office_name ?? t('unknownOffice')}</p>
                    {office.holder_name && <p className="mt-1 text-sm text-muted-foreground">{t('holder', { name: office.holder_name })}</p>}
                    {office.next_election_date && <p className="mt-1 text-sm text-muted-foreground">{t('electionDate', { date: office.next_election_date })}</p>}
                    {office.source_url && <a href={office.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-primary underline">{t('officialSource')}</a>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {body.headlines.length > 0 && (
            <section className="mt-9 rounded-[26px] bg-surface p-5 md:p-7">
              <h2 className="text-xl font-extrabold text-ink">{t('newsTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('newsNote')}</p>
              <ul className="mt-4 grid gap-3">
                {body.headlines.map((headline) => (
                  <li key={headline.url} className="rounded-2xl bg-white p-4 ring-1 ring-border">
                    <a href={headline.url} target="_blank" rel="noreferrer" className="font-bold text-primary underline underline-offset-4">{headline.headline}</a>
                    <p className="mt-1 text-xs text-muted-foreground">{[headline.outlet, headline.published_at].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      )}
    </main>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white p-4 ring-1 ring-border"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 font-bold text-ink">{value}</p></div>
}
