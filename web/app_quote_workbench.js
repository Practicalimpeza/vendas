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
  const alerts = Number(totals.alerts_count || 0);
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
    `janela ${number(workbench?.window_days || state.quoteWindowDays)}d`,
    supplier.contact_name || "",
    supplier.contact_phone || "",
  ].filter(Boolean);
  return `
    <section class="quote-workbench-panel ${escapeAttr(next.tone)}">
      <div class="quote-workbench-topline">
        <div class="quote-workbench-main">
          <button class="qback" type="button" data-quote-step="supplier" aria-label="Voltar para fornecedores">&larr; Fornecedores</button>
          <div class="quote-workbench-title">
            <span>Fornecedor selecionado</span>
            <h2>${escapeHtml(supplier.name || "Fornecedor")}</h2>
            <div class="quote-workbench-meta">
              ${metaParts.map((part) => `<em>${escapeHtml(part)}</em>`).join("")}
            </div>
          </div>
        </div>

        <div class="quote-workbench-actions">
          ${canDiscardQuote ? `<button class="secondary-button" type="button" data-quote-command="discard">Descartar</button>` : ""}
          <button class="action-button" type="button" data-quote-command="${escapeAttr(next.command)}" ${next.command === "quote" && !items ? "disabled" : ""}>${escapeHtml(next.label)}</button>
          <span class="save-state" id="quoteWorkbenchStatus" aria-live="polite"></span>
        </div>
      </div>

      <div class="quote-workbench-next">
        <span>Próxima ação</span>
        <strong>${escapeHtml(next.title)}</strong>
        <em>${escapeHtml(next.body)}</em>
      </div>

      <div class="quote-workbench-metrics" aria-label="Resumo da cotação">
        <div><span>Itens</span><strong>${number(items)}</strong><em>${alerts ? `${number(alerts)} alertas` : "sem alertas"}</em></div>
        <div><span>Total</span><strong>${money(value)}</strong><em>${number(customization.boxes || 0)} caixas</em></div>
        <div class="wide">
          <span>Mínimo</span>
          <strong class="${missing > 0 ? "warn" : "ok"}">${minimum > 0 ? money(minimum) : "-"}</strong>
          <i class="quote-minimum-bar" aria-hidden="true"><b style="width:${pct}%"></b></i>
          <em>${escapeHtml(minText)}${cycleDays > 0 && missing > 0 ? ` · ${number(cycleDays)}d para formar` : ""}</em>
        </div>
        <div><span>Ajustes</span><strong class="${customization.modified ? "warn" : "ok"}">${number(customization.modified || 0)}</strong><em>${number(quoteTotals.units || 0)} un.</em></div>
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
      title: "Aguardando aprovação",
      body: "Cotação enviada. Registre disponibilidade, quantidade confirmada, prazo ou observação quando o fornecedor responder.",
      command: "response",
      label: "Registrar resposta",
    };
  }
  if (quoteResponded) {
    return {
      tone: "good",
      title: "Resposta registrada",
      body: "Gere o pedido apenas com os itens confirmados para projetar estoque.",
      command: "confirm",
      label: "Gerar pedido",
    };
  }
  if (currentQuote?.status === "draft" && totals.itemCount && !(minimum > 0 && missing > 0)) {
    return {
      tone: "info",
      title: "Pronto para enviar",
      body: `${number(totals.itemCount)} item(ns) no rascunho. Ao enviar, a lista fica aguardando resposta do fornecedor.`,
      command: "quote",
      label: "Revisar cotação",
    };
  }
  if (!totals.itemCount && suggestedTotal) {
    return {
      tone: "warn",
      title: "Montar cotação sugerida",
      body: `${number(suggestedTotal)} item(ns) com sugestão de compra.`,
      command: "restore",
      label: "Incluir sugeridos",
    };
  }
  if (alertsIncluded) {
    return {
      tone: "danger",
      title: "Resolver alertas",
      body: `${number(alertsIncluded)} item(ns) incluídos precisam de decisão.`,
      command: "alerts",
      label: "Ver alertas",
    };
  }
  if (minimum > 0 && missing > 0) {
    const longCycle = formation.strategy === "wait_or_negotiate";
    const candidateReview = formation.strategy === "candidate_review";
    return {
      tone: "warn",
      title: longCycle ? "Ciclo de compra difícil" : candidateReview ? "Formar pedido com critério" : "Abaixo do mínimo",
      body: formation.reason || `Faltam ${money(missing)} para fechar melhor com ${escapeHtml(supplier.name || "fornecedor")}.`,
      command: suggestedPending ? "suggested" : basketPending ? "formation" : "formation",
      label: suggestedPending ? "Ver essenciais" : basketPending ? "Ver cesta" : longCycle || candidateReview ? "Ver formação" : "Ver resumo",
    };
  }
  if (totals.itemCount) {
    return {
      tone: "good",
      title: "Cotação pronta",
      body: `${number(totals.itemCount)} item(ns), ${money(totals.estimated)} sem impostos.`,
      command: "quote",
      label: "Revisar cotação",
    };
  }
  return {
    tone: "muted",
    title: "Sem compra sugerida",
    body: "Fornecedor sem itens claros para cotar nesta janela.",
    command: "suggested",
    label: "Ver produtos",
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
    row.purchase_decision_label ? `Decisão: ${row.purchase_decision_label}` : "",
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
    <span><strong>${money(visibleMetrics.value)}</strong> valor filtrado</span>
    <span><strong>${number(visibleMetrics.units)}</strong> un. filtradas</span>
    <span><strong>${number(totals.itemCount)}</strong> na cotação</span>
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
  const hasSupplier = Boolean(state.selectedQuoteSupplierId && (state.quoteWorkbench || state.quoteWorkbenchLoadingSupplierId));
  if (step !== "supplier" && !hasSupplier) step = "supplier";
  if (step === "quote" || step === "send") step = "review";
  if (step === "items") step = "assembly";
  if (step !== "supplier" && step !== "assembly" && step !== "review") step = "assembly";
  if (step === "review" && !quoteSelectedTotals().itemCount) step = "assembly";
  state.quoteStep = step;
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
    const packageUnitLabel = quotePackageUnitLabel(purchaseUnit);
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
  if (days < 0) return "ruptura";
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
    { key: "formation", title: "Cesta para mínimo", detail: "Itens escolhidos ou candidatos para completar o fornecedor sem excesso ruim.", tone: "warn" },
    { key: "package", title: "Caixa pesada", detail: "Embalagem ou ciclo podem gerar excesso.", tone: "warn" },
    { key: "open_order", title: "Pedido aberto", detail: "Itens que pedem conferencia antes de duplicar compra.", tone: "info" },
    { key: "suggested", title: "Compra sugerida", detail: "Itens prontos para revisar e cotar.", tone: "good" },
    { key: "wait", title: "Aguardar ou observar", detail: "Itens sem ação clara nesta janela.", tone: "muted" },
    { key: "outmix", title: "Fora do mix", detail: "Produtos descontinuados, bloqueados ou fora do mix atual.", tone: "muted" },
  ];
}

function quoteGroupHeader(group, count) {
  return `
    <tr class="qgroup qgroup-${escapeAttr(group.tone)}">
      <td colspan="9">
        <div>
          <strong>${escapeHtml(group.title)}</strong>
          <span>${escapeHtml(group.detail)}</span>
          <em>${number(count)} item(ns)</em>
        </div>
      </td>
    </tr>
  `;
}

function quoteProductRowsFlat(rows) {
  if (!rows.length) {
    return `<tr><td colspan="9" class="empty-cell">Nenhum item no filtro atual.</td></tr>`;
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
      const suggestedBoxes = hasPackage && suggested > 0 ? Math.ceil(suggested / pkg) : 0;
      const costNo = Number(row.cost_no_tax || 0);
      const lineTotal = inQuote ? Number(row.quote_quantity || 0) * quoteOrderUnitCost(row) : 0;
      const quoteQty = Number(row.quote_quantity || 0);
      const quoteBoxes = hasPackage && quoteQty > 0 ? Math.ceil(quoteQty / pkg) : 0;
      const packageUnitLabel = quotePackageUnitLabel(purchaseUnit);
      const packageSummary = quoteBoxes
        ? `${number(quoteBoxes)} ${packageUnitLabel} / ${number(quoteQty)} un`
        : hasPackage ? `${packageUnitLabel} ${number(pkg)} un` : "avulso";
      const quickActions = [
        suggested > 0 ? `<button class="qrow-quick" type="button" data-quick="suggested">Usar sug.</button>` : "",
        hasPackage ? `<button class="qrow-quick" type="button" data-quick="one-package">1 ${packageUnitLabel}</button>` : "",
        inQuote ? `<button class="qrow-quick" type="button" data-quick="zero">Zerar</button>` : "",
      ].filter(Boolean).join("");
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
      const coverageLine = coverage === null ? "sem giro" : `cob. ${quoteCoverageDaysLabel(coverage)}`;
      const mixChip = `<span class="qrow-mix ${row.mix_status === "in_mix" ? "hidden" : ""}" title="${escapeAttr(mixStatusText(row.mix_status))}">${escapeHtml(mixStatusText(row.mix_status))}</span>`;
      const showMixAction = discontinued || row.mix_status === "force_buy";
      const mixAction = discontinuedActionFor(row);
      const demandTone = quoteDemandTone(row);
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
      const afterCoverageLine = quoteAfterCoverageLabel(row);
      const targetLine = math.targetStock > 0 ? `${number(math.targetStock)} un` : "-";
      const formationLine = row.minimum_fill_candidate && !isAutomaticQuoteSuggestion(row)
        ? `${row.basket_role === "fill_selected" ? "cesta recomenda" : row.minimum_fill_auto_safe ? "ajuda no mínimo" : "avaliar mínimo"}${row.minimum_fill_value ? ` ${money(row.minimum_fill_value)}` : ""}`
        : "";
      const decisionLine = row.basket_decision_label || row.purchase_decision_label || "";
      const decisionTip = row.basket_decision_reason || row.purchase_decision_reason || row.reason || "";
      const demandClass = quoteDemandLabel(row);
      const demandHelper = quoteDemandHelper(row);
      const packageExcess = Number(row.after_purchase_excess_units || row.package_excess_units || 0);
      const packageLine = hasPackage
        ? `${escapeHtml(String(purchaseUnit).toUpperCase())} ${number(pkg)} un`
        : "avulso";
      const packageCoverageLine = packageCoverageDays > 0 ? `1 caixa cobre ${quoteCoverageDaysLabel(packageCoverageDays)}` : "sem giro";
      const stockProjectedLine = openOrder > 0
        ? `${number(projectedStock)} proj. (+${number(openOrder)})`
        : `${number(projectedStock)} proj.`;
      const statusLine = reason.label || decisionLine || "-";
      return `
        <tr class="${classes}" data-product-id="${escapeAttr(row.product_id)}" data-organization-id="${escapeAttr(row.organization_id)}" data-supplier-id="${escapeAttr(state.selectedQuoteSupplierId)}" data-suggested-quantity="${escapeAttr(row.suggested_quantity)}" data-package-size="${Number(pkg || 0)}" data-product-row="true">
          <td class="col-inc">
            <button class="qrow-toggle ${inQuote ? "on" : ""}" type="button" aria-pressed="${inQuote ? "true" : "false"}" title="${discontinued ? "Produto descontinuado" : inQuote ? "Remover da cotação" : "Adicionar à cotação"}" ${discontinued ? "disabled" : ""}>${inQuote ? "Cotação" : "Adicionar"}</button>
          </td>
          <td class="col-prod">
            <div class="qrow-name">${escapeHtml(row.name)}</div>
            <div class="qrow-sub">
              <span class="qrow-ref">${escapeHtml(ref)}</span>
              ${row.abc_class ? `<span>ABC ${escapeHtml(row.abc_class)}</span>` : ""}
              ${row.brand_name ? `<span class="qrow-brand">${escapeHtml(row.brand_name)}</span>` : ""}
              ${mixChip}
              <button class="qrow-mix-action ${discontinued ? "restore" : ""} ${showMixAction ? "" : "hidden"}" type="button" data-mix-decision="${escapeAttr(mixAction.decision)}" title="${escapeAttr(mixAction.title)}">${escapeHtml(mixAction.label)}</button>
              <button class="qrow-detail" type="button">Ver dados</button>
            </div>
            <div class="qrow-reason-text visible" title="${escapeAttr(decisionTip || reason.tip || "")}">${escapeHtml(statusLine)}</div>
          </td>
          <td class="col-demand">
            <span class="qrow-demand-main ${escapeAttr(demandTone)}">${number(forecastDaily)} un/dia</span>
            <span class="muted-line">30/90/180: ${escapeHtml(demandWindows)}</span>
            <span class="muted-line">${escapeHtml(demandClass)}${demandHelper ? ` · ${escapeHtml(demandHelper)}` : ""}</span>
            <span class="muted-line">${escapeHtml(lastSale)}</span>
          </td>
          <td class="col-stkgiro num">
            <span class="qrow-stock-main ${stockCls}">${number(stock)} un</span>
            <span class="muted-line">${escapeHtml(stockProjectedLine)}</span>
            <span class="muted-line">cob. ${escapeHtml(projectedCoverageLine)}</span>
            ${openOrder > 0 ? `<span class="muted-line">+${number(openOrder)} já pedido</span>` : ""}
          </td>
          <td class="col-cycle num">
            <strong>${horizonDays ? `${number(horizonDays)}d` : "-"}</strong>
            <span class="muted-line">prazo ${number(leadDays)}d · ciclo ${number(cycleDays)}d</span>
            ${afterPurchaseCoverage !== null ? `<span class="muted-line">depois ${quoteCoverageDaysLabel(afterPurchaseCoverage)}</span>` : ""}
            ${row.product_rebuy_interval_days ? `<span class="muted-line">item ${number(row.product_rebuy_interval_days)}d</span>` : ""}
          </td>
          <td class="col-sug">
            ${suggested > 0
              ? `<button class="link-sug" type="button" title="${escapeAttr(quoteExplainTitle(row))}">${number(suggested)}</button>`
              : basketQuantity > 0
                ? `<button class="link-sug basket" type="button" title="${escapeAttr(quoteExplainTitle(row))}">${number(basketQuantity)}</button>`
                : technicalQuantity > 0
                  ? `<span class="muted" title="${escapeAttr(quoteExplainTitle(row))}">${number(technicalQuantity)}</span>`
                  : `<span class="muted">-</span>`}
            <span class="muted-line">nec. ${number(rawNeed)} · alvo ${escapeHtml(targetLine)}</span>
            ${reorderPoint > 0 ? `<span class="muted-line">ponto ${number(reorderPoint)}</span>` : ""}
            ${decisionLine ? `<span class="muted-line" title="${escapeAttr(decisionTip)}">${escapeHtml(decisionLine)}</span>` : ""}
            ${formationLine ? `<span class="muted-line" title="${escapeAttr(row.basket_decision_reason || row.minimum_fill_reason || "")}">${escapeHtml(formationLine)}</span>` : ""}
          </td>
          <td class="col-box">
            <strong>${packageLine}</strong>
            ${suggested > 0 && hasPackage ? `<span class="muted-line">${number(suggestedBoxes)} ${packageUnitLabel}${math.roundedByPackage ? " arred." : ""}</span>` : ""}
            <span class="muted-line">${escapeHtml(packageCoverageLine)}</span>
            ${packageExcess > 0 ? `<span class="muted-line warn">excesso ${number(packageExcess)} un</span>` : ""}
          </td>
          <td class="col-qty">
            <div class="qrow-adjust">
              <div class="qrow-adjust-line">
                <div class="qrow-qty ${hasPackage ? "" : "simple"}">
                  ${hasPackage ? `<button class="qrow-step" type="button" data-step="-${pkg}" title="-1 ${packageUnitLabel} (${number(pkg)} un)">-</button>` : ""}
                  <input class="inline-input quote-quantity-input" type="text" inputmode="decimal" value="${inputValue(quantity)}" placeholder="${escapeAttr(number(suggested))}" aria-label="Quantidade" />
                  ${hasPackage ? `<button class="qrow-step" type="button" data-step="${pkg}" title="+1 ${packageUnitLabel} (${number(pkg)} un)">+</button>` : ""}
                </div>
                <div class="qrow-order-fields">
                  <span class="qrow-unit" title="Unidade de compra">${escapeHtml(String(purchaseUnit).toUpperCase())}</span>
                  <span class="qrow-pack">${escapeHtml(packageSummary)}</span>
                </div>
              </div>
              <div class="qrow-adjust-meta">
                ${suggested > 0 ? `<span class="qrow-delta ${inQuote ? "" : "hidden"} ${Math.abs(quantityDelta) > 0.0001 ? "changed" : ""}">${escapeHtml(quantityDeltaLabel)}</span>` : ""}
                <span class="save-state row-save-state" aria-live="polite"></span>
              </div>
              ${quickActions ? `<div class="qrow-quick-actions">${quickActions}</div>` : ""}
            </div>
          </td>
          <td class="col-tot num">
            ${inQuote && lineTotal > 0 ? money(lineTotal) : `<span class="muted">-</span>`}
            ${costNo > 0 ? `<span class="muted-line">${money(costNo)}/un</span>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");
}

function quoteProductRows(rows) {
  if (!rows.length) {
    return `<tr><td colspan="7" class="empty-cell">Nenhum item no filtro atual.</td></tr>`;
  }
  if ((state.quoteWorkbenchGroup || "flat") !== "signals") return quoteProductRowsFlat(rows);
  const groups = quoteWorkbenchGroups();
  const byGroup = rows.reduce((acc, row) => {
    const key = quoteWorkbenchGroupForRow(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  return groups
    .filter((group) => (byGroup[group.key] || []).length)
    .map((group) => `${quoteGroupHeader(group, byGroup[group.key].length)}${quoteProductRowsFlat(byGroup[group.key])}`)
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
  if (row.package_review_required) return { label: "Revisar caixa", cls: "warn", tip: "Embalagem minima fica alta para o alvo técnico" };
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
  const filterCounts = quoteWorkbenchFilterCounts(workbench);
  const only = state.quoteWorkbenchOnly || "all";
  document.querySelector("#quoteDetail").innerHTML = `
    <div class="quote-toolbar">
      <div class="quote-toolbar-main">
        <div class="quote-filter-zone">
          <span class="quote-toolbar-label">Filtros rápidos</span>
          <div class="quote-filter-pills" role="tablist">
          <button class="qf-pill ${filter === "all" ? "active" : ""}" type="button" data-filter="all">Todos <em>${number(filterCounts.all)}</em></button>
          <button class="qf-pill ${filter === "included" ? "active" : ""}" type="button" data-filter="included">Cotação <em>${number(filterCounts.included)}</em></button>
          <button class="qf-pill ${filter === "suggested" ? "active" : ""}" type="button" data-filter="suggested">Sugestão <em>${number(filterCounts.suggested)}</em></button>
          <button class="qf-pill ${filter === "stockout" ? "active" : ""}" type="button" data-filter="stockout">Ruptura <em>${number(filterCounts.stockout)}</em></button>
          <button class="qf-pill ${filter === "formation" ? "active" : ""}" type="button" data-filter="formation">Mínimo <em>${number(filterCounts.formation)}</em></button>
          <button class="qf-pill ${filter === "package" ? "active" : ""}" type="button" data-filter="package">Caixa <em>${number(filterCounts.package)}</em></button>
          <button class="qf-pill ${filter === "alerts" ? "active" : ""}" type="button" data-filter="alerts">Pendências <em>${number(filterCounts.alerts)}</em></button>
          <button class="qf-pill ${filter === "engine" ? "active" : ""}" type="button" data-filter="engine">Sinais <em>${number(filterCounts.engine)}</em></button>
          <button class="qf-pill ${filter === "outmix" ? "active" : ""}" type="button" data-filter="outmix">Fora do mix <em>${number(filterCounts.outmix)}</em></button>
          </div>
        </div>
        <div id="quoteLiveSummary" class="quote-live-summary" aria-live="polite">${quoteLiveSummaryMarkup()}</div>
      </div>
      <div class="quote-toolbar-tools">
        <input id="quoteItemSearch" class="search-input compact" type="search" value="${inputValue(state.quoteItemSearch || "")}" placeholder="Buscar produto / ref" />
        <select id="quoteWorkbenchOnly" class="filter-select compact" title="Filtrar condição operacional">
          <option value="all" ${only === "all" ? "selected" : ""}>Todos os itens</option>
          <option value="selected" ${only === "selected" ? "selected" : ""}>Só marcados</option>
          <option value="unselected" ${only === "unselected" ? "selected" : ""}>Só fora da cotação</option>
          <option value="open_order" ${only === "open_order" ? "selected" : ""}>Com pedido aberto</option>
          <option value="box" ${only === "box" ? "selected" : ""}>Com embalagem</option>
          <option value="modified" ${only === "modified" ? "selected" : ""}>Qtd. alterada</option>
          <option value="no_cost" ${only === "no_cost" ? "selected" : ""}>Sem custo</option>
        </select>
        <select id="quoteWorkbenchGroup" class="filter-select compact" title="Organizar itens">
          <option value="flat" ${(state.quoteWorkbenchGroup || "flat") === "flat" ? "selected" : ""}>Lista plana</option>
          <option value="signals" ${(state.quoteWorkbenchGroup || "flat") === "signals" ? "selected" : ""}>Agrupar por decisão</option>
        </select>
        <label class="quote-number-filter">
          <span>Giro mín.</span>
          <input id="quoteMinDemand" class="inline-input compact" type="text" inputmode="decimal" value="${inputValue(state.quoteWorkbenchMinDemand || "")}" placeholder="un/dia" />
        </label>
        <label class="quote-number-filter">
          <span>Valor mín.</span>
          <input id="quoteMinValue" class="inline-input compact" type="text" inputmode="decimal" value="${inputValue(state.quoteWorkbenchMinValue || "")}" placeholder="R$" />
        </label>
        <label class="quote-number-filter">
          <span>Cob. máx.</span>
          <input id="quoteMaxCoverage" class="inline-input compact" type="text" inputmode="decimal" value="${inputValue(state.quoteWorkbenchMaxCoverage || "")}" placeholder="dias" />
        </label>
      </div>
      <div class="quote-assembly-actions" aria-label="Ações de montagem">
        <span>Ações no filtro</span>
        <button class="secondary-button compact quote-mark-visible" type="button" title="Incluir todos os produtos visíveis no filtro atual">Marcar visíveis</button>
        <button class="secondary-button compact quote-unmark-visible" type="button" title="Remover da cotação todos os produtos visíveis no filtro atual">Remover visíveis</button>
        <button class="secondary-button compact quote-complete-minimum" type="button" title="Adicionar itens essenciais e a cesta recomendada até atingir o mínimo">Completar mínimo</button>
        <button class="secondary-button compact quote-restore-items" type="button" title="Incluir todos os sugeridos com a quantidade calculada">Usar sugestão</button>
        <button class="secondary-button compact quote-round-packages" type="button" title="Arredondar itens marcados para caixas inteiras">Caixas inteiras</button>
        <details class="quote-more-actions">
          <summary>Mais</summary>
          <div>
            <button class="text-button quote-manual-item" type="button" title="Registrar item de catálogo que ainda não existe no ERP">Item avulso</button>
            <button class="text-button quote-clear-items" type="button" title="Remover todos os itens marcados deste fornecedor">Limpar marcados</button>
          </div>
        </details>
      </div>
    </div>
    <div class="quote-items-wrap nexo-legacy-shell">
      <table class="quote-items-table nexo-legacy-table">
        <thead>
          <tr>
            ${quoteSortableHeader("included", "Cotação", "col-inc")}
            ${quoteSortableHeader("product", "Produto", "col-prod")}
            ${quoteSortableHeader("demand", "Giro e venda", "col-demand")}
            ${quoteSortableHeader("stock", "Estoque proj.", "col-stkgiro num")}
            ${quoteSortableHeader("horizon", "Ciclo", "col-cycle num")}
            ${quoteSortableHeader("suggested", "Motor", "col-sug")}
            ${quoteSortableHeader("package", "Caixa", "col-box")}
            ${quoteSortableHeader("quantity", "Qtd. cotada", "col-qty")}
            ${quoteSortableHeader("total", "Valor", "col-tot num")}
          </tr>
        </thead>
        <tbody>${quoteProductRows(workbench.rows || [])}</tbody>
      </table>
    </div>
    <div id="quoteOrderDock" class="quote-order-dock" aria-live="polite">${quoteOrderDockContent()}</div>
  `;
  applyWorkbenchView();
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
  const search = (document.querySelector("#quoteSupplierSearch")?.value || "").trim().toLowerCase();
  const context = quoteSupplierContext(state.quoteSuppliers || []);
  let suppliers = (state.quoteSuppliers || []).filter((row) => {
    const searchOk = !search || supplierSearchText(row).includes(search);
    return searchOk && quoteSupplierMatchesLenses(row, context);
  });
  suppliers = sortQuoteSuppliers(suppliers, context);
  const grid = document.querySelector("#quoteSuppliersTable");
  const previousScrollTop = options.preserveScroll === false ? 0 : Number(grid?.scrollTop || 0);
  const preview = suppliers.find((row) => row.supplier_id === state.quoteSupplierPreviewId);
  if (!preview) state.quoteSupplierPopupOpen = false;
  state.quoteSupplierPreviewId = preview?.supplier_id || "";
  const summary = document.querySelector("#quoteSupplierDeskSummary");
  if (summary) summary.innerHTML = quoteDeskSummary(suppliers);
  if (grid) {
    grid.innerHTML = quoteSupplierRows(suppliers);
    if (options.preserveScroll !== false) grid.scrollTop = previousScrollTop;
  }
  renderQuoteSupplierFastState();
  updateQuoteSupplierChips();
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
    toggle.title = discontinued ? "Produto descontinuado" : row.in_quote ? "Remover da cotação" : "Adicionar à cotação";
    toggle.textContent = row.in_quote ? "Cotação" : "Adicionar";
  }
  const totalCell = rowEl.querySelector(".col-tot");
  if (totalCell) {
    const total = Number(row.quote_quantity || 0) * quoteOrderUnitCost(row);
    const costNo = Number(row.cost_no_tax || 0);
    const costLine = costNo > 0 ? `<span class="muted-line">${money(costNo)}/un</span>` : "";
    totalCell.innerHTML = row.in_quote && total > 0
      ? `${money(total)}${costLine}`
      : `<span class="muted">-</span>${costLine}`;
  }
  const pack = rowEl.querySelector(".qrow-pack");
  const packageSize = Number(row.purchase_package_size || row.package_size || 0);
  const purchaseUnit = row.purchase_unit || row.unit || "UN";
  const packageUnitLabel = quotePackageUnitLabel(purchaseUnit);
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

