import Decimal from "decimal.js"
export function lineAmount(quantity: number, ratePence: number) {
  return new Decimal(quantity)
    .mul(ratePence)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber()
}
export function money(pence: number | null) {
  return pence === null
    ? "Not priced"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
      }).format(pence / 100)
}
export function convertArea(value: number, unit: "m2" | "ft2") {
  return new Decimal(value).mul(unit === "ft2" ? "0.09290304" : 1).toNumber()
}
