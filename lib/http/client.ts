export async function request<T>(
  path: string,
  method = "GET",
  data?: unknown
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    })
  } catch {
    throw new Error(
      "Can’t reach the server. Check your internet connection and try again."
    )
  }
  let result: { error?: { message?: string } } | null = null
  try {
    result = await response.json()
  } catch {
    /* Hosting errors and timeouts can return a non-JSON page. */
  }
  // A signed-out session sends people back to sign in; a wrong password does not.
  if (response.status === 401 && path !== "/api/auth/login") {
    // A full reload is intended: it clears page state from the ended session,
    // and this helper runs outside any component, so the router isn’t available.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login"
    throw new Error("Your session ended. Please sign in again.")
  }
  if (!response.ok)
    throw new Error(
      result?.error?.message ||
        (response.status === 504
          ? "That took too long. Your work is saved; try again."
          : "Something went wrong. Try again in a moment.")
    )
  return result as T
}
