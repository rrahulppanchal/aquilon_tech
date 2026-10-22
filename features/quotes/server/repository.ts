import "server-only"
import type { TenantContext } from "@/lib/auth/tenant-context"
import { ownerQuery, pool, mapDatabaseError } from "@/lib/db/pool"
import { AppError } from "@/lib/http/errors"
import type { Customer, Quote, Rate, SavedEnquiry } from "../types"
export async function catalogue(ctx: TenantContext) {
  const [rates, customers] = await Promise.all([
    ctx.read<{ data: Rate }>(
      "select data from fieldquote.rates where company_id=$1 order by code",
      [ctx.companyId]
    ),
    ctx.read<{ data: Customer }>(
      "select data from fieldquote.customers where company_id=$1 order by id",
      [ctx.companyId]
    ),
  ])
  return {
    rates: rates.map((r) => r.data),
    customers: customers.map((r) => r.data),
  }
}
export async function listQuotes(ctx: TenantContext) {
  const rows = await ctx.read<{ data: Quote }>(
    "select q.data || jsonb_build_object('lastSent', ls.sent) as data from fieldquote.quotes q left join lateral (select json_build_object('to', s.to_email, 'at', s.sent_at, 'by', m.display_name) as sent from fieldquote.quote_sends s left join fieldquote.memberships m on m.user_id = s.sent_by where s.company_id = q.company_id and s.quote_id = q.id order by s.sent_at desc limit 1) ls on true where q.company_id=$1 order by q.created_at desc, q.id",
    [ctx.companyId]
  )
  return rows.map((row) => row.data)
}
export async function getQuote(ctx: TenantContext, id: string) {
  const [row] = await ctx.read<{ data: Quote }>(
    "select q.data || jsonb_build_object('lastSent', ls.sent) as data from fieldquote.quotes q left join lateral (select json_build_object('to', s.to_email, 'at', s.sent_at, 'by', m.display_name) as sent from fieldquote.quote_sends s left join fieldquote.memberships m on m.user_id = s.sent_by where s.company_id = q.company_id and s.quote_id = q.id order by s.sent_at desc limit 1) ls on true where q.company_id=$1 and q.id=$2",
    [ctx.companyId, id]
  )
  if (!row) throw new AppError("NOT_FOUND", "Quote not found.", 404)
  return row.data
}
export async function quoteForEnquiry(ctx: TenantContext, enquiryId: string) {
  const [row] = await ctx.read<{ data: Quote }>(
    "select data from fieldquote.quotes where company_id=$1 and enquiry_id=$2",
    [ctx.companyId, enquiryId]
  )
  if (!row) throw new AppError("NOT_FOUND", "Generated quote not found.", 404)
  return row.data
}
export function listEnquiries(ctx: TenantContext, unfinishedOnly: boolean) {
  return ctx.read<SavedEnquiry>(
    `select id, raw_text, state, created_at, failure_code from fieldquote.enquiries where company_id=$1 ${unfinishedOnly ? "and state <> 'completed'" : ""} order by created_at desc, id`,
    [ctx.companyId]
  )
}
export async function getEnquiryText(ctx: TenantContext, id: string) {
  const [row] = await ctx.read<{ raw_text: string }>(
    "select raw_text from fieldquote.enquiries where company_id=$1 and id=$2",
    [ctx.companyId, id]
  )
  if (!row) throw new AppError("NOT_FOUND", "Enquiry not found.", 404)
  return row.raw_text
}
export async function createEnquiry(ctx: TenantContext, rawText: string) {
  const [row] = await ownerQuery<{ id: string }>(
    "insert into fieldquote.enquiries(company_id, raw_text) values($1,$2) returning id",
    [ctx.companyId, rawText]
  )
  return row
}
export async function saveQuote(
  ctx: TenantContext,
  quote: Quote,
  expected: number | null = null
) {
  // lastSent is read from quote_sends each time and never stored in the quote.
  const stored: Quote = { ...quote }
  delete stored.lastSent
  const [row] = await ownerQuery<{ quote: Quote }>(
    "select fieldquote.save_quote($1,$2,$3,$4) as quote",
    [ctx.companyId, ctx.userId, JSON.stringify(stored), expected]
  )
  return row.quote
}
export async function rateExists(ctx: TenantContext, code: string) {
  const [row] = await ownerQuery<{ code: string }>(
    "select code from fieldquote.rates where company_id=$1 and code=$2",
    [ctx.companyId, code]
  )
  return !!row
}
export async function insertRate(ctx: TenantContext, rate: Rate) {
  const [row] = await ownerQuery<{ data: Rate }>(
    "insert into fieldquote.rates(company_id, code, data) values($1,$2,$3) returning data",
    [ctx.companyId, rate.code, JSON.stringify(rate)]
  )
  return row.data
}
export async function getRate(ctx: TenantContext, code: string) {
  const [row] = await ctx.read<{ data: Rate }>(
    "select data from fieldquote.rates where company_id=$1 and code=$2",
    [ctx.companyId, code]
  )
  if (!row) throw new AppError("NOT_FOUND", "Rate not found.", 404)
  return row.data
}
export async function updateRate(ctx: TenantContext, rate: Rate) {
  const [row] = await ownerQuery<{ data: Rate }>(
    "update fieldquote.rates set data=$3 where company_id=$1 and code=$2 returning data",
    [ctx.companyId, rate.code, JSON.stringify(rate)]
  )
  if (!row) throw new AppError("NOT_FOUND", "Rate not found.", 404)
  return row.data
}
export async function deleteRate(ctx: TenantContext, code: string) {
  const [row] = await ownerQuery<{ code: string }>(
    "delete from fieldquote.rates where company_id=$1 and code=$2 returning code",
    [ctx.companyId, code]
  )
  if (!row) throw new AppError("NOT_FOUND", "Rate not found.", 404)
}

export async function deleteQuote(
  ctx: TenantContext,
  id: string,
  expectedVersion: number
) {
  if (ctx.role !== "owner")
    throw new AppError("FORBIDDEN", "Only the owner can delete quotes.", 403)
  const client = await pool().connect()
  try {
    await client.query("begin")
    const { rows } = await client.query(
      "select version, enquiry_id from fieldquote.quotes where company_id=$1 and id=$2 for update",
      [ctx.companyId, id]
    )
    if (!rows.length) throw new AppError("NOT_FOUND", "Quote not found.", 404)
    if (rows[0].version !== expectedVersion)
      throw new AppError(
        "CONFLICT",
        "This quote has changed. Reload it before deleting.",
        409
      )
    await client.query(
      "delete from fieldquote.quotes where company_id=$1 and id=$2",
      [ctx.companyId, id]
    )
    await client.query(
      "delete from fieldquote.enquiries where company_id=$1 and id=$2",
      [ctx.companyId, rows[0].enquiry_id]
    )
    await client.query(
      "insert into fieldquote.audit_events(company_id,actor_id,entity_id,event) values($1,$2,$3,'quote_deleted')",
      [ctx.companyId, ctx.userId, id]
    )
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    mapDatabaseError(error)
  } finally {
    client.release()
  }
}
