const { test, expect } = require("@playwright/test");
const { loginAdminPanel, openDictionaryTree, cleanupTrackedTestData, openDropdown } = require("./helpers");

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "admin123";

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

test("admin status designer: open transitions dictionary and prefill topic in create modal", async ({ page }) => {
  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  await openDictionaryTree(page);
  const transitionsNode = page.locator("aside .menu .menu-tree button").filter({ hasText: /Переходы статусов/ }).first();
  if ((await transitionsNode.count()) === 0) {
    test.skip(true, "Переходы статусов скрыты из дерева справочников в текущей конфигурации UI.");
  }
  await transitionsNode.click();

  await expect(page.locator("#section-config .config-panel h3")).toContainText("Переходы статусов");
  await expect(page.getByRole("heading", { name: "Конструктор маршрута статусов" })).toBeVisible();

  const topicSelect = page.locator("#status-designer-topic");
  await expect(topicSelect).toBeVisible();
  const dropdownRoot = await openDropdown(page, topicSelect);
  const realOption = dropdownRoot.locator(".dropdown-field-option").nth(1);
  await expect(realOption).toBeVisible();
  const selectedTopicLabel = ((await realOption.textContent()) || "").trim();
  await realOption.click();
  expect(selectedTopicLabel).not.toBe("");

  await page.getByRole("button", { name: "Добавить переход" }).click();
  await expect(page.getByRole("heading", { name: /Создание • Переходы статусов/ })).toBeVisible();
  await expect(page.locator("#record-field-topic_code")).toContainText(selectedTopicLabel);
  await page.locator("#record-overlay .close").click();
});
