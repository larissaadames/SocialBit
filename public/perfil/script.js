/**
 * BitSocial - Script do Perfil
 * Gerencia a visualização, edição e exclusão de contas utilizando Cookies HTTP.
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

document.addEventListener('DOMContentLoaded', async () => {
    // 1. GESTÃO DE CONTEXTO E VARIÁVEIS GLOBAIS
    const params = new URLSearchParams(window.location.search);
    const targetUserId = params.get('id'); 
    let loggedUserId = localStorage.getItem('userId');

    // Variável para guardar a foto em modo de "Preview" antes de salvar
    let fotoPendente = null;

    const sessaoAtual = await window.SocialBitSession?.renderCurrentSession({ requireAuth: true });
    if (!sessaoAtual) {
        return;
    }

    loggedUserId = localStorage.getItem('userId');
    if (!loggedUserId || loggedUserId === "null") {
        window.location.href = "/login";
        return;
    }

    const userIdToFetch = targetUserId || loggedUserId;

    // 2. ELEMENTOS DA INTERFACE
    const notificationContainer = document.getElementById('notification-container');
    const displayAvatar = document.getElementById('display-avatar');
    const headerAvatar = document.getElementById('header-avatar');
    const dropdown = document.getElementById('user-dropdown');
    const logoutModal = document.getElementById('logout-modal');
    const token = localStorage.getItem('token');
    const isAdmin = String(localStorage.getItem('perfil') || 'usuario').toLowerCase() === 'admin';
    const inputTelefone = document.getElementById('edit-telefone');
    const inputDataNasc = document.getElementById('edit-dtNasc');
    const btnSalvar = document.getElementById('btn-save-perfil');
    const btnCancelar = document.getElementById('btn-cancel-edit');
    
    const normalizeUsername = value => {
        const cleaned = String(value || '').trim().replace(/^@+/, '');
        return cleaned || 'usuario';
    };
    const formatUsername = value => `@${normalizeUsername(value)}`;

    // --- CONFIGURAÇÃO DA IDADE MÍNIMA E MÁXIMA ---
    const hoje = new Date();
    
    // 16 anos
    const dataMinima16 = new Date();
    dataMinima16.setFullYear(hoje.getFullYear() - 16);
    const dataLimiteMax = dataMinima16.toISOString().split('T')[0];

    // 140 anos 
    const dataMaxima140 = new Date();
    dataMaxima140.setFullYear(hoje.getFullYear() - 140);
    const dataLimiteMin = dataMaxima140.toISOString().split('T')[0];

    // Aplica as duas travas no input HTML
    if (inputDataNasc) {
        inputDataNasc.max = dataLimiteMax; // Ninguém mais novo que 16 anos
        inputDataNasc.min = dataLimiteMin; // Ninguém mais velho que 140 anos
    }

    // 3. SISTEMA DE NOTIFICAÇÕES
    const showNotification = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        notificationContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    };

    // --- 4. LOGOUT ---
    if (headerAvatar) {
        headerAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'flex';
            dropdown.style.display = isVisible ? 'none' : 'flex';
        });
    }

    document.addEventListener('click', () => { if(dropdown) dropdown.style.display = 'none'; });

    const logoutTrigger = document.getElementById('btn-logout-trigger');
    if (logoutTrigger) {
        logoutTrigger.addEventListener('click', () => {
            logoutModal.style.display = 'flex';
        });
    }

    const cancelLogout = document.getElementById('cancel-logout');
    if (cancelLogout) {
        cancelLogout.addEventListener('click', () => {
            logoutModal.style.display = 'none';
        });
    }

    const confirmLogout = document.getElementById('confirm-logout');
    if (confirmLogout) {
        confirmLogout.addEventListener('click', () => {
            localStorage.clear();
            // Remove o cookie limpando o valor passado pelo navegador
            document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = "/login";
        });
    }

    // 5. MÁSCARA TELEFONE E REGEXES
    if (inputTelefone) {
        inputTelefone.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            if (v.length > 11) v = v.substring(0, 11);
            let r = v.replace(/^(\d{2})(\d)/g, '($1) $2');
            r = r.replace(/(\d{5})(\d)/, '$1-$2');
            e.target.value = r;
        });
    }

    // 6. LÓGICA DE BUSCA
    const searchInput = document.getElementById("search-bar");
    const resultsBox = document.getElementById("search-results");
    if (searchInput && resultsBox) {
        searchInput.addEventListener("input", async () => {
            const termo = searchInput.value.trim();
            if (termo.length < 2) { resultsBox.style.display = "none"; return; }
            try {
                const headers = {};
                if (token && token !== "null" && token !== "undefined") {
                    headers["Authorization"] = `Bearer ${token}`;
                }

                const res = await fetch(`${APP_BASE_URL}/usuarios/busca?username=${encodeURIComponent(termo)}`, { headers });
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

    // --- 7. CARREGAR HEADER ---
    const carregarHeader = async () => {
        try {
            const headers = {};
            if (token && token !== "null" && token !== "undefined") {
                headers["Authorization"] = `Bearer ${token}`;
            }

            const res = await fetch(`${APP_BASE_URL}/usuarios/${loggedUserId}`, { headers });
            if (res.ok) {
                const u = await res.json();
                const foto = (u.foto_url && u.foto_url.length > 50) ? u.foto_url : '/public/img/bitPerfil.png';
                if (headerAvatar) {
                    headerAvatar.style.backgroundImage = `url('${foto}')`;
                }
            }
        } catch (e) { console.error(e); }
    };

    // --- 8. CARREGAR PERFIL ---
    const carregarPerfil = async () => {
        try {
            const headers = {};
            if (token && token !== "null" && token !== "undefined") {
                headers["Authorization"] = `Bearer ${token}`;
            }

            const res = await fetch(`${APP_BASE_URL}/usuarios/${userIdToFetch}`, { headers });
            if (!res.ok) throw new Error();
            const u = await res.json();

            document.getElementById('display-nome-completo').textContent = `${u.nome} ${u.sobrenome}`;
            document.getElementById('display-username').textContent = formatUsername(u.username);
            document.getElementById('display-bio').textContent = u.bio || "> Sem biografia.";
            document.getElementById('display-telefone').textContent = u.telefone ? `📞 ${u.telefone}` : "";
            document.getElementById('display-dtNasc').textContent = u.dtNasc ? `🎂 ${u.dtNasc}` : "";

            const fotoPerfil = (u.foto_url && u.foto_url.length > 50) ? u.foto_url : '/public/img/bitPerfil.png';
            if (displayAvatar) {
                displayAvatar.style.backgroundImage = `url('${fotoPerfil}')`;
            }

            if (userIdToFetch == loggedUserId || isAdmin) {
                const editBtn = document.getElementById('btn-edit-perfil');
                if (editBtn) editBtn.style.display = 'block';
                
                const editNome = document.getElementById('edit-nome');
                const editSobrenome = document.getElementById('edit-sobrenome');
                const editBio = document.getElementById('edit-bio');
                
                if (editNome) editNome.value = u.nome;
                if (editSobrenome) editSobrenome.value = u.sobrenome;
                if (editBio) editBio.value = u.bio || "";
                if (inputTelefone) inputTelefone.value = u.telefone || "";
                if (inputDataNasc) inputDataNasc.value = u.dtNasc || "";
            }
        } catch (e) { showNotification("Erro ao carregar dados.", "error"); }
    };

    // --- 9. SALVAR ALTERAÇÕES ---
    const salvarAlteracoes = async () => {
        const nome = document.getElementById('edit-nome').value.trim();
        const sobrenome = document.getElementById('edit-sobrenome').value.trim();
        const regexNome = /^[A-Za-zÀ-ÿ\s]{2,25}$/;
        const regexSobrenome = /^[A-Za-zÀ-ÿ\s]{2,50}$/;
        const telefoneVal = inputTelefone ? inputTelefone.value.trim() : "";
        const dtNascVal = inputDataNasc ? inputDataNasc.value : "";
        
        if (!regexNome.test(nome)) {
            showNotification("O nome deve ter entre 2 e 25 letras (sem números ou símbolos).", "error");
            return;
        }

        if (!regexSobrenome.test(sobrenome)) {
            showNotification("O sobrenome deve ter entre 2 e 50 letras (sem números ou símbolos).", "error");
            return;
        }

        const regexTel = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
        if (telefoneVal && !regexTel.test(telefoneVal)) {
            showNotification("Formato de telefone inválido. Use (00) 00000-0000", "error");
            return;
        }

        // --- NOVA VALIDAÇÃO DE IDADE (À Prova de Digitação) ---
        if (dtNascVal) {
            const dataDigitada = new Date(dtNascVal);
            if (dataDigitada > dataMinima16) {
                showNotification("Você precisa ter pelo menos 16 anos.", "error");
                return;
            }
            if (dataDigitada < dataMaxima140) {
                showNotification("Ano de nascimento inválido. Verifique a digitação.", "error");
                return;
            }
        }

        // BLOQUEIO DO BOTÃO PARA EVITAR MULTI-CLICKS
        const originalText = btnSalvar.textContent;
        btnSalvar.disabled = true;
        btnSalvar.textContent = "Salvando...";
        if (btnCancelar) {
            btnCancelar.style.pointerEvents = "none";
            btnCancelar.style.opacity = "0.5";
        }

        const dados = {
            id: parseInt(userIdToFetch),
            nome: nome,
            sobrenome: sobrenome,
            bio: document.getElementById('edit-bio').value,
            telefone: telefoneVal,
            dtNasc: dtNascVal,
            foto_url: fotoPendente // Manda a foto que estava no preview, se houver
        };

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== "null" && token !== "undefined") {
                headers["Authorization"] = `Bearer ${token}`;
            }

            const res = await fetch(`${APP_BASE_URL}/usuarios/update`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(dados)
            });

            if (res.ok) {
                showNotification("Alterações gravadas com sucesso!");
                fotoPendente = null; // Limpa a variável após salvar
                
                // Recarrega para mostrar os novos dados consolidados
                setTimeout(() => window.location.reload(), 1000);
            } else {
                const erro = await res.json();
                showNotification(erro.detail || "Erro no servidor.", "error");
                // REATIVA BOTÕES EM CASO DE ERRO
                btnSalvar.disabled = false;
                btnSalvar.textContent = originalText;
                if (btnCancelar) {
                    btnCancelar.style.pointerEvents = "auto";
                    btnCancelar.style.opacity = "1";
                }
            }
        } catch (e) { 
            showNotification("Erro de conexão.", "error");
            btnSalvar.disabled = false;
            btnSalvar.textContent = originalText;
            if (btnCancelar) {
                btnCancelar.style.pointerEvents = "auto";
                btnCancelar.style.opacity = "1";
            }
        }
    };

    // --- 10. UPLOAD DE FOTO (APENAS PREVIEW) ---
    const avatarWrapper = document.getElementById('avatar-wrapper');
    if (avatarWrapper) {
        avatarWrapper.addEventListener('click', () => {
            if (userIdToFetch == loggedUserId) {
                const fileInput = document.getElementById('file-input');
                if (fileInput) fileInput.click();
            }
        });
    }

    const fileInputEl = document.getElementById('file-input');
    if (fileInputEl) {
        fileInputEl.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = ev.target.result;
                // Apenas atualiza a imagem na tela para a pessoa ver como ficou
                if (displayAvatar) displayAvatar.style.backgroundImage = `url('${base64}')`;
                if (headerAvatar) headerAvatar.style.backgroundImage = `url('${base64}')`;
                
                // Guarda na variável para mandar pro servidor apenas no botão "Salvar"
                fotoPendente = base64; 
            };
            reader.readAsDataURL(file);
        });
    }

    // Ao clicar em Salvar Alterações, ele puxa a função que pega a fotoPendente e envia tudo
    if (btnSalvar) {
        btnSalvar.addEventListener('click', () => salvarAlteracoes());
    }
    
    const editPerfilBtn = document.getElementById('btn-edit-perfil');
    if (editPerfilBtn) {
        editPerfilBtn.addEventListener('click', () => {
            document.getElementById('view-mode').style.display = 'none';
            document.getElementById('edit-mode').style.display = 'block';
            if (avatarWrapper) avatarWrapper.classList.add('modo-edicao');
        });
    }

    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => window.location.reload());
    }

    // --- 11. ELIMINAÇÃO ---
    const deleteModal = document.getElementById('delete-modal');
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => {
            deleteModal.style.display = 'flex';
        });
    }
    
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            deleteModal.style.display = 'none';
        });
    }
    
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            try {
                const headers = {};
                if (token && token !== "null" && token !== "undefined") {
                    headers["Authorization"] = `Bearer ${token}`;
                }

                const res = await fetch(`${APP_BASE_URL}/usuarios/${userIdToFetch}`, {
                    method: 'DELETE',
                    headers: headers
                });
                if (res.ok) {
                    localStorage.clear();
                    document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                    window.location.href = "/login";
                }
            } catch (e) {
                console.error("Erro ao deletar conta:", e);
            }
        });
    }

    carregarHeader();
    carregarPerfil();  
});