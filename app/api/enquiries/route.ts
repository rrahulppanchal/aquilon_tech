import { z } from "zod"
import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import {
  createEnquiry,
  listEnquiries,
} from "@/features/quotes/server/repository"
export async function GET() {
  return api(async () => listEnquiries(await requireTenant(), false))
}
export async function POST(request: Request) {
  return api(async () => {
    const ctx = await requireTenant()
    const input = z
      .object({
        rawText: z
          .string()
          .trim()
          .min(10, "That’s too short to work from. Paste the whole email.")
          .max(20000, "That’s too long. Paste just the one email."),
      })
      .strict()
      .parse(await body(request))
    return createEnquiry(ctx, input.rawText)
  })
}
