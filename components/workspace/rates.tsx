"use client"
import { useState } from "react"
import {
  Pagination,
  SortHeader,
  usePagination,
  type Sort,
} from "./list-controls"
import { SelectMenu } from "./select-menu"
import { AlertTriangle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import type { Rate, WorkspaceData } from "@/features/quotes/types"
import {
  isRecipeCode,
  newRate,
  rateFields,
  rateStatuses,
  rateUnits,
} from "@/features/rates/domain/rules"
import { request } from "@/lib/http/client"
import { money } from "@/lib/money"
import {
  ConfirmDialog,
  Dialog,
  EmptyState,
  PageHeading,
  SearchField,
  useToast,
} from "./shared"
const rateFilters: { id: "all" | Rate["status"]; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "In use" },
  { id: "review", label: "Needs checking" },
  { id: "superseded", label: "Old prices" },
  { id: "unavailable", label: "Not offered" },
]
export const stateLabel: Record<Rate["status"], string> = {
  active: "In use",
  review: "Needs checking",
  superseded: "Old price",
  unavailable: "Not offered",
}
// The PT01 sheet price was VAT-inclusive; the note explains the corrected rate.
const noteFor = (r: Rate) =>
  [
    r.code === "PT01" && r.originalRate === "85"
      ? "Sheet price £85 included VAT. Shaz confirmed £70.83 ex VAT."
      : "",
    r.notes,
  ]
    .filter(Boolean)
    .join(" ")
type RateSort = "code" | "description" | "rate"
type Editing = { mode: "add" } | { mode: "edit"; rate: Rate } | null
export function Rates({
  data,
  onChange,
}: {
  data: WorkspaceData
  onChange: (rates: Rate[]) => void
}) {
  const toast = useToast()
  const owner = data.user.role === "owner"
  const [search, setSearch] = useState("")
  const [filter, setFilter] =
    useState<(typeof rateFilters)[number]["id"]>("all")
  const [unit, setUnit] = useState("all")
  const [pricing, setPricing] = useState("all")
  const [sort, setSort] = useState<Sort<RateSort>>({ key: "code", dir: "asc" })
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Rate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const count = (status: Rate["status"]) =>
    data.rates.filter((r) => r.status === status).length
  const shown = data.rates.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      (unit === "all" || r.unit === unit) &&
      (pricing === "all" ||
        (pricing === "missing"
          ? r.ratePence === null
          : r.ratePence !== null)) &&
      `${r.code} ${r.description} ${r.notes}`
        .toLowerCase()
        .includes(search.toLowerCase())
  )
  const ordered = [...shown].sort((a, b) => {
    // Unpriced rates sink to the bottom when sorting by price.
    if (
      sort.key === "rate" &&
      (a.ratePence === null) !== (b.ratePence === null)
    )
      return a.ratePence === null ? 1 : -1
    const order =
      sort.key === "description"
        ? a.description.localeCompare(b.description)
        : sort.key === "rate"
          ? (a.ratePence ?? 0) - (b.ratePence ?? 0)
          : a.code.localeCompare(b.code, undefined, { numeric: true })
    return sort.dir === "asc" ? order : -order
  })
  const pagination = usePagination(
    ordered,
    JSON.stringify([search, filter, unit, pricing, sort])
  )
  function sortBy(key: RateSort) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    )
  }
  const narrowed = unit !== "all" || pricing !== "all" || !!search
  function clearFilters() {
    setSearch("")
    setUnit("all")
    setPricing("all")
  }
  async function remove() {
    if (!deleting) return
    setBusy(true)
    setError("")
    try {
      await request(
        `/api/rates/${encodeURIComponent(deleting.code)}`,
        "DELETE",
        {}
      )
      onChange(data.rates.filter((r) => r.code !== deleting.code))
      toast(`${deleting.code} deleted.`)
      setDeleting(null)
    } catch (e) {
      setError((e as Error).message)
      setDeleting(null)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeading
        title="Rates"
        description={
          owner
            ? "Drafts are priced only from rates marked in use. Prices are ex VAT."
            : "Drafts are priced only from rates marked in use. Prices are ex VAT. Only the owner can change rates."
        }
        action={
          owner && (
            <button
              className="btn btn-primary"
              onClick={() => setEditing({ mode: "add" })}
            >
              <Plus size={17} aria-hidden="true" />
              Add rate
            </button>
          )
        }
      />
      {error && (
        <div
          className="alert alert-error"
          role="alert"
          style={{ marginBottom: 20 }}
        >
          <AlertTriangle size={17} aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}
      <div className="sheet quotes-sheet">
        <div className="toolbar">
          <div className="tabs" role="group" aria-label="Filter rates">
            {rateFilters.map((item) => {
              const n = item.id === "all" ? data.rates.length : count(item.id)
              return (
                <button
                  key={item.id}
                  className="tab"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  {n > 0 && (
                    <span
                      className={`tab-count ${item.id === "review" ? "tab-count-alert" : ""}`}
                    >
                      {n}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search code or item"
          />
        </div>
        <div className="quote-filters">
          <SelectMenu
            inline
            label="Unit"
            value={unit}
            onChange={setUnit}
            options={[
              { value: "all", label: "Any" },
              ...Array.from(new Set(data.rates.map((r) => r.unit)))
                .sort()
                .map((value) => ({ value, label: `Per ${value}` })),
            ]}
          />
          <SelectMenu
            inline
            label="Price"
            value={pricing}
            onChange={setPricing}
            options={[
              { value: "all", label: "Any" },
              { value: "priced", label: "Priced" },
              { value: "missing", label: "Missing" },
            ]}
          />
          <div className="quote-filters-end">
            <span className="quote-count" role="status">
              {shown.length === 1 ? "1 rate" : `${shown.length} rates`}
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
            <table className="rates-table table">
              <thead>
                <tr>
                  <SortHeader
                    id="code"
                    label="Code"
                    sort={sort}
                    onSort={sortBy}
                    className="col-code"
                  />
                  <SortHeader
                    id="description"
                    label="Item"
                    sort={sort}
                    onSort={sortBy}
                    className="col-item"
                  />
                  <th className="col-unit">Per</th>
                  <SortHeader
                    id="rate"
                    label="Rate"
                    sort={sort}
                    onSort={sortBy}
                    className="col-rate num"
                  />
                  <th className="col-state">Status</th>
                  <th className="col-notes">Notes</th>
                  {owner && (
                    <th className="col-actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((r) => {
                  const note = noteFor(r)
                  return (
                    <tr
                      key={r.code}
                      className={`rate-tr ${["superseded", "unavailable"].includes(r.status) ? "is-retired" : ""} ${r.status === "review" ? "marked" : ""}`}
                    >
                      <td className="col-code">
                        <span className="rate-code">{r.code}</span>
                      </td>
                      <td className="col-item">
                        <span className="cell-text" title={r.description}>
                          {r.description}
                        </span>
                      </td>
                      <td className="col-unit">{r.unit}</td>
                      <td className="col-rate num" data-unit={r.unit}>
                        {r.ratePence === null ? (
                          <span className="cell-empty">No price</span>
                        ) : (
                          money(r.ratePence)
                        )}
                      </td>
                      <td className="col-state">
                        <span className={`rate-state ${r.status}`}>
                          {stateLabel[r.status]}
                        </span>
                      </td>
                      <td className="col-notes">
                        {note ? (
                          <span className="cell-text" title={note}>
                            {note}
                          </span>
                        ) : (
                          <span className="cell-empty">None</span>
                        )}
                      </td>
                      {owner && (
                        <td className="col-actions">
                          <span className="cell-actions">
                            <button
                              className="icon-btn"
                              aria-label={`Edit ${r.code}`}
                              title="Edit"
                              onClick={() =>
                                setEditing({ mode: "edit", rate: r })
                              }
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-btn icon-btn-danger"
                              aria-label={`Delete ${r.code}`}
                              title="Delete"
                              onClick={() => setDeleting(r)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </span>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={data.rates.length ? "No rates match" : "No rates yet"}
            description={
              data.rates.length
                ? "Try another code, word or filter."
                : "Add the prices you charge so drafts can be worked out."
            }
            action={
              data.rates.length && narrowed ? (
                <button className="btn btn-secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : undefined
            }
          />
        )}
        {shown.length > 0 && (
          <Pagination pagination={pagination} label="Rates" />
        )}
        <div className="sheet-foot">
          Changing a rate affects new drafts only. Existing quotes keep the
          price they were drafted with.
        </div>
      </div>
      {editing && (
        <RateForm
          key={editing.mode === "edit" ? editing.rate.code : "new"}
          editing={editing}
          existing={data.rates}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            onChange(
              editing.mode === "add"
                ? [...data.rates, saved].sort((a, b) =>
                    a.code.localeCompare(b.code)
                  )
                : data.rates.map((r) => (r.code === saved.code ? saved : r))
            )
            toast(
              editing.mode === "add"
                ? `${saved.code} added.`
                : `${saved.code} saved.`
            )
            setEditing(null)
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.code}?`}
        confirmLabel="Delete rate"
        tone="danger"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      >
        <p>
          {deleting?.description} is removed from the rate list. Quotes already
          drafted keep their price.
        </p>
        {deleting && isRecipeCode(deleting.code) && (
          <div className="alert alert-warn" style={{ marginTop: 14 }}>
            <AlertTriangle size={17} aria-hidden="true" />
            <div>
              Drafts use {deleting.code} automatically. Once it’s deleted, new
              drafts show this item without a price. Marking it “Old price”
              keeps its history instead.
            </div>
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
function RateForm({
  editing,
  existing,
  onClose,
  onSaved,
}: {
  editing: NonNullable<Editing>
  existing: Rate[]
  onClose: () => void
  onSaved: (rate: Rate) => void
}) {
  const current = editing.mode === "edit" ? editing.rate : null
  const [code, setCode] = useState(current?.code || "")
  const [description, setDescription] = useState(current?.description || "")
  const [unit, setUnit] = useState<string>(current?.unit || "m²")
  const [price, setPrice] = useState(
    current?.ratePence == null ? "" : (current.ratePence / 100).toFixed(2)
  )
  const [status, setStatus] = useState<Rate["status"]>(
    current?.status || "active"
  )
  const [notes, setNotes] = useState(current?.notes || "")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState("")
  const priceValid =
    price.trim() === "" || /^\d{1,6}(\.\d{1,2})?$/.test(price.trim())
  const ratePence = price.trim() === "" ? null : Math.round(Number(price) * 100)
  const retiringRecipe =
    !!current &&
    isRecipeCode(current.code) &&
    current.status === "active" &&
    status !== "active"
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setServerError("")
    const fields = { description, unit, ratePence, status, notes }
    const parsed = (current ? rateFields : newRate).safeParse(
      current ? fields : { code, ...fields }
    )
    const found: Record<string, string> = {}
    if (!priceValid) found.ratePence = "Enter a price like 62 or 18.40."
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        found[String(issue.path[0])] ??= issue.message
    if (!current && existing.some((r) => r.code === code.trim().toUpperCase()))
      found.code = `${code.trim().toUpperCase()} already exists.`
    setErrors(found)
    if (Object.keys(found).length || !parsed.success) return
    setBusy(true)
    try {
      const saved = await request<Rate>(
        current
          ? `/api/rates/${encodeURIComponent(current.code)}`
          : "/api/rates",
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
  const field = (name: string) =>
    errors[name]
      ? { "aria-invalid": true, "aria-describedby": `${name}-error` }
      : {}
  const message = (name: string) =>
    errors[name] && (
      <p className="field-error" id={`${name}-error`}>
        {errors[name]}
      </p>
    )
  return (
    <Dialog open labelledBy="rate-title" className="form-dialog rate-dialog">
      <form onSubmit={submit} noValidate className="form-dialog-form">
        <div className="form-dialog-head">
          <h2 id="rate-title">
            {current ? `Edit ${current.code}` : "Add a rate"}
          </h2>
          <p>
            {current
              ? "Changes apply to new drafts. Existing quotes keep their price."
              : "New drafts can use it straight away once it’s in use."}
          </p>
        </div>
        <div className="form-dialog-body">
          <fieldset className="form-section">
            <legend>Item</legend>
            <div className="form-grid">
              {!current && (
                <div className="field">
                  <label className="label" htmlFor="rate-code">
                    Code
                  </label>
                  <input
                    id="rate-code"
                    className="input"
                    data-autofocus=""
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. BP05"
                    maxLength={12}
                    autoComplete="off"
                    {...field("code")}
                  />
                  {message("code")}
                </div>
              )}
              <div className={`field ${current ? "span-2" : ""}`}>
                <span className="label">Status</span>
                <SelectMenu
                  label="Status"
                  value={status}
                  onChange={(v) => setStatus(v as Rate["status"])}
                  className="select-block"
                  options={rateStatuses.map((s) => ({
                    value: s,
                    label: stateLabel[s],
                  }))}
                />
              </div>
              <div className="field span-2">
                <label className="label" htmlFor="rate-description">
                  Description
                </label>
                <input
                  id="rate-description"
                  className="input"
                  data-autofocus={current ? "" : undefined}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Block paving supply & lay"
                  maxLength={200}
                  {...field("description")}
                />
                {message("description")}
              </div>
            </div>
          </fieldset>
          <fieldset className="form-section">
            <legend>Price</legend>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="rate-price">
                  Rate, ex VAT <span className="label-hint">optional</span>
                </label>
                <div className="money-input" style={{ width: "100%" }}>
                  <span aria-hidden="true">£</span>
                  <input
                    id="rate-price"
                    className="input"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Leave blank if unknown"
                    {...field("ratePence")}
                  />
                </div>
                {message("ratePence")}
              </div>
              <div className="field">
                <span className="label">Per</span>
                <SelectMenu
                  label="Unit"
                  value={unit}
                  onChange={setUnit}
                  className="select-block"
                  options={rateUnits.map((u) => ({ value: u, label: u }))}
                />
              </div>
            </div>
          </fieldset>
          <fieldset className="form-section">
            <legend>Notes</legend>
            <div className="form-grid">
              <div className="field span-2">
                <label className="sr-only" htmlFor="rate-notes">
                  Notes
                </label>
                <textarea
                  id="rate-notes"
                  className="textarea"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What’s included, depth, supplier…"
                  maxLength={500}
                />
              </div>
            </div>
          </fieldset>
          {retiringRecipe && (
            <div className="alert alert-warn">
              <AlertTriangle size={17} aria-hidden="true" />
              <div>
                Drafts use {current!.code} automatically. While it isn’t in use,
                new drafts show this item without a price.
              </div>
            </div>
          )}
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
            {busy ? "Saving…" : current ? "Save rate" : "Add rate"}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
