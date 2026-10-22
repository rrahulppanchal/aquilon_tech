import { z } from "zod"
import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import { sendQuote } from "@/features/mail/server/service"
export const runtime = "nodejs"
export const maxDuration = 60
export async function POST(
  request: Request,
  context: { params: Promise<{ quoteId: string }> }
) {
  return api(async () => {
    const input = await body(request)
    return sendQuote(
      await requireTenant(),
      z.uuid().parse((await context.params).quoteId),
      input
    )
  })
}
