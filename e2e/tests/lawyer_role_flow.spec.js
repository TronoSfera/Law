const { test, expect } = require("@playwright/test");
const {
  preparePublicSession,
  createRequestViaLanding,
  openPublicCabinet,
  sendCabinetMessage,
  uploadCabinetFile,
  randomPhone,
  loginAdminPanel,
  openRequestsSection,
  rowByTrack,
  buildTinyPdfBuffer,
  trackCleanupPhone,
  trackCleanupTrack,
  cleanupTrackedTestData,
} = require("./helpers");

const LAWYER_EMAIL = process.env.E2E_LAWYER_EMAIL || "ivan@mail.ru";
const LAWYER_PASSWORD = process.env.E2E_LAWYER_PASSWORD || "LawyerPass-123!";

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

test("lawyer flow via UI: claim request -> chat and files in request workspace tab -> change status", async ({ context, page }, testInfo) => {
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);

  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Заявка для проверки флоу юриста через UI",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await openPublicCabinet(page, trackNumber);
  await sendCabinetMessage(page, `Сообщение юристу ${Date.now()}`);
  const clientFileName = `lawyer-client-${Date.now()}.txt`;
  await uploadCabinetFile(page, clientFileName, "lawyer unread marker");

  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await expect(page.locator("aside .auth-box")).toContainText("Роль: Юрист");

  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  await expect(row).toHaveCount(1);
  await expect(row.first().locator(".request-update-chip")).toBeVisible();

  const claimBtn = row.first().getByRole("button", { name: "Взять в работу" });
  await expect(claimBtn).toBeVisible();
  await claimBtn.click();
  await expect(page.locator("#section-requests .status")).toContainText(/Заявка взята в работу|Список обновлен/);

  const pagesBeforeOpen = context.pages().length;
  await row.first().locator(".request-track-link").click();
  await page.waitForTimeout(250);
  await expect.poll(() => context.pages().length).toBe(pagesBeforeOpen);
  const requestPage = page;
  await expect(requestPage.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();
  await expect(requestPage.getByRole("button", { name: "Назад" })).toBeVisible();
  await expect(requestPage.locator("#request-modal-messages")).toContainText("Сообщение юристу");
  await requestPage.getByRole("tab", { name: /Файлы/ }).click();
  await expect(requestPage.locator("#request-modal-files")).toContainText(clientFileName);
  const clientFileRow = requestPage.locator("#request-modal-files li").filter({ hasText: clientFileName }).first();
  await clientFileRow.getByRole("button", { name: /Предпросмотр/ }).click();
  await expect(requestPage.locator("#request-file-preview-overlay")).toBeVisible();
  await expect(requestPage.locator("#request-file-preview-overlay .request-preview-text")).toBeVisible();
  await expect(requestPage.locator("#request-file-preview-overlay .request-preview-text")).toContainText("lawyer unread marker");
  await requestPage.locator("#request-file-preview-overlay .close").click();
  await requestPage.getByRole("tab", { name: "Чат" }).click();

  const lawyerMessage = `Ответ юриста ${Date.now()}`;
  await requestPage.locator("#request-modal-message-body").fill(lawyerMessage);
  await requestPage.locator("#request-modal-message-send").click();
  await expect(requestPage.locator("#section-request-workspace .status")).toContainText("Сообщение отправлено");
  await expect(requestPage.locator("#request-modal-messages")).toContainText(lawyerMessage);

  const lawyerFileName = `lawyer-admin-${Date.now()}.pdf`;
  const droppedFileName = `lawyer-drop-${Date.now()}.txt`;
  await requestPage.locator("#request-modal-file-input").setInputFiles([
    {
      name: lawyerFileName,
      mimeType: "application/pdf",
      buffer: buildTinyPdfBuffer("lawyer file from admin modal"),
    },
    {
      name: droppedFileName,
      mimeType: "text/plain",
      buffer: Buffer.from("temporary upload file", "utf-8"),
    },
  ]);
  await expect(requestPage.locator(".pending-file-chip").filter({ hasText: lawyerFileName })).toHaveCount(1);
  await expect(requestPage.locator(".pending-file-chip").filter({ hasText: droppedFileName })).toHaveCount(1);
  await requestPage.getByRole("button", { name: new RegExp("Удалить файл " + droppedFileName) }).click();
  await expect(requestPage.locator(".pending-file-chip").filter({ hasText: droppedFileName })).toHaveCount(0);
  await requestPage.locator("#request-modal-message-send").click();
  await expect(requestPage.locator("#section-request-workspace .status")).toContainText(/Файлы отправлены|Сообщение и файлы отправлены/);
  await requestPage.getByRole("tab", { name: /Файлы/ }).click();
  await expect(requestPage.locator("#request-modal-files")).toContainText(lawyerFileName);
  await expect(requestPage.locator("#request-modal-files")).not.toContainText(droppedFileName);
  await page.locator("aside .menu button[data-section='requests']").click();
  await expect(page.locator("#section-requests h2")).toHaveText("Заявки");
  await page.locator("#section-requests").getByRole("button", { name: "Обновить" }).click();
  await expect(row.first().locator(".request-update-empty")).toContainText("нет");

  await row.first().getByRole("button", { name: "Редактировать заявку" }).click();
  await expect(page.getByRole("heading", { name: /Редактирование • Заявки/ })).toBeVisible();
  await page.locator("#record-field-status_code").selectOption("IN_PROGRESS");
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-requests .status")).toContainText("Список обновлен");
  await expect(row.first()).toContainText("В работе");

  await page.goto("/");
  await openPublicCabinet(page, trackNumber);
  await expect(page.locator("#cabinet-messages")).toContainText(lawyerMessage);
  await expect(page.locator("#cabinet-files")).toContainText(lawyerFileName);
});
