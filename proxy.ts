import { NextResponse } from "next/server"
// Sessions are verified on every page and API call (lib/auth/tenant-context.ts).
// The proxy only stops authenticated responses being stored by shared caches.
export function proxy() {
  const response = NextResponse.next()
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
