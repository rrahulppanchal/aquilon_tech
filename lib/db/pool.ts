import "server-only"
import pg from "pg"
import { poolConfig } from "./config"
import { AppError } from "@/lib/http/errors"
const globalPool = globalThis as unknown as { fieldquotePool?: pg.Pool }
// Return timestamps as ISO strings so rows serialize the same way everywhere.
// Parsed directly rather than by wrapping pg's parser: hot reloads re-run this
// module, and wrapping a previous wrapper breaks.
export function isoTimestamp(value: string) {
  const m = value.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2})(?::?(\d{2}))?$/
  )
  if (!m) return value
  const fraction = (m[3] || ".000").slice(0, 4).padEnd(4, "0")
  return new Date(
    `${m[1]}T${m[2]}${fraction}${m[4]}:${m[5] || "00"}`
  ).toISOString()
}
pg.types.setTypeParser(1184, isoTimestamp)
export function pool() {
  if (!globalPool.fieldquotePool) {
    globalPool.fieldquotePool = new pg.Pool(poolConfig())
    // An idle connection dropped by the server must not crash the process.
    globalPool.fieldquotePool.on("error", (error) =>
      console.error("Idle database connection closed", error.message)
    )
  }
  return globalPool.fieldquotePool
}
export function mapDatabaseError(error: unknown): never {
  if (error instanceof AppError) throw error
  const message = error instanceof Error ? error.message : ""
  const code = (error as { code?: string })?.code
  if (/CONFLICT|BUSY/.test(message) || code === "23505")
    throw new AppError(
      "CONFLICT",
      "Someone else changed this at the same time, or it’s still being worked on. Reload the page and try again.",
      409
    )
  if (/RATE_LIMIT/.test(message))
    throw new AppError(
      "RATE_LIMIT",
      "You’ve drafted 10 quotes in the last 10 minutes. Wait a few minutes, then try again.",
      429
    )
  if (/NOT_FOUND/.test(message))
    throw new AppError(
      "NOT_FOUND",
      "We couldn’t find that. It may have been deleted.",
      404
    )
  if (/FORBIDDEN/.test(message))
    throw new AppError(
      "FORBIDDEN",
      "You don’t have permission to change this.",
      403
    )
  if (/UNRESOLVED|INVALID_STATE/.test(message))
    throw new AppError(
      "INVALID_STATE",
      "This quote can’t be saved as it is. Check every item has a price or is left out, and every check is filled in.",
      422
    )
  // Postgres codes and messages name the failing object, never row values or credentials.
  console.error("Database error", code || "no-code", message.slice(0, 200))
  throw new AppError(
    "DATABASE",
    "Your work couldn’t be saved just now. Try again in a moment.",
    500
  )
}
// Server-only privileged access: writes, sessions and encrypted credentials.
// Callers must already have resolved the tenant and filter by company_id.
export async function ownerQuery<T>(sql: string, params: unknown[] = []) {
  try {
    return (await pool().query(sql, params)).rows as T[]
  } catch (error) {
    mapDatabaseError(error)
  }
}
// Tenant reads run as the restricted role, so row-level security applies even
// if a query forgets its company filter.
export async function tenantQuery<T>(
  userId: string,
  sql: string,
  params: unknown[] = []
) {
  const client = await pool().connect()
  try {
    await client.query("begin read only")
    await client.query("set local role fieldquote_tenant")
    await client.query("select set_config('fieldquote.user_id', $1, true)", [
      userId,
    ])
    const rows = (await client.query(sql, params)).rows as T[]
    await client.query("commit")
    return rows
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    mapDatabaseError(error)
  } finally {
    client.release()
  }
}
