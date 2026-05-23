const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

async function api(path) {
  const response = await fetch(path, { credentials: "same-origin" });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { error: text || response.statusText };
  }
  if (!response.ok) {
    if (response.status === 401 && typeof renderAuthGate === "function") {
      renderAuthGate({ authenticated: false, needs_bootstrap: false, modules: state.auth?.modules || [] });
    }
    const message = data.error || `Erro ao carregar ${path}`;
    showAppError("Falha ao carregar dados", message);
    throw new Error(message);
  }
  clearAppError();
  return data;
}

function showAppError(title, detail = "") {
  const banner = document.querySelector("#appErrorBanner");
  if (!banner) return;
  const titleEl = banner.querySelector("#appErrorTitle");
  const detailEl = banner.querySelector("#appErrorDetail");
  if (titleEl) titleEl.textContent = title || "Algo saiu do contrato";
  if (detailEl) detailEl.textContent = detail || "Atualize a tela ou rode o smoke para diagnosticar.";
  banner.hidden = false;
}

function clearAppError() {
  const banner = document.querySelector("#appErrorBanner");
  if (banner) banner.hidden = true;
}

function requireContract(payload, expectedContract, path) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    const message = `Contrato inválido em ${path}: resposta não é objeto.`;
    showAppError("Contrato de API inválido", message);
    throw new Error(message);
  }
  if (payload.contract !== expectedContract) {
    const message = `Contrato inválido em ${path}: esperado ${expectedContract}.`;
    showAppError("Contrato de API inválido", message);
    throw new Error(message);
  }
  return payload;
}

function requireRows(payload, requiredKeys, label, path) {
  if (!Array.isArray(payload)) {
    const message = `Contrato inválido em ${path}: ${label} deveria ser lista.`;
    showAppError("Contrato de API inválido", message);
    throw new Error(message);
  }
  if (payload.length) {
    const missing = requiredKeys.filter((key) => !(key in payload[0]));
    if (missing.length) {
      const message = `Contrato inválido em ${path}: ${label} sem ${missing.join(", ")}.`;
      showAppError("Contrato de API inválido", message);
      throw new Error(message);
    }
  }
  return payload;
}

async function apiContract(path, expectedContract) {
  return requireContract(await api(path), expectedContract, path);
}

async function apiRows(path, requiredKeys, label) {
  return requireRows(await api(path), requiredKeys, label, path);
}

async function apiPost(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { error: text || response.statusText };
  }
  if (!response.ok) throw new Error(data.error || `Erro ao salvar ${path}`);
  return data;
}

async function apiPostForm(path, formData) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { error: text || response.statusText };
  }
  if (!response.ok) throw new Error(data.error || `Erro ao enviar ${path}`);
  return data;
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

function shortDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function shortDate(value) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
