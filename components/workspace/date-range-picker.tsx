"use client"
import { useCallback, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

// Dates travel as local "YYYY-MM-DD" strings, the same shape <input
// type="date"> uses, so filters can compare them as plain text.
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const label = (s: string, withYear = false) =>
  parse(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

function presets() {
  const today = new Date()
  const back = (days: number) =>
    iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days))
  return [
    { label: "Today", from: iso(today), to: iso(today) },
    { label: "Last 7 days", from: back(6), to: iso(today) },
    { label: "Last 30 days", from: back(29), to: iso(today) },
    {
      label: "This month",
      from: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: iso(today),
    },
    {
      label: "Last month",
      from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: iso(new Date(today.getFullYear(), today.getMonth(), 0)),
    },
  ]
}

export function DateRangePicker({
  label: name,
  from,
  to,
  onChange,
}: {
  label: string
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => {
    const start = from ? parse(from) : new Date()
    return new Date(start.getFullYear(), start.getMonth(), 1)
  })
  const [hover, setHover] = useState("")
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const anchor = useCallback((node: HTMLButtonElement | null) => {
    if (node) setContainer(node.closest("dialog") ?? document.body)
  }, [])
  const today = iso(new Date())
  // Picking the start leaves the range open until a second day is chosen.
  const picking = !!from && !to
  const end = picking && hover && hover >= from ? hover : to
  const value = from
    ? to
      ? from === to
        ? label(from, true)
        : `${label(from)} – ${label(to, true)}`
      : `From ${label(from, true)}`
    : "Any date"

  function pick(day: string) {
    if (!from || to) onChange({ from: day, to: "" })
    else if (day < from) onChange({ from: day, to: "" })
    else {
      onChange({ from, to: day })
      setOpen(false)
    }
  }
  const first = new Date(month)
  const offset = (first.getDay() + 6) % 7
  const days = Array.from(
    { length: 42 },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), i - offset + 1)
  )
  const shift = (n: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        ref={anchor}
        className={`select-trigger date-trigger ${from ? "is-set" : ""}`}
        aria-label={`${name}: ${value}`}
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span className="select-trigger-label">{name}</span>
        <span className="select-trigger-value">{value}</span>
        <ChevronDown
          size={16}
          className="select-trigger-icon"
          aria-hidden="true"
        />
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Positioner
          className="select-positioner"
          sideOffset={6}
          align="start"
        >
          <Popover.Popup className="select-popup date-popup">
            <div className="date-presets">
              {presets().map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="date-preset"
                  aria-pressed={from === p.from && to === p.to}
                  onClick={() => {
                    onChange({ from: p.from, to: p.to })
                    setMonth(
                      new Date(
                        parse(p.from).getFullYear(),
                        parse(p.from).getMonth(),
                        1
                      )
                    )
                    setOpen(false)
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="date-calendar">
              <div className="date-month">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Previous month"
                  onClick={() => shift(-1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <strong aria-live="polite">
                  {month.toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Next month"
                  onClick={() => shift(1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div
                className="date-grid"
                role="grid"
                onMouseLeave={() => setHover("")}
              >
                {WEEKDAYS.map((d) => (
                  <span key={d} className="date-weekday" aria-hidden="true">
                    {d}
                  </span>
                ))}
                {days.map((d) => {
                  const day = iso(d)
                  const outside = d.getMonth() !== month.getMonth()
                  const isStart = day === from
                  const isEnd = !!end && day === end
                  const inRange = !!from && !!end && day > from && day < end
                  return (
                    <button
                      key={day}
                      type="button"
                      className="date-day"
                      data-outside={outside || undefined}
                      data-today={day === today || undefined}
                      data-start={isStart || undefined}
                      data-end={isEnd || undefined}
                      data-in-range={inRange || undefined}
                      aria-pressed={isStart || isEnd}
                      aria-label={d.toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      onMouseEnter={() => picking && setHover(day)}
                      onClick={() => pick(day)}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>
              <div className="date-foot">
                <span>
                  {picking ? "Now pick the end date" : "Pick a start date"}
                </span>
                {from && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onChange({ from: "", to: "" })}
                  >
                    Clear dates
                  </button>
                )}
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
