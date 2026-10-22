import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { requiredEnv } from "@/lib/env"
function masterKey() {
  const key = Buffer.from(requiredEnv("ENCRYPTION_KEY"), "base64")
  if (key.length !== 32)
    throw new Error("ENCRYPTION_KEY must be 32 bytes encoded as base64")
  return key
}
// The company and provider are bound in as authenticated data, so a ciphertext
// copied to another company or relabelled as another provider fails to decrypt.
const context = (companyId: string, provider: string) =>
  Buffer.from(`${companyId}:${provider}:v1`)
export function encryptKey(
  value: string,
  companyId: string,
  provider = "anthropic"
) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", masterKey(), nonce)
  cipher.setAAD(context(companyId, provider))
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    suffix: value.slice(-4),
    key_version: 1,
  }
}
export function decryptKey(
  record: { ciphertext: string; nonce: string; tag: string },
  companyId: string,
  provider = "anthropic"
) {
  const cipher = createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(record.nonce, "base64")
  )
  cipher.setAAD(context(companyId, provider))
  cipher.setAuthTag(Buffer.from(record.tag, "base64"))
  return Buffer.concat([
    cipher.update(Buffer.from(record.ciphertext, "base64")),
    cipher.final(),
  ]).toString("utf8")
}
