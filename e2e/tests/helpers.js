const path = require("path");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const { expect } = require("@playwright/test");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const PUBLIC_SECRET = process.env.PUBLIC_JWT_SECRET || "change_me_public";
const PUBLIC_COOKIE_NAME = process.env.PUBLIC_COOKIE_NAME || "public_jwt";

function randomDigits(length) {
  let value = "";
  while (value.length < length) {
    value += String(Math.floor(Math.random() * 10));
  }
  return value.slice(0, length);
}

function randomPhone() {
  return `+79${randomDigits(9)}`;
}

function createPublicCookieToken(phone) {
  return jwt.sign({ sub: phone, purpose: "CREATE_REQUEST" }, PUBLIC_SECRET, {
    algorithm: "HS256",
    expiresIn: "7d",
  });
}

async function installPromptAutoAccept(page, code = "000000") {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt") {
      await dialog.accept(code);
      return;
    }
    await dialog.accept();
  });
}

async function installOtpBypassRoutes(page) {
  await page.route("**/api/public/otp/send", async (route) => {
    let purpose = "CREATE_REQUEST";
    try {
      const body = JSON.parse(route.request().postData() || "{}");
      purpose = String(body.purpose || purpose);
    } catch (_) {}

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "sent",
        purpose,
        ttl_seconds: 600,
        sms_response: { provider: "e2e", status: "accepted", message: "ok" },
      }),
    });
  });

  await page.route("**/api/public/otp/verify", async (route) => {
    let purpose = "CREATE_REQUEST";
    try {
      const body = JSON.parse(route.request().postData() || "{}");
      purpose = String(body.purpose || purpose);
    } catch (_) {}

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "verified", purpose }),
    });
  });
}

async function preparePublicSession(context, page, appUrl, phone) {
  await context.addCookies([
    {
      name: PUBLIC_COOKIE_NAME,
      value: createPublicCookieToken(phone),
      url: `${appUrl}/`,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await installPromptAutoAccept(page);
  await installOtpBypassRoutes(page);
}

async function createRequestViaLanding(page, options = {}) {
  const phone = options.phone || randomPhone();
  const name = options.name || `Клиент E2E ${Date.now()}`;
  const description = options.description || "Проверка создания заявки через UI";

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Решаем сложные юридические задачи в интересах вашего бизнеса." })).toBeVisible();

  await page.getByRole("button", { name: "Оставить заявку" }).first().click();
  await expect(page.getByRole("heading", { name: "Создание заявки" })).toBeVisible();

  await page.locator("#name").fill(name);
  await page.locator("#phone").fill(phone);
  const topicSelect = page.locator("#topic");
  await topicSelect.waitFor();
  await topicSelect.selectOption({ index: 1 });
  await page.locator("#description").fill(description);
  await page.getByRole("button", { name: "Отправить заявку" }).click();

  await expect(page.locator("#form-status")).toContainText("Заявка принята. Номер:");
  const statusText = await page.locator("#form-status").innerText();
  const match = statusText.match(/TRK-[A-Z0-9-]+/);
  if (!match) throw new Error("Track number not found in form status");

  return { trackNumber: match[0], phone, name };
}

async function openPublicCabinet(page, trackNumber) {
  await page.goto(`/client.html?track=${encodeURIComponent(trackNumber)}`);
  await expect(page.locator("#client-page-status")).toContainText(`Открыта заявка: ${trackNumber}`);
  await expect(page.locator("#cabinet-summary")).toBeVisible();
  await expect(page.locator("#cabinet-request-status")).not.toHaveText("-");
}

async function sendCabinetMessage(page, text) {
  await page.locator("#cabinet-chat-body").fill(text);
  await page.locator("#cabinet-chat-send").click();
  await expect(page.locator("#client-page-status")).toContainText("Сообщение отправлено.");
  await expect(page.locator("#cabinet-messages")).toContainText(text);
}

async function uploadCabinetFile(page, fileName = "e2e.txt", bodyText = "E2E file") {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.locator("#cabinet-file-input").setInputFiles({
      name: fileName,
      mimeType: "application/pdf",
      buffer: Buffer.from(bodyText, "utf-8"),
    });
    await page.locator("#cabinet-file-upload").click();

    try {
      await expect(page.locator("#client-page-status")).toContainText("Файл загружен.", { timeout: 20_000 });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(500);
    }
  }
  if (lastError) throw lastError;
  await expect(page.locator("#cabinet-files")).toContainText(fileName);
}

async function loginAdminPanel(page, creds) {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Панель администратора" })).toBeVisible();

  let loginVisible = false;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    loginVisible = await page.locator("#login-email").isVisible().catch(() => false);
    if (loginVisible) break;
    const badge = (await page.locator(".badge").first().textContent().catch(() => "")) || "";
    if (badge && !badge.includes("роль: -")) break;
    await page.waitForTimeout(200);
  }

  if (loginVisible) {
    await page.locator("#login-email").fill(creds.email);
    await page.locator("#login-password").fill(creds.password);
    await page.getByRole("button", { name: "Войти" }).click();
  }

  await expect(page.getByRole("heading", { name: "Панель администратора" })).toBeVisible();
}

async function openRequestsSection(page) {
  await page.locator("aside .menu button[data-section='requests']").click();
  await expect(page.locator("#section-requests h2")).toHaveText("Заявки");
}

function rowByTrack(page, sectionSelector, trackNumber) {
  return page.locator(`${sectionSelector} table tbody tr`).filter({ hasText: trackNumber });
}

async function openDictionaryTree(page) {
  const treeButton = page.locator("aside .menu button", { hasText: "Справочники" }).first();
  await treeButton.click();
  const afterFirstClick = await treeButton.innerText();
  if (afterFirstClick.includes("▸")) {
    await treeButton.click();
  }
  await expect(page.locator("#section-config h2")).toHaveText("Справочники");
  await expect(treeButton).toContainText("▾");
  await expect.poll(async () => page.locator("aside .menu .menu-tree button").count(), { timeout: 30_000 }).toBeGreaterThan(0);
}

async function selectDictionaryNode(page, label) {
  await page.locator("aside .menu .menu-tree").getByRole("button", { name: label, exact: true }).click();
  await expect(page.locator("#section-config .config-panel h3")).toContainText(label);
}

module.exports = {
  randomPhone,
  preparePublicSession,
  createRequestViaLanding,
  openPublicCabinet,
  sendCabinetMessage,
  uploadCabinetFile,
  loginAdminPanel,
  openRequestsSection,
  rowByTrack,
  openDictionaryTree,
  selectDictionaryNode,
};
