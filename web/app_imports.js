const IMPORT_STATUS_LABELS = {
  completed: "Concluido",
  pending: "Pendente",
  in_progress: "Em andamento",
  running: "Em andamento",
  failed: "Falhou",
  error: "Falhou",
  cancelled: "Cancelado",
};

function importStatusLabel(status) {
  if (!status) return "-";
  return IMPORT_STATUS_LABELS[String(status).toLowerCase()] || status;
}

function importStatusClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "completed") return "good";
  if (["failed", "error", "cancelled"].includes(value)) return "danger";
  if (["pending", "in_progress", "running"].includes(value)) return "warn";
  return "neutral";
}

function importBatchTitle(batch) {
  const source = batch.source_system ? String(batch.source_system).toUpperCase() : "Importação";
  const when = batch.started_at || batch.finished_at;
  return when ? `${source} / ${shortDateTime(when)}` : source;
}

function importBatchSummary(batch) {
  let summary = {};
  try { summary = JSON.parse(batch.summary_json || "{}"); } catch (_e) { summary = {}; }
  return summary;
}

function importBatchFileNames(batch) {
  const files = Array.isArray(batch.files) ? batch.files : [];
  if (files.length) return files.map((file) => file.file_name).filter(Boolean);
  const summary = importBatchSummary(batch);
  if (summary.file_name) return [summary.file_name];
  return [];
}

function importBatchMeta(batch) {
  const summary = importBatchSummary(batch);
  const mapped = Number(summary.mapped_rows || summary.rows || 0);
  const parts = [importStatusLabel(batch.status)];
  if (batch.source_period_start || batch.source_period_end) {
    parts.push(`Período ${shortDate(batch.source_period_start)} a ${shortDate(batch.source_period_end)}`);
  }
  if (mapped) parts.push(`${number(mapped)} linhas`);
  return parts.join(" / ");
}

function importBatchCounts(batch) {
  return importBatchCountItems(batch).join(" / ");
}

function importBatchCountItems(batch) {
  const summary = importBatchSummary(batch);
  const stats = batch.stats || {};
  const counts = [];
  const invRows = Number(stats.inventory_rows || summary.inventory_snapshots_imported || 0);
  const invProducts = Number(stats.inventory_products || summary.inventory_products_imported || 0);
  const priceRows = Number(stats.price_rows || summary.price_snapshots_imported || 0);
  const priceProducts = Number(stats.price_products || summary.price_products_imported || 0);
  const costRows = Number(stats.cost_rows || summary.cost_snapshots_imported || 0);
  const costProducts = Number(stats.cost_products || summary.cost_products_imported || 0);
  const productSalesRows = Number(stats.product_sales_rows || summary.product_sales_imported || 0);
  const productSalesProducts = Number(stats.product_sales_products || summary.product_sales_products_imported || 0);
  const serviceSalesRows = Number(stats.service_sales_rows || summary.service_sales_imported || 0);
  const serviceSalesServices = Number(stats.service_sales_services || summary.service_sales_services_imported || 0);
  const ids = Number(summary.identifiers_imported || 0);
  const settings = Number(summary.product_settings_imported || 0);
  const suppliers = Number(summary.supplier_profiles_imported || 0);
  const sourceProducts = Number(stats.source_product_codes || summary.product_codes_detected || 0);
  const sourceProductRows = Number(stats.source_product_code_rows || 0);
  if (sourceProducts) counts.push(`${number(sourceProducts)} produtos identificados${sourceProductRows && sourceProductRows !== sourceProducts ? ` em ${number(sourceProductRows)} linhas` : ""}`);
  if (invProducts || invRows) counts.push(`${number(invProducts || invRows)} produtos com estoque${invRows && invProducts && invRows !== invProducts ? ` (${number(invRows)} snapshots)` : ""}`);
  if (priceProducts || priceRows) counts.push(`${number(priceProducts || priceRows)} produtos com preço`);
  if (costProducts || costRows) counts.push(`${number(costProducts || costRows)} produtos com custo`);
  if (productSalesRows) counts.push(`${number(productSalesRows)} vendas de produto${productSalesProducts ? ` (${number(productSalesProducts)} produtos)` : ""}`);
  if (serviceSalesRows) counts.push(`${number(serviceSalesRows)} vendas de serviço${serviceSalesServices ? ` (${number(serviceSalesServices)} serviços)` : ""}`);
  if (summary.product_sales_duplicates) counts.push(`${number(summary.product_sales_duplicates)} vendas de produto já existentes`);
  if (summary.service_sales_duplicates) counts.push(`${number(summary.service_sales_duplicates)} vendas de serviço já existentes`);
  if (ids) counts.push(`${number(ids)} identificadores`);
  if (settings) counts.push(`${number(settings)} ajustes de produto`);
  if (suppliers) counts.push(`${number(suppliers)} fornecedores`);
  return counts;
}

function erpImportImpactText(summary = {}) {
  const parts = [];
  const productCodes = Number(summary.product_codes_detected || 0);
  const invProducts = Number(summary.inventory_products_imported || 0);
  const priceProducts = Number(summary.price_products_imported || 0);
  const costProducts = Number(summary.cost_products_imported || 0);
  const productSales = Number(summary.product_sales_imported || 0);
  const serviceSales = Number(summary.service_sales_imported || 0);
  if (productCodes) parts.push(`${number(productCodes)} produtos identificados`);
  if (invProducts) parts.push(`${number(invProducts)} produtos com estoque`);
  if (priceProducts) parts.push(`${number(priceProducts)} produtos com preço`);
  if (costProducts) parts.push(`${number(costProducts)} produtos com custo`);
  if (productSales) parts.push(`${number(productSales)} vendas de produto novas`);
  if (serviceSales) parts.push(`${number(serviceSales)} vendas de serviço novas`);
  if (summary.product_sales_duplicates) parts.push(`${number(summary.product_sales_duplicates)} vendas de produto já existiam`);
  if (summary.service_sales_duplicates) parts.push(`${number(summary.service_sales_duplicates)} vendas de serviço já existiam`);
  return parts.join(", ");
}


function erpFieldOptions(selected, options = []) {
  return options.map((option) => {
    const value = `${option.entity}:${option.field}`;
    return `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>`;
  }).join("");
}

function erpFieldOptionLookup(options = []) {
  return Object.fromEntries(options.map((option) => [`${option.entity}:${option.field}`, option]));
}

function erpFieldSupport(option = {}) {
  if (option.support === "operational") return { label: "Atualiza o sistema", cls: "good" };
  if (option.support === "raw_only") return { label: "Só registro bruto", cls: "neutral" };
  return { label: "Ignorado", cls: "warn" };
}

function erpFieldHelpMarkup(selected, lookup = {}) {
  const option = lookup[selected] || lookup["ignorar:ignorar"] || {};
  const support = erpFieldSupport(option);
  return `
    <span class="status-chip ${support.cls}">${support.label}</span>
    <span>${escapeHtml(option.usage || "Campo")} - ${escapeHtml(option.description || "Confira se esta coluna deve ser importada.")}</span>
  `;
}

function renderErpImportJourney(step = state.erpImportStep || "idle", detail = {}) {
  state.erpImportStep = step;
  const target = document.querySelector("#erpImportJourney");
  if (!target) return;
  const activeIndexByStep = {
    idle: 0,
    analyzing: 0,
    review: 1,
    conflict: 1,
    impact: 2,
    commit: 3,
    done: 3,
    error: 1,
  };
  const activeIndex = activeIndexByStep[step] ?? 0;
  const steps = [
    ["source", "Selecionar"],
    ["review", "Revisar"],
    ["impact", "Impacto"],
    ["commit", "Gravar"],
  ];
  const detailText = detail.text || (
    step === "idle" ? "Escolha um arquivo do ERP."
      : step === "analyzing" ? "Lendo estrutura e sugerindo mapeamento."
        : step === "review" ? "Confira campos críticos e efeito no sistema."
          : step === "conflict" ? "Resolva divergências antes de gravar."
            : step === "commit" ? "Gravando lote e recalculando cobertura."
          : step === "done" ? "Lote gravado e pronto para o próximo arquivo."
                : "Revise a importação."
  );
  target.innerHTML = `
    <div class="erp-stepper">
      ${steps.map(([id, label], index) => `
        <span class="erp-step ${index < activeIndex || step === "done" ? "done" : ""} ${index === activeIndex && step !== "done" ? "active" : ""}" data-step="${escapeAttr(id)}">
          <b>${number(index + 1)}</b>${escapeHtml(label)}
        </span>
      `).join("")}
    </div>
    <p>${escapeHtml(detailText)}</p>
  `;
}

function setErpImportProfile(profile) {
  state.erpImportProfile = profile === "operador" ? "operador" : "implantador";
  document.querySelectorAll("[data-erp-profile]").forEach((button) => {
    button.classList.toggle("active", button.dataset.erpProfile === state.erpImportProfile);
  });
  if (state.erpImportResult) {
    renderErpImportDone(state.erpImportResult);
  } else if (state.erpImport) {
    renderErpImportPreview(state.erpImport);
  }
}

function erpImportProfileCopy() {
  if (state.erpImportProfile === "operador") {
    return {
      label: "Modo guiado",
      body: "Mostra apenas o essencial para decidir se pode gravar ou se precisa revisar algo.",
      showFieldGuide: false,
    };
  }
  return {
    label: "Modo detalhado",
    body: "Mostra campos, efeitos e mapeamentos para diagnosticar uma nova origem.",
    showFieldGuide: true,
  };
}

function renderErpAssistantCard(assistant = {}) {
  const next = assistant.next_recommended_file || {};
  const missing = assistant.missing_critical || [];
  const rawOnly = assistant.raw_only_fields || [];
  const feeds = assistant.feeds || [];
  const lowConfidence = assistant.low_confidence_fields || [];
  const alignmentWarnings = assistant.alignment_warnings || [];
  const blocked = next.blocked_modules || [];
  const unlocks = next.unlocks || [];
  const notNow = next.not_now || [];
  const riskLabel = assistant.risk === "alto" ? "risco alto" : assistant.risk === "medio" ? "revisar" : "baixo risco";
  const riskClass = assistant.risk === "alto" ? "danger" : assistant.risk === "medio" ? "warn" : "good";
  if (state.erpImportProfile === "operador") {
    const alignment = alignmentWarnings[0] || {};
    const mainMessage = alignmentWarnings.length
      ? "Este arquivo parece ter linhas desalinhadas."
      : missing.length
        ? `${number(missing.length)} ponto(s) precisam de revisão antes de gravar.`
        : lowConfidence.length
          ? "Algumas colunas ficaram incertas. Confira o mapeamento antes de gravar."
          : "O arquivo foi lido e está pronto para conferência.";
    const guidanceText = alignmentWarnings.length
      ? (alignment.message || "Alguns valores parecem estar fora da coluna esperada. Confira os exemplos antes de gravar.")
      : "Confira se o sentido do arquivo está correto. Se algo parecer errado, abra as colunas reconhecidas e ajuste o mapeamento antes de gravar.";
    return `
      <section class="erp-assistant-card erp-assistant-simple">
        <div class="erp-assistant-head">
          <div>
            <span class="import-priority">Arquivo escolhido</span>
            <strong>${escapeHtml(assistant.title || "Planilha analisada")}</strong>
          </div>
          <span class="status-chip ${riskClass}">${escapeHtml(riskLabel)}</span>
        </div>
        <div class="erp-simple-next">
          <strong>${escapeHtml(mainMessage)}</strong>
          <p>${escapeHtml(guidanceText)}</p>
        </div>
        <div class="erp-simple-steps">
          <span>1. Arquivo lido</span>
          <span>2. Sentido conferido</span>
          <span>3. Gravação segura</span>
        </div>
        ${alignmentWarnings.length ? `
          <div class="erp-assistant-alert warn">
            <strong>O que conferir agora</strong>
            <span>Abra as colunas reconhecidas e compare os exemplos com os nomes das colunas. Se quantidade, valor, código ou data aparecerem no lugar errado, gere uma nova exportação ou ajuste o mapeamento antes de gravar.</span>
          </div>
        ` : ""}
        ${missing.length ? `<p>Antes de gravar, confira: ${escapeHtml(missing.slice(0, 4).map((item) => item.label || item.field).join(", "))}.</p>` : ""}
        ${lowConfidence.length ? `<p>Colunas incertas: ${escapeHtml(lowConfidence.slice(0, 6).join(", "))}.</p>` : ""}
      </section>
    `;
  }
  return `
    <section class="erp-assistant-card">
      <div class="erp-assistant-head">
        <div>
          <span class="import-priority">Assistente de importação - ${escapeHtml(erpImportProfileCopy().label)}</span>
          <strong>${escapeHtml(assistant.title || "Planilha analisada")}</strong>
        </div>
        <span class="status-chip ${riskClass}">${escapeHtml(riskLabel)}</span>
      </div>
      <div class="erp-assistant-grid">
        <div>
          <span>Essa planilha alimenta</span>
          <strong>${escapeHtml(feeds.length ? feeds.slice(0, 5).join(", ") : "auditoria do lote")}</strong>
        </div>
        <div>
          <span>Próxima recomendação</span>
          <strong>${escapeHtml(next.title || "Definir próximo arquivo")}</strong>
          ${next.why ? `<em>${escapeHtml(next.why)}</em>` : ""}
          ${unlocks.length ? `<em>Destrava: ${escapeHtml(unlocks.slice(0, 4).join(", "))}</em>` : ""}
          ${blocked.length ? `<em>Atencao: ${escapeHtml(blocked.slice(0, 3).join(", "))}</em>` : ""}
        </div>
      </div>
      ${assistant.structure_summary ? `
        <div class="erp-assistant-alert neutral">
          <strong>Estrutura da planilha</strong>
          <span>${escapeHtml(assistant.structure_summary)}</span>
        </div>
      ` : ""}
      ${alignmentWarnings.length ? `
        <div class="erp-assistant-alert warn">
          <strong>Possível desalinhamento</strong>
          ${alignmentWarnings.map((item) => `<span>${escapeHtml(item.sheet_name || "Aba")}: ${escapeHtml(item.message || "Algumas linhas parecem fora do cabeçalho.")}</span>`).join("")}
        </div>
      ` : ""}
      ${missing.length ? `
        <div class="erp-assistant-alert danger">
          <strong>Campos críticos faltando</strong>
          ${missing.map((item) => `<span>${escapeHtml(item.label || item.field)}: ${escapeHtml(item.effect || "")} ${escapeHtml(item.fix || "")}</span>`).join("")}
        </div>
      ` : ""}
      ${rawOnly.length ? `
        <div class="erp-assistant-alert neutral">
          <strong>Campos sem efeito operacional ainda</strong>
          <span>${escapeHtml(rawOnly.slice(0, 8).join(", "))}${rawOnly.length > 8 ? ` e mais ${number(rawOnly.length - 8)}` : ""} ficam guardados no lote, mas não mudam telas ou sugestões hoje.</span>
        </div>
      ` : ""}
      ${lowConfidence.length ? `
        <div class="erp-assistant-alert warn">
          <strong>Mapeamento para conferir</strong>
          <span>${escapeHtml(lowConfidence.slice(0, 8).join(", "))}</span>
        </div>
      ` : ""}
      ${notNow.length ? `
        <div class="erp-assistant-alert neutral">
          <strong>Depois, não agora</strong>
          ${notNow.slice(0, 2).map((item) => `<span>${escapeHtml(item.title || "")}: ${escapeHtml(item.why || "")}</span>`).join("")}
        </div>
      ` : ""}
      <p>${escapeHtml(erpImportProfileCopy().body)}</p>
      <p>${escapeHtml(assistant.action || "Confira os campos antes de gravar.")}</p>
    </section>
  `;
}

function renderErpAlignmentWarning(alignment = {}) {
  if (alignment.status !== "warn") return "";
  const examples = alignment.examples || [];
  return `
    <div class="erp-assistant-alert warn erp-alignment-warning">
      <strong>Possível desalinhamento nesta aba</strong>
      <span>${escapeHtml(alignment.message || "Algumas linhas parecem estar fora das colunas esperadas.")}</span>
      ${examples.length ? `<span>Exemplos para olhar: ${escapeHtml(examples.slice(0, 3).map((item) => `linha ${item.line}`).join(", "))}.</span>` : ""}
    </div>
  `;
}

function renderErpSheetAssistant(sheet, sheetIndex, assistant = {}) {
  const sheetGuide = (assistant.sheets || []).find((item) => item.sheet_name === sheet.sheet_name) || {};
  const purpose = sheetGuide.purpose || {};
  const missing = sheetGuide.missing_critical || [];
  const rawOnly = sheetGuide.raw_only_fields || [];
  const feeds = sheetGuide.feeds || [];
  const structure = sheetGuide.structure || sheet.structure || {};
  if (state.erpImportProfile === "operador") return "";
  if (!purpose.title && !missing.length && !rawOnly.length) return "";
  return `
    <div class="erp-sheet-guidance">
      <span>Aba ${number(sheetIndex + 1)}: ${escapeHtml(purpose.title || "estrutura em revisão")}${purpose.confidence ? ` (${escapeHtml(purpose.confidence)})` : ""}</span>
      ${renderErpStructureDiff(structure)}
      ${renderErpAlignmentWarning(sheetGuide.alignment || sheet.alignment || {})}
      ${feeds.length ? `<em>Alimenta: ${escapeHtml(feeds.slice(0, 4).join(", "))}</em>` : ""}
      ${missing.length ? `<em>Falta: ${escapeHtml(missing.map((item) => item.label || item.field).join(", "))}</em>` : ""}
      ${rawOnly.length ? `<em>So auditoria: ${escapeHtml(rawOnly.slice(0, 5).join(", "))}</em>` : ""}
    </div>
  `;
}

function renderErpStructureDiff(structure = {}) {
  if (!structure.label) return "";
  const statusClass = structure.status === "known" ? "good" : structure.status === "changed" ? "warn" : "neutral";
  const newColumns = structure.new_columns || [];
  const missingColumns = structure.missing_columns || [];
  return `
    <div class="erp-structure-box ${escapeAttr(statusClass)}">
      <div>
        <strong>${escapeHtml(structure.label)}</strong>
        <span>${escapeHtml(structure.message || "")}</span>
      </div>
      <div class="erp-structure-kpis">
        <span>${number(structure.reused_fields || 0)} reaproveitados</span>
        <span>${number(newColumns.length)} novos</span>
        <span>${number(missingColumns.length)} ausentes</span>
      </div>
      ${newColumns.length || missingColumns.length ? `
        <div class="erp-structure-lists">
          ${newColumns.length ? `<em>Novos: ${escapeHtml(newColumns.slice(0, 6).join(", "))}</em>` : ""}
          ${missingColumns.length ? `<em>Sumiram: ${escapeHtml(missingColumns.slice(0, 6).join(", "))}</em>` : ""}
        </div>
      ` : ""}
    </div>
  `;
}

function renderErpFieldGuide(options = []) {
  const catalog = options.filter((option) => option.entity !== "ignorar");
  const operational = catalog.filter((option) => option.support === "operational");
  const rawOnly = catalog.filter((option) => option.support === "raw_only");
  return `
    <div class="import-guide erp-field-guide">
      <div class="import-guide-card essencial">
        <div class="import-guide-head">
          <div>
            <span class="import-priority">Auditoria dos campos</span>
            <strong>O que realmente alimenta o ${escapeHtml(appName())}</strong>
          </div>
          <span class="status-chip good">${number(operational.length)} ativos</span>
        </div>
        <dl class="import-guide-detail">
          <div><dt>Atualiza o sistema</dt><dd>Grava produtos, estoque, custos, preços, vendas, fornecedores, identificadores e regras de compra.</dd></div>
          <div><dt>Só registro bruto</dt><dd>Fica guardado no lote para auditoria, mas ainda não muda telas, fórmulas ou sugestões.</dd></div>
        </dl>
      </div>
      <div class="import-guide-card recomendado">
        <div class="import-guide-head">
          <div>
            <span class="import-priority">Produto e compra</span>
            <strong>Campos que mais mexem na sugestão</strong>
          </div>
          <span class="status-chip good">operacionais</span>
        </div>
        <dl class="import-guide-detail">
          <div><dt>Código do produto</dt><dd>Chave que liga todo o resto ao item certo.</dd></div>
          <div><dt>Qtd. por embalagem</dt><dd>Múltiplo de compra: caixa com 12, fardo com 24, unidade solta etc.</dd></div>
          <div><dt>Estoque mínimo/máximo e bloqueios</dt><dd>Travas por produto para limitar, forçar revisão ou impedir compra.</dd></div>
        </dl>
      </div>
      <div class="import-guide-card travado">
        <div class="import-guide-head">
          <div>
            <span class="import-priority">Atencao no dropdown</span>
            <strong>${number(rawOnly.length)} campos são apenas histórico bruto</strong>
          </div>
          <span class="status-chip neutral">sem efeito direto</span>
        </div>
        <dl class="import-guide-detail">
          <div><dt>Exemplos</dt><dd>Dados fiscais, financeiros, pedido de compra e alguns detalhes cadastrais ainda não alimentam os módulos.</dd></div>
          <div><dt>Quando usar</dt><dd>Use se quiser manter rastreabilidade do arquivo; ignore se espera impacto operacional agora.</dd></div>
        </dl>
      </div>
      <div class="import-guide-card ambicioso">
        <div class="import-guide-head">
          <div>
            <span class="import-priority">Planilha minima</span>
            <strong>Embalagem de compra</strong>
          </div>
          <span class="status-chip good">2 colunas</span>
        </div>
        <dl class="import-guide-detail">
          <div><dt>Coluna A</dt><dd>Produto - código.</dd></div>
          <div><dt>Coluna B</dt><dd>Produto - qtd. por embalagem de compra.</dd></div>
        </dl>
      </div>
    </div>
  `;
}

function renderErpManualConflicts(conflicts = []) {
  state.erpManualConflicts = conflicts;
  const target = document.querySelector("#erpManualConflicts");
  if (!target) return;
  if (!conflicts.length) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = `
    <div class="erp-conflict-card">
      <strong>${number(conflicts.length)} divergência(s) com dados manuais</strong>
      <span>Escolha qual fonte deve prevalecer antes de gravar a importação.</span>
      <div class="erp-conflict-bulk">
        <button class="secondary-button" type="button" data-conflict-bulk="manual">Manter manual em todas</button>
        <button class="secondary-button" type="button" data-conflict-bulk="erp">Usar ERP em todas</button>
      </div>
      <div class="erp-conflict-list">
        ${conflicts.map((item) => `
          <div class="erp-conflict-row">
            <div>
              <strong>${escapeHtml(item.product_name || item.product_code || "Produto")}</strong>
              <span>${escapeHtml(item.field_label || item.field || "Campo")} - linha ${number(item.row_number)}${item.sheet_name ? ` - ${escapeHtml(item.sheet_name)}` : ""}</span>
              <em>Manual: ${escapeHtml(item.manual_value || "-")} | ERP: ${escapeHtml(item.erp_value || "-")}</em>
            </div>
            <div class="erp-priority-choice">
              <label><input type="radio" name="erpConflict_${escapeAttr(item.key)}" value="manual" data-conflict-key="${escapeAttr(item.key)}" checked /> Manter manual</label>
              <label><input type="radio" name="erpConflict_${escapeAttr(item.key)}" value="erp" data-conflict-key="${escapeAttr(item.key)}" /> Usar ERP</label>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  target.querySelectorAll("[data-conflict-bulk]").forEach((button) => {
    button.addEventListener("click", () => setErpConflictPriority(button.dataset.conflictBulk || "manual"));
  });
}

function setErpConflictPriority(priority) {
  document.querySelectorAll("input[data-conflict-key]").forEach((input) => {
    input.checked = input.value === priority;
  });
}

function collectErpManualConflictChoices() {
  const choices = {};
  (state.erpManualConflicts || []).forEach((item) => {
    const selected = Array.from(document.querySelectorAll("input[data-conflict-key]")).find((input) => input.dataset.conflictKey === item.key && input.checked);
    choices[item.key] = selected?.value || "manual";
  });
  return choices;
}

function erpImportSummaryCards(summary = {}) {
  const cards = [
    ["Linhas lidas", number(summary.rows || summary.mapped_rows || 0), "Base recebida do arquivo."],
    ["Linhas mapeadas", number(summary.mapped_rows || 0), "Entraram com algum campo canonico."],
    ["Produtos", number(summary.product_codes_detected || 0), "Códigos de produto identificados."],
    ["Estoque", number(summary.inventory_products_imported || 0), "Produtos com saldo atualizado."],
    ["Preços", number(summary.price_products_imported || 0), "Produtos com preço atualizado."],
    ["Custos", number(summary.cost_products_imported || 0), "Produtos com custo atualizado."],
    ["Vendas", number(summary.product_sales_imported || 0), "Novas vendas de produto."],
    ["Serviços", number(summary.service_sales_imported || 0), "Novas vendas de serviço."],
    ["Fornecedores", number(summary.supplier_profiles_imported || 0), "Perfis criados ou atualizados."],
    ["Ajustes", number(summary.product_settings_imported || 0), "Parametros de produto importados."],
  ];
  return cards.filter(([, value], index) => index < 2 || value !== "0");
}

function renderErpImportDone(result = {}) {
  state.erpImportResult = result;
  renderErpImportJourney("done", { text: "Lote gravado. Confira o impacto e siga para o próximo arquivo recomendado." });
  const target = document.querySelector("#erpImportPreview");
  if (!target) return;
  const summary = result.summary || {};
  const nextFile = result.imports?.assistant?.next_recommended_file || {};
  const impact = erpImportImpactText(summary);
  target.innerHTML = `
    <section class="erp-done-card">
      <div class="erp-assistant-head">
        <div>
          <span class="import-priority">Importação concluida</span>
          <strong>${escapeHtml(result.batch_id || "Lote gravado")}</strong>
        </div>
        <span class="status-chip good">gravado</span>
      </div>
      <div class="erp-impact-grid">
        ${erpImportSummaryCards(summary).map(([label, value, detail]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <em>${escapeHtml(detail)}</em>
          </div>
        `).join("")}
      </div>
      ${impact ? `<p>${escapeHtml(impact)}</p>` : ""}
      <div class="erp-next-card">
        <span>Próximo arquivo recomendado</span>
        <strong>${escapeHtml(nextFile.title || "Atualizar o próximo arquivo da rotina")}</strong>
        ${nextFile.why ? `<em>${escapeHtml(nextFile.why)}</em>` : ""}
        ${(nextFile.minimum_fields || []).length ? `<em>Campos mínimos: ${escapeHtml((nextFile.minimum_fields || []).join(", "))}</em>` : ""}
      </div>
    </section>
  `;
}

function renderErpImportPreview(payload) {
  state.erpImport = payload;
  state.erpImportResult = null;
  state.erpManualConflicts = [];
  const summary = payload.summary || {};
  const assistant = payload.assistant || {};
  const profile = erpImportProfileCopy();
  const reused = Number(summary.reused_mappings || 0);
  renderErpImportJourney("review", { text: state.erpImportProfile === "operador" ? "Confira este arquivo antes de gravar. O próximo passo depende desta leitura." : "Revise mapeamento, campos críticos e efeito no sistema." });
  document.querySelector("#erpImportStatus").textContent = state.erpImportProfile === "operador"
    ? `${payload.file_name} analisado. O sistema encontrou ${number(summary.rows)} linhas e ${number(summary.columns)} colunas.${assistant.title ? ` Parece: ${assistant.title}.` : ""}`
    : `${payload.file_name} analisado: ${number(summary.rows)} linhas, ${number(summary.columns)} colunas, ${number(summary.required_review)} campos para revisar${reused ? `, ${number(reused)} mapeamentos reaproveitados` : ""}. ${assistant.title ? `Parece: ${assistant.title}.` : ""}`;
  const options = payload.field_options || [];
  const optionLookup = erpFieldOptionLookup(options);
  const sheetCards = (payload.sheets || []).map((sheet, sheetIndex) => {
    const columnRows = (sheet.columns || []).map((column) => {
      const suggestion = column.suggestion || {};
      const selected = `${suggestion.entity || "ignorar"}:${suggestion.field || "ignorar"}`;
      const confidence = Number(suggestion.confidence || 0);
      const confidenceLabel = confidence >= 80 ? "Alta" : confidence >= 55 ? "Média" : "Baixa";
      return `
        <tr>
          <td>
            <strong>${escapeHtml(column.header)}</strong>
            <span class="muted-line">${escapeHtml(column.value_type)} - exemplos: ${escapeHtml((column.samples || []).slice(0, 3).join(" | ") || "-")}</span>
          </td>
          <td>
            <select class="inline-input erp-map-select" data-sheet="${sheetIndex}" data-column="${column.index}">
              ${erpFieldOptions(selected, options)}
            </select>
            <span class="erp-field-help">${erpFieldHelpMarkup(selected, optionLookup)}</span>
          </td>
          <td><span class="status-chip ${confidence >= 80 ? "good" : confidence >= 55 ? "warn" : "danger"}">${confidenceLabel}</span></td>
        </tr>
      `;
    }).join("");
    return `
      <div class="info-card erp-sheet-card">
        <strong>${escapeHtml(sheet.sheet_name)} - ${escapeHtml(sheet.dominant_entity || "não identificado")}</strong>
        <span>${state.erpImportProfile === "operador" ? `${number(sheet.row_count)} linhas e ${number(sheet.column_count)} colunas para conferência.` : `${number(sheet.row_count)} linhas validas, cabeçalho na linha ${number(sheet.header_line)}, ${number(sheet.column_count)} colunas.`}</span>
        ${state.erpImportProfile === "operador" ? renderErpAlignmentWarning(sheet.alignment || {}) : ""}
        ${renderErpSheetAssistant(sheet, sheetIndex, assistant)}
        <details class="erp-map-details" ${state.erpImportProfile === "implantador" ? "open" : ""}>
          <summary>${state.erpImportProfile === "operador" ? "Conferir colunas reconhecidas" : "Mapeamento da aba"}</summary>
          <div class="table-wrap erp-map-table">
            <table>
              <thead><tr><th>Coluna da planilha</th><th>Catalogar como</th><th>Confiança</th></tr></thead>
              <tbody>${columnRows || `<tr><td colspan="3">Nenhuma coluna reconhecida.</td></tr>`}</tbody>
            </table>
          </div>
        </details>
      </div>
    `;
  }).join("");
  document.querySelector("#erpImportPreview").innerHTML = `
    <div class="erp-preview-shell ${state.erpImportProfile === "operador" ? "operator-mode" : "implantador-mode"}">
      <div id="erpManualConflicts"></div>
      ${renderErpAssistantCard(assistant)}
      ${profile.showFieldGuide ? renderErpFieldGuide(options) : ""}
      ${sheetCards}
    </div>
  `;
  renderErpManualConflicts([]);
  document.querySelectorAll(".erp-map-select").forEach((select) => {
    select.addEventListener("change", () => {
      const help = select.closest("td")?.querySelector(".erp-field-help");
      if (help) help.innerHTML = erpFieldHelpMarkup(select.value, optionLookup);
    });
  });
  document.querySelector("#erpImportConfirm").disabled = false;
}

async function analyzeErpImportFile() {
  const input = document.querySelector("#erpImportFile");
  const status = document.querySelector("#erpImportStatus");
  const button = document.querySelector("#erpImportAnalyze");
  const file = input?.files?.[0];
  if (!file) {
    status.textContent = "Selecione uma planilha exportada do ERP.";
    return;
  }
  button.disabled = true;
  document.querySelector("#erpImportConfirm").disabled = true;
  state.erpImportResult = null;
  status.textContent = "Analisando arquivo...";
  renderErpImportJourney("analyzing");
  document.querySelector("#erpImportPreview").innerHTML = "";
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    state.erpImportFile = file;
    state.erpImportPayload = { file_name: file.name };
    renderErpImportPreview(await apiPostForm("/api/erp/import-preview", formData));
  } catch (error) {
    status.textContent = error.message || "Não foi possível analisar a planilha.";
  } finally {
    button.disabled = false;
  }
}

function confirmedErpMappings() {
  if (!state.erpImport) return;
  return (state.erpImport.sheets || []).map((sheet, sheetIndex) => ({
    sheet_index: sheetIndex,
    sheet_name: sheet.sheet_name,
    signature: sheet.signature,
    columns: (sheet.columns || []).map((column) => {
      const select = document.querySelector(`.erp-map-select[data-sheet="${sheetIndex}"][data-column="${column.index}"]`);
      const [entity, field] = (select?.value || "ignorar:ignorar").split(":");
      const label = select?.selectedOptions?.[0]?.textContent || "Ignorar / não mapeado";
      return { index: column.index, header: column.header, entity, field, label };
    }),
  }));
}

function erpImportFormData({ conflictCheckOnly = false, manualChoices = null } = {}) {
  const formData = new FormData();
  formData.append("file", state.erpImportFile, state.erpImportFile.name);
  const updateToggle = document.querySelector("#erpImportUpdateMode");
  formData.append("import_mode", updateToggle ? (updateToggle.checked ? "configured_update" : "configured_refresh") : "configured_update");
  formData.append("mappings", JSON.stringify(confirmedErpMappings()));
  if (conflictCheckOnly) formData.append("conflict_check_only", "1");
  if (manualChoices) formData.append("manual_conflict_choices", JSON.stringify(manualChoices));
  return formData;
}

async function confirmErpImportMapping() {
  if (!state.erpImport || !state.erpImportFile) return;
  const button = document.querySelector("#erpImportConfirm");
  const status = document.querySelector("#erpImportStatus");
  button.disabled = true;
  status.textContent = "Conferindo divergências manuais...";
  renderErpImportJourney("impact", { text: "Conferindo conflitos e impacto antes de gravar." });
  try {
    if (!(state.erpManualConflicts || []).length) {
      const check = await apiPostForm("/api/erp/import-commit", erpImportFormData({ conflictCheckOnly: true }));
      if (check.requires_manual_resolution) {
        renderErpManualConflicts(check.manual_conflicts || []);
        renderErpImportJourney("conflict");
        status.textContent = `${number((check.manual_conflicts || []).length)} divergência(s) encontradas. Escolha a prioridade de cada campo e clique em confirmar novamente.`;
        return;
      }
    }
    status.textContent = "Gravando lote importado...";
    renderErpImportJourney("commit");
    const manualChoices = collectErpManualConflictChoices();
    const result = await apiPostForm("/api/erp/import-commit", erpImportFormData({ manualChoices }));
    state.imports = result.imports;
    renderErpManualConflicts([]);
    renderImports(result.imports);
    const costCount = Number(result.summary.cost_snapshots_imported || 0);
    const identifierCount = Number(result.summary.identifiers_imported || 0);
    const settingsCount = Number(result.summary.product_settings_imported || 0);
    const supplierCount = Number(result.summary.supplier_profiles_imported || 0);
    const preservedCount = Number(result.summary.manual_values_preserved || 0);
    const resolvedCount = Number(result.summary.manual_conflicts_resolved || 0);
    const impact = erpImportImpactText(result.summary || {});
    const nextFile = result.imports?.assistant?.next_recommended_file || {};
    status.textContent = `Lote ${result.batch_id} gravado: ${number(result.summary.mapped_rows)} linhas lidas${impact ? `; impacto: ${impact}` : ""}${supplierCount ? `, ${number(supplierCount)} fornecedor(es) atualizados` : ""}${identifierCount ? `, ${number(identifierCount)} identificadores salvos` : ""}${settingsCount ? `, ${number(settingsCount)} ajustes de produto importados` : ""}${resolvedCount ? `, ${number(resolvedCount)} divergências decididas` : ""}${preservedCount ? ` (${number(preservedCount)} manuais preservados)` : ""}. Próximo recomendado: ${nextFile.title || "atualizar o próximo arquivo da rotina"}.`;
    renderErpImportDone(result);
  } catch (error) {
    renderErpImportJourney("error", { text: error.message || "Não foi possível gravar o lote." });
    status.textContent = error.message || "Não foi possível gravar o lote.";
  } finally {
    button.disabled = Boolean(state.erpImportResult);
  }
}

function importPlanStatus(item) {
  const coverage = item.coverage || {};
  if (item.priority === "dispensado") return { label: "Dispensado", cls: "neutral" };
  if (item.id === "products_prices_stock") {
    if (coverage.products && coverage.products_with_price && coverage.products_with_stock) return { label: "Coberto", cls: "good" };
    if (coverage.products || coverage.products_with_price || coverage.products_with_stock) return { label: "Parcial", cls: "warn" };
    return { label: "Faltando", cls: "danger" };
  }
  if (item.id === "purchase_costs") {
    return coverage.products_with_cost ? { label: "Coberto", cls: "good" } : { label: "Faltando", cls: "danger" };
  }
  if (item.id === "product_sales") {
    if (coverage.rows && Number(coverage.sales_months || 0) >= 3) return { label: "Coberto", cls: "good" };
    if (coverage.rows) return { label: "Pouco histórico", cls: "warn" };
    return { label: "Faltando", cls: "danger" };
  }
  if (item.id === "services") {
    return coverage.rows ? { label: "Coberto", cls: "good" } : { label: "Opcional pendente", cls: "warn" };
  }
  if (item.id === "supplier_identifiers") {
    if (coverage.products_with_supplier_reference && coverage.suppliers) return { label: "Coberto", cls: "good" };
    if (coverage.products_with_supplier_reference || coverage.suppliers) return { label: "Parcial", cls: "warn" };
    return { label: "Recomendado", cls: "warn" };
  }
  if (item.id === "operational_settings") {
    return coverage.products_with_package ? { label: "Importavel", cls: "good" } : { label: "Pode importar", cls: "warn" };
  }
  if (item.id === "nexo_derived") {
    return { label: "Calculado", cls: "neutral" };
  }
  if (item.priority === "ambicioso") {
    return coverage.stage ? { label: "Preparar fonte", cls: "warn" } : { label: "Mapear depois", cls: "warn" };
  }
  return { label: "A avaliar", cls: "warn" };
}

function importCoverageStats(item) {
  const coverage = item.coverage || {};
  const stats = {
    products_prices_stock: [
      ["Produtos", number(coverage.products)],
      ["Com preço", `${number(coverage.products_with_price)} (${number(coverage.price_pct)}%)`],
      ["Com estoque", `${number(coverage.products_with_stock)} (${number(coverage.stock_pct)}%)`],
      ["Com barras", `${number(coverage.products_with_barcode)} (${number(coverage.barcode_pct)}%)`],
    ],
    purchase_costs: [
      ["Produtos com custo", `${number(coverage.products_with_cost)} (${number(coverage.cost_pct)}%)`],
    ],
    product_sales: [
      ["Linhas de venda", number(coverage.rows)],
      ["Produtos vendidos", number(coverage.products_with_sales)],
      ["Meses", number(coverage.sales_months)],
    ],
    services: [
      ["Linhas de serviço", number(coverage.rows)],
      ["Serviços", number(coverage.services)],
    ],
    supplier_identifiers: [
      ["Refs. fornecedor", `${number(coverage.products_with_supplier_reference)} (${number(coverage.supplier_reference_pct)}%)`],
      ["Fornecedores", number(coverage.suppliers)],
    ],
    deprecated_profit: [
      ["Arquivos ativos", number(coverage.deprecated_files)],
    ],
    operational_settings: [
      ["Com embalagem", `${number(coverage.products_with_package)} (${number(coverage.package_pct)}%)`],
      ["Refs. fornecedor", number(coverage.products_with_supplier_reference)],
    ],
    nexo_derived: [
      ["Origem", coverage.stage || appName()],
    ],
    purchase_history: [
      ["Estagio", coverage.stage || "capturar"],
    ],
    fiscal_documents: [
      ["Estagio", coverage.stage || "auditar"],
    ],
    inventory_movements: [
      ["Estagio", coverage.stage || "reconciliar"],
    ],
    customer_commercial: [
      ["Clientes", number(coverage.customers)],
    ],
    financial_titles: [
      ["Estagio", coverage.stage || "cruzar"],
    ],
    sales_context: [
      ["Estagio", coverage.stage || "enriquecer"],
    ],
    product_master_data: [
      ["Produtos", number(coverage.products)],
    ],
  };
  return stats[item.id] || [];
}

function renderImportDataGuide(readiness = {}) {
  const target = document.querySelector("#importDataGuide");
  if (!target) return;
  const plan = readiness.plan || [];
  if (!plan.length) {
    target.innerHTML = `<div class="info-card"><strong>Mapa ainda vazio</strong><span>Quando a API responder a cobertura, o guia de importação aparece aqui.</span></div>`;
    return;
  }
  target.innerHTML = plan.map((item) => {
    const status = importPlanStatus(item);
    const expected = (item.expected_files || []).join(", ");
    const fields = (item.what_to_send || []).slice(0, 14).join(", ");
    const uses = (item.used_for || []).join(", ");
    const stats = importCoverageStats(item);
    return `
      <article class="import-guide-card ${escapeAttr(item.priority)}">
        <div class="import-guide-head">
          <div>
            <span class="import-priority">${escapeHtml(item.priority || "dados")}</span>
            <strong>${escapeHtml(item.title || "")}</strong>
          </div>
          <span class="status-chip ${escapeAttr(status.cls)}">${escapeHtml(status.label)}</span>
        </div>
        <div class="import-guide-stats">
          ${stats.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
        </div>
        <dl class="import-guide-detail">
          <div><dt>Fontes esperadas</dt><dd>${escapeHtml(expected || "Não enviar")}</dd></div>
          <div><dt>Campos uteis</dt><dd>${escapeHtml(fields || "Dispensado no fluxo atual")}</dd></div>
          <div><dt>Uso no ${escapeHtml(appName())}</dt><dd>${escapeHtml(uses || "-")}</dd></div>
        </dl>
      </article>
    `;
  }).join("");
}

function setImportMode(mode) {
  setModuleMode({
    stateKey: "importMode",
    modeAttr: "data-import-mode",
    operationalSelector: "#importOperational",
    dashboardSelector: "#importDashboard",
  }, mode);
}

function focusImportFromOnboarding() {
  if (!state.importOnboardingFocus || state.importOnboardingFocused) return;
  state.importOnboardingFocused = true;
  setErpImportProfile("operador");
  setImportMode("operational");
  const box = document.querySelector(".erp-import-box");
  const status = document.querySelector("#erpImportStatus");
  if (box) {
    box.classList.add("onboarding-import-focus");
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (status) {
    status.textContent = "Onboarding concluído. Selecione a primeira planilha do cliente para iniciar o mapeamento assistido.";
  }
  document.querySelector("#erpImportFile")?.focus();
}

function importDashboardRows(items, valueKey = "value", valueFormatter = number) {
  return dashboardChartRows(items, {
    valueKey,
    valueFormatter,
    rowClass: "import-chart-row",
    attrsFor: (item) => item.mode ? ` data-import-mode-target="${escapeAttr(item.mode)}"` : "",
  });
}

function importModuleScoreRows(moduleScores = []) {
  return moduleScores.map((item) => ({
    label: item.label || item.id || "Módulo",
    value: Number(item.score || 0),
    mode: "dashboard",
    detail: item.detail || item.status || "",
  }));
}

function importIssueGuidance(item = {}) {
  const code = item.code || "";
  const guidance = {
    erp_cost_without_product_code: ["bloqueio", "Custo sem produto não atualiza margem.", "Mapeie ou exporte o código interno do produto junto com o custo."],
    erp_price_without_product_code: ["bloqueio", "Preço sem produto não atualiza precificação.", "Mapeie ou exporte o código interno do produto junto com o preço."],
    erp_stock_without_product_code: ["bloqueio", "Estoque sem produto não entra na reposição.", "Mapeie ou exporte o código interno do produto junto com o saldo."],
    erp_product_sale_without_product_code: ["bloqueio", "Venda sem produto não entra em demanda, ABC ou reposição.", "Mapeie o código do produto na venda por item."],
    erp_product_sale_inferred_product_code: ["confiança", `O ${appName()} evitou atribuir venda ao item errado.`, "Use uma exportação onde cada linha de venda traga o código real do produto."],
    erp_identifier_without_product_code: ["bloqueio", "Código de barras ou referência de fornecedor ficou sem item de destino.", "Inclua o código interno do produto nessa planilha."],
    erp_settings_without_product_code: ["bloqueio", "Ajustes de compra ficaram sem produto para aplicar.", "Inclua código do produto junto dos parâmetros operacionais."],
    erp_unmapped_rows: ["auditoria", "Linhas ficaram apenas em auditoria.", "Revise o mapeamento das colunas antes de gravar de novo."],
    erp_low_product_code_coverage: ["confiança", "Poucos produtos foram identificados para o tamanho do arquivo.", "Confira se o cabeçalho foi detectado certo ou exporte como CSV/XLSX mais limpo."],
    erp_manual_identifier_conflict: ["decisao", `O ERP diverge de uma decisão manual do ${appName()}.`, "Escolha explicitamente se prevalece o valor manual ou o ERP."],
    erp_supplier_profile_invalid_value: ["confiança", "Parte do cadastro de fornecedor foi aproveitada, mas algum valor veio inválido.", "Revise pedido mínimo e campos numéricos do fornecedor."],
    erp_price_invalid_value: ["confiança", "Alguns preços foram ignorados por valor inválido.", "Confira separador decimal e colunas de preço."],
    erp_stock_invalid_value: ["confiança", "Alguns saldos foram ignorados por valor inválido.", "Confira se a coluna de estoque tem apenas quantidade numérica."],
    erp_product_sale_invalid_date: ["bloqueio", "Algumas vendas foram ignoradas por data inválida.", "Confira a coluna de data da venda."],
    erp_service_sale_invalid_date: ["bloqueio", "Alguns serviços foram ignorados por data inválida.", "Confira a coluna de data do serviço."],
  };
  const [category, effect, fix] = guidance[code] || [
    item.severity === "info" ? "auditoria" : "confiança",
    item.severity === "info" ? "Evento registrado para auditoria." : "Revise esse ponto antes de confiar totalmente no lote.",
    item.severity === "info" ? "Nenhuma ação obrigatória." : "Abra o lote e confira a origem da planilha.",
  ];
  return { category, effect, fix };
}

function renderImplementationStateCard(statePayload = {}) {
  const ready = statePayload.ready || [];
  const partial = statePayload.partial || [];
  const missing = statePayload.missing || [];
  const gaps = statePayload.essential_gaps || [];
  return `
    <article class="import-dashboard-card wide implementation-state-card">
      <div>
        <span>Estado da implantação</span>
        <strong>${escapeHtml(statePayload.stage || "implantação em leitura")}</strong>
        <p>${escapeHtml(statePayload.message || "Use o diagnóstico para decidir a próxima fonte de dados.")}</p>
      </div>
      <div class="implementation-state-grid">
        <div><span>Pronto</span><strong>${escapeHtml(ready.slice(0, 4).join(", ") || "-")}</strong></div>
        <div><span>Parcial</span><strong>${escapeHtml(partial.slice(0, 4).join(", ") || "-")}</strong></div>
        <div><span>Faltando</span><strong>${escapeHtml((gaps.length ? gaps : missing).slice(0, 4).join(", ") || "-")}</strong></div>
      </div>
    </article>
  `;
}

function importDashboardCharts(payload = state.imports || {}) {
  const readiness = payload.readiness || {};
  const quality = payload.quality || {};
  const assistant = payload.assistant || {};
  const nextFile = assistant.next_recommended_file || {};
  const moduleScores = assistant.module_scores || [];
  const implementationState = assistant.implementation_state || {};
  const qualitySummary = quality.summary || {};
  const plan = readiness.plan || [];
  const batches = payload.batches || [];
  const issues = payload.issues || [];
  const changes = payload.changes || [];
  const covered = plan.filter((item) => importPlanStatus(item).cls === "good").length;
  const warning = plan.filter((item) => importPlanStatus(item).cls === "warn").length;
  const missing = plan.filter((item) => importPlanStatus(item).cls === "danger").length;
  const usablePlan = plan.filter((item) => item.priority !== "dispensado");
  const healthPct = usablePlan.length ? (covered / usablePlan.length) * 100 : 0;
  const priorityRows = ["essencial", "recomendado", "ambicioso", "travado"]
    .map((priority) => ({ label: priority, value: plan.filter((item) => item.priority === priority).length }));
  const statusRows = [
    { label: "Coberto", value: covered, mode: "dashboard" },
    { label: "Parcial / recomendado", value: warning, mode: "dashboard" },
    { label: "Faltando", value: missing, mode: "dashboard" },
    { label: "Issues", value: issues.length, mode: "operational" },
  ];
  const latest = batches[0] || {};
  return `
    ${renderImplementationStateCard(implementationState)}
    <article class="import-dashboard-card">
      <div>
        <span>Confiança do lote</span>
        <strong>${number(quality.score || healthPct)}%</strong>
        <p>${quality.latest_batch_id ? `${escapeHtml(quality.status || "-")} - ${escapeHtml(quality.next_step || "")}` : `${number(covered)} de ${number(usablePlan.length)} blocos uteis aparecem cobertos no mapa atual.`}</p>
      </div>
      <div class="import-donut" style="--value: ${Math.max(0, Math.min(100, quality.score || healthPct))}">
        <span>${number(quality.score || healthPct)}%</span>
      </div>
    </article>
    <article class="import-dashboard-card">
      <div>
        <span>Ultimo lote</span>
        <strong>${escapeHtml(latest.status || "-")}</strong>
        <p>${latest.id ? `${escapeHtml(importBatchFileNames(latest).join(", ") || latest.id)} / ${escapeHtml(shortDateTime(latest.started_at || latest.finished_at) || "-")}` : "Nenhum lote registrado ainda."}</p>
      </div>
    </article>
    <article class="import-chart-card">
      <header><strong>Cobertura por situação</strong><span>Clique em issues para abrir a mesa operacional</span></header>
      <div class="import-chart">${importDashboardRows(statusRows)}</div>
    </article>
    <article class="import-chart-card">
      <header><strong>Reconciliação do lote</strong><span>Linhas, conflitos e mudanças pendentes</span></header>
      <div class="import-chart">${importDashboardRows([
        { label: "Lidas", value: Number(qualitySummary.rows || 0), mode: "dashboard" },
        { label: "Mapeadas", value: Number(qualitySummary.mapped_rows || 0), mode: "dashboard" },
        { label: "Sem mapa", value: Number(qualitySummary.unmapped_rows || 0), mode: "operational" },
        { label: "Conflitos", value: Number(qualitySummary.manual_conflicts_pending || 0), mode: "operational" },
      ])}</div>
    </article>
    <article class="import-chart-card">
      <header><strong>Ambicao dos dados</strong><span>Quantos blocos o sistema quer por prioridade</span></header>
      <div class="import-chart">${importDashboardRows(priorityRows)}</div>
    </article>
    <article class="import-chart-card">
      <header><strong>Confiança por módulo</strong><span>Pronto para rotina ou ainda parcial</span></header>
      <div class="import-chart">${importDashboardRows(importModuleScoreRows(moduleScores), "value", (value) => `${number(value)}%`)}</div>
    </article>
    <article class="import-dashboard-card">
      <div>
        <span>Auditoria recente</span>
        <strong>${number(changes.length)}</strong>
        <p>Mudança(s) detectadas em dados vindos do ERP. Use isso para revisar preço, custo e cadastro.</p>
      </div>
    </article>
    <article class="import-dashboard-card wide">
      <div>
        <span>Próximo arquivo recomendado</span>
        <strong>${escapeHtml(nextFile.title || "Importação boa nasce de dado primario amplo")}</strong>
        <p>${escapeHtml(nextFile.why || "Priorize produtos, estoque, venda, custos e identificadores. Depois, traga ajustes de produto e dados fiscais/compras para reduzir decisão feita fora do sistema.")}</p>
        ${(nextFile.unlocks || []).length ? `<p>Destrava: ${escapeHtml((nextFile.unlocks || []).join(", "))}</p>` : ""}
        ${(nextFile.blocked_modules || []).length ? `<p>Atencao: ${escapeHtml((nextFile.blocked_modules || []).join(", "))}</p>` : ""}
        ${(nextFile.minimum_fields || []).length ? `<p>Campos mínimos: ${escapeHtml((nextFile.minimum_fields || []).join(", "))}</p>` : ""}
      </div>
    </article>
  `;
}

async function analyzeLinkImportFile() {
  const input = document.querySelector("#linkImportFile");
  const status = document.querySelector("#linkImportStatus");
  const preview = document.querySelector("#linkImportPreview");
  const button = document.querySelector("#linkImportAnalyze");
  const file = input?.files?.[0];
  if (!file) {
    status.textContent = "Selecione uma planilha de vínculos.";
    return;
  }
  button.disabled = true;
  status.textContent = "Lendo cabeçalhos...";
  preview.innerHTML = "";
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const result = await apiPostForm("/api/links/inspect", formData);
    state.linkImportFile = file;
    state.linkImportInspect = result;
    state.linkImportSelectedType = result.default_link_type || result.link_types?.[0]?.id || "";
    renderLinkTypePicker(result);
    status.textContent = `${number(result.row_count)} linhas detectadas em ${escapeHtml(result.file_name)}. Escolha o tipo de vínculo e as colunas.`;
  } catch (error) {
    status.textContent = error.message || "Não foi possível ler o arquivo.";
  } finally {
    button.disabled = false;
  }
}

function currentLinkImportType(inspect = state.linkImportInspect, typeId = state.linkImportSelectedType) {
  const types = inspect?.link_types || [];
  return types.find((type) => type.id === typeId) || types[0] || null;
}

function appendLinkImportMapping(formData) {
  const type = document.querySelector("#linkTypeSelect")?.value || state.linkImportSelectedType;
  const currentType = currentLinkImportType(state.linkImportInspect, type);
  formData.append("link_type", type);
  if (currentType?.mode === "supplier_profile") {
    document.querySelectorAll("[data-link-field]").forEach((select) => {
      formData.append(`column_${select.dataset.linkField}`, select.value || "");
    });
    return currentType;
  }
  const sourceCol = document.querySelector("#linkSourceColumn")?.value || "";
  const targetCol = document.querySelector("#linkTargetColumn")?.value || "";
  formData.append("source_column", sourceCol);
  formData.append("target_column", targetCol);
  return currentType;
}

function renderLinkTypePicker(inspect) {
  const preview = document.querySelector("#linkImportPreview");
  if (!preview) return;
  const types = inspect.link_types || [];
  const selectedType = state.linkImportSelectedType || types[0]?.id || "";
  const headers = inspect.headers || [];
  const headerOptions = headers.map((h, i) => `<option value="${i}">${escapeHtml(h || `coluna ${i + 1}`)}</option>`).join("");
  const sampleRows = (inspect.sample_rows || []).slice(0, 4);
  const sampleTable = sampleRows.length
    ? `<table class="link-sample-table"><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${sampleRows.map((row) => `<tr>${headers.map((_, i) => `<td>${escapeHtml(String(row[i] || ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : "";
  const typeOptions = types.map((t) => `<option value="${escapeAttr(t.id)}" ${t.id === selectedType ? "selected" : ""}>${escapeHtml(t.label)}</option>`).join("");
  const currentType = types.find((t) => t.id === selectedType) || types[0];
  const suggestion = inspect.suggestions?.[selectedType] || { source_index: -1, target_index: -1, fields: {} };
  const fieldSuggestion = suggestion.fields || {};
  const mappingHtml = currentType?.mode === "supplier_profile"
    ? `
      <div class="link-mapping-grid link-mapping-grid-wide">
        ${(currentType.columns || []).map((field) => `
          <label>
            <span>${escapeHtml(field.label)}${field.required ? " <strong>*</strong>" : ""}</span>
            <select id="linkField_${escapeAttr(field.id)}" data-link-field="${escapeAttr(field.id)}">
              <option value="">${field.required ? "Selecione" : "Não usar"}</option>
              ${headerOptions}
            </select>
          </label>
        `).join("")}
      </div>
    `
    : `
      <div class="link-mapping-grid">
        <label>
          <span>Coluna de <strong>${escapeHtml(currentType?.source?.label || "Origem")}</strong></span>
          <select id="linkSourceColumn">${headerOptions}</select>
        </label>
        <label>
          <span>Coluna de <strong>${escapeHtml(currentType?.target?.label || "Destino")}</strong></span>
          <select id="linkTargetColumn">${headerOptions}</select>
        </label>
      </div>
    `;
  preview.innerHTML = `
    <div class="link-config">
      <label class="link-config-row">
        <span>Tipo de vínculo</span>
        <select id="linkTypeSelect">${typeOptions}</select>
      </label>
      <p class="muted-line">${escapeHtml(currentType?.description || "")}</p>
      ${mappingHtml}
      ${sampleTable ? `<div class="link-sample"><strong>Primeiras linhas</strong>${sampleTable}</div>` : ""}
      <div class="refresh-confirm-row">
        <button class="action-button" type="button" id="linkImportPreviewBtn">Visualizar diferencas</button>
        <button class="text-button" type="button" id="linkImportCancel">Cancelar</button>
      </div>
      <div id="linkImportDiff" class="stack"></div>
    </div>
  `;
  if (currentType?.mode === "supplier_profile") {
    (currentType.columns || []).forEach((field) => {
      const select = document.querySelector(`[data-link-field="${field.id}"]`);
      const index = Number(fieldSuggestion[field.id]);
      if (select && index >= 0) select.value = String(index);
    });
  } else {
    const sourceSel = document.querySelector("#linkSourceColumn");
    const targetSel = document.querySelector("#linkTargetColumn");
    if (sourceSel && suggestion.source_index >= 0) sourceSel.value = String(suggestion.source_index);
    if (targetSel && suggestion.target_index >= 0) targetSel.value = String(suggestion.target_index);
  }
  document.querySelector("#linkTypeSelect")?.addEventListener("change", (event) => {
    state.linkImportSelectedType = event.target.value;
    renderLinkTypePicker(state.linkImportInspect);
  });
  document.querySelector("#linkImportPreviewBtn")?.addEventListener("click", previewLinkImport);
  document.querySelector("#linkImportCancel")?.addEventListener("click", cancelLinkImport);
}

function cancelLinkImport() {
  const preview = document.querySelector("#linkImportPreview");
  const status = document.querySelector("#linkImportStatus");
  state.linkImportFile = null;
  state.linkImportInspect = null;
  state.linkImportPreview = null;
  state.linkImportSelectedType = "";
  if (preview) preview.innerHTML = "";
  if (status) status.textContent = "Cancelado.";
}

async function previewLinkImport() {
  const file = state.linkImportFile;
  if (!file) return;
  const status = document.querySelector("#linkImportStatus");
  const diffContainer = document.querySelector("#linkImportDiff");
  const button = document.querySelector("#linkImportPreviewBtn");
  if (button) button.disabled = true;
  status.textContent = "Comparando com o cadastro atual...";
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    appendLinkImportMapping(formData);
    const result = await apiPostForm("/api/links/preview", formData);
    state.linkImportPreview = result;
    renderLinkImportDiff(result);
    if (result.mode === "supplier_profile") {
      status.textContent = `${result.type_label}: ${number(result.summary.records_total)} fornecedor(es) analisados.`;
    } else {
      status.textContent = `${result.type_label}: ${number(result.summary.pairs_total)} pares analisados.`;
    }
  } catch (error) {
    status.textContent = error.message || "Não foi possível comparar.";
    if (diffContainer) diffContainer.innerHTML = "";
  } finally {
    if (button) button.disabled = false;
  }
}

function renderSupplierProfileImportDiff(result, diffContainer) {
  const summary = result.summary || {};
  const sample = result.preview || {};
  const blocks = [];
  blocks.push(`
    <div class="link-summary-grid">
      <div><strong>${number(summary.records_total)}</strong><span>fornecedores</span></div>
      <div><strong>${number(summary.new_suppliers)}</strong><span>fornecedores novos</span></div>
      <div><strong>${number(summary.updated_suppliers)}</strong><span>cadastros alterados</span></div>
      <div><strong>${number(summary.unchanged)}</strong><span>sem mudança</span></div>
      ${summary.skipped ? `<div><strong>${number(summary.skipped)}</strong><span>avisos</span></div>` : ""}
    </div>
  `);
  if ((sample.skipped || []).length) {
    blocks.push(`<div class="link-list warn"><strong>Avisos da planilha (${number(summary.skipped)})</strong>${sample.skipped.map((item) => `<div class="link-row">linha ${number(item.line)}: ${escapeHtml(item.supplier)} - ${escapeHtml(item.reason)}</div>`).join("")}</div>`);
  }
  if ((sample.new_suppliers || []).length) {
    blocks.push(`<div class="link-list"><strong>Fornecedores que serão criados (${number(summary.new_suppliers)})</strong>${sample.new_suppliers.map((item) => `<div class="link-row">${escapeHtml(item.supplier)}: ${(item.fields || []).map((field) => `<em>${escapeHtml(field.label)}: ${escapeHtml(field.to)}</em>`).join(" ")}</div>`).join("")}</div>`);
  }
  if ((sample.updates || []).length) {
    blocks.push(`<div class="link-list"><strong>Cadastros que serão atualizados (${number(summary.updated_suppliers)})</strong>${sample.updates.map((item) => `<div class="link-row">${escapeHtml(item.supplier)}: ${(item.changes || []).map((change) => `<em>${escapeHtml(change.label)}: ${escapeHtml(change.from || "vazio")} &rarr; <strong>${escapeHtml(change.to)}</strong></em>`).join(" ")}</div>`).join("")}</div>`);
  }
  blocks.push(`
    <div class="refresh-confirm-row">
      <button class="action-button" type="button" id="linkImportConfirm">Confirmar e gravar dados</button>
    </div>
  `);
  diffContainer.innerHTML = blocks.join("");
  document.querySelector("#linkImportConfirm")?.addEventListener("click", confirmLinkImport);
}

function renderLinkImportDiff(result) {
  const diffContainer = document.querySelector("#linkImportDiff");
  if (!diffContainer) return;
  if (result.mode === "supplier_profile") {
    renderSupplierProfileImportDiff(result, diffContainer);
    return;
  }
  const summary = result.summary || {};
  const sample = result.preview || {};
  const labels = result.labels || {};
  const blocks = [];
  blocks.push(`
    <div class="link-summary-grid">
      <div><strong>${number(summary.pairs_total)}</strong><span>pares unicos</span></div>
      <div><strong>${number(summary.new_source)}</strong><span>${escapeHtml(labels.source_create || "origem")}(s) novas</span></div>
      <div><strong>${number(summary.new_target)}</strong><span>${escapeHtml(labels.target_create || "destino")}(s) novos</span></div>
      <div><strong>${number(summary.new_links)}</strong><span>vínculos novos</span></div>
      <div><strong>${number(summary.overrides)}</strong><span>vínculos alterados</span></div>
      <div><strong>${number(summary.unchanged)}</strong><span>sem mudança</span></div>
      ${summary.unresolved ? `<div><strong>${number(summary.unresolved)}</strong><span>não encontrados</span></div>` : ""}
    </div>
  `);
  if (summary.unresolved) {
    blocks.push(`<div class="link-list warn"><strong>${number(summary.unresolved)} entrada(s) não encontradas no cadastro</strong>${(sample.unresolved || []).map((u) => `<div class="link-row">linha ${number(u.line)}: ${escapeHtml(u.value)}</div>`).join("")}<p class="muted-line">Esses itens serão ignorados no commit.</p></div>`);
  }
  if ((sample.new_source || []).length) {
    blocks.push(`<div class="link-list"><strong>${escapeHtml(labels.source_create || "Origem")}(s) que serão criadas (${number(summary.new_source)})</strong><div class="link-tag-row">${sample.new_source.map((n) => `<em class="refresh-tag">${escapeHtml(n)}</em>`).join(" ")}${summary.new_source > sample.new_source.length ? ` <em class="refresh-tag">+${number(summary.new_source - sample.new_source.length)}</em>` : ""}</div></div>`);
  }
  if ((sample.new_target || []).length) {
    blocks.push(`<div class="link-list"><strong>${escapeHtml(labels.target_create || "Destino")}(s) que serão criados (${number(summary.new_target)})</strong><div class="link-tag-row">${sample.new_target.map((n) => `<em class="refresh-tag">${escapeHtml(n)}</em>`).join(" ")}${summary.new_target > sample.new_target.length ? ` <em class="refresh-tag">+${number(summary.new_target - sample.new_target.length)}</em>` : ""}</div></div>`);
  }
  if ((sample.overrides || []).length) {
    blocks.push(`<div class="link-list warn"><strong>Vínculos que serão sobrescritos (${number(summary.overrides)})</strong>${sample.overrides.map((o) => `<div class="link-row">${escapeHtml(o.source)}: <em>${escapeHtml(o.from)}</em> &rarr; <strong>${escapeHtml(o.to)}</strong></div>`).join("")}</div>`);
  }
  if ((sample.new_links || []).length) {
    blocks.push(`<div class="link-list"><strong>Novos vínculos (${number(summary.new_links)})</strong>${sample.new_links.map((l) => `<div class="link-row">${escapeHtml(l.source)} &rarr; <strong>${escapeHtml(l.target)}</strong></div>`).join("")}</div>`);
  }
  blocks.push(`
    <div class="refresh-confirm-row">
      <button class="action-button" type="button" id="linkImportConfirm">Confirmar e gravar vínculos</button>
    </div>
  `);
  diffContainer.innerHTML = blocks.join("");
  document.querySelector("#linkImportConfirm")?.addEventListener("click", confirmLinkImport);
}

async function confirmLinkImport() {
  const file = state.linkImportFile;
  if (!file) return;
  const status = document.querySelector("#linkImportStatus");
  const button = document.querySelector("#linkImportConfirm");
  if (button) button.disabled = true;
  status.textContent = "Gravando vínculos...";
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const currentType = appendLinkImportMapping(formData);
    const commit = await apiPostForm("/api/links/commit", formData);
    cancelLinkImport();
    if (commit.mode === "supplier_profile" || currentType?.mode === "supplier_profile") {
      status.textContent = `${number(commit.upserted)} fornecedor(es) gravados (${number(commit.created_suppliers)} novos, ${number(commit.updated_suppliers)} atualizados${commit.unchanged ? `, ${number(commit.unchanged)} sem mudança` : ""}${commit.skipped ? `, ${number(commit.skipped)} ignorados` : ""}).`;
    } else {
      status.textContent = `${number(commit.upserted)} vínculos gravados (${number(commit.created_source)} origem novas, ${number(commit.created_target)} destino novos${commit.skipped_unresolved ? `, ${number(commit.skipped_unresolved)} ignorados por não encontrar no cadastro` : ""}).`;
    }
    const imports = await apiContract("/api/imports", "imports.v1");
    state.imports = imports;
    renderImports(imports);
  } catch (error) {
    status.textContent = error.message || "Não foi possível gravar os vínculos.";
    if (button) button.disabled = false;
  }
}

function referenceFileStatusText(file) {
  if (!file.exists) return "Não encontrado";
  if (file.needs_update && file.last_imported_at) return "Modificado";
  if (file.needs_update) return "Novo";
  return "Atual";
}

function referenceFileTone(file) {
  if (!file.exists) return "warn";
  if (file.needs_update) return "good";
  return "muted";
}

function referenceFileMeta(file) {
  const parts = [];
  if (file.modified_at) parts.push(`arquivo ${shortDateTime(file.modified_at)}`);
  if (file.last_imported_at) parts.push(`ultimo lote ${shortDateTime(file.last_imported_at)}`);
  if (Number(file.rows_imported || 0)) parts.push(`${number(file.rows_imported)} linhas`);
  return parts.join(" - ") || "Sem histórico de importação.";
}

function renderRefreshTargets(targets = []) {
  const panel = document.querySelector("#refreshTargetsPanel");
  const list = document.querySelector("#refreshTargets");
  if (!panel || !list) return;
  const local = state.imports?.local_reference || {};
  const files = local.files || [];
  const configured = Boolean(local.configured);
  const folderExists = Boolean(local.folder_exists);
  const updateCount = files.filter((file) => file.exists && file.needs_update).length;
  const existingCount = files.filter((file) => file.exists).length;
  if (!configured && !files.length) {
    panel.hidden = true;
    list.innerHTML = "";
    return;
  }
  const alertClass = !configured || !folderExists ? "warn" : updateCount ? "good" : "neutral";
  const alertText = !configured
    ? "Defina a pasta onde ficam os arquivos do ERP para habilitar a atualização rapida."
    : !folderExists
      ? "A pasta salva não foi encontrada. Confira o caminho antes de atualizar."
      : updateCount
        ? `${number(updateCount)} arquivo(s) de referência mudaram desde a última importação.`
        : "Arquivos de referência iguais ao ultimo lote importado.";
  panel.hidden = false;
  list.innerHTML = `
    <div class="refresh-folder-card">
      <label for="referenceFolderInput">Pasta de referência</label>
      <div class="refresh-folder-row">
        <input class="inline-input" id="referenceFolderInput" type="text" value="${escapeAttr(local.folder || "")}" placeholder="C:\\caminho\\das\\planilhas" />
        <button class="secondary-button" id="referenceFolderSave" type="button">Salvar pasta</button>
      </div>
    </div>
    <p class="refresh-local-alert ${escapeAttr(alertClass)}">${escapeHtml(alertText)}</p>
    <div class="refresh-file-list">
      ${files
        .map((file) => {
          const checked = file.exists && file.needs_update ? "checked" : "";
          const disabled = file.exists ? "" : "disabled";
          return `
            <label class="refresh-file-row ${escapeAttr(referenceFileTone(file))}">
              <input type="checkbox" data-reference-file="${escapeAttr(file.file_name || "")}" ${checked} ${disabled} />
              <span>
                <strong>${escapeHtml(file.file_name || "Arquivo")}</strong>
                <em>${escapeHtml(referenceFileMeta(file))}</em>
              </span>
              <b>${escapeHtml(referenceFileStatusText(file))}</b>
            </label>
          `;
        })
        .join("") || `<div class="info-card"><strong>Nenhuma fonte conhecida</strong><span>Importe as planilhas pelo fluxo manual uma vez.</span></div>`}
    </div>
    <div class="refresh-confirm-row">
      <button class="action-button" id="refreshSelectedLocalBtn" type="button" ${configured && folderExists && existingCount ? "" : "disabled"}>Atualizar selecionados</button>
      <button class="secondary-button" id="selectModifiedReferenceFiles" type="button" ${updateCount ? "" : "disabled"}>Selecionar alterados</button>
      <button class="secondary-button" id="selectAllReferenceFiles" type="button" ${existingCount ? "" : "disabled"}>Selecionar todos</button>
    </div>
  `;
  state.refreshTargets = targets;
  return;
  list.innerHTML = targets
    .map((target, index) => {
      const fields = (target.mapped_fields || []).map((f) => `<em class="refresh-tag">${escapeHtml(f)}</em>`).join(" ");
      const more = Number(target.mapped_field_count || 0) > (target.mapped_fields || []).length
        ? ` <em class="refresh-tag">+${Number(target.mapped_field_count) - (target.mapped_fields || []).length}</em>`
        : "";
      return `
        <article class="refresh-target-card" data-refresh-index="${index}">
          <header>
            <strong>${escapeHtml(target.file_name || "Planilha")}</strong>
            <span>${escapeHtml(shortDateTime(target.last_imported_at))} / ${number(target.rows_imported)} linhas / ${number(target.mapped_field_count)} campos</span>
          </header>
          <div class="refresh-fields">${fields}${more}</div>
          <button class="secondary-button" type="button" data-refresh-index="${index}">Selecionar arquivo novo</button>
        </article>
      `;
    })
    .join("");
  state.refreshTargets = targets;
}

function setReferenceFileSelection(mode) {
  document.querySelectorAll("[data-reference-file]").forEach((input) => {
    if (input.disabled) return;
    const file = (state.imports?.local_reference?.files || []).find((item) => item.file_name === input.dataset.referenceFile);
    input.checked = mode === "all" ? true : Boolean(file?.needs_update);
  });
}

function renderLocalRefreshResults(results = []) {
  if (!results.length) return "";
  return results
    .map((item) => {
      if (!item.ok) return `${item.file_name}: ${item.error || "não atualizado"}`;
      const impact = erpImportImpactText(item.summary || {});
      return `${item.file_name}: ${number(item.summary?.mapped_rows || 0)} linhas${impact ? `; ${impact}` : ""}`;
    })
    .join(" | ");
}

async function saveReferenceFolder() {
  const input = document.querySelector("#referenceFolderInput");
  const status = document.querySelector("#refreshTargetStatus");
  if (!input || !status) return;
  status.textContent = "Salvando pasta de referência...";
  try {
    const result = await apiPost("/api/imports/reference-folder", { folder: input.value.trim() });
    state.imports = result.imports;
    renderImports(result.imports);
    document.querySelector("#refreshTargetStatus").textContent = "Pasta salva.";
  } catch (error) {
    status.textContent = error.message || "Não foi possível salvar a pasta.";
  }
}

async function refreshSelectedLocalFiles() {
  const selected = [...document.querySelectorAll("[data-reference-file]:checked")]
    .map((input) => input.dataset.referenceFile)
    .filter(Boolean);
  const status = document.querySelector("#refreshTargetStatus");
  const button = document.querySelector("#refreshSelectedLocalBtn");
  if (!status) return;
  if (!selected.length) {
    status.textContent = "Selecione pelo menos um arquivo.";
    return;
  }
  if (button) button.disabled = true;
  status.textContent = `Atualizando ${number(selected.length)} arquivo(s)...`;
  try {
    const result = await apiPost("/api/imports/refresh-local", { file_names: selected });
    state.imports = result.imports;
    renderImports(result.imports);
    const message = renderLocalRefreshResults(result.results || []);
    document.querySelector("#refreshTargetStatus").textContent = message || "Atualização concluida.";
  } catch (error) {
    status.textContent = error.message || "Não foi possível atualizar os arquivos.";
    if (button) button.disabled = false;
  }
}

async function startRefreshTarget(index) {
  const target = (state.refreshTargets || [])[index];
  if (!target) return;
  state.activeRefreshTarget = target;
  const input = document.querySelector("#refreshTargetFile");
  if (!input) return;
  input.value = "";
  input.click();
}

async function handleRefreshTargetFile(event) {
  const file = event.target.files?.[0];
  const target = state.activeRefreshTarget;
  const status = document.querySelector("#refreshTargetStatus");
  const preview = document.querySelector("#refreshTargetPreview");
  if (!file || !target || !status) return;
  status.textContent = `Analisando ${file.name}...`;
  preview.innerHTML = "";
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const result = await apiPostForm("/api/erp/import-preview", formData);
    state.refreshFile = file;
    state.refreshAnalysis = result;
    const totalCols = result.summary?.columns || 0;
    const reused = result.summary?.reused_mappings || 0;
    const totalRows = result.summary?.rows || 0;
    const reviewNeeded = Number(result.summary?.required_review || 0);
    const allReused = reused === totalCols && totalCols > 0;
    const ratio = totalCols ? Math.round((reused / totalCols) * 100) : 0;
    const warning = allReused
      ? `<p class="refresh-callout good">Todos os ${number(totalCols)} campos foram reaproveitados do mapeamento anterior.</p>`
      : `<p class="refresh-callout warn">${number(reused)} de ${number(totalCols)} campos reaproveitados (${ratio}%). ${reviewNeeded ? `${number(reviewNeeded)} coluna(s) precisariam de revisão no fluxo manual.` : ""}</p>`;
    preview.innerHTML = `
      <div class="refresh-summary">
        <div>
          <strong>${escapeHtml(file.name)}</strong>
          <span>${number(totalRows)} linhas / ${number(totalCols)} colunas / ${number(result.sheets?.length || 0)} aba(s)</span>
        </div>
        ${warning}
        <div class="refresh-confirm-row">
          <button class="action-button" type="button" id="refreshConfirmBtn" ${allReused ? "" : "disabled"}>Confirmar e gravar lote</button>
          <button class="text-button" type="button" id="refreshCancelBtn">Cancelar</button>
        </div>
      </div>
    `;
    document.querySelector("#refreshConfirmBtn")?.addEventListener("click", commitRefreshTarget);
    document.querySelector("#refreshCancelBtn")?.addEventListener("click", () => {
      state.refreshFile = null;
      state.refreshAnalysis = null;
      preview.innerHTML = "";
      status.textContent = "Cancelado.";
    });
    if (allReused) {
      status.textContent = "Pronto para gravar - confira o resumo e confirme.";
    } else {
      status.textContent = "Mapeamento parcial. Para revisar campos manualmente, use o uploader principal abaixo.";
    }
  } catch (error) {
    status.textContent = error.message || "Não foi possível analisar o arquivo.";
  }
}

async function commitRefreshTarget() {
  const file = state.refreshFile;
  const analysis = state.refreshAnalysis;
  const status = document.querySelector("#refreshTargetStatus");
  const preview = document.querySelector("#refreshTargetPreview");
  if (!file || !analysis || !status) return;
  const button = document.querySelector("#refreshConfirmBtn");
  if (button) button.disabled = true;
  status.textContent = "Gravando lote...";
  try {
    const mappings = (analysis.sheets || []).map((sheet, sheetIndex) => ({
      sheet_index: sheetIndex,
      sheet_name: sheet.sheet_name,
      signature: sheet.signature,
      columns: (sheet.columns || []).map((column) => {
        const suggestion = column.suggestion || {};
        return {
          index: column.index,
          header: column.header,
          entity: suggestion.entity || "ignorar",
          field: suggestion.field || "ignorar",
          label: suggestion.label || "Ignorar / não mapeado",
        };
      }),
    }));
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("import_mode", "configured_update");
    formData.append("mappings", JSON.stringify(mappings));
    const result = await apiPostForm("/api/erp/import-commit", formData);
    state.imports = result.imports;
    renderImports(result.imports);
    state.refreshFile = null;
    state.refreshAnalysis = null;
    preview.innerHTML = "";
    const impact = erpImportImpactText(result.summary || {});
    status.textContent = `Lote gravado: ${number(result.summary?.mapped_rows || 0)} linhas lidas${impact ? `; impacto: ${impact}` : ""}${result.summary?.supplier_profiles_imported ? `, ${number(result.summary.supplier_profiles_imported)} fornecedor(es) atualizados` : ""}.`;
  } catch (error) {
    status.textContent = error.message || "Não foi possível gravar o lote.";
    if (button) button.disabled = false;
  }
}

function renderImports(payload) {
  state.imports = payload;
  const batches = payload.batches || [];
  const issues = payload.issues || [];
  const changes = payload.changes || [];
  const quality = payload.quality || {};
  const qualitySummary = quality.summary || {};
  const lastBatch = batches[0] || {};
  renderImportDataGuide(payload.readiness || {});
  focusImportFromOnboarding();
  document.querySelector("#importDashboardCharts").innerHTML = importDashboardCharts(payload);
  renderKpiGrid("#importsSummary", [
    ["Lotes", number(batches.length), "blue"],
    ["Confiança", `${number(quality.score || 0)}%`, quality.status === "ready" ? "green" : quality.status === "blocked" ? "red" : "amber"],
    ["Linhas mapeadas", number(qualitySummary.mapped_rows || 0), "green"],
    ["Issues", number(issues.length), issues.length ? "amber" : "green"],
    ["Mudanças detectadas", number(changes.length), ""],
    ["Ultimo status", importStatusLabel(lastBatch.status), lastBatch.status === "completed" ? "green" : "amber"],
    ["Blocos cobertos", number((payload.readiness?.plan || []).filter((item) => importPlanStatus(item).cls === "good").length), "green"],
    ["Parciais", number((payload.readiness?.plan || []).filter((item) => importPlanStatus(item).cls === "warn").length), "amber"],
    ["Faltando", number((payload.readiness?.plan || []).filter((item) => importPlanStatus(item).cls === "danger").length), ""],
    ["Fontes desejadas", number((payload.readiness?.plan || []).length), "blue"],
  ]);
  insightCards("#importInsights", [
    {
      title: quality.latest_batch_id ? `Confiança do lote: ${number(quality.score || 0)}%` : "Confiança ainda não calculada",
      body: quality.latest_batch_id ? `${quality.next_step || "Revise o diagnóstico do lote antes da rotina."}` : "Importe uma planilha para gerar o diagnóstico de qualidade.",
      actions: [
        {
          label: quality.status === "ready" ? "Registrar leitura confiavel" : "Revisar qualidade",
          title: "Qualidade da importação",
          body: quality.checks?.map((item) => item.title).join("; ") || "Sem diagnóstico do ultimo lote.",
          action: "import_quality_review",
          target_type: "import_batch",
          target_id: quality.latest_batch_id || "imports_view",
          scope: "Reconciliação da importação",
        },
      ],
    },
    {
      title: lastBatch.id ? `Última importação: ${importBatchTitle(lastBatch)}` : "Nenhum lote registrado",
      body: lastBatch.id ? importBatchMeta(lastBatch) : "Execute a importação para montar a base analítica local.",
    },
    {
      title: issues.length ? "Pontos de atencao" : "Base sem issues recentes",
      body: issues.length ? `${number(issues.length)} issues aparecem no histórico de importação. Resolva os mais severos antes de confiar nos indicadores.` : "Não há issues listadas no retorno atual da API de importação.",
      actions: [
        {
          label: issues.length ? "Investigar issues" : "Confirmar leitura",
          title: issues.length ? "Investigação em lote da importação" : "Confirmação da importação",
          action: issues.length ? "import_issues_bulk_review" : "import_health_confirmed",
          target_type: "import",
          target_id: lastBatch.id || "imports_view",
          target_ids: issues.map((item) => `${item.severity}:${item.code}`),
          scope: issues.length ? "Issues recentes de importação" : "Saúde da importação",
          bulk: issues.length > 1,
          decisions: issues.length ? ["Investigar agora", "Aceitar risco", "Aguardar próxima importação", "Pedir ajuste no conector"] : ["Base confiavel", "Conferir depois"],
        },
      ],
    },
    {
      title: "Mudanças de cadastro",
      body: changes.length ? `${number(changes.length)} mudanças foram detectadas em entidades importadas. Elas ajudam a auditar preço, custo, nome e outros campos espelhados do ERP.` : "Nenhuma mudança recente foi listada.",
      actions: [
        {
          label: changes.length ? "Revisar mudanças" : "Anotar nada mudou",
          title: "Revisão de mudanças do ERP",
          action: "import_changes_review",
          target_type: "import_changes",
          target_id: lastBatch.id || "imports_view",
          target_ids: changes.map((item) => `${item.entity_type}:${item.source_code}:${item.field_name}`),
          scope: "Mudanças detectadas na importação",
          bulk: changes.length > 1,
          decisions: changes.length ? ["Aceitar mudanças", "Investigar alterações", "Atualizar regra", "Ignorar por enquanto"] : ["Sem mudança relevante"],
        },
      ],
    },
  ]);
  document.querySelector("#batches").innerHTML = batches
    .map((batch) => {
      const fileNames = importBatchFileNames(batch);
      const counts = importBatchCountItems(batch);
      const period = batch.source_period_start || batch.source_period_end
        ? `${shortDate(batch.source_period_start)} a ${shortDate(batch.source_period_end)}`
        : "";
      return `
        <article class="import-batch-card">
          <header>
            <div>
              <strong>${escapeHtml(importBatchTitle(batch))}</strong>
              <span>${escapeHtml(batch.id || "Lote sem ID")}</span>
            </div>
            <b class="${escapeAttr(importStatusClass(batch.status))}">${escapeHtml(importStatusLabel(batch.status))}</b>
          </header>
          <div class="import-batch-meta">
            ${period ? `<em>Período: ${escapeHtml(period)}</em>` : ""}
            ${batch.started_at ? `<em>Início: ${escapeHtml(shortDateTime(batch.started_at))}</em>` : ""}
            ${batch.finished_at ? `<em>Fim: ${escapeHtml(shortDateTime(batch.finished_at))}</em>` : ""}
          </div>
          <div class="import-batch-files" aria-label="Arquivos do lote">
            ${fileNames.length ? fileNames.map((name) => `<em>${escapeHtml(name)}</em>`).join("") : `<em>Sem arquivo registrado</em>`}
          </div>
          ${counts.length ? `<div class="import-batch-counts">${counts.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        </article>
      `;
    })
    .join("") || `<div class="import-batch-card empty"><strong>Nenhum lote</strong><span>Importacoes futuras aparecerao aqui.</span></div>`;
  renderRefreshTargets(payload.refresh_targets || []);
  const issueCards = [
    ...issues.map((item) => {
      const guidance = importIssueGuidance(item);
      return {
        title: `${guidance.category} - ${item.code}`,
        body: `${item.message || ""} Efeito: ${guidance.effect} Correção: ${guidance.fix}`,
      };
    }),
    ...changes.map((item) => ({
      title: `${item.entity_type} - ${item.field_name}`,
      body: `Mudança vinda do ERP: ${item.previous_value || "(vazio)"} -> ${item.new_value || "(vazio)"}. Efeito: ajuda a auditar cadastro, custo, preço ou nome importado. Correção: aceite a mudança se ela reflete o ERP atual ou investigue possível reuso de código.`,
    })),
  ].slice(0, 30);
  document.querySelector("#issues").innerHTML = issueCards
    .map((item) => `<div class="info-card"><strong>${item.title}</strong><span>${item.body}</span></div>`)
    .join("") || `<div class="info-card"><strong>Nenhum alerta</strong><span>Não há issues ou mudanças recentes para listar.</span></div>`;
}

