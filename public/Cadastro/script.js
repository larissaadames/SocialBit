/**
 * BitSocial - Script de Cadastro
 * Gerencia a criação de novas contas e limpa resquícios de sessões antigas.
 */
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

document.addEventListener("DOMContentLoaded", () => {
    // Ao entrar na página de cadastro, limpamos dados antigos por segurança
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    localStorage.removeItem("perfil");

    const cadastroForm = document.getElementById("cadastro-form");
    const usernameInput = document.getElementById("username");
    const nomeInput = document.getElementById("nome");
    const sobrenomeInput = document.getElementById("sobrenome");
    const emailInput = document.getElementById("email");
    const senhaInput = document.getElementById("senha");
    const telefoneInput = document.getElementById("telefone");
    const dtNascInput = document.getElementById("dtNasc");
    const btnSubmit = document.getElementById("btn-submit");

    if (cadastroForm) {
        cadastroForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            // Captura e limpa os valores dos inputs
            const username = (usernameInput?.value || "").trim();
            const nome = (nomeInput?.value || "").trim();
            const sobrenome = (sobrenomeInput?.value || "").trim();
            const email = (emailInput?.value || "").trim();
            const senha = (senhaInput?.value || "").trim();
            const telefone = (telefoneInput?.value || "").trim();
            const dtNasc = (dtNascInput?.value || "").trim();

            // Validação básica no front-end
            if (!username || !nome || !sobrenome || !email || !senha || !telefone || !dtNasc) {
                alert("Por favor, preencha todos os campos obrigatórios.");
                return;
            }

            // Desativa o botão para evitar cliques múltiplos durante o envio
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.textContent = "A cadastrar...";
            }

            try {
                const response = await fetch(`${APP_BASE_URL}/usuarios`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        username,
                        dtNasc,
                        senha,
                        email,
                        nome,
                        sobrenome,
                        telefone
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || "Não foi possível realizar o cadastro. Verifique os dados.");
                }

                alert("Conta criada com sucesso! Redirecionando para o login...");
                
                // Redireciona para a tela de login
                window.location.href = "/login";

            } catch (error) {
                console.error("Erro ao cadastrar utilizador:", error);
                alert(error.message || "Erro inesperado ao realizar o cadastro.");
                
                // Reativa o botão em caso de falha para o utilizador tentar novamente
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = "Cadastrar";
                }
            }
        });
    }
});