import "server-only"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import type { TenantContext } from "@/lib/auth/tenant-context"
import { ownerQuery } from "@/lib/db/pool"
import { AppError } from "@/lib/http/errors"
import { extractEnquiry } from "@/lib/ai/extract"
import { aiCredential, aiStatus } from "@/features/settings/server/ai-settings"
import { mailStatus } from "@/features/mail/server/service"
import { buildQuote } from "../domain/build-quote"
import {
  approveQuote,
  editQuote,
  startPricingAfterVisit,
} from "../domain/pricing"
import { matchCustomer } from "@/features/customers/domain/matching"
import {
  catalogue,
  getEnquiryText,
  getQuote,
  listEnquiries,
  listQuotes,
  quoteForEnquiry,
  saveQuote,
} from "./repository"
import type { Quote, WorkspaceData } from "../types"
import { getSeed } from "@/data/demo"
export const editSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    lines: z
      .array(
        z
          .object({
            id: z.string().max(100),
            quantity: z.number().min(0.001).max(100000).nullable(),
            ratePence: z.number().int().min(0).max(100000000).nullable(),
            excluded: z.boolean(),
            note: z.string().max(1000),
          })
          .strict()
      )
      .max(100),
    newLines: z
      .array(
        z
          .object({
            code: z.string().max(50).nullable(),
            description: z.string().min(1).max(300),
            quantity: z.number().min(0.001).max(100000).nullable(),
            ratePence: z.number().int().min(0).max(100000000).nullable(),
            unit: z.string().min(1).max(20),
            note: z.string().min(5).max(1000),
          })
          .strict()
      )
      .max(30)
      .optional(),
    resolutions: z
      .array(
        z
          .object({ id: z.string().max(100), resolution: z.string().max(2000) })
          .strict()
      )
      .max(100),
  })
  .strict()
export async function workspace(ctx: TenantContext): Promise<WorkspaceData> {
  const [data, quotes, key, enquiries, mail] = await Promise.all([
    catalogue(ctx),
    listQuotes(ctx),
    aiStatus(ctx),
    listEnquiries(ctx, true),
    mailStatus(ctx),
  ])
  return {
    ...data,
    quotes,
    key,
    mail,
    enquiries,
    company: ctx.company,
    user: { name: ctx.name, role: ctx.role },
    samples: getSeed(ctx.company.recipe === "landscaping").samples,
  }
}
export async function generate(
  ctx: TenantContext,
  enquiryId: string
): Promise<Quote> {
  const text = await getEnquiryText(ctx, enquiryId)
  const ai = await aiCredential(ctx)
  const [claimed] = await ownerQuery<{ state: string }>(
    "select fieldquote.claim_generation($1,$2,$3) as state",
    [ctx.companyId, ctx.userId, enquiryId]
  )
  if (claimed.state === "completed") return quoteForEnquiry(ctx, enquiryId)
  try {
    const data = await catalogue(ctx)
    const extraction = await extractEnquiry({
      ...ai,
      text,
      company: ctx.company,
      rates: data.rates,
    })
    const quote = buildQuote({
      ...data,
      id: randomUUID(),
      enquiryId,
      text,
      extraction,
      company: ctx.company,
      customer: matchCustomer(text, data.customers),
    })
    return await saveQuote(ctx, quote)
  } catch (error) {
    await ownerQuery(
      "update fieldquote.enquiries set state='failed', failure_code=$3 where id=$1 and company_id=$2 and state='processing'",
      [
        enquiryId,
        ctx.companyId,
        error instanceof AppError ? error.code : "GENERATION_FAILED",
      ]
    ).catch(() => undefined)
    throw error
  }
}
export async function update(ctx: TenantContext, id: string, input: unknown) {
  const edits = editSchema.parse(input)
  const previous = await getQuote(ctx, id)
  if (previous.version !== edits.expectedVersion)
    throw new AppError(
      "CONFLICT",
      "Someone else changed this quote. Reload the page to see their changes.",
      409
    )
  let next: Quote
  try {
    next = editQuote(
      previous,
      edits,
      ctx.company,
      ctx.role,
      (await catalogue(ctx)).rates
    )
  } catch (error) {
    throw new AppError("EDIT", (error as Error).message, 422)
  }
  return saveQuote(ctx, next, previous.version)
}
export async function approve(
  ctx: TenantContext,
  id: string,
  expectedVersion: number
) {
  const previous = await getQuote(ctx, id)
  if (previous.version !== expectedVersion)
    throw new AppError(
      "CONFLICT",
      "Someone else changed this quote. Reload the page and check it again.",
      409
    )
  let next: Quote
  try {
    next = approveQuote(previous, ctx.company, ctx.name)
  } catch (error) {
    throw new AppError("APPROVAL", (error as Error).message, 422)
  }
  return saveQuote(ctx, next, previous.version)
}

export const afterVisitSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    visitNotes: z
      .string()
      .trim()
      .max(
        2000,
        "That’s too long. Keep the visit notes under 2,000 characters."
      ),
  })
  .strict()
export async function priceAfterVisit(
  ctx: TenantContext,
  id: string,
  input: unknown
) {
  const parsed = afterVisitSchema.parse(input)
  const previous = await getQuote(ctx, id)
  const { rates } = await catalogue(ctx)
  let next: Quote
  try {
    next = startPricingAfterVisit(
      previous,
      parsed,
      ctx.company,
      rates,
      ctx.role
    )
  } catch (error) {
    throw new AppError("AFTER_VISIT", (error as Error).message, 422)
  }
  return saveQuote(ctx, next, previous.version)
}
