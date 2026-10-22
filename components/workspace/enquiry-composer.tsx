"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  Inbox,
  Mail,
  Settings2,
  LoaderCircle,
  PenLine,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import type { Sample } from "@/features/quotes/types"
import type { InboxMessage } from "@/lib/mail/presets"
import { request } from "@/lib/http/client"
import { Avatar, ConfirmDialog, Dialog } from "./shared"
import { SelectMenu } from "./select-menu"
import { BrandIcon, type Brand } from "./brand-icon"

type Tab = "inbox" | "paste"
type Preview = {
  uid: number
  from: string
  fromEmail: string
  subject: string
  date: string | null
  text: string
  truncated: boolean
  empty: boolean
  enquiryId: string | null
  quoteId: string | null
}
export function EnquiryComposer({
  samples,
  aiReady,
  mailReady,
  mailBrand,
  settingsHref,
  quoteHref,
  text,
  setText,
  busy,
  error,
  onClose,
  onGenerate,
  onGenerateFromEmail,
  clearError,
}: {
  samples: Sample[]
  aiReady: boolean
  mailReady: boolean
  mailBrand: Brand | null
  settingsHref: string
  quoteHref: (id: string) => string
  text: string
  setText: (text: string) => void
  busy: boolean
  error: string
  onClose: () => void
  onGenerate: () => void
  onGenerateFromEmail: (uid: number) => void
  clearError: () => void
}) {
  const [tab, setTab] = useState<Tab>(text.trim() ? "paste" : "inbox")
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const typed = text.trim().length > 0
  const isSample = samples.some((s) => s.text.trim() === text.trim())
  // Pasted text is easy to lose, so closing with your own words asks first.
  function requestClose() {
    if (busy) return
    if (tab === "paste" && typed && !isSample) setConfirmDiscard(true)
    else onClose()
  }
  return (
    <>
      <Dialog open labelledBy="composer-title" className="composer">
        <div className="composer-body">
          <header className="composer-head">
            <button
              type="button"
              className="icon-btn dialog-close"
              aria-label="Close new quote"
              disabled={busy}
              onClick={requestClose}
            >
              <X size={20} />
            </button>
            <h2 id="composer-title">New quote</h2>
            <p>
              Start from a customer’s email. The draft uses your prices; you
              check it before anything is approved.
            </p>
            <div
              className="seg"
              role="tablist"
              aria-label="Where the enquiry comes from"
            >
              <button
                role="tab"
                id="tab-inbox"
                aria-selected={tab === "inbox"}
                aria-controls="panel-inbox"
                onClick={() => {
                  setTab("inbox")
                  clearError()
                }}
                disabled={busy}
              >
                {mailBrand ? (
                  <BrandIcon brand={mailBrand} size={16} />
                ) : (
                  <Inbox size={16} aria-hidden="true" />
                )}
                From your inbox
              </button>
              <button
                role="tab"
                id="tab-paste"
                aria-selected={tab === "paste"}
                aria-controls="panel-paste"
                onClick={() => {
                  setTab("paste")
                  clearError()
                }}
                disabled={busy}
              >
                <PenLine size={16} aria-hidden="true" />
                Paste an email
              </button>
            </div>
          </header>
          {!aiReady && (
            <div className="alert alert-warn">
              <AlertTriangle size={17} aria-hidden="true" />
              <div>
                <strong>No AI key connected</strong>
                Add an Anthropic or OpenAI key before drafting.{" "}
                <Link className="text-link" href={settingsHref}>
                  Open settings
                </Link>
              </div>
            </div>
          )}
          {tab === "inbox" ? (
            <div
              role="tabpanel"
              id="panel-inbox"
              aria-labelledby="tab-inbox"
              className="composer-panel"
            >
              {mailReady ? (
                <InboxPicker
                  busy={busy}
                  aiReady={aiReady}
                  error={error}
                  quoteHref={quoteHref}
                  onClose={onClose}
                  onDraft={onGenerateFromEmail}
                />
              ) : (
                <div className="composer-scroll composer-center">
                  <section
                    className="mail-setup"
                    aria-labelledby="mail-setup-title"
                  >
                    <div className="mail-setup-icon" aria-hidden="true">
                      <Mail size={30} strokeWidth={1.5} />
                    </div>
                    <div className="mail-setup-copy">
                      <span className="mail-setup-status">
                        Email not connected
                      </span>
                      <h3 id="mail-setup-title">
                        Bring customer enquiries into Fieldquote
                      </h3>
                      <p>
                        Connect your business email to choose an enquiry from
                        your inbox and send approved quotes from the same
                        address.
                      </p>
                    </div>
                    <div className="mail-setup-actions">
                      <Link
                        className="btn btn-primary"
                        href={`${settingsHref}#email`}
                        onClick={onClose}
                      >
                        <Settings2 size={16} aria-hidden="true" /> Set up email
                      </Link>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setTab("paste")
                          clearError()
                        }}
                      >
                        <PenLine size={16} aria-hidden="true" /> Paste an email
                        instead
                      </button>
                    </div>
                    <p className="mail-setup-note">
                      Have your email login and your provider’s IMAP and SMTP
                      settings ready. You may need an app password.
                    </p>
                  </section>
                </div>
              )}
            </div>
          ) : (
            <PastePanel
              samples={samples}
              aiReady={aiReady}
              text={text}
              setText={setText}
              busy={busy}
              error={error}
              clearError={clearError}
              onGenerate={onGenerate}
              onCancel={requestClose}
            />
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this enquiry?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          setText("")
          onClose()
        }}
      >
        <p>The text you pasted hasn’t been saved yet.</p>
      </ConfirmDialog>
    </>
  )
}
const whenFormat = (iso: string | null) => {
  if (!iso) return ""
  const date = new Date(iso)
  const today = new Date()
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}
// Newest emails first; scrolling to the bottom loads the next page.
function InboxPicker({
  busy,
  aiReady,
  error,
  quoteHref,
  onClose,
  onDraft,
}: {
  busy: boolean
  aiReady: boolean
  error: string
  quoteHref: (id: string) => string
  onClose: () => void
  onDraft: (uid: number) => void
}) {
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [next, setNext] = useState<number | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewLoading, setPreviewLoading] = useState<number | null>(null)
  const [previewError, setPreviewError] = useState("")
  const list = useRef<HTMLDivElement>(null)
  const [mailSearch, setMailSearch] = useState("")
  const [mailFilter, setMailFilter] = useState("all")
  const filteredMessages = messages.filter(
    (m) =>
      `${m.from} ${m.subject}`
        .toLowerCase()
        .includes(mailSearch.toLowerCase()) &&
      (mailFilter === "all" ||
        (mailFilter === "quoted" ? !!m.quoteId : !m.quoteId))
  )
  const loadingRef = useRef(false)
  const loadPage = useCallback((before?: number) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setLoadError("")
    request<{ messages: InboxMessage[]; next: number | null }>(
      `/api/inbox${before ? `?before=${before}` : ""}`
    )
      .then((page) => {
        setMessages((current) => [
          ...current,
          ...page.messages.filter((m) => !current.some((c) => c.uid === m.uid)),
        ])
        setNext(page.next)
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => {
        loadingRef.current = false
        setLoading(false)
      })
  }, [])
  useEffect(() => {
    loadPage()
  }, [loadPage])
  function open(message: InboxMessage) {
    setPreviewError("")
    setPreviewLoading(message.uid)
    request<Preview>(`/api/inbox/${message.uid}`)
      .then(setPreview)
      .catch((e: Error) => setPreviewError(e.message))
      .finally(() => setPreviewLoading(null))
  }
  if (preview)
    return (
      <div className="mail-preview">
        <div className="composer-scroll">
          <button
            className="back-link"
            onClick={() => setPreview(null)}
            disabled={busy}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back to inbox
          </button>
          <h3>{preview.subject}</h3>
          <p className="mail-meta">
            From {preview.from}
            {preview.fromEmail && preview.fromEmail !== preview.from
              ? ` <${preview.fromEmail}>`
              : ""}
            {preview.date
              ? `, ${new Date(preview.date).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </p>
          <pre className="mail-body">
            {preview.text.split("\n\n").slice(1).join("\n\n") ||
              "(This email has no readable text.)"}
          </pre>
          {preview.truncated && (
            <p className="hint">
              This email is very long. Only the first 20,000 characters are used
              for the draft.
            </p>
          )}
          {preview.quoteId && (
            <div className="alert alert-info">
              <div>
                A quote was already made from this email.{" "}
                <Link
                  className="text-link"
                  href={quoteHref(preview.quoteId)}
                  onClick={onClose}
                >
                  Open that quote
                </Link>
              </div>
            </div>
          )}
          {error && (
            <div className="alert alert-error" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              <div>{error}</div>
            </div>
          )}
        </div>
        <div className="composer-foot">
          {busy && (
            <span className="progress-note" role="status">
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
              Reading the email and pricing it. This can take 20 seconds.
            </span>
          )}
          <button
            className="btn btn-primary"
            disabled={busy || !aiReady || preview.empty || !!preview.quoteId}
            onClick={() => onDraft(preview.uid)}
          >
            {busy ? "Drafting…" : "Draft quote from this email"}
          </button>
        </div>
      </div>
    )
  return (
    <div className="inbox">
      <div className="inbox-tools">
        <label className="inbox-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search loaded emails</span>
          <input
            className="input"
            type="search"
            value={mailSearch}
            onChange={(e) => setMailSearch(e.target.value)}
            placeholder="Sender or subject"
          />
        </label>
        <SelectMenu
          label="Quote status"
          value={mailFilter}
          onChange={setMailFilter}
          className="inbox-filter"
          options={[
            { value: "all", label: "All emails" },
            { value: "quoted", label: "Quote made" },
            { value: "unquoted", label: "No quote yet" },
          ]}
        />
      </div>
      <div className="inbox-list" ref={list} aria-busy={loading}>
        {messages.length === 0 &&
          !loading &&
          !loadError &&
          next !== undefined && (
            <div className="inbox-empty">
              <Inbox size={28} strokeWidth={1.5} aria-hidden="true" />
              <h3>Your inbox is empty</h3>
              <p>New emails will show up here.</p>
            </div>
          )}
        <ul>
          {filteredMessages.map((m) => (
            <li key={m.uid}>
              <button
                className="mail-row"
                onClick={() => open(m)}
                disabled={busy || previewLoading !== null}
              >
                <span className="mail-avatar">
                  <Avatar name={m.from} />
                </span>
                <span className="mail-from">
                  {m.from}
                  {m.quoteId ? (
                    <span className="tag tag-done">Quote made</span>
                  ) : m.enquiryId ? (
                    <span className="tag">Saved</span>
                  ) : null}
                </span>
                <span className="mail-subject">{m.subject}</span>
                <time className="mail-date" dateTime={m.date || undefined}>
                  {previewLoading === m.uid ? (
                    <LoaderCircle
                      size={15}
                      className="spin"
                      aria-label="Opening"
                    />
                  ) : (
                    whenFormat(m.date)
                  )}
                </time>
              </button>
            </li>
          ))}
        </ul>
        {loading && (
          <div className="mail-loading" role="status">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="mail-skeleton" aria-hidden="true">
                <span className="skeleton" />
                <span className="skeleton" />
                <span className="skeleton" />
              </span>
            ))}
            <span className="sr-only">Loading emails</span>
          </div>
        )}
        {loadError && (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={17} aria-hidden="true" />
            <div>
              {loadError}{" "}
              <button
                className="link-btn"
                onClick={() =>
                  loadPage(messages.length ? next || undefined : undefined)
                }
              >
                <RotateCcw size={13} aria-hidden="true" /> Try again
              </button>
            </div>
          </div>
        )}
        {next === null && messages.length > 0 && (
          <p className="inbox-end">That’s every email in the inbox.</p>
        )}
        {!loading && messages.length > 0 && !filteredMessages.length && (
          <p className="inbox-end">
            No loaded emails match. Clear the filters or load older emails.
          </p>
        )}
        {next != null && !loading && (
          <div className="inbox-more">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => loadPage(next)}
            >
              Load older emails
            </button>
          </div>
        )}
      </div>
      {previewError && (
        <div className="alert alert-error inbox-alert" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <div>{previewError}</div>
        </div>
      )}
    </div>
  )
}
function PastePanel({
  samples,
  aiReady,
  text,
  setText,
  busy,
  error,
  clearError,
  onGenerate,
  onCancel,
}: {
  samples: Sample[]
  aiReady: boolean
  text: string
  setText: (text: string) => void
  busy: boolean
  error: string
  clearError: () => void
  onGenerate: () => void
  onCancel: () => void
}) {
  const ready = aiReady && text.trim().length >= 10
  return (
    <form
      role="tabpanel"
      id="panel-paste"
      aria-labelledby="tab-paste"
      className="composer-panel"
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy && ready) onGenerate()
      }}
    >
      <div className="composer-scroll">
        <div className="field">
          <label className="label" htmlFor="enquiry-text">
            Customer enquiry
          </label>
          <textarea
            id="enquiry-text"
            className="textarea"
            data-autofocus=""
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (error) clearError()
            }}
            maxLength={20000}
            placeholder={
              "From: Jane Smith <jane@example.com>\nSubject: Patio quote\n\nHi Dave, we’d like a new patio, about 4m by 5m…"
            }
            disabled={busy}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey) &&
                ready
              ) {
                event.preventDefault()
                onGenerate()
              }
            }}
          />
          <div className="composer-meta">
            <span>
              {text.trim() && text.trim().length < 10
                ? "Paste the whole email, including who it’s from."
                : "⌘/Ctrl + Enter to draft"}
            </span>
            <span>{text.length.toLocaleString()} of 20,000 characters</span>
          </div>
        </div>
        <div className="samples">
          <span className="label">Or use one of the supplied enquiries</span>
          <div className="samples-list">
            {samples.map((sample) => (
              <button
                type="button"
                className="sample"
                disabled={busy}
                key={sample.id}
                aria-pressed={text.trim() === sample.text.trim()}
                onClick={() => {
                  setText(sample.text)
                  clearError()
                }}
              >
                <strong>{sample.title}</strong>
                <span>{sample.label}</span>
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={17} aria-hidden="true" />
            <div>{error}</div>
          </div>
        )}
      </div>
      <div className="composer-foot">
        {busy && (
          <span className="progress-note" role="status">
            <LoaderCircle size={16} className="spin" aria-hidden="true" />
            Reading the enquiry and pricing it. This can take 20 seconds.
          </span>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !ready}
        >
          {busy ? "Drafting…" : "Draft quote"}
        </button>
      </div>
    </form>
  )
}
