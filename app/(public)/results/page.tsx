'use client'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowCircle, BodyIcon } from '@/components/civic'
import { BodyQuiz } from '@/components/flow/BodyQuiz'
import { useLookup } from '@/components/flow/LookupProvider'
import { Button } from '@/components/ui/button'

export default function ResultsPage() {
  const t = useTranslations('Results')
  const tLookup = useTranslations('Lookup')
  const { state, reset } = useLookup()

  return (
    <main id="main" className="mx-auto max-w-7xl px-4 pt-8 pb-8 md:px-8 md:pt-10 2xl:max-w-[1440px]">
      <div className="max-w-3xl">
        <h1 className="text-[2.1rem] leading-tight font-extrabold tracking-[-0.03em] text-ink md:text-[2.6rem]">{t('title')}</h1>

        {state.status === 'idle' && (
          <>
            <p className="mt-3 text-lg text-muted-foreground">{t('empty')}</p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/">{t('enterAddress')}</Link>
            </Button>
          </>
        )}

        {state.status === 'loading' && (
          <p role="status" className="mt-6 flex items-center gap-2 text-lg text-muted-foreground">
            <Loader2 aria-hidden className="size-5 animate-spin" /> {t('finding')}
          </p>
        )}

        {state.status === 'error' && (
          <>
            <p role="alert" className="mt-4 text-lg font-semibold text-brick">
              {tLookup(`errors.${state.code}`)}
            </p>
            <Button asChild size="lg" className="mt-6" onClick={reset}>
              <Link href="/">{t('tryAnother')}</Link>
            </Button>
          </>
        )}

        {state.status === 'done' && (
          <>
            <p className="mt-3 text-lg text-muted-foreground">{t('lede')}</p>
            {state.data.match === 'census' && (
              <p className="mt-4 rounded-2xl bg-surface p-4 text-sm text-ink">{t('censusNote')}</p>
            )}
            <section className="mt-8" aria-labelledby="matched-bodies">
              <h2 id="matched-bodies" className="text-lg font-extrabold text-ink">{t('bodies')}</h2>
              <ul className="mt-3 grid gap-3">
                {state.data.bodies.map((b) => {
                  // With the Census fallback, every listed body is in the token, so its details page works.
                  const inToken = b.verified || state.data.match === 'census'
                  const card = (
                    <>
                      <BodyIcon type={b.type ?? 'other'} id={b.id} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-ink">{b.name}</p>
                        <p className={`mt-1 text-xs ${b.verified ? 'text-emerald-700' : 'text-amber-800'}`}>
                          {b.verified
                            ? t('verified')
                            : b.map_match === 'near'
                              ? t('mayBeIn')
                              : b.map_match === 'inside'
                                ? t('fromMap')
                                : state.data.match === 'census' ? t('fromCensus') : t('unverified')}
                        </p>
                      </div>
                    </>
                  )
                  const cardClass = 'flex items-center gap-4 rounded-[24px] bg-white p-4 ring-1 ring-border'
                  const detailsHref = `/bodies/${encodeURIComponent(b.id)}?t=${encodeURIComponent(state.data.bodies_token)}`

                  return (
                    <li key={b.id}>
                      {inToken ? (
                        <Link
                          href={detailsHref}
                          className={`${cardClass} group w-full text-left motion-safe:transition-[background-color,box-shadow,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-denim-soft/30 hover:ring-denim/50 motion-safe:hover:scale-[1.01]`}
                        >
                          {card}
                          <ArrowCircle className="text-ink" />
                        </Link>
                      ) : (
                        <div className={cardClass}>{card}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>

            {(state.data.uncovered ?? []).length > 0 && (
              <section className="mt-8" aria-labelledby="uncovered-bodies">
                <h2 id="uncovered-bodies" className="text-lg font-extrabold text-ink">{t('uncovered')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('uncoveredNote')}</p>
                <ul className="mt-3 grid gap-3">
                  {state.data.uncovered.map((u) => (
                    <li key={u.key} className="flex items-center gap-4 rounded-[24px] bg-white p-4 ring-1 ring-border">
                      <BodyIcon type={u.type} id={u.key} />
                      <span className="font-bold text-ink">{u.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {state.data.ballot.length > 0 && (
              <section className="mt-8" aria-labelledby="ballot-items">
                <h2 id="ballot-items" className="text-lg font-extrabold text-ink">{t('ballot')}</h2>
                <ul className="mt-3 grid gap-3">
                  {state.data.ballot.map((item) => (
                    <li key={item.id} className="rounded-2xl bg-white p-4 ring-1 ring-border">
                      <p className="font-bold text-ink">{item.office_name ?? t('unknownOffice')}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.body_id ? state.data.bodies.find((b) => b.id === item.body_id)?.name : null}</p>
                      {item.source_url && <a className="mt-2 inline-block text-sm font-semibold text-primary underline" href={item.source_url} target="_blank" rel="noreferrer">{t('officialSource')}</a>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {state.data.regional.length > 0 && (
              <section className="mt-8" aria-labelledby="regional-bodies">
                <h2 id="regional-bodies" className="text-lg font-extrabold text-ink">{t('regional')}</h2>
                <ul className="mt-3 grid gap-3">
                  {state.data.regional.map((b) => (
                    <li key={b.id} className="flex items-center gap-4 rounded-[24px] bg-white p-4 ring-1 ring-border">
                      <BodyIcon type={b.type ?? 'other'} id={b.id} /><span className="font-bold text-ink">{b.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {state.data.hoa && (
              <section className="mt-8 rounded-[24px] bg-surface p-5" aria-labelledby="hoa-candidate">
                <h2 id="hoa-candidate" className="font-extrabold text-ink">{t('hoa')}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{state.data.hoa.subdivision_name}: {state.data.hoa.association_verified ? t('hoaCandidateVerified') : t('hoaNeedsConfirmation')}</p>
                {state.data.hoa.source_url && <a className="mt-2 inline-block text-sm font-semibold text-primary underline" href={state.data.hoa.source_url} target="_blank" rel="noreferrer">{t('officialSource')}</a>}
              </section>
            )}

            {state.data.not_government.length > 0 && (
              <>
                <h2 className="mt-8 text-sm font-bold text-muted-foreground">{t('notGovernment')}</h2>
                <ul className="mt-3 grid gap-3">
                  {state.data.not_government.map((b) => (
                    <li key={b.id} className="flex items-center gap-4 rounded-[24px] bg-white p-4 ring-1 ring-border">
                      <BodyIcon type={b.type ?? 'other'} id={b.id} />
                      <span className="font-bold text-ink">{b.name}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-6 text-sm text-muted-foreground">{t('limits')}</p>
            <BodyQuiz />
            <div className="mt-8">
              <Button asChild size="lg" className="group gap-3 px-7">
                {/* /app/use remembers the bodies_token (body IDs only) so the dashboard shows these governments.
                    A plain <a>: it's a route handler that sets a cookie and redirects, not a page. */}
                <a href={`/app/use?t=${encodeURIComponent(state.data.bodies_token)}&onboarding=1&step=1`}>
                  {t('dashboard')}
                  <ArrowCircle />
                </a>
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
