# E2E Backlog (P0 / P1 / P2) и Текущее Покрытие

## Назначение
Файл раскладывает role-based матрицу `/Users/tronosfera/Develop/Law/context/13_role_flows_test_matrix.md`
в конкретный backlog Playwright-сценариев:
1. приоритет (`P0`, `P1`, `P2`);
2. статус покрытия (`Покрыто`, `Частично`, `Не покрыто`);
3. что уже проверяется текущими e2e-спеками;
4. что нужно дописать.

## Текущее покрытие (сводно)

### Уже есть e2e-спеки
1. `/Users/tronosfera/Develop/Law/e2e/tests/admin_entry_flow.spec.js`
2. `/Users/tronosfera/Develop/Law/e2e/tests/admin_role_flow.spec.js`
3. `/Users/tronosfera/Develop/Law/e2e/tests/kanban_role_flow.spec.js`
4. `/Users/tronosfera/Develop/Law/e2e/tests/lawyer_role_flow.spec.js`
5. `/Users/tronosfera/Develop/Law/e2e/tests/public_client_flow.spec.js`
6. `/Users/tronosfera/Develop/Law/e2e/tests/request_data_file_flow.spec.js`

### Legacy / к замене
1. `/Users/tronosfera/Develop/Law/e2e/tests/admin_status_designer_flow.spec.js`
   - относится к скрытому UI-конструктору переходов статусов;
   - держать как legacy до физической зачистки backend/UI;
   - в новом плане не расширять.

## P0 (критические сквозные роли и деньги)

| ID | Сценарий | Роль | Покрытие | Текущий e2e | Что дописать |
|---|---|---|---|---|---|
| E2E-P0-01 | Лендинг -> создание заявки -> кабинет клиента | CLIENT | `Покрыто` | `public_client_flow` | добавить проверки важной даты и скрытия финансовых полей |
| E2E-P0-02 | Клиент чат + файл + предпросмотр + fallback невалидного PDF/TXT | CLIENT | `Частично` | `public_client_flow` | добавить отдельный spec на error/fallback preview и лимиты |
| E2E-P0-03 | Юрист: claim -> карточка заявки -> чат -> файл -> смена статуса | LAWYER | `Частично` | `lawyer_role_flow` | перевести смену статуса на новую модалку (статус, важная дата, комментарий, файл) |
| E2E-P0-04 | Юрист: запрос доп.данных (`file`) -> клиент загружает -> юрист видит выполнение | LAWYER + CLIENT | `Покрыто` | `request_data_file_flow` | расширить на частичное заполнение и повторное дозаполнение |
| E2E-P0-05 | Канбан юриста: фильтр/сортировка + claim + переход в карточку | LAWYER | `Покрыто` | `kanban_role_flow` | добавить drag&drop смену статуса с важной датой |
| E2E-P0-06 | Админ: пользователи/темы/счета/availableTables | ADMIN | `Частично` | `admin_role_flow` | добавить статус-модалку, стоимость заявки, клиентский селектор |
| E2E-P0-07 | Полный цикл: клиент -> юрист -> терминальный статус -> клиент видит завершение | CLIENT + LAWYER | `Не покрыто` | - | новый сквозной сценарий |
| E2E-P0-08 | Платежный цикл: счет -> оплата админом -> dashboard/выручка/зарплата | ADMIN | `Не покрыто` | - | новый сценарий по счетам и дашборду |
| E2E-P0-09 | RBAC UI: клиент не видит служебные/финансовые поля | CLIENT | `Частично` | косвенно в `public_client_flow` | явные ассерт-проверки отсутствия элементов |

## P1 (операционные сценарии и corner cases по ролям)

| ID | Сценарий | Роль | Покрытие | Текущий e2e | Что дописать |
|---|---|---|---|---|---|
| E2E-P1-01 | Клиент: 2-5 заявок на один телефон, переключение между заявками | CLIENT | `Не покрыто` | - | новый spec multi-request switch |
| E2E-P1-02 | Клиент: OTP вход через модалку на лендинге (без JWT) | CLIENT | `Не покрыто` | - | новый spec, без bypass verify-route или с controlled bypass |
| E2E-P1-03 | Клиент: ошибки загрузки файла (25MB/250MB/обрыв) | CLIENT | `Не покрыто` | - | негативный spec (mock network + oversized fixture) |
| E2E-P1-04 | Клиент: слишком длинное/пустое сообщение | CLIENT | `Не покрыто` | - | негативный spec по чату |
| E2E-P1-05 | Юрист: drag&drop в группу с несколькими статусами -> модалка выбора статуса | LAWYER | `Не покрыто` | - | новый spec на канбан + модалку |
| E2E-P1-06 | Юрист: статус-модалка с историей статусов и важной датой | LAWYER | `Не покрыто` | - | новый spec на карточку заявки |
| E2E-P1-07 | Юрист: терминальный статус (завершение) | LAWYER | `Не покрыто` | - | добавить в `lawyer_role_flow` или отдельный spec |
| E2E-P1-08 | Юрист: не может редактировать заполненные клиентом доп.данные | LAWYER | `Частично` | косвенно `request_data_file_flow` | добавить явный запрет в UI |
| E2E-P1-09 | Админ: дашборд (выручка/расходы/плитки юристов/модалка статистики) | ADMIN | `Частично` | `admin_role_flow` (только наличие секции) | новый spec на метрики и модалку юриста |
| E2E-P1-10 | Админ: редактирование заявки (выбор клиента/создание нового, стоимость заявки) | ADMIN | `Не покрыто` | - | новый spec на форму заявки |
| E2E-P1-11 | Админ: смена статуса заявки через новую модалку + важная дата | ADMIN | `Не покрыто` | - | новый spec |
| E2E-P1-12 | Админ/LAWYER: просмотр PDF счета/вложения в iframe preview | ADMIN + LAWYER | `Частично` | `lawyer_role_flow`, `public_client_flow` | отдельный стабильный preview spec |

## P2 (расширенный UX/regression/edge flows)

| ID | Сценарий | Роль | Покрытие | Текущий e2e | Что дописать |
|---|---|---|---|---|---|
| E2E-P2-01 | Клиент/юрист: unread индикаторы сообщений/файлов сбрасываются при открытии заявки | CLIENT + LAWYER | `Частично` | `lawyer_role_flow` | детальный spec на оба типа индикаторов |
| E2E-P2-02 | Канбан: фильтр по полям + сортировка + сохранение визуального состояния кнопок | LAWYER/ADMIN | `Частично` | `kanban_role_flow` | расширить перечень фильтров и сортировку |
| E2E-P2-03 | Universal dictionaries UI (CRUD справочников) после `availableTables` переключений | ADMIN | `Частично` | `admin_role_flow` | вынести в отдельный regression spec |
| E2E-P2-04 | Tooltip/модалки/overflow layering regression | ADMIN | `Не покрыто` | - | visual/smoke spec по tooltip overlay и scroll containers |
| E2E-P2-05 | Форма запроса данных: шаблон (создать/перезаписать/чужой readonly badge) | LAWYER | `Частично` | `request_data_file_flow` (без шаблонов) | отдельный spec на шаблоны |
| E2E-P2-06 | Клиент: невалидный PDF и `.txt` с кривым MIME -> fallback preview | CLIENT | `Не покрыто` | - | отдельный preview-fallback spec |

## Приоритет реализации (рекомендуемый порядок)

### Волна 1 (P0)
1. `E2E-P0-03` (обновить `lawyer_role_flow` под новую статус-модалку)
2. `E2E-P0-07` (полный цикл клиент -> юрист -> завершение)
3. `E2E-P0-08` (платежный цикл и dashboard)
4. `E2E-P0-09` (явный RBAC UI check клиента)

### Волна 2 (P1)
1. `E2E-P1-05`, `E2E-P1-06`, `E2E-P1-07` (канбан + статусы)
2. `E2E-P1-09`, `E2E-P1-10`, `E2E-P1-11` (админские сценарии)
3. `E2E-P1-01`, `E2E-P1-03`, `E2E-P1-04` (клиентские corner cases)

### Волна 3 (P2)
1. Preview fallback, tooltip/overflow regressions, шаблоны запросов данных

## Политика чистки данных после тестов (важно)
1. Все e2e-спеки должны регистрировать созданные `track/phone/email` и выполнять cleanup в `afterEach`.
2. Cleanup идет через локальный endpoint `/api/admin/test-utils/cleanup-test-data` (только `APP_ENV != production`).
3. Для не-e2e прогонов на рабочем dev-стенде использовать CLI:
```bash
docker compose exec -T backend python -m app.data.cleanup_test_artifacts
```
4. Ручной сид (`TRK-MAN-*`, `lawyer*.manual@example.com`) не подпадает под e2e cleanup-паттерны и должен сохраняться для приемки.
