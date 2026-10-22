import "server-only"
import { z } from "zod"
import { simpleParser } from "mailparser"
import type { TenantContext } from "@/lib/auth/tenant-context"
import { ownerQuery } from "@/lib/db/pool"
import { AppError } from "@/lib/http/errors"
import { decryptKey, encryptKey } from "@/lib/security/encryption"
import {
  imapPorts,
  smtpPorts,
  type InboxMessage,
  type MailStatus,
} from "@/lib/mail/presets"
import {
  mailError,
  smtpTransport,
  withInbox,
  type MailCredentials,
} from "@/lib/mail/connect"
import { getQuote } from "@/features/quotes/server/repository"
import { quoteText } from "@/features/quotes/domain/quote-text"
const MAX_ENQUIRY = 20000
const PAGE = 20
export const mailAccountSchema = z
  .object({
    email: z
      .email("Enter the full email address, e.g. office@yourcompany.co.uk.")
      .max(250),
    username: z.string().trim().max(250).optional(),
    password: z.string().min(1, "Enter the app password.").max(500).optional(),
    imapHost: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Enter the reading (IMAP) server.")
      .max(253),
    imapPort: z.union(
      imapPorts.map((p) => z.literal(p)) as [
        z.ZodLiteral<993>,
        z.ZodLiteral<143>,
      ],
      {
        message: "Use port 993 or 143 for reading.",
      }
    ),
    smtpHost: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Enter the sending (SMTP) server.")
      .max(253),
    smtpPort: z.union(
      smtpPorts.map((p) => z.literal(p)) as [
        z.ZodLiteral<465>,
        z.ZodLiteral<587>,
        z.ZodLiteral<25>,
        z.ZodLiteral<2525>,
      ],
      {
        message: "Use port 465 or 587 for sending.",
      }
    ),
  })
  .strict()
type Row = {
  email: string
  username: string
  imap_host: string
  imap_port: number
  smtp_host: string
  smtp_port: number
  ciphertext: string
  nonce: string
  tag: string
  updated_at: string
}
async function row(ctx: TenantContext) {
  const [found] = await ownerQuery<Row>(
    "select email, username, imap_host, imap_port, smtp_host, smtp_port, ciphertext, nonce, tag, updated_at from fieldquote.company_mail_accounts where company_id=$1",
    [ctx.companyId]
  )
  return found
}
export async function mailStatus(ctx: TenantContext): Promise<MailStatus> {
  const r = await row(ctx)
  return r
    ? {
        configured: true,
        email: r.email,
        username: r.username,
        imapHost: r.imap_host,
        imapPort: r.imap_port,
        smtpHost: r.smtp_host,
        smtpPort: r.smtp_port,
        updatedAt: r.updated_at,
      }
    : {
        configured: false,
        email: "",
        username: "",
        imapHost: "",
        imapPort: 993,
        smtpHost: "",
        smtpPort: 465,
        updatedAt: null,
      }
}
// The decrypted password stays on the server and goes straight to the mail libraries.
async function credentials(ctx: TenantContext): Promise<MailCredentials> {
  const r = await row(ctx)
  if (!r)
    throw new AppError(
      "MAIL_MISSING",
      "Connect your email in Settings first.",
      422
    )
  return {
    email: r.email,
    username: r.username,
    password: decryptKey(r, ctx.companyId, "mail"),
    imapHost: r.imap_host,
    imapPort: r.imap_port,
    smtpHost: r.smtp_host,
    smtpPort: r.smtp_port,
  }
}
// Checks both servers with the details given, and only stores them if both work.
export async function saveMailAccount(ctx: TenantContext, input: unknown) {
  const fields = mailAccountSchema.parse(input)
  const existing = await row(ctx)
  const password =
    fields.password ??
    (existing ? decryptKey(existing, ctx.companyId, "mail") : undefined)
  if (!password)
    throw new AppError("MAIL_PASSWORD", "Enter the app password.", 422)
  const creds: MailCredentials = {
    email: fields.email,
    username: fields.username || fields.email,
    password,
    imapHost: fields.imapHost,
    imapPort: fields.imapPort,
    smtpHost: fields.smtpHost,
    smtpPort: fields.smtpPort,
  }
  await withInbox(creds, async () => undefined)
  try {
    await (await smtpTransport(creds)).verify()
  } catch (error) {
    throw mailError(error, "sending")
  }
  const sealed = encryptKey(password, ctx.companyId, "mail")
  await ownerQuery(
    `insert into fieldquote.company_mail_accounts(company_id,email,username,imap_host,imap_port,smtp_host,smtp_port,ciphertext,nonce,tag,key_version,updated_by,updated_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
     on conflict(company_id) do update set email=excluded.email, username=excluded.username, imap_host=excluded.imap_host,
       imap_port=excluded.imap_port, smtp_host=excluded.smtp_host, smtp_port=excluded.smtp_port, ciphertext=excluded.ciphertext,
       nonce=excluded.nonce, tag=excluded.tag, key_version=excluded.key_version, updated_by=excluded.updated_by, updated_at=now()`,
    [
      ctx.companyId,
      creds.email,
      creds.username,
      creds.imapHost,
      creds.imapPort,
      creds.smtpHost,
      creds.smtpPort,
      sealed.ciphertext,
      sealed.nonce,
      sealed.tag,
      sealed.key_version,
      ctx.userId,
    ]
  )
  await audit(ctx, "mail_account_saved", ctx.companyId)
  return mailStatus(ctx)
}
export async function removeMailAccount(ctx: TenantContext) {
  await ownerQuery(
    "delete from fieldquote.company_mail_accounts where company_id=$1",
    [ctx.companyId]
  )
  await audit(ctx, "mail_account_removed", ctx.companyId)
  return mailStatus(ctx)
}
async function audit(ctx: TenantContext, event: string, entity: string) {
  await ownerQuery(
    "insert into fieldquote.audit_events(company_id,actor_id,entity_id,event) values($1,$2,$3,$4)",
    [ctx.companyId, ctx.userId, entity, event]
  )
}
const messageKey = (id: string | undefined, uid: number, validity: string) =>
  (id || `uid:${validity}:${uid}`).slice(0, 500)
// Newest first, PAGE at a time. `before` is the lowest sequence number already
// shown; older messages keep their numbers when new mail arrives.
export async function listInbox(ctx: TenantContext, before?: number) {
  const creds = await credentials(ctx)
  const { messages, next } = await withInbox(creds, async (client) => {
    const mailbox = client.mailbox
    const total = mailbox ? mailbox.exists : 0
    const top = Math.min(before ? before - 1 : total, total)
    if (top < 1) return { messages: [], next: null }
    const bottom = Math.max(1, top - PAGE + 1)
    const validity = mailbox ? String(mailbox.uidValidity) : "0"
    const found: (InboxMessage & { seq: number; key: string })[] = []
    for await (const m of client.fetch(`${bottom}:${top}`, {
      uid: true,
      envelope: true,
      internalDate: true,
    })) {
      const sender = m.envelope?.from?.[0]
      found.push({
        seq: m.seq,
        uid: m.uid,
        key: messageKey(m.envelope?.messageId, m.uid, validity),
        from: sender?.name || sender?.address || "Unknown sender",
        fromEmail: sender?.address || "",
        subject: m.envelope?.subject || "(no subject)",
        date:
          m.envelope?.date || m.internalDate
            ? new Date(
                (m.envelope?.date || m.internalDate) as Date
              ).toISOString()
            : null,
        quoteId: null,
        enquiryId: null,
      })
    }
    found.sort((a, b) => b.seq - a.seq)
    return { messages: found, next: bottom > 1 ? bottom : null }
  })
  // Mark emails that already became enquiries or quotes.
  const keys = messages.map((m) => m.key)
  const used = keys.length
    ? await ctx.read<{
        source_message_id: string
        id: string
        quote_id: string | null
      }>(
        `select e.source_message_id, e.id, q.id as quote_id from fieldquote.enquiries e
         left join fieldquote.quotes q on q.enquiry_id = e.id and q.company_id = e.company_id
         where e.company_id=$1 and e.source_message_id = any($2)`,
        [ctx.companyId, keys]
      )
    : []
  return {
    messages: messages.map(({ key, ...m }) => {
      const hit = used.find((u) => u.source_message_id === key)
      return {
        ...m,
        enquiryId: hit?.id || null,
        quoteId: hit?.quote_id || null,
      }
    }),
    next,
  }
}
async function readMessage(ctx: TenantContext, uid: number) {
  const creds = await credentials(ctx)
  return withInbox(creds, async (client) => {
    const validity = client.mailbox ? String(client.mailbox.uidValidity) : "0"
    const message = await client.fetchOne(
      String(uid),
      { source: true, envelope: true },
      { uid: true }
    )
    if (!message || !message.source)
      throw new AppError(
        "MAIL_GONE",
        "That email isn’t in the inbox any more.",
        404
      )
    const parsed = await simpleParser(message.source)
    const from = parsed.from?.value[0]
    const header = [
      `From: ${from?.name ? `${from.name} <${from.address}>` : from?.address || "Unknown sender"}`,
      `Subject: ${parsed.subject || "(no subject)"}`,
      parsed.date ? `Date: ${parsed.date.toUTCString()}` : "",
    ]
      .filter(Boolean)
      .join("\n")
    const body = (parsed.text || "").replace(/\r\n/g, "\n").trim()
    const full = `${header}\n\n${body}`
    return {
      key: messageKey(
        parsed.messageId || message.envelope?.messageId,
        uid,
        validity
      ),
      from: from?.name || from?.address || "Unknown sender",
      fromEmail: from?.address || "",
      subject: parsed.subject || "(no subject)",
      date: parsed.date ? parsed.date.toISOString() : null,
      text: full.slice(0, MAX_ENQUIRY),
      truncated: full.length > MAX_ENQUIRY,
      empty: body.length === 0,
    }
  })
}
export async function previewMessage(ctx: TenantContext, uid: number) {
  const { key, ...message } = await readMessage(ctx, uid)
  const [used] = await ctx.read<{ id: string; quote_id: string | null }>(
    `select e.id, q.id as quote_id from fieldquote.enquiries e
     left join fieldquote.quotes q on q.enquiry_id = e.id and q.company_id = e.company_id
     where e.company_id=$1 and e.source_message_id=$2`,
    [ctx.companyId, key]
  )
  return {
    ...message,
    uid,
    enquiryId: used?.id || null,
    quoteId: used?.quote_id || null,
  }
}
// Saves the email as an enquiry (once). The caller then drafts the quote as usual.
export async function enquiryFromMessage(ctx: TenantContext, uid: number) {
  const message = await readMessage(ctx, uid)
  if (message.empty)
    throw new AppError(
      "MAIL_EMPTY",
      "This email has no readable text (it may be only pictures or attachments). Paste the details instead.",
      422
    )
  const [existing] = await ctx.read<{ id: string }>(
    "select id from fieldquote.enquiries where company_id=$1 and source_message_id=$2",
    [ctx.companyId, message.key]
  )
  if (existing) return { id: existing.id, truncated: message.truncated }
  const [created] = await ownerQuery<{ id: string }>(
    "insert into fieldquote.enquiries(company_id, raw_text, source_message_id) values($1,$2,$3) on conflict do nothing returning id",
    [ctx.companyId, message.text, message.key]
  )
  if (!created) {
    const [again] = await ctx.read<{ id: string }>(
      "select id from fieldquote.enquiries where company_id=$1 and source_message_id=$2",
      [ctx.companyId, message.key]
    )
    return { id: again.id, truncated: message.truncated }
  }
  return { id: created.id, truncated: message.truncated }
}
export const sendSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict()
// Emails an approved quote to the customer from the company's own mailbox.
export async function sendQuote(
  ctx: TenantContext,
  quoteId: string,
  input: unknown
) {
  const { expectedVersion } = sendSchema.parse(input)
  const quote = await getQuote(ctx, quoteId)
  if (quote.version !== expectedVersion)
    throw new AppError(
      "CONFLICT",
      "Someone else changed this quote. Reload the page and check it again.",
      409
    )
  if (quote.status !== "approved")
    throw new AppError(
      "NOT_APPROVED",
      "Approve the quote before sending it.",
      422
    )
  if (quote.expiresAt && new Date(quote.expiresAt) < new Date())
    throw new AppError(
      "EXPIRED",
      "This quote has expired. Edit and approve it again before sending.",
      422
    )
  const to = quote.customerEmail?.trim()
  if (!to || !z.email().safeParse(to).success)
    throw new AppError(
      "NO_RECIPIENT",
      "This quote has no valid customer email address to send to.",
      422
    )
  const creds = await credentials(ctx)
  try {
    const transport = await smtpTransport(creds)
    await transport.sendMail({
      from: { name: ctx.company.name, address: creds.email },
      to,
      subject: `Your quote from ${ctx.company.name}: ${quote.title}`,
      text: quoteText(quote, ctx.company),
    })
  } catch (error) {
    throw mailError(error, "sending")
  }
  const [sent] = await ownerQuery<{ sent_at: string }>(
    "insert into fieldquote.quote_sends(company_id, quote_id, version, to_email, sent_by) values($1,$2,$3,$4,$5) returning sent_at",
    [ctx.companyId, quote.id, quote.version, to, ctx.userId]
  )
  await audit(ctx, "quote_sent", quote.id)
  return { to, at: sent.sent_at, by: ctx.name }
}
