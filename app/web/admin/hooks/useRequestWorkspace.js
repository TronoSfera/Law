import { createRequestModalState } from "../shared/state.js";

export function useRequestWorkspace(options) {
  const { useCallback, useRef, useState } = React;
  const opts = options || {};
  const api = opts.api;
  const setStatus = opts.setStatus;
  const setActiveSection = opts.setActiveSection;
  const token = opts.token || "";
  const users = Array.isArray(opts.users) ? opts.users : [];
  const buildUniversalQuery = opts.buildUniversalQuery;
  const resolveAdminObjectSrc = opts.resolveAdminObjectSrc;

  const [requestModal, setRequestModal] = useState(createRequestModalState());
  const requestOpenGuardRef = useRef({ requestId: "", ts: 0 });

  const resetRequestWorkspaceState = useCallback(() => {
    setRequestModal(createRequestModalState());
    requestOpenGuardRef.current = { requestId: "", ts: 0 };
  }, []);

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
          statusRouteNodes: [],
        }));
      }

      const requestFilter = [{ field: "request_id", op: "=", value: String(requestId) }];
      try {
        const [row, messagesData, attachmentsData, statusRouteData, invoicesData] = await Promise.all([
          api("/api/admin/crud/requests/" + requestId),
          api("/api/admin/chat/requests/" + requestId + "/messages"),
          api("/api/admin/crud/attachments/query", {
            method: "POST",
            body: buildUniversalQuery(requestFilter, [{ field: "created_at", dir: "asc" }], 500, 0),
          }),
          api("/api/admin/requests/" + requestId + "/status-route").catch(() => ({ nodes: [] })),
          api("/api/admin/invoices/query", {
            method: "POST",
            body: buildUniversalQuery(requestFilter, [{ field: "paid_at", dir: "desc" }], 500, 0),
          }).catch(() => ({ rows: [] })),
        ]);
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
        const attachments = (attachmentsData.rows || []).map((item) => ({
          ...item,
          download_url: resolveAdminObjectSrc(item.s3_key, token),
        }));
        const usersByEmail = new Map(
          users.filter((user) => user && user.email).map((user) => [String(user.email).toLowerCase(), String(user.name || user.email)])
        );
        const normalizedMessages = (messagesData.rows || []).map((item) => {
          if (!item || typeof item !== "object") return item;
          const authorType = String(item.author_type || "").toUpperCase();
          const authorName = String(item.author_name || "").trim();
          if ((authorType === "LAWYER" || authorType === "SYSTEM") && authorName.includes("@")) {
            const mapped = usersByEmail.get(authorName.toLowerCase());
            if (mapped) return { ...item, author_name: mapped };
          }
          return item;
        });
        const paidInvoices = (invoicesData?.rows || []).filter(
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
        setRequestModal((prev) => ({
          ...prev,
          loading: false,
          requestId: rowData?.id || requestId,
          trackNumber: String(rowData?.track_number || ""),
          requestData: rowData,
          financeSummary: {
            request_cost: rowData?.request_cost ?? null,
            effective_rate: rowData?.effective_rate ?? null,
            paid_total: Math.round((paidTotal + Number.EPSILON) * 100) / 100,
            last_paid_at: latestPaidAt || rowData?.paid_at || null,
          },
          statusRouteNodes: Array.isArray(statusRouteData?.nodes) ? statusRouteData.nodes : [],
          statusHistory: Array.isArray(statusRouteData?.history) ? statusRouteData.history : [],
          availableStatuses: Array.isArray(statusRouteData?.available_statuses) ? statusRouteData.available_statuses : [],
          currentImportantDateAt: String(statusRouteData?.current_important_date_at || rowData?.important_date_at || ""),
          messages: normalizedMessages,
          attachments,
          selectedFiles: [],
          fileUploading: false,
        }));
        if (showLoading && typeof setStatus === "function") setStatus("requestModal", "", "");
      } catch (error) {
        setRequestModal((prev) => ({
          ...prev,
          loading: false,
          requestId,
          requestData: null,
          financeSummary: null,
          statusRouteNodes: [],
          statusHistory: [],
          availableStatuses: [],
          currentImportantDateAt: "",
          messages: [],
          attachments: [],
          selectedFiles: [],
          fileUploading: false,
        }));
        if (typeof setStatus === "function") setStatus("requestModal", "Ошибка: " + error.message, "error");
      }
    },
    [api, buildUniversalQuery, resolveAdminObjectSrc, setStatus, token, users]
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
        if (typeof setStatus === "function") setStatus("requestModal", successMessage, "ok");
        await loadRequestModalData(requestId, { showLoading: false });
      } catch (error) {
        setRequestModal((prev) => ({ ...prev, fileUploading: false }));
        if (typeof setStatus === "function") setStatus("requestModal", "Ошибка отправки: " + error.message, "error");
      }
    },
    [api, loadRequestModalData, requestModal.messageDraft, requestModal.requestId, requestModal.selectedFiles, setStatus]
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
      if (commentText || attachedFiles.length) {
        let messageId = null;
        const statusLine = "Смена статуса: " + String(result?.from_status || "—") + " -> " + String(result?.to_status || nextStatus);
        const messageBody = [statusLine, commentText].filter(Boolean).join("\n");
        if (messageBody) {
          const message = await api("/api/admin/chat/requests/" + targetRequestId + "/messages", {
            method: "POST",
            body: { body: messageBody },
          });
          messageId = String(message?.id || "").trim() || null;
        }
        for (const file of attachedFiles) {
          const mimeType = String(file.type || "application/octet-stream");
          const init = await api("/api/admin/uploads/init", {
            method: "POST",
            body: {
              file_name: file.name,
              mime_type: mimeType,
              size_bytes: file.size,
              scope: "REQUEST_ATTACHMENT",
              request_id: targetRequestId,
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
              request_id: targetRequestId,
              message_id: messageId,
            },
          });
        }
      }

      if (typeof setStatus === "function") setStatus("requestModal", "Статус заявки обновлен", "ok");
      await loadRequestModalData(targetRequestId, { showLoading: false });
      return result;
    },
    [api, loadRequestModalData, requestModal.requestId, setStatus]
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
    loadRequestDataTemplates,
    loadRequestDataBatch,
    loadRequestDataTemplateDetails,
    saveRequestDataTemplate,
    saveRequestDataBatch,
  };
}

export default useRequestWorkspace;
