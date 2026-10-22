"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Eye, EyeOff, LoaderCircle } from "lucide-react"
import { request } from "@/lib/http/client"
export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await request("/api/auth/login", "POST", { email, password })
      router.push("/enquiries")
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="login">
      <section className="login-panel">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            f
          </span>
          <span className="brand-name">
            <strong>Fieldquote</strong>
            <span>For groundworks and landscaping firms</span>
          </span>
        </div>
        <div>
          <h1>Enquiry in. Quote checked. Then it goes.</h1>
          <p>
            Fieldquote drafts each quote from your own price list. You check the
            scope, fill any gaps and approve it. Nothing reaches a customer
            without you.
          </p>
        </div>
        <div className="login-strata" aria-hidden="true">
          <div className="layer layer-blocks" style={{ height: 26 }} />
          <div className="layer layer-type1" style={{ height: 46 }} />
          <div className="layer layer-membrane" style={{ height: 6 }} />
          <div className="layer layer-dig" style={{ height: 30 }} />
        </div>
      </section>
      <main className="login-main">
        <form className="login-form" onSubmit={submit}>
          <h2>Sign in</h2>
          <p>Use the login your company owner gave you.</p>
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={!configured}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              Password
            </label>
            <div className="secret">
              <input
                id="password"
                className="input"
                type={visible ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                minLength={8}
                required
                disabled={!configured}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={visible ? "Hide password" : "Show password"}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          {error && (
            <div className="alert alert-error" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              <div>{error}</div>
            </div>
          )}
          {!configured && (
            <div className="alert alert-info">
              <div>
                <strong>Sign-in isn’t set up on this server.</strong>
                Set DATABASE_URL, then run the migration and seed scripts.
              </div>
            </div>
          )}
          <button
            className="btn btn-primary btn-full"
            disabled={busy || !configured}
          >
            {busy ? (
              <>
                <LoaderCircle size={17} className="spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
          <p className="login-alt">
            No account? Ask the person who runs your company’s workspace.
          </p>
        </form>
      </main>
    </div>
  )
}
