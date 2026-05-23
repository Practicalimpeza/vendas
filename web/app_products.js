let productsTable = null;

function productRoleLabel(role) {
  return (typeof roleText === "function" ? roleText(role) : "") || role || "";
}

function productEnrichedRows(rows = state.products || []) {
  const stockIndex = new Map((state.stock || []).map((row) => [row.product_id, row]));
  const pricingIndex = new Map((state.pricing?.rows || []).map((row) => [row.product_id, row]));
  return rows.map((row) => {
    const stock = stockIndex.get(row.id) || {};
    const pricing = pricingIndex.get(row.id) || {};
    return {
      ...row,
      stock_units: stock.stock_units ?? null,
      coverage_days: stock.coverage_days ?? null,
      suggested_quantity: stock.suggested_quantity ?? null,
      abc_class: stock.abc_class || "",
      status_label: stock.status_label || stock.status || "",
      estimated_value: stock.estimated_value ?? null,
      sale_price: pricing.sale_price ?? null,
      effective_cost: pricing.effective_cost ?? null,
      margin_pct: pricing.margin_pct ?? null,
      product_role_label: pricing.role_label || productRoleLabel(pricing.product_role),
    };
  });
}

function productColumns() {
  return [
    {
      id: "source_code",
      label: "Código",
      type: "text",
      optional: false,
      value: (row) => productCode(row.source_code),
      render: (row) => escapeHtml(productCode(row.source_code)),
    },
    {
      id: "name",
      label: "Produto",
      type: "text",
      optional: false,
      value: (row) => row.name || "",
      render: (row) => `<strong class="product-name">${escapeHtml(row.name || "")}</strong>`,
    },
    { id: "supplier_name", label: "Fornecedor", type: "enum", value: (row) => row.supplier_name || "Sem fornecedor" },
    { id: "brand_name", label: "Marca", type: "enum", value: (row) => row.brand_name || "Sem marca" },
    { id: "quantity", label: "Qtd. vendida", type: "number", align: "num", value: (row) => Number(row.quantity || 0) },
    { id: "revenue", label: "Receita", type: "money", align: "num", value: (row) => Number(row.revenue || 0) },
    {
      id: "share",
      label: "Part.",
      type: "percent",
      align: "num",
      value: (row) => Number(row.share || 0),
      render: (row) => `${number(row.share || 0)}%`,
    },
    {
      id: "stock_units",
      label: "Estoque",
      type: "number",
      align: "num",
      hidden: true,
      value: (row) => (row.stock_units == null ? null : Number(row.stock_units)),
    },
    {
      id: "coverage_days",
      label: "Cobertura",
      type: "number",
      align: "num",
      hidden: true,
      value: (row) => (row.coverage_days == null ? null : Number(row.coverage_days)),
      render: (row) => (row.coverage_days == null ? "—" : `${number(row.coverage_days)} dias`),
    },
    {
      id: "suggested_quantity",
      label: "Sugestão compra",
      type: "number",
      align: "num",
      hidden: true,
      value: (row) => (row.suggested_quantity == null ? null : Number(row.suggested_quantity)),
    },
    { id: "abc", label: "ABC", type: "enum", align: "num", hidden: true, value: (row) => row.abc_class || "", emptyText: "—" },
    { id: "status", label: "Status estoque", type: "enum", hidden: true, value: (row) => row.status_label || "", emptyText: "—" },
    {
      id: "sale_price",
      label: "Preço venda",
      type: "money",
      align: "num",
      hidden: true,
      value: (row) => (row.sale_price == null ? null : Number(row.sale_price)),
    },
    {
      id: "effective_cost",
      label: "Custo",
      type: "money",
      align: "num",
      hidden: true,
      value: (row) => (row.effective_cost == null ? null : Number(row.effective_cost)),
    },
    {
      id: "margin_pct",
      label: "Margem",
      type: "percent",
      align: "num",
      hidden: true,
      value: (row) => (row.margin_pct == null ? null : Number(row.margin_pct)),
      render: (row) => (row.margin_pct == null ? "—" : `${number(row.margin_pct)}%`),
    },
    {
      id: "estimated_value",
      label: "Valor estoque",
      type: "money",
      align: "num",
      hidden: true,
      value: (row) => (row.estimated_value == null ? null : Number(row.estimated_value)),
    },
    { id: "product_role", label: "Papel", type: "enum", hidden: true, value: (row) => row.product_role_label || "", emptyText: "—" },
  ];
}

function productTableSummary(rows) {
  const receita = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const unidades = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const sugestao = rows.reduce((sum, row) => sum + Number(row.suggested_quantity || 0), 0);
  const margens = rows.map((row) => Number(row.margin_pct)).filter((value) => Number.isFinite(value));
  const margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : null;
  return [
    { label: "Itens", value: number(rows.length) },
    { label: "Receita", value: compactMoney(receita), tone: "green" },
    { label: "Unidades", value: number(unidades) },
    { label: "Margem média", value: margemMedia == null ? "—" : `${number(margemMedia)}%`, tone: margemMedia != null && margemMedia < 10 ? "amber" : "" },
    { label: "Sugestão compra", value: number(sugestao), tone: sugestao > 0 ? "amber" : "" },
  ];
}

function productTablePresets() {
  return [
    {
      id: "mix",
      name: "Mix comercial",
      hint: "padrão",
      columns: ["source_code", "name", "supplier_name", "brand_name", "quantity", "revenue", "share"],
      sort: [{ id: "revenue", dir: "desc" }],
      filters: {},
    },
    {
      id: "compras",
      name: "Compras e estoque",
      hint: "reposição",
      columns: ["name", "supplier_name", "stock_units", "coverage_days", "suggested_quantity", "abc", "status", "revenue"],
      sort: [{ id: "suggested_quantity", dir: "desc" }],
      filters: {},
    },
    {
      id: "margem",
      name: "Preço e margem",
      hint: "rentabilidade",
      columns: ["name", "quantity", "revenue", "sale_price", "effective_cost", "margin_pct", "product_role"],
      sort: [{ id: "margin_pct", dir: "asc" }],
      filters: {},
    },
  ];
}

function productTableSegments() {
  return [
    { id: "cauda", label: "Cauda longa", hint: "Participação abaixo de 0,5%", filters: { share: { kind: "range", max: 0.5 } }, sort: [{ id: "revenue", dir: "desc" }] },
    { id: "semforn", label: "Sem fornecedor", hint: "Itens sem fornecedor definido", filters: { supplier_name: { kind: "set", values: ["Sem fornecedor"] } } },
    {
      id: "comprar",
      label: "Comprar agora",
      hint: "Com sugestão de compra",
      columns: ["name", "supplier_name", "stock_units", "coverage_days", "suggested_quantity", "abc", "revenue"],
      filters: { suggested_quantity: { kind: "range", min: 1 } },
      sort: [{ id: "suggested_quantity", dir: "desc" }],
    },
    {
      id: "margembaixa",
      label: "Margem baixa",
      hint: "Margem até 10%",
      columns: ["name", "revenue", "sale_price", "effective_cost", "margin_pct", "product_role"],
      filters: { margin_pct: { kind: "range", max: 10 } },
      sort: [{ id: "margin_pct", dir: "asc" }],
    },
  ];
}

function ensureProductsTable() {
  if (productsTable) return productsTable;
  const mount = document.querySelector("#productsTableMount");
  if (!mount) return null;
  productsTable = createDataTable(mount, {
    key: "products",
    columns: productColumns(),
    rows: [],
    searchPlaceholder: "Buscar produto, código, fornecedor…",
    rowKey: (row) => row.id,
    rowAttrs: (row) => ({ "data-product-id": row.id, class: "product-row" }),
    onRowClick: (row) => openProductModal(row.id),
    emptyTitle: "Nenhum produto encontrado",
    emptyHint: "Revise a busca, os filtros ou o período selecionado.",
    initialSort: [{ id: "revenue", dir: "desc" }],
    summary: productTableSummary,
    presets: productTablePresets(),
    segments: productTableSegments(),
    toolbarExtra: `
      <button class="secondary-button compact" type="button" id="productNew">Novo produto</button>
      <button class="secondary-button compact" type="button" id="productBulkMix">Editar mix</button>
    `,
    onToolbar: (toolbar) => {
      toolbar.querySelector("#productNew")?.addEventListener("click", openProductCreateModal);
      toolbar.querySelector("#productBulkMix")?.addEventListener("click", openProductBulkMixModal);
    },
  });
  return productsTable;
}

function setProductTableFilter(colId, value) {
  const table = ensureProductsTable();
  if (!table) return;
  setProductMode("operational");
  table.setFilter(colId, value ? { kind: "set", values: [value] } : null);
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
  const evidence = stock.reason || `${number(item.share || 0)}% da receita exibida no período.`;
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
    ${mixDecisionLane("Proteger líderes", "manter venda", protect, "Sem líder relevante no filtro atual.")}
    ${mixDecisionLane("Comprar agora", "evitar ruptura", buy, "Nenhuma compra urgente neste recorte.")}
    ${mixDecisionLane("Decidir mix", "não comprar no automático", decide, "Nenhum item pedindo decisão de mix agora.")}
    ${mixDecisionLane("Investigar cauda", "reduzir ruído", investigate, "A cauda longa não apareceu no ranking atual.")}
  `;
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
        <span>Concentração top 5</span>
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
        <p>${compactMoney(longTailRevenue)} em itens com menos de 0,5% de participação individual.</p>
      </div>
    </article>
    <article class="product-chart-card">
      <header><strong>Produtos líderes</strong><span>Clique para abrir o detalhe</span></header>
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
        <span>Insight ${escapeHtml(appName())}</span>
        <strong>Proteja líderes, questione a cauda</strong>
        <p>O operacional deve priorizar estoque, preço e fornecedor dos líderes. A cauda longa precisa de decisão: manter por estratégia, comprar sob demanda ou retirar do mix ativo.</p>
      </div>
    </article>
  `;
}

function renderProductDashboard(rows = state.products || []) {
  document.querySelector("#productDashboardCharts").innerHTML = productDashboardCharts(rows);
}

function productInputNumber(value) {
  const normalized = String(value || "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function productDisplayUnit(unit, packageSize = 1) {
  const normalized = String(unit || "UN").toUpperCase();
  if (Number(packageSize || 0) > 1 && ["CX", "FD", "SC"].includes(normalized)) return "UN";
  return normalized || "UN";
}

function productPackageUnit(unit, packageSize = 1) {
  const normalized = String(unit || "").toUpperCase();
  if (Number(packageSize || 0) > 1) return ["CX", "FD", "SC"].includes(normalized) ? normalized : "CX";
  return normalized || "UN";
}

function currentProductOrganizationId(detail = {}) {
  return detail.organization_id
    || (state.products || []).find((row) => row.organization_id)?.organization_id
    || (state.stock || []).find((row) => row.organization_id)?.organization_id
    || state.companyProfile?.organization_id
    || "";
}

function productControlledLabel(detail = {}) {
  const controls = detail.controlled_fields || [];
  const appFields = controls.filter((item) => item.control_kind === "app").length;
  if (!detail.id) return "Criado no sistema";
  if (appFields) return `${number(appFields)} campo(s) protegidos no app`;
  if (detail.last_seen_import_batch_id) return "Atualizado pela importação";
  return "Cadastro local";
}

function productProfilePayloadFromForm(form, detail = {}) {
  const checkbox = (name) => form.querySelector(`[data-product-profile="${name}"]`)?.checked || false;
  return {
    organization_id: currentProductOrganizationId(detail),
    product_id: detail.id || "",
    source_code: form.querySelector('[data-product-profile="source_code"]')?.value.trim() || "",
    name: form.querySelector('[data-product-profile="name"]')?.value.trim() || "",
    unit: form.querySelector('[data-product-profile="unit"]')?.value.trim() || "UN",
    brand_name: form.querySelector('[data-product-profile="brand_name"]')?.value.trim() || "",
    category_name: form.querySelector('[data-product-profile="category_name"]')?.value.trim() || "",
    barcode: form.querySelector('[data-product-profile="barcode"]')?.value.trim() || "",
    supplier_reference: form.querySelector('[data-product-profile="supplier_reference"]')?.value.trim() || "",
    supplier_name: form.querySelector('[data-product-profile="supplier_name"]')?.value.trim() || "",
    package_size: form.querySelector('[data-product-profile="package_size"]')?.value.trim() || "",
    minimum_stock: form.querySelector('[data-product-profile="minimum_stock"]')?.value.trim() || "",
    maximum_stock: form.querySelector('[data-product-profile="maximum_stock"]')?.value.trim() || "",
    weight: form.querySelector('[data-product-profile="weight"]')?.value.trim() || "",
    expires: checkbox("expires"),
    blocked_for_purchase: checkbox("blocked_for_purchase"),
    ignored_in_purchase_reports: checkbox("ignored_in_purchase_reports"),
    active: checkbox("active"),
    notes: form.querySelector('[data-product-profile="notes"]')?.value.trim() || "",
  };
}

function productProfileForm(detail = {}) {
  const settings = detail.settings || {};
  const controls = productControlledLabel(detail);
  return `
    <section class="product-decision-card product-profile-card product-decision-wide" data-product-profile-form>
      <div class="product-profile-head">
        <div>
          <h4>Cadastro operacional</h4>
          <span>${escapeHtml(controls)}</span>
        </div>
        <label class="product-toggle">
          <input type="checkbox" data-product-profile="active" ${detail.active === false ? "" : "checked"} />
          <span>Ativo</span>
        </label>
      </div>
      <div class="product-profile-grid">
        <label class="modal-field">
          <span>Código</span>
          <input class="inline-input" data-product-profile="source_code" maxlength="80" value="${inputValue(detail.source_code || "")}" placeholder="ex.: SKU interno" />
        </label>
        <label class="modal-field wide">
          <span>Nome do produto</span>
          <input class="inline-input" data-product-profile="name" maxlength="240" value="${inputValue(detail.name || "")}" />
        </label>
        <label class="modal-field">
          <span>Unidade</span>
          <input class="inline-input" data-product-profile="unit" maxlength="20" value="${inputValue(detail.unit || "UN")}" />
        </label>
        <label class="modal-field">
          <span>Marca</span>
          <input class="inline-input" data-product-profile="brand_name" maxlength="160" value="${inputValue(detail.brand_name || "")}" />
        </label>
        <label class="modal-field">
          <span>Categoria</span>
          <input class="inline-input" data-product-profile="category_name" maxlength="160" value="${inputValue(detail.category_name || "")}" />
        </label>
        <label class="modal-field">
          <span>EAN / barras</span>
          <input class="inline-input" data-product-profile="barcode" maxlength="160" value="${inputValue(detail.barcode || "")}" />
        </label>
        <label class="modal-field">
          <span>Fornecedor preferencial</span>
          <input class="inline-input" data-product-profile="supplier_name" maxlength="180" value="${inputValue(settings.preferred_supplier_name || "")}" />
        </label>
        <label class="modal-field">
          <span>Referência fornecedor</span>
          <input class="inline-input" data-product-profile="supplier_reference" maxlength="120" value="${inputValue(detail.supplier_reference || "")}" />
        </label>
      </div>
      <div class="product-profile-grid compact">
        <label class="modal-field">
          <span>Qtd. por embalagem</span>
          <input class="inline-input" type="number" min="0.001" step="0.001" data-product-profile="package_size" value="${inputValue(settings.package_size || 1)}" />
        </label>
        <label class="modal-field">
          <span>Estoque mínimo</span>
          <input class="inline-input" type="number" step="0.001" data-product-profile="minimum_stock" value="${inputValue(settings.minimum_stock || "")}" />
        </label>
        <label class="modal-field">
          <span>Estoque máximo</span>
          <input class="inline-input" type="number" step="0.001" data-product-profile="maximum_stock" value="${inputValue(settings.maximum_stock || "")}" />
        </label>
        <label class="modal-field">
          <span>Peso</span>
          <input class="inline-input" type="number" step="0.001" data-product-profile="weight" value="${inputValue(settings.weight || "")}" />
        </label>
      </div>
      <div class="product-profile-flags">
        <label><input type="checkbox" data-product-profile="expires" ${Number(settings.expires || 0) ? "checked" : ""} /> Perecível</label>
        <label><input type="checkbox" data-product-profile="blocked_for_purchase" ${Number(settings.blocked_for_purchase || 0) ? "checked" : ""} /> Bloquear compra</label>
        <label><input type="checkbox" data-product-profile="ignored_in_purchase_reports" ${Number(settings.ignored_in_purchase_reports || 0) ? "checked" : ""} /> Fora dos relatórios de compra</label>
      </div>
      <label class="modal-field">
        <span>Observações operacionais</span>
        <textarea class="inline-input quick-note" rows="3" data-product-profile="notes">${escapeHtml(settings.notes || "")}</textarea>
      </label>
    </section>
  `;
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
      body: top.name ? `${money(top.revenue)} no período, com ${number(top.quantity)} unidades e ${number(top.share)}% da receita exibida.` : "Importe vendas ou amplie o período para formar ranking.",
      actions: top.id
        ? [
            {
              label: "Registrar decisão",
              title: "Decisão sobre produto lider",
              action: "product_leader_decision",
              target_type: "product",
              target_id: top.id,
              scope: top.name,
              decisions: ["Manter prioridade", "Revisar preço", "Checar estoque", "Ignorar por enquanto"],
            },
          ]
        : [],
    },
    {
      title: "Concentração de receita",
      body: `${number(topFiveShare)}% da receita listada está nos 5 primeiros produtos. Use isso para proteger estoque e preço dos itens que sustentam o caixa.`,
      actions: [
        {
          label: "Revisar top 5",
          title: "Revisão em lote do top 5",
          action: "product_top5_bulk_review",
          target_type: "product_group",
          target_id: "top_5_revenue",
          target_ids: rows.slice(0, 5).map((row) => row.id),
          scope: "Top 5 produtos por receita",
          bulk: true,
          decisions: ["Revisar todos", "Proteger estoque", "Revisar preço", "Sem ação agora"],
        },
      ],
    },
    {
      title: "Como usar esta aba",
      body: "Filtre por produto, abra o detalhe e compare com reposição e precificação antes de alterar mix no ERP.",
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
  const board = document.querySelector("#mixDecisionBoard");
  if (board) board.innerHTML = mixDecisionBoard(rows);
  const table = ensureProductsTable();
  if (table) table.setRows(productEnrichedRows(rows));
}

function openProductCreateModal() {
  const detail = {
    organization_id: currentProductOrganizationId(),
    active: true,
    unit: "UN",
    settings: { package_size: 1 },
  };
  openModal(
    "Novo produto",
    `
      <div class="product-decision product-create-form">
        ${productProfileForm(detail)}
        <div class="modal-actions split-actions">
          <span class="save-state" id="productCreateState" aria-live="polite"></span>
          <div>
            <button class="secondary-button" type="button" id="productCreateCancel">Cancelar</button>
            <button class="action-button" type="button" id="productCreateSave">Salvar produto</button>
          </div>
        </div>
      </div>
    `,
    (body) => {
      const saveState = body.querySelector("#productCreateState");
      body.querySelector("#productCreateCancel").addEventListener("click", closeModal);
      body.querySelector("#productCreateSave").addEventListener("click", async () => {
        saveState.textContent = "Salvando";
        try {
          const form = body.querySelector("[data-product-profile-form]");
          const payload = productProfilePayloadFromForm(form, detail);
          if (!payload.organization_id) throw new Error("Cadastre a empresa ou importe dados antes de criar produtos.");
          if (!payload.name) throw new Error("Nome do produto é obrigatório.");
          if (productInputNumber(payload.package_size || "0") <= 0) throw new Error("Qtd. por embalagem deve ser maior que zero.");
          const result = await apiPost("/api/products/upsert", payload);
          if (typeof refreshPeriodData === "function") await refreshPeriodData();
          saveState.textContent = "Produto salvo";
          window.setTimeout(() => {
            closeModal();
            if (result?.product?.id) openProductModal(result.product.id);
          }, 250);
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
    { modalClass: "product-decision-modal" },
  );
}

async function openProductModal(productId, options = {}) {
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
  const identifiers = visibleProductIdentifiers(detail.identifiers || []);
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
  const packageInputValue = packageSize > 0 ? packageSize : 1;
  const baseUnit = productDisplayUnit(detail.unit, packageInputValue);
  const packageUnit = productPackageUnit(detail.unit, packageInputValue);
  const mixReview = stockRow.mix_decision_required || stockRow.status === "mix_review";
  let decision = {
    cls: "muted",
    label: "Monitorar",
    title: "Manter em observação",
    summary: "Não há sinal forte de compra, preço ou saneamento para este item agora.",
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
      title: "Não comprar no automático",
      summary: stockRow.reason || "O item precisa de uma decisão explícita antes de entrar no fluxo de compras.",
    };
  } else if (Number(productRow.share || 0) >= 1 || stockRow.abc_class === "A") {
    decision = {
      cls: "good",
      label: "Proteger",
      title: "Item relevante para receita",
      summary: `${number(productRow.share || 0)}% da receita exibida no período.`,
    };
  } else if (Number(productRow.share || 0) < 0.5 && revenue > 0) {
    decision = {
      cls: "muted",
      label: "Investigar cauda",
      title: "Ver se ainda merece espaco",
      summary: "Baixa participação no recorte atual. Vale checar estratégia, cadastro e fornecedor.",
    };
  }
  const codes = [
    ["Código interno", productCode(detail.source_code), "ERP"],
    ["Referência fornecedor", detail.supplier_reference || "-", "Manual/ERP"],
    ["Código de barras (EAN)", detail.barcode || "-", "ERP"],
  ];
  openModal(
    "Decisão do mix",
    `
      <div class="product-decision">
        <section class="product-decision-hero ${escapeAttr(decision.cls)}">
          <div>
            <span class="status-chip ${escapeAttr(decision.cls)}">${escapeHtml(decision.label)}</span>
            <h3>${escapeHtml(decision.title)}</h3>
            <strong>${escapeHtml(detail.name)}</strong>
            <p>${escapeHtml(decision.summary)}</p>
            <em>${escapeHtml(detail.brand_name || "Sem marca")} - ${escapeHtml(stockRow.supplier_name || productRow.supplier_name || "Sem fornecedor")} - Unidade ${escapeHtml(baseUnit)}</em>
          </div>
          <div class="product-decision-actions">
            <button class="action-button" type="button" id="productOpenQuotes">Compras</button>
            <button class="secondary-button" type="button" id="productOpenPricing" ${pricingRow.product_id ? "" : "disabled"}>Preços</button>
          </div>
        </section>

        ${productProfileForm(detail)}

        <div class="product-decision-grid">
          <section class="product-decision-card">
            <h4>Mix e estoque</h4>
            <dl>
              <dt>Status compra</dt><dd>${escapeHtml(stockRow.status_label || stockRow.status || "-")}</dd>
              <dt>Estoque</dt><dd>${stockUnits === null || stockUnits === undefined ? "-" : `${number(stockUnits)} ${escapeHtml(baseUnit)}`}</dd>
              <dt>Cobertura</dt><dd>${coverage}</dd>
              <dt>Sugestão</dt><dd>${suggestedQty > 0 ? `${number(suggestedQty)} un.` : "-"}</dd>
              <dt>ABC</dt><dd>${escapeHtml(stockRow.abc_class || "-")}</dd>
            </dl>
          </section>
          <section class="product-decision-card">
            <h4>Venda</h4>
            <dl>
              <dt>Receita período</dt><dd>${revenue ? money(revenue) : "-"}</dd>
              <dt>Participação</dt><dd>${productRow.share === undefined ? "-" : `${number(productRow.share)}%`}</dd>
              <dt>Quantidade vendida</dt><dd>${quantity ? `${number(quantity)} un.` : "-"}</dd>
              <dt>Maior venda</dt><dd>${sales.max_single_sale ? `${number(sales.max_single_sale)} un.` : "-"}</dd>
              <dt>Última venda</dt><dd>${escapeHtml(sales.last_sale_at || "-")}</dd>
            </dl>
          </section>
          <section class="product-decision-card">
            <h4>Preço e margem</h4>
            <dl>
              <dt>Venda ERP</dt><dd>${salePrice == null ? "-" : money(salePrice)}</dd>
              <dt>Custo efetivo</dt><dd>${cost == null ? "-" : money(cost)}</dd>
              <dt>Margem</dt><dd>${escapeHtml(margin)}</dd>
              <dt>Papel</dt><dd>${escapeHtml(pricingRow.role_label || roleText(pricingRow.product_role))}</dd>
              <dt>Sinal</dt><dd>${escapeHtml(pricingRow.signal_label || pricingRow.reason || "-")}</dd>
            </dl>
          </section>
          <section class="product-decision-card">
            <h4>Operação</h4>
            <dl>
              <dt>Qtd. por embalagem</dt><dd>${packageSize > 1 ? `${escapeHtml(packageUnit)} com ${number(packageSize)} ${escapeHtml(baseUnit)}` : `1 ${escapeHtml(baseUnit)} (compra avulsa)`}</dd>
              <dt>Ciclo fornecedor</dt><dd>${stockRow.review_cycle_days ? `${number(stockRow.review_cycle_days)} dias` : "-"}</dd>
              <dt>Horizonte motor</dt><dd>${stockRow.order_horizon_days ? `${number(stockRow.order_horizon_days)} dias` : "-"}</dd>
              <dt>Compra bloqueada</dt><dd>${Number(settings.blocked_for_purchase || 0) ? "Sim" : "Não"}</dd>
              <dt>Validade</dt><dd>${Number(settings.expires || 0) ? "Sim" : "Não"}</dd>
              <dt>Peso</dt><dd>${settings.weight ? `${number(settings.weight)} kg` : "-"}</dd>
            </dl>
          </section>
        </div>

        <section class="product-decision-card product-decision-wide">
          <h4>Códigos e ajustes operacionais</h4>
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
          <div class="product-identifiers">
            ${identifiers.length ? identifiers.map((item) => `<span>${escapeHtml(productIdentifierLabel(item.identifier_type))}: <strong>${escapeHtml(item.identifier_value)}</strong></span>`).join("") : "<span>Nenhum identificador adicional.</span>"}
          </div>
        </section>

        <section class="product-decision-card product-decision-wide">
          <h4>Memória e próxima decisão</h4>
          <div class="product-decision-log">
            ${decisions.length ? decisions.map((item) => `<span><strong>${escapeHtml(item.decision_value || item.decision_type)}</strong>${item.notes ? ` - ${escapeHtml(item.notes)}` : ""}<em>${escapeHtml(item.created_at || "")}</em></span>`).join("") : "<span>Nenhuma decisão operacional registrada para este produto.</span>"}
          </div>
          <div class="product-decision-register">
            <label class="modal-field">
              <span>Registrar decisão</span>
              <select class="inline-input" id="productDecisionSelect">
                <option value="Manter no mix">Manter no mix</option>
                <option value="Comprar agora">Comprar agora</option>
                <option value="Pausar compra">Pausar compra</option>
                <option value="Revisar preço">Revisar preço</option>
                <option value="Investigar cadastro">Investigar cadastro</option>
              </select>
            </label>
            <label class="modal-field">
              <span>Observação</span>
              <textarea class="inline-input quick-note" id="productDecisionNote" rows="3" placeholder="Contexto para a próxima pessoa que abrir este item"></textarea>
            </label>
          </div>
        </section>

        <div class="modal-actions split-actions">
          <span class="save-state" id="productSaveState" aria-live="polite"></span>
          <div>
            <button class="secondary-button" type="button" id="productCancel">Fechar</button>
            <button class="secondary-button" type="button" id="productDecisionSave">Registrar decisão</button>
            <button class="action-button" type="button" id="productSave">Salvar ajustes</button>
          </div>
        </div>
      </div>
    `,
    (body) => {
      const saveState = body.querySelector("#productSaveState");
      body.querySelector("#productCancel").addEventListener("click", closeModal);
      body.querySelector("#productOpenQuotes").addEventListener("click", async () => {
        state.modalOnClose = null;
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
        state.modalOnClose = null;
        closeModal();
        setView("pricing");
        setTimeout(() => openPricingModal(productId), 0);
      });
      body.querySelector("#productDecisionSave").addEventListener("click", async () => {
        saveState.textContent = "Registrando decisão";
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
          saveState.textContent = "Decisão registrada";
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
      body.querySelector("#productSave").addEventListener("click", async () => {
        saveState.textContent = "Salvando";
        try {
          const form = body.querySelector("[data-product-profile-form]");
          const payload = productProfilePayloadFromForm(form, detail);
          const packageValue = productInputNumber(payload.package_size || "0");
          if (!payload.organization_id) throw new Error("Empresa não identificada para salvar o produto.");
          if (!payload.name) throw new Error("Nome do produto é obrigatório.");
          if (packageValue <= 0) throw new Error("Qtd. por embalagem deve ser maior que zero.");
          const result = await apiPost("/api/products/upsert", payload);
          detail = result.product || detail;
          if (typeof refreshPeriodData === "function") await refreshPeriodData();
          saveState.textContent = "Salvo";
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
    { modalClass: "product-decision-modal", onClose: options.onClose },
  );
}

