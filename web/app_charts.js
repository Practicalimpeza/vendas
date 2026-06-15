function disposeChartInstance(instance) {
  if (!instance) return;
  if (typeof instance.dispose === "function") instance.dispose();
  else if (typeof instance.destroy === "function") instance.destroy();
}

function chartRegistry() {
  if (!state.chartRenderers) state.chartRenderers = {};
  if (!state.generalCharts) state.generalCharts = {};
  return state.chartRenderers;
}

function chartTargetReady(target) {
  if (!target || target.offsetParent === null) return false;
  const rect = target.getBoundingClientRect();
  return rect.width >= 40 && rect.height >= 40;
}

function chartTargetVisible(target) {
  return Boolean(target && target.offsetParent !== null);
}

function resizeChartSoon(chart) {
  if (!chart || typeof chart.resize !== "function") return;
  window.requestAnimationFrame(() => chart.resize());
  window.setTimeout(() => chart.resize(), 120);
  window.setTimeout(() => chart.resize(), 450);
}

function resizeDashboardCharts() {
  Object.values(state.generalCharts || {}).forEach(resizeChartSoon);
  resizeChartSoon(state.monthlyChart);
}

function scheduleChartRecovery() {
  if (state.chartRecoveryTimer) window.clearTimeout(state.chartRecoveryTimer);
  state.chartRecoveryTimer = window.setTimeout(() => {
    state.chartRecoveryTimer = null;
    if (!window.echarts) return;
    Object.values(chartRegistry()).forEach((render) => {
      if (typeof render === "function") render();
    });
    resizeDashboardCharts();
  }, 180);
}

function chartTextColor() {
  return "#526159";
}

const DASHBOARD_CHART_COLORS = ["#1fa463", "#2f7eb8", "#f59e0b", "#16a3a1", "#6bbf8e"];
const DASHBOARD_CHART_COLORS_LIGHT = ["#79d9a3", "#82c9f6", "#f9c96b", "#80e4dc", "#9ce0b4"];

function dashboardChartColor(index = 0) {
  return DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length];
}

function dashboardChartGradient(index = 0) {
  const start = dashboardChartColor(index);
  const end = DASHBOARD_CHART_COLORS_LIGHT[index % DASHBOARD_CHART_COLORS_LIGHT.length];
  if (!window.echarts?.graphic?.LinearGradient) return start;
  return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: start },
    { offset: 1, color: end },
  ]);
}

function chartColorAlpha(color, alpha = 0.66) {
  const hex = String(color || "").trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const value = parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function renderEChart(targetId, option) {
  chartRegistry()[targetId] = () => renderEChart(targetId, option);
  const target = document.querySelector(targetId);
  if (!target || !window.echarts) return null;
  const canvasId = `${targetId.replace("#", "")}Echart`;
  target.innerHTML = `<div id="${canvasId}" class="echart-surface" role="img"></div>`;
  if (!chartTargetReady(target)) {
    if (chartTargetVisible(target)) scheduleChartRecovery();
    return null;
  }
  disposeChartInstance(state.generalCharts[targetId]);
  const chart = echarts.init(document.querySelector(`#${canvasId}`), null, { renderer: "canvas" });
  chart.setOption(option);
  state.generalCharts[targetId] = chart;
  resizeChartSoon(chart);
  return chart;
}

function premiumTooltip() {
  return {
    trigger: "item",
    appendToBody: true,
    confine: false,
    borderWidth: 0,
    padding: 12,
    backgroundColor: "rgba(15, 31, 23, 0.92)",
    textStyle: { color: "#fff", fontFamily: "Inter, Segoe UI, Arial, sans-serif", fontSize: 12 },
    extraCssText: "z-index:9999;border-radius:14px;box-shadow:0 18px 44px rgba(15,31,23,.22);backdrop-filter:blur(18px);pointer-events:none;",
  };
}

function dashboardChartRows(items, options = {}) {
  const valueKey = options.valueKey || "value";
  const valueFormatter = options.valueFormatter || number;
  const rowClass = options.rowClass || "dashboard-chart-row";
  const labelFor = options.labelFor || ((item) => item.label || item.name || "");
  const attrsFor = options.attrsFor || (() => "");
  const max = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);
  return items.map((item) => {
    const width = Math.max(3, Math.min(100, (Number(item[valueKey] || 0) / max) * 100));
    return `
      <button class="${escapeAttr(rowClass)}" type="button"${attrsFor(item)}>
        <span>${escapeHtml(labelFor(item))}</span>
        <strong>${valueFormatter(item[valueKey] || 0)}</strong>
        <i style="width: ${width}%"></i>
      </button>
    `;
  }).join("");
}

function doughnutCenterValueLines(value, compact) {
  const text = String(value || "");
  const compactMoneyMatch = text.match(/^(R\$)\s+(.+)\s+(mi|mil)$/);
  if (compact && compactMoneyMatch) return [`${compactMoneyMatch[1]} ${compactMoneyMatch[2]}`, compactMoneyMatch[3]];
  if (compact && text.length > 8 && text.includes(" ")) {
    const lastSpace = text.lastIndexOf(" ");
    return [text.slice(0, lastSpace), text.slice(lastSpace + 1)];
  }
  return [text];
}

function estimateTextWidth(text, fontSize) {
  return String(text || "").length * fontSize * 0.68;
}

function doughnutCenterLayout(target, compact, centerValue, centerLabel) {
  const width = target.clientWidth || target.offsetWidth || (compact ? 180 : 240);
  const height = target.clientHeight || target.offsetHeight || (compact ? 150 : 220);
  const minSide = Math.max(72, Math.min(width, height));
  const textWidth = Math.floor(minSide * (compact ? 0.54 : 0.52));
  const valueLines = doughnutCenterValueLines(centerValue, compact);
  const longestLine = valueLines.reduce((longest, line) => (
    estimateTextWidth(line, 16) > estimateTextWidth(longest, 16) ? line : longest
  ), "");
  let valueSize = compact ? 18 : 22;
  const minimumSize = compact ? 11 : 13;
  while (valueSize > minimumSize && estimateTextWidth(longestLine, valueSize) > textWidth) {
    valueSize -= 1;
  }
  const valueLineHeight = Math.max(valueSize, Math.round(valueSize * (valueLines.length > 1 ? 0.94 : 1.08)));
  const labelSize = Math.max(9, Math.min(compact ? 10 : 11, Math.floor(valueSize * 0.68)));
  const valueBlockHeight = valueLineHeight * valueLines.length;
  const gap = compact ? 1 : 3;
  const centerY = height * (compact ? 0.5 : 0.45);
  const totalHeight = valueBlockHeight + gap + labelSize;
  const centerTop = Math.max(4, Math.round(centerY - (totalHeight / 2)));
  return {
    centerValue: valueLines.join("\n"),
    centerLabel,
    centerTop,
    labelTop: centerTop + valueBlockHeight + gap,
    labelSize,
    textWidth,
    valueLineHeight,
    valueSize,
  };
}

function renderGeneralDoughnut(targetId, labels, values, colors, valueFormatter = money, options = {}) {
  const target = document.querySelector(targetId);
  if (!target) return;
  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  const compact = Boolean(options.compact);
  if (window.echarts && total > 0) {
    const centerValue = options.centerValue || (valueFormatter === money ? compactMoney(total) : valueFormatter(total));
    const centerLabel = options.centerLabel || (valueFormatter === money ? "total" : "itens");
    const centerLayout = doughnutCenterLayout(target, compact, centerValue, centerLabel);
    const showCenter = options.centerMode !== "none" && options.showCenter !== false;
    renderEChart(targetId, {
      color: colors,
      tooltip: {
        ...premiumTooltip(),
        formatter: (params) => {
          const share = total ? `${Math.round((Number(params.value || 0) / total) * 100)}%` : "0%";
          return `${params.marker}${params.name}<br/><strong>${valueFormatter(params.value)}</strong><br/><span>${share} do total</span>`;
        },
      },
      legend: {
        show: !compact,
        bottom: 0,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: chartTextColor(), fontSize: 11, fontWeight: 700 },
      },
      graphic: showCenter ? [
        {
          type: "text",
          left: "center",
          top: centerLayout.centerTop,
          style: {
            text: centerLayout.centerValue,
            fill: "#0f1f17",
            fontSize: centerLayout.valueSize,
            fontWeight: 900,
            lineHeight: centerLayout.valueLineHeight,
            textAlign: "center",
            width: centerLayout.textWidth,
          },
          silent: true,
        },
        {
          type: "text",
          left: "center",
          top: centerLayout.labelTop,
          style: {
            text: centerLayout.centerLabel,
            fill: "#647169",
            fontSize: centerLayout.labelSize,
            fontWeight: 850,
            overflow: "truncate",
            textAlign: "center",
            width: centerLayout.textWidth,
          },
          silent: true,
        },
      ] : [],
      series: [{
        type: "pie",
        radius: compact && !showCenter ? ["46%", "78%"] : compact ? ["58%", "76%"] : ["56%", "78%"],
        center: compact ? ["50%", "50%"] : ["50%", "45%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: "rgba(255,255,255,.92)",
          borderWidth: compact && !showCenter ? 3 : compact ? 4 : 5,
          borderRadius: compact && !showCenter ? 6 : 7,
          shadowBlur: compact ? 10 : 18,
          shadowColor: "rgba(17,28,22,.1)",
        },
        label: { show: false },
        emphasis: {
          scale: true,
          scaleSize: compact ? 4 : 8,
          itemStyle: { shadowBlur: 18, shadowColor: "rgba(17,28,22,.16)" },
        },
        data: labels.map((label, index) => ({
          name: label,
          value: Number(values[index] || 0),
          itemStyle: { color: colors[index % colors.length] },
        })),
      }],
    });
    return;
  }
  if (total <= 0) {
    target.innerHTML = `<div class="bi-empty">Sem volume suficiente no recorte.</div>`;
    return;
  }
  target.innerHTML = dashboardChartRows(
    labels.map((label, index) => ({ label, value: Number(values[index] || 0) })),
    { valueFormatter, rowClass: "bi-bar-row" },
  );
}

function renderBiBars(targetId, rows = [], valueFormatter = compactMoney, options = {}) {
  const target = document.querySelector(targetId);
  if (!target) return;
  const compact = Boolean(options.compact || target.classList.contains("dashboard-chart-compact"));
  const cockpit = Boolean(options.cockpit || target.closest(".retail-cockpit-board"));
  const items = rows.slice(0, options.limit || (compact ? 5 : 7)).filter((row) => Number(row.value || 0) > 0);
  if (!items.length) {
    target.innerHTML = `<div class="bi-empty">Sem dados suficientes no recorte.</div>`;
    return;
  }
  if (window.echarts) {
    const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
    const targetHeight = target.clientHeight || (cockpit ? 148 : 220);
    const desiredPlotHeight = cockpit ? Math.min(targetHeight - 18, Math.max(92, items.length * 30)) : targetHeight - 18;
    const verticalPad = Math.max(6, Math.floor((targetHeight - desiredPlotHeight) / 2));
    const labelWidth = cockpit ? 122 : compact ? 78 : 118;
    renderEChart(targetId, {
      color: DASHBOARD_CHART_COLORS,
      grid: {
        left: cockpit ? 8 : compact ? 2 : 8,
        right: cockpit ? 72 : compact ? 8 : 72,
        top: cockpit ? verticalPad : compact ? 4 : 10,
        bottom: cockpit ? verticalPad : compact ? 4 : 8,
        containLabel: true,
      },
      tooltip: {
        ...premiumTooltip(),
        formatter: (params) => `${params.marker}${params.name}<br/><strong>${valueFormatter(params.value)}</strong>`,
      },
      xAxis: {
        type: "value",
        max,
        splitLine: { show: false },
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: items.map((item) => item.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          show: cockpit || !compact,
          color: "#26382e",
          fontSize: cockpit || compact ? 10 : 11,
          fontWeight: 850,
          width: labelWidth,
          overflow: "truncate",
          margin: cockpit ? 9 : 8,
        },
      },
      series: [
        {
          type: "bar",
          data: items.map((item, index) => ({
            value: Number(item.value || 0),
            itemStyle: {
              color: dashboardChartGradient(index),
              borderRadius: 999,
            },
          })),
          barWidth: cockpit ? 12 : compact ? 10 : 16,
          barCategoryGap: cockpit ? "34%" : "28%",
          barMinHeight: 3,
          label: {
            show: cockpit || !compact,
            position: "right",
            formatter: (params) => valueFormatter(params.value),
            color: "#0f1f17",
            fontSize: cockpit ? 10 : 11,
            fontWeight: 900,
            distance: cockpit ? 7 : 8,
          },
        },
      ],
    });
    return;
  }
  target.innerHTML = dashboardChartRows(items, { valueFormatter, rowClass: "bi-bar-row" });
}

function renderBiScore(targetId, score, label, detail) {
  const target = document.querySelector(targetId);
  if (!target) return;
  const value = Math.max(0, Math.min(100, Number(score || 0)));
  target.innerHTML = `
    <div class="bi-score-ring" style="--score:${value}">
      <strong>${number(value)}%</strong>
      <span>${escapeHtml(label)}</span>
    </div>
    <p>${escapeHtml(detail || "Dados importados e prontos para orientar decisões.")}</p>
  `;
}
