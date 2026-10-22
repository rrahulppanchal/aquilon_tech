import "server-only"
import type { TenantContext } from "@/lib/auth/tenant-context"
import { ownerQuery } from "@/lib/db/pool"
import { AppError } from "@/lib/http/errors"
import type { Rate } from "@/features/quotes/types"
import {
  deleteRate,
  getRate,
  insertRate,
  rateExists,
  updateRate,
} from "@/features/quotes/server/repository"
import { newRate, rateCode, rateFields } from "../domain/rules"
// Prices are Dave's call, so only the owner changes the rate list. Existing
// quotes keep their own copy of each rate and are never changed by this.
function requireOwner(ctx: TenantContext) {
  if (ctx.role !== "owner")
    throw new AppError("ROLE", "Only the owner can change rates.", 403)
}
const pounds = (pence: number | null) =>
  pence === null ? "TBC" : (pence / 100).toFixed(2)
async function audit(ctx: TenantContext, event: string, code: string) {
  await ownerQuery(
    "insert into fieldquote.audit_events(company_id,actor_id,entity_id,event) values($1,$2,$3,$4)",
    [ctx.companyId, ctx.userId, `rate:${code}`, event]
  )
}
export async function createRate(ctx: TenantContext, input: unknown) {
  requireOwner(ctx)
  const fields = newRate.parse(input)
  if (await rateExists(ctx, fields.code))
    throw new AppError(
      "DUPLICATE",
      `There’s already a rate with code ${fields.code}. Edit that one, or use another code.`,
      409
    )
  const rate: Rate = { ...fields, originalRate: pounds(fields.ratePence) }
  const saved = await insertRate(ctx, rate)
  await audit(ctx, "rate_created", rate.code)
  return saved
}
export async function editRate(
  ctx: TenantContext,
  code: string,
  input: unknown
) {
  requireOwner(ctx)
  const fields = rateFields.parse(input)
  const previous = await getRate(ctx, rateCode.parse(code))
  // The imported source value stays as provenance.
  const saved = await updateRate(ctx, {
    ...previous,
    ...fields,
    code: previous.code,
    originalRate: previous.originalRate,
  })
  await audit(ctx, "rate_updated", previous.code)
  return saved
}
export async function removeRate(ctx: TenantContext, code: string) {
  requireOwner(ctx)
  const parsed = rateCode.parse(code)
  await deleteRate(ctx, parsed)
  await audit(ctx, "rate_deleted", parsed)
  return { code: parsed }
}
