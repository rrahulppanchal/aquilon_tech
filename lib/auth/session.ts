import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { ownerQuery } from "@/lib/db/pool"
import { AppError } from "@/lib/http/errors"
import { DUMMY_HASH, verifyPassword } from "./password"
const COOKIE = "fq_session"
const LIFETIME_SECONDS = 12 * 60 * 60
// Only a hash of the session token is stored, so a database read cannot be replayed as a login.
const digest = (token: string) =>
  createHash("sha256").update(token).digest("base64url")
export async function signIn(email: string, password: string) {
  const normalized = email.trim().toLowerCase()
  const [{ failures }] = await ownerQuery<{ failures: number }>(
    "select count(*)::int as failures from fieldquote.login_failures where email=$1 and created_at > now() - interval '15 minutes'",
    [normalized]
  )
  if (failures >= 5)
    throw new AppError(
      "LOGIN_LIMIT",
      "Too many attempts. Wait 15 minutes and try again.",
      429
    )
  const [user] = await ownerQuery<{ id: string; password_hash: string }>(
    "select id, password_hash from fieldquote.users where email=$1",
    [normalized]
  )
  const valid = await verifyPassword(
    password,
    user?.password_hash || DUMMY_HASH
  )
  if (!user || !valid) {
    await ownerQuery(
      "insert into fieldquote.login_failures(email) values($1)",
      [normalized]
    )
    throw new AppError(
      "LOGIN",
      "Unable to sign in. Check your email and password.",
      401
    )
  }
  const token = randomBytes(32).toString("base64url")
  await ownerQuery(
    "delete from fieldquote.sessions where user_id=$1 and expires_at < now()",
    [user.id]
  )
  await ownerQuery(
    "insert into fieldquote.sessions(token_hash,user_id,expires_at) values($1,$2,now() + make_interval(secs => $3))",
    [digest(token), user.id, LIFETIME_SECONDS]
  )
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LIFETIME_SECONDS,
  })
}
export async function signOut() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token)
    await ownerQuery("delete from fieldquote.sessions where token_hash=$1", [
      digest(token),
    ])
  jar.delete(COOKIE)
}
export async function sessionUserId() {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token || token.length > 100) return null
  const [session] = await ownerQuery<{ user_id: string }>(
    "select user_id from fieldquote.sessions where token_hash=$1 and expires_at > now()",
    [digest(token)]
  )
  return session?.user_id || null
}
