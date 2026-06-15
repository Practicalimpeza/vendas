const state = {
  products: [],
  appConfig: {
    app_name: "Sistema",
    app_subtitle: "Mesa de operação",
    logo_path: "",
  },
  productMode: "operational",
  productFilteredRows: [],
  stock: [],
  summary: null,
  suppliers: [],
  supplierMode: "operational",
  quoteSuppliers: [],
  quoteWorkbench: null,
  selectedQuoteSupplierId: "",
  quoteWindowDays: "90",
  quoteMode: "operational",
  quoteFormulaSettings: quoteFormulaDefaultSettings(),
  quoteStep: "supplier",
  quoteSaveTimers: new Map(),
  postSaveRefreshTasks: {},
  postSaveRefreshOptions: {},
  postSaveRefreshTimer: null,
  quoteSupplierChip: "all",
  quoteSupplierChipPinned: false,
  quoteSupplierLenses: [],
  quoteSupplierSort: "supplier",
  quoteSupplierSortDir: "asc",
  quoteSupplierViewMode: "table",
  quoteSupplierSearchTimer: null,
  quoteSupplierPreviewId: "",
  quoteSupplierPopupOpen: false,
  quoteWorkbenchPrefetch: new Map(),
  quoteWorkbenchSort: { key: "", dir: "asc" },
  quoteWorkbenchGroup: "flat",
  quoteWorkbenchOnly: "all",
  quoteWorkbenchMinDemand: "",
  quoteWorkbenchMinValue: "",
  quoteWorkbenchMaxCoverage: "",
  quotes: [],
  purchaseOrders: [],
  maturity: null,
  replenishment: null,
  commercial: null,
  commercialMode: "operational",
  salesRows: [],
  salesRowsPeriodKey: "",
  actions: null,
  selectedActionId: "",
  skills: null,
  pricing: null,
  pricingMode: "operational",
  selectedPricingProductId: "",
  customers: [],
  customerMode: "operational",
  selectedCustomerId: "",
  customerCrm: null,
  customerCatalog: null,
  customerCatalogSearchTimer: null,
  customerSalesOrderDraftItems: [],
  customerSalesOrderSearchRows: [],
  customerSalesOrderSearchTimer: null,
  services: [],
  imports: null,
  implementation: null,
  adminUsers: [],
  whatsapp: null,
  whatsappDetail: null,
  selectedWhatsappConversationId: "",
  companyProfile: null,
  installation: null,
  importMode: "operational",
  erpImportProfile: "operador",
  erpImportStep: "idle",
  erpImportResult: null,
  erpImport: null,
  erpImportPayload: null,
  erpImportFile: null,
  erpManualConflicts: [],
  importOnboardingFocus: false,
  importOnboardingFocused: false,
  quickActions: new Map(),
  periodDays: "30",
  hideCurrentMonthRevenue: false,
  monthlyChart: null,
  generalCharts: {},
  periodRenderedViews: {},
};

function appName() {
  return state.appConfig?.app_name || "Sistema";
}

function appSubtitle() {
  return state.appConfig?.app_subtitle || "Mesa de operação";
}

function appLogoPath() {
  return state.appConfig?.logo_path || "";
}

function applyAppConfig() {
  const logoPath = appLogoPath();
  document.querySelectorAll("[data-app-name]").forEach((el) => {
    el.textContent = appName();
  });
  document.querySelectorAll("[data-app-subtitle]").forEach((el) => {
    el.textContent = appSubtitle();
  });
  document.querySelectorAll("[data-app-logo]").forEach((el) => {
    if (logoPath) {
      el.src = logoPath;
      el.alt = appName();
      el.hidden = false;
    } else {
      el.removeAttribute("src");
      el.alt = "";
      el.hidden = true;
    }
  });
  document.querySelectorAll("[data-app-icon]").forEach((el) => {
    el.href = logoPath || "data:,";
  });
  document.querySelectorAll("[data-app-label]").forEach((el) => {
    el.setAttribute("aria-label", el.dataset.appLabel.replace("{app}", appName()));
  });
  document.title = appName();
}

async function loadAppConfig() {
  try {
    const config = await api("/api/app-config");
    state.appConfig = { ...state.appConfig, ...config };
  } catch (error) {
    console.warn("Falha ao carregar configuração do app", error);
  }
  applyAppConfig();
  return state.appConfig;
}

function quoteFormulaDefaultSettings() {
  return {
    abc: "A",
    observedDays: 365,
    qty30: 75,
    qty60: 135,
    qty90: 180,
    qty180: 300,
    qty365: 560,
    qtyAll: 560,
    saleDays180: 28,
    stdDaily: 0.8,
    leadTime: 7,
    reviewCycle: 7,
    minimumStock: 0,
    maximumStock: 0,
    stockUnits: 38,
    openOrder: 0,
    packageSize: 12,
    maxSingleSale: 10,
    weight30: 30,
    weight60: 25,
    weight90: 20,
    weight180: 15,
    weight365: 10,
    trendBase: 0.85,
    trendWeight: 0.15,
    trendMin: 0.75,
    trendMax: 1.25,
    totalHistoryFloor: 65,
    sparseSaleDayPct: 8,
    sparseMinSaleDays: 6,
    sparseRecentQty180Pct: 60,
    sparseSingleSaleMultiplier: 3,
    sparsePackageMultiplier: 6,
    sparseBurstMultiplier: 1.25,
    sparseNormalMultiplier: 1.10,
    sparse365Multiplier: 1.35,
    intermittentSaleDaysMax: 4,
    intermittentMultiplier: 0.85,
  };
}

const VIEW_ROUTES = {
  dashboard: "/painel",
  seller: "/vendedor",
  actions: "/hoje",
  engine: "/motor",
  products: "/produtos",
  stock: "/reposicao",
  suppliers: "/fornecedores",
  whatsapp: "/whatsapp",
  quotes: "/compras",
  pricing: "/precos",
  opportunities: "/oportunidades",
  customers: "/clientes",
  services: "/servicos",
  imports: "/importacao",
  implementation: "/implantacao",
  distribution: "/distribuicao",
  admin: "/admin",
};
const ROUTE_VIEWS = {
  ...Object.fromEntries(Object.entries(VIEW_ROUTES).map(([view, route]) => [route, view])),
  "/": "dashboard",
  "/cotacoes": "quotes",
};
const NAV_ICONS = {
  dashboard: "layout-dashboard",
  seller: "smartphone",
  actions: "list-todo",
  engine: "brain-circuit",
  products: "package-search",
  stock: "boxes",
  suppliers: "truck",
  whatsapp: "message-circle",
  quotes: "shopping-cart",
  pricing: "chart-no-axes-combined",
  opportunities: "bar-chart-3",
  customers: "users",
  services: "wrench",
  imports: "upload-cloud",
  implementation: "list-checks",
  distribution: "badge-check",
  admin: "shield-check",
};
const KPI_ICONS = {
  Produtos: "package",
  Clientes: "users",
  "Receita produtos": "trending-up",
  "Receita serviços": "briefcase-business",
  "Estoque un.": "boxes",
  Pendências: "circle-alert",
};
const SUPPLIER_WORKBENCH_SUPPLIER_KEYS = [
  "supplier_id",
  "supplier_name",
  "contact_phone",
  "minimum_order_value",
  "target_order_value",
  "active_skus",
  "buy_now_count",
  "urgent_count",
  "out_of_mix_count",
  "alert_count",
  "open_quote_count",
  "latest_quote_at",
  "latest_quote_id",
  "estimated_value",
  "stock_value",
  "turnover_value",
  "supplier_daily_purchase_value",
];
const VIEW_META = {
  dashboard: {
    label: "Painel",
    eyebrow: "Resumo executivo",
    subtitle: "Indicadores, vendas, estoque, clientes, compras e margem em um painel ajustável.",
    question: "O que precisa de atenção agora?",
    next: "Blocos, ordem e períodos podem ser ajustados por usuário.",
  },
  seller: {
    label: "Vendedor",
    eyebrow: "Portal mobile",
    subtitle: "Acesso rápido para clientes, produtos, vendas e pedidos em PDF.",
    question: "Qual cliente ou produto precisa de atenção agora?",
    next: "Abra a carteira, consulte produtos ou monte um pedido.",
  },
  quotes: {
    label: "Compras",
    eyebrow: "Mesa de trabalho",
    subtitle: "Fornecedores, pedido mínimo, mix, giro e sinais organizados para comprar com mais clareza.",
    question: "Como você quer olhar a mesa de compra?",
    next: "Use lentes, busca e ordenação para abrir o fornecedor certo no seu ritmo.",
  },
  stock: {
    label: "Estoque",
    eyebrow: "Giro e cobertura",
    subtitle: "Leitura de risco para saber o que pode faltar, o que está sobrando e o que deve alimentar compras.",
    question: "Onde falta produto ou sobra dinheiro parado?",
    next: "Revise ruptura, excesso e cobertura antes de comprar.",
  },
  products: {
    label: "Produtos",
    eyebrow: "Mix comercial",
    subtitle: "Produtos campeões, cauda longa, fornecedor, estoque e contexto para decidir o que manter no mix.",
    question: "Quais produtos sustentam o negócio?",
    next: "Abra produtos para ver venda, estoque, margem e memória.",
  },
  suppliers: {
    label: "Fornecedores",
    eyebrow: "Abastecimento",
    subtitle: "Fornecedores, marcas atendidas, pedido mínimo, contato e regras comerciais usadas nas compras.",
    question: "Quem sustenta meu abastecimento?",
    next: "Complete cadastro comercial antes de cotar.",
  },
  whatsapp: {
    label: "WhatsApp",
    eyebrow: "Atendimento",
    subtitle: "Fila compartilhada do número da empresa, com responsável, status, histórico e follow-up.",
    question: "Quem está esperando resposta agora?",
    next: "Assuma, transfira ou conclua cada conversa.",
  },
  customers: {
    label: "Clientes",
    eyebrow: "Carteira",
    subtitle: "Clientes por receita, recorrência e sinais para estudar padrões de compra.",
    question: "Quem compra, quanto compra e quem está esfriando?",
    next: "Use a carteira para identificar clientes importantes.",
  },
  opportunities: {
    label: "Vendas",
    eyebrow: "Movimento comercial",
    subtitle: "Clientes em risco, recompra provável e produtos ou marcas ganhando e perdendo ritmo.",
    question: "O que está mudando nas vendas?",
    next: "Compare clientes, produtos e marcas em movimento.",
  },
  services: {
    label: "Serviços",
    eyebrow: "Venda de serviços",
    subtitle: "Receita, volume e peso líquido dos serviços importados do ERP.",
    question: "Quais serviços ajudam o resultado?",
    next: "Compare receita bruta e líquida por serviço.",
  },
  pricing: {
    label: "Margem",
    eyebrow: "Preço e resultado",
    subtitle: "Produtos que vendem bem, mas podem estar entregando pouca margem pelo custo/preço atual.",
    question: "Onde vendo bem mas ganho pouco?",
    next: "Revise custo, papel do produto e preço alvo.",
  },
  actions: {
    label: "Alertas/Tarefas",
    eyebrow: "Memória operacional",
    subtitle: "Fila de trabalho, cotações, pedidos, decisões registradas e eventos recentes da operação.",
    question: "O que já virou rotina ou pendência?",
    next: "Resolva, ignore ou registre a decisão tomada.",
  },
  imports: {
    label: "Importacoes",
    eyebrow: "Dados do ERP",
    subtitle: "Entrada, mapeamento e confiabilidade dos dados que alimentam a mesa de trabalho.",
    question: "Posso confiar nos dados que estou vendo?",
    next: "Confira qualidade, mudanças e campos ainda faltantes.",
  },
  implementation: {
    label: "Implantação",
    eyebrow: "Primeiro valor",
    subtitle: "Jornada inicial para configurar a empresa, importar dados e liberar a rotina com segurança.",
    question: "O que falta para começar a usar bem?",
    next: "Siga as etapas em ordem e volte para revisar pendências.",
  },
  engine: {
    label: "Regras",
    eyebrow: "Critérios",
    subtitle: "Regras, dados e rastreabilidade que mostram de onde cada leitura saiu.",
    question: "Quais critérios sustentam essa leitura?",
    next: "Use para auditar regras e entender evidencias.",
  },
  distribution: {
    label: "Distribuição",
    eyebrow: "Consultor e licença",
    subtitle: "Marca do consultor, pacote aplicado, instalação local e estado de ativação do cliente.",
    question: "Esta instalação está pronta para operar como cliente ativo?",
    next: "Confira parceiro, pacote e licença antes de liberar a rotina.",
  },
  admin: {
    label: "Administração",
    eyebrow: "Acessos",
    subtitle: "Usuários, permissões por módulo e administração da empresa.",
    question: "Quem pode acessar cada área?",
    next: "Crie usuários e mantenha apenas os módulos necessários para cada função.",
  },
};

