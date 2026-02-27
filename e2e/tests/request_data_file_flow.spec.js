const { test, expect } = require("@playwright/test");
const {
  preparePublicSession,
  createRequestViaLanding,
  openPublicCabinet,
  randomPhone,
  loginAdminPanel,
  openRequestsSection,
  rowByTrack,
  trackCleanupPhone,
  trackCleanupTrack,
  cleanupTrackedTestData,
} = require("./helpers");

const LAWYER_EMAIL = process.env.E2E_LAWYER_EMAIL || "ivan@mail.ru";
const LAWYER_PASSWORD = process.env.E2E_LAWYER_PASSWORD || "LawyerPass-123!";

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

test("request data file field flow via UI: lawyer requests file -> client uploads -> lawyer sees completed request", async ({ context, page }, testInfo) => {
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);

  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "E2E проверка file-поля в запросе дополнительных данных",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await expect(page.locator("aside .auth-box")).toContainText("Роль: Юрист");
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  await expect(row).toHaveCount(1);
  const claimBtn = row.first().getByRole("button", { name: "Взять в работу" });
  await expect(claimBtn).toBeVisible();
  await claimBtn.click();
  await expect(page.locator("#section-requests .status")).toContainText(/Заявка взята в работу|Список обновлен/);

  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();
  await expect(page.locator("#request-modal-messages")).toBeVisible();

  await page.getByRole("button", { name: "Запросить" }).click();
  await expect(page.getByRole("heading", { name: /Запрос дополнительных данных|Редактирование запроса данных/ })).toBeVisible();

  const catalogFieldInput = page.locator("#request-data-template-select");
  const fileFieldLabel = `Файл для проверки E2E ${Date.now()}`;

  await catalogFieldInput.fill(fileFieldLabel);
  await page.locator(".request-data-modal-grid").filter({ hasText: "Поле данных" }).getByRole("button").click();
  await expect(page.locator(".request-data-rows .request-data-row").first().locator("input").first()).toHaveValue(fileFieldLabel);
  await page.locator(".request-data-rows .request-data-row").first().locator("select").selectOption("file");

  await page.locator(".request-data-modal .modal-actions").getByRole("button", { name: "Отправить" }).click();
  const requestDataModal = page.locator(".request-data-modal");
  try {
    await expect(requestDataModal).toBeHidden({ timeout: 20_000 });
  } catch (error) {
    const modalError = ((await page.locator(".request-data-modal .status.error").textContent().catch(() => "")) || "").trim();
    throw new Error(`Не удалось отправить запрос данных: ${modalError || "неизвестная ошибка"}`);
  }
  await page.getByRole("button", { name: "Обновить" }).first().click();
  await expect(page.locator("#request-modal-messages")).toContainText("Запрос");
  await expect(page.locator("#request-modal-messages .chat-request-data-bubble")).toContainText("Файл для провер");

  await page.goto("/");
  await openPublicCabinet(page, trackNumber);

  const requestMessageButton = page.locator("#cabinet-messages .request-data-message-btn").last();
  await expect(requestMessageButton).toBeVisible();
  await requestMessageButton.click();
  await expect(page.locator("#data-request-overlay")).toHaveClass(/open/);
  await expect(page.locator("#data-request-items")).toContainText("Файл для проверки");

  const requestFileInput = page.locator("#data-request-items input[type='file']").first();
  const requestFileName = `request-data-file-${Date.now()}.txt`;
  await requestFileInput.setInputFiles({
    name: requestFileName,
    mimeType: "text/plain",
    buffer: Buffer.from("request data file payload", "utf-8"),
  });

  await page.locator("#data-request-save").click();
  await expect(page.locator("#data-request-overlay")).not.toHaveClass(/open/);
  await expect(page.locator("#cabinet-messages .request-data-item.done").last()).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Панель администратора" })).toBeVisible();
  await openRequestsSection(page);
  const rowAfterClientUpload = rowByTrack(page, "#section-requests", trackNumber);
  await expect(rowAfterClientUpload).toHaveCount(1);
  await rowAfterClientUpload.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();

  const refreshBtn = page.getByRole("button", { name: "Обновить" }).first();
  await refreshBtn.click();
  await expect(page.locator("#request-modal-messages .chat-request-data-bubble.all-filled").last()).toBeVisible();

  const filesTab = page.getByRole("tab", { name: /Файлы/ });
  await filesTab.click();
  await expect(page.locator("#request-modal-files")).toContainText(requestFileName);
});
