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
                alert("Por favor, preencha todos os campos.");
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

                window.location.href = "/home";

            } catch (error) {
                console.error(error);
                alert(error.message || "Erro inesperado ao realizar o login.");
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = "Log in";
                }
            }
        });
    }
});