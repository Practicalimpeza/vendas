async function authFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { error: text || response.statusText };
  }
  if (!response.ok) throw new Error(data.error || "Falha de autenticação.");
  return data;
}

async function authPost(path, payload) {
  return authFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

async function initAuthGate() {
  const context = await authFetch("/api/auth/me").catch(() => ({ authenticated: false, needs_bootstrap: false, modules: [] }));
  state.auth = context;
  if (context.authenticated) {
    applyAuthContext(context);
    return true;
  }
  renderAuthGate(context);
  return false;
}

function moduleLabel(key) {
  const modules = state.auth?.modules || [];
  return modules.find((item) => item.key === key)?.label || VIEW_META[key]?.label || key;
}

function userPermissions() {
  const user = state.auth?.user;
  if (!user) return new Set(Object.keys(VIEW_META));
  if (user.role === "admin") return new Set((state.auth?.modules || []).map((item) => item.key));
  return new Set(user.permissions || []);
}

function canAccessView(view) {
  if (!state.auth?.authenticated) return true;
  if (view === "services") return userPermissions().has("customers");
  return userPermissions().has(view);
}

function viewOrder() {
  return ["dashboard", "whatsapp", "quotes", "stock", "products", "customers", "opportunities", "suppliers", "pricing", "actions", "implementation", "imports", "engine", "distribution", "admin"];
}

function allowedViews() {
  return viewOrder().filter((view) => document.getElementById(view) && canAccessView(view));
}

function isSingleModuleUser() {
  return state.auth?.authenticated && allowedViews().length === 1;
}

function firstAllowedView() {
  return allowedViews()[0] || "dashboard";
}

function applyAuthContext(context) {
  state.auth = context;
  document.body.classList.remove("auth-locked");
  const gate = document.querySelector("#authGate");
  if (gate) gate.hidden = true;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.hidden = !canAccessView(button.dataset.view);
  });
  document.body.classList.toggle("single-module-user", isSingleModuleUser());
  const whatsappFloat = document.querySelector("#whatsappFloatButton");
  if (whatsappFloat) whatsappFloat.hidden = !canAccessView("whatsapp") || isSingleModuleUser();
  const importButton = document.querySelector("#topbarImportButton");
  if (importButton) importButton.hidden = !canAccessView("imports");
  renderUserMenu();
}

function renderUserMenu() {
  const actions = document.querySelector(".topbar-actions");
  if (!actions) return;
  const user = state.auth?.user;
  let menu = document.querySelector("#userMenu");
  if (!menu) {
    menu = document.createElement("div");
    actions.appendChild(menu);
  }
  menu.id = "userMenu";
  menu.className = "user-menu";
  menu.hidden = false;
  menu.innerHTML = `
    <span>${escapeHtml(user?.name || "Usuário")}</span>
    <button class="secondary-button compact" type="button" id="logoutButton" title="Sair" aria-label="Sair">
      <i data-lucide="log-out"></i>
    </button>
  `;
  menu.querySelector("#logoutButton")?.addEventListener("click", async () => {
    await authPost("/api/auth/logout", {});
    window.location.reload();
  });
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function settingsCard({ icon, title, body, action, target }) {
  return `
    <button class="settings-card" type="button" data-settings-target="${escapeAttr(target)}">
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>
        <strong>${escapeHtml(title)}</strong>
        <em>${escapeHtml(body)}</em>
      </span>
      <b>${escapeHtml(action)}</b>
    </button>
  `;
}

function openSettingsModal(options = {}) {
  const cards = [
    settingsCard({
      target: "company",
      icon: "building-2",
      title: "Empresa",
      body: "Dados cadastrais, logo, endereço e informações usadas nos documentos.",
      action: "Abrir",
    }),
    canAccessView("admin") ? settingsCard({
      target: "users",
      icon: "users-round",
      title: "Usuários e permissões",
      body: "Acessos, senhas, módulos liberados e administradores da empresa.",
      action: "Gerenciar",
    }) : "",
    options.adminOnly ? "" :
    canAccessView("imports") ? settingsCard({
      target: "imports",
      icon: "database-zap",
      title: "Dados e importações",
      body: "Fontes, planilhas, mapeamentos e leitura assistida dos dados.",
      action: "Abrir",
    }) : "",
    options.adminOnly ? "" :
    canAccessView("implementation") ? settingsCard({
      target: "implementation",
      icon: "list-checks",
      title: "Implantação",
      body: "Jornada inicial, próximos passos e estado da instalação.",
      action: "Ver",
    }) : "",
  ].filter(Boolean).join("");
  openModal(
    "Configurações",
    `
      <section class="settings-hub">
        <p>Itens administrativos ficam fora do dock para preservar a mesa de operação.</p>
        <div class="settings-grid">${cards}</div>
      </section>
    `,
    (body) => {
      body.querySelector(".settings-grid")?.addEventListener("click", (event) => {
        const target = event.target.closest("[data-settings-target]")?.dataset.settingsTarget;
        if (!target) return;
        closeModal();
        if (target === "company" && typeof openCompanyProfileModal === "function") openCompanyProfileModal();
        if (target === "users") setView("admin");
        if (target === "imports") setView("imports");
        if (target === "implementation") setView("implementation");
      });
      if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
    },
    { modalClass: "settings-modal" }
  );
}

window.openSettingsModal = openSettingsModal;

document.addEventListener("click", (event) => {
  if (!event.target.closest("#dashboardCustomizeButton")) return;
  event.preventDefault();
  openSettingsModal({ adminOnly: true });
});

function renderAuthGate(context) {
  document.body.classList.add("auth-locked");
  let gate = document.querySelector("#authGate");
  if (!gate) {
    gate = document.createElement("div");
    gate.id = "authGate";
    document.body.appendChild(gate);
  }
  gate.className = "auth-gate";
  gate.hidden = false;
  const isBootstrap = Boolean(context.needs_bootstrap);
  gate.innerHTML = `
    <section class="auth-card" aria-labelledby="authTitle">
      <div class="brand auth-brand">
        <img src="${escapeAttr(appLogoPath())}" alt="${escapeAttr(appName())}" data-app-logo />
        <div>
          <strong data-app-name>${escapeHtml(appName())}</strong>
          <span>${isBootstrap ? "Criar administrador" : "Entrar"}</span>
        </div>
      </div>
      <form id="authForm" class="auth-form">
        <h1 id="authTitle">${isBootstrap ? "Primeiro acesso" : "Acesso ao sistema"}</h1>
        ${isBootstrap ? `
          <label class="modal-field">
            <span>Nome</span>
            <input class="inline-input" id="authName" autocomplete="name" value="Administrador" />
          </label>
        ` : ""}
        <label class="modal-field">
          <span>Login</span>
          <input class="inline-input" id="authLogin" autocomplete="username" required autofocus />
        </label>
        <label class="modal-field">
          <span>Senha</span>
          <input class="inline-input" id="authPassword" type="password" autocomplete="${isBootstrap ? "new-password" : "current-password"}" required />
        </label>
        <button class="action-button" type="submit">${isBootstrap ? "Criar admin" : "Entrar"}</button>
        <div class="auth-feedback" id="authFeedback" hidden></div>
      </form>
    </section>
  `;
  gate.querySelector("#authForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const feedback = gate.querySelector("#authFeedback");
    const payload = {
      name: isBootstrap ? gate.querySelector("#authName")?.value.trim() : "",
      login_name: gate.querySelector("#authLogin")?.value.trim(),
      password: gate.querySelector("#authPassword")?.value,
    };
    try {
      if (feedback) feedback.hidden = true;
      await authPost(isBootstrap ? "/api/auth/bootstrap" : "/api/auth/login", payload);
      window.location.reload();
    } catch (error) {
      if (feedback) {
        feedback.textContent = error.message;
        feedback.hidden = false;
      }
    }
  });
}

function initAdminPanel() {
  document.querySelector("#adminNewUser")?.addEventListener("click", () => resetAdminUserForm());
  document.querySelector("#adminCancelEdit")?.addEventListener("click", () => resetAdminUserForm());
  document.querySelector("#adminUserForm")?.addEventListener("submit", saveAdminUser);
  document.querySelector("#adminUsers")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-admin-user-id]");
    if (!row) return;
    const user = state.adminUsers.find((item) => item.id === row.dataset.adminUserId);
    if (user) fillAdminUserForm(user);
  });
  document.addEventListener("nexo:viewchange", (event) => {
    if (event.detail?.view === "admin") loadAdminUsers();
  });
}

async function loadAdminUsers() {
  if (!canAccessView("admin")) return;
  const payload = await apiContract("/api/admin/users", "admin_users.v1");
  state.adminModules = payload.modules || [];
  state.adminUsers = payload.users || [];
  renderAdminUsers();
  if (!document.querySelector("#adminUserId")?.value) resetAdminUserForm();
}

function renderAdminUsers() {
  const target = document.querySelector("#adminUsers");
  if (!target) return;
  target.innerHTML = state.adminUsers.length ? state.adminUsers.map((user) => {
    const modules = (user.permissions || []).filter((key) => key !== "admin").slice(0, 4).map(moduleLabel).join(", ");
    return `
      <button class="admin-user-row" type="button" data-admin-user-id="${escapeAttr(user.id)}">
        <span>
          <strong>${escapeHtml(user.name)}</strong>
          <em>${escapeHtml(user.login_name || user.email)}</em>
        </span>
        <span class="admin-user-badges">
          <b>${user.role === "admin" ? "Admin" : "Usuário"}</b>
          <b class="${user.active ? "" : "muted"}">${user.active ? "Ativo" : "Inativo"}</b>
        </span>
        <small>${escapeHtml(modules || "Sem módulos operacionais")}</small>
      </button>
    `;
  }).join("") : `<div class="empty-state">Nenhum usu?rio cadastrado.</div>`;
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function permissionModules() {
  return (state.adminModules || state.auth?.modules || []).filter((item) => item.key !== "admin");
}

function renderPermissionGrid(selected = []) {
  const target = document.querySelector("#adminPermissionGrid");
  if (!target) return;
  const selectedSet = new Set(selected);
  target.innerHTML = permissionModules().map((item) => `
    <label>
      <input type="checkbox" value="${escapeAttr(item.key)}" ${selectedSet.has(item.key) ? "checked" : ""} />
      <span>${escapeHtml(item.label)}</span>
    </label>
  `).join("");
}

function resetAdminUserForm() {
  const form = document.querySelector("#adminUserForm");
  if (!form) return;
  form.reset();
  document.querySelector("#adminUserId").value = "";
  document.querySelector("#adminUserActive").checked = true;
  document.querySelector("#adminUserFormTitle").textContent = "Novo usu?rio";
  renderPermissionGrid(permissionModules().filter((item) => !["imports", "engine", "distribution"].includes(item.key)).map((item) => item.key));
  const feedback = document.querySelector("#adminUserFeedback");
  if (feedback) feedback.hidden = true;
}

function fillAdminUserForm(user) {
  document.querySelector("#adminUserId").value = user.id;
  document.querySelector("#adminUserName").value = user.name || "";
  document.querySelector("#adminUserLogin").value = user.login_name || user.email || "";
  document.querySelector("#adminUserEmail").value = user.email || "";
  document.querySelector("#adminUserPassword").value = "";
  document.querySelector("#adminUserIsAdmin").checked = user.role === "admin";
  document.querySelector("#adminUserActive").checked = Boolean(user.active);
  document.querySelector("#adminUserFormTitle").textContent = user.name || "Editar usu?rio";
  renderPermissionGrid(user.permissions || []);
  const feedback = document.querySelector("#adminUserFeedback");
  if (feedback) feedback.hidden = true;
}

function suggestedAdminLogin() {
  const explicitLogin = document.querySelector("#adminUserLogin").value.trim();
  if (explicitLogin) return explicitLogin;
  const email = document.querySelector("#adminUserEmail").value.trim();
  const source = email ? email.split("@")[0] : document.querySelector("#adminUserName").value.trim();
  return source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
}

async function saveAdminUser(event) {
  event.preventDefault();
  const feedback = document.querySelector("#adminUserFeedback");
  const permissions = Array.from(document.querySelectorAll("#adminPermissionGrid input:checked")).map((item) => item.value);
  const payload = {
    id: document.querySelector("#adminUserId").value,
    name: document.querySelector("#adminUserName").value.trim(),
    login_name: suggestedAdminLogin(),
    email: document.querySelector("#adminUserEmail").value.trim(),
    password: document.querySelector("#adminUserPassword").value,
    role: document.querySelector("#adminUserIsAdmin").checked ? "admin" : "member",
    active: document.querySelector("#adminUserActive").checked,
    permissions,
  };
  if (!payload.password) delete payload.password;
  try {
    const updated = requireContract(await apiPost("/api/admin/users/upsert", payload), "admin_users.v1", "/api/admin/users/upsert");
    state.adminModules = updated.modules || [];
    state.adminUsers = updated.users || [];
    renderAdminUsers();
    resetAdminUserForm();
    if (feedback) {
      feedback.textContent = "Usuário salvo.";
      feedback.hidden = false;
    }
  } catch (error) {
    if (feedback) {
      feedback.textContent = error.message;
      feedback.hidden = false;
    }
  }
}
