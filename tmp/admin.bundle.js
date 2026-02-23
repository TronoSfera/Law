(() => {
  // app/web/admin.jsx
  (function() {
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
      "~": "~"
    };
    const ROLE_LABELS = {
      ADMIN: "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440",
      LAWYER: "\u042E\u0440\u0438\u0441\u0442"
    };
    const STATUS_LABELS = {
      NEW: "\u041D\u043E\u0432\u0430\u044F",
      IN_PROGRESS: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
      WAITING_CLIENT: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u0430",
      WAITING_COURT: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0441\u0443\u0434\u0430",
      RESOLVED: "\u0420\u0435\u0448\u0435\u043D\u0430",
      CLOSED: "\u0417\u0430\u043A\u0440\u044B\u0442\u0430",
      REJECTED: "\u041E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430"
    };
    const INVOICE_STATUS_LABELS = {
      WAITING_PAYMENT: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u043F\u043B\u0430\u0442\u0443",
      PAID: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D",
      CANCELED: "\u041E\u0442\u043C\u0435\u043D\u0435\u043D"
    };
    const STATUS_KIND_LABELS = {
      DEFAULT: "\u041E\u0431\u044B\u0447\u043D\u044B\u0439",
      INVOICE: "\u0412\u044B\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u0447\u0435\u0442\u0430",
      PAID: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E"
    };
    const REQUEST_UPDATE_EVENT_LABELS = {
      MESSAGE: "\u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
      ATTACHMENT: "\u0444\u0430\u0439\u043B",
      STATUS: "\u0441\u0442\u0430\u0442\u0443\u0441"
    };
    const TABLE_SERVER_CONFIG = {
      requests: {
        table: "requests",
        endpoint: "/api/admin/crud/requests/query",
        sort: [{ field: "created_at", dir: "desc" }]
      },
      invoices: {
        table: "invoices",
        endpoint: "/api/admin/invoices/query",
        sort: [{ field: "issued_at", dir: "desc" }]
      },
      quotes: {
        table: "quotes",
        endpoint: "/api/admin/crud/quotes/query",
        sort: [{ field: "sort_order", dir: "asc" }]
      },
      topics: {
        table: "topics",
        endpoint: "/api/admin/crud/topics/query",
        sort: [{ field: "sort_order", dir: "asc" }]
      },
      statuses: {
        table: "statuses",
        endpoint: "/api/admin/crud/statuses/query",
        sort: [{ field: "sort_order", dir: "asc" }]
      },
      formFields: {
        table: "form_fields",
        endpoint: "/api/admin/crud/form_fields/query",
        sort: [{ field: "sort_order", dir: "asc" }]
      },
      topicRequiredFields: {
        table: "topic_required_fields",
        endpoint: "/api/admin/crud/topic_required_fields/query",
        sort: [{ field: "sort_order", dir: "asc" }]
      },
      topicDataTemplates: {
        table: "topic_data_templates",
        endpoint: "/api/admin/crud/topic_data_templates/query",
        sort: [{ field: "sort_order", dir: "asc" }]
      },
      statusTransitions: {
        table: "topic_status_transitions",
        endpoint: "/api/admin/crud/topic_status_transitions/query",
        sort: [{ field: "sort_order", dir: "asc" }]
      },
      users: {
        table: "admin_users",
        endpoint: "/api/admin/crud/admin_users/query",
        sort: [{ field: "created_at", dir: "desc" }]
      },
      userTopics: {
        table: "admin_user_topics",
        endpoint: "/api/admin/crud/admin_user_topics/query",
        sort: [{ field: "created_at", dir: "desc" }]
      }
    };
    const TABLE_MUTATION_CONFIG = Object.fromEntries(
      Object.entries(TABLE_SERVER_CONFIG).map(([tableKey, config]) => [
        tableKey,
        {
          create: "/api/admin/crud/" + config.table,
          update: (id) => "/api/admin/crud/" + config.table + "/" + id,
          delete: (id) => "/api/admin/crud/" + config.table + "/" + id
        }
      ])
    );
    TABLE_MUTATION_CONFIG.invoices = {
      create: "/api/admin/invoices",
      update: (id) => "/api/admin/invoices/" + id,
      delete: (id) => "/api/admin/invoices/" + id
    };
    const TABLE_KEY_ALIASES = {
      form_fields: "formFields",
      topic_required_fields: "topicRequiredFields",
      topic_data_templates: "topicDataTemplates",
      topic_status_transitions: "statusTransitions",
      admin_users: "users",
      admin_user_topics: "userTopics"
    };
    const TABLE_UNALIASES = Object.fromEntries(Object.entries(TABLE_KEY_ALIASES).map(([table, alias]) => [alias, table]));
    const KNOWN_CONFIG_TABLE_KEYS = /* @__PURE__ */ new Set([
      "quotes",
      "topics",
      "statuses",
      "formFields",
      "topicRequiredFields",
      "topicDataTemplates",
      "statusTransitions",
      "users",
      "userTopics"
    ]);
    function createTableState() {
      return {
        filters: [],
        sort: null,
        offset: 0,
        total: 0,
        showAll: false,
        rows: []
      };
    }
    function humanizeKey(value) {
      const text = String(value || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
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
          atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
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
      return value ? "\u0414\u0430" : "\u041D\u0435\u0442";
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
      for (let i = 0; i < text.length; i += 1) hash = hash * 31 + text.charCodeAt(i) >>> 0;
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
        page: { limit: limit ?? PAGE_SIZE, offset: offset ?? 0 }
      };
    }
    function canAccessSection(role, section) {
      if (section === "quotes" || section === "config") return role === "ADMIN";
      return true;
    }
    function translateApiError(message) {
      const direct = {
        "Missing auth token": "\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043E\u043A\u0435\u043D \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438",
        "Missing bearer token": "\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043E\u043A\u0435\u043D \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438",
        "Invalid token": "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0442\u043E\u043A\u0435\u043D",
        Forbidden: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432",
        "Invalid credentials": "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043B\u043E\u0433\u0438\u043D \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044C",
        "Request not found": "\u0417\u0430\u044F\u0432\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430",
        "Quote not found": "\u0426\u0438\u0442\u0430\u0442\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430",
        not_found: "\u0417\u0430\u043F\u0438\u0441\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430"
      };
      if (direct[message]) return direct[message];
      if (String(message).startsWith("HTTP ")) return "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 (" + message + ")";
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
        "\u041D\u043E\u043C\u0435\u0440 \u0437\u0430\u044F\u0432\u043A\u0438": row.track_number || null,
        \u041A\u043B\u0438\u0435\u043D\u0442: row.client_name || null,
        \u0422\u0435\u043B\u0435\u0444\u043E\u043D: row.client_phone || null,
        "\u0422\u0435\u043C\u0430 (\u043A\u043E\u0434)": row.topic_code || null,
        \u0421\u0442\u0430\u0442\u0443\u0441: statusLabel(row.status_code),
        \u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435: row.description || null,
        "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u044F": row.extra_fields || {},
        "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0439 \u044E\u0440\u0438\u0441\u0442 (ID)": row.assigned_lawyer_id || null,
        "\u0421\u0442\u0430\u0432\u043A\u0430 (\u0444\u0438\u043A\u0441.)": row.effective_rate ?? null,
        "\u0421\u0443\u043C\u043C\u0430 \u0441\u0447\u0435\u0442\u0430": row.invoice_amount ?? null,
        "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E": row.paid_at ? fmtDate(row.paid_at) : null,
        "\u041E\u043F\u043B\u0430\u0442\u0443 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043B (ID)": row.paid_by_admin_id || null,
        "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u043C": boolLabel(Boolean(row.client_has_unread_updates)),
        "\u0422\u0438\u043F \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F \u0434\u043B\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0430": row.client_unread_event_type ? REQUEST_UPDATE_EVENT_LABELS[row.client_unread_event_type] || row.client_unread_event_type : null,
        "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E \u044E\u0440\u0438\u0441\u0442\u043E\u043C": boolLabel(Boolean(row.lawyer_has_unread_updates)),
        "\u0422\u0438\u043F \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F \u0434\u043B\u044F \u044E\u0440\u0438\u0441\u0442\u0430": row.lawyer_unread_event_type ? REQUEST_UPDATE_EVENT_LABELS[row.lawyer_unread_event_type] || row.lawyer_unread_event_type : null,
        "\u041E\u0431\u0449\u0438\u0439 \u0440\u0430\u0437\u043C\u0435\u0440 \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u0439 (\u0431\u0430\u0439\u0442)": row.total_attachments_bytes ?? 0,
        \u0421\u043E\u0437\u0434\u0430\u043D\u043E: fmtDate(row.created_at),
        \u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E: fmtDate(row.updated_at)
      };
    }
    function renderRequestUpdatesCell(row, role) {
      if (role === "LAWYER") {
        const has = Boolean(row.lawyer_has_unread_updates);
        const eventType = String(row.lawyer_unread_event_type || "").toUpperCase();
        return has ? /* @__PURE__ */ React.createElement("span", { className: "request-update-chip", title: "\u0415\u0441\u0442\u044C \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u043E\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435: " + (REQUEST_UPDATE_EVENT_LABELS[eventType] || eventType.toLowerCase()) }, /* @__PURE__ */ React.createElement("span", { className: "request-update-dot" }), REQUEST_UPDATE_EVENT_LABELS[eventType] || "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435") : /* @__PURE__ */ React.createElement("span", { className: "request-update-empty" }, "\u043D\u0435\u0442");
      }
      const clientHas = Boolean(row.client_has_unread_updates);
      const clientType = String(row.client_unread_event_type || "").toUpperCase();
      const lawyerHas = Boolean(row.lawyer_has_unread_updates);
      const lawyerType = String(row.lawyer_unread_event_type || "").toUpperCase();
      if (!clientHas && !lawyerHas) return /* @__PURE__ */ React.createElement("span", { className: "request-update-empty" }, "\u043D\u0435\u0442");
      return /* @__PURE__ */ React.createElement("span", { className: "request-updates-stack" }, clientHas ? /* @__PURE__ */ React.createElement("span", { className: "request-update-chip", title: "\u041A\u043B\u0438\u0435\u043D\u0442\u0443: " + (REQUEST_UPDATE_EVENT_LABELS[clientType] || clientType.toLowerCase()) }, /* @__PURE__ */ React.createElement("span", { className: "request-update-dot" }), "\u041A\u043B\u0438\u0435\u043D\u0442: " + (REQUEST_UPDATE_EVENT_LABELS[clientType] || "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435")) : null, lawyerHas ? /* @__PURE__ */ React.createElement("span", { className: "request-update-chip", title: "\u042E\u0440\u0438\u0441\u0442\u0443: " + (REQUEST_UPDATE_EVENT_LABELS[lawyerType] || lawyerType.toLowerCase()) }, /* @__PURE__ */ React.createElement("span", { className: "request-update-dot" }), "\u042E\u0440\u0438\u0441\u0442: " + (REQUEST_UPDATE_EVENT_LABELS[lawyerType] || "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435")) : null);
    }
    function localizeMeta(data) {
      const fieldTypeMap = {
        string: "\u0441\u0442\u0440\u043E\u043A\u0430",
        text: "\u0442\u0435\u043A\u0441\u0442",
        boolean: "\u0431\u0443\u043B\u0435\u0432\u043E",
        number: "\u0447\u0438\u0441\u043B\u043E",
        date: "\u0434\u0430\u0442\u0430"
      };
      return {
        \u0421\u0443\u0449\u043D\u043E\u0441\u0442\u044C: data.entity,
        \u041F\u043E\u043B\u044F: (data.fields || []).map((field) => ({
          "\u041A\u043E\u0434 \u043F\u043E\u043B\u044F": field.field_name,
          \u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435: field.label,
          \u0422\u0438\u043F: fieldTypeMap[field.type] || field.type,
          \u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435: boolLabel(field.required),
          "\u0422\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u0435\u043D\u0438\u0435": boolLabel(field.read_only),
          "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0435\u043C\u044B\u0435 \u0440\u043E\u043B\u0438": (field.editable_roles || []).map(roleLabel)
        }))
      };
    }
    function StatusLine({ status }) {
      return /* @__PURE__ */ React.createElement("p", { className: "status" + (status?.kind ? " " + status.kind : "") }, status?.message || "");
    }
    function Section({ active, children, id }) {
      return /* @__PURE__ */ React.createElement("section", { className: "section" + (active ? " active" : ""), id }, children);
    }
    function DataTable({ headers, rows, emptyColspan, renderRow, onSort, sortClause }) {
      return /* @__PURE__ */ React.createElement("div", { className: "table-wrap" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, headers.map((header) => {
        const h = typeof header === "string" ? { key: header, label: header } : header;
        const sortable = Boolean(h.sortable && h.field && onSort);
        const active = Boolean(sortable && sortClause && sortClause.field === h.field);
        const direction = active ? sortClause.dir : "";
        return /* @__PURE__ */ React.createElement(
          "th",
          {
            key: h.key || h.label,
            className: sortable ? "sortable-th" : "",
            onClick: sortable ? () => onSort(h.field) : void 0,
            title: sortable ? "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u0434\u043B\u044F \u0441\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0438" : void 0
          },
          /* @__PURE__ */ React.createElement("span", { className: sortable ? "sortable-head" : "" }, h.label, sortable ? /* @__PURE__ */ React.createElement("span", { className: "sort-indicator" + (active ? " active" : "") }, direction === "desc" ? "\u2193" : "\u2191") : null)
        );
      }))), /* @__PURE__ */ React.createElement("tbody", null, rows.length ? rows.map((row, index) => renderRow(row, index)) : /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: emptyColspan }, "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445")))));
    }
    function TablePager({ tableState, onPrev, onNext, onLoadAll }) {
      return /* @__PURE__ */ React.createElement("div", { className: "pager" }, /* @__PURE__ */ React.createElement("div", null, tableState.showAll ? "\u0412\u0441\u0435\u0433\u043E: " + tableState.total + " \u2022 \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0432\u0441\u0435 \u0437\u0430\u043F\u0438\u0441\u0438" : "\u0412\u0441\u0435\u0433\u043E: " + tableState.total + " \u2022 \u0441\u043C\u0435\u0449\u0435\u043D\u0438\u0435: " + tableState.offset), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.5rem" } }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn secondary",
          type: "button",
          onClick: onLoadAll,
          disabled: tableState.total === 0 || tableState.showAll || tableState.rows.length >= tableState.total
        },
        "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0432\u0441\u0435 " + tableState.total
      ), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onPrev, disabled: tableState.showAll || tableState.offset <= 0 }, "\u041D\u0430\u0437\u0430\u0434"), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn secondary",
          type: "button",
          onClick: onNext,
          disabled: tableState.showAll || tableState.offset + PAGE_SIZE >= tableState.total
        },
        "\u0412\u043F\u0435\u0440\u0435\u0434"
      )));
    }
    function FilterToolbar({ filters, onOpen, onRemove, onEdit, getChipLabel }) {
      return /* @__PURE__ */ React.createElement("div", { className: "filter-toolbar" }, /* @__PURE__ */ React.createElement("div", { className: "filter-chips" }, filters.length ? filters.map((filter, index) => /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "filter-chip",
          key: filter.field + filter.op + index,
          onClick: () => onEdit(index),
          role: "button",
          tabIndex: 0,
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onEdit(index);
            }
          },
          title: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440"
        },
        /* @__PURE__ */ React.createElement("span", null, getChipLabel(filter)),
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            "aria-label": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440",
            onClick: (event) => {
              event.stopPropagation();
              onRemove(index);
            }
          },
          "\xD7"
        )
      )) : /* @__PURE__ */ React.createElement("span", { className: "chip-placeholder" }, "\u0424\u0438\u043B\u044C\u0442\u0440\u044B \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u044B")), /* @__PURE__ */ React.createElement("div", { className: "filter-action" }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onOpen }, "\u0424\u0438\u043B\u044C\u0442\u0440")));
    }
    function Overlay({ open, onClose, children, id }) {
      return /* @__PURE__ */ React.createElement("div", { className: "overlay" + (open ? " open" : ""), id, onClick: onClose }, children);
    }
    function IconButton({ icon, tooltip, onClick, tone }) {
      return /* @__PURE__ */ React.createElement("button", { className: "icon-btn" + (tone ? " " + tone : ""), type: "button", "data-tooltip": tooltip, onClick, "aria-label": tooltip }, icon);
    }
    function UserAvatar({ name, email, avatarUrl, accessToken, size = 32 }) {
      const [broken, setBroken] = useState(false);
      useEffect(() => setBroken(false), [avatarUrl]);
      const initials = userInitials(name, email);
      const bg = avatarColor(name || email || initials);
      const src = resolveAvatarSrc(avatarUrl, accessToken);
      const canShowImage = Boolean(src && !broken);
      return /* @__PURE__ */ React.createElement("span", { className: "avatar", style: { width: size + "px", height: size + "px", backgroundColor: bg } }, canShowImage ? /* @__PURE__ */ React.createElement("img", { src, alt: name || email || "avatar", onError: () => setBroken(true) }) : /* @__PURE__ */ React.createElement("span", null, initials));
    }
    function LoginScreen({ onSubmit, status }) {
      const [email, setEmail] = useState("");
      const [password, setPassword] = useState("");
      const submit = (event) => {
        event.preventDefault();
        onSubmit(email, password);
      };
      return /* @__PURE__ */ React.createElement("div", { className: "login-screen" }, /* @__PURE__ */ React.createElement("div", { className: "login-card" }, /* @__PURE__ */ React.createElement("h2", null, "\u0412\u0445\u043E\u0434 \u0432 \u0430\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u044C"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0443\u0447\u0435\u0442\u043D\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430 \u0438\u043B\u0438 \u044E\u0440\u0438\u0441\u0442\u0430."), /* @__PURE__ */ React.createElement("form", { className: "stack", style: { marginTop: "0.7rem" }, onSubmit: submit }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "login-email" }, "\u042D\u043B. \u043F\u043E\u0447\u0442\u0430"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "login-email",
          type: "email",
          required: true,
          placeholder: "admin@example.com",
          value: email,
          onChange: (event) => setEmail(event.target.value)
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "login-password" }, "\u041F\u0430\u0440\u043E\u043B\u044C"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "login-password",
          type: "password",
          required: true,
          placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
          value: password,
          onChange: (event) => setPassword(event.target.value)
        }
      )), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "\u0412\u043E\u0439\u0442\u0438"), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
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
      getFieldOptions
    }) {
      if (!open) return null;
      const selectedField = fields.find((field) => field.field === draft.field) || fields[0] || null;
      const operators = getOperators(selectedField?.type || "text");
      const options = selectedField ? getFieldOptions(selectedField) : [];
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "filter-overlay", onClose: (event) => event.target.id === "filter-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal", style: { width: "min(560px, 100%)" }, onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0424\u0438\u043B\u044C\u0442\u0440 \u0442\u0430\u0431\u043B\u0438\u0446\u044B"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.35rem" } }, tableLabel ? (draft.editIndex !== null ? "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u0430 \u2022 " : "\u041D\u043E\u0432\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440 \u2022 ") + "\u0422\u0430\u0431\u043B\u0438\u0446\u0430: " + tableLabel : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u043B\u0435, \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0438 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435.")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "filter-field" }, "\u041F\u043E\u043B\u0435"), /* @__PURE__ */ React.createElement("select", { id: "filter-field", value: draft.field, onChange: onFieldChange }, fields.map((field) => /* @__PURE__ */ React.createElement("option", { value: field.field, key: field.field }, field.label)))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "filter-op" }, "\u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440"), /* @__PURE__ */ React.createElement("select", { id: "filter-op", value: draft.op, onChange: onOpChange }, operators.map((op) => /* @__PURE__ */ React.createElement("option", { value: op, key: op }, OPERATOR_LABELS[op])))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "filter-value" }, selectedField ? "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435: " + selectedField.label : "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435"), !selectedField || selectedField.type === "text" ? /* @__PURE__ */ React.createElement("input", { id: "filter-value", type: "text", value: draft.rawValue, onChange: onValueChange, placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435" }) : selectedField.type === "number" ? /* @__PURE__ */ React.createElement("input", { id: "filter-value", type: "number", step: "any", value: draft.rawValue, onChange: onValueChange, placeholder: "\u0427\u0438\u0441\u043B\u043E" }) : selectedField.type === "date" ? /* @__PURE__ */ React.createElement("input", { id: "filter-value", type: "date", value: draft.rawValue, onChange: onValueChange }) : selectedField.type === "boolean" ? /* @__PURE__ */ React.createElement("select", { id: "filter-value", value: draft.rawValue, onChange: onValueChange }, /* @__PURE__ */ React.createElement("option", { value: "true" }, "True"), /* @__PURE__ */ React.createElement("option", { value: "false" }, "False")) : selectedField.type === "reference" || selectedField.type === "enum" ? /* @__PURE__ */ React.createElement("select", { id: "filter-value", value: draft.rawValue, onChange: onValueChange, disabled: !options.length }, !options.length ? /* @__PURE__ */ React.createElement("option", { value: "" }, "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0439") : options.map((option) => /* @__PURE__ */ React.createElement("option", { value: String(option.value), key: String(option.value) }, option.label))) : /* @__PURE__ */ React.createElement("input", { id: "filter-value", type: "text", value: draft.rawValue, onChange: onValueChange, placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435" })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.6rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C/\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClear }, "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u0435"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClose }, "\u041E\u0442\u043C\u0435\u043D\u0430")), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
    }
    function ReassignModal({ open, status, options, value, onChange, onClose, onSubmit, trackNumber }) {
      if (!open) return null;
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "reassign-overlay", onClose: (event) => event.target.id === "reassign-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal", style: { width: "min(520px, 100%)" }, onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u041F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.35rem" } }, trackNumber ? "\u0417\u0430\u044F\u0432\u043A\u0430: " + trackNumber : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043D\u043E\u0432\u043E\u0433\u043E \u044E\u0440\u0438\u0441\u0442\u0430")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "reassign-lawyer" }, "\u041D\u043E\u0432\u044B\u0439 \u044E\u0440\u0438\u0441\u0442"), /* @__PURE__ */ React.createElement("select", { id: "reassign-lawyer", value, onChange, disabled: !options.length }, !options.length ? /* @__PURE__ */ React.createElement("option", { value: "" }, "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u044E\u0440\u0438\u0441\u0442\u043E\u0432") : options.map((option) => /* @__PURE__ */ React.createElement("option", { value: String(option.value), key: String(option.value) }, option.label)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.6rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: !value }, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClose }, "\u041E\u0442\u043C\u0435\u043D\u0430")), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
    }
    function RequestModal({ open, jsonText, onClose }) {
      if (!open) return null;
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "request-overlay", onClose: (event) => event.target.id === "request-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0414\u0435\u0442\u0430\u043B\u0438 \u0437\u0430\u044F\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.35rem" } }, "\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0437\u0430\u044F\u0432\u043A\u0438.")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "json" }, jsonText)));
    }
    function RecordModal({ open, title, fields, form, status, onClose, onChange, onSubmit, onUploadField }) {
      if (!open) return null;
      const renderField = (field) => {
        const value = form[field.key] ?? "";
        const options = typeof field.options === "function" ? field.options() : [];
        const id = "record-field-" + field.key;
        if (field.type === "textarea" || field.type === "json") {
          return /* @__PURE__ */ React.createElement(
            "textarea",
            {
              id,
              value,
              onChange: (event) => onChange(field.key, event.target.value),
              placeholder: field.placeholder || "",
              required: Boolean(field.required)
            }
          );
        }
        if (field.type === "boolean") {
          return /* @__PURE__ */ React.createElement("select", { id, value, onChange: (event) => onChange(field.key, event.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "true" }, "\u0414\u0430"), /* @__PURE__ */ React.createElement("option", { value: "false" }, "\u041D\u0435\u0442"));
        }
        if (field.type === "reference" || field.type === "enum") {
          return /* @__PURE__ */ React.createElement("select", { id, value, onChange: (event) => onChange(field.key, event.target.value) }, field.optional ? /* @__PURE__ */ React.createElement("option", { value: "" }, "-") : null, options.map((option) => /* @__PURE__ */ React.createElement("option", { value: String(option.value), key: String(option.value) }, option.label)));
        }
        if (field.uploadScope) {
          return /* @__PURE__ */ React.createElement("div", { className: "field-inline" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              id,
              type: "text",
              value,
              onChange: (event) => onChange(field.key, event.target.value),
              placeholder: field.placeholder || "",
              required: Boolean(field.required)
            }
          ), /* @__PURE__ */ React.createElement("label", { className: "btn secondary btn-sm", style: { whiteSpace: "nowrap" } }, "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C", /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "file",
              accept: field.accept || "*/*",
              style: { display: "none" },
              onChange: (event) => {
                const file = event.target.files && event.target.files[0];
                if (file && onUploadField) onUploadField(field, file);
                event.target.value = "";
              }
            }
          )));
        }
        return /* @__PURE__ */ React.createElement(
          "input",
          {
            id,
            type: field.type === "number" ? "number" : field.type === "password" ? "password" : "text",
            step: field.type === "number" ? "any" : void 0,
            value,
            onChange: (event) => onChange(field.key, event.target.value),
            placeholder: field.placeholder || "",
            required: Boolean(field.required)
          }
        );
      };
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "record-overlay", onClose: (event) => event.target.id === "record-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal", style: { width: "min(760px, 100%)" }, onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, title), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginTop: "0.35rem" } }, "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u0438 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u043F\u0438\u0441\u0438.")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit }, /* @__PURE__ */ React.createElement("div", { className: "filters", style: { gridTemplateColumns: "repeat(2, minmax(0,1fr))" } }, fields.map((field) => /* @__PURE__ */ React.createElement("div", { className: "field", key: field.key }, /* @__PURE__ */ React.createElement("label", { htmlFor: "record-field-" + field.key }, field.label), renderField(field)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.6rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: onClose }, "\u041E\u0442\u043C\u0435\u043D\u0430")), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
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
        myUnreadByEvent: {}
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
        userTopics: createTableState()
      });
      const [tableCatalog, setTableCatalog] = useState([]);
      const [dictionaries, setDictionaries] = useState({
        topics: [],
        statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
        formFieldTypes: [...DEFAULT_FORM_FIELD_TYPES],
        formFieldKeys: [],
        users: []
      });
      const [statusMap, setStatusMap] = useState({});
      const [requestModal, setRequestModal] = useState({ open: false, jsonText: "" });
      const [recordModal, setRecordModal] = useState({
        open: false,
        tableKey: null,
        mode: "create",
        rowId: null,
        form: {}
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
        editIndex: null
      });
      const [reassignModal, setReassignModal] = useState({
        open: false,
        requestId: null,
        trackNumber: "",
        lawyerId: ""
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
          const authToken = tokenOverride !== void 0 ? tokenOverride : token;
          const headers = { "Content-Type": "application/json", ...opts.headers || {} };
          if (opts.auth !== false) {
            if (!authToken) throw new Error("\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043E\u043A\u0435\u043D \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438");
            headers.Authorization = "Bearer " + authToken;
          }
          const response = await fetch(path, {
            method: opts.method || "GET",
            headers,
            body: opts.body ? JSON.stringify(opts.body) : void 0
          });
          const text = await response.text();
          let payload;
          try {
            payload = text ? JSON.parse(text) : {};
          } catch (_) {
            payload = { raw: text };
          }
          if (!response.ok) {
            const message = payload && (payload.detail || payload.error || payload.raw) || "HTTP " + response.status;
            throw new Error(translateApiError(String(message)));
          }
          return payload;
        },
        [token]
      );
      const getStatusOptions = useCallback(() => {
        return (dictionaries.statuses || []).filter((item) => item && item.code).map((item) => ({ value: item.code, label: (item.name || statusLabel(item.code)) + " (" + item.code + ")" }));
      }, [dictionaries.statuses]);
      const getInvoiceStatusOptions = useCallback(() => {
        return Object.entries(INVOICE_STATUS_LABELS).map(([code, name]) => ({ value: code, label: name + " (" + code + ")" }));
      }, []);
      const getStatusKindOptions = useCallback(() => {
        return Object.entries(STATUS_KIND_LABELS).map(([code, name]) => ({ value: code, label: name + " (" + code + ")" }));
      }, []);
      const getTopicOptions = useCallback(() => {
        return (dictionaries.topics || []).filter((item) => item && item.code).map((item) => ({ value: item.code, label: (item.name || item.code) + " (" + item.code + ")" }));
      }, [dictionaries.topics]);
      const getLawyerOptions = useCallback(() => {
        return (dictionaries.users || []).filter((item) => item && item.id && String(item.role || "").toUpperCase() === "LAWYER").map((item) => ({
          value: item.id,
          label: (item.name || item.email || item.id) + (item.email ? " (" + item.email + ")" : "")
        }));
      }, [dictionaries.users]);
      const getFormFieldTypeOptions = useCallback(() => {
        return (dictionaries.formFieldTypes || []).filter(Boolean).map((item) => ({ value: item, label: item }));
      }, [dictionaries.formFieldTypes]);
      const getFormFieldKeyOptions = useCallback(() => {
        return (dictionaries.formFieldKeys || []).filter((item) => item && item.key).map((item) => ({ value: item.key, label: (item.label || item.key) + " (" + item.key + ")" }));
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
        return (tableCatalog || []).filter((item) => item && item.section === "dictionary" && Array.isArray(item.actions) && item.actions.includes("query")).sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));
      }, [tableCatalog]);
      const resolveTableConfig = useCallback(
        (tableKey) => {
          if (TABLE_SERVER_CONFIG[tableKey]) return TABLE_SERVER_CONFIG[tableKey];
          const meta = tableCatalogMap[tableKey];
          if (!meta || !meta.table) return null;
          const tableName = String(meta.table || tableKey);
          return {
            table: tableName,
            endpoint: String(meta.query_endpoint || "/api/admin/crud/" + tableName + "/query"),
            sort: Array.isArray(meta.default_sort) && meta.default_sort.length ? meta.default_sort : [{ field: "created_at", dir: "desc" }]
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
            create: String(meta.create_endpoint || "/api/admin/crud/" + tableName),
            update: (id) => String(meta.update_endpoint_template || "/api/admin/crud/" + tableName + "/{id}").replace("{id}", String(id)),
            delete: (id) => String(meta.delete_endpoint_template || "/api/admin/crud/" + tableName + "/{id}").replace("{id}", String(id))
          };
        },
        [tableCatalogMap]
      );
      const getFilterFields = useCallback(
        (tableKey) => {
          if (tableKey === "requests") {
            return [
              { field: "track_number", label: "\u041D\u043E\u043C\u0435\u0440 \u0437\u0430\u044F\u0432\u043A\u0438", type: "text" },
              { field: "client_name", label: "\u041A\u043B\u0438\u0435\u043D\u0442", type: "text" },
              { field: "client_phone", label: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", type: "text" },
              { field: "status_code", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "reference", options: getStatusOptions },
              { field: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "invoice_amount", label: "\u0421\u0443\u043C\u043C\u0430 \u0441\u0447\u0435\u0442\u0430", type: "number" },
              { field: "effective_rate", label: "\u0421\u0442\u0430\u0432\u043A\u0430", type: "number" },
              { field: "paid_at", label: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E", type: "date" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "invoices") {
            return [
              { field: "invoice_number", label: "\u041D\u043E\u043C\u0435\u0440 \u0441\u0447\u0435\u0442\u0430", type: "text" },
              { field: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "enum", options: getInvoiceStatusOptions },
              { field: "amount", label: "\u0421\u0443\u043C\u043C\u0430", type: "number" },
              { field: "currency", label: "\u0412\u0430\u043B\u044E\u0442\u0430", type: "text" },
              { field: "payer_display_name", label: "\u041F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A", type: "text" },
              { field: "request_id", label: "ID \u0437\u0430\u044F\u0432\u043A\u0438", type: "text" },
              { field: "issued_by_admin_user_id", label: "ID \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430", type: "text" },
              { field: "issued_at", label: "\u0414\u0430\u0442\u0430 \u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F", type: "date" },
              { field: "paid_at", label: "\u0414\u0430\u0442\u0430 \u043E\u043F\u043B\u0430\u0442\u044B", type: "date" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "quotes") {
            return [
              { field: "author", label: "\u0410\u0432\u0442\u043E\u0440", type: "text" },
              { field: "text", label: "\u0422\u0435\u043A\u0441\u0442", type: "text" },
              { field: "source", label: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A", type: "text" },
              { field: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "topics") {
            return [
              { field: "code", label: "\u041A\u043E\u0434", type: "text" },
              { field: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", type: "text" },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" }
            ];
          }
          if (tableKey === "statuses") {
            return [
              { field: "code", label: "\u041A\u043E\u0434", type: "text" },
              { field: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", type: "text" },
              { field: "kind", label: "\u0422\u0438\u043F", type: "enum", options: getStatusKindOptions },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" },
              { field: "is_terminal", label: "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439", type: "boolean" }
            ];
          }
          if (tableKey === "formFields") {
            return [
              { field: "key", label: "\u041A\u043B\u044E\u0447", type: "text" },
              { field: "label", label: "\u041C\u0435\u0442\u043A\u0430", type: "text" },
              { field: "type", label: "\u0422\u0438\u043F", type: "enum", options: getFormFieldTypeOptions },
              { field: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean" },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" }
            ];
          }
          if (tableKey === "topicRequiredFields") {
            return [
              { field: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "field_key", label: "\u041F\u043E\u043B\u0435 \u0444\u043E\u0440\u043C\u044B", type: "reference", options: getFormFieldKeyOptions },
              { field: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean" },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" }
            ];
          }
          if (tableKey === "topicDataTemplates") {
            return [
              { field: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "key", label: "\u041A\u043B\u044E\u0447", type: "text" },
              { field: "label", label: "\u041C\u0435\u0442\u043A\u0430", type: "text" },
              { field: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean" },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "statusTransitions") {
            return [
              { field: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "from_status", label: "\u0418\u0437 \u0441\u0442\u0430\u0442\u0443\u0441\u0430", type: "reference", options: getStatusOptions },
              { field: "to_status", label: "\u0412 \u0441\u0442\u0430\u0442\u0443\u0441", type: "reference", options: getStatusOptions },
              { field: "sla_hours", label: "SLA (\u0447\u0430\u0441\u044B)", type: "number" },
              { field: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean" },
              { field: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number" }
            ];
          }
          if (tableKey === "users") {
            return [
              { field: "name", label: "\u0418\u043C\u044F", type: "text" },
              { field: "email", label: "Email", type: "text" },
              { field: "role", label: "\u0420\u043E\u043B\u044C", type: "enum", options: getRoleOptions },
              { field: "primary_topic_code", label: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C (\u0442\u0435\u043C\u0430)", type: "reference", options: getTopicOptions },
              { field: "default_rate", label: "\u0421\u0442\u0430\u0432\u043A\u0430 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E", type: "number" },
              { field: "salary_percent", label: "\u041F\u0440\u043E\u0446\u0435\u043D\u0442 \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u044B", type: "number" },
              { field: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean" },
              { field: "responsible", label: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439", type: "text" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          if (tableKey === "userTopics") {
            return [
              { field: "admin_user_id", label: "\u042E\u0440\u0438\u0441\u0442", type: "reference", options: getLawyerOptions },
              { field: "topic_code", label: "\u0414\u043E\u043F. \u0442\u0435\u043C\u0430", type: "reference", options: getTopicOptions },
              { field: "responsible", label: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439", type: "text" },
              { field: "created_at", label: "\u0414\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F", type: "date" }
            ];
          }
          const meta = tableCatalogMap[tableKey];
          if (!meta || !Array.isArray(meta.columns)) return [];
          return (meta.columns || []).filter((column) => column && column.name && column.filterable !== false).map((column) => {
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
          getTopicOptions
        ]
      );
      const getTableLabel = useCallback((tableKey) => {
        if (tableKey === "requests") return "\u0417\u0430\u044F\u0432\u043A\u0438";
        if (tableKey === "invoices") return "\u0421\u0447\u0435\u0442\u0430";
        if (tableKey === "quotes") return "\u0426\u0438\u0442\u0430\u0442\u044B";
        if (tableKey === "topics") return "\u0422\u0435\u043C\u044B";
        if (tableKey === "statuses") return "\u0421\u0442\u0430\u0442\u0443\u0441\u044B";
        if (tableKey === "formFields") return "\u041F\u043E\u043B\u044F \u0444\u043E\u0440\u043C\u044B";
        if (tableKey === "topicRequiredFields") return "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u044F \u043F\u043E \u0442\u0435\u043C\u0430\u043C";
        if (tableKey === "topicDataTemplates") return "\u0428\u0430\u0431\u043B\u043E\u043D\u044B \u0434\u043E\u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u043F\u043E \u0442\u0435\u043C\u0430\u043C";
        if (tableKey === "statusTransitions") return "\u041F\u0435\u0440\u0435\u0445\u043E\u0434\u044B \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432";
        if (tableKey === "users") return "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0438";
        if (tableKey === "userTopics") return "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0442\u0435\u043C\u044B \u044E\u0440\u0438\u0441\u0442\u043E\u0432";
        const meta = tableCatalogMap[tableKey];
        if (meta && meta.label) return String(meta.label);
        const raw = TABLE_UNALIASES[tableKey] || tableKey;
        return humanizeKey(raw);
      }, [tableCatalogMap]);
      const getRecordFields = useCallback(
        (tableKey) => {
          if (tableKey === "requests") {
            return [
              { key: "track_number", label: "\u041D\u043E\u043C\u0435\u0440 \u0437\u0430\u044F\u0432\u043A\u0438", type: "text", optional: true, placeholder: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438" },
              { key: "client_name", label: "\u041A\u043B\u0438\u0435\u043D\u0442", type: "text", required: true },
              { key: "client_phone", label: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", type: "text", required: true },
              { key: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", optional: true, options: getTopicOptions },
              { key: "status_code", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "reference", required: true, options: getStatusOptions },
              { key: "description", label: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", type: "textarea", optional: true },
              { key: "extra_fields", label: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u044F (JSON)", type: "json", optional: true, defaultValue: "{}" },
              { key: "assigned_lawyer_id", label: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0439 \u044E\u0440\u0438\u0441\u0442 (ID)", type: "text", optional: true },
              { key: "effective_rate", label: "\u0421\u0442\u0430\u0432\u043A\u0430 (\u0444\u0438\u043A\u0441.)", type: "number", optional: true },
              { key: "invoice_amount", label: "\u0421\u0443\u043C\u043C\u0430 \u0441\u0447\u0435\u0442\u0430", type: "number", optional: true },
              { key: "paid_at", label: "\u0414\u0430\u0442\u0430 \u043E\u043F\u043B\u0430\u0442\u044B (ISO)", type: "text", optional: true, placeholder: "2026-02-23T12:00:00+03:00" },
              { key: "paid_by_admin_id", label: "\u041E\u043F\u043B\u0430\u0442\u0443 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043B (ID)", type: "text", optional: true },
              { key: "total_attachments_bytes", label: "\u0420\u0430\u0437\u043C\u0435\u0440 \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u0439 (\u0431\u0430\u0439\u0442)", type: "number", optional: true, defaultValue: "0" }
            ];
          }
          if (tableKey === "invoices") {
            return [
              { key: "request_track_number", label: "\u041D\u043E\u043C\u0435\u0440 \u0437\u0430\u044F\u0432\u043A\u0438", type: "text", required: true, createOnly: true },
              { key: "invoice_number", label: "\u041D\u043E\u043C\u0435\u0440 \u0441\u0447\u0435\u0442\u0430", type: "text", optional: true, placeholder: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438" },
              { key: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441", type: "enum", required: true, options: getInvoiceStatusOptions, defaultValue: "WAITING_PAYMENT" },
              { key: "amount", label: "\u0421\u0443\u043C\u043C\u0430", type: "number", required: true },
              { key: "currency", label: "\u0412\u0430\u043B\u044E\u0442\u0430", type: "text", optional: true, defaultValue: "RUB" },
              { key: "payer_display_name", label: "\u041F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A (\u0424\u0418\u041E / \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F)", type: "text", required: true },
              { key: "payer_details", label: "\u0420\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B (JSON, \u0448\u0438\u0444\u0440\u0443\u0435\u0442\u0441\u044F)", type: "json", optional: true, omitIfEmpty: true, placeholder: '{"inn":"..."}' }
            ];
          }
          if (tableKey === "quotes") {
            return [
              { key: "author", label: "\u0410\u0432\u0442\u043E\u0440", type: "text", required: true },
              { key: "text", label: "\u0422\u0435\u043A\u0441\u0442", type: "textarea", required: true },
              { key: "source", label: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A", type: "text", optional: true },
              { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" }
            ];
          }
          if (tableKey === "topics") {
            return [
              { key: "code", label: "\u041A\u043E\u0434", type: "text", required: true, autoCreate: true },
              { key: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", type: "text", required: true },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" }
            ];
          }
          if (tableKey === "statuses") {
            return [
              { key: "code", label: "\u041A\u043E\u0434", type: "text", required: true },
              { key: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", type: "text", required: true },
              { key: "kind", label: "\u0422\u0438\u043F", type: "enum", required: true, options: getStatusKindOptions, defaultValue: "DEFAULT" },
              { key: "invoice_template", label: "\u0428\u0430\u0431\u043B\u043E\u043D \u0441\u0447\u0435\u0442\u0430", type: "textarea", optional: true, placeholder: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u043F\u043E\u043B\u044F: {track_number}, {client_name}, {topic_code}, {amount}" },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" },
              { key: "is_terminal", label: "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439", type: "boolean", defaultValue: "false" }
            ];
          }
          if (tableKey === "formFields") {
            return [
              { key: "key", label: "\u041A\u043B\u044E\u0447", type: "text", required: true },
              { key: "label", label: "\u041C\u0435\u0442\u043A\u0430", type: "text", required: true },
              { key: "type", label: "\u0422\u0438\u043F", type: "enum", required: true, options: getFormFieldTypeOptions },
              { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean", defaultValue: "false" },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" },
              { key: "options", label: "\u041E\u043F\u0446\u0438\u0438 (JSON)", type: "json", optional: true }
            ];
          }
          if (tableKey === "topicRequiredFields") {
            return [
              { key: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", required: true, options: getTopicOptions },
              { key: "field_key", label: "\u041F\u043E\u043B\u0435 \u0444\u043E\u0440\u043C\u044B", type: "reference", required: true, options: getFormFieldKeyOptions },
              { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean", defaultValue: "true" },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" }
            ];
          }
          if (tableKey === "topicDataTemplates") {
            return [
              { key: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", required: true, options: getTopicOptions },
              { key: "key", label: "\u041A\u043B\u044E\u0447", type: "text", required: true },
              { key: "label", label: "\u041C\u0435\u0442\u043A\u0430", type: "text", required: true },
              { key: "description", label: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", type: "textarea", optional: true },
              { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", type: "boolean", defaultValue: "true" },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" }
            ];
          }
          if (tableKey === "statusTransitions") {
            return [
              { key: "topic_code", label: "\u0422\u0435\u043C\u0430", type: "reference", required: true, options: getTopicOptions },
              { key: "from_status", label: "\u0418\u0437 \u0441\u0442\u0430\u0442\u0443\u0441\u0430", type: "reference", required: true, options: getStatusOptions },
              { key: "to_status", label: "\u0412 \u0441\u0442\u0430\u0442\u0443\u0441", type: "reference", required: true, options: getStatusOptions },
              { key: "sla_hours", label: "SLA (\u0447\u0430\u0441\u044B)", type: "number", optional: true },
              { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean", defaultValue: "true" },
              { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", type: "number", defaultValue: "0" }
            ];
          }
          if (tableKey === "users") {
            return [
              { key: "name", label: "\u0418\u043C\u044F", type: "text", required: true },
              { key: "email", label: "Email", type: "text", required: true },
              { key: "role", label: "\u0420\u043E\u043B\u044C", type: "enum", required: true, options: getRoleOptions, defaultValue: "LAWYER" },
              {
                key: "avatar_url",
                label: "URL \u0430\u0432\u0430\u0442\u0430\u0440\u0430",
                type: "text",
                optional: true,
                placeholder: "https://... \u0438\u043B\u0438 s3://...",
                uploadScope: "USER_AVATAR",
                accept: "image/*"
              },
              { key: "primary_topic_code", label: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C (\u0442\u0435\u043C\u0430)", type: "reference", optional: true, options: getTopicOptions },
              { key: "default_rate", label: "\u0421\u0442\u0430\u0432\u043A\u0430 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E", type: "number", optional: true },
              { key: "salary_percent", label: "\u041F\u0440\u043E\u0446\u0435\u043D\u0442 \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u044B", type: "number", optional: true },
              { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", type: "boolean", defaultValue: "true" },
              { key: "password", label: "\u041F\u0430\u0440\u043E\u043B\u044C", type: "password", requiredOnCreate: true, optional: true, omitIfEmpty: true, placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C" }
            ];
          }
          if (tableKey === "userTopics") {
            return [
              { key: "admin_user_id", label: "\u042E\u0440\u0438\u0441\u0442", type: "reference", required: true, options: getLawyerOptions },
              { key: "topic_code", label: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0442\u0435\u043C\u0430", type: "reference", required: true, options: getTopicOptions }
            ];
          }
          const meta = tableCatalogMap[tableKey];
          if (!meta || !Array.isArray(meta.columns)) return [];
          return (meta.columns || []).filter((column) => column && column.name && column.editable).map((column) => {
            const key = String(column.name || "");
            const requiredOnCreate = Boolean(column.required_on_create);
            return {
              key,
              label: String(column.label || humanizeKey(key)),
              type: metaKindToRecordType(column.kind),
              requiredOnCreate,
              optional: !requiredOnCreate
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
          getTopicOptions
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
            filters: Array.isArray(opts.filtersOverride) ? [...opts.filtersOverride] : [...current.filters || []],
            sort: Array.isArray(opts.sortOverride) ? [...opts.sortOverride] : Array.isArray(current.sort) ? [...current.sort] : null,
            rows: [...current.rows || []]
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
          setStatus(statusKey, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "");
          try {
            const activeSort = next.sort && next.sort.length ? next.sort : config.sort;
            let limit = next.showAll ? Math.max(next.total || PAGE_SIZE, PAGE_SIZE) : PAGE_SIZE;
            const offset = next.showAll ? 0 : next.offset;
            let data = await api(
              config.endpoint,
              {
                method: "POST",
                body: buildUniversalQuery(next.filters, activeSort, limit, offset)
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
                  body: buildUniversalQuery(next.filters, activeSort, limit, 0)
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
                topics: sortByName((next.rows || []).map((row) => ({ code: row.code, name: row.name || row.code })))
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
                const fieldKeys = (next.rows || []).filter((row) => row && row.key).map((row) => ({ key: row.key, label: row.label || row.key })).sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));
                return {
                  ...prev,
                  formFieldTypes: Array.from(set.values()).sort((a, b) => String(a).localeCompare(String(b), "ru")),
                  formFieldKeys: fieldKeys
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
                    is_active: Boolean(row.is_active)
                  });
                });
                return { ...prev, users: Array.from(map.values()) };
              });
            }
            setStatus(statusKey, "\u0421\u043F\u0438\u0441\u043E\u043A \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D", "ok");
            return true;
          } catch (error) {
            setStatus(statusKey, "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
            return false;
          }
        },
        [api, resolveTableConfig, setStatus, setTableState]
      );
      const loadCurrentConfigTable = useCallback(
        async (resetOffset, tokenOverride, keyOverride) => {
          const currentKey = keyOverride || configActiveKey;
          if (!currentKey) {
            setStatus("config", "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A", "");
            return false;
          }
          setStatus("config", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "");
          const ok = await loadTable(currentKey, { resetOffset: Boolean(resetOffset) }, tokenOverride);
          if (ok) {
            setStatus("config", "\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D", "ok");
          } else {
            setStatus("config", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A", "error");
          }
        },
        [configActiveKey, loadTable, setStatus]
      );
      const loadDashboard = useCallback(
        async (tokenOverride) => {
          setStatus("dashboard", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "");
          try {
            const data = await api("/api/admin/metrics/overview", {}, tokenOverride);
            const scope = String(data.scope || role || "");
            const cards = scope === "LAWYER" ? [
              { label: "\u041C\u043E\u0438 \u0437\u0430\u044F\u0432\u043A\u0438", value: data.assigned_total ?? 0 },
              { label: "\u041C\u043E\u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435", value: data.active_assigned_total ?? 0 },
              { label: "\u041D\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0435", value: data.unassigned_total ?? 0 },
              { label: "\u041C\u043E\u0438 \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435", value: data.my_unread_updates ?? 0 },
              { label: "\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043E SLA", value: data.sla_overdue ?? 0 }
            ] : [
              { label: "\u041D\u043E\u0432\u044B\u0435", value: data.new ?? 0 },
              { label: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0435", value: data.assigned_total ?? 0 },
              { label: "\u041D\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0435", value: data.unassigned_total ?? 0 },
              { label: "\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043E SLA", value: data.sla_overdue ?? 0 },
              { label: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E \u044E\u0440\u0438\u0441\u0442\u0430\u043C\u0438", value: data.unread_for_lawyers ?? 0 },
              { label: "\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u0430\u043C\u0438", value: data.unread_for_clients ?? 0 }
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
              myUnreadByEvent: data.my_unread_by_event || {}
            });
            setStatus("dashboard", "\u0414\u0430\u043D\u043D\u044B\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u044B", "ok");
          } catch (error) {
            setStatus("dashboard", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          }
        },
        [api, role, setStatus]
      );
      const loadMeta = useCallback(
        async (tokenOverride) => {
          const entity = (metaEntity || "quotes").trim() || "quotes";
          setStatus("meta", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "");
          try {
            const data = await api("/api/admin/meta/" + encodeURIComponent(entity), {}, tokenOverride);
            setMetaJson(JSON.stringify(localizeMeta(data), null, 2));
            setStatus("meta", "\u041C\u0435\u0442\u0430\u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u044B", "ok");
          } catch (error) {
            setStatus("meta", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          }
        },
        [api, metaEntity, setStatus]
      );
      const refreshSection = useCallback(
        async (section, tokenOverride) => {
          if (!(tokenOverride !== void 0 ? tokenOverride : token)) return;
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
            statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name }))
          }));
          setTableCatalog([]);
          if (roleOverride !== "ADMIN") return;
          try {
            const body = buildUniversalQuery([], [{ field: "sort_order", dir: "asc" }], 500, 0);
            const usersBody = buildUniversalQuery([], [{ field: "created_at", dir: "desc" }], 500, 0);
            const [catalogData, topicsData, statusesData, fieldsData, usersData] = await Promise.all([
              api("/api/admin/crud/meta/tables", {}, tokenOverride),
              api("/api/admin/crud/topics/query", { method: "POST", body }, tokenOverride),
              api("/api/admin/crud/statuses/query", { method: "POST", body }, tokenOverride),
              api("/api/admin/crud/form_fields/query", { method: "POST", body }, tokenOverride),
              api("/api/admin/crud/admin_users/query", { method: "POST", body: usersBody }, tokenOverride)
            ]);
            const catalogRows = (catalogData.tables || []).filter((row) => row && row.table).map((row) => {
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
            const fieldKeys = (fieldsData.rows || []).filter((row) => row && row.key).map((row) => ({ key: row.key, label: row.label || row.key })).sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), "ru"));
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
                is_active: Boolean(row.is_active)
              }))
            }));
          } catch (_) {
          }
        },
        [api]
      );
      const openRequestDetails = useCallback(
        async (requestId) => {
          setRequestModal({ open: true, jsonText: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." });
          try {
            const row = await api("/api/admin/crud/requests/" + requestId);
            setRequestModal({ open: true, jsonText: JSON.stringify(localizeRequestDetails(row), null, 2) });
          } catch (error) {
            setRequestModal({ open: true, jsonText: "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message });
          }
        },
        [api]
      );
      const openCreateRecordModal = useCallback(
        (tableKey) => {
          const fields = getRecordFields(tableKey);
          const initial = {};
          fields.forEach((field) => {
            if (field.defaultValue !== void 0) initial[field.key] = String(field.defaultValue);
            else if (field.type === "boolean") initial[field.key] = "false";
            else if (field.type === "json") initial[field.key] = field.optional ? "" : "{}";
            else if ((field.type === "reference" || field.type === "enum") && !field.optional) {
              const options = typeof field.options === "function" ? field.options() : [];
              initial[field.key] = options.length ? String(options[0].value) : "";
            } else initial[field.key] = "";
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
        setRecordModal((prev) => ({ ...prev, form: { ...prev.form || {}, [field]: value } }));
      }, []);
      const uploadRecordFieldFile = useCallback(
        async (field, file) => {
          if (!recordModal.tableKey || !field || !file) return;
          if (field.uploadScope !== "USER_AVATAR") return;
          if (recordModal.tableKey !== "users") return;
          if (recordModal.mode !== "edit" || !recordModal.rowId) {
            setStatus("recordForm", "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F, \u0437\u0430\u0442\u0435\u043C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0430\u0432\u0430\u0442\u0430\u0440", "error");
            return;
          }
          try {
            setStatus("recordForm", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0444\u0430\u0439\u043B\u0430...", "");
            const mimeType = String(file.type || "application/octet-stream");
            const initPayload = {
              file_name: file.name,
              mime_type: mimeType,
              size_bytes: file.size,
              scope: "USER_AVATAR",
              user_id: recordModal.rowId
            };
            const init = await api("/api/admin/uploads/init", { method: "POST", body: initPayload });
            const putResp = await fetch(init.presigned_url, {
              method: "PUT",
              headers: { "Content-Type": mimeType },
              body: file
            });
            if (!putResp.ok) {
              throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B \u0432 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435");
            }
            const done = await api("/api/admin/uploads/complete", {
              method: "POST",
              body: {
                key: init.key,
                file_name: file.name,
                mime_type: mimeType,
                size_bytes: file.size,
                scope: "USER_AVATAR",
                user_id: recordModal.rowId
              }
            });
            updateRecordField("avatar_url", String(done.avatar_url || ""));
            setStatus("recordForm", "\u0410\u0432\u0430\u0442\u0430\u0440 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D", "ok");
          } catch (error) {
            setStatus("recordForm", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438: " + error.message, "error");
          }
        },
        [api, recordModal, setStatus, updateRecordField]
      );
      const buildRecordPayload = useCallback(
        (tableKey, form, mode) => {
          const fields = getRecordFields(tableKey);
          const payload = {};
          fields.forEach((field) => {
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
              if (Number.isNaN(number)) throw new Error('\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0447\u0438\u0441\u043B\u043E \u0432 \u043F\u043E\u043B\u0435 "' + field.label + '"');
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
                throw new Error('\u041F\u043E\u043B\u0435 "' + field.label + '" \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0432\u0430\u043B\u0438\u0434\u043D\u044B\u043C JSON');
              }
              return;
            }
            const value = String(raw || "").trim();
            if (!value) {
              if (mode === "create" && field.autoCreate) return;
              if (mode === "create" && field.requiredOnCreate) throw new Error('\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043F\u043E\u043B\u0435 "' + field.label + '"');
              if (field.required) throw new Error('\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043F\u043E\u043B\u0435 "' + field.label + '"');
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
        [getRecordFields]
      );
      const submitRecordModal = useCallback(
        async (event) => {
          event.preventDefault();
          const tableKey = recordModal.tableKey;
          if (!tableKey) return;
          const endpoints = resolveMutationConfig(tableKey);
          if (!endpoints) return;
          try {
            setStatus("recordForm", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...", "");
            const payload = buildRecordPayload(tableKey, recordModal.form || {}, recordModal.mode);
            if (recordModal.mode === "edit" && recordModal.rowId) {
              await api(endpoints.update(recordModal.rowId), { method: "PATCH", body: payload });
            } else {
              await api(endpoints.create, { method: "POST", body: payload });
            }
            setStatus("recordForm", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E", "ok");
            await loadTable(tableKey, { resetOffset: true });
            setTimeout(() => closeRecordModal(), 250);
          } catch (error) {
            setStatus("recordForm", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
          }
        },
        [api, buildRecordPayload, closeRecordModal, loadTable, recordModal, resolveMutationConfig, setStatus]
      );
      const deleteRecord = useCallback(
        async (tableKey, id) => {
          const endpoints = resolveMutationConfig(tableKey);
          if (!endpoints) return;
          if (!confirm("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C?")) return;
          try {
            await api(endpoints.delete(id), { method: "DELETE" });
            setStatus(tableKey, "\u0417\u0430\u043F\u0438\u0441\u044C \u0443\u0434\u0430\u043B\u0435\u043D\u0430", "ok");
            await loadTable(tableKey, { resetOffset: true });
          } catch (error) {
            setStatus(tableKey, "\u041E\u0448\u0438\u0431\u043A\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F: " + error.message, "error");
          }
        },
        [api, loadTable, resolveMutationConfig, setStatus]
      );
      const claimRequest = useCallback(
        async (requestId) => {
          if (!requestId) return;
          try {
            setStatus("requests", "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043A\u0438...", "");
            await api("/api/admin/requests/" + requestId + "/claim", { method: "POST" });
            setStatus("requests", "\u0417\u0430\u044F\u0432\u043A\u0430 \u0432\u0437\u044F\u0442\u0430 \u0432 \u0440\u0430\u0431\u043E\u0442\u0443", "ok");
            await loadTable("requests", { resetOffset: true });
          } catch (error) {
            setStatus("requests", "\u041E\u0448\u0438\u0431\u043A\u0430 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F: " + error.message, "error");
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
          }
        },
        [loadTable, openRequestDetails]
      );
      const downloadInvoicePdf = useCallback(
        async (row) => {
          if (!row || !row.id || !token) return;
          try {
            setStatus("invoices", "\u0424\u043E\u0440\u043C\u0438\u0440\u0443\u0435\u043C PDF...", "");
            const response = await fetch("/api/admin/invoices/" + row.id + "/pdf", {
              headers: { Authorization: "Bearer " + token }
            });
            if (!response.ok) {
              const text = await response.text();
              let payload = {};
              try {
                payload = text ? JSON.parse(text) : {};
              } catch (_) {
                payload = { raw: text };
              }
              const message = payload.detail || payload.error || payload.raw || "HTTP " + response.status;
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
            setStatus("invoices", "PDF \u0441\u043A\u0430\u0447\u0430\u043D", "ok");
          } catch (error) {
            setStatus("invoices", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u044F: " + error.message, "error");
          }
        },
        [setStatus, token]
      );
      const openReassignModal = useCallback(
        (row) => {
          const options = getLawyerOptions();
          if (!options.length) {
            setStatus("reassignForm", "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u044E\u0440\u0438\u0441\u0442\u043E\u0432 \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F", "error");
            return;
          }
          const current = String(row?.assigned_lawyer_id || "");
          const hasCurrent = options.some((option) => String(option.value) === current);
          const fallback = options[0] ? String(options[0].value) : "";
          setReassignModal({
            open: true,
            requestId: row?.id || null,
            trackNumber: row?.track_number || "",
            lawyerId: hasCurrent ? current : fallback
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
            setStatus("reassignForm", "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u044E\u0440\u0438\u0441\u0442\u0430", "error");
            return;
          }
          try {
            setStatus("reassignForm", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...", "");
            await api("/api/admin/requests/" + reassignModal.requestId + "/reassign", {
              method: "POST",
              body: { lawyer_id: lawyerId }
            });
            setStatus("requests", "\u0417\u0430\u044F\u0432\u043A\u0430 \u043F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0430", "ok");
            closeReassignModal();
            await loadTable("requests", { resetOffset: true });
          } catch (error) {
            setStatus("reassignForm", "\u041E\u0448\u0438\u0431\u043A\u0430: " + error.message, "error");
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
            setStatus("filter", "\u0414\u043B\u044F \u0442\u0430\u0431\u043B\u0438\u0446\u044B \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u043F\u043E\u043B\u0435\u0439 \u0444\u0438\u043B\u044C\u0442\u0440\u0430\u0446\u0438\u0438", "error");
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
            editIndex: null
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
          const rawValue = fieldDef.type === "boolean" ? target.value ? "true" : "false" : String(target.value ?? "");
          setFilterModal({
            open: true,
            tableKey,
            field: fieldDef.field,
            op: safeOp,
            rawValue,
            editIndex: index
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
            rawValue: defaultFilterValue(fieldDef)
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
            setStatus("filter", "\u041F\u043E\u043B\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u0430 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043E", "error");
            return;
          }
          let value;
          if (fieldDef.type === "boolean") {
            value = filterModal.rawValue === "true";
          } else if (fieldDef.type === "number") {
            if (String(filterModal.rawValue || "").trim() === "") {
              setStatus("filter", "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0447\u0438\u0441\u043B\u043E", "error");
              return;
            }
            value = Number(filterModal.rawValue);
            if (Number.isNaN(value)) {
              setStatus("filter", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0447\u0438\u0441\u043B\u043E", "error");
              return;
            }
          } else {
            value = String(filterModal.rawValue || "").trim();
            if (!value) {
              setStatus("filter", "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u0430", "error");
              return;
            }
          }
          const tableState = tablesRef.current[filterModal.tableKey] || createTableState();
          const nextFilters = [...tableState.filters || []];
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
            showAll: false
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
          showAll: false
        });
        closeFilterModal();
        await loadTable(filterModal.tableKey, { resetOffset: true, filtersOverride: [] });
      }, [closeFilterModal, filterModal.tableKey, loadTable, setTableState]);
      const removeFilterChip = useCallback(
        async (tableKey, index) => {
          const tableState = tablesRef.current[tableKey] || createTableState();
          const nextFilters = [...tableState.filters || []];
          nextFilters.splice(index, 1);
          setTableState(tableKey, {
            ...tableState,
            filters: nextFilters,
            offset: 0,
            showAll: false
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
          const dir = currentSort && currentSort.field === field ? currentSort.dir === "asc" ? "desc" : "asc" : "asc";
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
          loadCurrentConfigTable(false, void 0, tableKey);
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
          userTopics: createTableState()
        });
        setDictionaries({
          topics: [],
          statuses: Object.entries(STATUS_LABELS).map(([code, name]) => ({ code, name })),
          formFieldTypes: [...DEFAULT_FORM_FIELD_TYPES],
          formFieldKeys: [],
          users: []
        });
        setStatusMap({});
        setActiveSection("dashboard");
      }, []);
      const login = useCallback(
        async (emailInput, passwordInput) => {
          try {
            setStatus("login", "\u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u043C \u0432\u0445\u043E\u0434...", "");
            const data = await api(
              "/api/admin/auth/login",
              {
                method: "POST",
                auth: false,
                body: { email: String(emailInput || "").trim(), password: passwordInput || "" }
              },
              ""
            );
            const nextToken = data.access_token;
            const payload = decodeJwtPayload(nextToken || "");
            if (!payload || !payload.role || !payload.email) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0442\u043E\u043A\u0435\u043D\u0430");
            localStorage.setItem(LS_TOKEN, nextToken);
            setToken(nextToken);
            setRole(payload.role);
            setEmail(payload.email);
            await bootstrapReferenceData(nextToken, payload.role);
            setActiveSection("dashboard");
            await loadDashboard(nextToken);
            setStatus("login", "\u0423\u0441\u043F\u0435\u0448\u043D\u044B\u0439 \u0432\u0445\u043E\u0434", "ok");
          } catch (error) {
            setStatus("login", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u0445\u043E\u0434\u0430: " + error.message, "error");
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
          { key: "dashboard", label: "\u041E\u0431\u0437\u043E\u0440" },
          { key: "requests", label: "\u0417\u0430\u044F\u0432\u043A\u0438" },
          { key: "invoices", label: "\u0421\u0447\u0435\u0442\u0430" },
          { key: "meta", label: "\u041C\u0435\u0442\u0430\u0434\u0430\u043D\u043D\u044B\u0435" }
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
        const headers = (activeConfigMeta.columns || []).filter((column) => column && column.name).map((column) => {
          const name = String(column.name);
          return {
            key: name,
            label: String(column.label || humanizeKey(name)),
            sortable: Boolean(column.sortable !== false),
            field: name
          };
        });
        if (canUpdateInConfig || canDeleteInConfig) headers.push({ key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" });
        return headers;
      }, [activeConfigMeta, canDeleteInConfig, canUpdateInConfig]);
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "layout" }, /* @__PURE__ */ React.createElement("aside", { className: "sidebar" }, /* @__PURE__ */ React.createElement("div", { className: "logo" }, /* @__PURE__ */ React.createElement("a", { href: "/" }, "\u041F\u0440\u0430\u0432\u043E\u0432\u043E\u0439 \u0442\u0440\u0435\u043A\u0435\u0440")), /* @__PURE__ */ React.createElement("nav", { className: "menu" }, menuItems.map((item) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: item.key,
          className: activeSection === item.key ? "active" : "",
          "data-section": item.key,
          type: "button",
          onClick: () => activateSection(item.key)
        },
        item.label
      )), role === "ADMIN" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: activeSection === "config" ? "active" : "",
          type: "button",
          onClick: () => {
            setReferencesExpanded((prev) => !prev);
            activateSection("config");
          }
        },
        "\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A\u0438 " + (referencesExpanded ? "\u25BE" : "\u25B8")
      ), referencesExpanded ? /* @__PURE__ */ React.createElement("div", { className: "menu-tree" }, dictionaryTableItems.map((item) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: item.key,
          type: "button",
          className: activeSection === "config" && configActiveKey === item.key ? "active" : "",
          onClick: () => selectConfigNode(item.key)
        },
        getTableLabel(item.key)
      ))) : null) : null), /* @__PURE__ */ React.createElement("div", { className: "auth-box" }, token && role ? /* @__PURE__ */ React.createElement(React.Fragment, null, "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C: ", /* @__PURE__ */ React.createElement("b", null, email), /* @__PURE__ */ React.createElement("br", null), "\u0420\u043E\u043B\u044C: ", /* @__PURE__ */ React.createElement("b", null, roleLabel(role))) : "\u041D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: refreshAll }, "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C"), /* @__PURE__ */ React.createElement("button", { className: "btn danger", type: "button", onClick: logout }, "\u0412\u044B\u0439\u0442\u0438"))), /* @__PURE__ */ React.createElement("main", { className: "main" }, /* @__PURE__ */ React.createElement("div", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "\u041F\u0430\u043D\u0435\u043B\u044C \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "UniversalQuery, RBAC \u0438 \u0430\u0443\u0434\u0438\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u043F\u043E \u043A\u043B\u044E\u0447\u0435\u0432\u044B\u043C \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u044F\u043C \u0441\u0438\u0441\u0442\u0435\u043C\u044B.")), /* @__PURE__ */ React.createElement("span", { className: "badge" }, "\u0440\u043E\u043B\u044C: ", roleLabel(role))), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "dashboard", id: "section-dashboard" }, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u041E\u0431\u0437\u043E\u0440 \u043C\u0435\u0442\u0440\u0438\u043A"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043E\u043A \u0438 SLA-\u043C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433."))), /* @__PURE__ */ React.createElement("div", { className: "cards" }, dashboardData.cards.map((card) => /* @__PURE__ */ React.createElement("div", { className: "card", key: card.label }, /* @__PURE__ */ React.createElement("p", null, card.label), /* @__PURE__ */ React.createElement("b", null, card.value)))), /* @__PURE__ */ React.createElement("div", { className: "json" }, JSON.stringify(dashboardData.byStatus || {}, null, 2)), dashboardData.scope === "LAWYER" ? /* @__PURE__ */ React.createElement("div", { className: "json", style: { marginTop: "0.5rem" } }, JSON.stringify(dashboardData.myUnreadByEvent || {}, null, 2)) : null, /* @__PURE__ */ React.createElement("div", { style: { marginTop: "0.85rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: "0 0 0.55rem" } }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u044E\u0440\u0438\u0441\u0442\u043E\u0432"), /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "name", label: "\u042E\u0440\u0438\u0441\u0442" },
            { key: "email", label: "Email" },
            { key: "primary_topic_code", label: "\u041E\u0441\u043D\u043E\u0432\u043D\u0430\u044F \u0442\u0435\u043C\u0430" },
            { key: "active_load", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0437\u0430\u044F\u0432\u043A\u0438" },
            { key: "total_assigned", label: "\u0412\u0441\u0435\u0433\u043E \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043E" },
            { key: "active_amount", label: "\u0421\u0443\u043C\u043C\u0430 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445" },
            { key: "monthly_paid_gross", label: "\u0412\u0430\u043B \u043E\u043F\u043B\u0430\u0442 \u0437\u0430 \u043C\u0435\u0441\u044F\u0446" },
            { key: "monthly_salary", label: "\u0417\u0430\u0440\u043F\u043B\u0430\u0442\u0430 \u0437\u0430 \u043C\u0435\u0441\u044F\u0446" }
          ],
          rows: dashboardData.lawyerLoads || [],
          emptyColspan: 8,
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.lawyer_id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "user-identity" }, /* @__PURE__ */ React.createElement(UserAvatar, { name: row.name, email: row.email, avatarUrl: row.avatar_url, accessToken: token, size: 32 }), /* @__PURE__ */ React.createElement("div", { className: "user-identity-text" }, /* @__PURE__ */ React.createElement("b", null, row.name || "-")))), /* @__PURE__ */ React.createElement("td", null, row.email || "-"), /* @__PURE__ */ React.createElement("td", null, row.primary_topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, String(row.active_load ?? 0)), /* @__PURE__ */ React.createElement("td", null, String(row.total_assigned ?? 0)), /* @__PURE__ */ React.createElement("td", null, String(row.active_amount ?? 0)), /* @__PURE__ */ React.createElement("td", null, String(row.monthly_paid_gross ?? 0)), /* @__PURE__ */ React.createElement("td", null, String(row.monthly_salary ?? 0)))
        }
      )), /* @__PURE__ */ React.createElement(StatusLine, { status: getStatus("dashboard") })), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "requests", id: "section-requests" }, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0417\u0430\u044F\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0421\u0435\u0440\u0432\u0435\u0440\u043D\u0430\u044F \u0444\u0438\u043B\u044C\u0442\u0440\u0430\u0446\u0438\u044F \u0438 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u043A\u043B\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0445 \u0437\u0430\u044F\u0432\u043E\u043A.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.5rem" } }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: () => loadTable("requests", { resetOffset: true }) }, "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C"), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "button", onClick: () => openCreateRecordModal("requests") }, "\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u044F\u0432\u043A\u0430"))), /* @__PURE__ */ React.createElement(
        FilterToolbar,
        {
          filters: tables.requests.filters,
          onOpen: () => openFilterModal("requests"),
          onRemove: (index) => removeFilterChip("requests", index),
          onEdit: (index) => openFilterEditModal("requests", index),
          getChipLabel: (clause) => {
            const fieldDef = getFieldDef("requests", clause.field);
            return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("requests", clause);
          }
        }
      ), /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "track_number", label: "\u041D\u043E\u043C\u0435\u0440", sortable: true, field: "track_number" },
            { key: "client_name", label: "\u041A\u043B\u0438\u0435\u043D\u0442", sortable: true, field: "client_name" },
            { key: "client_phone", label: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", sortable: true, field: "client_phone" },
            { key: "status_code", label: "\u0421\u0442\u0430\u0442\u0443\u0441", sortable: true, field: "status_code" },
            { key: "topic_code", label: "\u0422\u0435\u043C\u0430", sortable: true, field: "topic_code" },
            { key: "assigned_lawyer_id", label: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D", sortable: true, field: "assigned_lawyer_id" },
            { key: "invoice_amount", label: "\u0421\u0447\u0435\u0442", sortable: true, field: "invoice_amount" },
            { key: "paid_at", label: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E", sortable: true, field: "paid_at" },
            { key: "updates", label: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F" },
            { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u0430", sortable: true, field: "created_at" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.requests.rows,
          emptyColspan: 11,
          onSort: (field) => toggleTableSort("requests", field),
          sortClause: tables.requests.sort && tables.requests.sort[0] || TABLE_SERVER_CONFIG.requests.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.track_number || "-")), /* @__PURE__ */ React.createElement("td", null, row.client_name || "-"), /* @__PURE__ */ React.createElement("td", null, row.client_phone || "-"), /* @__PURE__ */ React.createElement("td", null, statusLabel(row.status_code)), /* @__PURE__ */ React.createElement("td", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, row.assigned_lawyer_id || "-"), /* @__PURE__ */ React.createElement("td", null, row.invoice_amount == null ? "-" : String(row.invoice_amount)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.paid_at)), /* @__PURE__ */ React.createElement("td", null, renderRequestUpdatesCell(row, role)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, role === "LAWYER" && !row.assigned_lawyer_id ? /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F4E5}", tooltip: "\u0412\u0437\u044F\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0442\u0443", onClick: () => claimRequest(row.id) }) : null, role === "ADMIN" && row.assigned_lawyer_id ? /* @__PURE__ */ React.createElement(IconButton, { icon: "\u21C4", tooltip: "\u041F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C", onClick: () => openReassignModal(row) }) : null, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F441}", tooltip: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443", onClick: () => openRequestDetails(row.id) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443", onClick: () => openEditRecordModal("requests", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443", onClick: () => deleteRecord("requests", row.id), tone: "danger" }))))
        }
      ), /* @__PURE__ */ React.createElement(
        TablePager,
        {
          tableState: tables.requests,
          onPrev: () => loadPrevPage("requests"),
          onNext: () => loadNextPage("requests"),
          onLoadAll: () => loadAllRows("requests")
        }
      ), /* @__PURE__ */ React.createElement(StatusLine, { status: getStatus("requests") })), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "invoices", id: "section-invoices" }, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0421\u0447\u0435\u0442\u0430"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0412\u044B\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u0441\u0447\u0435\u0442\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0430\u043C, \u0441\u0442\u0430\u0442\u0443\u0441\u044B \u043E\u043F\u043B\u0430\u0442\u044B \u0438 \u0432\u044B\u0433\u0440\u0443\u0437\u043A\u0430 PDF.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.5rem" } }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: () => loadTable("invoices", { resetOffset: true }) }, "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C"), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "button", onClick: () => openCreateRecordModal("invoices") }, "\u041D\u043E\u0432\u044B\u0439 \u0441\u0447\u0435\u0442"))), /* @__PURE__ */ React.createElement(
        FilterToolbar,
        {
          filters: tables.invoices.filters,
          onOpen: () => openFilterModal("invoices"),
          onRemove: (index) => removeFilterChip("invoices", index),
          onEdit: (index) => openFilterEditModal("invoices", index),
          getChipLabel: (clause) => {
            const fieldDef = getFieldDef("invoices", clause.field);
            return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("invoices", clause);
          }
        }
      ), /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "invoice_number", label: "\u041D\u043E\u043C\u0435\u0440", sortable: true, field: "invoice_number" },
            { key: "status", label: "\u0421\u0442\u0430\u0442\u0443\u0441", sortable: true, field: "status" },
            { key: "amount", label: "\u0421\u0443\u043C\u043C\u0430", sortable: true, field: "amount" },
            { key: "payer_display_name", label: "\u041F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A", sortable: true, field: "payer_display_name" },
            { key: "request_track_number", label: "\u0417\u0430\u044F\u0432\u043A\u0430" },
            { key: "issued_by_name", label: "\u0412\u044B\u0441\u0442\u0430\u0432\u0438\u043B", sortable: true, field: "issued_by_admin_user_id" },
            { key: "issued_at", label: "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D", sortable: true, field: "issued_at" },
            { key: "paid_at", label: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D", sortable: true, field: "paid_at" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.invoices.rows,
          emptyColspan: 9,
          onSort: (field) => toggleTableSort("invoices", field),
          sortClause: tables.invoices.sort && tables.invoices.sort[0] || TABLE_SERVER_CONFIG.invoices.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.invoice_number || "-")), /* @__PURE__ */ React.createElement("td", null, row.status_label || invoiceStatusLabel(row.status)), /* @__PURE__ */ React.createElement("td", null, row.amount == null ? "-" : String(row.amount) + " " + String(row.currency || "RUB")), /* @__PURE__ */ React.createElement("td", null, row.payer_display_name || "-"), /* @__PURE__ */ React.createElement("td", null, row.request_track_number || row.request_id || "-"), /* @__PURE__ */ React.createElement("td", null, row.issued_by_name || "-"), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.issued_at)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.paid_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F441}", tooltip: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443", onClick: () => openInvoiceRequest(row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u2B07", tooltip: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C PDF", onClick: () => downloadInvoicePdf(row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0447\u0435\u0442", onClick: () => openEditRecordModal("invoices", row) }), role === "ADMIN" ? /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0447\u0435\u0442", onClick: () => deleteRecord("invoices", row.id), tone: "danger" }) : null)))
        }
      ), /* @__PURE__ */ React.createElement(
        TablePager,
        {
          tableState: tables.invoices,
          onPrev: () => loadPrevPage("invoices"),
          onNext: () => loadNextPage("invoices"),
          onLoadAll: () => loadAllRows("invoices")
        }
      ), /* @__PURE__ */ React.createElement(StatusLine, { status: getStatus("invoices") })), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "quotes", id: "section-quotes" }, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0426\u0438\u0442\u0430\u0442\u044B"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u043B\u0435\u043D\u0442\u043E\u0439 \u0446\u0438\u0442\u0430\u0442 \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u044B\u043C\u0438 \u0444\u0438\u043B\u044C\u0442\u0440\u0430\u043C\u0438.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "0.5rem" } }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: () => loadTable("quotes", { resetOffset: true }) }, "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C"), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "button", onClick: () => openCreateRecordModal("quotes") }, "\u041D\u043E\u0432\u0430\u044F \u0446\u0438\u0442\u0430\u0442\u0430"))), /* @__PURE__ */ React.createElement(
        FilterToolbar,
        {
          filters: tables.quotes.filters,
          onOpen: () => openFilterModal("quotes"),
          onRemove: (index) => removeFilterChip("quotes", index),
          onEdit: (index) => openFilterEditModal("quotes", index),
          getChipLabel: (clause) => {
            const fieldDef = getFieldDef("quotes", clause.field);
            return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview("quotes", clause);
          }
        }
      ), /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "author", label: "\u0410\u0432\u0442\u043E\u0440", sortable: true, field: "author" },
            { key: "text", label: "\u0422\u0435\u043A\u0441\u0442", sortable: true, field: "text" },
            { key: "source", label: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A", sortable: true, field: "source" },
            { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", sortable: true, field: "is_active" },
            { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
            { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u0430", sortable: true, field: "created_at" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.quotes.rows,
          emptyColspan: 7,
          onSort: (field) => toggleTableSort("quotes", field),
          sortClause: tables.quotes.sort && tables.quotes.sort[0] || TABLE_SERVER_CONFIG.quotes.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.author || "-"), /* @__PURE__ */ React.createElement("td", null, row.text || "-"), /* @__PURE__ */ React.createElement("td", null, row.source || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.is_active)), /* @__PURE__ */ React.createElement("td", null, String(row.sort_order ?? 0)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0446\u0438\u0442\u0430\u0442\u0443", onClick: () => openEditRecordModal("quotes", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0446\u0438\u0442\u0430\u0442\u0443", onClick: () => deleteRecord("quotes", row.id), tone: "danger" }))))
        }
      ), /* @__PURE__ */ React.createElement(
        TablePager,
        {
          tableState: tables.quotes,
          onPrev: () => loadPrevPage("quotes"),
          onNext: () => loadNextPage("quotes"),
          onLoadAll: () => loadAllRows("quotes")
        }
      ), /* @__PURE__ */ React.createElement(StatusLine, { status: getStatus("quotes") })), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "config", id: "section-config" }, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A \u0432 \u0434\u0435\u0440\u0435\u0432\u0435 \u0441\u043B\u0435\u0432\u0430.")), /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: () => loadCurrentConfigTable(true) }, "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C")), /* @__PURE__ */ React.createElement("div", { className: "config-layout" }, /* @__PURE__ */ React.createElement("div", { className: "config-panel" }, /* @__PURE__ */ React.createElement("div", { className: "block" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0 } }, configActiveKey ? getTableLabel(configActiveKey) : "\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D"), canCreateInConfig && configActiveKey ? /* @__PURE__ */ React.createElement("button", { className: "btn", type: "button", onClick: () => openCreateRecordModal(configActiveKey) }, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C") : null), /* @__PURE__ */ React.createElement(
        FilterToolbar,
        {
          filters: activeConfigTableState.filters,
          onOpen: () => openFilterModal(configActiveKey),
          onRemove: (index) => removeFilterChip(configActiveKey, index),
          onEdit: (index) => openFilterEditModal(configActiveKey, index),
          getChipLabel: (clause) => {
            const fieldDef = getFieldDef(configActiveKey, clause.field);
            return (fieldDef ? fieldDef.label : clause.field) + " " + OPERATOR_LABELS[clause.op] + " " + getFilterValuePreview(configActiveKey, clause);
          }
        }
      ), configActiveKey === "topics" ? /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "code", label: "\u041A\u043E\u0434", sortable: true, field: "code" },
            { key: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", sortable: true, field: "name" },
            { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", sortable: true, field: "enabled" },
            { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.topics.rows,
          emptyColspan: 5,
          onSort: (field) => toggleTableSort("topics", field),
          sortClause: tables.topics.sort && tables.topics.sort[0] || TABLE_SERVER_CONFIG.topics.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.code || "-")), /* @__PURE__ */ React.createElement("td", null, row.name || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String(row.sort_order ?? 0)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u043C\u0443", onClick: () => openEditRecordModal("topics", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0442\u0435\u043C\u0443", onClick: () => deleteRecord("topics", row.id), tone: "danger" }))))
        }
      ) : null, configActiveKey === "quotes" ? /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "author", label: "\u0410\u0432\u0442\u043E\u0440", sortable: true, field: "author" },
            { key: "text", label: "\u0422\u0435\u043A\u0441\u0442", sortable: true, field: "text" },
            { key: "source", label: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A", sortable: true, field: "source" },
            { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430", sortable: true, field: "is_active" },
            { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
            { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u0430", sortable: true, field: "created_at" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.quotes.rows,
          emptyColspan: 7,
          onSort: (field) => toggleTableSort("quotes", field),
          sortClause: tables.quotes.sort && tables.quotes.sort[0] || TABLE_SERVER_CONFIG.quotes.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.author || "-"), /* @__PURE__ */ React.createElement("td", null, row.text || "-"), /* @__PURE__ */ React.createElement("td", null, row.source || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.is_active)), /* @__PURE__ */ React.createElement("td", null, String(row.sort_order ?? 0)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0446\u0438\u0442\u0430\u0442\u0443", onClick: () => openEditRecordModal("quotes", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0446\u0438\u0442\u0430\u0442\u0443", onClick: () => deleteRecord("quotes", row.id), tone: "danger" }))))
        }
      ) : null, configActiveKey === "statuses" ? /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "code", label: "\u041A\u043E\u0434", sortable: true, field: "code" },
            { key: "name", label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", sortable: true, field: "name" },
            { key: "kind", label: "\u0422\u0438\u043F", sortable: true, field: "kind" },
            { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", sortable: true, field: "enabled" },
            { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
            { key: "is_terminal", label: "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439", sortable: true, field: "is_terminal" },
            { key: "invoice_template", label: "\u0428\u0430\u0431\u043B\u043E\u043D \u0441\u0447\u0435\u0442\u0430" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.statuses.rows,
          emptyColspan: 8,
          onSort: (field) => toggleTableSort("statuses", field),
          sortClause: tables.statuses.sort && tables.statuses.sort[0] || TABLE_SERVER_CONFIG.statuses.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.code || "-")), /* @__PURE__ */ React.createElement("td", null, row.name || "-"), /* @__PURE__ */ React.createElement("td", null, statusKindLabel(row.kind)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String(row.sort_order ?? 0)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.is_terminal)), /* @__PURE__ */ React.createElement("td", null, row.invoice_template || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441", onClick: () => openEditRecordModal("statuses", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441", onClick: () => deleteRecord("statuses", row.id), tone: "danger" }))))
        }
      ) : null, configActiveKey === "formFields" ? /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "key", label: "\u041A\u043B\u044E\u0447", sortable: true, field: "key" },
            { key: "label", label: "\u041C\u0435\u0442\u043A\u0430", sortable: true, field: "label" },
            { key: "type", label: "\u0422\u0438\u043F", sortable: true, field: "type" },
            { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", sortable: true, field: "required" },
            { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", sortable: true, field: "enabled" },
            { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.formFields.rows,
          emptyColspan: 7,
          onSort: (field) => toggleTableSort("formFields", field),
          sortClause: tables.formFields.sort && tables.formFields.sort[0] || TABLE_SERVER_CONFIG.formFields.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.key || "-")), /* @__PURE__ */ React.createElement("td", null, row.label || "-"), /* @__PURE__ */ React.createElement("td", null, row.type || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.required)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String(row.sort_order ?? 0)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u043B\u0435 \u0444\u043E\u0440\u043C\u044B", onClick: () => openEditRecordModal("formFields", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u043B\u0435 \u0444\u043E\u0440\u043C\u044B", onClick: () => deleteRecord("formFields", row.id), tone: "danger" }))))
        }
      ) : null, configActiveKey === "topicRequiredFields" ? /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "topic_code", label: "\u0422\u0435\u043C\u0430", sortable: true, field: "topic_code" },
            { key: "field_key", label: "\u041F\u043E\u043B\u0435 \u0444\u043E\u0440\u043C\u044B", sortable: true, field: "field_key" },
            { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", sortable: true, field: "required" },
            { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", sortable: true, field: "enabled" },
            { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
            { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u043E", sortable: true, field: "created_at" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.topicRequiredFields.rows,
          emptyColspan: 7,
          onSort: (field) => toggleTableSort("topicRequiredFields", field),
          sortClause: tables.topicRequiredFields.sort && tables.topicRequiredFields.sort[0] || TABLE_SERVER_CONFIG.topicRequiredFields.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.field_key || "-")), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.required)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String(row.sort_order ?? 0)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(
            IconButton,
            {
              icon: "\u270E",
              tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u043B\u0435",
              onClick: () => openEditRecordModal("topicRequiredFields", row)
            }
          ), /* @__PURE__ */ React.createElement(
            IconButton,
            {
              icon: "\u{1F5D1}",
              tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u043B\u0435",
              onClick: () => deleteRecord("topicRequiredFields", row.id),
              tone: "danger"
            }
          ))))
        }
      ) : null, configActiveKey === "topicDataTemplates" ? /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "topic_code", label: "\u0422\u0435\u043C\u0430", sortable: true, field: "topic_code" },
            { key: "key", label: "\u041A\u043B\u044E\u0447", sortable: true, field: "key" },
            { key: "label", label: "\u041C\u0435\u0442\u043A\u0430", sortable: true, field: "label" },
            { key: "description", label: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", sortable: true, field: "description" },
            { key: "required", label: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435", sortable: true, field: "required" },
            { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E", sortable: true, field: "enabled" },
            { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
            { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u043E", sortable: true, field: "created_at" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.topicDataTemplates.rows,
          emptyColspan: 9,
          onSort: (field) => toggleTableSort("topicDataTemplates", field),
          sortClause: tables.topicDataTemplates.sort && tables.topicDataTemplates.sort[0] || TABLE_SERVER_CONFIG.topicDataTemplates.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("code", null, row.key || "-")), /* @__PURE__ */ React.createElement("td", null, row.label || "-"), /* @__PURE__ */ React.createElement("td", null, row.description || "-"), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.required)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String(row.sort_order ?? 0)), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D", onClick: () => openEditRecordModal("topicDataTemplates", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D", onClick: () => deleteRecord("topicDataTemplates", row.id), tone: "danger" }))))
        }
      ) : null, configActiveKey === "statusTransitions" ? /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "topic_code", label: "\u0422\u0435\u043C\u0430", sortable: true, field: "topic_code" },
            { key: "from_status", label: "\u0418\u0437 \u0441\u0442\u0430\u0442\u0443\u0441\u0430", sortable: true, field: "from_status" },
            { key: "to_status", label: "\u0412 \u0441\u0442\u0430\u0442\u0443\u0441", sortable: true, field: "to_status" },
            { key: "sla_hours", label: "SLA (\u0447\u0430\u0441\u044B)", sortable: true, field: "sla_hours" },
            { key: "enabled", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", sortable: true, field: "enabled" },
            { key: "sort_order", label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A", sortable: true, field: "sort_order" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.statusTransitions.rows,
          emptyColspan: 7,
          onSort: (field) => toggleTableSort("statusTransitions", field),
          sortClause: tables.statusTransitions.sort && tables.statusTransitions.sort[0] || TABLE_SERVER_CONFIG.statusTransitions.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, statusLabel(row.from_status)), /* @__PURE__ */ React.createElement("td", null, statusLabel(row.to_status)), /* @__PURE__ */ React.createElement("td", null, row.sla_hours == null ? "-" : String(row.sla_hours)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.enabled)), /* @__PURE__ */ React.createElement("td", null, String(row.sort_order ?? 0)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(
            IconButton,
            {
              icon: "\u270E",
              tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0435\u0440\u0435\u0445\u043E\u0434",
              onClick: () => openEditRecordModal("statusTransitions", row)
            }
          ), /* @__PURE__ */ React.createElement(
            IconButton,
            {
              icon: "\u{1F5D1}",
              tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u0445\u043E\u0434",
              onClick: () => deleteRecord("statusTransitions", row.id),
              tone: "danger"
            }
          ))))
        }
      ) : null, configActiveKey === "users" ? /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "name", label: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C", sortable: true, field: "name" },
            { key: "email", label: "Email", sortable: true, field: "email" },
            { key: "role", label: "\u0420\u043E\u043B\u044C", sortable: true, field: "role" },
            { key: "primary_topic_code", label: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C (\u0442\u0435\u043C\u0430)", sortable: true, field: "primary_topic_code" },
            { key: "default_rate", label: "\u0421\u0442\u0430\u0432\u043A\u0430", sortable: true, field: "default_rate" },
            { key: "salary_percent", label: "\u041F\u0440\u043E\u0446\u0435\u043D\u0442", sortable: true, field: "salary_percent" },
            { key: "is_active", label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", sortable: true, field: "is_active" },
            { key: "responsible", label: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439", sortable: true, field: "responsible" },
            { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D", sortable: true, field: "created_at" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.users.rows,
          emptyColspan: 10,
          onSort: (field) => toggleTableSort("users", field),
          sortClause: tables.users.sort && tables.users.sort[0] || TABLE_SERVER_CONFIG.users.sort[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "user-identity" }, /* @__PURE__ */ React.createElement(UserAvatar, { name: row.name, email: row.email, avatarUrl: row.avatar_url, accessToken: token, size: 32 }), /* @__PURE__ */ React.createElement("div", { className: "user-identity-text" }, /* @__PURE__ */ React.createElement("b", null, row.name || "-")))), /* @__PURE__ */ React.createElement("td", null, row.email || "-"), /* @__PURE__ */ React.createElement("td", null, roleLabel(row.role)), /* @__PURE__ */ React.createElement("td", null, row.primary_topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, row.default_rate == null ? "-" : String(row.default_rate)), /* @__PURE__ */ React.createElement("td", null, row.salary_percent == null ? "-" : String(row.salary_percent)), /* @__PURE__ */ React.createElement("td", null, boolLabel(row.is_active)), /* @__PURE__ */ React.createElement("td", null, row.responsible || "-"), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", onClick: () => openEditRecordModal("users", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", onClick: () => deleteRecord("users", row.id), tone: "danger" }))))
        }
      ) : null, configActiveKey === "userTopics" ? /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: [
            { key: "admin_user_id", label: "\u042E\u0440\u0438\u0441\u0442", sortable: true, field: "admin_user_id" },
            { key: "topic_code", label: "\u0414\u043E\u043F. \u0442\u0435\u043C\u0430", sortable: true, field: "topic_code" },
            { key: "responsible", label: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439", sortable: true, field: "responsible" },
            { key: "created_at", label: "\u0421\u043E\u0437\u0434\u0430\u043D\u043E", sortable: true, field: "created_at" },
            { key: "actions", label: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }
          ],
          rows: tables.userTopics.rows,
          emptyColspan: 5,
          onSort: (field) => toggleTableSort("userTopics", field),
          sortClause: tables.userTopics.sort && tables.userTopics.sort[0] || TABLE_SERVER_CONFIG.userTopics.sort[0],
          renderRow: (row) => {
            const lawyer = (dictionaries.users || []).find((item) => String(item.id) === String(row.admin_user_id));
            const lawyerLabel = lawyer ? lawyer.name || lawyer.email || row.admin_user_id : row.admin_user_id || "-";
            return /* @__PURE__ */ React.createElement("tr", { key: row.id }, /* @__PURE__ */ React.createElement("td", null, lawyerLabel), /* @__PURE__ */ React.createElement("td", null, row.topic_code || "-"), /* @__PURE__ */ React.createElement("td", null, row.responsible || "-"), /* @__PURE__ */ React.createElement("td", null, fmtDate(row.created_at)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0432\u044F\u0437\u044C", onClick: () => openEditRecordModal("userTopics", row) }), /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0432\u044F\u0437\u044C", onClick: () => deleteRecord("userTopics", row.id), tone: "danger" }))));
          }
        }
      ) : null, configActiveKey && !KNOWN_CONFIG_TABLE_KEYS.has(configActiveKey) ? /* @__PURE__ */ React.createElement(
        DataTable,
        {
          headers: genericConfigHeaders,
          rows: activeConfigTableState.rows,
          emptyColspan: Math.max(1, genericConfigHeaders.length),
          onSort: (field) => toggleTableSort(configActiveKey, field),
          sortClause: activeConfigTableState.sort && activeConfigTableState.sort[0] || (resolveTableConfig(configActiveKey)?.sort || [])[0],
          renderRow: (row) => /* @__PURE__ */ React.createElement("tr", { key: row.id || JSON.stringify(row) }, (activeConfigMeta?.columns || []).map((column) => {
            const key = String(column.name || "");
            const value = row[key];
            if (column.kind === "boolean") return /* @__PURE__ */ React.createElement("td", { key }, boolLabel(Boolean(value)));
            if (column.kind === "date" || column.kind === "datetime") return /* @__PURE__ */ React.createElement("td", { key }, fmtDate(value));
            if (column.kind === "json") return /* @__PURE__ */ React.createElement("td", { key }, value == null ? "-" : JSON.stringify(value));
            return /* @__PURE__ */ React.createElement("td", { key }, value == null || value === "" ? "-" : String(value));
          }), canUpdateInConfig || canDeleteInConfig ? /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "table-actions" }, canUpdateInConfig ? /* @__PURE__ */ React.createElement(IconButton, { icon: "\u270E", tooltip: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C", onClick: () => openEditRecordModal(configActiveKey, row) }) : null, canDeleteInConfig ? /* @__PURE__ */ React.createElement(IconButton, { icon: "\u{1F5D1}", tooltip: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C", onClick: () => deleteRecord(configActiveKey, row.id), tone: "danger" }) : null)) : null)
        }
      ) : null, /* @__PURE__ */ React.createElement(
        TablePager,
        {
          tableState: activeConfigTableState,
          onPrev: () => loadPrevPage(configActiveKey),
          onNext: () => loadNextPage(configActiveKey),
          onLoadAll: () => loadAllRows(configActiveKey)
        }
      ), /* @__PURE__ */ React.createElement(StatusLine, { status: getStatus(configActiveKey) })))), /* @__PURE__ */ React.createElement(StatusLine, { status: getStatus("config") })), /* @__PURE__ */ React.createElement(Section, { active: activeSection === "meta", id: "section-meta" }, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u0421\u0445\u0435\u043C\u0430 \u043C\u0435\u0442\u0430\u0434\u0430\u043D\u043D\u044B\u0445"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u041F\u043E\u043B\u044F \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439 \u0434\u043B\u044F meta-driven \u0444\u043E\u0440\u043C."))), /* @__PURE__ */ React.createElement("div", { className: "filters", style: { gridTemplateColumns: "1fr auto" } }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "meta-entity" }, "\u0421\u0443\u0449\u043D\u043E\u0441\u0442\u044C"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "meta-entity",
          value: metaEntity,
          placeholder: "quotes",
          onChange: (event) => setMetaEntity(event.target.value)
        }
      )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "end" } }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary", type: "button", onClick: () => loadMeta() }, "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C"))), /* @__PURE__ */ React.createElement("div", { className: "json" }, metaJson), /* @__PURE__ */ React.createElement(StatusLine, { status: getStatus("meta") })))), /* @__PURE__ */ React.createElement(RequestModal, { open: requestModal.open, jsonText: requestModal.jsonText, onClose: () => setRequestModal((prev) => ({ ...prev, open: false })) }), /* @__PURE__ */ React.createElement(
        RecordModal,
        {
          open: recordModal.open,
          title: (recordModal.mode === "edit" ? "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u2022 " : "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u2022 ") + getTableLabel(recordModal.tableKey),
          fields: recordModalFields,
          form: recordModal.form || {},
          status: getStatus("recordForm"),
          onClose: closeRecordModal,
          onChange: updateRecordField,
          onUploadField: uploadRecordFieldFile,
          onSubmit: submitRecordModal
        }
      ), /* @__PURE__ */ React.createElement(
        FilterModal,
        {
          open: filterModal.open,
          tableLabel: filterTableLabel,
          fields: activeFilterFields,
          draft: filterModal,
          status: getStatus("filter"),
          onClose: closeFilterModal,
          onFieldChange: updateFilterField,
          onOpChange: updateFilterOp,
          onValueChange: updateFilterValue,
          onSubmit: applyFilterModal,
          onClear: clearFiltersFromModal,
          getOperators: getOperatorsForType,
          getFieldOptions
        }
      ), /* @__PURE__ */ React.createElement(
        ReassignModal,
        {
          open: reassignModal.open,
          status: getStatus("reassignForm"),
          options: getLawyerOptions(),
          value: reassignModal.lawyerId,
          onChange: updateReassignLawyer,
          onClose: closeReassignModal,
          onSubmit: submitReassignModal,
          trackNumber: reassignModal.trackNumber
        }
      ), !token || !role ? /* @__PURE__ */ React.createElement(LoginScreen, { onSubmit: login, status: getStatus("login") }) : null);
    }
    const root = ReactDOM.createRoot(document.getElementById("admin-root"));
    root.render(/* @__PURE__ */ React.createElement(App, null));
  })();
})();
