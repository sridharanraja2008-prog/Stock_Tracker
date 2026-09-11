const API_BASE_URL = import.meta.env.VITE_API_URL || "https://stock-tracker-yiny.onrender.com";
let current = null;
let chart   = null;

// ── Helpers ───────────────────────────────────────────
async function api(path, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API + path, opts);
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || "Error"); return null; }
    return res.json();
  } catch { alert("Cannot connect to backend!"); return null; }
}

function load(on, msg = "Loading...") {
  document.getElementById("loader").style.display = on ? "flex" : "none";
  document.getElementById("ltxt").textContent = msg;
}

// ── Add ───────────────────────────────────────────────
async function addStock() {
  const sym = document.getElementById("sym").value.trim().toUpperCase();
  if (!sym) return alert("Enter a symbol");
  load(true, "Adding " + sym + "...");
  const res = await api("/add", "POST", { symbol: sym });
  load(false);
  if (!res) return;
  document.getElementById("sym").value = "";
  await loadSidebar();
  showStock(res);
}

document.getElementById("sym").addEventListener("keydown", e => {
  if (e.key === "Enter") addStock();
});

// ── Sidebar ───────────────────────────────────────────
async function loadSidebar() {
  const stocks = await api("/stocks");
  if (!stocks) return;
  const el = document.getElementById("sb-list");
  el.innerHTML = stocks.length === 0
    ? `<div style="padding:14px;font-size:0.78rem;color:#aaa;text-align:center">None yet</div>`
    : stocks.map(s => `
        <div class="sb-item ${s.symbol === current ? 'active' : ''}" onclick="select('${s.symbol}')">
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
}

// ── Show stock ────────────────────────────────────────
function showStock(data) {
  current = data.symbol;
  document.getElementById("empty").style.display  = "none";
  document.getElementById("panel").style.display  = "block";
  document.getElementById("p-sym").textContent    = data.symbol;
  document.getElementById("p-name").textContent   = data.name;

  const prices = data.prices;
  const latest = prices[prices.length - 1];
  const prev   = prices[prices.length - 2] || latest;
  const chg    = +(latest.close - prev.close).toFixed(2);
  const chgPct = +((chg / prev.close) * 100).toFixed(2);
  const up     = chg >= 0;

  document.getElementById("p-price").textContent = latest.close.toLocaleString();
  const chgEl = document.getElementById("p-chg");
  chgEl.textContent = `${up ? "▲" : "▼"} ${Math.abs(chg)} (${Math.abs(chgPct)}%)`;
  chgEl.className   = "c-chg " + (up ? "up" : "down");

  drawChart(prices);
  drawTable(prices);
  loadSidebar();
}

// ── Chart ─────────────────────────────────────────────
function drawChart(prices) {
  const up    = prices[prices.length-1].close >= prices[0].close;
  const color = up ? "#16a34a" : "#dc2626";
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("chart"), {
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
  document.getElementById("tbody").innerHTML = [...prices].reverse().map((p, i, arr) => {
    const prev = arr[i + 1];
    const chg  = prev ? +(p.close - prev.close).toFixed(2) : null;
    const up   = chg !== null ? chg >= 0 : true;
    return `<tr>
      <td><b>${p.date}</b></td>
      <td>${p.open}</td>
      <td class="up">${p.high}</td>
      <td class="down">${p.low}</td>
      <td><b>${p.close}</b></td>
      <td style="color:#aaa">${(p.volume/1e6).toFixed(1)}M</td>
    </tr>`;
  }).join("");
}

// ── Refresh ───────────────────────────────────────────
async function refresh() {
  if (!current) return;
  load(true, "Refreshing...");
  const data = await api("/refresh/" + current);
  load(false);
  if (!data) return;
  const stock = await api("/stocks/" + current);
  if (stock) showStock(stock);
}

// ── Remove ────────────────────────────────────────────
async function remove() {
  if (!current || !confirm("Remove " + current + "?")) return;
  await api("/stocks/" + current, "DELETE");
  current = null;
  document.getElementById("panel").style.display = "none";
  document.getElementById("empty").style.display = "flex";
  loadSidebar();
}

// ── Init ──────────────────────────────────────────────
loadSidebar();