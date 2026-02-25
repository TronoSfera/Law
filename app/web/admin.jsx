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
  const KANBAN_GROUPS = [
    { key: "NEW", label: "Новые" },
    { key: "IN_PROGRESS", label: "В работе" },
    { key: "WAITING", label: "Ожидание" },
    { key: "DONE", label: "Завершены" },
  ];

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

  function createRequestModalState() {
    return {
      loading: false,
      requestId: null,
      trackNumber: "",
      requestData: null,
      statusRouteNodes: [],
      messages: [],
      attachments: [],
      messageDraft: "",
      selectedFiles: [],
      fileUploading: false,
    };
  }

  function resolveAdminRoute(search) {
    const params = new URLSearchParams(String(search || ""));
    const section = String(params.get("section") || "").trim();
    const view = String(params.get("view") || "").trim();
    const requestId = String(params.get("requestId") || "").trim();
    return { section, view, requestId };
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

  function fallbackStatusGroup(statusCode) {
    const code = String(statusCode || "").toUpperCase();
    if (!code) return "NEW";
    if (code.startsWith("NEW")) return "NEW";
    if (code.includes("WAIT") || code.includes("PEND") || code.includes("HOLD")) return "WAITING";
    if (code.includes("CLOSE") || code.includes("RESOLV") || code.includes("REJECT") || code.includes("DONE") || code.includes("PAID")) return "DONE";
    return "IN_PROGRESS";
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

  function fmtDateOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function fmtTimeOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function fmtAmount(value) {
    if (value === null || value === undefined || value === "") return "-";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    return numeric.toLocaleString("ru-RU");
  }

  function isPastDeadline(value) {
    if (!value) return false;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return false;
    return time < Date.now();
  }

  function fmtBytes(value) {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return "0 Б";
    const units = ["Б", "КБ", "МБ", "ГБ"];
    let index = 0;
    let normalized = size;
    while (normalized >= 1024 && index < units.length - 1) {
      normalized /= 1024;
      index += 1;
    }
    return normalized.toLocaleString("ru-RU", { maximumFractionDigits: index === 0 ? 0 : 1 }) + " " + units[index];
  }

  function normalizeStringList(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    const seen = new Set();
    value.forEach((item) => {
      const text = String(item || "").trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  }

  function listPreview(value, emptyLabel) {
    const items = normalizeStringList(value);
    return items.length ? items.join(", ") : emptyLabel;
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

  function resolveAdminObjectSrc(s3Key, accessToken) {
    const key = String(s3Key || "").trim();
    if (!key || !accessToken) return "";
    return "/api/admin/uploads/object/" + encodeURIComponent(key) + "?token=" + encodeURIComponent(accessToken);
  }

  function detectAttachmentPreviewKind(fileName, mimeType) {
    const name = String(fileName || "").toLowerCase();
    const mime = String(mimeType || "").toLowerCase();
    if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return "image";
    if (mime.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/.test(name)) return "video";
    if (mime === "application/pdf" || /\.pdf$/.test(name)) return "pdf";
    return "none";
  }

  function buildUniversalQuery(filters, sort, limit, offset) {
    return {
      filters: filters || [],
      sort: sort || [],
      page: { limit: limit ?? PAGE_SIZE, offset: offset ?? 0 },
    };
  }

  function canAccessSection(role, section) {
    const allowed = new Set(["dashboard", "kanban", "requests", "requestWorkspace", "invoices", "meta", "quotes", "config", "availableTables"]);
    if (!allowed.has(section)) return false;
    if (section === "quotes" || section === "config" || section === "availableTables") return role === "ADMIN";
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
    const handleClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.nativeEvent && typeof event.nativeEvent.stopImmediatePropagation === "function") {
        event.nativeEvent.stopImmediatePropagation();
      }
      if (typeof onClick === "function") onClick(event);
    };
    const handleAuxClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.nativeEvent && typeof event.nativeEvent.stopImmediatePropagation === "function") {
        event.nativeEvent.stopImmediatePropagation();
      }
    };
    return (
      <button
        className={"icon-btn" + (tone ? " " + tone : "")}
        type="button"
        data-tooltip={tooltip}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        aria-label={tooltip}
      >
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

  function AttachmentPreviewModal({ open, title, url, fileName, mimeType, onClose }) {
    if (!open || !url) return null;
    const kind = detectAttachmentPreviewKind(fileName, mimeType);
    return (
      <Overlay open={open} id="request-file-preview-overlay" onClose={(event) => event.target.id === "request-file-preview-overlay" && onClose()}>
        <div className="modal request-preview-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <h3>{title || fileName || "Предпросмотр файла"}</h3>
            <button className="close" type="button" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="request-preview-body">
            {kind === "image" ? <img className="request-preview-image" src={url} alt={fileName || "attachment"} /> : null}
            {kind === "video" ? <video className="request-preview-video" src={url} controls preload="metadata" /> : null}
            {kind === "pdf" ? <iframe className="request-preview-frame" src={url} title={fileName || "preview"} /> : null}
            {kind === "none" ? <p className="request-preview-note">Для этого типа файла доступно только открытие или скачивание.</p> : null}
            <a className="btn secondary btn-sm request-preview-download" href={url} target="_blank" rel="noreferrer">
              Открыть / скачать
            </a>
          </div>
        </div>
      </Overlay>
    );
  }

  function KanbanBoard({
    loading,
    columns,
    rows,
    role,
    actorId,
    onRefresh,
    onOpenRequest,
    onClaimRequest,
    onMoveRequest,
    status,
  }) {
    const [draggingId, setDraggingId] = useState("");
    const [dragOverGroup, setDragOverGroup] = useState("");

    const safeColumns = Array.isArray(columns) && columns.length ? columns : KANBAN_GROUPS;
    const grouped = useMemo(() => {
      const map = {};
      safeColumns.forEach((column) => {
        map[String(column.key)] = [];
      });
      (rows || []).forEach((row) => {
        const group = String(row?.status_group || fallbackStatusGroup(row?.status_code));
        if (!map[group]) map[group] = [];
        map[group].push(row);
      });
      Object.keys(map).forEach((key) => {
        map[key].sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")));
      });
      return map;
    }, [rows, safeColumns]);

    const rowMap = useMemo(() => {
      const map = new Map();
      (rows || []).forEach((row) => {
        if (!row?.id) return;
        map.set(String(row.id), row);
      });
      return map;
    }, [rows]);

    const onDropToGroup = (event, groupKey) => {
      event.preventDefault();
      const requestId = String(event.dataTransfer.getData("text/plain") || draggingId || "");
      setDragOverGroup("");
      setDraggingId("");
      if (!requestId) return;
      const row = rowMap.get(requestId);
      if (!row) return;
      onMoveRequest(row, String(groupKey || ""));
    };

    return (
      <div className="kanban-wrap">
        <div className="section-head">
          <div>
            <h2>Канбан заявок</h2>
            <p className="muted">Группы статусов для разных флоу тем: новые, работа, ожидание, завершение.</p>
          </div>
          <button className="btn secondary" type="button" onClick={onRefresh} disabled={loading}>
            Обновить
          </button>
        </div>
        <div className="kanban-board" id="kanban-board">
          {safeColumns.map((column) => {
            const key = String(column.key || "");
            const cards = grouped[key] || [];
            const isOver = dragOverGroup === key;
            return (
              <div
                key={key}
                className={"kanban-column" + (isOver ? " drag-over" : "")}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverGroup(key);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget)) return;
                  setDragOverGroup((prev) => (prev === key ? "" : prev));
                }}
                onDrop={(event) => onDropToGroup(event, key)}
              >
                <div className="kanban-column-head">
                  <b>{column.label || key}</b>
                  <span>{Number(column.total ?? cards.length)}</span>
                </div>
                <div className="kanban-column-body">
                  {cards.length ? (
                    cards.map((row) => {
                      const requestId = String(row.id || "");
                      const isUnassigned = !String(row.assigned_lawyer_id || "").trim();
                      const canClaim = role === "LAWYER" && isUnassigned;
                      const canMove =
                        role === "ADMIN" ||
                        (!isUnassigned && String(row.assigned_lawyer_id || "").trim() === String(actorId || "").trim());
                      const transitionOptions = Array.isArray(row.available_transitions) ? row.available_transitions : [];
                      const deadline = row.sla_deadline_at || row.case_deadline_at || "";
                      return (
                        <article
                          key={requestId}
                          className="kanban-card"
                          draggable={canMove}
                          onDragStart={(event) => {
                            setDraggingId(requestId);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", requestId);
                          }}
                          onDragEnd={() => {
                            setDraggingId("");
                            setDragOverGroup("");
                          }}
                        >
                          <div className="kanban-card-head">
                            <code>{row.track_number || "-"}</code>
                            <span className={"kanban-status-badge group-" + String(row.status_group || "").toLowerCase()}>
                              {row.status_name || statusLabel(row.status_code)}
                            </span>
                          </div>
                          <p className="kanban-card-desc">{String(row.description || "Описание не заполнено")}</p>
                          <div className="kanban-card-meta">
                            <span>{row.client_name || "-"}</span>
                            <span>{fmtDate(row.created_at)}</span>
                          </div>
                          <div className="kanban-card-meta">
                            <span>{row.topic_code || "-"}</span>
                            <span>{row.assigned_lawyer_name || (isUnassigned ? "Не назначено" : row.assigned_lawyer_id || "-")}</span>
                          </div>
                          <div className="kanban-card-meta">
                            <span>
                              {role === "LAWYER"
                                ? row.lawyer_has_unread_updates
                                  ? "Есть новые обновления"
                                  : "Обновлений нет"
                                : row.client_has_unread_updates || row.lawyer_has_unread_updates
                                  ? "Есть непрочитанные обновления"
                                  : "Обновлений нет"}
                            </span>
                            <span className={deadline && isPastDeadline(deadline) ? "danger-text" : ""}>
                              {deadline ? "Дедлайн: " + fmtDate(deadline) : "Дедлайн: -"}
                            </span>
                          </div>
                          <div className="kanban-card-actions">
                            {canClaim ? (
                              <button className="btn secondary btn-sm" type="button" onClick={() => onClaimRequest(requestId)}>
                                Взять в работу
                              </button>
                            ) : null}
                            {canMove && transitionOptions.length ? (
                              <select
                                className="kanban-transition-select"
                                defaultValue=""
                                onChange={(event) => {
                                  const targetStatus = String(event.target.value || "");
                                  if (!targetStatus) return;
                                  onMoveRequest(row, "", targetStatus);
                                  event.target.value = "";
                                }}
                              >
                                <option value="">Перевести…</option>
                                {transitionOptions.map((transition) => (
                                  <option key={String(transition.to_status)} value={String(transition.to_status)}>
                                    {String(transition.to_status_name || transition.to_status)}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <IconButton icon="👁" tooltip="Открыть заявку" onClick={(event) => onOpenRequest(requestId, event)} />
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <p className="muted kanban-empty">Пусто</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <StatusLine status={status} />
      </div>
    );
  }

  function RequestWorkspace({
    loading,
    trackNumber,
    requestData,
    statusRouteNodes,
    messages,
    attachments,
    messageDraft,
    selectedFiles,
    fileUploading,
    status,
    onBack,
    onRefresh,
    onMessageChange,
    onSendMessage,
    onFilesSelect,
    onRemoveSelectedFile,
    onClearSelectedFiles,
  }) {
    const [preview, setPreview] = useState({ open: false, url: "", fileName: "", mimeType: "" });
    const [chatTab, setChatTab] = useState("chat");
    const [dropActive, setDropActive] = useState(false);
    const fileInputRef = useRef(null);

    const openPreview = (item) => {
      if (!item?.download_url) return;
      setPreview({
        open: true,
        url: String(item.download_url),
        fileName: String(item.file_name || ""),
        mimeType: String(item.mime_type || ""),
      });
    };

    const closePreview = () => setPreview({ open: false, url: "", fileName: "", mimeType: "" });
    const pendingFiles = Array.isArray(selectedFiles) ? selectedFiles : [];
    const hasPendingFiles = pendingFiles.length > 0;
    const canSubmit = Boolean(String(messageDraft || "").trim() || hasPendingFiles);

    const onInputFiles = (event) => {
      const files = Array.from((event.target && event.target.files) || []);
      if (files.length && typeof onFilesSelect === "function") onFilesSelect(files);
      event.target.value = "";
    };

    const onDropFiles = (event) => {
      event.preventDefault();
      setDropActive(false);
      const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
      if (files.length && typeof onFilesSelect === "function") onFilesSelect(files);
    };

    const row = requestData && typeof requestData === "object" ? requestData : null;
    const summaryFields = [
      { key: "track", label: "Номер заявки", value: row?.track_number || trackNumber || "-", code: true },
      { key: "status", label: "Статус", value: row ? statusLabel(row.status_code) : "-" },
      { key: "topic", label: "Тема", value: row?.topic_code || "-" },
      { key: "client", label: "Клиент", value: row?.client_name || "-" },
      { key: "phone", label: "Телефон", value: row?.client_phone || "-" },
      { key: "lawyer", label: "Назначенный юрист", value: row?.assigned_lawyer_id || "-" },
      { key: "rate", label: "Ставка (фикс.)", value: fmtAmount(row?.effective_rate) },
      { key: "invoice", label: "Сумма счета", value: fmtAmount(row?.invoice_amount) },
      { key: "paid", label: "Дата оплаты", value: fmtDate(row?.paid_at) },
      { key: "size", label: "Размер вложений", value: fmtBytes(row?.total_attachments_bytes) },
      { key: "created", label: "Создана", value: fmtDate(row?.created_at) },
      { key: "updated", label: "Обновлена", value: fmtDate(row?.updated_at) },
    ];

    const extraFields = row?.extra_fields && typeof row.extra_fields === "object" && !Array.isArray(row.extra_fields) ? Object.entries(row.extra_fields) : [];
    const chatTimelineItems = [];
    let previousDate = "";
    (messages || []).forEach((item, index) => {
      const dateLabel = fmtDateOnly(item?.created_at);
      const normalizedDate = dateLabel && dateLabel !== "-" ? dateLabel : "Без даты";
      if (normalizedDate !== previousDate) {
        chatTimelineItems.push({ type: "date", key: "date-" + normalizedDate + "-" + index, label: normalizedDate });
        previousDate = normalizedDate;
      }
      chatTimelineItems.push({ type: "message", key: "msg-" + String(item?.id || index), payload: item });
    });

    const routeNodes =
      Array.isArray(statusRouteNodes) && statusRouteNodes.length
        ? statusRouteNodes
        : row?.status_code
          ? [{ code: row.status_code, name: statusLabel(row.status_code), state: "current", note: "Текущий этап обработки заявки" }]
          : [];

    return (
      <div className="block">
        <div className="request-workspace-head">
          <div>
            <h3>{trackNumber ? "Работа с заявкой " + trackNumber : "Работа с заявкой"}</h3>
            <p className="breadcrumbs">
              <b>Заявки</b> {" -> "} <b>{trackNumber ? "Заявка " + trackNumber : "Карточка заявки"}</b>
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <button className="btn secondary btn-sm" type="button" onClick={onBack}>
              Назад к заявкам
            </button>
            <button className="btn secondary btn-sm" type="button" onClick={onRefresh} disabled={loading || fileUploading}>
              Обновить
            </button>
          </div>
        </div>
        <div className="request-workspace-layout">
          <div className="request-main-column">
            <div className="block">
              <h3>Карточка</h3>
              {loading ? (
                <p className="muted">Загрузка...</p>
              ) : row ? (
                <>
                  <div className="request-card-grid">
                    {summaryFields.map((field) => (
                      <div className="request-field" key={field.key}>
                        <span className="request-field-label">{field.label}</span>
                        <span className="request-field-value">{field.code ? <code>{field.value}</code> : field.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="request-description-block">
                    <span className="request-field-label">Описание проблемы</span>
                    <p>{row.description ? String(row.description) : "Описание не заполнено"}</p>
                  </div>
                  <div className="request-extra-block">
                    <span className="request-field-label">Дополнительные данные</span>
                    {extraFields.length ? (
                      <ul className="simple-list request-extra-list">
                        {extraFields.map(([key, value]) => (
                          <li key={key}>
                            <b>{humanizeKey(key)}:</b> {typeof value === "object" ? JSON.stringify(value) : String(value)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">Дополнительные данные не заполнены</p>
                    )}
                  </div>
                  <div className="request-status-route">
                    <h4>Маршрут статусов</h4>
                    {routeNodes.length ? (
                      <ol className="request-route-list" id="request-status-route">
                        {routeNodes.map((node, index) => {
                          const state = String(node?.state || "pending");
                          const name = String(node?.name || statusLabel(node?.code));
                          const note = String(node?.note || "").trim();
                          const changedAt = node?.changed_at ? fmtDate(node.changed_at) : "";
                          const className = "route-item " + (state === "current" ? "current" : state === "completed" ? "completed" : "pending");
                          return (
                            <li className={className} key={(node?.code || "node") + "-" + index}>
                              <span className="route-dot" />
                              <div className="route-body">
                                <b>{name}</b>
                                {note ? <p>{note}</p> : null}
                                {changedAt && state !== "pending" ? <div className="muted route-time">Изменен: {changedAt}</div> : null}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p className="muted">Маршрут статусов для темы не настроен</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="muted">Нет данных по заявке</p>
              )}
            </div>

          </div>

          <div className="block request-chat-block">
            <div className="request-chat-head">
              <h3>Коммуникация</h3>
              <div className="request-chat-tabs" role="tablist" aria-label="Коммуникация">
                <button
                  type="button"
                  role="tab"
                  aria-selected={chatTab === "chat"}
                  className={"tab-btn" + (chatTab === "chat" ? " active" : "")}
                  onClick={() => setChatTab("chat")}
                >
                  Чат
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={chatTab === "files"}
                  className={"tab-btn" + (chatTab === "files" ? " active" : "")}
                  onClick={() => setChatTab("files")}
                >
                  {"Файлы" + (attachments.length ? " (" + attachments.length + ")" : "")}
                </button>
              </div>
            </div>

            <input
              id="request-modal-file-input"
              ref={fileInputRef}
              type="file"
              multiple
              onChange={onInputFiles}
              disabled={loading || fileUploading}
              style={{ position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none" }}
            />

            {chatTab === "chat" ? (
              <>
                <ul className="simple-list request-modal-list request-chat-list" id="request-modal-messages">
                  {chatTimelineItems.length ? (
                    chatTimelineItems.map((entry) =>
                      entry.type === "date" ? (
                        <li key={entry.key} className="chat-date-divider">
                          <span>{entry.label}</span>
                        </li>
                      ) : (
                        <li
                          key={entry.key}
                          className={
                            "chat-message " +
                            (String(entry.payload?.author_type || "").toUpperCase() === "CLIENT" ? "incoming" : "outgoing")
                          }
                        >
                          <div className="chat-message-author">{String(entry.payload?.author_name || entry.payload?.author_type || "Система")}</div>
                          <div className="chat-message-bubble">
                            <p className="chat-message-text">{String(entry.payload?.body || "")}</p>
                            <div className="chat-message-time">{fmtTimeOnly(entry.payload?.created_at)}</div>
                          </div>
                        </li>
                      )
                    )
                  ) : (
                    <li className="muted">Сообщений нет</li>
                  )}
                </ul>
                <form className="stack" onSubmit={onSendMessage}>
                  <div
                    className={"field request-chat-composer-dropzone" + (dropActive ? " drag-active" : "")}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDropActive(true);
                    }}
                    onDragLeave={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget)) return;
                      setDropActive(false);
                    }}
                    onDrop={onDropFiles}
                  >
                    <label htmlFor="request-modal-message-body">Новое сообщение</label>
                    <textarea
                      id="request-modal-message-body"
                      placeholder="Введите сообщение для клиента"
                      value={messageDraft}
                      onChange={onMessageChange}
                      disabled={loading || fileUploading}
                    />
                    <div className="request-drop-hint muted">Перетащите файлы сюда или прикрепите скрепкой</div>
                  </div>
                  {hasPendingFiles ? (
                    <div className="request-pending-files">
                      {pendingFiles.map((file, index) => (
                        <div className="pending-file-chip" key={(file.name || "file") + "-" + String(file.lastModified || index)}>
                          <span className="pending-file-icon" aria-hidden="true">
                            📎
                          </span>
                          <span className="pending-file-name">{file.name}</span>
                          <button
                            type="button"
                            className="pending-file-remove"
                            aria-label={"Удалить файл " + file.name}
                            onClick={() => onRemoveSelectedFile(index)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn secondary btn-sm" onClick={onClearSelectedFiles}>
                        Очистить вложения
                      </button>
                    </div>
                  ) : null}
                  <div className="request-chat-composer-actions">
                    <button
                      className="icon-btn file-action-btn composer-attach-btn"
                      type="button"
                      data-tooltip="Прикрепить файл"
                      aria-label="Прикрепить файл"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading || fileUploading}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                        <path
                          d="M8.6 13.8 15 7.4a3 3 0 0 1 4.2 4.2l-8.1 8.1a5 5 0 1 1-7.1-7.1l8.6-8.6a1 1 0 0 1 1.4 1.4l-8.6 8.6a3 3 0 1 0 4.2 4.2l8.1-8.1a1 1 0 0 0-1.4-1.4l-6.4 6.4a1 1 0 0 1-1.4-1.4z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                    <button
                      className="btn"
                      id="request-modal-message-send"
                      type="submit"
                      disabled={loading || fileUploading || !canSubmit}
                    >
                      Отправить
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="request-files-tab">
                <ul className="simple-list request-modal-list" id="request-modal-files">
                  {attachments.length ? (
                    attachments.map((item) => (
                      <li key={String(item.id)}>
                        <div>{item.file_name || "Файл"}</div>
                        <div className="muted request-modal-item-meta">
                          {String(item.mime_type || "application/octet-stream") + " • " + fmtBytes(item.size_bytes) + " • " + fmtDate(item.created_at)}
                        </div>
                        <div className="request-file-actions">
                          {item.download_url && detectAttachmentPreviewKind(item.file_name, item.mime_type) !== "none" ? (
                            <button
                              className="icon-btn file-action-btn"
                              type="button"
                              data-tooltip="Предпросмотр"
                              onClick={() => openPreview(item)}
                              aria-label={"Предпросмотр: " + String(item.file_name || "файл")}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                                <path
                                  d="M12 5C6.8 5 3 9.2 2 12c1 2.8 4.8 7 10 7s9-4.2 10-7c-1-2.8-4.8-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.2A1.8 1.8 0 1 0 12 10a1.8 1.8 0 0 0 0 3.8z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                          ) : null}
                          {item.download_url ? (
                            <a
                              className="icon-btn file-action-btn request-file-link-icon"
                              data-tooltip="Скачать"
                              aria-label={"Скачать: " + String(item.file_name || "файл")}
                              href={item.download_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                                <path
                                  d="M12 3a1 1 0 0 1 1 1v8.17l2.58-2.58a1 1 0 1 1 1.42 1.42l-4.3 4.3a1 1 0 0 1-1.4 0l-4.3-4.3a1 1 0 0 1 1.42-1.42L11 12.17V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z"
                                  fill="currentColor"
                                />
                              </svg>
                            </a>
                          ) : null}
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="muted">Файлов пока нет</li>
                  )}
                </ul>
                <div className="request-files-tab-actions">
                  <button className="btn secondary btn-sm" type="button" onClick={() => setChatTab("chat")}>
                    Загрузить через чат
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <StatusLine status={status} />
        <AttachmentPreviewModal
          open={preview.open}
          title="Предпросмотр файла"
          url={preview.url}
          fileName={preview.fileName}
          mimeType={preview.mimeType}
          onClose={closePreview}
        />
      </div>
    );
  }

  function RecordModal({ open, title, fields, form, status, onClose, onChange, onSubmit, onUploadField }) {
    if (!open) return null;

    const renderField = (field) => {
      const value = form[field.key] ?? "";
      const options = typeof field.options === "function" ? field.options() : [];
      const id = "record-field-" + field.key;
      const disabled = Boolean(field.readOnly);

      if (field.type === "textarea" || field.type === "json") {
        return (
          <textarea
            id={id}
            value={value}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder || ""}
            required={Boolean(field.required)}
            disabled={disabled}
          />
        );
      }
      if (field.type === "boolean") {
        return (
          <select id={id} value={value} onChange={(event) => onChange(field.key, event.target.value)} disabled={disabled}>
            <option value="true">Да</option>
            <option value="false">Нет</option>
          </select>
        );
      }
      if (field.type === "reference" || field.type === "enum") {
        return (
          <select id={id} value={value} onChange={(event) => onChange(field.key, event.target.value)} disabled={disabled}>
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
              disabled={disabled}
            />
            <label className="btn secondary btn-sm" style={{ whiteSpace: "nowrap", opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? "none" : "auto" }}>
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
                disabled={disabled}
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
          disabled={disabled}
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
    const routeInfo = useMemo(() => resolveAdminRoute(window.location.search), []);
    const isRequestWorkspaceRoute = routeInfo.view === "request" && Boolean(routeInfo.requestId);
    const initialSection = isRequestWorkspaceRoute ? "requestWorkspace" : routeInfo.section || "dashboard";

    const [token, setToken] = useState("");
    const [role, setRole] = useState("");
    const [email, setEmail] = useState("");
    const [userId, setUserId] = useState("");
    const [activeSection, setActiveSection] = useState(initialSection);

    const [dashboardData, setDashboardData] = useState({
      scope: "",
      cards: [],
      byStatus: {},
      lawyerLoads: [],
      myUnreadByEvent: {},
    });
    const [kanbanData, setKanbanData] = useState({
      rows: [],
      columns: KANBAN_GROUPS,
      total: 0,
      truncated: false,
    });
    const [kanbanLoading, setKanbanLoading] = useState(false);

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
      availableTables: createTableState(),
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

    const [requestModal, setRequestModal] = useState(createRequestModalState());
    const [recordModal, setRecordModal] = useState({
      open: false,
      tableKey: null,
      mode: "create",
      rowId: null,
      form: {},
    });

    const [configActiveKey, setConfigActiveKey] = useState("");
    const [referencesExpanded, setReferencesExpanded] = useState(true);
    const [statusDesignerTopicCode, setStatusDesignerTopicCode] = useState("");

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
    const requestOpenGuardRef = useRef({ requestId: "", ts: 0 });
    const initialRouteHandledRef = useRef(false);
    const statusDesignerLoadedTopicRef = useRef("");
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

    const statusDesignerRows = useMemo(() => {
      const activeTopic = String(statusDesignerTopicCode || "").trim();
      const rows = tables.statusTransitions.rows || [];
      if (!activeTopic) return rows;
      return rows.filter((row) => String(row.topic_code || "") === activeTopic);
    }, [statusDesignerTopicCode, tables.statusTransitions.rows]);

    const statusDesignerCards = useMemo(() => {
      const rows = statusDesignerRows || [];
      if (!rows.length) return [];

      const orderMap = new Map();
      (tables.statuses.rows || []).forEach((row, index) => {
        const code = String(row?.code || "").trim();
        if (!code) return;
        const sortOrder = Number(row?.sort_order);
        orderMap.set(code, Number.isFinite(sortOrder) ? sortOrder : index);
      });

      const statusMetaMap = new Map();
      (dictionaries.statuses || []).forEach((row, index) => {
        const code = String(row?.code || "").trim();
        if (!code) return;
        statusMetaMap.set(code, {
          name: String(row?.name || code),
          isTerminal: false,
          order: orderMap.get(code) ?? index,
        });
      });
      (tables.statuses.rows || []).forEach((row, index) => {
        const code = String(row?.code || "").trim();
        if (!code) return;
        statusMetaMap.set(code, {
          name: String(row?.name || code),
          isTerminal: Boolean(row?.is_terminal),
          order: orderMap.get(code) ?? index,
        });
      });

      const codeSet = new Set();
      rows.forEach((row) => {
        const fromCode = String(row?.from_status || "").trim();
        const toCode = String(row?.to_status || "").trim();
        if (fromCode) codeSet.add(fromCode);
        if (toCode) codeSet.add(toCode);
      });

      const codes = Array.from(codeSet.values()).sort((a, b) => {
        const aOrder = statusMetaMap.get(a)?.order;
        const bOrder = statusMetaMap.get(b)?.order;
        if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
        if (aOrder != null && bOrder == null) return -1;
        if (aOrder == null && bOrder != null) return 1;
        return String(a).localeCompare(String(b), "ru");
      });

      return codes.map((code) => {
        const outgoing = rows
          .filter((row) => String(row?.from_status || "").trim() === code)
          .sort((a, b) => {
            const aOrder = Number(a?.sort_order || 0);
            const bOrder = Number(b?.sort_order || 0);
            if (aOrder !== bOrder) return aOrder - bOrder;
            return String(a?.to_status || "").localeCompare(String(b?.to_status || ""), "ru");
          });
        const meta = statusMetaMap.get(code) || { name: statusLabel(code), isTerminal: false };
        return {
          code,
          name: String(meta.name || statusLabel(code)),
          isTerminal: Boolean(meta.isTerminal),
          outgoing,
        };
      });
    }, [dictionaries.statuses, statusDesignerRows, tables.statuses.rows]);

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
            {
              key: "required_data_keys",
              label: "Обязательные ключи данных (JSON-массив)",
              type: "json",
              optional: true,
              defaultValue: "[]",
              placeholder: "[\"passport_scan\", \"client_address\"]",
            },
            {
              key: "required_mime_types",
              label: "Обязательные MIME-типы файлов (JSON-массив)",
              type: "json",
              optional: true,
              defaultValue: "[]",
              placeholder: "[\"application/pdf\", \"image/*\"]",
            },
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
          return false;
        }
        return loadTable(currentKey, { resetOffset: Boolean(resetOffset) }, tokenOverride);
      },
      [configActiveKey, loadTable]
    );

    const loadStatusDesignerTopic = useCallback(
      async (topicCode) => {
        const code = String(topicCode || "").trim();
        setStatusDesignerTopicCode(code);
        statusDesignerLoadedTopicRef.current = code;
        if (!code) {
          await loadTable("statusTransitions", { resetOffset: true, filtersOverride: [] });
          return;
        }
        await loadTable("statusTransitions", {
          resetOffset: true,
          filtersOverride: [{ field: "topic_code", op: "=", value: code }],
        });
      },
      [loadTable]
    );

    const loadAvailableTables = useCallback(
      async (tokenOverride) => {
        setStatus("availableTables", "Загрузка...", "");
        try {
          const data = await api("/api/admin/crud/meta/available-tables", {}, tokenOverride);
          const rows = Array.isArray(data.rows) ? data.rows : [];
          setTableState("availableTables", {
            filters: [],
            sort: null,
            offset: 0,
            total: rows.length,
            showAll: true,
            rows,
          });
          setStatus("availableTables", "Список обновлен", "ok");
          return true;
        } catch (error) {
          setStatus("availableTables", "Ошибка: " + error.message, "error");
          return false;
        }
      },
      [api, setStatus, setTableState]
    );

    useEffect(() => {
      if (configActiveKey !== "statusTransitions") {
        statusDesignerLoadedTopicRef.current = "";
        return;
      }
      const topics = dictionaries.topics || [];
      if (!topics.length) {
        setStatusDesignerTopicCode("");
        return;
      }
      const hasSelected = topics.some((item) => String(item?.code || "") === String(statusDesignerTopicCode || ""));
      const nextTopic = String(hasSelected ? statusDesignerTopicCode : topics[0]?.code || "").trim();
      if (!nextTopic) return;
      if (nextTopic !== statusDesignerTopicCode) {
        setStatusDesignerTopicCode(nextTopic);
        return;
      }
      if (statusDesignerLoadedTopicRef.current === nextTopic) return;
      statusDesignerLoadedTopicRef.current = nextTopic;
      loadTable("statusTransitions", {
        resetOffset: true,
        filtersOverride: [{ field: "topic_code", op: "=", value: nextTopic }],
      });
    }, [configActiveKey, dictionaries.topics, loadTable, statusDesignerTopicCode]);

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

    const loadKanban = useCallback(
      async (tokenOverride) => {
        setKanbanLoading(true);
        setStatus("kanban", "Загрузка...", "");
        try {
          const data = await api("/api/admin/requests/kanban?limit=400", {}, tokenOverride);
          const rows = Array.isArray(data.rows) ? data.rows : [];
          const columns = Array.isArray(data.columns) && data.columns.length ? data.columns : KANBAN_GROUPS;
          setKanbanData({
            rows,
            columns,
            total: Number(data.total || rows.length),
            truncated: Boolean(data.truncated),
          });
          const tail = Boolean(data.truncated) ? " Показана ограниченная выборка." : "";
          setStatus("kanban", "Канбан обновлен." + tail, "ok");
        } catch (error) {
          setStatus("kanban", "Ошибка: " + error.message, "error");
        } finally {
          setKanbanLoading(false);
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
        if (section === "kanban") return loadKanban(tokenOverride);
        if (section === "requests") return loadTable("requests", {}, tokenOverride);
        if (section === "invoices") return loadTable("invoices", {}, tokenOverride);
        if (section === "quotes" && canAccessSection(role, "quotes")) return loadTable("quotes", {}, tokenOverride);
        if (section === "config" && canAccessSection(role, "config")) return loadCurrentConfigTable(false, tokenOverride);
        if (section === "availableTables" && canAccessSection(role, "availableTables")) return loadAvailableTables(tokenOverride);
        if (section === "meta") return loadMeta(tokenOverride);
      },
      [loadAvailableTables, loadCurrentConfigTable, loadDashboard, loadKanban, loadMeta, loadTable, role, token]
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

    const updateAvailableTableState = useCallback(
      async (tableName, isActive) => {
        const name = String(tableName || "").trim();
        if (!name) return;
        try {
          setStatus("availableTables", "Сохранение...", "");
          await api("/api/admin/crud/meta/available-tables/" + encodeURIComponent(name), {
            method: "PATCH",
            body: { is_active: Boolean(isActive) },
          });
          await Promise.all([loadAvailableTables(), bootstrapReferenceData(token, role)]);
          setStatus("availableTables", "Сохранено", "ok");
        } catch (error) {
          setStatus("availableTables", "Ошибка: " + error.message, "error");
        }
      },
      [api, bootstrapReferenceData, loadAvailableTables, role, setStatus, token]
    );

    const loadRequestModalData = useCallback(
      async (requestId, options) => {
        const opts = options || {};
        const showLoading = opts.showLoading !== false;
        if (!requestId) return;

        if (showLoading) {
          setRequestModal((prev) => ({
            ...prev,
            loading: true,
            requestId,
            requestData: null,
            statusRouteNodes: [],
          }));
        }

        const requestFilter = [{ field: "request_id", op: "=", value: String(requestId) }];
        try {
          const [row, messagesData, attachmentsData, statusRouteData] = await Promise.all([
            api("/api/admin/crud/requests/" + requestId),
            api("/api/admin/chat/requests/" + requestId + "/messages"),
            api("/api/admin/crud/attachments/query", {
              method: "POST",
              body: buildUniversalQuery(requestFilter, [{ field: "created_at", dir: "asc" }], 500, 0),
            }),
            api("/api/admin/requests/" + requestId + "/status-route").catch(() => ({ nodes: [] })),
          ]);
          const attachments = (attachmentsData.rows || []).map((item) => ({
            ...item,
            download_url: resolveAdminObjectSrc(item.s3_key, token),
          }));
          setRequestModal((prev) => ({
            ...prev,
            loading: false,
            requestId: row.id || requestId,
            trackNumber: String(row.track_number || ""),
            requestData: row,
            statusRouteNodes: Array.isArray(statusRouteData?.nodes) ? statusRouteData.nodes : [],
            messages: messagesData.rows || [],
            attachments,
            selectedFiles: [],
            fileUploading: false,
          }));
          if (showLoading) setStatus("requestModal", "", "");
        } catch (error) {
          setRequestModal((prev) => ({
            ...prev,
            loading: false,
            requestId,
            requestData: null,
            statusRouteNodes: [],
            messages: [],
            attachments: [],
            selectedFiles: [],
            fileUploading: false,
          }));
          setStatus("requestModal", "Ошибка: " + error.message, "error");
        }
      },
      [api, setStatus, token]
    );

    const openRequestDetails = useCallback(
      async (requestId, event) => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (!requestId) return;
        const normalizedRequestId = String(requestId);
        const now = Date.now();
        const prev = requestOpenGuardRef.current;
        if (prev.requestId === normalizedRequestId && now - prev.ts < 900) return;
        requestOpenGuardRef.current = { requestId: normalizedRequestId, ts: now };
        if (window.location.pathname !== "/admin.html" || window.location.search) {
          window.history.replaceState(null, "", "/admin.html");
        }
        setStatus("requestModal", "", "");
        setActiveSection("requestWorkspace");
        await loadRequestModalData(normalizedRequestId, { showLoading: true });
      },
      [loadRequestModalData, setStatus]
    );

    const refreshRequestModal = useCallback(async () => {
      if (!requestModal.requestId) return;
      await loadRequestModalData(requestModal.requestId, { showLoading: true });
    }, [loadRequestModalData, requestModal.requestId]);

    const updateRequestModalMessageDraft = useCallback((event) => {
      const value = event.target.value;
      setRequestModal((prev) => ({ ...prev, messageDraft: value }));
    }, []);

    const submitRequestModalMessage = useCallback(
      async (event) => {
        event.preventDefault();
        const requestId = requestModal.requestId;
        const body = String(requestModal.messageDraft || "").trim();
        const files = Array.isArray(requestModal.selectedFiles) ? requestModal.selectedFiles : [];
        if (!requestId || (!body && !files.length)) return;
        try {
          setRequestModal((prev) => ({ ...prev, fileUploading: true }));
          setStatus("requestModal", files.length ? "Отправка сообщения и файлов..." : "Отправка сообщения...", "");

          let messageId = null;
          if (body) {
            const message = await api("/api/admin/chat/requests/" + requestId + "/messages", {
              method: "POST",
              body: { body },
            });
            messageId = String(message?.id || "").trim() || null;
          }

          for (const file of files) {
            const mimeType = String(file.type || "application/octet-stream");
            const init = await api("/api/admin/uploads/init", {
              method: "POST",
              body: {
                file_name: file.name,
                mime_type: mimeType,
                size_bytes: file.size,
                scope: "REQUEST_ATTACHMENT",
                request_id: requestId,
              },
            });
            const putResp = await fetch(init.presigned_url, {
              method: "PUT",
              headers: { "Content-Type": mimeType },
              body: file,
            });
            if (!putResp.ok) throw new Error("Не удалось загрузить файл в хранилище");
            await api("/api/admin/uploads/complete", {
              method: "POST",
              body: {
                key: init.key,
                file_name: file.name,
                mime_type: mimeType,
                size_bytes: file.size,
                scope: "REQUEST_ATTACHMENT",
                request_id: requestId,
                message_id: messageId,
              },
            });
          }

          setRequestModal((prev) => ({ ...prev, messageDraft: "", selectedFiles: [], fileUploading: false }));
          const successMessage = body && files.length ? "Сообщение и файлы отправлены" : files.length ? "Файлы отправлены" : "Сообщение отправлено";
          setStatus("requestModal", successMessage, "ok");
          await loadRequestModalData(requestId, { showLoading: false });
        } catch (error) {
          setRequestModal((prev) => ({ ...prev, fileUploading: false }));
          setStatus("requestModal", "Ошибка отправки: " + error.message, "error");
        }
      },
      [api, loadRequestModalData, requestModal.messageDraft, requestModal.requestId, requestModal.selectedFiles, setStatus]
    );

    const appendRequestModalFiles = useCallback((files) => {
      const list = Array.isArray(files) ? files.filter(Boolean) : [];
      if (!list.length) return;
      setRequestModal((prev) => {
        const existing = Array.isArray(prev.selectedFiles) ? prev.selectedFiles : [];
        const next = [...existing];
        list.forEach((file) => {
          const duplicate = next.some(
            (item) =>
              item &&
              item.name === file.name &&
              Number(item.size || 0) === Number(file.size || 0) &&
              Number(item.lastModified || 0) === Number(file.lastModified || 0)
          );
          if (!duplicate) next.push(file);
        });
        return { ...prev, selectedFiles: next };
      });
    }, []);

    const removeRequestModalFile = useCallback((index) => {
      setRequestModal((prev) => {
        const existing = Array.isArray(prev.selectedFiles) ? [...prev.selectedFiles] : [];
        existing.splice(index, 1);
        return { ...prev, selectedFiles: existing };
      });
    }, []);

    const clearRequestModalFiles = useCallback(() => {
      setRequestModal((prev) => ({ ...prev, selectedFiles: [] }));
    }, []);

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

    const openCreateStatusTransitionForTopic = useCallback(() => {
      const topicCode = String(statusDesignerTopicCode || "").trim();
      if (!topicCode) {
        setStatus("statusTransitions", "Сначала выберите тему для конструктора", "error");
        return;
      }
      setRecordModal({
        open: true,
        tableKey: "statusTransitions",
        mode: "create",
        rowId: null,
        form: {
          topic_code: topicCode,
          from_status: "",
          to_status: "",
          sla_hours: "",
          required_data_keys: "[]",
          required_mime_types: "[]",
          enabled: "true",
          sort_order: String(Math.max(1, (statusDesignerRows || []).length + 1)),
        },
      });
      setStatus("recordForm", "", "");
    }, [setStatus, statusDesignerRows, statusDesignerTopicCode]);

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
          setStatus("kanban", "Назначение заявки...", "");
          await api("/api/admin/requests/" + requestId + "/claim", { method: "POST" });
          setStatus("requests", "Заявка взята в работу", "ok");
          setStatus("kanban", "Заявка взята в работу", "ok");
          await Promise.all([loadTable("requests", { resetOffset: true }), loadKanban()]);
        } catch (error) {
          setStatus("requests", "Ошибка назначения: " + error.message, "error");
          setStatus("kanban", "Ошибка назначения: " + error.message, "error");
        }
      },
      [api, loadKanban, loadTable, setStatus]
    );

    const openInvoiceRequest = useCallback(
      (row, event) => {
        if (!row || !row.request_id) return;
        openRequestDetails(row.request_id, event);
      },
      [openRequestDetails]
    );

    const moveRequestFromKanban = useCallback(
      async (row, targetGroup, explicitStatus) => {
        const requestId = String(row?.id || "").trim();
        if (!requestId) return;
        const currentGroup = String(row?.status_group || fallbackStatusGroup(row?.status_code));
        const groupKey = String(targetGroup || "").trim();
        const targetStatusFromSelect = String(explicitStatus || "").trim();
        const assignedLawyerId = String(row?.assigned_lawyer_id || "").trim();

        if (role === "LAWYER" && !assignedLawyerId) {
          setStatus("kanban", "Сначала возьмите заявку в работу", "error");
          return;
        }
        if (
          role === "LAWYER" &&
          assignedLawyerId &&
          String(assignedLawyerId) !== String(userId || "")
        ) {
          setStatus("kanban", "Юрист может менять статус только своих заявок", "error");
          return;
        }

        let targetStatus = targetStatusFromSelect;
        const transitions = Array.isArray(row?.available_transitions) ? row.available_transitions : [];
        if (!targetStatus) {
          if (!groupKey || groupKey === currentGroup) return;
          const candidates = transitions.filter((item) => String(item?.target_group || "") === groupKey);
          if (!candidates.length) {
            setStatus("kanban", "Для этой карточки нет перехода в выбранную колонку", "error");
            return;
          }
          targetStatus = String(candidates[0]?.to_status || "").trim();
        }
        if (!targetStatus || targetStatus === String(row?.status_code || "")) return;

        try {
          setStatus("kanban", "Переводим заявку...", "");
          await api("/api/admin/requests/" + requestId, {
            method: "PATCH",
            body: { status_code: targetStatus },
          });
          setStatus("kanban", "Статус заявки обновлен", "ok");
          await Promise.all([loadKanban(), loadTable("requests", { resetOffset: true })]);
        } catch (error) {
          setStatus("kanban", "Ошибка перехода: " + error.message, "error");
        }
      },
      [api, loadKanban, loadTable, role, setStatus, userId]
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

    const resetAdminRoute = useCallback(() => {
      const nextUrl = "/admin.html";
      if (window.location.pathname !== nextUrl || window.location.search) {
        window.history.replaceState(null, "", nextUrl);
      }
    }, []);

    const goBackFromRequestWorkspace = useCallback(() => {
      resetAdminRoute();
      setActiveSection("requests");
      refreshSection("requests");
    }, [refreshSection, resetAdminRoute]);

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
        resetAdminRoute();
        setConfigActiveKey(tableKey);
        setActiveSection("config");
        loadCurrentConfigTable(false, undefined, tableKey);
      },
      [loadCurrentConfigTable, resetAdminRoute]
    );

    const refreshAll = useCallback(() => {
      refreshSection(activeSection);
    }, [activeSection, refreshSection]);

    const activateSection = useCallback(
      (section) => {
        const nextSection = canAccessSection(role, section) ? section : "dashboard";
        resetAdminRoute();
        setActiveSection(nextSection);
        refreshSection(nextSection);
      },
      [refreshSection, resetAdminRoute, role]
    );

    const logout = useCallback(() => {
      localStorage.removeItem(LS_TOKEN);
      setToken("");
      setRole("");
      setEmail("");
      setUserId("");
      setRecordModal({ open: false, tableKey: null, mode: "create", rowId: null, form: {} });
      setRequestModal(createRequestModalState());
      setFilterModal({ open: false, tableKey: null, field: "", op: "=", rawValue: "", editIndex: null });
      setReassignModal({ open: false, requestId: null, trackNumber: "", lawyerId: "" });
      setDashboardData({ scope: "", cards: [], byStatus: {}, lawyerLoads: [], myUnreadByEvent: {} });
      setKanbanData({ rows: [], columns: KANBAN_GROUPS, total: 0, truncated: false });
      setKanbanLoading(false);
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
        availableTables: createTableState(),
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
          setUserId(String(payload.sub || ""));

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
      setUserId(String(payload.sub || ""));
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
      if (!token || !role) return;
      if (initialRouteHandledRef.current) return;
      initialRouteHandledRef.current = true;
      if (isRequestWorkspaceRoute && routeInfo.requestId) {
        setActiveSection("requestWorkspace");
        loadRequestModalData(routeInfo.requestId, { showLoading: true });
        resetAdminRoute();
        return;
      }
      if (routeInfo.section) {
        if (canAccessSection(role, routeInfo.section)) {
          setActiveSection(routeInfo.section);
          refreshSection(routeInfo.section, token);
          resetAdminRoute();
        } else {
          setActiveSection("dashboard");
          refreshSection("dashboard", token);
          resetAdminRoute();
        }
      }
    }, [isRequestWorkspaceRoute, loadRequestModalData, refreshSection, resetAdminRoute, role, routeInfo.requestId, routeInfo.section, token]);

    useEffect(() => {
      if (!dictionaryTableItems.length) {
        if (configActiveKey) setConfigActiveKey("");
        return;
      }
      const hasCurrent = dictionaryTableItems.some((item) => item.key === configActiveKey);
      if (!hasCurrent) setConfigActiveKey(dictionaryTableItems[0].key);
    }, [configActiveKey, dictionaryTableItems]);

    const anyOverlayOpen = recordModal.open || filterModal.open || reassignModal.open;
    useEffect(() => {
      document.body.classList.toggle("modal-open", anyOverlayOpen);
      return () => document.body.classList.remove("modal-open");
    }, [anyOverlayOpen]);

    useEffect(() => {
      const onEsc = (event) => {
        if (event.key !== "Escape") return;
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
        { key: "kanban", label: "Канбан" },
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

            <Section active={activeSection === "kanban"} id="section-kanban">
              <KanbanBoard
                loading={kanbanLoading}
                columns={kanbanData.columns}
                rows={kanbanData.rows}
                role={role}
                actorId={userId}
                onRefresh={() => loadKanban()}
                onOpenRequest={openRequestDetails}
                onClaimRequest={claimRequest}
                onMoveRequest={moveRequestFromKanban}
                status={getStatus("kanban")}
              />
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
                        <IconButton icon="👁" tooltip="Открыть заявку" onClick={(event) => openRequestDetails(row.id, event)} />
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

            <Section active={activeSection === "requestWorkspace"} id="section-request-workspace">
              <div className="section-head">
                <div>
                  <h2>Карточка заявки</h2>
                  <p className="muted">Рабочая вкладка юриста/администратора по заявке.</p>
                </div>
              </div>
              <RequestWorkspace
                loading={requestModal.loading}
                trackNumber={requestModal.trackNumber}
                requestData={requestModal.requestData}
                statusRouteNodes={requestModal.statusRouteNodes}
                messages={requestModal.messages || []}
                attachments={requestModal.attachments || []}
                messageDraft={requestModal.messageDraft || ""}
                selectedFiles={requestModal.selectedFiles || []}
                fileUploading={Boolean(requestModal.fileUploading)}
                status={getStatus("requestModal")}
                onBack={goBackFromRequestWorkspace}
                onRefresh={refreshRequestModal}
                onMessageChange={updateRequestModalMessageDraft}
                onSendMessage={submitRequestModalMessage}
                onFilesSelect={appendRequestModalFiles}
                onRemoveSelectedFile={removeRequestModalFile}
                onClearSelectedFiles={clearRequestModalFiles}
              />
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
                        <IconButton icon="👁" tooltip="Открыть заявку" onClick={(event) => openInvoiceRequest(row, event)} />
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
                  <p className="breadcrumbs">{"Справочники -> " + (configActiveKey ? getTableLabel(configActiveKey) : "Справочник не выбран")}</p>
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
                      <>
                        <div className="status-designer">
                          <div className="status-designer-head">
                            <div>
                              <h4>Конструктор маршрута статусов</h4>
                              <p className="muted">Ветвления, возвраты, SLA и требования к данным/файлам на каждом переходе.</p>
                            </div>
                            <div className="status-designer-controls">
                              <select
                                id="status-designer-topic"
                                value={statusDesignerTopicCode}
                                onChange={(event) => loadStatusDesignerTopic(event.target.value)}
                              >
                                <option value="">Выберите тему</option>
                                {(dictionaries.topics || []).map((topic) => (
                                  <option key={topic.code} value={topic.code}>
                                    {(topic.name || topic.code) + " (" + topic.code + ")"}
                                  </option>
                                ))}
                              </select>
                              <button className="btn secondary btn-sm" type="button" onClick={() => loadStatusDesignerTopic(statusDesignerTopicCode)}>
                                Обновить тему
                              </button>
                              <button className="btn btn-sm" type="button" onClick={openCreateStatusTransitionForTopic}>
                                Добавить переход
                              </button>
                            </div>
                          </div>
                          {statusDesignerCards.length ? (
                            <div className="status-designer-grid" id="status-designer-cards">
                              {statusDesignerCards.map((card) => (
                                <div className="status-node-card" key={card.code}>
                                  <div className="status-node-head">
                                    <div>
                                      <b>{card.name}</b>
                                      <code>{card.code}</code>
                                    </div>
                                    {card.isTerminal ? <span className="status-node-terminal">Терминальный</span> : null}
                                  </div>
                                  {card.outgoing.length ? (
                                    <ul className="simple-list status-node-links">
                                      {card.outgoing.map((link) => (
                                        <li key={String(link.id)}>
                                          <button
                                            className="status-link-chip"
                                            type="button"
                                            onClick={() => openEditRecordModal("statusTransitions", link)}
                                          >
                                            <span>{statusLabel(link.to_status) + " (" + String(link.to_status || "-") + ")"}</span>
                                            <small>
                                              {"SLA: " +
                                                (link.sla_hours == null ? "-" : String(link.sla_hours) + " ч") +
                                                " • Данные: " +
                                                listPreview(link.required_data_keys, "-") +
                                                " • Файлы: " +
                                                listPreview(link.required_mime_types, "-")}
                                            </small>
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="muted">Нет исходящих переходов</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="muted">Для выбранной темы переходы пока не настроены.</p>
                          )}
                        </div>
                        <DataTable
                          headers={[
                            { key: "topic_code", label: "Тема", sortable: true, field: "topic_code" },
                            { key: "from_status", label: "Из статуса", sortable: true, field: "from_status" },
                            { key: "to_status", label: "В статус", sortable: true, field: "to_status" },
                            { key: "sla_hours", label: "SLA (часы)", sortable: true, field: "sla_hours" },
                            { key: "required_data_keys", label: "Обязательные данные" },
                            { key: "required_mime_types", label: "Обязательные файлы" },
                            { key: "enabled", label: "Активен", sortable: true, field: "enabled" },
                            { key: "sort_order", label: "Порядок", sortable: true, field: "sort_order" },
                            { key: "actions", label: "Действия" },
                          ]}
                          rows={tables.statusTransitions.rows}
                          emptyColspan={9}
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
                              <td>{listPreview(row.required_data_keys, "-")}</td>
                              <td>{listPreview(row.required_mime_types, "-")}</td>
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
                      </>
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
            </Section>

            <Section active={activeSection === "availableTables"} id="section-available-tables">
              <div className="section-head">
                <div>
                  <h2>Доступность таблиц</h2>
                  <p className="muted">Скрытая служебная вкладка. Доступ только для администратора по прямой ссылке.</p>
                </div>
                <button className="btn secondary" type="button" onClick={() => loadAvailableTables()}>
                  Обновить
                </button>
              </div>
              <DataTable
                headers={[
                  { key: "label", label: "Таблица" },
                  { key: "table", label: "Код" },
                  { key: "section", label: "Раздел" },
                  { key: "is_active", label: "Активна" },
                  { key: "updated_at", label: "Обновлена" },
                  { key: "responsible", label: "Ответственный" },
                  { key: "actions", label: "Действия" },
                ]}
                rows={tables.availableTables.rows}
                emptyColspan={7}
                renderRow={(row) => (
                  <tr key={String(row.table || row.label)}>
                    <td>{row.label || "-"}</td>
                    <td>
                      <code>{row.table || "-"}</code>
                    </td>
                    <td>{row.section || "-"}</td>
                    <td>{boolLabel(Boolean(row.is_active))}</td>
                    <td>{fmtDate(row.updated_at)}</td>
                    <td>{row.responsible || "-"}</td>
                    <td>
                      <div className="table-actions">
                        <IconButton
                          icon={row.is_active ? "⏸" : "▶"}
                          tooltip={row.is_active ? "Деактивировать таблицу" : "Активировать таблицу"}
                          onClick={() => updateAvailableTableState(row.table, !Boolean(row.is_active))}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              />
              <StatusLine status={getStatus("availableTables")} />
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
