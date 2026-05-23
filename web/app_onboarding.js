function onboardingSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "empresa";
}

function defaultOnboardingData(context = {}) {
  const config = context.public_config || state.appConfig || {};
  const org = context.organization || {};
  const profile = context.profile || {};
  const store = context.store || {};
  const operation = context.operation || {};
  const companyName = profile.trade_name || profile.legal_name || org.name || "";
  return {
    company: {
      organization_id: org.id || "",
      trade_name: profile.trade_name || org.name || "",
      legal_name: profile.legal_name || "",
      document: profile.document || org.document || "",
      phone: profile.phone || "",
      email: profile.email || "",
      website: profile.website || "",
      city: profile.city || "",
      state: profile.state || "",
      country: profile.country || "Brasil",
    },
    branding: {
      app_name: config.app_name || appName(),
      app_subtitle: config.app_subtitle || appSubtitle(),
      logo_path: config.logo_path || appLogoPath(),
      logo_preview: "",
      logo_original: "",
      logo_adjust: { fit: "contain", zoom: 1, x: 0, y: 0 },
      logo_upload: null,
    },
    admin: {
      name: "",
      login_name: "",
      email: "",
      password: "",
    },
    operation: {
      store_name: store.name || companyName || "",
      segment: operation.segment || "",
      store_count: operation.store_count || "",
      sku_count: operation.sku_count || "",
      supplier_count: operation.supplier_count || "",
      sells_products: operation.sells_products !== false,
      sells_services: Boolean(operation.sells_services),
      sells_online: Boolean(operation.sells_online),
      has_delivery: Boolean(operation.has_delivery),
      tracks_inventory_by_store: operation.tracks_inventory_by_store !== false,
      uses_customer_history: operation.uses_customer_history !== false,
      purchase_cycle: operation.purchase_cycle || "weekly",
      replenishment_style: operation.replenishment_style || "mixed",
      minimum_order_policy: operation.minimum_order_policy || "by_supplier",
      pricing_strategy: operation.pricing_strategy || "margin",
      data_priority: operation.data_priority || "produtos_estoque",
      source_system: operation.source_system || "ready_files",
      next_after_onboarding: operation.next_after_onboarding || "imports",
    },
  };
}

const ONBOARDING_STEPS = [
  { key: "operation", label: "Boas-vindas", icon: "sparkles" },
  { key: "company", label: "Empresa", icon: "building-2" },
  { key: "admin", label: "Acesso", icon: "shield-check" },
  { key: "branding", label: "Documentos", icon: "file-badge" },
  { key: "data", label: "Dados", icon: "database" },
  { key: "review", label: "Revis?o", icon: "check-circle-2" },
];

let onboardingState = {
  context: null,
  stepIndex: 0,
  data: defaultOnboardingData(),
  slugTouched: false,
  adminLoginTouched: false,
  importFile: null,
  importPreview: null,
  importPreviewError: "",
  importPreviewLoading: false,
};

function ensureCompanyOrganizationId() {
  const company = onboardingState.data.company;
  const current = String(company.organization_id || "").trim();
  if (current && current !== "org_default") return;
  company.organization_id = onboardingSlug(company.trade_name || company.legal_name || "empresa");
}

function ensureOperationDefaults() {
  const operation = onboardingState.data.operation;
  const company = onboardingState.data.company;
  if (!String(operation.store_name || "").trim() || operation.store_name === "Loja principal") {
    operation.store_name = company.trade_name || company.legal_name || "Unidade principal";
  }
}

function ensureAdminLogin() {
  const admin = onboardingState.data.admin;
  if (String(admin.login_name || "").trim()) return;
  admin.login_name = onboardingSlug(admin.email || admin.name || "admin");
}

function onboardingField(path, value) {
  const [section, key] = path.split(".");
  onboardingState.data[section][key] = value;
}

function onboardingDraftKey(context = onboardingState.context) {
  const tenant = state.appConfig?.tenant || context?.public_config?.tenant || "legacy";
  return `pulso:onboarding:draft:${tenant || "legacy"}`;
}

function onboardingDraftData() {
  const data = structuredClone(onboardingState.data);
  data.admin.password = "";
  data.branding.logo_preview = "";
  data.branding.logo_original = "";
  data.branding.logo_upload = null;
  return {
    stepIndex: onboardingState.stepIndex,
    data,
  };
}

function saveOnboardingDraft() {
  try {
    localStorage.setItem(onboardingDraftKey(), JSON.stringify(onboardingDraftData()));
  } catch (error) {
    // Sem rascunho local quando o navegador bloqueia armazenamento.
  }
}

function clearOnboardingDraft() {
  try {
    localStorage.removeItem(onboardingDraftKey());
  } catch (error) {
    // Nada a limpar quando o armazenamento local está indisponível.
  }
}

function mergeOnboardingData(base, draft) {
  return {
    company: { ...base.company, ...(draft.company || {}) },
    branding: { ...base.branding, ...(draft.branding || {}), logo_preview: "", logo_original: "", logo_upload: null },
    admin: { ...base.admin, ...(draft.admin || {}), password: "" },
    operation: { ...base.operation, ...(draft.operation || {}) },
  };
}

function loadOnboardingDraft(context, baseData) {
  try {
    const draft = JSON.parse(localStorage.getItem(onboardingDraftKey(context)) || "{}");
    if (!draft || !draft.data) return { stepIndex: null, data: baseData };
    return {
      stepIndex: Number.isFinite(Number(draft.stepIndex)) ? Number(draft.stepIndex) : null,
      data: mergeOnboardingData(baseData, draft.data),
    };
  } catch (error) {
    return { stepIndex: null, data: baseData };
  }
}

function onboardingInput(path, label, options = {}) {
  const [section, key] = path.split(".");
  const value = onboardingState.data[section]?.[key] || "";
  return `
    <label class="onboarding-field">
      <span>${escapeHtml(label)}</span>
      <input
        class="inline-input"
        data-onboarding-field="${escapeAttr(path)}"
        value="${inputValue(value)}"
        ${options.type ? `type="${escapeAttr(options.type)}"` : ""}
        name="${escapeAttr(options.name || path.replace(".", "_"))}"
        ${options.autocomplete ? `autocomplete="${escapeAttr(options.autocomplete)}"` : ""}
        ${options.inputmode ? `inputmode="${escapeAttr(options.inputmode)}"` : ""}
        ${options.placeholder ? `placeholder="${escapeAttr(options.placeholder)}"` : ""}
        ${options.required ? "required" : ""}
        ${options.maxlength ? `maxlength="${escapeAttr(options.maxlength)}"` : ""}
      />
    </label>
  `;
}

function onboardingSelect(path, label, options = []) {
  const [section, key] = path.split(".");
  const value = onboardingState.data[section]?.[key] || "";
  return `
    <label class="onboarding-field">
      <span>${escapeHtml(label)}</span>
      <select class="inline-input" data-onboarding-field="${escapeAttr(path)}">
        ${options.map((item) => `<option value="${escapeAttr(item.value)}" ${item.value === value ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function onboardingToggle(path, label, detail) {
  const [section, key] = path.split(".");
  const checked = Boolean(onboardingState.data[section]?.[key]);
  return `
    <label class="onboarding-toggle">
      <input type="checkbox" data-onboarding-field="${escapeAttr(path)}" ${checked ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(label)}</strong>
        <em>${escapeHtml(detail || "")}</em>
      </span>
    </label>
  `;
}

function onboardingDestinationChoice(value, title, detail, icon) {
  const active = onboardingState.data.operation.next_after_onboarding === value;
  return `
    <button class="onboarding-destination ${active ? "active" : ""}" type="button" data-onboarding-destination="${escapeAttr(value)}">
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>
        <strong>${escapeHtml(title)}</strong>
        <em>${escapeHtml(detail)}</em>
      </span>
    </button>
  `;
}

function onboardingImportPreviewMarkup() {
  const file = onboardingState.importFile;
  const preview = onboardingState.importPreview;
  const error = onboardingState.importPreviewError;
  const loading = onboardingState.importPreviewLoading;
  if (preview) {
    const summary = preview.summary || {};
    const assistant = preview.assistant || {};
    const feeds = assistant.feeds || [];
    const warnings = assistant.alignment_warnings || [];
    const missing = assistant.missing_critical || [];
    const lowConfidence = assistant.low_confidence_fields || [];
    const risk = assistant.risk === "alto" ? "Precisa revisar" : assistant.risk === "medio" ? "Conferir antes de gravar" : "Boa primeira leitura";
    const riskClass = assistant.risk === "alto" ? "danger" : assistant.risk === "medio" ? "warn" : "good";
    return `
      <section class="onboarding-file-result ${riskClass}">
        <div class="onboarding-file-result-head">
          <span>Primeira leitura</span>
          <strong>${escapeHtml(assistant.title || preview.file_name || file?.name || "Arquivo analisado")}</strong>
          <em>${escapeHtml(risk)}</em>
        </div>
        <div class="onboarding-file-metrics">
          <div><span>Linhas</span><strong>${number(summary.rows || 0)}</strong></div>
          <div><span>Colunas</span><strong>${number(summary.columns || 0)}</strong></div>
          <div><span>Abas</span><strong>${number((preview.sheets || []).length || 1)}</strong></div>
        </div>
        <p>${escapeHtml(assistant.action || "O arquivo foi lido. Na pr?xima tela voc? confere o mapeamento antes de gravar qualquer dado.")}</p>
        ${feeds.length ? `<div class="onboarding-file-tags">${feeds.slice(0, 5).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        ${warnings.length ? `<div class="onboarding-file-alert"><strong>Aten??o no formato</strong><span>${escapeHtml(warnings[0].message || "Algumas linhas parecem desalinhadas com o cabe?alho.")}</span></div>` : ""}
        ${missing.length || lowConfidence.length ? `<div class="onboarding-file-alert"><strong>O que conferir depois</strong><span>${escapeHtml([...missing.map((item) => item.label || item.field), ...lowConfidence].slice(0, 5).join(", "))}</span></div>` : ""}
      </section>
    `;
  }
  if (error) {
    return `<div class="onboarding-file-empty danger"><strong>N?o conseguimos ler esse arquivo ainda.</strong><span>${escapeHtml(error)}</span></div>`;
  }
  if (loading) {
    return `<div class="onboarding-file-empty"><strong>Analisando o arquivo...</strong><span>Lendo estrutura, colunas e poss?veis usos no sistema.</span></div>`;
  }
  if (file) {
    return `<div class="onboarding-file-empty"><strong>${escapeHtml(file.name)}</strong><span>Arquivo selecionado. Clique em Analisar primeira leitura para ver o que o sistema entende.</span></div>`;
  }
  return `<div class="onboarding-file-empty"><strong>Nenhum arquivo escolhido.</strong><span>Escolha qualquer primeira base dispon?vel: produtos, estoque, vendas, clientes, fornecedores, servi?os, pre?os ou movimenta??es.</span></div>`;
}

function onboardingLogoUploadMarkup() {
  const data = onboardingState.data.branding;
  const logo = data.logo_preview || data.logo_path || appLogoPath();
  const adjust = data.logo_adjust || { fit: "contain", zoom: 1, x: 0, y: 0 };
  const fileName = data.logo_upload?.file_name || "";
  return `
    <div class="onboarding-logo-upload">
      <div class="onboarding-logo-upload-preview">
        <img src="${escapeAttr(logo)}" alt="Logo" />
        <div>
          <strong>${fileName ? escapeHtml(fileName) : "Logo da empresa"}</strong>
          <span>${fileName ? "Arquivo selecionado" : "PNG, JPG, WEBP ou SVG at? 2 MB"}</span>
        </div>
      </div>
      <label class="secondary-button onboarding-logo-upload-button">
        <i data-lucide="upload-cloud"></i>
        <span>Enviar logo</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-onboarding-logo-file hidden />
      </label>
    </div>
    ${data.logo_original ? `
      <div class="onboarding-logo-editor">
        <div class="onboarding-logo-crop-preview">
          <img src="${escapeAttr(logo)}" alt="Logo ajustada" />
        </div>
        <div class="onboarding-logo-tools">
          <div class="onboarding-fit-toggle" role="group" aria-label="Modo de enquadramento">
            <button class="${adjust.fit === "contain" ? "active" : ""}" type="button" data-onboarding-logo-fit="contain">Ajustar</button>
            <button class="${adjust.fit === "cover" ? "active" : ""}" type="button" data-onboarding-logo-fit="cover">Preencher</button>
          </div>
          <label>
            <span>Zoom</span>
            <input type="range" min="0.75" max="2.4" step="0.05" value="${escapeAttr(adjust.zoom || 1)}" data-onboarding-logo-adjust="zoom" />
          </label>
          <label>
            <span>Horizontal</span>
            <input type="range" min="-160" max="160" step="2" value="${escapeAttr(adjust.x || 0)}" data-onboarding-logo-adjust="x" />
          </label>
          <label>
            <span>Vertical</span>
            <input type="range" min="-160" max="160" step="2" value="${escapeAttr(adjust.y || 0)}" data-onboarding-logo-adjust="y" />
          </label>
        </div>
      </div>
    ` : ""}
  `;
}

function makeLogoUploadFromCanvas(dataUrl, fileName = "logo.png") {
  return {
    file_name: fileName.replace(/\.[^.]+$/, "") + ".png",
    mime_type: "image/png",
    size: Math.round((dataUrl.length * 3) / 4),
    data_url: dataUrl,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function renderAdjustedLogo() {
  const branding = onboardingState.data.branding;
  if (!branding.logo_original) return;
  const adjust = branding.logo_adjust || { fit: "contain", zoom: 1, x: 0, y: 0 };
  const image = await loadImage(branding.logo_original);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scaleContain = Math.min(canvas.width / image.width, canvas.height / image.height);
  const scaleCover = Math.max(canvas.width / image.width, canvas.height / image.height);
  const baseScale = adjust.fit === "cover" ? scaleCover : scaleContain;
  const scale = baseScale * Number(adjust.zoom || 1);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (canvas.width - width) / 2 + Number(adjust.x || 0);
  const y = (canvas.height - height) / 2 + Number(adjust.y || 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, x, y, width, height);
  const dataUrl = canvas.toDataURL("image/png");
  branding.logo_preview = dataUrl;
  branding.logo_upload = makeLogoUploadFromCanvas(dataUrl, branding.logo_upload?.file_name || "logo.png");
}

function onboardingCurrentStep() {
  return ONBOARDING_STEPS[onboardingState.stepIndex] || ONBOARDING_STEPS[0];
}

function onboardingPasswordMinLength() {
  return Number(onboardingState.context?.password_min_length || 6);
}

function onboardingStepMarkup() {
  const step = onboardingCurrentStep().key;
  const data = onboardingState.data;
  if (step === "company") {
    return `
      <div class="onboarding-section-copy">
        <span>Empresa cliente</span>
        <h1>Informe s? o essencial para come?ar.</h1>
        <p>Os demais dados podem ser completados depois no perfil da empresa. Agora o importante ? identificar a instala??o e preparar os documentos.</p>
      </div>
      <div class="onboarding-grid two">
        ${onboardingInput("company.trade_name", "Nome da empresa", { required: true, maxlength: 160, placeholder: "Ex.: Loja Central", autocomplete: "organization", name: "organization" })}
        ${onboardingInput("company.document", "CNPJ / CPF", { maxlength: 40, inputmode: "numeric", name: "tax_id" })}
        ${onboardingInput("company.city", "Cidade", { maxlength: 120, autocomplete: "address-level2", name: "address-level2" })}
        ${onboardingInput("company.state", "UF", { maxlength: 40, autocomplete: "address-level1", name: "address-level1" })}
      </div>
      <details class="onboarding-extra-fields">
        <summary>Completar dados opcionais</summary>
        <div class="onboarding-grid two">
          ${onboardingInput("company.legal_name", "Raz?o social", { maxlength: 200, autocomplete: "organization", name: "company" })}
          ${onboardingInput("company.phone", "Telefone", { maxlength: 60, autocomplete: "tel", inputmode: "tel", name: "tel" })}
          ${onboardingInput("company.email", "E-mail", { type: "email", maxlength: 160, autocomplete: "email", name: "email" })}
          ${onboardingInput("company.website", "Site", { maxlength: 180, autocomplete: "url", name: "url" })}
          ${onboardingInput("company.country", "Pa?s", { maxlength: 80, autocomplete: "country-name", name: "country-name" })}
        </div>
      </details>
    `;
  }
  if (step === "branding") {
    return `
      <div class="onboarding-section-copy">
        <span>Documentos</span>
        <h1>Escolha a logo da empresa para relat?rios e PDFs.</h1>
        <p>A identidade do sistema j? vem pronta. Aqui voc? define como a empresa aparece nos documentos gerados pela instala??o.</p>
      </div>
      ${onboardingLogoUploadMarkup()}
      <div class="onboarding-brand-preview">
        <img src="${escapeAttr(data.branding.logo_preview || data.branding.logo_path || appLogoPath())}" alt="Logo" />
        <div>
          <strong>${escapeHtml(data.company.trade_name || data.company.legal_name || "Nome da empresa")}</strong>
          <span>Pr?via da marca nos documentos</span>
        </div>
      </div>
    `;
  }
  if (step === "admin") {
    return `
      <div class="onboarding-section-copy">
        <span>Acesso seguro</span>
        <h1>Crie o primeiro administrador.</h1>
        <p>Essa pessoa entra primeiro, termina a implanta??o, importa os dados e cria os outros usu?rios da empresa.</p>
      </div>
      <div class="onboarding-grid two">
        ${onboardingInput("admin.name", "Nome do administrador", { required: true, maxlength: 120 })}
        ${onboardingInput("admin.email", "E-mail opcional", { type: "email", maxlength: 160 })}
        ${onboardingInput("admin.login_name", "Login", { required: true, maxlength: 80, placeholder: "Gerado pelo nome se ficar em branco" })}
        ${onboardingInput("admin.password", "Senha inicial", { type: "password", required: true, maxlength: 120, placeholder: `M?nimo ${onboardingPasswordMinLength()} caracteres` })}
      </div>
    `;
  }
  if (step === "operation") {
    return `
      <div class="onboarding-section-copy">
        <span>Primeiro contato</span>
        <h1>Seus arquivos come?am a virar clareza sobre a empresa.</h1>
        <p>O sistema l? produtos, estoque, vendas, clientes, fornecedores, servi?os, pre?os e movimenta??es para montar uma vis?o operacional da empresa: o que est? acontecendo, o que merece aten??o e quais dados ainda faltam para decidir melhor.</p>
      </div>
      <div class="onboarding-wow-strip">
        ${[
          ["Opera??o", "Prioridades, pend?ncias e sinais importantes aparecem em uma mesa ?nica."],
          ["Dados com sentido", "Produtos, vendas, estoque, clientes e fornecedores deixam de ser planilhas soltas."],
          ["Decis?o di?ria", "Margem, relacionamento, reposi??o, pre?os e tarefas ganham contexto."],
        ].map(([title, detail]) => `
          <article>
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(detail)}</span>
          </article>
        `).join("")}
      </div>
      <section class="onboarding-intro-panel" aria-label="Como o sistema come?a">
        <div class="onboarding-intro-head">
          <span>Como a implanta??o funciona</span>
          <strong>Voc? traz os arquivos. O sistema entende o significado. A empresa ganha uma base viva para gerenciar a opera??o.</strong>
        </div>
        <div class="onboarding-intro-flow">
          ${[
            ["1", "Come?ar", "Criamos a empresa e o primeiro acesso em poucos passos."],
            ["2", "Ler dados", "O importador analisa arquivos do ERP, planilhas ou bases soltas e mostra o que entendeu."],
            ["3", "Operar", "Com a base lida, produtos, clientes, vendas, estoque, pre?os e rotinas viram prioridades claras de gest?o."],
          ].map(([number, title, detail]) => `
            <article>
              <span>${escapeHtml(number)}</span>
              <strong>${escapeHtml(title)}</strong>
              <p>${escapeHtml(detail)}</p>
            </article>
          `).join("")}
        </div>
      </section>
      <div class="onboarding-value-list">
        ${[
          ["Sem precisar importar tudo no primeiro dia", "A empresa pode come?ar com o arquivo que tiver mais f?cil e completar a base depois."],
          ["Dados com significado", "C?digos, unidades, v?nculos, hist?rico e valores deixam de ser apenas colunas e passam a alimentar decis?es."],
          ["Mesa de opera??o", "A rotina deixa de depender de relat?rios soltos e passa a mostrar prioridades, riscos e a??es do dia."],
        ].map(([title, detail]) => `
          <article>
            <i data-lucide="check-circle-2"></i>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(detail)}</p>
          </article>
        `).join("")}
      </div>
    `;
  }
  if (step === "data") {
    return `
      <div class="onboarding-section-copy">
        <span>Primeira importa??o</span>
        <h1>Mostre um arquivo e veja o sistema começar a entender a empresa.</h1>
        <p>Voc? n?o precisa preparar tudo antes de come?ar. Escolha a primeira base dispon?vel e o sistema faz uma leitura inicial sem gravar nada.</p>
      </div>
      <section class="onboarding-data-lab" aria-label="Primeira leitura de dados">
        <div class="onboarding-data-picker">
          <div>
            <span>Primeira leitura</span>
            <strong>Escolha uma planilha ou exporta??o do ERP</strong>
            <p>Produtos, estoque, vendas, clientes, fornecedores, servi?os, pre?os ou movimenta??es. A leitura serve para orientar; a grava??o acontece s? no importador assistido.</p>
          </div>
          <label class="secondary-button onboarding-data-file">
            <i data-lucide="file-up"></i>
            <span>Escolher arquivo</span>
            <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xlsm,.xls" data-onboarding-import-file hidden />
          </label>
          <button class="action-button" type="button" data-onboarding-import-analyze ${onboardingState.importFile && !onboardingState.importPreviewLoading ? "" : "disabled"}>Analisar primeira leitura</button>
        </div>
        ${onboardingImportPreviewMarkup()}
      </section>
      <section class="onboarding-intro-panel compact" aria-label="Como a primeira importa??o funciona">
        <div class="onboarding-intro-flow">
          ${[
            ["1", "Ler", "O sistema identifica linhas, colunas e o prov?vel conte?do do arquivo."],
            ["2", "Entender", "Voc? v? o que essa base pode alimentar na opera??o."],
            ["3", "Gravar depois", "Na pr?xima tela, confere o mapeamento antes de salvar."],
          ].map(([number, title, detail]) => `
            <article>
              <span>${escapeHtml(number)}</span>
              <strong>${escapeHtml(title)}</strong>
              <p>${escapeHtml(detail)}</p>
            </article>
          `).join("")}
        </div>
      </section>
      <div class="onboarding-import-bridge">
        <div>
          <span>Pr?ximo passo</span>
          <strong>${onboardingState.importPreview ? "Leitura feita. Agora vale conferir e gravar." : "O caminho recomendado ? fazer a primeira leitura e abrir o importador."}</strong>
          <p>${onboardingState.importPreview ? "A pr?xima tela reaproveita o fluxo assistido para conferir colunas, resolver ambiguidades e gravar com seguran?a." : "Se preferir, voc? pode pular a leitura agora e escolher o arquivo direto no importador assistido."}</p>
        </div>
        <div class="onboarding-destination-grid">
          ${onboardingDestinationChoice("imports", "Abrir importa??o", "Ir direto para upload e mapeamento de planilhas.", "upload-cloud")}
          ${onboardingDestinationChoice("dashboard", "Abrir painel", "Entrar na mesa e importar depois.", "layout-dashboard")}
        </div>
      </div>
    `;
  }
  return `
    <div class="onboarding-section-copy">
      <span>Revis?o final</span>
      <h1>Pronto para abrir a empresa no sistema.</h1>
      <p>Confira os pontos principais. Ao concluir, o sistema cria a empresa, o primeiro acesso e prepara a pr?xima leitura de dados.</p>
    </div>
    <div class="onboarding-review">
      ${[
        ["Empresa", data.company.trade_name || data.company.legal_name || "Empresa"],
        ["Documentos", data.branding.logo_upload ? "Logo enviada" : "Usar logo atual"],
        ["Administrador", data.admin.name || data.admin.login_name || "A definir"],
        ["Primeiros dados", "Importa??o assistida"],
        ["Depois", data.operation.next_after_onboarding === "dashboard" ? "Abrir painel" : "Abrir importa??o"],
      ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    </div>
  `;
}

async function analyzeOnboardingImportFile() {
  if (!onboardingState.importFile || onboardingState.importPreviewLoading) return;
  onboardingState.importPreviewLoading = true;
  onboardingState.importPreviewError = "";
  onboardingState.importPreview = null;
  renderOnboarding();
  const formData = new FormData();
  formData.append("file", onboardingState.importFile, onboardingState.importFile.name);
  try {
    onboardingState.importPreview = await apiPostForm("/api/erp/import-preview", formData);
  } catch (error) {
    onboardingState.importPreviewError = error.message || "N?o foi poss?vel analisar o arquivo.";
  } finally {
    onboardingState.importPreviewLoading = false;
    renderOnboarding();
  }
}

function onboardingPreviewMarkup() {
  const data = onboardingState.data;
  const completion = Math.round(((onboardingState.stepIndex + 1) / ONBOARDING_STEPS.length) * 100);
  return `
    <aside class="onboarding-preview">
      <div class="onboarding-preview-brand">
        <img src="${escapeAttr(data.branding.logo_preview || data.branding.logo_path || appLogoPath())}" alt="Logo" />
        <div>
          <strong>${escapeHtml(data.branding.app_name || appName())}</strong>
          <span>${escapeHtml(data.branding.app_subtitle || appSubtitle())}</span>
        </div>
      </div>
      <div class="onboarding-progress-ring" style="--progress: ${completion}">
        <strong>${completion}%</strong>
        <span>implanta??o</span>
      </div>
      <div class="onboarding-document-preview">
        <span>Previa de documento</span>
        <strong>${escapeHtml(data.company.trade_name || data.company.legal_name || "Nome da empresa")}</strong>
        <em>${escapeHtml(data.company.document || "CNPJ / CPF")}</em>
        <p>${escapeHtml([data.company.city, data.company.state].filter(Boolean).join(" - ") || "Cidade / UF")}</p>
      </div>
      <div class="onboarding-next-card">
        <span>Depois da instala??o</span>
        <strong>${data.operation.next_after_onboarding === "dashboard" ? "Painel inicial" : "Importa??o assistida"}</strong>
        <p>${data.operation.next_after_onboarding === "dashboard" ? "A instala??o abre no painel, com a importa??o dispon?vel no menu." : "A instala??o abre direto no upload de planilhas e mapeamento dos dados."}</p>
      </div>
    </aside>
  `;
}

function renderOnboarding() {
  const gate = document.querySelector("#onboardingGate");
  if (!gate) return;
  const step = onboardingCurrentStep();
  gate.hidden = false;
  gate.className = "onboarding-gate";
  document.body.classList.add("onboarding-open");
  gate.innerHTML = `
    <section class="onboarding-shell" aria-labelledby="onboardingTitle">
      <header class="onboarding-top">
        <div class="onboarding-product">
          <img src="${escapeAttr(onboardingState.data.branding.logo_preview || onboardingState.data.branding.logo_path || appLogoPath())}" alt="${escapeAttr(appName())}" />
          <div>
            <strong>${escapeHtml(onboardingState.data.branding.app_name || appName())}</strong>
            <span>Implanta??o inicial</span>
          </div>
        </div>
        <div class="onboarding-stepper" aria-label="Etapas do onboarding">
          ${ONBOARDING_STEPS.map((item, index) => `
            <button class="${index === onboardingState.stepIndex ? "active" : ""} ${index < onboardingState.stepIndex ? "done" : ""}" type="button" data-onboarding-step="${index}">
              <i data-lucide="${escapeAttr(item.icon)}"></i>
              <span>${escapeHtml(item.label)}</span>
            </button>
          `).join("")}
        </div>
      </header>
      <main class="onboarding-body">
        <section class="onboarding-card">
          <div class="onboarding-card-head">
            <span>Etapa ${onboardingState.stepIndex + 1} de ${ONBOARDING_STEPS.length}</span>
            <strong id="onboardingTitle">${escapeHtml(step.label)}</strong>
          </div>
          ${onboardingStepMarkup()}
          <div class="onboarding-feedback" id="onboardingFeedback" hidden></div>
          <footer class="onboarding-actions">
            <button class="secondary-button" type="button" id="onboardingBack" ${onboardingState.stepIndex === 0 ? "disabled" : ""}>Voltar</button>
            <button class="action-button" type="button" id="onboardingNext">${onboardingState.stepIndex === ONBOARDING_STEPS.length - 1 ? "Concluir instala??o" : "Continuar"}</button>
          </footer>
        </section>
        ${onboardingPreviewMarkup()}
      </main>
    </section>
  `;
  bindOnboardingEvents(gate);
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function updateOnboardingLivePreview() {
  const data = onboardingState.data;
  const brandName = data.branding.app_name || appName();
  const subtitle = data.branding.app_subtitle || appSubtitle();
  const logo = data.branding.logo_preview || data.branding.logo_path || appLogoPath();
  document.querySelectorAll(".onboarding-product img, .onboarding-preview-brand img, .onboarding-brand-preview img").forEach((img) => {
    img.src = logo;
    img.alt = brandName;
  });
  document.querySelectorAll(".onboarding-product strong, .onboarding-preview-brand strong, .onboarding-brand-preview strong").forEach((item) => {
    item.textContent = brandName;
  });
  document.querySelectorAll(".onboarding-preview-brand span, .onboarding-brand-preview span").forEach((item) => {
    item.textContent = subtitle;
  });
  const doc = document.querySelector(".onboarding-document-preview");
  if (doc) {
    const name = data.company.trade_name || data.company.legal_name || "Nome da empresa";
    const city = [data.company.city, data.company.state].filter(Boolean).join(" - ") || "Cidade / UF";
    doc.querySelector("strong").textContent = name;
    doc.querySelector("em").textContent = data.company.document || "CNPJ / CPF";
    doc.querySelector("p").textContent = city;
  }
}

function bindOnboardingEvents(gate) {
  gate.querySelectorAll("[data-onboarding-field]").forEach((field) => {
    const path = field.dataset.onboardingField;
    field.addEventListener("input", () => {
      const value = field.type === "checkbox" ? field.checked : field.value;
      onboardingField(path, value);
      if ((path === "company.trade_name" || path === "company.legal_name") && !onboardingState.slugTouched) ensureCompanyOrganizationId();
      if (path === "admin.login_name") onboardingState.adminLoginTouched = true;
      if ((path === "admin.name" || path === "admin.email") && !onboardingState.adminLoginTouched) {
        ensureAdminLogin();
        const loginField = gate.querySelector('[data-onboarding-field="admin.login_name"]');
        if (loginField) loginField.value = onboardingState.data.admin.login_name;
      }
      saveOnboardingDraft();
      updateOnboardingLivePreview();
    });
    field.addEventListener("change", () => {
      const value = field.type === "checkbox" ? field.checked : field.value;
      onboardingField(path, value);
      if ((path === "company.trade_name" || path === "company.legal_name") && !onboardingState.slugTouched) ensureCompanyOrganizationId();
      if (path === "admin.login_name") onboardingState.adminLoginTouched = true;
      if ((path === "admin.name" || path === "admin.email") && !onboardingState.adminLoginTouched) {
        ensureAdminLogin();
        const loginField = gate.querySelector('[data-onboarding-field="admin.login_name"]');
        if (loginField) loginField.value = onboardingState.data.admin.login_name;
      }
      saveOnboardingDraft();
      updateOnboardingLivePreview();
    });
  });
  gate.querySelectorAll("[data-onboarding-destination]").forEach((button) => {
    button.addEventListener("click", () => {
      onboardingState.data.operation.next_after_onboarding = button.dataset.onboardingDestination || "imports";
      saveOnboardingDraft();
      renderOnboarding();
    });
  });
  const logoInput = gate.querySelector("[data-onboarding-logo-file]");
  logoInput?.addEventListener("change", () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type) || file.size > 2_000_000) {
      logoInput.value = "";
      showOnboardingFeedback("Envie uma logo PNG, JPG, WEBP ou SVG com at? 2 MB.", "warn");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      onboardingState.data.branding.logo_original = String(reader.result || "");
      onboardingState.data.branding.logo_adjust = { fit: "contain", zoom: 1, x: 0, y: 0 };
      onboardingState.data.branding.logo_upload = { file_name: file.name, mime_type: file.type, size: file.size, data_url: onboardingState.data.branding.logo_original };
      try {
        await renderAdjustedLogo();
      } catch (error) {
        onboardingState.data.branding.logo_preview = onboardingState.data.branding.logo_original;
      }
      saveOnboardingDraft();
      renderOnboarding();
    });
    reader.readAsDataURL(file);
  });
  const importInput = gate.querySelector("[data-onboarding-import-file]");
  importInput?.addEventListener("change", () => {
    const file = importInput.files?.[0] || null;
    onboardingState.importFile = file;
    onboardingState.importPreview = null;
    onboardingState.importPreviewError = "";
    onboardingState.importPreviewLoading = false;
    renderOnboarding();
  });
  gate.querySelector("[data-onboarding-import-analyze]")?.addEventListener("click", () => {
    analyzeOnboardingImportFile();
  });
  gate.querySelectorAll("[data-onboarding-logo-fit]").forEach((button) => {
    button.addEventListener("click", async () => {
      onboardingState.data.branding.logo_adjust.fit = button.dataset.onboardingLogoFit || "contain";
      await renderAdjustedLogo();
      saveOnboardingDraft();
      renderOnboarding();
    });
  });
  gate.querySelectorAll("[data-onboarding-logo-adjust]").forEach((input) => {
    input.addEventListener("input", async () => {
      const key = input.dataset.onboardingLogoAdjust;
      onboardingState.data.branding.logo_adjust[key] = Number(input.value || 0);
      await renderAdjustedLogo();
      updateOnboardingLivePreview();
      const preview = gate.querySelector(".onboarding-logo-crop-preview img");
      if (preview) preview.src = onboardingState.data.branding.logo_preview;
    });
    input.addEventListener("change", () => {
      saveOnboardingDraft();
    });
  });
  gate.querySelectorAll("[data-onboarding-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.onboardingStep || 0);
      if (index <= onboardingState.stepIndex) {
        onboardingState.stepIndex = index;
        renderOnboarding();
      }
    });
  });
  gate.querySelector("#onboardingBack")?.addEventListener("click", () => {
    onboardingState.stepIndex = Math.max(0, onboardingState.stepIndex - 1);
    renderOnboarding();
  });
  gate.querySelector("#onboardingNext")?.addEventListener("click", nextOnboardingStep);
  gate.querySelector(".onboarding-card")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.target.closest("textarea")) {
      event.preventDefault();
      nextOnboardingStep();
    }
  });
}

function validateOnboardingStep() {
  const step = onboardingCurrentStep().key;
  const data = onboardingState.data;
  if (step === "company" && !(data.company.trade_name || data.company.legal_name)) return "Informe o nome da empresa.";
  if (step === "company") ensureCompanyOrganizationId();
  if (step === "branding" && !data.branding.app_name) return "Informe o nome do sistema.";
  if (step === "admin") {
    ensureAdminLogin();
    if (!data.admin.name || !data.admin.login_name) return "Informe nome e login do administrador.";
    const minPasswordLength = onboardingPasswordMinLength();
    if (!data.admin.password || data.admin.password.length < minPasswordLength) return `A senha precisa ter pelo menos ${minPasswordLength} caracteres.`;
  }
  if (step === "operation") ensureOperationDefaults();
  return "";
}

function onboardingStepIndex(key) {
  return Math.max(0, ONBOARDING_STEPS.findIndex((step) => step.key === key));
}

function onboardingContextStepDone(key) {
  return Boolean((onboardingState.context?.steps || []).find((step) => step.key === key)?.done);
}

function validateOnboardingAll() {
  const data = onboardingState.data;
  if (!(data.company.trade_name || data.company.legal_name)) return { step: "company", message: "Informe o nome da empresa." };
  ensureCompanyOrganizationId();
  if (!data.branding.app_name) return { step: "branding", message: "Informe o nome do sistema." };
  if (!onboardingContextStepDone("admin")) {
    ensureAdminLogin();
    if (!data.admin.name || !data.admin.login_name) return { step: "admin", message: "Informe nome e login do administrador." };
    const minPasswordLength = onboardingPasswordMinLength();
    if (!data.admin.password || data.admin.password.length < minPasswordLength) {
      return { step: "admin", message: `A senha precisa ter pelo menos ${minPasswordLength} caracteres.` };
    }
  }
  ensureOperationDefaults();
  return null;
}

function showOnboardingFeedback(message, tone = "warn") {
  const target = document.querySelector("#onboardingFeedback");
  if (!target) return;
  target.hidden = false;
  target.className = `onboarding-feedback ${tone}`;
  target.textContent = message;
}

async function nextOnboardingStep() {
  const validation = validateOnboardingStep();
  if (validation) {
    showOnboardingFeedback(validation, "warn");
    return;
  }
  if (onboardingState.stepIndex < ONBOARDING_STEPS.length - 1) {
    onboardingState.stepIndex += 1;
    saveOnboardingDraft();
    renderOnboarding();
    return;
  }
  const finalValidation = validateOnboardingAll();
  if (finalValidation) {
    onboardingState.stepIndex = onboardingStepIndex(finalValidation.step);
    renderOnboarding();
    showOnboardingFeedback(finalValidation.message, "warn");
    return;
  }
  const button = document.querySelector("#onboardingNext");
  if (button) {
    button.disabled = true;
    button.textContent = "Criando instala??o";
  }
  try {
    ensureCompanyOrganizationId();
    ensureOperationDefaults();
    const result = await apiPost("/api/onboarding/complete", onboardingState.data);
    clearOnboardingDraft();
    state.appConfig = { ...state.appConfig, ...(result.public_config || {}) };
    applyAppConfig();
    const destination = onboardingState.data.operation.next_after_onboarding === "dashboard" ? "/painel" : "/importacao?onboarding=import";
    showOnboardingFeedback(destination.includes("importação") ? "Instala??o criada. Abrindo a importa??o assistida..." : "Instala??o criada. Abrindo a mesa...", "good");
    window.setTimeout(() => {
      window.location.href = destination;
    }, 650);
  } catch (error) {
    showOnboardingFeedback(error.message || "N?o foi poss?vel concluir a instala??o.", "danger");
    if (button) {
      button.disabled = false;
      button.textContent = "Concluir instala??o";
    }
  }
}

async function initOnboarding() {
  const context = await api("/api/onboarding").catch(() => ({ required: false }));
  if (!context.required) return true;
  const baseData = defaultOnboardingData(context);
  const draft = loadOnboardingDraft(context, baseData);
  const draftStep = draft.stepIndex === null ? 0 : draft.stepIndex;
  onboardingState = {
    context,
    stepIndex: draftStep,
    data: draft.data,
    slugTouched: Boolean(draft.data.company.organization_id),
    adminLoginTouched: Boolean(draft.data.admin.login_name),
  };
  if (onboardingState.stepIndex < 0) onboardingState.stepIndex = 0;
  if (!onboardingContextStepDone("admin") && !onboardingState.data.admin.password && onboardingState.stepIndex > onboardingStepIndex("admin")) {
    onboardingState.stepIndex = onboardingStepIndex("admin");
  }
  hideStartupScreen();
  renderOnboarding();
  return false;
}
