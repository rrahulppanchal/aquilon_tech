// Shared by the settings UI and the server, so no secrets or SDK imports here.
export const providers = ["anthropic", "openai"] as const
export type Provider = (typeof providers)[number]
export type ModelOption = { id: string; label: string }
export const providerLabels: Record<Provider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
}
export const keyPatterns: Record<Provider, RegExp> = {
  anthropic: /^sk-ant-[A-Za-z0-9_-]{12,}$/,
  openai: /^sk-[A-Za-z0-9_-]{16,}$/,
}
// Shown until the provider's live model list has loaded, and used as the
// default when a key is first saved.
export const suggestedModels: Record<Provider, ModelOption[]> = {
  anthropic: [
    { id: "claude-opus-5-5", label: "Claude Opus 5.5 (recommended)" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (faster)" },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (cheapest)" },
  ],
  openai: [
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 mini (cheaper)" },
  ],
}
export const defaultModel = (provider: Provider) =>
  suggestedModels[provider][0].id
