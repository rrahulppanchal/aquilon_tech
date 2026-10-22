import { beforeEach, describe, expect, it } from "vitest"
import { encryptKey, decryptKey } from "@/lib/security/encryption"
import { body } from "@/lib/http/errors"
import { editSchema } from "@/features/quotes/server/service"
beforeEach(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
  process.env.APP_URL = "http://localhost:3000"
})
describe("credential encryption", () => {
  it("uses different nonces and recovers the key", () => {
    const a = encryptKey("sk-ant-private", "company-a"),
      b = encryptKey("sk-ant-private", "company-a")
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.ciphertext).not.toContain("sk-ant")
    expect(decryptKey(a, "company-a")).toBe("sk-ant-private")
  })
  it("cannot decrypt a key relabelled as another provider", () =>
    expect(() =>
      decryptKey(encryptKey("sk-secret", "a", "openai"), "a", "anthropic")
    ).toThrow())
  it("cannot decrypt for another tenant", () =>
    expect(() => decryptKey(encryptKey("secret", "a"), "b")).toThrow())
  it("rejects tampered ciphertext", () => {
    const row = encryptKey("secret", "a")
    row.tag = Buffer.alloc(16).toString("base64")
    expect(() => decryptKey(row, "a")).toThrow()
  })
  it("refuses an invalid master key", () => {
    process.env.ENCRYPTION_KEY = "invalid"
    expect(() => encryptKey("secret", "a")).toThrow()
  })
})
describe("HTTP boundary", () => {
  it("rejects cross-origin writes", async () => {
    await expect(
      body(
        new Request("http://localhost:3000/api/quotes", {
          method: "POST",
          headers: {
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: "{}",
        })
      )
    ).rejects.toThrow(/another website/)
  })
  it("accepts same-origin JSON", async () => {
    expect(
      await body(
        new Request("http://localhost:3000/api/quotes", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          body: '{"ok":true}',
        })
      )
    ).toEqual({ ok: true })
  })
  it("bounds request body", async () => {
    await expect(
      body(
        new Request("http://localhost:3000/api/quotes", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          body: JSON.stringify({ large: "x".repeat(100001) }),
        })
      )
    ).rejects.toThrow(/too much/)
  })
  it("rejects approval and tenant fields in ordinary edits", () =>
    expect(
      editSchema.safeParse({
        expectedVersion: 1,
        lines: [],
        resolutions: [],
        status: "approved",
        companyId: "b",
      }).success
    ).toBe(false))
})
describe("password hashing", () => {
  it("verifies the right password, rejects others, and salts each hash", async () => {
    const { hashPassword, verifyPassword, DUMMY_HASH } = await import(
      "@/lib/auth/password"
    )
    const a = await hashPassword("correct horse battery")
    const b = await hashPassword("correct horse battery")
    expect(a).not.toBe(b)
    expect(a).not.toContain("correct")
    expect(await verifyPassword("correct horse battery", a)).toBe(true)
    expect(await verifyPassword("wrong password here", a)).toBe(false)
    expect(await verifyPassword("anything at all", DUMMY_HASH)).toBe(false)
    expect(await verifyPassword("x", "md5$abc")).toBe(false)
  })
})

describe("database timestamps", () => {
  it("parses Postgres timestamptz text to ISO, idempotently", async () => {
    const { isoTimestamp } = await import("@/lib/db/pool")
    expect(isoTimestamp("2026-10-22 11:28:52.123456+00")).toBe(
      "2026-10-22T11:28:52.123Z"
    )
    expect(isoTimestamp("2026-10-22 16:58:52+05:30")).toBe(
      "2026-10-22T11:28:52.000Z"
    )
    const once = isoTimestamp("2026-10-22 11:28:52+00")
    expect(isoTimestamp(once)).toBe(once)
  })
})
