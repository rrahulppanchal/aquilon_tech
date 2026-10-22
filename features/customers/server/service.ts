import "server-only"
import type { TenantContext } from "@/lib/auth/tenant-context"
import { ownerQuery } from "@/lib/db/pool"
import { AppError } from "@/lib/http/errors"
import type { Customer } from "@/features/quotes/types"
import { customerFields, type CustomerFields } from "../domain/rules"
// Enquiries are matched to customers by email first, so two records sharing
// an address would make matching ambiguous. Anyone in the company can keep
// the customer list up to date; writes go through the owner connection
// because the tenant role is read-only.
async function audit(ctx: TenantContext, event: string, id: string) {
  await ownerQuery(
    "insert into fieldquote.audit_events(company_id,actor_id,entity_id,event) values($1,$2,$3,$4)",
    [ctx.companyId, ctx.userId, `customer:${id}`, event]
  )
}
async function getCustomer(ctx: TenantContext, id: string) {
  const [row] = await ctx.read<{ data: Customer }>(
    "select data from fieldquote.customers where company_id=$1 and id=$2",
    [ctx.companyId, id]
  )
  if (!row) throw new AppError("NOT_FOUND", "Customer not found.", 404)
  return row.data
}
async function rejectSharedEmails(
  ctx: TenantContext,
  fields: CustomerFields,
  exceptId?: string
) {
  if (!fields.emails.length) return
  const [row] = await ctx.read<{ name: string; email: string }>(
    `select c.data->>'name' as name, e.email
       from fieldquote.customers c,
            jsonb_array_elements_text(c.data->'emails') e(email)
      where c.company_id=$1 and c.id is distinct from $2 and lower(e.email) = any($3)
      limit 1`,
    [ctx.companyId, exceptId ?? null, fields.emails]
  )
  if (row)
    throw new AppError(
      "DUPLICATE",
      `${row.email} already belongs to ${row.name}. Edit that customer instead, or use another email.`,
      409
    )
}
// The first email is where quotes go unless a separate invoice email is set.
function toCustomer(id: string, fields: CustomerFields): Customer {
  return {
    id,
    ...fields,
    invoiceEmail: fields.invoiceEmail || fields.emails[0] || "",
  }
}
export async function createCustomer(ctx: TenantContext, input: unknown) {
  const fields = customerFields.parse(input)
  await rejectSharedEmails(ctx, fields)
  const customer = toCustomer(`customer-${crypto.randomUUID()}`, fields)
  const [row] = await ownerQuery<{ data: Customer }>(
    "insert into fieldquote.customers(company_id,id,data) values($1,$2,$3) returning data",
    [ctx.companyId, customer.id, JSON.stringify(customer)]
  )
  await audit(ctx, "customer_created", customer.id)
  return row.data
}
export async function editCustomer(
  ctx: TenantContext,
  id: string,
  input: unknown
) {
  const fields = customerFields.parse(input)
  const previous = await getCustomer(ctx, id)
  await rejectSharedEmails(ctx, fields, previous.id)
  const [row] = await ownerQuery<{ data: Customer }>(
    "update fieldquote.customers set data=$3 where company_id=$1 and id=$2 returning data",
    [
      ctx.companyId,
      previous.id,
      JSON.stringify(toCustomer(previous.id, fields)),
    ]
  )
  if (!row) throw new AppError("NOT_FOUND", "Customer not found.", 404)
  await audit(ctx, "customer_updated", previous.id)
  return row.data
}
// Quotes point at their customer, so a customer with quotes stays on file.
export async function removeCustomer(ctx: TenantContext, id: string) {
  const customer = await getCustomer(ctx, id)
  const [{ count }] = await ctx.read<{ count: string }>(
    "select count(*) from fieldquote.quotes where company_id=$1 and customer_id=$2",
    [ctx.companyId, customer.id]
  )
  if (Number(count) > 0)
    throw new AppError(
      "IN_USE",
      `${customer.name} has ${count === "1" ? "a quote" : `${count} quotes`}, so they can’t be deleted. Delete the quotes first, or edit the customer instead.`,
      409
    )
  await ownerQuery(
    "delete from fieldquote.customers where company_id=$1 and id=$2",
    [ctx.companyId, customer.id]
  )
  await audit(ctx, "customer_deleted", customer.id)
  return { id: customer.id }
}
