const APP_BASE_URL = window.getAppBaseUrl ? window.getAppBaseUrl() : window.location.origin;

document.addEventListener("DOMContentLoaded", async () => {
    const sessaoAtual = await window.SocialBitSession?.renderCurrentSession({ requireAuth: true });
    if (!sessaoAtual) return;

    const token = localStorage.getItem("token");
    const usersList = document.getElementById("admin-users-list");
    const reportsList = document.getElementById("admin-reports-list");
    const postsList = document.getElementById("admin-posts-list");
    const usersCount = document.getElementById("users-count");
    const reportsCount = document.getElementById("reports-count");
    const headerAvatar = document.getElementById("header-avatar");
    const dropdown = document.getElementById("user-dropdown");
    const logoutModal = document.getElementById("logout-modal");
    let usuarioSelecionado = null;

    configurarMenu();
    criarModalUsuario();
    carregarDados();

    function mostrarAviso(elemento, texto) {
        if (!elemento) return;
        const aviso = document.createElement("p");
        aviso.className = "admin-message";
        aviso.textContent = texto;
        elemento.prepend(aviso);
        setTimeout(() => aviso.remove(), 2500);
    }

    function configurarMenu() {
        if (headerAvatar && dropdown) {
            headerAvatar.addEventListener("click", event => {
                event.stopPropagation();
                dropdown.style.display = dropdown.style.display === "flex" ? "none" : "flex";
            });
            document.addEventListener("click", () => { dropdown.style.display = "none"; });
        }

        document.getElementById("btn-logout-trigger")?.addEventListener("click", () => {
            if (logoutModal) logoutModal.style.display = "flex";
        });
        document.getElementById("cancel-logout")?.addEventListener("click", () => {
            if (logoutModal) logoutModal.style.display = "none";
        });
        document.getElementById("confirm-logout")?.addEventListener("click", () => {
            localStorage.clear();
            document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = "/login";
        });
    }

    async function carregarDados() {
        try {
            const response = await fetch(`${APP_BASE_URL}/admin/dados`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) throw new Error("Não foi possível carregar o painel.");
            const dados = await response.json();
            renderUsuarios(dados.usuarios || []);
            renderDenuncias(dados.denuncias || []);
            renderPosts(dados.posts || []);
            if (usersCount) usersCount.textContent = `${(dados.usuarios || []).length} usuários`;
            if (reportsCount) reportsCount.textContent = `${(dados.denuncias || []).length} denúncias`;
        } catch (error) {
            if (usersList) usersList.innerHTML = "<p>Erro ao carregar usuários.</p>";
            if (reportsList) reportsList.innerHTML = "<p>Erro ao carregar denúncias.</p>";
            if (postsList) postsList.innerHTML = "<p>Erro ao carregar posts.</p>";
        }
    }

    function renderUsuarios(usuarios) {
        if (!usersList) return;
        usersList.innerHTML = "";
        if (!usuarios.length) {
            usersList.innerHTML = "<p>Nenhum usuário encontrado.</p>";
            return;
        }

        usuarios.forEach(usuario => {
            const item = document.createElement("div");
            item.className = "admin-item user-row";
            const foto = usuario.foto_url && usuario.foto_url.length > 50 ? usuario.foto_url : "/public/img/bitPerfil.png";
            item.innerHTML = `
                <div class="user-main-info">
                    <div class="admin-user-avatar" style="background-image: url('${foto}')"></div>
                    <div class="user-text">
                        <strong>@${usuario.username || "usuario"}</strong>
                        <span>${usuario.nome || ""} ${usuario.sobrenome || ""}</span>
                    </div>
                    <span class="user-email"><small>E-mail</small>${usuario.email || "sem e-mail"}</span>
                    <span class="admin-badge ${classeStatusUsuario(usuario.status_moderacao)}">${formatarStatusUsuario(usuario.status_moderacao)}</span>
                </div>
                <div class="admin-actions compact-actions icon-actions">
                    <button type="button" class="admin-icon-btn moderate-user-btn" title="Moderar usuário">
                        <i class="fa-solid fa-user-gear"></i>
                    </button>
                    <a class="admin-icon-btn" href="/perfil?id=${usuario.id}" title="Ver perfil">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </a>
                </div>
            `;
            item.querySelector(".moderate-user-btn")?.addEventListener("click", () => abrirModalUsuario(usuario));
            usersList.appendChild(item);
        });
    }

    function renderDenuncias(denuncias) {
        if (!reportsList) return;
        reportsList.innerHTML = "";
        if (!denuncias.length) {
            reportsList.innerHTML = "<p>Nenhuma denúncia enviada ainda.</p>";
            return;
        }

        denuncias.forEach(denuncia => {
            const item = document.createElement("div");
            item.className = "admin-item report-item";
            const postLink = denuncia.post_id ? `<a class="admin-post-link" href="/post/${denuncia.post_id}">Ver post</a>` : "";
            const analyzedButton = denuncia.status === "analisada" ? "" : '<button type="button" data-report-action="analisada" class="success-action">Marcar analisada</button>';
            const foto = denuncia.foto_url && denuncia.foto_url.length > 50 ? denuncia.foto_url : "/public/img/bitPerfil.png";
            item.innerHTML = `
                <div class="admin-item-head">
                    <div class="report-person">
                        <div class="admin-user-avatar" style="background-image: url('${foto}')"></div>
                        <div>
                        <strong>${denuncia.categoria}</strong>
                            <span>Denunciado por @${denuncia.username} - ${denuncia.email || "sem e-mail"}</span>
                            <span>${formatarData(denuncia.data_criacao)}</span>
                        </div>
                    </div>
                    <span class="admin-badge ${classeStatusDenuncia(denuncia.status)}">${formatarStatusDenuncia(denuncia.status)}</span>
                </div>
                <div class="admin-detail-grid">
                    <div>
                        <span class="detail-label">Detalhes da denúncia</span>
                        <p>${denuncia.detalhes || "Sem detalhes enviados."}</p>
                    </div>
                    <div>
                        <span class="detail-label">Post denunciado</span>
                        <p>${denuncia.post_texto || "Post removido ou vazio."}</p>
                    </div>
                    <div>
                        <span class="detail-label">Votos do post</span>
                        <p>${denuncia.post_votos || 0}</p>
                    </div>
                    <div>
                        <span class="detail-label">ID da denúncia</span>
                        <p>#${denuncia.id}</p>
                    </div>
                </div>
                <div class="admin-actions">
                    ${postLink}
                    ${analyzedButton}
                    ${denuncia.post_id ? '<button type="button" data-report-action="remover-post" class="danger-action">Remover post</button>' : ""}
                </div>
            `;
            item.querySelector('[data-report-action="analisada"]')?.addEventListener("click", () => atualizarDenuncia(denuncia.id, "analisada"));
            const removePostButton = item.querySelector('[data-report-action="remover-post"]');
            removePostButton?.addEventListener("click", () => removerPostDenunciado(denuncia.post_id, removePostButton));
            reportsList.appendChild(item);
        });
    }

    function renderPosts(posts) {
        if (!postsList) return;
        postsList.innerHTML = "";
        if (!posts.length) {
            postsList.innerHTML = "<p>Nenhum post recente.</p>";
            return;
        }

        posts.forEach(post => {
            const item = document.createElement("div");
            item.className = "admin-item compact post-history-item";
            const foto = post.foto_url && post.foto_url.length > 50 ? post.foto_url : "/public/img/bitPerfil.png";
            item.innerHTML = `
                <div class="admin-item-head">
                    <div class="report-person">
                        <div class="admin-user-avatar" style="background-image: url('${foto}')"></div>
                        <div>
                        <strong>@${post.username}</strong>
                            <span>${post.email || "sem e-mail"}</span>
                        </div>
                    </div>
                    <span class="admin-badge status-shadow">${formatarData(post.data_criacao)}</span>
                </div>
                <p>${post.conteudo || "Post sem texto."}</p>
                <div class="post-history-meta">
                    <span>ID do post: #${post.id}</span>
                    <span>Votos: ${post.votos || 0}</span>
                </div>
                <div class="admin-actions">
                    <a class="admin-post-link" href="/post/${post.id}">Ver post</a>
                </div>
            `;
            postsList.appendChild(item);
        });
    }

    function formatarData(value) {
        if (!value) return "data não informada";
        const partes = String(value).replace("T", " ").split(" ");
        if (partes.length < 2) return value;
        const data = partes[0].split("-");
        const hora = partes[1].split(":");
        if (data.length < 3 || hora.length < 2) return value;
        return `${data[2]}/${data[1]}/${data[0]} ${hora[0]}:${hora[1]}`;
    }

    function formatarStatusUsuario(status) {
        const nomes = {
            ativo: "Ativo",
            ban_temporario: "Ban temporário",
            ban_permanente: "Ban permanente",
            shadowban: "Shadowban"
        };
        return nomes[status] || "Ativo";
    }

    function formatarStatusDenuncia(status) {
        const nomes = {
            pendente: "Pendente",
            analisada: "Analisada",
            post_removido: "Post removido"
        };
        return nomes[status] || "Pendente";
    }

    function classeStatusUsuario(status) {
        if (status === "ativo") return "status-ok";
        if (status === "shadowban") return "status-shadow";
        if (status === "ban_temporario") return "status-warning";
        if (status === "ban_permanente") return "status-danger";
        return "status-ok";
    }

    function classeStatusDenuncia(status) {
        if (status === "analisada") return "status-ok";
        if (status === "post_removido") return "status-danger";
        return "status-warning";
    }

    async function moderarUsuario(usuarioId, acao) {
        try {
            const response = await fetch(`${APP_BASE_URL}/admin/usuarios/${usuarioId}/moderacao`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ acao })
            });
            if (!response.ok) throw new Error("Erro ao moderar usuário.");
            await carregarDados();
            mostrarAviso(usersList, "Usuário atualizado.");
        } catch (error) {
            mostrarAviso(usersList, "Não foi possível atualizar o usuário.");
        }
    }

    function criarModalUsuario() {
        if (document.getElementById("user-moderation-modal")) return;
        const modal = document.createElement("div");
        modal.id = "user-moderation-modal";
        modal.className = "admin-modal-overlay";
        modal.style.display = "none";
        modal.innerHTML = `
            <div class="admin-user-modal">
                <div class="admin-modal-head">
                    <div>
                        <span>Moderação</span>
                        <h2 id="modal-user-title">Usuário</h2>
                        <p id="modal-user-email">Escolha uma ação para esta conta.</p>
                    </div>
                    <button type="button" id="close-user-modal" class="admin-icon-btn" title="Fechar">x</button>
                </div>
                <div class="admin-modal-actions">
                    <button type="button" data-modal-action="ban_temporario" class="warning-action">
                        <strong>Ban temporário</strong>
                        <span>Bloqueia o login por enquanto.</span>
                    </button>
                    <button type="button" data-modal-action="ban_permanente" class="danger-action">
                        <strong>Ban permanente</strong>
                        <span>Bloqueia o login da conta.</span>
                    </button>
                    <button type="button" data-modal-action="shadowban" class="shadow-action">
                        <strong>Bloquear comentários</strong>
                        <span>Visualiza o site, mas não posta nem comenta.</span>
                    </button>
                    <button type="button" data-modal-action="ativo" class="success-action">
                        <strong>Liberar usuário</strong>
                        <span>Remove banimentos e shadowban.</span>
                    </button>
                    <button type="button" data-modal-action="delete" class="danger-action delete-user-action">
                        <strong>Deletar usuário</strong>
                        <span>Remove a conta do sistema.</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector("#close-user-modal")?.addEventListener("click", fecharModalUsuario);
        modal.querySelectorAll("[data-modal-action]").forEach(button => {
            button.addEventListener("click", () => executarAcaoUsuario(button.dataset.modalAction));
        });
    }

    function abrirModalUsuario(usuario) {
        usuarioSelecionado = usuario;
        const modal = document.getElementById("user-moderation-modal");
        if (!modal) return;
        document.getElementById("modal-user-title").textContent = `@${usuario.username || "usuario"}`;
        document.getElementById("modal-user-email").textContent = usuario.email || "sem e-mail";
        modal.style.display = "flex";
    }

    function fecharModalUsuario() {
        const modal = document.getElementById("user-moderation-modal");
        if (modal) modal.style.display = "none";
        usuarioSelecionado = null;
    }

    async function executarAcaoUsuario(acao) {
        if (!usuarioSelecionado) return;
        if (acao === "delete") {
            await deletarUsuario(usuarioSelecionado.id);
        } else {
            await moderarUsuario(usuarioSelecionado.id, acao);
        }
        fecharModalUsuario();
    }

    async function deletarUsuario(usuarioId) {
        try {
            const response = await fetch(`${APP_BASE_URL}/usuarios/${usuarioId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Erro ao deletar usuário.");
            await carregarDados();
            mostrarAviso(usersList, "Usuário deletado.");
        } catch (error) {
            mostrarAviso(usersList, "Não foi possível deletar o usuário.");
        }
    }

    async function atualizarDenuncia(denunciaId, status) {
        try {
            const response = await fetch(`${APP_BASE_URL}/admin/denuncias/${denunciaId}/status`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });
            if (!response.ok) throw new Error("Erro ao atualizar denúncia.");
            await carregarDados();
            mostrarAviso(reportsList, "Denúncia atualizada.");
        } catch (error) {
            mostrarAviso(reportsList, "Não foi possível atualizar a denúncia.");
        }
    }

    async function removerPostDenunciado(postId, button) {
        if (!postId) return;
        if (button) button.disabled = true;
        try {
            const response = await fetch(`${APP_BASE_URL}/posts/${postId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.detail || "Erro ao remover post.");
            }
            await carregarDados();
            mostrarAviso(reportsList, "Post removido.");
        } catch (error) {
            mostrarAviso(reportsList, error.message || "Não foi possível remover o post.");
            if (button) button.disabled = false;
        }
    }
});