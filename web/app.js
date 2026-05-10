const state = {
  products: [],
  productMode: "operational",
  productFilteredRows: [],
  stock: [],
  summary: null,
  suppliers: [],
  supplierMode: "operational",
  quoteSuppliers: [],
  quoteWorkbench: null,
  selectedQuoteSupplierId: "",
  quoteWindowDays: "90",
  quoteMode: "operational",
  quoteStep: "supplier",
  quoteSaveTimers: new Map(),
  postSaveRefreshTasks: {},
  postSaveRefreshOptions: {},
  postSaveRefreshTimer: null,
  quoteSupplierChip: "all",
  quoteSupplierChipPinned: false,
  quoteSupplierPreviewId: "",
  quoteWorkbenchSort: { key: "", dir: "asc" },
  quotes: [],
  purchaseOrders: [],
  maturity: null,
  replenishment: null,
  commercial: null,
  commercialMode: "operational",
  actions: null,
  selectedActionId: "",
  skills: null,
  pricing: null,
  pricingMode: "operational",
  selectedPricingProductId: "",
  customers: [],
  customerMode: "operational",
  services: [],
  imports: null,
  companyProfile: null,
  importMode: "operational",
  erpImport: null,
  erpImportPayload: null,
  erpImportFile: null,
  erpManualConflicts: [],
  quickActions: new Map(),
  periodDays: "180",
  monthlyChart: null,
  generalCharts: {},
};

const VIEW_ROUTES = {
  dashboard: "/painel",
  actions: "/hoje",
  engine: "/motor",
  products: "/produtos",
  stock: "/reposicao",
  suppliers: "/fornecedores",
  quotes: "/compras",
  pricing: "/precos",
  opportunities: "/oportunidades",
  customers: "/clientes",
  services: "/servicos",
  imports: "/importacao",
};
const ROUTE_VIEWS = {
  ...Object.fromEntries(Object.entries(VIEW_ROUTES).map(([view, route]) => [route, view])),
  "/": "dashboard",
  "/cotacoes": "quotes",
};
const NAV_ICONS = {
  dashboard: "layout-dashboard",
  actions: "list-todo",
  engine: "brain-circuit",
  products: "package-search",
  stock: "boxes",
  suppliers: "truck",
  quotes: "shopping-cart",
  pricing: "chart-no-axes-combined",
  opportunities: "bar-chart-3",
  customers: "users",
  services: "wrench",
  imports: "upload-cloud",
};
const KPI_ICONS = {
  Produtos: "package",
  Clientes: "users",
  "Receita produtos": "trending-up",
  "Receita servicos": "briefcase-business",
  "Estoque un.": "boxes",
  Pendencias: "circle-alert",
};
const SUPPLIER_WORKBENCH_SUPPLIER_KEYS = [
  "supplier_id",
  "supplier_name",
  "contact_phone",
  "minimum_order_value",
  "target_order_value",
  "active_skus",
  "buy_now_count",
  "urgent_count",
  "out_of_mix_count",
  "alert_count",
  "open_quote_count",
  "latest_quote_at",
  "latest_quote_id",
  "estimated_value",
];
const VIEW_META = {
  dashboard: {
    label: "Mapa Geral",
    eyebrow: "Visao da operacao",
    subtitle: "Dashboard amplo para o dono ou gerente entender faturamento, produtos, clientes, estoque e dados importados.",
    question: "Como a empresa esta se comportando?",
    next: "Use o mapa para se situar e abrir o modulo certo.",
  },
  quotes: {
    label: "Compras",
    eyebrow: "Mesa de trabalho",
    subtitle: "Fornecedores, pedido minimo, mix, giro e sugestao de quantidade para montar pedidos melhores.",
    question: "Quais fornecedores ja estao formando pedido?",
    next: "Escolha um fornecedor e ajuste as quantidades no fluxo.",
  },
  stock: {
    label: "Estoque",
    eyebrow: "Giro e cobertura",
    subtitle: "Leitura de risco para saber o que pode faltar, o que esta sobrando e o que deve alimentar compras.",
    question: "Onde falta produto ou sobra dinheiro parado?",
    next: "Revise ruptura, excesso e cobertura antes de comprar.",
  },
  products: {
    label: "Produtos",
    eyebrow: "Mix comercial",
    subtitle: "Produtos campeoes, cauda longa, fornecedor, estoque e contexto para decidir o que manter no mix.",
    question: "Quais produtos sustentam o negocio?",
    next: "Abra produtos para ver venda, estoque, margem e memoria.",
  },
  suppliers: {
    label: "Fornecedores",
    eyebrow: "Abastecimento",
    subtitle: "Fornecedores, marcas atendidas, pedido minimo, contato e regras comerciais usadas nas compras.",
    question: "Quem sustenta meu abastecimento?",
    next: "Complete cadastro comercial antes de cotar.",
  },
  customers: {
    label: "Clientes",
    eyebrow: "Carteira",
    subtitle: "Clientes por receita, recorrencia e sinais para estudar padroes de compra.",
    question: "Quem compra, quanto compra e quem esta esfriando?",
    next: "Use a carteira para identificar clientes importantes.",
  },
  opportunities: {
    label: "Vendas",
    eyebrow: "Movimento comercial",
    subtitle: "Clientes em risco, recompra provavel e produtos ou marcas ganhando e perdendo ritmo.",
    question: "O que esta mudando nas vendas?",
    next: "Compare clientes, produtos e marcas em movimento.",
  },
  services: {
    label: "Servicos",
    eyebrow: "Venda de servicos",
    subtitle: "Receita, volume e peso liquido dos servicos importados do ERP.",
    question: "Quais servicos ajudam o resultado?",
    next: "Compare receita bruta e liquida por servico.",
  },
  pricing: {
    label: "Margem",
    eyebrow: "Preco e resultado",
    subtitle: "Produtos que vendem bem, mas podem estar entregando pouca margem pelo custo/preco atual.",
    question: "Onde vendo bem mas ganho pouco?",
    next: "Revise custo, papel do produto e preco alvo no Nexo.",
  },
  actions: {
    label: "Alertas/Tarefas",
    eyebrow: "Memoria operacional",
    subtitle: "Fila de trabalho, cotacoes, pedidos, decisoes registradas e eventos recentes da operacao.",
    question: "O que ja virou rotina ou pendencia?",
    next: "Resolva, ignore ou registre a decisao tomada.",
  },
  imports: {
    label: "Importacoes",
    eyebrow: "Dados do ERP",
    subtitle: "Entrada, mapeamento e confiabilidade dos dados que alimentam a mesa de trabalho.",
    question: "Posso confiar nos dados que estou vendo?",
    next: "Confira qualidade, mudancas e campos ainda faltantes.",
  },
  engine: {
    label: "Motor",
    eyebrow: "Explicabilidade",
    subtitle: "Skills, regras e rastreabilidade que explicam por que o Nexo recomenda uma acao.",
    question: "Como o Nexo chegou nessa leitura?",
    next: "Use para auditar regras e entender evidencias.",
  },
};

function periodQuery() {
  return state.periodDays === "all" ? "?period_days=all" : `?period_days=${encodeURIComponent(state.periodDays)}`;
}

const IMPORT_STATUS_LABELS = {
  completed: "Concluído",
  pending: "Pendente",
  in_progress: "Em andamento",
  running: "Em andamento",
  failed: "Falhou",
  error: "Falhou",
  cancelled: "Cancelado",
};

function importStatusLabel(status) {
  if (!status) return "-";
  return IMPORT_STATUS_LABELS[String(status).toLowerCase()] || status;
}

function importBatchTitle(batch) {
  const source = batch.source_system ? String(batch.source_system).toUpperCase() : "Importação";
  const when = batch.started_at || batch.finished_at;
  return when ? `${source} · ${shortDateTime(when)}` : source;
}

function importBatchSummary(batch) {
  let summary = {};
  try { summary = JSON.parse(batch.summary_json || "{}"); } catch (_e) { summary = {}; }
  return summary;
}

function importBatchFileNames(batch) {
  const files = Array.isArray(batch.files) ? batch.files : [];
  if (files.length) return files.map((file) => file.file_name).filter(Boolean);
  const summary = importBatchSummary(batch);
  if (summary.file_name) return [summary.file_name];
  return [];
}

function importBatchMeta(batch) {
  const summary = importBatchSummary(batch);
  const mapped = Number(summary.mapped_rows || summary.rows || 0);
  const parts = [importStatusLabel(batch.status)];
  if (batch.source_period_start || batch.source_period_end) {
    parts.push(`Período ${shortDate(batch.source_period_start)} a ${shortDate(batch.source_period_end)}`);
  }
  if (mapped) parts.push(`${number(mapped)} linhas`);
  return parts.join(" · ");
}

function importBatchCounts(batch) {
  const summary = importBatchSummary(batch);
  const stats = batch.stats || {};
  const counts = [];
  const invRows = Number(stats.inventory_rows || summary.inventory_snapshots_imported || 0);
  const invProducts = Number(stats.inventory_products || summary.inventory_products_imported || 0);
  const priceRows = Number(stats.price_rows || summary.price_snapshots_imported || 0);
  const priceProducts = Number(stats.price_products || summary.price_products_imported || 0);
  const costRows = Number(stats.cost_rows || summary.cost_snapshots_imported || 0);
  const costProducts = Number(stats.cost_products || summary.cost_products_imported || 0);
  const productSalesRows = Number(stats.product_sales_rows || summary.product_sales_imported || 0);
  const productSalesProducts = Number(stats.product_sales_products || summary.product_sales_products_imported || 0);
  const serviceSalesRows = Number(stats.service_sales_rows || summary.service_sales_imported || 0);
  const serviceSalesServices = Number(stats.service_sales_services || summary.service_sales_services_imported || 0);
  const ids = Number(summary.identifiers_imported || 0);
  const settings = Number(summary.product_settings_imported || 0);
  const suppliers = Number(summary.supplier_profiles_imported || 0);
  const sourceProducts = Number(stats.source_product_codes || summary.product_codes_detected || 0);
  const sourceProductRows = Number(stats.source_product_code_rows || 0);
  if (sourceProducts) counts.push(`${number(sourceProducts)} produtos identificados${sourceProductRows && sourceProductRows !== sourceProducts ? ` em ${number(sourceProductRows)} linhas` : ""}`);
  if (invProducts || invRows) counts.push(`${number(invProducts || invRows)} produtos com estoque${invRows && invProducts && invRows !== invProducts ? ` (${number(invRows)} snapshots)` : ""}`);
  if (priceProducts || priceRows) counts.push(`${number(priceProducts || priceRows)} produtos com preco`);
  if (costProducts || costRows) counts.push(`${number(costProducts || costRows)} produtos com custo`);
  if (productSalesRows) counts.push(`${number(productSalesRows)} vendas de produto${productSalesProducts ? ` (${number(productSalesProducts)} produtos)` : ""}`);
  if (serviceSalesRows) counts.push(`${number(serviceSalesRows)} vendas de servico${serviceSalesServices ? ` (${number(serviceSalesServices)} servicos)` : ""}`);
  if (summary.product_sales_duplicates) counts.push(`${number(summary.product_sales_duplicates)} vendas de produto ja existentes`);
  if (summary.service_sales_duplicates) counts.push(`${number(summary.service_sales_duplicates)} vendas de servico ja existentes`);
  if (ids) counts.push(`${number(ids)} identificadores`);
  if (settings) counts.push(`${number(settings)} configs`);
  if (suppliers) counts.push(`${number(suppliers)} fornecedores`);
  return counts.join(" · ");
}

function erpImportImpactText(summary = {}) {
  const parts = [];
  const productCodes = Number(summary.product_codes_detected || 0);
  const invProducts = Number(summary.inventory_products_imported || 0);
  const priceProducts = Number(summary.price_products_imported || 0);
  const costProducts = Number(summary.cost_products_imported || 0);
  const productSales = Number(summary.product_sales_imported || 0);
  const serviceSales = Number(summary.service_sales_imported || 0);
  if (productCodes) parts.push(`${number(productCodes)} produtos identificados`);
  if (invProducts) parts.push(`${number(invProducts)} produtos com estoque`);
  if (priceProducts) parts.push(`${number(priceProducts)} produtos com preco`);
  if (costProducts) parts.push(`${number(costProducts)} produtos com custo`);
  if (productSales) parts.push(`${number(productSales)} vendas de produto novas`);
  if (serviceSales) parts.push(`${number(serviceSales)} vendas de servico novas`);
  if (summary.product_sales_duplicates) parts.push(`${number(summary.product_sales_duplicates)} vendas de produto ja existiam`);
  if (summary.service_sales_duplicates) parts.push(`${number(summary.service_sales_duplicates)} vendas de servico ja existiam`);
  return parts.join(", ");
}

function trimCode(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (!s) return "";
  return s.replace(/^0+(?=.)/, "");
}

function productCode(value) {
  return trimCode(value);
}

function quoteDisplayCode(row) {
  if (row?.supplier_reference) return row.supplier_reference;
  return productCode(row?.source_code || row?.quote_code || "");
}

function companyProfileName(profile = state.companyProfile) {
  return profile?.trade_name || profile?.legal_name || profile?.organization_name || "";
}

function companyProfileLogoPath(profile = state.companyProfile) {
  return profile?.logo_path || "/logo-practica-transparent.png";
}

async function loadCompanyProfile(options = {}) {
  if (state.companyProfile && !options.force) return state.companyProfile;
  state.companyProfile = await api("/api/company-profile");
  return state.companyProfile;
}

function sumBy(rows = [], key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function aggregateMap(rows = [], key, valueKey, fallback = "Sem classificacao") {
  const map = new Map();
  rows.forEach((row) => {
    const label = row[key] || fallback;
    map.set(label, (map.get(label) || 0) + Number(row[valueKey] || 0));
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function generalMiniRows(rows = [], valueFormatter = compactMoney) {
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
  return rows.slice(0, 5).map((row) => {
    const pct = Math.max(4, Math.min(100, (Number(row.value || 0) / max) * 100));
    return `
      <div class="general-mini-row">
        <span>${escapeHtml(row.label || "-")}</span>
        <strong>${escapeHtml(valueFormatter(row.value))}</strong>
        <i style="width:${pct}%"></i>
      </div>
    `;
  }).join("") || `<div class="empty-state compact-empty">Sem dados suficientes neste recorte.</div>`;
}

function biSignal({ label, value, detail, tone = "neutral", icon = "activity", view = "" }) {
  const target = view ? ` data-view-target="${escapeAttr(view)}"` : "";
  return `
    <button class="bi-signal ${escapeAttr(tone)}" type="button"${target}>
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail || "")}</em>
    </button>
  `;
}

function dashboardShortcutButtons() {
  const items = [
    ["actions", "Hoje", "list-todo"],
    ["quotes", "Compras", "shopping-cart"],
    ["stock", "Estoque", "boxes"],
    ["products", "Produtos", "package-search"],
    ["suppliers", "Fornec.", "truck"],
    ["pricing", "Margem", "chart-no-axes-combined"],
    ["customers", "Clientes", "users"],
    ["imports", "Dados", "upload-cloud"],
  ];
  return items.map(([view, label, icon]) => `
    <button class="dashboard-float-btn" type="button" data-view-target="${escapeAttr(view)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>${escapeHtml(label)}</span>
    </button>
  `).join("");
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
  const kpis = summary.kpis || {};
  const periodLabel = summary.period?.label || document.querySelector("#periodLabel")?.textContent || "periodo selecionado";
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
  const lowMargin = Number(pricing.summary?.negative_margin || 0) + Number(pricing.summary?.low_margin || 0);
  const quality = imports.quality || {};
  const brandRows = aggregateMap(products, "brand_name", "revenue", "Sem marca");
  const supplierRows = aggregateMap(products, "supplier_name", "revenue", "Sem fornecedor");
  const productRows = products.slice(0, 5).map((row) => ({ label: row.name, value: row.revenue }));
  const customerRowsData = customers.slice(0, 5).map((row) => ({ label: row.name, value: row.revenue }));
  const serviceRowsData = services.slice(0, 4).map((row) => ({ label: row.name, value: row.revenue }));
  const customerRisk = Number(state.commercial?.summary?.at_risk_customers || 0);
  const repurchaseDue = Number(state.commercial?.summary?.due_customers || 0);
  const profileName = companyProfileName();
  const profileLogo = companyProfileLogoPath();
  const hero = document.querySelector("#generalMapHero");
  if (hero) {
    hero.innerHTML = `
      <div class="bi-client-logo">
        <img src="${escapeAttr(profileLogo)}" alt="${escapeAttr(profileName || "Logo da empresa")}" />
      </div>
      <div class="bi-hero-copy">
        <span>Mapa Geral</span>
        <h2>${escapeHtml(totalRevenue ? `${compactMoney(totalRevenue)} movimentados no recorte` : "Operacao pronta para leitura")}</h2>
        <p>Dashboard central para abrir compras, estoque, margem, clientes e dados a partir dos sinais mais importantes da empresa.</p>
      </div>
      <div class="bi-hero-metrics">
        <button type="button" data-view-target="quotes">
          <span>Compras</span>
          <strong>${number(riskSuppliers.length)}</strong>
          <em>${topSupplier.supplier_name ? topSupplier.supplier_name : "fornecedores"}</em>
        </button>
        <button type="button" data-view-target="stock">
          <span>Risco estoque</span>
          <strong>${number(urgentStock)}</strong>
          <em>${number(excessStock)} excesso</em>
        </button>
        <button type="button" data-view-target="pricing">
          <span>Margem</span>
          <strong>${number(lowMargin)}</strong>
          <em>itens a revisar</em>
        </button>
      </div>
      <div class="bi-hero-facts">
        <span><i data-lucide="calendar-days"></i>${escapeHtml(periodLabel)}</span>
        <span><i data-lucide="package"></i>${number(kpis.products)} produtos</span>
        <span><i data-lucide="users"></i>${number(kpis.customers)} clientes</span>
        <span><i data-lucide="database"></i>${quality.score == null ? "dados importados" : `${number(quality.score)}% confianca`}</span>
      </div>
    `;
  }
  const cards = document.querySelector("#generalMapCards");
  if (cards) {
    cards.innerHTML = [
      biSignal({ label: "Receita total", value: compactMoney(totalRevenue), detail: periodLabel, tone: "good", icon: "trending-up", view: "products" }),
      biSignal({ label: "Compras prontas", value: number(readySuppliers.length), detail: `${number(riskSuppliers.length)} formando pedido`, tone: readySuppliers.length ? "good" : "warn", icon: "shopping-cart", view: "quotes" }),
      biSignal({ label: "Risco estoque", value: number(urgentStock), detail: `${number(excessStock)} em excesso`, tone: urgentStock ? "danger" : "good", icon: "boxes", view: "stock" }),
      biSignal({ label: "Margem alerta", value: number(lowMargin), detail: `${number(pricing.summary?.opportunities || 0)} oportunidades`, tone: lowMargin ? "warn" : "good", icon: "chart-no-axes-combined", view: "pricing" }),
      biSignal({ label: "Clientes risco", value: number(customerRisk), detail: `${number(repurchaseDue)} recompra provavel`, tone: customerRisk ? "warn" : "good", icon: "users", view: "opportunities" }),
      biSignal({ label: "Confianca dados", value: quality.score == null ? "OK" : `${number(quality.score)}%`, detail: quality.score == null ? "dados importados" : quality.status === "ready" ? "base pronta" : "revisar origem", tone: quality.status === "ready" || quality.score == null ? "good" : "warn", icon: "database", view: "imports" }),
    ].join("");
  }
  const presets = document.querySelector("#dashboardViewPresets");
  if (presets) {
    presets.innerHTML = dashboardShortcutButtons();
  }
  renderGeneralDoughnut("#generalRevenueMix", ["Produtos", "Servicos"], [productRevenue, serviceRevenue], ["#18a058", "#2f7eb8"], money);
  renderGeneralDoughnut("#generalStockChart", ["Reposicao", "Excesso", "Ok"], [urgentStock, excessStock, Math.max(0, Number(replenishment.summary?.ok || 0))], ["#ef4444", "#f59e0b", "#18a058"], number);
  renderGeneralDoughnut("#generalCustomerProfile", ["Risco", "Recompra", "Ranking"], [customerRisk, repurchaseDue, Math.max(0, customers.length - customerRisk - repurchaseDue)], ["#f59e0b", "#2f7eb8", "#18a058"], number);
  renderBiBars("#generalPurchaseChart", quoteSuppliers.slice().sort((a, b) => Number(b.estimated_value || 0) - Number(a.estimated_value || 0)).map((row) => ({ label: row.supplier_name, value: row.estimated_value })), compactMoney);
  renderBiBars("#generalTopProducts", productRows, compactMoney);
  renderBiBars("#generalTopCustomers", customerRowsData, compactMoney);
  renderBiBars("#generalTopBrands", brandRows, compactMoney);
  renderBiBars("#generalTopServices", serviceRowsData, compactMoney);
  renderBiBars("#generalMarginChart", [
    { label: "Margem negativa", value: Number(pricing.summary?.negative_margin || 0) },
    { label: "Margem baixa", value: Number(pricing.summary?.low_margin || 0) },
    { label: "Sem custo", value: Number(pricing.summary?.missing_cost || 0) },
    { label: "Oportunidades", value: Number(pricing.summary?.opportunities || 0) },
  ], number);
  renderBiScore("#generalDataQuality", quality.score == null ? 72 : quality.score, quality.status === "ready" ? "Base confiavel" : "Base em revisao", quality.next_step || "Importacoes, custos, estoque e vendas alimentam os indicadores do painel.");
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
        <div><span>Pedido minimo</span><strong>${number(metrics.minimum_pct)}%</strong></div>
        <div><span>Cotaveis</span><strong>${number(metrics.quote_items)}</strong></div>
      </div>
      <div class="focus-panel">
        <div>
          <span>Foco agora</span>
          <strong>${escapeHtml(focus.headline || "Comece pelo que ja da resultado")}</strong>
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
          ${visibleImprovements.length ? visibleImprovements.map(renderCapability).join("") : `<div class="capability muted"><strong>Aguardando uso operacional</strong><span>Gere e acompanhe cotacoes para o Nexo aprender prazos, respostas e compras reais.</span></div>`}
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
              <small>${number(item.progress)}% concluido</small>
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

function renderMonthly(rows, granularity) {
  const grain = granularity || state.summary?.monthly_granularity || "month";
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
  if (window.echarts) {
    const target = document.querySelector("#monthlyChart");
    if (!target) return;
    const canvasId = "monthlyRevenueEchart";
    target.innerHTML = `<div id="${canvasId}" class="echart-surface" role="img" aria-label="Receita por periodo"></div>
      <div class="chart-legend" aria-hidden="true">
        <span><i class="legend-product"></i>Produtos</span>
        <span><i class="legend-service"></i>Servicos</span>
        <span><i class="legend-total"></i>Total</span>
      </div>`;
    disposeChartInstance(state.monthlyChart);
    const chart = echarts.init(document.querySelector(`#${canvasId}`), null, { renderer: "canvas" });
    const totals = rows.map((row) => Number(row.product_revenue || 0) + Number(row.service_revenue || 0));
    const labels = rows.map((row) => formatBucket(row.month));
    const surfaceWidth = target.clientWidth || 720;
    const adaptiveBar = Math.max(4, Math.min(44, Math.floor((surfaceWidth - 60) / Math.max(rows.length, 1)) - 4));
    const labelInterval = rows.length > 24 ? Math.ceil(rows.length / 12) - 1 : 0;
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
          rotate: rows.length > 12 ? 35 : 0,
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
          data: rows.map((row) => Number(row.product_revenue || 0)),
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
          name: "Servicos",
          type: "bar",
          stack: "receita",
          data: rows.map((row) => Number(row.service_revenue || 0)),
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
    return;
  }
  const max = Math.max(...rows.map((row) => Number(row.product_revenue || 0) + Number(row.service_revenue || 0)), 1);
  document.querySelector("#monthlyChart").innerHTML = rows
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

function sumRows(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function productRows(rows) {
  if (!rows.length) {
    return `<tr><td colspan="7"><strong>Nenhum produto encontrado</strong><span class="muted-line">Revise o filtro ou o periodo selecionado.</span></td></tr>`;
  }
  return rows
    .map(
      (row) => `
      <tr class="clickable-row product-row" data-product-id="${escapeAttr(row.id)}">
        <td>${escapeHtml(productCode(row.source_code))}</td>
        <td><strong class="product-name">${escapeHtml(row.name)}</strong></td>
        <td>${escapeHtml(row.supplier_name || "Sem fornecedor")}</td>
        <td>${escapeHtml(row.brand_name || "Sem marca")}</td>
        <td class="num">${number(row.quantity)}</td>
        <td class="num">${money(row.revenue)}</td>
        <td class="num">${number(row.share)}%</td>
      </tr>
    `,
    )
    .join("");
}

function productStockIndex() {
  return new Map((state.stock || []).map((row) => [row.product_id, row]));
}

function productWithStock(row, stockIndex = productStockIndex()) {
  return { ...row, stock: stockIndex.get(row.id) || null };
}

function mixDecisionCard(item) {
  const stock = item.stock || {};
  const status = stock.status_label || (Number(item.share || 0) < 0.5 ? "Cauda longa" : "Produto relevante");
  const evidence = stock.reason || `${number(item.share || 0)}% da receita exibida no periodo.`;
  const value = Number(stock.estimated_value || item.revenue || 0);
  return `
    <button class="mix-card" type="button" data-product-id="${escapeAttr(item.id || stock.product_id || "")}">
      <span class="status-chip ${escapeAttr(stock.status || "muted")}">${escapeHtml(status)}</span>
      <strong>${escapeHtml(item.name || stock.name || "")}</strong>
      <span>${escapeHtml(item.supplier_name || stock.supplier_name || "Sem fornecedor")} · ${escapeHtml(item.brand_name || stock.brand_name || "Sem marca")}</span>
      <em>${escapeHtml(evidence)}</em>
      <small>${value ? compactMoney(value) : number(stock.stock_units || item.quantity || 0)}</small>
    </button>
  `;
}

function mixDecisionLane(title, subtitle, items, emptyText) {
  return `
    <article class="mix-lane">
      <header>
        <span>${escapeHtml(subtitle)}</span>
        <strong>${escapeHtml(title)}</strong>
      </header>
      <div>
        ${
          items.length
            ? items.slice(0, 4).map(mixDecisionCard).join("")
            : `<div class="mix-empty">${escapeHtml(emptyText)}</div>`
        }
      </div>
    </article>
  `;
}

function mixDecisionBoard(rows = state.products || []) {
  const stockIndex = productStockIndex();
  const enriched = rows.map((row) => productWithStock(row, stockIndex));
  const stockRows = state.stock || [];
  const buy = stockRows
    .filter((row) => Number(row.suggested_quantity || 0) > 0 && ["urgent", "buy_now"].includes(row.status))
    .sort((a, b) => Number(b.estimated_value || 0) - Number(a.estimated_value || 0))
    .map((row) => productWithStock({
      id: row.product_id,
      name: row.name,
      supplier_name: row.supplier_name,
      brand_name: row.brand_name,
      revenue: row.revenue,
      share: 0,
    }, new Map([[row.product_id, row]])));
  const decide = stockRows
    .filter((row) => row.mix_decision_required || row.status === "mix_review")
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .map((row) => productWithStock({
      id: row.product_id,
      name: row.name,
      supplier_name: row.supplier_name,
      brand_name: row.brand_name,
      revenue: row.revenue,
      share: 0,
    }, new Map([[row.product_id, row]])));
  const committedIds = new Set([...buy, ...decide].map((row) => row.id));
  const protect = enriched
    .filter((row) => !committedIds.has(row.id) && (Number(row.share || 0) >= 1 || row.stock?.abc_class === "A"))
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
  const investigate = enriched
    .filter((row) => Number(row.share || 0) < 0.5)
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
  return `
    ${mixDecisionLane("Proteger lideres", "manter venda", protect, "Sem lider relevante no filtro atual.")}
    ${mixDecisionLane("Comprar agora", "evitar ruptura", buy, "Nenhuma compra urgente neste recorte.")}
    ${mixDecisionLane("Decidir mix", "nao comprar no automatico", decide, "Nenhum item pedindo decisao de mix agora.")}
    ${mixDecisionLane("Investigar cauda", "reduzir ruido", investigate, "A cauda longa nao apareceu no ranking atual.")}
  `;
}

function selectOptions(rows, key, fallback) {
  const values = [...new Set(rows.map((row) => row[key] || fallback).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("");
}

function populateProductFilters(rows = state.products) {
  const supplierSelect = document.querySelector("#productSupplierFilter");
  const brandSelect = document.querySelector("#productBrandFilter");
  if (!supplierSelect || !brandSelect) return;
  const currentSupplier = supplierSelect.value;
  const currentBrand = brandSelect.value;
  supplierSelect.innerHTML = `<option value="">Todos os fornecedores</option>${selectOptions(rows, "supplier_name", "Sem fornecedor")}`;
  brandSelect.innerHTML = `<option value="">Todas as marcas</option>${selectOptions(rows, "brand_name", "Sem marca")}`;
  supplierSelect.value = [...supplierSelect.options].some((option) => option.value === currentSupplier) ? currentSupplier : "";
  brandSelect.value = [...brandSelect.options].some((option) => option.value === currentBrand) ? currentBrand : "";
}

function filteredProducts() {
  const term = document.querySelector("#productSearch")?.value.trim().toLowerCase() || "";
  const supplier = document.querySelector("#productSupplierFilter")?.value || "";
  const brand = document.querySelector("#productBrandFilter")?.value || "";
  return (state.products || []).filter((row) => {
    const matchesTerm = `${row.source_code || ""} ${row.name || ""}`.toLowerCase().includes(term);
    const matchesSupplier = !supplier || (row.supplier_name || "Sem fornecedor") === supplier;
    const matchesBrand = !brand || (row.brand_name || "Sem marca") === brand;
    return matchesTerm && matchesSupplier && matchesBrand;
  });
}

function applyProductFilters() {
  const rows = filteredProducts();
  state.productFilteredRows = rows;
  const board = document.querySelector("#mixDecisionBoard");
  if (board) board.innerHTML = mixDecisionBoard(rows);
  document.querySelector("#productsTable").innerHTML = productRows(rows);
  const count = document.querySelector("#productBulkCount");
  if (count) count.textContent = `${number(rows.length)} produto(s) no filtro atual`;
  const bulkButton = document.querySelector("#productBulkMix");
  if (bulkButton) bulkButton.disabled = rows.length === 0;
}

function setProductMode(mode) {
  setModuleMode({
    stateKey: "productMode",
    modeAttr: "data-product-mode",
    operationalSelector: "#productOperational",
    dashboardSelector: "#productDashboard",
  }, mode);
}

function productChartRows(items, valueKey = "revenue", valueFormatter = compactMoney, options = {}) {
  return dashboardChartRows(items, {
    valueKey,
    valueFormatter,
    rowClass: "product-chart-row",
    labelFor: (item) => item.label || item.name || "",
    attrsFor: (item) => {
      const filterAttr = options.filterKey ? ` data-product-filter-key="${escapeAttr(options.filterKey)}" data-product-filter-value="${escapeAttr(item.label)}"` : "";
      const productAttr = item.id ? ` data-product-id="${escapeAttr(item.id)}"` : "";
      return `${filterAttr}${productAttr}`;
    },
  });
}

function aggregateBy(rows, key, fallback) {
  const map = new Map();
  rows.forEach((row) => {
    const label = row[key] || fallback;
    const item = map.get(label) || { label, revenue: 0, quantity: 0, count: 0 };
    item.revenue += Number(row.revenue || 0);
    item.quantity += Number(row.quantity || 0);
    item.count += 1;
    map.set(label, item);
  });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

function productDashboardCharts(rows = state.products || []) {
  const totalRevenue = sumRows(rows, "revenue");
  const topFiveRevenue = rows.slice(0, 5).reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const topFiveShare = rows.slice(0, 5).reduce((sum, row) => sum + Number(row.share || 0), 0);
  const longTail = rows.filter((row) => Number(row.share || 0) < 0.5);
  const supplierItems = aggregateBy(rows, "supplier_name", "Sem fornecedor").slice(0, 6);
  const brandItems = aggregateBy(rows, "brand_name", "Sem marca").slice(0, 6);
  const topProducts = rows.slice(0, 6).map((row) => ({ ...row, label: row.name }));
  const longTailRevenue = longTail.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const topFivePct = totalRevenue ? (topFiveRevenue / totalRevenue) * 100 : topFiveShare;
  return `
    <article class="product-dashboard-card">
      <div>
        <span>Concentracao top 5</span>
        <strong>${number(topFivePct)}%</strong>
        <p>${money(topFiveRevenue)} concentrados nos cinco primeiros itens do ranking.</p>
      </div>
      <div class="product-donut" style="--value: ${Math.max(0, Math.min(100, topFivePct))}">
        <span>${number(topFivePct)}%</span>
      </div>
    </article>
    <article class="product-dashboard-card">
      <div>
        <span>Cauda longa</span>
        <strong>${number(longTail.length)}</strong>
        <p>${compactMoney(longTailRevenue)} em itens com menos de 0,5% de participacao individual.</p>
      </div>
    </article>
    <article class="product-chart-card">
      <header><strong>Produtos lideres</strong><span>Clique para abrir o detalhe</span></header>
      <div class="product-chart">${productChartRows(topProducts, "revenue", compactMoney)}</div>
    </article>
    <article class="product-chart-card">
      <header><strong>Fornecedores no mix</strong><span>Clique para filtrar a mesa</span></header>
      <div class="product-chart">${productChartRows(supplierItems, "revenue", compactMoney, { filterKey: "supplier" })}</div>
    </article>
    <article class="product-chart-card">
      <header><strong>Marcas no mix</strong><span>Clique para filtrar a mesa</span></header>
      <div class="product-chart">${productChartRows(brandItems, "revenue", compactMoney, { filterKey: "brand" })}</div>
    </article>
    <article class="product-dashboard-card wide">
      <div>
        <span>Insight do Nexo</span>
        <strong>Proteja lideres, questione a cauda</strong>
        <p>O operacional deve priorizar estoque, preco e fornecedor dos lideres. A cauda longa precisa de decisao: manter por estrategia, comprar sob demanda ou retirar do mix ativo.</p>
      </div>
    </article>
  `;
}

function renderProductDashboard(rows = state.products || []) {
  document.querySelector("#productDashboardCharts").innerHTML = productDashboardCharts(rows);
}

function renderProducts(rows = []) {
  state.products = rows;
  state.productFilteredRows = rows;
  const top = rows[0] || {};
  const topFiveShare = rows.slice(0, 5).reduce((total, row) => total + Number(row.share || 0), 0);
  const totalRevenue = sumRows(rows, "revenue");
  const totalQuantity = sumRows(rows, "quantity");
  renderKpiGrid("#productsSummary", [
    ["Itens no ranking", number(rows.length), "blue"],
    ["Receita exibida", compactMoney(totalRevenue), "green"],
    ["Unidades vendidas", number(totalQuantity), ""],
    ["Top 5 do mix", `${number(topFiveShare)}%`, "amber"],
    ["Fornecedores", number(aggregateBy(rows, "supplier_name", "Sem fornecedor").length), "blue"],
    ["Marcas", number(aggregateBy(rows, "brand_name", "Sem marca").length), ""],
    ["Cauda <0,5%", number(rows.filter((row) => Number(row.share || 0) < 0.5).length), "amber"],
    ["Ticket/un.", money(totalQuantity ? totalRevenue / totalQuantity : 0), ""],
  ]);
  insightCards("#productInsights", [
    {
      title: top.name ? `Lider: ${top.name}` : "Sem produto lider",
      body: top.name ? `${money(top.revenue)} no periodo, com ${number(top.quantity)} unidades e ${number(top.share)}% da receita exibida.` : "Importe vendas ou amplie o periodo para formar ranking.",
      actions: top.id
        ? [
            {
              label: "Registrar decisao",
              title: "Decisao sobre produto lider",
              action: "product_leader_decision",
              target_type: "product",
              target_id: top.id,
              scope: top.name,
              decisions: ["Manter prioridade", "Revisar preco", "Checar estoque", "Ignorar por enquanto"],
            },
          ]
        : [],
    },
    {
      title: "Concentracao de receita",
      body: `${number(topFiveShare)}% da receita listada esta nos 5 primeiros produtos. Use isso para proteger estoque e preco dos itens que sustentam o caixa.`,
      actions: [
        {
          label: "Revisar top 5",
          title: "Revisao em lote do top 5",
          action: "product_top5_bulk_review",
          target_type: "product_group",
          target_id: "top_5_revenue",
          target_ids: rows.slice(0, 5).map((row) => row.id),
          scope: "Top 5 produtos por receita",
          bulk: true,
          decisions: ["Revisar todos", "Proteger estoque", "Revisar preco", "Sem acao agora"],
        },
      ],
    },
    {
      title: "Como usar esta aba",
      body: "Filtre por produto, abra o detalhe e compare com reposicao e precificacao antes de alterar mix no ERP.",
      actions: [
        {
          label: "Anotar aprendizado",
          title: "Aprendizado sobre mix",
          action: "product_mix_learning",
          target_type: "product_mix",
          target_id: "products_view",
          scope: "Aba Produtos",
          decisions: ["Aprendizado registrado", "Criar rotina semanal", "Precisa de dados melhores"],
        },
      ],
    },
  ]);
  renderProductDashboard(rows);
  populateProductFilters(rows);
  applyProductFilters();
}

function renderReplenishmentSummary(summary) {
  const items = [
    ["Pode faltar", number(Number(summary.urgent || 0) + Number(summary.buy_now || 0)), "amber"],
    ["Comprar agora", number(summary.buy_now), "green"],
    ["Criticos A", number(summary.critical_a), "amber"],
    ["Decidir mix", number(summary.mix_review), "amber"],
    ["Monitorar", number(summary.watch), "blue"],
    ["Excesso", number(summary.excess), ""],
    ["Unidades sugeridas", number(summary.suggested_units), "green"],
    ["Valor estimado", compactMoney(summary.estimated_value), "blue"],
    ["Descontinuados", number(summary.out_of_current_mix), ""],
  ];
  const html = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
  const stockTarget = document.querySelector("#replenishmentSummary");
  if (stockTarget) stockTarget.innerHTML = html;
  const strip = document.querySelector("#stockDecisionStrip");
  if (strip) {
    const stripItems = [
      {
        status: "urgent",
        tone: "danger",
        title: "Pode faltar",
        body: `${number(Number(summary.urgent || 0) + Number(summary.buy_now || 0))} item(ns) com risco de ruptura ou compra imediata.`,
      },
      {
        status: "excess",
        tone: "warn",
        title: "Tem demais",
        body: `${number(summary.excess || 0)} item(ns) com excesso para acompanhar antes de comprar.`,
      },
      {
        status: "mix_review",
        tone: "info",
        title: "Revisar mix",
        body: `${number(summary.mix_review || 0)} item(ns) precisam de decisao antes de voltar para sugestoes.`,
      },
      {
        status: "watch",
        tone: "neutral",
        title: "Acompanhar giro",
        body: `${number(summary.watch || 0)} item(ns) pedem observacao, sem compra automatica.`,
      },
    ];
    strip.innerHTML = stripItems.map((item) => `
      <button class="decision-chip tone-${escapeAttr(item.tone)}" type="button" data-stock-status-target="${escapeAttr(item.status)}">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.body)}</span>
      </button>
    `).join("");
  }
}

function stockDecisionTone(row = {}) {
  if (row.status === "urgent") return "danger";
  if (row.status === "buy_now" || row.status === "excess") return "warn";
  if (row.status === "mix_review") return "info";
  if (row.status === "ok") return "good";
  return "neutral";
}

function stockDecisionLabel(row = {}) {
  const labels = {
    urgent: "Comprar antes da ruptura",
    buy_now: "Comprar agora",
    mix_review: "Decidir mix",
    excess: "Segurar compra",
    watch: "Acompanhar giro",
    no_demand: "Sem demanda recente",
    out_of_mix: "Fora do mix",
    ok: "Estoque ok",
  };
  return labels[row.status] || row.status_label || "Revisar estoque";
}

function stockDecisionRows(rows = []) {
  const rank = {
    urgent: 1,
    buy_now: 2,
    mix_review: 3,
    excess: 4,
    watch: 5,
    ok: 6,
    no_demand: 7,
    out_of_mix: 8,
  };
  return rows
    .slice()
    .filter((row) => row.status !== "ok" || Number(row.suggested_quantity || 0) > 0)
    .sort((a, b) => {
      const statusDiff = (rank[a.status] || 99) - (rank[b.status] || 99);
      if (statusDiff) return statusDiff;
      const abcDiff = String(a.abc_class || "Z").localeCompare(String(b.abc_class || "Z"));
      if (abcDiff) return abcDiff;
      return Number(b.estimated_value || 0) - Number(a.estimated_value || 0);
    });
}

function renderStockDecisionQueue(rows = state.stock || []) {
  const target = document.querySelector("#stockDecisionQueue");
  if (!target) return;
  const queue = stockDecisionRows(rows).slice(0, 8);
  if (!queue.length) {
    target.innerHTML = `
      <div class="stock-queue-empty">
        <strong>Nenhuma decisao critica no estoque agora.</strong>
        <span>Use os filtros para auditar itens ok, sem demanda ou fora do mix.</span>
      </div>
    `;
    return;
  }
  target.innerHTML = queue.map((row) => {
    const tone = stockDecisionTone(row);
    const coverage = row.coverage_days === null ? "sem giro" : `${number(row.coverage_days)} dias`;
    const suggestion = Number(row.suggested_quantity || 0);
    return `
      <article class="stock-queue-card tone-${escapeAttr(tone)}">
        <span class="status-chip ${escapeAttr(tone)}">${escapeHtml(stockDecisionLabel(row))}</span>
        <strong>${escapeHtml(row.name || "Produto sem nome")}</strong>
        <span>${escapeHtml(quoteDisplayCode(row))} - ${escapeHtml(row.supplier_name || "Fornecedor a definir")}</span>
        <dl>
          <div><dt>Estoque</dt><dd>${number(row.stock_units)}</dd></div>
          <div><dt>Cobertura</dt><dd>${escapeHtml(coverage)}</dd></div>
          <div><dt>Sugestao</dt><dd>${number(suggestion)}</dd></div>
          <div><dt>Valor</dt><dd>${money(row.estimated_value)}</dd></div>
        </dl>
        <p>${escapeHtml(row.reason || row.status_label || "Conferir antes da proxima compra.")}</p>
        <div class="stock-queue-actions">
          <button class="secondary-button" type="button" data-stock-queue-filter="${escapeAttr(row.status || "")}">Ver semelhantes</button>
          <button class="action-button" type="button" data-stock-queue-product="${escapeAttr(row.product_id || "")}">Abrir produto</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderCommercialSummary(summary = {}) {
  const items = [
    ["Clientes lidos", number(summary.customers), "blue"],
    ["Em risco", number(summary.at_risk_customers), "amber"],
    ["Receita em risco", compactMoney(summary.at_risk_revenue), "amber"],
    ["Recompra prox.", number(summary.due_customers), "green"],
    ["Potencial prox.", compactMoney(summary.due_revenue), "green"],
    ["Produtos subindo", number(summary.growth_products), "blue"],
    ["Produtos caindo", number(summary.drop_products), ""],
    ["Base ate", summary.last_sale_date || "", ""],
  ];
  document.querySelector("#commercialSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function setCommercialMode(mode) {
  setModuleMode({
    stateKey: "commercialMode",
    modeAttr: "data-commercial-mode",
    operationalSelector: "#commercialOperational",
    dashboardSelector: "#commercialDashboard",
  }, mode);
}

function commercialChartRows(items, valueFormatter = number) {
  return dashboardChartRows(items, {
    valueFormatter,
    rowClass: "commercial-chart-row",
    labelFor: (item) => item.label || item.name || "",
  });
}

function commercialDashboardCharts(payload = state.commercial || {}) {
  const summary = payload.summary || {};
  const riskRows = payload.risk_customers || [];
  const dueRows = payload.repurchase_opportunities || [];
  const productMomentum = payload.product_momentum || [];
  const brandMomentum = payload.brand_momentum || [];
  const customers = Number(summary.customers || 0);
  const riskCustomers = Number(summary.at_risk_customers || riskRows.length || 0);
  const dueCustomers = Number(summary.due_customers || dueRows.length || 0);
  const riskRate = customers ? (riskCustomers / customers) * 100 : 0;
  const growthProducts = Number(summary.growth_products || productMomentum.filter((row) => Number(row.delta_revenue || 0) > 0).length);
  const dropProducts = Number(summary.drop_products || productMomentum.filter((row) => Number(row.delta_revenue || 0) < 0).length);
  const topRiskRows = riskRows
    .slice()
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 5)
    .map((row) => ({ label: row.name, value: Number(row.revenue || 0) }));
  const topDueRows = dueRows
    .slice()
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 5)
    .map((row) => ({ label: row.name, value: Number(row.revenue || 0) }));
  const productRows = productMomentum
    .slice()
    .sort((a, b) => Math.abs(Number(b.delta_revenue || 0)) - Math.abs(Number(a.delta_revenue || 0)))
    .slice(0, 5)
    .map((row) => ({ label: row.name, value: Math.abs(Number(row.delta_revenue || 0)) }));
  const brandRows = brandMomentum
    .slice()
    .sort((a, b) => Math.abs(Number(b.delta_revenue || 0)) - Math.abs(Number(a.delta_revenue || 0)))
    .slice(0, 5)
    .map((row) => ({ label: row.name, value: Math.abs(Number(row.delta_revenue || 0)) }));
  const signalRows = [
    { label: "Clientes em risco", value: riskCustomers },
    { label: "Recompra provavel", value: dueCustomers },
    { label: "Produtos subindo", value: growthProducts },
    { label: "Produtos caindo", value: dropProducts },
  ];
  const charts = [
    `
      <article class="commercial-dashboard-card wide">
        <div>
          <span>Pressao comercial</span>
          <strong>${number(riskRate)}%</strong>
          <p>${number(riskCustomers)} de ${number(customers)} cliente(s) aparecem fora do ritmo esperado.</p>
        </div>
        <div class="commercial-donut" style="--value:${Math.max(0, Math.min(100, riskRate))}"><span>${number(riskRate)}%</span></div>
      </article>
    `,
    `
      <article class="commercial-dashboard-card">
        <div>
          <span>Receita em risco</span>
          <strong>${compactMoney(summary.at_risk_revenue)}</strong>
          <p>Valor historico dos clientes que pedem contato.</p>
        </div>
      </article>
    `,
    `
      <article class="commercial-dashboard-card">
        <div>
          <span>Potencial proximo</span>
          <strong>${compactMoney(summary.due_revenue)}</strong>
          <p>${number(dueCustomers)} cliente(s) perto da janela normal de recompra.</p>
        </div>
      </article>
    `,
    `
      <article class="commercial-chart-card">
        <header><span>Sinais</span><strong>Mapa de oportunidades</strong></header>
        <div class="commercial-chart">${commercialChartRows(signalRows)}</div>
      </article>
    `,
    `
      <article class="commercial-chart-card">
        <header><span>Recuperacao</span><strong>Clientes em risco</strong></header>
        <div class="commercial-chart">${commercialChartRows(topRiskRows.length ? topRiskRows : [{ label: "Sem risco relevante", value: 1 }], topRiskRows.length ? compactMoney : number)}</div>
      </article>
    `,
    `
      <article class="commercial-chart-card">
        <header><span>Recompra</span><strong>Clientes para contato</strong></header>
        <div class="commercial-chart">${commercialChartRows(topDueRows.length ? topDueRows : [{ label: "Sem recompra proxima", value: 1 }], topDueRows.length ? compactMoney : number)}</div>
      </article>
    `,
    `
      <article class="commercial-chart-card">
        <header><span>Mix</span><strong>Produtos em movimento</strong></header>
        <div class="commercial-chart">${commercialChartRows(productRows.length ? productRows : [{ label: "Sem variacao forte", value: 1 }], productRows.length ? compactMoney : number)}</div>
      </article>
    `,
    `
      <article class="commercial-chart-card">
        <header><span>Marca</span><strong>Marcas em movimento</strong></header>
        <div class="commercial-chart">${commercialChartRows(brandRows.length ? brandRows : [{ label: "Sem variacao forte", value: 1 }], brandRows.length ? compactMoney : number)}</div>
      </article>
    `,
  ];
  document.querySelector("#commercialDashboardCharts").innerHTML = charts.join("");
}

function commercialDashboardInsights(payload = state.commercial || {}) {
  const summary = payload.summary || {};
  const topRisk = (payload.risk_customers || [])[0];
  const topDue = (payload.repurchase_opportunities || [])[0];
  const fallingProduct = (payload.product_momentum || []).find((row) => Number(row.delta_revenue || 0) < 0);
  insightCards("#commercialDashboardInsights", [
    {
      title: topRisk ? `Recuperar ${topRisk.name}` : "Sem recuperacao critica",
      body: topRisk
        ? `${money(topRisk.revenue)} em historico e ${number(topRisk.days_since)} dias sem compra. Prioridade boa para contato individual.`
        : "A base atual nao destacou cliente relevante fora da cadencia.",
    },
    {
      title: topDue ? `Puxar recompra de ${topDue.name}` : "Sem recompra imediata",
      body: topDue
        ? `${money(topDue.revenue)} de potencial historico perto da janela normal de compra.`
        : "Quando clientes entrarem na janela esperada, o Nexo destaca aqui.",
    },
    {
      title: fallingProduct ? `Investigar ${fallingProduct.name}` : "Mix sem queda critica",
      body: fallingProduct
        ? `${money(fallingProduct.delta_revenue)} de variacao contra a janela anterior. Pode ser ruptura, preco, substituicao ou demanda.`
        : `${number(summary.growth_products || 0)} produto(s) em alta e ${number(summary.drop_products || 0)} em queda no recorte.`,
    },
  ]);
}

function customerOpportunityRows(rows, mode) {
  if (!rows.length) {
    const text = mode === "risk" ? "Nenhum cliente relevante fora da cadencia." : "Nenhuma recompra proxima detectada agora.";
    return `<tr><td colspan="6"><strong>${text}</strong><span class="muted-line">A proxima importacao pode mudar esse quadro.</span></td></tr>`;
  }
  return rows
    .map((row) => {
      const due = Number(row.due_in_days || 0);
      const dueText = due < 0 ? `${number(Math.abs(due))} dias atrasado` : `${number(due)} dias`;
      if (mode === "due") {
        return `
          <tr>
            <td>
              <strong class="product-name">${escapeHtml(row.name)}</strong>
              <span class="muted-line">ultima compra ${escapeHtml(row.last_purchase || "")} - ${number(row.purchase_days)} dias com compra</span>
            </td>
            <td><span class="status-chip due">${escapeHtml(dueText)}</span></td>
            <td class="num">${money(row.revenue)}</td>
            <td class="num">${money(row.avg_ticket)}</td>
          </tr>
        `;
      }
      return `
        <tr>
          <td>
            <strong class="product-name">${escapeHtml(row.name)}</strong>
            <span class="muted-line">ultima compra ${escapeHtml(row.last_purchase || "")} - intervalo esperado ${number(row.expected_gap_days)}d</span>
          </td>
          <td><span class="status-chip ${escapeAttr(row.status)}">${escapeHtml(row.status_label)}</span></td>
          <td class="num ${Number(row.risk_score || 0) >= 70 ? "risk" : ""}">${number(row.risk_score)}</td>
          <td class="num">${money(row.revenue)}</td>
          <td class="num">${number(row.days_since)}</td>
          <td>
            ${escapeHtml(row.reason)}
            <span class="muted-line">proxima compra estimada: ${escapeHtml(row.estimated_next_purchase || "")}</span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function momentumRows(rows, kind) {
  if (!rows.length) {
    return `<tr><td colspan="4"><strong>Sem movimento suficiente</strong><span class="muted-line">Ainda nao ha comparacao relevante.</span></td></tr>`;
  }
  return rows
    .map((row) => {
      const delta = Number(row.delta_revenue || 0);
      const trendClass = delta >= 0 ? "ok" : "risk";
      const columns =
        kind === "brand"
          ? `
            <td>
              <strong class="supplier-name">${escapeHtml(row.name)}</strong>
              <span class="muted-line">${number(row.recent_quantity)} un. nos 90 dias</span>
            </td>
            <td class="num">${money(row.recent_revenue)}</td>
            <td class="num ${trendClass}">${delta >= 0 ? "+" : ""}${money(delta)}<span class="muted-line">${number(row.trend_pct)}%</span></td>
          `
          : `
            <td>
              <strong class="product-name">${escapeHtml(row.name)}</strong>
              <span class="muted-line">${number(row.recent_quantity)} un. nos 90 dias</span>
            </td>
            <td class="num">${money(row.recent_revenue)}</td>
            <td class="num">${money(row.previous_revenue)}</td>
            <td class="num ${trendClass}">${delta >= 0 ? "+" : ""}${money(delta)}<span class="muted-line">${number(row.trend_pct)}%</span></td>
          `;
      return `<tr>${columns}</tr>`;
    })
    .join("");
}

function renderCommercial(payload) {
  state.commercial = payload;
  const summary = payload.summary || {};
  renderCommercialSummary(summary);
  commercialDashboardCharts(payload);
  commercialDashboardInsights(payload);
  const focus = [
    {
      title: "Recuperar 1 cliente em risco",
      body: `${number(summary.at_risk_customers)} clientes passaram do ritmo esperado. Comece por um de maior receita, sem montar campanha grande.`,
      impact: "Primeira prova de valor comercial do BI.",
    },
    {
      title: "Contato de recompra provavel",
      body: `${number(summary.due_customers)} clientes estao perto da janela normal de recompra.`,
      impact: "Acao simples que pode virar rotina semanal.",
    },
    {
      title: "Investigar queda de produto",
      body: `${number(summary.drop_products)} produtos aparecem com queda forte entre janelas de 90 dias.`,
      impact: "Pode revelar ruptura, substituicao, preco ou perda de demanda.",
    },
  ];
  document.querySelector("#commercialFocus").innerHTML = `
    <div class="focus-actions commercial-actions">
      ${focus
        .map(
          (item) => `
            <article>
              <small>acao doable</small>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.body)}</span>
              <em>${escapeHtml(item.impact)}</em>
            </article>
          `,
        )
        .join("")}
    </div>
    <div class="explain-grid">
      ${(payload.explanations || [])
        .map((item) => `<div class="info-card"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></div>`)
        .join("")}
    </div>
  `;
  document.querySelector("#riskCustomersTable").innerHTML = customerOpportunityRows(payload.risk_customers || [], "risk");
  document.querySelector("#repurchaseTable").innerHTML = customerOpportunityRows(payload.repurchase_opportunities || [], "due");
  document.querySelector("#productMomentumTable").innerHTML = momentumRows(payload.product_momentum || [], "product");
  document.querySelector("#brandMomentumTable").innerHTML = momentumRows(payload.brand_momentum || [], "brand");
}

function actionStatusText(status) {
  return {
    open: "Aberta",
    in_progress: "Em andamento",
    completed: "Concluida",
    ignored: "Ignorada",
  }[status] || status;
}

function renderActionsSummary(summary = {}) {
  const items = [
    ["Abertas", number(summary.open), "amber"],
    ["Em andamento", number(summary.in_progress), "blue"],
    ["Concluidas", number(summary.completed), "green"],
    ["Ignoradas", number(summary.ignored), ""],
    ["Valor em pauta", compactMoney(summary.open_estimated_value), "green"],
    ["Total criado", number(summary.total), "blue"],
  ];
  document.querySelector("#actionsSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function actionAreaLabel(row = {}) {
  return {
    quote_send: "Compras",
    quote_create: "Compras",
    quote_response: "Compras",
    quote_close: "Compras",
    supplier_config: "Fornecedores",
    supplier_confirm: "Fornecedores",
    product_mix_decision: "Mix e estoque",
    customer_contact: "Comercial",
    product_investigate: "Comercial",
  }[row.action_type] || viewLabel(row.view || "actions");
}

function actionEntityText(row = {}) {
  const metadata = row.metadata || {};
  return metadata.supplier_name || metadata.customer_name || metadata.product_name || metadata.brand_name || row.target_type || "Operacao";
}

function actionTone(row = {}) {
  if (row.status === "completed") return "good";
  if (row.status === "ignored") return "muted";
  if (Number(row.priority || 9) <= 1) return "danger";
  if (Number(row.priority || 9) <= 2) return "warn";
  if (row.status === "in_progress") return "info";
  return "muted";
}

function actionToneLabel(row = {}) {
  const tone = actionTone(row);
  if (tone === "danger") return "Agir agora";
  if (tone === "warn") return "Decidir hoje";
  if (tone === "info") return "Em curso";
  if (tone === "good") return "Concluida";
  return "Acompanhar";
}

function pulseEventText(event = {}) {
  return {
    quote_response_saved: "Resposta de cotacao registrada",
    purchase_order_closed: "Pedido de compra fechado",
    quote_response: "Resposta de cotacao registrada",
    product_supplier_reference_update: "Referencia de fornecedor atualizada",
    pricing_product_update: "Preco/custo revisado",
    supplier_brand_update: "Fornecedor atualizado",
    product_mix_decision: "Decisao de mix registrada",
    quick_decision: "Decisao operacional registrada",
  }[event.action] || event.action || "Evento operacional";
}

function renderTodayPulse(payload = {}) {
  const pulse = payload.pulse || {};
  const latestImport = pulse.latest_import || {};
  const importSummary = pulse.latest_import_summary || {};
  const quotes = pulse.quotes || {};
  const orders = pulse.orders || {};
  const issues = pulse.import_issues || {};
  const events = pulse.events || [];
  const mappedRows = Number(importSummary.mapped_rows || importSummary.imported_rows || importSummary.rows || 0);
  const quoteWaiting = Number(quotes.sent || 0);
  const quoteToClose = Number(quotes.responded || 0);
  const headline = latestImport.id
    ? `Ultima importacao ${shortDateTime(latestImport.finished_at)} trouxe ${number(mappedRows)} linha(s) mapeadas.`
    : "Nenhuma importacao registrada ainda.";
  const movement = [
    quoteWaiting ? `${number(quoteWaiting)} cotacao(oes) esperando resposta` : "",
    quoteToClose ? `${number(quoteToClose)} cotacao(oes) prontas para virar pedido` : "",
    orders.open ? `${number(orders.open)} pedido(s) em aberto` : "",
    pulse.changes_last_7d ? `${number(pulse.changes_last_7d)} mudanca(s) de dados em 7 dias` : "",
  ].filter(Boolean);
  document.querySelector("#todayPulse").innerHTML = `
    <div class="pulse-main">
      <span class="today-kicker">Pulso operacional</span>
      <strong>${escapeHtml(headline)}</strong>
      <p>${escapeHtml(movement.length ? movement.join(" - ") : "Sem movimento critico desde a ultima leitura. O Nexo segue acompanhando compras, dados e decisoes.")}</p>
    </div>
    <div class="pulse-metrics">
      <article>
        <span>Cotacoes</span>
        <strong>${number(quoteWaiting + quoteToClose)}</strong>
        <em>${number(quoteWaiting)} resposta / ${number(quoteToClose)} fechar</em>
      </article>
      <article>
        <span>Pedidos abertos</span>
        <strong>${number(orders.open || 0)}</strong>
        <em>${compactMoney(orders.open_value || 0)} em aberto</em>
      </article>
      <article>
        <span>Dados</span>
        <strong>${number((issues.errors || 0) + (issues.warnings || 0))}</strong>
        <em>${number(issues.errors || 0)} erro(s), ${number(issues.warnings || 0)} aviso(s)</em>
      </article>
    </div>
    <div class="pulse-events">
      ${
        events.length
          ? events.slice(0, 4).map((event) => `
              <span>
                <strong>${escapeHtml(pulseEventText(event))}</strong>
                <em>${escapeHtml(shortDateTime(event.created_at))}</em>
              </span>
            `).join("")
          : `<span><strong>Sem eventos recentes</strong><em>As proximas decisoes aparecem aqui.</em></span>`
      }
    </div>
  `;
}

function intelligenceKindLabel(kind) {
  return {
    ruptura: "Ruptura",
    preco_compra: "Preco + compra",
    demanda_estoque: "Demanda + estoque",
    caixa_estoque: "Caixa parado",
    fornecedor: "Fornecedor",
    dados: "Dados",
    ciclo_compra: "Ciclo de compra",
    rotina: "Rotina",
  }[kind] || "Sinal cruzado";
}

function intelligenceIcon(kind) {
  return {
    ruptura: "siren",
    preco_compra: "scale",
    demanda_estoque: "activity",
    caixa_estoque: "coins",
    fornecedor: "truck",
    dados: "database-zap",
    ciclo_compra: "refresh-cw",
    rotina: "radar",
  }[kind] || "sparkles";
}

function renderIntelligenceRadar(payload = {}) {
  const intelligence = payload.intelligence || {};
  const cards = intelligence.cards || [];
  const summary = intelligence.summary || {};
  const top = cards[0] || {};
  document.querySelector("#actionsIntelligence").innerHTML = `
    <div class="radar-head tone-${escapeAttr(top.tone || "muted")}">
      <span class="today-kicker">Radar de inteligencia</span>
      <strong>${escapeHtml(top.title || "Cruzando sinais operacionais")}</strong>
      <p>${escapeHtml(top.body || "O Nexo cruza compra, preco, estoque, fornecedor, dados e comercial para encontrar contradicoes antes que virem rotina ruim.")}</p>
      <div class="radar-stats">
        <span><i data-lucide="sparkles"></i>${number(summary.signals || cards.length)} sinal(is)</span>
        <span><i data-lucide="circle-alert"></i>${number(summary.critical || 0)} critico(s)</span>
        <span><i data-lucide="database"></i>${number(summary.data_gaps || 0)} lacuna(s) de dado</span>
      </div>
    </div>
    <div class="radar-grid">
      ${
        cards.length
          ? cards.map((card) => `
              <article class="radar-card tone-${escapeAttr(card.tone || "muted")}">
                <div class="radar-card-top">
                  <span><i data-lucide="${escapeAttr(intelligenceIcon(card.kind))}"></i>${escapeHtml(intelligenceKindLabel(card.kind))}</span>
                  <em>${escapeHtml(viewLabel(card.view || "actions"))}</em>
                </div>
                <strong>${escapeHtml(card.title || "Sinal operacional")}</strong>
                <p>${escapeHtml(card.impact || card.body || "")}</p>
                ${
                  (card.evidence || []).length
                    ? `<ul>${card.evidence.slice(0, 2).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                    : ""
                }
                <button class="text-button" type="button" data-view-target="${escapeAttr(card.view || "actions")}">${escapeHtml(card.next_step || "Abrir contexto")}</button>
              </article>
            `).join("")
          : `<div class="empty-state action-empty">Sem sinais cruzados por enquanto.</div>`
      }
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function renderActionsHero(payload = {}) {
  const summary = payload.summary || {};
  const actions = payload.actions || [];
  const top = actions[0] || {};
  const urgent = actions.filter((row) => Number(row.priority || 9) <= 2).length;
  const purchaseValue = actions
    .filter((row) => ["quote_create", "quote_send", "quote_response", "quote_close"].includes(row.action_type))
    .reduce((sum, row) => sum + Number(row.estimated_value || 0), 0);
  const headline = top.title || "Sem decisao critica agora";
  const body = top.body || "A mesa esta limpa. Conforme dados, cotacoes e contatos avancarem, o Nexo volta a priorizar a rotina.";
  document.querySelector("#actionsHero").innerHTML = `
    <div class="today-hero-main tone-${escapeAttr(actionTone(top))}">
      <span class="today-kicker">${escapeHtml(actionAreaLabel(top))}</span>
      <h2>${escapeHtml(headline)}</h2>
      <p>${escapeHtml(body)}</p>
      <div class="today-evidence">
        <span><i data-lucide="target"></i>${escapeHtml(actionEntityText(top))}</span>
        <span><i data-lucide="circle-alert"></i>${number(urgent)} para agir hoje</span>
        <span><i data-lucide="banknote"></i>${compactMoney(summary.open_estimated_value || 0)} em pauta</span>
      </div>
      ${
        top.id
          ? `<div class="today-actions">
              <button class="action-button resolve-action" type="button" data-action-id="${escapeAttr(top.id)}">${escapeHtml(actionPrimaryLabel(top))}</button>
              <button class="secondary-button explain-action" type="button" data-action-id="${escapeAttr(top.id)}">Entender motivo</button>
            </div>`
          : ""
      }
    </div>
    <div class="today-hero-side">
      <article>
        <span>Fila viva</span>
        <strong>${number(summary.open || 0)}</strong>
        <em>${number(summary.in_progress || 0)} em andamento</em>
      </article>
      <article>
        <span>Comprar</span>
        <strong>${compactMoney(purchaseValue)}</strong>
        <em>valor em cotacoes e pedidos</em>
      </article>
      <article>
        <span>Memoria</span>
        <strong>${number(summary.completed || 0)}</strong>
        <em>acao(oes) concluidas</em>
      </article>
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function actionPrimaryLabel(row) {
  return {
    supplier_config: "Informar pedido minimo",
    supplier_confirm: "Confirmar fornecedor",
    product_mix_decision: "Decidir mix",
    quote_create: "Gerar cotacao",
    quote_send: "Abrir cotacao",
    quote_response: "Registrar resposta",
    quote_close: "Fechar pedido",
    customer_contact: "Abrir cliente",
    product_investigate: "Investigar",
  }[row.action_type] || "Resolver";
}

function actionImpactText(row) {
  const value = Number(row.estimated_value || 0);
  const monetaryActions = new Set(["quote_create", "quote_send", "quote_response", "quote_close", "customer_contact", "product_investigate"]);
  if (value > 0 && monetaryActions.has(row.action_type)) return `${row.impact_label || "Impacto estimado"} - ${money(value)}`;
  return row.impact_label || "Rotina mais clara";
}

function actionRows(rows = []) {
  if (!rows.length) {
    return `<div class="empty-state action-empty">Nada urgente agora. Conforme importacoes, cotacoes e contatos avancarem, novas acoes aparecem aqui.</div>`;
  }
  return rows
    .map(
      (row) => {
        const skillLabel = row.metadata?.skill_label || "";
        const active = row.id === state.selectedActionId ? " active" : "";
        const tone = actionTone(row);
        return `
        <article class="action-card action-row priority-${Number(row.priority || 3)} tone-${escapeAttr(tone)}${active}" data-action-id="${escapeAttr(row.id)}">
          <div class="action-topline">
            <span class="status-chip ${escapeAttr(tone)}">${escapeHtml(actionToneLabel(row))}</span>
            <small>${escapeHtml(actionAreaLabel(row))} - P${number(row.priority)}</small>
          </div>
          <button class="action-row-main" type="button" data-select-action>
            ${skillLabel ? `<span class="skill-line">${escapeHtml(skillLabel)}</span>` : ""}
            <strong>${escapeHtml(row.title)}</strong>
            <span>${escapeHtml(row.body)}</span>
          </button>
          <div class="action-row-meta">
            <span>${escapeHtml(actionEntityText(row))}</span>
            <strong>${escapeHtml(actionImpactText(row))}</strong>
          </div>
          <span class="save-state" aria-live="polite"></span>
        </article>
      `;
      },
    )
    .join("");
}

function timelineKindLabel(kind) {
  return {
    import: "Dados",
    quote: "Cotacao",
    purchase_order: "Pedido",
    decision: "Decisao",
    action: "Acao",
    audit: "Registro",
  }[kind] || "Evento";
}

function timelineIcon(kind) {
  return {
    import: "database",
    quote: "send",
    purchase_order: "package-check",
    decision: "check-circle-2",
    action: "list-checks",
    audit: "history",
  }[kind] || "circle";
}

function timelineCards(rows = []) {
  if (!rows.length) {
    return `<div class="empty-state action-empty">Sem linha do tempo ainda. Importacoes, cotacoes, pedidos e decisoes futuras aparecerao aqui.</div>`;
  }
  return rows
    .map(
      (row) => `
        <article class="timeline-item tone-${escapeAttr(row.tone || "muted")}">
          <div class="timeline-marker"><i data-lucide="${escapeAttr(timelineIcon(row.kind))}"></i></div>
          <div class="timeline-copy">
            <div class="timeline-topline">
              <span>${escapeHtml(timelineKindLabel(row.kind))}</span>
              <time>${escapeHtml(shortDateTime(row.occurred_at))}</time>
            </div>
            <strong>${escapeHtml(row.title || "Evento operacional")}</strong>
            <p>${escapeHtml(row.body || "")}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function actionDetail(action) {
  if (!action) {
    return `
      <div class="action-detail-empty">
        <strong>Nenhuma acao selecionada</strong>
        <span>Quando a fila estiver vazia, o Nexo volta para acompanhamento e aprendizado.</span>
      </div>
    `;
  }
  const metadata = action.metadata || {};
  const evidence = [
    ["Area", actionAreaLabel(action)],
    ["Entidade", actionEntityText(action)],
    ["Prioridade", `P${number(action.priority)}`],
    ["Status", actionStatusText(action.status)],
    ["Impacto", actionImpactText(action)],
  ];
  if (action.due_date) evidence.push(["Prazo", action.due_date]);
  if (metadata.skill_label) evidence.push(["Skill", metadata.skill_label]);
  if (metadata.rule_id) evidence.push(["Regra", metadata.rule_id]);
  return `
    <div class="action-detail-head">
      <span class="status-chip ${escapeAttr(actionTone(action))}">${escapeHtml(actionToneLabel(action))}</span>
      <h3>${escapeHtml(action.title)}</h3>
      <p>${escapeHtml(action.body)}</p>
    </div>
    <dl class="action-detail-list">
      ${evidence.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
    </dl>
    <section class="action-detail-reason">
      <strong>Por que agora</strong>
      <p>${escapeHtml(action.reason || "Sem justificativa adicional.")}</p>
    </section>
    <div class="action-detail-actions" data-action-id="${escapeAttr(action.id)}">
      <button class="action-button resolve-action" type="button">${escapeHtml(actionPrimaryLabel(action))}</button>
      <button class="secondary-button explain-action" type="button">Ver evidencias</button>
    </div>
    <span class="save-state" aria-live="polite"></span>
  `;
}

function renderActions(payload) {
  renderActionsHero(payload);
  renderTodayPulse(payload);
  renderIntelligenceRadar(payload);
  renderActionsSummary(payload.summary || {});
  const rows = payload.actions || [];
  if (!rows.some((row) => row.id === state.selectedActionId)) state.selectedActionId = rows[0]?.id || "";
  document.querySelector("#actionsBoard").innerHTML = actionRows(rows);
  document.querySelector("#actionDetail").innerHTML = actionDetail(rows.find((row) => row.id === state.selectedActionId));
  document.querySelector("#actionsHistory").innerHTML = timelineCards(payload.timeline || []);
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
  if (state.skills) renderEngine(state.skills, payload);
}

async function refreshActions() {
  const actions = await apiContract("/api/actions/today", "actions_today.v1");
  state.actions = actions;
  renderActions(actions);
  renderNavBadges();
}

function deferAfterPaint(callback, delay = 0) {
  window.setTimeout(() => {
    window.requestAnimationFrame(() => callback());
  }, delay);
}

function queueRefreshAfterSave(tasks = {}, options = {}) {
  Object.entries(tasks).forEach(([key, enabled]) => {
    if (enabled) state.postSaveRefreshTasks[key] = true;
  });
  if (options.preserveQuoteScroll) state.postSaveRefreshOptions.preserveQuoteScroll = true;
  if (state.postSaveRefreshTimer) clearTimeout(state.postSaveRefreshTimer);
  state.postSaveRefreshTimer = setTimeout(() => {
    const pending = { ...state.postSaveRefreshTasks };
    const pendingOptions = { ...state.postSaveRefreshOptions };
    state.postSaveRefreshTasks = {};
    state.postSaveRefreshOptions = {};
    state.postSaveRefreshTimer = null;
    refreshAfterSave(pending, {
      defer: true,
      delay: options.deferDelay || 0,
      preserveQuoteScroll: pendingOptions.preserveQuoteScroll,
    });
  }, options.delay ?? 900);
}

function refreshAfterSave(tasks = {}, options = {}) {
  if (options.coalesce) {
    queueRefreshAfterSave(tasks, options);
    return;
  }
  const run = () => {
    const work = [];
    if (tasks.suppliers) {
      work.push(
        api("/api/suppliers/brands").then((suppliers) => {
          state.suppliers = suppliers;
          renderSuppliers();
        }),
      );
    }
    if (tasks.replenishment) work.push(refreshReplenishment());
    if (tasks.quotes) work.push(refreshQuotes({ preserveScroll: options.preserveQuoteScroll }));
    if (tasks.actions) work.push(refreshActions());
    if (tasks.maturity) {
      work.push(
        api("/api/intelligence/maturity").then((maturity) => {
          state.maturity = maturity;
          renderMaturity(maturity);
          renderMissions(maturity);
        }),
      );
    }
    if (!work.length) return;
    Promise.allSettled(work).then(renderNavBadges);
  };
  if (options.defer) {
    deferAfterPaint(run, options.delay || 0);
    return;
  }
  run();
}

function prettyKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function currentActionRows(actionsPayload = state.actions) {
  return [...(actionsPayload?.actions || []), ...(actionsPayload?.history || [])];
}

function actionFromButton(button) {
  const card = button.closest("[data-action-id]");
  if (!card) return null;
  return currentActionRows().find((row) => row.id === card.dataset.actionId) || null;
}

function actionCountBySkill(actionsPayload = state.actions) {
  return currentActionRows(actionsPayload).reduce((acc, row) => {
    const skillId = row.metadata?.skill_id || "sem_skill";
    acc[skillId] = (acc[skillId] || 0) + 1;
    return acc;
  }, {});
}

function actionCountByRule(actionsPayload = state.actions) {
  return currentActionRows(actionsPayload).reduce((acc, row) => {
    const ruleId = row.metadata?.rule_id || "sem_regra";
    acc[ruleId] = (acc[ruleId] || 0) + 1;
    return acc;
  }, {});
}

function renderEngineSummary(skillsPayload = {}, actionsPayload = {}) {
  const actions = actionsPayload.actions || [];
  const rules = skillsPayload.action_rules || [];
  const activeRules = new Set(actions.map((row) => row.metadata?.rule_id).filter(Boolean));
  const items = [
    ["Skills", number((skillsPayload.skills || []).length), "blue"],
    ["Regras", number(rules.length), "green"],
    ["Regras ativas", number(activeRules.size), "amber"],
    ["Acoes atuais", number(actions.length), "green"],
    ["Versao", skillsPayload.schema_version || "", ""],
    ["Produto", skillsPayload.product || "NexoVarejo", "blue"],
  ];
  document.querySelector("#engineSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderTrustLegend() {
  const items = [
    ["ERP/importado", "Canonico externo e read-only no Nexo.", "imported"],
    ["Inferido", "Sugerido pelo Nexo com confianca limitada ate confirmacao.", "inferred"],
    ["Confirmado no Nexo", "Configuracao operacional manual e canonica no Nexo.", "manual"],
    ["Decisao operacional", "Escolha do gestor que nao deve ser sobrescrita pelo ERP.", "decision"],
  ];
  document.querySelector("#trustLegend").innerHTML = items
    .map(
      ([title, body, kind]) => `
        <article class="trust-card ${kind}">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(body)}</span>
        </article>
      `,
    )
    .join("");
}

function renderEngineSkills(skillsPayload = {}, actionsPayload = {}) {
  const counts = actionCountBySkill(actionsPayload);
  document.querySelector("#engineSkills").innerHTML = (skillsPayload.skills || [])
    .map(
      (skill) => `
        <article class="engine-card">
          <div class="engine-card-head">
            <strong>${escapeHtml(skill.name)}</strong>
            <span>v${escapeHtml(skill.version || "")}</span>
          </div>
          <small>${escapeHtml(skill.id)}</small>
          <p>${number(counts[skill.id] || 0)} acao(oes) atuais</p>
          <ul>
            ${(skill.principles || []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
      `,
    )
    .join("");
}

function renderEngineRules(skillsPayload = {}, actionsPayload = {}) {
  const counts = actionCountByRule(actionsPayload);
  const skillNames = Object.fromEntries((skillsPayload.skills || []).map((skill) => [skill.id, skill.name]));
  document.querySelector("#engineRules").innerHTML = (skillsPayload.action_rules || [])
    .map(
      (rule) => `
        <article class="rule-row ${counts[rule.id] ? "active" : ""}">
          <div>
            <strong>${escapeHtml(rule.title)}</strong>
            <span>${escapeHtml(skillNames[rule.skill_id] || prettyKey(rule.skill_id))} - ${escapeHtml(rule.id)} - prioridade ${number(rule.priority)}</span>
          </div>
          <b>${number(counts[rule.id] || 0)}</b>
        </article>
      `,
    )
    .join("");
}

function renderEngine(skillsPayload = state.skills, actionsPayload = state.actions) {
  if (!skillsPayload || !actionsPayload) return;
  renderEngineSummary(skillsPayload, actionsPayload);
  renderTrustLegend();
  renderEngineSkills(skillsPayload, actionsPayload);
  renderEngineRules(skillsPayload, actionsPayload);
}

function whyContent(action) {
  const metadata = action.metadata || {};
  const context = metadata.template_context || {};
  const contextRows = Object.entries(context).filter(([, value]) => value !== null && value !== undefined && String(value) !== "");
  const dataRows = [
    ["Motor", metadata.skill_label || prettyKey(metadata.skill_id)],
    ["Rotina", prettyKey(action.action_type)],
    ["Prioridade", number(action.priority)],
  ];
  return `
    <div class="why-head">
      <div>
        <span>${escapeHtml(metadata.skill_label || "Skill interna")}</span>
        <strong>${escapeHtml(action.title)}</strong>
        <p>${escapeHtml(action.body)}</p>
      </div>
    </div>
    <div class="why-grid">
      <section>
        <h3>Por que apareceu</h3>
        <p>${escapeHtml(action.reason)}</p>
      </section>
      <section>
        <h3>O que fazer agora</h3>
        <p>${escapeHtml(action.body)}</p>
      </section>
      <section>
        <h3>Resultado esperado</h3>
        <p>${escapeHtml(actionImpactText(action))}</p>
      </section>
    </div>
    <div class="why-data">
      ${dataRows.map(([key, value]) => `<div><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    </div>
    <section class="why-context">
      <h3>Dados usados na regra</h3>
      ${contextRows.length ? contextRows.map(([key, value]) => `<div><span>${escapeHtml(prettyKey(key))}</span><strong>${escapeHtml(value)}</strong></div>`).join("") : `<p>Nenhum contexto adicional registrado.</p>`}
    </section>
  `;
}

function renderWhy(action) {
  if (!action) return;
  document.querySelector("#whyPanel").className = "why-panel";
  document.querySelector("#whyPanel").innerHTML = whyContent(action);
}

function explainAction(button) {
  const action = actionFromButton(button);
  if (!action) return;
  openModal(
    "Detalhes da sugestao",
    `
      <div class="why-panel why-panel-modal">${whyContent(action)}</div>
      <div class="modal-actions split-actions">
        <button class="text-button" type="button" id="actionIgnore">Ignorar sugestao</button>
        <button class="action-button" type="button" id="actionResolve">Resolver agora</button>
      </div>
      <span class="save-state" id="actionDetailState" aria-live="polite"></span>
    `,
    (body) => {
    body.querySelector(".open-why-view")?.addEventListener("click", (event) => {
      closeModal();
      resolveActionByData(action);
    });
      body.querySelector("#actionResolve").addEventListener("click", () => {
        closeModal();
        resolveActionByData(action);
      });
      body.querySelector("#actionIgnore").addEventListener("click", async () => {
        const stateLabel = body.querySelector("#actionDetailState");
        stateLabel.textContent = "Ignorando";
        try {
          await apiPost("/api/actions/status", { id: action.id, status: "ignored" });
          closeModal();
          refreshAfterSave({ actions: true, maturity: true });
        } catch (error) {
          stateLabel.textContent = error.message;
        }
      });
    },
  );
}

function supplierRowsForAction(action) {
  const supplierId = action.target_type === "supplier" ? action.target_id : "";
  const supplierName = (action.metadata?.template_context?.supplier_name || action.metadata?.supplier_name || "").trim().toLowerCase();
  return (state.suppliers || []).filter((row) => {
    if (supplierId && row.supplier_id === supplierId) return true;
    return supplierName && (row.supplier_name || "").trim().toLowerCase() === supplierName;
  });
}

function openSupplierMinimumModal(action) {
  const matches = supplierRowsForAction(action);
  const row = matches[0];
  if (!row) {
    setView(action.view || "suppliers");
    return;
  }
  const productCount = matches.reduce((sum, item) => sum + Number(item.product_count || 0), 0);
  const revenue = matches.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  openModal(
    `Pedido minimo de ${row.supplier_name}`,
    `
      <div class="modal-context">
        <strong>${escapeHtml(row.supplier_name)}</strong>
        <span>${number(matches.length)} marca(s), ${number(productCount || row.product_count)} produtos vinculados, ${money(revenue || row.revenue)} em receita historica.</span>
      </div>
      <label class="modal-field">
        <span>Qual e o pedido minimo?</span>
        <input class="inline-input important-input" id="supplierProfileMinimumInput" inputmode="decimal" value="${inputValue(row.minimum_order_value || "")}" placeholder="Ex: 800,00" autofocus />
      </label>
      <label class="modal-field">
        <span>Telefone para cotacao, opcional</span>
        <input class="inline-input" id="supplierProfilePhoneInput" value="${inputValue(row.contact_phone)}" placeholder="(00) 00000-0000" />
      </label>
      <div class="modal-preview warn">Com esse valor, o Nexo ajusta quando vale formar pedido e quando e melhor esperar acumular mais itens do fornecedor.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="supplierProfileCancel">Cancelar</button>
        <button class="action-button" type="button" id="supplierProfileSave">Salvar</button>
      </div>
      <span class="save-state" id="supplierProfileSaveState" aria-live="polite"></span>
    `,
    (body) => {
      body.querySelector("#supplierProfileMinimumInput").focus();
      body.querySelector("#supplierProfileCancel").addEventListener("click", closeModal);
      body.querySelector("#supplierProfileSave").addEventListener("click", async () => {
        const save = body.querySelector("#supplierProfileSaveState");
        const minimumValue = parseInputNumber(body.querySelector("#supplierProfileMinimumInput").value);
        if (minimumValue <= 0) {
          save.textContent = "Informe um pedido minimo maior que zero.";
          return;
        }
        save.textContent = "Salvando";
        try {
          const result = await apiPost("/api/suppliers/profile", {
            organization_id: row.organization_id,
            supplier_id: row.supplier_id,
            supplier_name: row.supplier_name,
            contact_phone: body.querySelector("#supplierProfilePhoneInput").value.trim(),
            minimum_order_value: body.querySelector("#supplierProfileMinimumInput").value.trim(),
          });
          state.suppliers = state.suppliers.map((item) => item.supplier_id === result.supplier_id
            ? { ...item, contact_phone: result.contact_phone, minimum_order_value: result.minimum_order_value, supplier_name: result.supplier_name }
            : item);
          await apiPost("/api/actions/status", { id: action.id, status: "completed" });
          closeModal();
          deferAfterPaint(() => {
            renderSuppliers();
            renderNavBadges();
            refreshAfterSave({ suppliers: true, replenishment: true, quotes: true, actions: true, maturity: true }, { defer: true, delay: 250 });
          });
        } catch (error) {
          save.textContent = error.message;
        }
      });
    },
  );
}

function openSupplierProfileModal(supplierId) {
  if (!supplierId) {
    setSupplierMode("operational");
    document.querySelector("#supplierSearch").value = "";
    document.querySelector("#supplierStatus").value = "missing_supplier";
    applySupplierFilter();
    document.querySelector(".supplier-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const group = supplierGroups().find((item) => item.supplier_id === supplierId);
  if (!group) {
    setSupplierMode("operational");
    document.querySelector("#supplierStatus").value = "missing_supplier";
    applySupplierFilter();
    document.querySelector("#supplierSearch").focus();
    return;
  }
  openModal(
    `Fornecedor ${group.supplier_name}`,
    `
      <div class="modal-context">
        <strong>${escapeHtml(group.supplier_name)}</strong>
        <span>${number(group.brand_count)} marca(s), ${number(group.product_count)} produtos vinculados.</span>
      </div>
      <label class="modal-field">
        <span>Pedido minimo</span>
        <input class="inline-input important-input" id="supplierGroupMinimumInput" inputmode="decimal" value="${inputValue(group.minimum_order_value || "")}" placeholder="Ex: 800,00" />
      </label>
      <label class="modal-field">
        <span>Pedido alvo</span>
        <input class="inline-input" id="supplierGroupTargetInput" inputmode="decimal" value="${inputValue(group.target_order_value || "")}" placeholder="Ex: 1500,00" />
      </label>
      <label class="modal-field">
        <span>Nome do contato</span>
        <input class="inline-input" id="supplierGroupContactNameInput" value="${inputValue(group.contact_name)}" placeholder="Compras / vendedor / representante" />
      </label>
      <label class="modal-field">
        <span>Telefone para cotacao</span>
        <input class="inline-input" id="supplierGroupPhoneInput" value="${inputValue(group.contact_phone)}" placeholder="(00) 00000-0000" />
      </label>
      <label class="modal-field">
        <span>E-mail</span>
        <input class="inline-input" id="supplierGroupEmailInput" value="${inputValue(group.contact_email)}" placeholder="compras@fornecedor.com.br" />
      </label>
      <div class="modal-context">
        <div><span>Lead time medio</span><input class="inline-input" id="supplierGroupLeadInput" inputmode="numeric" value="${inputValue(group.average_lead_time_days || "")}" placeholder="dias" /></div>
        <div><span>Ciclo de revisao</span><input class="inline-input" id="supplierGroupCycleInput" inputmode="numeric" value="${inputValue(group.order_review_cycle_days || "")}" placeholder="dias" /></div>
        <div><span>Ajuste cobertura</span><input class="inline-input" id="supplierGroupCoverageInput" inputmode="numeric" value="${inputValue(group.target_coverage_adjustment_days || "")}" placeholder="+/- dias" /></div>
        <div>
          <span>Dificuldade</span>
          <select class="inline-input" id="supplierGroupDifficultyInput">
            <option value="auto" ${group.order_difficulty === "auto" ? "selected" : ""}>Automatica</option>
            <option value="easy" ${group.order_difficulty === "easy" ? "selected" : ""}>Facil</option>
            <option value="normal" ${group.order_difficulty === "normal" ? "selected" : ""}>Normal</option>
            <option value="hard" ${group.order_difficulty === "hard" ? "selected" : ""}>Dificil</option>
            <option value="unknown" ${group.order_difficulty === "unknown" ? "selected" : ""}>Desconhecida</option>
          </select>
        </div>
      </div>
      <label class="modal-field">
        <span>Observacoes</span>
        <textarea class="inline-input quick-note" id="supplierGroupNotesInput" rows="3" placeholder="Dias de pedido, representantes, restricoes, condicoes especiais...">${escapeHtml(group.supplier_notes || "")}</textarea>
      </label>
      <div class="modal-preview good">Essas informacoes alimentam cotacao, pedido minimo, prazo de reposicao e rotina de compra por fornecedor.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="supplierGroupCancel">Cancelar</button>
        <button class="action-button" type="button" id="supplierGroupSave">Salvar</button>
      </div>
      <span class="save-state" id="supplierGroupSaveState" aria-live="polite"></span>
    `,
    (body) => {
      body.querySelector("#supplierGroupMinimumInput").focus();
      body.querySelector("#supplierGroupCancel").addEventListener("click", closeModal);
      body.querySelector("#supplierGroupSave").addEventListener("click", async () => {
        const save = body.querySelector("#supplierGroupSaveState");
        save.textContent = "Salvando";
        try {
          const result = await apiPost("/api/suppliers/profile", {
            organization_id: group.organization_id,
            supplier_id: group.supplier_id,
            supplier_name: group.supplier_name,
            contact_name: body.querySelector("#supplierGroupContactNameInput").value.trim(),
            contact_phone: body.querySelector("#supplierGroupPhoneInput").value.trim(),
            contact_email: body.querySelector("#supplierGroupEmailInput").value.trim(),
            minimum_order_value: body.querySelector("#supplierGroupMinimumInput").value.trim(),
            target_order_value: body.querySelector("#supplierGroupTargetInput").value.trim(),
            average_lead_time_days: body.querySelector("#supplierGroupLeadInput").value.trim(),
            order_review_cycle_days: body.querySelector("#supplierGroupCycleInput").value.trim(),
            target_coverage_adjustment_days: body.querySelector("#supplierGroupCoverageInput").value.trim(),
            order_difficulty: body.querySelector("#supplierGroupDifficultyInput").value,
            notes: body.querySelector("#supplierGroupNotesInput").value.trim(),
          });
          state.suppliers = state.suppliers.map((item) => item.supplier_id === result.supplier_id
            ? {
                ...item,
                supplier_name: result.supplier_name,
                contact_name: result.contact_name,
                contact_phone: result.contact_phone,
                contact_email: result.contact_email,
                minimum_order_value: result.minimum_order_value,
                target_order_value: result.target_order_value,
                average_lead_time_days: result.average_lead_time_days,
                order_review_cycle_days: result.order_review_cycle_days,
                target_coverage_adjustment_days: result.target_coverage_adjustment_days,
                order_difficulty: result.order_difficulty,
                supplier_notes: result.supplier_notes,
              }
            : item);
          closeModal();
          deferAfterPaint(() => {
            renderSuppliers();
            renderNavBadges();
            refreshAfterSave({ suppliers: true, replenishment: true, quotes: true, actions: true }, { defer: true, delay: 250 });
          });
        } catch (error) {
          save.textContent = error.message;
        }
      });
    },
  );
}

function resolveActionByData(action) {
  if (!action) return;
  if (action.action_type === "supplier_config") {
    openSupplierMinimumModal(action);
    return;
  }
  if (action.action_type === "supplier_confirm" && action.target_id) {
    openSupplierModal(action.target_id, action);
    return;
  }
  if (action.action_type === "quote_create" && action.target_id) {
    createQuoteFromAction(action);
    return;
  }
  if (["quote_send", "quote_response", "quote_close"].includes(action.action_type) && action.target_id) {
    openQuoteFromAction(action);
    return;
  }
  if (action.view) setView(action.view);
}

function resolveAction(button) {
  resolveActionByData(actionFromButton(button));
}

async function createQuoteFromAction(action) {
  const supplierId = action.target_id;
  setView("quotes");
  try {
    await loadQuoteSupplierWorkbench(supplierId);
    refreshAfterSave({ quotes: true, actions: true, maturity: true });
  } catch (error) {
    alert(error.message);
  }
}

async function openQuoteFromAction(action) {
  setView("quotes");
  try {
    const quote = await apiContract(`/api/quote?id=${encodeURIComponent(action.target_id)}`, "quote_detail.v1");
    if (quote?.supplier_id) await loadQuoteSupplierWorkbench(quote.supplier_id);
  } catch (error) {
    alert(error.message);
  }
}

async function updateAction(button, status) {
  const action = actionFromButton(button);
  const card = button.closest("[data-action-id]");
  const save = card.querySelector(".save-state");
  button.disabled = true;
  save.textContent = "Atualizando";
  try {
    await apiPost("/api/actions/status", { id: action.id, status });
    save.textContent = "Salvo";
    card.classList.add("is-refreshing");
    refreshAfterSave({ actions: true, maturity: status === "completed" || status === "ignored" });
  } catch (error) {
    save.textContent = error.message;
    button.disabled = false;
  }
}

function demandSignalText(row) {
  const labels = {
    burst: "rajada recente",
    sparse: "historico esparso",
    regular: "regular",
    none: "sem giro",
  };
  const label = labels[row.demand_signal] || "regular";
  const days = Number(row.sale_days_180 || 0);
  return days ? `${label} - ${number(days)} dia(s) com venda/180d` : label;
}

function stockRows(rows) {
  return rows
    .map((row) => {
      const suggestion = Number(row.suggested_quantity || 0);
      const coverage = row.coverage_days === null ? "Sem giro" : `${number(row.coverage_days)} dias`;
      const margin = row.margin_pct === null || row.margin_pct === undefined ? "" : `${number(row.margin_pct)}% margem`;
      const mixActions = row.status === "mix_review" ? `
        <div class="mix-actions" data-organization-id="${escapeAttr(row.organization_id)}" data-product-id="${escapeAttr(row.product_id)}">
          <button class="secondary-button force-mix-buy" type="button">Forcar compra</button>
          <button class="secondary-button drop-mix-product" type="button">Descontinuar</button>
          <span class="save-state" aria-live="polite"></span>
        </div>
      ` : "";
      return `
        <tr class="clickable-row" data-product-id="${escapeAttr(row.product_id)}">
          <td><span class="status-chip ${row.status}">${row.status_label}</span></td>
          <td>
            <strong>${escapeHtml(quoteDisplayCode(row))}</strong>
            <span class="muted-line">interno ${escapeHtml(productCode(row.source_code))}</span>
          </td>
          <td>
            <strong class="product-name">${row.name}</strong>
            <span class="muted-line">${row.unit || ""} ${margin}</span>
          </td>
          <td>
            <strong class="supplier-name">${row.supplier_name}</strong>
            <span class="muted-line">${supplierText(row)}</span>
            ${row.brand_id ? `<button class="text-button edit-stock-supplier" type="button" data-brand-id="${escapeAttr(row.brand_id)}">Editar fornecedor</button>` : ""}
          </td>
          <td class="num"><span class="abc abc-${row.abc_class}">${row.abc_class}</span></td>
          <td class="num">${number(row.stock_units)}</td>
          <td class="num">${number(row.forecast_daily_demand)}/dia</td>
          <td class="num ${suggestion > 0 ? "risk" : "ok"}">${coverage}</td>
          <td class="num">${number(row.reorder_point)}</td>
          <td class="num">${number(row.order_up_to)}</td>
          <td class="num ${suggestion > 0 ? "risk" : ""}">${number(suggestion)}</td>
          <td class="num">${money(row.estimated_value)}</td>
          <td>
            ${escapeHtml(row.reason)}
            <span class="muted-line">seguranca ${number(row.safety_stock)} - pacote ${number(row.package_size)} - tendencia ${number(row.trend_index)} - demanda ${escapeHtml(demandSignalText(row))}</span>
            ${mixActions}
          </td>
        </tr>
      `;
    })
    .join("");
}

function supplierText(row) {
  if (!row.supplier_configured) return "a configurar";
  const days = row.supplier_days_to_order === null ? "sem minimo" : `${number(row.supplier_days_to_order)} dias p/ pedido`;
  const adjustment = Number(row.supplier_target_adjustment_days || 0);
  const signed = adjustment > 0 ? `+${adjustment}` : `${adjustment}`;
  const phone = row.supplier_phone ? ` - ${row.supplier_phone}` : " - sem telefone";
  const difficulty = row.supplier_difficulty === "unknown" ? "minimo a cadastrar" : row.supplier_difficulty;
  return `${difficulty} - ciclo ${row.review_cycle_days}d - alvo ${signed}d - ${days}${phone}`;
}

function simpleRows(selector, rows, columns) {
  document.querySelector(selector).innerHTML = rows
    .map(
      (row) => `
      <tr>
        ${columns
          .map(([key, type]) => {
            const value = type === "money" ? money(row[key]) : type === "num" ? number(row[key]) : row[key] || "";
            return `<td class="${type === "money" || type === "num" ? "num" : ""}">${value}</td>`;
          })
          .join("")}
      </tr>
    `,
    )
    .join("");
}

function filterTable(inputSelector, rows, renderer, targetSelector) {
  const input = document.querySelector(inputSelector);
  input.addEventListener("input", () => {
    const term = input.value.trim().toLowerCase();
    const sourceRows = inputSelector === "#productSearch" ? state.products : rows;
    const filtered = sourceRows.filter((row) => `${row.source_code || ""} ${row.name || ""}`.toLowerCase().includes(term));
    document.querySelector(targetSelector).innerHTML = renderer(filtered);
  });
}

function applyStockFilters() {
  renderFilteredStock("#stockSearch", "#stockStatus", "#stockTable");
}

function renderFilteredStock(searchSelector, statusSelector, tableSelector) {
  const search = document.querySelector(searchSelector);
  const statusInput = document.querySelector(statusSelector);
  const table = document.querySelector(tableSelector);
  if (!search || !statusInput || !table) return;
  const term = search.value.trim().toLowerCase();
  const status = statusInput.value;
  const rows = state.stock.filter((row) => {
    const haystack = `${row.source_code || ""} ${row.quote_code || ""} ${row.name || ""} ${row.supplier_name || ""} ${row.brand_name || ""}`.toLowerCase();
    const matchesTerm = haystack.includes(term);
    const isDiscontinued = row.status === "out_of_mix" || row.status === "blocked" || row.status === "ignored";
    const hasStock = Number(row.stock_units || 0) > 0;
    const matchesStatus = !status || (status === "out_of_mix" ? isDiscontinued : row.status === status);
    const visibleByDefault = status || !isDiscontinued || hasStock;
    return matchesTerm && matchesStatus && visibleByDefault;
  });
  table.innerHTML = stockRows(rows);
}

function supplierGroups(rows = state.suppliers) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.supplier_id || `missing:${row.brand_id}`;
    const group = groups.get(key) || {
      supplier_id: row.supplier_id || "",
      supplier_name: row.supplier_id ? row.supplier_name : "Sem fornecedor definido",
      contact_name: row.contact_name || "",
      contact_phone: row.contact_phone || "",
      contact_email: row.contact_email || "",
      minimum_order_value: Number(row.minimum_order_value || 0),
      target_order_value: Number(row.target_order_value || 0),
      average_lead_time_days: Number(row.average_lead_time_days || 0),
      order_review_cycle_days: Number(row.order_review_cycle_days || 0),
      target_coverage_adjustment_days: Number(row.target_coverage_adjustment_days || 0),
      order_difficulty: row.order_difficulty || "auto",
      supplier_notes: row.supplier_notes || "",
      brand_count: 0,
      product_count: 0,
      revenue: 0,
      stock_units: 0,
      manual_count: 0,
      inferred_count: 0,
      missing_count: 0,
      brands: [],
      organization_id: row.organization_id,
    };
    group.brand_count += 1;
    group.product_count += Number(row.product_count || 0);
    group.revenue += Number(row.revenue || 0);
    group.stock_units += Number(row.stock_units || 0);
    if (!group.contact_name && row.contact_name) group.contact_name = row.contact_name;
    if (!group.contact_phone && row.contact_phone) group.contact_phone = row.contact_phone;
    if (!group.contact_email && row.contact_email) group.contact_email = row.contact_email;
    if (!group.minimum_order_value && Number(row.minimum_order_value || 0) > 0) group.minimum_order_value = Number(row.minimum_order_value || 0);
    if (!group.target_order_value && Number(row.target_order_value || 0) > 0) group.target_order_value = Number(row.target_order_value || 0);
    if (!group.average_lead_time_days && Number(row.average_lead_time_days || 0) > 0) group.average_lead_time_days = Number(row.average_lead_time_days || 0);
    if (!group.order_review_cycle_days && Number(row.order_review_cycle_days || 0) > 0) group.order_review_cycle_days = Number(row.order_review_cycle_days || 0);
    if (!group.target_coverage_adjustment_days && Number(row.target_coverage_adjustment_days || 0) !== 0) group.target_coverage_adjustment_days = Number(row.target_coverage_adjustment_days || 0);
    if (group.order_difficulty === "auto" && row.order_difficulty) group.order_difficulty = row.order_difficulty;
    if (!group.supplier_notes && row.supplier_notes) group.supplier_notes = row.supplier_notes;
    if (row.supplier_rule_origin === "manual") group.manual_count += 1;
    else if (row.supplier_rule_origin === "inferred") group.inferred_count += 1;
    else group.missing_count += 1;
    group.brands.push(row);
    groups.set(key, group);
  });
  return Array.from(groups.values()).sort((a, b) => {
    if (!a.supplier_id && b.supplier_id) return -1;
    if (a.supplier_id && !b.supplier_id) return 1;
    if ((a.minimum_order_value <= 0) !== (b.minimum_order_value <= 0)) return a.minimum_order_value <= 0 ? -1 : 1;
    return b.revenue - a.revenue || b.product_count - a.product_count || a.supplier_name.localeCompare(b.supplier_name, "pt-BR");
  });
}

function supplierStatus(group) {
  if (!group.supplier_id) return { label: "Mapear marcas", cls: "danger" };
  if (group.inferred_count) return { label: "Conferir inferencias", cls: "warn" };
  if (group.minimum_order_value <= 0) return { label: "Sem pedido minimo", cls: "warn" };
  if (!group.contact_phone && !group.contact_email) return { label: "Sem contato", cls: "warn" };
  return { label: "Operacional", cls: "good" };
}

function supplierCompleteness(group) {
  if (!group.supplier_id) return 0;
  let score = 25;
  if (group.minimum_order_value > 0) score += 25;
  if (group.contact_phone || group.contact_email) score += 15;
  if (group.average_lead_time_days > 0) score += 10;
  if (!group.inferred_count) score += 15;
  if (group.product_count > 0) score += 10;
  return Math.min(100, score);
}

function supplierNextAction(group) {
  if (!group.supplier_id) return { label: "Mapear marcas", detail: "Defina qual fornecedor atende estas marcas.", action: "Mapear" };
  if (group.inferred_count) return { label: "Conferir inferencias", detail: `${number(group.inferred_count)} marca(s) foram inferidas e precisam de confirmacao.`, action: "Conferir" };
  if (group.minimum_order_value <= 0) return { label: "Preencher valor", detail: "Sem minimo, o Nexo nao sabe quando acumular compra.", action: "Editar" };
  if (!group.contact_phone && !group.contact_email) return { label: "Informar contato", detail: "Sem telefone/e-mail, cotacao e pedido ainda dependem de busca manual.", action: "Editar" };
  if (group.average_lead_time_days <= 0) return { label: "Informar lead time", detail: "Sem prazo medio, a sugestao de compra fica menos precisa.", action: "Editar" };
  return { label: "Cadastro utilizavel", detail: "Fornecedor pronto para cotacao e compra.", action: "Editar" };
}

function supplierSummary(groups = supplierGroups()) {
  const configured = groups.filter((group) => group.supplier_id);
  const operational = configured.filter((group) => supplierStatus(group).cls === "good");
  const items = [
    ["Fornecedores", number(configured.length), "blue"],
    ["Operacionais", number(operational.length), "green"],
    ["Sem minimo", number(configured.filter((group) => group.minimum_order_value <= 0).length), "amber"],
    ["Sem contato", number(configured.filter((group) => !group.contact_phone && !group.contact_email).length), "amber"],
    ["Inferidos", number(groups.filter((group) => group.inferred_count > 0).length), "amber"],
    ["Marcas pendentes", number((state.suppliers || []).filter((row) => row.supplier_rule_origin === "missing").length), ""],
    ["Cobertura media", `${number(configured.length ? configured.reduce((sum, group) => sum + supplierCompleteness(group), 0) / configured.length : 0)}%`, ""],
    ["Produtos mapeados", number(groups.reduce((sum, group) => sum + group.product_count, 0)), ""],
  ];
  document.querySelector("#supplierSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function supplierFocusCards(groups) {
  const pending = groups
    .filter((group) => supplierStatus(group).cls !== "good")
    .sort((a, b) => b.revenue - a.revenue || b.product_count - a.product_count)
    .slice(0, 4);
  if (!pending.length) {
    return `<div class="info-card supplier-focus-card good"><strong>Cadastro de fornecedores utilizavel</strong><span>Os fornecedores filtrados ja tem minimo, contato e regras principais conferidas.</span></div>`;
  }
  return pending.map((group) => {
    const status = supplierStatus(group);
    const next = supplierNextAction(group);
    const brands = group.brands.slice(0, 3).map((row) => row.brand_name).filter(Boolean).join(", ");
    return `
      <button class="supplier-focus-card ${escapeAttr(status.cls)} edit-supplier-profile" type="button" data-supplier-id="${escapeAttr(group.supplier_id)}">
        <span class="status-chip ${escapeAttr(status.cls)}">${escapeHtml(status.label)}</span>
        <strong>${escapeHtml(group.supplier_name)}</strong>
        <span>${escapeHtml(next.detail)}</span>
        <em>${escapeHtml(brands || "Sem marcas mapeadas")} &middot; ${number(group.product_count)} produtos &middot; ${money(group.revenue)}</em>
      </button>
    `;
  }).join("");
}

function supplierChartRows(items, valueFormatter = number) {
  return dashboardChartRows(items, {
    valueFormatter,
    rowClass: "supplier-chart-row",
    attrsFor: (item) => item.filter ? ` data-supplier-filter="${escapeAttr(item.filter)}"` : "",
  });
}

function supplierDashboardCharts(groups) {
  const configured = groups.filter((group) => group.supplier_id);
  const revenueTotal = configured.reduce((sum, group) => sum + group.revenue, 0);
  const pendingItems = [
    { label: "Sem pedido minimo", value: configured.filter((group) => group.minimum_order_value <= 0).length, filter: "missing_minimum" },
    { label: "Sem contato", value: configured.filter((group) => !group.contact_phone && !group.contact_email).length, filter: "missing_phone" },
    { label: "Com inferencias", value: groups.filter((group) => group.inferred_count > 0).length, filter: "inferred" },
    { label: "Marcas sem fornecedor", value: groups.filter((group) => !group.supplier_id).length, filter: "missing_supplier" },
  ];
  const topRevenue = configured
    .slice()
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)
    .map((group) => ({ label: group.supplier_name, value: group.revenue }));
  const completenessItems = [
    { label: "90% ou mais", value: configured.filter((group) => supplierCompleteness(group) >= 90).length },
    { label: "70% a 89%", value: configured.filter((group) => supplierCompleteness(group) >= 70 && supplierCompleteness(group) < 90).length },
    { label: "50% a 69%", value: configured.filter((group) => supplierCompleteness(group) >= 50 && supplierCompleteness(group) < 70).length },
    { label: "Abaixo de 50%", value: configured.filter((group) => supplierCompleteness(group) < 50).length },
  ];
  const topSupplier = topRevenue[0];
  const topShare = revenueTotal && topSupplier ? (Number(topSupplier.value || 0) / revenueTotal) * 100 : 0;
  const avgCompleteness = configured.length
    ? configured.reduce((sum, group) => sum + supplierCompleteness(group), 0) / configured.length
    : 0;
  const leadTimeCount = configured.filter((group) => group.average_lead_time_days > 0).length;
  return `
    <article class="supplier-dashboard-card">
      <div>
        <span>Saude cadastral</span>
        <strong>${number(avgCompleteness)}%</strong>
        <p>${number(leadTimeCount)} fornecedor(es) ja tem lead time para melhorar reposicao.</p>
      </div>
      <div class="supplier-donut" style="--value: ${Math.max(0, Math.min(100, avgCompleteness))}">
        <span>${number(avgCompleteness)}%</span>
      </div>
    </article>
    <article class="supplier-dashboard-card">
      <div>
        <span>Concentracao</span>
        <strong>${topSupplier ? `${number(topShare)}%` : "0%"}</strong>
        <p>${topSupplier ? `${topSupplier.label} concentra a maior receita mapeada.` : "Ainda nao ha fornecedor lider mapeado."}</p>
      </div>
    </article>
    <article class="supplier-chart-card">
      <header><strong>Pendencias do cadastro</strong><span>Clique para abrir a mesa filtrada</span></header>
      <div class="supplier-chart">${supplierChartRows(pendingItems)}</div>
    </article>
    <article class="supplier-chart-card">
      <header><strong>Top fornecedores por receita</strong><span>Dependencia e peso comercial</span></header>
      <div class="supplier-chart">${supplierChartRows(topRevenue.length ? topRevenue : [{ label: "Sem receita mapeada", value: 0 }], compactMoney)}</div>
    </article>
    <article class="supplier-chart-card">
      <header><strong>Completude operacional</strong><span>Quanto o fornecedor ja esta pronto para compra</span></header>
      <div class="supplier-chart">${supplierChartRows(completenessItems)}</div>
    </article>
    <article class="supplier-dashboard-card wide">
      <div>
        <span>Insight do Nexo</span>
        <strong>Priorize o que reduz atrito de compra</strong>
        <p>O melhor proximo ganho e completar minimo, contato e lead time dos fornecedores com maior receita. Depois, confirme inferencias de marca para evitar cotar produto no fornecedor errado.</p>
      </div>
    </article>
  `;
}

function supplierDirectoryRows(groups) {
  if (!groups.length) {
    return `<tr><td colspan="9"><strong>Nenhum fornecedor encontrado</strong><span class="muted-line">Revise a busca, o filtro ou importe mais dados de fornecedores.</span></td></tr>`;
  }
  return groups
    .map((group) => {
      const status = supplierStatus(group);
      const next = supplierNextAction(group);
      const brands = group.brands.slice(0, 4).map((row) => row.brand_name).filter(Boolean).join(", ");
      const completeness = supplierCompleteness(group);
      return `
        <tr class="supplier-directory-row ${escapeAttr(status.cls)}" data-supplier-id="${escapeAttr(group.supplier_id)}">
          <td>
            <strong class="supplier-name">${escapeHtml(group.supplier_name)}</strong>
            <span class="muted-line">${escapeHtml(brands || "Marcas a mapear")}</span>
          </td>
          <td>
            <span class="status-chip ${escapeAttr(status.cls)}">${escapeHtml(status.label)}</span>
            <span class="muted-line">${number(completeness)}% completo</span>
            <span class="supplier-completeness" aria-hidden="true"><i style="width:${Math.max(3, completeness)}%"></i></span>
          </td>
          <td>
            <strong>${escapeHtml(group.contact_phone || group.contact_email || "Pendente")}</strong>
            <span class="muted-line">${escapeHtml(group.contact_name || group.contact_email || "")}</span>
          </td>
          <td class="num">${group.minimum_order_value > 0 ? money(group.minimum_order_value) : "Pendente"}</td>
          <td class="num">${number(group.brand_count)}</td>
          <td class="num">${number(group.product_count)}</td>
          <td class="num">${money(group.revenue)}</td>
          <td class="num">${number(group.stock_units)}</td>
          <td>
            <button class="secondary-button compact edit-supplier-profile" type="button" data-supplier-id="${escapeAttr(group.supplier_id)}">${escapeHtml(next.action)}</button>
            <span class="muted-line">${escapeHtml(next.label)}</span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function supplierBrandRows(rows) {
  return rows
    .map(
      (row) => `
        <tr class="clickable-row supplier-row" data-brand-id="${escapeAttr(row.brand_id)}">
          <td>
            <strong class="product-name">${escapeHtml(row.brand_name)}</strong>
            <span class="muted-line">${number(row.product_count)} produtos vinculados - clique para editar</span>
          </td>
          <td>
            <strong class="supplier-name">${escapeHtml(row.supplier_name || "Sem fornecedor")}</strong>
            <span class="trust-line ${escapeAttr(row.supplier_rule_origin || "manual")}">${escapeHtml(row.supplier_rule_label || "Confirmado no Nexo")}</span>
          </td>
          <td>${escapeHtml(row.contact_phone || "sem telefone")}</td>
          <td class="num">${money(row.minimum_order_value)}</td>
          <td class="num">${number(row.product_count)}</td>
          <td class="num">${money(row.revenue)}</td>
          <td class="num">${number(row.stock_units)}</td>
          <td>
            <button class="secondary-button edit-supplier" type="button" data-brand-id="${escapeAttr(row.brand_id)}">Editar</button>
            <span class="save-state" aria-live="polite"></span>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderSuppliers(rows = state.suppliers) {
  const groups = supplierGroups(rows);
  const allGroups = supplierGroups();
  supplierSummary(allGroups);
  document.querySelector("#supplierDashboardCharts").innerHTML = supplierDashboardCharts(allGroups);
  document.querySelector("#supplierFocus").innerHTML = supplierFocusCards(allGroups);
  document.querySelector("#suppliersTable").innerHTML = supplierDirectoryRows(groups);
  document.querySelector("#supplierBrandTable").innerHTML = supplierBrandRows(rows.slice(0, 250));
}

function setSupplierMode(mode) {
  setModuleMode({
    stateKey: "supplierMode",
    modeAttr: "data-supplier-mode",
    operationalSelector: "#supplierOperational",
    dashboardSelector: "#supplierDashboard",
  }, mode);
}

function applySupplierFilter() {
  const term = document.querySelector("#supplierSearch").value.trim().toLowerCase();
  const status = document.querySelector("#supplierStatus").value;
  const rows = state.suppliers.filter((row) => {
    const haystack = `${row.brand_name || ""} ${row.supplier_name || ""} ${row.contact_phone || ""}`.toLowerCase();
    if (term && !haystack.includes(term)) return false;
    if (status === "missing_minimum") return row.supplier_id && Number(row.minimum_order_value || 0) <= 0;
    if (status === "missing_phone") return row.supplier_id && !row.contact_phone && !row.contact_email;
    if (status === "inferred") return row.supplier_rule_origin === "inferred";
    if (status === "missing_supplier") return row.supplier_rule_origin === "missing";
    return true;
  });
  renderSuppliers(rows);
}

async function refreshReplenishment() {
  const replenishment = await apiContract(`/api/replenishment${periodQuery()}`, "replenishment.v1");
  state.replenishment = replenishment;
  state.stock = replenishment.rows;
  renderReplenishmentSummary(replenishment.summary);
  renderStockDecisionQueue(replenishment.rows);
  applyStockFilters();
}

async function updateProductMixDecision(button, decision) {
  const wrap = button.closest(".mix-actions");
  const status = wrap.querySelector(".save-state");
  button.disabled = true;
  status.textContent = "Salvando";
  try {
    await apiPost("/api/products/mix-decision", {
      organization_id: wrap.dataset.organizationId,
      product_id: wrap.dataset.productId,
      decision,
    });
    status.textContent = "Salvo";
    refreshAfterSave({ replenishment: true, quotes: true, actions: true });
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

function openProductBulkMixModal() {
  const rows = state.productFilteredRows || [];
  if (!rows.length) return;
  const organizationId = rows[0]?.organization_id || "";
  const supplier = document.querySelector("#productSupplierFilter")?.value || "Todos os fornecedores";
  const brand = document.querySelector("#productBrandFilter")?.value || "Todas as marcas";
  const term = document.querySelector("#productSearch")?.value.trim() || "sem busca textual";
  openModal(
    "Editar mix em massa",
    `
      <div class="modal-context">
        <strong>${number(rows.length)} produto(s) no filtro atual</strong>
        <span>Fornecedor: ${escapeHtml(supplier)} - Marca: ${escapeHtml(brand)} - Busca: ${escapeHtml(term)}</span>
      </div>
      <label class="modal-field">
        <span>Aplicar decisao comum</span>
        <select class="inline-input" id="bulkMixDecision">
          <option value="force_buy">Forcar mais uma compra</option>
          <option value="drop">Descontinuar</option>
          <option value="clear">Limpar decisao manual</option>
        </select>
      </label>
      <label class="modal-field">
        <span>Observacao</span>
        <textarea class="inline-input quick-note" id="bulkMixNote" rows="4" placeholder="Ex.: linha do fornecedor sera descontinuada, categoria sazonal, revisar tudo na proxima compra..."></textarea>
      </label>
      <div class="modal-preview warn">A decisao sera aplicada em todos os produtos do filtro atual. Use filtros antes de salvar para reduzir o escopo.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="bulkMixCancel">Cancelar</button>
        <button class="action-button" type="button" id="bulkMixSave">Aplicar em massa</button>
      </div>
      <span class="save-state" id="bulkMixState" aria-live="polite"></span>
    `,
    (body) => {
      const stateEl = body.querySelector("#bulkMixState");
      body.querySelector("#bulkMixCancel").addEventListener("click", closeModal);
      body.querySelector("#bulkMixSave").addEventListener("click", async () => {
        stateEl.textContent = "Salvando";
        try {
          const result = await apiPost("/api/products/mix-decision-bulk", {
            organization_id: organizationId,
            product_ids: rows.map((row) => row.id),
            decision: body.querySelector("#bulkMixDecision").value,
            notes: body.querySelector("#bulkMixNote").value.trim(),
          });
          stateEl.textContent = `${number(result.updated)} produto(s) atualizados`;
          refreshAfterSave({ replenishment: true, quotes: true, actions: true, maturity: true });
          setTimeout(closeModal, 700);
        } catch (error) {
          stateEl.textContent = error.message;
        }
      });
    },
  );
}

function statusText(status) {
  return {
    draft: "Rascunho",
    sent: "Enviada",
    responded: "Respondida",
    approved: "Aprovada",
    cancelled: "Cancelada",
  }[status] || status;
}

function availabilityText(value) {
  return {
    available: "Disponivel",
    partial: "Parcial",
    unavailable: "Indisponivel",
    no_quote: "Sem cotacao",
  }[value] || "Sem resposta";
}

function inputValue(value) {
  if (value === null || value === undefined) return "";
  return escapeAttr(String(value));
}

function parseInputNumber(value) {
  const normalized = String(value || "").replace("R$", "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundToPackage(quantity, packageSize) {
  if (!quantity || quantity <= 0) return 0;
  if (packageSize && packageSize > 1) return Math.ceil(quantity / packageSize) * packageSize;
  return quantity;
}

function defaultPurchaseDecision(item) {
  if (["unavailable", "no_quote"].includes(item.availability || "")) return "skip";
  if (Number(item.quoted_unit_price || item.estimated_unit_cost || 0) <= 0) return "review";
  return "buy";
}

function decisionText(value) {
  return {
    buy: "Comprar",
    skip: "Nao comprar",
    review: "Revisar",
  }[value] || value;
}

function mixStatusText(value) {
  return {
    in_mix: "No mix",
    out_of_mix: "Descontinuado",
    force_buy: "Comprar +1",
    drop: "Descontinuado",
  }[value] || value || "-";
}

function isDiscontinuedMix(row) {
  return ["drop", "out_of_mix"].includes(row?.mix_status);
}

function discontinuedActionFor(row) {
  if (!isDiscontinuedMix(row)) {
    return { decision: "drop", label: "Descontinuar", title: "Marcar como descontinuado e remover da cotacao" };
  }
  return {
    decision: row.mix_status === "drop" ? "clear" : "force_buy",
    label: "Reativar",
    title: "Voltar a permitir compra deste produto",
  };
}

function quoteStatusClass(row) {
  if (Number(row.urgent_count || 0) > 0) return "danger";
  if (Number(row.buy_now_count || 0) > 0) return "warn";
  return "";
}

function supplierWorkbenchStatus(row) {
  const total = Number(row.estimated_value || 0);
  const minimum = Number(row.minimum_order_value || 0);
  const urgent = Number(row.urgent_count || 0);
  const buyNow = Number(row.buy_now_count || 0);
  const alerts = Number(row.alert_count || 0);
  const openQuotes = Number(row.open_quote_count || 0);
  if (openQuotes > 0) return { label: "Em aberto", cls: "warn", score: 7000, rank: "open" };
  if (total <= 0 && urgent + buyNow <= 0) return { label: "Sem compra", cls: "", score: -1000, rank: "none" };
  if (minimum <= 0) return { label: "Sem minimo", cls: "warn", score: 3000 + urgent * 100 + buyNow * 20, rank: "no_min" };
  if (total >= minimum) return { label: "Pronto para cotar", cls: "ok", score: 6000 + urgent * 100 + buyNow * 20 + alerts * 10, rank: "ready" };
  if (urgent > 0) return { label: "Revisar alertas", cls: "danger", score: 5000 + urgent * 100 + buyNow * 20, rank: "risk" };
  return { label: "Abaixo do minimo", cls: "warn", score: 2000 + buyNow * 20 + alerts * 15, rank: "below_min" };
}

function quoteSupplierChipCounts(rows = state.quoteSuppliers || []) {
  return rows.reduce((acc, row) => {
    const rank = supplierWorkbenchStatus(row).rank;
    acc.all += 1;
    if (rank in acc) acc[rank] += 1;
    return acc;
  }, { all: 0, open: 0, ready: 0, risk: 0, below_min: 0 });
}

function defaultQuoteSupplierChip(rows = state.quoteSuppliers || []) {
  const counts = quoteSupplierChipCounts(rows);
  if (counts.open) return "open";
  if (counts.ready) return "ready";
  if (counts.risk) return "risk";
  if (counts.below_min) return "below_min";
  return "all";
}

function supplierMinimumProgress(row) {
  const total = Number(row.estimated_value || 0);
  const minimum = Number(row.minimum_order_value || 0);
  if (minimum <= 0) return { pct: total > 0 ? 100 : 0, label: "Sem minimo cadastrado" };
  const pct = Math.max(0, (total / minimum) * 100);
  const missing = Math.max(0, minimum - total);
  return {
    pct,
    label: pct >= 100 ? `${number(pct)}% do minimo` : `faltam ${money(missing)}`,
  };
}

function quoteSupplierRows(rows) {
  if (!rows.length) {
    return `<div class="quote-empty">Nenhum fornecedor com o filtro atual.</div>`;
  }
  return rows
    .map((row) => {
      const active = row.supplier_id === state.quoteSupplierPreviewId ? "active" : "";
      const status = supplierWorkbenchStatus(row);
      const minVal = Number(row.minimum_order_value || 0);
      const estVal = Number(row.estimated_value || 0);
      const pct = minVal > 0 ? Math.min(100, (estVal / minVal) * 100) : (estVal > 0 ? 100 : 0);
      const urgentCount = Number(row.urgent_count || 0);
      const alertCount = Number(row.alert_count || 0);
      const openQuoteCount = Number(row.open_quote_count || 0);
      const outMix = Number(row.out_of_mix_count || 0);
      const skus = Number(row.active_skus || 0);
      const subline = minVal > 0
        ? (estVal >= minVal ? `Minimo atingido (${money(minVal)})` : `Faltam ${money(minVal - estVal)} para o min.`)
        : (estVal > 0 ? "Sem minimo cadastrado" : "Sem itens sugeridos");
      const badges = [
        urgentCount ? `<span class="qb qb-urg" title="Itens urgentes">${number(urgentCount)} urg</span>` : "",
        alertCount ? `<span class="qb qb-alrt" title="Itens com alerta">${number(alertCount)} al</span>` : "",
        outMix ? `<span class="qb qb-mix" title="Descontinuado">${number(outMix)} desc.</span>` : "",
        openQuoteCount ? `<span class="qb qb-open" title="Cotacoes em aberto">${number(openQuoteCount)} aberta</span>` : "",
      ].filter(Boolean).join("");
      const skuLine = skus ? `${number(skus)} SKUs` : "Sem SKUs ativos";
      return `
        <button class="quote-supplier-card ${active} qrank-${status.rank}" type="button" data-supplier-id="${escapeAttr(row.supplier_id)}">
          <span class="qsc-line1">
            <span class="qsc-name">${escapeHtml(row.supplier_name)}</span>
            <span class="qsc-value">${money(estVal)}</span>
          </span>
          <span class="qsc-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
          <span class="qsc-line2">
            <span class="qsc-sub">${escapeHtml(subline)}</span>
            <span class="qsc-skus">${escapeHtml(skuLine)}</span>
          </span>
          ${badges ? `<span class="qsc-badges">${badges}</span>` : ""}
          <span class="qsc-foot">
            <span class="qsc-status">${escapeHtml(status.label)}</span>
            <span class="qsc-action">${active ? "Em foco" : "Analisar"}</span>
          </span>
        </button>
      `;
    })
    .join("");
}

function quoteSupplierInspector(row) {
  if (!row) {
    return `
      <div class="quote-supplier-inspector-empty">
        <strong>Nenhum fornecedor no filtro</strong>
        <span>Ajuste a busca ou volte para todos os fornecedores.</span>
      </div>
    `;
  }
  const status = supplierWorkbenchStatus(row);
  const progress = supplierMinimumProgress(row);
  const total = Number(row.estimated_value || 0);
  const minimum = Number(row.minimum_order_value || 0);
  const urgent = Number(row.urgent_count || 0);
  const buyNow = Number(row.buy_now_count || 0);
  const alerts = Number(row.alert_count || 0);
  const openQuotes = Number(row.open_quote_count || 0);
  const latestQuoteId = row.latest_quote_id || "";
  const activeSkus = Number(row.active_skus || 0);
  const missing = Math.max(0, minimum - total);
  const decision = status.rank === "ready"
    ? "Montar pedido agora"
    : status.rank === "risk"
      ? "Revisar risco antes de segurar"
      : status.rank === "open"
        ? "Retomar cotacao aberta"
        : status.rank === "below_min"
          ? "Completar minimo ou acumular"
          : status.rank === "no_min"
            ? "Cadastrar minimo"
            : "Acompanhar";
  const reason = status.rank === "ready"
    ? `Valor sugerido de ${money(total)} ja cobre o minimo de ${money(minimum)}.`
    : status.rank === "risk"
      ? `${number(urgent)} urgente(s) e ${number(buyNow)} item(ns) para comprar agora.`
      : status.rank === "open"
        ? `${number(openQuotes)} cotacao(oes) em aberto precisam de continuidade.`
        : status.rank === "below_min"
          ? `Faltam ${money(missing)} para atingir o pedido minimo.`
          : status.rank === "no_min"
            ? "Sem pedido minimo cadastrado, a decisao fica menos confiavel."
            : "Sem compra sugerida relevante com os dados atuais.";
  const facts = [
    ["Valor sugerido", money(total)],
    ["Pedido minimo", minimum > 0 ? money(minimum) : "-"],
    ["Progresso", progress.label],
    ["SKUs ativos", number(activeSkus)],
    ["Urgentes", number(urgent)],
    ["Comprar agora", number(buyNow)],
    ["Alertas", number(alerts)],
    ["Em aberto", number(openQuotes)],
  ];
  return `
    <div class="quote-supplier-inspector-head qrank-${escapeAttr(status.rank)}">
      <span class="status-chip ${escapeAttr(status.cls || "muted")}">${escapeHtml(status.label)}</span>
      <h3>${escapeHtml(row.supplier_name || "Fornecedor")}</h3>
      <p>${escapeHtml(reason)}</p>
    </div>
    <div class="quote-supplier-progress">
      <span><strong>${escapeHtml(decision)}</strong><em>${escapeHtml(progress.label)}</em></span>
      <div class="qsc-bar" aria-hidden="true"><span style="width:${Math.min(100, progress.pct)}%"></span></div>
    </div>
    <dl class="quote-supplier-facts">
      ${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
    </dl>
    <section class="quote-supplier-next">
      <strong>Proxima decisao</strong>
      <p>${escapeHtml(decision)}. ${escapeHtml(status.rank === "below_min" ? "Se nao fizer sentido completar o minimo, mantenha fora da cotacao e deixe a fila acumular demanda." : "Abra a bancada para revisar itens, ajustar quantidades e gerar a cotacao.")}</p>
    </section>
    <div class="quote-supplier-actions">
      <button class="action-button" type="button" data-quote-supplier-action="${escapeAttr(row.supplier_id)}">${escapeHtml(status.rank === "open" ? "Retomar cotacao" : "Montar pedido")}</button>
      ${latestQuoteId ? `<button class="secondary-button" type="button" data-quote-discard="${escapeAttr(latestQuoteId)}" data-quote-discard-supplier="${escapeAttr(row.supplier_id)}">Descartar cotacao</button>` : ""}
      <span class="save-state quote-discard-state" data-quote-discard-state aria-live="polite"></span>
    </div>
  `;
}

function quoteChartRows(items, valueFormatter = number) {
  return dashboardChartRows(items, {
    valueFormatter,
    rowClass: "quote-chart-row",
    attrsFor: (item) => {
      const chipAttr = item.chip ? ` data-quote-chip="${escapeAttr(item.chip)}"` : "";
      const supplierAttr = item.supplier_id ? ` data-quote-supplier="${escapeAttr(item.supplier_id)}"` : "";
      return `${chipAttr}${supplierAttr}`;
    },
  });
}

function quoteDashboardSummary(rows = state.quoteSuppliers || []) {
  const totals = rows.reduce((acc, row) => {
    const status = supplierWorkbenchStatus(row);
    acc.value += Number(row.estimated_value || 0);
    acc.urgent += Number(row.urgent_count || 0);
    acc.buyNow += Number(row.buy_now_count || 0);
    acc.alerts += Number(row.alert_count || 0);
    acc.open += Number(row.open_quote_count || 0);
    if (status.rank === "ready") acc.ready += 1;
    if (status.rank === "risk") acc.risk += 1;
    if (status.rank === "below_min") acc.belowMin += 1;
    if (status.rank === "no_min") acc.noMin += 1;
    return acc;
  }, { value: 0, urgent: 0, buyNow: 0, alerts: 0, open: 0, ready: 0, risk: 0, belowMin: 0, noMin: 0 });
  const items = [
    ["Fornecedores", number(rows.length), "blue"],
    ["Prontos", number(totals.ready), "green"],
    ["Valor sugerido", compactMoney(totals.value), "green"],
    ["Urgentes", number(totals.urgent), "amber"],
    ["Comprar agora", number(totals.buyNow), ""],
    ["Alertas", number(totals.alerts), "amber"],
    ["Abaixo minimo", number(totals.belowMin), ""],
    ["Em aberto", number(totals.open), "blue"],
  ];
  document.querySelector("#quoteDashboardSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function quoteDashboardCharts(rows = state.quoteSuppliers || []) {
  const statusItems = [
    { label: "Prontos para cotar", value: rows.filter((row) => supplierWorkbenchStatus(row).rank === "ready").length, chip: "ready" },
    { label: "Risco / urgencia", value: rows.filter((row) => supplierWorkbenchStatus(row).rank === "risk").length, chip: "risk" },
    { label: "Abaixo do minimo", value: rows.filter((row) => supplierWorkbenchStatus(row).rank === "below_min").length, chip: "below_min" },
    { label: "Cotacao em aberto", value: rows.filter((row) => supplierWorkbenchStatus(row).rank === "open").length, chip: "open" },
  ];
  const topValue = rows
    .slice()
    .sort((a, b) => Number(b.estimated_value || 0) - Number(a.estimated_value || 0))
    .slice(0, 6)
    .map((row) => ({ label: row.supplier_name, value: Number(row.estimated_value || 0), supplier_id: row.supplier_id }));
  const topUrgency = rows
    .slice()
    .sort((a, b) => Number(b.urgent_count || 0) - Number(a.urgent_count || 0) || Number(b.buy_now_count || 0) - Number(a.buy_now_count || 0))
    .slice(0, 6)
    .map((row) => ({ label: row.supplier_name, value: Number(row.urgent_count || 0) + Number(row.buy_now_count || 0), supplier_id: row.supplier_id }));
  const totalValue = rows.reduce((sum, row) => sum + Number(row.estimated_value || 0), 0);
  const readyValue = rows
    .filter((row) => supplierWorkbenchStatus(row).rank === "ready")
    .reduce((sum, row) => sum + Number(row.estimated_value || 0), 0);
  const readyPct = totalValue ? (readyValue / totalValue) * 100 : 0;
  const suppliersWithMinimum = rows.filter((row) => Number(row.minimum_order_value || 0) > 0).length;
  return `
    <article class="quote-dashboard-card">
      <div>
        <span>Valor cotavel</span>
        <strong>${money(readyValue)}</strong>
        <p>${number(readyPct)}% do valor sugerido ja atingiu pedido minimo.</p>
      </div>
      <div class="quote-donut" style="--value: ${Math.max(0, Math.min(100, readyPct))}">
        <span>${number(readyPct)}%</span>
      </div>
    </article>
    <article class="quote-dashboard-card">
      <div>
        <span>Base preparada</span>
        <strong>${number(suppliersWithMinimum)}</strong>
        <p>Fornecedor(es) com minimo configurado para decidir acumular ou comprar.</p>
      </div>
    </article>
    <article class="quote-chart-card">
      <header><strong>Prioridade por situacao</strong><span>Clique para abrir fornecedores filtrados</span></header>
      <div class="quote-chart">${quoteChartRows(statusItems)}</div>
    </article>
    <article class="quote-chart-card">
      <header><strong>Top valor sugerido</strong><span>Onde a compra concentra caixa</span></header>
      <div class="quote-chart">${quoteChartRows(topValue.length ? topValue : [{ label: "Sem valor sugerido", value: 0 }], compactMoney)}</div>
    </article>
    <article class="quote-chart-card">
      <header><strong>Urgencia por fornecedor</strong><span>Itens urgentes e comprar agora</span></header>
      <div class="quote-chart">${quoteChartRows(topUrgency.length ? topUrgency : [{ label: "Sem urgencia", value: 0 }])}</div>
    </article>
    <article class="quote-dashboard-card wide">
      <div>
        <span>Insight do Nexo</span>
        <strong>Compre primeiro onde minimo e urgencia se encontram</strong>
        <p>O melhor fluxo operacional e revisar fornecedores prontos, depois risco com urgencia, e por ultimo abaixo do minimo para decidir se acumula, completa pedido ou segura compra.</p>
      </div>
    </article>
  `;
}

function quoteDashboardFocus(rows = state.quoteSuppliers || []) {
  const ranked = rows
    .slice()
    .sort((a, b) => {
      const sa = supplierWorkbenchStatus(a);
      const sb = supplierWorkbenchStatus(b);
      return sb.score - sa.score || Number(b.estimated_value || 0) - Number(a.estimated_value || 0);
    })
    .slice(0, 6);
  if (!ranked.length) {
    return `<div class="quote-empty">Nenhum fornecedor para comprar com os dados atuais.</div>`;
  }
  return ranked.map((row) => {
    const status = supplierWorkbenchStatus(row);
    const progress = supplierMinimumProgress(row);
    return `
      <button class="quote-focus-card qrank-${escapeAttr(status.rank)}" type="button" data-quote-supplier="${escapeAttr(row.supplier_id)}">
        <span class="status-chip ${escapeAttr(status.cls || "good")}">${escapeHtml(status.label)}</span>
        <strong>${escapeHtml(row.supplier_name)}</strong>
        <span>${money(row.estimated_value || 0)} sugerido &middot; ${number(row.active_skus || 0)} SKUs</span>
        <em>${escapeHtml(progress.label)}${Number(row.urgent_count || 0) ? ` &middot; ${number(row.urgent_count)} urgentes` : ""}</em>
      </button>
    `;
  }).join("");
}

function renderQuoteDashboard() {
  quoteDashboardSummary(state.quoteSuppliers || []);
  document.querySelector("#quoteDashboardCharts").innerHTML = quoteDashboardCharts(state.quoteSuppliers || []);
  document.querySelector("#quoteDashboardFocus").innerHTML = quoteDashboardFocus(state.quoteSuppliers || []);
}

function setQuoteMode(mode) {
  setModuleMode({
    stateKey: "quoteMode",
    modeAttr: "data-quote-mode",
    operationalSelector: "#quoteOperational",
    dashboardSelector: "#quoteDashboard",
  }, mode);
}

function quoteMetricCards(workbench) {
  const totals = workbench?.totals || {};
  const supplier = workbench?.supplier || {};
  const minimum = Number(supplier.minimum_order_value || 0);
  const value = Number(totals.estimated_value_in_quote || 0);
  const items = Number(totals.items_in_quote || 0);
  const alerts = Number(totals.alerts_count || 0);
  const pct = minimum > 0 ? Math.min(100, (value / minimum) * 100) : (value > 0 ? 100 : 0);
  const minState = minimum <= 0
    ? `<small>sem minimo</small>`
    : value >= minimum
      ? `<small class="ok">minimo atingido</small>`
      : `<small class="warn">faltam ${money(minimum - value)}</small>`;
  return `
    <div class="quote-kpis">
      <div class="qk">
        <span>Itens incluidos</span>
        <strong>${number(items)}</strong>
        <small>${alerts ? `${number(alerts)} alertas` : "sem alertas"}</small>
      </div>
      <div class="qk qk-wide">
        <span>Valor do pedido</span>
        <strong>${money(value)}</strong>
        <span class="qk-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
        ${minState}
      </div>
      <div class="qk">
        <span>Pedido minimo</span>
        <strong>${minimum > 0 ? money(minimum) : "-"}</strong>
        <small>${supplier.contact_phone ? escapeHtml(supplier.contact_phone) : "sem telefone"}</small>
      </div>
    </div>
  `;
}

function quoteCommandState(workbench) {
  const rows = workbench?.rows || [];
  const totals = quoteSelectedTotals();
  const supplier = workbench?.supplier || {};
  const currentQuote = workbench?.current_quote || null;
  const minimum = Number(supplier.minimum_order_value || 0);
  const missing = Math.max(0, minimum - totals.estimated);
  const suggestedPending = rows.filter((row) => Number(row.suggested_quantity || 0) > 0 && !row.in_quote).length;
  const alertsIncluded = rows.filter((row) => row.in_quote && (row.alerts || []).length).length;
  const suggestedTotal = rows.filter((row) => Number(row.suggested_quantity || 0) > 0).length;
  const outmix = rows.filter((row) => ["drop", "out_of_mix"].includes(row.mix_status)).length;
  if (currentQuote?.status === "draft" && totals.itemCount) {
    return {
      tone: "info",
      title: "Pedido pronto para PDF",
      body: `${number(totals.itemCount)} item(ns) estao no rascunho. Revise o PDF simples para o fornecedor montar no sistema dele.`,
      command: "quote",
      label: "Revisar PDF",
      stats: [
        ["Itens", number(totals.itemCount)],
        ["Total", money(totals.estimated)],
        ["Status", statusText(currentQuote.status)],
      ],
    };
  }
  if (currentQuote?.status === "sent") {
    return {
      tone: "warn",
      title: "PDF enviado ao fornecedor",
      body: "Agora acompanhe o retorno externo. Registrar resposta e opcional; se quiser apenas fechar o pedido, gere o pedido direto.",
      command: "quote",
      label: "Continuar pedido",
      stats: [
        ["Itens", number(totals.itemCount)],
        ["Enviada", currentQuote.sent_at || "-"],
        ["Status", statusText(currentQuote.status)],
      ],
    };
  }
  if (currentQuote?.status === "responded") {
    return {
      tone: "good",
      title: "Fechar pedido",
      body: "A resposta ja virou memoria operacional. Agora decida o que comprar e gere o pedido canonico.",
      command: "close",
      label: "Fechar pedido",
      stats: [
        ["Itens", number(totals.itemCount)],
        ["Respondida", currentQuote.responded_at || "-"],
        ["Status", statusText(currentQuote.status)],
      ],
    };
  }
  if (currentQuote?.status === "approved") {
    return {
      tone: "good",
      title: "Pedido fechado",
      body: "Esta cotacao ja virou pedido de compra canonico.",
      command: "quote",
      label: "Ver resumo",
      stats: [
        ["Itens", number(totals.itemCount)],
        ["Aprovada", currentQuote.approved_at || "-"],
        ["Status", statusText(currentQuote.status)],
      ],
    };
  }
  if (!totals.itemCount && suggestedTotal) {
    return {
      tone: "warn",
      title: "Montar cotacao sugerida",
      body: `${number(suggestedTotal)} item(ns) com sugestao de compra.`,
      command: "restore",
      label: "Incluir sugeridos",
      stats: [
        ["Sugestoes", number(suggestedTotal)],
        ["Alertas", number(workbench?.totals?.alerts_count || 0)],
        ["Minimo", minimum > 0 ? money(minimum) : "-"],
      ],
    };
  }
  if (alertsIncluded) {
    return {
      tone: "danger",
      title: "Resolver alertas",
      body: `${number(alertsIncluded)} item(ns) incluidos precisam de decisao.`,
      command: "alerts",
      label: "Ver alertas",
      stats: [
        ["Itens", number(totals.itemCount)],
        ["Alertas", number(alertsIncluded)],
        ["Descontinuados", number(outmix)],
      ],
    };
  }
  if (minimum > 0 && missing > 0) {
    return {
      tone: "warn",
      title: "Abaixo do minimo",
      body: `Faltam ${money(missing)} para fechar melhor com ${escapeHtml(supplier.name || "fornecedor")}.`,
      command: suggestedPending ? "suggested" : "quote",
      label: suggestedPending ? "Buscar itens" : "Ver resumo",
      stats: [
        ["Itens", number(totals.itemCount)],
        ["Total", money(totals.estimated)],
        ["Falta", money(missing)],
      ],
    };
  }
  if (totals.itemCount) {
    return {
      tone: "good",
      title: "Cotacao pronta",
      body: `${number(totals.itemCount)} item(ns), ${money(totals.estimated)} sem impostos.`,
      command: "quote",
      label: "Revisar resumo",
      stats: [
        ["Itens", number(totals.itemCount)],
        ["Unidades", number(totals.units)],
        ["Total", money(totals.estimated)],
      ],
    };
  }
  return {
    tone: "muted",
    title: "Sem compra sugerida",
    body: "Fornecedor sem itens claros para cotar nesta janela.",
    command: "suggested",
    label: "Ver produtos",
    stats: [
      ["Produtos", number(rows.length)],
      ["Alertas", number(workbench?.totals?.alerts_count || 0)],
      ["Descontinuados", number(outmix)],
    ],
  };
}

function quoteCommandPanel(workbench) {
  const next = quoteCommandState(workbench);
  return `
    <div class="quote-command ${next.tone}">
      <div class="quote-command-main">
        <span>Proxima acao</span>
        <strong>${escapeHtml(next.title)}</strong>
        <em>${next.body}</em>
      </div>
      <div class="quote-command-stats">
        ${next.stats.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
      </div>
      <button class="action-button" type="button" data-quote-command="${escapeAttr(next.command)}">${escapeHtml(next.label)}</button>
    </div>
  `;
}

function quoteAssemblyOverview(workbench) {
  const totals = quoteSelectedTotals();
  const customization = totals.customization || {};
  const supplier = workbench?.supplier || {};
  const currentQuote = workbench?.current_quote || null;
  const minimum = Number(supplier.minimum_order_value || 0);
  const missing = Math.max(0, minimum - totals.estimated);
  const minLabel = minimum <= 0
    ? "Sem minimo cadastrado"
    : missing > 0
      ? `Faltam ${money(missing)}`
      : "Minimo atingido";
  const selected = totals.items.slice(0, 4);
  const statusLabel = currentQuote ? statusText(currentQuote.status) : "Montando";
  const canDiscardQuote = ["draft", "sent", "responded"].includes(currentQuote?.status || "");
  const primaryLabel = currentQuote?.status === "sent"
    ? "Continuar pedido"
    : currentQuote?.status === "responded"
      ? "Fechar pedido"
      : currentQuote?.status === "approved"
        ? "Ver pedido"
        : "Revisar PDF";
  const primaryCommand = currentQuote?.status === "responded" ? "close" : "quote";
  return `
    <section class="quote-assembly">
      <div class="quote-assembly-main">
        <span>Pedido em montagem</span>
        <strong>${escapeHtml(supplier.name || "Fornecedor")}</strong>
        <em>${escapeHtml(statusLabel)} - ${number(totals.itemCount)} item(ns), ${money(totals.estimated)} sem impostos</em>
      </div>
      <div class="quote-assembly-metrics">
        <div><span>Itens</span><strong>${number(totals.itemCount)}</strong></div>
        <div><span>Caixas</span><strong>${number(customization.boxes || 0)}</strong></div>
        <div><span>Total</span><strong>${money(totals.estimated)}</strong></div>
        <div><span>Minimo</span><strong class="${missing > 0 ? "warn" : "ok"}">${escapeHtml(minLabel)}</strong></div>
        <div><span>Ajustes</span><strong class="${customization.modified ? "warn" : "ok"}">${number(customization.modified || 0)}</strong></div>
      </div>
      <div class="quote-assembly-preview">
        ${selected.length
          ? selected.map((row) => {
            const quantity = Number(row.quote_quantity || 0);
            const suggested = Number(row.suggested_quantity || 0);
            const delta = suggested > 0 ? quantity - suggested : 0;
            const deltaLabel = Math.abs(delta) > 0.0001 ? ` (${delta > 0 ? "+" : ""}${number(delta)} vs sug.)` : "";
            return `<span>${escapeHtml(quoteDisplayCode(row))} - ${number(quantity)} ${escapeHtml(row.unit || "UN")}${escapeHtml(deltaLabel)}</span>`;
          }).join("")
          : `<span>Nenhum item marcado ainda.</span>`}
        ${totals.itemCount > selected.length ? `<span>+${number(totals.itemCount - selected.length)} item(ns)</span>` : ""}
      </div>
      <div class="quote-assembly-actions">
        ${canDiscardQuote ? `<button class="secondary-button" type="button" data-quote-command="discard">Descartar cotacao</button>` : ""}
        <button class="action-button" type="button" data-quote-command="${escapeAttr(primaryCommand)}" ${totals.itemCount ? "" : "disabled"}>${escapeHtml(primaryLabel)}</button>
        <span class="save-state" id="quoteWorkbenchStatus" aria-live="polite"></span>
      </div>
    </section>
  `;
}

function quoteJourneyState() {
  const workbench = state.quoteWorkbench;
  const currentQuote = workbench?.current_quote || null;
  const quoteStatus = currentQuote?.status || "";
  const selectedSupplier = Boolean(state.selectedQuoteSupplierId && workbench);
  const totals = quoteSelectedTotals();
  const openOrders = state.purchaseOrders || [];
  const hasOpenOrders = openOrders.length > 0;
  const sentOrAfter = ["sent", "responded", "approved"].includes(quoteStatus);
  const respondedOrAfter = ["responded", "approved"].includes(quoteStatus);
  const command = selectedSupplier ? quoteCommandState(workbench) : null;
  const stages = [
    {
      key: "supplier",
      label: "Fornecedor",
      state: selectedSupplier ? "done" : "active",
      hint: selectedSupplier ? workbench.supplier?.name || "Selecionado" : `${number((state.quoteSuppliers || []).length)} na fila`,
    },
    {
      key: "items",
      label: "Itens",
      state: totals.itemCount || currentQuote ? "done" : selectedSupplier ? "active" : "pending",
      hint: selectedSupplier ? `${number(totals.itemCount)} incluidos` : "-",
    },
    {
      key: "send",
      label: "PDF/envio",
      state: sentOrAfter ? "done" : quoteStatus === "draft" && totals.itemCount ? "active" : "pending",
      hint: quoteStatus === "draft" ? "rascunho" : sentOrAfter ? "enviado" : "-",
    },
    {
      key: "response",
      label: "Resposta",
      state: respondedOrAfter ? "done" : quoteStatus === "sent" ? "active" : "pending",
      hint: quoteStatus === "sent" ? "pendente" : respondedOrAfter ? "registrada" : "-",
    },
    {
      key: "order",
      label: "Pedido",
      state: quoteStatus === "approved" ? "done" : quoteStatus === "responded" ? "active" : "pending",
      hint: quoteStatus === "approved" ? "fechado" : quoteStatus === "responded" ? "decidir" : "-",
    },
    {
      key: "arrival",
      label: "Chegada",
      state: hasOpenOrders ? "active" : quoteStatus === "approved" ? "done" : "pending",
      hint: hasOpenOrders ? `${number(openOrders.length)} aberto(s)` : quoteStatus === "approved" ? "sem aberto" : "-",
    },
  ];
  if (hasOpenOrders && (!selectedSupplier || ["", "approved"].includes(quoteStatus))) {
    return {
      stages,
      tone: "info",
      title: "Registrar chegada",
      body: `${number(openOrders.length)} pedido(s) aguardam conferencia de entrega.`,
      command: "arrival",
      label: "Registrar chegada",
    };
  }
  if (!selectedSupplier) {
    return {
      stages,
      tone: "muted",
      title: "Escolher fornecedor",
      body: "Comece pela fila de fornecedores: minimo, urgencia e cotacao aberta definem a prioridade.",
      command: "supplier",
      label: "Ver fornecedores",
    };
  }
  return {
    stages,
    tone: command?.tone || "muted",
    title: command?.title || "Revisar compra",
    body: command?.body || "Revise os itens antes de continuar.",
    command: command?.command || "suggested",
    label: command?.label || "Ver itens",
  };
}

function renderQuoteJourney() {
  const target = document.querySelector("#quoteJourney");
  if (!target) return;
  const journey = quoteJourneyState();
  target.innerHTML = `
    <div class="quote-journey-main ${escapeAttr(journey.tone)}">
      <div>
        <span>Jornada de compra</span>
        <strong>${escapeHtml(journey.title)}</strong>
        <em>${escapeHtml(journey.body)}</em>
      </div>
      <button class="action-button compact" type="button" data-quote-journey-action="${escapeAttr(journey.command)}">${escapeHtml(journey.label)}</button>
    </div>
    <div class="quote-journey-rail">
      ${journey.stages.map((stage, index) => `
        <button class="quote-journey-step ${escapeAttr(stage.state)}" type="button" data-quote-journey-step="${escapeAttr(stage.key)}">
          <span>${number(index + 1)}</span>
          <strong>${escapeHtml(stage.label)}</strong>
          <em>${escapeHtml(stage.hint)}</em>
        </button>
      `).join("")}
    </div>
  `;
}

function quoteHistoryRows(history = []) {
  if (!history.length) return `<span>Nenhuma cotacao anterior.</span>`;
  return history
    .slice(0, 4)
    .map((item) => `<span>${escapeHtml(statusText(item.status))} - ${escapeHtml(item.created_at || "")} - ${number(item.item_count)} itens</span>`)
    .join("");
}

function selectedQuoteRows() {
  return (state.quoteWorkbench?.rows || []).filter((row) => row.in_quote && Number(row.quote_quantity || 0) > 0);
}

function quoteOrderUnitCost(row) {
  return Number(row?.cost_no_tax || 0);
}

function quoteItemUpsertPayload(row, quantity, supplierId = state.selectedQuoteSupplierId) {
  return {
    organization_id: row.organization_id,
    supplier_id: supplierId,
    product_id: row.product_id,
    requested_quantity: quantity,
    purchase_unit: row.purchase_unit || row.unit || "UN",
    purchase_package_size: Number(row.purchase_package_size || row.package_size || 1) || 1,
    coverage_target_days: row.quote_coverage_target_days || null,
    notes: row.quote_notes || "",
  };
}

function saveProductPurchaseSettings(row, settings = {}) {
  const payload = {
    organization_id: row.organization_id,
    product_id: row.product_id,
  };
  if (settings.packageSize !== undefined) payload.package_size = settings.packageSize;
  if (settings.targetCoverageDays !== undefined) payload.target_coverage_days = settings.targetCoverageDays;
  return apiPost("/api/products/purchase-settings", payload);
}

function quotePackageCount(row, quantity = Number(row?.quote_quantity || 0)) {
  const packageSize = Number(row?.purchase_package_size || row?.package_size || 0);
  if (packageSize <= 1 || Number(quantity || 0) <= 0) return 0;
  return Math.ceil(Number(quantity || 0) / packageSize);
}

function quoteCustomizationSummary(items = selectedQuoteRows()) {
  return items.reduce((acc, row) => {
    const quantity = Number(row.quote_quantity || 0);
    const suggested = Number(row.suggested_quantity || 0);
    const packageSize = Number(row.purchase_package_size || row.package_size || 0);
    const delta = suggested > 0 ? quantity - suggested : 0;
    acc.boxes += quotePackageCount(row, quantity);
    acc.withPackage += packageSize > 1 ? 1 : 0;
    acc.suggestedUnits += suggested;
    acc.selectedUnits += quantity;
    acc.deltaUnits += delta;
    if (suggested > 0 && Math.abs(delta) > 0.0001) {
      acc.modified += 1;
      if (delta > 0) acc.increased += 1;
      else acc.reduced += 1;
    }
    if ((row.alerts || []).length) acc.alerts += 1;
    if (packageSize > 1 && quantity > 0 && quantity % packageSize !== 0) acc.unroundedPackages += 1;
    if (quoteOrderUnitCost(row) <= 0) acc.missingCost += 1;
    return acc;
  }, {
    boxes: 0,
    withPackage: 0,
    suggestedUnits: 0,
    selectedUnits: 0,
    deltaUnits: 0,
    modified: 0,
    increased: 0,
    reduced: 0,
    alerts: 0,
    unroundedPackages: 0,
    missingCost: 0,
  });
}

function quoteSelectedTotals() {
  const items = selectedQuoteRows();
  const customization = quoteCustomizationSummary(items);
  return {
    items,
    itemCount: items.length,
    units: items.reduce((sum, row) => sum + Number(row.quote_quantity || 0), 0),
    estimated: items.reduce((sum, row) => sum + Number(row.quote_quantity || 0) * quoteOrderUnitCost(row), 0),
    out: Math.max(0, (state.quoteWorkbench?.rows || []).filter((row) => Number(row.suggested_quantity || 0) > 0).length - items.length),
    customization,
  };
}

function quoteAfterCoverage(row) {
  const daily = Number(row.forecast_daily_demand || row.avg_daily_window || 0);
  if (daily <= 0) return null;
  const stock = Number(row.stock_units || 0);
  const openOrder = Number(row.open_order_quantity || 0);
  const quoteQty = row.in_quote ? Number(row.quote_quantity || 0) : 0;
  return (stock + openOrder + quoteQty) / daily;
}

function quoteQuantityForCoverage(row, days) {
  const daily = Number(row.forecast_daily_demand || row.avg_daily_window || 0);
  const packageSize = Number(row.purchase_package_size || row.package_size || 1) || 1;
  if (daily <= 0 || Number(days || 0) <= 0) return 0;
  const stock = Number(row.stock_units || 0);
  const openOrder = Number(row.open_order_quantity || 0);
  const rawNeed = Math.max(0, daily * Number(days) - stock - openOrder);
  return roundToPackage(rawNeed, packageSize);
}

function quoteSuggestionMath(row) {
  const stock = Number(row.stock_units || 0);
  const openOrder = Number(row.open_order_quantity || 0);
  const targetStock = Number(row.order_up_to || 0);
  const suggested = Number(row.suggested_quantity || 0);
  const packageSize = Number(row.purchase_package_size || row.package_size || 1) || 1;
  const rawNeed = Math.max(0, targetStock - stock - openOrder);
  const roundedByPackage = packageSize > 1 && suggested > 0 && Math.abs(suggested - rawNeed) > 0.01;
  return { stock, openOrder, targetStock, suggested, packageSize, rawNeed, roundedByPackage };
}

function quoteExplainTitle(row) {
  const math = quoteSuggestionMath(row);
  const parts = [
    `Alvo de estoque: ${number(math.targetStock)} un.`,
    `Estoque ERP: ${number(math.stock)} un.`,
  ];
  if (math.openOrder > 0) parts.push(`Pedido aberto: ${number(math.openOrder)} un.`);
  parts.push(`Necessidade bruta: ${number(math.rawNeed)} un.`);
  if (math.packageSize > 1) parts.push(`Embalagem: ${number(math.packageSize)} un.`);
  parts.push(`Sugestao final: ${number(math.suggested)} un.`);
  return parts.join(" | ");
}

function quoteWorkbenchSortValue(row, key) {
  const quantity = row.in_quote ? Number(row.quote_quantity || 0) : 0;
  const cost = quoteOrderUnitCost(row);
  const math = quoteSuggestionMath(row);
  const values = {
    included: row.in_quote ? 1 : 0,
    product: `${row.name || ""} ${quoteDisplayCode(row) || ""}`,
    stock: Number(row.stock_units || 0),
    demand: Number(row.forecast_daily_demand || row.avg_daily_window || row.demand_window || 0),
    target: Number(row.order_up_to || row.target_coverage_days || 0),
    suggested: Number(row.suggested_quantity || 0),
    calc: Number(math.rawNeed || 0),
    cost,
    quantity,
    after: quoteAfterCoverage(row) ?? -1,
    total: quantity * cost,
  };
  return values[key] ?? "";
}

function compareQuoteWorkbenchRows(a, b, key) {
  const av = quoteWorkbenchSortValue(a, key);
  const bv = quoteWorkbenchSortValue(b, key);
  if (typeof av === "string" || typeof bv === "string") {
    return String(av).localeCompare(String(bv), "pt-BR", { numeric: true, sensitivity: "base" });
  }
  return Number(av || 0) - Number(bv || 0);
}

function quoteSortableHeader(key, label, className = "") {
  const sort = state.quoteWorkbenchSort || {};
  const active = sort.key === key;
  const direction = active ? sort.dir || "asc" : "";
  const sortAttr = active ? ` data-sort-dir="${escapeAttr(direction)}"` : "";
  const aria = active ? direction === "desc" ? "descending" : "ascending" : "none";
  return `<th class="${escapeAttr(`${className} sortable-th`.trim())}" data-quote-sort="${escapeAttr(key)}"${sortAttr} aria-sort="${aria}" title="Ordenar por ${escapeAttr(label)}">${escapeHtml(label)}</th>`;
}

function sortQuoteWorkbenchRows(rows) {
  const sort = state.quoteWorkbenchSort || {};
  if (!sort.key) return rows;
  const direction = sort.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const first = compareQuoteWorkbenchRows(a, b, sort.key) * direction;
    if (first !== 0) return first;
    return compareQuoteWorkbenchRows(a, b, "product");
  });
}

function quoteWorkbenchRowsForCurrentView() {
  const rows = state.quoteWorkbench?.rows || [];
  const filter = state.quoteWorkbenchFilter || "all";
  const term = (state.quoteItemSearch || "").toLowerCase();
  let visible = rows;
  if (filter === "included") visible = visible.filter((r) => r.in_quote);
  else if (filter === "suggested") visible = visible.filter((r) => Number(r.suggested_quantity || 0) > 0);
  else if (filter === "alerts") visible = visible.filter((r) => (r.alerts || []).length > 0);
  else if (filter === "outmix") visible = visible.filter((r) => ["drop", "out_of_mix"].includes(r.mix_status));
  if (term) {
    visible = visible.filter((r) => `${r.name || ""} ${r.supplier_reference || ""} ${r.source_code || ""} ${r.brand_name || ""}`.toLowerCase().includes(term));
  }
  return sortQuoteWorkbenchRows(visible);
}

function toggleQuoteWorkbenchSort(key) {
  const current = state.quoteWorkbenchSort || {};
  const numericDefaultDesc = new Set(["included", "stock", "demand", "target", "suggested", "calc", "cost", "quantity", "after", "total"]);
  const nextDir = current.key === key
    ? current.dir === "asc" ? "desc" : "asc"
    : numericDefaultDesc.has(key) ? "desc" : "asc";
  state.quoteWorkbenchSort = { key, dir: nextDir };
  applyWorkbenchView();
}

function updateQuoteSortHeaders() {
  const sort = state.quoteWorkbenchSort || {};
  document.querySelectorAll("#quoteDetail [data-quote-sort]").forEach((header) => {
    const active = header.dataset.quoteSort === sort.key;
    if (active) {
      const direction = sort.dir || "asc";
      header.dataset.sortDir = direction;
      header.setAttribute("aria-sort", direction === "desc" ? "descending" : "ascending");
    } else {
      header.removeAttribute("data-sort-dir");
      header.setAttribute("aria-sort", "none");
    }
  });
}

function quoteLiveSummaryMarkup() {
  const totals = quoteSelectedTotals();
  const visible = quoteWorkbenchRowsForCurrentView();
  const minimum = Number(state.quoteWorkbench?.supplier?.minimum_order_value || 0);
  const missing = Math.max(0, minimum - totals.estimated);
  const customization = totals.customization || {};
  const minimumText = minimum > 0
    ? missing > 0 ? `faltam ${money(missing)}` : "minimo ok"
    : "sem minimo";
  const deltaText = Number(customization.deltaUnits || 0) === 0
    ? "sem ajuste"
    : `${Number(customization.deltaUnits || 0) > 0 ? "+" : ""}${number(customization.deltaUnits)} un.`;
  return `
    <span><strong>${number(totals.itemCount)}</strong> itens</span>
    <span><strong>${money(totals.estimated)}</strong></span>
    <span><strong>${number(customization.boxes || 0)}</strong> caixas</span>
    <span class="${customization.modified ? "warn" : ""}">${number(customization.modified || 0)} ajuste(s) / ${escapeHtml(deltaText)}</span>
    <span>${minimumText}</span>
    <span>${number(visible.length)} visiveis</span>
  `;
}

function updateQuoteLiveSummary() {
  const summary = document.querySelector("#quoteLiveSummary");
  if (summary) summary.innerHTML = quoteLiveSummaryMarkup();
}

function updateQuoteAssemblyOverview() {
  const overview = document.querySelector("#quoteDetail .quote-assembly");
  if (overview && state.quoteWorkbench) {
    overview.outerHTML = quoteAssemblyOverview(state.quoteWorkbench);
  }
}

function captureQuoteScrollState() {
  const detail = document.querySelector("#quoteDetail");
  if (!detail || detail.classList.contains("hidden")) return null;
  const wrap = detail.querySelector(".quote-items-wrap");
  const rows = Array.from(detail.querySelectorAll(".qrow"));
  const topRow = rows.find((row) => row.getBoundingClientRect().bottom > 96);
  return {
    windowX: window.scrollX,
    windowY: window.scrollY,
    wrapTop: wrap ? wrap.scrollTop : 0,
    wrapLeft: wrap ? wrap.scrollLeft : 0,
    anchorProductId: topRow?.dataset.productId || "",
    anchorTop: topRow ? topRow.getBoundingClientRect().top : null,
  };
}

function restoreQuoteScrollState(scrollState) {
  if (!scrollState) return;
  const restore = () => {
    const detail = document.querySelector("#quoteDetail");
    const wrap = detail?.querySelector(".quote-items-wrap");
    if (wrap) {
      wrap.scrollTop = scrollState.wrapTop || 0;
      wrap.scrollLeft = scrollState.wrapLeft || 0;
    }
    let restoredByAnchor = false;
    if (scrollState.anchorProductId && scrollState.anchorTop !== null) {
      const row = detail?.querySelector(`[data-product-id="${CSS.escape(scrollState.anchorProductId)}"]`);
      if (row) {
        window.scrollBy(0, row.getBoundingClientRect().top - scrollState.anchorTop);
        restoredByAnchor = true;
      }
    }
    if (!restoredByAnchor) window.scrollTo(scrollState.windowX || 0, scrollState.windowY || 0);
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(restore));
}

function setQuoteStep(step) {
  const hasSupplier = Boolean(state.selectedQuoteSupplierId && state.quoteWorkbench);
  const selected = quoteSelectedTotals();
  if (step !== "supplier" && !hasSupplier) step = "supplier";
  if (step === "quote" && selected.itemCount === 0) step = hasSupplier ? "review" : "supplier";
  state.quoteStep = step;
  updateQuoteFlow();
}

function updateQuoteFlow() {
  const hasSupplier = Boolean(state.selectedQuoteSupplierId && state.quoteWorkbench);
  const totals = quoteSelectedTotals();
  if (!hasSupplier) state.quoteStep = "supplier";
  if (state.quoteStep === "quote" && totals.itemCount === 0) state.quoteStep = "review";

  const stageMap = {
    supplier: "quoteSupplierStage",
    review: "quoteDetail",
    quote: "quoteFinal",
  };
  Object.entries(stageMap).forEach(([step, id]) => {
    const el = document.getElementById(id);
    if (el) el.hidden = step !== state.quoteStep;
  });
  const head = document.getElementById("quoteWorkbenchHead");
  if (head) head.hidden = state.quoteStep === "supplier";

  document.querySelectorAll("#quotes .qstep").forEach((btn) => {
    const name = btn.dataset.quoteStep;
    btn.classList.toggle("active", name === state.quoteStep);
    btn.classList.toggle("done",
      (name === "supplier" && hasSupplier && state.quoteStep !== "supplier")
      || (name === "review" && state.quoteStep === "quote"));
    btn.disabled = (name === "review" && !hasSupplier)
      || (name === "quote" && (!hasSupplier || totals.itemCount === 0));
  });

  const supplierHint = document.getElementById("qstepSupplierHint");
  if (supplierHint) {
    supplierHint.textContent = hasSupplier
      ? state.quoteWorkbench.supplier.name
      : `${(state.quoteSuppliers || []).length} para escolher`;
  }
  const reviewHint = document.getElementById("qstepReviewHint");
  if (reviewHint) {
    reviewHint.textContent = hasSupplier
      ? `${number(totals.itemCount)} de ${number(state.quoteWorkbench?.totals?.total_products || 0)}`
      : "-";
  }
  const quoteHint = document.getElementById("qstepQuoteHint");
  if (quoteHint) {
    quoteHint.textContent = totals.itemCount ? money(totals.estimated) : "-";
  }
  renderQuoteJourney();
  renderQuoteFinal();
}

function renderQuoteFinal() {
  const target = document.querySelector("#quoteFinal");
  if (!target) return;
  if (!state.quoteWorkbench) {
    target.innerHTML = "";
    return;
  }
  const totals = quoteSelectedTotals();
  const customization = totals.customization || {};
  const supplier = state.quoteWorkbench.supplier || {};
  const minimum = Number(supplier.minimum_order_value || 0);
  const missing = Math.max(0, minimum - totals.estimated);
  const alertsPending = (state.quoteWorkbench.rows || []).filter((r) => r.in_quote && (r.alerts || []).length).length;
  const withPackage = totals.items.filter((r) => Number(r.purchase_package_size || r.package_size || 0) > 1);
  const boxes = withPackage.reduce((sum, r) => sum + Math.ceil(Number(r.quote_quantity || 0) / Number(r.purchase_package_size || r.package_size || 1)), 0);
  const minPct = minimum > 0 ? Math.min(100, (totals.estimated / minimum) * 100) : (totals.estimated > 0 ? 100 : 0);
  const minState = minimum <= 0
    ? "Sem minimo cadastrado"
    : missing <= 0
      ? `Minimo de ${money(minimum)} atingido`
      : `Faltam ${money(missing)} para o minimo (${money(minimum)})`;
  const rowsHtml = totals.items.map((row) => {
    const ref = quoteDisplayCode(row);
    const suggested = Number(row.suggested_quantity || 0);
    const quantity = Number(row.quote_quantity || 0);
    const delta = suggested > 0 ? quantity - suggested : 0;
    const deltaClass = Math.abs(delta) > 0.0001 ? delta > 0 ? "up" : "down" : "";
    const packageCount = quotePackageCount(row, quantity);
    const purchaseUnit = row.purchase_unit || row.unit || "UN";
    const packageSize = Number(row.purchase_package_size || row.package_size || 1) || 1;
    const packageLabel = packageSize > 1
      ? `${number(packageCount || Math.ceil(quantity / packageSize))} ${purchaseUnit.toLowerCase()} / ${number(packageSize)} un.`
      : purchaseUnit;
    const note = row.quote_notes || row.reason || "";
    const lineTotal = Number(row.quote_quantity || 0) * quoteOrderUnitCost(row);
    return `
      <div class="qfinal-row" data-product-id="${escapeAttr(row.product_id)}">
        <span class="qfinal-code">${escapeHtml(ref || "-")}</span>
        <div class="qfinal-name">
          <strong>${escapeHtml(row.name)}</strong>
          <span>${row.brand_name ? `${escapeHtml(row.brand_name)} &middot; ` : ""}${escapeHtml(row.abc_class || "ABC")}</span>
        </div>
        <span class="qfinal-qty">
          <strong>${number(quantity)} ${escapeHtml(purchaseUnit)}</strong>
          <em class="${escapeAttr(deltaClass)}">${suggested > 0 ? `${delta > 0 ? "+" : ""}${number(delta)} vs sug.` : "manual"}</em>
        </span>
        <span class="qfinal-package">${escapeHtml(packageLabel)}</span>
        <span class="qfinal-note">${note ? escapeHtml(note) : "-"}</span>
        <span class="qfinal-total">${money(lineTotal)}</span>
      </div>
    `;
  }).join("");
  const hasQuote = Boolean(state.quoteWorkbench.current_quote);
  const quoteStatus = state.quoteWorkbench.current_quote?.status || "";
  const canDirectClose = quoteStatus === "sent";
  const exportIsPrimary = quoteStatus === "draft";
  const primaryLabel = quoteStatus === "draft"
    ? "Marcar como enviado"
    : quoteStatus === "sent"
      ? "Registrar resposta (opcional)"
      : quoteStatus === "responded"
        ? "Fechar pedido"
        : quoteStatus === "approved"
          ? "Pedido fechado"
          : hasQuote ? "Cotacao pronta" : "Gerar cotacao";
  target.innerHTML = `
    <div class="qfinal-banner ${missing > 0 ? "warn" : "ok"}">
      <div>
        <strong>${escapeHtml(supplier.name || "Fornecedor")}</strong>
        <span>${minState}</span>
      </div>
      <div class="qfinal-banner-bar" aria-hidden="true"><span style="width:${minPct}%"></span></div>
    </div>
    <div class="qfinal-kpis">
      <div><span>Itens</span><strong>${number(totals.itemCount)}</strong></div>
      <div><span>Unidades</span><strong>${number(totals.units)}${boxes ? `<small>${number(boxes)} cx</small>` : ""}</strong></div>
      <div><span>Total s/ imp.</span><strong>${money(totals.estimated)}</strong></div>
      <div><span>Ajustes</span><strong class="${customization.modified ? "warn" : ""}">${number(customization.modified || 0)}</strong></div>
      <div><span>Sugeridos fora</span><strong class="${totals.out ? "warn" : ""}">${number(totals.out)}</strong></div>
      <div><span>Alertas</span><strong class="${alertsPending ? "danger" : ""}">${number(alertsPending)}</strong></div>
    </div>
    <div class="qfinal-personalization">
      <span>${customization.modified ? `${number(customization.increased || 0)} aumentado(s), ${number(customization.reduced || 0)} reduzido(s)` : "Quantidades iguais a sugestao nos itens sugeridos"}</span>
      <span>${customization.unroundedPackages ? `${number(customization.unroundedPackages)} item(ns) fora de caixa cheia` : "Embalagens conferidas"}</span>
      <span>${customization.missingCost ? `${number(customization.missingCost)} item(ns) sem custo` : "Custos preenchidos"}</span>
    </div>
    <div class="qfinal-list">
      <div class="qfinal-list-head">
        <span>Codigo</span><span>Produto</span><span>Qtd.</span><span>Emb.</span><span>Obs.</span><span>Total</span>
      </div>
      ${rowsHtml || `<div class="quote-empty">Inclua pelo menos um item na aba Itens.</div>`}
    </div>
    <div class="qfinal-actions">
      <button class="text-button quote-back-review" type="button">&larr; Voltar aos itens</button>
      <div class="qfinal-actions-right">
        <button class="secondary-button" type="button" ${!hasQuote ? "disabled" : ""} onclick="copyQuoteText()">Copiar mensagem</button>
        <button class="${exportIsPrimary ? "action-button" : "secondary-button"} quote-export-pdf" type="button" ${!hasQuote ? "disabled" : ""}>PDF para fornecedor</button>
        ${canDirectClose ? `<button class="secondary-button quote-direct-close" type="button">Gerar pedido sem resposta</button>` : ""}
        <button class="${exportIsPrimary ? "secondary-button" : "action-button"} quote-generate" type="button" ${totals.itemCount && quoteStatus !== "approved" ? "" : "disabled"}>${escapeHtml(primaryLabel)}</button>
      </div>
    </div>
    <span class="quote-final-note" aria-live="polite"></span>
  `;
}

function quoteProductRows(rows) {
  if (!rows.length) {
    return `<tr><td colspan="11" class="empty-cell">Nenhum item no filtro atual.</td></tr>`;
  }
  return rows
    .map((row) => {
      const inQuote = Boolean(row.in_quote);
      const quantity = inQuote ? Number(row.quote_quantity || 0) : "";
      const alert = (row.alerts || []).length > 0;
      const reason = quoteReason(row);
      const purchaseUnit = row.purchase_unit || row.unit || "UN";
      const pkg = Number(row.purchase_package_size || row.package_size || 0);
      const hasPackage = pkg > 1;
      const stock = Number(row.stock_units || 0);
      const openOrder = Number(row.open_order_quantity || 0);
      const demand = Number(row.demand_window || 0);
      const dailyAvg = Number(row.avg_daily_window || 0);
      const coverage = row.coverage_days !== null && row.coverage_days !== undefined
        ? Number(row.coverage_days)
        : dailyAvg > 0 ? Math.floor(stock / dailyAvg) : null;
      const targetDays = Number(row.target_coverage_days || 0);
      const quoteCoverageTarget = Number(row.quote_coverage_target_days || 0);
      const targetStock = Number(row.order_up_to || 0);
      const reorderPoint = Number(row.reorder_point || 0);
      const safetyStock = Number(row.safety_stock || 0);
      const totalDemand = Number(row.demand_total || 0);
      const maxSingle = Number(row.max_single_sale || 0);
      const suggested = Number(row.suggested_quantity || 0);
      const math = quoteSuggestionMath(row);
      const suggestedBoxes = hasPackage && suggested > 0 ? Math.ceil(suggested / pkg) : 0;
      const costWith = Number(row.cost_with_tax || 0);
      const costNo = Number(row.cost_no_tax || 0);
      const lineTotal = inQuote ? Number(row.quote_quantity || 0) * quoteOrderUnitCost(row) : 0;
      const quoteQty = Number(row.quote_quantity || 0);
      const quoteBoxes = hasPackage && quoteQty > 0 ? Math.ceil(quoteQty / pkg) : 0;
      const packageSummary = quoteBoxes
        ? `${number(quoteBoxes)} ${purchaseUnit.toLowerCase()} / ${number(quoteQty)} un`
        : `Un/cx ${number(pkg || 1)}`;
      const quantityDelta = suggested > 0 && inQuote ? quoteQty - suggested : 0;
      const quantityDeltaLabel = Math.abs(quantityDelta) > 0.0001
        ? `${quantityDelta > 0 ? "+" : ""}${number(quantityDelta)} vs sug.`
        : "igual a sugestao";
      const afterCoverage = quoteAfterCoverage(row);
      const afterCoverageLabel = afterCoverage === null ? "sem giro" : `${number(afterCoverage)}d`;
      const modified = inQuote && Number(row.quote_quantity || 0) !== suggested && suggested > 0;
      const zeroed = inQuote && Number(row.quote_quantity || 0) === 0;
      const discontinued = isDiscontinuedMix(row);
      const urgency = row.status === "inactive" ? "inactive"
        : reason.cls === "danger" ? "danger"
        : reason.cls === "warn" ? "warn"
        : "";
      const classes = [
        "qrow",
        inQuote ? "included" : "",
        alert ? "alert" : "",
        discontinued ? "out-of-mix" : "",
        modified ? "qty-modified" : "",
        zeroed ? "qty-zero" : "",
        urgency ? `urg-${urgency}` : "",
      ].filter(Boolean).join(" ");
      const ref = quoteDisplayCode(row);
      const stockLabel = `${number(stock)} un`;
      const stockMeta = coverage === null
        ? "sem giro"
        : `${number(coverage)}d${targetDays > 0 ? ` / ${number(targetDays)}d` : ""}`;
      const stockCls = stock <= 0 ? "danger" : (coverage !== null && coverage < 7 ? "warn" : "");
      const sugCell = suggested > 0
        ? `
            <button class="link-sug" type="button" title="${escapeAttr(quoteExplainTitle(row))}">${number(suggested)}</button>
            <span class="muted-line">${hasPackage ? `${number(suggestedBoxes)} cx` : "unidade"}${math.roundedByPackage ? " arred." : ""}</span>
          `
        : `<span class="muted">-</span>`;
      const calcLines = [
        targetStock > 0 ? `<span><b>Alvo</b>${number(targetStock)}</span>` : "",
        `<span><b>ERP</b>${number(stock)}</span>`,
        openOrder > 0 ? `<span><b>Ped.</b>${number(openOrder)}</span>` : "",
        `<span><b>Nec.</b>${number(math.rawNeed)}</span>`,
      ].filter(Boolean).join("");
      const reasonChip = reason.cls
        ? `<span class="qrow-reason ${escapeAttr(reason.cls)}" title="${escapeAttr(reason.tip)}">${escapeHtml(reason.label)}</span>`
        : "";
      const mixChip = `<span class="qrow-mix ${row.mix_status === "in_mix" ? "hidden" : ""}" title="${escapeAttr(mixStatusText(row.mix_status))}">${escapeHtml(mixStatusText(row.mix_status))}</span>`;
      const mixAction = discontinuedActionFor(row);
      return `
        <tr class="${classes}" data-product-id="${escapeAttr(row.product_id)}" data-organization-id="${escapeAttr(row.organization_id)}" data-supplier-id="${escapeAttr(state.selectedQuoteSupplierId)}" data-suggested-quantity="${escapeAttr(row.suggested_quantity)}" data-package-size="${Number(pkg || 0)}" data-product-row="true">
          <td class="col-inc">
            <button class="qrow-toggle ${inQuote ? "on" : ""}" type="button" aria-pressed="${inQuote ? "true" : "false"}" title="${discontinued ? "Produto descontinuado" : inQuote ? "Remover da cotacao" : "Adicionar na cotacao"}" ${discontinued ? "disabled" : ""}>${inQuote ? "Cotando" : "Adicionar"}</button>
          </td>
          <td class="col-prod">
            <div class="qrow-name">${escapeHtml(row.name)}</div>
            <div class="qrow-sub">
              <span class="qrow-ref">${escapeHtml(ref)}</span>
              <span class="qrow-abc">ABC ${escapeHtml(row.abc_class || "C")}</span>
              ${row.brand_name ? `<span class="qrow-brand">${escapeHtml(row.brand_name)}</span>` : ""}
              ${reasonChip}
              ${mixChip}
              <button class="qrow-mix-action ${discontinued ? "restore" : ""}" type="button" data-mix-decision="${escapeAttr(mixAction.decision)}" title="${escapeAttr(mixAction.title)}">${escapeHtml(mixAction.label)}</button>
              <button class="qrow-detail" type="button">Detalhes</button>
            </div>
          </td>
          <td class="col-stk num"><span class="${stockCls}">${stockLabel}</span><span class="muted-line">${stockMeta}${openOrder > 0 ? ` &middot; ped. ${number(openOrder)}` : ""}</span></td>
          <td class="col-dem num">
            <span>${number(demand)}</span>
            <span class="muted-line">${number(dailyAvg)}/dia janela</span>
            <span class="muted-line">proj. ${number(row.forecast_daily_demand || 0)}/dia</span>
            <span class="muted-line">total ${number(totalDemand)} &middot; maior ${number(maxSingle)}</span>
          </td>
          <td class="col-target num">
            ${targetStock > 0 ? number(targetStock) : "-"}
            <span class="muted-line">${targetDays > 0 ? `${number(targetDays)}d alvo` : "alvo"}</span>
            <span class="muted-line">${reorderPoint > 0 ? `ponto ${number(reorderPoint)}` : "sem ponto"}</span>
            <span class="muted-line">${safetyStock > 0 ? `seg. ${number(safetyStock)}` : "sem seg."}</span>
          </td>
          <td class="col-sug num">${sugCell}</td>
          <td class="col-calc">
            <div class="qrow-calc" title="${escapeAttr(quoteExplainTitle(row))}">
              ${calcLines}
            </div>
          </td>
          <td class="col-cost num">${costNo > 0 ? money(costNo) : "-"}<span class="muted-line">${costWith > 0 ? `${money(costWith)} c/ imp.` : "sem custo total"}</span></td>
          <td class="col-qty">
            <div class="qrow-qty">
              <input class="inline-input quote-quantity-input" type="text" inputmode="decimal" value="${inputValue(quantity)}" placeholder="${escapeAttr(number(suggested))}" aria-label="Quantidade" />
              ${hasPackage ? `<button class="qrow-step" type="button" data-step="-${pkg}" title="-1 caixa (${number(pkg)} un)">-</button><button class="qrow-step" type="button" data-step="${pkg}" title="+1 caixa (${number(pkg)} un)">+</button>` : ""}
            </div>
            <div class="qrow-order-fields">
              <label class="qrow-order-field">
                <span>Compra</span>
                <select class="inline-input quote-unit-select" aria-label="Unidade de compra">
                  ${["UN", "CX", "FD", "SC"].map((unit) => `<option value="${unit}" ${unit === String(purchaseUnit).toUpperCase() ? "selected" : ""}>${unit}</option>`).join("")}
                </select>
              </label>
              <label class="qrow-order-field package-field">
                <span>Un/cx</span>
                <input class="inline-input quote-package-input" type="text" inputmode="decimal" value="${inputValue(pkg || 1)}" aria-label="Itens por caixa" title="Itens por caixa" />
              </label>
            </div>
            <span class="qrow-pack">${escapeHtml(packageSummary)}</span>
            ${suggested > 0 ? `<span class="qrow-delta ${inQuote ? "" : "hidden"} ${Math.abs(quantityDelta) > 0.0001 ? "changed" : ""}">${escapeHtml(quantityDeltaLabel)}</span>` : ""}
            <span class="save-state row-save-state" aria-live="polite"></span>
          </td>
          <td class="col-after num">
            <span class="qrow-after-coverage">${escapeHtml(afterCoverageLabel)}</span>
            <span class="muted-line">atual ${coverage === null ? "-" : `${number(coverage)}d`} / alvo ${quoteCoverageTarget || targetDays || 45}d</span>
            <span class="muted-line">${openOrder > 0 ? `${number(openOrder)} ja pedido` : "apos pedido"}</span>
            <div class="qrow-coverage-control">
              <input class="inline-input quote-coverage-input" type="text" inputmode="numeric" value="${quoteCoverageTarget ? inputValue(quoteCoverageTarget) : ""}" placeholder="${targetDays || 45}" aria-label="Cobertura alvo em dias" />
              <button class="qrow-coverage-apply" type="button" title="Aplicar cobertura alvo">dias</button>
            </div>
          </td>
          <td class="col-tot num">${inQuote && lineTotal > 0 ? money(lineTotal) : `<span class="muted">-</span>`}</td>
        </tr>
      `;
    })
    .join("");
}

function quoteReason(row) {
  const stock = Number(row.stock_units || 0);
  const demand = Number(row.demand_window || 0);
  const suggested = Number(row.suggested_quantity || 0);
  const inMix = row.mix_status === "in_mix";
  const buyNow = row.buy_now || row.buy_now_flag;
  if (row.mix_status === "drop" || row.mix_status === "out_of_mix") return { label: "Descontinuado", cls: "", tip: "Produto visivel, sem compra futura" };
  if (row.mix_status === "force_buy") return { label: "Comprar +1", cls: "danger", tip: "Compra forcada manualmente" };
  if (row.status === "inactive") return { label: "Inativo", cls: "danger", tip: "Produto inativo no cadastro" };
  if (buyNow || row.force_buy) return { label: "Forcar compra", cls: "danger", tip: "Compra forcada manualmente" };
  if (stock <= 0 && demand > 0) return { label: "Estoque zero c/ demanda", cls: "danger", tip: "Sem estoque, com vendas na janela" };
  if (stock <= 0) return { label: "Estoque zero", cls: "warn", tip: "Sem estoque, sem demanda na janela" };
  if (suggested > 0 && !inMix) return { label: "Fora do mix c/ demanda", cls: "warn", tip: "Nao esta no mix, mas tem sugestao" };
  if (!inMix) return { label: "Fora do mix", cls: "", tip: "Produto fora do mix ativo" };
  if (suggested > 0) return { label: "Abaixo do minimo", cls: "warn", tip: "Estoque abaixo do ponto de reposicao" };
  if (demand <= 0) return { label: "Giro intermitente", cls: "", tip: "Sem venda na janela, mas no mix" };
  return { label: "Sem sugestao", cls: "", tip: "Produto no mix, sem necessidade calculada" };
}

function renderQuoteWorkbenchHead(workbench) {
  const supplier = workbench?.supplier;
  const target = document.querySelector("#quoteWorkbenchHead");
  if (!supplier) { target.innerHTML = ""; return; }
  target.innerHTML = `
    <div class="quote-head-line">
      <div class="quote-head-title">
        <button class="qback" type="button" data-quote-step="supplier" aria-label="Voltar para fornecedores">&larr; Trocar fornecedor</button>
        <h2>${escapeHtml(supplier.name)}</h2>
        <span class="quote-head-meta">janela ${number(workbench.window_days)}d${supplier.contact_phone ? ` &middot; ${escapeHtml(supplier.contact_phone)}` : ""}${supplier.contact_name ? ` &middot; ${escapeHtml(supplier.contact_name)}` : ""}</span>
      </div>
    </div>
    ${quoteCommandPanel(workbench)}
    ${quoteMetricCards(workbench)}
  `;
}

function renderQuoteDetail(workbench) {
  state.quoteWorkbench = workbench || null;
  renderQuoteWorkbenchHead(workbench);
  if (!workbench) {
    document.querySelector("#quoteDetail").className = "quote-stage-panel";
    document.querySelector("#quoteDetail").innerHTML = "";
    updateQuoteFlow();
    return;
  }
  document.querySelector("#quoteDetail").className = "quote-stage-panel";
  const filter = state.quoteWorkbenchFilter || "all";
  document.querySelector("#quoteDetail").innerHTML = `
    ${quoteAssemblyOverview(workbench)}
    <div class="quote-toolbar">
      <div class="quote-toolbar-main">
        <div class="quote-filter-pills" role="tablist">
          <button class="qf-pill ${filter === "all" ? "active" : ""}" type="button" data-filter="all">Todos <em>${number(workbench.totals.total_products || 0)}</em></button>
          <button class="qf-pill ${filter === "included" ? "active" : ""}" type="button" data-filter="included">Incluidos <em>${number(workbench.totals.items_in_quote || 0)}</em></button>
          <button class="qf-pill ${filter === "suggested" ? "active" : ""}" type="button" data-filter="suggested">Sugeridos</button>
          <button class="qf-pill ${filter === "alerts" ? "active" : ""}" type="button" data-filter="alerts">Alertas <em>${number(workbench.totals.alerts_count || 0)}</em></button>
          <button class="qf-pill ${filter === "outmix" ? "active" : ""}" type="button" data-filter="outmix">Descontinuados</button>
        </div>
        <div id="quoteLiveSummary" class="quote-live-summary" aria-live="polite">${quoteLiveSummaryMarkup()}</div>
      </div>
      <div class="quote-toolbar-right">
        <input id="quoteItemSearch" class="search-input compact" type="search" value="${inputValue(state.quoteItemSearch || "")}" placeholder="Buscar produto / ref" />
        <button class="text-button quote-complete-minimum" type="button" title="Adicionar itens sugeridos ate atingir o pedido minimo">Completar minimo</button>
        <button class="text-button quote-restore-items" type="button" title="Incluir todos os sugeridos com a quantidade calculada">+ Incluir sugeridos</button>
        <button class="text-button quote-round-packages" type="button" title="Arredondar itens marcados para caixas inteiras">Arred. caixas</button>
        <details class="quote-more-actions">
          <summary>Ajustes</summary>
          <div>
            <button class="text-button quote-mark-visible" type="button" title="Incluir todos os produtos visiveis no filtro atual">Marcar visiveis</button>
            <button class="text-button quote-unmark-visible" type="button" title="Remover da cotacao todos os produtos visiveis no filtro atual">Remover visiveis</button>
            <button class="text-button quote-coverage-visible" type="button" title="Calcular quantidade dos itens visiveis para uma cobertura alvo">Cobertura</button>
            <button class="text-button quote-manual-item" type="button" title="Registrar item de catalogo que ainda nao existe no ERP">Item avulso</button>
            <button class="text-button quote-clear-items" type="button" title="Remover todos os itens marcados deste fornecedor">Limpar marcados</button>
          </div>
        </details>
      </div>
    </div>
    <div class="quote-items-wrap">
      <table class="quote-items-table">
        <thead>
          <tr>
            ${quoteSortableHeader("included", "Cotando", "col-inc")}
            ${quoteSortableHeader("product", "Produto", "col-prod")}
            ${quoteSortableHeader("stock", "Estoque", "col-stk num")}
            ${quoteSortableHeader("demand", "Giro", "col-dem num")}
            ${quoteSortableHeader("target", "Alvo", "col-target num")}
            ${quoteSortableHeader("suggested", "Sug.", "col-sug num")}
            ${quoteSortableHeader("calc", "Calculo", "col-calc")}
            ${quoteSortableHeader("cost", "Custo s/ imp.", "col-cost num")}
            ${quoteSortableHeader("quantity", "Quantidade", "col-qty")}
            ${quoteSortableHeader("after", "Depois", "col-after num")}
            ${quoteSortableHeader("total", "Total", "col-tot num")}
          </tr>
        </thead>
        <tbody>${quoteProductRows(workbench.rows || [])}</tbody>
      </table>
    </div>
  `;
  applyWorkbenchView();
  updateQuoteFlow();
}

function renderQuotes() {
  const search = (document.querySelector("#quoteSupplierSearch")?.value || "").trim().toLowerCase();
  const chip = state.quoteSupplierChip || "all";
  let suppliers = (state.quoteSuppliers || []).filter((row) => {
    if (!search) return true;
    return `${row.supplier_name} ${row.contact_phone || ""} ${row.contact_name || ""}`.toLowerCase().includes(search);
  });
  if (chip !== "all") {
    suppliers = suppliers.filter((row) => {
      const status = supplierWorkbenchStatus(row);
      return status.rank === chip;
    });
  }
  suppliers.sort((a, b) => {
    const sa = supplierWorkbenchStatus(a);
    const sb = supplierWorkbenchStatus(b);
    return sb.score - sa.score;
  });
  const preview = suppliers.find((row) => row.supplier_id === state.quoteSupplierPreviewId)
    || suppliers.find((row) => row.supplier_id === state.selectedQuoteSupplierId)
    || suppliers[0];
  state.quoteSupplierPreviewId = preview?.supplier_id || "";
  document.querySelector("#quoteSuppliersTable").innerHTML = quoteSupplierRows(suppliers);
  document.querySelector("#quoteSupplierInspector").innerHTML = quoteSupplierInspector(preview);
  updateQuoteSupplierChips();
  renderQuoteJourney();
  renderQuoteDashboard();
}

async function loadQuoteSupplierWorkbench(supplierId, options = {}) {
  if (!supplierId) {
    renderQuoteDetail(null);
    return;
  }
  state.selectedQuoteSupplierId = supplierId;
  const selectedFromSupplierStep = !options.keepStep && !options.silent && state.quoteStep === "supplier";
  if (selectedFromSupplierStep) {
    state.quoteStep = "review";
    state.quoteWorkbenchFilter = "all";
    state.quoteItemSearch = "";
  }
  renderQuotes();
  const status = document.querySelector("#quoteWorkbenchStatus");
  if (status && !options.silent) status.textContent = "Carregando";
  const query = new URLSearchParams({ supplier_id: supplierId, window_days: state.quoteWindowDays || "90" });
  const workbench = await apiContract(`/api/supplier-workbench?${query.toString()}`, "supplier_workbench.v1");
  renderQuoteDetail(workbench);
  if (selectedFromSupplierStep && !workbench.current_quote && (workbench.rows || []).some((row) => Number(row.suggested_quantity || 0) > 0)) {
    await restoreSuggestedQuoteItems({ statusText: "Marcando sugestoes para cotacao" });
  }
}

async function refreshQuotes(options = {}) {
  const quoteScrollState = options.preserveScroll ? captureQuoteScrollState() : null;
  try {
    state.quoteSuppliers = await apiRows(
      "/api/supplier-workbench/suppliers",
      SUPPLIER_WORKBENCH_SUPPLIER_KEYS,
      "supplier_workbench_suppliers.v1",
    );
    await refreshPurchaseOrders();
    if (!state.quoteSupplierChipPinned) {
      state.quoteSupplierChip = defaultQuoteSupplierChip(state.quoteSuppliers);
    }
    if (!state.selectedQuoteSupplierId || !state.quoteSuppliers.some((row) => row.supplier_id === state.selectedQuoteSupplierId)) {
      state.selectedQuoteSupplierId = state.quoteSuppliers[0]?.supplier_id || "";
    }
    renderQuotes();
    await loadQuoteSupplierWorkbench(state.selectedQuoteSupplierId, { silent: true });
  } finally {
    restoreQuoteScrollState(quoteScrollState);
  }
}

function findWorkbenchRow(productId) {
  return (state.quoteWorkbench?.rows || []).find((row) => row.product_id === productId);
}

function updateWorkbenchTotalsFromRows() {
  if (!state.quoteWorkbench) return;
  const rows = state.quoteWorkbench.rows || [];
  const items = rows.filter((row) => row.in_quote);
  state.quoteWorkbench.totals.items_in_quote = items.length;
  state.quoteWorkbench.totals.estimated_value_in_quote = items.reduce((sum, row) => sum + Number(row.quote_quantity || 0) * quoteOrderUnitCost(row), 0);
  if (state.quoteWorkbench.current_quote) {
    state.quoteWorkbench.current_quote.item_count = state.quoteWorkbench.totals.items_in_quote;
    state.quoteWorkbench.current_quote.estimated_value = state.quoteWorkbench.totals.estimated_value_in_quote;
  }
  renderQuoteWorkbenchHead(state.quoteWorkbench);
  updateQuoteAssemblyOverview();
  updateQuoteLiveSummary();
  updateQuoteFlow();
}

function syncQuoteRow(rowEl, row) {
  rowEl.classList.toggle("included", Boolean(row.in_quote));
  rowEl.classList.toggle("out-of-mix", ["drop", "out_of_mix"].includes(row.mix_status));
  const discontinued = isDiscontinuedMix(row);
  const toggle = rowEl.querySelector(".qrow-toggle");
  if (toggle) {
    toggle.classList.toggle("on", Boolean(row.in_quote));
    toggle.setAttribute("aria-pressed", row.in_quote ? "true" : "false");
    toggle.disabled = discontinued;
    toggle.title = discontinued ? "Produto descontinuado" : row.in_quote ? "Remover da cotacao" : "Adicionar na cotacao";
    toggle.textContent = row.in_quote ? "Cotando" : "Adicionar";
  }
  const totalCell = rowEl.querySelector(".col-tot");
  if (totalCell) {
    const total = Number(row.quote_quantity || 0) * quoteOrderUnitCost(row);
    totalCell.innerHTML = row.in_quote && total > 0 ? money(total) : `<span class="muted">-</span>`;
  }
  const pack = rowEl.querySelector(".qrow-pack");
  const packageSize = Number(row.purchase_package_size || row.package_size || 0);
  const purchaseUnit = row.purchase_unit || row.unit || "UN";
  const quantity = Number(row.quote_quantity || 0);
  if (pack) {
    pack.textContent = packageSize > 1 && quantity > 0
      ? `${number(Math.ceil(quantity / packageSize))} ${purchaseUnit.toLowerCase()} / ${number(quantity)} un`
      : `Un/cx ${number(packageSize || 1)}`;
  }
  rowEl.dataset.packageSize = String(packageSize || 0);
  rowEl.querySelectorAll(".qrow-step").forEach((button) => {
    const sign = Number(button.dataset.step || 0) < 0 ? -1 : 1;
    button.dataset.step = String(sign * (packageSize || 1));
    button.title = `${sign > 0 ? "+" : "-"}1 embalagem (${number(packageSize || 1)} un)`;
  });
  const packageInput = rowEl.querySelector(".quote-package-input");
  if (packageInput && document.activeElement !== packageInput) packageInput.value = inputValue(packageSize || 1);
  const unitSelect = rowEl.querySelector(".quote-unit-select");
  if (unitSelect && document.activeElement !== unitSelect) unitSelect.value = String(purchaseUnit).toUpperCase();
  const coverageInput = rowEl.querySelector(".quote-coverage-input");
  if (coverageInput && document.activeElement !== coverageInput) {
    coverageInput.value = row.quote_coverage_target_days ? inputValue(row.quote_coverage_target_days) : "";
  }
  const deltaEl = rowEl.querySelector(".qrow-delta");
  const suggested = Number(row.suggested_quantity || 0);
  if (deltaEl && suggested > 0) {
    const delta = quantity - suggested;
    deltaEl.textContent = Math.abs(delta) > 0.0001 ? `${delta > 0 ? "+" : ""}${number(delta)} vs sug.` : "igual a sugestao";
    deltaEl.classList.toggle("hidden", !row.in_quote);
    deltaEl.classList.toggle("changed", row.in_quote && Math.abs(delta) > 0.0001);
  }
  const after = rowEl.querySelector(".qrow-after-coverage");
  if (after) {
    const afterCoverage = quoteAfterCoverage(row);
    after.textContent = afterCoverage === null ? "sem giro" : `${number(afterCoverage)}d`;
  }
  const mixAction = rowEl.querySelector(".qrow-mix-action");
  if (mixAction) {
    const action = discontinuedActionFor(row);
    mixAction.dataset.mixDecision = action.decision;
    mixAction.textContent = action.label;
    mixAction.title = action.title;
    mixAction.classList.toggle("restore", discontinued);
    mixAction.disabled = false;
  }
  const mixChip = rowEl.querySelector(".qrow-mix");
  if (mixChip) {
    const label = mixStatusText(row.mix_status);
    mixChip.textContent = label;
    mixChip.title = label;
    mixChip.classList.toggle("hidden", row.mix_status === "in_mix");
  }
}

async function saveWorkbenchQuantity(rowEl, quantity) {
  const row = findWorkbenchRow(rowEl.dataset.productId);
  const status = rowEl.querySelector(".row-save-state");
  if (!row) return;
  if (quantity > 0 && isDiscontinuedMix(row)) {
    status.textContent = "Descontinuado";
    return;
  }
  if (quantity < 0) {
    status.textContent = "Qtd. invalida";
    return;
  }
  const purchaseUnit = rowEl.querySelector(".quote-unit-select")?.value || row.purchase_unit || row.unit || "UN";
  const purchasePackageSize = parseInputNumber(rowEl.querySelector(".quote-package-input")?.value || row.package_size || 1) || 1;
  const coverageTargetDays = parseInputNumber(rowEl.querySelector(".quote-coverage-input")?.value || "");
  const nextCoverageTargetDays = coverageTargetDays > 0 ? coverageTargetDays : null;
  const nextInQuote = quantity > 0;
  if (purchasePackageSize <= 0) {
    status.textContent = "Embalagem invalida";
    return;
  }
  const currentUnit = String(row.purchase_unit || row.unit || "UN").toUpperCase();
  const nextUnit = String(purchaseUnit || "UN").toUpperCase();
  const currentPackageSize = Number(row.purchase_package_size || row.package_size || 1) || 1;
  const currentCoverageTargetDays = row.quote_coverage_target_days ? Number(row.quote_coverage_target_days) : null;
  const packageChanged = Math.abs(currentPackageSize - purchasePackageSize) > 0.0001;
  const unchanged =
    Boolean(row.in_quote) === nextInQuote
    && Number(row.quote_quantity || 0) === quantity
    && currentUnit === nextUnit
    && currentPackageSize === purchasePackageSize
    && currentCoverageTargetDays === nextCoverageTargetDays;
  if (unchanged) {
    status.textContent = "Sem mudanca";
    return;
  }
  const previousRow = {
    in_quote: row.in_quote,
    quote_quantity: row.quote_quantity,
    purchase_unit: row.purchase_unit,
    purchase_package_size: row.purchase_package_size,
    package_size: row.package_size,
    quote_coverage_target_days: row.quote_coverage_target_days,
  };
  row.in_quote = nextInQuote;
  row.quote_quantity = quantity;
  row.purchase_unit = nextUnit;
  row.purchase_package_size = purchasePackageSize;
  row.package_size = purchasePackageSize;
  row.quote_coverage_target_days = nextCoverageTargetDays;
  syncQuoteRow(rowEl, row);
  updateWorkbenchTotalsFromRows();
  status.textContent = "Salvando";
  try {
    if (packageChanged) {
      await saveProductPurchaseSettings(row, { packageSize: purchasePackageSize });
    }
    const result = await apiPost("/api/quote-item/upsert", {
      organization_id: rowEl.dataset.organizationId,
      supplier_id: rowEl.dataset.supplierId,
      product_id: rowEl.dataset.productId,
      requested_quantity: quantity,
      purchase_unit: nextUnit,
      purchase_package_size: purchasePackageSize,
      coverage_target_days: nextCoverageTargetDays,
      notes: row.quote_notes || "",
    });
    if (!state.quoteWorkbench.current_quote && result.current_quote_id) {
      state.quoteWorkbench.current_quote = { id: result.current_quote_id, status: "draft" };
    }
    if (state.quoteWorkbench.current_quote && !result.current_quote_id && result.item_count === 0) {
      state.quoteWorkbench.current_quote = null;
    }
    syncQuoteRow(rowEl, row);
    updateWorkbenchTotalsFromRows();
    status.textContent = "Salvo";
    refreshAfterSave(
      { replenishment: packageChanged, quotes: packageChanged, actions: true, maturity: true },
      { coalesce: true, delay: 900, preserveQuoteScroll: packageChanged },
    );
  } catch (error) {
    Object.assign(row, previousRow);
    syncQuoteRow(rowEl, row);
    updateWorkbenchTotalsFromRows();
    status.textContent = error.message;
  }
}

async function restoreSuggestedQuoteItems(options = {}) {
  if (!state.quoteWorkbench) return;
  const status = document.querySelector("#quoteWorkbenchStatus");
  const rows = (state.quoteWorkbench.rows || []).filter((row) => Number(row.suggested_quantity || 0) > 0 && !row.in_quote);
  if (!rows.length) {
    if (status) status.textContent = "Nada novo para incluir";
    return;
  }
  if (status) status.textContent = options.statusText || `Incluindo ${number(rows.length)} item(ns)`;
  try {
    for (const row of rows) {
      const quantity = Number(row.suggested_quantity || row.package_size || 1);
      const result = await apiPost("/api/quote-item/upsert", quoteItemUpsertPayload(row, quantity));
      row.in_quote = true;
      row.quote_quantity = quantity;
      if (!state.quoteWorkbench.current_quote && result.current_quote_id) {
        state.quoteWorkbench.current_quote = { id: result.current_quote_id, status: "draft" };
      }
    }
    updateWorkbenchTotalsFromRows();
    renderQuoteDetail(state.quoteWorkbench);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) nextStatus.textContent = "Sugeridos incluidos";
    refreshAfterSave({ actions: true, maturity: true });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function updateWorkbenchMixDecision(button) {
  const rowEl = button.closest(".qrow");
  const row = rowEl ? findWorkbenchRow(rowEl.dataset.productId) : null;
  const status = rowEl?.querySelector(".row-save-state");
  const decision = button.dataset.mixDecision || "drop";
  if (!rowEl || !row || !status) return;
  const productId = row.product_id;
  const quoteScrollState = captureQuoteScrollState();
  button.disabled = true;
  status.textContent = decision === "drop" ? "Descontinuando" : "Reativando";
  try {
    await apiPost("/api/products/mix-decision", {
      organization_id: row.organization_id,
      product_id: row.product_id,
      decision,
    });
    if (decision === "drop" && row.in_quote) {
      await apiPost("/api/quote-item/upsert", quoteItemUpsertPayload(row, 0));
    }

    if (decision === "drop") {
      row.mix_status = "drop";
      row.marker = "out_of_mix_permanent";
      row.in_quote = false;
      row.quote_quantity = 0;
      row.suggested_quantity = 0;
    } else if (decision === "force_buy") {
      row.mix_status = "force_buy";
      row.marker = "force_one_more_purchase";
    } else {
      row.mix_status = "in_mix";
      row.marker = "";
    }
    syncQuoteRow(rowEl, row);
    updateWorkbenchTotalsFromRows();
    applyWorkbenchView();
    restoreQuoteScrollState(quoteScrollState);
    const nextStatus = document.querySelector(`#quoteDetail [data-product-id="${CSS.escape(productId)}"] .row-save-state`)
      || document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) nextStatus.textContent = decision === "drop" ? "Fora do pedido" : "Reativado";
    refreshAfterSave(
      { replenishment: true, quotes: true, actions: true, maturity: true },
      { coalesce: true, delay: 900, preserveQuoteScroll: true },
    );
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function clearWorkbenchQuoteItems() {
  if (!state.quoteWorkbench) return;
  const status = document.querySelector("#quoteWorkbenchStatus");
  const rows = (state.quoteWorkbench.rows || []).filter((row) => row.in_quote);
  if (!rows.length) {
    if (status) status.textContent = "Nenhum item marcado";
    return;
  }
  if (status) status.textContent = `Removendo ${number(rows.length)} item(ns)`;
  try {
    for (const row of rows) {
      await apiPost("/api/quote-item/upsert", quoteItemUpsertPayload(row, 0));
      row.in_quote = false;
      row.quote_quantity = 0;
    }
    state.quoteWorkbench.current_quote = null;
    updateWorkbenchTotalsFromRows();
    renderQuoteDetail(state.quoteWorkbench);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) nextStatus.textContent = "Marcados removidos";
    refreshAfterSave({ actions: true, maturity: true });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function bulkSetVisibleQuoteItems(include) {
  if (!state.quoteWorkbench) return;
  const status = document.querySelector("#quoteWorkbenchStatus");
  const visible = quoteWorkbenchRowsForCurrentView();
  const blocked = include ? visible.filter((row) => ["drop", "out_of_mix"].includes(row.mix_status)) : [];
  const rows = visible
    .filter((row) => !include || !["drop", "out_of_mix"].includes(row.mix_status))
    .filter((row) => include ? !row.in_quote : row.in_quote);
  if (!rows.length) {
    if (status) status.textContent = include && blocked.length ? "Descontinuados nao entram em compra em massa" : "Nada para alterar no filtro";
    return;
  }
  if (status) status.textContent = `${include ? "Marcando" : "Removendo"} ${number(rows.length)} item(ns) visiveis`;
  try {
    for (const row of rows) {
      const quantity = include ? Number(row.quote_quantity || row.suggested_quantity || row.package_size || 1) : 0;
      const result = await apiPost("/api/quote-item/upsert", quoteItemUpsertPayload(row, quantity));
      row.in_quote = include;
      row.quote_quantity = quantity;
      if (include && !state.quoteWorkbench.current_quote && result.current_quote_id) {
        state.quoteWorkbench.current_quote = { id: result.current_quote_id, status: "draft" };
      }
    }
    if (!include && !selectedQuoteRows().length) state.quoteWorkbench.current_quote = null;
    updateWorkbenchTotalsFromRows();
    renderQuoteDetail(state.quoteWorkbench);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) {
      const skipped = include && blocked.length ? ` (${number(blocked.length)} descontinuado(s) ignorado(s))` : "";
      nextStatus.textContent = include ? `Visiveis marcados${skipped}` : "Visiveis removidos";
    }
    refreshAfterSave({ actions: true, maturity: true });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function applyCoverageToVisible(days) {
  if (!state.quoteWorkbench) return;
  const status = document.querySelector("#quoteWorkbenchStatus");
  const rows = quoteWorkbenchRowsForCurrentView()
    .filter((row) => !["drop", "out_of_mix"].includes(row.mix_status))
    .filter((row) => quoteQuantityForCoverage(row, days) > 0);
  if (!rows.length) {
    if (status) status.textContent = "Nenhum item visivel precisa dessa cobertura";
    return;
  }
  if (status) status.textContent = `Aplicando cobertura em ${number(rows.length)} item(ns)`;
  try {
    for (const row of rows) {
      const quantity = quoteQuantityForCoverage(row, days);
      row.quote_coverage_target_days = days;
      const result = await apiPost("/api/quote-item/upsert", quoteItemUpsertPayload(row, quantity));
      row.in_quote = quantity > 0;
      row.quote_quantity = quantity;
      if (!state.quoteWorkbench.current_quote && result.current_quote_id) {
        state.quoteWorkbench.current_quote = { id: result.current_quote_id, status: "draft" };
      }
    }
    updateWorkbenchTotalsFromRows();
    renderQuoteDetail(state.quoteWorkbench);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) nextStatus.textContent = `Cobertura de ${number(days)}d aplicada`;
    refreshAfterSave({ actions: true, maturity: true });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

function openCoverageBulkModal() {
  const defaultDays = Number(state.quoteWorkbench?.supplier?.lead_time_days || 0) + 45;
  openModal(
    "Aplicar cobertura",
    `
      <div class="modal-context">
        <strong>Calcular quantidade dos itens visiveis</strong>
        <span>O sistema usa estoque ERP, pedidos em aberto e giro projetado. Produtos descontinuados ficam fora da acao em massa.</span>
      </div>
      <label class="modal-field">
        <span>Cobertura alvo em dias</span>
        <input class="inline-input" id="coverageDaysInput" type="text" inputmode="numeric" value="${inputValue(defaultDays || 45)}" />
      </label>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="coverageCancel">Cancelar</button>
        <button class="action-button" type="button" id="coverageApply">Aplicar nos visiveis</button>
      </div>
      <span class="save-state" id="coverageState" aria-live="polite"></span>
    `,
    (body) => {
      const stateEl = body.querySelector("#coverageState");
      body.querySelector("#coverageCancel").addEventListener("click", closeModal);
      body.querySelector("#coverageApply").addEventListener("click", async () => {
        const days = parseInputNumber(body.querySelector("#coverageDaysInput").value);
        if (days <= 0) {
          stateEl.textContent = "Informe uma cobertura valida.";
          return;
        }
        stateEl.textContent = "Aplicando";
        closeModal();
        await applyCoverageToVisible(days);
      });
    },
  );
}

async function completeMinimumOrder() {
  if (!state.quoteWorkbench) return;
  const status = document.querySelector("#quoteWorkbenchStatus");
  const minimum = Number(state.quoteWorkbench.supplier?.minimum_order_value || 0);
  const totals = quoteSelectedTotals();
  if (minimum <= 0) {
    if (status) status.textContent = "Fornecedor sem pedido minimo cadastrado";
    return;
  }
  if (totals.estimated >= minimum) {
    if (status) status.textContent = "Pedido minimo ja atingido";
    return;
  }
  const statusWeight = { urgent: 0, buy_now: 1, watch: 2, ok: 3, excess: 5, no_demand: 6 };
  const candidates = (state.quoteWorkbench.rows || [])
    .filter((row) => !row.in_quote)
    .filter((row) => !["drop", "out_of_mix"].includes(row.mix_status))
    .filter((row) => Number(row.suggested_quantity || 0) > 0)
    .sort((a, b) => (statusWeight[a.status] ?? 4) - (statusWeight[b.status] ?? 4) || Number(b.priority || 0) - Number(a.priority || 0));
  if (!candidates.length) {
    if (status) status.textContent = "Sem sugestoes pendentes para completar minimo";
    return;
  }
  let total = totals.estimated;
  let added = 0;
  if (status) status.textContent = "Completando minimo";
  try {
    for (const row of candidates) {
      if (total >= minimum) break;
      const quantity = Number(row.suggested_quantity || row.package_size || 1);
      const result = await apiPost("/api/quote-item/upsert", quoteItemUpsertPayload(row, quantity));
      row.in_quote = true;
      row.quote_quantity = quantity;
      total += quantity * quoteOrderUnitCost(row);
      added += 1;
      if (!state.quoteWorkbench.current_quote && result.current_quote_id) {
        state.quoteWorkbench.current_quote = { id: result.current_quote_id, status: "draft" };
      }
    }
    updateWorkbenchTotalsFromRows();
    renderQuoteDetail(state.quoteWorkbench);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) nextStatus.textContent = added ? `${number(added)} item(ns) adicionados para o minimo` : "Nada alterado";
    refreshAfterSave({ actions: true, maturity: true });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function roundIncludedToPackages() {
  if (!state.quoteWorkbench) return;
  const status = document.querySelector("#quoteWorkbenchStatus");
  const rowsToRound = selectedQuoteRows()
    .filter((row) => Number(row.purchase_package_size || row.package_size || 0) > 1)
    .map((row) => {
      const packageSize = Number(row.purchase_package_size || row.package_size || 1);
      const quantity = Number(row.quote_quantity || 0);
      const rounded = roundToPackage(quantity, packageSize);
      return { row, quantity, rounded };
    })
    .filter((item) => Math.abs(item.rounded - item.quantity) > 0.0001);
  if (!rowsToRound.length) {
    if (status) status.textContent = "Itens marcados ja estao em caixas inteiras";
    return;
  }
  if (status) status.textContent = `Arredondando ${number(rowsToRound.length)} item(ns)`;
  try {
    for (const item of rowsToRound) {
      await apiPost("/api/quote-item/upsert", quoteItemUpsertPayload(item.row, item.rounded));
      item.row.in_quote = item.rounded > 0;
      item.row.quote_quantity = item.rounded;
    }
    updateWorkbenchTotalsFromRows();
    renderQuoteDetail(state.quoteWorkbench);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) nextStatus.textContent = "Caixas arredondadas";
    refreshAfterSave({ actions: true, maturity: true });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

function openManualQuoteItemModal() {
  const supplier = state.quoteWorkbench?.supplier || {};
  openModal(
    "Item avulso de cotacao",
    `
      <div class="modal-context">
        <strong>${escapeHtml(supplier.name || "Fornecedor")}</strong>
        <span>Use para registrar produto visto em catalogo ou negociado pela primeira vez. Ele nao vira produto do Nexo; produto oficial continua vindo do ERP.</span>
      </div>
      <label class="modal-field">
        <span>Produto / referencia do catalogo</span>
        <input class="inline-input" id="manualQuoteName" type="text" maxlength="160" placeholder="Ex.: Limpador multiuso 5L novo fornecedor" />
      </label>
      <div class="form-grid two">
        <label class="modal-field">
          <span>Quantidade para cotar</span>
          <input class="inline-input" id="manualQuoteQty" type="text" inputmode="decimal" placeholder="Ex.: 12" />
        </label>
        <label class="modal-field">
          <span>Observacao</span>
          <input class="inline-input" id="manualQuoteNote" type="text" maxlength="180" placeholder="Catalogo, promocao, teste, substituto..." />
        </label>
      </div>
      <div class="modal-preview">Este registro fica como memoria operacional do pedido. Quando o item entrar no ERP, ele passa a participar das proximas sugestoes automaticamente pela importacao.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="manualQuoteCancel">Cancelar</button>
        <button class="action-button" type="button" id="manualQuoteSave">Registrar para cotacao</button>
      </div>
      <span class="save-state" id="manualQuoteState" aria-live="polite"></span>
    `,
    (body) => {
      const stateEl = body.querySelector("#manualQuoteState");
      body.querySelector("#manualQuoteCancel").addEventListener("click", closeModal);
      body.querySelector("#manualQuoteSave").addEventListener("click", async () => {
        const name = body.querySelector("#manualQuoteName").value.trim();
        if (!name) {
          stateEl.textContent = "Informe o produto ou referencia.";
          return;
        }
        stateEl.textContent = "Registrando";
        try {
          await apiPost("/api/operational-decisions", {
            action: "quote_manual_catalog_item",
            target_type: "supplier",
            target_id: supplier.id || state.selectedQuoteSupplierId || "",
            decision: "Item avulso para cotacao",
            notes: `${name}${body.querySelector("#manualQuoteQty").value.trim() ? ` | qtd ${body.querySelector("#manualQuoteQty").value.trim()}` : ""}${body.querySelector("#manualQuoteNote").value.trim() ? ` | ${body.querySelector("#manualQuoteNote").value.trim()}` : ""}`,
            scope: supplier.name || "Fornecedor",
            source_view: "quotes",
            applied_to_count: 1,
            metadata: {
              supplier_id: supplier.id || state.selectedQuoteSupplierId || "",
              supplier_name: supplier.name || "",
              manual_item_name: name,
              requested_quantity: body.querySelector("#manualQuoteQty").value.trim(),
            },
          });
          stateEl.textContent = "Item registrado na memoria do pedido";
          setTimeout(closeModal, 600);
          refreshAfterSave({ actions: true, maturity: true });
        } catch (error) {
          stateEl.textContent = error.message;
        }
      });
    },
  );
}

function scheduleWorkbenchQuantitySave(input) {
  const rowEl = input.closest(".qrow");
  if (!rowEl) return;
  const existing = state.quoteSaveTimers.get(rowEl.dataset.productId);
  if (existing) clearTimeout(existing);
  rowEl.querySelector(".row-save-state").textContent = "Editando";
  const timer = setTimeout(() => {
    const quantity = parseInputNumber(rowEl.querySelector(".quote-quantity-input")?.value || "0");
    saveWorkbenchQuantity(rowEl, quantity);
    state.quoteSaveTimers.delete(rowEl.dataset.productId);
  }, 400);
  state.quoteSaveTimers.set(rowEl.dataset.productId, timer);
}

function toggleWorkbenchRow(rowEl, include = null) {
  const input = rowEl?.querySelector(".quote-quantity-input");
  const row = rowEl ? findWorkbenchRow(rowEl.dataset.productId) : null;
  if (!rowEl || !input || !row) return;
  const shouldInclude = include === null ? !row.in_quote : Boolean(include);
  const nextQuantity = shouldInclude ? Number(row.quote_quantity || row.suggested_quantity || row.package_size || 1) : 0;
  input.value = nextQuantity > 0 ? String(nextQuantity).replace(".", ",") : "";
  saveWorkbenchQuantity(rowEl, nextQuantity);
}

function toggleWorkbenchItem(checkbox) {
  toggleWorkbenchRow(checkbox.closest(".qrow"), checkbox.checked);
}

function generateCurrentQuote() {
  const status = document.querySelector("#quoteFinal .quote-final-note") || document.querySelector("#quoteWorkbenchStatus");
  if (!state.quoteWorkbench) return;
  const totals = quoteSelectedTotals();
  if (!totals.itemCount) {
    if (status) status.textContent = "Inclua pelo menos um item.";
    return;
  }
  const quote = state.quoteWorkbench.current_quote;
  if (!quote) {
    if (status) status.textContent = "Marque itens para criar o rascunho da cotacao.";
    return;
  }
  if (quote.status === "draft") {
    markCurrentQuoteSent();
    return;
  }
  if (quote.status === "sent") {
    openQuoteResponseModal();
    return;
  }
  if (quote.status === "responded") {
    openPurchaseCloseModal();
    return;
  }
  if (status) status.textContent = `Cotacao ${statusText(quote.status).toLowerCase()}.`;
}

async function refreshCurrentQuoteWorkbench(options = {}) {
  if (!state.selectedQuoteSupplierId) return;
  await loadQuoteSupplierWorkbench(state.selectedQuoteSupplierId, { keepStep: true, silent: true, ...options });
  await refreshAfterSave({ quotes: true, actions: true, maturity: true });
}

async function markCurrentQuoteSent() {
  const quote = state.quoteWorkbench?.current_quote;
  const status = document.querySelector("#quoteWorkbenchStatus") || document.querySelector("#quoteFinal .quote-final-note");
  if (!quote?.id) {
    if (status) status.textContent = "Nao ha cotacao em rascunho.";
    return;
  }
  if (status) status.textContent = "Marcando como enviada";
  await apiPost("/api/quotes/status", { id: quote.id, status: "sent" });
  await refreshCurrentQuoteWorkbench();
}

async function discardQuote(quote, supplierId = state.selectedQuoteSupplierId, feedbackEl = null, buttonEl = null) {
  const status = feedbackEl || document.querySelector("#quoteWorkbenchStatus") || document.querySelector("#quoteFinal .quote-final-note");
  if (!quote?.id) {
    if (status) status.textContent = "Nao ha cotacao aberta para descartar.";
    return;
  }
  if (!["draft", "sent", "responded"].includes(quote.status || "")) {
    if (status) status.textContent = "Esta cotacao ja virou pedido.";
    return;
  }
  if (!window.confirm("Descartar esta cotacao aberta? Os itens marcados serao removidos da mesa.")) return;
  if (buttonEl) buttonEl.disabled = true;
  if (status) status.textContent = "Descartando cotacao";
  try {
    await apiPost("/api/quotes/status", { id: quote.id, status: "cancelled" });
    if (status) status.textContent = "Cotacao descartada";
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (supplierId) await loadQuoteSupplierWorkbench(supplierId, { keepStep: true, silent: true });
    await refreshQuotes();
    await refreshAfterSave({ quotes: true, actions: true, maturity: true }, { defer: true, delay: 150 });
  } catch (error) {
    if (status) status.textContent = error.message || "Nao foi possivel descartar.";
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function discardCurrentQuote() {
  await discardQuote(state.quoteWorkbench?.current_quote);
}

function quoteResponseRows(items = []) {
  return items.map((item) => `
    <tr data-quote-item-id="${escapeAttr(item.id)}">
      <td>
        <strong class="product-name">${escapeHtml(item.product_name)}</strong>
        <span class="muted-line">${escapeHtml(item.quote_code || item.source_code || "")} - pedido ${number(item.requested_quantity)} ${escapeHtml(item.unit || "UN")}</span>
      </td>
      <td>
        <select class="inline-input quote-response-availability">
          ${["", "available", "partial", "unavailable", "no_quote"].map((value) => `<option value="${value}" ${value === (item.availability || "") ? "selected" : ""}>${escapeHtml(availabilityText(value))}</option>`).join("")}
        </select>
      </td>
      <td><input class="inline-input compact-input quote-response-price" type="text" inputmode="decimal" value="${inputValue(item.quoted_unit_price ?? item.estimated_unit_cost ?? "")}" /></td>
      <td><input class="inline-input compact-input quote-response-package" type="text" inputmode="decimal" value="${inputValue(item.quoted_package_size ?? "")}" placeholder="1" /></td>
      <td><input class="inline-input compact-input quote-response-lead" type="text" inputmode="numeric" value="${inputValue(item.quoted_lead_time_days ?? "")}" /></td>
      <td><input class="inline-input quote-response-notes" type="text" value="${inputValue(item.notes || "")}" placeholder="observacao" /></td>
    </tr>
  `).join("");
}

async function openQuoteResponseModal() {
  const quoteId = state.quoteWorkbench?.current_quote?.id;
  if (!quoteId) return;
  const detail = await apiContract(`/api/quote?id=${encodeURIComponent(quoteId)}`, "quote_detail.v1");
  const summary = detail.response_summary || {};
  openModal(
    "Registrar resposta",
    `
      <div class="modal-context">
        <strong>${escapeHtml(detail.supplier_name || "Fornecedor")}</strong>
        <span>${number(detail.item_count || detail.items?.length || 0)} item(ns) enviados. Mesmo resposta parcial ja ensina custo, prazo e embalagem.</span>
      </div>
      <div class="quote-response-summary">
        <div><span>Respondidos</span><strong>${number(summary.responded_count || 0)}</strong></div>
        <div><span>Pendentes</span><strong>${number(summary.pending_count || 0)}</strong></div>
        <div><span>Total cotado</span><strong>${money(summary.quoted_total_amount || 0)}</strong></div>
        <div><span>Prazo medio</span><strong>${summary.average_lead_time_days == null ? "-" : `${number(summary.average_lead_time_days)}d`}</strong></div>
      </div>
      <div class="table-wrap quote-items">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Disponibilidade</th>
              <th class="num">Preco unit.</th>
              <th class="num">Embalagem</th>
              <th class="num">Prazo</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>${quoteResponseRows(detail.items || [])}</tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="quoteResponseCancel">Cancelar</button>
        <button class="action-button" type="button" id="quoteResponseSave">Salvar resposta</button>
      </div>
      <span class="save-state" id="quoteResponseState" aria-live="polite"></span>
    `,
    (body) => {
      const saveState = body.querySelector("#quoteResponseState");
      body.querySelector("#quoteResponseCancel").addEventListener("click", closeModal);
      body.querySelector("#quoteResponseSave").addEventListener("click", async () => {
        saveState.textContent = "Salvando resposta";
        const items = Array.from(body.querySelectorAll("[data-quote-item-id]")).map((row) => ({
          item_id: row.dataset.quoteItemId,
          availability: row.querySelector(".quote-response-availability").value,
          quoted_unit_price: row.querySelector(".quote-response-price").value.trim(),
          quoted_package_size: row.querySelector(".quote-response-package").value.trim(),
          quoted_lead_time_days: row.querySelector(".quote-response-lead").value.trim(),
          notes: row.querySelector(".quote-response-notes").value.trim(),
        }));
        try {
          await apiPost("/api/quotes/response", { id: quoteId, items });
          saveState.textContent = "Resposta registrada";
          closeModal();
          await refreshCurrentQuoteWorkbench();
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
    { modalClass: "quote-cycle-modal" },
  );
}

function purchaseCloseRows(items = []) {
  return items.map((item) => {
    const packageSize = Number(item.quoted_package_size || 1) || 1;
    const finalQuantity = roundToPackage(Number(item.requested_quantity || 0), packageSize);
    const decision = defaultPurchaseDecision(item);
    return `
      <tr data-quote-item-id="${escapeAttr(item.id)}">
        <td>
          <strong class="product-name">${escapeHtml(item.product_name)}</strong>
          <span class="muted-line">${escapeHtml(availabilityText(item.availability || ""))} - pedido ${number(item.requested_quantity)} ${escapeHtml(item.unit || "UN")}</span>
        </td>
        <td>
          <select class="inline-input purchase-close-decision">
            ${["buy", "skip", "review"].map((value) => `<option value="${value}" ${value === decision ? "selected" : ""}>${escapeHtml(decisionText(value))}</option>`).join("")}
          </select>
        </td>
        <td><input class="inline-input compact-input purchase-close-qty" type="text" inputmode="decimal" value="${inputValue(finalQuantity)}" /></td>
        <td><input class="inline-input compact-input purchase-close-price" type="text" inputmode="decimal" value="${inputValue(item.quoted_unit_price ?? item.estimated_unit_cost ?? "")}" /></td>
        <td><input class="inline-input compact-input purchase-close-package" type="text" inputmode="decimal" value="${inputValue(packageSize)}" /></td>
        <td><input class="inline-input purchase-close-notes" type="text" value="${inputValue(item.notes || "")}" placeholder="observacao" /></td>
      </tr>
    `;
  }).join("");
}

function updatePurchaseClosePreview(body, minimumOrderValue = 0) {
  const totals = Array.from(body.querySelectorAll("[data-quote-item-id]")).reduce((acc, row) => {
    const decision = row.querySelector(".purchase-close-decision").value;
    const quantity = parseInputNumber(row.querySelector(".purchase-close-qty").value);
    const price = parseInputNumber(row.querySelector(".purchase-close-price").value);
    if (decision === "buy" && quantity > 0) {
      acc.items += 1;
      acc.units += quantity;
      acc.total += quantity * price;
    }
    return acc;
  }, { items: 0, units: 0, total: 0 });
  const missing = Math.max(0, Number(minimumOrderValue || 0) - totals.total);
  body.querySelector("#purchaseCloseItems").textContent = number(totals.items);
  body.querySelector("#purchaseCloseUnits").textContent = number(totals.units);
  body.querySelector("#purchaseCloseTotal").textContent = money(totals.total);
  body.querySelector("#purchaseCloseMinimum").textContent = Number(minimumOrderValue || 0) <= 0
    ? "Sem minimo"
    : missing > 0 ? `Faltam ${money(missing)}` : "Minimo atingido";
  body.querySelector(".purchase-close-summary").classList.toggle("warn", missing > 0);
}

async function openPurchaseCloseModal() {
  const quoteId = state.quoteWorkbench?.current_quote?.id;
  if (!quoteId) return;
  const detail = await apiContract(`/api/quote?id=${encodeURIComponent(quoteId)}`, "quote_detail.v1");
  if (detail.purchase_order) {
    openModal(
      "Pedido fechado",
      `
        <div class="modal-context">
          <strong>${escapeHtml(detail.purchase_order.id)}</strong>
          <span>${escapeHtml(detail.supplier_name || "Fornecedor")} - ${money(detail.purchase_order.total_amount || 0)}.</span>
        </div>
        <div class="modal-actions">
          <button class="action-button" type="button" id="purchaseAlreadyClosed">Fechar</button>
        </div>
      `,
      (body) => body.querySelector("#purchaseAlreadyClosed").addEventListener("click", closeModal),
    );
    return;
  }
  const minimum = Number(detail.supplier_terms?.minimum_order_value || 0);
  openModal(
    "Fechar pedido",
    `
      <div class="modal-context">
        <strong>${escapeHtml(detail.supplier_name || "Fornecedor")}</strong>
        <span>Confirme o que sera comprado. O pedido preserva sugestao, quantidade cotada e quantidade final.</span>
      </div>
      <div class="purchase-close-summary">
        <div><span>Itens comprados</span><strong id="purchaseCloseItems">0</strong></div>
        <div><span>Unidades</span><strong id="purchaseCloseUnits">0</strong></div>
        <div><span>Total final</span><strong id="purchaseCloseTotal">R$ 0,00</strong></div>
        <div><span>Pedido minimo</span><strong id="purchaseCloseMinimum">-</strong></div>
      </div>
      <div class="table-wrap quote-items">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Decisao</th>
              <th class="num">Qtd final</th>
              <th class="num">Preco</th>
              <th class="num">Embalagem</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>${purchaseCloseRows(detail.items || [])}</tbody>
        </table>
      </div>
      <label class="modal-field">
        <span>Observacao do pedido</span>
        <textarea class="inline-input quick-note" id="purchaseCloseNotes" rows="3" placeholder="condicao, combinados, excecoes de minimo..."></textarea>
      </label>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="purchaseCloseCancel">Cancelar</button>
        <button class="action-button" type="button" id="purchaseCloseSave">Gerar pedido</button>
      </div>
      <span class="save-state" id="purchaseCloseState" aria-live="polite"></span>
    `,
    (body) => {
      const saveState = body.querySelector("#purchaseCloseState");
      const refreshPreview = () => updatePurchaseClosePreview(body, minimum);
      body.querySelectorAll("input, select").forEach((input) => input.addEventListener("input", refreshPreview));
      body.querySelectorAll("select").forEach((input) => input.addEventListener("change", refreshPreview));
      refreshPreview();
      body.querySelector("#purchaseCloseCancel").addEventListener("click", closeModal);
      body.querySelector("#purchaseCloseSave").addEventListener("click", async () => {
        saveState.textContent = "Gerando pedido";
        const items = Array.from(body.querySelectorAll("[data-quote-item-id]")).map((row) => ({
          item_id: row.dataset.quoteItemId,
          decision: row.querySelector(".purchase-close-decision").value,
          final_quantity: row.querySelector(".purchase-close-qty").value.trim(),
          unit_price: row.querySelector(".purchase-close-price").value.trim(),
          package_size: row.querySelector(".purchase-close-package").value.trim(),
          notes: row.querySelector(".purchase-close-notes").value.trim(),
        }));
        try {
          await apiPost("/api/purchase-orders/close", {
            id: quoteId,
            items,
            notes: body.querySelector("#purchaseCloseNotes").value.trim(),
          });
          saveState.textContent = "Pedido gerado";
          closeModal();
          await refreshCurrentQuoteWorkbench();
          await refreshPurchaseOrders();
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
    { modalClass: "quote-cycle-modal" },
  );
}

function runQuoteCommand(command, sourceEl = null) {
  if (!command) return;
  if (command === "supplier") {
    setQuoteStep("supplier");
    return;
  }
  if (command === "arrival") {
    const order = (state.purchaseOrders || [])[0];
    if (order?.id) openReceivePurchaseOrderModal(order.id);
    return;
  }
  if (command === "restore") {
    setQuoteStep("review");
    restoreSuggestedQuoteItems();
    return;
  }
  if (command === "alerts") {
    setQuoteStep("review");
    filterWorkbenchRows("alerts");
    return;
  }
  if (command === "suggested") {
    setQuoteStep("review");
    filterWorkbenchRows("suggested");
    return;
  }
  if (command === "quote") {
    setQuoteStep("quote");
    return;
  }
  if (command === "discard") {
    discardQuote(state.quoteWorkbench?.current_quote, state.selectedQuoteSupplierId, null, sourceEl);
    return;
  }
  if (command === "send") markCurrentQuoteSent();
  if (command === "response") openQuoteResponseModal();
  if (command === "close") openPurchaseCloseModal();
}

function updateQuoteSupplierChips() {
  const activeChip = state.quoteSupplierChip || "all";
  const counts = quoteSupplierChipCounts();
  const labels = {
    all: "Todos",
    ready: "Prontos",
    risk: "Risco",
    below_min: "Abaixo do min.",
    open: "Em aberto",
  };
  document.querySelectorAll("#quoteSupplierChips .quote-chip").forEach((btn) => {
    const chip = btn.dataset.chip || "all";
    btn.innerHTML = `<span>${escapeHtml(labels[chip] || chip)}</span><em>${number(counts[chip] || 0)}</em>`;
    btn.classList.toggle("active", chip === activeChip);
  });
}

function filterWorkbenchRows(filter) {
  state.quoteWorkbenchFilter = filter;
  applyWorkbenchView();
}

function applyWorkbenchView() {
  const filter = state.quoteWorkbenchFilter || "all";
  const visible = quoteWorkbenchRowsForCurrentView();
  const tbody = document.querySelector("#quoteDetail tbody");
  if (tbody) tbody.innerHTML = quoteProductRows(visible);
  document.querySelectorAll("#quoteDetail .qf-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.filter === filter);
  });
  updateQuoteSortHeaders();
  updateQuoteLiveSummary();
}

function applyQuickQuantity(btn) {
  const row = btn.closest("tr");
  if (!row) return;
  const input = row.querySelector(".quote-quantity-input");
  if (!input) return;
  const suggested = Number(row.dataset.suggestedQuantity || 0);
  const pkg = Number(row.dataset.packageSize || 0);
  const current = parseFloat(String(input.value).replace(",", ".")) || 0;
  let next = current;
  if (btn.classList.contains("link-sug")) next = suggested;
  else if (btn.classList.contains("qrow-step")) {
    const step = Number(btn.dataset.step || 0);
    next = Math.max(0, current + step);
  }
  input.value = next > 0 ? String(next).replace(".", ",") : "";
  const check = row.querySelector(".qrow-check");
  if (check) check.checked = next > 0;
  row.classList.toggle("included", next > 0);
  scheduleWorkbenchQuantitySave(input);
  setTimeout(renderQuoteFinal, 300);
}

function applyRowCoverageTarget(button) {
  const rowEl = button.closest(".qrow");
  const row = rowEl ? findWorkbenchRow(rowEl.dataset.productId) : null;
  const input = rowEl?.querySelector(".quote-coverage-input");
  const quantityInput = rowEl?.querySelector(".quote-quantity-input");
  if (!rowEl || !row || !input || !quantityInput) return;
  const days = parseInputNumber(input.value || input.placeholder || "0");
  const status = rowEl.querySelector(".row-save-state");
  if (days <= 0) {
    if (status) status.textContent = "Cobertura invalida";
    return;
  }
  const packageSize = parseInputNumber(rowEl.querySelector(".quote-package-input")?.value || row.package_size || 1) || 1;
  row.purchase_package_size = packageSize;
  row.package_size = packageSize;
  row.quote_coverage_target_days = days;
  const nextQuantity = quoteQuantityForCoverage(row, days);
  quantityInput.value = nextQuantity > 0 ? String(nextQuantity).replace(".", ",") : "";
  const toggle = rowEl.querySelector(".qrow-toggle");
  if (toggle) toggle.classList.toggle("on", nextQuantity > 0);
  saveWorkbenchQuantity(rowEl, nextQuantity);
}

async function openQuoteProductDrawer(productId) {
  const workbench = state.quoteWorkbench;
  if (!workbench) return;
  const row = (workbench.rows || []).find((r) => r.product_id === productId);
  if (!row) return;
  document.querySelector("#quoteProductDrawer")?.classList.add("hidden");
  openModal(
    row.name || "Item do pedido",
    `<div class="quote-info-loading">Carregando informacoes do produto...</div>`,
    null,
    { modalClass: "quote-product-modal" },
  );
  const body = document.querySelector("#modalBody");
  if (!body) return;
  let detail = {};
  try {
    detail = await api(`/api/product?id=${encodeURIComponent(productId)}`);
  } catch (error) {
    detail = { load_error: error.message };
  }
  const reason = quoteReason(row);
  const settings = detail.settings || {};
  const sales = detail.sales_summary || {};
  const decisions = detail.recent_decisions || [];
  const identifiers = detail.identifiers || [];
  const currentQty = Number(row.quote_quantity || 0);
  const suggestedQty = Number(row.suggested_quantity || 0);
  const purchaseUnit = row.purchase_unit || row.unit || "UN";
  const packageSize = Number(row.purchase_package_size || row.package_size || settings.package_size || 1) || 1;
  const currentCoverage = row.coverage_days === null || row.coverage_days === undefined ? null : Number(row.coverage_days);
  const targetCoverage = Number(row.quote_coverage_target_days || row.target_coverage_days || 45);
  const afterCoverage = quoteAfterCoverage(row);
  const cover45Qty = quoteQuantityForCoverage(row, 45);
  const noteValue = row.quote_notes || "";
  const quantityLabel = currentQty > 0
    ? packageSize > 1 ? `${number(Math.ceil(currentQty / packageSize))} ${purchaseUnit.toLowerCase()} / ${number(currentQty)} un` : `${number(currentQty)} ${purchaseUnit}`
    : "Nao marcado";
  if (document.querySelector("#modalOverlay")?.hidden) return;
  body.innerHTML = `
    ${detail.load_error ? `<div class="modal-preview warn">${escapeHtml(detail.load_error)}</div>` : ""}
    <div class="quote-decision-hero">
      <div>
        <span>Decisao de compra</span>
        <strong>${row.in_quote ? "Cotando" : "Fora desta cotacao"}</strong>
        <em>${escapeHtml(reason.label)} - ${escapeHtml(row.reason || reason.tip || "")}</em>
      </div>
      <div class="quote-decision-actions">
        <button class="action-button drawer-use-suggested" type="button" ${suggestedQty > 0 ? "" : "disabled"}>Usar sugestao</button>
        <button class="secondary-button drawer-zero-quote" type="button">Zerar</button>
        <button class="secondary-button drawer-plus-package" type="button">+1 ${escapeHtml(purchaseUnit.toLowerCase())}</button>
        <button class="secondary-button drawer-cover-45" type="button" ${cover45Qty > 0 ? "" : "disabled"}>Cobrir 45d</button>
      </div>
    </div>
    <section class="quote-info-card quote-info-wide quote-package-editor">
      <div>
        <h3>Caixa e compra</h3>
        <p>${packageSize > 1 ? `1 ${escapeHtml(purchaseUnit.toLowerCase())} = ${number(packageSize)} unidades` : "Embalagem ainda tratada como unidade avulsa"}</p>
      </div>
      <label class="modal-field compact">
        <span>Unidade de compra</span>
        <select class="inline-input quote-modal-unit-select" aria-label="Unidade de compra">
          ${["UN", "CX", "FD", "SC"].map((unit) => `<option value="${unit}" ${unit === String(purchaseUnit).toUpperCase() ? "selected" : ""}>${unit}</option>`).join("")}
        </select>
      </label>
      <label class="modal-field compact">
        <span>Itens por caixa</span>
        <input class="inline-input quote-modal-package-input" type="text" inputmode="decimal" value="${inputValue(packageSize)}" aria-label="Itens por caixa" />
      </label>
      <button class="action-button drawer-save-package" type="button">Salvar caixa</button>
      <span class="save-state drawer-package-state" aria-live="polite"></span>
    </section>
    <section class="quote-info-card quote-info-wide quote-coverage-compare">
      <h3>Antes e depois</h3>
      <div class="quote-coverage-strip">
        <div><span>Atual</span><strong>${currentCoverage === null ? "-" : `${number(currentCoverage)}d`}</strong></div>
        <div><span>Depois</span><strong>${afterCoverage === null ? "-" : `${number(afterCoverage)}d`}</strong></div>
        <div><span>Alvo</span><strong>${number(targetCoverage)}d</strong></div>
      </div>
    </section>
    <div class="quote-drawer-actions">
      <button class="secondary-button drawer-toggle-quote" type="button">${row.in_quote ? "Remover do pedido" : "Adicionar no pedido"}</button>
      <button class="secondary-button drawer-open-product" type="button">Ficha completa</button>
    </div>
    <div class="quote-info-grid">
      <section class="quote-info-card">
        <h3>Pedido</h3>
        <dl>
          <dt>Quantidade</dt><dd>${quantityLabel}</dd>
          <dt>Sugestao</dt><dd>${suggestedQty > 0 ? `${number(suggestedQty)} un.` : "-"}</dd>
          <dt>Embalagem</dt><dd>${packageSize > 1 ? `${number(packageSize)} un. por ${escapeHtml(purchaseUnit.toLowerCase())}` : escapeHtml(purchaseUnit)}</dd>
          <dt>Total marcado</dt><dd>${row.in_quote ? money(currentQty * quoteOrderUnitCost(row)) : "-"}</dd>
        </dl>
      </section>
      <section class="quote-info-card">
        <h3>Estoque e cobertura</h3>
        <dl>
          <dt>Estoque</dt><dd>${number(row.stock_units)} ${escapeHtml(row.unit || "UN")}</dd>
          <dt>Cobertura</dt><dd>${row.coverage_days === null || row.coverage_days === undefined ? "-" : `${number(row.coverage_days)} dias`}</dd>
          <dt>Alvo</dt><dd>${row.target_coverage_days ? `${number(row.target_coverage_days)} dias` : "-"} / ${row.order_up_to ? `${number(row.order_up_to)} un.` : "-"}</dd>
          <dt>Ponto de pedido</dt><dd>${row.reorder_point ? `${number(row.reorder_point)} un.` : "-"}</dd>
          <dt>Estoque seguranca</dt><dd>${row.safety_stock ? `${number(row.safety_stock)} un.` : "-"}</dd>
        </dl>
      </section>
      <section class="quote-info-card">
        <h3>Vendas</h3>
        <dl>
          <dt>30 / 90 / 180d</dt><dd>${number(row.demand_30 || 0)} / ${number(row.demand_90 || 0)} / ${number(row.demand_180 || 0)}</dd>
          <dt>V.T</dt><dd>${number(row.demand_total || sales.quantity || 0)} un.</dd>
          <dt>V.U</dt><dd>${number(row.max_single_sale || sales.max_single_sale || 0)} un.</dd>
          <dt>Media diaria</dt><dd>${number(row.avg_daily_window)} janela / ${number(row.forecast_daily_demand || 0)} projetada</dd>
          <dt>Ultima venda</dt><dd>${escapeHtml(sales.last_sale_at || "-")}</dd>
        </dl>
      </section>
      <section class="quote-info-card">
        <h3>Preco e custo</h3>
        <dl>
          <dt>Venda ERP</dt><dd>${money(row.sale_price || detail.sale_price || 0)}</dd>
          <dt>Custo s/ imp.</dt><dd>${money(row.cost_no_tax || 0)}</dd>
          <dt>Custo c/ imp.</dt><dd>${money(row.cost_with_tax || detail.total_cost || 0)}</dd>
          <dt>Ultimo custo</dt><dd>${money(row.cost_no_tax || detail.total_cost || 0)}</dd>
          <dt>ABC</dt><dd>${escapeHtml(row.abc_class || "C")}</dd>
        </dl>
      </section>
      <section class="quote-info-card">
        <h3>Fornecedor e codigos</h3>
        <dl>
          <dt>Referencia fornecedor</dt><dd>${escapeHtml(row.supplier_reference || detail.supplier_reference || "-")}</dd>
          <dt>Codigo interno</dt><dd>${escapeHtml(productCode(row.source_code) || "-")}</dd>
          <dt>Codigo barras</dt><dd>${escapeHtml(detail.barcode || "-")}</dd>
          <dt>Marca</dt><dd>${escapeHtml(row.brand_name || detail.brand_name || "-")}</dd>
          <dt>Outros codigos</dt><dd>${identifiers.length ? identifiers.map((item) => `${escapeHtml(item.identifier_type)}: ${escapeHtml(item.identifier_value)}`).join("<br>") : "-"}</dd>
        </dl>
      </section>
      <section class="quote-info-card">
        <h3>Mix e operacao</h3>
        <dl>
          <dt>Status</dt><dd><span class="status-chip ${reason.cls || 'ok'}">${escapeHtml(row.status_label || row.status)}</span></dd>
          <dt>Mix</dt><dd><span class="mix-pill ${escapeAttr(row.mix_status)}">${escapeHtml(mixStatusText(row.mix_status))}</span></dd>
          <dt>Validade</dt><dd>${Number(settings.expires || 0) ? "Produto com validade" : "Sem validade marcada"}</dd>
          <dt>Peso</dt><dd>${settings.weight ? `${number(settings.weight)} kg` : "-"}</dd>
          <dt>Observacao</dt><dd>${escapeHtml(settings.notes || "-")}</dd>
        </dl>
      </section>
    </div>
    <section class="quote-info-card quote-info-wide">
      <h3>Observacao para este item</h3>
      <textarea class="inline-input quick-note drawer-quote-note" rows="3" placeholder="Ex.: aceitar substituto, mandar validade longa, confirmar fragrancia...">${escapeHtml(noteValue)}</textarea>
      <div class="quote-decision-actions note-actions">
        <button class="secondary-button drawer-save-note" type="button">Salvar observacao</button>
        <span class="save-state drawer-note-state" aria-live="polite"></span>
      </div>
    </section>
    <section class="quote-info-card quote-info-wide">
      <h3>Memoria de decisoes</h3>
      <div class="quote-decision-log">
        ${decisions.length ? decisions.map((item) => `<span><strong>${escapeHtml(item.decision_value || item.decision_type)}</strong>${item.notes ? ` - ${escapeHtml(item.notes)}` : ""}<em>${escapeHtml(item.created_at || "")}</em></span>`).join("") : `<span>Nenhuma decisao operacional registrada para este produto.</span>`}
      </div>
    </section>
  `;
  body.querySelector(".drawer-toggle-quote")?.addEventListener("click", () => {
    const rowEl = document.querySelector(`#quoteDetail [data-product-id="${CSS.escape(productId)}"]`);
    if (rowEl) toggleWorkbenchRow(rowEl);
  });
  body.querySelector(".drawer-save-package")?.addEventListener("click", async () => {
    const stateEl = body.querySelector(".drawer-package-state");
    const nextPackageSize = parseInputNumber(body.querySelector(".quote-modal-package-input")?.value || "0");
    const nextUnit = String(body.querySelector(".quote-modal-unit-select")?.value || row.purchase_unit || row.unit || "UN").toUpperCase();
    if (nextPackageSize <= 0) {
      if (stateEl) stateEl.textContent = "Informe um valor maior que zero";
      return;
    }
    const rowEl = document.querySelector(`#quoteDetail [data-product-id="${CSS.escape(productId)}"]`);
    const quantity = Number(row.quote_quantity || 0);
    if (stateEl) stateEl.textContent = "Salvando";
    if (rowEl) {
      const packageInput = rowEl.querySelector(".quote-package-input");
      const unitSelect = rowEl.querySelector(".quote-unit-select");
      if (packageInput) packageInput.value = String(nextPackageSize).replace(".", ",");
      if (unitSelect) unitSelect.value = nextUnit;
      await saveWorkbenchQuantity(rowEl, quantity);
    } else {
      row.purchase_unit = nextUnit;
      row.purchase_package_size = nextPackageSize;
      row.package_size = nextPackageSize;
      await saveProductPurchaseSettings(row, { packageSize: nextPackageSize });
      refreshAfterSave({ replenishment: true, quotes: true }, { coalesce: true, delay: 900, preserveQuoteScroll: true });
    }
    if (stateEl) stateEl.textContent = "Caixa salva";
  });
  body.querySelector(".drawer-use-suggested")?.addEventListener("click", () => {
    const rowEl = document.querySelector(`#quoteDetail [data-product-id="${CSS.escape(productId)}"]`);
    const input = rowEl?.querySelector(".quote-quantity-input");
    if (input && suggestedQty > 0) {
      input.value = String(suggestedQty).replace(".", ",");
      saveWorkbenchQuantity(rowEl, suggestedQty);
    }
  });
  body.querySelector(".drawer-zero-quote")?.addEventListener("click", () => {
    const rowEl = document.querySelector(`#quoteDetail [data-product-id="${CSS.escape(productId)}"]`);
    const input = rowEl?.querySelector(".quote-quantity-input");
    if (input) {
      input.value = "";
      saveWorkbenchQuantity(rowEl, 0);
    }
  });
  body.querySelector(".drawer-plus-package")?.addEventListener("click", () => {
    const rowEl = document.querySelector(`#quoteDetail [data-product-id="${CSS.escape(productId)}"]`);
    const input = rowEl?.querySelector(".quote-quantity-input");
    const currentPackageSize = parseInputNumber(body.querySelector(".quote-modal-package-input")?.value || packageSize) || packageSize;
    if (input) {
      const nextQuantity = Number(row.quote_quantity || 0) + currentPackageSize;
      input.value = String(nextQuantity).replace(".", ",");
      saveWorkbenchQuantity(rowEl, nextQuantity);
    }
  });
  body.querySelector(".drawer-cover-45")?.addEventListener("click", () => {
    const rowEl = document.querySelector(`#quoteDetail [data-product-id="${CSS.escape(productId)}"]`);
    const input = rowEl?.querySelector(".quote-quantity-input");
    const coverage = rowEl?.querySelector(".quote-coverage-input");
    if (input && cover45Qty > 0) {
      if (coverage) coverage.value = "45";
      row.quote_coverage_target_days = 45;
      input.value = String(cover45Qty).replace(".", ",");
      saveWorkbenchQuantity(rowEl, cover45Qty);
    }
  });
  body.querySelector(".drawer-save-note")?.addEventListener("click", () => {
    const rowEl = document.querySelector(`#quoteDetail [data-product-id="${CSS.escape(productId)}"]`);
    const noteState = body.querySelector(".drawer-note-state");
    row.quote_notes = body.querySelector(".drawer-quote-note")?.value.trim() || "";
    if (rowEl) {
      if (noteState) noteState.textContent = "Salvando";
      saveWorkbenchQuantity(rowEl, Number(row.quote_quantity || 0));
      if (noteState) noteState.textContent = "Observacao salva";
    }
  });
  body.querySelector(".drawer-open-product")?.addEventListener("click", () => openProductModal(productId));
}

function purchaseOrderStatusText(status) {
  return {
    approved: "Aprovado",
    sent: "Enviado",
    partial_received: "Recebido parcial",
    received: "Recebido",
    cancelled: "Cancelado",
  }[status] || status || "-";
}

function purchaseOrderCards(rows = state.purchaseOrders || []) {
  if (!rows.length) {
    return `<div class="purchase-orders-empty">Nenhum pedido em aberto. Quando uma cotacao respondida virar pedido, ela aparece aqui ate a chegada ser registrada.</div>`;
  }
  return rows.map((row) => {
    const overdue = Number(row.overdue || 0) > 0;
    const statusCls = overdue ? "danger" : row.status === "partial_received" ? "warn" : "info";
    return `
      <article class="purchase-order-card ${overdue ? "overdue" : ""}" data-purchase-order-id="${escapeAttr(row.id)}">
        <div>
          <span class="status-chip ${statusCls}">${escapeHtml(overdue ? "Atrasado" : purchaseOrderStatusText(row.status))}</span>
          <strong>${escapeHtml(row.supplier_name || "Fornecedor")}</strong>
          <em>${escapeHtml(row.id)}</em>
        </div>
        <dl>
          <div><dt>Total</dt><dd>${money(row.total_amount || 0)}</dd></div>
          <div><dt>Itens</dt><dd>${number(row.approved_item_count || row.item_count || 0)}</dd></div>
          <div><dt>Previsao</dt><dd>${escapeHtml(row.expected_delivery_date || "-")}</dd></div>
          <div><dt>Minimo</dt><dd>${Number(row.minimum_order_met || 0) ? "Atingido" : "Abaixo"}</dd></div>
        </dl>
        <button class="action-button compact receive-purchase-order" type="button">Registrar chegada</button>
      </article>
    `;
  }).join("");
}

function renderPurchaseOrders(rows = state.purchaseOrders || []) {
  const target = document.querySelector("#purchaseOrdersBoard");
  if (target) target.innerHTML = purchaseOrderCards(rows);
  renderQuoteJourney();
}

function purchaseReceiveRows(items = []) {
  return items.map((item) => `
    <tr data-purchase-order-item-id="${escapeAttr(item.id)}">
      <td>
        <strong class="product-name">${escapeHtml(item.product_name)}</strong>
        <span class="muted-line">${escapeHtml(item.quote_code || item.source_code || "")} - ${escapeHtml(item.unit || "UN")}</span>
      </td>
      <td class="num expected-qty">${number(item.final_quantity || item.ordered_quantity || 0)}</td>
      <td><input class="inline-input compact-input purchase-receive-qty" type="text" inputmode="decimal" value="${inputValue(item.received_quantity || item.final_quantity || item.ordered_quantity || 0)}" /></td>
      <td><input class="inline-input purchase-receive-notes" type="text" value="${inputValue(item.notes || "")}" placeholder="divergencia, avaria, falta..." /></td>
    </tr>
  `).join("");
}

function updateReceivePreview(body) {
  const totals = Array.from(body.querySelectorAll("[data-purchase-order-item-id]")).reduce((acc, row) => {
    const expected = parseInputNumber(row.querySelector(".expected-qty")?.textContent || "0");
    const received = parseInputNumber(row.querySelector(".purchase-receive-qty").value);
    acc.expected += expected;
    acc.received += received;
    if (Math.abs(expected - received) > 0.0001) acc.divergent += 1;
    return acc;
  }, { expected: 0, received: 0, divergent: 0 });
  body.querySelector("#receiveExpected").textContent = number(totals.expected);
  body.querySelector("#receiveReceived").textContent = number(totals.received);
  body.querySelector("#receiveDivergent").textContent = number(totals.divergent);
  body.querySelector(".purchase-close-summary").classList.toggle("warn", totals.divergent > 0);
}

async function openReceivePurchaseOrderModal(orderId) {
  if (!orderId) return;
  const order = await apiContract(`/api/purchase-order?id=${encodeURIComponent(orderId)}`, "purchase_order_detail.v1");
  openModal(
    "Registrar chegada",
    `
      <div class="modal-context">
        <strong>${escapeHtml(order.supplier_name || "Fornecedor")}</strong>
        <span>Este registro nao altera estoque. Ele cria memoria operacional para comparar pedido, entrega e desempenho do fornecedor.</span>
      </div>
      <div class="purchase-close-summary">
        <div><span>Esperado</span><strong id="receiveExpected">0</strong></div>
        <div><span>Recebido</span><strong id="receiveReceived">0</strong></div>
        <div><span>Divergencias</span><strong id="receiveDivergent">0</strong></div>
        <div><span>Fonte estoque</span><strong>ERP</strong></div>
      </div>
      <div class="table-wrap quote-items">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th class="num">Esperado</th>
              <th class="num">Recebido</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>${purchaseReceiveRows(order.items || [])}</tbody>
        </table>
      </div>
      <label class="modal-field">
        <span>Observacao da chegada</span>
        <textarea class="inline-input quick-note" id="purchaseReceiveNotes" rows="3" placeholder="atraso, entrega parcial, devolucao, combinados...">${escapeHtml(order.notes || "")}</textarea>
      </label>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="purchaseReceiveCancel">Cancelar</button>
        <button class="action-button" type="button" id="purchaseReceiveSave">Registrar chegada</button>
      </div>
      <span class="save-state" id="purchaseReceiveState" aria-live="polite"></span>
    `,
    (body) => {
      const saveState = body.querySelector("#purchaseReceiveState");
      const refreshPreview = () => updateReceivePreview(body);
      body.querySelectorAll("input").forEach((input) => input.addEventListener("input", refreshPreview));
      refreshPreview();
      body.querySelector("#purchaseReceiveCancel").addEventListener("click", closeModal);
      body.querySelector("#purchaseReceiveSave").addEventListener("click", async () => {
        saveState.textContent = "Registrando chegada";
        const items = Array.from(body.querySelectorAll("[data-purchase-order-item-id]")).map((row) => ({
          item_id: row.dataset.purchaseOrderItemId,
          received_quantity: row.querySelector(".purchase-receive-qty").value.trim(),
          notes: row.querySelector(".purchase-receive-notes").value.trim(),
        }));
        try {
          await apiPost("/api/purchase-orders/receive", {
            id: orderId,
            items,
            notes: body.querySelector("#purchaseReceiveNotes").value.trim(),
          });
          saveState.textContent = "Chegada registrada";
          closeModal();
          await refreshPurchaseOrders();
          await refreshActions();
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
    { modalClass: "quote-cycle-modal" },
  );
}

async function refreshPurchaseOrders() {
  state.purchaseOrders = await apiRows(
    "/api/purchase-orders?status=open",
    ["id", "supplier_id", "supplier_name", "status", "total_amount", "item_count", "approved_item_count", "overdue"],
    "purchase_orders_list.v1",
  );
  renderPurchaseOrders(state.purchaseOrders);
}

function copyQuoteTextOld() {
  // placeholder — sera implementado com o fluxo completo
  const status = document.querySelector("#quoteWorkbenchStatus");
  if (status) status.textContent = "Mensagem copiada (em breve).";
}

function copyQuoteText() {
  const status = document.querySelector("#quoteFinal .quote-final-note") || document.querySelector("#quoteWorkbenchStatus");
  const supplier = state.quoteWorkbench?.supplier || {};
  const items = quoteSelectedTotals().items;
  if (!items.length) {
    if (status) status.textContent = "Inclua itens antes de copiar.";
    return;
  }
  const lines = [
    `Cotacao/Pedido - ${supplier.name || "Fornecedor"}`,
    "",
    ...items.map((row) => {
      const ref = quoteDisplayCode(row);
      const qty = Number(row.quote_quantity || 0);
      const pkg = Number(row.package_size || 0);
      const qtyText = pkg > 1
        ? `${number(Math.ceil(qty / pkg))} CX (${number(qty)} UN)`
        : `${number(qty)} ${row.unit || "UN"}`;
      return `${ref ? `${ref} - ` : ""}${row.name} - ${qtyText}`;
    }),
  ];
  const text = lines.join("\n");
  const done = () => { if (status) status.textContent = "Mensagem copiada para enviar ao fornecedor."; };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {
      window.prompt("Copie a mensagem do pedido", text);
      done();
    });
  } else {
    window.prompt("Copie a mensagem do pedido", text);
    done();
  }
}

function exportCurrentQuotePdf() {
  const status = document.querySelector("#quoteFinal .quote-final-note") || document.querySelector("#quoteWorkbenchStatus");
  const quoteId = state.quoteWorkbench?.current_quote?.id;
  if (!quoteId) {
    if (status) status.textContent = "Gere a cotacao antes de exportar.";
    return;
  }
  window.open(`/api/quote/pdf?id=${encodeURIComponent(quoteId)}`, "_blank", "noopener");
  if (status) status.textContent = "PDF gerado para download.";
}

async function createQuote(button) {
  await loadQuoteSupplierWorkbench(button.dataset.supplierId || state.selectedQuoteSupplierId);
}

async function openQuote(button) {
  const quoteId = button.dataset.quoteId;
  const quote = (state.quotes || []).find((row) => row.id === quoteId);
  if (quote?.supplier_id) await loadQuoteSupplierWorkbench(quote.supplier_id);
}

async function markQuoteSent(button) {
  button.disabled = true;
  await apiPost("/api/quotes/status", { id: button.dataset.quoteId, status: "sent" });
  await refreshQuotes();
}

async function saveQuoteResponse() {}

async function closePurchaseOrder() {}

function renderPricingSummary(summary = {}) {
  const items = [
    ["Produtos", number(summary.products), "blue"],
    ["Margem negativa", number(summary.negative_margin), "amber"],
    ["Margem baixa", number(summary.low_margin), "amber"],
    ["Sem custo/preco", number(summary.missing_cost), ""],
    ["Oportunidades", number(summary.opportunities), "green"],
  ];
  document.querySelector("#pricingSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function setPricingMode(mode) {
  setModuleMode({
    stateKey: "pricingMode",
    modeAttr: "data-pricing-mode",
    operationalSelector: "#pricingOperational",
    dashboardSelector: "#pricingDashboard",
  }, mode);
}

function pricingSeverityRank(row) {
  if (row.severity === "danger") return 0;
  if (row.severity === "warn") return 1;
  return 2;
}

function roleText(role) {
  return {
    normal: "Normal",
    ancora: "Ancora",
    commodity: "Commodity",
    marca_propria: "Marca propria",
  }[role] || "Normal";
}

function pricingChartRows(items, valueFormatter = number) {
  return dashboardChartRows(items, {
    valueFormatter,
    rowClass: "pricing-chart-row",
    labelFor: (item) => item.label || item.name || "",
    attrsFor: (item) => item.product_id ? ` data-product-id="${escapeAttr(item.product_id)}"` : "",
  });
}

function pricingDashboardCharts(payload = state.pricing || {}) {
  const rows = payload.rows || [];
  const summary = payload.summary || {};
  const products = Number(summary.products || rows.length || 0);
  const negative = Number(summary.negative_margin || rows.filter((row) => row.severity === "danger").length);
  const low = Number(summary.low_margin || rows.filter((row) => row.severity === "warn").length);
  const missing = Number(summary.missing_cost || rows.filter((row) => !Number(row.sale_price || 0) || !Number(row.effective_cost || 0)).length);
  const opportunities = Number(summary.opportunities || rows.filter((row) => Number(row.target_price || 0) > 0).length);
  const okCount = Math.max(0, products - negative - low - missing);
  const healthPct = products ? (okCount / products) * 100 : 0;
  const margins = rows
    .map((row) => row.margin_pct)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  const avgMargin = margins.length ? margins.reduce((acc, value) => acc + value, 0) / margins.length : null;
  const impactRows = rows
    .filter((row) => Number(row.revenue || 0) > 0)
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 5)
    .map((row) => ({ label: row.name, value: Number(row.revenue || 0), product_id: row.product_id }));
  const targetRows = rows
    .map((row) => {
      const delta = Math.max(0, Number(row.target_price || 0) - Number(row.sale_price || 0));
      return { label: row.name, value: delta * Number(row.quantity || 0), product_id: row.product_id };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const statusRows = [
    { label: "Margem negativa", value: negative },
    { label: "Margem baixa", value: low },
    { label: "Sem custo/preco", value: missing },
    { label: "Dentro do alvo", value: okCount },
  ];
  const roleRows = Array.from(rows.reduce((map, row) => {
    const label = row.role_label || roleText(row.product_role) || "Sem papel";
    const item = map.get(label) || { label, value: 0 };
    item.value += 1;
    map.set(label, item);
    return map;
  }, new Map()).values()).sort((a, b) => b.value - a.value).slice(0, 5);
  const coverageRows = [
    { label: "Com custo e preco", value: Math.max(0, products - missing) },
    { label: "Sem base completa", value: missing },
  ];
  const insight = negative + low
    ? `${number(negative + low)} produto(s) pedem revisao antes de qualquer campanha ou promocao.`
    : "A base atual nao tem risco critico de margem no periodo.";
  const charts = [
    `
      <article class="pricing-dashboard-card wide">
        <div>
          <span>Saude de precos</span>
          <strong>${number(healthPct)}%</strong>
          <p>${number(okCount)} de ${number(products)} produto(s) com leitura saudavel.</p>
        </div>
        <div class="pricing-donut" style="--value:${Math.max(0, Math.min(100, healthPct))}"><span>${number(healthPct)}%</span></div>
      </article>
    `,
    `
      <article class="pricing-dashboard-card">
        <div>
          <span>Risco de margem</span>
          <strong>${number(negative + low)}</strong>
          <p>${number(negative)} negativo(s), ${number(low)} baixo(s).</p>
        </div>
      </article>
    `,
    `
      <article class="pricing-dashboard-card">
        <div>
          <span>Margem media</span>
          <strong>${avgMargin === null ? "-" : `${number(avgMargin)}%`}</strong>
          <p>Calculada nos produtos com custo e preco disponiveis.</p>
        </div>
      </article>
    `,
    `
      <article class="pricing-chart-card">
        <header><span>Diagnostico</span><strong>Sinais por tipo</strong></header>
        <div class="pricing-chart">${pricingChartRows(statusRows)}</div>
      </article>
    `,
    `
      <article class="pricing-chart-card">
        <header><span>Impacto</span><strong>Maior receita</strong></header>
        <div class="pricing-chart">${pricingChartRows(impactRows, compactMoney)}</div>
      </article>
    `,
    `
      <article class="pricing-chart-card">
        <header><span>Oportunidade</span><strong>Potencial estimado</strong></header>
        <div class="pricing-chart">${pricingChartRows(targetRows.length ? targetRows : [{ label: "Sem alvo acima do ERP", value: 1 }], targetRows.length ? compactMoney : number)}</div>
      </article>
    `,
    `
      <article class="pricing-chart-card">
        <header><span>Governanca</span><strong>Cobertura da base</strong></header>
        <div class="pricing-chart">${pricingChartRows(coverageRows)}</div>
      </article>
    `,
    `
      <article class="pricing-chart-card">
        <header><span>Estrategia</span><strong>Papel dos produtos</strong></header>
        <div class="pricing-chart">${pricingChartRows(roleRows.length ? roleRows : [{ label: "Sem classificacao", value: products || 1 }])}</div>
      </article>
    `,
    `
      <article class="pricing-dashboard-card wide">
        <div>
          <span>Leitura Nexo</span>
          <strong>${number(opportunities)} oportunidade(s)</strong>
          <p>${escapeHtml(insight)}</p>
        </div>
      </article>
    `,
  ];
  document.querySelector("#pricingDashboardCharts").innerHTML = charts.join("");
}

function pricingFocusRows(rows = []) {
  const focus = rows
    .filter((row) => row.severity === "danger" || row.severity === "warn" || Number(row.target_price || 0) > 0)
    .sort((a, b) => pricingSeverityRank(a) - pricingSeverityRank(b) || Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 6);
  if (!focus.length) {
    return `
      <div class="pricing-focus-card muted-card">
        <strong>Nenhuma revisao critica agora</strong>
        <span>Quando a importacao trouxer novos custos, precos ou vendas, esta fila mostra onde agir primeiro.</span>
      </div>
    `;
  }
  return focus.map((row) => `
    <a class="pricing-focus-card" href="/precos?pricing_mode=dashboard&pricing_product_id=${encodeURIComponent(row.product_id)}" data-product-id="${escapeAttr(row.product_id)}">
      <span class="status-chip ${escapeAttr(row.severity)}">${escapeHtml(row.signal_label || "Revisar")}</span>
      <strong>${escapeHtml(row.name)}</strong>
      <span>${money(row.revenue)} no periodo - margem ${row.margin_pct === null || row.margin_pct === undefined ? "-" : `${number(row.margin_pct)}%`}</span>
      <em>${Number(row.target_price || 0) > 0 ? `Alvo Nexo ${money(row.target_price)}` : escapeHtml(row.reason || "Conferir custo/preco")}</em>
    </a>
  `).join("");
}

function pricingTone(row = {}) {
  if (row.severity === "danger") return "danger";
  if (row.severity === "warn") return "warn";
  if (!Number(row.sale_price || 0) || !Number(row.effective_cost || 0)) return "warn";
  if (Number(row.target_price || 0) > 0) return "info";
  if (row.severity === "good") return "good";
  return "muted";
}

function pricingDecisionLabel(row = {}) {
  const tone = pricingTone(row);
  if (tone === "danger") return "Corrigir agora";
  if (tone === "warn") return "Revisar hoje";
  if (tone === "info") return "Simular alvo";
  if (tone === "good") return "Dentro do alvo";
  return "Acompanhar";
}

function pricingPriorityRows(rows = []) {
  return rows
    .slice()
    .sort((a, b) => (
      pricingSeverityRank(a) - pricingSeverityRank(b)
      || Number(b.target_price || 0) - Number(a.target_price || 0)
      || Number(b.revenue || 0) - Number(a.revenue || 0)
    ));
}

function pricingQueueRows(rows = []) {
  const queue = pricingPriorityRows(rows).slice(0, 14);
  if (!queue.length) {
    return `<div class="empty-state action-empty">Sem produtos para revisar no recorte atual.</div>`;
  }
  return queue.map((row) => {
    const tone = pricingTone(row);
    const active = row.product_id === state.selectedPricingProductId ? " active" : "";
    const margin = row.margin_pct === null || row.margin_pct === undefined ? "-" : `${number(row.margin_pct)}%`;
    return `
      <button class="pricing-queue-row tone-${escapeAttr(tone)}${active}" type="button" data-product-id="${escapeAttr(row.product_id)}">
        <span class="status-chip ${escapeAttr(tone)}">${escapeHtml(pricingDecisionLabel(row))}</span>
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(row.role_label || roleText(row.product_role))} - ${money(row.revenue)} no periodo</span>
        <em>Margem ${escapeHtml(margin)} - ${Number(row.target_price || 0) > 0 ? `alvo ${money(row.target_price)}` : escapeHtml(row.reason || "sem alvo sugerido")}</em>
      </button>
    `;
  }).join("");
}

function pricingInspector(row) {
  if (!row) {
    return `
      <div class="pricing-inspector-empty">
        <strong>Nenhum produto selecionado</strong>
        <span>A fila aparece quando existem vendas, custos ou precos importados para analisar.</span>
      </div>
    `;
  }
  const tone = pricingTone(row);
  const margin = row.margin_pct === null || row.margin_pct === undefined ? "-" : `${number(row.margin_pct)}%`;
  const targetDelta = Math.max(0, Number(row.target_price || 0) - Number(row.sale_price || 0));
  const targetImpact = targetDelta * Number(row.quantity || 0);
  const facts = [
    ["Preco ERP", money(row.sale_price)],
    ["Custo efetivo", money(row.effective_cost)],
    ["Margem atual", margin],
    ["Alvo Nexo", Number(row.target_price || 0) > 0 ? money(row.target_price) : "-"],
    ["Receita periodo", money(row.revenue)],
    ["Quantidade", `${number(row.quantity)} un.`],
    ["Papel", row.role_label || roleText(row.product_role)],
    ["Origem do custo", row.cost_origin || "-"],
  ];
  return `
    <div class="pricing-inspector-head tone-${escapeAttr(tone)}">
      <span class="status-chip ${escapeAttr(tone)}">${escapeHtml(pricingDecisionLabel(row))}</span>
      <h3>${escapeHtml(row.name)}</h3>
      <p>${escapeHtml(row.reason || "Produto sem observacao adicional.")}</p>
    </div>
    <dl class="pricing-inspector-facts">
      ${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
    </dl>
    <section class="pricing-inspector-decision">
      <strong>Decisao sugerida</strong>
      <p>${escapeHtml(row.nexo_action || row.signal_label || "Acompanhar margem nas proximas importacoes.")}</p>
      <span>${targetImpact > 0 ? `Potencial estimado no periodo: ${money(targetImpact)}.` : "Sem potencial financeiro calculado para este item."}</span>
    </section>
    <div class="pricing-inspector-actions">
      <button class="action-button" type="button" data-pricing-edit="${escapeAttr(row.product_id)}">Editar custo/papel</button>
      <button class="secondary-button" type="button" data-pricing-product="${escapeAttr(row.product_id)}">Ver mix</button>
    </div>
  `;
}

function pricingRows(rows = []) {
  if (!rows.length) {
    return `<tr><td colspan="9"><strong>Nada para analisar</strong><span class="muted-line">Sem venda ou preco importado no periodo selecionado.</span></td></tr>`;
  }
  return rows
    .map(
      (row) => `
        <tr class="clickable-row pricing-row" data-product-id="${escapeAttr(row.product_id)}">
          <td><span class="status-chip ${escapeAttr(row.severity)}">${escapeHtml(row.signal_label)}</span></td>
          <td>
            <strong class="product-name">${escapeHtml(row.name)}</strong>
            <span class="muted-line">codigo ${escapeHtml(productCode(row.source_code))} - ${number(row.quantity)} un.</span>
          </td>
          <td>${escapeHtml(row.role_label || roleText(row.product_role))}</td>
          <td class="num">${money(row.revenue)}</td>
          <td class="num">${money(row.sale_price)}<span class="muted-line">ERP importado</span></td>
          <td class="num">${money(row.effective_cost)}<span class="muted-line">${escapeHtml(row.cost_origin || "")}</span></td>
          <td class="num ${row.severity === "danger" ? "risk" : row.severity === "good" ? "ok" : ""}">${row.margin_pct === null || row.margin_pct === undefined ? "-" : `${number(row.margin_pct)}%`}</td>
          <td class="num">${Number(row.target_price || 0) > 0 ? money(row.target_price) : "-"}<span class="muted-line">${escapeHtml(row.nexo_action || "")}</span></td>
          <td>${escapeHtml(row.reason || "")}<span class="row-edit-hint">Clique para editar custo/papel do Nexo</span></td>
        </tr>
      `,
    )
    .join("");
}

function renderPricing(payload) {
  state.pricing = payload;
  const rows = payload.rows || [];
  if (!rows.some((row) => row.product_id === state.selectedPricingProductId)) {
    state.selectedPricingProductId = pricingPriorityRows(rows)[0]?.product_id || "";
  }
  renderPricingSummary(payload.summary || {});
  pricingDashboardCharts(payload);
  document.querySelector("#pricingFocus").innerHTML = pricingFocusRows(rows);
  document.querySelector("#pricingQueue").innerHTML = pricingQueueRows(rows);
  document.querySelector("#pricingInspector").innerHTML = pricingInspector(rows.find((row) => row.product_id === state.selectedPricingProductId));
  document.querySelector("#pricingTable").innerHTML = pricingRows(rows);
}

function companyProfileField(field, label, value, options = {}) {
  const tag = options.textarea ? "textarea" : "input";
  const attrs = [
    `class="inline-input${options.className ? ` ${escapeAttr(options.className)}` : ""}"`,
    `id="${escapeAttr(field)}"`,
    `data-company-field="${escapeAttr(field)}"`,
    options.placeholder ? `placeholder="${escapeAttr(options.placeholder)}"` : "",
    options.maxlength ? `maxlength="${escapeAttr(options.maxlength)}"` : "",
  ].filter(Boolean).join(" ");
  const control = tag === "textarea"
    ? `<textarea ${attrs} rows="${options.rows || 3}">${escapeHtml(value || "")}</textarea>`
    : `<input ${attrs} value="${inputValue(value || "")}" />`;
  return `
    <label class="modal-field">
      <span>${escapeHtml(label)}</span>
      ${control}
    </label>
  `;
}

function updateCompanyProfilePreview(body) {
  const profile = {};
  body.querySelectorAll("[data-company-field]").forEach((field) => {
    profile[field.dataset.companyField] = field.value.trim();
  });
  const logo = profile.logo_path || "/logo-practica-transparent.png";
  const name = profile.trade_name || profile.legal_name || "Empresa";
  const address = [profile.address_line, profile.address_number, profile.district, profile.city, profile.state]
    .filter(Boolean)
    .join(", ");
  body.querySelector("#companyPreviewLogo").src = logo;
  body.querySelector("#companyPreviewName").textContent = name;
  body.querySelector("#companyPreviewDoc").textContent = profile.document || "Documento nao informado";
  body.querySelector("#companyPreviewAddress").textContent = address || "Endereco ainda nao preenchido";
}

async function openCompanyProfileModal() {
  let profile;
  try {
    profile = await loadCompanyProfile({ force: true });
  } catch (error) {
    openModal(
      "Perfil da empresa",
      `
        <div class="modal-preview warn">Reinicie o servidor do Nexo para habilitar o cadastro da empresa.</div>
        <div class="modal-actions">
          <button class="secondary-button" type="button" id="companyProfileCancel">Fechar</button>
        </div>
      `,
      (body) => body.querySelector("#companyProfileCancel").addEventListener("click", closeModal),
    );
    return;
  }
  openModal(
    "Perfil da empresa",
    `
      <div class="modal-context">
        <strong>Dados usados em documentos do Nexo</strong>
        <span>Logo, identificacao, endereco e textos padrao para cotacoes, pedidos, relatorios e documentos gerados pela mesa.</span>
      </div>
      <div class="company-profile-layout">
        <section class="company-profile-form">
          <div class="form-grid two">
            ${companyProfileField("trade_name", "Nome fantasia", profile.trade_name, { maxlength: 160 })}
            ${companyProfileField("legal_name", "Razao social", profile.legal_name, { maxlength: 200 })}
            ${companyProfileField("document", "CNPJ / CPF", profile.document, { maxlength: 40, placeholder: "00.000.000/0000-00" })}
            ${companyProfileField("state_registration", "Inscricao estadual", profile.state_registration, { maxlength: 40 })}
            ${companyProfileField("municipal_registration", "Inscricao municipal", profile.municipal_registration, { maxlength: 40 })}
            ${companyProfileField("contact_name", "Responsavel", profile.contact_name, { maxlength: 120 })}
            ${companyProfileField("phone", "Telefone", profile.phone, { maxlength: 60 })}
            ${companyProfileField("email", "E-mail", profile.email, { maxlength: 160 })}
            ${companyProfileField("website", "Site", profile.website, { maxlength: 180 })}
            ${companyProfileField("logo_path", "Logo para documentos", profile.logo_path || "/logo-practica-transparent.png", { maxlength: 220, placeholder: "/logo-practica-transparent.png" })}
          </div>
          <div class="form-grid two">
            ${companyProfileField("address_line", "Endereco", profile.address_line, { maxlength: 200 })}
            ${companyProfileField("address_number", "Numero", profile.address_number, { maxlength: 40 })}
            ${companyProfileField("address_complement", "Complemento", profile.address_complement, { maxlength: 120 })}
            ${companyProfileField("district", "Bairro", profile.district, { maxlength: 120 })}
            ${companyProfileField("city", "Cidade", profile.city, { maxlength: 120 })}
            ${companyProfileField("state", "UF", profile.state, { maxlength: 40 })}
            ${companyProfileField("postal_code", "CEP", profile.postal_code, { maxlength: 30 })}
            ${companyProfileField("country", "Pais", profile.country || "Brasil", { maxlength: 80 })}
          </div>
          ${companyProfileField("document_footer", "Rodape padrao dos documentos", profile.document_footer, { textarea: true, rows: 2, maxlength: 500, placeholder: "Ex.: Obrigado pela preferencia. Valores sujeitos a confirmacao." })}
          ${companyProfileField("default_payment_terms", "Condicoes comerciais padrao", profile.default_payment_terms, { textarea: true, rows: 2, maxlength: 300, placeholder: "Ex.: Pagamento faturado, entrega combinada com compras." })}
          ${companyProfileField("notes", "Observacoes internas", profile.notes, { textarea: true, rows: 3, maxlength: 700 })}
        </section>
        <aside class="company-profile-preview">
          <span>Previa</span>
          <img id="companyPreviewLogo" src="${escapeAttr(companyProfileLogoPath(profile))}" alt="Logo da empresa" />
          <strong id="companyPreviewName">${escapeHtml(companyProfileName(profile) || "Empresa")}</strong>
          <em id="companyPreviewDoc">${escapeHtml(profile.document || "Documento nao informado")}</em>
          <p id="companyPreviewAddress">Endereco ainda nao preenchido</p>
        </aside>
      </div>
      <div class="modal-preview good">Ao salvar, esses dados ficam disponiveis para documentos gerados pelo Nexo.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="companyProfileCancel">Cancelar</button>
        <button class="action-button" type="button" id="companyProfileSave">Salvar perfil</button>
      </div>
      <span class="save-state" id="companyProfileSaveState" aria-live="polite"></span>
    `,
    (body) => {
      const saveState = body.querySelector("#companyProfileSaveState");
      updateCompanyProfilePreview(body);
      body.querySelectorAll("[data-company-field]").forEach((field) => {
        field.addEventListener("input", () => updateCompanyProfilePreview(body));
      });
      body.querySelector("#companyProfileCancel").addEventListener("click", closeModal);
      body.querySelector("#companyProfileSave").addEventListener("click", async () => {
        const payload = {};
        body.querySelectorAll("[data-company-field]").forEach((field) => {
          payload[field.dataset.companyField] = field.value.trim();
        });
        payload.organization_id = profile.organization_id || "";
        saveState.textContent = "Salvando";
        try {
          state.companyProfile = await apiPost("/api/company-profile", payload);
          updateTopbar(document.querySelector(".view.active")?.id || "dashboard");
          renderGeneralMap();
          saveState.textContent = "Perfil salvo";
          setTimeout(closeModal, 450);
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
    { modalClass: "company-profile-modal" },
  );
}

function openQuickActionModal(action) {
  if (!action) return;
  const decisions = action.decisions || ["Registrar decisao"];
  const count = (action.target_ids || []).length;
  openModal(
    action.title || "Registrar decisao",
    `
      <div class="modal-context">
        <strong>${escapeHtml(action.scope || action.label || "Acao rapida")}</strong>
        <span>${action.bulk ? `Edicao em massa: ${number(count)} item(ns) no escopo.` : "Decisao individual capturada para melhorar as proximas recomendacoes."}</span>
      </div>
      <label class="modal-field">
        <span>Decisao</span>
        <select class="inline-input" id="quickDecision">
          ${decisions.map((decision) => `<option value="${escapeAttr(decision)}">${escapeHtml(decision)}</option>`).join("")}
        </select>
      </label>
      <label class="modal-field">
        <span>Observacao para o Nexo aprender</span>
        <textarea class="inline-input quick-note" id="quickNote" rows="4" placeholder="Ex.: fornecedor ja combinado, cliente nao compra mais, produto estrategico mesmo com baixa margem..."></textarea>
      </label>
      <div class="modal-preview good">Esse registro vira memoria operacional no audit log e ajuda a calibrar as proximas acoes.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="quickCancel">Cancelar</button>
        <button class="action-button" type="button" id="quickSave">${action.bulk ? "Salvar em lote" : "Salvar decisao"}</button>
      </div>
      <span class="save-state" id="quickSaveState" aria-live="polite"></span>
    `,
    (body) => {
      const saveState = body.querySelector("#quickSaveState");
      body.querySelector("#quickCancel").addEventListener("click", closeModal);
      body.querySelector("#quickSave").addEventListener("click", async () => {
        saveState.textContent = "Salvando";
        try {
          await apiPost("/api/operational-decisions", {
            action: action.action || "quick_decision",
            target_type: action.target_type || "workspace",
            target_id: action.target_id || "general",
            target_ids: action.target_ids || [],
            decision: body.querySelector("#quickDecision").value,
            notes: body.querySelector("#quickNote").value.trim(),
            scope: action.scope || "",
            source_view: document.querySelector(".view.active")?.id || "",
            applied_to_count: (action.target_ids || []).length || 1,
            metadata: action.metadata || {},
          });
          saveState.textContent = action.bulk ? "Lote registrado" : "Decisao registrada";
          setTimeout(closeModal, 450);
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
  );
}

function marginPreview(price, cost, role) {
  const min = { ancora: 5, commodity: 8, normal: 20, marca_propria: 30 }[role] || 20;
  if (!price || price <= 0) return { label: "Sem preco de venda importado do ERP", cls: "danger" };
  if (!cost || cost <= 0) return { label: "Informe custo para calcular margem", cls: "danger" };
  const margin = ((price - cost) / price) * 100;
  const targetPrice = cost / (1 - min / 100);
  if (margin < 0) return { label: `Margem ${number(margin)}% - sugerir revisao no ERP. Preco alvo Nexo: ${money(targetPrice)}`, cls: "danger" };
  if (margin < min) return { label: `Margem ${number(margin)}% - sugerir revisao no ERP. Preco alvo Nexo: ${money(targetPrice)}`, cls: "warn" };
  return { label: `Margem ${number(margin)}% - preco ERP dentro do alvo ${min}%`, cls: "good" };
}

async function openProductModal(productId) {
  if (!productId) return;
  let detail;
  try {
    detail = await api(`/api/product?id=${encodeURIComponent(productId)}`);
  } catch (error) {
    console.error(error);
    return;
  }
  const productRow = (state.products || []).find((row) => row.id === productId) || {};
  const stockRow = (state.stock || []).find((row) => row.product_id === productId) || {};
  const pricingRow = (state.pricing?.rows || []).find((row) => row.product_id === productId) || {};
  const settings = detail.settings || {};
  const sales = detail.sales_summary || {};
  const decisions = detail.recent_decisions || [];
  const identifiers = detail.identifiers || [];
  const suggestedQty = Number(stockRow.suggested_quantity || 0);
  const stockUnits = detail.stock ?? stockRow.stock_units;
  const salePrice = pricingRow.sale_price ?? detail.sale_price;
  const cost = pricingRow.effective_cost ?? detail.total_cost;
  const margin = pricingRow.margin_pct !== null && pricingRow.margin_pct !== undefined
    ? `${number(pricingRow.margin_pct)}%`
    : Number(salePrice || 0) > 0 && Number(cost || 0) > 0
      ? `${number(((Number(salePrice) - Number(cost)) / Number(salePrice)) * 100)}%`
      : "-";
  const revenue = Number(productRow.revenue || stockRow.revenue || pricingRow.revenue || sales.revenue || 0);
  const quantity = Number(productRow.quantity || sales.quantity || stockRow.demand_total || pricingRow.quantity || 0);
  const coverage = stockRow.coverage_days === null || stockRow.coverage_days === undefined ? "-" : `${number(stockRow.coverage_days)} dias`;
  const packageSize = Number(stockRow.package_size || settings.package_size || 0);
  const mixReview = stockRow.mix_decision_required || stockRow.status === "mix_review";
  let decision = {
    cls: "muted",
    label: "Monitorar",
    title: "Manter em observacao",
    summary: "Nao ha sinal forte de compra, preco ou saneamento para este item agora.",
  };
  if (suggestedQty > 0 && ["urgent", "buy_now"].includes(stockRow.status)) {
    decision = {
      cls: "danger",
      label: "Comprar agora",
      title: "Evitar ruptura",
      summary: `${number(suggestedQty)} un. sugeridas para recompor cobertura.`,
    };
  } else if (mixReview) {
    decision = {
      cls: "warn",
      label: "Decidir mix",
      title: "Nao comprar no automatico",
      summary: stockRow.reason || "O item precisa de uma decisao explicita antes de entrar no fluxo de compras.",
    };
  } else if (Number(productRow.share || 0) >= 1 || stockRow.abc_class === "A") {
    decision = {
      cls: "good",
      label: "Proteger",
      title: "Item relevante para receita",
      summary: `${number(productRow.share || 0)}% da receita exibida no periodo.`,
    };
  } else if (Number(productRow.share || 0) < 0.5 && revenue > 0) {
    decision = {
      cls: "muted",
      label: "Investigar cauda",
      title: "Ver se ainda merece espaco",
      summary: "Baixa participacao no recorte atual. Vale checar estrategia, cadastro e fornecedor.",
    };
  }
  const codes = [
    ["Codigo interno", productCode(detail.source_code), "ERP"],
    ["Referencia fornecedor", detail.supplier_reference || "-", "Manual/ERP"],
    ["Codigo de barras (EAN)", detail.barcode || "-", "ERP"],
  ];
  openModal(
    "Decisao do mix",
    `
      <div class="product-decision">
        <section class="product-decision-hero ${escapeAttr(decision.cls)}">
          <div>
            <span class="status-chip ${escapeAttr(decision.cls)}">${escapeHtml(decision.label)}</span>
            <h3>${escapeHtml(decision.title)}</h3>
            <strong>${escapeHtml(detail.name)}</strong>
            <p>${escapeHtml(decision.summary)}</p>
            <em>${escapeHtml(detail.brand_name || "Sem marca")} - ${escapeHtml(stockRow.supplier_name || productRow.supplier_name || "Sem fornecedor")} - Unidade ${escapeHtml(detail.unit || "UN")}</em>
          </div>
          <div class="product-decision-actions">
            <button class="action-button" type="button" id="productOpenQuotes">Compras</button>
            <button class="secondary-button" type="button" id="productOpenPricing" ${pricingRow.product_id ? "" : "disabled"}>Precos</button>
          </div>
        </section>

        <div class="product-decision-grid">
          <section class="product-decision-card">
            <h4>Mix e estoque</h4>
            <dl>
              <dt>Status compra</dt><dd>${escapeHtml(stockRow.status_label || stockRow.status || "-")}</dd>
              <dt>Estoque</dt><dd>${stockUnits === null || stockUnits === undefined ? "-" : `${number(stockUnits)} ${escapeHtml(detail.unit || "UN")}`}</dd>
              <dt>Cobertura</dt><dd>${coverage}</dd>
              <dt>Sugestao</dt><dd>${suggestedQty > 0 ? `${number(suggestedQty)} un.` : "-"}</dd>
              <dt>ABC</dt><dd>${escapeHtml(stockRow.abc_class || "-")}</dd>
            </dl>
          </section>
          <section class="product-decision-card">
            <h4>Venda</h4>
            <dl>
              <dt>Receita periodo</dt><dd>${revenue ? money(revenue) : "-"}</dd>
              <dt>Participacao</dt><dd>${productRow.share === undefined ? "-" : `${number(productRow.share)}%`}</dd>
              <dt>Quantidade vendida</dt><dd>${quantity ? `${number(quantity)} un.` : "-"}</dd>
              <dt>Maior venda</dt><dd>${sales.max_single_sale ? `${number(sales.max_single_sale)} un.` : "-"}</dd>
              <dt>Ultima venda</dt><dd>${escapeHtml(sales.last_sale_at || "-")}</dd>
            </dl>
          </section>
          <section class="product-decision-card">
            <h4>Preco e margem</h4>
            <dl>
              <dt>Venda ERP</dt><dd>${salePrice == null ? "-" : money(salePrice)}</dd>
              <dt>Custo efetivo</dt><dd>${cost == null ? "-" : money(cost)}</dd>
              <dt>Margem</dt><dd>${escapeHtml(margin)}</dd>
              <dt>Papel</dt><dd>${escapeHtml(pricingRow.role_label || roleText(pricingRow.product_role))}</dd>
              <dt>Sinal</dt><dd>${escapeHtml(pricingRow.signal_label || pricingRow.reason || "-")}</dd>
            </dl>
          </section>
          <section class="product-decision-card">
            <h4>Operacao</h4>
            <dl>
              <dt>Embalagem</dt><dd>${packageSize > 1 ? `${number(packageSize)} un. por caixa` : "Unidade"}</dd>
              <dt>Alvo cobertura</dt><dd>${settings.target_coverage_days ? `${number(settings.target_coverage_days)} dias` : "-"}</dd>
              <dt>Compra bloqueada</dt><dd>${Number(settings.blocked_for_purchase || 0) ? "Sim" : "Nao"}</dd>
              <dt>Validade</dt><dd>${Number(settings.expires || 0) ? "Sim" : "Nao"}</dd>
              <dt>Peso</dt><dd>${settings.weight ? `${number(settings.weight)} kg` : "-"}</dd>
            </dl>
          </section>
        </div>

        <section class="product-decision-card product-decision-wide">
          <h4>Codigos e fornecedor</h4>
          <div class="product-modal-codes">
            ${codes
              .map(
                ([label, value, source]) => `
              <div class="product-code-item">
                <span class="product-code-label">${label}</span>
                <strong class="product-code-value">${escapeHtml(value || "-")}</strong>
                <span class="product-code-source">${source}</span>
              </div>
            `,
              )
              .join("")}
          </div>
          <label class="modal-field">
            <span>Referencia do fornecedor (manual, opcional)</span>
            <input class="inline-input" id="productRefInput" type="text" maxlength="120" value="${inputValue(detail.supplier_reference)}" placeholder="codigo que o fornecedor usa para este produto" />
          </label>
          <div class="product-identifiers">
            ${identifiers.length ? identifiers.map((item) => `<span>${escapeHtml(item.identifier_type)}: <strong>${escapeHtml(item.identifier_value)}</strong></span>`).join("") : "<span>Nenhum identificador adicional.</span>"}
          </div>
        </section>

        <section class="product-decision-card product-decision-wide">
          <h4>Memoria e proxima decisao</h4>
          <div class="product-decision-log">
            ${decisions.length ? decisions.map((item) => `<span><strong>${escapeHtml(item.decision_value || item.decision_type)}</strong>${item.notes ? ` - ${escapeHtml(item.notes)}` : ""}<em>${escapeHtml(item.created_at || "")}</em></span>`).join("") : "<span>Nenhuma decisao operacional registrada para este produto.</span>"}
          </div>
          <div class="product-decision-register">
            <label class="modal-field">
              <span>Registrar decisao</span>
              <select class="inline-input" id="productDecisionSelect">
                <option value="Manter no mix">Manter no mix</option>
                <option value="Comprar agora">Comprar agora</option>
                <option value="Pausar compra">Pausar compra</option>
                <option value="Revisar preco">Revisar preco</option>
                <option value="Investigar cadastro">Investigar cadastro</option>
              </select>
            </label>
            <label class="modal-field">
              <span>Observacao</span>
              <textarea class="inline-input quick-note" id="productDecisionNote" rows="3" placeholder="Contexto para a proxima pessoa que abrir este item"></textarea>
            </label>
          </div>
        </section>

        <div class="modal-actions split-actions">
          <span class="save-state" id="productSaveState" aria-live="polite"></span>
          <div>
            <button class="secondary-button" type="button" id="productCancel">Fechar</button>
            <button class="secondary-button" type="button" id="productDecisionSave">Registrar decisao</button>
            <button class="action-button" type="button" id="productSave">Salvar referencia</button>
          </div>
        </div>
      </div>
    `,
    (body) => {
      const refInput = body.querySelector("#productRefInput");
      const saveState = body.querySelector("#productSaveState");
      body.querySelector("#productCancel").addEventListener("click", closeModal);
      body.querySelector("#productOpenQuotes").addEventListener("click", async () => {
        closeModal();
        setView("quotes");
        if (!stockRow.supplier_id) return;
        try {
          setQuoteMode("operational");
          await loadQuoteSupplierWorkbench(stockRow.supplier_id);
          setTimeout(() => openQuoteProductDrawer(productId), 0);
        } catch (error) {
          console.error(error);
        }
      });
      body.querySelector("#productOpenPricing")?.addEventListener("click", () => {
        closeModal();
        setView("pricing");
        setTimeout(() => openPricingModal(productId), 0);
      });
      body.querySelector("#productDecisionSave").addEventListener("click", async () => {
        saveState.textContent = "Registrando decisao";
        try {
          await apiPost("/api/operational-decisions", {
            organization_id: detail.organization_id,
            action: "product_mix_decision",
            target_type: "product",
            target_id: detail.id,
            decision: body.querySelector("#productDecisionSelect").value,
            notes: body.querySelector("#productDecisionNote").value.trim(),
            scope: detail.name,
            source_view: "products",
            applied_to_count: 1,
            metadata: {
              product_id: detail.id,
              source_code: detail.source_code,
              suggested_quantity: suggestedQty,
              status: stockRow.status || "",
            },
          });
          saveState.textContent = "Decisao registrada";
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
      body.querySelector("#productSave").addEventListener("click", async () => {
        saveState.textContent = "Salvando";
        try {
          await apiPost("/api/products/supplier-reference", {
            organization_id: detail.organization_id,
            product_id: detail.id,
            value: refInput.value.trim(),
          });
          saveState.textContent = "Salvo";
          closeModal();
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
    { modalClass: "product-decision-modal" },
  );
}

function openPricingModal(productId) {
  const row = (state.pricing?.rows || []).find((item) => item.product_id === productId);
  if (!row) return;
  openModal(
    "Sinal de precificacao",
    `
      <div class="modal-context">
        <strong>${escapeHtml(row.name)}</strong>
        <span>Preco ERP ${money(row.sale_price)} - somente leitura. O Nexo nao altera preco de venda; ele sugere revisao para executar no ERP.</span>
      </div>
      <div class="modal-preview muted">Na proxima importacao, o Nexo confere se o ERP trouxe o preco revisado.</div>
      <label class="modal-field">
        <span>Custo manual no Nexo</span>
        <input class="inline-input" id="pricingCostInput" type="text" inputmode="decimal" value="${inputValue(row.manual_cost ?? row.effective_cost)}" />
      </label>
      <label class="modal-field">
        <span>Papel do produto</span>
        <select class="inline-input" id="pricingRoleInput">
          ${["normal", "ancora", "commodity", "marca_propria"].map((role) => `<option value="${role}" ${role === row.product_role ? "selected" : ""}>${roleText(role)}</option>`).join("")}
        </select>
      </label>
      <div class="modal-preview" id="pricingPreview"></div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="pricingCancel">Cancelar</button>
        <button class="action-button" type="button" id="pricingSave">Salvar</button>
      </div>
      <span class="save-state" id="pricingSaveState" aria-live="polite"></span>
    `,
    (body) => {
      const costInput = body.querySelector("#pricingCostInput");
      const roleInput = body.querySelector("#pricingRoleInput");
      const preview = body.querySelector("#pricingPreview");
      const refreshPreview = () => {
        const result = marginPreview(Number(row.sale_price || 0), parseInputNumber(costInput.value), roleInput.value);
        preview.className = `modal-preview ${result.cls}`;
        preview.textContent = result.label;
      };
      refreshPreview();
      costInput.addEventListener("input", refreshPreview);
      roleInput.addEventListener("change", refreshPreview);
      body.querySelector("#pricingCancel").addEventListener("click", closeModal);
      body.querySelector("#pricingSave").addEventListener("click", async () => {
        const save = body.querySelector("#pricingSaveState");
        save.textContent = "Salvando";
        try {
          await apiPost("/api/pricing/product", {
            organization_id: row.organization_id,
            product_id: row.product_id,
            cost_price: costInput.value.trim(),
            product_role: roleInput.value,
          });
          renderPricing(await apiContract(`/api/pricing${periodQuery()}`, "pricing.v1"));
          closeModal();
        } catch (error) {
          save.textContent = error.message;
        }
      });
    },
  );
}

function supplierChoices() {
  const seen = new Map();
  (state.suppliers || []).forEach((row) => {
    const key = (row.supplier_name || "").trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.set(key, {
      name: row.supplier_name || "",
      phone: row.contact_phone || "",
      minimum: row.minimum_order_value || "",
    });
  });
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function openSupplierModal(brandId, actionToComplete = null) {
  const row = (state.suppliers || []).find((item) => item.brand_id === brandId);
  if (!row) return;
  const options = supplierChoices();
  openModal(
    "Fornecedor da marca",
    `
      <div class="modal-context">
        <strong>${escapeHtml(row.brand_name)}</strong>
        <span>${number(row.product_count)} produtos - ${escapeHtml(row.supplier_rule_label || "")}</span>
      </div>
      <label class="modal-field">
        <span>Fornecedor</span>
        <input class="inline-input" id="supplierNameInput" list="supplierNameOptions" value="${inputValue(row.supplier_name)}" />
        <datalist id="supplierNameOptions">
          ${options.map((item) => `<option value="${escapeAttr(item.name)}"></option>`).join("")}
        </datalist>
      </label>
      <label class="modal-field">
        <span>Telefone para cotacao</span>
        <input class="inline-input" id="supplierPhoneInput" value="${inputValue(row.contact_phone)}" placeholder="(00) 00000-0000" />
      </label>
      <label class="modal-field">
        <span>Pedido minimo</span>
        <input class="inline-input" id="supplierMinimumInput" inputmode="decimal" value="${inputValue(row.minimum_order_value || "")}" placeholder="0,00" />
      </label>
      <div class="modal-preview good">Ao salvar, a marca passa a usar esse fornecedor nas cotacoes e reposicao do Nexo.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="supplierCancel">Cancelar</button>
        <button class="action-button" type="button" id="supplierSave">Salvar</button>
      </div>
      <span class="save-state" id="supplierSaveState" aria-live="polite"></span>
    `,
    (body) => {
      const nameInput = body.querySelector("#supplierNameInput");
      const phoneInput = body.querySelector("#supplierPhoneInput");
      const minimumInput = body.querySelector("#supplierMinimumInput");
      nameInput.addEventListener("change", () => {
        const match = options.find((item) => item.name.toLowerCase() === nameInput.value.trim().toLowerCase());
        if (!match) return;
        if (!phoneInput.value.trim()) phoneInput.value = match.phone || "";
        if (!minimumInput.value.trim() || Number(minimumInput.value) === 0) minimumInput.value = match.minimum || "";
      });
      body.querySelector("#supplierCancel").addEventListener("click", closeModal);
      body.querySelector("#supplierSave").addEventListener("click", async () => {
        const save = body.querySelector("#supplierSaveState");
        save.textContent = "Salvando";
        try {
          const result = await apiPost("/api/suppliers/brand", {
            organization_id: row.organization_id,
            brand_id: row.brand_id,
            supplier_name: nameInput.value.trim(),
            contact_phone: phoneInput.value.trim(),
            minimum_order_value: minimumInput.value.trim(),
          });
          state.suppliers = state.suppliers.map((item) => item.brand_id === result.brand_id
            ? {
                ...item,
                supplier_id: result.supplier_id,
                supplier_name: result.supplier_name,
                contact_phone: result.contact_phone,
                minimum_order_value: result.minimum_order_value,
                supplier_rule_origin: "manual",
                supplier_rule_label: "Confirmado no Nexo",
              }
            : item);
          if (actionToComplete) await apiPost("/api/actions/status", { id: actionToComplete.id, status: "completed" });
          closeModal();
          deferAfterPaint(() => {
            renderSuppliers();
            renderNavBadges();
            refreshAfterSave(
              { suppliers: true, replenishment: true, quotes: true, actions: true, maturity: Boolean(actionToComplete) },
              { defer: true, delay: 250 },
            );
          });
        } catch (error) {
          save.textContent = error.message;
        }
      });
    },
  );
}

function renderNavBadges() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    const label = viewLabel(button.dataset.view);
    button.dataset.label = label;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<span class="nav-label"><i data-lucide="${NAV_ICONS[button.dataset.view] || "circle"}"></i><span>${escapeHtml(label)}</span></span>`;
  });
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

async function loadPeriodWorkspaceData() {
  const [summary, products, replenishment, commercial, customers, services, pricing] = await Promise.all([
    apiContract(`/api/summary${periodQuery()}`, "summary.v1"),
    apiRows(
      `/api/products/top${periodQuery()}`,
      ["id", "organization_id", "source_code", "name", "quantity", "revenue", "share"],
      "products_top.v1",
    ),
    apiContract(`/api/replenishment${periodQuery()}`, "replenishment.v1"),
    apiContract(`/api/commercial/intelligence${periodQuery()}`, "commercial_intelligence.v1"),
    apiRows(`/api/customers/top${periodQuery()}`, ["name", "purchases", "last_purchase", "revenue"], "customers_top.v1"),
    apiRows(`/api/services/top${periodQuery()}`, ["name", "quantity", "revenue", "net_revenue"], "services_top.v1"),
    apiContract(`/api/pricing${periodQuery()}`, "pricing.v1"),
  ]);
  return { summary, products, replenishment, commercial, customers, services, pricing };
}

function applyPeriodWorkspaceData(payload) {
  const { summary, products, replenishment, commercial, customers, services, pricing } = payload;
  state.summary = summary;
  state.products = products;
  state.replenishment = replenishment;
  state.stock = replenishment.rows;
  state.commercial = commercial;
  state.customers = customers;
  state.services = services;
  state.pricing = pricing;
  renderKpis(summary.kpis);
  renderMonthly(summary.monthly);
  renderReplenishmentSummary(replenishment.summary);
  renderStockDecisionQueue(replenishment.rows);
  renderProducts(products);
  document.querySelector("#stockTable").innerHTML = stockRows(replenishment.rows);
  renderCommercial(commercial);
  renderPricing(pricing);
  renderCustomers(customers);
  renderServices(services);
  document.querySelector("#periodLabel").textContent = summary.period?.label || "Periodo";
  renderGeneralMap({ summary, products, replenishment, quoteSuppliers: state.quoteSuppliers, customers, pricing, imports: state.imports, services });
  renderNavBadges();
}

async function refreshPeriodData() {
  applyPeriodWorkspaceData(await loadPeriodWorkspaceData());
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function erpFieldOptions(selected, options = []) {
  return options.map((option) => {
    const value = `${option.entity}:${option.field}`;
    return `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>`;
  }).join("");
}

function renderErpManualConflicts(conflicts = []) {
  state.erpManualConflicts = conflicts;
  const target = document.querySelector("#erpManualConflicts");
  if (!target) return;
  if (!conflicts.length) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = `
    <div class="erp-conflict-card">
      <strong>${number(conflicts.length)} divergencia(s) com dados manuais</strong>
      <span>Escolha qual fonte deve prevalecer antes de gravar a importacao.</span>
      <div class="erp-conflict-bulk">
        <button class="secondary-button" type="button" data-conflict-bulk="manual">Manter manual em todas</button>
        <button class="secondary-button" type="button" data-conflict-bulk="erp">Usar ERP em todas</button>
      </div>
      <div class="erp-conflict-list">
        ${conflicts.map((item) => `
          <div class="erp-conflict-row">
            <div>
              <strong>${escapeHtml(item.product_name || item.product_code || "Produto")}</strong>
              <span>${escapeHtml(item.field_label || item.field || "Campo")} - linha ${number(item.row_number)}${item.sheet_name ? ` - ${escapeHtml(item.sheet_name)}` : ""}</span>
              <em>Manual: ${escapeHtml(item.manual_value || "-")} | ERP: ${escapeHtml(item.erp_value || "-")}</em>
            </div>
            <div class="erp-priority-choice">
              <label><input type="radio" name="erpConflict_${escapeAttr(item.key)}" value="manual" data-conflict-key="${escapeAttr(item.key)}" checked /> Manter manual</label>
              <label><input type="radio" name="erpConflict_${escapeAttr(item.key)}" value="erp" data-conflict-key="${escapeAttr(item.key)}" /> Usar ERP</label>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  target.querySelectorAll("[data-conflict-bulk]").forEach((button) => {
    button.addEventListener("click", () => setErpConflictPriority(button.dataset.conflictBulk || "manual"));
  });
}

function setErpConflictPriority(priority) {
  document.querySelectorAll("input[data-conflict-key]").forEach((input) => {
    input.checked = input.value === priority;
  });
}

function collectErpManualConflictChoices() {
  const choices = {};
  (state.erpManualConflicts || []).forEach((item) => {
    const selected = Array.from(document.querySelectorAll("input[data-conflict-key]")).find((input) => input.dataset.conflictKey === item.key && input.checked);
    choices[item.key] = selected?.value || "manual";
  });
  return choices;
}

function renderErpImportPreview(payload) {
  state.erpImport = payload;
  state.erpManualConflicts = [];
  const summary = payload.summary || {};
  const reused = Number(summary.reused_mappings || 0);
  document.querySelector("#erpImportStatus").textContent = `${payload.file_name} analisado: ${number(summary.rows)} linhas, ${number(summary.columns)} colunas, ${number(summary.required_review)} campos para revisar${reused ? `, ${number(reused)} mapeamentos reaproveitados` : ""}.`;
  const options = payload.field_options || [];
  const sheetCards = (payload.sheets || []).map((sheet, sheetIndex) => {
    const columnRows = (sheet.columns || []).map((column) => {
      const suggestion = column.suggestion || {};
      const selected = `${suggestion.entity || "ignorar"}:${suggestion.field || "ignorar"}`;
      const confidence = Number(suggestion.confidence || 0);
      const confidenceLabel = confidence >= 80 ? "Alta" : confidence >= 55 ? "Media" : "Baixa";
      return `
        <tr>
          <td>
            <strong>${escapeHtml(column.header)}</strong>
            <span class="muted-line">${escapeHtml(column.value_type)} - exemplos: ${escapeHtml((column.samples || []).slice(0, 3).join(" | ") || "-")}</span>
          </td>
          <td>
            <select class="inline-input erp-map-select" data-sheet="${sheetIndex}" data-column="${column.index}">
              ${erpFieldOptions(selected, options)}
            </select>
          </td>
          <td><span class="status-chip ${confidence >= 80 ? "good" : confidence >= 55 ? "warn" : "danger"}">${confidenceLabel}</span></td>
        </tr>
      `;
    }).join("");
    return `
      <div class="info-card erp-sheet-card">
        <strong>${escapeHtml(sheet.sheet_name)} - ${escapeHtml(sheet.dominant_entity || "nao identificado")}</strong>
        <span>${number(sheet.row_count)} linhas validas, cabecalho na linha ${number(sheet.header_line)}, ${number(sheet.column_count)} colunas.</span>
        <div class="table-wrap erp-map-table">
          <table>
            <thead><tr><th>Coluna da planilha</th><th>Catalogar como</th><th>Confianca</th></tr></thead>
            <tbody>${columnRows || `<tr><td colspan="3">Nenhuma coluna reconhecida.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join("");
  document.querySelector("#erpImportPreview").innerHTML = `<div id="erpManualConflicts"></div>${sheetCards}`;
  renderErpManualConflicts([]);
  document.querySelector("#erpImportConfirm").disabled = false;
}

async function analyzeErpImportFile() {
  const input = document.querySelector("#erpImportFile");
  const status = document.querySelector("#erpImportStatus");
  const button = document.querySelector("#erpImportAnalyze");
  const file = input?.files?.[0];
  if (!file) {
    status.textContent = "Selecione uma planilha exportada do ERP.";
    return;
  }
  button.disabled = true;
  status.textContent = "Analisando arquivo...";
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    state.erpImportFile = file;
    state.erpImportPayload = { file_name: file.name };
    renderErpImportPreview(await apiPostForm("/api/erp/import-preview", formData));
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel analisar a planilha.";
  } finally {
    button.disabled = false;
  }
}

function confirmedErpMappings() {
  if (!state.erpImport) return;
  return (state.erpImport.sheets || []).map((sheet, sheetIndex) => ({
    sheet_index: sheetIndex,
    sheet_name: sheet.sheet_name,
    signature: sheet.signature,
    columns: (sheet.columns || []).map((column) => {
      const select = document.querySelector(`.erp-map-select[data-sheet="${sheetIndex}"][data-column="${column.index}"]`);
      const [entity, field] = (select?.value || "ignorar:ignorar").split(":");
      const label = select?.selectedOptions?.[0]?.textContent || "Ignorar / nao mapeado";
      return { index: column.index, header: column.header, entity, field, label };
    }),
  }));
}

function erpImportFormData({ conflictCheckOnly = false, manualChoices = null } = {}) {
  const formData = new FormData();
  formData.append("file", state.erpImportFile, state.erpImportFile.name);
  const updateToggle = document.querySelector("#erpImportUpdateMode");
  formData.append("import_mode", updateToggle ? (updateToggle.checked ? "configured_update" : "configured_refresh") : "configured_update");
  formData.append("mappings", JSON.stringify(confirmedErpMappings()));
  if (conflictCheckOnly) formData.append("conflict_check_only", "1");
  if (manualChoices) formData.append("manual_conflict_choices", JSON.stringify(manualChoices));
  return formData;
}

async function confirmErpImportMapping() {
  if (!state.erpImport || !state.erpImportFile) return;
  const button = document.querySelector("#erpImportConfirm");
  const status = document.querySelector("#erpImportStatus");
  button.disabled = true;
  status.textContent = "Conferindo divergencias manuais...";
  try {
    if (!(state.erpManualConflicts || []).length) {
      const check = await apiPostForm("/api/erp/import-commit", erpImportFormData({ conflictCheckOnly: true }));
      if (check.requires_manual_resolution) {
        renderErpManualConflicts(check.manual_conflicts || []);
        status.textContent = `${number((check.manual_conflicts || []).length)} divergencia(s) encontradas. Escolha a prioridade de cada campo e clique em confirmar novamente.`;
        return;
      }
    }
    status.textContent = "Gravando lote importado...";
    const manualChoices = collectErpManualConflictChoices();
    const result = await apiPostForm("/api/erp/import-commit", erpImportFormData({ manualChoices }));
    state.imports = result.imports;
    renderErpManualConflicts([]);
    renderImports(result.imports);
    const costCount = Number(result.summary.cost_snapshots_imported || 0);
    const identifierCount = Number(result.summary.identifiers_imported || 0);
    const settingsCount = Number(result.summary.product_settings_imported || 0);
    const supplierCount = Number(result.summary.supplier_profiles_imported || 0);
    const preservedCount = Number(result.summary.manual_values_preserved || 0);
    const resolvedCount = Number(result.summary.manual_conflicts_resolved || 0);
    const impact = erpImportImpactText(result.summary || {});
    status.textContent = `Lote ${result.batch_id} gravado: ${number(result.summary.mapped_rows)} linhas lidas${impact ? `; impacto: ${impact}` : ""}${supplierCount ? `, ${number(supplierCount)} fornecedor(es) atualizados` : ""}${identifierCount ? `, ${number(identifierCount)} identificadores salvos` : ""}${settingsCount ? `, ${number(settingsCount)} configuracoes importadas` : ""}${resolvedCount ? `, ${number(resolvedCount)} divergencias decididas` : ""}${preservedCount ? ` (${number(preservedCount)} manuais preservados)` : ""}. Este mapeamento sera sugerido nas proximas planilhas com a mesma estrutura.`;
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel gravar o lote.";
  } finally {
    button.disabled = false;
  }
}

function importPlanStatus(item) {
  const coverage = item.coverage || {};
  if (item.priority === "dispensado") return { label: "Dispensado", cls: "neutral" };
  if (item.id === "products_prices_stock") {
    if (coverage.products && coverage.products_with_price && coverage.products_with_stock) return { label: "Coberto", cls: "good" };
    if (coverage.products || coverage.products_with_price || coverage.products_with_stock) return { label: "Parcial", cls: "warn" };
    return { label: "Faltando", cls: "danger" };
  }
  if (item.id === "purchase_costs") {
    return coverage.products_with_cost ? { label: "Coberto", cls: "good" } : { label: "Faltando", cls: "danger" };
  }
  if (item.id === "product_sales") {
    if (coverage.rows && Number(coverage.sales_months || 0) >= 3) return { label: "Coberto", cls: "good" };
    if (coverage.rows) return { label: "Pouco historico", cls: "warn" };
    return { label: "Faltando", cls: "danger" };
  }
  if (item.id === "services") {
    return coverage.rows ? { label: "Coberto", cls: "good" } : { label: "Opcional pendente", cls: "warn" };
  }
  if (item.id === "supplier_identifiers") {
    if (coverage.products_with_supplier_reference && coverage.suppliers) return { label: "Coberto", cls: "good" };
    if (coverage.products_with_supplier_reference || coverage.suppliers) return { label: "Parcial", cls: "warn" };
    return { label: "Recomendado", cls: "warn" };
  }
  if (item.id === "operational_settings") {
    return coverage.products_with_package ? { label: "Importavel", cls: "good" } : { label: "Pode importar", cls: "warn" };
  }
  if (item.id === "nexo_derived") {
    return { label: "Calculado", cls: "neutral" };
  }
  if (item.priority === "ambicioso") {
    return coverage.stage ? { label: "Preparar fonte", cls: "warn" } : { label: "Mapear depois", cls: "warn" };
  }
  return { label: "A avaliar", cls: "warn" };
}

function importCoverageStats(item) {
  const coverage = item.coverage || {};
  const stats = {
    products_prices_stock: [
      ["Produtos", number(coverage.products)],
      ["Com preco", `${number(coverage.products_with_price)} (${number(coverage.price_pct)}%)`],
      ["Com estoque", `${number(coverage.products_with_stock)} (${number(coverage.stock_pct)}%)`],
      ["Com barras", `${number(coverage.products_with_barcode)} (${number(coverage.barcode_pct)}%)`],
    ],
    purchase_costs: [
      ["Produtos com custo", `${number(coverage.products_with_cost)} (${number(coverage.cost_pct)}%)`],
    ],
    product_sales: [
      ["Linhas de venda", number(coverage.rows)],
      ["Produtos vendidos", number(coverage.products_with_sales)],
      ["Meses", number(coverage.sales_months)],
    ],
    services: [
      ["Linhas de servico", number(coverage.rows)],
      ["Servicos", number(coverage.services)],
    ],
    supplier_identifiers: [
      ["Refs. fornecedor", `${number(coverage.products_with_supplier_reference)} (${number(coverage.supplier_reference_pct)}%)`],
      ["Fornecedores", number(coverage.suppliers)],
    ],
    deprecated_profit: [
      ["Arquivos ativos", number(coverage.deprecated_files)],
    ],
    operational_settings: [
      ["Com embalagem", `${number(coverage.products_with_package)} (${number(coverage.package_pct)}%)`],
      ["Refs. fornecedor", number(coverage.products_with_supplier_reference)],
    ],
    nexo_derived: [
      ["Origem", coverage.stage || "Nexo"],
    ],
    purchase_history: [
      ["Estagio", coverage.stage || "capturar"],
    ],
    fiscal_documents: [
      ["Estagio", coverage.stage || "auditar"],
    ],
    inventory_movements: [
      ["Estagio", coverage.stage || "reconciliar"],
    ],
    customer_commercial: [
      ["Clientes", number(coverage.customers)],
    ],
    financial_titles: [
      ["Estagio", coverage.stage || "cruzar"],
    ],
    sales_context: [
      ["Estagio", coverage.stage || "enriquecer"],
    ],
    product_master_data: [
      ["Produtos", number(coverage.products)],
    ],
  };
  return stats[item.id] || [];
}

function renderImportDataGuide(readiness = {}) {
  const target = document.querySelector("#importDataGuide");
  if (!target) return;
  const plan = readiness.plan || [];
  if (!plan.length) {
    target.innerHTML = `<div class="info-card"><strong>Mapa ainda vazio</strong><span>Quando a API responder a cobertura, o guia de importacao aparece aqui.</span></div>`;
    return;
  }
  target.innerHTML = plan.map((item) => {
    const status = importPlanStatus(item);
    const expected = (item.expected_files || []).join(", ");
    const fields = (item.what_to_send || []).slice(0, 14).join(", ");
    const uses = (item.used_for || []).join(", ");
    const stats = importCoverageStats(item);
    return `
      <article class="import-guide-card ${escapeAttr(item.priority)}">
        <div class="import-guide-head">
          <div>
            <span class="import-priority">${escapeHtml(item.priority || "dados")}</span>
            <strong>${escapeHtml(item.title || "")}</strong>
          </div>
          <span class="status-chip ${escapeAttr(status.cls)}">${escapeHtml(status.label)}</span>
        </div>
        <div class="import-guide-stats">
          ${stats.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
        </div>
        <dl class="import-guide-detail">
          <div><dt>Fontes esperadas</dt><dd>${escapeHtml(expected || "Nao enviar")}</dd></div>
          <div><dt>Campos uteis</dt><dd>${escapeHtml(fields || "Dispensado no fluxo atual")}</dd></div>
          <div><dt>Uso no Nexo</dt><dd>${escapeHtml(uses || "-")}</dd></div>
        </dl>
      </article>
    `;
  }).join("");
}

function setImportMode(mode) {
  setModuleMode({
    stateKey: "importMode",
    modeAttr: "data-import-mode",
    operationalSelector: "#importOperational",
    dashboardSelector: "#importDashboard",
  }, mode);
}

function importDashboardRows(items, valueKey = "value", valueFormatter = number) {
  return dashboardChartRows(items, {
    valueKey,
    valueFormatter,
    rowClass: "import-chart-row",
    attrsFor: (item) => item.mode ? ` data-import-mode-target="${escapeAttr(item.mode)}"` : "",
  });
}

function importDashboardCharts(payload = state.imports || {}) {
  const readiness = payload.readiness || {};
  const quality = payload.quality || {};
  const qualitySummary = quality.summary || {};
  const plan = readiness.plan || [];
  const batches = payload.batches || [];
  const issues = payload.issues || [];
  const changes = payload.changes || [];
  const covered = plan.filter((item) => importPlanStatus(item).cls === "good").length;
  const warning = plan.filter((item) => importPlanStatus(item).cls === "warn").length;
  const missing = plan.filter((item) => importPlanStatus(item).cls === "danger").length;
  const usablePlan = plan.filter((item) => item.priority !== "dispensado");
  const healthPct = usablePlan.length ? (covered / usablePlan.length) * 100 : 0;
  const priorityRows = ["essencial", "recomendado", "ambicioso", "travado"]
    .map((priority) => ({ label: priority, value: plan.filter((item) => item.priority === priority).length }));
  const statusRows = [
    { label: "Coberto", value: covered, mode: "dashboard" },
    { label: "Parcial / recomendado", value: warning, mode: "dashboard" },
    { label: "Faltando", value: missing, mode: "dashboard" },
    { label: "Issues", value: issues.length, mode: "operational" },
  ];
  const latest = batches[0] || {};
  return `
    <article class="import-dashboard-card">
      <div>
        <span>Confianca do lote</span>
        <strong>${number(quality.score || healthPct)}%</strong>
        <p>${quality.latest_batch_id ? `${escapeHtml(quality.status || "-")} - ${escapeHtml(quality.next_step || "")}` : `${number(covered)} de ${number(usablePlan.length)} blocos uteis aparecem cobertos no mapa atual.`}</p>
      </div>
      <div class="import-donut" style="--value: ${Math.max(0, Math.min(100, quality.score || healthPct))}">
        <span>${number(quality.score || healthPct)}%</span>
      </div>
    </article>
    <article class="import-dashboard-card">
      <div>
        <span>Ultimo lote</span>
        <strong>${escapeHtml(latest.status || "-")}</strong>
        <p>${latest.id ? `${escapeHtml(importBatchFileNames(latest).join(", ") || latest.id)} · ${escapeHtml(shortDateTime(latest.started_at || latest.finished_at) || "-")}` : "Nenhum lote registrado ainda."}</p>
      </div>
    </article>
    <article class="import-chart-card">
      <header><strong>Cobertura por situacao</strong><span>Clique em issues para abrir a mesa operacional</span></header>
      <div class="import-chart">${importDashboardRows(statusRows)}</div>
    </article>
    <article class="import-chart-card">
      <header><strong>Reconciliacao do lote</strong><span>Linhas, conflitos e mudancas pendentes</span></header>
      <div class="import-chart">${importDashboardRows([
        { label: "Lidas", value: Number(qualitySummary.rows || 0), mode: "dashboard" },
        { label: "Mapeadas", value: Number(qualitySummary.mapped_rows || 0), mode: "dashboard" },
        { label: "Sem mapa", value: Number(qualitySummary.unmapped_rows || 0), mode: "operational" },
        { label: "Conflitos", value: Number(qualitySummary.manual_conflicts_pending || 0), mode: "operational" },
      ])}</div>
    </article>
    <article class="import-chart-card">
      <header><strong>Ambicao dos dados</strong><span>Quantos blocos o Nexo quer por prioridade</span></header>
      <div class="import-chart">${importDashboardRows(priorityRows)}</div>
    </article>
    <article class="import-dashboard-card">
      <div>
        <span>Auditoria recente</span>
        <strong>${number(changes.length)}</strong>
        <p>Mudanca(s) detectadas em dados vindos do ERP. Use isso para revisar preco, custo e cadastro.</p>
      </div>
    </article>
    <article class="import-dashboard-card wide">
      <div>
        <span>Insight do Nexo</span>
        <strong>Importacao boa nasce de dado primario amplo</strong>
        <p>Priorize produtos, estoque, venda, custos e identificadores. Depois, traga configuracoes manuais importaveis e dados fiscais/compras para reduzir decisao feita fora do sistema.</p>
      </div>
    </article>
  `;
}

async function analyzeLinkImportFile() {
  const input = document.querySelector("#linkImportFile");
  const status = document.querySelector("#linkImportStatus");
  const preview = document.querySelector("#linkImportPreview");
  const button = document.querySelector("#linkImportAnalyze");
  const file = input?.files?.[0];
  if (!file) {
    status.textContent = "Selecione uma planilha de vinculos.";
    return;
  }
  button.disabled = true;
  status.textContent = "Lendo cabecalhos...";
  preview.innerHTML = "";
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const result = await apiPostForm("/api/links/inspect", formData);
    state.linkImportFile = file;
    state.linkImportInspect = result;
    state.linkImportSelectedType = result.default_link_type || result.link_types?.[0]?.id || "";
    renderLinkTypePicker(result);
    status.textContent = `${number(result.row_count)} linhas detectadas em ${escapeHtml(result.file_name)}. Escolha o tipo de vinculo e as colunas.`;
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel ler o arquivo.";
  } finally {
    button.disabled = false;
  }
}

function currentLinkImportType(inspect = state.linkImportInspect, typeId = state.linkImportSelectedType) {
  const types = inspect?.link_types || [];
  return types.find((type) => type.id === typeId) || types[0] || null;
}

function appendLinkImportMapping(formData) {
  const type = document.querySelector("#linkTypeSelect")?.value || state.linkImportSelectedType;
  const currentType = currentLinkImportType(state.linkImportInspect, type);
  formData.append("link_type", type);
  if (currentType?.mode === "supplier_profile") {
    document.querySelectorAll("[data-link-field]").forEach((select) => {
      formData.append(`column_${select.dataset.linkField}`, select.value || "");
    });
    return currentType;
  }
  const sourceCol = document.querySelector("#linkSourceColumn")?.value || "";
  const targetCol = document.querySelector("#linkTargetColumn")?.value || "";
  formData.append("source_column", sourceCol);
  formData.append("target_column", targetCol);
  return currentType;
}

function renderLinkTypePicker(inspect) {
  const preview = document.querySelector("#linkImportPreview");
  if (!preview) return;
  const types = inspect.link_types || [];
  const selectedType = state.linkImportSelectedType || types[0]?.id || "";
  const headers = inspect.headers || [];
  const headerOptions = headers.map((h, i) => `<option value="${i}">${escapeHtml(h || `coluna ${i + 1}`)}</option>`).join("");
  const sampleRows = (inspect.sample_rows || []).slice(0, 4);
  const sampleTable = sampleRows.length
    ? `<table class="link-sample-table"><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${sampleRows.map((row) => `<tr>${headers.map((_, i) => `<td>${escapeHtml(String(row[i] || ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : "";
  const typeOptions = types.map((t) => `<option value="${escapeAttr(t.id)}" ${t.id === selectedType ? "selected" : ""}>${escapeHtml(t.label)}</option>`).join("");
  const currentType = types.find((t) => t.id === selectedType) || types[0];
  const suggestion = inspect.suggestions?.[selectedType] || { source_index: -1, target_index: -1, fields: {} };
  const fieldSuggestion = suggestion.fields || {};
  const mappingHtml = currentType?.mode === "supplier_profile"
    ? `
      <div class="link-mapping-grid link-mapping-grid-wide">
        ${(currentType.columns || []).map((field) => `
          <label>
            <span>${escapeHtml(field.label)}${field.required ? " <strong>*</strong>" : ""}</span>
            <select id="linkField_${escapeAttr(field.id)}" data-link-field="${escapeAttr(field.id)}">
              <option value="">${field.required ? "Selecione" : "Nao usar"}</option>
              ${headerOptions}
            </select>
          </label>
        `).join("")}
      </div>
    `
    : `
      <div class="link-mapping-grid">
        <label>
          <span>Coluna de <strong>${escapeHtml(currentType?.source?.label || "Origem")}</strong></span>
          <select id="linkSourceColumn">${headerOptions}</select>
        </label>
        <label>
          <span>Coluna de <strong>${escapeHtml(currentType?.target?.label || "Destino")}</strong></span>
          <select id="linkTargetColumn">${headerOptions}</select>
        </label>
      </div>
    `;
  preview.innerHTML = `
    <div class="link-config">
      <label class="link-config-row">
        <span>Tipo de vinculo</span>
        <select id="linkTypeSelect">${typeOptions}</select>
      </label>
      <p class="muted-line">${escapeHtml(currentType?.description || "")}</p>
      ${mappingHtml}
      ${sampleTable ? `<div class="link-sample"><strong>Primeiras linhas</strong>${sampleTable}</div>` : ""}
      <div class="refresh-confirm-row">
        <button class="action-button" type="button" id="linkImportPreviewBtn">Visualizar diferencas</button>
        <button class="text-button" type="button" id="linkImportCancel">Cancelar</button>
      </div>
      <div id="linkImportDiff" class="stack"></div>
    </div>
  `;
  if (currentType?.mode === "supplier_profile") {
    (currentType.columns || []).forEach((field) => {
      const select = document.querySelector(`[data-link-field="${field.id}"]`);
      const index = Number(fieldSuggestion[field.id]);
      if (select && index >= 0) select.value = String(index);
    });
  } else {
    const sourceSel = document.querySelector("#linkSourceColumn");
    const targetSel = document.querySelector("#linkTargetColumn");
    if (sourceSel && suggestion.source_index >= 0) sourceSel.value = String(suggestion.source_index);
    if (targetSel && suggestion.target_index >= 0) targetSel.value = String(suggestion.target_index);
  }
  document.querySelector("#linkTypeSelect")?.addEventListener("change", (event) => {
    state.linkImportSelectedType = event.target.value;
    renderLinkTypePicker(state.linkImportInspect);
  });
  document.querySelector("#linkImportPreviewBtn")?.addEventListener("click", previewLinkImport);
  document.querySelector("#linkImportCancel")?.addEventListener("click", cancelLinkImport);
}

function cancelLinkImport() {
  const preview = document.querySelector("#linkImportPreview");
  const status = document.querySelector("#linkImportStatus");
  state.linkImportFile = null;
  state.linkImportInspect = null;
  state.linkImportPreview = null;
  state.linkImportSelectedType = "";
  if (preview) preview.innerHTML = "";
  if (status) status.textContent = "Cancelado.";
}

async function previewLinkImport() {
  const file = state.linkImportFile;
  if (!file) return;
  const status = document.querySelector("#linkImportStatus");
  const diffContainer = document.querySelector("#linkImportDiff");
  const button = document.querySelector("#linkImportPreviewBtn");
  if (button) button.disabled = true;
  status.textContent = "Comparando com o cadastro atual...";
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    appendLinkImportMapping(formData);
    const result = await apiPostForm("/api/links/preview", formData);
    state.linkImportPreview = result;
    renderLinkImportDiff(result);
    if (result.mode === "supplier_profile") {
      status.textContent = `${result.type_label}: ${number(result.summary.records_total)} fornecedor(es) analisados.`;
    } else {
      status.textContent = `${result.type_label}: ${number(result.summary.pairs_total)} pares analisados.`;
    }
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel comparar.";
    if (diffContainer) diffContainer.innerHTML = "";
  } finally {
    if (button) button.disabled = false;
  }
}

function renderSupplierProfileImportDiff(result, diffContainer) {
  const summary = result.summary || {};
  const sample = result.preview || {};
  const blocks = [];
  blocks.push(`
    <div class="link-summary-grid">
      <div><strong>${number(summary.records_total)}</strong><span>fornecedores</span></div>
      <div><strong>${number(summary.new_suppliers)}</strong><span>fornecedores novos</span></div>
      <div><strong>${number(summary.updated_suppliers)}</strong><span>cadastros alterados</span></div>
      <div><strong>${number(summary.unchanged)}</strong><span>sem mudanca</span></div>
      ${summary.skipped ? `<div><strong>${number(summary.skipped)}</strong><span>avisos</span></div>` : ""}
    </div>
  `);
  if ((sample.skipped || []).length) {
    blocks.push(`<div class="link-list warn"><strong>Avisos da planilha (${number(summary.skipped)})</strong>${sample.skipped.map((item) => `<div class="link-row">linha ${number(item.line)}: ${escapeHtml(item.supplier)} - ${escapeHtml(item.reason)}</div>`).join("")}</div>`);
  }
  if ((sample.new_suppliers || []).length) {
    blocks.push(`<div class="link-list"><strong>Fornecedores que serao criados (${number(summary.new_suppliers)})</strong>${sample.new_suppliers.map((item) => `<div class="link-row">${escapeHtml(item.supplier)}: ${(item.fields || []).map((field) => `<em>${escapeHtml(field.label)}: ${escapeHtml(field.to)}</em>`).join(" ")}</div>`).join("")}</div>`);
  }
  if ((sample.updates || []).length) {
    blocks.push(`<div class="link-list"><strong>Cadastros que serao atualizados (${number(summary.updated_suppliers)})</strong>${sample.updates.map((item) => `<div class="link-row">${escapeHtml(item.supplier)}: ${(item.changes || []).map((change) => `<em>${escapeHtml(change.label)}: ${escapeHtml(change.from || "vazio")} &rarr; <strong>${escapeHtml(change.to)}</strong></em>`).join(" ")}</div>`).join("")}</div>`);
  }
  blocks.push(`
    <div class="refresh-confirm-row">
      <button class="action-button" type="button" id="linkImportConfirm">Confirmar e gravar dados</button>
    </div>
  `);
  diffContainer.innerHTML = blocks.join("");
  document.querySelector("#linkImportConfirm")?.addEventListener("click", confirmLinkImport);
}

function renderLinkImportDiff(result) {
  const diffContainer = document.querySelector("#linkImportDiff");
  if (!diffContainer) return;
  if (result.mode === "supplier_profile") {
    renderSupplierProfileImportDiff(result, diffContainer);
    return;
  }
  const summary = result.summary || {};
  const sample = result.preview || {};
  const labels = result.labels || {};
  const blocks = [];
  blocks.push(`
    <div class="link-summary-grid">
      <div><strong>${number(summary.pairs_total)}</strong><span>pares unicos</span></div>
      <div><strong>${number(summary.new_source)}</strong><span>${escapeHtml(labels.source_create || "origem")}(s) novas</span></div>
      <div><strong>${number(summary.new_target)}</strong><span>${escapeHtml(labels.target_create || "destino")}(s) novos</span></div>
      <div><strong>${number(summary.new_links)}</strong><span>vinculos novos</span></div>
      <div><strong>${number(summary.overrides)}</strong><span>vinculos alterados</span></div>
      <div><strong>${number(summary.unchanged)}</strong><span>sem mudanca</span></div>
      ${summary.unresolved ? `<div><strong>${number(summary.unresolved)}</strong><span>nao encontrados</span></div>` : ""}
    </div>
  `);
  if (summary.unresolved) {
    blocks.push(`<div class="link-list warn"><strong>${number(summary.unresolved)} entrada(s) nao encontradas no cadastro</strong>${(sample.unresolved || []).map((u) => `<div class="link-row">linha ${number(u.line)}: ${escapeHtml(u.value)}</div>`).join("")}<p class="muted-line">Esses itens serao ignorados no commit.</p></div>`);
  }
  if ((sample.new_source || []).length) {
    blocks.push(`<div class="link-list"><strong>${escapeHtml(labels.source_create || "Origem")}(s) que serao criadas (${number(summary.new_source)})</strong><div class="link-tag-row">${sample.new_source.map((n) => `<em class="refresh-tag">${escapeHtml(n)}</em>`).join(" ")}${summary.new_source > sample.new_source.length ? ` <em class="refresh-tag">+${number(summary.new_source - sample.new_source.length)}</em>` : ""}</div></div>`);
  }
  if ((sample.new_target || []).length) {
    blocks.push(`<div class="link-list"><strong>${escapeHtml(labels.target_create || "Destino")}(s) que serao criados (${number(summary.new_target)})</strong><div class="link-tag-row">${sample.new_target.map((n) => `<em class="refresh-tag">${escapeHtml(n)}</em>`).join(" ")}${summary.new_target > sample.new_target.length ? ` <em class="refresh-tag">+${number(summary.new_target - sample.new_target.length)}</em>` : ""}</div></div>`);
  }
  if ((sample.overrides || []).length) {
    blocks.push(`<div class="link-list warn"><strong>Vinculos que serao sobrescritos (${number(summary.overrides)})</strong>${sample.overrides.map((o) => `<div class="link-row">${escapeHtml(o.source)}: <em>${escapeHtml(o.from)}</em> &rarr; <strong>${escapeHtml(o.to)}</strong></div>`).join("")}</div>`);
  }
  if ((sample.new_links || []).length) {
    blocks.push(`<div class="link-list"><strong>Novos vinculos (${number(summary.new_links)})</strong>${sample.new_links.map((l) => `<div class="link-row">${escapeHtml(l.source)} &rarr; <strong>${escapeHtml(l.target)}</strong></div>`).join("")}</div>`);
  }
  blocks.push(`
    <div class="refresh-confirm-row">
      <button class="action-button" type="button" id="linkImportConfirm">Confirmar e gravar vinculos</button>
    </div>
  `);
  diffContainer.innerHTML = blocks.join("");
  document.querySelector("#linkImportConfirm")?.addEventListener("click", confirmLinkImport);
}

async function confirmLinkImport() {
  const file = state.linkImportFile;
  if (!file) return;
  const status = document.querySelector("#linkImportStatus");
  const button = document.querySelector("#linkImportConfirm");
  if (button) button.disabled = true;
  status.textContent = "Gravando vinculos...";
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const currentType = appendLinkImportMapping(formData);
    const commit = await apiPostForm("/api/links/commit", formData);
    cancelLinkImport();
    if (commit.mode === "supplier_profile" || currentType?.mode === "supplier_profile") {
      status.textContent = `${number(commit.upserted)} fornecedor(es) gravados (${number(commit.created_suppliers)} novos, ${number(commit.updated_suppliers)} atualizados${commit.unchanged ? `, ${number(commit.unchanged)} sem mudanca` : ""}${commit.skipped ? `, ${number(commit.skipped)} ignorados` : ""}).`;
    } else {
      status.textContent = `${number(commit.upserted)} vinculos gravados (${number(commit.created_source)} origem novas, ${number(commit.created_target)} destino novos${commit.skipped_unresolved ? `, ${number(commit.skipped_unresolved)} ignorados por nao encontrar no cadastro` : ""}).`;
    }
    const imports = await apiContract("/api/imports", "imports.v1");
    state.imports = imports;
    renderImports(imports);
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel gravar os vinculos.";
    if (button) button.disabled = false;
  }
}

function referenceFileStatusText(file) {
  if (!file.exists) return "Nao encontrado";
  if (file.needs_update && file.last_imported_at) return "Modificado";
  if (file.needs_update) return "Novo";
  return "Atual";
}

function referenceFileTone(file) {
  if (!file.exists) return "warn";
  if (file.needs_update) return "good";
  return "muted";
}

function referenceFileMeta(file) {
  const parts = [];
  if (file.modified_at) parts.push(`arquivo ${shortDateTime(file.modified_at)}`);
  if (file.last_imported_at) parts.push(`ultimo lote ${shortDateTime(file.last_imported_at)}`);
  if (Number(file.rows_imported || 0)) parts.push(`${number(file.rows_imported)} linhas`);
  return parts.join(" - ") || "Sem historico de importacao.";
}

function renderRefreshTargets(targets = []) {
  const panel = document.querySelector("#refreshTargetsPanel");
  const list = document.querySelector("#refreshTargets");
  if (!panel || !list) return;
  const local = state.imports?.local_reference || {};
  const files = local.files || [];
  const configured = Boolean(local.configured);
  const folderExists = Boolean(local.folder_exists);
  const updateCount = files.filter((file) => file.exists && file.needs_update).length;
  const existingCount = files.filter((file) => file.exists).length;
  const alertClass = !configured || !folderExists ? "warn" : updateCount ? "good" : "neutral";
  const alertText = !configured
    ? "Defina a pasta onde ficam os arquivos do ERP para habilitar a atualizacao rapida."
    : !folderExists
      ? "A pasta salva nao foi encontrada. Confira o caminho antes de atualizar."
      : updateCount
        ? `${number(updateCount)} arquivo(s) de referencia mudaram desde a ultima importacao.`
        : "Arquivos de referencia iguais ao ultimo lote importado.";
  panel.hidden = false;
  list.innerHTML = `
    <div class="refresh-folder-card">
      <label for="referenceFolderInput">Pasta de referencia</label>
      <div class="refresh-folder-row">
        <input class="inline-input" id="referenceFolderInput" type="text" value="${escapeAttr(local.folder || "")}" placeholder="C:\\caminho\\das\\planilhas" />
        <button class="secondary-button" id="referenceFolderSave" type="button">Salvar pasta</button>
      </div>
    </div>
    <p class="refresh-local-alert ${escapeAttr(alertClass)}">${escapeHtml(alertText)}</p>
    <div class="refresh-file-list">
      ${files
        .map((file) => {
          const checked = file.exists && file.needs_update ? "checked" : "";
          const disabled = file.exists ? "" : "disabled";
          return `
            <label class="refresh-file-row ${escapeAttr(referenceFileTone(file))}">
              <input type="checkbox" data-reference-file="${escapeAttr(file.file_name || "")}" ${checked} ${disabled} />
              <span>
                <strong>${escapeHtml(file.file_name || "Arquivo")}</strong>
                <em>${escapeHtml(referenceFileMeta(file))}</em>
              </span>
              <b>${escapeHtml(referenceFileStatusText(file))}</b>
            </label>
          `;
        })
        .join("") || `<div class="info-card"><strong>Nenhuma fonte conhecida</strong><span>Importe as planilhas pelo fluxo manual uma vez.</span></div>`}
    </div>
    <div class="refresh-confirm-row">
      <button class="action-button" id="refreshSelectedLocalBtn" type="button" ${configured && folderExists && existingCount ? "" : "disabled"}>Atualizar selecionados</button>
      <button class="secondary-button" id="selectModifiedReferenceFiles" type="button" ${updateCount ? "" : "disabled"}>Selecionar alterados</button>
      <button class="secondary-button" id="selectAllReferenceFiles" type="button" ${existingCount ? "" : "disabled"}>Selecionar todos</button>
    </div>
  `;
  state.refreshTargets = targets;
  return;
  list.innerHTML = targets
    .map((target, index) => {
      const fields = (target.mapped_fields || []).map((f) => `<em class="refresh-tag">${escapeHtml(f)}</em>`).join(" ");
      const more = Number(target.mapped_field_count || 0) > (target.mapped_fields || []).length
        ? ` <em class="refresh-tag">+${Number(target.mapped_field_count) - (target.mapped_fields || []).length}</em>`
        : "";
      return `
        <article class="refresh-target-card" data-refresh-index="${index}">
          <header>
            <strong>${escapeHtml(target.file_name || "Planilha")}</strong>
            <span>${escapeHtml(shortDateTime(target.last_imported_at))} · ${number(target.rows_imported)} linhas · ${number(target.mapped_field_count)} campos</span>
          </header>
          <div class="refresh-fields">${fields}${more}</div>
          <button class="secondary-button" type="button" data-refresh-index="${index}">Selecionar arquivo novo</button>
        </article>
      `;
    })
    .join("");
  state.refreshTargets = targets;
}

function setReferenceFileSelection(mode) {
  document.querySelectorAll("[data-reference-file]").forEach((input) => {
    if (input.disabled) return;
    const file = (state.imports?.local_reference?.files || []).find((item) => item.file_name === input.dataset.referenceFile);
    input.checked = mode === "all" ? true : Boolean(file?.needs_update);
  });
}

function renderLocalRefreshResults(results = []) {
  if (!results.length) return "";
  return results
    .map((item) => {
      if (!item.ok) return `${item.file_name}: ${item.error || "nao atualizado"}`;
      const impact = erpImportImpactText(item.summary || {});
      return `${item.file_name}: ${number(item.summary?.mapped_rows || 0)} linhas${impact ? `; ${impact}` : ""}`;
    })
    .join(" | ");
}

async function saveReferenceFolder() {
  const input = document.querySelector("#referenceFolderInput");
  const status = document.querySelector("#refreshTargetStatus");
  if (!input || !status) return;
  status.textContent = "Salvando pasta de referencia...";
  try {
    const result = await apiPost("/api/imports/reference-folder", { folder: input.value.trim() });
    state.imports = result.imports;
    renderImports(result.imports);
    document.querySelector("#refreshTargetStatus").textContent = "Pasta salva.";
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel salvar a pasta.";
  }
}

async function refreshSelectedLocalFiles() {
  const selected = [...document.querySelectorAll("[data-reference-file]:checked")]
    .map((input) => input.dataset.referenceFile)
    .filter(Boolean);
  const status = document.querySelector("#refreshTargetStatus");
  const button = document.querySelector("#refreshSelectedLocalBtn");
  if (!status) return;
  if (!selected.length) {
    status.textContent = "Selecione pelo menos um arquivo.";
    return;
  }
  if (button) button.disabled = true;
  status.textContent = `Atualizando ${number(selected.length)} arquivo(s)...`;
  try {
    const result = await apiPost("/api/imports/refresh-local", { file_names: selected });
    state.imports = result.imports;
    renderImports(result.imports);
    const message = renderLocalRefreshResults(result.results || []);
    document.querySelector("#refreshTargetStatus").textContent = message || "Atualizacao concluida.";
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel atualizar os arquivos.";
    if (button) button.disabled = false;
  }
}

async function startRefreshTarget(index) {
  const target = (state.refreshTargets || [])[index];
  if (!target) return;
  state.activeRefreshTarget = target;
  const input = document.querySelector("#refreshTargetFile");
  if (!input) return;
  input.value = "";
  input.click();
}

async function handleRefreshTargetFile(event) {
  const file = event.target.files?.[0];
  const target = state.activeRefreshTarget;
  const status = document.querySelector("#refreshTargetStatus");
  const preview = document.querySelector("#refreshTargetPreview");
  if (!file || !target || !status) return;
  status.textContent = `Analisando ${file.name}...`;
  preview.innerHTML = "";
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const result = await apiPostForm("/api/erp/import-preview", formData);
    state.refreshFile = file;
    state.refreshAnalysis = result;
    const totalCols = result.summary?.columns || 0;
    const reused = result.summary?.reused_mappings || 0;
    const totalRows = result.summary?.rows || 0;
    const reviewNeeded = Number(result.summary?.required_review || 0);
    const allReused = reused === totalCols && totalCols > 0;
    const ratio = totalCols ? Math.round((reused / totalCols) * 100) : 0;
    const warning = allReused
      ? `<p class="refresh-callout good">Todos os ${number(totalCols)} campos foram reaproveitados do mapeamento anterior.</p>`
      : `<p class="refresh-callout warn">${number(reused)} de ${number(totalCols)} campos reaproveitados (${ratio}%). ${reviewNeeded ? `${number(reviewNeeded)} coluna(s) precisariam de revisao no fluxo manual.` : ""}</p>`;
    preview.innerHTML = `
      <div class="refresh-summary">
        <div>
          <strong>${escapeHtml(file.name)}</strong>
          <span>${number(totalRows)} linhas · ${number(totalCols)} colunas · ${number(result.sheets?.length || 0)} aba(s)</span>
        </div>
        ${warning}
        <div class="refresh-confirm-row">
          <button class="action-button" type="button" id="refreshConfirmBtn" ${allReused ? "" : "disabled"}>Confirmar e gravar lote</button>
          <button class="text-button" type="button" id="refreshCancelBtn">Cancelar</button>
        </div>
      </div>
    `;
    document.querySelector("#refreshConfirmBtn")?.addEventListener("click", commitRefreshTarget);
    document.querySelector("#refreshCancelBtn")?.addEventListener("click", () => {
      state.refreshFile = null;
      state.refreshAnalysis = null;
      preview.innerHTML = "";
      status.textContent = "Cancelado.";
    });
    if (allReused) {
      status.textContent = "Pronto pra gravar — confira o resumo e confirme.";
    } else {
      status.textContent = "Mapeamento parcial. Para revisar campos manualmente, use o uploader principal abaixo.";
    }
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel analisar o arquivo.";
  }
}

async function commitRefreshTarget() {
  const file = state.refreshFile;
  const analysis = state.refreshAnalysis;
  const status = document.querySelector("#refreshTargetStatus");
  const preview = document.querySelector("#refreshTargetPreview");
  if (!file || !analysis || !status) return;
  const button = document.querySelector("#refreshConfirmBtn");
  if (button) button.disabled = true;
  status.textContent = "Gravando lote...";
  try {
    const mappings = (analysis.sheets || []).map((sheet, sheetIndex) => ({
      sheet_index: sheetIndex,
      sheet_name: sheet.sheet_name,
      signature: sheet.signature,
      columns: (sheet.columns || []).map((column) => {
        const suggestion = column.suggestion || {};
        return {
          index: column.index,
          header: column.header,
          entity: suggestion.entity || "ignorar",
          field: suggestion.field || "ignorar",
          label: suggestion.label || "Ignorar / nao mapeado",
        };
      }),
    }));
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("import_mode", "configured_update");
    formData.append("mappings", JSON.stringify(mappings));
    const result = await apiPostForm("/api/erp/import-commit", formData);
    state.imports = result.imports;
    renderImports(result.imports);
    state.refreshFile = null;
    state.refreshAnalysis = null;
    preview.innerHTML = "";
    const impact = erpImportImpactText(result.summary || {});
    status.textContent = `Lote gravado: ${number(result.summary?.mapped_rows || 0)} linhas lidas${impact ? `; impacto: ${impact}` : ""}${result.summary?.supplier_profiles_imported ? `, ${number(result.summary.supplier_profiles_imported)} fornecedor(es) atualizados` : ""}.`;
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel gravar o lote.";
    if (button) button.disabled = false;
  }
}

function renderImports(payload) {
  state.imports = payload;
  const batches = payload.batches || [];
  const issues = payload.issues || [];
  const changes = payload.changes || [];
  const quality = payload.quality || {};
  const qualitySummary = quality.summary || {};
  const lastBatch = batches[0] || {};
  renderImportDataGuide(payload.readiness || {});
  document.querySelector("#importDashboardCharts").innerHTML = importDashboardCharts(payload);
  renderKpiGrid("#importsSummary", [
    ["Lotes", number(batches.length), "blue"],
    ["Confianca", `${number(quality.score || 0)}%`, quality.status === "ready" ? "green" : quality.status === "blocked" ? "red" : "amber"],
    ["Linhas mapeadas", number(qualitySummary.mapped_rows || 0), "green"],
    ["Issues", number(issues.length), issues.length ? "amber" : "green"],
    ["Mudancas detectadas", number(changes.length), ""],
    ["Ultimo status", importStatusLabel(lastBatch.status), lastBatch.status === "completed" ? "green" : "amber"],
    ["Blocos cobertos", number((payload.readiness?.plan || []).filter((item) => importPlanStatus(item).cls === "good").length), "green"],
    ["Parciais", number((payload.readiness?.plan || []).filter((item) => importPlanStatus(item).cls === "warn").length), "amber"],
    ["Faltando", number((payload.readiness?.plan || []).filter((item) => importPlanStatus(item).cls === "danger").length), ""],
    ["Fontes desejadas", number((payload.readiness?.plan || []).length), "blue"],
  ]);
  insightCards("#importInsights", [
    {
      title: quality.latest_batch_id ? `Confianca do lote: ${number(quality.score || 0)}%` : "Confianca ainda nao calculada",
      body: quality.latest_batch_id ? `${quality.next_step || "Revise o diagnostico do lote antes da rotina."}` : "Importe uma planilha para gerar o diagnostico de qualidade.",
      actions: [
        {
          label: quality.status === "ready" ? "Registrar leitura confiavel" : "Revisar qualidade",
          title: "Qualidade da importacao",
          body: quality.checks?.map((item) => item.title).join("; ") || "Sem diagnostico do ultimo lote.",
          action: "import_quality_review",
          target_type: "import_batch",
          target_id: quality.latest_batch_id || "imports_view",
          scope: "Reconciliacao da importacao",
        },
      ],
    },
    {
      title: lastBatch.id ? `Última importação: ${importBatchTitle(lastBatch)}` : "Nenhum lote registrado",
      body: lastBatch.id ? importBatchMeta(lastBatch) : "Execute a importacao para montar a base analitica local.",
    },
    {
      title: issues.length ? "Pontos de atencao" : "Base sem issues recentes",
      body: issues.length ? `${number(issues.length)} issues aparecem no historico de importacao. Resolva os mais severos antes de confiar nos indicadores.` : "Nao ha issues listadas no retorno atual da API de importacao.",
      actions: [
        {
          label: issues.length ? "Investigar issues" : "Confirmar leitura",
          title: issues.length ? "Investigacao em lote da importacao" : "Confirmacao da importacao",
          action: issues.length ? "import_issues_bulk_review" : "import_health_confirmed",
          target_type: "import",
          target_id: lastBatch.id || "imports_view",
          target_ids: issues.map((item) => `${item.severity}:${item.code}`),
          scope: issues.length ? "Issues recentes de importacao" : "Saude da importacao",
          bulk: issues.length > 1,
          decisions: issues.length ? ["Investigar agora", "Aceitar risco", "Aguardar proxima importacao", "Pedir ajuste no conector"] : ["Base confiavel", "Conferir depois"],
        },
      ],
    },
    {
      title: "Mudancas de cadastro",
      body: changes.length ? `${number(changes.length)} mudancas foram detectadas em entidades importadas. Elas ajudam a auditar preco, custo, nome e outros campos espelhados do ERP.` : "Nenhuma mudanca recente foi listada.",
      actions: [
        {
          label: changes.length ? "Revisar mudancas" : "Anotar nada mudou",
          title: "Revisao de mudancas do ERP",
          action: "import_changes_review",
          target_type: "import_changes",
          target_id: lastBatch.id || "imports_view",
          target_ids: changes.map((item) => `${item.entity_type}:${item.source_code}:${item.field_name}`),
          scope: "Mudancas detectadas na importacao",
          bulk: changes.length > 1,
          decisions: changes.length ? ["Aceitar mudancas", "Investigar alteracoes", "Atualizar regra", "Ignorar por enquanto"] : ["Sem mudanca relevante"],
        },
      ],
    },
  ]);
  document.querySelector("#batches").innerHTML = batches
    .map((batch) => {
      const fileNames = importBatchFileNames(batch);
      const filesLine = fileNames.length
        ? `<span>📄 ${escapeHtml(fileNames.join(", "))}</span>`
        : `<span>Sem arquivo registrado</span>`;
      const counts = importBatchCounts(batch);
      const countsLine = counts ? `<span>${escapeHtml(counts)}</span>` : "";
      return `<div class="info-card"><strong>${escapeHtml(importBatchTitle(batch))}</strong>${filesLine}<span>${escapeHtml(importBatchMeta(batch))}</span>${countsLine}</div>`;
    })
    .join("") || `<div class="info-card"><strong>Nenhum lote</strong><span>Importacoes futuras aparecerao aqui.</span></div>`;
  renderRefreshTargets(payload.refresh_targets || []);
  const issueCards = [
    ...issues.map((item) => ({
      title: `${item.severity} - ${item.code}`,
      body: item.message,
    })),
    ...changes.map((item) => ({
      title: `${item.entity_type} - ${item.field_name}`,
      body: `${item.previous_value || "(vazio)"} -> ${item.new_value || "(vazio)"}`,
    })),
  ].slice(0, 30);
  document.querySelector("#issues").innerHTML = issueCards
    .map((item) => `<div class="info-card"><strong>${item.title}</strong><span>${item.body}</span></div>`)
    .join("") || `<div class="info-card"><strong>Nenhum alerta</strong><span>Nao ha issues ou mudancas recentes para listar.</span></div>`;
}

async function boot() {
  enhanceNavigation();
  document.querySelector("[data-app-error-dismiss]")?.addEventListener("click", clearAppError);
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-import-mode]").forEach((button) => {
    button.addEventListener("click", () => setImportMode(button.dataset.importMode));
  });
  document.querySelector("#importDashboardCharts")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-import-mode-target]");
    if (!button) return;
    setImportMode(button.dataset.importModeTarget || "operational");
  });
  document.querySelector("#erpImportAnalyze")?.addEventListener("click", analyzeErpImportFile);
  document.querySelector("#erpImportConfirm")?.addEventListener("click", confirmErpImportMapping);
  document.querySelector("#refreshTargets")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button");
    if (actionButton?.id === "referenceFolderSave") {
      saveReferenceFolder();
      return;
    }
    if (actionButton?.id === "refreshSelectedLocalBtn") {
      refreshSelectedLocalFiles();
      return;
    }
    if (actionButton?.id === "selectModifiedReferenceFiles") {
      setReferenceFileSelection("modified");
      return;
    }
    if (actionButton?.id === "selectAllReferenceFiles") {
      setReferenceFileSelection("all");
      return;
    }
    const button = event.target.closest("button[data-refresh-index]");
    if (!button) return;
    startRefreshTarget(Number(button.dataset.refreshIndex));
  });
  document.querySelector("#refreshTargetFile")?.addEventListener("change", handleRefreshTargetFile);
  document.querySelector("#linkImportAnalyze")?.addEventListener("click", analyzeLinkImportFile);

  const [periodData, quoteSuppliers, imports, companyProfile] = await Promise.all([
    loadPeriodWorkspaceData(),
    apiRows(
      "/api/supplier-workbench/suppliers",
      SUPPLIER_WORKBENCH_SUPPLIER_KEYS,
      "supplier_workbench_suppliers.v1",
    ),
    apiContract("/api/imports", "imports.v1"),
    api("/api/company-profile").catch(() => null),
  ]);
  const { summary, products, replenishment, commercial, customers, services, pricing } = periodData;

  state.summary = summary;
  state.products = products;
  state.replenishment = replenishment;
  state.stock = replenishment.rows;
  state.quoteSuppliers = quoteSuppliers;
  state.quoteSupplierChip = defaultQuoteSupplierChip(quoteSuppliers);
  state.selectedQuoteSupplierId = quoteSuppliers[0]?.supplier_id || "";
  state.commercial = commercial;
  state.pricing = pricing;
  state.customers = customers;
  state.services = services;
  state.imports = imports;
  state.companyProfile = companyProfile;

  const initialView = viewFromLocation();
  setView(initialView, { updateHistory: false });
  renderKpis(summary.kpis);
  renderGeneralMap({ summary, products, replenishment, quoteSuppliers, customers, pricing, imports, services });
  renderMonthly(summary.monthly);
  renderTasks(summary.tasks);
  renderReplenishmentSummary(replenishment.summary);
  renderStockDecisionQueue(replenishment.rows);
  renderProducts(products);
  document.querySelector("#stockTable").innerHTML = stockRows(replenishment.rows);
  renderQuotes();
  renderCommercial(commercial);
  renderPricing(pricing);
  document.querySelector("#periodLabel").textContent = summary.period?.label || "Ultimos 6 meses";
  renderCustomers(customers);
  renderServices(services);
  renderImports(imports);
  observeDataTables();

  Promise.all([
    api("/api/intelligence/maturity"),
    apiContract("/api/actions/today", "actions_today.v1"),
    api("/api/nexo/skills"),
    api("/api/suppliers/brands"),
    apiRows(
      "/api/purchase-orders?status=open",
      ["id", "supplier_id", "supplier_name", "status", "total_amount", "item_count", "approved_item_count", "overdue"],
      "purchase_orders_list.v1",
    ),
  ])
    .then(([maturity, actions, skills, suppliers, purchaseOrders]) => {
      state.maturity = maturity;
      state.actions = actions;
      state.skills = skills;
      state.suppliers = suppliers;
      state.purchaseOrders = purchaseOrders;
      renderMaturity(maturity);
      renderMissions(maturity);
      renderActions(actions);
      renderEngine(skills, actions);
      renderSuppliers(suppliers);
      renderPurchaseOrders(purchaseOrders);
    })
    .catch((error) => console.error("Carga secundaria falhou:", error));

  loadQuoteSupplierWorkbench(state.selectedQuoteSupplierId, { silent: true }).catch(() => {});
  document.querySelector("#productSearch").addEventListener("input", applyProductFilters);
  document.querySelector("#productSupplierFilter").addEventListener("change", applyProductFilters);
  document.querySelector("#productBrandFilter").addEventListener("change", applyProductFilters);
  document.querySelectorAll("[data-product-mode]").forEach((button) => {
    button.addEventListener("click", () => setProductMode(button.dataset.productMode));
  });
  document.querySelector("#productDashboardCharts").addEventListener("click", (event) => {
    const productButton = event.target.closest("[data-product-id]");
    if (productButton?.dataset.productId) {
      openProductModal(productButton.dataset.productId);
      return;
    }
    const filterButton = event.target.closest("[data-product-filter-key]");
    if (!filterButton) return;
    setProductMode("operational");
    if (filterButton.dataset.productFilterKey === "supplier") {
      document.querySelector("#productSupplierFilter").value = filterButton.dataset.productFilterValue || "";
    }
    if (filterButton.dataset.productFilterKey === "brand") {
      document.querySelector("#productBrandFilter").value = filterButton.dataset.productFilterValue || "";
    }
    applyProductFilters();
  });
  document.querySelector("#mixDecisionBoard").addEventListener("click", (event) => {
    const target = event.target.closest("[data-product-id]");
    if (target?.dataset.productId) openProductModal(target.dataset.productId);
  });
  document.querySelector("#productBulkMix").addEventListener("click", openProductBulkMixModal);
  document.querySelector("#stockSearch").addEventListener("input", applyStockFilters);
  document.querySelector("#stockStatus").addEventListener("change", applyStockFilters);
  document.querySelector("#stockDecisionStrip")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-stock-status-target]");
    if (!target) return;
    document.querySelector("#stockStatus").value = target.dataset.stockStatusTarget || "";
    applyStockFilters();
  });
  document.querySelector("#stockDecisionQueue")?.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-stock-queue-filter]");
    if (filter) {
      document.querySelector("#stockStatus").value = filter.dataset.stockQueueFilter || "";
      applyStockFilters();
      return;
    }
    const product = event.target.closest("[data-stock-queue-product]");
    if (product?.dataset.stockQueueProduct) openProductModal(product.dataset.stockQueueProduct);
  });
  document.querySelector("#stockTable").addEventListener("click", (event) => {
    if (event.target.classList.contains("force-mix-buy")) {
      updateProductMixDecision(event.target, "force_buy");
      return;
    }
    if (event.target.classList.contains("drop-mix-product")) {
      updateProductMixDecision(event.target, "drop");
      return;
    }
    if (event.target.classList.contains("edit-stock-supplier")) {
      openSupplierModal(event.target.dataset.brandId);
      return;
    }
    const row = event.target.closest("tr[data-product-id]");
    if (row?.dataset.productId) openProductModal(row.dataset.productId);
  });
  document.querySelector("#supplierSearch").addEventListener("input", applySupplierFilter);
  document.querySelector("#supplierStatus").addEventListener("change", applySupplierFilter);
  document.querySelectorAll("[data-supplier-mode]").forEach((button) => {
    button.addEventListener("click", () => setSupplierMode(button.dataset.supplierMode));
  });
  document.querySelector("#supplierDashboardCharts").addEventListener("click", (event) => {
    const button = event.target.closest("[data-supplier-filter]");
    if (!button) return;
    setSupplierMode("operational");
    document.querySelector("#supplierStatus").value = button.dataset.supplierFilter || "";
    applySupplierFilter();
  });
  document.querySelector("#suppliersTable").addEventListener("click", (event) => {
    const button = event.target.closest(".edit-supplier-profile");
    if (!button) return;
    const row = button.closest("[data-supplier-id]");
    openSupplierProfileModal(button.dataset.supplierId || row?.dataset.supplierId || "");
  });
  document.querySelector("#supplierFocus").addEventListener("click", (event) => {
    const button = event.target.closest(".edit-supplier-profile");
    if (!button) return;
    openSupplierProfileModal(button.dataset.supplierId || "");
  });
  document.querySelector("#supplierBrandTable").addEventListener("click", (event) => {
    const row = event.target.closest(".supplier-row");
    const button = event.target.closest(".edit-supplier");
    if (button?.dataset.brandId) {
      openSupplierModal(button.dataset.brandId);
      return;
    }
    if (row?.dataset.brandId) openSupplierModal(row.dataset.brandId);
  });
  document.querySelector("#quoteSupplierSearch").addEventListener("input", renderQuotes);
  document.querySelectorAll("[data-quote-mode]").forEach((button) => {
    button.addEventListener("click", () => setQuoteMode(button.dataset.quoteMode));
  });
  document.querySelector("#quoteSupplierChips").addEventListener("click", (event) => {
    const chipBtn = event.target.closest("[data-chip]");
    if (chipBtn) {
      state.quoteSupplierChip = chipBtn.dataset.chip;
      state.quoteSupplierChipPinned = true;
      state.quoteSupplierPreviewId = "";
      renderQuotes();
    }
  });
  document.querySelector("#quoteWindowDays").addEventListener("change", async (event) => {
    state.quoteWindowDays = event.target.value;
    await loadQuoteSupplierWorkbench(state.selectedQuoteSupplierId);
  });
  document.querySelector("#quoteSuppliersTable").addEventListener("click", async (event) => {
    const button = event.target.closest(".quote-supplier-card");
    if (!button?.dataset.supplierId) return;
    state.quoteSupplierPreviewId = button.dataset.supplierId;
    renderQuotes();
  });
  document.querySelector("#quoteSupplierInspector").addEventListener("click", async (event) => {
    const discard = event.target.closest("[data-quote-discard]");
    if (discard?.dataset.quoteDiscard) {
      const feedback = discard.closest(".quote-supplier-actions")?.querySelector("[data-quote-discard-state]");
      await discardQuote({ id: discard.dataset.quoteDiscard, status: "draft" }, discard.dataset.quoteDiscardSupplier || state.quoteSupplierPreviewId, feedback, discard);
      return;
    }
    const button = event.target.closest("[data-quote-supplier-action]");
    if (button?.dataset.quoteSupplierAction) await loadQuoteSupplierWorkbench(button.dataset.quoteSupplierAction);
  });
  document.querySelector("#purchaseOrdersBoard").addEventListener("click", (event) => {
    const card = event.target.closest("[data-purchase-order-id]");
    if (card && event.target.closest(".receive-purchase-order")) {
      openReceivePurchaseOrderModal(card.dataset.purchaseOrderId);
    }
  });
  document.querySelector("#quoteDashboard").addEventListener("click", async (event) => {
    const chipButton = event.target.closest("[data-quote-chip]");
    if (chipButton) {
      setQuoteMode("operational");
      state.quoteStep = "supplier";
      state.quoteSupplierChip = chipButton.dataset.quoteChip || "all";
      state.quoteSupplierChipPinned = true;
      renderQuotes();
      updateQuoteFlow();
      return;
    }
    const supplierButton = event.target.closest("[data-quote-supplier]");
    if (supplierButton?.dataset.quoteSupplier) {
      setQuoteMode("operational");
      state.quoteStep = "supplier";
      await loadQuoteSupplierWorkbench(supplierButton.dataset.quoteSupplier);
    }
  });
  document.querySelector("#quotes").addEventListener("click", (event) => {
    const journeyAction = event.target.closest("[data-quote-journey-action]");
    if (journeyAction) {
      runQuoteCommand(journeyAction.dataset.quoteJourneyAction);
      return;
    }
    const journeyStep = event.target.closest("[data-quote-journey-step]");
    if (journeyStep) {
      const step = journeyStep.dataset.quoteJourneyStep;
      if (step === "supplier") setQuoteStep("supplier");
      else if (step === "items" || step === "send") setQuoteStep("review");
      else if (step === "response") runQuoteCommand("response");
      else if (step === "order") runQuoteCommand("close");
      else if (step === "arrival") runQuoteCommand("arrival");
      return;
    }
    const command = event.target.closest("[data-quote-command]");
    if (command) {
      runQuoteCommand(command.dataset.quoteCommand, command);
      return;
    }
    const tab = event.target.closest("[data-quote-step]");
    if (tab && !tab.disabled) setQuoteStep(tab.dataset.quoteStep || "review");
  });
  document.querySelector("#quoteDetail").addEventListener("click", (event) => {
    const sortHeader = event.target.closest("[data-quote-sort]");
    if (sortHeader) { toggleQuoteWorkbenchSort(sortHeader.dataset.quoteSort); return; }
    const check = event.target.closest(".qrow-check");
    if (check) { event.stopPropagation(); toggleWorkbenchItem(check); return; }
    const toggle = event.target.closest(".qrow-toggle");
    if (toggle) { event.stopPropagation(); toggleWorkbenchRow(toggle.closest(".qrow")); return; }
    const mixButton = event.target.closest(".qrow-mix-action");
    if (mixButton) { event.stopPropagation(); updateWorkbenchMixDecision(mixButton); return; }
    if (event.target.closest(".quote-mark-visible")) { bulkSetVisibleQuoteItems(true); return; }
    if (event.target.closest(".quote-coverage-visible")) { openCoverageBulkModal(); return; }
    if (event.target.closest(".quote-complete-minimum")) { completeMinimumOrder(); return; }
    if (event.target.closest(".quote-round-packages")) { roundIncludedToPackages(); return; }
    if (event.target.closest(".quote-manual-item")) { openManualQuoteItemModal(); return; }
    if (event.target.closest(".quote-unmark-visible")) { bulkSetVisibleQuoteItems(false); return; }
    if (event.target.closest(".quote-restore-items")) { restoreSuggestedQuoteItems(); return; }
    if (event.target.closest(".quote-clear-items")) { clearWorkbenchQuoteItems(); return; }
    const filterPill = event.target.closest(".qf-pill");
    if (filterPill) { filterWorkbenchRows(filterPill.dataset.filter); return; }
    const detailButton = event.target.closest(".qrow-detail");
    if (detailButton) {
      event.stopPropagation();
      const row = detailButton.closest("[data-product-row]");
      if (row?.dataset.productId) openQuoteProductDrawer(row.dataset.productId);
      return;
    }
    const quickBtn = event.target.closest(".link-sug, .qrow-step");
    if (quickBtn) { event.stopPropagation(); applyQuickQuantity(quickBtn); return; }
    const coverageBtn = event.target.closest(".qrow-coverage-apply");
    if (coverageBtn) { event.stopPropagation(); applyRowCoverageTarget(coverageBtn); return; }
    const productRow = event.target.closest("[data-product-row]");
    if (productRow && !event.target.closest("input, select, button")) {
      openQuoteProductDrawer(productRow.dataset.productId);
    }
  });
  document.querySelector("#quoteDetail").addEventListener("input", (event) => {
    if (event.target.classList.contains("quote-quantity-input")) scheduleWorkbenchQuantitySave(event.target);
    if (event.target.classList.contains("quote-package-input")) scheduleWorkbenchQuantitySave(event.target);
    if (event.target.id === "quoteItemSearch") {
      state.quoteItemSearch = event.target.value;
      applyWorkbenchView();
    }
  });
  document.querySelector("#quoteDetail").addEventListener("change", (event) => {
    if (event.target.classList.contains("quote-unit-select")) scheduleWorkbenchQuantitySave(event.target);
  });
  document.querySelector("#quoteFinal").addEventListener("click", (event) => {
    if (event.target.closest(".quote-back-review")) setQuoteStep("review");
    if (event.target.closest(".quote-export-pdf")) exportCurrentQuotePdf();
    if (event.target.closest(".quote-direct-close")) openPurchaseCloseModal();
    if (event.target.closest(".quote-generate")) generateCurrentQuote();
  });
  document.querySelectorAll("[data-commercial-mode]").forEach((button) => {
    button.addEventListener("click", () => setCommercialMode(button.getAttribute("data-commercial-mode")));
  });
  document.querySelectorAll("[data-customer-mode]").forEach((button) => {
    button.addEventListener("click", () => setCustomerMode(button.getAttribute("data-customer-mode")));
  });
  document.querySelectorAll("[data-pricing-mode]").forEach((button) => {
    button.addEventListener("click", () => setPricingMode(button.getAttribute("data-pricing-mode")));
  });
  document.querySelector("#pricingDashboard").addEventListener("click", (event) => {
    const target = event.target.closest("[data-product-id]");
    if (target?.dataset.productId) openPricingModal(target.dataset.productId);
  });
  document.querySelector("#pricingQueue").addEventListener("click", (event) => {
    const row = event.target.closest("[data-product-id]");
    if (!row?.dataset.productId) return;
    state.selectedPricingProductId = row.dataset.productId;
    renderPricing(state.pricing || { rows: [] });
  });
  document.querySelector("#pricingInspector").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-pricing-edit]");
    if (edit?.dataset.pricingEdit) {
      openPricingModal(edit.dataset.pricingEdit);
      return;
    }
    const product = event.target.closest("[data-pricing-product]");
    if (product?.dataset.pricingProduct) {
      setView("products");
      setTimeout(() => openProductModal(product.dataset.pricingProduct), 0);
    }
  });
  document.querySelector("#pricingTable").addEventListener("click", (event) => {
    const row = event.target.closest(".pricing-row");
    if (row) {
      state.selectedPricingProductId = row.dataset.productId;
      renderPricing(state.pricing || { rows: [] });
      openPricingModal(row.dataset.productId);
    }
  });
  document.querySelector("#productsTable").addEventListener("click", (event) => {
    const row = event.target.closest(".product-row");
    if (row) openProductModal(row.dataset.productId);
  });
  document.querySelector("#dashboard")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });
  document.querySelector("#dashboardCustomizeButton")?.addEventListener("click", openCompanyProfileModal);
  renderNavBadges();
  document.querySelectorAll(".period-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      state.periodDays = button.dataset.periodDays;
      document.querySelectorAll(".period-btn").forEach((item) => item.classList.toggle("active", item === button));
      await refreshPeriodData();
    });
  });
  document.querySelector("#modalClose").addEventListener("click", closeModal);
  document.querySelector("#modalOverlay").addEventListener("click", (event) => {
    if (event.target.id === "modalOverlay") closeModal();
  });
  document.addEventListener("click", (event) => {
    const quickButton = event.target.closest("button[data-quick-action]");
    if (!quickButton) return;
    openQuickActionModal(state.quickActions.get(quickButton.dataset.quickAction));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("#modalOverlay").hidden) closeModal();
  });
  document.querySelector("#maturity").addEventListener("click", (event) => {
    const target = event.target.closest("button[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });
  document.querySelector("#maturityNextButton").addEventListener("click", (event) => {
    if (event.currentTarget.dataset.viewTarget) setView(event.currentTarget.dataset.viewTarget);
  });
  document.querySelector("#missions").addEventListener("click", (event) => {
    const target = event.target.closest("button[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });
  document.querySelector("#actionsBoard").addEventListener("click", (event) => {
    const viewTarget = event.target.closest("button[data-view-target]");
    if (viewTarget?.dataset.viewTarget) {
      setView(viewTarget.dataset.viewTarget);
      return;
    }
    if (event.target.classList.contains("resolve-action")) resolveAction(event.target);
    if (event.target.classList.contains("explain-action")) explainAction(event.target);
    const row = event.target.closest("[data-action-id]");
    if (row && !event.target.closest(".resolve-action, .explain-action")) {
      state.selectedActionId = row.dataset.actionId;
      renderActions(state.actions || {});
    }
  });
  document.querySelector("#actionDetail").addEventListener("click", (event) => {
    if (event.target.classList.contains("resolve-action")) resolveAction(event.target);
    if (event.target.classList.contains("explain-action")) explainAction(event.target);
  });
  document.querySelector("#actionsHero").addEventListener("click", (event) => {
    if (event.target.classList.contains("resolve-action")) resolveAction(event.target);
    if (event.target.classList.contains("explain-action")) explainAction(event.target);
  });
  document.querySelector("#refreshActionsButton").addEventListener("click", refreshActions);
  document.querySelector("#refreshEngineButton").addEventListener("click", async () => {
    const [skillsPayload, actionsPayload] = await Promise.all([
      api("/api/nexo/skills"),
      apiContract("/api/actions/today", "actions_today.v1"),
    ]);
    state.skills = skillsPayload;
    state.actions = actionsPayload;
    renderActions(actionsPayload);
    renderEngine(skillsPayload, actionsPayload);
  });
  document.querySelector("#whyPanel").addEventListener("click", (event) => {
    const target = event.target.closest("button[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });

  window.addEventListener("popstate", () => setView(viewFromLocation(), { updateHistory: false }));
  window.addEventListener("resize", () => {
    Object.values(state.generalCharts || {}).forEach((chart) => {
      if (typeof chart?.resize === "function") chart.resize();
    });
    if (typeof state.monthlyChart?.resize === "function") state.monthlyChart.resize();
  });
  if (initialView === "pricing") {
    const pricingParams = new URLSearchParams(window.location.search);
    setPricingMode(pricingParams.get("pricing_mode") || state.pricingMode);
    if (pricingParams.get("pricing_product_id")) openPricingModal(pricingParams.get("pricing_product_id"));
  }
  if (initialView === "opportunities") {
    setCommercialMode(new URLSearchParams(window.location.search).get("commercial_mode") || state.commercialMode);
  }
  if (initialView === "customers") {
    setCustomerMode(new URLSearchParams(window.location.search).get("customer_mode") || state.customerMode);
  }
  window.history.replaceState({ view: initialView }, "", routeForView(initialView));
}

function customerRows(rows = []) {
  if (!rows.length) {
    return `<tr><td colspan="4"><strong>Nenhum cliente no periodo</strong><span class="muted-line">Aumente o recorte ou confira a importacao de vendas.</span></td></tr>`;
  }
  return rows
    .map(
      (row) => `
        <tr>
          <td><strong class="product-name">${escapeHtml(row.name || "")}</strong></td>
          <td class="num">${number(row.purchases)}</td>
          <td>${escapeHtml(row.last_purchase || "")}</td>
          <td class="num">${money(row.revenue)}</td>
        </tr>
      `,
    )
    .join("");
}

function setCustomerMode(mode) {
  setModuleMode({
    stateKey: "customerMode",
    modeAttr: "data-customer-mode",
    operationalSelector: "#customerOperational",
    dashboardSelector: "#customerDashboard",
  }, mode);
}

function customerChartRows(items, valueKey = "value", valueFormatter = number) {
  return dashboardChartRows(items, {
    valueKey,
    valueFormatter,
    rowClass: "customer-chart-row",
    labelFor: (item) => item.label || item.name || "",
  });
}

function customerRecencyDays(row) {
  if (!row?.last_purchase) return null;
  const last = new Date(`${row.last_purchase}T00:00:00`);
  if (Number.isNaN(last.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - last.getTime()) / 86400000));
}

function customerRelationshipAction(row, index, avgRevenue) {
  const days = customerRecencyDays(row);
  const revenue = Number(row.revenue || 0);
  const purchases = Number(row.purchases || 0);
  if (days !== null && days > 90 && revenue >= avgRevenue * 0.6) {
    return {
      kind: "reactivate",
      label: "Reativar",
      tone: "warn",
      score: 900 + revenue,
      reason: `${number(days)} dias sem compra, com ${money(revenue)} no periodo.`,
      decisions: ["Contatar agora", "Enviar oferta de recompra", "Investigar perda", "Nao priorizar"],
    };
  }
  if (index < 5 || revenue >= avgRevenue * 1.4) {
    return {
      kind: "protect",
      label: "Proteger",
      tone: "good",
      score: 800 + revenue,
      reason: `${money(revenue)} de receita no recorte atual.`,
      decisions: ["Registrar acompanhamento", "Agendar contato", "Criar condicao especial", "Sem acao agora"],
    };
  }
  if (purchases >= 5) {
    return {
      kind: "follow",
      label: "Acompanhar",
      tone: "info",
      score: 650 + purchases * 20 + revenue,
      reason: `${number(purchases)} compras no periodo.`,
      decisions: ["Acompanhar recorrencia", "Oferecer complementar", "Manter contato leve", "Sem acao agora"],
    };
  }
  if (purchases <= 1) {
    return {
      kind: "convert",
      label: "Converter",
      tone: "muted",
      score: 420 + revenue,
      reason: "Cliente com compra unica no periodo.",
      decisions: ["Tentar segunda compra", "Adicionar a lista de nutricao", "Investigar perfil", "Sem acao agora"],
    };
  }
  return {
    kind: "monitor",
    label: "Monitorar",
    tone: "muted",
    score: 500 + revenue,
    reason: "Cliente em ritmo intermediario.",
    decisions: ["Monitorar cadencia", "Registrar observacao", "Oferecer complementar", "Sem acao agora"],
  };
}

function renderCustomerRelationshipQueue(rows = state.customers || []) {
  const target = document.querySelector("#customerRelationshipQueue");
  if (!target) return;
  state.quickActions = state.quickActions || new Map();
  if (!rows.length) {
    target.innerHTML = `<div class="customer-queue-empty">Sem clientes no periodo. Aumente o recorte ou confira a importacao.</div>`;
    return;
  }
  const avgRevenue = rows.length ? sumRows(rows, "revenue") / rows.length : 0;
  const ranked = rows
    .map((row, index) => ({ row, index, action: customerRelationshipAction(row, index, avgRevenue) }))
    .sort((a, b) => b.action.score - a.action.score)
    .slice(0, 8);
  target.innerHTML = ranked.map(({ row, action }) => {
    const id = `customer-queue-${state.quickActions.size + 1}`;
    state.quickActions.set(id, {
      label: "Registrar",
      title: `${action.label} ${row.name}`,
      action: `customer_${action.kind}_decision`,
      target_type: "customer",
      target_id: row.name,
      scope: row.name,
      decisions: action.decisions,
    });
    const days = customerRecencyDays(row);
    return `
      <article class="customer-queue-card ${escapeAttr(action.tone)}">
        <span class="status-chip ${escapeAttr(action.tone)}">${escapeHtml(action.label)}</span>
        <strong>${escapeHtml(row.name || "Cliente")}</strong>
        <p>${escapeHtml(action.reason)}</p>
        <dl>
          <div><dt>Receita</dt><dd>${money(row.revenue || 0)}</dd></div>
          <div><dt>Compras</dt><dd>${number(row.purchases || 0)}</dd></div>
          <div><dt>Ultima</dt><dd>${days === null ? "-" : `${number(days)}d`}</dd></div>
        </dl>
        <button class="text-button" type="button" data-quick-action="${escapeAttr(id)}">Registrar contato</button>
      </article>
    `;
  }).join("");
}

function customerDashboardCharts(rows = state.customers || []) {
  const revenue = sumRows(rows, "revenue");
  const purchases = sumRows(rows, "purchases");
  const topOne = rows[0] || {};
  const topFive = rows.slice(0, 5);
  const topTen = rows.slice(0, 10);
  const topFiveRevenue = sumRows(topFive, "revenue");
  const topTenRevenue = sumRows(topTen, "revenue");
  const topFiveShare = revenue ? (topFiveRevenue / revenue) * 100 : 0;
  const repeatCustomers = rows.filter((row) => Number(row.purchases || 0) >= 2);
  const highFrequency = rows.filter((row) => Number(row.purchases || 0) >= 5);
  const staleCustomers = rows.filter((row) => {
    const days = customerRecencyDays(row);
    return days !== null && days > 90;
  });
  const avgTicket = purchases ? revenue / purchases : 0;
  const revenueRows = rows.slice(0, 6).map((row) => ({ label: row.name, value: Number(row.revenue || 0) }));
  const purchaseRows = rows
    .slice()
    .sort((a, b) => Number(b.purchases || 0) - Number(a.purchases || 0) || Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 6)
    .map((row) => ({ label: row.name, value: Number(row.purchases || 0) }));
  const recencyRows = [
    { label: "Ativos ate 30d", value: rows.filter((row) => {
      const days = customerRecencyDays(row);
      return days !== null && days <= 30;
    }).length },
    { label: "31 a 90d", value: rows.filter((row) => {
      const days = customerRecencyDays(row);
      return days !== null && days > 30 && days <= 90;
    }).length },
    { label: "Mais de 90d", value: staleCustomers.length },
    { label: "Sem data", value: rows.filter((row) => customerRecencyDays(row) === null).length },
  ];
  const profileRows = [
    { label: "Recorrentes", value: repeatCustomers.length },
    { label: "Alta frequencia", value: highFrequency.length },
    { label: "Compra unica", value: Math.max(0, rows.length - repeatCustomers.length) },
  ];
  const charts = [
    `
      <article class="customer-dashboard-card wide">
        <div>
          <span>Concentracao top 5</span>
          <strong>${number(topFiveShare)}%</strong>
          <p>${compactMoney(topFiveRevenue)} de ${compactMoney(revenue)} esta nos cinco maiores clientes.</p>
        </div>
        <div class="customer-donut" style="--value:${Math.max(0, Math.min(100, topFiveShare))}"><span>${number(topFiveShare)}%</span></div>
      </article>
    `,
    `
      <article class="customer-dashboard-card">
        <div>
          <span>Ticket medio</span>
          <strong>${money(avgTicket)}</strong>
          <p>${number(purchases)} compra(s) no recorte atual.</p>
        </div>
      </article>
    `,
    `
      <article class="customer-dashboard-card">
        <div>
          <span>Recorrencia</span>
          <strong>${number(repeatCustomers.length)}</strong>
          <p>${number(highFrequency.length)} cliente(s) com 5 ou mais compras.</p>
        </div>
      </article>
    `,
    `
      <article class="customer-chart-card">
        <header><span>Receita</span><strong>Clientes lideres</strong></header>
        <div class="customer-chart">${customerChartRows(revenueRows, "value", compactMoney)}</div>
      </article>
    `,
    `
      <article class="customer-chart-card">
        <header><span>Frequencia</span><strong>Mais compras</strong></header>
        <div class="customer-chart">${customerChartRows(purchaseRows)}</div>
      </article>
    `,
    `
      <article class="customer-chart-card">
        <header><span>Atividade</span><strong>Ultima compra</strong></header>
        <div class="customer-chart">${customerChartRows(recencyRows)}</div>
      </article>
    `,
    `
      <article class="customer-chart-card">
        <header><span>Perfil</span><strong>Recorrencia da carteira</strong></header>
        <div class="customer-chart">${customerChartRows(profileRows)}</div>
      </article>
    `,
    `
      <article class="customer-dashboard-card wide">
        <div>
          <span>Top 10</span>
          <strong>${compactMoney(topTenRevenue)}</strong>
          <p>${topOne.name ? `Lider atual: ${escapeHtml(topOne.name)} com ${money(topOne.revenue)}.` : "Sem lider no periodo."}</p>
        </div>
      </article>
    `,
  ];
  document.querySelector("#customerDashboardCharts").innerHTML = charts.join("");
}

function customerDashboardInsights(rows = state.customers || []) {
  const top = rows[0] || {};
  const revenue = sumRows(rows, "revenue");
  const topFiveRevenue = sumRows(rows.slice(0, 5), "revenue");
  const topFiveShare = revenue ? (topFiveRevenue / revenue) * 100 : 0;
  const stale = rows
    .map((row) => ({ ...row, recency_days: customerRecencyDays(row) }))
    .filter((row) => row.recency_days !== null && row.recency_days > 90)
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];
  const frequent = rows
    .slice()
    .sort((a, b) => Number(b.purchases || 0) - Number(a.purchases || 0) || Number(b.revenue || 0) - Number(a.revenue || 0))[0];
  insightCards("#customerDashboardInsights", [
    {
      title: top.name ? `Proteger ${top.name}` : "Sem cliente lider",
      body: top.name ? `${money(top.revenue)} no periodo. Cliente lider deve ter rotina de acompanhamento, nao apenas contato reativo.` : "A importacao ainda nao trouxe movimento suficiente.",
    },
    {
      title: `Concentracao ${number(topFiveShare)}%`,
      body: topFiveShare >= 40 ? "A carteira depende bastante dos maiores clientes. Vale acompanhar perda de ritmo nesse grupo." : "A receita esta menos concentrada nos cinco maiores clientes.",
    },
    {
      title: stale?.name ? `Reativar ${stale.name}` : "Sem cliente grande parado",
      body: stale?.name ? `${number(stale.recency_days)} dias desde a ultima compra, com ${money(stale.revenue)} no periodo.` : frequent?.name ? `${frequent.name} e o cliente mais frequente, com ${number(frequent.purchases)} compras.` : "Sem sinal forte de reativacao no recorte.",
    },
  ]);
}

function renderCustomers(rows = []) {
  state.customers = rows;
  const top = rows[0] || {};
  const revenue = sumRows(rows, "revenue");
  const purchases = sumRows(rows, "purchases");
  const avgTicket = purchases ? revenue / purchases : 0;
  customerDashboardCharts(rows);
  customerDashboardInsights(rows);
  renderCustomerRelationshipQueue(rows);
  renderKpiGrid("#customersSummary", [
    ["Clientes no ranking", number(rows.length), "blue"],
    ["Receita da carteira", compactMoney(revenue), "green"],
    ["Compras", number(purchases), ""],
    ["Ticket medio", money(avgTicket), "amber"],
  ]);
  insightCards("#customerInsights", [
    {
      title: top.name ? `Maior cliente: ${top.name}` : "Sem cliente lider",
      body: top.name ? `${money(top.revenue)} no periodo, em ${number(top.purchases)} compras. Bom ponto de partida para proteger recorrencia.` : "Ainda nao ha movimento suficiente para destacar clientes.",
      actions: top.name
        ? [
            {
              label: "Registrar contato",
              title: "Contato com cliente relevante",
              action: "customer_contact_decision",
              target_type: "customer",
              target_id: top.name,
              scope: top.name,
              decisions: ["Contatar agora", "Cliente acompanhado", "Nao e prioridade", "Adicionar observacao"],
            },
          ]
        : [],
    },
    {
      title: "Proxima acao comercial",
      body: "Use esta lista junto da aba Oportunidades para separar cliente grande em risco de cliente apenas ocasional.",
      actions: [
        {
          label: "Planejar top 10",
          title: "Plano em lote para clientes",
          action: "customer_top10_bulk_plan",
          target_type: "customer_group",
          target_id: "top_10_revenue",
          target_ids: rows.slice(0, 10).map((row) => row.name),
          scope: "Top 10 clientes por receita",
          bulk: true,
          decisions: ["Montar lista de contato", "Reativar em risco", "Acompanhar recorrencia", "Sem acao agora"],
        },
      ],
    },
    {
      title: "Leitura operacional",
      body: "Ultima compra e quantidade de compras ajudam a decidir se o contato e recompra, reativacao ou acompanhamento normal.",
    },
  ]);
  document.querySelector("#customersTable").innerHTML = customerRows(rows);
}

function serviceRows(rows = []) {
  if (!rows.length) {
    return `<tr><td colspan="4"><strong>Nenhum servico no periodo</strong><span class="muted-line">Aumente o recorte ou confira a importacao de servicos.</span></td></tr>`;
  }
  return rows
    .map(
      (row) => `
        <tr>
          <td><strong class="product-name">${escapeHtml(row.name || "")}</strong></td>
          <td class="num">${number(row.quantity)}</td>
          <td class="num">${money(row.revenue)}</td>
          <td class="num">${money(row.net_revenue)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderServices(rows = []) {
  state.services = rows;
  const top = rows[0] || {};
  const quantity = sumRows(rows, "quantity");
  const revenue = sumRows(rows, "revenue");
  const netRevenue = sumRows(rows, "net_revenue");
  const netShare = revenue ? (netRevenue / revenue) * 100 : 0;
  renderKpiGrid("#servicesSummary", [
    ["Servicos no ranking", number(rows.length), "blue"],
    ["Quantidade", number(quantity), ""],
    ["Receita bruta", compactMoney(revenue), "green"],
    ["Liquido / receita", `${number(netShare)}%`, "amber"],
  ]);
  insightCards("#serviceInsights", [
    {
      title: top.name ? `Servico lider: ${top.name}` : "Sem servico lider",
      body: top.name ? `${money(top.revenue)} de receita e ${money(top.net_revenue)} liquido no periodo.` : "Ainda nao ha servicos suficientes para destacar um lider.",
      actions: top.name
        ? [
            {
              label: "Avaliar servico",
              title: "Decisao sobre servico lider",
              action: "service_leader_decision",
              target_type: "service",
              target_id: top.name,
              scope: top.name,
              decisions: ["Manter oferta", "Revisar preco", "Transformar em pacote", "Investigar margem"],
            },
          ]
        : [],
    },
    {
      title: "Uso da aba",
      body: "Compare volume e receita liquida para entender se servico esta ajudando margem ou apenas ocupando agenda operacional.",
      actions: [
        {
          label: "Revisar servicos",
          title: "Revisao em lote de servicos",
          action: "service_bulk_review",
          target_type: "service_group",
          target_id: "services_view",
          target_ids: rows.map((row) => row.name),
          scope: "Servicos exibidos no periodo",
          bulk: true,
          decisions: ["Revisar precos", "Padronizar pacotes", "Manter como esta", "Investigar margem"],
        },
      ],
    },
    {
      title: "Proxima decisao",
      body: "Servicos frequentes e pouco liquidos podem pedir reajuste, pacote ou revisao de execucao.",
    },
  ]);
  document.querySelector("#servicesTable").innerHTML = serviceRows(rows);
}

boot().catch((error) => {
  console.error(error);
  showAppError("Falha ao iniciar a mesa", error.message || "Nao foi possivel carregar os dados iniciais.");
});
