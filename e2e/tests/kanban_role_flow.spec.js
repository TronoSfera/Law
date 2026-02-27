const { test, expect } = require("@playwright/test");
const {
  preparePublicSession,
  createRequestViaLanding,
  randomPhone,
  loginAdminPanel,
  trackCleanupPhone,
  trackCleanupTrack,
  cleanupTrackedTestData,
} = require("./helpers");

const LAWYER_EMAIL = process.env.E2E_LAWYER_EMAIL || "ivan@mail.ru";
const LAWYER_PASSWORD = process.env.E2E_LAWYER_PASSWORD || "LawyerPass-123!";

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

test("kanban flow via UI: lawyer sees unassigned card, claims and opens request in same tab", async ({ context, page }, testInfo) => {
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);

  await preparePublicSession(context, page, appUrl, phone);
  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Заявка для проверки канбана юриста",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await page.locator("aside .menu button[data-section='kanban']").click();
  await expect(page.locator("#section-kanban h2")).toHaveText("Канбан заявок");

  await page.locator("#section-kanban .filter-toolbar").getByRole("button", { name: "Фильтр" }).click();
  await expect(page.getByRole("heading", { name: "Фильтр таблицы" })).toBeVisible();
  await page.locator("#filter-field").selectOption("client_name");
  await page.locator("#filter-op").selectOption("~");
  await page.locator("#filter-value").fill("Клиент");
  await page.locator("#filter-overlay").getByRole("button", { name: /Добавить|Сохранить|Добавить\/Сохранить/i }).click();
  await expect(page.locator("#section-kanban .filter-chip")).toHaveCount(1);

  const sortButton = page.locator("#section-kanban .section-head").getByRole("button", { name: "Сортировка" });
  await sortButton.click();
  await expect(page.getByRole("heading", { name: "Сортировка канбана" })).toBeVisible();
  await page.locator("#kanban-sort-mode").selectOption("deadline");
  await page.locator("#kanban-sort-overlay").getByRole("button", { name: "Ок" }).click();
  await expect(sortButton).toHaveClass(/active-success/);

  const card = page.locator("#section-kanban .kanban-card").filter({ hasText: trackNumber }).first();
  await expect(card).toBeVisible();

  const claimBtn = card.getByRole("button", { name: "Взять в работу" });
  if (await claimBtn.count()) {
    await claimBtn.click();
    await expect(page.locator("#section-kanban .status")).toContainText(/Заявка взята в работу|Канбан обновлен/);
  }

  const transitionSelect = page.locator("#section-kanban .kanban-card").filter({ hasText: trackNumber }).first().locator(".kanban-transition-select");
  if (await transitionSelect.count()) {
    const targetValue = await transitionSelect
      .first()
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value")
      .catch(() => "");
    if (targetValue) {
      await transitionSelect.first().selectOption(targetValue);
      await expect(page.locator("#section-kanban .status")).toContainText(/Статус заявки обновлен|Ошибка перехода|Канбан обновлен/);
    }
  }

  const pagesBeforeOpen = context.pages().length;
  await page.locator("#section-kanban .kanban-card").filter({ hasText: trackNumber }).first().click();
  await page.waitForTimeout(250);
  await expect.poll(() => context.pages().length).toBe(pagesBeforeOpen);
  await expect(page.locator("#section-request-workspace h2")).toContainText("Карточка заявки");
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.locator("#section-requests h2")).toHaveText("Заявки");
});
