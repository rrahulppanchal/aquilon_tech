"use client"
import { useCallback, useState } from "react"
import { Select } from "@base-ui/react/select"
import { Combobox } from "@base-ui/react/combobox"
import { Check, ChevronsUpDown, ChevronDown, Search } from "lucide-react"

// A styled single-choice dropdown. Inside a modal <dialog> the popup is
// portalled into that dialog, since the page body sits under the top layer.
// With `inline`, the label is shown inside the trigger ("Customer  All").
export function SelectMenu({
  label,
  value,
  onChange,
  options,
  inline = false,
  disabled = false,
  className = "",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  inline?: boolean
  disabled?: boolean
  className?: string
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const anchor = useCallback((node: HTMLButtonElement | null) => {
    if (node) setContainer(node.closest("dialog") ?? document.body)
  }, [])
  return (
    <Select.Root
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next != null) onChange(next)
      }}
    >
      <Select.Trigger
        ref={anchor}
        className={`select-trigger ${inline && value !== options[0]?.value ? "is-set" : ""} ${className}`}
        aria-label={label}
      >
        {inline && <span className="select-trigger-label">{label}</span>}
        <Select.Value className="select-trigger-value" />
        <Select.Icon className="select-trigger-icon">
          <ChevronDown size={16} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal container={container}>
        <Select.Positioner
          className="select-positioner"
          sideOffset={6}
          align={inline ? "start" : "end"}
          alignItemWithTrigger={false}
        >
          <Select.Popup className="select-popup">
            <Select.List className="select-list">
              {options.map((o) => (
                <Select.Item
                  key={o.value}
                  value={o.value}
                  className="select-item"
                >
                  <Select.ItemText>{o.label}</Select.ItemText>
                  <Select.ItemIndicator className="select-item-check">
                    <Check size={15} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

type Option = { value: string; label: string }
// A dropdown for longer lists: the popup opens with a search box on top
// and the list below scrolls within a fixed height.
export function SearchSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Search",
  empty = "Nothing matches that search.",
  disabled = false,
  className = "",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  empty?: string
  disabled?: boolean
  className?: string
}) {
  const selected = options.find((o) => o.value === value) ?? null
  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={(next) => {
        if (next) onChange((next as Option).value)
      }}
      itemToStringLabel={(o: Option) => o.label}
      isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
      disabled={disabled}
    >
      <Combobox.Trigger
        className={`select-trigger select-block ${className}`}
        aria-label={label}
      >
        <span className="select-trigger-value">
          {selected?.label ?? "Choose"}
        </span>
        <ChevronsUpDown
          size={15}
          className="select-trigger-icon"
          aria-hidden="true"
        />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          className="select-positioner"
          sideOffset={6}
          align="start"
        >
          <Combobox.Popup className="select-popup search-popup" aria-label={label}>
            <div className="search-popup-field">
              <Search size={15} aria-hidden="true" />
              <Combobox.Input placeholder={placeholder} />
            </div>
            <Combobox.Empty className="search-popup-empty">{empty}</Combobox.Empty>
            <Combobox.List className="search-popup-list">
              {(o: Option) => (
                <Combobox.Item key={o.value} value={o} className="select-item">
                  <span>{o.label}</span>
                  <Combobox.ItemIndicator className="select-item-check">
                    <Check size={15} aria-hidden="true" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
