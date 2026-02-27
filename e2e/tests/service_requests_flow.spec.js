const { test, expect } = require("@playwright/test");
const {
  preparePublicSession,
  openPublicCabinet,
  randomPhone,
  trackCleanupPhone,
  trackCleanupTrack,
  cleanupTrackedTestData,
  loginAdminPanel,
} = require("./helpers");

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

test("service requests UI flow: client creates requests -> admin sees them in Requests tab", async ({ context, page }, testInfo) => {
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);

  await preparePublicSession(context, page, appUrl, phone);
  const createResponse = await page.request.post(`${appUrl}/api/public/requests`, {
    data: {
      client_name: `Клиент E2E ${Date.now()}`,
      client_phone: phone,
      topic_code: "consulting",
      description: "E2E проверка клиентских обращений к куратору и смены юриста.",
    },
    failOnStatusCode: false,
  });
  expect(createResponse.ok()).toBeTruthy();
  const createBody = await createResponse.json();
  const trackNumber = String(createBody.track_number || "");
  expect(trackNumber.startsWith("TRK-")).toBeTruthy();
  trackCleanupTrack(testInfo, trackNumber);
  await openPublicCabinet(page, trackNumber);

  await page.locator("#cabinet-help-open").click();
  await expect(page.locator("#client-help-overlay")).toHaveClass(/open/);

  await page.locator("#cabinet-curator-request-open").click();
  await expect(page.locator("#client-page-status")).toContainText("Обращение отправлено.");
  await expect(page.locator("#cabinet-curator-request-open")).toBeDisabled();

  await page.locator("#service-request-body").fill("Прошу рассмотреть смену юриста.");
  await page.locator("#cabinet-lawyer-change-open").click();
  await expect(page.locator("#client-page-status")).toContainText("Обращение отправлено.");
  await expect(page.locator("#cabinet-lawyer-change-open")).toBeDisabled();

  await loginAdminPanel(page, { email: "admin@example.com", password: "admin123" });
  await page.locator("aside .menu button[data-section='serviceRequests']").click();
  await expect(page.locator("#section-service-requests h2")).toHaveText("Запросы");
  await expect(page.locator("#section-service-requests table")).toContainText("Прошу подключить куратора к текущей заявке.");
  await expect(page.locator("#section-service-requests table")).toContainText("Прошу рассмотреть смену юриста");
});
