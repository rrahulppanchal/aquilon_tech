import { z } from "zod"
import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import { approve } from "@/features/quotes/server/service"
export async function POST(
  request: Request,
  context: { params: Promise<{ quoteId: string }> }
) {
  return api(async () => {
    const ctx = await requireTenant()
    const input = z
      .object({ expectedVersion: z.number().int().positive() })
      .strict()
      .parse(await body(request))
    return approve(
      ctx,
      z.uuid().parse((await context.params).quoteId),
      input.expectedVersion
    )
  })
}
