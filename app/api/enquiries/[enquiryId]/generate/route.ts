import { z } from "zod"
import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import { generate } from "@/features/quotes/server/service"
export const runtime = "nodejs"
export const maxDuration = 120
export async function POST(
  request: Request,
  context: { params: Promise<{ enquiryId: string }> }
) {
  return api(async () => {
    await body(request)
    const ctx = await requireTenant()
    const { enquiryId } = await context.params
    return generate(ctx, z.uuid().parse(enquiryId))
  })
}
