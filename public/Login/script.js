/**
 * BitSocial - Script de Login (Versão Blindada)
 * Intercepta o formulário por tags nativas para evitar incompatibilidade de IDs.
 */
const APP_BASE_URL = (() => {
    const { protocol, hostname, port, origin } = window.location;
    const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost";

    if (protocol === "file:") return "http://127.0.0.1:8000";
    if (isLocalhost && port !== "8000") return "http://127.0.0.1:8000";
    return origin;
})();

document.addEventListener("DOMContentLoaded", () => {
    // Busca o formulário por ID ou pega a tag <form> da página para garantir a captura
    const loginForm = document.getElementById("login-form") || document.querySelector("form");
    
    // Busca os inputs por tipo ou nome (atende 'senha', 'password', 'email')
    const emailInput = document.querySelector('input[type="email"]') || document.getElementById("email");
    const senhaInput = document.querySelector('input[type="password"]') || document.getElementById("senha") || document.getElementById("password");
    const btnSubmit = document.querySelector('button[type="submit"]') || document.getElementById("btn-submit");

    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            // INTERCEPTAÇÃO IMEDIATA: Impede o recarregamento (F5) na primeira linha!
            event.preventDefault();

            const email = (emailInput?.value || "").trim();
            const senha = (senhaInput?.value || "").trim();

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
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ email, senha }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || "E-mail ou senha incorretos.");
                }

                const data = await response.json();

                // Salva o contexto básico de exibição exigido pelo front-end
                localStorage.setItem("userId", String(data.id));
                localStorage.setItem("username", String(data.username));
                localStorage.setItem("perfil", String(data.perfil || "usuario"));

                // Redireciona de forma limpa para o feed
                window.location.href = "/home";

            } catch (error) {
                console.error("Erro ao fazer login:", error);
                alert(error.message || "Erro inesperado ao realizar o login.");
                
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = "Entrar";
                }
            }
        });
    } else {
        console.error("Erro: Nenhum elemento de formulario encontrado na pagina de login.");
    }
});