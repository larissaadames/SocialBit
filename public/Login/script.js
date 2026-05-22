/**
 * BitSocial - Script de Login (Versão Final Estabilizada)
 */
const APP_BASE_URL = (() => {
    const { protocol, hostname, port, origin } = window.location;
    const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost";
    if (protocol === "file:") return "http://127.0.0.1:8000";
    if (isLocalhost && port !== "8000") return "http://127.0.0.1:8000";
    return origin;
})();

/* --- ENGINE CENTRAL DE NOTIFICAÇÕES TOAST (PADRONIZADA) --- */
function showToast(message, type = "success") {
  let container = document.getElementById("notification-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "notification-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✅ ' : type === 'error' ? '❌ ' : 'ℹ️ ';
  toast.textContent = icon + message;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 50);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form") || document.querySelector("form");
    const emailInput = document.querySelector('input[type="email"]') || document.getElementById("email");
    const senhaInput = document.querySelector('input[type="password"]') || document.getElementById("senha") || document.getElementById("password");
    const btnSubmit = document.querySelector('button[type="submit"]') || document.getElementById("btn-submit");
    const btnToggleSenha = document.getElementById("toggle-senha");

    if (emailInput) emailInput.value = "";
    if (senhaInput) senhaInput.value = "";

    // --- CORREÇÃO DO OLHINHO NO LOGIN ---
    if (btnToggleSenha && senhaInput) {
        btnToggleSenha.addEventListener("click", (e) => {
            e.preventDefault();
            if (senhaInput.type === "password") {
                senhaInput.type = "text";
                btnToggleSenha.textContent = "👁";
            } else {
                senhaInput.type = "password";
                btnToggleSenha.textContent = "👁";
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const email = (emailInput?.value || "").trim();
            const senha = senhaInput?.value || "";

            if (!email || !senha) {
                showToast("Por favor, preencha todos os campos.", "error");
                return;
            }

            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.textContent = "A entrar...";
            }

            try {
                const response = await fetch(`${APP_BASE_URL}/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, senha }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || "E-mail ou senha incorretos.");
                }

                const data = await response.json();

                localStorage.setItem("userId", String(data.id));
                localStorage.setItem("username", String(data.username));
                localStorage.setItem("perfil", String(data.perfil || "usuario"));

                showToast("Sessão iniciada com sucesso! A redirecionar...", "success");
                
                setTimeout(() => {
                    window.location.href = "/home";
                }, 900);

            } catch (error) {
                console.error(error);
                showToast(error.message || "Erro inesperado ao realizar o login.", "error");
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = "Log in";
                }
            }
        });
    }
});