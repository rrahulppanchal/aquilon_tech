import "server-only"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { AppError } from "@/lib/http/errors"
// The server connects to whatever mail host a user types, so refuse anything
// that resolves to a private, loopback or link-local address. That stops the
// settings form being used to reach machines inside the hosting network.
const privateRanges = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^(22[4-9]|23\d|24\d|25[0-5])\./,
  /^::1$/,
  /^::$/,
  /^f[cd]/i,
  /^fe80:/i,
  /^::ffff:(10|127|192\.168|169\.254)\./i,
]
export function allowPrivateMailHosts() {
  // Only for local development and tests against a mail server on this machine.
  return (
    process.env.MAIL_ALLOW_PRIVATE_HOSTS === "true" &&
    process.env.NODE_ENV !== "production"
  )
}
// Returns the checked address to connect to, so a second DNS lookup can't
// swap in a different (private) address after the check.
export async function resolveMailHost(host: string): Promise<string> {
  if (
    !/^[a-z0-9.-]{1,253}$/i.test(host) ||
    host.startsWith(".") ||
    host.endsWith(".")
  )
    throw new AppError("MAIL_HOST", `“${host}” isn’t a valid server name.`, 422)
  if (allowPrivateMailHosts()) return host
  let addresses: string[]
  try {
    addresses = isIP(host)
      ? [host]
      : (await lookup(host, { all: true })).map((a) => a.address)
  } catch {
    throw new AppError(
      "MAIL_HOST",
      `Couldn’t find the server “${host}”. Check the spelling.`,
      422
    )
  }
  if (
    !addresses.length ||
    addresses.some((a) => privateRanges.some((r) => r.test(a)))
  )
    throw new AppError(
      "MAIL_HOST",
      `“${host}” points to a private network address, which isn’t allowed. Use your provider’s public mail server.`,
      422
    )
  return addresses[0]
}
