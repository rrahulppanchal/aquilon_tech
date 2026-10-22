"use client"
import { useState } from "react"
import { AlertTriangle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import {
  Pagination,
  SortHeader,
  usePagination,
  type Sort,
} from "./list-controls"
import { SelectMenu } from "./select-menu"
import type { Customer, WorkspaceData } from "@/features/quotes/types"
import { customerFields, paymentTerms } from "@/features/customers/domain/rules"
import { request } from "@/lib/http/client"
import {
  Avatar,
  ConfirmDialog,
  Dialog,
  EmptyState,
  PageHeading,
  SearchField,
  useToast,
} from "./shared"

type CustomerSort = "name" | "company" | "address" | "terms"
// One fact per cell, one line per row. Long values are cut short on screen
// and kept whole in the cell's tooltip.
type Editing = { mode: "add" } | { mode: "edit"; customer: Customer } | null
export function Customers({
  data,
  onChange,
}: {
  data: WorkspaceData
  onChange: (customers: Customer[]) => void
}) {
  const toast = useToast()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Customer | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [search, setSearch] = useState("")
  const [kind, setKind] = useState("all")
  const [terms, setTerms] = useState("all")
  const [sort, setSort] = useState<Sort<CustomerSort>>({
    key: "name",
    dir: "asc",
  })
  const shown = data.customers.filter(
    (c) =>
      (kind === "all" || (kind === "business" ? !!c.company : !c.company)) &&
      (terms === "all" || c.paymentTerms === terms) &&
      `${c.name} ${c.company} ${c.emails.join(" ")} ${c.phone} ${c.address} ${c.aliases.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase())
  )
  const ordered = [...shown].sort((a, b) => {
    const field = {
      name: (c: typeof a) => c.name,
      company: (c: typeof a) => c.company,
      address: (c: typeof a) => c.address,
      terms: (c: typeof a) => c.paymentTerms,
    }[sort.key]
    // Blank values always sink to the bottom, whichever way it is sorted.
    const x = field(a)
    const y = field(b)
    if (!x !== !y) return x ? -1 : 1
    const order = x.localeCompare(y) || a.name.localeCompare(b.name)
    return sort.dir === "asc" ? order : -order
  })
  const pagination = usePagination(
    ordered,
    JSON.stringify([search, kind, terms, sort])
  )
  function sortBy(key: CustomerSort) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    )
  }
  const narrowed = kind !== "all" || terms !== "all" || !!search
  async function remove() {
    if (!deleting) return
    setBusy(true)
    setDeleteError("")
    try {
      await request(
        `/api/customers/${encodeURIComponent(deleting.id)}`,
        "DELETE",
        {}
      )
      onChange(data.customers.filter((c) => c.id !== deleting.id))
      toast(`${deleting.name} deleted.`)
      setDeleting(null)
    } catch (e) {
      // Kept open so the reason (e.g. the customer has quotes) is read in place.
      setDeleteError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function clearFilters() {
    setSearch("")
    setKind("all")
    setTerms("all")
  }
  return (
    <>
      <PageHeading
        title="Your customers"
        description="Enquiries are matched to these records by email first, then by name and address."
        action={
          <button
            className="btn btn-primary"
            onClick={() => setEditing({ mode: "add" })}
          >
            <Plus size={17} aria-hidden="true" />
            Add customer
          </button>
        }
      />
      <div className="sheet quotes-sheet">
        <div className="toolbar">
          <h2>
            Customers<span className="count">{data.customers.length}</span>
          </h2>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search name, email or address"
          />
        </div>
        <div className="quote-filters">
          <SelectMenu
            inline
            label="Type"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "All" },
              { value: "business", label: "Business" },
              { value: "residential", label: "Residential" },
            ]}
          />
          <SelectMenu
            inline
            label="Terms"
            value={terms}
            onChange={setTerms}
            options={[
              { value: "all", label: "Any" },
              ...Array.from(new Set(data.customers.map((c) => c.paymentTerms)))
                .sort()
                .map((value) => ({ value, label: value })),
            ]}
          />
          <div className="quote-filters-end">
            <span className="quote-count" role="status">
              {shown.length === 1 ? "1 customer" : `${shown.length} customers`}
            </span>
            {narrowed && (
              <button className="link-btn" onClick={clearFilters}>
                <RotateCcw size={13} aria-hidden="true" /> Clear filters
              </button>
            )}
          </div>
        </div>
        {shown.length ? (
          <div className="table-scroll">
            <table className="customers-table table">
              <thead>
                <tr>
                  <SortHeader
                    id="name"
                    label="Customer"
                    sort={sort}
                    onSort={sortBy}
                    className="col-name"
                  />
                  <SortHeader
                    id="company"
                    label="Company"
                    sort={sort}
                    onSort={sortBy}
                    className="col-company"
                  />
                  <th className="col-email">Email</th>
                  <th className="col-phone">Phone</th>
                  <SortHeader
                    id="address"
                    label="Address"
                    sort={sort}
                    onSort={sortBy}
                    className="col-address"
                  />
                  <SortHeader
                    id="terms"
                    label="Terms"
                    sort={sort}
                    onSort={sortBy}
                    className="col-terms"
                  />
                  <th className="col-notes">Notes</th>
                  <th className="col-actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((c) => {
                  const [email, ...otherEmails] = c.emails
                  const notes = [
                    c.aliases.length
                      ? `Also known as ${c.aliases.join(", ")}`
                      : "",
                    c.notes.replace(/^[\s;]+/, ""),
                  ]
                    .filter(Boolean)
                    .join(". ")
                  return (
                    <tr key={c.id} className="customer-tr">
                      <td className="col-name">
                        <span className="person">
                          <Avatar name={c.name} size="sm" />
                          <strong className="cell-text" title={c.name}>
                            {c.name}
                          </strong>
                        </span>
                      </td>
                      <td className="col-company">
                        {c.company ? (
                          <span className="cell-text" title={c.company}>
                            {c.company}
                          </span>
                        ) : (
                          <span className="tag">Residential</span>
                        )}
                      </td>
                      <td className="col-email">
                        {email ? (
                          <span
                            className="cell-text"
                            title={[
                              ...c.emails,
                              c.invoiceEmail && `Invoices to ${c.invoiceEmail}`,
                            ]
                              .filter(Boolean)
                              .join("\n")}
                          >
                            <a className="cell-link" href={`mailto:${email}`}>
                              {email}
                            </a>
                            {otherEmails.length > 0 && (
                              <span className="tag cell-more">
                                +{otherEmails.length}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="cell-empty">None</span>
                        )}
                      </td>
                      <td className="col-phone">
                        {c.phone ? (
                          <a className="cell-link" href={`tel:${c.phone}`}>
                            {c.phone}
                          </a>
                        ) : (
                          <span className="cell-empty">None</span>
                        )}
                      </td>
                      <td className="col-address">
                        {c.address ? (
                          <span className="cell-text" title={c.address}>
                            {c.address}
                          </span>
                        ) : (
                          <span className="cell-empty">Not on file</span>
                        )}
                      </td>
                      <td className="col-terms">{c.paymentTerms}</td>
                      <td className="col-notes">
                        {notes ? (
                          <span className="cell-text" title={notes}>
                            {notes}
                          </span>
                        ) : (
                          <span className="cell-empty">None</span>
                        )}
                      </td>
                      <td className="col-actions">
                        <span className="cell-actions">
                          <button
                            className="icon-btn"
                            aria-label={`Edit ${c.name}`}
                            title="Edit"
                            onClick={() =>
                              setEditing({ mode: "edit", customer: c })
                            }
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-btn icon-btn-danger"
                            aria-label={`Delete ${c.name}`}
                            title="Delete"
                            onClick={() => {
                              setDeleteError("")
                              setDeleting(c)
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              data.customers.length ? "No customers match" : "No customers yet"
            }
            description={
              data.customers.length
                ? "Try part of a name, an email address or a phone number."
                : "Add the people you quote for, so enquiries from them are recognised."
            }
            action={
              narrowed ? (
                <button className="btn btn-secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : data.customers.length ? undefined : (
                <button
                  className="btn btn-primary"
                  onClick={() => setEditing({ mode: "add" })}
                >
                  <Plus size={17} aria-hidden="true" /> Add customer
                </button>
              )
            }
          />
        )}
        {shown.length > 0 && (
          <Pagination pagination={pagination} label="Customers" />
        )}
      </div>
      {editing && (
        <CustomerForm
          key={editing.mode === "edit" ? editing.customer.id : "new"}
          editing={editing}
          existing={data.customers}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            onChange(
              editing.mode === "add"
                ? [...data.customers, saved]
                : data.customers.map((c) => (c.id === saved.id ? saved : c))
            )
            toast(
              editing.mode === "add"
                ? `${saved.name} added.`
                : `${saved.name} saved.`
            )
            setEditing(null)
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        confirmLabel="Delete customer"
        tone="danger"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      >
        <p>
          Their details are removed from your customer list. New enquiries from{" "}
          {deleting?.emails[0] || "them"} won’t be matched to a customer.
        </p>
        {deleteError && (
          <div
            className="alert alert-error"
            role="alert"
            style={{ marginTop: 14 }}
          >
            <AlertTriangle size={17} aria-hidden="true" />
            <div>{deleteError}</div>
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}

const list = (text: string) =>
  text
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
function CustomerForm({
  editing,
  existing,
  onClose,
  onSaved,
}: {
  editing: NonNullable<Editing>
  existing: Customer[]
  onClose: () => void
  onSaved: (customer: Customer) => void
}) {
  const current = editing.mode === "edit" ? editing.customer : null
  const [name, setName] = useState(current?.name || "")
  const [company, setCompany] = useState(current?.company || "")
  const [email, setEmail] = useState(current?.emails[0] || "")
  const [otherEmails, setOtherEmails] = useState(
    current?.emails.slice(1).join(", ") || ""
  )
  const [phone, setPhone] = useState(current?.phone || "")
  const [address, setAddress] = useState(current?.address || "")
  const [terms, setTerms] = useState<string>(
    current?.paymentTerms || paymentTerms[0]
  )
  // Blank means "same as the main email", which is how most records start.
  const [invoiceEmail, setInvoiceEmail] = useState(
    current && current.invoiceEmail !== current.emails[0]
      ? current.invoiceEmail
      : ""
  )
  const [aliases, setAliases] = useState(current?.aliases.join(", ") || "")
  const [notes, setNotes] = useState(current?.notes || "")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState("")
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setServerError("")
    const emails = [email, ...list(otherEmails)]
      .map((e) => e.trim())
      .filter(Boolean)
    const parsed = customerFields.safeParse({
      name,
      company,
      emails,
      phone,
      address,
      paymentTerms: terms,
      invoiceEmail: invoiceEmail.trim(),
      aliases: list(aliases),
      notes,
    })
    const found: Record<string, string> = {}
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        // Problems in the first email belong to that field; the rest to "Other emails".
        const key =
          issue.path[0] === "emails"
            ? issue.path[1] === 0 || !otherEmails.trim()
              ? "email"
              : "otherEmails"
            : String(issue.path[0])
        found[key] ??= issue.message
      }
    const taken = existing.find(
      (c) =>
        c.id !== current?.id &&
        c.emails.some((e) => emails.includes(e.toLowerCase()))
    )
    if (taken) found.email ??= `That email already belongs to ${taken.name}.`
    setErrors(found)
    if (Object.keys(found).length || !parsed.success) return
    setBusy(true)
    try {
      const saved = await request<Customer>(
        current
          ? `/api/customers/${encodeURIComponent(current.id)}`
          : "/api/customers",
        current ? "PATCH" : "POST",
        parsed.data
      )
      onSaved(saved)
    } catch (e) {
      setServerError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const field = (key: string) =>
    errors[key]
      ? { "aria-invalid": true, "aria-describedby": `${key}-error` }
      : {}
  const message = (key: string) =>
    errors[key] && (
      <p className="field-error" id={`${key}-error`}>
        {errors[key]}
      </p>
    )
  return (
    <Dialog open labelledBy="customer-title" className="form-dialog">
      <form onSubmit={submit} noValidate className="form-dialog-form">
        <div className="form-dialog-head">
          <h2 id="customer-title">
            {current ? `Edit ${current.name}` : "Add a customer"}
          </h2>
          <p>
            Enquiries from these email addresses are matched to this customer
            automatically.
          </p>
        </div>
        <div className="form-dialog-body">
          <fieldset className="form-section">
            <legend>Contact</legend>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="customer-name">
                  Name
                </label>
                <input
                  id="customer-name"
                  className="input"
                  data-autofocus=""
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Patience Okafor"
                  maxLength={120}
                  autoComplete="off"
                  {...field("name")}
                />
                {message("name")}
              </div>
              <div className="field">
                <label className="label" htmlFor="customer-company">
                  Company <span className="label-hint">optional</span>
                </label>
                <input
                  id="customer-company"
                  className="input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Leave blank for a homeowner"
                  maxLength={120}
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="customer-email">
                  Email
                </label>
                <input
                  id="customer-email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="off"
                  {...field("email")}
                />
                {message("email")}
              </div>
              <div className="field">
                <label className="label" htmlFor="customer-phone">
                  Phone <span className="label-hint">optional</span>
                </label>
                <input
                  id="customer-phone"
                  className="input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07700 900123"
                  maxLength={30}
                  autoComplete="off"
                  {...field("phone")}
                />
                {message("phone")}
              </div>
              <div className="field span-2">
                <label className="label" htmlFor="customer-other-emails">
                  Other emails <span className="label-hint">optional</span>
                </label>
                <input
                  id="customer-other-emails"
                  className="input"
                  value={otherEmails}
                  onChange={(e) => setOtherEmails(e.target.value)}
                  placeholder="Separate with commas"
                  autoComplete="off"
                  {...field("otherEmails")}
                />
                {message("otherEmails")}
              </div>
            </div>
          </fieldset>
          <fieldset className="form-section">
            <legend>Site and billing</legend>
            <div className="form-grid">
              <div className="field span-2">
                <label className="label" htmlFor="customer-address">
                  Address <span className="label-hint">optional</span>
                </label>
                <input
                  id="customer-address"
                  className="input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 14 Linden Avenue, Walsall WS5 3PL"
                  maxLength={250}
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <span className="label" id="customer-terms-label">
                  Payment terms
                </span>
                <SelectMenu
                  label="Payment terms"
                  value={terms}
                  onChange={setTerms}
                  className="select-block"
                  options={paymentTerms.map((t) => ({ value: t, label: t }))}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="customer-invoice">
                  Invoice email <span className="label-hint">optional</span>
                </label>
                <input
                  id="customer-invoice"
                  className="input"
                  type="email"
                  value={invoiceEmail}
                  onChange={(e) => setInvoiceEmail(e.target.value)}
                  placeholder={email.trim() || "Same as main email"}
                  autoComplete="off"
                  {...field("invoiceEmail")}
                />
                {message("invoiceEmail")}
              </div>
            </div>
          </fieldset>
          <fieldset className="form-section">
            <legend>Matching and notes</legend>
            <div className="form-grid">
              <div className="field span-2">
                <label className="label" htmlFor="customer-aliases">
                  Also known as <span className="label-hint">optional</span>
                </label>
                <input
                  id="customer-aliases"
                  className="input"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="Other names they sign emails with, separated by commas"
                  autoComplete="off"
                />
              </div>
              <div className="field span-2">
                <label className="label" htmlFor="customer-notes">
                  Notes <span className="label-hint">optional</span>
                </label>
                <textarea
                  id="customer-notes"
                  className="textarea"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Past jobs, access, anything worth remembering"
                  maxLength={500}
                />
              </div>
            </div>
          </fieldset>
          {serverError && (
            <div className="alert alert-error" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              <div>{serverError}</div>
            </div>
          )}
        </div>
        <div className="form-dialog-foot">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : current ? "Save customer" : "Add customer"}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
