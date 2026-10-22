"use client"
import { useId, useState } from "react"
import { Plus, Search } from "lucide-react"
import type { Rate } from "@/features/quotes/types"
import { money } from "@/lib/money"
type Pick = { rate: Rate } | { manual: string }
// Type-to-search list of the company's prices. Picking adds the item straight
// away; anything not on the list can be added as a custom item.
export function ItemPicker({
  rates,
  onPick,
  disabled = false,
}: {
  rates: Rate[]
  onPick: (pick: Pick) => void
  disabled?: boolean
}) {
  const id = useId()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = rates
    .filter((r) =>
      words.every((w) =>
        `${r.code} ${r.description} ${r.notes}`.toLowerCase().includes(w)
      )
    )
    .slice(0, 8)
  const options: Pick[] = [
    ...matches.map((rate) => ({ rate })),
    ...(query.trim().length >= 3 ? [{ manual: query.trim() }] : []),
  ]
  function choose(pick: Pick) {
    onPick(pick)
    setQuery("")
    setOpen(false)
    setActive(0)
  }
  return (
    <div className="picker">
      <label className="label" htmlFor={`${id}-input`}>
        Add confirmed work to the scope
      </label>
      <div className="picker-field">
        <Search size={16} aria-hidden="true" />
        <input
          id={`${id}-input`}
          className="input"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={
            open && options[active] ? `${id}-opt-${active}` : undefined
          }
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search your prices, e.g. kerb, skip, BP01"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setOpen(true)
              setActive((a) => Math.min(a + 1, options.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === "Enter" && open && options[active]) {
              e.preventDefault()
              choose(options[active])
            } else if (e.key === "Escape") {
              setOpen(false)
            }
          }}
        />
      </div>
      {open && (
        <ul className="picker-list" id={`${id}-list`} role="listbox">
          {options.length === 0 ? (
            <li className="picker-empty" role="presentation">
              {query.trim()
                ? "No match. Keep typing to add it as your own item."
                : "No more prices to add."}
            </li>
          ) : (
            options.map((option, i) => (
              <li
                key={"rate" in option ? option.rate.code : "manual"}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                // Keep focus in the input so blur doesn't close the list first.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(option)}
              >
                {"rate" in option ? (
                  <>
                    <span>
                      <strong>{option.rate.description}</strong>
                      <small>{option.rate.code}</small>
                    </span>
                    <span className="picker-price">
                      {option.rate.ratePence === null
                        ? "No price"
                        : `${money(option.rate.ratePence)} per ${option.rate.unit}`}
                    </span>
                  </>
                ) : (
                  <span className="picker-manual">
                    <Plus size={15} aria-hidden="true" />
                    Add “{option.manual}” as your own item
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
      <p className="hint">
        Items are added at their normal price. You can change the quantity after
        adding.
      </p>
    </div>
  )
}
