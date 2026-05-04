const state = {
  products: [],
  stock: [],
  suppliers: [],
  quoteSuppliers: [],
  quoteWorkbench: null,
  selectedQuoteSupplierId: "",
  quoteWindowDays: "90",
  quoteSaveTimers: new Map(),
  quotes: [],
  maturity: null,
  replenishment: null,
  commercial: null,
  actions: null,
  skills: null,
  pricing: null,
  periodDays: "180",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

async function api(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Erro ao carregar ${path}`);
  return response.json();
}

async function apiPost(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Erro ao salvar ${path}`);
  return data;
}

function periodQuery() {
  return state.periodDays === "all" ? "?period_days=all" : `?period_days=${encodeURIComponent(state.periodDays)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function money(value) {
  return brl.format(Number(value || 0));
}

function compactMoney(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000000) return `R$ ${(amount / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (Math.abs(amount) >= 1000) return `R$ ${(amount / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return money(amount);
}

function number(value) {
  return num.format(Number(value || 0));
}

function viewLabel(view) {
  return {
    dashboard: "Painel",
    actions: "Hoje",
    engine: "Motor",
    products: "Produtos",
    stock: "Reposicao",
    suppliers: "Fornecedores",
    quotes: "Cotacoes",
    pricing: "Precos",
    opportunities: "Oportunidades",
    customers: "Clientes",
    services: "Servicos",
    imports: "Importacao",
  }[view] || view;
}

function setView(view) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  document.querySelector("#viewTitle").textContent = viewLabel(view);
}

function renderKpis(kpis) {
  const items = [
    ["Produtos", number(kpis.products), ""],
    ["Clientes", number(kpis.customers), "blue"],
    ["Receita produtos", compactMoney(kpis.product_revenue), "green"],
    ["Receita servicos", compactMoney(kpis.service_revenue), "blue"],
    ["Estoque un.", number(kpis.stock_units), "amber"],
    ["Pendencias", number(kpis.open_tasks), ""],
  ];
  document.querySelector("#kpis").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderCapability(item) {
  return `
    <div class="capability ${escapeAttr(item.status)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.body)}</span>
      ${item.impact ? `<em>${escapeHtml(item.impact)}</em>` : ""}
      ${item.action ? `<button class="text-button" type="button" data-view-target="${escapeAttr(item.view || "")}">${escapeHtml(item.action)}</button>` : ""}
    </div>
  `;
}

function renderMaturity(payload) {
  const metrics = payload.metrics || {};
  const next = payload.next_actions || [];
  const focus = payload.focus || {};
  const progress = Math.max(0, Math.min(Number(payload.score || 0), 100));
  document.querySelector("#maturity").innerHTML = `
    <div class="maturity-body">
      <div class="maturity-score">
        <span>Nivel ${payload.stage?.level || 1}</span>
        <strong>${escapeHtml(payload.stage?.name || "Leitura")}</strong>
        <p>${escapeHtml(payload.stage?.label || "")}</p>
        <div class="maturity-track"><span style="width:${progress}%"></span></div>
        <small>${number(progress)}% da maturidade operacional mapeada</small>
      </div>
      <div class="maturity-metrics">
        <div><span>Ref. fornecedor</span><strong>${number(metrics.reference_pct)}%</strong></div>
        <div><span>Fornec./marca</span><strong>${number(metrics.supplier_pct)}%</strong></div>
        <div><span>Pedido minimo</span><strong>${number(metrics.minimum_pct)}%</strong></div>
        <div><span>Cotaveis</span><strong>${number(metrics.quote_items)}</strong></div>
      </div>
      <div class="focus-panel">
        <div>
          <span>Foco agora</span>
          <strong>${escapeHtml(focus.headline || "Comece pelo que ja da resultado")}</strong>
          <p>${escapeHtml(focus.body || "")}</p>
        </div>
        <div class="focus-actions">
          ${(focus.actions || []).map((item) => `
            <article>
              <small>${escapeHtml(item.scope || "")}</small>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.body)}</span>
              ${item.evidence ? `<em>${escapeHtml(item.evidence)}</em>` : ""}
              <button class="text-button" type="button" data-view-target="${escapeAttr(item.view || "")}">${escapeHtml(item.action || "Abrir")}</button>
            </article>
          `).join("")}
        </div>
      </div>
      <div class="maturity-lanes">
        <section>
          <h3>Desbloqueado</h3>
          ${(payload.unlocked || []).map(renderCapability).join("")}
        </section>
        <section>
          <h3>Melhorou com uso</h3>
          ${(payload.improvements || []).length ? payload.improvements.map(renderCapability).join("") : `<div class="capability muted"><strong>Aguardando uso operacional</strong><span>Gere e acompanhe cotacoes para o Nexo aprender prazos, respostas e compras reais.</span></div>`}
        </section>
        <section>
          <h3>Depois disso</h3>
          ${next.map(renderCapability).join("")}
        </section>
      </div>
    </div>
  `;
  const button = document.querySelector("#maturityNextButton");
  button.dataset.viewTarget = next[0]?.view || "quotes";
  button.textContent = next[0]?.action || "Abrir cotacoes";
}

function renderMissions(payload) {
  const missions = payload.missions || [];
  document.querySelector("#missions").innerHTML = `
    <div class="missions-grid">
      ${missions
        .map(
          (item) => `
            <article class="mission ${escapeAttr(item.status)}">
              <div class="mission-head">
                <span>${escapeHtml(item.effort)}</span>
                <strong>${escapeHtml(item.title)}</strong>
              </div>
              <p>${escapeHtml(item.body)}</p>
              <div class="mission-progress"><span style="width:${Number(item.progress || 0)}%"></span></div>
              <small>${number(item.progress)}% concluido</small>
              <dl>
                <dt>Recompensa</dt>
                <dd>${escapeHtml(item.reward)}</dd>
                <dt>Desbloqueia</dt>
                <dd>${escapeHtml(item.unlocks)}</dd>
              </dl>
              ${item.evidence ? `<em>${escapeHtml(item.evidence)}</em>` : ""}
              <button class="text-button" type="button" data-view-target="${escapeAttr(item.view || "")}">${escapeHtml(item.action)}</button>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMonthly(rows) {
  const max = Math.max(...rows.map((row) => Number(row.product_revenue || 0) + Number(row.service_revenue || 0)), 1);
  document.querySelector("#monthlyChart").innerHTML = rows
    .map((row) => {
      const productWidth = (Number(row.product_revenue || 0) / max) * 100;
      const serviceWidth = (Number(row.service_revenue || 0) / max) * 100;
      return `
        <div class="bar-row">
          <span>${row.month}</span>
          <div class="bar-track">
            <div class="bar-product" style="width:${productWidth}%"></div>
            <div class="bar-service" style="width:${serviceWidth}%"></div>
          </div>
          <strong class="num">${money(Number(row.product_revenue || 0) + Number(row.service_revenue || 0))}</strong>
        </div>
      `;
    })
    .join("");
}

function renderTasks(tasks) {
  document.querySelector("#tasks").innerHTML = tasks
    .map((task) => `<div class="task"><strong>${task.title}</strong><span>${task.status} - prioridade ${task.priority}</span></div>`)
    .join("");
}

function productRows(rows) {
  return rows
    .map(
      (row) => `
      <tr class="clickable-row product-row" data-product-id="${escapeAttr(row.id)}">
        <td>${row.source_code}</td>
        <td>${row.name}</td>
        <td class="num">${number(row.quantity)}</td>
        <td class="num">${money(row.revenue)}</td>
        <td class="num">${number(row.share)}%</td>
      </tr>
    `,
    )
    .join("");
}

function renderReplenishmentSummary(summary) {
  const items = [
    ["Comprar agora", number(summary.buy_now), "green"],
    ["Criticos A", number(summary.critical_a), "amber"],
    ["Decidir mix", number(summary.mix_review), "amber"],
    ["Monitorar", number(summary.watch), "blue"],
    ["Excesso", number(summary.excess), ""],
    ["Unidades sugeridas", number(summary.suggested_units), "green"],
    ["Valor estimado", compactMoney(summary.estimated_value), "blue"],
    ["Fora do mix", number(summary.out_of_current_mix), ""],
  ];
  document.querySelector("#replenishmentSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderCommercialSummary(summary = {}) {
  const items = [
    ["Clientes lidos", number(summary.customers), "blue"],
    ["Em risco", number(summary.at_risk_customers), "amber"],
    ["Receita em risco", compactMoney(summary.at_risk_revenue), "amber"],
    ["Recompra prox.", number(summary.due_customers), "green"],
    ["Potencial prox.", compactMoney(summary.due_revenue), "green"],
    ["Produtos subindo", number(summary.growth_products), "blue"],
    ["Produtos caindo", number(summary.drop_products), ""],
    ["Base ate", summary.last_sale_date || "", ""],
  ];
  document.querySelector("#commercialSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function customerOpportunityRows(rows, mode) {
  if (!rows.length) {
    const text = mode === "risk" ? "Nenhum cliente relevante fora da cadencia." : "Nenhuma recompra proxima detectada agora.";
    return `<tr><td colspan="6"><strong>${text}</strong><span class="muted-line">A proxima importacao pode mudar esse quadro.</span></td></tr>`;
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
              <span class="muted-line">ultima compra ${escapeHtml(row.last_purchase || "")} - ${number(row.purchase_days)} dias com compra</span>
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
            <span class="muted-line">ultima compra ${escapeHtml(row.last_purchase || "")} - intervalo esperado ${number(row.expected_gap_days)}d</span>
          </td>
          <td><span class="status-chip ${escapeAttr(row.status)}">${escapeHtml(row.status_label)}</span></td>
          <td class="num ${Number(row.risk_score || 0) >= 70 ? "risk" : ""}">${number(row.risk_score)}</td>
          <td class="num">${money(row.revenue)}</td>
          <td class="num">${number(row.days_since)}</td>
          <td>
            ${escapeHtml(row.reason)}
            <span class="muted-line">proxima compra estimada: ${escapeHtml(row.estimated_next_purchase || "")}</span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function momentumRows(rows, kind) {
  if (!rows.length) {
    return `<tr><td colspan="4"><strong>Sem movimento suficiente</strong><span class="muted-line">Ainda nao ha comparacao relevante.</span></td></tr>`;
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
  const summary = payload.summary || {};
  renderCommercialSummary(summary);
  const focus = [
    {
      title: "Recuperar 1 cliente em risco",
      body: `${number(summary.at_risk_customers)} clientes passaram do ritmo esperado. Comece por um de maior receita, sem montar campanha grande.`,
      impact: "Primeira prova de valor comercial do BI.",
    },
    {
      title: "Contato de recompra provavel",
      body: `${number(summary.due_customers)} clientes estao perto da janela normal de recompra.`,
      impact: "Acao simples que pode virar rotina semanal.",
    },
    {
      title: "Investigar queda de produto",
      body: `${number(summary.drop_products)} produtos aparecem com queda forte entre janelas de 90 dias.`,
      impact: "Pode revelar ruptura, substituicao, preco ou perda de demanda.",
    },
  ];
  document.querySelector("#commercialFocus").innerHTML = `
    <div class="focus-actions commercial-actions">
      ${focus
        .map(
          (item) => `
            <article>
              <small>acao doable</small>
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

function actionStatusText(status) {
  return {
    open: "Aberta",
    in_progress: "Em andamento",
    completed: "Concluida",
    ignored: "Ignorada",
  }[status] || status;
}

function renderActionsSummary(summary = {}) {
  const items = [
    ["Abertas", number(summary.open), "amber"],
    ["Em andamento", number(summary.in_progress), "blue"],
    ["Concluidas", number(summary.completed), "green"],
    ["Ignoradas", number(summary.ignored), ""],
    ["Valor em pauta", compactMoney(summary.open_estimated_value), "green"],
    ["Total criado", number(summary.total), "blue"],
  ];
  document.querySelector("#actionsSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function actionPrimaryLabel(row) {
  return {
    supplier_config: "Informar pedido minimo",
    supplier_confirm: "Confirmar fornecedor",
    product_mix_decision: "Decidir mix",
    quote_create: "Gerar cotacao",
    quote_send: "Abrir cotacao",
    quote_response: "Registrar resposta",
    quote_close: "Fechar pedido",
    customer_contact: "Abrir cliente",
    product_investigate: "Investigar",
  }[row.action_type] || "Resolver";
}

function actionImpactText(row) {
  const value = Number(row.estimated_value || 0);
  const monetaryActions = new Set(["quote_create", "quote_send", "quote_response", "quote_close", "customer_contact", "product_investigate"]);
  if (value > 0 && monetaryActions.has(row.action_type)) return `${row.impact_label || "Impacto estimado"} - ${money(value)}`;
  return row.impact_label || "Rotina mais clara";
}

function actionCards(rows = []) {
  if (!rows.length) {
    return `<div class="empty-state action-empty">Nada urgente agora. Conforme importacoes, cotacoes e contatos avancarem, novas acoes aparecem aqui.</div>`;
  }
  return rows
    .map(
      (row) => {
        const skillLabel = row.metadata?.skill_label || "";
        return `
        <article class="action-card priority-${Number(row.priority || 3)}" data-action-id="${escapeAttr(row.id)}">
          <div class="action-topline">
            <span class="status-chip ${escapeAttr(row.status)}">${escapeHtml(actionStatusText(row.status))}</span>
            <small>Prioridade ${number(row.priority)}</small>
          </div>
          ${skillLabel ? `<span class="skill-line">${escapeHtml(skillLabel)}</span>` : ""}
          <strong>${escapeHtml(row.title)}</strong>
          <p>${escapeHtml(row.body)}</p>
          <dl>
            <dt>Motivo</dt>
            <dd>${escapeHtml(row.reason)}</dd>
            <dt>Impacto</dt>
            <dd>${escapeHtml(actionImpactText(row))}</dd>
          </dl>
          <div class="action-card-footer">
            <button class="action-button resolve-action" type="button">${escapeHtml(actionPrimaryLabel(row))}</button>
            <button class="secondary-button explain-action" type="button">Detalhes</button>
          </div>
          <span class="save-state" aria-live="polite"></span>
        </article>
      `;
      },
    )
    .join("");
}

function historyCards(rows = []) {
  if (!rows.length) {
    return `<div class="empty-state action-empty">Sem historico ainda. A primeira conclusao ja vira aprendizado de implantacao.</div>`;
  }
  return rows
    .map(
      (row) => `
        <div class="info-card action-history-card">
          <strong>${escapeHtml(row.title)}</strong>
          <span>${escapeHtml(actionStatusText(row.status))} - ${escapeHtml(row.completed_at || row.ignored_at || row.updated_at || "")}</span>
        </div>
      `,
    )
    .join("");
}

function renderActions(payload) {
  renderActionsSummary(payload.summary || {});
  document.querySelector("#actionsBoard").innerHTML = actionCards(payload.actions || []);
  document.querySelector("#actionsHistory").innerHTML = historyCards(payload.history || []);
  if (state.skills) renderEngine(state.skills, payload);
}

async function refreshActions() {
  const actions = await api("/api/actions/today");
  state.actions = actions;
  renderActions(actions);
  renderNavBadges();
}

function refreshAfterSave(tasks = {}) {
  const work = [];
  if (tasks.suppliers) {
    work.push(
      api("/api/suppliers/brands").then((suppliers) => {
        state.suppliers = suppliers;
        renderSuppliers();
      }),
    );
  }
  if (tasks.replenishment) work.push(refreshReplenishment());
  if (tasks.quotes) work.push(refreshQuotes());
  if (tasks.actions) work.push(refreshActions());
  if (tasks.maturity) {
    work.push(
      api("/api/intelligence/maturity").then((maturity) => {
        state.maturity = maturity;
        renderMaturity(maturity);
        renderMissions(maturity);
      }),
    );
  }
  if (!work.length) return;
  Promise.allSettled(work).then(renderNavBadges);
}

function prettyKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function currentActionRows(actionsPayload = state.actions) {
  return [...(actionsPayload?.actions || []), ...(actionsPayload?.history || [])];
}

function actionFromButton(button) {
  const card = button.closest("[data-action-id]");
  if (!card) return null;
  return currentActionRows().find((row) => row.id === card.dataset.actionId) || null;
}

function actionCountBySkill(actionsPayload = state.actions) {
  return currentActionRows(actionsPayload).reduce((acc, row) => {
    const skillId = row.metadata?.skill_id || "sem_skill";
    acc[skillId] = (acc[skillId] || 0) + 1;
    return acc;
  }, {});
}

function actionCountByRule(actionsPayload = state.actions) {
  return currentActionRows(actionsPayload).reduce((acc, row) => {
    const ruleId = row.metadata?.rule_id || "sem_regra";
    acc[ruleId] = (acc[ruleId] || 0) + 1;
    return acc;
  }, {});
}

function renderEngineSummary(skillsPayload = {}, actionsPayload = {}) {
  const actions = actionsPayload.actions || [];
  const rules = skillsPayload.action_rules || [];
  const activeRules = new Set(actions.map((row) => row.metadata?.rule_id).filter(Boolean));
  const items = [
    ["Skills", number((skillsPayload.skills || []).length), "blue"],
    ["Regras", number(rules.length), "green"],
    ["Regras ativas", number(activeRules.size), "amber"],
    ["Acoes atuais", number(actions.length), "green"],
    ["Versao", skillsPayload.schema_version || "", ""],
    ["Produto", skillsPayload.product || "NexoVarejo", "blue"],
  ];
  document.querySelector("#engineSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderTrustLegend() {
  const items = [
    ["ERP/importado", "Canonico externo e read-only no Nexo.", "imported"],
    ["Inferido", "Sugerido pelo Nexo com confianca limitada ate confirmacao.", "inferred"],
    ["Confirmado no Nexo", "Configuracao operacional manual e canonica no Nexo.", "manual"],
    ["Decisao operacional", "Escolha do gestor que nao deve ser sobrescrita pelo ERP.", "decision"],
  ];
  document.querySelector("#trustLegend").innerHTML = items
    .map(
      ([title, body, kind]) => `
        <article class="trust-card ${kind}">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(body)}</span>
        </article>
      `,
    )
    .join("");
}

function renderEngineSkills(skillsPayload = {}, actionsPayload = {}) {
  const counts = actionCountBySkill(actionsPayload);
  document.querySelector("#engineSkills").innerHTML = (skillsPayload.skills || [])
    .map(
      (skill) => `
        <article class="engine-card">
          <div class="engine-card-head">
            <strong>${escapeHtml(skill.name)}</strong>
            <span>v${escapeHtml(skill.version || "")}</span>
          </div>
          <small>${escapeHtml(skill.id)}</small>
          <p>${number(counts[skill.id] || 0)} acao(oes) atuais</p>
          <ul>
            ${(skill.principles || []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
      `,
    )
    .join("");
}

function renderEngineRules(skillsPayload = {}, actionsPayload = {}) {
  const counts = actionCountByRule(actionsPayload);
  const skillNames = Object.fromEntries((skillsPayload.skills || []).map((skill) => [skill.id, skill.name]));
  document.querySelector("#engineRules").innerHTML = (skillsPayload.action_rules || [])
    .map(
      (rule) => `
        <article class="rule-row ${counts[rule.id] ? "active" : ""}">
          <div>
            <strong>${escapeHtml(rule.title)}</strong>
            <span>${escapeHtml(skillNames[rule.skill_id] || prettyKey(rule.skill_id))} - ${escapeHtml(rule.id)} - prioridade ${number(rule.priority)}</span>
          </div>
          <b>${number(counts[rule.id] || 0)}</b>
        </article>
      `,
    )
    .join("");
}

function renderEngine(skillsPayload = state.skills, actionsPayload = state.actions) {
  if (!skillsPayload || !actionsPayload) return;
  renderEngineSummary(skillsPayload, actionsPayload);
  renderTrustLegend();
  renderEngineSkills(skillsPayload, actionsPayload);
  renderEngineRules(skillsPayload, actionsPayload);
}

function whyContent(action) {
  const metadata = action.metadata || {};
  const context = metadata.template_context || {};
  const contextRows = Object.entries(context).filter(([, value]) => value !== null && value !== undefined && String(value) !== "");
  const dataRows = [
    ["Motor", metadata.skill_label || prettyKey(metadata.skill_id)],
    ["Rotina", prettyKey(action.action_type)],
    ["Prioridade", number(action.priority)],
  ];
  return `
    <div class="why-head">
      <div>
        <span>${escapeHtml(metadata.skill_label || "Skill interna")}</span>
        <strong>${escapeHtml(action.title)}</strong>
        <p>${escapeHtml(action.body)}</p>
      </div>
    </div>
    <div class="why-grid">
      <section>
        <h3>Por que apareceu</h3>
        <p>${escapeHtml(action.reason)}</p>
      </section>
      <section>
        <h3>O que fazer agora</h3>
        <p>${escapeHtml(action.body)}</p>
      </section>
      <section>
        <h3>Resultado esperado</h3>
        <p>${escapeHtml(actionImpactText(action))}</p>
      </section>
    </div>
    <div class="why-data">
      ${dataRows.map(([key, value]) => `<div><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    </div>
    <section class="why-context">
      <h3>Dados usados na regra</h3>
      ${contextRows.length ? contextRows.map(([key, value]) => `<div><span>${escapeHtml(prettyKey(key))}</span><strong>${escapeHtml(value)}</strong></div>`).join("") : `<p>Nenhum contexto adicional registrado.</p>`}
    </section>
  `;
}

function renderWhy(action) {
  if (!action) return;
  document.querySelector("#whyPanel").className = "why-panel";
  document.querySelector("#whyPanel").innerHTML = whyContent(action);
}

function explainAction(button) {
  const action = actionFromButton(button);
  if (!action) return;
  openModal(
    "Detalhes da sugestao",
    `
      <div class="why-panel why-panel-modal">${whyContent(action)}</div>
      <div class="modal-actions split-actions">
        <button class="text-button" type="button" id="actionIgnore">Ignorar sugestao</button>
        <button class="action-button" type="button" id="actionResolve">Resolver agora</button>
      </div>
      <span class="save-state" id="actionDetailState" aria-live="polite"></span>
    `,
    (body) => {
    body.querySelector(".open-why-view")?.addEventListener("click", (event) => {
      closeModal();
      resolveActionByData(action);
    });
      body.querySelector("#actionResolve").addEventListener("click", () => {
        closeModal();
        resolveActionByData(action);
      });
      body.querySelector("#actionIgnore").addEventListener("click", async () => {
        const stateLabel = body.querySelector("#actionDetailState");
        stateLabel.textContent = "Ignorando";
        try {
          await apiPost("/api/actions/status", { id: action.id, status: "ignored" });
          closeModal();
          refreshAfterSave({ actions: true, maturity: true });
        } catch (error) {
          stateLabel.textContent = error.message;
        }
      });
    },
  );
}

function supplierRowsForAction(action) {
  const supplierId = action.target_type === "supplier" ? action.target_id : "";
  const supplierName = (action.metadata?.template_context?.supplier_name || action.metadata?.supplier_name || "").trim().toLowerCase();
  return (state.suppliers || []).filter((row) => {
    if (supplierId && row.supplier_id === supplierId) return true;
    return supplierName && (row.supplier_name || "").trim().toLowerCase() === supplierName;
  });
}

function openSupplierMinimumModal(action) {
  const matches = supplierRowsForAction(action);
  const row = matches[0];
  if (!row) {
    setView(action.view || "suppliers");
    return;
  }
  const productCount = matches.reduce((sum, item) => sum + Number(item.product_count || 0), 0);
  const revenue = matches.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  openModal(
    `Pedido minimo de ${row.supplier_name}`,
    `
      <div class="modal-context">
        <strong>${escapeHtml(row.supplier_name)}</strong>
        <span>${number(matches.length)} marca(s), ${number(productCount || row.product_count)} produtos vinculados, ${money(revenue || row.revenue)} em receita historica.</span>
      </div>
      <label class="modal-field">
        <span>Qual e o pedido minimo?</span>
        <input class="inline-input important-input" id="supplierProfileMinimumInput" inputmode="decimal" value="${inputValue(row.minimum_order_value || "")}" placeholder="Ex: 800,00" autofocus />
      </label>
      <label class="modal-field">
        <span>Telefone para cotacao, opcional</span>
        <input class="inline-input" id="supplierProfilePhoneInput" value="${inputValue(row.contact_phone)}" placeholder="(00) 00000-0000" />
      </label>
      <div class="modal-preview warn">Com esse valor, o Nexo ajusta quando vale formar pedido e quando e melhor esperar acumular mais itens do fornecedor.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="supplierProfileCancel">Cancelar</button>
        <button class="action-button" type="button" id="supplierProfileSave">Salvar</button>
      </div>
      <span class="save-state" id="supplierProfileSaveState" aria-live="polite"></span>
    `,
    (body) => {
      body.querySelector("#supplierProfileMinimumInput").focus();
      body.querySelector("#supplierProfileCancel").addEventListener("click", closeModal);
      body.querySelector("#supplierProfileSave").addEventListener("click", async () => {
        const save = body.querySelector("#supplierProfileSaveState");
        const minimumValue = parseInputNumber(body.querySelector("#supplierProfileMinimumInput").value);
        if (minimumValue <= 0) {
          save.textContent = "Informe um pedido minimo maior que zero.";
          return;
        }
        save.textContent = "Salvando";
        try {
          const result = await apiPost("/api/suppliers/profile", {
            organization_id: row.organization_id,
            supplier_id: row.supplier_id,
            supplier_name: row.supplier_name,
            contact_phone: body.querySelector("#supplierProfilePhoneInput").value.trim(),
            minimum_order_value: body.querySelector("#supplierProfileMinimumInput").value.trim(),
          });
          state.suppliers = state.suppliers.map((item) => item.supplier_id === result.supplier_id
            ? { ...item, contact_phone: result.contact_phone, minimum_order_value: result.minimum_order_value, supplier_name: result.supplier_name }
            : item);
          renderSuppliers();
          renderNavBadges();
          await apiPost("/api/actions/status", { id: action.id, status: "completed" });
          closeModal();
          refreshAfterSave({ suppliers: true, replenishment: true, quotes: true, actions: true, maturity: true });
        } catch (error) {
          save.textContent = error.message;
        }
      });
    },
  );
}

function openSupplierProfileModal(supplierId) {
  const group = supplierGroups().find((item) => item.supplier_id === supplierId);
  if (!group) {
    document.querySelector("#supplierStatus").value = "missing_supplier";
    applySupplierFilter();
    document.querySelector("#supplierSearch").focus();
    return;
  }
  openModal(
    `Fornecedor ${group.supplier_name}`,
    `
      <div class="modal-context">
        <strong>${escapeHtml(group.supplier_name)}</strong>
        <span>${number(group.brand_count)} marca(s), ${number(group.product_count)} produtos vinculados.</span>
      </div>
      <label class="modal-field">
        <span>Pedido minimo</span>
        <input class="inline-input important-input" id="supplierGroupMinimumInput" inputmode="decimal" value="${inputValue(group.minimum_order_value || "")}" placeholder="Ex: 800,00" />
      </label>
      <label class="modal-field">
        <span>Telefone para cotacao</span>
        <input class="inline-input" id="supplierGroupPhoneInput" value="${inputValue(group.contact_phone)}" placeholder="(00) 00000-0000" />
      </label>
      <div class="modal-preview good">Essas informacoes valem para todas as marcas vinculadas a esse fornecedor.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="supplierGroupCancel">Cancelar</button>
        <button class="action-button" type="button" id="supplierGroupSave">Salvar</button>
      </div>
      <span class="save-state" id="supplierGroupSaveState" aria-live="polite"></span>
    `,
    (body) => {
      body.querySelector("#supplierGroupMinimumInput").focus();
      body.querySelector("#supplierGroupCancel").addEventListener("click", closeModal);
      body.querySelector("#supplierGroupSave").addEventListener("click", async () => {
        const save = body.querySelector("#supplierGroupSaveState");
        save.textContent = "Salvando";
        try {
          const result = await apiPost("/api/suppliers/profile", {
            organization_id: group.organization_id,
            supplier_id: group.supplier_id,
            supplier_name: group.supplier_name,
            contact_phone: body.querySelector("#supplierGroupPhoneInput").value.trim(),
            minimum_order_value: body.querySelector("#supplierGroupMinimumInput").value.trim(),
          });
          state.suppliers = state.suppliers.map((item) => item.supplier_id === result.supplier_id
            ? { ...item, contact_phone: result.contact_phone, minimum_order_value: result.minimum_order_value, supplier_name: result.supplier_name }
            : item);
          renderSuppliers();
          renderNavBadges();
          closeModal();
          refreshAfterSave({ suppliers: true, replenishment: true, quotes: true, actions: true });
        } catch (error) {
          save.textContent = error.message;
        }
      });
    },
  );
}

function resolveActionByData(action) {
  if (!action) return;
  if (action.action_type === "supplier_config") {
    openSupplierMinimumModal(action);
    return;
  }
  if (action.action_type === "supplier_confirm" && action.target_id) {
    openSupplierModal(action.target_id, action);
    return;
  }
  if (action.action_type === "quote_create" && action.target_id) {
    createQuoteFromAction(action);
    return;
  }
  if (["quote_send", "quote_response", "quote_close"].includes(action.action_type) && action.target_id) {
    openQuoteFromAction(action);
    return;
  }
  if (action.view) setView(action.view);
}

function resolveAction(button) {
  resolveActionByData(actionFromButton(button));
}

async function createQuoteFromAction(action) {
  const supplierId = action.target_id;
  setView("quotes");
  try {
    await loadQuoteSupplierWorkbench(supplierId);
    refreshAfterSave({ quotes: true, actions: true, maturity: true });
  } catch (error) {
    alert(error.message);
  }
}

async function openQuoteFromAction(action) {
  setView("quotes");
  try {
    const quote = await api(`/api/quote?id=${encodeURIComponent(action.target_id)}`);
    if (quote?.supplier_id) await loadQuoteSupplierWorkbench(quote.supplier_id);
  } catch (error) {
    alert(error.message);
  }
}

async function updateAction(button, status) {
  const action = actionFromButton(button);
  const card = button.closest("[data-action-id]");
  const save = card.querySelector(".save-state");
  button.disabled = true;
  save.textContent = "Atualizando";
  try {
    await apiPost("/api/actions/status", { id: action.id, status });
    save.textContent = "Salvo";
    card.classList.add("is-refreshing");
    refreshAfterSave({ actions: true, maturity: status === "completed" || status === "ignored" });
  } catch (error) {
    save.textContent = error.message;
    button.disabled = false;
  }
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
          <button class="secondary-button drop-mix-product" type="button">Tirar do mix</button>
          <span class="save-state" aria-live="polite"></span>
        </div>
      ` : "";
      return `
        <tr data-product-id="${escapeAttr(row.product_id)}">
          <td><span class="status-chip ${row.status}">${row.status_label}</span></td>
          <td>
            <strong>${row.quote_code || row.source_code}</strong>
            <span class="muted-line">interno ${row.source_code}</span>
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
            <span class="muted-line">seguranca ${number(row.safety_stock)} - pacote ${number(row.package_size)} - tendencia ${number(row.trend_index)}</span>
            ${mixActions}
          </td>
        </tr>
      `;
    })
    .join("");
}

function supplierText(row) {
  if (!row.supplier_configured) return "a configurar";
  const days = row.supplier_days_to_order === null ? "sem minimo" : `${number(row.supplier_days_to_order)} dias p/ pedido`;
  const adjustment = Number(row.supplier_target_adjustment_days || 0);
  const signed = adjustment > 0 ? `+${adjustment}` : `${adjustment}`;
  const phone = row.supplier_phone ? ` - ${row.supplier_phone}` : " - sem telefone";
  const difficulty = row.supplier_difficulty === "unknown" ? "minimo a cadastrar" : row.supplier_difficulty;
  return `${difficulty} - ciclo ${row.review_cycle_days}d - alvo ${signed}d - ${days}${phone}`;
}

function simpleRows(selector, rows, columns) {
  document.querySelector(selector).innerHTML = rows
    .map(
      (row) => `
      <tr>
        ${columns
          .map(([key, type]) => {
            const value = type === "money" ? money(row[key]) : type === "num" ? number(row[key]) : row[key] || "";
            return `<td class="${type === "money" || type === "num" ? "num" : ""}">${value}</td>`;
          })
          .join("")}
      </tr>
    `,
    )
    .join("");
}

function filterTable(inputSelector, rows, renderer, targetSelector) {
  const input = document.querySelector(inputSelector);
  input.addEventListener("input", () => {
    const term = input.value.trim().toLowerCase();
    const sourceRows = inputSelector === "#productSearch" ? state.products : rows;
    const filtered = sourceRows.filter((row) => `${row.source_code || ""} ${row.name || ""}`.toLowerCase().includes(term));
    document.querySelector(targetSelector).innerHTML = renderer(filtered);
  });
}

function applyStockFilters() {
  const term = document.querySelector("#stockSearch").value.trim().toLowerCase();
  const status = document.querySelector("#stockStatus").value;
  const rows = state.stock.filter((row) => {
    const matchesTerm = `${row.source_code || ""} ${row.name || ""}`.toLowerCase().includes(term);
    const matchesStatus = !status || row.status === status;
    const visibleByDefault = status || row.status !== "out_of_mix";
    return matchesTerm && matchesStatus && visibleByDefault;
  });
  document.querySelector("#stockTable").innerHTML = stockRows(rows);
}

function supplierGroups(rows = state.suppliers) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.supplier_id || `missing:${row.brand_id}`;
    const group = groups.get(key) || {
      supplier_id: row.supplier_id || "",
      supplier_name: row.supplier_id ? row.supplier_name : "Sem fornecedor definido",
      contact_phone: row.contact_phone || "",
      minimum_order_value: Number(row.minimum_order_value || 0),
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
    if (!group.contact_phone && row.contact_phone) group.contact_phone = row.contact_phone;
    if (!group.minimum_order_value && Number(row.minimum_order_value || 0) > 0) group.minimum_order_value = Number(row.minimum_order_value || 0);
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
  if (group.inferred_count) return { label: "Conferir inferencias", cls: "warn" };
  if (group.minimum_order_value <= 0) return { label: "Sem pedido minimo", cls: "warn" };
  return { label: "Operacional", cls: "good" };
}

function supplierSummary(groups = supplierGroups()) {
  const items = [
    ["Fornecedores", number(groups.filter((group) => group.supplier_id).length), "blue"],
    ["Sem minimo", number(groups.filter((group) => group.supplier_id && group.minimum_order_value <= 0).length), "amber"],
    ["Sem telefone", number(groups.filter((group) => group.supplier_id && !group.contact_phone).length), ""],
    ["Inferidos", number(groups.filter((group) => group.inferred_count > 0).length), "amber"],
    ["Marcas pendentes", number((state.suppliers || []).filter((row) => row.supplier_rule_origin === "missing").length), ""],
    ["Produtos mapeados", number(groups.reduce((sum, group) => sum + group.product_count, 0)), "green"],
  ];
  document.querySelector("#supplierSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function supplierCards(groups) {
  if (!groups.length) {
    return `<div class="empty-state action-empty">Nenhum fornecedor encontrado com esse filtro.</div>`;
  }
  return groups
    .map((group) => {
      const status = supplierStatus(group);
      const brands = group.brands.slice(0, 5).map((row) => row.brand_name).filter(Boolean).join(", ");
      const actionLabel = !group.supplier_id ? "Mapear marcas" : group.minimum_order_value <= 0 ? "Informar minimo" : "Editar fornecedor";
      return `
        <article class="supplier-card ${escapeAttr(status.cls)}" data-supplier-id="${escapeAttr(group.supplier_id)}">
          <div class="supplier-card-head">
            <div>
              <span class="status-chip ${escapeAttr(status.cls)}">${escapeHtml(status.label)}</span>
              <strong>${escapeHtml(group.supplier_name)}</strong>
            </div>
            <button class="action-button edit-supplier-profile" type="button">${escapeHtml(actionLabel)}</button>
          </div>
          <div class="supplier-metrics">
            <div><span>Pedido minimo</span><strong>${group.minimum_order_value > 0 ? money(group.minimum_order_value) : "Pendente"}</strong></div>
            <div><span>Telefone</span><strong>${escapeHtml(group.contact_phone || "Pendente")}</strong></div>
            <div><span>Marcas</span><strong>${number(group.brand_count)}</strong></div>
            <div><span>Produtos</span><strong>${number(group.product_count)}</strong></div>
          </div>
          <p>${brands ? escapeHtml(brands) : "Marcas ainda sem fornecedor definido."}</p>
          ${group.inferred_count ? `<em>${number(group.inferred_count)} marca(s) inferida(s), conferir antes de usar em escala.</em>` : ""}
        </article>
      `;
    })
    .join("");
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
            <span class="trust-line ${escapeAttr(row.supplier_rule_origin || "manual")}">${escapeHtml(row.supplier_rule_label || "Confirmado no Nexo")}</span>
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
  const groups = supplierGroups(rows);
  supplierSummary(supplierGroups());
  document.querySelector("#suppliersTable").innerHTML = supplierCards(groups);
  document.querySelector("#supplierBrandTable").innerHTML = supplierBrandRows(rows.slice(0, 250));
}

function applySupplierFilter() {
  const term = document.querySelector("#supplierSearch").value.trim().toLowerCase();
  const status = document.querySelector("#supplierStatus").value;
  const rows = state.suppliers.filter((row) => {
    const haystack = `${row.brand_name || ""} ${row.supplier_name || ""} ${row.contact_phone || ""}`.toLowerCase();
    if (term && !haystack.includes(term)) return false;
    if (status === "missing_minimum") return row.supplier_id && Number(row.minimum_order_value || 0) <= 0;
    if (status === "missing_phone") return row.supplier_id && !row.contact_phone;
    if (status === "inferred") return row.supplier_rule_origin === "inferred";
    if (status === "missing_supplier") return row.supplier_rule_origin === "missing";
    return true;
  });
  renderSuppliers(rows);
}

async function refreshReplenishment() {
  const replenishment = await api(`/api/replenishment${periodQuery()}`);
  state.replenishment = replenishment;
  state.stock = replenishment.rows;
  renderReplenishmentSummary(replenishment.summary);
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

function statusText(status) {
  return {
    draft: "Rascunho",
    sent: "Enviada",
    responded: "Respondida",
    approved: "Aprovada",
    cancelled: "Cancelada",
  }[status] || status;
}

function availabilityText(value) {
  return {
    available: "Disponivel",
    partial: "Parcial",
    unavailable: "Indisponivel",
    no_quote: "Sem cotacao",
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

function defaultPurchaseDecision(item) {
  if (["unavailable", "no_quote"].includes(item.availability || "")) return "skip";
  if (Number(item.quoted_unit_price || 0) <= 0) return "review";
  return "buy";
}

function decisionText(value) {
  return {
    buy: "Comprar",
    skip: "Nao comprar",
    review: "Revisar",
  }[value] || value;
}

function mixStatusText(value) {
  return {
    in_mix: "No mix",
    out_of_mix: "Fora do mix",
    force_buy: "Comprar +1",
    drop: "Removido",
  }[value] || value || "-";
}

function quoteStatusClass(row) {
  if (Number(row.urgent_count || 0) > 0) return "danger";
  if (Number(row.buy_now_count || 0) > 0) return "warn";
  return "";
}

function quoteSupplierRows(rows) {
  if (!rows.length) {
    return `<div class="quote-empty">Nenhum fornecedor encontrado.</div>`;
  }
  return rows
    .map((row) => {
      const active = row.supplier_id === state.selectedQuoteSupplierId ? "active" : "";
      return `
        <button class="quote-supplier-card ${active} ${quoteStatusClass(row)}" type="button" data-supplier-id="${escapeAttr(row.supplier_id)}">
          <span class="quote-supplier-name">${escapeHtml(row.supplier_name)}</span>
          <span class="quote-supplier-meta">${row.contact_phone ? escapeHtml(row.contact_phone) : "sem telefone"}</span>
          <span class="quote-supplier-stats">
            <b>${number(row.urgent_count)}</b> urg.
            <b>${number(row.buy_now_count)}</b> compra
            <b>${number(row.active_skus)}</b> skus
          </span>
          <span class="quote-supplier-value">${money(row.estimated_value)}</span>
        </button>
      `;
    })
    .join("");
}

function quoteMetricCards(workbench) {
  const totals = workbench?.totals || {};
  const quote = workbench?.current_quote || {};
  const supplier = workbench?.supplier || {};
  return `
    <div class="quote-metrics">
      <div><span>Itens na cotacao</span><strong>${number(totals.items_in_quote)}</strong></div>
      <div><span>Valor estimado</span><strong>${money(totals.estimated_value_in_quote)}</strong></div>
      <div><span>Pedido minimo</span><strong>${Number(supplier.minimum_order_value || 0) ? money(supplier.minimum_order_value) : "-"}</strong></div>
      <div><span>Status</span><strong>${quote.status ? escapeHtml(statusText(quote.status)) : "Sem rascunho"}</strong></div>
    </div>
  `;
}

function quoteHistoryRows(history = []) {
  if (!history.length) return `<span>Nenhuma cotacao anterior.</span>`;
  return history
    .slice(0, 4)
    .map((item) => `<span>${escapeHtml(statusText(item.status))} - ${escapeHtml(item.created_at || "")} - ${number(item.item_count)} itens</span>`)
    .join("");
}

function quoteProductRows(rows) {
  if (!rows.length) {
    return `<tr><td colspan="13" class="empty-cell">Nenhum produto vinculado a este fornecedor.</td></tr>`;
  }
  return rows
    .map((row) => {
      const inQuote = Boolean(row.in_quote);
      const quantity = inQuote ? Number(row.quote_quantity || 0) : "";
      const alert = (row.alerts || []).length > 0;
      const classes = [
        "quote-product-row",
        inQuote ? "included" : "",
        alert ? "alert" : "",
        row.mix_status !== "in_mix" ? "out-of-mix" : "",
      ].filter(Boolean).join(" ");
      return `
        <tr class="${classes}" data-product-id="${escapeAttr(row.product_id)}" data-organization-id="${escapeAttr(row.organization_id)}" data-supplier-id="${escapeAttr(state.selectedQuoteSupplierId)}" data-suggested-quantity="${escapeAttr(row.suggested_quantity)}">
          <td class="quote-include-cell">
            <button class="quote-toggle ${inQuote ? "on" : ""}" type="button" title="${inQuote ? "Remover da cotacao" : "Incluir na cotacao"}">${inQuote ? "Incluido" : "Incluir"}</button>
          </td>
          <td>
            <strong>${escapeHtml(row.supplier_reference || row.source_code)}</strong>
            <span class="muted-line">interno ${escapeHtml(row.source_code)}</span>
          </td>
          <td class="quote-product-name">
            ${escapeHtml(row.name)}
            <span class="muted-line">${escapeHtml(row.brand_name || "")}</span>
          </td>
          <td><span class="status-chip ${escapeAttr(row.status)}">${escapeHtml(row.status_label || row.status)}</span></td>
          <td><span class="mix-pill ${escapeAttr(row.mix_status)}">${escapeHtml(mixStatusText(row.mix_status))}</span></td>
          <td class="num">${number(row.package_size)}</td>
          <td class="num">${number(row.stock_units)}</td>
          <td class="num">${number(row.demand_window)}</td>
          <td class="num">${number(row.avg_daily_window)}</td>
          <td class="num">${number(row.suggested_quantity)}</td>
          <td class="num">${money(row.cost_no_tax)}</td>
          <td class="num">${money(row.cost_with_tax)}</td>
          <td>
            <input class="inline-input quote-quantity-input" type="text" inputmode="decimal" value="${inputValue(quantity)}" placeholder="${escapeAttr(number(row.suggested_quantity))}" />
            <span class="save-state row-save-state" aria-live="polite"></span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderQuoteWorkbenchHead(workbench) {
  const supplier = workbench?.supplier;
  if (!supplier) {
    document.querySelector("#quoteWorkbenchHead").innerHTML = `
      <div>
        <h2>Mesa de cotacao</h2>
        <p class="panel-subtitle">Escolha um fornecedor para montar a cotacao item a item.</p>
      </div>
    `;
    return;
  }
  document.querySelector("#quoteWorkbenchHead").innerHTML = `
    <div class="quote-title-block">
      <div>
        <h2>${escapeHtml(supplier.name)}</h2>
        <p class="panel-subtitle">${supplier.contact_phone ? escapeHtml(supplier.contact_phone) : "Sem telefone"} - janela de ${number(workbench.window_days)} dias</p>
      </div>
      <div class="quote-history">${quoteHistoryRows(workbench.quote_history || [])}</div>
    </div>
    ${quoteMetricCards(workbench)}
  `;
}

function renderQuoteDetail(workbench) {
  state.quoteWorkbench = workbench || null;
  renderQuoteWorkbenchHead(workbench);
  if (!workbench) {
    document.querySelector("#quoteDetail").className = "quote-detail empty-state";
    document.querySelector("#quoteDetail").textContent = "Selecione um fornecedor para abrir a mesa.";
    return;
  }
  document.querySelector("#quoteDetail").className = "quote-detail";
  document.querySelector("#quoteDetail").innerHTML = `
    <div class="quote-toolbar">
      <div>
        <strong>${number(workbench.totals.total_products)} produtos</strong>
        <span>${number(workbench.totals.alerts_count)} alertas - ${number(workbench.totals.items_in_quote)} incluidos</span>
      </div>
      <span id="quoteWorkbenchStatus" class="save-state" aria-live="polite"></span>
    </div>
    <div class="table-wrap quote-items quote-workbench-table">
      <table>
        <thead>
          <tr>
            <th>Incluir</th>
            <th>Ref.</th>
            <th>Produto</th>
            <th>Status</th>
            <th>Mix</th>
            <th class="num">Div.</th>
            <th class="num">Estoque</th>
            <th class="num">Venda janela</th>
            <th class="num">Media/dia</th>
            <th class="num">Sug.</th>
            <th class="num">Custo s/ imp.</th>
            <th class="num">Custo c/ imp.</th>
            <th>Qtd. cotacao</th>
          </tr>
        </thead>
        <tbody>${quoteProductRows(workbench.rows || [])}</tbody>
      </table>
    </div>
  `;
}

function renderQuotes() {
  const search = (document.querySelector("#quoteSupplierSearch")?.value || "").trim().toLowerCase();
  const suppliers = (state.quoteSuppliers || []).filter((row) => {
    if (!search) return true;
    return `${row.supplier_name} ${row.contact_phone}`.toLowerCase().includes(search);
  });
  document.querySelector("#quoteSuppliersTable").innerHTML = quoteSupplierRows(suppliers);
}

async function loadQuoteSupplierWorkbench(supplierId, options = {}) {
  if (!supplierId) {
    renderQuoteDetail(null);
    return;
  }
  state.selectedQuoteSupplierId = supplierId;
  renderQuotes();
  const status = document.querySelector("#quoteWorkbenchStatus");
  if (status && !options.silent) status.textContent = "Carregando";
  const query = new URLSearchParams({ supplier_id: supplierId, window_days: state.quoteWindowDays || "90" });
  const workbench = await api(`/api/supplier-workbench?${query.toString()}`);
  renderQuoteDetail(workbench);
}

async function refreshQuotes() {
  state.quoteSuppliers = await api("/api/supplier-workbench/suppliers");
  if (!state.selectedQuoteSupplierId || !state.quoteSuppliers.some((row) => row.supplier_id === state.selectedQuoteSupplierId)) {
    state.selectedQuoteSupplierId = state.quoteSuppliers[0]?.supplier_id || "";
  }
  renderQuotes();
  await loadQuoteSupplierWorkbench(state.selectedQuoteSupplierId, { silent: true });
}

function findWorkbenchRow(productId) {
  return (state.quoteWorkbench?.rows || []).find((row) => row.product_id === productId);
}

function updateWorkbenchTotalsFromRows() {
  if (!state.quoteWorkbench) return;
  const rows = state.quoteWorkbench.rows || [];
  const items = rows.filter((row) => row.in_quote);
  state.quoteWorkbench.totals.items_in_quote = items.length;
  state.quoteWorkbench.totals.estimated_value_in_quote = items.reduce((sum, row) => sum + Number(row.quote_quantity || 0) * Number(row.cost_with_tax || 0), 0);
  if (state.quoteWorkbench.current_quote) {
    state.quoteWorkbench.current_quote.item_count = state.quoteWorkbench.totals.items_in_quote;
    state.quoteWorkbench.current_quote.estimated_value = state.quoteWorkbench.totals.estimated_value_in_quote;
  }
  renderQuoteWorkbenchHead(state.quoteWorkbench);
}

function syncQuoteRow(rowEl, row) {
  rowEl.classList.toggle("included", Boolean(row.in_quote));
  const toggle = rowEl.querySelector(".quote-toggle");
  if (toggle) {
    toggle.classList.toggle("on", Boolean(row.in_quote));
    toggle.textContent = row.in_quote ? "Incluido" : "Incluir";
    toggle.title = row.in_quote ? "Remover da cotacao" : "Incluir na cotacao";
  }
}

async function saveWorkbenchQuantity(rowEl, quantity) {
  const row = findWorkbenchRow(rowEl.dataset.productId);
  const status = rowEl.querySelector(".row-save-state");
  if (!row) return;
  if (quantity < 0) {
    status.textContent = "Qtd. invalida";
    return;
  }
  status.textContent = "Salvando";
  try {
    const result = await apiPost("/api/quote-item/upsert", {
      organization_id: rowEl.dataset.organizationId,
      supplier_id: rowEl.dataset.supplierId,
      product_id: rowEl.dataset.productId,
      requested_quantity: quantity,
    });
    row.in_quote = quantity > 0;
    row.quote_quantity = quantity;
    if (!state.quoteWorkbench.current_quote && result.current_quote_id) {
      state.quoteWorkbench.current_quote = { id: result.current_quote_id, status: "draft" };
    }
    if (state.quoteWorkbench.current_quote && !result.current_quote_id && result.item_count === 0) {
      state.quoteWorkbench.current_quote = null;
    }
    syncQuoteRow(rowEl, row);
    updateWorkbenchTotalsFromRows();
    status.textContent = "Salvo";
    refreshAfterSave({ actions: true, maturity: true });
  } catch (error) {
    status.textContent = error.message;
  }
}

function scheduleWorkbenchQuantitySave(input) {
  const rowEl = input.closest(".quote-product-row");
  if (!rowEl) return;
  const existing = state.quoteSaveTimers.get(rowEl.dataset.productId);
  if (existing) clearTimeout(existing);
  rowEl.querySelector(".row-save-state").textContent = "Editando";
  const timer = setTimeout(() => {
    const quantity = parseInputNumber(input.value);
    saveWorkbenchQuantity(rowEl, quantity);
    state.quoteSaveTimers.delete(rowEl.dataset.productId);
  }, 400);
  state.quoteSaveTimers.set(rowEl.dataset.productId, timer);
}

function toggleWorkbenchItem(button) {
  const rowEl = button.closest(".quote-product-row");
  const input = rowEl?.querySelector(".quote-quantity-input");
  const row = rowEl ? findWorkbenchRow(rowEl.dataset.productId) : null;
  if (!rowEl || !input || !row) return;
  const nextQuantity = row.in_quote ? 0 : Number(row.suggested_quantity || row.package_size || 1);
  input.value = nextQuantity > 0 ? String(nextQuantity).replace(".", ",") : "";
  saveWorkbenchQuantity(rowEl, nextQuantity);
}

async function createQuote(button) {
  await loadQuoteSupplierWorkbench(button.dataset.supplierId || state.selectedQuoteSupplierId);
}

async function openQuote(button) {
  const quoteId = button.dataset.quoteId;
  const quote = (state.quotes || []).find((row) => row.id === quoteId);
  if (quote?.supplier_id) await loadQuoteSupplierWorkbench(quote.supplier_id);
}

async function markQuoteSent(button) {
  button.disabled = true;
  await apiPost("/api/quotes/status", { id: button.dataset.quoteId, status: "sent" });
  await refreshQuotes();
}

async function saveQuoteResponse() {}

async function closePurchaseOrder() {}

async function copyQuoteText() {}

function renderPricingSummary(summary = {}) {
  const items = [
    ["Produtos", number(summary.products), "blue"],
    ["Margem negativa", number(summary.negative_margin), "amber"],
    ["Margem baixa", number(summary.low_margin), "amber"],
    ["Sem custo/preco", number(summary.missing_cost), ""],
    ["Oportunidades", number(summary.opportunities), "green"],
  ];
  document.querySelector("#pricingSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function pricingRows(rows = []) {
  if (!rows.length) {
    return `<tr><td colspan="9"><strong>Nada para analisar</strong><span class="muted-line">Sem venda ou preco importado no periodo selecionado.</span></td></tr>`;
  }
  return rows
    .map(
      (row) => `
        <tr class="clickable-row pricing-row" data-product-id="${escapeAttr(row.product_id)}">
          <td><span class="status-chip ${escapeAttr(row.severity)}">${escapeHtml(row.signal_label)}</span></td>
          <td>
            <strong class="product-name">${escapeHtml(row.name)}</strong>
            <span class="muted-line">codigo ${escapeHtml(row.source_code || "")} - ${number(row.quantity)} un.</span>
          </td>
          <td>${escapeHtml(row.role_label || roleText(row.product_role))}</td>
          <td class="num">${money(row.revenue)}</td>
          <td class="num">${money(row.sale_price)}<span class="muted-line">ERP importado</span></td>
          <td class="num">${money(row.effective_cost)}<span class="muted-line">${escapeHtml(row.cost_origin || "")}</span></td>
          <td class="num ${row.severity === "danger" ? "risk" : row.severity === "good" ? "ok" : ""}">${row.margin_pct === null || row.margin_pct === undefined ? "-" : `${number(row.margin_pct)}%`}</td>
          <td class="num">${Number(row.target_price || 0) > 0 ? money(row.target_price) : "-"}<span class="muted-line">${escapeHtml(row.nexo_action || "")}</span></td>
          <td>${escapeHtml(row.reason || "")}<span class="row-edit-hint">Clique para editar custo/papel do Nexo</span></td>
        </tr>
      `,
    )
    .join("");
}

function renderPricing(payload) {
  state.pricing = payload;
  renderPricingSummary(payload.summary || {});
  document.querySelector("#pricingTable").innerHTML = pricingRows(payload.rows || []);
}

function openModal(title, bodyHtml, onMount) {
  document.querySelector("#modalTitle").textContent = title;
  document.querySelector("#modalBody").innerHTML = bodyHtml;
  document.querySelector("#modalOverlay").hidden = false;
  if (onMount) onMount(document.querySelector("#modalBody"));
}

function closeModal() {
  document.querySelector("#modalOverlay").hidden = true;
  document.querySelector("#modalBody").innerHTML = "";
}

function marginPreview(price, cost, role) {
  const min = { ancora: 5, commodity: 8, normal: 20, marca_propria: 30 }[role] || 20;
  if (!price || price <= 0) return { label: "Sem preco de venda importado do ERP", cls: "danger" };
  if (!cost || cost <= 0) return { label: "Informe custo para calcular margem", cls: "danger" };
  const margin = ((price - cost) / price) * 100;
  const targetPrice = cost / (1 - min / 100);
  if (margin < 0) return { label: `Margem ${number(margin)}% - sugerir revisao no ERP. Preco alvo Nexo: ${money(targetPrice)}`, cls: "danger" };
  if (margin < min) return { label: `Margem ${number(margin)}% - sugerir revisao no ERP. Preco alvo Nexo: ${money(targetPrice)}`, cls: "warn" };
  return { label: `Margem ${number(margin)}% - preco ERP dentro do alvo ${min}%`, cls: "good" };
}

async function openProductModal(productId) {
  if (!productId) return;
  let detail;
  try {
    detail = await api(`/api/product?id=${encodeURIComponent(productId)}`);
  } catch (error) {
    console.error(error);
    return;
  }
  const codes = [
    ["Codigo interno", detail.source_code, "ERP"],
    ["Codigo de barras (EAN)", detail.barcode || "-", "ERP"],
  ];
  openModal(
    "Ficha do produto",
    `
      <div class="modal-context">
        <strong>${escapeHtml(detail.name)}</strong>
        <span>${escapeHtml(detail.brand_name || "Sem marca")} - Unidade ${escapeHtml(detail.unit || "UN")}</span>
      </div>
      <div class="product-modal-codes">
        ${codes
          .map(
            ([label, value, source]) => `
          <div class="product-code-item">
            <span class="product-code-label">${label}</span>
            <strong class="product-code-value">${escapeHtml(value || "-")}</strong>
            <span class="product-code-source">${source}</span>
          </div>
        `,
          )
          .join("")}
      </div>
      <label class="modal-field">
        <span>Referencia do fornecedor (manual, opcional)</span>
        <input class="inline-input" id="productRefInput" type="text" maxlength="120" value="${inputValue(detail.supplier_reference)}" placeholder="codigo que o fornecedor usa para este produto" />
      </label>
      <div class="product-modal-meta">
        <div><span>Estoque atual</span><strong>${detail.stock == null ? "-" : number(detail.stock)}</strong></div>
        <div><span>Preco de venda</span><strong>${detail.sale_price == null ? "-" : money(detail.sale_price)}</strong></div>
        <div><span>Custo total</span><strong>${detail.total_cost == null ? "-" : money(detail.total_cost)}</strong></div>
      </div>
      <span class="muted-line">Apenas a referencia do fornecedor e editavel aqui. Os demais campos vem do ERP.</span>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="productCancel">Fechar</button>
        <button class="action-button" type="button" id="productSave">Salvar referencia</button>
      </div>
      <span class="save-state" id="productSaveState" aria-live="polite"></span>
    `,
    (body) => {
      const refInput = body.querySelector("#productRefInput");
      const saveState = body.querySelector("#productSaveState");
      body.querySelector("#productCancel").addEventListener("click", closeModal);
      body.querySelector("#productSave").addEventListener("click", async () => {
        saveState.textContent = "Salvando";
        try {
          await apiPost("/api/products/supplier-reference", {
            organization_id: detail.organization_id,
            product_id: detail.id,
            value: refInput.value.trim(),
          });
          saveState.textContent = "Salvo";
          closeModal();
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
  );
}

function openPricingModal(productId) {
  const row = (state.pricing?.rows || []).find((item) => item.product_id === productId);
  if (!row) return;
  openModal(
    "Sinal de precificacao",
    `
      <div class="modal-context">
        <strong>${escapeHtml(row.name)}</strong>
        <span>Preco ERP ${money(row.sale_price)} - somente leitura. O Nexo nao altera preco de venda; ele sugere revisao para executar no ERP.</span>
      </div>
      <div class="modal-preview muted">Na proxima importacao, o Nexo confere se o ERP trouxe o preco revisado.</div>
      <label class="modal-field">
        <span>Custo manual no Nexo</span>
        <input class="inline-input" id="pricingCostInput" type="text" inputmode="decimal" value="${inputValue(row.manual_cost ?? row.effective_cost)}" />
      </label>
      <label class="modal-field">
        <span>Papel do produto</span>
        <select class="inline-input" id="pricingRoleInput">
          ${["normal", "ancora", "commodity", "marca_propria"].map((role) => `<option value="${role}" ${role === row.product_role ? "selected" : ""}>${roleText(role)}</option>`).join("")}
        </select>
      </label>
      <div class="modal-preview" id="pricingPreview"></div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="pricingCancel">Cancelar</button>
        <button class="action-button" type="button" id="pricingSave">Salvar</button>
      </div>
      <span class="save-state" id="pricingSaveState" aria-live="polite"></span>
    `,
    (body) => {
      const costInput = body.querySelector("#pricingCostInput");
      const roleInput = body.querySelector("#pricingRoleInput");
      const preview = body.querySelector("#pricingPreview");
      const refreshPreview = () => {
        const result = marginPreview(Number(row.sale_price || 0), parseInputNumber(costInput.value), roleInput.value);
        preview.className = `modal-preview ${result.cls}`;
        preview.textContent = result.label;
      };
      refreshPreview();
      costInput.addEventListener("input", refreshPreview);
      roleInput.addEventListener("change", refreshPreview);
      body.querySelector("#pricingCancel").addEventListener("click", closeModal);
      body.querySelector("#pricingSave").addEventListener("click", async () => {
        const save = body.querySelector("#pricingSaveState");
        save.textContent = "Salvando";
        try {
          await apiPost("/api/pricing/product", {
            organization_id: row.organization_id,
            product_id: row.product_id,
            cost_price: costInput.value.trim(),
            product_role: roleInput.value,
          });
          renderPricing(await api(`/api/pricing${periodQuery()}`));
          closeModal();
        } catch (error) {
          save.textContent = error.message;
        }
      });
    },
  );
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
        <span>Telefone para cotacao</span>
        <input class="inline-input" id="supplierPhoneInput" value="${inputValue(row.contact_phone)}" placeholder="(00) 00000-0000" />
      </label>
      <label class="modal-field">
        <span>Pedido minimo</span>
        <input class="inline-input" id="supplierMinimumInput" inputmode="decimal" value="${inputValue(row.minimum_order_value || "")}" placeholder="0,00" />
      </label>
      <div class="modal-preview good">Ao salvar, a marca passa a usar esse fornecedor nas cotacoes e reposicao do Nexo.</div>
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
                supplier_rule_label: "Confirmado no Nexo",
              }
            : item);
          renderSuppliers();
          renderNavBadges();
          if (actionToComplete) await apiPost("/api/actions/status", { id: actionToComplete.id, status: "completed" });
          closeModal();
          refreshAfterSave({ suppliers: true, replenishment: true, quotes: true, actions: true, maturity: Boolean(actionToComplete) });
        } catch (error) {
          save.textContent = error.message;
        }
      });
    },
  );
}

function renderNavBadges() {
  const supplierPending = (state.suppliers || []).filter((row) => row.supplier_rule_origin !== "manual" || Number(row.minimum_order_value || 0) <= 0).length;
  const pricingPending = Number(state.pricing?.summary?.negative_margin || 0) + Number(state.pricing?.summary?.low_margin || 0) + Number(state.pricing?.summary?.missing_cost || 0);
  const actionsPending = Number(state.actions?.summary?.open || 0) + Number(state.actions?.summary?.in_progress || 0);
  const badgeMap = { suppliers: supplierPending, pricing: pricingPending, actions: actionsPending };
  document.querySelectorAll(".nav-item").forEach((button) => {
    const label = viewLabel(button.dataset.view);
    button.dataset.label = label;
    const count = badgeMap[button.dataset.view] || 0;
    button.innerHTML = `<span class="nav-label">${escapeHtml(label)}</span>${count ? `<span class="nav-badge">${number(count)}</span>` : ""}`;
  });
}

async function refreshPeriodData() {
  const [summary, products, replenishment, commercial, customers, services, pricing] = await Promise.all([
    api(`/api/summary${periodQuery()}`),
    api(`/api/products/top${periodQuery()}`),
    api(`/api/replenishment${periodQuery()}`),
    api(`/api/commercial/intelligence${periodQuery()}`),
    api(`/api/customers/top${periodQuery()}`),
    api(`/api/services/top${periodQuery()}`),
    api(`/api/pricing${periodQuery()}`),
  ]);
  state.products = products;
  state.replenishment = replenishment;
  state.stock = replenishment.rows;
  state.commercial = commercial;
  renderKpis(summary.kpis);
  renderMonthly(summary.monthly);
  renderReplenishmentSummary(replenishment.summary);
  const productTerm = document.querySelector("#productSearch").value.trim().toLowerCase();
  const visibleProducts = productTerm
    ? products.filter((row) => `${row.source_code || ""} ${row.name || ""}`.toLowerCase().includes(productTerm))
    : products;
  document.querySelector("#productsTable").innerHTML = productRows(visibleProducts);
  document.querySelector("#stockTable").innerHTML = stockRows(replenishment.rows);
  renderCommercial(commercial);
  renderPricing(pricing);
  renderNavBadges();
  simpleRows("#customersTable", customers, [["name", "text"], ["purchases", "num"], ["last_purchase", "text"], ["revenue", "money"]]);
  simpleRows("#servicesTable", services, [["name", "text"], ["quantity", "num"], ["revenue", "money"], ["net_revenue", "money"]]);
  document.querySelector("#periodLabel").textContent = summary.period?.label || "Periodo";
}

function renderImports(payload) {
  document.querySelector("#batches").innerHTML = payload.batches
    .map((batch) => `<div class="info-card"><strong>${batch.id}</strong><span>${batch.status} - ${batch.source_period_start} a ${batch.source_period_end}</span></div>`)
    .join("");
  const issueCards = [
    ...payload.issues.map((item) => ({
      title: `${item.severity} - ${item.code}`,
      body: item.message,
    })),
    ...payload.changes.map((item) => ({
      title: `${item.entity_type} - ${item.field_name}`,
      body: `${item.previous_value || "(vazio)"} -> ${item.new_value || "(vazio)"}`,
    })),
  ].slice(0, 30);
  document.querySelector("#issues").innerHTML = issueCards
    .map((item) => `<div class="info-card"><strong>${item.title}</strong><span>${item.body}</span></div>`)
    .join("");
}

async function boot() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  const [summary, maturity, actions, skills, products, replenishment, suppliers, quoteSuppliers, commercial, customers, services, pricing, imports] = await Promise.all([
    api(`/api/summary${periodQuery()}`),
    api("/api/intelligence/maturity"),
    api("/api/actions/today"),
    api("/api/nexo/skills"),
    api(`/api/products/top${periodQuery()}`),
    api(`/api/replenishment${periodQuery()}`),
    api("/api/suppliers/brands"),
    api("/api/supplier-workbench/suppliers"),
    api(`/api/commercial/intelligence${periodQuery()}`),
    api(`/api/customers/top${periodQuery()}`),
    api(`/api/services/top${periodQuery()}`),
    api(`/api/pricing${periodQuery()}`),
    api("/api/imports"),
  ]);

  state.products = products;
  state.maturity = maturity;
  state.actions = actions;
  state.skills = skills;
  state.replenishment = replenishment;
  state.stock = replenishment.rows;
  state.suppliers = suppliers;
  state.quoteSuppliers = quoteSuppliers;
  state.selectedQuoteSupplierId = quoteSuppliers[0]?.supplier_id || "";
  state.commercial = commercial;
  state.pricing = pricing;

  renderKpis(summary.kpis);
  renderMaturity(maturity);
  renderMissions(maturity);
  renderActions(actions);
  renderEngine(skills, actions);
  renderMonthly(summary.monthly);
  renderTasks(summary.tasks);
  renderReplenishmentSummary(replenishment.summary);
  document.querySelector("#productsTable").innerHTML = productRows(products);
  document.querySelector("#stockTable").innerHTML = stockRows(replenishment.rows);
  renderSuppliers(suppliers);
  renderQuotes();
  await loadQuoteSupplierWorkbench(state.selectedQuoteSupplierId, { silent: true });
  renderCommercial(commercial);
  renderPricing(pricing);
  document.querySelector("#periodLabel").textContent = summary.period?.label || "Ultimos 6 meses";
  simpleRows("#customersTable", customers, [
    ["name", "text"],
    ["purchases", "num"],
    ["last_purchase", "text"],
    ["revenue", "money"],
  ]);
  simpleRows("#servicesTable", services, [
    ["name", "text"],
    ["quantity", "num"],
    ["revenue", "money"],
    ["net_revenue", "money"],
  ]);
  renderImports(imports);
  filterTable("#productSearch", products, productRows, "#productsTable");
  document.querySelector("#stockSearch").addEventListener("input", applyStockFilters);
  document.querySelector("#stockStatus").addEventListener("change", applyStockFilters);
  document.querySelector("#stockTable").addEventListener("click", (event) => {
    if (event.target.classList.contains("force-mix-buy")) updateProductMixDecision(event.target, "force_buy");
    if (event.target.classList.contains("drop-mix-product")) updateProductMixDecision(event.target, "drop");
    if (event.target.classList.contains("edit-stock-supplier")) openSupplierModal(event.target.dataset.brandId);
  });
  document.querySelector("#supplierSearch").addEventListener("input", applySupplierFilter);
  document.querySelector("#supplierStatus").addEventListener("change", applySupplierFilter);
  document.querySelector("#suppliersTable").addEventListener("click", (event) => {
    const button = event.target.closest(".edit-supplier-profile");
    if (!button) return;
    const card = button.closest(".supplier-card");
    openSupplierProfileModal(card?.dataset.supplierId || "");
  });
  document.querySelector("#supplierBrandTable").addEventListener("click", (event) => {
    const row = event.target.closest(".supplier-row");
    const button = event.target.closest(".edit-supplier");
    if (button?.dataset.brandId) {
      openSupplierModal(button.dataset.brandId);
      return;
    }
    if (row?.dataset.brandId) openSupplierModal(row.dataset.brandId);
  });
  document.querySelector("#quoteSupplierSearch").addEventListener("input", renderQuotes);
  document.querySelector("#quoteWindowDays").addEventListener("change", async (event) => {
    state.quoteWindowDays = event.target.value;
    await loadQuoteSupplierWorkbench(state.selectedQuoteSupplierId);
  });
  document.querySelector("#quoteSuppliersTable").addEventListener("click", async (event) => {
    const button = event.target.closest(".quote-supplier-card");
    if (button?.dataset.supplierId) await loadQuoteSupplierWorkbench(button.dataset.supplierId);
  });
  document.querySelector("#quoteDetail").addEventListener("click", (event) => {
    const toggle = event.target.closest(".quote-toggle");
    if (toggle) toggleWorkbenchItem(toggle);
  });
  document.querySelector("#quoteDetail").addEventListener("input", (event) => {
    if (event.target.classList.contains("quote-quantity-input")) scheduleWorkbenchQuantitySave(event.target);
  });
  document.querySelector("#pricingTable").addEventListener("click", (event) => {
    const row = event.target.closest(".pricing-row");
    if (row) openPricingModal(row.dataset.productId);
  });
  document.querySelector("#productsTable").addEventListener("click", (event) => {
    const row = event.target.closest(".product-row");
    if (row) openProductModal(row.dataset.productId);
  });
  renderNavBadges();
  document.querySelectorAll(".period-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      state.periodDays = button.dataset.periodDays;
      document.querySelectorAll(".period-btn").forEach((item) => item.classList.toggle("active", item === button));
      await refreshPeriodData();
    });
  });
  document.querySelector("#modalClose").addEventListener("click", closeModal);
  document.querySelector("#modalOverlay").addEventListener("click", (event) => {
    if (event.target.id === "modalOverlay") closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("#modalOverlay").hidden) closeModal();
  });
  document.querySelector("#maturity").addEventListener("click", (event) => {
    const target = event.target.closest("button[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });
  document.querySelector("#maturityNextButton").addEventListener("click", (event) => {
    if (event.currentTarget.dataset.viewTarget) setView(event.currentTarget.dataset.viewTarget);
  });
  document.querySelector("#missions").addEventListener("click", (event) => {
    const target = event.target.closest("button[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });
  document.querySelector("#actionsBoard").addEventListener("click", (event) => {
    const viewTarget = event.target.closest("button[data-view-target]");
    if (viewTarget?.dataset.viewTarget) {
      setView(viewTarget.dataset.viewTarget);
      return;
    }
    if (event.target.classList.contains("resolve-action")) resolveAction(event.target);
    if (event.target.classList.contains("explain-action")) explainAction(event.target);
  });
  document.querySelector("#refreshActionsButton").addEventListener("click", refreshActions);
  document.querySelector("#refreshEngineButton").addEventListener("click", async () => {
    const [skillsPayload, actionsPayload] = await Promise.all([api("/api/nexo/skills"), api("/api/actions/today")]);
    state.skills = skillsPayload;
    state.actions = actionsPayload;
    renderActions(actionsPayload);
    renderEngine(skillsPayload, actionsPayload);
  });
  document.querySelector("#whyPanel").addEventListener("click", (event) => {
    const target = event.target.closest("button[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });

  const initialView = new URLSearchParams(window.location.search).get("view");
  if (initialView && document.getElementById(initialView)) setView(initialView);
}

boot().catch((error) => {
  document.body.innerHTML = `<pre class="fatal">${error.stack || error.message}</pre>`;
});
