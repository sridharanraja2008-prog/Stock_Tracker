// ── Config ────────────────────────────────────────────
const API_BASE_URL = "https://stock-tracker-yiny.onrender.com";

let current       = null;
let chart         = null;
let autoRefreshId = null;   // ← tracks the auto-refresh timer

// ── Helpers ───────────────────────────────────────────
async function api(path, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API_BASE_URL + path, opts);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.detail || "Error");
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("API Error:", err);
    alert("Cannot connect to backend!");
    return null;
  }
}

function load(on, msg = "Loading...") {
  const loader = document.getElementById("loader");
  const ltxt   = document.getElementById("ltxt");
  if (loader) loader.style.display = on ? "flex" : "none";
  if (ltxt)   ltxt.textContent = msg;
}

// ── Add Stock ─────────────────────────────────────────
async function addStock() {
  const symInput = document.getElementById("sym");
  const sym = symInput ? symInput.value.trim().toUpperCase() : "";
  if (!sym) return alert("Enter a symbol");
  load(true, "Adding " + sym + "...");
  const res = await api("/add", "POST", { symbol: sym });
  load(false);
  if (!res) return;
  if (symInput) symInput.value = "";
  await loadSidebar();
  showStock(res);
}

const symEl = document.getElementById("sym");
if (symEl) {
  symEl.addEventListener("keydown", e => {
    if (e.key === "Enter") addStock();
  });
}

// ── Sidebar ───────────────────────────────────────────
async function loadSidebar() {
  const stocks = await api("/stocks");
  if (!stocks) return;
  const el = document.getElementById("sb-list");
  if (!el) return;
  el.innerHTML = stocks.length === 0
    ? `<div style="padding:14px;font-size:0.78rem;color:#aaa;text-align:center">None yet</div>`
    : stocks.map(s => `
        <div class="sb-item ${s.symbol === current ? 'active' : ''}"
             onclick="select('${s.symbol}')">
          <div class="sb-sym">${s.symbol}</div>
          <div class="sb-name">${s.name}</div>
        </div>`).join("");
}

// ── Select from sidebar ───────────────────────────────
async function select(symbol) {
  load(true, "Loading " + symbol + "...");
  const data = await api("/stocks/" + symbol);
  load(false);
  if (!data) return;
  showStock(data);
  startAutoRefresh(symbol);   // ← start auto refresh when user picks a stock
}

// ── Show Stock ────────────────────────────────────────
function showStock(data) {
  current = data.symbol;
  const empty = document.getElementById("empty");
  const panel = document.getElementById("panel");
  if (empty) empty.style.display = "none";
  if (panel) panel.style.display = "block";

  document.getElementById("p-sym").textContent  = data.symbol;
  document.getElementById("p-name").textContent = data.name;

  const prices = data.prices || [];
  if (prices.length === 0) return;

  const latest = prices[prices.length - 1];
  const prev   = prices[prices.length - 2] || latest;
  const chg    = +(latest.close - prev.close).toFixed(2);
  const chgPct = +((chg / prev.close) * 100).toFixed(2);
  const up     = chg >= 0;

  document.getElementById("p-price").textContent = latest.close.toLocaleString();
  const chgEl = document.getElementById("p-chg");
  chgEl.textContent = `${up ? "▲" : "▼"} ${Math.abs(chg)} (${Math.abs(chgPct)}%)`;
  chgEl.className   = "c-chg " + (up ? "up" : "down");

  // Show last updated time
  showLastUpdated();

  drawChart(prices);
  drawTable(prices);
  loadSidebar();
}

// ── Last Updated ──────────────────────────────────────
function showLastUpdated() {
  const existing = document.getElementById("last-updated");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = "last-updated";
  el.style.cssText = "font-size:0.72rem;color:#aaa;text-align:right;margin-bottom:8px;";
  el.textContent = "Last updated: " + new Date().toLocaleTimeString();
  const panel = document.getElementById("panel");
  if (panel) panel.prepend(el);
}

// ── Chart ─────────────────────────────────────────────
function drawChart(prices) {
  const canvas = document.getElementById("chart");
  if (!canvas) return;
  const up    = prices[prices.length-1].close >= prices[0].close;
  const color = up ? "#16a34a" : "#dc2626";
  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: "line",
    data: {
      labels: prices.map(p => p.date.slice(5)),
      datasets: [{
        label: "Close",
        data:            prices.map(p => p.close),
        borderColor:     color,
        backgroundColor: up ? "rgba(22,163,74,0.07)" : "rgba(220,38,38,0.07)",
        borderWidth:     2.5,
        pointRadius:     4,
        pointBackgroundColor: color,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "#f0f0f0" }, ticks: { color: "#aaa" } },
        y: { grid: { color: "#f0f0f0" }, ticks: { color: "#aaa" } }
      }
    }
  });
}

// ── Table ─────────────────────────────────────────────
function drawTable(prices) {
  const tbody = document.getElementById("tbody");
  if (!tbody) return;
  tbody.innerHTML = [...prices].reverse().map(p => `
    <tr>
      <td><b>${p.date}</b></td>
      <td>${p.open}</td>
      <td class="up">${p.high}</td>
      <td class="down">${p.low}</td>
      <td><b>${p.close}</b></td>
      <td style="color:#aaa">${(p.volume / 1e6).toFixed(1)}M</td>
    </tr>`).join("");
}

// ── Refresh ───────────────────────────────────────────
async function refresh() {
  if (!current) return;
  load(true, "Refreshing...");
  const data = await api("/refresh/" + current);
  load(false);
  if (!data) return;
  showStock(data);
}

// ── Auto Refresh every 5 minutes ─────────────────────
function startAutoRefresh(symbol) {
  if (autoRefreshId) clearInterval(autoRefreshId);
  autoRefreshId = setInterval(async () => {
    if (!current) return;
    console.log("Auto refreshing " + current + "...");
    const data = await api("/stocks/" + current);
    if (data) showStock(data);
  }, 5 * 60 * 1000); // every 5 minutes
}

// ── Remove ────────────────────────────────────────────
async function remove() {
  if (!current || !confirm("Remove " + current + "?")) return;
  await api("/stocks/" + current, "DELETE");
  current = null;
  if (autoRefreshId) clearInterval(autoRefreshId); // stop auto refresh
  const panel = document.getElementById("panel");
  const empty = document.getElementById("empty");
  if (panel) panel.style.display = "none";
  if (empty) empty.style.display = "flex";
  loadSidebar();
}

// ── Init ──────────────────────────────────────────────
loadSidebar();