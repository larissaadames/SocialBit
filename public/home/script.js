/**
 * BitSocial - Script da Home (Versão Avançada - Fase 5 Concluída e Padronizada)
 * Controla dinamicamente o feed global e as interações do usuário sem popups nativos.
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

// --- ENGINE CENTRAL DE NOTIFICAÇÕES TOAST ---
const showToast = (message, type = 'success') => {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅ ' : type === 'error' ? '❌ ' : 'ℹ️ ';
    toast.textContent = icon + message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
};

// --- INJETOR DINÂMICO: MODAL DE CONFIRMAÇÃO DE EXCLUSÃO (PADRONIZADO) ---
const showConfirmModal = (title, message, onConfirm) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex'; // Força a exibição centralizada
    modal.innerHTML = `
        <div class="modal-content">
            <h3>${title}</h3>
            <p>${message}</p>
            <div class="modal-actions">
                <button type="button" class="btn-cancel id-cancel">Cancelar</button>
                <button type="button" class="btn-confirm id-confirm">Confirmar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.id-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('.id-confirm').addEventListener('click', () => {
        onConfirm();
        modal.remove();
    });
};

// --- INJETOR DINÂMICO: MODAL DE EDIÇÃO DE CONTEÚDO (PADRONIZADO) ---
const showEditModal = (currentContent, onSave) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; width: 92%;">
            <h3>Editar Publicação</h3>
            <p>Altere o conteúdo do seu post abaixo:</p>
            <textarea class="composer-input" style="width: 100%; min-height: 120px; background: #151515; color: #f0f0f0; border: 1px solid #3a3a3a; border-radius: 10px; padding: 14px; margin: 15px 0; font-family: sans-serif; font-size: 14px; line-height: 1.45; resize: vertical; outline: none; box-sizing: border-box;" maxlength="500">${currentContent}</textarea>
            <div class="modal-actions">
                <button type="button" class="btn-cancel id-cancel">Cancelar</button>
                <button type="button" class="btn-confirm id-save" style="background-color: var(--accent-purple);">Salvar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const textarea = modal.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length); // Coloca o cursor no final do texto

    modal.querySelector('.id-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('.id-save').addEventListener('click', () => {
        const newContent = textarea.value.trim();
        if (!newContent) {
            showToast("O conteúdo da publicação não pode ficar vazio.", "error");
            return;
        }
        onSave(newContent);
        modal.remove();
    });
};

document.addEventListener("DOMContentLoaded", async () => {
    const userMenuWrapper = document.querySelector(".user-menu-wrapper");
    const headerAvatar = document.getElementById("header-avatar");
    const userDropdown = document.getElementById("user-dropdown");
    const logoutTrigger = document.getElementById("btn-logout-trigger");
    const logoutModal = document.getElementById("logout-modal");
    const confirmLogoutBtn = document.getElementById("confirm-logout");
    const cancelLogoutBtn = document.getElementById("cancel-logout");
    const navItems = document.querySelectorAll(".nav-item");
    const searchSection = document.querySelector(".search-section");
    const searchInput = document.getElementById("main-search");
    const searchResults = document.getElementById("search-results");
    const postPrompt = document.querySelector(".create-post-card");
    const togglePostButton = document.getElementById("btn-toggle-post");
    const postComposerForm = document.getElementById("post-composer-form");
    const postContentInput = document.getElementById("post-content");
    const postCounter = document.getElementById("post-counter");
    const cancelPostButton = document.getElementById("btn-cancel-post");
    const sendPostButton = document.getElementById("btn-send-post");
    const feedScroll = document.getElementById("feed-scroll");

    let loggedUserId = Number(localStorage.getItem("userId") || 0);
    let loggedUsername = localStorage.getItem("username") || "usuario";
    const MAX_POST_LENGTH = 500;

    const normalizeUsername = value => {
        const cleaned = String(value || "").trim().replace(/^@+/, "");
        return cleaned || "usuario";
    };
    const formatUsername = value => `@${normalizeUsername(value)}`;
    
    const EXAMPLE_POST = {
        username: "davi cagnato",
        conteudo: "Alguem sabe como faz para debugar codigo Python no IntelliJ? Estou quebrando cabeca com breakpoints.",
    };
    const LOGIN_PAGE_URL = `${APP_BASE_URL}/login`;
    let activeFeedTarget = "home";
    let searchDebounceTimer;
    let lastSearchRequestId = 0;

    document.addEventListener("click", event => {
        fecharMenusAbertos();

        if (searchSection && !searchSection.contains(event.target)) {
            ocultarResultadosBusca();
        }

        if (userDropdown && userMenuWrapper && !userMenuWrapper.contains(event.target)) {
            userDropdown.style.display = "none";
        }

        if (logoutModal && event.target === logoutModal) {
            logoutModal.style.display = "none";
        }
    });

    const sessaoAtual = await window.SocialBitSession?.renderCurrentSession({ requireAuth: true });
    if (!sessaoAtual) return;

    loggedUserId = Number(localStorage.getItem("userId") || loggedUserId || 0);
    loggedUsername = localStorage.getItem("username") || loggedUsername;
    const loggedRole = String(localStorage.getItem("perfil") || "usuario").toLowerCase();
    const isAdmin = loggedRole === "admin";

    configurarMenuUsuario();
    carregarAvatarHeader();

    if (postCounter && postContentInput) {
        postCounter.textContent = `${postContentInput.value.length}/${MAX_POST_LENGTH}`;
    }

    configurarBuscaUsuarios();

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            navItems.forEach(nav => nav.classList.remove("active"));
            item.classList.add("active");

            const target = item.getAttribute("data-target");
            activeFeedTarget = target === "saved" ? "saved" : "home";

            if (!postPrompt) return;
            postPrompt.style.display = activeFeedTarget === "saved" ? "none" : "flex";

            if (activeFeedTarget === "saved") fecharComposer();
            carregarPosts();
        });
    });

    if (togglePostButton) {
        togglePostButton.addEventListener("click", () => {
            if (!postComposerForm) return;
            if (postComposerForm.classList.contains("is-hidden")) {
                abrirComposer();
            } else {
                fecharComposer();
            }
        });
    }

    if (postContentInput && postCounter) {
        postContentInput.addEventListener("input", () => {
            postCounter.textContent = `${postContentInput.value.length}/${MAX_POST_LENGTH}`;
        });
    }

    if (cancelPostButton) {
        cancelPostButton.addEventListener("click", () => fecharComposer());
    }

    if (postComposerForm) {
        postComposerForm.addEventListener("submit", async event => {
            event.preventDefault();

            const conteudo = (postContentInput?.value || "").trim();
            if (!conteudo) {
                showToast("Por favor, digite um conteúdo antes de publicar.", "error");
                return;
            }

            if (sendPostButton) {
                sendPostButton.disabled = true;
                sendPostButton.classList.add("is-sending");
                sendPostButton.textContent = "Publicando...";
            }

            try {
                const response = await fetch(`${APP_BASE_URL}/posts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conteudo }),
                });

                if (response.status === 401) {
                    encerrarSessaoEIrLogin("Sua sessão expirou. Faça login novamente.");
                    return;
                }

                if (!response.ok) {
                    const detail = await extrairErro(response);
                    throw new Error(detail || "Não foi possível publicar seu post.");
                }

                const novoPost = await response.json();
                if (activeFeedTarget === "home") {
                    adicionarPostNoTopo({
                        ...novoPost,
                        username: normalizeUsername(novoPost.username || loggedUsername),
                        salvo: false,
                        voto: 0
                    });
                }
                fecharComposer();
                showToast("Publicação compartilhada no feed global!", "success");
            } catch (error) {
                console.error("Erro ao criar post:", error);
                showToast(error.message || "Erro inesperado ao publicar post.", "error");
            } finally {
                if (sendPostButton) {
                    sendPostButton.disabled = false;
                    sendPostButton.classList.remove("is-sending");
                    sendPostButton.textContent = "Publicar";
                }
            }
        });
    }

    carregarPosts();

    function configurarMenuUsuario() {
        if (headerAvatar && userDropdown) {
            headerAvatar.addEventListener("click", event => {
                event.stopPropagation();
                const isVisible = userDropdown.style.display === "flex";
                userDropdown.style.display = isVisible ? "none" : "flex";
            });
        }

        if (logoutTrigger && logoutModal) {
            logoutTrigger.addEventListener("click", event => {
                event.preventDefault();
                if (userDropdown) userDropdown.style.display = "none";
                logoutModal.style.display = "flex";
            });
        }

        if (cancelLogoutBtn && logoutModal) {
            cancelLogoutBtn.addEventListener("click", () => {
                logoutModal.style.display = "none";
            });
        }

        if (confirmLogoutBtn && logoutModal) {
            confirmLogoutBtn.addEventListener("click", () => {
                logoutModal.style.display = "none";
                encerrarSessaoEIrLogin();
            });
        }
    }

    async function carregarAvatarHeader() {
        if (!headerAvatar) return;
        headerAvatar.style.backgroundImage = "url('/public/img/bitPerfil.png')";
        try {
            const response = await fetch(`${APP_BASE_URL}/usuarios/${loggedUserId}`);
            if (!response.ok) return;
            const usuario = await response.json();
            const fotoFinal = usuario.foto_url && usuario.foto_url.length > 50 ? usuario.foto_url : "/public/img/bitPerfil.png";
            headerAvatar.style.backgroundImage = `url('${fotoFinal}')`;
        } catch (error) {
            console.error("Erro ao carregar avatar do cabecalho:", error);
        }
    }

    async function carregarPosts() {
        if (!feedScroll) return;
        feedScroll.innerHTML = "";
        feedScroll.appendChild(criarMensagemFeed(activeFeedTarget === "saved" ? "Carregando seus posts salvos..." : "Carregando posts...", "feed-loading"));

        try {
            const endpoint = activeFeedTarget === "saved" ? "/posts/saved" : "/posts";
            const response = await fetch(`${APP_BASE_URL}${endpoint}`);

            if (response.status === 401) {
                encerrarSessaoEIrLogin("Sua sessão expirou. Faça login novamente.");
                return;
            }
            if (!response.ok) throw new Error("Não foi possível carregar o feed.");

            const posts = await response.json();
            renderizarPosts(Array.isArray(posts) ? posts : []);
        } catch (error) {
            console.error("Erro ao carregar feed:", error);
            feedScroll.innerHTML = "";
            feedScroll.appendChild(criarMensagemFeed(activeFeedTarget === "saved" ? "Erro ao carregar posts salvos. Tente novamente em instantes." : "Erro ao carregar posts. Tente novamente em instantes.", "feed-empty"));
            showToast("Falha ao sincronizar o feed com a base de dados.", "error");
        }
    }

    function renderizarPosts(posts) {
        if (!feedScroll) return;
        feedScroll.innerHTML = "";

        if (!posts.length) {
            if (activeFeedTarget === "saved") {
                feedScroll.appendChild(criarMensagemFeed("Nenhum post salvo ainda.", "feed-empty"));
            } else {
                feedScroll.appendChild(criarMensagemFeed("Nenhum post publicado ainda.", "feed-empty"));
                const exemploCard = criarCardPostExemplo();
                feedScroll.appendChild(exemploCard);
                configurarVotacao(exemploCard);
            }
            return;
        }

        posts.forEach((post, index) => {
            const card = criarCardPost(post, index);
            feedScroll.appendChild(card);
            configurarVotacao(card);
        });
    }

    function adicionarPostNoTopo(post) {
        if (!feedScroll) return;
        feedScroll.querySelectorAll(".feed-loading, .feed-empty").forEach(e => e.remove());

        const card = criarCardPost(post, 0);
        card.style.animationDelay = "0ms";

        if (feedScroll.firstElementChild) {
            feedScroll.insertBefore(card, feedScroll.firstElementChild);
        } else {
            feedScroll.appendChild(card);
        }
        configurarVotacao(card);
    }

    function abrirComposer() {
        if (!postComposerForm) return;
        postComposerForm.classList.remove("is-hidden");
        if (togglePostButton) togglePostButton.textContent = "Fechar";
        if (postContentInput) postContentInput.focus();
    }

    function fecharComposer() {
        if (!postComposerForm) return;
        postComposerForm.classList.add("is-hidden");
        if (postContentInput) postContentInput.value = "";
        if (postCounter) postCounter.textContent = `0/${MAX_POST_LENGTH}`;
        if (togglePostButton) togglePostButton.textContent = "Postar";
    }

    function criarCardPost(post, index) {
        const card = document.createElement("article");
        card.className = "post-card post-enter";
        card.dataset.postId = String(post.id);
        card.dataset.userVote = String(post.voto || 0); 
        card.style.animationDelay = `${Math.min(index * 45, 260)}ms`;

        const header = document.createElement("header");
        header.className = "post-header";

        const userMeta = document.createElement("div");
        userMeta.className = "post-user-meta";

        const avatar = document.createElement("div");
        avatar.className = "post-user-avatar";
        const fotoAutor = post.foto_url && post.foto_url.length > 50 ? post.foto_url : "/public/img/bitPerfil.png";
        avatar.style.backgroundImage = `url('${fotoAutor}')`;

        const username = document.createElement("span");
        username.className = "post-user-name";
        username.textContent = formatUsername(post.username);

        userMeta.appendChild(avatar);
        userMeta.appendChild(username);
        header.appendChild(userMeta);

        const headerActions = document.createElement("div");
        headerActions.className = "post-header-actions";

        const isOwner = loggedUserId > 0 && Number(post.usuario_id) === loggedUserId;
        const canDelete = isOwner || isAdmin;

        const menuWrapper = document.createElement("div");
        menuWrapper.className = "post-menu-wrapper";

        const menuTrigger = document.createElement("button");
        menuTrigger.type = "button";
        menuTrigger.className = "post-menu-trigger";
        menuTrigger.innerHTML = "&#8942;";

        const menuContent = document.createElement("div");
        menuContent.className = "post-menu-content";

        const reportAction = document.createElement("button");
        reportAction.type = "button";
        reportAction.className = "post-menu-item";
        reportAction.innerHTML = '<span class="menu-item-icon">!</span><span>Denunciar</span>';
        reportAction.addEventListener("click", () => {
            menuWrapper.classList.remove("open");
            showToast("A funcionalidade de denúncias será ativada em breve.", "info");
        });
        menuContent.appendChild(reportAction);

        if (canDelete) {
            const editAction = document.createElement("button");
            editAction.type = "button";
            editAction.className = "post-menu-item";
            editAction.innerHTML = '<span class="menu-item-icon">✎</span><span>Editar</span>';
            editAction.addEventListener("click", () => {
                menuWrapper.classList.remove("open");
                editarPost(post, card, editAction);
            });
            menuContent.appendChild(editAction);

            const deleteAction = document.createElement("button");
            deleteAction.type = "button";
            deleteAction.className = "post-menu-item danger";
            deleteAction.innerHTML = '<span class="menu-item-icon">x</span><span>Excluir</span>';
            deleteAction.addEventListener("click", () => {
                menuWrapper.classList.remove("open");
                removerPost(post.id, card, deleteAction);
            });
            menuContent.appendChild(deleteAction);
        }

        menuTrigger.addEventListener("click", event => {
            event.stopPropagation();
            const shouldOpen = !menuWrapper.classList.contains("open");
            fecharMenusAbertos();
            if (shouldOpen) menuWrapper.classList.add("open");
        });

        menuContent.addEventListener("click", event => event.stopPropagation());

        menuWrapper.appendChild(menuTrigger);
        menuWrapper.appendChild(menuContent);
        headerActions.appendChild(menuWrapper);
        header.appendChild(headerActions);

        const contentBox = document.createElement("div");
        contentBox.className = "post-content-box";

        const contentText = document.createElement("p");
        contentText.className = "post-text";
        contentText.textContent = post.conteudo || "";
        contentBox.appendChild(contentText);

        const footer = document.createElement("footer");
        footer.className = "post-footer";

        const votes = document.createElement("div");
        votes.className = "post-votes";
        votes.innerHTML = [
            `<div class="vote-arrow upvote${post.voto === 1 ? ' upvoted' : ''}" aria-label="Upvote"></div>`,
            `<span class="vote-count">${post.votos || 0}</span>`,
            `<div class="vote-arrow downvote${post.voto === -1 ? ' downvoted' : ''}" aria-label="Downvote"></div>`
        ].join("");

        const socialActions = document.createElement("div");
        socialActions.className = "post-social-actions";

        const shareButton = document.createElement("button");
        shareButton.type = "button";
        shareButton.className = "post-action-btn share-action-btn";
        shareButton.innerHTML = "&#10548;";
        shareButton.addEventListener("click", () => compartilharPost(post, shareButton));

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "post-action-btn save-flag-btn";
        saveButton.title = post.salvo ? "Remover dos salvos" : "Salvar post";
        saveButton.setAttribute("aria-pressed", post.salvo ? "true" : "false");
        if (post.salvo) saveButton.classList.add("is-saved");
        saveButton.innerHTML = "&#9873;";
        saveButton.addEventListener("click", () => alternarPostSalvo(post.id, saveButton, card));

        socialActions.appendChild(shareButton);
        socialActions.appendChild(saveButton);
        footer.appendChild(votes);
        footer.appendChild(socialActions);

        card.appendChild(header);
        card.appendChild(contentBox);
        card.appendChild(footer);

        return card;
    }

    function configurarVotacao(postElement) {
        const upBtn = postElement.querySelector(".upvote");
        const downBtn = postElement.querySelector(".downvote");
        const countSpan = postElement.querySelector(".vote-count");

        if (!upBtn || !downBtn || !countSpan) return;

        let userVote = parseInt(postElement.dataset.userVote, 10) || 0;

        function triggerAnimation(elemento) {
            elemento.classList.remove("animating");
            void elemento.offsetWidth;
            elemento.classList.add("animating");
        }

        upBtn.addEventListener("click", async () => {
            triggerAnimation(upBtn);
            const action = userVote === 1 ? "cancel" : "up"; 
            try {
                const res = await fetch(`${APP_BASE_URL}/posts/${postElement.dataset.postId}/votar?tipo=${action}`, { method: "PUT" });
                if (res.ok) {
                    const d = await res.json();
                    countSpan.textContent = d.votos;
                    
                    if (userVote === 1) {
                        userVote = 0;
                        upBtn.classList.remove("upvoted");
                        showToast("Voto removido.", "info");
                    } else {
                        userVote = 1;
                        upBtn.classList.add("upvoted");
                        downBtn.classList.remove("downvoted");
                        showToast("Voto computado: Upvote!", "success");
                    }
                    postElement.dataset.userVote = userVote;
                }
            } catch(e) { console.error(e); }
        });

        downBtn.addEventListener("click", async () => {
            triggerAnimation(downBtn);
            const action = userVote === -1 ? "cancel" : "down";
            try {
                const res = await fetch(`${APP_BASE_URL}/posts/${postElement.dataset.postId}/votar?tipo=${action}`, { method: "PUT" });
                if (res.ok) {
                    const d = await res.json();
                    countSpan.textContent = d.votos;
                    
                    if (userVote === -1) {
                        userVote = 0;
                        downBtn.classList.remove("downvoted");
                        showToast("Voto removido.", "info");
                    } else {
                        userVote = -1;
                        downBtn.classList.add("downvoted");
                        upBtn.classList.remove("upvoted");
                        showToast("Voto computado: Downvote.", "info");
                    }
                    postElement.dataset.userVote = userVote;
                }
            } catch(e) { console.error(e); }
        });
    }

    function criarMensagemFeed(mensagem, classe) {
        const elemento = document.createElement("p");
        elemento.className = classe;
        elemento.textContent = mensagem;
        return elemento;
    }

    function criarCardPostExemplo() {
        const card = document.createElement("article");
        card.className = "post-card post-enter";

        const header = document.createElement("header");
        header.className = "post-header";

        const userMeta = document.createElement("div");
        userMeta.className = "post-user-meta";

        const avatar = document.createElement("div");
        avatar.className = "post-user-avatar";
        avatar.style.backgroundImage = "url('/public/img/bitPerfil.png')";

        const username = document.createElement("span");
        username.className = "post-user-name";
        username.textContent = formatUsername(EXAMPLE_POST.username);

        const exampleBadge = document.createElement("span");
        exampleBadge.className = "post-example-badge";
        exampleBadge.textContent = "EXEMPLO";

        userMeta.appendChild(avatar);
        userMeta.appendChild(username);
        header.appendChild(userMeta);
        header.appendChild(exampleBadge);

        const contentBox = document.createElement("div");
        contentBox.className = "post-content-box";

        const contentText = document.createElement("p");
        contentText.className = "post-text";
        contentText.textContent = EXAMPLE_POST.conteudo;
        contentBox.appendChild(contentText);

        const footer = document.createElement("footer");
        footer.className = "post-footer";

        const votes = document.createElement("div");
        votes.className = "post-votes";
        votes.innerHTML = [
            '<div class="vote-arrow upvote" aria-label="Upvote"></div>',
            '<span class="vote-count">0</span>',
            '<div class="vote-arrow downvote" aria-label="Downvote"></div>'
        ].join("");

        const socialActions = document.createElement("div");
        socialActions.className = "post-social-actions";

        const shareButton = document.createElement("button");
        shareButton.type = "button";
        shareButton.className = "post-action-btn share-action-btn";
        shareButton.disabled = true;
        shareButton.innerHTML = "&#10548;";

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "post-action-btn save-flag-btn";
        saveButton.disabled = true;
        saveButton.innerHTML = "&#9873;";

        socialActions.appendChild(shareButton);
        socialActions.appendChild(saveButton);
        footer.appendChild(votes);
        footer.appendChild(socialActions);

        card.appendChild(header);
        card.appendChild(contentBox);
        card.appendChild(footer);

        return card;
    }

    // --- REMOVER POST (UTILIZANDO MODAL VISUALMENTE PADRONIZADO) ---
    async function removerPost(postId, postCard, deleteButton) {
        showConfirmModal(
            "⚠️ Excluir Publicação?", 
            "Tem certeza que deseja apagar permanentemente este post do feed global? Essa ação não pode ser desfeita.", 
            async () => {
                deleteButton.disabled = true;
                deleteButton.classList.add("is-loading");

                try {
                    const response = await fetch(`${APP_BASE_URL}/posts/${postId}`, { method: "DELETE" });

                    if (response.status === 401) {
                        encerrarSessaoEIrLogin("Sua sessão expirou. Faça login novamente.");
                        return;
                    }

                    if (!response.ok) {
                        const detail = await extrairErro(response);
                        throw new Error(detail || "Não foi possível excluir este post.");
                    }

                    postCard.classList.add("is-removing");
                    window.setTimeout(() => {
                        postCard.remove();
                        if (feedScroll && !feedScroll.querySelector(".post-card")) {
                            feedScroll.appendChild(criarMensagemFeed("Nenhum post publicado ainda.", "feed-empty"));
                        }
                    }, 240);
                    showToast("Publicação deletada com sucesso.", "success");
                } catch (error) {
                    showToast(error.message, "error");
                    deleteButton.disabled = false;
                    deleteButton.classList.remove("is-loading");
                }
            }
        );
    }

    // --- EDITA POST (UTILIZANDO CLASSE PADRONIZADA DE MODAL) ---
    async function editarPost(post, postCard, editButton) {
        showEditModal(post.conteudo, async (conteudoLimpo) => {
            editButton.disabled = true;
            editButton.classList.add("is-loading");

            try {
                const response = await fetch(`${APP_BASE_URL}/posts/${post.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conteudo: conteudoLimpo }),
                });

                if (response.status === 401) {
                    encerrarSessaoEIrLogin("Sua sessão expirou.");
                    return;
                }

                if (!response.ok) throw new Error();

                post.conteudo = conteudoLimpo;
                const texto = postCard.querySelector(".post-text");
                if (texto) texto.textContent = conteudoLimpo;
                showToast("Publicação atualizada com sucesso!", "success");
            } catch (error) {
                showToast("Erro ao tentar atualizar a publicação.", "error");
            } finally {
                editButton.disabled = false;
                editButton.classList.remove("is-loading");
            }
        });
    }

    async function extrairErro(response) {
        try { const data = await response.json(); return data.detail || ""; } catch { return ""; }
    }

    async function alternarPostSalvo(postId, saveButton, postCard) {
        const estaSalvo = saveButton.classList.contains("is-saved");
        const method = estaSalvo ? "DELETE" : "POST";

        saveButton.disabled = true;
        saveButton.classList.add("is-loading");

        try {
            const response = await fetch(`${APP_BASE_URL}/posts/${postId}/save`, { method });

            if (response.status === 401) {
                encerrarSessaoEIrLogin("Sua sessão expirou.");
                return;
            }

            if (!response.ok) throw new Error();

            const agoraSalvo = !estaSalvo;
            saveButton.classList.toggle("is-saved", agoraSalvo);
            saveButton.title = agoraSalvo ? "Remover dos salvos" : "Salvar post";

            if (agoraSalvo) {
                showToast("Post guardado na sua lista de marcadores.", "success");
            } else {
                showToast("Post removido dos guardados.", "info");
            }

            if (activeFeedTarget === "saved" && !agoraSalvo) {
                postCard.remove();
            }
        } catch (error) {
            showToast("Erro ao atualizar o status do post guardado.", "error");
        } finally {
            saveButton.disabled = false;
            saveButton.classList.remove("is-loading");
        }
    }

    async function compartilharPost(post, shareButton) {
        const textoCompartilhamento = `${formatUsername(post.username)}: ${post.conteudo || ""}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: "Post do SocialBit", text: textoCompartilhamento });
                return;
            }
            await copiarTexto(textoCompartilhamento);
            shareButton.classList.add("is-shared");
            showToast("Conteúdo copiado para a área de transferência!", "success");
            window.setTimeout(() => shareButton.classList.remove("is-shared"), 900);
        } catch (error) {
            console.error(error);
        }
    }

    async function copiarTexto(texto) {
        const textarea = document.createElement("textarea");
        textarea.value = texto;
        textarea.style.position = "fixed";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
    }

    function fecharMenusAbertos() {
        document.querySelectorAll(".post-menu-wrapper.open").forEach(menu => menu.classList.remove("open"));
    }

    function encerrarSessaoEIrLogin(mensagem = "") {
        localStorage.clear();
        document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        if (mensagem) showToast(mensagem, "error");
        setTimeout(() => { window.location.href = LOGIN_PAGE_URL; }, 800);
    }

    function configurarBuscaUsuarios() {
        if (!searchInput || !searchResults) return;

        searchInput.addEventListener("input", () => {
            const termo = searchInput.value.trim();
            clearTimeout(searchDebounceTimer);

            if (termo.length < 2) {
                ocultarResultadosBusca();
                return;
            }
            searchDebounceTimer = window.setTimeout(() => buscarUsuarios(termo), 260);
        });

        searchInput.addEventListener("focus", () => {
            if (searchResults.children.length > 0) searchResults.classList.add("is-visible");
        });
    }

    async function buscarUsuarios(termo) {
        if (!searchResults) return;
        const requestId = ++lastSearchRequestId;

        try {
            const response = await fetch(`${APP_BASE_URL}/usuarios/busca?username=${encodeURIComponent(termo)}`);
            if (requestId !== lastSearchRequestId) return;
            if (!response.ok) throw new Error();

            const usuarios = await response.json();
            renderizarResultadosBusca(Array.isArray(usuarios) ? usuarios : []);
        } catch (error) {
            renderizarResultadosBusca([]);
        }
    }

    function renderizarResultadosBusca(usuarios) {
        if (!searchResults) return;
        searchResults.innerHTML = "";

        if (!usuarios.length) {
            const vazio = document.createElement("div");
            vazio.className = "search-result-empty";
            vazio.textContent = "Nenhum usuário encontrado.";
            searchResults.appendChild(vazio);
            searchResults.classList.add("is-visible");
            return;
        }

        usuarios.forEach(usuario => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "search-result-item";
            item.innerHTML = [
                `<span class="search-result-username">${formatUsername(usuario.username)}</span>`,
                `<span class="search-result-name">${(usuario.nome || "")} ${(usuario.sobrenome || "")}</span>`,
            ].join("");

            item.addEventListener("click", () => { window.location.href = `/perfil?id=${usuario.id}`; });
            searchResults.appendChild(item);
        });
        searchResults.classList.add("is-visible");
    }

    function ocultarResultadosBusca() {
        if (!searchResults) return;
        searchResults.classList.remove("is-visible");
        searchResults.innerHTML = "";
    }
});