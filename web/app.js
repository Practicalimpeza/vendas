function trimCode(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (!s) return "";
  return s
    .replace(/^0+(?=[0-9A-Za-z])/, "")
    .replace(/^([^0-9]*?)0+(?=[1-9])/, "$1");
}

function productCode(value) {
  return trimCode(value);
}

function quoteDisplayCode(row) {
  if (row?.supplier_reference) return productCode(row.supplier_reference);
  return productCode(row?.source_code || row?.quote_code || "");
}

function visibleProductIdentifiers(identifiers = []) {
  return (identifiers || []).filter((item) => item?.identifier_type !== "legacy_source_code");
}

function productIdentifierLabel(type) {
  const labels = {
    barcode: "Código de barras",
    supplier_reference: "Referência fornecedor",
  };
  return labels[type] || type || "Identificador";
}

function companyProfileName(profile = state.companyProfile) {
  return profile?.trade_name || profile?.legal_name || profile?.organization_name || "";
}

function companyProfileLogoPath(profile = state.companyProfile) {
  return profile?.logo_path || appLogoPath();
}

async function loadCompanyProfile(options = {}) {
  if (state.companyProfile && !options.force) return state.companyProfile;
  state.companyProfile = await api("/api/company-profile");
  return state.companyProfile;
}

function sumRows(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function openQuickActionModal(action) {
  if (!action) return;
  const decisions = action.decisions || ["Registrar decisão"];
  const count = (action.target_ids || []).length;
  openModal(
    action.title || "Registrar decisão",
    `
      <div class="modal-context">
        <strong>${escapeHtml(action.scope || action.label || "Ação rápida")}</strong>
        <span>${action.bulk ? `Edição em massa: ${number(count)} item(ns) no escopo.` : "Decisão individual capturada para melhorar as próximas recomendações."}</span>
      </div>
      <label class="modal-field">
        <span>Decisão</span>
        <select class="inline-input" id="quickDecision">
          ${decisions.map((decision) => `<option value="${escapeAttr(decision)}">${escapeHtml(decision)}</option>`).join("")}
        </select>
      </label>
      <label class="modal-field">
        <span>Observação para o ${escapeHtml(appName())} aprender</span>
        <textarea class="inline-input quick-note" id="quickNote" rows="4" placeholder="Ex.: fornecedor já combinado, cliente não compra mais, produto estratégico mesmo com baixa margem..."></textarea>
      </label>
      <div class="modal-preview good">Esse registro vira memória operacional no audit log e ajuda a calibrar as próximas ações.</div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="quickCancel">Cancelar</button>
        <button class="action-button" type="button" id="quickSave">${action.bulk ? "Salvar em lote" : "Salvar decisão"}</button>
      </div>
      <span class="save-state" id="quickSaveState" aria-live="polite"></span>
    `,
    (body) => {
      const saveState = body.querySelector("#quickSaveState");
      body.querySelector("#quickCancel").addEventListener("click", closeModal);
      body.querySelector("#quickSave").addEventListener("click", async () => {
        saveState.textContent = "Salvando";
        try {
          await apiPost("/api/operational-decisions", {
            action: action.action || "quick_decision",
            target_type: action.target_type || "workspace",
            target_id: action.target_id || "general",
            target_ids: action.target_ids || [],
            decision: body.querySelector("#quickDecision").value,
            notes: body.querySelector("#quickNote").value.trim(),
            scope: action.scope || "",
            source_view: document.querySelector(".view.active")?.id || "",
            applied_to_count: (action.target_ids || []).length || 1,
            metadata: action.metadata || {},
          });
          saveState.textContent = action.bulk ? "Lote registrado" : "Decisão registrada";
          setTimeout(closeModal, 450);
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
  );
}

function renderNavBadges() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    const label = viewLabel(button.dataset.view);
    button.dataset.label = label;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<span class="nav-label"><i data-lucide="${NAV_ICONS[button.dataset.view] || "circle"}"></i><span>${escapeHtml(label)}</span></span>`;
  });
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}
