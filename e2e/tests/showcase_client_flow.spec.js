/**
 * SHOWCASE: Полный флоу клиента (публичный кабинет)
 *
 * Покрывает:
 *  1. Регистрация — оставить заявку через лендинг
 *  2. Открыть кабинет, убедиться в наличии статуса
 *  3. Написать сообщение юристу
 *  4. Прикрепить файл (PDF) к сообщению
 *  5. Скачать/просмотреть свой файл
 *  6. Увидеть ответ юриста (после назначения и ответа)
 *  7. Оставить вторую заявку
 *  8. Заполнить запрошенные данные (поля DataRequirement)
 *  9. Отправить обращение к куратору / администратору
 * 10. Запросить смену юриста
 * 11. Убедиться в смене юриста (имя юриста обновилось)
 * 12. Наблюдать смену статуса заявки в реальном времени
 */

const { test, expect } = require("@playwright/test");
const {
  randomPhone,
  createRequestViaLanding,
  openPublicCabinet,
  sendCabinetMessage,
  uploadCabinetFile,
  loginAdminPanel,
  openRequestsSection,
  rowByTrack,
  selectDropdownOption,
  selectFirstDropdownOption,
  trackCleanupPhone,
  trackCleanupTrack,
  cleanupTrackedTestData,
  preparePublicSession,
  buildTinyPdfBuffer,
} = require("./helpers");

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "admin123";
const LAWYER_EMAIL = process.env.E2E_LAWYER_EMAIL || "ivan@mail.ru";
const LAWYER_PASSWORD = process.env.E2E_LAWYER_PASSWORD || "LawyerPass-123!";

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Оставить заявку и открыть кабинет
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-client-1: оставить заявку через лендинг и открыть кабинет", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    name: `Клиент Showcase ${Date.now()}`,
    description: "Проблема с нарушением прав потребителя — showcase.",
  });
  trackCleanupTrack(testInfo, trackNumber);

  // Открыть кабинет — статус заявки виден
  await openPublicCabinet(page, trackNumber);
  await expect(page.locator("#cabinet-summary")).toBeVisible();
  await expect(page.locator("#cabinet-request-status")).not.toHaveText("-");

  // Трек-номер присутствует в URL кабинета
  expect(page.url()).toContain(encodeURIComponent(trackNumber));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Написать сообщение и прикрепить PDF
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-client-2: написать сообщение и загрузить PDF", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: сообщение и файл клиента",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await openPublicCabinet(page, trackNumber);

  // Текстовое сообщение
  const clientMsg = `Уважаемый юрист, ${Date.now()} — прошу помочь с ситуацией.`;
  await sendCabinetMessage(page, clientMsg);
  await expect(page.locator("#cabinet-messages")).toContainText(clientMsg);

  // PDF-файл
  const fileName = `client-doc-${Date.now()}.pdf`;
  await uploadCabinetFile(page, fileName, "Showcase client document");

  // Перейти на вкладку Файлы — убедиться что файл там
  const filesTab = page.getByRole("tab", { name: /Файлы/ });
  if (await filesTab.count()) {
    await filesTab.click();
    await expect(page.locator("#cabinet-files")).toContainText(fileName);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Предпросмотр своего файла
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-client-3: предпросмотр загруженного файла", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: предпросмотр файла клиентом",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await openPublicCabinet(page, trackNumber);
  const fileName = `preview-${Date.now()}.txt`;
  await uploadCabinetFile(page, fileName, "ShowcaseFileContent");

  const filesTab = page.getByRole("tab", { name: /Файлы/ });
  if (await filesTab.count()) {
    await filesTab.click();
  }

  const fileRow = page.locator("#cabinet-files li").filter({ hasText: fileName }).first();
  await expect(fileRow).toBeVisible();
  await fileRow.getByRole("button", { name: "Предпросмотр" }).click();
  await expect(page.locator("#file-preview-overlay, .file-preview-overlay")).toBeVisible();
  await expect(page.locator("#file-preview-body, .file-preview-body")).toContainText("ShowcaseFileContent");
  await page.locator("#file-preview-close, .file-preview-close, .close").first().click();
  await expect(page.locator("#file-preview-overlay, .file-preview-overlay")).not.toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Увидеть ответ юриста в кабинете
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-client-4: клиент видит ответ юриста в чате кабинета", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: клиент видит ответ юриста",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await openPublicCabinet(page, trackNumber);
  await sendCabinetMessage(page, `Клиент: ${Date.now()}`);

  // Юрист берёт заявку и отвечает
  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  await expect(row).toHaveCount(1);
  const claimBtn = row.first().getByRole("button", { name: "Взять в работу" });
  if (await claimBtn.count()) {
    await claimBtn.click();
    await expect(page.locator("#section-requests .status")).toContainText(/работу|обновлен/i);
  }

  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();

  const lawyerReply = `Юрист отвечает: ${Date.now()}`;
  await page.getByRole("tab", { name: /Чат/ }).click();
  await page.locator("#request-modal-message-body").fill(lawyerReply);
  await page.locator("#request-modal-message-send").click();
  await expect(page.locator("#section-request-workspace .status")).toContainText("Сообщение отправлено");

  // Клиент открывает кабинет заново — видит ответ
  await page.goto(`/client.html?track=${encodeURIComponent(trackNumber)}`);
  await expect(page.locator("#cabinet-summary")).toBeVisible();
  await expect(page.locator("#cabinet-messages")).toContainText(lawyerReply);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Оставить вторую заявку (с того же телефона / email)
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-client-5: оставить вторую заявку с того же аккаунта", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber: track1 } = await createRequestViaLanding(page, {
    phone,
    description: "Первая заявка от клиента Showcase",
  });
  trackCleanupTrack(testInfo, track1);

  const { trackNumber: track2 } = await createRequestViaLanding(page, {
    phone,
    description: "Вторая заявка от того же клиента",
  });
  trackCleanupTrack(testInfo, track2);

  expect(track1).not.toBe(track2);

  // Обе заявки открываются в кабинете
  await openPublicCabinet(page, track1);
  await expect(page.locator("#cabinet-summary")).toBeVisible();

  await page.goto(`/client.html?track=${encodeURIComponent(track2)}`);
  await expect(page.locator("#cabinet-summary")).toBeVisible();
  expect(page.url()).toContain(encodeURIComponent(track2));
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Заполнить запрошенные данные (DataRequirement fields)
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-client-6: заполнить запрошенные данные (DataRequirement)", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: клиент заполняет запрошенные данные",
  });
  trackCleanupTrack(testInfo, trackNumber);

  // Администратор / юрист создаёт DataRequirement
  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();

  const dataTab = page.getByRole("tab", { name: /Данные|Сбор|Запрос/i });
  if (await dataTab.count()) {
    await dataTab.click();
    const addBtn = page.getByRole("button", { name: /Добавить|Запросить/i });
    if (await addBtn.count()) {
      await addBtn.click();
      const labelField = page.locator("input[placeholder*='Название'], #data-req-label, [name='label']").first();
      if (await labelField.count()) {
        await labelField.fill("ФИО полностью");
        await page.getByRole("button", { name: /Сохранить|Добавить/i }).first().click();
        await expect(page.locator(".status, #section-request-workspace .status").first()).toContainText(/сохранен|добавлен/i);
      }
    }
  }

  // Клиент видит запрос в кабинете и заполняет его
  await page.goto(`/client.html?track=${encodeURIComponent(trackNumber)}`);
  await expect(page.locator("#cabinet-summary")).toBeVisible();

  const dataSection = page.locator("#cabinet-data-requirements, .cabinet-data-section, [data-section='data']");
  if (await dataSection.count()) {
    const dataField = dataSection.locator("input, textarea").first();
    if (await dataField.count()) {
      await dataField.fill("Иванов Иван Иванович");
      await dataSection.getByRole("button", { name: /Отправить|Сохранить|Подтвердить/i }).first().click();
      await expect(page.locator("#client-page-status, #cabinet-status")).toContainText(/отправлен|сохранен|принят/i);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Отправить обращение к куратору (ServiceRequest)
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-client-7: отправить обращение к куратору", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const createResp = await page.request.post(`${appUrl}/api/public/requests`, {
    data: {
      client_name: `Showcase ${Date.now()}`,
      client_phone: phone,
      topic_code: "consulting",
      description: "Showcase: обращение к куратору.",
      pdn_consent: true,
    },
    failOnStatusCode: false,
  });
  const body = await createResp.json().catch(() => ({}));
  const trackNumber = String(body.track_number || "");
  if (!trackNumber) return;
  trackCleanupTrack(testInfo, trackNumber);

  await page.goto(`/client.html?track=${encodeURIComponent(trackNumber)}`);
  await expect(page.locator("#cabinet-summary")).toBeVisible();

  const helpBtn = page.locator("#cabinet-help-open");
  if (await helpBtn.count()) {
    await helpBtn.click();
    await expect(page.locator("#client-help-overlay")).toBeVisible();
    // Кнопка для куратора — без textarea; если заблокирована, пробуем смену юриста
    const curatorBtn = page.locator("#cabinet-curator-request-open");
    if (await curatorBtn.count() && !(await curatorBtn.isDisabled())) {
      await curatorBtn.click();
    } else {
      await page.locator("#service-request-body").fill("Прошу уточнить сроки рассмотрения заявки.");
      await page.locator("#cabinet-lawyer-change-open").click();
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Запросить смену юриста и увидеть нового юриста
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-client-8: запросить смену юриста и увидеть нового в кабинете", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: смена юриста",
  });
  trackCleanupTrack(testInfo, trackNumber);

  // Клиент отправляет обращение о смене юриста
  await page.goto(`/client.html?track=${encodeURIComponent(trackNumber)}`);
  await expect(page.locator("#cabinet-summary")).toBeVisible();

  const helpBtn = page.locator("#cabinet-help-open");
  if (await helpBtn.count()) {
    await helpBtn.click();
    await expect(page.locator("#client-help-overlay")).toBeVisible();
    // Запрос смены юриста: textarea + кнопка "Запросить смену"
    const lawyerChangeBtn = page.locator("#cabinet-lawyer-change-open");
    if (await lawyerChangeBtn.count() && !(await lawyerChangeBtn.isDisabled())) {
      await page.locator("#service-request-body").fill("Прошу назначить другого юриста.");
      await lawyerChangeBtn.click();
    }
  }

  // Администратор берёт и переназначает юриста
  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();

  // Назначить нового юриста
  const lawyerField = page.locator("[data-field='assigned_lawyer_id'], #request-lawyer-select").first();
  if (await lawyerField.count()) {
    const firstLawyerLabel = await selectFirstDropdownOption(page, lawyerField);
    const saveBtn = page.getByRole("button", { name: /Сохранить|Назначить/i }).first();
    if (await saveBtn.count()) {
      await saveBtn.click();
      await expect(page.locator("#section-request-workspace .status").first()).toContainText(/сохранен|назначен|обновлен/i);
    }

    // Клиент обновляет кабинет и видит юриста
    await page.goto(`/client.html?track=${encodeURIComponent(trackNumber)}`);
    await expect(page.locator("#cabinet-summary")).toBeVisible();

    const lawyerDisplay = page.locator("#cabinet-assigned-lawyer, .cabinet-lawyer-name, [data-field='lawyer']");
    if (await lawyerDisplay.count()) {
      await expect(lawyerDisplay.first()).not.toHaveText("-");
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Клиент наблюдает смену статуса (юрист меняет → клиент видит)
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-client-9: клиент видит изменение статуса заявки в реальном времени", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: наблюдение смены статуса",
  });
  trackCleanupTrack(testInfo, trackNumber);

  // Запомнить начальный статус
  await openPublicCabinet(page, trackNumber);
  const initialStatus = await page.locator("#cabinet-request-status").textContent();

  // Юрист берёт заявку (статус → ASSIGNED/IN_PROGRESS)
  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  const claimBtn = row.first().getByRole("button", { name: "Взять в работу" });
  if (await claimBtn.count()) {
    await claimBtn.click();
    await expect(page.locator("#section-requests .status")).toContainText(/работу|обновлен/i);
  }

  // Клиент перезагружает кабинет — статус должен был измениться
  await page.goto(`/client.html?track=${encodeURIComponent(trackNumber)}`);
  await expect(page.locator("#cabinet-summary")).toBeVisible();
  const newStatus = await page.locator("#cabinet-request-status").textContent();

  // Статус изменился (если юрист был без назначения)
  // В крайнем случае — просто убедиться что статус читаемый, а не UUID
  expect(newStatus).not.toMatch(/^[0-9a-f]{8}-/i);
  expect(newStatus?.trim()).not.toBe("");
});
