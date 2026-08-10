/* Digital Sales Book
   Shared Supabase inventory + sales.
   UI/design preserved. Adjustments:
   - Record Sale is sales-rep only.
   - Inventory is shared between admin and reps.
   - Sales are shared with admin reports.
   - Stock is decremented centrally when a sale is recorded.
   - Payment method is required on every sale.
*/

const $ = (selector) => document.querySelector(selector);
const app = $("#app");

const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_ANON_KEY";

let supabaseClient = null;
let me = null;
let inventory = [];
let sales = [];

function money(n) {
  return "₦" + Number(n || 0).toLocaleString("en-NG");
}
function today() { return new Date().toISOString().slice(0, 10); }
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

(function loadSupabase() {
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  s.onload = async () => {
    if (window.supabase && SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
        SUPABASE_PUBLISHABLE_KEY !== "YOUR_SUPABASE_ANON_KEY") {
      supabaseClient = window.supabase.createClient(
        SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
      );
      await init();
    } else {
      login();
    }
  };
  s.onerror = () => login();
  document.head.appendChild(s);
})();

async function init() {
  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    if (sessionData?.session) {
      await loadProfile(sessionData.session.user.id);
    } else {
      login();
    }
  } catch (e) {
    console.error(e);
    login();
  }
}

async function loadProfile(userId) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, username, full_name, role, active")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile) {
    await supabaseClient.auth.signOut();
    alert("Your login account has no matching profile.");
    login();
    return;
  }
  if (profile.active === false) {
    await supabaseClient.auth.signOut();
    alert("This account is inactive. Please contact the owner.");
    login();
    return;
  }

  me = {
    u: profile.username,
    n: profile.full_name || profile.username,
    r: profile.role === "admin" ? "admin" : "rep",
    id: profile.id,
    active: profile.active
  };
  sessionStorage.setItem("me", JSON.stringify(me));
  await refreshData();
  home("dashboard");
}

async function refreshData() {
  const { data: inv, error: invError } = await supabaseClient
    .from("inventory")
    .select("id, product_name, category, color, quantity, price, created_at")
    .order("created_at", { ascending: false });
  if (invError) throw invError;

  inventory = (inv || []).map(i => ({
    id: i.id, p: i.product_name, c: i.category, color: i.color,
    q: Number(i.quantity), price: Number(i.price)
  }));

  if (me?.r === "admin") {
    const { data: s, error: salesError } = await supabaseClient
      .from("sales")
      .select("id, sale_date, inventory_id, product_name, color, quantity, amount, rep_id, rep_name, customer_name, payment_method, created_at")
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (salesError) throw salesError;
    sales = (s || []).map(normalizeSale);
  } else {
    const { data: s, error: salesError } = await supabaseClient
      .from("sales")
      .select("id, sale_date, inventory_id, product_name, color, quantity, amount, rep_id, rep_name, customer_name, payment_method, created_at")
      .eq("rep_id", me.id)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (salesError) throw salesError;
    sales = (s || []).map(normalizeSale);
  }
}

function normalizeSale(s) {
  return {
    id: s.id, d: s.sale_date, inventory_id: s.inventory_id,
    p: s.product_name, color: s.color, q: Number(s.quantity),
    amt: Number(s.amount), rep: s.rep_name, rep_id: s.rep_id,
    customer: s.customer_name || "", payment: s.payment_method || ""
  };
}

function login() {
  app.innerHTML = `
    <div class="auth-shell page page-login" style="--bg-image:url('assets/store-1.jpg')">
      <div class="auth-overlay"></div>
      <section class="login-card">
        <div class="brand-mark">DS</div>
        <p class="eyebrow">Simple retail management</p>
        <h1>Digital Sales Book</h1>
        <p class="muted">Track stock, record sales and keep your store organized.</p>
        <form onsubmit="event.preventDefault(); doLogin()">
          <label>Username
            <input id="u" autocomplete="username" placeholder="Enter username">
          </label>
          <label>Password
            <input id="p" type="password" autocomplete="current-password" placeholder="Enter password">
          </label>
          <button class="primary" type="submit">Sign in</button>
        </form>
        <div class="demo-login">
          <strong>Sign in with your username</strong>
          <span>Your username is the one saved in the Supabase <b>profiles</b> table.</span>
        </div>
      </section>
    </div>
  `;
}

window.doLogin = async () => {
  const username = $("#u").value.trim();
  const password = $("#p").value;
  if (!username || !password) return alert("Enter your username and password.");
  if (!supabaseClient) return alert("Supabase is not configured yet. Add your project URL and publishable key in script.js.");

  try {
    const { data: authEmail, error: emailError } =
      await supabaseClient.rpc("get_login_email", { profile_username: username });
    if (emailError) throw emailError;
    if (!authEmail) return alert("Username not found.");

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: authEmail, password
    });
    if (error) throw error;
    if (!data.user) return alert("Login failed.");

    await loadProfile(data.user.id);
  } catch (err) {
    console.error(err);
    alert(err.message || "Login failed.");
  }
};

window.logout = async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  sessionStorage.removeItem("me");
  me = null;
  inventory = [];
  sales = [];
  login();
};

async function showTab(tab) {
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  const activeButton = [...document.querySelectorAll(".tab")].find(b =>
    b.getAttribute("onclick")?.includes(`'${tab}'`)
  );
  activeButton?.classList.add("active");

  if (tab === "dashboard") renderDashboard();
  if (tab === "inventory") renderInventory();
  if (tab === "sale" && me.r === "rep") renderSale();
  if (tab === "reports" && me.r === "admin") renderReports();
}
window.showTab = showTab;

function home(active = "dashboard") {
  const admin = me.r === "admin";
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark small">DS</div>
          <div><strong>Digital Sales Book</strong><span>Retail workspace</span></div>
        </div>
        <div class="user-area">
          <div class="avatar">${esc((me.n || "U").charAt(0).toUpperCase())}</div>
          <div class="user-copy"><strong>${esc(me.n)}</strong><span>${admin ? "Administrator" : "Sales representative"}</span></div>
          <button class="ghost small-btn" onclick="logout()">Log out</button>
        </div>
      </header>
      <nav class="tabs" aria-label="Main navigation">
        <button class="tab ${active === "dashboard" ? "active" : ""}" onclick="showTab('dashboard')">Overview</button>
        <button class="tab ${active === "inventory" ? "active" : ""}" onclick="showTab('inventory')">Inventory</button>
        ${!admin ? `<button class="tab ${active === "sale" ? "active" : ""}" onclick="showTab('sale')">Record Sale</button>` : ""}
        ${admin ? `<button class="tab ${active === "reports" ? "active" : ""}" onclick="showTab('reports')">Total Sales</button>` : ""}
      </nav>
      <main id="v" class="content"></main>
    </div>`;
  showTab(active);
}

function pageWrap(cls, image, content) {
  return `<section class="page-panel ${cls}" style="--bg-image:url('assets/${image}')"><div class="page-bg"></div><div class="page-content">${content}</div></section>`;
}

function renderDashboard() {
  const totalStock = inventory.reduce((sum, i) => sum + i.q, 0);
  const totalValue = inventory.reduce((sum, i) => sum + i.q * i.price, 0);
  const totalSales = sales.reduce((sum, s) => sum + s.amt, 0);
  const lowStock = inventory.filter(i => i.q <= 5);
  const recent = sales.slice(0, 5);

  $("#v").innerHTML = pageWrap("dashboard-page", "store-2.jpg", `
    <div class="hero">
      <div><p class="eyebrow">Welcome back, ${esc(me.n)}</p><h1>Run your store at a glance.</h1><p class="muted">Everything you need is kept simple and close at hand.</p></div>
      ${me.r === "rep" ? `<button class="primary hero-action" onclick="showTab('sale')">+ Record a sale</button>` : ""}
    </div>
    <div class="stats">
      <article class="stat-card"><span>Items in stock</span><strong>${totalStock}</strong><small>${inventory.length} products</small></article>
      <article class="stat-card"><span>Inventory value</span><strong>${money(totalValue)}</strong><small>Current stock value</small></article>
      <article class="stat-card"><span>${me.r === "admin" ? "Total sales" : "My sales"}</span><strong>${money(totalSales)}</strong><small>${sales.length} recorded transactions</small></article>
      <article class="stat-card ${lowStock.length ? "warning" : ""}"><span>Low stock</span><strong>${lowStock.length}</strong><small>${lowStock.length ? "Needs attention" : "Stock looks healthy"}</small></article>
    </div>
    <div class="two-col">
      <div class="glass-card">
        <div class="section-head"><div><p class="eyebrow">Recent activity</p><h2>Latest sales</h2></div>${me.r === "admin" ? `<button class="text-btn" onclick="showTab('reports')">View all</button>` : ""}</div>
        ${recent.length ? `<div class="activity-list">${recent.map(s => `
          <div class="activity-row"><div class="activity-icon">₦</div><div class="activity-main"><strong>${esc(s.p)}</strong><span>${esc(s.rep)} · ${esc(s.d)} · ${esc(s.payment)}</span></div><strong>${money(s.amt)}</strong></div>`).join("")}</div>` : `<div class="empty">No sales recorded yet.</div>`}
      </div>
      <div class="glass-card">
        <div class="section-head"><div><p class="eyebrow">Stock watch</p><h2>Products</h2></div></div>
        <div class="mini-products">${inventory.slice(0, 5).map(i => `
          <div class="mini-product"><div><strong>${esc(i.p)}</strong><span>${esc(i.color)} · ${esc(i.c)}</span></div><b class="${i.q <= 5 ? "stock-low" : ""}">${i.q} left</b></div>`).join("")}</div>
      </div>
    </div>`);
}

function renderInventory() {
  $("#v").innerHTML = pageWrap("inventory-page", "store-3.jpg", `
    <div class="page-heading">
      <div><p class="eyebrow">Stock management</p><h1>Inventory</h1><p class="muted">See what you have, what it costs and what needs restocking.</p></div>
      ${me.r === "admin" ? `<button class="primary" onclick="addInv()">+ Add inventory</button>` : ""}
    </div>
    <div class="glass-card table-card">
      <div class="table-tools"><input id="inventorySearch" oninput="filterInventory()" placeholder="Search products..."><span>${inventory.length} products</span></div>
      <div class="table-wrap"><table id="inventoryTable">
        <thead><tr><th>Product</th><th>Category</th><th>Color</th><th>Stock</th><th>Price</th></tr></thead>
        <tbody>${inventory.map(i => `
          <tr><td><strong>${esc(i.p)}</strong></td><td>${esc(i.c)}</td><td>${esc(i.color)}</td><td><span class="stock-pill ${i.q <= 5 ? "low" : ""}">${i.q}</span></td><td><strong>${money(i.price)}</strong></td></tr>`).join("")}</tbody>
      </table></div>
    </div>`);
}
window.filterInventory = () => {
  const term = ($("#inventorySearch")?.value || "").toLowerCase();
  document.querySelectorAll("#inventoryTable tbody tr").forEach(row => row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none");
};

window.addInv = () => {
  if (me.r !== "admin") return;
  $("#v").innerHTML = pageWrap("inventory-page", "store-3.jpg", `
    <div class="page-heading"><div><p class="eyebrow">Inventory</p><h1>Add product</h1><p class="muted">Add a new item to your store stock.</p></div><button class="ghost" onclick="showTab('inventory')">← Back</button></div>
    <div class="glass-card form-card"><form onsubmit="event.preventDefault(); saveInv()">
      <div class="form-grid">
        <label>Product name<input id="newProduct" required placeholder="e.g. Canvas Bag"></label>
        <label>Category<input id="newCategory" required placeholder="e.g. Bags"></label>
        <label>Color<input id="newColor" required placeholder="e.g. Brown"></label>
        <label>Quantity<input id="newQty" required type="number" min="0" placeholder="0"></label>
        <label>Price (₦)<input id="newPrice" required type="number" min="0" placeholder="0"></label>
      </div>
      <button class="primary" type="submit">Save product</button>
    </form></div>`);
};

window.saveInv = async () => {
  if (me.r !== "admin") return;
  const product = {
    product_name: $("#newProduct").value.trim(),
    category: $("#newCategory").value.trim(),
    color: $("#newColor").value.trim(),
    quantity: Number($("#newQty").value),
    price: Number($("#newPrice").value)
  };
  if (!product.product_name || !product.category || !product.color || product.quantity < 0 || product.price < 0) return alert("Please complete all fields.");
  const { error } = await supabaseClient.from("inventory").insert(product);
  if (error) return alert(error.message);
  await refreshData();
  showTab("inventory");
};

function renderSale() {
  if (me.r !== "rep") return;
  const options = inventory.map(i => `<option value="${i.id}" ${i.q === 0 ? "disabled" : ""}>${esc(i.p)} — ${esc(i.color)} · ${i.q} left · ${money(i.price)}</option>`).join("");
  $("#v").innerHTML = pageWrap("sale-page", "store-4.jpg", `
    <div class="page-heading"><div><p class="eyebrow">Sales</p><h1>Record a sale</h1><p class="muted">Choose an item, enter the quantity and save the transaction.</p></div></div>
    <div class="glass-card form-card sale-form-card">
      ${inventory.length ? `<form onsubmit="event.preventDefault(); saveSale()">
        <label>Product<select id="item" required>${options}</select></label>
        <div class="form-grid">
          <label>Quantity<input id="qty" type="number" min="1" value="1" required></label>
          <label>Date<input id="date" type="date" value="${today()}" required></label>
          <label>Customer name <span class="optional">optional</span><input id="customer" placeholder="Customer name"></label>
          <label>Payment method<select id="payment" required>
            <option value="">Select payment method</option>
            <option>Cash</option>
            <option>Bank Transfer</option>
            <option>POS</option>
            <option>Card</option>
            <option>Online Payment</option>
            <option>Other</option>
          </select></label>
        </div>
        <div id="salePreview" class="sale-preview">Select a product to see the total.</div>
        <button class="primary" type="submit">Save sale</button>
      </form>` : `<div class="empty">No products are currently available.</div>`}
    </div>`);
  $("#item")?.addEventListener("change", updateSalePreview);
  $("#qty")?.addEventListener("input", updateSalePreview);
  updateSalePreview();
}

function updateSalePreview() {
  const item = inventory.find(x => String(x.id) === String($("#item")?.value));
  const qty = Number($("#qty")?.value || 1);
  const preview = $("#salePreview");
  if (!item || !preview) return;
  preview.innerHTML = `<span>${esc(item.p)} × ${qty}</span><strong>${money(item.price * qty)}</strong>`;
}

window.saveSale = async () => {
  if (me.r !== "rep") return;
  const item = inventory.find(x => String(x.id) === String($("#item").value));
  const qty = Number($("#qty").value);
  const payment = $("#payment").value;
  if (!item) return alert("Please select a product.");
  if (!Number.isInteger(qty) || qty < 1) return alert("Enter a valid quantity.");
  if (qty > item.q) return alert("Not enough stock.");
  if (!payment) return alert("Please select how the customer paid.");

  const { data, error } = await supabaseClient.rpc("record_sale", {
    p_inventory_id: item.id,
    p_quantity: qty,
    p_sale_date: $("#date").value,
    p_customer_name: $("#customer").value.trim(),
    p_payment_method: payment
  });
  if (error) {
    console.error(error);
    return alert(error.message);
  }
  await refreshData();
  alert("Sale saved successfully.");
  showTab("dashboard");
};

function renderReports() {
  if (me.r !== "admin") return;
  const groups = {};
  sales.forEach(s => {
    groups[s.d] ??= { amt: 0, qty: 0 };
    groups[s.d].amt += s.amt;
    groups[s.d].qty += s.q;
  });
  const dates = Object.keys(groups).sort().reverse();
  const grandTotal = sales.reduce((sum, s) => sum + s.amt, 0);

  $("#v").innerHTML = pageWrap("reports-page", "store-5.jpg", `
    <div class="page-heading"><div><p class="eyebrow">Admin report</p><h1>Total sales</h1><p class="muted">Review sales by day and open a detailed transaction list.</p></div><div class="report-total"><span>All-time</span><strong>${money(grandTotal)}</strong></div></div>
    <div class="report-grid">${dates.length ? dates.map(d => `
      <button class="day-card" onclick="day('${esc(d)}')"><span>${esc(d)}</span><strong>${money(groups[d].amt)}</strong><small>${groups[d].qty} item${groups[d].qty === 1 ? "" : "s"} sold</small><b>View →</b></button>
    `).join("") : `<div class="glass-card empty">No sales yet.</div>`}</div>`);
}

window.day = (d) => {
  if (me.r !== "admin") return;
  const rows = sales.filter(s => s.d === d);
  const total = rows.reduce((sum, s) => sum + s.amt, 0);
  $("#v").innerHTML = pageWrap("reports-page", "store-5.jpg", `
    <div class="page-heading"><div><p class="eyebrow">Sales report</p><h1>${esc(d)}</h1><p class="muted">${rows.length} transaction${rows.length === 1 ? "" : "s"} · ${money(total)}</p></div><button class="ghost" onclick="showTab('reports')">← Back</button></div>
    <div class="glass-card table-card"><div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Qty</th><th>Amount</th><th>Payment</th><th>Sales rep</th><th>Customer</th></tr></thead>
      <tbody>${rows.map(s => `
        <tr><td><strong>${esc(s.p)}</strong><br><span class="subtle">${esc(s.color)}</span></td><td>${s.q}</td><td><strong>${money(s.amt)}</strong></td><td>${esc(s.payment)}</td><td>${esc(s.rep)}</td><td>${esc(s.customer || "—")}</td></tr>`).join("")}</tbody>
    </table></div></div>`);
};

