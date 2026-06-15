const SELLER_PORTAL_LIST_LIMIT = 12;
const SELLER_PORTAL_SEARCH_LIMIT = 80;
const SELLER_PRODUCT_SEARCH_LIMIT = 50;
const SELLER_PRODUCT_SEARCH_DEBOUNCE_MS = 360;
const sellerProductSearchCache = new Map();

function sellerOrderDraft() {
  if (!state.sellerOrderDraft) state.sellerOrderDraft = { customer: null, items: [], notes: "" };
  return state.sellerOrderDraft;
}

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

function sellerProductPrice(row = {}) {
  return Number(row.sale_price || row.negotiated_price || 0);
}

function sellerPortalUpdateCount(selector, shown, total, term = "") {
  const item = document.querySelector(selector);
  if (!item) return;
  const base = term ? "encontrados" : "carregados";
  item.textContent = `Mostrando ${number(shown)} de ${number(total)} ${base}`;
}

function sellerOrderReset() {
  state.sellerOrderDraft = { customer: null, items: [], notes: "" };
}

function sellerOrderAddProduct(row = {}) {
  const productId = sellerPortalProductId(row);
  if (!productId) return;
  const draft = sellerOrderDraft();
  const current = draft.items.find((item) => item.product_id === productId);
  if (current) {
    current.quantity = Number(current.quantity || 0) + 1;
    return;
  }
  draft.items.push({
    product_id: productId,
    source_code: row.source_code || "",
    name: row.name || "Produto",
    brand_name: row.brand_name || "",
    unit: row.unit || "",
    sale_price: sellerProductPrice(row),
    quantity: 1,
  });
}

function sellerOrderTotal() {
  return sellerOrderDraft().items.reduce((total, item) => total + (Number(item.quantity || 0) * sellerProductPrice(item)), 0);
}

function sellerOrderCustomers() {
  return state.sellerOrderCustomers || state.customers || [];
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
  let debounceTimer = null;
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
      const renderLocal = (term = "", willRefine = false) => {
        const normalized = term.trim().toLowerCase();
        const rows = normalized
          ? (state.products || [])
            .filter((row) => sellerPortalMatch(row, ["name", "source_code", "brand_name", "supplier_name"], normalized))
            .slice(0, SELLER_PRODUCT_SEARCH_LIMIT)
          : initialRows;
        if (meta) {
          meta.textContent = normalized
            ? `Mostrando ${number(rows.length)} resultado(s) locais.${willRefine ? " Refinando no cadastro completo..." : ""}`
            : `Mostrando ${number(initialRows.length)} produtos mais vendidos.`;
        }
        results.innerHTML = sellerProductSearchRows(rows);
      };
      const renderRemote = async () => {
        const term = (input?.value || "").trim();
        const currentRequest = ++requestId;
        if (term.length < 2) {
          renderLocal(term, false);
          return;
        }
        const cacheKey = term.toLowerCase();
        if (sellerProductSearchCache.has(cacheKey)) {
          const rows = sellerProductSearchCache.get(cacheKey) || [];
          if (meta) meta.textContent = `Mostrando ${number(rows.length)} resultado(s) para "${term}".`;
          results.innerHTML = sellerProductSearchRows(rows);
          return;
        }
        try {
          const payload = await apiContract(
            `/api/products/search?q=${encodeURIComponent(term)}&limit=${SELLER_PRODUCT_SEARCH_LIMIT}`,
            "products_search.v1",
          );
          const rows = requireRows(
            payload.rows || [],
            ["product_id", "name", "source_code"],
            "products_search.rows",
            "/api/products/search",
          );
          if (currentRequest !== requestId) return;
          sellerProductSearchCache.set(cacheKey, rows);
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
      input?.addEventListener("input", () => {
        const term = (input.value || "").trim();
        requestId += 1;
        if (debounceTimer) window.clearTimeout(debounceTimer);
        renderLocal(term, term.length >= 2);
        if (term.length < 2) return;
        debounceTimer = window.setTimeout(renderRemote, SELLER_PRODUCT_SEARCH_DEBOUNCE_MS);
      });
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

function sellerOrderCustomerRows(term = "") {
  const normalized = term.trim().toLowerCase();
  const rows = sellerOrderCustomers()
    .filter((row) => sellerPortalMatch(row, ["name", "document", "source_code", "crm_owner_name"], normalized))
    .slice(0, 20);
  if (!rows.length) return sellerPortalEmpty("Nenhum cliente encontrado.");
  return rows.map((row) => `
    <button class="seller-order-choice" type="button" data-seller-order-customer-id="${escapeAttr(row.id || "")}">
      <strong>${escapeHtml(row.name || "Cliente")}</strong>
      <span>${escapeHtml([row.source_code ? `Codigo ${row.source_code}` : "", row.document || ""].filter(Boolean).join(" · "))}</span>
    </button>
  `).join("");
}

function sellerOrderProductRows(rows = []) {
  if (!rows.length) return sellerPortalEmpty("Digite para buscar produtos.");
  return rows.map((row) => `
    <button class="seller-order-choice product" type="button" data-seller-order-product-id="${escapeAttr(sellerPortalProductId(row))}">
      <span>
        <strong>${escapeHtml(row.name || "Produto")}</strong>
        <em>${escapeHtml([row.source_code ? `Codigo ${row.source_code}` : "", row.brand_name || "", row.unit || ""].filter(Boolean).join(" · "))}</em>
      </span>
      <b>${sellerProductPrice(row) ? money(sellerProductPrice(row)) : "Adicionar"}</b>
    </button>
  `).join("");
}

function sellerOrderItemsHtml() {
  const items = sellerOrderDraft().items;
  if (!items.length) return sellerPortalEmpty("Nenhum produto no pedido.");
  return items.map((item) => `
    <article class="seller-order-item" data-seller-order-item-id="${escapeAttr(item.product_id)}">
      <div>
        <strong>${escapeHtml(item.name || "Produto")}</strong>
        <span>${escapeHtml([item.source_code ? `Codigo ${item.source_code}` : "", item.brand_name || ""].filter(Boolean).join(" · "))}</span>
      </div>
      <label>
        <span>Qtd.</span>
        <input class="inline-input" type="number" min="0" step="0.01" value="${escapeAttr(item.quantity || 1)}" data-seller-order-qty>
      </label>
      <em>${sellerProductPrice(item) ? money(Number(item.quantity || 0) * sellerProductPrice(item)) : "Preco no PDF"}</em>
      <button class="icon-button danger" type="button" title="Remover" aria-label="Remover" data-seller-order-remove>
        <i data-lucide="trash-2"></i>
      </button>
    </article>
  `).join("");
}

function renderSellerOrderModal() {
  const draft = sellerOrderDraft();
  const customerMount = document.querySelector("#sellerOrderSelectedCustomer");
  const itemsMount = document.querySelector("#sellerOrderItems");
  const totalMount = document.querySelector("#sellerOrderTotal");
  const button = document.querySelector("#sellerOrderPdfButton");
  if (customerMount) {
    customerMount.innerHTML = draft.customer
      ? `<strong>${escapeHtml(draft.customer.name || "Cliente")}</strong><span>${escapeHtml([draft.customer.source_code ? `Codigo ${draft.customer.source_code}` : "", draft.customer.document || ""].filter(Boolean).join(" · "))}</span>`
      : `<span>Escolha um cliente para iniciar o pedido.</span>`;
  }
  if (itemsMount) itemsMount.innerHTML = sellerOrderItemsHtml();
  if (totalMount) totalMount.textContent = sellerOrderTotal() ? money(sellerOrderTotal()) : "Total calculado no PDF";
  if (button) button.disabled = !draft.customer || !draft.items.length;
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
}

async function downloadSellerOrderPdf(button = null) {
  const draft = sellerOrderDraft();
  if (!draft.customer) {
    showAppError("Pedido sem cliente", "Escolha o cliente antes de gerar o PDF.");
    return;
  }
  const items = draft.items
    .map((item) => ({ product_id: item.product_id, quantity: item.quantity }))
    .filter((item) => item.product_id && Number(item.quantity || 0) > 0);
  if (!items.length) {
    showAppError("Pedido sem itens", "Adicione pelo menos um produto com quantidade.");
    return;
  }
  if (button) button.disabled = true;
  try {
    const file = await apiPostBlob("/api/sales-order/pdf", {
      customer_id: draft.customer.id,
      seller_name: state.auth?.user?.name || "",
      notes: document.querySelector("#sellerOrderNotes")?.value || "",
      items,
    });
    downloadBlob(file.blob, file.filename);
  } catch (error) {
    showAppError("Falha ao gerar pedido", error.message || "Revise cliente e itens.");
  } finally {
    if (button) button.disabled = false;
    renderSellerOrderModal();
  }
}

async function openSellerOrderBuilder() {
  try {
    await ensureSellerPortalData();
    state.sellerOrderCustomers = await apiRows(
      "/api/customers/top?period_days=all",
      ["name", "purchases", "last_purchase", "revenue"],
      "customers_top.v1",
    );
  } catch (error) {
    showAppError("Falha ao carregar dados", error.message || "Nao foi possivel carregar clientes e produtos.");
  }
  sellerOrderReset();
  let currentProductRows = [];
  let productTimer = null;
  let productRequestId = 0;
  openModal(
    "Novo pedido",
    `
      <section class="seller-order-builder">
        <section class="seller-order-block">
          <header><span>1</span><strong>Cliente</strong></header>
          <div class="seller-order-selected" id="sellerOrderSelectedCustomer"></div>
          <input class="inline-input" id="sellerOrderCustomerSearch" type="search" placeholder="Buscar cliente">
          <div class="seller-order-results" id="sellerOrderCustomerResults"></div>
        </section>
        <section class="seller-order-block">
          <header><span>2</span><strong>Produtos</strong></header>
          <input class="inline-input" id="sellerOrderProductSearch" type="search" placeholder="Buscar produto por nome, codigo ou marca">
          <p class="seller-search-meta" id="sellerOrderProductMeta">Digite para adicionar produtos ao pedido.</p>
          <div class="seller-order-results" id="sellerOrderProductResults"></div>
        </section>
        <section class="seller-order-block">
          <header><span>3</span><strong>Pedido</strong><em id="sellerOrderTotal"></em></header>
          <div class="seller-order-items" id="sellerOrderItems"></div>
          <textarea class="inline-input" id="sellerOrderNotes" rows="3" placeholder="Observacao para o financeiro"></textarea>
          <div class="seller-order-footer">
            <button class="ghost-button" type="button" id="sellerOrderClearButton">Limpar</button>
            <button class="primary-button" type="button" id="sellerOrderPdfButton"><i data-lucide="file-down"></i> Gerar PDF</button>
          </div>
        </section>
      </section>
    `,
    (body) => {
      const customerInput = body.querySelector("#sellerOrderCustomerSearch");
      const customerResults = body.querySelector("#sellerOrderCustomerResults");
      const productInput = body.querySelector("#sellerOrderProductSearch");
      const productResults = body.querySelector("#sellerOrderProductResults");
      const productMeta = body.querySelector("#sellerOrderProductMeta");
      const renderCustomers = () => {
        customerResults.innerHTML = sellerOrderCustomerRows(customerInput.value || "");
      };
      const renderProducts = (rows = []) => {
        currentProductRows = rows;
        productResults.innerHTML = sellerOrderProductRows(rows);
      };
      const localProducts = (term) => (state.products || [])
        .filter((row) => sellerPortalMatch(row, ["name", "source_code", "brand_name", "supplier_name"], term))
        .slice(0, 20);
      const searchProducts = async () => {
        const term = (productInput.value || "").trim();
        const currentRequest = ++productRequestId;
        if (term.length < 2) {
          if (productMeta) productMeta.textContent = "Digite pelo menos 2 caracteres.";
          renderProducts(localProducts(term));
          return;
        }
        if (productMeta) productMeta.textContent = "Buscando...";
        const cacheKey = term.toLowerCase();
        if (sellerProductSearchCache.has(cacheKey)) {
          const rows = sellerProductSearchCache.get(cacheKey) || [];
          if (productMeta) productMeta.textContent = `${number(rows.length)} resultado(s).`;
          renderProducts(rows);
          return;
        }
        try {
          const payload = await apiContract(
            `/api/products/search?q=${encodeURIComponent(term)}&limit=${SELLER_PRODUCT_SEARCH_LIMIT}`,
            "products_search.v1",
          );
          const rows = requireRows(payload.rows || [], ["product_id", "name", "source_code"], "products_search.rows", "/api/products/search");
          if (currentRequest !== productRequestId) return;
          sellerProductSearchCache.set(cacheKey, rows);
          if (productMeta) productMeta.textContent = `${number(rows.length)} resultado(s).`;
          renderProducts(rows);
        } catch (error) {
          if (currentRequest !== productRequestId) return;
          if (productMeta) productMeta.textContent = error.message || "Falha na busca.";
          renderProducts([]);
        }
      };
      renderCustomers();
      renderProducts((state.products || []).slice(0, 12));
      renderSellerOrderModal();
      customerInput?.focus();
      customerInput?.addEventListener("input", renderCustomers);
      customerResults?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-seller-order-customer-id]");
        if (!button) return;
        const customer = sellerOrderCustomers().find((row) => row.id === button.dataset.sellerOrderCustomerId);
        if (!customer) return;
        sellerOrderDraft().customer = customer;
        renderSellerOrderModal();
      });
      productInput?.addEventListener("input", () => {
        const term = (productInput.value || "").trim();
        productRequestId += 1;
        if (productTimer) window.clearTimeout(productTimer);
        renderProducts(localProducts(term));
        if (productMeta) productMeta.textContent = term.length >= 2 ? "Refinando busca..." : "Digite pelo menos 2 caracteres.";
        if (term.length < 2) return;
        productTimer = window.setTimeout(searchProducts, SELLER_PRODUCT_SEARCH_DEBOUNCE_MS);
      });
      productResults?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-seller-order-product-id]");
        if (!button) return;
        const product = currentProductRows.find((row) => sellerPortalProductId(row) === button.dataset.sellerOrderProductId);
        if (!product) return;
        sellerOrderAddProduct(product);
        renderSellerOrderModal();
      });
      body.querySelector("#sellerOrderItems")?.addEventListener("change", (event) => {
        const input = event.target.closest("[data-seller-order-qty]");
        if (!input) return;
        const row = input.closest("[data-seller-order-item-id]");
        const item = sellerOrderDraft().items.find((candidate) => candidate.product_id === row?.dataset.sellerOrderItemId);
        if (!item) return;
        item.quantity = input.value;
        renderSellerOrderModal();
      });
      body.querySelector("#sellerOrderItems")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-seller-order-remove]");
        if (!button) return;
        const row = button.closest("[data-seller-order-item-id]");
        sellerOrderDraft().items = sellerOrderDraft().items.filter((item) => item.product_id !== row?.dataset.sellerOrderItemId);
        renderSellerOrderModal();
      });
      body.querySelector("#sellerOrderNotes")?.addEventListener("input", (event) => {
        sellerOrderDraft().notes = event.target.value || "";
      });
      body.querySelector("#sellerOrderClearButton")?.addEventListener("click", () => {
        sellerOrderReset();
        const notes = body.querySelector("#sellerOrderNotes");
        if (notes) notes.value = "";
        renderSellerOrderModal();
      });
      body.querySelector("#sellerOrderPdfButton")?.addEventListener("click", (event) => downloadSellerOrderPdf(event.currentTarget));
    },
    { modalClass: "seller-order-modal" },
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
      label: "Novo pedido",
      value: "PDF",
      hint: "Abra o catálogo para montar",
      hint: "Cliente + produtos",
      target: "order",
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
    if (target === "order") {
      openSellerOrderBuilder();
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
