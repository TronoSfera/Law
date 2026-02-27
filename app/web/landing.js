(function () {
  const requestModal = document.getElementById("request-modal");
  const accessModal = document.getElementById("access-modal");
  const requestOpenButtons = document.querySelectorAll("[data-open-modal]");
  const requestCloseButtons = document.querySelectorAll("[data-close-modal]");
  const accessOpenButtons = document.querySelectorAll("[data-open-access]");
  const accessCloseButtons = document.querySelectorAll("[data-close-access]");
  const otpModal = document.getElementById("otp-modal");
  const otpCloseButtons = document.querySelectorAll("[data-close-otp]");

  const requestForm = document.getElementById("request-form");
  const requestStatus = document.getElementById("form-status");
  const topicSelect = document.getElementById("topic");

  const accessForm = document.getElementById("access-form");
  const accessPhoneInput = document.getElementById("access-phone");
  const accessCodeInput = document.getElementById("access-code");
  const accessSendOtpButton = document.getElementById("access-send-otp");
  const accessStatus = document.getElementById("access-status");
  const otpModalForm = document.getElementById("otp-modal-form");
  const otpModalCodeInput = document.getElementById("otp-modal-code");
  const otpModalCancelButton = document.getElementById("otp-modal-cancel");
  const otpModalStatus = document.getElementById("otp-modal-status");
  const otpModalHint = document.getElementById("otp-modal-hint");

  const quoteText = document.getElementById("quote-text");
  const quoteMeta = document.getElementById("quote-meta");
  const quoteWrap = quoteText ? quoteText.closest(".consultation-quote") : null;
  const featuredTeamSection = document.getElementById("team");
  const featuredTeamTrack = document.getElementById("featured-team-track");
  const featuredTeamDots = document.getElementById("featured-team-dots");
  const featuredTeamPrev = document.getElementById("featured-team-prev");
  const featuredTeamNext = document.getElementById("featured-team-next");
  let otpModalResolver = null;

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
  otpCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (otpModalResolver) {
        const resolve = otpModalResolver;
        otpModalResolver = null;
        resolve("");
      }
      closeModal(otpModal);
    });
  });

  [requestModal, accessModal].forEach((modal) => {
    if (!modal) return;
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });
  if (otpModal) {
    otpModal.addEventListener("click", (event) => {
      if (event.target !== otpModal) return;
      if (otpModalResolver) {
        const resolve = otpModalResolver;
        otpModalResolver = null;
        resolve("");
      }
      closeModal(otpModal);
    });
  }

  function requestOtpCode(hintText) {
    return new Promise((resolve) => {
      otpModalResolver = resolve;
      if (otpModalCodeInput) otpModalCodeInput.value = "";
      setStatus(otpModalStatus, "", null);
      if (otpModalHint) otpModalHint.textContent = hintText || "Введите OTP-код из SMS.";
      openModal(otpModal);
      setTimeout(() => {
        if (otpModalCodeInput && typeof otpModalCodeInput.focus === "function") otpModalCodeInput.focus();
      }, 10);
    });
  }

  if (otpModalCancelButton) {
    otpModalCancelButton.addEventListener("click", () => {
      if (otpModalResolver) {
        const resolve = otpModalResolver;
        otpModalResolver = null;
        resolve("");
      }
      closeModal(otpModal);
    });
  }

  if (otpModalForm) {
    otpModalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const code = String(otpModalCodeInput?.value || "").trim();
      if (!code) {
        setStatus(otpModalStatus, "Введите OTP-код.", "error");
        return;
      }
      setStatus(otpModalStatus, "", null);
      if (otpModalResolver) {
        const resolve = otpModalResolver;
        otpModalResolver = null;
        resolve(code);
      }
      closeModal(otpModal);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (otpModalResolver && otpModal && otpModal.classList.contains("open")) {
      const resolve = otpModalResolver;
      otpModalResolver = null;
      resolve("");
    }
    closeModal(otpModal);
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
    let quoteTransitionTimer = 0;
    const reducedMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const setQuoteContent = (quote) => {
      if (!quoteText || !quoteMeta) return;
      quoteText.textContent = String(quote?.text || "");
      quoteMeta.textContent = [quote?.author, quote?.source].filter(Boolean).join(" • ");
    };

    const renderQuote = (quote) => {
      if (!quoteText || !quoteMeta) return;
      if (!quoteWrap || reducedMotion) {
        setQuoteContent(quote);
        return;
      }
      if (quoteTransitionTimer) {
        clearTimeout(quoteTransitionTimer);
        quoteTransitionTimer = 0;
      }
      quoteWrap.classList.add("is-transitioning");
      quoteTransitionTimer = window.setTimeout(() => {
        setQuoteContent(quote);
        quoteWrap.classList.remove("is-transitioning");
        quoteTransitionTimer = 0;
      }, 320);
    };

    try {
      const response = await fetch("/api/public/quotes?limit=8&order=random");
      if (!response.ok) throw new Error("quotes fetch failed");
      const items = await response.json();
      if (!Array.isArray(items) || items.length === 0) throw new Error("quotes empty");
      let index = 0;
      const render = () => {
        const quote = items[index % items.length];
        renderQuote(quote);
        index += 1;
      };
      render();
      if (items.length > 1) setInterval(render, 5500);
    } catch (_) {
      renderQuote({
        text: "С вами работает дружный коллектив профессионалов. Мы уверены в вашем успехе.",
        author: "Команда компании",
      });
    }
  }

  function renderFeaturedDots(count, activeIndex) {
    if (!featuredTeamDots) return;
    featuredTeamDots.innerHTML = "";
    if (count <= 1) return;
    for (let index = 0; index < count; index += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "carousel-dot" + (index === activeIndex ? " active" : "");
      button.setAttribute("aria-label", "Карточка " + (index + 1));
      button.addEventListener("click", () => {
        const card = featuredTeamTrack?.children?.[index];
        if (card && typeof card.scrollIntoView === "function") {
          card.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
        }
      });
      featuredTeamDots.appendChild(button);
    }
  }

  function initFeaturedCarouselControls() {
    if (!featuredTeamTrack) return;
    const scrollByCards = (dir) => {
      const card = featuredTeamTrack.querySelector(".featured-card");
      const step = card ? card.getBoundingClientRect().width + 14 : 320;
      featuredTeamTrack.scrollBy({ left: dir * step, behavior: "smooth" });
    };

    if (featuredTeamPrev) featuredTeamPrev.addEventListener("click", () => scrollByCards(-1));
    if (featuredTeamNext) featuredTeamNext.addEventListener("click", () => scrollByCards(1));

    let rafId = 0;
    const syncDots = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const cards = Array.from(featuredTeamTrack.children || []);
        if (!cards.length) return renderFeaturedDots(0, 0);
        const trackLeft = featuredTeamTrack.getBoundingClientRect().left;
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        cards.forEach((card, index) => {
          const distance = Math.abs(card.getBoundingClientRect().left - trackLeft);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        });
        renderFeaturedDots(cards.length, bestIndex);
      });
    };
    featuredTeamTrack.addEventListener("scroll", syncDots, { passive: true });
    window.addEventListener("resize", syncDots);
    syncDots();
  }

  async function loadFeaturedStaff() {
    if (!featuredTeamSection || !featuredTeamTrack) return;
    try {
      const response = await fetch("/api/public/featured-staff?limit=24");
      const data = await parseJsonSafe(response);
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!response.ok || items.length === 0) {
        featuredTeamSection.hidden = true;
        return;
      }

      featuredTeamTrack.innerHTML = "";
      items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "featured-card";

        const avatar = document.createElement("img");
        avatar.className = "featured-avatar";
        avatar.src = String(item.avatar_url || "");
        avatar.alt = String(item.name || "Сотрудник");
        avatar.loading = "lazy";
        card.appendChild(avatar);

        const body = document.createElement("div");
        body.className = "featured-card-body";

        const top = document.createElement("div");
        top.className = "featured-card-top";
        const name = document.createElement("h3");
        name.textContent = String(item.name || "Сотрудник");
        top.appendChild(name);
        if (item.pinned) {
          const chip = document.createElement("span");
          chip.className = "featured-chip";
          chip.textContent = "Рекомендуем";
          top.appendChild(chip);
        }
        body.appendChild(top);

        const meta = document.createElement("p");
        meta.className = "featured-meta";
        meta.textContent = [item.role_label, item.primary_topic_name].filter(Boolean).join(" • ");
        body.appendChild(meta);

        const caption = document.createElement("p");
        caption.className = "featured-caption";
        caption.textContent = String(item.caption || "Практический опыт в сложных юридических делах и сопровождении споров.");
        body.appendChild(caption);

        card.appendChild(body);
        featuredTeamTrack.appendChild(card);
      });

      featuredTeamSection.hidden = false;
      initFeaturedCarouselControls();
    } catch (_) {
      featuredTeamSection.hidden = true;
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

      const isMocked = Boolean(otpSendData?.sms_response?.mocked) || String(otpSendData?.sms_response?.provider || "") === "mock_sms";
      const code = await requestOtpCode(
        isMocked ? "Введите OTP-код из SMS (dev-режим: смотрите backend console)." : "Введите OTP-код из SMS."
      );
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
  loadFeaturedStaff();
})();
