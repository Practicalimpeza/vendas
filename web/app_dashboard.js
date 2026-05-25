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

const DASHBOARD_LAYOUT_KEY = "pulso.dashboard.layout.v11";
const DASHBOARD_LEGACY_LAYOUT_KEY = "pulso.dashboard.layout.v0";
const DASHBOARD_BASE_VISIBLE_KEY = "pulso.dashboard.base.visible";
const DASHBOARD_BLOCK_DEFS = [
  { key: "pulso", label: "Pulso" },
  { key: "indicadores", label: "Indicadores" },
  { key: "sinais", label: "Sinais" },
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
const DASHBOARD_PRESETS = {
  gestor: {
    label: "Essencial",
    order: ["pulso", "analises", "indicadores", "sinais", "mesa", "potencial", "ferramentas", "trilhas", "implantacao"],
    hidden: ["indicadores", "sinais", "mesa", "potencial", "ferramentas", "trilhas", "implantacao"],
    sizes: { pulso: "large", indicadores: "medium", sinais: "medium", mesa: "large", potencial: "medium", analises: "large", ferramentas: "medium", trilhas: "medium", implantacao: "compact" },
  },
  comprador: {
    label: "Comprador",
    order: ["pulso", "mesa", "sinais", "potencial", "analises", "indicadores", "ferramentas", "trilhas", "implantacao"],
    hidden: ["trilhas", "implantacao"],
    sizes: { pulso: "medium", indicadores: "compact", sinais: "large", mesa: "large", potencial: "medium", analises: "large", ferramentas: "medium", trilhas: "compact", implantacao: "compact" },
  },
  comercial: {
    label: "Comercial",
    order: ["pulso", "indicadores", "analises", "sinais", "mesa", "potencial", "ferramentas", "trilhas", "implantacao"],
    hidden: ["implantacao"],
    sizes: { pulso: "large", indicadores: "large", sinais: "medium", mesa: "medium", potencial: "medium", analises: "large", ferramentas: "compact", trilhas: "medium", implantacao: "compact" },
  },
  estoque: {
    label: "Estoque",
    order: ["pulso", "sinais", "mesa", "potencial", "analises", "indicadores", "ferramentas", "trilhas", "implantacao"],
    hidden: ["trilhas", "implantacao"],
    sizes: { pulso: "medium", indicadores: "compact", sinais: "large", mesa: "large", potencial: "medium", analises: "large", ferramentas: "medium", trilhas: "compact", implantacao: "compact" },
  },
  consultor: {
    label: "Consultor",
    order: ["pulso", "implantacao", "indicadores", "sinais", "mesa", "potencial", "analises", "ferramentas", "trilhas"],
    hidden: [],
    sizes: { pulso: "large", indicadores: "medium", sinais: "medium", mesa: "medium", potencial: "large", analises: "large", ferramentas: "medium", trilhas: "medium", implantacao: "medium" },
  },
};

function dashboardBlocks() {
  return Array.from(document.querySelectorAll("#dashboard > [data-dashboard-block]"));
}

function cloneDashboardLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}

function dashboardDefaultLayout() {
  return { ...cloneDashboardLayout(DASHBOARD_PRESETS.gestor), preset: "gestor" };
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
  renderDashboardControlBar(dashboardLayout());
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
  const presets = document.querySelector("#dashboardLayoutPresets");
  const controls = document.querySelector("#dashboardBlockControls");
  if (!panel || !presets || !controls) return;
  const normalized = normalizeDashboardLayout(layout);
  presets.innerHTML = Object.entries(DASHBOARD_PRESETS)
    .map(([key, preset]) => `
      <button class="dashboard-preset-button ${normalized.preset === key ? "active" : ""}" type="button" data-dashboard-preset="${escapeAttr(key)}">
        ${escapeHtml(preset.label)}
      </button>
    `)
    .join("");
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

function renderDashboardControlBar(layout = dashboardLayout()) {
  const bar = document.querySelector("#dashboardControlBar");
  const lenses = document.querySelector("#dashboardLensControls");
  if (!bar || !lenses) return;
  const normalized = normalizeDashboardLayout(layout);
  lenses.innerHTML = Object.entries(DASHBOARD_PRESETS)
    .map(([key, preset]) => `
      <button class="${normalized.preset === key ? "active" : ""}" type="button" data-dashboard-control-preset="${escapeAttr(key)}">
        ${escapeHtml(preset.label)}
      </button>
    `)
    .join("");
  bar.classList.toggle("base-visible", dashboardBaseVisible());
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
  renderDashboardControlBar(normalized);
  renderDashboardEditPanel(normalized);
}

function applyDashboardPreset(presetKey) {
  const preset = DASHBOARD_PRESETS[presetKey];
  if (!preset) return;
  const layout = saveDashboardLayout({ ...cloneDashboardLayout(preset), preset: presetKey });
  applyDashboardLayoutState(layout);
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
    const preset = event.target.closest("[data-dashboard-preset]");
    if (preset?.dataset.dashboardPreset) applyDashboardPreset(preset.dataset.dashboardPreset);
    const sizeButton = event.target.closest("[data-dashboard-size]");
    if (sizeButton?.dataset.dashboardBlockKey) setDashboardBlockSize(sizeButton.dataset.dashboardBlockKey, sizeButton.dataset.dashboardSize);
    const visibilityButton = event.target.closest("[data-dashboard-toggle]");
    if (visibilityButton?.dataset.dashboardToggle) toggleDashboardBlockHidden(visibilityButton.dataset.dashboardToggle);
    if (event.target.closest("#dashboardRestoreLayout")) restoreDashboardDefaultLayout();
    if (event.target.closest("#dashboardFinishLayout")) setDashboardEditMode(false);
  });
  dashboard.addEventListener("click", (event) => {
    if (event.target.closest("[data-dashboard-open-layout]")) setDashboardEditMode(true);
  });
  document.querySelector("#dashboardControlBar")?.addEventListener("click", (event) => {
    const preset = event.target.closest("[data-dashboard-control-preset]");
    if (preset?.dataset.dashboardControlPreset) applyDashboardPreset(preset.dataset.dashboardControlPreset);
    const blockButton = event.target.closest("[data-dashboard-show-block]");
    if (blockButton?.dataset.dashboardShowBlock) showDashboardBlock(blockButton.dataset.dashboardShowBlock);
    if (event.target.closest("[data-dashboard-toggle-base]")) setDashboardBaseVisible(!dashboardBaseVisible());
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
        <strong>Inteligência que o software deve entregar</strong>
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

function dashboardScoreCell({ label, value, detail, tone = "neutral", icon = "activity" }) {
  return `
    <article class="cockpit-score-cell ${escapeAttr(tone)}">
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail || "")}</em>
    </article>
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
      <strong>${escapeHtml(readiness[key] ? "ativo" : "bloqueado")}</strong>
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

function renderDashboardCockpit({
  summary,
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
  retailConcepts,
}) {
  const target = document.querySelector("#dashboardCharts");
  if (!target) return;
  target.classList.add("retail-cockpit-board");
  const monthlyRows = monthlyRowsForDisplay(summary.monthly || [], summary.monthly_granularity);
  const monthlyValues = monthlyRows.map((row) => Number(row.product_revenue || 0) + Number(row.service_revenue || 0));
  const last = monthlyValues.at(-1) || 0;
  const previous = monthlyValues.length > 1 ? monthlyValues.at(-2) || 0 : 0;
  const delta = previous ? ((last - previous) / previous) * 100 : 0;
  const revenueMax = Math.max(productRevenue, serviceRevenue, 1);
  const stockTotal = Math.max(buyNowStock + attentionStock + excessStock + stockOk, 1);
  const productConcentration = totalRevenue ? productRows.reduce((sum, row) => sum + Number(row.value || 0), 0) / Math.max(productRevenue, 1) * 100 : 0;
  const customerConcentration = totalRevenue ? customerRowsData.reduce((sum, row) => sum + Number(row.value || 0), 0) / Math.max(totalRevenue, 1) * 100 : 0;
  const pillars = [
    dashboardPillar({ label: "Resultado", value: totalRevenue ? compactMoney(totalRevenue) : "sem vendas", detail: previous ? `${number(delta)}% vs período anterior` : `${compactMoney(avgDailyRevenue)}/dia`, tone: totalRevenue ? "good" : "warn", icon: "trending-up", view: "opportunities" }),
    dashboardPillar({ label: "Rentabilidade", value: lowMargin ? `${number(lowMargin)} alertas` : "em leitura", detail: `${number(negativeMargin)} negativos; ${number(marginOpportunities)} oportunidades`, tone: lowMargin ? "warn" : "good", icon: "chart-no-axes-combined", view: "pricing" }),
    dashboardPillar({ label: "Clientes", value: `${number(customerCount)} ativos`, detail: `${number(customerRisk)} em risco; ${number(repurchaseDue)} recompra`, tone: customerRisk ? "warn" : "good", icon: "users", view: "customers" }),
    dashboardPillar({ label: "Mix", value: `${number(productMixPct)}% produtos`, detail: `${number(serviceMixPct)}% serviços; Top 5 = ${number(productConcentration)}%`, tone: productConcentration > 45 ? "warn" : "good", icon: "chart-pie", view: "products" }),
    dashboardPillar({ label: "Capital", value: `${number(excessStock)} excesso`, detail: `${number(urgentStock)} sinais de abastecimento`, tone: urgentStock || excessStock ? "warn" : "good", icon: "coins", view: "stock" }),
    dashboardPillar({ label: "Dados", value: `${number(sourceCoverage)}%`, detail: `${number(readinessSummary.sourceCount)} de ${number(readinessSummary.sourceTotal)} fontes`, tone: sourceCoverage >= 70 ? "good" : "warn", icon: "database", view: "imports" }),
  ].join("");
  target.innerHTML = `
    <section class="cockpit-zone cockpit-wide cockpit-result">
      <header>
        <div>
          <span>Resultado e margem</span>
          <strong>Receita por período com leitura de tendência</strong>
        </div>
        <em>${previous ? `${number(delta)}% vs período anterior` : "Histórico ainda curto"}</em>
      </header>
      <div class="cockpit-result-body">
        <div class="cockpit-trend">${dashboardTrendSvg(monthlyRows)}</div>
        <aside>
          ${dashboardScoreCell({ label: "Receita", value: totalRevenue ? compactMoney(totalRevenue) : "sem vendas", detail: `${compactMoney(avgDailyRevenue)}/dia`, tone: totalRevenue ? "good" : "warn", icon: "trending-up" })}
          ${dashboardScoreCell({ label: "Margem", value: lowMargin ? `${number(lowMargin)} alertas` : "sob leitura", detail: "CMV, preço e custo explicam lucro bruto.", tone: lowMargin ? "warn" : "neutral", icon: "badge-percent" })}
          ${dashboardScoreCell({ label: "Clientes", value: `${number(customerCount)}`, detail: "base ativa no recorte", tone: customerCount ? "good" : "warn", icon: "users" })}
        </aside>
      </div>
    </section>

    <section class="cockpit-zone cockpit-health">
      <header>
        <div>
          <span>Saúde da empresa</span>
          <strong>Matriz executiva</strong>
        </div>
      </header>
      <div class="cockpit-pillar-grid">${pillars}</div>
    </section>

    <section class="cockpit-zone cockpit-mix">
      <header><div><span>Mix e canais</span><strong>Composição da receita</strong></div></header>
      ${dashboardSegmentBar({ label: "Produtos", value: productRevenue, max: revenueMax, detail: `${number(productMixPct)}% da receita`, tone: "green" })}
      ${dashboardSegmentBar({ label: "Serviços", value: serviceRevenue, max: revenueMax, detail: `${number(serviceMixPct)}% da receita`, tone: "blue" })}
      <div class="cockpit-locked-line"><strong>Canais e lojas</strong><span>Importe canal/loja para comparar balcão, B2B, e-commerce e filiais.</span></div>
    </section>

    <section class="cockpit-zone cockpit-capital">
      <header><div><span>Estoque como capital</span><strong>Giro, cobertura e dinheiro parado</strong></div></header>
      <div class="cockpit-stock-stack">
        ${[
          ["Comprar agora", buyNowStock, "danger"],
          ["Acompanhar", attentionStock, "warn"],
          ["Excesso", excessStock, "blue"],
          ["Sem alerta", stockOk, "green"],
        ].map(([label, value, tone]) => `
          <article class="${tone}" style="--value:${Math.max(3, Math.min(100, (Number(value || 0) / stockTotal) * 100))}%">
            <span>${escapeHtml(label)}</span>
            <strong>${number(value)}</strong>
            <i></i>
          </article>
        `).join("")}
      </div>
      <div class="cockpit-locked-line"><strong>GMROI / sell-through</strong><span>Custos + estoque histórico + vendas por SKU liberam eficiência do capital.</span></div>
    </section>

    <section class="cockpit-zone cockpit-customers">
      <header><div><span>Clientes</span><strong>Carteira, concentração e recorrência</strong></div></header>
      <div class="cockpit-split">
        <div>${dashboardRankRows(customerRowsData, compactMoney)}</div>
        <div class="cockpit-kpi-column">
          ${dashboardScoreCell({ label: "Top 5 clientes", value: `${number(customerConcentration)}%`, detail: "peso na receita do recorte", tone: customerConcentration > 45 ? "warn" : "neutral", icon: "users" })}
          ${dashboardScoreCell({ label: "Recompra", value: number(repurchaseDue), detail: `${number(customerRisk)} clientes em risco`, tone: customerRisk ? "warn" : "good", icon: "repeat-2" })}
        </div>
      </div>
    </section>

    <section class="cockpit-zone cockpit-products">
      <header><div><span>Produtos e sortimento</span><strong>Curva, concentração e cauda longa</strong></div></header>
      <div class="cockpit-split">
        <div>${dashboardRankRows(productRows, compactMoney)}</div>
        <div>${dashboardRankRows(brandRows.slice(0, 5), compactMoney)}</div>
      </div>
    </section>

    <section class="cockpit-zone cockpit-data">
      <header><div><span>Dados e maturidade</span><strong>O que o cockpit já enxerga</strong></div></header>
      <div class="cockpit-data-grid">${dashboardDataMatrix(readinessSummary)}</div>
    </section>

    <section class="cockpit-zone cockpit-unlocks">
      <header>
        <div>
          <span>Inteligências bloqueadas</span>
          <strong>Por que importar mais dados</strong>
        </div>
        <button class="secondary-button compact" type="button" data-view-target="imports">Importações</button>
      </header>
      <div class="cockpit-unlock-list">${dashboardUnlockRows(retailConcepts)}</div>
    </section>

    <section class="cockpit-zone cockpit-services">
      <header><div><span>Serviços e recorrência</span><strong>Produto + serviço na mesma leitura</strong></div></header>
      ${dashboardRankRows(serviceRowsData, compactMoney)}
      <div class="cockpit-locked-line"><strong>Custo/hora de serviço</strong><span>Importe custo ou tempo para separar receita de rentabilidade.</span></div>
    </section>
  `;
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
      detail: readinessSummary?.upcomingCount ? `${number(readinessSummary.upcomingCount)} inteligências pedem mais dados.` : "Base ampla para visão executiva.",
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
        <em>Quanto mais dados entram, mais cruzamentos aparecem na mesa.</em>
      </div>
      <div class="dashboard-potential-ring" style="--progress:${Math.max(8, summary.progress)}%">
        <strong>${number(summary.progress)}%</strong>
      </div>
    </div>
    <div class="dashboard-potential-lanes">
      <section>
        <span>Já dá para explorar</span>
        ${(ready.length ? ready.slice(0, 3) : catalog.slice(0, 2)).map((item) => `
          <button class="dashboard-potential-item ${item.ready ? "ready" : "locked"}" type="button" data-view-target="${escapeAttr(item.ready ? item.view : "imports")}">
            <i data-lucide="${escapeAttr(item.icon)}"></i>
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <em>${escapeHtml(item.ready ? item.payoff : "A mesa já reserva espaço para essa leitura.")}</em>
            </div>
          </button>
        `).join("")}
      </section>
      <section>
        <span>Pode aparecer com mais dados</span>
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
              <strong>Mesa bem alimentada</strong>
              <em>Os principais cruzamentos já estão prontos para uso.</em>
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
  const periodLabel = summary.period?.label || document.querySelector("#periodLabel")?.textContent || "período selecionado";
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
  const revenueTone = totalRevenue ? "good" : "warn";
  const supplyTone = urgentStock ? "danger" : riskSuppliers.length ? "warn" : stockUniverse ? "good" : "neutral";
  const mixTone = topProductShare > 45 ? "warn" : productCount ? "good" : "neutral";
  const dataTone = sourceCoverage >= 70 ? "good" : "warn";
  const marginTone = lowMargin ? "warn" : readinessSummary.readiness.costs ? "good" : "neutral";
  const customerTone = customerRisk ? "warn" : customerCount ? "good" : "neutral";
  const heroSubtitle = totalRevenue
    ? `${number(productCount)} SKUs vendidos, ${number(customerCount)} clientes, ${number(supplierCount)} fornecedores e ${number(readinessSummary.sourceCount)} fontes reconhecidas.`
    : "Importe vendas, estoque, custos e clientes para transformar a abertura em leitura executiva.";
  const retailConcepts = dashboardRetailKpiConcepts({
    readinessSummary,
    totalRevenue,
    productCount,
    customerCount,
    lowMargin,
    urgentStock,
    sourceCoverage,
  });
  const hero = document.querySelector("#generalMapHero");
  if (hero) {
    hero.innerHTML = `
      <div class="cockpit-topbar">
        <div>
          <span>Cockpit varejo · ${escapeHtml(periodLabel)}</span>
          <h2>${escapeHtml(companyName)}</h2>
          <p>${escapeHtml(heroSubtitle)}</p>
        </div>
        <div class="cockpit-period-stack">
          <strong>${escapeHtml(totalRevenue ? compactMoney(totalRevenue) : "sem vendas")}</strong>
          <span>Receita no recorte</span>
        </div>
      </div>
      <div class="cockpit-scorebar">
        ${dashboardScoreCell({ label: "Receita", value: totalRevenue ? compactMoney(totalRevenue) : "sem vendas", detail: `${compactMoney(avgDailyRevenue)}/dia`, tone: totalRevenue ? "good" : "warn", icon: "trending-up" })}
        ${dashboardScoreCell({ label: "Rentabilidade", value: lowMargin ? `${number(lowMargin)} alertas` : "em leitura", detail: `${number(marginOpportunities)} oportunidades`, tone: lowMargin ? "warn" : "neutral", icon: "badge-percent" })}
        ${dashboardScoreCell({ label: "Clientes", value: number(customerCount), detail: `${number(repurchaseDue)} recompra; ${number(customerRisk)} risco`, tone: customerRisk ? "warn" : "good", icon: "users" })}
        ${dashboardScoreCell({ label: "Mix", value: `${number(productMixPct)}% produtos`, detail: `${number(serviceMixPct)}% serviços`, tone: "neutral", icon: "chart-pie" })}
        ${dashboardScoreCell({ label: "Capital", value: `${number(excessStock)} excesso`, detail: `${number(urgentStock)} sinais de estoque`, tone: urgentStock || excessStock ? "warn" : "good", icon: "coins" })}
        ${dashboardScoreCell({ label: "Dados", value: `${number(sourceCoverage)}%`, detail: `${number(readinessSummary.sourceCount)} de ${number(readinessSummary.sourceTotal)} fontes`, tone: sourceCoverage >= 70 ? "good" : "warn", icon: "database" })}
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
      topProduct.name ? operatorMovement({ icon: "package-search", title: "Produto em evidência", value: topProduct.name, detail: compactMoney(topProduct.revenue || 0), view: "products" }) : "",
      topCustomer.name ? operatorMovement({ icon: "users", title: "Cliente em destaque", value: topCustomer.name, detail: compactMoney(topCustomer.revenue || 0), view: "customers" }) : "",
      brandRows[0]?.label ? operatorMovement({ icon: "tags", title: "Marca com peso", value: brandRows[0].label, detail: compactMoney(brandRows[0].value || 0), view: "products" }) : "",
      operatorMovement({ icon: "boxes", title: "Estoque para olhar", value: `${number(urgentStock)} sinais`, detail: `${number(excessStock)} itens em excesso`, view: "stock" }),
      operatorMovement({ icon: "truck", title: "Fornecedor para analisar", value: topSupplier.supplier_name || "Sem fornecedor em destaque", detail: riskSuppliers.length ? `${number(riskSuppliers.length)} com sinais` : "Base pronta para leitura", view: "suppliers" }),
    ].filter(Boolean).slice(0, 4);
    movements.innerHTML = movementItems.join("");
  }
  const tools = document.querySelector("#operatorTools");
  if (tools) {
    tools.innerHTML = dashboardToolCards(readinessSummary);
  }
  const dataMap = document.querySelector("#operatorDataMap");
  if (dataMap) {
    dataMap.innerHTML = dashboardDataSourceItems({ readinessSummary, kpis, products, customers, totalRevenue, periodLabel, quoteSuppliers, supplierRows, pricing });
  }
  renderDashboardPotential(dashboardContext);
  const presets = document.querySelector("#dashboardViewPresets");
  if (presets) {
    presets.innerHTML = dashboardShortcutButtons();
  }
  renderDashboardCockpit({
    summary,
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
    retailConcepts,
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
  const metrics = payload.metrics || {};
  const unlocked = payload.unlocked || [];
  const improvements = payload.improvements || [];
  const next = payload.next_actions || [];
  const visibleUnlocked = unlocked.slice(0, 3);
  const visibleImprovements = improvements.slice(0, 2);
  const visibleNext = next.slice(0, 3);
  const focus = payload.focus || {};
  const progress = Math.max(0, Math.min(Number(payload.score || 0), 100));
  document.querySelector("#maturity").innerHTML = `
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
  button.dataset.viewTarget = next[0]?.view || "quotes";
  button.textContent = next[0]?.action || "Abrir compras";
}

function renderMissions(payload) {
  const missions = payload.missions || [];
  document.querySelector("#missions").innerHTML = `
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

function monthlyRowsForDisplay(rows, grain = "month") {
  if (!state.hideCurrentMonthRevenue) return rows;
  const currentKey = grain === "day" ? currentDayKey() : currentMonthKey();
  return rows.filter((row) => monthlyBucketKey(row, grain) !== currentKey);
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
  const formatBucket = (raw) => {
    if (!raw) return "";
    const value = String(raw);
    if (grain === "day") {
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
    const labels = chartRows.map((row) => formatBucket(row.month));
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
          <span>${formatBucket(row.month)}</span>
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
  document.querySelector("#tasks").innerHTML = tasks
    .map((task) => `<div class="task"><strong>${task.title}</strong><span>${task.status} - prioridade ${task.priority}</span></div>`)
    .join("");
}

