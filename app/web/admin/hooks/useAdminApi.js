import { ADMIN_AUTH_REDIRECT_REASON_KEY, LS_TOKEN } from "../shared/constants.js";
import { translateApiError } from "../shared/utils.js";

export function useAdminApi(token) {
  const { useCallback } = React;

  return useCallback(
    async (path, options, tokenOverride) => {
      const opts = options || {};
      const authToken = tokenOverride !== undefined ? tokenOverride : token;
      const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };

      if (opts.auth !== false) {
        if (!authToken) throw new Error("Отсутствует токен авторизации");
        headers.Authorization = "Bearer " + authToken;
      }

      const response = await fetch(path, {
        method: opts.method || "GET",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });

      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch (_) {
        payload = { raw: text };
      }

      if (!response.ok) {
        const message = (payload && (payload.detail || payload.error || payload.raw)) || "HTTP " + response.status;
        if (response.status === 401 && opts.auth !== false) {
          try {
            localStorage.removeItem(LS_TOKEN);
            sessionStorage.setItem(ADMIN_AUTH_REDIRECT_REASON_KEY, "expired");
          } catch (_) {
            // noop
          }
          if (typeof window !== "undefined") {
            const target = "/admin.html";
            if (window.location.pathname !== target || window.location.search) {
              window.location.replace(target);
            } else {
              window.location.reload();
            }
          }
        }
        const error = new Error(translateApiError(String(message)));
        error.httpStatus = Number(response.status || 0);
        throw error;
      }

      return payload;
    },
    [token]
  );
}

export default useAdminApi;
