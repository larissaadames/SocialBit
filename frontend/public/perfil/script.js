/**
 * BitSocial - Script do Perfil (Versão Final - Controle de Sessão Blindado)
 * Gerencia a visualização, edição e exclusão de contas interceptando sessões expiradas.
 */
const APP_BASE_URL = window.getAppBaseUrl ? window.getAppBaseUrl() : window.location.origin;

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const targetUserId = params.get('id'); 
    let loggedUserId = localStorage.getItem('userId');
    let loggedRole = localStorage.getItem('perfil') || 'usuario';

    let fotoPendente = null;

    // Valida o estado de sessão atual por segurança
    const sessaoAtual = await window.SocialBitSession?.renderCurrentSession({ requireAuth: true });
    if (!sessaoAtual) return;

    loggedUserId = localStorage.getItem('userId');
    loggedRole = localStorage.getItem('perfil') || 'usuario';
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

    carregarPostsPerfil();

    async function carregarPostsPerfil() {
        const postsList = document.getElementById("profile-posts-list");
        if (!postsList) return;

        postsList.innerHTML = '<p class="profile-posts-message">Carregando posts...</p>';

        try {
            const res = await fetch(`${APP_BASE_URL}/posts/usuario/${userIdToFetch}`, { credentials: "include" });

            if (res.status === 401) {
                encerrarSessaoEIrLogin("Sua sessao expirou. Faca login novamente.");
                return;
            }

            if (!res.ok) throw new Error("Erro ao carregar posts.");

            const posts = await res.json();
            postsList.innerHTML = "";

            if (!Array.isArray(posts) || posts.length === 0) {
                postsList.innerHTML = '<p class="profile-posts-message">Nenhum post publicado ainda.</p>';
                return;
            }

            posts.forEach(post => {
                const card = document.createElement("article");
                card.className = "profile-post-card";
                const isOwner = Number(post.usuario_id) === Number(loggedUserId);
                const isAdmin = String(loggedRole).toLowerCase() === "admin";
                card.addEventListener("click", () => {
                    window.location.href = `/post/${post.id}`;
                });

                const header = document.createElement("div");
                header.className = "profile-post-header";

                const avatar = document.createElement("div");
                avatar.className = "profile-post-avatar";
                const foto = post.foto_url && post.foto_url.length > 50 ? post.foto_url : "/public/img/bitPerfil.png";
                avatar.style.backgroundImage = `url('${foto}')`;

                const username = document.createElement("span");
                username.className = "profile-post-username";
                username.textContent = formatUsername(post.username);

                const menu = document.createElement("div");
                menu.className = "profile-post-menu";

                const menuButton = document.createElement("button");
                menuButton.type = "button";
                menuButton.className = "profile-post-menu-trigger";
                menuButton.innerHTML = "&#8942;";

                const menuContent = document.createElement("div");
                menuContent.className = "profile-post-menu-content";

                const reportButton = document.createElement("button");
                reportButton.type = "button";
                reportButton.innerHTML = '<span>!</span> Denunciar';
                reportButton.addEventListener("click", event => {
                    event.stopPropagation();
                    showNotification("Abra o post para denunciar.", "error");
                    menu.classList.remove("open");
                });
                menuContent.appendChild(reportButton);

                if (isOwner) {
                    const editButton = document.createElement("button");
                    editButton.type = "button";
                    editButton.innerHTML = '<span>✎</span> Editar';
                    editButton.addEventListener("click", event => {
                        event.stopPropagation();
                        window.location.href = `/post/${post.id}`;
                    });
                    menuContent.appendChild(editButton);
                }

                if (isOwner || isAdmin) {
                    const deleteButton = document.createElement("button");
                    deleteButton.type = "button";
                    deleteButton.className = "danger";
                    deleteButton.innerHTML = '<span>x</span> Excluir';
                    deleteButton.addEventListener("click", async event => {
                        event.stopPropagation();
                        await removerPostPerfil(post.id, card);
                    });
                    menuContent.appendChild(deleteButton);
                }

                menuButton.addEventListener("click", event => {
                    event.stopPropagation();
                    document.querySelectorAll(".profile-post-menu.open").forEach(item => item.classList.remove("open"));
                    menu.classList.toggle("open");
                });
                menu.addEventListener("click", event => event.stopPropagation());
                menu.appendChild(menuButton);
                menu.appendChild(menuContent);

                const texto = document.createElement("p");
                texto.className = "profile-post-text";
                texto.textContent = post.conteudo || "";

                if (post.imagem_url) {
                    const imagem = document.createElement("img");
                    imagem.className = "profile-post-image";
                    imagem.src = post.imagem_url;
                    imagem.alt = "Imagem do post";
                    card.appendChild(header);
                    card.appendChild(texto);
                    card.appendChild(imagem);
                } else {
                    card.appendChild(header);
                    card.appendChild(texto);
                }

                const footer = document.createElement("div");
                footer.className = "profile-post-footer";

                const votos = document.createElement("div");
                votos.className = "profile-post-votes post-votes";
                votos.dataset.vote = String(post.voto || 0);
                votos.innerHTML = `
                    <button type="button" class="vote-arrow upvote ${post.voto === 1 ? "upvoted" : ""}" title="Upvote"></button>
                    <strong class="vote-count">${post.votos || 0}</strong>
                    <button type="button" class="vote-arrow downvote ${post.voto === -1 ? "downvoted" : ""}" title="Downvote"></button>
                `;

                const comentar = document.createElement("button");
                comentar.type = "button";
                comentar.className = "profile-post-comment";
                comentar.title = "Comentar";
                comentar.innerHTML = '<i class="fa-solid fa-comment"></i>';
                comentar.addEventListener("click", event => {
                    event.stopPropagation();
                    window.location.href = `/post/${post.id}`;
                });

                header.appendChild(avatar);
                header.appendChild(username);
                header.appendChild(menu);
                footer.appendChild(votos);
                footer.appendChild(comentar);
                card.appendChild(footer);
                configurarVotosPerfil(post, votos);
                postsList.appendChild(card);
            });
        } catch (e) {
            postsList.innerHTML = '<p class="profile-posts-message">Erro ao carregar posts.</p>';
        }
    }

    async function removerPostPerfil(postId, card) {
        try {
            const res = await fetch(`${APP_BASE_URL}/posts/${postId}`, {
                method: "DELETE",
                credentials: "include"
            });
            if (!res.ok) throw new Error("Não foi possível excluir o post.");
            card.remove();
            showNotification("Post excluído.");
        } catch (error) {
            showNotification(error.message || "Erro ao excluir post.", "error");
        }
    }

    function configurarVotosPerfil(post, votosEl) {
        const up = votosEl.querySelector(".upvote");
        const down = votosEl.querySelector(".downvote");
        const count = votosEl.querySelector(".vote-count");
        if (!up || !down || !count) return;

        let votoAtual = Number(post.voto || 0);
        let base = (Number(post.votos || 0)) - votoAtual;

        async function votar(tipo) {
            const res = await fetch(`${APP_BASE_URL}/posts/${post.id}/votar?tipo=${tipo}`, {
                method: "PUT",
                credentials: "include"
            });
            if (!res.ok) throw new Error("Não foi possível votar.");
            const data = await res.json();
            count.textContent = data.votos;
            base = Number(data.votos || 0) - votoAtual;
        }

        function atualizarVisual() {
            up.classList.toggle("upvoted", votoAtual === 1);
            down.classList.toggle("downvoted", votoAtual === -1);
            count.textContent = base + votoAtual;
        }

        up.addEventListener("click", async event => {
            event.stopPropagation();
            votoAtual = votoAtual === 1 ? 0 : 1;
            atualizarVisual();
            await votar(votoAtual === 0 ? "cancel" : "up");
        });

        down.addEventListener("click", async event => {
            event.stopPropagation();
            votoAtual = votoAtual === -1 ? 0 : -1;
            atualizarVisual();
            await votar(votoAtual === 0 ? "cancel" : "down");
        });
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

    async function carregarPerfil() {
        try {
            const res = await fetch(`${APP_BASE_URL}/usuarios/${userIdToFetch}`, { credentials: "include" });

            if (res.status === 401) {
                encerrarSessaoEIrLogin("Sua sessao expirou. Faca login novamente.");
                return;
            }

            if (!res.ok) throw new Error("Erro ao carregar perfil.");

            const u = await res.json();
            const podeEditar = Number(userIdToFetch) === Number(loggedUserId);
            const fotoPadrao = "/public/img/bitPerfil.png";
            const foto = u.foto_url && u.foto_url.length > 50 ? u.foto_url : fotoPadrao;

            document.title = `SocialBit - Perfil de @${String(u.username || "").replace(/^@+/, "")}`;
            document.getElementById("display-nome-completo").textContent = `${u.nome || ""} ${u.sobrenome || ""}`.trim();
            document.getElementById("display-username").textContent = formatUsername(u.username);
            document.getElementById("display-bio").textContent = u.bio || "> Olá! Bem-vindo ao meu SocialBit.";

            const telefoneEl = document.getElementById("display-telefone");
            const dtNascEl = document.getElementById("display-dtNasc");
            const alturaEl = document.getElementById("display-altura");
            if (telefoneEl) telefoneEl.textContent = u.telefone ? `📞 ${u.telefone}` : "";
            if (dtNascEl) dtNascEl.textContent = u.dtNasc ? `🎂 ${u.dtNasc}` : "";
            if (alturaEl) alturaEl.textContent = u.altura ? `altura: ${u.altura}` : "";

            const postsTitle = document.getElementById("profile-posts-title");
            if (postsTitle) postsTitle.textContent = `Posts de ${formatUsername(u.username)}`;

            if (displayAvatar) displayAvatar.style.backgroundImage = `url('${foto}')`;
            if (headerAvatar) headerAvatar.style.backgroundImage = `url('${foto}')`;

            const editNome = document.getElementById("edit-nome");
            const editSobrenome = document.getElementById("edit-sobrenome");
            const editTelefone = document.getElementById("edit-telefone");
            const editDtNasc = document.getElementById("edit-dtNasc");
            const editBio = document.getElementById("edit-bio");
            if (editNome) editNome.value = u.nome || "";
            if (editSobrenome) editSobrenome.value = u.sobrenome || "";
            if (editTelefone) editTelefone.value = u.telefone || "";
            if (editDtNasc) editDtNasc.value = u.dtNasc || "";
            if (editBio) editBio.value = u.bio || "";

            const btnEdit = document.getElementById("btn-edit-perfil");
            const avatarOverlay = document.getElementById("avatar-overlay");
            const deleteBtn = document.getElementById("delete-account-btn");
            if (btnEdit) btnEdit.style.display = podeEditar ? "block" : "none";
            if (avatarOverlay) avatarOverlay.style.display = podeEditar ? "block" : "none";
            if (deleteBtn) deleteBtn.style.display = podeEditar ? "inline-block" : "none";
        } catch (error) {
            showNotification("Erro ao carregar perfil.", "error");
        }
    }

    carregarPerfil();

    const carregarHeader = async () => {};
});