import { z } from "zod"
import { api, body, AppError } from "@/lib/http/errors"
import { signIn } from "@/lib/auth/session"
import { isConfigured } from "@/lib/env"
export async function POST(request: Request) {
  return api(async () => {
    const input = z
      .object({
        email: z.email("Enter a valid email address.").max(250),
        password: z
          .string()
          .min(8, "Unable to sign in. Check your email and password.")
          .max(200),
      })
      .strict()
      .parse(await body(request))
    if (!isConfigured())
      throw new AppError(
        "NOT_CONFIGURED",
        "Sign-in isn’t set up on this server. Set DATABASE_URL and run the migration.",
        503
      )
    await signIn(input.email, input.password)
    return { success: true }
  })
}
