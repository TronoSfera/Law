    (function () {
      const modal = document.getElementById("request-modal");
      const openButtons = document.querySelectorAll("[data-open-modal]");
      const closeButtons = document.querySelectorAll("[data-close-modal]");
      const form = document.getElementById("request-form");
      const status = document.getElementById("form-status");
      const quoteText = document.getElementById("quote-text");
      const quoteMeta = document.getElementById("quote-meta");
      const cabinetTrackInput = document.getElementById("cabinet-track");
      const cabinetOpenButton = document.getElementById("cabinet-open");
      const cabinetStatus = document.getElementById("cabinet-status");
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

      let activeTrack = "";
      let activeRequestId = "";

      function openModal() {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
      }

      function closeModal() {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
      }

      openButtons.forEach((button) => button.addEventListener("click", openModal));
      closeButtons.forEach((button) => button.addEventListener("click", closeModal));

      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal.classList.contains("open")) closeModal();
      });

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

          const link = document.createElement("a");
          link.href = item.download_url;
          link.textContent = "Открыть / скачать";
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.style.color = "#f6d7a8";
          li.appendChild(link);
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

      async function loadQuotes() {
        try {
          const response = await fetch("/api/public/quotes?limit=8&order=random");
          if (!response.ok) throw new Error("quotes fetch failed");
          const items = await response.json();
          if (!Array.isArray(items) || items.length === 0) throw new Error("quotes empty");
          let index = 0;
          const render = () => {
            const quote = items[index % items.length];
            quoteText.textContent = quote.text;
            quoteMeta.textContent = [quote.author, quote.source].filter(Boolean).join(" • ");
            index += 1;
          };
          render();
          if (items.length > 1) setInterval(render, 5500);
        } catch (error) {
          quoteText.textContent = "С вами работает дружный коллектив профессионалов. Мы уверены в вашем успехе.";
          quoteMeta.textContent = "Команда компании";
        }
      }

      async function fetchRequestByTrack(trackNumber) {
        const response = await fetch("/api/public/requests/" + encodeURIComponent(trackNumber));
        const data = await parseJsonSafe(response);
        return { response, data };
      }

      async function ensureViewAccess(trackNumber) {
        let { response, data } = await fetchRequestByTrack(trackNumber);
        if (response.ok) return data;

        if (response.status !== 401 && response.status !== 403) {
          throw new Error(apiErrorDetail(data, "Не удалось открыть заявку"));
        }

        setStatus(cabinetStatus, "Отправляем OTP-код...", null);
        const sendResponse = await fetch("/api/public/otp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purpose: "VIEW_REQUEST",
            track_number: trackNumber
          })
        });
        const sendData = await parseJsonSafe(sendResponse);
        if (!sendResponse.ok) {
          throw new Error(apiErrorDetail(sendData, "Не удалось отправить OTP"));
        }

        const code = window.prompt("Введите OTP-код из SMS (в dev-режиме смотрите backend console):");
        if (!code) {
          throw new Error("Код OTP не введен");
        }

        setStatus(cabinetStatus, "Проверяем OTP...", null);
        const verifyResponse = await fetch("/api/public/otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purpose: "VIEW_REQUEST",
            track_number: trackNumber,
            code: String(code).trim()
          })
        });
        const verifyData = await parseJsonSafe(verifyResponse);
        if (!verifyResponse.ok) {
          throw new Error(apiErrorDetail(verifyData, "OTP не подтвержден"));
        }

        ({ response, data } = await fetchRequestByTrack(trackNumber));
        if (!response.ok) {
          throw new Error(apiErrorDetail(data, "Нет доступа к заявке"));
        }
        return data;
      }

      async function refreshCabinetData() {
        if (!activeTrack) return;

        const [messagesRes, filesRes, invoicesRes, timelineRes] = await Promise.all([
          fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/messages"),
          fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/attachments"),
          fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/invoices"),
          fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/timeline")
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

      async function openCabinetByTrack() {
        const trackNumber = String(cabinetTrackInput.value || "").trim().toUpperCase();
        if (!trackNumber) {
          setStatus(cabinetStatus, "Введите номер заявки.", "error");
          return;
        }

        try {
          setStatus(cabinetStatus, "Открываем кабинет...", null);
          const requestData = await ensureViewAccess(trackNumber);
          activeTrack = trackNumber;
          activeRequestId = requestData.id;

          cabinetRequestStatus.textContent = requestData.status_code || "-";
          cabinetRequestTopic.textContent = requestData.topic_code || "Не указана";
          cabinetRequestCreated.textContent = formatDate(requestData.created_at);
          cabinetRequestUpdated.textContent = formatDate(requestData.updated_at);
          cabinetSummary.hidden = false;
          setCabinetEnabled(true);

          await refreshCabinetData();
          setStatus(cabinetStatus, "Кабинет открыт: " + trackNumber, "ok");
        } catch (error) {
          setStatus(cabinetStatus, error?.message || "Не удалось открыть кабинет", "error");
        }
      }

      cabinetOpenButton.addEventListener("click", () => {
        openCabinetByTrack();
      });

      cabinetChatForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!activeTrack) {
          setStatus(cabinetStatus, "Сначала откройте кабинет по номеру заявки.", "error");
          return;
        }

        const body = String(cabinetChatBody.value || "").trim();
        if (!body) return;

        try {
          setStatus(cabinetStatus, "Отправляем сообщение...", null);
          const response = await fetch("/api/public/requests/" + encodeURIComponent(activeTrack) + "/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body })
          });
          const data = await parseJsonSafe(response);
          if (!response.ok) throw new Error(apiErrorDetail(data, "Не удалось отправить сообщение"));
          cabinetChatBody.value = "";
          await refreshCabinetData();
          setStatus(cabinetStatus, "Сообщение отправлено.", "ok");
        } catch (error) {
          setStatus(cabinetStatus, error?.message || "Ошибка отправки сообщения", "error");
        }
      });

      cabinetFileUpload.addEventListener("click", async () => {
        if (!activeTrack || !activeRequestId) {
          setStatus(cabinetStatus, "Сначала откройте кабинет по номеру заявки.", "error");
          return;
        }
        const file = cabinetFileInput.files && cabinetFileInput.files[0];
        if (!file) {
          setStatus(cabinetStatus, "Выберите файл для загрузки.", "error");
          return;
        }

        try {
          setStatus(cabinetStatus, "Подготавливаем загрузку файла...", null);
          const initResponse = await fetch("/api/public/uploads/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              file_name: file.name,
              mime_type: file.type || "application/octet-stream",
              size_bytes: file.size,
              scope: "REQUEST_ATTACHMENT",
              request_id: activeRequestId
            })
          });
          const initData = await parseJsonSafe(initResponse);
          if (!initResponse.ok) throw new Error(apiErrorDetail(initData, "Не удалось начать загрузку"));

          const putResponse = await fetch(initData.presigned_url, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file
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
              request_id: activeRequestId
            })
          });
          const completeData = await parseJsonSafe(completeResponse);
          if (!completeResponse.ok) throw new Error(apiErrorDetail(completeData, "Не удалось завершить загрузку"));

          cabinetFileInput.value = "";
          await refreshCabinetData();
          setStatus(cabinetStatus, "Файл загружен.", "ok");
        } catch (error) {
          setStatus(cabinetStatus, error?.message || "Ошибка загрузки файла", "error");
        }
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        setStatus(status, "Отправляем заявку...", null);

        const payload = {
          client_name: document.getElementById("name").value.trim(),
          client_phone: document.getElementById("phone").value.trim(),
          topic_code: "consulting",
          description: document.getElementById("description").value.trim(),
          extra_fields: {
            referral_name: document.getElementById("referral").value.trim()
          }
        };

        try {
          setStatus(status, "Отправляем OTP-код...", null);
          const otpSend = await fetch("/api/public/otp/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              purpose: "CREATE_REQUEST",
              client_phone: payload.client_phone
            })
          });
          if (!otpSend.ok) throw new Error("otp send failed");

          const code = window.prompt("Введите OTP-код из SMS (в dev-режиме смотрите backend console):");
          if (!code) throw new Error("otp code required");

          setStatus(status, "Проверяем OTP...", null);
          const otpVerify = await fetch("/api/public/otp/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              purpose: "CREATE_REQUEST",
              client_phone: payload.client_phone,
              code: String(code).trim()
            })
          });
          if (!otpVerify.ok) throw new Error("otp verify failed");

          setStatus(status, "Создаем заявку...", null);
          const response = await fetch("/api/public/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          if (!response.ok) throw new Error("create request failed");
          const data = await response.json();
          setStatus(status, "Заявка принята. Номер: " + data.track_number, "ok");
          cabinetTrackInput.value = data.track_number;
          form.reset();
          setTimeout(closeModal, 1200);
        } catch (error) {
          setStatus(status, "Не удалось отправить заявку. Повторите попытку позже.", "error");
        }
      });

      loadQuotes();
      setCabinetEnabled(false);
      clearList(cabinetMessages, "Сообщений пока нет.");
      clearList(cabinetFiles, "Файлы пока не загружены.");
      clearList(cabinetInvoices, "Счета пока не выставлены.");
      clearList(cabinetTimeline, "История пока пуста.");
    })();
