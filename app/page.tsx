import { redirect } from "next/navigation"
import { connection } from "next/server"
import { isConfigured } from "@/lib/env"
export default async function Home() {
  // Decide at request time, not build time, so deployment env vars apply.
  await connection()
  redirect(isConfigured() ? "/enquiries" : "/login")
}
