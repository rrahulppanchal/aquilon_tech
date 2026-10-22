import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import { editRate, removeRate } from "@/features/rates/server/service"
type Context = { params: Promise<{ code: string }> }
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const input = await body(request)
    const { code } = await context.params
    return editRate(await requireTenant(), decodeURIComponent(code), input)
  })
}
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    await body(request)
    const { code } = await context.params
    return removeRate(await requireTenant(), decodeURIComponent(code))
  })
}
