const APP_BASE_URL = window.getAppBaseUrl ? window.getAppBaseUrl() : window.location.origin;

function resolvePostId() {
    const fromData = document.querySelector(".post-page-main")?.dataset.postId;
    if (fromData) return fromData;

    const match = window.location.pathname.match(/\/post\/(\d+)/);
    return match ? match[1] : null;
}

const showToast = (message, type = "success") => {
    let container = document.getElementById("notification-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "notification-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type} show`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
    }, 3000);
};

document.addEventListener("DOMContentLoaded", async () => {
    const sessaoAtual = await window.SocialBitSession?.renderCurrentSession({ requireAuth: false });

    const token = localStorage.getItem("token");
    const loggedUserId = Number(sessaoAtual?.id || localStorage.getItem("userId") || 0);
    const loggedRole = String(sessaoAtual?.perfil || localStorage.getItem("perfil") || "").toLowerCase();
    const isAdmin = loggedRole === "admin";
    const postId = resolvePostId();
    const postDetail = document.getElementById("post-detail");
    const commentList = document.getElementById("comment-list");
    const commentForm = document.getElementById("main-comment-form");
    const commentInput = document.getElementById("main-comment-input");
    const commentImageInput = document.getElementById("main-comment-image");
    const commentImageName = document.getElementById("main-comment-image-name");
    const cancelMainComment = document.getElementById("cancel-main-comment");
    const headerAvatar = document.getElementById("header-avatar");
    const dropdown = document.getElementById("user-dropdown");
    const logoutModal = document.getElementById("logout-modal");

    if (!postId || !postDetail || !commentList) return;
    let commentImageBase64 = "";

    configurarMenu();
    await carregarPost();
    await carregarComentarios();

    if (commentForm && commentInput) {
        commentInput.addEventListener("focus", () => {
            commentForm.classList.add("is-active");
        });

        commentForm.addEventListener("submit", async event => {
            event.preventDefault();
            const texto = commentInput.value.trim();
            if (!texto && !commentImageBase64) {
                showToast("Escreva um comentario ou escolha uma imagem.", "error");
                return;
            }
            const enviado = await enviarComentario(texto, null, commentImageBase64);
            if (enviado) limparComentarioPrincipal();
        });
    }

    if (commentImageInput) {
        commentImageInput.addEventListener("change", async () => {
            const arquivo = commentImageInput.files && commentImageInput.files[0];
            if (!arquivo) {
                commentImageBase64 = "";
                if (commentImageName) commentImageName.textContent = "";
                return;
            }
            commentImageBase64 = await lerImagemComoBase64(arquivo);
            if (commentImageName) commentImageName.textContent = arquivo.name;
        });
    }

    if (cancelMainComment) {
        cancelMainComment.addEventListener("click", () => limparComentarioPrincipal());
    }

    function limparComentarioPrincipal() {
        if (commentInput) commentInput.value = "";
        if (commentImageInput) commentImageInput.value = "";
        if (commentImageName) commentImageName.textContent = "";
        if (commentForm) commentForm.classList.remove("is-active");
        commentImageBase64 = "";
    }

    function configurarMenu() {
        if (headerAvatar && dropdown) {
            headerAvatar.addEventListener("click", event => {
                event.stopPropagation();
                dropdown.style.display = dropdown.style.display === "flex" ? "none" : "flex";
            });
            document.addEventListener("click", () => { dropdown.style.display = "none"; });
        }

        document.addEventListener("click", fecharMenusPost);

        document.getElementById("btn-logout-trigger")?.addEventListener("click", () => {
            if (logoutModal) logoutModal.style.display = "flex";
        });
        document.getElementById("cancel-logout")?.addEventListener("click", () => {
            if (logoutModal) logoutModal.style.display = "none";
        });
        document.getElementById("confirm-logout")?.addEventListener("click", () => encerrarSessaoEIrLogin());
    }

    async function carregarPost() {
        try {
            const response = await fetch(`${APP_BASE_URL}/posts/${postId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.status === 401) {
                encerrarSessaoEIrLogin("Sua sessao expirou. Faca login novamente.");
                return;
            }

            if (!response.ok) throw new Error("Post nao encontrado.");
            const post = await response.json();
            renderizarPost(post);
        } catch (error) {
            postDetail.innerHTML = '<p class="post-detail-loading">Erro ao carregar post.</p>';
        }
    }

    function renderizarPost(post) {
        postDetail.innerHTML = "";

        const header = document.createElement("header");
        header.className = "post-detail-header";

        const avatar = document.createElement("div");
        avatar.className = "post-detail-avatar";
        const foto = post.foto_url && post.foto_url.length > 50 ? post.foto_url : "/public/img/bitPerfil.png";
        avatar.style.backgroundImage = `url('${foto}')`;
        avatar.addEventListener("click", () => {
            window.location.href = `/perfil?id=${post.usuario_id}`;
        });

        const userBox = document.createElement("div");
        userBox.className = "post-detail-user";

        const username = document.createElement("span");
        username.className = "post-detail-username";
        username.textContent = formatUsername(post.username);
        username.addEventListener("click", () => {
            window.location.href = `/perfil?id=${post.usuario_id}`;
        });

        const data = document.createElement("span");
        data.className = "post-detail-date";
        data.textContent = formatarData(post.data_criacao);

        const texto = document.createElement("p");
        texto.className = "post-detail-text";
        texto.textContent = post.conteudo || "";

        userBox.appendChild(username);
        userBox.appendChild(data);

        const headerActions = document.createElement("div");
        headerActions.className = "post-detail-actions";
        headerActions.appendChild(criarMenuPost(post, texto));

        header.appendChild(avatar);
        header.appendChild(userBox);
        header.appendChild(headerActions);

        const footer = document.createElement("footer");
        footer.className = "post-detail-footer";

        const votos = document.createElement("div");
        votos.className = "post-votes";
        votos.innerHTML = [
            `<div class="vote-arrow upvote ${post.voto === 1 ? "upvoted" : ""}" aria-label="Upvote"></div>`,
            `<span class="vote-count" style="color: ${post.voto === 1 ? "#ff4d4d" : post.voto === -1 ? "#7b2ff7" : "#ffffff"}">${post.votos || 0}</span>`,
            `<div class="vote-arrow downvote ${post.voto === -1 ? "downvoted" : ""}" aria-label="Downvote"></div>`
        ].join("");

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "post-action-btn save-flag-btn";
        saveButton.title = post.salvo ? "Remover dos salvos" : "Salvar post";
        if (post.salvo) saveButton.classList.add("is-saved");
        saveButton.innerHTML = "&#9873;";
        saveButton.addEventListener("click", () => alternarPostSalvo(saveButton));

        footer.appendChild(votos);
        footer.appendChild(saveButton);

        postDetail.appendChild(header);
        postDetail.appendChild(texto);
        if (post.imagem_url) {
            const imagem = document.createElement("img");
            imagem.className = "post-detail-image";
            imagem.src = post.imagem_url;
            imagem.alt = "Imagem do post";
            postDetail.appendChild(imagem);
        }
        postDetail.appendChild(footer);
        configurarVotacaoPost();
    }

    function criarMenuPost(post, textoElemento) {
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
        reportAction.addEventListener("click", event => {
            event.stopPropagation();
            menuWrapper.classList.remove("open");
            abrirModalDenuncia(post.id);
        });
        menuContent.appendChild(reportAction);

        if (isOwner) {
            const editAction = document.createElement("button");
            editAction.type = "button";
            editAction.className = "post-menu-item";
            editAction.innerHTML = '<span class="menu-item-icon">✎</span><span>Editar</span>';
            editAction.addEventListener("click", event => {
                event.stopPropagation();
                menuWrapper.classList.remove("open");
                abrirModalEditarPost(post, textoElemento);
            });
            menuContent.appendChild(editAction);
        }

        if (canDelete) {
            const deleteAction = document.createElement("button");
            deleteAction.type = "button";
            deleteAction.className = "post-menu-item danger";
            deleteAction.innerHTML = '<span class="menu-item-icon">x</span><span>Excluir</span>';
            deleteAction.addEventListener("click", event => {
                event.stopPropagation();
                menuWrapper.classList.remove("open");
                removerPost(post.id, deleteAction);
            });
            menuContent.appendChild(deleteAction);
        }

        menuTrigger.addEventListener("click", event => {
            event.stopPropagation();
            const vaiAbrir = !menuWrapper.classList.contains("open");
            fecharMenusPost();
            menuWrapper.classList.toggle("open", vaiAbrir);
        });
        menuContent.addEventListener("click", event => event.stopPropagation());

        menuWrapper.appendChild(menuTrigger);
        menuWrapper.appendChild(menuContent);
        return menuWrapper;
    }

    function fecharMenusPost() {
        document.querySelectorAll(".post-menu-wrapper.open").forEach(menu => menu.classList.remove("open"));
    }

    function abrirModalDenuncia(postIdAtual) {
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.style.display = "flex";
        modal.innerHTML = `
            <div class="modal-content report-modal-content">
                <h3>Denunciar post</h3>
                <p>Escolha o motivo da denúncia.</p>
                <select id="report-category" class="report-select">
                    <option value="">Selecione uma categoria</option>
                    <option value="Spam ou autopromoção">Spam ou autopromoção</option>
                    <option value="Ódio, assédio ou discriminação">Ódio, assédio ou discriminação</option>
                    <option value="Conteúdo ofensivo">Conteúdo ofensivo</option>
                    <option value="Código malicioso ou phishing">Código malicioso ou phishing</option>
                    <option value="Vazamento de dados ou informação privada">Vazamento de dados ou informação privada</option>
                    <option value="Desinformação técnica perigosa">Desinformação técnica perigosa</option>
                </select>
                <textarea id="report-details" class="report-textarea" maxlength="500" placeholder="Explique rapidamente o problema..."></textarea>
                <div class="modal-actions">
                    <button type="button" class="btn-cancel id-cancel">Cancelar</button>
                    <button type="button" class="btn-confirm id-send">Enviar denúncia</button>
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
                const response = await fetch(`${APP_BASE_URL}/posts/${postIdAtual}/denunciar`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ categoria, detalhes })
                });
                if (!response.ok) {
                    const detail = await extrairErro(response);
                    throw new Error(detail || "Não foi possível enviar a denúncia.");
                }
                modal.remove();
                showToast("Denúncia enviada para a moderação.", "success");
            } catch (error) {
                showToast(error.message || "Erro ao denunciar.", "error");
            }
        });
    }

    function abrirModalEditarPost(post, textoElemento) {
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.style.display = "flex";
        modal.innerHTML = `
            <div class="modal-content post-edit-modal">
                <h3>Editar post</h3>
                <textarea id="edit-post-text" maxlength="500" class="report-textarea">${escapeHtml(post.conteudo || "")}</textarea>
                <div class="modal-actions">
                    <button type="button" class="btn-cancel id-cancel">Cancelar</button>
                    <button type="button" class="btn-confirm id-save">Salvar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const input = modal.querySelector("#edit-post-text");
        input.focus();

        modal.querySelector(".id-cancel").addEventListener("click", () => modal.remove());
        modal.addEventListener("click", event => {
            if (event.target === modal) modal.remove();
        });
        modal.querySelector(".id-save").addEventListener("click", async () => {
            const conteudo = input.value.trim();
            if (!conteudo) {
                showToast("O post não pode ficar vazio.", "error");
                return;
            }

            try {
                const response = await fetch(`${APP_BASE_URL}/posts/${post.id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ conteudo })
                });
                if (!response.ok) {
                    const detail = await extrairErro(response);
                    throw new Error(detail || "Não foi possível editar o post.");
                }
                post.conteudo = conteudo;
                textoElemento.textContent = conteudo;
                modal.remove();
                showToast("Post atualizado com sucesso.", "success");
            } catch (error) {
                showToast(error.message || "Erro ao editar post.", "error");
            }
        });
    }

    async function removerPost(postIdAtual, deleteButton) {
        if (!confirm("Tem certeza que deseja excluir este post?")) return;
        deleteButton.disabled = true;
        try {
            const response = await fetch(`${APP_BASE_URL}/posts/${postIdAtual}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) {
                const detail = await extrairErro(response);
                throw new Error(detail || "Não foi possível excluir o post.");
            }
            showToast("Post excluído com sucesso.", "success");
            setTimeout(() => { window.location.href = "/home"; }, 700);
        } catch (error) {
            showToast(error.message || "Erro ao excluir post.", "error");
            deleteButton.disabled = false;
        }
    }

    function configurarVotacaoPost() {
        const upBtn = postDetail.querySelector(".upvote");
        const downBtn = postDetail.querySelector(".downvote");
        const countSpan = postDetail.querySelector(".vote-count");
        if (!upBtn || !downBtn || !countSpan) return;

        let userVote = upBtn.classList.contains("upvoted") ? 1 : downBtn.classList.contains("downvoted") ? -1 : 0;
        const baseCount = (parseInt(countSpan.textContent, 10) || 0) - userVote;

        upBtn.addEventListener("click", async () => {
            if (userVote === 1) {
                userVote = 0;
                upBtn.classList.remove("upvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizarVotoPost("cancel", countSpan);
            } else {
                userVote = 1;
                upBtn.classList.add("upvoted");
                downBtn.classList.remove("downvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizarVotoPost("up", countSpan);
            }
        });

        downBtn.addEventListener("click", async () => {
            if (userVote === -1) {
                userVote = 0;
                downBtn.classList.remove("downvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizarVotoPost("cancel", countSpan);
            } else {
                userVote = -1;
                downBtn.classList.add("downvoted");
                upBtn.classList.remove("upvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizarVotoPost("down", countSpan);
            }
        });
    }

    async function sincronizarVotoPost(tipo, countSpan) {
        try {
            const response = await fetch(`${APP_BASE_URL}/posts/${postId}/votar?tipo=${tipo}`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Nao foi possivel votar.");
            const data = await response.json();
            countSpan.textContent = data.votos;
        } catch (error) {
            showToast(error.message || "Erro ao votar.", "error");
        }
    }

    async function alternarPostSalvo(saveButton) {
        const estaSalvo = saveButton.classList.contains("is-saved");
        const method = estaSalvo ? "DELETE" : "POST";

        try {
            const response = await fetch(`${APP_BASE_URL}/posts/${postId}/save`, {
                method,
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Nao foi possivel atualizar salvos.");
            saveButton.classList.toggle("is-saved", !estaSalvo);
            saveButton.title = !estaSalvo ? "Remover dos salvos" : "Salvar post";
        } catch (error) {
            showToast(error.message || "Erro ao salvar post.", "error");
        }
    }

    async function carregarComentarios() {
        commentList.innerHTML = '<p class="comments-message">Carregando comentarios...</p>';
        try {
            const response = await fetch(`${APP_BASE_URL}/posts/${postId}/comentarios`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Nao foi possivel carregar comentarios.");
            const comentarios = await response.json();
            renderizarComentarios(Array.isArray(comentarios) ? comentarios : []);
        } catch (error) {
            commentList.innerHTML = '<p class="comments-message">Erro ao carregar comentarios.</p>';
        }
    }

    function renderizarComentarios(comentarios) {
        commentList.innerHTML = "";
        if (!comentarios.length) {
            commentList.innerHTML = '<p class="comments-message">Nenhum comentario ainda.</p>';
            return;
        }

        const porPai = {};
        comentarios.forEach(comentario => {
            const pai = comentario.comentario_pai_id || 0;
            if (!porPai[pai]) porPai[pai] = [];
            porPai[pai].push(comentario);
        });

        (porPai[0] || []).forEach(comentario => {
            commentList.appendChild(criarComentarioItem(comentario, porPai));
        });
    }

    function criarComentarioItem(comentario, porPai) {
        const item = document.createElement("article");
        item.className = "comment-item";
        item.dataset.commentId = String(comentario.id);

        const linha = document.createElement("div");
        linha.className = "comment-line";

        const corpo = document.createElement("div");
        corpo.className = "comment-body";

        const meta = document.createElement("div");
        meta.className = "comment-meta";

        const avatar = document.createElement("div");
        avatar.className = "comment-avatar";
        const foto = comentario.foto_url && comentario.foto_url.length > 50 ? comentario.foto_url : "/public/img/bitPerfil.png";
        avatar.style.backgroundImage = `url('${foto}')`;
        avatar.addEventListener("click", () => {
            window.location.href = `/perfil?id=${comentario.usuario_id}`;
        });

        const autor = document.createElement("strong");
        autor.className = "comment-author";
        autor.textContent = formatUsername(comentario.username);
        autor.addEventListener("click", () => {
            window.location.href = `/perfil?id=${comentario.usuario_id}`;
        });

        meta.appendChild(avatar);
        meta.appendChild(autor);

        const dataComentario = document.createElement("span");
        dataComentario.className = "comment-date";
        dataComentario.textContent = formatarData(comentario.data_criacao);
        meta.appendChild(dataComentario);

        const texto = document.createElement("p");
        texto.className = "comment-text";
        texto.textContent = comentario.texto || "";

        let imagemComentario = null;
        if (comentario.imagem_url) {
            imagemComentario = document.createElement("img");
            imagemComentario.className = "comment-image-preview";
            imagemComentario.src = comentario.imagem_url;
            imagemComentario.alt = "Imagem do comentario";
        }

        const acoes = document.createElement("div");
        acoes.className = "comment-actions-row";

        const votos = document.createElement("div");
        votos.className = "comment-votes";
        votos.innerHTML = [
            `<div class="vote-arrow comment-upvote ${comentario.voto === 1 ? "upvoted" : ""}" aria-label="Upvote"></div>`,
            `<span class="comment-vote-count" style="color: ${comentario.voto === 1 ? "#ff4d4d" : comentario.voto === -1 ? "#7b2ff7" : "#ffffff"}">${comentario.votos || 0}</span>`,
            `<div class="vote-arrow comment-downvote ${comentario.voto === -1 ? "downvoted" : ""}" aria-label="Downvote"></div>`
        ].join("");

        const responder = document.createElement("button");
        responder.type = "button";
        responder.className = "comment-reply-btn";
        responder.textContent = "Responder";

        const respostaForm = document.createElement("form");
        respostaForm.className = "comment-form reply-form is-hidden";
        respostaForm.innerHTML = `
            <textarea class="comment-input" maxlength="500" placeholder="Responder comentário..."></textarea>
                <input type="file" accept="image/*" class="comment-file reply-image-input">
                <div class="comment-image-name reply-image-name"></div>
                <div class="comment-form-actions">
                <button type="button" class="comment-image-btn reply-image-btn" title="Adicionar imagem"><span class="image-icon"></span></button>
                <button type="button" class="comment-cancel-btn reply-cancel-btn" title="Cancelar">x</button>
                <button type="submit" class="comment-send-btn" title="Enviar">&gt;</button>
            </div>
        `;
        let replyImageBase64 = "";

        responder.addEventListener("click", () => {
            const vaiAbrir = respostaForm.classList.contains("is-hidden");
            document.querySelectorAll(".reply-form").forEach(form => {
                if (form !== respostaForm) form.classList.add("is-hidden");
            });
            respostaForm.classList.toggle("is-hidden", !vaiAbrir);
            if (vaiAbrir) respostaForm.querySelector("textarea")?.focus();
        });

        const replyImageInput = respostaForm.querySelector(".reply-image-input");
        const replyImageName = respostaForm.querySelector(".reply-image-name");
        respostaForm.querySelector(".reply-image-btn")?.addEventListener("click", () => replyImageInput?.click());
        respostaForm.querySelector(".reply-cancel-btn")?.addEventListener("click", () => {
            respostaForm.classList.add("is-hidden");
            respostaForm.querySelector("textarea").value = "";
            if (replyImageInput) replyImageInput.value = "";
            if (replyImageName) replyImageName.textContent = "";
            replyImageBase64 = "";
        });
        replyImageInput?.addEventListener("change", async () => {
            const arquivo = replyImageInput.files && replyImageInput.files[0];
            if (!arquivo) {
                replyImageBase64 = "";
                if (replyImageName) replyImageName.textContent = "";
                return;
            }
            replyImageBase64 = await lerImagemComoBase64(arquivo);
            if (replyImageName) replyImageName.textContent = arquivo.name;
        });

        respostaForm.addEventListener("submit", async event => {
            event.preventDefault();
            const input = respostaForm.querySelector("textarea");
            const textoResposta = input.value.trim();
            if (!textoResposta && !replyImageBase64) {
                showToast("Escreva uma resposta ou escolha uma imagem.", "error");
                return;
            }
            const enviado = await enviarComentario(textoResposta, comentario.id, replyImageBase64);
            if (enviado) {
                respostaForm.classList.add("is-hidden");
                input.value = "";
                if (replyImageInput) replyImageInput.value = "";
                if (replyImageName) replyImageName.textContent = "";
                replyImageBase64 = "";
            }
        });

        acoes.appendChild(votos);
        acoes.appendChild(responder);

        corpo.appendChild(meta);
        corpo.appendChild(texto);
        if (imagemComentario) corpo.appendChild(imagemComentario);
        corpo.appendChild(acoes);
        corpo.appendChild(respostaForm);
        linha.appendChild(corpo);
        item.appendChild(linha);

        configurarVotacaoComentario(item);

        (porPai[comentario.id] || []).forEach(filho => {
            item.appendChild(criarComentarioItem(filho, porPai));
        });

        return item;
    }

    async function enviarComentario(texto, comentarioPaiId, imagemUrl) {
        try {
            const response = await fetch(`${APP_BASE_URL}/posts/${postId}/comentarios`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ texto, comentario_pai_id: comentarioPaiId, imagem_url: imagemUrl || "" })
            });
            if (!response.ok) {
                const detail = await extrairErro(response);
                throw new Error(detail || "Nao foi possivel comentar.");
            }
            await carregarComentarios();
            showToast("Comentario enviado!", "success");
            return true;
        } catch (error) {
            showToast(error.message || "Erro ao comentar.", "error");
            return false;
        }
    }

    async function extrairErro(response) {
        try {
            const data = await response.json();
            return data.detail || "";
        } catch (error) {
            return "";
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

        upBtn.addEventListener("click", async () => {
            if (userVote === 1) {
                userVote = 0;
                upBtn.classList.remove("upvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizarVotoComentario(comentarioId, "cancel", countSpan);
            } else {
                userVote = 1;
                upBtn.classList.add("upvoted");
                downBtn.classList.remove("downvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizarVotoComentario(comentarioId, "up", countSpan);
            }
        });

        downBtn.addEventListener("click", async () => {
            if (userVote === -1) {
                userVote = 0;
                downBtn.classList.remove("downvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizarVotoComentario(comentarioId, "cancel", countSpan);
            } else {
                userVote = -1;
                downBtn.classList.add("downvoted");
                upBtn.classList.remove("upvoted");
                atualizarContadorVisual(countSpan, baseCount, userVote);
                await sincronizarVotoComentario(comentarioId, "down", countSpan);
            }
        });
    }

    async function sincronizarVotoComentario(comentarioId, tipo, countSpan) {
        try {
            const response = await fetch(`${APP_BASE_URL}/comentarios/${comentarioId}/votar?tipo=${tipo}`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Nao foi possivel votar no comentario.");
            const data = await response.json();
            countSpan.textContent = data.votos;
        } catch (error) {
            showToast(error.message || "Erro ao votar no comentario.", "error");
        }
    }

    function atualizarContadorVisual(elemento, base, voto) {
        elemento.textContent = base + voto;
        if (voto === 1) elemento.style.color = "#ff4d4d";
        else if (voto === -1) elemento.style.color = "#7b2ff7";
        else elemento.style.color = "#ffffff";
    }

    function formatUsername(value) {
        const nome = String(value || "usuario").trim().replace(/^@+/, "") || "usuario";
        return `@${nome}`;
    }

    function formatarData(value) {
        if (!value) return "Data nao informada";
        const partes = String(value).replace("T", " ").split(" ");
        if (partes.length < 2) return value;

        const data = partes[0].split("-");
        const hora = partes[1].split(":");
        if (data.length < 3 || hora.length < 2) return value;

        return `${data[2]}/${data[1]}/${data[0]} ${hora[0]}:${hora[1]}`;
    }

    function lerImagemComoBase64(arquivo) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
            reader.readAsDataURL(arquivo);
        });
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function encerrarSessaoEIrLogin(mensagem = "") {
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("username");
        localStorage.removeItem("perfil");
        document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        if (mensagem) showToast(mensagem, "error");
    }
});