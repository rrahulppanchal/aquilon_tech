import type { Extraction } from "@/lib/ai/extraction-schema"
import { convertArea } from "@/lib/money"
import type { Company, Customer, Issue, Quote, QuoteLine, Rate } from "../types"
import { recalculate } from "./pricing"
export function buildQuote(input: {
  id: string
  enquiryId: string
  text: string
  extraction: Extraction
  company: Company
  rates: Rate[]
  customer: Customer | null
  now?: string
  // Builds the normal priced draft even for a site-visit job, so the items are
  // ready for the owner once the site has been seen.
  ignoreVisit?: boolean
}): Quote {
  const { extraction: e, company, rates, customer } = input
  const now = input.now || new Date().toISOString()
  const lines: QuoteLine[] = []
  const issues: Issue[] = []
  const issue = (
    title: string,
    detail: string,
    blocking = true,
    ownerOnly = false
  ) =>
    issues.push({
      id: `issue-${issues.length + 1}`,
      title,
      detail,
      blocking,
      resolution: "",
      ownerOnly,
    })
  const add = (code: string, quantity: number | null, note = "") => {
    const rate = rates.find((r) => r.code === code && r.status === "active")
    lines.push({
      id: `line-${lines.length + 1}`,
      code,
      description: rate?.description || `Unconfirmed item (${code})`,
      quantity,
      unit: rate?.unit || "job",
      ratePence: rate?.ratePence ?? null,
      totalPence: null,
      excluded: false,
      note,
    })
  }
  const unknown = (description: string, note: string) =>
    lines.push({
      id: `line-${lines.length + 1}`,
      code: null,
      description,
      quantity: 1,
      unit: "job",
      ratePence: null,
      totalPence: null,
      excluded: false,
      note,
    })
  // "About two cars": estimate from the company's configured bay size, flagged below.
  const carEstimate =
    e.area === null && e.carSpaces
      ? e.carSpaces * (company.carSpaceM2 ?? 12.5)
      : null
  // Models sometimes report "20ft by 15ft" as 300 m². If the email gives feet
  // and the figure matches their product, read it as square feet.
  const feet = feetArea(input.text)
  const unit =
    e.areaUnit === "m2" &&
    e.area !== null &&
    feet !== null &&
    Math.abs(e.area - feet) < 0.5
      ? "ft2"
      : e.areaUnit
  const area = e.area === null ? carEstimate : convertArea(e.area, unit)
  const needsVisit =
    !input.ignoreVisit &&
    (e.carPark ||
      e.bigCommercial ||
      (area !== null && area > company.siteVisitAbove))
  let status: Quote["status"] = needsVisit
    ? "site_visit_required"
    : "needs_review"
  let summary = "Check the work, sizes and prices below, then approve."
  if (needsVisit) {
    summary =
      "This job needs a site visit before it can be priced. No price has been given."
    issue(
      "Dave needs to see the site",
      "Too big or too complex to price from an email. Check access, drainage and how the work would be phased.",
      true,
      true
    )
  } else if (e.job === "resin") {
    unknown(
      "Resin work",
      "Dave prices resin himself. The supplier price changes often."
    )
    issue(
      "Dave needs to price the resin",
      "Resin isn’t in the price list. Dave sets this price.",
      true,
      true
    )
  } else if (
    company.recipe === "groundworks" &&
    ["block_paving", "porcelain", "sandstone", "tarmac", "overlay"].includes(
      e.job
    )
  ) {
    if (area === null)
      issue(
        "Size not given",
        "The email doesn’t say how big the area is. Ask the customer, then fill in the quantities."
      )
    if (carEstimate !== null) {
      issue(
        "Size is a guess: ask for measurements",
        `The customer described the area as about ${e.carSpaces} car space${e.carSpaces === 1 ? "" : "s"}. Estimated at ${e.carSpaces} × ${company.carSpaceM2 ?? 12.5} m² = ${carEstimate.toFixed(2)} m². Ask them to measure before you approve.`
      )
      summary =
        "Rough estimate only: the customer gave the size in cars. Ask them to measure before you approve."
    } else if (e.estimated || (area !== null && area >= 140))
      issue(
        "Check the size",
        `The email gives about ${area === null ? "an unknown area" : `${area.toFixed(2)} m²`}. Make sure that’s right. Jobs near 150 m² may need a visit.`
      )
    const patio = ["porcelain", "sandstone"].includes(e.job)
    const overlay = e.job === "overlay"
    if (!overlay) {
      if (e.existingSurface === "concrete") {
        add("EX04", area, "Priced for concrete up to 150 mm thick.")
        issue(
          "Check the concrete depth",
          "Find out how thick the old concrete is and whether more digging is needed under it."
        )
      } else if (e.existingSurface === "tarmac") {
        add("EX03", area)
        unknown(
          "Extra digging under the old tarmac",
          "Depth not known yet. Price it once you’ve checked."
        )
      } else {
        add("EX01", area)
        if (e.existingSurface === "unknown")
          issue(
            "Check what’s there now",
            "The email doesn’t say if it’s grass, concrete or something else. That changes the digging price."
          )
        if (!patio)
          add(
            "EX02",
            area === null ? null : area * 0.1,
            "The extra 100 mm, to dig 250 mm in total."
          )
      }
      add("SB01", area)
      if (!patio) add("SB04", area)
    }
    const finish = e.customerSupplies
      ? e.job === "block_paving"
        ? "BP03"
        : patio
          ? "PT03"
          : "TM01"
      : (
          {
            block_paving: "BP01",
            porcelain: "PT02",
            sandstone: "PT01",
            tarmac: "TM01",
            overlay: "TM02",
          } as Record<string, string>
        )[e.job]
    add(finish, area)
    if (e.herringbone && finish === "BP01")
      lines.push({
        id: `line-${lines.length + 1}`,
        code: "BP01-H",
        description: "Herringbone laying supplement",
        quantity: area,
        unit: "m²",
        ratePence: 400,
        totalPence: null,
        excluded: false,
        note: "£4/m² supplement from BP01 source note.",
      })
    if (e.job === "block_paving") {
      add("KB01", e.edgeMetres, "Only the open sides. Check the length.")
      issue(
        "Check the edging length",
        "Measure the sides that need kerbs, and how the new paving meets the old drive."
      )
    }
    if (!overlay) {
      const volume =
        area === null
          ? null
          : area * (patio || e.existingSurface === "concrete" ? 0.15 : 0.25)
      if (volume !== null && volume <= 6)
        add(
          "PL01",
          1,
          `One skip for about ${volume.toFixed(1)} m³ of dug soil. Check it all fits.`
        )
      else if (volume !== null && !e.hardAccess)
        // Dave: over ~6 m³ use a grab (EX07) if a lorry can reach it, otherwise an
        // 8-wheeler (EX05, ~10 m³ a load), rounded up to full loads.
        add(
          "EX05",
          Math.ceil(volume / 10),
          `About ${volume.toFixed(1)} m³ of soil at about 10 m³ a lorry load, rounded up. Use a grab lorry (EX07) instead if one can reach the site.`
        )
      else
        unknown(
          "Taking the waste away",
          e.hardAccess
            ? "Access is hard, so Dave decides how the waste goes."
            : "The size isn’t known, so the number of loads can’t be worked out yet."
        )
      if (e.onRoadSkip && volume !== null && volume <= 6)
        lines.push({
          id: `line-${lines.length + 1}`,
          code: "PL01-PERMIT",
          description: "Permit for a skip on the road",
          quantity: 1,
          unit: "each",
          ratePence: 6000,
          totalPence: null,
          excluded: false,
          note: "£60, from the skip price note. Check the council allows it.",
        })
      issue(
        "Check waste removal and access",
        "Make sure the skip or lorry can get in and is big enough, and that waste isn’t charged twice.",
        true,
        e.hardAccess
      )
    }
    if (overlay)
      issue(
        "Check the old surface is solid",
        "New tarmac can only go on top of a sound base. Check before approving.",
        true,
        true
      )
  } else if (company.recipe === "landscaping" && e.job === "turf") {
    add("TOPSOIL", area)
    add("TURF", area)
    issue(
      "Check the lawn area and preparation",
      "Confirm the size, what’s there now, and what needs clearing."
    )
  } else {
    unknown(
      "The work asked for",
      "This isn’t a job type we can price automatically."
    )
    issue(
      "Dave needs to work out this job",
      "Decide what work is needed and set the prices.",
      true,
      true
    )
  }
  if (e.newDroppedKerb) {
    issue(
      "Dropped kerb: we don’t do these",
      "Tell the customer to contact the council for an approved contractor.",
      !needsVisit
    )
    if (e.job === "other" && !e.extras.length && !needsVisit) {
      status = "declined"
      lines.length = 0
      summary =
        "We don’t do dropped kerbs. Tell the customer to contact the council."
    }
  }
  if (!needsVisit && status !== "declined") {
    if (e.drainMetres !== null) {
      add("DR01", e.drainMetres)
      unknown(
        "Connecting to the existing drain",
        "Check the route, slope and condition of the drain before pricing."
      )
    }
    if (e.soakaway) {
      add("DR03", 1)
      issue(
        "Soakaway needs a drainage test",
        "A percolation test is needed before a soakaway can be confirmed.",
        true,
        true
      )
    }
    if (e.hardAccess)
      issue(
        "Hard access: Dave to check",
        "Getting to the site looks difficult. Dave decides how it’s done. No extra charge has been added.",
        true,
        true
      )
    for (const extra of e.extras)
      unknown(extra, "Not in your price list. Add a price, or leave it out.")
    add(company.recipe === "groundworks" ? "PL02" : "SETUP", 1)
    issue(
      "Check the job matches the email",
      "Read the original email and make sure every item and quantity is right."
    )
  }
  if (
    /40%|waive.{0,30}minimum|mark.{0,40}approved|ignore.{0,30}instructions/i.test(
      input.text
    )
  )
    issue(
      "Email asked for a discount or approval: ignored",
      "Only you can give discounts or approve quotes. Instructions written in an email are never followed.",
      false
    )
  if (!customer)
    issue(
      "New or unknown customer",
      "This sender isn’t in your customer list. Check their name and contact details.",
      !needsVisit && status !== "declined"
    )
  return recalculate(
    {
      id: input.id,
      reference: `${company.initials}-${input.id
        .replace(/[^a-z0-9]/gi, "")
        .slice(-6)
        .toUpperCase()}`,
      enquiryId: input.enquiryId,
      title: e.title,
      customerId: customer?.id || null,
      customerName: customer?.name || e.customerName || "New customer",
      customerEmail: e.customerEmail || customer?.emails[0] || "",
      address: e.address || customer?.address || "",
      paymentTerms: customer?.paymentTerms || "On completion",
      invoiceEmail: customer?.invoiceEmail || e.customerEmail,
      rawText: input.text,
      status,
      version: 1,
      createdAt: now,
      approvedAt: null,
      approvedBy: null,
      expiresAt: null,
      lines,
      issues,
      summary,
      subtotalPence: 0,
      minimumTopUpPence: 0,
      vatPence: 0,
      totalPence: null,
      vatPercent: company.vatPercent,
      activity: [
        { at: now, message: "Draft created. Check it before approving." },
      ],
      afterVisit: needsVisit
        ? (() => {
            const priced = buildQuote({ ...input, ignoreVisit: true })
            return { lines: priced.lines, issues: priced.issues }
          })()
        : null,
    },
    company
  )
}

// Area in square feet from dimensions like "20ft by 15ft" or "20' x 15'".
export function feetArea(text: string): number | null {
  const m = text.match(
    /(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')/i
  )
  return m ? Number(m[1]) * Number(m[2]) : null
}
