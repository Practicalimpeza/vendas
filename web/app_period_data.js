function periodQuery(periodDays = state.periodDays) {
  return periodDays === "all" ? "?period_days=all" : `?period_days=${encodeURIComponent(periodDays)}`;
}

function periodCacheKey(periodDays = state.periodDays) {
  return String(periodDays || "30");
}

function currentPeriodWorkspacePayload() {
  if (!state.summary || !state.replenishment) return null;
  return {
    summary: state.summary,
    products: state.products || [],
    replenishment: state.replenishment,
    commercial: state.commercial || {},
    customers: state.customers || [],
    services: state.services || [],
    pricing: state.pricing || {},
  };
}

function cachePeriodWorkspaceData(periodDays, payload) {
  if (!payload) return payload;
  state.periodWorkspaceCache = state.periodWorkspaceCache || {};
  state.periodWorkspaceCache[periodCacheKey(periodDays)] = payload;
  return payload;
}

function getCachedPeriodWorkspaceData(periodDays = state.periodDays) {
  const key = periodCacheKey(periodDays);
  state.periodWorkspaceCache = state.periodWorkspaceCache || {};
  if (state.periodWorkspaceCache[key]) return state.periodWorkspaceCache[key];
  if (key === periodCacheKey(state.periodDays)) return cachePeriodWorkspaceData(key, currentPeriodWorkspacePayload());
  return null;
}

async function loadPeriodWorkspaceData(periodDays = state.periodDays) {
  const query = periodQuery(periodDays);
  const [summary, products, replenishment, commercial, customers, services, pricing] = await Promise.all([
    apiContract(`/api/summary${query}`, "summary.v1"),
    apiRows(
      `/api/products/top${query}`,
      ["id", "organization_id", "source_code", "name", "quantity", "revenue", "share"],
      "products_top.v1",
    ),
    apiContract(`/api/replenishment${query}`, "replenishment.v1"),
    apiContract(`/api/commercial/intelligence${query}`, "commercial_intelligence.v1"),
    apiRows(`/api/customers/top${query}`, ["name", "purchases", "last_purchase", "revenue"], "customers_top.v1"),
    apiRows(`/api/services/top${query}`, ["name", "quantity", "revenue", "net_revenue"], "services_top.v1"),
    apiContract(`/api/pricing${query}`, "pricing.v1"),
  ]);
  return cachePeriodWorkspaceData(periodDays, { summary, products, replenishment, commercial, customers, services, pricing });
}

async function ensurePeriodWorkspaceData(periodDays = state.periodDays) {
  const cached = getCachedPeriodWorkspaceData(periodDays);
  if (cached) return cached;
  const key = periodCacheKey(periodDays);
  state.periodWorkspacePromises = state.periodWorkspacePromises || {};
  if (!state.periodWorkspacePromises[key]) {
    state.periodWorkspacePromises[key] = loadPeriodWorkspaceData(periodDays).finally(() => {
      delete state.periodWorkspacePromises[key];
    });
  }
  return state.periodWorkspacePromises[key];
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
  cachePeriodWorkspaceData(state.periodDays, payload);
  state.periodRenderedViews = {};
  renderPeriodView(activeViewId(), { force: options.force !== false });
}

async function refreshPeriodData() {
  applyPeriodWorkspaceData(await loadPeriodWorkspaceData(), { force: true });
}

document.addEventListener("nexo:viewchange", (event) => {
  renderPeriodView(event.detail?.view);
});
