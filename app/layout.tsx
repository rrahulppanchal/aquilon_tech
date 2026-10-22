import type { Metadata, Viewport } from "next"
import { Archivo } from "next/font/google"
import "./globals.css"
// One variable family: condensed widths for headings, normal width for reading.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
})
export const metadata: Metadata = {
  title: "Fieldquote",
  description:
    "Draft quotes from customer enquiries using your own rates. Nothing goes out until you approve it.",
  robots: { index: false, follow: false },
}
export const viewport: Viewport = { themeColor: "#1e282e" }
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={archivo.variable}>
      <body>{children}</body>
    </html>
  )
}
