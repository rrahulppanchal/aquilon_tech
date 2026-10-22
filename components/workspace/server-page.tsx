import { redirect, notFound } from "next/navigation"
import { connection } from "next/server"
import { requireTenant } from "@/lib/auth/tenant-context"
import { workspace } from "@/features/quotes/server/service"
import { getQuote } from "@/features/quotes/server/repository"
import { AppError } from "@/lib/http/errors"
import type { WorkspaceData } from "@/features/quotes/types"
import { Workspace } from "./workspace"
export async function ServerWorkspace({
  section,
  quoteId,
}: {
  section: string
  quoteId?: string
}) {
  await connection()
  let data: WorkspaceData
  try {
    const ctx = await requireTenant()
    data = await workspace(ctx)
    if (quoteId && !data.quotes.some((q) => q.id === quoteId))
      data.quotes.unshift(await getQuote(ctx, quoteId))
  } catch (error) {
    if (error instanceof AppError && [401, 503].includes(error.status))
      redirect("/login")
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
  return (
    <Workspace
      key={`${section}-${quoteId || "list"}`}
      initialData={data}
      section={section}
      quoteId={quoteId}
    />
  )
}
