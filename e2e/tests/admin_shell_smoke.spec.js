const { test, expect } = require("@playwright/test");
const { loginAdminPanel, openDictionaryTree, selectDictionaryNode, cleanupTrackedTestData } = require("./helpers");

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "admin123";

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

test("admin shell smoke: sidebar collapse/expand and user modal opens by name", async ({ page }) => {
  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  const collapseButton = page.locator("aside .sidebar-head").getByRole("button", { name: "Свернуть меню" });
  await expect(collapseButton).toBeVisible();
  await collapseButton.click();
  await expect(page.locator(".layout.sidebar-collapsed .sidebar")).toBeVisible();
  await expect(page.locator(".layout.sidebar-collapsed .menu button .menu-label").first()).toBeHidden();
  await expect(page.locator(".layout.sidebar-collapsed .menu button .menu-icon").first()).toBeVisible();

  await page.locator("aside .menu").getByRole("button", { name: "Справочники" }).click();
  await expect(page.locator(".layout.sidebar-collapsed")).toHaveCount(0);
  await expect(page.locator("aside .menu .menu-tree")).toBeVisible();

  await openDictionaryTree(page);
  await selectDictionaryNode(page, "Пользователи");

  const firstUserRow = page.locator("#section-config table tbody tr").first();
  await expect(firstUserRow).toBeVisible();
  await expect(firstUserRow.getByRole("button", { name: "Редактировать пользователя" })).toHaveCount(0);

  const userNameLink = firstUserRow.locator(".user-identity-link").first();
  const userName = ((await userNameLink.textContent()) || "").trim();
  await userNameLink.click();

  await expect(page.getByRole("heading", { name: /Редактирование • Пользователи/ })).toBeVisible();
  await expect(page.locator("#record-overlay")).toContainText("Просмотр профиля пользователя.");
  await expect(page.locator("#record-overlay .record-user-summary")).toContainText(userName);

  await page.locator("#record-overlay").getByRole("button", { name: "Редактировать" }).click();
  await expect(page.locator("#record-overlay")).toContainText("Редактирование профиля пользователя.");
  await expect(page.locator("#record-field-role")).toBeVisible();
  await expect(page.locator("#record-overlay").getByRole("button", { name: "Сохранить" })).toBeVisible();

  await page.locator("#record-overlay .modal > .modal-head .modal-head-actions > .close").click();
  await expect(page.locator("#record-overlay")).toBeHidden();
});
