import { z } from "zod"
import { api } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import { listInbox } from "@/features/mail/server/service"
export const runtime = "nodejs"
export const maxDuration = 60
// Newest emails first; pass ?before=<next> from the previous page for older ones.
export async function GET(request: Request) {
  return api(async () => {
    const raw = new URL(request.url).searchParams.get("before")
    const before = raw ? z.coerce.number().int().min(2).parse(raw) : undefined
    return listInbox(await requireTenant(), before)
  })
}
