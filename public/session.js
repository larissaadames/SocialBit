/**
 * BitSocial - Gestor Central de Sessão (Cookies Native)
 * Valida o estado de autenticação comunicando diretamente com o servidor.
 */
const SocialBitSession = (() => {
  const APP_BASE_URL = (() => {
    const { protocol, hostname, port, origin } = window.location;
    const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost";

    if (protocol === "file:") {
      return "http://127.0.0.1:8000";
    }

    if (isLocalhost && port !== "8000") {
      return "http://127.0.0.1:8000";
    }

    return origin;
  })();

  const BADGE_ID = "session-context";
  const LOGIN_URL = `${APP_BASE_URL}/login`;

  function clearSession() {
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    localStorage.removeItem("perfil");
    localStorage.removeItem("foto_url");
  }

  function normalizePerfil(perfil) {
    const value = String(perfil || "").trim().toLowerCase();
    if (value === "admin" || value === "administrador") {
      return "admin";
    }
    return "usuario";
  }

  function shouldShowBadge() {
    const path = String(window.location.pathname || "").toLowerCase();
    if (path === "/login" || path === "/cadastro") {
      return false;
    }
    return true;
  }

  function ensureBadge() {
    let badge = document.getElementById(BADGE_ID);

    if (!badge) {
      badge = document.createElement("div");
      badge.id = BADGE_ID;
      badge.style.cssText = [
        "position:fixed",
        "top:18px",
        "right:8px",
        "z-index:2600",
        "display:none",
        "align-items:center",
        "gap:10px",
        "padding:6px 10px",
        "border-radius:999px",
        "background:rgba(18,18,18,0.92)",
        "border:1px solid rgba(123,47,247,0.45)",
        "box-shadow:0 10px 24px rgba(0,0,0,0.35)",
        "backdrop-filter:blur(10px)",
        "color:#fff",
        "max-width:calc(100vw - 56px)",
        "font-family:Orbitron, sans-serif",
      ].join(";");
    }

    const menuWrapper = document.querySelector(".user-menu-wrapper");
    if (menuWrapper) {
      menuWrapper.style.display = "flex";
      menuWrapper.style.alignItems = "center";
      menuWrapper.style.gap = "10px";

      badge.style.position = "static";
      badge.style.margin = "0";
      badge.style.display = "none";

      if (!menuWrapper.contains(badge)) {
        menuWrapper.appendChild(badge);
      }
    } else if (!badge.parentElement) {
      document.body.appendChild(badge);
    }

    return badge;
  }

  function renderBadge(session) {
    if (!shouldShowBadge()) {
      hideBadge();
      return;
    }
    const badge = ensureBadge();
    const username = String(session?.username || localStorage.getItem("username") || "usuario").trim() || "usuario";
    badge.innerHTML = `<strong style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">@${username.replace(/^@+/, "")}</strong>`;

    badge.style.display = "flex";
  }

  function hideBadge() {
    const badge = document.getElementById(BADGE_ID);
    if (badge) {
      badge.style.display = "none";
    }
  }

  async function renderCurrentSession(options = {}) {
    const { requireAuth = false } = options;

    if (!shouldShowBadge()) {
      hideBadge();
    }

    try {
      // Disparamos o fetch diretamente sem cabeçalhos manuais.
      // O navegador anexa o Cookie HTTP automaticamente a cada chamada de rota.
      const response = await fetch(`${APP_BASE_URL}/auth/me`);

      if (response.status === 401) {
        clearSession();
        hideBadge();

        if (requireAuth) {
          window.location.href = LOGIN_URL;
        }

        return null;
      }

      if (!response.ok) {
        hideBadge();
        return null;
      }

      const session = await response.json();
      if (session?.id) {
        localStorage.setItem("userId", String(session.id));
      }
      if (session?.username) {
        localStorage.setItem("username", session.username);
      }
      if (session?.perfil) {
        localStorage.setItem("perfil", session.perfil);
      }

      renderBadge(session);
      return session;
    } catch (error) {
      console.error("Erro ao carregar sessao:", error);
      hideBadge();
      if (requireAuth) {
        window.location.href = LOGIN_URL;
      }
      return null;
    }
  }

  return {
    renderCurrentSession,
    clearSession,
  };
})();

window.SocialBitSession = SocialBitSession;