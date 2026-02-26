const { test, expect } = require("@playwright/test");
const { loginAdminPanel, openDictionaryTree, cleanupTrackedTestData } = require("./helpers");

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "admin123";

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

test("admin status designer: open transitions dictionary and prefill topic in create modal", async ({ page }) => {
  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  await openDictionaryTree(page);
  await page.locator("aside .menu .menu-tree button").filter({ hasText: /Переходы статусов/ }).first().click();

  await expect(page.locator("#section-config .config-panel h3")).toContainText("Переходы статусов");
  await expect(page.getByRole("heading", { name: "Конструктор маршрута статусов" })).toBeVisible();

  const topicSelect = page.locator("#status-designer-topic");
  await expect(topicSelect).toBeVisible();
  const optionCount = await topicSelect.locator("option").count();
  expect(optionCount).toBeGreaterThan(1);

  await topicSelect.selectOption({ index: 1 });
  const selectedTopic = await topicSelect.inputValue();
  expect(selectedTopic).not.toBe("");

  await page.getByRole("button", { name: "Добавить переход" }).click();
  await expect(page.getByRole("heading", { name: /Создание • Переходы статусов/ })).toBeVisible();
  await expect(page.locator("#record-field-topic_code")).toHaveValue(selectedTopic);
  await page.locator("#record-overlay .close").click();
});
