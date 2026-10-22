import pg from "pg"
import { readdirSync, readFileSync } from "node:fs"
import { poolConfig } from "../lib/db/config"
// Applies db/migrations/*.sql in order, once each, inside one transaction per file.
const client = new pg.Client(poolConfig())
await client.connect()
try {
  await client.query("create schema if not exists fieldquote")
  await client.query(
    "create table if not exists fieldquote.schema_migrations(name text primary key, applied_at timestamptz not null default now())"
  )
  const applied = new Set(
    (await client.query("select name from fieldquote.schema_migrations")).rows.map(
      (r) => r.name as string
    )
  )
  const files = readdirSync("db/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`)
      continue
    }
    await client.query("begin")
    try {
      await client.query(readFileSync(`db/migrations/${file}`, "utf8"))
      await client.query(
        "insert into fieldquote.schema_migrations(name) values($1)",
        [file]
      )
      await client.query("commit")
      console.log(`apply ${file}`)
    } catch (error) {
      await client.query("rollback")
      throw error
    }
  }
} finally {
  await client.end()
}
