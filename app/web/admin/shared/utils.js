import {
  ALL_OPERATORS,
  INVOICE_STATUS_LABELS,
  REQUEST_UPDATE_EVENT_LABELS,
  ROLE_LABELS,
  STATUS_KIND_LABELS,
  STATUS_LABELS,
} from "./constants.js";

export function resolveAdminRoute(search) {
  const params = new URLSearchParams(String(search || ""));
  const section = String(params.get("section") || "").trim();
  const view = String(params.get("view") || "").trim();
  const requestId = String(params.get("requestId") || "").trim();
  return { section, view, requestId };
}

export function humanizeKey(value) {
  const text = String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "-";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function metaKindToFilterType(kind) {
  if (kind === "boolean") return "boolean";
  if (kind === "number") return "number";
  if (kind === "date" || kind === "datetime") return "date";
  return "text";
}

export function metaKindToRecordType(kind) {
  if (kind === "boolean") return "boolean";
  if (kind === "number") return "number";
  if (kind === "json") return "json";
  return "text";
}

export function decodeJwtPayload(token) {
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

export function sortByName(items) {
  return [...items].sort((a, b) => String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""), "ru"));
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || "-";
}

export function statusLabel(code) {
  return STATUS_LABELS[code] || code || "-";
}

export function invoiceStatusLabel(code) {
  return INVOICE_STATUS_LABELS[code] || code || "-";
}

export function statusKindLabel(code) {
  return STATUS_KIND_LABELS[code] || code || "-";
}

export function fallbackStatusGroup(statusCode) {
  const code = String(statusCode || "").toUpperCase();
  if (!code) return "NEW";
  if (code.startsWith("NEW")) return "NEW";
  if (code.includes("WAIT") || code.includes("PEND") || code.includes("HOLD")) return "WAITING";
  if (code.includes("CLOSE") || code.includes("RESOLV") || code.includes("REJECT") || code.includes("DONE") || code.includes("PAID")) return "DONE";
  return "IN_PROGRESS";
}

export function boolLabel(value) {
  return value ? "Да" : "Нет";
}

export function boolFilterLabel(value) {
  return value ? "True" : "False";
}

export function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export function fmtDateOnly(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

export function fmtTimeOnly(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function fmtKanbanDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export function fmtShortDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export function resolveDeadlineTone(value) {
  if (!value) return "ok";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "ok";
  const delta = time - Date.now();
  const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (delta > fourDaysMs) return "ok";
  if (delta > oneDayMs) return "warn";
  return "danger";
}

export function fmtAmount(value) {
  if (value == null || value === "") return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number.toLocaleString("ru-RU");
}

export function fmtBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let normalized = size;
  let index = 0;
  while (normalized >= 1024 && index < units.length - 1) {
    normalized /= 1024;
    index += 1;
  }
  return normalized.toLocaleString("ru-RU", { maximumFractionDigits: index === 0 ? 0 : 1 }) + " " + units[index];
}

export function normalizeStringList(value) {
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

export function listPreview(value, emptyLabel) {
  const items = normalizeStringList(value);
  return items.length ? items.join(", ") : emptyLabel;
}

export function normalizeReferenceMeta(raw) {
  if (!raw || typeof raw !== "object") return null;
  const table = String(raw.table || "").trim();
  const valueField = String(raw.value_field || "id").trim() || "id";
  const labelField = String(raw.label_field || valueField).trim() || valueField;
  if (!table) return null;
  return { table, value_field: valueField, label_field: labelField };
}

export function userInitials(name, email) {
  const source = String(name || "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }
  const mail = String(email || "").trim();
  return (mail.slice(0, 2) || "U").toUpperCase();
}

export function avatarColor(seed) {
  const palette = ["#6f8fa9", "#568f7d", "#a07a5c", "#7d6ea9", "#8f6f8f", "#7f8c5a"];
  const text = String(seed || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function resolveAvatarSrc(avatarUrl, accessToken) {
  const raw = String(avatarUrl || "").trim();
  if (!raw) return "";
  if (raw.startsWith("s3://")) {
    const key = raw.slice("s3://".length);
    if (!key || !accessToken) return "";
    return "/api/admin/uploads/object/" + encodeURIComponent(key) + "?token=" + encodeURIComponent(accessToken);
  }
  return raw;
}

export function resolveAdminObjectSrc(s3Key, accessToken) {
  const key = String(s3Key || "").trim();
  if (!key || !accessToken) return "";
  return "/api/admin/uploads/object/" + encodeURIComponent(key) + "?token=" + encodeURIComponent(accessToken);
}

export function detectAttachmentPreviewKind(fileName, mimeType) {
  const name = String(fileName || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  if (/\.(txt|md|csv|json|log|xml|ya?ml|ini|cfg)$/i.test(name)) return "text";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "text/xml"
  ) {
    return "text";
  }
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/.test(name)) return "video";
  if (mime === "application/pdf" || /\.pdf$/.test(name)) return "pdf";
  return "none";
}

export function buildUniversalQuery(filters, sort, limit, offset) {
  return {
    filters: filters || [],
    sort: sort || [],
    page: { limit: limit ?? 50, offset: offset ?? 0 },
  };
}

export function canAccessSection(role, section) {
  const allowed = new Set([
    "dashboard",
    "kanban",
    "requests",
    "serviceRequests",
    "requestWorkspace",
    "invoices",
    "meta",
    "quotes",
    "config",
    "availableTables",
  ]);
  if (!allowed.has(section)) return false;
  if (section === "quotes" || section === "config" || section === "availableTables") return role === "ADMIN";
  return true;
}

export function translateApiError(message) {
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

export function getOperatorsForType(type) {
  if (type === "number" || type === "date" || type === "datetime") return ["=", "!=", ">", "<", ">=", "<="];
  if (type === "boolean" || type === "reference" || type === "enum") return ["=", "!="];
  return [...ALL_OPERATORS];
}

export function localizeRequestDetails(row) {
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
    "Тип обновления для клиента": row.client_unread_event_type
      ? (REQUEST_UPDATE_EVENT_LABELS[row.client_unread_event_type] || row.client_unread_event_type)
      : null,
    "Непрочитано юристом": boolLabel(Boolean(row.lawyer_has_unread_updates)),
    "Тип обновления для юриста": row.lawyer_unread_event_type
      ? (REQUEST_UPDATE_EVENT_LABELS[row.lawyer_unread_event_type] || row.lawyer_unread_event_type)
      : null,
    "Общий размер вложений (байт)": row.total_attachments_bytes ?? 0,
    Создано: fmtDate(row.created_at),
    Обновлено: fmtDate(row.updated_at),
  };
}

export function localizeMeta(data) {
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
