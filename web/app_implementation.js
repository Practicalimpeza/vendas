async function loadImplementationState() {
  const [onboarding, installation] = await Promise.all([
    apiContract("/api/onboarding", "onboarding.v1"),
    apiContract("/api/installation", "local_installation.v1"),
  ]);
  let imports = state.imports;
  if (!imports && (typeof canAccessView !== "function" || canAccessView("imports"))) {
    imports = await apiContract("/api/imports", "imports.v1").catch(() => null);
  }
  state.implementation = { onboarding, installation, imports };
  if (imports) state.imports = imports;
  renderImplementation();
  return state.implementation;
}

function implementationStepStatus(done, optional = false) {
  if (done) return { label: "Concluído", cls: "good" };
  if (optional) return { label: "Pode avançar", cls: "warn" };
  return { label: "Pendente", cls: "danger" };
}

function implementationSteps(onboarding, imports) {
  const steps = onboarding?.steps || [];
  const byKey = Object.fromEntries(steps.map((step) => [step.key, step]));
  const importState = imports?.assistant?.implementation_state || {};
  const quality = imports?.quality || {};
  return [
    {
      key: "company",
      title: "Empresa",
      body: "Nome, documento e dados básicos para documentos e relatórios.",
      done: Boolean(byKey.company?.done),
      action: "Completar perfil",
      view: "admin",
    },
    {
      key: "access",
      title: "Acesso",
      body: "Administrador e usuários iniciais para operar com responsabilidade.",
      done: Boolean(byKey.admin?.done),
      action: "Gerenciar usuários",
      view: "admin",
    },
    {
      key: "data",
      title: "Dados",
      body: "Importar planilhas e deixar o sistema entender produtos, vendas, estoque e fornecedores.",
      done: Boolean(byKey.data?.done || quality.latest_batch_id),
      action: "Abrir importação",
      view: "imports",
    },
    {
      key: "review",
      title: "Conferência",
      body: quality.next_step || importState.message || "Revisar confiança dos dados antes da rotina diária.",
      done: quality.status === "ready" || Number(quality.score || 0) >= 70,
      optional: true,
      action: "Revisar dados",
      view: "imports",
    },
    {
      key: "routine",
      title: "Primeiro uso",
      body: "Abrir compras, estoque ou mapa geral para começar a rotina com dados reais.",
      done: Boolean(onboarding?.completed && (byKey.data?.done || quality.latest_batch_id)),
      optional: true,
      action: "Abrir mapa",
      view: "dashboard",
    },
  ];
}

function implementationNextStep(steps) {
  return steps.find((step) => !step.done && !step.optional) || steps.find((step) => !step.done) || steps[steps.length - 1];
}

function renderImplementation() {
  const payload = state.implementation || {};
  const onboarding = payload.onboarding || {};
  const installation = payload.installation || {};
  const imports = payload.imports || {};
  const steps = implementationSteps(onboarding, imports);
  const completed = steps.filter((step) => step.done).length;
  const required = steps.filter((step) => !step.optional);
  const requiredDone = required.filter((step) => step.done).length;
  const quality = imports.quality || {};
  const install = installation.installation || {};
  const license = installation.license || {};

  renderKpiGrid("#implementationSummary", [
    ["Etapas", `${completed}/${steps.length}`, completed === steps.length ? "green" : "amber"],
    ["Obrigatórias", `${requiredDone}/${required.length}`, requiredDone === required.length ? "green" : ""],
    ["Confiança", quality.score ? `${number(quality.score)}%` : "Sem lote", quality.status === "ready" ? "green" : "amber"],
    ["Licença", distributionStatusLabel(license.status), distributionStatusClass(license.status)],
  ]);

  const stepsTarget = document.querySelector("#implementationSteps");
  if (stepsTarget) {
    stepsTarget.innerHTML = steps.map((step, index) => {
      const status = implementationStepStatus(step.done, step.optional);
      return `
        <article class="implementation-step ${status.cls}">
          <div class="implementation-step-index">${index + 1}</div>
          <div>
            <span class="status-chip ${status.cls}">${escapeHtml(status.label)}</span>
            <h3>${escapeHtml(step.title)}</h3>
            <p>${escapeHtml(step.body)}</p>
          </div>
          <button class="secondary-button compact" type="button" data-implementation-view="${escapeAttr(step.view)}">${escapeHtml(step.action)}</button>
        </article>
      `;
    }).join("");
  }

  const next = implementationNextStep(steps);
  const nextTarget = document.querySelector("#implementationNext");
  if (nextTarget) {
    nextTarget.innerHTML = `
      <strong>${escapeHtml(next.title)}</strong>
      <p>${escapeHtml(next.body)}</p>
      <button class="action-button" type="button" data-implementation-view="${escapeAttr(next.view)}">${escapeHtml(next.action)}</button>
    `;
  }

  const contextTarget = document.querySelector("#implementationContext");
  if (contextTarget) {
    const organization = onboarding.organization || {};
    const data = onboarding.data || {};
    contextTarget.innerHTML = `
      <dl class="distribution-list">
        <div><dt>Empresa</dt><dd>${escapeHtml(organization.name || appName())}</dd></div>
        <div><dt>Instalação</dt><dd>${escapeHtml(install.installation_id || "Pendente")}</dd></div>
        <div><dt>Pacote</dt><dd>${escapeHtml(install.package_id || "local_default")}</dd></div>
        <div><dt>Produtos</dt><dd>${escapeHtml(number(data.products || 0))}</dd></div>
        <div><dt>Lotes importados</dt><dd>${escapeHtml(number(data.import_batches || 0))}</dd></div>
      </dl>
    `;
  }
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function initImplementationView() {
  document.querySelector("#implementationRefresh")?.addEventListener("click", () => {
    loadImplementationState().catch((error) => showAppError("Falha na implantação", error.message));
  });
  document.querySelector("#implementation")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-implementation-view]");
    if (!button) return;
    setView(button.dataset.implementationView);
  });
  document.addEventListener("nexo:viewchange", (event) => {
    if (event.detail?.view !== "implementation") return;
    loadImplementationState().catch((error) => showAppError("Falha na implantação", error.message));
  });
}
