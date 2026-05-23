function renderPricingSummary(summary = {}) {
  const items = [
    ["Itens auditados", number(summary.products), "blue"],
    ["Margem crítica", number(summary.negative_margin), "amber"],
    ["Margem em atenção", number(summary.low_margin), "amber"],
    ["Dados incompletos", number(summary.missing_cost), ""],
    ["Sem sinal crítico", number(Math.max(0, Number(summary.products || 0) - Number(summary.negative_margin || 0) - Number(summary.low_margin || 0) - Number(summary.missing_cost || 0))), "green"],
  ];
  document.querySelector("#pricingSummary").innerHTML = items
    .map(([label, value, color]) => `<div class="kpi ${color}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function setPricingMode(mode) {
  setModuleMode({
    stateKey: "pricingMode",
    modeAttr: "data-pricing-mode",
    operationalSelector: "#pricingOperational",
    dashboardSelector: "#pricingDashboard",
  }, mode);
}

function pricingSeverityRank(row) {
  if (row.severity === "danger") return 0;
  if (row.severity === "warn") return 1;
  return 2;
}

function roleText(role) {
  return {
    normal: "Normal",
    ancora: "Ancora",
    commodity: "Commodity",
    marca_propria: "Marca própria",
  }[role] || "Normal";
}

function pricingMarginText(row = {}) {
  return row.margin_pct === null || row.margin_pct === undefined ? "-" : `${number(row.margin_pct)}%`;
}

function pricingReferenceText(row = {}) {
  if (!Number(row.target_price || 0) || !Number(row.effective_cost || 0)) return "-";
  return money(row.target_price);
}

function pricingDataConfidence(row = {}) {
  if (!Number(row.sale_price || 0) && !Number(row.effective_cost || 0)) return { label: "Sem preço e custo", tone: "danger" };
  if (!Number(row.sale_price || 0)) return { label: "Preço ausente", tone: "danger" };
  if (!Number(row.effective_cost || 0)) return { label: "Custo ausente", tone: "danger" };
  if (row.cost_origin === "manual") return { label: "Custo manual", tone: "info" };
  if (row.cost_origin === "erp") return { label: "Custo ERP", tone: "good" };
  return { label: "Base parcial", tone: "warn" };
}

function pricingEvidenceList(row = {}) {
  const evidence = [];
  if (!Number(row.sale_price || 0)) evidence.push("preço de venda não veio do ERP");
  if (!Number(row.effective_cost || 0)) evidence.push("custo não veio do ERP nem da configuração manual");
  if (row.margin_pct !== null && row.margin_pct !== undefined) evidence.push(`margem estimada de ${pricingMarginText(row)}`);
  if (Number(row.revenue || 0) > 0) evidence.push(`${money(row.revenue)} de receita no período`);
  if (Number(row.quantity || 0) > 0) evidence.push(`${number(row.quantity)} unidade(s) vendidas`);
  if (Number(row.target_price || 0) > 0 && Number(row.sale_price || 0) > 0 && Number(row.target_price || 0) > Number(row.sale_price || 0)) {
    evidence.push(`referência técnica acima do preço ERP para a margem mínima configurada (${number(row.min_margin_pct || 0)}%)`);
  }
  return evidence;
}

function pricingNextCheck(row = {}) {
  if (row.signal === "sem_preco") return "Conferir preço de venda no ERP antes de avaliar margem.";
  if (row.signal === "sem_custo") return "Conferir custo no ERP ou registrar custo manual se a base estiver incompleta.";
  if (row.signal === "margem_negativa") return "Validar se custo e preço importados estão corretos; a decisão de preço continua no ERP.";
  if (row.signal === "margem_baixa") return "Revisar papel do produto e contexto comercial antes de qualquer mudança.";
  if (row.signal === "oportunidade") return "Avaliar posicionamento e mix; não há ação automática recomendada.";
  return "Acompanhar nas próximas importações.";
}

function pricingChartRows(items, valueFormatter = number) {
  return dashboardChartRows(items, {
    valueFormatter,
    rowClass: "pricing-chart-row",
    labelFor: (item) => item.label || item.name || "",
    attrsFor: (item) => item.product_id ? ` data-product-id="${escapeAttr(item.product_id)}"` : "",
  });
}

function pricingDashboardCharts(payload = state.pricing || {}) {
  const rows = payload.rows || [];
  const summary = payload.summary || {};
  const products = Number(summary.products || rows.length || 0);
  const negative = Number(summary.negative_margin || rows.filter((row) => row.severity === "danger").length);
  const low = Number(summary.low_margin || rows.filter((row) => row.severity === "warn").length);
  const missing = Number(summary.missing_cost || rows.filter((row) => !Number(row.sale_price || 0) || !Number(row.effective_cost || 0)).length);
  const opportunities = Number(summary.opportunities || rows.filter((row) => row.severity === "good").length);
  const okCount = Math.max(0, products - negative - low - missing);
  const healthPct = products ? (okCount / products) * 100 : 0;
  const margins = rows
    .map((row) => row.margin_pct)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  const avgMargin = margins.length ? margins.reduce((acc, value) => acc + value, 0) / margins.length : null;
  const impactRows = rows
    .filter((row) => Number(row.revenue || 0) > 0)
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 5)
    .map((row) => ({ label: row.name, value: Number(row.revenue || 0), product_id: row.product_id }));
  const referenceRows = rows
    .map((row) => {
      const delta = Math.max(0, Number(row.target_price || 0) - Number(row.sale_price || 0));
      return { label: row.name, value: delta * Number(row.quantity || 0), product_id: row.product_id };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const statusRows = [
    { label: "Margem negativa", value: negative },
    { label: "Margem baixa", value: low },
    { label: "Sem custo/preço", value: missing },
    { label: "Sem sinal crítico", value: okCount },
  ];
  const roleRows = Array.from(rows.reduce((map, row) => {
    const label = row.role_label || roleText(row.product_role) || "Sem papel";
    const item = map.get(label) || { label, value: 0 };
    item.value += 1;
    map.set(label, item);
    return map;
  }, new Map()).values()).sort((a, b) => b.value - a.value).slice(0, 5);
  const coverageRows = [
    { label: "Com custo e preço", value: Math.max(0, products - missing) },
    { label: "Sem base completa", value: missing },
  ];
  const insight = negative + low
    ? `${number(negative + low)} produto(s) têm evidência suficiente para uma conferência de margem.`
    : "A base atual não mostra sinal crítico de margem no período.";
  const charts = [
    `
      <article class="pricing-dashboard-card wide">
        <div>
          <span>Base auditável</span>
          <strong>${number(healthPct)}%</strong>
          <p>${number(okCount)} de ${number(products)} produto(s) sem sinal crítico no recorte.</p>
        </div>
        <div class="pricing-donut" style="--value:${Math.max(0, Math.min(100, healthPct))}"><span>${number(healthPct)}%</span></div>
      </article>
    `,
    `
      <article class="pricing-dashboard-card">
        <div>
          <span>Atenção de margem</span>
          <strong>${number(negative + low)}</strong>
          <p>${number(negative)} negativo(s), ${number(low)} baixo(s).</p>
        </div>
      </article>
    `,
    `
      <article class="pricing-dashboard-card">
        <div>
          <span>Margem média</span>
          <strong>${avgMargin === null ? "-" : `${number(avgMargin)}%`}</strong>
          <p>Calculada nos produtos com custo e preço disponíveis.</p>
        </div>
      </article>
    `,
    `
      <article class="pricing-chart-card">
        <header><span>Diagnóstico</span><strong>Sinais por tipo</strong></header>
        <div class="pricing-chart">${pricingChartRows(statusRows)}</div>
      </article>
    `,
    `
      <article class="pricing-chart-card">
        <header><span>Impacto</span><strong>Maior receita</strong></header>
        <div class="pricing-chart">${pricingChartRows(impactRows, compactMoney)}</div>
      </article>
    `,
    `
      <article class="pricing-chart-card">
        <header><span>Referência</span><strong>Diferença técnica estimada</strong></header>
        <div class="pricing-chart">${pricingChartRows(referenceRows.length ? referenceRows : [{ label: "Sem referência acima do ERP", value: 1 }], referenceRows.length ? compactMoney : number)}</div>
      </article>
    `,
    `
      <article class="pricing-chart-card">
        <header><span>Governança</span><strong>Cobertura da base</strong></header>
        <div class="pricing-chart">${pricingChartRows(coverageRows)}</div>
      </article>
    `,
    `
      <article class="pricing-chart-card">
        <header><span>Estratégia</span><strong>Papel dos produtos</strong></header>
        <div class="pricing-chart">${pricingChartRows(roleRows.length ? roleRows : [{ label: "Sem classificação", value: products || 1 }])}</div>
      </article>
    `,
    `
      <article class="pricing-dashboard-card wide">
        <div>
          <span>Leitura ${escapeHtml(appName())}</span>
          <strong>${number(opportunities)} item(ns) sem sinal crítico</strong>
          <p>${escapeHtml(insight)}</p>
        </div>
      </article>
    `,
  ];
  document.querySelector("#pricingDashboardCharts").innerHTML = charts.join("");
}

function pricingFocusRows(rows = []) {
  const focus = rows
    .filter((row) => row.severity === "danger" || row.severity === "warn" || row.severity === "good")
    .sort((a, b) => pricingSeverityRank(a) - pricingSeverityRank(b) || Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 6);
  if (!focus.length) {
    return `
      <div class="pricing-focus-card muted-card">
        <strong>Nenhuma evidência crítica agora</strong>
        <span>Quando a importação trouxer novos custos, preços ou vendas, esta fila mostra o que conferir primeiro.</span>
      </div>
    `;
  }
  return focus.map((row) => `
    <a class="pricing-focus-card" href="/precos?pricing_mode=dashboard&pricing_product_id=${encodeURIComponent(row.product_id)}" data-product-id="${escapeAttr(row.product_id)}">
      <span class="status-chip ${escapeAttr(row.severity)}">${escapeHtml(row.signal_label || "Revisar")}</span>
      <strong>${escapeHtml(row.name)}</strong>
      <span>${money(row.revenue)} no período - margem ${pricingMarginText(row)}</span>
      <em>${escapeHtml(row.reason || pricingNextCheck(row))}</em>
    </a>
  `).join("");
}

function pricingTone(row = {}) {
  if (row.severity === "danger") return "danger";
  if (row.severity === "warn") return "warn";
  if (!Number(row.sale_price || 0) || !Number(row.effective_cost || 0)) return "warn";
  if (Number(row.target_price || 0) > 0) return "info";
  if (row.severity === "good") return "good";
  return "muted";
}

function pricingDecisionLabel(row = {}) {
  const tone = pricingTone(row);
  if (tone === "danger") return "Dado crítico";
  if (tone === "warn") return "Conferir margem";
  if (tone === "info") return "Ver contexto";
  if (tone === "good") return "Sem sinal crítico";
  return "Acompanhar";
}

function pricingPriorityRows(rows = []) {
  return rows
    .slice()
    .sort((a, b) => (
      pricingSeverityRank(a) - pricingSeverityRank(b)
      || Number(b.target_price || 0) - Number(a.target_price || 0)
      || Number(b.revenue || 0) - Number(a.revenue || 0)
    ));
}

function pricingQueueRows(rows = []) {
  const queue = pricingPriorityRows(rows).slice(0, 14);
  if (!queue.length) {
    return `<div class="empty-state action-empty">Sem produtos para revisar no recorte atual.</div>`;
  }
  return queue.map((row) => {
    const tone = pricingTone(row);
    const active = row.product_id === state.selectedPricingProductId ? " active" : "";
    const confidence = pricingDataConfidence(row);
    return `
      <button class="pricing-queue-row tone-${escapeAttr(tone)}${active}" type="button" data-product-id="${escapeAttr(row.product_id)}">
        <span class="status-chip ${escapeAttr(tone)}">${escapeHtml(pricingDecisionLabel(row))}</span>
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(row.role_label || roleText(row.product_role))} - ${money(row.revenue)} no período</span>
        <em>Margem ${escapeHtml(pricingMarginText(row))} - ${escapeHtml(confidence.label)}</em>
      </button>
    `;
  }).join("");
}

function pricingInspector(row) {
  if (!row) {
    return `
      <div class="pricing-inspector-empty">
        <strong>Nenhum produto selecionado</strong>
        <span>A fila aparece quando existem vendas, custos ou preços importados para analisar.</span>
      </div>
    `;
  }
  const tone = pricingTone(row);
  const confidence = pricingDataConfidence(row);
  const evidence = pricingEvidenceList(row);
  const targetDelta = Math.max(0, Number(row.target_price || 0) - Number(row.sale_price || 0));
  const targetImpact = targetDelta * Number(row.quantity || 0);
  const facts = [
    ["Preço ERP", money(row.sale_price)],
    ["Custo efetivo", money(row.effective_cost)],
    ["Margem estimada", pricingMarginText(row)],
    ["Referência técnica", pricingReferenceText(row)],
    ["Receita período", money(row.revenue)],
    ["Quantidade", `${number(row.quantity)} un.`],
    ["Papel", row.role_label || roleText(row.product_role)],
    ["Confiança do dado", confidence.label],
  ];
  return `
    <div class="pricing-inspector-head tone-${escapeAttr(tone)}">
      <span class="status-chip ${escapeAttr(tone)}">${escapeHtml(pricingDecisionLabel(row))}</span>
      <h3>${escapeHtml(row.name)}</h3>
      <p>${escapeHtml(row.reason || "Produto sem observação adicional.")}</p>
    </div>
    <dl class="pricing-inspector-facts">
      ${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
    </dl>
    <section class="pricing-inspector-decision">
      <strong>Evidências</strong>
      <p>${evidence.map(escapeHtml).join(" · ") || "Sem evidência suficiente para leitura de margem."}</p>
      <span>${targetImpact > 0 ? `Diferença técnica estimada no período: ${money(targetImpact)}. Use apenas como referência, não como preço sugerido.` : "Sem diferença técnica calculada para este item."}</span>
    </section>
    <section class="pricing-inspector-decision">
      <strong>Próxima conferência</strong>
      <p>${escapeHtml(pricingNextCheck(row))}</p>
      <span>O ${escapeHtml(appName())} não altera preço de venda; a decisão e a execução continuam no ERP.</span>
    </section>
    <div class="pricing-inspector-actions">
      <button class="action-button" type="button" data-pricing-edit="${escapeAttr(row.product_id)}">Editar custo/papel</button>
      <button class="secondary-button" type="button" data-pricing-product="${escapeAttr(row.product_id)}">Ver mix</button>
    </div>
  `;
}

function pricingRows(rows = []) {
  if (!rows.length) {
    return `<tr><td colspan="9"><strong>Nada para analisar</strong><span class="muted-line">Sem venda ou preço importado no período selecionado.</span></td></tr>`;
  }
  return rows
    .map(
      (row) => `
        <tr class="clickable-row pricing-row" data-product-id="${escapeAttr(row.product_id)}">
          <td><span class="status-chip ${escapeAttr(row.severity)}">${escapeHtml(row.signal_label)}</span></td>
          <td>
            <strong class="product-name">${escapeHtml(row.name)}</strong>
            <span class="muted-line">código ${escapeHtml(productCode(row.source_code))} - ${number(row.quantity)} un.</span>
          </td>
          <td>${escapeHtml(row.role_label || roleText(row.product_role))}</td>
          <td class="num">${money(row.revenue)}</td>
          <td class="num">${money(row.sale_price)}<span class="muted-line">ERP importado</span></td>
          <td class="num">${money(row.effective_cost)}<span class="muted-line">${escapeHtml(row.cost_origin || "")}</span></td>
          <td class="num ${row.severity === "danger" ? "risk" : row.severity === "good" ? "ok" : ""}">${pricingMarginText(row)}</td>
          <td class="num">${pricingReferenceText(row)}<span class="muted-line">não é sugestão</span></td>
          <td>${escapeHtml(row.reason || "")}<span class="row-edit-hint">Clique para conferir custo e papel do produto</span></td>
        </tr>
      `,
    )
    .join("");
}

function renderPricing(payload) {
  state.pricing = payload;
  const rows = payload.rows || [];
  if (!rows.some((row) => row.product_id === state.selectedPricingProductId)) {
    state.selectedPricingProductId = pricingPriorityRows(rows)[0]?.product_id || "";
  }
  renderPricingSummary(payload.summary || {});
  pricingDashboardCharts(payload);
  document.querySelector("#pricingFocus").innerHTML = pricingFocusRows(rows);
  document.querySelector("#pricingQueue").innerHTML = pricingQueueRows(rows);
  document.querySelector("#pricingInspector").innerHTML = pricingInspector(rows.find((row) => row.product_id === state.selectedPricingProductId));
  document.querySelector("#pricingTable").innerHTML = pricingRows(rows);
}

function marginPreview(price, cost, role) {
  const min = { ancora: 5, commodity: 8, normal: 20, marca_propria: 30 }[role] || 20;
  if (!price || price <= 0) return { label: "Sem preço de venda importado do ERP", cls: "danger" };
  if (!cost || cost <= 0) return { label: "Informe custo para calcular margem", cls: "danger" };
  const margin = ((price - cost) / price) * 100;
  const targetPrice = cost / (1 - min / 100);
  if (margin < 0) return { label: `Margem ${number(margin)}% - confira custo e preço no ERP. Referência técnica para ${min}%: ${money(targetPrice)}`, cls: "danger" };
  if (margin < min) return { label: `Margem ${number(margin)}% - abaixo da margem mínima configurada (${min}%). Referência técnica: ${money(targetPrice)}`, cls: "warn" };
  return { label: `Margem ${number(margin)}% - sem sinal crítico para a margem mínima configurada (${min}%).`, cls: "good" };
}

function openPricingModal(productId) {
  const row = (state.pricing?.rows || []).find((item) => item.product_id === productId);
  if (!row) return;
  openModal(
    "Auditoria de margem",
    `
      <div class="modal-context">
        <strong>${escapeHtml(row.name)}</strong>
        <span>Preço ERP ${money(row.sale_price)} - somente leitura. O ${escapeHtml(appName())} organiza evidências, mas não define nem altera preço de venda.</span>
      </div>
      <div class="modal-preview muted">Use esta tela para corrigir custo local ou papel do produto quando a base importada estiver incompleta.</div>
      <label class="modal-field">
        <span>Custo manual no ${escapeHtml(appName())}</span>
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
          renderPricing(await apiContract(`/api/pricing${periodQuery()}`, "pricing.v1"));
          closeModal();
        } catch (error) {
          save.textContent = error.message;
        }
      });
    },
  );
}

