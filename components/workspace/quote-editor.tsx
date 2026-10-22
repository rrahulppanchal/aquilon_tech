"use client"
import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Info,
  MapPin,
} from "lucide-react"
import type {
  Company,
  Quote,
  QuoteLine,
  Role,
  Rate,
} from "@/features/quotes/types"
import type { Problem, QuoteEdits } from "@/features/quotes/domain/pricing"
import {
  canApprove,
  findProblems,
  recalculate,
} from "@/features/quotes/domain/pricing"
import { money } from "@/lib/money"
import { BuildUp } from "./buildup"
import { ItemPicker } from "./item-picker"
import { SendQuote } from "./send-quote"
import type { MailStatus } from "@/lib/mail/presets"
import { ConfirmDialog, StatusBadge, shortDate, useToast } from "./shared"
type Pending = "approve" | "save-approved" | "delete" | "leave" | null
// Moves focus to a field and scrolls it into view, for "fix this" links.
function jumpTo(field: string) {
  const element = document.getElementById(field)
  element?.scrollIntoView({ behavior: "smooth", block: "center" })
  element?.focus({ preventScroll: true })
}
export function QuoteEditor({
  quote,
  company,
  rates,
  role,
  onBack,
  onDelete,
  onSave,
  onApprove,
  onPriceAfterVisit,
  mail,
  onSent,
}: {
  quote: Quote
  company: Company
  rates: Rate[]
  role: Role
  onDelete: (version: number) => Promise<void>
  onBack: () => void
  onSave: (edits: QuoteEdits) => Promise<Quote>
  onApprove: (version: number) => Promise<Quote>
  onPriceAfterVisit: (version: number, visitNotes: string) => Promise<Quote>
  mail: MailStatus
  onSent: (sent: NonNullable<Quote["lastSent"]>) => void
}) {
  const toast = useToast()
  const [saved, setSaved] = useState(quote)
  const [draft, setDraft] = useState(quote)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [showProblems, setShowProblems] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const [validUntil, setValidUntil] = useState("")
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set())
  const [visitNotes, setVisitNotes] = useState("")
  const [visitError, setVisitError] = useState("")
  const totals = recalculate(draft, company)
  const blocked = canApprove(totals)
  const problems = findProblems(saved, draft)
  const problemFor = (field: string) =>
    showProblems ? problems.find((p) => p.field === field) : undefined
  // A check counts as done once it has a real note (5+ letters, as the server requires).
  const done = (resolution: string) => resolution.trim().length >= 5
  const openChecks = draft.issues.filter(
    (i) => i.blocking && !done(i.resolution)
  )
  const unpriced = totals.lines.filter(
    (l) => !l.excluded && l.totalPence === null
  )
  const noPrice = ["site_visit_required", "declined"].includes(draft.status)
  const approved = draft.status === "approved"
  const owner = role === "owner"
  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  function change(next: (current: Quote) => Quote) {
    setDraft(next)
    setDirty(true)
    setError("")
  }
  function editLine(id: string, patch: Partial<QuoteLine>) {
    change((current) => ({
      ...current,
      lines: current.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }))
  }
  function addLine(pick: { rate: Rate } | { manual: string }) {
    const rate = "rate" in pick ? pick.rate : null
    const line: QuoteLine = {
      id: `new-${crypto.randomUUID()}`,
      code: rate?.code || null,
      description: rate?.description || ("manual" in pick ? pick.manual : ""),
      unit: rate?.unit || "job",
      quantity: 1,
      ratePence: rate?.ratePence ?? null,
      totalPence: null,
      excluded: false,
      note: "Added while checking the quote.",
    }
    change((current) => ({ ...current, lines: [...current.lines, line] }))
    // Put the cursor on the new item's quantity so it can be set straight away.
    setTimeout(() => jumpTo(`qty-${line.id}`), 0)
  }
  async function startPricing() {
    setVisitError("")
    if (visitNotes.trim().length < 5) {
      setVisitError(
        "Write what you found on the visit (at least 5 letters), e.g. “Measured 1,150 m², drainage needed at entrance”."
      )
      jumpTo("visit-notes")
      return
    }
    setBusy(true)
    try {
      await onPriceAfterVisit(draft.version, visitNotes.trim())
      toast("Visit recorded. Check the items and prices, then approve.")
    } catch (e) {
      setVisitError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const save = useCallback(async () => {
    setBusy(true)
    setError("")
    try {
      const updated = await onSave({
        expectedVersion: draft.version,
        lines: draft.lines
          .filter((l) => !l.id.startsWith("new-"))
          .map(({ id, quantity, ratePence, excluded, note }) => ({
            id,
            quantity,
            ratePence,
            excluded,
            note,
          })),
        newLines: draft.lines
          .filter((l) => l.id.startsWith("new-") && !l.excluded)
          .map(({ code, description, quantity, ratePence, unit, note }) => ({
            code,
            description,
            quantity,
            ratePence,
            unit,
            note,
          })),
        resolutions: draft.issues.map(({ id, resolution }) => ({
          id,
          resolution,
        })),
      })
      setDraft(updated)
      setSaved(updated)
      setDirty(false)
      setShowProblems(false)
      setOpenNotes(new Set())
      toast(
        approved
          ? "Changes saved. The approval was removed; approve again when ready."
          : "Changes saved."
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [approved, draft, onSave, toast])
  function requestSave() {
    if (!dirty || busy) return
    if (problems.length) {
      setShowProblems(true)
      jumpTo(problems[0].field)
      return
    }
    if (approved) setPending("save-approved")
    else void save()
  }
  // Cmd/Ctrl+S saves, like any editor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        requestSave()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
  function requestApprove() {
    setValidUntil(
      new Date(Date.now() + company.validityDays * 86400000).toLocaleDateString(
        "en-GB",
        {
          day: "numeric",
          month: "long",
          year: "numeric",
        }
      )
    )
    setPending("approve")
  }
  async function approve() {
    setBusy(true)
    setError("")
    try {
      const updated = await onApprove(draft.version)
      setDraft(updated)
      setSaved(updated)
      setPending(null)
      toast(
        "Quote approved. It hasn’t been sent; send it to the customer yourself."
      )
    } catch (e) {
      setPending(null)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  // What still stands between this quote and approval, in plain words.
  const todo: { label: string; field?: string }[] = []
  if (!noPrice && !approved) {
    if (unpriced.length)
      todo.push({
        label: `${unpriced.length} ${unpriced.length === 1 ? "item needs" : "items need"} a price, or leave ${unpriced.length === 1 ? "it" : "them"} out`,
        field: `rate-${unpriced[0].id}`,
      })
    if (openChecks.length)
      todo.push({
        label: `${openChecks.length} ${openChecks.length === 1 ? "check is" : "checks are"} not filled in`,
        field: `issue-${openChecks[0].id}`,
      })
    if (dirty) todo.push({ label: "Save your changes" })
  }
  return (
    <>
      <button
        className="back-link"
        onClick={() => (dirty ? setPending("leave") : onBack())}
      >
        <ArrowLeft size={16} aria-hidden="true" /> Quotes
      </button>
      <div className="quote-title-row">
        <div>
          <p className="quote-ref">
            Quote {draft.reference}
            {draft.version > 1 && `, version ${draft.version}`}
          </p>
          <h1>{draft.title}</h1>
        </div>
        <div className="quote-actions">
          <StatusBadge status={draft.status} />
          {owner && (
            <button
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() => setPending("delete")}
            >
              Delete quote
            </button>
          )}
        </div>
      </div>
      <dl className="quote-facts">
        <div>
          <dt>Customer</dt>
          <dd>{draft.customerName}</dd>
        </div>
        <div>
          <dt>Job address</dt>
          <dd>{draft.address || "Not given"}</dd>
        </div>
        <div>
          <dt>Payment terms</dt>
          <dd>{draft.paymentTerms}</dd>
        </div>
        <div>
          <dt>Send invoices to</dt>
          <dd>{draft.invoiceEmail || "Not given"}</dd>
        </div>
      </dl>
      {!noPrice && <BuildUp lines={draft.lines} />}
      <div className="editor">
        <div className="editor-main">
          {noPrice ? (
            <section className="sheet visit">
              <span className="visit-mark">
                <MapPin size={22} aria-hidden="true" />
              </span>
              <h2>
                {draft.status === "declined"
                  ? "This work isn’t offered"
                  : "A site visit comes first"}
              </h2>
              <p>{draft.summary}</p>
              <div className="alert alert-info">
                <Info size={17} aria-hidden="true" />
                <div>
                  No ballpark, minimum charge, or setup cost has been added.
                </div>
              </div>
              {draft.status === "site_visit_required" && (
                <div className="after-visit">
                  <h3>Been to the site?</h3>
                  {owner ? (
                    <>
                      <p>
                        Write what you found, then price the job here.{" "}
                        {draft.afterVisit?.lines.length
                          ? `The ${draft.afterVisit.lines.length} items worked out from the email are added for you to check.`
                          : "You’ll add the items from your price list."}
                      </p>
                      <label className="label" htmlFor="visit-notes">
                        What did you find on the visit?
                      </label>
                      <textarea
                        id="visit-notes"
                        className="textarea"
                        rows={3}
                        value={visitNotes}
                        aria-invalid={!!visitError || undefined}
                        aria-describedby={
                          visitError ? "visit-notes-error" : undefined
                        }
                        onChange={(e) => {
                          setVisitNotes(e.target.value)
                          setVisitError("")
                        }}
                        placeholder="e.g. Measured 1,150 m². Drainage needed at the entrance. Work in two halves."
                        maxLength={2000}
                        disabled={busy}
                      />
                      {visitError && (
                        <p className="field-error" id="visit-notes-error">
                          {visitError}
                        </p>
                      )}
                      <button
                        className="btn btn-primary"
                        onClick={startPricing}
                        disabled={busy}
                        style={{ marginTop: 12 }}
                      >
                        {busy ? "Starting…" : "Price this job"}
                      </button>
                    </>
                  ) : (
                    <p>Only the owner can price a job after the site visit.</p>
                  )}
                </div>
              )}
            </section>
          ) : (
            <section className="sheet" aria-labelledby="scope-title">
              <div className="sheet-head">
                <div>
                  <h2 id="scope-title">Work and prices</h2>
                  <p>
                    Prices are before VAT.{" "}
                    {owner
                      ? "Change a quantity or price, or leave an item out."
                      : "You can change quantities or leave items out. Only the owner changes prices."}
                  </p>
                </div>
              </div>
              <div className="table-scroll">
                <table className="lines table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Quantity</th>
                      <th className="num">Price each</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((line) => (
                      <LineRow
                        key={line.id}
                        line={line}
                        before={saved.lines.find((l) => l.id === line.id)}
                        total={
                          totals.lines.find((l) => l.id === line.id)!.totalPence
                        }
                        owner={owner}
                        noteOpen={openNotes.has(line.id)}
                        onOpenNote={() =>
                          setOpenNotes((s) => new Set(s).add(line.id))
                        }
                        problem={problemFor}
                        onChange={(patch) => editLine(line.id, patch)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {owner && (
                <div className="add-line">
                  <ItemPicker
                    rates={rates.filter(
                      (rate) =>
                        rate.status === "active" &&
                        !["MI01", "PL02", "SETUP"].includes(rate.code) &&
                        !draft.lines.some(
                          (l) => l.code === rate.code && !l.excluded
                        )
                    )}
                    onPick={addLine}
                    disabled={busy}
                  />
                </div>
              )}
            </section>
          )}
          <section className="sheet" aria-labelledby="checks-title">
            <div className="sheet-head">
              <div>
                <h2 id="checks-title">
                  {noPrice ? "To check on site" : "Things to check"}
                  {!noPrice && (
                    <span className="count">
                      {openChecks.length
                        ? `${openChecks.length} left`
                        : "all done"}
                    </span>
                  )}
                </h2>
                <p>
                  {noPrice
                    ? "Take these to the visit. Start a new quote once you’ve seen the job."
                    : "For each one, write a few words about what you checked."}
                </p>
              </div>
            </div>
            <ul className="checklist">
              {draft.issues.map((issue) => {
                const state =
                  !issue.blocking || noPrice
                    ? "notice"
                    : done(issue.resolution)
                      ? "done"
                      : "open"
                const locked = issue.ownerOnly && !owner
                const problem = problemFor(`issue-${issue.id}`)
                return (
                  <li className={`check-item ${state}`} key={issue.id}>
                    <div className="check-item-title">
                      {state === "done" ? (
                        <Check size={16} aria-hidden="true" />
                      ) : state === "open" ? (
                        <AlertTriangle size={16} aria-hidden="true" />
                      ) : (
                        <Info size={16} aria-hidden="true" />
                      )}
                      {issue.title}
                      {issue.ownerOnly && (
                        <span className="tag tag-owner">Owner only</span>
                      )}
                      {!issue.blocking && (
                        <span className="tag">Just so you know</span>
                      )}
                    </div>
                    <p>{issue.detail}</p>
                    {issue.blocking && !noPrice && (
                      <>
                        <textarea
                          id={`issue-${issue.id}`}
                          className="textarea"
                          aria-label={`Resolution: ${issue.title}`}
                          aria-invalid={!!problem || undefined}
                          aria-describedby={
                            problem ? `issue-${issue.id}-error` : undefined
                          }
                          rows={2}
                          value={issue.resolution}
                          placeholder={
                            locked
                              ? "The owner needs to fill this in."
                              : "What did you check? e.g. “Measured on site: 18 m²”"
                          }
                          disabled={locked}
                          onChange={(e) =>
                            change((current) => ({
                              ...current,
                              issues: current.issues.map((i) =>
                                i.id === issue.id
                                  ? { ...i, resolution: e.target.value }
                                  : i
                              ),
                            }))
                          }
                        />
                        <FieldError
                          id={`issue-${issue.id}-error`}
                          problem={problem}
                        />
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
          <details className="sheet source">
            <summary>
              The customer’s original email
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <pre>{draft.rawText}</pre>
          </details>
        </div>
        <aside className="summary" aria-label="Quote total and approval">
          <section className="sheet">
            <div className="sheet-body">
              {noPrice ? (
                <>
                  <div className="total-label">Price</div>
                  <div className="total-big pending">Not priced</div>
                  <p className="approval-note">
                    {draft.status === "declined"
                      ? "Reply to the customer explaining what you don’t offer."
                      : "Book a visit. Once you’ve been, use “Price this job” to add prices."}
                  </p>
                </>
              ) : (
                <>
                  <div>
                    <div className="total-label">
                      {totals.totalPence === null
                        ? "Total so far (not finished)"
                        : "Total including VAT"}
                    </div>
                    <div
                      className={`total-big ${totals.totalPence === null ? "pending" : ""}`}
                    >
                      {totals.totalPence === null
                        ? money(totals.subtotalPence)
                        : money(totals.totalPence)}
                    </div>
                  </div>
                  <dl className="summary-rows">
                    {totals.totalPence === null ? (
                      <div>
                        <dt>Before VAT, priced items only</dt>
                        <dd>{money(totals.subtotalPence)}</dd>
                      </div>
                    ) : (
                      <>
                        <div>
                          <dt>Before VAT</dt>
                          <dd>{money(totals.subtotalPence)}</dd>
                        </div>
                        {totals.minimumTopUpPence > 0 && (
                          <div>
                            <dt>
                              Top-up to {money(company.minimumPence)} minimum
                            </dt>
                            <dd>{money(totals.minimumTopUpPence)}</dd>
                          </div>
                        )}
                        <div>
                          <dt>VAT ({company.vatPercent}%)</dt>
                          <dd>{money(totals.vatPence)}</dd>
                        </div>
                      </>
                    )}
                    <div>
                      <dt>Quote valid for</dt>
                      <dd>{company.validityDays} days</dd>
                    </div>
                  </dl>
                  {showProblems && problems.length > 0 && (
                    <div className="fix-list" role="alert">
                      <strong>
                        Fix{" "}
                        {problems.length === 1
                          ? "this"
                          : `these ${problems.length} things`}{" "}
                        before saving
                      </strong>
                      <ul>
                        {problems.map((p) => (
                          <li key={p.field}>
                            <button onClick={() => jumpTo(p.field)}>
                              {describe(p, draft)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {error && (
                    <div className="alert alert-error" role="alert">
                      <AlertTriangle size={17} aria-hidden="true" />
                      <div>{error}</div>
                    </div>
                  )}
                  {dirty && !(showProblems && problems.length) && (
                    <p className="unsaved">You have unsaved changes</p>
                  )}
                  <button
                    className="btn btn-secondary btn-full"
                    disabled={!dirty || busy}
                    onClick={requestSave}
                  >
                    {busy && !pending ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    className="btn btn-approve btn-full"
                    disabled={dirty || !!blocked || busy}
                    onClick={requestApprove}
                  >
                    <CheckCircle2 size={17} aria-hidden="true" />
                    {approved ? "Approved" : "Approve quote"}
                  </button>
                  {approved ? (
                    <SendQuote
                      quote={totals}
                      company={company}
                      mail={mail}
                      onSent={onSent}
                    />
                  ) : todo.length ? (
                    <div className="todo">
                      <span>Before you can approve:</span>
                      <ul>
                        {todo.map((item) => (
                          <li key={item.label}>
                            {item.field ? (
                              <button onClick={() => jumpTo(item.field!)}>
                                {item.label}
                              </button>
                            ) : (
                              item.label
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="approval-note">
                      Everything’s done. Approving doesn’t send anything.
                    </p>
                  )}
                </>
              )}
              {draft.approvedAt && (
                <div className="stamp">
                  <CheckCircle2 size={20} aria-hidden="true" />
                  <div>
                    <strong>Approved by {draft.approvedBy}</strong>
                    {new Date(draft.approvedAt).toLocaleDateString("en-GB")},
                    valid until{" "}
                    {new Date(draft.expiresAt!).toLocaleDateString("en-GB")}
                  </div>
                </div>
              )}
            </div>
          </section>
          <section
            className="sheet"
            style={{ marginTop: 20 }}
            aria-labelledby="activity-title"
          >
            <div className="sheet-head">
              <h2 id="activity-title">History</h2>
            </div>
            <div className="sheet-body">
              <ol className="activity">
                {draft.activity
                  .slice(-6)
                  .reverse()
                  .map((event, i) => (
                    <li key={`${event.at}-${i}`}>
                      <time dateTime={event.at}>{shortDate(event.at)}</time>
                      <span>{event.message}</span>
                    </li>
                  ))}
              </ol>
            </div>
          </section>
        </aside>
      </div>
      <ConfirmDialog
        open={pending === "delete"}
        title={`Delete ${saved.reference}?`}
        confirmLabel="Delete quote"
        tone="danger"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          setBusy(true)
          setError("")
          try {
            await onDelete(saved.version)
            setDirty(false)
            toast("Quote deleted.")
          } catch (e) {
            setError((e as Error).message)
            setPending(null)
          } finally {
            setBusy(false)
          }
        }}
      >
        <p>
          This permanently deletes this quote, its saved enquiry and its sending
          history. It cannot be undone. Emails already sent to the customer are
          not recalled.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={pending === "approve"}
        title="Approve this quote?"
        confirmLabel="Yes, approve quote"
        tone="approve"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={approve}
      >
        <p>
          You’re confirming the work and price are right. Nothing is sent to the
          customer; you send it yourself.
        </p>
        <dl className="dialog-facts">
          <div>
            <dt>Customer</dt>
            <dd>{draft.customerName}</dd>
          </div>
          <div>
            <dt>Total including VAT</dt>
            <dd>{money(totals.totalPence)}</dd>
          </div>
          <div>
            <dt>Valid until</dt>
            <dd>{validUntil}</dd>
          </div>
        </dl>
      </ConfirmDialog>
      <ConfirmDialog
        open={pending === "save-approved"}
        title="Save and clear the approval?"
        confirmLabel="Save and clear approval"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          setPending(null)
          await save()
        }}
      >
        <p>
          This quote is already approved. Saving a change means it needs
          approving again.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={pending === "leave"}
        title="Leave without saving?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          setPending(null)
          setDirty(false)
          onBack()
        }}
      >
        <p>Your changes to this quote haven’t been saved.</p>
      </ConfirmDialog>
    </>
  )
}
// Names the item a problem belongs to, so the list reads "Skip 8 yard: …".
function describe(problem: Problem, quote: Quote) {
  const id = problem.field.replace(/^(qty|rate|note|issue)-/, "")
  const name =
    quote.lines.find((l) => l.id === id)?.description ||
    quote.issues.find((i) => i.id === id)?.title
  return name ? `${name}: ${problem.message}` : problem.message
}
function FieldError({ id, problem }: { id: string; problem?: Problem }) {
  return problem ? (
    <p className="field-error" id={id}>
      {problem.message}
    </p>
  ) : null
}
function LineRow({
  line,
  before,
  total,
  owner,
  noteOpen,
  onOpenNote,
  problem,
  onChange,
}: {
  line: QuoteLine
  before?: QuoteLine
  total: number | null
  owner: boolean
  noteOpen: boolean
  onOpenNote: () => void
  problem: (field: string) => Problem | undefined
  onChange: (patch: Partial<QuoteLine>) => void
}) {
  const isSetup = ["PL02", "SETUP"].includes(line.code || "")
  const changed =
    !before ||
    line.excluded !== before.excluded ||
    line.ratePence !== before.ratePence
  // The note box only appears when a reason is needed or someone asks for it.
  const showNote = noteOpen || changed
  const qty = problem(`qty-${line.id}`)
  const rate = problem(`rate-${line.id}`)
  const note = problem(`note-${line.id}`)
  const unpriced = !line.excluded && total === null
  return (
    <tr
      className={`${line.excluded ? "is-excluded" : ""} ${unpriced ? "is-unpriced" : ""}`}
    >
      <td>
        <div className="line-name">{line.description}</div>
        <div className="line-meta">
          per {line.unit}
          {line.code ? (
            <>
              {" · "}
              <span className="code">{line.code}</span>
            </>
          ) : (
            " · not in your price list"
          )}
        </div>
        {showNote ? (
          <>
            <input
              id={`note-${line.id}`}
              className="input line-note"
              aria-label={`Note for ${line.description}`}
              aria-invalid={!!note || undefined}
              aria-describedby={note ? `note-${line.id}-error` : undefined}
              value={line.note}
              onChange={(e) => onChange({ note: e.target.value })}
              placeholder={
                line.excluded
                  ? "Why is it left out? e.g. “Customer will do this”"
                  : "Why? e.g. “Agreed price with customer”"
              }
            />
            <FieldError id={`note-${line.id}-error`} problem={note} />
          </>
        ) : (
          line.note && (
            <p className="line-note-text">
              {line.note}{" "}
              <button className="link-btn" onClick={onOpenNote}>
                Edit note
              </button>
            </p>
          )
        )}
        <div className="line-controls">
          <label className="check">
            <input
              type="checkbox"
              checked={line.excluded}
              disabled={isSetup}
              onChange={(e) => onChange({ excluded: e.target.checked })}
            />
            Leave this out
          </label>
          {isSetup ? (
            <span className="muted">Charged on every job</span>
          ) : (
            !showNote &&
            !line.note && (
              <button className="link-btn" onClick={onOpenNote}>
                Add note
              </button>
            )
          )}
        </div>
      </td>
      <td className="num" data-label="Quantity">
        <input
          id={`qty-${line.id}`}
          className="input qty-input"
          aria-label={`Quantity for ${line.description}`}
          aria-invalid={!!qty || undefined}
          type="number"
          inputMode="decimal"
          min="0.001"
          max="100000"
          step="any"
          value={line.quantity ?? ""}
          onChange={(e) =>
            onChange({
              quantity: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          placeholder="?"
          disabled={line.excluded}
        />
        <FieldError id={`qty-${line.id}-error`} problem={qty} />
      </td>
      <td className="num" data-label="Price each">
        <div className="money-input">
          <span aria-hidden="true">£</span>
          <input
            id={`rate-${line.id}`}
            className="input"
            aria-label={`Rate for ${line.description}`}
            aria-invalid={!!rate || undefined}
            type="number"
            inputMode="decimal"
            min="0"
            max="1000000"
            step="0.01"
            value={line.ratePence === null ? "" : line.ratePence / 100}
            onChange={(e) =>
              onChange({
                ratePence:
                  e.target.value === ""
                    ? null
                    : Math.round(Number(e.target.value) * 100),
              })
            }
            disabled={!owner || line.excluded}
            placeholder={owner ? "Add price" : "Owner"}
          />
        </div>
        <FieldError id={`rate-${line.id}-error`} problem={rate} />
      </td>
      <td className="num" data-label="Total">
        {line.excluded ? (
          <span className="muted">Left out</span>
        ) : total === null ? (
          <span className="unpriced">Needs a price</span>
        ) : (
          money(total)
        )}
      </td>
    </tr>
  )
}
