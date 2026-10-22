import "server-only"
import type { Company, Rate } from "@/features/quotes/types"
import { extractWithAnthropic, listAnthropicModels } from "./anthropic"
import { extractWithOpenAI, listOpenAIModels } from "./openai"
import type { ModelOption, Provider } from "./providers"
export function extractEnquiry(input: {
  provider: Provider
  model: string
  key: string
  text: string
  company: Company
  rates: Rate[]
}) {
  return input.provider === "openai"
    ? extractWithOpenAI(input)
    : extractWithAnthropic(input)
}
// Listing models costs no tokens, so it doubles as a key check.
export function listModels(
  provider: Provider,
  key: string
): Promise<ModelOption[]> {
  return provider === "openai"
    ? listOpenAIModels(key)
    : listAnthropicModels(key)
}
