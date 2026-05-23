/**
 * BitSocial - Script do Perfil (Versão Final - Controle de Sessão Blindado)
 * Gerencia a visualização, edição e exclusão de contas interceptando sessões expiradas.
 */
const APP_BASE_URL = (() => {
    const { protocol, hostname, port, origin } = window.location;
    const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost";
    if (protocol === "file:") return "http://127.0.0.1:8000";
    if (isLocalhost && port !== "8000") return "http://127.0.0.1:8000";
    return origin;
})();

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const targetUserId = params.get('id'); 
    let loggedUserId = localStorage.getItem('userId');

    let fotoPendente = null;

    // Valida o estado de sessão atual por segurança
    const sessaoAtual = await window.SocialBitSession?.renderCurrentSession({ requireAuth: true });
    if (!sessaoAtual) return;

    loggedUserId = localStorage.getItem('userId');
    const userIdToFetch = targetUserId || loggedUserId;

    // ELEMENTOS DA INTERFACE
    const notificationContainer = document.getElementById('notification-container');
    const displayAvatar = document.getElementById('display-avatar');
    const headerAvatar = document.getElementById('header-avatar');
    const dropdown = document.getElementById('user-dropdown');
    const logoutModal = document.getElementById('logout-modal');
    const inputTelefone = document.getElementById('edit-telefone');
    const inputDataNasc = document.getElementById('edit-dtNasc');
    const btnSalvar = document.getElementById('btn-save-perfil');
    const btnCancelar = document.getElementById('btn-cancel-edit');
    
    const formatUsername = value => `@${String(value || '').trim().replace(/^@+/, '')}`;

    // TRAVAS DE IDADE (16 e 140 anos)
    const hoje = new Date();
    const dataMinima16 = new Date(); dataMinima16.setFullYear(hoje.getFullYear() - 16);
    const dataMaxima140 = new Date(); dataMaxima140.setFullYear(hoje.getFullYear() - 140);

    if (inputDataNasc) {
        inputDataNasc.max = dataMinima16.toISOString().split('T')[0];
        inputDataNasc.min = dataMaxima140.toISOString().split('T')[0];
    }

    // GESTÃO DE NOTIFICAÇÕES TOAST DO PERFIL
    const showNotification = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        if (notificationContainer) {
            notificationContainer.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 500);
            }, 4000);
        }
    };

    // --- FUNÇÃO CENTRAL DE EXPIRAÇÃO DE SESSÃO (FASE 5) ---
    function encerrarSessaoEIrLogin(mensagem = "") {
        localStorage.clear();
        
        // Destrói o cookie do servidor imediatamente no navegador
        document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

        if (mensagem) {
            showNotification(mensagem, "error");
        }

        // Delay para leitura do Toast antes de deslogar de vez
        setTimeout(() => {
            window.location.href = "/login";
        }, 2500);
    }

    // CONTROLE DE LOGOUT E MENUS
    if (headerAvatar && dropdown) {
        headerAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
        });
        document.addEventListener('click', () => { dropdown.style.display = 'none'; });
    }

    const logoutTrigger = document.getElementById('btn-logout-trigger');
    if (logoutTrigger && logoutModal) {
        logoutTrigger.addEventListener('click', () => { logoutModal.style.display = 'flex'; });
        document.getElementById('cancel-logout')?.addEventListener('click', () => { logoutModal.style.display = 'none'; });
        document.getElementById('confirm-logout')?.addEventListener('click', () => {
            encerrarSessaoEIrLogin();
        });
    }

    // MÁSCARA TELEFONE
    if (inputTelefone) {
        inputTelefone.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            if (v.length > 11) v = v.substring(0, 11);
            let r = v.replace(/^(\d{2})(\d)/g, '($1) $2');
            r = r.replace(/(\d{5})(\d)/, '$1-$2');
            e.target.value = r;
        });
    }

    // PROCURA DE USUÁRIOS (PROTEGIDA CONTRA EXPIRAÇÃO)
    const searchInput = document.getElementById("search-bar");
    const resultsBox = document.getElementById("search-results");
    if (searchInput && resultsBox) {
        searchInput.addEventListener("input", async () => {
            const termo = searchInput.value.trim();
            if (termo.length < 2) { resultsBox.style.display = "none"; return; }
            try {
                const res = await fetch(`${APP_BASE_URL}/usuarios/busca?username=${encodeURIComponent(termo)}`, { credentials: "include" });
                
                if (res.status === 401) {
                    encerrarSessaoEIrLogin("Sua sessão expirou. Faça login novamente.");
                    return;
                }

                const usuarios = await res.json();
                resultsBox.innerHTML = usuarios.map(u => `
                    <div class="search-item" onclick="window.location.href='/perfil?id=${u.id}'">
                        <strong>${formatUsername(u.username)}</strong>
                        <span>${u.nome} ${u.sobrenome}</span>
                    </div>
                `).join("");
                resultsBox.style.display = "block";
            } catch (e) { console.error(e); }
        });
    }

    // SALVAR ALTERAÇÕES (INTERCEPTAÇÃO DO ERRO 401)
    const salvarAlteracoes = async () => {
        const nome = document.getElementById('edit-nome').value.trim();
        const sobrenome = document.getElementById('edit-sobrenome').value.trim();
        const telefoneVal = inputTelefone ? inputTelefone.value.trim() : "";
        const dtNascVal = inputDataNasc ? inputDataNasc.value : "";
        
        const regexNome = /^[A-Za-zÀ-ÿ\s]{2,25}$/;
        const regexSobrenome = /^[A-Za-zÀ-ÿ\s]{2,50}$/;

        if (!regexNome.test(nome)) {
            showNotification("O nome deve ter entre 2 e 25 letras.", "error");
            return;
        }
        if (!regexSobrenome.test(sobrenome)) {
            showNotification("O sobrenome deve ter entre 2 e 50 letras.", "error");
            return;
        }

        if (dtNascVal) {
            const dataDigitada = new Date(dtNascVal);
            if (dataDigitada > dataMinima16 || dataDigitada < dataMaxima140) {
                showNotification("Idade ou ano de nascimento inválidos.", "error");
                return;
            }
        }

        const originalText = btnSalvar.textContent;
        btnSalvar.disabled = true;
        btnSalvar.textContent = "Salvando...";

        const dados = {
            id: parseInt(userIdToFetch),
            nome: nome,
            sobrenome: sobrenome,
            bio: document.getElementById('edit-bio').value,
            telefone: telefoneVal,
            dtNasc: dtNascVal,
            foto_url: fotoPendente
        };

        try {
            const res = await fetch(`${APP_BASE_URL}/usuarios/update`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: "include", 
                body: JSON.stringify(dados)
            });

            // CORREÇÃO CRÍTICA: Intercepta a sessão expirada ao tentar salvar
            if (res.status === 401) {
                encerrarSessaoEIrLogin("Sua sessão expirou. Faça login novamente.");
                return;
            }

            if (res.ok) {
                showNotification("Alterações gravadas com sucesso!");
                setTimeout(() => window.location.reload(), 1000);
            } else {
                const erro = await res.json().catch(() => ({ detail: "Erro interno no servidor." }));
                showNotification(erro.detail || "Erro ao salvar.", "error");
                btnSalvar.disabled = false;
                btnSalvar.textContent = originalText;
            }
        } catch (e) { 
            showNotification("Erro de conexão.", "error");
            btnSalvar.disabled = false;
            btnSalvar.textContent = originalText;
        }
    };

    // ALTERAR FOTO (UPLOAD PREVIEW)
    const avatarWrapper = document.getElementById('avatar-wrapper');
    const fileInputEl = document.getElementById('file-input');
    if (avatarWrapper && fileInputEl) {
        avatarWrapper.addEventListener('click', () => {
            if (userIdToFetch == loggedUserId) fileInputEl.click();
        });
        fileInputEl.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = ev.target.result;
                if (displayAvatar) displayAvatar.style.backgroundImage = `url('${base64}')`;
                if (headerAvatar) headerAvatar.style.backgroundImage = `url('${base64}')`;
                fotoPendente = base64; 
            };
            reader.readAsDataURL(file);
        });
    }

    // ALTERNÂNCIA DOS MODOS DE EXIBIÇÃO
    document.getElementById('btn-edit-perfil')?.addEventListener('click', () => {
        document.getElementById('view-mode').style.display = 'none';
        document.getElementById('edit-mode').style.display = 'block';
        if (avatarWrapper) avatarWrapper.classList.add('modo-edicao');
    });

    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => window.location.reload());
    }

    if (btnSalvar) {
        btnSalvar.addEventListener('click', () => salvarAlteracoes());
    }

    // REMOVER CONTA (INTERCEPTAÇÃO DO ERRO 401)
    const deleteModal = document.getElementById('delete-modal');
    document.getElementById('delete-account-btn')?.addEventListener('click', () => {
        if (deleteModal) deleteModal.style.display = 'flex';
    });
    document.getElementById('cancel-delete')?.addEventListener('click', () => {
        if (deleteModal) deleteModal.style.display = 'none';
    });
    document.getElementById('confirm-delete')?.addEventListener('click', async () => {
        try {
            const res = await fetch(`${APP_BASE_URL}/usuarios/${userIdToFetch}`, { method: 'DELETE', credentials: "include" });
            
            if (res.status === 401) {
                if (deleteModal) deleteModal.style.display = 'none';
                encerrarSessaoEIrLogin("Sua sessão expirou. Faça login novamente.");
                return;
            }

            if (res.ok) {
                encerrarSessaoEIrLogin();
            }
        } catch (e) { console.error("Erro ao remover conta:", e); }
    });

    // Desativadas pelo Server-Side Render (SSR) ativo
    const carregarHeader = async () => {};
    const carregarPerfil = async () => {};
});