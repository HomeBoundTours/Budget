/* =========================================================
   charts.js — Chart.js rendering helpers
   ========================================================= */

const CHART = {};            // live chart instances by canvas id
const PALETTE = ['#C9A24B', '#1B2A4A', '#2F7D5B', '#B23A48', '#5B7DB1',
                 '#A6743C', '#7C6BA0', '#3E8E8A', '#D08C60', '#6B6B6B', '#9AAE6B'];

function themeColors() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    grid: dark ? 'rgba(255,255,255,.08)' : 'rgba(27,42,74,.08)',
    text: dark ? '#c9d2e3' : '#2B2B2B',
    muted: dark ? '#8d97ad' : '#6B6B6B'
  };
}

function destroyChart(id) { if (CHART[id]) { CHART[id].destroy(); delete CHART[id]; } }

function baseOpts(extra = {}) {
  const c = themeColors();
  return Object.assign({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: c.text, font: { family: 'Inter', size: 12 }, usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        backgroundColor: '#1B2A4A', titleColor: '#fff', bodyColor: '#fff',
        padding: 10, cornerRadius: 8, displayColors: true,
        callbacks: { label: ctx => ' ' + (ctx.dataset.label ? ctx.dataset.label + ': ' : '') +
          '$' + Number(ctx.parsed.y ?? ctx.parsed).toLocaleString('en-US', { minimumFractionDigits: 2 }) }
      }
    }
  }, extra);
}

/* 6-month income vs spending (bars) */
function chartTrend(canvasId) {
  const months = lastNMonths(6);
  const income = months.map(m => round2(monthTotals(m.key).income));
  const spend  = months.map(m => round2(monthTotals(m.key).spend));
  const c = themeColors();
  destroyChart(canvasId);
  CHART[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Income', data: income, backgroundColor: '#2F7D5B', borderRadius: 6, maxBarThickness: 26 },
        { label: 'Spending', data: spend, backgroundColor: '#C9A24B', borderRadius: 6, maxBarThickness: 26 }
      ]
    },
    options: baseOpts({
      scales: {
        x: { grid: { display: false }, ticks: { color: c.muted } },
        y: { grid: { color: c.grid }, ticks: { color: c.muted, callback: v => '$' + v.toLocaleString() }, beginAtZero: true }
      }
    })
  });
}

/* category doughnut for a given month key */
function chartCategory(canvasId, key) {
  const totals = categoryTotals(key);
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  destroyChart(canvasId);
  const el = document.getElementById(canvasId);
  if (!entries.length) { drawEmpty(el, 'No spending yet'); return; }
  CHART[canvasId] = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{ data: entries.map(e => round2(e[1])), backgroundColor: PALETTE, borderWidth: 2,
        borderColor: getComputedStyle(document.body).getPropertyValue('--card') || '#fff' }]
    },
    options: baseOpts({
      cutout: '62%',
      plugins: Object.assign(baseOpts().plugins, {
        legend: { position: 'right', labels: { color: themeColors().text, font: { family: 'Inter', size: 11 }, usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': $' + Number(ctx.parsed).toLocaleString('en-US', { minimumFractionDigits: 2 }) } }
      })
    })
  });
}

/* account balance distribution (doughnut) */
function chartAccounts(canvasId) {
  const accts = state.accounts.map(a => ({ name: a.name, bal: Math.max(0, balance(a.id)) }));
  destroyChart(canvasId);
  const el = document.getElementById(canvasId);
  const total = accts.reduce((s, a) => s + a.bal, 0);
  if (total <= 0) { drawEmpty(el, 'No balances yet'); return; }
  CHART[canvasId] = new Chart(el, {
    type: 'doughnut',
    data: { labels: accts.map(a => a.name),
      datasets: [{ data: accts.map(a => round2(a.bal)), backgroundColor: PALETTE, borderWidth: 2,
        borderColor: getComputedStyle(document.body).getPropertyValue('--card') || '#fff' }] },
    options: baseOpts({ cutout: '62%',
      plugins: Object.assign(baseOpts().plugins, {
        legend: { position: 'right', labels: { color: themeColors().text, font: { family: 'Inter', size: 11 }, usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': $' + Number(ctx.parsed).toLocaleString('en-US', { minimumFractionDigits: 2 }) } }
      }) })
  });
}

/* cumulative daily spend this month (line) */
function chartDaily(canvasId) {
  const key = thisMonth();
  const now = new Date();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daily = Array(days).fill(0);
  state.transactions.forEach(t => {
    if (t.type === 'expense' && monthKey(t.date) === key) {
      const d = isoToDate(t.date).getDate();
      daily[d - 1] += t.amount;
    }
  });
  let run = 0; const cum = daily.map(v => round2(run += v));
  const c = themeColors();
  destroyChart(canvasId);
  CHART[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: { labels: Array.from({ length: days }, (_, i) => i + 1),
      datasets: [{ label: 'Cumulative spend', data: cum, borderColor: '#C9A24B', backgroundColor: 'rgba(201,162,75,.15)',
        fill: true, tension: .3, pointRadius: 0, borderWidth: 2.5 }] },
    options: baseOpts({
      plugins: { legend: { display: false }, tooltip: baseOpts().plugins.tooltip },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.muted, maxTicksLimit: 8 }, title: { display: true, text: 'Day of month', color: c.muted } },
        y: { grid: { color: c.grid }, ticks: { color: c.muted, callback: v => '$' + v.toLocaleString() }, beginAtZero: true }
      }
    })
  });
}

function drawEmpty(canvas, msg) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = themeColors().muted;
  ctx.font = '14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}
