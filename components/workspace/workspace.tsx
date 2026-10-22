"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, X } from "lucide-react"
import type {
  Customer,
  Quote,
  Rate,
  WorkspaceData,
} from "@/features/quotes/types"
import type { MailStatus } from "@/lib/mail/presets"
import type { QuoteEdits } from "@/features/quotes/domain/pricing"
import { request } from "@/lib/http/client"
import { QuoteEditor } from "./quote-editor"
import { EmptyState, ToastProvider } from "./shared"
import { Settings } from "./settings"
import { Customers } from "./catalogues"
import { Rates } from "./rates"
import { Overview } from "./overview"
import { EnquiryComposer } from "./enquiry-composer"
import { WorkspaceShell } from "./workspace-shell"
import { mailBrand } from "./brand-icon"
export function Workspace({
  initialData,
  section,
  quoteId,
}: {
  initialData: WorkspaceData
  section: string
  quoteId?: string
}) {
  const router = useRouter()
  const [quotes, setQuotes] = useState(initialData.quotes)
  const [key, setKey] = useState(initialData.key)
  const [rates, setRates] = useState<Rate[]>(initialData.rates)
  const [customers, setCustomers] = useState<Customer[]>(initialData.customers)
  const [mail, setMail] = useState<MailStatus>(initialData.mail)
  const [composer, setComposer] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [savedEnquiry, setSavedEnquiry] = useState<{
    id: string
    text: string
  } | null>(null)
  const data = { ...initialData, quotes, key, rates, customers, mail }
  const href = (path: string) => `/${path}`
  const replace = (updated: Quote) =>
    setQuotes((current) =>
      current.map((q) => (q.id === updated.id ? updated : q))
    )
  async function saveQuote(edits: QuoteEdits) {
    const updated = await request<Quote>(
      `/api/quotes/${quoteId}`,
      "PATCH",
      edits
    )
    replace(updated)
    return updated
  }
  async function approve(version: number) {
    const updated = await request<Quote>(
      `/api/quotes/${quoteId}/approve`,
      "POST",
      {
        expectedVersion: version,
      }
    )
    replace(updated)
    return updated
  }
  async function priceAfterVisit(version: number, visitNotes: string) {
    const updated = await request<Quote>(
      `/api/quotes/${quoteId}/after-visit`,
      "POST",
      { expectedVersion: version, visitNotes }
    )
    replace(updated)
    return updated
  }
  // Drafts the quote for a saved enquiry and opens it.
  async function draft(enquiryId: string) {
    const quote = await request<Quote>(
      `/api/enquiries/${enquiryId}/generate`,
      "POST",
      {}
    )
    setQuotes((current) => [quote, ...current.filter((q) => q.id !== quote.id)])
    setComposer(false)
    router.push(href(`quotes/${quote.id}`))
    router.refresh()
  }
  async function generateFromEmail(uid: number) {
    setError("")
    setBusy(true)
    try {
      const enquiry = await request<{ id: string }>(
        `/api/inbox/${uid}`,
        "POST",
        {}
      )
      await draft(enquiry.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function generate() {
    setError("")
    setBusy(true)
    try {
      // Reuse the saved enquiry when retrying the same text, so a failed
      // generation never creates duplicates.
      const enquiry =
        savedEnquiry?.text === text
          ? savedEnquiry
          : await request<{ id: string }>("/api/enquiries", "POST", {
              rawText: text,
            })
      setSavedEnquiry({ id: enquiry.id, text })
      const quote = await request<Quote>(
        `/api/enquiries/${enquiry.id}/generate`,
        "POST",
        {}
      )
      setQuotes((current) => [
        quote,
        ...current.filter((q) => q.id !== quote.id),
      ])
      setComposer(false)
      setText("")
      setSavedEnquiry(null)
      router.push(href(`quotes/${quote.id}`))
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function logout() {
    try {
      await request("/api/auth/logout", "POST", {})
      router.push("/login")
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const activeQuote = quoteId ? quotes.find((q) => q.id === quoteId) : null
  return (
    <ToastProvider>
      <WorkspaceShell
        data={data}
        section={section}
        quoteId={quoteId}
        href={href}
        onLogout={logout}
        modal={
          composer ? (
            <EnquiryComposer
              samples={data.samples}
              aiReady={key.configured}
              mailReady={mail.configured}
              mailBrand={mailBrand(mail)}
              settingsHref={href("settings")}
              quoteHref={(id) => href(`quotes/${id}`)}
              onGenerateFromEmail={generateFromEmail}
              text={text}
              setText={setText}
              busy={busy}
              error={error}
              onClose={() => setComposer(false)}
              onGenerate={generate}
              clearError={() => setError("")}
            />
          ) : null
        }
      >
        {error && !composer && (
          <div
            className="alert alert-error"
            role="alert"
            style={{ marginBottom: 20 }}
          >
            <AlertTriangle size={17} aria-hidden="true" />
            <div>{error}</div>
            <button
              className="icon-btn"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {quoteId ? (
          activeQuote ? (
            <QuoteEditor
              key={`${activeQuote.id}-${activeQuote.version}`}
              quote={activeQuote}
              rates={data.rates}
              company={data.company}
              role={data.user.role}
              onBack={() => router.push(href("quotes"))}
              onSave={saveQuote}
              onApprove={approve}
              onPriceAfterVisit={priceAfterVisit}
              onDelete={async (version) => {
                await request(`/api/quotes/${quoteId}`, "DELETE", {
                  expectedVersion: version,
                })
                setQuotes((current) => current.filter((q) => q.id !== quoteId))
                router.push(href("quotes"))
                router.refresh()
              }}
              mail={mail}
              onSent={(sent) =>
                setQuotes((current) =>
                  current.map((q) =>
                    q.id === activeQuote.id ? { ...q, lastSent: sent } : q
                  )
                )
              }
            />
          ) : (
            <EmptyState
              title="Quote not found"
              description="It may belong to another company, or it was removed. Go back to your quotes."
            />
          )
        ) : section === "settings" ? (
          <Settings data={data} onKeyChange={setKey} onMailChange={setMail} />
        ) : section === "customers" ? (
          <Customers data={data} onChange={setCustomers} />
        ) : section === "rates" ? (
          <Rates data={data} onChange={setRates} />
        ) : (
          <Overview
            key={section}
            data={data}
            section={section}
            href={href}
            onNew={() => {
              setComposer(true)
              setError("")
            }}
            onResume={(enquiry) => {
              setText(enquiry.raw_text)
              setSavedEnquiry({ id: enquiry.id, text: enquiry.raw_text })
              setError("")
              setComposer(true)
            }}
          />
        )}
      </WorkspaceShell>
    </ToastProvider>
  )
}
