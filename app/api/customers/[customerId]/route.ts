import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import {
  editCustomer,
  removeCustomer,
} from "@/features/customers/server/service"
type Context = { params: Promise<{ customerId: string }> }
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const input = await body(request)
    const { customerId } = await context.params
    return editCustomer(await requireTenant(), customerId, input)
  })
}
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    await body(request)
    const { customerId } = await context.params
    return removeCustomer(await requireTenant(), customerId)
  })
}
