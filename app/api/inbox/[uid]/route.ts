import { z } from "zod"
import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import {
  enquiryFromMessage,
  previewMessage,
} from "@/features/mail/server/service"
export const runtime = "nodejs"
export const maxDuration = 60
type Context = { params: Promise<{ uid: string }> }
const uid = z.coerce.number().int().positive()
export async function GET(_request: Request, context: Context) {
  return api(async () =>
    previewMessage(await requireTenant(), uid.parse((await context.params).uid))
  )
}
// Saves the email as an enquiry; drafting then uses the usual generate route.
export async function POST(request: Request, context: Context) {
  return api(async () => {
    await body(request)
    return enquiryFromMessage(
      await requireTenant(),
      uid.parse((await context.params).uid)
    )
  })
}
