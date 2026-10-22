"use client"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { CheckCircle2, AlertTriangle, Search, X } from "lucide-react"
import type { Quote } from "@/features/quotes/types"
export const statusLabels: Record<Quote["status"], string> = {
  draft: "Ready to approve",
  needs_review: "Needs review",
  site_visit_required: "Site visit",
  declined: "Not offered",
  approved: "Approved",
}
export function StatusBadge({ status }: { status: Quote["status"] }) {
  return (
    <span className={`status status-${status}`}>{statusLabels[status]}</span>
  )
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function PageHeading({
  title,
  description,
  action,
  date,
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  date?: string
}) {
  return (
    <div className="page-head">
      <div>
        {/* Date and greeting depend on the viewer's clock, which can differ from the server's. */}
        {date && (
          <span className="date" suppressHydrationWarning>
            {date}
          </span>
        )}
        <h1 suppressHydrationWarning>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="search">
      <Search size={15} aria-hidden="true" />
      <input
        className="input"
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

/* Native <dialog> gives focus trapping, an inert page behind and focus
   restoration on close without extra code. Modals close only through their
   own Close or Cancel buttons: Escape and clicks on the backdrop are ignored,
   so a stray key or click never throws away a half-filled form. */
export function Dialog({
  open,
  labelledBy,
  className = "",
  children,
}: {
  open: boolean
  labelledBy: string
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={labelledBy}
      // Supporting browsers stop Escape at the source; the handlers below
      // cover the rest, including Chrome closing on a repeated Escape.
      closedby="none"
      onCancel={(event) => event.preventDefault()}
      onClose={(event) => {
        if (open) event.currentTarget.showModal()
      }}
    >
      {open && children}
    </dialog>
  )
}
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: "primary" | "approve" | "danger"
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} labelledBy="confirm-title">
      <div className="dialog-body">
        <h2 id="confirm-title">{title}</h2>
        {children}
      </div>
      <div className="dialog-actions">
        {/* Destructive actions start focus on the safe choice. */}
        <button
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={busy}
          data-autofocus={tone === "danger" ? "" : undefined}
        >
          {cancelLabel}
        </button>
        <button
          className={`btn btn-${tone}`}
          onClick={onConfirm}
          disabled={busy}
          data-autofocus={tone !== "danger" ? "" : undefined}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}

type Toast = { id: number; message: string; tone: "success" | "error" }
const ToastContext = createContext<
  (message: string, tone?: Toast["tone"]) => void
>(() => undefined)
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback(
    (id: number) => setToasts((current) => current.filter((t) => t.id !== id)),
    []
  )
  const push = useCallback(
    (message: string, tone: Toast["tone"] = "success") => {
      const id = Date.now() + Math.random()
      setToasts((current) => [...current.slice(-2), { id, message, tone }])
      setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4500)
    },
    [dismiss]
  )
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.tone === "success" ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <AlertTriangle size={18} aria-hidden="true" />
            )}
            <span>{toast.message}</span>
            <button
              className="icon-btn"
              aria-label="Dismiss message"
              onClick={() => dismiss(toast.id)}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
export const useToast = () => useContext(ToastContext)
export function initials(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  )
}
// Six muted hues taken from the site's own palette. Marking pink is left out:
// it means "needs a person" everywhere else. The same name always gets the
// same hue, so a customer is recognisable across lists.
const AVATAR_HUES = 6
function hueFor(name: string) {
  let hash = 0
  for (const ch of name.trim().toLowerCase())
    hash = (hash * 31 + ch.codePointAt(0)!) | 0
  return Math.abs(hash) % AVATAR_HUES
}
export function Avatar({
  name,
  size = "md",
  tone = "soft",
}: {
  name: string
  size?: "sm" | "md" | "lg"
  tone?: "soft" | "solid"
}) {
  return (
    <span
      className={`avatar avatar-${size} avatar-${tone}`}
      data-hue={hueFor(name)}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })
}
