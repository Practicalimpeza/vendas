let customersTable = null;

function customerColumns() {
  return [
    {
      id: "name",
      label: "Cliente",
      type: "text",
      value: (row) => row.name || "",
      render: (row) => `<strong class="product-name">${escapeHtml(row.name || "")}</strong><span class="row-edit-hint">Clique para ver mix de produtos</span>`,
    },
    { id: "purchases", label: "Compras", type: "number", align: "num", value: (row) => Number(row.purchases || 0) },
    { id: "last_purchase", label: "Última compra", type: "date", value: (row) => row.last_purchase || "" },
    { id: "revenue", label: "Receita", type: "money", align: "num", value: (row) => Number(row.revenue || 0) },
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
    onRowClick: (row) => openCustomerMix(row.id),
    emptyTitle: "Nenhum cliente no período",
    emptyHint: "Aumente o recorte ou confira a importação de vendas.",
    initialSort: [{ id: "revenue", dir: "desc" }],
    rowActions: [{ id: "mix", label: "Ver mix", icon: "layers", title: "Mix de produtos do cliente", onClick: (row) => openCustomerMix(row.id) }],
  });
  return customersTable;
}

function customerMixRows(products = []) {
  if (!products.length) {
    return `<tr><td colspan="7"><strong>Sem produtos no mix</strong><span class="muted-line">Este cliente pode ter apenas serviços ou vendas fora do recorte.</span></td></tr>`;
  }
  return products.map((row, index) => `
    <tr>
      <td class="num">${number(index + 1)}</td>
      <td>
        <strong>${escapeHtml(row.name || "")}</strong>
        <span class="muted-line">${escapeHtml(row.source_code || row.product_id || "")}</span>
      </td>
      <td><span class="status-chip ${row.mix_role === "principal" ? "good" : "neutral"}">${row.mix_role === "principal" ? "Principal" : "Complementar"}</span></td>
      <td class="num">${number(row.quantity)}</td>
      <td class="num">${money(row.revenue)}</td>
      <td class="num">${number(row.share)}%</td>
      <td class="num">${money(row.avg_unit_price)}</td>
    </tr>
  `).join("");
}

function customerMixDetailHtml(payload = {}) {
  const summary = payload.summary || {};
  const products = payload.products || [];
  return `
    <article class="customer-mix-card">
      <header class="customer-mix-head">
        <div>
          <span>Mix principal do cliente</span>
          <strong>${escapeHtml(payload.customer?.name || "Cliente")}</strong>
          <p>${escapeHtml(payload.contract_hint || "Use o histórico para entender o mix.")}</p>
        </div>
      </header>
      <div class="customer-mix-kpis">
        <div><span>Produtos</span><strong>${number(summary.products)}</strong></div>
        <div><span>Receita produtos</span><strong>${money(summary.revenue)}</strong></div>
        <div><span>Mix principal</span><strong>${number(summary.core_share)}%</strong></div>
        <div><span>Dias com compra</span><strong>${number(summary.purchase_days)}</strong></div>
      </div>
      <div class="customer-contract-hint">
        <strong>Próxima etapa comercial</strong>
        <span>Use os itens principais como base para uma tabela personalizada: produto, preço combinado, validade do preço e janela de revisão.</span>
      </div>
      <div class="table-wrap customer-mix-table">
        <table>
          <thead>
            <tr>
              <th class="num">#</th>
              <th>Produto</th>
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
    </article>
  `;
}

function renderCustomerMixDetail(payload = null) {
  if (!payload) return;
  const body = document.querySelector("#modalBody");
  if (body) body.innerHTML = customerMixDetailHtml(payload);
}

async function openCustomerMix(customerId) {
  if (!customerId) return;
  state.selectedCustomerId = customerId;
  customersTable?.refresh();
  openModal(
    "Mix de produtos do cliente",
    `<article class="customer-mix-card loading-card">Carregando mix de produtos...</article>`,
    null,
    { modalClass: "customer-mix-modal" },
  );
  try {
    const query = new URLSearchParams({ id: customerId, period_days: state.periodDays || "180" });
    renderCustomerMixDetail(await api(`/api/customer/mix?${query.toString()}`));
  } catch (error) {
    const body = document.querySelector("#modalBody");
    if (body) body.innerHTML = `<article class="customer-mix-card danger">Não foi possível carregar o mix do cliente.</article>`;
  }
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
