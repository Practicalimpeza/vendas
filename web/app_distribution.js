async function loadDistributionState() {
  const payload = await apiContract("/api/installation", "local_installation.v1");
  state.installation = payload;
  renderDistribution();
  return payload;
}

function distributionValue(value, fallback = "Pendente") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function distributionStatusLabel(status) {
  const labels = {
    active: "Ativa",
    trial: "Teste",
    local: "Local",
    not_activated: "Pendente",
    expired: "Expirada",
    blocked: "Bloqueada",
  };
  return labels[status] || distributionValue(status);
}

function distributionStatusClass(status) {
  if (["active", "trial", "local"].includes(status)) return "good";
  if (["expired", "blocked"].includes(status)) return "danger";
  return "warn";
}

function renderDistributionList(items) {
  return `
    <dl class="distribution-list">
      ${items.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(distributionValue(value))}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function renderDistribution() {
  const payload = state.installation;
  if (!payload) return;
  const installation = payload.installation || {};
  const license = payload.license || {};
  const partnerName = state.appConfig?.app_name || "";
  renderKpiGrid("#distributionSummary", [
    ["Licença", distributionStatusLabel(license.status), distributionStatusClass(license.status)],
    ["Cobrança", license.billing_model === "per_active_client" ? "Cliente ativo" : distributionValue(license.billing_model)],
    ["Plano", distributionValue(license.plan, "Sem assinatura")],
    ["Tolerância offline", `${Number(license.offline_grace_days || 0)} dias`],
  ]);

  const partnerTarget = document.querySelector("#distributionPartner");
  if (partnerTarget) {
    partnerTarget.innerHTML = renderDistributionList([
      ["Parceiro", distributionValue(installation.partner_id, "default")],
      ["Nome visível", distributionValue(partnerName, "Definido pelo pacote")],
      ["Pacote", installation.package_id],
      ["Canal", installation.channel],
    ]);
  }

  const licenseTarget = document.querySelector("#distributionLicense");
  if (licenseTarget) {
    licenseTarget.innerHTML = `
      <div class="distribution-license-head">
        <span class="status-chip ${distributionStatusClass(license.status)}">${escapeHtml(distributionStatusLabel(license.status))}</span>
        <strong>${escapeHtml(distributionValue(license.client_status, "pending_activation"))}</strong>
      </div>
      <p>${escapeHtml(distributionValue(license.reason, "Instalação aguardando ativação."))}</p>
      ${renderDistributionList([
        ["Validade", distributionValue(license.valid_until, "Não ativada")],
        ["Última checagem", distributionValue(license.checked_at, "Nunca")],
        ["URL de ativação", distributionValue(license.activation_url, "Não configurada")],
      ])}
    `;
  }

  const installationTarget = document.querySelector("#distributionInstallation");
  if (installationTarget) {
    installationTarget.innerHTML = renderDistributionList([
      ["Installation ID", installation.installation_id],
      ["Tenant ativo", distributionValue(installation.active_tenant, "Nenhum tenant no contexto atual")],
      ["Modo de ativação", installation.activation_mode],
      ["Modelo de cobrança", installation.billing_model],
      ["Criada em", installation.created_at],
      ["Atualizada em", installation.updated_at],
    ]);
  }
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

function initDistributionView() {
  document.querySelector("#distributionRefresh")?.addEventListener("click", () => {
    loadDistributionState().catch((error) => showAppError("Falha na distribuição", error.message));
  });
  document.addEventListener("nexo:viewchange", (event) => {
    if (event.detail?.view !== "distribution") return;
    loadDistributionState().catch((error) => showAppError("Falha na distribuição", error.message));
  });
}
