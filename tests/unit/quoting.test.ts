import { describe, it, expect } from "vitest"
import { sampleWorkspace, getSeed, sampleExtractions } from "@/data/demo"
import { buildQuote } from "@/features/quotes/domain/build-quote"
import {
  recalculate,
  editQuote,
  approveQuote,
  canApprove,
  type QuoteEdits,
} from "@/features/quotes/domain/pricing"
import { convertArea, lineAmount } from "@/lib/money"
import { normalizeRate } from "@/features/rates/domain/normalize"
import { matchCustomer } from "@/features/customers/domain/matching"
import { extractionSchema } from "@/lib/ai/extraction-schema"
import type { Quote } from "@/features/quotes/types"
const data = sampleWorkspace()
const edits = (quote: Quote): QuoteEdits => ({
  expectedVersion: quote.version,
  lines: quote.lines.map(({ id, quantity, ratePence, excluded, note }) => ({
    id,
    quantity,
    ratePence,
    excluded,
    note,
  })),
  resolutions: quote.issues.map(({ id, resolution }) => ({ id, resolution })),
})
function resolvedQuote() {
  const quote = structuredClone(data.quotes[0])
  quote.lines.forEach((l) => {
    if (l.ratePence === null) {
      l.excluded = true
      l.note = "Excluded by customer, separate contractor."
    }
  })
  quote.issues.forEach(
    (i) => (i.resolution = "Confirmed dimensions and scope with customer.")
  )
  return recalculate(quote, data.company)
}
describe("measurement and money rules", () => {
  it("converts 300 square feet exactly", () =>
    expect(convertArea(300, "ft2")).toBe(27.870912))
  it("rounds line amounts to pennies, half up", () =>
    expect(lineAmount(1.005, 100)).toBe(101))
  it("normalizes VAT-inclusive sandstone rate to Shaz’s confirmed rate", () =>
    expect(
      normalizeRate({
        Code: "PT01",
        Item: "Patio",
        Unit: "m²",
        Rate: "85",
        Notes: "inc VAT",
      }).ratePence
    ).toBe(7083))
  it("quarantines suspicious concrete unit even when number parses", () => {
    const r = normalizeRate({
      Code: "CO02",
      Item: "Concrete",
      Unit: "m3",
      Rate: "£1,250",
      Notes: "uncertain",
    })
    expect(r.ratePence).toBe(125000)
    expect(r.status).toBe("review")
  })
  it("marks old block rate superseded", () =>
    expect(
      normalizeRate({
        Code: "BP02",
        Item: "Blocks",
        Unit: "sqm",
        Rate: "58",
        Notes: "",
      }).status
    ).toBe("superseded"))
  it("does not turn TBC into zero", () =>
    expect(
      normalizeRate({
        Code: "TM03",
        Item: "Resin",
        Unit: "m2",
        Rate: "TBC",
        Notes: "",
      }).ratePence
    ).toBeNull())
  it("applies minimum as a floor and VAT once", () => {
    const q = resolvedQuote()
    q.lines = [{ ...q.lines[0], quantity: 1, ratePence: 10000 }]
    const result = recalculate(q, data.company)
    expect(result.subtotalPence).toBe(10000)
    expect(result.minimumTopUpPence).toBe(35000)
    expect(result.vatPence).toBe(9000)
    expect(result.totalPence).toBe(54000)
  })
  it("does not finalize incomplete work", () => {
    expect(data.quotes[0].totalPence).toBeNull()
    expect(data.quotes[0].minimumTopUpPence).toBe(0)
  })
})
describe("supplied enquiries", () => {
  it("matches Okafor alternate email and preserves history", () => {
    const q = data.quotes[0]
    expect(q.customerName).toBe("Patience Okafor")
    expect(
      data.customers.find((c) => c.id === q.customerId)?.emails
    ).toHaveLength(2)
  })
  it("prices extra dig depth correctly, not full depth twice", () =>
    expect(
      data.quotes[0].lines.find((l) => l.code === "EX02")?.quantity
    ).toBeCloseTo(2.7870912))
  it("does not decline an existing kerb or invent a tap price", () => {
    const q = data.quotes[0]
    expect(q.status).toBe("needs_review")
    expect(
      q.issues.some((i) => i.title === "Dropped kerb: we don’t do these")
    ).toBe(false)
    expect(
      q.lines.find((l) => l.description === "Relocate outside tap")?.ratePence
    ).toBeNull()
  })
  it("car park produces no price, minimum or setup", () => {
    const q = data.quotes[1]
    expect(q.status).toBe("site_visit_required")
    expect(q.lines).toHaveLength(0)
    expect(q.totalPence).toBeNull()
    expect(q.minimumTopUpPence).toBe(0)
    expect(
      q.issues.some((i) => i.title === "Dropped kerb: we don’t do these")
    ).toBe(true)
  })
  it("ignores injected discount and automatic approval", () => {
    const q = data.quotes[2]
    expect(q.status).toBe("needs_review")
    expect(q.approvedAt).toBeNull()
    expect(q.lines.find((l) => l.code === "PT02")?.ratePence).toBe(9600)
    expect(
      q.issues.some(
        (i) => i.title === "Email asked for a discount or approval: ignored"
      )
    ).toBe(true)
  })
  it("keeps invoice contact and payment terms", () => {
    const q = data.quotes[2]
    expect(q.paymentTerms).toBe("30 days")
    expect(q.invoiceEmail).toBe("accounts@kestrelrow.example")
  })
  it("does not double-charge concrete breakout and topsoil removal", () => {
    const codes = data.quotes[2].lines.map((l) => l.code)
    expect(codes).toContain("EX04")
    expect(codes).not.toContain("EX01")
    expect(codes).not.toContain("DR02")
    expect(codes).toContain("PL01-PERMIT")
  })
  it("rejects security fields in extraction output", () =>
    expect(
      extractionSchema.safeParse({
        ...sampleExtractions[0],
        approved: true,
        discount: 40,
        companyId: "foreign",
      }).success
    ).toBe(false))
  it("routes jobs over 150 square metres to a visit", () => {
    const seed = getSeed()
    const q = buildQuote({
      ...seed,
      id: "test",
      enquiryId: "test",
      text: "large driveway",
      customer: null,
      extraction: { ...sampleExtractions[0], area: 151, areaUnit: "m2" },
    })
    expect(q.status).toBe("site_visit_required")
  })
  it("prices Okafor waste as one full 8-wheeler load, flagged for review", () => {
    const q = data.quotes[0]
    const waste = q.lines.find((l) => l.code === "EX05")
    expect(waste?.quantity).toBe(1)
    expect(waste?.ratePence).toBe(29500)
    expect(q.lines.some((l) => l.code === "PL01")).toBe(false)
    expect(
      q.issues.find((i) => i.title === "Check waste removal and access")
        ?.blocking
    ).toBe(true)
  })
  it("rounds larger digs up to full loads", () => {
    const seed = getSeed()
    const q = buildQuote({
      ...seed,
      id: "test",
      enquiryId: "test",
      text: "driveway",
      customer: null,
      extraction: { ...sampleExtractions[0], area: 100, areaUnit: "m2" },
    })
    // 100 m² × 0.25 m = 25 m³ → 3 loads, never 2.5
    expect(q.lines.find((l) => l.code === "EX05")?.quantity).toBe(3)
  })
  it("leaves waste for Dave when access is hard", () => {
    const seed = getSeed()
    const q = buildQuote({
      ...seed,
      id: "test",
      enquiryId: "test",
      text: "driveway",
      customer: null,
      extraction: { ...sampleExtractions[0], hardAccess: true },
    })
    expect(q.lines.some((l) => l.code === "EX05")).toBe(false)
    expect(
      q.lines.find((l) => l.description.startsWith("Taking the waste away"))
        ?.ratePence
    ).toBeNull()
  })
  it("estimates 'about two cars' from the configured bay size and asks to measure", () => {
    const seed = getSeed()
    const q = buildQuote({
      ...seed,
      id: "test",
      enquiryId: "test",
      text: "about the size of two cars",
      customer: null,
      extraction: {
        ...sampleExtractions[0],
        area: null,
        carSpaces: 2,
        estimated: true,
        edgeMetres: null,
      },
    })
    expect(q.lines.find((l) => l.code === "BP01")?.quantity).toBe(25)
    const estimate = q.issues.find((i) => i.title.startsWith("Size is a guess"))
    expect(estimate?.blocking).toBe(true)
    expect(estimate?.detail).toMatch(/measure/)
    expect(q.summary).toMatch(/Rough estimate/)
  })
  it("keeps second company data and rates separate", () => {
    const second = sampleWorkspace(true)
    expect(second.rates.some((r) => r.code === "BP01")).toBe(false)
    expect(second.quotes[0].lines.some((l) => l.code === "TURF")).toBe(true)
    expect(second.customers.some((c) => c.name === "Patience Okafor")).toBe(
      false
    )
  })
  it("only matches sender, not someone mentioned in body", () =>
    expect(
      matchCustomer(
        "From: stranger@example.com\nPlease invoice marcus@kestrelrow.example",
        data.customers
      )
    ).toBeNull())
})
describe("approval and editing", () => {
  it("blocks unresolved approval", () =>
    expect(() => approveQuote(data.quotes[0], data.company, "Dave")).toThrow())
  it("blocks site-visit approval", () =>
    expect(() => approveQuote(data.quotes[1], data.company, "Dave")).toThrow())
  it("approves only resolved scope with expiry and actor", () => {
    const q = approveQuote(
      resolvedQuote(),
      data.company,
      "Dave",
      new Date("2026-10-22T12:00:00Z")
    )
    expect(q.status).toBe("approved")
    expect(q.approvedBy).toBe("Dave")
    expect(q.expiresAt).toBe("2026-11-21T12:00:00.000Z")
  })
  it("invalidates approval after any edit", () => {
    const q = approveQuote(resolvedQuote(), data.company, "Dave")
    const changed = editQuote(q, edits(q), data.company, "owner")
    expect(changed.status).toBe("draft")
    expect(changed.approvedAt).toBeNull()
    expect(changed.approvedBy).toBeNull()
    expect(changed.version).toBe(q.version + 1)
  })
  it("rejects stale edits", () => {
    const q = resolvedQuote()
    expect(() =>
      editQuote(q, { ...edits(q), expectedVersion: 99 }, data.company, "owner")
    ).toThrow(/changed/)
  })
  it("prevents Shaz from applying a special price", () => {
    const q = resolvedQuote()
    const e = edits(q)
    e.lines[0].ratePence = 1
    expect(() => editQuote(q, e, data.company, "approver")).toThrow(/owner/)
  })
  it("requires explanation for exclusion", () => {
    const q = data.quotes[0]
    const e = edits(q)
    e.lines[0].excluded = true
    e.lines[0].note = ""
    expect(() => editQuote(q, e, data.company, "owner")).toThrow(
      /why you changed the price or left it out/
    )
  })
  it("prevents removing setup", () => {
    const q = data.quotes[0]
    const e = edits(q)
    const setup = e.lines.find(
      (l) => l.id === q.lines.find((l) => l.code === "PL02")?.id
    )!
    setup.excluded = true
    setup.note = "Try to waive setup"
    expect(() => editQuote(q, e, data.company, "owner")).toThrow(/Site setup/)
  })
  it.each([-1, NaN, Infinity, 100001])(
    "rejects invalid quantity %s",
    (quantity) => {
      const q = data.quotes[0]
      const e = edits(q)
      e.lines[0].quantity = quantity
      expect(() => editQuote(q, e, data.company, "owner")).toThrow(/quantity/)
    }
  )
  it("cannot approve an empty scope", () => {
    const q = resolvedQuote()
    q.lines.forEach((l) => (l.excluded = true))
    expect(canApprove(recalculate(q, data.company))).toMatch(/at least/)
  })
})

describe("reviewer-added work items", () => {
  const extra = {
    code: "EX02",
    description: "Additional excavation",
    quantity: 1,
    ratePence: 4800,
    unit: "m³",
    note: "Additional depth confirmed during site inspection.",
  }
  it("adds a confirmed active catalogue item using its real description and unit", () => {
    const q = data.quotes[2]
    const updated = editQuote(
      q,
      { ...edits(q), newLines: [extra] },
      data.company,
      "owner",
      data.rates
    )
    expect(updated.lines.at(-1)?.description).toBe("Excavate to reduce levels")
    expect(updated.lines.at(-1)?.totalPence).toBe(4800)
  })
  it("rejects another company’s rate code", () => {
    const q = data.quotes[2]
    expect(() =>
      editQuote(
        q,
        { ...edits(q), newLines: [{ ...extra, code: "TURF" }] },
        data.company,
        "owner",
        data.rates
      )
    ).toThrow(/isn’t in use/)
  })
  it("does not permit double setup or minimum items", () => {
    const q = data.quotes[2]
    expect(() =>
      editQuote(
        q,
        { ...edits(q), newLines: [{ ...extra, code: "MI01" }] },
        data.company,
        "owner",
        data.rates
      )
    ).toThrow(/added automatically/)
  })
  it("requires owner authorization for additional scope", () => {
    const q = data.quotes[2]
    expect(() =>
      editQuote(
        q,
        { ...edits(q), newLines: [extra] },
        data.company,
        "approver",
        data.rates
      )
    ).toThrow(/owner/)
  })
  it("keeps unpriced manual work incomplete", () => {
    const q = resolvedQuote()
    const updated = editQuote(
      q,
      { ...edits(q), newLines: [{ ...extra, code: null, ratePence: null }] },
      data.company,
      "owner",
      data.rates
    )
    expect(updated.totalPence).toBeNull()
    expect(canApprove(updated)).toMatch(/no price/)
  })
})
describe("rate editing rules", () => {
  it("lists every rate code the drafting rules look up", async () => {
    const { readFileSync } = await import("node:fs")
    const { recipeCodes } = await import("@/features/rates/domain/rules")
    const source = readFileSync("features/quotes/domain/build-quote.ts", "utf8")
    const used = new Set(
      [
        ...source.matchAll(
          /"((?:EX|SB|BP|PT|TM|KB|PL|DR)\d+|TOPSOIL|TURF|SETUP)"/g
        ),
      ].map((m) => m[1])
    )
    expect([...used].sort()).toEqual([...recipeCodes].sort())
  })
  it("accepts a new rate and normalises its code", async () => {
    const { newRate } = await import("@/features/rates/domain/rules")
    const parsed = newRate.parse({
      code: " bp05 ",
      description: "Permeable block paving",
      unit: "m²",
      ratePence: 7200,
      status: "active",
      notes: "",
    })
    expect(parsed.code).toBe("BP05")
  })
  it("rejects a rate in use without a price, bad codes and unknown fields", async () => {
    const { newRate, rateFields } =
      await import("@/features/rates/domain/rules")
    const base = {
      description: "Something",
      unit: "m²",
      status: "active",
      notes: "",
    }
    expect(rateFields.safeParse({ ...base, ratePence: null }).success).toBe(
      false
    )
    expect(
      rateFields.safeParse({ ...base, ratePence: null, status: "review" })
        .success
    ).toBe(true)
    expect(
      newRate.safeParse({ ...base, ratePence: 100, code: "bad code!" }).success
    ).toBe(false)
    expect(
      rateFields.safeParse({ ...base, ratePence: 100, companyId: "x" }).success
    ).toBe(false)
    expect(rateFields.safeParse({ ...base, ratePence: -1 }).success).toBe(false)
  })
})

describe("plain-language validation", () => {
  it("lists each problem against the field to fix", async () => {
    const { findProblems } = await import("@/features/quotes/domain/pricing")
    const original = data.quotes[0]
    const draft = structuredClone(original)
    draft.lines[0].quantity = 0
    draft.lines[1].excluded = true
    draft.lines[1].note = ""
    draft.issues[0].resolution = "test"
    const problems = findProblems(original, draft)
    expect(problems).toEqual([
      {
        field: `qty-${draft.lines[0].id}`,
        message: "Enter a quantity above 0.",
      },
      expect.objectContaining({ field: `note-${draft.lines[1].id}` }),
      expect.objectContaining({ field: `issue-${draft.issues[0].id}` }),
    ])
    expect(problems[1].message).toMatch(/left out/)
  })
  it("names the item in server-side errors", () => {
    const q = data.quotes[0]
    const e = edits(q)
    e.resolutions[0].resolution = "abc"
    expect(() => editQuote(q, e, data.company, "owner")).toThrow(
      new RegExp(q.issues[0].title)
    )
  })
})
describe("site visits and pricing afterwards", () => {
  const okaforText = readOkafor()
  function readOkafor() {
    return "roughly 20ft by 15ft. It's just grass"
  }
  it("reads a feet-based size reported as m² as square feet", () => {
    const seed = getSeed()
    const q = buildQuote({
      ...seed,
      id: "t",
      enquiryId: "t",
      text: okaforText,
      customer: null,
      extraction: { ...sampleExtractions[0], area: 300, areaUnit: "m2" },
    })
    expect(q.status).not.toBe("site_visit_required")
    expect(q.lines.find((l) => l.code === "BP01")?.quantity).toBeCloseTo(
      27.87,
      2
    )
  })
  it("keeps the items for after the visit, and the owner can price them", async () => {
    const { startPricingAfterVisit } =
      await import("@/features/quotes/domain/pricing")
    const visit = data.quotes[1]
    expect(visit.status).toBe("site_visit_required")
    expect(visit.lines).toHaveLength(0)
    expect(visit.afterVisit?.lines.length).toBeGreaterThan(0)
    expect(() =>
      startPricingAfterVisit(
        visit,
        { expectedVersion: 1, visitNotes: "Measured 1,150 m²" },
        data.company,
        data.rates,
        "approver"
      )
    ).toThrow(/owner/)
    expect(() =>
      startPricingAfterVisit(
        visit,
        { expectedVersion: 1, visitNotes: "ok" },
        data.company,
        data.rates,
        "owner"
      )
    ).toThrow(/at least 5 letters/)
    const priced = startPricingAfterVisit(
      visit,
      {
        expectedVersion: 1,
        visitNotes: "Measured 1,150 m², drainage at entrance",
      },
      data.company,
      data.rates,
      "owner"
    )
    expect(priced.status).toBe("needs_review")
    expect(priced.version).toBe(2)
    expect(priced.lines.some((l) => l.code === "PL02")).toBe(true)
    expect(priced.issues[0]).toMatchObject({
      title: "Site visit done",
      resolution: "Measured 1,150 m², drainage at entrance",
    })
    expect(priced.afterVisit).toBeNull()
  })
  it("writes customer quote text with priced items only and no internal notes", async () => {
    const { quoteText } = await import("@/features/quotes/domain/quote-text")
    const q = structuredClone(data.quotes[2])
    q.lines.forEach((l) => {
      if (l.ratePence === null) l.excluded = true
    })
    const text = quoteText(recalculate(q, data.company), data.company)
    expect(text).toContain("Total including VAT")
    expect(text).toContain("Porcelain")
    expect(text).not.toContain("Untrusted")
    expect(text).not.toMatch(/Check the|Confirm/)
  })
})
