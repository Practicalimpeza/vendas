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

function actionAreaLabel(row = {}) {
  return {
    quote_send: "Compras",
    quote_create: "Compras",
    quote_response: "Compras",
    purchase_order_confirm: "Compras",
    supplier_config: "Fornecedores",
    supplier_confirm: "Fornecedores",
    product_mix_decision: "Mix e estoque",
    customer_contact: "Comercial",
    product_investigate: "Comercial",
  }[row.action_type] || viewLabel(row.view || "actions");
}

function actionEntityText(row = {}) {
  const metadata = row.metadata || {};
  return metadata.supplier_name || metadata.customer_name || metadata.product_name || metadata.brand_name || row.target_type || "Operação";
}

function actionTone(row = {}) {
  if (row.status === "completed") return "good";
  if (row.status === "ignored") return "muted";
  if (Number(row.priority || 9) <= 1) return "danger";
  if (Number(row.priority || 9) <= 2) return "warn";
  if (row.status === "in_progress") return "info";
  return "muted";
}

function actionToneLabel(row = {}) {
  const tone = actionTone(row);
  if (tone === "danger") return "Agir agora";
  if (tone === "warn") return "Decidir hoje";
  if (tone === "info") return "Em curso";
  if (tone === "good") return "Concluida";
  return "Acompanhar";
}

function pulseEventText(event = {}) {
  return {
    quote_response_saved: "Resposta de cotação registrada",
    purchase_order_closed: "Pedido de compra fechado",
    quote_response: "Resposta de cotação registrada",
    product_supplier_reference_update: "Referência de fornecedor atualizada",
    pricing_product_update: "Preço/custo revisado",
    supplier_brand_update: "Fornecedor atualizado",
    product_mix_decision: "Decisão de mix registrada",
    quick_decision: "Decisão operacional registrada",
  }[event.action] || event.action || "Evento operacional";
}

function renderTodayPulse(payload = {}) {
  const pulse = payload.pulse || {};
  const latestImport = pulse.latest_import || {};
  const importSummary = pulse.latest_import_summary || {};
  const quotes = pulse.quotes || {};
  const orders = pulse.orders || {};
  const issues = pulse.import_issues || {};
  const events = pulse.events || [];
  const mappedRows = Number(importSummary.mapped_rows || importSummary.imported_rows || importSummary.rows || 0);
  const quoteWaiting = Number(quotes.sent || 0);
  const quoteToClose = Number(quotes.responded || 0);
  const headline = latestImport.id
    ? `Última importação ${shortDateTime(latestImport.finished_at)} trouxe ${number(mappedRows)} linha(s) mapeadas.`
    : "Nenhuma importação registrada ainda.";
  const movement = [
    quoteWaiting ? `${number(quoteWaiting)} cotação(ões) esperando resposta` : "",
    quoteToClose ? `${number(quoteToClose)} cotação(ões) prontas para virar pedido` : "",
    orders.open ? `${number(orders.open)} pedido(s) em aberto` : "",
    pulse.changes_last_7d ? `${number(pulse.changes_last_7d)} mudança(s) de dados em 7 dias` : "",
  ].filter(Boolean);
  document.querySelector("#todayPulse").innerHTML = `
    <div class="pulse-main">
      <span class="today-kicker">Pulso operacional</span>
      <strong>${escapeHtml(headline)}</strong>
      <p>${escapeHtml(movement.length ? movement.join(" - ") : `Sem movimento crítico desde a última leitura. O ${appName()} segue acompanhando compras, dados e decisões.`)}</p>
    </div>
    <div class="pulse-metrics">
      <article>
        <span>Cotações</span>
        <strong>${number(quoteWaiting + quoteToClose)}</strong>
        <em>${number(quoteWaiting)} resposta / ${number(quoteToClose)} fechar</em>
      </article>
      <article>
        <span>Pedidos abertos</span>
        <strong>${number(orders.open || 0)}</strong>
        <em>${compactMoney(orders.open_value || 0)} em aberto</em>
      </article>
      <article>
        <span>Dados</span>
        <strong>${number((issues.errors || 0) + (issues.warnings || 0))}</strong>
        <em>${number(issues.errors || 0)} erro(s), ${number(issues.warnings || 0)} aviso(s)</em>
      </article>
    </div>
    <div class="pulse-events">
      ${
        events.length
          ? events.slice(0, 4).map((event) => `
              <span>
                <strong>${escapeHtml(pulseEventText(event))}</strong>
                <em>${escapeHtml(shortDateTime(event.created_at))}</em>
              </span>
            `).join("")
          : `<span><strong>Sem eventos recentes</strong><em>As próximas decisões aparecem aqui.</em></span>`
      }
    </div>
  `;
}

function intelligenceKindLabel(kind) {
  return {
    ruptura: "Ruptura",
    preço_compra: "Preço + compra",
    demanda_estoque: "Demanda + estoque",
    caixa_estoque: "Caixa parado",
    fornecedor: "Fornecedor",
    dados: "Dados",
    ciclo_compra: "Ciclo de compra",
    rotina: "Rotina",
  }[kind] || "Sinal cruzado";
}

function intelligenceIcon(kind) {
  return {
    ruptura: "siren",
    preço_compra: "scale",
    demanda_estoque: "activity",
    caixa_estoque: "coins",
    fornecedor: "truck",
    dados: "database-zap",
    ciclo_compra: "refresh-cw",
    rotina: "radar",
  }[kind] || "sparkles";
}

function renderIntelligenceRadar(payload = {}) {
  const intelligence = payload.intelligence || {};
  const cards = intelligence.cards || [];
  const summary = intelligence.summary || {};
  const top = cards[0] || {};
  document.querySelector("#actionsIntelligence").innerHTML = `
    <div class="radar-head tone-${escapeAttr(top.tone || "muted")}">
      <span class="today-kicker">Radar de inteligencia</span>
      <strong>${escapeHtml(top.title || "Cruzando sinais operacionais")}</strong>
      <p>${escapeHtml(top.body || `O ${appName()} cruza compra, preço, estoque, fornecedor, dados e comercial para encontrar contradições antes que virem rotina ruim.`)}</p>
      <div class="radar-stats">
        <span><i data-lucide="sparkles"></i>${number(summary.signals || cards.length)} sinal(is)</span>
        <span><i data-lucide="circle-alert"></i>${number(summary.critical || 0)} crítico(s)</span>
        <span><i data-lucide="database"></i>${number(summary.data_gaps || 0)} lacuna(s) de dado</span>
      </div>
    </div>
    <div class="radar-grid">
      ${
        cards.length
          ? cards.map((card) => `
              <article class="radar-card tone-${escapeAttr(card.tone || "muted")}">
                <div class="radar-card-top">
                  <span><i data-lucide="${escapeAttr(intelligenceIcon(card.kind))}"></i>${escapeHtml(intelligenceKindLabel(card.kind))}</span>
                  <em>${escapeHtml(viewLabel(card.view || "actions"))}</em>
                </div>
                <strong>${escapeHtml(card.title || "Sinal operacional")}</strong>
                <p>${escapeHtml(card.impact || card.body || "")}</p>
                ${
                  (card.evidence || []).length
                    ? `<ul>${card.evidence.slice(0, 2).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                    : ""
                }
                <button class="text-button" type="button" data-view-target="${escapeAttr(card.view || "actions")}">${escapeHtml(card.next_step || "Abrir contexto")}</button>
              </article>
            `).join("")
          : `<div class="empty-state action-empty">Sem sinais cruzados por enquanto.</div>`
      }
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function renderActionsHero(payload = {}) {
  const summary = payload.summary || {};
  const actions = payload.actions || [];
  const top = actions[0] || {};
  const urgent = actions.filter((row) => Number(row.priority || 9) <= 2).length;
  const purchaseValue = actions
    .filter((row) => ["quote_create", "quote_send", "quote_response", "purchase_order_confirm"].includes(row.action_type))
    .reduce((sum, row) => sum + Number(row.estimated_value || 0), 0);
  const headline = top.title || "Sem decisão crítica agora";
  const body = top.body || `A mesa está limpa. Conforme dados, cotações e contatos avançarem, o ${appName()} volta a priorizar a rotina.`;
  document.querySelector("#actionsHero").innerHTML = `
    <div class="today-hero-main tone-${escapeAttr(actionTone(top))}">
      <span class="today-kicker">${escapeHtml(actionAreaLabel(top))}</span>
      <h2>${escapeHtml(headline)}</h2>
      <p>${escapeHtml(body)}</p>
      <div class="today-evidence">
        <span><i data-lucide="target"></i>${escapeHtml(actionEntityText(top))}</span>
        <span><i data-lucide="circle-alert"></i>${number(urgent)} para agir hoje</span>
        <span><i data-lucide="banknote"></i>${compactMoney(summary.open_estimated_value || 0)} em pauta</span>
      </div>
      ${
        top.id
          ? `<div class="today-actions">
              <button class="action-button resolve-action" type="button" data-action-id="${escapeAttr(top.id)}">${escapeHtml(actionPrimaryLabel(top))}</button>
              <button class="secondary-button explain-action" type="button" data-action-id="${escapeAttr(top.id)}">Entender motivo</button>
            </div>`
          : ""
      }
    </div>
    <div class="today-hero-side">
      <article>
        <span>Fila viva</span>
        <strong>${number(summary.open || 0)}</strong>
        <em>${number(summary.in_progress || 0)} em andamento</em>
      </article>
      <article>
        <span>Comprar</span>
        <strong>${compactMoney(purchaseValue)}</strong>
        <em>valor em cotações e pedidos</em>
      </article>
      <article>
        <span>Memória</span>
        <strong>${number(summary.completed || 0)}</strong>
        <em>ação(ões) concluídas</em>
      </article>
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function actionPrimaryLabel(row) {
  return {
    supplier_config: "Informar pedido mínimo",
    supplier_confirm: "Confirmar fornecedor",
    product_mix_decision: "Decidir mix",
    quote_create: "Gerar cotação",
    quote_send: "Abrir cotação",
    quote_response: "Registrar resposta",
    purchase_order_confirm: "Confirmar pedido",
    customer_contact: "Abrir cliente",
    product_investigate: "Investigar",
  }[row.action_type] || "Resolver";
}

function actionImpactText(row) {
  const value = Number(row.estimated_value || 0);
  const monetaryActions = new Set(["quote_create", "quote_send", "quote_response", "purchase_order_confirm", "customer_contact", "product_investigate"]);
  if (value > 0 && monetaryActions.has(row.action_type)) return `${row.impact_label || "Impacto estimado"} - ${money(value)}`;
  return row.impact_label || "Rotina mais clara";
}

function actionRows(rows = []) {
  if (!rows.length) {
    return `<div class="empty-state action-empty">Nada urgente agora. Conforme importações, cotações e contatos avançarem, novas ações aparecem aqui.</div>`;
  }
  return rows
    .map(
      (row) => {
        const skillLabel = row.metadata?.skill_label || "";
        const active = row.id === state.selectedActionId ? " active" : "";
        const tone = actionTone(row);
        return `
        <article class="action-card action-row priority-${Number(row.priority || 3)} tone-${escapeAttr(tone)}${active}" data-action-id="${escapeAttr(row.id)}">
          <div class="action-topline">
            <span class="status-chip ${escapeAttr(tone)}">${escapeHtml(actionToneLabel(row))}</span>
            <small>${escapeHtml(actionAreaLabel(row))} - P${number(row.priority)}</small>
          </div>
          <button class="action-row-main" type="button" data-select-action>
            ${skillLabel ? `<span class="skill-line">${escapeHtml(skillLabel)}</span>` : ""}
            <strong>${escapeHtml(row.title)}</strong>
            <span>${escapeHtml(row.body)}</span>
          </button>
          <div class="action-row-meta">
            <span>${escapeHtml(actionEntityText(row))}</span>
            <strong>${escapeHtml(actionImpactText(row))}</strong>
          </div>
          <span class="save-state" aria-live="polite"></span>
        </article>
      `;
      },
    )
    .join("");
}

function timelineKindLabel(kind) {
  return {
    import: "Dados",
    quote: "Cotação",
    purchase_order: "Pedido",
    decision: "Decisão",
    action: "Ação",
    audit: "Registro",
  }[kind] || "Evento";
}

function timelineIcon(kind) {
  return {
    import: "database",
    quote: "send",
    purchase_order: "package-check",
    decision: "check-circle-2",
    action: "list-checks",
    audit: "history",
  }[kind] || "circle";
}

function timelineCards(rows = []) {
  if (!rows.length) {
    return `<div class="empty-state action-empty">Sem linha do tempo ainda. Importações, cotações, pedidos e decisões futuras aparecerão aqui.</div>`;
  }
  return rows
    .map(
      (row) => `
        <article class="timeline-item tone-${escapeAttr(row.tone || "muted")}">
          <div class="timeline-marker"><i data-lucide="${escapeAttr(timelineIcon(row.kind))}"></i></div>
          <div class="timeline-copy">
            <div class="timeline-topline">
              <span>${escapeHtml(timelineKindLabel(row.kind))}</span>
              <time>${escapeHtml(shortDateTime(row.occurred_at))}</time>
            </div>
            <strong>${escapeHtml(row.title || "Evento operacional")}</strong>
            <p>${escapeHtml(row.body || "")}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function actionDetail(action) {
  if (!action) {
    return `
      <div class="action-detail-empty">
        <strong>Nenhuma ação selecionada</strong>
        <span>Quando a fila estiver vazia, o ${escapeHtml(appName())} volta para acompanhamento e aprendizado.</span>
      </div>
    `;
  }
  const metadata = action.metadata || {};
  const evidence = [
    ["Área", actionAreaLabel(action)],
    ["Entidade", actionEntityText(action)],
    ["Prioridade", `P${number(action.priority)}`],
    ["Status", actionStatusText(action.status)],
    ["Impacto", actionImpactText(action)],
  ];
  if (action.due_date) evidence.push(["Prazo", action.due_date]);
  if (metadata.skill_label) evidence.push(["Skill", metadata.skill_label]);
  if (metadata.rule_id) evidence.push(["Regra", metadata.rule_id]);
  return `
    <div class="action-detail-head">
      <span class="status-chip ${escapeAttr(actionTone(action))}">${escapeHtml(actionToneLabel(action))}</span>
      <h3>${escapeHtml(action.title)}</h3>
      <p>${escapeHtml(action.body)}</p>
    </div>
    <dl class="action-detail-list">
      ${evidence.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
    </dl>
    <section class="action-detail-reason">
      <strong>Por que agora</strong>
      <p>${escapeHtml(action.reason || "Sem justificativa adicional.")}</p>
    </section>
    <div class="action-detail-actions" data-action-id="${escapeAttr(action.id)}">
      <button class="action-button resolve-action" type="button">${escapeHtml(actionPrimaryLabel(action))}</button>
      <button class="secondary-button explain-action" type="button">Ver evidencias</button>
    </div>
    <span class="save-state" aria-live="polite"></span>
  `;
}

function renderActions(payload) {
  renderActionsHero(payload);
  renderTodayPulse(payload);
  renderIntelligenceRadar(payload);
  renderActionsSummary(payload.summary || {});
  const rows = payload.actions || [];
  if (!rows.some((row) => row.id === state.selectedActionId)) state.selectedActionId = rows[0]?.id || "";
  document.querySelector("#actionsBoard").innerHTML = actionRows(rows);
  document.querySelector("#actionDetail").innerHTML = actionDetail(rows.find((row) => row.id === state.selectedActionId));
  document.querySelector("#actionsHistory").innerHTML = timelineCards(payload.timeline || []);
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
  if (state.skills) renderEngine(state.skills, payload);
}

async function refreshActions() {
  const actions = await apiContract("/api/actions/today", "actions_today.v1");
  state.actions = actions;
  renderActions(actions);
  renderNavBadges();
}

function deferAfterPaint(callback, delay = 0) {
  window.setTimeout(() => {
    window.requestAnimationFrame(() => callback());
  }, delay);
}

function queueRefreshAfterSave(tasks = {}, options = {}) {
  Object.entries(tasks).forEach(([key, enabled]) => {
    if (enabled) state.postSaveRefreshTasks[key] = true;
  });
  if (options.preserveQuoteScroll) state.postSaveRefreshOptions.preserveQuoteScroll = true;
  if (state.postSaveRefreshTimer) clearTimeout(state.postSaveRefreshTimer);
  state.postSaveRefreshTimer = setTimeout(() => {
    const pending = { ...state.postSaveRefreshTasks };
    const pendingOptions = { ...state.postSaveRefreshOptions };
    state.postSaveRefreshTasks = {};
    state.postSaveRefreshOptions = {};
    state.postSaveRefreshTimer = null;
    refreshAfterSave(pending, {
      defer: true,
      delay: options.deferDelay || 0,
      preserveQuoteScroll: pendingOptions.preserveQuoteScroll,
    });
  }, options.delay ?? 900);
}

function refreshAfterSave(tasks = {}, options = {}) {
  if (options.coalesce) {
    queueRefreshAfterSave(tasks, options);
    return;
  }
  const run = () => {
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
    if (tasks.quotes) work.push(refreshQuotes({ preserveScroll: options.preserveQuoteScroll }));
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
  };
  if (options.defer) {
    deferAfterPaint(run, options.delay || 0);
    return;
  }
  run();
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
    ["Ações atuais", number(actions.length), "green"],
    ["Versao", skillsPayload.schema_version || "", ""],
    ["Produto", skillsPayload.product || appName(), "blue"],
  ];
  document.querySelector("#engineSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderTrustLegend() {
  const items = [
    ["ERP/importado", `Canonico externo e read-only no ${appName()}.`, "imported"],
    ["Inferido", `Sugerido pelo ${appName()} com confiança limitada até confirmação.`, "inferred"],
    [`Confirmado no ${appName()}`, `Configuração operacional manual e canônica no ${appName()}.`, "manual"],
    ["Decisão operacional", "Escolha do gestor que não deve ser sobrescrita pelo ERP.", "decision"],
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
          <p>${number(counts[skill.id] || 0)} ação(ões) atuais</p>
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

function explainAction(button) {
  const action = actionFromButton(button);
  if (!action) return;
  openModal(
    "Detalhes da sugestão",
    `
      <div class="why-panel why-panel-modal">${whyContent(action)}</div>
      <div class="modal-actions split-actions">
        <button class="text-button" type="button" id="actionIgnore">Ignorar sugestão</button>
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
    `Pedido mínimo de ${row.supplier_name}`,
    `
      <div class="modal-context">
        <strong>${escapeHtml(row.supplier_name)}</strong>
        <span>${number(matches.length)} marca(s), ${number(productCount || row.product_count)} produtos vinculados, ${money(revenue || row.revenue)} em receita historica.</span>
      </div>
      <label class="modal-field">
        <span>Qual é o pedido mínimo?</span>
        <input class="inline-input important-input" id="supplierProfileMinimumInput" inputmode="decimal" value="${inputValue(row.minimum_order_value || "")}" placeholder="Ex: 800,00" autofocus />
      </label>
      <label class="modal-field">
        <span>Telefone para cotação, opcional</span>
        <input class="inline-input" id="supplierProfilePhoneInput" value="${inputValue(row.contact_phone)}" placeholder="(00) 00000-0000" />
      </label>
      <div class="modal-preview warn">Com esse valor, o ${escapeHtml(appName())} ajusta quando vale formar pedido e quando é melhor esperar acumular mais itens do fornecedor.</div>
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
          save.textContent = "Informe um pedido mínimo maior que zero.";
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
          await apiPost("/api/actions/status", { id: action.id, status: "completed" });
          closeModal();
          deferAfterPaint(() => {
            renderSuppliers();
            renderNavBadges();
            refreshAfterSave({ suppliers: true, replenishment: true, quotes: true, actions: true, maturity: true }, { defer: true, delay: 250 });
          });
        } catch (error) {
          save.textContent = error.message;
        }
      });
    },
  );
}

function openSupplierProfileModal(supplierId) {
  if (!supplierId) {
    setSupplierMode("operational");
    setSupplierTableSearch("");
    setSupplierTableStatus("missing_supplier");
    document.querySelector("#suppliersTableMount")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const group = supplierGroups().find((item) => item.supplier_id === supplierId);
  if (!group) {
    setSupplierMode("operational");
    setSupplierTableStatus("missing_supplier");
    document.querySelector("#suppliersTableMount [data-dt-search]")?.focus();
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
        <span>Pedido mínimo</span>
        <input class="inline-input important-input" id="supplierGroupMinimumInput" inputmode="decimal" value="${inputValue(group.minimum_order_value || "")}" placeholder="Ex: 800,00" />
      </label>
      <label class="modal-field">
        <span>Pedido alvo</span>
        <input class="inline-input" id="supplierGroupTargetInput" inputmode="decimal" value="${inputValue(group.target_order_value || "")}" placeholder="Ex: 1500,00" />
      </label>
      <label class="modal-field">
        <span>Nome do contato</span>
        <input class="inline-input" id="supplierGroupContactNameInput" value="${inputValue(group.contact_name)}" placeholder="Compras / vendedor / representante" />
      </label>
      <label class="modal-field">
        <span>Telefone para cotação</span>
        <input class="inline-input" id="supplierGroupPhoneInput" value="${inputValue(group.contact_phone)}" placeholder="(00) 00000-0000" />
      </label>
      <label class="modal-field">
        <span>E-mail</span>
        <input class="inline-input" id="supplierGroupEmailInput" value="${inputValue(group.contact_email)}" placeholder="compras@fornecedor.com.br" />
      </label>
      <div class="modal-context">
        <div><span>Lead time medio</span><input class="inline-input" id="supplierGroupLeadInput" inputmode="numeric" value="${inputValue(group.average_lead_time_days || "")}" placeholder="dias" /></div>
        <div><span>Ciclo de revisão</span><input class="inline-input" id="supplierGroupCycleInput" inputmode="numeric" value="${inputValue(group.order_review_cycle_days || "")}" placeholder="dias" /></div>
        <div><span>Ajuste cobertura</span><input class="inline-input" id="supplierGroupCoverageInput" inputmode="numeric" value="${inputValue(group.target_coverage_adjustment_days || "")}" placeholder="+/- dias" /></div>
        <div>
          <span>Dificuldade</span>
          <select class="inline-input" id="supplierGroupDifficultyInput">
            <option value="auto" ${group.order_difficulty === "auto" ? "selected" : ""}>Automatica</option>
            <option value="easy" ${group.order_difficulty === "easy" ? "selected" : ""}>Facil</option>
            <option value="normal" ${group.order_difficulty === "normal" ? "selected" : ""}>Normal</option>
            <option value="hard" ${group.order_difficulty === "hard" ? "selected" : ""}>Dificil</option>
            <option value="unknown" ${group.order_difficulty === "unknown" ? "selected" : ""}>Desconhecida</option>
          </select>
        </div>
      </div>
      <label class="modal-field">
        <span>Observacoes</span>
        <textarea class="inline-input quick-note" id="supplierGroupNotesInput" rows="3" placeholder="Dias de pedido, representantes, restricoes, condicoes especiais...">${escapeHtml(group.supplier_notes || "")}</textarea>
      </label>
      <div class="modal-preview good">Essas informações alimentam cotação, pedido mínimo, prazo de reposição e rotina de compra por fornecedor.</div>
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
            contact_name: body.querySelector("#supplierGroupContactNameInput").value.trim(),
            contact_phone: body.querySelector("#supplierGroupPhoneInput").value.trim(),
            contact_email: body.querySelector("#supplierGroupEmailInput").value.trim(),
            minimum_order_value: body.querySelector("#supplierGroupMinimumInput").value.trim(),
            target_order_value: body.querySelector("#supplierGroupTargetInput").value.trim(),
            average_lead_time_days: body.querySelector("#supplierGroupLeadInput").value.trim(),
            order_review_cycle_days: body.querySelector("#supplierGroupCycleInput").value.trim(),
            target_coverage_adjustment_days: body.querySelector("#supplierGroupCoverageInput").value.trim(),
            order_difficulty: body.querySelector("#supplierGroupDifficultyInput").value,
            notes: body.querySelector("#supplierGroupNotesInput").value.trim(),
          });
          state.suppliers = state.suppliers.map((item) => item.supplier_id === result.supplier_id
            ? {
                ...item,
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
              }
            : item);
          closeModal();
          deferAfterPaint(() => {
            renderSuppliers();
            renderNavBadges();
            refreshAfterSave({ suppliers: true, replenishment: true, quotes: true, actions: true }, { defer: true, delay: 250 });
          });
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
  if (["quote_send", "quote_response"].includes(action.action_type) && action.target_id) {
    openQuoteFromAction(action);
    return;
  }
  if (action.action_type === "purchase_order_confirm" && action.target_id) {
    setView("quotes");
    openConfirmPurchaseOrderModal(action.target_id);
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
    const quote = await apiContract(`/api/quote?id=${encodeURIComponent(action.target_id)}`, "quote_detail.v1");
    if (quote?.supplier_id) await loadQuoteSupplierWorkbench(quote.supplier_id);
  } catch (error) {
    alert(error.message);
  }
}


