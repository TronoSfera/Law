(() => {
  // app/web/admin/shared/constants.js
  var STATUS_LABELS = {
    NEW: "\u041D\u043E\u0432\u0430\u044F",
    IN_PROGRESS: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
    WAITING_CLIENT: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u0430",
    WAITING_COURT: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0441\u0443\u0434\u0430",
    RESOLVED: "\u0420\u0435\u0448\u0435\u043D\u0430",
    CLOSED: "\u0417\u0430\u043A\u0440\u044B\u0442\u0430",
    REJECTED: "\u041E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430"
  };
  var INVOICE_STATUS_LABELS = {
    WAITING_PAYMENT: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u043F\u043B\u0430\u0442\u0443",
    PAID: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D",
    CANCELED: "\u041E\u0442\u043C\u0435\u043D\u0435\u043D"
  };
  var TABLE_SERVER_CONFIG = {
    requests: {
      table: "requests",
      // Requests use a specialized endpoint because it supports virtual/server-side filters
      // (e.g. deadline alerts and unread notifications) that are not plain table columns.
      endpoint: "/api/admin/requests/query",
      sort: [{ field: "created_at", dir: "desc" }]
    },
    serviceRequests: {
      table: "request_service_requests",
      endpoint: "/api/admin/crud/request_service_requests/query",
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
  var TABLE_MUTATION_CONFIG = Object.fromEntries(
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
  var TABLE_KEY_ALIASES = {
    request_service_requests: "serviceRequests",
    form_fields: "formFields",
    status_groups: "statusGroups",
    topic_required_fields: "topicRequiredFields",
    topic_data_templates: "topicDataTemplates",
    topic_status_transitions: "statusTransitions",
    admin_users: "users",
    admin_user_topics: "userTopics"
  };
  var TABLE_UNALIASES = Object.fromEntries(Object.entries(TABLE_KEY_ALIASES).map(([table, alias]) => [alias, table]));

  // app/web/admin/shared/utils.js
  function humanizeKey(value) {
    const text = String(value || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return "-";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function statusLabel(code) {
    return STATUS_LABELS[code] || code || "-";
  }
  function invoiceStatusLabel(code) {
    return INVOICE_STATUS_LABELS[code] || code || "-";
  }
  function fmtDate(value) {
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
  function fmtDateOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  }
  function fmtTimeOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  function fmtShortDateTime(value) {
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
  function fmtAmount(value) {
    if (value == null || value === "") return "-";
    const number = Number(value);
    if (Number.isNaN(number)) return String(value);
    return number.toLocaleString("ru-RU");
  }
  function fmtBytes(value) {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return "0 \u0411";
    const units = ["\u0411", "\u041A\u0411", "\u041C\u0411", "\u0413\u0411"];
    let normalized = size;
    let index = 0;
    while (normalized >= 1024 && index < units.length - 1) {
      normalized /= 1024;
      index += 1;
    }
    return normalized.toLocaleString("ru-RU", { maximumFractionDigits: index === 0 ? 0 : 1 }) + " " + units[index];
  }
  function detectAttachmentPreviewKind(fileName, mimeType) {
    const name = String(fileName || "").toLowerCase();
    const mime = String(mimeType || "").toLowerCase();
    if (/\.(txt|md|csv|json|log|xml|ya?ml|ini|cfg)$/i.test(name)) return "text";
    if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml" || mime === "text/xml") {
      return "text";
    }
    if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return "image";
    if (mime.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/.test(name)) return "video";
    if (mime === "application/pdf" || /\.pdf$/.test(name)) return "pdf";
    return "none";
  }

  // app/web/admin/features/requests/RequestWorkspace.jsx
  function RequestWorkspace({
    viewerRole,
    viewerUserId,
    loading,
    trackNumber,
    requestData,
    financeSummary,
    invoices,
    statusRouteNodes,
    statusHistory,
    availableStatuses,
    currentImportantDateAt,
    pendingStatusChangePreset,
    messages,
    attachments,
    messageDraft,
    selectedFiles,
    fileUploading,
    status,
    onMessageChange,
    onSendMessage,
    onFilesSelect,
    onRemoveSelectedFile,
    onClearSelectedFiles,
    onLoadRequestDataTemplates,
    onLoadRequestDataBatch,
    onLoadRequestDataTemplateDetails,
    onSaveRequestDataTemplate,
    onSaveRequestDataBatch,
    onIssueInvoice,
    onDownloadInvoicePdf,
    onSaveRequestDataValues,
    onUploadRequestAttachment,
    onChangeStatus,
    onConsumePendingStatusChangePreset,
    onLiveProbe,
    onTypingSignal,
    domIds,
    AttachmentPreviewModalComponent,
    StatusLineComponent
  }) {
    var _a, _b, _c;
    const { useEffect, useMemo, useRef, useState } = React;
    const [preview, setPreview] = useState({ open: false, url: "", fileName: "", mimeType: "" });
    const [chatTab, setChatTab] = useState("chat");
    const [dropActive, setDropActive] = useState(false);
    const [financeOpen, setFinanceOpen] = useState(false);
    const [financeIssueForm, setFinanceIssueForm] = useState({
      open: false,
      saving: false,
      amount: "",
      serviceDescription: "",
      payerDisplayName: "",
      error: ""
    });
    const [requestDataListOpen, setRequestDataListOpen] = useState(false);
    const [descriptionOpen, setDescriptionOpen] = useState(false);
    const [requestTemplateSuggestOpen, setRequestTemplateSuggestOpen] = useState(false);
    const [catalogFieldSuggestOpen, setCatalogFieldSuggestOpen] = useState(false);
    const [statusChangeModal, setStatusChangeModal] = useState({
      open: false,
      saving: false,
      statusCode: "",
      allowedStatusCodes: null,
      importantDateAt: "",
      comment: "",
      files: [],
      error: ""
    });
    const [draggedRequestRowId, setDraggedRequestRowId] = useState("");
    const [dragOverRequestRowId, setDragOverRequestRowId] = useState("");
    const [dataRequestModal, setDataRequestModal] = useState({
      open: false,
      loading: false,
      saving: false,
      savingTemplate: false,
      messageId: "",
      documentName: "",
      availableDocuments: [],
      templateList: [],
      requestTemplateQuery: "",
      templateName: "",
      selectedRequestTemplateId: "",
      templates: [],
      catalogFieldQuery: "",
      selectedCatalogTemplateId: "",
      rows: [],
      customLabel: "",
      customType: "string",
      templateStatus: "",
      error: ""
    });
    const [clientDataModal, setClientDataModal] = useState({
      open: false,
      loading: false,
      saving: false,
      messageId: "",
      items: [],
      status: "",
      error: ""
    });
    const [composerFocused, setComposerFocused] = useState(false);
    const [typingPeers, setTypingPeers] = useState([]);
    const [liveMode, setLiveMode] = useState("online");
    const fileInputRef = useRef(null);
    const statusChangeFileInputRef = useRef(null);
    const chatListRef = useRef(null);
    const liveCursorRef = useRef("");
    const liveTimerRef = useRef(null);
    const liveInFlightRef = useRef(false);
    const liveFailCountRef = useRef(0);
    const typingHeartbeatRef = useRef(null);
    const typingActiveRef = useRef(false);
    const lastAutoScrollCursorRef = useRef("");
    const idMap = useMemo(
      () => ({
        messagesList: "request-modal-messages",
        filesList: "request-modal-files",
        messageBody: "request-modal-message-body",
        sendButton: "request-modal-message-send",
        fileInput: "request-modal-file-input",
        fileUploadButton: "",
        dataRequestOverlay: "data-request-overlay",
        dataRequestItems: "data-request-items",
        dataRequestStatus: "data-request-status",
        dataRequestSave: "data-request-save",
        ...domIds || {}
      }),
      [domIds]
    );
    const requestDataTypeOptions = useMemo(
      () => [
        { value: "string", label: "\u0421\u0442\u0440\u043E\u043A\u0430" },
        { value: "date", label: "\u0414\u0430\u0442\u0430" },
        { value: "number", label: "\u0427\u0438\u0441\u043B\u043E" },
        { value: "file", label: "\u0424\u0430\u0439\u043B" },
        { value: "text", label: "\u0422\u0435\u043A\u0441\u0442" }
      ],
      []
    );
    const openPreview = (item) => {
      if (!(item == null ? void 0 : item.download_url)) return;
      setPreview({
        open: true,
        url: String(item.download_url),
        fileName: String(item.file_name || ""),
        mimeType: String(item.mime_type || "")
      });
    };
    const closePreview = () => setPreview({ open: false, url: "", fileName: "", mimeType: "" });
    const pendingFiles = Array.isArray(selectedFiles) ? selectedFiles : [];
    const hasPendingFiles = pendingFiles.length > 0;
    const canSubmit = Boolean(String(messageDraft || "").trim() || hasPendingFiles);
    const onInputFiles = (event) => {
      const files = Array.from(event.target && event.target.files || []);
      if (files.length && typeof onFilesSelect === "function") onFilesSelect(files);
      event.target.value = "";
    };
    const onDropFiles = (event) => {
      event.preventDefault();
      setDropActive(false);
      const files = Array.from(event.dataTransfer && event.dataTransfer.files || []);
      if (files.length && typeof onFilesSelect === "function") onFilesSelect(files);
    };
    const row = requestData && typeof requestData === "object" ? requestData : null;
    const finance = financeSummary && typeof financeSummary === "object" ? financeSummary : null;
    const viewerRoleCode = String(viewerRole || "").toUpperCase();
    const canRequestData = viewerRoleCode === "LAWYER" || viewerRoleCode === "ADMIN";
    const canFillRequestData = viewerRoleCode === "CLIENT";
    const canSeeRate = viewerRoleCode !== "CLIENT";
    const canSeeCreatedUpdatedInCard = viewerRoleCode !== "CLIENT";
    const showTopicStatusInCard = viewerRoleCode !== "CLIENT";
    const showContactsInCard = viewerRoleCode !== "CLIENT";
    const safeMessages = Array.isArray(messages) ? messages : [];
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    const safeInvoices = Array.isArray(invoices) ? invoices : [];
    const safeStatusHistory = Array.isArray(statusHistory) ? statusHistory : [];
    const safeAvailableStatuses = Array.isArray(availableStatuses) ? availableStatuses : [];
    const totalFilesBytes = safeAttachments.reduce((acc, item) => acc + Number((item == null ? void 0 : item.size_bytes) || 0), 0);
    const clientLabel = (row == null ? void 0 : row.client_name) || "-";
    const clientPhone = String((row == null ? void 0 : row.client_phone) || "").trim();
    const lawyerLabel = (row == null ? void 0 : row.assigned_lawyer_name) || (row == null ? void 0 : row.assigned_lawyer_id) || "\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D";
    const lawyerPhone = String((row == null ? void 0 : row.assigned_lawyer_phone) || "").trim();
    const clientHasPhone = Boolean(clientPhone);
    const lawyerHasPhone = Boolean(lawyerPhone);
    const messagePlaceholder = canFillRequestData ? "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u044E\u0440\u0438\u0441\u0442\u0430" : "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0434\u043B\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0430";
    const selectedRequestTemplateCandidate = useMemo(
      () => (dataRequestModal.templateList || []).find((item) => {
        const query = String(dataRequestModal.requestTemplateQuery || "").trim().toLowerCase();
        if (!query) return false;
        return query === String((item == null ? void 0 : item.name) || "").trim().toLowerCase() || query === String((item == null ? void 0 : item.id) || "").trim().toLowerCase();
      }) || null,
      [dataRequestModal.requestTemplateQuery, dataRequestModal.templateList]
    );
    const selectedCatalogFieldCandidate = useMemo(
      () => (dataRequestModal.templates || []).find((item) => {
        const query = String(dataRequestModal.catalogFieldQuery || "").trim().toLowerCase();
        if (!query) return false;
        return query === String((item == null ? void 0 : item.label) || "").trim().toLowerCase() || query === String((item == null ? void 0 : item.key) || "").trim().toLowerCase() || query === String((item == null ? void 0 : item.id) || "").trim().toLowerCase();
      }) || null,
      [dataRequestModal.catalogFieldQuery, dataRequestModal.templates]
    );
    const filteredRequestTemplates = useMemo(() => {
      const query = String(dataRequestModal.requestTemplateQuery || "").trim().toLowerCase();
      const rows = Array.isArray(dataRequestModal.templateList) ? dataRequestModal.templateList : [];
      if (!query) return rows.slice(0, 8);
      return rows.filter((item) => String((item == null ? void 0 : item.name) || "").toLowerCase().includes(query)).slice(0, 8);
    }, [dataRequestModal.requestTemplateQuery, dataRequestModal.templateList]);
    const filteredCatalogFields = useMemo(() => {
      const query = String(dataRequestModal.catalogFieldQuery || "").trim().toLowerCase();
      const rows = Array.isArray(dataRequestModal.templates) ? dataRequestModal.templates : [];
      if (!query) return rows.slice(0, 10);
      return rows.filter((item) => {
        const label = String((item == null ? void 0 : item.label) || "").toLowerCase();
        const key = String((item == null ? void 0 : item.key) || "").toLowerCase();
        return label.includes(query) || key.includes(query);
      }).slice(0, 10);
    }, [dataRequestModal.catalogFieldQuery, dataRequestModal.templates]);
    const requestTemplateActionMode = selectedRequestTemplateCandidate ? "save" : String(dataRequestModal.requestTemplateQuery || "").trim() ? "create" : "";
    const catalogFieldActionMode = selectedCatalogFieldCandidate ? "add" : String(dataRequestModal.catalogFieldQuery || "").trim() ? "create" : "";
    const requestTemplateBadge = useMemo(() => {
      const query = String(dataRequestModal.requestTemplateQuery || "").trim();
      if (!query) return null;
      const matched = selectedRequestTemplateCandidate;
      if (!matched) return { kind: "create", label: "\u041D\u043E\u0432\u044B\u0439 \u0448\u0430\u0431\u043B\u043E\u043D" };
      const roleCode = String(viewerRole || "").toUpperCase();
      const actorId = String(viewerUserId || "").trim();
      const ownerId = String(matched.created_by_admin_id || "").trim();
      if (roleCode === "LAWYER" && ownerId && actorId && ownerId !== actorId) {
        return { kind: "readonly", label: "\u0427\u0443\u0436\u043E\u0439 \u0448\u0430\u0431\u043B\u043E\u043D" };
      }
      return { kind: "existing", label: "\u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0431\u043B\u043E\u043D" };
    }, [dataRequestModal.requestTemplateQuery, selectedRequestTemplateCandidate, viewerRole, viewerUserId]);
    const canSaveSelectedRequestTemplate = useMemo(() => {
      if (!String(dataRequestModal.requestTemplateQuery || "").trim()) return false;
      if (!requestTemplateBadge) return true;
      return requestTemplateBadge.kind !== "readonly";
    }, [dataRequestModal.requestTemplateQuery, requestTemplateBadge]);
    const attachmentById = useMemo(() => {
      const map = /* @__PURE__ */ new Map();
      safeAttachments.forEach((item) => {
        const id = String((item == null ? void 0 : item.id) || "").trim();
        if (id) map.set(id, item);
      });
      return map;
    }, [safeAttachments]);
    const statusOptions = useMemo(
      () => safeAvailableStatuses.filter((item) => item && item.code).map((item) => ({
        code: String(item.code),
        name: String(item.name || "").trim() || humanizeKey(item.code),
        groupName: item.status_group_name ? String(item.status_group_name) : "",
        isTerminal: Boolean(item.is_terminal)
      })),
      [safeAvailableStatuses]
    );
    const statusByCode = useMemo(() => new Map(statusOptions.map((item) => [item.code, item])), [statusOptions]);
    const toDateTimeLocalValue = (value) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
    };
    const defaultImportantDateLocal = useMemo(() => {
      const source = String(currentImportantDateAt || (row == null ? void 0 : row.important_date_at) || "").trim();
      if (source) {
        const local = toDateTimeLocalValue(source);
        if (local) return local;
      }
      const next = new Date(Date.now() + 3 * 24 * 60 * 60 * 1e3);
      return toDateTimeLocalValue(next.toISOString());
    }, [currentImportantDateAt, row == null ? void 0 : row.important_date_at]);
    const formatDuration = (seconds) => {
      const total = Number(seconds);
      if (!Number.isFinite(total) || total < 0) return "\u2014";
      const days = Math.floor(total / 86400);
      const hours = Math.floor(total % 86400 / 3600);
      const minutes = Math.floor(total % 3600 / 60);
      if (days > 0) return days + " \u0434 " + hours + " \u0447";
      if (hours > 0) return hours + " \u0447 " + minutes + " \u043C\u0438\u043D";
      return Math.max(0, minutes) + " \u043C\u0438\u043D";
    };
    const formatMoneyInput = (value) => {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) return "";
      return String(Math.round((amount + Number.EPSILON) * 100) / 100);
    };
    const openFinanceIssueForm = () => {
      var _a2, _b2, _c2, _d, _e;
      const defaultAmount = (_e = (_d = (_c2 = (_b2 = (_a2 = finance == null ? void 0 : finance.request_cost) != null ? _a2 : row == null ? void 0 : row.request_cost) != null ? _b2 : row == null ? void 0 : row.invoice_amount) != null ? _c2 : finance == null ? void 0 : finance.effective_rate) != null ? _d : row == null ? void 0 : row.effective_rate) != null ? _e : "";
      setFinanceIssueForm({
        open: true,
        saving: false,
        amount: formatMoneyInput(defaultAmount),
        serviceDescription: String((row == null ? void 0 : row.topic_name) || (row == null ? void 0 : row.topic_code) || "\u042E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0443\u0441\u043B\u0443\u0433\u0438"),
        payerDisplayName: String((row == null ? void 0 : row.client_name) || "").trim() || "\u041A\u043B\u0438\u0435\u043D\u0442",
        error: ""
      });
    };
    const closeFinanceIssueForm = () => {
      setFinanceIssueForm((prev) => ({ ...prev, open: false, saving: false, error: "" }));
    };
    const closeFinanceModal = () => {
      setFinanceOpen(false);
      closeFinanceIssueForm();
    };
    const submitFinanceIssueForm = async (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (!(row == null ? void 0 : row.id) || typeof onIssueInvoice !== "function") return;
      const normalizedAmount = Number(String(financeIssueForm.amount || "").replace(",", "."));
      if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        setFinanceIssueForm((prev) => ({ ...prev, error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0443\u044E \u0441\u0443\u043C\u043C\u0443 \u0441\u0447\u0435\u0442\u0430" }));
        return;
      }
      setFinanceIssueForm((prev) => ({ ...prev, saving: true, error: "" }));
      try {
        await onIssueInvoice({
          requestId: String(row.id),
          amount: normalizedAmount,
          serviceDescription: String(financeIssueForm.serviceDescription || ""),
          payerDisplayName: String(financeIssueForm.payerDisplayName || "")
        });
        setFinanceIssueForm((prev) => ({ ...prev, open: false, saving: false, error: "" }));
      } catch (error) {
        setFinanceIssueForm((prev) => ({ ...prev, saving: false, error: (error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u044B\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u0447\u0435\u0442" }));
      }
    };
    const openStatusChangeModal = (preset) => {
      const suggested = Array.isArray(preset == null ? void 0 : preset.suggestedStatuses) ? preset.suggestedStatuses.filter(Boolean) : [];
      const currentCode = String((row == null ? void 0 : row.status_code) || "").trim();
      const firstSuggested = suggested.find((code) => code && code !== currentCode) || "";
      setStatusChangeModal({
        open: true,
        saving: false,
        statusCode: firstSuggested,
        allowedStatusCodes: suggested.length ? suggested : null,
        importantDateAt: defaultImportantDateLocal,
        comment: "",
        files: [],
        error: ""
      });
    };
    const closeStatusChangeModal = () => {
      setStatusChangeModal((prev) => ({ ...prev, open: false, saving: false, error: "", files: [] }));
    };
    useEffect(() => {
      if (!pendingStatusChangePreset) return;
      openStatusChangeModal(pendingStatusChangePreset);
      if (typeof onConsumePendingStatusChangePreset === "function") onConsumePendingStatusChangePreset();
    }, [pendingStatusChangePreset]);
    const requestDataListItems = useMemo(() => {
      const byKey = /* @__PURE__ */ new Map();
      const messagesChrono = [...safeMessages].sort((a, b) => {
        const at = new Date((a == null ? void 0 : a.created_at) || 0).getTime();
        const bt = new Date((b == null ? void 0 : b.created_at) || 0).getTime();
        if (at !== bt) return at - bt;
        return String((a == null ? void 0 : a.id) || "").localeCompare(String((b == null ? void 0 : b.id) || ""), "ru");
      });
      messagesChrono.forEach((msg) => {
        if (String((msg == null ? void 0 : msg.message_kind) || "") !== "REQUEST_DATA") return;
        const items = Array.isArray(msg == null ? void 0 : msg.request_data_items) ? msg.request_data_items : [];
        items.forEach((item, idx) => {
          const key = String((item == null ? void 0 : item.key) || (item == null ? void 0 : item.id) || "item-" + idx);
          if (!key) return;
          byKey.set(key, {
            id: String((item == null ? void 0 : item.id) || ""),
            key,
            label: String((item == null ? void 0 : item.label) || (item == null ? void 0 : item.label_short) || key),
            field_type: String((item == null ? void 0 : item.field_type) || "string").toLowerCase(),
            value_text: (item == null ? void 0 : item.value_text) == null ? "" : String(item.value_text),
            is_filled: Boolean(item == null ? void 0 : item.is_filled),
            source_message_id: String((msg == null ? void 0 : msg.id) || ""),
            source_message_created_at: (msg == null ? void 0 : msg.created_at) || null,
            value_file: (item == null ? void 0 : item.value_file) || null
          });
        });
      });
      return Array.from(byKey.values()).sort((a, b) => {
        const aFilled = a.is_filled ? 1 : 0;
        const bFilled = b.is_filled ? 1 : 0;
        if (aFilled !== bFilled) return aFilled - bFilled;
        return String(a.label || a.key).localeCompare(String(b.label || b.key), "ru");
      });
    }, [safeMessages]);
    const attachmentsByMessageId = useMemo(() => {
      const map = /* @__PURE__ */ new Map();
      safeAttachments.forEach((item) => {
        const messageId = String((item == null ? void 0 : item.message_id) || "").trim();
        if (!messageId) return;
        if (!map.has(messageId)) map.set(messageId, []);
        map.get(messageId).push(item);
      });
      return map;
    }, [safeAttachments]);
    const localActivityCursor = useMemo(() => {
      let latestTs = 0;
      const pickLatest = (value) => {
        if (!value) return;
        const ts = new Date(value).getTime();
        if (Number.isFinite(ts) && ts > latestTs) latestTs = ts;
      };
      safeMessages.forEach((item) => {
        pickLatest(item == null ? void 0 : item.updated_at);
        pickLatest(item == null ? void 0 : item.created_at);
      });
      safeAttachments.forEach((item) => {
        pickLatest(item == null ? void 0 : item.updated_at);
        pickLatest(item == null ? void 0 : item.created_at);
      });
      return latestTs > 0 ? new Date(latestTs).toISOString() : "";
    }, [safeAttachments, safeMessages]);
    const typingHintText = useMemo(() => {
      const rows = Array.isArray(typingPeers) ? typingPeers : [];
      if (!rows.length) return "";
      const labels = rows.map((item) => String((item == null ? void 0 : item.actor_label) || (item == null ? void 0 : item.label) || "").trim()).filter(Boolean);
      if (!labels.length) return "\u0421\u043E\u0431\u0435\u0441\u0435\u0434\u043D\u0438\u043A \u043F\u0435\u0447\u0430\u0442\u0430\u0435\u0442...";
      const unique = [];
      labels.forEach((label) => {
        if (!unique.includes(label)) unique.push(label);
      });
      if (unique.length === 1) return unique[0] + " \u043F\u0435\u0447\u0430\u0442\u0430\u0435\u0442...";
      if (unique.length === 2) return unique[0] + " \u0438 " + unique[1] + " \u043F\u0435\u0447\u0430\u0442\u0430\u044E\u0442...";
      return unique[0] + ", " + unique[1] + " \u0438 \u0435\u0449\u0435 " + String(unique.length - 2) + " \u043F\u0435\u0447\u0430\u0442\u0430\u044E\u0442...";
    }, [typingPeers]);
    const openAttachmentFromMessage = (item) => {
      if (!(item == null ? void 0 : item.download_url)) return;
      const kind = detectAttachmentPreviewKind(item.file_name, item.mime_type);
      if (kind === "none") {
        window.open(String(item.download_url), "_blank", "noopener,noreferrer");
        return;
      }
      openPreview(item);
    };
    const downloadAttachment = (item) => {
      const url = String((item == null ? void 0 : item.download_url) || "").trim();
      if (!url) return;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer";
      const fileName = String((item == null ? void 0 : item.file_name) || "").trim();
      if (fileName) link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    useEffect(() => {
      liveCursorRef.current = localActivityCursor || "";
    }, [localActivityCursor, row == null ? void 0 : row.id]);
    useEffect(() => {
      if (!row || typeof onLiveProbe !== "function") {
        setTypingPeers([]);
        setLiveMode("online");
        if (liveTimerRef.current) {
          clearTimeout(liveTimerRef.current);
          liveTimerRef.current = null;
        }
        liveInFlightRef.current = false;
        liveFailCountRef.current = 0;
        return void 0;
      }
      let cancelled = false;
      const scheduleNext = (ms) => {
        if (cancelled) return;
        if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
        liveTimerRef.current = setTimeout(runProbe, ms);
      };
      const runProbe = async () => {
        if (cancelled || liveInFlightRef.current) return;
        liveInFlightRef.current = true;
        try {
          const payload = await onLiveProbe({ cursor: liveCursorRef.current });
          const cursor = String((payload == null ? void 0 : payload.cursor) || "").trim();
          if (cursor) liveCursorRef.current = cursor;
          setTypingPeers(Array.isArray(payload == null ? void 0 : payload.typing) ? payload.typing : []);
          liveFailCountRef.current = 0;
          setLiveMode("online");
        } catch (_) {
          liveFailCountRef.current += 1;
          setLiveMode(liveFailCountRef.current >= 3 ? "degraded" : "online");
        } finally {
          liveInFlightRef.current = false;
          const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
          const baseInterval = hidden ? 8e3 : 2500;
          const failStep = Math.min(5, Math.max(0, liveFailCountRef.current));
          const backoffInterval = failStep > 0 ? Math.min(3e4, baseInterval * Math.pow(2, failStep - 1)) : baseInterval;
          scheduleNext(backoffInterval);
        }
      };
      runProbe();
      return () => {
        cancelled = true;
        if (liveTimerRef.current) {
          clearTimeout(liveTimerRef.current);
          liveTimerRef.current = null;
        }
        liveInFlightRef.current = false;
        liveFailCountRef.current = 0;
        setTypingPeers([]);
        setLiveMode("online");
      };
    }, [onLiveProbe, row, trackNumber]);
    const typingEnabled = Boolean(
      row && typeof onTypingSignal === "function" && !loading && !fileUploading && composerFocused && String(messageDraft || "").trim()
    );
    useEffect(() => {
      if (typeof onTypingSignal !== "function" || !row) {
        if (typingHeartbeatRef.current) {
          clearInterval(typingHeartbeatRef.current);
          typingHeartbeatRef.current = null;
        }
        typingActiveRef.current = false;
        return;
      }
      if (typingEnabled) {
        if (!typingActiveRef.current) {
          typingActiveRef.current = true;
          void onTypingSignal({ typing: true }).catch(() => null);
        }
        if (!typingHeartbeatRef.current) {
          typingHeartbeatRef.current = setInterval(() => {
            void onTypingSignal({ typing: true }).catch(() => null);
          }, 2500);
        }
        return;
      }
      if (typingHeartbeatRef.current) {
        clearInterval(typingHeartbeatRef.current);
        typingHeartbeatRef.current = null;
      }
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void onTypingSignal({ typing: false }).catch(() => null);
      }
    }, [onTypingSignal, row, typingEnabled]);
    useEffect(
      () => () => {
        if (typingHeartbeatRef.current) {
          clearInterval(typingHeartbeatRef.current);
          typingHeartbeatRef.current = null;
        }
        if (typingActiveRef.current && typeof onTypingSignal === "function") {
          typingActiveRef.current = false;
          void onTypingSignal({ typing: false }).catch(() => null);
        }
      },
      [onTypingSignal]
    );
    const newDataRequestRow = (source) => {
      const item = source || {};
      const label = String(item.label || "").trim();
      const key = String(item.key || "").trim();
      const fieldTypeRaw = String(item.field_type || item.value_type || "string").trim().toLowerCase();
      const fieldType = ["string", "text", "date", "number", "file"].includes(fieldTypeRaw) ? fieldTypeRaw : "string";
      return {
        localId: "row-" + Math.random().toString(36).slice(2),
        id: item.id ? String(item.id) : "",
        topic_template_id: item.topic_template_id ? String(item.topic_template_id) : item.id ? String(item.id) : "",
        key,
        label: label || "\u041F\u043E\u043B\u0435",
        field_type: fieldType,
        document_name: String(item.document_name || "").trim(),
        value_text: item.value_text == null ? "" : String(item.value_text),
        value_file: item.value_file || null,
        is_filled: Boolean(item.is_filled)
      };
    };
    const getRequestDataRowIdentity = (item) => {
      const rowItem = item || {};
      const key = String(rowItem.key || "").trim().toLowerCase();
      if (key) return "key:" + key;
      const tplId = String(rowItem.topic_template_id || rowItem.id || "").trim();
      if (tplId) return "tpl:" + tplId;
      return "label:" + String(rowItem.label || "").trim().toLowerCase();
    };
    const mergeRequestDataRows = (baseRows, incomingRows) => {
      const rows = Array.isArray(baseRows) ? [...baseRows] : [];
      const nextItems = Array.isArray(incomingRows) ? incomingRows : [];
      const seen = new Set(rows.map((rowItem) => getRequestDataRowIdentity(rowItem)));
      nextItems.forEach((rowItem) => {
        const identity = getRequestDataRowIdentity(rowItem);
        if (!identity || seen.has(identity)) return;
        seen.add(identity);
        rows.push(rowItem);
      });
      return rows;
    };
    const openCreateDataRequestModal = async () => {
      if (!canRequestData || typeof onLoadRequestDataTemplates !== "function") return;
      setDataRequestModal((prev) => ({
        ...prev,
        open: true,
        loading: true,
        saving: false,
        savingTemplate: false,
        messageId: "",
        rows: [],
        error: "",
        templateStatus: "",
        requestTemplateQuery: "",
        catalogFieldQuery: "",
        selectedCatalogTemplateId: "",
        selectedRequestTemplateId: "",
        templateName: "",
        documentName: "",
        customLabel: "",
        customType: "string"
      }));
      try {
        const data = await onLoadRequestDataTemplates();
        setDataRequestModal((prev) => ({
          ...prev,
          open: true,
          loading: false,
          templates: Array.isArray(data == null ? void 0 : data.rows) ? data.rows : [],
          templateList: Array.isArray(data == null ? void 0 : data.templates) ? data.templates : [],
          availableDocuments: Array.isArray(data == null ? void 0 : data.documents) ? data.documents : [],
          documentName: "",
          requestTemplateQuery: "",
          catalogFieldQuery: ""
        }));
      } catch (error) {
        setDataRequestModal((prev) => ({ ...prev, loading: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D\u044B" }));
      }
    };
    const openEditDataRequestModal = async (messageId) => {
      if (!canRequestData || !messageId) return;
      setDataRequestModal((prev) => ({
        ...prev,
        open: true,
        loading: true,
        saving: false,
        savingTemplate: false,
        messageId: String(messageId),
        rows: [],
        error: "",
        templateStatus: "",
        requestTemplateQuery: "",
        catalogFieldQuery: "",
        selectedCatalogTemplateId: "",
        selectedRequestTemplateId: "",
        templateName: ""
      }));
      try {
        const [batch, templates] = await Promise.all([
          typeof onLoadRequestDataBatch === "function" ? onLoadRequestDataBatch(messageId) : Promise.resolve({ items: [] }),
          typeof onLoadRequestDataTemplates === "function" ? onLoadRequestDataTemplates() : Promise.resolve({ rows: [], documents: [], templates: [] })
        ]);
        setDataRequestModal((prev) => ({
          ...prev,
          open: true,
          loading: false,
          messageId: String(messageId),
          rows: Array.isArray(batch == null ? void 0 : batch.items) ? batch.items.map(newDataRequestRow) : [],
          documentName: String((batch == null ? void 0 : batch.document_name) || ""),
          templates: Array.isArray(templates == null ? void 0 : templates.rows) ? templates.rows : [],
          templateList: Array.isArray(templates == null ? void 0 : templates.templates) ? templates.templates : [],
          availableDocuments: Array.isArray(templates == null ? void 0 : templates.documents) ? templates.documents : [],
          requestTemplateQuery: "",
          catalogFieldQuery: ""
        }));
      } catch (error) {
        setDataRequestModal((prev) => ({ ...prev, loading: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441" }));
      }
    };
    const closeDataRequestModal = () => {
      setDataRequestModal((prev) => ({ ...prev, open: false, error: "", saving: false, savingTemplate: false, templateStatus: "" }));
    };
    const findRequestTemplateByQuery = (queryValue) => {
      const query = String(queryValue || "").trim().toLowerCase();
      if (!query) return null;
      return (dataRequestModal.templateList || []).find((item) => {
        const id = String((item == null ? void 0 : item.id) || "").toLowerCase();
        const name = String((item == null ? void 0 : item.name) || "").toLowerCase();
        return query === id || query === name;
      }) || null;
    };
    const findCatalogFieldByQuery = (queryValue) => {
      const query = String(queryValue || "").trim().toLowerCase();
      if (!query) return null;
      return (dataRequestModal.templates || []).find((item) => {
        const id = String((item == null ? void 0 : item.id) || "").toLowerCase();
        const key = String((item == null ? void 0 : item.key) || "").toLowerCase();
        const label = String((item == null ? void 0 : item.label) || "").toLowerCase();
        return query === id || query === key || query === label;
      }) || null;
    };
    const applyRequestTemplateById = async (rawTemplateId, templateNameHint) => {
      if (typeof onLoadRequestDataTemplateDetails !== "function") return;
      const templateId = String(rawTemplateId || "").trim();
      if (!templateId) return;
      setDataRequestModal((prev) => ({ ...prev, loading: true, error: "" }));
      try {
        const data = await onLoadRequestDataTemplateDetails(templateId);
        const incomingRows = (Array.isArray(data == null ? void 0 : data.items) ? data.items : []).map(
          (item) => newDataRequestRow({
            ...item,
            topic_template_id: item.topic_data_template_id || item.topic_template_id || "",
            field_type: item.value_type || item.field_type
          })
        );
        setDataRequestModal((prev) => {
          var _a2, _b2;
          return {
            ...prev,
            loading: false,
            rows: mergeRequestDataRows(prev.rows, incomingRows),
            selectedRequestTemplateId: String(((_a2 = data == null ? void 0 : data.template) == null ? void 0 : _a2.id) || prev.selectedRequestTemplateId || ""),
            requestTemplateQuery: String(((_b2 = data == null ? void 0 : data.template) == null ? void 0 : _b2.name) || templateNameHint || prev.requestTemplateQuery || ""),
            templateStatus: ""
          };
        });
      } catch (error) {
        setDataRequestModal((prev) => ({ ...prev, loading: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D" }));
      }
    };
    const applySelectedRequestTemplate = async () => {
      const selectedByQuery = findRequestTemplateByQuery(dataRequestModal.requestTemplateQuery);
      const templateId = String((selectedByQuery == null ? void 0 : selectedByQuery.id) || dataRequestModal.selectedRequestTemplateId || "").trim();
      return applyRequestTemplateById(templateId, (selectedByQuery == null ? void 0 : selectedByQuery.name) || "");
    };
    const refreshDataRequestCatalog = async () => {
      if (typeof onLoadRequestDataTemplates !== "function") return null;
      const data = await onLoadRequestDataTemplates();
      setDataRequestModal((prev) => ({
        ...prev,
        templates: Array.isArray(data == null ? void 0 : data.rows) ? data.rows : [],
        templateList: Array.isArray(data == null ? void 0 : data.templates) ? data.templates : [],
        availableDocuments: Array.isArray(data == null ? void 0 : data.documents) ? data.documents : [],
        selectedRequestTemplateId: prev.selectedRequestTemplateId && (Array.isArray(data == null ? void 0 : data.templates) ? data.templates : []).some((item) => String(item == null ? void 0 : item.id) === String(prev.selectedRequestTemplateId)) ? prev.selectedRequestTemplateId : ""
      }));
      return data;
    };
    const saveCurrentDataRequestTemplate = async () => {
      if (typeof onSaveRequestDataTemplate !== "function") return;
      const selectedFromQuery = findRequestTemplateByQuery(dataRequestModal.requestTemplateQuery);
      const templateName = String(dataRequestModal.requestTemplateQuery || "").trim();
      const rows = (dataRequestModal.rows || []).filter((row2) => String(row2.label || "").trim());
      if (!templateName) {
        setDataRequestModal((prev) => ({ ...prev, error: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u0430" }));
        return;
      }
      if (!rows.length) {
        setDataRequestModal((prev) => ({ ...prev, error: "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u043E \u043F\u043E\u043B\u0435 \u0434\u043B\u044F \u0448\u0430\u0431\u043B\u043E\u043D\u0430" }));
        return;
      }
      setDataRequestModal((prev) => ({ ...prev, savingTemplate: true, error: "", templateStatus: "" }));
      try {
        const result = await onSaveRequestDataTemplate({
          template_id: String((selectedFromQuery == null ? void 0 : selectedFromQuery.id) || dataRequestModal.selectedRequestTemplateId || "").trim() || void 0,
          name: templateName,
          items: rows.map((row2) => ({
            topic_data_template_id: row2.topic_template_id || void 0,
            key: row2.key || void 0,
            label: row2.label,
            value_type: row2.field_type || "string"
          }))
        });
        const savedRows = (Array.isArray(result == null ? void 0 : result.items) ? result.items : []).map(
          (item) => newDataRequestRow({
            ...item,
            topic_template_id: item.topic_data_template_id || item.topic_template_id || "",
            field_type: item.value_type || item.field_type
          })
        );
        setDataRequestModal((prev) => {
          var _a2, _b2;
          return {
            ...prev,
            savingTemplate: false,
            rows: savedRows.length ? savedRows : prev.rows,
            selectedRequestTemplateId: String(((_a2 = result == null ? void 0 : result.template) == null ? void 0 : _a2.id) || prev.selectedRequestTemplateId || ""),
            requestTemplateQuery: String(((_b2 = result == null ? void 0 : result.template) == null ? void 0 : _b2.name) || templateName),
            templateStatus: "\u0428\u0430\u0431\u043B\u043E\u043D \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D"
          };
        });
        await refreshDataRequestCatalog();
      } catch (error) {
        setDataRequestModal((prev) => ({ ...prev, savingTemplate: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D" }));
      }
    };
    const addSelectedTemplateRow = () => {
      const selectedByQuery = findCatalogFieldByQuery(dataRequestModal.catalogFieldQuery);
      const templateId = String((selectedByQuery == null ? void 0 : selectedByQuery.id) || dataRequestModal.selectedCatalogTemplateId || "").trim();
      const template = (dataRequestModal.templates || []).find((item) => String(item.id) === templateId);
      if (!template) {
        const manualLabel = String(dataRequestModal.catalogFieldQuery || "").trim();
        if (!manualLabel) return;
        setDataRequestModal((prev) => ({
          ...prev,
          catalogFieldQuery: "",
          templateStatus: "",
          rows: [...prev.rows || [], newDataRequestRow({ label: manualLabel, field_type: "string" })]
        }));
        return;
      }
      setDataRequestModal((prev) => {
        const exists = (prev.rows || []).some((row2) => String(row2.key || "") === String(template.key || ""));
        if (exists) return { ...prev, selectedCatalogTemplateId: "", catalogFieldQuery: "" };
        return {
          ...prev,
          selectedCatalogTemplateId: "",
          catalogFieldQuery: "",
          templateStatus: "",
          rows: [...prev.rows || [], newDataRequestRow({ ...template, topic_template_id: template.id, field_type: template.value_type })]
        };
      });
    };
    const updateDataRequestRow = (localId, patch) => {
      setDataRequestModal((prev) => ({
        ...prev,
        templateStatus: "",
        rows: (prev.rows || []).map((row2) => row2.localId === localId ? { ...row2, ...patch || {} } : row2)
      }));
    };
    const removeDataRequestRow = (localId) => {
      setDataRequestModal((prev) => ({
        ...prev,
        templateStatus: "",
        rows: (prev.rows || []).filter((row2) => row2.localId !== localId)
      }));
    };
    const moveDataRequestRow = (localId, delta) => {
      const shift = Number(delta) || 0;
      if (!shift) return;
      setDataRequestModal((prev) => {
        const rows = Array.isArray(prev.rows) ? [...prev.rows] : [];
        const index = rows.findIndex((row2) => row2.localId === localId);
        if (index < 0) return prev;
        const nextIndex = index + shift;
        if (nextIndex < 0 || nextIndex >= rows.length) return prev;
        const [item] = rows.splice(index, 1);
        rows.splice(nextIndex, 0, item);
        return { ...prev, templateStatus: "", rows };
      });
    };
    const moveDataRequestRowToIndex = (localId, targetIndexRaw) => {
      const targetIndex = Number(targetIndexRaw);
      if (!Number.isInteger(targetIndex)) return;
      setDataRequestModal((prev) => {
        const rows = Array.isArray(prev.rows) ? [...prev.rows] : [];
        const fromIndex = rows.findIndex((rowItem) => rowItem.localId === localId);
        if (fromIndex < 0) return prev;
        const boundedIndex = Math.max(0, Math.min(rows.length - 1, targetIndex));
        if (fromIndex === boundedIndex) return prev;
        const [item] = rows.splice(fromIndex, 1);
        rows.splice(boundedIndex, 0, item);
        return { ...prev, templateStatus: "", rows };
      });
    };
    const submitDataRequestModal = async () => {
      if (typeof onSaveRequestDataBatch !== "function") return;
      const rows = (dataRequestModal.rows || []).filter((row2) => String(row2.label || "").trim());
      if (!rows.length) {
        setDataRequestModal((prev) => ({ ...prev, error: "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u043E \u043F\u043E\u043B\u0435" }));
        return;
      }
      setDataRequestModal((prev) => ({ ...prev, saving: true, error: "" }));
      try {
        await onSaveRequestDataBatch({
          message_id: dataRequestModal.messageId || void 0,
          items: rows.map((row2) => ({
            id: row2.id || void 0,
            topic_template_id: row2.topic_template_id || void 0,
            key: row2.key || void 0,
            label: row2.label,
            field_type: row2.field_type || "string",
            document_name: row2.document_name || void 0
          }))
        });
        closeDataRequestModal();
      } catch (error) {
        setDataRequestModal((prev) => ({ ...prev, saving: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441" }));
      }
    };
    const closeClientDataModal = () => {
      setClientDataModal({
        open: false,
        loading: false,
        saving: false,
        messageId: "",
        items: [],
        status: "",
        error: ""
      });
    };
    const openClientDataRequestModal = async (messageId) => {
      if (!canFillRequestData || typeof onLoadRequestDataBatch !== "function" || !messageId) return;
      setClientDataModal({
        open: true,
        loading: true,
        saving: false,
        messageId: String(messageId),
        items: [],
        status: "",
        error: ""
      });
      try {
        const data = await onLoadRequestDataBatch(String(messageId));
        const items = Array.isArray(data == null ? void 0 : data.items) ? data.items.slice().sort((a, b) => Number((a == null ? void 0 : a.sort_order) || 0) - Number((b == null ? void 0 : b.sort_order) || 0)).map((item, index) => ({
          localId: "client-data-" + String((item == null ? void 0 : item.id) || (item == null ? void 0 : item.key) || index),
          id: String((item == null ? void 0 : item.id) || ""),
          key: String((item == null ? void 0 : item.key) || ""),
          label: String((item == null ? void 0 : item.label) || (item == null ? void 0 : item.key) || "\u041F\u043E\u043B\u0435"),
          field_type: String((item == null ? void 0 : item.field_type) || "string").toLowerCase(),
          value_text: (item == null ? void 0 : item.value_text) == null ? "" : String(item.value_text),
          value_file: (item == null ? void 0 : item.value_file) || null,
          pendingFile: null
        })) : [];
        setClientDataModal((prev) => ({ ...prev, loading: false, items }));
      } catch (error) {
        setClientDataModal((prev) => ({ ...prev, loading: false, error: (error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441 \u0434\u0430\u043D\u043D\u044B\u0445" }));
      }
    };
    const updateClientDataItem = (localId, patch) => {
      setClientDataModal((prev) => ({
        ...prev,
        status: "",
        error: "",
        items: (prev.items || []).map((item) => item.localId === localId ? { ...item, ...patch || {} } : item)
      }));
    };
    const submitClientDataModal = async (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (!canFillRequestData || typeof onSaveRequestDataValues !== "function") return;
      const currentMessageId = String(clientDataModal.messageId || "").trim();
      if (!currentMessageId) return;
      setClientDataModal((prev) => ({ ...prev, saving: true, status: "", error: "" }));
      try {
        const payloadItems = [];
        for (const item of clientDataModal.items || []) {
          const fieldType = String((item == null ? void 0 : item.field_type) || "string").toLowerCase();
          if (fieldType === "file") {
            let attachmentId = String((item == null ? void 0 : item.value_text) || "").trim();
            if (item == null ? void 0 : item.pendingFile) {
              if (typeof onUploadRequestAttachment !== "function") {
                throw new Error("\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0444\u0430\u0439\u043B\u0430 \u0434\u043B\u044F \u043F\u043E\u043B\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430");
              }
              const uploadResult = await onUploadRequestAttachment(item.pendingFile, {
                source: "data_request",
                message_id: currentMessageId,
                key: String((item == null ? void 0 : item.key) || "")
              });
              attachmentId = String(
                uploadResult && (uploadResult.attachment_id || uploadResult.id || uploadResult.value || uploadResult) || ""
              ).trim();
              if (!attachmentId) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0444\u0430\u0439\u043B \u0434\u043B\u044F \u043F\u043E\u043B\u044F \u0437\u0430\u043F\u0440\u043E\u0441\u0430");
            }
            payloadItems.push({
              id: String((item == null ? void 0 : item.id) || ""),
              key: String((item == null ? void 0 : item.key) || ""),
              attachment_id: attachmentId || "",
              value_text: attachmentId || ""
            });
            continue;
          }
          payloadItems.push({
            id: String((item == null ? void 0 : item.id) || ""),
            key: String((item == null ? void 0 : item.key) || ""),
            value_text: String((item == null ? void 0 : item.value_text) || "")
          });
        }
        await onSaveRequestDataValues({
          message_id: currentMessageId,
          items: payloadItems
        });
        closeClientDataModal();
      } catch (error) {
        setClientDataModal((prev) => ({
          ...prev,
          saving: false,
          error: (error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435"
        }));
      }
    };
    const handleRequestRowDragStart = (event, rowItem, rowLocked) => {
      if (rowLocked || dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate) {
        event.preventDefault();
        return;
      }
      setDraggedRequestRowId(String(rowItem.localId || ""));
      setDragOverRequestRowId(String(rowItem.localId || ""));
      try {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(rowItem.localId || ""));
      } catch (_error) {
      }
    };
    const handleRequestRowDragEnd = () => {
      setDraggedRequestRowId("");
      setDragOverRequestRowId("");
    };
    const appendStatusChangeFiles = (files) => {
      const list = Array.isArray(files) ? files.filter(Boolean) : [];
      if (!list.length) return;
      setStatusChangeModal((prev) => {
        const existing = Array.isArray(prev.files) ? prev.files : [];
        const next = [...existing];
        list.forEach((file) => {
          const duplicate = next.some(
            (item) => item && item.name === file.name && Number(item.size || 0) === Number(file.size || 0) && Number(item.lastModified || 0) === Number(file.lastModified || 0)
          );
          if (!duplicate) next.push(file);
        });
        return { ...prev, files: next };
      });
    };
    const removeStatusChangeFile = (index) => {
      setStatusChangeModal((prev) => {
        const files = Array.isArray(prev.files) ? [...prev.files] : [];
        files.splice(index, 1);
        return { ...prev, files };
      });
    };
    const submitStatusChange = async (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (!(row == null ? void 0 : row.id) || typeof onChangeStatus !== "function") return;
      const nextStatus = String(statusChangeModal.statusCode || "").trim();
      if (!nextStatus) {
        setStatusChangeModal((prev) => ({ ...prev, error: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441" }));
        return;
      }
      if (nextStatus === String((row == null ? void 0 : row.status_code) || "").trim()) {
        setStatusChangeModal((prev) => ({ ...prev, error: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0442\u0430\u0442\u0443\u0441, \u043E\u0442\u043B\u0438\u0447\u043D\u044B\u0439 \u043E\u0442 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E" }));
        return;
      }
      setStatusChangeModal((prev) => ({ ...prev, saving: true, error: "" }));
      try {
        const localValue = String(statusChangeModal.importantDateAt || "").trim();
        const importantDateIso = localValue ? new Date(localValue).toISOString() : "";
        await onChangeStatus({
          requestId: String(row.id),
          statusCode: nextStatus,
          importantDateAt: importantDateIso || null,
          comment: statusChangeModal.comment || "",
          files: statusChangeModal.files || []
        });
        closeStatusChangeModal();
      } catch (error) {
        setStatusChangeModal((prev) => ({ ...prev, saving: false, error: error.message || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043C\u0435\u043D\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441" }));
      }
    };
    const chatTimelineItems = [];
    let previousDate = "";
    const timelineSource = [];
    safeMessages.forEach((item) => {
      timelineSource.push({
        type: "message",
        key: "msg-" + String((item == null ? void 0 : item.id) || Math.random()),
        created_at: (item == null ? void 0 : item.created_at) || null,
        payload: item
      });
    });
    safeAttachments.filter((item) => !String((item == null ? void 0 : item.message_id) || "").trim()).forEach((item) => {
      timelineSource.push({
        type: "file",
        key: "file-" + String((item == null ? void 0 : item.id) || Math.random()),
        created_at: (item == null ? void 0 : item.created_at) || null,
        payload: item
      });
    });
    timelineSource.sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
      if (!Number.isFinite(aTime)) return 1;
      if (!Number.isFinite(bTime)) return -1;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.key).localeCompare(String(b.key), "ru");
    });
    timelineSource.forEach((entry, index) => {
      const dateLabel = fmtDateOnly(entry.created_at);
      const normalizedDate = dateLabel && dateLabel !== "-" ? dateLabel : "\u0411\u0435\u0437 \u0434\u0430\u0442\u044B";
      if (normalizedDate !== previousDate) {
        chatTimelineItems.push({ type: "date", key: "date-" + normalizedDate + "-" + index, label: normalizedDate });
        previousDate = normalizedDate;
      }
      chatTimelineItems.push(entry);
    });
    useEffect(() => {
      if (chatTab !== "chat") return;
      const listNode = chatListRef.current;
      if (!listNode) return;
      const cursor = String(localActivityCursor || "");
      if (!cursor || cursor === lastAutoScrollCursorRef.current) return;
      lastAutoScrollCursorRef.current = cursor;
      const raf = window.requestAnimationFrame(() => {
        if (!chatListRef.current) return;
        chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
      });
      return () => window.cancelAnimationFrame(raf);
    }, [chatTab, localActivityCursor]);
    const baseRouteNodes = Array.isArray(statusRouteNodes) && statusRouteNodes.length ? statusRouteNodes : (row == null ? void 0 : row.status_code) ? [{ code: row.status_code, name: String((row == null ? void 0 : row.status_name) || statusLabel(row.status_code) || row.status_code), state: "current", note: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u044D\u0442\u0430\u043F \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438 \u0437\u0430\u044F\u0432\u043A\u0438" }] : [];
    const upcomingImportantDate = useMemo(() => {
      const source = String(currentImportantDateAt || (row == null ? void 0 : row.important_date_at) || "").trim();
      if (!source) return "";
      const timestamp = new Date(source).getTime();
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return "";
      return new Date(timestamp).toISOString();
    }, [currentImportantDateAt, row == null ? void 0 : row.important_date_at]);
    const routeNodes = useMemo(() => {
      if (viewerRoleCode !== "CLIENT" && viewerRoleCode !== "LAWYER" || !upcomingImportantDate) return baseRouteNodes;
      if (!Array.isArray(baseRouteNodes) || !baseRouteNodes.length) {
        return [
          {
            code: "__IMPORTANT_DATE__",
            name: "\u0412\u0430\u0436\u043D\u0430\u044F \u0434\u0430\u0442\u0430",
            state: "pending",
            changed_at: upcomingImportantDate,
            note: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u0439 \u0441\u0440\u043E\u043A"
          }
        ];
      }
      const hasVirtualNode = baseRouteNodes.some((node) => String((node == null ? void 0 : node.code) || "").trim() === "__IMPORTANT_DATE__");
      if (hasVirtualNode) return baseRouteNodes;
      const currentIndex = baseRouteNodes.findIndex((node) => String((node == null ? void 0 : node.state) || "").trim().toLowerCase() === "current");
      const virtualNode = {
        code: "__IMPORTANT_DATE__",
        name: "\u0412\u0430\u0436\u043D\u0430\u044F \u0434\u0430\u0442\u0430",
        state: "pending",
        changed_at: upcomingImportantDate,
        note: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u0439 \u0441\u0440\u043E\u043A"
      };
      if (currentIndex < 0) return [...baseRouteNodes, virtualNode];
      const next = [...baseRouteNodes];
      next.splice(currentIndex + 1, 0, virtualNode);
      return next;
    }, [baseRouteNodes, upcomingImportantDate, viewerRoleCode]);
    const routeNodesForDisplay = useMemo(() => {
      if (!Array.isArray(routeNodes) || !routeNodes.length) return [];
      const important = [];
      const current = [];
      const completed = [];
      const pending = [];
      routeNodes.forEach((node) => {
        const code = String((node == null ? void 0 : node.code) || "").trim();
        const state = String((node == null ? void 0 : node.state) || "pending").trim().toLowerCase();
        if (code === "__IMPORTANT_DATE__") {
          important.push(node);
          return;
        }
        if (state === "current") {
          current.push(node);
          return;
        }
        if (state === "completed") {
          completed.push(node);
          return;
        }
        pending.push(node);
      });
      return [...important, ...current, ...completed.reverse(), ...pending];
    }, [routeNodes]);
    const AttachmentPreviewModal = AttachmentPreviewModalComponent;
    const StatusLine = StatusLineComponent;
    const renderRequestDataMessageItems = (payload) => {
      var _a2;
      const items = Array.isArray(payload == null ? void 0 : payload.request_data_items) ? payload.request_data_items : [];
      const allFilled = Boolean(payload == null ? void 0 : payload.request_data_all_filled);
      if (!items.length) return /* @__PURE__ */ React.createElement("p", { className: "chat-message-text" }, "\u0417\u0430\u043F\u0440\u043E\u0441");
      if (allFilled) {
        const fileOnly = items.length === 1 && String(((_a2 = items[0]) == null ? void 0 : _a2.field_type) || "").toLowerCase() === "file";
        return /* @__PURE__ */ React.createElement("p", { className: "chat-message-text chat-request-data-collapsed" }, fileOnly ? "\u0424\u0430\u0439\u043B" : "\u0417\u0430\u043F\u043E\u043B\u043D\u0435\u043D");
      }
      const visibleItems = items.slice(0, 7);
      const hiddenCount = Math.max(0, items.length - visibleItems.length);
      return /* @__PURE__ */ React.createElement("div", { className: "chat-request-data-list" }, visibleItems.map((item, idx) => /* @__PURE__ */ React.createElement("div", { className: "chat-request-data-item" + ((item == null ? void 0 : item.is_filled) ? " filled" : ""), key: String((item == null ? void 0 : item.id) || idx) }, /* @__PURE__ */ React.createElement("span", { className: "chat-request-data-index" }, (item == null ? void 0 : item.is_filled) ? /* @__PURE__ */ React.createElement("span", { className: "chat-request-data-check" }, "\u2713") : null, String((item == null ? void 0 : item.index) || idx + 1) + "."), /* @__PURE__ */ React.createElement("span", { className: "chat-request-data-label" }, String((item == null ? void 0 : item.label_short) || (item == null ? void 0 : item.label) || "\u041F\u043E\u043B\u0435")))), hiddenCount > 0 ? /* @__PURE__ */ React.createElement("div", { className: "chat-request-data-more" }, "... \u0435\u0449\u0435 ", hiddenCount) : null);
    };
    const resolveServiceMessageContent = (payload) => {
      const messageKind = String((payload == null ? void 0 : payload.message_kind) || "");
      if (messageKind === "REQUEST_DATA") return null;
      const bodyRaw = String((payload == null ? void 0 : payload.body) || "").replace(/\r/g, "").trim();
      if (!bodyRaw) return null;
      const lines = bodyRaw.split("\n");
      const firstLine = String(lines[0] || "").trim();
      const restLines = lines.slice(1);
      const normalizeDetail = (value) => String(value || "").trim();
      const withTail = (firstDetail) => [normalizeDetail(firstDetail), ...restLines.map((line) => normalizeDetail(line)).filter(Boolean)].filter(Boolean).join("\n");
      if (firstLine === "\u0421\u0447\u0435\u0442 \u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443" || firstLine.startsWith("\u0421\u0447\u0435\u0442 \u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443:")) {
        return {
          title: "\u0421\u0447\u0435\u0442 \u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443",
          text: withTail(firstLine.startsWith("\u0421\u0447\u0435\u0442 \u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443:") ? firstLine.slice("\u0421\u0447\u0435\u0442 \u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443:".length) : "")
        };
      }
      if (firstLine.startsWith("\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441:") || firstLine.startsWith("\u0421\u043C\u0435\u043D\u0430 \u0441\u0442\u0430\u0442\u0443\u0441\u0430:")) {
        const source = firstLine.startsWith("\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441:") ? firstLine : firstLine.slice("\u0421\u043C\u0435\u043D\u0430 \u0441\u0442\u0430\u0442\u0443\u0441\u0430:".length);
        const detail = firstLine.startsWith("\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441:") ? source.slice("\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441:".length) : source;
        return {
          title: "\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0441\u0442\u0430\u0442\u0443\u0441",
          text: withTail(detail)
        };
      }
      if (firstLine.startsWith("\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u044E\u0440\u0438\u0441\u0442:") || firstLine.startsWith("\u041F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043E:")) {
        const detail = firstLine.startsWith("\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u044E\u0440\u0438\u0441\u0442:") ? firstLine.slice("\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u044E\u0440\u0438\u0441\u0442:".length) : firstLine.slice("\u041F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043E:".length);
        return {
          title: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u044E\u0440\u0438\u0441\u0442",
          text: withTail(detail)
        };
      }
      return null;
    };
    const resolveStatusDisplayName = (code, explicitName) => {
      var _a2;
      const explicit = String(explicitName || "").trim();
      if (explicit) return explicit;
      const normalizedCode = String(code || "").trim();
      if (!normalizedCode) return "-";
      const optionName = String(((_a2 = statusByCode.get(normalizedCode)) == null ? void 0 : _a2.name) || "").trim();
      if (optionName) return optionName;
      const legacyName = String(statusLabel(normalizedCode) || "").trim();
      if (legacyName && legacyName !== normalizedCode) return legacyName;
      return humanizeKey(normalizedCode);
    };
    const formatRequestDataValue = (item) => {
      const type = String((item == null ? void 0 : item.field_type) || "string").toLowerCase();
      if (type === "date") {
        const text2 = String((item == null ? void 0 : item.value_text) || "").trim();
        return text2 ? fmtDateOnly(text2) : "\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E";
      }
      if (type === "file") {
        const attachmentId = String((item == null ? void 0 : item.value_text) || "").trim();
        const linkedAttachment = attachmentId ? attachmentById.get(attachmentId) : null;
        const fileMeta = (item == null ? void 0 : item.value_file) || (linkedAttachment ? {
          attachment_id: linkedAttachment.id,
          file_name: linkedAttachment.file_name,
          mime_type: linkedAttachment.mime_type,
          size_bytes: linkedAttachment.size_bytes,
          download_url: linkedAttachment.download_url
        } : null);
        return fileMeta || null;
      }
      const text = String((item == null ? void 0 : item.value_text) || "").trim();
      return text || "\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E";
    };
    const currentStatusName = resolveStatusDisplayName(row == null ? void 0 : row.status_code, (row == null ? void 0 : row.status_name) || "");
    const dataRequestProgress = useMemo(() => {
      const rows = Array.isArray(dataRequestModal.rows) ? dataRequestModal.rows : [];
      const total = rows.length;
      const filled = rows.filter((rowItem) => Boolean((rowItem == null ? void 0 : rowItem.is_filled) || String((rowItem == null ? void 0 : rowItem.value_text) || "").trim())).length;
      return { total, filled };
    }, [dataRequestModal.rows]);
    return /* @__PURE__ */ React.createElement("div", { className: "block" }, /* @__PURE__ */ React.createElement("div", { className: "request-workspace-layout" }, /* @__PURE__ */ React.createElement("div", { className: "request-main-column" }, /* @__PURE__ */ React.createElement("div", { className: "block" }, /* @__PURE__ */ React.createElement("div", { className: "request-card-head" }, /* @__PURE__ */ React.createElement("h3", null, "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430"), /* @__PURE__ */ React.createElement("div", { className: "request-card-head-actions" }, canRequestData ? /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "icon-btn request-card-status-btn",
        "data-tooltip": "\u0421\u043C\u0435\u043D\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441",
        "aria-label": "\u0421\u043C\u0435\u043D\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441",
        onClick: () => openStatusChangeModal(),
        disabled: loading || !row
      },
      "\u21C4"
    ) : null, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "icon-btn request-card-data-btn",
        "data-tooltip": "\u0414\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u044F\u0432\u043A\u0438",
        "aria-label": "\u0414\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u044F\u0432\u043A\u0438",
        onClick: () => setRequestDataListOpen(true),
        disabled: loading || !row
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement("path", { d: "M4 5h16v2H4V5Zm0 6h16v2H4v-2Zm0 6h10v2H4v-2Z", fill: "currentColor" }))
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "icon-btn request-card-finance-btn",
        "data-tooltip": "\u0424\u0438\u043D\u0430\u043D\u0441\u044B \u0437\u0430\u044F\u0432\u043A\u0438",
        "aria-label": "\u0424\u0438\u043D\u0430\u043D\u0441\u044B \u0437\u0430\u044F\u0432\u043A\u0438",
        onClick: () => setFinanceOpen(true),
        disabled: loading || !row
      },
      "$"
    ))), /* @__PURE__ */ React.createElement("div", { className: "request-card-head-spacer", "aria-hidden": "true" }), loading ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...") : row ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "request-card-grid request-card-grid-compact" }, showTopicStatusInCard ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0422\u0435\u043C\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, String(row.topic_name || row.topic_code || "-"))), /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0421\u0442\u0430\u0442\u0443\u0441"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, currentStatusName))) : null, /* @__PURE__ */ React.createElement("div", { className: "request-field request-field-span-2 request-field-description" }, /* @__PURE__ */ React.createElement("div", { className: "request-field-head" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u044B"), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "icon-btn request-field-expand-btn",
        "data-tooltip": "\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435",
        "aria-label": "\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435",
        onClick: () => setDescriptionOpen(true)
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M4 9V4h5v2H6v3H4zm10-5h6v6h-2V6h-4V4zM4 15h2v3h3v2H4v-5zm14 3v-3h2v5h-5v-2h3z",
          fill: "currentColor"
        }
      ))
    )), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, row.description ? String(row.description) : "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E")), showContactsInCard ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u041A\u043B\u0438\u0435\u043D\u0442"), /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "request-field-value" + (clientHasPhone ? " has-tooltip request-contact-value" : ""),
        "data-tooltip": clientHasPhone ? clientPhone : void 0
      },
      clientLabel
    )), /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u042E\u0440\u0438\u0441\u0442"), /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "request-field-value" + (lawyerHasPhone ? " has-tooltip request-contact-value" : ""),
        "data-tooltip": lawyerHasPhone ? lawyerPhone : void 0
      },
      lawyerLabel
    ))) : null, canSeeCreatedUpdatedInCard ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0421\u043E\u0437\u0434\u0430\u043D\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtShortDateTime(row.created_at))), /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtShortDateTime(row.updated_at)))) : null), /* @__PURE__ */ React.createElement("div", { className: "request-status-route" }, /* @__PURE__ */ React.createElement("h4", null, "\u041C\u0430\u0440\u0448\u0440\u0443\u0442 \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432"), routeNodesForDisplay.length ? /* @__PURE__ */ React.createElement("ol", { className: "request-route-list", id: "request-status-route" }, routeNodesForDisplay.map((node, index) => {
      const state = String((node == null ? void 0 : node.state) || "pending");
      const code = String((node == null ? void 0 : node.code) || "").trim();
      const rawName = String((node == null ? void 0 : node.name) || "").trim();
      const name = resolveStatusDisplayName(code, rawName && rawName !== code ? rawName : "");
      const note = String((node == null ? void 0 : node.note) || "").trim();
      const isImportantDateNode = code === "__IMPORTANT_DATE__";
      const changedAtSource = String((node == null ? void 0 : node.changed_at) || "").trim() || (isImportantDateNode ? String(currentImportantDateAt || (row == null ? void 0 : row.important_date_at) || "").trim() : "");
      const changedAt = changedAtSource ? fmtDate(changedAtSource) : "";
      const className = "route-item " + (state === "current" ? "current" : state === "completed" ? "completed" : "pending") + (isImportantDateNode ? " important-date" : "");
      return /* @__PURE__ */ React.createElement("li", { className, key: ((node == null ? void 0 : node.code) || "node") + "-" + index }, /* @__PURE__ */ React.createElement("span", { className: "route-dot" }), /* @__PURE__ */ React.createElement("div", { className: "route-body" }, /* @__PURE__ */ React.createElement("b", null, name), isImportantDateNode ? /* @__PURE__ */ React.createElement("p", null, "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u0439 \u0441\u0440\u043E\u043A: " + (changedAt || "-")) : /* @__PURE__ */ React.createElement(React.Fragment, null, note ? /* @__PURE__ */ React.createElement("p", null, note) : null, /* @__PURE__ */ React.createElement("div", { className: "muted route-time" }, "\u0414\u0430\u0442\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F: ", changedAt || "-"))));
    })) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u041C\u0430\u0440\u0448\u0440\u0443\u0442 \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432 \u0434\u043B\u044F \u0442\u0435\u043C\u044B \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D"))) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435"))), /* @__PURE__ */ React.createElement("div", { className: "block request-chat-block" }, /* @__PURE__ */ React.createElement("div", { className: "request-chat-head" }, /* @__PURE__ */ React.createElement("h3", null, "\u041A\u043E\u043C\u043C\u0443\u043D\u0438\u043A\u0430\u0446\u0438\u044F"), /* @__PURE__ */ React.createElement("div", { className: "request-chat-tabs", role: "tablist", "aria-label": "\u041A\u043E\u043C\u043C\u0443\u043D\u0438\u043A\u0430\u0446\u0438\u044F" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": chatTab === "chat",
        className: "tab-btn" + (chatTab === "chat" ? " active" : ""),
        onClick: () => setChatTab("chat")
      },
      "\u0427\u0430\u0442"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": chatTab === "files",
        className: "tab-btn" + (chatTab === "files" ? " active" : ""),
        onClick: () => setChatTab("files")
      },
      "\u0424\u0430\u0439\u043B\u044B" + (safeAttachments.length ? " (" + safeAttachments.length + ")" : "")
    ))), /* @__PURE__ */ React.createElement("div", { className: "request-chat-live-row", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("span", { className: "chat-live-dot" + (liveMode === "degraded" ? " degraded" : "") }), /* @__PURE__ */ React.createElement("span", { className: "request-chat-live-text" }, typingHintText || (liveMode === "degraded" ? "\u0421\u0432\u044F\u0437\u044C \u043D\u0435\u0441\u0442\u0430\u0431\u0438\u043B\u044C\u043D\u0430, \u0432\u043A\u043B\u044E\u0447\u0435\u043D backoff" : "\u041E\u043D\u043B\u0430\u0439\u043D"))), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: idMap.fileInput,
        ref: fileInputRef,
        type: "file",
        multiple: true,
        onChange: onInputFiles,
        disabled: loading || fileUploading,
        style: { position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none" }
      }
    ), chatTab === "chat" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("ul", { className: "simple-list request-modal-list request-chat-list", id: idMap.messagesList, ref: chatListRef }, chatTimelineItems.length ? chatTimelineItems.map(
      (entry) => {
        var _a2, _b2, _c2, _d, _e;
        return entry.type === "date" ? /* @__PURE__ */ React.createElement("li", { key: entry.key, className: "chat-date-divider" }, /* @__PURE__ */ React.createElement("span", null, entry.label)) : entry.type === "file" ? /* @__PURE__ */ React.createElement(
          "li",
          {
            key: entry.key,
            className: "chat-message " + (String(((_a2 = entry.payload) == null ? void 0 : _a2.responsible) || "").toUpperCase().includes("\u041A\u041B\u0418\u0415\u041D\u0422") ? "incoming" : "outgoing")
          },
          /* @__PURE__ */ React.createElement("div", { className: "chat-message-author" }, String(((_b2 = entry.payload) == null ? void 0 : _b2.responsible) || "\u0421\u0438\u0441\u0442\u0435\u043C\u0430")),
          /* @__PURE__ */ React.createElement("div", { className: "chat-message-bubble" }, /* @__PURE__ */ React.createElement("div", { className: "chat-message-files" }, /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "chat-message-file-chip",
              onClick: () => openAttachmentFromMessage(entry.payload),
              title: String(((_c2 = entry.payload) == null ? void 0 : _c2.file_name) || "\u0424\u0430\u0439\u043B")
            },
            /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"),
            /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-name" }, String(((_d = entry.payload) == null ? void 0 : _d.file_name) || "\u0424\u0430\u0439\u043B"))
          )), /* @__PURE__ */ React.createElement("div", { className: "chat-message-time" }, fmtTimeOnly((_e = entry.payload) == null ? void 0 : _e.created_at)))
        ) : (() => {
          var _a3, _b3, _c3, _d2, _e2, _f, _g, _h, _i;
          const messageKind = String(((_a3 = entry.payload) == null ? void 0 : _a3.message_kind) || "");
          const isRequestDataMessage = messageKind === "REQUEST_DATA";
          const serviceMessageContent = resolveServiceMessageContent(entry.payload);
          const requestDataInteractive = isRequestDataMessage && (canRequestData || canFillRequestData);
          const bubbleClass = "chat-message-bubble" + (isRequestDataMessage ? " chat-request-data-bubble" : "") + (((_b3 = entry.payload) == null ? void 0 : _b3.request_data_all_filled) ? " all-filled" : "") + (isRequestDataMessage && canFillRequestData ? " request-data-message-btn" : "");
          const itemClass = "chat-message " + (String(((_c3 = entry.payload) == null ? void 0 : _c3.author_type) || "").toUpperCase() === "CLIENT" ? "incoming" : "outgoing") + (isRequestDataMessage && canFillRequestData ? " request-data-item" + (((_d2 = entry.payload) == null ? void 0 : _d2.request_data_all_filled) ? " done" : "") : "");
          return /* @__PURE__ */ React.createElement("li", { key: entry.key, className: itemClass }, /* @__PURE__ */ React.createElement("div", { className: "chat-message-author" }, String(((_e2 = entry.payload) == null ? void 0 : _e2.author_name) || ((_f = entry.payload) == null ? void 0 : _f.author_type) || "\u0421\u0438\u0441\u0442\u0435\u043C\u0430")), /* @__PURE__ */ React.createElement(
            "div",
            {
              className: bubbleClass,
              onClick: requestDataInteractive ? () => {
                var _a4, _b4;
                return canRequestData ? openEditDataRequestModal(String(((_a4 = entry.payload) == null ? void 0 : _a4.id) || "")) : openClientDataRequestModal(String(((_b4 = entry.payload) == null ? void 0 : _b4.id) || ""));
              } : void 0,
              role: requestDataInteractive ? "button" : void 0,
              tabIndex: requestDataInteractive ? 0 : void 0,
              onKeyDown: requestDataInteractive ? (event) => {
                var _a4, _b4;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (canRequestData) openEditDataRequestModal(String(((_a4 = entry.payload) == null ? void 0 : _a4.id) || ""));
                  else openClientDataRequestModal(String(((_b4 = entry.payload) == null ? void 0 : _b4.id) || ""));
                }
              } : void 0
            },
            String(((_g = entry.payload) == null ? void 0 : _g.message_kind) || "") === "REQUEST_DATA" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "chat-request-data-head" }, "\u0417\u0430\u043F\u0440\u043E\u0441"), renderRequestDataMessageItems(entry.payload)) : /* @__PURE__ */ React.createElement(React.Fragment, null, (serviceMessageContent == null ? void 0 : serviceMessageContent.title) ? /* @__PURE__ */ React.createElement("div", { className: "chat-service-head" }, serviceMessageContent.title) : null, serviceMessageContent ? serviceMessageContent.text ? /* @__PURE__ */ React.createElement("p", { className: "chat-message-text" }, serviceMessageContent.text) : null : /* @__PURE__ */ React.createElement("p", { className: "chat-message-text" }, String(((_h = entry.payload) == null ? void 0 : _h.body) || ""))),
            (() => {
              var _a4, _b4;
              if (String(((_a4 = entry.payload) == null ? void 0 : _a4.message_kind) || "") === "REQUEST_DATA") return null;
              const messageId = String(((_b4 = entry.payload) == null ? void 0 : _b4.id) || "").trim();
              if (!messageId) return null;
              const messageFiles = attachmentsByMessageId.get(messageId) || [];
              if (!messageFiles.length) return null;
              return /* @__PURE__ */ React.createElement("div", { className: "chat-message-files" }, messageFiles.map((file) => /* @__PURE__ */ React.createElement(
                "button",
                {
                  type: "button",
                  key: String(file.id),
                  className: "chat-message-file-chip",
                  onClick: () => openAttachmentFromMessage(file),
                  title: String(file.file_name || "\u0424\u0430\u0439\u043B")
                },
                /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"),
                /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-name" }, String(file.file_name || "\u0424\u0430\u0439\u043B"))
              )));
            })(),
            /* @__PURE__ */ React.createElement("div", { className: "chat-message-time" }, fmtTimeOnly((_i = entry.payload) == null ? void 0 : _i.created_at))
          ));
        })();
      }
    ) : /* @__PURE__ */ React.createElement("li", { className: "muted chat-empty-state" }, "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u043D\u0435\u0442")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit: onSendMessage }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "field request-chat-composer-dropzone" + (dropActive ? " drag-active" : ""),
        onDragOver: (event) => {
          event.preventDefault();
          setDropActive(true);
        },
        onDragLeave: (event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          setDropActive(false);
        },
        onDrop: onDropFiles
      },
      /* @__PURE__ */ React.createElement("label", { htmlFor: idMap.messageBody }, "\u041D\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435"),
      /* @__PURE__ */ React.createElement(
        "textarea",
        {
          id: idMap.messageBody,
          placeholder: messagePlaceholder,
          value: messageDraft,
          onChange: onMessageChange,
          onFocus: () => setComposerFocused(true),
          onBlur: () => setComposerFocused(false),
          disabled: loading || fileUploading
        }
      ),
      /* @__PURE__ */ React.createElement("div", { className: "request-drop-hint muted" }, "\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0444\u0430\u0439\u043B\u044B \u0441\u044E\u0434\u0430 \u0438\u043B\u0438 \u043F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u0435 \u0441\u043A\u0440\u0435\u043F\u043A\u043E\u0439")
    ), hasPendingFiles ? /* @__PURE__ */ React.createElement("div", { className: "request-pending-files" }, pendingFiles.map((file, index) => /* @__PURE__ */ React.createElement("div", { className: "pending-file-chip", key: (file.name || "file") + "-" + String(file.lastModified || index) }, /* @__PURE__ */ React.createElement("span", { className: "pending-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"), /* @__PURE__ */ React.createElement("span", { className: "pending-file-name" }, file.name), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "pending-file-remove",
        "aria-label": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u0430\u0439\u043B " + file.name,
        onClick: () => onRemoveSelectedFile(index)
      },
      "\xD7"
    ))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn secondary btn-sm", onClick: onClearSelectedFiles }, "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u044F")) : null, /* @__PURE__ */ React.createElement("div", { className: "request-chat-composer-actions" }, canRequestData ? /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn secondary btn-sm",
        type: "button",
        onClick: openCreateDataRequestModal,
        disabled: loading || fileUploading
      },
      "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C"
    ) : null, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "icon-btn file-action-btn composer-attach-btn",
        type: "button",
        "data-tooltip": "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0444\u0430\u0439\u043B",
        "aria-label": "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0444\u0430\u0439\u043B",
        onClick: () => {
          var _a2;
          return (_a2 = fileInputRef.current) == null ? void 0 : _a2.click();
        },
        disabled: loading || fileUploading
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M8.6 13.8 15 7.4a3 3 0 0 1 4.2 4.2l-8.1 8.1a5 5 0 1 1-7.1-7.1l8.6-8.6a1 1 0 0 1 1.4 1.4l-8.6 8.6a3 3 0 1 0 4.2 4.2l8.1-8.1a1 1 0 0 0-1.4-1.4l-6.4 6.4a1 1 0 0 1-1.4-1.4z",
          fill: "currentColor"
        }
      ))
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn",
        id: idMap.sendButton,
        type: "submit",
        disabled: loading || fileUploading || !canSubmit
      },
      "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C"
    )))) : /* @__PURE__ */ React.createElement("div", { className: "request-files-tab" }, /* @__PURE__ */ React.createElement("ul", { className: "simple-list request-modal-list", id: idMap.filesList }, safeAttachments.length ? safeAttachments.map((item) => /* @__PURE__ */ React.createElement("li", { key: String(item.id) }, /* @__PURE__ */ React.createElement("div", null, item.file_name || "\u0424\u0430\u0439\u043B"), /* @__PURE__ */ React.createElement("div", { className: "muted request-modal-item-meta" }, String(item.mime_type || "application/octet-stream") + " \u2022 " + fmtBytes(item.size_bytes) + " \u2022 " + fmtDate(item.created_at)), /* @__PURE__ */ React.createElement("div", { className: "request-file-actions" }, item.download_url && detectAttachmentPreviewKind(item.file_name, item.mime_type) !== "none" ? /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "icon-btn file-action-btn",
        type: "button",
        "data-tooltip": "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440",
        onClick: () => openPreview(item),
        "aria-label": "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M12 5C6.8 5 3 9.2 2 12c1 2.8 4.8 7 10 7s9-4.2 10-7c-1-2.8-4.8-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.2A1.8 1.8 0 1 0 12 10a1.8 1.8 0 0 0 0 3.8z",
          fill: "currentColor"
        }
      ))
    ) : null, item.download_url ? /* @__PURE__ */ React.createElement(
      "a",
      {
        className: "icon-btn file-action-btn request-file-link-icon",
        "data-tooltip": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C",
        "aria-label": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C: " + String(item.file_name || "\u0444\u0430\u0439\u043B"),
        href: item.download_url,
        target: "_blank",
        rel: "noreferrer"
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M12 3a1 1 0 0 1 1 1v8.17l2.58-2.58a1 1 0 1 1 1.42 1.42l-4.3 4.3a1 1 0 0 1-1.4 0l-4.3-4.3a1 1 0 0 1 1.42-1.42L11 12.17V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z",
          fill: "currentColor"
        }
      ))
    ) : null))) : /* @__PURE__ */ React.createElement("li", { className: "muted" }, "\u0424\u0430\u0439\u043B\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442")), /* @__PURE__ */ React.createElement("div", { className: "request-files-tab-actions" }, /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439: " + String(safeMessages.length) + " \u2022 \u041E\u0431\u0449\u0438\u0439 \u0440\u0430\u0437\u043C\u0435\u0440 \u0444\u0430\u0439\u043B\u043E\u0432: " + fmtBytes(totalFilesBytes)))))), StatusLine ? /* @__PURE__ */ React.createElement(StatusLine, { status }) : null, AttachmentPreviewModal ? /* @__PURE__ */ React.createElement(
      AttachmentPreviewModal,
      {
        open: preview.open,
        title: "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0444\u0430\u0439\u043B\u0430",
        url: preview.url,
        fileName: preview.fileName,
        mimeType: preview.mimeType,
        onClose: closePreview
      }
    ) : null, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (clientDataModal.open ? " open" : ""),
        onClick: closeClientDataModal,
        "aria-hidden": clientDataModal.open ? "false" : "true",
        id: idMap.dataRequestOverlay
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-data-summary-modal data-request-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0417\u0430\u043F\u0440\u043E\u0441 \u0434\u0430\u043D\u043D\u044B\u0445"), /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443 \u044E\u0440\u0438\u0441\u0442\u0430")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: closeClientDataModal, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit: submitClientDataModal }, /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-list", id: idMap.dataRequestItems }, clientDataModal.loading ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...") : (clientDataModal.items || []).length ? (clientDataModal.items || []).map((item, index) => {
        const fieldType = String((item == null ? void 0 : item.field_type) || "string").toLowerCase();
        const fileMeta = item == null ? void 0 : item.value_file;
        return /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-row", key: String(item.localId || index) }, /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-label" }, String(index + 1) + ". " + String((item == null ? void 0 : item.label) || (item == null ? void 0 : item.key) || "\u041F\u043E\u043B\u0435")), /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-value" }, fieldType === "text" ? /* @__PURE__ */ React.createElement(
          "textarea",
          {
            value: String((item == null ? void 0 : item.value_text) || ""),
            onChange: (event) => updateClientDataItem(item.localId, { value_text: event.target.value }),
            rows: 3,
            disabled: clientDataModal.saving || clientDataModal.loading
          }
        ) : fieldType === "date" ? /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "date",
            value: String((item == null ? void 0 : item.value_text) || "").slice(0, 10),
            onChange: (event) => updateClientDataItem(item.localId, { value_text: event.target.value }),
            disabled: clientDataModal.saving || clientDataModal.loading
          }
        ) : fieldType === "number" ? /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "number",
            step: "any",
            value: String((item == null ? void 0 : item.value_text) || ""),
            onChange: (event) => updateClientDataItem(item.localId, { value_text: event.target.value }),
            disabled: clientDataModal.saving || clientDataModal.loading
          }
        ) : fieldType === "file" ? /* @__PURE__ */ React.createElement("div", { className: "stack" }, fileMeta && fileMeta.download_url ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "chat-message-file-chip",
            onClick: () => openAttachmentFromMessage(fileMeta)
          },
          /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"),
          /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-name" }, String(fileMeta.file_name || "\u0424\u0430\u0439\u043B"))
        ) : null, /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "file",
            onChange: (event) => updateClientDataItem(item.localId, {
              pendingFile: event.target.files && event.target.files[0] ? event.target.files[0] : null
            }),
            disabled: clientDataModal.saving || clientDataModal.loading
          }
        ), (item == null ? void 0 : item.pendingFile) ? /* @__PURE__ */ React.createElement("span", { className: "muted" }, String(item.pendingFile.name || "")) : null) : /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            value: String((item == null ? void 0 : item.value_text) || ""),
            onChange: (event) => updateClientDataItem(item.localId, { value_text: event.target.value }),
            disabled: clientDataModal.saving || clientDataModal.loading
          }
        )));
      }) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u041D\u0435\u0442 \u043F\u043E\u043B\u0435\u0439 \u0434\u043B\u044F \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F.")), clientDataModal.error ? /* @__PURE__ */ React.createElement("div", { className: "status error" }, clientDataModal.error) : null, /* @__PURE__ */ React.createElement("div", { className: "request-data-status" + (clientDataModal.status ? " ok" : ""), id: idMap.dataRequestStatus }, clientDataModal.status || ""), /* @__PURE__ */ React.createElement("div", { className: "modal-actions modal-actions-right" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "submit",
          className: "btn btn-sm request-data-submit-btn",
          id: idMap.dataRequestSave,
          disabled: clientDataModal.loading || clientDataModal.saving
        },
        clientDataModal.saving ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." : "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"
      ))))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (statusChangeModal.open ? " open" : ""),
        onClick: closeStatusChangeModal,
        "aria-hidden": statusChangeModal.open ? "false" : "true"
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-status-change-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0421\u043C\u0435\u043D\u0430 \u0441\u0442\u0430\u0442\u0443\u0441\u0430"), /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0442\u0430\u0442\u0443\u0441 \u0438 \u0432\u0430\u0436\u043D\u0443\u044E \u0434\u0430\u0442\u0443")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: closeStatusChangeModal, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement(
        "input",
        {
          ref: statusChangeFileInputRef,
          type: "file",
          multiple: true,
          onChange: (event) => {
            appendStatusChangeFiles(Array.from(event.target && event.target.files || []));
            event.target.value = "";
          },
          style: { position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none" }
        }
      ), /* @__PURE__ */ React.createElement("form", { className: "stack", onSubmit: submitStatusChange }, /* @__PURE__ */ React.createElement("div", { className: "request-status-change-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "status-change-next-status" }, "\u041D\u043E\u0432\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441"), /* @__PURE__ */ React.createElement(
        "select",
        {
          id: "status-change-next-status",
          value: statusChangeModal.statusCode,
          onChange: (event) => setStatusChangeModal((prev) => ({ ...prev, statusCode: event.target.value, error: "" })),
          disabled: statusChangeModal.saving || loading
        },
        /* @__PURE__ */ React.createElement("option", { value: "" }, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0442\u0430\u0442\u0443\u0441"),
        statusOptions.filter((item) => item.code !== String((row == null ? void 0 : row.status_code) || "").trim()).filter(
          (item) => Array.isArray(statusChangeModal.allowedStatusCodes) && statusChangeModal.allowedStatusCodes.length ? statusChangeModal.allowedStatusCodes.includes(item.code) : true
        ).map((item) => /* @__PURE__ */ React.createElement("option", { key: item.code, value: item.code }, item.name + (item.groupName ? " \u2022 " + item.groupName : "")))
      )), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "status-change-important-date" }, "\u0412\u0430\u0436\u043D\u0430\u044F \u0434\u0430\u0442\u0430 (\u0434\u0435\u0434\u043B\u0430\u0439\u043D)"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "status-change-important-date",
          type: "datetime-local",
          value: statusChangeModal.importantDateAt,
          onChange: (event) => setStatusChangeModal((prev) => ({ ...prev, importantDateAt: event.target.value, error: "" })),
          disabled: statusChangeModal.saving || loading
        }
      ))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "status-change-comment" }, "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043A \u0441\u043C\u0435\u043D\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u0430"), /* @__PURE__ */ React.createElement(
        "textarea",
        {
          id: "status-change-comment",
          placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u0431\u0443\u0434\u0435\u0442 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D \u0432 \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0438 \u0447\u0430\u0442 (\u0435\u0441\u043B\u0438 \u0443\u043A\u0430\u0437\u0430\u043D)",
          value: statusChangeModal.comment,
          onChange: (event) => setStatusChangeModal((prev) => ({ ...prev, comment: event.target.value })),
          disabled: statusChangeModal.saving || loading
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "request-status-change-files" }, /* @__PURE__ */ React.createElement("div", { className: "request-status-change-files-head" }, /* @__PURE__ */ React.createElement("b", null, "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u044F"), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn file-action-btn",
          "data-tooltip": "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B",
          onClick: () => {
            var _a2;
            return (_a2 = statusChangeFileInputRef.current) == null ? void 0 : _a2.click();
          },
          disabled: statusChangeModal.saving || loading
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
          "path",
          {
            d: "M8.6 13.8 15 7.4a3 3 0 0 1 4.2 4.2l-8.1 8.1a5 5 0 1 1-7.1-7.1l8.6-8.6a1 1 0 0 1 1.4 1.4l-8.6 8.6a3 3 0 1 0 4.2 4.2l8.1-8.1a1 1 0 0 0-1.4-1.4l-6.4 6.4a1 1 0 0 1-1.4-1.4z",
            fill: "currentColor"
          }
        ))
      )), Array.isArray(statusChangeModal.files) && statusChangeModal.files.length ? /* @__PURE__ */ React.createElement("div", { className: "request-pending-files" }, statusChangeModal.files.map((file, index) => /* @__PURE__ */ React.createElement("div", { className: "pending-file-chip", key: (file.name || "file") + "-" + String(file.lastModified || index) }, /* @__PURE__ */ React.createElement("span", { className: "pending-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"), /* @__PURE__ */ React.createElement("span", { className: "pending-file-name" }, file.name), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "pending-file-remove",
          "aria-label": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0444\u0430\u0439\u043B " + file.name,
          onClick: () => removeStatusChangeFile(index)
        },
        "\xD7"
      )))) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0424\u0430\u0439\u043B\u044B \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B")), /* @__PURE__ */ React.createElement("div", { className: "request-status-history-block" }, /* @__PURE__ */ React.createElement("div", { className: "request-status-history-head" }, /* @__PURE__ */ React.createElement("b", null, "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432"), /* @__PURE__ */ React.createElement("span", { className: "muted" }, safeStatusHistory.length ? String(safeStatusHistory.length) + " \u0437\u0430\u043F\u0438\u0441\u0435\u0439" : "\u041D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439")), /* @__PURE__ */ React.createElement("ol", { className: "request-route-list request-status-history-list" }, safeStatusHistory.length ? safeStatusHistory.map((item, index) => {
        const statusCode = String((item == null ? void 0 : item.to_status) || "");
        const statusMeta = statusByCode.get(statusCode);
        const itemClass = "route-item request-status-history-route-item " + (index === 0 ? "current" : "completed");
        return /* @__PURE__ */ React.createElement("li", { key: String((item == null ? void 0 : item.id) || index), className: itemClass }, /* @__PURE__ */ React.createElement("span", { className: "route-dot" }), /* @__PURE__ */ React.createElement("div", { className: "route-body" }, /* @__PURE__ */ React.createElement("div", { className: "request-status-history-row" }, /* @__PURE__ */ React.createElement("b", null, resolveStatusDisplayName(statusCode, (item == null ? void 0 : item.to_status_name) || (statusMeta == null ? void 0 : statusMeta.name) || "")), (statusMeta == null ? void 0 : statusMeta.isTerminal) ? /* @__PURE__ */ React.createElement("span", { className: "request-status-history-chip" }, "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439") : null), /* @__PURE__ */ React.createElement("div", { className: "muted route-time" }, fmtShortDateTime(item == null ? void 0 : item.changed_at)), /* @__PURE__ */ React.createElement("div", { className: "request-status-history-meta" }, /* @__PURE__ */ React.createElement("span", null, "\u0412\u0430\u0436\u043D\u0430\u044F \u0434\u0430\u0442\u0430: " + fmtShortDateTime(item == null ? void 0 : item.important_date_at)), /* @__PURE__ */ React.createElement("span", null, "\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C: " + formatDuration(item == null ? void 0 : item.duration_seconds))), (item == null ? void 0 : item.from_status) ? /* @__PURE__ */ React.createElement("div", { className: "request-status-history-meta" }, /* @__PURE__ */ React.createElement("span", null, "\u0418\u0437: " + resolveStatusDisplayName(item.from_status, ""))) : null, String((item == null ? void 0 : item.comment) || "").trim() ? /* @__PURE__ */ React.createElement("div", { className: "request-status-history-comment" }, String(item.comment)) : null));
      }) : /* @__PURE__ */ React.createElement("li", { className: "muted" }, "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432 \u043F\u043E\u043A\u0430 \u043F\u0443\u0441\u0442\u0430\u044F"))), statusChangeModal.error ? /* @__PURE__ */ React.createElement("div", { className: "status error" }, statusChangeModal.error) : null, /* @__PURE__ */ React.createElement("div", { className: "modal-actions modal-actions-right" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "submit",
          className: "btn btn-sm request-data-submit-btn",
          disabled: statusChangeModal.saving || loading
        },
        statusChangeModal.saving ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." : "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C"
      ))))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (financeOpen ? " open" : ""),
        onClick: closeFinanceModal,
        "aria-hidden": financeOpen ? "false" : "true"
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-finance-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0424\u0438\u043D\u0430\u043D\u0441\u044B \u0437\u0430\u044F\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: closeFinanceModal, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "request-card-grid request-finance-grid" }, /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtAmount((_a = finance == null ? void 0 : finance.request_cost) != null ? _a : row == null ? void 0 : row.request_cost))), /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtAmount(finance == null ? void 0 : finance.paid_total))), /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0414\u0430\u0442\u0430 \u043E\u043F\u043B\u0430\u0442\u044B"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtShortDateTime((_b = finance == null ? void 0 : finance.last_paid_at) != null ? _b : row == null ? void 0 : row.paid_at))), canSeeRate ? /* @__PURE__ */ React.createElement("div", { className: "request-field" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0421\u0442\u0430\u0432\u043A\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtAmount((_c = finance == null ? void 0 : finance.effective_rate) != null ? _c : row == null ? void 0 : row.effective_rate))) : null), typeof onIssueInvoice === "function" ? /* @__PURE__ */ React.createElement("div", { className: "request-finance-actions" }, !financeIssueForm.open ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "btn btn-sm",
          onClick: openFinanceIssueForm,
          disabled: loading || !row
        },
        "\u0412\u044B\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u0447\u0435\u0442"
      ) : /* @__PURE__ */ React.createElement("form", { className: "stack request-finance-issue-form", onSubmit: submitFinanceIssueForm }, /* @__PURE__ */ React.createElement("div", { className: "request-finance-issue-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "request-finance-invoice-amount" }, "\u0421\u0443\u043C\u043C\u0430"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "request-finance-invoice-amount",
          type: "number",
          min: "0.01",
          step: "0.01",
          value: financeIssueForm.amount,
          onChange: (event) => setFinanceIssueForm((prev) => ({ ...prev, amount: event.target.value, error: "" })),
          disabled: financeIssueForm.saving || loading,
          placeholder: "0.00"
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "request-finance-invoice-payer" }, "\u041F\u043B\u0430\u0442\u0435\u043B\u044C\u0449\u0438\u043A"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "request-finance-invoice-payer",
          type: "text",
          value: financeIssueForm.payerDisplayName,
          onChange: (event) => setFinanceIssueForm((prev) => ({ ...prev, payerDisplayName: event.target.value, error: "" })),
          disabled: financeIssueForm.saving || loading,
          placeholder: "\u0424\u0418\u041E / \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F"
        }
      ))), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "request-finance-invoice-service" }, "\u0423\u0441\u043B\u0443\u0433\u0430"), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "request-finance-invoice-service",
          type: "text",
          value: financeIssueForm.serviceDescription,
          onChange: (event) => setFinanceIssueForm((prev) => ({ ...prev, serviceDescription: event.target.value, error: "" })),
          disabled: financeIssueForm.saving || loading,
          placeholder: "\u042E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0443\u0441\u043B\u0443\u0433\u0438"
        }
      )), financeIssueForm.error ? /* @__PURE__ */ React.createElement("div", { className: "status error" }, financeIssueForm.error) : null, /* @__PURE__ */ React.createElement("div", { className: "modal-actions modal-actions-right request-finance-actions-inline" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn secondary btn-sm", onClick: closeFinanceIssueForm, disabled: financeIssueForm.saving }, "\u041E\u0442\u043C\u0435\u043D\u0430"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn btn-sm", disabled: financeIssueForm.saving || loading }, financeIssueForm.saving ? "\u0412\u044B\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435..." : "\u0412\u044B\u0441\u0442\u0430\u0432\u0438\u0442\u044C")))) : null, /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoices" }, /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoices-head" }, /* @__PURE__ */ React.createElement("h4", null, "\u0421\u0447\u0435\u0442\u0430"), /* @__PURE__ */ React.createElement("span", { className: "muted" }, safeInvoices.length ? String(safeInvoices.length) + " \u0448\u0442." : "\u041D\u0435\u0442 \u0432\u044B\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0445 \u0441\u0447\u0435\u0442\u043E\u0432")), safeInvoices.length ? /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoice-list" }, safeInvoices.map((item) => /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoice-row", key: String((item == null ? void 0 : item.id) || (item == null ? void 0 : item.invoice_number) || (item == null ? void 0 : item.issued_at) || "-") }, /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoice-meta" }, /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoice-number" }, /* @__PURE__ */ React.createElement("code", null, String((item == null ? void 0 : item.invoice_number) || "-"))), /* @__PURE__ */ React.createElement("div", { className: "request-finance-invoice-details" }, /* @__PURE__ */ React.createElement("span", null, invoiceStatusLabel(item == null ? void 0 : item.status)), /* @__PURE__ */ React.createElement("span", null, fmtAmount(item == null ? void 0 : item.amount) + " " + String((item == null ? void 0 : item.currency) || "RUB")), /* @__PURE__ */ React.createElement("span", null, "\u0421\u043E\u0437\u0434\u0430\u043D: " + fmtDate(item == null ? void 0 : item.issued_at)), /* @__PURE__ */ React.createElement("span", null, "\u041E\u043F\u043B\u0430\u0447\u0435\u043D: " + fmtDate(item == null ? void 0 : item.paid_at)))), typeof onDownloadInvoicePdf === "function" ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn request-finance-invoice-download-btn",
          onClick: () => onDownloadInvoicePdf(item),
          disabled: loading,
          "aria-label": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0441\u0447\u0435\u0442 PDF",
          "data-tooltip": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C PDF"
        },
        "\u2B07"
      ) : null))) : /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-empty" }, "\u0421\u0447\u0435\u0442\u0430 \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435 \u0432\u044B\u0441\u0442\u0430\u0432\u043B\u044F\u043B\u0438\u0441\u044C")))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (descriptionOpen ? " open" : ""),
        onClick: () => setDescriptionOpen(false),
        "aria-hidden": descriptionOpen ? "false" : "true"
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-description-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "\u0417\u0430\u044F\u0432\u043A\u0430"), /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-headline" }, /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, String((row == null ? void 0 : row.topic_name) || (row == null ? void 0 : row.topic_code) || "\u0422\u0435\u043C\u0430 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430")), /* @__PURE__ */ React.createElement("span", { className: "request-description-status-chip" }, currentStatusName))), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: () => setDescriptionOpen(false), "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-body" }, /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-main" }, /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-title" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u044B")), /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-text" }, (row == null ? void 0 : row.description) ? String(row.description) : "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E")), /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-meta-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "request-description-modal-meta" }, /* @__PURE__ */ React.createElement("div", { className: "request-description-meta-item" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u041A\u043B\u0438\u0435\u043D\u0442"), /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "request-field-value" + (clientHasPhone ? " has-tooltip request-contact-value" : ""),
          "data-tooltip": clientHasPhone ? clientPhone : void 0
        },
        clientLabel
      )), /* @__PURE__ */ React.createElement("div", { className: "request-description-meta-item align-right" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u042E\u0440\u0438\u0441\u0442"), /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "request-field-value" + (lawyerHasPhone ? " has-tooltip request-contact-value" : ""),
          "data-tooltip": lawyerHasPhone ? lawyerPhone : void 0
        },
        lawyerLabel
      )), /* @__PURE__ */ React.createElement("div", { className: "request-description-meta-item" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0421\u043E\u0437\u0434\u0430\u043D\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtShortDateTime(row == null ? void 0 : row.created_at))), /* @__PURE__ */ React.createElement("div", { className: "request-description-meta-item align-right" }, /* @__PURE__ */ React.createElement("span", { className: "request-field-label" }, "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0430"), /* @__PURE__ */ React.createElement("span", { className: "request-field-value" }, fmtShortDateTime(row == null ? void 0 : row.updated_at)))))))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (dataRequestModal.open ? " open" : ""),
        onClick: closeDataRequestModal,
        "aria-hidden": dataRequestModal.open ? "false" : "true"
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-data-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, dataRequestModal.messageId ? "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u0434\u0430\u043D\u043D\u044B\u0445" : "\u0417\u0430\u043F\u0440\u043E\u0441 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445"), /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u043B\u044F \u0434\u043B\u044F \u0437\u0430\u043F\u0440\u043E\u0441\u0430")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: closeDataRequestModal, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "stack" }, /* @__PURE__ */ React.createElement("div", { className: "request-data-modal-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "request-data-request-template-select" }, "\u0428\u0430\u0431\u043B\u043E\u043D \u0437\u0430\u043F\u0440\u043E\u0441\u0430 (\u043F\u043E\u0438\u0441\u043A)"), /* @__PURE__ */ React.createElement("div", { className: "request-data-combobox" }, /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "request-data-request-template-select",
          value: dataRequestModal.requestTemplateQuery,
          onChange: (event) => setDataRequestModal((prev) => ({
            ...prev,
            requestTemplateQuery: event.target.value,
            selectedRequestTemplateId: "",
            templateStatus: "",
            error: ""
          })),
          onFocus: () => setRequestTemplateSuggestOpen(true),
          onBlur: () => window.setTimeout(() => setRequestTemplateSuggestOpen(false), 120),
          disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate,
          placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u0430"
        }
      ), requestTemplateBadge ? /* @__PURE__ */ React.createElement("span", { className: "request-data-template-badge " + requestTemplateBadge.kind }, requestTemplateBadge.label) : null, requestTemplateSuggestOpen && filteredRequestTemplates.length ? /* @__PURE__ */ React.createElement("div", { className: "request-data-suggest-list", role: "listbox", "aria-label": "\u0428\u0430\u0431\u043B\u043E\u043D\u044B \u0437\u0430\u043F\u0440\u043E\u0441\u0430" }, filteredRequestTemplates.map((tpl) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: String(tpl.id),
          type: "button",
          className: "request-data-suggest-item",
          onMouseDown: (event) => {
            event.preventDefault();
            setDataRequestModal((prev) => ({
              ...prev,
              requestTemplateQuery: String(tpl.name || ""),
              selectedRequestTemplateId: String(tpl.id || ""),
              error: "",
              templateStatus: ""
            }));
            setRequestTemplateSuggestOpen(false);
            void applyRequestTemplateById(String(tpl.id || ""), String(tpl.name || ""));
          }
        },
        /* @__PURE__ */ React.createElement("span", null, String(tpl.name || "\u0428\u0430\u0431\u043B\u043E\u043D"))
      ))) : null)), /* @__PURE__ */ React.createElement("div", { className: "request-data-modal-actions-inline" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn",
          "data-tooltip": !canSaveSelectedRequestTemplate ? "\u0427\u0443\u0436\u043E\u0439 \u0448\u0430\u0431\u043B\u043E\u043D \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0434\u043B\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F" : requestTemplateActionMode === "save" ? "\u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D" : requestTemplateActionMode === "create" ? "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D" : "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u0430",
          onClick: saveCurrentDataRequestTemplate,
          disabled: !canSaveSelectedRequestTemplate || dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate
        },
        dataRequestModal.savingTemplate ? "\u2026" : requestTemplateActionMode === "create" ? "\u271A" : "\u{1F4BE}"
      ))), dataRequestModal.templateStatus ? /* @__PURE__ */ React.createElement("div", { className: "status ok" }, dataRequestModal.templateStatus) : null, canRequestData && dataRequestModal.messageId ? /* @__PURE__ */ React.createElement("div", { className: "request-data-progress-line" }, /* @__PURE__ */ React.createElement("span", { className: "request-data-progress-chip" }, "\u0417\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u043C: " + String(dataRequestProgress.filled) + " / " + String(dataRequestProgress.total))) : null, /* @__PURE__ */ React.createElement("div", { className: "request-data-modal-grid" }, /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "request-data-template-select" }, "\u041F\u043E\u043B\u0435 \u0434\u0430\u043D\u043D\u044B\u0445 (\u043F\u043E\u0438\u0441\u043A \u043F\u043E \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A\u0443)"), /* @__PURE__ */ React.createElement("div", { className: "request-data-combobox" }, /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "request-data-template-select",
          value: dataRequestModal.catalogFieldQuery,
          onChange: (event) => setDataRequestModal((prev) => ({
            ...prev,
            catalogFieldQuery: event.target.value,
            selectedCatalogTemplateId: "",
            templateStatus: "",
            error: ""
          })),
          onFocus: () => setCatalogFieldSuggestOpen(true),
          onBlur: () => window.setTimeout(() => setCatalogFieldSuggestOpen(false), 120),
          disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate,
          placeholder: "\u041D\u0430\u0447\u043D\u0438\u0442\u0435 \u0432\u0432\u043E\u0434\u0438\u0442\u044C \u043D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u043B\u044F",
          autoComplete: "off"
        }
      ), catalogFieldSuggestOpen && filteredCatalogFields.length ? /* @__PURE__ */ React.createElement("div", { className: "request-data-suggest-list", role: "listbox", "aria-label": "\u041F\u043E\u043B\u044F \u0434\u0430\u043D\u043D\u044B\u0445" }, filteredCatalogFields.map((tpl) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: String(tpl.id),
          type: "button",
          className: "request-data-suggest-item",
          onMouseDown: (event) => {
            event.preventDefault();
            setDataRequestModal((prev) => ({
              ...prev,
              catalogFieldQuery: String(tpl.label || tpl.key || ""),
              selectedCatalogTemplateId: String(tpl.id || ""),
              error: "",
              templateStatus: ""
            }));
            setCatalogFieldSuggestOpen(false);
          }
        },
        /* @__PURE__ */ React.createElement("span", null, String(tpl.label || tpl.key)),
        /* @__PURE__ */ React.createElement("small", null, String(tpl.value_type || "string"))
      ))) : null)), /* @__PURE__ */ React.createElement("div", { className: "request-data-modal-actions-inline" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "icon-btn",
          "data-tooltip": catalogFieldActionMode === "add" ? "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043E\u043B\u0435 \u0438\u0437 \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A\u0430" : "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043D\u043E\u0432\u043E\u0435 \u043F\u043E\u043B\u0435",
          onClick: addSelectedTemplateRow,
          disabled: !String(dataRequestModal.catalogFieldQuery || "").trim() && !selectedCatalogFieldCandidate || dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate
        },
        catalogFieldActionMode === "add" ? "+" : "\u271A"
      ))), /* @__PURE__ */ React.createElement("div", { className: "request-data-rows" }, (dataRequestModal.rows || []).length ? (dataRequestModal.rows || []).map((rowItem, idx) => /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "request-data-row" + (String(draggedRequestRowId) === String(rowItem.localId) ? " dragging" : "") + (String(dragOverRequestRowId) === String(rowItem.localId) && String(draggedRequestRowId) !== String(rowItem.localId) ? " drag-over" : "") + (viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled) ? " row-locked" : ""),
          key: rowItem.localId,
          onDragOver: (event) => {
            if (!draggedRequestRowId) return;
            event.preventDefault();
            if (viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)) return;
            setDragOverRequestRowId(String(rowItem.localId || ""));
          },
          onDrop: (event) => {
            if (!draggedRequestRowId) return;
            event.preventDefault();
            if (viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)) return;
            moveDataRequestRowToIndex(draggedRequestRowId, idx);
            handleRequestRowDragEnd();
          }
        },
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "icon-btn request-data-row-index-handle",
            "data-tooltip": viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled) ? "\u0417\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u043E\u0435 \u043F\u043E\u043B\u0435: \u043F\u0435\u0440\u0435\u043C\u0435\u0449\u0435\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E" : "\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0434\u043B\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u043E\u0440\u044F\u0434\u043A\u0430",
            draggable: !(viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)),
            onDragStart: (event) => handleRequestRowDragStart(event, rowItem, viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)),
            onDragEnd: handleRequestRowDragEnd,
            disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate || viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled),
            "aria-label": "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u043F\u043E\u043B\u044F " + String(idx + 1)
          },
          /* @__PURE__ */ React.createElement("span", null, idx + 1)
        ),
        /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "\u041D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435"), /* @__PURE__ */ React.createElement(
          "input",
          {
            value: rowItem.label,
            onChange: (event) => updateDataRequestRow(rowItem.localId, { label: event.target.value }),
            disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate || viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)
          }
        )),
        /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", null, "\u0422\u0438\u043F"), /* @__PURE__ */ React.createElement(
          "select",
          {
            value: rowItem.field_type || "string",
            onChange: (event) => updateDataRequestRow(rowItem.localId, { field_type: event.target.value }),
            disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate || viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)
          },
          requestDataTypeOptions.map((option) => /* @__PURE__ */ React.createElement("option", { key: option.value, value: option.value }, option.label))
        )),
        /* @__PURE__ */ React.createElement("div", { className: "request-data-row-controls" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "icon-btn danger request-data-row-action-btn",
            "data-tooltip": viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled) ? "\u042E\u0440\u0438\u0441\u0442 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u043E\u0435 \u043F\u043E\u043B\u0435" : "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u043B\u0435",
            onClick: () => removeDataRequestRow(rowItem.localId),
            disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate || viewerRoleCode === "LAWYER" && (rowItem == null ? void 0 : rowItem.is_filled)
          },
          "\xD7"
        )),
        canRequestData && ((rowItem == null ? void 0 : rowItem.is_filled) || String((rowItem == null ? void 0 : rowItem.value_text) || "").trim()) ? /* @__PURE__ */ React.createElement("div", { className: "request-data-row-client-value" }, /* @__PURE__ */ React.createElement("span", { className: "request-data-row-client-label" }, "\u0417\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u043C:"), String((rowItem == null ? void 0 : rowItem.field_type) || "").toLowerCase() === "file" ? (rowItem == null ? void 0 : rowItem.value_file) && rowItem.value_file.download_url ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "chat-message-file-chip",
            onClick: () => openAttachmentFromMessage(rowItem.value_file)
          },
          /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"),
          /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-name" }, String(rowItem.value_file.file_name || "\u0424\u0430\u0439\u043B"))
        ) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u0424\u0430\u0439\u043B \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D") : /* @__PURE__ */ React.createElement("span", { className: "request-data-row-client-text" }, String((rowItem == null ? void 0 : rowItem.field_type) || "").toLowerCase() === "date" ? fmtDateOnly(rowItem == null ? void 0 : rowItem.value_text) : String((rowItem == null ? void 0 : rowItem.value_text) || "").trim().slice(0, 140))) : null
      )) : /* @__PURE__ */ React.createElement("div", { className: "muted" }, "\u041F\u043E\u043B\u044F \u0434\u043B\u044F \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u0435\u0449\u0435 \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B"))), dataRequestModal.error ? /* @__PURE__ */ React.createElement("div", { className: "status error" }, dataRequestModal.error) : null, /* @__PURE__ */ React.createElement("div", { className: "modal-actions modal-actions-right" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "btn btn-sm request-data-submit-btn",
          onClick: submitDataRequestModal,
          disabled: dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate
        },
        dataRequestModal.saving ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." : "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C"
      )))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "overlay" + (requestDataListOpen ? " open" : ""),
        onClick: () => setRequestDataListOpen(false),
        "aria-hidden": requestDataListOpen ? "false" : "true"
      },
      /* @__PURE__ */ React.createElement("div", { className: "modal request-data-summary-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0414\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u044F\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted request-finance-subtitle" }, (row == null ? void 0 : row.track_number) ? "\u0417\u0430\u044F\u0432\u043A\u0430 " + String(row.track_number) : "")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: () => setRequestDataListOpen(false), "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-list" }, requestDataListItems.length ? requestDataListItems.map((item) => {
        const value = formatRequestDataValue(item);
        const isFile = String((item == null ? void 0 : item.field_type) || "").toLowerCase() === "file";
        return /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-row", key: String(item.id || item.key) }, /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-label" }, String(item.label || humanizeKey(item.key))), /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-value" }, isFile ? value && typeof value === "object" ? /* @__PURE__ */ React.createElement("div", { className: "request-data-summary-file" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "chat-message-file-chip", onClick: () => downloadAttachment(value) }, /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-icon", "aria-hidden": "true" }, "\u{1F4CE}"), /* @__PURE__ */ React.createElement("span", { className: "chat-message-file-name" }, String(value.file_name || "\u0424\u0430\u0439\u043B")))) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E") : String(value || "\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E")));
      }) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442")))
    ));
  }

  // app/web/admin/shared/state.js
  function createRequestModalState() {
    return {
      loading: false,
      requestId: null,
      trackNumber: "",
      requestData: null,
      financeSummary: null,
      invoices: [],
      statusRouteNodes: [],
      statusHistory: [],
      availableStatuses: [],
      currentImportantDateAt: "",
      pendingStatusChangePreset: null,
      messages: [],
      attachments: [],
      messageDraft: "",
      selectedFiles: [],
      fileUploading: false
    };
  }

  // app/web/client.jsx
  (function() {
    const { useCallback, useEffect, useMemo, useRef, useState } = React;
    function StatusLine({ status }) {
      return /* @__PURE__ */ React.createElement("p", { className: "status" + ((status == null ? void 0 : status.kind) ? " " + status.kind : "") }, (status == null ? void 0 : status.message) || "");
    }
    function Overlay({ open, id, onClose, children }) {
      return /* @__PURE__ */ React.createElement("div", { className: "overlay" + (open ? " open" : ""), id, onClick: onClose }, children);
    }
    function GlobalTooltipLayer() {
      const [tooltip, setTooltip] = useState({ open: false, text: "", x: 0, y: 0, maxWidth: 320 });
      const activeRef = useRef(null);
      useEffect(() => {
        const getTarget = (node) => {
          if (!(node instanceof Element)) return null;
          const el = node.closest("[data-tooltip]");
          if (!el) return null;
          const text = String(el.getAttribute("data-tooltip") || "").trim();
          return text ? el : null;
        };
        const reposition = (el) => {
          if (!(el instanceof Element)) return;
          const text = String(el.getAttribute("data-tooltip") || "").trim();
          if (!text) return;
          const rect = el.getBoundingClientRect();
          const vw = window.innerWidth || 0;
          const maxWidth = Math.min(360, Math.max(140, vw - 24));
          const approxWidth = Math.min(maxWidth, Math.max(80, text.length * 7.1 + 22));
          const centerX = rect.left + rect.width / 2;
          const x = Math.max(12 + approxWidth / 2, Math.min(vw - 12 - approxWidth / 2, centerX));
          const y = Math.max(8, rect.top - 8);
          setTooltip({ open: true, text, x, y, maxWidth });
        };
        const open = (node) => {
          const target = getTarget(node);
          if (!target) return;
          activeRef.current = target;
          reposition(target);
        };
        const closeIfNeeded = (related) => {
          const current = activeRef.current;
          if (!current) return;
          if (related instanceof Element) {
            if (related === current || current.contains(related)) return;
            const nextTarget = getTarget(related);
            if (nextTarget === current) return;
          }
          activeRef.current = null;
          setTooltip((prev) => ({ ...prev, open: false }));
        };
        const onMouseOver = (event) => open(event.target);
        const onFocusIn = (event) => open(event.target);
        const onMouseOut = (event) => closeIfNeeded(event.relatedTarget);
        const onFocusOut = (event) => closeIfNeeded(event.relatedTarget);
        const onUpdatePosition = () => {
          if (activeRef.current) reposition(activeRef.current);
        };
        document.addEventListener("mouseover", onMouseOver, true);
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("mouseout", onMouseOut, true);
        document.addEventListener("focusout", onFocusOut, true);
        window.addEventListener("scroll", onUpdatePosition, true);
        window.addEventListener("resize", onUpdatePosition);
        return () => {
          document.removeEventListener("mouseover", onMouseOver, true);
          document.removeEventListener("focusin", onFocusIn, true);
          document.removeEventListener("mouseout", onMouseOut, true);
          document.removeEventListener("focusout", onFocusOut, true);
          window.removeEventListener("scroll", onUpdatePosition, true);
          window.removeEventListener("resize", onUpdatePosition);
        };
      }, []);
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "global-tooltip-layer" + (tooltip.open ? " open" : ""),
          style: { left: tooltip.x + "px", top: tooltip.y + "px", maxWidth: tooltip.maxWidth + "px" },
          role: "tooltip",
          "aria-hidden": tooltip.open ? "false" : "true"
        },
        tooltip.text
      );
    }
    function AttachmentPreviewModal({ open, title, url, fileName, mimeType, onClose }) {
      const [resolvedUrl, setResolvedUrl] = useState("");
      const [resolvedText, setResolvedText] = useState("");
      const [resolvedKind, setResolvedKind] = useState("");
      const [hint, setHint] = useState("");
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");
      const decodeTextPreview = (arrayBuffer) => {
        const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
        const sampleLength = Math.min(bytes.length, 4096);
        let suspicious = 0;
        for (let i = 0; i < sampleLength; i += 1) {
          const byte = bytes[i];
          if (byte === 0) suspicious += 4;
          else if (byte < 9 || byte > 13 && byte < 32) suspicious += 1;
        }
        if (sampleLength && suspicious / sampleLength > 0.08) return null;
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "");
        return text.length > 2e5 ? text.slice(0, 2e5) + "\n\n[\u0422\u0435\u043A\u0441\u0442 \u043E\u0431\u0440\u0435\u0437\u0430\u043D \u0434\u043B\u044F \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430]" : text;
      };
      useEffect(() => {
        if (!open || !url) {
          setResolvedUrl("");
          setResolvedText("");
          setResolvedKind("");
          setHint("");
          setLoading(false);
          setError("");
          return;
        }
        const kind2 = detectAttachmentPreviewKind(fileName, mimeType);
        setResolvedKind(kind2);
        setResolvedText("");
        setHint("");
        if (kind2 === "none") {
          setResolvedUrl("");
          setLoading(false);
          setError("");
          return;
        }
        let cancelled = false;
        let objectUrl = "";
        setLoading(true);
        setError("");
        setResolvedUrl("");
        (async () => {
          try {
            const response = await fetch(url, { credentials: "same-origin" });
            if (!response.ok) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B \u0434\u043B\u044F \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430");
            const buffer = await response.arrayBuffer();
            if (cancelled) return;
            if (kind2 === "pdf") {
              const header = new Uint8Array(buffer.slice(0, 5));
              const isPdf = header.length >= 5 && header[0] === 37 && header[1] === 80 && header[2] === 68 && header[3] === 70 && header[4] === 45;
              if (isPdf) {
                setResolvedUrl(String(url));
                setResolvedKind("pdf");
                setLoading(false);
                return;
              }
              const textPreview = decodeTextPreview(buffer);
              if (textPreview != null) {
                setResolvedUrl("");
                setResolvedText(textPreview);
                setResolvedKind("text");
                setHint("\u0424\u0430\u0439\u043B \u043F\u043E\u043C\u0435\u0447\u0435\u043D \u043A\u0430\u043A PDF, \u043D\u043E \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432\u0430\u043B\u0438\u0434\u043D\u044B\u043C PDF. \u041F\u043E\u043A\u0430\u0437\u0430\u043D \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0439 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440.");
                setLoading(false);
                return;
              }
              throw new Error("\u0424\u0430\u0439\u043B \u043F\u043E\u043C\u0435\u0447\u0435\u043D \u043A\u0430\u043A PDF, \u043D\u043E \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432\u0430\u043B\u0438\u0434\u043D\u044B\u043C PDF-\u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u043C.");
            }
            if (kind2 === "text") {
              const textPreview = decodeTextPreview(buffer);
              if (textPreview == null) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0442\u044C \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0439 \u0444\u0430\u0439\u043B \u0434\u043B\u044F \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430.");
              setResolvedUrl("");
              setResolvedText(textPreview);
              setResolvedKind("text");
              setLoading(false);
              return;
            }
            const blob = new Blob([buffer], { type: response.headers.get("content-type") || mimeType || "application/octet-stream" });
            objectUrl = URL.createObjectURL(blob);
            if (cancelled) {
              URL.revokeObjectURL(objectUrl);
              return;
            }
            setResolvedUrl(objectUrl);
            setResolvedKind(kind2);
            setLoading(false);
          } catch (err) {
            if (cancelled) return;
            setError(err instanceof Error ? err.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440");
            setLoading(false);
          }
        })();
        return () => {
          cancelled = true;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
      }, [fileName, mimeType, open, url]);
      if (!open || !url) return null;
      const kind = resolvedKind || detectAttachmentPreviewKind(fileName, mimeType);
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "file-preview-overlay", onClose: (event) => event.target.id === "file-preview-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal request-preview-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("h3", null, title || fileName || "\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0444\u0430\u0439\u043B\u0430"), /* @__PURE__ */ React.createElement("div", { className: "request-preview-head-actions" }, /* @__PURE__ */ React.createElement("a", { className: "icon-btn file-action-btn request-preview-download-icon", href: url, target: "_blank", rel: "noreferrer", "aria-label": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0444\u0430\u0439\u043B", "data-tooltip": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M12 3a1 1 0 0 1 1 1v8.17l2.58-2.58a1 1 0 1 1 1.42 1.42l-4.3 4.3a1 1 0 0 1-1.4 0l-4.3-4.3a1 1 0 0 1 1.42-1.42L11 12.17V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z",
          fill: "currentColor"
        }
      ))), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", id: "file-preview-close", onClick: onClose }, "\xD7"))), /* @__PURE__ */ React.createElement("div", { className: "request-preview-body", id: "file-preview-body" }, loading ? /* @__PURE__ */ React.createElement("p", { className: "request-preview-note" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430...") : null, !loading && !error && hint ? /* @__PURE__ */ React.createElement("p", { className: "request-preview-note" }, hint) : null, error ? /* @__PURE__ */ React.createElement("p", { className: "request-preview-note" }, error) : null, !loading && !error && kind === "image" && resolvedUrl ? /* @__PURE__ */ React.createElement("img", { className: "request-preview-image", src: resolvedUrl, alt: fileName || "attachment" }) : null, !loading && !error && kind === "video" && resolvedUrl ? /* @__PURE__ */ React.createElement("video", { className: "request-preview-video", src: resolvedUrl, controls: true, preload: "metadata" }) : null, !loading && !error && kind === "pdf" && resolvedUrl ? /* @__PURE__ */ React.createElement("iframe", { className: "request-preview-frame", src: resolvedUrl, title: fileName || "preview" }) : null, !loading && !error && kind === "text" ? /* @__PURE__ */ React.createElement("pre", { className: "request-preview-text" }, resolvedText || "\u0424\u0430\u0439\u043B \u043F\u0443\u0441\u0442.") : null, kind === "none" ? /* @__PURE__ */ React.createElement("p", { className: "request-preview-note" }, "\u0414\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0442\u0438\u043F\u0430 \u0444\u0430\u0439\u043B\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0435 \u0438\u043B\u0438 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435.") : null)));
    }
    function ClientHelpModal({
      open,
      status,
      loadingType,
      lawyerChangeReason,
      curatorBlocked,
      lawyerChangeBlocked,
      onClose,
      onReasonChange,
      onSubmitCurator,
      onSubmitLawyerChange
    }) {
      return /* @__PURE__ */ React.createElement("div", { className: "overlay" + (open ? " open" : ""), id: "client-help-overlay", onClick: (event) => event.target.id === "client-help-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal client-help-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { id: "client-help-title" }, "\u041F\u043E\u043C\u043E\u0449\u044C \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435")), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", id: "client-help-close", onClick: onClose, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "client-help-stack" }, /* @__PURE__ */ React.createElement("section", { className: "client-help-block" }, /* @__PURE__ */ React.createElement("p", { className: "client-help-description" }, "\u0415\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u0430 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430 \u043F\u043E \u0434\u0435\u043B\u0443, \u043C\u043E\u0436\u043D\u043E \u043E\u0431\u0440\u0430\u0442\u0438\u0442\u044C\u0441\u044F \u043A \u043A\u0443\u0440\u0430\u0442\u043E\u0440\u0443. \u0417\u0430\u043F\u0440\u043E\u0441 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B."), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn secondary btn-sm",
          id: "cabinet-curator-request-open",
          type: "button",
          disabled: curatorBlocked || loadingType === "CURATOR_CONTACT",
          onClick: onSubmitCurator
        },
        loadingType === "CURATOR_CONTACT" ? "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430..." : "\u041E\u0431\u0440\u0430\u0442\u0438\u0442\u044C\u0441\u044F \u043A \u043A\u0443\u0440\u0430\u0442\u043E\u0440\u0443"
      )), /* @__PURE__ */ React.createElement("section", { className: "client-help-block" }, /* @__PURE__ */ React.createElement("p", { className: "client-help-description" }, "\u0415\u0441\u043B\u0438 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u044E\u0440\u0438\u0441\u0442 \u043D\u0435 \u0443\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442, \u043C\u043E\u0436\u043D\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0435\u0433\u043E \u0441\u043C\u0435\u043D\u0443. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0440\u0438\u0447\u0438\u043D\u0443 \u0434\u043B\u044F \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430."), /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "service-request-body" }, "\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u0441\u043C\u0435\u043D\u044B \u044E\u0440\u0438\u0441\u0442\u0430"), /* @__PURE__ */ React.createElement(
        "textarea",
        {
          id: "service-request-body",
          value: lawyerChangeReason,
          onChange: onReasonChange,
          maxLength: 4e3,
          placeholder: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u043F\u0440\u0438\u0447\u0438\u043D\u0443",
          disabled: lawyerChangeBlocked || loadingType === "LAWYER_CHANGE_REQUEST"
        }
      )), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn secondary btn-sm",
          id: "cabinet-lawyer-change-open",
          type: "button",
          disabled: lawyerChangeBlocked || loadingType === "LAWYER_CHANGE_REQUEST",
          onClick: onSubmitLawyerChange
        },
        loadingType === "LAWYER_CHANGE_REQUEST" ? "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430..." : "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0441\u043C\u0435\u043D\u0443"
      )), /* @__PURE__ */ React.createElement(StatusLine, { status }))));
    }
    function RequestPickerModal({
      open,
      loading,
      requests,
      activeTrack,
      onClose,
      onReload,
      onSelect
    }) {
      const rows = Array.isArray(requests) ? requests : [];
      return /* @__PURE__ */ React.createElement(Overlay, { open, id: "client-request-picker-overlay", onClose: (event) => event.target.id === "client-request-picker-overlay" && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "modal client-request-picker-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "\u0412\u044B\u0431\u043E\u0440 \u0437\u0430\u044F\u0432\u043A\u0438"), /* @__PURE__ */ React.createElement("p", { className: "muted client-request-picker-subtitle" }, "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043D\u0443\u0436\u043D\u0443\u044E \u0437\u0430\u044F\u0432\u043A\u0443 \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430")), /* @__PURE__ */ React.createElement("div", { className: "modal-head-actions" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "icon-btn file-action-btn",
          type: "button",
          "data-tooltip": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A",
          "aria-label": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A",
          onClick: onReload,
          disabled: loading
        },
        /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ React.createElement(
          "path",
          {
            d: "M12 4a8 8 0 0 1 7.7 5.8 1 1 0 0 1-1.92.56A6 6 0 1 0 16.7 16H15a1 1 0 1 1 0-2h4a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-1.18A8 8 0 1 1 12 4z",
            fill: "currentColor"
          }
        ))
      ), /* @__PURE__ */ React.createElement("button", { className: "close", type: "button", onClick: onClose, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\xD7"))), /* @__PURE__ */ React.createElement("ul", { className: "simple-list client-request-picker-list", id: "client-request-picker-list" }, rows.length ? rows.map((row, index) => {
        const track = String((row == null ? void 0 : row.track_number) || "").trim();
        const isActive = track && track === String(activeTrack || "").trim();
        const hasUpdates = Number((row == null ? void 0 : row.viewer_unread_total) || 0) > 0 || Boolean(row == null ? void 0 : row.client_has_unread_updates);
        const statusName = String((row == null ? void 0 : row.status_name) || statusLabel(row == null ? void 0 : row.status_code) || "-");
        return /* @__PURE__ */ React.createElement(
          "li",
          {
            key: String((row == null ? void 0 : row.id) || track || "row-" + String(index)),
            className: "client-request-picker-item" + (isActive ? " active" : "") + (hasUpdates ? " has-updates" : "")
          },
          /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "client-request-picker-btn",
              onClick: () => onSelect(track),
              disabled: !track || loading,
              "aria-label": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443 " + (track || "")
            },
            /* @__PURE__ */ React.createElement("div", { className: "client-request-picker-head" }, /* @__PURE__ */ React.createElement("span", { className: "client-request-picker-track" }, track || "\u0411\u0435\u0437 \u043D\u043E\u043C\u0435\u0440\u0430"), /* @__PURE__ */ React.createElement("span", { className: "client-request-news-dot" + (hasUpdates ? " active" : ""), "aria-hidden": "true" })),
            /* @__PURE__ */ React.createElement("div", { className: "client-request-picker-meta" }, /* @__PURE__ */ React.createElement("span", { className: "client-request-picker-status" }, statusName), /* @__PURE__ */ React.createElement("span", { className: "client-request-picker-updated" }, fmtShortDateTime(row == null ? void 0 : row.updated_at)))
          )
        );
      }) : /* @__PURE__ */ React.createElement("li", { className: "muted" }, loading ? "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u043F\u0438\u0441\u043A\u0430..." : "\u0417\u0430\u044F\u0432\u043E\u043A \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E")), /* @__PURE__ */ React.createElement("div", { className: "client-request-picker-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn secondary btn-sm", type: "button", onClick: onClose }, "\u041E\u0442\u043C\u0435\u043D\u0430"))));
    }
    function App() {
      var _a, _b;
      const UPLOAD_MAX_ATTEMPTS = 4;
      const [requestModal, setRequestModal] = useState(createRequestModalState());
      const [requestsList, setRequestsList] = useState([]);
      const [activeTrack, setActiveTrack] = useState("");
      const [requestPickerModal, setRequestPickerModal] = useState({ open: false, loading: false });
      const [status, setStatus] = useState({ message: "", kind: "" });
      const [serviceRequests, setServiceRequests] = useState([]);
      const [clientHelpModal, setClientHelpModal] = useState({
        open: false,
        loadingType: "",
        lawyerChangeReason: "",
        status: { message: "", kind: "" }
      });
      const setPageStatus = useCallback((message, kind) => {
        setStatus({ message: String(message || ""), kind: kind || "" });
      }, []);
      const apiError = (data, fallback) => {
        if (data && typeof data.detail === "string" && data.detail.trim()) return data.detail;
        return fallback;
      };
      const parseJsonSafe = async (response) => {
        try {
          return await response.json();
        } catch (_) {
          return null;
        }
      };
      const apiJson = useCallback(async (url, options, fallbackMessage) => {
        const response = await fetch(url, options || void 0);
        const data = await parseJsonSafe(response);
        if (response.status === 401 || response.status === 403) {
          window.location.href = "/";
          throw new Error("\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430");
        }
        if (!response.ok) {
          const error = new Error(apiError(data, fallbackMessage || "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0440\u043E\u0441\u0430"));
          error.httpStatus = Number(response.status || 0);
          throw error;
        }
        return data;
      }, []);
      const buildStorageUploadError = useCallback(async (response, fallbackMessage) => {
        const base = String(fallbackMessage || "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0444\u0430\u0439\u043B\u0430 \u0432 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435");
        const status2 = Number((response == null ? void 0 : response.status) || 0);
        const statusText = String((response == null ? void 0 : response.statusText) || "").trim();
        let details = "";
        try {
          details = String(await response.text() || "").replace(/\s+/g, " ").trim();
        } catch (_) {
          details = "";
        }
        if (details.length > 180) details = details.slice(0, 180) + "...";
        const parts = [];
        if (status2 > 0) parts.push("HTTP " + status2 + (statusText ? " " + statusText : ""));
        if (details) parts.push(details);
        return parts.length ? base + " (" + parts.join("; ") + ")" : base;
      }, []);
      const wait = useCallback(async (ms) => {
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
      }, []);
      const nextUploadRetryDelayMs = useCallback((attempt) => {
        const base = Math.min(1200 * Math.pow(2, Math.max(0, Number(attempt || 1) - 1)), 7e3);
        const jitter = Math.floor(Math.random() * 250);
        return base + jitter;
      }, []);
      const isRetryableUploadError = useCallback((error) => {
        const status2 = Number((error == null ? void 0 : error.httpStatus) || (error == null ? void 0 : error.status) || 0);
        if ([408, 425, 429, 500, 502, 503, 504].includes(status2)) return true;
        if (status2 > 0) return false;
        const message = String((error == null ? void 0 : error.message) || "").toLowerCase();
        if (!message) return true;
        return message.includes("networkerror") || message.includes("failed to fetch") || message.includes("load failed") || message.includes("network request failed") || message.includes("timeout");
      }, []);
      const runUploadStepWithRetry = useCallback(
        async (label, action) => {
          let lastError = null;
          let attemptsUsed = 0;
          for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
            attemptsUsed = attempt;
            try {
              return await action(attempt);
            } catch (error) {
              lastError = error;
              const canRetry = attempt < UPLOAD_MAX_ATTEMPTS && isRetryableUploadError(error);
              if (!canRetry) break;
              await wait(nextUploadRetryDelayMs(attempt));
            }
          }
          const reason = String((lastError == null ? void 0 : lastError.message) || "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0442\u0438");
          throw new Error(label + ": " + reason + " (\u043F\u043E\u043F\u044B\u0442\u043E\u043A: " + attemptsUsed + ")");
        },
        [UPLOAD_MAX_ATTEMPTS, isRetryableUploadError, nextUploadRetryDelayMs, wait]
      );
      const uploadPublicRequestAttachment = useCallback(async (file, extra = {}) => {
        const requestId = String(requestModal.requestId || "").trim();
        if (!requestId) throw new Error("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u0437\u0430\u044F\u0432\u043A\u0430");
        const mimeType = String((file == null ? void 0 : file.type) || "application/octet-stream");
        const initData = await runUploadStepWithRetry("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0444\u0430\u0439\u043B\u0430", async () => {
          return apiJson(
            "/api/public/uploads/init",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                file_name: file.name,
                mime_type: mimeType,
                size_bytes: file.size,
                scope: "REQUEST_ATTACHMENT",
                request_id: requestId
              })
            },
            "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0444\u0430\u0439\u043B\u0430"
          );
        });
        await runUploadStepWithRetry("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0444\u0430\u0439\u043B\u0430 \u0432 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435", async () => {
          const putResponse = await fetch(initData.presigned_url, {
            method: "PUT",
            headers: { "Content-Type": mimeType },
            body: file
          });
          if (putResponse.ok) return null;
          const error = new Error(await buildStorageUploadError(putResponse, "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0444\u0430\u0439\u043B\u0430 \u0432 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435"));
          error.httpStatus = Number(putResponse.status || 0);
          throw error;
        });
        const completeData = await runUploadStepWithRetry("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0444\u0430\u0439\u043B\u0430", async () => {
          return apiJson(
            "/api/public/uploads/complete",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                key: initData.key,
                file_name: file.name,
                mime_type: mimeType,
                size_bytes: file.size,
                scope: "REQUEST_ATTACHMENT",
                request_id: requestId,
                message_id: (extra == null ? void 0 : extra.message_id) || null
              })
            },
            "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0444\u0430\u0439\u043B\u0430"
          );
        });
        return completeData;
      }, [apiJson, buildStorageUploadError, requestModal.requestId, runUploadStepWithRetry]);
      const loadRequestWorkspace = useCallback(
        async (trackNumber, showLoading) => {
          const track = String(trackNumber || "").trim().toUpperCase();
          if (!track) return;
          if (showLoading) {
            setRequestModal((prev) => ({ ...prev, loading: true }));
          }
          const [requestData, messagesData, attachmentsData, invoicesData, statusRouteData, serviceRequestsData] = await Promise.all([
            apiJson("/api/public/requests/" + encodeURIComponent(track), null, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443"),
            apiJson("/api/public/chat/requests/" + encodeURIComponent(track) + "/messages", null, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F"),
            apiJson("/api/public/requests/" + encodeURIComponent(track) + "/attachments", null, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B"),
            apiJson("/api/public/requests/" + encodeURIComponent(track) + "/invoices", null, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u0447\u0435\u0442\u0430"),
            apiJson("/api/public/requests/" + encodeURIComponent(track) + "/status-route", null, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043C\u0430\u0440\u0448\u0440\u0443\u0442 \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u0432"),
            apiJson("/api/public/requests/" + encodeURIComponent(track) + "/service-requests", null, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F")
          ]);
          const invoices = Array.isArray(invoicesData) ? invoicesData : [];
          const paidInvoices = invoices.filter((item) => String((item == null ? void 0 : item.status) || "").toUpperCase() === "PAID");
          const paidTotal = paidInvoices.reduce((acc, item) => {
            const amount = Number((item == null ? void 0 : item.amount) || 0);
            return Number.isFinite(amount) ? acc + amount : acc;
          }, 0);
          const lastPaidAt = paidInvoices.reduce((latest, item) => {
            const raw = String((item == null ? void 0 : item.paid_at) || "").trim();
            if (!raw) return latest;
            if (!latest) return raw;
            const currentTs = new Date(raw).getTime();
            const latestTs = new Date(latest).getTime();
            return Number.isFinite(currentTs) && currentTs > latestTs ? raw : latest;
          }, "");
          setActiveTrack(track);
          setServiceRequests(Array.isArray(serviceRequestsData) ? serviceRequestsData : []);
          setRequestModal((prev) => {
            var _a2, _b2;
            return {
              ...prev,
              loading: false,
              requestId: String((requestData == null ? void 0 : requestData.id) || ""),
              trackNumber: String((requestData == null ? void 0 : requestData.track_number) || track),
              requestData: requestData || null,
              financeSummary: {
                request_cost: (_a2 = requestData == null ? void 0 : requestData.request_cost) != null ? _a2 : null,
                effective_rate: (_b2 = requestData == null ? void 0 : requestData.effective_rate) != null ? _b2 : null,
                paid_total: Math.round((paidTotal + Number.EPSILON) * 100) / 100,
                last_paid_at: lastPaidAt || (requestData == null ? void 0 : requestData.paid_at) || null
              },
              statusRouteNodes: Array.isArray(statusRouteData == null ? void 0 : statusRouteData.nodes) ? statusRouteData.nodes : [],
              statusHistory: Array.isArray(statusRouteData == null ? void 0 : statusRouteData.history) ? statusRouteData.history : [],
              availableStatuses: [],
              currentImportantDateAt: String((statusRouteData == null ? void 0 : statusRouteData.current_important_date_at) || (requestData == null ? void 0 : requestData.important_date_at) || ""),
              invoices,
              messages: Array.isArray(messagesData) ? messagesData : [],
              attachments: Array.isArray(attachmentsData) ? attachmentsData : [],
              fileUploading: false
            };
          });
        },
        [apiJson]
      );
      const refreshRequestsList = useCallback(async () => {
        const data = await apiJson("/api/public/requests/my", null, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A \u0437\u0430\u044F\u0432\u043E\u043A");
        const rows = Array.isArray(data == null ? void 0 : data.rows) ? data.rows : [];
        setRequestsList(rows);
        return rows;
      }, [apiJson]);
      const loadMyRequests = useCallback(
        async (preferredTrack) => {
          const rows = await refreshRequestsList();
          if (!rows.length) {
            setRequestModal((prev) => ({
              ...prev,
              loading: false,
              requestId: null,
              requestData: null,
              trackNumber: "",
              financeSummary: null,
              invoices: [],
              statusRouteNodes: [],
              statusHistory: [],
              messages: [],
              attachments: [],
              fileUploading: false,
              selectedFiles: [],
              messageDraft: ""
            }));
            setServiceRequests([]);
            setPageStatus("\u041F\u043E \u0432\u0430\u0448\u0435\u043C\u0443 \u043D\u043E\u043C\u0435\u0440\u0443 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0437\u0430\u044F\u0432\u043E\u043A.", "");
            return;
          }
          const tracks = rows.map((row) => String(row.track_number || "").trim()).filter(Boolean);
          const selected = tracks.includes(String(preferredTrack || "").trim().toUpperCase()) ? String(preferredTrack || "").trim().toUpperCase() : tracks[0];
          await loadRequestWorkspace(selected, true);
        },
        [loadRequestWorkspace, refreshRequestsList, setPageStatus]
      );
      const openRequestPicker = useCallback(() => {
        setRequestPickerModal({ open: true, loading: true });
        void refreshRequestsList().catch((error) => setPageStatus((error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A \u0437\u0430\u044F\u0432\u043E\u043A", "error")).finally(() => {
          setRequestPickerModal((prev) => ({ ...prev, loading: false }));
        });
      }, [refreshRequestsList, setPageStatus]);
      const closeRequestPicker = useCallback(() => {
        setRequestPickerModal((prev) => ({ ...prev, open: false }));
      }, []);
      const reloadRequestPicker = useCallback(() => {
        setRequestPickerModal((prev) => ({ ...prev, loading: true }));
        void refreshRequestsList().catch((error) => setPageStatus((error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A \u0437\u0430\u044F\u0432\u043E\u043A", "error")).finally(() => {
          setRequestPickerModal((prev) => ({ ...prev, loading: false }));
        });
      }, [refreshRequestsList, setPageStatus]);
      const selectRequestFromPicker = useCallback(
        async (trackNumber) => {
          const track = String(trackNumber || "").trim().toUpperCase();
          if (!track) return;
          setRequestPickerModal((prev) => ({ ...prev, loading: true }));
          try {
            await loadRequestWorkspace(track, true);
            await refreshRequestsList();
            setRequestPickerModal({ open: false, loading: false });
          } catch (error) {
            setRequestPickerModal((prev) => ({ ...prev, loading: false }));
            setPageStatus((error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443", "error");
          }
        },
        [loadRequestWorkspace, refreshRequestsList, setPageStatus]
      );
      const updateMessageDraft = useCallback((event) => {
        var _a2;
        const value = ((_a2 = event == null ? void 0 : event.target) == null ? void 0 : _a2.value) || "";
        setRequestModal((prev) => ({ ...prev, messageDraft: value }));
      }, []);
      const appendFiles = useCallback((files) => {
        const list = Array.isArray(files) ? files.filter(Boolean) : [];
        if (!list.length) return;
        setRequestModal((prev) => {
          const existing = Array.isArray(prev.selectedFiles) ? prev.selectedFiles : [];
          const next = [...existing];
          list.forEach((file) => {
            const duplicate = next.some(
              (item) => item && item.name === file.name && Number(item.size || 0) === Number(file.size || 0) && Number(item.lastModified || 0) === Number(file.lastModified || 0)
            );
            if (!duplicate) next.push(file);
          });
          return { ...prev, selectedFiles: next };
        });
      }, []);
      const removeFile = useCallback((index) => {
        setRequestModal((prev) => {
          const files = Array.isArray(prev.selectedFiles) ? [...prev.selectedFiles] : [];
          files.splice(index, 1);
          return { ...prev, selectedFiles: files };
        });
      }, []);
      const clearFiles = useCallback(() => {
        setRequestModal((prev) => ({ ...prev, selectedFiles: [] }));
      }, []);
      const downloadPublicInvoicePdf = useCallback(
        async (row) => {
          const url = String((row == null ? void 0 : row.download_url) || "").trim();
          if (!url) {
            setPageStatus("\u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 PDF \u0441\u0447\u0435\u0442\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430.", "error");
            return;
          }
          try {
            setPageStatus("\u0421\u043A\u0430\u0447\u0438\u0432\u0430\u0435\u043C PDF...", "");
            const response = await fetch(url, { credentials: "same-origin" });
            if (!response.ok) {
              const text = await response.text();
              let payload = {};
              try {
                payload = text ? JSON.parse(text) : {};
              } catch (_) {
                payload = { raw: text };
              }
              const message = payload.detail || payload.error || payload.raw || "HTTP " + response.status;
              throw new Error(String(message));
            }
            const blob = await response.blob();
            const fileName = String((row == null ? void 0 : row.invoice_number) || "invoice") + ".pdf";
            const fileUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = fileUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(fileUrl);
            setPageStatus("PDF \u0441\u043A\u0430\u0447\u0430\u043D", "ok");
          } catch (error) {
            setPageStatus("\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u044F: " + ((error == null ? void 0 : error.message) || "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430"), "error");
          }
        },
        [setPageStatus]
      );
      const submitMessage = useCallback(
        async (event) => {
          if (event && typeof event.preventDefault === "function") event.preventDefault();
          const track = String(activeTrack || "").trim();
          const requestId = String(requestModal.requestId || "").trim();
          if (!track || !requestId) {
            setPageStatus("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u044F\u0432\u043A\u0443.", "error");
            return;
          }
          const body = String(requestModal.messageDraft || "").trim();
          const files = Array.isArray(requestModal.selectedFiles) ? requestModal.selectedFiles : [];
          if (!body && !files.length) return;
          try {
            setRequestModal((prev) => ({ ...prev, fileUploading: true }));
            setPageStatus(files.length ? "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0438 \u0444\u0430\u0439\u043B\u043E\u0432..." : "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F...", "");
            let messageId = null;
            if (body) {
              const messageData = await apiJson(
                "/api/public/chat/requests/" + encodeURIComponent(track) + "/messages",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ body })
                },
                "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435"
              );
              messageId = String((messageData == null ? void 0 : messageData.id) || "").trim() || null;
            }
            for (const file of files) {
              await uploadPublicRequestAttachment(file, { message_id: messageId });
            }
            setRequestModal((prev) => ({ ...prev, messageDraft: "", selectedFiles: [], fileUploading: false }));
            await loadRequestWorkspace(track, false);
            if (body && files.length) setPageStatus("\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0438 \u0444\u0430\u0439\u043B\u044B \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u044B.", "ok");
            else if (files.length) setPageStatus(files.length === 1 ? "\u0424\u0430\u0439\u043B \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D." : "\u0424\u0430\u0439\u043B\u044B \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B.", "ok");
            else setPageStatus("\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E.", "ok");
          } catch (error) {
            setRequestModal((prev) => ({ ...prev, fileUploading: false }));
            setPageStatus((error == null ? void 0 : error.message) || "\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F", "error");
          }
        },
        [activeTrack, apiJson, loadRequestWorkspace, requestModal.messageDraft, requestModal.requestId, requestModal.selectedFiles, setPageStatus, uploadPublicRequestAttachment]
      );
      const loadRequestDataBatch = useCallback(
        async (messageId) => {
          const track = String(activeTrack || "").trim();
          if (!track || !messageId) throw new Error("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u0437\u0430\u044F\u0432\u043A\u0430");
          return apiJson(
            "/api/public/chat/requests/" + encodeURIComponent(track) + "/data-requests/" + encodeURIComponent(String(messageId)),
            null,
            "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441 \u0434\u0430\u043D\u043D\u044B\u0445"
          );
        },
        [activeTrack, apiJson]
      );
      const saveRequestDataValues = useCallback(
        async ({ message_id, items }) => {
          const track = String(activeTrack || "").trim();
          const messageId = String(message_id || "").trim();
          if (!track || !messageId) throw new Error("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u0437\u0430\u044F\u0432\u043A\u0430");
          await apiJson(
            "/api/public/chat/requests/" + encodeURIComponent(track) + "/data-requests/" + encodeURIComponent(messageId),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: Array.isArray(items) ? items : [] })
            },
            "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435"
          );
          await loadRequestWorkspace(track, false);
        },
        [activeTrack, apiJson, loadRequestWorkspace]
      );
      const probeLiveState = useCallback(
        async ({ cursor } = {}) => {
          const track = String(activeTrack || "").trim();
          if (!track) return { has_updates: false, typing: [], cursor: null };
          const query = cursor ? "?cursor=" + encodeURIComponent(String(cursor)) : "";
          const payload = await apiJson(
            "/api/public/chat/requests/" + encodeURIComponent(track) + "/live" + query,
            null,
            "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C live-\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F \u0447\u0430\u0442\u0430"
          );
          if (payload && payload.has_updates) {
            await loadRequestWorkspace(track, false);
          }
          return payload || { has_updates: false, typing: [], cursor: null };
        },
        [activeTrack, apiJson, loadRequestWorkspace]
      );
      const setTypingSignal = useCallback(
        async ({ typing } = {}) => {
          const track = String(activeTrack || "").trim();
          if (!track) return { status: "skipped", typing: false };
          return apiJson(
            "/api/public/chat/requests/" + encodeURIComponent(track) + "/typing",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ typing: Boolean(typing) })
            },
            "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441 \u043D\u0430\u0431\u043E\u0440\u0430"
          );
        },
        [activeTrack, apiJson]
      );
      const openClientHelpModal = useCallback(() => {
        setClientHelpModal((prev) => ({
          ...prev,
          open: true,
          status: { message: "", kind: "" }
        }));
      }, []);
      const closeClientHelpModal = useCallback(() => {
        setClientHelpModal((prev) => ({
          ...prev,
          open: false,
          loadingType: "",
          status: { message: "", kind: "" }
        }));
      }, []);
      const normalizedCurrentLawyerId = String(((_a = requestModal.requestData) == null ? void 0 : _a.assigned_lawyer_id) || "").trim().toLowerCase();
      const serviceRequestState = useMemo(() => {
        const rows = Array.isArray(serviceRequests) ? serviceRequests : [];
        const curatorRows = rows.filter((item) => String((item == null ? void 0 : item.type) || "").toUpperCase() === "CURATOR_CONTACT");
        const lawyerRows = rows.filter((item) => String((item == null ? void 0 : item.type) || "").toUpperCase() === "LAWYER_CHANGE_REQUEST");
        const latestLawyerChange = lawyerRows[0] || null;
        const hasCuratorRequest = curatorRows.length > 0;
        let lawyerChangeDisabledByState = false;
        if (latestLawyerChange) {
          const hasLawyerSnapshot = Object.prototype.hasOwnProperty.call(latestLawyerChange, "assigned_lawyer_id");
          if (hasLawyerSnapshot) {
            const requestedForLawyer = String((latestLawyerChange == null ? void 0 : latestLawyerChange.assigned_lawyer_id) || "").trim().toLowerCase();
            lawyerChangeDisabledByState = requestedForLawyer === normalizedCurrentLawyerId;
          } else {
            const statusCode = String((latestLawyerChange == null ? void 0 : latestLawyerChange.status) || "").toUpperCase();
            lawyerChangeDisabledByState = statusCode === "NEW" || statusCode === "IN_PROGRESS";
          }
        }
        return {
          hasCuratorRequest,
          lawyerChangeDisabledByState
        };
      }, [normalizedCurrentLawyerId, serviceRequests]);
      const canInteract = Boolean(requestModal.requestData && !requestModal.loading);
      const curatorBlocked = !canInteract || serviceRequestState.hasCuratorRequest;
      const lawyerChangeBlocked = !canInteract || serviceRequestState.lawyerChangeDisabledByState;
      const submitServiceRequest = useCallback(
        async ({ type, body }) => {
          const track = String(activeTrack || "").trim();
          const requestType = String(type || "").trim().toUpperCase();
          const message = String(body || "").trim();
          if (!track) {
            setClientHelpModal((prev) => ({ ...prev, status: { message: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u044F\u0432\u043A\u0443.", kind: "error" } }));
            return;
          }
          if (!requestType) {
            setClientHelpModal((prev) => ({ ...prev, status: { message: "\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D \u0442\u0438\u043F \u0437\u0430\u043F\u0440\u043E\u0441\u0430.", kind: "error" } }));
            return;
          }
          if (message.length < 3) {
            setClientHelpModal((prev) => ({ ...prev, status: { message: "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0434\u043E\u043B\u0436\u043D\u043E \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u043C\u0438\u043D\u0438\u043C\u0443\u043C 3 \u0441\u0438\u043C\u0432\u043E\u043B\u0430.", kind: "error" } }));
            return;
          }
          try {
            setClientHelpModal((prev) => ({ ...prev, loadingType: requestType, status: { message: "", kind: "" } }));
            await apiJson(
              "/api/public/requests/" + encodeURIComponent(track) + "/service-requests",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: requestType, body: message })
              },
              "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435"
            );
            await loadRequestWorkspace(track, false);
            setPageStatus("\u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E.", "ok");
            setClientHelpModal((prev) => ({
              ...prev,
              loadingType: "",
              status: { message: "\u041E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E.", kind: "ok" },
              lawyerChangeReason: requestType === "LAWYER_CHANGE_REQUEST" ? "" : prev.lawyerChangeReason
            }));
          } catch (error) {
            setClientHelpModal((prev) => ({
              ...prev,
              loadingType: "",
              status: { message: (error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435", kind: "error" }
            }));
          }
        },
        [activeTrack, apiJson, loadRequestWorkspace, setPageStatus]
      );
      useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const preferredTrack = String(params.get("track") || "").trim().toUpperCase();
        void loadMyRequests(preferredTrack).catch((error) => {
          setPageStatus((error == null ? void 0 : error.message) || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u043A\u043B\u0438\u0435\u043D\u0442\u0430", "error");
        });
      }, [loadMyRequests, setPageStatus]);
      const summary = requestModal.requestData || null;
      const summaryStatusName = String((summary == null ? void 0 : summary.status_name) || statusLabel(summary == null ? void 0 : summary.status_code) || "-");
      const viewerFullName = useMemo(() => {
        var _a2;
        const fullName = String(((_a2 = requestModal.requestData) == null ? void 0 : _a2.client_name) || "").trim();
        return fullName || "\u041A\u043B\u0438\u0435\u043D\u0442";
      }, [(_b = requestModal.requestData) == null ? void 0 : _b.client_name]);
      const hasAnyUnreadUpdates = useMemo(
        () => requestsList.some((row) => Number((row == null ? void 0 : row.viewer_unread_total) || 0) > 0 || Boolean(row == null ? void 0 : row.client_has_unread_updates)),
        [requestsList]
      );
      return /* @__PURE__ */ React.createElement("div", { className: "client-page-shell" }, /* @__PURE__ */ React.createElement("main", { className: "main client-main" }, /* @__PURE__ */ React.createElement("div", { className: "topbar client-topbar" }, /* @__PURE__ */ React.createElement("div", { className: "client-topbar-copy" }, /* @__PURE__ */ React.createElement("div", { className: "client-title-row" }, /* @__PURE__ */ React.createElement("img", { className: "brand-mark", src: "/brand-mark.svg", alt: "", width: "24", height: "24" }), /* @__PURE__ */ React.createElement("h1", null, /* @__PURE__ */ React.createElement("span", null, "\u041B\u0438\u0447\u043D\u044B\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442"), /* @__PURE__ */ React.createElement("span", { className: "client-title-separator", "aria-hidden": "true" }, "\u2022"), /* @__PURE__ */ React.createElement("span", { className: "client-title-user" }, viewerFullName))), /* @__PURE__ */ React.createElement("div", { className: "client-help-inline" }, /* @__PURE__ */ React.createElement("p", { className: "muted" }, "\u041C\u044B \u0440\u0430\u0434\u044B \u0432\u0430\u043C \u043F\u043E\u043C\u043E\u0447\u044C"), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "icon-btn workspace-head-icon",
          id: "cabinet-help-open",
          type: "button",
          "data-tooltip": "\u041F\u043E\u043C\u043E\u0449\u044C \u0438 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F",
          "aria-label": "\u041F\u043E\u043C\u043E\u0449\u044C \u0438 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F",
          disabled: !canInteract,
          onClick: openClientHelpModal
        },
        "?"
      )))), /* @__PURE__ */ React.createElement("section", { className: "section active client-section" }, /* @__PURE__ */ React.createElement("div", { className: "section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "\u041C\u043E\u0438 \u0437\u0430\u044F\u0432\u043A\u0438"))), /* @__PURE__ */ React.createElement("div", { className: "client-request-toolbar" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn secondary client-request-picker-trigger",
          id: "client-request-open",
          type: "button",
          onClick: openRequestPicker,
          disabled: requestModal.loading || !requestsList.length
        },
        /* @__PURE__ */ React.createElement("span", { className: "client-request-picker-trigger-label" }, "\u0417\u0430\u044F\u0432\u043A\u0430"),
        /* @__PURE__ */ React.createElement("span", { className: "client-request-picker-trigger-track" }, activeTrack || "\u0412\u044B\u0431\u0440\u0430\u0442\u044C"),
        hasAnyUnreadUpdates ? /* @__PURE__ */ React.createElement("span", { className: "client-request-news-dot active", "aria-hidden": "true" }) : null
      )), /* @__PURE__ */ React.createElement("div", { className: "client-summary", id: "cabinet-summary", hidden: !summary }, /* @__PURE__ */ React.createElement("div", { className: "client-summary-row" }, /* @__PURE__ */ React.createElement("div", { className: "client-summary-chips" }, /* @__PURE__ */ React.createElement("span", { className: "client-summary-chip client-summary-chip-status" }, "\u0421\u0442\u0430\u0442\u0443\u0441: ", /* @__PURE__ */ React.createElement("span", { id: "cabinet-request-status" }, summary ? summaryStatusName : "-")), /* @__PURE__ */ React.createElement("span", { className: "client-summary-chip client-summary-chip-topic" }, "\u0422\u0435\u043C\u0430: ", /* @__PURE__ */ React.createElement("span", { id: "cabinet-request-topic" }, summary ? String(summary.topic_name || summary.topic_code || "-") : "-")), /* @__PURE__ */ React.createElement("span", { className: "client-summary-chip client-summary-chip-lawyer" }, "\u042E\u0440\u0438\u0441\u0442: ", /* @__PURE__ */ React.createElement("span", null, summary ? String(summary.assigned_lawyer_name || summary.assigned_lawyer_id || "\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D") : "-"))), /* @__PURE__ */ React.createElement("div", { className: "client-summary-dates" }, /* @__PURE__ */ React.createElement("span", null, "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0430: ", /* @__PURE__ */ React.createElement("b", { id: "cabinet-request-updated" }, summary ? fmtShortDateTime(summary.updated_at) : "-"))))), /* @__PURE__ */ React.createElement(
        RequestWorkspace,
        {
          viewerRole: "CLIENT",
          viewerUserId: "",
          loading: requestModal.loading,
          trackNumber: requestModal.trackNumber,
          requestData: requestModal.requestData,
          financeSummary: requestModal.financeSummary,
          invoices: requestModal.invoices || [],
          statusRouteNodes: requestModal.statusRouteNodes || [],
          statusHistory: requestModal.statusHistory || [],
          availableStatuses: [],
          currentImportantDateAt: requestModal.currentImportantDateAt || "",
          pendingStatusChangePreset: null,
          messages: requestModal.messages || [],
          attachments: requestModal.attachments || [],
          messageDraft: requestModal.messageDraft || "",
          selectedFiles: requestModal.selectedFiles || [],
          fileUploading: Boolean(requestModal.fileUploading),
          status,
          onMessageChange: updateMessageDraft,
          onSendMessage: submitMessage,
          onFilesSelect: appendFiles,
          onRemoveSelectedFile: removeFile,
          onClearSelectedFiles: clearFiles,
          onLoadRequestDataBatch: loadRequestDataBatch,
          onSaveRequestDataValues: saveRequestDataValues,
          onUploadRequestAttachment: uploadPublicRequestAttachment,
          onChangeStatus: () => Promise.resolve(null),
          onDownloadInvoicePdf: downloadPublicInvoicePdf,
          onLiveProbe: probeLiveState,
          onTypingSignal: setTypingSignal,
          AttachmentPreviewModalComponent: AttachmentPreviewModal,
          StatusLineComponent: StatusLine,
          domIds: {
            messagesList: "cabinet-messages",
            filesList: "cabinet-files",
            messageBody: "cabinet-chat-body",
            sendButton: "cabinet-chat-send",
            fileInput: "cabinet-file-input",
            dataRequestOverlay: "data-request-overlay",
            dataRequestItems: "data-request-items",
            dataRequestStatus: "data-request-status",
            dataRequestSave: "data-request-save"
          }
        }
      )), /* @__PURE__ */ React.createElement("p", { className: "status", id: "client-page-status" }, status.message)), /* @__PURE__ */ React.createElement(
        RequestPickerModal,
        {
          open: requestPickerModal.open,
          loading: requestPickerModal.loading,
          requests: requestsList,
          activeTrack,
          onClose: closeRequestPicker,
          onReload: reloadRequestPicker,
          onSelect: selectRequestFromPicker
        }
      ), /* @__PURE__ */ React.createElement(
        ClientHelpModal,
        {
          open: clientHelpModal.open,
          status: clientHelpModal.status,
          loadingType: clientHelpModal.loadingType,
          lawyerChangeReason: clientHelpModal.lawyerChangeReason,
          curatorBlocked,
          lawyerChangeBlocked,
          onClose: closeClientHelpModal,
          onReasonChange: (event) => setClientHelpModal((prev) => ({
            ...prev,
            lawyerChangeReason: event.target.value,
            status: { message: "", kind: "" }
          })),
          onSubmitCurator: () => submitServiceRequest({ type: "CURATOR_CONTACT", body: "\u041F\u0440\u043E\u0448\u0443 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043A\u0443\u0440\u0430\u0442\u043E\u0440\u0430 \u043A \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u0437\u0430\u044F\u0432\u043A\u0435." }),
          onSubmitLawyerChange: () => submitServiceRequest({ type: "LAWYER_CHANGE_REQUEST", body: clientHelpModal.lawyerChangeReason })
        }
      ), /* @__PURE__ */ React.createElement(GlobalTooltipLayer, null));
    }
    const root = document.getElementById("client-root");
    if (root) {
      ReactDOM.createRoot(root).render(/* @__PURE__ */ React.createElement(App, null));
    }
  })();
})();
