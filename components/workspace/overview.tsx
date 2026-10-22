"use client"
import { useState } from "react"
import { Pagination, SortHeader, usePagination } from "./list-controls"
import { SelectMenu } from "./select-menu"
import { DateRangePicker } from "./date-range-picker"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronRight, Plus, RotateCcw } from "lucide-react"
import type {
  Quote,
  SavedEnquiry,
  WorkspaceData,
} from "@/features/quotes/types"
import { money } from "@/lib/money"
import {
  EmptyState,
  PageHeading,
  SearchField,
  StatusBadge,
  shortDate,
} from "./shared"
export function Overview({
  data,
  section,
  href,
  onNew,
  onResume,
}: {
  data: WorkspaceData
  section: string
  href: (path: string) => string
  onNew: () => void
  onResume: (enquiry: SavedEnquiry) => void
}) {
  const newButton = (
    <button className="btn btn-primary" onClick={onNew}>
      <Plus size={17} aria-hidden="true" />
      New quote
    </button>
  )
  return section === "enquiries" ? (
    <Today
      data={data}
      href={href}
      newButton={newButton}
      onNew={onNew}
      onResume={onResume}
    />
  ) : (
    <AllQuotes data={data} href={href} newButton={newButton} onNew={onNew} />
  )
}
// Stages in the order a job moves through them. The strip on Today shows
// each one; picking a stage narrows the queue below to it.
type Stage = "unfinished" | "review" | "visit" | "send"
const STAGES: { id: Stage; label: string; action: string }[] = [
  { id: "unfinished", label: "Saved emails", action: "Resume" },
  { id: "review", label: "To review", action: "Review" },
  { id: "visit", label: "Site visits", action: "Record visit" },
  { id: "send", label: "To send", action: "Send" },
]
type QueueItem =
  | { stage: "unfinished"; enquiry: SavedEnquiry }
  | { stage: Exclude<Stage, "unfinished">; quote: Quote }

// Today is a work queue, not a list to browse: the strip gives the shape of
// the pipeline, the queue lists every job waiting on this person with the
// one action that moves it on.
function Today({
  data,
  href,
  newButton,
  onNew,
  onResume,
}: {
  data: WorkspaceData
  href: (path: string) => string
  newButton: React.ReactNode
  onNew: () => void
  onResume: (enquiry: SavedEnquiry) => void
}) {
  const { quotes } = data
  const [stage, setStage] = useState<Stage | null>(null)
  const review = quotes.filter(
    (q) => q.status === "needs_review" || q.status === "draft"
  )
  const visits = quotes.filter((q) => q.status === "site_visit_required")
  const ready = quotes.filter((q) => q.status === "approved" && !q.lastSent)
  const sent = quotes
    .filter((q) => q.status === "approved" && q.lastSent)
    .sort((a, b) => b.lastSent!.at.localeCompare(a.lastSent!.at))
  const unfinished = data.enquiries.filter(
    (e) => e.state !== "completed" && !quotes.some((q) => q.enquiryId === e.id)
  )
  // Closest to money first: sending takes a minute, reviewing a few more.
  const queue: QueueItem[] = [
    ...ready.map((quote) => ({ stage: "send" as const, quote })),
    ...review.map((quote) => ({ stage: "review" as const, quote })),
    ...visits.map((quote) => ({ stage: "visit" as const, quote })),
    ...unfinished.map((enquiry) => ({ stage: "unfinished" as const, enquiry })),
  ]
  const shown = stage ? queue.filter((item) => item.stage === stage) : queue
  const counts: Record<Stage, number> = {
    unfinished: unfinished.length,
    review: review.length,
    visit: visits.length,
    send: ready.length,
  }
  const values: Partial<Record<Stage, number>> = {
    review: sum(review),
    send: sum(ready),
  }
  const sentThisMonth = sent.filter(
    (q) => q.lastSent!.at.slice(0, 7) === new Date().toISOString().slice(0, 7)
  )
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const waiting = sum(ready) + sum(review)
  return (
    <>
      <PageHeading
        date={new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        title={`${greeting}, ${data.user.name.split(" ")[0]}.`}
        description={
          queue.length
            ? `${queue.length} ${queue.length === 1 ? "job is" : "jobs are"} waiting on you${
                waiting
                  ? `, with ${money(waiting)} of work ready to go out`
                  : ""
              }.`
            : "Nothing is waiting on you. Start a quote when the next enquiry comes in."
        }
        action={newButton}
      />
      {quotes.length === 0 && unfinished.length === 0 ? (
        <div className="sheet">
          <EmptyState
            title="No quotes yet"
            description="Start from a customer’s email and Fieldquote drafts a quote from your own prices for you to check."
            action={
              <button className="btn btn-primary" onClick={onNew}>
                Start a quote
              </button>
            }
          />
        </div>
      ) : (
        <>
          <nav className="pipeline" aria-label="Jobs by stage">
            <ol>
              {STAGES.map((s) => (
                <li key={s.id}>
                  <button
                    className={`stage stage-${s.id}`}
                    aria-pressed={stage === s.id}
                    disabled={counts[s.id] === 0}
                    onClick={() => setStage(stage === s.id ? null : s.id)}
                  >
                    <span className="stage-label">{s.label}</span>
                    <span className="stage-count">{counts[s.id]}</span>
                    <Setts count={counts[s.id]} />
                    <span className="stage-value">
                      {values[s.id] ? money(values[s.id]!) : " "}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <section className="today-queue" aria-labelledby="q-queue">
            <div className="queue-head">
              <h2 id="q-queue">
                {stage
                  ? STAGES.find((s) => s.id === stage)!.label
                  : "Waiting on you"}
                <span className="count">{shown.length}</span>
              </h2>
              {stage && (
                <button className="link-btn" onClick={() => setStage(null)}>
                  Show all stages
                </button>
              )}
            </div>
            {shown.length ? (
              <ul className="queue-list sheet">
                {shown.map((item) => (
                  <li
                    key={
                      item.stage === "unfinished"
                        ? item.enquiry.id
                        : item.quote.id
                    }
                  >
                    <QueueRow item={item} href={href} onResume={onResume} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="group-empty">
                You’re clear. New enquiries land here once drafted.{" "}
                <button className="link-btn" onClick={onNew}>
                  Start a quote
                </button>
              </div>
            )}
          </section>
          <section className="today-sent" aria-labelledby="q-sent">
            <div className="queue-head">
              <h2 id="q-sent">Recently sent</h2>
              <p>
                {sentThisMonth.length
                  ? `${sentThisMonth.length} sent this month, ${money(sum(sentThisMonth))} in total`
                  : "None sent this month"}
              </p>
              <Link className="link-btn" href={href("quotes")}>
                All quotes
              </Link>
            </div>
            {sent.length ? (
              <ul className="sent-list">
                {sent.slice(0, SHOW).map((q) => (
                  <li key={q.id}>
                    <Link href={href(`quotes/${q.id}`)} className="sent-row">
                      <span className="sent-date">
                        {shortDate(q.lastSent!.at)}
                      </span>
                      <span className="sent-job">
                        <strong>{q.title}</strong>
                        <span className="sub">{q.customerName}</span>
                      </span>
                      <span className="sent-amount">
                        {q.totalPence !== null ? money(q.totalPence) : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="group-empty">
                Quotes you email to customers land here, so you know who to
                chase.
              </p>
            )}
          </section>
        </>
      )}
    </>
  )
}
const SHOW = 5
// One paving sett per job, laid in the stage's paint, so a glance shows
// where work is piling up. Past a pallet's worth, the rest is a "+n".
const PALLET = 12
function Setts({ count }: { count: number }) {
  return (
    <span className="setts" aria-hidden="true">
      {count === 0 ? (
        <span className="sett sett-empty" />
      ) : (
        Array.from({ length: Math.min(count, PALLET) }, (_, i) => (
          <span key={i} className="sett" />
        ))
      )}
      {count > PALLET && <span className="sett-more">+{count - PALLET}</span>}
    </span>
  )
}
function sum(quotes: Quote[]) {
  return quotes.reduce((total, q) => total + (q.totalPence ?? 0), 0)
}
// One job and the single action that moves it to the next stage. The title
// opens the job; the button does the same but names what you'll do there.
function QueueRow({
  item,
  href,
  onResume,
}: {
  item: QueueItem
  href: (path: string) => string
  onResume: (enquiry: SavedEnquiry) => void
}) {
  const action = STAGES.find((s) => s.id === item.stage)!.action
  if (item.stage === "unfinished") {
    const { enquiry } = item
    return (
      <div className="queue-row stage-unfinished">
        <span className="queue-stage">Saved email</span>
        <div className="queue-job">
          <strong>
            {enquiry.raw_text.match(/Subject:\s*(.+)/i)?.[1] ||
              "Untitled enquiry"}
          </strong>
          <span className="sub">
            {enquiry.state === "failed"
              ? "The draft didn’t finish. Try again."
              : enquiry.state === "processing"
                ? "Still drafting. Reopen to check."
                : "Not drafted yet."}{" "}
            Saved {shortDate(enquiry.created_at)}
          </span>
        </div>
        <span className="amount" />
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onResume(enquiry)}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {action}
        </button>
      </div>
    )
  }
  const q = item.quote
  const open = q.issues.filter((i) => i.blocking && !i.resolution.trim())
  const unpriced = q.lines.filter(
    (l) => !l.excluded && l.ratePence === null
  ).length
  const flags = [
    open.length && `${open.length} to check`,
    unpriced && `${unpriced} unpriced`,
  ].filter(Boolean)
  const link = href(`quotes/${q.id}`)
  return (
    <div className={`queue-row stage-${item.stage}`}>
      <StatusBadge status={q.status} />
      <div className="queue-job">
        <Link href={link} className="queue-title">
          {q.title}
        </Link>
        <span className="sub">
          {q.customerName}, {q.reference}, {shortDate(q.createdAt)}
          {flags.length > 0 && (
            <>
              {". "}
              <span className="issue-flag">{flags.join(", ")}</span>
            </>
          )}
        </span>
      </div>
      <span className="amount">
        {q.totalPence !== null ? (
          <>
            <strong>{money(q.totalPence)}</strong>
            <span className="sub">inc VAT</span>
          </>
        ) : (
          <span className="sub">No price yet</span>
        )}
      </span>
      <Link
        href={link}
        className={`btn btn-sm ${item.stage === "send" ? "btn-primary" : "btn-secondary"}`}
        tabIndex={-1}
        aria-hidden="true"
      >
        {item.stage === "review" && q.status === "draft" ? "Approve" : action}
        <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </div>
  )
}
function QuoteTotal({ quote: q }: { quote: Quote }) {
  if (q.totalPence !== null)
    return (
      <>
        <strong>{money(q.totalPence)}</strong>
        <span className="sub">inc VAT</span>
      </>
    )
  if (
    q.subtotalPence > 0 &&
    !["site_visit_required", "declined"].includes(q.status)
  )
    return (
      <>
        <strong>{money(q.subtotalPence)}</strong>
        <span className="sub">so far, ex VAT</span>
      </>
    )
  return <span className="sub">No price yet</span>
}
// One quote per table row. The title is the link; it stretches over the
// whole row so anywhere on it opens the quote.
function QuoteRow({
  quote: q,
  href,
}: {
  quote: Quote
  href: (path: string) => string
}) {
  const open = q.issues.filter((i) => i.blocking && !i.resolution.trim())
  const unpriced = q.lines.filter(
    (l) => !l.excluded && l.ratePence === null
  ).length
  const flags = [
    open.length && `${open.length} to check`,
    unpriced && `${unpriced} unpriced`,
  ].filter(Boolean)
  const marked = q.status === "needs_review"
  return (
    <tr className={`quote-tr ${marked ? "marked" : ""}`}>
      <td className="col-quote">
        <Link className="row-link" href={href(`quotes/${q.id}`)}>
          {q.title}
        </Link>
        <span className="sub">
          {q.reference}
          {marked && flags.length > 0 && (
            <>
              {", "}
              <span className="issue-flag">{flags.join(", ")}</span>
            </>
          )}
        </span>
      </td>
      <td className="col-customer">
        {q.customerName || <span className="sub">No name</span>}
      </td>
      <td className="col-created">
        <time dateTime={q.createdAt}>{shortDate(q.createdAt)}</time>
      </td>
      <td className="col-status">
        <StatusBadge status={q.status} />
      </td>
      <td className="col-sent">
        {q.lastSent ? (
          <time dateTime={q.lastSent.at}>{shortDate(q.lastSent.at)}</time>
        ) : (
          <span className="sub">Not sent</span>
        )}
      </td>
      <td className="col-total num">
        <QuoteTotal quote={q} />
      </td>
      <td className="col-chev" aria-hidden="true">
        <ChevronRight size={18} />
      </td>
    </tr>
  )
}
type SortKey = "created" | "customer" | "total"
const totalOf = (q: Quote) => q.totalPence ?? q.subtotalPence
function AllQuotes({
  data,
  href,
  newButton,
  onNew,
}: {
  data: WorkspaceData
  href: (path: string) => string
  newButton: React.ReactNode
  onNew: () => void
}) {
  const { quotes } = data
  // Today's "View all" links open this list already filtered.
  const params = useSearchParams()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState(params.get("status") || "all")
  const [customer, setCustomer] = useState("all")
  const [sent, setSent] = useState(params.get("sent") || "all")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "created",
    dir: "desc",
  })
  const [range, setRange] = useState({ from: "", to: "" })
  const filters = [
    { id: "all", label: "All" },
    { id: "needs_review", label: "Needs review" },
    { id: "draft", label: "Ready to approve" },
    { id: "site_visit_required", label: "Site visit" },
    { id: "approved", label: "Approved" },
    { id: "declined", label: "Not offered" },
  ]
  const filtered = quotes.filter(
    (q) =>
      (filter === "all" || q.status === filter) &&
      (customer === "all" || q.customerName === customer) &&
      (sent === "all" || (sent === "sent" ? !!q.lastSent : !q.lastSent)) &&
      (!range.from || q.createdAt.slice(0, 10) >= range.from) &&
      (!range.to || q.createdAt.slice(0, 10) <= range.to) &&
      `${q.title} ${q.customerName} ${q.reference}`
        .toLowerCase()
        .includes(search.toLowerCase())
  )
  const ordered = [...filtered].sort((a, b) => {
    const order =
      sort.key === "customer"
        ? a.customerName.localeCompare(b.customerName)
        : sort.key === "total"
          ? totalOf(a) - totalOf(b)
          : a.createdAt.localeCompare(b.createdAt)
    return sort.dir === "asc" ? order : -order
  })
  const pagination = usePagination(
    ordered,
    JSON.stringify([search, filter, customer, sent, sort, range])
  )
  // Clicking the sorted column flips it; a new column starts with the
  // order people usually want (newest, A–Z, largest).
  function sortBy(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "customer" ? "asc" : "desc" }
    )
  }
  const narrowed =
    customer !== "all" || sent !== "all" || !!range.from || !!search
  function clearFilters() {
    setSearch("")
    setFilter("all")
    setCustomer("all")
    setSent("all")
    setRange({ from: "", to: "" })
  }
  return (
    <>
      <PageHeading
        title="Quotes"
        description="Every draft, site visit and approval for your company."
        action={newButton}
      />
      <div className="sheet quotes-sheet">
        <div className="toolbar">
          <div className="tabs" role="group" aria-label="Filter by status">
            {filters.map((item) => {
              const count =
                item.id === "all"
                  ? quotes.length
                  : quotes.filter((q) => q.status === item.id).length
              return (
                <button
                  key={item.id}
                  className="tab"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  {count > 0 && <span className="tab-count">{count}</span>}
                </button>
              )
            })}
          </div>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search job, customer, ref"
          />
        </div>
        <div className="quote-filters">
          <SelectMenu
            inline
            label="Customer"
            value={customer}
            onChange={setCustomer}
            options={[
              { value: "all", label: "All" },
              ...Array.from(new Set(quotes.map((q) => q.customerName)))
                .sort()
                .map((value) => ({ value, label: value })),
            ]}
          />
          <SelectMenu
            inline
            label="Delivery"
            value={sent}
            onChange={setSent}
            options={[
              { value: "all", label: "Any" },
              { value: "sent", label: "Sent" },
              { value: "unsent", label: "Not sent" },
            ]}
          />
          <DateRangePicker
            label="Created"
            from={range.from}
            to={range.to}
            onChange={setRange}
          />
          <div className="quote-filters-end">
            <span className="quote-count" role="status">
              {filtered.length === 1 ? "1 quote" : `${filtered.length} quotes`}
            </span>
            {narrowed && (
              <button className="link-btn" onClick={clearFilters}>
                <RotateCcw size={13} aria-hidden="true" /> Clear filters
              </button>
            )}
          </div>
        </div>
        {filtered.length ? (
          <div className="table-scroll">
            <table className="quotes-table table">
              <thead>
                <tr>
                  <th className="col-quote">Quote</th>
                  <SortHeader
                    id="customer"
                    label="Customer"
                    sort={sort}
                    onSort={sortBy}
                    className="col-customer"
                  />
                  <SortHeader
                    id="created"
                    label="Created"
                    sort={sort}
                    onSort={sortBy}
                    className="col-created"
                  />
                  <th className="col-status">Status</th>
                  <th className="col-sent">Sent</th>
                  <SortHeader
                    id="total"
                    label="Total"
                    sort={sort}
                    onSort={sortBy}
                    className="col-total num"
                  />
                  <th className="col-chev">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((q) => (
                  <QuoteRow key={q.id} quote={q} href={href} />
                ))}
              </tbody>
            </table>
          </div>
        ) : quotes.length ? (
          <EmptyState
            title="No quotes match"
            description="Try another search, status or date range."
            action={
              <button className="btn btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState
            title="No quotes yet"
            description="Paste a customer’s email to draft the first one."
            action={
              <button className="btn btn-primary" onClick={onNew}>
                Paste an enquiry
              </button>
            }
          />
        )}
        {filtered.length > 0 && (
          <Pagination pagination={pagination} label="Quotes" />
        )}
      </div>
    </>
  )
}
function sentence(parts: string[]) {
  const text =
    parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
      : parts[0]
  return text[0].toUpperCase() + text.slice(1)
}
