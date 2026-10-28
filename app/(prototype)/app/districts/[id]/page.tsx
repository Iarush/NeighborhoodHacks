"use client"

import { ArrowLeft, CalendarDays, Check, ExternalLink, MapPin, Megaphone, Users } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Chip, KIND_STYLE, LogoTile, Panel, SectionTitle, TYPE_ICON } from "@/components/prototype/civic"
import { useStory } from "@/components/prototype/story-sheet"
import { Button } from "@/components/ui/button"
import { KIND_LABEL, getBody } from "@/lib/prototype/bodies"
import { TYPE_LABEL, fmtDate, money, relDay } from "@/lib/prototype/format"
import { useNow, useProfile } from "@/lib/prototype/profile"
import { cn } from "@/lib/utils"

export default function BodyPage() {
  const { id } = useParams<{ id: string }>()
  const { bodies, updates } = useProfile()
  const openStory = useStory()
  const now = useNow()
  const b = bodies.find((x) => x.id === id) ?? getBody(id)

  if (!b) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-center">
        <div>
          <p className="text-xl font-bold">We don't cover that body yet</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/app/districts">Back to my districts</Link>
          </Button>
        </div>
      </div>
    )
  }

  const Icon = KIND_STYLE[b.kind].icon
  const mine = updates.filter((u) => u.bodyId === b.id)
  const upcoming = mine.filter((u) => +new Date(u.date) >= now).sort((a, c) => +new Date(a.date) - +new Date(c.date))
  const past = mine.filter((u) => +new Date(u.date) < now).sort((a, c) => +new Date(c.date) - +new Date(a.date))
  const commentable = upcoming.find((u) => u.comment)
  const t = b.lastTurnout
  const pct = t ? (t.votes / t.eligible) * 100 : 0
  const dark = b.kind === "mud" || b.kind === "city"

  return (
    <div className="pt-4">
      <Link
        href="/app/districts"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="size-4" /> My districts
      </Link>

      {/* Hero */}
      <section
        className={cn(
          "relative mt-4 overflow-hidden rounded-[28px] p-5 text-white md:p-10",
          dark ? "bg-ink" : "bg-denim",
        )}
      >
        <Icon className="absolute -right-10 -bottom-12 size-72 text-white/[0.06]" strokeWidth={1} />
        <LogoTile id={b.id} className="relative mb-5 size-16 rounded-[20px] ring-0" />
        <div className="relative flex flex-wrap gap-2">
          <Chip className="bg-white/15 text-white">{KIND_LABEL[b.kind]}</Chip>
          {b.yourSeat && (
            <Chip className="bg-white text-ink">
              <MapPin className="size-3 text-brick" /> {b.yourSeat}
            </Chip>
          )}
        </div>
        <h1 className="relative mt-5 max-w-3xl text-[2.2rem] leading-[1.05] font-extrabold tracking-[-0.03em] md:text-[3rem]">
          {b.name}
        </h1>
        <p className="relative mt-3 max-w-2xl text-[1.05rem] text-white/75">{b.tagline}</p>
        <div className="relative mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          <Fact label="Members" value={b.seats} />
          <Fact label="Tax estimate on a $250K home" value={b.taxRate ? `${money(b.taxRate * 2500)}/yr` : "Rate not loaded"} />
          <Fact label="Next on the calendar" value={upcoming[0] ? relDay(upcoming[0].date) : "Nothing posted"} />
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel>
          <SectionTitle>What it controls</SectionTitle>
          <ul className="space-y-3">
            {b.controls.map((c) => (
              <li key={c} className="flex gap-3 text-sm">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-denim-soft text-denim">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {c}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <SectionTitle>Who's in charge</SectionTitle>
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sand text-sand-deep">
              <Users className="size-4" />
            </span>
            <p className="text-sm leading-relaxed">{b.selection}</p>
          </div>
          <div className="mt-5 flex gap-3 border-t border-line pt-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sand text-sand-deep">
              <CalendarDays className="size-4" />
            </span>
            <div className="text-sm leading-relaxed">
              <p className="font-semibold">{b.meets}</p>
              <p className="text-muted-foreground">{b.location}</p>
            </div>
          </div>
        </Panel>

        <div className="flex flex-col justify-between rounded-[24px] bg-brick p-5 text-white">
          <div>
            <Megaphone className="size-6 text-white/80" />
            <p className="mt-4 text-lg font-extrabold tracking-tight">How to speak at a meeting</p>
            <p className="mt-2 text-sm leading-relaxed text-white/80">{b.commentRules}</p>
          </div>
          {commentable ? (
            <Button asChild variant="white" className="mt-6">
              <Link href={`/app/speak?item=${commentable.id}`}>Draft a comment for {fmtDate(commentable.date)}</Link>
            </Button>
          ) : (
            <Button asChild variant="white" className="mt-6">
              <a href={b.website} target="_blank" rel="noreferrer">
                Official site <ExternalLink data-icon="inline-end" />
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <SectionTitle>Coming up and recently decided</SectionTitle>
          {b.agendasRead === false && (
            <div className="rounded-2xl bg-muted p-4 text-sm leading-relaxed">
              <p className="font-bold">We don't read this board's agendas yet</p>
              <p className="mt-1 text-muted-foreground">
                So nothing from its meetings shows up here or in your alerts. It posts its meetings and agendas on its own
                official notice page.
              </p>
              {b.website && (
                <a href={b.website} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-denim underline underline-offset-4">
                  See its official meeting notices <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
          <ul className="divide-y divide-line">
            {[...upcoming, ...past].map((u) => {
              const TIcon = TYPE_ICON[u.type]
              const future = +new Date(u.date) >= now
              return (
                <li key={u.id}>
                  <button onClick={() => openStory(u)} className="group flex w-full items-start gap-4 py-4 text-left">
                    <span
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-2xl",
                        future ? "bg-denim-soft text-denim" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <TIcon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold group-hover:text-denim">{u.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {TYPE_LABEL[u.type]} · {future ? relDay(u.date) : fmtDate(u.date)}
                      </span>
                    </span>
                    {u.vote && <Chip tone="sage">{u.vote}</Chip>}
                    {u.tier === "urgent" && future && <Chip tone="brick">Urgent</Chip>}
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>

        {t ? (
          <Panel>
            <SectionTitle>Who showed up last time</SectionTitle>
            <p className="text-4xl font-extrabold tracking-tight tabular">
              {pct < 1 ? pct.toFixed(1) : Math.round(pct)}%
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.votes.toLocaleString()} of {t.eligible.toLocaleString()} eligible voters in {t.year}
            </p>
            <div className="mt-5 grid grid-cols-20 gap-1" aria-hidden>
              {Array.from({ length: 100 }).map((_, i) => (
                <span
                  key={i}
                  className={cn("aspect-square rounded-full", i < Math.max(1, Math.round(pct)) ? "bg-brick" : "bg-muted")}
                />
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Each dot is 1% of eligible voters.</p>
            {b.kind === "mud" && (
              <p className="mt-4 rounded-2xl bg-brick-soft p-4 text-sm font-semibold text-brick-deep">
                {Math.ceil(t.votes / 2) + 1} votes could decide the next {b.short} election.
              </p>
            )}
          </Panel>
        ) : (
          <Panel>
            <SectionTitle>No election to vote in</SectionTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Members of this body are appointed, not elected. Public comment and contacting the officials who
              appoint them are the main ways to have a say.
            </p>
          </Panel>
        )}
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
      <p className="text-[11px] font-semibold text-white/60">{label}</p>
      <p className="mt-1 font-extrabold">{value}</p>
    </div>
  )
}
