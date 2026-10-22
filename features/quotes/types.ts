export type Role = "owner" | "approver"
export type Company = {
  id: string
  name: string
  initials: string
  location: string
  vatPercent: number
  minimumPence: number
  validityDays: number
  siteVisitAbove: number
  // Configured assumption for "about N cars" sizes (2.5m x 5m bay by default).
  carSpaceM2?: number
  recipe: "groundworks" | "landscaping"
}
export type Rate = {
  code: string
  description: string
  unit: string
  ratePence: number | null
  status: "active" | "superseded" | "review" | "unavailable"
  notes: string
  originalRate: string
}
export type Customer = {
  id: string
  name: string
  company: string
  emails: string[]
  phone: string
  address: string
  notes: string
  paymentTerms: string
  invoiceEmail: string
  aliases: string[]
}
export type QuoteLine = {
  id: string
  code: string | null
  description: string
  quantity: number | null
  unit: string
  ratePence: number | null
  totalPence: number | null
  excluded: boolean
  note: string
}
export type Issue = {
  id: string
  title: string
  detail: string
  blocking: boolean
  resolution: string
  ownerOnly?: boolean
}
export type Quote = {
  id: string
  reference: string
  enquiryId: string
  title: string
  customerId: string | null
  customerName: string
  customerEmail: string
  address: string
  paymentTerms: string
  invoiceEmail: string
  rawText: string
  status:
    "draft" | "needs_review" | "site_visit_required" | "declined" | "approved"
  version: number
  createdAt: string
  approvedAt: string | null
  approvedBy: string | null
  expiresAt: string | null
  lines: QuoteLine[]
  issues: Issue[]
  summary: string
  subtotalPence: number
  minimumTopUpPence: number
  vatPence: number
  totalPence: number | null
  vatPercent: number
  activity: { at: string; message: string }[]
  // Items the draft would have used, kept for pricing after a site visit.
  afterVisit?: { lines: QuoteLine[]; issues: Issue[] } | null
  // Filled in when read from the database, never stored in the quote itself.
  lastSent?: { to: string; at: string; by: string } | null
}
export type Sample = { id: string; title: string; label: string; text: string }
export type SavedEnquiry = {
  id: string
  raw_text: string
  state: string
  created_at: string
  failure_code: string | null
}
export type WorkspaceData = {
  enquiries: SavedEnquiry[]
  company: Company
  user: { name: string; role: Role }
  rates: Rate[]
  customers: Customer[]
  quotes: Quote[]
  samples: Sample[]
  mail: import("@/lib/mail/presets").MailStatus
  key: {
    configured: boolean
    provider: "anthropic" | "openai" | null
    model: string | null
    suffix: string
  }
}
