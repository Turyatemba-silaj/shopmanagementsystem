const sections = [
  ["login", "Staff Login"],
  ["home", "Home"],
  ["marketplace", "Marketplace"],
  ["cart", "Cart"],
  ["orders", "Online Orders"],
  ["reports", "Reports"],
  ["dashboard", "Dashboard"],
  ["products", "Products"],
  ["categories", "Categories"],
  ["suppliers", "Suppliers"],
  ["customers", "Customers"],
  ["purchases", "Purchases"],
  ["sales", "Sales"],
  ["walkin", "Walk-in"],
  ["payments", "Payments"],
  ["payroll", "Payroll"],
  ["expenses", "Expenses"],
  ["activityLogs", "Activity Logs"],
  ["shopSettings", "Shop Settings"],
  ["users", "Users"]
];

const config = {
  categories: {
    title: "Categories",
    endpoint: "categories",
    fields: [
      ["category_name", "Category name", "text"],
      ["description", "Description", "textarea"]
    ],
    columns: ["category_id", "category_name", "description"]
  },
  suppliers: {
    title: "Suppliers",
    endpoint: "suppliers",
    fields: [
      ["supplier_name", "Supplier name", "text"],
      ["phone", "Phone", "text"],
      ["email", "Email", "email"],
      ["address", "Address", "textarea"],
      ["company_name", "Company name", "text"]
    ],
    columns: ["supplier_id", "supplier_name", "phone", "email", "company_name"]
  },
  customers: {
    title: "Customers",
    endpoint: "customers",
    fields: [
      ["customer_name", "Customer name", "text"],
      ["phone", "Phone", "text"],
      ["email", "Email", "email"],
      ["address", "Address", "textarea"]
    ],
    columns: ["customer_id", "customer_name", "phone", "email", "address"]
  },
  users: {
    title: "Users",
    endpoint: "users",
    fields: [
      ["username", "Username", "text"],
      ["password", "Password", "password"],
      ["full_name", "Full name", "text"],
      ["email", "Email", "email"],
      ["role", "Role", "select", ["admin", "manager", "cashier"]],
      ["monthly_salary", "Monthly salary", "number"],
      ["salary_status", "Salary status", "select", ["active", "inactive"]]
    ],
    columns: ["user_id", "username", "full_name", "email", "role", "monthly_salary", "salary_status", "created_at"]
  },
  expenses: {
    title: "Expenses",
    endpoint: "expenses",
    fields: [
      ["user_id", "Recorded by", "ref", "users"],
      ["expense_name", "Expense name", "text"],
      ["amount", "Amount", "number"],
      ["expense_date", "Expense date", "date"],
      ["description", "Description", "textarea"]
    ],
    columns: ["expense_id", "user_id", "expense_name", "amount", "expense_date", "description"]
  }
};

let state = {
  section: localStorage.getItem("staffAuth") ? "home" : "marketplace",
  options: {},
  staff: JSON.parse(localStorage.getItem("staffAuth") || "null"),
  authMode: "login",
  storefront: { q: "", category: "", sort: "featured", viewProductId: null },
  cart: JSON.parse(localStorage.getItem("shopCart") || "[]"),
  editing: {},
  dashboardPeriod: "monthly",
  reportPeriod: "daily",
  expenseFilters: { type: "all", user: "all" },
  purchaseLines: [{}],
  saleLines: [{}],
  walkinLines: [{}],
  lastWalkinReceipt: null,
  stockNotice: "",
  flash: {}
};

state.payrollMonth = new Date().toISOString().slice(0, 7);

const $ = (selector) => document.querySelector(selector);
const VAT_RATE = 0.18;
const DISCOUNT_THRESHOLD = 400000;
const DISCOUNT_RATE = 0.10;
const money = (value) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const saveCart = () => localStorage.setItem("shopCart", JSON.stringify(state.cart));
const productImage = (product) => product.product_image
  ? `<img src="${product.product_image}" alt="${product.product_name}">`
  : `<span>${product.product_name.slice(0, 2).toUpperCase()}</span>`;
const safeCssColor = (color) => {
  const value = String(color || "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^[a-z]+$/i.test(value) ? value : "#e5e7eb";
};
const colorSwatch = (color) => color
  ? `<span class="color-swatch"><i style="background:${safeCssColor(color)}"></i>${color}</span>`
  : "";

function customerProductView(product) {
  return `
    <div class="product-view-backdrop" data-close-product-view>
      <article class="product-view" role="dialog" aria-modal="true" aria-label="${product.product_name}">
        <button class="product-view-close" type="button" data-close-product-view aria-label="Close">x</button>
        <div class="product-view-media">${productImage(product)}</div>
        <div class="product-view-copy">
          <span class="eyebrow">${product.category_name || "Product"}</span>
          <h3>${product.product_name}</h3>
          <strong>UGX ${money(product.selling_price)}</strong>
          <div class="product-view-meta">
            ${product.color ? colorSwatch(product.color) : `<span class="muted">Color not specified</span>`}
            <span>${product.stock_quantity} ${product.unit || "pcs"} available</span>
          </div>
          <section class="product-view-specs">
            <h4>Specifications</h4>
            <p>${product.specifications || "No specifications added yet."}</p>
          </section>
          <div class="stock-meter"><span style="width:${Math.min(100, Number(product.stock_quantity || 0) * 10)}%"></span></div>
          <div class="product-view-actions">
            <button type="button" data-modal-add-cart="${product.product_id}">Add to cart</button>
            <button type="button" class="secondary" data-modal-buy-now="${product.product_id}">Buy now</button>
          </div>
        </div>
      </article>
    </div>`;
}

function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function api(path, options = {}) {
  const res = await fetch(`/api/${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(state.staff?.token ? { Authorization: `Bearer ${state.staff.token}` } : {})
    },
    ...options
  });
  if (!res.ok) {
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_error) {
      data = {};
    }
    const error = new Error(data.error || text.slice(0, 160) || `Request failed (${res.status})`);
    error.status = res.status;
    if ([401, 403].includes(res.status) && !["login", "register", "forgot-password"].includes(path.split("?")[0])) {
      localStorage.removeItem("staffAuth");
      state.staff = null;
      state.section = "login";
    }
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

async function downloadApiFile(path, filename) {
  const res = await fetch(`/api/${path}`, {
    headers: {
      ...(state.staff?.token ? { Authorization: `Bearer ${state.staff.token}` } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_error) {
      data = {};
    }
    throw new Error(data.error || text.slice(0, 160) || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadOptions() {
  state.options = await api("options");
}

function setNav() {
  const publicSections = new Set(["marketplace", "cart", "login"]);
  const visibleSections = state.staff ? sections : sections.filter(([id]) => publicSections.has(id));
  $("#nav").innerHTML = visibleSections.map(([id, label]) => (
    `<button type="button" class="${state.section === id ? "active" : ""}" data-section="${id}">${label}${id === "cart" ? ` (${cartCount()})` : ""}</button>`
  )).join("") + (state.staff ? `<button type="button" data-logout>Logout</button>` : "");
  $("#nav").onclick = (event) => {
    if (event.target.dataset.logout !== undefined) {
      localStorage.removeItem("staffAuth");
      state.staff = null;
      state.section = "marketplace";
      render();
      return;
    }
    if (event.target.dataset.section) {
      state.section = event.target.dataset.section;
      render();
    }
  };
}

function cartCount() {
  return state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + Number(item.selling_price || 0) * Number(item.quantity || 0), 0);
}

function transactionTotals(subtotal) {
  const amount = Number(subtotal || 0);
  const discount = amount >= DISCOUNT_THRESHOLD ? amount * DISCOUNT_RATE : 0;
  const taxable = Math.max(amount - discount, 0);
  const tax = taxable * VAT_RATE;
  return { subtotal: amount, discount, taxable, tax, total: taxable + tax };
}

async function renderMarketplace() {
  $("#page-title").textContent = "Marketplace";
  const params = new URLSearchParams();
  if (state.storefront.q) params.set("q", state.storefront.q);
  if (state.storefront.category) params.set("category", state.storefront.category);
  const data = await api(`storefront?${params.toString()}`);
  const selectedCategory = data.categories.find((category) => String(category.category_id) === String(state.storefront.category));
  const visibleProducts = data.products.slice().sort((a, b) => {
    if (state.storefront.sort === "price-low") return Number(a.selling_price || 0) - Number(b.selling_price || 0);
    if (state.storefront.sort === "price-high") return Number(b.selling_price || 0) - Number(a.selling_price || 0);
    if (state.storefront.sort === "stock") return Number(b.stock_quantity || 0) - Number(a.stock_quantity || 0);
    return Number(a.product_id || 0) - Number(b.product_id || 0);
  });
  const viewedProduct = data.products.find((p) => String(p.product_id) === String(state.storefront.viewProductId));
  const cartPreview = state.cart.slice(0, 3);
  const totals = transactionTotals(cartTotal());
  $("#view").innerHTML = `
    <section class="market-shell">
      <section class="market-hero">
        <div class="market-hero-copy">
          <p class="eyebrow">Online shopping marketplace</p>
          <h3>Discover products, compare prices, and build an order in seconds.</h3>
          <div class="market-stats">
            <span>${visibleProducts.length} products</span>
            <span>${selectedCategory?.category_name || "All categories"}</span>
            <span>${cartCount()} in cart</span>
          </div>
        </div>
        <div class="market-hero-card">
          <span>Cart total</span>
          <strong>UGX ${money(totals.total)}</strong>
          <button type="button" data-section="cart">Checkout</button>
        </div>
      </section>
      <section class="market-tools">
        <div class="market-search">
          <input id="market-search" type="search" value="${state.storefront.q}" placeholder="Search products or barcode">
          ${state.storefront.q ? `<button type="button" data-clear-search>Clear</button>` : ""}
        </div>
        <select id="market-sort" aria-label="Sort products">
          ${[
            ["featured", "Featured"],
            ["price-low", "Price: low to high"],
            ["price-high", "Price: high to low"],
            ["stock", "Most available"]
          ].map(([value, label]) => `<option value="${value}" ${state.storefront.sort === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <button type="button" data-section="cart">View cart (${cartCount()})</button>
      </section>
      <section class="category-strip" aria-label="Product categories">
        <button type="button" class="${state.storefront.category ? "" : "active"}" data-category="">All</button>
        ${data.categories.map((c) => `<button type="button" class="${String(state.storefront.category) === String(c.category_id) ? "active" : ""}" data-category="${c.category_id}">${c.category_name}</button>`).join("")}
      </section>
      <section class="market-content">
        <div>
          <section class="market-section-heading">
            <div>
              <p class="eyebrow">${selectedCategory?.category_name || "Fresh picks"}</p>
              <h3>${state.storefront.q ? `Results for "${state.storefront.q}"` : "Shop products"}</h3>
            </div>
            <span>${visibleProducts.length} item${visibleProducts.length === 1 ? "" : "s"}</span>
          </section>
          <section class="product-grid market-grid">
            ${visibleProducts.map((p) => `
              <article class="product-card market-card">
                <div class="discount-badge">${Number(p.stock_quantity || 0) < 10 ? "Low" : "Hot"}</div>
                <button class="product-open" type="button" data-view-product="${p.product_id}" aria-label="View ${p.product_name}">
                  <div class="product-image">${productImage(p)}</div>
                  <div class="product-copy">
                    <span>${p.category_name}</span>
                    <h3>${p.product_name}</h3>
                    <strong>UGX ${money(p.selling_price)}</strong>
                    ${p.color ? colorSwatch(p.color) : ""}
                    ${p.specifications ? `<p>${p.specifications}</p>` : ""}
                    <p>${p.stock_quantity} ${p.unit || "pcs"} available</p>
                    <div class="stock-meter"><span style="width:${Math.min(100, Number(p.stock_quantity || 0) * 10)}%"></span></div>
                  </div>
                </button>
                <div class="product-actions">
                  <button type="button" class="secondary" data-view-product="${p.product_id}">View</button>
                  <button type="button" data-add-cart="${p.product_id}">Add</button>
                  <button type="button" class="secondary" data-buy-now="${p.product_id}">Buy now</button>
                </div>
              </article>
            `).join("") || `<p class="muted">No matching products.</p>`}
          </section>
        </div>
        <aside class="market-cart">
          <div>
            <span>Current order</span>
            <strong>${cartCount()} item${cartCount() === 1 ? "" : "s"}</strong>
          </div>
          ${cartPreview.length ? cartPreview.map((item) => `
            <div class="mini-cart-row">
              <span>${item.product_name} x ${item.quantity}</span>
              <strong>UGX ${money(Number(item.selling_price || 0) * Number(item.quantity || 0))}</strong>
            </div>
          `).join("") : `<p class="muted">Add products to start an order.</p>`}
          ${state.cart.length > cartPreview.length ? `<p class="muted">+${state.cart.length - cartPreview.length} more item(s)</p>` : ""}
          <div class="mini-cart-total">
            <span>Total</span>
            <strong>UGX ${money(totals.total)}</strong>
          </div>
          <button type="button" data-section="cart" ${state.cart.length ? "" : "disabled"}>Checkout</button>
        </aside>
      </section>
    </section>
    ${viewedProduct ? customerProductView(viewedProduct) : ""}`;
  $("#market-search").oninput = (event) => {
    state.storefront.q = event.target.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(render, 250);
  };
  $("#market-sort").onchange = (event) => {
    state.storefront.sort = event.target.value;
    render();
  };
  $("#view").onclick = (event) => {
    if (event.target.dataset.clearSearch !== undefined) {
      state.storefront.q = "";
      state.storefront.viewProductId = null;
      render();
      return;
    }
    if (event.target.dataset.category !== undefined) {
      state.storefront.category = event.target.dataset.category;
      state.storefront.viewProductId = null;
      render();
      return;
    }
    if (event.target.dataset.section) {
      state.section = event.target.dataset.section;
      state.storefront.viewProductId = null;
      render();
      return;
    }
    const viewProduct = event.target.closest("[data-view-product]");
    if (viewProduct) {
      state.storefront.viewProductId = viewProduct.dataset.viewProduct;
      renderMarketplace();
      return;
    }
    if (event.target.dataset.closeProductView !== undefined) {
      state.storefront.viewProductId = null;
      renderMarketplace();
      return;
    }
    if (event.target.dataset.addCart) {
      const product = data.products.find((p) => String(p.product_id) === event.target.dataset.addCart);
      addToCart(product);
      renderMarketplace();
      return;
    }
    if (event.target.dataset.modalAddCart) {
      const product = data.products.find((p) => String(p.product_id) === event.target.dataset.modalAddCart);
      addToCart(product);
      renderMarketplace();
      return;
    }
    if (event.target.dataset.modalBuyNow) {
      const product = data.products.find((p) => String(p.product_id) === event.target.dataset.modalBuyNow);
      addToCart(product);
      state.storefront.viewProductId = null;
      state.section = "cart";
      render();
      return;
    }
    const buyNow = event.target.closest("[data-buy-now]");
    if (buyNow) {
      const product = data.products.find((p) => String(p.product_id) === buyNow.dataset.buyNow);
      addToCart(product);
      state.section = "cart";
      render();
    }
  };
}

async function renderLogin() {
  $("#page-title").textContent = "Staff Login";
  const mode = state.authMode || "login";
  const titles = {
    login: "Staff access",
    register: "Create account",
    forgot: "Reset password"
  };
  $("#view").innerHTML = `
    <section class="auth-shell">
      <div class="panel auth-panel">
        <div class="auth-heading">
          <h3>${titles[mode]}</h3>
        </div>
        <div class="auth-tabs">
          <button type="button" class="${mode === "login" ? "active" : ""}" data-auth-mode="login">Login</button>
          <button type="button" class="${mode === "register" ? "active" : ""}" data-auth-mode="register">Create account</button>
          <button type="button" class="${mode === "forgot" ? "active" : ""}" data-auth-mode="forgot">Forgot password</button>
        </div>
        <form id="auth-form" class="auth-form" novalidate>
          ${mode === "login" ? `
            <label>Username<input name="username" type="text" autocomplete="username"></label>
            <label>Password<input name="password" type="password" autocomplete="current-password"></label>
            <button type="submit">Login</button>
          ` : ""}
          ${mode === "register" ? `
            <label>Full name<input name="full_name" type="text" autocomplete="name"></label>
            <label>Username<input name="username" type="text" autocomplete="username"></label>
            <label>Email<input name="email" type="email" autocomplete="email"></label>
            <label>Password<input name="password" type="password" autocomplete="new-password"></label>
            <label>Confirm password<input name="confirm_password" type="password" autocomplete="new-password"></label>
            <button type="submit">Create account</button>
          ` : ""}
          ${mode === "forgot" ? `
            <label>Username<input name="username" type="text" autocomplete="username"></label>
            <label>Email<input name="email" type="email" autocomplete="email"></label>
            <label>New password<input name="new_password" type="password" autocomplete="new-password"></label>
            <label>Confirm password<input name="confirm_password" type="password" autocomplete="new-password"></label>
            <button type="submit">Reset password</button>
          ` : ""}
      </form>
      </div>
    </section>`;
  $("#view").onclick = async (event) => {
    const button = event.target.closest("[data-auth-mode]");
    if (!button) return;
    state.authMode = button.dataset.authMode;
    await renderLogin();
  };
  $("#auth-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector("button[type='submit']");
    form.querySelector(".notice")?.remove();
    const body = Object.fromEntries(new FormData(form).entries());
    if (mode === "login" && (!body.username || !body.password)) {
      formNotice(form, "Please enter username and password.");
      return;
    }
    if (mode === "register" && (!body.full_name || !body.username || !body.password)) {
      formNotice(form, "Please enter full name, username, and password.");
      return;
    }
    if (mode === "forgot" && (!body.username || !body.email || !body.new_password)) {
      formNotice(form, "Please enter username, email, and new password.");
      return;
    }
    if ((mode === "register" || mode === "forgot") && (body.password || body.new_password) !== body.confirm_password) {
      formNotice(form, "Passwords do not match.");
      return;
    }
    submit.disabled = true;
    submit.textContent = mode === "login" ? "Logging in..." : mode === "register" ? "Creating account..." : "Resetting password...";
    try {
      if (mode === "forgot") {
        await api("forgot-password", { method: "POST", body: JSON.stringify(body) });
        state.authMode = "login";
        await renderLogin();
        formNotice($("#auth-form"), "Password updated. You can log in now.");
      } else {
        const endpoint = mode === "register" ? "register" : "login";
        const auth = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
        state.staff = auth;
        localStorage.setItem("staffAuth", JSON.stringify(auth));
        state.authMode = "login";
        state.section = "home";
        await render();
      }
    } catch (error) {
      formNotice(form, error.message);
      submit.disabled = false;
      submit.textContent = mode === "login" ? "Login" : mode === "register" ? "Create account" : "Reset password";
    }
  };
}

function addToCart(product) {
  const existing = state.cart.find((item) => item.product_id === product.product_id);
  if (existing) {
    existing.quantity = Math.min(Number(existing.quantity) + 1, Number(product.stock_quantity));
  } else {
    state.cart.push({ ...product, quantity: 1 });
  }
  saveCart();
  setNav();
}

async function renderCart() {
  $("#page-title").textContent = "Cart";
  $("#view").innerHTML = `
    <div class="split cart-layout">
      <section class="panel">
        <h3>Shopping cart</h3>
        ${state.stockNotice ? `<div class="notice">${state.stockNotice}</div>` : ""}
        ${state.cart.length ? state.cart.map((item, index) => `
          <div class="cart-row">
            <div>
              <strong>${item.product_name}</strong>
              <span>UGX ${money(item.selling_price)} each</span>
            </div>
            <input data-cart-qty="${index}" type="number" min="1" max="${item.stock_quantity}" value="${item.quantity}">
            <button class="danger" type="button" data-remove-cart="${index}">Remove</button>
          </div>
        `).join("") : `<p class="muted">Your cart is empty.</p>`}
        ${(() => {
          const totals = transactionTotals(cartTotal());
          return `<div class="transaction-summary">
            <div><span>Amount</span><strong>UGX ${money(totals.subtotal)}</strong></div>
            <div><span>Discount</span><strong>UGX ${money(totals.discount)}</strong></div>
            <div><span>VAT 18%</span><strong>UGX ${money(totals.tax)}</strong></div>
            <div><span>Total</span><strong>UGX ${money(totals.total)}</strong></div>
          </div>`;
        })()}
      </section>
      <section class="panel">
        <h3>Checkout</h3>
        <form id="checkout-form">
          <label>Full name<input name="customer_name" type="text" required></label>
          <label>Phone<input name="phone" type="text" required></label>
          <label>Email<input name="email" type="email"></label>
          <label>Payment method<select name="payment_method"><option>cash on delivery</option><option>mobile money</option><option>card</option><option>bank</option></select></label>
          ${paymentReferenceFields({}, true)}
          <label>Delivery method<select name="delivery_method"><option>door delivery</option><option>pickup station</option><option>express delivery</option></select></label>
          <label class="wide">Delivery address<textarea name="address" required></textarea></label>
          <label class="wide">Notes<textarea name="notes"></textarea></label>
          <button type="submit">Place order</button>
        </form>
      </section>
    </div>`;
  setupPaymentReference($("#checkout-form"));
  $("#view").oninput = (event) => {
    if (event.target.dataset.cartQty !== undefined) {
      const item = state.cart[Number(event.target.dataset.cartQty)];
      const requested = Number(event.target.value || 1);
      if (requested > Number(item.stock_quantity || 0)) {
        state.stockNotice = `Stock notification: ${item.product_name} has only ${item.stock_quantity} available, but ${requested} was ordered.`;
      } else {
        state.stockNotice = "";
      }
      item.quantity = Math.max(1, Math.min(requested, Number(item.stock_quantity)));
      saveCart();
      renderCart();
      setNav();
    }
  };
  $("#view").onclick = (event) => {
    if (event.target.dataset.removeCart !== undefined) {
      state.cart.splice(Number(event.target.dataset.removeCart), 1);
      saveCart();
      render();
    }
  };
  $("#checkout-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector("button[type='submit']");
    form.querySelector(".notice")?.remove();
    if (!state.cart.length) {
      form.insertAdjacentHTML("afterbegin", `<div class="notice">Add at least one product to the cart before placing an order.</div>`);
      return;
    }
    const overStock = state.cart.find((item) => Number(item.quantity || 0) > Number(item.stock_quantity || 0));
    if (overStock) {
      form.insertAdjacentHTML("afterbegin", `<div class="notice">Stock notification: ${overStock.product_name} has only ${overStock.stock_quantity} available.</div>`);
      return;
    }
    if (form.payment_method.value === "mobile money") {
      const payable = transactionTotals(cartTotal()).total;
      if (!form.mobile_number.value) {
        formNotice(form, "Enter the mobile money number.");
        return;
      }
      if (!/^\d{4,6}$/.test(form.mobile_pin.value || "")) {
        formNotice(form, "Enter a valid 4 to 6 digit mobile money PIN.");
        return;
      }
      if (form.mobile_balance.value === "") {
        formNotice(form, "Enter the mobile money account balance.");
        return;
      }
      if (Number(form.mobile_balance.value) < payable) {
        formNotice(form, `Insufficient mobile money balance. Available UGX ${money(form.mobile_balance.value)}, required UGX ${money(payable)}.`);
        return;
      }
    }
    submit.disabled = true;
    submit.textContent = "Placing order...";
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      body.items = state.cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity }));
      const order = await api("checkout", { method: "POST", body: JSON.stringify(body) });
      state.cart = [];
      saveCart();
      $("#view").innerHTML = `<section class="panel order-success"><h3>Order placed</h3><strong>${order.order_number}</strong><p>Total: UGX ${money(order.total)}</p>${order.seller_received ? `<p>Seller account credited: UGX ${money(order.seller_received)}</p>` : ""}<button type="button" data-section="marketplace">Continue shopping</button></section>`;
      $("#view").onclick = (e) => {
        if (e.target.dataset.section) {
          state.section = e.target.dataset.section;
          render();
        }
      };
      setNav();
    } catch (error) {
      form.insertAdjacentHTML("afterbegin", `<div class="notice">${error.message}</div>`);
      submit.disabled = false;
      submit.textContent = "Place order";
    }
  };
}

async function renderOrders() {
  $("#page-title").textContent = "Online Orders";
  const rows = await api("orders");
  const editing = state.editing.orders;
  $("#view").innerHTML = `
    <section class="grid cards">
      <article class="card"><span>Total online orders</span><strong>${rows.length}</strong></article>
      <article class="card"><span>Pending</span><strong>${rows.filter((o) => o.order_status === "pending").length}</strong></article>
      <article class="card"><span>Paid</span><strong>${rows.filter((o) => o.payment_status === "paid").length}</strong></article>
    </section>
    ${editing ? `<section class="panel">
      <h3>Edit order</h3>
      <form id="order-form">
        <label>Delivery phone<input name="delivery_phone" type="text" value="${editing.delivery_phone || ""}" required></label>
        <label>Delivery method<select name="delivery_method">${["door delivery", "pickup station", "express delivery"].map((v) => `<option value="${v}" ${editing.delivery_method === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>Order status<select name="order_status">${["pending", "processing", "delivered", "cancelled"].map((v) => `<option value="${v}" ${editing.order_status === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>Payment status<select name="payment_status">${["unpaid", "paid", "refunded"].map((v) => `<option value="${v}" ${editing.payment_status === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="wide">Delivery address<textarea name="delivery_address" required>${editing.delivery_address || ""}</textarea></label>
        <label class="wide">Notes<textarea name="notes">${editing.notes || ""}</textarea></label>
        <button type="submit">Update order</button>
        <button type="button" class="secondary" id="cancel-order-edit">Cancel edit</button>
      </form>
    </section>` : ""}
    <section class="panel">
      ${table(rows, ["order_id", "order_number", "customer_name", "delivery_phone", "delivery_method", "delivery_address", "total_amount", "order_status", "payment_status", "created_at"], "edit")}
    </section>`;
  $("#order-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector("button[type='submit']");
    form.querySelector(".notice")?.remove();
    submit.disabled = true;
    submit.textContent = "Updating order...";
    try {
      await api(`orders/${editing.order_id}`, { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      state.editing.orders = null;
      await renderOrders();
    } catch (error) {
      form.insertAdjacentHTML("afterbegin", `<div class="notice">${error.message}</div>`);
      submit.disabled = false;
      submit.textContent = "Update order";
    }
  });
  $("#cancel-order-edit")?.addEventListener("click", async () => {
    state.editing.orders = null;
    await renderOrders();
  });
  $("#view").onclick = async (event) => {
    if (event.target.dataset.edit) {
      state.editing.orders = rows.find((row) => String(row.order_id) === event.target.dataset.edit);
      await renderOrders();
    }
  };
}

async function renderReports() {
  $("#page-title").textContent = "Sales Reports";
  const periodLabels = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly"
  };
  const reports = await api("reports/daily-sales");
  const detail = await api(`reports/sales?period=${state.reportPeriod}`);
  const audit = await api(`reports/audit?period=${state.reportPeriod}`);
  const totalQuantity = detail.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalSold = detail.rows.reduce((sum, row) => sum + Number(row.total_amount_sold || 0), 0);
  const statement = audit.statement;
  $("#view").innerHTML = `
    <section class="panel report-toolbar">
      <button type="button" id="generate-report">Generate today's report</button>
      <span>Auto report runs daily at 22:00.</span>
    </section>
    <section class="panel">
      <div class="report-heading">
        <div>
          <span>${detail.start_date} to ${detail.end_date}</span>
          <h3>${periodLabels[state.reportPeriod]} sales report</h3>
        </div>
        <div class="period-tabs">
          ${Object.entries(periodLabels).map(([period, label]) => `<button type="button" class="${state.reportPeriod === period ? "active" : ""}" data-report-period="${period}">${label}</button>`).join("")}
        </div>
      </div>
      <section class="grid cards">
        <article class="card"><span>Items sold</span><strong>${money(totalQuantity)}</strong></article>
        <article class="card"><span>Total amount sold</span><strong>UGX ${money(totalSold)}</strong></article>
      </section>
      ${table(detail.rows.map((row) => ({
        sale_date: row.sale_date,
        sales_person: row.sales_person,
        product_sold: row.product_name,
        quantity: row.quantity,
        price: `UGX ${money(row.selling_price_per_product)}`,
        amount: `UGX ${money(row.total_amount_sold)}`
      })), ["sale_date", "sales_person", "product_sold", "quantity", "price", "amount"], false, "report-table sales-detail-table")}
    </section>
    <section class="panel report-card">
      <div class="report-heading">
        <div>
          <span>${audit.start_date} to ${audit.end_date}</span>
          <h3>Audited statement of business</h3>
        </div>
        <button type="button" id="export-audit-excel">Export Excel</button>
      </div>
      <p class="muted">${money(audit.counts.ledger_entries)} audited entries</p>
      <section class="grid cards">
        ${[
          ["Sales revenue", statement.sales_revenue],
          ["Cost of goods sold", statement.cost_of_goods_sold],
          ["Gross profit", statement.gross_profit],
          ["Operating expenses", statement.operating_expenses],
          ["Salary expenses", statement.salary_expenses],
          ["Net profit", statement.net_profit],
          ["Payments received", statement.payments_received],
          ["Supplier payments", statement.supplier_payments],
          ["Receivables", statement.receivables],
          ["Payables", statement.payables],
          ["Stock at cost", statement.stock_cost_value],
          ["Cash position", statement.cash_position]
        ].map(([label, value]) => `<article class="card"><span>${label}</span><strong>UGX ${money(value)}</strong></article>`).join("")}
      </section>
      <h3>Audit transaction ledger</h3>
      ${table(audit.ledger.map((row) => ({
        date: row.date,
        type: row.type,
        reference: row.reference,
        staff: row.staff,
        party: row.party,
        method: row.method,
        status: row.status,
        debit: `UGX ${money(row.debit)}`,
        credit: `UGX ${money(row.credit)}`
      })), ["date", "type", "reference", "staff", "party", "method", "status", "debit", "credit"], false, "report-table audit-table")}
    </section>
    ${reports.map((report) => `
      <section class="panel report-card">
        <div class="report-heading">
          <div>
            <span>${report.report_date}</span>
            <h3>Daily sales report</h3>
          </div>
          ${resultPill(report.result_status)}
        </div>
        <section class="grid cards">
          <article class="card"><span>Sales</span><strong>${report.sales_count}</strong></article>
          <article class="card"><span>Revenue</span><strong>UGX ${money(report.total_revenue)}</strong></article>
          <article class="card"><span>Cost</span><strong>UGX ${money(report.total_cost)}</strong></article>
          <article class="card"><span>${report.gross_profit >= 0 ? "Profit" : "Loss"}</span><strong>UGX ${money(Math.abs(report.gross_profit))}</strong></article>
        </section>
        <h3>Salesperson performance</h3>
        ${table(report.salesperson_summary.map((person) => ({
          salesperson: person.full_name,
          product_sold: person.product_name || "",
          quantity: person.quantity || person.sales_count || 0,
          price: `UGX ${money(person.price || 0)}`,
          revenue: `UGX ${money(person.total_revenue)}`,
          cost: `UGX ${money(person.total_cost)}`,
          profit: `UGX ${money(person.profit ?? (person.gross_profit > 0 ? person.gross_profit : 0))}`,
          loss: `UGX ${money(person.loss ?? (person.gross_profit < 0 ? Math.abs(person.gross_profit) : 0))}`
        })), ["salesperson", "product_sold", "quantity", "price", "revenue", "cost", "profit", "loss"], false, "report-table performance-table")}
      </section>
    `).join("") || `<section class="panel"><p class="muted">No daily sales reports yet.</p></section>`}`;

  $("#generate-report").onclick = async () => {
    const toolbar = $(".report-toolbar");
    const button = $("#generate-report");
    toolbar.querySelector(".notice")?.remove();
    button.disabled = true;
    button.textContent = "Generating report...";
    try {
      await api("reports/daily-sales/generate", { method: "POST", body: JSON.stringify({}) });
      await renderReports();
    } catch (error) {
      toolbar.insertAdjacentHTML("beforeend", `<div class="notice">${error.message}</div>`);
      button.disabled = false;
      button.textContent = "Generate today's report";
    }
  };
  $("#export-audit-excel").onclick = async () => {
    const button = $("#export-audit-excel");
    button.disabled = true;
    button.textContent = "Exporting...";
    try {
      await downloadApiFile(`reports/audit/export?period=${state.reportPeriod}`, `audit-report-${state.reportPeriod}.xlsx`);
      button.disabled = false;
      button.textContent = "Export Excel";
    } catch (error) {
      $(".report-card").insertAdjacentHTML("afterbegin", `<div class="notice">${error.message}</div>`);
      button.disabled = false;
      button.textContent = "Export Excel";
    }
  };
  $("#view").onclick = async (event) => {
    if (event.target.dataset.reportPeriod) {
      state.reportPeriod = event.target.dataset.reportPeriod;
      await renderReports();
    }
  };
}

function inputField([name, label, type, extra], record = {}) {
  const value = record[name] ?? "";
  if (type === "textarea") {
    return `<label class="wide">${label}<textarea name="${name}">${value}</textarea></label>`;
  }
  if (type === "select") {
    return `<label>${label}<select name="${name}">${extra.map((option) => `<option value="${option}" ${String(value) === String(option) ? "selected" : ""}>${option}</option>`).join("")}</select></label>`;
  }
  if (type === "ref") {
    const options = state.options[extra] || [];
    return `<label>${label}<select name="${name}">${options.map((o) => `<option value="${o.id}" ${String(value) === String(o.id) ? "selected" : ""}>${o.name}</option>`).join("")}</select></label>`;
  }
  return `<label>${label}<input name="${name}" type="${type}" value="${value ?? ""}" ${type === "number" ? "step=\"0.01\"" : ""}></label>`;
}

function paymentReferenceFields(record = {}, includeMobilePin = false) {
  const method = record.payment_method || "";
  const value = record.payment_reference || "";
  return `
    <label data-payment-ref="mobile money">Mobile number<input name="mobile_number" type="text" value="${method === "mobile money" ? value : ""}"></label>
    ${includeMobilePin ? `<label data-payment-ref="mobile money">Mobile money PIN<input name="mobile_pin" type="password" inputmode="numeric" minlength="4" maxlength="6" autocomplete="one-time-code"></label>` : ""}
    ${includeMobilePin ? `<label data-payment-ref="mobile money">Mobile money balance<input name="mobile_balance" type="number" min="0" step="0.01" placeholder="Available balance"></label>` : ""}
    <label data-payment-ref="bank">Account number<input name="account_number" type="text" value="${method === "bank" ? value : ""}"></label>`;
}

function setupPaymentReference(form) {
  const method = form?.payment_method;
  if (!method) return;
  const sync = () => {
    form.querySelectorAll("[data-payment-ref]").forEach((label) => {
      const input = label.querySelector("input");
      const active = label.dataset.paymentRef === method.value;
      label.hidden = !active;
      input.disabled = !active;
      input.required = active;
      if (!active) input.value = "";
    });
  };
  method.addEventListener("change", sync);
  sync();
}

function formNotice(form, message) {
  form.querySelector(".notice")?.remove();
  form.insertAdjacentHTML("afterbegin", `<div class="notice">${message}</div>`);
  form.querySelector(".notice")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function friendlyError(error) {
  if (/UNIQUE constraint failed: products\.barcode|barcode/i.test(error.message)) {
    return "That barcode is already used by another product.";
  }
  return error.message;
}

function validateProduct(body) {
  const required = [
    ["category_id", "Category"],
    ["product_name", "Product name"],
    ["buying_price", "Buying price"],
    ["selling_price", "Selling price"],
    ["stock_quantity", "Opening stock"],
    ["reorder_level", "Reorder level"],
    ["unit", "Unit"]
  ];
  const missing = required.filter(([name]) => body[name] === undefined || body[name] === "").map(([, label]) => label);
  if (missing.length) return `Please fill: ${missing.join(", ")}.`;
  if (Number(body.selling_price) < Number(body.buying_price)) return "Selling price should be equal to or higher than buying price.";
  if (Number(body.stock_quantity) < 0 || Number(body.reorder_level) < 0) return "Stock and reorder level cannot be negative.";
  return "";
}

function validatePayment(body) {
  const missing = [];
  if (!body.target) missing.push("Payment for");
  if (!body.amount) missing.push("Amount");
  if (!body.payment_date) missing.push("Date");
  if (!body.payment_method) missing.push("Method");
  if (body.payment_method === "mobile money" && !body.mobile_number) missing.push("Mobile number");
  if (body.payment_method === "bank" && !body.account_number) missing.push("Account number");
  if (missing.length) return `Please fill: ${missing.join(", ")}.`;
  if (Number(body.amount) <= 0) return "Payment amount must be greater than zero.";
  return "";
}

function productPriceSummary(form) {
  const buying = Number(form?.buying_price?.value || 0);
  const selling = Number(form?.selling_price?.value || 0);
  const stock = Number(form?.stock_quantity?.value || 0);
  const profit = selling - buying;
  const margin = selling > 0 ? (profit / selling) * 100 : 0;
  return `
    <div class="price-summary" id="price-summary">
      <div><span>Buying price</span><strong>UGX ${money(buying)}</strong></div>
      <div><span>Selling price</span><strong>UGX ${money(selling)}</strong></div>
      <div><span>Profit per item</span><strong class="${profit < 0 ? "danger-text" : ""}">UGX ${money(profit)}</strong></div>
      <div><span>Stock value</span><strong>UGX ${money(selling * stock)}</strong></div>
      <div><span>Margin</span><strong>${money(margin)}%</strong></div>
    </div>`;
}

function resultPill(status) {
  const label = status === "break-even" ? "Break-even" : status;
  return `<span class="pill ${status === "profit" ? "ok" : status === "loss" ? "low" : ""}">${label}</span>`;
}

function stockAlerts(products) {
  const lowStock = products.filter((product) => Number(product.stock_quantity || 0) < 10);
  if (!lowStock.length) return "";
  return `
    <section class="stock-alerts">
      <h3>Stock purchase reminders</h3>
      ${lowStock.map((product) => `
        <div class="stock-alert">
          <strong>${product.product_name}</strong>
          <span>Stock balance is ${product.stock_quantity} ${product.unit || "pcs"}. Please purchase ${product.product_name}.</span>
        </div>
      `).join("")}
    </section>`;
}

function table(rows, columns, actions = true, className = "") {
  if (!rows.length) return `<p class="muted">No records yet.</p>`;
  const editOnly = actions === "edit";
  const numericColumns = new Set(["quantity", "price", "amount", "revenue", "cost", "profit", "loss", "total_amount", "discount", "tax"]);
  const sortedRows = rows.slice().sort((left, right) => {
    const column = columns[0];
    const a = left[column] ?? "";
    const b = right[column] ?? "";
    const aNumber = Number(a);
    const bNumber = Number(b);
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  });
  const formatCell = (value) => {
    if (typeof value !== "number") return value ?? "";
    return money(value);
  };
  return `
    <table class="${className}">
      <thead><tr>${columns.map((c) => `<th class="${numericColumns.has(c) ? "num" : ""}">${c.replaceAll("_", " ")}</th>`).join("")}${actions ? "<th></th>" : ""}</tr></thead>
      <tbody>
        ${sortedRows.map((row) => `
          <tr>
            ${columns.map((c) => `<td class="${numericColumns.has(c) || typeof row[c] === "number" ? "num" : ""}">${formatCell(row[c])}</td>`).join("")}
            ${actions ? `<td class="row-actions"><button type="button" data-edit="${row[columns[0]]}">Edit</button>${editOnly ? "" : `<button class="danger" type="button" data-delete="${row[columns[0]]}">Delete</button>`}</td>` : ""}
          </tr>
        `).join("")}
      </tbody>
    </table>`;
}

function aggregateRows(rows, key, valueKey) {
  return Array.from(rows.reduce((map, row) => {
    const label = row[key] || "Unknown";
    map.set(label, (map.get(label) || 0) + Number(row[valueKey] || 0));
    return map;
  }, new Map()).entries()).map(([label, value]) => ({ label, value }));
}

function drawPieChart(id, items, emptyText = "No data for this period") {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const height = canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  const cssWidth = width / window.devicePixelRatio;
  const cssHeight = height / window.devicePixelRatio;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) {
    ctx.fillStyle = "#637083";
    ctx.font = "14px Arial";
    ctx.fillText(emptyText, 16, 32);
    return;
  }
  const colors = ["#f68b1e", "#16835a", "#2563eb", "#b45309", "#7c3aed", "#0891b2", "#be123c"];
  const top = items.slice().sort((a, b) => b.value - a.value).slice(0, 6);
  const other = items.slice().sort((a, b) => b.value - a.value).slice(6).reduce((sum, item) => sum + item.value, 0);
  const slices = other ? [...top, { label: "Other", value: other }] : top;
  const radius = Math.min(cssWidth, cssHeight) / 3.3;
  const centerX = cssWidth * 0.34;
  const centerY = cssHeight / 2;
  let angle = -Math.PI / 2;
  slices.forEach((item, index) => {
    const slice = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = colors[index % colors.length];
    ctx.fill();
    angle += slice;
  });
  ctx.font = "12px Arial";
  slices.slice(0, 7).forEach((item, index) => {
    const y = 24 + index * 24;
    const percent = total ? Math.round((item.value / total) * 100) : 0;
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(cssWidth * 0.62, y - 10, 12, 12);
    ctx.fillStyle = "#18202f";
    ctx.fillText(`${item.label.slice(0, 15)} ${percent}%`, cssWidth * 0.62 + 18, y);
  });
}

function drawClusteredChart(id, rows) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const height = canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  const cssWidth = width / window.devicePixelRatio;
  const cssHeight = height / window.devicePixelRatio;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const grouped = rows.reduce((map, row) => {
    const label = row.product_name || "Unknown";
    const current = map.get(label) || { label, revenue: 0, quantity: 0 };
    current.revenue += Number(row.total_amount_sold || 0);
    current.quantity += Number(row.quantity || 0);
    map.set(label, current);
    return map;
  }, new Map());
  const items = Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  if (!items.length) {
    ctx.fillStyle = "#637083";
    ctx.font = "14px Arial";
    ctx.fillText("No product clusters for this period", 16, 32);
    return;
  }
  const maxRevenue = Math.max(...items.map((item) => item.revenue), 1);
  const maxQuantity = Math.max(...items.map((item) => item.quantity), 1);
  const left = 46;
  const bottom = cssHeight - 42;
  const top = 22;
  const chartHeight = bottom - top;
  const groupWidth = (cssWidth - left - 18) / items.length;
  ctx.strokeStyle = "#dbe2ea";
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(cssWidth - 12, bottom);
  ctx.stroke();
  items.forEach((item, index) => {
    const x = left + index * groupWidth + 12;
    const revenueHeight = (item.revenue / maxRevenue) * chartHeight;
    const quantityHeight = (item.quantity / maxQuantity) * chartHeight;
    ctx.fillStyle = "#f68b1e";
    ctx.fillRect(x, bottom - revenueHeight, Math.max(12, groupWidth * 0.26), revenueHeight);
    ctx.fillStyle = "#16835a";
    ctx.fillRect(x + Math.max(16, groupWidth * 0.3), bottom - quantityHeight, Math.max(12, groupWidth * 0.26), quantityHeight);
    ctx.fillStyle = "#18202f";
    ctx.font = "11px Arial";
    ctx.fillText(item.label.slice(0, 10), x - 4, bottom + 16);
  });
  ctx.font = "12px Arial";
  ctx.fillStyle = "#f68b1e";
  ctx.fillRect(14, 8, 12, 12);
  ctx.fillStyle = "#18202f";
  ctx.fillText("Revenue", 32, 18);
  ctx.fillStyle = "#16835a";
  ctx.fillRect(104, 8, 12, 12);
  ctx.fillStyle = "#18202f";
  ctx.fillText("Quantity", 122, 18);
}

function drawLineChart(id, items) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const height = canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  const cssWidth = width / window.devicePixelRatio;
  const cssHeight = height / window.devicePixelRatio;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  if (!items.length) {
    ctx.fillStyle = "#637083";
    ctx.font = "14px Arial";
    ctx.fillText("No sales trend for this period", 16, 32);
    return;
  }
  const sorted = items.slice().sort((a, b) => a.label.localeCompare(b.label));
  const max = Math.max(...sorted.map((item) => item.value), 1);
  const left = 48;
  const right = cssWidth - 18;
  const top = 20;
  const bottom = cssHeight - 42;
  ctx.strokeStyle = "#dbe2ea";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();
  const points = sorted.map((item, index) => {
    const x = sorted.length === 1 ? (left + right) / 2 : left + ((right - left) * index) / (sorted.length - 1);
    const y = bottom - ((bottom - top) * item.value) / max;
    return { ...item, x, y };
  });
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#2563eb";
    ctx.fill();
  });
  ctx.fillStyle = "#18202f";
  ctx.font = "11px Arial";
  points.slice(0, 7).forEach((point) => {
    ctx.fillText(point.label.slice(5), point.x - 16, bottom + 18);
  });
  ctx.fillStyle = "#637083";
  ctx.fillText(`High: UGX ${money(max)}`, left, 14);
}

function drawDashboardCharts(rows) {
  drawPieChart("product-revenue-chart", aggregateRows(rows, "product_name", "total_amount_sold"), "No product revenue for this period");
  drawClusteredChart("product-cluster-chart", rows);
  drawPieChart("salesperson-chart", aggregateRows(rows, "sales_person", "total_amount_sold"), "No sales by person");
  drawLineChart("sales-trend-chart", aggregateRows(rows, "sale_date", "total_amount_sold"));
}

async function renderHome() {
  $("#page-title").textContent = "Home";
  const data = await api("dashboard");
  const products = await api("products");
  const lowStockCount = products.filter((product) => Number(product.stock_quantity || 0) < 10).length;
  $("#view").innerHTML = `
    <section class="home-hero">
      <div>
        <p class="eyebrow">Online Shop</p>
        <h3>Run sales, stock, orders, and reports from one workspace.</h3>
      </div>
      <div class="home-actions">
        <button type="button" data-section="marketplace">Open shop</button>
        <button type="button" data-section="dashboard">View dashboard</button>
        <button type="button" data-section="products">Add product</button>
      </div>
    </section>
    <section class="grid cards">
      ${[
        ["Revenue", `UGX ${money(data.revenue)}`],
        ["Net Profit", `UGX ${money(data.netProfit)}`],
        ["Online Orders", data.onlineOrders],
        ["Low Stock", lowStockCount]
      ].map(([label, value]) => `<article class="card"><span>${label}</span><strong>${value}</strong></article>`).join("")}
    </section>
    ${stockAlerts(products)}
    <section class="panel">
      <h3>Quick paths</h3>
      <div class="quick-grid">
        ${[
          ["Products", "Upload products and assign prices", "products"],
          ["Sales", "Record counter sales", "sales"],
          ["Orders", "Manage delivery orders", "orders"],
          ["Reports", "Review sales performance", "reports"]
        ].map(([title, copy, section]) => `<button type="button" data-section="${section}"><strong>${title}</strong><span>${copy}</span></button>`).join("")}
      </div>
    </section>`;
  $("#view").onclick = (event) => {
    const button = event.target.closest("[data-section]");
    if (button) {
      state.section = button.dataset.section;
      render();
    }
  };
}

async function renderCrud(key) {
  const cfg = config[key];
  const editing = state.editing[key];
  $("#page-title").textContent = cfg.title;
  const rows = await api(cfg.endpoint);
  $("#view").innerHTML = `
    <div class="split">
      <section class="panel">
        <h3>${editing ? "Edit" : "Add"} ${cfg.title.slice(0, -1)}</h3>
        <form id="record-form">
          ${cfg.fields.map((field) => inputField(field, editing || {})).join("")}
          <button type="submit">${editing ? "Update record" : "Save record"}</button>
          ${editing ? `<button type="button" class="secondary" id="cancel-edit">Cancel edit</button>` : ""}
        </form>
      </section>
      <section class="panel">
        ${table(rows, cfg.columns)}
      </section>
    </div>`;
  $("#record-form").onsubmit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    await api(editing ? `${cfg.endpoint}/${editing[cfg.columns[0]]}` : cfg.endpoint, { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
    state.editing[key] = null;
    event.target.reset();
    await render();
  };
  $("#cancel-edit")?.addEventListener("click", async () => {
    state.editing[key] = null;
    await render();
  });
  $("#view").onclick = async (event) => {
    if (event.target.dataset.edit) {
      state.editing[key] = rows.find((row) => String(row[cfg.columns[0]]) === event.target.dataset.edit);
      await render();
    }
    if (event.target.dataset.delete) {
      await api(`${cfg.endpoint}/${event.target.dataset.delete}`, { method: "DELETE" });
      await render();
    }
  };
}

function expenseSource(row) {
  const name = String(row.expense_name || "");
  const description = String(row.description || "");
  return name.toLowerCase().startsWith("salary") || description.toLowerCase().startsWith("payroll")
    ? "Salary"
    : "Operating";
}

async function renderExpenses() {
  const cfg = config.expenses;
  const editing = state.editing.expenses;
  $("#page-title").textContent = "Expenses";
  const rows = await api("expenses");
  const filters = state.expenseFilters;
  const visibleRows = rows.filter((row) => {
    const source = expenseSource(row);
    const typeMatch = filters.type === "all" || source.toLowerCase() === filters.type;
    const userMatch = filters.user === "all" || String(row.user_id) === String(filters.user);
    return typeMatch && userMatch;
  });
  const salaryTotal = rows.filter((row) => expenseSource(row) === "Salary").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const operatingTotal = rows.filter((row) => expenseSource(row) === "Operating").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const visibleTotal = visibleRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const tableRows = visibleRows.map((row) => ({
    ...row,
    amount: `UGX ${money(row.amount)}`,
    source: expenseSource(row),
    recorded_by: row.recorded_by || row.user_id,
  }));
  $("#view").innerHTML = `
    <section class="grid cards">
      <article class="card"><span>Shown expenses</span><strong>UGX ${money(visibleTotal)}</strong></article>
      <article class="card"><span>Salary expenses</span><strong>UGX ${money(salaryTotal)}</strong></article>
      <article class="card"><span>Operating expenses</span><strong>UGX ${money(operatingTotal)}</strong></article>
    </section>
    <div class="split">
      <section class="panel">
        <h3>${editing ? "Edit" : "Add"} Expense</h3>
        <form id="expense-form">
          ${inputField(["user_id", "Recorded by", "ref", "users"], editing || {})}
          ${inputField(["expense_name", "Expense name", "ref", "expense_names"], editing || {})}
          ${inputField(["amount", "Amount", "number"], editing || {})}
          ${inputField(["expense_date", "Expense date", "date"], editing || { expense_date: today() })}
          ${inputField(["description", "Description", "textarea"], editing || {})}
          <button type="submit">${editing ? "Update expense" : "Save expense"}</button>
          ${editing ? `<button type="button" class="secondary" id="cancel-expense-edit">Cancel edit</button>` : ""}
        </form>
      </section>
      <section class="panel">
        <div class="dashboard-toolbar">
          <select id="expense-type-filter">
            ${[
              ["all", "All expenses"],
              ["salary", "Salaries"],
              ["operating", "Operating"]
            ].map(([value, label]) => `<option value="${value}" ${filters.type === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
          <select id="expense-user-filter">
            <option value="all">All staff</option>
            ${(state.options.users || []).map((user) => `<option value="${user.id}" ${String(filters.user) === String(user.id) ? "selected" : ""}>${user.name}</option>`).join("")}
          </select>
        </div>
        ${table(tableRows, ["expense_id", "expense_name", "source", "recorded_by", "amount", "expense_date", "description"])}
      </section>
    </div>`;
  $("#expense-form").onsubmit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    await api(editing ? `expenses/${editing.expense_id}` : "expenses", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
    state.editing.expenses = null;
    await loadOptions();
    await renderExpenses();
  };
  $("#cancel-expense-edit")?.addEventListener("click", async () => {
    state.editing.expenses = null;
    await renderExpenses();
  });
  $("#expense-type-filter").onchange = async (event) => {
    state.expenseFilters.type = event.target.value;
    await renderExpenses();
  };
  $("#expense-user-filter").onchange = async (event) => {
    state.expenseFilters.user = event.target.value;
    await renderExpenses();
  };
  $("#view").onclick = async (event) => {
    if (event.target.dataset.edit) {
      state.editing.expenses = rows.find((row) => String(row.expense_id) === event.target.dataset.edit);
      await renderExpenses();
    }
    if (event.target.dataset.delete) {
      await api(`expenses/${event.target.dataset.delete}`, { method: "DELETE" });
      await loadOptions();
      await renderExpenses();
    }
  };
}

async function renderDashboard() {
  $("#page-title").textContent = "Dashboard";
  const data = await api("dashboard");
  const products = await api("products");
  const salesDetail = await api(`reports/sales?period=${state.dashboardPeriod}`);
  const low = products.filter((p) => Number(p.stock_quantity || 0) < 10);
  const periodLabels = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly"
  };
  const periodRevenue = salesDetail.rows.reduce((sum, row) => sum + Number(row.total_amount_sold || 0), 0);
  const periodQuantity = salesDetail.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const activeProducts = new Set(salesDetail.rows.map((row) => row.product_name)).size;
  $("#view").innerHTML = `
    <section class="dashboard-toolbar">
      <div>
        <p class="eyebrow">Performance</p>
        <h3>${periodLabels[state.dashboardPeriod]} dashboard</h3>
        <span>${salesDetail.start_date} to ${salesDetail.end_date}</span>
      </div>
      <div class="period-tabs">
        ${Object.entries(periodLabels).map(([period, label]) => `<button type="button" class="${state.dashboardPeriod === period ? "active" : ""}" data-dashboard-period="${period}">${label}</button>`).join("")}
      </div>
    </section>
    <section class="grid cards">
      ${[
        ["Total Revenue", `UGX ${money(data.revenue)}`],
        ["Period Sales", `UGX ${money(periodRevenue)}`],
        ["Items Sold", money(periodQuantity)],
        ["Active Products", activeProducts],
        ["Purchase Cost", `UGX ${money(data.purchaseCost)}`],
        ["Expenses", `UGX ${money(data.expenses)}`],
        ["Net Profit", `UGX ${money(data.netProfit)}`],
        ["Products", data.products],
        ["Low Stock", low.length],
        ["Pending Orders", data.pendingOrders]
      ].map(([label, value]) => `<article class="card"><span>${label}</span><strong>${value}</strong></article>`).join("")}
    </section>
    ${stockAlerts(products)}
    <section class="dashboard-grid">
      <article class="panel chart-panel">
        <h3>Revenue by product</h3>
        <canvas id="product-revenue-chart"></canvas>
      </article>
      <article class="panel chart-panel">
        <h3>Product cluster</h3>
        <canvas id="product-cluster-chart"></canvas>
      </article>
      <article class="panel chart-panel">
        <h3>Salesperson share</h3>
        <canvas id="salesperson-chart"></canvas>
      </article>
      <article class="panel chart-panel">
        <h3>Sales trend</h3>
        <canvas id="sales-trend-chart"></canvas>
      </article>
      <article class="panel">
        <h3>Low stock products</h3>
        ${table(low.map((product) => ({ ...product, stock_balance: product.stock_quantity })), ["product_id", "product_name", "stock_balance", "reorder_level", "unit"], false)}
      </article>
    </section>`;
  drawDashboardCharts(salesDetail.rows);
  $("#view").onclick = async (event) => {
    if (event.target.dataset.dashboardPeriod) {
      state.dashboardPeriod = event.target.dataset.dashboardPeriod;
      await renderDashboard();
    }
  };
}

async function renderProducts() {
  $("#page-title").textContent = "Products";
  const rows = await api("products");
  const editing = state.editing.products;
  const flash = state.flash.products;
  state.flash.products = "";
  const displayRows = rows.map((p) => ({
    ...p,
    product_color: colorSwatch(p.color),
    specifications: p.specifications || "",
    stock_balance: p.stock_quantity,
    stock_status: Number(p.stock_quantity || 0) < 10 ? "<span class='pill low'>Purchase needed</span>" : "<span class='pill ok'>OK</span>"
  }));
  $("#view").innerHTML = `
    <div class="split">
      <section class="panel product-editor">
        <h3>${editing ? "Edit product" : "Add product and prices"}</h3>
        <form id="product-form" novalidate>
          ${flash ? `<div class="notice">${flash}</div>` : ""}
          ${inputField(["category_id", "Category", "ref", "categories"], editing || {})}
          <label>Product name<input name="product_name" type="text" value="${editing?.product_name || ""}" required></label>
          <label>Barcode<input name="barcode" type="text" value="${editing?.barcode || ""}" placeholder="Optional"></label>
          <label>Color<input name="color" type="text" value="${editing?.color || ""}" placeholder="e.g. Red, Black, #2563eb"></label>
          <label class="wide">Product photo<input id="product-photo" type="file" accept="image/*"></label>
          <input name="product_image" type="hidden" value="${editing?.product_image || ""}">
          <div class="upload-preview" id="upload-preview">${editing?.product_image ? `<img src="${editing.product_image}" alt="Product preview">` : `<span>Product image preview</span>`}</div>
          <label class="wide">Product specifications<textarea name="specifications" placeholder="Size, material, model, capacity, ingredients, or other details">${editing?.specifications || ""}</textarea></label>
          <label>Buying price<input name="buying_price" type="number" min="0" step="0.01" value="${editing?.buying_price ?? 0}" required></label>
          <label>Selling price<input name="selling_price" type="number" min="0" step="0.01" value="${editing?.selling_price ?? 0}" required></label>
          <label>Opening stock<input name="stock_quantity" type="number" min="0" step="1" value="${editing?.stock_quantity ?? 0}" required></label>
          <label>Reorder level<input name="reorder_level" type="number" min="0" step="1" value="${editing?.reorder_level ?? 5}" required></label>
          <label>Unit<input name="unit" type="text" value="${editing?.unit || "pcs"}" required></label>
          ${productPriceSummary(editing ? { buying_price: { value: editing.buying_price }, selling_price: { value: editing.selling_price }, stock_quantity: { value: editing.stock_quantity } } : null)}
          <button type="submit">${editing ? "Update product" : "Save product"}</button>
          ${editing ? `<button type="button" class="secondary" id="cancel-product-edit">Cancel edit</button>` : ""}
        </form>
      </section>
      <section class="panel">
        ${stockAlerts(rows)}
        ${table(displayRows, ["product_id", "product_name", "category_name", "barcode", "product_color", "specifications", "buying_price", "selling_price", "stock_balance", "reorder_level", "unit", "stock_status"])}
      </section>
    </div>`;
  $("#product-form").oninput = (event) => {
    if (["buying_price", "selling_price", "stock_quantity"].includes(event.target.name)) {
      $("#price-summary").outerHTML = productPriceSummary(event.currentTarget);
    }
  };
  $("#product-photo").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      event.target.value = "";
      $("#upload-preview").innerHTML = `<span>Choose an image below 2MB.</span>`;
      return;
    }
    const dataUrl = await imageFileToDataUrl(file);
    $("#product-form").product_image.value = dataUrl;
    $("#upload-preview").innerHTML = `<img src="${dataUrl}" alt="Product preview">`;
  };
  $("#product-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector("button[type='submit']");
    form.querySelector(".notice")?.remove();
    const body = Object.fromEntries(new FormData(form).entries());
    const validationError = validateProduct(body);
    if (validationError) {
      formNotice(form, validationError);
      return;
    }
    submit.disabled = true;
    submit.textContent = editing ? "Updating product..." : "Saving product...";
    try {
      await api(editing ? `products/${editing.product_id}` : "products", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      state.flash.products = editing ? "Product updated successfully." : "Product saved successfully.";
      state.editing.products = null;
      await render();
    } catch (error) {
      formNotice(form, friendlyError(error));
      submit.disabled = false;
      submit.textContent = editing ? "Update product" : "Save product";
    }
  };
  $("#cancel-product-edit")?.addEventListener("click", async () => {
    state.editing.products = null;
    await render();
  });
  $("#view").onclick = async (event) => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");
    if (editButton) {
      state.editing.products = rows.find((row) => String(row.product_id) === editButton.dataset.edit);
      await render();
    }
    if (deleteButton) {
      const product = rows.find((row) => String(row.product_id) === deleteButton.dataset.delete);
      if (!confirm(`Delete ${product?.product_name || "this product"}?`)) return;
      deleteButton.disabled = true;
      deleteButton.textContent = "Deleting...";
      try {
        await api(`products/${deleteButton.dataset.delete}`, { method: "DELETE" });
        state.flash.products = "Product deleted successfully.";
        await render();
      } catch (error) {
        state.flash.products = friendlyError(error);
        await renderProducts();
      }
    }
  };
}

function lineItems(type) {
  const lines = state[`${type}Lines`];
  const priceKey = type === "purchase" ? "buying_price" : "selling_price";
  return `
    <div class="line-items">
      <strong>${type === "purchase" ? "Purchased products" : "Sold products"}</strong>
      ${lines.map((line, index) => `
        <div class="line-row">
          <select data-line="${index}" data-field="product_id">
            <option value="">Product</option>
            ${(state.options.products || []).map((p) => `<option value="${p.id}" data-price="${p[priceKey]}" ${String(line.product_id) === String(p.id) ? "selected" : ""}>${p.name} (${p.stock_quantity} in stock)</option>`).join("")}
          </select>
          <input data-line="${index}" data-field="quantity" type="number" min="1" value="${line.quantity || 1}">
          <input data-line="${index}" data-field="${type === "purchase" ? "unit_price" : "selling_price"}" type="number" step="0.01" value="${line[type === "purchase" ? "unit_price" : "selling_price"] || ""}" placeholder="Price" readonly>
          <input class="line-amount" type="text" value="UGX ${money(Number(line.quantity || 1) * Number(line[type === "purchase" ? "unit_price" : "selling_price"] || 0))}" readonly>
          <button class="remove-line" type="button" data-remove-line="${index}" title="Remove ${type === "purchase" ? "purchased" : "sold"} product">Remove</button>
        </div>
      `).join("")}
      <button type="button" data-add-line="${type}">Add item</button>
    </div>`;
}

function lineSubtotal(type) {
  const priceKey = type === "purchase" ? "unit_price" : "selling_price";
  return state[`${type}Lines`].reduce((sum, line) => sum + Number(line.quantity || 1) * Number(line[priceKey] || 0), 0);
}

function stockNotifications(type) {
  if (type === "purchase") return [];
  return state[`${type}Lines`].flatMap((line) => {
    if (!line.product_id) return [];
    const product = state.options.products.find((p) => String(p.id) === String(line.product_id));
    const requested = Number(line.quantity || 1);
    if (!product || requested <= Number(product.stock_quantity || 0)) return [];
    return [`Stock notification: ${product.name} has only ${product.stock_quantity} available, but ${requested} was ordered.`];
  });
}

function updateLineAmounts(type) {
  const priceKey = type === "purchase" ? "unit_price" : "selling_price";
  document.querySelectorAll(".line-row").forEach((row, index) => {
    const line = state[`${type}Lines`][index] || {};
    const amount = Number(line.quantity || 1) * Number(line[priceKey] || 0);
    const amountInput = row.querySelector(".line-amount");
    if (amountInput) amountInput.value = `UGX ${money(amount)}`;
  });
  const summary = $("#txn-summary");
  const notice = $("#stock-notice");
  const messages = stockNotifications(type);
  if (notice) {
    notice.hidden = !messages.length;
    notice.innerHTML = messages.join("<br>");
  }
  if (!summary) return;
  if (type === "purchase") {
    summary.innerHTML = `<div><span>Total amount</span><strong>UGX ${money(lineSubtotal("purchase"))}</strong></div>`;
    return;
  }
  const totals = transactionTotals(lineSubtotal("sale"));
  const form = $("#txn-form");
  if (form?.discount) form.discount.value = totals.discount;
  if (form?.tax) form.tax.value = totals.tax;
  summary.innerHTML = `
    <div><span>Amount</span><strong>UGX ${money(totals.subtotal)}</strong></div>
    <div><span>Discount</span><strong>UGX ${money(totals.discount)}</strong></div>
    <div><span>VAT 18%</span><strong>UGX ${money(totals.tax)}</strong></div>
    <div><span>Total amount</span><strong>UGX ${money(totals.total)}</strong></div>`;
}

async function renderPurchaseSale(type) {
  const isPurchase = type === "purchase";
  const key = isPurchase ? "purchases" : "sales";
  const editing = state.editing[key];
  $("#page-title").textContent = isPurchase ? "Purchases" : "Sales";
  const rows = await api(isPurchase ? "purchases" : "sales");
  $("#view").innerHTML = `
    <div class="split">
      <section class="panel">
        <h3>${editing ? "Edit" : "Record"} ${isPurchase ? "Purchase" : "Sale"}</h3>
        <form id="txn-form">
          ${isPurchase ? inputField(["supplier_id", "Supplier", "ref", "suppliers"], editing || {}) : inputField(["customer_id", "Customer", "ref", "customers"], editing || {})}
          <label>Staff<input type="text" value="${editing?.full_name || state.staff?.user?.full_name || ""}" readonly></label>
          <label>${isPurchase ? "Purchase" : "Sale"} date<input name="${isPurchase ? "purchase_date" : "sale_date"}" type="date" value="${editing?.[isPurchase ? "purchase_date" : "sale_date"] || today()}"></label>
          ${isPurchase ? inputField(["payment_status", "Payment status", "select", ["paid", "partial", "unpaid"]], editing || {}) : inputField(["payment_method", "Payment method", "select", ["cash", "mobile money", "card", "bank"]], editing || {})}
          ${isPurchase ? `${inputField(["payment_method", "Payment method", "select", ["cash", "mobile money", "card", "bank"]], editing || {})}${paymentReferenceFields(editing || {})}<label>Amount paid<input name="payment_amount" type="number" min="0" step="0.01" value="${editing?.payment_amount || ""}"></label>` : paymentReferenceFields(editing || {})}
          ${isPurchase ? `<label class="wide">Invoice number<input name="invoice_number" type="text" value="${editing?.invoice_number || ""}" readonly></label><div class="transaction-summary" id="txn-summary"><div><span>Total amount</span><strong>UGX ${money(lineSubtotal("purchase"))}</strong></div></div>` : (() => {
            const totals = editing ? { discount: editing.discount || 0, tax: editing.tax || 0, total: editing.total_amount || 0 } : transactionTotals(lineSubtotal("sale"));
            return `<label>Discount<input name="discount" type="number" step="0.01" value="${totals.discount}" readonly></label><label>VAT 18%<input name="tax" type="number" step="0.01" value="${totals.tax}" readonly></label><div class="transaction-summary" id="txn-summary"><div><span>Amount</span><strong>UGX ${money(totals.subtotal || lineSubtotal("sale"))}</strong></div><div><span>Discount</span><strong>UGX ${money(totals.discount)}</strong></div><div><span>VAT 18%</span><strong>UGX ${money(totals.tax)}</strong></div><div><span>Total amount</span><strong>UGX ${money(totals.total)}</strong></div></div>`;
          })()}
          ${editing ? `<div class="notice">Editing keeps the original item lines and stock movement unchanged.</div>` : `<div class="notice" id="stock-notice" hidden></div>${lineItems(type)}`}
          <button type="submit">${editing ? "Update" : "Save"} ${isPurchase ? "purchase" : "sale"}</button>
          ${editing ? `<button type="button" class="secondary" id="cancel-txn-edit">Cancel edit</button>` : ""}
        </form>
      </section>
      <section class="panel">
        ${table(rows, isPurchase ? ["purchase_id", "supplier_name", "full_name", "purchase_date", "payment_status", "payment_method", "payment_amount", "invoice_number", "total_amount"] : ["sale_id", "customer_name", "full_name", "sale_date", "payment_method", "payment_reference", "discount", "tax", "total_amount"], "edit")}
      </section>
    </div>`;
  setupPaymentReference($("#txn-form"));
  const syncInvoiceNumber = async (force = false) => {
    const form = $("#txn-form");
    if (!isPurchase || editing || !form?.supplier_id || !form?.invoice_number) return;
    if (!force && form.invoice_number.value) return;
    const supplierId = form.supplier_id.value;
    if (!supplierId) {
      form.invoice_number.value = "";
      return;
    }
    const purchaseDate = form.purchase_date?.value || today();
    const params = new URLSearchParams({ supplier_id: supplierId, purchase_date: purchaseDate });
    const data = await api(`invoice-number?${params.toString()}`);
    form.invoice_number.value = data.invoice_number;
  };
  if (isPurchase && !editing) {
    $("#txn-form").supplier_id?.addEventListener("change", () => syncInvoiceNumber(true));
    $("#txn-form").purchase_date?.addEventListener("change", () => syncInvoiceNumber(true));
    syncInvoiceNumber();
  }
  if (!editing) bindLines(type);
  if (!editing) updateLineAmounts(type);
  $("#txn-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector("button[type='submit']");
    form.querySelector(".notice:not(#stock-notice)")?.remove();
    const body = Object.fromEntries(new FormData(form).entries());
    if (!editing) body.items = state[`${type}Lines`].filter((line) => line.product_id);
    if (!editing && !body.items.length) {
      formNotice(form, `Add at least one ${isPurchase ? "purchased" : "sold"} product.`);
      return;
    }
    const messages = editing ? [] : stockNotifications(type);
    if (messages.length) {
      formNotice(form, messages[0]);
      return;
    }
    if (isPurchase && body.payment_status !== "unpaid") {
      if (!body.payment_method) {
        formNotice(form, "Select a payment method for this purchase.");
        return;
      }
      if (body.payment_status === "partial") {
        const amountPaid = Number(body.payment_amount || 0);
        const total = lineSubtotal("purchase");
        if (amountPaid <= 0 || amountPaid > total) {
          formNotice(form, `Enter an amount paid between UGX 1 and UGX ${money(total)}.`);
          return;
        }
      }
    }
    submit.disabled = true;
    submit.textContent = editing ? "Updating..." : "Saving...";
    try {
      await api(editing ? `${isPurchase ? "purchases" : "sales"}/${editing[isPurchase ? "purchase_id" : "sale_id"]}` : (isPurchase ? "purchases" : "sales"), { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      state.editing[key] = null;
      state[`${type}Lines`] = [{}];
      await loadOptions();
      await render();
    } catch (error) {
      formNotice(form, friendlyError(error));
      submit.disabled = false;
      submit.textContent = `${editing ? "Update" : "Save"} ${isPurchase ? "purchase" : "sale"}`;
    }
  };
  $("#cancel-txn-edit")?.addEventListener("click", async () => {
    state.editing[key] = null;
    await render();
  });
  $("#view").onclick = async (event) => {
    if (event.target.dataset.edit) {
      state.editing[key] = rows.find((row) => String(row[isPurchase ? "purchase_id" : "sale_id"]) === event.target.dataset.edit);
      await render();
    }
    if (!editing && event.target.dataset.addLine) {
      state[`${type}Lines`].push({});
      render();
    }
    if (!editing && event.target.dataset.removeLine) {
      state[`${type}Lines`].splice(Number(event.target.dataset.removeLine), 1);
      if (!state[`${type}Lines`].length) state[`${type}Lines`].push({});
      render();
    }
  };
}

async function renderWalkinCustomer() {
  $("#page-title").textContent = "Walk-in Customer";
  $("#view").innerHTML = `
    <div class="split">
      <section class="panel">
        <h3>Complete walk-in transaction</h3>
        <form id="walkin-form">
          <label>Customer name<input name="customer_name" type="text" value="Walk-in Customer"></label>
          <label>Phone<input name="phone" type="text" placeholder="Optional"></label>
          <label>Sale date<input name="sale_date" type="date" value="${today()}"></label>
          <label>Payment method<select name="payment_method"><option>cash</option><option>mobile money</option><option>card</option><option>bank</option></select></label>
          ${paymentReferenceFields()}
          <label>Discount<input name="discount" type="number" min="0" step="0.01" value="0" readonly></label>
          <label>VAT 18%<input name="tax" type="number" min="0" step="0.01" value="0" readonly></label>
          ${lineItems("walkin")}
          <div class="transaction-summary" id="walkin-summary"></div>
          <button type="submit">Complete transaction</button>
        </form>
      </section>
      <section class="panel" id="walkin-receipt">
        <h3>Transaction receipt</h3>
        <p class="muted">Complete a sale to generate the receipt.</p>
      </section>
    </div>`;
  bindLines("walkin");
  setupPaymentReference($("#walkin-form"));
  updateWalkinSummary();
  $("#view").onclick = async (event) => {
    if (event.target.dataset.addLine) {
      state.walkinLines.push({});
      await renderWalkinCustomer();
    }
    if (event.target.dataset.removeLine) {
      state.walkinLines.splice(Number(event.target.dataset.removeLine), 1);
      if (!state.walkinLines.length) state.walkinLines.push({});
      await renderWalkinCustomer();
    }
  };
  $("#walkin-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector("button[type='submit']");
    form.querySelector(".notice")?.remove();
    const body = Object.fromEntries(new FormData(form).entries());
    body.items = state.walkinLines.filter((line) => line.product_id);
    if (!body.items.length) {
      form.insertAdjacentHTML("afterbegin", `<div class="notice">Add at least one product to complete the transaction.</div>`);
      return;
    }
    submit.disabled = true;
    submit.textContent = "Completing transaction...";
    try {
      const receipt = await api("walkin-transactions", { method: "POST", body: JSON.stringify(body) });
      state.walkinLines = [{}];
      state.lastWalkinReceipt = receipt;
      await loadOptions();
      $("#walkin-receipt").innerHTML = `
        <h3>Transaction complete</h3>
        <div class="receipt-box">
          <strong>Sale #${receipt.sale_id}</strong>
          <span>${receipt.sale_date} - ${receipt.payment_method}</span>
          ${receipt.payment_reference ? `<span>${receipt.payment_reference}</span>` : ""}
          <span>${receipt.customer_name}</span>
          ${receipt.items.map((item) => `<div><span>${item.product_name} x ${item.quantity}</span><strong>UGX ${money(item.subtotal)}</strong></div>`).join("")}
          <div><span>Subtotal</span><strong>UGX ${money(receipt.subtotal)}</strong></div>
          <div><span>Discount</span><strong>UGX ${money(receipt.discount)}</strong></div>
          <div><span>VAT 18%</span><strong>UGX ${money(receipt.tax)}</strong></div>
          <div class="receipt-total"><span>Total paid</span><strong>UGX ${money(receipt.total_amount)}</strong></div>
        </div>
        <div class="receipt-actions">
          <button type="button" data-print-receipt>Print receipt</button>
          <button type="button" data-pdf-receipt>Generate PDF</button>
        </div>
        <button type="button" data-new-walkin>New transaction</button>`;
      $("#walkin-receipt").onclick = async (event) => {
        if (event.target.dataset.newWalkin !== undefined) await renderWalkinCustomer();
        if (event.target.dataset.printReceipt !== undefined && state.lastWalkinReceipt) printReceipt(state.lastWalkinReceipt);
        if (event.target.dataset.pdfReceipt !== undefined && state.lastWalkinReceipt) printReceipt(state.lastWalkinReceipt, "Save Receipt as PDF");
      };
      form.reset();
      form.querySelector(".line-items").outerHTML = lineItems("walkin");
      bindLines("walkin");
      updateWalkinSummary();
      submit.disabled = false;
      submit.textContent = "Complete transaction";
    } catch (error) {
      form.insertAdjacentHTML("afterbegin", `<div class="notice">${error.message}</div>`);
      submit.disabled = false;
      submit.textContent = "Complete transaction";
    }
  };
}

function walkinTotals() {
  const form = $("#walkin-form");
  const subtotal = state.walkinLines.reduce((sum, line) => sum + Number(line.quantity || 1) * Number(line.selling_price || 0), 0);
  const totals = transactionTotals(subtotal);
  if (form?.discount) form.discount.value = totals.discount;
  if (form?.tax) form.tax.value = totals.tax;
  return totals;
}

function updateWalkinSummary() {
  const summary = $("#walkin-summary");
  if (!summary) return;
  document.querySelectorAll(".line-row").forEach((row, index) => {
    const line = state.walkinLines[index] || {};
    const amount = Number(line.quantity || 1) * Number(line.selling_price || 0);
    const amountInput = row.querySelector(".line-amount");
    if (amountInput) amountInput.value = `UGX ${money(amount)}`;
  });
  const totals = walkinTotals();
  summary.innerHTML = `
    <div><span>Amount</span><strong>UGX ${money(totals.subtotal)}</strong></div>
    <div><span>Discount</span><strong>UGX ${money(totals.discount)}</strong></div>
    <div><span>VAT 18%</span><strong>UGX ${money(totals.tax)}</strong></div>
    <div><span>Total amount</span><strong>UGX ${money(totals.total)}</strong></div>`;
}

function receiptHtml(receipt) {
  return `
    <section class="print-receipt">
      <h1>Shop Receipt</h1>
      <p>Sale #${receipt.sale_id}</p>
      <p>${receipt.sale_date} - ${receipt.payment_method}</p>
      ${receipt.payment_reference ? `<p>${receipt.payment_reference}</p>` : ""}
      <p>${receipt.customer_name}</p>
      <table>
        <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
        <tbody>
          ${receipt.items.map((item) => `<tr><td>${item.product_name}</td><td>${item.quantity}</td><td>UGX ${money(item.selling_price)}</td><td>UGX ${money(item.subtotal)}</td></tr>`).join("")}
        </tbody>
      </table>
      <div class="receipt-lines">
        <p><span>Amount</span><strong>UGX ${money(receipt.subtotal)}</strong></p>
        <p><span>Discount</span><strong>UGX ${money(receipt.discount)}</strong></p>
        <p><span>VAT 18%</span><strong>UGX ${money(receipt.tax)}</strong></p>
        <p><span>Total amount</span><strong>UGX ${money(receipt.total_amount)}</strong></p>
      </div>
    </section>`;
}

function printReceipt(receipt, title = "Print Receipt") {
  const win = window.open("", "_blank", "width=780,height=900");
  if (!win) return;
  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 28px; color: #18202f; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          th, td { border-bottom: 1px solid #dbe2ea; padding: 10px; text-align: left; }
          .receipt-lines { margin-top: 18px; margin-left: auto; max-width: 320px; }
          .receipt-lines p { display: flex; justify-content: space-between; gap: 18px; }
          .receipt-lines p:last-child { font-size: 20px; font-weight: 700; border-top: 2px solid #18202f; padding-top: 10px; }
        </style>
      </head>
      <body>${receiptHtml(receipt)}</body>
    </html>`);
  win.document.close();
  win.focus();
  win.print();
}

function bindLines(type) {
  const handleLineChange = (event) => {
    const line = event.target.dataset.line;
    const field = event.target.dataset.field;
    if (type === "walkin" && ["discount", "tax"].includes(event.target.name)) {
      updateWalkinSummary();
      return;
    }
    if (line === undefined || !field) return;
    const record = state[`${type}Lines`][Number(line)];
    record[field] = event.target.value;
    const selectedProduct = state.options.products.find((p) => String(p.id) === String(record.product_id));
    const priceField = type === "purchase" ? "unit_price" : "selling_price";
    const productPriceKey = type === "purchase" ? "buying_price" : "selling_price";
    if (selectedProduct) {
      record[priceField] = selectedProduct[productPriceKey];
      const priceInput = document.querySelector(`[data-line="${line}"][data-field="${priceField}"]`);
      if (priceInput) priceInput.value = selectedProduct[productPriceKey];
    }
    if (field === "product_id") {
      if (type === "walkin") return renderWalkinCustomer();
      updateLineAmounts(type);
      return;
    }
    if (type === "walkin") updateWalkinSummary();
    else updateLineAmounts(type);
  };
  $("#view").oninput = handleLineChange;
  $("#view").onchange = handleLineChange;
}

async function renderPayments() {
  $("#page-title").textContent = "Payments";
  const payments = await api("payments");
  const sales = await api("sales");
  const purchases = await api("purchases");
  const editing = state.editing.payments;
  const flash = state.flash.payments;
  state.flash.payments = "";
  const target = editing?.sale_id ? `sale:${editing.sale_id}` : editing?.purchase_id ? `purchase:${editing.purchase_id}` : "";
  $("#view").innerHTML = `
    <div class="split">
      <section class="panel">
        <h3>${editing ? "Edit" : "Record"} Payment</h3>
        <form id="payment-form" novalidate>
          ${flash ? `<div class="notice">${flash}</div>` : ""}
          <label>Payment for
            <select name="target">
              ${sales.map((s) => `<option value="sale:${s.sale_id}" ${target === `sale:${s.sale_id}` ? "selected" : ""}>Sale #${s.sale_id} - ${s.customer_name}</option>`).join("")}
              ${purchases.map((p) => `<option value="purchase:${p.purchase_id}" ${target === `purchase:${p.purchase_id}` ? "selected" : ""}>Purchase #${p.purchase_id} - ${p.supplier_name}</option>`).join("")}
            </select>
          </label>
          <label>Amount<input name="amount" type="number" step="0.01" value="${editing?.amount || ""}"></label>
          <label>Date<input name="payment_date" type="date" value="${editing?.payment_date || today()}"></label>
          ${inputField(["payment_method", "Method", "select", ["cash", "mobile money", "card", "bank"]], editing || {})}
          ${paymentReferenceFields(editing || {})}
          <button type="submit">${editing ? "Update" : "Save"} payment</button>
          ${editing ? `<button type="button" class="secondary" id="cancel-payment-edit">Cancel edit</button>` : ""}
        </form>
      </section>
      <section class="panel">${table(payments, ["payment_id", "sale_id", "purchase_id", "amount", "payment_date", "payment_method", "payment_reference"], "edit")}</section>
    </div>`;
  setupPaymentReference($("#payment-form"));
  $("#payment-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector("button[type='submit']");
    form.querySelector(".notice")?.remove();
    const body = Object.fromEntries(new FormData(form).entries());
    const validationError = validatePayment(body);
    if (validationError) {
      formNotice(form, validationError);
      return;
    }
    const [kind, id] = body.target.split(":");
    delete body.target;
    body[kind === "sale" ? "sale_id" : "purchase_id"] = id;
    submit.disabled = true;
    submit.textContent = editing ? "Updating payment..." : "Saving payment...";
    try {
      await api(editing ? `payments/${editing.payment_id}` : "payments", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      state.flash.payments = editing ? "Payment updated successfully." : "Payment saved successfully.";
      state.editing.payments = null;
      await render();
    } catch (error) {
      formNotice(form, friendlyError(error));
      submit.disabled = false;
      submit.textContent = editing ? "Update payment" : "Save payment";
    }
  };
  $("#cancel-payment-edit")?.addEventListener("click", async () => {
    state.editing.payments = null;
    await render();
  });
  $("#view").onclick = async (event) => {
    if (event.target.dataset.edit) {
      state.editing.payments = payments.find((row) => String(row.payment_id) === event.target.dataset.edit);
      await renderPayments();
    }
  };
}

async function renderPayroll() {
  $("#page-title").textContent = "Payroll";
  const rows = await api("payrolls");
  const editing = state.editing.payroll;
  const flash = state.flash.payroll;
  state.flash.payroll = "";
  const monthRows = rows.filter((row) => row.period_month === state.payrollMonth);
  const totalGross = monthRows.reduce((sum, row) => sum + Number(row.basic_salary || 0) + Number(row.bonus || 0), 0);
  const totalDeductions = monthRows.reduce((sum, row) => sum + Number(row.deductions || 0), 0);
  const totalNet = monthRows.reduce((sum, row) => sum + Number(row.net_salary || 0), 0);
  $("#view").innerHTML = `
    <section class="grid cards">
      <article class="card"><span>Payroll month</span><strong>${state.payrollMonth}</strong></article>
      <article class="card"><span>Employees paid</span><strong>${monthRows.filter((row) => row.payment_status === "paid").length}</strong></article>
      <article class="card"><span>Gross pay</span><strong>UGX ${money(totalGross)}</strong></article>
      <article class="card"><span>Deductions</span><strong>UGX ${money(totalDeductions)}</strong></article>
      <article class="card"><span>Net payroll</span><strong>UGX ${money(totalNet)}</strong></article>
    </section>
    <section class="panel">
      <h3>Generate automatic payroll</h3>
      <form id="payroll-generate-form">
        ${flash ? `<div class="notice">${flash}</div>` : ""}
        <label>Payroll month<input name="period_month" type="month" value="${state.payrollMonth}"></label>
        <button type="submit">Generate payroll</button>
      </form>
    </section>
    ${editing ? `<section class="panel">
      <h3>Adjust payroll for ${editing.employee_name}</h3>
      <form id="payroll-edit-form">
        <label>Basic salary<input type="number" value="${editing.basic_salary}" readonly></label>
        <label>Bonus<input name="bonus" type="number" step="0.01" value="${editing.bonus || 0}"></label>
        <label>Deductions<input name="deductions" type="number" step="0.01" value="${editing.deductions || 0}"></label>
        <label>Status<select name="payment_status">${["pending", "paid"].map((status) => `<option value="${status}" ${editing.payment_status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
        <button type="submit">Update payroll</button>
        <button type="button" class="secondary" id="cancel-payroll-edit">Cancel edit</button>
      </form>
    </section>` : ""}
    <section class="panel">
      ${table(monthRows.map((row) => ({
        ...row,
        basic_salary: `UGX ${money(row.basic_salary)}`,
        bonus: `UGX ${money(row.bonus)}`,
        deductions: `UGX ${money(row.deductions)}`,
        net_salary: `UGX ${money(row.net_salary)}`
      })), ["payroll_id", "employee_name", "position", "period_month", "basic_salary", "bonus", "deductions", "net_salary", "payment_status"], "edit")}
    </section>`;
  $("#payroll-generate-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = Object.fromEntries(new FormData(form).entries());
    state.payrollMonth = body.period_month || state.payrollMonth;
    try {
      const result = await api("payrolls/generate", { method: "POST", body: JSON.stringify(body) });
      state.flash.payroll = `Generated payroll for ${result.count} employee(s).`;
      await renderPayroll();
    } catch (error) {
      formNotice(form, error.message);
    }
  };
  $("#payroll-edit-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    try {
      await api(`payrolls/${editing.payroll_id}`, { method: "PUT", body: JSON.stringify(body) });
      state.flash.payroll = "Payroll updated successfully.";
      state.editing.payroll = null;
      await renderPayroll();
    } catch (error) {
      formNotice(event.target, error.message);
    }
  });
  $("#cancel-payroll-edit")?.addEventListener("click", async () => {
    state.editing.payroll = null;
    await renderPayroll();
  });
  $("#view").onclick = async (event) => {
    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      state.editing.payroll = monthRows.find((row) => String(row.payroll_id) === editButton.dataset.edit);
      await renderPayroll();
    }
  };
}

async function renderActivityLogs() {
  $("#page-title").textContent = "Activity Logs";
  const rows = await api("activity-logs");
  $("#view").innerHTML = `
    <section class="grid cards">
      <article class="card"><span>Total logged activities</span><strong>${money(rows.length)}</strong></article>
      <article class="card"><span>Staff active</span><strong>${money(new Set(rows.map((row) => row.user_id).filter(Boolean)).size)}</strong></article>
    </section>
    <section class="panel">
      ${table(rows.map((row) => ({
        log_id: row.log_id,
        staff_name: row.staff_name || "System",
        role: row.role || "",
        action: row.action,
        details: row.details,
        created_at: row.created_at,
      })), ["log_id", "staff_name", "role", "action", "details", "created_at"], false)}
    </section>`;
}

async function renderShopSettings() {
  $("#page-title").textContent = "Shop Settings";
  const settings = await api("shop-settings");
  $("#view").innerHTML = `
    <section class="panel">
      <h3>Dynamic product categories</h3>
      <form id="shop-settings-form">
        <label class="wide">Product categories
          <textarea name="product_categories" rows="10">${settings.product_categories || ""}</textarea>
        </label>
        <button type="submit">Save settings</button>
      </form>
    </section>
    <section class="panel">
      <h3>Active category dropdown</h3>
      ${table((settings.categories || []).map((name, index) => ({ no: index + 1, category: name })), ["no", "category"], false)}
    </section>`;
  $("#shop-settings-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector("button[type='submit']");
    form.querySelector(".notice")?.remove();
    submit.disabled = true;
    submit.textContent = "Saving...";
    try {
      await api("shop-settings", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      await loadOptions();
      await renderShopSettings();
    } catch (error) {
      formNotice(form, error.message);
      submit.disabled = false;
      submit.textContent = "Save settings";
    }
  };
}

async function render() {
  try {
    const publicSections = new Set(["marketplace", "cart", "login"]);
    if (!state.staff && !publicSections.has(state.section)) state.section = "marketplace";
    setNav();
    if (state.staff) {
      try {
        await loadOptions();
      } catch (error) {
        if (error.status === 401) {
          localStorage.removeItem("staffAuth");
          state.staff = null;
          state.section = "login";
          setNav();
        } else {
          throw error;
        }
      }
    }
    if (state.section === "login") return renderLogin();
    if (state.section === "home") return renderHome();
    if (state.section === "marketplace") return renderMarketplace();
    if (state.section === "cart") return renderCart();
    if (state.section === "orders") return renderOrders();
    if (state.section === "reports") return renderReports();
    if (state.section === "dashboard") return renderDashboard();
    if (state.section === "products") return renderProducts();
    if (state.section === "purchases") return renderPurchaseSale("purchase");
    if (state.section === "sales") return renderPurchaseSale("sale");
    if (state.section === "walkin") return renderWalkinCustomer();
    if (state.section === "payments") return renderPayments();
    if (state.section === "payroll") return renderPayroll();
    if (state.section === "activityLogs") return renderActivityLogs();
    if (state.section === "shopSettings") return renderShopSettings();
    if (state.section === "expenses") return renderExpenses();
    return renderCrud(state.section);
  } catch (error) {
    $("#view").innerHTML = `<div class="notice">${error.message}</div>`;
  }
}

$("#refresh").onclick = render;
render();
