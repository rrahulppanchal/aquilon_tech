import type { Company, Quote } from "../types"
import { money } from "@/lib/money"
const amount = (quantity: number) =>
  quantity.toLocaleString("en-GB", { maximumFractionDigits: 2 })
// Plain-text version of an approved quote for the customer. Only priced,
// included items go in; internal notes and checks never do.
export function quoteText(quote: Quote, company: Company) {
  const first = quote.customerName.split(" ")[0] || "there"
  const items = quote.lines
    .filter((l) => !l.excluded && l.totalPence !== null && l.quantity !== null)
    .map(
      (l) =>
        `- ${l.description}: ${amount(l.quantity!)} ${l.unit} x ${money(l.ratePence)} = ${money(l.totalPence)}`
    )
  const valid = quote.expiresAt
    ? new Date(quote.expiresAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : `${company.validityDays} days from today`
  return [
    `Hi ${first},`,
    "",
    `Thanks for getting in touch. Here is our quote for ${quote.title}${quote.address ? ` at ${quote.address}` : ""}.`,
    "",
    ...items,
    ...(quote.minimumTopUpPence > 0
      ? [`- Minimum charge top-up: ${money(quote.minimumTopUpPence)}`]
      : []),
    "",
    `Total before VAT: ${money(quote.subtotalPence + quote.minimumTopUpPence)}`,
    `VAT (${quote.vatPercent}%): ${money(quote.vatPence)}`,
    `Total including VAT: ${money(quote.totalPence)}`,
    "",
    `This quote is valid until ${valid}. Payment terms: ${quote.paymentTerms.toLowerCase()}.`,
    `Quote reference: ${quote.reference}`,
    "",
    "Any questions, just reply to this email.",
    "",
    company.name,
  ].join("\n")
}
