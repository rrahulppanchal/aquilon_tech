import { api, body } from "@/lib/http/errors"
import { signOut } from "@/lib/auth/session"
export async function POST(request: Request) {
  return api(async () => {
    await body(request)
    await signOut()
    return { success: true }
  })
}
