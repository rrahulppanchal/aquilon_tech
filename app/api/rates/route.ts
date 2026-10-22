import { api, body } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import { catalogue } from "@/features/quotes/server/repository"
import { createRate } from "@/features/rates/server/service"
export async function GET() {
  return api(async () => (await catalogue(await requireTenant())).rates)
}
export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request)
    return createRate(await requireTenant(), input)
  })
}
