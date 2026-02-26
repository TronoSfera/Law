import {
  detectAttachmentPreviewKind,
  fmtAmount,
  fmtBytes,
  fmtDate,
  fmtDateOnly,
  fmtShortDateTime,
  fmtTimeOnly,
  humanizeKey,
  statusLabel,
} from "../../shared/utils.js";

export function RequestWorkspace({
  viewerRole,
  viewerUserId,
  loading,
  trackNumber,
  requestData,
  financeSummary,
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
  onChangeStatus,
  onConsumePendingStatusChangePreset,
  AttachmentPreviewModalComponent,
  StatusLineComponent,
}) {
  const { useEffect, useMemo, useRef, useState } = React;
  const [preview, setPreview] = useState({ open: false, url: "", fileName: "", mimeType: "" });
  const [chatTab, setChatTab] = useState("chat");
  const [dropActive, setDropActive] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
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
    error: "",
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
    error: "",
  });
  const fileInputRef = useRef(null);
  const statusChangeFileInputRef = useRef(null);
  const requestDataTypeOptions = useMemo(
    () => [
      { value: "string", label: "Строка" },
      { value: "date", label: "Дата" },
      { value: "number", label: "Число" },
      { value: "file", label: "Файл" },
      { value: "text", label: "Текст" },
    ],
    []
  );

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
  const finance = financeSummary && typeof financeSummary === "object" ? financeSummary : null;
  const viewerRoleCode = String(viewerRole || "").toUpperCase();
  const canRequestData = viewerRoleCode === "LAWYER" || viewerRoleCode === "ADMIN";
  const canSeeRate = viewerRoleCode !== "CLIENT";
  const safeMessages = Array.isArray(messages) ? messages : [];
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const safeStatusHistory = Array.isArray(statusHistory) ? statusHistory : [];
  const safeAvailableStatuses = Array.isArray(availableStatuses) ? availableStatuses : [];
  const totalFilesBytes = safeAttachments.reduce((acc, item) => acc + Number(item?.size_bytes || 0), 0);
  const clientLabel = row?.client_name || "-";
  const clientPhone = String(row?.client_phone || "").trim();
  const lawyerLabel = row?.assigned_lawyer_name || row?.assigned_lawyer_id || "Не назначен";
  const lawyerPhone = String(row?.assigned_lawyer_phone || "").trim();
  const clientHasPhone = Boolean(clientPhone);
  const lawyerHasPhone = Boolean(lawyerPhone);

  const selectedRequestTemplateCandidate = useMemo(
    () =>
      (dataRequestModal.templateList || []).find((item) => {
        const query = String(dataRequestModal.requestTemplateQuery || "").trim().toLowerCase();
        if (!query) return false;
        return query === String(item?.name || "").trim().toLowerCase() || query === String(item?.id || "").trim().toLowerCase();
      }) || null,
    [dataRequestModal.requestTemplateQuery, dataRequestModal.templateList]
  );
  const selectedCatalogFieldCandidate = useMemo(
    () =>
      (dataRequestModal.templates || []).find((item) => {
        const query = String(dataRequestModal.catalogFieldQuery || "").trim().toLowerCase();
        if (!query) return false;
        return (
          query === String(item?.label || "").trim().toLowerCase() ||
          query === String(item?.key || "").trim().toLowerCase() ||
          query === String(item?.id || "").trim().toLowerCase()
        );
      }) || null,
    [dataRequestModal.catalogFieldQuery, dataRequestModal.templates]
  );
  const filteredRequestTemplates = useMemo(() => {
    const query = String(dataRequestModal.requestTemplateQuery || "").trim().toLowerCase();
    const rows = Array.isArray(dataRequestModal.templateList) ? dataRequestModal.templateList : [];
    if (!query) return rows.slice(0, 8);
    return rows
      .filter((item) => String(item?.name || "").toLowerCase().includes(query))
      .slice(0, 8);
  }, [dataRequestModal.requestTemplateQuery, dataRequestModal.templateList]);
  const filteredCatalogFields = useMemo(() => {
    const query = String(dataRequestModal.catalogFieldQuery || "").trim().toLowerCase();
    const rows = Array.isArray(dataRequestModal.templates) ? dataRequestModal.templates : [];
    if (!query) return rows.slice(0, 10);
    return rows
      .filter((item) => {
        const label = String(item?.label || "").toLowerCase();
        const key = String(item?.key || "").toLowerCase();
        return label.includes(query) || key.includes(query);
      })
      .slice(0, 10);
  }, [dataRequestModal.catalogFieldQuery, dataRequestModal.templates]);
  const requestTemplateActionMode = selectedRequestTemplateCandidate ? "save" : String(dataRequestModal.requestTemplateQuery || "").trim() ? "create" : "";
  const catalogFieldActionMode = selectedCatalogFieldCandidate ? "add" : String(dataRequestModal.catalogFieldQuery || "").trim() ? "create" : "";
  const requestTemplateBadge = useMemo(() => {
    const query = String(dataRequestModal.requestTemplateQuery || "").trim();
    if (!query) return null;
    const matched = selectedRequestTemplateCandidate;
    if (!matched) return { kind: "create", label: "Новый шаблон" };
    const roleCode = String(viewerRole || "").toUpperCase();
    const actorId = String(viewerUserId || "").trim();
    const ownerId = String(matched.created_by_admin_id || "").trim();
    if (roleCode === "LAWYER" && ownerId && actorId && ownerId !== actorId) {
      return { kind: "readonly", label: "Чужой шаблон" };
    }
    return { kind: "existing", label: "Существующий шаблон" };
  }, [dataRequestModal.requestTemplateQuery, selectedRequestTemplateCandidate, viewerRole, viewerUserId]);
  const canSaveSelectedRequestTemplate = useMemo(() => {
    if (!String(dataRequestModal.requestTemplateQuery || "").trim()) return false;
    if (!requestTemplateBadge) return true;
    return requestTemplateBadge.kind !== "readonly";
  }, [dataRequestModal.requestTemplateQuery, requestTemplateBadge]);
  const attachmentById = useMemo(() => {
    const map = new Map();
    safeAttachments.forEach((item) => {
      const id = String(item?.id || "").trim();
      if (id) map.set(id, item);
    });
    return map;
  }, [safeAttachments]);
  const statusOptions = useMemo(
    () =>
      safeAvailableStatuses
        .filter((item) => item && item.code)
        .map((item) => ({
          code: String(item.code),
          name: String(item.name || item.code),
          groupName: item.status_group_name ? String(item.status_group_name) : "",
          isTerminal: Boolean(item.is_terminal),
        })),
    [safeAvailableStatuses]
  );
  const statusByCode = useMemo(() => new Map(statusOptions.map((item) => [item.code, item])), [statusOptions]);

  const toDateTimeLocalValue = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return (
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate()) +
      "T" +
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes())
    );
  };

  const defaultImportantDateLocal = useMemo(() => {
    const source = String(currentImportantDateAt || row?.important_date_at || "").trim();
    if (source) {
      const local = toDateTimeLocalValue(source);
      if (local) return local;
    }
    const next = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    return toDateTimeLocalValue(next.toISOString());
  }, [currentImportantDateAt, row?.important_date_at]);

  const formatDuration = (seconds) => {
    const total = Number(seconds);
    if (!Number.isFinite(total) || total < 0) return "—";
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return days + " д " + hours + " ч";
    if (hours > 0) return hours + " ч " + minutes + " мин";
    return Math.max(0, minutes) + " мин";
  };

  const openStatusChangeModal = (preset) => {
    const suggested = Array.isArray(preset?.suggestedStatuses) ? preset.suggestedStatuses.filter(Boolean) : [];
    const currentCode = String(row?.status_code || "").trim();
    const firstSuggested = suggested.find((code) => code && code !== currentCode) || "";
    setStatusChangeModal({
      open: true,
      saving: false,
      statusCode: firstSuggested,
      allowedStatusCodes: suggested.length ? suggested : null,
      importantDateAt: defaultImportantDateLocal,
      comment: "",
      files: [],
      error: "",
    });
  };

  const closeStatusChangeModal = () => {
    setStatusChangeModal((prev) => ({ ...prev, open: false, saving: false, error: "", files: [] }));
  };

  useEffect(() => {
    if (!pendingStatusChangePreset) return;
    openStatusChangeModal(pendingStatusChangePreset);
    if (typeof onConsumePendingStatusChangePreset === "function") onConsumePendingStatusChangePreset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStatusChangePreset]);
  const requestDataListItems = useMemo(() => {
    const byKey = new Map();
    const messagesChrono = [...safeMessages].sort((a, b) => {
      const at = new Date(a?.created_at || 0).getTime();
      const bt = new Date(b?.created_at || 0).getTime();
      if (at !== bt) return at - bt;
      return String(a?.id || "").localeCompare(String(b?.id || ""), "ru");
    });
    messagesChrono.forEach((msg) => {
      if (String(msg?.message_kind || "") !== "REQUEST_DATA") return;
      const items = Array.isArray(msg?.request_data_items) ? msg.request_data_items : [];
      items.forEach((item, idx) => {
        const key = String(item?.key || item?.id || "item-" + idx);
        if (!key) return;
        byKey.set(key, {
          id: String(item?.id || ""),
          key,
          label: String(item?.label || item?.label_short || key),
          field_type: String(item?.field_type || "string").toLowerCase(),
          value_text: item?.value_text == null ? "" : String(item.value_text),
          is_filled: Boolean(item?.is_filled),
          source_message_id: String(msg?.id || ""),
          source_message_created_at: msg?.created_at || null,
          value_file: item?.value_file || null,
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
    const map = new Map();
    safeAttachments.forEach((item) => {
      const messageId = String(item?.message_id || "").trim();
      if (!messageId) return;
      if (!map.has(messageId)) map.set(messageId, []);
      map.get(messageId).push(item);
    });
    return map;
  }, [safeAttachments]);

  const openAttachmentFromMessage = (item) => {
    if (!item?.download_url) return;
    const kind = detectAttachmentPreviewKind(item.file_name, item.mime_type);
    if (kind === "none") {
      window.open(String(item.download_url), "_blank", "noopener,noreferrer");
      return;
    }
    openPreview(item);
  };

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
      label: label || "Поле",
      field_type: fieldType,
      document_name: String(item.document_name || "").trim(),
      value_text: item.value_text == null ? "" : String(item.value_text),
      is_filled: Boolean(item.is_filled),
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
      customType: "string",
    }));
    try {
      const data = await onLoadRequestDataTemplates();
      setDataRequestModal((prev) => ({
        ...prev,
        open: true,
        loading: false,
        templates: Array.isArray(data?.rows) ? data.rows : [],
        templateList: Array.isArray(data?.templates) ? data.templates : [],
        availableDocuments: Array.isArray(data?.documents) ? data.documents : [],
        documentName: "",
        requestTemplateQuery: "",
        catalogFieldQuery: "",
      }));
    } catch (error) {
      setDataRequestModal((prev) => ({ ...prev, loading: false, error: error.message || "Не удалось загрузить шаблоны" }));
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
      templateName: "",
    }));
    try {
      const [batch, templates] = await Promise.all([
        typeof onLoadRequestDataBatch === "function" ? onLoadRequestDataBatch(messageId) : Promise.resolve({ items: [] }),
        typeof onLoadRequestDataTemplates === "function"
          ? onLoadRequestDataTemplates()
          : Promise.resolve({ rows: [], documents: [], templates: [] }),
      ]);
      setDataRequestModal((prev) => ({
        ...prev,
        open: true,
        loading: false,
        messageId: String(messageId),
        rows: Array.isArray(batch?.items) ? batch.items.map(newDataRequestRow) : [],
        documentName: String(batch?.document_name || ""),
        templates: Array.isArray(templates?.rows) ? templates.rows : [],
        templateList: Array.isArray(templates?.templates) ? templates.templates : [],
        availableDocuments: Array.isArray(templates?.documents) ? templates.documents : [],
        requestTemplateQuery: "",
        catalogFieldQuery: "",
      }));
    } catch (error) {
      setDataRequestModal((prev) => ({ ...prev, loading: false, error: error.message || "Не удалось загрузить запрос" }));
    }
  };

  const closeDataRequestModal = () => {
    setDataRequestModal((prev) => ({ ...prev, open: false, error: "", saving: false, savingTemplate: false, templateStatus: "" }));
  };

  const findRequestTemplateByQuery = (queryValue) => {
    const query = String(queryValue || "").trim().toLowerCase();
    if (!query) return null;
    return (
      (dataRequestModal.templateList || []).find((item) => {
        const id = String(item?.id || "").toLowerCase();
        const name = String(item?.name || "").toLowerCase();
        return query === id || query === name;
      }) || null
    );
  };

  const findCatalogFieldByQuery = (queryValue) => {
    const query = String(queryValue || "").trim().toLowerCase();
    if (!query) return null;
    return (
      (dataRequestModal.templates || []).find((item) => {
        const id = String(item?.id || "").toLowerCase();
        const key = String(item?.key || "").toLowerCase();
        const label = String(item?.label || "").toLowerCase();
        return query === id || query === key || query === label;
      }) || null
    );
  };

  const applyRequestTemplateById = async (rawTemplateId, templateNameHint) => {
    if (typeof onLoadRequestDataTemplateDetails !== "function") return;
    const templateId = String(rawTemplateId || "").trim();
    if (!templateId) return;
    setDataRequestModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await onLoadRequestDataTemplateDetails(templateId);
      const incomingRows = (Array.isArray(data?.items) ? data.items : []).map((item) =>
        newDataRequestRow({
          ...item,
          topic_template_id: item.topic_data_template_id || item.topic_template_id || "",
          field_type: item.value_type || item.field_type,
        })
      );
      setDataRequestModal((prev) => ({
        ...prev,
        loading: false,
        rows: mergeRequestDataRows(prev.rows, incomingRows),
        selectedRequestTemplateId: String(data?.template?.id || prev.selectedRequestTemplateId || ""),
        requestTemplateQuery: String(data?.template?.name || templateNameHint || prev.requestTemplateQuery || ""),
        templateStatus: "",
      }));
    } catch (error) {
      setDataRequestModal((prev) => ({ ...prev, loading: false, error: error.message || "Не удалось загрузить шаблон" }));
    }
  };

  const applySelectedRequestTemplate = async () => {
    const selectedByQuery = findRequestTemplateByQuery(dataRequestModal.requestTemplateQuery);
    const templateId = String(selectedByQuery?.id || dataRequestModal.selectedRequestTemplateId || "").trim();
    return applyRequestTemplateById(templateId, selectedByQuery?.name || "");
  };

  const refreshDataRequestCatalog = async () => {
    if (typeof onLoadRequestDataTemplates !== "function") return null;
    const data = await onLoadRequestDataTemplates();
    setDataRequestModal((prev) => ({
      ...prev,
      templates: Array.isArray(data?.rows) ? data.rows : [],
      templateList: Array.isArray(data?.templates) ? data.templates : [],
      availableDocuments: Array.isArray(data?.documents) ? data.documents : [],
      selectedRequestTemplateId: prev.selectedRequestTemplateId && (Array.isArray(data?.templates) ? data.templates : []).some((item) => String(item?.id) === String(prev.selectedRequestTemplateId))
        ? prev.selectedRequestTemplateId
        : "",
    }));
    return data;
  };

  const saveCurrentDataRequestTemplate = async () => {
    if (typeof onSaveRequestDataTemplate !== "function") return;
    const selectedFromQuery = findRequestTemplateByQuery(dataRequestModal.requestTemplateQuery);
    const templateName = String(dataRequestModal.requestTemplateQuery || "").trim();
    const rows = (dataRequestModal.rows || []).filter((row) => String(row.label || "").trim());
    if (!templateName) {
      setDataRequestModal((prev) => ({ ...prev, error: "Укажите название шаблона" }));
      return;
    }
    if (!rows.length) {
      setDataRequestModal((prev) => ({ ...prev, error: "Добавьте хотя бы одно поле для шаблона" }));
      return;
    }
    setDataRequestModal((prev) => ({ ...prev, savingTemplate: true, error: "", templateStatus: "" }));
    try {
      const result = await onSaveRequestDataTemplate({
        template_id: String(selectedFromQuery?.id || dataRequestModal.selectedRequestTemplateId || "").trim() || undefined,
        name: templateName,
        items: rows.map((row) => ({
          topic_data_template_id: row.topic_template_id || undefined,
          key: row.key || undefined,
          label: row.label,
          value_type: row.field_type || "string",
        })),
      });
      const savedRows = (Array.isArray(result?.items) ? result.items : []).map((item) =>
        newDataRequestRow({
          ...item,
          topic_template_id: item.topic_data_template_id || item.topic_template_id || "",
          field_type: item.value_type || item.field_type,
        })
      );
      setDataRequestModal((prev) => ({
        ...prev,
        savingTemplate: false,
        rows: savedRows.length ? savedRows : prev.rows,
        selectedRequestTemplateId: String(result?.template?.id || prev.selectedRequestTemplateId || ""),
        requestTemplateQuery: String(result?.template?.name || templateName),
        templateStatus: "Шаблон сохранен",
      }));
      await refreshDataRequestCatalog();
    } catch (error) {
      setDataRequestModal((prev) => ({ ...prev, savingTemplate: false, error: error.message || "Не удалось сохранить шаблон" }));
    }
  };

  const addSelectedTemplateRow = () => {
    const selectedByQuery = findCatalogFieldByQuery(dataRequestModal.catalogFieldQuery);
    const templateId = String(selectedByQuery?.id || dataRequestModal.selectedCatalogTemplateId || "").trim();
    const template = (dataRequestModal.templates || []).find((item) => String(item.id) === templateId);
    if (!template) {
      const manualLabel = String(dataRequestModal.catalogFieldQuery || "").trim();
      if (!manualLabel) return;
      setDataRequestModal((prev) => ({
        ...prev,
        catalogFieldQuery: "",
        templateStatus: "",
        rows: [...(prev.rows || []), newDataRequestRow({ label: manualLabel, field_type: "string" })],
      }));
      return;
    }
    setDataRequestModal((prev) => {
      const exists = (prev.rows || []).some((row) => String(row.key || "") === String(template.key || ""));
      if (exists) return { ...prev, selectedCatalogTemplateId: "", catalogFieldQuery: "" };
      return {
        ...prev,
        selectedCatalogTemplateId: "",
        catalogFieldQuery: "",
        templateStatus: "",
        rows: [...(prev.rows || []), newDataRequestRow({ ...template, topic_template_id: template.id, field_type: template.value_type })],
      };
    });
  };

  const updateDataRequestRow = (localId, patch) => {
    setDataRequestModal((prev) => ({
      ...prev,
      templateStatus: "",
      rows: (prev.rows || []).map((row) => (row.localId === localId ? { ...row, ...(patch || {}) } : row)),
    }));
  };

  const removeDataRequestRow = (localId) => {
    setDataRequestModal((prev) => ({
      ...prev,
      templateStatus: "",
      rows: (prev.rows || []).filter((row) => row.localId !== localId),
    }));
  };

  const moveDataRequestRow = (localId, delta) => {
    const shift = Number(delta) || 0;
    if (!shift) return;
    setDataRequestModal((prev) => {
      const rows = Array.isArray(prev.rows) ? [...prev.rows] : [];
      const index = rows.findIndex((row) => row.localId === localId);
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
    const rows = (dataRequestModal.rows || []).filter((row) => String(row.label || "").trim());
    if (!rows.length) {
      setDataRequestModal((prev) => ({ ...prev, error: "Добавьте хотя бы одно поле" }));
      return;
    }
    setDataRequestModal((prev) => ({ ...prev, saving: true, error: "" }));
    try {
      await onSaveRequestDataBatch({
        message_id: dataRequestModal.messageId || undefined,
        items: rows.map((row) => ({
          id: row.id || undefined,
          topic_template_id: row.topic_template_id || undefined,
          key: row.key || undefined,
          label: row.label,
          field_type: row.field_type || "string",
          document_name: row.document_name || undefined,
        })),
      });
      closeDataRequestModal();
    } catch (error) {
      setDataRequestModal((prev) => ({ ...prev, saving: false, error: error.message || "Не удалось отправить запрос" }));
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
      // noop for browsers that restrict custom drag payloads
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
          (item) =>
            item &&
            item.name === file.name &&
            Number(item.size || 0) === Number(file.size || 0) &&
            Number(item.lastModified || 0) === Number(file.lastModified || 0)
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
    if (!row?.id || typeof onChangeStatus !== "function") return;
    const nextStatus = String(statusChangeModal.statusCode || "").trim();
    if (!nextStatus) {
      setStatusChangeModal((prev) => ({ ...prev, error: "Выберите новый статус" }));
      return;
    }
    if (nextStatus === String(row?.status_code || "").trim()) {
      setStatusChangeModal((prev) => ({ ...prev, error: "Выберите статус, отличный от текущего" }));
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
        files: statusChangeModal.files || [],
      });
      closeStatusChangeModal();
    } catch (error) {
      setStatusChangeModal((prev) => ({ ...prev, saving: false, error: error.message || "Не удалось сменить статус" }));
    }
  };

  const chatTimelineItems = [];
  let previousDate = "";
  const timelineSource = [];
  safeMessages.forEach((item) => {
    timelineSource.push({
      type: "message",
      key: "msg-" + String(item?.id || Math.random()),
      created_at: item?.created_at || null,
      payload: item,
    });
  });
  safeAttachments
    .filter((item) => !String(item?.message_id || "").trim())
    .forEach((item) => {
      timelineSource.push({
        type: "file",
        key: "file-" + String(item?.id || Math.random()),
        created_at: item?.created_at || null,
        payload: item,
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
    const normalizedDate = dateLabel && dateLabel !== "-" ? dateLabel : "Без даты";
    if (normalizedDate !== previousDate) {
      chatTimelineItems.push({ type: "date", key: "date-" + normalizedDate + "-" + index, label: normalizedDate });
      previousDate = normalizedDate;
    }
    chatTimelineItems.push(entry);
  });

  const routeNodes =
    Array.isArray(statusRouteNodes) && statusRouteNodes.length
      ? statusRouteNodes
      : row?.status_code
        ? [{ code: row.status_code, name: statusLabel(row.status_code), state: "current", note: "Текущий этап обработки заявки" }]
        : [];

  const AttachmentPreviewModal = AttachmentPreviewModalComponent;
  const StatusLine = StatusLineComponent;

  const renderRequestDataMessageItems = (payload) => {
    const items = Array.isArray(payload?.request_data_items) ? payload.request_data_items : [];
    const allFilled = Boolean(payload?.request_data_all_filled);
    if (!items.length) return <p className="chat-message-text">Запрос</p>;
    if (allFilled) {
      const fileOnly = items.length === 1 && String(items[0]?.field_type || "").toLowerCase() === "file";
      return <p className="chat-message-text chat-request-data-collapsed">{fileOnly ? "Файл" : "Запрос"}</p>;
    }
    const visibleItems = items.slice(0, 7);
    const hiddenCount = Math.max(0, items.length - visibleItems.length);
    return (
      <div className="chat-request-data-list">
        {visibleItems.map((item, idx) => (
          <div className={"chat-request-data-item" + (item?.is_filled ? " filled" : "")} key={String(item?.id || idx)}>
            <span className="chat-request-data-index">
              {item?.is_filled ? <span className="chat-request-data-check">✓</span> : null}
              {String(item?.index || idx + 1) + "."}
            </span>
            <span className="chat-request-data-label">{String(item?.label_short || item?.label || "Поле")}</span>
          </div>
        ))}
        {hiddenCount > 0 ? <div className="chat-request-data-more">... еще {hiddenCount}</div> : null}
      </div>
    );
  };

  const formatRequestDataValue = (item) => {
    const type = String(item?.field_type || "string").toLowerCase();
    if (type === "date") {
      const text = String(item?.value_text || "").trim();
      return text ? fmtDateOnly(text) : "Не заполнено";
    }
    if (type === "file") {
      const attachmentId = String(item?.value_text || "").trim();
      const linkedAttachment = attachmentId ? attachmentById.get(attachmentId) : null;
      const fileMeta = item?.value_file || (linkedAttachment ? {
        attachment_id: linkedAttachment.id,
        file_name: linkedAttachment.file_name,
        mime_type: linkedAttachment.mime_type,
        size_bytes: linkedAttachment.size_bytes,
        download_url: linkedAttachment.download_url,
      } : null);
      return fileMeta || null;
    }
    const text = String(item?.value_text || "").trim();
    return text || "Не заполнено";
  };

  return (
    <div className="block">
      <div className="request-workspace-layout">
        <div className="request-main-column">
          <div className="block">
            <div className="request-card-head">
              <h3>Карточка</h3>
              <div className="request-card-head-actions">
                {canRequestData ? (
                  <button
                    type="button"
                    className="icon-btn request-card-status-btn"
                    data-tooltip="Сменить статус"
                    aria-label="Сменить статус"
                    onClick={() => openStatusChangeModal()}
                    disabled={loading || !row}
                  >
                    ⇄
                  </button>
                ) : null}
                <button
                  type="button"
                  className="icon-btn request-card-data-btn"
                  data-tooltip="Данные заявки"
                  aria-label="Данные заявки"
                  onClick={() => setRequestDataListOpen(true)}
                  disabled={loading || !row}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                    <path d="M4 5h16v2H4V5Zm0 6h16v2H4v-2Zm0 6h10v2H4v-2Z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-btn request-card-finance-btn"
                  data-tooltip="Финансы заявки"
                  aria-label="Финансы заявки"
                  onClick={() => setFinanceOpen(true)}
                  disabled={loading || !row}
                >
                  $
                </button>
              </div>
            </div>
            {loading ? (
              <p className="muted">Загрузка...</p>
            ) : row ? (
              <>
                <div className="request-card-grid request-card-grid-compact">
                  <div className="request-field">
                    <span className="request-field-label">Тема</span>
                    <span className="request-field-value">{String(row.topic_name || row.topic_code || "-")}</span>
                  </div>
                  <div className="request-field">
                    <span className="request-field-label">Статус</span>
                    <span className="request-field-value">{statusLabel(row.status_code)}</span>
                  </div>
                  <div className="request-field request-field-span-2 request-field-description">
                    <div className="request-field-head">
                      <span className="request-field-label">Описание проблемы</span>
                      <button
                        type="button"
                        className="icon-btn request-field-expand-btn"
                        data-tooltip="Развернуть описание"
                        aria-label="Развернуть описание"
                        onClick={() => setDescriptionOpen(true)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                          <path
                            d="M4 9V4h5v2H6v3H4zm10-5h6v6h-2V6h-4V4zM4 15h2v3h3v2H4v-5zm14 3v-3h2v5h-5v-2h3z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    </div>
                    <span className="request-field-value">
                      {row.description ? String(row.description) : "Описание не заполнено"}
                    </span>
                  </div>
                  <div className="request-field">
                    <span className="request-field-label">Клиент</span>
                    <span
                      className={"request-field-value" + (clientHasPhone ? " has-tooltip request-contact-value" : "")}
                      data-tooltip={clientHasPhone ? clientPhone : undefined}
                    >
                      {clientLabel}
                    </span>
                  </div>
                  <div className="request-field">
                    <span className="request-field-label">Юрист</span>
                    <span
                      className={"request-field-value" + (lawyerHasPhone ? " has-tooltip request-contact-value" : "")}
                      data-tooltip={lawyerHasPhone ? lawyerPhone : undefined}
                    >
                      {lawyerLabel}
                    </span>
                  </div>
                  <div className="request-field">
                    <span className="request-field-label">Создана</span>
                    <span className="request-field-value">{fmtShortDateTime(row.created_at)}</span>
                  </div>
                  <div className="request-field">
                    <span className="request-field-label">Изменена</span>
                    <span className="request-field-value">{fmtShortDateTime(row.updated_at)}</span>
                  </div>
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
                {"Файлы" + (safeAttachments.length ? " (" + safeAttachments.length + ")" : "")}
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
                    ) : entry.type === "file" ? (
                      <li
                        key={entry.key}
                        className={
                          "chat-message " +
                          (String(entry.payload?.responsible || "").toUpperCase().includes("КЛИЕНТ") ? "incoming" : "outgoing")
                        }
                      >
                        <div className="chat-message-author">{String(entry.payload?.responsible || "Система")}</div>
                        <div className="chat-message-bubble">
                          <div className="chat-message-files">
                            <button
                              type="button"
                              className="chat-message-file-chip"
                              onClick={() => openAttachmentFromMessage(entry.payload)}
                              title={String(entry.payload?.file_name || "Файл")}
                            >
                              <span className="chat-message-file-icon" aria-hidden="true">
                                📎
                              </span>
                              <span className="chat-message-file-name">{String(entry.payload?.file_name || "Файл")}</span>
                            </button>
                          </div>
                          <div className="chat-message-time">{fmtTimeOnly(entry.payload?.created_at)}</div>
                        </div>
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
                        <div
                          className={
                            "chat-message-bubble" +
                            (String(entry.payload?.message_kind || "") === "REQUEST_DATA" ? " chat-request-data-bubble" : "") +
                            (entry.payload?.request_data_all_filled ? " all-filled" : "")
                          }
                          onClick={
                            String(entry.payload?.message_kind || "") === "REQUEST_DATA" && canRequestData
                              ? () => openEditDataRequestModal(String(entry.payload?.id || ""))
                              : undefined
                          }
                          role={String(entry.payload?.message_kind || "") === "REQUEST_DATA" && canRequestData ? "button" : undefined}
                          tabIndex={String(entry.payload?.message_kind || "") === "REQUEST_DATA" && canRequestData ? 0 : undefined}
                          onKeyDown={
                            String(entry.payload?.message_kind || "") === "REQUEST_DATA" && canRequestData
                              ? (event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    openEditDataRequestModal(String(entry.payload?.id || ""));
                                  }
                                }
                              : undefined
                          }
                        >
                          {String(entry.payload?.message_kind || "") === "REQUEST_DATA" ? (
                            <>
                              <div className="chat-request-data-head">Запрос</div>
                              {renderRequestDataMessageItems(entry.payload)}
                            </>
                          ) : (
                            <p className="chat-message-text">{String(entry.payload?.body || "")}</p>
                          )}
                          {(() => {
                            if (String(entry.payload?.message_kind || "") === "REQUEST_DATA") return null;
                            const messageId = String(entry.payload?.id || "").trim();
                            if (!messageId) return null;
                            const messageFiles = attachmentsByMessageId.get(messageId) || [];
                            if (!messageFiles.length) return null;
                            return (
                              <div className="chat-message-files">
                                {messageFiles.map((file) => (
                                  <button
                                    type="button"
                                    key={String(file.id)}
                                    className="chat-message-file-chip"
                                    onClick={() => openAttachmentFromMessage(file)}
                                    title={String(file.file_name || "Файл")}
                                  >
                                    <span className="chat-message-file-icon" aria-hidden="true">
                                      📎
                                    </span>
                                    <span className="chat-message-file-name">{String(file.file_name || "Файл")}</span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
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
                  {canRequestData ? (
                    <button
                      className="btn secondary btn-sm"
                      type="button"
                      onClick={openCreateDataRequestModal}
                      disabled={loading || fileUploading}
                    >
                      Запросить
                    </button>
                  ) : null}
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
                {safeAttachments.length ? (
                  safeAttachments.map((item) => (
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
                <span className="muted">
                  {"Сообщений: " + String(safeMessages.length) + " • Общий размер файлов: " + fmtBytes(totalFilesBytes)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      {StatusLine ? <StatusLine status={status} /> : null}
      {AttachmentPreviewModal ? (
        <AttachmentPreviewModal
          open={preview.open}
          title="Предпросмотр файла"
          url={preview.url}
          fileName={preview.fileName}
          mimeType={preview.mimeType}
          onClose={closePreview}
        />
      ) : null}
      <div
        className={"overlay" + (statusChangeModal.open ? " open" : "")}
        onClick={closeStatusChangeModal}
        aria-hidden={statusChangeModal.open ? "false" : "true"}
      >
        <div className="modal request-status-change-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>Смена статуса</h3>
              <p className="muted request-finance-subtitle">
                {row?.track_number ? "Заявка " + String(row.track_number) : "Выберите статус и важную дату"}
              </p>
            </div>
            <button className="close" type="button" onClick={closeStatusChangeModal} aria-label="Закрыть">
              ×
            </button>
          </div>
          <input
            ref={statusChangeFileInputRef}
            type="file"
            multiple
            onChange={(event) => {
              appendStatusChangeFiles(Array.from((event.target && event.target.files) || []));
              event.target.value = "";
            }}
            style={{ position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none" }}
          />
          <form className="stack" onSubmit={submitStatusChange}>
            <div className="request-status-change-grid">
              <div className="field">
                <label htmlFor="status-change-next-status">Новый статус</label>
                <select
                  id="status-change-next-status"
                  value={statusChangeModal.statusCode}
                  onChange={(event) => setStatusChangeModal((prev) => ({ ...prev, statusCode: event.target.value, error: "" }))}
                  disabled={statusChangeModal.saving || loading}
                >
                  <option value="">Выберите статус</option>
                  {statusOptions
                    .filter((item) => item.code !== String(row?.status_code || "").trim())
                    .filter((item) =>
                      Array.isArray(statusChangeModal.allowedStatusCodes) && statusChangeModal.allowedStatusCodes.length
                        ? statusChangeModal.allowedStatusCodes.includes(item.code)
                        : true
                    )
                    .map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name + " (" + item.code + ")" + (item.groupName ? " • " + item.groupName : "")}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="status-change-important-date">Важная дата (дедлайн)</label>
                <input
                  id="status-change-important-date"
                  type="datetime-local"
                  value={statusChangeModal.importantDateAt}
                  onChange={(event) => setStatusChangeModal((prev) => ({ ...prev, importantDateAt: event.target.value, error: "" }))}
                  disabled={statusChangeModal.saving || loading}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="status-change-comment">Комментарий к смене статуса</label>
              <textarea
                id="status-change-comment"
                placeholder="Комментарий будет добавлен в историю и чат (если указан)"
                value={statusChangeModal.comment}
                onChange={(event) => setStatusChangeModal((prev) => ({ ...prev, comment: event.target.value }))}
                disabled={statusChangeModal.saving || loading}
              />
            </div>
            <div className="request-status-change-files">
              <div className="request-status-change-files-head">
                <b>Вложения</b>
                <button
                  type="button"
                  className="icon-btn file-action-btn"
                  data-tooltip="Прикрепить файлы"
                  onClick={() => statusChangeFileInputRef.current?.click()}
                  disabled={statusChangeModal.saving || loading}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                    <path
                      d="M8.6 13.8 15 7.4a3 3 0 0 1 4.2 4.2l-8.1 8.1a5 5 0 1 1-7.1-7.1l8.6-8.6a1 1 0 0 1 1.4 1.4l-8.6 8.6a3 3 0 1 0 4.2 4.2l8.1-8.1a1 1 0 0 0-1.4-1.4l-6.4 6.4a1 1 0 0 1-1.4-1.4z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
              {Array.isArray(statusChangeModal.files) && statusChangeModal.files.length ? (
                <div className="request-pending-files">
                  {statusChangeModal.files.map((file, index) => (
                    <div className="pending-file-chip" key={(file.name || "file") + "-" + String(file.lastModified || index)}>
                      <span className="pending-file-icon" aria-hidden="true">📎</span>
                      <span className="pending-file-name">{file.name}</span>
                      <button
                        type="button"
                        className="pending-file-remove"
                        aria-label={"Удалить файл " + file.name}
                        onClick={() => removeStatusChangeFile(index)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Файлы не добавлены</p>
              )}
            </div>
            <div className="request-status-history-block">
              <div className="request-status-history-head">
                <b>История статусов</b>
                <span className="muted">{safeStatusHistory.length ? String(safeStatusHistory.length) + " записей" : "Нет записей"}</span>
              </div>
              <ol className="request-route-list request-status-history-list">
                {safeStatusHistory.length ? (
                  safeStatusHistory.map((item, index) => {
                    const statusCode = String(item?.to_status || "");
                    const statusMeta = statusByCode.get(statusCode);
                    const itemClass =
                      "route-item request-status-history-route-item " + (index === 0 ? "current" : "completed");
                    return (
                      <li key={String(item?.id || index)} className={itemClass}>
                        <span className="route-dot" />
                        <div className="route-body">
                          <div className="request-status-history-row">
                            <b>{String(item?.to_status_name || statusMeta?.name || statusLabel(statusCode) || statusCode || "-")}</b>
                            {statusMeta?.isTerminal ? <span className="request-status-history-chip">Терминальный</span> : null}
                          </div>
                          <div className="muted route-time">{fmtShortDateTime(item?.changed_at)}</div>
                          <div className="request-status-history-meta">
                            <span>{"Важная дата: " + fmtShortDateTime(item?.important_date_at)}</span>
                            <span>{"Длительность: " + formatDuration(item?.duration_seconds)}</span>
                          </div>
                          {item?.from_status ? (
                            <div className="request-status-history-meta">
                              <span>{"Из: " + statusLabel(item.from_status)}</span>
                            </div>
                          ) : null}
                          {String(item?.comment || "").trim() ? (
                            <div className="request-status-history-comment">{String(item.comment)}</div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })
                ) : (
                  <li className="muted">История изменений статусов пока пустая</li>
                )}
              </ol>
            </div>
            {statusChangeModal.error ? <div className="status error">{statusChangeModal.error}</div> : null}
            <div className="modal-actions modal-actions-right">
              <button
                type="submit"
                className="btn btn-sm request-data-submit-btn"
                disabled={statusChangeModal.saving || loading}
              >
                {statusChangeModal.saving ? "Сохранение..." : "Отправить"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div
        className={"overlay" + (financeOpen ? " open" : "")}
        onClick={() => setFinanceOpen(false)}
        aria-hidden={financeOpen ? "false" : "true"}
      >
        <div className="modal request-finance-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>Финансы заявки</h3>
              <p className="muted request-finance-subtitle">
                {row?.track_number ? "Заявка " + String(row.track_number) : "Данные по заявке"}
              </p>
            </div>
            <button className="close" type="button" onClick={() => setFinanceOpen(false)} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div className="request-card-grid request-finance-grid">
            <div className="request-field">
              <span className="request-field-label">Стоимость</span>
              <span className="request-field-value">{fmtAmount(finance?.request_cost ?? row?.request_cost)}</span>
            </div>
            <div className="request-field">
              <span className="request-field-label">Оплачено</span>
              <span className="request-field-value">{fmtAmount(finance?.paid_total)}</span>
            </div>
            <div className="request-field">
              <span className="request-field-label">Дата оплаты</span>
              <span className="request-field-value">{fmtShortDateTime(finance?.last_paid_at ?? row?.paid_at)}</span>
            </div>
            {canSeeRate ? (
              <div className="request-field">
                <span className="request-field-label">Ставка</span>
                <span className="request-field-value">{fmtAmount(finance?.effective_rate ?? row?.effective_rate)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div
        className={"overlay" + (descriptionOpen ? " open" : "")}
        onClick={() => setDescriptionOpen(false)}
        aria-hidden={descriptionOpen ? "false" : "true"}
      >
        <div className="modal request-description-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>{row?.track_number ? "Заявка " + String(row.track_number) : "Заявка"}</h3>
              <div className="request-description-modal-headline">
                <p className="muted request-finance-subtitle">
                  {String(row?.topic_name || row?.topic_code || "Тема не указана")}
                </p>
                <span className="request-description-status-chip">{statusLabel(row?.status_code)}</span>
              </div>
            </div>
            <button className="close" type="button" onClick={() => setDescriptionOpen(false)} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div className="request-description-modal-body">
            <div className="request-description-modal-main">
              <div className="request-description-modal-title">
                <span className="request-field-label">Описание проблемы</span>
              </div>
              <div className="request-description-modal-text">
                {row?.description ? String(row.description) : "Описание не заполнено"}
              </div>
            </div>
            <div className="request-description-modal-meta-wrap">
              <div className="request-description-modal-meta">
                <div className="request-description-meta-item">
                  <span className="request-field-label">Клиент</span>
                  <span
                    className={"request-field-value" + (clientHasPhone ? " has-tooltip request-contact-value" : "")}
                    data-tooltip={clientHasPhone ? clientPhone : undefined}
                  >
                    {clientLabel}
                  </span>
                </div>
                <div className="request-description-meta-item align-right">
                  <span className="request-field-label">Юрист</span>
                  <span
                    className={"request-field-value" + (lawyerHasPhone ? " has-tooltip request-contact-value" : "")}
                    data-tooltip={lawyerHasPhone ? lawyerPhone : undefined}
                  >
                    {lawyerLabel}
                  </span>
                </div>
                <div className="request-description-meta-item">
                  <span className="request-field-label">Создана</span>
                  <span className="request-field-value">{fmtShortDateTime(row?.created_at)}</span>
                </div>
                <div className="request-description-meta-item align-right">
                  <span className="request-field-label">Изменена</span>
                  <span className="request-field-value">{fmtShortDateTime(row?.updated_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        className={"overlay" + (dataRequestModal.open ? " open" : "")}
        onClick={closeDataRequestModal}
        aria-hidden={dataRequestModal.open ? "false" : "true"}
      >
        <div className="modal request-data-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>{dataRequestModal.messageId ? "Редактирование запроса данных" : "Запрос дополнительных данных"}</h3>
              <p className="muted request-finance-subtitle">
                {row?.track_number ? "Заявка " + String(row.track_number) : "Выберите поля для запроса"}
              </p>
            </div>
            <button className="close" type="button" onClick={closeDataRequestModal} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div className="stack">
            <div className="request-data-modal-grid">
              <div className="field">
                <label htmlFor="request-data-request-template-select">Шаблон запроса (поиск)</label>
                <div className="request-data-combobox">
                  <input
                    id="request-data-request-template-select"
                    value={dataRequestModal.requestTemplateQuery}
                    onChange={(event) =>
                      setDataRequestModal((prev) => ({
                        ...prev,
                        requestTemplateQuery: event.target.value,
                        selectedRequestTemplateId: "",
                        templateStatus: "",
                        error: "",
                      }))
                    }
                    onFocus={() => setRequestTemplateSuggestOpen(true)}
                    onBlur={() => window.setTimeout(() => setRequestTemplateSuggestOpen(false), 120)}
                    disabled={dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate}
                    placeholder="Введите название шаблона"
                  />
                  {requestTemplateBadge ? (
                    <span className={"request-data-template-badge " + requestTemplateBadge.kind}>{requestTemplateBadge.label}</span>
                  ) : null}
                  {requestTemplateSuggestOpen && filteredRequestTemplates.length ? (
                    <div className="request-data-suggest-list" role="listbox" aria-label="Шаблоны запроса">
                      {filteredRequestTemplates.map((tpl) => (
                        <button
                          key={String(tpl.id)}
                          type="button"
                          className="request-data-suggest-item"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setDataRequestModal((prev) => ({
                              ...prev,
                              requestTemplateQuery: String(tpl.name || ""),
                              selectedRequestTemplateId: String(tpl.id || ""),
                              error: "",
                              templateStatus: "",
                            }));
                            setRequestTemplateSuggestOpen(false);
                            void applyRequestTemplateById(String(tpl.id || ""), String(tpl.name || ""));
                          }}
                        >
                          <span>{String(tpl.name || "Шаблон")}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="request-data-modal-actions-inline">
                <button
                  type="button"
                  className="icon-btn"
                  data-tooltip={
                    !canSaveSelectedRequestTemplate
                      ? "Чужой шаблон недоступен для изменения"
                      : requestTemplateActionMode === "save"
                      ? "Перезаписать шаблон"
                      : requestTemplateActionMode === "create"
                        ? "Создать шаблон"
                        : "Введите название шаблона"
                  }
                  onClick={saveCurrentDataRequestTemplate}
                  disabled={
                    !canSaveSelectedRequestTemplate ||
                    dataRequestModal.loading ||
                    dataRequestModal.saving ||
                    dataRequestModal.savingTemplate
                  }
                >
                  {dataRequestModal.savingTemplate ? "…" : requestTemplateActionMode === "create" ? "✚" : "💾"}
                </button>
              </div>
            </div>
            {dataRequestModal.templateStatus ? <div className="status ok">{dataRequestModal.templateStatus}</div> : null}

            <div className="request-data-modal-grid">
              <div className="field">
                <label htmlFor="request-data-template-select">Поле данных (поиск по справочнику)</label>
                <div className="request-data-combobox">
                  <input
                    id="request-data-template-select"
                    value={dataRequestModal.catalogFieldQuery}
                    onChange={(event) =>
                      setDataRequestModal((prev) => ({
                        ...prev,
                        catalogFieldQuery: event.target.value,
                        selectedCatalogTemplateId: "",
                        templateStatus: "",
                        error: "",
                      }))
                    }
                    onFocus={() => setCatalogFieldSuggestOpen(true)}
                    onBlur={() => window.setTimeout(() => setCatalogFieldSuggestOpen(false), 120)}
                    disabled={dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate}
                    placeholder="Начните вводить наименование поля"
                    autoComplete="off"
                  />
                  {catalogFieldSuggestOpen && filteredCatalogFields.length ? (
                    <div className="request-data-suggest-list" role="listbox" aria-label="Поля данных">
                      {filteredCatalogFields.map((tpl) => (
                        <button
                          key={String(tpl.id)}
                          type="button"
                          className="request-data-suggest-item"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setDataRequestModal((prev) => ({
                              ...prev,
                              catalogFieldQuery: String(tpl.label || tpl.key || ""),
                              selectedCatalogTemplateId: String(tpl.id || ""),
                              error: "",
                              templateStatus: "",
                            }));
                            setCatalogFieldSuggestOpen(false);
                          }}
                        >
                          <span>{String(tpl.label || tpl.key)}</span>
                          <small>{String(tpl.value_type || "string")}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="request-data-modal-actions-inline">
                <button
                  type="button"
                  className="icon-btn"
                  data-tooltip={catalogFieldActionMode === "add" ? "Добавить поле из справочника" : "Создать новое поле"}
                  onClick={addSelectedTemplateRow}
                  disabled={
                    !String(dataRequestModal.catalogFieldQuery || "").trim() && !selectedCatalogFieldCandidate ||
                    dataRequestModal.loading ||
                    dataRequestModal.saving ||
                    dataRequestModal.savingTemplate
                  }
                >
                  {catalogFieldActionMode === "add" ? "+" : "✚"}
                </button>
              </div>
            </div>

            <div className="request-data-rows">
              {(dataRequestModal.rows || []).length ? (
                (dataRequestModal.rows || []).map((rowItem, idx) => (
                  <div
                    className={
                      "request-data-row" +
                      (String(draggedRequestRowId) === String(rowItem.localId) ? " dragging" : "") +
                      (String(dragOverRequestRowId) === String(rowItem.localId) && String(draggedRequestRowId) !== String(rowItem.localId) ? " drag-over" : "") +
                      (viewerRoleCode === "LAWYER" && rowItem?.is_filled ? " row-locked" : "")
                    }
                    key={rowItem.localId}
                    onDragOver={(event) => {
                      if (!draggedRequestRowId) return;
                      event.preventDefault();
                      if (viewerRoleCode === "LAWYER" && rowItem?.is_filled) return;
                      setDragOverRequestRowId(String(rowItem.localId || ""));
                    }}
                    onDrop={(event) => {
                      if (!draggedRequestRowId) return;
                      event.preventDefault();
                      if (viewerRoleCode === "LAWYER" && rowItem?.is_filled) return;
                      moveDataRequestRowToIndex(draggedRequestRowId, idx);
                      handleRequestRowDragEnd();
                    }}
                  >
                    <button
                      type="button"
                      className="icon-btn request-data-row-index-handle"
                      data-tooltip={
                        viewerRoleCode === "LAWYER" && rowItem?.is_filled
                          ? "Заполненное поле: перемещение недоступно"
                          : "Перетащите для изменения порядка"
                      }
                      draggable={!(viewerRoleCode === "LAWYER" && rowItem?.is_filled)}
                      onDragStart={(event) => handleRequestRowDragStart(event, rowItem, viewerRoleCode === "LAWYER" && rowItem?.is_filled)}
                      onDragEnd={handleRequestRowDragEnd}
                      disabled={
                        dataRequestModal.loading ||
                        dataRequestModal.saving ||
                        dataRequestModal.savingTemplate ||
                        (viewerRoleCode === "LAWYER" && rowItem?.is_filled)
                      }
                      aria-label={"Порядок поля " + String(idx + 1)}
                    >
                      <span>{idx + 1}</span>
                    </button>
                    <div className="field">
                      <label>Наименование</label>
                      <input
                        value={rowItem.label}
                        onChange={(event) => updateDataRequestRow(rowItem.localId, { label: event.target.value })}
                        disabled={
                          dataRequestModal.loading ||
                          dataRequestModal.saving ||
                          dataRequestModal.savingTemplate ||
                          (viewerRoleCode === "LAWYER" && rowItem?.is_filled)
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Тип</label>
                      <select
                        value={rowItem.field_type || "string"}
                        onChange={(event) => updateDataRequestRow(rowItem.localId, { field_type: event.target.value })}
                        disabled={
                          dataRequestModal.loading ||
                          dataRequestModal.saving ||
                          dataRequestModal.savingTemplate ||
                          (viewerRoleCode === "LAWYER" && rowItem?.is_filled)
                        }
                      >
                        {requestDataTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="request-data-row-controls">
                      <button
                        type="button"
                        className="icon-btn danger request-data-row-action-btn"
                        data-tooltip={
                          viewerRoleCode === "LAWYER" && rowItem?.is_filled
                            ? "Юрист не может удалить заполненное поле"
                            : "Удалить поле"
                        }
                        onClick={() => removeDataRequestRow(rowItem.localId)}
                        disabled={
                          dataRequestModal.loading ||
                          dataRequestModal.saving ||
                          dataRequestModal.savingTemplate ||
                          (viewerRoleCode === "LAWYER" && rowItem?.is_filled)
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted">Поля для запроса еще не добавлены</div>
              )}
            </div>
          </div>
          {dataRequestModal.error ? <div className="status error">{dataRequestModal.error}</div> : null}
          <div className="modal-actions modal-actions-right">
            <button
              type="button"
              className="btn btn-sm request-data-submit-btn"
              onClick={submitDataRequestModal}
              disabled={dataRequestModal.loading || dataRequestModal.saving || dataRequestModal.savingTemplate}
            >
              {dataRequestModal.saving ? "Сохранение..." : "Отправить"}
            </button>
          </div>
        </div>
      </div>
      <div
        className={"overlay" + (requestDataListOpen ? " open" : "")}
        onClick={() => setRequestDataListOpen(false)}
        aria-hidden={requestDataListOpen ? "false" : "true"}
      >
        <div className="modal request-data-summary-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3>Данные заявки</h3>
              <p className="muted request-finance-subtitle">{row?.track_number ? "Заявка " + String(row.track_number) : ""}</p>
            </div>
            <button className="close" type="button" onClick={() => setRequestDataListOpen(false)} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div className="request-data-summary-list">
            {requestDataListItems.length ? (
              requestDataListItems.map((item) => {
                const value = formatRequestDataValue(item);
                const isFile = String(item?.field_type || "").toLowerCase() === "file";
                return (
                  <div className="request-data-summary-row" key={String(item.id || item.key)}>
                    <div className="request-data-summary-label">{String(item.label || humanizeKey(item.key))}</div>
                    <div className="request-data-summary-value">
                      {isFile ? (
                        value && typeof value === "object" ? (
                          <div className="request-data-summary-file">
                            <button type="button" className="chat-message-file-chip" onClick={() => openAttachmentFromMessage(value)}>
                              <span className="chat-message-file-icon" aria-hidden="true">📎</span>
                              <span className="chat-message-file-name">{String(value.file_name || "Файл")}</span>
                            </button>
                          </div>
                        ) : (
                          <span className="muted">Не заполнено</span>
                        )
                      ) : String(value || "Не заполнено")}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="muted">Дополнительные данные по заявке отсутствуют</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RequestWorkspace;
