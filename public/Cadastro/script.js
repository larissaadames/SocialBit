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

// --- Mascara Telefone ---
const telefoneInput = document.getElementById("telefone");
if (telefoneInput) {
    telefoneInput.addEventListener("input", function (e) {
      let valor = e.target.value.replace(/\D/g, "");
      if (valor.length > 11) valor = valor.substring(0, 11);
      valor = valor.replace(/^(\d{2})(\d)/g, "($1) $2");
      valor = valor.replace(/(\d{5})(\d)/, "$1-$2");
      e.target.value = valor;
    });
}

// --- Lógica de Limites de Idade (16 a 140 anos) ---
const dataNascimentoInput = document.getElementById("dt-nasc");
const hoje = new Date();

const dataMinima16 = new Date();
dataMinima16.setFullYear(hoje.getFullYear() - 16);

const dataMaxima140 = new Date();
dataMaxima140.setFullYear(hoje.getFullYear() - 140);

const formatarData = (data) => {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
};

if (dataNascimentoInput) {
    dataNascimentoInput.max = formatarData(dataMinima16);
    dataNascimentoInput.min = formatarData(dataMaxima140); 
}

// --- Mascara Usuario ---
const usuarioInput = document.getElementById("usuario");
if (usuarioInput) {
    usuarioInput.addEventListener("input", function () {
      let valor = this.value;
      if (valor.length > 0 && !valor.startsWith("@")) this.value = "@" + valor;
      if (valor.startsWith("@@")) this.value = "@" + valor.replace(/^@+/, "");
    });

    usuarioInput.addEventListener("focus", function () {
      if (this.value === "") this.value = "@";
    });
}

// --- Toggle Password ---
function togglePassword(id, btn) {
  const input = document.getElementById(id);
  if (!input) return;
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
}

// --- Efeito Background ---
const bg = document.querySelector(".bg-geo");
if (bg) {
    window.addEventListener("mousemove", (e) => {
      const moveX = (e.clientX / window.innerWidth - 0.5) * -40;
      const moveY = (e.clientY / window.innerHeight - 0.5) * -40;
      bg.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });
}

// --- Validacao Visual da Senha ---
const senhaInput = document.getElementById("senha");
const regrasValidacao = document.getElementById("regras-validacao");
const rules = {
  len: document.getElementById("rule-len"),
  upper: document.getElementById("rule-upper"),
  lower: document.getElementById("rule-lower"),
  num: document.getElementById("rule-num"),
  symbol: document.getElementById("rule-symbol"),
};

if (senhaInput && regrasValidacao) {
    senhaInput.addEventListener("focus", () => regrasValidacao.classList.add("show"));
    senhaInput.addEventListener("blur", () => regrasValidacao.classList.remove("show"));

    senhaInput.addEventListener("input", () => {
      const val = senhaInput.value;
      toggleRule(rules.len, val.length >= 8);
      toggleRule(rules.upper, /[A-Z]/.test(val));
      toggleRule(rules.lower, /[a-z]/.test(val));
      toggleRule(rules.num, /\d/.test(val));
      toggleRule(rules.symbol, /[@$!%*?&]/.test(val));
    });
}

function toggleRule(el, isValid) {
  if (el) el.style.color = isValid ? "#2ecc71" : "#e74c3c";
}

function getCampoLabel(campo) {
  if (!campo || !campo.id) return "campo";
  const label = document.querySelector(`label[for="${campo.id}"]`);
  return label ? label.textContent.trim().toLowerCase() : "campo";
}

function getMensagemCampoInvalido(campo) {
  if (!campo || !campo.validity) {
    return "Verifique os campos obrigatórios.";
  }

  const nomeCampo = getCampoLabel(campo);

  if (campo.validity.valueMissing) {
    return `Preencha o campo ${nomeCampo}.`;
  }
  if (campo.validity.typeMismatch) {
    return `Informe um ${nomeCampo} válido.`;
  }
  if (campo.validity.patternMismatch) {
    return campo.title || `Formato inválido para ${nomeCampo}.`;
  }
  if (campo.validity.tooShort) {
    return `${nomeCampo.charAt(0).toUpperCase() + nomeCampo.slice(1)} muito curto.`;
  }

  return campo.title || "Verifique os dados informados.";
}

// --- Submissao do formulario ---
const cadastroForm = document.getElementById("form-cadastro") || document.querySelector("form");

document.addEventListener("DOMContentLoaded", () => {
  window.SocialBitSession?.renderCurrentSession();
});

if (cadastroForm) {
    cadastroForm.addEventListener("submit", async function (e) {
      e.preventDefault();

      const primeiroCampoInvalido = Array.from(cadastroForm.elements).find((campo) => {
        return typeof campo.checkValidity === "function" && !campo.checkValidity();
      });

      if (primeiroCampoInvalido) {
        primeiroCampoInvalido.focus();
        primeiroCampoInvalido.classList.add("input-invalid");
        setTimeout(() => primeiroCampoInvalido.classList.remove("input-invalid"), 1200);
        showNotification(getMensagemCampoInvalido(primeiroCampoInvalido), "error");
        return;
      }

      // 1. VALIDAÇÃO DE IDADE (À Prova de Digitação)
      const dtNascVal = document.getElementById("dt-nasc").value;
      if (!dtNascVal) {
          showNotification("A data de nascimento é obrigatória.", "error");
          return;
      }

      const dataDigitada = new Date(dtNascVal);
      if (dataDigitada > dataMinima16) {
          showNotification("Você precisa ter pelo menos 16 anos.", "error");
          return;
      }
      if (dataDigitada < dataMaxima140) {
          showNotification("Ano de nascimento inválido. Verifique a digitação.", "error");
          return;
      }

      // 2. VALIDAÇÃO DE TELEFONE
      const telValue = telefoneInput ? telefoneInput.value.trim() : "";
      const regexTel = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
      if (!regexTel.test(telValue)) {
        showNotification("Telefone inválido", "error");
        return;
      }

      // 3. VALIDAÇÃO RIGOROSA DA SENHA (NOVA TRAVA)
      const s1 = document.getElementById("senha").value;
      const s2 = document.getElementById("senha-confirmar").value;

      // Verifica as regras de complexidade
      const isLenValid = s1.length >= 8;
      const isUpperValid = /[A-Z]/.test(s1);
      const isLowerValid = /[a-z]/.test(s1);
      const isNumValid = /\d/.test(s1);
      const isSymbolValid = /[@$!%*?&]/.test(s1);

      if (!isLenValid || !isUpperValid || !isLowerValid || !isNumValid || !isSymbolValid) {
        showNotification("A senha não cumpre todos os requisitos de segurança.", "error");
        document.getElementById("senha").focus();
        // Volta a mostrar a caixinha das regras para o usuário ver o que faltou
        if (regrasValidacao) regrasValidacao.classList.add("show");
        return; // BARRA O FORMULÁRIO AQUI
      }

      if (s1 !== s2) {
        showNotification("As senhas não coincidem!", "error");
        document.getElementById("senha-confirmar").focus();
        return;
      }

      const dados = {
        username: document.getElementById("usuario").value.trim(),
        dtNasc: dtNascVal,
        email: document.getElementById("email").value.trim(),
        senha: s1,
        nome: document.getElementById("nome").value.trim(),
        sobrenome: document.getElementById("sobrenome").value.trim(),
        telefone: telValue,
      };

      try {
        const response = await fetch(`${APP_BASE_URL}/usuarios`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dados),
        });

        const data = await lerResposta(response);

        if (response.ok) {
          showNotification("Usuário cadastrado com sucesso!", "success");
          setTimeout(() => {
            window.location.href = `${APP_BASE_URL}/login`;
          }, 900);
        } else {
          console.error("Erro de validacao:", data.detail);
          showNotification("Erro no cadastro: " + (data.detail || "Verifique os campos."), "error");
        }
      } catch (error) {
        console.error("Erro ao conectar com a API:", error);
        showNotification("Erro de conexão com o servidor.", "error");
      }
    });
}