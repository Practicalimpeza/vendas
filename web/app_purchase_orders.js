function purchaseOrderStatusText(status) {
  return {
    pending_confirmation: "Aguardando confirmação",
    awaiting_supplier_confirmation: "Aguardando confirmação",
    quote_response_registered: "Resposta registrada",
    approved: "Aprovado",
    sent: "Enviado",
    partial_received: "Recebido parcial",
    received: "Recebido",
    cancelled: "Cancelado",
  }[status] || status || "-";
}

function filterPurchaseOrdersForView(rows, filter) {
  if (filter === "pending") return rows.filter((row) => ["pending_confirmation", "awaiting_supplier_confirmation", "quote_response_registered"].includes(row.status));
  if (filter === "approved") return rows.filter((row) => ["approved", "sent", "partial_received"].includes(row.status));
  if (filter === "received") return rows.filter((row) => row.status === "received");
  return rows;
}

async function refreshPurchaseOrders() {
  state.purchaseOrders = await apiRows(
    "/api/purchase-orders?status=open",
    ["id", "supplier_id", "supplier_name", "status", "total_amount", "item_count", "approved_item_count", "overdue"],
    "purchase_orders_list.v1",
  );
  renderPurchaseOrders(state.purchaseOrders);
}

// Compras: renderização dos cards de pedidos.

function purchaseOrderFilterCounts(rows = state.purchaseOrders || []) {
  return {
    pending: rows.filter((row) => ["pending_confirmation", "awaiting_supplier_confirmation", "quote_response_registered"].includes(row.status)).length,
    approved: rows.filter((row) => ["approved", "sent", "partial_received"].includes(row.status)).length,
    received: rows.filter((row) => row.status === "received").length,
  };
}

function purchaseOrderCards(rows = state.purchaseOrders || []) {
  const filter = state.purchaseOrdersFilter || "pending";
  const visible = filterPurchaseOrdersForView(rows, filter);
  if (!visible.length) {
    const empty = {
      pending: "Nenhum pedido aguardando confirmação. Depois da resposta do fornecedor, gere o pedido pela cotação.",
      approved: "Nenhum pedido aberto no momento.",
      received: "Nenhum pedido recebido ainda.",
    }[filter] || "Sem pedidos.";
    return `<div class="purchase-orders-empty">${escapeHtml(empty)}</div>`;
  }
  return visible.map((row) => {
    const overdue = Number(row.overdue || 0) > 0;
    const isPending = row.status === "pending_confirmation";
    const isQuoteAwaiting = row.status === "awaiting_supplier_confirmation";
    const isQuoteResponded = row.status === "quote_response_registered";
    const statusCls = isPending || isQuoteAwaiting || isQuoteResponded ? "warn" : overdue ? "danger" : row.status === "partial_received" ? "warn" : "info";
    const cardReference = isQuoteResponded
      ? "Resposta registrada na cotação"
      : isQuoteAwaiting
      ? "Cotação enviada ao fornecedor"
      : row.id;
    const primaryButton = isQuoteAwaiting
      ? `<button class="action-button compact respond-purchase-quote" type="button">Registrar resposta</button>`
      : isQuoteResponded
      ? `<button class="action-button compact generate-purchase-order" type="button">Gerar pedido</button>`
      : isPending
      ? `<button class="action-button compact confirm-purchase-order" type="button">Confirmar pedido</button>`
      : `<button class="action-button compact receive-purchase-order" type="button">Registrar chegada</button>`;
    return `
      <article class="purchase-order-card ${overdue ? "overdue" : ""} ${isPending || isQuoteAwaiting ? "pending" : ""}" data-purchase-order-id="${escapeAttr(row.id)}" data-quote-request-id="${escapeAttr(row.quote_request_id || "")}">
        <div>
          <span class="status-chip ${statusCls}">${escapeHtml(overdue ? "Atrasado" : purchaseOrderStatusText(row.status))}</span>
          <strong>${escapeHtml(row.supplier_name || "Fornecedor")}</strong>
          <em>${escapeHtml(cardReference)}</em>
        </div>
        <dl>
          <div><dt>Total</dt><dd>${money(row.total_amount || 0)}</dd></div>
          <div><dt>Itens</dt><dd>${number(row.approved_item_count || row.item_count || 0)}</dd></div>
          <div><dt>${isQuoteAwaiting || isQuoteResponded ? "Enviado" : "Previsao"}</dt><dd>${escapeHtml(isQuoteAwaiting || isQuoteResponded ? row.sent_at || row.created_at || "-" : row.expected_delivery_date || "-")}</dd></div>
          <div><dt>${isQuoteAwaiting || isQuoteResponded ? "Próximo passo" : "Mínimo"}</dt><dd>${isQuoteResponded ? "Gerar pedido" : isQuoteAwaiting ? "Registrar resposta" : Number(row.minimum_order_met || 0) ? "Atingido" : "Abaixo"}</dd></div>
        </dl>
        ${primaryButton}
      </article>
    `;
  }).join("");
}

function updatePurchaseOrderFilters() {
  const counts = purchaseOrderFilterCounts();
  const active = state.purchaseOrdersFilter || "pending";
  const labels = { pending: "Aguardando confirmação", approved: "Aprovados", received: "Recebidos" };
  document.querySelectorAll("#purchaseOrdersFilters [data-purchase-filter]").forEach((btn) => {
    const key = btn.dataset.purchaseFilter;
    btn.innerHTML = `<span>${escapeHtml(labels[key] || key)}</span><em>${number(counts[key] || 0)}</em>`;
    btn.classList.toggle("active", key === active);
  });
}

function renderPurchaseOrders(rows = state.purchaseOrders || []) {
  if (!state.purchaseOrdersFilter) state.purchaseOrdersFilter = "pending";
  const target = document.querySelector("#purchaseOrdersBoard");
  if (target) target.innerHTML = purchaseOrderCards(rows);
  updatePurchaseOrderFilters();
  renderQuoteJourney();
}

function purchaseReceiveRows(items = []) {
  return items.map((item) => `
    <tr data-purchase-order-item-id="${escapeAttr(item.id)}">
      <td>
        <strong class="product-name">${escapeHtml(item.product_name)}</strong>
        <span class="muted-line">${escapeHtml(item.quote_code || item.source_code || "")} - ${escapeHtml(item.unit || "UN")}</span>
      </td>
      <td class="num expected-qty">${number(item.final_quantity || item.ordered_quantity || 0)}</td>
      <td><input class="inline-input compact-input purchase-receive-qty" type="text" inputmode="decimal" value="${inputValue(item.received_quantity || item.final_quantity || item.ordered_quantity || 0)}" /></td>
      <td><input class="inline-input purchase-receive-notes" type="text" value="${inputValue(item.notes || "")}" placeholder="divergência, avaria, falta..." /></td>
    </tr>
  `).join("");
}

function updateReceivePreview(body) {
  const totals = Array.from(body.querySelectorAll("[data-purchase-order-item-id]")).reduce((acc, row) => {
    const expected = parseInputNumber(row.querySelector(".expected-qty")?.textContent || "0");
    const received = parseInputNumber(row.querySelector(".purchase-receive-qty").value);
    acc.expected += expected;
    acc.received += received;
    if (Math.abs(expected - received) > 0.0001) acc.divergent += 1;
    return acc;
  }, { expected: 0, received: 0, divergent: 0 });
  body.querySelector("#receiveExpected").textContent = number(totals.expected);
  body.querySelector("#receiveReceived").textContent = number(totals.received);
  body.querySelector("#receiveDivergent").textContent = number(totals.divergent);
  body.querySelector(".purchase-close-summary").classList.toggle("warn", totals.divergent > 0);
}

async function openReceivePurchaseOrderModal(orderId) {
  if (!orderId) return;
  const order = await apiContract(`/api/purchase-order?id=${encodeURIComponent(orderId)}`, "purchase_order_detail.v1");
  openModal(
    "Registrar chegada",
    `
      <div class="modal-context">
        <strong>${escapeHtml(order.supplier_name || "Fornecedor")}</strong>
        <span>Este registro não altera estoque. Ele cria memória operacional para comparar pedido, entrega e desempenho do fornecedor.</span>
      </div>
      <div class="purchase-close-summary">
        <div><span>Esperado</span><strong id="receiveExpected">0</strong></div>
        <div><span>Recebido</span><strong id="receiveReceived">0</strong></div>
        <div><span>Divergências</span><strong id="receiveDivergent">0</strong></div>
        <div><span>Fonte estoque</span><strong>ERP</strong></div>
      </div>
      <div class="table-wrap quote-items">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th class="num">Esperado</th>
              <th class="num">Recebido</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>${purchaseReceiveRows(order.items || [])}</tbody>
        </table>
      </div>
      <label class="modal-field">
        <span>Observação da chegada</span>
        <textarea class="inline-input quick-note" id="purchaseReceiveNotes" rows="3" placeholder="atraso, entrega parcial, devolucao, combinados...">${escapeHtml(order.notes || "")}</textarea>
      </label>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="purchaseReceiveCancel">Cancelar</button>
        <button class="action-button" type="button" id="purchaseReceiveSave">Registrar chegada</button>
      </div>
      <span class="save-state" id="purchaseReceiveState" aria-live="polite"></span>
    `,
    (body) => {
      const saveState = body.querySelector("#purchaseReceiveState");
      const refreshPreview = () => updateReceivePreview(body);
      body.querySelectorAll("input").forEach((input) => input.addEventListener("input", refreshPreview));
      refreshPreview();
      body.querySelector("#purchaseReceiveCancel").addEventListener("click", closeModal);
      body.querySelector("#purchaseReceiveSave").addEventListener("click", async () => {
        saveState.textContent = "Registrando chegada";
        const items = Array.from(body.querySelectorAll("[data-purchase-order-item-id]")).map((row) => ({
          item_id: row.dataset.purchaseOrderItemId,
          received_quantity: row.querySelector(".purchase-receive-qty").value.trim(),
          notes: row.querySelector(".purchase-receive-notes").value.trim(),
        }));
        try {
          await apiPost("/api/purchase-orders/receive", {
            id: orderId,
            items,
            notes: body.querySelector("#purchaseReceiveNotes").value.trim(),
          });
          saveState.textContent = "Chegada registrada";
          closeModal();
          await refreshPurchaseOrders();
          await refreshActions();
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
    { modalClass: "quote-cycle-modal" },
  );
}

