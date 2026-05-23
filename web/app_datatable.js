/*
 * Nexo DataTable — motor de tabela orientado a dados (v2).
 *
 * Interação principal: cada cabeçalho de coluna tem um menu próprio
 * (ordenar + filtrar aquela coluna), no estilo de planilha. A toolbar
 * traz busca global, um painel de "Visão geral" (resumo da seleção,
 * segmentos rápidos, visões salvas, filtros ativos) e o gerenciador de
 * colunas (mostrar/ocultar, reordenar por arraste e densidade).
 *
 *   const table = createDataTable("#mount", {
 *     key, columns, rows, rowKey, rowAttrs, onRowClick,
 *     searchPlaceholder, emptyTitle, emptyHint, initialSort,
 *     toolbarExtra, onToolbar,
 *     summary: (rows) => [{ label, value, tone }],
 *     segments: [{ id, label, hint, filters, sort, search }],
 *     presets:  [{ id, name, hint, columns: [ids], sort, filters, density }],
 *   });
 */

const DT_WINDOW = 160;
const DT_CHUNK = 280;
const DT_STORAGE_PREFIX = "nexo:dt:";
const DT_NUMERIC_TYPES = new Set(["number", "int", "money", "percent"]);

function dtNormalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dtToNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(/[^\d,.-]/g, "");
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function dtToTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const text = String(value).trim();
  const onlyDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = new Date(onlyDate ? `${text}T00:00:00` : text.replace(" ", "T"));
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

function dtDefaultRender(col, value) {
  if (value === null || value === undefined || value === "") {
    return col.emptyText !== undefined ? escapeHtml(col.emptyText) : "—";
  }
  switch (col.type) {
    case "money":
      return escapeHtml(money(value));
    case "percent":
      return `${escapeHtml(number(value))}%`;
    case "number":
    case "int":
      return escapeHtml(number(value));
    case "date":
      return escapeHtml(shortDate(value));
    case "bool":
      return value ? "Sim" : "Não";
    default:
      return escapeHtml(String(value));
  }
}

function dtColumnText(col, row, value) {
  if (typeof col.text === "function") return String(col.text(row) ?? "");
  if (value === null || value === undefined) return "";
  if (col.type === "money") return money(value);
  if (col.type === "percent") return `${number(value)}%`;
  if (col.type === "date") return shortDate(value);
  if (col.type === "bool") return value ? "Sim" : "Não";
  return String(value);
}

function dtColumnValue(col, row) {
  if (typeof col.value === "function") return col.value(row);
  return row?.[col.id];
}

function dtNormalizeColumns(columns) {
  return columns
    .filter(Boolean)
    .map((col) => {
      const type = col.type || "text";
      return {
        id: col.id,
        label: col.label ?? col.id,
        type,
        value: col.value,
        text: col.text,
        render: col.render,
        align: col.align || (DT_NUMERIC_TYPES.has(type) ? "num" : ""),
        sortable: col.sortable !== false,
        filterable: col.filter !== false && type !== "actions",
        searchable: col.searchable !== false && type !== "actions",
        optional: col.optional !== false,
        hidden: Boolean(col.hidden),
        emptyText: col.emptyText,
        unit: col.unit || "",
        tip: col.tip || "",
      };
    });
}

function createDataTable(mount, config) {
  const container = typeof mount === "string" ? document.querySelector(mount) : mount;
  if (!container) throw new Error("createDataTable: mount não encontrado");

  const columns = dtNormalizeColumns(config.columns || []);
  const columnById = new Map(columns.map((col) => [col.id, col]));
  const key = config.key || container.id || "table";
  const storageKey = `${DT_STORAGE_PREFIX}${key}`;
  const viewsKey = `${storageKey}::views`;
  const rowKey = config.rowKey || ((row) => row.id);
  const presets = config.presets || [];
  const segments = config.segments || [];

  const view = loadViewState();
  let records = [];
  let filtered = [];
  let renderToken = 0;
  let openMenu = null;

  container.classList.add("nexo-dt");
  container.dataset.dtKey = key;
  container.innerHTML = shellHtml();

  const els = {
    search: container.querySelector("[data-dt-search]"),
    chips: container.querySelector("[data-dt-chips]"),
    count: container.querySelector("[data-dt-count]"),
    tbody: container.querySelector("tbody"),
    theadRow: container.querySelector("thead tr"),
    scroll: container.querySelector(".nexo-dt-scroll"),
    table: container.querySelector("table"),
    overviewBtn: container.querySelector("[data-dt-open='overview']"),
    columnsBtn: container.querySelector("[data-dt-open='columns']"),
    toolbarExtra: container.querySelector("[data-dt-extra]"),
  };
  els.table.dataset.enhancedTable = "true";

  bindToolbar();
  renderToolbarExtra();
  setRows(typeof config.rows === "function" ? config.rows() : config.rows || []);

  /* --------------------------------------------------------- estado/visão */

  function loadViewState() {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
    } catch (error) {
      stored = {};
    }
    const hiddenFromCols = columns.filter((col) => col.hidden).map((col) => col.id);
    const defOrder = columns.map((col) => col.id);
    return {
      q: typeof stored.q === "string" ? stored.q : "",
      sort: Array.isArray(stored.sort) ? stored.sort.filter((item) => columnById.has(item.id)) : (config.initialSort || []),
      filters: stored.filters && typeof stored.filters === "object" ? stored.filters : {},
      hidden: Array.isArray(stored.hidden) ? stored.hidden.filter((id) => columnById.has(id)) : hiddenFromCols,
      order: Array.isArray(stored.order) ? sanitizeOrder(stored.order) : defOrder,
      density: stored.density === "compact" ? "compact" : "comfortable",
    };
  }

  function sanitizeOrder(order) {
    const seen = new Set();
    const result = [];
    for (const id of order) {
      if (columnById.has(id) && !seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
    for (const col of columns) if (!seen.has(col.id)) result.push(col.id);
    return result;
  }

  function saveViewState() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ q: view.q, sort: view.sort, filters: view.filters, hidden: view.hidden, order: view.order, density: view.density }),
      );
    } catch (error) {
      /* sem persistência: segue só em memória */
    }
  }

  function loadUserViews() {
    try {
      const parsed = JSON.parse(localStorage.getItem(viewsKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveUserViews(list) {
    try {
      localStorage.setItem(viewsKey, JSON.stringify(list));
    } catch (error) {
      /* ignore */
    }
  }

  function isHidden(col) {
    return view.hidden.includes(col.id);
  }

  function orderedColumns() {
    const pos = new Map(view.order.map((id, index) => [id, index]));
    return columns
      .slice()
      .sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e9) - (pos.has(b.id) ? pos.get(b.id) : 1e9) || columns.indexOf(a) - columns.indexOf(b));
  }

  function visibleColumns() {
    return orderedColumns().filter((col) => !isHidden(col));
  }

  function shellHtml() {
    return `
      <div class="nexo-dt-toolbar">
        <div class="nexo-dt-search">
          <i data-lucide="search" aria-hidden="true"></i>
          <input data-dt-search type="search" placeholder="${escapeAttr(config.searchPlaceholder || "Buscar")}" value="${escapeAttr(view.q)}" aria-label="Buscar na tabela" />
        </div>
        <div class="nexo-dt-tools">
          <button class="nexo-dt-btn primary" type="button" data-dt-open="overview" aria-haspopup="true"><i data-lucide="layout-dashboard"></i><span>Visão geral</span></button>
          <button class="nexo-dt-btn" type="button" data-dt-open="columns" aria-haspopup="true"><i data-lucide="settings-2"></i><span>Colunas</span></button>
          <span class="nexo-dt-count" data-dt-count></span>
          <span class="nexo-dt-extra" data-dt-extra></span>
        </div>
      </div>
      <div class="nexo-dt-chips" data-dt-chips hidden></div>
      <div class="nexo-dt-scroll table-wrap">
        <table>
          <thead><tr></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    `;
  }

  function renderToolbarExtra() {
    if (!config.toolbarExtra) return;
    const extra = typeof config.toolbarExtra === "function" ? config.toolbarExtra() : config.toolbarExtra;
    if (typeof extra === "string") els.toolbarExtra.innerHTML = extra;
    else if (extra instanceof Node) els.toolbarExtra.appendChild(extra);
    if (typeof config.onToolbar === "function") config.onToolbar(els.toolbarExtra);
  }

  /* ----------------------------------------------------------------- dados */

  function buildRecords(rows) {
    return rows.map((row) => {
      const cells = {};
      const searchParts = [];
      for (const col of columns) {
        const raw = dtColumnValue(col, row);
        const text = dtColumnText(col, row, raw);
        const norm = dtNormalize(text);
        cells[col.id] = {
          raw,
          text,
          norm,
          num: DT_NUMERIC_TYPES.has(col.type) ? dtToNumber(raw) : null,
          time: col.type === "date" ? dtToTime(raw) : null,
        };
        if (col.searchable && norm) searchParts.push(norm);
      }
      return { row, key: rowKey(row), cells, search: searchParts.join("  ") };
    });
  }

  function setRows(rows) {
    records = buildRecords(Array.isArray(rows) ? rows : []);
    apply();
  }

  /* -------------------------------------------------------------- filtros */

  function activeFilters() {
    return Object.entries(view.filters).filter(([id, spec]) => columnById.has(id) && filterIsActive(spec));
  }

  function filterIsActive(spec) {
    if (!spec) return false;
    if (spec.kind === "text") return Boolean(spec.term);
    if (spec.kind === "range") return spec.min != null || spec.max != null;
    if (spec.kind === "set") return Array.isArray(spec.values) && spec.values.length > 0;
    return false;
  }

  function recordPassesFilter(record, colId, spec) {
    const cell = record.cells[colId];
    if (!cell) return true;
    if (spec.kind === "text") return cell.norm.includes(dtNormalize(spec.term));
    if (spec.kind === "range") {
      const value = columnById.get(colId).type === "date" ? cell.time : cell.num;
      if (value == null) return false;
      if (spec.min != null && value < spec.min) return false;
      if (spec.max != null && value > spec.max) return false;
      return true;
    }
    if (spec.kind === "set") return spec.values.includes(facetValue(record, colId));
    return true;
  }

  function facetValue(record, colId) {
    const cell = record.cells[colId];
    if (columnById.get(colId).type === "bool") return cell.raw ? "1" : "0";
    return cell.text || "";
  }

  function facetLabel(colId, value) {
    if (columnById.get(colId).type === "bool") return value === "1" ? "Sim" : "Não";
    return value || "(vazio)";
  }

  function recordPasses(record, filters, query) {
    if (query && !record.search.includes(query)) return false;
    for (const [id, spec] of filters) if (!recordPassesFilter(record, id, spec)) return false;
    return true;
  }

  function computeFacets(colId) {
    const filters = activeFilters().filter(([id]) => id !== colId);
    const query = dtNormalize(view.q);
    const counts = new Map();
    for (const record of records) {
      if (!recordPasses(record, filters, query)) continue;
      const value = facetValue(record, colId);
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "pt-BR"));
  }

  /* ------------------------------------------------------- aplicar/render */

  function apply() {
    const filters = activeFilters();
    const query = dtNormalize(view.q);
    filtered = records.filter((record) => recordPasses(record, filters, query));
    applySort();
    renderHead();
    renderChips();
    renderCount();
    renderBody();
    refreshIcons();
  }

  function applySort() {
    const sort = view.sort.filter((item) => columnById.has(item.id));
    if (!sort.length) return;
    filtered.sort((a, b) => {
      for (const item of sort) {
        const col = columnById.get(item.id);
        const dir = item.dir === "desc" ? -1 : 1;
        const cmp = compareCells(col, a.cells[item.id], b.cells[item.id]);
        if (cmp) return cmp * dir;
      }
      return 0;
    });
  }

  function compareCells(col, ca, cb) {
    if (DT_NUMERIC_TYPES.has(col.type) || col.type === "bool") {
      const av = col.type === "bool" ? (ca.raw ? 1 : 0) : ca.num;
      const bv = col.type === "bool" ? (cb.raw ? 1 : 0) : cb.num;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv;
    }
    if (col.type === "date") {
      const av = ca.time;
      const bv = cb.time;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv;
    }
    return ca.text.localeCompare(cb.text, "pt-BR", { numeric: true, sensitivity: "base" });
  }

  function renderHead() {
    const sortIndex = new Map(view.sort.map((item, index) => [item.id, { ...item, order: index + 1 }]));
    els.theadRow.innerHTML = visibleColumns()
      .map((col) => {
        const meta = sortIndex.get(col.id);
        const dir = meta ? meta.dir : "";
        const hasFilter = filterIsActive(view.filters[col.id]);
        const cls = ["nexo-dt-th", col.align === "num" ? "num" : "", col.sortable ? "sortable" : "", dir ? `sort-${dir}` : "", hasFilter ? "filtered" : ""]
          .filter(Boolean)
          .join(" ");
        const badge = meta && view.sort.length > 1 ? `<sup class="nexo-dt-sort-order">${meta.order}</sup>` : "";
        const aria = dir ? (dir === "asc" ? "ascending" : "descending") : "none";
        const tip = col.tip ? ` title="${escapeAttr(col.tip)}"` : "";
        const caret = col.sortable || col.filterable
          ? `<button class="nexo-dt-th-caret" type="button" data-dt-colmenu aria-label="Opções de ${escapeAttr(col.label)}"><i data-lucide="chevron-down"></i></button>`
          : "";
        return `<th class="${cls}" data-dt-col="${escapeAttr(col.id)}" aria-sort="${aria}"${tip}><span class="nexo-dt-th-label"${col.sortable ? ' data-dt-sortlabel tabindex="0"' : ""}>${escapeHtml(col.label)}${badge}</span>${caret}</th>`;
      })
      .join("");
  }

  function renderCount() {
    const total = records.length;
    const shown = filtered.length;
    els.count.textContent = shown === total ? `${number(total)} linhas` : `${number(shown)} de ${number(total)}`;
  }

  function renderChips() {
    const filters = activeFilters();
    if (!filters.length && !view.q) {
      els.chips.hidden = true;
      els.chips.innerHTML = "";
      return;
    }
    const chips = [];
    if (view.q) chips.push(`<button class="nexo-dt-chip" type="button" data-dt-clear-search><i data-lucide="search"></i>“${escapeHtml(view.q)}”<i data-lucide="x"></i></button>`);
    for (const [id, spec] of filters) {
      const col = columnById.get(id);
      chips.push(`<button class="nexo-dt-chip" type="button" data-dt-chip="${escapeAttr(id)}"><b>${escapeHtml(col.label)}:</b> ${escapeHtml(filterSummary(col, spec))}<i data-lucide="x"></i></button>`);
    }
    chips.push(`<button class="nexo-dt-chip ghost" type="button" data-dt-clear-all>Limpar tudo</button>`);
    els.chips.innerHTML = chips.join("");
    els.chips.hidden = false;
  }

  function filterSummary(col, spec) {
    if (spec.kind === "text") return `“${spec.term}”`;
    if (spec.kind === "range") {
      const fmt = (val) => (col.type === "date" ? shortDate(new Date(val)) : col.type === "money" ? money(val) : number(val));
      if (spec.min != null && spec.max != null) return `${fmt(spec.min)} – ${fmt(spec.max)}`;
      if (spec.min != null) return `≥ ${fmt(spec.min)}`;
      return `≤ ${fmt(spec.max)}`;
    }
    if (spec.kind === "set") {
      if (spec.values.length <= 2) return spec.values.map((value) => facetLabel(col.id, value)).join(", ");
      return `${spec.values.length} selecionados`;
    }
    return "";
  }

  /* --------------------------------------------------------- corpo (janela) */

  function renderBody() {
    const token = ++renderToken;
    els.tbody.innerHTML = "";
    els.table.classList.toggle("nexo-dt-compact", view.density === "compact");
    const cols = visibleColumns();
    if (!filtered.length) {
      els.tbody.innerHTML = `<tr class="nexo-dt-empty"><td colspan="${cols.length || 1}"><strong>${escapeHtml(config.emptyTitle || "Nada encontrado")}</strong><span>${escapeHtml(config.emptyHint || "Ajuste a busca ou os filtros.")}</span></td></tr>`;
      return;
    }
    const renderChunk = (start) => {
      if (token !== renderToken) return;
      const end = Math.min(start === 0 ? DT_WINDOW : start + DT_CHUNK, filtered.length);
      const fragment = document.createDocumentFragment();
      for (let i = start; i < end; i += 1) fragment.appendChild(buildRowElement(filtered[i], cols));
      els.tbody.appendChild(fragment);
      if (end < filtered.length) requestAnimationFrame(() => renderChunk(end));
      else refreshIcons();
    };
    renderChunk(0);
    refreshIcons();
  }

  function buildRowElement(record, cols) {
    const tr = document.createElement("tr");
    const attrs = typeof config.rowAttrs === "function" ? config.rowAttrs(record.row) || {} : {};
    tr.className = ["nexo-dt-row", config.onRowClick ? "clickable-row" : "", attrs.class || ""].filter(Boolean).join(" ");
    for (const [name, value] of Object.entries(attrs)) {
      if (name === "class") continue;
      tr.setAttribute(name, String(value));
    }
    tr.dataset.dtKey = record.key;
    tr.innerHTML = cols
      .map((col) => {
        const cell = record.cells[col.id];
        const html = typeof col.render === "function" ? col.render(record.row, cell.raw) : dtDefaultRender(col, cell.raw);
        return `<td class="${col.align === "num" ? "num" : ""}">${html}</td>`;
      })
      .join("");
    if (config.onRowClick) {
      tr.addEventListener("click", (event) => {
        if (event.target.closest("a, button, input, select, textarea, label, [data-dt-stop]")) return;
        config.onRowClick(record.row, event);
      });
    }
    return tr;
  }

  /* -------------------------------------------------------------- toolbar */

  function bindToolbar() {
    let searchTimer = null;
    els.search.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        view.q = els.search.value.trim();
        saveViewState();
        apply();
      }, 140);
    });

    els.theadRow.addEventListener("click", (event) => {
      const caret = event.target.closest("[data-dt-colmenu]");
      const th = event.target.closest("[data-dt-col]");
      if (!th) return;
      const col = columnById.get(th.dataset.dtCol);
      if (caret) {
        openColumnMenu(col, th);
        return;
      }
      if (event.target.closest("[data-dt-sortlabel]") && col?.sortable) toggleSort(col.id, event.shiftKey);
    });
    els.theadRow.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const label = event.target.closest("[data-dt-sortlabel]");
      const th = event.target.closest("[data-dt-col]");
      if (!label || !th) return;
      event.preventDefault();
      const col = columnById.get(th.dataset.dtCol);
      if (col?.sortable) toggleSort(col.id, event.shiftKey);
    });

    els.chips.addEventListener("click", (event) => {
      if (event.target.closest("[data-dt-clear-search]")) {
        view.q = "";
        els.search.value = "";
      } else if (event.target.closest("[data-dt-clear-all]")) {
        view.q = "";
        els.search.value = "";
        view.filters = {};
      } else {
        const chip = event.target.closest("[data-dt-chip]");
        if (chip) delete view.filters[chip.dataset.dtChip];
      }
      saveViewState();
      apply();
    });

    els.overviewBtn.addEventListener("click", () => toggleToolbarMenu("overview", els.overviewBtn));
    els.columnsBtn.addEventListener("click", () => toggleToolbarMenu("columns", els.columnsBtn));
  }

  function toggleSort(colId, additive) {
    const existing = view.sort.find((item) => item.id === colId);
    if (!additive) {
      if (existing && view.sort.length === 1) view.sort = existing.dir === "asc" ? [{ id: colId, dir: "desc" }] : [];
      else view.sort = [{ id: colId, dir: "asc" }];
    } else if (existing) {
      if (existing.dir === "asc") existing.dir = "desc";
      else view.sort = view.sort.filter((item) => item.id !== colId);
    } else {
      view.sort.push({ id: colId, dir: "asc" });
    }
    saveViewState();
    apply();
  }

  function setSort(colId, dir) {
    view.sort = dir ? [{ id: colId, dir }] : [];
    saveViewState();
    apply();
  }

  /* ----------------------------------------------------- menus flutuantes */

  function openFloating(kind, anchor, html, binder, extraClass = "") {
    closeFloating();
    const pop = document.createElement("div");
    pop.className = `nexo-dt-pop nexo-dt-floating ${extraClass}`.trim();
    pop.innerHTML = html;
    document.body.appendChild(pop);
    positionFloating(pop, anchor);
    anchor.classList.add("active");
    openMenu = { kind, pop, anchor };
    if (binder) binder(pop);
    refreshIcons();
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("keydown", onEscape, true);
      window.addEventListener("resize", closeFloating, true);
      els.scroll.addEventListener("scroll", closeFloating, true);
      window.addEventListener("scroll", closeFloating, true);
    });
  }

  function positionFloating(pop, anchor) {
    const rect = anchor.getBoundingClientRect();
    const width = pop.offsetWidth;
    const vw = document.documentElement.clientWidth;
    let left = rect.left;
    if (left + width + 8 > vw) left = Math.max(8, vw - width - 8);
    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top = `${rect.bottom + 6}px`;
    const maxH = window.innerHeight - rect.bottom - 18;
    pop.style.maxHeight = `${Math.max(220, maxH)}px`;
  }

  function closeFloating() {
    if (!openMenu) return;
    openMenu.anchor.classList.remove("active");
    openMenu.pop.remove();
    openMenu = null;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onEscape, true);
    window.removeEventListener("resize", closeFloating, true);
    els.scroll.removeEventListener("scroll", closeFloating, true);
    window.removeEventListener("scroll", closeFloating, true);
  }

  function onOutside(event) {
    if (!openMenu) return;
    if (openMenu.pop.contains(event.target) || openMenu.anchor.contains(event.target)) return;
    closeFloating();
  }

  function onEscape(event) {
    if (event.key === "Escape") closeFloating();
  }

  function reopenToolbarMenu(kind) {
    const anchor = kind === "overview" ? els.overviewBtn : els.columnsBtn;
    closeFloating();
    toggleToolbarMenu(kind, anchor);
  }

  function toggleToolbarMenu(kind, anchor) {
    if (openMenu && openMenu.kind === kind) {
      closeFloating();
      return;
    }
    if (kind === "overview") openFloating("overview", anchor, overviewHtml(), bindOverview, "nexo-dt-overview");
    else openFloating("columns", anchor, columnsHtml(), bindColumns, "nexo-dt-columns");
  }

  /* ----------------------------------------------------- menu por coluna */

  function openColumnMenu(col, th) {
    if (openMenu && openMenu.kind === "col" && openMenu.colId === col.id) {
      closeFloating();
      return;
    }
    const html = columnMenuHtml(col);
    openFloating("col", th, html, (pop) => bindColumnMenu(pop, col), "nexo-dt-colmenu-pop");
    if (openMenu) openMenu.colId = col.id;
  }

  function columnMenuHtml(col) {
    const sortEntry = view.sort.find((item) => item.id === col.id);
    const sortBlock = col.sortable
      ? `<div class="nexo-dt-menu-sort">
          <button type="button" data-dt-sort="asc" class="${sortEntry?.dir === "asc" ? "active" : ""}"><i data-lucide="arrow-up-narrow-wide"></i>Crescente</button>
          <button type="button" data-dt-sort="desc" class="${sortEntry?.dir === "desc" ? "active" : ""}"><i data-lucide="arrow-down-wide-narrow"></i>Decrescente</button>
        </div>`
      : "";
    const filterBlock = col.filterable
      ? `<div class="nexo-dt-menu-filter"><div class="nexo-dt-menu-label">Filtrar</div>${filterControlHtml(col, view.filters[col.id])}</div>`
      : "";
    const clear = filterIsActive(view.filters[col.id]) || sortEntry
      ? `<div class="nexo-dt-menu-foot"><button type="button" data-dt-col-clear class="nexo-dt-pop-clear">Limpar coluna</button></div>`
      : "";
    return `<div class="nexo-dt-menu-head">${escapeHtml(col.label)}</div>${sortBlock}${filterBlock}${clear}`;
  }

  function bindColumnMenu(pop, col) {
    pop.querySelectorAll("[data-dt-sort]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const dir = btn.dataset.dtSort;
        const current = view.sort.find((item) => item.id === col.id)?.dir;
        setSort(col.id, current === dir ? "" : dir);
        closeFloating();
      }),
    );
    bindFilterControl(pop, col, () => closeFloating());
    pop.querySelector("[data-dt-col-clear]")?.addEventListener("click", () => {
      delete view.filters[col.id];
      view.sort = view.sort.filter((item) => item.id !== col.id);
      saveViewState();
      apply();
      closeFloating();
    });
  }

  /* --------------------------------------------------- controles de filtro */

  function filterControlHtml(col, spec) {
    if (DT_NUMERIC_TYPES.has(col.type)) {
      const min = spec?.kind === "range" && spec.min != null ? spec.min : "";
      const max = spec?.kind === "range" && spec.max != null ? spec.max : "";
      return `<div class="nexo-dt-range"><input type="number" step="any" data-dt-min placeholder="mín" value="${escapeAttr(min)}"><span>–</span><input type="number" step="any" data-dt-max placeholder="máx" value="${escapeAttr(max)}"></div>`;
    }
    if (col.type === "date") {
      const min = spec?.kind === "range" && spec.min != null ? new Date(spec.min).toISOString().slice(0, 10) : "";
      const max = spec?.kind === "range" && spec.max != null ? new Date(spec.max).toISOString().slice(0, 10) : "";
      return `<div class="nexo-dt-range"><input type="date" data-dt-min value="${escapeAttr(min)}"><span>–</span><input type="date" data-dt-max value="${escapeAttr(max)}"></div>`;
    }
    if (col.type === "enum" || col.type === "bool") {
      const selected = new Set(spec?.kind === "set" ? spec.values : []);
      const facets = computeFacets(col.id);
      if (!facets.length) return `<p class="nexo-dt-pop-empty">Sem valores.</p>`;
      const search = facets.length > 8 ? `<input class="nexo-dt-facet-search" type="search" data-dt-facet-search placeholder="filtrar opções">` : "";
      const options = facets
        .map(
          (facet) => `<label class="nexo-dt-facet"><input type="checkbox" data-dt-facet value="${escapeAttr(facet.value)}"${selected.has(facet.value) ? " checked" : ""}><span>${escapeHtml(facetLabel(col.id, facet.value))}</span><b>${number(facet.count)}</b></label>`,
        )
        .join("");
      return `${search}<div class="nexo-dt-facets">${options}</div>`;
    }
    const term = spec?.kind === "text" ? spec.term : "";
    return `<input type="search" class="nexo-dt-text-filter" data-dt-text placeholder="contém…" value="${escapeAttr(term)}">`;
  }

  function bindFilterControl(scope, col, onChange) {
    const minEl = scope.querySelector("[data-dt-min]");
    const maxEl = scope.querySelector("[data-dt-max]");
    if (minEl || maxEl) {
      const parse = col.type === "date" ? (el) => dtToTime(el.value) : (el) => (el.value === "" ? null : dtToNumber(el.value));
      const commit = () => {
        const min = minEl ? parse(minEl) : null;
        const max = maxEl ? parse(maxEl) : null;
        if (min == null && max == null) delete view.filters[col.id];
        else view.filters[col.id] = { kind: "range", min, max };
        saveViewState();
        apply();
        if (onChange) onChange();
      };
      [minEl, maxEl].filter(Boolean).forEach((el) => el.addEventListener("change", commit));
    }
    const textEl = scope.querySelector("[data-dt-text]");
    if (textEl) {
      let timer = null;
      textEl.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (textEl.value.trim()) view.filters[col.id] = { kind: "text", term: textEl.value.trim() };
          else delete view.filters[col.id];
          saveViewState();
          apply();
        }, 160);
      });
    }
    scope.querySelectorAll("[data-dt-facet]").forEach((box) =>
      box.addEventListener("change", () => {
        const values = Array.from(scope.querySelectorAll("[data-dt-facet]:checked")).map((el) => el.value);
        if (values.length) view.filters[col.id] = { kind: "set", values };
        else delete view.filters[col.id];
        saveViewState();
        apply();
      }),
    );
    const facetSearch = scope.querySelector("[data-dt-facet-search]");
    if (facetSearch) {
      facetSearch.addEventListener("input", () => {
        const term = dtNormalize(facetSearch.value);
        scope.querySelectorAll(".nexo-dt-facet").forEach((label) => {
          label.style.display = !term || dtNormalize(label.textContent).includes(term) ? "" : "none";
        });
      });
    }
  }

  /* ----------------------------------------------------- painel "Colunas" */

  function columnsHtml() {
    const items = orderedColumns()
      .map((col) => {
        const checked = !isHidden(col);
        const lock = !col.optional ? " disabled" : "";
        return `<li class="nexo-dt-colbox" draggable="true" data-dt-col-id="${escapeAttr(col.id)}">
          <span class="nexo-dt-drag" aria-hidden="true"><i data-lucide="grip-vertical"></i></span>
          <label><input type="checkbox" data-dt-colbox value="${escapeAttr(col.id)}"${checked ? " checked" : ""}${lock}><span>${escapeHtml(col.label)}</span></label>
        </li>`;
      })
      .join("");
    return `
      <div class="nexo-dt-pop-head">Colunas e densidade</div>
      <div class="nexo-dt-pop-body">
        <div class="nexo-dt-density">
          <button type="button" class="${view.density === "comfortable" ? "active" : ""}" data-dt-density="comfortable">Conforto</button>
          <button type="button" class="${view.density === "compact" ? "active" : ""}" data-dt-density="compact">Compacta</button>
        </div>
        <p class="nexo-dt-hint">Arraste para reordenar. Marque para mostrar.</p>
        <ul class="nexo-dt-colboxes">${items}</ul>
      </div>
      <div class="nexo-dt-pop-foot"><button class="nexo-dt-pop-clear" type="button" data-dt-cols-reset>Restaurar padrão</button></div>
    `;
  }

  function bindColumns(pop) {
    pop.querySelectorAll("[data-dt-colbox]").forEach((box) =>
      box.addEventListener("change", () => {
        const id = box.value;
        if (box.checked) view.hidden = view.hidden.filter((item) => item !== id);
        else if (!view.hidden.includes(id)) view.hidden = [...view.hidden, id];
        saveViewState();
        apply();
      }),
    );
    pop.querySelectorAll("[data-dt-density]").forEach((btn) =>
      btn.addEventListener("click", () => {
        view.density = btn.dataset.dtDensity;
        saveViewState();
        pop.querySelectorAll("[data-dt-density]").forEach((other) => other.classList.toggle("active", other === btn));
        els.table.classList.toggle("nexo-dt-compact", view.density === "compact");
      }),
    );
    pop.querySelector("[data-dt-cols-reset]")?.addEventListener("click", () => {
      view.hidden = columns.filter((col) => col.hidden).map((col) => col.id);
      view.order = columns.map((col) => col.id);
      saveViewState();
      apply();
      reopenToolbarMenu("columns");
    });
    bindColumnDrag(pop);
  }

  function bindColumnDrag(pop) {
    const list = pop.querySelector(".nexo-dt-colboxes");
    if (!list) return;
    let dragged = null;
    list.querySelectorAll("[data-dt-col-id]").forEach((item) => {
      item.addEventListener("dragstart", () => {
        dragged = item;
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        dragged = null;
        view.order = Array.from(list.querySelectorAll("[data-dt-col-id]")).map((el) => el.dataset.dtColId);
        saveViewState();
        apply();
      });
      item.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (!dragged || dragged === item) return;
        const rect = item.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        list.insertBefore(dragged, after ? item.nextSibling : item);
      });
    });
  }

  /* ------------------------------------------------ painel "Visão geral" */

  function overviewHtml() {
    const sections = [];
    const stats = typeof config.summary === "function" ? config.summary(filtered.map((r) => r.row)) : [];
    if (stats.length) {
      sections.push(`<div class="nexo-dt-ov-section"><div class="nexo-dt-ov-title">Resumo da seleção</div><div class="nexo-dt-ov-stats">${stats
        .map((s) => `<div class="nexo-dt-stat ${escapeAttr(s.tone || "")}"><span>${escapeHtml(s.label)}</span><strong>${escapeHtml(String(s.value))}</strong></div>`)
        .join("")}</div></div>`);
    }
    if (segments.length) {
      sections.push(`<div class="nexo-dt-ov-section"><div class="nexo-dt-ov-title">Segmentos rápidos</div><div class="nexo-dt-ov-segments">${segments
        .map((seg) => `<button type="button" class="nexo-dt-seg" data-dt-seg="${escapeAttr(seg.id)}" title="${escapeAttr(seg.hint || "")}">${escapeHtml(seg.label)}</button>`)
        .join("")}</div></div>`);
    }
    const userViews = loadUserViews();
    const presetItems = presets
      .map((p) => `<button type="button" class="nexo-dt-viewitem" data-dt-preset="${escapeAttr(p.id)}"><span>${escapeHtml(p.name)}</span>${p.hint ? `<em>${escapeHtml(p.hint)}</em>` : ""}</button>`)
      .join("");
    const userItems = userViews
      .map((v) => `<div class="nexo-dt-viewitem user"><button type="button" class="nexo-dt-viewapply" data-dt-userview="${escapeAttr(v.id)}"><span>${escapeHtml(v.name)}</span></button><button type="button" class="nexo-dt-viewdel" data-dt-userview-del="${escapeAttr(v.id)}" aria-label="Excluir">✕</button></div>`)
      .join("");
    sections.push(`<div class="nexo-dt-ov-section"><div class="nexo-dt-ov-title">Visões salvas</div>
      <div class="nexo-dt-views">${presetItems}${userItems || ""}</div>
      <div class="nexo-dt-saveview"><input type="text" data-dt-view-name placeholder="Nome da visão atual"><button type="button" data-dt-view-save class="nexo-dt-btn small">Salvar</button></div>
    </div>`);
    const filters = activeFilters();
    if (filters.length || view.q) {
      const chips = [];
      if (view.q) chips.push(`<span class="nexo-dt-chip static">busca: “${escapeHtml(view.q)}”</span>`);
      for (const [id, spec] of filters) chips.push(`<span class="nexo-dt-chip static"><b>${escapeHtml(columnById.get(id).label)}:</b> ${escapeHtml(filterSummary(columnById.get(id), spec))}</span>`);
      sections.push(`<div class="nexo-dt-ov-section"><div class="nexo-dt-ov-title">Filtros ativos</div><div class="nexo-dt-ov-chips">${chips.join("")}</div><button type="button" class="nexo-dt-pop-clear" data-dt-ov-clear>Limpar filtros e busca</button></div>`);
    }
    return `<div class="nexo-dt-pop-head">Visão geral</div><div class="nexo-dt-pop-body">${sections.join("")}</div>`;
  }

  function bindOverview(pop) {
    pop.querySelectorAll("[data-dt-seg]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const seg = segments.find((s) => s.id === btn.dataset.dtSeg);
        if (seg) applyView({ filters: seg.filters || {}, sort: seg.sort, q: seg.search });
        closeFloating();
      }),
    );
    pop.querySelectorAll("[data-dt-preset]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const preset = presets.find((p) => p.id === btn.dataset.dtPreset);
        if (preset) applyPreset(preset);
        closeFloating();
      }),
    );
    pop.querySelectorAll("[data-dt-userview]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const v = loadUserViews().find((item) => item.id === btn.dataset.dtUserview);
        if (v) applyView(v.state);
        closeFloating();
      }),
    );
    pop.querySelectorAll("[data-dt-userview-del]").forEach((btn) =>
      btn.addEventListener("click", () => {
        saveUserViews(loadUserViews().filter((item) => item.id !== btn.dataset.dtUserviewDel));
        reopenToolbarMenu("overview");
      }),
    );
    const nameEl = pop.querySelector("[data-dt-view-name]");
    pop.querySelector("[data-dt-view-save]")?.addEventListener("click", () => {
      const name = (nameEl?.value || "").trim();
      if (!name) {
        nameEl?.focus();
        return;
      }
      const list = loadUserViews();
      list.push({ id: `v${Date.now()}`, name, state: { hidden: [...view.hidden], order: [...view.order], sort: JSON.parse(JSON.stringify(view.sort)), filters: JSON.parse(JSON.stringify(view.filters)), density: view.density } });
      saveUserViews(list);
      reopenToolbarMenu("overview");
    });
    pop.querySelector("[data-dt-ov-clear]")?.addEventListener("click", () => {
      view.q = "";
      els.search.value = "";
      view.filters = {};
      saveViewState();
      apply();
      closeFloating();
    });
  }

  /* ------------------------------------------------------------- visões */

  function applyView(partial) {
    if (!partial) return;
    if ("hidden" in partial) view.hidden = (partial.hidden || []).filter((id) => columnById.has(id));
    if ("order" in partial) view.order = sanitizeOrder(partial.order || []);
    if ("sort" in partial) view.sort = (partial.sort || []).filter((item) => columnById.has(item.id));
    if ("filters" in partial) view.filters = JSON.parse(JSON.stringify(partial.filters || {}));
    if ("density" in partial && partial.density) view.density = partial.density;
    if ("q" in partial) {
      view.q = partial.q || "";
      els.search.value = view.q;
    }
    saveViewState();
    apply();
  }

  function applyPreset(preset) {
    const partial = { sort: preset.sort, filters: preset.filters, density: preset.density };
    if (Array.isArray(preset.columns) && preset.columns.length) {
      const visible = preset.columns.filter((id) => columnById.has(id));
      partial.order = [...visible, ...columns.map((c) => c.id).filter((id) => !visible.includes(id))];
      partial.hidden = columns.map((c) => c.id).filter((id) => !visible.includes(id));
    }
    applyView(partial);
  }

  function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 2.1 } });
  }

  /* --------------------------------------------------------------- público */

  function setFilter(colId, spec) {
    if (!columnById.has(colId)) return;
    if (spec && filterIsActive(spec)) view.filters[colId] = spec;
    else delete view.filters[colId];
    saveViewState();
    apply();
  }

  function clearFilters() {
    view.filters = {};
    view.q = "";
    if (els.search) els.search.value = "";
    saveViewState();
    apply();
  }

  function setSearch(term) {
    view.q = String(term || "").trim();
    if (els.search) els.search.value = view.q;
    saveViewState();
    apply();
  }

  return {
    setRows,
    refresh: apply,
    setFilter,
    clearFilters,
    setSearch,
    applyView,
    getRows: () => filtered.map((record) => record.row),
    getState: () => ({ ...view }),
    destroy: () => {
      closeFloating();
      container.innerHTML = "";
      container.classList.remove("nexo-dt");
    },
    element: container,
  };
}

window.createDataTable = createDataTable;
