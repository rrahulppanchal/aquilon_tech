import { z } from "zod"
import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import { getQuote, deleteQuote } from "@/features/quotes/server/repository"
import { update } from "@/features/quotes/server/service"
type Context = { params: Promise<{ quoteId: string }> }
export async function GET(_request: Request, context: Context) {
  return api(async () => {
    const ctx = await requireTenant()
    return getQuote(ctx, z.uuid().parse((await context.params).quoteId))
  })
}
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const ctx = await requireTenant()
    return update(
      ctx,
      z.uuid().parse((await context.params).quoteId),
      await body(request)
    )
  })
}

export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    const ctx = await requireTenant()
    const { expectedVersion } = z
      .object({ expectedVersion: z.number().int().positive() })
      .parse(await body(request))
    await deleteQuote(
      ctx,
      z.uuid().parse((await context.params).quoteId),
      expectedVersion
    )
    return { deleted: true }
  })
}
