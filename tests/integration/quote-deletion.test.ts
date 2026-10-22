import { PGlite } from "@electric-sql/pglite"
import { readdirSync, readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest"
import { getSeed, sampleWorkspace } from "@/data/demo"
import type { TenantContext } from "@/lib/auth/tenant-context"
import { deleteQuote } from "@/features/quotes/server/repository"

let db: PGlite
vi.mock("@/lib/db/pool", async (original) => ({
  ...(await original<typeof import("@/lib/db/pool")>()),
  pool: () => ({
    connect: async () => ({
      query: (sql: string, params?: unknown[]) => db.query(sql, params),
      release() {},
    }),
  }),
}))
const seed = getSeed()
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const enquiryId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const quoteId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const ctx = {
  companyId: seed.company.id,
  userId,
  role: "owner",
} as TenantContext
beforeAll(async () => {
  db = new PGlite()
  for (const file of readdirSync("db/migrations").sort())
    await db.exec(readFileSync(`db/migrations/${file}`, "utf8"))
  await db.query(
    "insert into fieldquote.users(id,email,password_hash) values($1,'owner@example.com','x')",
    [userId]
  )
  await db.query("insert into fieldquote.companies values($1,$2)", [
    seed.company.id,
    seed.company,
  ])
  await db.query(
    "insert into fieldquote.memberships values($1,$2,'owner','Owner')",
    [userId, seed.company.id]
  )
}, 30000)
beforeEach(async () => {
  await db.exec(
    "delete from fieldquote.quotes; delete from fieldquote.enquiries; delete from fieldquote.audit_events"
  )
  await db.query(
    "insert into fieldquote.enquiries(id,company_id,raw_text) values($1,$2,'Test enquiry for deletion')",
    [enquiryId, seed.company.id]
  )
  const quote = {
    ...sampleWorkspace().quotes[0],
    id: quoteId,
    enquiryId,
    customerId: null,
  }
  await db.query("select fieldquote.save_quote($1,$2,$3,null)", [
    seed.company.id,
    userId,
    quote,
  ])
  await db.query(
    "insert into fieldquote.quote_sends(company_id,quote_id,version,to_email,sent_by) values($1,$2,1,'customer@example.com',$3)",
    [seed.company.id, quoteId, userId]
  )
})
afterAll(async () => {
  await db?.close()
})
it("deletes the quote, saved enquiry and sending history, retaining an audit event", async () => {
  await deleteQuote(ctx, quoteId, 1)
  for (const table of ["quotes", "enquiries", "quote_sends"])
    expect(
      (await db.query(`select * from fieldquote.${table}`)).rows
    ).toHaveLength(0)
  expect(
    (
      await db.query(
        "select * from fieldquote.audit_events where event='quote_deleted' and entity_id=$1",
        [quoteId]
      )
    ).rows
  ).toHaveLength(1)
})
it("rejects non-owners, another tenant and stale versions without deleting data", async () => {
  await expect(
    deleteQuote({ ...ctx, role: "approver" }, quoteId, 1)
  ).rejects.toMatchObject({ status: 403 })
  await expect(
    deleteQuote({ ...ctx, companyId: getSeed(true).company.id }, quoteId, 1)
  ).rejects.toMatchObject({ status: 404 })
  await expect(deleteQuote(ctx, quoteId, 2)).rejects.toMatchObject({
    status: 409,
  })
  expect((await db.query("select * from fieldquote.quotes")).rows).toHaveLength(
    1
  )
  expect(
    (await db.query("select * from fieldquote.quote_sends")).rows
  ).toHaveLength(1)
})
it("rolls back deletion if the audit write fails", async () => {
  await expect(
    deleteQuote(
      { ...ctx, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      quoteId,
      1
    )
  ).rejects.toMatchObject({ status: 500 })
  expect((await db.query("select * from fieldquote.quotes")).rows).toHaveLength(
    1
  )
  expect(
    (await db.query("select * from fieldquote.enquiries")).rows
  ).toHaveLength(1)
  expect(
    (await db.query("select * from fieldquote.quote_sends")).rows
  ).toHaveLength(1)
})
