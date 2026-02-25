(function () {
  const requestModal = document.getElementById("request-modal");
  const accessModal = document.getElementById("access-modal");
  const requestOpenButtons = document.querySelectorAll("[data-open-modal]");
  const requestCloseButtons = document.querySelectorAll("[data-close-modal]");
  const accessOpenButtons = document.querySelectorAll("[data-open-access]");
  const accessCloseButtons = document.querySelectorAll("[data-close-access]");

  const requestForm = document.getElementById("request-form");
  const requestStatus = document.getElementById("form-status");
  const topicSelect = document.getElementById("topic");

  const accessForm = document.getElementById("access-form");
  const accessPhoneInput = document.getElementById("access-phone");
  const accessCodeInput = document.getElementById("access-code");
  const accessSendOtpButton = document.getElementById("access-send-otp");
  const accessStatus = document.getElementById("access-status");

  const quoteText = document.getElementById("quote-text");
  const quoteMeta = document.getElementById("quote-meta");

  function setStatus(el, message, kind) {
    if (!el) return;
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

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal-backdrop.open")) {
      document.body.classList.remove("modal-open");
    }
  }

  requestOpenButtons.forEach((button) => {
    button.addEventListener("click", () => openModal(requestModal));
  });
  requestCloseButtons.forEach((button) => {
    button.addEventListener("click", () => closeModal(requestModal));
  });

  accessOpenButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const response = await fetch("/api/public/requests/my");
        if (response.ok) {
          window.location.href = "/client.html";
          return;
        }
      } catch (_) {}
      setStatus(accessStatus, "", null);
      openModal(accessModal);
    });
  });
  accessCloseButtons.forEach((button) => {
    button.addEventListener("click", () => closeModal(accessModal));
  });

  [requestModal, accessModal].forEach((modal) => {
    if (!modal) return;
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeModal(requestModal);
    closeModal(accessModal);
  });

  async function loadTopics() {
    if (!topicSelect) return;
    const fallback = [{ code: "consulting", name: "Консультация" }];
    let topics = fallback;
    try {
      const response = await fetch("/api/public/requests/topics");
      const data = await parseJsonSafe(response);
      if (response.ok && Array.isArray(data) && data.length > 0) {
        topics = data;
      }
    } catch (_) {}

    topicSelect.innerHTML = '<option value="">Выберите тему</option>';
    topics.forEach((row) => {
      const option = document.createElement("option");
      option.value = String(row.code || "");
      option.textContent = String(row.name || row.code || "Тема");
      topicSelect.appendChild(option);
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
    } catch (_) {
      quoteText.textContent = "С вами работает дружный коллектив профессионалов. Мы уверены в вашем успехе.";
      quoteMeta.textContent = "Команда компании";
    }
  }

  accessSendOtpButton.addEventListener("click", async () => {
    const phone = String(accessPhoneInput.value || "").trim();
    if (!phone) {
      setStatus(accessStatus, "Введите номер телефона.", "error");
      return;
    }

    try {
      setStatus(accessStatus, "Отправляем OTP-код...", null);
      const response = await fetch("/api/public/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "VIEW_REQUEST",
          client_phone: phone,
        }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) throw new Error(apiErrorDetail(data, "Не удалось отправить OTP"));
      setStatus(accessStatus, "Код отправлен. Проверьте SMS.", "ok");
    } catch (error) {
      setStatus(accessStatus, error?.message || "Не удалось отправить OTP", "error");
    }
  });

  accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = String(accessPhoneInput.value || "").trim();
    const code = String(accessCodeInput.value || "").trim();
    if (!phone || !code) {
      setStatus(accessStatus, "Введите телефон и OTP-код.", "error");
      return;
    }

    try {
      setStatus(accessStatus, "Проверяем OTP...", null);
      const response = await fetch("/api/public/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "VIEW_REQUEST",
          client_phone: phone,
          code,
        }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) throw new Error(apiErrorDetail(data, "OTP не подтвержден"));
      setStatus(accessStatus, "Доступ подтвержден. Переходим...", "ok");
      window.location.href = "/client.html";
    } catch (error) {
      setStatus(accessStatus, error?.message || "Ошибка проверки OTP", "error");
    }
  });

  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(requestStatus, "Отправляем заявку...", null);

    const payload = {
      client_name: String(document.getElementById("name").value || "").trim(),
      client_phone: String(document.getElementById("phone").value || "").trim(),
      topic_code: String(document.getElementById("topic").value || "").trim(),
      description: String(document.getElementById("description").value || "").trim(),
      extra_fields: {},
    };

    if (!payload.client_name || !payload.client_phone || !payload.topic_code) {
      setStatus(requestStatus, "Заполните имя, телефон и тему обращения.", "error");
      return;
    }

    try {
      setStatus(requestStatus, "Отправляем OTP-код...", null);
      const otpSend = await fetch("/api/public/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "CREATE_REQUEST",
          client_phone: payload.client_phone,
        }),
      });
      const otpSendData = await parseJsonSafe(otpSend);
      if (!otpSend.ok) throw new Error(apiErrorDetail(otpSendData, "Не удалось отправить OTP"));

      const code = window.prompt("Введите OTP-код из SMS (в dev-режиме смотрите backend console):");
      if (!code) throw new Error("Код OTP не введен");

      setStatus(requestStatus, "Проверяем OTP...", null);
      const otpVerify = await fetch("/api/public/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "CREATE_REQUEST",
          client_phone: payload.client_phone,
          code: String(code).trim(),
        }),
      });
      const otpVerifyData = await parseJsonSafe(otpVerify);
      if (!otpVerify.ok) throw new Error(apiErrorDetail(otpVerifyData, "OTP не подтвержден"));

      setStatus(requestStatus, "Создаем заявку...", null);
      const response = await fetch("/api/public/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) throw new Error(apiErrorDetail(data, "Не удалось создать заявку"));

      setStatus(requestStatus, "Заявка принята. Номер: " + data.track_number, "ok");
      requestForm.reset();
      setTimeout(() => closeModal(requestModal), 1200);
    } catch (error) {
      setStatus(requestStatus, error?.message || "Не удалось отправить заявку. Повторите попытку позже.", "error");
    }
  });

  loadTopics();
  loadQuotes();
})();
