import { ServerWorkspace } from "@/components/workspace/server-page"
import { notFound } from "next/navigation"
import { z } from "zod"
export default async function Page({
  params,
}: {
  params: Promise<{ quoteId: string }>
}) {
  const { quoteId } = await params
  if (!z.uuid().safeParse(quoteId).success) notFound()
  return <ServerWorkspace section="quotes" quoteId={quoteId} />
}
