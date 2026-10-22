# Fieldquote

A quoting workspace for small groundworks companies, built for the Aquilon take-home. A customer's email goes in; an AI model reads what they're asking for; the company's own price list and rules produce the draft; a person checks it, approves it and sends it from the company's own mailbox. The AI never sets a price and nothing reaches a customer without a person approving it.

**Live app:** https://aquilon-tech.vercel.app/ (test logins are supplied separately)

| Guide | What's in it |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Running it from scratch: tools, database, environment, seeding, deploying, troubleshooting |
| [docs/TESTING.md](docs/TESTING.md) | Every automated test suite, how to debug one, and a hands-on test plan |

Built with Next.js (App Router), TypeScript, plain Postgres (no ORM), and Anthropic or OpenAI chosen per company.

## How it works

1. **An enquiry comes in.** In **New quote**, pick an email from the connected inbox, or paste or type one. Three supplied enquiries are built in as samples.
2. **The AI reads it.** The email goes to the company's chosen model with that company's own key. The model returns a fixed structure: the work asked for, sizes, access notes, customer details, and the exact wording each item came from.
3. **Code prices it.** Code maps the work onto the build-ups Dave described, picks rates from the company's price list, converts units, rounds waste to full loads, adds site setup, applies the minimum charge and VAT.
4. **Anything uncertain is flagged.** Unknown prices stay blank, estimates are labelled, and jobs that need a visit get no price. Each flag must be resolved before approval.
5. **A person approves.** Dave or Shaz reviews, edits and approves. Any later edit clears the approval.
6. **It's sent.** The approved quote is emailed from the company's own address after a confirmation showing exactly what goes out. The customer sees priced items and totals only, never internal notes. Each send is recorded on the quote.

## What the AI decides, and what it doesn't

| The AI does | Code or a person does |
| --- | --- |
| Reads the email and lists the work requested | Chooses which rates apply and every price |
| Pulls out sizes, as written (feet, metres, "about two cars") | Converts units and estimates areas from configured rules |
| Notes access, existing features and customer details | Applies setup, minimum charge, VAT and rounding |
| Quotes the wording behind each item, so a reviewer can check it | Decides what needs a site visit, what's excluded and what's flagged |
| | Approves (a person, always) and sends (a person, always) |

This is enforced by the shape of the data, not by asking the model nicely. The model's output schema has no fields for prices, totals, discounts, approval or company, and it's validated strictly, so a response that tries to add them is rejected. The model only sees the current company's price list descriptions, never prices, other customers, credentials or other companies' data. Every priced draft also carries a blocking "check the scope" item, so a valid AI response is still only a proposal.

The Kestrel Row sample shows why this matters. It hides an instruction to give a 40% discount, waive the minimum and approve automatically. Fieldquote keeps the text as evidence, flags it, and none of it can change the quote, because the model has nothing it could change.

**Emails are read when someone clicks, not automatically.** I chose this over reading every incoming email in the background. Dave asked that nothing goes out without one of them looking at it, so a person starts the process as well as finishing it. It also means newsletters and personal mail are never sent to the AI or charged to the company's key. Each email can become one quote at most.

## Handling the gaps and the mess in the brief

The brief's price sheet and enquiries were deliberately untidy. Before building, I sent one email of questions to Dave and Shaz, and their answers became rules in code.

**Price list clean-up (Shaz's answers)**
- Duplicate prices: BP01 £62/m² is current and BP02 is the old one. Type 1 by area uses SB01 £18.40/m²; loose by the tonne uses SB03 £41 (SB02 is old). Kerbs use KB01 £28/m. Old prices stay visible as "Old price" but are never used for drafts.
- PT01 was the only VAT-inclusive price: £85 becomes £70.83 ex VAT, and the original value is kept in its notes.
- A "TBC" price never becomes £0. CO02's unit is unclear, so it's kept out of automatic pricing until checked.

**Pricing rules (Dave's answers)**
- Block drive: dig to about 250 mm (EX01, plus EX02 for extra depth), 150 mm Type 1, membrane, then BP01, with KB01 on open edges. Patios and tarmac follow the same pattern with their own surface.
- Waste: one skip up to about 6 m³; above that, 8-wheeler loads of about 10 m³, rounded up to full loads.
- Site setup (PL02, £150) on every job. The £450 minimum is a top-up to £450 ex VAT, not a charge on every job. VAT is 20%, calculated once on the total.
- No waste percentage, travel charge or access surcharge is invented. Hard access is flagged for Dave instead of priced.
- Only Dave sets or changes prices, including filling in a missing one, and he must give a reason. Nobody has special rates. Kestrel Row's 30-day terms come from the customer list.
- Quotes are valid for 30 days from approval.

**Work it won't price**
- Dropped kerbs are excluded, with a note to apply to the council. An *existing* dropped kerb isn't new work and doesn't block a quote.
- Car parks, big commercial jobs and anything over about 150 m² get no price at all, just "needs a site visit". After the visit, Dave records what he found and prices it.
- Resin goes to Dave. Soakaways (perc test) and tarmac overlays (sound base) are flagged.
- Vague sizes like "about two cars" are estimated from a configured bay size (12.5 m²), labelled as estimates, and the quote asks the customer to measure up before confirming.

**Uncertainties left visible on purpose.** The documents don't settle grab capacity, how much dug material bulks up, concrete thickness, digging below an old patio, or every drain connection. The app proposes something sensible where Dave told it how, flags it as provisional, and won't let the quote be approved until a person has looked. BP04 inclusion, possible MI02/SB04 overlap and the overlap between "dig out and remove" and separate waste haulage are flagged instead of being charged twice.

**The three supplied enquiries**
1. **Okafor driveway:** 20 ft × 15 ft becomes 27.87 m². The draft uses the block drive recipe, extra dig depth, one provisional 8-wheeler load and a provisional open-edge length. Moving the outside tap is left unpriced for Dave, and the existing dropped kerb isn't charged.
2. **Greenway car park:** 1,200 m² of commercial work with drainage and phased access. No price, setup or minimum is calculated; it goes to a site visit. The new dropped kerb is excluded.
3. **Kestrel Row patio:** concrete breakout, porcelain, channel drain and a provisional skip and permit, with the gully connection and ground conditions flagged. The hidden discount and auto-approve instruction is ignored and flagged; the invoice contact and 30-day terms are kept.

## Keeping each company's data and keys safe

- **The company always comes from the signed-in user**, never from anything the browser sends. Every page and API call checks the session again; nothing relies on hiding a button.
- **Separation is enforced in the database.** Reads run inside a read-only transaction as a restricted role, `fieldquote_tenant`, with row-level security limiting it to the signed-in user's company. A query that forgets to filter by company still returns nothing from another company. That role can't read logins, sessions or saved keys, and can't write anything. Hosted Postgres admin users often bypass row-level security, which is why reads switch role instead of trusting the connection.
- **Writes recheck everything in SQL:** membership, company, quote version, approval rules and cross-company references. A stale page gets a conflict instead of overwriting newer work.
- **Each company brings its own AI key.** There's no shared key. Keys are checked with the provider (by listing models, which costs nothing), then encrypted with AES-256-GCM using a master key held outside the database. Each ciphertext is bound to its company and provider, so it can't be decrypted for anyone else even if rows are swapped. Only the last four characters are ever shown again. Mailbox app passwords are protected the same way.
- **Mail connections are restricted** to standard mail ports, refuse private and internal network addresses, and connect to the exact address that was checked.
- **Logins:** passwords are hashed with scrypt. Sessions are random 256-bit tokens in `HttpOnly` cookies, and the database stores only a hash of each one. Five wrong passwords lock that email for 15 minutes, and unknown emails take as long to reject as wrong passwords. There's no public sign-up.
- **Requests:** every save must come from the app's own origin as JSON within a size limit, and strict validation rejects unknown fields, so status or company changes can't be slipped into an ordinary edit.
- **Cost and failure limits:** drafting is limited to 10 starts per company per 10 minutes, a second click can't start a duplicate run, provider errors are reported without leaking keys or content, and a failed draft keeps the email so it can be retried.

## Decisions and why

- **Quotes are stored as one versioned record** (lines, flags, rate snapshots and history together) with relational keys for company, enquiry and customer. Every edit is one atomic update with a version check. It keeps the take-home small; reporting across quote lines would justify splitting them out later.
- **Rate snapshots.** Each quote keeps the rates it was drafted with, so changing the price list never rewrites an old quote.
- **Any member of a company can manage its AI key and mailbox.** Shaz runs the office side, so she can connect the mailbox and replace the key; she can't read either back, and replacing a key asks for confirmation. Prices, rates and deleting quotes stay with the owner. If Dave preferred to hold the keys himself, making these owner-only is a small change: the same role check the rates endpoints already use.
- **Every edit clears approval.** It's stricter than strictly needed, but it means the version that goes out is always the version someone approved.
- **One company per login** in this version. The data model already scopes everything by company, so multi-company accounts would mainly be UI.

## Assumptions

- UK VAT at 20%. Amounts round half up to the penny, and VAT is calculated once on the total including any minimum top-up.
- Dug volume is used for waste with no bulking factor, and that's flagged as provisional.
- A car bay is 2.5 m × 5 m when estimating "about N cars".
- A customer is matched by the sender's email address first, not by names mentioned in the body.
- The connected mailbox is a shared office mailbox that the company is happy for the app to read and send from.

## What I'd do next, with a few more days

1. **A real-model evaluation set.** Automated tests use fixed model outputs so they're repeatable and free. Next I'd run a library of enquiries, including awkward and adversarial ones, against each supported model on every change, and score the extractions.
2. **A review queue for new mail.** Show new inbox emails as "waiting to draft" without sending them to the AI until someone clicks, keeping the human start.
3. **A customer-facing quote.** A branded PDF or link the customer can accept, feeding acceptance back into Today.
4. **Owner controls.** An owner-only option for key and mailbox management, and the audit history visible in the app.
5. **Master key rotation.** A command to re-encrypt saved keys and passwords under a new master key.
6. **Price list import.** Upload a new spreadsheet and review the differences before applying them.
7. **Reporting.** Split quote lines into their own table for win rates and margin by job type.
8. **Scale.** Server-side paging and search for large inboxes and quote lists, and stronger sign-in (multi-factor, and rate limiting by network address as well as by email).

## Run it locally

Full steps are in [docs/SETUP.md](docs/SETUP.md). In short, with Node 22, pnpm 10 and Postgres 16:

```bash
pnpm install
cp .env.example .env.local   # then fill it in
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Tests

Details are in [docs/TESTING.md](docs/TESTING.md).

```bash
pnpm test        # 80 unit and database tests; no database needed
pnpm test:e2e    # 16 browser tests against the real app and a seeded database
pnpm typecheck
pnpm lint
pnpm build
```

- **Unit tests** cover pricing, rounding, VAT and the minimum, the three enquiries, approval rules, roles, rate editing, encryption and request checks.
- **Database tests** run the real migrations on an embedded Postgres (PGlite) and prove company separation through the restricted role, including queries with no company filter, blocked direct writes, unreadable credentials, cross-company references and version conflicts.
- **Browser tests** drive Chrome through the real app with the demo logins, using fixed model outputs so they spend no AI credit, and clean up after themselves. The email test runs only with a local test mailbox (`MAIL_TEST=1`), and one test runs only while Greenfield has no mailbox connected.

## Project structure

```text
app/
  (workspace)/         Pages: Today, Quotes, Customers, Rates, Settings
  api/                 HTTP endpoints, authentication, validation, error mapping
  login/               Sign-in
components/workspace/  The interface
features/
  quotes/domain/       Pure quote rules: building, pricing, approval
  quotes/server/       Services and company-scoped database access
  customers/, rates/   Normalising and editing customers and rates
  mail/                Reading the inbox and sending quotes
  settings/            AI key and model management
lib/
  ai/                  Anthropic and OpenAI adapters, prompt, extraction schema
  auth/                Passwords, sessions, the signed-in company
  db/                  Postgres pool, restricted-role reads, owner writes
  mail/                Mail provider presets and connection safety
  security/            Encryption for saved keys and passwords
  http/                Origin checks, request limits, error mapping
db/migrations/         Schema, row-level security, SQL write functions
scripts/               Migrate, seed, rebuild fixtures
data/                  Supplied spreadsheets and enquiries, normalised seed data
tests/                 unit/, integration/, e2e/
```

Pages are Server Components that load data through authenticated services; interactive parts are small client components. Server-only modules are guarded with `server-only`.

## How I used AI tools

I used Claude Code and Codex throughout, as I do day to day.

- **Planning.** They turned the brief and Dave and Shaz's answers into a written plan and a list of business rules. I reviewed and corrected it, so the pricing logic comes from the client, not the model.
- **Tests on the rules first.** Pricing, VAT, minimum charge, approval and company separation were pinned down with tests, and the agents built against them.
- **Parallel work, my decisions.** Agents worked on separate pieces in parallel. I kept the architecture, security model and data design decisions, and reviewed every change before it went in.
- **Checking the real thing.** Browser automation drove the running app to check each screen on desktop and mobile.
- **Documentation.** The agents drafted the setup and testing guides and the screenshot PDFs from the running app; I checked them against the app.

The AI inside the app is kept narrow on purpose: it reads the request, and code handles everything that touches money or approval.
