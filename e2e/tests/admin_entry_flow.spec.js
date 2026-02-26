const { test, expect } = require("@playwright/test");
const { cleanupTrackedTestData } = require("./helpers");

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

test("admin entry via route only: landing has no admin CTA and /admin opens panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Админ-панель" })).toHaveCount(0);

  await page.goto("/admin");
  await expect(async () => {
    const loginVisible = await page.locator("#login-email").isVisible().catch(() => false);
    const panelVisible = await page.getByRole("heading", { name: "Панель администратора" }).isVisible().catch(() => false);
    expect(loginVisible || panelVisible).toBeTruthy();
  }).toPass({ timeout: 30_000 });
});
