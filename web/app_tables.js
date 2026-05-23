function tableCellText(row, index) {
  return (row.cells[index]?.textContent || "").replace(/\s+/g, " ").trim();
}

function tableSortValue(text) {
  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/R\$/g, "")
    .replace(/%/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const numeric = Number(normalized.replace(/[^\d.-]/g, ""));
  if (normalized && Number.isFinite(numeric) && /[\d]/.test(normalized)) return { type: "number", value: numeric };
  const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/) || text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dateMatch) {
    const dateText =
      dateMatch[1].length === 4 ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    return { type: "date", value: new Date(`${dateText}T00:00:00`).getTime() || 0 };
  }
  return { type: "text", value: text.toLocaleLowerCase("pt-BR") };
}

function tableDataRows(table) {
  return Array.from(table.tBodies[0]?.rows || []).filter((row) => row.cells.length > 1);
}

function tableToolbar(table) {
  const shell = table.closest(".table-shell");
  const toolbar = shell?.previousElementSibling;
  return toolbar?.classList?.contains("data-table-toolbar") ? toolbar : null;
}

let deferredTableEnhancementQueued = false;
let dataTableObserverStarted = false;

function scheduleIdleTask(callback) {
  if (window.requestIdleCallback) {
    window.requestIdleCallback(callback, { timeout: 1200 });
    return;
  }
  window.setTimeout(callback, 80);
}

function tableEnhancementRoot() {
  return document.querySelector(".view.active") || document;
}

function scheduleTableFilter(table) {
  if (!table || table.dataset.filterQueued === "true") return;
  table.dataset.filterQueued = "true";
  requestAnimationFrame(() => {
    table.dataset.filterQueued = "";
    applyTableFilter(table);
  });
}

function applyTableFilter(table) {
  const toolbar = tableToolbar(table);
  const input = toolbar?.querySelector("[data-table-search]");
  const column = toolbar?.querySelector("[data-table-column]");
  const count = toolbar?.querySelector("[data-table-count]");
  const term = (input?.value || "").trim().toLocaleLowerCase("pt-BR");
  const columnIndex = column ? Number(column.value) : -1;
  const rows = tableDataRows(table);
  let visible = 0;
  rows.forEach((row) => {
    const haystack = columnIndex >= 0 ? tableCellText(row, columnIndex) : row.textContent || "";
    const matches = !term || haystack.toLocaleLowerCase("pt-BR").includes(term);
    row.hidden = !matches;
    if (matches) visible += 1;
  });
  if (count) count.textContent = term ? `${number(visible)} de ${number(rows.length)} linhas` : `${number(rows.length)} linhas`;
}

function sortTableByColumn(table, columnIndex, forcedDir) {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const currentIndex = Number(table.dataset.sortIndex || -1);
  const currentDir = table.dataset.sortDir || "asc";
  const nextDir = forcedDir || (currentIndex === columnIndex && currentDir === "asc" ? "desc" : "asc");
  table.dataset.sortIndex = String(columnIndex);
  table.dataset.sortDir = nextDir;
  const toolbar = tableToolbar(table);
  const sortSelect = toolbar?.querySelector("[data-table-sort]");
  const sortDirSelect = toolbar?.querySelector("[data-table-sort-dir]");
  if (sortSelect) sortSelect.value = String(columnIndex);
  if (sortDirSelect) sortDirSelect.value = nextDir;
  Array.from(table.tHead?.rows[0]?.cells || []).forEach((cell, index) => {
    cell.dataset.sortDir = index === columnIndex ? nextDir : "";
    cell.setAttribute("aria-sort", index === columnIndex ? (nextDir === "asc" ? "ascending" : "descending") : "none");
  });
  const rows = tableDataRows(table);
  rows
    .sort((a, b) => {
      const aValue = tableSortValue(tableCellText(a, columnIndex));
      const bValue = tableSortValue(tableCellText(b, columnIndex));
      const comparison =
        aValue.type === "text" || bValue.type === "text"
          ? String(aValue.value).localeCompare(String(bValue.value), "pt-BR", { numeric: true })
          : aValue.value - bValue.value;
      return nextDir === "asc" ? comparison : -comparison;
    })
    .forEach((row) => tbody.appendChild(row));
  applyTableFilter(table);
}

function enhanceDataTables(root = document) {
  root.querySelectorAll(".table-wrap table").forEach((table) => {
    const wrap = table.closest(".table-wrap");
    const headerRow = table.tHead?.rows[0];
    const tbody = table.tBodies[0];
    if (!wrap || !headerRow || !tbody || table.dataset.enhancedTable === "true" || table.closest(".nexo-dt")) return;
    const skipToolbar = wrap.classList.contains("supplier-directory");
    table.dataset.enhancedTable = "true";
    wrap.classList.add("table-shell");
    const options = Array.from(headerRow.cells)
      .map((cell, index) => `<option value="${index}">${escapeHtml(cell.textContent.trim() || `Coluna ${index + 1}`)}</option>`)
      .join("");
    if (!skipToolbar) {
      const toolbar = document.createElement("div");
      toolbar.className = "data-table-toolbar";
      const label = wrap.closest(".panel")?.querySelector(".panel-head h2")?.textContent?.trim() || "tabela";
      toolbar.innerHTML = `
        <div class="data-table-filter">
          <input class="search data-table-search" data-table-search type="search" placeholder="Pesquisar ${escapeAttr(label.toLocaleLowerCase("pt-BR"))}" />
          <select class="search data-table-column" data-table-column aria-label="Coluna para pesquisar">
            <option value="-1">Todas as colunas</option>
            ${options}
          </select>
        </div>
        <div class="data-table-sort-tools">
          <select class="search data-table-sort" data-table-sort aria-label="Ordenar por coluna">
            <option value="">Ordenar por</option>
            ${options}
          </select>
          <select class="search data-table-sort-dir" data-table-sort-dir aria-label="Direcao da ordenação">
            <option value="asc">Crescente</option>
            <option value="desc">Decrescente</option>
          </select>
        </div>
        <span class="data-table-count" data-table-count></span>
      `;
      wrap.before(toolbar);
      toolbar.querySelector("[data-table-search]").addEventListener("input", () => scheduleTableFilter(table));
      toolbar.querySelector("[data-table-column]").addEventListener("change", () => scheduleTableFilter(table));
      toolbar.querySelector("[data-table-sort]").addEventListener("change", (event) => {
        if (event.target.value === "") return;
        const dir = toolbar.querySelector("[data-table-sort-dir]").value || "asc";
        sortTableByColumn(table, Number(event.target.value), dir);
      });
      toolbar.querySelector("[data-table-sort-dir]").addEventListener("change", (event) => {
        const sortSelect = toolbar.querySelector("[data-table-sort]");
        const selected = sortSelect.value || table.dataset.sortIndex || "0";
        sortTableByColumn(table, Number(selected), event.target.value || "asc");
      });
    }
    Array.from(headerRow.cells).forEach((cell, index) => {
      cell.classList.add("sortable-th");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-sort", "none");
      cell.addEventListener("click", () => sortTableByColumn(table, index));
      cell.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          sortTableByColumn(table, index);
        }
      });
    });
    new MutationObserver(() => scheduleTableFilter(table)).observe(tbody, { childList: true });
    applyTableFilter(table);
  });
}

function enhanceActiveDataTables() {
  enhanceDataTables(tableEnhancementRoot());
}

function scheduleDeferredDataTables() {
  deferredTableEnhancementQueued = false;
}

function observeDataTables() {
  if (dataTableObserverStarted) return;
  dataTableObserverStarted = true;
  enhanceActiveDataTables();
  scheduleDeferredDataTables();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhanceActiveDataTables();
      scheduleDeferredDataTables();
    });
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("nexo:viewchange", () => {
    enhanceActiveDataTables();
    scheduleDeferredDataTables();
  });
}
