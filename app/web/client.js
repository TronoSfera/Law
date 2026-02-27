(function () {
  const requestSelect = document.getElementById("client-request-select");
  const refreshButton = document.getElementById("client-refresh");
  const pageStatus = document.getElementById("client-page-status");

  const cabinetSummary = document.getElementById("cabinet-summary");
  const cabinetRequestStatus = document.getElementById("cabinet-request-status");
  const cabinetRequestTopic = document.getElementById("cabinet-request-topic");
  const cabinetRequestCreated = document.getElementById("cabinet-request-created");
  const cabinetRequestUpdated = document.getElementById("cabinet-request-updated");

  const cabinetMessages = document.getElementById("cabinet-messages");
  const cabinetFiles = document.getElementById("cabinet-files");
  const cabinetServiceRequests = document.getElementById("cabinet-service-requests");
  const cabinetInvoices = document.getElementById("cabinet-invoices");
  const cabinetTimeline = document.getElementById("cabinet-timeline");

  const cabinetChatForm = document.getElementById("cabinet-chat-form");
  const cabinetChatBody = document.getElementById("cabinet-chat-body");
  const cabinetChatSend = document.getElementById("cabinet-chat-send");
  const cabinetFileInput = document.getElementById("cabinet-file-input");
  const cabinetFileUpload = document.getElementById("cabinet-file-upload");
  const previewOverlay = document.getElementById("file-preview-overlay");
  const previewTitle = document.getElementById("file-preview-title");
  const previewClose = document.getElementById("file-preview-close");
  const previewBody = document.getElementById("file-preview-body");
  const dataRequestOverlay = document.getElementById("data-request-overlay");
  const dataRequestClose = document.getElementById("data-request-close");
  const dataRequestForm = document.getElementById("data-request-form");
  const dataRequestItems = document.getElementById("data-request-items");
  const dataRequestStatus = document.getElementById("data-request-status");
  const dataRequestTitle = document.getElementById("data-request-title");
  const serviceRequestOverlay = document.getElementById("service-request-overlay");
  const serviceRequestClose = document.getElementById("service-request-close");
  const serviceRequestForm = document.getElementById("service-request-form");
  const serviceRequestTitle = document.getElementById("service-request-title");
  const serviceRequestTypeInput = document.getElementById("service-request-type");
  const serviceRequestBodyInput = document.getElementById("service-request-body");
  const serviceRequestStatus = document.getElementById("service-request-status");
  const openCuratorRequestButton = document.getElementById("cabinet-curator-request-open");
  const openLawyerChangeButton = document.getElementById("cabinet-lawyer-change-open");
  let previewObjectUrl = "";

  let activeTrack = "";
  let activeRequestId = "";
  let activeDataRequestMessageId = "";

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

  function formatDate(value) {
    if (!value) return "-";
    try {
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return value;
      const day = String(dt.getDate()).padStart(2, "0");
      const month = String(dt.getMonth() + 1).padStart(2, "0");
      const year = String(dt.getFullYear()).slice(-2);
      const hours = String(dt.getHours()).padStart(2, "0");
      const minutes = String(dt.getMinutes()).padStart(2, "0");
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (_) {
      return value;
    }
  }

  function setStatus(el, message, kind) {
    el.className = "status";
    if (kind === "ok") el.classList.add("ok");
    if (kind === "error") el.classList.add("error");
    el.textContent = message;
  }

  function setDataRequestStatus(message, kind) {
    if (!dataRequestStatus) return;
    setStatus(dataRequestStatus, message || "", kind || null);
  }

  function setServiceRequestStatus(message, kind) {
    if (!serviceRequestStatus) return;
    setStatus(serviceRequestStatus, message || "", kind || null);
  }

  async function uploadPublicRequestAttachment(file, requestId) {
    const initResponse = await fetch("/api/public/uploads/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        scope: "REQUEST_ATTACHMENT",
        request_id: requestId,
      }),
    });
    const initData = await parseJsonSafe(initResponse);
    if (!initResponse.ok) throw new Error(apiErrorDetail(initData, "Не удалось начать загрузку файла"));

    const putResponse = await fetch(initData.presigned_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putResponse.ok) throw new Error("Ошибка передачи файла в хранилище");

    const completeResponse = await fetch("/api/public/uploads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: initData.key,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        scope: "REQUEST_ATTACHMENT",
        request_id: requestId,
      }),
    });
    const completeData = await parseJsonSafe(completeResponse);
    if (!completeResponse.ok) throw new Error(apiErrorDetail(completeData, "Не удалось завершить загрузку файла"));
    return completeData;
  }

  async function parseJsonSafe(response) {
    try {
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  function apiErrorDetail(data, fallbackMessage) {
    if (data && typeof data.detail === "string" && data.detail.trim()) return data.detail;
    return fallbackMessage;
  }

  function setCabinetEnabled(enabled) {
    cabinetChatBody.disabled = !enabled;
    cabinetChatSend.disabled = !enabled;
    cabinetFileInput.disabled = !enabled;
    cabinetFileUpload.disabled = !enabled;
    requestSelect.disabled = !enabled;
    if (openCuratorRequestButton) openCuratorRequestButton.disabled = !enabled;
    if (openLawyerChangeButton) openLawyerChangeButton.disabled = !enabled;
  }

  function clearList(node, emptyMessage) {
    node.innerHTML = "";
    const li = document.createElement("li");
    li.className = "simple-item";
    const p = document.createElement("p");
    p.textContent = emptyMessage;
    li.appendChild(p);
    node.appendChild(li);
  }

  function detectPreviewKind(fileName, mimeType) {
    const name = String(fileName || "").toLowerCase();
    const mime = String(mimeType || "").toLowerCase();
    if (/\.(txt|md|csv|json|log|xml|ya?ml|ini|cfg)$/i.test(name)) return "text";
    if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml" || mime === "text/xml") return "text";
    if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return "image";
    if (mime.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/.test(name)) return "video";
    if (mime === "application/pdf" || /\.pdf$/.test(name)) return "pdf";
    return "none";
  }

  function revokePreviewObjectUrl() {
    if (!previewObjectUrl) return;
    try {
      URL.revokeObjectURL(previewObjectUrl);
    } catch (_) {}
    previewObjectUrl = "";
  }

  function decodeTextPreview(arrayBuffer) {
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
  }

  function closePreview() {
    if (!previewOverlay || !previewBody) return;
    revokePreviewObjectUrl();
    previewOverlay.classList.remove("open");
    previewOverlay.setAttribute("aria-hidden", "true");
    previewBody.innerHTML = "";
  }

  function closeDataRequestModal() {
    if (!dataRequestOverlay || !dataRequestItems) return;
    activeDataRequestMessageId = "";
    dataRequestItems.innerHTML = "";
    dataRequestOverlay.classList.remove("open");
    dataRequestOverlay.setAttribute("aria-hidden", "true");
    setDataRequestStatus("", null);
  }

  function closeServiceRequestModal() {
    if (!serviceRequestOverlay) return;
    serviceRequestOverlay.classList.remove("open");
    serviceRequestOverlay.setAttribute("aria-hidden", "true");
    if (serviceRequestTypeInput) serviceRequestTypeInput.value = "";
    if (serviceRequestBodyInput) serviceRequestBodyInput.value = "";
    setServiceRequestStatus("", null);
  }

  function openServiceRequestModal(type) {
    const requestType = String(type || "").trim().toUpperCase();
    if (!serviceRequestOverlay || !requestType) return;
    if (serviceRequestTypeInput) serviceRequestTypeInput.value = requestType;
    if (serviceRequestTitle) {
      serviceRequestTitle.textContent =
        requestType === "LAWYER_CHANGE_REQUEST" ? "Запрос на смену юриста" : "Обращение к куратору";
    }
    if (serviceRequestBodyInput) serviceRequestBodyInput.value = "";
    setServiceRequestStatus("", null);
    serviceRequestOverlay.classList.add("open");
    serviceRequestOverlay.setAttribute("aria-hidden", "false");
    if (serviceRequestBodyInput) serviceRequestBodyInput.focus();
  }

  function dataRequestInputType(fieldType) {
    const type = String(fieldType || "").toLowerCase();
    if (type === "date") return "date";
    if (type === "number") return "number";
    if (type === "file") return "file";
    return "text";
  }

  function renderDataRequestItemsForm(items) {
    if (!dataRequestItems) return;
    dataRequestItems.innerHTML = "";
    if (!Array.isArray(items) || !items.length) {
      const p = document.createElement("p");
      p.className = "muted-inline";
      p.textContent = "Нет полей для заполнения.";
      dataRequestItems.appendChild(p);
      return;
    }
    items
      .slice()
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "data-request-form-row";

        const indexNode = document.createElement("div");
        indexNode.className = "data-request-form-index";
        indexNode.textContent = String(index + 1) + ".";
        row.appendChild(indexNode);

        const labelNode = document.createElement("div");
        labelNode.className = "data-request-form-label";
        labelNode.textContent = String(item.label || item.key || "Поле");
        row.appendChild(labelNode);

        const inputWrap = document.createElement("div");
        inputWrap.className = "field";
        let input;
        const normalizedFieldType = String(item.field_type || "").toLowerCase();
        if (normalizedFieldType === "text") {
          input = document.createElement("textarea");
          input.rows = 3;
        } else {
          input = document.createElement("input");
          input.type = dataRequestInputType(normalizedFieldType);
          if (normalizedFieldType === "number") input.step = "any";
        }
        if (normalizedFieldType === "file") {
          const currentFile = String(item.value_text || "").trim();
          if (currentFile) {
            const existing = document.createElement("div");
            existing.className = "muted-inline";
            existing.textContent =
              "Текущее значение: " + String((item.value_file && item.value_file.file_name) || currentFile);
            inputWrap.appendChild(existing);
          }
          if (item.value_file && item.value_file.download_url) {
            const fileActions = document.createElement("div");
            fileActions.className = "file-actions";
            if (detectPreviewKind(item.value_file.file_name, item.value_file.mime_type) !== "none") {
              const previewBtn = document.createElement("button");
              previewBtn.type = "button";
              previewBtn.className = "file-link-btn";
              previewBtn.textContent = "Предпросмотр";
              previewBtn.addEventListener("click", () => openPreview(item.value_file));
              fileActions.appendChild(previewBtn);
            }
            const link = document.createElement("a");
            link.className = "file-link-btn";
            link.href = item.value_file.download_url;
            link.textContent = "Открыть / скачать";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            fileActions.appendChild(link);
            inputWrap.appendChild(fileActions);
          }
          const hint = document.createElement("div");
          hint.className = "muted-inline";
          hint.textContent = "Выберите файл. Он будет загружен и привязан к полю запроса.";
          inputWrap.appendChild(hint);
          input.dataset.currentValue = currentFile;
        } else {
          input.value = item.value_text == null ? "" : String(item.value_text);
        }
        input.dataset.reqId = String(item.id || "");
        input.dataset.reqKey = String(item.key || "");
        input.dataset.reqFieldType = normalizedFieldType;
        inputWrap.appendChild(input);
        row.appendChild(inputWrap);

        dataRequestItems.appendChild(row);
      });
  }

  async function openDataRequestModal(message) {
    if (!activeTrack || !message?.id || !dataRequestOverlay) return;
    activeDataRequestMessageId = String(message.id);
    dataRequestOverlay.classList.add("open");
    dataRequestOverlay.setAttribute("aria-hidden", "false");
    if (dataRequestTitle) dataRequestTitle.textContent = "Запрос данных";
    setDataRequestStatus("Загрузка...", null);
    try {
      const response = await fetch(
        "/api/public/chat/requests/" + encodeURIComponent(activeTrack) + "/data-requests/" + encodeURIComponent(activeDataRequestMessageId)
      );
      const data = await parseJsonSafe(response);
      if (!response.ok) throw new Error(apiErrorDetail(data, "Не удалось открыть запрос данных"));
      renderDataRequestItemsForm(data?.items || []);
      setDataRequestStatus("Заполните нужные поля и сохраните.", null);
    } catch (error) {
      setDataRequestStatus(error?.message || "Не удалось открыть запрос данных", "error");
      renderDataRequestItemsForm([]);
    }
  }

  async function openPreview(item) {
    if (!previewOverlay || !previewBody || !previewTitle || !item?.download_url) return;
    revokePreviewObjectUrl();
    previewBody.innerHTML = "";
    previewTitle.textContent = item.file_name || "Предпросмотр файла";
    const kind = detectPreviewKind(item.file_name, item.mime_type);

    if (kind === "image") {
      const img = document.createElement("img");
      img.className = "preview-image";
      img.src = item.download_url;
      img.alt = item.file_name || "Изображение";
      previewBody.appendChild(img);
    } else if (kind === "video") {
      const video = document.createElement("video");
      video.className = "preview-video";
      video.src = item.download_url;
      video.controls = true;
      video.preload = "metadata";
      previewBody.appendChild(video);
    } else if (kind === "pdf" || kind === "text") {
      const loading = document.createElement("p");
      loading.className = "preview-note";
      loading.textContent = "Загрузка предпросмотра...";
      previewBody.appendChild(loading);
      try {
        const response = await fetch(item.download_url, { credentials: "same-origin" });
        if (!response.ok) throw new Error("Не удалось загрузить файл для предпросмотра.");
        const buffer = await response.arrayBuffer();
        previewBody.innerHTML = "";

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
            const frame = document.createElement("iframe");
            frame.className = "preview-frame";
            frame.src = item.download_url;
            frame.title = item.file_name || "PDF";
            previewBody.appendChild(frame);
          } else {
            const text = decodeTextPreview(buffer);
            if (text != null) {
              const note = document.createElement("p");
              note.className = "preview-note";
              note.textContent = "Файл помечен как PDF, но не является валидным PDF. Показан текстовый предпросмотр.";
              previewBody.appendChild(note);
              const pre = document.createElement("pre");
              pre.className = "preview-text";
              pre.textContent = text || "Файл пуст.";
              previewBody.appendChild(pre);
            } else {
              throw new Error("Файл помечен как PDF, но не является валидным PDF-документом.");
            }
          }
        } else {
          const text = decodeTextPreview(buffer);
          if (text == null) throw new Error("Не удалось распознать текстовый файл для предпросмотра.");
          const pre = document.createElement("pre");
          pre.className = "preview-text";
          pre.textContent = text || "Файл пуст.";
          previewBody.appendChild(pre);
        }
      } catch (error) {
        previewBody.innerHTML = "";
        const note = document.createElement("p");
        note.className = "preview-note";
        note.textContent = error instanceof Error ? error.message : "Не удалось открыть предпросмотр.";
        previewBody.appendChild(note);
      }
    } else {
      const note = document.createElement("p");
      note.className = "preview-note";
      note.textContent = "Для этого типа файла доступно только открытие или скачивание.";
      previewBody.appendChild(note);
    }

    const openLink = document.createElement("a");
    openLink.className = "file-link-btn";
    openLink.href = item.download_url;
    openLink.textContent = "Открыть / скачать";
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    previewBody.appendChild(openLink);

    previewOverlay.classList.add("open");
    previewOverlay.setAttribute("aria-hidden", "false");
  }

  function renderMessages(items) {
    cabinetMessages.innerHTML = "";
    if (!Array.isArray(items) || items.length === 0) {
      clearList(cabinetMessages, "Сообщений пока нет.");
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "simple-item";

      const time = document.createElement("time");
      time.textContent = formatDate(item.created_at);
      li.appendChild(time);

      if (String(item.message_kind || "") === "REQUEST_DATA") {
        li.classList.add("request-data-item");
        if (item.request_data_all_filled) li.classList.add("done");

        const author = document.createElement("div");
        author.className = "request-data-item-author";
        author.textContent = String(item.author_name || item.author_type || "Юрист");
        li.appendChild(author);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "request-data-message-btn";
        button.addEventListener("click", () => openDataRequestModal(item));

        const title = document.createElement("div");
        title.className = "request-data-message-title";
        if (
          item.request_data_all_filled &&
          Array.isArray(item.request_data_items) &&
          item.request_data_items.length === 1 &&
          String(item.request_data_items[0]?.field_type || "").toLowerCase() === "file"
        ) {
          title.textContent = "Файл";
        } else {
          title.textContent = "Запрос";
        }
        button.appendChild(title);

        if (!item.request_data_all_filled && Array.isArray(item.request_data_items) && item.request_data_items.length) {
          const list = document.createElement("div");
          list.className = "request-data-message-list";
          const visibleItems = item.request_data_items.slice(0, 7);
          visibleItems.forEach((req, idx) => {
            const row = document.createElement("div");
            row.className = "request-data-message-row";
            if (req.is_filled) row.classList.add("filled");

            const idxNode = document.createElement("span");
            idxNode.className = "request-data-message-row-index";
            idxNode.textContent = String(req.index || idx + 1) + ".";
            row.appendChild(idxNode);

            if (req.is_filled) {
              const check = document.createElement("span");
              check.className = "request-data-message-row-check";
              check.textContent = "✓";
              idxNode.prepend(check);
            }

            const labelNode = document.createElement("span");
            labelNode.className = "request-data-message-row-label";
            labelNode.textContent = String(req.label_short || req.label || "Поле");
            row.appendChild(labelNode);

            list.appendChild(row);
          });
          if (item.request_data_items.length > visibleItems.length) {
            const more = document.createElement("div");
            more.className = "request-data-message-more";
            more.textContent = "... еще " + String(item.request_data_items.length - visibleItems.length);
            list.appendChild(more);
          }
          button.appendChild(list);
        }

        li.appendChild(button);
      } else {
        const p = document.createElement("p");
        const author = item.author_name || item.author_type || "Участник";
        p.textContent = author + ": " + (item.body || "");
        li.appendChild(p);
      }
      cabinetMessages.appendChild(li);
    });
  }

  function renderFiles(items) {
    cabinetFiles.innerHTML = "";
    if (!Array.isArray(items) || items.length === 0) {
      clearList(cabinetFiles, "Файлы пока не загружены.");
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "simple-item";

      const time = document.createElement("time");
      time.textContent = formatDate(item.created_at);
      li.appendChild(time);

      const p = document.createElement("p");
      const sizeKb = Math.max(1, Math.round(Number(item.size_bytes || 0) / 1024));
      p.textContent = item.file_name + " (" + sizeKb + " КБ)";
      li.appendChild(p);

      const actions = document.createElement("div");
      actions.className = "file-actions";
      if (detectPreviewKind(item.file_name, item.mime_type) !== "none") {
        const previewBtn = document.createElement("button");
        previewBtn.type = "button";
        previewBtn.className = "file-link-btn";
        previewBtn.textContent = "Предпросмотр";
        previewBtn.addEventListener("click", () => openPreview(item));
        actions.appendChild(previewBtn);
      }

      const link = document.createElement("a");
      link.className = "file-link-btn";
      link.href = item.download_url;
      link.textContent = "Открыть / скачать";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.appendChild(link);
      li.appendChild(actions);
      cabinetFiles.appendChild(li);
    });
  }

  function renderServiceRequests(items) {
    if (!cabinetServiceRequests) return;
    cabinetServiceRequests.innerHTML = "";
    if (!Array.isArray(items) || items.length === 0) {
      clearList(cabinetServiceRequests, "Обращений пока нет.");
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "simple-item";

      const time = document.createElement("time");
      time.textContent = formatDate(item.created_at);
      li.appendChild(time);

      const p = document.createElement("p");
      const typeCode = String(item.type || "").toUpperCase();
      const statusCode = String(item.status || "").toUpperCase();
      const typeLabel = SERVICE_REQUEST_TYPE_LABELS[typeCode] || typeCode || "Запрос";
      const statusLabel = SERVICE_REQUEST_STATUS_LABELS[statusCode] || statusCode || "NEW";
      p.textContent = `${typeLabel} • ${statusLabel}`;
      li.appendChild(p);

      if (item.body) {
        const bodyNode = document.createElement("p");
        bodyNode.textContent = String(item.body || "");
        li.appendChild(bodyNode);
      }
      cabinetServiceRequests.appendChild(li);
    });
  }

  function renderInvoices(items) {
    cabinetInvoices.innerHTML = "";
    if (!Array.isArray(items) || items.length === 0) {
      clearList(cabinetInvoices, "Счета пока не выставлены.");
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "simple-item";

      const time = document.createElement("time");
      time.textContent = "Сформирован: " + formatDate(item.issued_at);
      li.appendChild(time);

      const p = document.createElement("p");
      const amount = Number(item.amount || 0).toLocaleString("ru-RU");
      p.textContent =
        (item.invoice_number || "Счет") +
        " • " +
        (item.status_label || item.status || "-") +
        " • " +
        amount +
        " " +
        (item.currency || "RUB");
      li.appendChild(p);

      const link = document.createElement("a");
      link.href = item.download_url;
      link.textContent = "Открыть / скачать PDF";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.color = "#f6d7a8";
      li.appendChild(link);

      cabinetInvoices.appendChild(li);
    });
  }

  function renderTimeline(items) {
    cabinetTimeline.innerHTML = "";
    if (!Array.isArray(items) || items.length === 0) {
      clearList(cabinetTimeline, "История пока пуста.");
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "simple-item";

      const time = document.createElement("time");
      time.textContent = formatDate(item.created_at);
      li.appendChild(time);

      const p = document.createElement("p");
      if (item.type === "status_change") {
        p.textContent = "Статус: " + (item.payload?.from_status || "NEW") + " -> " + (item.payload?.to_status || "-");
      } else if (item.type === "message") {
        const author = item.payload?.author_name || item.payload?.author_type || "Участник";
        p.textContent = "Сообщение от " + author + ": " + (item.payload?.body || "");
      } else if (item.type === "attachment") {
        p.textContent = "Файл: " + (item.payload?.file_name || "вложение");
      } else {
        p.textContent = "Событие";
      }
      li.appendChild(p);
      cabinetTimeline.appendChild(li);
    });
  }

  async function fetchRequestByTrack(trackNumber) {
    const response = await fetch("/api/public/requests/" + encodeURIComponent(trackNumber));
    const data = await parseJsonSafe(response);
    return { response, data };
  }

  async function refreshCabinetData() {
    if (!activeTrack) return;

    const [messagesRes, filesRes, serviceRequestsRes, invoicesRes, timelineRes] = await Promise.all([
      fetch("/api/public/chat/requests/" + encodeURIComponent(activeTrack) + "/messages"),
      fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/attachments"),
      fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/service-requests"),
      fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/invoices"),
      fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/timeline"),
    ]);

    const messagesData = await parseJsonSafe(messagesRes);
    const filesData = await parseJsonSafe(filesRes);
    const serviceRequestsData = await parseJsonSafe(serviceRequestsRes);
    const invoicesData = await parseJsonSafe(invoicesRes);
    const timelineData = await parseJsonSafe(timelineRes);

    if (!messagesRes.ok) throw new Error(apiErrorDetail(messagesData, "Не удалось загрузить сообщения"));
    if (!filesRes.ok) throw new Error(apiErrorDetail(filesData, "Не удалось загрузить файлы"));
    if (!serviceRequestsRes.ok) throw new Error(apiErrorDetail(serviceRequestsData, "Не удалось загрузить обращения"));
    if (!invoicesRes.ok) throw new Error(apiErrorDetail(invoicesData, "Не удалось загрузить счета"));
    if (!timelineRes.ok) throw new Error(apiErrorDetail(timelineData, "Не удалось загрузить историю"));

    renderMessages(messagesData);
    renderFiles(filesData);
    renderServiceRequests(serviceRequestsData);
    renderInvoices(invoicesData);
    renderTimeline(timelineData);
  }

  function syncRequestSelector(rows, selectedTrack) {
    requestSelect.innerHTML = "";
    rows.forEach((row) => {
      const option = document.createElement("option");
      option.value = String(row.track_number || "");
      option.textContent = String(row.track_number || "Без номера") + " • " + String(row.status_code || "-");
      requestSelect.appendChild(option);
    });
    if (selectedTrack) requestSelect.value = selectedTrack;
  }

  async function openCabinetByTrack(trackNumber) {
    if (!trackNumber) return;
    try {
      setStatus(pageStatus, "Открываем заявку...", null);
      const { response, data } = await fetchRequestByTrack(trackNumber);
      if (response.status === 401 || response.status === 403) {
        window.location.href = "/";
        return;
      }
      if (!response.ok) {
        throw new Error(apiErrorDetail(data, "Не удалось открыть заявку"));
      }

      activeTrack = trackNumber;
      activeRequestId = data.id;
      cabinetRequestStatus.textContent = data.status_code || "-";
      cabinetRequestTopic.textContent = data.topic_code || "Не указана";
      cabinetRequestCreated.textContent = formatDate(data.created_at);
      cabinetRequestUpdated.textContent = formatDate(data.updated_at);
      cabinetSummary.hidden = false;
      setCabinetEnabled(true);

      await refreshCabinetData();
      setStatus(pageStatus, "Открыта заявка: " + trackNumber, "ok");
    } catch (error) {
      setStatus(pageStatus, error?.message || "Не удалось открыть заявку", "error");
    }
  }

  async function loadMyRequests(preferredTrack) {
    const response = await fetch("/api/public/requests/my");
    const data = await parseJsonSafe(response);

    if (response.status === 401 || response.status === 403) {
      window.location.href = "/";
      return;
    }
    if (!response.ok) {
      throw new Error(apiErrorDetail(data, "Не удалось загрузить список заявок"));
    }

    const rows = Array.isArray(data?.rows) ? data.rows : [];
    if (!rows.length) {
      requestSelect.innerHTML = "";
      cabinetSummary.hidden = true;
      setCabinetEnabled(false);
      setStatus(pageStatus, "По вашему номеру пока нет заявок.", null);
      clearList(cabinetMessages, "Сообщений пока нет.");
      clearList(cabinetFiles, "Файлы пока не загружены.");
      if (cabinetServiceRequests) clearList(cabinetServiceRequests, "Обращений пока нет.");
      clearList(cabinetInvoices, "Счета пока не выставлены.");
      clearList(cabinetTimeline, "История пока пуста.");
      return;
    }

    const tracks = rows.map((row) => String(row.track_number || "")).filter(Boolean);
    const selectedTrack = tracks.includes(preferredTrack) ? preferredTrack : tracks[0];
    syncRequestSelector(rows, selectedTrack);
    await openCabinetByTrack(selectedTrack);
  }

  requestSelect.addEventListener("change", async () => {
    const track = String(requestSelect.value || "").trim();
    if (!track) return;
    await openCabinetByTrack(track);
  });

  refreshButton.addEventListener("click", async () => {
    try {
      await loadMyRequests(activeTrack || String(requestSelect.value || "").trim());
    } catch (error) {
      setStatus(pageStatus, error?.message || "Не удалось обновить список", "error");
    }
  });

  if (openCuratorRequestButton) {
    openCuratorRequestButton.addEventListener("click", () => openServiceRequestModal("CURATOR_CONTACT"));
  }
  if (openLawyerChangeButton) {
    openLawyerChangeButton.addEventListener("click", () => openServiceRequestModal("LAWYER_CHANGE_REQUEST"));
  }

  if (previewClose) {
    previewClose.addEventListener("click", closePreview);
  }
  if (previewOverlay) {
    previewOverlay.addEventListener("click", (event) => {
      if (event.target === previewOverlay) closePreview();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && previewOverlay?.classList.contains("open")) {
      closePreview();
    }
    if (event.key === "Escape" && dataRequestOverlay?.classList.contains("open")) {
      closeDataRequestModal();
    }
    if (event.key === "Escape" && serviceRequestOverlay?.classList.contains("open")) {
      closeServiceRequestModal();
    }
  });

  if (dataRequestClose) {
    dataRequestClose.addEventListener("click", closeDataRequestModal);
  }
  if (dataRequestOverlay) {
    dataRequestOverlay.addEventListener("click", (event) => {
      if (event.target === dataRequestOverlay) closeDataRequestModal();
    });
  }
  if (serviceRequestClose) {
    serviceRequestClose.addEventListener("click", closeServiceRequestModal);
  }
  if (serviceRequestOverlay) {
    serviceRequestOverlay.addEventListener("click", (event) => {
      if (event.target === serviceRequestOverlay) closeServiceRequestModal();
    });
  }
  if (serviceRequestForm) {
    serviceRequestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!activeTrack) {
        setServiceRequestStatus("Сначала выберите заявку.", "error");
        return;
      }
      const requestType = String(serviceRequestTypeInput?.value || "").trim().toUpperCase();
      const body = String(serviceRequestBodyInput?.value || "").trim();
      if (!requestType) {
        setServiceRequestStatus("Выберите тип обращения.", "error");
        return;
      }
      if (body.length < 3) {
        setServiceRequestStatus('Сообщение должно содержать минимум 3 символа.', "error");
        return;
      }
      try {
        setServiceRequestStatus("Отправляем обращение...", null);
        const response = await fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/service-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: requestType, body }),
        });
        const data = await parseJsonSafe(response);
        if (!response.ok) throw new Error(apiErrorDetail(data, "Не удалось отправить обращение"));
        await refreshCabinetData();
        setStatus(pageStatus, "Обращение отправлено.", "ok");
        closeServiceRequestModal();
      } catch (error) {
        setServiceRequestStatus(error?.message || "Не удалось отправить обращение", "error");
      }
    });
  }
  if (dataRequestForm) {
    dataRequestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!activeTrack || !activeDataRequestMessageId || !activeRequestId) return;
      const inputs = Array.from(dataRequestForm.querySelectorAll("input[data-req-id], textarea[data-req-id]"));
      try {
        setDataRequestStatus("Сохраняем...", null);
        const items = [];
        for (const input of inputs) {
          const fieldType = String(input.dataset.reqFieldType || "").toLowerCase();
          if (fieldType === "file") {
            let attachmentId = "";
            if (input.files && input.files[0]) {
              setDataRequestStatus("Загружаем файл для поля...", null);
              const completeData = await uploadPublicRequestAttachment(input.files[0], activeRequestId);
              attachmentId = String((completeData && completeData.attachment_id) || "");
              input.dataset.currentValue = attachmentId;
            } else {
              attachmentId = String(input.dataset.currentValue || "");
            }
            items.push({
              id: String(input.dataset.reqId || ""),
              key: String(input.dataset.reqKey || ""),
              attachment_id: attachmentId,
              value_text: attachmentId,
            });
            continue;
          }
          items.push({
            id: String(input.dataset.reqId || ""),
            key: String(input.dataset.reqKey || ""),
            value_text: String(input.value || ""),
          });
        }
        setDataRequestStatus("Сохраняем...", null);
        const response = await fetch(
          "/api/public/chat/requests/" +
            encodeURIComponent(activeTrack) +
            "/data-requests/" +
            encodeURIComponent(activeDataRequestMessageId),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
          }
        );
        const data = await parseJsonSafe(response);
        if (!response.ok) throw new Error(apiErrorDetail(data, "Не удалось сохранить данные"));
        setDataRequestStatus("Данные сохранены.", "ok");
        await refreshCabinetData();
      } catch (error) {
        setDataRequestStatus(error?.message || "Не удалось сохранить данные", "error");
      }
    });
  }

  cabinetChatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeTrack) {
      setStatus(pageStatus, "Сначала выберите заявку.", "error");
      return;
    }

    const body = String(cabinetChatBody.value || "").trim();
    if (!body) return;

    try {
      setStatus(pageStatus, "Отправляем сообщение...", null);
      const response = await fetch("/api/public/chat/requests/" + encodeURIComponent(activeTrack) + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) throw new Error(apiErrorDetail(data, "Не удалось отправить сообщение"));
      cabinetChatBody.value = "";
      await refreshCabinetData();
      setStatus(pageStatus, "Сообщение отправлено.", "ok");
    } catch (error) {
      setStatus(pageStatus, error?.message || "Ошибка отправки сообщения", "error");
    }
  });

  cabinetFileUpload.addEventListener("click", async () => {
    if (!activeTrack || !activeRequestId) {
      setStatus(pageStatus, "Сначала выберите заявку.", "error");
      return;
    }
    const file = cabinetFileInput.files && cabinetFileInput.files[0];
    if (!file) {
      setStatus(pageStatus, "Выберите файл для загрузки.", "error");
      return;
    }

    try {
      setStatus(pageStatus, "Подготавливаем загрузку файла...", null);
      await uploadPublicRequestAttachment(file, activeRequestId);

      cabinetFileInput.value = "";
      await refreshCabinetData();
      setStatus(pageStatus, "Файл загружен.", "ok");
    } catch (error) {
      setStatus(pageStatus, error?.message || "Ошибка загрузки файла", "error");
    }
  });

  (async function bootstrap() {
    const params = new URLSearchParams(window.location.search);
    const preferredTrack = String(params.get("track") || "").trim().toUpperCase();

    setCabinetEnabled(false);
    clearList(cabinetMessages, "Сообщений пока нет.");
    clearList(cabinetFiles, "Файлы пока не загружены.");
    if (cabinetServiceRequests) clearList(cabinetServiceRequests, "Обращений пока нет.");
    clearList(cabinetInvoices, "Счета пока не выставлены.");
    clearList(cabinetTimeline, "История пока пуста.");

    try {
      await loadMyRequests(preferredTrack);
    } catch (error) {
      setStatus(pageStatus, error?.message || "Не удалось открыть страницу клиента", "error");
    }
  })();
})();
