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

  let activeTrack = "";
  let activeRequestId = "";

  function formatDate(value) {
    if (!value) return "-";
    try {
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return value;
      return dt.toLocaleString("ru-RU");
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
    if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return "image";
    if (mime.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/.test(name)) return "video";
    if (mime === "application/pdf" || /\.pdf$/.test(name)) return "pdf";
    return "none";
  }

  function closePreview() {
    if (!previewOverlay || !previewBody) return;
    previewOverlay.classList.remove("open");
    previewOverlay.setAttribute("aria-hidden", "true");
    previewBody.innerHTML = "";
  }

  function openPreview(item) {
    if (!previewOverlay || !previewBody || !previewTitle || !item?.download_url) return;
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
    } else if (kind === "pdf") {
      const frame = document.createElement("iframe");
      frame.className = "preview-frame";
      frame.src = item.download_url;
      frame.title = item.file_name || "PDF";
      previewBody.appendChild(frame);
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

      const p = document.createElement("p");
      const author = item.author_name || item.author_type || "Участник";
      p.textContent = author + ": " + (item.body || "");
      li.appendChild(p);
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

    const [messagesRes, filesRes, invoicesRes, timelineRes] = await Promise.all([
      fetch("/api/public/chat/requests/" + encodeURIComponent(activeTrack) + "/messages"),
      fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/attachments"),
      fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/invoices"),
      fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/timeline"),
    ]);

    const messagesData = await parseJsonSafe(messagesRes);
    const filesData = await parseJsonSafe(filesRes);
    const invoicesData = await parseJsonSafe(invoicesRes);
    const timelineData = await parseJsonSafe(timelineRes);

    if (!messagesRes.ok) throw new Error(apiErrorDetail(messagesData, "Не удалось загрузить сообщения"));
    if (!filesRes.ok) throw new Error(apiErrorDetail(filesData, "Не удалось загрузить файлы"));
    if (!invoicesRes.ok) throw new Error(apiErrorDetail(invoicesData, "Не удалось загрузить счета"));
    if (!timelineRes.ok) throw new Error(apiErrorDetail(timelineData, "Не удалось загрузить историю"));

    renderMessages(messagesData);
    renderFiles(filesData);
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
  });

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
      const initResponse = await fetch("/api/public/uploads/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          scope: "REQUEST_ATTACHMENT",
          request_id: activeRequestId,
        }),
      });
      const initData = await parseJsonSafe(initResponse);
      if (!initResponse.ok) throw new Error(apiErrorDetail(initData, "Не удалось начать загрузку"));

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
          request_id: activeRequestId,
        }),
      });
      const completeData = await parseJsonSafe(completeResponse);
      if (!completeResponse.ok) throw new Error(apiErrorDetail(completeData, "Не удалось завершить загрузку"));

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
    clearList(cabinetInvoices, "Счета пока не выставлены.");
    clearList(cabinetTimeline, "История пока пуста.");

    try {
      await loadMyRequests(preferredTrack);
    } catch (error) {
      setStatus(pageStatus, error?.message || "Не удалось открыть страницу клиента", "error");
    }
  })();
})();
