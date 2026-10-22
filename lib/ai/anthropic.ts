import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { extractionSchema } from "./extraction-schema"
import { enquiryInput, extractionInstructions } from "./prompt"
import type { ModelOption } from "./providers"
import type { Company, Rate } from "@/features/quotes/types"
import { AppError } from "@/lib/http/errors"
const client = (apiKey: string, timeout = 100000) =>
  new Anthropic({ apiKey, timeout, maxRetries: 0 })
// Server-side refusal fallback is offered on these models; Haiku has none.
const supportsFallback = (model: string) =>
  /^claude-(opus-5|sonnet-5-5|fable-5)/.test(model)
// Effort exists on the current generation; older models reject it.
const supportsEffort = (model: string) =>
  /^claude-(opus|sonnet|haiku|fable|mythos)-5/.test(model)
export async function extractWithAnthropic(input: {
  text: string
  key: string
  model: string
  company: Company
  rates: Rate[]
}) {
  try {
    const fallback = supportsFallback(input.model)
    const response = await client(input.key).beta.messages.parse({
      model: input.model,
      max_tokens: 16000,
      system: extractionInstructions(input.company, input.rates),
      messages: [{ role: "user", content: enquiryInput(input.text) }],
      output_config: {
        format: betaZodOutputFormat(extractionSchema),
        ...(supportsEffort(input.model) ? { effort: "medium" as const } : {}),
      },
      ...(fallback
        ? {
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default" as const,
          }
        : {}),
    })
    if (response.stop_reason === "refusal")
      throw new AppError(
        "AI_REFUSAL",
        "The model declined to read this enquiry. Check the text, or try another model in Settings.",
        422
      )
    if (!response.parsed_output || response.stop_reason !== "end_turn")
      throw new AppError(
        "AI_OUTPUT",
        "The model could not produce a complete draft. Your enquiry is saved; try again.",
        502
      )
    return extractionSchema.parse(response.parsed_output)
  } catch (error) {
    throw mapAnthropicError(error)
  }
}
export async function listAnthropicModels(key: string): Promise<ModelOption[]> {
  try {
    const models: ModelOption[] = []
    for await (const model of client(key, 15000).models.list())
      models.push({ id: model.id, label: model.display_name })
    return models
  } catch (error) {
    throw mapAnthropicError(error)
  }
}
function mapAnthropicError(error: unknown) {
  if (error instanceof AppError) return error
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  )
    return new AppError(
      "AI_KEY",
      "Anthropic rejected this key. Check it, or paste a new one in Settings.",
      422
    )
  if (error instanceof Anthropic.NotFoundError)
    return new AppError(
      "AI_MODEL",
      "This Anthropic key can’t use the selected model. Choose another model in Settings.",
      422
    )
  if (error instanceof Anthropic.RateLimitError)
    return new AppError(
      "AI_LIMIT",
      "Anthropic usage limit reached. Try again shortly.",
      429
    )
  if (error instanceof Anthropic.BadRequestError)
    return new AppError(
      "AI_REQUEST",
      "Anthropic rejected the request for this model. Try another model in Settings.",
      422
    )
  if (error instanceof Anthropic.APIConnectionTimeoutError)
    return new AppError(
      "AI_TIMEOUT",
      "Anthropic took too long to answer. Your enquiry is saved; try again.",
      504
    )
  return new AppError(
    "AI_FAILURE",
    "Anthropic could not complete this request. Check the key, model and credit, then try again.",
    502
  )
}
