import { test, expect, type Locator, type Page } from "@playwright/test"
import pg from "pg"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { poolConfig } from "../../lib/db/config"
import { buildQuote } from "../../features/quotes/domain/build-quote"
import { matchCustomer } from "../../features/customers/domain/matching"
import { getSeed, sampleExtractions } from "../../data/demo"

// Quotes are created directly from the supplied enquiries with fixed
// extractions, so these tests never spend AI credit. Everything they create is
// removed afterwards.
const files = [
  "1-okafor-driveway.txt",
  "2-greenway-car-park.txt",
  "3-kestrel-row-patio.txt",
]
const quoteIds: string[] = []
const enquiryIds: string[] = []
const hollis = getSeed().company.id
let db: pg.Client
test.beforeAll(async () => {
  db = new pg.Client(poolConfig())
  await db.connect()
  const dave = (
    await db.query("select id from fieldquote.users where email=$1", [
      process.env.HOLLIS_DEMO_EMAIL!.toLowerCase(),
    ])
  ).rows[0].id
  const seed = getSeed()
  for (const [i, file] of files.entries()) {
    const text = readFileSync(`data/fixtures/enquiries/${file}`, "utf8")
    const enquiry = (
      await db.query(
        "insert into fieldquote.enquiries(company_id, raw_text) values($1,$2) returning id",
        [hollis, text]
      )
    ).rows[0].id
    enquiryIds.push(enquiry)
    const quote = buildQuote({
      ...seed,
      id: randomUUID(),
      enquiryId: enquiry,
      text,
      extraction: sampleExtractions[i],
      customer: matchCustomer(text, seed.customers),
    })
    quote.title = `${quote.title} [e2e]`
    await db.query("select fieldquote.save_quote($1,$2,$3,null)", [
      hollis,
      dave,
      JSON.stringify(quote),
    ])
    quoteIds.push(quote.id)
  }
})
test.afterAll(async () => {
  await db.query(
    "delete from fieldquote.audit_events where entity_id = any($1) or entity_id = any($2)",
    [quoteIds, enquiryIds]
  )
  await db.query("delete from fieldquote.quotes where id = any($1::uuid[])", [
    quoteIds,
  ])
  await db.query(
    "delete from fieldquote.enquiries where id = any($1::uuid[])",
    [enquiryIds]
  )
  await db.query(
    "delete from fieldquote.rates where company_id=$1 and code like 'E2E%'",
    [hollis]
  )
  await db.end()
})
async function signIn(page: Page, prefix: "HOLLIS" | "GREENFIELD" | "SHAZ") {
  await page.goto("/login")
  await page.getByLabel("Email").fill(process.env[`${prefix}_DEMO_EMAIL`]!)
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env[`${prefix}_DEMO_PASSWORD`]!)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL(/\/enquiries$/)
}
// Picks an option from one of the app's styled dropdowns (SelectMenu).
async function choose(
  page: Page,
  scope: Page | Locator,
  label: string,
  option: string
) {
  await scope.getByRole("combobox", { name: label, exact: true }).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}
const okafor = () => quoteIds[0]
const greenway = () => quoteIds[1]
const kestrel = () => quoteIds[2]

test("signed-out visitors are sent to sign in and APIs refuse them", async ({
  page,
  request,
}) => {
  await page.goto("/enquiries")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("link", { name: /sample/i })).toHaveCount(0)
  const response = await request.get(`/api/quotes/${randomUUID()}`)
  expect(response.status()).toBe(401)
  const preview = await request.get("/preview")
  expect(preview.status()).toBe(404)
})
test("a wrong password shows a clear error", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.com`)
  await page.getByLabel("Password", { exact: true }).fill("not-the-password")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.locator(".alert-error")).toContainText("Unable to sign in")
})
test("today queue opens an unpriced site visit", async ({ page }) => {
  await signIn(page, "HOLLIS")
  await expect(
    page.getByRole("heading", { level: 1, name: /, Dave\.$/ })
  ).toBeVisible()
  await page
    .getByRole("link", { name: /^Rushall Manor car park resurfacing \[e2e\]/ })
    .click()
  await expect(
    page.getByRole("heading", { name: "A site visit comes first" })
  ).toBeVisible()
  await expect(
    page.getByText("No ballpark, minimum charge, or setup cost has been added.")
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Approve quote", exact: true })
  ).toHaveCount(0)
  expect(page.url()).toContain(greenway())
})
test("leaving with unsaved edits asks first", async ({ page }) => {
  await signIn(page, "HOLLIS")
  await page.goto(`/quotes/${okafor()}`)
  await page
    .getByRole("row", { name: /Excavate & cart/ })
    .getByRole("button", { name: "Add note" })
    .click()
  await page
    .getByRole("textbox", { name: /Note for Excavate & cart/ })
    .fill("Unsaved note")
  await expect(page.getByText("You have unsaved changes")).toBeVisible()
  await page.getByRole("button", { name: "Quotes", exact: true }).click()
  const leave = page.getByRole("dialog", { name: "Leave without saving?" })
  await expect(leave).toBeVisible()
  await expect(
    leave.getByRole("button", { name: "Keep editing" })
  ).toBeFocused()
  await leave.getByRole("button", { name: "Keep editing" }).click()
  await expect(leave).toBeHidden()
  await expect(
    page.getByRole("textbox", { name: /Note for Excavate & cart/ })
  ).toHaveValue("Unsaved note")
})
test("review, exclude unknown work, approve, then an edit clears approval", async ({
  page,
}) => {
  await signIn(page, "HOLLIS")
  await page.goto(`/quotes/${okafor()}`)
  for (const row of await page.locator(".lines tbody tr").all()) {
    const rate = row.getByRole("spinbutton", { name: /Rate for/ })
    if ((await rate.inputValue()) === "") {
      await row.getByRole("checkbox", { name: "Leave this out" }).check()
      await row
        .getByRole("textbox", { name: /Note for/ })
        .fill("Customer agreed this item is excluded from scope.")
    }
  }
  for (const resolution of await page
    .getByRole("textbox", { name: /Resolution:/ })
    .all())
    await resolution.fill(
      "Confirmed dimensions, method and scope with customer."
    )
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  const approve = page.getByRole("button", {
    name: "Approve quote",
    exact: true,
  })
  await expect(approve).toBeEnabled()
  await approve.click()
  await page
    .getByRole("dialog", { name: "Approve this quote?" })
    .getByRole("button", { name: "Yes, approve quote" })
    .click()
  await expect(
    page.getByRole("button", { name: "Approved", exact: true })
  ).toBeDisabled()
  // With a connected mailbox there's a Send button plus an "open in my email app" link.
  const email = page.getByRole("link", {
    name: /Email to Patience|Open in my email app instead/,
  })
  await expect(email).toHaveAttribute("href", /^mailto:patience/)
  await expect(email).toHaveAttribute("href", /Total%20including%20VAT/)
  await page.reload()
  await expect(page.locator(".stamp")).toContainText("Approved by Dave Hollis")
  await page
    .getByRole("row", { name: /Excavate & cart/ })
    .getByRole("button", { name: "Add note" })
    .click()
  await page
    .getByRole("textbox", { name: /Note for Excavate & cart/ })
    .fill("Updated scope note after approval.")
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  await page
    .getByRole("dialog", { name: "Save and clear the approval?" })
    .getByRole("button", { name: "Save and clear approval" })
    .click()
  await expect(approve).toBeEnabled()
})
test("owner adds catalogue work and it survives a reload", async ({ page }) => {
  await signIn(page, "HOLLIS")
  await page.goto(`/quotes/${kestrel()}`)
  await expect(
    page.getByText("Email asked for a discount or approval: ignored")
  ).toBeVisible()
  const picker = page.getByRole("combobox", {
    name: "Add confirmed work to the scope",
  })
  await picker.fill("reduce lev")
  await page.getByRole("option", { name: /Excavate to reduce levels/ }).click()
  const qty = page.getByRole("spinbutton", {
    name: "Quantity for Excavate to reduce levels",
    exact: true,
  })
  await qty.fill("2")
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true })
  ).toBeDisabled()
  await page.reload()
  await expect(qty).toHaveValue("2")
})
test("another company can't see Hollis quotes, rates or customers", async ({
  page,
}) => {
  await signIn(page, "GREENFIELD")
  await expect(
    page.getByRole("heading", { level: 1, name: /, Gaz\.$/ })
  ).toBeVisible()
  await expect(page.getByText(/\[e2e\]/)).toHaveCount(0)
  const response = await page.request.get(`/api/quotes/${okafor()}`)
  expect(response.status()).toBe(404)
  await page.goto("/rates")
  await expect(page.getByText("Premium turf supply & lay")).toBeVisible()
  await expect(page.getByText("BP01", { exact: true })).toHaveCount(0)
})
test("any member can set the AI key; drafting waits until one is set", async ({
  page,
}) => {
  await signIn(page, "SHAZ")
  await page.goto("/settings")
  const changeKey = page.getByRole("button", { name: "Change key" })
  if (await changeKey.isVisible()) await changeKey.click()
  await page.getByRole("radio", { name: "OpenAI" }).check()
  const key = page.getByLabel(/API key/)
  await expect(key).toBeEnabled()
  await key.fill("not-a-real-key")
  await expect(page.getByText("OpenAI keys start with sk-.")).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Save key|Replace key/ })
  ).toBeDisabled()
  const status = await page.request.get("/api/settings/ai-key")
  if (!(await status.json()).configured) {
    await page.goto("/enquiries")
    await page.getByRole("button", { name: "New quote", exact: true }).click()
    await expect(page.getByText("No AI key connected")).toBeVisible()
    await page.getByRole("tab", { name: "Paste an email" }).click()
    await page.getByRole("button", { name: /Driveway extension/ }).click()
    await expect(
      page.getByRole("button", { name: "Draft quote", exact: true })
    ).toBeDisabled()
  }
})
test("mobile navigation works without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, "HOLLIS")
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.getByRole("button", { name: "Open navigation" }).click()
  await page.getByRole("link", { name: "Customers", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Your customers" })
  ).toBeVisible()
  await page.goto(`/quotes/${okafor()}`)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
})

test("owner adds, edits and deletes a rate; approvers can't", async ({
  page,
}) => {
  await signIn(page, "HOLLIS")
  await page.goto("/rates")
  await page.getByRole("button", { name: "Add rate", exact: true }).click()
  const form = page.getByRole("dialog", { name: "Add a rate" })
  await form.getByLabel("Code").fill("e2e01")
  await form.getByLabel("Description").fill("Test drainage grating")
  await choose(page, form, "Status", "In use")
  await form.getByRole("button", { name: "Add rate" }).click()
  await expect(form.getByText(/needs a price/)).toBeVisible()
  await form.getByLabel(/Rate, ex VAT/).fill("42.50")
  await choose(page, form, "Unit", "m")
  await form.getByRole("button", { name: "Add rate" }).click()
  await expect(form).toBeHidden()
  // The rate list is paged, so find the new rate by searching for it.
  await page.getByLabel("Search code or item").fill("E2E01")
  const row = page.getByRole("row", { name: /E2E01/ })
  await expect(row).toContainText("£42.50")
  await row.getByRole("button", { name: "Edit E2E01" }).click()
  const edit = page.getByRole("dialog", { name: "Edit E2E01" })
  await edit.getByLabel(/Rate, ex VAT/).fill("45")
  await edit.getByRole("button", { name: "Save rate" }).click()
  await expect(row).toContainText("£45.00")
  await page.reload()
  await page.getByLabel("Search code or item").fill("E2E01")
  await expect(page.getByRole("row", { name: /E2E01/ })).toContainText("£45.00")
  await page.getByRole("button", { name: "Delete E2E01" }).click()
  await page
    .getByRole("dialog", { name: "Delete E2E01?" })
    .getByRole("button", { name: "Delete rate" })
    .click()
  await expect(page.getByRole("row", { name: /E2E01/ })).toHaveCount(0)
  await page.getByLabel("Search code or item").fill("BP01")
  await page.getByRole("button", { name: "Delete BP01" }).click()
  const warning = page.getByRole("dialog", { name: "Delete BP01?" })
  await expect(warning.getByText(/Drafts use BP01 automatically/)).toBeVisible()
  await warning.getByRole("button", { name: "Cancel" }).click()

  await page.context().clearCookies()
  await signIn(page, "SHAZ")
  await page.goto("/rates")
  await expect(page.getByText("Only the owner can change rates.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Add rate" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0)
  const denied = await page.request.post("/api/rates", {
    headers: { origin: new URL(page.url()).origin },
    data: {
      code: "E2E02",
      description: "Should not exist",
      unit: "m",
      ratePence: 100,
      status: "active",
      notes: "",
    },
  })
  expect(denied.status()).toBe(403)
})

test("a too-short check note is flagged next to the box, in plain words", async ({
  page,
}) => {
  await signIn(page, "HOLLIS")
  await page.goto(`/quotes/${kestrel()}`)
  const box = page.getByRole("textbox", {
    name: /Resolution: Check the concrete depth/,
  })
  await box.fill("test")
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  await expect(box).toBeFocused()
  await expect(box).toHaveAttribute("aria-invalid", "true")
  await expect(
    page
      .getByText("Write a little more (at least 5 letters)", { exact: false })
      .first()
  ).toBeVisible()
  await expect(page.getByText("Fix this before saving")).toBeVisible()
  await box.fill("Old slab is 100 mm, checked on site")
  await expect(page.getByText("Fix this before saving")).toHaveCount(0)
  await expect(box).not.toHaveAttribute("aria-invalid", "true")
})

test("after the visit, the owner records findings and prices the job", async ({
  page,
}) => {
  await signIn(page, "HOLLIS")
  await page.goto(`/quotes/${greenway()}`)
  await page.getByRole("button", { name: "Price this job" }).click()
  await expect(
    page.getByText("Write what you found on the visit", { exact: false })
  ).toBeVisible()
  await page
    .getByLabel("What did you find on the visit?")
    .fill("Measured 1,150 m². Drainage needed at the entrance.")
  await page.getByRole("button", { name: "Price this job" }).click()
  await expect(
    page.getByRole("heading", { name: "Work and prices" })
  ).toBeVisible()
  await expect(page.getByText("Site visit done")).toBeVisible()
  await expect(page.locator(".lines tbody tr").first()).toBeVisible()
  const picker = page.getByRole("combobox", {
    name: "Add confirmed work to the scope",
  })
  await picker.fill("drainage grating test")
  await page.getByRole("option", { name: /as your own item/ }).click()
  await expect(
    page.getByRole("spinbutton", {
      name: "Quantity for drainage grating test",
    })
  ).toBeFocused()
})

// Needs a local test mail server: see "Testing email locally" in the README.
test("email: connect a mailbox, scroll the inbox, preview an email", async ({
  page,
}) => {
  test.skip(
    !process.env.MAIL_TEST,
    "Set MAIL_TEST=1 with a local test mail server"
  )
  await signIn(page, "HOLLIS")
  await page.goto("/settings")
  const change = page.getByRole("button", { name: "Change", exact: true })
  if (await change.isVisible()) await change.click()
  await page.getByRole("radio", { name: "Other" }).check()
  await page.locator("#mail-email").fill("office@hollis.test")
  await page.locator("#mail-password").fill("wrong-password")
  await page.locator("#mail-imapHost").fill("localhost")
  await page.locator("#mail-imapPort").selectOption("143")
  await page.locator("#mail-smtpHost").fill("localhost")
  await page.locator("#mail-smtpPort").selectOption("2525")
  await page.getByRole("button", { name: "Test and save" }).click()
  await expect(page.locator(".setting-form .alert-error")).toContainText(
    "app password"
  )
  await page.locator("#mail-password").fill("mailtest-pass-123")
  await page.getByRole("button", { name: "Test and save" }).click()
  await expect(page.getByText("office@hollis.test").first()).toBeVisible()
  await page.goto("/enquiries")
  await page.getByRole("button", { name: "New quote", exact: true }).click()
  await expect(
    page.getByRole("tab", { name: "From your inbox" })
  ).toHaveAttribute("aria-selected", "true")
  await expect(page.locator(".mail-row").first()).toBeVisible()
  const older = page.getByRole("button", { name: "Load older emails" })
  while (await older.isVisible()) {
    await older.click()
    await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0)
  }
  await expect(page.getByText("That’s every email in the inbox.")).toBeVisible()
  await page.getByLabel("Search loaded emails").fill("Patience Okafor")
  await page.locator(".inbox-list").evaluate((el) => (el.scrollTop = 0))
  await page.locator(".mail-row", { hasText: "Patience Okafor" }).click()
  await expect(
    page.getByRole("heading", { name: "Drive extension - quote please" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Draft quote from this email" })
  ).toBeVisible()
})

test("list pagination resets when filters change and works on mobile", async ({
  page,
}) => {
  await signIn(page, "HOLLIS")
  await page.goto("/rates")
  const pagination = page.getByRole("navigation", { name: "Rates pagination" })
  await expect(page.locator("tbody tr")).toHaveCount(10)
  await pagination.getByRole("button", { name: "Next", exact: true }).click()
  await expect(pagination).toContainText("Page 2")
  await page.getByPlaceholder("Search code or item").fill("BP01")
  await expect(
    page.locator("tbody .rate-code", { hasText: /^BP01$/ })
  ).toBeVisible()
  await expect(pagination).toContainText("Page 1 of 1")
  await expect(
    pagination.getByRole("button", { name: "Next", exact: true })
  ).toBeDisabled()
  await page.getByRole("button", { name: "Clear filters", exact: true }).click()
  await choose(page, pagination, "Rows per page", "25")
  await expect(page.locator("tbody tr")).toHaveCount(25)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    pagination.getByRole("button", { name: "Next", exact: true })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
})

test("quote deletion can be cancelled, then confirmed and persists", async ({
  page,
}) => {
  await signIn(page, "HOLLIS")
  await page.goto(`/quotes/${kestrel()}`)
  await page.getByRole("button", { name: "Delete quote", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(page).toHaveURL(new RegExp(kestrel()))
  await page.getByRole("button", { name: "Delete quote", exact: true }).click()
  await dialog
    .getByRole("button", { name: "Delete quote", exact: true })
    .click()
  await expect(page).toHaveURL(/\/quotes$/)
  await page.reload()
  expect((await page.request.get(`/api/quotes/${kestrel()}`)).status()).toBe(
    404
  )
})

test("disconnected inbox shows email setup and a paste alternative", async ({
  page,
}) => {
  const companyId = getSeed(true).company.id
  const account = await db.query(
    "select company_id from fieldquote.company_mail_accounts where company_id=$1",
    [companyId]
  )
  test.skip(
    account.rows.length > 0,
    "This fixture already has a connected mailbox"
  )
  await signIn(page, "GREENFIELD")
  let inboxRequests = 0
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/inbox") inboxRequests++
  })
  await page.getByRole("button", { name: "New quote", exact: true }).click()
  await expect(
    page.getByRole("heading", {
      name: "Bring customer enquiries into Fieldquote",
    })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Set up email" })
  ).toHaveAttribute("href", "/settings#email")
  await expect(page.getByLabel("Search loaded emails")).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.getByRole("button", { name: "Paste an email instead" }).click()
  await expect(
    page.getByRole("tab", { name: "Paste an email", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await page.getByRole("tab", { name: "From your inbox" }).click()
  await page.getByRole("link", { name: "Set up email" }).click()
  await expect(page).toHaveURL(/\/settings#email$/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.locator("#mail-email")).toBeVisible()
  expect(inboxRequests).toBe(0)
})
