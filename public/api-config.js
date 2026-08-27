/**
 * URL da API (backend FastAPI). Obrigatório em produção no Cloudflare Pages.
 * Exemplo: window.SOCIALBIT_API_URL = "https://api.seudominio.com";
 */
window.SOCIALBIT_API_URL = window.SOCIALBIT_API_URL || "";

(function () {
  function resolveAppBaseUrl() {
    const configured = String(window.SOCIALBIT_API_URL || "").trim().replace(/\/$/, "");
    if (configured) return configured;

    const { protocol, hostname, port, origin } = window.location;
    const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost";

    if (protocol === "file:") return "http://127.0.0.1:8000";
    if (isLocalhost && port !== "8000") return "http://127.0.0.1:8000";
    return origin;
  }

  window.getAppBaseUrl = resolveAppBaseUrl;
})();
