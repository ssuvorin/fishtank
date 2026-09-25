import { expect, test } from "@playwright/test";
// Test transport only. Production never imports this fixture or invents scores.
const report = {
  url: "https://example.ae",
  pages_scraped: ["https://example.ae/privacy"],
  revenue_used: 5000000,
  revenue_assumed: true,
  limited_coverage: true,
  exposure: { usd: 6000, aed: 22038 },
  briefing_md: "Review the consent wording. <script>alert(1)</script>",
  violations: Array.from({ length: 10 }, (_, i) => ({
    id: `rule-${i}`,
    category: i === 0 ? "Consent transparency" : `Review area ${i}`,
    law: "Test law",
    articles: ["Article 6"],
    probability: i === 0 ? 0.8 : 0.2,
    flagged: i === 0,
    exposure_usd: i === 0 ? 6000 : 0,
    exposure_aed: i === 0 ? 22038 : 0,
    severity: "HIGH",
    basis: "estimate",
    evidence_quote: "No named request channel was found in the reviewed text.",
    remediation: "Add a named contact channel.",
    evidence_kind: "absence",
    source_url: "https://example.ae/privacy",
    legal_source_url: "javascript:alert(1)",
  })),
};
test("report, evidence, safe links and complete offline export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let body: unknown;
  await page.route("**/api/v1/audit", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: report });
  });
  await page.goto("/");
  await page.getByLabel("Website to audit").fill(report.url);
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(
    page.getByRole("region", { name: "Audit results" }),
  ).toBeVisible();
  expect(body).toEqual({ url: report.url });
  await expect(
    page.getByText("Limited coverage —", { exact: false }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "Consent transparency" })
    .click();
  await expect(
    page.getByText("Add a named contact channel.").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open evidence source" }).first(),
  ).toHaveAttribute("href", report.pages_scraped[0]);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await page.getByText("Auditor’s briefing", { exact: true }).click();
  await expect(page.locator(".briefing-text")).toContainText(
    "Review the consent wording.",
  );
  await page.screenshot({
    path: test.info().outputPath("desktop-report.png"),
    fullPage: true,
  });
  await page.context().setOffline(true);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export action plan" }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  let data = "";
  for await (const chunk of stream!) data += chunk.toString();
  const exported = JSON.parse(data);
  expect(exported).toMatchObject(report);
  expect(exported.exported_at).toBeTruthy();
  expect(errors).toEqual([]);
});
test("API failure never displays a financial result", async ({ page }) => {
  await page.route("**/api/v1/audit", (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: "scoring_unavailable",
        detail: "Probability scoring is temporarily unavailable.",
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Website to audit").fill(report.url);
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page.getByRole("alert")).toContainText("Probability scoring");
  await expect(page.getByRole("region", { name: "Audit results" })).toHaveCount(
    0,
  );
});
test("rejects incomplete reports", async ({ page }) => {
  await page.route("**/api/v1/audit", (route) =>
    route.fulfill({
      json: { ...report, violations: report.violations.slice(0, 1) },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Website to audit").fill(report.url);
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page.getByRole("alert")).toContainText("incomplete report");
});
test("cancel restores form and never presents a partial estimate", async ({
  page,
}) => {
  await page.route("**/api/v1/audit", () => {});
  await page.goto("/");
  await page.getByLabel("Website to audit").fill(report.url);
  await page.getByRole("button", { name: "Run audit" }).click();
  await page.getByRole("button", { name: "Cancel audit" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await expect(page.getByRole("button", { name: "Run audit" })).toBeEnabled();
});
test("mobile form and results fit viewport; supplied revenue is sent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/audit", (route) => {
    expect(route.request().postDataJSON().annual_revenue).toBe(1000000);
    return route.fulfill({
      json: { ...report, revenue_used: 1000000, revenue_assumed: false },
    });
  });
  await page.goto("/");
  await page.getByLabel("Website to audit").fill(report.url);
  await page.getByLabel("Annual revenue").fill("1000000");
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(
    page.getByRole("region", { name: "Audit results" }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("mobile-report.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("ElevenLabs scan display respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/audit", () => {});
  await page.goto("/");
  await page.getByLabel("Website to audit").fill(report.url);
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Reading the fine print.",
  );
  await expect(page.locator(".eleven-matrix")).toBeVisible();
  await expect(page.locator(".eleven-matrix")).not.toHaveAttribute(
    "data-animating",
    "true",
  );
  await page.getByRole("button", { name: "Cancel audit" }).click();
});
