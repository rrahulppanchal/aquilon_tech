import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import {
  mailStatus,
  removeMailAccount,
  saveMailAccount,
} from "@/features/mail/server/service"
export const runtime = "nodejs"
export const maxDuration = 60
export async function GET() {
  return api(async () => mailStatus(await requireTenant()))
}
// Tests the reading and sending servers, then saves the account.
export async function PUT(request: Request) {
  return api(async () => {
    const input = await body(request)
    return saveMailAccount(await requireTenant(), input)
  })
}
export async function DELETE(request: Request) {
  return api(async () => {
    await body(request)
    return removeMailAccount(await requireTenant())
  })
}
