function disposeChartInstance(instance) {
  if (!instance) return;
  if (typeof instance.dispose === "function") instance.dispose();
  else if (typeof instance.destroy === "function") instance.destroy();
}

function chartTextColor() {
  return "#526159";
}

function renderEChart(targetId, option) {
  const target = document.querySelector(targetId);
  if (!target || !window.echarts) return null;
  const canvasId = `${targetId.replace("#", "")}Echart`;
  target.innerHTML = `<div id="${canvasId}" class="echart-surface" role="img"></div>`;
  disposeChartInstance(state.generalCharts[targetId]);
  const chart = echarts.init(document.querySelector(`#${canvasId}`), null, { renderer: "canvas" });
  chart.setOption(option);
  state.generalCharts[targetId] = chart;
  return chart;
}

function premiumTooltip() {
  return {
    trigger: "item",
    borderWidth: 0,
    padding: 12,
    backgroundColor: "rgba(15, 31, 23, 0.92)",
    textStyle: { color: "#fff", fontFamily: "Inter, Segoe UI, Arial, sans-serif", fontSize: 12 },
    extraCssText: "border-radius:14px;box-shadow:0 18px 44px rgba(15,31,23,.22);backdrop-filter:blur(18px);",
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

function renderGeneralDoughnut(targetId, labels, values, colors, valueFormatter = money) {
  const target = document.querySelector(targetId);
  if (!target) return;
  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  if (window.echarts && total > 0) {
    const centerValue = valueFormatter === money ? compactMoney(total) : valueFormatter(total);
    renderEChart(targetId, {
      color: colors,
      tooltip: {
        ...premiumTooltip(),
        formatter: (params) => `${params.marker}${params.name}<br/><strong>${valueFormatter(params.value)}</strong>`,
      },
      legend: {
        bottom: 0,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: chartTextColor(), fontSize: 11, fontWeight: 700 },
      },
      graphic: [
        {
          type: "text",
          left: "center",
          top: "41%",
          style: { text: centerValue, fill: "#0f1f17", fontSize: 22, fontWeight: 900, textAlign: "center" },
        },
        {
          type: "text",
          left: "center",
          top: "53%",
          style: { text: "total", fill: "#647169", fontSize: 11, fontWeight: 800, textAlign: "center" },
        },
      ],
      series: [{
        type: "pie",
        radius: ["58%", "78%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: "rgba(255,255,255,.9)",
          borderWidth: 5,
          borderRadius: 8,
          shadowBlur: 18,
          shadowColor: "rgba(17,28,22,.12)",
        },
        label: { show: false },
        emphasis: { scale: true, scaleSize: 8 },
        data: labels.map((label, index) => ({ name: label, value: Number(values[index] || 0) })),
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

function renderBiBars(targetId, rows = [], valueFormatter = compactMoney) {
  const target = document.querySelector(targetId);
  if (!target) return;
  const items = rows.slice(0, 7).filter((row) => Number(row.value || 0) > 0);
  if (!items.length) {
    target.innerHTML = `<div class="bi-empty">Sem dados suficientes no recorte.</div>`;
    return;
  }
  if (window.echarts) {
    const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
    renderEChart(targetId, {
      grid: { left: 8, right: 72, top: 10, bottom: 8, containLabel: true },
      tooltip: {
        ...premiumTooltip(),
        formatter: (params) => `${params.marker}${params.name}<br/><strong>${valueFormatter(params.value)}</strong>`,
      },
      xAxis: {
        type: "value",
        max,
        splitLine: { lineStyle: { color: "rgba(100,113,105,.12)" } },
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
          color: "#26382e",
          fontSize: 11,
          fontWeight: 800,
          width: 118,
          overflow: "truncate",
        },
      },
      series: [
        {
          type: "bar",
          data: items.map(() => max),
          barWidth: 16,
          silent: true,
          itemStyle: { color: "rgba(15,31,23,.06)", borderRadius: 999 },
          barGap: "-100%",
        },
        {
          type: "bar",
          data: items.map((item, index) => ({
            value: Number(item.value || 0),
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: ["#1fa463", "#2f7eb8", "#f59e0b", "#16a3a1"][index % 4] },
                { offset: 1, color: ["#7dd8a3", "#84c5f4", "#f9c96b", "#81e6d9"][index % 4] },
              ]),
              borderRadius: 999,
            },
          })),
          barWidth: 16,
          label: {
            show: true,
            position: "right",
            formatter: (params) => valueFormatter(params.value),
            color: "#0f1f17",
            fontSize: 11,
            fontWeight: 900,
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
    <p>${escapeHtml(detail || "Dados importados e prontos para orientar decisoes.")}</p>
  `;
}
