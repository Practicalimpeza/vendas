// Mesa de compras: ranking, filtros e detalhe flutuante de fornecedores.

const QUOTE_SUPPLIER_HELP = {
  cycle: "Intervalo estimado, em dias, para este fornecedor voltar à mesa de compra. Ciclos longos e curtos entram como referência para cobertura e frequência de revisão.",
};

function supplierOpenQuoteState(row) {
  const openQuotes = Number(row.open_quote_count || 0);
  if (!openQuotes) return null;
  const status = row.latest_quote_status || "";
  const count = number(openQuotes);
  if (status === "sent") {
    return {
      label: "Cotação enviada",
      shortLabel: `${count} enviada`,
      chipLabel: `${count} cotação enviada`,
      actionLabel: "Abrir cotação",
      reason: "Cotação enviada ao fornecedor.",
      cls: "info",
      score: 7600,
    };
  }
  if (status === "responded") {
    return {
      label: "Resposta registrada",
      shortLabel: `${count} respondida`,
      chipLabel: `${count} resposta registrada`,
      actionLabel: "Abrir cotação",
      reason: "Resposta do fornecedor registrada.",
      cls: "ok",
      score: 7800,
    };
  }
  return {
    label: "Cotação em rascunho",
    shortLabel: `${count} rascunho`,
    chipLabel: `${count} cotação em rascunho`,
    actionLabel: "Abrir cotação",
    reason: "Cotação em montagem.",
    cls: "warn",
    score: 7000,
  };
}

function supplierWorkbenchStatus(row) {
  const total = Number(row.estimated_value || 0);
  const minimum = Number(row.minimum_order_value || 0);
  const urgent = Number(row.urgent_count || 0);
  const buyNow = Number(row.buy_now_count || 0);
  const alerts = Number(row.alert_count || 0);
  const openQuoteState = supplierOpenQuoteState(row);
  const formationRank = row.order_formation_rank || "";
  const formationStrategy = row.order_formation_strategy || "";
  if (openQuoteState) return { label: openQuoteState.label, cls: openQuoteState.cls, score: openQuoteState.score, rank: "open" };
  if (formationStrategy === "wait_or_negotiate") {
    return { label: "Ciclo longo", cls: "warn", score: 1800 + buyNow * 20 + alerts * 15 + Math.min(500, total / 10), rank: "below_min" };
  }
  if (total <= 0 && urgent + buyNow <= 0) return { label: "Sem valor", cls: "", score: -1000, rank: "none" };
  if (formationRank === "ready") return { label: "Mínimo atingido", cls: "ok", score: 6000 + urgent * 100 + buyNow * 20 + alerts * 10, rank: "ready" };
  if (formationRank === "risk") return { label: "Ruptura ou sinais", cls: "danger", score: 5000 + urgent * 100 + buyNow * 20, rank: "risk" };
  if (formationRank === "no_min") return { label: "Sem mínimo", cls: "warn", score: 3000 + urgent * 100 + buyNow * 20, rank: "no_min" };
  if (formationRank === "below_min") {
    const label = formationStrategy === "wait_or_negotiate" ? "Ciclo longo" : "Abaixo do mínimo";
    return { label, cls: "warn", score: 2000 + buyNow * 20 + alerts * 15 + Math.min(500, total / 10), rank: "below_min" };
  }
  if (minimum <= 0) return { label: "Sem mínimo", cls: "warn", score: 3000 + urgent * 100 + buyNow * 20, rank: "no_min" };
  if (total >= minimum) return { label: "Mínimo atingido", cls: "ok", score: 6000 + urgent * 100 + buyNow * 20 + alerts * 10, rank: "ready" };
  if (urgent > 0) return { label: "Ruptura ou sinais", cls: "danger", score: 5000 + urgent * 100 + buyNow * 20, rank: "risk" };
  return { label: "Abaixo do mínimo", cls: "warn", score: 2000 + buyNow * 20 + alerts * 15, rank: "below_min" };
}

function quoteSupplierContext(rows = state.quoteSuppliers || []) {
  const values = rows
    .map((row) => Number(row.estimated_value || 0))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const p75 = values.length ? values[Math.floor(values.length * 0.75)] : 0;
  return { highValueThreshold: Math.max(500, p75 || 0) };
}

function supplierMinimumMeta(row) {
  const total = Number(row.estimated_value || 0);
  const minimum = Number(row.minimum_order_value || 0);
  const missing = Math.max(0, minimum - total);
  const pct = minimum > 0 ? Math.max(0, (total / minimum) * 100) : (total > 0 ? 100 : 0);
  return { total, minimum, missing, pct };
}

function quoteSupplierLensDefinitions() {
  return [
    { key: "all", label: "Todos", match: () => true },
    { key: "rupture", label: "Ruptura", match: (row) => Number(row.urgent_count || 0) > 0 },
    {
      key: "near_minimum",
      label: "Perto do mínimo",
      match: (row) => {
        const meta = supplierMinimumMeta(row);
        return meta.minimum > 0 && meta.total > 0 && meta.total < meta.minimum && meta.pct >= 65;
      },
    },
    {
      key: "below_minimum",
      label: "Abaixo do mínimo",
      match: (row) => {
        const meta = supplierMinimumMeta(row);
        return meta.minimum > 0 && meta.total < meta.minimum;
      },
    },
    { key: "long_cycle", label: "Ciclo longo", match: (row) => Number(row.supplier_days_to_order || 0) >= 60 },
    { key: "open_order", label: "Pedido aberto", match: (row) => Number(row.pending_order_count || 0) > 0 },
    { key: "open_quote", label: "Cotação aberta", match: (row) => Number(row.open_quote_count || 0) > 0 },
    {
      key: "high_value",
      label: "Alto valor",
      match: (row, context) => Number(row.estimated_value || 0) >= Number(context.highValueThreshold || 0) && Number(row.estimated_value || 0) > 0,
    },
  ];
}

function quoteSupplierLensCounts(rows = state.quoteSuppliers || []) {
  const context = quoteSupplierContext(rows);
  return quoteSupplierLensDefinitions().reduce((acc, lens) => {
    acc[lens.key] = rows.filter((row) => lens.match(row, context)).length;
    return acc;
  }, {});
}

function defaultQuoteSupplierChip() {
  return "all";
}

function activeQuoteSupplierLenses() {
  const lenses = (state.quoteSupplierLenses || []).filter((lens) => lens && lens !== "all");
  return lenses.length ? [lenses[0]] : ["all"];
}

function quoteLegacyChipToLens(chip) {
  const map = {
    all: "all",
    open: "open_quote",
    risk: "rupture",
    below_min: "below_minimum",
    ready: "near_minimum",
  };
  return map[chip] || chip || "all";
}

function quoteSupplierMatchesLenses(row, context) {
  const active = activeQuoteSupplierLenses().filter((key) => key !== "all");
  if (!active.length) return true;
  const definitions = quoteSupplierLensDefinitions();
  return active.every((key) => {
    const lens = definitions.find((item) => item.key === key);
    return lens ? lens.match(row, context) : true;
  });
}

function quoteSupplierColumnFilters() {
  return state.quoteSupplierColumnFilters || {};
}

function quoteSupplierColumnFilterValue(key) {
  return quoteSupplierColumnFilters()[key] || "";
}

function quoteSupplierMatchesColumnFilters(row, context) {
  const filters = quoteSupplierColumnFilters();
  const supplierTerm = (filters.supplier || "").trim().toLowerCase();
  if (supplierTerm && ![row.supplier_name, row.contact_name, row.contact_phone].join(" ").toLowerCase().includes(supplierTerm)) return false;
  const meta = supplierMinimumMeta(row);
  const estimated = Number(row.estimated_value || 0);
  const buyNow = Number(row.buy_now_count || 0);
  const urgent = Number(row.urgent_count || 0);
  const alerts = Number(row.alert_count || 0);
  const cycle = Number(row.supplier_days_to_order || 0);
  const openQuotes = Number(row.open_quote_count || 0);
  const openOrders = Number(row.pending_order_count || 0);
  if (filters.value === "positive" && estimated <= 0) return false;
  if (filters.value === "high" && (estimated <= 0 || estimated < Number(context.highValueThreshold || 0))) return false;
  if (filters.value === "zero" && estimated > 0) return false;
  if (filters.minimum === "configured" && meta.minimum <= 0) return false;
  if (filters.minimum === "missing" && meta.minimum > 0) return false;
  if (filters.minimum === "met" && !(meta.minimum > 0 && meta.total >= meta.minimum)) return false;
  if (filters.gap === "missing" && !(meta.minimum > 0 && meta.total < meta.minimum)) return false;
  if (filters.gap === "ok" && !(meta.minimum > 0 && meta.total >= meta.minimum)) return false;
  if (filters.gap === "none" && meta.minimum > 0) return false;
  if (filters.pct === "under_65" && !(meta.minimum > 0 && meta.pct < 65)) return false;
  if (filters.pct === "near" && !(meta.minimum > 0 && meta.pct >= 65 && meta.pct < 100)) return false;
  if (filters.pct === "met" && !(meta.minimum > 0 && meta.pct >= 100)) return false;
  if (filters.cycle === "long" && cycle < 60) return false;
  if (filters.cycle === "short" && !(cycle > 0 && cycle < 60)) return false;
  if (filters.cycle === "none" && cycle > 0) return false;
  if (filters.risk === "buy_now" && buyNow <= 0) return false;
  if (filters.risk === "rupture" && urgent <= 0) return false;
  if (filters.risk === "signals" && alerts <= 0) return false;
  if (filters.risk === "none" && (buyNow > 0 || urgent > 0 || alerts > 0)) return false;
  if (filters.open === "quote" && openQuotes <= 0) return false;
  if (filters.open === "order" && openOrders <= 0) return false;
  if (filters.open === "any" && openQuotes + openOrders <= 0) return false;
  if (filters.open === "none" && openQuotes + openOrders > 0) return false;
  return true;
}

function supplierSignalChips(row) {
  const meta = supplierMinimumMeta(row);
  const signals = [];
  const urgent = Number(row.urgent_count || 0);
  const alerts = Number(row.alert_count || 0);
  const openQuotes = Number(row.open_quote_count || 0);
  const pendingOrders = Number(row.pending_order_count || 0);
  const openQuoteState = supplierOpenQuoteState(row);
  const cycleDays = Number(row.supplier_days_to_order || 0);
  if (urgent) signals.push({ label: `${number(urgent)} ruptura${urgent > 1 ? "s" : ""}`, tone: "danger" });
  if (openQuotes) signals.push({ label: openQuoteState?.chipLabel || `${number(openQuotes)} cotação aberta`, tone: openQuoteState?.cls || "info" });
  if (pendingOrders) signals.push({ label: `${number(pendingOrders)} pedido aberto`, tone: "info" });
  if (meta.minimum > 0 && meta.total >= meta.minimum) signals.push({ label: "mínimo atingido", tone: "good" });
  else if (meta.minimum > 0 && meta.total > 0) signals.push({ label: `faltam ${money(meta.missing)}`, tone: meta.pct >= 65 ? "warn" : "muted" });
  if (cycleDays >= 60) signals.push({ label: `ciclo ${number(cycleDays)}d`, tone: "warn" });
  if (alerts && !urgent) signals.push({ label: `${number(alerts)} sinais`, tone: "muted" });
  if (Number(row.out_of_mix_count || 0)) signals.push({ label: "fora do mix", tone: "muted" });
  return signals.slice(0, 4);
}

function supplierSearchText(row) {
  const status = supplierWorkbenchStatus(row);
  const signals = supplierSignalChips(row).map((item) => item.label).join(" ");
  return [
    row.supplier_name,
    row.contact_phone,
    row.contact_name,
    status.label,
    signals,
  ].join(" ").toLowerCase();
}

function quoteSupplierDefaultSortDir(key) {
  return key === "supplier" || key === "minimum_gap" ? "asc" : "desc";
}

function setQuoteSupplierSort(key, options = {}) {
  const nextKey = key || "supplier";
  const currentKey = state.quoteSupplierSort || "supplier";
  if (options.toggle && currentKey === nextKey) {
    const currentDir = state.quoteSupplierSortDir || quoteSupplierDefaultSortDir(nextKey);
    state.quoteSupplierSortDir = currentDir === "asc" ? "desc" : "asc";
  } else {
    state.quoteSupplierSort = nextKey;
    state.quoteSupplierSortDir = options.dir || quoteSupplierDefaultSortDir(nextKey);
  }
}

function setQuoteSupplierViewMode(mode) {
  state.quoteSupplierViewMode = ["table", "compact"].includes(mode) ? mode : "table";
  renderQuoteSupplierFastState();
}

function quoteSupplierById(supplierId) {
  return (state.quoteSuppliers || []).find((row) => row.supplier_id === supplierId);
}

function renderQuoteSupplierModeControls() {
  const stage = document.querySelector("#quoteSupplierStage");
  if (stage) {
    stage.classList.toggle("quote-view-compact", state.quoteSupplierViewMode === "compact");
  }
  document.querySelectorAll("#quoteSupplierViewModes .quote-view-mode").forEach((button) => {
    const active = button.dataset.quoteSupplierView === state.quoteSupplierViewMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function renderQuoteSupplierInspectorState() {
  const inspector = document.querySelector("#quoteSupplierInspector");
  if (!inspector) return;
  const preview = quoteSupplierById(state.quoteSupplierPreviewId);
  const open = Boolean(state.quoteSupplierPopupOpen && preview);
  inspector.innerHTML = open ? `<div class="quote-supplier-inspector-panel">${quoteSupplierInspector(preview)}</div>` : "";
  inspector.classList.toggle("open", open);
  document.body.classList.toggle("supplier-popup-open", open);
  if (typeof updateFloatingOverlayState === "function") updateFloatingOverlayState();
  document.querySelectorAll(".purchase-supplier-row[data-supplier-id]").forEach((row) => {
    row.classList.toggle("active", open && row.dataset.supplierId === state.quoteSupplierPreviewId);
  });
}

function renderQuoteSupplierFastState() {
  renderQuoteSupplierModeControls();
  renderQuoteSupplierInspectorState();
}

function sortQuoteSuppliers(rows, context) {
  const key = state.quoteSupplierSort || "supplier";
  const dir = state.quoteSupplierSortDir || quoteSupplierDefaultSortDir(key);
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  const byDir = (primary, fallback = 0) => {
    if (primary !== 0) return dir === "desc" ? -primary : primary;
    return fallback;
  };
  return rows.sort((a, b) => {
    const statusA = supplierWorkbenchStatus(a);
    const statusB = supplierWorkbenchStatus(b);
    const metaA = supplierMinimumMeta(a);
    const metaB = supplierMinimumMeta(b);
    const supplierFallback = collator.compare(a.supplier_name || "", b.supplier_name || "");
    if (key === "value") return byDir(Number(a.estimated_value || 0) - Number(b.estimated_value || 0), supplierFallback);
    if (key === "minimum") return byDir(Number(a.minimum_order_value || 0) - Number(b.minimum_order_value || 0), supplierFallback);
    if (key === "minimum_gap") {
      const gapA = metaA.minimum > 0 ? metaA.missing : Number.MAX_SAFE_INTEGER;
      const gapB = metaB.minimum > 0 ? metaB.missing : Number.MAX_SAFE_INTEGER;
      return byDir(gapA - gapB, Number(b.estimated_value || 0) - Number(a.estimated_value || 0) || supplierFallback);
    }
    if (key === "minimum_pct") {
      const pctA = metaA.minimum > 0 ? metaA.pct : -1;
      const pctB = metaB.minimum > 0 ? metaB.pct : -1;
      return byDir(pctA - pctB, Number(b.estimated_value || 0) - Number(a.estimated_value || 0) || supplierFallback);
    }
    if (key === "skus") return byDir(Number(a.active_skus || 0) - Number(b.active_skus || 0), supplierFallback);
    if (key === "target") return byDir(Number(a.target_order_value || 0) - Number(b.target_order_value || 0), supplierFallback);
    if (key === "cycle") return byDir(Number(a.supplier_days_to_order || 0) - Number(b.supplier_days_to_order || 0), supplierFallback);
    if (key === "open_quote") return byDir(Number(a.open_quote_count || 0) - Number(b.open_quote_count || 0), Number(b.open_quote_estimated_value || 0) - Number(a.open_quote_estimated_value || 0) || supplierFallback);
    if (key === "nexo") return byDir(statusA.score - statusB.score, supplierFallback);
    return byDir(collator.compare(a.supplier_name || "", b.supplier_name || ""), Number(b.estimated_value || 0) - Number(a.estimated_value || 0));
  });
}

function quoteDeskSummary(rows = state.quoteSuppliers || []) {
  const context = quoteSupplierContext(rows);
  const activeLenses = activeQuoteSupplierLenses();
  const totalSuggested = rows.reduce((sum, row) => sum + Number(row.estimated_value || 0), 0);
  const openOrders = rows.reduce((sum, row) => sum + Number(row.pending_order_count || 0), 0);
  const openQuotes = rows.reduce((sum, row) => sum + Number(row.open_quote_count || 0), 0);
  const rupture = rows.reduce((sum, row) => sum + Number(row.urgent_count || 0), 0);
  const nearMinimum = rows.filter((row) => quoteSupplierLensDefinitions().find((lens) => lens.key === "near_minimum").match(row, context)).length;
  const longCycle = rows.filter((row) => Number(row.supplier_days_to_order || 0) >= 60).length;
  const missingToMinimum = rows.reduce((sum, row) => {
    const minimum = Number(row.minimum_order_value || 0);
    const suggested = Number(row.estimated_value || 0);
    return sum + Math.max(0, minimum - suggested);
  }, 0);
  const blocks = [
    { label: "Fornecedores", value: number(rows.length), detail: "visíveis", lens: "all" },
    { label: "Valor", value: money(totalSuggested), detail: "total filtrado", sort: "value" },
    { label: "Abaixo do mínimo", value: money(missingToMinimum), detail: `${number(nearMinimum)} perto`, lens: "near_minimum" },
    { label: "Ruptura", value: number(rupture), detail: "itens", lens: "rupture" },
    { label: "Ciclo longo", value: number(longCycle), detail: "fornecedores", lens: "long_cycle" },
    { label: "Abertos", value: number(openOrders + openQuotes), detail: `${number(openOrders)} ped. / ${number(openQuotes)} cot.`, lens: openQuotes ? "open_quote" : "open_order" },
  ];
  return `
    <div class="purchase-overview purchase-overview-numeric">
      <div class="purchase-overview-metrics">
        ${blocks.map((block) => `
          <div class="purchase-overview-card">
            <span>${escapeHtml(block.label)}</span>
            <strong>${escapeHtml(block.value)}</strong>
            <em>${escapeHtml(block.detail)}</em>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// Status real da última cotação/pedido do fornecedor (cruza state.purchaseOrders).
function quoteSupplierActivity(row) {
  const orders = (state.purchaseOrders || []).filter((order) => order.supplier_id === row.supplier_id);
  const orderRank = { received: 5, partial_received: 4, sent: 3, approved: 2, pending_confirmation: 1 };
  const latestOrder = orders
    .slice()
    .sort((a, b) => (orderRank[b.status] || 0) - (orderRank[a.status] || 0)
      || String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  if (latestOrder) {
    const map = {
      pending_confirmation: { label: "Aguardando confirmação", cls: "warn" },
      approved: { label: "Pedido aprovado", cls: "good" },
      sent: { label: "Pedido enviado", cls: "info" },
      partial_received: { label: "Recebido parcial", cls: "info" },
      received: { label: "Recebido", cls: "good" },
    };
    const meta = map[latestOrder.status] || { label: latestOrder.status || "Pedido", cls: "info" };
    const when = latestOrder.received_at || latestOrder.approved_at || latestOrder.created_at;
    return { label: meta.label, cls: meta.cls, detail: when ? shortDate(when) : "", rank: 6 };
  }
  const status = row.latest_quote_status || "";
  const quoteMap = {
    draft: { label: "Cotação em rascunho", cls: "warn" },
    sent: { label: "Cotação enviada", cls: "info" },
    responded: { label: "Resposta registrada", cls: "good" },
  };
  if (quoteMap[status]) {
    return { label: quoteMap[status].label, cls: quoteMap[status].cls, detail: row.latest_quote_at ? shortDate(row.latest_quote_at) : "", rank: 3 };
  }
  return { label: "—", cls: "muted", detail: "sem cotação", rank: 0 };
}

function quoteSupplierTableSignals(row) {
  return supplierSignalChips(row).filter((chip) => {
    const label = (chip.label || "").toLowerCase();
    if (label.startsWith("faltam") || label === "mínimo atingido") return false;
    if (label.startsWith("ciclo ")) return false;
    if (label.includes("cotação") || label.includes("pedido aberto")) return false;
    return true;
  });
}

function quoteSupplierPct(part, total) {
  const value = Number(part || 0);
  const target = Number(total || 0);
  if (target <= 0) return value > 0 ? 100 : 0;
  return (value / target) * 100;
}

function quoteSupplierDailyValue(row) {
  return Number(row.supplier_daily_purchase_value || 0);
}

function quoteSupplierTurnoverValue(row) {
  const dailyValue = quoteSupplierDailyValue(row);
  return Number(row.turnover_value || 0) || (dailyValue > 0 ? dailyValue * 30 : 0);
}

function quoteSupplierCoverageDays(row) {
  const stock = Number(row.stock_value || 0);
  const turnover = quoteSupplierTurnoverValue(row);
  return stock > 0 && turnover > 0 ? (stock / turnover) * 30 : 0;
}

function quoteSupplierCoverageLabel(days) {
  if (!days) return "—";
  if (days >= 365) return `${number(days / 30)}m`;
  return `${number(days)}d`;
}

function quoteSupplierDaysToMinimum(row) {
  const minimum = Number(row.minimum_order_value || 0);
  const dailyValue = quoteSupplierDailyValue(row);
  return Number(row.supplier_days_to_minimum || 0) || (minimum > 0 && dailyValue > 0 ? minimum / dailyValue : 0);
}

function quoteSupplierPctTier(pct) {
  if (pct >= 100) return "met";
  if (pct >= 70) return "near";
  return "low";
}

function quoteSupplierContactLine(row) {
  return row.contact_phone || row.contact_email || row.contact_name || "";
}

function quoteSupplierSummaryLine(row) {
  const parts = [];
  const skus = Number(row.active_skus || 0);
  const urgent = Number(row.urgent_count || 0);
  const openQuotes = Number(row.open_quote_count || 0);
  if (skus > 0) parts.push(`${number(skus)} SKUs`);
  if (urgent > 0) parts.push(`${number(urgent)} rupt.`);
  if (openQuotes > 0) parts.push(`${number(openQuotes)} cot. aberta`);
  return parts.join(" · ") || quoteSupplierContactLine(row);
}

function quoteSupplierDirectoryColumns() {
  return [
    {
      id: "supplier_name",
      label: "Fornecedor",
      type: "text",
      minWidth: 150,
      value: (r) => r.supplier_name || "",
      text: (r) => `${r.supplier_name || ""} ${r.contact_name || ""} ${r.contact_phone || ""}`,
      render: (r) => `<strong class="qsup-name">${escapeHtml(r.supplier_name || "—")}</strong><span class="muted-line">${escapeHtml(quoteSupplierSummaryLine(r))}</span>`,
    },
    {
      id: "pedido",
      label: "Pedido",
      type: "money",
      align: "num",
      minWidth: 140,
      value: (r) => Number(r.estimated_value || 0),
      sortOptions: [
        { id: "pedido_total", label: "Total do pedido", dir: "desc" },
        { id: "pedido_pct", label: "% do mínimo", dir: "desc" },
        { id: "pedido_falta", label: "Falta para mínimo", dir: "asc" },
        { id: "pedido_minimo", label: "Pedido mínimo", dir: "desc" },
      ],
      render: (r) => {
        const m = supplierMinimumMeta(r);
        const tier = quoteSupplierPctTier(m.pct);
        const width = Math.min(100, Math.max(0, m.pct));
        const minimum = m.minimum > 0 ? compactMoney(m.minimum) : "sem mínimo";
        const missing = m.missing > 0 ? `faltam ${compactMoney(m.missing)}` : "mínimo ok";
        const activity = quoteSupplierActivity(r);
        return `<div class="qsup-decision qsup-money-block"><strong>${money(m.total)}</strong><span>min ${escapeHtml(minimum)}</span><em class="${tier}">${number(m.pct)}% · ${escapeHtml(missing)}</em><i class="qsup-bar ${tier}" aria-hidden="true"><b style="width:${width}%"></b></i>${activity.rank ? `<small>${escapeHtml(activity.label)}</small>` : ""}</div>`;
      },
    },
    {
      id: "estoque",
      label: "Estoque",
      type: "money",
      align: "num",
      minWidth: 190,
      value: (r) => Number(r.stock_value || 0),
      sortOptions: [
        { id: "estoque_valor", label: "Estoque atual", dir: "desc" },
        { id: "giro_valor", label: "Giro/mês", dir: "desc" },
        { id: "cobertura_dias", label: "Cobertura", dir: "asc" },
      ],
      render: (r) => {
        const stock = Number(r.stock_value || 0);
        const turnover = quoteSupplierTurnoverValue(r);
        const coverageDays = quoteSupplierCoverageDays(r);
        return `<div class="qsup-triple"><span title="Valor estimado do estoque atual dos produtos deste fornecedor"><b>Estoque</b><strong>${compactMoney(stock)}</strong></span><span title="Giro histórico estimado por mês, calculado pelo consumo dos produtos deste fornecedor"><b>Giro</b><strong>${turnover > 0 ? compactMoney(turnover) : "—"}</strong></span><span title="Cobertura aproximada: estoque atual dividido pelo giro histórico"><b>Cobertura</b><strong>${quoteSupplierCoverageLabel(coverageDays)}</strong></span></div>`;
      },
    },
    {
      id: "saude",
      label: "Ritmo",
      type: "percent",
      align: "num",
      minWidth: 130,
      sortOptions: [
        { id: "ritmo_dias", label: "Dias p/ mínimo", dir: "asc" },
        { id: "ritmo_giro", label: "Giro/mês", dir: "desc" },
      ],
      value: (r) => {
        const days = quoteSupplierDaysToMinimum(r);
        return days > 0 ? days : 9999;
      },
      render: (r) => {
        const turnover = quoteSupplierTurnoverValue(r);
        const days = quoteSupplierDaysToMinimum(r);
        const main = days > 0 ? `${number(days)}d p/min` : "sem giro";
        return `<div class="qsup-health" title="Ritmo = giro histórico contra pedido mínimo. É uma medida contínua, não uma classificação fixa do fornecedor."><strong class="neutral">${escapeHtml(main)}</strong><span>giro/mês ${turnover > 0 ? compactMoney(turnover) : "—"}</span></div>`;
      },
    },
    {
      id: "condicao",
      label: "Condição",
      type: "int",
      align: "",
      minWidth: 120,
      value: (r) => Number(r.average_lead_time_days || r.lead_time_days || 0),
      sortOptions: [
        { id: "cond_prazo", label: "Prazo médio", dir: "asc" },
        { id: "cond_desconto", label: "Meta desconto", dir: "desc" },
        { id: "cond_revisao", label: "Revisão", dir: "asc" },
      ],
      render: (r) => {
        const lead = Number(r.average_lead_time_days || r.lead_time_days || 0);
        const review = Number(r.order_review_cycle_days || 0);
        const discountTarget = Number(r.target_order_value || 0);
        const minimum = Number(r.minimum_order_value || 0);
        const discountLine = discountTarget > minimum ? `desconto ${compactMoney(discountTarget)}` : "desconto —";
        return `<div class="qsup-condition"><strong>${lead > 0 ? `${number(lead)}d` : "—"}</strong><span>prazo médio</span><em>${escapeHtml(discountLine)}</em>${review > 0 ? `<small>rev. ${number(review)}d</small>` : ""}</div>`;
      },
    },
    {
      id: "contato",
      label: "Contato",
      type: "text",
      minWidth: 140,
      value: (r) => `${r.contact_name || ""} ${r.contact_phone || ""} ${r.contact_email || ""}`,
      render: (r) => {
        const main = r.contact_name || r.contact_phone || r.contact_email || "—";
        const sub = r.contact_name ? (r.contact_phone || r.contact_email || "") : (r.contact_phone && r.contact_email ? r.contact_email : "");
        return `<div class="qsup-contact"><strong>${escapeHtml(main)}</strong>${sub ? `<span>${escapeHtml(sub)}</span>` : ""}</div>`;
      },
    },
    { id: "pedido_total", label: "Pedido: total", type: "money", value: (r) => Number(r.estimated_value || 0), hidden: true, utility: true, searchable: false, filter: false },
    { id: "pedido_pct", label: "Pedido: % mínimo", type: "percent", value: (r) => supplierMinimumMeta(r).pct, hidden: true, utility: true, searchable: false, filter: false },
    { id: "pedido_falta", label: "Pedido: falta", type: "money", value: (r) => {
      const m = supplierMinimumMeta(r);
      return m.minimum > 0 ? m.missing : 999999999;
    }, hidden: true, utility: true, searchable: false, filter: false },
    { id: "pedido_minimo", label: "Pedido mínimo", type: "money", value: (r) => Number(r.minimum_order_value || 0), hidden: true, utility: true, searchable: false, filter: false },
    { id: "estoque_valor", label: "Estoque atual", type: "money", value: (r) => Number(r.stock_value || 0), hidden: true, utility: true, searchable: false, filter: false },
    { id: "giro_valor", label: "Giro/mês", type: "money", value: (r) => quoteSupplierTurnoverValue(r), hidden: true, utility: true, searchable: false, filter: false },
    { id: "cobertura_dias", label: "Cobertura", type: "int", value: (r) => quoteSupplierCoverageDays(r) || 999999, hidden: true, utility: true, searchable: false, filter: false },
    { id: "ritmo_dias", label: "Dias p/ mínimo", type: "int", value: (r) => quoteSupplierDaysToMinimum(r) || 999999, hidden: true, utility: true, searchable: false, filter: false },
    { id: "ritmo_giro", label: "Ritmo: giro/mês", type: "money", value: (r) => quoteSupplierTurnoverValue(r), hidden: true, utility: true, searchable: false, filter: false },
    { id: "cond_prazo", label: "Prazo médio", type: "int", value: (r) => Number(r.average_lead_time_days || r.lead_time_days || 0), hidden: true, utility: true, searchable: false, filter: false },
    { id: "cond_desconto", label: "Meta desconto", type: "money", value: (r) => Number(r.target_order_value || 0), hidden: true, utility: true, searchable: false, filter: false },
    { id: "cond_revisao", label: "Revisão", type: "int", value: (r) => Number(r.order_review_cycle_days || 0), hidden: true, utility: true, searchable: false, filter: false },
  ];
}

let quoteSuppliersTable = null;

function ensureQuoteSuppliersTable() {
  if (quoteSuppliersTable) return quoteSuppliersTable;
  const mount = document.querySelector("#quoteSuppliersTable");
  if (!mount || typeof createDataTable !== "function") return null;
  quoteSuppliersTable = createDataTable(mount, {
    key: "quote-suppliers-5",
    columns: quoteSupplierDirectoryColumns(),
    rows: [],
    searchPlaceholder: "Buscar fornecedor, contato…",
    rowKey: (r) => r.supplier_id,
    rowAttrs: (r) => ({ "data-supplier-id": r.supplier_id || "", class: "quote-supplier-dt-row" }),
    onRowClick: (r) => openQuoteSupplierPreview(r.supplier_id),
    emptyTitle: "Nenhum fornecedor encontrado",
    emptyHint: "Ajuste a busca ou os filtros das colunas.",
    initialSort: [{ id: "pedido", dir: "desc" }],
    rowActions: [
      { id: "abrir", label: "Abrir mesa", icon: "shopping-cart", title: "Montar pedido deste fornecedor", onClick: (r) => loadQuoteSupplierWorkbench(r.supplier_id) },
    ],
  });
  return quoteSuppliersTable;
}

function openQuoteSupplierPreview(supplierId) {
  if (!supplierId) return;
  state.quoteSupplierPreviewId = supplierId;
  state.quoteSupplierPopupOpen = true;
  renderQuoteSupplierInspectorState();
  prefetchQuoteSupplierWorkbench(supplierId).catch(() => {});
}

function supplierMinimumProgress(row) {
  const total = Number(row.estimated_value || 0);
  const minimum = Number(row.minimum_order_value || 0);
  if (minimum <= 0) return { pct: total > 0 ? 100 : 0, label: "Sem mínimo cadastrado" };
  const pct = Math.max(0, (total / minimum) * 100);
  const missing = Math.max(0, minimum - total);
  return {
    pct,
    label: pct >= 100 ? `${number(pct)}% do mínimo` : `faltam ${money(missing)}`,
  };
}

function supplierDifficultyLabel(value) {
  return {
    auto: "Automatica",
    easy: "Facil",
    normal: "Normal",
    hard: "Dificil",
    unknown: "Desconhecida",
  }[value || "auto"] || "Automatica";
}

function supplierProfilePayloadFromDock(form, row) {
  const supplierId = form.dataset.supplierId || row?.supplier_id || "";
  const inferredOrg = supplierId.includes(":supplier:") ? supplierId.split(":supplier:")[0] : "";
  return {
    organization_id: form.dataset.organizationId || row?.organization_id || inferredOrg,
    supplier_id: supplierId,
    supplier_name: row?.supplier_name || form.dataset.supplierName || "",
    contact_name: form.querySelector("[data-supplier-edit-contact-name]")?.value.trim() || "",
    contact_phone: form.querySelector("[data-supplier-edit-phone]")?.value.trim() || "",
    contact_email: form.querySelector("[data-supplier-edit-email]")?.value.trim() || "",
    minimum_order_value: form.querySelector("[data-supplier-edit-minimum]")?.value.trim() || "",
    target_order_value: form.querySelector("[data-supplier-edit-target]")?.value.trim() || "",
    average_lead_time_days: form.querySelector("[data-supplier-edit-lead]")?.value.trim() || "",
    order_review_cycle_days: form.querySelector("[data-supplier-edit-cycle]")?.value.trim() || "",
    target_coverage_adjustment_days: form.querySelector("[data-supplier-edit-coverage]")?.value.trim() || "",
    order_difficulty: form.querySelector("[data-supplier-edit-difficulty]")?.value || "auto",
    notes: form.querySelector("[data-supplier-edit-notes]")?.value.trim() || "",
  };
}

function applySupplierProfileResult(result) {
  if (!result?.supplier_id) return;
  const patch = {
    organization_id: result.organization_id,
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
  };
  state.quoteSuppliers = (state.quoteSuppliers || []).map((item) => (
    item.supplier_id === result.supplier_id ? { ...item, ...patch } : item
  ));
  state.suppliers = (state.suppliers || []).map((item) => (
    item.supplier_id === result.supplier_id ? { ...item, ...patch } : item
  ));
  if (state.quoteWorkbench?.supplier?.id === result.supplier_id) {
    state.quoteWorkbench.supplier = {
      ...state.quoteWorkbench.supplier,
      organization_id: result.organization_id,
      name: result.supplier_name,
      contact_name: result.contact_name,
      contact_phone: result.contact_phone,
      contact_email: result.contact_email,
      minimum_order_value: result.minimum_order_value,
      target_order_value: result.target_order_value,
      lead_time_days: result.average_lead_time_days,
      average_lead_time_days: result.average_lead_time_days,
      order_review_cycle_days: result.order_review_cycle_days,
      target_coverage_adjustment_days: result.target_coverage_adjustment_days,
      order_difficulty: result.order_difficulty,
      supplier_notes: result.supplier_notes,
    };
  }
}

async function saveQuoteSupplierProfile(button) {
  const form = button.closest("[data-supplier-edit-form]");
  const row = quoteSupplierById(form?.dataset.supplierId || state.quoteSupplierPreviewId);
  const status = form?.querySelector("[data-quote-supplier-save-state]");
  if (!form || !row) return;
  button.disabled = true;
  if (status) status.textContent = "Salvando";
  try {
    const result = await apiPost("/api/suppliers/profile", supplierProfilePayloadFromDock(form, row));
    applySupplierProfileResult(result);
    if (status) status.textContent = "Salvo";
    renderQuotes({ preserveScroll: true, summaryOnly: true });
    state.quoteSupplierPreviewId = result.supplier_id;
    state.quoteSupplierPopupOpen = true;
    state.quoteSupplierEditingId = "";
    renderQuoteSupplierInspectorState();
    if (Array.isArray(state.suppliers)) renderSuppliers();
    renderNavBadges();
    refreshAfterSave({ replenishment: true, quotes: true, actions: true }, { defer: true, delay: 300, preserveQuoteScroll: true });
  } catch (error) {
    if (status) status.textContent = error.message || "Não foi possível salvar.";
  } finally {
    button.disabled = false;
  }
}

function quoteSupplierFilterControl(key, options, label) {
  const current = quoteSupplierColumnFilterValue(key);
  if (!options.length) {
    return `
      <label class="purchase-filter-search">
        <span>Buscar</span>
        <input type="search" data-quote-supplier-col-filter="${escapeAttr(key)}" value="${escapeAttr(current)}" placeholder="Digite o fornecedor" aria-label="Buscar em ${escapeAttr(label)}" autocomplete="off" />
      </label>
    `;
  }
  const opts = options
    .map(([value, text]) => `
      <button
        class="purchase-filter-option ${current === value ? "active" : ""}"
        type="button"
        data-quote-supplier-filter-option="${escapeAttr(key)}"
        data-filter-value="${escapeAttr(value)}"
        data-filter-text="${escapeAttr(text)}"
        aria-pressed="${current === value ? "true" : "false"}"
      >${escapeHtml(text)}</button>
    `)
    .join("");
  return `
    <label class="purchase-filter-search">
      <span>Buscar</span>
      <input type="search" data-quote-supplier-filter-search="${escapeAttr(key)}" placeholder="Digite para filtrar" aria-label="Buscar em ${escapeAttr(label)}" autocomplete="off" />
    </label>
    <span class="purchase-filter-options" data-quote-supplier-filter-options="${escapeAttr(key)}">${opts}</span>
  `;
}

function closeQuoteSupplierFilterPanels(exceptPanel = null) {
  document.querySelectorAll("#quoteSuppliersTable .purchase-filter-panel").forEach((panel) => {
    if (panel !== exceptPanel) panel.hidden = true;
  });
}

function quoteSupplierHeader(label, sortKey, filterKey, filterOptions = [], extraClass = "") {
  const active = (state.quoteSupplierSort || "supplier") === sortKey;
  const dir = active ? (state.quoteSupplierSortDir || quoteSupplierDefaultSortDir(sortKey)) : quoteSupplierDefaultSortDir(sortKey);
  const ariaSort = !active ? "none" : dir === "asc" ? "ascending" : "descending";
  const marker = active ? (dir === "asc" ? "&#8593;" : "&#8595;") : "&#8597;";
  const sortDirAttr = active ? ` data-sort-dir="${escapeAttr(dir)}"` : "";
  const help = QUOTE_SUPPLIER_HELP[sortKey] || "";
  const helpAttrs = help ? ` data-help="${escapeAttr(help)}"` : "";
  const filtered = filterKey ? Boolean(quoteSupplierColumnFilterValue(filterKey)) : false;
  const filter = filterKey
    ? `
      <span class="purchase-column-filter">
        <button class="purchase-filter-button ${filtered ? "active" : ""}" type="button" data-quote-supplier-filter-menu="${escapeAttr(filterKey)}" aria-label="Filtrar ${escapeAttr(label)}" aria-pressed="${filtered ? "true" : "false"}">
          <i data-lucide="list-filter"></i>
        </button>
        <span class="purchase-filter-panel" hidden>
          <strong>${escapeHtml(label)}</strong>
          ${quoteSupplierFilterControl(filterKey, filterOptions, label)}
          <button type="button" data-quote-supplier-filter-clear="${escapeAttr(filterKey)}">Limpar filtro</button>
        </span>
      </span>
    `
    : "";
  return `
    <span class="purchase-supplier-th ${extraClass} ${filtered ? "filtered" : ""}" role="columnheader" aria-sort="${ariaSort}">
      <button class="purchase-sort-button ${active ? "active" : ""}" type="button" data-quote-supplier-sort="${escapeAttr(sortKey)}" aria-pressed="${active ? "true" : "false"}"${sortDirAttr}${helpAttrs}>
        <span>${escapeHtml(label)}</span>
        <i aria-hidden="true">${marker}</i>
      </button>
      ${filter}
    </span>
  `;
}

function quoteSupplierHeaderCells() {
  return `
    ${quoteSupplierHeader("Fornecedor", "supplier", "supplier")}
    ${quoteSupplierHeader("Pedido mínimo", "minimum_pct", "pct", [["", "Todos"], ["under_65", "< 65%"], ["near", "65-99%"], ["met", ">= 100%"]], "ps-th-order")}
    ${quoteSupplierHeader("Valor sugerido", "value", "value", [["", "Todos"], ["positive", "Com valor"], ["high", "Alto valor"], ["zero", "Sem valor"]])}
    ${quoteSupplierHeader("Sinais", "nexo", "risk", [["", "Todos"], ["rupture", "Ruptura"], ["buy_now", "Reposição"], ["signals", "Sinais"], ["none", "Sem sinais"]])}
    ${quoteSupplierHeader("Ciclo", "cycle", "cycle", [["", "Todos"], ["short", "< 60d"], ["long", ">= 60d"], ["none", "Sem ciclo"]])}
    ${quoteSupplierHeader("Cotação", "open_quote", "open", [["", "Todos"], ["any", "Com cotação/pedido"], ["quote", "Com cotação"], ["order", "Com pedido"], ["none", "Sem aberto"]])}
  `;
}

function quoteSupplierRows(rows) {
  if (!rows.length) {
    return `
      <div class="purchase-supplier-table nexo-quote-data-table" role="table" aria-label="Fornecedores na mesa de compra">
        <div class="purchase-supplier-head" role="row">
          ${quoteSupplierHeaderCells()}
        </div>
        <div class="quote-empty">Nenhum fornecedor aparece com esta busca ou filtro.</div>
      </div>
    `;
  }
  const body = rows
    .map((row) => {
      const active = state.quoteSupplierPopupOpen && row.supplier_id === state.quoteSupplierPreviewId ? "active" : "";
      const minVal = Number(row.minimum_order_value || 0);
      const estVal = Number(row.estimated_value || 0);
      const targetVal = Number(row.target_order_value || 0);
      const missing = Math.max(0, minVal - estVal);
      const pct = minVal > 0 ? (estVal / minVal) * 100 : (estVal > 0 ? 100 : 0);
      const progressPct = Math.min(100, Math.max(0, pct));
      const pctTier = minVal <= 0 ? "none" : pct >= 100 ? "met" : pct >= 65 ? "near" : "low";
      const orderGapLabel = minVal <= 0
        ? "sem mínimo"
        : missing > 0 ? `faltam ${compactMoney(missing)}` : "atingido";
      const openQuoteCount = Number(row.open_quote_count || 0);
      const pendingOrderCount = Number(row.pending_order_count || 0);
      const openQuoteState = supplierOpenQuoteState(row);
      const skus = Number(row.active_skus || 0);
      const cycleDays = Number(row.supplier_days_to_order || 0);
      const leadDays = Number(row.average_lead_time_days || row.lead_time_days || 0);
      const reviewDays = Number(row.order_review_cycle_days || 0);
      const cycleText = cycleDays > 0 ? `${number(cycleDays)}d` : "—";
      const cycleSub = [leadDays > 0 ? `lead ${number(leadDays)}d` : "", reviewDays > 0 ? `rev ${number(reviewDays)}d` : ""].filter(Boolean).join(" · ") || "ciclo calculado";
      const contactLine = row.contact_phone || row.contact_name || "";
      const supplierId = escapeAttr(row.supplier_id);
      const signalToneClass = { good: "ok", muted: "", danger: "danger", warn: "warn", info: "info", ok: "ok" };
      const signals = supplierSignalChips(row).filter((chip) => {
        const label = (chip.label || "").toLowerCase();
        if (label.startsWith("faltam") || label === "mínimo atingido") return false;
        if (label.startsWith("ciclo ")) return false;
        if (label.includes("cotação") || label.includes("pedido aberto")) return false;
        return true;
      });
      const signalsMarkup = signals.length
        ? `<span class="ps-signal-list">${signals.map((chip) => `<span class="ps-signal ${escapeAttr(signalToneClass[chip.tone] ?? "")}">${escapeHtml(chip.label)}</span>`).join("")}</span>`
        : `<em class="ps-quiet">sem sinais</em>`;
      const quoteStatus = openQuoteCount
        ? openQuoteState?.label || "Cotação aberta"
        : pendingOrderCount
          ? "Pedido pendente"
          : "—";
      const quoteSub = openQuoteCount
        ? `${number(openQuoteCount)} aberta${openQuoteCount > 1 ? "s" : ""}`
        : pendingOrderCount
          ? `${number(pendingOrderCount)} pedido${pendingOrderCount > 1 ? "s" : ""}`
          : "sem cotação";
      return `
        <div class="purchase-supplier-row ${active}" role="row" data-supplier-id="${supplierId}">
          <span class="ps-col ps-name">
            <strong>${escapeHtml(row.supplier_name)}</strong>
            <em>${number(skus)} SKUs${contactLine ? ` · ${escapeHtml(contactLine)}` : ""}</em>
          </span>
          <span class="ps-col ps-order" data-tier="${pctTier}">
            <strong class="ps-pct">${minVal > 0 ? `${number(pct)}%` : "—"}</strong>
            <span class="ps-progress" title="${escapeAttr(minVal > 0 ? `${money(estVal)} de ${money(minVal)}` : "mínimo não cadastrado")}" aria-hidden="true"><i style="width:${progressPct}%"></i></span>
            <em>${escapeHtml(orderGapLabel)} · mín ${minVal > 0 ? compactMoney(minVal) : "—"}</em>
          </span>
          <span class="ps-col ps-value">
            <strong>${estVal > 0 ? compactMoney(estVal) : "—"}</strong>
            <em>${targetVal > 0 ? `alvo ${compactMoney(targetVal)}` : "sugerido na janela"}</em>
          </span>
          <span class="ps-col ps-signals">${signalsMarkup}</span>
          <span class="ps-col ps-cycle">
            <strong>${escapeHtml(cycleText)}</strong>
            <em>${escapeHtml(cycleSub)}</em>
          </span>
          <span class="ps-col ps-quote-status">
            <strong>${escapeHtml(quoteStatus)}</strong>
            <em>${escapeHtml(quoteSub)}</em>
          </span>
        </div>
      `;
    })
    .join("");
  return `
    <div class="purchase-supplier-table nexo-quote-data-table" role="table" aria-label="Fornecedores na mesa de compra">
      <div class="purchase-supplier-head" role="row">
        ${quoteSupplierHeaderCells()}
      </div>
      <div class="purchase-supplier-body">${body}</div>
    </div>
  `;
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
  const openOrders = Number(row.pending_order_count || 0);
  const openQuoteState = supplierOpenQuoteState(row);
  const openQuoteValue = Number(row.open_quote_estimated_value || 0);
  const latestQuoteId = row.latest_quote_id || "";
  const activeSkus = Number(row.active_skus || 0);
  const missing = Math.max(0, minimum - total);
  const cycleDays = Number(row.supplier_days_to_order || 0);
  const fillPct = minimum > 0 ? Math.max(0, (total / minimum) * 100) : 0;
  const minimumDeltaValue = minimum <= 0 ? "-" : missing > 0 ? money(missing) : "OK";
  const minimumDeltaLabel = minimum <= 0 ? "Sem mínimo" : missing > 0 ? "Falta para mínimo" : "Mínimo atingido";
  const minimumDeltaTone = minimum <= 0 ? "" : missing > 0 ? "warn" : "good";
  const leadDays = Number(row.average_lead_time_days || row.lead_time_days || 0);
  const reviewCycleDays = Number(row.order_review_cycle_days || 0);
  const difficulty = row.order_difficulty || "auto";
  const reason = openQuoteState?.reason || status.label;
  const recommendation = openQuoteState?.label || status.label;
  const primaryActionLabel = openQuoteState?.actionLabel || "Abrir mesa";
  const progressWidth = Math.min(100, Math.max(0, progress.pct));
  const progressText = minimum > 0 ? `${number(fillPct)}% do mínimo; ${progress.label}` : progress.label;
  const editing = state.quoteSupplierEditingId === row.supplier_id;
  const disabled = editing ? "" : "disabled";
  const topNumbers = [
    ["Valor sugerido", money(total), ""],
    ["Pedido mínimo", minimum > 0 ? money(minimum) : "-", ""],
    [minimumDeltaLabel, minimumDeltaValue, minimumDeltaTone],
  ];
  const operationalFacts = [
    ["Ciclo", cycleDays > 0 ? `${number(cycleDays)}d` : "-", QUOTE_SUPPLIER_HELP.cycle],
    ["Lead time", leadDays > 0 ? `${number(leadDays)}d` : "-"],
    ["Revisão", reviewCycleDays > 0 ? `${number(reviewCycleDays)}d` : "-"],
    ["SKUs ativos", number(activeSkus)],
    ["Rupturas", number(urgent)],
    ["Alertas", number(alerts)],
    ["Reposição", number(buyNow)],
    ["Aberto", openQuotes || openOrders ? `${number(openQuotes)} cot. / ${number(openOrders)} ped.` : "-"],
    ["Valor aberto", openQuoteValue > 0 ? money(openQuoteValue) : "-"],
    ["Dificuldade", supplierDifficultyLabel(difficulty)],
  ];
  const contactItems = [
    row.contact_name || "",
    row.contact_phone || "",
    row.contact_email || "",
  ].filter(Boolean);
  return `
    <div class="quote-supplier-inspector-head qrank-${escapeAttr(status.rank)} purchase-reading-head">
      <button class="quote-supplier-close" type="button" data-quote-supplier-close aria-label="Fechar detalhe">&times;</button>
      <span>Fornecedor</span>
      <h3>${escapeHtml(row.supplier_name || "Fornecedor")}</h3>
      <p class="quote-supplier-contactline">${contactItems.length ? escapeHtml(contactItems.join(" | ")) : "Sem contato cadastrado."}</p>
    </div>
    <section class="quote-supplier-snapshot">
      <div class="quote-supplier-reading">
        <span>Leitura</span>
        <strong>${escapeHtml(recommendation)}</strong>
        <em>${escapeHtml(reason)}</em>
      </div>
      <div class="quote-supplier-progress" title="${escapeAttr(progressText)}">
        <div class="qsc-bar" role="meter" aria-label="${escapeAttr(progressText)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progressWidth)}" aria-valuetext="${escapeAttr(progressText)}"><span style="width:${progressWidth}%"></span></div>
      </div>
      <div class="quote-supplier-topnums">
        ${topNumbers.map(([label, value, tone]) => `<div class="${escapeAttr(tone || "")}"><strong>${escapeHtml(value)}</strong><em>${escapeHtml(label)}</em></div>`).join("")}
      </div>
    </section>
    <section class="quote-supplier-profile-card ${editing ? "editing" : ""}" data-supplier-edit-form data-supplier-id="${escapeAttr(row.supplier_id)}" data-organization-id="${escapeAttr(row.organization_id || "")}" data-supplier-name="${escapeAttr(row.supplier_name || "")}">
      <div class="quote-supplier-profile-head">
        <div>
          <strong>Cadastro</strong>
        </div>
        <div class="quote-supplier-profile-actions">
          <button class="secondary-button compact" type="button" data-quote-supplier-edit-toggle="${escapeAttr(row.supplier_id)}">${editing ? "Cancelar edicao" : "Editar dados"}</button>
          <button class="action-button compact" type="button" data-quote-supplier-save ${editing ? "" : "disabled"}>Salvar</button>
          <span class="save-state" data-quote-supplier-save-state aria-live="polite"></span>
        </div>
      </div>
      <div class="quote-supplier-edit-grid">
        <label><span>Pedido mínimo</span><input class="inline-input" inputmode="decimal" data-supplier-edit-minimum value="${inputValue(minimum || "")}" ${disabled} /></label>
        <label><span>Pedido alvo</span><input class="inline-input" inputmode="decimal" data-supplier-edit-target value="${inputValue(row.target_order_value || "")}" ${disabled} /></label>
        <label><span>Contato</span><input class="inline-input" data-supplier-edit-contact-name value="${inputValue(row.contact_name || "")}" ${disabled} /></label>
        <label><span>Telefone</span><input class="inline-input" data-supplier-edit-phone value="${inputValue(row.contact_phone || "")}" ${disabled} /></label>
        <label class="wide"><span>E-mail</span><input class="inline-input" data-supplier-edit-email value="${inputValue(row.contact_email || "")}" ${disabled} /></label>
        <label><span>Lead time</span><input class="inline-input" inputmode="numeric" data-supplier-edit-lead value="${inputValue(leadDays || "")}" ${disabled} /></label>
        <label><span>Ciclo revisão</span><input class="inline-input" inputmode="numeric" data-supplier-edit-cycle value="${inputValue(reviewCycleDays || "")}" ${disabled} /></label>
        <label><span>Ajuste cobertura</span><input class="inline-input" inputmode="numeric" data-supplier-edit-coverage value="${inputValue(row.target_coverage_adjustment_days || "")}" ${disabled} /></label>
        <label><span>Dificuldade</span>
          <select class="inline-input" data-supplier-edit-difficulty ${disabled}>
            <option value="auto" ${difficulty === "auto" ? "selected" : ""}>Automatica</option>
            <option value="easy" ${difficulty === "easy" ? "selected" : ""}>Facil</option>
            <option value="normal" ${difficulty === "normal" ? "selected" : ""}>Normal</option>
            <option value="hard" ${difficulty === "hard" ? "selected" : ""}>Dificil</option>
            <option value="unknown" ${difficulty === "unknown" ? "selected" : ""}>Desconhecida</option>
          </select>
        </label>
        <label class="wide"><span>Observacoes</span><textarea class="inline-input quick-note" rows="3" data-supplier-edit-notes ${disabled}>${escapeHtml(row.supplier_notes || "")}</textarea></label>
      </div>
    </section>
    <section class="quote-supplier-side">
      <dl class="quote-supplier-facts">
        ${operationalFacts.map(([label, value, help]) => `<div><dt${help ? ` data-help="${escapeAttr(help)}" tabindex="0"` : ""}>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl>
      <div class="quote-supplier-actions">
        ${latestQuoteId ? `<button class="secondary-button" type="button" data-quote-discard="${escapeAttr(latestQuoteId)}" data-quote-discard-supplier="${escapeAttr(row.supplier_id)}">Descartar cotação</button>` : ""}
        <button class="action-button" type="button" data-quote-supplier-action="${escapeAttr(row.supplier_id)}">${escapeHtml(primaryActionLabel)}</button>
        <span class="save-state quote-discard-state" data-quote-discard-state aria-live="polite"></span>
      </div>
    </section>
  `;
}
