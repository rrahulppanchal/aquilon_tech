import pg from "pg"
import { getSeed } from "../data/demo"
import { poolConfig } from "../lib/db/config"
import { hashPassword } from "../lib/auth/password"
const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. Run with --env-file=.env.local`)
  return value
}
const accounts = [
  {
    prefix: "HOLLIS",
    second: false,
    role: "owner",
    name: "Dave Hollis",
  },
  {
    prefix: "GREENFIELD",
    second: true,
    role: "owner",
    name: "Gaz Morgan",
  },
  // Optional third login demonstrates approver restrictions inside Hollis.
  { prefix: "SHAZ", second: false, role: "approver", name: "Shaz" },
] as const
const demoEmails = accounts
  .map((a) => process.env[`${a.prefix}_DEMO_EMAIL`])
  .filter(Boolean)
  .map((email) => email!.trim().toLowerCase())
if (new Set(demoEmails).size !== demoEmails.length)
  throw new Error("Use a distinct email address for every demo account.")
const client = new pg.Client(poolConfig())
await client.connect()
try {
  await client.query("begin")
  for (const second of [false, true]) {
    const { company, rates, customers } = getSeed(second)
    await client.query(
      "insert into fieldquote.companies(id,config) values($1,$2) on conflict(id) do update set config=excluded.config",
      [company.id, company]
    )
    // Rates are seeded once per company; after that the owner manages them in
    // the app, so re-running the seed never restores or overwrites a rate.
    const seeded = await client.query(
      "select 1 from fieldquote.rates where company_id=$1 limit 1",
      [company.id]
    )
    if (!seeded.rowCount)
      for (const rate of rates)
        await client.query(
          "insert into fieldquote.rates(company_id,code,data) values($1,$2,$3) on conflict(company_id,code) do nothing",
          [company.id, rate.code, rate]
        )
    for (const customer of customers)
      await client.query(
        "insert into fieldquote.customers(company_id,id,data) values($1,$2,$3) on conflict(company_id,id) do nothing",
        [company.id, customer.id, customer]
      )
    console.log(
      `Seeded ${company.name}: ${rates.length} rates, ${customers.length} customers.`
    )
  }
  for (const account of accounts) {
    const optional = account.prefix === "SHAZ"
    const email = process.env[`${account.prefix}_DEMO_EMAIL`]
      ?.trim()
      .toLowerCase()
    const password = process.env[`${account.prefix}_DEMO_PASSWORD`]
    if (optional && (!email || !password)) continue
    if (!email) required(`${account.prefix}_DEMO_EMAIL`)
    if (!password) required(`${account.prefix}_DEMO_PASSWORD`)
    if (password!.length < 12)
      throw new Error("Demo passwords must have at least 12 characters.")
    const companyId = getSeed(account.second).company.id
    // Existing users keep their password; seeding never resets credentials.
    const existing = await client.query(
      "select u.id, m.company_id from fieldquote.users u left join fieldquote.memberships m on m.user_id=u.id where u.email=$1",
      [email]
    )
    let userId = existing.rows[0]?.id as string | undefined
    if (
      existing.rows[0]?.company_id &&
      existing.rows[0].company_id !== companyId
    )
      throw new Error(
        `${email} belongs to a different company. Use distinct demo accounts; seeding will not move a user.`
      )
    if (!userId)
      userId = (
        await client.query(
          "insert into fieldquote.users(email,password_hash) values($1,$2) returning id",
          [email, await hashPassword(password!)]
        )
      ).rows[0].id
    await client.query(
      "insert into fieldquote.memberships(user_id,company_id,role,display_name) values($1,$2,$3,$4) on conflict(user_id) do update set role=excluded.role, display_name=excluded.display_name",
      [userId, companyId, account.role, account.name]
    )
    console.log(`Login ready: ${account.name} (${account.role}).`)
  }
  await client.query("commit")
} catch (error) {
  await client.query("rollback")
  throw error
} finally {
  await client.end()
}
