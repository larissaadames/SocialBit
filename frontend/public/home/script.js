/**
 * BitSocial - Script da Home (Versão Final Estabilizada)
 * Renderiza o feed dinamicamente e gerencia interações e votações com Toasts em tempo real.
 */
const APP_BASE_URL = window.getAppBaseUrl ? window.getAppBaseUrl() : window.location.origin;

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

// --- ENGINE DE MODAIS PADRONIZADOS CONFORME REFERÊNCIA ---
const showConfirmModal = (title, message, onConfirm) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex'; 
    modal.innerHTML = `
        <div class="modal-content">
            <h3>${title}</h3>
            <p>${message}</p>
            <div class="modal-actions">
                <button type="button" class="btn-confirm id-confirm">Sim, Confirmar</button>
                <button type="button" class="btn-cancel id-cancel">Cancelar</button>
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

const showEditModal = (currentContent, onSave) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <h3 style="color: var(--accent-purple); text-align: left;">✎ Editar Publicação</h3>
            <textarea style="width: 100%; min-height: 120px; background: #151515; color: #fff; border: 1px solid #333; border-radius: 8px; padding: 12px; margin: 15px 0; font-family: sans-serif; font-size: 14px; resize: vertical; outline: none; box-sizing: border-box;" maxlength="500">${currentContent}</textarea>
            <div class="modal-actions">
                <button type="button" class="btn-confirm id-save" style="background-color: var(--accent-purple);">Salvar</button>
                <button type="button" class="btn-cancel id-cancel">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const textarea = modal.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

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
    const navItems = document.querySelectorAll(".nav-item[data-target]");
    const adminPanelLink = document.getElementById("admin-panel-link");
    const searchSection = document.querySelector(".search-section");
    const searchInput = document.getElementById("main-search");
    const searchResults = document.getElementById("search-results");
    const postPrompt = document.querySelector(".create-post-card");
    const togglePostButton = document.getElementById("btn-toggle-post");
    const postComposerForm = document.getElementById("post-composer-form");
    const postContentInput = document.getElementById("post-content");
    const postImageInput = document.getElementById("post-image");
    const postImageName = document.getElementById("post-image-name");
    const postCounter = document.getElementById("post-counter");
    const cancelPostButton = document.getElementById("btn-cancel-post");
    const sendPostButton = document.getElementById("btn-send-post");
    const feedScroll = document.getElementById("feed-scroll");
    
    let loggedUserId = Number(localStorage.getItem("userId") || 0);
    let loggedUsername = localStorage.getItem("username") || "usuario";
    const token = localStorage.getItem("token");
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
    const LOGIN_PAGE_URL = "/login";
    let activeFeedTarget = "home";
    let searchDebounceTimer;
    let lastSearchRequestId = 0;
    let postImageBase64 = "";

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

    const sessaoAtual = await window.SocialBitSession?.renderCurrentSession({ requireAuth: false });
    loggedUserId = Number(localStorage.getItem("userId") || loggedUserId || 0);
    loggedUsername = localStorage.getItem("username") || loggedUsername;
    const loggedRole = String(localStorage.getItem("perfil") || "usuario").toLowerCase();
    const isAdmin = loggedRole === "admin";

    if (isAdmin && adminPanelLink) {
        adminPanelLink.style.display = "flex";
        adminPanelLink.addEventListener("click", () => {
            window.location.href = "/admin";
        });
    }

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
        postContentInput.addEventListener("focus", () => {
            if (postComposerForm) postComposerForm.classList.add("is-active");
        });

        postContentInput.addEventListener("input", () => {
            postCounter.textContent = `${postContentInput.value.length}/${MAX_POST_LENGTH}`;
        });
    }

    if (postImageInput) {
        postImageInput.addEventListener("change", async () => {
            const arquivo = postImageInput.files && postImageInput.files[0];
            if (!arquivo) {
                postImageBase64 = "";
                if (postImageName) postImageName.textContent = "";
                return;
            }
            postImageBase64 = await lerImagemComoBase64(arquivo);
            if (postImageName) postImageName.textContent = arquivo.name;
        });
    }

    if (cancelPostButton) {
        cancelPostButton.addEventListener("click", () => fecharComposer());
    }

    if (postComposerForm) {
        postComposerForm.addEventListener("submit", async event => {
            event.preventDefault();

            const conteudo = (postContentInput?.value || "").trim();
            if (!conteudo && !postImageBase64) {
                showToast("Escreva algo ou escolha uma imagem antes de publicar.", "error");
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
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ conteudo, imagem_url: postImageBase64 }),
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
                    });
                }
                fecharComposer();
                showToast("Publicação compartilhada com sucesso!", "success");
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
            const response = await fetch(`${APP_BASE_URL}/usuarios/${loggedUserId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (response.status === 401) {
                encerrarSessaoEIrLogin("Sua sessão expirou.");
                return;
            }

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
            const response = await fetch(`${APP_BASE_URL}${endpoint}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

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
        postComposerForm.classList.remove("is-active");
        if (postContentInput) postContentInput.value = "";
        if (postImageInput) postImageInput.value = "";
        if (postImageName) postImageName.textContent = "";
        postImageBase64 = "";
        if (postCounter) postCounter.textContent = `0/${MAX_POST_LENGTH}`;
        if (togglePostButton) togglePostButton.textContent = "Postar";
    }

    function abrirModalDenuncia(postId) {
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.style.display = "flex";
        modal.innerHTML = `
            <div class="modal-content report-modal-content">
                <h3>Denunciar post</h3>
                <p>Escolha o motivo da denuncia.</p>
                <select id="report-category" class="report-select">
                    <option value="">Selecione uma categoria</option>
                    <option value="Spam ou autopromocao">Spam ou autopromoção</option>
                    <option value="Ódio, assédio ou discriminação">Ódio, assédio ou discriminação</option>
                    <option value="Conteúdo ofensivo">Conteudo ofensivo</option>
                    <option value="Código malicioso ou phishing">Codigo malicioso ou phishing</option>
                    <option value="Vazamento de dados ou informação privada">Vazamento de dados ou informacao privada</option>
                    <option value="Desinformação técnica perigosa">Desinformação técnica perigosa</option>
                </select>
                <textarea id="report-details" class="report-textarea" maxlength="500" placeholder="Explique rapidamente o problema..."></textarea>
                <div class="modal-actions">
                    <button type="button" class="btn-cancel id-cancel">Cancelar</button>
                    <button type="button" class="btn-confirm id-send">Enviar denuncia</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector(".id-cancel").addEventListener("click", () => modal.remove());
        modal.addEventListener("click", event => {
            if (event.target === modal) modal.remove();
        });
        modal.querySelector(".id-send").addEventListener("click", async () => {
            const categoria = modal.querySelector("#report-category").value;
            const detalhes = modal.querySelector("#report-details").value.trim();
            if (!categoria) {
                showToast("Escolha uma categoria para denunciar.", "error");
                return;
            }

            try {
                const response = await fetch(`${APP_BASE_URL}/posts/${postId}/denunciar`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ categoria, detalhes })
                });

                if (!response.ok) {
                    const detail = await extrairErro(response);
                    throw new Error(detail || "Nao foi possivel enviar a denuncia.");
                }

                modal.remove();
                showToast("Denuncia enviada para a moderacao.", "success");
            } catch (error) {
                showToast(error.message || "Erro ao denunciar.", "error");
            }
        });
    }

    function criarCardPost(post, index) {
        const card = document.createElement("article");
        card.className = "post-card post-enter";
        card.dataset.postId = String(post.id);
        card.style.animationDelay = `${Math.min(index * 45, 260)}ms`;
        card.addEventListener("click", () => {
            window.location.href = `/post/${post.id}`;
        });

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
        reportAction.onclick = event => {
            event.stopPropagation();
            event.stopImmediatePropagation();
            menuWrapper.classList.remove("open");
            abrirModalDenuncia(post.id);
        };
        menuContent.appendChild(reportAction);

        if (isOwner) {
            const editAction = document.createElement("button");
            editAction.type = "button";
            editAction.className = "post-menu-item";
            editAction.innerHTML = '<span class="menu-item-icon">✎</span><span>Editar</span>';
            editAction.addEventListener("click", () => {
                menuWrapper.classList.remove("open");
                editarPost(post, card, editAction);
            });
            menuContent.appendChild(editAction);
        }

        if (canDelete) {
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

        if (post.imagem_url) {
            const postImage = document.createElement("img");
            postImage.className = "post-image-preview";
            postImage.src = post.imagem_url;
            postImage.alt = "Imagem do post";
            contentBox.appendChild(postImage);
        }

        const footer = document.createElement("footer");
        footer.className = "post-footer";

        // CONFIGURAÇÃO DOS VOTOS ASSINADOS VINDO DO BANCO DE DADOS
        const votes = document.createElement("div");
        votes.className = "post-votes";
        votes.innerHTML = [
            `<div class="vote-arrow upvote ${post.voto === 1 ? 'upvoted' : ''}" aria-label="Upvote"></div>`,
            `<span class="vote-count" style="color: ${post.voto === 1 ? '#ff4d4d' : post.voto === -1 ? '#7b2ff7' : '#ffffff'}">${post.votos || 0}</span>`,
            `<div class="vote-arrow downvote ${post.voto === -1 ? 'downvoted' : ''}" aria-label="Downvote"></div>`
        ].join("");

        const socialActions = document.createElement("div");
        socialActions.className = "post-social-actions";

        const shareButton = document.createElement("button");
        shareButton.type = "button";
        shareButton.className = "post-action-btn share-action-btn";
        shareButton.title = "Compartilhar";
        shareButton.innerHTML = "&#10548;";
        shareButton.addEventListener("click", event => {
            event.stopPropagation();
            compartilharPost(post, shareButton);
        });

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "post-action-btn save-flag-btn";
        saveButton.title = post.salvo ? "Remover dos salvos" : "Salvar post";
        if (post.salvo) saveButton.classList.add("is-saved");
        saveButton.innerHTML = "&#9873;";
        saveButton.addEventListener("click", event => {
            event.stopPropagation();
            alternarPostSalvo(post.id, saveButton, card);
        });

        const commentButton = document.createElement("button");
        commentButton.type = "button";
        commentButton.className = "post-action-btn comment-action-btn";
        commentButton.title = "Comentar";
        commentButton.innerHTML = '<i class="fa-solid fa-comment"></i>';
        commentButton.addEventListener("click", event => {
            event.stopPropagation();
            window.location.href = `/post/${post.id}`;
        });

        socialActions.appendChild(shareButton);
        socialActions.appendChild(commentButton);
        socialActions.appendChild(saveButton);
        footer.appendChild(votes);
        footer.appendChild(socialActions);

        card.appendChild(header);
        card.appendChild(contentBox);
        card.appendChild(footer);

        return card;
    }

    // --- PLUGADO E PERSISTIDO: ENGINE DE CRITÉRIOS DE VOTAÇÃO COMPLETA (FASE 5) ---
    function configurarComentarios(card, postId) {
        const button = card.querySelector(".comment-action-btn");
        const section = card.querySelector(".post-comments");
        const form = card.querySelector(".comment-form");
        const input = card.querySelector(".comment-input");
        const list = card.querySelector(".comment-list");
        let carregouComentarios = false;

        if (!button || !section || !form || !input || !list) return;

        button.addEventListener("click", async () => {
            const vaiAbrir = section.classList.contains("is-hidden");
            section.classList.toggle("is-hidden", !vaiAbrir);
            if (vaiAbrir && !carregouComentarios) {
                await carregarComentarios(postId, list);
                carregouComentarios = true;
            }
            if (vaiAbrir) input.focus();
        });

        form.addEventListener("submit", async event => {
            event.preventDefault();
            const texto = input.value.trim();
            if (!texto) {
                showToast("Escreva um comentario antes de enviar.", "error");
                return;
            }
            await enviarComentario(postId, texto, null, list);
            input.value = "";
            carregouComentarios = true;
        });
    }

    async function carregarComentarios(postId, list) {
        list.innerHTML = '<p class="comments-message">Carregando comentarios...</p>';
        try {
            const response = await fetch(`${APP_BASE_URL}/posts/${postId}/comentarios`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.status === 401) {
                encerrarSessaoEIrLogin("Sua sessao expirou. Faca login novamente.");
                return;
            }

            if (!response.ok) throw new Error("Nao foi possivel carregar comentarios.");

            const comentarios = await response.json();
            renderizarComentarios(Array.isArray(comentarios) ? comentarios : [], list, postId);
        } catch (error) {
            list.innerHTML = '<p class="comments-message">Erro ao carregar comentarios.</p>';
        }
    }

    function renderizarComentarios(comentarios, list, postId) {
        list.innerHTML = "";

        if (!comentarios.length) {
            list.innerHTML = '<p class="comments-message">Nenhum comentario ainda.</p>';
            return;
        }

        const porPai = {};
        comentarios.forEach(comentario => {
            const pai = comentario.comentario_pai_id || 0;
            if (!porPai[pai]) porPai[pai] = [];
            porPai[pai].push(comentario);
        });

        (porPai[0] || []).forEach(comentario => {
            list.appendChild(criarComentarioItem(comentario, porPai, postId, list));
        });
    }

    function criarComentarioItem(comentario, porPai, postId, list) {
        const item = document.createElement("article");
        item.className = "comment-item";
        item.dataset.commentId = String(comentario.id);

        const linha = document.createElement("div");
        linha.className = "comment-line";

        const votos = document.createElement("div");
        votos.className = "comment-votes";
        votos.innerHTML = [
            `<div class="vote-arrow comment-upvote ${comentario.voto === 1 ? 'upvoted' : ''}" aria-label="Upvote"></div>`,
            `<span class="comment-vote-count" style="color: ${comentario.voto === 1 ? '#ff4d4d' : comentario.voto === -1 ? '#7b2ff7' : '#ffffff'}">${comentario.votos || 0}</span>`,
            `<div class="vote-arrow comment-downvote ${comentario.voto === -1 ? 'downvoted' : ''}" aria-label="Downvote"></div>`
        ].join("");

        const corpo = document.createElement("div");
        corpo.className = "comment-body";

        const autor = document.createElement("strong");
        autor.className = "comment-author";
        autor.textContent = formatUsername(comentario.username);

        const texto = document.createElement("p");
        texto.className = "comment-text";
        texto.textContent = comentario.texto || "";

        const responder = document.createElement("button");
        responder.type = "button";
        responder.className = "comment-reply-btn";
        responder.textContent = "Responder";

        const respostaForm = document.createElement("form");
        respostaForm.className = "comment-form reply-form is-hidden";
        respostaForm.innerHTML = `
            <textarea class="comment-input" maxlength="500" placeholder="Responder comentario..."></textarea>
            <button type="submit" class="comment-send-btn">Enviar</button>
        `;

        responder.addEventListener("click", () => {
            respostaForm.classList.toggle("is-hidden");
            respostaForm.querySelector("textarea")?.focus();
        });

        respostaForm.addEventListener("submit", async event => {
            event.preventDefault();
            const inputResposta = respostaForm.querySelector("textarea");
            const textoResposta = inputResposta.value.trim();
            if (!textoResposta) {
                showToast("Escreva uma resposta antes de enviar.", "error");
                return;
            }
            await enviarComentario(postId, textoResposta, comentario.id, list);
        });

        corpo.appendChild(autor);
        corpo.appendChild(texto);
        corpo.appendChild(responder);
        corpo.appendChild(respostaForm);

        linha.appendChild(votos);
        linha.appendChild(corpo);
        item.appendChild(linha);

        configurarVotacaoComentario(item);

        (porPai[comentario.id] || []).forEach(filho => {
            item.appendChild(criarComentarioItem(filho, porPai, postId, list));
        });

        return item;
    }

    async function enviarComentario(postId, texto, comentarioPaiId, list) {
        try {
            const response = await fetch(`${APP_BASE_URL}/posts/${postId}/comentarios`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ texto, comentario_pai_id: comentarioPaiId }),
            });

            if (response.status === 401) {
                encerrarSessaoEIrLogin("Sua sessao expirou. Faca login novamente.");
                return;
            }

            if (!response.ok) {
                const detail = await extrairErro(response);
                throw new Error(detail || "Nao foi possivel comentar.");
            }

            await carregarComentarios(postId, list);
            showToast("Comentario enviado!", "success");
        } catch (error) {
            showToast(error.message || "Erro ao enviar comentario.", "error");
        }
    }

    function configurarVotacaoComentario(commentElement) {
        const upBtn = commentElement.querySelector(".comment-upvote");
        const downBtn = commentElement.querySelector(".comment-downvote");
        const countSpan = commentElement.querySelector(".comment-vote-count");
        const comentarioId = commentElement.dataset.commentId;

        if (!upBtn || !downBtn || !countSpan || !comentarioId) return;

        let userVote = upBtn.classList.contains("upvoted") ? 1 : downBtn.classList.contains("downvoted") ? -1 : 0;
        const baseCount = (parseInt(countSpan.textContent, 10) || 0) - userVote;

        async function sincronizar(tipo) {
            try {
                const response = await fetch(`${APP_BASE_URL}/comentarios/${comentarioId}/votar?tipo=${tipo}`, {
                    method: "PUT",
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (response.status === 401) {
                    encerrarSessaoEIrLogin("Sua sessao expirou. Faca login novamente.");
                    return;
                }

                if (!response.ok) throw new Error("Nao foi possivel votar no comentario.");
                const data = await response.json();
                countSpan.textContent = data.votos;
            } catch (error) {
                showToast(error.message || "Erro ao votar no comentario.", "error");
            }
        }

        upBtn.addEventListener("click", async () => {
            if (userVote === 1) {
                userVote = 0;
                upBtn.classList.remove("upvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizar("cancel");
            } else {
                userVote = 1;
                upBtn.classList.add("upvoted");
                downBtn.classList.remove("downvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizar("up");
            }
        });

        downBtn.addEventListener("click", async () => {
            if (userVote === -1) {
                userVote = 0;
                downBtn.classList.remove("downvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizar("cancel");
            } else {
                userVote = -1;
                downBtn.classList.add("downvoted");
                upBtn.classList.remove("upvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizar("down");
            }
        });
    }

    function configurarVotacao(postElement) {
        const upBtn = postElement.querySelector(".upvote");
        const downBtn = postElement.querySelector(".downvote");
        const countSpan = postElement.querySelector(".vote-count");
        const postId = postElement.dataset.postId;

        if (!upBtn || !downBtn || !countSpan || !postId) return;

        // Recupera o estado inicial seguro baseado nas classes injetadas
        let userVote = upBtn.classList.contains("upvoted") ? 1 : downBtn.classList.contains("downvoted") ? -1 : 0;
        const baseCount = (parseInt(countSpan.textContent, 10) || 0) - userVote;

        function triggerAnimation(elemento) {
            elemento.classList.remove("animating");
            void elemento.offsetWidth;
            elemento.classList.add("animating");
        }

        // Realiza a requisição assíncrona ao servidor e joga o feedback visual em tela
        async function sincronizarVotoComServidor(tipo) {
            try {
                const response = await fetch(`${APP_BASE_URL}/posts/${postId}/votar?tipo=${tipo}`, {
                    method: "PUT",
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (response.status === 401) {
                    encerrarSessaoEIrLogin("Sua sessão expirou. Faça login novamente.");
                    return;
                }

                if (response.ok) {
                    const data = await response.json();
                    countSpan.textContent = data.votos; // Alinha com o dado absoluto do MySQL
                    
                    // GATILHOS DOS TOASTS CUSTOMIZADOS COM SUCESSO E CORES DO PERFIL
                    if (tipo === "up") showToast("Voto positivo registrado!", "success");
                    else if (tipo === "down") showToast("Voto negativo registrado!", "success");
                    else if (tipo === "cancel") showToast("Voto removido.", "success");
                } else {
                    const detail = await extrairErro(response);
                    showToast(detail || "Não foi possível registrar seu voto.", "error");
                    setTimeout(() => window.location.reload(), 1000);
                }
            } catch (error) {
                console.error("Erro ao persistir voto no banco:", error);
                showToast("Erro de conexão com o servidor.", "error");
            }
        }

        upBtn.addEventListener("click", async event => {
            event.stopPropagation();
            triggerAnimation(upBtn);
            let tipoEnvio = "";
            if (userVote === 1) {
                userVote = 0;
                upBtn.classList.remove("upvoted");
                tipoEnvio = "cancel";
            } else {
                userVote = 1;
                upBtn.classList.add("upvoted");
                downBtn.classList.remove("downvoted");
                tipoEnvio = "up";
            }
            atualizarContadorVisual(countSpan, baseCount, userVote);
            await sincronizarVotoComServidor(tipoEnvio);
        });

        downBtn.addEventListener("click", async event => {
            event.stopPropagation();
            triggerAnimation(downBtn);
            let tipoEnvio = "";
            if (userVote === -1) {
                userVote = 0;
                downBtn.classList.remove("downvoted");
                tipoEnvio = "cancel";
            } else {
                userVote = -1;
                downBtn.classList.add("downvoted");
                upBtn.classList.remove("upvoted");
                tipoEnvio = "down";
            }
            atualizarContadorVisual(countSpan, baseCount, userVote);
            await sincronizarVotoComServidor(tipoEnvio);
        });
    }

    function atualizarContadorVisual(elemento, base, voto) {
        elemento.textContent = base + voto;
        if (voto === 1) {
            elemento.style.color = "#ff4d4d";
        } else if (voto === -1) {
            elemento.style.color = "#7b2ff7";
        } else {
            elemento.style.color = "#ffffff";
        }
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

    async function removerPost(postId, postCard, deleteButton) {
        showConfirmModal(
            "Excluir Publicação", 
            "Tem certeza que deseja excluir este post? Essa ação não pode ser desfeita.", 
            async () => {
                deleteButton.disabled = true;
                deleteButton.classList.add("is-loading");

                try {
                    const response = await fetch(`${APP_BASE_URL}/posts/${postId}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                    });

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
                            feedScroll.appendChild(criarMensagemFeed(activeFeedTarget === "saved" ? "Nenhum post salvo ainda." : "Nenhum post publicado ainda.", "feed-empty"));
                        }
                    }, 240);
                    showToast("Publicação deletada com sucesso.", "success");
                } catch (error) {
                    showToast(error.message || "Erro inesperado ao excluir o post.", "error");
                } finally {
                    deleteButton.disabled = false;
                    deleteButton.classList.remove("is-loading");
                }
            }
        );
    }

    async function editarPost(post, postCard, editButton) {
        const conteudoAtual = String(post.conteudo || "");
        
        showEditModal(conteudoAtual, async (conteudoLimpo) => {
            editButton.disabled = true;
            editButton.classList.add("is-loading");

            try {
                const response = await fetch(`${APP_BASE_URL}/posts/${post.id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ conteudo: conteudoLimpo }),
                });

                if (response.status === 401) {
                    encerrarSessaoEIrLogin("Sua sessão expirou. Faça login novamente.");
                    return;
                }

                if (!response.ok) {
                    const detail = await extrairErro(response);
                    throw new Error(detail || "Não foi possível editar o post.");
                }

                post.conteudo = conteudoLimpo;
                const texto = postCard.querySelector(".post-text");
                if (texto) texto.textContent = conteudoLimpo;
                showToast("Publicação atualizada com sucesso!", "success");
            } catch (error) {
                showToast(error.message || "Erro inesperado ao editar o post.", "error");
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
            const response = await fetch(`${APP_BASE_URL}/posts/${postId}/save`, {
                method,
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.status === 401) {
                encerrarSessaoEIrLogin("Sua sessão expirou. Faça login novamente.");
                return;
            }

            if (!response.ok) {
                const detail = await extrairErro(response);
                throw new Error(detail || "Não foi possível atualizar seus salvos.");
            }

            const agoraSalvo = !estaSalvo;
            saveButton.classList.toggle("is-saved", agoraSalvo);
            saveButton.title = agoraSalvo ? "Remover dos salvos" : "Salvar post";

            if (agoraSalvo) {
                showToast("Post guardado com sucesso!", "success");
            } else {
                showToast("Post removido dos guardados.", "info");
            }

            if (activeFeedTarget === "saved" && !agoraSalvo) {
                postCard.classList.add("is-removing");
                window.setTimeout(() => {
                    postCard.remove();
                    if (feedScroll && !feedScroll.querySelector(".post-card")) {
                        feedScroll.appendChild(criarMensagemFeed("Nenhum post salvo ainda.", "feed-empty"));
                    }
                }, 240);
            }
        } catch (error) {
            showToast(error.message || "Erro inesperado ao salvar o post.", "error");
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
            showToast("Texto copiado para a área de transferência!", "success");
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

    function lerImagemComoBase64(arquivo) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
            reader.readAsDataURL(arquivo);
        });
    }

    function fecharMenusAbertos() {
        document.querySelectorAll(".post-menu-wrapper.open").forEach(menu => menu.classList.remove("open"));
    }

    // --- CORREÇÃO DO REDIRECT (2.5 SEGUNDOS PARA PERMITIR LEITURA DO TOAST) ---
    function encerrarSessaoEIrLogin(mensagem = "") {
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("username");
        localStorage.removeItem("perfil");
        
        document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

        if (mensagem) {
            showToast(mensagem, "error");
        }
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
            const response = await fetch(`${APP_BASE_URL}/usuarios/busca?username=${encodeURIComponent(termo)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (requestId !== lastSearchRequestId) return;

            if (response.status === 401) {
                encerrarSessaoEIrLogin("Sua sessão expirou. Faça login novamente.");
                return;
            }

            if (!response.ok) throw new Error("Falha ao buscar usuários");

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
