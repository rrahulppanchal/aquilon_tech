import "server-only"
import { isConfigured } from "@/lib/env"
import { AppError } from "@/lib/http/errors"
import { tenantQuery } from "@/lib/db/pool"
import { sessionUserId } from "./session"
import type { Company, Role } from "@/features/quotes/types"
export async function requireTenant() {
  if (!isConfigured())
    throw new AppError(
      "NOT_CONFIGURED",
      "Sign-in isn’t set up on this server. Set DATABASE_URL and run the migration.",
      503
    )
  const userId = await sessionUserId()
  if (!userId) throw new AppError("UNAUTHENTICATED", "Please sign in.", 401)
  // Membership and company are read through the tenant role, so they come from
  // the verified session user, never from a caller-supplied company ID.
  const [membership] = await tenantQuery<{
    company_id: string
    role: Role
    display_name: string
    config: Company
  }>(
    userId,
    "select m.company_id, m.role, m.display_name, c.config from fieldquote.memberships m join fieldquote.companies c on c.id = m.company_id where m.user_id = $1",
    [userId]
  )
  if (!membership)
    throw new AppError(
      "NO_MEMBERSHIP",
      "Your account has not been assigned a workspace.",
      403
    )
  return {
    company: membership.config,
    companyId: membership.company_id,
    userId,
    name: membership.display_name,
    role: membership.role,
    // Tenant-scoped read: restricted role plus row-level security.
    read: <T>(sql: string, params: unknown[] = []) =>
      tenantQuery<T>(userId, sql, params),
  }
}
export type TenantContext = Awaited<ReturnType<typeof requireTenant>>
