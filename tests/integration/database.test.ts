import { PGlite } from "@electric-sql/pglite"
import { readdirSync, readFileSync } from "node:fs"
import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { getSeed, sampleWorkspace } from "@/data/demo"
import {
  recalculate,
  approveQuote,
  editQuote,
} from "@/features/quotes/domain/pricing"
import type { Quote } from "@/features/quotes/types"
const a = getSeed(),
  b = getSeed(true)
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const enquiryA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  enquiryB = "ffffffff-ffff-4fff-8fff-ffffffffffff"
const quoteId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
let db: PGlite
let saved: Quote
async function asUser(user: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role fieldquote_tenant")
    await tx.query("select set_config('fieldquote.user_id',$1,true)", [user])
    return tx.query(sql, params)
  })
}
beforeAll(async () => {
  db = new PGlite()
  for (const file of readdirSync("db/migrations").sort())
    await db.exec(readFileSync(`db/migrations/${file}`, "utf8"))
  await db.exec("set search_path = fieldquote, public")
  for (const [seed, user] of [
    [a, userA],
    [b, userB],
  ] as const) {
    await db.query(
      "insert into users(id,email,password_hash) values($1,$2,'scrypt$x')",
      [user, `${user.slice(0, 4)}@example.com`]
    )
    await db.query("insert into companies values($1,$2)", [
      seed.company.id,
      seed.company,
    ])
    await db.query("insert into memberships values($1,$2,'owner','Owner')", [
      user,
      seed.company.id,
    ])
    for (const customer of seed.customers)
      await db.query("insert into customers values($1,$2,$3)", [
        seed.company.id,
        customer.id,
        customer,
      ])
    for (const rate of seed.rates)
      await db.query("insert into rates values($1,$2,$3)", [
        seed.company.id,
        rate.code,
        rate,
      ])
  }
  await db.query(
    "insert into enquiries(id,company_id,raw_text) values($1,$2,'Example enquiry A'),($3,$4,'Example enquiry B')",
    [enquiryA, a.company.id, enquiryB, b.company.id]
  )
  saved = { ...sampleWorkspace().quotes[0], id: quoteId, enquiryId: enquiryA }
  await db.query("select save_quote($1,$2,$3,null)", [
    a.company.id,
    userA,
    saved,
  ])
  await db.query(
    "insert into company_ai_credentials(company_id,provider,model,ciphertext,nonce,tag,suffix) values($1,'openai','gpt-5','cipher','nonce','tag','1234')",
    [a.company.id]
  )
}, 30000)
afterAll(async () => {
  await db?.close()
})
describe("real Postgres schema and RLS (embedded runtime)", () => {
  it("only known AI providers can be stored", async () => {
    await expect(
      db.query(
        "update company_ai_credentials set provider='mystery' where company_id=$1",
        [a.company.id]
      )
    ).rejects.toThrow(/provider_check/)
  })
  it("tenant role cannot read users, sessions or login records", async () => {
    for (const table of ["users", "sessions", "login_failures"])
      await expect(asUser(userA, `select * from ${table}`)).rejects.toThrow(
        /permission denied/
      )
  })
  it("RLS applies even when a query has no company filter", async () => {
    const result = await asUser(userB, "select company_id from quotes")
    expect(result.rows).toHaveLength(0)
  })
  it("no tenant data is visible without a session user", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.exec("set local role fieldquote_tenant")
      return tx.query("select * from rates")
    })
    expect(result.rows).toHaveLength(0)
  })
  it("company A only reads its own rates", async () => {
    const result = await asUser(userA, "select company_id from rates")
    expect(result.rows.length).toBe(a.rates.length)
    expect(
      result.rows.every(
        (row) => (row as { company_id: string }).company_id === a.company.id
      )
    ).toBe(true)
  })
  it("company B cannot read a known company A quote UUID", async () => {
    expect(
      (await asUser(userB, "select * from quotes where id=$1", [quoteId])).rows
    ).toHaveLength(0)
  })
  it("company B sees only its customer", async () => {
    expect((await asUser(userB, "select * from customers")).rows).toHaveLength(
      1
    )
  })
  it("company B cannot see company A enquiries", async () => {
    expect(
      (await asUser(userB, "select * from enquiries where id=$1", [enquiryA]))
        .rows
    ).toHaveLength(0)
  })
  it("credentials are unreadable even by their owner via the tenant role", async () => {
    await expect(
      asUser(userA, "select * from company_ai_credentials")
    ).rejects.toThrow(/permission denied/)
  })
  it("direct client quote edits are denied", async () => {
    await expect(
      asUser(
        userA,
        "update quotes set data=jsonb_set(data,'{status}','\"approved\"') where id=$1",
        [quoteId]
      )
    ).rejects.toThrow(/permission denied/)
  })
  it("client cannot call server-only approval function", async () => {
    await expect(
      asUser(userA, "select save_quote($1,$2,$3,1)", [
        a.company.id,
        userA,
        saved,
      ])
    ).rejects.toThrow(/permission denied/)
  })
  it("membership cannot be changed by client", async () => {
    await expect(
      asUser(userA, "update memberships set company_id=$1 where user_id=$2", [
        b.company.id,
        userA,
      ])
    ).rejects.toThrow(/permission denied/)
  })
  it("server RPC rejects mismatched actor/company", async () => {
    await expect(
      db.query("select save_quote($1,$2,$3,1)", [a.company.id, userB, saved])
    ).rejects.toThrow(/FORBIDDEN/)
  })
  it("composite FK rejects cross-tenant customer reference", async () => {
    const bad = {
      ...saved,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      enquiryId: enquiryB,
      customerId: a.customers[0].id,
    }
    await expect(
      db.query("select save_quote($1,$2,$3,null)", [b.company.id, userB, bad])
    ).rejects.toThrow(/foreign key/)
  })
  it("generation claim cannot cross tenants", async () => {
    await expect(
      db.query("select claim_generation($1,$2,$3)", [
        b.company.id,
        userB,
        enquiryA,
      ])
    ).rejects.toThrow(/NOT_FOUND/)
  })
  it("approval rejects unresolved items even through server RPC", async () => {
    const forged = {
      ...saved,
      version: 2,
      status: "approved",
      totalPence: 100,
      approvedAt: new Date().toISOString(),
      approvedBy: "Dave",
    }
    await expect(
      db.query("select save_quote($1,$2,$3,1)", [a.company.id, userA, forged])
    ).rejects.toThrow(/UNRESOLVED/)
  })
  it("saves reviewed edits, atomically approves, and rejects stale writers", async () => {
    const draft = structuredClone(saved)
    draft.lines.forEach((l) => {
      if (l.ratePence === null) {
        l.excluded = true
        l.note = "Explicitly excluded by customer."
      }
    })
    draft.issues.forEach(
      (i) => (i.resolution = "Confirmed on site with customer.")
    )
    draft.version = 2
    const resolved = recalculate(draft, a.company)
    await db.query("select save_quote($1,$2,$3,1)", [
      a.company.id,
      userA,
      resolved,
    ])
    const approved = approveQuote(resolved, a.company, "Dave")
    await db.query("select save_quote($1,$2,$3,2)", [
      a.company.id,
      userA,
      approved,
    ])
    await expect(
      db.query("select save_quote($1,$2,$3,2)", [a.company.id, userA, approved])
    ).rejects.toThrow(/CONFLICT/)
    const read = await asUser(userA, "select data from quotes where id=$1", [
      quoteId,
    ])
    expect((read.rows[0] as { data: Quote }).data.status).toBe("approved")
    const changed = editQuote(
      approved,
      {
        expectedVersion: approved.version,
        lines: approved.lines.map(
          ({ id, quantity, ratePence, excluded, note }) => ({
            id,
            quantity,
            ratePence,
            excluded,
            note,
          })
        ),
        resolutions: approved.issues.map(({ id, resolution }) => ({
          id,
          resolution,
        })),
      },
      a.company,
      "owner"
    )
    await db.query("select save_quote($1,$2,$3,3)", [
      a.company.id,
      userA,
      changed,
    ])
    const readAgain = await asUser(
      userA,
      "select data from quotes where id=$1",
      [quoteId]
    )
    expect((readAgain.rows[0] as { data: Quote }).data.approvedAt).toBeNull()
  })
})
