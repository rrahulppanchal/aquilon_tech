import { z } from "zod"
import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import { priceAfterVisit } from "@/features/quotes/server/service"
// Turns a site-visit quote into a normal draft once the owner has seen the job.
export async function POST(
  request: Request,
  context: { params: Promise<{ quoteId: string }> }
) {
  return api(async () => {
    const input = await body(request)
    const ctx = await requireTenant()
    return priceAfterVisit(
      ctx,
      z.uuid().parse((await context.params).quoteId),
      input
    )
  })
}
