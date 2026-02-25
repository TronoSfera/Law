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
} = require("./helpers");

const LAWYER_EMAIL = process.env.E2E_LAWYER_EMAIL || "ivan@mail.ru";
const LAWYER_PASSWORD = process.env.E2E_LAWYER_PASSWORD || "LawyerPass-123!";

test("lawyer flow via UI: claim request -> chat and files in request workspace tab -> change status", async ({ context, page }) => {
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  const phone = randomPhone();

  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Заявка для проверки флоу юриста через UI",
  });

  await openPublicCabinet(page, trackNumber);
  await sendCabinetMessage(page, `Сообщение юристу ${Date.now()}`);
  const clientFileName = `lawyer-client-${Date.now()}.txt`;
  await uploadCabinetFile(page, clientFileName, "lawyer unread marker");

  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await expect(page.locator(".badge")).toContainText("роль: Юрист");

  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  await expect(row).toHaveCount(1);
  await expect(row.first().locator(".request-update-chip")).toBeVisible();

  const claimBtn = row.first().getByRole("button", { name: "Взять в работу" });
  await expect(claimBtn).toBeVisible();
  await claimBtn.click();
  await expect(page.locator("#section-requests .status")).toContainText(/Заявка взята в работу|Список обновлен/);

  const requestPagePromise = context.waitForEvent("page");
  await row.first().getByRole("button", { name: "Открыть заявку" }).click();
  const requestPage = await requestPagePromise;
  await requestPage.waitForLoadState("domcontentloaded");
  await expect(requestPage.getByRole("heading", { name: "Карточка заявки" })).toBeVisible();
  await expect(requestPage.locator("#section-request-workspace .breadcrumbs")).toContainText("Заявки -> Заявка");
  await expect(requestPage.getByRole("button", { name: "Назад к заявкам" })).toBeVisible();
  await expect(requestPage.locator("#request-modal-messages")).toContainText("Сообщение юристу");
  await expect(requestPage.locator("#request-modal-files")).toContainText(clientFileName);
  const clientFileRow = requestPage.locator("#request-modal-files li").filter({ hasText: clientFileName }).first();
  await clientFileRow.getByRole("button", { name: /Предпросмотр/ }).click();
  await expect(requestPage.locator("#request-file-preview-overlay")).toBeVisible();
  await expect(requestPage.locator("#request-file-preview-overlay .request-preview-frame")).toBeVisible();
  await requestPage.locator("#request-file-preview-overlay .close").click();

  const lawyerMessage = `Ответ юриста ${Date.now()}`;
  await requestPage.locator("#request-modal-message-body").fill(lawyerMessage);
  await requestPage.locator("#request-modal-message-send").click();
  await expect(requestPage.locator("#section-request-workspace .status")).toContainText("Сообщение отправлено");
  await expect(requestPage.locator("#request-modal-messages")).toContainText(lawyerMessage);

  const lawyerFileName = `lawyer-admin-${Date.now()}.pdf`;
  await requestPage.locator("#request-modal-file-input").setInputFiles({
    name: lawyerFileName,
    mimeType: "application/pdf",
    buffer: Buffer.from("lawyer file from admin modal", "utf-8"),
  });
  await requestPage.locator("#request-modal-file-upload").click();
  await expect(requestPage.locator("#section-request-workspace .status")).toContainText("Файл загружен");
  await expect(requestPage.locator("#request-modal-files")).toContainText(lawyerFileName);
  await requestPage.close();

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
