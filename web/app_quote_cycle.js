// Compras: ciclo cotação, confirmação de pedido, recebimento e exportação.

function quoteResponseRows(items = []) {
  return items.map((item) => `
    <tr data-quote-item-id="${escapeAttr(item.id)}" data-product-id="${escapeAttr(item.product_id || "")}">
      <td>
        <button class="text-button product-name quote-response-product" type="button" data-product-id="${escapeAttr(item.product_id || "")}">${escapeHtml(item.product_name)}</button>
        <span class="muted-line">enviado ${number(item.requested_quantity)} ${escapeHtml(item.unit || "UN")}</span>
      </td>
      <td><input class="inline-input quote-response-reference" type="text" value="${inputValue(trimCode(item.supplier_reference || ""))}" placeholder="ref. fornecedor" /></td>
      <td>
        <select class="inline-input quote-response-availability">
          ${["", "available", "partial", "unavailable", "no_quote"].map((value) => `<option value="${value}" ${value === (item.availability || "") ? "selected" : ""}>${escapeHtml(availabilityText(value))}</option>`).join("")}
        </select>
      </td>
      <td><input class="inline-input compact-input quote-response-confirmed" type="text" inputmode="decimal" value="${inputValue(item.confirmed_quantity ?? "")}" placeholder="${escapeAttr(number(item.requested_quantity || 0))}" /></td>
      <td><input class="inline-input compact-input quote-response-lead" type="text" inputmode="numeric" value="${inputValue(item.quoted_lead_time_days ?? "")}" /></td>
      <td><input class="inline-input quote-response-notes" type="text" value="${inputValue(item.notes || "")}" placeholder="observação" /></td>
    </tr>
  `).join("");
}

async function openQuoteResponseModal(quoteId = "") {
  quoteId = quoteId || quoteRequestFromWorkbench(["sent", "responded"])?.id || "";
  if (!quoteId) {
    const status = document.querySelector("#quoteWorkbenchStatus") || document.querySelector("#quoteFinal .quote-final-note");
    if (status) status.textContent = "Não há cotação enviada para registrar resposta.";
    return;
  }
  const detail = await apiContract(`/api/quote?id=${encodeURIComponent(quoteId)}`, "quote_detail.v1");
  const summary = detail.response_summary || {};
  openModal(
    "Registrar resposta",
    `
      <div class="modal-context">
        <strong>${escapeHtml(detail.supplier_name || "Fornecedor")}</strong>
        <span>${number(detail.item_count || detail.items?.length || 0)} item(ns) enviados. Marque o que o fornecedor confirmou; o pedido vem no próximo passo.</span>
      </div>
      <div class="quote-response-summary">
        <div><span>Respondidos</span><strong>${number(summary.responded_count || 0)}</strong></div>
        <div><span>Pendentes</span><strong>${number(summary.pending_count || 0)}</strong></div>
        <div><span>Qtd confirmada</span><strong>${number(summary.confirmed_quantity || 0)}</strong></div>
        <div><span>Prazo medio</span><strong>${summary.average_lead_time_days == null ? "-" : `${number(summary.average_lead_time_days)}d`}</strong></div>
      </div>
      <div class="table-wrap quote-items">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Referência</th>
              <th>Disponibilidade</th>
              <th class="num">Qtd confirmada</th>
              <th class="num">Prazo</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>${quoteResponseRows(detail.items || [])}</tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="quoteResponseDefaultAll">Todos disponíveis</button>
        <button class="secondary-button" type="button" id="quoteResponseCancel">Cancelar</button>
        <button class="action-button" type="button" id="quoteResponseSave">Salvar resposta</button>
      </div>
      <span class="save-state" id="quoteResponseState" aria-live="polite"></span>
    `,
    (body) => {
      const saveState = body.querySelector("#quoteResponseState");
      body.querySelector("#quoteResponseCancel").addEventListener("click", closeModal);
      body.querySelectorAll(".quote-response-product[data-product-id]").forEach((button) => {
        button.addEventListener("click", () => openProductModal(button.dataset.productId, {
          onClose: () => openQuoteResponseModal(quoteId),
        }));
      });
      body.querySelector("#quoteResponseDefaultAll").addEventListener("click", () => {
        body.querySelectorAll("[data-quote-item-id]").forEach((row) => {
          const availability = row.querySelector(".quote-response-availability");
          const confirmed = row.querySelector(".quote-response-confirmed");
          if (!availability.value) availability.value = "available";
          if (!confirmed.value.trim()) confirmed.value = confirmed.getAttribute("placeholder") || "";
        });
        saveState.textContent = "Itens marcados como disponíveis.";
      });
      body.querySelector("#quoteResponseSave").addEventListener("click", async () => {
        saveState.textContent = "Salvando resposta";
        const items = Array.from(body.querySelectorAll("[data-quote-item-id]")).map((row) => ({
          item_id: row.dataset.quoteItemId,
          supplier_reference: trimCode(row.querySelector(".quote-response-reference").value),
          availability: row.querySelector(".quote-response-availability").value,
          confirmed_quantity: row.querySelector(".quote-response-confirmed").value.trim(),
          quoted_lead_time_days: row.querySelector(".quote-response-lead").value.trim(),
          notes: row.querySelector(".quote-response-notes").value.trim(),
        }));
        try {
          await apiPost("/api/quotes/response", { id: quoteId, items });
          saveState.textContent = "Pedido aprovado";
          closeModal();
          await refreshCurrentQuoteWorkbench();
          state.purchaseOrdersFilter = "approved";
          await refreshPurchaseOrders();
        } catch (error) {
          saveState.textContent = error.message;
        }
      });
    },
    { modalClass: "quote-cycle-modal" },
  );
}

function confirmOrderRows(items = [], quoteItemsById = {}) {
  if (!items.length) {
    return `<tr><td colspan="9" class="empty-cell">Sem itens neste pedido. Use "Adicionar produto" para incluir.</td></tr>`;
  }
  return items.map((item) => {
    const quoteItem = quoteItemsById[item.quote_request_item_id] || {};
    const packageSize = Number(item.package_size || item.purchase_package_size || 1) || 1;
    const finalQuantity = Number(item.final_quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const confirmedQuantity = quoteItem.confirmed_quantity != null ? Number(quoteItem.confirmed_quantity) : null;
    const leadTime = quoteItem.quoted_lead_time_days != null ? Number(quoteItem.quoted_lead_time_days) : null;
    const offPackage = packageSize > 1 && finalQuantity > 0 && Math.abs(finalQuantity % packageSize) > 0.0001;
    const buy = (item.decision || "buy") === "buy";
    return `
      <tr data-purchase-item-id="${escapeAttr(item.id)}">
        <td>
          <label class="quote-buy-toggle">
            <input type="checkbox" class="confirm-buy" ${buy ? "checked" : ""} />
            <span>Comprar</span>
          </label>
        </td>
        <td>
          <strong class="product-name">${escapeHtml(item.product_name || "")}</strong>
          <span class="muted-line">${escapeHtml(item.quote_code || item.source_code || "")}</span>
          ${confirmedQuantity != null ? `<span class="muted-line">Fornecedor confirmou ${number(confirmedQuantity)} ${escapeHtml(item.unit || "UN")}</span>` : ""}
          ${leadTime != null ? `<span class="muted-line">Prazo informado: ${number(leadTime)}d</span>` : ""}
        </td>
        <td class="num">${number(item.suggested_quantity || item.requested_quantity || 0)}</td>
        <td><input class="inline-input compact-input confirm-qty" type="text" inputmode="decimal" value="${inputValue(finalQuantity)}" ${buy ? "" : "disabled"} /></td>
        <td><input class="inline-input compact-input confirm-package" type="text" inputmode="decimal" value="${inputValue(packageSize)}" ${buy ? "" : "disabled"} /></td>
        <td><input class="inline-input compact-input confirm-price" type="text" inputmode="decimal" value="${inputValue(unitPrice)}" ${buy ? "" : "disabled"} /></td>
        <td class="num confirm-total">${money(finalQuantity * unitPrice)}</td>
        <td class="confirm-alert">${offPackage ? `<span class="status-chip warn">Fora da embalagem</span>` : ""}</td>
        <td>
          <input class="inline-input confirm-notes" type="text" value="${inputValue(item.notes || "")}" placeholder="observação" />
          <button class="link-button confirm-remove" type="button" aria-label="Remover item">remover</button>
        </td>
      </tr>
    `;
  }).join("");
}

function updateConfirmPreview(body, minimumOrderValue = 0) {
  let itemsCount = 0;
  let units = 0;
  let total = 0;
  let offPackage = 0;
  body.querySelectorAll("[data-purchase-item-id]").forEach((row) => {
    const buy = row.querySelector(".confirm-buy").checked;
    const quantityInput = row.querySelector(".confirm-qty");
    const packageInput = row.querySelector(".confirm-package");
    const priceInput = row.querySelector(".confirm-price");
    const quantity = buy ? parseInputNumber(quantityInput.value) : 0;
    const packageSize = parseInputNumber(packageInput.value || "1") || 1;
    const unitPrice = buy ? parseInputNumber(priceInput.value) : 0;
    const rowTotal = quantity * unitPrice;
    const isOffPackage = packageSize > 1 && quantity > 0 && Math.abs(quantity % packageSize) > 0.0001;
    row.classList.toggle("muted-row", !buy);
    quantityInput.disabled = !buy;
    packageInput.disabled = !buy;
    priceInput.disabled = !buy;
    row.querySelector(".confirm-total").textContent = money(rowTotal);
    row.querySelector(".confirm-alert").innerHTML = isOffPackage ? `<span class="status-chip warn">Fora da embalagem</span>` : "";
    if (buy && quantity > 0) {
      itemsCount += 1;
      units += quantity;
      total += rowTotal;
      if (isOffPackage) offPackage += 1;
    }
  });
  const missing = Math.max(0, Number(minimumOrderValue || 0) - total);
  body.querySelector("#confirmItems").textContent = number(itemsCount);
  body.querySelector("#confirmUnits").textContent = number(units);
  body.querySelector("#confirmTotal").textContent = money(total);
  body.querySelector("#confirmMinimum").textContent = Number(minimumOrderValue || 0) <= 0
    ? "Sem mínimo"
    : missing > 0 ? `Faltam ${money(missing)}` : "Mínimo atingido";
  body.querySelector("#confirmPackageAlerts").textContent = offPackage ? `${number(offPackage)} fora da embalagem` : "Embalagens ok";
  body.querySelector(".confirm-summary").classList.toggle("warn", missing > 0 || offPackage > 0);
}

function collectConfirmPayload(body) {
  return Array.from(body.querySelectorAll("[data-purchase-item-id]")).map((row) => {
    const buy = row.querySelector(".confirm-buy").checked;
    return {
      item_id: row.dataset.purchaseItemId,
      decision: buy ? "buy" : "skip",
      final_quantity: buy ? row.querySelector(".confirm-qty").value.trim() : "0",
      package_size: row.querySelector(".confirm-package").value.trim() || "1",
      unit_price: row.querySelector(".confirm-price").value.trim(),
      notes: row.querySelector(".confirm-notes").value.trim(),
    };
  });
}

async function openConfirmPurchaseOrderModal(orderId) {
  if (!orderId) return;
  const detail = await apiContract(`/api/purchase-order?id=${encodeURIComponent(orderId)}`, "purchase_order_detail.v1");
  if (detail.status !== "pending_confirmation") {
    openModal(
      "Pedido já confirmado",
      `
        <div class="modal-context">
          <strong>${escapeHtml(detail.id)}</strong>
          <span>${escapeHtml(detail.supplier_name || "Fornecedor")} - status ${escapeHtml(purchaseOrderStatusText(detail.status))}.</span>
        </div>
        <div class="modal-actions">
          <button class="action-button" type="button" id="confirmAlreadyDone">Fechar</button>
        </div>
      `,
      (body) => body.querySelector("#confirmAlreadyDone").addEventListener("click", closeModal),
    );
    return;
  }
  const minimum = Number(detail.supplier_terms?.minimum_order_value || 0);
  const quoteResponse = detail.quote_response || {};
  const quoteItemsById = Object.fromEntries((quoteResponse.items || []).map((row) => [row.id, row]));
  const responseHint = quoteResponse.responded_at
    ? `Resposta registrada em ${escapeHtml(quoteResponse.responded_at)}.`
    : "Sem resposta registrada do fornecedor - confira quantidades antes de confirmar.";
  openModal(
    "Revisar pedido",
    `
      <div class="modal-context">
        <strong>${escapeHtml(detail.supplier_name || "Fornecedor")}</strong>
        <span>${escapeHtml(detail.id)} - ${responseHint}</span>
      </div>
      <div class="confirm-summary">
        <div><span>Itens</span><strong id="confirmItems">0</strong></div>
        <div><span>Unidades</span><strong id="confirmUnits">0</strong></div>
        <div><span>Total</span><strong id="confirmTotal">R$ 0,00</strong></div>
        <div><span>Pedido mínimo</span><strong id="confirmMinimum">-</strong></div>
        <div><span>Embalagem</span><strong id="confirmPackageAlerts">-</strong></div>
      </div>
      <div class="table-wrap quote-items">
        <table>
          <thead>
            <tr>
              <th>Comprar</th>
              <th>Produto</th>
              <th class="num">Sug.</th>
              <th class="num">Qtd final</th>
              <th class="num">Emb.</th>
              <th class="num">Custo est.</th>
              <th class="num">Total</th>
              <th>Alerta</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody id="confirmRows">${confirmOrderRows(detail.items || [], quoteItemsById)}</tbody>
        </table>
      </div>
      <label class="modal-field">
        <span>Observação do pedido</span>
        <textarea class="inline-input quick-note" id="confirmNotes" rows="3" placeholder="condição, combinados, exceções de mínimo...">${escapeHtml(detail.notes || "")}</textarea>
      </label>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="confirmDiscard">Descartar pedido</button>
        <button class="action-button" type="button" id="confirmApply">Confirmar pedido</button>
      </div>
      <span class="save-state" id="confirmState" aria-live="polite"></span>
    `,
    (body) => {
      const stateEl = body.querySelector("#confirmState");
      const refreshPreview = () => updateConfirmPreview(body, minimum);
      const wireRows = () => {
        body.querySelectorAll("#confirmRows input, #confirmRows select").forEach((input) => {
          input.addEventListener("input", refreshPreview);
          input.addEventListener("change", refreshPreview);
        });
        body.querySelectorAll(".confirm-remove").forEach((btn) => {
          btn.addEventListener("click", () => {
            btn.closest("tr").remove();
            refreshPreview();
          });
        });
      };
      wireRows();
      refreshPreview();

      body.querySelector("#confirmApply").addEventListener("click", async () => {
        stateEl.textContent = "Confirmando pedido";
        try {
          await apiPost("/api/purchase-orders/confirm", {
            id: orderId,
            items: collectConfirmPayload(body),
            notes: body.querySelector("#confirmNotes").value.trim(),
          });
          stateEl.textContent = "Pedido confirmado.";
          closeModal();
          state.purchaseOrdersFilter = "approved";
          await refreshPurchaseOrders();
          renderPurchaseOrders(state.purchaseOrders);
        } catch (error) {
          stateEl.textContent = error.message;
        }
      });

      body.querySelector("#confirmDiscard").addEventListener("click", async () => {
        if (!window.confirm("Descartar este pedido em revisão? Os itens serão removidos.")) return;
        stateEl.textContent = "Descartando pedido";
        try {
          await apiPost("/api/purchase-orders/discard", { id: orderId });
          stateEl.textContent = "Pedido descartado.";
          closeModal();
          await refreshPurchaseOrders();
        } catch (error) {
          stateEl.textContent = error.message;
        }
      });
    },
    { modalClass: "quote-cycle-modal" },
  );
}

async function generatePurchaseOrderFromQuote(quoteId = "", sourceEl = null) {
  const quote = quoteId || quoteRequestFromWorkbench(["responded"])?.id || "";
  const status = document.querySelector("#quoteWorkbenchStatus") || document.querySelector("#quoteFinal .quote-final-note");
  if (!quote) {
    if (status) status.textContent = "Registre a resposta do fornecedor antes de gerar o pedido.";
    return;
  }
  if (sourceEl) sourceEl.disabled = true;
  if (status) status.textContent = "Gerando pedido para revisão";
  try {
    const order = await apiPost("/api/quotes/generate-order", { id: quote });
    await refreshCurrentQuoteWorkbench();
    await refreshPurchaseOrders();
    if (order?.id) {
      state.purchaseOrdersFilter = "pending";
      renderPurchaseOrders(state.purchaseOrders);
      openConfirmPurchaseOrderModal(order.id);
    }
  } catch (error) {
    if (status) status.textContent = error.message || "Não foi possível gerar o pedido.";
  } finally {
    if (sourceEl) sourceEl.disabled = false;
  }
}

function runQuoteCommand(command, sourceEl = null) {
  if (!command) return;
  if (command === "supplier") {
    setQuoteStep("supplier");
    return;
  }
  if (command === "arrival") {
    const order = (state.purchaseOrders || []).find((row) => ["approved", "sent", "partial_received"].includes(row.status));
    if (order?.id) openReceivePurchaseOrderModal(order.id);
    return;
  }
  if (command === "confirm") {
    const responded = quoteRequestFromWorkbench(["responded"]);
    const pending = (state.purchaseOrders || []).find((row) => (
      row.status === "pending_confirmation"
      && (!responded?.id || row.quote_request_id === responded.id)
      && (!state.selectedQuoteSupplierId || row.supplier_id === state.selectedQuoteSupplierId)
    )) || (state.purchaseOrders || []).find((row) => row.status === "pending_confirmation");
    if (pending?.id) {
      openConfirmPurchaseOrderModal(pending.id);
    } else if (responded?.id) {
      generatePurchaseOrderFromQuote(responded.id, sourceEl);
    }
    return;
  }
  if (command === "restore") {
    setQuoteStep("assembly");
    restoreSuggestedQuoteItems();
    return;
  }
  if (command === "alerts") {
    setQuoteStep("assembly");
    filterWorkbenchRows("alerts");
    return;
  }
  if (command === "included") {
    setQuoteStep("assembly");
    filterWorkbenchRows("included");
    return;
  }
  if (command === "suggested") {
    setQuoteStep("assembly");
    filterWorkbenchRows("suggested");
    return;
  }
  if (command === "package") {
    setQuoteStep("assembly");
    filterWorkbenchRows("package");
    return;
  }
  if (command === "formation") {
    setQuoteStep("assembly");
    filterWorkbenchRows("formation");
    return;
  }
  if (command === "quote") {
    setQuoteStep("review");
    return;
  }
  if (command === "discard") {
    discardQuote(state.quoteWorkbench?.current_quote, state.selectedQuoteSupplierId, null, sourceEl);
    return;
  }
  if (command === "send") markCurrentQuoteSent(null, sourceEl);
  if (command === "response") openQuoteResponseModal();
}


function copyQuoteText() {
  const status = document.querySelector("#quoteFinal .quote-final-note") || document.querySelector("#quoteWorkbenchStatus");
  const supplier = state.quoteWorkbench?.supplier || {};
  const items = quoteSelectedTotals().items;
  if (!items.length) {
    if (status) status.textContent = "Inclua itens antes de copiar.";
    return;
  }
  const lines = [
    `Cotação - ${supplier.name || "Fornecedor"}`,
    "",
    ...items.map((row) => {
      const ref = trimCode(row.supplier_reference || "");
      const qty = Number(row.quote_quantity || 0);
      const pkg = Number(row.package_size || 0);
      const qtyText = pkg > 1
        ? `${number(Math.ceil(qty / pkg))} CX (${number(qty)} UN)`
        : `${number(qty)} ${row.unit || "UN"}`;
      return `${ref ? `${ref} - ` : ""}${row.name} - ${qtyText}`;
    }),
  ];
  const text = lines.join("\n");
  const done = () => { if (status) status.textContent = "Mensagem copiada para enviar ao fornecedor."; };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {
      window.prompt("Copie a mensagem da cotação", text);
      done();
    });
  } else {
    window.prompt("Copie a mensagem da cotação", text);
    done();
  }
}

function quotePdfFilename(disposition, fallback = "cotação.pdf") {
  const match = String(disposition || "").match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
}

async function exportCurrentQuotePdf() {
  const status = document.querySelector("#quoteFinal .quote-final-note") || document.querySelector("#quoteWorkbenchStatus");
  const quoteId = state.quoteWorkbench?.current_quote?.id;
  if (!quoteId) {
    if (status) status.textContent = "Gere a cotação antes de exportar.";
    return;
  }
  if (status) status.textContent = "Gerando PDF";
  try {
    const response = await fetch(`/api/quote/pdf?id=${encodeURIComponent(quoteId)}&_=${Date.now()}`, { credentials: "same-origin" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Não foi possível gerar o PDF.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = quotePdfFilename(response.headers.get("Content-Disposition"));
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (status) status.textContent = "PDF baixado.";
  } catch (error) {
    if (status) status.textContent = error.message || "Falha ao gerar PDF.";
  }
}
