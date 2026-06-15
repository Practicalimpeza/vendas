let customersTable = null;

function customerCrmStatusLabel(status = "") {
  return {
    active: "Ativo",
    follow_up: "Acompanhar",
    negotiating: "Negociando",
    risk: "Risco",
    inactive: "Inativo",
  }[status] || "Acompanhar";
}

function customerCrmStatusTone(status = "") {
  return {
    active: "good",
    follow_up: "info",
    negotiating: "warn",
    risk: "danger",
    inactive: "muted",
  }[status] || "info";
}

function customerCrmPriorityLabel(priority = "") {
  return {
    low: "Baixa",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
  }[priority] || "Normal";
}

function customerCrmActionLabel(action = "") {
  return {
    call: "Ligar",
    whatsapp: "WhatsApp",
    send_catalog: "Enviar catalogo",
    visit: "Visita",
    review_terms: "Revisar condicoes",
    follow_up: "Follow-up",
  }[action] || "Sem acao";
}

function customerCrmOptions(options = [], current = "") {
  return options.map(([value, label]) => `<option value="${escapeAttr(value)}"${value === current ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function customerCrmStatusOptions(current = "follow_up") {
  return customerCrmOptions([
    ["active", "Ativo"],
    ["follow_up", "Acompanhar"],
    ["negotiating", "Negociando"],
    ["risk", "Risco"],
    ["inactive", "Inativo"],
  ], current || "follow_up");
}

function customerCrmPriorityOptions(current = "normal") {
  return customerCrmOptions([
    ["low", "Baixa"],
    ["normal", "Normal"],
    ["high", "Alta"],
    ["urgent", "Urgente"],
  ], current || "normal");
}

function customerCrmActionOptions(current = "") {
  return customerCrmOptions([
    ["", "Sem acao"],
    ["call", "Ligar"],
    ["whatsapp", "WhatsApp"],
    ["send_catalog", "Enviar catalogo"],
    ["visit", "Visita"],
    ["review_terms", "Revisar condicoes"],
    ["follow_up", "Follow-up"],
  ], current || "");
}

function customerPortfolio(row = {}) {
  const days = customerRecencyDays(row);
  const purchases = Number(row.purchases || 0);
  const purchaseDays = Number(row.purchase_days || 0);
  if (!purchases) return { label: "Sem compras", tone: "muted" };
  if (days !== null && days > 90) return { label: "Reativar", tone: "warn" };
  if (purchaseDays >= 5 || purchases >= 8) return { label: "Recorrente", tone: "good" };
  if (days !== null && days <= 30) return { label: "Ativo", tone: "good" };
  if (purchases <= 1 || purchaseDays <= 1) return { label: "Primeira compra", tone: "muted" };
  return { label: "Acompanhar", tone: "info" };
}

function customerTableSummary(rows = []) {
  const revenue = sumRows(rows, "revenue");
  const purchases = sumRows(rows, "purchases");
  const purchaseDays = sumRows(rows, "purchase_days");
  const avgTicket = purchaseDays ? revenue / purchaseDays : 0;
  const reactivation = rows.filter((row) => customerPortfolio(row).label === "Reativar").length;
  return [
    { label: "Clientes", value: number(rows.length), tone: "blue" },
    { label: "Receita", value: compactMoney(revenue), tone: "green" },
    { label: "Movimentos", value: number(purchases) },
    { label: "Ticket médio", value: money(avgTicket), tone: "amber" },
    { label: "Reativar", value: number(reactivation), tone: reactivation ? "amber" : "" },
  ];
}

function customerTablePresets() {
  return [
    {
      id: "vendedor",
      name: "Mesa do vendedor",
      hint: "contato",
      columns: ["name", "crm_status", "crm_next_action_at", "portfolio", "revenue", "avg_ticket", "last_purchase", "days_since"],
      sort: [{ id: "revenue", dir: "desc" }],
      filters: {},
    },
    {
      id: "mix",
      name: "Mix e receita",
      hint: "compras",
      columns: ["name", "product_revenue", "service_revenue", "purchases", "purchase_days", "revenue"],
      sort: [{ id: "revenue", dir: "desc" }],
      filters: {},
    },
  ];
}

function customerTableSegments() {
  return [
    {
      id: "reativar",
      label: "Reativar",
      hint: "Clientes sem compra há mais de 90 dias",
      filters: { portfolio: { kind: "set", values: ["Reativar"] } },
      sort: [{ id: "revenue", dir: "desc" }],
    },
    {
      id: "recorrentes",
      label: "Recorrentes",
      hint: "Clientes com maior frequência",
      filters: { portfolio: { kind: "set", values: ["Recorrente"] } },
      sort: [{ id: "purchase_days", dir: "desc" }],
    },
    {
      id: "servicos",
      label: "Com serviços",
      hint: "Clientes com receita de serviços",
      filters: { service_revenue: { kind: "range", min: 1 } },
      sort: [{ id: "service_revenue", dir: "desc" }],
    },
    {
      id: "acao",
      label: "Com ação",
      hint: "Clientes com próxima ação definida",
      filters: { crm_next_action_at: { kind: "not_empty" } },
      sort: [{ id: "crm_next_action_at", dir: "asc" }],
    },
  ];
}

function customerColumns() {
  return [
    {
      id: "name",
      label: "Cliente",
      type: "text",
      value: (row) => row.name || "",
      render: (row) => {
        const meta = [
          row.document ? `Doc. ${row.document}` : "",
          row.source_code ? `Código ${row.source_code}` : "",
          row.crm_owner_name ? `Resp. ${row.crm_owner_name}` : "",
        ].filter(Boolean).join(" · ");
        return `<strong class="product-name">${escapeHtml(row.name || "")}</strong><span class="row-edit-hint">${escapeHtml(meta || "Clique para abrir ficha CRM")}</span>`;
      },
      minWidth: 240,
    },
    {
      id: "portfolio",
      label: "Carteira",
      type: "text",
      value: (row) => customerPortfolio(row).label,
      render: (row) => {
        const profile = customerPortfolio(row);
        return `<span class="status-chip ${escapeAttr(profile.tone)}">${escapeHtml(profile.label)}</span>`;
      },
      minWidth: 140,
    },
    {
      id: "crm_status",
      label: "CRM",
      type: "text",
      value: (row) => customerCrmStatusLabel(row.crm_status || "follow_up"),
      render: (row) => `<span class="status-chip ${escapeAttr(customerCrmStatusTone(row.crm_status || "follow_up"))}">${escapeHtml(customerCrmStatusLabel(row.crm_status || "follow_up"))}</span>`,
      minWidth: 132,
    },
    {
      id: "crm_next_action_at",
      label: "Próxima ação",
      type: "date",
      value: (row) => row.crm_next_action_at || "",
      render: (row) => {
        const action = customerCrmActionLabel(row.crm_next_action || "");
        const date = row.crm_next_action_at ? shortDate(row.crm_next_action_at) : "Sem data";
        return `<strong>${escapeHtml(action)}</strong><span class="row-edit-hint">${escapeHtml(date)}</span>`;
      },
      minWidth: 150,
    },
    { id: "purchases", label: "Compras", type: "number", align: "num", value: (row) => Number(row.purchases || 0) },
    { id: "purchase_days", label: "Dias c/ compra", type: "number", align: "num", value: (row) => Number(row.purchase_days || 0) },
    { id: "last_purchase", label: "Última compra", type: "date", value: (row) => row.last_purchase || "" },
    {
      id: "days_since",
      label: "Sem compra",
      type: "number",
      align: "num",
      value: (row) => customerRecencyDays(row),
      render: (row, value) => (value === null || value === undefined ? "-" : `${number(value)}d`),
    },
    { id: "revenue", label: "Receita", type: "money", align: "num", value: (row) => Number(row.revenue || 0) },
    { id: "avg_ticket", label: "Ticket médio", type: "money", align: "num", value: (row) => Number(row.avg_ticket || 0) },
    { id: "product_revenue", label: "Produtos", type: "money", align: "num", value: (row) => Number(row.product_revenue || 0), hidden: true },
    { id: "service_revenue", label: "Serviços", type: "money", align: "num", value: (row) => Number(row.service_revenue || 0), hidden: true },
    { id: "customer_type", label: "Tipo", type: "text", value: (row) => row.customer_type || "", hidden: true },
  ];
}

function ensureCustomersTable() {
  if (customersTable) return customersTable;
  const mount = document.querySelector("#customersTableMount");
  if (!mount) return null;
  customersTable = createDataTable(mount, {
    key: "customers",
    columns: customerColumns(),
    rows: [],
    searchPlaceholder: "Buscar cliente…",
    rowKey: (row) => row.id,
    rowAttrs: (row) => ({
      "data-customer-id": row.id || "",
      class: `customer-row${row.id === state.selectedCustomerId ? " selected" : ""}`,
    }),
    onRowClick: (row) => openCustomerProfile(row.id),
    cardTitle: (row) => `<strong>${escapeHtml(row.name || "Cliente")}</strong><span class="customer-card-subtitle">${escapeHtml(customerPortfolio(row).label)}</span>`,
    emptyTitle: "Nenhum cliente no período",
    emptyHint: "Aumente o recorte ou confira a importação de vendas.",
    initialSort: [{ id: "revenue", dir: "desc" }],
    summary: customerTableSummary,
    presets: customerTablePresets(),
    segments: customerTableSegments(),
    tableRowActions: true,
    rowActions: [{ id: "profile", label: "Ficha", icon: "contact", title: "Ficha CRM do cliente", onClick: (row) => openCustomerProfile(row.id) }],
  });
  return customersTable;
}

function customerMixRows(products = []) {
  if (!products.length) {
    return `<tr><td colspan="9"><strong>Sem produtos no mix</strong><span class="muted-line">Este cliente pode ter apenas serviços ou vendas fora do recorte.</span></td></tr>`;
  }
  return products.map((row, index) => `
    <tr>
      <td class="num">${number(index + 1)}</td>
      <td>
        <strong>${escapeHtml(row.name || "")}</strong>
        <span class="muted-line">${escapeHtml(row.source_code || row.product_id || "")}</span>
      </td>
      <td>${escapeHtml(row.category_name || "Sem categoria")}</td>
      <td>${escapeHtml(row.brand_name || "-")}</td>
      <td><span class="status-chip ${row.mix_role === "principal" ? "good" : "neutral"}">${row.mix_role === "principal" ? "Principal" : "Complementar"}</span></td>
      <td class="num">${number(row.quantity)}</td>
      <td class="num">${money(row.revenue)}</td>
      <td class="num">${number(row.share)}%</td>
      <td class="num">${money(row.avg_unit_price)}</td>
    </tr>
  `).join("");
}

function customerServiceRows(services = []) {
  if (!services.length) {
    return `<tr><td colspan="7"><strong>Sem serviços no recorte</strong><span class="muted-line">A ficha continua mostrando produtos e compras recentes quando existirem.</span></td></tr>`;
  }
  return services.map((row, index) => `
    <tr>
      <td class="num">${number(index + 1)}</td>
      <td><strong>${escapeHtml(row.name || "Serviço")}</strong></td>
      <td class="num">${number(row.quantity)}</td>
      <td class="num">${money(row.revenue)}</td>
      <td class="num">${money(row.net_revenue)}</td>
      <td class="num">${number(row.purchase_days)}</td>
      <td class="num">${money(row.avg_unit_price)}</td>
    </tr>
  `).join("");
}

function customerCategoryRows(categories = []) {
  if (!categories.length) {
    return `<tr><td colspan="4"><strong>Sem categorias de produto</strong><span class="muted-line">Categorias aparecem quando os produtos vendidos possuem cadastro de categoria.</span></td></tr>`;
  }
  return categories.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.name || "Sem categoria")}</strong></td>
      <td class="num">${number(row.products)}</td>
      <td class="num">${number(row.quantity)}</td>
      <td class="num">${money(row.revenue)}</td>
    </tr>
  `).join("");
}

function customerMonthLabel(value) {
  if (!value) return "-";
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function customerMonthlyRows(monthly = []) {
  if (!monthly.length) return `<div class="customer-crm-empty">Sem série mensal no recorte selecionado.</div>`;
  return monthly.map((row) => `
    <div class="customer-month-row">
      <span>${escapeHtml(customerMonthLabel(row.month))}</span>
      <strong>${compactMoney(row.revenue)}</strong>
      <em>${number(row.purchase_days)} dia(s)</em>
    </div>
  `).join("");
}

function customerRecentPurchaseRows(events = []) {
  if (!events.length) return `<div class="customer-crm-empty">Sem compras recentes no recorte selecionado.</div>`;
  return events.map((row) => {
    const icon = row.type === "Produto" ? "package" : "briefcase";
    const details = [
      row.code ? `Código ${row.code}` : "",
      row.store_name || "",
      row.order_number ? `Pedido ${row.order_number}` : "",
    ].filter(Boolean).join(" · ");
    return `
      <article class="customer-crm-event">
        <span class="customer-crm-event-icon"><i data-lucide="${escapeAttr(icon)}"></i></span>
        <div>
          <header>
            <strong>${escapeHtml(row.item_name || row.type || "Compra")}</strong>
            <span>${shortDate(row.event_date)} · ${escapeHtml(row.type || "Compra")}</span>
          </header>
          <p>${escapeHtml(details || "Movimento importado")}</p>
          <dl>
            <div><dt>Qtd.</dt><dd>${number(row.quantity)}</dd></div>
            <div><dt>Valor</dt><dd>${money(row.revenue)}</dd></div>
            <div><dt>Unitário</dt><dd>${money(row.unit_value)}</dd></div>
          </dl>
        </div>
      </article>
    `;
  }).join("");
}

function customerCompositionHtml(summary = {}) {
  const productShare = Math.max(0, Math.min(100, Number(summary.product_share || 0)));
  const serviceShare = Math.max(0, Math.min(100, Number(summary.service_share || 0)));
  return `
    <div class="customer-crm-bars">
      <div class="customer-crm-bar">
        <span>Produtos</span>
        <strong>${number(productShare)}%</strong>
        <i style="--value:${productShare}%"></i>
      </div>
      <div class="customer-crm-bar service">
        <span>Serviços</span>
        <strong>${number(serviceShare)}%</strong>
        <i style="--value:${serviceShare}%"></i>
      </div>
    </div>
  `;
}

function customerCatalogStatusLabel(status) {
  const labels = {
    draft: "Rascunho",
    active: "Ativo",
    paused: "Pausado",
    expired: "Expirado",
    archived: "Arquivado",
  };
  return labels[status] || "Rascunho";
}

function customerCatalogStatusOptions(current = "draft") {
  return ["draft", "active", "paused", "expired"].map((status) => (
    `<option value="${status}"${status === current ? " selected" : ""}>${customerCatalogStatusLabel(status)}</option>`
  )).join("");
}

function customerCatalogImageHtml(row = {}) {
  const src = row.image_path || row.public_path || "";
  if (src) {
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(row.name || row.product_name_snapshot || "Produto")}" loading="lazy">`;
  }
  return `<span><i data-lucide="image"></i></span>`;
}

function customerCatalogItemCards(items = []) {
  if (!items.length) {
    return `
      <article class="customer-catalog-empty">
        <strong>Nenhum item negociado ainda</strong>
        <span class="muted-line">Adicione produtos recorrentes ou busque qualquer item do cadastro para montar o catálogo do cliente.</span>
      </article>
    `;
  }
  return items.map((row) => `
    <article class="customer-catalog-item-card" data-catalog-item-id="${escapeAttr(row.id)}" data-catalog-product-id="${escapeAttr(row.product_id)}">
      <header>
        <div class="customer-catalog-product">
          <div class="customer-catalog-photo">${customerCatalogImageHtml(row)}</div>
          <div>
            <strong>${escapeHtml(row.name || row.product_name_snapshot || "")}</strong>
            <span class="muted-line">${escapeHtml([row.source_code || row.source_code_snapshot, row.brand_name, row.category_name].filter(Boolean).join(" · "))}</span>
          </div>
        </div>
        <div class="customer-catalog-actions">
          <button class="icon-button" type="button" title="Salvar item" data-catalog-save-item><i data-lucide="save"></i></button>
          <label class="icon-button customer-catalog-upload" title="Adicionar foto">
            <i data-lucide="image-plus"></i>
            <input type="file" accept="image/png,image/jpeg,image/webp" data-catalog-photo>
          </label>
          <button class="icon-button danger" type="button" title="Remover item" data-catalog-delete-item><i data-lucide="trash-2"></i></button>
        </div>
      </header>
      <div class="customer-catalog-item-fields">
        <label><span>Status</span><select class="inline-input" data-catalog-field="status">${customerCatalogStatusOptions(row.status || "draft")}</select></label>
        <label>
          <span>Preço negociado</span>
          <input class="inline-input customer-catalog-number" type="number" step="0.01" min="0" value="${escapeAttr(row.negotiated_price ?? "")}" data-catalog-field="negotiated_price">
          <em>Tabela ${money(row.sale_price)}</em>
        </label>
        <label><span>Desc. %</span><input class="inline-input customer-catalog-number" type="number" step="0.01" value="${escapeAttr(row.discount_pct ?? "")}" data-catalog-field="discount_pct"></label>
        <label><span>Mínimo</span><input class="inline-input customer-catalog-number" type="number" step="0.01" min="0" value="${escapeAttr(row.minimum_quantity ?? 0)}" data-catalog-field="minimum_quantity"></label>
        <label><span>Embalagem</span><input class="inline-input customer-catalog-number" type="number" step="0.01" min="0" value="${escapeAttr(row.package_size ?? 1)}" data-catalog-field="package_size"></label>
        <label><span>Validade</span><input class="inline-input" type="date" value="${escapeAttr(row.valid_until || "")}" data-catalog-field="valid_until"></label>
      </div>
      <div class="customer-sales-order-row">
        <label class="customer-sales-order-check">
          <input type="checkbox" data-sales-order-item>
          <span>Incluir no pedido</span>
        </label>
        <label>
          <span>Qtd. pedido</span>
          <input class="inline-input customer-catalog-number" type="number" step="0.01" min="0" value="${escapeAttr(row.minimum_quantity || 1)}" data-sales-order-quantity>
        </label>
        <strong>${row.negotiated_price ? money(row.negotiated_price) : money(row.sale_price)}</strong>
      </div>
      <label class="customer-catalog-note-field">
        <span>Observação comercial</span>
        <textarea class="inline-input customer-catalog-note" rows="2" data-catalog-field="public_notes" placeholder="Condição, observação comercial...">${escapeHtml(row.public_notes || "")}</textarea>
        <em>${number(row.history_purchase_days)} dia(s) de compra · médio ${money(row.history_avg_unit_price)}</em>
      </label>
    </article>
  `).join("");
}

function customerCatalogCandidateRows(rows = []) {
  if (!rows.length) {
    return `<div class="customer-crm-empty">Sem sugestões novas pelo histórico. Use a busca para adicionar produtos que o cliente ainda não comprou.</div>`;
  }
  return rows.map((row) => `
    <article class="customer-catalog-suggestion">
      <div class="customer-catalog-photo">${customerCatalogImageHtml(row)}</div>
      <div>
        <strong>${escapeHtml(row.name || "")}</strong>
        <span>${escapeHtml([row.source_code, row.brand_name].filter(Boolean).join(" · "))}</span>
        <em>${number(row.purchase_days)} dia(s) · ${money(row.avg_unit_price)} médio</em>
      </div>
      <button class="ghost-button" type="button" data-catalog-add-candidate="${escapeAttr(row.product_id)}">
        <i data-lucide="plus"></i>
        Negociar
      </button>
    </article>
  `).join("");
}

function customerCatalogSearchRows(rows = []) {
  if (!rows.length) {
    return `<div class="customer-crm-empty">Nenhum produto encontrado para a busca.</div>`;
  }
  return rows.map((row) => `
    <article class="customer-catalog-search-row">
      <div class="customer-catalog-photo">${customerCatalogImageHtml(row)}</div>
      <div>
        <strong>${escapeHtml(row.name || "")}</strong>
        <span>${escapeHtml([row.source_code, row.brand_name, row.category_name].filter(Boolean).join(" · "))}</span>
      </div>
      <em>${money(row.sale_price)}</em>
      <button class="ghost-button" type="button" data-catalog-add-search="${escapeAttr(row.product_id)}">
        <i data-lucide="plus"></i>
        Adicionar
      </button>
    </article>
  `).join("");
}

function customerSalesOrderDraftHtml(items = []) {
  if (!items.length) {
    return `<div class="customer-crm-empty">Itens avulsos adicionados ao pedido aparecem aqui.</div>`;
  }
  return items.map((row) => `
    <article class="customer-sales-order-extra" data-sales-extra-product-id="${escapeAttr(row.product_id)}">
      <div>
        <strong>${escapeHtml(row.name || "")}</strong>
        <span>${escapeHtml([row.source_code, row.brand_name, row.category_name].filter(Boolean).join(" · ")) || "Item avulso"}</span>
      </div>
      <input class="inline-input customer-catalog-number" type="number" step="0.01" min="0" value="${escapeAttr(row.quantity || 1)}" data-sales-extra-quantity title="Quantidade">
      <em>${money(row.sale_price)}</em>
      <button class="icon-button danger" type="button" title="Remover item avulso" data-sales-extra-remove="${escapeAttr(row.product_id)}"><i data-lucide="x"></i></button>
    </article>
  `).join("");
}

function renderCustomerSalesOrderDraft() {
  const mount = document.querySelector("#customerSalesOrderDraftItems");
  if (!mount) return;
  mount.innerHTML = customerSalesOrderDraftHtml(state.customerSalesOrderDraftItems || []);
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function customerSalesOrderSearchRows(rows = []) {
  if (!rows.length) {
    return `<div class="customer-crm-empty">Nenhum produto encontrado para adicionar ao pedido.</div>`;
  }
  return rows.map((row) => `
    <article class="customer-catalog-search-row">
      <div class="customer-catalog-photo">${customerCatalogImageHtml(row)}</div>
      <div>
        <strong>${escapeHtml(row.name || "")}</strong>
        <span>${escapeHtml([row.source_code, row.brand_name, row.category_name].filter(Boolean).join(" · "))}</span>
      </div>
      <em>${money(row.sale_price)}</em>
      <button class="ghost-button" type="button" data-sales-order-add-search="${escapeAttr(row.product_id)}">
        <i data-lucide="shopping-cart"></i>
        Pedido
      </button>
    </article>
  `).join("");
}

function customerCatalogHtml(payload = {}) {
  const summary = payload.summary || {};
  const catalog = payload.catalog || {};
  return `
    <section class="customer-catalog">
      <header class="customer-catalog-head">
        <div>
          <span>Catálogo do cliente</span>
          <strong>${escapeHtml(catalog.name || "Catálogo do cliente")}</strong>
          <p>Produtos selecionados para condição especial, incluindo itens recorrentes e oportunidades que o cliente ainda não comprou.</p>
        </div>
        <div class="customer-catalog-head-actions">
          <span class="status-chip ${escapeAttr(catalog.status || "draft")}">${escapeHtml(customerCatalogStatusLabel(catalog.status || "draft"))}</span>
          <button class="ghost-button" type="button" data-catalog-print><i data-lucide="printer"></i> Exportar PDF</button>
          <button class="primary-button" type="button" data-sales-order-pdf><i data-lucide="file-down"></i> Pedido PDF</button>
        </div>
      </header>
      <div class="customer-crm-kpis customer-catalog-kpis">
        <div><span>Itens</span><strong>${number(summary.items)}</strong></div>
        <div><span>Ativos</span><strong>${number(summary.active_items)}</strong></div>
        <div><span>Rascunho</span><strong>${number(summary.draft_items)}</strong></div>
        <div><span>Sugestões</span><strong>${number(summary.candidate_items)}</strong></div>
      </div>
      <div class="customer-catalog-toolbar">
        <div class="customer-catalog-search">
          <input class="inline-input" id="customerCatalogProductSearch" type="search" placeholder="Buscar produto por nome ou código para negociar">
          <button class="icon-button" type="button" title="Buscar produto" id="customerCatalogProductSearchButton"><i data-lucide="search"></i></button>
        </div>
        <select class="inline-input" id="customerCatalogStatus">${customerCatalogStatusOptions(catalog.status || "draft")}</select>
        <input class="inline-input" id="customerCatalogValidUntil" type="date" value="${escapeAttr(catalog.valid_until || "")}" title="Validade do catálogo">
        <button class="ghost-button" type="button" id="customerCatalogSave"><i data-lucide="save"></i> Salvar catálogo</button>
      </div>
      <label class="customer-sales-order-notes">
        <span>Observação do pedido</span>
        <textarea class="inline-input" id="customerSalesOrderNotes" rows="2" placeholder="Entrega, condição combinada, contato ou recado para o financeiro."></textarea>
      </label>
      <section class="customer-sales-order-free">
        <header>
          <div>
            <span>Pedido avulso</span>
            <strong>Adicionar produto fora do catálogo</strong>
          </div>
        </header>
        <div class="customer-catalog-search">
          <input class="inline-input" id="customerSalesOrderProductSearch" type="search" placeholder="Buscar qualquer produto para este pedido">
          <button class="icon-button" type="button" title="Buscar produto para pedido" id="customerSalesOrderProductSearchButton"><i data-lucide="search"></i></button>
        </div>
        <div class="customer-catalog-search-results" id="customerSalesOrderSearchResults"></div>
        <div class="customer-sales-order-extra-list" id="customerSalesOrderDraftItems">${customerSalesOrderDraftHtml(state.customerSalesOrderDraftItems || [])}</div>
      </section>
      <div class="customer-catalog-search-results" id="customerCatalogSearchResults"></div>
      <div class="customer-catalog-grid">
        <section class="customer-crm-section">
          <header><div><span>Itens negociados</span><strong>Condições por produto</strong></div></header>
          <div class="customer-catalog-item-list">${customerCatalogItemCards(payload.items || [])}</div>
        </section>
        <section class="customer-crm-section customer-catalog-suggestions">
          <header><div><span>Histórico recorrente</span><strong>Sugestões para negociar</strong></div></header>
          <div class="customer-catalog-suggestion-list">${customerCatalogCandidateRows(payload.candidate_items || [])}</div>
        </section>
      </div>
    </section>
  `;
}

function customerCatalogRowPayload(row) {
  const field = (name) => row.querySelector(`[data-catalog-field="${name}"]`)?.value || "";
  return {
    customer_id: state.customerCatalog?.customer?.id || state.selectedCustomerId,
    item_id: row.dataset.catalogItemId || "",
    product_id: row.dataset.catalogProductId || "",
    status: field("status"),
    negotiated_price: field("negotiated_price"),
    discount_pct: field("discount_pct"),
    minimum_quantity: field("minimum_quantity"),
    package_size: field("package_size"),
    valid_until: field("valid_until"),
    public_notes: field("public_notes"),
  };
}

function customerSalesOrderPayload() {
  const customerId = state.customerCatalog?.customer?.id || state.selectedCustomerId;
  const items = Array.from(document.querySelectorAll("#customerCatalogMount [data-catalog-product-id]"))
    .map((row) => ({
      product_id: row.dataset.catalogProductId || "",
      quantity: row.querySelector("[data-sales-order-item]")?.checked ? row.querySelector("[data-sales-order-quantity]")?.value || "" : "",
    }))
    .filter((item) => item.product_id && Number(item.quantity || 0) > 0);
  const extraItems = Array.from(document.querySelectorAll("#customerSalesOrderDraftItems [data-sales-extra-product-id]"))
    .map((row) => ({
      product_id: row.dataset.salesExtraProductId || "",
      quantity: row.querySelector("[data-sales-extra-quantity]")?.value || "",
    }))
    .filter((item) => item.product_id && Number(item.quantity || 0) > 0);
  return {
    customer_id: customerId,
    seller_name: state.auth?.user?.name || "",
    notes: document.querySelector("#customerSalesOrderNotes")?.value || "",
    items: [...items, ...extraItems],
  };
}

async function downloadCustomerSalesOrderPdf(button = null) {
  const payload = customerSalesOrderPayload();
  if (!payload.items.length) {
    showAppError("Pedido sem itens", "Marque um item negociado ou adicione um produto avulso com quantidade.");
    return;
  }
  if (button) button.disabled = true;
  try {
    const file = await apiPostBlob("/api/sales-order/pdf", payload);
    downloadBlob(file.blob, file.filename);
  } catch (error) {
    showAppError("Falha ao gerar pedido", error.message || "Revise os itens e tente novamente.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function refreshCustomerCatalogFromPost(path, payload, button = null) {
  if (button) button.disabled = true;
  try {
    renderCustomerCatalog(await apiPost(path, payload));
  } catch (error) {
    showAppError("Falha ao salvar catálogo", error.message || "Revise os campos e tente novamente.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function addCustomerCatalogProduct(productId, origin = "manual", button = null) {
  if (!productId) return;
  const customerId = state.customerCatalog?.customer?.id || state.selectedCustomerId;
  const candidate = (state.customerCatalog?.candidate_items || []).find((row) => row.product_id === productId) || {};
  await refreshCustomerCatalogFromPost("/api/customer/catalog/item/upsert", {
    customer_id: customerId,
    product_id: productId,
    status: "draft",
    origin,
    negotiated_price: candidate.avg_unit_price || candidate.sale_price || "",
  }, button);
}

async function searchCustomerCatalogProducts() {
  const input = document.querySelector("#customerCatalogProductSearch");
  const mount = document.querySelector("#customerCatalogSearchResults");
  if (!input || !mount) return;
  const query = input.value.trim();
  if (query.length < 2) {
    mount.innerHTML = `<div class="customer-crm-empty">Digite pelo menos 2 caracteres para buscar no cadastro completo de produtos.</div>`;
    return;
  }
  mount.innerHTML = `<div class="customer-crm-empty">Buscando produtos...</div>`;
  try {
    const data = await apiContract(`/api/products/search?q=${encodeURIComponent(query)}&limit=20`, "products_search.v1");
    mount.innerHTML = customerCatalogSearchRows(data.rows || []);
    if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
  } catch (error) {
    mount.innerHTML = `<div class="customer-crm-empty">Não foi possível buscar produtos.</div>`;
  }
}

async function searchCustomerSalesOrderProducts() {
  const input = document.querySelector("#customerSalesOrderProductSearch");
  const mount = document.querySelector("#customerSalesOrderSearchResults");
  if (!input || !mount) return;
  const query = input.value.trim();
  if (query.length < 2) {
    mount.innerHTML = `<div class="customer-crm-empty">Digite pelo menos 2 caracteres para buscar no cadastro de produtos.</div>`;
    return;
  }
  mount.innerHTML = `<div class="customer-crm-empty">Buscando produtos...</div>`;
  try {
    const data = await apiContract(`/api/products/search?q=${encodeURIComponent(query)}&limit=20`, "products_search.v1");
    state.customerSalesOrderSearchRows = data.rows || [];
    mount.innerHTML = customerSalesOrderSearchRows(state.customerSalesOrderSearchRows);
    if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
  } catch (error) {
    mount.innerHTML = `<div class="customer-crm-empty">Não foi possível buscar produtos para o pedido.</div>`;
  }
}

function addCustomerSalesOrderProduct(productId) {
  if (!productId) return;
  const catalogItem = (state.customerCatalog?.items || []).find((row) => row.product_id === productId);
  const searchRow = (state.customerSalesOrderSearchRows || []).find((row) => row.product_id === productId) || {};
  const existing = (state.customerSalesOrderDraftItems || []).find((row) => row.product_id === productId);
  if (catalogItem) {
    const card = Array.from(document.querySelectorAll("[data-catalog-product-id]")).find((row) => row.dataset.catalogProductId === productId);
    const check = card?.querySelector("[data-sales-order-item]");
    if (check) check.checked = true;
    return;
  }
  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + 1;
  } else {
    state.customerSalesOrderDraftItems = [
      ...(state.customerSalesOrderDraftItems || []),
      {
        product_id: productId,
        name: searchRow.name || "Produto",
        source_code: searchRow.source_code || "",
        brand_name: searchRow.brand_name || "",
        category_name: searchRow.category_name || "",
        sale_price: searchRow.sale_price || 0,
        quantity: 1,
      },
    ];
  }
  renderCustomerSalesOrderDraft();
}

function removeCustomerSalesOrderProduct(productId) {
  state.customerSalesOrderDraftItems = (state.customerSalesOrderDraftItems || []).filter((row) => row.product_id !== productId);
  renderCustomerSalesOrderDraft();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler imagem."));
    reader.readAsDataURL(file);
  });
}

async function uploadCustomerCatalogPhoto(input) {
  const row = input.closest("[data-catalog-product-id]");
  const file = input.files?.[0];
  const productId = row?.dataset.catalogProductId || "";
  if (!file || !productId) return;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    await apiPost("/api/product/media/upsert", {
      product_id: productId,
      media_upload: { data_url: dataUrl, mime_type: file.type },
      is_primary: true,
    });
    await loadCustomerCatalog(state.customerCatalog?.customer?.id || state.selectedCustomerId);
  } catch (error) {
    showAppError("Falha ao enviar foto", error.message || "Use uma imagem PNG, JPG ou WEBP de até 3 MB.");
  } finally {
    input.value = "";
  }
}

function customerCatalogPrintHtml(payload = {}) {
  const customer = payload.customer || {};
  const catalog = payload.catalog || {};
  const items = payload.items || [];
  const logo = companyProfileLogoPath();
  const logoUrl = logo ? new URL(logo, window.location.origin).href : "";
  const itemRows = items.map((row) => {
    const imageUrl = row.image_path ? new URL(row.image_path, window.location.origin).href : "";
    return `
      <article class="item">
        ${imageUrl ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(row.name || "")}">` : `<div class="no-img">Sem foto</div>`}
        <div>
          <strong>${escapeHtml(row.name || row.product_name_snapshot || "")}</strong>
          <span>${escapeHtml([row.source_code || row.source_code_snapshot, row.brand_name, row.unit].filter(Boolean).join(" · "))}</span>
          <p>${escapeHtml(row.public_notes || "Condição especial negociada para este cliente.")}</p>
        </div>
        <em>${row.negotiated_price ? money(row.negotiated_price) : "Consultar"}</em>
      </article>
    `;
  }).join("");
  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(catalog.name || "Catálogo")} - ${escapeHtml(customer.name || "Cliente")}</title>
        <style>
          body { margin: 0; color: #18231f; font-family: Arial, sans-serif; background: #f7f9f7; }
          main { max-width: 960px; margin: 0 auto; padding: 32px; display: grid; gap: 18px; }
          header { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; border-bottom: 2px solid #dfe8e1; padding-bottom: 18px; }
          header img { max-width: 150px; max-height: 70px; object-fit: contain; }
          h1 { margin: 0; font-size: 28px; line-height: 1.15; }
          p, span { color: #5d6d65; }
          .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
          .meta div, .item { background: white; border: 1px solid #dfe8e1; border-radius: 8px; }
          .meta div { padding: 10px; display: grid; gap: 4px; }
          .meta span { font-size: 11px; font-weight: 700; text-transform: uppercase; }
          .meta strong { font-size: 15px; }
          .items { display: grid; gap: 10px; }
          .item { display: grid; grid-template-columns: 104px minmax(0, 1fr) auto; gap: 14px; padding: 12px; align-items: center; break-inside: avoid; }
          .item img, .no-img { width: 104px; height: 104px; border-radius: 6px; object-fit: cover; background: #edf3ef; display: grid; place-items: center; color: #7c8b84; font-size: 12px; }
          .item div { display: grid; gap: 5px; }
          .item p { margin: 0; font-size: 13px; }
          .item em { font-style: normal; font-weight: 800; font-size: 18px; color: #116149; }
          @media print { body { background: white; } main { padding: 12mm; } }
        </style>
      </head>
      <body>
        <main>
          <header>
            <div>
              <p>${escapeHtml(catalog.name || "Catálogo do cliente")}</p>
              <h1>${escapeHtml(customer.name || "Cliente")}</h1>
              <span>${escapeHtml(customer.document || customer.source_code || "")}</span>
            </div>
            ${logoUrl ? `<img src="${escapeAttr(logoUrl)}" alt="${escapeAttr(appName())}">` : ""}
          </header>
          <section class="meta">
            <div><span>Status</span><strong>${escapeHtml(customerCatalogStatusLabel(catalog.status || "draft"))}</strong></div>
            <div><span>Validade</span><strong>${escapeHtml(shortDate(catalog.valid_until) || "A combinar")}</strong></div>
            <div><span>Itens</span><strong>${number(items.length)}</strong></div>
          </section>
          <section class="items">${itemRows || "<p>Nenhum item negociado.</p>"}</section>
        </main>
      </body>
    </html>
  `;
}

function openCustomerCatalogPrint() {
  if (!state.customerCatalog) return;
  const popup = window.open("", "_blank");
  if (!popup) {
    showAppError("Pop-up bloqueado", "Libere pop-ups para exportar o catálogo em PDF.");
    return;
  }
  popup.document.open();
  popup.document.write(customerCatalogPrintHtml(state.customerCatalog));
  popup.document.close();
  setTimeout(() => popup.print(), 350);
}

function bindCustomerCatalogEvents(mount) {
  mount.querySelector("#customerCatalogProductSearchButton")?.addEventListener("click", searchCustomerCatalogProducts);
  mount.querySelector("#customerCatalogProductSearch")?.addEventListener("input", () => {
    clearTimeout(state.customerCatalogSearchTimer);
    state.customerCatalogSearchTimer = setTimeout(searchCustomerCatalogProducts, 350);
  });
  mount.querySelector("#customerSalesOrderProductSearchButton")?.addEventListener("click", searchCustomerSalesOrderProducts);
  mount.querySelector("#customerSalesOrderProductSearch")?.addEventListener("input", () => {
    clearTimeout(state.customerSalesOrderSearchTimer);
    state.customerSalesOrderSearchTimer = setTimeout(searchCustomerSalesOrderProducts, 350);
  });
  mount.querySelector("#customerCatalogSave")?.addEventListener("click", (event) => {
    refreshCustomerCatalogFromPost("/api/customer/catalog/upsert", {
      customer_id: state.customerCatalog?.customer?.id || state.selectedCustomerId,
      status: mount.querySelector("#customerCatalogStatus")?.value || "draft",
      valid_until: mount.querySelector("#customerCatalogValidUntil")?.value || "",
    }, event.currentTarget);
  });
  mount.querySelectorAll("[data-catalog-save-item]").forEach((button) => {
    button.addEventListener("click", () => refreshCustomerCatalogFromPost(
      "/api/customer/catalog/item/upsert",
      customerCatalogRowPayload(button.closest("[data-catalog-item-id]")),
      button,
    ));
  });
  mount.querySelectorAll("[data-catalog-delete-item]").forEach((button) => {
    button.addEventListener("click", () => refreshCustomerCatalogFromPost(
      "/api/customer/catalog/item/delete",
      {
        customer_id: state.customerCatalog?.customer?.id || state.selectedCustomerId,
        item_id: button.closest("[data-catalog-item-id]")?.dataset.catalogItemId || "",
      },
      button,
    ));
  });
  mount.querySelectorAll("[data-catalog-photo]").forEach((input) => {
    input.addEventListener("change", () => uploadCustomerCatalogPhoto(input));
  });
  mount.querySelectorAll("[data-catalog-add-candidate]").forEach((button) => {
    button.addEventListener("click", () => addCustomerCatalogProduct(button.dataset.catalogAddCandidate, "history", button));
  });
  mount.addEventListener("click", (event) => {
    const button = event.target.closest("[data-catalog-add-search]");
    if (button) addCustomerCatalogProduct(button.dataset.catalogAddSearch, "manual", button);
    const salesSearchButton = event.target.closest("[data-sales-order-add-search]");
    if (salesSearchButton) addCustomerSalesOrderProduct(salesSearchButton.dataset.salesOrderAddSearch);
    const salesRemoveButton = event.target.closest("[data-sales-extra-remove]");
    if (salesRemoveButton) removeCustomerSalesOrderProduct(salesRemoveButton.dataset.salesExtraRemove);
    if (event.target.closest("[data-catalog-print]")) openCustomerCatalogPrint();
    const salesOrderButton = event.target.closest("[data-sales-order-pdf]");
    if (salesOrderButton) downloadCustomerSalesOrderPdf(salesOrderButton);
  });
}

function renderCustomerCatalog(payload = null) {
  if (!payload) return;
  state.customerCatalog = payload;
  const mount = document.querySelector("#customerCatalogMount");
  if (!mount) return;
  mount.innerHTML = customerCatalogHtml(payload);
  bindCustomerCatalogEvents(mount);
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

async function loadCustomerCatalog(customerId) {
  const mount = document.querySelector("#customerCatalogMount");
  if (mount) mount.innerHTML = `<article class="customer-mix-card loading-card">Carregando catálogo negociado...</article>`;
  try {
    const query = new URLSearchParams({ id: customerId, period_days: state.periodDays || "180" });
    renderCustomerCatalog(await apiContract(`/api/customer/catalog?${query.toString()}`, "customer_catalog.v1"));
  } catch (error) {
    if (mount) mount.innerHTML = `<article class="customer-mix-card danger">Não foi possível carregar o catálogo do cliente.</article>`;
  }
}

function customerCrmHtml(payload = {}) {
  const profile = payload.profile || {};
  const tags = Array.isArray(profile.tags) ? profile.tags : [];
  const updated = profile.updated_at ? `Atualizado em ${shortDate(profile.updated_at)}` : "Ainda sem edição manual";
  return `
    <section class="customer-crm-management">
      <header>
        <div>
          <span>Gestão comercial</span>
          <strong>Plano de relacionamento</strong>
        </div>
        <span class="status-chip ${escapeAttr(customerCrmStatusTone(profile.commercial_status || "follow_up"))}">${escapeHtml(customerCrmStatusLabel(profile.commercial_status || "follow_up"))}</span>
      </header>
      <div class="customer-crm-form">
        <label>
          <span>Responsável</span>
          <input data-crm-field="owner_name" value="${escapeAttr(profile.owner_name || "")}" placeholder="Nome do vendedor">
        </label>
        <label>
          <span>Status comercial</span>
          <select data-crm-field="commercial_status">${customerCrmStatusOptions(profile.commercial_status || "follow_up")}</select>
        </label>
        <label>
          <span>Prioridade</span>
          <select data-crm-field="priority">${customerCrmPriorityOptions(profile.priority || "normal")}</select>
        </label>
        <label>
          <span>Próxima ação</span>
          <select data-crm-field="next_action">${customerCrmActionOptions(profile.next_action || "")}</select>
        </label>
        <label>
          <span>Data da ação</span>
          <input type="date" data-crm-field="next_action_at" value="${escapeAttr(profile.next_action_at || "")}">
        </label>
        <label>
          <span>Tags</span>
          <input data-crm-field="tags" value="${escapeAttr(tags.join(", "))}" placeholder="recorrente, contrato, limpeza">
        </label>
        <label class="wide">
          <span>Observação interna</span>
          <textarea data-crm-field="internal_notes" rows="3" placeholder="Condições, histórico do contato e próximos cuidados.">${escapeHtml(profile.internal_notes || "")}</textarea>
        </label>
      </div>
      <footer>
        <span>${escapeHtml(updated)} · Prioridade ${escapeHtml(customerCrmPriorityLabel(profile.priority || "normal"))}</span>
        <button class="primary-button" type="button" id="customerCrmSave">Salvar CRM</button>
      </footer>
    </section>
  `;
}

function customerCrmPayload(mount) {
  const field = (name) => mount.querySelector(`[data-crm-field="${name}"]`)?.value || "";
  return {
    customer_id: state.customerCrm?.customer?.id || state.selectedCustomerId,
    owner_name: field("owner_name"),
    commercial_status: field("commercial_status"),
    priority: field("priority"),
    next_action: field("next_action"),
    next_action_at: field("next_action_at"),
    tags: field("tags"),
    internal_notes: field("internal_notes"),
  };
}

function refreshCustomerCrmRow(payload = {}) {
  const customerId = payload.customer?.id || state.selectedCustomerId;
  const profile = payload.profile || {};
  const row = (state.customers || []).find((item) => item.id === customerId);
  if (!row) return;
  Object.assign(row, {
    crm_owner_name: profile.owner_name || "",
    crm_status: profile.commercial_status || "",
    crm_priority: profile.priority || "",
    crm_next_action: profile.next_action || "",
    crm_next_action_at: profile.next_action_at || "",
    crm_updated_at: profile.updated_at || "",
  });
  customersTable?.setRows(state.customers || []);
}

function bindCustomerCrmEvents(mount) {
  mount.querySelector("#customerCrmSave")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const payload = requireContract(await apiPost("/api/customer/crm/upsert", customerCrmPayload(mount)), "customer_crm.v1", "/api/customer/crm/upsert");
      renderCustomerCrm(payload);
      refreshCustomerCrmRow(payload);
    } catch (error) {
      showAppError("Falha ao salvar CRM", error.message || "Revise os campos e tente novamente.");
    } finally {
      button.disabled = false;
    }
  });
}

function renderCustomerCrm(payload = null) {
  if (!payload) return;
  state.customerCrm = payload;
  const mount = document.querySelector("#customerCrmMount");
  if (!mount) return;
  mount.innerHTML = customerCrmHtml(payload);
  bindCustomerCrmEvents(mount);
}

async function loadCustomerCrm(customerId) {
  const mount = document.querySelector("#customerCrmMount");
  if (mount) mount.innerHTML = `<section class="customer-crm-management loading-card">Carregando gestão comercial...</section>`;
  try {
    renderCustomerCrm(await apiContract(`/api/customer/crm?id=${encodeURIComponent(customerId)}`, "customer_crm.v1"));
  } catch (error) {
    if (mount) mount.innerHTML = `<section class="customer-crm-management danger">Não foi possível carregar a gestão comercial.</section>`;
  }
}

function bindCustomerProfileTabs(body, customerId) {
  body.querySelectorAll("[data-customer-profile-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.customerProfileTab;
      body.querySelectorAll("[data-customer-profile-tab]").forEach((item) => item.classList.toggle("active", item === button));
      body.querySelectorAll("[data-customer-profile-panel]").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.customerProfilePanel === tab);
      });
      if (tab === "catalog" && customerId && !state.customerCatalog) loadCustomerCatalog(customerId);
    });
  });
}

function customerProfileDetailHtml(payload = {}) {
  const summary = payload.summary || {};
  const products = payload.products || [];
  const services = payload.services || [];
  const categories = payload.categories || [];
  const relationship = payload.relationship || {};
  const customer = payload.customer || {};
  const identity = [
    customer.document ? `Doc. ${customer.document}` : "",
    customer.source_code ? `Código ${customer.source_code}` : "",
    customer.customer_type ? `Tipo ${customer.customer_type}` : "",
  ].filter(Boolean).join(" · ");
  const status = relationship.status || "muted";
  const daysSince = relationship.days_since === null || relationship.days_since === undefined ? "-" : `${number(relationship.days_since)}d`;
  return `
    <article class="customer-crm-profile">
      <header class="customer-crm-head">
        <div>
          <span>Ficha CRM do cliente</span>
          <strong>${escapeHtml(customer.name || "Cliente")}</strong>
          <p>${escapeHtml(identity || payload.contract_hint || "Histórico comercial importado.")}</p>
        </div>
        <span class="status-chip ${escapeAttr(status)}">${escapeHtml(relationship.label || "Carteira")}</span>
      </header>
      <div class="customer-crm-kpis">
        <div><span>Receita total</span><strong>${money(summary.revenue)}</strong></div>
        <div><span>Ticket médio</span><strong>${money(summary.avg_ticket)}</strong></div>
        <div><span>Dias com compra</span><strong>${number(summary.purchase_days)}</strong></div>
        <div><span>Sem compra</span><strong>${escapeHtml(daysSince)}</strong></div>
        <div><span>Produtos</span><strong>${number(summary.products)}</strong></div>
        <div><span>Serviços</span><strong>${number(summary.services)}</strong></div>
        <div><span>Receita produtos</span><strong>${money(summary.product_revenue)}</strong></div>
        <div><span>Receita serviços</span><strong>${money(summary.service_revenue)}</strong></div>
      </div>
      <div id="customerCrmMount">
        <section class="customer-crm-management loading-card">Carregando gestão comercial...</section>
      </div>
      <div class="customer-profile-tabs" role="tablist" aria-label="Ficha do cliente">
        <button class="active" type="button" data-customer-profile-tab="overview">Compras</button>
        <button type="button" data-customer-profile-tab="catalog">Catálogo do cliente</button>
      </div>
      <div class="customer-profile-panels">
        <section class="customer-profile-panel active" data-customer-profile-panel="overview">
          <div class="customer-crm-grid">
            <section class="customer-crm-panel">
              <h3>Leitura comercial</h3>
              <p>${escapeHtml(relationship.reason || payload.contract_hint || "Acompanhe o histórico antes do próximo contato.")}</p>
              <dl>
                <div><dt>Primeira compra</dt><dd>${shortDate(summary.first_purchase)}</dd></div>
                <div><dt>Última compra</dt><dd>${shortDate(summary.last_purchase)}</dd></div>
                <div><dt>Intervalo médio</dt><dd>${summary.avg_gap_days === null || summary.avg_gap_days === undefined ? "-" : `${number(summary.avg_gap_days)}d`}</dd></div>
                <div><dt>Próxima estimada</dt><dd>${shortDate(relationship.estimated_next_purchase)}</dd></div>
              </dl>
            </section>
            <section class="customer-crm-panel">
              <h3>Composição da receita</h3>
              <p>${escapeHtml(payload.contract_hint || "Histórico por produto e serviço.")}</p>
              ${customerCompositionHtml(summary)}
            </section>
          </div>
          <section class="customer-crm-section">
            <header>
              <div>
                <span>Mix de produtos</span>
                <strong>Itens comprados</strong>
              </div>
              <em>${number(summary.core_share)}% no mix principal</em>
            </header>
            <div class="table-wrap customer-mix-table customer-crm-table">
              <table>
                <thead>
                  <tr>
                    <th class="num">#</th>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th>Marca</th>
                    <th>Papel</th>
                    <th class="num">Qtd.</th>
                    <th class="num">Receita</th>
                    <th class="num">Part.</th>
                    <th class="num">Preço médio</th>
                  </tr>
                </thead>
                <tbody>${customerMixRows(products)}</tbody>
              </table>
            </div>
          </section>
          <div class="customer-crm-grid customer-crm-grid-two">
            <section class="customer-crm-section">
              <header><div><span>Serviços</span><strong>Serviços comprados</strong></div></header>
              <div class="table-wrap customer-crm-table">
                <table>
                  <thead>
                    <tr>
                      <th class="num">#</th>
                      <th>Serviço</th>
                      <th class="num">Qtd.</th>
                      <th class="num">Receita</th>
                      <th class="num">Líquido</th>
                      <th class="num">Dias</th>
                      <th class="num">Médio</th>
                    </tr>
                  </thead>
                  <tbody>${customerServiceRows(services)}</tbody>
                </table>
              </div>
            </section>
            <section class="customer-crm-section">
              <header><div><span>Categorias</span><strong>Concentração do mix</strong></div></header>
              <div class="table-wrap customer-crm-table">
                <table>
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th class="num">Produtos</th>
                      <th class="num">Qtd.</th>
                      <th class="num">Receita</th>
                    </tr>
                  </thead>
                  <tbody>${customerCategoryRows(categories)}</tbody>
                </table>
              </div>
            </section>
          </div>
          <div class="customer-crm-grid customer-crm-grid-two">
            <section class="customer-crm-section">
              <header><div><span>Série mensal</span><strong>Ritmo de compras</strong></div></header>
              <div class="customer-month-list">${customerMonthlyRows(payload.monthly || [])}</div>
            </section>
            <section class="customer-crm-section">
              <header><div><span>Histórico recente</span><strong>Últimas compras</strong></div></header>
              <div class="customer-crm-events">${customerRecentPurchaseRows(payload.recent_purchases || [])}</div>
            </section>
          </div>
        </section>
        <section class="customer-profile-panel" data-customer-profile-panel="catalog">
          <div id="customerCatalogMount" class="customer-catalog-mount">
            <article class="customer-mix-card loading-card">Carregando catálogo negociado...</article>
          </div>
        </section>
      </div>
    </article>
  `;
}

function renderCustomerProfileDetail(payload = null) {
  if (!payload) return;
  const body = document.querySelector("#modalBody");
  state.customerCatalog = null;
  state.customerCrm = null;
  state.customerSalesOrderDraftItems = [];
  state.customerSalesOrderSearchRows = [];
  if (body) {
    body.innerHTML = customerProfileDetailHtml(payload);
    bindCustomerProfileTabs(body, payload.customer?.id || state.selectedCustomerId);
  }
  if (payload.customer?.id) loadCustomerCrm(payload.customer.id);
  if (payload.customer?.id) loadCustomerCatalog(payload.customer.id);
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

async function openCustomerProfile(customerId) {
  if (!customerId) return;
  state.selectedCustomerId = customerId;
  customersTable?.refresh();
  openModal(
    "Ficha CRM do cliente",
    `<article class="customer-mix-card loading-card">Carregando ficha do cliente...</article>`,
    null,
    { modalClass: "customer-mix-modal customer-crm-modal" },
  );
  try {
    const query = new URLSearchParams({ id: customerId, period_days: state.periodDays || "180" });
    renderCustomerProfileDetail(await api(`/api/customer/mix?${query.toString()}`));
  } catch (error) {
    const body = document.querySelector("#modalBody");
    if (body) body.innerHTML = `<article class="customer-mix-card danger">Não foi possível carregar a ficha do cliente.</article>`;
  }
}

function openCustomerMix(customerId) {
  return openCustomerProfile(customerId);
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
  const backendDays = Number(row?.days_since);
  if (Number.isFinite(backendDays)) return Math.max(0, backendDays);
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
      reason: `${number(days)} dias sem compra, com ${money(revenue)} no período.`,
      decisions: ["Contatar agora", "Enviar oferta de recompra", "Investigar perda", "Não priorizar"],
    };
  }
  if (index < 5 || revenue >= avgRevenue * 1.4) {
    return {
      kind: "protect",
      label: "Proteger",
      tone: "good",
      score: 800 + revenue,
      reason: `${money(revenue)} de receita no recorte atual.`,
      decisions: ["Registrar acompanhamento", "Agendar contato", "Criar condição especial", "Sem ação agora"],
    };
  }
  if (purchases >= 5) {
    return {
      kind: "follow",
      label: "Acompanhar",
      tone: "info",
      score: 650 + purchases * 20 + revenue,
      reason: `${number(purchases)} compras no período.`,
      decisions: ["Acompanhar recorrência", "Oferecer complementar", "Manter contato leve", "Sem ação agora"],
    };
  }
  if (purchases <= 1) {
    return {
      kind: "convert",
      label: "Converter",
      tone: "muted",
      score: 420 + revenue,
      reason: "Cliente com compra única no período.",
      decisions: ["Tentar segunda compra", "Adicionar a lista de nutrição", "Investigar perfil", "Sem ação agora"],
    };
  }
  return {
    kind: "monitor",
    label: "Monitorar",
    tone: "muted",
    score: 500 + revenue,
    reason: "Cliente em ritmo intermediário.",
    decisions: ["Monitorar cadência", "Registrar observação", "Oferecer complementar", "Sem ação agora"],
  };
}

function renderCustomerRelationshipQueue(rows = state.customers || []) {
  const target = document.querySelector("#customerRelationshipQueue");
  if (!target) return;
  state.quickActions = state.quickActions || new Map();
  if (!rows.length) {
    target.innerHTML = `<div class="customer-queue-empty">Sem clientes no período. Aumente o recorte ou confira a importação.</div>`;
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
          <div><dt>Última</dt><dd>${days === null ? "-" : `${number(days)}d`}</dd></div>
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
    { label: "Ativos até 30d", value: rows.filter((row) => {
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
    { label: "Alta frequência", value: highFrequency.length },
    { label: "Compra unica", value: Math.max(0, rows.length - repeatCustomers.length) },
  ];
  const charts = [
    `
      <article class="customer-dashboard-card wide">
        <div>
          <span>Concentração top 5</span>
          <strong>${number(topFiveShare)}%</strong>
          <p>${compactMoney(topFiveRevenue)} de ${compactMoney(revenue)} está nos cinco maiores clientes.</p>
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
          <span>Recorrência</span>
          <strong>${number(repeatCustomers.length)}</strong>
          <p>${number(highFrequency.length)} cliente(s) com 5 ou mais compras.</p>
        </div>
      </article>
    `,
    `
      <article class="customer-chart-card">
        <header><span>Receita</span><strong>Clientes líderes</strong></header>
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
        <header><span>Atividade</span><strong>Última compra</strong></header>
        <div class="customer-chart">${customerChartRows(recencyRows)}</div>
      </article>
    `,
    `
      <article class="customer-chart-card">
        <header><span>Perfil</span><strong>Recorrência da carteira</strong></header>
        <div class="customer-chart">${customerChartRows(profileRows)}</div>
      </article>
    `,
    `
      <article class="customer-dashboard-card wide">
        <div>
          <span>Top 10</span>
          <strong>${compactMoney(topTenRevenue)}</strong>
          <p>${topOne.name ? `Lider atual: ${escapeHtml(topOne.name)} com ${money(topOne.revenue)}.` : "Sem lider no período."}</p>
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
      title: top.name ? `Proteger ${top.name}` : "Sem cliente líder",
      body: top.name ? `${money(top.revenue)} no período. Cliente líder deve ter rotina de acompanhamento, não apenas contato reativo.` : "A importação ainda não trouxe movimento suficiente.",
    },
    {
      title: `Concentração ${number(topFiveShare)}%`,
      body: topFiveShare >= 40 ? "A carteira depende bastante dos maiores clientes. Vale acompanhar perda de ritmo nesse grupo." : "A receita está menos concentrada nos cinco maiores clientes.",
    },
    {
      title: stale?.name ? `Reativar ${stale.name}` : "Sem cliente grande parado",
      body: stale?.name ? `${number(stale.recency_days)} dias desde a última compra, com ${money(stale.revenue)} no período.` : frequent?.name ? `${frequent.name} é o cliente mais frequente, com ${number(frequent.purchases)} compras.` : "Sem sinal forte de reativação no recorte.",
    },
  ]);
}

function renderCustomers(rows = []) {
  state.customers = rows;
  state.selectedCustomerId = "";
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
      title: top.name ? `Maior cliente: ${top.name}` : "Sem cliente líder",
      body: top.name ? `${money(top.revenue)} no período, em ${number(top.purchases)} compras. Bom ponto de partida para proteger recorrência.` : "Ainda não há movimento suficiente para destacar clientes.",
      actions: top.name
        ? [
            {
              label: "Registrar contato",
              title: "Contato com cliente relevante",
              action: "customer_contact_decision",
              target_type: "customer",
              target_id: top.name,
              scope: top.name,
              decisions: ["Contatar agora", "Cliente acompanhado", "Não é prioridade", "Adicionar observação"],
            },
          ]
        : [],
    },
    {
      title: "Próxima ação comercial",
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
          decisions: ["Montar lista de contato", "Reativar em risco", "Acompanhar recorrência", "Sem ação agora"],
        },
      ],
    },
    {
      title: "Leitura operacional",
      body: "Última compra e quantidade de compras ajudam a decidir se o contato é recompra, reativação ou acompanhamento normal.",
    },
  ]);
  const table = ensureCustomersTable();
  if (table) table.setRows(rows);
}

function serviceRows(rows = []) {
  if (!rows.length) {
    return `<tr><td colspan="4"><strong>Nenhum serviço no período</strong><span class="muted-line">Aumente o recorte ou confira a importação de serviços.</span></td></tr>`;
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
    ["Serviços no ranking", number(rows.length), "blue"],
    ["Quantidade", number(quantity), ""],
    ["Receita bruta", compactMoney(revenue), "green"],
    ["Líquido / receita", `${number(netShare)}%`, "amber"],
  ]);
  insightCards("#serviceInsights", [
    {
      title: top.name ? `Serviço líder: ${top.name}` : "Sem serviço líder",
      body: top.name ? `${money(top.revenue)} de receita e ${money(top.net_revenue)} líquido no período.` : "Ainda não há serviços suficientes para destacar um líder.",
      actions: top.name
        ? [
            {
              label: "Avaliar serviço",
              title: "Decisão sobre serviço líder",
              action: "service_leader_decision",
              target_type: "service",
              target_id: top.name,
              scope: top.name,
              decisions: ["Manter oferta", "Revisar preço", "Transformar em pacote", "Investigar margem"],
            },
          ]
        : [],
    },
    {
      title: "Uso da aba",
      body: "Compare volume e receita líquida para entender se serviço está ajudando margem ou apenas ocupando agenda operacional.",
      actions: [
        {
          label: "Revisar serviços",
          title: "Revisão em lote de serviços",
          action: "service_bulk_review",
          target_type: "service_group",
          target_id: "services_view",
          target_ids: rows.map((row) => row.name),
          scope: "Serviços exibidos no período",
          bulk: true,
          decisions: ["Revisar preços", "Padronizar pacotes", "Manter como está", "Investigar margem"],
        },
      ],
    },
    {
      title: "Próxima decisão",
      body: "Serviços frequentes e pouco líquidos podem pedir reajuste, pacote ou revisão de execução.",
    },
  ]);
  document.querySelector("#servicesTable").innerHTML = serviceRows(rows);
}
