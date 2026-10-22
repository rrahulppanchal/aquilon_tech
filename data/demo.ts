import seed from "./seed.json" with { type: "json" }
import type {
  Company,
  Customer,
  Rate,
  Sample,
  WorkspaceData,
} from "@/features/quotes/types"
import type { Extraction } from "@/lib/ai/extraction-schema"
import { buildQuote } from "@/features/quotes/domain/build-quote"
import { matchCustomer } from "@/features/customers/domain/matching"
export const hollis: Company = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Hollis Groundworks",
  initials: "HG",
  location: "Walsall, West Midlands",
  vatPercent: 20,
  minimumPence: 45000,
  validityDays: 30,
  siteVisitAbove: 150,
  carSpaceM2: 12.5,
  recipe: "groundworks",
}
export const greenfield: Company = {
  ...hollis,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Greenfield Landscaping",
  initials: "GL",
  location: "Cannock, Staffordshire",
  minimumPence: 30000,
  recipe: "landscaping",
}
const base: Extraction = {
  title: "",
  customerName: "",
  customerEmail: "",
  address: "",
  job: "other",
  area: null,
  areaUnit: "m2",
  estimated: true,
  carSpaces: null,
  edgeMetres: null,
  drainMetres: null,
  existingSurface: "unknown",
  carPark: false,
  bigCommercial: false,
  newDroppedKerb: false,
  hardAccess: false,
  onRoadSkip: false,
  soakaway: false,
  herringbone: false,
  customerSupplies: false,
  extras: [],
  evidence: [],
}
export const sampleExtractions: Extraction[] = [
  {
    ...base,
    title: "Charcoal block driveway extension",
    customerName: "Patience Okafor",
    customerEmail: "patience.okafor64@example.com",
    address: "14 Linden Avenue, Walsall",
    job: "block_paving",
    area: 300,
    areaUnit: "ft2",
    edgeMetres: 10.668,
    existingSurface: "grass",
    extras: ["Relocate outside tap"],
    evidence: ["roughly 20ft by 15ft", "we don't need another one"],
  },
  {
    ...base,
    title: "Rushall Manor car park resurfacing",
    customerName: "Helen Marsh",
    customerEmail: "facilities@greenwaycare.example",
    address: "Rushall Manor, Rushall",
    job: "tarmac",
    area: 1200,
    carPark: true,
    bigCommercial: true,
    newDroppedKerb: true,
    existingSurface: "tarmac",
    evidence: ["approx 1,200 square metres", "open 24/7"],
  },
  {
    ...base,
    title: "Porcelain patio & channel drain",
    customerName: "Marcus Hale",
    customerEmail: "marcus@kestrelrow.example",
    address: "27 Bentley Lane WS2",
    job: "porcelain",
    area: 18,
    drainMetres: 3,
    existingSurface: "concrete",
    onRoadSkip: true,
    evidence: ["about 18 sq m", "skip would have to go on the road"],
  },
]
export const secondSamples: Sample[] = [
  {
    id: "garden-turf",
    title: "New lawn & topsoil",
    label: "Alex Morgan",
    text: "From: Alex Morgan <alex@example.com>\nSubject: New lawn\n\nPlease supply and lay turf over 35 square metres in our back garden in Cannock, with fresh topsoil. Access is through a wide side gate.",
  },
]
export const secondRates: Rate[] = [
  {
    code: "TURF",
    description: "Premium turf supply & lay",
    unit: "m²",
    ratePence: 1450,
    status: "active",
    notes: "Greenfield standard rate",
    originalRate: "14.50",
  },
  {
    code: "TOPSOIL",
    description: "Screened topsoil supply & spread",
    unit: "m²",
    ratePence: 1050,
    status: "active",
    notes: "100mm depth",
    originalRate: "10.50",
  },
  {
    code: "SETUP",
    description: "Garden setup & protection",
    unit: "job",
    ratePence: 9000,
    status: "active",
    notes: "One per job",
    originalRate: "90",
  },
]
export function getSeed(second = false) {
  return {
    company: second ? greenfield : hollis,
    rates: second ? secondRates : (seed.rates as Rate[]),
    customers: second
      ? [
          {
            id: "customer-g1",
            name: "Alex Morgan",
            company: "",
            emails: ["alex@example.com"],
            phone: "07700900440",
            address: "Cannock",
            notes: "Garden renovation enquiry",
            paymentTerms: "On completion",
            invoiceEmail: "alex@example.com",
            aliases: [],
          },
        ]
      : (seed.customers as Customer[]),
    samples: second ? secondSamples : seed.samples,
  }
}
export function sampleExtraction(
  sampleIndex: number,
  second = false
): Extraction {
  return second
    ? {
        ...base,
        title: "Garden lawn renovation",
        customerName: "Alex Morgan",
        customerEmail: "alex@example.com",
        address: "Cannock",
        job: "turf",
        area: 35,
        existingSurface: "grass",
      }
    : sampleExtractions[sampleIndex]
}
// Test fixture: a workspace built from the supplied enquiries and fixed extractions.
export function sampleWorkspace(second = false): WorkspaceData {
  const data = getSeed(second)
  const quotes = data.samples.map((sample, i) =>
    buildQuote({
      ...data,
      id: `sample-${second ? "g" : "h"}-${i + 1}`,
      enquiryId: sample.id,
      text: sample.text,
      extraction: sampleExtraction(i, second),
      customer: matchCustomer(sample.text, data.customers),
      now: `2026-10-22T0${9 - i}:00:00.000Z`,
    })
  )
  quotes.forEach((quote, i) => {
    quote.reference = `${data.company.initials}-${1042 + i}`
  })
  return {
    ...data,
    quotes,
    enquiries: [],
    user: { name: second ? "Gaz Morgan" : "Dave Hollis", role: "owner" },
    key: { configured: false, provider: null, model: null, suffix: "" },
    mail: {
      configured: false,
      email: "",
      username: "",
      imapHost: "",
      imapPort: 993,
      smtpHost: "",
      smtpPort: 465,
      updatedAt: null,
    },
  }
}
