import { useId } from "react"
import type { Provider } from "@/lib/ai/providers"
import {
  mailPresets,
  type MailPreset,
  type MailStatus,
} from "@/lib/mail/presets"

// Brand marks for the mail and AI providers Fieldquote connects to, so
// people recognise their account at a glance. Artwork is vendored from
// open icon sets: Gmail, OpenAI and Anthropic from Iconify "logos"
// (CC0), Outlook from VS Code Icons (MIT), Yahoo from CoreUI Brands (CC0)
// and iCloud from Simple Icons (CC0). Single-colour marks take the
// brand's colour; OpenAI and Anthropic follow the text colour.
export type Brand = Exclude<MailPreset, "other"> | Provider
const marks: Record<
  Brand,
  { viewBox: string; color: string | undefined; body: string }
> = {
  gmail: {
    viewBox: "0 0 256 204",
    color: undefined,
    body: '<defs><linearGradient id="ID0" x1="165" x2="165" y1="44" y2="166" gradientUnits="userSpaceOnUse"><stop stop-color="#60d673"/><stop offset=".17" stop-color="#42c868"/><stop offset=".39" stop-color="#0ebc5f"/><stop offset=".62" stop-color="#00a9bb"/><stop offset=".86" stop-color="#3c90ff"/><stop offset="1" stop-color="#3186ff"/></linearGradient><linearGradient id="ID1" x1="8" x2="184" y1="46.13" y2="46.13" gradientUnits="userSpaceOnUse"><stop offset=".08" stop-color="#ff63a0"/><stop offset=".3" stop-color="#fc413d"/><stop offset=".5" stop-color="#fc413d"/><stop offset=".65" stop-color="#fc413d"/><stop offset=".72" stop-color="#fc5c30"/><stop offset=".86" stop-color="#feb10c"/><stop offset=".91" stop-color="#fec700"/><stop offset=".96" stop-color="#ffdb0f"/></linearGradient></defs><path fill="url(#ID0)" d="M146 44h38v110c0 6.627-5.373 12-12 12h-20a6 6 0 0 1-6-6z" transform="translate(-11.636 -37.818)scale(1.45454)"/><path fill="#fc413d" d="M55.273 26.182H0v160c0 9.638 7.816 17.454 17.455 17.454h29.09a8.727 8.727 0 0 0 8.728-8.728z"/><path fill="url(#ID1)" d="M39.226 30.456c-8.033-6.752-20.018-5.714-26.77 2.319c-6.752 8.032-5.714 20.017 2.319 26.77l76.078 63.949a8 8 0 0 0 10.295 0l76.078-63.95c8.032-6.752 9.07-18.737 2.318-26.77c-6.752-8.032-18.737-9.07-26.769-2.318L96 78.18z" transform="translate(-11.636 -37.818)scale(1.45454)"/>',
  },
  outlook: {
    viewBox: "0 0 32 32",
    color: undefined,
    body: '<path fill="#0072c6" d="M19.484 7.937v5.477l1.916 1.205a.5.5 0 0 0 .21 0l8.238-5.554a1.174 1.174 0 0 0-.959-1.128Z"/><path fill="#0072c6" d="m19.484 15.457l1.747 1.2a.52.52 0 0 0 .543 0c-.3.181 8.073-5.378 8.073-5.378v10.066a1.408 1.408 0 0 1-1.49 1.555h-8.874zm-9.044-2.525a1.61 1.61 0 0 0-1.42.838a4.13 4.13 0 0 0-.526 2.218A4.05 4.05 0 0 0 9.02 18.2a1.6 1.6 0 0 0 2.771.022a4 4 0 0 0 .515-2.2a4.37 4.37 0 0 0-.5-2.281a1.54 1.54 0 0 0-1.366-.809"/><path fill="#0072c6" d="M2.153 5.155v21.427L18.453 30V2Zm10.908 14.336a3.23 3.23 0 0 1-2.7 1.361a3.19 3.19 0 0 1-2.64-1.318A5.46 5.46 0 0 1 6.706 16.1a5.87 5.87 0 0 1 1.036-3.616a3.27 3.27 0 0 1 2.744-1.384a3.12 3.12 0 0 1 2.61 1.321a5.64 5.64 0 0 1 1 3.484a5.76 5.76 0 0 1-1.035 3.586"/>',
  },
  yahoo: {
    viewBox: "0 0 32 32",
    color: "#6001d2",
    body: '<path fill="currentColor" d="M18.011 32s-1.12-.203-2.021-.203c-.812 0-2.031.203-2.031.203l.255-13.593C12.323 15.146 6.782 5.214 3.323 0c1.74.396 2.469.369 4.219 0l.027.047c2.203 3.901 5.572 9.339 8.421 14.052C18.803 9.47 23.23 2.24 24.427 0c1.36.36 2.729.344 4.251 0c-1.599 2.156-7.423 12.229-10.937 18.407L18.001 32z"/>',
  },
  icloud: {
    viewBox: "0 0 24 24",
    color: "#3693f3",
    body: '<path fill="currentColor" d="M13.762 4.29a6.51 6.51 0 0 0-5.669 3.332 3.571 3.571 0 0 0-1.558-.36 3.571 3.571 0 0 0-3.516 3A4.918 4.918 0 0 0 0 14.796a4.918 4.918 0 0 0 4.92 4.914 4.93 4.93 0 0 0 .617-.045h14.42c2.305-.272 4.041-2.258 4.043-4.589v-.009a4.594 4.594 0 0 0-3.727-4.508 6.51 6.51 0 0 0-6.511-6.27z"/>',
  },
  openai: {
    viewBox: "0 0 256 260",
    color: undefined,
    body: '<g fill="currentColor"><path d="M239.184 106.203a64.72 64.72 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.72 64.72 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.67 64.67 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.77 64.77 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483m-97.56 136.338a48.4 48.4 0 0 1-31.105-11.255l1.535-.87l51.67-29.825a8.6 8.6 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601M37.158 197.93a48.35 48.35 0 0 1-5.781-32.589l1.534.921l51.722 29.826a8.34 8.34 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803M23.549 85.38a48.5 48.5 0 0 1 25.58-21.333v61.39a8.29 8.29 0 0 0 4.195 7.316l62.874 36.272l-21.845 12.636a.82.82 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405zm179.466 41.695l-63.08-36.63L161.73 77.86a.82.82 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.54 8.54 0 0 0-4.4-7.213m21.742-32.69l-1.535-.922l-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.72.72 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391zM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87l-51.67 29.825a8.6 8.6 0 0 0-4.246 7.367zm11.868-25.58L128.067 97.3l28.188 16.218v32.434l-28.086 16.218l-28.188-16.218z"/></g>',
  },
  anthropic: {
    viewBox: "0 0 256 176",
    color: undefined,
    body: '<path fill="currentColor" d="m147.487 0l70.081 175.78H256L185.919 0zM66.183 106.221l23.98-61.774l23.98 61.774zM70.07 0L0 175.78h39.18l14.33-36.914h73.308l14.328 36.914h39.179L110.255 0z"/>',
  },
}
export function isBrand(value: string): value is Brand {
  return value in marks
}
// Which provider a connected mailbox belongs to, from its reading server.
export function mailBrand(status: MailStatus): Brand | null {
  if (!status.configured) return null
  const preset = (Object.keys(mailPresets) as MailPreset[]).find(
    (p) => p !== "other" && mailPresets[p].imapHost === status.imapHost
  )
  return preset && isBrand(preset) ? preset : null
}
export function BrandIcon({
  brand,
  size = 20,
  className = "",
}: {
  brand: Brand
  size?: number
  className?: string
}) {
  // Gradient ids are made unique per icon so repeated marks don't clash.
  const prefix = useId().replace(/:/g, "")
  const mark = marks[brand]
  return (
    <svg
      className={`brand-icon ${className}`}
      width={size}
      height={size}
      viewBox={mark.viewBox}
      style={mark.color ? { color: mark.color } : undefined}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{
        __html: mark.body.replace(/ID(\d)/g, `${prefix}-$1`),
      }}
    />
  )
}
