import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import { catalogue } from "@/features/quotes/server/repository"
import { createCustomer } from "@/features/customers/server/service"
export async function GET() {
  return api(async () => (await catalogue(await requireTenant())).customers)
}
export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request)
    return createCustomer(await requireTenant(), input)
  })
}
