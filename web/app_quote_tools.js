function statusText(status) {
  return {
    draft: "Cotação em rascunho",
    sent: "Aguardando aprovação",
    responded: "Resposta registrada",
    approved: "Virou pedido",
    cancelled: "Cancelada",
  }[status] || status;
}

function availabilityText(value) {
  return {
    available: "Disponível",
    partial: "Parcial",
    unavailable: "Indisponivel",
    no_quote: "Sem cotação",
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
    return { decision: "drop", label: "Descontinuar", title: "Marcar como descontinuado e remover da cotação" };
  }
  return {
    decision: row.mix_status === "drop" ? "clear" : "force_buy",
    label: "Reativar",
    title: "Voltar a permitir compra deste produto",
  };
}

function setQuoteMode(mode) {
  setModuleMode({
    stateKey: "quoteMode",
    modeAttr: "data-quote-mode",
    panels: {
      operational: "#quoteOperational",
      dashboard: "#quoteDashboard",
      formula: "#quoteFormula",
    },
  }, mode);
  if (state.quoteMode === "formula") renderQuoteFormula();
}

function updateQuoteSupplierChips() {
  const active = activeQuoteSupplierLenses();
  const counts = quoteSupplierLensCounts();
  const labels = quoteSupplierLensDefinitions().reduce((acc, lens) => {
    acc[lens.key] = lens.label;
    return acc;
  }, { high_value: "Alto valor" });
  document.querySelectorAll("#quoteSupplierChips .quote-chip").forEach((btn) => {
    const lens = btn.dataset.lens || btn.dataset.chip || "all";
    btn.innerHTML = `<span>${escapeHtml(labels[lens] || lens)}</span><em>${number(counts[lens] || 0)}</em>`;
    btn.classList.toggle("active", active.includes(lens));
    btn.hidden = lens !== "all" && Number(counts[lens] || 0) <= 0;
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
  const groupSelect = document.querySelector("#quoteWorkbenchGroup");
  if (groupSelect) groupSelect.value = state.quoteWorkbenchGroup || "flat";
  const onlySelect = document.querySelector("#quoteWorkbenchOnly");
  if (onlySelect) onlySelect.value = state.quoteWorkbenchOnly || "all";
  document.querySelectorAll("#quoteDetail .qf-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.filter === filter);
  });
  updateQuoteSortHeaders();
  updateQuoteLiveSummary();
  if (typeof updateQuoteOrderDock === "function") updateQuoteOrderDock();
  if (typeof updateQuoteFilterPills === "function") updateQuoteFilterPills();
}

function setQuoteWorkbenchGroup(group) {
  state.quoteWorkbenchGroup = group === "signals" ? "signals" : "flat";
  applyWorkbenchView();
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
  } else if (btn.classList.contains("qrow-quick")) {
    const quick = btn.dataset.quick || "";
    if (quick === "suggested") next = suggested;
    else if (quick === "one-package") next = Math.max(pkg || 1, 1);
    else if (quick === "zero") next = 0;
  }
  input.value = next > 0 ? String(next).replace(".", ",") : "";
  const check = row.querySelector(".qrow-check");
  if (check) check.checked = next > 0;
  row.classList.toggle("included", next > 0);
  scheduleWorkbenchQuantitySave(input);
  setTimeout(renderQuoteFinal, 300);
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
  if (document.querySelector("#modalOverlay")?.hidden) return;
  renderQuoteProductModal(body, row, detail, productId);
}

function renderQuoteProductModal(body, row, detail, productId) {
  const settings = detail.settings || {};
  const sales = detail.sales_summary || {};
  const decisions = detail.recent_decisions || [];
  const identifiers = visibleProductIdentifiers(detail.identifiers || []);
  const monthlySales = Array.isArray(detail.monthly_sales) ? detail.monthly_sales : [];
  const reason = quoteReason(row);
  const initialPackageSize = Number(row.purchase_package_size || row.package_size || settings.package_size || 1) || 1;
  const initialPurchaseUnit = String(row.purchase_unit || row.unit || "UN").toUpperCase();
  const packageUnitOptions = [
    ["UN", "Avulso"],
    ["CX", "Caixa"],
    ["FD", "Fardo"],
    ["SC", "Saco"],
  ];

  const getRowEl = () => document.querySelector(`#quoteDetail [data-product-id="${CSS.escape(productId)}"]`);

  body.innerHTML = `
    <div class="qpm" data-product-id="${escapeAttr(productId)}">
      ${detail.load_error ? `<div class="modal-preview warn">${escapeHtml(detail.load_error)}</div>` : ""}
      <header class="qpm-header">
        <div class="qpm-identity">
          <span class="qpm-status status-chip ${reason.cls || "ok"}">${escapeHtml(reason.label || row.status_label || "Em análise")}</span>
          <strong class="qpm-name">${escapeHtml(row.name || detail.name || "Item")}</strong>
          <em class="qpm-meta"></em>
        </div>
        <div class="qpm-kpis"></div>
      </header>

      <section class="qpm-decision">
        <div class="qpm-decision-main">
          <div class="qpm-decision-row">
            <label class="qpm-field qpm-field-qty">
              <span>Quantidade</span>
              <div class="qpm-stepper">
                <button class="qpm-step" type="button" data-step="unit" data-dir="-1" title="-1 un">?</button>
                <input class="inline-input qpm-qty" type="text" inputmode="decimal" aria-label="Quantidade marcada" />
                <button class="qpm-step" type="button" data-step="unit" data-dir="1" title="+1 un">+</button>
              </div>
              <div class="qpm-stepper-box">
                <button class="qpm-step-box" type="button" data-dir="-1">?1 cx</button>
                <button class="qpm-step-box" type="button" data-dir="1">+1 cx</button>
              </div>
            </label>
          </div>
          <div class="qpm-shortcuts qpm-decision-actions">
            <button class="action-button qpm-use-suggested" type="button">Usar sugestão</button>
            <button class="secondary-button qpm-zero" type="button">Zerar</button>
          </div>
        </div>
        <aside class="qpm-decision-package">
          <span class="qpm-package-label">Embalagem de compra</span>
          <div class="qpm-package-type" role="group" aria-label="Tipo de embalagem">
            ${packageUnitOptions.map(([unit, label]) => `
              <button class="qpm-package-unit" type="button" data-package-unit="${unit}">${escapeHtml(label)}</button>
            `).join("")}
          </div>
          <label class="qpm-package-amount">
            <span>Unidades por embalagem</span>
            <input class="inline-input qpm-package-input" type="text" inputmode="decimal" aria-label="Unidades por embalagem" />
          </label>
          <em class="qpm-package-summary"></em>
        </aside>
      </section>

      <nav class="qpm-tabs" role="tablist">
        <button class="qpm-tab active" type="button" role="tab" data-tab="demand" aria-selected="true">Demanda &amp; vendas</button>
        <button class="qpm-tab" type="button" role="tab" data-tab="price" aria-selected="false">Preço &amp; custo</button>
        <button class="qpm-tab" type="button" role="tab" data-tab="stock" aria-selected="false">Estoque &amp; reposição</button>
        <button class="qpm-tab" type="button" role="tab" data-tab="supplier" aria-selected="false">Fornecedor &amp; códigos</button>
        <button class="qpm-tab" type="button" role="tab" data-tab="ops" aria-selected="false">Operação</button>
        <button class="qpm-tab" type="button" role="tab" data-tab="notes" aria-selected="false">Notas &amp; memória</button>
      </nav>

      <section class="qpm-panels">
        <div class="qpm-panel active" role="tabpanel" data-tab-panel="demand">
          <div class="qpm-spark-wrap">
            <header>
              <h4>Vendas por mês</h4>
              <span>${monthlySales.length ? `${monthlySales.length} meses` : "Sem histórico"}</span>
            </header>
            <div class="qpm-spark" id="qpmSpark"></div>
          </div>
          <dl class="qpm-dl">
            <dt>30 / 90 / 180d</dt><dd>${number(row.demand_30 || 0)} / ${number(row.demand_90 || 0)} / ${number(row.demand_180 || 0)} un</dd>
            <dt>Venda total</dt><dd>${number(row.demand_total || sales.quantity || 0)} un</dd>
            <dt>Maior venda unica</dt><dd>${number(row.max_single_sale || sales.max_single_sale || 0)} un</dd>
            <dt>Média diária</dt><dd>${number(row.avg_daily_window || 0)} janela / ${number(row.forecast_daily_demand || 0)} projetada</dd>
            <dt>Última venda</dt><dd>${escapeHtml(sales.last_sale_at || "-")}</dd>
            <dt>Dias com venda</dt><dd>${number(sales.sale_days || 0)}</dd>
          </dl>
        </div>
        <div class="qpm-panel" role="tabpanel" data-tab-panel="price" hidden>
          <dl class="qpm-dl">
            <dt>Preço de venda ERP</dt><dd>${money(row.sale_price || detail.sale_price || 0)}</dd>
            <dt>Custo s/ imposto</dt><dd>${money(row.cost_no_tax || 0)}</dd>
            <dt>Custo c/ imposto</dt><dd>${money(row.cost_with_tax || detail.total_cost || 0)}</dd>
            <dt>Ultimo custo</dt><dd>${money(row.cost_no_tax || detail.total_cost || 0)}</dd>
            <dt>Margem bruta</dt><dd class="qpm-margin"></dd>
            <dt>Classe ABC</dt><dd>${escapeHtml(row.abc_class || "C")}</dd>
          </dl>
        </div>
        <div class="qpm-panel" role="tabpanel" data-tab-panel="stock" hidden>
          <dl class="qpm-dl">
            <dt>Estoque atual</dt><dd>${number(row.stock_units || 0)} ${escapeHtml(row.unit || "UN")}</dd>
            <dt>Qtd. por embalagem</dt><dd>${initialPackageSize > 1 ? `${number(initialPackageSize)} un. por embalagem` : "1 un. (avulso)"}</dd>
            <dt>Cobertura atual</dt><dd>${row.coverage_days === null || row.coverage_days === undefined ? "-" : `${number(row.coverage_days)} dias`}</dd>
            <dt>Horizonte calculado</dt><dd>${row.order_horizon_days ? `${number(row.order_horizon_days)} dias` : "-"}</dd>
            <dt>Ciclo fornecedor</dt><dd>${row.review_cycle_days ? `${number(row.review_cycle_days)} dias` : "-"}${row.package_coverage_days ? `; 1 embalagem cobre ~${number(row.package_coverage_days)}d` : ""}</dd>
            <dt>Estoque máximo</dt><dd>${row.order_up_to ? `${number(row.order_up_to)} un` : "-"}</dd>
            <dt>Ponto de pedido</dt><dd>${row.reorder_point ? `${number(row.reorder_point)} un` : "-"}</dd>
            <dt>Estoque segurança</dt><dd>${row.safety_stock ? `${number(row.safety_stock)} un` : "-"}</dd>
            <dt>Pedidos em aberto</dt><dd>${number(row.open_order_quantity || 0)} un</dd>
          </dl>
        </div>
        <div class="qpm-panel" role="tabpanel" data-tab-panel="supplier" hidden>
          <dl class="qpm-dl">
            <dt>Referência fornecedor</dt><dd>${escapeHtml(row.supplier_reference || detail.supplier_reference || "-")}</dd>
            <dt>Qtd. por embalagem</dt><dd>${initialPackageSize > 1 ? `${number(initialPackageSize)} un. por ${escapeHtml(initialPurchaseUnit === "UN" ? "embalagem" : initialPurchaseUnit)}` : "Compra avulsa"}</dd>
            <dt>Código interno</dt><dd>${escapeHtml(productCode(row.source_code) || "-")}</dd>
            <dt>Código de barras</dt><dd>${escapeHtml(detail.barcode || "-")}</dd>
            <dt>Marca</dt><dd>${escapeHtml(row.brand_name || detail.brand_name || "-")}</dd>
            <dt>Outros códigos</dt><dd>${identifiers.length ? identifiers.map((item) => `${escapeHtml(productIdentifierLabel(item.identifier_type))}: ${escapeHtml(item.identifier_value)}`).join("<br>") : "-"}</dd>
          </dl>
        </div>
        <div class="qpm-panel" role="tabpanel" data-tab-panel="ops" hidden>
          <dl class="qpm-dl">
            <dt>Status</dt><dd><span class="status-chip ${reason.cls || "ok"}">${escapeHtml(row.status_label || row.status || "-")}</span></dd>
            <dt>Mix</dt><dd><span class="mix-pill ${escapeAttr(row.mix_status)}">${escapeHtml(mixStatusText(row.mix_status))}</span></dd>
            <dt>Validade</dt><dd>${Number(settings.expires || 0) ? "Produto com validade" : "Sem validade marcada"}</dd>
            <dt>Peso</dt><dd>${settings.weight ? `${number(settings.weight)} kg` : "-"}</dd>
            <dt>Bloqueio compra</dt><dd>${Number(settings.blocked_for_purchase || 0) ? "Sim" : "Não"}</dd>
            <dt>Observação do produto</dt><dd>${escapeHtml(settings.notes || "-")}</dd>
            <dt>Motivo da sugestão</dt><dd>${escapeHtml(row.reason || reason.tip || "-")}</dd>
          </dl>
        </div>
        <div class="qpm-panel qpm-panel-notes" role="tabpanel" data-tab-panel="notes" hidden>
          <label class="qpm-note-field">
            <span>Observação para este item</span>
            <textarea class="inline-input qpm-note" rows="3" placeholder="Ex.: aceitar substituto, mandar validade longa, confirmar fragrancia..."></textarea>
          </label>
          <div class="qpm-decision-log-wrap">
            <h4>Memória de decisões</h4>
            <div class="qpm-decision-log quote-decision-log">
              ${decisions.length ? decisions.map((item) => `<span><strong>${escapeHtml(item.decision_value || item.decision_type)}</strong>${item.notes ? ` - ${escapeHtml(item.notes)}` : ""}<em>${escapeHtml(item.created_at || "")}</em></span>`).join("") : `<span>Nenhuma decisão operacional registrada para este produto.</span>`}
            </div>
          </div>
        </div>
      </section>

      <footer class="qpm-footer">
        <span class="qpm-state save-state" aria-live="polite"></span>
        <div class="qpm-footer-actions">
          <button class="secondary-button qpm-open-product" type="button">Ficha completa</button>
          <button class="secondary-button qpm-toggle" type="button"></button>
        </div>
      </footer>
    </div>
  `;

  const qpm = body.querySelector(".qpm");
  const qtyInput = qpm.querySelector(".qpm-qty");
  const packageInput = qpm.querySelector(".qpm-package-input");
  const noteInput = qpm.querySelector(".qpm-note");
  const stateEl = qpm.querySelector(".qpm-state");
  let sparkRendered = false;
  let saveSeq = 0;
  let lastError = "";

  const setState = (text, cls = "") => {
    if (!stateEl) return;
    stateEl.textContent = text || "";
    stateEl.classList.remove("ok", "warn", "danger");
    if (cls) stateEl.classList.add(cls);
  };

  const refresh = () => {
    syncQpm();
    const rowEl = getRowEl();
    if (rowEl) {
      syncQuoteRow(rowEl, row);
      updateWorkbenchTotalsFromRows();
    }
  };

  const purchaseUnit = () => String(row.purchase_unit || row.unit || "UN").toUpperCase();
  const packageSize = () => Number(row.purchase_package_size || row.package_size || 1) || 1;
  const currentQty = () => Number(row.quote_quantity || 0);
  const suggestedQty = () => Number(row.suggested_quantity || 0);

  const buildMeta = () => {
    const bits = [];
    const code = productCode(row.source_code);
    if (code) bits.push(`Cod ${code}`);
    if (row.brand_name || detail.brand_name) bits.push(escapeHtml(row.brand_name || detail.brand_name));
    bits.push(`Unidade ${escapeHtml(row.unit || "UN")}`);
    if (row.abc_class) bits.push(`ABC ${escapeHtml(row.abc_class)}`);
    return bits.join(" &middot; ");
  };

  const buildKpis = () => {
    const after = quoteAfterCoverage(row);
    const target = Number(row.order_horizon_receipt_coverage_days || row.order_horizon_days || row.review_cycle_days || 0);
    const qty = currentQty();
    const pkg = packageSize();
    const packageUnitLabel = typeof quotePackageUnitLabel === "function" ? quotePackageUnitLabel(purchaseUnit()) : purchaseUnit().toLowerCase();
    const unitCost = quoteOrderUnitCost(row);
    const total = qty * unitCost;
    const tiles = [
      {
        label: "Estoque",
        value: `${number(row.stock_units || 0)} ${escapeHtml(row.unit || "UN")}`,
        hint: row.coverage_days === null || row.coverage_days === undefined ? "cobertura -" : `cobertura ${number(row.coverage_days)}d`,
      },
      {
        label: "Sugestão",
        value: suggestedQty() > 0 ? `${number(suggestedQty())} un` : "-",
        hint: row.reason ? escapeHtml(row.reason) : reason.tip ? escapeHtml(reason.tip) : "",
      },
      {
        label: "Marcado",
        value: qty > 0 ? `${number(qty)} un` : "-",
        hint: pkg > 1 && qty > 0 ? `${number(Math.ceil(qty / pkg))} ${packageUnitLabel}` : pkg > 1 ? `${packageUnitLabel} ${number(pkg)} un` : "avulso",
      },
      {
        label: "Cobertura depois",
        value: after === null ? "-" : `${number(after)}d`,
        hint: target > 0 ? `horizonte ${number(target)}d` : "calculado",
        cls: after !== null && target > 0 ? (after < target * 0.7 ? "warn" : after > target * 1.3 ? "warn" : "ok") : "",
      },
      {
        label: "Total marcado",
        value: qty > 0 ? money(total) : "-",
        hint: unitCost > 0 ? `${money(unitCost)} un` : "sem custo",
      },
    ];
    return tiles.map((tile) => `
      <div class="qpm-kpi ${tile.cls || ""}">
        <span>${escapeHtml(tile.label)}</span>
        <strong>${tile.value}</strong>
        <em>${tile.hint}</em>
      </div>
    `).join("");
  };

  function syncQpm() {
    qpm.querySelector(".qpm-meta").innerHTML = buildMeta();
    qpm.querySelector(".qpm-kpis").innerHTML = buildKpis();
    qpm.querySelector(".qpm-status").textContent = reason.label || row.status_label || "Em análise";
    qpm.querySelector(".qpm-status").className = `qpm-status status-chip ${quoteReason(row).cls || "ok"}`;

    if (document.activeElement !== qtyInput) qtyInput.value = currentQty() > 0 ? inputValue(currentQty()) : "";
    if (document.activeElement !== packageInput) packageInput.value = inputValue(packageSize());
    if (document.activeElement !== noteInput) noteInput.value = row.quote_notes || "";

    const unit = purchaseUnit();
    qpm.querySelectorAll(".qpm-package-unit").forEach((btn) => {
      const active = btn.dataset.packageUnit === unit;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    packageInput.disabled = unit === "UN";
    qpm.querySelector(".qpm-package-summary").textContent = unit === "UN"
      ? "Compra avulsa"
      : `1 ${unit} = ${number(packageSize())} UN`;

    qpm.querySelectorAll(".qpm-step-box").forEach((btn) => {
      const dir = Number(btn.dataset.dir || 0);
      btn.textContent = `${dir > 0 ? "+" : "?"}1 ${unit === "UN" ? "un" : unit.toLowerCase()}`;
      btn.disabled = unit === "UN";
    });

    const useSug = qpm.querySelector(".qpm-use-suggested");
    if (useSug) useSug.disabled = suggestedQty() <= 0;

    const toggle = qpm.querySelector(".qpm-toggle");
    if (toggle) {
      toggle.textContent = row.in_quote ? "Remover do pedido" : "Adicionar no pedido";
      toggle.classList.toggle("danger", Boolean(row.in_quote));
    }

    const sale = Number(row.sale_price || detail.sale_price || 0);
    const cost = Number(row.cost_with_tax || row.cost_no_tax || detail.total_cost || 0);
    const marginEl = qpm.querySelector(".qpm-margin");
    if (marginEl) {
      if (sale > 0 && cost > 0) {
        const pct = ((sale - cost) / sale) * 100;
        marginEl.textContent = `${number(pct)}% (${money(sale - cost)})`;
        marginEl.classList.toggle("warn", pct < 10);
      } else {
        marginEl.textContent = "-";
      }
    }
  }

  async function commit({ quantity, packageUnit: nextUnit, packageSize: nextPackage, note, statusLabel } = {}) {
    const prev = {
      in_quote: row.in_quote,
      quote_quantity: row.quote_quantity,
      purchase_unit: row.purchase_unit,
      purchase_package_size: row.purchase_package_size,
      package_size: row.package_size,
      quote_coverage_target_days: row.quote_coverage_target_days,
      quote_notes: row.quote_notes,
    };

    const targetQty = quantity === undefined ? currentQty() : Number(quantity);
    if (targetQty < 0) { setState("Qtd. inválida", "warn"); return; }
    if (targetQty > 0 && isDiscontinuedMix(row)) { setState("Produto descontinuado", "warn"); return; }

    const unit = String(nextUnit || purchaseUnit()).toUpperCase();
    const size = unit === "UN" ? 1 : Number(nextPackage === undefined ? packageSize() : nextPackage);
    if (!(size > 0)) { setState("Embalagem inválida", "warn"); return; }

    const noteValue = note === undefined ? (row.quote_notes || "") : String(note || "").trim();

    const packageChanged = Math.abs(Number(prev.purchase_package_size || prev.package_size || 1) - size) > 0.0001
      || String(prev.purchase_unit || row.unit || "UN").toUpperCase() !== unit;

    row.in_quote = targetQty > 0;
    row.quote_quantity = targetQty;
    row.purchase_unit = unit;
    row.purchase_package_size = size;
    row.package_size = size;
    row.quote_notes = noteValue;

    refresh();
    const seq = ++saveSeq;
    setState(statusLabel || "Salvando...");

    try {
      if (packageChanged) await saveProductPurchaseSettings(row, { packageSize: size });
      const result = await apiPost("/api/quote-item/upsert", {
        organization_id: row.organization_id,
        supplier_id: state.selectedQuoteSupplierId,
        product_id: row.product_id,
        requested_quantity: targetQty,
        purchase_unit: unit,
        purchase_package_size: size,
        coverage_target_days: row.quote_coverage_target_days || null,
        notes: noteValue,
      });
      if (state.quoteWorkbench && !state.quoteWorkbench.current_quote && result?.current_quote_id) {
        state.quoteWorkbench.current_quote = { id: result.current_quote_id, status: "draft" };
      }
      if (state.quoteWorkbench?.current_quote && !result?.current_quote_id && result?.item_count === 0) {
        state.quoteWorkbench.current_quote = null;
      }
      if (seq === saveSeq) {
        lastError = "";
        setState("Salvo", "ok");
        refresh();
        refreshAfterSave(
          { replenishment: packageChanged, quotes: packageChanged, actions: true, maturity: true },
          { coalesce: true, delay: 900, preserveQuoteScroll: packageChanged },
        );
      }
    } catch (error) {
      Object.assign(row, prev);
      refresh();
      lastError = error.message;
      setState(error.message, "danger");
    }
  }

  let qtyTimer = null;
  let packageTimer = null;
  let noteTimer = null;

  qtyInput.addEventListener("input", () => {
    clearTimeout(qtyTimer);
    const value = parseInputNumber(qtyInput.value || "0");
    qtyTimer = setTimeout(() => commit({ quantity: value }), 350);
  });
  qtyInput.addEventListener("blur", () => {
    clearTimeout(qtyTimer);
    commit({ quantity: parseInputNumber(qtyInput.value || "0") });
  });

  packageInput.addEventListener("input", () => {
    clearTimeout(packageTimer);
    const value = parseInputNumber(packageInput.value || "0");
    qpm.querySelector(".qpm-package-summary").textContent = purchaseUnit() === "UN"
      ? "Compra avulsa"
      : `1 ${purchaseUnit()} = ${number(value || 0)} UN`;
    packageTimer = setTimeout(() => commit({ packageSize: value }), 500);
  });

  noteInput.addEventListener("input", () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => commit({ note: noteInput.value }), 600);
  });

  qpm.querySelectorAll(".qpm-step").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = Number(btn.dataset.dir || 0);
      commit({ quantity: Math.max(0, currentQty() + dir) });
    });
  });

  qpm.querySelectorAll(".qpm-step-box").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = Number(btn.dataset.dir || 0);
      const size = packageSize();
      commit({ quantity: Math.max(0, currentQty() + dir * size) });
    });
  });

  qpm.querySelector(".qpm-use-suggested").addEventListener("click", () => {
    if (suggestedQty() > 0) commit({ quantity: suggestedQty(), statusLabel: "Aplicando sugestão..." });
  });
  qpm.querySelector(".qpm-zero").addEventListener("click", () => commit({ quantity: 0, statusLabel: "Zerando..." }));

  qpm.querySelectorAll(".qpm-package-unit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextUnit = String(btn.dataset.packageUnit || "UN").toUpperCase();
      if (nextUnit === purchaseUnit()) return;
      const nextSize = nextUnit === "UN" ? 1 : (packageSize() > 1 ? packageSize() : parseInputNumber(packageInput.value || "0") || 1);
      commit({ packageUnit: nextUnit, packageSize: nextSize });
    });
  });

  qpm.querySelector(".qpm-toggle").addEventListener("click", () => {
    if (row.in_quote) {
      commit({ quantity: 0, statusLabel: "Removendo..." });
    } else {
      const fallback = suggestedQty() > 0 ? suggestedQty() : packageSize();
      commit({ quantity: fallback, statusLabel: "Adicionando..." });
    }
  });

  qpm.querySelector(".qpm-open-product").addEventListener("click", () => openProductModal(productId));

  qpm.querySelectorAll(".qpm-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.dataset.tab;
      qpm.querySelectorAll(".qpm-tab").forEach((t) => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      qpm.querySelectorAll(".qpm-panel").forEach((p) => {
        const active = p.dataset.tabPanel === id;
        p.classList.toggle("active", active);
        p.hidden = !active;
      });
      if (id === "demand" && !sparkRendered) {
        renderQpmSparkline(qpm.querySelector("#qpmSpark"), monthlySales);
        sparkRendered = true;
      }
    });
  });

  syncQpm();
  if (qpm.querySelector('.qpm-tab[data-tab="demand"].active')) {
    renderQpmSparkline(qpm.querySelector("#qpmSpark"), monthlySales);
    sparkRendered = true;
  }
}

function renderQpmSparkline(target, monthlySales) {
  if (!target) return;
  if (!monthlySales || !monthlySales.length) {
    target.innerHTML = `<div class="qpm-spark-empty">Sem histórico mensal para este produto.</div>`;
    return;
  }
  const labels = monthlySales.map((m) => {
    const [y, mm] = String(m.month || "").split("-");
    if (!mm) return m.month || "";
    return `${mm}/${(y || "").slice(2)}`;
  });
  const values = monthlySales.map((m) => Number(m.quantity || 0));
  const revenues = monthlySales.map((m) => Number(m.revenue || 0));
  if (!window.echarts) {
    const max = Math.max(...values, 1);
    target.innerHTML = `
      <div class="qpm-spark-fallback">
        ${monthlySales.map((m, i) => `
          <div title="${escapeAttr(`${m.month}: ${number(values[i])} un`)}">
            <i style="height:${Math.max(4, (values[i] / max) * 100)}%"></i>
            <span>${escapeHtml(labels[i])}</span>
          </div>
        `).join("")}
      </div>
    `;
    return;
  }
  target.innerHTML = `<div class="echart-surface" id="qpmSparkCanvas"></div>`;
  const chart = echarts.init(document.querySelector("#qpmSparkCanvas"), null, { renderer: "canvas" });
  chart.setOption({
    grid: { left: 8, right: 8, top: 12, bottom: 20, containLabel: false },
    tooltip: {
      trigger: "axis",
      borderWidth: 0,
      padding: 10,
      backgroundColor: "rgba(15, 31, 23, 0.92)",
      textStyle: { color: "#fff", fontSize: 12 },
      extraCssText: "border-radius:10px;",
      formatter: (params) => {
        const p = params[0];
        const i = p.dataIndex;
        return `<strong>${labels[i]}</strong><br/>${number(values[i])} un<br/>${money(revenues[i])}`;
      },
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#647169", fontSize: 10, fontWeight: 700 },
    },
    yAxis: { type: "value", show: false },
    series: [{
      type: "bar",
      data: values,
      barWidth: "62%",
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: "#2f8a64" },
          { offset: 1, color: "#7dd8a3" },
        ]),
        borderRadius: [4, 4, 0, 0],
      },
    }],
  });
  const resize = () => {
    if (!document.body.contains(target)) {
      window.removeEventListener("resize", resize);
      chart.dispose();
      return;
    }
    chart.resize();
  };
  requestAnimationFrame(resize);
  setTimeout(resize, 200);
  window.addEventListener("resize", resize);
}
