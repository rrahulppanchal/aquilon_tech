"use client"
import { useState } from "react"
import { Copy, Mail, Send } from "lucide-react"
import type { Company, Quote } from "@/features/quotes/types"
import type { MailStatus } from "@/lib/mail/presets"
import { quoteText } from "@/features/quotes/domain/quote-text"
import { request } from "@/lib/http/client"
import { ConfirmDialog, useToast } from "./shared"
import { BrandIcon, mailBrand } from "./brand-icon"
type Sent = NonNullable<Quote["lastSent"]>
// With a connected mailbox the quote is sent from the company's own address,
// after a confirmation showing exactly what goes out. Without one, it opens
// the user's email app or copies the text instead.
export function SendQuote({
  quote,
  company,
  mail,
  onSent,
}: {
  quote: Quote
  company: Company
  mail: MailStatus
  onSent: (sent: Sent) => void
}) {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const text = quoteText(quote, company)
  const to = quote.customerEmail?.trim()
  const subject = `Your quote from ${company.name}: ${quote.title}`
  const first = quote.customerName.split(" ")[0] || "customer"
  const mailto = `mailto:${encodeURIComponent(to || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
  const sent = quote.lastSent
  async function send() {
    setBusy(true)
    setError("")
    try {
      const result = await request<Sent>(
        `/api/quotes/${quote.id}/send`,
        "POST",
        {
          expectedVersion: quote.version,
        }
      )
      onSent(result)
      setConfirm(false)
      toast(`Quote sent to ${result.to}.`)
    } catch (e) {
      setError((e as Error).message)
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="send">
      {sent ? (
        <p className="sent-note">
          <Send size={15} aria-hidden="true" />
          Sent to {sent.to} on{" "}
          {new Date(sent.at).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {sent.by ? ` by ${sent.by}` : ""}.
        </p>
      ) : (
        <p className="approval-note">Approved. It hasn’t been sent yet.</p>
      )}
      {mail.configured && to ? (
        <button
          className="btn btn-primary btn-full"
          onClick={() => setConfirm(true)}
        >
          <Send size={16} aria-hidden="true" />
          {sent ? `Send to ${first} again` : `Send to ${first}`}
        </button>
      ) : (
        <a className="btn btn-primary btn-full" href={mailto}>
          <Mail size={16} aria-hidden="true" />
          Email to {to ? first : "customer"}
        </a>
      )}
      <button
        className="btn btn-secondary btn-full"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            toast("Quote copied. Paste it into an email or message.")
          } catch {
            toast(
              "Couldn’t copy. Select the text in your email instead.",
              "error"
            )
          }
        }}
      >
        <Copy size={16} aria-hidden="true" />
        Copy quote text
      </button>
      {mail.configured && to && (
        <a className="link-btn" href={mailto}>
          Open in my email app instead
        </a>
      )}
      {!mail.configured && (
        <p className="hint">
          Connect your email in Settings to send quotes from here.
        </p>
      )}
      {mail.configured && !to && (
        <p className="hint">
          This customer has no email address, so the quote can’t be sent from
          here.
        </p>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          <div>{error}</div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Send this quote to ${first}?`}
        confirmLabel={busy ? "Sending…" : "Send quote"}
        tone="approve"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={send}
      >
        <dl className="dialog-facts" style={{ marginTop: 0 }}>
          <div>
            <dt>To</dt>
            <dd>{to}</dd>
          </div>
          <div>
            <dt>From</dt>
            <dd className="with-brand">
              {mailBrand(mail) && (
                <BrandIcon brand={mailBrand(mail)!} size={16} />
              )}
              {mail.email}
            </dd>
          </div>
          <div>
            <dt>Subject</dt>
            <dd>{subject}</dd>
          </div>
        </dl>
        <pre className="mail-body send-preview">{text}</pre>
      </ConfirmDialog>
    </div>
  )
}
