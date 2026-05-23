function whatsappStatusLabel(status) {
  const row = (state.whatsapp?.statuses || []).find((item) => item.id === status);
  return row?.label || status || "Sem status";
}

function whatsappUserName(userId) {
  const row = (state.whatsapp?.agents || state.whatsapp?.users || []).find((item) => item.id === userId);
  return row?.name || "";
}

function whatsappConversationTitle(row) {
  return row.contact_name || row.contact_wa_id || "Contato sem nome";
}

function whatsappTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderWhatsAppFilters(payload) {
  const statusFilter = document.querySelector("#whatsappStatusFilter");
  const ownerFilter = document.querySelector("#whatsappOwnerFilter");
  if (statusFilter) {
    const selected = statusFilter.value;
    statusFilter.innerHTML = `
      <option value="">Todos os status</option>
      ${(payload.statuses || []).map((row) => `<option value="${escapeAttr(row.id)}">${escapeHtml(row.label)}</option>`).join("")}
    `;
    statusFilter.value = selected;
  }
  if (ownerFilter) {
    const selected = ownerFilter.value;
    ownerFilter.innerHTML = `
      <option value="">Todos os responsaveis</option>
      ${(payload.agents || payload.users || []).map((row) => `<option value="${escapeAttr(row.id)}">${escapeHtml(row.name)}</option>`).join("")}
    `;
    ownerFilter.value = selected;
  }
}

function renderWhatsAppConfig(config = {}) {
  const target = document.querySelector("#whatsappConfig");
  if (!target) return;
  const mode = config.mode === "api" ? "API conectada" : "Modo simulado";
  const tone = config.mode === "api" ? "good" : "warn";
  target.innerHTML = `
    <div class="whatsapp-meta-row">
      <strong>Número piloto</strong>
      <span class="whatsapp-chip ${tone}">${escapeHtml(mode)}</span>
    </div>
    <span>Webhook: /api/whatsapp/webhook</span>
    <span>Access token: ${config.access_token_configured ? "configurado" : "pendente"} - Phone ID: ${config.phone_number_id_configured ? "configurado" : "pendente"}</span>
  `;
}

function renderWhatsAppAgents(payload) {
  const target = document.querySelector("#whatsappAgents");
  if (!target) return;
  const agents = payload.agents || payload.users || [];
  target.innerHTML = `
    <div class="whatsapp-meta-row">
      <strong>Atendentes</strong>
      <span class="whatsapp-chip ${agents.length ? "good" : "warn"}">${number(agents.length)}</span>
    </div>
    <div class="whatsapp-agent-list">
      ${
        agents.length
          ? agents.map((agent) => `<span>${escapeHtml(agent.name)}${agent.department ? ` - ${escapeHtml(agent.department)}` : ""}</span>`).join("")
          : "<span>Nenhum atendente cadastrado para esta empresa.</span>"
      }
    </div>
    <div class="whatsapp-agent-form">
      <input class="inline-input" id="whatsappAgentName" placeholder="Nome do atendente" />
      <input class="inline-input" id="whatsappAgentDepartment" placeholder="Setor opcional" />
      <button class="secondary-button" type="button" id="whatsappAgentAdd">Adicionar</button>
    </div>
    <span class="save-state" id="whatsappAgentState" aria-live="polite"></span>
  `;
}

function renderWhatsAppMetrics(payload) {
  const metrics = payload.metrics || {};
  renderKpiGrid("#whatsappMetrics", [
    ["Abertos", number(metrics.open || 0), ""],
    ["Novos", number(metrics.new || 0), "blue"],
    ["Sem dono", number(metrics.unassigned || 0), "amber"],
    ["Follow-up", number(metrics.follow_up || 0), "green"],
  ]);
}

function filteredWhatsAppRows() {
  const payload = state.whatsapp || { rows: [] };
  const status = document.querySelector("#whatsappStatusFilter")?.value || "";
  const owner = document.querySelector("#whatsappOwnerFilter")?.value || "";
  return (payload.rows || []).filter((row) => {
    if (status && row.status !== status) return false;
    if (owner && row.owner_user_id !== owner) return false;
    return true;
  });
}

function renderWhatsAppQueue() {
  const target = document.querySelector("#whatsappQueue");
  if (!target) return;
  const rows = filteredWhatsAppRows();
  if (!rows.length) {
    target.innerHTML = `
      <div class="customer-queue-empty">
        Sem conversas no filtro atual. Quando o webhook receber mensagens do número piloto, elas aparecem aqui.
      </div>
    `;
    return;
  }
  target.innerHTML = rows
    .map((row) => {
      const active = row.id === state.selectedWhatsappConversationId ? " active" : "";
      const owner = row.owner_name || "Sem responsável";
      const statusTone = row.status === "novo" ? "warn" : row.status === "fechado" ? "good" : "";
      return `
        <button class="whatsapp-card${active}" type="button" data-whatsapp-conversation="${escapeAttr(row.id)}">
          <div class="whatsapp-card-head">
            <div class="whatsapp-card-title">
              <strong>${escapeHtml(whatsappConversationTitle(row))}</strong>
              <span>${escapeHtml(row.contact_wa_id || "")}</span>
            </div>
            <span class="whatsapp-chip ${statusTone}">${escapeHtml(whatsappStatusLabel(row.status))}</span>
          </div>
          <span class="whatsapp-message-preview">${escapeHtml(row.last_message_body || "Sem mensagens registradas.")}</span>
          <div class="whatsapp-meta-row">
            <span>${escapeHtml(owner)}</span>
            <span>${escapeHtml(whatsappTime(row.last_message_at))}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function whatsappOptions(rows, selected, emptyLabel = "") {
  return [
    emptyLabel ? `<option value="">${escapeHtml(emptyLabel)}</option>` : "",
    ...rows.map((row) => `<option value="${escapeAttr(row.id || row)}" ${(row.id || row) === selected ? "selected" : ""}>${escapeHtml(row.label || row.name || row)}</option>`),
  ].join("");
}

function renderWhatsAppDetail(detail) {
  const target = document.querySelector("#whatsappDetail");
  if (!target) return;
  if (!detail?.conversation) {
    target.className = "whatsapp-detail-empty";
    target.innerHTML = `
      <strong>Nenhuma conversa selecionada</strong>
      <span>Escolha uma conversa da fila para assumir, transferir, responder ou encerrar.</span>
    `;
    return;
  }
  const conversation = detail.conversation;
  const messages = detail.messages || [];
  target.className = "whatsapp-detail";
  target.innerHTML = `
    <div class="whatsapp-detail-head">
      <div class="whatsapp-detail-title">
        <h2>${escapeHtml(whatsappConversationTitle(conversation))}</h2>
        <span>${escapeHtml(conversation.contact_wa_id || "")}</span>
      </div>
      <button class="secondary-button" type="button" id="whatsappSaveConversation">Salvar atendimento</button>
    </div>
    <div class="whatsapp-controls">
      <label class="whatsapp-control">
        Status
        <select class="inline-input" id="whatsappDetailStatus">
          ${whatsappOptions(detail.statuses || [], conversation.status)}
        </select>
      </label>
      <label class="whatsapp-control">
        Responsável
        <select class="inline-input" id="whatsappDetailOwner">
          ${whatsappOptions(detail.agents || detail.users || [], conversation.owner_user_id, "Sem responsável")}
        </select>
      </label>
      <label class="whatsapp-control">
        Setor
        <select class="inline-input" id="whatsappDetailDepartment">
          ${whatsappOptions(detail.departments || [], conversation.department, "Sem setor")}
        </select>
      </label>
      <label class="whatsapp-control">
        Prioridade
        <select class="inline-input" id="whatsappDetailPriority">
          ${[1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${Number(conversation.priority || 3) === value ? "selected" : ""}>${value}</option>`).join("")}
        </select>
      </label>
    </div>
    <label class="whatsapp-control">
      Observação interna
      <input class="inline-input" id="whatsappDetailNotes" value="${escapeAttr(conversation.notes || "")}" placeholder="Ex.: cliente pediu retorno amanhã cedo" />
    </label>
    <div class="whatsapp-timeline">
      ${
        messages.length
          ? messages.map((message) => `
            <div class="whatsapp-message ${escapeAttr(message.direction)}">
              <strong>${escapeHtml(message.direction === "outbound" ? (message.sender_name || "Empresa") : (message.sender_name || "Cliente"))}</strong>
              <span>${escapeHtml(message.body || "")}</span>
              <small>${escapeHtml(whatsappTime(message.received_at || message.sent_at || message.created_at))} - ${escapeHtml(message.status || "")}</small>
              ${message.error_text ? `<small>${escapeHtml(message.error_text)}</small>` : ""}
            </div>
          `).join("")
          : `<div class="customer-queue-empty">Sem mensagens ainda.</div>`
      }
    </div>
    <div class="whatsapp-composer">
      <textarea class="inline-input" id="whatsappMessageBody" placeholder="Escreva a resposta para o cliente"></textarea>
      <div class="whatsapp-composer-actions">
        <span class="save-state" id="whatsappSaveState" aria-live="polite"></span>
        <button class="action-button" type="button" id="whatsappSendMessage">Enviar mensagem</button>
      </div>
    </div>
  `;
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

async function loadWhatsAppConversations(options = {}) {
  const payload = await apiContract("/api/whatsapp/conversations", "whatsapp_conversations.v1");
  state.whatsapp = payload;
  renderWhatsAppMetrics(payload);
  renderWhatsAppConfig(payload.config);
  renderWhatsAppAgents(payload);
  renderWhatsAppFilters(payload);
  if (!state.selectedWhatsappConversationId && payload.rows?.length) {
    state.selectedWhatsappConversationId = payload.rows[0].id;
  }
  renderWhatsAppQueue();
  if (state.selectedWhatsappConversationId && options.loadDetail !== false) {
    await loadWhatsAppConversationDetail(state.selectedWhatsappConversationId);
  } else if (!state.selectedWhatsappConversationId) {
    renderWhatsAppDetail(null);
  }
}

async function loadWhatsAppConversationDetail(conversationId) {
  if (!conversationId) return;
  state.selectedWhatsappConversationId = conversationId;
  const detail = await apiContract(`/api/whatsapp/conversation?id=${encodeURIComponent(conversationId)}`, "whatsapp_conversation_detail.v1");
  state.whatsappDetail = detail;
  renderWhatsAppQueue();
  renderWhatsAppDetail(detail);
}

async function addWhatsAppAgent() {
  const nameInput = document.querySelector("#whatsappAgentName");
  const departmentInput = document.querySelector("#whatsappAgentDepartment");
  const saveState = document.querySelector("#whatsappAgentState");
  const name = nameInput?.value.trim() || "";
  const department = departmentInput?.value.trim() || "";
  if (!name) {
    if (saveState) saveState.textContent = "Informe o nome do atendente";
    return;
  }
  if (saveState) saveState.textContent = "Salvando";
  await apiPost("/api/whatsapp/agents/upsert", { name, department });
  if (nameInput) nameInput.value = "";
  if (departmentInput) departmentInput.value = "";
  if (saveState) saveState.textContent = "Atendente cadastrado";
  await loadWhatsAppConversations({ loadDetail: false });
}

async function saveWhatsAppConversation() {
  const detail = state.whatsappDetail;
  if (!detail?.conversation) return;
  const saveState = document.querySelector("#whatsappSaveState");
  if (saveState) saveState.textContent = "Salvando";
  const payload = {
    id: detail.conversation.id,
    status: document.querySelector("#whatsappDetailStatus")?.value || "novo",
    owner_user_id: document.querySelector("#whatsappDetailOwner")?.value || "",
    department: document.querySelector("#whatsappDetailDepartment")?.value || "",
    priority: document.querySelector("#whatsappDetailPriority")?.value || "3",
    notes: document.querySelector("#whatsappDetailNotes")?.value || "",
  };
  const updated = await apiPost("/api/whatsapp/conversations/update", payload);
  state.whatsappDetail = requireContract(updated, "whatsapp_conversation_detail.v1", "/api/whatsapp/conversations/update");
  if (saveState) saveState.textContent = "Atendimento salvo";
  await loadWhatsAppConversations({ loadDetail: false });
  renderWhatsAppDetail(state.whatsappDetail);
}

async function sendWhatsAppMessage() {
  const detail = state.whatsappDetail;
  const body = document.querySelector("#whatsappMessageBody")?.value.trim() || "";
  const saveState = document.querySelector("#whatsappSaveState");
  if (!detail?.conversation || !body) return;
  if (saveState) saveState.textContent = "Enviando";
  const payload = {
    conversation_id: detail.conversation.id,
    actor_user_id: document.querySelector("#whatsappDetailOwner")?.value || detail.conversation.owner_user_id || "",
    body,
  };
  const updated = await apiPost("/api/whatsapp/messages/send", payload);
  state.whatsappDetail = requireContract(updated, "whatsapp_conversation_detail.v1", "/api/whatsapp/messages/send");
  if (saveState) saveState.textContent = updated.ok === false ? (updated.error || "Envio não concluído") : "Mensagem registrada";
  await loadWhatsAppConversations({ loadDetail: false });
  renderWhatsAppDetail(state.whatsappDetail);
}

function initWhatsAppCrm() {
  if (state.whatsappInitialized) return;
  state.whatsappInitialized = true;
  document.querySelector("#whatsappRefresh")?.addEventListener("click", () => loadWhatsAppConversations().catch((error) => showAppError("Falha no WhatsApp", error.message)));
  document.querySelector("#whatsappStatusFilter")?.addEventListener("change", renderWhatsAppQueue);
  document.querySelector("#whatsappOwnerFilter")?.addEventListener("change", renderWhatsAppQueue);
  document.querySelector("#whatsappQueue")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-whatsapp-conversation]");
    if (button?.dataset.whatsappConversation) loadWhatsAppConversationDetail(button.dataset.whatsappConversation).catch((error) => showAppError("Falha no WhatsApp", error.message));
  });
  document.querySelector("#whatsappDetail")?.addEventListener("click", (event) => {
    if (event.target.closest("#whatsappSaveConversation")) {
      saveWhatsAppConversation().catch((error) => {
        const saveState = document.querySelector("#whatsappSaveState");
        if (saveState) saveState.textContent = error.message;
      });
    }
    if (event.target.closest("#whatsappSendMessage")) {
      sendWhatsAppMessage().catch((error) => {
        const saveState = document.querySelector("#whatsappSaveState");
        if (saveState) saveState.textContent = error.message;
      });
    }
  });
  document.querySelector("#whatsappAgents")?.addEventListener("click", (event) => {
    if (!event.target.closest("#whatsappAgentAdd")) return;
    addWhatsAppAgent().catch((error) => {
      const saveState = document.querySelector("#whatsappAgentState");
      if (saveState) saveState.textContent = error.message;
    });
  });
  document.addEventListener("nexo:viewchange", (event) => {
    if (event.detail?.view === "whatsapp") {
      loadWhatsAppConversations().catch((error) => showAppError("Falha no WhatsApp", error.message));
    }
  });
}
