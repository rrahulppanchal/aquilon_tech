import type { Rate } from "@/features/quotes/types"
export function normalizeRate(row: Record<string, string>): Rate {
  const code = row.Code
  const normalized = row.Rate.replace(/[£,\s]/g, "")
  const number = normalized ? Number(normalized) : Number.NaN
  const units: Record<string, string> = {
    m2: "m²",
    sqm: "m²",
    "m²": "m²",
    "lin m": "m",
    m: "m",
    "per tonne": "tonne",
    m3: "m³",
  }
  let status: Rate["status"] = Number.isFinite(number)
    ? "active"
    : "unavailable"
  if (["BP02", "SB02", "EX06", "KB02"].includes(code)) status = "superseded"
  if (["BP04", "MI02", "CO02"].includes(code)) status = "review"
  return {
    code,
    description: row.Item,
    unit: units[row.Unit] || row.Unit,
    ratePence: Number.isFinite(number)
      ? code === "PT01"
        ? 7083
        : Math.round(number * 100)
      : null,
    status,
    notes: row.Notes || "",
    originalRate: row.Rate,
  }
}
