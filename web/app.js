const orgId = 'org_practica';
const storeId = 'loja_1';

const state = {
  summary: null,
  purchases: [],
  rfm: [],
  abc: [],
  top: [],
};

const stageCopy = {
  dados: ['Etapa 1', 'Dados prontos para decidir'],
  compras: ['Etapa 2', 'Compras em ordem de urgencia'],
  clientes: ['Etapa 3', 'Clientes que pedem movimento'],
  mix: ['Etapa 4', 'Mix com foco comercial'],
  acoes: ['Etapa 5', 'Fila objetiva do dia'],
};

function $(id) {
  return document.getElementById(id);
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

function fmtMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function fmtNum(value, digits = 0) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

function clampText(text, max = 68) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max - 1) + '...' : value;
}

function setStep(step) {
  document.querySelectorAll('.step').forEach(btn => btn.classList.toggle('active', btn.dataset.step === step));
  document.querySelectorAll('.stage').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === step));
  const [eyebrow, title] = stageCopy[step];
  $('stageEyebrow').textContent = eyebrow;
  $('stageTitle').textContent = title;
}

function renderMetrics() {
  const s = state.summary || {};
  const rows = [
    ['Vendas', fmtMoney(s.sales_gross_amount)],
    ['Estoque', fmtMoney(s.stock_sale_value)],
    ['Clientes', fmtNum(s.customers)],
    ['Produtos', fmtNum(s.products)],
    ['Servicos', fmtMoney(s.service_gross_amount)],
  ];
  $('metrics').innerHTML = rows.map(([label, value]) => `
    <article class="metric">
      <small>${label}</small>
      <strong>${value}</strong>
    </article>
  `).join('');
}

function renderDayFlow() {
  const s = state.summary || {};
  const items = [
    ['Conferir base', `${fmtNum(s.sales_lines)} vendas, ${fmtNum(s.products)} produtos e ${fmtNum(s.customers)} clientes.`],
    ['Atacar compras', `${fmtNum(state.purchases.length)} itens com sugestao calculada.`],
    ['Recuperar clientes', `${fmtNum(state.rfm.filter(r => r.segment === 'em_risco').length)} clientes em risco na amostra.`],
    ['Rever mix', `${fmtNum(state.abc.filter(r => r.abc_class === 'A').length)} itens classe A no recorte.`],
  ];
  $('dayFlow').innerHTML = items.map((item, index) => `
    <li><b>${index + 1}</b><span><strong>${item[0]}</strong><small>${item[1]}</small></span></li>
  `).join('');
  $('healthBadge').textContent = s.sales_lines ? 'base carregada' : 'sem carga';
}

function renderPurchases() {
  $('purchaseCount').textContent = `${fmtNum(state.purchases.length)} itens`;
  $('purchaseRows').innerHTML = state.purchases.slice(0, 80).map(item => `
    <tr>
      <td><strong>${clampText(item.name, 60)}</strong><br><small>${item.source_code}</small></td>
      <td>${item.brand || '-'}</td>
      <td>${fmtNum(item.stock_on_hand, 1)}</td>
      <td>${fmtNum(item.suggested_quantity, 1)}</td>
      <td>${fmtNum(item.coverage_days, 1)} dias</td>
    </tr>
  `).join('');
}

function renderRanks() {
  $('rfmRows').innerHTML = state.rfm.slice(0, 12).map(row => `
    <div class="rank-item">
      <span><strong>${clampText(row.customer_name, 72)}</strong><small>${row.frequency} compras · ${row.recency_days} dias</small></span>
      <span class="amount">${fmtMoney(row.monetary)}</span>
    </div>
  `).join('');

  $('abcRows').innerHTML = state.abc.slice(0, 14).map(row => `
    <div class="rank-item">
      <span><strong>${clampText(row.name, 72)}</strong><small>Classe ${row.abc_class} · ${(row.share * 100).toFixed(1)}%</small></span>
      <span class="amount">${fmtMoney(row.gross_amount)}</span>
    </div>
  `).join('');

  $('topRows').innerHTML = state.top.slice(0, 14).map(row => `
    <div class="rank-item">
      <span><strong>${clampText(row.name, 72)}</strong><small>${row.brand || '-'} · ${fmtNum(row.quantity, 1)} un.</small></span>
      <span class="amount">${fmtMoney(row.gross_amount)}</span>
    </div>
  `).join('');
}

function renderActions() {
  const firstPurchase = state.purchases[0];
  const firstClient = state.rfm[0];
  const firstProduct = state.abc[0];
  const actions = [
    ['Compra', firstPurchase ? firstPurchase.name : 'Sem item urgente', firstPurchase ? `${fmtNum(firstPurchase.suggested_quantity, 1)} unidades sugeridas` : 'Nenhuma sugestao no recorte atual'],
    ['Cliente', firstClient ? firstClient.customer_name : 'Sem cliente em risco', firstClient ? `${fmtMoney(firstClient.monetary)} historico` : 'RFM sem pendencias'],
    ['Mix', firstProduct ? firstProduct.name : 'Sem curva ABC', firstProduct ? `Classe ${firstProduct.abc_class} em ${fmtMoney(firstProduct.gross_amount)}` : 'Importe vendas para calcular'],
  ];
  $('actionGrid').innerHTML = actions.map(([tag, title, copy]) => `
    <article class="action">
      <span>${tag}</span>
      <strong>${clampText(title, 82)}</strong>
      <p>${copy}</p>
    </article>
  `).join('');
}

function drawDecisionMap() {
  const canvas = $('decisionMap');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f5f7f2';
  ctx.fillRect(0, 0, w, h);

  const s = state.summary || {};
  const nodes = [
    { label: 'Vendas', value: s.sales_gross_amount || 0, x: 160, y: 135, color: '#0f8f72' },
    { label: 'Estoque', value: s.stock_sale_value || 0, x: 480, y: 88, color: '#4aa8b5' },
    { label: 'Servicos', value: s.service_gross_amount || 0, x: 790, y: 150, color: '#e05f3f' },
    { label: 'Compras', value: state.purchases.length || 0, x: 310, y: 315, color: '#f2b84b' },
    { label: 'Clientes', value: state.rfm.length || 0, x: 650, y: 315, color: '#6c5a8f' },
  ];

  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(32,36,38,.12)';
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      ctx.beginPath();
      ctx.moveTo(nodes[i].x, nodes[i].y);
      ctx.quadraticCurveTo(w / 2, h / 2, nodes[j].x, nodes[j].y);
      ctx.stroke();
    }
  }

  const max = Math.max(...nodes.map(n => Number(n.value) || 1));
  nodes.forEach(node => {
    const radius = 42 + Math.sqrt((Number(node.value) || 1) / max) * 46;
    ctx.beginPath();
    ctx.fillStyle = node.color;
    ctx.globalAlpha = 0.16;
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.fillStyle = node.color;
    ctx.arc(node.x, node.y, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 13px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(node.label, node.x, node.y + 5);
    ctx.fillStyle = '#202426';
    ctx.font = '800 22px Segoe UI, sans-serif';
    const value = node.label === 'Compras' || node.label === 'Clientes'
      ? fmtNum(node.value)
      : fmtMoney(node.value).replace('R$', '').trim();
    ctx.fillText(value, node.x, node.y + radius + 28);
  });
}

function drawClientCanvas() {
  const canvas = $('clientCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f5f7f2';
  ctx.fillRect(0, 0, w, h);
  const rows = state.rfm.slice(0, 28);
  rows.forEach((row, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(rows.length, 1);
    const distance = 80 + Math.min(row.recency_days, 365) / 365 * 150;
    const x = w / 2 + Math.cos(angle) * distance;
    const y = h / 2 + Math.sin(angle) * distance;
    const radius = 6 + Math.min(row.monetary / 20000, 1) * 18;
    ctx.beginPath();
    ctx.fillStyle = row.segment === 'em_risco' ? '#e05f3f' : '#0f8f72';
    ctx.globalAlpha = 0.72;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#202426';
  ctx.font = '800 18px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RFM', w / 2, h / 2 + 6);
}

async function loadAll() {
  $('syncState').textContent = 'Atualizando';
  const qs = `organization_id=${orgId}&store_id=${storeId}`;
  const [summary, purchases, rfm, abc, top] = await Promise.all([
    api(`/api/summary?${qs}`),
    api(`/api/purchase-suggestions?${qs}&limit=150`),
    api(`/api/rfm?organization_id=${orgId}&limit=80`),
    api(`/api/abc?${qs}&limit=80`),
    api(`/api/top-products?${qs}&limit=80`),
  ]);
  state.summary = summary;
  state.purchases = purchases.items || [];
  state.rfm = rfm.items || [];
  state.abc = abc.items || [];
  state.top = top.items || [];
  renderMetrics();
  renderDayFlow();
  renderPurchases();
  renderRanks();
  renderActions();
  drawDecisionMap();
  drawClientCanvas();
  $('syncState').textContent = 'Pronto';
}

async function importData() {
  $('syncState').textContent = 'Importando';
  $('importButton').disabled = true;
  try {
    await api('/api/import-practica', { method: 'POST' });
    await loadAll();
  } finally {
    $('importButton').disabled = false;
  }
}

document.querySelectorAll('.step').forEach(btn => {
  btn.addEventListener('click', () => {
    setStep(btn.dataset.step);
    requestAnimationFrame(() => {
      drawDecisionMap();
      drawClientCanvas();
    });
  });
});

$('importButton').addEventListener('click', importData);

loadAll().catch(error => {
  $('syncState').textContent = 'Sem base';
  $('dayFlow').innerHTML = `<li><b>1</b><span><strong>Importar dados</strong><small>${error.message}</small></span></li>`;
});
