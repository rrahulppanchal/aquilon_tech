import "server-only"
import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { extractionSchema } from "./extraction-schema"
import { enquiryInput, extractionInstructions } from "./prompt"
import type { ModelOption } from "./providers"
import type { Company, Rate } from "@/features/quotes/types"
import { AppError } from "@/lib/http/errors"
const client = (apiKey: string, timeout = 100000) =>
  new OpenAI({ apiKey, timeout, maxRetries: 0 })
export async function extractWithOpenAI(input: {
  text: string
  key: string
  model: string
  company: Company
  rates: Rate[]
}) {
  try {
    const response = await client(input.key).responses.parse({
      model: input.model,
      instructions: extractionInstructions(input.company, input.rates),
      input: enquiryInput(input.text),
      max_output_tokens: 16000,
      text: { format: zodTextFormat(extractionSchema, "job_extraction") },
    })
    const refused = response.output.some(
      (item) =>
        item.type === "message" &&
        item.content.some((part) => part.type === "refusal")
    )
    if (refused)
      throw new AppError(
        "AI_REFUSAL",
        "The model declined to read this enquiry. Check the text, or try another model in Settings.",
        422
      )
    if (response.status !== "completed" || !response.output_parsed)
      throw new AppError(
        "AI_OUTPUT",
        "The model could not produce a complete draft. Your enquiry is saved; try again.",
        502
      )
    return extractionSchema.parse(response.output_parsed)
  } catch (error) {
    throw mapOpenAIError(error)
  }
}
// Only text models that can return structured output are useful here.
const excluded =
  /(audio|realtime|tts|transcribe|whisper|embedding|moderation|image|dall-e|search|codex|instruct|babbage|davinci|computer-use)/
export async function listOpenAIModels(key: string): Promise<ModelOption[]> {
  try {
    const models: ModelOption[] = []
    for await (const model of client(key, 15000).models.list())
      if (/^(gpt-|o\d)/.test(model.id) && !excluded.test(model.id))
        models.push({ id: model.id, label: model.id })
    return models.sort((a, b) => b.id.localeCompare(a.id))
  } catch (error) {
    throw mapOpenAIError(error)
  }
}
function mapOpenAIError(error: unknown) {
  if (error instanceof AppError) return error
  if (
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError
  )
    return new AppError(
      "AI_KEY",
      "OpenAI rejected this key. Check it, or paste a new one in Settings.",
      422
    )
  if (error instanceof OpenAI.NotFoundError)
    return new AppError(
      "AI_MODEL",
      "This OpenAI key can’t use the selected model. Choose another model in Settings.",
      422
    )
  if (error instanceof OpenAI.RateLimitError)
    return new AppError(
      "AI_LIMIT",
      "OpenAI usage limit or quota reached. Check billing, or try again shortly.",
      429
    )
  if (error instanceof OpenAI.BadRequestError)
    return new AppError(
      "AI_REQUEST",
      "OpenAI rejected the request for this model. Try another model in Settings.",
      422
    )
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return new AppError(
      "AI_TIMEOUT",
      "OpenAI took too long to answer. Your enquiry is saved; try again.",
      504
    )
  return new AppError(
    "AI_FAILURE",
    "OpenAI could not complete this request. Check the key, model and credit, then try again.",
    502
  )
}
