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

async function lerResposta(response) {
  const texto = await response.text();

  try {
    return texto ? JSON.parse(texto) : {};
  } catch {
    return { detail: texto || "Erro inesperado no servidor." };
  }
}

const notificationContainer = document.getElementById("notification-container");

function showNotification(message, type = "error") {
  if (!notificationContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  notificationContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

function togglePassword() {
  const input = document.getElementById("password");
  const eyeBtn = event.currentTarget; 

  if (input.type === "password") {
    input.type = "text";
    eyeBtn.textContent = "👁";
  } else {
    input.type = "password";
    eyeBtn.textContent = "👁";
  }
  
  input.focus();
}

// Animação do fundo geométrico
const bg = document.querySelector(".bg-geo");
if (bg) {
    window.addEventListener("mousemove", (e) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      const moveX = (x - 0.5) * -40;
      const moveY = (y - 0.5) * -40;
      bg.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });
}

const loginForm = document.querySelector("form");

document.addEventListener("DOMContentLoaded", () => {
  window.SocialBitSession?.renderCurrentSession();
});

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");

    // Captura os valores no exato momento do envio
    const email = emailInput ? emailInput.value.trim() : "";
    const senha = passwordInput ? passwordInput.value : "";

    // Validação de segurança antes de chamar a API
    if (!email || !senha) {
      showNotification("Por favor, preencha todos os campos.", "error");
      return;
    }

    try {
      const response = await fetch(`${APP_BASE_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email, senha: senha }),
      });

      const data = await lerResposta(response);

      if (response.ok) {
        showNotification("Login realizado com sucesso!", "success");

        // Persistência dos dados da sessão
        const accessToken = data.access_token || data.token;
        if (accessToken) localStorage.setItem("token", accessToken);
        
        localStorage.setItem("userId", data.id);
        localStorage.setItem("username", data.username);
        if (data.perfil) localStorage.setItem("perfil", data.perfil);
        if (data.foto_url) localStorage.setItem("foto_url", data.foto_url);
        
        // Redirecionamento para o perfil após um pequeno delay para mostrar o brinde
        setTimeout(() => {
          window.location.href = `${APP_BASE_URL}/perfil`;
        }, 1000);
        
      } else {
        showNotification(
          data.detail || "E-mail ou senha incorretos.",
          "error"
        );
      }
    } catch (error) {
      console.error("Erro ao conectar com a API:", error);
      showNotification("Erro no servidor. Verifique se o backend está ativo.", "error");
    }
  });
}

// const token = localStorage.getItem("token");

// if (!token) {
//   window.location.href = `${APP_BASE_URL}/public/Login/login.html`;
// }
