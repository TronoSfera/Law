const { test, expect } = require("@playwright/test");
const {
  preparePublicSession,
  createRequestViaLanding,
  randomPhone,
  loginAdminPanel,
  openDictionaryTree,
  selectDictionaryNode,
  rowByTrack,
  trackCleanupPhone,
  trackCleanupTrack,
  trackCleanupEmail,
  cleanupTrackedTestData,
} = require("./helpers");

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "admin123";

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

test("admin flow via UI: dictionaries + users + topics + invoices", async ({ context, page }, testInfo) => {
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);

  await preparePublicSession(context, page, appUrl, phone);
  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Заявка для проверки админского UI-флоу",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await expect(page.locator(".badge")).toContainText("роль: Администратор");
  await expect(page.locator("#section-dashboard h2")).toHaveText("Обзор метрик");
  await expect(page.locator("#section-dashboard")).toContainText("Загрузка юристов");

  await openDictionaryTree(page);
  await expect(page.locator("aside .menu .menu-tree")).toContainText("Темы");
  await expect(page.locator("aside .menu .menu-tree")).toContainText("Статусы");
  await expect(page.locator("aside .menu .menu-tree")).toContainText("Пользователи");
  await expect(page.locator("aside .menu .menu-tree")).toContainText("Цитаты");

  const unique = Date.now();
  const lawyerEmail = `ui-lawyer-${unique}@example.com`;
  trackCleanupEmail(testInfo, lawyerEmail);
  const topicName = `Тема UI ${unique}`;

  await selectDictionaryNode(page, "Пользователи");
  await page.locator("#section-config .config-panel").getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByRole("heading", { name: /Создание • Пользователи/ })).toBeVisible();
  await page.locator("#record-field-name").fill(`Юрист UI ${unique}`);
  await page.locator("#record-field-email").fill(lawyerEmail);
  await page.locator("#record-field-role").selectOption("LAWYER");
  await page.locator("#record-field-default_rate").fill("5000");
  await page.locator("#record-field-salary_percent").fill("35");
  await page.locator("#record-field-password").fill("UiLawyerPass-123!");
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-config .status").first()).toContainText("Список обновлен");
  await expect(page.locator("#section-config table")).toContainText(lawyerEmail);

  await selectDictionaryNode(page, "Темы");
  await page.locator("#section-config .config-panel").getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByRole("heading", { name: /Создание • Темы/ })).toBeVisible();
  await page.locator("#record-field-name").fill(topicName);
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-config .status").first()).toContainText("Список обновлен");

  const topicRow = page.locator("#section-config table tbody tr").filter({ hasText: topicName });
  await expect(topicRow).toHaveCount(1);
  const topicCode = (await topicRow.first().locator("td code").innerText()).trim();

  await page.locator("aside .menu button[data-section='invoices']").click();
  await expect(page.locator("#section-invoices h2")).toHaveText("Счета");
  await page.locator("#section-invoices").getByRole("button", { name: "Новый счет" }).click();
  await expect(page.getByRole("heading", { name: /Создание • Счета/ })).toBeVisible();
  await page.locator("#record-field-request_track_number").fill(trackNumber);
  await page.locator("#record-field-amount").fill("15000");
  await page.locator("#record-field-payer_display_name").fill("Тестовый плательщик");
  await page.locator("#record-field-payer_details").fill('{"inn":"7700000000"}');
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-invoices .status")).toContainText("Список обновлен");

  const invoiceRow = rowByTrack(page, "#section-invoices", trackNumber);
  await expect(invoiceRow).toHaveCount(1);
  await expect(invoiceRow.first()).toContainText("15000");

  await invoiceRow.first().getByRole("button", { name: "Редактировать счет" }).click();
  await expect(page.getByRole("heading", { name: /Редактирование • Счета/ })).toBeVisible();
  await page.locator("#record-field-status").selectOption("PAID");
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-invoices .status")).toContainText("Список обновлен");
  await expect(invoiceRow.first()).toContainText("Оплачен");

  await page.goto("/admin.html?section=availableTables");
  await expect(page.locator("#section-available-tables h2")).toHaveText("Доступность таблиц");

  const clientsRow = page.locator("#section-available-tables table tbody tr").filter({ hasText: "clients" }).first();
  await expect(clientsRow).toHaveCount(1);
  const deactivateBtn = clientsRow.getByRole("button", { name: "Деактивировать таблицу" });
  if (await deactivateBtn.count()) {
    await deactivateBtn.click();
  }
  await expect(page.locator("#section-available-tables .status")).toContainText(/Сохранено|Список обновлен/);

  await openDictionaryTree(page);
  await expect(page.locator("aside .menu .menu-tree")).not.toContainText("Клиенты");

  await page.goto("/admin.html?section=availableTables");
  await expect(page.locator("#section-available-tables h2")).toHaveText("Доступность таблиц");
  const clientsRowDisabled = page.locator("#section-available-tables table tbody tr").filter({ hasText: "clients" }).first();
  await expect(clientsRowDisabled.getByRole("button", { name: "Активировать таблицу" })).toHaveCount(1);
  await clientsRowDisabled.getByRole("button", { name: "Активировать таблицу" }).click();
  await expect(page.locator("#section-available-tables .status")).toContainText(/Сохранено|Список обновлен/);

  await openDictionaryTree(page);
  await expect(page.locator("aside .menu .menu-tree")).toContainText("Клиенты");
});
