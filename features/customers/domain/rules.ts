import { z } from "zod"
// Used by both the customer form and the server, so the same rules apply on both sides.
export const paymentTerms = [
  "On completion",
  "7 days",
  "14 days",
  "30 days",
] as const
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter an email like name@example.com.")
  .max(250)
export const customerFields = z
  .object({
    name: z.string().trim().min(2, "Enter the customer’s name.").max(120),
    company: z.string().trim().max(120),
    emails: z
      .array(email)
      .max(10, "Keep it to 10 email addresses or fewer.")
      .refine(
        (list) => new Set(list).size === list.length,
        "That email is listed twice."
      ),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^[0-9+()\s-]*$/, "Use numbers, spaces and + only."),
    address: z.string().trim().max(250),
    paymentTerms: z.enum(paymentTerms),
    invoiceEmail: z.union([email, z.literal("")]),
    aliases: z.array(z.string().trim().min(1).max(120)).max(10),
    notes: z.string().trim().max(500),
  })
  .strict()
export type CustomerFields = z.infer<typeof customerFields>
