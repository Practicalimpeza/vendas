function renderCommercialSummary(summary = {}) {
  const items = [
    ["Clientes lidos", number(summary.customers), "blue"],
    ["Em risco", number(summary.at_risk_customers), "amber"],
    ["Receita em risco", compactMoney(summary.at_risk_revenue), "amber"],
    ["Recompra prox.", number(summary.due_customers), "green"],
    ["Potencial prox.", compactMoney(summary.due_revenue), "green"],
    ["Produtos subindo", number(summary.growth_products), "blue"],
    ["Produtos caindo", number(summary.drop_products), ""],
    ["Base até", summary.last_sale_date || "", ""],
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
    { label: "Recompra provável", value: dueCustomers },
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
          <p>Valor histórico dos clientes que pedem contato.</p>
        </div>
      </article>
    `,
    `
      <article class="commercial-dashboard-card">
        <div>
          <span>Potencial próximo</span>
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
        <header><span>Recuperação</span><strong>Clientes em risco</strong></header>
        <div class="commercial-chart">${commercialChartRows(topRiskRows.length ? topRiskRows : [{ label: "Sem risco relevante", value: 1 }], topRiskRows.length ? compactMoney : number)}</div>
      </article>
    `,
    `
      <article class="commercial-chart-card">
        <header><span>Recompra</span><strong>Clientes para contato</strong></header>
        <div class="commercial-chart">${commercialChartRows(topDueRows.length ? topDueRows : [{ label: "Sem recompra próxima", value: 1 }], topDueRows.length ? compactMoney : number)}</div>
      </article>
    `,
    `
      <article class="commercial-chart-card">
        <header><span>Mix</span><strong>Produtos em movimento</strong></header>
        <div class="commercial-chart">${commercialChartRows(productRows.length ? productRows : [{ label: "Sem variação forte", value: 1 }], productRows.length ? compactMoney : number)}</div>
      </article>
    `,
    `
      <article class="commercial-chart-card">
        <header><span>Marca</span><strong>Marcas em movimento</strong></header>
        <div class="commercial-chart">${commercialChartRows(brandRows.length ? brandRows : [{ label: "Sem variação forte", value: 1 }], brandRows.length ? compactMoney : number)}</div>
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
      title: topRisk ? `Recuperar ${topRisk.name}` : "Sem recuperação crítica",
      body: topRisk
        ? `${money(topRisk.revenue)} em histórico e ${number(topRisk.days_since)} dias sem compra. Prioridade boa para contato individual.`
        : "A base atual não destacou cliente relevante fora da cadência.",
    },
    {
      title: topDue ? `Puxar recompra de ${topDue.name}` : "Sem recompra imédiata",
      body: topDue
        ? `${money(topDue.revenue)} de potencial histórico perto da janela normal de compra.`
        : `Quando clientes entrarem na janela esperada, o ${appName()} destaca aqui.`,
    },
    {
      title: fallingProduct ? `Investigar ${fallingProduct.name}` : "Mix sem queda crítica",
      body: fallingProduct
        ? `${money(fallingProduct.delta_revenue)} de variação contra a janela anterior. Pode ser ruptura, preço, substituição ou demanda.`
        : `${number(summary.growth_products || 0)} produto(s) em alta e ${number(summary.drop_products || 0)} em queda no recorte.`,
    },
  ]);
}

function customerOpportunityRows(rows, mode) {
  if (!rows.length) {
    const text = mode === "risk" ? "Nenhum cliente relevante fora da cadência." : "Nenhuma recompra próxima detectada agora.";
    return `<tr><td colspan="6"><strong>${text}</strong><span class="muted-line">A próxima importação pode mudar esse quadro.</span></td></tr>`;
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
              <span class="muted-line">última compra ${escapeHtml(row.last_purchase || "")} - ${number(row.purchase_days)} dias com compra</span>
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
            <span class="muted-line">última compra ${escapeHtml(row.last_purchase || "")} - intervalo esperado ${number(row.expected_gap_days)}d</span>
          </td>
          <td><span class="status-chip ${escapeAttr(row.status)}">${escapeHtml(row.status_label)}</span></td>
          <td class="num ${Number(row.risk_score || 0) >= 70 ? "risk" : ""}">${number(row.risk_score)}</td>
          <td class="num">${money(row.revenue)}</td>
          <td class="num">${number(row.days_since)}</td>
          <td>
            ${escapeHtml(row.reason)}
            <span class="muted-line">próxima compra estimada: ${escapeHtml(row.estimated_next_purchase || "")}</span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function momentumRows(rows, kind) {
  if (!rows.length) {
    return `<tr><td colspan="4"><strong>Sem movimento suficiente</strong><span class="muted-line">Ainda não há comparação relevante.</span></td></tr>`;
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
      title: "Contato de recompra provável",
      body: `${number(summary.due_customers)} clientes estão perto da janela normal de recompra.`,
      impact: "Ação simples que pode virar rotina semanal.",
    },
    {
      title: "Investigar queda de produto",
      body: `${number(summary.drop_products)} produtos aparecem com queda forte entre janelas de 90 dias.`,
      impact: "Pode revelar ruptura, substituição, preço ou perda de demanda.",
    },
  ];
  document.querySelector("#commercialFocus").innerHTML = `
    <div class="focus-actions commercial-actions">
      ${focus
        .map(
          (item) => `
            <article>
              <small>ação possível</small>
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


