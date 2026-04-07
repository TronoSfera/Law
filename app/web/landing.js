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
  const requestPhoneInput = document.getElementById("phone");

  const accessForm = document.getElementById("access-form");
  const accessPhoneInput = document.getElementById("access-phone");
  const accessEmailInput = document.getElementById("access-email");
  const accessHpInput = document.getElementById("access-hp-field");
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
  const requestEmailInput = document.getElementById("email");
  const requestHpInput = document.getElementById("request-hp-field");
  const topbar = document.querySelector(".topbar");
  const topbarNav = document.querySelector(".nav");
  const navToggle = document.querySelector("[data-nav-toggle]");
  const mobileNavMql = window.matchMedia("(max-width: 740px)");
  let otpModalResolver = null;
  let lastAccessOtpChannel = "SMS";
  let lastCreateOtpChannel = "SMS";
  let authConfig = { public_auth_mode: "sms", available_channels: ["SMS"] };

  function setTopbarNavOpen(open) {
    if (!topbar || !navToggle) return;
    topbar.classList.toggle("nav-open", Boolean(open));
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navToggle.setAttribute("aria-label", open ? "Закрыть навигацию" : "Открыть навигацию");
  }

  function closeTopbarNav() {
    setTopbarNavOpen(false);
  }

  function initTopbarNav() {
    if (!topbar || !topbarNav || !navToggle) return;
    navToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      setTopbarNavOpen(!topbar.classList.contains("nav-open"));
    });

    topbarNav.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const action = event.target.closest("a, button");
      if (!action) return;
      if (mobileNavMql.matches) closeTopbarNav();
    });

    document.addEventListener("click", (event) => {
      if (!mobileNavMql.matches || !topbar.classList.contains("nav-open")) return;
      if (topbar.contains(event.target)) return;
      closeTopbarNav();
    });

    window.addEventListener("resize", () => {
      if (!mobileNavMql.matches) closeTopbarNav();
    });
  }

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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function markdownInlineToHtml(escapedText) {
    const tokens = [];
    const makeToken = (html) => {
      const id = tokens.length;
      tokens.push(html);
      return "\u0001" + String(id) + "\u0001";
    };
    let out = String(escapedText || "");
    out = out.replace(/`([^`\n]+)`/g, (_, code) => makeToken("<code>" + code + "</code>"));
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_, label, url) =>
      makeToken('<a href="' + url + '" target="_blank" rel="noreferrer noopener">' + label + "</a>")
    );
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
    out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, "$1<em>$2</em>");
    out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?;:]|$)/g, "$1<em>$2</em>");
    return out.replace(/\u0001(\d+)\u0001/g, (_, indexRaw) => {
      const index = Number(indexRaw);
      return Number.isInteger(index) && tokens[index] ? tokens[index] : "";
    });
  }

  function markdownToHtml(value) {
    const normalized = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!normalized) return "";
    const blocks = [];
    const listItems = [];
    const flushList = () => {
      if (!listItems.length) return;
      blocks.push("<ul>" + listItems.map((item) => "<li>" + item + "</li>").join("") + "</ul>");
      listItems.length = 0;
    };
    normalized.split("\n").forEach((lineRaw) => {
      const line = String(lineRaw || "").trim();
      if (!line) {
        flushList();
        return;
      }
      const listMatch = line.match(/^[-*]\s+(.+)$/);
      if (listMatch) {
        listItems.push(markdownInlineToHtml(escapeHtml(listMatch[1])));
        return;
      }
      flushList();
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(3, headingMatch[1].length);
        blocks.push("<h" + String(level) + ">" + markdownInlineToHtml(escapeHtml(headingMatch[2])) + "</h" + String(level) + ">");
        return;
      }
      blocks.push("<p>" + markdownInlineToHtml(escapeHtml(line)) + "</p>");
    });
    flushList();
    return blocks.join("");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function extractRuPhoneLocalDigits(raw) {
    const text = String(raw || "");
    const trimmed = text.trim();
    const startsWithPlus7 = trimmed.startsWith("+7");
    const startsWith8 = trimmed.startsWith("8");
    let digits = text.replace(/\D+/g, "");
    if (startsWithPlus7 && digits.startsWith("7")) {
      digits = digits.slice(1);
    } else if (startsWith8 && digits.startsWith("8")) {
      digits = digits.slice(1);
    } else if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
      digits = digits.slice(1);
    }
    return digits.slice(0, 10);
  }

  function formatRuPhone(raw) {
    const digits = extractRuPhoneLocalDigits(raw);
    if (!digits) return "+7";
    const part1 = digits.slice(0, 3);
    const part2 = digits.slice(3, 6);
    const part3 = digits.slice(6, 8);
    const part4 = digits.slice(8, 10);
    let out = "+7";
    if (part1) out += " (" + part1;
    if (part1.length === 3) out += ")";
    if (part2) out += " " + part2;
    if (part3) out += "-" + part3;
    if (part4) out += "-" + part4;
    return out;
  }

  function normalizeRuPhone(raw) {
    const digits = extractRuPhoneLocalDigits(raw);
    if (digits.length !== 10) return "";
    return "+7" + digits;
  }

  function isValidRuPhone(phone) {
    return /^\+7\d{10}$/.test(String(phone || ""));
  }

  function bindRuPhoneMask(input) {
    if (!input) return;
    input.addEventListener("focus", () => {
      if (!String(input.value || "").trim()) input.value = "+7";
    });
    input.addEventListener("input", () => {
      input.value = formatRuPhone(input.value);
    });
    input.addEventListener("blur", () => {
      const digits = extractRuPhoneLocalDigits(input.value);
      if (!digits.length) input.value = "";
    });
  }

  function currentAuthMode() {
    return String(authConfig?.public_auth_mode || "sms").trim().toLowerCase();
  }

  function preferredChannel({ phone, email }) {
    const mode = currentAuthMode();
    if (mode === "email") return "EMAIL";
    if (mode === "sms_or_email") return email ? "EMAIL" : "SMS";
    if (mode === "totp") return "";
    return "SMS";
  }

  function otpCodeDeliveryLabel(channel) {
    return String(channel || "").toUpperCase() === "EMAIL" ? "Email" : "SMS";
  }

  function showAuthHints() {
    const mode = currentAuthMode();
    const emailRequired = mode === "email";
    const smsOnly = mode === "sms";
    if (accessPhoneInput) accessPhoneInput.required = smsOnly;
    if (accessEmailInput) accessEmailInput.required = emailRequired;
    if (requestEmailInput) requestEmailInput.required = emailRequired;
  }

  async function loadAuthConfig() {
    try {
      const response = await fetch("/api/public/otp/config");
      const data = await parseJsonSafe(response);
      if (response.ok && data && typeof data === "object") {
        authConfig = data;
      }
    } catch (_) {}
    showAuthHints();
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
    closeTopbarNav();
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
      items.forEach((item, idx) => {
        const card = document.createElement("article");
        card.className = "featured-card";
        card.style.animationDelay = (idx * 0.06) + "s";

        // Avatar wrap (holds photo or initials + optional pinned chip)
        const avatarWrap = document.createElement("div");
        avatarWrap.className = "featured-avatar-wrap";

        const rawAvatarUrl = String(item.avatar_url || "").trim();
        if (rawAvatarUrl) {
          const avatar = document.createElement("img");
          avatar.className = "featured-avatar";
          avatar.src = rawAvatarUrl;
          avatar.alt = String(item.name || "Сотрудник");
          avatar.loading = "lazy";
          avatarWrap.appendChild(avatar);
        } else {
          const initBox = document.createElement("div");
          initBox.className = "featured-avatar-initials";
          const nameParts = String(item.name || "").trim().split(/\s+/);
          const initials = nameParts.length >= 2
            ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
            : (nameParts[0] || "?")[0].toUpperCase();
          initBox.textContent = initials;
          avatarWrap.appendChild(initBox);
        }

        if (item.pinned) {
          const chip = document.createElement("span");
          chip.className = "featured-chip";
          chip.textContent = "Рекомендуем";
          avatarWrap.appendChild(chip);
        }

        card.appendChild(avatarWrap);

        const body = document.createElement("div");
        body.className = "featured-card-body";

        const top = document.createElement("div");
        top.className = "featured-card-top";
        const name = document.createElement("h3");
        name.textContent = String(item.name || "Сотрудник");
        top.appendChild(name);
        body.appendChild(top);

        const metaText = String(item.primary_topic_name || "").trim();
        if (metaText) {
          const meta = document.createElement("p");
          meta.className = "featured-meta";
          meta.textContent = metaText;
          body.appendChild(meta);
        }

        const captionText = String(item.caption || "").trim();
        if (captionText) {
          const caption = document.createElement("div");
          caption.className = "featured-caption";
          caption.innerHTML = markdownToHtml(captionText);
          body.appendChild(caption);
        }

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
    const phone = normalizeRuPhone(accessPhoneInput?.value);
    if (accessPhoneInput && phone) accessPhoneInput.value = formatRuPhone(phone);
    const email = normalizeEmail(accessEmailInput?.value);
    const hpField = String(accessHpInput?.value || "").trim();
    const channel = preferredChannel({ phone, email });
    if (currentAuthMode() === "totp") {
      setStatus(accessStatus, "Режим TOTP пока не реализован в публичном кабинете.", "error");
      return;
    }
    if (channel === "EMAIL" && !email) {
      setStatus(accessStatus, "Введите email.", "error");
      return;
    }
    if (channel === "SMS" && !phone) {
      setStatus(accessStatus, "Введите номер телефона.", "error");
      return;
    }
    if (channel === "SMS" && !isValidRuPhone(phone)) {
      setStatus(accessStatus, "Введите корректный номер телефона РФ в формате +7XXXXXXXXXX.", "error");
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
          client_email: email,
          hp_field: hpField,
          channel,
        }),
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) throw new Error(apiErrorDetail(data, "Не удалось отправить OTP"));
      const effectiveChannel = String(data?.channel || channel || "SMS").toUpperCase();
      lastAccessOtpChannel = effectiveChannel;
      const debugCode = String(data?.delivery_response?.debug_code || data?.sms_response?.debug_code || "").trim();
      if (debugCode) {
        console.info("[OTP DEV] VIEW_REQUEST code (" + otpCodeDeliveryLabel(effectiveChannel) + "):", debugCode);
      }
      setStatus(accessStatus, "Код отправлен. Проверьте " + otpCodeDeliveryLabel(effectiveChannel) + ".", "ok");
    } catch (error) {
      setStatus(accessStatus, error?.message || "Не удалось отправить OTP", "error");
    }
  });

  accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = normalizeRuPhone(accessPhoneInput?.value);
    if (accessPhoneInput && phone) accessPhoneInput.value = formatRuPhone(phone);
    const email = normalizeEmail(accessEmailInput?.value);
    const code = String(accessCodeInput.value || "").trim();
    const channel = preferredChannel({ phone, email });
    if (channel === "EMAIL" && (!email || !code)) {
      setStatus(accessStatus, "Введите email и OTP-код.", "error");
      return;
    }
    if (channel === "SMS" && (!phone || !code)) {
      setStatus(accessStatus, "Введите телефон и OTP-код.", "error");
      return;
    }
    if (channel === "SMS" && !isValidRuPhone(phone)) {
      setStatus(accessStatus, "Введите корректный номер телефона РФ в формате +7XXXXXXXXXX.", "error");
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
          client_email: email,
          channel: lastAccessOtpChannel || channel,
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
      client_phone: normalizeRuPhone(requestPhoneInput?.value),
      client_email: normalizeEmail(requestEmailInput?.value),
      pdn_consent: Boolean(document.getElementById("pdn-consent")?.checked),
      hp_field: String(requestHpInput?.value || "").trim(),
      topic_code: String(document.getElementById("topic").value || "").trim(),
      description: String(document.getElementById("description").value || "").trim(),
      extra_fields: {},
    };

    const createChannel = preferredChannel({ phone: payload.client_phone, email: payload.client_email });
    if (createChannel === "EMAIL" && !payload.client_email) {
      setStatus(requestStatus, "Введите email для получения OTP.", "error");
      return;
    }
    if (createChannel === "SMS" && !payload.client_phone) {
      setStatus(requestStatus, "Введите телефон для получения OTP.", "error");
      return;
    }
    if (!isValidRuPhone(payload.client_phone)) {
      setStatus(requestStatus, "Введите корректный номер телефона РФ в формате +7XXXXXXXXXX.", "error");
      return;
    }
    if (requestPhoneInput && payload.client_phone) requestPhoneInput.value = formatRuPhone(payload.client_phone);
    if (!payload.client_name || !payload.topic_code) {
      setStatus(requestStatus, "Заполните имя и тему обращения.", "error");
      return;
    }
    if (!payload.pdn_consent) {
      setStatus(requestStatus, "Необходимо согласие на обработку персональных данных.", "error");
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
          client_email: payload.client_email,
          hp_field: payload.hp_field,
          channel: createChannel,
        }),
      });
      const otpSendData = await parseJsonSafe(otpSend);
      if (!otpSend.ok) throw new Error(apiErrorDetail(otpSendData, "Не удалось отправить OTP"));
      const effectiveChannel = String(otpSendData?.channel || createChannel || "SMS").toUpperCase();
      lastCreateOtpChannel = effectiveChannel;
      const debugCode = String(otpSendData?.delivery_response?.debug_code || otpSendData?.sms_response?.debug_code || "").trim();
      if (debugCode) {
        console.info("[OTP DEV] CREATE_REQUEST code (" + otpCodeDeliveryLabel(effectiveChannel) + "):", debugCode);
      }

      const deliveryResponse = otpSendData?.delivery_response || otpSendData?.sms_response || {};
      const provider = String(deliveryResponse?.provider || "").toLowerCase();
      const isMocked = Boolean(deliveryResponse?.mocked) || provider === "mock_sms" || provider === "mock_email";
      const code = await requestOtpCode(
        isMocked
          ? "Введите OTP-код (dev-режим: смотрите backend console)."
          : "Введите OTP-код из " + otpCodeDeliveryLabel(effectiveChannel) + "."
      );
      if (!code) throw new Error("Код OTP не введен");

      setStatus(requestStatus, "Проверяем OTP...", null);
      const otpVerify = await fetch("/api/public/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "CREATE_REQUEST",
          client_phone: payload.client_phone,
          client_email: payload.client_email,
          channel: lastCreateOtpChannel || createChannel,
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

  loadAuthConfig();
  bindRuPhoneMask(requestPhoneInput);
  bindRuPhoneMask(accessPhoneInput);
  loadTopics();
  loadQuotes();
  loadFeaturedStaff();
  initTopbarNav();
})();
