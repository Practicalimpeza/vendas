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
        body: `${number(Number(summary.urgent || 0) + Number(summary.buy_now || 0))} item(ns) com risco de ruptura ou compra imédiata.`,
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
        body: `${number(summary.mix_review || 0)} item(ns) precisam de decisão antes de voltar para sugestões.`,
      },
      {
        status: "watch",
        tone: "neutral",
        title: "Acompanhar giro",
        body: `${number(summary.watch || 0)} item(ns) pedem observação, sem compra automática.`,
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
        <strong>Nenhuma decisão crítica no estoque agora.</strong>
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
          <div><dt>Sugestão</dt><dd>${number(suggestion)}</dd></div>
          <div><dt>Valor</dt><dd>${money(row.estimated_value)}</dd></div>
        </dl>
        <p>${escapeHtml(row.reason || row.status_label || "Conferir antes da próxima compra.")}</p>
        <div class="stock-queue-actions">
          <button class="secondary-button" type="button" data-stock-queue-filter="${escapeAttr(row.status || "")}">Ver semelhantes</button>
          <button class="action-button" type="button" data-stock-queue-product="${escapeAttr(row.product_id || "")}">Abrir produto</button>
        </div>
      </article>
    `;
  }).join("");
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
        <span>Telefone para cotação</span>
        <input class="inline-input" id="supplierPhoneInput" value="${inputValue(row.contact_phone)}" placeholder="(00) 00000-0000" />
      </label>
      <label class="modal-field">
        <span>Pedido mínimo</span>
        <input class="inline-input" id="supplierMinimumInput" inputmode="decimal" value="${inputValue(row.minimum_order_value || "")}" placeholder="0,00" />
      </label>
      <div class="modal-preview good">Ao salvar, a marca passa a usar esse fornecedor nas cotações e reposição do ${escapeHtml(appName())}.</div>
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
                supplier_rule_label: `Confirmado no ${appName()}`,
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

function demandSignalText(row) {
  const labels = {
    burst: "rajada recente",
    single_spike: "pico isolado recente",
    sparse: "histórico esparso",
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
            <span class="muted-line">segurança ${number(row.safety_stock)} - pacote ${number(row.package_size)} - tendência ${number(row.trend_index)} - demanda ${escapeHtml(demandSignalText(row))}</span>
            ${mixActions}
          </td>
        </tr>
      `;
    })
    .join("");
}

function supplierText(row) {
  if (!row.supplier_configured) return "a configurar";
  const days = row.supplier_days_to_order === null ? "sem mínimo" : `${number(row.supplier_days_to_order)} dias p/ pedido`;
  const adjustment = Number(row.supplier_target_adjustment_days || 0);
  const signed = adjustment > 0 ? `+${adjustment}` : `${adjustment}`;
  const phone = row.supplier_phone ? ` - ${row.supplier_phone}` : " - sem telefone";
  const difficulty = row.supplier_difficulty === "unknown" ? "mínimo a cadastrar" : row.supplier_difficulty;
  return `${difficulty} - ciclo ${row.review_cycle_days}d - alvo ${signed}d - ${days}${phone}`;
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
  if (group.inferred_count) return { label: "Conferir inferências", cls: "warn" };
  if (group.minimum_order_value <= 0) return { label: "Sem pedido mínimo", cls: "warn" };
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
  if (group.inferred_count) return { label: "Conferir inferências", detail: `${number(group.inferred_count)} marca(s) foram inferidas e precisam de confirmação.`, action: "Conferir" };
  if (group.minimum_order_value <= 0) return { label: "Preencher valor", detail: `Sem mínimo, o ${appName()} não sabe quando acumular compra.`, action: "Editar" };
  if (!group.contact_phone && !group.contact_email) return { label: "Informar contato", detail: "Sem telefone/e-mail, cotação e pedido ainda dependem de busca manual.", action: "Editar" };
  if (group.average_lead_time_days <= 0) return { label: "Informar lead time", detail: "Sem prazo médio, a sugestão de compra fica menos precisa.", action: "Editar" };
  return { label: "Cadastro utilizável", detail: "Fornecedor pronto para cotação e compra.", action: "Editar" };
}

function supplierSummary(groups = supplierGroups()) {
  const configured = groups.filter((group) => group.supplier_id);
  const operational = configured.filter((group) => supplierStatus(group).cls === "good");
  const items = [
    ["Fornecedores", number(configured.length), "blue"],
    ["Operacionais", number(operational.length), "green"],
    ["Sem mínimo", number(configured.filter((group) => group.minimum_order_value <= 0).length), "amber"],
    ["Sem contato", number(configured.filter((group) => !group.contact_phone && !group.contact_email).length), "amber"],
    ["Inferidos", number(groups.filter((group) => group.inferred_count > 0).length), "amber"],
    ["Marcas pendentes", number((state.suppliers || []).filter((row) => row.supplier_rule_origin === "missing").length), ""],
    ["Cobertura média", `${number(configured.length ? configured.reduce((sum, group) => sum + supplierCompleteness(group), 0) / configured.length : 0)}%`, ""],
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
    return `<div class="info-card supplier-focus-card good"><strong>Cadastro de fornecedores utilizável</strong><span>Os fornecedores filtrados já têm mínimo, contato e regras principais conferidas.</span></div>`;
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
    { label: "Sem pedido mínimo", value: configured.filter((group) => group.minimum_order_value <= 0).length, filter: "missing_minimum" },
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
        <span>Saúde cadastral</span>
        <strong>${number(avgCompleteness)}%</strong>
        <p>${number(leadTimeCount)} fornecedor(es) já têm lead time para melhorar reposição.</p>
      </div>
      <div class="supplier-donut" style="--value: ${Math.max(0, Math.min(100, avgCompleteness))}">
        <span>${number(avgCompleteness)}%</span>
      </div>
    </article>
    <article class="supplier-dashboard-card">
      <div>
        <span>Concentração</span>
        <strong>${topSupplier ? `${number(topShare)}%` : "0%"}</strong>
        <p>${topSupplier ? `${topSupplier.label} concentra a maior receita mapeada.` : "Ainda não há fornecedor líder mapeado."}</p>
      </div>
    </article>
    <article class="supplier-chart-card">
      <header><strong>Pendências do cadastro</strong><span>Clique para abrir a mesa filtrada</span></header>
      <div class="supplier-chart">${supplierChartRows(pendingItems)}</div>
    </article>
    <article class="supplier-chart-card">
      <header><strong>Top fornecedores por receita</strong><span>Dependencia e peso comercial</span></header>
      <div class="supplier-chart">${supplierChartRows(topRevenue.length ? topRevenue : [{ label: "Sem receita mapeada", value: 0 }], compactMoney)}</div>
    </article>
    <article class="supplier-chart-card">
      <header><strong>Completude operacional</strong><span>Quanto o fornecedor já está pronto para compra</span></header>
      <div class="supplier-chart">${supplierChartRows(completenessItems)}</div>
    </article>
    <article class="supplier-dashboard-card wide">
      <div>
        <span>Insight ${escapeHtml(appName())}</span>
        <strong>Priorize o que reduz atrito de compra</strong>
        <p>O melhor próximo ganho é completar mínimo, contato e lead time dos fornecedores com maior receita. Depois, confirme inferências de marca para evitar cotar produto no fornecedor errado.</p>
      </div>
    </article>
  `;
}

let suppliersTable = null;

const SUPPLIER_STATUS_FILTER_LABELS = {
  missing_minimum: "Sem pedido mínimo",
  missing_phone: "Sem contato",
  inferred: "Conferir inferências",
  missing_supplier: "Mapear marcas",
};

function supplierDirectoryColumns() {
  return [
    {
      id: "supplier_name",
      label: "Fornecedor",
      type: "text",
      value: (g) => g.supplier_name || "",
      text: (g) => `${g.supplier_name || ""} ${g.brands.map((row) => row.brand_name || "").join(" ")}`,
      render: (g) => {
        const brands = g.brands.slice(0, 4).map((row) => row.brand_name).filter(Boolean).join(", ");
        return `<strong class="supplier-name">${escapeHtml(g.supplier_name)}</strong><span class="muted-line">${escapeHtml(brands || "Marcas a mapear")}</span>`;
      },
    },
    {
      id: "situacao",
      label: "Situação",
      type: "enum",
      value: (g) => supplierStatus(g).label,
      render: (g) => {
        const status = supplierStatus(g);
        const completeness = supplierCompleteness(g);
        return `<span class="status-chip ${escapeAttr(status.cls)}">${escapeHtml(status.label)}</span><span class="muted-line">${number(completeness)}% completo</span><span class="supplier-completeness" aria-hidden="true"><i style="width:${Math.max(3, completeness)}%"></i></span>`;
      },
    },
    {
      id: "contato",
      label: "Contato",
      type: "text",
      value: (g) => g.contact_phone || g.contact_email || "Pendente",
      render: (g) => `<strong>${escapeHtml(g.contact_phone || g.contact_email || "Pendente")}</strong><span class="muted-line">${escapeHtml(g.contact_name || g.contact_email || "")}</span>`,
    },
    {
      id: "minimum_order_value",
      label: "Mínimo",
      type: "money",
      align: "num",
      value: (g) => Number(g.minimum_order_value || 0),
      render: (g) => (g.minimum_order_value > 0 ? money(g.minimum_order_value) : "Pendente"),
    },
    { id: "brand_count", label: "Marcas", type: "int", align: "num", value: (g) => Number(g.brand_count || 0) },
    { id: "product_count", label: "Produtos", type: "int", align: "num", value: (g) => Number(g.product_count || 0) },
    { id: "revenue", label: "Receita", type: "money", align: "num", value: (g) => Number(g.revenue || 0) },
    { id: "stock_units", label: "Estoque", type: "number", align: "num", value: (g) => Number(g.stock_units || 0) },
    {
      id: "next_action",
      label: "Próxima ação",
      type: "text",
      sortable: false,
      filter: false,
      searchable: false,
      value: (g) => supplierNextAction(g).label,
      render: (g) => {
        const next = supplierNextAction(g);
        return `<strong>${escapeHtml(next.action)}</strong><span class="muted-line">${escapeHtml(next.label)}</span>`;
      },
    },
  ];
}

function ensureSuppliersTable() {
  if (suppliersTable) return suppliersTable;
  const mount = document.querySelector("#suppliersTableMount");
  if (!mount) return null;
  suppliersTable = createDataTable(mount, {
    key: "suppliers",
    columns: supplierDirectoryColumns(),
    rows: [],
    searchPlaceholder: "Buscar fornecedor ou marca…",
    rowKey: (g) => g.supplier_id || `missing:${g.brands[0]?.brand_id || g.supplier_name}`,
    rowAttrs: (g) => ({ "data-supplier-id": g.supplier_id || "", class: `supplier-directory-row ${supplierStatus(g).cls}` }),
    onRowClick: (g) => openSupplierProfileModal(g.supplier_id || ""),
    emptyTitle: "Nenhum fornecedor encontrado",
    emptyHint: "Revise a busca, o filtro ou importe mais dados de fornecedores.",
    initialSort: [{ id: "revenue", dir: "desc" }],
  });
  return suppliersTable;
}

function setSupplierTableSearch(term) {
  ensureSuppliersTable()?.setSearch(term || "");
}

function setSupplierTableStatus(statusKey) {
  const table = ensureSuppliersTable();
  if (!table) return;
  const label = SUPPLIER_STATUS_FILTER_LABELS[statusKey];
  table.setFilter("situacao", label ? { kind: "set", values: [label] } : null);
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
            <span class="trust-line ${escapeAttr(row.supplier_rule_origin || "manual")}">${escapeHtml(row.supplier_rule_label || `Confirmado no ${appName()}`)}</span>
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
  const allGroups = supplierGroups();
  supplierSummary(allGroups);
  document.querySelector("#supplierDashboardCharts").innerHTML = supplierDashboardCharts(allGroups);
  document.querySelector("#supplierFocus").innerHTML = supplierFocusCards(allGroups);
  const table = ensureSuppliersTable();
  if (table) table.setRows(allGroups);
  document.querySelector("#supplierBrandTable").innerHTML = supplierBrandRows((rows || state.suppliers || []).slice(0, 250));
}

function setSupplierMode(mode) {
  setModuleMode({
    stateKey: "supplierMode",
    modeAttr: "data-supplier-mode",
    operationalSelector: "#supplierOperational",
    dashboardSelector: "#supplierDashboard",
  }, mode);
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
  const rows = productsTable ? productsTable.getRows() : (state.productFilteredRows || []);
  if (!rows.length) return;
  const organizationId = rows[0]?.organization_id || "";
  const tableState = productsTable ? productsTable.getState() : { q: "", filters: {} };
  const term = tableState.q ? `"${tableState.q}"` : "sem busca textual";
  const filterCount = Object.keys(tableState.filters || {}).length;
  openModal(
    "Editar mix em massa",
    `
      <div class="modal-context">
        <strong>${number(rows.length)} produto(s) no filtro atual</strong>
        <span>Busca: ${escapeHtml(term)} · ${number(filterCount)} filtro(s) ativo(s)</span>
      </div>
      <label class="modal-field">
        <span>Aplicar decisão comum</span>
        <select class="inline-input" id="bulkMixDecision">
          <option value="force_buy">Forcar mais uma compra</option>
          <option value="drop">Descontinuar</option>
          <option value="clear">Limpar decisão manual</option>
        </select>
      </label>
      <label class="modal-field">
        <span>Observação</span>
        <textarea class="inline-input quick-note" id="bulkMixNote" rows="4" placeholder="Ex.: linha do fornecedor será descontinuada, categoria sazonal, revisar tudo na próxima compra..."></textarea>
      </label>
      <div class="modal-preview warn">A decisão será aplicada em todos os produtos do filtro atual. Use filtros antes de salvar para reduzir o escopo.</div>
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

