

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
    if (row.order_formation_strategy === "wait_or_negotiate") acc.longCycle += 1;
    return acc;
  }, { value: 0, urgent: 0, buyNow: 0, alerts: 0, open: 0, ready: 0, risk: 0, belowMin: 0, noMin: 0, longCycle: 0 });
  const items = [
    ["Fornecedores", number(rows.length), "blue"],
    ["Prontos", number(totals.ready), "green"],
    ["Valor sugerido", compactMoney(totals.value), "green"],
    ["Urgentes", number(totals.urgent), "amber"],
    ["Comprar agora", number(totals.buyNow), ""],
    ["Alertas", number(totals.alerts), "amber"],
    ["Abaixo mínimo", number(totals.belowMin), ""],
    ["Ciclo difícil", number(totals.longCycle), "amber"],
    ["Cotações abertas", number(totals.open), "blue"],
  ];
  document.querySelector("#quoteDashboardSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function quoteDashboardCharts(rows = state.quoteSuppliers || []) {
  const statusItems = [
    { label: "Prontos para cotar", value: rows.filter((row) => supplierWorkbenchStatus(row).rank === "ready").length, chip: "ready" },
    { label: "Risco / urgência", value: rows.filter((row) => supplierWorkbenchStatus(row).rank === "risk").length, chip: "risk" },
    { label: "Abaixo do mínimo", value: rows.filter((row) => supplierWorkbenchStatus(row).rank === "below_min").length, chip: "below_min" },
    { label: "Ciclo difícil", value: rows.filter((row) => row.order_formation_strategy === "wait_or_negotiate").length, chip: "below_min" },
    { label: "Cotação em aberto", value: rows.filter((row) => supplierWorkbenchStatus(row).rank === "open").length, chip: "open" },
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
        <p>${number(readyPct)}% do valor sugerido já atingiu pedido mínimo.</p>
      </div>
      <div class="quote-donut" style="--value: ${Math.max(0, Math.min(100, readyPct))}">
        <span>${number(readyPct)}%</span>
      </div>
    </article>
    <article class="quote-dashboard-card">
      <div>
        <span>Base preparada</span>
        <strong>${number(suppliersWithMinimum)}</strong>
        <p>Fornecedor(es) com mínimo configurado para decidir acumular ou comprar.</p>
      </div>
    </article>
    <article class="quote-chart-card">
      <header><strong>Prioridade por situação</strong><span>Clique para abrir fornecedores filtrados</span></header>
      <div class="quote-chart">${quoteChartRows(statusItems)}</div>
    </article>
    <article class="quote-chart-card">
      <header><strong>Top valor sugerido</strong><span>Onde a compra concentra caixa</span></header>
      <div class="quote-chart">${quoteChartRows(topValue.length ? topValue : [{ label: "Sem valor sugerido", value: 0 }], compactMoney)}</div>
    </article>
    <article class="quote-chart-card">
      <header><strong>Urgência por fornecedor</strong><span>Itens urgentes e comprar agora</span></header>
      <div class="quote-chart">${quoteChartRows(topUrgency.length ? topUrgency : [{ label: "Sem urgência", value: 0 }])}</div>
    </article>
    <article class="quote-dashboard-card wide">
      <div>
        <span>Insight ${escapeHtml(appName())}</span>
        <strong>Separe demanda real de formação de pedido</strong>
        <p>Fornecedor difícil abaixo do mínimo não deve ser inflado no automático: revise urgência, candidatos de formação, acúmulo de demanda e negociação de mínimo.</p>
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


