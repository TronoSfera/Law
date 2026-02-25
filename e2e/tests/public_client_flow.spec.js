const { test } = require("@playwright/test");
const {
  preparePublicSession,
  createRequestViaLanding,
  openPublicCabinet,
  sendCabinetMessage,
  uploadCabinetFile,
  randomPhone,
} = require("./helpers");

test("public flow via UI: landing -> create request -> cabinet -> chat -> upload file", async ({ context, page }) => {
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  const phone = randomPhone();

  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Проверка публичного E2E флоу через UI.",
  });

  await openPublicCabinet(page, trackNumber);

  const message = `Сообщение из e2e ${Date.now()}`;
  await sendCabinetMessage(page, message);

  const uploadedFile = `public-${Date.now()}.pdf`;
  await uploadCabinetFile(page, uploadedFile, "public file content");
  const fileRow = page.locator("#cabinet-files .simple-item").filter({ hasText: uploadedFile }).first();
  await fileRow.getByRole("button", { name: "Предпросмотр" }).click();
  await page.locator("#file-preview-overlay #file-preview-body").waitFor();
  await page.locator("#file-preview-close").click();
});
