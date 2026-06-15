const SELLER_PORTAL_LIST_LIMIT = 12;
const SELLER_PORTAL_SEARCH_LIMIT = 80;

function sellerPortalCard({ icon, label, value, hint, target }) {
  return `
    <button class="seller-portal-card" type="button" data-seller-target="${escapeAttr(target)}">
      <i data-lucide="${escapeAttr(icon)}"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(hint)}</em>
    </button>
  `;
}

function sellerPortalTerm() {
  return (document.querySelector("#sellerPortalSearch")?.value || "").trim().toLowerCase();
}

function sellerPortalMatch(row = {}, fields = [], term = sellerPortalTerm()) {
  if (!term) return true;
  return fields.some((field) => String(row[field] || "").toLowerCase().includes(term));
}

function sellerPortalProductId(row = {}) {
  return row.id || row.product_id || "";
}

function sellerPortalUpdateCount(selector, shown, total, term = "") {
  const item = document.querySelector(selector);
  if (!item) return;
  const base = term ? "encontrados" : "carregados";
  item.textContent = `Mostrando ${number(shown)} de ${number(total)} ${base}`;
}

async function ensureSellerPortalData() {
  if (typeof isSellerUser === "function" && isSellerUser()) {
    const query = typeof periodQuery === "function" ? periodQuery(state.periodDays || "all") : "?period_days=all";
    const [customers, products, sales] = await Promise.all([
      apiRows(`/api/customers/top${query}`, ["name", "purchases", "last_purchase", "revenue"], "customers_top.v1"),
      apiRows(
        `/api/products/top${query}`,
        ["id", "organization_id", "source_code", "name", "quantity", "revenue", "share"],
        "products_top.v1",
      ),
      apiRows(`/api/sales${query}`, ["data", "item", "cliente", "receita"], "sales.v1"),
    ]);
    state.customers = customers || [];
    state.products = products || [];
    state.salesRows = sales || [];
    return;
  }
  const workspace = typeof ensurePeriodWorkspaceData === "function" ? await ensurePeriodWorkspaceData() : null;
  if (workspace && typeof applyPeriodWorkspaceData === "function") {
    applyPeriodWorkspaceData(workspace, { force: false });
  }
  if (typeof loadCommercialSalesRows === "function") {
    await loadCommercialSalesRows().catch(() => []);
  }
}

function sellerPortalEmpty(label) {
  return `<div class="seller-portal-empty">${escapeHtml(label)}</div>`;
}

function sellerCustomerRows(rows = []) {
  const term = sellerPortalTerm();
  const filtered = rows
    .filter((row) => sellerPortalMatch(row, ["name", "document", "source_code", "crm_owner_name"], term));
  const matches = filtered.slice(0, SELLER_PORTAL_LIST_LIMIT);
  sellerPortalUpdateCount("#sellerPortalCustomersCount", matches.length, filtered.length, term);
  if (!matches.length) return sellerPortalEmpty("Nenhum cliente encontrado.");
  return matches.map((row) => `
    <button class="seller-portal-row" type="button" data-seller-customer-id="${escapeAttr(row.id || "")}">
      <div>
        <strong>${escapeHtml(row.name || "Cliente")}</strong>
        <span>${escapeHtml([row.source_code ? `Código ${row.source_code}` : "", row.crm_status ? customerCrmStatusLabel(row.crm_status) : ""].filter(Boolean).join(" · "))}</span>
      </div>
      <em>${compactMoney(row.revenue || 0)}</em>
    </button>
  `).join("");
}

function sellerCustomerSearchRows(term = "") {
  const normalized = term.trim().toLowerCase();
  const matches = (state.customers || [])
    .filter((row) => sellerPortalMatch(row, ["name", "document", "source_code", "crm_owner_name"], normalized))
    .slice(0, SELLER_PORTAL_SEARCH_LIMIT);
  if (!matches.length) return sellerPortalEmpty("Nenhum cliente encontrado.");
  return matches.map((row) => `
    <button class="seller-portal-row" type="button" data-seller-search-customer-id="${escapeAttr(row.id || "")}">
      <div>
        <strong>${escapeHtml(row.name || "Cliente")}</strong>
        <span>${escapeHtml([row.source_code ? `Código ${row.source_code}` : "", row.crm_status ? customerCrmStatusLabel(row.crm_status) : ""].filter(Boolean).join(" · "))}</span>
      </div>
      <em>${compactMoney(row.revenue || 0)}</em>
    </button>
  `).join("");
}

async function openSellerCustomerSearch() {
  try {
    await ensureSellerPortalData();
  } catch (error) {
    showAppError("Falha ao carregar clientes", error.message || "Nao foi possivel carregar a carteira.");
  }
  openModal(
    "Buscar cliente",
    `
      <section class="seller-customer-search">
        <input class="inline-input seller-portal-search" id="sellerCustomerSearchInput" type="search" placeholder="Nome, código, documento ou responsável" autofocus>
        <div class="seller-customer-search-results" id="sellerCustomerSearchResults"></div>
      </section>
    `,
    (body) => {
      const input = body.querySelector("#sellerCustomerSearchInput");
      const results = body.querySelector("#sellerCustomerSearchResults");
      const render = () => {
        results.innerHTML = sellerCustomerSearchRows(input.value || "");
      };
      render();
      input?.focus();
      input?.addEventListener("input", render);
      results?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-seller-search-customer-id]");
        if (!button?.dataset.sellerSearchCustomerId || typeof openCustomerProfile !== "function") return;
        closeModal();
        openCustomerProfile(button.dataset.sellerSearchCustomerId);
      });
    },
    { modalClass: "seller-customer-search-modal" },
  );
}

function sellerProductSearchRows(rows = []) {
  if (!rows.length) return sellerPortalEmpty("Nenhum produto encontrado.");
  return rows.map((row) => `
    <button class="seller-portal-row" type="button" data-seller-search-product-id="${escapeAttr(sellerPortalProductId(row))}">
      <div>
        <strong>${escapeHtml(row.name || "Produto")}</strong>
        <span>${escapeHtml([row.source_code ? `Codigo ${row.source_code}` : "", row.brand_name, row.unit].filter(Boolean).join(" · "))}</span>
      </div>
      <em>${row.sale_price ? money(row.sale_price) : compactMoney(row.revenue || 0)}</em>
    </button>
  `).join("");
}

async function openSellerProductSearch() {
  const initialRows = (state.products || []).slice(0, SELLER_PORTAL_SEARCH_LIMIT);
  let requestId = 0;
  openModal(
    "Buscar produto",
    `
      <section class="seller-customer-search">
        <input class="inline-input seller-portal-search" id="sellerProductSearchInput" type="search" placeholder="Nome, codigo, marca ou fornecedor" autofocus>
        <p class="seller-search-meta" id="sellerProductSearchMeta">Digite pelo menos 2 caracteres para buscar no cadastro completo.</p>
        <div class="seller-customer-search-results" id="sellerProductSearchResults"></div>
      </section>
    `,
    (body) => {
      const input = body.querySelector("#sellerProductSearchInput");
      const meta = body.querySelector("#sellerProductSearchMeta");
      const results = body.querySelector("#sellerProductSearchResults");
      const renderLocal = () => {
        results.innerHTML = sellerProductSearchRows(initialRows);
      };
      const renderRemote = async () => {
        const term = (input?.value || "").trim();
        const currentRequest = ++requestId;
        if (term.length < 2) {
          if (meta) meta.textContent = `Mostrando ${number(initialRows.length)} produtos mais vendidos.`;
          renderLocal();
          return;
        }
        if (meta) meta.textContent = "Buscando no cadastro completo...";
        try {
          const rows = await apiRows(
            `/api/products/search?q=${encodeURIComponent(term)}&limit=${SELLER_PORTAL_SEARCH_LIMIT}`,
            ["product_id", "name", "source_code"],
            "products_search.v1",
          );
          if (currentRequest !== requestId) return;
          if (meta) meta.textContent = `Mostrando ${number(rows.length)} resultado(s) para "${term}".`;
          results.innerHTML = sellerProductSearchRows(rows);
        } catch (error) {
          if (currentRequest !== requestId) return;
          if (meta) meta.textContent = error.message || "Nao foi possivel buscar produtos.";
          results.innerHTML = sellerPortalEmpty("Falha na busca de produtos.");
        }
      };
      renderLocal();
      input?.focus();
      input?.addEventListener("input", renderRemote);
      results?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-seller-search-product-id]");
        if (!button?.dataset.sellerSearchProductId || typeof openProductModal !== "function") return;
        closeModal();
        openProductModal(button.dataset.sellerSearchProductId);
      });
    },
    { modalClass: "seller-customer-search-modal" },
  );
}

function sellerProductRows(rows = []) {
  const term = sellerPortalTerm();
  const filtered = rows
    .filter((row) => sellerPortalMatch(row, ["name", "source_code", "brand_name", "supplier_name"], term));
  const matches = filtered.slice(0, SELLER_PORTAL_LIST_LIMIT);
  sellerPortalUpdateCount("#sellerPortalProductsCount", matches.length, filtered.length, term);
  if (!matches.length) return sellerPortalEmpty("Nenhum produto encontrado.");
  return matches.map((row) => `
    <button class="seller-portal-row" type="button" data-seller-product-id="${escapeAttr(sellerPortalProductId(row))}">
      <div>
        <strong>${escapeHtml(row.name || "Produto")}</strong>
        <span>${escapeHtml([row.source_code, row.brand_name].filter(Boolean).join(" · "))}</span>
      </div>
      <em>${compactMoney(row.revenue || 0)}</em>
    </button>
  `).join("");
}

function sellerSalesRows(rows = []) {
  const term = sellerPortalTerm();
  const filtered = rows
    .filter((row) => sellerPortalMatch(row, ["item", "cliente", "codigo", "tipo"], term));
  const matches = filtered.slice(0, SELLER_PORTAL_LIST_LIMIT);
  sellerPortalUpdateCount("#sellerPortalSalesCount", matches.length, filtered.length, term);
  if (!matches.length) return sellerPortalEmpty("Nenhuma venda encontrada.");
  return matches.map((row) => `
    <article class="seller-portal-row static">
      <div>
        <strong>${escapeHtml(row.item || "Venda")}</strong>
        <span>${escapeHtml([shortDate(row.data), row.cliente, row.tipo].filter(Boolean).join(" · "))}</span>
      </div>
      <em>${money(row.receita || 0)}</em>
    </article>
  `).join("");
}

function renderSellerPortalLists() {
  const customersMount = document.querySelector("#sellerPortalCustomers");
  const productsMount = document.querySelector("#sellerPortalProducts");
  const salesMount = document.querySelector("#sellerPortalSales");
  if (customersMount) customersMount.innerHTML = sellerCustomerRows(state.customers || []);
  if (productsMount) productsMount.innerHTML = sellerProductRows(state.products || []);
  if (salesMount) salesMount.innerHTML = sellerSalesRows(state.salesRows || []);
}

function renderSellerPortal() {
  const mount = document.querySelector("#sellerPortalCards");
  if (!mount) return;
  const customers = state.customers || [];
  const products = state.products || [];
  const sales = state.salesRows || [];
  const customerRevenue = sumRows(customers, "revenue");
  const productRevenue = sumRows(products, "revenue");
  const salesRevenue = sales.reduce((total, row) => total + Number(row.receita || 0), 0);
  mount.innerHTML = [
    sellerPortalCard({
      icon: "users",
      label: "Clientes",
      value: number(customers.length),
      hint: customerRevenue ? `${compactMoney(customerRevenue)} no recorte` : "Carteira e CRM",
      target: "customers",
    }),
    sellerPortalCard({
      icon: "package-search",
      label: "Produtos",
      value: number(products.length),
      hint: productRevenue ? `${compactMoney(productRevenue)} vendidos` : "Consulta de mix",
      target: "products",
    }),
    sellerPortalCard({
      icon: "receipt-text",
      label: "Vendas",
      value: number(sales.length),
      hint: salesRevenue ? `${compactMoney(salesRevenue)} importado` : "Histórico importado",
      target: "opportunities",
    }),
    sellerPortalCard({
      icon: "file-down",
      label: "Pedido PDF",
      value: "Cliente",
      hint: "Abra o catálogo para montar",
      target: "customers",
    }),
  ].join("");
  renderSellerPortalLists();
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

async function hydrateSellerPortal() {
  const view = typeof viewFromLocation === "function" ? viewFromLocation() : "";
  if (view !== "seller" && !document.querySelector("#seller")?.classList.contains("active")) return;
  const lists = document.querySelectorAll("#sellerPortalCustomers, #sellerPortalProducts, #sellerPortalSales");
  lists.forEach((item) => {
    item.innerHTML = sellerPortalEmpty("Carregando...");
  });
  try {
    await ensureSellerPortalData();
    renderSellerPortal();
  } catch (error) {
    showAppError("Falha no portal do vendedor", error.message || "Não foi possível carregar clientes, produtos e vendas.");
    renderSellerPortal();
  }
}

function initSellerPortal() {
  document.querySelector("#seller")?.addEventListener("click", (event) => {
    const customerButton = event.target.closest("[data-seller-customer-id]");
    if (customerButton?.dataset.sellerCustomerId && typeof openCustomerProfile === "function") {
      openCustomerProfile(customerButton.dataset.sellerCustomerId);
      return;
    }
    const productButton = event.target.closest("[data-seller-product-id]");
    if (productButton?.dataset.sellerProductId && typeof openProductModal === "function") {
      openProductModal(productButton.dataset.sellerProductId);
      return;
    }
    const button = event.target.closest("[data-seller-target]");
    if (!button) return;
    const target = button.dataset.sellerTarget || "customers";
    if (target === "customers") {
      openSellerCustomerSearch();
      return;
    }
    if (target === "products") {
      openSellerProductSearch();
      return;
    }
    if (target === "opportunities") {
      setCommercialMode("sales");
    }
    setView(target);
  });
  document.querySelector("#sellerPortalSearch")?.addEventListener("input", renderSellerPortalLists);
  document.addEventListener("nexo:viewchange", (event) => {
    if (event.detail?.view === "seller") hydrateSellerPortal();
  });
  hydrateSellerPortal();
}
