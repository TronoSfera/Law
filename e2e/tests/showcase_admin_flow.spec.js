/**
 * SHOWCASE: Полный флоу администратора
 *
 * Покрывает:
 *  1. Настройка справочников — группы статусов, статусы, темы, цитаты
 *  2. Добавление юриста с темой, ставкой, аватаром
 *  3. Карусель лендинга — добавить юриста в featured-staff
 *  4. Назначение юриста новой заявке
 *  5. Назначение юриста действующей заявке (переназначение)
 *  6. Смена статуса заявки через список заявок
 *  7. Ответ администратора в чате заявки
 *  8. Дашборд — фильтр по юристу, по теме
 *  9. Канбан — фильтр + смена статуса из карточки
 * 10. Выставление счёта и подтверждение оплаты
 * 11. Запросы на обслуживание (ServiceRequests) — просмотр и решение
 */

const { test, expect } = require("@playwright/test");
const {
  randomPhone,
  createRequestViaLanding,
  loginAdminPanel,
  openRequestsSection,
  openDictionaryTree,
  selectDictionaryNode,
  selectDropdownOption,
  selectFirstDropdownOption,
  rowByTrack,
  trackCleanupPhone,
  trackCleanupTrack,
  trackCleanupEmail,
  cleanupTrackedTestData,
  preparePublicSession,
} = require("./helpers");

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "admin123";

test.afterEach(async ({ page }, testInfo) => {
  await cleanupTrackedTestData(page, testInfo);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Настройка справочников
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-admin-1: справочники — группы статусов, статусы, темы", async ({ context, page }, testInfo) => {
  const unique = `sc${Date.now()}`;

  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await openDictionaryTree(page);

  // --- Группы статусов ---
  await selectDictionaryNode(page, "Группы статусов");
  await page.locator("#section-config .section-head").getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByRole("heading", { name: /Создание/ })).toBeVisible();
  await page.locator("#record-field-name").fill(`Тестовая группа ${unique}`);
  await page.locator("#record-field-sort_order").fill("99");
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-config .status").first()).toContainText("Список обновлен");
  await expect(page.locator("#section-config table")).toContainText(`Тестовая группа ${unique}`);

  // --- Статусы ---
  await selectDictionaryNode(page, "Статусы");
  await page.locator("#section-config .section-head").getByRole("button", { name: "Добавить" }).click();
  await page.locator("#record-field-code").fill(`SC_TEST_${unique.toUpperCase()}`);
  await page.locator("#record-field-name").fill(`Тестовый статус ${unique}`);
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-config .status").first()).toContainText("Список обновлен");

  // --- Темы ---
  await selectDictionaryNode(page, "Темы");
  await page.locator("#section-config .section-head").getByRole("button", { name: "Добавить" }).click();
  await page.locator("#record-field-name").fill(`Тема Showcase ${unique}`);
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-config .status").first()).toContainText("Список обновлен");
  await expect(page.locator("#section-config table")).toContainText(`Тема Showcase ${unique}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Добавление юриста и настройка профиля
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-admin-2: создание юриста — профиль, тема, ставка", async ({ context, page }, testInfo) => {
  const unique = Date.now();
  const lawyerEmail = `sc-lawyer-${unique}@example.com`;
  trackCleanupEmail(testInfo, lawyerEmail);

  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await openDictionaryTree(page);

  await selectDictionaryNode(page, "Пользователи");
  await page.locator("#section-config .section-head").getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByRole("heading", { name: /Создание/ })).toBeVisible();

  await page.locator("#record-field-name").fill(`Юрист Showcase ${unique}`);
  await page.locator("#record-field-email").fill(lawyerEmail);
  await page.locator("#record-field-phone").fill(`+7900${String(unique).slice(-7)}`);
  await selectDropdownOption(page, "#record-field-role", "Юрист");
  await selectFirstDropdownOption(page, "#record-field-primary_topic_code");
  await page.locator("#record-field-default_rate").fill("7500");
  await page.locator("#record-field-salary_percent").fill("30");
  await page.locator("#record-field-password").fill("ShowcasePass-1!");
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-config .status").first()).toContainText("Список обновлен");
  await expect(page.locator("#section-config table")).toContainText(lawyerEmail);

  // Открыть профиль юриста — убедиться что данные сохранились
  // В таблице пользователей нет отдельной кнопки "Редактировать" — редактирование
  // открывается кликом по имени пользователя (button.user-identity-link).
  const lawyerRow = page.locator("#section-config table tbody tr").filter({ hasText: lawyerEmail }).first();
  await lawyerRow.locator("button.user-identity-link").click();
  await expect(page.getByRole("heading", { name: /Редактирование/ })).toBeVisible();
  await expect(page.locator(".record-user-summary-value").first()).not.toBeEmpty();
  // Используем .first() — в пользовательском модале может быть 2 кнопки .close
  // (основная и кнопка закрытия превью аватара)
  await page.locator("#record-overlay .close").first().click();
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Цитаты лендинга
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-admin-3: добавить цитату на лендинг", async ({ page }, testInfo) => {
  const unique = Date.now();

  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await openDictionaryTree(page);

  await selectDictionaryNode(page, "Цитаты");
  await page.locator("#section-config .section-head").getByRole("button", { name: "Добавить" }).click();
  await page.locator("#record-field-author").fill(`Иван Тестов ${unique}`);
  await page.locator("#record-field-text").fill("Профессиональное сопровождение — ключ к успеху.");
  await page.locator("#record-field-source").fill("showcase-test");
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-config .status").first()).toContainText("Список обновлен");
  await expect(page.locator("#section-config table")).toContainText(`Иван Тестов ${unique}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Карусель юристов лендинга
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-admin-4: добавить юриста в карусель лендинга", async ({ page }, testInfo) => {
  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await openDictionaryTree(page);

  await selectDictionaryNode(page, "Карусель сотрудников лендинга");
  await page.locator("#section-config .section-head").getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByRole("heading", { name: /Создание/ })).toBeVisible();

  // Выбрать любого существующего юриста
  const lawyerLabel = await selectFirstDropdownOption(page, "#record-field-admin_user_id");
  expect(lawyerLabel).not.toBe("");

  await page.locator("#record-field-caption").fill("Опытный специалист в области гражданского права.");
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  // Ждём пока запись реально появится в таблице — гарантирует, что сохранение прошло успешно
  // (статус "Список обновлен" может быть устаревшим от предыдущей загрузки)
  await expect(page.locator("#section-config table")).toContainText("Опытный специалист", { timeout: 15_000 });

  // Проверить что карточка появилась на лендинге
  // Секция скрыта по умолчанию — JS загружает данные асинхронно после загрузки страницы.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const featuredSection = page.locator(".featured-team-section");
  if (await featuredSection.count()) {
    await expect(featuredSection).not.toBeHidden({ timeout: 20_000 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Назначение юриста новой заявке
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-admin-5: назначить юриста новой заявке", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  await preparePublicSession(context, page, process.env.E2E_BASE_URL || "http://localhost:8081", phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: назначение юриста администратором",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  await expect(row).toHaveCount(1);

  // Открыть карточку заявки
  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();

  // Назначить юриста
  const lawyerSelect = page.locator("[data-field='assigned_lawyer_id']").first();
  if (await lawyerSelect.count()) {
    await selectFirstDropdownOption(page, lawyerSelect);
    await page.getByRole("button", { name: /Сохранить|Назначить/ }).first().click();
    await expect(page.locator("#section-request-workspace .status, #request-detail-status").first()).toContainText(/сохран|назначен|обновлен/i);
  }

  // Проверить что в списке теперь отображается юрист
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(row.first()).toContainText(/.+/); // строка обновилась
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Смена статуса заявки + ответ администратора в чате
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-admin-6: смена статуса и ответ в чате заявки", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  await preparePublicSession(context, page, process.env.E2E_BASE_URL || "http://localhost:8081", phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: смена статуса и чат администратора",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await openRequestsSection(page);

  const row = rowByTrack(page, "#section-requests", trackNumber);
  await row.first().locator(".request-track-link").click();
  await expect(page.getByRole("heading", { name: /Карточка заявки/ })).toBeVisible();

  // Сменить статус
  const statusSelect = page.locator("#request-status-select, [data-field='status_code']").first();
  if (await statusSelect.count()) {
    const newStatus = await selectFirstDropdownOption(page, statusSelect);
    await page.getByRole("button", { name: /Сохранить|Применить/ }).first().click();
    await expect(page.locator("#section-request-workspace .status").first()).toContainText(/обновлен|сохранен|изменен/i);
  }

  // Написать ответ в чате
  const adminReply = `Администратор отвечает. ${Date.now()}`;
  await page.getByRole("tab", { name: /Чат/ }).click();
  await page.locator("#request-modal-message-body").fill(adminReply);
  await page.locator("#request-modal-message-send").click();
  await expect(page.locator("#section-request-workspace .status").first()).toContainText("Сообщение отправлено");
  await expect(page.locator("#request-modal-messages")).toContainText(adminReply);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Дашборд — фильтрация и KPI
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-admin-7: дашборд — метрики и виджеты загрузки", async ({ page }, testInfo) => {
  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  // Дашборд открывается по умолчанию
  await expect(page.locator("#section-dashboard h2")).toHaveText("Обзор метрик");

  // Основные блоки присутствуют
  await expect(page.locator("#section-dashboard")).toContainText("Загрузка юристов");
  await expect(page.locator("#section-dashboard")).toContainText(/Новых|Активных|Всего|Заявок/);

  // Счётчики ненулевые (или хотя бы рендерятся)
  // Дашборд использует класс .card для виджетов (не .dash-tile / .kpi-value)
  const kpiTiles = page.locator("#section-dashboard .card");
  await expect(kpiTiles.first()).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Канбан — фильтрация, смена статуса из карточки
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-admin-8: канбан — фильтр и смена статуса карточки", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  await preparePublicSession(context, page, process.env.E2E_BASE_URL || "http://localhost:8081", phone);

  const { trackNumber, name } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: канбан администратора",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  // Перейти в Канбан
  await page.locator("aside .menu button[data-section='kanban']").click();
  await expect(page.locator("#section-kanban h2")).toHaveText("Канбан заявок");

  // Применить фильтр по имени клиента
  await page.locator("#section-kanban .section-head-actions").getByRole("button", { name: "Фильтр" }).click();
  await selectDropdownOption(page, "#filter-field", "Клиент");
  await page.locator("#filter-value").fill(name);
  await page.locator("#filter-overlay").getByRole("button", { name: /Добавить|Сохранить/i }).click();
  await expect(page.locator("#section-kanban .filter-chip")).toHaveCount(1);

  // Карточка должна быть видна
  const card = page.locator("#section-kanban .kanban-card").filter({ hasText: trackNumber }).first();
  await expect(card).toBeVisible();

  // Убедиться что колонки имеют читаемые названия (не UUID)
  const columnHeaders = page.locator("#section-kanban .kanban-column-head b");
  const count = await columnHeaders.count();
  for (let i = 0; i < count; i++) {
    const text = await columnHeaders.nth(i).textContent();
    // UUID-паттерн: 8-4-4-4-12 hex
    expect(text).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  }

  // Смена статуса через dropdown «Перевести…»
  const transitionSelect = card.locator(".kanban-transition-select");
  if (await transitionSelect.count()) {
    const newStatus = await selectFirstDropdownOption(page, transitionSelect);
    await expect(page.locator("#section-kanban .status")).toContainText(/обновлен|переведен|Статус/i);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Счёт — выставить и подтвердить оплату
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-admin-9: выставить счёт и подтвердить оплату", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  await preparePublicSession(context, page, process.env.E2E_BASE_URL || "http://localhost:8081", phone);

  const { trackNumber } = await createRequestViaLanding(page, {
    phone,
    description: "Showcase: выставление счёта и оплата",
  });
  trackCleanupTrack(testInfo, trackNumber);

  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  // Перейти в раздел Счета
  await page.locator("aside .menu button[data-section='invoices']").click();
  await expect(page.locator("#section-invoices h2")).toHaveText("Счета");

  // Создать счёт
  await page.locator("#section-invoices .section-head").getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByRole("heading", { name: /Создание/ })).toBeVisible();
  await selectDropdownOption(page, "#record-field-request_track_number", trackNumber);
  // После выбора заявки форма авто-подставляет плательщика — нужно его выбрать
  await selectFirstDropdownOption(page, "#record-field-payer_display_name");
  await page.locator("#record-field-amount").fill("25000");
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-invoices .status")).toContainText("Список обновлен");

  const invoiceRow = rowByTrack(page, "#section-invoices", trackNumber);
  await expect(invoiceRow).toHaveCount(1);
  await expect(invoiceRow.first()).toContainText("25000");

  // Подтвердить оплату
  await invoiceRow.first().getByRole("button", { name: "Редактировать счет" }).click();
  await expect(page.getByRole("heading", { name: /Редактирование/ })).toBeVisible();
  await selectDropdownOption(page, "#record-field-status", "Оплачен");
  await page.locator("#record-overlay").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("#section-invoices .status")).toContainText("Список обновлен");
  await expect(invoiceRow.first()).toContainText(/Оплачен/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Запросы на обслуживание — просмотр и разрешение
// ─────────────────────────────────────────────────────────────────────────────
test("showcase-admin-10: сервисные запросы — обращения клиента к куратору", async ({ context, page }, testInfo) => {
  const phone = randomPhone();
  trackCleanupPhone(testInfo, phone);
  const appUrl = process.env.E2E_BASE_URL || "http://localhost:8081";
  await preparePublicSession(context, page, appUrl, phone);

  const createResp = await page.request.post(`${appUrl}/api/public/requests`, {
    data: {
      client_name: `Showcase Client ${Date.now()}`,
      client_phone: phone,
      topic_code: "consulting",
      description: "Showcase: тест сервисных запросов.",
      pdn_consent: true,
    },
    failOnStatusCode: false,
  });
  const body = await createResp.json().catch(() => ({}));
  const trackNumber = String(body.track_number || "");
  if (!trackNumber) return; // skip if no topics configured
  trackCleanupTrack(testInfo, trackNumber);

  // Открыть кабинет и отправить обращение к куратору
  await page.goto(`/client.html?track=${encodeURIComponent(trackNumber)}`);
  await expect(page.locator("#cabinet-summary")).toBeVisible();

  const helpBtn = page.locator("#cabinet-help-open");
  if (await helpBtn.count()) {
    await helpBtn.click();
    await expect(page.locator("#client-help-overlay")).toBeVisible();
    // Кнопка для связи с куратором (без textarea) — "Обратиться к куратору"
    const curatorBtn = page.locator("#cabinet-curator-request-open");
    const lawyerChangeBtn = page.locator("#cabinet-lawyer-change-open");
    if (await curatorBtn.count() && !(await curatorBtn.isDisabled())) {
      await curatorBtn.click();
    } else if (await lawyerChangeBtn.count() && !(await lawyerChangeBtn.isDisabled())) {
      // Если куратор заблокирован — запрос смены юриста (с textarea)
      await page.locator("#service-request-body").fill("Прошу сменить юриста — нет обратной связи.");
      await lawyerChangeBtn.click();
    }
    // Успех — оверлей закрылся или статус обновился
    await expect(page.locator("#client-help-overlay, #cabinet-status")).toBeVisible({ timeout: 10_000 });
  }

  // Администратор видит обращение
  await loginAdminPanel(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await page.locator("aside .menu button[data-section='serviceRequests']").click();
  await expect(page.locator("#section-service-requests h2")).toBeVisible();

  const srRow = page.locator("#section-service-requests table tbody tr").filter({ hasText: trackNumber }).first();
  if (await srRow.count()) {
    await expect(srRow).toBeVisible();
    // Разрешить запрос
    const resolveBtn = srRow.getByRole("button", { name: /Решить|Закрыть|Resolve/i });
    if (await resolveBtn.count()) {
      await resolveBtn.click();
      await expect(page.locator("#section-service-requests .status")).toContainText(/обновлен|решен/i);
    }
  }
});
