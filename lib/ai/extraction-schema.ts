import { z } from "zod"
export const extractionSchema = z
  .object({
    title: z.string().max(150),
    customerName: z.string().max(120),
    customerEmail: z.string().max(200),
    address: z.string().max(300),
    job: z.enum([
      "block_paving",
      "porcelain",
      "sandstone",
      "tarmac",
      "overlay",
      "resin",
      "turf",
      "other",
    ]),
    area: z.number().min(0).max(100000).nullable(),
    areaUnit: z.enum(["m2", "ft2"]),
    estimated: z.boolean(),
    // Vague sizes such as "about two cars": the count only, never a guessed area.
    carSpaces: z.number().min(0).max(20).nullable(),
    edgeMetres: z.number().min(0).max(10000).nullable(),
    drainMetres: z.number().min(0).max(10000).nullable(),
    existingSurface: z.enum(["grass", "concrete", "tarmac", "unknown"]),
    carPark: z.boolean(),
    bigCommercial: z.boolean(),
    newDroppedKerb: z.boolean(),
    hardAccess: z.boolean(),
    onRoadSkip: z.boolean(),
    soakaway: z.boolean(),
    herringbone: z.boolean(),
    customerSupplies: z.boolean(),
    extras: z.array(z.string().max(250)).max(12),
    evidence: z.array(z.string().max(500)).max(15),
  })
  .strict()
export type Extraction = z.infer<typeof extractionSchema>
