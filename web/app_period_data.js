function periodQuery() {
  return state.periodDays === "all" ? "?period_days=all" : `?period_days=${encodeURIComponent(state.periodDays)}`;
}

async function loadPeriodWorkspaceData() {
  const [summary, products, replenishment, commercial, customers, services, pricing] = await Promise.all([
    apiContract(`/api/summary${periodQuery()}`, "summary.v1"),
    apiRows(
      `/api/products/top${periodQuery()}`,
      ["id", "organization_id", "source_code", "name", "quantity", "revenue", "share"],
      "products_top.v1",
    ),
    apiContract(`/api/replenishment${periodQuery()}`, "replenishment.v1"),
    apiContract(`/api/commercial/intelligence${periodQuery()}`, "commercial_intelligence.v1"),
    apiRows(`/api/customers/top${periodQuery()}`, ["name", "purchases", "last_purchase", "revenue"], "customers_top.v1"),
    apiRows(`/api/services/top${periodQuery()}`, ["name", "quantity", "revenue", "net_revenue"], "services_top.v1"),
    apiContract(`/api/pricing${periodQuery()}`, "pricing.v1"),
  ]);
  return { summary, products, replenishment, commercial, customers, services, pricing };
}

function activeViewId() {
  return document.querySelector(".view.active")?.id || (typeof viewFromLocation === "function" ? viewFromLocation() : "dashboard");
}

function renderPeriodDashboard() {
  if (!state.summary || !state.replenishment) return;
  renderKpis(state.summary.kpis);
  renderMonthly(state.summary.monthly);
  renderGeneralMap({
    summary: state.summary,
    products: state.products,
    replenishment: state.replenishment,
    quoteSuppliers: state.quoteSuppliers,
    customers: state.customers,
    pricing: state.pricing,
    imports: state.imports,
    services: state.services,
  });
}

function renderPeriodView(view = activeViewId(), options = {}) {
  if (!state.summary || !state.replenishment) return;
  state.periodRenderedViews = state.periodRenderedViews || {};
  if (!options.force && state.periodRenderedViews[view]) return;
  if (view === "dashboard") {
    renderPeriodDashboard();
  } else if (view === "stock") {
    renderReplenishmentSummary(state.replenishment.summary);
    renderStockDecisionQueue(state.replenishment.rows);
    applyStockFilters();
  } else if (view === "products") {
    renderProducts(state.products || []);
  } else if (view === "opportunities") {
    renderCommercial(state.commercial || {});
  } else if (view === "pricing") {
    renderPricing(state.pricing || {});
  } else if (view === "customers") {
    renderCustomers(state.customers || []);
    renderServices(state.services || []);
  } else if (view === "services") {
    renderServices(state.services || []);
  }
  state.periodRenderedViews[view] = true;
  renderNavBadges();
}

function applyPeriodWorkspaceData(payload, options = {}) {
  const { summary, products, replenishment, commercial, customers, services, pricing } = payload;
  state.summary = summary;
  state.products = products;
  state.replenishment = replenishment;
  state.stock = replenishment.rows;
  state.commercial = commercial;
  state.customers = customers;
  state.services = services;
  state.pricing = pricing;
  state.periodRenderedViews = {};
  document.querySelector("#periodLabel").textContent = summary.period?.label || "Período";
  renderPeriodView(activeViewId(), { force: options.force !== false });
}

async function refreshPeriodData() {
  applyPeriodWorkspaceData(await loadPeriodWorkspaceData(), { force: true });
}

document.addEventListener("nexo:viewchange", (event) => {
  renderPeriodView(event.detail?.view);
});
