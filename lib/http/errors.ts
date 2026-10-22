import { ZodError } from "zod"
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message)
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}
export async function api(fn: () => Promise<unknown>) {
  try {
    return json(await fn())
  } catch (error) {
    if (error instanceof ZodError)
      return json(
        {
          error: {
            code: "VALIDATION",
            message: friendlyValidation(error),
            fieldErrors: error.flatten(),
          },
        },
        422
      )
    if (error instanceof AppError)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status
      )
    // Never log unknown exception objects: provider errors can include request secrets.
    const requestId = crypto.randomUUID()
    console.error("Request failed", requestId)
    return json(
      {
        error: {
          code: "SERVER_ERROR",
          message: "Something went wrong on our side. Try again in a moment.",
          requestId,
        },
      },
      500
    )
  }
}
export async function body(request: Request) {
  const origin = request.headers.get("origin")
  const expected = process.env.APP_URL || new URL(request.url).origin
  if (!origin || origin !== new URL(expected).origin)
    throw new AppError(
      "ORIGIN",
      "This request came from another website, so it was blocked.",
      403
    )
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("CONTENT_TYPE", "Use application/json.", 415)
  // Stream with a bound instead of reading an unbounded body before validating it.
  const reader = request.body?.getReader()
  if (!reader) throw new AppError("BODY", "A JSON body is required.", 422)
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    bytes += value.length
    if (bytes > 100000) {
      await reader.cancel()
      throw new AppError("SIZE", "That’s too much text to send at once.", 413)
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
  } catch {
    throw new AppError("JSON", "The request was damaged. Try again.", 422)
  }
}

// Field names people will recognise, used in validation messages.
const fieldNames: Record<string, string> = {
  rawText: "Enquiry text",
  email: "Email",
  password: "Password",
  apiKey: "API key",
  provider: "Provider",
  model: "Model",
  code: "Code",
  description: "Item",
  unit: "Unit",
  ratePence: "Price",
  status: "Status",
  notes: "Notes",
  name: "Name",
  company: "Company",
  emails: "Email",
  phone: "Phone",
  address: "Address",
  paymentTerms: "Payment terms",
  invoiceEmail: "Invoice email",
  aliases: "Also known as",
  quantity: "Quantity",
  note: "Note",
  resolution: "Check notes",
  expectedVersion: "Version",
}
function friendlyValidation(error: ZodError) {
  const issue = error.issues[0]
  if (!issue) return "Some details aren’t right. Check the form and try again."
  if (issue.code === "unrecognized_keys")
    return "The form sent something unexpected. Reload the page and try again."
  const key = [...issue.path].reverse().find((p) => typeof p === "string")
  const label = (key && fieldNames[key]) || "This field"
  // Our own schemas carry plain-language messages; keep those as written.
  // Zod's built-in messages start with words like "Invalid" or "Too small".
  if (
    !/^(Invalid|Too (small|big)|Expected|Unrecognized|Required)/i.test(
      issue.message
    )
  )
    return issue.message
  if (issue.code === "too_small")
    return issue.origin === "string"
      ? `${label} is too short.`
      : `${label} is too small.`
  if (issue.code === "too_big")
    return issue.origin === "string"
      ? `${label} is too long.`
      : `${label} is too large.`
  if (issue.code === "invalid_type") return `${label} is missing.`
  if (issue.code === "invalid_value")
    return `Choose a valid ${label.toLowerCase()}.`
  return `${label} isn’t in the right format.`
}
