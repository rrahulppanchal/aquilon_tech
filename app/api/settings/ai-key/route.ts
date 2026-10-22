import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import {
  aiStatus,
  removeKey,
  saveKey,
  setModel,
} from "@/features/settings/server/ai-settings"
export const runtime = "nodejs"
export async function GET() {
  return api(async () => aiStatus(await requireTenant()))
}
// Save or replace the company's key (checked against the provider first).
export async function PUT(request: Request) {
  return api(async () => {
    const input = await body(request)
    return saveKey(await requireTenant(), input)
  })
}
// Change the model used for drafts.
export async function PATCH(request: Request) {
  return api(async () => {
    const input = await body(request)
    return setModel(await requireTenant(), input)
  })
}
export async function DELETE(request: Request) {
  return api(async () => {
    await body(request)
    return removeKey(await requireTenant())
  })
}
