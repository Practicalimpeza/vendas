function setWhatsAppOverlay(open) {
  const panel = document.querySelector("#whatsapp");
  const button = document.querySelector("#whatsappFloatButton");
  if (!panel || !button) return;
  panel.classList.toggle("chat-overlay-open", open);
  document.body.classList.toggle("whatsapp-overlay-open", open);
  const active = open || panel.classList.contains("active");
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", active ? "true" : "false");
  if (open && typeof loadWhatsAppConversations === "function") {
    loadWhatsAppConversations().catch((error) => showAppError("Falha no WhatsApp", error.message));
  }
}

function toggleWhatsAppOverlay() {
  const panel = document.querySelector("#whatsapp");
  setWhatsAppOverlay(!panel?.classList.contains("chat-overlay-open"));
}

function setStartupMessage(message) {
  const target = document.querySelector("#startupMessage");
  if (target && message) target.textContent = message;
}

function hideStartupScreen() {
  const screen = document.querySelector("#startupScreen");
  if (!screen || screen.classList.contains("is-hidden")) return;
  screen.classList.add("is-hidden");
  window.setTimeout(() => {
    screen.hidden = true;
  }, 260);
}

async function boot() {
  if (typeof loadAppConfig === "function") {
    setStartupMessage("Carregando configuração da instalação.");
    await loadAppConfig();
  }
  if (typeof initOnboarding === "function") {
    setStartupMessage("Conferindo configuração inicial.");
    const onboardingReady = await initOnboarding();
    if (!onboardingReady) return;
  }
  enhanceNavigation();
  if (typeof initAuthGate === "function") {
    setStartupMessage("Validando acesso e permissões.");
    const authenticated = await initAuthGate();
    if (!authenticated) {
      hideStartupScreen();
      return;
    }
  }
  if (typeof initAdminPanel === "function") initAdminPanel();
  if (typeof initDistributionView === "function") initDistributionView();
  if (typeof initImplementationView === "function") initImplementationView();
  if (typeof initWhatsAppCrm === "function") initWhatsAppCrm();
  document.querySelector("[data-app-error-dismiss]")?.addEventListener("click", clearAppError);
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-import-mode]").forEach((button) => {
    button.addEventListener("click", () => setImportMode(button.dataset.importMode));
  });
  document.querySelectorAll("[data-erp-profile]").forEach((button) => {
    button.addEventListener("click", () => setErpImportProfile(button.dataset.erpProfile));
  });
  renderErpImportJourney("idle");
  document.querySelector("#importDashboardCharts")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-import-mode-target]");
    if (!button) return;
    setImportMode(button.dataset.importModeTarget || "operational");
  });
  document.querySelector("#erpImportAnalyze")?.addEventListener("click", analyzeErpImportFile);
  document.querySelector("#erpImportConfirm")?.addEventListener("click", confirmErpImportMapping);
  document.querySelector("#refreshTargets")?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button");
    if (actionButton?.id === "referenceFolderSave") {
      saveReferenceFolder();
      return;
    }
    if (actionButton?.id === "refreshSelectedLocalBtn") {
      refreshSelectedLocalFiles();
      return;
    }
    if (actionButton?.id === "selectModifiedReferenceFiles") {
      setReferenceFileSelection("modified");
      return;
    }
    if (actionButton?.id === "selectAllReferenceFiles") {
      setReferenceFileSelection("all");
      return;
    }
    const button = event.target.closest("button[data-refresh-index]");
    if (!button) return;
    startRefreshTarget(Number(button.dataset.refreshIndex));
  });
  document.querySelector("#refreshTargetFile")?.addEventListener("change", handleRefreshTargetFile);
  document.querySelector("#linkImportAnalyze")?.addEventListener("click", analyzeLinkImportFile);

  let initialView = viewFromLocation();
  const initialParams = new URLSearchParams(window.location.search);
  state.importOnboardingFocus = initialView === "imports" && initialParams.get("onboarding") === "import";
  if (typeof canAccessView === "function" && !canAccessView(initialView)) {
    initialView = typeof firstAllowedView === "function" ? firstAllowedView() : "dashboard";
  }
  setView(initialView, { updateHistory: false });
  if (initialView === "quotes") {
    const grid = document.querySelector("#quoteSuppliersTable");
    const summary = document.querySelector("#quoteSupplierDeskSummary");
    if (summary) summary.innerHTML = `<div class="quote-workbench-loading"><strong>Preparando mesa de compra</strong><span>Calculando fornecedores, m?nimos, ciclos e sinais de ruptura.</span><i aria-hidden="true"></i></div>`;
    if (grid) grid.innerHTML = `<div class="quote-workbench-loading"><strong>Organizando fornecedores</strong><span>A mesa aparece assim que o motor termina a leitura.</span><i aria-hidden="true"></i></div>`;
  }

  const canUseQuotes = typeof canAccessView !== "function" || canAccessView("quotes");
  const canUseImports = typeof canAccessView !== "function" || canAccessView("imports");
  const canUseAdmin = typeof canAccessView !== "function" || canAccessView("admin");
  const canUseFullWorkspace = typeof canAccessView !== "function" || (
    canAccessView("dashboard")
    && canAccessView("products")
    && canAccessView("stock")
    && canAccessView("customers")
    && canAccessView("pricing")
    && canAccessView("opportunities")
  );
  const canUseSecondarySignals = typeof canAccessView !== "function" || (
    canAccessView("dashboard")
    && canAccessView("actions")
    && canAccessView("engine")
    && canAccessView("suppliers")
  );
  const prioritizeQuotes = canUseQuotes && initialView === "quotes";
  let startupFinished = false;
  const finishStartupLoading = () => {
    if (startupFinished) return;
    startupFinished = true;
    hideStartupScreen();
  };
  const startupFallback = window.setTimeout(finishStartupLoading, prioritizeQuotes ? 7000 : 5500);
  let periodDataPromise = null;
  let importsPromise = null;
  let companyProfilePromise = null;
  let quoteSuppliersPromise = null;

  const loadQuoteSuppliers = async () => {
    if (!canUseQuotes) return [];
    if (state.quoteSuppliers?.length) return state.quoteSuppliers;
    if (quoteSuppliersPromise) return quoteSuppliersPromise;
    quoteSuppliersPromise = apiRows(
      "/api/supplier-workbench/suppliers",
      SUPPLIER_WORKBENCH_SUPPLIER_KEYS,
      "supplier_workbench_suppliers.v1",
    )
      .then((quoteSuppliers) => {
        state.quoteSuppliers = quoteSuppliers;
        state.quoteSupplierChip = defaultQuoteSupplierChip(quoteSuppliers);
        state.quoteSupplierLenses = [];
        state.selectedQuoteSupplierId = state.selectedQuoteSupplierId || quoteSuppliers[0]?.supplier_id || "";
        renderQuotes({ withDashboard: true, preserveScroll: false });
        return quoteSuppliers;
      })
      .finally(() => {
        quoteSuppliersPromise = null;
      });
    return quoteSuppliersPromise;
  };
  const warmQuoteSuppliers = () => {
    if (!canUseQuotes || state.quoteSuppliers?.length) return;
    loadQuoteSuppliers().catch((error) => console.error("Carga de fornecedores da cota??o falhou:", error));
  };

  if (prioritizeQuotes) await loadQuoteSuppliers();
  if (prioritizeQuotes) {
    window.clearTimeout(startupFallback);
    finishStartupLoading();
  }

  let workspaceHydrated = false;
  let workspaceHydrationPromise = null;
  const hydrateWorkspaceData = async () => {
    if (workspaceHydrationPromise) return workspaceHydrationPromise;
    workspaceHydrationPromise = (async () => {
      if (!canUseFullWorkspace && !canUseImports && !canUseAdmin) {
        workspaceHydrated = true;
        return {};
      }
      if (canUseFullWorkspace && !periodDataPromise) periodDataPromise = loadPeriodWorkspaceData();
      if (canUseImports && !importsPromise) importsPromise = apiContract("/api/imports", "imports.v1");
      if (canUseAdmin && !companyProfilePromise) companyProfilePromise = api("/api/company-profile").catch(() => null);
      const [periodData, imports, companyProfile] = await Promise.all([
        periodDataPromise || Promise.resolve(null),
        importsPromise || Promise.resolve(null),
        companyProfilePromise || Promise.resolve(null),
      ]);
      if (imports) state.imports = imports;
      if (companyProfile) state.companyProfile = companyProfile;
      updateTopbar(viewFromLocation());
      if (periodData) {
        applyPeriodWorkspaceData(periodData);
        renderTasks(periodData.summary.tasks);
      }
      if (imports) renderImports(imports);
      observeDataTables();
      workspaceHydrated = true;
      if (!prioritizeQuotes) {
        window.clearTimeout(startupFallback);
        finishStartupLoading();
      }
      return { periodData, imports, companyProfile };
    })();
    return workspaceHydrationPromise;
  };
  const hydrateWorkspaceOnDemand = () => {
    if (workspaceHydrated) return;
    hydrateWorkspaceData().catch((error) => console.error("Carga do workspace falhou:", error));
  };
  document.addEventListener("nexo:viewchange", (event) => {
    if (event.detail?.view === "quotes") {
      warmQuoteSuppliers();
      return;
    }
    hydrateWorkspaceOnDemand();
  });
  if (prioritizeQuotes) {
    window.setTimeout(hydrateWorkspaceOnDemand, 9000);
  } else {
    hydrateWorkspaceOnDemand();
    window.setTimeout(warmQuoteSuppliers, 1800);
  }

  const loadPurchaseOrders = () => apiRows(
    "/api/purchase-orders?status=open",
    ["id", "supplier_id", "supplier_name", "status", "total_amount", "item_count", "approved_item_count", "overdue"],
    "purchase_orders_list.v1",
  )
    .then((purchaseOrders) => {
      state.purchaseOrders = purchaseOrders;
      renderPurchaseOrders(purchaseOrders);
    });
  const loadSecondarySignals = () => Promise.all([
    api("/api/intelligence/maturity"),
    apiContract("/api/actions/today", "actions_today.v1"),
    api("/api/nexo/skills"),
    api("/api/suppliers/brands"),
  ])
    .then(([maturity, actions, skills, suppliers]) => {
      state.maturity = maturity;
      state.actions = actions;
      state.skills = skills;
      state.suppliers = suppliers;
      renderMaturity(maturity);
      renderMissions(maturity);
      renderActions(actions);
      renderEngine(skills, actions);
      renderSuppliers(suppliers);
      if (["actions", "engine", "suppliers"].includes(initialView)) {
        window.clearTimeout(startupFallback);
        finishStartupLoading();
      }
    });
  if (canUseQuotes) {
    loadPurchaseOrders().catch((error) => console.error("Carga de pedidos falhou:", error));
  }
  if (canUseSecondarySignals) {
    if (prioritizeQuotes) {
      window.setTimeout(() => loadSecondarySignals().catch((error) => console.error("Carga secundaria falhou:", error)), 3500);
    } else {
      loadSecondarySignals().catch((error) => console.error("Carga secundaria falhou:", error));
    }
  }

  document.querySelectorAll("[data-product-mode]").forEach((button) => {
    button.addEventListener("click", () => setProductMode(button.dataset.productMode));
  });
  document.querySelector("#productDashboardCharts").addEventListener("click", (event) => {
    const productButton = event.target.closest("[data-product-id]");
    if (productButton?.dataset.productId) {
      openProductModal(productButton.dataset.productId);
      return;
    }
    const filterButton = event.target.closest("[data-product-filter-key]");
    if (!filterButton) return;
    const value = filterButton.dataset.productFilterValue || "";
    if (filterButton.dataset.productFilterKey === "supplier") setProductTableFilter("supplier_name", value);
    if (filterButton.dataset.productFilterKey === "brand") setProductTableFilter("brand_name", value);
  });
  document.querySelector("#mixDecisionBoard").addEventListener("click", (event) => {
    const target = event.target.closest("[data-product-id]");
    if (target?.dataset.productId) openProductModal(target.dataset.productId);
  });
  document.querySelector("#stockSearch").addEventListener("input", applyStockFilters);
  document.querySelector("#stockStatus").addEventListener("change", applyStockFilters);
  document.querySelector("#stockDecisionStrip")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-stock-status-target]");
    if (!target) return;
    document.querySelector("#stockStatus").value = target.dataset.stockStatusTarget || "";
    applyStockFilters();
  });
  document.querySelector("#stockDecisionQueue")?.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-stock-queue-filter]");
    if (filter) {
      document.querySelector("#stockStatus").value = filter.dataset.stockQueueFilter || "";
      applyStockFilters();
      return;
    }
    const product = event.target.closest("[data-stock-queue-product]");
    if (product?.dataset.stockQueueProduct) openProductModal(product.dataset.stockQueueProduct);
  });
  document.querySelector("#stockTable").addEventListener("click", (event) => {
    if (event.target.classList.contains("force-mix-buy")) {
      updateProductMixDecision(event.target, "force_buy");
      return;
    }
    if (event.target.classList.contains("drop-mix-product")) {
      updateProductMixDecision(event.target, "drop");
      return;
    }
    if (event.target.classList.contains("edit-stock-supplier")) {
      openSupplierModal(event.target.dataset.brandId);
      return;
    }
    const row = event.target.closest("tr[data-product-id]");
    if (row?.dataset.productId) openProductModal(row.dataset.productId);
  });
  document.querySelectorAll("[data-supplier-mode]").forEach((button) => {
    button.addEventListener("click", () => setSupplierMode(button.dataset.supplierMode));
  });
  document.querySelector("#supplierDashboardCharts").addEventListener("click", (event) => {
    const button = event.target.closest("[data-supplier-filter]");
    if (!button) return;
    setSupplierMode("operational");
    setSupplierTableStatus(button.dataset.supplierFilter || "");
  });
  document.querySelector("#supplierFocus").addEventListener("click", (event) => {
    const button = event.target.closest(".edit-supplier-profile");
    if (!button) return;
    openSupplierProfileModal(button.dataset.supplierId || "");
  });
  document.querySelector("#supplierBrandTable").addEventListener("click", (event) => {
    const row = event.target.closest(".supplier-row");
    const button = event.target.closest(".edit-supplier");
    if (button?.dataset.brandId) {
      openSupplierModal(button.dataset.brandId);
      return;
    }
    if (row?.dataset.brandId) openSupplierModal(row.dataset.brandId);
  });
  document.querySelector("#quoteSupplierSearch").addEventListener("input", () => scheduleRenderQuotes());
  document.querySelectorAll("[data-quote-mode]").forEach((button) => {
    button.addEventListener("click", () => setQuoteMode(button.dataset.quoteMode));
  });
  document.querySelector("#quoteSupplierViewModes")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quote-supplier-view]");
    if (!button) return;
    setQuoteSupplierViewMode(button.dataset.quoteSupplierView);
  });
  document.querySelector("#quoteSupplierSort")?.addEventListener("change", (event) => {
    setQuoteSupplierSort(event.target.value || "supplier");
    renderQuotes({ preserveScroll: true, summaryOnly: true });
  });
  document.querySelector("#quoteSupplierClear")?.addEventListener("click", () => {
    const search = document.querySelector("#quoteSupplierSearch");
    if (search) search.value = "";
    state.quoteSupplierLenses = [];
    state.quoteSupplierColumnFilters = {};
    state.quoteSupplierChip = "all";
    state.quoteSupplierChipPinned = false;
    state.quoteSupplierPreviewId = "";
    state.quoteSupplierPopupOpen = false;
    state.quoteSupplierViewMode = "table";
    setQuoteSupplierSort("supplier", { dir: "asc" });
    const sort = document.querySelector("#quoteSupplierSort");
    if (sort) sort.value = "supplier";
    renderQuotes({ preserveScroll: false, withDashboard: true });
  });
  const applyQuoteSupplierColumnFilter = (event) => {
    const field = event.target.closest("[data-quote-supplier-col-filter]");
    if (!field) return;
    const key = field.dataset.quoteSupplierColFilter;
    const next = { ...(state.quoteSupplierColumnFilters || {}) };
    const value = field.value.trim();
    if (value) next[key] = value;
    else delete next[key];
    state.quoteSupplierColumnFilters = next;
    state.quoteSupplierPreviewId = "";
    state.quoteSupplierPopupOpen = false;
    if (event.type === "input") scheduleRenderQuotes(180);
    else renderQuotes({ preserveScroll: false, summaryOnly: true });
  };
  document.querySelector("#quoteSuppliersTable")?.addEventListener("input", applyQuoteSupplierColumnFilter);
  document.querySelector("#quoteSuppliersTable")?.addEventListener("change", applyQuoteSupplierColumnFilter);
  document.querySelector("#quoteSupplierChips").addEventListener("click", (event) => {
    const chipBtn = event.target.closest("[data-lens], [data-chip]");
    if (chipBtn) {
      const lens = chipBtn.dataset.lens || quoteLegacyChipToLens(chipBtn.dataset.chip);
      if (lens === "all") {
        state.quoteSupplierLenses = [];
      } else {
        const active = new Set(state.quoteSupplierLenses || []);
        if (active.has(lens)) active.delete(lens);
        else active.add(lens);
        state.quoteSupplierLenses = Array.from(active);
      }
      state.quoteSupplierChip = state.quoteSupplierLenses[0] || "all";
      state.quoteSupplierChipPinned = Boolean(state.quoteSupplierLenses.length);
      state.quoteSupplierPreviewId = "";
      state.quoteSupplierPopupOpen = false;
      renderQuotes({ preserveScroll: false, summaryOnly: true });
    }
  });
  document.querySelector("#quoteWindowDays").addEventListener("change", async (event) => {
    state.quoteWindowDays = event.target.value;
    state.quoteWorkbenchPrefetch.clear();
    await loadQuoteSupplierWorkbench(state.selectedQuoteSupplierId);
  });
  document.querySelector("#quoteSuppliersTable").addEventListener("click", async (event) => {
    const filterButton = event.target.closest("[data-quote-supplier-filter]");
    if (filterButton?.dataset.quoteSupplierFilter) {
      const lens = filterButton.dataset.quoteSupplierFilter;
      const current = (state.quoteSupplierLenses || [])[0] || "all";
      const next = current === lens ? "all" : lens;
      state.quoteSupplierLenses = next === "all" ? [] : [next];
      state.quoteSupplierChip = next;
      state.quoteSupplierChipPinned = next !== "all";
      state.quoteSupplierPreviewId = "";
      state.quoteSupplierPopupOpen = false;
      renderQuotes({ preserveScroll: false, summaryOnly: true });
      return;
    }
    const sortButton = event.target.closest("[data-quote-supplier-sort]");
    if (sortButton?.dataset.quoteSupplierSort) {
      setQuoteSupplierSort(sortButton.dataset.quoteSupplierSort, { toggle: true });
      renderQuotes({ preserveScroll: true, summaryOnly: true });
      return;
    }
    const openButton = event.target.closest("[data-quote-supplier-open]");
    if (openButton?.dataset.quoteSupplierOpen) {
      await loadQuoteSupplierWorkbench(openButton.dataset.quoteSupplierOpen);
      return;
    }
    const previewButton = event.target.closest("[data-quote-supplier-preview]");
    const row = event.target.closest(".purchase-supplier-row, .quote-supplier-card");
    const supplierId = previewButton?.dataset.quoteSupplierPreview || row?.dataset.supplierId;
    if (!supplierId) return;
    state.quoteSupplierPreviewId = supplierId;
    state.quoteSupplierPopupOpen = true;
    renderQuoteSupplierInspectorState();
    prefetchQuoteSupplierWorkbench(supplierId).catch(() => {});
  });
  document.querySelector("#quoteSupplierDeskSummary")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("[data-quote-summary-sort]");
    if (sortButton?.dataset.quoteSummarySort) {
      setQuoteSupplierSort(sortButton.dataset.quoteSummarySort);
      renderQuotes({ preserveScroll: true, summaryOnly: true });
      return;
    }
    const lensButton = event.target.closest("[data-quote-summary-lens]");
    if (!lensButton) return;
    const lens = lensButton.dataset.quoteSummaryLens || "all";
    state.quoteSupplierLenses = lens === "all" ? [] : [lens];
    state.quoteSupplierChip = lens;
    state.quoteSupplierChipPinned = lens !== "all";
    state.quoteSupplierPreviewId = "";
    state.quoteSupplierPopupOpen = false;
    renderQuotes({ preserveScroll: false, summaryOnly: true });
  });
  document.querySelector("#quoteSupplierInspector").addEventListener("click", async (event) => {
    if (!event.target.closest(".quote-supplier-inspector-panel")) {
      state.quoteSupplierPopupOpen = false;
      state.quoteSupplierEditingId = "";
      renderQuoteSupplierInspectorState();
      return;
    }
    if (event.target.closest("[data-quote-supplier-close]")) {
      state.quoteSupplierPopupOpen = false;
      state.quoteSupplierEditingId = "";
      renderQuoteSupplierInspectorState();
      return;
    }
    const editToggle = event.target.closest("[data-quote-supplier-edit-toggle]");
    if (editToggle?.dataset.quoteSupplierEditToggle) {
      const supplierId = editToggle.dataset.quoteSupplierEditToggle;
      state.quoteSupplierEditingId = state.quoteSupplierEditingId === supplierId ? "" : supplierId;
      renderQuoteSupplierInspectorState();
      return;
    }
    const saveProfile = event.target.closest("[data-quote-supplier-save]");
    if (saveProfile) {
      await saveQuoteSupplierProfile(saveProfile);
      return;
    }
    const discard = event.target.closest("[data-quote-discard]");
    if (discard?.dataset.quoteDiscard) {
      const feedback = discard.closest(".quote-supplier-actions")?.querySelector("[data-quote-discard-state]");
      await discardQuote({ id: discard.dataset.quoteDiscard, status: "draft" }, discard.dataset.quoteDiscardSupplier || state.quoteSupplierPreviewId, feedback, discard);
      return;
    }
    const button = event.target.closest("[data-quote-supplier-action]");
    if (button?.dataset.quoteSupplierAction) await loadQuoteSupplierWorkbench(button.dataset.quoteSupplierAction);
  });
  document.querySelector("#purchaseOrdersBoard").addEventListener("click", (event) => {
    const card = event.target.closest("[data-purchase-order-id]");
    if (!card) return;
    if (event.target.closest(".respond-purchase-quote")) {
      openQuoteResponseModal(card.dataset.quoteRequestId || card.dataset.purchaseOrderId);
      return;
    }
    if (event.target.closest(".generate-purchase-order")) {
      generatePurchaseOrderFromQuote(card.dataset.quoteRequestId || card.dataset.purchaseOrderId, event.target.closest(".generate-purchase-order"));
      return;
    }
    if (event.target.closest(".confirm-purchase-order")) {
      openConfirmPurchaseOrderModal(card.dataset.purchaseOrderId);
      return;
    }
    if (event.target.closest(".receive-purchase-order")) {
      openReceivePurchaseOrderModal(card.dataset.purchaseOrderId);
    }
  });
  document.querySelector("#purchaseOrdersFilters")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-purchase-filter]");
    if (!btn) return;
    state.purchaseOrdersFilter = btn.dataset.purchaseFilter || "pending";
    renderPurchaseOrders(state.purchaseOrders);
  });
  document.querySelector("#quoteDashboard").addEventListener("click", async (event) => {
    const chipButton = event.target.closest("[data-quote-chip]");
    if (chipButton) {
      setQuoteMode("operational");
      state.quoteStep = "supplier";
      const lens = quoteLegacyChipToLens(chipButton.dataset.quoteChip || "all");
      state.quoteSupplierLenses = lens === "all" ? [] : [lens];
      state.quoteSupplierChip = lens;
      state.quoteSupplierChipPinned = lens !== "all";
      state.quoteSupplierPreviewId = "";
      state.quoteSupplierPopupOpen = false;
      renderQuotes({ preserveScroll: false, summaryOnly: true });
      updateQuoteFlow();
      return;
    }
    const supplierButton = event.target.closest("[data-quote-supplier]");
    if (supplierButton?.dataset.quoteSupplier) {
      setQuoteMode("operational");
      state.quoteStep = "supplier";
      await loadQuoteSupplierWorkbench(supplierButton.dataset.quoteSupplier);
    }
  });
  document.querySelector("#quoteFormula").addEventListener("input", (event) => {
    if (event.target.closest("[data-formula-input]")) syncQuoteFormula();
  });
  document.querySelector("#quoteFormula").addEventListener("change", (event) => {
    if (event.target.closest("[data-formula-input]")) syncQuoteFormula();
  });
  document.querySelector("#quoteFormula").addEventListener("click", (event) => {
    if (!event.target.closest("[data-formula-reset]")) return;
    state.quoteFormulaSettings = quoteFormulaDefaultSettings();
    renderQuoteFormula();
  });
  document.querySelector("#quotes").addEventListener("click", (event) => {
    const journeyAction = event.target.closest("[data-quote-journey-action]");
    if (journeyAction) {
      runQuoteCommand(journeyAction.dataset.quoteJourneyAction);
      return;
    }
    const journeyStep = event.target.closest("[data-quote-journey-step]");
    if (journeyStep) {
      const step = journeyStep.dataset.quoteJourneyStep;
      if (step === "supplier") setQuoteStep("supplier");
      else if (step === "items" || step === "assembly") setQuoteStep("assembly");
      else if (step === "send" || step === "review") setQuoteStep("review");
      else if (step === "response") runQuoteCommand("response");
      else if (step === "confirm") runQuoteCommand("confirm");
      else if (step === "arrival") runQuoteCommand("arrival");
      return;
    }
    const command = event.target.closest("[data-quote-command]");
    if (command) {
      runQuoteCommand(command.dataset.quoteCommand, command);
      return;
    }
    const tab = event.target.closest("[data-quote-step]");
    if (tab && !tab.disabled) setQuoteStep(tab.dataset.quoteStep || "assembly");
  });
  document.querySelector("#quoteDetail").addEventListener("click", (event) => {
    const sortHeader = event.target.closest("[data-quote-sort]");
    if (sortHeader) { toggleQuoteWorkbenchSort(sortHeader.dataset.quoteSort); return; }
    const check = event.target.closest(".qrow-check");
    if (check) { event.stopPropagation(); toggleWorkbenchItem(check); return; }
    const toggle = event.target.closest(".qrow-toggle");
    if (toggle) { event.stopPropagation(); toggleWorkbenchRow(toggle.closest(".qrow")); return; }
    const mixButton = event.target.closest(".qrow-mix-action");
    if (mixButton) { event.stopPropagation(); updateWorkbenchMixDecision(mixButton); return; }
    if (event.target.closest(".quote-mark-visible")) { bulkSetVisibleQuoteItems(true); return; }
    if (event.target.closest(".quote-complete-minimum")) { completeMinimumOrder(); return; }
    if (event.target.closest(".quote-round-packages")) { roundIncludedToPackages(); return; }
    if (event.target.closest(".quote-manual-item")) { openManualQuoteItemModal(); return; }
    if (event.target.closest(".quote-unmark-visible")) { bulkSetVisibleQuoteItems(false); return; }
    if (event.target.closest(".quote-restore-items")) { restoreSuggestedQuoteItems(); return; }
    if (event.target.closest(".quote-clear-items")) { clearWorkbenchQuoteItems(); return; }
    const filterPill = event.target.closest(".qf-pill");
    if (filterPill) { filterWorkbenchRows(filterPill.dataset.filter); return; }
    const boxButton = event.target.closest(".qrow-box-button");
    if (boxButton) {
      event.stopPropagation();
      const row = boxButton.closest("[data-product-row]");
      if (row?.dataset.productId) openQuoteProductDrawer(row.dataset.productId);
      return;
    }
    const detailButton = event.target.closest(".qrow-detail");
    if (detailButton) {
      event.stopPropagation();
      const row = detailButton.closest("[data-product-row]");
      if (row?.dataset.productId) openQuoteProductDrawer(row.dataset.productId);
      return;
    }
    const quickBtn = event.target.closest(".link-sug, .qrow-step, .qrow-quick");
    if (quickBtn) { event.stopPropagation(); applyQuickQuantity(quickBtn); return; }
    const productRow = event.target.closest("[data-product-row]");
    if (productRow && !event.target.closest("input, select, button")) {
      openQuoteProductDrawer(productRow.dataset.productId);
    }
  });
  document.querySelector("#quoteDetail").addEventListener("input", (event) => {
    if (event.target.classList.contains("quote-quantity-input")) scheduleWorkbenchQuantitySave(event.target);
    if (event.target.classList.contains("quote-package-input")) scheduleWorkbenchQuantitySave(event.target);
    if (event.target.id === "quoteItemSearch") {
      state.quoteItemSearch = event.target.value;
      applyWorkbenchView();
    }
    if (event.target.id === "quoteMinDemand") {
      state.quoteWorkbenchMinDemand = event.target.value;
      applyWorkbenchView();
    }
    if (event.target.id === "quoteMinValue") {
      state.quoteWorkbenchMinValue = event.target.value;
      applyWorkbenchView();
    }
    if (event.target.id === "quoteMaxCoverage") {
      state.quoteWorkbenchMaxCoverage = event.target.value;
      applyWorkbenchView();
    }
  });
  document.querySelector("#quoteDetail").addEventListener("change", (event) => {
    if (event.target.id === "quoteWorkbenchGroup") {
      setQuoteWorkbenchGroup(event.target.value);
      return;
    }
    if (event.target.id === "quoteWorkbenchOnly") {
      state.quoteWorkbenchOnly = event.target.value || "all";
      applyWorkbenchView();
      return;
    }
    if (event.target.classList.contains("quote-unit-select")) scheduleWorkbenchQuantitySave(event.target);
  });
  document.querySelector("#quoteFinal").addEventListener("click", (event) => {
    if (event.target.closest(".quote-back-review")) {
      setQuoteStep("assembly");
      return;
    }
    if (event.target.closest(".quote-export-pdf")) exportCurrentQuotePdf();
    const generateButton = event.target.closest(".quote-generate");
    if (generateButton) generateCurrentQuote(generateButton);
  });
  document.querySelectorAll("[data-commercial-mode]").forEach((button) => {
    button.addEventListener("click", () => setCommercialMode(button.getAttribute("data-commercial-mode")));
  });
  document.querySelectorAll("[data-customer-mode]").forEach((button) => {
    button.addEventListener("click", () => setCustomerMode(button.getAttribute("data-customer-mode")));
  });
  document.querySelectorAll("[data-pricing-mode]").forEach((button) => {
    button.addEventListener("click", () => setPricingMode(button.getAttribute("data-pricing-mode")));
  });
  document.querySelector("#pricingDashboard").addEventListener("click", (event) => {
    const target = event.target.closest("[data-product-id]");
    if (target?.dataset.productId) openPricingModal(target.dataset.productId);
  });
  document.querySelector("#pricingQueue").addEventListener("click", (event) => {
    const row = event.target.closest("[data-product-id]");
    if (!row?.dataset.productId) return;
    state.selectedPricingProductId = row.dataset.productId;
    renderPricing(state.pricing || { rows: [] });
  });
  document.querySelector("#pricingInspector").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-pricing-edit]");
    if (edit?.dataset.pricingEdit) {
      openPricingModal(edit.dataset.pricingEdit);
      return;
    }
    const product = event.target.closest("[data-pricing-product]");
    if (product?.dataset.pricingProduct) {
      setView("products");
      setTimeout(() => openProductModal(product.dataset.pricingProduct), 0);
    }
  });
  document.querySelector("#pricingTable").addEventListener("click", (event) => {
    const row = event.target.closest(".pricing-row");
    if (row) {
      state.selectedPricingProductId = row.dataset.productId;
      renderPricing(state.pricing || { rows: [] });
      openPricingModal(row.dataset.productId);
    }
  });
  document.querySelector("#dashboard")?.addEventListener("click", (event) => {
    if (event.currentTarget.classList.contains("dashboard-editing")) return;
    const target = event.target.closest("[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });
  document.querySelector("#whatsappFloatButton")?.addEventListener("click", () => toggleWhatsAppOverlay());
  renderNavBadges();
  document.querySelectorAll(".period-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      state.periodDays = button.dataset.periodDays;
      document.querySelectorAll(".period-btn").forEach((item) => item.classList.toggle("active", item === button));
      await refreshPeriodData();
    });
  });
  document.querySelector("#hideCurrentMonthRevenue")?.addEventListener("click", () => {
    state.hideCurrentMonthRevenue = !state.hideCurrentMonthRevenue;
    renderMonthly(state.summary?.monthly || [], state.summary?.monthly_granularity);
  });
  document.querySelector("#modalClose").addEventListener("click", closeModal);
  document.querySelector("#modalOverlay").addEventListener("click", (event) => {
    if (event.target.id === "modalOverlay") closeModal();
  });
  document.addEventListener("click", (event) => {
    const quickButton = event.target.closest("button[data-quick-action]");
    if (!quickButton) return;
    openQuickActionModal(state.quickActions.get(quickButton.dataset.quickAction));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("#modalOverlay").hidden) closeModal();
  });
  document.querySelector("#maturity").addEventListener("click", (event) => {
    const target = event.target.closest("button[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });
  document.querySelector("#maturityNextButton").addEventListener("click", (event) => {
    if (event.currentTarget.dataset.viewTarget) setView(event.currentTarget.dataset.viewTarget);
  });
  document.querySelector("#missions").addEventListener("click", (event) => {
    const target = event.target.closest("button[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });
  document.querySelector("#actionsBoard").addEventListener("click", (event) => {
    const viewTarget = event.target.closest("button[data-view-target]");
    if (viewTarget?.dataset.viewTarget) {
      setView(viewTarget.dataset.viewTarget);
      return;
    }
    if (event.target.classList.contains("resolve-action")) resolveAction(event.target);
    if (event.target.classList.contains("explain-action")) explainAction(event.target);
    const row = event.target.closest("[data-action-id]");
    if (row && !event.target.closest(".resolve-action, .explain-action")) {
      state.selectedActionId = row.dataset.actionId;
      renderActions(state.actions || {});
    }
  });
  document.querySelector("#actionDetail").addEventListener("click", (event) => {
    if (event.target.classList.contains("resolve-action")) resolveAction(event.target);
    if (event.target.classList.contains("explain-action")) explainAction(event.target);
  });
  document.querySelector("#actionsHero").addEventListener("click", (event) => {
    if (event.target.classList.contains("resolve-action")) resolveAction(event.target);
    if (event.target.classList.contains("explain-action")) explainAction(event.target);
  });
  document.querySelector("#refreshActionsButton").addEventListener("click", refreshActions);
  document.querySelector("#refreshEngineButton").addEventListener("click", async () => {
    const [skillsPayload, actionsPayload] = await Promise.all([
      api("/api/nexo/skills"),
      apiContract("/api/actions/today", "actions_today.v1"),
    ]);
    state.skills = skillsPayload;
    state.actions = actionsPayload;
    renderActions(actionsPayload);
    renderEngine(skillsPayload, actionsPayload);
  });
  document.querySelector("#whyPanel").addEventListener("click", (event) => {
    const target = event.target.closest("button[data-view-target]");
    if (target?.dataset.viewTarget) setView(target.dataset.viewTarget);
  });

  window.addEventListener("popstate", () => setView(viewFromLocation(), { updateHistory: false }));
  window.addEventListener("resize", resizeDashboardCharts);
  document.addEventListener("nexo:viewchange", (event) => {
    if (event.detail?.view === "dashboard") {
      scheduleChartRecovery();
      resizeDashboardCharts();
    }
  });
  if (initialView === "pricing") {
    const pricingParams = new URLSearchParams(window.location.search);
    setPricingMode(pricingParams.get("pricing_mode") || state.pricingMode);
    if (pricingParams.get("pricing_product_id")) openPricingModal(pricingParams.get("pricing_product_id"));
  }
  if (initialView === "opportunities") {
    setCommercialMode(new URLSearchParams(window.location.search).get("commercial_mode") || state.commercialMode);
  }
  if (initialView === "customers") {
    setCustomerMode(new URLSearchParams(window.location.search).get("customer_mode") || state.customerMode);
  }
  window.history.replaceState({ view: initialView }, "", routeForView(initialView));
}

boot().catch((error) => {
  console.error(error);
  hideStartupScreen();
  showAppError("Falha ao iniciar a mesa", error.message || "Não foi possível carregar os dados iniciais.");
});
