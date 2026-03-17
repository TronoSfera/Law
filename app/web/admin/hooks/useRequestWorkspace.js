import { createRequestModalState } from "../shared/state.js";
import { fmtShortDateTime } from "../shared/utils.js";

const DEFAULT_INVOICE_REQUISITES = Object.freeze({
  issuer_name: 'ООО "Аудиторы корпоративной безопасности"',
  issuer_inn: "7604226740",
  issuer_kpp: "760401001",
  issuer_address: "г. Ярославль, ул. Богдановича, 6А",
  bank_name: 'АО "АЛЬФА-БАНК"',
  bank_bik: "044525593",
  bank_account: "40702810501860000582",
  bank_corr_account: "30101810200000000593",
});
const UPLOAD_MAX_ATTEMPTS = 4;

async function buildStorageUploadError(response, fallbackMessage) {
  const base = String(fallbackMessage || "Не удалось загрузить файл в хранилище");
  const status = Number(response?.status || 0);
  const statusText = String(response?.statusText || "").trim();
  let details = "";
  try {
    details = String((await response.text()) || "").replace(/\s+/g, " ").trim();
  } catch (_) {
    details = "";
  }
  if (details.length > 180) details = details.slice(0, 180) + "...";
  const parts = [];
  if (status > 0) parts.push("HTTP " + status + (statusText ? " " + statusText : ""));
  if (details) parts.push(details);
  return parts.length ? base + " (" + parts.join("; ") + ")" : base;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function nextUploadRetryDelayMs(attempt) {
  const base = Math.min(1200 * Math.pow(2, Math.max(0, Number(attempt || 1) - 1)), 7000);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function isRetryableUploadError(error) {
  const status = Number(error?.httpStatus || error?.status || 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (status > 0) return false;
  const message = String(error?.message || "").toLowerCase();
  if (!message) return true;
  return (
    message.includes("networkerror") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("network request failed") ||
    message.includes("timeout")
  );
}

function sortRowsByCreatedAt(rows) {
  return [...rows].sort((left, right) => {
    const leftTs = new Date(left?.created_at || left?.updated_at || 0).getTime();
    const rightTs = new Date(right?.created_at || right?.updated_at || 0).getTime();
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) return leftTs - rightTs;
    return String(left?.id || "").localeCompare(String(right?.id || ""), "ru");
  });
}

function mergeRowsById(existingRows, incomingRows) {
  const merged = new Map();
  (Array.isArray(existingRows) ? existingRows : []).forEach((row) => {
    const key = String(row?.id || "").trim();
    if (key) merged.set(key, row);
  });
  (Array.isArray(incomingRows) ? incomingRows : []).forEach((row) => {
    const key = String(row?.id || "").trim();
    if (key) merged.set(key, row);
  });
  return sortRowsByCreatedAt(Array.from(merged.values()));
}

function getOldestMessageCursor(rows) {
  const sorted = sortRowsByCreatedAt(Array.isArray(rows) ? rows : []);
  const first = sorted[0];
  if (!first) return null;
  const beforeId = String(first.id || "").trim();
  const beforeCreatedAt = String(first.created_at || first.updated_at || "").trim();
  if (!beforeId || !beforeCreatedAt) return null;
  return { beforeId, beforeCreatedAt };
}

function collectDeferredMessageIds(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === "object" && row.body_loaded === false && String(row.id || "").trim())
    .map((row) => String(row.id).trim());
}

function normalizeMessageAuthors(rows, users) {
  const usersByEmail = new Map(
    (Array.isArray(users) ? users : [])
      .filter((user) => user && user.email)
      .map((user) => [String(user.email).toLowerCase(), String(user.name || user.email)])
  );
  return (Array.isArray(rows) ? rows : []).map((item) => {
    if (!item || typeof item !== "object") return item;
    const authorType = String(item.author_type || "").toUpperCase();
    const authorName = String(item.author_name || "").trim();
    if ((authorType === "LAWYER" || authorType === "SYSTEM") && authorName.includes("@")) {
      const mapped = usersByEmail.get(authorName.toLowerCase());
      if (mapped) return { ...item, author_name: mapped };
    }
    return item;
  });
}

function buildFinanceSummaryFromInvoices(financeSummaryData, rowData, invoices) {
  if (financeSummaryData && typeof financeSummaryData === "object") return financeSummaryData;
  const paidInvoices = (Array.isArray(invoices) ? invoices : []).filter(
    (item) => String(item?.status || "").toUpperCase() === "PAID"
  );
  const paidTotal = paidInvoices.reduce((acc, item) => {
    const amount = Number(item?.amount || 0);
    return Number.isFinite(amount) ? acc + amount : acc;
  }, 0);
  const latestPaidAt = paidInvoices.reduce((latest, item) => {
    const raw = item?.paid_at;
    const ts = raw ? new Date(raw).getTime() : Number.NaN;
    if (!Number.isFinite(ts)) return latest;
    if (!latest) return String(raw);
    const latestTs = new Date(latest).getTime();
    return ts > latestTs ? String(raw) : latest;
  }, "");
  return {
    request_cost: rowData?.request_cost ?? null,
    effective_rate: rowData?.effective_rate ?? null,
    paid_total: Math.round((paidTotal + Number.EPSILON) * 100) / 100,
    last_paid_at: latestPaidAt || rowData?.paid_at || null,
  };
}

export function useRequestWorkspace(options) {
  const { useCallback, useRef, useState } = React;
  const opts = options || {};
  const api = opts.api;
  const setStatus = opts.setStatus;
  const setActiveSection = opts.setActiveSection;
  const token = opts.token || "";
  const users = Array.isArray(opts.users) ? opts.users : [];
  const resolveAdminObjectSrc = opts.resolveAdminObjectSrc;

  const [requestModal, setRequestModal] = useState(createRequestModalState());
  const requestOpenGuardRef = useRef({ requestId: "", ts: 0 });

  const resetRequestWorkspaceState = useCallback(() => {
    setRequestModal(createRequestModalState());
    requestOpenGuardRef.current = { requestId: "", ts: 0 };
  }, []);

  const hydrateRequestMessageBodies = useCallback(
    async (requestId, rows) => {
      const targetRequestId = String(requestId || "").trim();
      const ids = collectDeferredMessageIds(rows);
      if (!api || !targetRequestId || !ids.length) return null;
      try {
        const payload = await api("/api/admin/chat/requests/" + targetRequestId + "/message-bodies", {
          method: "POST",
          body: { ids },
        });
        const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
        if (!nextRows.length) return payload || null;
        setRequestModal((prev) => {
          if (String(prev.requestId || "") !== targetRequestId) return prev;
          return {
            ...prev,
            messages: mergeRowsById(prev.messages, nextRows),
          };
        });
        return payload || null;
      } catch (_) {
        return null;
      }
    },
    [api]
  );

  const updateRequestModalMessageDraft = useCallback((event) => {
    const value = event.target.value;
    setRequestModal((prev) => ({ ...prev, messageDraft: value }));
  }, []);

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

  const uploadRequestAttachmentWithRetry = useCallback(
    async ({ requestId, file, messageId }) => {
      if (!api) throw new Error("API недоступен");
      const targetRequestId = String(requestId || "").trim();
      if (!targetRequestId) throw new Error("Не выбрана заявка");
      if (!file) throw new Error("Файл не выбран");
      const mimeType = String(file.type || "application/octet-stream");

      const runUploadStepWithRetry = async (label, action) => {
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
        const reason = String(lastError?.message || "Ошибка сети");
        throw new Error(label + ": " + reason + " (попыток: " + attemptsUsed + ")");
      };

      const init = await runUploadStepWithRetry("Не удалось начать загрузку файла", async () => {
        return api("/api/admin/uploads/init", {
          method: "POST",
          body: {
            file_name: file.name,
            mime_type: mimeType,
            size_bytes: file.size,
            scope: "REQUEST_ATTACHMENT",
            request_id: targetRequestId,
          },
        });
      });
      await runUploadStepWithRetry("Не удалось загрузить файл в хранилище", async () => {
        const putResp = await fetch(init.presigned_url, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: file,
        });
        if (putResp.ok) return null;
        const error = new Error(await buildStorageUploadError(putResp, "Не удалось загрузить файл в хранилище"));
        error.httpStatus = Number(putResp.status || 0);
        throw error;
      });
      return runUploadStepWithRetry("Не удалось завершить загрузку файла", async () => {
        return api("/api/admin/uploads/complete", {
          method: "POST",
          body: {
            key: init.key,
            file_name: file.name,
            mime_type: mimeType,
            size_bytes: file.size,
            scope: "REQUEST_ATTACHMENT",
            request_id: targetRequestId,
            message_id: messageId || null,
          },
        });
      });
    },
    [api]
  );

  const loadRequestModalData = useCallback(
    async (requestId, loadOptions) => {
      if (!api || !requestId) return;
      const localOpts = loadOptions || {};
      const showLoading = localOpts.showLoading !== false;

      if (showLoading) {
        setRequestModal((prev) => ({
          ...prev,
          loading: true,
          requestId,
          requestData: null,
          financeSummary: null,
          invoices: [],
          statusRouteNodes: [],
          messagesHasMore: false,
          messagesLoadingMore: false,
          messagesLoadedCount: 0,
          messagesTotal: 0,
        }));
      }

      try {
        const workspaceData = await api("/api/admin/requests/" + requestId + "/workspace?include_related=false");
        const row = workspaceData?.request || null;
        const messagesData = { rows: workspaceData?.messages || [] };
        const statusRouteData = workspaceData?.status_route || { nodes: [] };
        const financeSummaryData = workspaceData?.finance_summary || null;
        const usersById = new Map(users.filter((user) => user && user.id).map((user) => [String(user.id), user]));
        const rowData = row && typeof row === "object" ? { ...row } : row;
        if (rowData && typeof rowData === "object") {
          const assignedLawyerId = String(rowData.assigned_lawyer_id || "").trim();
          if (assignedLawyerId) {
            const lawyer = usersById.get(assignedLawyerId);
            if (lawyer) {
              rowData.assigned_lawyer_name = rowData.assigned_lawyer_name || lawyer.name || lawyer.email || assignedLawyerId;
              rowData.assigned_lawyer_phone = rowData.assigned_lawyer_phone || lawyer.phone || null;
            }
          }
        }
        const normalizedMessages = normalizeMessageAuthors(messagesData.rows || [], users);
        setRequestModal((prev) => ({
          ...prev,
          loading: false,
          requestId: rowData?.id || requestId,
          trackNumber: String(rowData?.track_number || ""),
          requestData: rowData,
          financeSummary: buildFinanceSummaryFromInvoices(financeSummaryData, rowData, []),
          invoices: [],
          statusRouteNodes: Array.isArray(statusRouteData?.nodes) ? statusRouteData.nodes : [],
          statusHistory: Array.isArray(statusRouteData?.history) ? statusRouteData.history : [],
          availableStatuses: Array.isArray(statusRouteData?.available_statuses) ? statusRouteData.available_statuses : [],
          currentImportantDateAt: String(statusRouteData?.current_important_date_at || rowData?.important_date_at || ""),
          messages: normalizedMessages,
          messagesHasMore: Boolean(workspaceData?.messages_has_more),
          messagesLoadingMore: false,
          messagesLoadedCount: Number(workspaceData?.messages_loaded_count || normalizedMessages.length || 0),
          messagesTotal: Number(workspaceData?.messages_total || normalizedMessages.length || 0),
          attachments: [],
          selectedFiles: [],
          fileUploading: false,
        }));
        void hydrateRequestMessageBodies(requestId, normalizedMessages);
        void Promise.all([
          api("/api/admin/uploads/request-attachments/" + requestId),
          api("/api/admin/invoices/by-request/" + requestId),
          api("/api/admin/requests/" + requestId + "/status-route"),
        ])
          .then(([attachmentsData, invoicesData, nextStatusRouteData]) => {
            const attachments = (attachmentsData?.rows || []).map((item) => ({
              ...item,
              download_url: resolveAdminObjectSrc(item.s3_key, token),
            }));
            const invoices = Array.isArray(invoicesData?.rows) ? invoicesData.rows : [];
            setRequestModal((prev) => {
              if (String(prev.requestId || "") !== String(requestId)) return prev;
              return {
                ...prev,
                attachments,
                invoices,
                financeSummary: buildFinanceSummaryFromInvoices(prev.financeSummary, prev.requestData, invoices),
                statusRouteNodes: Array.isArray(nextStatusRouteData?.nodes) ? nextStatusRouteData.nodes : [],
                statusHistory: Array.isArray(nextStatusRouteData?.history) ? nextStatusRouteData.history : [],
                availableStatuses: Array.isArray(nextStatusRouteData?.available_statuses) ? nextStatusRouteData.available_statuses : [],
                currentImportantDateAt: String(nextStatusRouteData?.current_important_date_at || prev.currentImportantDateAt || ""),
              };
            });
          })
          .catch(() => null);
        if (showLoading && typeof setStatus === "function") setStatus("requestModal", "", "");
      } catch (error) {
        setRequestModal((prev) => ({
          ...prev,
          loading: false,
          requestId,
          requestData: null,
          financeSummary: null,
          invoices: [],
          statusRouteNodes: [],
          statusHistory: [],
          availableStatuses: [],
          currentImportantDateAt: "",
          messages: [],
          messagesHasMore: false,
          messagesLoadingMore: false,
          messagesLoadedCount: 0,
          messagesTotal: 0,
          attachments: [],
          selectedFiles: [],
          fileUploading: false,
        }));
        if (typeof setStatus === "function") setStatus("requestModal", "Ошибка: " + error.message, "error");
      }
    },
    [api, hydrateRequestMessageBodies, resolveAdminObjectSrc, setStatus, token, users]
  );

  const refreshRequestModal = useCallback(async () => {
    if (!requestModal.requestId) return;
    await loadRequestModalData(requestModal.requestId, { showLoading: true });
  }, [loadRequestModalData, requestModal.requestId]);

  const openRequestDetails = useCallback(
    async (requestId, event, options) => {
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
      if (typeof setStatus === "function") setStatus("requestModal", "", "");
      if (typeof setActiveSection === "function") setActiveSection("requestWorkspace");
      await loadRequestModalData(normalizedRequestId, { showLoading: true });
      const preset = options && typeof options === "object" ? options.statusChangePreset : null;
      if (preset) {
        setRequestModal((prev) => ({ ...prev, pendingStatusChangePreset: preset }));
      }
    },
    [loadRequestModalData, setActiveSection, setStatus]
  );

  const submitRequestModalMessage = useCallback(
    async (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (!api) return;
      const requestId = requestModal.requestId;
      const body = String(requestModal.messageDraft || "").trim();
      const files = Array.isArray(requestModal.selectedFiles) ? requestModal.selectedFiles : [];
      if (!requestId || (!body && !files.length)) return;
      try {
        setRequestModal((prev) => ({ ...prev, fileUploading: true }));
        if (typeof setStatus === "function") {
          setStatus("requestModal", files.length ? "Отправка сообщения и файлов..." : "Отправка сообщения...", "");
        }

        let messageId = null;
        if (body) {
          const message = await api("/api/admin/chat/requests/" + requestId + "/messages", {
            method: "POST",
            body: { body },
          });
          messageId = String(message?.id || "").trim() || null;
        }

        for (const file of files) {
          await uploadRequestAttachmentWithRetry({ requestId, file, messageId });
        }

        setRequestModal((prev) => ({ ...prev, messageDraft: "", selectedFiles: [], fileUploading: false }));
        const successMessage = body && files.length ? "Сообщение и файлы отправлены" : files.length ? "Файлы отправлены" : "Сообщение отправлено";
        if (typeof setStatus === "function") setStatus("requestModal", successMessage, "ok");
        await loadRequestModalData(requestId, { showLoading: false });
      } catch (error) {
        setRequestModal((prev) => ({ ...prev, fileUploading: false }));
        if (typeof setStatus === "function") setStatus("requestModal", "Ошибка отправки: " + error.message, "error");
      }
    },
    [
      api,
      loadRequestModalData,
      requestModal.messageDraft,
      requestModal.requestId,
      requestModal.selectedFiles,
      setStatus,
      uploadRequestAttachmentWithRetry,
    ]
  );

  const loadRequestDataTemplates = useCallback(
    async (documentName) => {
      const requestId = requestModal.requestId;
      if (!api || !requestId) return { rows: [], documents: [] };
      const query = documentName ? "?document=" + encodeURIComponent(String(documentName)) : "";
      return api("/api/admin/chat/requests/" + requestId + "/data-request-templates" + query);
    },
    [api, requestModal.requestId]
  );

  const loadRequestDataBatch = useCallback(
    async (messageId) => {
      const requestId = requestModal.requestId;
      if (!api || !requestId || !messageId) throw new Error("Не выбрана заявка");
      return api("/api/admin/chat/requests/" + requestId + "/data-requests/" + encodeURIComponent(String(messageId)));
    },
    [api, requestModal.requestId]
  );

  const loadRequestDataTemplateDetails = useCallback(
    async (templateId) => {
      const requestId = requestModal.requestId;
      if (!api || !requestId || !templateId) throw new Error("Не выбран шаблон");
      return api(
        "/api/admin/chat/requests/" +
          requestId +
          "/data-request-templates/" +
          encodeURIComponent(String(templateId))
      );
    },
    [api, requestModal.requestId]
  );

  const saveRequestDataTemplate = useCallback(
    async (payload) => {
      const requestId = requestModal.requestId;
      if (!api || !requestId) throw new Error("Не выбрана заявка");
      return api("/api/admin/chat/requests/" + requestId + "/data-request-templates", {
        method: "POST",
        body: payload || {},
      });
    },
    [api, requestModal.requestId]
  );

  const saveRequestDataBatch = useCallback(
    async (payload) => {
      const requestId = requestModal.requestId;
      if (!api || !requestId) throw new Error("Не выбрана заявка");
      const result = await api("/api/admin/chat/requests/" + requestId + "/data-requests", {
        method: "POST",
        body: payload || {},
      });
      await loadRequestModalData(requestId, { showLoading: false });
      return result;
    },
    [api, loadRequestModalData, requestModal.requestId]
  );

  const clearPendingStatusChangePreset = useCallback(() => {
    setRequestModal((prev) => ({ ...prev, pendingStatusChangePreset: null }));
  }, []);

  const probeRequestLive = useCallback(
    async ({ cursor } = {}) => {
      const requestId = requestModal.requestId;
      if (!api || !requestId) return { has_updates: false, typing: [], cursor: null };
      const query = cursor ? "?cursor=" + encodeURIComponent(String(cursor)) : "";
      const payload = await api("/api/admin/chat/requests/" + requestId + "/live" + query);
      if (payload && payload.has_updates) {
        const nextMessages = normalizeMessageAuthors(payload?.messages || [], users);
        const nextAttachments = (payload?.attachments || []).map((item) => ({
          ...item,
          download_url: resolveAdminObjectSrc(item?.s3_key, token),
        }));
        if (nextMessages.length || nextAttachments.length) {
          setRequestModal((prev) => {
            const mergedMessages = mergeRowsById(prev.messages, nextMessages);
            const previousCount = Array.isArray(prev.messages) ? prev.messages.length : 0;
            const addedCount = Math.max(0, mergedMessages.length - previousCount);
            return {
              ...prev,
              messages: mergedMessages,
              messagesLoadedCount: Number(prev.messagesLoadedCount || previousCount) + addedCount,
              messagesTotal: Number(prev.messagesTotal || previousCount) + addedCount,
              attachments: mergeRowsById(prev.attachments, nextAttachments),
            };
          });
        }
      }
      return payload || { has_updates: false, typing: [], cursor: null };
    },
    [api, requestModal.requestId, resolveAdminObjectSrc, token, users]
  );

  const loadOlderRequestMessages = useCallback(async () => {
    const requestId = String(requestModal.requestId || "").trim();
    const cursor = getOldestMessageCursor(requestModal.messages);
    if (!api || !requestId || requestModal.messagesLoadingMore || !requestModal.messagesHasMore) return null;
    setRequestModal((prev) => ({ ...prev, messagesLoadingMore: true }));
    try {
      const query = new URLSearchParams({ include_body: "false" });
      if (cursor?.beforeId && cursor?.beforeCreatedAt) {
        query.set("before_id", cursor.beforeId);
        query.set("before_created_at", cursor.beforeCreatedAt);
      } else {
        query.set("before_count", String(Number(requestModal.messagesLoadedCount || 0)));
      }
      const payload = await api("/api/admin/chat/requests/" + requestId + "/messages-window?" + query.toString());
      const nextMessages = normalizeMessageAuthors(payload?.rows || [], users);
      setRequestModal((prev) => ({
        ...prev,
        messagesLoadingMore: false,
        ...(function () {
          const merged = mergeRowsById(nextMessages, prev.messages);
          return {
            messages: merged,
            messagesHasMore: Boolean(payload?.has_more),
            messagesLoadedCount: merged.length,
            messagesTotal: Number(prev.messagesTotal || merged.length || 0),
          };
        })(),
      }));
      void hydrateRequestMessageBodies(requestId, nextMessages);
      return payload || null;
    } catch (error) {
      setRequestModal((prev) => ({ ...prev, messagesLoadingMore: false }));
      if (typeof setStatus === "function") setStatus("requestModal", "Ошибка загрузки истории: " + error.message, "error");
      return null;
    }
  }, [
    api,
    requestModal.messagesHasMore,
    requestModal.messagesLoadedCount,
    requestModal.messagesLoadingMore,
    requestModal.requestId,
    setStatus,
    hydrateRequestMessageBodies,
    users,
  ]);

  const setRequestTyping = useCallback(
    async ({ typing } = {}) => {
      const requestId = requestModal.requestId;
      if (!api || !requestId) return { status: "skipped", typing: false };
      return api("/api/admin/chat/requests/" + requestId + "/typing", {
        method: "POST",
        body: { typing: Boolean(typing) },
      });
    },
    [api, requestModal.requestId]
  );

  const submitRequestStatusChange = useCallback(
    async ({ requestId, statusCode, importantDateAt, comment, files } = {}) => {
      if (!api) throw new Error("API недоступен");
      const targetRequestId = String(requestId || requestModal.requestId || "").trim();
      if (!targetRequestId) throw new Error("Не выбрана заявка");
      const nextStatus = String(statusCode || "").trim();
      if (!nextStatus) throw new Error("Выберите статус");

      const body = {
        status_code: nextStatus,
        important_date_at: importantDateAt || null,
        comment: String(comment || "").trim() || null,
      };

      if (typeof setStatus === "function") setStatus("requestModal", "Смена статуса...", "");
      const result = await api("/api/admin/requests/" + targetRequestId + "/status-change", {
        method: "POST",
        body,
      });

      const attachedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
      const commentText = String(comment || "").trim();
      const availableStatuses = Array.isArray(requestModal.availableStatuses) ? requestModal.availableStatuses : [];
      const statusName = availableStatuses.find((item) => String(item?.code || "").trim() === String(result?.to_status || nextStatus).trim())?.name;
      const nextStatusLabel = String(statusName || result?.to_status || nextStatus).trim() || nextStatus;
      const importantDateRaw = String(result?.important_date_at || importantDateAt || "").trim();
      const importantDateLabel = importantDateRaw ? fmtShortDateTime(importantDateRaw) : "";
      const serviceLines = [`Изменился статус: "${nextStatusLabel}"`];
      if (importantDateRaw) {
        serviceLines.push("Важная дата: " + (importantDateLabel && importantDateLabel !== "-" ? importantDateLabel : importantDateRaw));
      }
      if (commentText) serviceLines.push(commentText);

      let messageId = null;
      const serviceMessageBody = serviceLines.filter(Boolean).join("\n").trim();
      if (serviceMessageBody) {
        const message = await api("/api/admin/chat/requests/" + targetRequestId + "/messages", {
          method: "POST",
          body: { body: serviceMessageBody },
        });
        messageId = String(message?.id || "").trim() || null;
      }
      for (const file of attachedFiles) {
        await uploadRequestAttachmentWithRetry({ requestId: targetRequestId, file, messageId });
      }

      if (typeof setStatus === "function") setStatus("requestModal", "Статус заявки обновлен", "ok");
      await loadRequestModalData(targetRequestId, { showLoading: false });
      return result;
    },
    [api, loadRequestModalData, requestModal.availableStatuses, requestModal.requestId, setStatus, uploadRequestAttachmentWithRetry]
  );

  const issueRequestInvoice = useCallback(
    async ({ requestId, amount, serviceDescription, payerDisplayName } = {}) => {
      if (!api) throw new Error("API недоступен");
      const targetRequestId = String(requestId || requestModal.requestId || "").trim();
      if (!targetRequestId) throw new Error("Не выбрана заявка");

      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Сумма счета должна быть больше нуля");
      }
      const roundedAmount = Math.round((parsedAmount + Number.EPSILON) * 100) / 100;

      const rowData = requestModal.requestData && typeof requestModal.requestData === "object" ? requestModal.requestData : null;
      const payerName = String(payerDisplayName || rowData?.client_name || "").trim() || "Клиент";
      const serviceLabel = String(serviceDescription || "").trim() || "Юридические услуги";
      const trackNumber = String(rowData?.track_number || requestModal.trackNumber || "").trim();
      const topicLabel = String(rowData?.topic_name || rowData?.topic_code || "").trim();

      if (typeof setStatus === "function") setStatus("requestModal", "Выставляем счет...", "");
      const created = await api("/api/admin/invoices", {
        method: "POST",
        body: {
          request_id: targetRequestId,
          status: "WAITING_PAYMENT",
          amount: roundedAmount,
          currency: "RUB",
          payer_display_name: payerName,
          payer_details: {
            ...DEFAULT_INVOICE_REQUISITES,
            request_track_number: trackNumber,
            service_description: serviceLabel,
            topic_name: topicLabel,
          },
        },
      });
      await loadRequestModalData(targetRequestId, { showLoading: false });
      if (typeof setStatus === "function") {
        const invoiceNumber = String(created?.invoice_number || "").trim();
        setStatus("requestModal", invoiceNumber ? "Счет выставлен: " + invoiceNumber : "Счет выставлен", "ok");
      }
      return created;
    },
    [api, loadRequestModalData, requestModal.requestData, requestModal.requestId, requestModal.trackNumber, setStatus]
  );

  return {
    requestModal,
    setRequestModal,
    requestOpenGuardRef,
    resetRequestWorkspaceState,
    updateRequestModalMessageDraft,
    appendRequestModalFiles,
    removeRequestModalFile,
    clearRequestModalFiles,
    loadRequestModalData,
    refreshRequestModal,
    openRequestDetails,
    clearPendingStatusChangePreset,
    submitRequestStatusChange,
    submitRequestModalMessage,
    probeRequestLive,
    loadOlderRequestMessages,
    setRequestTyping,
    loadRequestDataTemplates,
    loadRequestDataBatch,
    loadRequestDataTemplateDetails,
    saveRequestDataTemplate,
    saveRequestDataBatch,
    issueRequestInvoice,
  };
}

export default useRequestWorkspace;
