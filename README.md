# Fieldquote

A multi-company quoting workspace for the Aquilon take-home. Built with Next.js App Router, TypeScript, plain Postgres, and Anthropic. The application interprets customer enquiries, prepares a rate-based draft, exposes uncertainty, and requires explicit human approval.

## Connect the live application

New to the project? Follow [docs/SETUP.md](docs/SETUP.md) for a step-by-step setup, from installing the tools to seeding, testing and troubleshooting. The summary below is for people who've done it before.

Use Node.js 22+ and pnpm 10. Any Postgres 16+ works (Aiven, Neon, local). All tables live in a dedicated `fieldquote` schema, so the app can share a database with other projects without touching their tables.

1. Copy `.env.example` to `.env.local`.
2. Set `DATABASE_URL`. For hosted Postgres, also set `DATABASE_CA_CERT` to the provider's CA certificate (PEM, newlines escaped as `\n`). Without it the connection is still encrypted, but the server certificate is not verified.
3. Generate the encryption master key and put its output in `ENCRYPTION_KEY`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

4. Set `APP_URL` to the exact origin you use, e.g. `http://localhost:3000`. In production set it to your HTTPS deployment origin. Mutating API calls validate this origin.
5. Fill the Hollis and Greenfield demo emails/passwords in `.env.local`. Passwords must be at least 12 characters. Optionally set Shaz's email/password to create a restricted approver login.
6. Run:

   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

   `db:migrate` applies `db/migrations/*.sql` once each and records them in `fieldquote.schema_migrations`. `db:seed` loads both companies, their separate rate and customer lists, and the demo logins. Both commands are safe to re-run, and existing passwords are never reset. Keep the credentials out of the repository.

7. Run `pnpm dev`, open `/login`, and sign in with one of the seeded accounts.
8. Open **Settings** (any member can do this), choose **Anthropic** or **OpenAI**, and paste the company's API key. The key is checked with the provider by listing its models (no tokens used), then encrypted and stored. Pick the model for drafts from the dropdown, which shows the models that key can actually use.
9. Select one of the supplied enquiries or paste your own. Generate, review, save edits, then approve.

There is no global AI key or model setting. Each company chooses its own provider and model in Settings. The recommended defaults are Claude Opus 5.5 for Anthropic and GPT-5 for OpenAI, used when the account offers them.

### Deploy

Deploy the repository as a Next.js project on Vercel. Set the same runtime environment variables there (`DATABASE_URL`, `DATABASE_CA_CERT`, `ENCRYPTION_KEY`, `APP_URL`), with `APP_URL` matching the actual HTTPS origin. Point it at the already-migrated database. Migration and seeding are separate admin commands, not part of every deployment. Keep `DATABASE_POOL_MAX` small (default 5) on serverless hosting. No application data is stored on the deployment filesystem.

The generation route uses the Node runtime and declares a 60-second maximum duration. The Anthropic request has a 45-second timeout, bounded output tokens, and no automatic retries. Check the selected hosting plan's actual function-duration allowance. Do not configure a shared CDN cache for authenticated routes.

## Email (optional)

In **Settings → Email** anyone at the company can connect the office mailbox: choose Gmail, Outlook, Yahoo, iCloud or Other, and enter the address and an app password. **Test and save** logs in to both the reading (IMAP) and sending (SMTP) servers before anything is stored. The password is encrypted like the AI key.

- **New quote → From your inbox:** recent emails, newest first, loading more as you scroll. Emails already turned into a quote are marked. Open one to read it, then **Draft quote from this email**. Each email can only become one enquiry.
- **Send to customer:** an approved quote can be sent from the connected address after a confirmation showing exactly what goes out. Only priced items and totals are included, never internal notes. Each send is recorded on the quote. Without a mailbox, the quote opens in your own email app or can be copied.
- **Safety:** the server connects only to standard mail ports, and refuses mail servers on private or internal network addresses. It connects to the exact address it checked.

### Testing email locally

```bash
docker run -d --rm --name fieldquote-mailtest -p 127.0.0.1:143:3143 -p 127.0.0.1:2525:3025 -e GREENMAIL_OPTS="-Dgreenmail.setup.test.smtp -Dgreenmail.setup.test.imap -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.users=office:mailtest-pass-123@hollis.test -Dgreenmail.users.login=email" greenmail/standalone:2.1.2
```

Add `MAIL_ALLOW_PRIVATE_HOSTS=true` to `.env.local` (development only; ignored in production), send some mail to `office@hollis.test` on port 2525, then connect with **Other**: `localhost`, reading port 143, sending port 2525. Run the mail browser test with `MAIL_TEST=1 pnpm test:e2e`. Remove the flag afterwards.

## Structure

```text
app/
  (workspace)/         Server pages: overview, quotes, customers, rates, settings
  api/                 HTTP contracts, authentication, validation and error mapping
  login/               Email/password login
components/workspace/
  workspace.tsx        UI orchestration
  workspace-shell.tsx  Navigation and responsive layout
  overview.tsx         Dashboard and quote listing
  enquiry-composer.tsx Enquiry input and sample selection
  quote-editor.tsx     Scope, pricing, review and approval interface
  catalogues.tsx       Read-only normalized rates and customer directory
features/
  quotes/domain/       Pure quote construction, calculations and approval rules
  quotes/server/       Application services and tenant-scoped repositories
  customers/domain/    Customer normalization and sender matching
  rates/domain/        CSV rate normalization
lib/
  ai/                  Anthropic adapter and strict extraction schema
  auth/                Password hashing, sessions, verified tenant context
  db/                  Postgres pool, tenant-role reads, privileged writes
  security/            Authenticated encryption for company API keys
  http/                Request bounds, origin checks, error mapping, fetch helper
db/migrations/         Schema, RLS, transactional generation and quote writes
scripts/               Migrations, CSV fixture generation, idempotent provisioning
data/                  Original supplied fixtures and normalized seed data
tests/                 Domain, HTTP, encryption, Postgres and browser tests
```

Next.js pages are Server Components. Interactive forms are small client entry points. Initial live data is loaded through authenticated services, not by HTTP-calling the application's own API. Server modules have `server-only` guards. The UI, business logic, database queries and AI SDK are separated.

The installed Next.js documentation was checked: App Router `route.ts` endpoints, asynchronous route params, and `proxy.ts` (only sets `no-store` caching; sessions are verified in every page and API call). Authorization is repeated inside every server API/service; it does not rely on hiding a page or button.

## Data and security design

- **Login:** email and password. Passwords are hashed with scrypt and a per-user salt. A successful login creates a random 256-bit session token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production) that lasts 12 hours. The database stores only a SHA-256 hash of the token, so reading the database doesn't let anyone log in. Five failed attempts per email in 15 minutes locks that email out for the rest of the window. Unknown emails take the same time to reject as wrong passwords. There is no public sign-up.
- Each business table carries `company_id`. The company comes from the verified session user's membership, never from a company ID sent by the caller. There is one company per account in this version.
- **Two database identities.** Tenant reads run in a read-only transaction with `SET LOCAL ROLE fieldquote_tenant` and the session user ID set. That role can only `SELECT` business tables, and row-level security limits it to the user's own company, so a query that forgets its company filter still returns nothing from another company. Hosted Postgres admin users often have `BYPASSRLS`, which is why reads switch role instead of relying on the connecting user.
- The tenant role cannot read users, sessions, login records or API-key ciphertext, and it cannot write anything or call the SQL write functions. Server-only writes use the connection's owner role and always filter by the tenant's company.
- SQL quote writes recheck membership, scope, version, approval prerequisites and cross-tenant foreign keys. Edits, version advancement and audit records are atomic. A stale reviewer gets a conflict.
- Quotes are persisted as a versioned JSON aggregate (lines, issues, snapshots and activity) with relational company/enquiry/customer keys. This reduces take-home complexity while keeping each quote update atomic. A larger system could normalize lines/issues for analytics.
- Rate snapshots prevent a catalogue change from rewriting old quote amounts.
- API keys use AES-256-GCM with random nonces and company/provider-bound authenticated context. The master key is held outside the database. Only a masked suffix is returned. Keep a secure backup of the master key; changing it without migrating ciphertext makes saved credentials unreadable.
- Provider failures are sanitized. Unknown exceptions log a request ID only, not request content, credentials or provider payloads.
- Mutations require same-origin JSON and a bounded request body. Zod schemas reject unknown fields, invalid measurements and attempted status/tenant injection.
- Generation is limited to 10 starts per company per 10 minutes in Postgres. A transactional claim prevents concurrent runs for an enquiry; completed runs return the existing quote. A stale processing lease can be retried after two minutes.
- Failed enquiry text stays saved. The overview provides a Resume action, and the composer reuses the saved enquiry ID when retrying unchanged text.
- No emails are sent. Approval creates a recorded internal decision, not an automatic communication.

## What AI can and cannot do

The model extracts requested work, measurements, access conditions, customer details and supporting evidence. It receives only the current tenant's eligible catalogue descriptions and the enquiry. It does not receive stored credentials, the entire customer database, or unrelated tenant data.

The extraction schema has no authoritative rate, total, discount, approval, or company-ID fields. Code chooses configured recipes and catalogue rates, converts units, calculates line amounts, applies the minimum charge and VAT, and checks approval. A valid JSON response is still only a proposal: a blocking scope-review item is present on every priced draft.

The Kestrel sample contains a prompt-injection request for a 40% discount, waived minimum and concealed auto-approval. It is preserved as source text, flagged, and cannot change those protected fields. Security does not depend solely on a prompt or keyword detector.

## Business decisions from Dave and Shaz

- BP01 £62/m² is current; BP02 is old. Installed Type 1 uses SB01 £18.40/m²; loose supply uses SB03 £41/tonne. KB01 £28/m is the current kerb rate.
- PT01 is normalized from £85 including VAT to Shaz's explicitly confirmed £70.83 ex VAT. Rates retain their original source values/notes.
- £450 ex-VAT minimum is a **top-up**, not a charge added to every job. Setup is added once. The second company's minimum and setup differ.
- The assignment uses 20% VAT, consistent with Shaz's clarification. Line amounts round half-up to pennies; VAT is calculated once on subtotal plus any minimum top-up.
- Quotes expire 30 days after approval. Kestrel's 30-day payment terms are separate and do not imply a discount.
- Only the owner may add work items or change a price, including filling an unknown price; a reason is required. Extra catalogue items are validated against the current company’s active rates; manual items remain unpriced until the owner supplies a price. Approvers can edit quantities/scope, resolve ordinary issues, and approve. Owner-only issues remain restricted.
- Unsupported work remains unpriced, never zero-priced. It must be priced or explicitly excluded with an explanation before approval.
- Every edit clears any previous approval. The reviewer must save and then explicitly approve the current version again.
- Car parks, big commercial work and jobs over 150m² receive no price. New dropped kerbs are excluded/referred to the council. An existing kerb that needs no work does not cause a driveway rejection.
- Resin, hard access, overlays and soakaways need the appropriate owner review/conditions. No invented access, travel or waste-percentage surcharge is added.
- Vague sizes such as "about two cars": the model returns only the number of cars. Code estimates the area from a configured bay size (`carSpaceM2`, default 2.5 m × 5 m = 12.5 m²), marks the quote as a provisional estimate, and adds a blocking item to ask the customer to measure up, as Dave asked.

### Deliberately exposed uncertainties

The documents do not establish grab capacity, loose-to-in-place waste conversion, concrete thickness, extra excavation below an old patio, or all drain-connection details. The application flags these. Up to about 6 m³ the draft proposes one skip. Above that it proposes 8-wheeler loads (EX05, about 10 m³ each, rounded up to full loads), following Dave's answer. Both are provisional, use the dug volume with no bulking factor, and carry a blocking review item. Hard-access jobs leave waste unpriced for Dave. The original excavation descriptions mention removal while Dave also lists waste haulage, so review explicitly checks that overlap.

BP04 inclusion and MI02/SB04 duplication are flagged rather than double charged. CO02's uncertain unit is excluded from automatic rate selection. Unknown mixed-scope work must be surfaced as additional unpriced work. All these decisions should remain visible to the human reviewer.

### Supplied enquiry outcomes

1. **Okafor:** 20ft × 15ft = 27.870912m². Draft includes the confirmed block-paving recipe, provisional open-edge length, extra dig depth, one provisional 8-wheeler load for about 6.97 m³ of dig, and review for waste/tap relocation. Existing dropped kerb is not new work. No complete total until unknown scope is resolved.
2. **Greenway:** 1,200m² commercial car park, drainage and phased access require a site visit. No price, setup or minimum is calculated. The new dropped kerb is excluded.
3. **Kestrel:** concrete breakout, porcelain, channel drain and provisional skip/permit; existing-gully connection and subgrade need review. No double topsoil/concrete removal. Invoice contact and 30-day terms preserved. Injected discount/approval instructions are ignored.

## Tests

[docs/TESTING.md](docs/TESTING.md) explains every test suite, how to debug failures, and a step-by-step hand test plan.

```bash
pnpm test          # Domain, encryption, HTTP and embedded Postgres integration
pnpm test:e2e     # Browser tests; uses an installed Chrome by default
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test` requires no external database. PGlite runs the actual migration against embedded Postgres and switches to the real `fieldquote_tenant` role. Tests exercise RLS reads (including queries with no company filter), denied direct writes, unreadable users/sessions/credentials, cross-tenant foreign keys, server transaction guards, unresolved approvals, version conflicts and password hashing.

Playwright runs against the real app and database. It signs in with the seeded demo logins from `.env.local`, creates its own Hollis quotes from the three supplied enquiries (using fixed extractions, so no AI credit is spent) and deletes them afterwards. It covers sign-in and sign-out redirects, the site-visit outcome, the unsaved-changes guard, exclusion and approval with confirmation dialogs, approval cleared by a later edit, owner-added catalogue items, company isolation, AI-key settings for a non-owner, and mobile layout. Install Chrome, or change `playwright.config.ts` to use a Playwright-managed browser (`pnpm exec playwright install chromium`).

Local verification (22 Oct 2026): 66 unit/security/Postgres tests and 9 browser tests passed, and TypeScript, ESLint and the production build passed. A scripted live run against the dev server and a hosted Aiven Postgres passed 29/29 checks:
- login for all three accounts; sessions cleared on logout
- Greenfield cannot read, edit, approve, generate from or list Hollis data
- approval is blocked while blockers remain; a stale version gets a 409
- Shaz cannot change prices or manage the key
- editing an approved quote clears the approval
- the key is stored encrypted and only its suffix is returned
- an invalid key gives a safe `AI_KEY` error and keeps the enquiry for retry

That run used the sample extraction instead of a real model response. **A real Anthropic generation of all three enquiries still has to be run with the reviewer-facing key.**

## Scope and next steps

Implemented: both tenant fixtures, session-based login, secure BYOK, Anthropic and OpenAI adapters with a per-company model choice, normalization, deterministic pricing, quote editing/review/approval, audit trail, retryable enquiries, database policies, responsive UI and tests.

Not part of this build: email delivery, PDF export, public signup, billing, a general CRM, production rate-import/editing UI, multi-company accounts, or an automatic pricing answer for missing business facts. The owner can add, edit and delete rates on the Rates page; codes can’t be renamed, and existing quotes keep the rate they were drafted with. The seed adds rates only for a company that has none, so it never overwrites or restores the owner’s changes. Customers are read-only in the app. Lists are bounded to 100 quotes and 20 unfinished enquiries; pagination is a natural next step.

Before submission: run all three enquiries with a real Anthropic key, deploy, confirm both logins against the deployed app, and record the short walkthrough. Supply the deployed URL, repository, credentials through a private channel, this README, and the recording.

## AI-use disclosure

Codex assisted with translating the brief and clarification email into the implementation plan, building the application, writing the tests, and checking the UI. The app's own Anthropic integration is separately scoped to structured enquiry extraction. The developer should review and understand the implementation and update this disclosure to reflect their own work before submission.
