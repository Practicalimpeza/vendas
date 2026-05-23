function quoteFormulaReadSettings() {
  const root = document.querySelector("#quoteFormula");
  const current = { ...quoteFormulaDefaultSettings(), ...(state.quoteFormulaSettings || {}) };
  if (!root || !root.innerHTML.trim()) return current;
  const valueFor = (key) => root.querySelector(`[data-formula-input="${key}"]`);
  const numeric = (key) => parseInputNumber(valueFor(key)?.value ?? current[key]);
  return {
    abc: valueFor("abc")?.value || current.abc || "A",
    observedDays: numeric("observedDays"),
    qty30: numeric("qty30"),
    qty60: numeric("qty60"),
    qty90: numeric("qty90"),
    qty180: numeric("qty180"),
    qty365: numeric("qty365"),
    qtyAll: numeric("qtyAll"),
    saleDays180: numeric("saleDays180"),
    stdDaily: numeric("stdDaily"),
    leadTime: numeric("leadTime"),
    reviewCycle: numeric("reviewCycle"),
    minimumStock: numeric("minimumStock"),
    maximumStock: numeric("maximumStock"),
    stockUnits: numeric("stockUnits"),
    openOrder: numeric("openOrder"),
    packageSize: numeric("packageSize") || 1,
    maxSingleSale: numeric("maxSingleSale"),
    weight30: numeric("weight30"),
    weight60: numeric("weight60"),
    weight90: numeric("weight90"),
    weight180: numeric("weight180"),
    weight365: numeric("weight365"),
    trendBase: numeric("trendBase"),
    trendWeight: numeric("trendWeight"),
    trendMin: numeric("trendMin"),
    trendMax: numeric("trendMax"),
    totalHistoryFloor: numeric("totalHistoryFloor"),
    sparseSaleDayPct: numeric("sparseSaleDayPct"),
    sparseMinSaleDays: numeric("sparseMinSaleDays"),
    sparseRecentQty180Pct: numeric("sparseRecentQty180Pct"),
    sparseSingleSaleMultiplier: numeric("sparseSingleSaleMultiplier"),
    sparsePackageMultiplier: numeric("sparsePackageMultiplier"),
    sparseBurstMultiplier: numeric("sparseBurstMultiplier"),
    sparseNormalMultiplier: numeric("sparseNormalMultiplier"),
    sparse365Multiplier: numeric("sparse365Multiplier"),
    intermittentSaleDaysMax: numeric("intermittentSaleDaysMax"),
    intermittentMultiplier: numeric("intermittentMultiplier"),
  };
}

function quoteFormulaMath(settings = state.quoteFormulaSettings || quoteFormulaDefaultSettings()) {
  const abc = ["A", "B", "C"].includes(settings.abc) ? settings.abc : "A";
  const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
  const observedDays = Math.max(1, Number(settings.observedDays || 1));
  const qty30 = Math.max(0, Number(settings.qty30 || 0));
  const qty60 = Math.max(0, Number(settings.qty60 || 0));
  const qty90 = Math.max(0, Number(settings.qty90 || 0));
  const qty180 = Math.max(0, Number(settings.qty180 || 0));
  const qty365 = Math.max(0, Number(settings.qty365 || 0));
  const qtyAll = Math.max(0, Number(settings.qtyAll || 0));
  const saleDays180 = Math.max(0, Number(settings.saleDays180 || 0));
  const d30 = qty30 / Math.max(Math.min(30, observedDays), 1);
  const d60 = qty60 / Math.max(Math.min(60, observedDays), 1);
  const d90 = qty90 / Math.max(Math.min(90, observedDays), 1);
  const d180 = qty180 / Math.max(Math.min(180, observedDays), 1);
  const d365 = qty365 / Math.max(Math.min(365, observedDays), 1);
  const avgAll = qtyAll / observedDays;
  const w30 = Math.max(0, Number(settings.weight30 || 0)) / 100;
  const w60 = Math.max(0, Number(settings.weight60 || 0)) / 100;
  const w90 = Math.max(0, Number(settings.weight90 || 0)) / 100;
  const w180 = Math.max(0, Number(settings.weight180 || 0)) / 100;
  const w365 = Math.max(0, Number(settings.weight365 || 0)) / 100;
  const weightedDemand = (w30 * d30) + (w60 * d60) + (w90 * d90) + (w180 * d180) + (w365 * d365);
  const trendIndex = d365 > 0 ? d90 / d365 : (d90 > 0 ? 1.4 : 1.0);
  const trendFactor = clampValue(
    Number(settings.trendBase || 0) + (trendIndex * Number(settings.trendWeight || 0)),
    Number(settings.trendMin || 0.75),
    Number(settings.trendMax || 1.25),
  );
  const historyFloor = avgAll * (Math.max(0, Number(settings.totalHistoryFloor || 0)) / 100);
  let dailyDemand = Math.max(weightedDemand * trendFactor, historyFloor);
  const stdDaily = Math.max(0, Number(settings.stdDaily || 0));
  const leadTime = Math.max(0, Number(settings.leadTime || 0));
  const reviewCycle = Math.max(0, Number(settings.reviewCycle || 0));
  const packageSize = Math.max(1, Number(settings.packageSize || 1));
  const minimumStock = Math.max(0, Number(settings.minimumStock || 0));
  const maximumStock = Math.max(0, Number(settings.maximumStock || 0));
  const stockUnits = Math.max(0, Number(settings.stockUnits || 0));
  const openOrder = Math.max(0, Number(settings.openOrder || 0));
  const horizon180 = Math.min(180, observedDays);
  const sparseLimitDays = Math.max(Number(settings.sparseMinSaleDays || 6), Math.ceil(horizon180 * (Number(settings.sparseSaleDayPct || 8) / 100)));
  const sparseDemand = qty180 > 0 && saleDays180 <= sparseLimitDays;
  const recentBurst = sparseDemand && qty30 >= Math.max(
    qty180 * (Number(settings.sparseRecentQty180Pct || 60) / 100),
    Number(settings.maxSingleSale || 0) * Number(settings.sparseSingleSaleMultiplier || 3),
    packageSize * Number(settings.sparsePackageMultiplier || 6),
  );
  let sparseForecastCap = 0;
  let guardrail = false;
  if (sparseDemand) {
    sparseForecastCap = Math.max(
      d180 * (recentBurst ? Number(settings.sparseBurstMultiplier || 1.25) : Number(settings.sparseNormalMultiplier || 1.10)),
      d365 * Number(settings.sparse365Multiplier || 1.35),
      Number(settings.maxSingleSale || 0) / 30,
    );
    if (dailyDemand > sparseForecastCap && sparseForecastCap > 0) {
      dailyDemand = sparseForecastCap;
      guardrail = true;
    }
    guardrail = true;
  }
  const intermittent = saleDays180 <= Number(settings.intermittentSaleDaysMax || 4) && qty180 > 0;
  if (intermittent) dailyDemand = Math.min(dailyDemand, Math.max(d180, avgAll) * Number(settings.intermittentMultiplier || 0.85));
  const packageCoverageDays = dailyDemand > 0 && packageSize > 1 ? packageSize / dailyDemand : 0;
  const productRebuyDays = Math.round(clampValue(Math.max(reviewCycle, packageCoverageDays), Math.max(reviewCycle, 1), 120));
  const serviceZ = { A: 1.65, B: 1.28, C: 0.84 }[abc];
  const stdCapMultiplier = sparseDemand ? 0.85 : 1.5;
  const effectiveStdDaily = dailyDemand > 0 ? Math.min(stdDaily, dailyDemand * stdCapMultiplier) : 0;
  const protectionDays = leadTime + reviewCycle;
  const receiptCoverageDays = productRebuyDays;
  const orderHorizonDays = leadTime + receiptCoverageDays;
  let safetyStock = serviceZ * effectiveStdDaily * Math.sqrt(Math.max(protectionDays, 1));
  if (intermittent) safetyStock *= 0.55;
  let reorderPoint = (dailyDemand * protectionDays) + safetyStock + minimumStock;
  let orderUpTo = (dailyDemand * orderHorizonDays) + safetyStock + minimumStock;
  let evidenceCapUnits = 0;
  if (sparseDemand) {
    evidenceCapUnits = Math.max(packageSize, Number(settings.maxSingleSale || 0) * 2, qty90 * 0.55, qty180 * 0.40);
    if (orderUpTo > evidenceCapUnits) {
      orderUpTo = evidenceCapUnits;
      guardrail = true;
    }
    reorderPoint = Math.min(reorderPoint, orderUpTo);
  }
  if (maximumStock > 0) {
    orderUpTo = Math.min(orderUpTo, maximumStock);
    reorderPoint = Math.min(reorderPoint, orderUpTo);
  }
  const projectedStock = stockUnits + openOrder;
  const rawNeed = Math.max(orderUpTo - projectedStock, 0);
  const coverageDays = dailyDemand > 0 ? stockUnits / dailyDemand : null;
  const projectedCoverageDays = dailyDemand > 0 ? projectedStock / dailyDemand : null;
  const urgent = dailyDemand > 0 && projectedStock <= dailyDemand * Math.max(leadTime, 1);
  const buyNow = dailyDemand > 0 && projectedStock <= reorderPoint;
  const watch = dailyDemand > 0 && projectedCoverageDays !== null && projectedCoverageDays <= receiptCoverageDays;
  const roundedQuantity = roundToPackage(rawNeed, packageSize);
  const packageTargetRatio = packageSize / Math.max(orderUpTo, 1);
  const packageExcessUnits = Math.max(roundedQuantity - rawNeed, 0);
  const packageReviewRequired = rawNeed > 0 && packageSize > Math.max(orderUpTo, 1) * 1.5;
  const packageBlocksAuto = rawNeed > 0 && packageSize >= Math.max(orderUpTo, 1) * 3;
  const packageAutoAllowed = abc === "A" || urgent;
  const suggestedQuantity = rawNeed > 0 && (urgent || buyNow) && (!packageReviewRequired || packageAutoAllowed)
    ? roundedQuantity
    : 0;
  const status = dailyDemand <= 0
    ? "Sem demanda"
    : rawNeed <= 0 ? "OK"
      : packageReviewRequired && !packageAutoAllowed ? "Revisar caixa"
        : urgent ? "Urgente"
          : buyNow ? "Comprar agora"
        : watch ? "Observar"
          : projectedStock > Math.max(orderUpTo * 1.8, dailyDemand * 120) ? "Excesso"
            : "OK";
  return {
    abc,
    dailyDemand,
    stdDaily,
    leadTime,
    reviewCycle,
    packageSize,
    packageCoverageDays,
    productRebuyDays,
    observedDays,
    qty30,
    qty60,
    qty90,
    qty180,
    qty365,
    qtyAll,
    saleDays180,
    d30,
    d60,
    d90,
    d180,
    d365,
    avgAll,
    weightedDemand,
    trendIndex,
    trendFactor,
    historyFloor,
    sparseLimitDays,
    sparseForecastCap,
    recentBurst,
    protectionDays,
    receiptCoverageDays,
    orderHorizonDays,
    serviceZ,
    stdCapMultiplier,
    effectiveStdDaily,
    safetyStock,
    reorderPoint,
    orderUpTo,
    evidenceCapUnits,
    projectedStock,
    rawNeed,
    roundedQuantity,
    packageExcessUnits,
    packageTargetRatio,
    packageReviewRequired,
    packageBlocksAuto,
    packageAutoAllowed,
    coverageDays,
    projectedCoverageDays,
    suggestedQuantity,
    status,
    guardrail,
    minimumStock,
    maximumStock,
    stockUnits,
    openOrder,
    sparseDemand,
    intermittent,
  };
}

function quoteFormulaFields(settings) {
  const formulaInputValue = (value) => {
    if (typeof value === "number" && !Number.isInteger(value)) return inputValue(String(value).replace(".", ","));
    return inputValue(value);
  };
  const field = (key, label, hint, attrs = "") => `
    <label class="formula-field">
      <span>${escapeHtml(label)}</span>
      <input class="inline-input" type="text" inputmode="decimal" data-formula-input="${escapeAttr(key)}" value="${formulaInputValue(settings[key])}" ${attrs} />
      <em>${escapeHtml(hint)}</em>
    </label>
  `;
  return `
    <div class="formula-control-grid">
      <label class="formula-field">
        <span>Classe ABC</span>
        <select class="inline-input" data-formula-input="abc">
          ${["A", "B", "C"].map((abc) => `<option value="${abc}" ${settings.abc === abc ? "selected" : ""}>${abc}</option>`).join("")}
        </select>
        <em>ABC define o nível de segurança; o horizonte vem do fornecedor e da embalagem.</em>
      </label>
      ${field("observedDays", "Dias observados", "Período real com venda importada.")}
      ${field("qty30", "Venda 30d", "Vira média diaria e pesa 30% no padrão.")}
      ${field("qty60", "Venda 60d", "Vira média diaria e pesa 25% no padrão.")}
      ${field("qty90", "Venda 90d", "Vira média diaria, pesa 20% e ajusta tendência vs 365d.")}
      ${field("qty180", "Venda 180d", "Vira média diaria, pesa 15% e ativa guardas de demanda esparsa.")}
      ${field("qty365", "Venda 365d", "Vira média diaria, pesa 10% e ancora tendência.")}
      ${field("qtyAll", "Venda total", "Piso: demanda historica total x 65%.")}
      ${field("saleDays180", "Dias com venda em 180d", "Define demanda esparsa/intermitente.")}
      ${field("stdDaily", "Variação diaria", "Oscilação diaria usada no estoque de segurança.")}
      ${field("leadTime", "Prazo fornecedor", "Dias até a reposição chegar.")}
      ${field("reviewCycle", "Ciclo de revisão", "Dias até a próxima rodada de compra.")}
      ${field("minimumStock", "Estoque mínimo manual", "Soma fixa ao ponto e ao alvo.")}
      ${field("maximumStock", "Estoque máximo manual", "0 deixa sem teto. Acima de 0 limita o alvo.")}
      ${field("stockUnits", "Estoque ERP", "Unidades atualmente em estoque.")}
      ${field("openOrder", "Pedido em aberto", "Unidades já compradas e ainda não recebidas.")}
      ${field("packageSize", "Embalagem", "A compra viável arredonda para múltiplo desta quantidade.")}
      ${field("maxSingleSale", "Maior venda unica", "Usado so quando a demanda e esparsa.")}
    </div>
    <div class="formula-tuning">
      <strong>Pesos e travas ajustaveis</strong>
      <div class="formula-mini-grid">
        ${field("weight30", "Peso 30d (%)", "Padrão 30")}
        ${field("weight60", "Peso 60d (%)", "Padrão 25")}
        ${field("weight90", "Peso 90d (%)", "Padrão 20")}
        ${field("weight180", "Peso 180d (%)", "Padrão 15")}
        ${field("weight365", "Peso 365d (%)", "Padrão 10")}
        ${field("trendBase", "Base tendência", "Padrão 0,85")}
        ${field("trendWeight", "Peso tendência", "Padrão 0,15")}
        ${field("trendMin", "Tend. min.", "Trava 0,75x")}
        ${field("trendMax", "Tend. max.", "Trava 1,25x")}
        ${field("totalHistoryFloor", "Piso hist. (%)", "Padrão 65")}
        ${field("sparseSaleDayPct", "Esparsa % 180d", "Padrão 8%")}
        ${field("sparseMinSaleDays", "Esparsa min. dias", "Padrão 6")}
        ${field("sparseRecentQty180Pct", "Rajada % 180d", "Padrão 60")}
        ${field("sparseSingleSaleMultiplier", "Rajada maior venda", "Padrão 3x")}
        ${field("sparsePackageMultiplier", "Rajada embalagem", "Padrão 6x")}
        ${field("sparseBurstMultiplier", "Cap rajada", "Padrão 1,25x d180")}
        ${field("sparseNormalMultiplier", "Cap esparsa", "Padrão 1,10x d180")}
        ${field("sparse365Multiplier", "Cap 365d", "Padrão 1,35x d365")}
        ${field("intermittentSaleDaysMax", "Intermitente dias", "Padrão <= 4")}
        ${field("intermittentMultiplier", "Corte intermitente", "Padrão 0,85x")}
      </div>
    </div>
  `;
}

function quoteFormulaOutputs(math) {
  const settings = { ...quoteFormulaDefaultSettings(), ...(state.quoteFormulaSettings || {}) };
  const coverageText = math.coverageDays === null ? "-" : `${number(math.coverageDays)}d`;
  const projectedCoverageText = math.projectedCoverageDays === null ? "-" : `${number(math.projectedCoverageDays)}d`;
  const maxText = math.maximumStock > 0 ? number(math.maximumStock) : "sem teto";
  const evidenceText = math.sparseDemand ? number(math.evidenceCapUnits) : "não aplicado";
  const suggestedPct = math.orderUpTo > 0 ? Math.min(100, (math.projectedStock / math.orderUpTo) * 100) : 0;
  return `
    <section class="formula-hero panel">
      <div>
        <span>Formula padrão de compras</span>
        <h2>Previsão de demanda -> ponto de pedido -> alvo -> sugestão</h2>
        <p>O ${escapeHtml(appName())} primeiro estima quantas unidades o produto consome por dia. Depois transforma esse ritmo em alvo técnico de estoque e confere se a embalagem do fornecedor torna a compra viável.</p>
      </div>
      <div class="formula-status">
        <span>Status simulado</span>
        <strong>${escapeHtml(math.status)}</strong>
        <em>${math.guardrail ? "Com guarda-corpo ativo" : "Sem guarda-corpo ativo"}</em>
      </div>
    </section>
    <section class="formula-forecast panel">
      <header>
        <div>
          <span>1. Previsão de demanda</span>
          <strong>${number(math.dailyDemand)} un/dia</strong>
        </div>
        <em>max(média ponderada com tendência, histórico total x piso)</em>
      </header>
      <div class="formula-window-grid">
        <div><span>30d</span><strong>${number(math.d30)}/dia</strong><em>peso ${number(settings.weight30)}%</em></div>
        <div><span>60d</span><strong>${number(math.d60)}/dia</strong><em>peso ${number(settings.weight60)}%</em></div>
        <div><span>90d</span><strong>${number(math.d90)}/dia</strong><em>peso ${number(settings.weight90)}%</em></div>
        <div><span>180d</span><strong>${number(math.d180)}/dia</strong><em>peso ${number(settings.weight180)}%</em></div>
        <div><span>365d</span><strong>${number(math.d365)}/dia</strong><em>peso ${number(settings.weight365)}%</em></div>
      </div>
      <div class="formula-factor-grid">
        <div><span>Média ponderada</span><strong>${number(math.weightedDemand)}</strong></div>
        <div><span>Tendencia 90/365</span><strong>${number(math.trendIndex)}x</strong><em>fator ${number(math.trendFactor)}x</em></div>
        <div><span>Piso histórico</span><strong>${number(math.historyFloor)}</strong><em>${number(math.avgAll)}/dia x piso</em></div>
        <div><span>Demanda esparsa</span><strong>${math.sparseDemand ? "Sim" : "Não"}</strong><em>${number(math.saleDays180)} dia(s) venda / limite ${number(math.sparseLimitDays)}</em></div>
        <div><span>Rajada recente</span><strong>${math.recentBurst ? "Sim" : "Não"}</strong><em>ativa cap maior</em></div>
        <div><span>Intermitente</span><strong>${math.intermittent ? "Sim" : "Não"}</strong><em>reduz previsão e segurança</em></div>
      </div>
    </section>
    <section class="formula-flow">
      <article>
        <span>2</span>
        <strong>Ciclo calculado</strong>
        <p>Fornecedor ${number(math.reviewCycle)}d; 1 embalagem cobre ${number(math.packageCoverageDays)}d. Ciclo do item = <b>${number(math.productRebuyDays)}d</b></p>
      </article>
      <article>
        <span>3</span>
        <strong>Estoque de segurança</strong>
        <p>${number(math.serviceZ)} x ${number(math.effectiveStdDaily)} x raiz(${number(math.protectionDays)}) = <b>${number(math.safetyStock)}</b></p>
      </article>
      <article>
        <span>4</span>
        <strong>Ponto de pedido</strong>
        <p>${number(math.dailyDemand)} x ${number(math.protectionDays)}d de protecao + seg. + min. = <b>${number(math.reorderPoint)}</b></p>
      </article>
      <article>
        <span>5</span>
        <strong>Alvo de estoque</strong>
        <p>${number(math.dailyDemand)} x (${number(math.leadTime)}d prazo + ${number(math.receiptCoverageDays)}d ciclo calculado) + seg. + min. = <b>${number(math.orderUpTo)}</b></p>
      </article>
      <article>
        <span>6</span>
        <strong>Sugestão</strong>
        <p>Necessidade ${number(math.rawNeed)} -> caixa cheia ${number(math.roundedQuantity)}. Sugestão automatica = <b>${number(math.suggestedQuantity)}</b></p>
      </article>
    </section>
    <section class="formula-board panel">
      <div class="formula-equation">
        <strong>Conta completa</strong>
        <code>demanda_dia = max(((d30*${number(settings.weight30 / 100)})+(d60*${number(settings.weight60 / 100)})+(d90*${number(settings.weight90 / 100)})+(d180*${number(settings.weight180 / 100)})+(d365*${number(settings.weight365 / 100)})) * fator_tendência, média_total * ${number(settings.totalHistoryFloor / 100)})</code>
        <code>fator_tendência = limitar(${number(settings.trendBase)} + ((d90 / d365) * ${number(settings.trendWeight)}), ${number(settings.trendMin)}, ${number(settings.trendMax)})</code>
        <code>horizonte = prazo + max(ciclo_fornecedor, ciclo_produto_pela_embalagem)</code>
        <code>alvo = demanda_dia * horizonte + estoque_segurança + estoque_mínimo</code>
        <code>necessidade = max(alvo - (estoque_ERP + pedidos_abertos), 0)</code>
        <code>caixa_cheia = arredondar_para_embalagem(necessidade)</code>
        <code>sugestão = se compra estiver no ponto e embalagem for viavel, caixa_cheia; se caixa for grande demais, revisar antes de cotar</code>
      </div>
      <div class="formula-meter">
        <div><span style="width:${suggestedPct}%"></span></div>
        <small>Estoque projetado: ${number(math.projectedStock)} de ${number(math.orderUpTo)} no alvo</small>
      </div>
      <dl class="formula-result-grid">
        <div><dt>Cobertura atual</dt><dd>${escapeHtml(coverageText)}</dd></div>
        <div><dt>Cobertura projetada</dt><dd>${escapeHtml(projectedCoverageText)}</dd></div>
        <div><dt>Cob. pós-entrega</dt><dd>${number(math.receiptCoverageDays)}d</dd></div>
        <div><dt>Horizonte</dt><dd>${number(math.orderHorizonDays)}d</dd></div>
        <div><dt>Ponto de pedido</dt><dd>${number(math.reorderPoint)}</dd></div>
        <div><dt>Alvo até</dt><dd>${number(math.orderUpTo)}</dd></div>
        <div><dt>Necessidade bruta</dt><dd>${number(math.rawNeed)}</dd></div>
        <div><dt>Compra caixa cheia</dt><dd>${number(math.roundedQuantity)}</dd></div>
        <div><dt>Excesso da caixa</dt><dd>${number(math.packageExcessUnits)}</dd></div>
        <div><dt>Embalagem</dt><dd>${number(math.packageSize)}</dd></div>
        <div><dt>Caixa / alvo</dt><dd>${number(math.packageTargetRatio)}x</dd></div>
        <div><dt>Teto máximo</dt><dd>${escapeHtml(maxText)}</dd></div>
        <div><dt>Limite por evidencia</dt><dd>${escapeHtml(evidenceText)}</dd></div>
      </dl>
      <div class="formula-package-alert ${math.packageReviewRequired ? "warn" : "ok"}">
        <strong>${math.packageReviewRequired ? "Embalagem exige decisão" : "Embalagem compatível"}</strong>
        <span>${math.packageReviewRequired
          ? math.packageAutoAllowed
            ? "Como e classe A ou urgente, a regra permite comprar uma caixa minima, mas sinaliza o excesso."
            : "A caixa passa de 1,5x o alvo técnico. A sugestão automatica fica bloqueada para revisar cobertura, caixa ou compra sob demanda."
          : "A compra viável fica próxima do alvo técnico."}</span>
      </div>
    </section>
    <section class="formula-notes">
      <article>
        <strong>Quando vira compra</strong>
        <span>Urgente se o estoque projetado não cobre o prazo do fornecedor. Comprar agora se fica abaixo do ponto de pedido. Observar se cobre o ciclo calculado, mas ainda não justifica compra imediata.</span>
      </article>
      <article>
        <strong>Como personalizar</strong>
        <span>O operador ajusta embalagem, mínimo/máximo do produto e dados do fornecedor. O horizonte é recalculado pelo motor.</span>
      </article>
      <article>
        <strong>Guardas contra excesso</strong>
        <span>Demanda esparsa limita cobertura a 30 dias e pode travar o alvo pelo histórico de 90/180 dias. Estoque máximo manual também corta o alvo.</span>
      </article>
      <article>
        <strong>Alvo tecnico x caixa</strong>
        <span>Se o alvo é 3 e a caixa tem 12, a necessidade técnica continua sendo 3, mas a compra mínima vira 12. Itens não urgentes entram para decisão quando a caixa passa de 1,5x o alvo.</span>
      </article>
    </section>
  `;
}

function syncQuoteFormula() {
  const root = document.querySelector("#quoteFormula");
  if (!root) return;
  state.quoteFormulaSettings = quoteFormulaReadSettings();
  const math = quoteFormulaMath(state.quoteFormulaSettings);
  const target = root.querySelector("#quoteFormulaOutput");
  if (target) target.innerHTML = quoteFormulaOutputs(math);
}

function renderQuoteFormula() {
  const root = document.querySelector("#quoteFormula");
  if (!root) return;
  const settings = { ...quoteFormulaDefaultSettings(), ...(state.quoteFormulaSettings || {}) };
  root.innerHTML = `
    <section class="formula-layout">
      <aside class="formula-controls panel">
        <div class="formula-controls-head">
          <div>
            <span>Simulador</span>
            <strong>Variaveis da regra padrão</strong>
          </div>
          <button class="secondary-button" type="button" data-formula-reset>Resetar</button>
        </div>
        ${quoteFormulaFields(settings)}
      </aside>
      <div id="quoteFormulaOutput" class="formula-output"></div>
    </section>
  `;
  syncQuoteFormula();
}


