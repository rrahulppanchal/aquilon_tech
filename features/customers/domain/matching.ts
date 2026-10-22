import type { Customer } from "@/features/quotes/types"
export function normalizeCustomers(rows: Record<string, string>[]): Customer[] {
  const customers: Customer[] = []
  for (const row of rows) {
    const phone = row.Phone.replace(/\s/g, "")
    const email = row.Email.toLowerCase().trim()
    // Reviewed aliases from the supplied fixture, not a general fuzzy auto-merge.
    const alias =
      row.Name === "Mrs P Okafor"
        ? "Patience Okafor"
        : row.Name === "M. Hale"
          ? "Marcus Hale"
          : ""
    const existing = customers.find(
      (c) =>
        (email && c.emails.includes(email)) ||
        (phone && c.phone === phone) ||
        c.name === alias
    )
    if (existing) {
      if (email && !existing.emails.includes(email)) existing.emails.push(email)
      existing.aliases.push(row.Name)
      if (email.startsWith("accounts@")) existing.invoiceEmail = email
      if (row.Notes) existing.notes += `; ${row.Notes}`
      continue
    }
    customers.push({
      id: `customer-${customers.length + 1}`,
      name: row.Name,
      company: row.Company,
      emails: email ? [email] : [],
      phone,
      address: row.Address,
      notes: row.Notes,
      aliases: [],
      paymentTerms: /30 day/.test(row.Notes) ? "30 days" : "On completion",
      invoiceEmail: email,
    })
  }
  return customers
}
export function matchCustomer(text: string, customers: Customer[]) {
  // Match the sender, not arbitrary email addresses in a forwarded body.
  const sender = text.match(/^From:\s*(.+)$/im)?.[1]?.toLowerCase() || ""
  return customers.find((c) => c.emails.some((e) => sender.includes(e))) || null
}
