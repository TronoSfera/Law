import { RequestWorkspace } from "./admin/features/requests/RequestWorkspace.jsx";
import { createRequestModalState } from "./admin/shared/state.js";
import { detectAttachmentPreviewKind, fmtShortDateTime } from "./admin/shared/utils.js";

(function () {
  const { useCallback, useEffect, useMemo, useRef, useState } = React;

  const SERVICE_REQUEST_TYPE_LABELS = {
    CURATOR_CONTACT: "Запрос к куратору",
    LAWYER_CHANGE_REQUEST: "Смена юриста",
  };
  const SERVICE_REQUEST_STATUS_LABELS = {
    NEW: "Новый",
    IN_PROGRESS: "В работе",
    RESOLVED: "Решен",
    REJECTED: "Отклонен",
  };

  function StatusLine({ status }) {
    return <p className={"status" + (status?.kind ? " " + status.kind : "")}>{status?.message || ""}</p>;
  }

  function Overlay({ open, id, onClose, children }) {
    return (
      <div className={"overlay" + (open ? " open" : "")} id={id} onClick={onClose}>
        {children}
      </div>
    );
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

    return (
      <div
        className={"global-tooltip-layer" + (tooltip.open ? " open" : "")}
        style={{ left: tooltip.x + "px", top: tooltip.y + "px", maxWidth: tooltip.maxWidth + "px" }}
        role="tooltip"
        aria-hidden={tooltip.open ? "false" : "true"}
      >
        {tooltip.text}
      </div>
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
        else if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
      }
      if (sampleLength && suspicious / sampleLength > 0.08) return null;
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "");
      return text.length > 200000 ? text.slice(0, 200000) + "\n\n[Текст обрезан для предпросмотра]" : text;
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
      const kind = detectAttachmentPreviewKind(fileName, mimeType);
      setResolvedKind(kind);
      setResolvedText("");
      setHint("");
      if (kind === "none") {
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
          if (!response.ok) throw new Error("Не удалось загрузить файл для предпросмотра");
          const buffer = await response.arrayBuffer();
          if (cancelled) return;

          if (kind === "pdf") {
            const header = new Uint8Array(buffer.slice(0, 5));
            const isPdf =
              header.length >= 5 &&
              header[0] === 0x25 &&
              header[1] === 0x50 &&
              header[2] === 0x44 &&
              header[3] === 0x46 &&
              header[4] === 0x2d;
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
              setHint("Файл помечен как PDF, но не является валидным PDF. Показан текстовый предпросмотр.");
              setLoading(false);
              return;
            }
            throw new Error("Файл помечен как PDF, но не является валидным PDF-документом.");
          }

          if (kind === "text") {
            const textPreview = decodeTextPreview(buffer);
            if (textPreview == null) throw new Error("Не удалось распознать текстовый файл для предпросмотра.");
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
          setResolvedKind(kind);
          setLoading(false);
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Не удалось открыть предпросмотр");
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
    return (
      <Overlay open={open} id="file-preview-overlay" onClose={(event) => event.target.id === "file-preview-overlay" && onClose()}>
        <div className="modal request-preview-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <h3>{title || fileName || "Предпросмотр файла"}</h3>
            <div className="request-preview-head-actions">
              <a className="icon-btn file-action-btn request-preview-download-icon" href={url} target="_blank" rel="noreferrer" aria-label="Скачать файл" data-tooltip="Скачать">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                  <path
                    d="M12 3a1 1 0 0 1 1 1v8.17l2.58-2.58a1 1 0 1 1 1.42 1.42l-4.3 4.3a1 1 0 0 1-1.4 0l-4.3-4.3a1 1 0 0 1 1.42-1.42L11 12.17V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z"
                    fill="currentColor"
                  />
                </svg>
              </a>
              <button className="close" type="button" id="file-preview-close" onClick={onClose}>
                ×
              </button>
            </div>
          </div>
          <div className="request-preview-body" id="file-preview-body">
            {loading ? <p className="request-preview-note">Загрузка предпросмотра...</p> : null}
            {!loading && !error && hint ? <p className="request-preview-note">{hint}</p> : null}
            {error ? <p className="request-preview-note">{error}</p> : null}
            {!loading && !error && kind === "image" && resolvedUrl ? (
              <img className="request-preview-image" src={resolvedUrl} alt={fileName || "attachment"} />
            ) : null}
            {!loading && !error && kind === "video" && resolvedUrl ? (
              <video className="request-preview-video" src={resolvedUrl} controls preload="metadata" />
            ) : null}
            {!loading && !error && kind === "pdf" && resolvedUrl ? (
              <iframe className="request-preview-frame" src={resolvedUrl} title={fileName || "preview"} />
            ) : null}
            {!loading && !error && kind === "text" ? (
              <pre className="request-preview-text">{resolvedText || "Файл пуст."}</pre>
            ) : null}
            {kind === "none" ? <p className="request-preview-note">Для этого типа файла доступно только открытие или скачивание.</p> : null}
          </div>
        </div>
      </Overlay>
    );
  }

  function ServiceRequestModal({ open, type, body, status, loading, onBodyChange, onClose, onSubmit }) {
    const title = type === "LAWYER_CHANGE_REQUEST" ? "Запрос на смену юриста" : "Обращение к куратору";
    return (
      <div className={"overlay" + (open ? " open" : "")} id="service-request-overlay" onClick={(event) => event.target.id === "service-request-overlay" && onClose()}>
        <div className="modal service-request-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h3 id="service-request-title">{title}</h3>
            </div>
            <button className="close" type="button" id="service-request-close" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
          <form id="service-request-form" className="stack service-request-form" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="service-request-body">Сообщение</label>
              <textarea
                id="service-request-body"
                value={body}
                onChange={onBodyChange}
                maxLength={4000}
                placeholder="Опишите обращение"
                disabled={loading}
              />
            </div>
            <div className="modal-actions modal-actions-right">
              <button className="btn btn-sm" id="service-request-send" type="submit" disabled={loading}>
                {loading ? "Отправка..." : "Отправить"}
              </button>
            </div>
            <StatusLine status={status} />
          </form>
        </div>
      </div>
    );
  }

  function ServiceRequestList({ rows }) {
    const safeRows = Array.isArray(rows) ? rows : [];
    return (
      <ul className="simple-list request-modal-list" id="cabinet-service-requests">
        {safeRows.length ? (
          safeRows.map((item) => {
            const typeCode = String(item?.type || "").toUpperCase();
            const statusCode = String(item?.status || "").toUpperCase();
            return (
              <li key={String(item.id)} className="simple-item">
                <div>{(SERVICE_REQUEST_TYPE_LABELS[typeCode] || typeCode || "Запрос") + " • " + (SERVICE_REQUEST_STATUS_LABELS[statusCode] || statusCode || "NEW")}</div>
                <div className="muted request-modal-item-meta">{fmtShortDateTime(item?.created_at)}</div>
                {item?.body ? <p>{String(item.body)}</p> : null}
              </li>
            );
          })
        ) : (
          <li className="muted">Обращений пока нет</li>
        )}
      </ul>
    );
  }

  function App() {
    const [requestModal, setRequestModal] = useState(createRequestModalState());
    const [requestsList, setRequestsList] = useState([]);
    const [activeTrack, setActiveTrack] = useState("");
    const [status, setStatus] = useState({ message: "", kind: "" });
    const [serviceRequests, setServiceRequests] = useState([]);
    const [serviceRequestModal, setServiceRequestModal] = useState({ open: false, type: "", body: "", loading: false, status: { message: "", kind: "" } });

    const setPageStatus = useCallback((message, kind) => {
      setStatus({ message: String(message || ""), kind: kind || "" });
    }, []);

    const setServiceStatus = useCallback((message, kind) => {
      setServiceRequestModal((prev) => ({ ...prev, status: { message: String(message || ""), kind: kind || "" } }));
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
      const response = await fetch(url, options || undefined);
      const data = await parseJsonSafe(response);
      if (response.status === 401 || response.status === 403) {
        window.location.href = "/";
        throw new Error("Нет доступа");
      }
      if (!response.ok) throw new Error(apiError(data, fallbackMessage || "Ошибка запроса"));
      return data;
    }, []);

    const uploadPublicRequestAttachment = useCallback(async (file, extra = {}) => {
      const requestId = String(requestModal.requestId || "").trim();
      if (!requestId) throw new Error("Не выбрана заявка");
      const mimeType = String(file?.type || "application/octet-stream");
      const initData = await apiJson(
        "/api/public/uploads/init",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_name: file.name,
            mime_type: mimeType,
            size_bytes: file.size,
            scope: "REQUEST_ATTACHMENT",
            request_id: requestId,
          }),
        },
        "Не удалось начать загрузку файла"
      );
      const putResponse = await fetch(initData.presigned_url, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: file,
      });
      if (!putResponse.ok) throw new Error("Ошибка передачи файла в хранилище");
      const completeData = await apiJson(
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
            message_id: extra?.message_id || null,
          }),
        },
        "Не удалось завершить загрузку файла"
      );
      return completeData;
    }, [apiJson, requestModal.requestId]);

    const loadRequestWorkspace = useCallback(
      async (trackNumber, showLoading) => {
        const track = String(trackNumber || "").trim().toUpperCase();
        if (!track) return;
        if (showLoading) {
          setRequestModal((prev) => ({ ...prev, loading: true }));
        }
        const [requestData, messagesData, attachmentsData, invoicesData, statusRouteData, serviceRequestsData] = await Promise.all([
          apiJson("/api/public/requests/" + encodeURIComponent(track), null, "Не удалось открыть заявку"),
          apiJson("/api/public/chat/requests/" + encodeURIComponent(track) + "/messages", null, "Не удалось загрузить сообщения"),
          apiJson("/api/public/requests/" + encodeURIComponent(track) + "/attachments", null, "Не удалось загрузить файлы"),
          apiJson("/api/public/requests/" + encodeURIComponent(track) + "/invoices", null, "Не удалось загрузить счета"),
          apiJson("/api/public/requests/" + encodeURIComponent(track) + "/status-route", null, "Не удалось загрузить маршрут статусов"),
          apiJson("/api/public/requests/" + encodeURIComponent(track) + "/service-requests", null, "Не удалось загрузить обращения"),
        ]);

        const invoices = Array.isArray(invoicesData) ? invoicesData : [];
        const paidInvoices = invoices.filter((item) => String(item?.status || "").toUpperCase() === "PAID");
        const paidTotal = paidInvoices.reduce((acc, item) => {
          const amount = Number(item?.amount || 0);
          return Number.isFinite(amount) ? acc + amount : acc;
        }, 0);
        const lastPaidAt = paidInvoices.reduce((latest, item) => {
          const raw = String(item?.paid_at || "").trim();
          if (!raw) return latest;
          if (!latest) return raw;
          const currentTs = new Date(raw).getTime();
          const latestTs = new Date(latest).getTime();
          return Number.isFinite(currentTs) && currentTs > latestTs ? raw : latest;
        }, "");

        setActiveTrack(track);
        setServiceRequests(Array.isArray(serviceRequestsData) ? serviceRequestsData : []);
        setRequestModal((prev) => ({
          ...prev,
          loading: false,
          requestId: String(requestData?.id || ""),
          trackNumber: String(requestData?.track_number || track),
          requestData: requestData || null,
          financeSummary: {
            request_cost: requestData?.request_cost ?? null,
            effective_rate: requestData?.effective_rate ?? null,
            paid_total: Math.round((paidTotal + Number.EPSILON) * 100) / 100,
            last_paid_at: lastPaidAt || requestData?.paid_at || null,
          },
          statusRouteNodes: Array.isArray(statusRouteData?.nodes) ? statusRouteData.nodes : [],
          statusHistory: Array.isArray(statusRouteData?.history) ? statusRouteData.history : [],
          availableStatuses: [],
          currentImportantDateAt: String(statusRouteData?.current_important_date_at || requestData?.important_date_at || ""),
          messages: Array.isArray(messagesData) ? messagesData : [],
          attachments: Array.isArray(attachmentsData) ? attachmentsData : [],
          fileUploading: false,
        }));
      },
      [apiJson]
    );

    const loadMyRequests = useCallback(
      async (preferredTrack) => {
        const data = await apiJson("/api/public/requests/my", null, "Не удалось загрузить список заявок");
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        setRequestsList(rows);
        if (!rows.length) {
          setRequestModal((prev) => ({
            ...prev,
            loading: false,
            requestId: null,
            requestData: null,
            trackNumber: "",
            financeSummary: null,
            statusRouteNodes: [],
            statusHistory: [],
            messages: [],
            attachments: [],
            fileUploading: false,
            selectedFiles: [],
            messageDraft: "",
          }));
          setServiceRequests([]);
          setPageStatus("По вашему номеру пока нет заявок.", "");
          return;
        }
        const tracks = rows.map((row) => String(row.track_number || "").trim()).filter(Boolean);
        const selected = tracks.includes(String(preferredTrack || "").trim().toUpperCase())
          ? String(preferredTrack || "").trim().toUpperCase()
          : tracks[0];
        await loadRequestWorkspace(selected, true);
        setPageStatus("Открыта заявка: " + selected, "ok");
      },
      [apiJson, loadRequestWorkspace, setPageStatus]
    );

    const updateMessageDraft = useCallback((event) => {
      const value = event?.target?.value || "";
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

    const submitMessage = useCallback(
      async (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        const track = String(activeTrack || "").trim();
        const requestId = String(requestModal.requestId || "").trim();
        if (!track || !requestId) {
          setPageStatus("Сначала выберите заявку.", "error");
          return;
        }
        const body = String(requestModal.messageDraft || "").trim();
        const files = Array.isArray(requestModal.selectedFiles) ? requestModal.selectedFiles : [];
        if (!body && !files.length) return;
        try {
          setRequestModal((prev) => ({ ...prev, fileUploading: true }));
          setPageStatus(files.length ? "Отправка сообщения и файлов..." : "Отправка сообщения...", "");

          let messageId = null;
          if (body) {
            const messageData = await apiJson(
              "/api/public/chat/requests/" + encodeURIComponent(track) + "/messages",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body }),
              },
              "Не удалось отправить сообщение"
            );
            messageId = String(messageData?.id || "").trim() || null;
          }
          for (const file of files) {
            await uploadPublicRequestAttachment(file, { message_id: messageId });
          }
          setRequestModal((prev) => ({ ...prev, messageDraft: "", selectedFiles: [], fileUploading: false }));
          await loadRequestWorkspace(track, false);
          if (body && files.length) setPageStatus("Сообщение и файлы отправлены.", "ok");
          else if (files.length) setPageStatus(files.length === 1 ? "Файл загружен." : "Файлы загружены.", "ok");
          else setPageStatus("Сообщение отправлено.", "ok");
        } catch (error) {
          setRequestModal((prev) => ({ ...prev, fileUploading: false }));
          setPageStatus(error?.message || "Ошибка отправки сообщения", "error");
        }
      },
      [activeTrack, apiJson, loadRequestWorkspace, requestModal.messageDraft, requestModal.requestId, requestModal.selectedFiles, setPageStatus, uploadPublicRequestAttachment]
    );

    const loadRequestDataBatch = useCallback(
      async (messageId) => {
        const track = String(activeTrack || "").trim();
        if (!track || !messageId) throw new Error("Не выбрана заявка");
        return apiJson(
          "/api/public/chat/requests/" + encodeURIComponent(track) + "/data-requests/" + encodeURIComponent(String(messageId)),
          null,
          "Не удалось открыть запрос данных"
        );
      },
      [activeTrack, apiJson]
    );

    const saveRequestDataValues = useCallback(
      async ({ message_id, items }) => {
        const track = String(activeTrack || "").trim();
        const messageId = String(message_id || "").trim();
        if (!track || !messageId) throw new Error("Не выбрана заявка");
        await apiJson(
          "/api/public/chat/requests/" + encodeURIComponent(track) + "/data-requests/" + encodeURIComponent(messageId),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: Array.isArray(items) ? items : [] }),
          },
          "Не удалось сохранить данные"
        );
        await loadRequestWorkspace(track, false);
      },
      [activeTrack, apiJson, loadRequestWorkspace]
    );

    const openServiceRequestModal = useCallback((type) => {
      const normalized = String(type || "").trim().toUpperCase();
      if (!normalized) return;
      setServiceRequestModal({
        open: true,
        type: normalized,
        body: "",
        loading: false,
        status: { message: "", kind: "" },
      });
    }, []);

    const closeServiceRequestModal = useCallback(() => {
      setServiceRequestModal({ open: false, type: "", body: "", loading: false, status: { message: "", kind: "" } });
    }, []);

    const submitServiceRequest = useCallback(
      async (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        const track = String(activeTrack || "").trim();
        if (!track) {
          setServiceStatus("Сначала выберите заявку.", "error");
          return;
        }
        const requestType = String(serviceRequestModal.type || "").trim().toUpperCase();
        const body = String(serviceRequestModal.body || "").trim();
        if (!requestType) {
          setServiceStatus("Выберите тип обращения.", "error");
          return;
        }
        if (body.length < 3) {
          setServiceStatus("Сообщение должно содержать минимум 3 символа.", "error");
          return;
        }
        try {
          setServiceRequestModal((prev) => ({ ...prev, loading: true, status: { message: "", kind: "" } }));
          await apiJson(
            "/api/public/requests/" + encodeURIComponent(track) + "/service-requests",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: requestType, body }),
            },
            "Не удалось отправить обращение"
          );
          await loadRequestWorkspace(track, false);
          setPageStatus("Обращение отправлено.", "ok");
          closeServiceRequestModal();
        } catch (error) {
          setServiceRequestModal((prev) => ({ ...prev, loading: false }));
          setServiceStatus(error?.message || "Не удалось отправить обращение", "error");
        }
      },
      [activeTrack, apiJson, closeServiceRequestModal, loadRequestWorkspace, serviceRequestModal.body, serviceRequestModal.type, setPageStatus, setServiceStatus]
    );

    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const preferredTrack = String(params.get("track") || "").trim().toUpperCase();
      void loadMyRequests(preferredTrack).catch((error) => {
        setPageStatus(error?.message || "Не удалось открыть страницу клиента", "error");
      });
    }, [loadMyRequests, setPageStatus]);

    const summary = requestModal.requestData || null;
    const canInteract = Boolean(summary && !requestModal.loading);

    return (
      <div className="client-page-shell">
        <main className="main client-main">
          <div className="topbar client-topbar">
            <div>
              <h1>Кабинет клиента</h1>
              <p className="muted">Работа с заявками: статусы, чат, файлы и обращения.</p>
            </div>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
              <a className="btn secondary btn-sm" href="/">На лендинг</a>
            </div>
          </div>

          <section className="section active client-section">
            <div className="section-head">
              <div>
                <h2>Мои заявки</h2>
              </div>
            </div>
            <div className="client-request-toolbar">
              <div className="field grow">
                <label htmlFor="client-request-select">Номер заявки</label>
                <select
                  id="client-request-select"
                  value={activeTrack}
                  onChange={(event) => {
                    const track = String(event.target.value || "").trim();
                    if (!track) return;
                    void loadRequestWorkspace(track, true)
                      .then(() => setPageStatus("Открыта заявка: " + track, "ok"))
                      .catch((error) => setPageStatus(error?.message || "Не удалось открыть заявку", "error"));
                  }}
                  disabled={requestModal.loading || !requestsList.length}
                >
                  {requestsList.map((row) => (
                    <option value={String(row.track_number || "")} key={String(row.id || row.track_number || "")}>
                      {String(row.track_number || "Без номера") + " • " + String(row.status_code || "-")}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn secondary"
                id="client-refresh"
                type="button"
                onClick={() => {
                  void loadMyRequests(activeTrack).catch((error) => setPageStatus(error?.message || "Не удалось обновить список", "error"));
                }}
              >
                Обновить
              </button>
            </div>

            <div className="client-summary block" id="cabinet-summary" hidden={!summary}>
              <div className="client-summary-grid">
                <div className="request-field">
                  <span className="request-field-label">Статус</span>
                  <span className="request-field-value" id="cabinet-request-status">{summary ? String(summary.status_code || "-") : "-"}</span>
                </div>
                <div className="request-field">
                  <span className="request-field-label">Тема</span>
                  <span className="request-field-value" id="cabinet-request-topic">{summary ? String(summary.topic_name || summary.topic_code || "-") : "-"}</span>
                </div>
                <div className="request-field">
                  <span className="request-field-label">Создана</span>
                  <span className="request-field-value" id="cabinet-request-created">{summary ? fmtShortDateTime(summary.created_at) : "-"}</span>
                </div>
                <div className="request-field">
                  <span className="request-field-label">Обновлена</span>
                  <span className="request-field-value" id="cabinet-request-updated">{summary ? fmtShortDateTime(summary.updated_at) : "-"}</span>
                </div>
              </div>
              <div className="client-summary-actions">
                <button className="btn secondary btn-sm" id="cabinet-curator-request-open" type="button" disabled={!canInteract} onClick={() => openServiceRequestModal("CURATOR_CONTACT")}>
                  Обратиться к куратору
                </button>
                <button className="btn secondary btn-sm" id="cabinet-lawyer-change-open" type="button" disabled={!canInteract} onClick={() => openServiceRequestModal("LAWYER_CHANGE_REQUEST")}>
                  Запросить смену юриста
                </button>
              </div>
            </div>

            <RequestWorkspace
              viewerRole="CLIENT"
              viewerUserId=""
              loading={requestModal.loading}
              trackNumber={requestModal.trackNumber}
              requestData={requestModal.requestData}
              financeSummary={requestModal.financeSummary}
              statusRouteNodes={requestModal.statusRouteNodes || []}
              statusHistory={requestModal.statusHistory || []}
              availableStatuses={[]}
              currentImportantDateAt={requestModal.currentImportantDateAt || ""}
              pendingStatusChangePreset={null}
              messages={requestModal.messages || []}
              attachments={requestModal.attachments || []}
              messageDraft={requestModal.messageDraft || ""}
              selectedFiles={requestModal.selectedFiles || []}
              fileUploading={Boolean(requestModal.fileUploading)}
              status={status}
              onMessageChange={updateMessageDraft}
              onSendMessage={submitMessage}
              onFilesSelect={appendFiles}
              onRemoveSelectedFile={removeFile}
              onClearSelectedFiles={clearFiles}
              onLoadRequestDataBatch={loadRequestDataBatch}
              onSaveRequestDataValues={saveRequestDataValues}
              onUploadRequestAttachment={uploadPublicRequestAttachment}
              onChangeStatus={() => Promise.resolve(null)}
              AttachmentPreviewModalComponent={AttachmentPreviewModal}
              StatusLineComponent={StatusLine}
              domIds={{
                messagesList: "cabinet-messages",
                filesList: "cabinet-files",
                messageBody: "cabinet-chat-body",
                sendButton: "cabinet-chat-send",
                fileInput: "cabinet-file-input",
                fileUploadButton: "cabinet-file-upload",
                dataRequestOverlay: "data-request-overlay",
                dataRequestItems: "data-request-items",
                dataRequestStatus: "data-request-status",
                dataRequestSave: "data-request-save",
              }}
            />

            <div className="block client-service-requests">
              <h3>Мои обращения</h3>
              <ServiceRequestList rows={serviceRequests} />
            </div>
          </section>
          <p className="status" id="client-page-status">{status.message}</p>
        </main>
        <ServiceRequestModal
          open={serviceRequestModal.open}
          type={serviceRequestModal.type}
          body={serviceRequestModal.body}
          status={serviceRequestModal.status}
          loading={serviceRequestModal.loading}
          onBodyChange={(event) => setServiceRequestModal((prev) => ({ ...prev, body: event.target.value }))}
          onClose={closeServiceRequestModal}
          onSubmit={submitServiceRequest}
        />
        <GlobalTooltipLayer />
      </div>
    );
  }

  const root = document.getElementById("client-root");
  if (root) {
    ReactDOM.createRoot(root).render(<App />);
  }
})();
