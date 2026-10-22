import { z } from "zod"
// Used by both the rate form and the server, so the same rules apply on both sides.
export const rateUnits = [
  "m²",
  "m",
  "m³",
  "tonne",
  "each",
  "job",
  "load",
  "day",
  "hour",
] as const
export const rateStatuses = [
  "active",
  "review",
  "superseded",
  "unavailable",
] as const
// Codes the drafting rules look up by name (features/quotes/domain/build-quote.ts).
// Removing or retiring one means drafts show that item as unpriced instead.
export const recipeCodes = [
  "BP01",
  "BP03",
  "DR01",
  "DR03",
  "EX01",
  "EX02",
  "EX03",
  "EX04",
  "EX05",
  "KB01",
  "PL01",
  "PL02",
  "PT01",
  "PT02",
  "PT03",
  "SB01",
  "SB04",
  "TM01",
  "TM02",
  "TOPSOIL",
  "TURF",
  "SETUP",
] as const
export const isRecipeCode = (code: string) =>
  (recipeCodes as readonly string[]).includes(code)
export const rateCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9-]{0,11}$/,
    "Use up to 12 letters, numbers or dashes, e.g. BP05."
  )
const rateBase = z.object({
  description: z.string().trim().min(2, "Describe the work.").max(200),
  unit: z.enum(rateUnits),
  ratePence: z.number().int().min(0).max(10_000_000).nullable(),
  status: z.enum(rateStatuses),
  notes: z.string().trim().max(500),
})
const priceWhenInUse = {
  check: (rate: { status: string; ratePence: number | null }) =>
    rate.status !== "active" || rate.ratePence !== null,
  message:
    "A rate in use needs a price. Mark it “Needs checking” until you have one.",
}
export const rateFields = rateBase.strict().refine(priceWhenInUse.check, {
  message: priceWhenInUse.message,
  path: ["ratePence"],
})
export const newRate = rateBase
  .extend({ code: rateCode })
  .strict()
  .refine(priceWhenInUse.check, {
    message: priceWhenInUse.message,
    path: ["ratePence"],
  })
export type RateFields = z.infer<typeof rateFields>
