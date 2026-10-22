import type { Company, Issue, Quote, Role, Rate, QuoteLine } from "../types"
import { lineAmount } from "@/lib/money"
export function recalculate(quote: Quote, company: Company): Quote {
  const lines = quote.lines.map((line) => ({
    ...line,
    totalPence:
      line.excluded || line.quantity === null || line.ratePence === null
        ? null
        : lineAmount(line.quantity, line.ratePence),
  }))
  const noPrice = ["site_visit_required", "declined"].includes(quote.status)
  const incomplete = lines.some((l) => !l.excluded && l.totalPence === null)
  const subtotalPence = lines.reduce(
    (sum, l) => sum + (l.excluded ? 0 : l.totalPence || 0),
    0
  )
  const minimumTopUpPence =
    noPrice || incomplete || !lines.some((l) => !l.excluded)
      ? 0
      : Math.max(0, company.minimumPence - subtotalPence)
  const vatPence = lineAmount(
    subtotalPence + minimumTopUpPence,
    company.vatPercent / 100
  )
  const blocking = quote.issues.some((i) => i.blocking && !i.resolution.trim())
  return {
    ...quote,
    lines,
    subtotalPence,
    minimumTopUpPence,
    vatPence,
    vatPercent: company.vatPercent,
    totalPence:
      noPrice || incomplete
        ? null
        : subtotalPence + minimumTopUpPence + vatPence,
    status:
      noPrice || quote.status === "approved"
        ? quote.status
        : blocking || incomplete
          ? "needs_review"
          : "draft",
  }
}
export function canApprove(quote: Quote): string | null {
  if (quote.status === "approved") return "This quote is already approved."
  if (["site_visit_required", "declined"].includes(quote.status))
    return "This job needs a site visit before it can be priced."
  if (!quote.lines.some((l) => !l.excluded))
    return "Add at least one item before approving."
  if (quote.totalPence === null)
    return "Some items have no price. Add a price or leave them out."
  if (quote.issues.some((i) => i.blocking && !i.resolution.trim()))
    return "Some checks aren’t done yet. Fill in each one marked in pink."
  return null
}
export type QuoteEdits = {
  expectedVersion: number
  lines: {
    id: string
    quantity: number | null
    ratePence: number | null
    excluded: boolean
    note: string
  }[]
  resolutions: { id: string; resolution: string }[]
  newLines?: {
    code: string | null
    description: string
    quantity: number | null
    ratePence: number | null
    unit: string
    note: string
  }[]
}
export function editQuote(
  quote: Quote,
  edits: QuoteEdits,
  company: Company,
  role: Role,
  rates: Rate[] = [],
  now = new Date().toISOString()
): Quote {
  if (edits.expectedVersion !== quote.version)
    throw new Error(
      "Someone else changed this quote. Reload the page to see their changes."
    )
  if (["site_visit_required", "declined"].includes(quote.status))
    throw new Error(
      "This job needs a site visit. Start a new quote after the visit."
    )
  const ids = edits.lines.map((l) => l.id)
  if (
    ids.length !== quote.lines.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !quote.lines.some((l) => l.id === id))
  )
    throw new Error(
      "This quote changed while you were editing. Reload the page."
    )
  const name = (line: { id?: string; description?: string }) =>
    `“${line.description || quote.lines.find((l) => l.id === line.id)?.description || "item"}”`
  for (const line of [...edits.lines, ...(edits.newLines || [])]) {
    if (
      line.quantity !== null &&
      (!Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        line.quantity > 100000)
    )
      throw new Error(`${name(line)}: enter a quantity above 0.`)
    if (
      line.ratePence !== null &&
      (!Number.isSafeInteger(line.ratePence) ||
        line.ratePence < 0 ||
        line.ratePence > 100000000)
    )
      throw new Error(`${name(line)}: enter a price of £0 or more.`)
  }
  if (
    new Set(edits.resolutions.map((r) => r.id)).size !==
      edits.resolutions.length ||
    edits.resolutions.some((r) => !quote.issues.some((i) => i.id === r.id))
  )
    throw new Error(
      "This quote changed while you were editing. Reload the page."
    )
  const lines = quote.lines.map((line) => {
    const edit = edits.lines.find((l) => l.id === line.id)!
    if (edit.ratePence !== line.ratePence && role !== "owner")
      throw new Error(
        `Only the owner can change prices. Ask them to change “${line.description}”.`
      )
    if (
      (edit.ratePence !== line.ratePence || edit.excluded !== line.excluded) &&
      edit.note.trim().length < 5
    )
      throw new Error(
        `“${line.description}”: add a short note saying why you changed the price or left it out.`
      )
    if (
      ["PL02", "SETUP"].includes(line.code || "") &&
      (edit.excluded || edit.quantity !== 1)
    )
      throw new Error(
        "Site setup is charged once on every job and can’t be removed."
      )
    return { ...line, ...edit }
  })
  if ((edits.newLines?.length || 0) + lines.length > 100)
    throw new Error("A quote can have up to 100 items.")
  if (edits.newLines?.length && role !== "owner")
    throw new Error("Only the owner can add items to a quote.")
  for (const item of edits.newLines || []) {
    if (item.note.trim().length < 5)
      throw new Error(
        `${name(item)}: add a short note saying why it was added.`
      )
    if (item.code && ["MI01", "PL02", "SETUP"].includes(item.code))
      throw new Error(
        "The minimum charge and site setup are added automatically."
      )
    const rate = item.code
      ? rates.find((r) => r.code === item.code && r.status === "active")
      : null
    if (item.code && !rate)
      throw new Error(
        "That price isn’t in use any more. Choose another from the list."
      )
    if (item.code && lines.some((l) => l.code === item.code && !l.excluded))
      throw new Error(
        `${name(item)} is already on this quote. Change its quantity instead.`
      )
    if (!rate && !item.description.trim())
      throw new Error("Describe the item you’re adding.")
    const line: QuoteLine = {
      id: `line-${lines.length + 1}`,
      code: item.code,
      description: rate?.description || item.description.trim(),
      unit: rate?.unit || item.unit,
      quantity: item.quantity,
      ratePence: rate ? rate.ratePence : item.ratePence,
      totalPence: null,
      excluded: false,
      note: item.note,
    }
    if (rate && item.ratePence !== rate.ratePence)
      throw new Error(
        "Add the item at its normal price first, then change the price."
      )
    lines.push(line)
  }
  const issues = quote.issues.map((issue) => {
    const resolution =
      edits.resolutions.find((r) => r.id === issue.id)?.resolution ??
      issue.resolution
    if (resolution !== issue.resolution && issue.ownerOnly && role !== "owner")
      throw new Error(`Only the owner can sign off “${issue.title}”.`)
    if (resolution && resolution.trim().length < 5)
      throw new Error(
        `“${issue.title}”: write a little more about what you checked (at least 5 letters).`
      )
    return { ...issue, resolution }
  })
  return recalculate(
    {
      ...quote,
      lines,
      issues,
      status: "draft",
      version: quote.version + 1,
      approvedAt: null,
      approvedBy: null,
      expiresAt: null,
      activity: [
        ...quote.activity,
        {
          at: now,
          message: "Changes saved. Any approval was removed.",
        },
      ],
    },
    company
  )
}
export function approveQuote(
  quote: Quote,
  company: Company,
  actor: string,
  now = new Date()
): Quote {
  const fresh = recalculate(quote, company)
  const error = canApprove(fresh)
  if (error) throw new Error(error)
  return {
    ...fresh,
    status: "approved",
    version: quote.version + 1,
    approvedAt: now.toISOString(),
    approvedBy: actor,
    expiresAt: new Date(
      now.getTime() + company.validityDays * 86400000
    ).toISOString(),
    activity: [
      ...quote.activity,
      {
        at: now.toISOString(),
        message: `Approved by ${actor}. Valid for ${company.validityDays} days.`,
      },
    ],
  }
}
export type Problem = { field: string; message: string }
// Every problem in an edited quote, each tied to the field to fix. The page
// shows them all at once; editQuote enforces the same rules on the server.
export function findProblems(original: Quote, draft: Quote): Problem[] {
  const problems: Problem[] = []
  for (const line of draft.lines) {
    const before = original.lines.find((l) => l.id === line.id)
    if (
      line.quantity !== null &&
      (!Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        line.quantity > 100000)
    )
      problems.push({
        field: `qty-${line.id}`,
        message: "Enter a quantity above 0.",
      })
    if (
      line.ratePence !== null &&
      (!Number.isSafeInteger(line.ratePence) ||
        line.ratePence < 0 ||
        line.ratePence > 100000000)
    )
      problems.push({
        field: `rate-${line.id}`,
        message: "Enter a price of £0 or more.",
      })
    const needsReason = before
      ? line.ratePence !== before.ratePence || line.excluded !== before.excluded
      : !line.excluded
    if (needsReason && line.note.trim().length < 5)
      problems.push({
        field: `note-${line.id}`,
        message: before
          ? line.excluded !== before.excluded
            ? "Say why this is left out (at least 5 letters)."
            : "Say why the price changed (at least 5 letters)."
          : "Say why this was added (at least 5 letters).",
      })
  }
  for (const issue of draft.issues) {
    const text = issue.resolution.trim()
    if (text && text.length < 5)
      problems.push({
        field: `issue-${issue.id}`,
        message:
          "Write a little more (at least 5 letters), e.g. “Checked with customer”.",
      })
  }
  return problems
}
// After the site visit the owner turns a "site visit" quote into a normal
// draft: the visit notes are recorded, the items worked out from the email
// come back for checking, and the usual review and approval rules apply.
export function startPricingAfterVisit(
  quote: Quote,
  input: { expectedVersion: number; visitNotes: string },
  company: Company,
  rates: Rate[],
  role: Role,
  now = new Date().toISOString()
): Quote {
  if (role !== "owner")
    throw new Error("Only the owner can price a job after the site visit.")
  if (input.expectedVersion !== quote.version)
    throw new Error(
      "Someone else changed this quote. Reload the page to see their changes."
    )
  if (quote.status !== "site_visit_required")
    throw new Error("This quote isn’t waiting for a site visit.")
  const notes = input.visitNotes.trim()
  if (notes.length < 5)
    throw new Error(
      "Write what you found on the visit (at least 5 letters), e.g. “Measured 1,150 m², drainage needed at entrance”."
    )
  const lines = (quote.afterVisit?.lines || []).map((line, i) => ({
    ...line,
    id: `line-${i + 1}`,
  }))
  const setupCode = company.recipe === "groundworks" ? "PL02" : "SETUP"
  const setup = rates.find((r) => r.code === setupCode && r.status === "active")
  if (setup && !lines.some((l) => l.code === setupCode))
    lines.push({
      id: `line-${lines.length + 1}`,
      code: setup.code,
      description: setup.description,
      quantity: 1,
      unit: setup.unit,
      ratePence: setup.ratePence,
      totalPence: null,
      excluded: false,
      note: "",
    })
  const issues: Issue[] = [
    {
      id: "issue-visit",
      title: "Site visit done",
      detail: "What was found on the visit.",
      blocking: true,
      resolution: notes,
      ownerOnly: true,
    },
    ...(quote.afterVisit?.issues || []).map((issue, i) => ({
      ...issue,
      id: `issue-${i + 1}`,
    })),
  ]
  return recalculate(
    {
      ...quote,
      status: "needs_review",
      version: quote.version + 1,
      lines,
      issues,
      afterVisit: null,
      summary:
        "Priced after the site visit. Check the work and prices, then approve.",
      activity: [
        ...quote.activity,
        { at: now, message: "Site visited. Pricing started." },
      ],
    },
    company
  )
}
