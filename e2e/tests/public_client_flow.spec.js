const { test } = require("@playwright/test");
const {
  preparePublicSession,
  createRequestViaLanding,
  openPublicCabinet,
  sendCabinetMessage,
  uploadCabinetFile,
  randomPhone,
  trackCleanupPhone,
  trackCleanupTrack,
  cleanupTrackedTestData,
} = require("./helpers");

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

test("public flow via UI: landing -> create request -> cabinet -> chat -> upload file", async ({ context, page }, testInfo) => {
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);

  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Проверка публичного E2E флоу через UI.",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await openPublicCabinet(page, trackNumber);

  const message = `Сообщение из e2e ${Date.now()}`;
  await sendCabinetMessage(page, message);

  const uploadedFile = `public-${Date.now()}.pdf`;
  await uploadCabinetFile(page, uploadedFile, "public file content");
  const fileRow = page.locator("#cabinet-files li").filter({ hasText: uploadedFile }).first();
  await fileRow.getByRole("button", { name: "Предпросмотр" }).click();
  await page.locator("#file-preview-overlay #file-preview-body").waitFor();
  await page.locator("#file-preview-close").click();
});
