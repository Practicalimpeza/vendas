// Mesa de compras: ranking, filtros e detalhe flutuante de fornecedores.

const QUOTE_SUPPLIER_HELP = {
  cycle: "Intervalo estimado, em dias, para este fornecedor voltar à mesa de compra. Ciclos longos pedem compras com mais cobertura; ciclos curtos podem ser revistos com mais frequência.",
};

function supplierOpenQuoteState(row) {
  const openQuotes = Number(row.open_quote_count || 0);
  if (!openQuotes) return null;
  const status = row.latest_quote_status || "";
  const count = number(openQuotes);
  if (status === "sent") {
    return {
      label: "Aguardando aprovação",
      shortLabel: `${count} aguard. aprovação`,
      chipLabel: `${count} aguard. aprovação`,
      actionLabel: "Registrar resposta",
      reason: "Cotação enviada ao fornecedor; registre a resposta para gerar o pedido.",
      cls: "info",
      score: 7600,
    };
  }
  if (status === "responded") {
    return {
      label: "Resposta registrada",
      shortLabel: `${count} respondida`,
      chipLabel: `${count} resposta registrada`,
      actionLabel: "Gerar pedido",
      reason: "Resposta do fornecedor já registrada; gere o pedido para revisão.",
      cls: "ok",
      score: 7800,
    };
  }
  return {
    label: "Cotação em rascunho",
    shortLabel: `${count} rascunho`,
    chipLabel: `${count} cotação em rascunho`,
    actionLabel: "Retomar cotação",
    reason: "Cotação ainda não marcada como enviada ao fornecedor.",
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
  const formationLabel = row.order_formation_label || "";
  const formationStrategy = row.order_formation_strategy || "";
  if (openQuoteState) return { label: openQuoteState.label, cls: openQuoteState.cls, score: openQuoteState.score, rank: "open" };
  if (formationStrategy === "wait_or_negotiate") {
    return { label: "Ciclo difícil", cls: "warn", score: 1800 + buyNow * 20 + alerts * 15 + Math.min(500, total / 10), rank: "below_min" };
  }
  if (total <= 0 && urgent + buyNow <= 0) return { label: "Sem compra", cls: "", score: -1000, rank: "none" };
  if (formationRank === "ready") return { label: formationLabel || "Pronto para cotar", cls: "ok", score: 6000 + urgent * 100 + buyNow * 20 + alerts * 10, rank: "ready" };
  if (formationRank === "risk") return { label: formationLabel || "Revisar alertas", cls: "danger", score: 5000 + urgent * 100 + buyNow * 20, rank: "risk" };
  if (formationRank === "no_min") return { label: formationLabel || "Sem mínimo", cls: "warn", score: 3000 + urgent * 100 + buyNow * 20, rank: "no_min" };
  if (formationRank === "below_min") {
    const label = formationStrategy === "wait_or_negotiate" ? "Ciclo difícil" : formationLabel || "Abaixo do mínimo";
    return { label, cls: "warn", score: 2000 + buyNow * 20 + alerts * 15 + Math.min(500, total / 10), rank: "below_min" };
  }
  if (minimum <= 0) return { label: "Sem mínimo", cls: "warn", score: 3000 + urgent * 100 + buyNow * 20, rank: "no_min" };
  if (total >= minimum) return { label: "Pronto para cotar", cls: "ok", score: 6000 + urgent * 100 + buyNow * 20 + alerts * 10, rank: "ready" };
  if (urgent > 0) return { label: "Revisar alertas", cls: "danger", score: 5000 + urgent * 100 + buyNow * 20, rank: "risk" };
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
    { key: "rupture", label: "Ruptura agora", match: (row) => Number(row.urgent_count || 0) > 0 },
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
  if (filters.risk === "rupture" && urgent <= 0) return false;
  if (filters.risk === "signals" && urgent <= 0 && alerts <= 0) return false;
  if (filters.risk === "none" && (urgent > 0 || alerts > 0)) return false;
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
  if (Number(row.out_of_mix_count || 0)) signals.push({ label: "revisar mix", tone: "muted" });
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
    row.order_formation_label,
    row.order_formation_reason,
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
  const sort = document.querySelector("#quoteSupplierSort");
  if (sort && Array.from(sort.options).some((option) => option.value === state.quoteSupplierSort)) {
    sort.value = state.quoteSupplierSort;
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
    if (key === "risk") return byDir(Number(a.urgent_count || 0) - Number(b.urgent_count || 0), Number(b.alert_count || 0) - Number(a.alert_count || 0) || supplierFallback);
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
    { label: "Sugerido", value: money(totalSuggested), detail: "ordenar valor", sort: "value" },
    { label: "Falta p/ mínimos", value: money(missingToMinimum), detail: `${number(nearMinimum)} perto`, lens: "near_minimum" },
    { label: "Ruptura", value: number(rupture), detail: "itens", lens: "rupture" },
    { label: "Ciclo longo", value: number(longCycle), detail: "fornecedores", lens: "long_cycle" },
    { label: "Abertos", value: number(openOrders + openQuotes), detail: `${number(openOrders)} pedidos / ${number(openQuotes)} cotações`, lens: openQuotes ? "open_quote" : "open_order" },
  ];
  return `
    <div class="purchase-overview purchase-overview-numeric">
      <div class="purchase-overview-metrics">
        ${blocks.map((block) => {
          const active = block.sort
            ? (state.quoteSupplierSort || "supplier") === block.sort
            : activeLenses.includes(block.lens || "all");
          return `
          <button class="purchase-overview-card ${active ? "active" : ""}" type="button" ${block.sort ? `data-quote-summary-sort="${escapeAttr(block.sort)}"` : `data-quote-summary-lens="${escapeAttr(block.lens || "all")}"`}>
            <span>${escapeHtml(block.label)}</span>
            <strong>${escapeHtml(block.value)}</strong>
            <em>${escapeHtml(block.detail)}</em>
          </button>
        `;
        }).join("")}
      </div>
    </div>
  `;
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

function quoteSupplierHeader(label, sortKey) {
  const active = (state.quoteSupplierSort || "supplier") === sortKey;
  const dir = active ? (state.quoteSupplierSortDir || quoteSupplierDefaultSortDir(sortKey)) : quoteSupplierDefaultSortDir(sortKey);
  const ariaSort = !active ? "none" : dir === "asc" ? "ascending" : "descending";
  const marker = active ? (dir === "asc" ? "&#8593;" : "&#8595;") : "&#8597;";
  const sortDirAttr = active ? ` data-sort-dir="${escapeAttr(dir)}"` : "";
  const help = QUOTE_SUPPLIER_HELP[sortKey] || "";
  const helpAttrs = help ? ` data-help="${escapeAttr(help)}"` : "";
  return `
    <span role="columnheader" aria-sort="${ariaSort}">
      <button class="purchase-sort-button ${active ? "active" : ""}" type="button" data-quote-supplier-sort="${escapeAttr(sortKey)}" aria-pressed="${active ? "true" : "false"}"${sortDirAttr}${helpAttrs}>
        <span>${escapeHtml(label)}</span>
        <i aria-hidden="true">${marker}</i>
      </button>
    </span>
  `;
}

function quoteSupplierSelectFilter(key, options, label) {
  const current = quoteSupplierColumnFilterValue(key);
  const opts = options
    .map(([value, text]) => `<option value="${escapeAttr(value)}"${current === value ? " selected" : ""}>${escapeHtml(text)}</option>`)
    .join("");
  return `<label class="purchase-column-filter"><span>${escapeHtml(label)}</span><select data-quote-supplier-col-filter="${escapeAttr(key)}">${opts}</select></label>`;
}

function quoteSupplierColumnFiltersRow() {
  return `
    <div class="purchase-supplier-filter-row" role="row" aria-label="Filtros por coluna">
      <label class="purchase-column-filter">
        <span>Fornecedor</span>
        <input data-quote-supplier-col-filter="supplier" type="search" value="${escapeAttr(quoteSupplierColumnFilterValue("supplier"))}" placeholder="nome ou contato" />
      </label>
      ${quoteSupplierSelectFilter("value", [["", "Todos"], ["positive", "Com valor"], ["high", "Alto valor"], ["zero", "Sem sugestão"]], "Sugerido")}
      ${quoteSupplierSelectFilter("minimum", [["", "Todos"], ["configured", "Com mínimo"], ["missing", "Sem mínimo"], ["met", "Mínimo ok"]], "Mínimo")}
      ${quoteSupplierSelectFilter("gap", [["", "Todos"], ["missing", "Falta mínimo"], ["ok", "OK"], ["none", "Sem mínimo"]], "Situação")}
      ${quoteSupplierSelectFilter("pct", [["", "Todos"], ["under_65", "< 65%"], ["near", "65-99%"], ["met", ">= 100%"]], "% mínimo")}
      ${quoteSupplierSelectFilter("cycle", [["", "Todos"], ["short", "< 60d"], ["long", ">= 60d"], ["none", "Sem ciclo"]], "Ciclo")}
      ${quoteSupplierSelectFilter("risk", [["", "Todos"], ["rupture", "Ruptura"], ["signals", "Com sinais"], ["none", "Sem sinal"]], "Ruptura")}
      ${quoteSupplierSelectFilter("open", [["", "Todos"], ["any", "Qualquer"], ["quote", "Cotação"], ["order", "Pedido"], ["none", "Nenhum"]], "Aberto")}
    </div>
  `;
}

function quoteSupplierRows(rows) {
  if (!rows.length) {
    return `
      <div class="purchase-supplier-table nexo-quote-data-table" role="table" aria-label="Fornecedores na mesa de compra">
        <div class="purchase-supplier-head" role="row">
          ${quoteSupplierHeader("Fornecedor", "supplier")}
          ${quoteSupplierHeader("Sugerido", "value")}
          ${quoteSupplierHeader("Mínimo", "minimum")}
          ${quoteSupplierHeader("Mínimo", "minimum_gap")}
          ${quoteSupplierHeader("% mínimo", "minimum_pct")}
          ${quoteSupplierHeader("Ciclo", "cycle")}
          ${quoteSupplierHeader("Ruptura", "risk")}
          ${quoteSupplierHeader("Aberto", "open_quote")}
        </div>
        ${quoteSupplierColumnFiltersRow()}
        <div class="quote-empty">Nenhum fornecedor aparece com esta busca ou filtro.</div>
      </div>
    `;
  }
  const body = rows
    .map((row) => {
      const active = state.quoteSupplierPopupOpen && row.supplier_id === state.quoteSupplierPreviewId ? "active" : "";
      const status = supplierWorkbenchStatus(row);
      const minVal = Number(row.minimum_order_value || 0);
      const estVal = Number(row.estimated_value || 0);
      const pct = minVal > 0 ? (estVal / minVal) * 100 : (estVal > 0 ? 100 : 0);
      const progressPct = Math.min(100, Math.max(0, pct));
      const urgentCount = Number(row.urgent_count || 0);
      const alertCount = Number(row.alert_count || 0);
      const openQuoteCount = Number(row.open_quote_count || 0);
      const pendingOrderCount = Number(row.pending_order_count || 0);
      const openQuoteState = supplierOpenQuoteState(row);
      const skus = Number(row.active_skus || 0);
      const cycleDays = Number(row.supplier_days_to_order || 0);
      const missing = Math.max(0, minVal - estVal);
      const gapValue = minVal <= 0 ? "-" : missing > 0 ? money(missing) : "OK";
      const gapLabel = minVal <= 0 ? "sem mínimo" : missing > 0 ? "falta" : "mínimo ok";
      const cycleText = cycleDays > 0 ? `${number(cycleDays)}d` : "-";
      const openTotal = openQuoteCount + pendingOrderCount;
      const supplierId = escapeAttr(row.supplier_id);
      return `
        <div class="purchase-supplier-row ${active} qrank-${status.rank}" role="row" data-supplier-id="${supplierId}">
          <span class="ps-col ps-name">
            <strong>${escapeHtml(row.supplier_name)}</strong>
            <em>${skus ? `${number(skus)} SKUs ativos` : "Sem SKUs ativos"}</em>
          </span>
          <span class="ps-col ps-money">
            <strong>${money(estVal)}</strong>
            <em>sugerido</em>
          </span>
          <span class="ps-col ps-minimum">
            <strong>${minVal > 0 ? money(minVal) : "-"}</strong>
            <span class="ps-progress" aria-hidden="true"><i style="width:${progressPct}%"></i></span>
          </span>
          <span class="ps-col ps-gap ${missing > 0 ? "warn" : minVal > 0 ? "good" : ""}">
            <strong>${escapeHtml(gapValue)}</strong>
            <em>${escapeHtml(gapLabel)}</em>
          </span>
          <span class="ps-col ps-pct">
            <strong>${minVal > 0 ? `${number(pct)}%` : "-"}</strong>
            <em>do mínimo</em>
          </span>
          <span class="ps-col">
            <strong>${escapeHtml(cycleText)}</strong>
            <em>ciclo</em>
          </span>
          <span class="ps-col ps-risk ${urgentCount ? "danger" : alertCount ? "warn" : ""}">
            <strong>${number(urgentCount)}</strong>
            <em>${alertCount ? `${number(alertCount)} sinais` : "rupturas"}</em>
          </span>
          <span class="ps-col ps-open ${openTotal ? "warn" : ""}">
            <strong>${number(openTotal)}</strong>
            <em>${openQuoteCount ? openQuoteState?.shortLabel || `${number(openQuoteCount)} cotação` : pendingOrderCount ? `${number(pendingOrderCount)} pedido` : "abertos"}</em>
          </span>
        </div>
      `;
    })
    .join("");
  return `
    <div class="purchase-supplier-table nexo-quote-data-table" role="table" aria-label="Fornecedores na mesa de compra">
      <div class="purchase-supplier-head" role="row">
        ${quoteSupplierHeader("Fornecedor", "supplier")}
        ${quoteSupplierHeader("Sugerido", "value")}
        ${quoteSupplierHeader("Mínimo", "minimum")}
        ${quoteSupplierHeader("Mínimo", "minimum_gap")}
        ${quoteSupplierHeader("% mínimo", "minimum_pct")}
        ${quoteSupplierHeader("Ciclo", "cycle")}
        ${quoteSupplierHeader("Ruptura", "risk")}
        ${quoteSupplierHeader("Aberto", "open_quote")}
      </div>
      ${quoteSupplierColumnFiltersRow()}
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
  const reason = openQuoteState?.reason || row.order_formation_reason || status.label;
  const recommendation = openQuoteState?.label || row.order_formation_recommendation || (status.rank === "ready" ? "Cotar agora" : "Revisar fornecedor");
  const primaryActionLabel = openQuoteState?.actionLabel || (status.rank === "open" || openQuotes > 0 ? "Retomar cotação" : "Criar cotação");
  const progressWidth = Math.min(100, Math.max(0, progress.pct));
  const progressText = minimum > 0 ? `${number(fillPct)}% do mínimo; ${progress.label}` : progress.label;
  const editing = state.quoteSupplierEditingId === row.supplier_id;
  const disabled = editing ? "" : "disabled";
  const topNumbers = [
    ["Sugestão de compra", money(total), ""],
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
    ["Compra agora", number(buyNow)],
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

