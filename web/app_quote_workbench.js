// Compras: mesa do fornecedor, itens, quantidades e fluxo da cotação.

function quoteWorkbenchPanel(workbench) {
  const totals = workbench?.totals || {};
  const supplier = workbench?.supplier || {};
  const formation = workbench?.order_formation || {};
  const next = quoteCommandState(workbench);
  const quoteTotals = quoteSelectedTotals();
  const customization = quoteTotals.customization || {};
  const currentQuote = workbench?.current_quote || null;
  const activeQuote = currentQuote || quoteRequestFromWorkbench(["sent", "responded"], workbench);
  const minimum = Number(supplier.minimum_order_value || 0);
  const value = Number(quoteTotals.estimated || totals.estimated_value_in_quote || 0);
  const items = Number(quoteTotals.itemCount || totals.items_in_quote || 0);
  const cycleDays = Number(formation.days_to_order || 0);
  const missing = Math.max(0, minimum - value);
  const pctRaw = minimum > 0 ? (value / minimum) * 100 : (value > 0 ? 100 : 0);
  const pct = Math.min(100, Math.max(0, pctRaw));
  const minText = minimum <= 0
    ? "Sem mínimo cadastrado"
    : value >= minimum
      ? `${number(pctRaw)}% do mínimo`
      : `faltam ${money(missing)}`;
  const statusLabel = activeQuote ? statusText(activeQuote.status) : "Montando";
  const canDiscardQuote = (currentQuote?.status || "") === "draft";
  const metaParts = [
    statusLabel,
    supplier.contact_name || "",
    supplier.contact_phone || "",
  ].filter(Boolean);
  return `
    <section class="quote-workbench-panel composer ${escapeAttr(next.tone)}">
      <div class="quote-workbench-compact">
        <button class="qback" type="button" data-quote-step="supplier" aria-label="Voltar para fornecedores">&larr; Fornecedores</button>
        <div class="quote-workbench-title">
          <span>Fornecedor</span>
          <h2>${escapeHtml(supplier.name || "Fornecedor")}</h2>
          <div class="quote-workbench-meta">${metaParts.map((part) => `<em>${escapeHtml(part)}</em>`).join("")}</div>
        </div>
        <div class="quote-order-composer" aria-label="Pedido em montagem">
          <div class="quote-order-items">
            <span>Itens</span>
            <strong>${number(items)}</strong>
            <em>${number(quoteTotals.units || 0)} un. · ${number(customization.boxes || 0)} cx</em>
          </div>
          <div class="quote-order-total">
            <span>Total</span>
            <strong>${money(value)}</strong>
            <em>pedido atual</em>
          </div>
          <div class="quote-order-minimum">
            <span>Formação do pedido</span>
            <strong class="${missing > 0 ? "warn" : "ok"}">${minimum > 0 ? money(minimum) : "-"}</strong>
            <i class="quote-minimum-bar" aria-hidden="true"><b style="width:${pct}%"></b></i>
            <em>${escapeHtml(minText)}${cycleDays > 0 && missing > 0 ? ` · ${number(cycleDays)}d` : ""}</em>
          </div>
        </div>
        <div class="quote-head-actions">
          ${canDiscardQuote ? `<button class="secondary-button compact quote-head-discard" type="button" data-quote-command="discard">Descartar</button>` : ""}
          <span class="save-state quote-head-state" id="quoteWorkbenchStatus" aria-live="polite"></span>
        </div>
      </div>
    </section>
  `;
}

function quoteCommandState(workbench) {
  const rows = workbench?.rows || [];
  const totals = quoteSelectedTotals();
  const supplier = workbench?.supplier || {};
  const formation = workbench?.order_formation || {};
  const currentQuote = workbench?.current_quote || null;
  const quoteAwaitingResponse = quoteRequestFromWorkbench(["sent"]);
  const quoteResponded = quoteRequestFromWorkbench(["responded"]);
  const minimum = Number(supplier.minimum_order_value || 0);
  const missing = Math.max(0, minimum - totals.estimated);
  const suggestedPending = rows.filter((row) => isAutomaticQuoteSuggestion(row) && !row.in_quote).length;
  const basketPending = rows.filter((row) => row.basket_role === "fill_selected" && !row.in_quote).length;
  const alertsIncluded = rows.filter((row) => row.in_quote && (row.alerts || []).length).length;
  const suggestedTotal = rows.filter((row) => isAutomaticQuoteSuggestion(row)).length;
  if (quoteAwaitingResponse) {
    return {
      tone: "info",
      title: "Cotação enviada",
      body: "Disponibilidade, quantidade confirmada, prazo e observação ficam na resposta do fornecedor.",
      command: "response",
      label: "Resposta",
    };
  }
  if (quoteResponded) {
    return {
      tone: "good",
      title: "Resposta registrada",
      body: "Itens confirmados disponíveis para formar o pedido e projetar estoque.",
      command: "confirm",
      label: "Pedido",
    };
  }
  if (currentQuote?.status === "draft" && totals.itemCount && !(minimum > 0 && missing > 0)) {
    return {
      tone: "info",
      title: "Rascunho de cotação",
      body: `${number(totals.itemCount)} item(ns) no rascunho, ${money(totals.estimated)} sem impostos.`,
      command: "quote",
      label: "Cotação",
    };
  }
  if (!totals.itemCount && suggestedTotal) {
    return {
      tone: "warn",
      title: "Sugestões disponíveis",
      body: `${number(suggestedTotal)} item(ns) com referência calculada nesta janela.`,
      command: "restore",
      label: "Sugestões",
    };
  }
  if (alertsIncluded) {
    return {
      tone: "danger",
      title: "Sinais nos itens incluídos",
      body: `${number(alertsIncluded)} item(ns) incluídos têm sinal operacional.`,
      command: "alerts",
      label: "Sinais",
    };
  }
  if (minimum > 0 && missing > 0) {
    const longCycle = formation.strategy === "wait_or_negotiate";
    const candidateReview = formation.strategy === "candidate_review";
    return {
      tone: "warn",
      title: longCycle ? "Ciclo longo" : candidateReview ? "Mínimo com candidatos" : "Abaixo do mínimo",
      body: formation.reason || `Faltam ${money(missing)} para o pedido mínimo de ${escapeHtml(supplier.name || "fornecedor")}.`,
      command: suggestedPending ? "suggested" : basketPending ? "formation" : "formation",
      label: suggestedPending ? "Sugestões" : basketPending ? "Cesta" : "Mínimo",
    };
  }
  if (totals.itemCount) {
    return {
      tone: "good",
      title: "Itens na cotação",
      body: `${number(totals.itemCount)} item(ns), ${money(totals.estimated)} sem impostos.`,
      command: "quote",
      label: "Cotação",
    };
  }
  return {
    tone: "muted",
    title: "Sem valor na janela",
    body: "Fornecedor sem itens com valor calculado nesta leitura.",
    command: "suggested",
    label: "Produtos",
  };
}

function isAutomaticQuoteSuggestion(row) {
  if (row?.quote_suggestion_eligible !== undefined) return Boolean(row.quote_suggestion_eligible);
  const status = row?.status || "";
  const suggested = Number(row?.suggested_quantity || 0);
  if (suggested <= 0) return false;
  if (["urgent", "buy_now"].includes(status)) return true;
  return status === "mix_review" && Number(row?.demand_30 || 0) > 0;
}

function quoteRequestFromWorkbench(statuses = [], workbench = state.quoteWorkbench) {
  const wanted = new Set(statuses);
  const current = workbench?.current_quote || null;
  if (current?.status && wanted.has(current.status)) return current;
  if (current?.status) return null;
  return (workbench?.quote_history || []).find((quote) => wanted.has(quote.status || "")) || null;
}

function quoteAwaitingResponse(workbench = state.quoteWorkbench) {
  return quoteRequestFromWorkbench(["sent"], workbench);
}

function quoteJourneyState() {
  const workbench = state.quoteWorkbench;
  const currentQuote = workbench?.current_quote || null;
  const quoteStatus = currentQuote?.status || "";
  const sentQuote = quoteAwaitingResponse(workbench);
  const respondedQuote = quoteRequestFromWorkbench(["responded"], workbench);
  const hasSentQuote = Boolean(sentQuote || respondedQuote);
  const selectedSupplier = Boolean(state.selectedQuoteSupplierId && workbench);
  const totals = quoteSelectedTotals();
  const orders = state.purchaseOrders || [];
  const supplierOrders = orders.filter((row) => !state.selectedQuoteSupplierId || row.supplier_id === state.selectedQuoteSupplierId);
  const pendingOrders = supplierOrders.filter((row) => row.status === "pending_confirmation");
  const quotePendingOrder = pendingOrders.find((row) => respondedQuote?.id && row.quote_request_id === respondedQuote.id) || null;
  const openOrders = supplierOrders.filter((row) => ["approved", "sent", "partial_received"].includes(row.status));
  const command = selectedSupplier ? quoteCommandState(workbench) : null;
  const stages = [
    {
      key: "supplier",
      label: "Mesa",
      state: state.quoteStep === "supplier" ? "active" : selectedSupplier ? "done" : "active",
      hint: selectedSupplier ? workbench.supplier?.name || "Selecionado" : `${number((state.quoteSuppliers || []).length)} fornecedores`,
    },
    {
      key: "assembly",
      label: "Montagem",
      state: state.quoteStep === "assembly" ? "active" : totals.itemCount || currentQuote || hasSentQuote ? "done" : selectedSupplier ? "pending" : "pending",
      hint: hasSentQuote ? "cotados" : selectedSupplier ? `${number(totals.itemCount)} incluidos` : "-",
    },
    {
      key: "review",
      label: "Revisão",
      state: state.quoteStep === "review" ? "active" : hasSentQuote ? "done" : totals.itemCount || quoteStatus === "draft" ? "pending" : "pending",
      hint: hasSentQuote ? "enviado" : totals.itemCount ? "pronta" : "-",
    },
    {
      key: "response",
      label: "Resposta",
      state: sentQuote ? "active" : respondedQuote ? "done" : "pending",
      hint: sentQuote ? "aguardando" : respondedQuote ? "registrada" : "-",
    },
    {
      key: "confirm",
      label: quotePendingOrder ? "Confirmar pedido" : "Gerar pedido",
      state: quotePendingOrder || respondedQuote ? "active" : "pending",
      hint: quotePendingOrder ? "revisão" : respondedQuote ? "pronto" : "-",
    },
    {
      key: "arrival",
      label: "Chegada",
      state: openOrders.length ? "active" : "pending",
      hint: openOrders.length ? `${number(openOrders.length)} aberto(s)` : "-",
    },
  ];
  if (sentQuote) {
    return {
      stages,
      tone: "info",
      title: "Aguardando aprovação do fornecedor",
      body: "A cotação já foi enviada. Agora salve disponibilidade, quantidade confirmada, prazo ou observação.",
      command: "response",
      label: "Registrar resposta",
    };
  }
  if (quotePendingOrder || pendingOrders.length) {
    return {
      stages,
      tone: "warn",
      title: "Revisar pedido",
      body: "O pedido foi gerado a partir dos itens confirmados. Confira quantidades finais antes de aprovar.",
      command: "confirm",
      label: "Confirmar pedido",
    };
  }
  if (respondedQuote) {
    return {
      stages,
      tone: "good",
      title: "Gerar pedido",
      body: "Resposta registrada. Gere o pedido para projetar estoque e evitar recompra.",
      command: "confirm",
      label: "Gerar pedido",
    };
  }
  if (openOrders.length && (!selectedSupplier || !currentQuote)) {
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
      title: "Mesa pronta para explorar",
    body: "Combine lentes, organize a lista e abra um fornecedor quando fizer sentido para você.",
      command: "supplier",
      label: "Explorar mesa",
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
        <span>Mesa em movimento</span>
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

function selectedQuoteRows() {
  return (state.quoteWorkbench?.rows || []).filter((row) => row.in_quote && Number(row.quote_quantity || 0) > 0);
}

function quoteOrderUnitCost(row) {
  return Number(row?.cost_no_tax || row?.unit_cost || row?.cost_with_tax || 0);
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
  return apiPost("/api/products/purchase-settings", payload);
}

function quotePackageCount(row, quantity = Number(row?.quote_quantity || 0)) {
  const packageSize = Number(row?.purchase_package_size || row?.package_size || 0);
  if (packageSize <= 1 || Number(quantity || 0) <= 0) return 0;
  return Math.ceil(Number(quantity || 0) / packageSize);
}

function quotePackageUnitLabel(unit) {
  const normalized = String(unit || "UN").toUpperCase();
  return {
    CX: "cx",
    FD: "fardo",
    SC: "saco",
    UN: "un",
  }[normalized] || normalized.toLowerCase();
}

function quotePackageDisplayLabel(unit, hasPackage = false) {
  const label = quotePackageUnitLabel(unit);
  return hasPackage && label === "un" ? "cx" : label;
}

function quoteCoverageFromQuantity(row, quantity) {
  const daily = Number(row?.forecast_daily_demand || row?.avg_daily_window || 0);
  if (daily <= 0) return null;
  const stock = Number(row?.stock_units || 0);
  const openOrder = Number(row?.open_order_quantity || 0);
  return (stock + openOrder + Number(quantity || 0)) / daily;
}

function quoteCoverageText(days) {
  return days === null || days === undefined || !Number.isFinite(Number(days))
    ? "sem giro"
    : quoteCoverageDaysLabel(Number(days));
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
    out: Math.max(0, (state.quoteWorkbench?.rows || []).filter(isAutomaticQuoteSuggestion).length - items.length),
    customization,
  };
}

function quoteWorkbenchFilterCounts(workbench = state.quoteWorkbench) {
  const rows = workbench?.rows || [];
  const totals = workbench?.totals || {};
  const isBasketFill = (row) => ["fill_selected", "fill_candidate"].includes(row.basket_role || "");
  return {
    all: Number(totals.total_products || rows.length || 0),
    included: rows.filter((row) => row.in_quote).length,
    suggested: rows.filter(isAutomaticQuoteSuggestion).length,
    alerts: rows.filter((row) => (row.alerts || []).length > 0).length,
    stockout: rows.filter(quoteIsStockoutDemand).length,
    package: rows.filter(quoteNeedsPackageReview).length,
    engine: rows.filter(quoteHasEngineSignal).length,
    formation: rows.filter((row) => isBasketFill(row) && !isAutomaticQuoteSuggestion(row)).length,
    outmix: rows.filter((row) => ["drop", "out_of_mix"].includes(row.mix_status)).length,
  };
}

function updateQuoteFilterPills(workbench = state.quoteWorkbench) {
  const counts = quoteWorkbenchFilterCounts(workbench);
  document.querySelectorAll("#quoteDetail .qf-pill").forEach((pill) => {
    const filter = pill.dataset.filter || "all";
    const badge = pill.querySelector("em");
    if (badge && Object.prototype.hasOwnProperty.call(counts, filter)) {
      badge.textContent = number(counts[filter]);
    }
  });
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
  const technical = Number(row.technical_quantity || row.rounded_need || 0);
  const packageSize = Number(row.purchase_package_size || row.package_size || 1) || 1;
  const rawNeed = row.raw_need === null || row.raw_need === undefined
    ? Math.max(0, targetStock - stock - openOrder)
    : Number(row.raw_need || 0);
  const roundedByPackage = packageSize > 1 && suggested > 0 && Math.abs(suggested - rawNeed) > 0.01;
  return { stock, openOrder, targetStock, suggested, technical, packageSize, rawNeed, roundedByPackage };
}

function quoteFilterNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof parseInputNumber === "function") return parseInputNumber(value);
  const parsed = Number(String(value).replace(".", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function quoteRowSuggestedQuantity(row) {
  return Number(row.suggested_quantity || row.recommended_quote_quantity || row.technical_quantity || row.rounded_need || 0);
}

function quoteSuggestionBasis(row) {
  const suggested = Number(row.suggested_quantity || 0);
  const basket = Number(row.recommended_quote_quantity || 0);
  const technical = Number(row.technical_quantity || row.rounded_need || 0);
  if (suggested > 0) return { quantity: suggested, label: "sug.", tone: "", source: "Sugestao calculada" };
  if (basket > 0) return { quantity: basket, label: "cesta", tone: "basket", source: "Cesta para minimo" };
  if (technical > 0) return { quantity: technical, label: "ref.", tone: "muted", source: "Quantidade tecnica de referencia" };
  return { quantity: 0, label: "", tone: "muted", source: "Sem sugestao" };
}

function quoteRowDisplayQuantity(row) {
  return row.in_quote ? Number(row.quote_quantity || 0) : quoteRowSuggestedQuantity(row);
}

function quoteRowImpactValue(row) {
  return quoteRowDisplayQuantity(row) * quoteOrderUnitCost(row);
}

function quoteVisibleMetrics(rows = quoteWorkbenchRowsForCurrentView()) {
  return rows.reduce(
    (acc, row) => {
      const quantity = quoteRowDisplayQuantity(row);
      const cost = quoteOrderUnitCost(row);
      acc.value += quantity * cost;
      acc.units += quantity;
      acc.boxes += quotePackageCount(row, quantity);
      if (row.in_quote) acc.selected += 1;
      if (quoteRowSuggestedQuantity(row) > 0) acc.withSuggestion += 1;
      return acc;
    },
    { value: 0, units: 0, boxes: 0, selected: 0, withSuggestion: 0 },
  );
}

function quoteExplainTitle(row) {
  const math = quoteSuggestionMath(row);
  const daily = Number(row.forecast_daily_demand || 0);
  const parts = [
    row.purchase_decision_label ? `Leitura: ${row.purchase_decision_label}` : "",
    daily > 0 ? `Demanda usada: ${number(daily)} un/dia (${row.demand_quantile_used || "quantil"})` : "",
    row.lead_time_days ? `Prazo: ${number(row.lead_time_days)}d` : "",
    row.review_cycle_days ? `Ciclo: ${number(row.review_cycle_days)}d` : "",
    row.product_rebuy_interval_days ? `Recompra item: ${number(row.product_rebuy_interval_days)}d` : "",
    row.order_horizon_receipt_coverage_days ? `Cobertura pós-entrega: ${number(row.order_horizon_receipt_coverage_days)}d` : "",
    row.order_horizon_days ? `Horizonte final: ${number(row.order_horizon_days)}d` : "",
    `Alvo de estoque: ${number(math.targetStock)} un.`,
    `Estoque ERP: ${number(math.stock)} un.`,
  ].filter(Boolean);
  if (math.openOrder > 0) parts.push(`Pedido aberto: ${number(math.openOrder)} un.`);
  if (row.negative_stock_limited) parts.push("Estoque negativo tratado como 0 para não inflar compra-teste.");
  parts.push(`Necessidade bruta: ${number(math.rawNeed)} un.`);
  if (math.technical > 0) parts.push(`Quantidade tecnica: ${number(math.technical)} un.`);
  if (row.coverage_identity_label) parts.push(`Politica: ${row.coverage_identity_label}`);
  if (row.package_coverage_days) parts.push(`1 embalagem cobre aprox. ${number(row.package_coverage_days)}d`);
  if (math.packageSize > 1) parts.push(`Embalagem: ${number(math.packageSize)} un.`);
  parts.push(`Sugestão final: ${number(math.suggested)} un.`);
  if (row.after_purchase_coverage_days) parts.push(`Cobertura depois da sugestão: ${number(row.after_purchase_coverage_days)}d`);
  if (row.basket_decision_label) parts.push(`Cesta: ${row.basket_decision_label}`);
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
    coverage: Number(row.projected_coverage_days ?? row.coverage_days ?? 9999),
    horizon: Number(row.order_horizon_days || row.review_cycle_days || 0),
    target: Number(row.order_up_to || 0),
    suggested: quoteRowSuggestedQuantity(row),
    calc: Number(math.rawNeed || 0),
    package: Number(row.purchase_package_size || row.package_size || 1),
    cost,
    quantity,
    after: quoteAfterCoverage(row) ?? -1,
    total: quantity * cost,
    impact: quoteRowImpactValue(row),
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
  const only = state.quoteWorkbenchOnly || "all";
  const minDemand = quoteFilterNumber(state.quoteWorkbenchMinDemand);
  const minValue = quoteFilterNumber(state.quoteWorkbenchMinValue);
  const maxCoverage = quoteFilterNumber(state.quoteWorkbenchMaxCoverage);
  let visible = rows;
  if (filter === "included") visible = visible.filter((r) => r.in_quote);
  else if (filter === "suggested") visible = visible.filter(isAutomaticQuoteSuggestion);
  else if (filter === "alerts") visible = visible.filter((r) => (r.alerts || []).length > 0);
  else if (filter === "stockout") visible = visible.filter(quoteIsStockoutDemand);
  else if (filter === "package") visible = visible.filter(quoteNeedsPackageReview);
  else if (filter === "engine") visible = visible.filter(quoteHasEngineSignal);
  else if (filter === "formation") visible = visible.filter((r) => ["fill_selected", "fill_candidate"].includes(r.basket_role || "") && !isAutomaticQuoteSuggestion(r));
  else if (filter === "outmix") visible = visible.filter((r) => ["drop", "out_of_mix"].includes(r.mix_status));
  if (only === "selected") visible = visible.filter((r) => r.in_quote);
  else if (only === "unselected") visible = visible.filter((r) => !r.in_quote);
  else if (only === "open_order") visible = visible.filter(quoteHasOpenOrder);
  else if (only === "no_cost") visible = visible.filter((r) => quoteOrderUnitCost(r) <= 0);
  else if (only === "box") visible = visible.filter((r) => Number(r.purchase_package_size || r.package_size || 1) > 1);
  else if (only === "modified") visible = visible.filter((r) => r.in_quote && quoteRowSuggestedQuantity(r) > 0 && Math.abs(Number(r.quote_quantity || 0) - quoteRowSuggestedQuantity(r)) > 0.0001);
  if (minDemand > 0) visible = visible.filter((r) => Number(r.forecast_daily_demand || r.avg_daily_window || 0) >= minDemand);
  if (minValue > 0) visible = visible.filter((r) => quoteRowImpactValue(r) >= minValue);
  if (maxCoverage > 0) {
    visible = visible.filter((r) => {
      const coverage = r.projected_coverage_days ?? r.coverage_days;
      return coverage !== null && coverage !== undefined && Number(coverage) <= maxCoverage;
    });
  }
  if (term) {
    visible = visible.filter((r) => `${r.name || ""} ${r.supplier_reference || ""} ${r.source_code || ""} ${r.brand_name || ""}`.toLowerCase().includes(term));
  }
  return sortQuoteWorkbenchRows(visible);
}

function toggleQuoteWorkbenchSort(key) {
  const current = state.quoteWorkbenchSort || {};
  const numericDefaultDesc = new Set(["included", "stock", "demand", "coverage", "horizon", "target", "suggested", "calc", "package", "cost", "quantity", "after", "total", "impact"]);
  const nextDir = current.key === key
    ? current.dir === "asc" ? "desc" : "asc"
    : numericDefaultDesc.has(key) ? "desc" : "asc";
  state.quoteWorkbenchSort = { key, dir: nextDir };
  state.quoteWorkbenchGroup = "flat";
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
  const visibleMetrics = quoteVisibleMetrics(visible);
  const minimum = Number(state.quoteWorkbench?.supplier?.minimum_order_value || 0);
  const missing = Math.max(0, minimum - totals.estimated);
  const minimumText = minimum > 0
    ? missing > 0 ? `faltam ${money(missing)}` : "mínimo ok"
    : "sem mínimo";
  return `
    <span><strong>${number(visible.length)}</strong> visíveis</span>
    <span><strong>${money(visibleMetrics.value)}</strong></span>
    <span class="${missing > 0 ? "warn" : ""}">${minimumText}</span>
  `;
}

function updateQuoteLiveSummary() {
  const summary = document.querySelector("#quoteLiveSummary");
  if (summary) summary.innerHTML = quoteLiveSummaryMarkup();
}

function quoteOrderDockContent() {
  const totals = quoteSelectedTotals();
  const customization = totals.customization || {};
  const minimum = Number(state.quoteWorkbench?.supplier?.minimum_order_value || 0);
  const missing = Math.max(0, minimum - totals.estimated);
  const alerts = (state.quoteWorkbench?.rows || []).filter((row) => row.in_quote && (row.alerts || []).length).length;
  const minLabel = minimum <= 0 ? "sem mínimo" : missing > 0 ? `faltam ${money(missing)}` : "mínimo ok";
  const issueCount = alerts + Number(customization.unroundedPackages || 0) + Number(customization.missingCost || 0);
  return `
    <div class="quote-order-dock-main">
      <span>Cotação</span>
      <strong>${number(totals.itemCount)} item(ns) · ${money(totals.estimated)}</strong>
      <em>${number(totals.units || 0)} un. · ${number(customization.boxes || 0)} cx · ${escapeHtml(minLabel)}</em>
    </div>
    <div class="quote-order-dock-pills" aria-label="Estado da cotação">
      <span class="${missing > 0 ? "warn" : "ok"}">${escapeHtml(minLabel)}</span>
        <span class="${issueCount ? "warn" : "ok"}">${issueCount ? `${number(issueCount)} pendência(s)` : "sem pendências críticas"}</span>
      ${customization.modified ? `<span>${number(customization.modified)} ajuste(s)</span>` : ""}
    </div>
    <button class="action-button" type="button" data-quote-command="quote" ${totals.itemCount ? "" : "disabled"}>Revisar cotação</button>
  `;
}

function updateQuoteOrderDock() {
  const dock = document.querySelector("#quoteOrderDock");
  if (dock) dock.innerHTML = quoteOrderDockContent();
}

function updateQuoteAssemblyOverview() {
  if (state.quoteWorkbench) renderQuoteWorkbenchHead(state.quoteWorkbench);
}

function captureQuoteScrollState() {
  const detail = document.querySelector("#quoteDetail");
  if (!detail || detail.classList.contains("hidden")) return null;
  const wrap = detail.querySelector(".quote-items-wrap, #quoteItemsTable .nexo-dt-scroll");
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
    const wrap = detail?.querySelector(".quote-items-wrap, #quoteItemsTable .nexo-dt-scroll");
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

const QUOTE_WORKBENCH_SESSION_KEY = "nexo:quote-workbench:open";

function rememberOpenQuoteWorkbench(supplierId = state.selectedQuoteSupplierId) {
  if (!supplierId) return;
  try {
    sessionStorage.setItem(QUOTE_WORKBENCH_SESSION_KEY, JSON.stringify({
      supplierId,
      windowDays: state.quoteWindowDays || "90",
      step: state.quoteStep === "review" ? "review" : "assembly",
    }));
  } catch (error) {
    /* sessão indisponível: a mesa só não será restaurada no refresh */
  }
}

function clearOpenQuoteWorkbench() {
  try {
    sessionStorage.removeItem(QUOTE_WORKBENCH_SESSION_KEY);
  } catch (error) {
    /* sessão indisponível */
  }
}

async function restoreOpenQuoteWorkbench() {
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(QUOTE_WORKBENCH_SESSION_KEY) || "null");
  } catch (error) {
    saved = null;
  }
  const supplierId = saved?.supplierId || "";
  if (!supplierId) return false;
  const exists = (state.quoteSuppliers || []).some((row) => row.supplier_id === supplierId);
  if (!exists) {
    clearOpenQuoteWorkbench();
    return false;
  }
  if (saved.windowDays) {
    state.quoteWindowDays = String(saved.windowDays);
    const field = document.querySelector("#quoteWindowDays");
    if (field) field.value = state.quoteWindowDays;
  }
  state.quoteStep = saved.step === "review" ? "review" : "supplier";
  await loadQuoteSupplierWorkbench(supplierId, { restore: true });
  return true;
}

function setQuoteStep(step) {
  const hasSupplier = Boolean(state.selectedQuoteSupplierId && (state.quoteWorkbench || state.quoteWorkbenchLoadingSupplierId));
  if (step !== "supplier" && !hasSupplier) step = "supplier";
  if (step === "quote" || step === "send") step = "review";
  if (step === "items") step = "assembly";
  if (step !== "supplier" && step !== "assembly" && step !== "review") step = "assembly";
  if (step === "review" && !quoteSelectedTotals().itemCount) step = "assembly";
  state.quoteStep = step;
  if (state.quoteStep === "supplier") clearOpenQuoteWorkbench();
  else rememberOpenQuoteWorkbench();
  updateQuoteFlow();
}

function updateQuoteFlow() {
  const hasWorkbench = Boolean(state.selectedQuoteSupplierId && state.quoteWorkbench);
  const hasSupplier = Boolean(state.selectedQuoteSupplierId && (state.quoteWorkbench || state.quoteWorkbenchLoadingSupplierId));
  const totals = quoteSelectedTotals();
  const reviewDone = Boolean(quoteRequestFromWorkbench(["sent", "responded"]));
  if (!hasSupplier) state.quoteStep = "supplier";
  if (state.quoteStep === "quote" || state.quoteStep === "send") state.quoteStep = "review";
  if (state.quoteStep === "items") state.quoteStep = "assembly";
  if (state.quoteStep !== "supplier" && state.quoteStep !== "assembly" && state.quoteStep !== "review") state.quoteStep = "assembly";
  if (state.quoteStep === "review" && !totals.itemCount) state.quoteStep = "assembly";
  document.querySelector("#quotes")?.classList.toggle("quote-supplier-mode", state.quoteStep === "supplier");
  document.querySelector("#quotes")?.classList.toggle("quote-review-mode", state.quoteStep === "review");

  const supplierStage = document.getElementById("quoteSupplierStage");
  const detail = document.getElementById("quoteDetail");
  const final = document.getElementById("quoteFinal");
  const head = document.getElementById("quoteWorkbenchHead");
  if (supplierStage) supplierStage.hidden = state.quoteStep !== "supplier";
  if (head) head.hidden = state.quoteStep !== "assembly";
  if (detail) detail.hidden = state.quoteStep !== "assembly";
  if (final) final.hidden = state.quoteStep !== "review" || !totals.itemCount;

  document.querySelectorAll("#quotes .qstep").forEach((btn) => {
    const name = btn.dataset.quoteStep;
    btn.classList.toggle("active", name === state.quoteStep);
    btn.classList.toggle("done",
      (name === "supplier" && hasSupplier && state.quoteStep !== "supplier")
      || (name === "assembly" && totals.itemCount && state.quoteStep === "review")
      || (name === "review" && reviewDone && state.quoteStep !== "review")
    );
    btn.disabled = (name === "assembly" && !hasSupplier) || (name === "review" && (!hasSupplier || !totals.itemCount));
  });

  const supplierHint = document.getElementById("qstepSupplierHint");
  if (supplierHint) {
    supplierHint.textContent = hasWorkbench
      ? state.quoteWorkbench.supplier.name
      : state.quoteWorkbenchLoadingSupplierId
        ? quoteSupplierById(state.quoteWorkbenchLoadingSupplierId)?.supplier_name || "Carregando"
      : `${(state.quoteSuppliers || []).length} fornecedores`;
  }
  const assemblyHint = document.getElementById("qstepAssemblyHint");
  if (assemblyHint) {
    if (state.quoteWorkbenchLoadingSupplierId && !hasWorkbench) assemblyHint.textContent = "carregando";
    else if (!hasSupplier) assemblyHint.textContent = "-";
    else if (!totals.itemCount) assemblyHint.textContent = "sem itens";
    else assemblyHint.textContent = `${number(totals.itemCount)} item(ns)`;
  }
  const reviewHint = document.getElementById("qstepReviewHint");
  if (reviewHint) {
    if (!hasSupplier) reviewHint.textContent = "-";
    else if (!totals.itemCount) reviewHint.textContent = "aguardando";
    else reviewHint.textContent = money(totals.estimated);
  }
  renderQuoteJourney();
  renderQuoteFinal();
}

function quoteReviewIssues(totals, supplier, missing, alertsPending) {
  const customization = totals.customization || {};
  const issues = [];
  if (missing > 0) {
    issues.push({
      tone: "warn",
      title: "Cotação abaixo do mínimo",
      body: `Ainda faltam ${money(missing)} para atingir ${money(supplier.minimum_order_value || 0)}.`,
      command: "formation",
      action: "Ver formação",
    });
  }
  if (alertsPending > 0) {
    issues.push({
      tone: "danger",
      title: `${number(alertsPending)} item(ns) com alerta`,
      body: "Revise rupturas, compra forcada, caixa alta ou sinais operacionais antes de enviar.",
      command: "alerts",
      action: "Ver alertas",
    });
  }
  if (customization.missingCost > 0) {
    issues.push({
      tone: "warn",
      title: `${number(customization.missingCost)} item(ns) sem custo`,
      body: "O total pode ficar subestimado enquanto estes custos não forem conferidos.",
      command: "included",
      action: "Ver cotação",
    });
  }
  if (customization.unroundedPackages > 0) {
    issues.push({
      tone: "warn",
      title: `${number(customization.unroundedPackages)} item(ns) fora de caixa cheia`,
      body: "Arredonde ou confirme a exceção para evitar divergência com o fornecedor.",
      command: "package",
      action: "Ver caixas",
    });
  }
  if (totals.out > 0) {
    issues.push({
      tone: "info",
      title: `${number(totals.out)} sugerido(s) fora da cotação`,
      body: "Confira se a retirada foi intencional antes de gerar a cotação final.",
      command: "suggested",
      action: "Ver sugeridos",
    });
  }
  if (!issues.length) {
    issues.push({
      tone: "good",
      title: "Cotação pronta para revisão final",
      body: "Mínimo, alertas, custos e embalagens não mostram pendências críticas.",
      command: "included",
      action: "Revisar itens",
    });
  }
  return issues;
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
    ? "Sem mínimo cadastrado"
    : missing <= 0
      ? `Mínimo de ${money(minimum)} atingido`
      : `Faltam ${money(missing)} para o mínimo (${money(minimum)})`;
  const rowsHtml = totals.items.map((row) => {
    const ref = quoteDisplayCode(row);
    const suggested = Number(row.suggested_quantity || 0);
    const quantity = Number(row.quote_quantity || 0);
    const delta = suggested > 0 ? quantity - suggested : 0;
    const deltaClass = Math.abs(delta) > 0.0001 ? delta > 0 ? "up" : "down" : "";
    const purchaseUnit = row.purchase_unit || row.unit || "UN";
    const packageSize = Number(row.purchase_package_size || row.package_size || 1) || 1;
    const packageUnitLabel = quotePackageDisplayLabel(purchaseUnit, packageSize > 1);
    const orderQtyLabel = packageSize > 1
      ? `${number(quantity / packageSize)} ${packageUnitLabel}`
      : `${number(quantity)} ${purchaseUnit}`;
    const packageLabel = packageSize > 1
      ? `${number(quantity)} un.`
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
          <strong>${escapeHtml(orderQtyLabel)}</strong>
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
  const primaryLabel = quoteStatus === "draft"
    ? "Marcar como enviado"
    : hasQuote ? "Cotação pronta" : "Gerar cotação";
  const issues = quoteReviewIssues(totals, supplier, missing, alertsPending);
  const issuesHtml = issues.length ? `
    <div class="qfinal-issues" aria-label="Pendências da revisão">
      ${issues.map((issue) => `
        <div class="qfinal-issue ${escapeAttr(issue.tone)}">
          <div>
            <strong>${escapeHtml(issue.title)}</strong>
            <span>${escapeHtml(issue.body)}</span>
          </div>
          <button class="text-button" type="button" data-quote-command="${escapeAttr(issue.command)}">${escapeHtml(issue.action)}</button>
        </div>
      `).join("")}
    </div>
  ` : "";
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
    ${issuesHtml}
    <div class="qfinal-personalization">
      <span>${customization.modified ? `${number(customization.increased || 0)} aumentado(s), ${number(customization.reduced || 0)} reduzido(s)` : "Quantidades iguais à sugestão nos itens sugeridos"}</span>
      <span>${customization.unroundedPackages ? `${number(customization.unroundedPackages)} item(ns) fora de caixa cheia` : "Embalagens conferidas"}</span>
      <span>${customization.missingCost ? `${number(customization.missingCost)} item(ns) sem custo` : "Custos preenchidos"}</span>
    </div>
    <div class="qfinal-list">
      <div class="qfinal-list-head">
        <span>Código</span><span>Produto</span><span>Qtd.</span><span>Emb.</span><span>Obs.</span><span>Total</span>
      </div>
      ${rowsHtml || `<div class="quote-empty">Inclua pelo menos um item na aba Itens.</div>`}
    </div>
    <div class="qfinal-actions">
      <button class="text-button quote-back-review" type="button">&uarr; Voltar para montagem</button>
      <div class="qfinal-actions-right">
        <button class="secondary-button" type="button" ${!hasQuote ? "disabled" : ""} onclick="copyQuoteText()">Copiar mensagem</button>
        <button class="secondary-button quote-export-pdf" type="button" ${!hasQuote ? "disabled" : ""}>PDF para fornecedor</button>
        <button class="action-button quote-generate" type="button" ${totals.itemCount && quoteStatus === "draft" ? "" : "disabled"}>${escapeHtml(primaryLabel)}</button>
      </div>
    </div>
    <span class="quote-final-note" aria-live="polite"></span>
  `;
}

function quoteDaysLabel(value, fallback = "-") {
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0) return fallback;
  return `${number(days)}d`;
}

function quoteCoverageDaysLabel(value, fallback = "-") {
  const days = Number(value);
  if (!Number.isFinite(days)) return fallback;
  if (days < 0) return "0d";
  return `${number(days)}d`;
}

function quoteConfidenceText(value) {
  return {
    high: "alta",
    medium: "média",
    low: "baixa",
  }[value] || value || "-";
}

function quoteDemandTone(row) {
  const cls = row.demand_class || "";
  if (["stockout_demand", "single_spike"].includes(cls)) return "danger";
  if (cls === "seasonal") return row.seasonality_source === "product" ? "warn" : "";
  if (["new", "intermittent", "lumpy", "erratic"].includes(cls)) return "warn";
  if (cls === "regular") return "ok";
  return "";
}

function quoteDemandLabel(row) {
  if (row.demand_class === "seasonal") {
    if (row.seasonality_source === "product") return "Sazonal";
    if (row.seasonality_source && row.seasonality_source !== "none") return "Demanda variável";
  }
  return row.demand_class_label || (row.intermittent ? "Intermitente" : "Sem classe");
}

function quoteDemandHelper(row) {
  if (row.demand_class !== "seasonal") return "";
  if (row.seasonality_source === "product") return "padrão do produto";
  if (row.seasonality_source === "brand") return "sinal herdado da marca";
  if (row.seasonality_source && row.seasonality_source !== "none") return "sinal sazonal herdado";
  return "";
}

function quoteIsStockoutDemand(row) {
  return row.demand_class === "stockout_demand"
    || (Number(row.stock_units || 0) <= 0 && (Number(row.demand_30 || 0) > 0 || Number(row.demand_90 || 0) > 0));
}

function quoteNeedsPackageReview(row) {
  const packageSize = Number(row.purchase_package_size || row.package_size || 1) || 1;
  const quantity = Number(row.quote_quantity || 0);
  const unroundedQuote = Boolean(row.in_quote && packageSize > 1 && quantity > 0 && quantity % packageSize !== 0);
  return Boolean(row.package_review_required || row.package_blocks_auto || Number(row.package_coverage_days || 0) >= 120 || unroundedQuote);
}

function quoteHasEngineSignal(row) {
  const seasonalProductSignal = row.demand_class === "seasonal" && row.seasonality_source === "product";
  const demandClassSignal = ["new", "intermittent", "lumpy", "erratic", "single_spike", "stockout_demand"].includes(row.demand_class || "")
    || seasonalProductSignal;
  return Boolean(
    row.forecast_guardrail
    || seasonalProductSignal
    || demandClassSignal
    || row.product_rebuy_interval_source && row.product_rebuy_interval_source !== "supplier_cycle",
  );
}

function quoteHasOpenOrder(row) {
  return Number(row.open_order_quantity || 0) > 0 || Number(row.open_order_count || 0) > 0;
}

function quoteAfterCoverageLabel(row) {
  const after = quoteAfterCoverage(row);
  if (after === null) return "-";
  const current = row.coverage_days === null || row.coverage_days === undefined ? "-" : quoteCoverageDaysLabel(row.coverage_days);
  return `${current} -> ${quoteCoverageDaysLabel(after)}`;
}

function quoteWorkbenchGroupForRow(row) {
  if (row.in_quote) return "included";
  if (quoteIsStockoutDemand(row)) return "stockout";
  if ((row.alerts || []).includes("pedido_aberto") || Number(row.open_order_quantity || 0) > 0) return "open_order";
  if (["fill_selected", "fill_candidate"].includes(row.basket_role || "") && !isAutomaticQuoteSuggestion(row)) return "formation";
  if (quoteNeedsPackageReview(row) || row.package_blocks_auto) return "package";
  if (isAutomaticQuoteSuggestion(row)) return "suggested";
  if (["drop", "out_of_mix"].includes(row.mix_status)) return "outmix";
  return "wait";
}

function quoteWorkbenchGroups() {
  return [
    { key: "included", title: "Cotação em montagem", detail: "Itens que já entram na cotação.", tone: "good" },
    { key: "stockout", title: "Ruptura e urgência", detail: "Onde pode faltar produto ou já existe demanda sem estoque.", tone: "danger" },
    { key: "formation", title: "Cesta para mínimo", detail: "Itens candidatos para compor valor do fornecedor.", tone: "warn" },
    { key: "package", title: "Caixa sensível", detail: "Embalagem ou ciclo podem gerar excesso.", tone: "warn" },
    { key: "open_order", title: "Pedido aberto", detail: "Itens com pedido já registrado.", tone: "info" },
    { key: "suggested", title: "Referência calculada", detail: "Itens com quantidade de referência nesta janela.", tone: "good" },
    { key: "wait", title: "Sem sugestão", detail: "Itens sem quantidade calculada nesta janela.", tone: "muted" },
    { key: "outmix", title: "Fora do mix", detail: "Produtos descontinuados, bloqueados ou fora do mix atual.", tone: "muted" },
  ];
}

function quoteGroupHeader(group, count) {
  return `
    <tr class="qgroup qgroup-${escapeAttr(group.tone)}">
      <td colspan="8">
        <div>
          <strong>${escapeHtml(group.title)}</strong>
          <span>${escapeHtml(group.detail)}</span>
          <em>${number(count)} item(ns)</em>
        </div>
      </td>
    </tr>
  `;
}

function quoteRowCells(row) {
      const inQuote = Boolean(row.in_quote);
      const quantity = inQuote ? Number(row.quote_quantity || 0) : "";
      const alert = (row.alerts || []).length > 0;
      const reason = quoteReason(row);
      const purchaseUnit = row.purchase_unit || row.unit || "UN";
      const pkg = Number(row.purchase_package_size || row.package_size || 0);
      const hasPackage = pkg > 1;
      const stock = Number(row.stock_units || 0);
      const openOrder = Number(row.open_order_quantity || 0);
      const dailyAvg = Number(row.avg_daily_window || 0);
      const coverage = row.coverage_days !== null && row.coverage_days !== undefined
        ? Number(row.coverage_days)
        : dailyAvg > 0 ? Math.floor(stock / dailyAvg) : null;
      const suggested = Number(row.suggested_quantity || 0);
      const basketQuantity = Number(row.recommended_quote_quantity || 0);
      const technicalQuantity = Number(row.technical_quantity || row.rounded_need || 0);
      const math = quoteSuggestionMath(row);
      const forecastDaily = Number(row.forecast_daily_demand || row.avg_daily_window || 0);
      const horizonDays = Number(row.order_horizon_days || 0);
      const cycleDays = Number(row.review_cycle_days || 0);
      const leadDays = Number(row.lead_time_days || 0);
      const packageCoverageDays = Number(row.package_coverage_days || 0);
      const rawNeed = Number(row.raw_need ?? math.rawNeed ?? 0);
      const reorderPoint = Number(row.reorder_point || 0);
      const afterPurchaseCoverage = row.after_purchase_coverage_days === null || row.after_purchase_coverage_days === undefined
        ? null
        : Number(row.after_purchase_coverage_days);
      const suggestionBasis = quoteSuggestionBasis(row);
      const suggestionQuantity = Number(suggestionBasis.quantity || 0);
      const suggestedBoxes = hasPackage && suggestionQuantity > 0 ? Math.ceil(suggestionQuantity / pkg) : 0;
      const costNo = quoteOrderUnitCost(row);
      const quoteQty = Number(row.quote_quantity || 0);
      const quoteBoxes = hasPackage && quoteQty > 0 ? Math.ceil(quoteQty / pkg) : 0;
      const packageDisplayLabel = quotePackageDisplayLabel(purchaseUnit, hasPackage);
      const packageSummary = quoteBoxes
        ? `${number(quoteBoxes)} ${packageDisplayLabel} / ${number(quoteQty)} un`
        : hasPackage ? `${number(pkg)} un por ${packageDisplayLabel}` : "avulso";
      const quantityDelta = suggested > 0 && inQuote ? quoteQty - suggested : 0;
      const quantityDeltaLabel = Math.abs(quantityDelta) > 0.0001
        ? `${quantityDelta > 0 ? "+" : ""}${number(quantityDelta)} vs sugestão`
        : "igual à sugestão";
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
      const stockCls = stock <= 0 ? "danger" : (coverage !== null && coverage < 7 ? "warn" : "");
      const demandWindows = `${number(row.demand_30 || 0)} / ${number(row.demand_90 || 0)} / ${number(row.demand_180 || 0)} un`;
      const lastSale = row.days_since_last_sale === null || row.days_since_last_sale === undefined
        ? "sem ult. venda"
        : `ult. venda ${quoteDaysLabel(row.days_since_last_sale)}`;
      const projectedStock = row.projected_stock_units === null || row.projected_stock_units === undefined
        ? stock + openOrder
        : Number(row.projected_stock_units || 0);
      const projectedCoverage = row.projected_coverage_days === null || row.projected_coverage_days === undefined
        ? null
        : Number(row.projected_coverage_days);
      const projectedCoverageLine = projectedCoverage === null ? "proj. sem giro" : `proj. ${quoteCoverageDaysLabel(projectedCoverage)}`;
      const targetLine = math.targetStock > 0 ? `${number(math.targetStock)} un` : "-";
      const formationLine = row.minimum_fill_candidate && !isAutomaticQuoteSuggestion(row)
        ? `${row.basket_role === "fill_selected" ? "cesta" : row.minimum_fill_auto_safe ? "mínimo" : "candidato"}${row.minimum_fill_value ? ` ${money(row.minimum_fill_value)}` : ""}`
        : "";
      const decisionTip = row.basket_decision_reason || row.purchase_decision_reason || row.reason || "";
      const packageExcess = Number(row.after_purchase_excess_units || row.package_excess_units || 0);
      const packageCoverageLine = packageCoverageDays > 0 ? `1 caixa cobre ${quoteCoverageDaysLabel(packageCoverageDays)}` : "sem giro";
      const stockProjectedLine = openOrder > 0
        ? `${number(projectedStock)} proj. (+${number(openOrder)})`
        : `${number(projectedStock)} proj.`;
      const coverageLabel = coverage === null || coverage === undefined ? "—" : quoteCoverageDaysLabel(coverage);
      const displayAfterCoverage = inQuote
        ? quoteCoverageFromQuantity(row, quoteQty)
        : afterPurchaseCoverage !== null ? afterPurchaseCoverage : quoteCoverageFromQuantity(row, suggestionQuantity);
      const valueQuantity = inQuote && quoteQty > 0 ? quoteQty : suggestionQuantity;
      const lineTotal = valueQuantity * quoteOrderUnitCost(row);
      const packageValue = hasPackage && costNo > 0 ? costNo * pkg : 0;
      const positionDetail = [
        `Estoque atual: ${number(stock)} un`,
        `Cobertura atual: ${quoteCoverageText(coverage)}`,
        `Estoque projetado: ${stockProjectedLine}`,
        `Cobertura projetada: ${quoteCoverageText(projectedCoverage)}`,
        displayAfterCoverage !== null ? `Cobertura com pedido/sugestao: ${quoteCoverageText(displayAfterCoverage)}` : "",
        `vendas 30/90/180: ${demandWindows}`,
        `venda historica: ${number(row.demand_total || 0)} un`,
        `maior venda unica: ${number(row.max_single_sale || 0)} un`,
        lastSale,
      ].filter(Boolean).join(" | ");
      const statusLine = reason.label || "-";
      const suggestedDisplay = suggestionQuantity > 0
        ? `<span class="qc-suggestion-main ${escapeAttr(suggestionBasis.tone || "")}" title="${escapeAttr(quoteExplainTitle(row))}">${number(suggestionQuantity)} un</span>`
        : `<span class="muted">-</span>`;
      const suggestedBoxLine = hasPackage && suggestionQuantity > 0
        ? `${number(suggestedBoxes)} ${packageDisplayLabel}`
        : suggestionQuantity > 0 ? "avulso" : "-";
      const afterCoverageLine = displayAfterCoverage !== null ? quoteCoverageDaysLabel(displayAfterCoverage) : "sem giro";
      const targetTitle = [
        `Alvo calculado: ${targetLine}`,
        `Horizonte do pedido: ${horizonDays ? `${number(horizonDays)} dias` : "-"}`,
        `Cobertura pos-entrega alvo: ${row.order_horizon_receipt_coverage_days ? `${number(row.order_horizon_receipt_coverage_days)} dias` : "-"}`,
        `Ponto de pedido: ${reorderPoint > 0 ? `${number(reorderPoint)} un` : "-"}`,
        `Necessidade bruta: ${number(rawNeed)} un`,
        `Estoque de seguranca: ${number(row.safety_stock || 0)} un`,
      ].join(" | ");
      const suggestionTitle = [
        `${suggestionBasis.source}: ${suggestionQuantity > 0 ? `${number(suggestionQuantity)} un` : "-"}`,
        hasPackage ? `Em caixas: ${number(suggestedBoxes)} ${packageDisplayLabel} de ${number(pkg)} un` : "Compra avulsa",
        `Cobertura estimada depois: ${afterCoverageLine}`,
        `Necessidade bruta: ${number(rawNeed)} un`,
        `Quantidade tecnica: ${number(technicalQuantity)} un`,
        packageExcess > 0 ? `Excesso da embalagem: ${number(packageExcess)} un` : "",
        packageCoverageLine,
      ].filter(Boolean).join(" | ");
      const historyTitle = [
        `Historico total: ${number(row.demand_total || 0)} un`,
        `Ultimos 30 dias: ${number(row.demand_30 || 0)} un`,
        `Ultimos 90 dias: ${number(row.demand_90 || 0)} un`,
        `Ultimos 180 dias: ${number(row.demand_180 || 0)} un`,
        `Maior venda unica: ${number(row.max_single_sale || 0)} un`,
        `Dias com venda em 180d: ${number(row.sale_days_180 || 0)}`,
        lastSale,
      ].join(" | ");
      const valueTitle = [
        `Valor unitario: ${costNo > 0 ? money(costNo) : "-"}`,
        hasPackage ? `Valor por ${packageDisplayLabel}: ${packageValue > 0 ? money(packageValue) : "-"}` : "Sem caixa cadastrada",
        `Quantidade considerada: ${number(valueQuantity)} un`,
        `Total ${inQuote ? "do pedido" : "da referencia"}: ${lineTotal > 0 ? money(lineTotal) : "-"}`,
      ].join(" | ");
      const packageUnitText = hasPackage
        ? `${number(pkg)} un/${escapeHtml(packageDisplayLabel)}`
        : "avulso";
      const suggestedUnitText = suggested > 0 ? `sug. ${number(suggested)} un` : "";
      const orderMeta = [
        hasPackage ? packageUnitText : "avulso",
        quoteBoxes ? `${number(quoteBoxes)} ${packageDisplayLabel}` : suggestedBoxes ? `${number(suggestedBoxes)} ${packageDisplayLabel} sug.` : suggestedUnitText,
        suggested > 0 && inQuote ? quantityDeltaLabel : "",
      ].filter(Boolean).join(" · ");
      return {
        rowClass: classes,
        productId: row.product_id,
        organizationId: row.organization_id,
        suggested: row.suggested_quantity,
        pkg,
        cotando: `<button class="qrow-toggle qc-cotando ${inQuote ? "on" : ""}" type="button" aria-pressed="${inQuote ? "true" : "false"}" title="${discontinued ? "Produto descontinuado" : inQuote ? "Remover do pedido" : "Adicionar ao pedido"}" ${discontinued ? "disabled" : ""}>${inQuote ? "Sim" : "Não"}</button>`,
        produto: `<div class="qc-prod" title="${escapeAttr(decisionTip || row.name || "")}"><strong>${escapeHtml(row.name)}</strong><span class="qc-sub qc-ref">${escapeHtml(ref)}${row.abc_class ? ` · ABC ${escapeHtml(row.abc_class)}` : ""}${row.brand_name ? ` · ${escapeHtml(row.brand_name)}` : ""}</span></div>`,
        posicao: `<div class="qc-pos" title="${escapeAttr(positionDetail)}"><div class="qc-pos-2up"><span><b>Est</b><strong class="${stockCls}">${number(stock)}</strong><em>un</em></span><span><b>Cob</b><strong class="${stockCls}">${escapeHtml(coverageLabel)}</strong></span></div><span class="qc-pos-giro">${escapeHtml(projectedCoverageLine)}</span></div>`,
        alvo: `<div class="qc-stack qc-target" title="${escapeAttr(targetTitle)}"><strong>${escapeHtml(targetLine)}</strong><span>${horizonDays ? `${number(horizonDays)}d` : "sem horiz."}</span><em>${reorderPoint > 0 ? `ponto ${number(reorderPoint)}` : `nec. ${number(rawNeed)}`}</em></div>`,
        sugestao: `<div class="qc-stack qc-suggestion ${escapeAttr(suggestionBasis.tone || "")}" title="${escapeAttr(suggestionTitle)}"><strong>${suggestedDisplay}</strong><span>${escapeHtml(suggestedBoxLine)}</span><em>${escapeHtml(afterCoverageLine)}</em></div>`,
        historico: `<div class="qc-history" title="${escapeAttr(historyTitle)}"><strong>${number(row.demand_total || 0)} un</strong><span class="qc-history-windows"><b>30d</b>${number(row.demand_30 || 0)}<b>90d</b>${number(row.demand_90 || 0)}</span><em>maior venda ${number(row.max_single_sale || 0)}</em></div>`,
        qty: `<div class="qc-order" title="${escapeAttr(packageSummary)}"><div class="qc-order-top"><span>${escapeHtml(orderMeta || packageUnitText)}</span></div><div class="qc-qty">${hasPackage ? `<button class="qrow-step" type="button" data-step="-${pkg}" title="-1 ${packageDisplayLabel} (${number(pkg)} un)">-</button>` : ""}<input class="inline-input quote-quantity-input" type="text" inputmode="decimal" value="${inputValue(quantity)}" placeholder="${escapeAttr(number(suggestionQuantity || suggested))}" aria-label="Quantidade" />${hasPackage ? `<button class="qrow-step" type="button" data-step="${pkg}" title="+1 ${packageDisplayLabel} (${number(pkg)} un)">+</button>` : ""}<span class="save-state row-save-state" aria-live="polite"></span></div></div>`,
        valor: `<div class="qc-stack qc-value" title="${escapeAttr(valueTitle)}"><strong>${lineTotal > 0 ? money(lineTotal) : "—"}</strong><span>${costNo > 0 ? `${money(costNo)}/un` : "sem custo"}</span><em>${packageValue > 0 ? `${money(packageValue)}/${escapeHtml(packageDisplayLabel)}` : "sem caixa"}</em></div>`,
      };
}

let quoteRowCellsToken = 0;
const quoteRowCellsCacheStore = new WeakMap();
function bumpQuoteRowCells() { quoteRowCellsToken += 1; }
function quoteRowCellsCached(row) {
  const hit = quoteRowCellsCacheStore.get(row);
  if (hit && hit.token === quoteRowCellsToken) return hit.cells;
  const cells = quoteRowCells(row);
  quoteRowCellsCacheStore.set(row, { token: quoteRowCellsToken, cells });
  return cells;
}

function quoteProductRowsFlat(rows) {
  if (!rows.length) {
    return `<tr><td colspan="8" class="empty-cell">Nenhum item no filtro atual.</td></tr>`;
  }
  bumpQuoteRowCells();
  return rows
    .map((row) => {
      const c = quoteRowCellsCached(row);
      return `<tr class="${c.rowClass}" data-product-id="${escapeAttr(c.productId)}" data-organization-id="${escapeAttr(c.organizationId)}" data-supplier-id="${escapeAttr(state.selectedQuoteSupplierId)}" data-suggested-quantity="${escapeAttr(c.suggested)}" data-package-size="${Number(c.pkg || 0)}" data-product-row="true"><td class="qc-c-cot">${c.cotando}</td><td class="qc-c-prod">${c.produto}</td><td class="qc-c-pos">${c.posicao}</td><td class="qc-c-num">${c.alvo}</td><td class="qc-c-num">${c.sugestao}</td><td class="qc-c-pos">${c.historico}</td><td class="qc-c-qty">${c.qty}</td><td class="qc-c-num">${c.valor}</td></tr>`;
    })
    .join("");
}

function quoteProductRows(rows) {
  if (!rows.length) {
    return `<tr><td colspan="8" class="empty-cell">Nenhum item no filtro atual.</td></tr>`;
  }
  return quoteProductRowsFlat(rows);
}

function quoteReason(row) {
  const stock = Number(row.stock_units || 0);
  const demand = Number(row.demand_window || 0);
  const suggested = Number(row.suggested_quantity || 0);
  const inMix = row.mix_status === "in_mix";
  const buyNow = row.buy_now || row.buy_now_flag;
  if (row.mix_status === "drop" || row.mix_status === "out_of_mix") return { label: "Descontinuado", cls: "", tip: "Produto visivel, sem compra futura" };
  if (row.mix_status === "force_buy") return { label: "Compra manual", cls: "danger", tip: "Entrada manual do operador" };
  if (row.status === "inactive") return { label: "Inativo", cls: "danger", tip: "Produto inativo no cadastro" };
  if (buyNow || row.force_buy) return { label: "Compra manual", cls: "danger", tip: "Entrada manual do operador" };
  if (row.package_review_required) return { label: "Caixa sensível", cls: "warn", tip: "Embalagem minima fica alta para o alvo técnico" };
  if (stock <= 0 && demand > 0) return { label: "Estoque zero c/ demanda", cls: "danger", tip: "Sem estoque, com vendas na janela" };
  if (stock <= 0) return { label: "Estoque zero", cls: "warn", tip: "Sem estoque, sem demanda na janela" };
  if (suggested > 0 && !inMix) return { label: "Fora do mix c/ demanda", cls: "warn", tip: "Não está no mix, mas tem sugestão" };
  if (!inMix) return { label: "Fora do mix", cls: "", tip: "Produto fora do mix ativo" };
  if (suggested > 0) return { label: "Abaixo do mínimo", cls: "warn", tip: "Estoque abaixo do ponto de reposição" };
  if (demand <= 0) return { label: "Giro intermitente", cls: "", tip: "Sem venda na janela, mas no mix" };
  return { label: "Sem sugestão", cls: "", tip: "Produto no mix, sem necessidade calculada" };
}

function renderQuoteWorkbenchHead(workbench) {
  const supplier = workbench?.supplier;
  const target = document.querySelector("#quoteWorkbenchHead");
  if (!supplier) { target.innerHTML = ""; return; }
  target.innerHTML = `
    ${quoteWorkbenchPanel(workbench)}
  `;
}

function quoteItemColumns() {
  return [
    { id: "cotando", label: "Cot.", type: "number", align: "", filter: false, searchable: false,
      minWidth: 58, optional: false,
      value: (r) => (r.in_quote ? 1 : 0), render: (r) => quoteRowCellsCached(r).cotando },
    { id: "produto", label: "Produto", type: "text", align: "", filter: false, searchable: false,
      minWidth: 170, optional: false,
      value: (r) => r.name || "", render: (r) => quoteRowCellsCached(r).produto },
    { id: "posicao", label: "EST/COB", type: "number", align: "", filter: false, searchable: false,
      minWidth: 90,
      value: (r) => Number(r.stock_units || 0), render: (r) => quoteRowCellsCached(r).posicao },
    { id: "alvo", label: "Alvo", type: "number", align: "num", filter: false, searchable: false,
      minWidth: 82,
      value: (r) => Number(r.order_up_to || 0), render: (r) => quoteRowCellsCached(r).alvo },
    { id: "sugestao", label: "Sugestão", type: "number", align: "num", filter: false, searchable: false,
      minWidth: 92,
      value: (r) => quoteRowSuggestedQuantity(r), render: (r) => quoteRowCellsCached(r).sugestao },
    { id: "historico", label: "Histórico", type: "number", align: "", filter: false, searchable: false,
      minWidth: 96,
      value: (r) => Number(r.demand_total || 0), render: (r) => quoteRowCellsCached(r).historico },
    { id: "qty", label: "Pedido", type: "number", align: "", filter: false, searchable: false,
      minWidth: 132,
      value: (r) => (r.in_quote ? Number(r.quote_quantity || 0) : 0), render: (r) => quoteRowCellsCached(r).qty },
    { id: "valor", label: "Valor", type: "money", align: "num", filter: false, searchable: false,
      minWidth: 96,
      value: (r) => quoteRowDisplayQuantity(r) * quoteOrderUnitCost(r), render: (r) => quoteRowCellsCached(r).valor },
  ];
}

async function workbenchMixToggle(row) {
  if (!row) return;
  const decision = discontinuedActionFor(row).decision;
  const scrollState = captureQuoteScrollState();
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
      row.mix_status = "drop"; row.marker = "out_of_mix_permanent"; row.in_quote = false; row.quote_quantity = 0; row.suggested_quantity = 0;
    } else if (decision === "force_buy") {
      row.mix_status = "force_buy"; row.marker = "force_one_more_purchase";
    } else {
      row.mix_status = "in_mix"; row.marker = "";
    }
    updateWorkbenchTotalsFromRows();
    applyWorkbenchView();
    restoreQuoteScrollState(scrollState);
    refreshAfterSave({ replenishment: true, quotes: true, actions: true, maturity: true }, { defer: true, delay: 300, preserveQuoteScroll: true });
  } catch (error) {
    const status = document.querySelector("#quoteWorkbenchStatus");
    if (status) status.textContent = error.message || "Não foi possível atualizar o mix.";
  }
}

let quoteItemsTable = null;
function ensureQuoteItemsTable() {
  if (quoteItemsTable && quoteItemsTable.element && document.body.contains(quoteItemsTable.element)) return quoteItemsTable;
  const mount = document.querySelector("#quoteItemsTable");
  if (!mount || typeof createDataTable !== "function") return null;
  quoteItemsTable = createDataTable(mount, {
    key: "quote-items-8",
    columns: quoteItemColumns(),
    rows: [],
    rowKey: (r) => r.product_id,
    rowAttrs: (r) => {
      const c = quoteRowCellsCached(r);
      return {
        class: c.rowClass,
        "data-product-id": c.productId || "",
        "data-organization-id": c.organizationId || "",
        "data-supplier-id": state.selectedQuoteSupplierId || "",
        "data-suggested-quantity": String(c.suggested ?? ""),
        "data-package-size": String(Number(c.pkg || 0)),
        "data-product-row": "true",
      };
    },
    emptyTitle: "Nenhum item no filtro atual.",
    emptyHint: "Ajuste os filtros ou a busca.",
  });
  return quoteItemsTable;
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
  const only = state.quoteWorkbenchOnly || "all";
  document.querySelector("#quoteDetail").innerHTML = `
    <div class="quote-toolbar">
      <div class="quote-toolbar-tools">
        <input id="quoteItemSearch" class="search-input compact" type="search" value="${inputValue(state.quoteItemSearch || "")}" placeholder="Buscar produto / ref" />
        <select id="quoteWorkbenchOnly" class="filter-select compact" title="Filtrar condição operacional">
          <option value="all" ${only === "all" ? "selected" : ""}>Todos os itens</option>
          <option value="selected" ${only === "selected" ? "selected" : ""}>Só marcados</option>
          <option value="unselected" ${only === "unselected" ? "selected" : ""}>Só fora da cotação</option>
          <option value="suggested" ${filter === "suggested" ? "selected" : ""}>Com sugestão</option>
          <option value="stockout" ${filter === "stockout" ? "selected" : ""}>Ruptura</option>
          <option value="open_order" ${only === "open_order" ? "selected" : ""}>Com pedido aberto</option>
          <option value="box" ${only === "box" ? "selected" : ""}>Com embalagem</option>
          <option value="modified" ${only === "modified" ? "selected" : ""}>Qtd. alterada</option>
          <option value="no_cost" ${only === "no_cost" ? "selected" : ""}>Sem custo</option>
        </select>
        <button class="secondary-button compact quote-restore-items" type="button" title="Incluir todos os sugeridos com a quantidade calculada">Usar sugestão</button>
      </div>
      <div id="quoteLiveSummary" class="quote-live-summary" aria-live="polite">${quoteLiveSummaryMarkup()}</div>
      <button class="secondary-button compact quote-open-columns" type="button" title="Escolher, ocultar e reordenar colunas"><i data-lucide="settings-2" aria-hidden="true"></i><span>Colunas</span></button>
    </div>
    <div id="quoteItemsTable" class="quote-items-mount"></div>
    <div id="quoteOrderDock" class="quote-order-dock" aria-live="polite">${quoteOrderDockContent()}</div>
  `;
  applyWorkbenchView();
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
  updateQuoteFlow();
}

function scheduleRenderQuotes(delay = 140) {
  if (state.quoteSupplierSearchTimer) window.clearTimeout(state.quoteSupplierSearchTimer);
  state.quoteSupplierSearchTimer = window.setTimeout(() => {
    state.quoteSupplierSearchTimer = null;
    renderQuotes({ preserveScroll: true });
  }, delay);
}

function renderQuotes(options = {}) {
  const suppliers = state.quoteSuppliers || [];
  const preview = suppliers.find((row) => row.supplier_id === state.quoteSupplierPreviewId);
  if (!preview) {
    state.quoteSupplierPopupOpen = false;
    state.quoteSupplierPreviewId = "";
  }
  const summary = document.querySelector("#quoteSupplierDeskSummary");
  if (summary) summary.innerHTML = quoteDeskSummary(suppliers);
  const table = ensureQuoteSuppliersTable();
  if (table) table.setRows(suppliers);
  renderQuoteSupplierFastState();
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
  if (options.summaryOnly) return;
  if (suppliers[0]?.supplier_id) {
    window.setTimeout(() => prefetchQuoteSupplierWorkbench(suppliers[0].supplier_id).catch(() => {}), 350);
  }
  renderQuoteJourney();
  if (options.withDashboard) renderQuoteDashboard();
}

function renderQuoteWorkbenchLoading(supplierId) {
  state.quoteWorkbench = null;
  state.quoteWorkbenchLoadingSupplierId = supplierId;
  const row = quoteSupplierById(supplierId);
  const name = row?.supplier_name || "fornecedor";
  const head = document.querySelector("#quoteWorkbenchHead");
  const detail = document.querySelector("#quoteDetail");
  if (head) {
    head.innerHTML = `
      <div class="quote-head-line">
        <div class="quote-head-title">
          <button class="qback" type="button" data-quote-step="supplier" aria-label="Voltar para fornecedores">&larr; Trocar fornecedor</button>
          <h2>${escapeHtml(name)}</h2>
          <span class="quote-head-meta">carregando mesa do fornecedor</span>
        </div>
      </div>
    `;
  }
  if (detail) {
    detail.className = "quote-stage-panel";
    detail.innerHTML = `
      <div class="quote-workbench-loading">
        <strong>Abrindo mesa de ${escapeHtml(name)}</strong>
        <span>Calculando itens, pedidos abertos, mínimos e sinais de reposição.</span>
        <i aria-hidden="true"></i>
      </div>
    `;
  }
  updateQuoteFlow();
}

function quoteWorkbenchCacheKey(supplierId) {
  return `${supplierId || ""}|${state.quoteWindowDays || "90"}`;
}

function prefetchQuoteSupplierWorkbench(supplierId) {
  if (!supplierId) return Promise.resolve(null);
  const key = quoteWorkbenchCacheKey(supplierId);
  if (state.quoteWorkbenchPrefetch.has(key)) return state.quoteWorkbenchPrefetch.get(key);
  const query = new URLSearchParams({ supplier_id: supplierId, window_days: state.quoteWindowDays || "90" });
  const promise = apiContract(`/api/supplier-workbench?${query.toString()}`, "supplier_workbench.v1")
    .catch((error) => {
      state.quoteWorkbenchPrefetch.delete(key);
      throw error;
    });
  state.quoteWorkbenchPrefetch.set(key, promise);
  return promise;
}

async function loadQuoteSupplierWorkbench(supplierId, options = {}) {
  if (!supplierId) {
    clearOpenQuoteWorkbench();
    renderQuoteDetail(null);
    return;
  }
  state.selectedQuoteSupplierId = supplierId;
  state.quoteSupplierPopupOpen = false;
  const selectedFromSupplierStep = !options.keepStep && !options.silent && state.quoteStep === "supplier";
  if (selectedFromSupplierStep) {
    state.quoteStep = "assembly";
    state.quoteWorkbenchFilter = "all";
    state.quoteItemSearch = "";
    state.quoteWorkbenchGroup = "flat";
    state.quoteWorkbenchOnly = "all";
    state.quoteWorkbenchMinDemand = "";
    state.quoteWorkbenchMinValue = "";
    state.quoteWorkbenchMaxCoverage = "";
    renderQuoteWorkbenchLoading(supplierId);
  }
  renderQuoteSupplierInspectorState();
  const status = document.querySelector("#quoteWorkbenchStatus");
  if (status && !options.silent) status.textContent = "Carregando";
  try {
    const workbench = await prefetchQuoteSupplierWorkbench(supplierId);
    state.quoteWorkbenchLoadingSupplierId = "";
    renderQuoteDetail(workbench);
    if (state.quoteStep !== "supplier") rememberOpenQuoteWorkbench(supplierId);
  } catch (error) {
    state.quoteWorkbenchLoadingSupplierId = "";
    renderQuoteDetail(null);
    throw error;
  }
}

async function refreshQuotes(options = {}) {
  const quoteScrollState = options.preserveScroll ? captureQuoteScrollState() : null;
  try {
    state.quoteWorkbenchPrefetch.clear();
    state.quoteSuppliers = await apiRows(
      "/api/supplier-workbench/suppliers",
      SUPPLIER_WORKBENCH_SUPPLIER_KEYS,
      "supplier_workbench_suppliers.v1",
    );
    await refreshPurchaseOrders();
    if (!state.quoteSupplierChipPinned) {
      state.quoteSupplierChip = defaultQuoteSupplierChip(state.quoteSuppliers);
      state.quoteSupplierLenses = [];
    }
    if (!state.selectedQuoteSupplierId || !state.quoteSuppliers.some((row) => row.supplier_id === state.selectedQuoteSupplierId)) {
      state.selectedQuoteSupplierId = state.quoteSuppliers[0]?.supplier_id || "";
    }
    renderQuotes({ preserveScroll: Boolean(options.preserveScroll), withDashboard: true });
    const reloadSelected = options.reloadSelected ?? Boolean(state.quoteWorkbench && ["assembly", "review"].includes(state.quoteStep));
    if (reloadSelected && state.selectedQuoteSupplierId) {
      await loadQuoteSupplierWorkbench(state.selectedQuoteSupplierId, { silent: true, keepStep: true });
    }
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
  updateQuoteOrderDock();
  updateQuoteFilterPills();
  updateQuoteFlow();
}

function syncQuoteRow(rowEl, row) {
  rowEl.classList.toggle("included", Boolean(row.in_quote));
  rowEl.classList.toggle("out-of-mix", ["drop", "out_of_mix"].includes(row.mix_status));
  rowEl.classList.toggle("qty-modified", Boolean(row.in_quote) && Number(row.suggested_quantity || 0) > 0 && Math.abs(Number(row.quote_quantity || 0) - Number(row.suggested_quantity || 0)) > 0.0001);
  rowEl.classList.toggle("qty-zero", Boolean(row.in_quote) && Number(row.quote_quantity || 0) === 0);
  const discontinued = isDiscontinuedMix(row);
  const toggle = rowEl.querySelector(".qrow-toggle");
  if (toggle) {
    toggle.classList.toggle("on", Boolean(row.in_quote));
    toggle.setAttribute("aria-pressed", row.in_quote ? "true" : "false");
    toggle.disabled = discontinued;
    toggle.title = discontinued ? "Produto descontinuado" : row.in_quote ? "Remover do pedido" : "Adicionar ao pedido";
    toggle.textContent = row.in_quote ? "Sim" : "Não";
  }
  const totalCell = rowEl.querySelector(".col-tot");
  if (totalCell) {
    const total = Number(row.quote_quantity || 0) * quoteOrderUnitCost(row);
    const costNo = quoteOrderUnitCost(row);
    const costLine = costNo > 0 ? `<span class="muted-line">${money(costNo)}/un</span>` : "";
    totalCell.innerHTML = row.in_quote && total > 0
      ? `${money(total)}${costLine}`
      : `<span class="muted">-</span>${costLine}`;
  }
  const pack = rowEl.querySelector(".qrow-pack");
  const packageSize = Number(row.purchase_package_size || row.package_size || 0);
  const purchaseUnit = row.purchase_unit || row.unit || "UN";
  const packageUnitLabel = quotePackageDisplayLabel(purchaseUnit, packageSize > 1);
  const quantity = Number(row.quote_quantity || 0);
  if (pack) {
    pack.textContent = packageSize > 1 && quantity > 0
      ? `${number(Math.ceil(quantity / packageSize))} ${packageUnitLabel} / ${number(quantity)} un`
      : packageSize > 1 ? `${packageUnitLabel} ${number(packageSize)} un` : "avulso";
  }
  rowEl.dataset.packageSize = String(packageSize || 0);
  rowEl.querySelectorAll(".qrow-step").forEach((button) => {
    const sign = Number(button.dataset.step || 0) < 0 ? -1 : 1;
    button.dataset.step = String(sign * (packageSize || 1));
    button.title = `${sign > 0 ? "+" : "-"}1 ${packageUnitLabel} (${number(packageSize || 1)} un)`;
  });
  const unitSelect = rowEl.querySelector(".quote-unit-select");
  if (unitSelect && document.activeElement !== unitSelect) unitSelect.value = String(purchaseUnit).toUpperCase();
  const deltaEl = rowEl.querySelector(".qrow-delta");
  const suggested = Number(row.suggested_quantity || 0);
  if (deltaEl && suggested > 0) {
    const delta = quantity - suggested;
    deltaEl.textContent = Math.abs(delta) > 0.0001 ? `${delta > 0 ? "+" : ""}${number(delta)} vs sug.` : "igual à sugestão";
    deltaEl.classList.toggle("hidden", !row.in_quote);
    deltaEl.classList.toggle("changed", row.in_quote && Math.abs(delta) > 0.0001);
  }
  const mixAction = rowEl.querySelector(".qrow-mix-action");
  if (mixAction) {
    const action = discontinuedActionFor(row);
    const showMixAction = discontinued || row.mix_status === "force_buy";
    mixAction.dataset.mixDecision = action.decision;
    mixAction.textContent = action.label;
    mixAction.title = action.title;
    mixAction.classList.toggle("restore", discontinued);
    mixAction.classList.toggle("hidden", !showMixAction);
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
    status.textContent = "Qtd. inválida";
    return;
  }
  const purchaseUnit = rowEl.querySelector(".quote-unit-select")?.value || row.purchase_unit || row.unit || "UN";
  const purchasePackageSize = parseInputNumber(rowEl.querySelector(".quote-package-input")?.value || row.package_size || 1) || 1;
  const nextCoverageTargetDays = row.quote_coverage_target_days ? Number(row.quote_coverage_target_days) : null;
  const nextInQuote = quantity > 0;
  if (purchasePackageSize <= 0) {
    status.textContent = "Embalagem inválida";
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
    status.textContent = "Sem mudança";
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
    if (packageChanged) {
      refreshAfterSave(
        { replenishment: true, quotes: true },
        { coalesce: true, defer: true, delay: 1200, preserveQuoteScroll: true },
      );
    }
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
  const rows = (state.quoteWorkbench.rows || []).filter((row) => isAutomaticQuoteSuggestion(row) && !row.in_quote);
  const quoteScrollState = captureQuoteScrollState();
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
    restoreQuoteScrollState(quoteScrollState);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) nextStatus.textContent = "Sugeridos incluidos";
    refreshAfterSave({ quotes: true }, { coalesce: true, defer: true, delay: 1200, preserveQuoteScroll: true });
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

function confirmQuoteBulkAction(title, detail = "") {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return true;
  const message = detail ? `${title}\n\n${detail}` : title;
  return window.confirm(message);
}

async function clearWorkbenchQuoteItems() {
  if (!state.quoteWorkbench) return;
  const status = document.querySelector("#quoteWorkbenchStatus");
  const rows = (state.quoteWorkbench.rows || []).filter((row) => row.in_quote);
  const quoteScrollState = captureQuoteScrollState();
  if (!rows.length) {
    if (status) status.textContent = "Nenhum item marcado";
    return;
  }
  if (!confirmQuoteBulkAction(
    "Remover todos os itens marcados deste fornecedor?",
    `Isso vai zerar ${number(rows.length)} item(ns) da cotação em montagem.`,
  )) {
    if (status) status.textContent = "Limpeza cancelada";
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
    restoreQuoteScrollState(quoteScrollState);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) nextStatus.textContent = "Marcados removidos";
    refreshAfterSave({ quotes: true }, { coalesce: true, defer: true, delay: 1200, preserveQuoteScroll: true });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function bulkSetVisibleQuoteItems(include) {
  if (!state.quoteWorkbench) return;
  const status = document.querySelector("#quoteWorkbenchStatus");
  const visible = quoteWorkbenchRowsForCurrentView();
  const quoteScrollState = captureQuoteScrollState();
  const blocked = include ? visible.filter((row) => ["drop", "out_of_mix"].includes(row.mix_status)) : [];
  const rows = visible
    .filter((row) => !include || !["drop", "out_of_mix"].includes(row.mix_status))
    .filter((row) => include ? !row.in_quote : row.in_quote);
  if (!rows.length) {
    if (status) status.textContent = include && blocked.length ? "Descontinuados não entram em compra em massa" : "Nada para alterar no filtro";
    return;
  }
  if (!include && !confirmQuoteBulkAction(
    "Remover todos os itens visíveis da cotação?",
    `O filtro atual tem ${number(rows.length)} item(ns) marcados. A ação respeita busca e filtro ativos.`,
  )) {
    if (status) status.textContent = "Remocao cancelada";
    return;
  }
  if (status) status.textContent = `${include ? "Marcando" : "Removendo"} ${number(rows.length)} item(ns) visíveis`;
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
    restoreQuoteScrollState(quoteScrollState);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) {
      const skipped = include && blocked.length ? ` (${number(blocked.length)} descontinuado(s) ignorado(s))` : "";
      nextStatus.textContent = include ? `Visiveis marcados${skipped}` : "Visiveis removidos";
    }
    refreshAfterSave({ quotes: true }, { coalesce: true, defer: true, delay: 1200, preserveQuoteScroll: true });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function completeMinimumOrder() {
  if (!state.quoteWorkbench) return;
  const status = document.querySelector("#quoteWorkbenchStatus");
  const quoteScrollState = captureQuoteScrollState();
  const minimum = Number(state.quoteWorkbench.supplier?.minimum_order_value || 0);
  const totals = quoteSelectedTotals();
  if (minimum <= 0) {
    if (status) status.textContent = "Fornecedor sem pedido mínimo cadastrado";
    return;
  }
  if (totals.estimated >= minimum) {
    if (status) status.textContent = "Pedido mínimo já atingido";
    return;
  }
  const statusWeight = { urgent: 0, buy_now: 1, watch: 2, ok: 3, excess: 5, no_demand: 6 };
  const candidates = (state.quoteWorkbench.rows || [])
    .filter((row) => !row.in_quote)
    .filter((row) => !["drop", "out_of_mix"].includes(row.mix_status))
    .filter((row) => isAutomaticQuoteSuggestion(row) || row.basket_role === "fill_selected")
    .sort((a, b) => {
      const requiredDelta = Number(isAutomaticQuoteSuggestion(b)) - Number(isAutomaticQuoteSuggestion(a));
      if (requiredDelta) return requiredDelta;
      const basketDelta = Number(b.basket_role === "fill_selected") - Number(a.basket_role === "fill_selected");
      if (basketDelta) return basketDelta;
      return (statusWeight[a.status] ?? 4) - (statusWeight[b.status] ?? 4)
        || Number(b.basket_score || 0) - Number(a.basket_score || 0)
        || Number(b.minimum_fill_rank || 0) - Number(a.minimum_fill_rank || 0)
        || Number(b.priority || 0) - Number(a.priority || 0);
    });
  if (!candidates.length) {
    const manualCandidates = (state.quoteWorkbench.rows || []).filter((row) => !row.in_quote && row.minimum_fill_candidate).length;
    if (status) status.textContent = manualCandidates
      ? "Há candidatos manuais; revise a cesta antes de completar"
      : "Sem cesta pendente para completar mínimo";
    return;
  }
  let total = totals.estimated;
  let added = 0;
  if (status) status.textContent = "Aplicando cesta";
  try {
    for (const row of candidates) {
      if (total >= minimum) break;
      const quantity = Number(row.recommended_quote_quantity || row.suggested_quantity || row.minimum_fill_quantity || row.package_size || 1);
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
    restoreQuoteScrollState(quoteScrollState);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) nextStatus.textContent = added ? `${number(added)} item(ns) adicionados pela cesta` : "Nada alterado";
    refreshAfterSave({ quotes: true }, { coalesce: true, defer: true, delay: 1200, preserveQuoteScroll: true });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function roundIncludedToPackages() {
  if (!state.quoteWorkbench) return;
  const status = document.querySelector("#quoteWorkbenchStatus");
  const quoteScrollState = captureQuoteScrollState();
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
    if (status) status.textContent = "Itens marcados já estão em caixas inteiras";
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
    restoreQuoteScrollState(quoteScrollState);
    const nextStatus = document.querySelector("#quoteWorkbenchStatus");
    if (nextStatus) nextStatus.textContent = "Caixas arredondadas";
    refreshAfterSave({ quotes: true }, { coalesce: true, defer: true, delay: 1200, preserveQuoteScroll: true });
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

function openManualQuoteItemModal() {
  const supplier = state.quoteWorkbench?.supplier || {};
  openModal(
    "Item avulso de cotação",
    `
      <div class="modal-context">
        <strong>${escapeHtml(supplier.name || "Fornecedor")}</strong>
        <span>Use para registrar produto visto em catálogo ou negociado pela primeira vez. Ele não vira produto oficial do ${escapeHtml(appName())}; produto oficial continua vindo do ERP.</span>
      </div>
      <label class="modal-field">
        <span>Produto / referência do catálogo</span>
        <input class="inline-input" id="manualQuoteName" type="text" maxlength="160" placeholder="Ex.: Limpador multiuso 5L novo fornecedor" />
      </label>
      <div class="form-grid two">
        <label class="modal-field">
          <span>Quantidade para cotar</span>
          <input class="inline-input" id="manualQuoteQty" type="text" inputmode="decimal" placeholder="Ex.: 12" />
        </label>
        <label class="modal-field">
          <span>Observação</span>
          <input class="inline-input" id="manualQuoteNote" type="text" maxlength="180" placeholder="Catálogo, promoção, teste, substituto..." />
        </label>
      </div>
      <div class="modal-preview">Este registro fica como memória operacional da cotação. Quando o item entrar no ERP, ele passa a participar das próximas sugestões automaticamente pela importação.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="manualQuoteCancel">Cancelar</button>
        <button class="action-button" type="button" id="manualQuoteSave">Registrar para cotação</button>
      </div>
      <span class="save-state" id="manualQuoteState" aria-live="polite"></span>
    `,
    (body) => {
      const stateEl = body.querySelector("#manualQuoteState");
      body.querySelector("#manualQuoteCancel").addEventListener("click", closeModal);
      body.querySelector("#manualQuoteSave").addEventListener("click", async () => {
        const name = body.querySelector("#manualQuoteName").value.trim();
        if (!name) {
          stateEl.textContent = "Informe o produto ou referência.";
          return;
        }
        stateEl.textContent = "Registrando";
        try {
          await apiPost("/api/operational-decisions", {
            action: "quote_manual_catalog_item",
            target_type: "supplier",
            target_id: supplier.id || state.selectedQuoteSupplierId || "",
            decision: "Item avulso para cotação",
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
          stateEl.textContent = "Item registrado na memória da cotação";
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

function generateCurrentQuote(buttonEl = null) {
  const status = document.querySelector("#quoteFinal .quote-final-note") || document.querySelector("#quoteWorkbenchStatus");
  if (!state.quoteWorkbench) return;
  const totals = quoteSelectedTotals();
  if (!totals.itemCount) {
    if (status) status.textContent = "Inclua pelo menos um item.";
    return;
  }
  const quote = state.quoteWorkbench.current_quote;
  if (!quote) {
    if (status) status.textContent = "Marque itens para criar o rascunho da cotação.";
    return;
  }
  if (quote.status === "draft") {
    markCurrentQuoteSent(status, buttonEl);
    return;
  }
  if (status) status.textContent = `Cotação ${statusText(quote.status).toLowerCase()}.`;
}

async function refreshCurrentQuoteWorkbench(options = {}) {
  if (!state.selectedQuoteSupplierId) return;
  await loadQuoteSupplierWorkbench(state.selectedQuoteSupplierId, { keepStep: true, silent: true, ...options });
  await refreshAfterSave({ quotes: true, actions: true, maturity: true });
}

async function markCurrentQuoteSent(feedbackEl = null, buttonEl = null) {
  const quote = state.quoteWorkbench?.current_quote;
  const status = feedbackEl || document.querySelector("#quoteFinal .quote-final-note") || document.querySelector("#quoteWorkbenchStatus");
  if (!quote?.id) {
    if (status) status.textContent = "Não há cotação em rascunho.";
    return;
  }
  if (buttonEl) buttonEl.disabled = true;
  if (status) status.textContent = "Marcando cotação como enviada";
  try {
    await apiPost("/api/quotes/status", { id: quote.id, status: "sent" });
    await refreshCurrentQuoteWorkbench();
    setQuoteStep("assembly");
    const nextStatus = document.querySelector("#quoteWorkbenchStatus") || document.querySelector("#quoteFinal .quote-final-note") || status;
    if (nextStatus) {
      nextStatus.textContent = "Cotação enviada. Registre a resposta quando o fornecedor retornar.";
    }
    document.querySelector("#quoteJourney")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (status) status.textContent = error.message || "Não foi possível enviar a cotação.";
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function discardQuote(quote, supplierId = state.selectedQuoteSupplierId, feedbackEl = null, buttonEl = null) {
  const status = feedbackEl || document.querySelector("#quoteWorkbenchStatus") || document.querySelector("#quoteFinal .quote-final-note");
  if (!quote?.id) {
    if (status) status.textContent = "Não há cotação aberta para descartar.";
    return;
  }
  if ((quote.status || "") !== "draft") {
    if (status) status.textContent = "Apenas rascunhos podem ser descartados direto pela mesa.";
    return;
  }
  if (!window.confirm("Descartar esta cotação aberta? Os itens marcados serão removidos da mesa.")) return;
  if (buttonEl) buttonEl.disabled = true;
  if (status) status.textContent = "Descartando cotação";
  try {
    await apiPost("/api/quotes/status", { id: quote.id, status: "cancelled" });
    if (status) status.textContent = "Cotação descartada";
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (supplierId) await loadQuoteSupplierWorkbench(supplierId, { keepStep: true, silent: true });
    await refreshQuotes();
    await refreshAfterSave({ quotes: true, actions: true, maturity: true }, { defer: true, delay: 150 });
  } catch (error) {
    if (status) status.textContent = error.message || "Não foi possível descartar.";
    if (buttonEl) buttonEl.disabled = false;
  }
}
