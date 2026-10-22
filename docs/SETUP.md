# Setting up Fieldquote

This guide takes you from a fresh laptop to a running Fieldquote with demo data, in order. Follow the steps top to bottom the first time. Each step says how to check it worked before you move on.

Fieldquote is a quoting workspace for groundworks companies. A customer emails asking for a driveway or patio, the AI reads the email and drafts a quote from the company's own price list, and a person checks and approves it before anything goes out.

## Who's in the demo

The seed creates two separate companies and up to three logins. You choose the email addresses and passwords yourself in step 4.

| Login | Company | Role | What they can do |
| --- | --- | --- | --- |
| Dave Hollis | Hollis Groundworks | Owner | Everything: prices, rates, approval, settings |
| Shaz (optional) | Hollis Groundworks | Approver | Edit and approve quotes; can't change prices or rates |
| Gaz Morgan | Greenfield Landscaping | Owner | Same as Dave, but only sees Greenfield's data |

The two companies never see each other's quotes, customers or rates. Signing in as Gaz is the quickest way to see that.

## Contents

1. [Install the tools](#1-install-the-tools)
2. [Get the code](#2-get-the-code)
3. [Get a Postgres database](#3-get-a-postgres-database)
4. [Fill in the environment file](#4-fill-in-the-environment-file)
5. [Create the tables](#5-create-the-tables)
6. [Load the demo data](#6-load-the-demo-data)
7. [Start the app and sign in](#7-start-the-app-and-sign-in)
8. [Connect an AI provider](#8-connect-an-ai-provider)
9. [Make your first quote](#9-make-your-first-quote)
10. [Connect email (optional)](#10-connect-email-optional)
11. [Run the checks and tests](#11-run-the-checks-and-tests)
12. [Find your way around the code](#12-find-your-way-around-the-code)
13. [Deploy](#13-deploy)
14. [Reset or change the demo data](#14-reset-or-change-the-demo-data)
15. [Troubleshooting](#15-troubleshooting)

## 1. Install the tools

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | 22 or newer | Everything |
| pnpm | 10 | Installing packages and running scripts |
| Postgres | 16 or newer | The app's data (local or hosted, see step 3) |
| Docker | Any recent | Optional: a local database and a local test mailbox |
| Google Chrome | Any recent | Optional: the browser tests in step 11 |

pnpm ships with Node through Corepack:

```bash
corepack enable
```

Check it worked:

```bash
node -v
```

```bash
pnpm -v
```

You should see `v22` or higher, and `10` or higher.

## 2. Get the code

```bash
git clone <repository-url> fieldquote
```

```bash
cd fieldquote
```

```bash
pnpm install
```

`pnpm install` finishes without errors. A warning about ignored build scripts is expected and safe.

## 3. Get a Postgres database

All of Fieldquote's tables live in their own `fieldquote` schema, so it can share a database with other projects without touching their tables. Pick one option.

### Option A: local Postgres in Docker (quickest)

```bash
docker run -d --name fieldquote-db -p 5432:5432 -e POSTGRES_PASSWORD=fieldquote -e POSTGRES_DB=fieldquote postgres:16
```

Your connection string is:

```text
postgres://postgres:fieldquote@localhost:5432/fieldquote
```

A database on `localhost` connects without TLS, so you don't need a certificate.

### Option B: hosted Postgres (Neon, Aiven, Supabase and similar)

1. Create a database and copy its connection string.
2. Download the provider's CA certificate. You'll put it in `DATABASE_CA_CERT` in step 4. Without it the connection is still encrypted, but the server's identity isn't checked. Always set it in production.

### The database user needs one extra permission

The first migration creates a restricted role called `fieldquote_tenant`. The app switches to that role for every read, and row-level security limits it to the signed-in user's own company. Creating the role needs `CREATEROLE`.

- The local Docker user (`postgres`) already has it.
- Hosted admin users usually have it.
- If step 5 fails with `permission denied to create role`, run this once as an admin, using your app's database user name:

```sql
alter role your_app_user createrole;
```

## 4. Fill in the environment file

Copy the example file. `.env.local` is git-ignored, so your secrets stay on your machine.

```bash
cp .env.example .env.local
```

Open `.env.local` and fill it in:

| Variable | Required | What to put |
| --- | --- | --- |
| `APP_URL` | Yes | The exact address you open in the browser, e.g. `http://localhost:3000`. Every save checks the request came from this address. |
| `DATABASE_URL` | Yes | The connection string from step 3. |
| `DATABASE_CA_CERT` | Hosted databases | The provider's CA certificate on one line, with each line break written as `\n`. Leave empty for a local database. |
| `ENCRYPTION_KEY` | Yes | A random 32-byte key that encrypts saved AI keys and mailbox passwords. Generate it with the command below. |
| `HOLLIS_DEMO_EMAIL` | Yes | Dave's login email. Any address; nothing is sent to it. |
| `HOLLIS_DEMO_PASSWORD` | Yes | Dave's password, at least 12 characters. |
| `GREENFIELD_DEMO_EMAIL` | Yes | Gaz's login email. Must differ from the others. |
| `GREENFIELD_DEMO_PASSWORD` | Yes | Gaz's password, at least 12 characters. |
| `SHAZ_DEMO_EMAIL` | No | Shaz's login email. Leave both Shaz values empty to skip this login. |
| `SHAZ_DEMO_PASSWORD` | No | Shaz's password, at least 12 characters. |
| `DATABASE_POOL_MAX` | No | Maximum database connections. Defaults to 5; keep it small on serverless hosting. |
| `MAIL_ALLOW_PRIVATE_HOSTS` | No | Development only. Set to `true` only while testing with a mailbox on your own machine (step 10). Ignored in production. |

Generate the encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the output into `ENCRYPTION_KEY`.

> **Keep a copy of `ENCRYPTION_KEY` somewhere safe.** If it's lost or changed, every saved AI key and mailbox password becomes unreadable, and each company has to enter them again in Settings.

There is no AI key in this file. Each company adds its own in the app (step 8).

## 5. Create the tables

```bash
pnpm db:migrate
```

This applies each file in `db/migrations/` once, in order, inside its own transaction, and records it in `fieldquote.schema_migrations`. Running it again skips files that are already applied.

Expected output the first time:

```text
apply 001_workspace.sql
apply 002_ai_providers.sql
apply 003_mail.sql
```

## 6. Load the demo data

```bash
pnpm db:seed
```

This creates both companies, their rates and customers, and the demo logins from your `.env.local`. Expected output:

```text
Seeded Hollis Groundworks: 40 rates, 9 customers.
Seeded Greenfield Landscaping: 3 rates, 1 customers.
Login ready: Dave Hollis (owner).
Login ready: Gaz Morgan (owner).
Login ready: Shaz (approver).
```

The Shaz line only appears if you filled in Shaz's email and password.

Re-running it is safe:

- Rates are only added to a company that has none, so it never overwrites rates an owner has changed in the app.
- Customers are only added if missing.
- Existing logins keep their passwords. Changing a password in `.env.local` and re-seeding does **not** reset it (see step 14).

## 7. Start the app and sign in

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You'll land on the sign-in page. Sign in as Dave with the email and password from `.env.local`.

You should see the **Today** page with an empty queue and a **New quote** button.

## 8. Connect an AI provider

Drafting quotes needs an AI key. Each company brings its own, and only that company can use it.

1. Go to **Settings**: click your initials in the top right, then **Settings**.
2. Under **AI**, choose **Anthropic (Claude)** or **OpenAI**.
3. Paste an API key from [console.anthropic.com](https://console.anthropic.com) or [platform.openai.com](https://platform.openai.com).
4. Click **Save key**.

Fieldquote checks the key by listing the models it can use (this costs nothing), then stores it encrypted. Only the last four characters are ever shown again. Afterwards, pick the model for new drafts from the searchable dropdown. Claude Opus 5.5 and GPT-5 are the defaults when the key can use them.

Each company needs its own key. Sign in as Gaz and add one there too if you want to draft Greenfield quotes.

## 9. Make your first quote

1. On **Today**, click **New quote**.
2. Choose **Paste an email** and pick one of the three supplied samples:
   - **Driveway extension** (Okafor): a normal job with a few things to check.
   - **Car park resurfacing** (Greenway): too big to price from an email, so it asks for a site visit.
   - **Patio and channel drain** (Kestrel Row): includes a hidden instruction to give a 40% discount and auto-approve. Fieldquote flags it and ignores it.
3. Click **Draft quote**. It usually takes under a minute.
4. Open the quote, work through the items marked for checking, save, then click **Approve quote**.

Things worth knowing:

- The AI only proposes the scope of work. Prices, VAT, the minimum charge and approval are all worked out by code from the company's own rates.
- Any edit clears an earlier approval, so the latest version is always the one approved.
- Only owners can change prices. Signing in as Shaz shows the approver's view.

## 10. Connect email (optional)

With a mailbox connected, you can start quotes from real inbox emails and send approved quotes from the company's own address.

### With a real mailbox

1. **Settings → Email**, choose your provider (Gmail, Outlook / Microsoft 365, Yahoo, iCloud or Other).
2. Enter the address and an **app password**, not your normal password. The hint under the field says where your provider keeps app passwords.
3. Click **Test and save**. Fieldquote signs in to both the reading (IMAP) and sending (SMTP) servers before saving anything.

### With a local test mailbox (no real email needed)

Start a throwaway mail server in Docker:

```bash
docker run -d --rm --name fieldquote-mailtest -p 127.0.0.1:143:3143 -p 127.0.0.1:2525:3025 -e GREENMAIL_OPTS="-Dgreenmail.setup.test.smtp -Dgreenmail.setup.test.imap -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.users=office:mailtest-pass-123@hollis.test -Dgreenmail.users.login=email" greenmail/standalone:2.1.2
```

1. Add `MAIL_ALLOW_PRIVATE_HOSTS=true` to `.env.local` and restart `pnpm dev`. Normally Fieldquote refuses to connect to mail servers on your own machine or private network.
2. Send a few test emails to `office@hollis.test` through `localhost` port `2525`.
3. In **Settings → Email**, choose **Other** and enter:
   - Email address: `office@hollis.test`
   - App password: `mailtest-pass-123`
   - Server settings: reading server `localhost`, reading port `143`, sending server `localhost`, sending port `2525`
4. Click **Test and save**. **New quote → From your inbox** now lists your test emails.

Remove `MAIL_ALLOW_PRIVATE_HOSTS` when you're done, and stop the mail server:

```bash
docker stop fieldquote-mailtest
```

## 11. Run the checks and tests

Run these before you open a pull request:

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

```bash
pnpm build
```

- `pnpm test` runs the unit, security and database tests. It needs **no** database of your own: it runs the real migrations against an embedded Postgres (PGlite), including the row-level security checks.
- `pnpm format` tidies code with Prettier.

For what each test covers, how to debug a failing one, and a hands-on test plan for checking the app in the browser, see [TESTING.md](TESTING.md).

### Browser tests

```bash
pnpm test:e2e
```

These drive the real app with the demo logins from `.env.local`, so steps 4–6 must be done first. They start `pnpm dev` themselves, or reuse one already running. They create their own Hollis quotes from the three sample enquiries using fixed AI answers, so they spend no AI credit, and they delete those quotes afterwards.

They use your installed Chrome. Without Chrome, install Playwright's browser and change `channel: "chrome"` in `playwright.config.ts`:

```bash
pnpm exec playwright install chromium
```

The email browser test only runs when asked, with the local test mailbox from step 10 running:

```bash
MAIL_TEST=1 pnpm test:e2e
```

## 12. Find your way around the code

```text
app/
  (workspace)/         Pages: Today, Quotes, Customers, Rates, Settings
  api/                 HTTP endpoints: sign-in, validation, error mapping
  login/               Sign-in page
components/workspace/  The interface (shell, Today, quote editor, settings…)
features/
  quotes/domain/       Pure quote rules: building, pricing, approval
  quotes/server/       Services and company-scoped database access
  rates/, customers/   Normalising the supplied CSVs
lib/
  ai/                  Anthropic and OpenAI adapters, extraction schema
  auth/                Passwords, sessions, the signed-in company
  db/                  Postgres pool and the tenant-role reads
  mail/                Mail provider presets, IMAP and SMTP
  security/            Encryption for saved keys and passwords
db/migrations/         SQL schema, row-level security, write functions
scripts/               migrate, seed, rebuild fixtures
data/                  Supplied CSVs and enquiries, plus generated seed.json
tests/                 unit/, integration/, e2e/
docs/                  This guide, the testing guide and the hand test plan
```

Start with `features/quotes/domain/` to see how a quote is priced, and `README.md` for the business decisions and security design.

> **This project uses Next.js 16**, which changes some APIs and conventions from earlier versions. Read the matching guide in `node_modules/next/dist/docs/` before writing Next.js code.

## 13. Deploy

Fieldquote deploys as a standard Next.js project, for example on Vercel.

1. Run `pnpm db:migrate` and `pnpm db:seed` once against the production database from your machine. These are admin commands, not part of every deploy.
2. In the host's settings, set `DATABASE_URL`, `DATABASE_CA_CERT`, `ENCRYPTION_KEY` and `APP_URL`. `APP_URL` must be the real HTTPS address, e.g. `https://fieldquote.example.com`.
3. Keep `DATABASE_POOL_MAX` small (the default 5 is fine) on serverless hosting.
4. Don't put a shared CDN cache in front of signed-in pages.

Drafting a quote can take up to two minutes on a slow model. Check your hosting plan allows functions to run that long.

## 14. Reset or change the demo data

### Change a demo password

Re-seeding never changes an existing password. To reset one, delete that user, then seed again:

```sql
delete from fieldquote.users where email = 'dave@example.com';
```

```bash
pnpm db:seed
```

### Change the supplied rates, customers or enquiries

1. Edit the files in `data/fixtures/` (`rates.csv`, `customers.csv`, `enquiries/*.txt`).
2. Rebuild the normalised seed file:

```bash
pnpm fixtures:build
```

3. Commit both your edits and the regenerated `data/seed.json`.

New customers are added the next time you seed. Rates only load into a company that has none, so to reload rates, start from an empty database (below).

### Start again from an empty database

> **Warning:** this permanently deletes every Fieldquote company, login, quote and saved key in that database. Only do this on a local or throwaway database.

```sql
drop schema fieldquote cascade;
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

## 15. Troubleshooting

| What you see | Why | Fix |
| --- | --- | --- |
| Sign-in page says "Sign-in isn't set up on this server" | `DATABASE_URL` is empty or wasn't loaded | Fill it in `.env.local`, then restart `pnpm dev` |
| `Server configuration missing: DATABASE_URL` from a script | The script can't find `.env.local` | Run scripts from the project folder, with `.env.local` in it |
| `permission denied to create role` during migrate | The database user lacks `CREATEROLE` | See [step 3](#the-database-user-needs-one-extra-permission) |
| `Missing HOLLIS_DEMO_EMAIL…` during seed | A required login is empty | Fill both Hollis and Greenfield values in `.env.local` |
| `Demo passwords must have at least 12 characters.` | A demo password is too short | Use 12 or more characters |
| `Use a distinct email address for every demo account.` | Two logins share an email | Give each login its own address |
| Saving anything fails with "This request came from another website, so it was blocked." | The browser address doesn't match `APP_URL`, e.g. `127.0.0.1` vs `localhost` | Open the exact `APP_URL`, or change `APP_URL` to match and restart |
| `ENCRYPTION_KEY must be 32 bytes encoded as base64` | The key is missing, cut short or hand-typed | Generate a new one with the command in step 4 |
| A saved AI key or mailbox stops working after changing machines | `ENCRYPTION_KEY` is different from the one used to save it | Restore the original key, or re-enter the AI key and mailbox in Settings |
| `pnpm dev` says another `next dev` server is already running | A dev server from earlier is still going | Use the address it prints, or stop that process |
| Hosted database: certificate or TLS error | `DATABASE_CA_CERT` is wrong or has real line breaks | Put the whole PEM on one line with `\n` between lines |
| Browser tests can't launch the browser | Chrome isn't installed | Install Chrome, or follow the Playwright steps in step 11 |
| Test mailbox: "connection refused" or blocked server | Private hosts aren't allowed, or the container isn't running | Set `MAIL_ALLOW_PRIVATE_HOSTS=true`, restart `pnpm dev`, check `docker ps` |
