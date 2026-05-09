function viewLabel(view) {
  return VIEW_META[view]?.label || view;
}

function routeForView(view) {
  return VIEW_ROUTES[view] || VIEW_ROUTES.dashboard;
}

function viewFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const queryView = params.get("view");
  if (queryView && document.getElementById(queryView)) return queryView;
  const pathView = ROUTE_VIEWS[window.location.pathname];
  if (pathView && document.getElementById(pathView)) return pathView;
  return "dashboard";
}

function updateTopbar(view) {
  const meta = VIEW_META[view] || VIEW_META.dashboard;
  const profileName = companyProfileName();
  const eyebrow = document.querySelector(".eyebrow");
  const title = document.querySelector("#viewTitle");
  const subtitle = document.querySelector("#viewSubtitle");
  const question = document.querySelector("#viewQuestion");
  const next = document.querySelector("#viewNextAction");
  if (eyebrow) eyebrow.textContent = profileName || meta.eyebrow || "NexoVarejo";
  if (title) title.textContent = meta.label || viewLabel(view);
  if (subtitle) subtitle.textContent = meta.subtitle || "";
  if (question) question.textContent = meta.question || "";
  if (next) next.textContent = meta.next || "";
}

function enhanceNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    if (button.querySelector("[data-lucide]")) return;
    const label = button.textContent.trim();
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = `
      <span class="nav-label"><i data-lucide="${NAV_ICONS[button.dataset.view] || "circle"}"></i><span>${escapeHtml(label)}</span></span>
    `;
  });
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function setView(view, options = {}) {
  if (!document.getElementById(view)) view = "dashboard";
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  updateTopbar(view);
  const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
  const usesPeriod = navItem?.dataset.usesPeriod === "true";
  const selector = document.querySelector(".period-selector");
  const label = document.querySelector(".period-label");
  if (selector) selector.style.display = usesPeriod ? "" : "none";
  if (label) label.style.display = usesPeriod ? "" : "none";
  document.title = `${viewLabel(view)} | NexoVarejo`;
  if (options.updateHistory !== false) {
    const nextPath = routeForView(view);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== nextPath) window.history.pushState({ view }, "", nextPath);
  }
  document.dispatchEvent(new CustomEvent("nexo:viewchange", { detail: { view } }));
}

function renderKpis(kpis) {
  const items = [
    ["Produtos", number(kpis.products), ""],
    ["Clientes", number(kpis.customers), "blue"],
    ["Receita produtos", compactMoney(kpis.product_revenue), "green"],
    ["Receita servicos", compactMoney(kpis.service_revenue), "blue"],
    ["Estoque un.", number(kpis.stock_units), "amber"],
    ["Pendencias", number(kpis.open_tasks), ""],
  ];
  document.querySelector("#kpis").innerHTML = items
    .map(
      ([label, value, color]) => `
        <div class="kpi ${color}">
          <span><i data-lucide="${KPI_ICONS[label] || "activity"}"></i>${label}</span>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join("");
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function renderKpiGrid(selector, items) {
  document.querySelector(selector).innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color || ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function setModuleMode(config, mode) {
  const nextMode = mode === "dashboard" ? "dashboard" : "operational";
  state[config.stateKey] = nextMode;
  document.querySelectorAll(`[${config.modeAttr}]`).forEach((button) => {
    button.classList.toggle("active", button.getAttribute(config.modeAttr) === nextMode);
  });
  document.querySelector(config.operationalSelector)?.classList.toggle("active", nextMode === "operational");
  document.querySelector(config.dashboardSelector)?.classList.toggle("active", nextMode === "dashboard");
}

function insightCards(selector, items) {
  state.quickActions = state.quickActions || new Map();
  document.querySelector(selector).innerHTML = items
    .map((item) => {
      const actions = item.actions || [];
      return `
        <div class="info-card action-card">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.body)}</span>
          ${
            actions.length
              ? `<div class="quick-actions">${actions
                  .map((action) => {
                    const id = `${selector}-${state.quickActions.size + 1}`;
                    state.quickActions.set(id, action);
                    return `<button class="${action.bulk ? "secondary-button" : "text-button"}" type="button" data-quick-action="${escapeAttr(id)}">${escapeHtml(action.label)}</button>`;
                  })
                  .join("")}</div>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

function openModal(title, bodyHtml, onMount, options = {}) {
  const modal = document.querySelector(".modal");
  modal.className = ["modal", options.modalClass || ""].filter(Boolean).join(" ");
  document.querySelector("#modalTitle").textContent = title;
  document.querySelector("#modalBody").innerHTML = bodyHtml;
  document.querySelector("#modalOverlay").hidden = false;
  document.body.classList.add("modal-open");
  if (onMount) onMount(document.querySelector("#modalBody"));
}

function closeModal() {
  document.querySelector("#modalOverlay").hidden = true;
  document.querySelector("#modalBody").innerHTML = "";
  document.querySelector(".modal").className = "modal";
  document.body.classList.remove("modal-open");
}
