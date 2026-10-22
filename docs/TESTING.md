# Testing Fieldquote

This guide covers both ways to test Fieldquote: the automated tests you run with one command, and a hands-on test plan for checking the app yourself in the browser. Set the app up first by following [SETUP.md](SETUP.md) as far as step 7.

## Contents

1. [The three kinds of automated test](#1-the-three-kinds-of-automated-test)
2. [Run everything before a pull request](#2-run-everything-before-a-pull-request)
3. [Unit and database tests](#3-unit-and-database-tests)
4. [Browser tests](#4-browser-tests)
5. [Write a new test](#5-write-a-new-test)
6. [Test the app by hand](#6-test-the-app-by-hand)
7. [Before a release](#7-before-a-release)

## 1. The three kinds of automated test

| Kind | Folder | Command | Needs a database? | What it proves |
| --- | --- | --- | --- | --- |
| Unit | `tests/unit/` | `pnpm test` | No | Pricing, approval rules, validation, encryption and request checks give the right answers |
| Database | `tests/integration/` | `pnpm test` | No (uses an embedded Postgres) | The real migrations work and one company can never read or change another's data |
| Browser | `tests/e2e/` | `pnpm test:e2e` | Yes, migrated and seeded | The whole app works end to end, as a person would use it |

`pnpm test` runs the unit and database tests together. They finish in a few seconds.

## 2. Run everything before a pull request

Run these in order. Each one should finish without errors.

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
pnpm test:e2e
```

```bash
pnpm build
```

Expected results:

| Command | What success looks like |
| --- | --- |
| `pnpm typecheck` | No output |
| `pnpm lint` | No errors (warnings are allowed, but don't add new ones) |
| `pnpm test` | `Test Files  4 passed (4)` and `Tests  80 passed (80)` |
| `pnpm test:e2e` | 16 tests: all pass, with up to 2 skipped (see [section 4](#tests-that-skip-themselves)) |
| `pnpm build` | Ends with the list of built routes |

## 3. Unit and database tests

```bash
pnpm test
```

These run with [Vitest](https://vitest.dev). They don't use `.env.local`, don't touch your database and spend no AI credit.

### What they cover

**`tests/unit/quoting.test.ts`: quote rules**

- Measurements and money: converting square feet exactly, rounding pennies half up, applying the minimum charge as a top-up and VAT once.
- Rates: an old rate is marked superseded, a "TBC" price never becomes £0, a suspicious unit is kept out of automatic pricing.
- The three supplied enquiries:
  - Okafor gets a draft with extra digging priced correctly, waste as one lorry load flagged for review, and no invented price for moving the tap.
  - The Greenway car park gets no price at all and is sent for a site visit.
  - Kestrel Row's hidden "40% discount and auto-approve" instruction is ignored, and the invoice contact and payment terms are kept.
- Approval: blocked while items are unresolved or a site visit is needed, cleared by any later edit, rejected when someone else saved first.
- Roles: an approver like Shaz can't set a special price or add priced work.
- Rates editing, plain-language error messages, pricing after a site visit, and the customer email containing priced items only.

**`tests/unit/security.test.ts`: security basics**

- Saved AI keys: encrypted differently each time, can't be read for another company or provider, and tampering is detected.
- Requests: saves from another website are refused, oversized requests are refused, and approval or company fields can't be slipped into an ordinary edit.
- Passwords are salted and checked correctly.

**`tests/integration/database.test.ts`: company separation in the real database**

These run the real migrations against PGlite, an embedded Postgres, and read data the way the app does, through the restricted `fieldquote_tenant` role.

- A company only reads its own rates, customers, enquiries and quotes, even when a query forgets to filter by company.
- Nobody can read logins, sessions or saved keys through the app's read role.
- Quotes can't be edited, approved or moved to another company directly; only the server's own functions can, and they recheck everything.

**`tests/integration/quote-deletion.test.ts`: deleting a quote**

- Deleting removes the quote, its enquiry and its sending history, and keeps an audit record.
- Non-owners, other companies and out-of-date pages can't delete.
- If the audit record fails, nothing is deleted.

### Handy variations

Re-run tests on every save while you work:

```bash
pnpm exec vitest
```

Run one file:

```bash
pnpm exec vitest run tests/unit/quoting.test.ts
```

Run tests whose name matches some words:

```bash
pnpm exec vitest run -t "car park"
```

## 4. Browser tests

```bash
pnpm test:e2e
```

These use [Playwright](https://playwright.dev) to drive Chrome through the real app and database, signing in with the demo logins from `.env.local`.

### Before you run them

1. Finish [SETUP.md](SETUP.md) steps 1–6: database migrated and seeded, with **both** the Hollis and Greenfield logins in `.env.local`. The Shaz login is needed for the role tests.
2. Install Google Chrome. Without it, see [Without Chrome](#without-chrome).
3. You don't need to start the app. The tests start `pnpm dev` themselves, or reuse one already running at `APP_URL`.

### What they do to your data

- They create their own Hollis quotes from the three supplied enquiries, using fixed AI answers stored in the test, so **no AI key or credit is needed**.
- They add test rates with codes starting `E2E`.
- They delete everything they created when they finish.

Run them against a local or test database, not production. If a run is stopped halfway, leftover test quotes may remain; delete them in the app or start a fresh database ([SETUP.md step 14](SETUP.md#14-reset-or-change-the-demo-data)).

### What they cover

| Test | Checks that |
| --- | --- |
| Signed-out visitors | Pages send you to sign in, and the API refuses requests without a session |
| Wrong password | A clear error is shown |
| Today queue | A site-visit job opens with no price |
| Unsaved edits | Leaving a quote with unsaved changes asks first |
| Review and approval | Unknown work can be excluded with a reason, the quote approved, and a later edit clears the approval |
| Owner adds work | A catalogue item added by Dave is still there after reloading |
| Company isolation | Gaz can't see Hollis quotes, rates or customers |
| AI key | Any member can set the key, and drafting waits until one is set |
| Mobile navigation | The menu works on a phone-sized screen with no sideways scrolling |
| Rates | Dave can add, edit and delete a rate; Shaz can't |
| Check notes | A too-short note is flagged next to the box in plain words |
| After a site visit | Dave records what he found and prices the job |
| Email inbox | Connecting a mailbox, scrolling the inbox and previewing an email (only with `MAIL_TEST=1`) |
| List pages | Pagination resets when filters change and works on mobile |
| Deleting a quote | Cancelling keeps it; confirming deletes it for good |
| No mailbox | The inbox tab shows how to connect email and offers pasting instead |

### Tests that skip themselves

Two tests skip unless their setup is in place. That's expected, not a failure.

- **Email inbox** runs only with a local test mailbox. Start it as in [SETUP.md step 10](SETUP.md#with-a-local-test-mailbox-no-real-email-needed), set `MAIL_ALLOW_PRIVATE_HOSTS=true` in `.env.local`, then run:

  ```bash
  MAIL_TEST=1 pnpm test:e2e
  ```

- **No mailbox** runs only while Greenfield has no mailbox connected. Disconnect Greenfield's email in Settings to run it.

### Handy variations

Watch the browser while the tests run:

```bash
pnpm exec playwright test --headed
```

Step through tests in Playwright's visual runner:

```bash
pnpm exec playwright test --ui
```

Run tests whose name matches some words:

```bash
pnpm exec playwright test -g "approval"
```

### When a browser test fails

Playwright saves a screenshot and a trace of every failed test in `test-results/`. Open the report to see what the page looked like at each step:

```bash
pnpm exec playwright show-report
```

Common causes:

| Failure | Fix |
| --- | --- |
| Sign-in fails in every test | The logins in `.env.local` don't match the database. Re-seed, or reset the password (SETUP.md step 14) |
| Saves are blocked as "from another website" | `APP_URL` doesn't match the address the dev server uses |
| Browser can't launch | Chrome isn't installed; see below |
| Times out waiting for the page | The dev server is slow on its first compile; run again, or start `pnpm dev` and load a page first |

### Without Chrome

Install Playwright's own browser:

```bash
pnpm exec playwright install chromium
```

Then remove `channel: "chrome"` from `launchOptions` in `playwright.config.ts`.

## 5. Write a new test

| You're testing | Put it in | Notes |
| --- | --- | --- |
| A pricing, approval or validation rule | `tests/unit/quoting.test.ts` | Call the domain functions in `features/*/domain/` directly. No database or network. |
| Encryption, sessions or request checks | `tests/unit/security.test.ts` | |
| Database rules, company separation or SQL functions | `tests/integration/` | Use the embedded database setup at the top of `database.test.ts`. |
| Something a person does in the app | `tests/e2e/workspace.spec.ts` | Sign in with the `signIn` helper. |

Rules for browser tests:

- Never call a real AI provider. Create quotes with the fixed extractions already in the file.
- Delete everything you create in `test.afterAll`. Prefix test rate codes with `E2E` so the clean-up finds them.
- Find elements the way a person would, by role and visible name, e.g. `page.getByRole("button", { name: "Approve quote" })`, not by CSS class.
- Server code imports `server-only`; the unit test config already swaps it for a harmless stand-in, so you can import server modules directly.

## 6. Test the app by hand

Use this checklist after a big change, before a demo, or to learn how the app behaves. A printable version with screenshots and Pass/Fail boxes is in [hand-test-plan.pdf](hand-test-plan.pdf). Each check says what to do and what you should see. Sign out between logins, or use a private window for the second one.

You need the app running with demo data, and an AI key added for Hollis in Settings for section C.

### A. Signing in and out

- [ ] Open the app while signed out. **Expect:** you land on the sign-in page.
- [ ] Sign in with a wrong password. **Expect:** a clear error, and you stay on the sign-in page.
- [ ] Get the password wrong five times for the same email. **Expect:** that email is locked out for 15 minutes.
- [ ] Sign in as Dave. **Expect:** the Today page, greeting Dave by name.
- [ ] Open the account menu (initials, top right) and choose **Sign out**. **Expect:** a confirmation first, then the sign-in page.

### B. Today page

- [ ] **Expect:** four stage counts (Saved emails, To review, Site visits, To send) with one coloured block per job.
- [ ] Click a stage with jobs. **Expect:** the list below shows only that stage's jobs. Click it again to show all.
- [ ] A stage with no jobs can't be selected.

### C. Drafting from the three sample enquiries

Click **New quote → Paste an email**, pick a sample, then **Draft quote**. Each usually takes under a minute.

- [ ] **Driveway extension (Okafor).** **Expect:** a priced draft for block paving with items marked for checking (edge length, waste, tap relocation). The existing dropped kerb isn't charged as new work.
- [ ] **Car park resurfacing (Greenway).** **Expect:** no price at all, and the job marked as needing a site visit. The new dropped kerb is excluded.
- [ ] **Patio and channel drain (Kestrel Row).** **Expect:** a draft that ignores the email's request for a 40% discount and automatic approval, and flags it. The invoice contact and 30-day payment terms are kept.
- [ ] Close the composer halfway through an unsent draft. **Expect:** it appears on Today as a saved email you can resume.

### D. Reviewing and approving (as Dave)

- [ ] Open a draft. **Expect:** items to check are listed, and **Approve quote** is blocked while any remain.
- [ ] Exclude an item without a reason. **Expect:** you're asked for one.
- [ ] Change a quantity, then try to leave the page. **Expect:** a warning about unsaved changes.
- [ ] Resolve every check, save, then approve. **Expect:** the quote shows as approved, with your name and an expiry 30 days out.
- [ ] Edit the approved quote and save. **Expect:** the approval is cleared and the quote needs approving again.
- [ ] Open the same quote in two tabs, save in one, then save in the other. **Expect:** the second save is refused because the quote changed.

### E. Approver limits (as Shaz)

- [ ] Open a draft. **Expect:** you can change quantities, resolve ordinary checks and approve.
- [ ] Try to change a price or add priced work. **Expect:** it isn't allowed.
- [ ] Open **Rates**. **Expect:** you can view rates but not add, edit or delete them.

### F. Company separation (as Gaz)

- [ ] Sign in as Gaz. **Expect:** only Greenfield Landscaping's quotes, rates and customers; nothing from Hollis.
- [ ] While signed in as Dave, copy a Hollis quote's address from the browser. Sign in as Gaz and open it. **Expect:** it isn't found.

### G. Site visits

- [ ] Open the Greenway car park quote and record what was found on the visit. **Expect:** as Dave, you can then price the remaining items and approve.

### H. Rates and customers

- [ ] As Dave, add a rate, edit its price, then delete it. **Expect:** each change sticks after a reload.
- [ ] Try to save a rate with a missing price or a badly formed code. **Expect:** a plain-language message next to the field to fix.
- [ ] Open **Customers**. **Expect:** the customer list, read-only.

### I. Settings

- [ ] **AI:** add a key with the wrong format. **Expect:** a hint about what the key should start with, and **Save key** stays disabled.
- [ ] **AI:** add a real key. **Expect:** it's checked, saved, and only its last four characters are shown afterwards.
- [ ] **AI:** open the model dropdown and type part of a model name. **Expect:** the list filters as you type, and a long list scrolls inside the dropdown.
- [ ] **AI:** remove the key, then try to draft a quote. **Expect:** drafting asks you to add a key first.
- [ ] **Email:** connect the local test mailbox from [SETUP.md step 10](SETUP.md#10-connect-email-optional). **Expect:** **Test and save** checks both servers before saving, and the provider's logo appears.
- [ ] **Email:** enter a wrong password. **Expect:** a clear error, and nothing is saved.

### J. Email (with a mailbox connected)

- [ ] **New quote → From your inbox.** **Expect:** recent emails, newest first, with more loading as you scroll.
- [ ] Open an email and click **Draft quote from this email**. **Expect:** a draft, and the email is then marked as already quoted.
- [ ] On an approved quote, send it to the customer. **Expect:** a confirmation showing exactly what will be sent and from which address. The email contains priced items and totals only, never internal notes.

### K. Deleting a quote (as Dave)

- [ ] Start deleting a quote, then cancel. **Expect:** it's still there.
- [ ] Delete it and confirm. **Expect:** it's gone, including after a reload.

### L. Phone-sized screens

Use your browser's device mode at about 375px wide, or a real phone.

- [ ] **Expect:** no sideways scrolling on any page.
- [ ] The menu button opens the navigation, including Settings and Sign out.
- [ ] Quote lists, the quote editor and Settings are all usable without zooming.

### M. Security spot checks

- [ ] Signed out, visit an API address directly, such as `/api/rates`. **Expect:** it's refused, with no data shown.
- [ ] Draft the Kestrel Row sample and confirm its hidden instructions changed nothing (see C).
- [ ] Look at the `fieldquote.company_ai_credentials` and `fieldquote.company_mail_accounts` tables in the database. **Expect:** keys and mailbox passwords are stored encrypted, never as plain text.

## 7. Before a release

- [ ] Everything in [section 2](#2-run-everything-before-a-pull-request) passes.
- [ ] The email browser test passes with `MAIL_TEST=1`.
- [ ] All three sample enquiries drafted with a **real** AI key, not just the fixed test answers, and each matches section C.
- [ ] Sections A–M of the hand test plan checked on the deployed site, signed in as Dave, Shaz and Gaz.
- [ ] `APP_URL` on the deployed site matches its real HTTPS address, and saving works.
