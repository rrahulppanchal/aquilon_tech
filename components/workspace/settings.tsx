"use client"
import { useEffect, useId, useState } from "react"
import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import {
  Eye,
  EyeOff,
  LoaderCircle,
  Mail,
  Ruler,
  Sparkles,
  Trash2,
} from "lucide-react"
import type { WorkspaceData } from "@/features/quotes/types"
import { request } from "@/lib/http/client"
import { money } from "@/lib/money"
import {
  keyPatterns,
  providerLabels,
  providers,
  suggestedModels,
  type ModelOption,
  type Provider,
} from "@/lib/ai/providers"
import {
  imapPorts,
  mailPresets,
  smtpPorts,
  type MailPreset,
  type MailStatus,
} from "@/lib/mail/presets"
import { ConfirmDialog, PageHeading, useToast } from "./shared"
import { SearchSelect, SelectMenu } from "./select-menu"
import { BrandIcon, isBrand, mailBrand } from "./brand-icon"
type AiStatus = WorkspaceData["key"]
type Status = { on: boolean; text: string }
export function Settings({
  data,
  onKeyChange,
  onMailChange,
}: {
  data: WorkspaceData
  onKeyChange: (status: AiStatus) => void
  onMailChange: (status: MailStatus) => void
}) {
  const sections = [
    { id: "email", label: "Email", icon: Mail },
    { id: "ai", label: "AI", icon: Sparkles },
    { id: "rules", label: "Quoting rules", icon: Ruler },
  ]
  const active = useActiveSection(sections.map((s) => s.id))
  return (
    <>
      <PageHeading
        title="Settings"
        description={`How Fieldquote works for ${data.company.name}. Anyone at the company can change these.`}
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
        <div className="settings-sections">
          <MailSettings
            status={data.mail}
            company={data.company.name}
            onChange={onMailChange}
          />
          <AiSettings data={data} onChange={onKeyChange} />
          <Rules data={data} />
        </div>
      </div>
    </>
  )
}
// Marks the section being read: the last one whose top has passed under
// the bar, or the last section once the page can't scroll any further.
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  const key = ids.join(",")
  useEffect(() => {
    const list = key.split(",")
    function update() {
      const atEnd =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      const passed = list.filter(
        (id) => (document.getElementById(id)?.getBoundingClientRect().top ?? 0) < 140
      )
      setActive(atEnd ? list[list.length - 1] : (passed.at(-1) ?? list[0]))
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [key])
  return active
}
// One choice from a short list, shown as a row of options.
function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: { value: T; label: string; icon?: React.ReactNode }[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="choice-field">
      <span className="label" id={id}>
        {label}
      </span>
      <RadioGroup
        aria-labelledby={id}
        className="choice-row"
        value={value}
        onValueChange={(next) => onChange(next as T)}
        disabled={disabled}
      >
        {options.map((o) => (
          <label key={o.value} className="choice">
            <Radio.Root value={o.value} className="choice-radio">
              <Radio.Indicator className="choice-dot" />
            </Radio.Root>
            {o.icon}
            {o.label}
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}
// A password-style input with a show/hide button.
function SecretInput({
  id,
  noun,
  ...props
}: { id: string; noun: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "id"
>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="secret">
      <input
        id={id}
        className="input"
        type={visible ? "text" : "password"}
        {...props}
      />
      <button
        type="button"
        className="icon-btn"
        aria-label={visible ? `Hide ${noun}` : `Show ${noun}`}
        aria-controls={id}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  )
}
function SectionHead({
  id,
  title,
  purpose,
  status,
}: {
  id: string
  title: string
  purpose: string
  status: Status
}) {
  return (
    <div className="setting-head">
      <div>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{purpose}</p>
      </div>
      <span className={`connection ${status.on ? "on" : ""}`}>
        {status.text}
      </span>
    </div>
  )
}
function guessPreset(status: MailStatus): MailPreset {
  const match = (Object.keys(mailPresets) as MailPreset[]).find(
    (p) => p !== "other" && mailPresets[p].imapHost === status.imapHost
  )
  return match || (status.configured ? "other" : "gmail")
}
function MailSettings({
  status,
  company,
  onChange,
}: {
  status: MailStatus
  company: string
  onChange: (status: MailStatus) => void
}) {
  const toast = useToast()
  const [editing, setEditing] = useState(!status.configured)
  const [preset, setPreset] = useState<MailPreset>(guessPreset(status))
  const [email, setEmail] = useState(status.email)
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState(
    status.username && status.username !== status.email ? status.username : ""
  )
  const [imapHost, setImapHost] = useState(
    status.imapHost || mailPresets.gmail.imapHost
  )
  const [imapPort, setImapPort] = useState<number>(status.imapPort || 993)
  const [smtpHost, setSmtpHost] = useState(
    status.smtpHost || mailPresets.gmail.smtpHost
  )
  const [smtpPort, setSmtpPort] = useState<number>(status.smtpPort || 465)
  const [busy, setBusy] = useState<"save" | "remove" | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [confirmRemove, setConfirmRemove] = useState(false)
  function choose(next: MailPreset) {
    setPreset(next)
    const p = mailPresets[next]
    if (next !== "other") {
      setImapHost(p.imapHost)
      setImapPort(p.imapPort)
      setSmtpHost(p.smtpHost)
      setSmtpPort(p.smtpPort)
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      found.email =
        "Enter the full email address, e.g. office@yourcompany.co.uk."
    if (!status.configured && !password)
      found.password = "Enter the app password."
    if (imapHost.trim().length < 3)
      found.imapHost = "Enter the reading (IMAP) server."
    if (smtpHost.trim().length < 3)
      found.smtpHost = "Enter the sending (SMTP) server."
    setErrors(found)
    setError("")
    if (Object.keys(found).length) {
      document.getElementById(`mail-${Object.keys(found)[0]}`)?.focus()
      return
    }
    setBusy("save")
    try {
      const result = await request<MailStatus>("/api/settings/mail", "PUT", {
        email: email.trim(),
        ...(username.trim() ? { username: username.trim() } : {}),
        ...(password ? { password } : {}),
        imapHost: imapHost.trim(),
        imapPort,
        smtpHost: smtpHost.trim(),
        smtpPort,
      })
      onChange(result)
      setPassword("")
      setEditing(false)
      toast(
        `Connected to ${result.email}. You can pick enquiries from your inbox now.`
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  async function remove() {
    setBusy("remove")
    try {
      const result = await request<MailStatus>(
        "/api/settings/mail",
        "DELETE",
        {}
      )
      onChange(result)
      setEditing(true)
      setPassword("")
      toast("Email disconnected.")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
      setConfirmRemove(false)
    }
  }
  const p = mailPresets[preset]
  const field = (name: string) =>
    errors[name]
      ? { "aria-invalid": true, "aria-describedby": `mail-${name}-error` }
      : {}
  const fieldError = (name: string) =>
    errors[name] && (
      <p className="field-error" id={`mail-${name}-error`}>
        {errors[name]}
      </p>
    )
  return (
    <section className="setting" id="email" aria-labelledby="email-title">
      <SectionHead
        id="email"
        title="Email"
        purpose="Pick enquiries straight from your inbox, and send approved quotes from your own address."
        status={{
          on: status.configured,
          text: status.configured ? "Connected" : "Not connected",
        }}
      />
      {status.configured && !editing ? (
        <div className="setting-summary">
          <div className="summary-mark">
            {mailBrand(status) ? (
              <BrandIcon brand={mailBrand(status)!} size={22} />
            ) : (
              <Mail size={20} aria-hidden="true" />
            )}
          </div>
          <div>
            <strong>{status.email}</strong>
            <p>
              Reads the inbox from {status.imapHost} and sends from{" "}
              {status.smtpHost}.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setEditing(true)}
          >
            Change
          </button>
        </div>
      ) : (
        <form className="setting-form" onSubmit={save} noValidate>
          <ChoiceGroup
            label="Who provides your email?"
            value={preset}
            onChange={choose}
            disabled={!!busy}
            options={(Object.keys(mailPresets) as MailPreset[]).map((key) => ({
              value: key,
              label: mailPresets[key].label,
              icon: isBrand(key) ? (
                <BrandIcon brand={key} size={18} />
              ) : (
                <Mail size={17} aria-hidden="true" />
              ),
            }))}
          />
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="mail-email">
                Email address
              </label>
              <input
                id="mail-email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="office@yourcompany.co.uk"
                disabled={!!busy}
                {...field("email")}
              />
              {fieldError("email")}
            </div>
            <div className="field">
              <label className="label" htmlFor="mail-password">
                App password
              </label>
              <SecretInput
                id="mail-password"
                noun="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  status.configured ? "Leave blank to keep the saved one" : ""
                }
                disabled={!!busy}
                {...field("password")}
              />
              {fieldError("password")}
            </div>
          </div>
          <p className="hint">{p.help}</p>
          <details className="server-details" open={preset === "other"}>
            <summary>Server settings</summary>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="mail-imapHost">
                  Reading server (IMAP)
                </label>
                <input
                  id="mail-imapHost"
                  className="input"
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  placeholder="imap.yourprovider.com"
                  disabled={!!busy}
                  {...field("imapHost")}
                />
                {fieldError("imapHost")}
              </div>
              <div className="field">
                <span className="label">Reading port</span>
                <SelectMenu
                  label="Reading port"
                  className="select-block"
                  value={String(imapPort)}
                  disabled={!!busy}
                  onChange={(v) => setImapPort(Number(v))}
                  options={imapPorts.map((port) => ({
                    value: String(port),
                    label: `${port} ${port === 993 ? "(secure, usual)" : "(upgrades to secure)"}`,
                  }))}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="mail-smtpHost">
                  Sending server (SMTP)
                </label>
                <input
                  id="mail-smtpHost"
                  className="input"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.yourprovider.com"
                  disabled={!!busy}
                  {...field("smtpHost")}
                />
                {fieldError("smtpHost")}
              </div>
              <div className="field">
                <span className="label">Sending port</span>
                <SelectMenu
                  label="Sending port"
                  className="select-block"
                  value={String(smtpPort)}
                  disabled={!!busy}
                  onChange={(v) => setSmtpPort(Number(v))}
                  options={smtpPorts.map((port) => ({
                    value: String(port),
                    label: `${port}${port === 465 ? " (secure)" : port === 587 ? " (upgrades to secure)" : ""}`,
                  }))}
                />
              </div>
              <div className="field span-2">
                <label className="label" htmlFor="mail-username">
                  Login name{" "}
                  <span className="muted">
                    (only if it isn’t your email address)
                  </span>
                </label>
                <input
                  id="mail-username"
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!!busy}
                />
              </div>
            </div>
          </details>
          {error && (
            <div className="alert alert-error" role="alert">
              <div>{error}</div>
            </div>
          )}
          <div className="settings-actions">
            <button type="submit" className="btn btn-primary" disabled={!!busy}>
              {busy === "save" ? (
                <>
                  <LoaderCircle size={16} className="spin" aria-hidden="true" />
                  Checking your mailbox…
                </>
              ) : (
                "Test and save"
              )}
            </button>
            {status.configured && (
              <>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => {
                    setEditing(false)
                    setErrors({})
                    setError("")
                  }}
                  disabled={!!busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-quiet danger-text"
                  onClick={() => setConfirmRemove(true)}
                  disabled={!!busy}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Disconnect
                </button>
              </>
            )}
          </div>
          <p className="fine-print">
            Both servers are checked before anything is saved. The password is
            encrypted and never shown again.
          </p>
        </form>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title="Disconnect this email?"
        confirmLabel="Disconnect"
        tone="danger"
        busy={busy === "remove"}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={remove}
      >
        <p>
          {company} won’t be able to pick enquiries from the inbox or send
          quotes from {status.email} until it’s connected again. Nothing in the
          mailbox is deleted.
        </p>
      </ConfirmDialog>
    </section>
  )
}
function AiSettings({
  data,
  onChange,
}: {
  data: WorkspaceData
  onChange: (status: AiStatus) => void
}) {
  const toast = useToast()
  const status = data.key
  const [editing, setEditing] = useState(!status.configured)
  const [provider, setProvider] = useState<Provider>(
    status.provider || "anthropic"
  )
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState<"key" | "model" | "remove" | null>(null)
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState<"replace" | "remove" | null>(null)
  const [models, setModels] = useState<ModelOption[] | null>(null)
  const [modelsError, setModelsError] = useState("")
  const [model, setModel] = useState(status.model || "")
  const looksValid = keyPatterns[provider].test(key.trim())
  // Load the live model list for the saved key.
  useEffect(() => {
    if (!status.configured) return
    let cancelled = false
    request<{ models: ModelOption[] }>("/api/settings/ai-models")
      .then((result) => {
        if (cancelled) return
        setModels(result.models)
        setModelsError("")
      })
      .catch((e: Error) => {
        if (cancelled) return
        setModels(null)
        setModelsError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [status.configured, status.provider])
  async function saveKey() {
    setError("")
    setBusy("key")
    try {
      const result = await request<{ status: AiStatus; models: ModelOption[] }>(
        "/api/settings/ai-key",
        "PUT",
        { provider, apiKey: key.trim() }
      )
      onChange(result.status)
      setModels(result.models)
      setModel(result.status.model || "")
      setKey("")
      setEditing(false)
      toast(
        `${providerLabels[provider]} connected. Drafts will use ${result.status.model}.`
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
      setConfirm(null)
    }
  }
  // The dropdown saves as soon as a model is picked.
  async function saveModel(next: string) {
    const previous = model
    setModel(next)
    setError("")
    setBusy("model")
    try {
      const result = await request<AiStatus>("/api/settings/ai-key", "PATCH", {
        model: next,
      })
      onChange(result)
      toast(`Drafts will now use ${result.model}.`)
    } catch (e) {
      setModel(previous)
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  async function removeKey() {
    setError("")
    setBusy("remove")
    try {
      const result = await request<AiStatus>(
        "/api/settings/ai-key",
        "DELETE",
        {}
      )
      onChange(result)
      setModels(null)
      setModel("")
      setEditing(true)
      toast("API key removed.")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
      setConfirm(null)
    }
  }
  // Keep the saved model selectable even if the live list hasn't loaded.
  const options: ModelOption[] = (() => {
    const list =
      models || (status.provider ? suggestedModels[status.provider] : [])
    return status.model && !list.some((m) => m.id === status.model)
      ? [{ id: status.model, label: status.model }, ...list]
      : list
  })()
  return (
    <section className="setting" id="ai" aria-labelledby="ai-title">
      <SectionHead
        id="ai"
        title="AI"
        purpose="Reads each enquiry and picks items from your price list. It never sets prices or approves."
        status={{
          on: status.configured,
          text: status.configured
            ? providerLabels[status.provider!]
            : "Not connected",
        }}
      />
      {status.configured && (
        <div className="setting-summary">
          <div className="summary-mark">
            {status.provider ? (
              <BrandIcon brand={status.provider} size={22} />
            ) : (
              <Sparkles size={20} aria-hidden="true" />
            )}
          </div>
          <div className="summary-model">
            <span className="label">Model for new drafts</span>
            <SearchSelect
              label="Model for new drafts"
              placeholder="Search models"
              empty="No model matches that name."
              value={model}
              disabled={!!busy}
              onChange={(next) => {
                if (next !== model) void saveModel(next)
              }}
              options={options.map((m) => ({
                value: m.id,
                label: m.label === m.id ? m.id : `${m.label} (${m.id})`,
              }))}
            />
            <p className="hint">
              {busy === "model"
                ? "Saving…"
                : models === null && !modelsError
                  ? "Loading the models your key can use…"
                  : modelsError
                    ? `Couldn’t load the list: ${modelsError}`
                    : `Key ending ${status.suffix}. Bigger models read tricky emails better; smaller ones are faster and cheaper.`}
            </p>
          </div>
          {!editing && (
            <button
              className="btn btn-secondary"
              onClick={() => setEditing(true)}
            >
              Change key
            </button>
          )}
        </div>
      )}
      {editing && (
        <form
          className="setting-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!looksValid || busy) return
            if (status.configured) setConfirm("replace")
            else void saveKey()
          }}
        >
          <ChoiceGroup
            label="Provider"
            value={provider}
            onChange={(p) => {
              setProvider(p)
              setError("")
            }}
            disabled={!!busy}
            options={providers.map((p) => ({
              value: p,
              label: providerLabels[p],
              icon: <BrandIcon brand={p} size={18} />,
            }))}
          />
          <label className="label key-label" htmlFor="api-key">
            {status.configured ? "New API key" : "API key"}
          </label>
          <SecretInput
            id="api-key"
            noun="key"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setError("")
            }}
            placeholder={provider === "openai" ? "sk-…" : "sk-ant-…"}
            disabled={!!busy}
            aria-describedby="api-key-help"
          />
          <p className="hint" id="api-key-help">
            {key && !looksValid
              ? provider === "openai"
                ? "OpenAI keys start with sk-."
                : "Anthropic keys start with sk-ant-."
              : "Checked with the provider before saving, then encrypted. Never shown again."}
          </p>
          <div className="settings-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!!busy || !looksValid}
            >
              {busy === "key" ? (
                <>
                  <LoaderCircle size={16} className="spin" aria-hidden="true" />
                  Checking key…
                </>
              ) : status.configured ? (
                "Replace key"
              ) : (
                "Save key"
              )}
            </button>
            {status.configured && (
              <>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setEditing(false)}
                  disabled={!!busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-quiet danger-text"
                  disabled={!!busy}
                  onClick={() => setConfirm("remove")}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Remove key
                </button>
              </>
            )}
          </div>
        </form>
      )}
      {error && (
        <div className="alert alert-error setting-alert" role="alert">
          <div>{error}</div>
        </div>
      )}
      <ConfirmDialog
        open={confirm === "remove"}
        title="Remove the API key?"
        confirmLabel="Remove key"
        tone="danger"
        busy={busy === "remove"}
        onCancel={() => setConfirm(null)}
        onConfirm={removeKey}
      >
        <p>
          Existing quotes stay as they are. Nobody can draft a new quote until a
          key is added again.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "replace"}
        title="Replace the saved key?"
        confirmLabel="Check and replace"
        busy={busy === "key"}
        onCancel={() => setConfirm(null)}
        onConfirm={saveKey}
      >
        <p>
          The {status.provider ? providerLabels[status.provider] : ""} key
          ending {status.suffix} is replaced by this {providerLabels[provider]}{" "}
          key for everyone at the company.
        </p>
      </ConfirmDialog>
    </section>
  )
}
function Rules({ data }: { data: WorkspaceData }) {
  const { company } = data
  const rules = [
    ["Minimum charge", `${money(company.minimumPence)} + VAT`],
    ["VAT", `${company.vatPercent}%, shown separately`],
    ["Quotes valid for", `${company.validityDays} days`],
    [
      "Site visit needed",
      `Over ${company.siteVisitAbove} m², car parks, big commercial`,
    ],
    [
      "“About N cars” estimates",
      `${company.carSpaceM2 ?? 12.5} m² per car, then measure up`,
    ],
    [
      "Your role",
      data.user.role === "owner"
        ? "Owner: prices and approves"
        : "Approver: edits work and approves",
    ],
  ]
  return (
    <section className="setting" id="rules" aria-labelledby="rules-title">
      <SectionHead
        id="rules"
        title="Quoting rules"
        purpose={`Set for ${company.name}. Nothing in an email can change them.`}
        status={{ on: true, text: "Always applied" }}
      />
      <dl className="defaults">
        {rules.map(([term, detail]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
