(function () {
  const { useCallback, useEffect, useMemo, useRef, useState } = React;

  const LS_TOKEN = "admin_access_token";
  const PAGE_SIZE = 50;
  const DEFAULT_FORM_FIELD_TYPES = ["string", "text", "number", "boolean", "date"];
  const ALL_OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "~"];
  const OPERATOR_LABELS = {
    "=": "=",
    "!=": "!=",
    ">": ">",
    "<": "<",
    ">=": ">=",
    "<=": "<=",
    "~": "~",
  };

  const ROLE_LABELS = {
    ADMIN: "Администратор",
    LAWYER: "Юрист",
  };

  const STATUS_LABELS = {
    NEW: "Новая",
    IN_PROGRESS: "В работе",
    WAITING_CLIENT: "Ожидание клиента",
    WAITING_COURT: "Ожидание суда",
    RESOLVED: "Решена",
    CLOSED: "Закрыта",
    REJECTED: "Отклонена",
  };
  const INVOICE_STATUS_LABELS = {
    WAITING_PAYMENT: "Ожидает оплату",
    PAID: "Оплачен",
    CANCELED: "Отменен",
  };
  const STATUS_KIND_LABELS = {
    DEFAULT: "Обычный",
    INVOICE: "Выставление счета",
    PAID: "Оплачено",
  };

  const REQUEST_UPDATE_EVENT_LABELS = {
    MESSAGE: "сообщение",
    ATTACHMENT: "файл",
    STATUS: "статус",
  };

  const TABLE_SERVER_CONFIG = {
    requests: {
      table: "requests",
      endpoint: "/api/admin/crud/requests/query",
      sort: [{ field: "created_at", dir: "desc" }],
    },
    invoices: {
      table: "invoices",
      endpoint: "/api/admin/invoices/query",
      sort: [{ field: "issued_at", dir: "desc" }],
    },
    quotes: {
      table: "quotes",
      endpoint: "/api/admin/crud/quotes/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
    topics: {
      table: "topics",
      endpoint: "/api/admin/crud/topics/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
    statuses: {
      table: "statuses",
      endpoint: "/api/admin/crud/statuses/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
    formFields: {
      table: "form_fields",
      endpoint: "/api/admin/crud/form_fields/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
    topicRequiredFields: {
      table: "topic_required_fields",
      endpoint: "/api/admin/crud/topic_required_fields/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
    topicDataTemplates: {
      table: "topic_data_templates",
      endpoint: "/api/admin/crud/topic_data_templates/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
    statusTransitions: {
      table: "topic_status_transitions",
      endpoint: "/api/admin/crud/topic_status_transitions/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
    users: {
      table: "admin_users",
      endpoint: "/api/admin/crud/admin_users/query",
      sort: [{ field: "created_at", dir: "desc" }],
    },
    userTopics: {
      table: "admin_user_topics",
      endpoint: "/api/admin/crud/admin_user_topics/query",
      sort: [{ field: "created_at", dir: "desc" }],
    },
  };

  const TABLE_MUTATION_CONFIG = Object.fromEntries(
    Object.entries(TABLE_SERVER_CONFIG).map(([tableKey, config]) => [
      tableKey,
      {
        create: "/api/admin/crud/" + config.table,
        update: (id) => "/api/admin/crud/" + config.table + "/" + id,
        delete: (id) => "/api/admin/crud/" + config.table + "/" + id,
      },
    ])
  );
  TABLE_MUTATION_CONFIG.invoices = {
    create: "/api/admin/invoices",
    update: (id) => "/api/admin/invoices/" + id,
    delete: (id) => "/api/admin/invoices/" + id,
  };
  const TABLE_KEY_ALIASES = {
    form_fields: "formFields",
    topic_required_fields: "topicRequiredFields",
    topic_data_templates: "topicDataTemplates",
    topic_status_transitions: "statusTransitions",
    admin_users: "users",
    admin_user_topics: "userTopics",
  };
  const TABLE_UNALIASES = Object.fromEntries(Object.entries(TABLE_KEY_ALIASES).map(([table, alias]) => [alias, table]));
  const KNOWN_CONFIG_TABLE_KEYS = new Set([
    "quotes",
    "topics",
    "statuses",
    "formFields",
    "topicRequiredFields",
    "topicDataTemplates",
    "statusTransitions",
    "users",
    "userTopics",
  ]);

  function createTableState() {
    return {
      filters: [],
      sort: null,
      offset: 0,
      total: 0,
      showAll: false,
      rows: [],
    };
  }

  function humanizeKey(value) {
    const text = String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "-";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function metaKindToFilterType(kind) {
    if (kind === "boolean") return "boolean";
    if (kind === "number") return "number";
    if (kind === "date" || kind === "datetime") return "date";
    return "text";
  }

  function metaKindToRecordType(kind) {
    if (kind === "boolean") return "boolean";
    if (kind === "number") return "number";
    if (kind === "json") return "json";
    return "text";
  }

  function decodeJwtPayload(token) {
    try {
      const payload = token.split(".")[1] || "";
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  function sortByName(items) {
    return [...items].sort((a, b) => String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""), "ru"));
  }

  function roleLabel(role) {
    return ROLE_LABELS[role] || role || "-";
  }

  function statusLabel(code) {
    return STATUS_LABELS[code] || code || "-";
  }

  function invoiceStatusLabel(code) {
    return INVOICE_STATUS_LABELS[code] || code || "-";
  }

  function statusKindLabel(code) {
    return STATUS_KIND_LABELS[code] || code || "-";
  }

  function boolLabel(value) {
    return value ? "Да" : "Нет";
  }

  function boolFilterLabel(value) {
    return value ? "True" : "False";
  }

  function fmtDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ru-RU");
  }

  function userInitials(name, email) {
    const source = String(name || "").trim();
    if (source) {
      const parts = source.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return source.slice(0, 2).toUpperCase();
    }
    const mail = String(email || "").trim();
    return (mail.slice(0, 2) || "U").toUpperCase();
  }

  function avatarColor(seed) {
    const palette = ["#6f8fa9", "#568f7d", "#a07a5c", "#7d6ea9", "#8f6f8f", "#7f8c5a"];
    const text = String(seed || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  }

  function resolveAvatarSrc(avatarUrl, accessToken) {
    const raw = String(avatarUrl || "").trim();
    if (!raw) return "";
    if (raw.startsWith("s3://")) {
      const key = raw.slice("s3://".length);
      if (!key || !accessToken) return "";
      return "/api/admin/uploads/object/" + encodeURIComponent(key) + "?token=" + encodeURIComponent(accessToken);
    }
    return raw;
  }

  function buildUniversalQuery(filters, sort, limit, offset) {
    return {
      filters: filters || [],
      sort: sort || [],
      page: { limit: limit ?? PAGE_SIZE, offset: offset ?? 0 },
    };
  }

  function canAccessSection(role, section) {
    if (section === "quotes" || section === "config") return role === "ADMIN";
    return true;
  }

  function translateApiError(message) {
    const direct = {
      "Missing auth token": "Отсутствует токен авторизации",
      "Missing bearer token": "Отсутствует токен авторизации",
      "Invalid token": "Некорректный токен",
      Forbidden: "Недостаточно прав",
      "Invalid credentials": "Неверный логин или пароль",
      "Request not found": "Заявка не найдена",
      "Quote not found": "Цитата не найдена",
      not_found: "Запись не найдена",
    };
    if (direct[message]) return direct[message];
    if (String(message).startsWith("HTTP ")) return "Ошибка сервера (" + message + ")";
    return message;
  }

  function getOperatorsForType(type) {
    if (type === "number" || type === "date" || type === "datetime") return ["=", "!=", ">", "<", ">=", "<="];
    if (type === "boolean" || type === "reference" || type === "enum") return ["=", "!="];
    return [...ALL_OPERATORS];
  }

  function localizeRequestDetails(row) {
    return {
      ID: row.id || null,
      "Номер заявки": row.track_number || null,
      Клиент: row.client_name || null,
      Телефон: row.client_phone || null,
      "Тема (код)": row.topic_code || null,
      Статус: statusLabel(row.status_code),
      Описание: row.description || null,
      "Дополнительные поля": row.extra_fields || {},
      "Назначенный юрист (ID)": row.assigned_lawyer_id || null,
      "Ставка (фикс.)": row.effective_rate ?? null,
      "Сумма счета": row.invoice_amount ?? null,
      "Оплачено": row.paid_at ? fmtDate(row.paid_at) : null,
      "Оплату подтвердил (ID)": row.paid_by_admin_id || null,
      "Непрочитано клиентом": boolLabel(Boolean(row.client_has_unread_updates)),
      "Тип обновления для клиента": row.client_unread_event_type ? (REQUEST_UPDATE_EVENT_LABELS[row.client_unread_event_type] || row.client_unread_event_type) : null,
      "Непрочитано юристом": boolLabel(Boolean(row.lawyer_has_unread_updates)),
      "Тип обновления для юриста": row.lawyer_unread_event_type ? (REQUEST_UPDATE_EVENT_LABELS[row.lawyer_unread_event_type] || row.lawyer_unread_event_type) : null,
      "Общий размер вложений (байт)": row.total_attachments_bytes ?? 0,
      Создано: fmtDate(row.created_at),
      Обновлено: fmtDate(row.updated_at),
    };
  }

  function renderRequestUpdatesCell(row, role) {
    if (role === "LAWYER") {
      const has = Boolean(row.lawyer_has_unread_updates);
      const eventType = String(row.lawyer_unread_event_type || "").toUpperCase();
      return has ? (
        <span className="request-update-chip" title={"Есть непрочитанное обновление: " + (REQUEST_UPDATE_EVENT_LABELS[eventType] || eventType.toLowerCase())}>
          <span className="request-update-dot" />
          {REQUEST_UPDATE_EVENT_LABELS[eventType] || "обновление"}
        </span>
      ) : (
        <span className="request-update-empty">нет</span>
      );
    }

    const clientHas = Boolean(row.client_has_unread_updates);
    const clientType = String(row.client_unread_event_type || "").toUpperCase();
    const lawyerHas = Boolean(row.lawyer_has_unread_updates);
    const lawyerType = String(row.lawyer_unread_event_type || "").toUpperCase();

    if (!clientHas && !lawyerHas) return <span className="request-update-empty">нет</span>;
    return (
      <span className="request-updates-stack">
        {clientHas ? (
          <span className="request-update-chip" title={"Клиенту: " + (REQUEST_UPDATE_EVENT_LABELS[clientType] || clientType.toLowerCase())}>
            <span className="request-update-dot" />
            {"Клиент: " + (REQUEST_UPDATE_EVENT_LABELS[clientType] || "обновление")}
          </span>
        ) : null}
        {lawyerHas ? (
          <span className="request-update-chip" title={"Юристу: " + (REQUEST_UPDATE_EVENT_LABELS[lawyerType] || lawyerType.toLowerCase())}>
            <span className="request-update-dot" />
            {"Юрист: " + (REQUEST_UPDATE_EVENT_LABELS[lawyerType] || "обновление")}
          </span>
        ) : null}
      </span>
    );
  }

  function localizeMeta(data) {
    const fieldTypeMap = {
      string: "строка",
      text: "текст",
      boolean: "булево",
      number: "число",
      date: "дата",
    };
    return {
      Сущность: data.entity,
      Поля: (data.fields || []).map((field) => ({
        "Код поля": field.field_name,
        Название: field.label,
        Тип: fieldTypeMap[field.type] || field.type,
        Обязательное: boolLabel(field.required),
        "Только чтение": boolLabel(field.read_only),
        "Редактируемые роли": (field.editable_roles || []).map(roleLabel),
      })),
    };
  }

  function StatusLine({ status }) {
    return <p className={"status" + (status?.kind ? " " + status.kind : "")}>{status?.message || ""}</p>;
  }

  function Section({ active, children, id }) {
    return (
      <section className={"section" + (active ? " active" : "")} id={id}>
        {children}
      </section>
    );
  }

  function DataTable({ headers, rows, emptyColspan, renderRow, onSort, sortClause }) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {headers.map((header) => {
                const h = typeof header === "string" ? { key: header, label: header } : header;
                const sortable = Boolean(h.sortable && h.field && onSort);
                const active = Boolean(sortable && sortClause && sortClause.field === h.field);
                const direction = active ? sortClause.dir : "";
                return (
                  <th
                    key={h.key || h.label}
                    className={sortable ? "sortable-th" : ""}
                    onClick={sortable ? () => onSort(h.field) : undefined}
                    title={sortable ? "Нажмите для сортировки" : undefined}
                  >
                    <span className={sortable ? "sortable-head" : ""}>
                      {h.label}
                      {sortable ? <span className={"sort-indicator" + (active ? " active" : "")}>{direction === "desc" ? "↓" : "↑"}</span> : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => renderRow(row, index))
            ) : (
              <tr>
                <td colSpan={emptyColspan}>Нет данных</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  function TablePager({ tableState, onPrev, onNext, onLoadAll }) {
    return (
      <div className="pager">
        <div>
          {tableState.showAll
            ? "Всего: " + tableState.total + " • показаны все записи"
            : "Всего: " + tableState.total + " • смещение: " + tableState.offset}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn secondary"
            type="button"
            onClick={onLoadAll}
            disabled={tableState.total === 0 || tableState.showAll || tableState.rows.length >= tableState.total}
          >
            {"Загрузить все " + tableState.total}
          </button>
          <button className="btn secondary" type="button" onClick={onPrev} disabled={tableState.showAll || tableState.offset <= 0}>
            Назад
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={onNext}
            disabled={tableState.showAll || tableState.offset + PAGE_SIZE >= tableState.total}
          >
            Вперед
          </button>
        </div>
      </div>
    );
  }

  function FilterToolbar({ filters, onOpen, onRemove, onEdit, getChipLabel }) {
    return (
      <div className="filter-toolbar">
        <div className="filter-chips">
          {filters.length ? (
            filters.map((filter, index) => (
              <div
                className="filter-chip"
                key={filter.field + filter.op + index}
                onClick={() => onEdit(index)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onEdit(index);
                  }
                }}
                title="Редактировать фильтр"
              >
                <span>{getChipLabel(filter)}</span>
                <button
                  type="button"
                  aria-label="Удалить фильтр"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(index);
                  }}
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <span className="chip-placeholder">Фильтры не заданы</span>
          )}
        </div>
        <div className="filter-action">
          <button className="btn secondary" type="button" onClick={onOpen}>
            Фильтр
          </button>
        </div>
      </div>
    );
  }

  function Overlay({ open, onClose, children, id }) {
    return (
      <div className={"overlay" + (open ? " open" : "")} id={id} onClick={onClose}>
        {children}
      </div>
    );
  }

  function IconButton({ icon, tooltip, onClick, tone }) {
    return (
      <button className={"icon-btn" + (tone ? " " + tone : "")} type="button" data-tooltip={tooltip} onClick={onClick} aria-label={tooltip}>
        {icon}
      </button>
    );
  }

  function UserAvatar({ name, email, avatarUrl, accessToken, size = 32 }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => setBroken(false), [avatarUrl]);
    const initials = userInitials(name, email);
    const bg = avatarColor(name || email || initials);
    const src = resolveAvatarSrc(avatarUrl, accessToken);
    const canShowImage = Boolean(src && !broken);
    return (
      <span className="avatar" style={{ width: size + "px", height: size + "px", backgroundColor: bg }}>
        {canShowImage ? (
          <img src={src} alt={name || email || "avatar"} onError={() => setBroken(true)} />
        ) : (
          <span>{initials}</span>
        )}
      </span>
    );
  }

  function LoginScreen({ onSubmit, status }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const submit = (event) => {
      event.preventDefault();
      onSubmit(email, password);
    };

    return (
      <div className="login-screen">
        <div className="login-card">
          <h2>Вход в админ-панель</h2>
          <p className="muted">Используйте учетную запись администратора или юриста.</p>
          <form className="stack" style={{ marginTop: "0.7rem" }} onSubmit={submit}>
            <div className="field">
              <label htmlFor="login-email">Эл. почта</label>
              <input
                id="login-email"
                type="email"
                required
                placeholder="admin@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Пароль</label>
              <input
                id="login-password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button className="btn" type="submit">
              Войти
            </button>
            <StatusLine status={status} />
          </form>
        </div>
      </div>
    );
  }

  function FilterModal({
    open,
    tableLabel,
    fields,
    draft,
    status,
    onClose,
    onFieldChange,
    onOpChange,
    onValueChange,
    onSubmit,
    onClear,
    getOperators,
    getFieldOptions,
  }) {
    if (!open) return null;

    const selectedField = fields.find((field) => field.field === draft.field) || fields[0] || null;
    const operators = getOperators(selectedField?.type || "text");
    const options = selectedField ? getFieldOptions(selectedField) : [];

    return (
      <Overlay open={open} id="filter-overlay" onClose={(event) => event.target.id === "filter-overlay" && onClose()}>
        <div className="modal" style={{ width: "min(560px, 100%)" }} onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>Фильтр таблицы</h3>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                {tableLabel
                  ? (draft.editIndex !== null ? "Редактирование фильтра • " : "Новый фильтр • ") + "Таблица: " + tableLabel
                  : "Выберите поле, оператор и значение."}
              </p>
            </div>
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="filter-field">Поле</label>
              <select id="filter-field" value={draft.field} onChange={onFieldChange}>
                {fields.map((field) => (
                  <option value={field.field} key={field.field}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="filter-op">Оператор</label>
              <select id="filter-op" value={draft.op} onChange={onOpChange}>
                {operators.map((op) => (
                  <option value={op} key={op}>
                    {OPERATOR_LABELS[op]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="filter-value">{selectedField ? "Значение: " + selectedField.label : "Значение"}</label>
              {!selectedField || selectedField.type === "text" ? (
                <input id="filter-value" type="text" value={draft.rawValue} onChange={onValueChange} placeholder="Введите значение" />
              ) : selectedField.type === "number" ? (
                <input id="filter-value" type="number" step="any" value={draft.rawValue} onChange={onValueChange} placeholder="Число" />
              ) : selectedField.type === "date" ? (
                <input id="filter-value" type="date" value={draft.rawValue} onChange={onValueChange} />
              ) : selectedField.type === "boolean" ? (
                <select id="filter-value" value={draft.rawValue} onChange={onValueChange}>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : selectedField.type === "reference" || selectedField.type === "enum" ? (
                <select id="filter-value" value={draft.rawValue} onChange={onValueChange} disabled={!options.length}>
                  {!options.length ? (
                    <option value="">Нет доступных значений</option>
                  ) : (
                    options.map((option) => (
                      <option value={String(option.value)} key={String(option.value)}>
                        {option.label}
                      </option>
                    ))
                  )}
                </select>
              ) : (
                <input id="filter-value" type="text" value={draft.rawValue} onChange={onValueChange} placeholder="Введите значение" />
              )}
            </div>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button className="btn" type="submit">
                Добавить/Сохранить
              </button>
              <button className="btn secondary" type="button" onClick={onClear}>
                Очистить все
              </button>
              <button className="btn secondary" type="button" onClick={onClose}>
                Отмена
              </button>
            </div>
            <StatusLine status={status} />
          </form>
        </div>
      </Overlay>
    );
  }

  function ReassignModal({ open, status, options, value, onChange, onClose, onSubmit, trackNumber }) {
    if (!open) return null;
    return (
      <Overlay open={open} id="reassign-overlay" onClose={(event) => event.target.id === "reassign-overlay" && onClose()}>
        <div className="modal" style={{ width: "min(520px, 100%)" }} onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>Переназначение заявки</h3>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                {trackNumber ? "Заявка: " + trackNumber : "Выберите нового юриста"}
              </p>
            </div>
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="reassign-lawyer">Новый юрист</label>
              <select id="reassign-lawyer" value={value} onChange={onChange} disabled={!options.length}>
                {!options.length ? (
                  <option value="">Нет доступных юристов</option>
                ) : (
                  options.map((option) => (
                    <option value={String(option.value)} key={String(option.value)}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button className="btn" type="submit" disabled={!value}>
                Сохранить
              </button>
              <button className="btn secondary" type="button" onClick={onClose}>
                Отмена
              </button>
            </div>
            <StatusLine status={status} />
          </form>
        </div>
      </Overlay>
    );
  }

  function RequestModal({ open, jsonText, onClose }) {
    if (!open) return null;
    return (
      <Overlay open={open} id="request-overlay" onClose={(event) => event.target.id === "request-overlay" && onClose()}>
        <div className="modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>Детали заявки</h3>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                Подробная карточка заявки.
              </p>
            </div>
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="json">{jsonText}</div>
        </div>
      </Overlay>
    );
  }

  function RecordModal({ open, title, fields, form, status, onClose, onChange, onSubmit, onUploadField }) {
    if (!open) return null;

    const renderField = (field) => {
      const value = form[field.key] ?? "";
      const options = typeof field.options === "function" ? field.options() : [];
      const id = "record-field-" + field.key;

      if (field.type === "textarea" || field.type === "json") {
        return (
          <textarea
            id={id}
            value={value}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder || ""}
            required={Boolean(field.required)}
          />
        );
      }
      if (field.type === "boolean") {
        return (
          <select id={id} value={value} onChange={(event) => onChange(field.key, event.target.value)}>
            <option value="true">Да</option>
            <option value="false">Нет</option>
          </select>
        );
      }
      if (field.type === "reference" || field.type === "enum") {
        return (
          <select id={id} value={value} onChange={(event) => onChange(field.key, event.target.value)}>
            {field.optional ? <option value="">-</option> : null}
            {options.map((option) => (
              <option value={String(option.value)} key={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        );
      }
      if (field.uploadScope) {
        return (
          <div className="field-inline">
            <input
              id={id}
              type="text"
              value={value}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder || ""}
              required={Boolean(field.required)}
            />
            <label className="btn secondary btn-sm" style={{ whiteSpace: "nowrap" }}>
              Загрузить
              <input
                type="file"
                accept={field.accept || "*/*"}
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files && event.target.files[0];
                  if (file && onUploadField) onUploadField(field, file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        );
      }
      return (
        <input
          id={id}
          type={field.type === "number" ? "number" : field.type === "password" ? "password" : "text"}
          step={field.type === "number" ? "any" : undefined}
          value={value}
          onChange={(event) => onChange(field.key, event.target.value)}
          placeholder={field.placeholder || ""}
          required={Boolean(field.required)}
        />
      );
    };

    return (
      <Overlay open={open} id="record-overlay" onClose={(event) => event.target.id === "record-overlay" && onClose()}>
        <div className="modal" style={{ width: "min(760px, 100%)" }} onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>{title}</h3>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                Создание и редактирование записи.
              </p>
            </div>
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <div className="filters" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              {fields.map((field) => (
                <div className="field" key={field.key}>
                  <label htmlFor={"record-field-" + field.key}>{field.label}</label>
                  {renderField(field)}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button className="btn" type="submit">
                Сохранить
              </button>
              <button className="btn secondary" type="button" onClick={onClose}>
                Отмена
              </button>
            </div>
            <StatusLine status={status} />
          </form>
        </div>
      </Overlay>
    );
  }

  function App() {
    const [token, setToken] = useState("");
    const [role, setRole] = useState("");
    const [email, setEmail] = useState("");
    const [activeSection, setActiveSection] = useState("dashboard");

    const [dashboardData, setDashboardData] = useState({
      scope: "",
      cards: [],
      byStatus: {},
      lawyerLoads: [],
      myUnreadByEvent: {},
    });

    const [tables, setTables] = useState({
      requests: createTableState(),
      invoices: createTableState(),
      quotes: createTableState(),
      topics: createTableState(),
      statuses: createTableState(),
      formFields: createTableState(),
      topicRequiredFields: createTableState(),
      topicDataTemplates: createTableState(),
      statusTransitions: createTableState(),
      users: createTableState(),
      userTopics: createTableState(),
    });
    const [tableCatalog, setTableCatalog] = useState([]);

    const [dictionaries, setDictionaries] = useState({
      topics: [],
      statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
      formFieldTypes: [...DEFAULT_FORM_FIELD_TYPES],
      formFieldKeys: [],
      users: [],
    });

    const [statusMap, setStatusMap] = useState({});

    const [requestModal, setRequestModal] = useState({ open: false, jsonText: "" });
    const [recordModal, setRecordModal] = useState({
      open: false,
      tableKey: null,
      mode: "create",
      rowId: null,
      form: {},
    });

    const [configActiveKey, setConfigActiveKey] = useState("");
    const [referencesExpanded, setReferencesExpanded] = useState(true);

    const [metaEntity, setMetaEntity] = useState("quotes");
    const [metaJson, setMetaJson] = useState("");

    const [filterModal, setFilterModal] = useState({
      open: false,
      tableKey: null,
      field: "",
      op: "=",
      rawValue: "",
      editIndex: null,
    });
    const [reassignModal, setReassignModal] = useState({
      open: false,
      requestId: null,
      trackNumber: "",
      lawyerId: "",
    });

    const tablesRef = useRef(tables);
    useEffect(() => {
      tablesRef.current = tables;
    }, [tables]);

    const setStatus = useCallback((key, message, kind) => {
      setStatusMap((prev) => ({ ...prev, [key]: { message: message || "", kind: kind || "" } }));
    }, []);

    const getStatus = useCallback((key) => statusMap[key] || { message: "", kind: "" }, [statusMap]);

    const api = useCallback(
      async (path, options, tokenOverride) => {
        const opts = options || {};
        const authToken = tokenOverride !== undefined ? tokenOverride : token;
        const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };

        if (opts.auth !== false) {
          if (!authToken) throw new Error("Отсутствует токен авторизации");
          headers.Authorization = "Bearer " + authToken;
        }

        const response = await fetch(path, {
          method: opts.method || "GET",
          headers,
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        });

        const text = await response.text();
        let payload;
        try {
          payload = text ? JSON.parse(text) : {};
        } catch (_) {
          payload = { raw: text };
        }

        if (!response.ok) {
          const message = (payload && (payload.detail || payload.error || payload.raw)) || "HTTP " + response.status;
          throw new Error(translateApiError(String(message)));
        }

        return payload;
      },
      [token]
    );

    const getStatusOptions = useCallback(() => {
      return (dictionaries.statuses || [])
        .filter((item) => item && item.code)
        .map((item) => ({ value: item.code, label: (item.name || statusLabel(item.code)) + " (" + item.code + ")" }));
    }, [dictionaries.statuses]);

    const getInvoiceStatusOptions = useCallback(() => {
      return Object.entries(INVOICE_STATUS_LABELS).map(([code, name]) => ({ value: code, label: name + " (" + code + ")" }));
    }, []);

    const getStatusKindOptions = useCallback(() => {
      return Object.entries(STATUS_KIND_LABELS).map(([code, name]) => ({ value: code, label: name + " (" + code + ")" }));
    }, []);

    const getTopicOptions = useCallback(() => {
      return (dictionaries.topics || [])
        .filter((item) => item && item.code)
        .map((item) => ({ value: item.code, label: (item.name || item.code) + " (" + item.code + ")" }));
    }, [dictionaries.topics]);

    const getLawyerOptions = useCallback(() => {
      return (dictionaries.users || [])
        .filter((item) => item && item.id && String(item.role || "").toUpperCase() === "LAWYER")
        .map((item) => ({
          value: item.id,
          label: (item.name || item.email || item.id) + (item.email ? " (" + item.email + ")" : ""),
        }));
    }, [dictionaries.users]);

    const getFormFieldTypeOptions = useCallback(() => {
      return (dictionaries.formFieldTypes || []).filter(Boolean).map((item) => ({ value: item, label: item }));
    }, [dictionaries.formFieldTypes]);

    const getFormFieldKeyOptions = useCallback(() => {
      return (dictionaries.formFieldKeys || [])
        .filter((item) => item && item.key)
        .map((item) => ({ value: item.key, label: (item.label || item.key) + " (" + item.key + ")" }));
    }, [dictionaries.formFieldKeys]);

    const getRoleOptions = useCallback(() => {
      return Object.entries(ROLE_LABELS).map(([code, label]) => ({ value: code, label: label + " (" + code + ")" }));
    }, []);

    const tableCatalogMap = useMemo(() => {
      const map = {};
      (tableCatalog || []).forEach((item) => {
        if (!item || !item.key) return;
        map[item.key] = item;
      });
      return map;
    }, [tableCatalog]);

    const dictionaryTableItems = useMemo(() => {
      return (tableCatalog || [])
        .filter((item) => item && item.section === "dictionary" && Array.isArray(item.actions) && item.actions.includes("query"))
        .sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));
    }, [tableCatalog]);

    const resolveTableConfig = useCallback(
      (tableKey) => {
        if (TABLE_SERVER_CONFIG[tableKey]) return TABLE_SERVER_CONFIG[tableKey];
        const meta = tableCatalogMap[tableKey];
        if (!meta || !meta.table) return null;
        const tableName = String(meta.table || tableKey);
        return {
          table: tableName,
          endpoint: String(meta.query_endpoint || ("/api/admin/crud/" + tableName + "/query")),
          sort: Array.isArray(meta.default_sort) && meta.default_sort.length ? meta.default_sort : [{ field: "created_at", dir: "desc" }],
        };
      },
      [tableCatalogMap]
    );

    const resolveMutationConfig = useCallback(
      (tableKey) => {
        if (TABLE_MUTATION_CONFIG[tableKey]) return TABLE_MUTATION_CONFIG[tableKey];
        const meta = tableCatalogMap[tableKey];
        if (!meta || !meta.table) return null;
        const tableName = String(meta.table || tableKey);
        return {
          create: String(meta.create_endpoint || ("/api/admin/crud/" + tableName)),
          update: (id) => String(meta.update_endpoint_template || ("/api/admin/crud/" + tableName + "/{id}")).replace("{id}", String(id)),
          delete: (id) => String(meta.delete_endpoint_template || ("/api/admin/crud/" + tableName + "/{id}")).replace("{id}", String(id)),
        };
      },
      [tableCatalogMap]
    );

    const getFilterFields = useCallback(
      (tableKey) => {
        if (tableKey === "requests") {
          return [
            { field: "track_number", label: "Номер заявки", type: "text" },
            { field: "client_name", label: "Клиент", type: "text" },
            { field: "client_phone", label: "Телефон", type: "text" },
            { field: "status_code", label: "Статус", type: "reference", options: getStatusOptions },
            { field: "topic_code", label: "Тема", type: "reference", options: getTopicOptions },
            { field: "invoice_amount", label: "Сумма счета", type: "number" },
            { field: "effective_rate", label: "Ставка", type: "number" },
            { field: "paid_at", label: "Оплачено", type: "date" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "invoices") {
          return [
            { field: "invoice_number", label: "Номер счета", type: "text" },
            { field: "status", label: "Статус", type: "enum", options: getInvoiceStatusOptions },
            { field: "amount", label: "Сумма", type: "number" },
            { field: "currency", label: "Валюта", type: "text" },
            { field: "payer_display_name", label: "Плательщик", type: "text" },
            { field: "request_id", label: "ID заявки", type: "text" },
            { field: "issued_by_admin_user_id", label: "ID сотрудника", type: "text" },
            { field: "issued_at", label: "Дата формирования", type: "date" },
            { field: "paid_at", label: "Дата оплаты", type: "date" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "quotes") {
          return [
            { field: "author", label: "Автор", type: "text" },
            { field: "text", label: "Текст", type: "text" },
            { field: "source", label: "Источник", type: "text" },
            { field: "is_active", label: "Активна", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "topics") {
          return [
            { field: "code", label: "Код", type: "text" },
            { field: "name", label: "Название", type: "text" },
            { field: "enabled", label: "Активна", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
          ];
        }
        if (tableKey === "statuses") {
          return [
            { field: "code", label: "Код", type: "text" },
            { field: "name", label: "Название", type: "text" },
            { field: "kind", label: "Тип", type: "enum", options: getStatusKindOptions },
            { field: "enabled", label: "Активен", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
            { field: "is_terminal", label: "Терминальный", type: "boolean" },
          ];
        }
        if (tableKey === "formFields") {
          return [
            { field: "key", label: "Ключ", type: "text" },
            { field: "label", label: "Метка", type: "text" },
            { field: "type", label: "Тип", type: "enum", options: getFormFieldTypeOptions },
            { field: "required", label: "Обязательное", type: "boolean" },
            { field: "enabled", label: "Активно", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
          ];
        }
        if (tableKey === "topicRequiredFields") {
          return [
            { field: "topic_code", label: "Тема", type: "reference", options: getTopicOptions },
            { field: "field_key", label: "Поле формы", type: "reference", options: getFormFieldKeyOptions },
            { field: "required", label: "Обязательное", type: "boolean" },
            { field: "enabled", label: "Активно", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
          ];
        }
        if (tableKey === "topicDataTemplates") {
          return [
            { field: "topic_code", label: "Тема", type: "reference", options: getTopicOptions },
            { field: "key", label: "Ключ", type: "text" },
            { field: "label", label: "Метка", type: "text" },
            { field: "required", label: "Обязательное", type: "boolean" },
            { field: "enabled", label: "Активно", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "statusTransitions") {
          return [
            { field: "topic_code", label: "Тема", type: "reference", options: getTopicOptions },
            { field: "from_status", label: "Из статуса", type: "reference", options: getStatusOptions },
            { field: "to_status", label: "В статус", type: "reference", options: getStatusOptions },
            { field: "sla_hours", label: "SLA (часы)", type: "number" },
            { field: "enabled", label: "Активен", type: "boolean" },
            { field: "sort_order", label: "Порядок", type: "number" },
          ];
        }
        if (tableKey === "users") {
          return [
            { field: "name", label: "Имя", type: "text" },
            { field: "email", label: "Email", type: "text" },
            { field: "role", label: "Роль", type: "enum", options: getRoleOptions },
            { field: "primary_topic_code", label: "Профиль (тема)", type: "reference", options: getTopicOptions },
            { field: "default_rate", label: "Ставка по умолчанию", type: "number" },
            { field: "salary_percent", label: "Процент зарплаты", type: "number" },
            { field: "is_active", label: "Активен", type: "boolean" },
            { field: "responsible", label: "Ответственный", type: "text" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        if (tableKey === "userTopics") {
          return [
            { field: "admin_user_id", label: "Юрист", type: "reference", options: getLawyerOptions },
            { field: "topic_code", label: "Доп. тема", type: "reference", options: getTopicOptions },
            { field: "responsible", label: "Ответственный", type: "text" },
            { field: "created_at", label: "Дата создания", type: "date" },
          ];
        }
        const meta = tableCatalogMap[tableKey];
        if (!meta || !Array.isArray(meta.columns)) return [];
        return (meta.columns || [])
          .filter((column) => column && column.name && column.filterable !== false)
          .map((column) => {
            const name = String(column.name);
            const label = String(column.label || humanizeKey(name));
            if (name === "topic_code") return { field: name, label, type: "reference", options: getTopicOptions };
            if (name === "status_code" || name === "from_status" || name === "to_status") {
              return { field: name, label, type: "reference", options: getStatusOptions };
            }
            if (name === "field_key") return { field: name, label, type: "reference", options: getFormFieldKeyOptions };
            return { field: name, label, type: metaKindToFilterType(column.kind) };
          });
      },
      [
        tableCatalogMap,
        getFormFieldKeyOptions,
        getFormFieldTypeOptions,
        getInvoiceStatusOptions,
        getLawyerOptions,
        getRoleOptions,
        getStatusKindOptions,
        getStatusOptions,
        getTopicOptions,
      ]
    );

    const getTableLabel = useCallback((tableKey) => {
      if (tableKey === "requests") return "Заявки";
      if (tableKey === "invoices") return "Счета";
      if (tableKey === "quotes") return "Цитаты";
      if (tableKey === "topics") return "Темы";
      if (tableKey === "statuses") return "Статусы";
      if (tableKey === "formFields") return "Поля формы";
      if (tableKey === "topicRequiredFields") return "Обязательные поля по темам";
      if (tableKey === "topicDataTemplates") return "Шаблоны дозапроса по темам";
      if (tableKey === "statusTransitions") return "Переходы статусов";
      if (tableKey === "users") return "Пользователи";
      if (tableKey === "userTopics") return "Дополнительные темы юристов";
      const meta = tableCatalogMap[tableKey];
      if (meta && meta.label) return String(meta.label);
      const raw = TABLE_UNALIASES[tableKey] || tableKey;
      return humanizeKey(raw);
    }, [tableCatalogMap]);

    const getRecordFields = useCallback(
      (tableKey) => {
        if (tableKey === "requests") {
          return [
            { key: "track_number", label: "Номер заявки", type: "text", optional: true, placeholder: "Оставьте пустым для автогенерации" },
            { key: "client_name", label: "Клиент", type: "text", required: true },
            { key: "client_phone", label: "Телефон", type: "text", required: true },
            { key: "topic_code", label: "Тема", type: "reference", optional: true, options: getTopicOptions },
            { key: "status_code", label: "Статус", type: "reference", required: true, options: getStatusOptions },
            { key: "description", label: "Описание", type: "textarea", optional: true },
            { key: "extra_fields", label: "Дополнительные поля (JSON)", type: "json", optional: true, defaultValue: "{}" },
            { key: "assigned_lawyer_id", label: "Назначенный юрист (ID)", type: "text", optional: true },
            { key: "effective_rate", label: "Ставка (фикс.)", type: "number", optional: true },
            { key: "invoice_amount", label: "Сумма счета", type: "number", optional: true },
            { key: "paid_at", label: "Дата оплаты (ISO)", type: "text", optional: true, placeholder: "2026-02-23T12:00:00+03:00" },
            { key: "paid_by_admin_id", label: "Оплату подтвердил (ID)", type: "text", optional: true },
            { key: "total_attachments_bytes", label: "Размер вложений (байт)", type: "number", optional: true, defaultValue: "0" },
          ];
        }
        if (tableKey === "invoices") {
          return [
            { key: "request_track_number", label: "Номер заявки", type: "text", required: true, createOnly: true },
            { key: "invoice_number", label: "Номер счета", type: "text", optional: true, placeholder: "Оставьте пустым для автогенерации" },
            { key: "status", label: "Статус", type: "enum", required: true, options: getInvoiceStatusOptions, defaultValue: "WAITING_PAYMENT" },
            { key: "amount", label: "Сумма", type: "number", required: true },
            { key: "currency", label: "Валюта", type: "text", optional: true, defaultValue: "RUB" },
            { key: "payer_display_name", label: "Плательщик (ФИО / компания)", type: "text", required: true },
            { key: "payer_details", label: "Реквизиты (JSON, шифруется)", type: "json", optional: true, omitIfEmpty: true, placeholder: "{\"inn\":\"...\"}" },
          ];
        }
        if (tableKey === "quotes") {
          return [
            { key: "author", label: "Автор", type: "text", required: true },
            { key: "text", label: "Текст", type: "textarea", required: true },
            { key: "source", label: "Источник", type: "text", optional: true },
            { key: "is_active", label: "Активна", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
          ];
        }
        if (tableKey === "topics") {
          return [
            { key: "code", label: "Код", type: "text", required: true, autoCreate: true },
            { key: "name", label: "Название", type: "text", required: true },
            { key: "enabled", label: "Активна", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
          ];
        }
        if (tableKey === "statuses") {
          return [
            { key: "code", label: "Код", type: "text", required: true },
            { key: "name", label: "Название", type: "text", required: true },
            { key: "kind", label: "Тип", type: "enum", required: true, options: getStatusKindOptions, defaultValue: "DEFAULT" },
            { key: "invoice_template", label: "Шаблон счета", type: "textarea", optional: true, placeholder: "Доступные поля: {track_number}, {client_name}, {topic_code}, {amount}" },
            { key: "enabled", label: "Активен", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
            { key: "is_terminal", label: "Терминальный", type: "boolean", defaultValue: "false" },
          ];
        }
        if (tableKey === "formFields") {
          return [
            { key: "key", label: "Ключ", type: "text", required: true },
            { key: "label", label: "Метка", type: "text", required: true },
            { key: "type", label: "Тип", type: "enum", required: true, options: getFormFieldTypeOptions },
            { key: "required", label: "Обязательное", type: "boolean", defaultValue: "false" },
            { key: "enabled", label: "Активно", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
            { key: "options", label: "Опции (JSON)", type: "json", optional: true },
          ];
        }
        if (tableKey === "topicRequiredFields") {
          return [
            { key: "topic_code", label: "Тема", type: "reference", required: true, options: getTopicOptions },
            { key: "field_key", label: "Поле формы", type: "reference", required: true, options: getFormFieldKeyOptions },
            { key: "required", label: "Обязательное", type: "boolean", defaultValue: "true" },
            { key: "enabled", label: "Активно", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
          ];
        }
        if (tableKey === "topicDataTemplates") {
          return [
            { key: "topic_code", label: "Тема", type: "reference", required: true, options: getTopicOptions },
            { key: "key", label: "Ключ", type: "text", required: true },
            { key: "label", label: "Метка", type: "text", required: true },
            { key: "description", label: "Описание", type: "textarea", optional: true },
            { key: "required", label: "Обязательное", type: "boolean", defaultValue: "true" },
            { key: "enabled", label: "Активно", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
          ];
        }
        if (tableKey === "statusTransitions") {
          return [
            { key: "topic_code", label: "Тема", type: "reference", required: true, options: getTopicOptions },
            { key: "from_status", label: "Из статуса", type: "reference", required: true, options: getStatusOptions },
            { key: "to_status", label: "В статус", type: "reference", required: true, options: getStatusOptions },
            { key: "sla_hours", label: "SLA (часы)", type: "number", optional: true },
            { key: "enabled", label: "Активен", type: "boolean", defaultValue: "true" },
            { key: "sort_order", label: "Порядок", type: "number", defaultValue: "0" },
          ];
        }
        if (tableKey === "users") {
          return [
            { key: "name", label: "Имя", type: "text", required: true },
            { key: "email", label: "Email", type: "text", required: true },
            { key: "role", label: "Роль", type: "enum", required: true, options: getRoleOptions, defaultValue: "LAWYER" },
            {
              key: "avatar_url",
              label: "URL аватара",
              type: "text",
              optional: true,
              placeholder: "https://... или s3://...",
              uploadScope: "USER_AVATAR",
              accept: "image/*",
            },
            { key: "primary_topic_code", label: "Профиль (тема)", type: "reference", optional: true, options: getTopicOptions },
            { key: "default_rate", label: "Ставка по умолчанию", type: "number", optional: true },
            { key: "salary_percent", label: "Процент зарплаты", type: "number", optional: true },
            { key: "is_active", label: "Активен", type: "boolean", defaultValue: "true" },
            { key: "password", label: "Пароль", type: "password", requiredOnCreate: true, optional: true, omitIfEmpty: true, placeholder: "Введите пароль" },
          ];
        }
        if (tableKey === "userTopics") {
          return [
            { key: "admin_user_id", label: "Юрист", type: "reference", required: true, options: getLawyerOptions },
            { key: "topic_code", label: "Дополнительная тема", type: "reference", required: true, options: getTopicOptions },
          ];
        }
        const meta = tableCatalogMap[tableKey];
        if (!meta || !Array.isArray(meta.columns)) return [];
        return (meta.columns || [])
          .filter((column) => column && column.name && column.editable)
          .map((column) => {
            const key = String(column.name || "");
            const requiredOnCreate = Boolean(column.required_on_create);
            return {
              key,
              label: String(column.label || humanizeKey(key)),
              type: metaKindToRecordType(column.kind),
              requiredOnCreate,
              optional: !requiredOnCreate,
            };
          });
      },
      [
        tableCatalogMap,
        getFormFieldKeyOptions,
        getFormFieldTypeOptions,
        getInvoiceStatusOptions,
        getLawyerOptions,
        getRoleOptions,
        getStatusKindOptions,
        getStatusOptions,
        getTopicOptions,
      ]
    );

    const getFieldDef = useCallback(
      (tableKey, fieldName) => {
        return getFilterFields(tableKey).find((field) => field.field === fieldName) || null;
      },
      [getFilterFields]
    );

    const getFieldOptions = useCallback((fieldDef) => {
      if (!fieldDef) return [];
      if (typeof fieldDef.options === "function") return fieldDef.options() || [];
      return [];
    }, []);

    const getFilterValuePreview = useCallback(
      (tableKey, clause) => {
        const fieldDef = getFieldDef(tableKey, clause.field);
        if (!fieldDef) return String(clause.value ?? "");
        if (fieldDef.type === "boolean") return boolFilterLabel(Boolean(clause.value));
        if (fieldDef.type === "reference" || fieldDef.type === "enum") {
          const options = getFieldOptions(fieldDef);
          const found = options.find((option) => String(option.value) === String(clause.value));
          return found ? found.label : String(clause.value ?? "");
        }
        return String(clause.value ?? "");
      },
      [getFieldDef, getFieldOptions]
    );

    const setTableState = useCallback((tableKey, next) => {
      setTables((prev) => ({ ...prev, [tableKey]: next }));
    }, []);

    const loadTable = useCallback(
      async (tableKey, options, tokenOverride) => {
        const opts = options || {};
        const config = resolveTableConfig(tableKey);
        if (!config) return false;

        const current = tablesRef.current[tableKey] || createTableState();
        const next = {
          ...current,
          filters: Array.isArray(opts.filtersOverride) ? [...opts.filtersOverride] : [...(current.filters || [])],
          sort: Array.isArray(opts.sortOverride) ? [...opts.sortOverride] : Array.isArray(current.sort) ? [...current.sort] : null,
          rows: [...(current.rows || [])],
        };

        if (opts.resetOffset) {
          next.offset = 0;
          next.showAll = false;
        }
        if (opts.loadAll) {
          next.offset = 0;
          next.showAll = true;
        }

        const statusKey = tableKey;
        setStatus(statusKey, "Загрузка...", "");

        try {
          const activeSort = next.sort && next.sort.length ? next.sort : config.sort;
          let limit = next.showAll ? Math.max(next.total || PAGE_SIZE, PAGE_SIZE) : PAGE_SIZE;
          const offset = next.showAll ? 0 : next.offset;
          let data = await api(
            config.endpoint,
            {
              method: "POST",
              body: buildUniversalQuery(next.filters, activeSort, limit, offset),
            },
            tokenOverride
          );

          next.total = Number(data.total || 0);
          next.rows = data.rows || [];

          if (next.showAll && next.total > next.rows.length) {
            limit = next.total;
            data = await api(
              config.endpoint,
              {
                method: "POST",
                body: buildUniversalQuery(next.filters, activeSort, limit, 0),
              },
              tokenOverride
            );
            next.total = Number(data.total || next.total);
            next.rows = data.rows || [];
          }

          if (!next.showAll && next.total > 0 && next.offset >= next.total) {
            next.offset = Math.floor((next.total - 1) / PAGE_SIZE) * PAGE_SIZE;
            setTableState(tableKey, next);
            return loadTable(tableKey, {}, tokenOverride);
          }

          setTableState(tableKey, next);

          if (tableKey === "requests") {
            setDictionaries((prev) => {
              const map = new Map((prev.topics || []).map((topic) => [topic.code, topic]));
              (next.rows || []).forEach((row) => {
                if (!row.topic_code || map.has(row.topic_code)) return;
                map.set(row.topic_code, { code: row.topic_code, name: row.topic_code });
              });
              return { ...prev, topics: sortByName(Array.from(map.values())) };
            });
          }

          if (tableKey === "topics") {
            setDictionaries((prev) => ({
              ...prev,
              topics: sortByName((next.rows || []).map((row) => ({ code: row.code, name: row.name || row.code }))),
            }));
          }

          if (tableKey === "statuses") {
            setDictionaries((prev) => {
              const map = new Map(Object.entries(STATUS_LABELS).map(([code, name]) => [code, { code, name }]));
              (next.rows || []).forEach((row) => {
                if (!row.code) return;
                map.set(row.code, { code: row.code, name: row.name || statusLabel(row.code) });
              });
              return { ...prev, statuses: sortByName(Array.from(map.values())) };
            });
          }

          if (tableKey === "formFields" || tableKey === "form_fields") {
            setDictionaries((prev) => {
              const set = new Set(DEFAULT_FORM_FIELD_TYPES);
              (next.rows || []).forEach((row) => {
                if (row?.type) set.add(row.type);
              });
              const fieldKeys = (next.rows || [])
                .filter((row) => row && row.key)
                .map((row) => ({ key: row.key, label: row.label || row.key }))
                .sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));
              return {
                ...prev,
                formFieldTypes: Array.from(set.values()).sort((a, b) => String(a).localeCompare(String(b), "ru")),
                formFieldKeys: fieldKeys,
              };
            });
          }

          if (tableKey === "users" || tableKey === "admin_users") {
            setDictionaries((prev) => {
              const map = new Map((prev.users || []).map((user) => [user.id, user]));
              (next.rows || []).forEach((row) => {
                map.set(row.id, {
                  id: row.id,
                  name: row.name || "",
                  email: row.email || "",
                  role: row.role || "",
                  is_active: Boolean(row.is_active),
                });
              });
              return { ...prev, users: Array.from(map.values()) };
            });
          }

          setStatus(statusKey, "Список обновлен", "ok");
          return true;
        } catch (error) {
          setStatus(statusKey, "Ошибка: " + error.message, "error");
          return false;
        }
      },
      [api, resolveTableConfig, setStatus, setTableState]
    );

    const loadCurrentConfigTable = useCallback(
      async (resetOffset, tokenOverride, keyOverride) => {
        const currentKey = keyOverride || configActiveKey;
        if (!currentKey) {
          setStatus("config", "Выберите справочник", "");
          return false;
        }
        setStatus("config", "Загрузка...", "");
        const ok = await loadTable(currentKey, { resetOffset: Boolean(resetOffset) }, tokenOverride);
        if (ok) {
          setStatus("config", "Справочник обновлен", "ok");
        } else {
          setStatus("config", "Не удалось обновить справочник", "error");
        }
      },
      [configActiveKey, loadTable, setStatus]
    );

    const loadDashboard = useCallback(
      async (tokenOverride) => {
        setStatus("dashboard", "Загрузка...", "");
        try {
          const data = await api("/api/admin/metrics/overview", {}, tokenOverride);
          const scope = String(data.scope || role || "");
          const cards =
            scope === "LAWYER"
              ? [
                  { label: "Мои заявки", value: data.assigned_total ?? 0 },
                  { label: "Мои активные", value: data.active_assigned_total ?? 0 },
                  { label: "Неназначенные", value: data.unassigned_total ?? 0 },
                  { label: "Мои непрочитанные", value: data.my_unread_updates ?? 0 },
                  { label: "Просрочено SLA", value: data.sla_overdue ?? 0 },
                ]
              : [
                  { label: "Новые", value: data.new ?? 0 },
                  { label: "Назначенные", value: data.assigned_total ?? 0 },
                  { label: "Неназначенные", value: data.unassigned_total ?? 0 },
                  { label: "Просрочено SLA", value: data.sla_overdue ?? 0 },
                  { label: "Непрочитано юристами", value: data.unread_for_lawyers ?? 0 },
                  { label: "Непрочитано клиентами", value: data.unread_for_clients ?? 0 },
                ];
          const localized = {};
          Object.entries(data.by_status || {}).forEach(([code, count]) => {
            localized[statusLabel(code)] = count;
          });
          setDashboardData({
            scope,
            cards,
            byStatus: localized,
            lawyerLoads: data.lawyer_loads || [],
            myUnreadByEvent: data.my_unread_by_event || {},
          });
          setStatus("dashboard", "Данные обновлены", "ok");
        } catch (error) {
          setStatus("dashboard", "Ошибка: " + error.message, "error");
        }
      },
      [api, role, setStatus]
    );

    const loadMeta = useCallback(
      async (tokenOverride) => {
        const entity = (metaEntity || "quotes").trim() || "quotes";
        setStatus("meta", "Загрузка...", "");
        try {
          const data = await api("/api/admin/meta/" + encodeURIComponent(entity), {}, tokenOverride);
          setMetaJson(JSON.stringify(localizeMeta(data), null, 2));
          setStatus("meta", "Метаданные получены", "ok");
        } catch (error) {
          setStatus("meta", "Ошибка: " + error.message, "error");
        }
      },
      [api, metaEntity, setStatus]
    );

    const refreshSection = useCallback(
      async (section, tokenOverride) => {
        if (!(tokenOverride !== undefined ? tokenOverride : token)) return;
        if (section === "dashboard") return loadDashboard(tokenOverride);
        if (section === "requests") return loadTable("requests", {}, tokenOverride);
        if (section === "invoices") return loadTable("invoices", {}, tokenOverride);
        if (section === "quotes" && canAccessSection(role, "quotes")) return loadTable("quotes", {}, tokenOverride);
        if (section === "config" && canAccessSection(role, "config")) return loadCurrentConfigTable(false, tokenOverride);
        if (section === "meta") return loadMeta(tokenOverride);
      },
      [loadCurrentConfigTable, loadDashboard, loadMeta, loadTable, role, token]
    );

    const bootstrapReferenceData = useCallback(
      async (tokenOverride, roleOverride) => {
        setDictionaries((prev) => ({
          ...prev,
          statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
        }));

        if (roleOverride !== "ADMIN") return;

        try {
          const body = buildUniversalQuery([], [{ field: "sort_order", dir: "asc" }], 500, 0);
          const usersBody = buildUniversalQuery([], [{ field: "created_at", dir: "desc" }], 500, 0);
          const [catalogData, topicsData, statusesData, fieldsData, usersData] = await Promise.all([
            api("/api/admin/crud/meta/tables", {}, tokenOverride),
            api("/api/admin/crud/topics/query", { method: "POST", body }, tokenOverride),
            api("/api/admin/crud/statuses/query", { method: "POST", body }, tokenOverride),
            api("/api/admin/crud/form_fields/query", { method: "POST", body }, tokenOverride),
            api("/api/admin/crud/admin_users/query", { method: "POST", body: usersBody }, tokenOverride),
          ]);
          const catalogRows = (catalogData.tables || [])
            .filter((row) => row && row.table)
            .map((row) => {
              const tableName = String(row.table || "");
              const key = TABLE_KEY_ALIASES[tableName] || String(row.key || tableName);
              return { ...row, key, table: tableName };
            });
          setTableCatalog(catalogRows);

          const statusesMap = new Map(Object.entries(STATUS_LABELS).map(([code, name]) => [code, { code, name }]));
          (statusesData.rows || []).forEach((row) => {
            if (!row.code) return;
            statusesMap.set(row.code, { code: row.code, name: row.name || statusLabel(row.code) });
          });

          const typeSet = new Set(DEFAULT_FORM_FIELD_TYPES);
          (fieldsData.rows || []).forEach((row) => {
            if (row?.type) typeSet.add(row.type);
          });
          const fieldKeys = (fieldsData.rows || [])
            .filter((row) => row && row.key)
            .map((row) => ({ key: row.key, label: row.label || row.key }))
            .sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));

          setDictionaries((prev) => ({
            ...prev,
            topics: sortByName((topicsData.rows || []).map((row) => ({ code: row.code, name: row.name || row.code }))),
            statuses: sortByName(Array.from(statusesMap.values())),
            formFieldTypes: Array.from(typeSet.values()).sort((a, b) => String(a).localeCompare(String(b), "ru")),
            formFieldKeys: fieldKeys,
            users: (usersData.rows || []).map((row) => ({
              id: row.id,
              name: row.name || "",
              email: row.email || "",
              role: row.role || "",
              is_active: Boolean(row.is_active),
            })),
          }));
        } catch (_) {
          // Keep defaults when dictionary endpoints are unavailable.
        }
      },
      [api]
    );

    const openRequestDetails = useCallback(
      async (requestId) => {
        setRequestModal({ open: true, jsonText: "Загрузка..." });
        try {
          const row = await api("/api/admin/crud/requests/" + requestId);
          setRequestModal({ open: true, jsonText: JSON.stringify(localizeRequestDetails(row), null, 2) });
        } catch (error) {
          setRequestModal({ open: true, jsonText: "Ошибка: " + error.message });
        }
      },
      [api]
    );

    const openCreateRecordModal = useCallback(
      (tableKey) => {
        const fields = getRecordFields(tableKey);
        const initial = {};
        fields.forEach((field) => {
          if (field.defaultValue !== undefined) initial[field.key] = String(field.defaultValue);
          else if (field.type === "boolean") initial[field.key] = "false";
          else if (field.type === "json") initial[field.key] = field.optional ? "" : "{}";
          else if ((field.type === "reference" || field.type === "enum") && !field.optional) {
            const options = typeof field.options === "function" ? field.options() : [];
            initial[field.key] = options.length ? String(options[0].value) : "";
          }
          else initial[field.key] = "";
        });
        if (tableKey === "requests" && !initial.status_code) initial.status_code = "NEW";
        setRecordModal({ open: true, tableKey, mode: "create", rowId: null, form: initial });
        setStatus("recordForm", "", "");
      },
      [getRecordFields, setStatus]
    );

    const openEditRecordModal = useCallback(
      (tableKey, row) => {
        const fields = getRecordFields(tableKey);
        const nextForm = {};
        fields.forEach((field) => {
          const value = row[field.key];
          if (field.type === "boolean") nextForm[field.key] = value ? "true" : "false";
          else if (field.type === "json") nextForm[field.key] = value == null ? "" : JSON.stringify(value, null, 2);
          else nextForm[field.key] = value == null ? "" : String(value);
        });
        setRecordModal({ open: true, tableKey, mode: "edit", rowId: row.id, form: nextForm });
        setStatus("recordForm", "", "");
      },
      [getRecordFields, setStatus]
    );

    const closeRecordModal = useCallback(() => {
      setRecordModal({ open: false, tableKey: null, mode: "create", rowId: null, form: {} });
      setStatus("recordForm", "", "");
    }, [setStatus]);

    const updateRecordField = useCallback((field, value) => {
      setRecordModal((prev) => ({ ...prev, form: { ...(prev.form || {}), [field]: value } }));
    }, []);

    const uploadRecordFieldFile = useCallback(
      async (field, file) => {
        if (!recordModal.tableKey || !field || !file) return;
        if (field.uploadScope !== "USER_AVATAR") return;
        if (recordModal.tableKey !== "users") return;
        if (recordModal.mode !== "edit" || !recordModal.rowId) {
          setStatus("recordForm", "Сначала сохраните пользователя, затем загрузите аватар", "error");
          return;
        }
        try {
          setStatus("recordForm", "Загрузка файла...", "");
          const mimeType = String(file.type || "application/octet-stream");
          const initPayload = {
            file_name: file.name,
            mime_type: mimeType,
            size_bytes: file.size,
            scope: "USER_AVATAR",
            user_id: recordModal.rowId,
          };
          const init = await api("/api/admin/uploads/init", { method: "POST", body: initPayload });
          const putResp = await fetch(init.presigned_url, {
            method: "PUT",
            headers: { "Content-Type": mimeType },
            body: file,
          });
          if (!putResp.ok) {
            throw new Error("Не удалось загрузить файл в хранилище");
          }
          const done = await api("/api/admin/uploads/complete", {
            method: "POST",
            body: {
              key: init.key,
              file_name: file.name,
              mime_type: mimeType,
              size_bytes: file.size,
              scope: "USER_AVATAR",
              user_id: recordModal.rowId,
            },
          });
          updateRecordField("avatar_url", String(done.avatar_url || ""));
          setStatus("recordForm", "Аватар загружен", "ok");
        } catch (error) {
          setStatus("recordForm", "Ошибка загрузки: " + error.message, "error");
        }
      },
      [api, recordModal, setStatus, updateRecordField]
    );

    const buildRecordPayload = useCallback(
      (tableKey, form, mode) => {
        const fields = getRecordFields(tableKey);
        const payload = {};
        const isLawyerRequestEdit = tableKey === "requests" && role === "LAWYER";
        const lawyerRequestRestricted = new Set(["assigned_lawyer_id", "effective_rate", "invoice_amount", "paid_at", "paid_by_admin_id"]);
        fields.forEach((field) => {
          if (isLawyerRequestEdit && lawyerRequestRestricted.has(field.key)) return;
          const raw = form[field.key];
          if (field.type === "boolean") {
            payload[field.key] = raw === "true";
            return;
          }
          if (field.type === "number") {
            if (raw === "" || raw == null) {
              if (!field.optional) payload[field.key] = 0;
              return;
            }
            const number = Number(raw);
            if (Number.isNaN(number)) throw new Error("Некорректное число в поле \"" + field.label + "\"");
            payload[field.key] = number;
            return;
          }
          if (field.type === "json") {
            const text = String(raw || "").trim();
            if (!text) {
              if (field.omitIfEmpty) return;
              if (field.optional) payload[field.key] = null;
              else payload[field.key] = {};
              return;
            }
            try {
              payload[field.key] = JSON.parse(text);
            } catch (_) {
              throw new Error("Поле \"" + field.label + "\" должно быть валидным JSON");
            }
            return;
          }

          const value = String(raw || "").trim();
          if (!value) {
            if (mode === "create" && field.autoCreate) return;
            if (mode === "create" && field.requiredOnCreate) throw new Error("Заполните поле \"" + field.label + "\"");
            if (field.required) throw new Error("Заполните поле \"" + field.label + "\"");
            if (field.omitIfEmpty) return;
            if (tableKey === "requests" && field.key === "track_number") return;
            if (field.optional) payload[field.key] = null;
            return;
          }
          payload[field.key] = value;
        });

        if (tableKey === "requests" && !payload.extra_fields) payload.extra_fields = {};
        if (tableKey === "invoices" && mode === "edit") delete payload.request_track_number;
        return payload;
      },
      [getRecordFields, role]
    );

    const submitRecordModal = useCallback(
      async (event) => {
        event.preventDefault();
        const tableKey = recordModal.tableKey;
        if (!tableKey) return;
        const endpoints = resolveMutationConfig(tableKey);
        if (!endpoints) return;
        try {
          setStatus("recordForm", "Сохранение...", "");
          const payload = buildRecordPayload(tableKey, recordModal.form || {}, recordModal.mode);
          if (recordModal.mode === "edit" && recordModal.rowId) {
            await api(endpoints.update(recordModal.rowId), { method: "PATCH", body: payload });
          } else {
            await api(endpoints.create, { method: "POST", body: payload });
          }
          setStatus("recordForm", "Сохранено", "ok");
          await loadTable(tableKey, { resetOffset: true });
          setTimeout(() => closeRecordModal(), 250);
        } catch (error) {
          setStatus("recordForm", "Ошибка: " + error.message, "error");
        }
      },
      [api, buildRecordPayload, closeRecordModal, loadTable, recordModal, resolveMutationConfig, setStatus]
    );

    const deleteRecord = useCallback(
      async (tableKey, id) => {
        const endpoints = resolveMutationConfig(tableKey);
        if (!endpoints) return;
        if (!confirm("Удалить запись?")) return;
        try {
          await api(endpoints.delete(id), { method: "DELETE" });
          setStatus(tableKey, "Запись удалена", "ok");
          await loadTable(tableKey, { resetOffset: true });
        } catch (error) {
          setStatus(tableKey, "Ошибка удаления: " + error.message, "error");
        }
      },
      [api, loadTable, resolveMutationConfig, setStatus]
    );

    const claimRequest = useCallback(
      async (requestId) => {
        if (!requestId) return;
        try {
          setStatus("requests", "Назначение заявки...", "");
          await api("/api/admin/requests/" + requestId + "/claim", { method: "POST" });
          setStatus("requests", "Заявка взята в работу", "ok");
          await loadTable("requests", { resetOffset: true });
        } catch (error) {
          setStatus("requests", "Ошибка назначения: " + error.message, "error");
        }
      },
      [api, loadTable, setStatus]
    );

    const openInvoiceRequest = useCallback(
      async (row) => {
        if (!row || !row.request_id) return;
        try {
          setActiveSection("requests");
          await loadTable("requests", {});
          await openRequestDetails(row.request_id);
        } catch (_) {
          // Ignore navigation errors and keep current state.
        }
      },
      [loadTable, openRequestDetails]
    );

    const downloadInvoicePdf = useCallback(
      async (row) => {
        if (!row || !row.id || !token) return;
        try {
          setStatus("invoices", "Формируем PDF...", "");
          const response = await fetch("/api/admin/invoices/" + row.id + "/pdf", {
            headers: { Authorization: "Bearer " + token },
          });
          if (!response.ok) {
            const text = await response.text();
            let payload = {};
            try {
              payload = text ? JSON.parse(text) : {};
            } catch (_) {
              payload = { raw: text };
            }
            const message = payload.detail || payload.error || payload.raw || ("HTTP " + response.status);
            throw new Error(translateApiError(String(message)));
          }
          const blob = await response.blob();
          const fileName = (row.invoice_number || "invoice") + ".pdf";
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          setStatus("invoices", "PDF скачан", "ok");
        } catch (error) {
          setStatus("invoices", "Ошибка скачивания: " + error.message, "error");
        }
      },
      [setStatus, token]
    );

    const openReassignModal = useCallback(
      (row) => {
        const options = getLawyerOptions();
        if (!options.length) {
          setStatus("reassignForm", "Нет доступных юристов для переназначения", "error");
          return;
        }
        const current = String(row?.assigned_lawyer_id || "");
        const hasCurrent = options.some((option) => String(option.value) === current);
        const fallback = options[0] ? String(options[0].value) : "";
        setReassignModal({
          open: true,
          requestId: row?.id || null,
          trackNumber: row?.track_number || "",
          lawyerId: hasCurrent ? current : fallback,
        });
        setStatus("reassignForm", "", "");
      },
      [getLawyerOptions, setStatus]
    );

    const closeReassignModal = useCallback(() => {
      setReassignModal({ open: false, requestId: null, trackNumber: "", lawyerId: "" });
      setStatus("reassignForm", "", "");
    }, [setStatus]);

    const updateReassignLawyer = useCallback((event) => {
      setReassignModal((prev) => ({ ...prev, lawyerId: event.target.value }));
    }, []);

    const submitReassignModal = useCallback(
      async (event) => {
        event.preventDefault();
        if (!reassignModal.requestId) return;
        const lawyerId = String(reassignModal.lawyerId || "").trim();
        if (!lawyerId) {
          setStatus("reassignForm", "Выберите юриста", "error");
          return;
        }
        try {
          setStatus("reassignForm", "Сохранение...", "");
          await api("/api/admin/requests/" + reassignModal.requestId + "/reassign", {
            method: "POST",
            body: { lawyer_id: lawyerId },
          });
          setStatus("requests", "Заявка переназначена", "ok");
          closeReassignModal();
          await loadTable("requests", { resetOffset: true });
        } catch (error) {
          setStatus("reassignForm", "Ошибка: " + error.message, "error");
        }
      },
      [api, closeReassignModal, loadTable, reassignModal.lawyerId, reassignModal.requestId, setStatus]
    );

    const defaultFilterValue = useCallback(
      (fieldDef) => {
        if (!fieldDef) return "";
        if (fieldDef.type === "boolean") return "true";
        if (fieldDef.type === "reference" || fieldDef.type === "enum") {
          const options = getFieldOptions(fieldDef);
          return options.length ? String(options[0].value) : "";
        }
        return "";
      },
      [getFieldOptions]
    );

    const openFilterModal = useCallback(
      (tableKey) => {
        const fields = getFilterFields(tableKey);
        if (!fields.length) {
          setStatus("filter", "Для таблицы нет доступных полей фильтрации", "error");
          return;
        }
        const firstField = fields[0];
        const firstOp = getOperatorsForType(firstField.type)[0] || "=";
        setFilterModal({
          open: true,
          tableKey,
          field: firstField.field,
          op: firstOp,
          rawValue: defaultFilterValue(firstField),
          editIndex: null,
        });
        setStatus("filter", "", "");
      },
      [defaultFilterValue, getFilterFields, setStatus]
    );

    const openFilterEditModal = useCallback(
      (tableKey, index) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        const target = (tableState.filters || [])[index];
        if (!target) return;
        const fieldDef = getFieldDef(tableKey, target.field);
        if (!fieldDef) return;
        const allowedOps = getOperatorsForType(fieldDef.type);
        const safeOp = allowedOps.includes(target.op) ? target.op : allowedOps[0] || "=";
        const rawValue = fieldDef.type === "boolean" ? (target.value ? "true" : "false") : String(target.value ?? "");
        setFilterModal({
          open: true,
          tableKey,
          field: fieldDef.field,
          op: safeOp,
          rawValue,
          editIndex: index,
        });
        setStatus("filter", "", "");
      },
      [getFieldDef, setStatus]
    );

    const closeFilterModal = useCallback(() => {
      setFilterModal((prev) => ({ ...prev, open: false, editIndex: null }));
      setStatus("filter", "", "");
    }, [setStatus]);

    const updateFilterField = useCallback(
      (event) => {
        const fieldName = event.target.value;
        const fields = getFilterFields(filterModal.tableKey);
        const fieldDef = fields.find((field) => field.field === fieldName) || null;
        if (!fieldDef) return;
        const defaultOp = getOperatorsForType(fieldDef.type)[0] || "=";
        setFilterModal((prev) => ({
          ...prev,
          field: fieldName,
          op: defaultOp,
          rawValue: defaultFilterValue(fieldDef),
        }));
      },
      [defaultFilterValue, filterModal.tableKey, getFilterFields]
    );

    const updateFilterOp = useCallback((event) => {
      const op = event.target.value;
      setFilterModal((prev) => ({ ...prev, op }));
    }, []);

    const updateFilterValue = useCallback((event) => {
      setFilterModal((prev) => ({ ...prev, rawValue: event.target.value }));
    }, []);

    const applyFilterModal = useCallback(
      async (event) => {
        event.preventDefault();
        if (!filterModal.tableKey) return;

        const fieldDef = getFieldDef(filterModal.tableKey, filterModal.field);
        if (!fieldDef) {
          setStatus("filter", "Поле фильтра не выбрано", "error");
          return;
        }

        let value;
        if (fieldDef.type === "boolean") {
          value = filterModal.rawValue === "true";
        } else if (fieldDef.type === "number") {
          if (String(filterModal.rawValue || "").trim() === "") {
            setStatus("filter", "Введите число", "error");
            return;
          }
          value = Number(filterModal.rawValue);
          if (Number.isNaN(value)) {
            setStatus("filter", "Некорректное число", "error");
            return;
          }
        } else {
          value = String(filterModal.rawValue || "").trim();
          if (!value) {
            setStatus("filter", "Введите значение фильтра", "error");
            return;
          }
        }

        const tableState = tablesRef.current[filterModal.tableKey] || createTableState();
        const nextFilters = [...(tableState.filters || [])];
        const nextClause = { field: fieldDef.field, op: filterModal.op, value };

        if (Number.isInteger(filterModal.editIndex) && filterModal.editIndex >= 0 && filterModal.editIndex < nextFilters.length) {
          nextFilters[filterModal.editIndex] = nextClause;
        } else {
          const existingIndex = nextFilters.findIndex((item) => item.field === nextClause.field && item.op === nextClause.op);
          if (existingIndex >= 0) nextFilters[existingIndex] = nextClause;
          else nextFilters.push(nextClause);
        }

        setTableState(filterModal.tableKey, {
          ...tableState,
          filters: nextFilters,
          offset: 0,
          showAll: false,
        });

        closeFilterModal();
        await loadTable(filterModal.tableKey, { resetOffset: true, filtersOverride: nextFilters });
      },
      [closeFilterModal, filterModal, getFieldDef, loadTable, setStatus, setTableState]
    );

    const clearFiltersFromModal = useCallback(async () => {
      if (!filterModal.tableKey) return;
      const tableState = tablesRef.current[filterModal.tableKey] || createTableState();
      setTableState(filterModal.tableKey, {
        ...tableState,
        filters: [],
        offset: 0,
        showAll: false,
      });
      closeFilterModal();
      await loadTable(filterModal.tableKey, { resetOffset: true, filtersOverride: [] });
    }, [closeFilterModal, filterModal.tableKey, loadTable, setTableState]);

    const removeFilterChip = useCallback(
      async (tableKey, index) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        const nextFilters = [...(tableState.filters || [])];
        nextFilters.splice(index, 1);
        setTableState(tableKey, {
          ...tableState,
          filters: nextFilters,
          offset: 0,
          showAll: false,
        });
        await loadTable(tableKey, { resetOffset: true, filtersOverride: nextFilters });
      },
      [loadTable, setTableState]
    );

    const loadPrevPage = useCallback(
      (tableKey) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        const next = { ...tableState, offset: Math.max(0, tableState.offset - PAGE_SIZE), showAll: false };
        setTableState(tableKey, next);
        loadTable(tableKey, {});
      },
      [loadTable, setTableState]
    );

    const loadNextPage = useCallback(
      (tableKey) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        if (tableState.offset + PAGE_SIZE >= tableState.total) return;
        const next = { ...tableState, offset: tableState.offset + PAGE_SIZE, showAll: false };
        setTableState(tableKey, next);
        loadTable(tableKey, {});
      },
      [loadTable, setTableState]
    );

    const loadAllRows = useCallback(
      (tableKey) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        if (!tableState.total) return;
        const next = { ...tableState, offset: 0, showAll: true };
        setTableState(tableKey, next);
        loadTable(tableKey, { loadAll: true });
      },
      [loadTable, setTableState]
    );

    const toggleTableSort = useCallback(
      (tableKey, field) => {
        const tableState = tablesRef.current[tableKey] || createTableState();
        const currentSort = Array.isArray(tableState.sort) ? tableState.sort[0] : null;
        const dir = currentSort && currentSort.field === field ? (currentSort.dir === "asc" ? "desc" : "asc") : "asc";
        const sortOverride = [{ field, dir }];
        const next = { ...tableState, sort: sortOverride, offset: 0, showAll: false };
        setTableState(tableKey, next);
        loadTable(tableKey, { resetOffset: true, sortOverride });
      },
      [loadTable, setTableState]
    );

    const selectConfigNode = useCallback(
      (tableKey) => {
        setConfigActiveKey(tableKey);
        setActiveSection("config");
        loadCurrentConfigTable(false, undefined, tableKey);
      },
      [loadCurrentConfigTable]
    );

    const refreshAll = useCallback(() => {
      refreshSection(activeSection);
    }, [activeSection, refreshSection]);

    const activateSection = useCallback(
      (section) => {
        const nextSection = canAccessSection(role, section) ? section : "dashboard";
        setActiveSection(nextSection);
        refreshSection(nextSection);
      },
      [refreshSection, role]
    );

    const logout = useCallback(() => {
      localStorage.removeItem(LS_TOKEN);
      setToken("");
      setRole("");
      setEmail("");
      setRecordModal({ open: false, tableKey: null, mode: "create", rowId: null, form: {} });
      setRequestModal({ open: false, jsonText: "" });
      setFilterModal({ open: false, tableKey: null, field: "", op: "=", rawValue: "", editIndex: null });
      setReassignModal({ open: false, requestId: null, trackNumber: "", lawyerId: "" });
      setDashboardData({ scope: "", cards: [], byStatus: {}, lawyerLoads: [], myUnreadByEvent: {} });
      setMetaJson("");
      setConfigActiveKey("");
      setReferencesExpanded(true);
      setTableCatalog([]);
      setTables({
        requests: createTableState(),
        invoices: createTableState(),
        quotes: createTableState(),
        topics: createTableState(),
        statuses: createTableState(),
        formFields: createTableState(),
        topicRequiredFields: createTableState(),
        topicDataTemplates: createTableState(),
        statusTransitions: createTableState(),
        users: createTableState(),
        userTopics: createTableState(),
      });
      setDictionaries({
        topics: [],
        statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
        formFieldTypes: [...DEFAULT_FORM_FIELD_TYPES],
        formFieldKeys: [],
        users: [],
      });
      setStatusMap({});
      setActiveSection("dashboard");
    }, []);

    const login = useCallback(
      async (emailInput, passwordInput) => {
        try {
          setStatus("login", "Выполняем вход...", "");
          const data = await api(
            "/api/admin/auth/login",
            {
              method: "POST",
              auth: false,
              body: { email: String(emailInput || "").trim(), password: passwordInput || "" },
            },
            ""
          );

          const nextToken = data.access_token;
          const payload = decodeJwtPayload(nextToken || "");
          if (!payload || !payload.role || !payload.email) throw new Error("Не удалось прочитать данные токена");

          localStorage.setItem(LS_TOKEN, nextToken);
          setToken(nextToken);
          setRole(payload.role);
          setEmail(payload.email);

          await bootstrapReferenceData(nextToken, payload.role);
          setActiveSection("dashboard");
          await loadDashboard(nextToken);

          setStatus("login", "Успешный вход", "ok");
        } catch (error) {
          setStatus("login", "Ошибка входа: " + error.message, "error");
        }
      },
      [api, bootstrapReferenceData, loadDashboard, setStatus]
    );

    useEffect(() => {
      const saved = localStorage.getItem(LS_TOKEN) || "";
      if (!saved) return;
      const payload = decodeJwtPayload(saved);
      if (!payload || !payload.role || !payload.email) {
        localStorage.removeItem(LS_TOKEN);
        return;
      }
      setToken(saved);
      setRole(payload.role);
      setEmail(payload.email);
    }, []);

    useEffect(() => {
      if (!token || !role) return;
      let cancelled = false;
      (async () => {
        await bootstrapReferenceData(token, role);
        if (!cancelled) await loadDashboard(token);
      })();
      return () => {
        cancelled = true;
      };
    }, [bootstrapReferenceData, loadDashboard, role, token]);

    useEffect(() => {
      if (!dictionaryTableItems.length) {
        if (configActiveKey) setConfigActiveKey("");
        return;
      }
      const hasCurrent = dictionaryTableItems.some((item) => item.key === configActiveKey);
      if (!hasCurrent) setConfigActiveKey(dictionaryTableItems[0].key);
    }, [configActiveKey, dictionaryTableItems]);

    const anyOverlayOpen = requestModal.open || recordModal.open || filterModal.open || reassignModal.open;
    useEffect(() => {
      document.body.classList.toggle("modal-open", anyOverlayOpen);
      return () => document.body.classList.remove("modal-open");
    }, [anyOverlayOpen]);

    useEffect(() => {
      const onEsc = (event) => {
        if (event.key !== "Escape") return;
        setRequestModal((prev) => ({ ...prev, open: false }));
        setRecordModal((prev) => ({ ...prev, open: false }));
        setFilterModal((prev) => ({ ...prev, open: false }));
        setReassignModal((prev) => ({ ...prev, open: false }));
      };
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }, []);

    const menuItems = useMemo(() => {
      return [
        { key: "dashboard", label: "Обзор" },
        { key: "requests", label: "Заявки" },
        { key: "invoices", label: "Счета" },
        { key: "meta", label: "Метаданные" },
      ];
    }, []);

    const activeFilterFields = useMemo(() => {
      if (!filterModal.tableKey) return [];
      return getFilterFields(filterModal.tableKey);
    }, [filterModal.tableKey, getFilterFields]);

    const filterTableLabel = useMemo(() => getTableLabel(filterModal.tableKey), [filterModal.tableKey, getTableLabel]);

    const recordModalFields = useMemo(() => {
      const all = getRecordFields(recordModal.tableKey);
      if (recordModal.mode !== "create") return all.filter((field) => !field.createOnly);
      return all.filter((field) => !field.autoCreate);
    }, [getRecordFields, recordModal.mode, recordModal.tableKey]);

    const activeConfigTableState = useMemo(() => {
      return tables[configActiveKey] || createTableState();
    }, [configActiveKey, tables]);

    const activeConfigMeta = useMemo(() => tableCatalogMap[configActiveKey] || null, [configActiveKey, tableCatalogMap]);
    const activeConfigActions = useMemo(() => {
      return Array.isArray(activeConfigMeta?.actions) ? activeConfigMeta.actions : [];
    }, [activeConfigMeta]);
    const canCreateInConfig = activeConfigActions.includes("create");
    const canUpdateInConfig = activeConfigActions.includes("update");
    const canDeleteInConfig = activeConfigActions.includes("delete");

    const genericConfigHeaders = useMemo(() => {
      if (!activeConfigMeta || !Array.isArray(activeConfigMeta.columns)) return [];
      const headers = (activeConfigMeta.columns || [])
        .filter((column) => column && column.name)
        .map((column) => {
          const name = String(column.name);
          return {
            key: name,
            label: String(column.label || humanizeKey(name)),
            sortable: Boolean(column.sortable !== false),
            field: name,
          };
        });
      if (canUpdateInConfig || canDeleteInConfig) headers.push({ key: "actions", label: "Действия" });
      return headers;
    }, [activeConfigMeta, canDeleteInConfig, canUpdateInConfig]);

    return (
      <>
        <div className="layout">
          <aside className="sidebar">
            <div className="logo">
              <a href="/">Правовой трекер</a>
            </div>
            <nav className="menu">
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  className={activeSection === item.key ? "active" : ""}
                  data-section={item.key}
                  type="button"
                  onClick={() => activateSection(item.key)}
                >
                  {item.label}
                </button>
              ))}
              {role === "ADMIN" ? (
                <>
                  <button
                    className={activeSection === "config" ? "active" : ""}
                    type="button"
                    onClick={() => {
                      setReferencesExpanded((prev) => !prev);
                      activateSection("config");
                    }}
                  >
                    {"Справочники " + (referencesExpanded ? "▾" : "▸")}
                  </button>
                  {referencesExpanded ? (
                    <div className="menu-tree">
                      {dictionaryTableItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={activeSection === "config" && configActiveKey === item.key ? "active" : ""}
                          onClick={() => selectConfigNode(item.key)}
                        >
                          {getTableLabel(item.key)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </nav>
            <div className="auth-box">
              {token && role ? (
                <>
                  Пользователь: <b>{email}</b>
                  <br />
                  Роль: <b>{roleLabel(role)}</b>
                </>
              ) : (
                "Не авторизован"
              )}
            </div>
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="btn secondary" type="button" onClick={refreshAll}>
                Обновить
              </button>
              <button className="btn danger" type="button" onClick={logout}>
                Выйти
              </button>
            </div>
          </aside>

          <main className="main">
            <div className="topbar">
              <div>
                <h1>Панель администратора</h1>
                <p className="muted">UniversalQuery, RBAC и аудит действий по ключевым сущностям системы.</p>
              </div>
              <span className="badge">роль: {roleLabel(role)}</span>
            </div>

            <Section active={activeSection === "dashboard"} id="section-dashboard">
              <div className="section-head">
                <div>
                  <h2>Обзор метрик</h2>
                  <p className="muted">Состояние заявок и SLA-мониторинг.</p>
                </div>
              </div>
              <div className="cards">
                {dashboardData.cards.map((card) => (
                  <div className="card" key={card.label}>
                    <p>{card.label}</p>
                    <b>{card.value}</b>
                  </div>
                ))}
              </div>
              <div className="json">{JSON.stringify(dashboardData.byStatus || {}, null, 2)}</div>
              {dashboardData.scope === "LAWYER" ? (
                <div className="json" style={{ marginTop: "0.5rem" }}>
                  {JSON.stringify(dashboardData.myUnreadByEvent || {}, null, 2)}
                </div>
              ) : null}
              <div style={{ marginTop: "0.85rem" }}>
                <h3 style={{ margin: "0 0 0.55rem" }}>Загрузка юристов</h3>
                <DataTable
                  headers={[
                    { key: "name", label: "Юрист" },
                    { key: "email", label: "Email" },
                    { key: "primary_topic_code", label: "Основная тема" },
                    { key: "active_load", label: "Активные заявки" },
                    { key: "total_assigned", label: "Всего назначено" },
                    { key: "active_amount", label: "Сумма активных" },
                    { key: "monthly_paid_gross", label: "Вал оплат за месяц" },
                    { key: "monthly_salary", label: "Зарплата за месяц" },
                  ]}
                  rows={dashboardData.lawyerLoads || []}
                  emptyColspan={8}
                  renderRow={(row) => (
                    <tr key={row.lawyer_id}>
                      <td>
                        <div className="user-identity">
                          <UserAvatar name={row.name} email={row.email} avatarUrl={row.avatar_url} accessToken={token} size={32} />
                          <div className="user-identity-text">
                            <b>{row.name || "-"}</b>
                          </div>
                        </div>
                      </td>
                      <td>{row.email || "-"}</td>
                      <td>{row.primary_topic_code || "-"}</td>
                      <td>{String(row.active_load ?? 0)}</td>
                      <td>{String(row.total_assigned ?? 0)}</td>
                      <td>{String(row.active_amount ?? 0)}</td>
                      <td>{String(row.monthly_paid_gross ?? 0)}</td>
                      <td>{String(row.monthly_salary ?? 0)}</td>
                    </tr>
                  )}
                />
              </div>
              <StatusLine status={getStatus("dashboard")} />
            </Section>

            <Section active={activeSection === "requests"} id="section-requests">
              <div className="section-head">
                <div>
                  <h2>Заявки</h2>
                  <p className="muted">Серверная фильтрация и просмотр клиентских заявок.</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn secondary" type="button" onClick={() => loadTable("requests", { resetOffset: true })}>
                    Обновить
                  </button>
                  <button className="btn" type="button" onClick={() => openCreateRecordModal("requests")}>
                    Новая заявка
                  </button>
                </div>
              </div>
              <FilterToolbar
                filters={tables.requests.filters}
                onOpen={() => openFilterModal("requests")}
                onRemove={(index) => removeFilterChip("requests", index)}
                onEdit={(index) => openFilterEditModal("requests", index)}
                getChipLabel={(clause) => {
                  const fieldDef = getFieldDef("requests", clause.field);
                  return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("requests", clause);
                }}
              />
              <DataTable
                headers={[
                  { key: "track_number", label: "Номер", sortable: true, field: "track_number" },
                  { key: "client_name", label: "Клиент", sortable: true, field: "client_name" },
                  { key: "client_phone", label: "Телефон", sortable: true, field: "client_phone" },
                  { key: "status_code", label: "Статус", sortable: true, field: "status_code" },
                  { key: "topic_code", label: "Тема", sortable: true, field: "topic_code" },
                  { key: "assigned_lawyer_id", label: "Назначен", sortable: true, field: "assigned_lawyer_id" },
                  { key: "invoice_amount", label: "Счет", sortable: true, field: "invoice_amount" },
                  { key: "paid_at", label: "Оплачено", sortable: true, field: "paid_at" },
                  { key: "updates", label: "Обновления" },
                  { key: "created_at", label: "Создана", sortable: true, field: "created_at" },
                  { key: "actions", label: "Действия" },
                ]}
                rows={tables.requests.rows}
                emptyColspan={11}
                onSort={(field) => toggleTableSort("requests", field)}
                sortClause={(tables.requests.sort && tables.requests.sort[0]) || TABLE_SERVER_CONFIG.requests.sort[0]}
                renderRow={(row) => (
                  <tr key={row.id}>
                    <td>
                      <code>{row.track_number || "-"}</code>
                    </td>
                    <td>{row.client_name || "-"}</td>
                    <td>{row.client_phone || "-"}</td>
                    <td>{statusLabel(row.status_code)}</td>
                    <td>{row.topic_code || "-"}</td>
                    <td>{row.assigned_lawyer_id || "-"}</td>
                    <td>{row.invoice_amount == null ? "-" : String(row.invoice_amount)}</td>
                    <td>{fmtDate(row.paid_at)}</td>
                    <td>{renderRequestUpdatesCell(row, role)}</td>
                    <td>{fmtDate(row.created_at)}</td>
                    <td>
                      <div className="table-actions">
                        {role === "LAWYER" && !row.assigned_lawyer_id ? (
                          <IconButton icon="📥" tooltip="Взять в работу" onClick={() => claimRequest(row.id)} />
                        ) : null}
                        {role === "ADMIN" && row.assigned_lawyer_id ? (
                          <IconButton icon="⇄" tooltip="Переназначить" onClick={() => openReassignModal(row)} />
                        ) : null}
                        <IconButton icon="👁" tooltip="Открыть заявку" onClick={() => openRequestDetails(row.id)} />
                        <IconButton icon="✎" tooltip="Редактировать заявку" onClick={() => openEditRecordModal("requests", row)} />
                        <IconButton icon="🗑" tooltip="Удалить заявку" onClick={() => deleteRecord("requests", row.id)} tone="danger" />
                      </div>
                    </td>
                  </tr>
                )}
              />
              <TablePager
                tableState={tables.requests}
                onPrev={() => loadPrevPage("requests")}
                onNext={() => loadNextPage("requests")}
                onLoadAll={() => loadAllRows("requests")}
              />
              <StatusLine status={getStatus("requests")} />
            </Section>

            <Section active={activeSection === "invoices"} id="section-invoices">
              <div className="section-head">
                <div>
                  <h2>Счета</h2>
                  <p className="muted">Выставленные счета клиентам, статусы оплаты и выгрузка PDF.</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn secondary" type="button" onClick={() => loadTable("invoices", { resetOffset: true })}>
                    Обновить
                  </button>
                  <button className="btn" type="button" onClick={() => openCreateRecordModal("invoices")}>
                    Новый счет
                  </button>
                </div>
              </div>
              <FilterToolbar
                filters={tables.invoices.filters}
                onOpen={() => openFilterModal("invoices")}
                onRemove={(index) => removeFilterChip("invoices", index)}
                onEdit={(index) => openFilterEditModal("invoices", index)}
                getChipLabel={(clause) => {
                  const fieldDef = getFieldDef("invoices", clause.field);
                  return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("invoices", clause);
                }}
              />
              <DataTable
                headers={[
                  { key: "invoice_number", label: "Номер", sortable: true, field: "invoice_number" },
                  { key: "status", label: "Статус", sortable: true, field: "status" },
                  { key: "amount", label: "Сумма", sortable: true, field: "amount" },
                  { key: "payer_display_name", label: "Плательщик", sortable: true, field: "payer_display_name" },
                  { key: "request_track_number", label: "Заявка" },
                  { key: "issued_by_name", label: "Выставил", sortable: true, field: "issued_by_admin_user_id" },
                  { key: "issued_at", label: "Сформирован", sortable: true, field: "issued_at" },
                  { key: "paid_at", label: "Оплачен", sortable: true, field: "paid_at" },
                  { key: "actions", label: "Действия" },
                ]}
                rows={tables.invoices.rows}
                emptyColspan={9}
                onSort={(field) => toggleTableSort("invoices", field)}
                sortClause={(tables.invoices.sort && tables.invoices.sort[0]) || TABLE_SERVER_CONFIG.invoices.sort[0]}
                renderRow={(row) => (
                  <tr key={row.id}>
                    <td>
                      <code>{row.invoice_number || "-"}</code>
                    </td>
                    <td>{row.status_label || invoiceStatusLabel(row.status)}</td>
                    <td>{row.amount == null ? "-" : String(row.amount) + " " + String(row.currency || "RUB")}</td>
                    <td>{row.payer_display_name || "-"}</td>
                    <td>{row.request_track_number || row.request_id || "-"}</td>
                    <td>{row.issued_by_name || "-"}</td>
                    <td>{fmtDate(row.issued_at)}</td>
                    <td>{fmtDate(row.paid_at)}</td>
                    <td>
                      <div className="table-actions">
                        <IconButton icon="👁" tooltip="Открыть заявку" onClick={() => openInvoiceRequest(row)} />
                        <IconButton icon="⬇" tooltip="Скачать PDF" onClick={() => downloadInvoicePdf(row)} />
                        <IconButton icon="✎" tooltip="Редактировать счет" onClick={() => openEditRecordModal("invoices", row)} />
                        {role === "ADMIN" ? (
                          <IconButton icon="🗑" tooltip="Удалить счет" onClick={() => deleteRecord("invoices", row.id)} tone="danger" />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )}
              />
              <TablePager
                tableState={tables.invoices}
                onPrev={() => loadPrevPage("invoices")}
                onNext={() => loadNextPage("invoices")}
                onLoadAll={() => loadAllRows("invoices")}
              />
              <StatusLine status={getStatus("invoices")} />
            </Section>

            <Section active={activeSection === "quotes"} id="section-quotes">
              <div className="section-head">
                <div>
                  <h2>Цитаты</h2>
                  <p className="muted">Управление публичной лентой цитат с серверными фильтрами.</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn secondary" type="button" onClick={() => loadTable("quotes", { resetOffset: true })}>
                    Обновить
                  </button>
                  <button className="btn" type="button" onClick={() => openCreateRecordModal("quotes")}>
                    Новая цитата
                  </button>
                </div>
              </div>
              <FilterToolbar
                filters={tables.quotes.filters}
                onOpen={() => openFilterModal("quotes")}
                onRemove={(index) => removeFilterChip("quotes", index)}
                onEdit={(index) => openFilterEditModal("quotes", index)}
                getChipLabel={(clause) => {
                  const fieldDef = getFieldDef("quotes", clause.field);
                  return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("quotes", clause);
                }}
              />
              <DataTable
                headers={[
                  { key: "author", label: "Автор", sortable: true, field: "author" },
                  { key: "text", label: "Текст", sortable: true, field: "text" },
                  { key: "source", label: "Источник", sortable: true, field: "source" },
                  { key: "is_active", label: "Активна", sortable: true, field: "is_active" },
                  { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                  { key: "created_at", label: "Создана", sortable: true, field: "created_at" },
                  { key: "actions", label: "Действия" },
                ]}
                rows={tables.quotes.rows}
                emptyColspan={7}
                onSort={(field) => toggleTableSort("quotes", field)}
                sortClause={(tables.quotes.sort && tables.quotes.sort[0]) || TABLE_SERVER_CONFIG.quotes.sort[0]}
                renderRow={(row) => (
                  <tr key={row.id}>
                    <td>{row.author || "-"}</td>
                    <td>{row.text || "-"}</td>
                    <td>{row.source || "-"}</td>
                    <td>{boolLabel(row.is_active)}</td>
                    <td>{String(row.sort_order ?? 0)}</td>
                    <td>{fmtDate(row.created_at)}</td>
                    <td>
                      <div className="table-actions">
                        <IconButton icon="✎" tooltip="Редактировать цитату" onClick={() => openEditRecordModal("quotes", row)} />
                        <IconButton icon="🗑" tooltip="Удалить цитату" onClick={() => deleteRecord("quotes", row.id)} tone="danger" />
                      </div>
                    </td>
                  </tr>
                )}
              />
              <TablePager
                tableState={tables.quotes}
                onPrev={() => loadPrevPage("quotes")}
                onNext={() => loadNextPage("quotes")}
                onLoadAll={() => loadAllRows("quotes")}
              />
              <StatusLine status={getStatus("quotes")} />
            </Section>

            <Section active={activeSection === "config"} id="section-config">
              <div className="section-head">
                <div>
                  <h2>Справочники</h2>
                  <p className="muted">Выберите справочник в дереве слева.</p>
                </div>
                <button className="btn secondary" type="button" onClick={() => loadCurrentConfigTable(true)}>
                  Обновить
                </button>
              </div>
              <div className="config-layout">
                <div className="config-panel">
                  <div className="block">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <h3 style={{ margin: 0 }}>{configActiveKey ? getTableLabel(configActiveKey) : "Справочник не выбран"}</h3>
                      {canCreateInConfig && configActiveKey ? (
                        <button className="btn" type="button" onClick={() => openCreateRecordModal(configActiveKey)}>
                          Добавить
                        </button>
                      ) : null}
                    </div>
                    <FilterToolbar
                      filters={activeConfigTableState.filters}
                      onOpen={() => openFilterModal(configActiveKey)}
                      onRemove={(index) => removeFilterChip(configActiveKey, index)}
                      onEdit={(index) => openFilterEditModal(configActiveKey, index)}
                      getChipLabel={(clause) => {
                        const fieldDef = getFieldDef(configActiveKey, clause.field);
                        return (
                          (fieldDef ? fieldDef.label : clause.field) +
                          " " +
                          OPERATOR_LABELS[clause.op] +
                          " " +
                          getFilterValuePreview(configActiveKey, clause)
                        );
                      }}
                    />
                    {configActiveKey === "topics" ? (
                      <DataTable
                        headers={[
                          { key: "code", label: "Код", sortable: true, field: "code" },
                          { key: "name", label: "Название", sortable: true, field: "name" },
                          { key: "enabled", label: "Активна", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.topics.rows}
                        emptyColspan={5}
                        onSort={(field) => toggleTableSort("topics", field)}
                        sortClause={(tables.topics.sort && tables.topics.sort[0]) || TABLE_SERVER_CONFIG.topics.sort[0]}
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>
                              <code>{row.code || "-"}</code>
                            </td>
                            <td>{row.name || "-"}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать тему" onClick={() => openEditRecordModal("topics", row)} />
                                <IconButton icon="🗑" tooltip="Удалить тему" onClick={() => deleteRecord("topics", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "quotes" ? (
                      <DataTable
                        headers={[
                          { key: "author", label: "Автор", sortable: true, field: "author" },
                          { key: "text", label: "Текст", sortable: true, field: "text" },
                          { key: "source", label: "Источник", sortable: true, field: "source" },
                          { key: "is_active", label: "Активна", sortable: true, field: "is_active" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "created_at", label: "Создана", sortable: true, field: "created_at" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.quotes.rows}
                        emptyColspan={7}
                        onSort={(field) => toggleTableSort("quotes", field)}
                        sortClause={(tables.quotes.sort && tables.quotes.sort[0]) || TABLE_SERVER_CONFIG.quotes.sort[0]}
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>{row.author || "-"}</td>
                            <td>{row.text || "-"}</td>
                            <td>{row.source || "-"}</td>
                            <td>{boolLabel(row.is_active)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>{fmtDate(row.created_at)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать цитату" onClick={() => openEditRecordModal("quotes", row)} />
                                <IconButton icon="🗑" tooltip="Удалить цитату" onClick={() => deleteRecord("quotes", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "statuses" ? (
                      <DataTable
                        headers={[
                          { key: "code", label: "Код", sortable: true, field: "code" },
                          { key: "name", label: "Название", sortable: true, field: "name" },
                          { key: "kind", label: "Тип", sortable: true, field: "kind" },
                          { key: "enabled", label: "Активен", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "is_terminal", label: "Терминальный", sortable: true, field: "is_terminal" },
                          { key: "invoice_template", label: "Шаблон счета" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.statuses.rows}
                        emptyColspan={8}
                        onSort={(field) => toggleTableSort("statuses", field)}
                        sortClause={(tables.statuses.sort && tables.statuses.sort[0]) || TABLE_SERVER_CONFIG.statuses.sort[0]}
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>
                              <code>{row.code || "-"}</code>
                            </td>
                            <td>{row.name || "-"}</td>
                            <td>{statusKindLabel(row.kind)}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>{boolLabel(row.is_terminal)}</td>
                            <td>{row.invoice_template || "-"}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать статус" onClick={() => openEditRecordModal("statuses", row)} />
                                <IconButton icon="🗑" tooltip="Удалить статус" onClick={() => deleteRecord("statuses", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "formFields" ? (
                      <DataTable
                        headers={[
                          { key: "key", label: "Ключ", sortable: true, field: "key" },
                          { key: "label", label: "Метка", sortable: true, field: "label" },
                          { key: "type", label: "Тип", sortable: true, field: "type" },
                          { key: "required", label: "Обязательное", sortable: true, field: "required" },
                          { key: "enabled", label: "Активно", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.formFields.rows}
                        emptyColspan={7}
                        onSort={(field) => toggleTableSort("formFields", field)}
                        sortClause={(tables.formFields.sort && tables.formFields.sort[0]) || TABLE_SERVER_CONFIG.formFields.sort[0]}
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>
                              <code>{row.key || "-"}</code>
                            </td>
                            <td>{row.label || "-"}</td>
                            <td>{row.type || "-"}</td>
                            <td>{boolLabel(row.required)}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать поле формы" onClick={() => openEditRecordModal("formFields", row)} />
                                <IconButton icon="🗑" tooltip="Удалить поле формы" onClick={() => deleteRecord("formFields", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "topicRequiredFields" ? (
                      <DataTable
                        headers={[
                          { key: "topic_code", label: "Тема", sortable: true, field: "topic_code" },
                          { key: "field_key", label: "Поле формы", sortable: true, field: "field_key" },
                          { key: "required", label: "Обязательное", sortable: true, field: "required" },
                          { key: "enabled", label: "Активно", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "created_at", label: "Создано", sortable: true, field: "created_at" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.topicRequiredFields.rows}
                        emptyColspan={7}
                        onSort={(field) => toggleTableSort("topicRequiredFields", field)}
                        sortClause={
                          (tables.topicRequiredFields.sort && tables.topicRequiredFields.sort[0]) ||
                          TABLE_SERVER_CONFIG.topicRequiredFields.sort[0]
                        }
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>{row.topic_code || "-"}</td>
                            <td>
                              <code>{row.field_key || "-"}</code>
                            </td>
                            <td>{boolLabel(row.required)}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>{fmtDate(row.created_at)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton
                                  icon="✎"
                                  tooltip="Редактировать обязательное поле"
                                  onClick={() => openEditRecordModal("topicRequiredFields", row)}
                                />
                                <IconButton
                                  icon="🗑"
                                  tooltip="Удалить обязательное поле"
                                  onClick={() => deleteRecord("topicRequiredFields", row.id)}
                                  tone="danger"
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "topicDataTemplates" ? (
                      <DataTable
                        headers={[
                          { key: "topic_code", label: "Тема", sortable: true, field: "topic_code" },
                          { key: "key", label: "Ключ", sortable: true, field: "key" },
                          { key: "label", label: "Метка", sortable: true, field: "label" },
                          { key: "description", label: "Описание", sortable: true, field: "description" },
                          { key: "required", label: "Обязательное", sortable: true, field: "required" },
                          { key: "enabled", label: "Активно", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "created_at", label: "Создано", sortable: true, field: "created_at" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.topicDataTemplates.rows}
                        emptyColspan={9}
                        onSort={(field) => toggleTableSort("topicDataTemplates", field)}
                        sortClause={
                          (tables.topicDataTemplates.sort && tables.topicDataTemplates.sort[0]) ||
                          TABLE_SERVER_CONFIG.topicDataTemplates.sort[0]
                        }
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>{row.topic_code || "-"}</td>
                            <td>
                              <code>{row.key || "-"}</code>
                            </td>
                            <td>{row.label || "-"}</td>
                            <td>{row.description || "-"}</td>
                            <td>{boolLabel(row.required)}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>{fmtDate(row.created_at)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать шаблон" onClick={() => openEditRecordModal("topicDataTemplates", row)} />
                                <IconButton icon="🗑" tooltip="Удалить шаблон" onClick={() => deleteRecord("topicDataTemplates", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "statusTransitions" ? (
                      <DataTable
                        headers={[
                          { key: "topic_code", label: "Тема", sortable: true, field: "topic_code" },
                          { key: "from_status", label: "Из статуса", sortable: true, field: "from_status" },
                          { key: "to_status", label: "В статус", sortable: true, field: "to_status" },
                          { key: "sla_hours", label: "SLA (часы)", sortable: true, field: "sla_hours" },
                          { key: "enabled", label: "Активен", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.statusTransitions.rows}
                        emptyColspan={7}
                        onSort={(field) => toggleTableSort("statusTransitions", field)}
                        sortClause={
                          (tables.statusTransitions.sort && tables.statusTransitions.sort[0]) || TABLE_SERVER_CONFIG.statusTransitions.sort[0]
                        }
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>{row.topic_code || "-"}</td>
                            <td>{statusLabel(row.from_status)}</td>
                            <td>{statusLabel(row.to_status)}</td>
                            <td>{row.sla_hours == null ? "-" : String(row.sla_hours)}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton
                                  icon="✎"
                                  tooltip="Редактировать переход"
                                  onClick={() => openEditRecordModal("statusTransitions", row)}
                                />
                                <IconButton
                                  icon="🗑"
                                  tooltip="Удалить переход"
                                  onClick={() => deleteRecord("statusTransitions", row.id)}
                                  tone="danger"
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "users" ? (
                      <DataTable
                        headers={[
                          { key: "name", label: "Пользователь", sortable: true, field: "name" },
                          { key: "email", label: "Email", sortable: true, field: "email" },
                          { key: "role", label: "Роль", sortable: true, field: "role" },
                          { key: "primary_topic_code", label: "Профиль (тема)", sortable: true, field: "primary_topic_code" },
                          { key: "default_rate", label: "Ставка", sortable: true, field: "default_rate" },
                          { key: "salary_percent", label: "Процент", sortable: true, field: "salary_percent" },
                          { key: "is_active", label: "Активен", sortable: true, field: "is_active" },
                          { key: "responsible", label: "Ответственный", sortable: true, field: "responsible" },
                          { key: "created_at", label: "Создан", sortable: true, field: "created_at" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.users.rows}
                        emptyColspan={10}
                        onSort={(field) => toggleTableSort("users", field)}
                        sortClause={(tables.users.sort && tables.users.sort[0]) || TABLE_SERVER_CONFIG.users.sort[0]}
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>
                              <div className="user-identity">
                                <UserAvatar name={row.name} email={row.email} avatarUrl={row.avatar_url} accessToken={token} size={32} />
                                <div className="user-identity-text">
                                  <b>{row.name || "-"}</b>
                                </div>
                              </div>
                            </td>
                            <td>{row.email || "-"}</td>
                            <td>{roleLabel(row.role)}</td>
                            <td>{row.primary_topic_code || "-"}</td>
                            <td>{row.default_rate == null ? "-" : String(row.default_rate)}</td>
                            <td>{row.salary_percent == null ? "-" : String(row.salary_percent)}</td>
                            <td>{boolLabel(row.is_active)}</td>
                            <td>{row.responsible || "-"}</td>
                            <td>{fmtDate(row.created_at)}</td>
                            <td>
                              <div className="table-actions">
                                <IconButton icon="✎" tooltip="Редактировать пользователя" onClick={() => openEditRecordModal("users", row)} />
                                <IconButton icon="🗑" tooltip="Удалить пользователя" onClick={() => deleteRecord("users", row.id)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "userTopics" ? (
                      <DataTable
                        headers={[
                          { key: "admin_user_id", label: "Юрист", sortable: true, field: "admin_user_id" },
                          { key: "topic_code", label: "Доп. тема", sortable: true, field: "topic_code" },
                          { key: "responsible", label: "Ответственный", sortable: true, field: "responsible" },
                          { key: "created_at", label: "Создано", sortable: true, field: "created_at" },
                          { key: "actions", label: "Действия" },
                        ]}
                        rows={tables.userTopics.rows}
                        emptyColspan={5}
                        onSort={(field) => toggleTableSort("userTopics", field)}
                        sortClause={(tables.userTopics.sort && tables.userTopics.sort[0]) || TABLE_SERVER_CONFIG.userTopics.sort[0]}
                        renderRow={(row) => {
                          const lawyer = (dictionaries.users || []).find((item) => String(item.id) === String(row.admin_user_id));
                          const lawyerLabel = lawyer ? (lawyer.name || lawyer.email || row.admin_user_id) : row.admin_user_id || "-";
                          return (
                            <tr key={row.id}>
                              <td>{lawyerLabel}</td>
                              <td>{row.topic_code || "-"}</td>
                              <td>{row.responsible || "-"}</td>
                              <td>{fmtDate(row.created_at)}</td>
                              <td>
                                <div className="table-actions">
                                  <IconButton icon="✎" tooltip="Редактировать связь" onClick={() => openEditRecordModal("userTopics", row)} />
                                  <IconButton icon="🗑" tooltip="Удалить связь" onClick={() => deleteRecord("userTopics", row.id)} tone="danger" />
                                </div>
                              </td>
                            </tr>
                          );
                        }}
                      />
                    ) : null}
                    {configActiveKey && !KNOWN_CONFIG_TABLE_KEYS.has(configActiveKey) ? (
                      <DataTable
                        headers={genericConfigHeaders}
                        rows={activeConfigTableState.rows}
                        emptyColspan={Math.max(1, genericConfigHeaders.length)}
                        onSort={(field) => toggleTableSort(configActiveKey, field)}
                        sortClause={
                          (activeConfigTableState.sort && activeConfigTableState.sort[0]) ||
                          ((resolveTableConfig(configActiveKey)?.sort || [])[0])
                        }
                        renderRow={(row) => (
                          <tr key={row.id || JSON.stringify(row)}>
                            {(activeConfigMeta?.columns || []).map((column) => {
                              const key = String(column.name || "");
                              const value = row[key];
                              if (column.kind === "boolean") return <td key={key}>{boolLabel(Boolean(value))}</td>;
                              if (column.kind === "date" || column.kind === "datetime") return <td key={key}>{fmtDate(value)}</td>;
                              if (column.kind === "json") return <td key={key}>{value == null ? "-" : JSON.stringify(value)}</td>;
                              return <td key={key}>{value == null || value === "" ? "-" : String(value)}</td>;
                            })}
                            {canUpdateInConfig || canDeleteInConfig ? (
                              <td>
                                <div className="table-actions">
                                  {canUpdateInConfig ? (
                                    <IconButton icon="✎" tooltip="Редактировать запись" onClick={() => openEditRecordModal(configActiveKey, row)} />
                                  ) : null}
                                  {canDeleteInConfig ? (
                                    <IconButton icon="🗑" tooltip="Удалить запись" onClick={() => deleteRecord(configActiveKey, row.id)} tone="danger" />
                                  ) : null}
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        )}
                      />
                    ) : null}
                    <TablePager
                      tableState={activeConfigTableState}
                      onPrev={() => loadPrevPage(configActiveKey)}
                      onNext={() => loadNextPage(configActiveKey)}
                      onLoadAll={() => loadAllRows(configActiveKey)}
                    />
                    <StatusLine status={getStatus(configActiveKey)} />
                  </div>
                </div>
              </div>
              <StatusLine status={getStatus("config")} />
            </Section>

            <Section active={activeSection === "meta"} id="section-meta">
              <div className="section-head">
                <div>
                  <h2>Схема метаданных</h2>
                  <p className="muted">Поля сущностей для meta-driven форм.</p>
                </div>
              </div>
              <div className="filters" style={{ gridTemplateColumns: "1fr auto" }}>
                <div className="field">
                  <label htmlFor="meta-entity">Сущность</label>
                  <input
                    id="meta-entity"
                    value={metaEntity}
                    placeholder="quotes"
                    onChange={(event) => setMetaEntity(event.target.value)}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "end" }}>
                  <button className="btn secondary" type="button" onClick={() => loadMeta()}>
                    Загрузить
                  </button>
                </div>
              </div>
              <div className="json">{metaJson}</div>
              <StatusLine status={getStatus("meta")} />
            </Section>
          </main>
        </div>

        <RequestModal open={requestModal.open} jsonText={requestModal.jsonText} onClose={() => setRequestModal((prev) => ({ ...prev, open: false }))} />

        <RecordModal
          open={recordModal.open}
          title={(recordModal.mode === "edit" ? "Редактирование • " : "Создание • ") + getTableLabel(recordModal.tableKey)}
          fields={recordModalFields}
          form={recordModal.form || {}}
          status={getStatus("recordForm")}
          onClose={closeRecordModal}
          onChange={updateRecordField}
          onUploadField={uploadRecordFieldFile}
          onSubmit={submitRecordModal}
        />

        <FilterModal
          open={filterModal.open}
          tableLabel={filterTableLabel}
          fields={activeFilterFields}
          draft={filterModal}
          status={getStatus("filter")}
          onClose={closeFilterModal}
          onFieldChange={updateFilterField}
          onOpChange={updateFilterOp}
          onValueChange={updateFilterValue}
          onSubmit={applyFilterModal}
          onClear={clearFiltersFromModal}
          getOperators={getOperatorsForType}
          getFieldOptions={getFieldOptions}
        />

        <ReassignModal
          open={reassignModal.open}
          status={getStatus("reassignForm")}
          options={getLawyerOptions()}
          value={reassignModal.lawyerId}
          onChange={updateReassignLawyer}
          onClose={closeReassignModal}
          onSubmit={submitReassignModal}
          trackNumber={reassignModal.trackNumber}
        />

        {!token || !role ? <LoginScreen onSubmit={login} status={getStatus("login")} /> : null}
      </>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("admin-root"));
  root.render(<App />);
})();
