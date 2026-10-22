import "server-only"
import { ImapFlow } from "imapflow"
import nodemailer from "nodemailer"
import { AppError } from "@/lib/http/errors"
import { allowPrivateMailHosts, resolveMailHost } from "./hosts"
export type MailCredentials = {
  email: string
  username: string
  password: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
}
// Turns socket and login failures into messages a non-technical person can act on.
export function mailError(error: unknown, server: "reading" | "sending") {
  if (error instanceof AppError) return error
  const e = error as {
    code?: string
    authenticationFailed?: boolean
    responseCode?: number
    message?: string
  }
  const text = `${e.code || ""} ${e.message || ""}`
  if (
    e.authenticationFailed ||
    e.code === "EAUTH" ||
    e.responseCode === 535 ||
    /AUTHENTICATIONFAILED|Invalid credentials|auth/i.test(text)
  )
    return new AppError(
      "MAIL_LOGIN",
      "The email address or password was rejected. Gmail, Outlook, Yahoo and iCloud need an app password, not your normal password.",
      422
    )
  if (/ETIMEDOUT|ESOCKET|Timeout|timed out/i.test(text))
    return new AppError(
      "MAIL_TIMEOUT",
      `The ${server} server didn’t answer in time. Check the server name and port, then try again.`,
      504
    )
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ECONNRESET/i.test(text))
    return new AppError(
      "MAIL_CONNECT",
      `Couldn’t connect to the ${server} server. Check the server name and port.`,
      422
    )
  if (/certificate|TLS|SSL/i.test(text))
    return new AppError(
      "MAIL_TLS",
      `The ${server} server’s security certificate couldn’t be checked. Check the server name.`,
      422
    )
  return new AppError(
    "MAIL_FAILURE",
    `Something went wrong talking to the ${server} server. Try again in a moment.`,
    502
  )
}
// Opens INBOX, runs fn, and always logs out. One connection per request suits serverless hosting.
export async function withInbox<T>(
  creds: MailCredentials,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const address = await resolveMailHost(creds.imapHost)
  const local = allowPrivateMailHosts()
  const client = new ImapFlow({
    host: address,
    port: creds.imapPort,
    secure: creds.imapPort === 993,
    doSTARTTLS: local ? undefined : creds.imapPort === 143,
    servername: creds.imapHost,
    auth: { user: creds.username, pass: creds.password },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    tls: { servername: creds.imapHost, rejectUnauthorized: !local },
  })
  // A dropped connection must surface as a failed request, not crash the server.
  client.on("error", () => undefined)
  try {
    await client.connect()
    const lock = await client.getMailboxLock("INBOX")
    try {
      return await fn(client)
    } finally {
      lock.release()
    }
  } catch (error) {
    throw mailError(error, "reading")
  } finally {
    await client.logout().catch(() => client.close())
  }
}
export async function smtpTransport(creds: MailCredentials) {
  const address = await resolveMailHost(creds.smtpHost)
  const local = allowPrivateMailHosts()
  return nodemailer.createTransport({
    host: address,
    port: creds.smtpPort,
    secure: creds.smtpPort === 465,
    requireTLS: !local && creds.smtpPort !== 465,
    auth: { user: creds.username, pass: creds.password },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    tls: { servername: creds.smtpHost, rejectUnauthorized: !local },
  })
}
