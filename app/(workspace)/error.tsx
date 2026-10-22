"use client"
import Link from "next/link"
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="loader" role="alert">
      <h1>The workspace didn’t load</h1>
      <p>
        The database may be unreachable. Check the connection, and that the
        migration and seed have been run, then try again.
      </p>
      <div className="loader-actions">
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <Link className="btn btn-secondary" href="/login">
          Sign in again
        </Link>
      </div>
    </div>
  )
}
