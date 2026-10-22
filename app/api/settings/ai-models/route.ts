import { api } from "@/lib/http/errors"
import { requireTenant } from "@/lib/auth/tenant-context"
import { availableModels } from "@/features/settings/server/ai-settings"
export const runtime = "nodejs"
// Lists the models the saved key can use, live from the provider.
export async function GET() {
  return api(async () => availableModels(await requireTenant()))
}
