export const LS_TOKEN = "admin_access_token";
export const PAGE_SIZE = 50;
export const DEFAULT_FORM_FIELD_TYPES = ["string", "text", "number", "boolean", "date"];
export const ALL_OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "~"];

export const OPERATOR_LABELS = {
  "=": "=",
  "!=": "!=",
  ">": ">",
  "<": "<",
  ">=": ">=",
  "<=": "<=",
  "~": "~",
};

export const ROLE_LABELS = {
  ADMIN: "Администратор",
  LAWYER: "Юрист",
  CURATOR: "Куратор",
};

export const STATUS_LABELS = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  WAITING_CLIENT: "Ожидание клиента",
  WAITING_COURT: "Ожидание суда",
  RESOLVED: "Решена",
  CLOSED: "Закрыта",
  REJECTED: "Отклонена",
};

export const INVOICE_STATUS_LABELS = {
  WAITING_PAYMENT: "Ожидает оплату",
  PAID: "Оплачен",
  CANCELED: "Отменен",
};

export const STATUS_KIND_LABELS = {
  DEFAULT: "Обычный",
  INVOICE: "Выставление счета",
  PAID: "Оплачено",
};

export const REQUEST_UPDATE_EVENT_LABELS = {
  MESSAGE: "сообщение",
  ATTACHMENT: "файл",
  STATUS: "статус",
};

export const SERVICE_REQUEST_TYPE_LABELS = {
  CURATOR_CONTACT: "Запрос к куратору",
  LAWYER_CHANGE_REQUEST: "Смена юриста",
};

export const SERVICE_REQUEST_STATUS_LABELS = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  RESOLVED: "Решен",
  REJECTED: "Отклонен",
};

export const KANBAN_GROUPS = [
  { key: "NEW", label: "Новые" },
  { key: "IN_PROGRESS", label: "В работе" },
  { key: "WAITING", label: "Ожидание" },
  { key: "DONE", label: "Завершены" },
];

export const TABLE_SERVER_CONFIG = {
  requests: {
    table: "requests",
    // Requests use a specialized endpoint because it supports virtual/server-side filters
    // (e.g. deadline alerts and unread notifications) that are not plain table columns.
    endpoint: "/api/admin/requests/query",
    sort: [{ field: "created_at", dir: "desc" }],
  },
  serviceRequests: {
    table: "request_service_requests",
    endpoint: "/api/admin/crud/request_service_requests/query",
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

export const TABLE_MUTATION_CONFIG = Object.fromEntries(
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

export const TABLE_KEY_ALIASES = {
  request_service_requests: "serviceRequests",
  form_fields: "formFields",
  status_groups: "statusGroups",
  topic_required_fields: "topicRequiredFields",
  topic_data_templates: "topicDataTemplates",
  topic_status_transitions: "statusTransitions",
  admin_users: "users",
  admin_user_topics: "userTopics",
};

export const TABLE_UNALIASES = Object.fromEntries(Object.entries(TABLE_KEY_ALIASES).map(([table, alias]) => [alias, table]));

export const KNOWN_CONFIG_TABLE_KEYS = new Set([
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
