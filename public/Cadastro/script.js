/**
 * BitSocial - Script de Cadastro (Versão Estabilizada Sincronizada com Backup)
 */
const APP_BASE_URL = (() => {
  const { protocol, hostname, port, origin } = window.location;
  const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost";

  if (protocol === "file:") return "http://127.0.0.1:8000";
  if (isLocalhost && port !== "8000") return "http://127.0.0.1:8000";
  return origin;
})();

async function lerResposta(response) {
  const texto = await response.text();
  try { return texto ? JSON.parse(texto) : {}; } catch { return { detail: texto || "Erro inesperado." }; }
}

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

// Elementos Principais mapeados conforme o HTML atual
const cadastroForm = document.getElementById("cadastro-form");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const nomeInput = document.getElementById("nome");
const sobrenomeInput = document.getElementById("sobrenome");
const telefoneInput = document.getElementById("telefone");
const dataNascimentoInput = document.getElementById("dtNasc");
const senhaInput = document.getElementById("senha");
const senhaConfirmarInput = document.getElementById("senha-confirmar");
const regrasValidacao = document.getElementById("regras-validacao");
const btnSubmit = document.getElementById("btn-submit");

// --- ANTIDOTO CONTRA AUTOFILL: Força os campos a iniciarem limpos ---
const limparMocksNavegador = () => {
  if (usernameInput && usernameInput.value.includes('@')) usernameInput.value = "";
  if (emailInput) emailInput.value = "";
  if (senhaInput) senhaInput.value = "";
  if (senhaConfirmarInput) senhaConfirmarInput.value = "";
};
limparMocksNavegador();
setTimeout(limparMocksNavegador, 50);
setTimeout(limparMocksNavegador, 300);

// --- Máscara Telefone ---
if (telefoneInput) {
    telefoneInput.addEventListener("input", function (e) {
      let valor = e.target.value.replace(/\D/g, "");
      if (valor.length > 11) valor = valor.substring(0, 11);
      valor = valor.replace(/^(\d{2})(\d)/g, "($1) $2");
      valor = valor.replace(/(\d{5})(\d)/, "$1-$2");
      e.target.value = valor;
    });
}

// --- Lógica de Limites de Idade ---
const hoje = new Date();
const dataMinima16 = new Date(); dataMinima16.setFullYear(hoje.getFullYear() - 16);
const dataMaxima140 = new Date(); dataMaxima140.setFullYear(hoje.getFullYear() - 140);

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

// --- Máscara Usuário ---
if (usernameInput) {
    usernameInput.addEventListener("input", function () {
      let valor = this.value;
      if (valor.length > 0 && !valor.startsWith("@")) this.value = "@" + valor;
      if (valor.startsWith("@@")) this.value = "@" + valor.replace(/^@+/, "");
    });
    usernameInput.addEventListener("focus", function () {
      if (this.value === "") this.value = "@";
    });
}

// --- CONTROLE DOS OLHINHOS (PROPRIEDADE .TYPE EM TEMPO REAL) ---
const vincularOlhinho = (btnId, inputId) => {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (btn && input) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (input.type === "password") {
        input.type = "text";
        btn.textContent = "🙈";
      } else {
        input.type = "password";
        btn.textContent = "👁";
      }
    });
  }
};
vincularOlhinho("toggle-senha-cadastro", "senha");
vincularOlhinho("toggle-senha-confirmar", "senha-confirmar");

// --- Efeito Background ---
const bg = document.querySelector(".bg-geo");
if (bg) {
    window.addEventListener("mousemove", (e) => {
      const moveX = (e.clientX / window.innerWidth - 0.5) * -40;
      const moveY = (e.clientY / window.innerHeight - 0.5) * -40;
      bg.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });
}

// --- Validação Visual da Senha (RESTAURAÇÃO DA CLASSE .SHOW DO CSS) ---
const rules = {
  len: document.getElementById("rule-len"),
  upper: document.getElementById("rule-upper"),
  lower: document.getElementById("rule-lower"),
  num: document.getElementById("rule-num"),
  symbol: document.getElementById("rule-symbol"),
};

function toggleRule(el, isValid) {
  if (el) el.style.color = isValid ? "#2ecc71" : "#e74c3c";
}

if (senhaInput && regrasValidacao) {
    senhaInput.addEventListener("focus", () => regrasValidacao.classList.add("show"));
    senhaInput.addEventListener("blur", () => regrasValidacao.classList.remove("show"));

    senhaInput.addEventListener("input", () => {
      const val = App_ObterSenhaViva();
      toggleRule(rules.len, val.length >= 8);
      toggleRule(rules.upper, /[A-Z]/.test(val));
      toggleRule(rules.lower, /[a-z]/.test(val));
      toggleRule(rules.num, /\d/.test(val));
      toggleRule(rules.symbol, /[@$!%*?&]/.test(val));
    });
}

function App_ObterSenhaViva() { return senhaInput ? senhaInput.value : ""; }

function getCampoLabel(campo) {
  if (!campo || !campo.id) return "campo";
  const label = document.querySelector(`label[for="${campo.id}"]`);
  return label ? label.textContent.trim().toLowerCase() : "campo";
}

function getMensagemCampoInvalido(campo) {
  if (!campo || !campo.validity) return "Verifique os campos obrigatórios.";
  const nomeCampo = getCampoLabel(campo);
  if (campo.validity.valueMissing) return `Preencha o campo ${nomeCampo}.`;
  if (campo.validity.typeMismatch) return `Informe um ${nomeCampo} válido.`;
  if (campo.validity.patternMismatch) return campo.title || `Formato inválido para ${nomeCampo}.`;
  if (campo.validity.tooShort) return `${nomeCampo.charAt(0).toUpperCase() + nomeCampo.slice(1)} muito curto.`;
  return campo.title || "Verifique os dados informados.";
}

document.addEventListener("DOMContentLoaded", () => {
  window.SocialBitSession?.renderCurrentSession();
});

// --- Submissão do formulário ---
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
        showToast(getMensagemCampoInvalido(primeiroCampoInvalido), "error");
        return;
      }

      const dtNascVal = dataNascimentoInput ? dataNascimentoInput.value : "";
      if (!dtNascVal) {
          showToast("A data de nascimento é obrigatória.", "error");
          return;
      }

      const dataDigitada = new Date(dtNascVal);
      if (dataDigitada > dataMinima16) {
          showToast("Você precisa ter pelo menos 16 anos.", "error");
          return;
      }
      if (dataDigitada < dataMaxima140) {
          showToast("Ano de nascimento inválido. Verifique a digitação.", "error");
          return;
      }

      const telValue = telefoneInput ? telefoneInput.value.trim() : "";
      const regexTel = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
      if (!regexTel.test(telValue)) {
        showToast("Telefone inválido", "error");
        return;
      }

      const s1 = senhaInput ? senhaInput.value : "";
      const s2 = senhaConfirmarInput ? senhaConfirmarInput.value : "";

      const isLenValid = s1.length >= 8;
      const isUpperValid = /[A-Z]/.test(s1);
      const isLowerValid = /[a-z]/.test(s1);
      const isNumValid = /\d/.test(s1);
      const isSymbolValid = /[@$!%*?&]/.test(s1);

      if (!isLenValid || !isUpperValid || !isLowerValid || !isNumValid || !isSymbolValid) {
        showToast("A senha não cumpre todos os requisitos de segurança.", "error");
        if (senhaInput) senhaInput.focus();
        if (regrasValidacao) regrasValidacao.classList.add("show");
        return;
      }

      if (s1 !== s2) {
        showToast("As senhas não coincidem!", "error");
        if (senhaConfirmarInput) senhaConfirmarInput.focus();
        return;
      }

      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = "A cadastrar...";
      }

      const dados = {
        username: usernameInput.value.trim(),
        dtNasc: dtNascVal,
        email: emailInput.value.trim(),
        senha: s1,
        nome: nomeInput.value.trim(),
        sobrenome: sobrenomeInput.value.trim(),
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
          showToast("Usuário cadastrado com sucesso!", "success");
          setTimeout(() => {
            window.location.href = `${APP_BASE_URL}/login`;
          }, 900);
        } else {
          showToast("Erro no cadastro: " + (data.detail || "Verifique os campos."), "error");
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Criar Conta";
          }
        }
      } catch (error) {
        showToast("Erro de conexão com o servidor.", "error");
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = "Criar Conta";
        }
      }
    });
}