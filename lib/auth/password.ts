import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
// Used by the app and the seed script, so it must not import "server-only".
const N = 16384,
  r = 8,
  p = 1,
  length = 64
function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, length, { N, r, p }, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  )
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt)
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`
}
// Compared against for unknown emails so response timing does not reveal accounts.
export const DUMMY_HASH = `scrypt$${N}$${r}$${p}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(length).toString("base64")}`
export async function verifyPassword(password: string, stored: string) {
  const [scheme, n, rr, pp, salt, hash] = stored.split("$")
  if (
    scheme !== "scrypt" ||
    Number(n) !== N ||
    Number(rr) !== r ||
    Number(pp) !== p ||
    !salt ||
    !hash
  )
    return false
  const expected = Buffer.from(hash, "base64")
  const actual = await derive(password, Buffer.from(salt, "base64"))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
