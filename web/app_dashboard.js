function aggregateMap(rows = [], key, valueKey, fallback = "Sem classificação") {
  const map = new Map();
  rows.forEach((row) => {
    const label = row[key] || fallback;
    map.set(label, (map.get(label) || 0) + Number(row[valueKey] || 0));
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

const DASHBOARD_LAYOUT_KEY = "pulso.dashboard.layout.v14";
const DASHBOARD_LEGACY_LAYOUT_KEY = "pulso.dashboard.layout.v0";
const DASHBOARD_BASE_VISIBLE_KEY = "pulso.dashboard.base.visible";
const DASHBOARD_BLOCK_DEFS = [
  { key: "pulso", label: "Pulso" },
  { key: "mesa", label: "Mesa" },
  { key: "potencial", label: "Potencial" },
  { key: "analises", label: "Análises" },
  { key: "ferramentas", label: "Ferramentas" },
  { key: "trilhas", label: "Trilhas" },
  { key: "implantacao", label: "Implantação" },
];
const DASHBOARD_BLOCK_KEYS = DASHBOARD_BLOCK_DEFS.map((item) => item.key);
const DASHBOARD_BLOCK_LABELS = new Map(DASHBOARD_BLOCK_DEFS.map((item) => [item.key, item.label]));
const DASHBOARD_SIZE_LABELS = {
  compact: "Foco",
  medium: "Normal",
  large: "Aberto",
};
const DASHBOARD_COCKPIT_WIDGET_KEY = "pulso.dashboard.cockpit.widgets.v1";
const DASHBOARD_COCKPIT_WIDGETS = [
  { key: "receita", label: "Receita", detail: "Série temporal", type: "Gráfico" },
  { key: "indicadores", label: "Indicadores", detail: "Matriz executiva", type: "KPIs" },
  { key: "mix", label: "Mix", detail: "Produtos x serviços", type: "Gráfico" },
  { key: "estoque-status", label: "Estoque", detail: "Cobertura e posição", type: "Gráfico" },
  { key: "margem-status", label: "Margem", detail: "Distribuição por status", type: "Gráfico" },
  { key: "produtos-abc", label: "Curva ABC", detail: "Produtos por receita", type: "Gráfico" },
  { key: "clientes", label: "Clientes", detail: "Concentração e ticket", type: "Gráfico" },
  { key: "fornecedores", label: "Compras", detail: "Fornecedores e mínimos", type: "Gráfico" },
  { key: "estoque-cobertura", label: "Estoque", detail: "Produtos por cobertura", type: "Tabela" },
  { key: "margem-cmv", label: "Margem", detail: "Produtos por CMV", type: "Tabela" },
  { key: "servicos", label: "Serviços", detail: "Receita por serviço", type: "Gráfico" },
  { key: "dados", label: "Dados importados", detail: "Cobertura por módulo", type: "Gráfico" },
];
const DASHBOARD_COCKPIT_WIDGET_KEYS = DASHBOARD_COCKPIT_WIDGETS.map((item) => item.key);
const DASHBOARD_COCKPIT_WIDGET_BY_KEY = new Map(DASHBOARD_COCKPIT_WIDGETS.map((item) => [item.key, item]));
const DASHBOARD_COCKPIT_PERIOD_KEY = "pulso.dashboard.cockpit.periods.v1";
let dashboardCockpitExpandedPopover = null;
const DASHBOARD_PERIOD_OPTIONS = [
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
  { key: "180", label: "6m" },
  { key: "365", label: "12m" },
  { key: "all", label: "Tudo" },
];
const DASHBOARD_PERIOD_KEYS = DASHBOARD_PERIOD_OPTIONS.map((item) => item.key);
const DASHBOARD_DEFAULT_LAYOUT = {
  order: ["pulso", "analises", "mesa", "potencial", "ferramentas", "trilhas", "implantacao"],
  hidden: ["pulso", "mesa", "potencial", "ferramentas", "trilhas", "implantacao"],
  sizes: {
    pulso: "large",
    mesa: "large",
    potencial: "medium",
    analises: "large",
    ferramentas: "medium",
    trilhas: "medium",
    implantacao: "compact",
  },
};

function dashboardBlocks() {
  return Array.from(document.querySelectorAll("#dashboard > [data-dashboard-block]"));
}

function cloneDashboardLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}

function dashboardDefaultLayout() {
  return { ...cloneDashboardLayout(DASHBOARD_DEFAULT_LAYOUT), preset: "personalizado" };
}

function normalizeDashboardLayout(raw) {
  const base = dashboardDefaultLayout();
  if (Array.isArray(raw)) raw = { order: raw };
  if (!raw || typeof raw !== "object") return base;
  const known = new Set(DASHBOARD_BLOCK_KEYS);
  const order = Array.isArray(raw.order) ? raw.order.filter((key) => known.has(key)) : [];
  DASHBOARD_BLOCK_KEYS.forEach((key) => {
    if (!order.includes(key)) order.push(key);
  });
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter((key) => known.has(key)) : base.hidden;
  const sizes = { ...base.sizes };
  if (raw.sizes && typeof raw.sizes === "object") {
    Object.entries(raw.sizes).forEach(([key, size]) => {
      if (known.has(key) && DASHBOARD_SIZE_LABELS[size]) sizes[key] = size;
    });
  }
  return {
    preset: raw.preset || "personalizado",
    order,
    hidden: Array.from(new Set(hidden)),
    sizes,
  };
}

function dashboardLayout() {
  try {
    const saved = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
    if (saved) return normalizeDashboardLayout(JSON.parse(saved));
    const legacy = localStorage.getItem(DASHBOARD_LEGACY_LAYOUT_KEY);
    if (legacy) return normalizeDashboardLayout(JSON.parse(legacy));
  } catch {
    return dashboardDefaultLayout();
  }
  return dashboardDefaultLayout();
}

function saveDashboardLayout(layout) {
  const normalized = normalizeDashboardLayout(layout);
  localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(normalized));
  return normalized;
}

function dashboardBaseVisible() {
  try {
    return localStorage.getItem(DASHBOARD_BASE_VISIBLE_KEY) === "true";
  } catch {
    return false;
  }
}

function setDashboardBaseVisible(enabled) {
  try {
    localStorage.setItem(DASHBOARD_BASE_VISIBLE_KEY, enabled ? "true" : "false");
  } catch {
    // Local storage is optional; the visible class is still applied for this session.
  }
  applyDashboardBaseVisibility(enabled);
}

function applyDashboardBaseVisibility(enabled = dashboardBaseVisible()) {
  const board = document.querySelector("#dashboardOperatorBoard");
  if (board) board.classList.toggle("show-base", enabled);
}

function dashboardLayoutFromDom() {
  const current = dashboardLayout();
  return normalizeDashboardLayout({
    ...current,
    order: dashboardBlocks().map((element) => element.dataset.dashboardBlock).filter(Boolean),
  });
}

function saveDashboardLayoutOrder() {
  renderDashboardEditPanel(saveDashboardLayout(dashboardLayoutFromDom()));
}

const DASHBOARD_DATA_LABELS = {
  products: "produtos",
  sales: "vendas",
  customers: "clientes",
  stock: "estoque",
  costs: "custos",
  suppliers: "fornecedores",
  services: "serviços",
  history: "histórico",
  purchase_orders: "pedidos em aberto",
  supplier_terms: "condições de fornecedor",
  price_history: "histórico de preços",
  stock_history: "histórico de estoque",
  customer_contacts: "contatos com clientes",
  product_media: "imagens e anexos",
};

const DASHBOARD_INSIGHT_LIBRARY = [
  { title: "Curva ABC com margem e estoque", area: "Produtos", icon: "package-search", view: "products", needs: ["products", "sales", "stock", "costs"], payoff: "Mostra onde dinheiro, margem e risco de ruptura se encontram." },
  { title: "Compra sugerida por fornecedor", area: "Compras", icon: "shopping-cart", view: "quotes", needs: ["products", "stock", "sales", "suppliers"], payoff: "Ajuda a montar compra olhando demanda, cobertura e vínculos." },
  { title: "Clientes em recompra provável", area: "Clientes", icon: "users", view: "customers", needs: ["customers", "sales", "history"], payoff: "Mostra quem costuma voltar e pode merecer contato." },
  { title: "Preço alvo por papel do produto", area: "Margem", icon: "chart-no-axes-combined", view: "pricing", needs: ["products", "sales", "costs"], payoff: "Cruza custo, margem, receita e função do item no mix." },
  { title: "Fornecedores por dependência e ciclo", area: "Fornecedores", icon: "truck", view: "suppliers", needs: ["suppliers", "products", "sales"], payoff: "Mostra concentração, marcas fortes e pontos de negociação." },
  { title: "Mix de serviços e produtos juntos", area: "Vendas", icon: "layers-3", view: "opportunities", needs: ["sales", "services", "customers"], payoff: "Ajuda a enxergar venda completa, não só produto isolado." },
  { title: "Ruptura, excesso e capital parado", area: "Estoque", icon: "boxes", view: "stock", needs: ["stock", "sales", "costs"], payoff: "Transforma estoque em leitura financeira e operacional." },
  { title: "Mesa de gestão por período", area: "Gestão", icon: "calendar-range", view: "dashboard", needs: ["sales", "history", "products", "customers"], payoff: "Compara meses, recortes e evolução da empresa." },
  { title: "Estoque projetado com pedidos em aberto", area: "Estoque", icon: "package-check", view: "stock", needs: ["stock", "sales", "purchase_orders"], payoff: "Evita comprar o que já está a caminho." },
  { title: "Negociação por mínimo, prazo e ciclo", area: "Fornecedores", icon: "handshake", view: "suppliers", needs: ["suppliers", "supplier_terms", "sales"], payoff: "Mostra onde mínimo, prazo e demanda apertam a operação." },
  { title: "Histórico de preço por produto", area: "Margem", icon: "history", view: "pricing", needs: ["products", "price_history", "costs"], payoff: "Ajuda a comparar preço atual, custo e evolução." },
  { title: "Contato comercial por comportamento", area: "Clientes", icon: "message-circle", view: "customers", needs: ["customers", "sales", "customer_contacts"], payoff: "Liga recompra, relacionamento e histórico de contato." },
  { title: "Evolução do estoque por período", area: "Estoque", icon: "activity", view: "stock", needs: ["stock", "stock_history", "sales"], payoff: "Mostra se ruptura e excesso são pontuais ou recorrentes." },
  { title: "Catálogo visual por produto", area: "Produtos", icon: "image", view: "products", needs: ["products", "product_media"], payoff: "Ajuda a conferir itens, embalagens e materiais de venda." },
];

function dashboardDataReadiness({
  summary = state.summary || {},
  products = state.products || [],
  customers = state.customers || [],
  quoteSuppliers = state.quoteSuppliers || [],
  pricing = state.pricing || {},
  replenishment = state.replenishment || {},
  services = state.services || [],
  purchaseOrders = state.purchaseOrders || [],
} = {}) {
  const kpis = summary.kpis || {};
  const productRevenue = Number(kpis.product_revenue || 0);
  const serviceRevenue = Number(kpis.service_revenue || 0);
  const stockUnits = Number(kpis.stock_units || 0);
  const pricingRows = pricing.rows || pricing.items || [];
  return {
    products: Number(kpis.products || products.length || 0) > 0,
    sales: productRevenue + serviceRevenue > 0 || Boolean(summary.monthly?.length),
    customers: Number(kpis.customers || customers.length || 0) > 0,
    stock: stockUnits > 0 || Boolean(replenishment.summary),
    costs: Boolean(pricing.summary) && Number(pricing.summary?.missing_cost || 0) < Number(kpis.products || products.length || 1),
    suppliers: quoteSuppliers.length > 0 || products.some((row) => row.supplier_name),
    services: services.length > 0 || serviceRevenue > 0,
    history: Boolean(summary.monthly?.length && summary.monthly.length > 1),
    purchase_orders: purchaseOrders.length > 0,
    supplier_terms: quoteSuppliers.some((row) => Number(row.minimum_order_value || row.minimum_order || row.lead_time_days || row.delivery_days || 0) > 0),
    price_history: pricingRows.some((row) => row.last_price || row.previous_price || row.price_history || row.changed_at),
    stock_history: Boolean(replenishment.summary?.stock_history || replenishment.summary?.coverage_history),
    customer_contacts: Boolean(state.commercial?.summary?.contacts || state.whatsapp?.metrics?.conversations),
    product_media: products.some((row) => row.image_url || row.photo_url || row.attachment_count),
  };
}

function dashboardInsightState(item, readiness) {
  const missing = item.needs.filter((key) => !readiness[key]);
  return { ...item, missing, ready: missing.length === 0 };
}

function dashboardInsightCatalog(context = {}) {
  const readiness = dashboardDataReadiness(context);
  return DASHBOARD_INSIGHT_LIBRARY.map((item) => dashboardInsightState(item, readiness));
}

function dashboardReadinessSummary(context = {}) {
  const readiness = dashboardDataReadiness(context);
  const catalog = dashboardInsightCatalog(context);
  const sourceCount = Object.values(readiness).filter(Boolean).length;
  const sourceTotal = Object.keys(readiness).length || 1;
  const readyCount = catalog.filter((item) => item.ready).length;
  return {
    readiness,
    catalog,
    sourceCount,
    sourceTotal,
    readyCount,
    upcomingCount: Math.max(0, catalog.length - readyCount),
    progress: Math.round((sourceCount / sourceTotal) * 100),
  };
}

function renderDashboardEditPanel(layout = dashboardLayout()) {
  const panel = document.querySelector("#dashboardEditPanel");
  const controls = document.querySelector("#dashboardBlockControls");
  if (!panel || !controls) return;
  const normalized = normalizeDashboardLayout(layout);
  controls.innerHTML = DASHBOARD_BLOCK_DEFS.map((item) => {
    const hidden = normalized.hidden.includes(item.key);
    const size = normalized.sizes[item.key] || "medium";
    return `
      <article class="dashboard-block-control ${hidden ? "muted" : ""}">
        <div>
          <strong>${escapeHtml(item.label)}</strong>
          <span>${hidden ? "Fora da mesa" : "Visível na mesa"}</span>
        </div>
        <div class="dashboard-size-toggle" aria-label="Tamanho de ${escapeAttr(item.label)}">
          ${Object.entries(DASHBOARD_SIZE_LABELS).map(([sizeKey, label]) => `
            <button class="${size === sizeKey ? "active" : ""}" type="button" data-dashboard-size="${escapeAttr(sizeKey)}" data-dashboard-block-key="${escapeAttr(item.key)}">
              ${escapeHtml(label)}
            </button>
          `).join("")}
        </div>
        <button class="dashboard-visibility-button ${hidden ? "hidden-block" : ""}" type="button" data-dashboard-toggle="${escapeAttr(item.key)}" title="${hidden ? "Mostrar bloco" : "Ocultar bloco"}" aria-label="${hidden ? "Mostrar bloco" : "Ocultar bloco"}">
          <i data-lucide="${hidden ? "eye" : "eye-off"}"></i>
        </button>
      </article>
    `;
  }).join("");
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function applyDashboardLayoutState(layout = dashboardLayout()) {
  const dashboard = document.querySelector("#dashboard");
  if (!dashboard) return;
  const normalized = normalizeDashboardLayout(layout);
  const lookup = new Map(dashboardBlocks().map((element) => [element.dataset.dashboardBlock, element]));
  normalized.order.forEach((key) => {
    const element = lookup.get(key);
    if (element) dashboard.appendChild(element);
  });
  dashboardBlocks().forEach((element) => {
    const key = element.dataset.dashboardBlock;
    element.dataset.dashboardSize = normalized.sizes[key] || "medium";
    element.classList.toggle("dashboard-block-hidden", normalized.hidden.includes(key));
    element.setAttribute("aria-hidden", normalized.hidden.includes(key) ? "true" : "false");
  });
  applyDashboardBaseVisibility();
  renderDashboardEditPanel(normalized);
}

function setDashboardBlockSize(blockKey, size) {
  if (!DASHBOARD_BLOCK_LABELS.has(blockKey) || !DASHBOARD_SIZE_LABELS[size]) return;
  const layout = dashboardLayout();
  layout.sizes[blockKey] = size;
  layout.preset = "personalizado";
  applyDashboardLayoutState(saveDashboardLayout(layout));
}

function toggleDashboardBlockHidden(blockKey) {
  if (!DASHBOARD_BLOCK_LABELS.has(blockKey)) return;
  const layout = dashboardLayout();
  const hidden = new Set(layout.hidden);
  if (hidden.has(blockKey)) hidden.delete(blockKey);
  else hidden.add(blockKey);
  layout.hidden = Array.from(hidden);
  layout.preset = "personalizado";
  applyDashboardLayoutState(saveDashboardLayout(layout));
}

function showDashboardBlock(blockKey) {
  if (!DASHBOARD_BLOCK_LABELS.has(blockKey)) return;
  const layout = dashboardLayout();
  layout.hidden = layout.hidden.filter((key) => key !== blockKey);
  layout.preset = "personalizado";
  applyDashboardLayoutState(saveDashboardLayout(layout));
  if (blockKey === "analises") scheduleChartRecovery();
}

function restoreDashboardDefaultLayout() {
  applyDashboardLayoutState(saveDashboardLayout(dashboardDefaultLayout()));
}

function setDashboardEditMode(enabled) {
  const dashboard = document.querySelector("#dashboard");
  const panel = document.querySelector("#dashboardEditPanel");
  if (!dashboard) return;
  dashboard.classList.toggle("dashboard-editing", enabled);
  dashboardBlocks().forEach((element) => {
    element.draggable = enabled;
    element.setAttribute("aria-grabbed", "false");
  });
  if (panel) panel.hidden = !enabled;
  renderDashboardEditPanel();
}

function toggleDashboardEditMode() {
  const dashboard = document.querySelector("#dashboard");
  setDashboardEditMode(!dashboard?.classList.contains("dashboard-editing"));
}

function setupDashboardLayoutEditing() {
  const dashboard = document.querySelector("#dashboard");
  if (!dashboard || dashboard.dataset.layoutReady === "true") return;
  dashboard.dataset.layoutReady = "true";
  applyDashboardLayoutState();
  dashboard.addEventListener("dragstart", (event) => {
    const block = event.target.closest("[data-dashboard-block]");
    if (!dashboard.classList.contains("dashboard-editing") || !block) {
      event.preventDefault();
      return;
    }
    block.classList.add("is-dragging");
    block.setAttribute("aria-grabbed", "true");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", block.dataset.dashboardBlock || "");
  });
  dashboard.addEventListener("dragend", () => {
    dashboardBlocks().forEach((element) => {
      element.classList.remove("is-dragging", "drag-over");
      element.setAttribute("aria-grabbed", "false");
    });
  });
  dashboard.addEventListener("dragover", (event) => {
    if (!dashboard.classList.contains("dashboard-editing")) return;
    const target = event.target.closest("[data-dashboard-block]");
    const dragging = document.querySelector("#dashboard > .is-dragging");
    if (!target || !dragging || target === dragging) return;
    event.preventDefault();
    target.classList.add("drag-over");
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    dashboard.insertBefore(dragging, before ? target : target.nextSibling);
  });
  dashboard.addEventListener("dragleave", (event) => {
    const target = event.target.closest("[data-dashboard-block]");
    target?.classList.remove("drag-over");
  });
  dashboard.addEventListener("drop", (event) => {
    if (!dashboard.classList.contains("dashboard-editing")) return;
    event.preventDefault();
    saveDashboardLayoutOrder();
  });
  document.querySelector("#dashboardEditPanel")?.addEventListener("click", (event) => {
    const sizeButton = event.target.closest("[data-dashboard-size]");
    if (sizeButton?.dataset.dashboardBlockKey) setDashboardBlockSize(sizeButton.dataset.dashboardBlockKey, sizeButton.dataset.dashboardSize);
    const visibilityButton = event.target.closest("[data-dashboard-toggle]");
    if (visibilityButton?.dataset.dashboardToggle) toggleDashboardBlockHidden(visibilityButton.dataset.dashboardToggle);
    if (event.target.closest("#dashboardRestoreLayout")) restoreDashboardDefaultLayout();
    if (event.target.closest("#dashboardFinishLayout")) setDashboardEditMode(false);
  });
  dashboard.addEventListener("click", (event) => {
    const periodOption = event.target.closest("[data-dashboard-widget-period-option]");
    if (periodOption?.dataset.dashboardWidgetPeriodOption) {
      event.preventDefault();
      event.stopPropagation();
      setDashboardCockpitWidgetPeriod(periodOption.dataset.dashboardWidgetPeriodOption, periodOption.dataset.dashboardPeriodValue);
      return;
    }
    const periodToggle = event.target.closest("[data-dashboard-widget-period-toggle]");
    if (periodToggle?.dataset.dashboardWidgetPeriodToggle) {
      event.preventDefault();
      event.stopPropagation();
      const menu = periodToggle.closest(".cockpit-period-menu");
      const willOpen = !menu?.classList.contains("open");
      closeDashboardPeriodMenus(menu);
      menu?.classList.toggle("open", willOpen);
      periodToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
      return;
    }
    if (!event.target.closest(".cockpit-period-menu")) closeDashboardPeriodMenus();
    if (event.target.closest("[data-dashboard-widget-add-open]")) {
      event.preventDefault();
      event.stopPropagation();
      setDashboardAddModalOpen(!document.querySelector("#dashboardCockpitAddCard")?.classList.contains("open"));
      return;
    }
    if (event.target.closest("[data-dashboard-widget-add-close]") || event.target.matches("[data-dashboard-widget-add-modal]")) {
      event.preventDefault();
      event.stopPropagation();
      setDashboardAddModalOpen(false);
      return;
    }
    const hideWidgetButton = event.target.closest("[data-dashboard-widget-hide]");
    if (hideWidgetButton?.dataset.dashboardWidgetHide) {
      event.preventDefault();
      event.stopPropagation();
      setDashboardCockpitWidgetHidden(hideWidgetButton.dataset.dashboardWidgetHide, true);
      return;
    }
    const expandWidgetButton = event.target.closest("[data-dashboard-widget-expand]");
    if (expandWidgetButton?.dataset.dashboardWidgetExpand) {
      event.preventDefault();
      event.stopPropagation();
      toggleDashboardCockpitWidgetExpanded(expandWidgetButton.dataset.dashboardWidgetExpand);
      return;
    }
    const addWidgetButton = event.target.closest("[data-dashboard-widget-add]");
    if (addWidgetButton?.dataset.dashboardWidgetAdd) {
      event.preventDefault();
      event.stopPropagation();
      setDashboardAddModalOpen(false);
      setDashboardCockpitWidgetHidden(addWidgetButton.dataset.dashboardWidgetAdd, false);
      return;
    }
    if (event.target.closest("[data-dashboard-widget-add-all]")) {
      event.preventDefault();
      event.stopPropagation();
      setDashboardAddModalOpen(false);
      showAllDashboardCockpitWidgets();
      return;
    }
    if (event.target.closest("[data-dashboard-open-layout]")) setDashboardEditMode(true);
  });
  document.addEventListener("click", handleDashboardAddModalClick);
  document.addEventListener("click", (event) => {
    if (event.target.closest(".cockpit-widget-popover, [data-dashboard-widget-expand]")) return;
    clearDashboardCockpitWidgetExpanded();
  });
  applyDashboardBaseVisibility();
}

function biSignal({ label, value, detail, tone = "neutral", icon = "activity", view = "" }) {
  const target = view ? ` data-view-target="${escapeAttr(view)}"` : "";
  return `
    <button class="bi-signal ${escapeAttr(tone)}" type="button"${target}>
      <i data-lucide="${escapeAttr(icon)}"></i>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <em>${escapeHtml(detail || "")}</em>
      </div>
      <small>abrir</small>
    </button>
  `;
}

function dashboardShortcutButtons() {
  const items = [
    ["actions", "Ferramentas", "panel-top"],
    ["opportunities", "Vendas", "bar-chart-3"],
    ["customers", "Clientes", "users"],
    ["products", "Produtos", "package-search"],
    ["stock", "Estoque", "boxes"],
    ["pricing", "Preços", "chart-no-axes-combined"],
    ["suppliers", "Fornec.", "truck"],
    ["quotes", "Compras", "shopping-cart"],
  ];
  return items.map(([view, label, icon]) => `
    <button class="dashboard-float-btn" type="button" data-view-target="${escapeAttr(view)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>${escapeHtml(label)}</span>
    </button>
  `).join("");
}

function operatorMovement({ icon = "activity", title, value, detail, view }) {
  const target = view ? ` data-view-target="${escapeAttr(view)}"` : "";
  return `
    <button class="operator-movement" type="button"${target}>
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail || "")}</em>
    </button>
  `;
}

function operatorTool({ icon = "scan-search", title, detail, view, locked = false }) {
  return `
    <button class="operator-tool ${locked ? "locked" : ""}" type="button" data-view-target="${escapeAttr(view)}">
      <i data-lucide="${escapeAttr(icon)}"></i>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
    </button>
  `;
}

function operatorDataItem({ label, value, status = "ready", detail = "" }) {
  return `
    <article class="operator-data-item ${escapeAttr(status)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </article>
  `;
}

function dashboardExecutiveKpi({ label, value, detail, color = "", icon = "activity" }) {
  return `
    <div class="kpi ${escapeAttr(color)}">
      <span><i data-lucide="${escapeAttr(icon)}"></i>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </div>
  `;
}

function dashboardHealthTile({ label, value, detail, tone = "neutral", icon = "activity", view = "" }) {
  const target = view ? ` data-view-target="${escapeAttr(view)}"` : "";
  return `
    <button class="retail-health-tile ${escapeAttr(tone)}" type="button"${target}>
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail || "")}</em>
    </button>
  `;
}

function dashboardBenchmark({ label, value, detail, tone = "neutral" }) {
  return `
    <article class="retail-benchmark ${escapeAttr(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail || "")}</em>
    </article>
  `;
}

function dashboardBar({ label, value, detail, progress = 0, tone = "neutral" }) {
  const width = Math.max(0, Math.min(100, Number(progress || 0)));
  return `
    <article class="retail-bar ${escapeAttr(tone)}" style="--bar:${width}%">
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
      <i></i>
      <em>${escapeHtml(detail || "")}</em>
    </article>
  `;
}

function dashboardRetailKpiConcepts({ readinessSummary, totalRevenue, productCount, customerCount, lowMargin, urgentStock, sourceCoverage }) {
  const ready = readinessSummary.readiness || {};
  return [
    {
      area: "Resultado",
      metric: "Receita, ticket e tendência",
      value: totalRevenue ? compactMoney(totalRevenue) : "desbloquear",
      decision: "Mostra ritmo de venda, sazonalidade e produtividade comercial.",
      importNeed: ready.sales ? "Adicionar histórico melhora comparação e tendência." : "Importar vendas com data, item, quantidade, valor e cliente.",
      icon: "trending-up",
      ready: ready.sales,
      view: ready.sales ? "opportunities" : "imports",
    },
    {
      area: "Rentabilidade",
      metric: "Margem bruta e preço alvo",
      value: ready.costs ? `${number(lowMargin)} alertas` : "sem CMV",
      decision: "Separa faturamento de lucro e mostra onde preço ou custo corroem resultado.",
      importNeed: ready.costs ? "Histórico de preço e custo amplia leitura de tendência." : "Importar custos/CMV por produto e, se possível, histórico de preços.",
      icon: "chart-no-axes-combined",
      ready: ready.costs,
      view: ready.costs ? "pricing" : "imports",
    },
    {
      area: "Clientes",
      metric: "Recorrência, carteira e LTV",
      value: customerCount ? `${number(customerCount)} clientes` : "sem carteira",
      decision: "Mostra quem compra, quem volta, quem está sumindo e quanto vale cada relação.",
      importNeed: ready.customers && ready.history ? "Contatos e histórico enriquecem CRM." : "Importar clientes, vendas por cliente e histórico de compras.",
      icon: "users",
      ready: ready.customers && ready.sales,
      view: ready.customers ? "customers" : "imports",
    },
    {
      area: "Produtos",
      metric: "Mix, curva ABC e concentração",
      value: productCount ? `${number(productCount)} SKUs` : "sem mix",
      decision: "Mostra dependência de poucos produtos, categorias fortes e itens estratégicos.",
      importNeed: ready.products && ready.sales ? "Custos e estoque transformam ABC em lucro e capital." : "Importar cadastro de produtos e vendas por item.",
      icon: "package-search",
      ready: ready.products && ready.sales,
      view: ready.products ? "products" : "imports",
    },
    {
      area: "Capital",
      metric: "GMROI, giro e sell-through",
      value: ready.stock && ready.costs && ready.sales ? "calculável" : "incompleto",
      decision: "Mostra se o dinheiro parado em estoque volta como margem ou vira excesso.",
      importNeed: ready.stock && ready.costs && ready.sales ? "Estoque histórico melhora giro e sell-through." : "Importar estoque, custos e histórico de vendas por SKU.",
      icon: "coins",
      ready: ready.stock && ready.costs && ready.sales,
      view: ready.stock ? "stock" : "imports",
    },
    {
      area: "Abastecimento",
      metric: "Cobertura, ruptura e compra",
      value: ready.stock ? `${number(urgentStock)} sinais` : "sem estoque",
      decision: "Mostra o risco de faltar, sobrar ou comprar sem necessidade.",
      importNeed: ready.suppliers && ready.stock ? "Pedidos em aberto e prazos melhoram sugestão de compra." : "Importar saldo de estoque, fornecedores, mínimos, prazos e pedidos em aberto.",
      icon: "truck",
      ready: ready.stock && ready.suppliers,
      view: ready.stock ? "stock" : "imports",
    },
    {
      area: "Dados",
      metric: "Maturidade da base",
      value: `${number(sourceCoverage)}%`,
      decision: "Mostra o que o sistema já consegue explicar e o que ainda está cego.",
      importNeed: readinessSummary.upcomingCount ? "Priorizar os dados que desbloqueiam decisões de margem, cliente e capital." : "Base ampla para a leitura executiva.",
      icon: "database",
      ready: sourceCoverage >= 70,
      view: "imports",
    },
  ];
}

function dashboardRetailIntelligencePanel(concepts = []) {
  const ordered = concepts
    .slice()
    .sort((a, b) => Number(a.ready) - Number(b.ready))
    .slice(0, 6);
  return `
    <header>
      <div>
        <span>Mapa de gestão</span>
        <strong>Leituras que a gestão deve responder</strong>
      </div>
      <button class="secondary-button compact" type="button" data-view-target="imports">Ver importações</button>
    </header>
    <div class="retail-intelligence-list">
      ${ordered.map((item) => `
        <button class="retail-intelligence-card ${item.ready ? "ready" : "locked"}" type="button" data-view-target="${escapeAttr(item.view || "imports")}">
          <i data-lucide="${escapeAttr(item.icon || "activity")}"></i>
          <div>
            <span>${escapeHtml(item.area)}</span>
            <strong>${escapeHtml(item.metric)}</strong>
            <em>${escapeHtml(item.decision)}</em>
            <small>${escapeHtml(item.importNeed)}</small>
          </div>
          <b>${escapeHtml(item.value)}</b>
        </button>
      `).join("")}
    </div>
  `;
}

function dashboardScoreCell({ label, value, detail, tone = "neutral", icon = "activity", view = "", commercialMode = "" }) {
  const tag = view ? "button" : "article";
  const type = view ? ` type="button"` : "";
  const viewTarget = view ? ` data-view-target="${escapeAttr(view)}"` : "";
  const modeTarget = commercialMode ? ` data-commercial-mode-target="${escapeAttr(commercialMode)}"` : "";
  return `
    <${tag} class="cockpit-score-cell ${escapeAttr(tone)}"${type}${viewTarget}${modeTarget}>
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail || "")}</em>
    </${tag}>
  `;
}

function dashboardPillar({ label, value, detail, tone = "neutral", icon = "activity", view = "" }) {
  const target = view ? ` data-view-target="${escapeAttr(view)}"` : "";
  return `
    <button class="cockpit-pillar ${escapeAttr(tone)}" type="button"${target}>
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail || "")}</em>
    </button>
  `;
}

function dashboardFormatBucket(raw) {
  if (!raw) return "";
  const value = String(raw);
  const parts = value.split("-");
  if (parts.length >= 3) return `${parts[2]}/${parts[1]}`;
  if (parts.length >= 2) {
    const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const idx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
    return `${months[idx]}/${parts[0].slice(2)}`;
  }
  return value;
}

function dashboardTrendSvg(rows = []) {
  const displayRows = rows.slice(-12);
  if (!displayRows.length) {
    return `<div class="cockpit-empty">Importe vendas com data para formar a série histórica.</div>`;
  }
  const values = displayRows.map((row) => Number(row.product_revenue || 0) + Number(row.service_revenue || 0));
  const max = Math.max(...values, 1);
  const width = 640;
  const height = 210;
  const step = displayRows.length > 1 ? width / (displayRows.length - 1) : width;
  const points = values.map((value, index) => {
    const x = displayRows.length > 1 ? index * step : width / 2;
    const y = height - (value / max) * (height - 28) - 14;
    return [Number(x.toFixed(2)), Number(y.toFixed(2)), value, displayRows[index]];
  });
  const path = points.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ");
  const bars = points.map(([x, , value], index) => {
    const barWidth = Math.max(18, Math.min(38, width / Math.max(displayRows.length, 1) * 0.54));
    const barHeight = Math.max(3, (value / max) * (height - 38));
    const bx = displayRows.length > 1 ? x - barWidth / 2 : x - barWidth / 2;
    const by = height - barHeight - 10;
    return `<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="3"></rect>`;
  }).join("");
  const labels = points.map(([x, , , row], index) => {
    if (index !== 0 && index !== points.length - 1 && index % 2 !== 0) return "";
    return `<text x="${x}" y="${height + 20}" text-anchor="middle">${escapeHtml(dashboardFormatBucket(row.month))}</text>`;
  }).join("");
  return `
    <svg class="cockpit-trend-svg" viewBox="0 0 ${width} ${height + 28}" role="img" aria-label="Receita por período">
      <g class="cockpit-bars">${bars}</g>
      <path class="cockpit-line" d="${path}"></path>
      <g class="cockpit-points">${points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4"></circle>`).join("")}</g>
      <g class="cockpit-axis">${labels}</g>
    </svg>
  `;
}

function dashboardSegmentBar({ label, value, max, detail = "", tone = "green" }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (Number(value || 0) / max) * 100)) : 0;
  return `
    <article class="cockpit-segment-row ${escapeAttr(tone)}" style="--value:${pct}%">
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(compactMoney(value || 0))}</strong>
      </div>
      <i></i>
      <em>${escapeHtml(detail)}</em>
    </article>
  `;
}

function dashboardRankRows(rows = [], formatter = compactMoney) {
  if (!rows.length) return `<div class="cockpit-empty">Sem dados suficientes.</div>`;
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
  return rows.slice(0, 5).map((row, index) => {
    const pct = Math.max(4, Math.min(100, (Number(row.value || 0) / max) * 100));
    return `
      <article class="cockpit-rank-row" style="--value:${pct}%">
        <span>${number(index + 1)}</span>
        <div>
          <strong>${escapeHtml(row.label || "Sem classificação")}</strong>
          <i></i>
        </div>
        <em>${escapeHtml(formatter(Number(row.value || 0)))}</em>
      </article>
    `;
  }).join("");
}

function dashboardDataMatrix(readinessSummary) {
  const items = [
    ["Vendas", "sales", "Receita, ticket e tendência"],
    ["Custos", "costs", "Margem, CMV e preço alvo"],
    ["Clientes", "customers", "Recorrência e carteira"],
    ["Produtos", "products", "Mix, curva ABC e categorias"],
    ["Estoque", "stock", "Capital, giro e cobertura"],
    ["Fornecedores", "suppliers", "Abastecimento e negociação"],
    ["Histórico", "history", "Sazonalidade e comparação"],
    ["Canais", "services", "Produto, serviço e canais"],
  ];
  const readiness = readinessSummary.readiness || {};
  return items.map(([label, key, detail]) => `
    <button class="cockpit-data-tile ${readiness[key] ? "ready" : "locked"}" type="button" data-view-target="${readiness[key] ? "dashboard" : "imports"}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(readiness[key] ? "Sim" : "Não")}</strong>
      <em>${escapeHtml(detail)}</em>
    </button>
  `).join("");
}

function dashboardUnlockRows(concepts = []) {
  return concepts
    .slice()
    .sort((a, b) => Number(a.ready) - Number(b.ready))
    .slice(0, 5)
    .map((item) => `
      <button class="cockpit-unlock-row ${item.ready ? "ready" : "locked"}" type="button" data-view-target="${escapeAttr(item.view || "imports")}">
        <i data-lucide="${escapeAttr(item.icon || "activity")}"></i>
        <div>
          <span>${escapeHtml(item.area)}</span>
          <strong>${escapeHtml(item.metric)}</strong>
          <em>${escapeHtml(item.importNeed)}</em>
        </div>
        <b>${escapeHtml(item.value)}</b>
      </button>
    `).join("");
}

function dashboardBiMetric({ label, value, detail = "", tone = "neutral", icon = "activity", view = "", commercialMode = "" }) {
  const tag = view ? "button" : "article";
  const type = view ? ` type="button"` : "";
  const viewTarget = view ? ` data-view-target="${escapeAttr(view)}"` : "";
  const modeTarget = commercialMode ? ` data-commercial-mode-target="${escapeAttr(commercialMode)}"` : "";
  return `
    <${tag} class="bi-metric-cell ${escapeAttr(tone)}"${type}${viewTarget}${modeTarget}>
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </${tag}>
  `;
}

function dashboardBiTable(rows = [], columns = [], empty = "Sem dados no recorte.") {
  if (!rows.length) return `<div class="cockpit-empty">${escapeHtml(empty)}</div>`;
  return `
    <div class="bi-table-wrap">
      <table class="bi-table">
        <thead>
          <tr>${columns.map((column) => `<th class="${column.align === "right" ? "num" : ""}">${escapeHtml(column.label)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr>
              ${columns.map((column) => {
                const raw = typeof column.value === "function" ? column.value(row, index) : row[column.key];
                return `<td class="${column.align === "right" ? "num" : ""}">${escapeHtml(raw ?? "-")}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function dashboardBiLedger(rows = [], options = {}) {
  if (!rows.length) return `<div class="cockpit-empty">${escapeHtml(options.empty || "Sem dados no recorte.")}</div>`;
  const max = Math.max(...rows.map((row) => Number(row.barValue ?? row.rawValue ?? row.valueNumeric ?? 0)), 1);
  return `
    <div class="bi-ledger ${options.compact ? "compact" : ""}">
      ${rows.slice(0, options.limit || 5).map((row, index) => {
        const raw = Number(row.barValue ?? row.rawValue ?? row.valueNumeric ?? 0);
        const width = Math.max(3, Math.min(100, (raw / max) * 100));
        return `
          <button class="bi-ledger-row ${escapeAttr(row.tone || "")}" type="button"${row.view ? ` data-view-target="${escapeAttr(row.view)}"` : ""}>
            <span>${number(index + 1)}</span>
            <div>
              <strong>${escapeHtml(row.label || "-")}</strong>
              <i style="--value:${width}%"></i>
              ${row.detail ? `<em>${escapeHtml(row.detail)}</em>` : ""}
            </div>
            <b>${escapeHtml(row.value || "")}</b>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function dashboardBiImportRows(imports = {}, readinessSummary = {}) {
  const latest = (imports.batches || [])[0] || {};
  const latestAt = latest.finished_at || latest.started_at || "";
  const files = latest.files || [];
  if (files.length) {
    return files.slice(0, 4).map((file) => ({
      fonte: file.file_name || latest.source_system || "Arquivo",
      linhas: number(file.row_count || 0),
      atualizacao: shortDateTime(latestAt),
    }));
  }
  const labels = {
    products: "Produtos",
    sales: "Vendas",
    customers: "Clientes",
    stock: "Estoque",
    costs: "Custos",
    suppliers: "Fornecedores",
    services: "Serviços",
    history: "Histórico",
  };
  return Object.entries(readinessSummary.readiness || {}).slice(0, 4).map(([key, ready]) => ({
    fonte: labels[key] || key,
    linhas: ready ? "Sim" : "Não",
    atualizacao: "-",
  }));
}

function dashboardBiModuleScoreRows(imports = {}, readinessSummary = {}) {
  const moduleScores = imports.assistant?.module_scores || [];
  if (moduleScores.length) {
    return moduleScores
      .map((item) => ({ label: item.label || item.module || "Módulo", value: Number(item.score || 0) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }
  const labels = {
    products: "Produtos",
    sales: "Vendas",
    customers: "Clientes",
    stock: "Estoque",
    costs: "Custos",
    suppliers: "Fornecedores",
    services: "Serviços",
    history: "Histórico",
  };
  return Object.entries(readinessSummary.readiness || {})
    .slice(0, 5)
    .map(([key, ready]) => ({ label: labels[key] || key, value: ready ? 100 : 0 }));
}

function dashboardBiPercent(value) {
  return `${number(value)}%`;
}

function dashboardMiniLegend(items = []) {
  return `
    <div class="bi-mini-legend" aria-label="Legenda">
      ${items.map((item) => `
        <span><i style="--legend-color:${escapeAttr(item.color)}"></i>${escapeHtml(item.label)}</span>
      `).join("")}
    </div>
  `;
}

function dashboardDonutDetails(items = [], valueFormatter = number) {
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return `
    <div class="dashboard-donut-detail" aria-label="Detalhamento">
      ${items.map((item) => {
        const value = Number(item.value || 0);
        const share = total ? Math.round((value / total) * 100) : 0;
        return `
          <div class="dashboard-donut-row">
            <span><i style="--legend-color:${escapeAttr(item.color)}"></i>${escapeHtml(item.label)}</span>
            <strong>${valueFormatter(value)}</strong>
            <em>${number(share)}%</em>
            <b style="width:${Math.max(3, share)}%"></b>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function dashboardDonutSummary({ label = "", value = "", detail = "" } = {}) {
  return `
    <div class="dashboard-donut-summary">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<em>${escapeHtml(detail)}</em>` : ""}
    </div>
  `;
}

function normalizeDashboardPeriod(periodDays) {
  const key = String(periodDays || state.periodDays || "30");
  return DASHBOARD_PERIOD_KEYS.includes(key) ? key : "30";
}

function dashboardPeriodOptionLabel(periodDays) {
  const key = normalizeDashboardPeriod(periodDays);
  return DASHBOARD_PERIOD_OPTIONS.find((item) => item.key === key)?.label || "30d";
}

function normalizeDashboardCockpitPeriods(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return DASHBOARD_COCKPIT_WIDGET_KEYS.reduce((acc, key) => {
    acc[key] = normalizeDashboardPeriod(source[key] || state.periodDays || "30");
    return acc;
  }, {});
}

function dashboardCockpitPeriods() {
  if (state.dashboardCockpitPeriods) return normalizeDashboardCockpitPeriods(state.dashboardCockpitPeriods);
  try {
    return normalizeDashboardCockpitPeriods(JSON.parse(window.localStorage.getItem(DASHBOARD_COCKPIT_PERIOD_KEY) || "{}"));
  } catch {
    return normalizeDashboardCockpitPeriods({});
  }
}

function saveDashboardCockpitPeriods(periods) {
  const normalized = normalizeDashboardCockpitPeriods(periods);
  state.dashboardCockpitPeriods = normalized;
  try {
    window.localStorage.setItem(DASHBOARD_COCKPIT_PERIOD_KEY, JSON.stringify(normalized));
  } catch {
    // A escolha continua aplicada nesta renderização mesmo sem persistência.
  }
  return normalized;
}

function dashboardWidgetPeriod(widgetKey, periods = dashboardCockpitPeriods()) {
  return normalizeDashboardPeriod(periods[widgetKey] || state.periodDays || "30");
}

function dashboardPeriodSelect(widgetKey, periods = dashboardCockpitPeriods()) {
  const current = dashboardWidgetPeriod(widgetKey, periods);
  const currentLabel = dashboardPeriodOptionLabel(current);
  return `
    <div class="cockpit-period-menu" data-dashboard-widget-period="${escapeAttr(widgetKey)}">
      <button class="cockpit-period-trigger" type="button" data-dashboard-widget-period-toggle="${escapeAttr(widgetKey)}" aria-haspopup="menu" aria-expanded="false" title="Período do bloco">
        <span>${escapeHtml(currentLabel)}</span>
      </button>
      <div class="cockpit-period-options" role="menu">
        ${DASHBOARD_PERIOD_OPTIONS.map((item) => `
          <button class="${item.key === current ? "active" : ""}" type="button" role="menuitem" data-dashboard-widget-period-option="${escapeAttr(widgetKey)}" data-dashboard-period-value="${escapeAttr(item.key)}">
            ${escapeHtml(item.label)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function dashboardPeriodContext(periodDays, fallbackContext) {
  const fallback = fallbackContext || {};
  const cached = typeof getCachedPeriodWorkspaceData === "function" ? getCachedPeriodWorkspaceData(periodDays) : null;
  return {
    summary: cached?.summary || fallback.summary || state.summary || {},
    products: cached?.products || fallback.products || state.products || [],
    replenishment: cached?.replenishment || fallback.replenishment || state.replenishment || {},
    commercial: cached?.commercial || fallback.commercial || state.commercial || {},
    customers: cached?.customers || fallback.customers || state.customers || [],
    services: cached?.services || fallback.services || state.services || [],
    pricing: cached?.pricing || fallback.pricing || state.pricing || {},
    imports: fallback.imports || state.imports || {},
    quoteSuppliers: fallback.quoteSuppliers || state.quoteSuppliers || [],
    periodDays: normalizeDashboardPeriod(periodDays),
    loading: !cached && normalizeDashboardPeriod(periodDays) !== normalizeDashboardPeriod(state.periodDays),
  };
}

function dashboardWidgetContext(widgetKey, fallbackContext, periods = dashboardCockpitPeriods()) {
  return dashboardPeriodContext(dashboardWidgetPeriod(widgetKey, periods), fallbackContext);
}

function dashboardMetricBundle(context = {}) {
  const summary = context.summary || {};
  const kpis = summary.kpis || {};
  const products = context.products || [];
  const customers = context.customers || [];
  const services = context.services || [];
  const replenishment = context.replenishment || {};
  const pricing = context.pricing || {};
  const imports = context.imports || {};
  const quoteSuppliers = context.quoteSuppliers || [];
  const productRevenue = Number(kpis.product_revenue || 0);
  const serviceRevenue = Number(kpis.service_revenue || 0);
  const totalRevenue = productRevenue + serviceRevenue;
  const periodDays = context.periodDays === "all" ? 0 : Number(context.periodDays || summary?.period?.period_days || 0);
  const divisorDays = periodDays || Math.max(1, summary?.monthly?.length || 1);
  const avgDailyRevenue = totalRevenue > 0 ? totalRevenue / Math.max(divisorDays, 1) : 0;
  const productMixPct = totalRevenue > 0 ? Math.round((productRevenue / totalRevenue) * 100) : 0;
  const serviceMixPct = totalRevenue > 0 ? Math.round((serviceRevenue / totalRevenue) * 100) : 0;
  const urgentStock = Number(replenishment.summary?.urgent || 0) + Number(replenishment.summary?.buy_now || 0);
  const excessStock = Number(replenishment.summary?.excess || 0);
  const buyNowStock = Number(replenishment.summary?.buy_now || 0);
  const attentionStock = Number(replenishment.summary?.urgent || 0);
  const stockUniverse = Math.max(
    Number(replenishment.summary?.total || 0),
    Number(replenishment.rows?.length || 0),
    Number(kpis.products || products.length || 0),
  );
  const stockOk = Math.max(0, Number(replenishment.summary?.ok || 0) || stockUniverse - buyNowStock - attentionStock - excessStock);
  const pricingRows = pricing.rows || pricing.items || [];
  const negativeMargin = Number(pricing.summary?.negative_margin || 0);
  const lowMarginOnly = Number(pricing.summary?.low_margin || 0);
  const missingCost = Number(pricing.summary?.missing_cost || 0);
  const okMargin = Math.max(0, Number(pricing.summary?.products || pricingRows.length || 0) - negativeMargin - lowMarginOnly - missingCost);
  const lowMargin = negativeMargin + lowMarginOnly;
  const cmvTotal = pricingRows.reduce((sum, row) => {
    const quantity = Number(row.quantity || 0);
    const cost = Number(row.effective_cost || 0);
    return sum + (quantity > 0 && cost > 0 ? quantity * cost : 0);
  }, 0);
  const grossMargin = cmvTotal > 0 ? Math.max(0, productRevenue - cmvTotal) : 0;
  const grossMarginPct = productRevenue > 0 && cmvTotal > 0 ? (grossMargin / productRevenue) * 100 : null;
  const purchases = customers.reduce((sum, row) => sum + Number(row.purchases || row.purchase_days || 0), 0);
  const avgTicket = purchases > 0 ? totalRevenue / purchases : 0;
  const productRows = products.slice(0, 5).map((row) => ({ label: row.name, value: row.revenue }));
  const customerRowsData = customers.slice(0, 5).map((row) => ({ label: row.name, value: row.revenue }));
  const serviceRowsData = services.slice(0, 4).map((row) => ({ label: row.name, value: row.revenue }));
  const brandRows = aggregateMap(products, "brand_name", "revenue", "Sem marca");
  const supplierRows = aggregateMap(products, "supplier_name", "revenue", "Sem fornecedor");
  const supplierEstimated = quoteSuppliers.reduce((sum, row) => sum + Number(row.estimated_value || 0), 0);
  const openOrders = quoteSuppliers.reduce((sum, row) => sum + Number(row.pending_order_count || 0), 0);
  const openQuotes = quoteSuppliers.reduce((sum, row) => sum + Number(row.open_quote_count || 0), 0);
  const productConcentration = productRevenue ? productRows.reduce((sum, row) => sum + Number(row.value || 0), 0) / productRevenue * 100 : 0;
  const customerConcentration = totalRevenue ? customerRowsData.reduce((sum, row) => sum + Number(row.value || 0), 0) / totalRevenue * 100 : 0;
  const readinessSummary = dashboardReadinessSummary(context);
  const sourceCoverage = readinessSummary.sourceTotal
    ? Math.round((readinessSummary.sourceCount / readinessSummary.sourceTotal) * 100)
    : 0;
  const customerRisk = Number(context.commercial?.summary?.at_risk_customers || 0);
  const repurchaseDue = Number(context.commercial?.summary?.due_customers || 0);
  return {
    summary,
    kpis,
    products,
    customers,
    services,
    replenishment,
    pricing,
    imports,
    quoteSuppliers,
    productRevenue,
    serviceRevenue,
    totalRevenue,
    avgDailyRevenue,
    productMixPct,
    serviceMixPct,
    urgentStock,
    excessStock,
    buyNowStock,
    attentionStock,
    stockUniverse,
    stockOk,
    stockTotal: Math.max(buyNowStock + attentionStock + excessStock + stockOk, 1),
    pricingRows,
    negativeMargin,
    lowMarginOnly,
    missingCost,
    okMargin,
    lowMargin,
    cmvTotal,
    grossMarginPct,
    purchases,
    avgTicket,
    productRows,
    customerRowsData,
    serviceRowsData,
    brandRows,
    supplierRows,
    supplierEstimated,
    openOrders,
    openQuotes,
    productConcentration,
    customerConcentration,
    readinessSummary,
    sourceCoverage,
    customerCount: Number(kpis.customers || customers.length || 0),
    customerRisk,
    repurchaseDue,
    periodDays: context.periodDays,
    periodLabel: dashboardPeriodOptionLabel(context.periodDays),
    loading: context.loading,
  };
}

function normalizeDashboardCockpitWidgets(raw) {
  const known = new Set(DASHBOARD_COCKPIT_WIDGET_KEYS);
  const hidden = Array.isArray(raw?.hidden) ? raw.hidden.filter((key) => known.has(key)) : [];
  const rawOrder = Array.isArray(raw?.order) ? raw.order.filter((key) => known.has(key)) : [];
  const order = Array.from(new Set(rawOrder));
  DASHBOARD_COCKPIT_WIDGET_KEYS.forEach((key) => {
    if (!order.includes(key)) order.push(key);
  });
  return { hidden: Array.from(new Set(hidden)), order };
}

function dashboardCockpitWidgets() {
  if (state.dashboardCockpitWidgets) return normalizeDashboardCockpitWidgets(state.dashboardCockpitWidgets);
  try {
    return normalizeDashboardCockpitWidgets(JSON.parse(window.localStorage.getItem(DASHBOARD_COCKPIT_WIDGET_KEY) || "{}"));
  } catch {
    return normalizeDashboardCockpitWidgets({});
  }
}

function saveDashboardCockpitWidgets(layout) {
  const normalized = normalizeDashboardCockpitWidgets(layout);
  state.dashboardCockpitWidgets = normalized;
  try {
    window.localStorage.setItem(DASHBOARD_COCKPIT_WIDGET_KEY, JSON.stringify(normalized));
  } catch {
    // O layout visual continua funcionando mesmo sem persistência local.
  }
  return normalized;
}

function cockpitWidgetHidden(widgetKey, layout = dashboardCockpitWidgets()) {
  return layout.hidden.includes(widgetKey);
}

function cockpitWidgetClass(widgetKey, baseClass, layout = dashboardCockpitWidgets()) {
  return `cockpit-zone ${baseClass}${cockpitWidgetHidden(widgetKey, layout) ? " cockpit-widget-hidden" : ""}`;
}

function orderedDashboardCockpitWidgetKeys(layout = dashboardCockpitWidgets()) {
  return normalizeDashboardCockpitWidgets(layout).order;
}

function orderedDashboardCockpitWidgetDefs(layout = dashboardCockpitWidgets()) {
  return orderedDashboardCockpitWidgetKeys(layout).map((key) => DASHBOARD_COCKPIT_WIDGET_BY_KEY.get(key)).filter(Boolean);
}

function dashboardCockpitWidgetOrderKeysFromDom() {
  return Array.from(document.querySelectorAll("#dashboardCharts [data-dashboard-widget]"))
    .map((element) => element.dataset.dashboardWidget)
    .filter((key) => DASHBOARD_COCKPIT_WIDGET_KEYS.includes(key));
}

function sameDashboardCockpitOrder(a = [], b = []) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function cockpitWidgetOrderFromDom() {
  const current = dashboardCockpitWidgets();
  const order = dashboardCockpitWidgetOrderKeysFromDom();
  return normalizeDashboardCockpitWidgets({ ...current, order });
}

function saveDashboardCockpitWidgetOrder() {
  return saveDashboardCockpitWidgets(cockpitWidgetOrderFromDom());
}

function dashboardWidgetChartInstance(surface) {
  if (!surface?.id) return null;
  if (surface.id === "monthlyChart") return state.monthlyChart || state.generalCharts?.["#monthlyChart"] || null;
  return state.generalCharts?.[`#${surface.id}`] || null;
}

function copyDashboardWidgetSurfaceToImage(sourceSurface, cloneSurface, imageClass = "cockpit-popover-canvas") {
  const sourceCanvas = sourceSurface?.querySelector("canvas");
  if (!sourceCanvas || !cloneSurface) return;
  try {
    const image = document.createElement("img");
    image.className = imageClass;
    image.alt = "";
    image.src = sourceCanvas.toDataURL("image/png");
    image.style.width = `${sourceCanvas.clientWidth || sourceCanvas.width}px`;
    image.style.height = `${sourceCanvas.clientHeight || sourceCanvas.height}px`;
    cloneSurface.innerHTML = "";
    cloneSurface.appendChild(image);
  } catch {
    // Se o canvas nao puder ser copiado, o clone segue como preview estrutural.
  }
}

function renderDashboardWidgetChartsInPopover(source, popover) {
  const sourceSurfaces = Array.from(source.querySelectorAll(".dashboard-chart-surface"));
  const popoverSurfaces = Array.from(popover.querySelectorAll(".dashboard-chart-surface"));
  const charts = [];
  const uniqueBase = `dashboardPopoverChart${Date.now().toString(36)}`;
  sourceSurfaces.forEach((surface, index) => {
    const popoverSurface = popoverSurfaces[index];
    if (!popoverSurface) return;
    const sourceChart = dashboardWidgetChartInstance(surface);
    if (!window.echarts || !sourceChart || typeof sourceChart.getOption !== "function") {
      copyDashboardWidgetSurfaceToImage(surface, popoverSurface);
      return;
    }
    let option = null;
    try {
      option = sourceChart.getOption();
    } catch {
      option = null;
    }
    if (!option) {
      copyDashboardWidgetSurfaceToImage(surface, popoverSurface);
      return;
    }
    const chartId = `${uniqueBase}${index}`;
    const ariaLabel = surface.querySelector(".echart-surface")?.getAttribute("aria-label") || "";
    const chartLegend = surface.querySelector(".chart-legend")?.outerHTML || "";
    popoverSurface.innerHTML = `<div id="${chartId}" class="echart-surface" role="img"${ariaLabel ? ` aria-label="${escapeAttr(ariaLabel)}"` : ""}></div>${chartLegend}`;
    const chartTarget = popoverSurface.querySelector(".echart-surface");
    if (!chartTarget) return;
    let chart = null;
    try {
      chart = echarts.init(chartTarget, null, { renderer: "canvas" });
      chart.setOption(option, true);
      charts.push(chart);
      resizeChartSoon(chart);
    } catch {
      disposeChartInstance(chart);
      copyDashboardWidgetSurfaceToImage(surface, popoverSurface);
    }
  });
  return charts;
}

function resizeDashboardPopoverCharts(charts = []) {
  charts.forEach(resizeChartSoon);
}

function disposeDashboardPopoverCharts(charts = []) {
  charts.forEach(disposeChartInstance);
}

function dashboardCockpitPopoverRect(originRect) {
  const viewportWidth = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 0);
  const viewportHeight = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 0);
  const width = Math.min(920, Math.max(520, viewportWidth - 88));
  const height = Math.min(Math.max(360, viewportHeight - 96), Math.max(430, Math.min(620, originRect.height + 190)));
  return {
    left: Math.round((viewportWidth - width) / 2),
    top: Math.round((viewportHeight - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function applyDashboardCockpitPopoverRect(popover, rect) {
  popover.style.left = `${Math.round(rect.left)}px`;
  popover.style.top = `${Math.round(rect.top)}px`;
  popover.style.width = `${Math.round(rect.width)}px`;
  popover.style.height = `${Math.round(rect.height)}px`;
}

function clearDashboardCockpitWidgetExpanded({ instant = false } = {}) {
  const current = dashboardCockpitExpandedPopover;
  if (!current) {
    const popoverSelector = instant ? ".cockpit-widget-popover" : ".cockpit-widget-popover:not(.is-closing)";
    document.querySelectorAll(popoverSelector).forEach((element) => element.remove());
    document.querySelector("#dashboardCharts")?.classList.remove("has-widget-expanded");
    document.querySelectorAll("[data-dashboard-widget-expand][aria-expanded='true']").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
    return;
  }
  dashboardCockpitExpandedPopover = null;
  if (current.closeTimer) window.clearTimeout(current.closeTimer);
  current.source?.classList.remove("is-widget-popover-source");
  current.source?.querySelector("[data-dashboard-widget-expand]")?.setAttribute("aria-expanded", "false");
  document.querySelector("#dashboardCharts")?.classList.remove("has-widget-expanded");
  if (instant || !current.popover?.isConnected) {
    disposeDashboardPopoverCharts(current.charts);
    current.popover?.remove();
    return;
  }
  current.popover.classList.remove("is-open");
  current.popover.classList.add("is-closing");
  let removed = false;
  const handleCloseAnimationEnd = (event) => {
    if (event.target !== current.popover) return;
    if (event.animationName !== "cockpitPopoverClose") return;
    removePopover();
  };
  const removePopover = () => {
    if (removed) return;
    removed = true;
    current.popover.removeEventListener("animationend", handleCloseAnimationEnd);
    disposeDashboardPopoverCharts(current.charts);
    current.popover.remove();
  };
  current.popover.addEventListener("animationend", handleCloseAnimationEnd);
  current.closeTimer = window.setTimeout(removePopover, 520);
}

function toggleDashboardCockpitWidgetExpanded(widgetKey) {
  const widget = document.querySelector(`#dashboardCharts [data-dashboard-widget="${CSS.escape(widgetKey)}"]`);
  if (!widget) return;
  if (dashboardCockpitExpandedPopover?.key === widgetKey) {
    clearDashboardCockpitWidgetExpanded();
    return;
  }
  clearDashboardCockpitWidgetExpanded({ instant: true });
  const originRect = widget.getBoundingClientRect();
  const finalRect = dashboardCockpitPopoverRect(originRect);
  const popover = widget.cloneNode(true);
  popover.removeAttribute("id");
  popover.removeAttribute("data-dashboard-widget");
  popover.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  popover.querySelectorAll("[data-dashboard-widget]").forEach((element) => element.removeAttribute("data-dashboard-widget"));
  popover.classList.remove("is-widget-drag-source", "is-widget-expanded", "cockpit-drag-over", "cockpit-drag-before", "cockpit-drag-after");
  popover.classList.add("cockpit-widget-popover");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-modal", "false");
  popover.setAttribute("aria-label", `Detalhes de ${DASHBOARD_COCKPIT_WIDGET_BY_KEY.get(widgetKey)?.label || "bloco"}`);
  applyDashboardCockpitPopoverRect(popover, originRect);
  (document.querySelector(".workspace") || document.body).appendChild(popover);
  const popoverCharts = renderDashboardWidgetChartsInPopover(widget, popover);
  widget.classList.add("is-widget-popover-source");
  widget.querySelector("[data-dashboard-widget-expand]")?.setAttribute("aria-expanded", "true");
  document.querySelector("#dashboardCharts")?.classList.add("has-widget-expanded");
  dashboardCockpitExpandedPopover = { key: widgetKey, source: widget, popover, originRect, finalRect, closeTimer: 0, charts: popoverCharts };
  popover.getBoundingClientRect();
  window.requestAnimationFrame(() => {
    popover.classList.add("is-open");
    applyDashboardCockpitPopoverRect(popover, finalRect);
    resizeDashboardPopoverCharts(popoverCharts);
  });
  window.setTimeout(() => resizeDashboardPopoverCharts(popoverCharts), 360);
}

function dashboardCockpitHeader({ widgetKey, label, title, meta = "", legend = "", periods = dashboardCockpitPeriods(), loading = false }) {
  const status = loading ? `<em class="cockpit-period-loading">Carregando</em>` : meta ? `<em>${escapeHtml(meta)}</em>` : "";
  const dragHandle = `<button class="cockpit-widget-drag-handle" type="button" data-dashboard-widget-drag="${escapeAttr(widgetKey)}" title="Arrastar bloco" aria-label="Mover ${escapeAttr(label)}"><i data-lucide="grip-vertical"></i></button>`;
  const support = `
    <div class="cockpit-header-actions">
      ${status}
      ${dashboardPeriodSelect(widgetKey, periods)}
    </div>
  `;
  const expandControl = `<button class="cockpit-widget-expand-button" type="button" data-dashboard-widget-expand="${escapeAttr(widgetKey)}" title="Expandir bloco" aria-label="Expandir ${escapeAttr(label)}" aria-expanded="false"><i data-lucide="maximize-2"></i></button>`;
  const hideControl = `<button class="cockpit-widget-hide-button" type="button" data-dashboard-widget-hide="${escapeAttr(widgetKey)}" title="Ocultar bloco" aria-label="Ocultar ${escapeAttr(label)}"><i data-lucide="eye-off"></i></button>`;
  return `
    <header>
      ${dragHandle}
      <div class="cockpit-heading">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(title)}</strong>
      </div>
      ${support}
    </header>
    ${legend}
    ${expandControl}
    ${hideControl}
  `;
}

function dashboardCockpitAddCard(layout = dashboardCockpitWidgets()) {
  const hiddenWidgets = orderedDashboardCockpitWidgetDefs(layout).filter((item) => layout.hidden.includes(item.key));
  const hiddenByType = hiddenWidgets.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});
  const hiddenSummary = hiddenWidgets.length ? `${number(hiddenWidgets.length)} ocultos` : "Tudo visível";
  return `
    <section class="cockpit-bi-add" id="dashboardCockpitAddCard" aria-label="Adicionar blocos">
      <button class="cockpit-add-trigger" type="button" data-dashboard-widget-add-open aria-haspopup="dialog" aria-expanded="false" aria-controls="dashboardCockpitAddModal" title="Adicionar blocos">
        <i data-lucide="plus"></i>
      </button>
      <div class="cockpit-add-modal" id="dashboardCockpitAddModal" data-dashboard-widget-add-modal hidden>
        <div class="cockpit-add-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboardCockpitAddTitle">
          <header>
            <div>
              <span>Layout</span>
              <strong id="dashboardCockpitAddTitle">Adicionar blocos</strong>
            </div>
            <em>${escapeHtml(hiddenSummary)}</em>
            <button type="button" data-dashboard-widget-add-close aria-label="Fechar"><i data-lucide="x"></i></button>
          </header>
          <div class="cockpit-add-body">
            <div class="cockpit-add-counts" aria-label="Blocos disponíveis">
              <span><strong>${number(hiddenByType["Gráfico"] || 0)}</strong> Gráficos</span>
              <span><strong>${number(hiddenByType["KPIs"] || 0)}</strong> KPIs</span>
              <span><strong>${number(hiddenByType["Tabela"] || 0)}</strong> Tabelas</span>
            </div>
            <div class="cockpit-add-list">
              ${hiddenWidgets.length ? hiddenWidgets.map((item) => `
                <button type="button" data-dashboard-widget-add="${escapeAttr(item.key)}">
                  <i data-lucide="plus"></i>
                  <span>${escapeHtml(item.label)}</span>
                  <em>${escapeHtml(item.detail)}</em>
                </button>
              `).join("") : `<span class="cockpit-add-empty">Nenhum bloco oculto</span>`}
            </div>
            ${hiddenWidgets.length > 1 ? `<button class="cockpit-add-all" type="button" data-dashboard-widget-add-all><i data-lucide="list-plus"></i><span>Mostrar todos</span></button>` : ""}
          </div>
        </div>
      </div>
    </section>
  `;
}

function setDashboardAddModalOpen(open) {
  const card = document.querySelector("#dashboardCockpitAddCard");
  const modal = document.querySelector("#dashboardCockpitAddModal");
  const trigger = card?.querySelector("[data-dashboard-widget-add-open]");
  if (!card || !modal || !trigger) return;
  card.classList.toggle("open", open);
  if (open && modal.parentElement !== document.body) document.body.appendChild(modal);
  if (!open && modal.parentElement !== card) card.appendChild(modal);
  modal.hidden = !open;
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function handleDashboardAddModalClick(event) {
  const modal = event.target.closest("#dashboardCockpitAddModal");
  if (!modal) return;
  if (event.target.closest("[data-dashboard-widget-add-close]") || event.target.matches("[data-dashboard-widget-add-modal]")) {
    event.preventDefault();
    event.stopPropagation();
    setDashboardAddModalOpen(false);
    return;
  }
  const addWidgetButton = event.target.closest("[data-dashboard-widget-add]");
  if (addWidgetButton?.dataset.dashboardWidgetAdd) {
    event.preventDefault();
    event.stopPropagation();
    setDashboardAddModalOpen(false);
    setDashboardCockpitWidgetHidden(addWidgetButton.dataset.dashboardWidgetAdd, false);
    return;
  }
  if (event.target.closest("[data-dashboard-widget-add-all]")) {
    event.preventDefault();
    event.stopPropagation();
    setDashboardAddModalOpen(false);
    showAllDashboardCockpitWidgets();
  }
}

function renderDashboardCockpitAddCard(layout = dashboardCockpitWidgets()) {
  const existing = document.querySelector("#dashboardCockpitAddCard");
  if (!existing) return;
  document.querySelector("body > #dashboardCockpitAddModal")?.remove();
  existing.outerHTML = dashboardCockpitAddCard(layout);
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function applyDashboardCockpitWidgetVisibility(layout = dashboardCockpitWidgets()) {
  const hidden = new Set(layout.hidden);
  document.querySelectorAll("#dashboardCharts [data-dashboard-widget]").forEach((element) => {
    const isHidden = hidden.has(element.dataset.dashboardWidget);
    element.classList.toggle("cockpit-widget-hidden", isHidden);
    element.setAttribute("aria-hidden", isHidden ? "true" : "false");
  });
  renderDashboardCockpitAddCard(layout);
}

function setDashboardCockpitWidgetHidden(widgetKey, hidden) {
  if (!DASHBOARD_COCKPIT_WIDGET_KEYS.includes(widgetKey)) return;
  const layout = dashboardCockpitWidgets();
  const hiddenSet = new Set(layout.hidden);
  if (hidden) hiddenSet.add(widgetKey);
  else hiddenSet.delete(widgetKey);
  const normalized = saveDashboardCockpitWidgets({ ...layout, hidden: Array.from(hiddenSet) });
  applyDashboardCockpitWidgetVisibility(normalized);
  if (!hidden) scheduleChartRecovery();
}

function showAllDashboardCockpitWidgets() {
  const normalized = saveDashboardCockpitWidgets({ ...dashboardCockpitWidgets(), hidden: [] });
  applyDashboardCockpitWidgetVisibility(normalized);
  scheduleChartRecovery();
}

function dashboardPreferencesMarkup(layout = dashboardCockpitWidgets()) {
  const hidden = new Set(layout.hidden);
  const total = DASHBOARD_COCKPIT_WIDGETS.length;
  const visible = Math.max(0, total - hidden.size);
  return `
    <section class="dashboard-preferences">
      <header class="dashboard-preferences-head">
        <span>Usuário</span>
        <strong>Painel inicial</strong>
        <em>${number(visible)} de ${number(total)} blocos visíveis neste acesso.</em>
      </header>
      <div class="dashboard-preference-list">
        ${orderedDashboardCockpitWidgetDefs(layout).map((item) => {
          const isHidden = hidden.has(item.key);
          return `
            <button class="dashboard-preference-row ${isHidden ? "muted" : ""}" type="button" data-dashboard-preference-toggle="${escapeAttr(item.key)}" aria-pressed="${isHidden ? "false" : "true"}">
              <i data-lucide="${isHidden ? "eye-off" : "eye"}"></i>
              <span>
                <strong>${escapeHtml(item.label)}</strong>
                <em>${escapeHtml(item.type)} - ${escapeHtml(item.detail)}</em>
              </span>
              <b>${isHidden ? "Oculto" : "Visível"}</b>
            </button>
          `;
        }).join("")}
      </div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" data-dashboard-preferences-show-all>Mostrar todos</button>
        <button class="action-button" type="button" data-dashboard-preferences-close>Concluir</button>
      </div>
    </section>
  `;
}

function refreshDashboardPreferencesModal(body) {
  body.innerHTML = dashboardPreferencesMarkup();
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function openDashboardPreferencesModal() {
  if (typeof setView === "function") setView("dashboard");
  openModal(
    "Personalizar painel",
    dashboardPreferencesMarkup(),
    (body) => {
      body.addEventListener("click", (event) => {
        const toggle = event.target.closest("[data-dashboard-preference-toggle]");
        if (toggle?.dataset.dashboardPreferenceToggle) {
          const key = toggle.dataset.dashboardPreferenceToggle;
          const currentlyHidden = dashboardCockpitWidgets().hidden.includes(key);
          setDashboardCockpitWidgetHidden(key, !currentlyHidden);
          refreshDashboardPreferencesModal(body);
          return;
        }
        if (event.target.closest("[data-dashboard-preferences-show-all]")) {
          showAllDashboardCockpitWidgets();
          refreshDashboardPreferencesModal(body);
          return;
        }
        if (event.target.closest("[data-dashboard-preferences-close]")) closeModal();
      });
      if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
    },
    { modalClass: "dashboard-preferences-modal" }
  );
}

window.openDashboardPreferencesModal = openDashboardPreferencesModal;

function setupDashboardCockpitOrdering(target) {
  if (!target || target.dataset.cockpitOrderingReady === "true") return;
  target.dataset.cockpitOrderingReady = "true";
  let pointerDrag = null;
  const clearDragState = () => {
    target.classList.remove("is-cockpit-dragging");
    target.querySelectorAll("[data-dashboard-widget]").forEach((element) => {
      element.classList.remove("is-widget-drag-source", "cockpit-drag-over", "cockpit-drag-before", "cockpit-drag-after");
    });
    target.querySelectorAll(".cockpit-drag-placeholder").forEach((element) => element.remove());
    document.querySelectorAll(".cockpit-drag-float").forEach((element) => element.remove());
    document.querySelectorAll(".cockpit-drop-slot").forEach((element) => element.remove());
  };
  const dedupeDashboardCockpitDom = (preferredWidget = null) => {
    const widgets = Array.from(target.querySelectorAll("[data-dashboard-widget]"));
    DASHBOARD_COCKPIT_WIDGET_KEYS.forEach((key) => {
      const matches = widgets.filter((element) => element.dataset.dashboardWidget === key);
      if (matches.length <= 1) return;
      const keep = preferredWidget?.dataset.dashboardWidget === key && matches.includes(preferredWidget)
        ? preferredWidget
        : matches[0];
      matches.forEach((element) => {
        if (element !== keep) element.remove();
      });
    });
  };
  const visibleDraggableWidgets = (dragging) => Array.from(target.querySelectorAll("[data-dashboard-widget]"))
    .filter((element) => element !== dragging && !element.classList.contains("cockpit-widget-hidden") && !element.classList.contains("is-widget-drag-source"));
  const dashboardAddCard = () => target.querySelector("#dashboardCockpitAddCard");
  const nextInsertionReference = (widget, dragging) => {
    let node = widget?.nextElementSibling || null;
    while (node && node === dragging) node = node.nextElementSibling;
    return node || dashboardAddCard() || null;
  };
  const widgetOrderIndex = (key, order = []) => {
    const index = order.indexOf(key);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  };
  const visibleWidgetsForAnimation = () => Array.from(target.querySelectorAll("[data-dashboard-widget]"))
    .filter((element) => !element.classList.contains("cockpit-widget-hidden"));
  const captureWidgetRects = () => new Map(visibleWidgetsForAnimation().map((element) => [element, element.getBoundingClientRect()]));
  const cleanupWidgetAnimation = (element) => {
    element.style.transition = "";
    element.style.transform = "";
    element.style.opacity = "";
    element.style.willChange = "";
  };
  const animateWidgetsFromRects = (beforeRects, movingWidget, previewRect) => {
    const widgets = visibleWidgetsForAnimation();
    widgets.forEach((element) => {
      const after = element.getBoundingClientRect();
      const before = element === movingWidget && previewRect ? previewRect : beforeRects.get(element);
      if (!before) return;
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      element.style.transition = "none";
      element.style.willChange = "transform";
      element.style.transform = `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0)`;
      if (element === movingWidget) element.style.opacity = "0.98";
      element.getBoundingClientRect();
      window.requestAnimationFrame(() => {
        element.style.transition = "transform 330ms cubic-bezier(0.2, 0.85, 0.18, 1), opacity 190ms ease";
        element.style.transform = "";
        if (element === movingWidget) element.style.opacity = "";
      });
      const handleTransitionEnd = (transitionEvent) => {
        if (transitionEvent.propertyName && transitionEvent.propertyName !== "transform") return;
        element.removeEventListener("transitionend", handleTransitionEnd);
        cleanupWidgetAnimation(element);
      };
      element.addEventListener("transitionend", handleTransitionEnd);
      window.setTimeout(() => {
        element.removeEventListener("transitionend", handleTransitionEnd);
        cleanupWidgetAnimation(element);
      }, 430);
    });
  };
  const widgetForPointer = (dragging, clientX, clientY) => {
    const widgets = visibleDraggableWidgets(dragging);
    const boardRect = target.getBoundingClientRect();
    const boardPad = 18;
    if (
      clientX < boardRect.left - boardPad ||
      clientX > boardRect.right + boardPad ||
      clientY < boardRect.top - boardPad ||
      clientY > boardRect.bottom + boardPad
    ) {
      return null;
    }
    const sourceRect = dragging?.getBoundingClientRect();
    if (
      sourceRect &&
      clientX >= sourceRect.left &&
      clientX <= sourceRect.right &&
      clientY >= sourceRect.top &&
      clientY <= sourceRect.bottom
    ) {
      return null;
    }
    const rects = widgets.map((element) => ({ element, rect: element.getBoundingClientRect() }));
    const direct = rects.find(({ rect }) => (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ));
    if (direct) return direct.element;
    const rowCandidates = rects.filter(({ rect }) => {
      const rowPad = Math.min(30, Math.max(14, rect.height * 0.1));
      return clientY >= rect.top - rowPad && clientY <= rect.bottom + rowPad;
    });
    if (!rowCandidates.length) return null;
    const rowLeft = Math.min(...rowCandidates.map(({ rect }) => rect.left));
    const rowRight = Math.max(...rowCandidates.map(({ rect }) => rect.right));
    const rowPadX = 28;
    if (clientX < rowLeft - rowPadX || clientX > rowRight + rowPadX) return null;
    return rowCandidates
      .map(({ element, rect }) => {
        const columnPad = Math.min(36, Math.max(16, rect.width * 0.07));
        const outsideX = Math.max(rect.left - clientX, 0, clientX - rect.right);
        const outsideY = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
        if (outsideX > columnPad || outsideY > 30) return null;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return {
          element,
          score: outsideX * 4 + outsideY * 3 + Math.hypot(clientX - centerX, clientY - centerY) * 0.08,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)[0]?.element || null;
  };
  const clearDropTarget = (drag) => {
    target.querySelectorAll(".cockpit-drag-over").forEach((element) => element.classList.remove("cockpit-drag-over"));
    if (!drag) return;
    drag.dropReference = null;
    drag.lastSlotKey = "source";
    drag.pendingSlotKey = "";
    drag.pendingSlotSince = 0;
    const sourceRect = drag.widget?.getBoundingClientRect();
    if (sourceRect) {
      updateDropSlotRect(drag.dropSlot, sourceRect);
    } else {
      drag.dropSlot?.classList.remove("is-visible");
    }
  };
  const copyCanvasesToPreview = (source, clone) => {
    const sourceCanvases = Array.from(source.querySelectorAll("canvas"));
    const cloneCanvases = Array.from(clone.querySelectorAll("canvas"));
    cloneCanvases.forEach((canvas, index) => {
      const sourceCanvas = sourceCanvases[index];
      if (!sourceCanvas) return;
      try {
        const image = document.createElement("img");
        image.className = "cockpit-drag-canvas";
        image.alt = "";
        image.src = sourceCanvas.toDataURL("image/png");
        image.style.width = `${sourceCanvas.clientWidth || sourceCanvas.width}px`;
        image.style.height = `${sourceCanvas.clientHeight || sourceCanvas.height}px`;
        canvas.replaceWith(image);
      } catch {
        // Se o canvas nao puder ser copiado, o clone segue como preview estrutural.
      }
    });
  };
  const createDragPreview = (widget, rect) => {
    const clone = widget.cloneNode(true);
    clone.removeAttribute("id");
    clone.removeAttribute("data-dashboard-widget");
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    copyCanvasesToPreview(widget, clone);
    clone.classList.remove("is-widget-drag-source", "cockpit-drag-over", "cockpit-drag-before", "cockpit-drag-after");
    clone.classList.add("cockpit-drag-float");
    clone.style.width = `${Math.round(rect.width)}px`;
    clone.style.height = `${Math.round(rect.height)}px`;
    clone.style.transform = `translate3d(${Math.round(rect.left)}px, ${Math.round(rect.top)}px, 0) scale(1)`;
    document.body.appendChild(clone);
    return clone;
  };
  const createDropSlot = () => {
    const slot = document.createElement("div");
    slot.className = "cockpit-drop-slot";
    slot.setAttribute("aria-hidden", "true");
    document.body.appendChild(slot);
    return slot;
  };
  const updateDropSlotRect = (slot, rect) => {
    if (!slot || !rect) return;
    slot.style.width = `${Math.round(rect.width)}px`;
    slot.style.height = `${Math.round(rect.height)}px`;
    slot.style.transform = `translate3d(${Math.round(rect.left)}px, ${Math.round(rect.top)}px, 0)`;
    slot.classList.add("is-visible");
  };
  const slotForPointer = (dragging, clientX, clientY) => {
    const drag = pointerDrag;
    const widget = widgetForPointer(dragging, clientX, clientY);
    if (!dragging || !widget || widget === dragging || widget.classList.contains("cockpit-widget-hidden") || widget.closest("#dashboardCharts") !== target) return null;
    clearDropTarget(null);
    const rect = widget.getBoundingClientRect();
    const insideWidget = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    const sameRow = clientY >= rect.top - 12 && clientY <= rect.bottom + 12;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deadX = Math.min(54, Math.max(18, rect.width * 0.16));
    const deadY = Math.min(34, Math.max(14, rect.height * 0.14));
    let before;
    if (insideWidget && drag?.startOrder) {
      before = widgetOrderIndex(dragging.dataset.dashboardWidget, drag.startOrder) > widgetOrderIndex(widget.dataset.dashboardWidget, drag.startOrder);
    } else if (sameRow) {
      if (!insideWidget && clientX > centerX - deadX && clientX < centerX + deadX) {
        return null;
      }
      before = clientX < centerX;
    } else {
      if (!insideWidget && clientY > centerY - deadY && clientY < centerY + deadY) {
        return null;
      }
      before = clientY < centerY;
    }
    const reference = before ? widget : nextInsertionReference(widget, dragging);
    const slotKey = `${widget.dataset.dashboardWidget || ""}:${before ? "before" : "after"}`;
    return { reference, rect, slotKey, widget };
  };
  const moveDraggedWidget = (dragging, clientX, clientY) => {
    const drag = pointerDrag;
    const slot = slotForPointer(dragging, clientX, clientY);
    if (!drag) return;
    if (!slot) {
      clearDropTarget(drag);
      return;
    }
    slot.widget.classList.add("cockpit-drag-over");
    drag.dropReference = slot.reference;
    drag.lastSlotKey = slot.slotKey;
    drag.pendingSlotKey = "";
    drag.pendingSlotSince = 0;
    updateDropSlotRect(drag.dropSlot, slot.rect);
  };
  const updateDraggedWidgetPosition = (drag, clientX, clientY) => {
    if (!drag?.preview) return;
    drag.preview.style.transform = `translate3d(${Math.round(clientX - drag.offsetX)}px, ${Math.round(clientY - drag.offsetY)}px, 0) scale(1.012)`;
  };
  const scheduleDragUpdate = (drag, event) => {
    if (!drag) return;
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    if (drag.frame) return;
    drag.frame = window.requestAnimationFrame(() => {
      drag.frame = null;
      updateDraggedWidgetPosition(drag, drag.clientX, drag.clientY);
      moveDraggedWidget(drag.widget, drag.clientX, drag.clientY);
      const edge = 72;
      const step = drag.clientY > window.innerHeight - edge ? 18 : drag.clientY < edge ? -18 : 0;
      if (step) window.scrollBy({ top: step, behavior: "auto" });
    });
  };
  const finishPointerDrag = (event, save = true) => {
    if (!pointerDrag) return;
    const { handle, mode, widget, preview, frame } = pointerDrag;
    if (frame) window.cancelAnimationFrame(frame);
    if (event?.clientX !== undefined && event?.clientY !== undefined) {
      pointerDrag.clientX = event.clientX;
      pointerDrag.clientY = event.clientY;
    }
    if (mode === "pointer" && handle?.releasePointerCapture && event?.pointerId !== undefined) {
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch {
        // O ponteiro pode ja ter sido liberado pelo navegador.
      }
    }
    const beforeOrder = dashboardCockpitWidgetOrderKeysFromDom();
    const beforeRects = captureWidgetRects();
    const previewRect = preview?.getBoundingClientRect() || null;
    const finalSlot = save ? slotForPointer(widget, pointerDrag.clientX, pointerDrag.clientY) : null;
    const finalReference = finalSlot?.reference || pointerDrag.dropReference;
    let orderChanged = false;
    if (save && finalReference && finalReference !== widget) {
      target.insertBefore(widget, finalReference);
      dedupeDashboardCockpitDom(widget);
      orderChanged = !sameDashboardCockpitOrder(beforeOrder, dashboardCockpitWidgetOrderKeysFromDom());
    }
    dedupeDashboardCockpitDom(widget);
    if (save && orderChanged) saveDashboardCockpitWidgetOrder();
    document.querySelectorAll(".cockpit-drag-float, .cockpit-drop-slot").forEach((element) => element.remove());
    pointerDrag = null;
    clearDragState();
    if (orderChanged) animateWidgetsFromRects(beforeRects, widget, previewRect);
  };
  const beginWidgetPointerDrag = (event, mode) => {
    if (event.target.closest("button:not([data-dashboard-widget-drag]), a, input, select, textarea, .cockpit-period-menu")) return false;
    const widget = event.target.closest("[data-dashboard-widget]");
    const handle = event.target.closest("[data-dashboard-widget-drag], .cockpit-heading") || widget;
    if (!widget || widget.classList.contains("cockpit-widget-hidden") || event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    closeDashboardPeriodMenus();
    clearDragState();
    const rect = widget.getBoundingClientRect();
    const preview = createDragPreview(widget, rect);
    const dropSlot = createDropSlot();
    pointerDrag = {
      widget,
      handle,
      mode,
      preview,
      dropSlot,
      dropReference: null,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      clientX: event.clientX,
      clientY: event.clientY,
      frame: null,
      startOrder: dashboardCockpitWidgetOrderKeysFromDom(),
      lastSlotKey: "source",
      pendingSlotKey: "",
      pendingSlotSince: 0,
    };
    updateDraggedWidgetPosition(pointerDrag, event.clientX, event.clientY);
    clearDropTarget(pointerDrag);
    widget.classList.add("is-widget-drag-source");
    target.classList.add("is-cockpit-dragging");
    return true;
  };
  target.addEventListener("pointerdown", (event) => {
    if (!beginWidgetPointerDrag(event, "pointer")) return;
    const { handle } = pointerDrag;
    if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
  });
  target.addEventListener("mousedown", (event) => {
    if (pointerDrag) return;
    beginWidgetPointerDrag(event, "mouse");
  });
  document.addEventListener("pointermove", (event) => {
    if (!pointerDrag || pointerDrag.mode !== "pointer") return;
    event.preventDefault();
    scheduleDragUpdate(pointerDrag, event);
  }, true);
  document.addEventListener("pointerup", (event) => {
    if (pointerDrag?.mode === "pointer") finishPointerDrag(event, true);
  }, true);
  document.addEventListener("pointercancel", (event) => {
    if (pointerDrag?.mode === "pointer") finishPointerDrag(event, false);
  }, true);
  document.addEventListener("mousemove", (event) => {
    if (!pointerDrag || pointerDrag.mode !== "mouse") return;
    event.preventDefault();
    scheduleDragUpdate(pointerDrag, event);
  }, true);
  document.addEventListener("mouseup", (event) => {
    if (pointerDrag?.mode === "mouse") finishPointerDrag(event, true);
  }, true);
  window.addEventListener("blur", () => {
    if (pointerDrag) finishPointerDrag(null, false);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && pointerDrag) finishPointerDrag(null, false);
  });
  target.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });
}

function closeDashboardPeriodMenus(except = null) {
  document.querySelectorAll(".cockpit-period-menu.open").forEach((menu) => {
    if (menu === except) return;
    menu.classList.remove("open");
    menu.querySelector("[data-dashboard-widget-period-toggle]")?.setAttribute("aria-expanded", "false");
  });
}

async function setDashboardCockpitWidgetPeriod(widgetKey, periodDays) {
  if (!DASHBOARD_COCKPIT_WIDGET_KEYS.includes(widgetKey)) return;
  closeDashboardPeriodMenus();
  const periods = dashboardCockpitPeriods();
  periods[widgetKey] = normalizeDashboardPeriod(periodDays);
  saveDashboardCockpitPeriods(periods);
  const widget = document.querySelector(`[data-dashboard-widget="${widgetKey}"]`);
  widget?.classList.add("cockpit-period-fetching");
  try {
    if (typeof ensurePeriodWorkspaceData === "function") await ensurePeriodWorkspaceData(periods[widgetKey]);
  } catch (error) {
    console.error("Falha ao carregar período do bloco:", error);
  } finally {
    widget?.classList.remove("cockpit-period-fetching");
  }
  renderGeneralMap();
}

function renderDashboardCockpit({
  kpis = {},
  summary,
  products = [],
  customers = [],
  services = [],
  replenishment = {},
  pricing = {},
  imports = {},
  quoteSuppliers = [],
  supplierRows = [],
  totalRevenue,
  productRevenue,
  serviceRevenue,
  avgDailyRevenue,
  productMixPct,
  serviceMixPct,
  productRows,
  customerRowsData,
  serviceRowsData,
  brandRows,
  stockOk,
  urgentStock,
  buyNowStock,
  attentionStock,
  excessStock,
  lowMargin,
  negativeMargin,
  marginOpportunities,
  customerCount,
  customerRisk,
  repurchaseDue,
  sourceCoverage,
  readinessSummary,
}) {
  const target = document.querySelector("#dashboardCharts");
  if (!target) return;
  clearDashboardCockpitWidgetExpanded({ instant: true });
  target.classList.add("retail-cockpit-board");
  const monthlyRows = monthlyRowsForDisplay(summary.monthly || [], summary.monthly_granularity);
  const monthlyValues = monthlyRows.map((row) => Number(row.product_revenue || 0) + Number(row.service_revenue || 0));
  const last = monthlyValues.at(-1) || 0;
  const previous = monthlyValues.length > 1 ? monthlyValues.at(-2) || 0 : 0;
  const delta = previous ? ((last - previous) / previous) * 100 : 0;
  const stockTotal = Math.max(buyNowStock + attentionStock + excessStock + stockOk, 1);
  const pricingRows = pricing.rows || pricing.items || [];
  const missingCost = Number(pricing.summary?.missing_cost || 0);
  const okMargin = Math.max(0, Number(pricing.summary?.products || pricingRows.length || 0) - negativeMargin - Number(pricing.summary?.low_margin || 0) - missingCost);
  const lowMarginOnly = Math.max(0, Number(pricing.summary?.low_margin || 0));
  const cmvTotal = pricingRows.reduce((sum, row) => {
    const quantity = Number(row.quantity || 0);
    const cost = Number(row.effective_cost || 0);
    return sum + (quantity > 0 && cost > 0 ? quantity * cost : 0);
  }, 0);
  const grossMargin = cmvTotal > 0 ? Math.max(0, productRevenue - cmvTotal) : 0;
  const grossMarginPct = productRevenue > 0 && cmvTotal > 0 ? (grossMargin / productRevenue) * 100 : null;
  const purchases = customers.reduce((sum, row) => sum + Number(row.purchases || row.purchase_days || 0), 0);
  const avgTicket = purchases > 0 ? totalRevenue / purchases : 0;
  const supplierEstimated = quoteSuppliers.reduce((sum, row) => sum + Number(row.estimated_value || 0), 0);
  const openOrders = quoteSuppliers.reduce((sum, row) => sum + Number(row.pending_order_count || 0), 0);
  const openQuotes = quoteSuppliers.reduce((sum, row) => sum + Number(row.open_quote_count || 0), 0);
  const productConcentration = productRevenue ? productRows.reduce((sum, row) => sum + Number(row.value || 0), 0) / productRevenue * 100 : 0;
  const customerConcentration = totalRevenue ? customerRowsData.reduce((sum, row) => sum + Number(row.value || 0), 0) / totalRevenue * 100 : 0;
  const mixLedgerRows = [
    { label: "Produtos", value: compactMoney(productRevenue), rawValue: productRevenue, detail: `${number(productMixPct)}%` },
    { label: "Serviços", value: compactMoney(serviceRevenue), rawValue: serviceRevenue, detail: `${number(serviceMixPct)}%` },
  ];
  const stockStatusLedgerRows = [
    { label: "Ruptura", value: number(buyNowStock), rawValue: buyNowStock, detail: "compra imediata", tone: buyNowStock ? "danger" : "" },
    { label: "Cobertura", value: number(attentionStock), rawValue: attentionStock, detail: "atenção" },
    { label: "Excesso", value: number(excessStock), rawValue: excessStock, detail: "saldo acima" },
    { label: "Equilibrado", value: number(stockOk), rawValue: stockOk, detail: "sem sinal" },
  ];
  const marginStatusLedgerRows = [
    { label: "Negativa", value: number(negativeMargin), rawValue: negativeMargin, detail: "itens", tone: negativeMargin ? "danger" : "" },
    { label: "Baixa", value: number(lowMarginOnly), rawValue: lowMarginOnly, detail: "itens", tone: lowMarginOnly ? "warn" : "" },
    { label: "Custo ausente", value: number(missingCost), rawValue: missingCost, detail: "itens" },
    { label: "Sem sinal", value: number(okMargin), rawValue: okMargin, detail: "itens" },
  ];
  const productLedgerRows = products
    .filter((row) => Number(row.revenue || 0) > 0)
    .slice(0, 5)
    .map((row) => ({
      label: row.name || "Produto",
      value: compactMoney(row.revenue || 0),
      rawValue: Number(row.revenue || 0),
      detail: `${number(row.quantity || 0)} un. · ${number(row.share || (productRevenue ? Number(row.revenue || 0) / productRevenue * 100 : 0))}%`,
      view: "products",
    }));
  const customerLedgerRows = customers
    .filter((row) => Number(row.revenue || 0) > 0)
    .slice(0, 5)
    .map((row) => ({
      label: row.name || "Cliente",
      value: compactMoney(row.revenue || 0),
      rawValue: Number(row.revenue || 0),
      detail: `${number(row.purchases || 0)} compras · ${compactMoney(Number(row.purchases || 0) ? Number(row.revenue || 0) / Number(row.purchases || 0) : 0)} ticket`,
      view: "customers",
    }));
  const supplierChartRows = quoteSuppliers.length
    ? quoteSuppliers
      .filter((row) => Number(row.estimated_value || row.stock_value || 0) > 0)
      .sort((a, b) => Number(b.estimated_value || b.stock_value || 0) - Number(a.estimated_value || a.stock_value || 0))
      .slice(0, 7)
      .map((row) => ({ label: row.supplier_name || "Fornecedor", value: Number(row.estimated_value || row.stock_value || 0) }))
    : supplierRows.slice(0, 7);
  const supplierLedgerRows = (quoteSuppliers.length ? quoteSuppliers : supplierRows)
    .slice()
    .sort((a, b) => Number(b.estimated_value || b.value || 0) - Number(a.estimated_value || a.value || 0))
    .slice(0, 5)
    .map((row) => ({
      label: row.supplier_name || row.label || "Fornecedor",
      value: compactMoney(row.estimated_value || row.value || 0),
      rawValue: Number(row.estimated_value || row.value || 0),
      detail: `${row.minimum_order_value ? `${compactMoney(row.minimum_order_value)} mín.` : "mín. -"} · ${number(Number(row.pending_order_count || 0) + Number(row.open_quote_count || 0))} abertos`,
      view: "quotes",
    }));
  const stockLedgerRows = (replenishment.rows || [])
    .slice()
    .sort((a, b) => Number(b.estimated_value || b.suggested_quantity || 0) - Number(a.estimated_value || a.suggested_quantity || 0))
    .slice(0, 5)
    .map((row) => ({
      label: row.name || row.product_name || "Produto",
      value: row.coverage_days === null || row.coverage_days === undefined ? `${number(row.stock_units || row.current_stock || 0)} un.` : `${number(row.coverage_days)}d`,
      rawValue: Number(row.estimated_value || row.suggested_quantity || 0),
      detail: `${number(row.stock_units || row.current_stock || 0)} estoque · ${number(row.suggested_quantity || row.technical_quantity || 0)} sugestão · ${compactMoney(row.estimated_value || 0)}`,
      view: "stock",
    }));
  const marginLedgerRows = pricingRows
    .filter((row) => row.margin_pct !== null && row.margin_pct !== undefined)
    .slice()
    .sort((a, b) => Number(a.margin_pct || 0) - Number(b.margin_pct || 0))
    .slice(0, 5)
    .map((row) => ({
      label: row.name || "Produto",
      value: `${number(row.margin_pct || 0)}%`,
      rawValue: Math.max(1, Math.abs(Number(row.margin_pct || 0))),
      detail: `${compactMoney(row.revenue || 0)} receita · ${row.effective_cost ? `${money(row.effective_cost)} CMV un.` : "CMV -"}`,
      view: "pricing",
      tone: Number(row.margin_pct || 0) < 0 ? "danger" : Number(row.margin_pct || 0) < 20 ? "warn" : "",
    }));
  const serviceLedgerRows = services
    .filter((row) => Number(row.revenue || 0) > 0)
    .slice(0, 4)
    .map((row) => ({
      label: row.name || "Serviço",
      value: compactMoney(row.revenue || 0),
      rawValue: Number(row.revenue || 0),
      detail: `${number(row.quantity || 0)} qtd. · ${number(serviceRevenue ? Number(row.revenue || 0) / serviceRevenue * 100 : 0)}%`,
      view: "opportunities",
    }));
  const importRows = dashboardBiImportRows(imports, readinessSummary);
  const importLedgerRows = importRows.map((row) => ({
    label: row.fonte,
    value: row.linhas,
    rawValue: Number(String(row.linhas).replace(/\D/g, "")) || (row.linhas === "Sim" ? 1 : 0),
    detail: row.atualizacao,
    view: "imports",
  }));
  const moduleScoreRows = dashboardBiModuleScoreRows(imports, readinessSummary);
  const cockpitLayout = dashboardCockpitWidgets();
  const cockpitPeriods = dashboardCockpitPeriods();
  if (typeof ensurePeriodWorkspaceData === "function") {
    const missingPeriods = Array.from(new Set(Object.values(cockpitPeriods)))
      .filter((periodDays) => typeof getCachedPeriodWorkspaceData !== "function" || !getCachedPeriodWorkspaceData(periodDays));
    if (missingPeriods.length) {
      Promise.allSettled(missingPeriods.map((periodDays) => ensurePeriodWorkspaceData(periodDays)))
        .then(() => renderGeneralMap());
    }
  }
  const fallbackContext = { summary, products, customers, services, replenishment, pricing, imports, quoteSuppliers };
  const revenueMetrics = dashboardMetricBundle(dashboardWidgetContext("receita", fallbackContext, cockpitPeriods));
  const indicatorMetrics = dashboardMetricBundle(dashboardWidgetContext("indicadores", fallbackContext, cockpitPeriods));
  const mixMetrics = dashboardMetricBundle(dashboardWidgetContext("mix", fallbackContext, cockpitPeriods));
  const stockStatusMetrics = dashboardMetricBundle(dashboardWidgetContext("estoque-status", fallbackContext, cockpitPeriods));
  const marginStatusMetrics = dashboardMetricBundle(dashboardWidgetContext("margem-status", fallbackContext, cockpitPeriods));
  const productMetrics = dashboardMetricBundle(dashboardWidgetContext("produtos-abc", fallbackContext, cockpitPeriods));
  const customerMetrics = dashboardMetricBundle(dashboardWidgetContext("clientes", fallbackContext, cockpitPeriods));
  const supplierMetrics = dashboardMetricBundle(dashboardWidgetContext("fornecedores", fallbackContext, cockpitPeriods));
  const stockCoverageMetrics = dashboardMetricBundle(dashboardWidgetContext("estoque-cobertura", fallbackContext, cockpitPeriods));
  const marginCmvMetrics = dashboardMetricBundle(dashboardWidgetContext("margem-cmv", fallbackContext, cockpitPeriods));
  const serviceMetrics = dashboardMetricBundle(dashboardWidgetContext("servicos", fallbackContext, cockpitPeriods));
  const dataMetrics = dashboardMetricBundle(dashboardWidgetContext("dados", fallbackContext, cockpitPeriods));
  const revenueMonthlyRows = monthlyRowsForDisplay(revenueMetrics.summary.monthly || [], revenueMetrics.summary.monthly_granularity);
  const revenueMonthlyValues = revenueMonthlyRows.map((row) => Number(row.product_revenue || 0) + Number(row.service_revenue || 0));
  const revenuePrevious = revenueMonthlyValues.length > 1 ? revenueMonthlyValues.at(-2) || 0 : 0;
  const revenueLast = revenueMonthlyValues.at(-1) || 0;
  const revenueDelta = revenuePrevious ? ((revenueLast - revenuePrevious) / revenuePrevious) * 100 : 0;
  const supplierChartRowsByPeriod = supplierMetrics.quoteSuppliers.length
    ? supplierMetrics.quoteSuppliers
      .filter((row) => Number(row.estimated_value || row.stock_value || 0) > 0)
      .sort((a, b) => Number(b.estimated_value || b.stock_value || 0) - Number(a.estimated_value || a.stock_value || 0))
      .slice(0, 7)
      .map((row) => ({ label: row.supplier_name || "Fornecedor", value: Number(row.estimated_value || row.stock_value || 0) }))
    : supplierMetrics.supplierRows.slice(0, 7);
  const stockLedgerRowsByPeriod = (stockCoverageMetrics.replenishment.rows || [])
    .slice()
    .sort((a, b) => Number(b.estimated_value || b.suggested_quantity || 0) - Number(a.estimated_value || a.suggested_quantity || 0))
    .slice(0, 5)
    .map((row) => ({
      label: row.name || row.product_name || "Produto",
      value: row.coverage_days === null || row.coverage_days === undefined ? `${number(row.stock_units || row.current_stock || 0)} un.` : `${number(row.coverage_days)}d`,
      rawValue: Number(row.estimated_value || row.suggested_quantity || 0),
      detail: `${number(row.stock_units || row.current_stock || 0)} estoque · ${number(row.suggested_quantity || row.technical_quantity || 0)} sugestão · ${compactMoney(row.estimated_value || 0)}`,
      view: "stock",
    }));
  const marginLedgerRowsByPeriod = marginCmvMetrics.pricingRows
    .filter((row) => row.margin_pct !== null && row.margin_pct !== undefined)
    .slice()
    .sort((a, b) => Number(a.margin_pct || 0) - Number(b.margin_pct || 0))
    .slice(0, 5)
    .map((row) => ({
      label: row.name || "Produto",
      value: `${number(row.margin_pct || 0)}%`,
      rawValue: Math.max(1, Math.abs(Number(row.margin_pct || 0))),
      detail: `${compactMoney(row.revenue || 0)} receita · ${row.effective_cost ? `${money(row.effective_cost)} CMV un.` : "CMV -"}`,
      view: "pricing",
      tone: Number(row.margin_pct || 0) < 0 ? "danger" : Number(row.margin_pct || 0) < 20 ? "warn" : "",
    }));
  const moduleScoreRowsByPeriod = dashboardBiModuleScoreRows(dataMetrics.imports, dataMetrics.readinessSummary);
  const mixProductRevenue = Number(mixMetrics.productRevenue || 0);
  const mixServiceRevenue = Number(mixMetrics.serviceRevenue || 0);
  const mixTotalRevenue = mixProductRevenue + mixServiceRevenue;
  const mixProductShare = mixTotalRevenue ? Math.round((mixProductRevenue / mixTotalRevenue) * 100) : 0;
  const mixServiceShare = mixTotalRevenue ? Math.round((mixServiceRevenue / mixTotalRevenue) * 100) : 0;
  const stockStatusTotal = Number(stockStatusMetrics.buyNowStock || 0)
    + Number(stockStatusMetrics.attentionStock || 0)
    + Number(stockStatusMetrics.excessStock || 0)
    + Number(stockStatusMetrics.stockOk || 0);
  const stockAttentionTotal = Number(stockStatusMetrics.buyNowStock || 0)
    + Number(stockStatusMetrics.attentionStock || 0)
    + Number(stockStatusMetrics.excessStock || 0);
  const marginStatusTotal = Number(marginStatusMetrics.negativeMargin || 0)
    + Number(marginStatusMetrics.lowMarginOnly || 0)
    + Number(marginStatusMetrics.missingCost || 0)
    + Number(marginStatusMetrics.okMargin || 0);
  const marginAttentionTotal = Number(marginStatusMetrics.negativeMargin || 0)
    + Number(marginStatusMetrics.lowMarginOnly || 0)
    + Number(marginStatusMetrics.missingCost || 0);
  setupDashboardCockpitOrdering(target);
  const cockpitSections = {
    "receita": `
    <section class="${cockpitWidgetClass("receita", "cockpit-bi-revenue", cockpitLayout)}" data-dashboard-widget="receita">
      ${dashboardCockpitHeader({
        widgetKey: "receita",
        label: "Receita",
        title: "Série temporal",
        meta: revenuePrevious ? `${number(revenueDelta)}% vs período anterior` : "Sem período anterior",
        periods: cockpitPeriods,
        loading: revenueMetrics.loading,
      })}
      <div id="monthlyChart" class="dashboard-chart-surface dashboard-chart-tall"></div>
    </section>
    `,
    "indicadores": `
    <section class="${cockpitWidgetClass("indicadores", "cockpit-bi-matrix", cockpitLayout)}" data-dashboard-widget="indicadores">
      ${dashboardCockpitHeader({
        widgetKey: "indicadores",
        label: "Indicadores",
        title: "Matriz executiva",
        periods: cockpitPeriods,
        loading: indicatorMetrics.loading,
      })}
      <div class="bi-metric-grid">
        ${dashboardBiMetric({ label: "Receita", value: indicatorMetrics.totalRevenue ? compactMoney(indicatorMetrics.totalRevenue) : "-", detail: `${compactMoney(indicatorMetrics.avgDailyRevenue)}/dia`, tone: indicatorMetrics.totalRevenue ? "good" : "neutral", icon: "trending-up", view: "opportunities", commercialMode: "sales" })}
        ${dashboardBiMetric({ label: "Margem", value: indicatorMetrics.grossMarginPct === null ? "-" : `${number(indicatorMetrics.grossMarginPct)}%`, detail: indicatorMetrics.cmvTotal ? `CMV ${compactMoney(indicatorMetrics.cmvTotal)}` : "CMV indisponível", tone: indicatorMetrics.grossMarginPct !== null && indicatorMetrics.grossMarginPct < 20 ? "warn" : "neutral", icon: "badge-percent", view: "pricing" })}
        ${dashboardBiMetric({ label: "Ticket", value: indicatorMetrics.avgTicket ? compactMoney(indicatorMetrics.avgTicket) : "-", detail: `${number(indicatorMetrics.purchases)} compras`, tone: "neutral", icon: "receipt-text", view: "customers" })}
        ${dashboardBiMetric({ label: "Produtos", value: `${number(indicatorMetrics.productMixPct)}%`, detail: `Top 5 ${number(indicatorMetrics.productConcentration)}%`, tone: indicatorMetrics.productConcentration > 45 ? "warn" : "neutral", icon: "package-search", view: "products" })}
        ${dashboardBiMetric({ label: "Clientes", value: number(indicatorMetrics.customerCount), detail: `Top 5 ${number(indicatorMetrics.customerConcentration)}%`, tone: indicatorMetrics.customerConcentration > 45 ? "warn" : "neutral", icon: "users", view: "customers" })}
        ${dashboardBiMetric({ label: "Compras", value: indicatorMetrics.supplierEstimated ? compactMoney(indicatorMetrics.supplierEstimated) : "-", detail: `${number(indicatorMetrics.openOrders)} pedidos; ${number(indicatorMetrics.openQuotes)} cotações`, tone: indicatorMetrics.supplierEstimated ? "neutral" : "warn", icon: "shopping-cart", view: "quotes" })}
        ${dashboardBiMetric({ label: "Estoque", value: number(indicatorMetrics.stockTotal), detail: `${number(indicatorMetrics.buyNowStock)} ruptura; ${number(indicatorMetrics.excessStock)} excesso`, tone: indicatorMetrics.buyNowStock || indicatorMetrics.excessStock ? "warn" : "neutral", icon: "boxes", view: "stock" })}
        ${dashboardBiMetric({ label: "Dados", value: `${number(indicatorMetrics.sourceCoverage)}%`, detail: `${number(indicatorMetrics.readinessSummary.sourceCount)} de ${number(indicatorMetrics.readinessSummary.sourceTotal)} fontes`, tone: indicatorMetrics.sourceCoverage >= 70 ? "good" : "warn", icon: "database", view: "imports" })}
      </div>
    </section>
    `,
    "mix": `
    <section class="${cockpitWidgetClass("mix", "cockpit-bi-third", cockpitLayout)}" data-dashboard-widget="mix">
      ${dashboardCockpitHeader({
        widgetKey: "mix",
        label: "Mix",
        title: "Produtos x serviços",
        legend: dashboardMiniLegend([
          { label: "Produtos", color: "#1fa463" },
          { label: "Serviços", color: "#2f7eb8" },
        ]),
        periods: cockpitPeriods,
        loading: mixMetrics.loading,
      })}
      <div id="dashboardRevenueMixChart" class="dashboard-chart-surface"></div>
      ${dashboardDonutSummary({
        label: "Receita no recorte",
        value: compactMoney(mixTotalRevenue),
        detail: `${number(mixProductShare)}% produtos / ${number(mixServiceShare)}% serviços`,
      })}
      ${dashboardDonutDetails([
        { label: "Produtos", value: mixMetrics.productRevenue, color: "#1fa463" },
        { label: "Serviços", value: mixMetrics.serviceRevenue, color: "#2f7eb8" },
      ], compactMoney)}
    </section>
    `,
    "estoque-status": `
    <section class="${cockpitWidgetClass("estoque-status", "cockpit-bi-third", cockpitLayout)}" data-dashboard-widget="estoque-status">
      ${dashboardCockpitHeader({
        widgetKey: "estoque-status",
        label: "Estoque",
        title: "Cobertura e posição",
        legend: dashboardMiniLegend([
          { label: "Ruptura", color: "#d84a4a" },
          { label: "Cobertura", color: "#f2a93b" },
          { label: "Excesso", color: "#2f7eb8" },
          { label: "Equilibrado", color: "#1fa463" },
        ]),
        periods: cockpitPeriods,
        loading: stockStatusMetrics.loading,
      })}
      <div id="dashboardStockChart" class="dashboard-chart-surface"></div>
      ${dashboardDonutSummary({
        label: "Itens monitorados",
        value: number(stockStatusTotal),
        detail: stockAttentionTotal ? `${number(stockAttentionTotal)} pedem atenção` : "Sem atenção no recorte",
      })}
      ${dashboardDonutDetails([
        { label: "Ruptura", value: stockStatusMetrics.buyNowStock, color: "#d84a4a" },
        { label: "Cobertura", value: stockStatusMetrics.attentionStock, color: "#f2a93b" },
        { label: "Excesso", value: stockStatusMetrics.excessStock, color: "#2f7eb8" },
        { label: "Equilibrado", value: stockStatusMetrics.stockOk, color: "#1fa463" },
      ], number)}
    </section>
    `,
    "margem-status": `
    <section class="${cockpitWidgetClass("margem-status", "cockpit-bi-third", cockpitLayout)}" data-dashboard-widget="margem-status">
      ${dashboardCockpitHeader({
        widgetKey: "margem-status",
        label: "Margem",
        title: "Distribuição por status",
        legend: dashboardMiniLegend([
          { label: "Negativa", color: "#d84a4a" },
          { label: "Baixa", color: "#f2a93b" },
          { label: "Custo ausente", color: "#2f7eb8" },
          { label: "Sem sinal", color: "#1fa463" },
        ]),
        periods: cockpitPeriods,
        loading: marginStatusMetrics.loading,
      })}
      <div id="dashboardMarginStatusChart" class="dashboard-chart-surface"></div>
      ${dashboardDonutSummary({
        label: "Itens avaliados",
        value: number(marginStatusTotal),
        detail: marginAttentionTotal ? `${number(marginAttentionTotal)} com sinal de margem` : "Sem sinal crítico",
      })}
      ${dashboardDonutDetails([
        { label: "Negativa", value: marginStatusMetrics.negativeMargin, color: "#d84a4a" },
        { label: "Baixa", value: marginStatusMetrics.lowMarginOnly, color: "#f2a93b" },
        { label: "Custo ausente", value: marginStatusMetrics.missingCost, color: "#2f7eb8" },
        { label: "Sem sinal", value: marginStatusMetrics.okMargin, color: "#1fa463" },
      ], number)}
    </section>
    `,
    "produtos-abc": `
    <section class="${cockpitWidgetClass("produtos-abc", "cockpit-bi-card", cockpitLayout)}" data-dashboard-widget="produtos-abc">
      ${dashboardCockpitHeader({
        widgetKey: "produtos-abc",
        label: "Curva ABC",
        title: "Produtos por receita",
        meta: `${number(productMetrics.productRows.length)} itens`,
        periods: cockpitPeriods,
        loading: productMetrics.loading,
      })}
      <div id="dashboardProductsChart" class="dashboard-chart-surface"></div>
    </section>
    `,
    "clientes": `
    <section class="${cockpitWidgetClass("clientes", "cockpit-bi-card", cockpitLayout)}" data-dashboard-widget="clientes">
      ${dashboardCockpitHeader({
        widgetKey: "clientes",
        label: "Clientes",
        title: "Concentração e ticket",
        meta: `${number(customerMetrics.repurchaseDue)} recompra`,
        periods: cockpitPeriods,
        loading: customerMetrics.loading,
      })}
      <div id="dashboardCustomersChart" class="dashboard-chart-surface"></div>
    </section>
    `,
    "fornecedores": `
    <section class="${cockpitWidgetClass("fornecedores", "cockpit-bi-card", cockpitLayout)}" data-dashboard-widget="fornecedores">
      ${dashboardCockpitHeader({
        widgetKey: "fornecedores",
        label: "Compras",
        title: "Fornecedores e mínimos",
        meta: `${number(supplierMetrics.quoteSuppliers.length || supplierMetrics.supplierRows.length)} fornecedores`,
        periods: cockpitPeriods,
        loading: supplierMetrics.loading,
      })}
      <div id="dashboardSuppliersChart" class="dashboard-chart-surface"></div>
    </section>
    `,
    "estoque-cobertura": `
    <section class="${cockpitWidgetClass("estoque-cobertura", "cockpit-bi-card", cockpitLayout)}" data-dashboard-widget="estoque-cobertura">
      ${dashboardCockpitHeader({
        widgetKey: "estoque-cobertura",
        label: "Estoque",
        title: "Produtos por cobertura",
        meta: `${number(stockCoverageMetrics.urgentStock)} ruptura/cobertura`,
        periods: cockpitPeriods,
        loading: stockCoverageMetrics.loading,
      })}
      ${dashboardBiLedger(stockLedgerRowsByPeriod, { compact: true })}
    </section>
    `,
    "margem-cmv": `
    <section class="${cockpitWidgetClass("margem-cmv", "cockpit-bi-card", cockpitLayout)}" data-dashboard-widget="margem-cmv">
      ${dashboardCockpitHeader({
        widgetKey: "margem-cmv",
        label: "Margem",
        title: "Produtos por CMV",
        meta: `${number(marginCmvMetrics.lowMargin)} baixa/negativa`,
        periods: cockpitPeriods,
        loading: marginCmvMetrics.loading,
      })}
      ${dashboardBiLedger(marginLedgerRowsByPeriod, { compact: true })}
    </section>
    `,
    "servicos": `
    <section class="${cockpitWidgetClass("servicos", "cockpit-bi-card", cockpitLayout)}" data-dashboard-widget="servicos">
      ${dashboardCockpitHeader({
        widgetKey: "servicos",
        label: "Serviços",
        title: "Receita por serviço",
        meta: `${number(serviceMetrics.serviceMixPct)}% da receita`,
        periods: cockpitPeriods,
        loading: serviceMetrics.loading,
      })}
      <div id="dashboardServicesChart" class="dashboard-chart-surface"></div>
    </section>
    `,
    "dados": `
    <section class="${cockpitWidgetClass("dados", "cockpit-bi-card", cockpitLayout)}" data-dashboard-widget="dados">
      ${dashboardCockpitHeader({
        widgetKey: "dados",
        label: "Dados importados",
        title: "Cobertura por módulo",
        meta: `${number(dataMetrics.readinessSummary.sourceCount)} / ${number(dataMetrics.readinessSummary.sourceTotal)}`,
        periods: cockpitPeriods,
        loading: dataMetrics.loading,
      })}
      <div id="dashboardDataCoverageChart" class="dashboard-chart-surface"></div>
    </section>
    `,
  };
  target.innerHTML = `${orderedDashboardCockpitWidgetKeys(cockpitLayout).map((key) => cockpitSections[key] || "").join("")}${dashboardCockpitAddCard(cockpitLayout)}`;
  renderMonthly(revenueMetrics.summary.monthly || [], revenueMetrics.summary.monthly_granularity);
  renderGeneralDoughnut(
    "#dashboardRevenueMixChart",
    ["Produtos", "Serviços"],
    [mixMetrics.productRevenue, mixMetrics.serviceRevenue],
    ["#1fa463", "#2f7eb8"],
    compactMoney,
    { compact: true, centerMode: "none" },
  );
  renderGeneralDoughnut(
    "#dashboardStockChart",
    ["Ruptura", "Cobertura", "Excesso", "Equilibrado"],
    [stockStatusMetrics.buyNowStock, stockStatusMetrics.attentionStock, stockStatusMetrics.excessStock, stockStatusMetrics.stockOk],
    ["#d84a4a", "#f2a93b", "#2f7eb8", "#1fa463"],
    number,
    { compact: true, centerMode: "none" },
  );
  renderGeneralDoughnut(
    "#dashboardMarginStatusChart",
    ["Negativa", "Baixa", "Custo ausente", "Sem sinal"],
    [marginStatusMetrics.negativeMargin, marginStatusMetrics.lowMarginOnly, marginStatusMetrics.missingCost, marginStatusMetrics.okMargin],
    ["#d84a4a", "#f2a93b", "#2f7eb8", "#1fa463"],
    number,
    { compact: true, centerMode: "none" },
  );
  renderBiBars("#dashboardProductsChart", productMetrics.productRows.slice(0, 5), compactMoney, { limit: 5 });
  renderBiBars("#dashboardCustomersChart", customerMetrics.customerRowsData.slice(0, 5), compactMoney, { limit: 5 });
  renderBiBars("#dashboardSuppliersChart", supplierChartRowsByPeriod.slice(0, 5), compactMoney, { limit: 5 });
  renderBiBars("#dashboardServicesChart", serviceMetrics.serviceRowsData.slice(0, 5), compactMoney, { limit: 5 });
  renderBiBars("#dashboardDataCoverageChart", moduleScoreRowsByPeriod, dashboardBiPercent, { limit: 5 });
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function renderDashboardExecutiveKpis({
  summary,
  kpis,
  products,
  customers,
  periodLabel,
  productRevenue,
  serviceRevenue,
  totalRevenue,
  replenishment,
  urgentStock,
  buyNowStock,
  readySuppliers,
  riskSuppliers,
  lowMargin,
  pricing,
  readinessSummary,
}) {
  const target = document.querySelector("#kpis");
  if (!target) return;
  const productCount = Number(kpis.products || products.length || 0);
  const customerCount = Number(kpis.customers || customers.length || 0);
  const periodDays = state.periodDays === "all" ? 0 : Number(state.periodDays || summary?.period?.period_days || 0);
  const divisorDays = periodDays || Math.max(1, summary?.monthly?.length || 1);
  const avgDailyRevenue = totalRevenue > 0 ? totalRevenue / Math.max(divisorDays, 1) : 0;
  const topProductShare = productRevenue > 0
    ? products.slice(0, 5).reduce((sum, row) => sum + Number(row.revenue || 0), 0) / productRevenue * 100
    : 0;
  const topCustomerShare = totalRevenue > 0
    ? customers.slice(0, 5).reduce((sum, row) => sum + Number(row.revenue || 0), 0) / totalRevenue * 100
    : 0;
  const criticalA = Number(replenishment?.summary?.critical_a || 0);
  const negativeMargin = Number(pricing.summary?.negative_margin || 0);
  const marginOpportunities = Number(pricing.summary?.opportunities || 0);
  const sourceCoverage = readinessSummary?.sourceTotal
    ? Math.round((readinessSummary.sourceCount / readinessSummary.sourceTotal) * 100)
    : 0;
  const revenuePerCustomer = totalRevenue && customerCount ? totalRevenue / customerCount : 0;
  const mainRevenue = totalRevenue ? compactMoney(totalRevenue) : "Sem vendas";
  const productMix = productRevenue && totalRevenue ? `${Math.round((productRevenue / totalRevenue) * 100)}% produtos` : `${number(productCount)} produtos`;
  const serviceMix = serviceRevenue && totalRevenue ? `${Math.round((serviceRevenue / totalRevenue) * 100)}% serviços` : `${number(customerCount)} clientes`;
  const items = [
    {
      label: "Receita",
      value: mainRevenue,
      detail: totalRevenue ? `${compactMoney(avgDailyRevenue)}/dia corrido; ${productMix} e ${serviceMix}.` : "Importe vendas para abrir a leitura financeira.",
      color: totalRevenue ? "green" : "amber",
      icon: "trending-up",
    },
    {
      label: "Rentabilidade",
      value: pricing.summary ? `${number(lowMargin)} alertas` : "CMV pendente",
      detail: pricing.summary ? `${number(negativeMargin)} negativos; ${number(marginOpportunities)} oportunidades de preço.` : "Importar custos separa venda de lucro.",
      color: lowMargin ? "amber" : pricing.summary ? "green" : "blue",
      icon: "chart-no-axes-combined",
    },
    {
      label: "Clientes",
      value: `${number(customerCount)} clientes`,
      detail: revenuePerCustomer ? `${compactMoney(revenuePerCustomer)} por cliente; Top 5 = ${number(topCustomerShare)}%.` : "Importar carteira e histórico libera recompra.",
      color: "blue",
      icon: "users",
    },
    {
      label: "Produtos e mix",
      value: `${number(productCount)} SKUs`,
      detail: topProductShare ? `Top 5 produtos = ${number(topProductShare)}% da receita de produtos.` : `${productMix} e ${serviceMix}.`,
      color: topProductShare > 45 ? "amber" : "blue",
      icon: "package-search",
    },
    {
      label: "Capital em estoque",
      value: pricing.summary && urgentStock ? `${number(urgentStock)} sinais` : "GMROI alvo",
      detail: pricing.summary ? `${number(buyNowStock)} compra imediata; ${number(criticalA)} classe A críticos.` : "Custos + estoque destravam GMROI, giro e sell-through.",
      color: urgentStock ? "amber" : pricing.summary ? "green" : "blue",
      icon: "coins",
    },
    {
      label: "Maturidade",
      value: `${number(sourceCoverage)}% dados`,
      detail: readinessSummary?.upcomingCount ? `${number(readinessSummary.upcomingCount)} leituras pedem mais dados.` : "Base ampla para visão executiva.",
      color: sourceCoverage >= 70 ? "green" : "amber",
      icon: "database",
    },
  ];
  target.innerHTML = items.map(dashboardExecutiveKpi).join("");
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function dashboardHeroMetric({ label, value, detail, view = "", layout = false }) {
  const target = layout ? " data-dashboard-open-layout" : view ? ` data-view-target="${escapeAttr(view)}"` : "";
  return `
    <button type="button"${target}>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </button>
  `;
}

function dashboardHeroMetrics({
  readinessSummary,
  totalRevenue,
  riskSuppliers,
  topSupplier,
  urgentStock,
  excessStock,
  lowMargin,
  customerRisk,
  repurchaseDue,
}) {
  const items = [
    {
      label: "Leituras",
      value: number(readinessSummary.readyCount),
      detail: `${number(readinessSummary.upcomingCount)} podem aparecer com mais dados`,
      layout: true,
      priority: 120,
    },
    {
      label: "Receita",
      value: compactMoney(totalRevenue),
      detail: "no recorte atual",
      view: "opportunities",
      priority: totalRevenue ? 95 : 8,
      visible: totalRevenue > 0,
    },
    {
      label: "Estoque",
      value: number(urgentStock),
      detail: urgentStock ? `${number(excessStock)} excesso` : "sem alerta forte",
      view: "stock",
      priority: urgentStock ? 110 : readinessSummary.readiness.stock ? 48 : 0,
      visible: readinessSummary.readiness.stock || urgentStock || excessStock,
    },
    {
      label: "Fornecedores",
      value: number(riskSuppliers.length),
      detail: topSupplier.supplier_name ? topSupplier.supplier_name : "em leitura",
      view: "quotes",
      priority: riskSuppliers.length ? 88 : readinessSummary.readiness.suppliers ? 42 : 0,
      visible: readinessSummary.readiness.suppliers || riskSuppliers.length,
    },
    {
      label: "Preços",
      value: number(lowMargin),
      detail: lowMargin ? "itens para comparar" : "custos em leitura",
      view: "pricing",
      priority: lowMargin ? 86 : readinessSummary.readiness.costs ? 44 : 0,
      visible: readinessSummary.readiness.costs || lowMargin,
    },
    {
      label: "Clientes",
      value: number(customerRisk),
      detail: `${number(repurchaseDue)} recompra provável`,
      view: "customers",
      priority: customerRisk || repurchaseDue ? 78 : readinessSummary.readiness.customers ? 38 : 0,
      visible: readinessSummary.readiness.customers || customerRisk || repurchaseDue,
    },
  ];
  return items
    .filter((item) => item.visible !== false)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2)
    .map(dashboardHeroMetric)
    .join("");
}

function dashboardSignalItems({
  readinessSummary,
  totalRevenue,
  periodLabel,
  readySuppliers,
  riskSuppliers,
  urgentStock,
  excessStock,
  lowMargin,
  pricing,
  customerRisk,
  repurchaseDue,
}) {
  const item = (config) => config;
  const signals = [
    item({
      priority: totalRevenue ? 82 : 16,
      label: totalRevenue ? "Receita do período" : "Vendas",
      value: totalRevenue ? compactMoney(totalRevenue) : "a conectar",
      detail: totalRevenue ? `Base financeira ativa em ${periodLabel}.` : "Importe vendas para abrir comparativos.",
      tone: totalRevenue ? "good" : "warn",
      icon: "trending-up",
      view: totalRevenue ? "opportunities" : "imports",
    }),
    item({
      priority: urgentStock ? 110 : readinessSummary.readiness.stock ? 45 : 22,
      label: "Ruptura e cobertura",
      value: readinessSummary.readiness.stock ? `${number(urgentStock)} itens` : "a conectar",
      detail: readinessSummary.readiness.stock ? `${number(excessStock)} em excesso; cobertura calculada.` : "Libera cobertura, ruptura e capital parado.",
      tone: urgentStock ? "danger" : readinessSummary.readiness.stock ? "good" : "warn",
      icon: "boxes",
      view: readinessSummary.readiness.stock ? "stock" : "imports",
    }),
    item({
      priority: lowMargin ? 96 : readinessSummary.readiness.costs ? 48 : 26,
      label: "Margem e preço",
      value: readinessSummary.readiness.costs ? `${number(lowMargin)} itens` : "custos",
      detail: readinessSummary.readiness.costs ? `${number(pricing.summary?.opportunities || 0)} pontos para comparar preço.` : "Custos liberam margem e preço alvo.",
      tone: lowMargin ? "warn" : readinessSummary.readiness.costs ? "good" : "warn",
      icon: "chart-no-axes-combined",
      view: readinessSummary.readiness.costs ? "pricing" : "imports",
    }),
    item({
      priority: riskSuppliers.length ? 76 : readinessSummary.readiness.suppliers ? 42 : 24,
      label: "Fornecedores",
      value: readinessSummary.readiness.suppliers ? `${number(readySuppliers.length)} prontos` : "vínculos",
      detail: readinessSummary.readiness.suppliers ? `${number(riskSuppliers.length)} com sinal de compra.` : "Vínculos liberam compra por fornecedor.",
      tone: readySuppliers.length ? "good" : "warn",
      icon: "truck",
      view: readinessSummary.readiness.suppliers ? "suppliers" : "imports",
    }),
    item({
      priority: customerRisk || repurchaseDue ? 74 : readinessSummary.readiness.customers ? 40 : 20,
      label: "Clientes",
      value: readinessSummary.readiness.customers ? `${number(customerRisk)} em risco` : "carteira",
      detail: readinessSummary.readiness.customers ? `${number(repurchaseDue)} com recompra provável.` : "Clientes liberam recompra e relacionamento.",
      tone: customerRisk ? "warn" : readinessSummary.readiness.customers ? "good" : "warn",
      icon: "users",
      view: readinessSummary.readiness.customers ? "customers" : "imports",
    }),
    item({
      priority: readinessSummary.upcomingCount ? 90 : 35,
      label: "Qualidade da leitura",
      value: `${number(readinessSummary.readyCount)}/${number(readinessSummary.sourceTotal)}`,
      detail: readinessSummary.upcomingCount ? `${number(readinessSummary.upcomingCount)} fontes ainda ampliam a visão.` : "Principais cruzamentos ativos.",
      tone: readinessSummary.upcomingCount ? "warn" : "good",
      icon: "sparkles",
      view: readinessSummary.upcomingCount ? "imports" : "dashboard",
    }),
  ];
  return signals
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
    .map(biSignal)
    .join("");
}

function dashboardToolCards(readinessSummary) {
  const ready = readinessSummary.catalog.filter((item) => item.ready).slice(0, 4);
  const upcoming = readinessSummary.catalog
    .filter((item) => !item.ready)
    .sort((a, b) => a.missing.length - b.missing.length)
    .slice(0, Math.max(0, 4 - ready.length));
  return [
    ...ready.map((item) => operatorTool({ icon: item.icon, title: item.title, detail: item.payoff, view: item.view })),
    ...upcoming.map((item) => operatorTool({
      icon: item.icon,
      title: `Liberar ${item.area.toLowerCase()}`,
      detail: `Conectar ${item.missing.map((key) => DASHBOARD_DATA_LABELS[key] || key).join(" + ")}.`,
      view: "imports",
      locked: true,
    })),
  ].slice(0, 4).join("");
}

function dashboardDataSourceItems({ readinessSummary, kpis, products, customers, totalRevenue, periodLabel, quoteSuppliers, supplierRows, pricing }) {
  const sourceValues = {
    products: { label: "Produtos", value: number(kpis.products || products.length), detail: "mix e cadastros" },
    sales: { label: "Vendas", value: totalRevenue ? "ativa" : "sem leitura", detail: periodLabel },
    customers: { label: "Clientes", value: number(kpis.customers || customers.length), detail: "carteira e histórico" },
    stock: { label: "Estoque", value: number(Number(kpis.stock_units || 0)), detail: "unidades importadas" },
    costs: { label: "Custos", value: pricing.summary ? "em leitura" : "a completar", detail: "margens e preço alvo" },
    suppliers: { label: "Fornecedores", value: number(quoteSuppliers.length || supplierRows.length), detail: "vínculos e mínimos" },
    services: { label: "Serviços", value: readinessSummary.readiness.services ? "ativo" : "opcional", detail: "mix completo" },
    history: { label: "Histórico", value: readinessSummary.readiness.history ? "ativo" : "curto", detail: "evolução por período" },
    purchase_orders: { label: "Pedidos", value: readinessSummary.readiness.purchase_orders ? "abertos" : "a conectar", detail: "estoque projetado" },
    supplier_terms: { label: "Condições", value: readinessSummary.readiness.supplier_terms ? "ativas" : "a completar", detail: "mínimos e prazos" },
    price_history: { label: "Hist. preços", value: readinessSummary.readiness.price_history ? "ativo" : "a conectar", detail: "evolução de preços" },
    stock_history: { label: "Hist. estoque", value: readinessSummary.readiness.stock_history ? "ativo" : "a conectar", detail: "evolução de estoque" },
    customer_contacts: { label: "Contatos", value: readinessSummary.readiness.customer_contacts ? "ativos" : "a registrar", detail: "relacionamento" },
    product_media: { label: "Mídia", value: readinessSummary.readiness.product_media ? "ativa" : "opcional", detail: "imagens e anexos" },
  };
  return Object.entries(readinessSummary.readiness)
    .map(([key, ready]) => operatorDataItem({
      ...(sourceValues[key] || { label: key, value: ready ? "ativo" : "a conectar", detail: "" }),
      status: ready ? "ready" : "wait",
    }))
    .join("");
}

function renderDashboardPotential(context = {}) {
  const target = document.querySelector("#dashboardPotentialBody");
  if (!target) return;
  const summary = dashboardReadinessSummary(context);
  const catalog = summary.catalog;
  const ready = catalog.filter((item) => item.ready);
  const upcoming = catalog.filter((item) => !item.ready).sort((a, b) => a.missing.length - b.missing.length);
  target.innerHTML = `
    <div class="dashboard-potential-meter">
      <div>
        <span>Fontes reconhecidas</span>
        <strong>${number(summary.sourceCount)} de ${number(summary.sourceTotal)}</strong>
        <em>Cobertura das fontes usadas pelos módulos.</em>
      </div>
      <div class="dashboard-potential-ring" style="--progress:${Math.max(8, summary.progress)}%">
        <strong>${number(summary.progress)}%</strong>
      </div>
    </div>
    <div class="dashboard-potential-lanes">
      <section>
        <span>Fontes disponíveis</span>
        ${(ready.length ? ready.slice(0, 3) : catalog.slice(0, 2)).map((item) => `
          <button class="dashboard-potential-item ${item.ready ? "ready" : "locked"}" type="button" data-view-target="${escapeAttr(item.ready ? item.view : "imports")}">
            <i data-lucide="${escapeAttr(item.icon)}"></i>
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <em>${escapeHtml(item.ready ? item.area : item.missing.map((key) => DASHBOARD_DATA_LABELS[key] || key).join(" + "))}</em>
            </div>
          </button>
        `).join("")}
      </section>
      <section>
        <span>Fontes sem cobertura</span>
        ${upcoming.slice(0, 4).map((item) => `
          <button class="dashboard-potential-item locked" type="button" data-view-target="imports">
            <i data-lucide="${escapeAttr(item.icon)}"></i>
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <em>${escapeHtml(item.missing.map((key) => DASHBOARD_DATA_LABELS[key] || key).join(" + "))}</em>
            </div>
          </button>
        `).join("") || `
          <button class="dashboard-potential-item ready" type="button" data-view-target="dashboard">
            <i data-lucide="sparkles"></i>
            <div>
              <strong>Fontes cobertas</strong>
              <em>Principais módulos com dados disponíveis.</em>
            </div>
          </button>
        `}
      </section>
    </div>
  `;
}

function renderGeneralMap({
  summary = state.summary || {},
  products = state.products || [],
  replenishment = state.replenishment || {},
  quoteSuppliers = state.quoteSuppliers || [],
  customers = state.customers || [],
  pricing = state.pricing || {},
  imports = state.imports || {},
  services = state.services || [],
} = {}) {
  setupDashboardLayoutEditing();
  const kpis = summary.kpis || {};
  const periodLabel = summary.period?.label || dashboardPeriodOptionLabel(state.periodDays);
  const productRevenue = Number(kpis.product_revenue || 0);
  const serviceRevenue = Number(kpis.service_revenue || 0);
  const totalRevenue = productRevenue + serviceRevenue;
  const topProduct = products[0] || {};
  const topCustomer = customers[0] || {};
  const readySuppliers = quoteSuppliers.filter((row) => supplierWorkbenchStatus(row).rank === "ready");
  const riskSuppliers = quoteSuppliers.filter((row) => ["ready", "risk", "below_min", "open"].includes(supplierWorkbenchStatus(row).rank));
  const topSupplier = riskSuppliers
    .slice()
    .sort((a, b) => Number(b.estimated_value || 0) - Number(a.estimated_value || 0))[0] || quoteSuppliers[0] || {};
  const urgentStock = Number(replenishment.summary?.urgent || 0) + Number(replenishment.summary?.buy_now || 0);
  const excessStock = Number(replenishment.summary?.excess || 0);
  const buyNowStock = Number(replenishment.summary?.buy_now || 0);
  const attentionStock = Number(replenishment.summary?.urgent || 0);
  const stockUniverse = Math.max(
    Number(replenishment.summary?.total || 0),
    Number(replenishment.rows?.length || 0),
    Number(kpis.products || products.length || 0)
  );
  const stockOk = Math.max(0, Number(replenishment.summary?.ok || 0) || stockUniverse - buyNowStock - attentionStock - excessStock);
  const lowMargin = Number(pricing.summary?.negative_margin || 0) + Number(pricing.summary?.low_margin || 0);
  const quality = imports.quality || {};
  const brandRows = aggregateMap(products, "brand_name", "revenue", "Sem marca");
  const supplierRows = aggregateMap(products, "supplier_name", "revenue", "Sem fornecedor");
  const productRows = products.slice(0, 5).map((row) => ({ label: row.name, value: row.revenue }));
  const customerRowsData = customers.slice(0, 5).map((row) => ({ label: row.name, value: row.revenue }));
  const serviceRowsData = services.slice(0, 4).map((row) => ({ label: row.name, value: row.revenue }));
  const customerRisk = Number(state.commercial?.summary?.at_risk_customers || 0);
  const repurchaseDue = Number(state.commercial?.summary?.due_customers || 0);
  const dashboardContext = { summary, products, replenishment, quoteSuppliers, customers, pricing, imports, services };
  const readinessSummary = dashboardReadinessSummary(dashboardContext);
  const companyName = (typeof companyProfileName === "function" && companyProfileName()) || appName();
  const customerCount = Number(kpis.customers || customers.length || 0);
  const supplierCount = quoteSuppliers.length || supplierRows.length || 0;
  const productCount = Number(kpis.products || products.length || 0);
  const periodDays = state.periodDays === "all" ? 0 : Number(state.periodDays || summary?.period?.period_days || 0);
  const divisorDays = periodDays || Math.max(1, summary?.monthly?.length || 1);
  const avgDailyRevenue = totalRevenue > 0 ? totalRevenue / Math.max(divisorDays, 1) : 0;
  const productMixPct = totalRevenue > 0 ? Math.round((productRevenue / totalRevenue) * 100) : 0;
  const serviceMixPct = totalRevenue > 0 ? Math.round((serviceRevenue / totalRevenue) * 100) : 0;
  const topProductShare = productRevenue > 0
    ? products.slice(0, 5).reduce((sum, row) => sum + Number(row.revenue || 0), 0) / productRevenue * 100
    : 0;
  const topCustomerShare = totalRevenue > 0
    ? customers.slice(0, 5).reduce((sum, row) => sum + Number(row.revenue || 0), 0) / totalRevenue * 100
    : 0;
  const criticalA = Number(replenishment.summary?.critical_a || 0);
  const negativeMargin = Number(pricing.summary?.negative_margin || 0);
  const marginOpportunities = Number(pricing.summary?.opportunities || 0);
  const stockHealthPct = stockUniverse ? Math.round((stockOk / Math.max(stockUniverse, 1)) * 100) : 0;
  const revenuePerCustomer = totalRevenue && customerCount ? totalRevenue / customerCount : 0;
  const sourceCoverage = readinessSummary.sourceTotal
    ? Math.round((readinessSummary.sourceCount / readinessSummary.sourceTotal) * 100)
    : 0;
  const pricingRows = pricing.rows || pricing.items || [];
  const cmvTotal = pricingRows.reduce((sum, row) => {
    const quantity = Number(row.quantity || 0);
    const cost = Number(row.effective_cost || 0);
    return sum + (quantity > 0 && cost > 0 ? quantity * cost : 0);
  }, 0);
  const grossMargin = cmvTotal > 0 ? Math.max(0, productRevenue - cmvTotal) : 0;
  const grossMarginPct = productRevenue > 0 && cmvTotal > 0 ? (grossMargin / productRevenue) * 100 : null;
  const purchases = customers.reduce((sum, row) => sum + Number(row.purchases || row.purchase_days || 0), 0);
  const avgTicket = purchases > 0 ? totalRevenue / purchases : 0;
  const supplierEstimated = quoteSuppliers.reduce((sum, row) => sum + Number(row.estimated_value || 0), 0);
  const hero = document.querySelector("#generalMapHero");
  if (hero) {
    hero.innerHTML = `
      <div class="cockpit-scorebar cockpit-executive-strip">
        ${dashboardScoreCell({ label: "Receita", value: totalRevenue ? compactMoney(totalRevenue) : "-", detail: `${compactMoney(avgDailyRevenue)}/dia · ${periodLabel}`, tone: totalRevenue ? "good" : "neutral", icon: "trending-up", view: "opportunities", commercialMode: "sales" })}
        ${dashboardScoreCell({ label: "Margem", value: grossMarginPct === null ? "-" : `${number(grossMarginPct)}%`, detail: cmvTotal ? `CMV ${compactMoney(cmvTotal)}` : "CMV indisponível", tone: grossMarginPct !== null && grossMarginPct < 20 ? "warn" : "neutral", icon: "badge-percent", view: "pricing" })}
        ${dashboardScoreCell({ label: "Clientes", value: number(customerCount), detail: avgTicket ? `Ticket ${compactMoney(avgTicket)}` : `${number(purchases)} compras`, tone: customerCount ? "neutral" : "warn", icon: "users", view: "customers" })}
        ${dashboardScoreCell({ label: "Produtos", value: number(productCount), detail: `${number(productMixPct)}% produtos · ${number(serviceMixPct)}% serviços`, tone: topProductShare > 45 ? "warn" : "neutral", icon: "package-search", view: "products" })}
        ${dashboardScoreCell({ label: "Estoque", value: number(stockUniverse), detail: `${number(buyNowStock)} ruptura · ${number(excessStock)} excesso`, tone: buyNowStock || excessStock ? "warn" : "neutral", icon: "boxes", view: "stock" })}
        ${dashboardScoreCell({ label: "Compras", value: supplierEstimated ? compactMoney(supplierEstimated) : "-", detail: `${number(supplierCount)} fornecedores`, tone: supplierEstimated ? "neutral" : "warn", icon: "shopping-cart", view: "quotes" })}
        ${dashboardScoreCell({ label: "Dados", value: `${number(sourceCoverage)}%`, detail: `${number(readinessSummary.sourceCount)} de ${number(readinessSummary.sourceTotal)} fontes`, tone: sourceCoverage >= 70 ? "good" : "warn", icon: "database", view: "imports" })}
      </div>
    `;
  }
  const legacyKpis = document.querySelector("#kpis");
  if (legacyKpis) legacyKpis.innerHTML = "";
  const legacyCards = document.querySelector("#generalMapCards");
  if (legacyCards) legacyCards.innerHTML = "";
  const movements = document.querySelector("#operatorMovements");
  if (movements) {
    const movementItems = [
      topProduct.name ? operatorMovement({ icon: "package-search", title: "Produto", value: topProduct.name, detail: compactMoney(topProduct.revenue || 0), view: "products" }) : "",
      topCustomer.name ? operatorMovement({ icon: "users", title: "Cliente", value: topCustomer.name, detail: compactMoney(topCustomer.revenue || 0), view: "customers" }) : "",
      brandRows[0]?.label ? operatorMovement({ icon: "tags", title: "Marca", value: brandRows[0].label, detail: compactMoney(brandRows[0].value || 0), view: "products" }) : "",
      operatorMovement({ icon: "boxes", title: "Estoque", value: `${number(urgentStock)} ruptura/cobertura`, detail: `${number(excessStock)} itens em excesso`, view: "stock" }),
      operatorMovement({ icon: "truck", title: "Fornecedor", value: topSupplier.supplier_name || "Sem fornecedor", detail: riskSuppliers.length ? `${number(riskSuppliers.length)} com compra estimada` : "Sem pedido estimado", view: "suppliers" }),
    ].filter(Boolean).slice(0, 4);
    movements.innerHTML = movementItems.join("");
  }
  const tools = document.querySelector("#operatorTools");
  if (tools) {
    tools.innerHTML = dashboardToolCards(readinessSummary);
  }
  renderDashboardPotential(dashboardContext);
  const presets = document.querySelector("#dashboardViewPresets");
  if (presets) {
    presets.innerHTML = dashboardShortcutButtons();
  }
  renderDashboardCockpit({
    kpis,
    summary,
    products,
    customers,
    services,
    replenishment,
    pricing,
    imports,
    quoteSuppliers,
    supplierRows,
    totalRevenue,
    productRevenue,
    serviceRevenue,
    avgDailyRevenue,
    productMixPct,
    serviceMixPct,
    productRows,
    customerRowsData,
    serviceRowsData,
    brandRows,
    stockOk,
    urgentStock,
    buyNowStock,
    attentionStock,
    excessStock,
    lowMargin,
    negativeMargin,
    marginOpportunities,
    customerCount,
    customerRisk,
    repurchaseDue,
    sourceCoverage,
    readinessSummary,
  });
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function renderCapability(item) {
  return `
    <div class="capability ${escapeAttr(item.status)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.body)}</span>
      ${item.impact ? `<em>${escapeHtml(item.impact)}</em>` : ""}
      ${item.action ? `<button class="text-button" type="button" data-view-target="${escapeAttr(item.view || "")}">${escapeHtml(item.action)}</button>` : ""}
    </div>
  `;
}

function renderMaturity(payload) {
  const target = document.querySelector("#maturity");
  if (!target) return;
  const metrics = payload.metrics || {};
  const unlocked = payload.unlocked || [];
  const improvements = payload.improvements || [];
  const next = payload.next_actions || [];
  const visibleUnlocked = unlocked.slice(0, 3);
  const visibleImprovements = improvements.slice(0, 2);
  const visibleNext = next.slice(0, 3);
  const focus = payload.focus || {};
  const progress = Math.max(0, Math.min(Number(payload.score || 0), 100));
  target.innerHTML = `
    <div class="maturity-body">
      <div class="maturity-score">
        <span>Nivel ${payload.stage?.level || 1}</span>
        <strong>${escapeHtml(payload.stage?.name || "Leitura")}</strong>
        <p>${escapeHtml(payload.stage?.label || "")}</p>
        <div class="maturity-track"><span style="width:${progress}%"></span></div>
        <small>${number(progress)}% da maturidade operacional mapeada</small>
      </div>
      <div class="maturity-metrics">
        <div><span>Ref. fornecedor</span><strong>${number(metrics.reference_pct)}%</strong></div>
        <div><span>Fornec./marca</span><strong>${number(metrics.supplier_pct)}%</strong></div>
        <div><span>Pedido mínimo</span><strong>${number(metrics.minimum_pct)}%</strong></div>
        <div><span>Cotaveis</span><strong>${number(metrics.quote_items)}</strong></div>
      </div>
      <div class="focus-panel">
        <div>
          <span>Foco agora</span>
          <strong>${escapeHtml(focus.headline || "Comece pelo que já dá resultado")}</strong>
          <p>${escapeHtml(focus.body || "")}</p>
        </div>
        <div class="focus-actions">
          ${(focus.actions || []).map((item) => `
            <article>
              <small>${escapeHtml(item.scope || "")}</small>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.body)}</span>
              ${item.evidence ? `<em>${escapeHtml(item.evidence)}</em>` : ""}
              <button class="text-button" type="button" data-view-target="${escapeAttr(item.view || "")}">${escapeHtml(item.action || "Abrir")}</button>
            </article>
          `).join("")}
        </div>
      </div>
      <div class="maturity-lanes">
        <section>
          <h3>Desbloqueado${unlocked.length > visibleUnlocked.length ? ` (${visibleUnlocked.length}/${unlocked.length})` : ""}</h3>
          ${visibleUnlocked.map(renderCapability).join("")}
        </section>
        <section>
          <h3>Melhorou com uso${improvements.length > visibleImprovements.length ? ` (${visibleImprovements.length}/${improvements.length})` : ""}</h3>
          ${visibleImprovements.length ? visibleImprovements.map(renderCapability).join("") : `<div class="capability muted"><strong>Aguardando uso operacional</strong><span>Gere e acompanhe cotações para o ${escapeHtml(appName())} aprender prazos, respostas e compras reais.</span></div>`}
        </section>
        <section>
          <h3>Depois disso${next.length > visibleNext.length ? ` (${visibleNext.length}/${next.length})` : ""}</h3>
          ${visibleNext.map(renderCapability).join("")}
        </section>
      </div>
    </div>
  `;
  const button = document.querySelector("#maturityNextButton");
  if (!button) return;
  button.dataset.viewTarget = next[0]?.view || "quotes";
  button.textContent = next[0]?.action || "Abrir compras";
}

function renderMissions(payload) {
  const target = document.querySelector("#missions");
  if (!target) return;
  const missions = payload.missions || [];
  target.innerHTML = `
    <div class="missions-grid">
      ${missions
        .map(
          (item) => `
            <article class="mission ${escapeAttr(item.status)}">
              <div class="mission-head">
                <span>${escapeHtml(item.effort)}</span>
                <strong>${escapeHtml(item.title)}</strong>
              </div>
              <p>${escapeHtml(item.body)}</p>
              <div class="mission-progress"><span style="width:${Number(item.progress || 0)}%"></span></div>
              <small>${number(item.progress)}% concluído</small>
              <dl>
                <dt>Recompensa</dt>
                <dd>${escapeHtml(item.reward)}</dd>
                <dt>Desbloqueia</dt>
                <dd>${escapeHtml(item.unlocks)}</dd>
              </dl>
              ${item.evidence ? `<em>${escapeHtml(item.evidence)}</em>` : ""}
              <button class="text-button" type="button" data-view-target="${escapeAttr(item.view || "")}">${escapeHtml(item.action)}</button>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentDayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function monthlyBucketKey(row, grain = "month") {
  const value = String(row?.month || "");
  if (grain === "day" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : "";
}

function parseRevenueDay(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function revenueDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addRevenueDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function revenueDayDiff(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function compactDailyRevenueRows(rows, targetBuckets = 30) {
  const mapped = rows
    .map((row) => ({ ...row, _date: parseRevenueDay(row.month) }))
    .filter((row) => row._date)
    .sort((a, b) => a._date - b._date);
  if (!mapped.length) return rows;
  const start = mapped[0]._date;
  const end = mapped[mapped.length - 1]._date;
  const totalDays = Math.max(1, revenueDayDiff(start, end) + 1);
  if (totalDays <= 34) return mapped.map(({ _date, ...row }) => row);
  const bucketCount = Math.min(targetBuckets, totalDays);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const startOffset = Math.floor(index * totalDays / bucketCount);
    const endOffset = Math.max(startOffset, Math.floor((index + 1) * totalDays / bucketCount) - 1);
    const bucketStart = addRevenueDays(start, startOffset);
    const bucketEnd = addRevenueDays(start, endOffset);
    return {
      month: revenueDayKey(bucketStart),
      bucket_end: revenueDayKey(bucketEnd),
      bucket_days: endOffset - startOffset + 1,
      product_revenue: 0,
      service_revenue: 0,
    };
  });
  mapped.forEach((row) => {
    const offset = Math.max(0, revenueDayDiff(start, row._date));
    const index = Math.min(bucketCount - 1, Math.floor(offset * bucketCount / totalDays));
    buckets[index].product_revenue += Number(row.product_revenue || 0);
    buckets[index].service_revenue += Number(row.service_revenue || 0);
  });
  return buckets.map((row) => ({
    ...row,
    product_revenue: Math.round(row.product_revenue * 100) / 100,
    service_revenue: Math.round(row.service_revenue * 100) / 100,
  }));
}

function monthlyRowsForDisplay(rows, grain = "month") {
  const currentKey = grain === "day" ? currentDayKey() : currentMonthKey();
  const filtered = state.hideCurrentMonthRevenue
    ? rows.filter((row) => monthlyBucketKey(row, grain) !== currentKey)
    : rows;
  return grain === "day" ? compactDailyRevenueRows(filtered) : filtered;
}

function updateMonthlyToggleButton(grain = "month") {
  const button = document.querySelector("#hideCurrentMonthRevenue");
  if (!button) return;
  const unit = grain === "day" ? "dia atual" : "mês atual";
  button.classList.toggle("active", Boolean(state.hideCurrentMonthRevenue));
  button.setAttribute("aria-pressed", state.hideCurrentMonthRevenue ? "true" : "false");
  button.textContent = state.hideCurrentMonthRevenue ? `Mostrar ${unit}` : `Ocultar ${unit}`;
}

function renderMonthly(rows, granularity) {
  chartRegistry()["#monthlyChart"] = () => renderMonthly(rows, granularity);
  const sourceRows = Array.isArray(rows) ? rows : [];
  const grain = granularity || state.summary?.monthly_granularity || "month";
  const chartRows = monthlyRowsForDisplay(sourceRows, grain);
  updateMonthlyToggleButton(grain);
  const formatBucket = (rowOrRaw) => {
    const row = rowOrRaw && typeof rowOrRaw === "object" ? rowOrRaw : null;
    const raw = row ? row.month : rowOrRaw;
    if (!raw) return "";
    const value = String(raw);
    if (grain === "day") {
      if (row?.bucket_end && row.bucket_end !== row.month) {
        const startParts = value.split("-");
        const endParts = String(row.bucket_end).split("-");
        if (startParts.length >= 3 && endParts.length >= 3) return `${startParts[2]}/${startParts[1]}-${endParts[2]}/${endParts[1]}`;
      }
      const parts = value.split("-");
      if (parts.length >= 3) return `${parts[2]}/${parts[1]}`;
      return value;
    }
    const parts = value.split("-");
    if (parts.length >= 2) {
      const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      const idx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
      return `${months[idx]}/${parts[0].slice(2)}`;
    }
    return value;
  };
  if (!chartRows.length) {
    const target = document.querySelector("#monthlyChart");
    if (target) {
      const hiddenUnit = grain === "day" ? "Dia atual oculto" : "Mês atual oculto";
      target.innerHTML = `<div class="bi-empty">${state.hideCurrentMonthRevenue ? `${hiddenUnit}. Não há períodos anteriores nesse recorte.` : "Sem faturamento no recorte."}</div>`;
    }
    disposeChartInstance(state.monthlyChart);
    state.monthlyChart = null;
    return;
  }
  if (window.echarts) {
    const target = document.querySelector("#monthlyChart");
    if (!target) return;
    const canvasId = "monthlyRevenueEchart";
    target.innerHTML = `<div id="${canvasId}" class="echart-surface" role="img" aria-label="Receita por período"></div>
      <div class="chart-legend" aria-hidden="true">
        <span><i class="legend-product"></i>Produtos</span>
        <span><i class="legend-service"></i>Serviços</span>
        <span><i class="legend-total"></i>Total</span>
      </div>`;
    if (!chartTargetReady(target)) {
      if (chartTargetVisible(target)) scheduleChartRecovery();
      return;
    }
    disposeChartInstance(state.monthlyChart);
    const chart = echarts.init(document.querySelector(`#${canvasId}`), null, { renderer: "canvas" });
    const totals = chartRows.map((row) => Number(row.product_revenue || 0) + Number(row.service_revenue || 0));
    const labels = chartRows.map((row) => formatBucket(row));
    const surfaceWidth = target.clientWidth || 720;
    const adaptiveBar = Math.max(4, Math.min(44, Math.floor((surfaceWidth - 60) / Math.max(chartRows.length, 1)) - 4));
    const labelInterval = chartRows.length > 24 ? Math.ceil(chartRows.length / 12) - 1 : 0;
    chart.setOption({
      color: ["#1fa463", "#2f7eb8", "#0f1f17"],
      grid: { left: 14, right: 18, top: 18, bottom: 36, containLabel: true },
      tooltip: {
        ...premiumTooltip(),
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: "rgba(15,31,23,.05)" } },
        valueFormatter: (value) => money(value),
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: "rgba(100,113,105,.18)" } },
        axisTick: { show: false },
        axisLabel: {
          color: chartTextColor(),
          fontSize: 11,
          fontWeight: 700,
          interval: labelInterval,
          rotate: chartRows.length > 12 ? 35 : 0,
          margin: 10,
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: chartTextColor(), formatter: (value) => compactMoney(value) },
        splitLine: { lineStyle: { color: "rgba(100,113,105,.13)" } },
      },
      series: [
        {
          name: "Produtos",
          type: "bar",
          stack: "receita",
          data: chartRows.map((row) => Number(row.product_revenue || 0)),
          barWidth: adaptiveBar,
          itemStyle: {
            borderRadius: [0, 0, 9, 9],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "#21aa68" },
              { offset: 1, color: "#147345" },
            ]),
          },
        },
        {
          name: "Serviços",
          type: "bar",
          stack: "receita",
          data: chartRows.map((row) => Number(row.service_revenue || 0)),
          barWidth: adaptiveBar,
          itemStyle: {
            borderRadius: [9, 9, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "#49a4d8" },
              { offset: 1, color: "#206996" },
            ]),
          },
        },
        {
          name: "Total",
          type: "line",
          data: totals,
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: { width: 3, color: "#0f1f17", shadowBlur: 10, shadowColor: "rgba(15,31,23,.22)" },
          itemStyle: { color: "#ffffff", borderColor: "#0f1f17", borderWidth: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(15,31,23,.12)" },
              { offset: 1, color: "rgba(15,31,23,0)" },
            ]),
          },
        },
      ],
    });
    state.monthlyChart = chart;
    resizeChartSoon(chart);
    return;
  }
  const max = Math.max(...chartRows.map((row) => Number(row.product_revenue || 0) + Number(row.service_revenue || 0)), 1);
  document.querySelector("#monthlyChart").innerHTML = chartRows
    .map((row) => {
      const productWidth = (Number(row.product_revenue || 0) / max) * 100;
      const serviceWidth = (Number(row.service_revenue || 0) / max) * 100;
      return `
        <div class="bar-row">
          <span>${formatBucket(row)}</span>
          <div class="bar-track">
            <div class="bar-product" style="width:${productWidth}%"></div>
            <div class="bar-service" style="width:${serviceWidth}%"></div>
          </div>
          <strong class="num">${money(Number(row.product_revenue || 0) + Number(row.service_revenue || 0))}</strong>
        </div>
      `;
    })
    .join("");
}

function refreshChartsAfterVendorLoad() {
  if (!state.summary) return;
  renderMonthly(state.summary.monthly || [], state.summary.monthly_granularity);
  renderGeneralMap();
}

window.nexoChartsReady = refreshChartsAfterVendorLoad;
if (window.echarts && window.nexoEchartsLoaded) refreshChartsAfterVendorLoad();

function renderTasks(tasks) {
  const target = document.querySelector("#tasks");
  if (!target) return;
  target.innerHTML = tasks
    .map((task) => `<div class="task"><strong>${task.title}</strong><span>${task.status} - prioridade ${task.priority}</span></div>`)
    .join("");
}

