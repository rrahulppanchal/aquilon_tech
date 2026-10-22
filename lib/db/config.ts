import type { PoolConfig } from "pg"
// Shared by the app and the CLI scripts, so it must not import "server-only".
export function poolConfig(url = process.env.DATABASE_URL): PoolConfig {
  if (!url) throw new Error("Server configuration missing: DATABASE_URL")
  const parsed = new URL(url)
  const mode = parsed.searchParams.get("sslmode")
  // pg treats sslmode=require as full verification; manage TLS explicitly instead.
  parsed.searchParams.delete("sslmode")
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n")
  return {
    connectionString: parsed.toString(),
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    ssl:
      mode === "disable" || (local && !mode)
        ? false
        : ca
          ? { ca, rejectUnauthorized: true }
          : // Without the provider CA the channel is encrypted but the server
            // certificate is not verified. Set DATABASE_CA_CERT in production.
            { rejectUnauthorized: false },
  }
}
