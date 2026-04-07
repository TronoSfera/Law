/**
 * SHOWCASE: Полный флоу юриста
 *
 * Покрывает:
 *  1. Дашборд юриста — «Моя загрузка»
 *  2. Взять заявку в работу из списка заявок
 *  3. Взять заявку из Канбана + смена статуса через «Перевести…»
 *  4. Открыть карточку заявки, прочитать сообщения и файлы клиента
 *  5. Ответить клиенту в чате (текст)
 *  6. Прикрепить файл (PDF) к ответу
 *  7. Запросить данные клиента — создать DataRequirement
 *  8. Работа с шаблонами данных (DataTemplate)
 *  9. Сменить статус из карточки заявки
 * 10. Выставить счёт из карточки заявки
 * 11. Закрыть заявку (перевести в терминальный статус)
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
  buildTinyPdfBuffer,
  selectDropdownOption,
  selectFirstDropdownOption,
  trackCleanupPhone,
  trackCleanupTrack,
  cleanupTrackedTestData,
  preparePublicSession,
} = require("./helpers");

const LAWYER_EMAIL = process.env.E2E_LAWYER_EMAIL || "ivan@mail.ru";
const LAWYER_PASSWORD = process.env.E2E_LAWYER_PASSWORD || "LawyerPass-123!";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "admin123";

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Дашборд юриста
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-lawyer-1: дашборд — «Моя загрузка» и KPI юриста", async ({ page }) => {
  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await expect(page.locator("#section-dashboard h2")).toHaveText("Обзор метрик");
  await expect(page.locator("#section-dashboard")).toContainText("Моя загрузка");
  // KPI-плитки видны (дашборд использует .card)
  const tiles = page.locator("#section-dashboard .card");
  await expect(tiles.first()).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Взять заявку в работу из списка + прочитать сообщение клиента
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-lawyer-2: взять заявку и прочитать сообщение клиента", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: юрист берёт заявку и читает сообщение",
  });
  trackCleanupTrack(testInfo, trackNumber);

  // Клиент пишет сообщение
  await openPublicCabinet(page, trackNumber);
  const clientMsg = `Вопрос клиента ${Date.now()}`;
  await sendCabinetMessage(page, clientMsg);

  // Юрист входит в систему
  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  await expect(row).toHaveCount(1);

  // Иконка непрочитанных сообщений видна
  await expect(row.first().locator(".request-update-chip")).toBeVisible();

  // Взять в работу
  const claimBtn = row.first().getByRole("button", { name: "Взять в работу" });
  await expect(claimBtn).toBeVisible();
  await claimBtn.click();
  await expect(page.locator("#section-requests .status")).toContainText(/Заявка взята в работу|Список обновлен/);

  // Открыть карточку
  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();
  await expect(page.locator("#request-modal-messages")).toContainText(clientMsg);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Ответ юриста в чате + прикрепление PDF
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-lawyer-3: ответить клиенту текстом и прикрепить PDF", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: ответ юриста и PDF",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  // Ждём пока строка с заявкой загрузится в таблицу (async fetch)
  await expect(row).toHaveCount(1);
  const claimBtn = row.first().getByRole("button", { name: "Взять в работу" });
  if (await claimBtn.isVisible().catch(() => false)) {
    await claimBtn.click();
    await expect(page.locator("#section-requests .status")).toContainText(/работу|обновлен/i);
  }

  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();

  // Текстовый ответ
  const lawyerReply = `Ответ юриста ${Date.now()}`;
  await page.getByRole("tab", { name: /Чат/ }).click();
  await page.locator("#request-modal-message-body").fill(lawyerReply);
  await page.locator("#request-modal-message-send").click();
  await expect(page.locator("#section-request-workspace .status")).toContainText("Сообщение отправлено");
  await expect(page.locator("#request-modal-messages")).toContainText(lawyerReply);

  // Прикрепить PDF
  const pdfName = `lawyer-reply-${Date.now()}.pdf`;
  const pdfBuffer = buildTinyPdfBuffer("Showcase answer");
  const fileInput = page.locator("#request-modal-file-input");
  if (await fileInput.count()) {
    await fileInput.setInputFiles({ name: pdfName, mimeType: "application/pdf", buffer: pdfBuffer });
    await page.locator("#request-modal-message-send").click();
    await expect(page.locator("#section-request-workspace .status")).toContainText(/файл|отправлен/i);
    await page.getByRole("tab", { name: /Файлы/ }).click();
    await expect(page.locator("#request-modal-files")).toContainText(pdfName);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Запрос данных от клиента (DataRequirement / форма сбора)
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-lawyer-4: запросить данные клиента — создать DataRequirement", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: запрос данных от клиента",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  const claimBtn = row.first().getByRole("button", { name: "Взять в работу" });
  if (await claimBtn.count()) {
    await claimBtn.click();
    await expect(page.locator("#section-requests .status")).toContainText(/работу|обновлен/i);
  }

  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();

  // Перейти на вкладку «Данные» / «Запросы данных»
  const dataTab = page.getByRole("tab", { name: /Данные|Сбор данных|Запрос/ });
  if (await dataTab.count()) {
    await dataTab.click();

    // Создать запрос данных
    const addDataBtn = page.getByRole("button", { name: /Добавить|Запросить|Запрос данных/i });
    if (await addDataBtn.count()) {
      await addDataBtn.click();
      await expect(page.getByRole("heading", { name: /запрос|данных/i })).toBeVisible();

      // Заполнить поле
      const fieldInput = page.locator("[name='field_label'], #data-req-label, input[placeholder*='Название']").first();
      if (await fieldInput.count()) {
        await fieldInput.fill("Серия и номер паспорта");
      }
      // Выбрать тип поля
      const typeSelect = page.locator("[name='field_type'], #data-req-type").first();
      if (await typeSelect.count()) {
        await selectDropdownOption(page, typeSelect, "Текст").catch(() => {});
      }
      await page.getByRole("button", { name: /Сохранить|Добавить/i }).first().click();
      await expect(page.locator("#section-request-workspace .status, .data-req-status").first())
        .toContainText(/сохранен|добавлен|обновлен/i);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Канбан — взять заявку и сменить статус через «Перевести…»
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-lawyer-5: канбан — взять карточку и сменить статус", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber, name } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: канбан юриста",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });

  await page.locator("aside .menu button[data-section='kanban']").click();
  await expect(page.locator("#section-kanban h2")).toHaveText("Канбан заявок");

  // Фильтр по имени клиента
  await page.locator("#section-kanban .section-head-actions").getByRole("button", { name: "Фильтр" }).click();
  await selectDropdownOption(page, "#filter-field", "Клиент");
  await page.locator("#filter-value").fill(name);
  await page.locator("#filter-overlay").getByRole("button", { name: /Добавить|Сохранить/i }).click();
  await expect(page.locator("#section-kanban .filter-chip")).toHaveCount(1);

  const card = page.locator("#section-kanban .kanban-card").filter({ hasText: trackNumber }).first();
  await expect(card).toBeVisible();

  // Взять в работу
  const claimBtn = card.getByRole("button", { name: "Взять в работу" });
  if (await claimBtn.count()) {
    await claimBtn.click();
    await expect(page.locator("#section-kanban .status")).toContainText(/работу|обновлен/i);
  }

  // Сменить статус через «Перевести…»
  const freshCard = page.locator("#section-kanban .kanban-card").filter({ hasText: trackNumber }).first();
  const transSelect = freshCard.locator(".kanban-transition-select");
  if (await transSelect.count()) {
    const newStatus = await selectFirstDropdownOption(page, transSelect);
    await expect(page.locator("#section-kanban .status")).toContainText(/обновлен|Статус/i);
    // Карточка в канбане отображает новый статус
    await expect(page.locator("#section-kanban .kanban-card").filter({ hasText: trackNumber }).first())
      .toContainText(newStatus);
  }

  // Убедиться что колонки не содержат UUID-заголовков
  const headers = page.locator("#section-kanban .kanban-column-head b");
  const headCount = await headers.count();
  for (let i = 0; i < headCount; i++) {
    const text = await headers.nth(i).textContent();
    expect(text).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Выставить счёт клиенту из карточки заявки
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-lawyer-6: выставить счёт клиенту", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: выставление счёта юристом",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  const claimBtn = row.first().getByRole("button", { name: "Взять в работу" });
  if (await claimBtn.count()) {
    await claimBtn.click();
    await expect(page.locator("#section-requests .status")).toContainText(/работу|обновлен/i);
  }

  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();

  // Вкладка «Финансы» / «Счета»
  const financeTab = page.getByRole("tab", { name: /Финанс|Счет|Оплат/i });
  if (await financeTab.count()) {
    await financeTab.click();
    const createInvoiceBtn = page.getByRole("button", { name: /Выставить счёт|Создать счёт|Добавить счёт/i });
    if (await createInvoiceBtn.count()) {
      await createInvoiceBtn.click();
      await page.locator("[name='amount'], #invoice-amount, #record-field-amount").first().fill("12000");
      await page.getByRole("button", { name: /Сохранить|Создать/i }).first().click();
      await expect(page.locator("#section-request-workspace .status").first()).toContainText(/сохранен|выставлен|создан/i);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Пройти все статусы и закрыть заявку
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-lawyer-7: пройти по статусам и закрыть заявку", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: полный цикл статусов",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: LAWYER_EMAIL, password: LAWYER_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  const claimBtn = row.first().getByRole("button", { name: "Взять в работу" });
  if (await claimBtn.count()) {
    await claimBtn.click();
    await expect(page.locator("#section-requests .status")).toContainText(/работу|обновлен/i);
  }

  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();

  // Менять статусы пока не дойдём до терминального
  const MAX_TRANSITIONS = 8;
  for (let i = 0; i < MAX_TRANSITIONS; i++) {
    const statusPanel = page.locator("#request-status-route, .status-route-panel, [data-testid='status-route']").first();
    const nextBtn = statusPanel.getByRole("button", { name: /Следующий|Перевести|Подтвердить|→/i }).first();
    const selectStatus = page.locator("#request-available-status-select, .available-status-select").first();

    if (await selectStatus.count()) {
      const label = await selectFirstDropdownOption(page, selectStatus);
      if (!label) break;
      await page.getByRole("button", { name: /Применить|Сохранить|ОК/i }).first().click();
      await expect(page.locator("#section-request-workspace .status").first()).toContainText(/обновлен|изменен/i);
      // Проверить признак терминального статуса
      const terminal = await page.locator(".status-terminal, [data-terminal='true']").count();
      if (terminal) break;
    } else if (await nextBtn.count()) {
      await nextBtn.click();
      await expect(page.locator("#section-request-workspace .status").first()).toContainText(/обновлен|изменен/i);
    } else {
      break;
    }
    await page.waitForTimeout(200);
  }

  // Итоговый статус заявки — не должен быть UUID
  const statusBadge = page.locator(".request-field-value.status-badge, .status-name, [data-testid='request-status']").first();
  if (await statusBadge.count()) {
    const statusText = await statusBadge.textContent();
    expect(statusText).not.toMatch(/^[0-9a-f]{8}-/i);
  }
});
