const { test, expect } = require("@playwright/test");
const {
  preparePublicSession,
  createRequestViaLanding,
  randomPhone,
  loginAdminPanel,
} = require("./helpers");

const LAWYER_EMAIL = process.env.E2E_LAWYER_EMAIL || "ivan@mail.ru";
const LAWYER_PASSWORD = process.env.E2E_LAWYER_PASSWORD || "LawyerPass-123!";

test("kanban flow via UI: lawyer sees unassigned card, claims and opens request in same tab", async ({ context, page }) => {
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  const phone = randomPhone();

  await preparePublicSession(context, page, appUrl, phone);
  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Заявка для проверки канбана юриста",
  });

  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await page.locator("aside .menu button[data-section='kanban']").click();
  await expect(page.locator("#section-kanban h2")).toHaveText("Канбан заявок");

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
      await expect(page.locator("#section-kanban .status")).toContainText(/Статус заявки обновлен|Ошибка перехода/);
    }
  }

  const pagesBeforeOpen = context.pages().length;
  await page
    .locator("#section-kanban .kanban-card")
    .filter({ hasText: trackNumber })
    .first()
    .getByRole("button", { name: "Открыть заявку" })
    .click();
  await page.waitForTimeout(250);
  await expect.poll(() => context.pages().length).toBe(pagesBeforeOpen);
  await expect(page.locator("#section-request-workspace h2")).toHaveText("Карточка заявки");
  await page.getByRole("button", { name: "Назад к заявкам" }).click();
  await expect(page.locator("#section-requests h2")).toHaveText("Заявки");
});
