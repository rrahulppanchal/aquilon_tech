import "server-only"
import { z } from "zod"
import type { TenantContext } from "@/lib/auth/tenant-context"
import { ownerQuery, pool, mapDatabaseError } from "@/lib/db/pool"
import { AppError } from "@/lib/http/errors"
import { decryptKey, encryptKey } from "@/lib/security/encryption"
import { listModels } from "@/lib/ai/extract"
import {
  defaultModel,
  keyPatterns,
  providers,
  suggestedModels,
  type ModelOption,
  type Provider,
} from "@/lib/ai/providers"
export type AiStatus = {
  configured: boolean
  provider: Provider | null
  model: string | null
  suffix: string
}
export const saveKeySchema = z
  .object({
    provider: z.enum(providers),
    apiKey: z.string().trim().min(20).max(500),
    model: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .refine((input) => keyPatterns[input.provider].test(input.apiKey), {
    message: "This doesn’t look like a key for the chosen provider.",
    path: ["apiKey"],
  })
export const setModelSchema = z
  .object({ model: z.string().trim().min(1).max(100) })
  .strict()
type Row = {
  provider: Provider
  model: string
  suffix: string
  ciphertext: string
  nonce: string
  tag: string
}
async function credential(ctx: TenantContext) {
  const [row] = await ownerQuery<Row>(
    "select provider, model, suffix, ciphertext, nonce, tag from fieldquote.company_ai_credentials where company_id=$1",
    [ctx.companyId]
  )
  return row
}
export async function aiStatus(ctx: TenantContext): Promise<AiStatus> {
  const row = await credential(ctx)
  return row
    ? {
        configured: true,
        provider: row.provider,
        model: row.model,
        suffix: row.suffix,
      }
    : { configured: false, provider: null, model: null, suffix: "" }
}
// The decrypted key never leaves the server; callers pass it straight to the SDK.
export async function aiCredential(ctx: TenantContext) {
  const row = await credential(ctx)
  if (!row)
    throw new AppError(
      "MISSING_KEY",
      "Add an Anthropic or OpenAI API key in Settings first.",
      422
    )
  return {
    provider: row.provider,
    model: row.model,
    key: decryptKey(row, ctx.companyId, row.provider),
  }
}
// Prefer the recommended models when the account offers them.
function pickModel(
  provider: Provider,
  available: ModelOption[],
  wanted?: string
) {
  const ids = new Set(available.map((m) => m.id))
  if (wanted && ids.has(wanted)) return wanted
  if (wanted)
    throw new AppError(
      "AI_MODEL",
      "That model isn’t available to this key. Choose one from the list.",
      422
    )
  return (
    suggestedModels[provider].find((m) => ids.has(m.id))?.id ||
    available[0]?.id ||
    defaultModel(provider)
  )
}
async function audit(ctx: TenantContext, event: string) {
  await ownerQuery(
    "insert into fieldquote.audit_events(company_id,actor_id,entity_id,event) values($1,$2,$3,$4)",
    [ctx.companyId, ctx.userId, ctx.companyId, event]
  )
}
// Any member can connect the company's AI account. The key is checked by
// listing models (no tokens used) before it is stored.
export async function saveKey(ctx: TenantContext, input: unknown) {
  const { provider, apiKey, model } = saveKeySchema.parse(input)
  const available = await listModels(provider, apiKey)
  const chosen = pickModel(provider, available, model)
  const sealed = encryptKey(apiKey, ctx.companyId, provider)
  const client = await pool().connect()
  try {
    await client.query("begin")
    await client.query(
      `insert into fieldquote.company_ai_credentials(company_id,provider,model,ciphertext,nonce,tag,suffix,key_version,updated_by,updated_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict(company_id) do update set provider=excluded.provider, model=excluded.model, ciphertext=excluded.ciphertext,
         nonce=excluded.nonce, tag=excluded.tag, suffix=excluded.suffix, key_version=excluded.key_version,
         updated_by=excluded.updated_by, updated_at=now()`,
      [
        ctx.companyId,
        provider,
        chosen,
        sealed.ciphertext,
        sealed.nonce,
        sealed.tag,
        sealed.suffix,
        sealed.key_version,
        ctx.userId,
      ]
    )
    await client.query(
      "insert into fieldquote.audit_events(company_id,actor_id,entity_id,event) values($1,$2,$3,$4)",
      [ctx.companyId, ctx.userId, ctx.companyId, `ai_key_saved:${provider}`]
    )
    await client.query("commit")
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    mapDatabaseError(error)
  } finally {
    client.release()
  }
  return { status: await aiStatus(ctx), models: available }
}
export async function setModel(ctx: TenantContext, input: unknown) {
  const { model } = setModelSchema.parse(input)
  const { provider, key } = await aiCredential(ctx)
  pickModel(provider, await listModels(provider, key), model)
  await ownerQuery(
    "update fieldquote.company_ai_credentials set model=$2, updated_by=$3, updated_at=now() where company_id=$1",
    [ctx.companyId, model, ctx.userId]
  )
  await audit(ctx, `ai_model_set:${model}`)
  return aiStatus(ctx)
}
export async function availableModels(ctx: TenantContext) {
  const { provider, key } = await aiCredential(ctx)
  return { provider, models: await listModels(provider, key) }
}
export async function removeKey(ctx: TenantContext) {
  await ownerQuery(
    "delete from fieldquote.company_ai_credentials where company_id=$1",
    [ctx.companyId]
  )
  await audit(ctx, "ai_key_removed")
  return aiStatus(ctx)
}
