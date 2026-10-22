// Shared by the settings form and the server. Hosts are the providers'
// published IMAP (reading) and SMTP (sending) servers.
export const mailPresets = {
  gmail: {
    label: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    help: "Use an app password, not your normal one: Google Account → Security → 2-Step Verification → App passwords.",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    help: "Your administrator may need to allow IMAP and SMTP for the mailbox. Use an app password if two-step sign-in is on.",
  },
  yahoo: {
    label: "Yahoo",
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 465,
    help: "Create an app password in Yahoo Account Security and use it here.",
  },
  icloud: {
    label: "iCloud",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    help: "Create an app-specific password at appleid.apple.com and use it here.",
  },
  other: {
    label: "Other",
    imapHost: "",
    imapPort: 993,
    smtpHost: "",
    smtpPort: 465,
    help: "Your email provider lists these settings, often under “IMAP” and “SMTP”.",
  },
} as const
export type MailPreset = keyof typeof mailPresets
export const imapPorts = [993, 143] as const
export const smtpPorts = [465, 587, 25, 2525] as const
export type MailStatus = {
  configured: boolean
  email: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  username: string
  updatedAt: string | null
}
export type InboxMessage = {
  uid: number
  from: string
  fromEmail: string
  subject: string
  date: string | null
  quoteId: string | null
  enquiryId: string | null
}
