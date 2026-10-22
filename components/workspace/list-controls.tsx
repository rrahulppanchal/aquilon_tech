"use client"
import { useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { SelectMenu } from "./select-menu"

export function usePagination<T>(items: T[], filterKey = "") {
  const [state, setState] = useState({ page: 1, size: 10, key: filterKey })
  const pages = Math.max(1, Math.ceil(items.length / state.size))
  const page = state.key === filterKey ? Math.min(state.page, pages) : 1
  if (state.key !== filterKey || state.page !== page) {
    setState({ ...state, page, key: filterKey })
  }
  return {
    items: items.slice((page - 1) * state.size, page * state.size),
    page,
    pages,
    size: state.size,
    total: items.length,
    setPage: (page: number) => setState({ ...state, page, key: filterKey }),
    setSize: (size: number) => setState({ page: 1, size, key: filterKey }),
  }
}
export function Pagination({
  pagination: p,
  label,
}: {
  pagination: ReturnType<typeof usePagination>
  label: string
}) {
  return (
    <nav className="list-pagination" aria-label={`${label} pagination`}>
      <span className="pagination-range" role="status">
        {p.total
          ? `${(p.page - 1) * p.size + 1}–${Math.min(p.page * p.size, p.total)} of ${p.total}`
          : "0 results"}
      </span>
      <span className="pagination-size">
        Per page
        <SelectMenu
          label="Rows per page"
          value={String(p.size)}
          onChange={(v) => p.setSize(Number(v))}
          options={[10, 25, 50].map((n) => ({
            value: String(n),
            label: String(n),
          }))}
        />
      </span>
      <div className="pagination-buttons">
        <button
          className="btn btn-secondary btn-sm pagination-edge"
          disabled={p.page === 1}
          onClick={() => p.setPage(1)}
          aria-label="First page"
        >
          <ChevronsLeft size={16} aria-hidden="true" />
        </button>
        <button
          className="btn btn-secondary btn-sm"
          disabled={p.page === 1}
          onClick={() => p.setPage(p.page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Previous
        </button>
        <span className="pagination-position">
          Page {p.page} of {p.pages}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          disabled={p.page === p.pages}
          onClick={() => p.setPage(p.page + 1)}
        >
          Next <ChevronRight size={16} aria-hidden="true" />
        </button>
        <button
          className="btn btn-secondary btn-sm pagination-edge"
          disabled={p.page === p.pages}
          onClick={() => p.setPage(p.pages)}
          aria-label="Last page"
        >
          <ChevronsRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}

export type Sort<K extends string> = { key: K; dir: "asc" | "desc" }
// A column heading that sorts the table. Clicking the sorted column flips it.
export function SortHeader<K extends string>({
  id,
  label,
  sort,
  onSort,
  className = "",
}: {
  id: K
  label: string
  sort: Sort<K>
  onSort: (key: K) => void
  className?: string
}) {
  const active = sort.key === id
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      className={className}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        className={`th-sort ${active ? "is-active" : ""}`}
        onClick={() => onSort(id)}
      >
        {label}
        <Icon size={14} aria-hidden="true" />
      </button>
    </th>
  )
}
