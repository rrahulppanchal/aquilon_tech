"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Menu as AccountMenu } from "@base-ui/react/menu"
import { LogOut, Menu, Settings, X } from "lucide-react"
import type { WorkspaceData } from "@/features/quotes/types"
import { Avatar, ConfirmDialog } from "./shared"
const navItems = [
  { id: "enquiries", label: "Today" },
  { id: "quotes", label: "Quotes" },
  { id: "customers", label: "Customers" },
  { id: "rates", label: "Rates" },
]
export function WorkspaceShell({
  data,
  section,
  quoteId,
  href,
  onLogout,
  children,
  modal,
}: {
  data: WorkspaceData
  section: string
  quoteId?: string
  href: (path: string) => string
  onLogout: () => Promise<void> | void
  children: React.ReactNode
  modal: React.ReactNode
}) {
  const router = useRouter()
  const [mobileNav, setMobileNav] = useState(false)
  // Signing out always asks first, from the account menu or the mobile nav.
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  async function signOut() {
    setSigningOut(true)
    try {
      await onLogout()
    } finally {
      setSigningOut(false)
      setConfirmLogout(false)
    }
  }
  const { quotes } = data
  const current = quoteId ? "quotes" : section
  const waiting = quotes.filter((q) => q.status === "needs_review").length
  const role = data.user.role === "owner" ? "Owner" : "Approver"
  useEffect(() => {
    if (!mobileNav) return
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNav(false)
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [mobileNav])
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href={href("enquiries")}>
            <span className="brand-mark" aria-hidden="true">
              {data.company.initials}
            </span>
            <span className="brand-name">
              <strong>{data.company.name}</strong>
              <span>Fieldquote</span>
            </span>
          </Link>
          <nav className="nav" aria-label="Workspace">
            {navItems.map(({ id, label }) => (
              <Link
                key={id}
                href={href(id)}
                className="nav-link"
                aria-current={current === id ? "page" : undefined}
              >
                {label}
                {id === "quotes" && waiting > 0 && (
                  <span
                    className="nav-count"
                    aria-label={`${waiting} need review`}
                  >
                    {waiting}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="topbar-end">
            <AccountMenu.Root>
              <AccountMenu.Trigger
                className="account-trigger"
                aria-label={`Account: ${data.user.name}, ${role}`}
                title={data.user.name}
                data-current={current === "settings" || undefined}
              >
                <Avatar name={data.user.name} tone="solid" />
              </AccountMenu.Trigger>
              <AccountMenu.Portal>
                <AccountMenu.Positioner
                  className="select-positioner"
                  sideOffset={8}
                  align="end"
                >
                  <AccountMenu.Popup className="select-popup account-popup">
                    <div className="account-card">
                      <Avatar name={data.user.name} size="lg" tone="solid" />
                      <span>
                        <strong>{data.user.name}</strong>
                        <span>
                          {role} at {data.company.name}
                        </span>
                      </span>
                    </div>
                    <AccountMenu.Item
                      className="select-item account-item"
                      onClick={() => router.push(href("settings"))}
                    >
                      <Settings size={16} aria-hidden="true" />
                      Settings
                    </AccountMenu.Item>
                    <AccountMenu.Separator className="account-separator" />
                    <AccountMenu.Item
                      className="select-item account-item account-signout"
                      onClick={() => setConfirmLogout(true)}
                    >
                      <LogOut size={16} aria-hidden="true" />
                      Sign out
                    </AccountMenu.Item>
                  </AccountMenu.Popup>
                </AccountMenu.Positioner>
              </AccountMenu.Portal>
            </AccountMenu.Root>
            <button
              className="icon-btn menu-toggle"
              aria-label={mobileNav ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileNav}
              aria-controls="mobile-nav"
              onClick={() => setMobileNav(!mobileNav)}
            >
              {mobileNav ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        <nav
          id="mobile-nav"
          className="mobile-nav"
          data-open={mobileNav}
          aria-label="Workspace"
          hidden={!mobileNav}
        >
          {[...navItems, { id: "settings", label: "Settings" }].map(
            ({ id, label }) => (
              <Link
                key={id}
                href={href(id)}
                aria-current={current === id ? "page" : undefined}
                onClick={() => setMobileNav(false)}
              >
                {label}
              </Link>
            )
          )}
          <button
            onClick={() => {
              setMobileNav(false)
              setConfirmLogout(true)
            }}
          >
            <LogOut size={18} /> Sign out
          </button>
          <p className="mobile-user">
            Signed in as {data.user.name}, {role.toLowerCase()}
          </p>
        </nav>
      </header>
      <main id="main" className="page" tabIndex={-1}>
        {children}
      </main>
      {modal}
      <ConfirmDialog
        open={confirmLogout}
        title="Sign out of Fieldquote?"
        confirmLabel={signingOut ? "Signing out…" : "Sign out"}
        busy={signingOut}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={signOut}
      >
        <p>
          You’ll need your email and password to sign back in. Changes you
          haven’t saved on this page will be lost.
        </p>
      </ConfirmDialog>
    </>
  )
}
