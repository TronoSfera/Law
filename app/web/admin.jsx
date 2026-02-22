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

  const TABLE_SERVER_CONFIG = {
    requests: {
      endpoint: "/api/admin/requests/query",
      sort: [{ field: "created_at", dir: "desc" }],
    },
    quotes: {
      endpoint: "/api/admin/quotes/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
    topics: {
      endpoint: "/api/admin/config/topics/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
    statuses: {
      endpoint: "/api/admin/config/statuses/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
    formFields: {
      endpoint: "/api/admin/config/form-fields/query",
      sort: [{ field: "sort_order", dir: "asc" }],
    },
  };

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
      "Общий размер вложений (байт)": row.total_attachments_bytes ?? 0,
      Создано: fmtDate(row.created_at),
      Обновлено: fmtDate(row.updated_at),
    };
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

  function QuoteModal({ open, editing, form, status, onClose, onChange, onSubmit }) {
    if (!open) return null;
    return (
      <Overlay open={open} id="quote-overlay" onClose={(event) => event.target.id === "quote-overlay" && onClose()}>
        <div className="modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>{editing ? "Редактирование цитаты" : "Новая цитата"}</h3>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                Создание и редактирование цитат.
              </p>
            </div>
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="quote-author">Автор</label>
              <input id="quote-author" required value={form.author} onChange={(event) => onChange("author", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="quote-text">Текст</label>
              <textarea id="quote-text" required value={form.text} onChange={(event) => onChange("text", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="quote-source">Источник</label>
              <input id="quote-source" value={form.source} onChange={(event) => onChange("source", event.target.value)} />
            </div>
            <div className="filters" style={{ gridTemplateColumns: "1fr 1fr", margin: 0 }}>
              <div className="field">
                <label htmlFor="quote-sort">Порядок</label>
                <input
                  id="quote-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(event) => onChange("sort_order", event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="quote-active">Активность</label>
                <select
                  id="quote-active"
                  value={form.is_active ? "true" : "false"}
                  onChange={(event) => onChange("is_active", event.target.value === "true")}
                >
                  <option value="true">Да</option>
                  <option value="false">Нет</option>
                </select>
              </div>
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

  function App() {
    const [token, setToken] = useState("");
    const [role, setRole] = useState("");
    const [email, setEmail] = useState("");
    const [activeSection, setActiveSection] = useState("dashboard");

    const [dashboardData, setDashboardData] = useState({ cards: [], byStatus: {} });

    const [tables, setTables] = useState({
      requests: createTableState(),
      quotes: createTableState(),
      topics: createTableState(),
      statuses: createTableState(),
      formFields: createTableState(),
    });

    const [dictionaries, setDictionaries] = useState({
      topics: [],
      statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
      formFieldTypes: [...DEFAULT_FORM_FIELD_TYPES],
    });

    const [statusMap, setStatusMap] = useState({});

    const [requestModal, setRequestModal] = useState({ open: false, jsonText: "" });
    const [quoteModalOpen, setQuoteModalOpen] = useState(false);
    const [editingQuoteId, setEditingQuoteId] = useState(null);
    const [quoteForm, setQuoteForm] = useState({
      author: "",
      text: "",
      source: "",
      sort_order: 0,
      is_active: true,
    });

    const [configActiveKey, setConfigActiveKey] = useState("topics");

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

    const getTopicOptions = useCallback(() => {
      return (dictionaries.topics || [])
        .filter((item) => item && item.code)
        .map((item) => ({ value: item.code, label: (item.name || item.code) + " (" + item.code + ")" }));
    }, [dictionaries.topics]);

    const getFormFieldTypeOptions = useCallback(() => {
      return (dictionaries.formFieldTypes || []).filter(Boolean).map((item) => ({ value: item, label: item }));
    }, [dictionaries.formFieldTypes]);

    const getFilterFields = useCallback(
      (tableKey) => {
        if (tableKey === "requests") {
          return [
            { field: "track_number", label: "Номер заявки", type: "text" },
            { field: "client_name", label: "Клиент", type: "text" },
            { field: "client_phone", label: "Телефон", type: "text" },
            { field: "status_code", label: "Статус", type: "reference", options: getStatusOptions },
            { field: "topic_code", label: "Тема", type: "reference", options: getTopicOptions },
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
        return [];
      },
      [getFormFieldTypeOptions, getStatusOptions, getTopicOptions]
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
        const config = TABLE_SERVER_CONFIG[tableKey];
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

          if (tableKey === "formFields") {
            setDictionaries((prev) => {
              const set = new Set(DEFAULT_FORM_FIELD_TYPES);
              (next.rows || []).forEach((row) => {
                if (row?.type) set.add(row.type);
              });
              return {
                ...prev,
                formFieldTypes: Array.from(set.values()).sort((a, b) => String(a).localeCompare(String(b), "ru")),
              };
            });
          }

          setStatus(statusKey, "Список обновлен", "ok");
          return true;
        } catch (error) {
          setStatus(statusKey, "Ошибка: " + error.message, "error");
          return false;
        }
      },
      [api, setStatus, setTableState]
    );

    const loadCurrentConfigTable = useCallback(
      async (resetOffset, tokenOverride, keyOverride) => {
        const currentKey = keyOverride || configActiveKey;
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
          const cards = [
            { label: "Новые", value: data.new ?? 0 },
            { label: "Просрочено SLA", value: data.sla_overdue ?? 0 },
            { label: "Средний FRT (мин)", value: data.frt_avg_minutes ?? "-" },
            { label: "Групп по статусам", value: Object.keys(data.by_status || {}).length },
          ];
          const localized = {};
          Object.entries(data.by_status || {}).forEach(([code, count]) => {
            localized[statusLabel(code)] = count;
          });
          setDashboardData({ cards, byStatus: localized });
          setStatus("dashboard", "Данные обновлены", "ok");
        } catch (error) {
          setStatus("dashboard", "Ошибка: " + error.message, "error");
        }
      },
      [api, setStatus]
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
          const [topicsData, statusesData, fieldsData] = await Promise.all([
            api("/api/admin/config/topics/query", { method: "POST", body }, tokenOverride),
            api("/api/admin/config/statuses/query", { method: "POST", body }, tokenOverride),
            api("/api/admin/config/form-fields/query", { method: "POST", body }, tokenOverride),
          ]);

          const statusesMap = new Map(Object.entries(STATUS_LABELS).map(([code, name]) => [code, { code, name }]));
          (statusesData.rows || []).forEach((row) => {
            if (!row.code) return;
            statusesMap.set(row.code, { code: row.code, name: row.name || statusLabel(row.code) });
          });

          const typeSet = new Set(DEFAULT_FORM_FIELD_TYPES);
          (fieldsData.rows || []).forEach((row) => {
            if (row?.type) typeSet.add(row.type);
          });

          setDictionaries((prev) => ({
            ...prev,
            topics: sortByName((topicsData.rows || []).map((row) => ({ code: row.code, name: row.name || row.code }))),
            statuses: sortByName(Array.from(statusesMap.values())),
            formFieldTypes: Array.from(typeSet.values()).sort((a, b) => String(a).localeCompare(String(b), "ru")),
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
          const row = await api("/api/admin/requests/" + requestId);
          setRequestModal({ open: true, jsonText: JSON.stringify(localizeRequestDetails(row), null, 2) });
        } catch (error) {
          setRequestModal({ open: true, jsonText: "Ошибка: " + error.message });
        }
      },
      [api]
    );

    const openQuoteCreate = useCallback(() => {
      setEditingQuoteId(null);
      setQuoteForm({ author: "", text: "", source: "", sort_order: 0, is_active: true });
      setStatus("quoteForm", "", "");
      setQuoteModalOpen(true);
    }, [setStatus]);

    const openQuoteEdit = useCallback(
      (row) => {
        setEditingQuoteId(row.id);
        setQuoteForm({
          author: row.author || "",
          text: row.text || "",
          source: row.source || "",
          sort_order: row.sort_order ?? 0,
          is_active: Boolean(row.is_active),
        });
        setStatus("quoteForm", "", "");
        setQuoteModalOpen(true);
      },
      [setStatus]
    );

    const saveQuote = useCallback(
      async (event) => {
        event.preventDefault();
        try {
          setStatus("quoteForm", "Сохранение...", "");
          const payload = {
            author: String(quoteForm.author || "").trim(),
            text: String(quoteForm.text || "").trim(),
            source: String(quoteForm.source || "").trim() || null,
            sort_order: Number(quoteForm.sort_order || 0),
            is_active: Boolean(quoteForm.is_active),
          };

          if (!payload.author || !payload.text) throw new Error("Заполните автора и текст цитаты");

          if (editingQuoteId) {
            await api("/api/admin/quotes/" + editingQuoteId, { method: "PATCH", body: payload });
          } else {
            await api("/api/admin/quotes", { method: "POST", body: payload });
          }

          setStatus("quoteForm", "Сохранено", "ok");
          await loadTable("quotes", { resetOffset: true });
          setTimeout(() => setQuoteModalOpen(false), 300);
        } catch (error) {
          setStatus("quoteForm", "Ошибка: " + error.message, "error");
        }
      },
      [api, editingQuoteId, loadTable, quoteForm, setStatus]
    );

    const removeQuote = useCallback(
      async (id) => {
        if (!confirm("Удалить цитату?")) return;
        try {
          await api("/api/admin/quotes/" + id, { method: "DELETE" });
          setStatus("quotes", "Цитата удалена", "ok");
          await loadTable("quotes", { resetOffset: true });
        } catch (error) {
          setStatus("quotes", "Ошибка удаления: " + error.message, "error");
        }
      },
      [api, loadTable, setStatus]
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
        if (activeSection === "config") {
          loadCurrentConfigTable(false, undefined, tableKey);
        }
      },
      [activeSection, loadCurrentConfigTable]
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
      setEditingQuoteId(null);
      setQuoteModalOpen(false);
      setRequestModal({ open: false, jsonText: "" });
      setFilterModal({ open: false, tableKey: null, field: "", op: "=", rawValue: "", editIndex: null });
      setDashboardData({ cards: [], byStatus: {} });
      setMetaJson("");
      setConfigActiveKey("topics");
      setTables({
        requests: createTableState(),
        quotes: createTableState(),
        topics: createTableState(),
        statuses: createTableState(),
        formFields: createTableState(),
      });
      setDictionaries({
        topics: [],
        statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
        formFieldTypes: [...DEFAULT_FORM_FIELD_TYPES],
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
        if (!cancelled) await refreshSection(activeSection, token);
      })();
      return () => {
        cancelled = true;
      };
    }, [bootstrapReferenceData, refreshSection, role, token]);

    const anyOverlayOpen = requestModal.open || quoteModalOpen || filterModal.open;
    useEffect(() => {
      document.body.classList.toggle("modal-open", anyOverlayOpen);
      return () => document.body.classList.remove("modal-open");
    }, [anyOverlayOpen]);

    useEffect(() => {
      const onEsc = (event) => {
        if (event.key !== "Escape") return;
        setRequestModal((prev) => ({ ...prev, open: false }));
        setQuoteModalOpen(false);
        setFilterModal((prev) => ({ ...prev, open: false }));
      };
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }, []);

    const menuItems = useMemo(() => {
      return [
        { key: "dashboard", label: "Обзор", visible: true },
        { key: "requests", label: "Заявки", visible: true },
        { key: "quotes", label: "Цитаты", visible: role === "ADMIN" },
        { key: "config", label: "Справочники", visible: role === "ADMIN" },
        { key: "meta", label: "Метаданные", visible: true },
      ].filter((item) => item.visible);
    }, [role]);

    const activeFilterFields = useMemo(() => {
      if (!filterModal.tableKey) return [];
      return getFilterFields(filterModal.tableKey);
    }, [filterModal.tableKey, getFilterFields]);

    const filterTableLabel = useMemo(() => {
      if (filterModal.tableKey === "requests") return "Заявки";
      if (filterModal.tableKey === "quotes") return "Цитаты";
      if (filterModal.tableKey === "topics") return "Темы";
      if (filterModal.tableKey === "statuses") return "Статусы";
      if (filterModal.tableKey === "formFields") return "Поля формы";
      return "";
    }, [filterModal.tableKey]);

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
              <StatusLine status={getStatus("dashboard")} />
            </Section>

            <Section active={activeSection === "requests"} id="section-requests">
              <div className="section-head">
                <div>
                  <h2>Заявки</h2>
                  <p className="muted">Серверная фильтрация и просмотр клиентских заявок.</p>
                </div>
                <button className="btn secondary" type="button" onClick={() => loadTable("requests", { resetOffset: true })}>
                  Обновить
                </button>
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
                  { key: "created_at", label: "Создана", sortable: true, field: "created_at" },
                  { key: "actions", label: "Действия" },
                ]}
                rows={tables.requests.rows}
                emptyColspan={7}
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
                    <td>{fmtDate(row.created_at)}</td>
                    <td>
                      <div className="table-actions">
                        <IconButton icon="👁" tooltip="Открыть заявку" onClick={() => openRequestDetails(row.id)} />
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
                  <button className="btn" type="button" onClick={openQuoteCreate}>
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
                        <IconButton icon="✎" tooltip="Редактировать цитату" onClick={() => openQuoteEdit(row)} />
                        <IconButton icon="🗑" tooltip="Удалить цитату" onClick={() => removeQuote(row.id)} tone="danger" />
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
                  <p className="muted">Выберите справочник слева, таблица откроется справа.</p>
                </div>
                <button className="btn secondary" type="button" onClick={() => loadCurrentConfigTable(true)}>
                  Обновить
                </button>
              </div>
              <div className="config-layout">
                <div className="config-tree">
                  <div className="tree-title">Дерево справочников</div>
                  <button
                    type="button"
                    className={"tree-node" + (configActiveKey === "topics" ? " active" : "")}
                    onClick={() => selectConfigNode("topics")}
                  >
                    Темы
                  </button>
                  <button
                    type="button"
                    className={"tree-node" + (configActiveKey === "statuses" ? " active" : "")}
                    onClick={() => selectConfigNode("statuses")}
                  >
                    Статусы
                  </button>
                  <button
                    type="button"
                    className={"tree-node" + (configActiveKey === "formFields" ? " active" : "")}
                    onClick={() => selectConfigNode("formFields")}
                  >
                    Поля формы
                  </button>
                </div>
                <div className="config-panel">
                  <div className="block">
                    <h3>{configActiveKey === "topics" ? "Темы" : configActiveKey === "statuses" ? "Статусы" : "Поля формы"}</h3>
                    <FilterToolbar
                      filters={tables[configActiveKey].filters}
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
                        ]}
                        rows={tables.topics.rows}
                        emptyColspan={4}
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
                          </tr>
                        )}
                      />
                    ) : null}
                    {configActiveKey === "statuses" ? (
                      <DataTable
                        headers={[
                          { key: "code", label: "Код", sortable: true, field: "code" },
                          { key: "name", label: "Название", sortable: true, field: "name" },
                          { key: "enabled", label: "Активен", sortable: true, field: "enabled" },
                          { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                          { key: "is_terminal", label: "Терминальный", sortable: true, field: "is_terminal" },
                        ]}
                        rows={tables.statuses.rows}
                        emptyColspan={5}
                        onSort={(field) => toggleTableSort("statuses", field)}
                        sortClause={(tables.statuses.sort && tables.statuses.sort[0]) || TABLE_SERVER_CONFIG.statuses.sort[0]}
                        renderRow={(row) => (
                          <tr key={row.id}>
                            <td>
                              <code>{row.code || "-"}</code>
                            </td>
                            <td>{row.name || "-"}</td>
                            <td>{boolLabel(row.enabled)}</td>
                            <td>{String(row.sort_order ?? 0)}</td>
                            <td>{boolLabel(row.is_terminal)}</td>
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
                        ]}
                        rows={tables.formFields.rows}
                        emptyColspan={6}
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
                          </tr>
                        )}
                      />
                    ) : null}
                    <TablePager
                      tableState={tables[configActiveKey]}
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

        <QuoteModal
          open={quoteModalOpen}
          editing={Boolean(editingQuoteId)}
          form={quoteForm}
          status={getStatus("quoteForm")}
          onClose={() => setQuoteModalOpen(false)}
          onChange={(field, value) => setQuoteForm((prev) => ({ ...prev, [field]: value }))}
          onSubmit={saveQuote}
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

        {!token || !role ? <LoginScreen onSubmit={login} status={getStatus("login")} /> : null}
      </>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("admin-root"));
  root.render(<App />);
})();
