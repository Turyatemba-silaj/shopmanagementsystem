const express = require("express");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
const db = new Database(path.join(__dirname, "shop.db"));
const PORT = process.env.PORT || 3000;
const VAT_RATE = 0.18;
const DISCOUNT_THRESHOLD = 400000;
const DISCOUNT_RATE = 0.10;
const AUTH_SECRET = process.env.AUTH_SECRET || "shop-local-auth-secret";

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  category_id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL UNIQUE,
  description TEXT
);
CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'cashier',
  monthly_salary REAL NOT NULL DEFAULT 0,
  salary_status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  product_id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  buying_price REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  product_image TEXT,
  specifications TEXT,
  color TEXT,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(category_id)
);
CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  company_name TEXT
);
CREATE TABLE IF NOT EXISTS customers (
  customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT
);
CREATE TABLE IF NOT EXISTS purchases (
  purchase_id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  purchase_date TEXT NOT NULL,
  total_amount REAL NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  invoice_number TEXT,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE TABLE IF NOT EXISTS purchase_details (
  purchase_detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (purchase_id) REFERENCES purchases(purchase_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);
CREATE TABLE IF NOT EXISTS sales (
  sale_id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  sale_date TEXT NOT NULL,
  total_amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_reference TEXT,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE TABLE IF NOT EXISTS sale_details (
  sale_detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  selling_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);
CREATE TABLE IF NOT EXISTS sale_documents (
  document_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  document_type TEXT NOT NULL,
  document_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  document_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE,
  UNIQUE(sale_id, document_type)
);
CREATE TABLE IF NOT EXISTS expenses (
  expense_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  expense_name TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  description TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE TABLE IF NOT EXISTS payments (
  payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER,
  purchase_id INTEGER,
  amount REAL NOT NULL,
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_reference TEXT,
  FOREIGN KEY (sale_id) REFERENCES sales(sale_id),
  FOREIGN KEY (purchase_id) REFERENCES purchases(purchase_id),
  CHECK ((sale_id IS NOT NULL AND purchase_id IS NULL) OR (sale_id IS NULL AND purchase_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS online_orders (
  order_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  order_number TEXT NOT NULL UNIQUE,
  delivery_address TEXT NOT NULL,
  delivery_phone TEXT NOT NULL,
  delivery_method TEXT NOT NULL DEFAULT 'door delivery',
  order_status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(sale_id),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);
CREATE TABLE IF NOT EXISTS online_order_items (
  order_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  selling_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES online_orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);
CREATE TABLE IF NOT EXISTS daily_sales_reports (
  report_id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL UNIQUE,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sales_count INTEGER NOT NULL DEFAULT 0,
  total_revenue REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  gross_profit REAL NOT NULL DEFAULT 0,
  result_status TEXT NOT NULL DEFAULT 'break-even',
  salesperson_summary TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS employees (
  employee_id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  position TEXT NOT NULL,
  monthly_salary REAL NOT NULL DEFAULT 0,
  hire_date TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS payrolls (
  payroll_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  period_month TEXT NOT NULL,
  basic_salary REAL NOT NULL DEFAULT 0,
  bonus REAL NOT NULL DEFAULT 0,
  deductions REAL NOT NULL DEFAULT 0,
  net_salary REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  expense_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (expense_id) REFERENCES expenses(expense_id),
  UNIQUE(user_id, period_month)
);
CREATE TABLE IF NOT EXISTS activity_logs (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
`);

const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
const productColumns = db.prepare("PRAGMA table_info(products)").all().map((column) => column.name);
if (!productColumns.includes("product_image")) {
  db.prepare("ALTER TABLE products ADD COLUMN product_image TEXT").run();
}
const ensureColumn = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
};
ensureColumn("sales", "payment_reference", "TEXT");
ensureColumn("payments", "payment_reference", "TEXT");
ensureColumn("users", "monthly_salary", "REAL NOT NULL DEFAULT 0");
ensureColumn("users", "salary_status", "TEXT NOT NULL DEFAULT 'active'");
ensureColumn("payrolls", "expense_id", "INTEGER");
ensureColumn("products", "specifications", "TEXT");
ensureColumn("products", "color", "TEXT");

if (count("users") === 0) {
  db.exec(`
  INSERT INTO users (username, password, full_name, email, role) VALUES
    ('admin', 'admin123', 'System Administrator', 'admin@shop.local', 'admin');
  `);
}

const tables = {
  categories: ["category_name", "description"],
  suppliers: ["supplier_name", "phone", "email", "address", "company_name"],
  customers: ["customer_name", "phone", "email", "address"],
  users: ["username", "password", "full_name", "email", "role", "monthly_salary", "salary_status"],
  products: ["category_id", "product_name", "barcode", "buying_price", "selling_price", "product_image", "specifications", "color", "stock_quantity", "reorder_level", "unit"],
  expenses: ["user_id", "expense_name", "amount", "expense_date", "description"],
};

const primaryKeys = {
  categories: "category_id",
  suppliers: "supplier_id",
  customers: "customer_id",
  users: "user_id",
  expenses: "expense_id",
};

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === "");
  if (missing.length) {
    const err = new Error(`Missing required field(s): ${missing.join(", ")}`);
    err.status = 400;
    throw err;
  }
}

function cleanBody(body, fields) {
  return fields.map((field) => body[field] === "" || body[field] === undefined ? null : body[field]);
}

function paymentReference(body) {
  const method = String(body.payment_method || "").toLowerCase();
  if (method === "mobile money") {
    requireFields(body, ["mobile_number"]);
    return body.mobile_number;
  }
  if (method === "bank") {
    requireFields(body, ["account_number"]);
    return body.account_number;
  }
  return null;
}

function transactionTotals(subtotal) {
  const amount = Number(subtotal || 0);
  const discount = amount >= DISCOUNT_THRESHOLD ? amount * DISCOUNT_RATE : 0;
  const taxable = Math.max(amount - discount, 0);
  const tax = taxable * VAT_RATE;
  return { subtotal: amount, discount, tax, total: taxable + tax };
}

function authToken(user) {
  const payload = Buffer.from(JSON.stringify({
    user_id: user.user_id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    exp: Date.now() + 8 * 60 * 60 * 1000
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
  if (Buffer.byteLength(signature || "") !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return user.exp > Date.now() ? user : null;
}

function requireStaff(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: "Staff login required" });
  req.staff = user;
  next();
}

function logActivity(userId, action, details = "") {
  db.prepare("INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)").run(userId || null, action, details);
}

function createSaleDocuments(saleId, source = "sale") {
  const sale = db.prepare(`
    SELECT s.*, c.customer_name, c.phone, c.email, c.address, u.full_name AS staff_name
    FROM sales s
    JOIN customers c ON c.customer_id = s.customer_id
    JOIN users u ON u.user_id = s.user_id
    WHERE s.sale_id = ?
  `).get(saleId);
  if (!sale) return;
  const items = db.prepare(`
    SELECT p.product_name, sd.quantity, sd.selling_price, sd.subtotal
    FROM sale_details sd
    JOIN products p ON p.product_id = sd.product_id
    WHERE sd.sale_id = ?
    ORDER BY sd.sale_detail_id
  `).all(saleId);
  const subtotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const basePayload = {
    sale_id: sale.sale_id,
    source,
    customer: {
      name: sale.customer_name,
      phone: sale.phone,
      email: sale.email,
      address: sale.address
    },
    staff_name: sale.staff_name,
    sale_date: sale.sale_date,
    payment_method: sale.payment_method,
    payment_reference: sale.payment_reference,
    subtotal,
    discount: Number(sale.discount || 0),
    tax: Number(sale.tax || 0),
    total_amount: Number(sale.total_amount || 0),
    items
  };
  const insert = db.prepare(`
    INSERT OR IGNORE INTO sale_documents (sale_id, document_type, document_number, customer_name, total_amount, document_data)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  ["invoice", "receipt"].forEach((type) => {
    const prefix = type === "invoice" ? "INV" : "RCT";
    const documentNumber = `${prefix}-${String(sale.sale_date).replaceAll("-", "")}-${String(sale.sale_id).padStart(5, "0")}`;
    insert.run(
      sale.sale_id,
      type,
      documentNumber,
      sale.customer_name,
      sale.total_amount,
      JSON.stringify({ ...basePayload, document_type: type, document_number: documentNumber })
    );
  });
}

function pdfEscape(value) {
  return String(value ?? "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function saleDocumentLines(document) {
  const data = JSON.parse(document.document_data || "{}");
  const title = document.document_type === "invoice" ? "SALES INVOICE" : "SALES RECEIPT";
  const customer = data.customer || {};
  const lines = [
    title,
    `Document: ${document.document_number}`,
    `Sale: #${document.sale_id}`,
    `Date: ${data.sale_date || ""}`,
    `Customer: ${customer.name || document.customer_name || ""}`,
    `Phone: ${customer.phone || ""}`,
    `Payment: ${data.payment_method || ""}${data.payment_reference ? ` (${data.payment_reference})` : ""}`,
    "",
    "Items",
  ];
  (data.items || []).forEach((item) => {
    lines.push(`${item.product_name} x ${item.quantity} @ UGX ${formatMoney(item.selling_price)} = UGX ${formatMoney(item.subtotal)}`);
  });
  lines.push(
    "",
    `Subtotal: UGX ${formatMoney(data.subtotal || 0)}`,
    `Discount: UGX ${formatMoney(data.discount || 0)}`,
    `VAT: UGX ${formatMoney(data.tax || 0)}`,
    `Total: UGX ${formatMoney(data.total_amount || document.total_amount || 0)}`,
    "",
    "Generated and stored for audit purposes."
  );
  return lines;
}

function buildPdf(lines) {
  const content = [
    "BT",
    "/F1 12 Tf",
    "16 TL",
    "50 790 Td",
    ...lines.slice(0, 46).flatMap((line) => [`(${pdfEscape(line)}) Tj`, "T*"]),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

function getProduct(id) {
  return db.prepare("SELECT * FROM products WHERE product_id = ?").get(id);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function salesReportRange(period = "daily", anchor = new Date()) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);

  if (period === "weekly") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (period === "monthly") {
    start.setDate(1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
  } else if (period === "quarterly") {
    const quarterStart = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(quarterStart, 1);
    end.setFullYear(start.getFullYear(), quarterStart + 3, 0);
  } else if (period === "yearly") {
    start.setMonth(0, 1);
    end.setFullYear(start.getFullYear(), 11, 31);
  }

  return { start: localDateString(start), end: localDateString(end) };
}

function generateDailySalesReport(reportDate = localDateString()) {
  const rows = db.prepare(`
    SELECT
      s.sale_id,
      s.user_id,
      u.full_name,
      s.total_amount AS sale_total,
      sd.quantity,
      p.buying_price,
      sd.quantity * p.buying_price AS cost
    FROM sales s
    JOIN users u ON u.user_id = s.user_id
    JOIN sale_details sd ON sd.sale_id = s.sale_id
    JOIN products p ON p.product_id = sd.product_id
    WHERE s.sale_date = ?
  `).all(reportDate);

  const saleIds = new Set();
  const people = new Map();
  let totalRevenue = 0;
  let totalCost = 0;

  rows.forEach((row) => {
    if (!saleIds.has(row.sale_id)) {
      saleIds.add(row.sale_id);
      totalRevenue += Number(row.sale_total || 0);
    }
    totalCost += Number(row.cost || 0);
    const current = people.get(row.user_id) || {
      user_id: row.user_id,
      full_name: row.full_name,
      sales_count: 0,
      total_revenue: 0,
      total_cost: 0,
      gross_profit: 0
    };
    if (!current.seen_sales) current.seen_sales = new Set();
    if (!current.seen_sales.has(row.sale_id)) {
      current.seen_sales.add(row.sale_id);
      current.total_revenue += Number(row.sale_total || 0);
    }
    current.total_cost += Number(row.cost || 0);
    people.set(row.user_id, current);
  });

  const salesByUser = db.prepare(`
    SELECT user_id, COUNT(*) AS sales_count
    FROM sales
    WHERE sale_date = ?
    GROUP BY user_id
  `).all(reportDate);
  salesByUser.forEach((row) => {
    const current = people.get(row.user_id);
    if (current) current.sales_count = row.sales_count;
  });

  const grossProfit = totalRevenue - totalCost;
  const resultStatus = grossProfit > 0 ? "profit" : grossProfit < 0 ? "loss" : "break-even";
  const salespersonSummary = Array.from(people.values()).map((person) => {
    const { seen_sales, ...summary } = person;
    const personProfit = summary.total_revenue - summary.total_cost;
    return {
      ...summary,
      gross_profit: personProfit,
      result_status: personProfit > 0 ? "profit" : personProfit < 0 ? "loss" : "break-even"
    };
  });

  const result = db.prepare(`
    INSERT INTO daily_sales_reports
      (report_date, generated_at, sales_count, total_revenue, total_cost, gross_profit, result_status, salesperson_summary)
    VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_date) DO UPDATE SET
      generated_at = CURRENT_TIMESTAMP,
      sales_count = excluded.sales_count,
      total_revenue = excluded.total_revenue,
      total_cost = excluded.total_cost,
      gross_profit = excluded.gross_profit,
      result_status = excluded.result_status,
      salesperson_summary = excluded.salesperson_summary
  `).run(
    reportDate,
    saleIds.size,
    totalRevenue,
    totalCost,
    grossProfit,
    resultStatus,
    JSON.stringify(salespersonSummary)
  );

  return {
    id: result.lastInsertRowid,
    report_date: reportDate,
    sales_count: saleIds.size,
    total_revenue: totalRevenue,
    total_cost: totalCost,
    gross_profit: grossProfit,
    result_status: resultStatus,
    salesperson_summary: salespersonSummary
  };
}

function scheduleDailySalesReport() {
  const now = new Date();
  if (now.getHours() >= 22) generateDailySalesReport(localDateString(now));

  const nextRun = new Date(now);
  nextRun.setHours(22, 0, 0, 0);
  if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);

  setTimeout(() => {
    generateDailySalesReport(localDateString());
    setInterval(() => generateDailySalesReport(localDateString()), 24 * 60 * 60 * 1000);
  }, nextRun - now);
}

app.post("/api/login", (req, res, next) => {
  try {
    requireFields(req.body, ["username", "password"]);
    const user = db.prepare("SELECT user_id, username, full_name, role FROM users WHERE username = ? COLLATE NOCASE AND password = ?").get(String(req.body.username).trim(), req.body.password);
    if (!user) return res.status(401).json({ error: "Invalid username or password" });
    logActivity(user.user_id, "login", "Staff logged in");
    res.json({ token: authToken(user), user });
  } catch (err) {
    next(err);
  }
});

app.post("/api/register", (req, res, next) => {
  try {
    requireFields(req.body, ["username", "password", "full_name"]);
    const result = db.prepare(`
      INSERT INTO users (username, password, full_name, email, role, monthly_salary, salary_status)
      VALUES (?, ?, ?, ?, ?, 0, 'active')
    `).run(
      String(req.body.username).trim(),
      req.body.password,
      String(req.body.full_name).trim(),
      req.body.email || null,
      req.body.role || "cashier"
    );
    const user = db.prepare("SELECT user_id, username, full_name, role FROM users WHERE user_id = ?").get(result.lastInsertRowid);
    logActivity(user.user_id, "register", "Staff account created");
    res.status(201).json({ token: authToken(user), user });
  } catch (err) {
    if (/UNIQUE constraint failed: users\.username/i.test(err.message)) err.message = "That username is already taken.";
    next(err);
  }
});

app.post("/api/forgot-password", (req, res, next) => {
  try {
    requireFields(req.body, ["username", "email", "new_password"]);
    const user = db.prepare("SELECT user_id FROM users WHERE username = ? AND email = ?").get(
      String(req.body.username).trim(),
      String(req.body.email).trim()
    );
    if (!user) return res.status(404).json({ error: "No account matched that username and email." });
    db.prepare("UPDATE users SET password = ? WHERE user_id = ?").run(req.body.new_password, user.user_id);
    res.json({ message: "Password updated. You can log in now." });
  } catch (err) {
    next(err);
  }
});

app.use("/api", (req, res, next) => {
  const publicRoute =
    (req.method === "GET" && req.path === "/storefront") ||
    (req.method === "POST" && ["/checkout", "/orders"].includes(req.path)) ||
    (req.method === "POST" && ["/login", "/register", "/forgot-password"].includes(req.path));
  if (publicRoute) return next();
  return requireStaff(req, res, next);
});

app.get("/api/options", (req, res) => {
  res.json({
    categories: db.prepare("SELECT category_id AS id, category_name AS name FROM categories ORDER BY category_name").all(),
    suppliers: db.prepare("SELECT supplier_id AS id, supplier_name AS name FROM suppliers ORDER BY supplier_name").all(),
    customers: db.prepare("SELECT customer_id AS id, customer_name AS name FROM customers ORDER BY customer_name").all(),
    users: db.prepare("SELECT user_id AS id, full_name AS name, monthly_salary FROM users ORDER BY full_name").all(),
    products: db.prepare("SELECT product_id AS id, product_name AS name, selling_price, buying_price, stock_quantity FROM products ORDER BY product_id").all()
  });
});

app.get("/api/activity-logs", (req, res) => {
  res.json(db.prepare(`
    SELECT l.log_id, l.user_id, u.full_name AS staff_name, u.role, l.action, l.details, l.created_at
    FROM activity_logs l
    LEFT JOIN users u ON u.user_id = l.user_id
    ORDER BY l.log_id
  `).all());
});

app.get("/api/sale-documents", (req, res) => {
  res.json(db.prepare(`
    SELECT document_id, sale_id, document_type, document_number, customer_name, total_amount, created_at
    FROM sale_documents
    ORDER BY document_id
  `).all());
});

app.get("/api/sale-documents/:id", (req, res) => {
  const document = db.prepare(`
    SELECT document_id, sale_id, document_type, document_number, customer_name, total_amount, document_data, created_at
    FROM sale_documents
    WHERE document_id = ?
  `).get(req.params.id);
  if (!document) return res.status(404).json({ error: "Document not found" });
  res.json({ ...document, document_data: JSON.parse(document.document_data || "{}") });
});

app.get("/api/sale-documents/:id/pdf", (req, res) => {
  const document = db.prepare(`
    SELECT document_id, sale_id, document_type, document_number, customer_name, total_amount, document_data, created_at
    FROM sale_documents
    WHERE document_id = ?
  `).get(req.params.id);
  if (!document) return res.status(404).json({ error: "Document not found" });
  const pdf = buildPdf(saleDocumentLines(document));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${document.document_number}.pdf"`);
  res.send(pdf);
});

app.get("/api/dashboard", (req, res) => {
  const revenue = db.prepare("SELECT COALESCE(SUM(total_amount),0) AS v FROM sales").get().v;
  const purchaseCost = db.prepare("SELECT COALESCE(SUM(total_amount),0) AS v FROM purchases").get().v;
  const expenses = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM expenses").get().v;
  const lowStock = db.prepare("SELECT COUNT(*) AS v FROM products WHERE stock_quantity < 10").get().v;
  const onlineOrders = count("online_orders");
  const pendingOrders = db.prepare("SELECT COUNT(*) AS v FROM online_orders WHERE order_status = 'pending'").get().v;
  res.json({
    revenue,
    purchaseCost,
    expenses,
    netProfit: revenue - (purchaseCost + expenses),
    products: count("products"),
    sales: count("sales"),
    purchases: count("purchases"),
    lowStock,
    onlineOrders,
    pendingOrders
  });
});

app.get("/api/storefront", (req, res) => {
  const where = ["p.stock_quantity > 0"];
  const params = [];
  if (req.query.q) {
    where.push("(p.product_name LIKE ? OR p.barcode LIKE ?)");
    params.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }
  if (req.query.category) {
    where.push("p.category_id = ?");
    params.push(req.query.category);
  }
  const products = db.prepare(`
    SELECT p.product_id, p.category_id, p.product_name, p.barcode, p.selling_price, p.product_image,
           p.specifications, p.color,
           p.stock_quantity, p.unit, c.category_name
    FROM products p
    JOIN categories c ON c.category_id = p.category_id
    WHERE ${where.join(" AND ")}
    ORDER BY p.product_id
  `).all(params);
  const categories = db.prepare("SELECT category_id, category_name FROM categories ORDER BY category_name").all();
  res.json({ categories, products });
});

app.get("/api/products", (req, res) => {
  res.json(db.prepare(`
    SELECT p.*, c.category_name
    FROM products p JOIN categories c ON c.category_id = p.category_id
    ORDER BY p.product_id
  `).all());
});

for (const [table, fields] of Object.entries(tables)) {
  if (table === "products") continue;
  const id = primaryKeys[table];
  app.get(`/api/${table}`, (req, res) => {
    res.json(db.prepare(`SELECT * FROM ${table} ORDER BY ${id}`).all());
  });
  app.post(`/api/${table}`, (req, res, next) => {
    try {
      requireFields(req.body, fields.filter((f) => !["description", "email", "phone", "address", "company_name"].includes(f)));
      const placeholders = fields.map(() => "?").join(",");
      const stmt = db.prepare(`INSERT INTO ${table} (${fields.join(",")}) VALUES (${placeholders})`);
      const result = stmt.run(cleanBody(req.body, fields));
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) {
      next(err);
    }
  });
  app.put(`/api/${table}/:id`, (req, res, next) => {
    try {
      requireFields(req.body, fields.filter((f) => !["description", "email", "phone", "address", "company_name"].includes(f)));
      const assignments = fields.map((field) => `${field} = ?`).join(", ");
      db.prepare(`UPDATE ${table} SET ${assignments} WHERE ${id} = ?`).run([...cleanBody(req.body, fields), req.params.id]);
      res.json({ id: Number(req.params.id) });
    } catch (err) {
      next(err);
    }
  });
  app.delete(`/api/${table}/:id`, (req, res, next) => {
    try {
      if (table === "users") {
        db.prepare("DELETE FROM activity_logs WHERE user_id = ?").run(req.params.id);
        db.prepare("DELETE FROM payrolls WHERE user_id = ?").run(req.params.id);
        db.prepare("DELETE FROM expenses WHERE user_id = ?").run(req.params.id);
      }
      db.prepare(`DELETE FROM ${table} WHERE ${id} = ?`).run(req.params.id);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  });
}

app.post("/api/products", (req, res, next) => {
  try {
    requireFields(req.body, ["category_id", "product_name", "buying_price", "selling_price", "stock_quantity", "reorder_level", "unit"]);
    const fields = tables.products;
    const result = db.prepare(`
      INSERT INTO products (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})
    `).run(cleanBody(req.body, fields));
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    next(err);
  }
});

app.put("/api/products/:id", (req, res, next) => {
  try {
    requireFields(req.body, ["category_id", "product_name", "buying_price", "selling_price", "stock_quantity", "reorder_level", "unit"]);
    const fields = tables.products;
    const assignments = fields.map((field) => `${field} = ?`).join(", ");
    db.prepare(`UPDATE products SET ${assignments} WHERE product_id = ?`).run([...cleanBody(req.body, fields), req.params.id]);
    res.json({ id: Number(req.params.id) });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/products/:id", (req, res, next) => {
  try {
    const usage =
      db.prepare("SELECT COUNT(*) AS count FROM sale_details WHERE product_id = ?").get(req.params.id).count +
      db.prepare("SELECT COUNT(*) AS count FROM purchase_details WHERE product_id = ?").get(req.params.id).count +
      db.prepare("SELECT COUNT(*) AS count FROM online_order_items WHERE product_id = ?").get(req.params.id).count;
    if (usage > 0) {
      return res.status(400).json({ error: "This product is already used in transactions. Set its stock to 0 instead of deleting it." });
    }
    db.prepare("DELETE FROM products WHERE product_id = ?").run(req.params.id);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

app.get("/api/purchases", (req, res) => {
  res.json(db.prepare(`
    SELECT p.*, s.supplier_name, u.full_name
    FROM purchases p
    JOIN suppliers s ON s.supplier_id = p.supplier_id
    JOIN users u ON u.user_id = p.user_id
    ORDER BY p.purchase_id
  `).all());
});

app.post("/api/purchases", (req, res, next) => {
  try {
    requireFields(req.body, ["supplier_id", "user_id", "purchase_date", "payment_status"]);
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) throw Object.assign(new Error("At least one purchase item is required"), { status: 400 });
    const result = db.transaction((body) => {
      let total = 0;
      const items = body.items.map((item) => {
        const product = getProduct(item.product_id);
        if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unit_price);
        const subtotal = quantity * unitPrice;
        total += subtotal;
        return { ...item, quantity, unit_price: unitPrice, subtotal };
      });
      const purchase = db.prepare(`
        INSERT INTO purchases (supplier_id, user_id, purchase_date, total_amount, payment_status, invoice_number)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(body.supplier_id, body.user_id, body.purchase_date, total, body.payment_status, body.invoice_number || null);
      const detail = db.prepare(`
        INSERT INTO purchase_details (purchase_id, product_id, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `);
      const stock = db.prepare("UPDATE products SET stock_quantity = stock_quantity + ? WHERE product_id = ?");
      items.forEach((item) => {
        detail.run(purchase.lastInsertRowid, item.product_id, item.quantity, item.unit_price, item.subtotal);
        stock.run(item.quantity, item.product_id);
      });
      return purchase.lastInsertRowid;
    })(req.body);
    res.status(201).json({ id: result });
  } catch (err) {
    next(err);
  }
});

app.put("/api/purchases/:id", (req, res, next) => {
  try {
    requireFields(req.body, ["supplier_id", "user_id", "purchase_date", "payment_status"]);
    db.prepare(`
      UPDATE purchases
      SET supplier_id = ?, user_id = ?, purchase_date = ?, payment_status = ?, invoice_number = ?
      WHERE purchase_id = ?
    `).run(req.body.supplier_id, req.body.user_id, req.body.purchase_date, req.body.payment_status, req.body.invoice_number || null, req.params.id);
    res.json({ id: Number(req.params.id) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/sales", (req, res) => {
  res.json(db.prepare(`
    SELECT s.*, c.customer_name, u.full_name
    FROM sales s
    JOIN customers c ON c.customer_id = s.customer_id
    JOIN users u ON u.user_id = s.user_id
    ORDER BY s.sale_id
  `).all());
});

app.post("/api/sales", (req, res, next) => {
  try {
    requireFields(req.body, ["customer_id", "user_id", "sale_date", "payment_method"]);
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) throw Object.assign(new Error("At least one sale item is required"), { status: 400 });
    const result = db.transaction((body) => {
      let subtotal = 0;
      const items = body.items.map((item) => {
        const product = getProduct(item.product_id);
        if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
        const quantity = Number(item.quantity);
        if (quantity > product.stock_quantity) throw Object.assign(new Error(`${product.product_name} has only ${product.stock_quantity} in stock`), { status: 400 });
        const sellingPrice = Number(item.selling_price);
        const lineTotal = quantity * sellingPrice;
        subtotal += lineTotal;
        return { ...item, quantity, selling_price: sellingPrice, subtotal: lineTotal };
      });
      const { discount, tax, total } = transactionTotals(subtotal);
      const sale = db.prepare(`
        INSERT INTO sales (customer_id, user_id, sale_date, total_amount, payment_method, payment_reference, discount, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(body.customer_id, body.user_id, body.sale_date, total, body.payment_method, paymentReference(body), discount, tax);
      const detail = db.prepare(`
        INSERT INTO sale_details (sale_id, product_id, quantity, selling_price, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `);
      const stock = db.prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?");
      items.forEach((item) => {
        detail.run(sale.lastInsertRowid, item.product_id, item.quantity, item.selling_price, item.subtotal);
        stock.run(item.quantity, item.product_id);
      });
      createSaleDocuments(sale.lastInsertRowid, "counter sale");
      return sale.lastInsertRowid;
    })(req.body);
    res.status(201).json({ id: result });
  } catch (err) {
    next(err);
  }
});

app.post("/api/walkin-transactions", (req, res, next) => {
  try {
    requireFields(req.body, ["sale_date", "payment_method"]);
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
      throw Object.assign(new Error("At least one sale item is required"), { status: 400 });
    }
    const receipt = db.transaction((body) => {
      const customerName = body.customer_name || "Walk-in Customer";
      const phone = body.phone || "WALK-IN";
      let customer = db.prepare("SELECT * FROM customers WHERE phone = ?").get(phone);
      if (!customer) {
        const result = db.prepare("INSERT INTO customers (customer_name, phone, email, address) VALUES (?, ?, NULL, NULL)").run(customerName, phone);
        customer = { customer_id: result.lastInsertRowid, customer_name: customerName, phone };
      }
      const user = db.prepare("SELECT * FROM users ORDER BY user_id LIMIT 1").get();
      if (!user) throw Object.assign(new Error("Create at least one staff user before completing a transaction"), { status: 400 });

      let subtotal = 0;
      const items = body.items.map((item) => {
        const product = getProduct(item.product_id);
        if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
        const quantity = Number(item.quantity);
        if (quantity <= 0) throw Object.assign(new Error("Quantity must be greater than zero"), { status: 400 });
        if (quantity > product.stock_quantity) throw Object.assign(new Error(`${product.product_name} has only ${product.stock_quantity} in stock`), { status: 400 });
        const sellingPrice = Number(item.selling_price);
        const lineTotal = quantity * sellingPrice;
        subtotal += lineTotal;
        return { product, quantity, selling_price: sellingPrice, subtotal: lineTotal };
      });
      const { discount, tax, total } = transactionTotals(subtotal);
      const sale = db.prepare(`
        INSERT INTO sales (customer_id, user_id, sale_date, total_amount, payment_method, payment_reference, discount, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(customer.customer_id, user.user_id, body.sale_date, total, body.payment_method, paymentReference(body), discount, tax);
      const detail = db.prepare(`
        INSERT INTO sale_details (sale_id, product_id, quantity, selling_price, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `);
      const stock = db.prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?");
      items.forEach((item) => {
        detail.run(sale.lastInsertRowid, item.product.product_id, item.quantity, item.selling_price, item.subtotal);
        stock.run(item.quantity, item.product.product_id);
      });
      db.prepare(`
        INSERT INTO payments (sale_id, purchase_id, amount, payment_date, payment_method, payment_reference)
        VALUES (?, NULL, ?, ?, ?, ?)
      `).run(sale.lastInsertRowid, total, body.sale_date, body.payment_method, paymentReference(body));
      createSaleDocuments(sale.lastInsertRowid, "walk-in sale");
      return {
        sale_id: sale.lastInsertRowid,
        customer_name: customer.customer_name,
        sale_date: body.sale_date,
        payment_method: body.payment_method,
        payment_reference: paymentReference(body),
        subtotal,
        discount,
        tax,
        total_amount: total,
        items: items.map((item) => ({
          product_name: item.product.product_name,
          quantity: item.quantity,
          selling_price: item.selling_price,
          subtotal: item.subtotal
        }))
      };
    })(req.body);
    res.status(201).json(receipt);
  } catch (err) {
    next(err);
  }
});

app.put("/api/sales/:id", (req, res, next) => {
  try {
    requireFields(req.body, ["customer_id", "user_id", "sale_date", "payment_method"]);
    const sale = db.prepare("SELECT total_amount, discount, tax FROM sales WHERE sale_id = ?").get(req.params.id);
    if (!sale) throw Object.assign(new Error("Sale not found"), { status: 404 });
    const lineSubtotal = Number(sale.total_amount || 0) + Number(sale.discount || 0) - Number(sale.tax || 0);
    const { discount, tax, total } = transactionTotals(lineSubtotal);
    db.prepare(`
      UPDATE sales
      SET customer_id = ?, user_id = ?, sale_date = ?, payment_method = ?, payment_reference = ?, discount = ?, tax = ?, total_amount = ?
      WHERE sale_id = ?
    `).run(req.body.customer_id, req.body.user_id, req.body.sale_date, req.body.payment_method, paymentReference(req.body), discount, tax, total, req.params.id);
    res.json({ id: Number(req.params.id) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/orders", (req, res) => {
  res.json(db.prepare(`
    SELECT o.*, c.customer_name, s.total_amount
    FROM online_orders o
    JOIN customers c ON c.customer_id = o.customer_id
    JOIN sales s ON s.sale_id = o.sale_id
    ORDER BY o.order_id
  `).all());
});

app.put("/api/orders/:id", (req, res, next) => {
  try {
    requireFields(req.body, ["delivery_address", "delivery_phone", "delivery_method", "order_status", "payment_status"]);
    db.prepare(`
      UPDATE online_orders
      SET delivery_address = ?, delivery_phone = ?, delivery_method = ?, order_status = ?, payment_status = ?, notes = ?
      WHERE order_id = ?
    `).run(
      req.body.delivery_address,
      req.body.delivery_phone,
      req.body.delivery_method,
      req.body.order_status,
      req.body.payment_status,
      req.body.notes || null,
      req.params.id
    );
    res.json({ id: Number(req.params.id) });
  } catch (err) {
    next(err);
  }
});

function checkoutHandler(req, res, next) {
  try {
    requireFields(req.body, ["customer_name", "phone", "address", "payment_method", "delivery_method"]);
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
      throw Object.assign(new Error("Your cart is empty"), { status: 400 });
    }
    const order = db.transaction((body) => {
      let customer = db.prepare("SELECT * FROM customers WHERE phone = ?").get(body.phone);
      if (customer) {
        db.prepare(`
          UPDATE customers
          SET customer_name = ?, email = COALESCE(?, email), address = ?
          WHERE customer_id = ?
        `).run(body.customer_name, body.email || null, body.address, customer.customer_id);
      } else {
        const customerResult = db.prepare(`
          INSERT INTO customers (customer_name, phone, email, address)
          VALUES (?, ?, ?, ?)
        `).run(body.customer_name, body.phone, body.email || null, body.address);
        customer = { customer_id: customerResult.lastInsertRowid };
      }

      const user = db.prepare("SELECT * FROM users ORDER BY user_id LIMIT 1").get();
      if (!user) throw Object.assign(new Error("Create at least one staff user before checkout"), { status: 400 });

      let subtotal = 0;
      const items = body.items.map((item) => {
        const product = getProduct(item.product_id);
        if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity < 1) throw Object.assign(new Error("Item quantity must be at least 1"), { status: 400 });
        if (quantity > product.stock_quantity) {
          throw Object.assign(new Error(`${product.product_name} has only ${product.stock_quantity} in stock`), { status: 400 });
        }
        const lineTotal = quantity * Number(product.selling_price);
        subtotal += lineTotal;
        return { product, quantity, selling_price: Number(product.selling_price), subtotal: lineTotal };
      });

      const { discount, tax, total } = transactionTotals(subtotal);
      const sale = db.prepare(`
        INSERT INTO sales (customer_id, user_id, sale_date, total_amount, payment_method, payment_reference, discount, tax)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(customer.customer_id, user.user_id, today(), total, body.payment_method, paymentReference(body), discount, tax);
      const orderNumber = `ORD-${today().replaceAll("-", "")}-${String(sale.lastInsertRowid).padStart(4, "0")}`;
      const orderResult = db.prepare(`
        INSERT INTO online_orders (sale_id, customer_id, order_number, delivery_address, delivery_phone, delivery_method, payment_status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sale.lastInsertRowid,
        customer.customer_id,
        orderNumber,
        body.address,
        body.phone,
        body.delivery_method,
        ["card", "mobile money"].includes(body.payment_method) ? "paid" : "unpaid",
        body.notes || null
      );

      const saleDetail = db.prepare(`
        INSERT INTO sale_details (sale_id, product_id, quantity, selling_price, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `);
      const orderItem = db.prepare(`
        INSERT INTO online_order_items (order_id, product_id, quantity, selling_price, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `);
      const stock = db.prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?");
      items.forEach((item) => {
        saleDetail.run(sale.lastInsertRowid, item.product.product_id, item.quantity, item.selling_price, item.subtotal);
        orderItem.run(orderResult.lastInsertRowid, item.product.product_id, item.quantity, item.selling_price, item.subtotal);
        stock.run(item.quantity, item.product.product_id);
      });
      createSaleDocuments(sale.lastInsertRowid, "online checkout");

      return { id: orderResult.lastInsertRowid, order_number: orderNumber, subtotal, discount, tax, total };
    })(req.body);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

app.post("/api/orders", checkoutHandler);
app.post("/api/checkout", checkoutHandler);

function formatReport(row) {
  if (!row) return null;
  return {
    ...row,
    salesperson_summary: JSON.parse(row.salesperson_summary || "[]")
  };
}

app.get("/api/reports/daily-sales", (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM daily_sales_reports
    ORDER BY report_id
    LIMIT 30
  `).all();
  res.json(rows.map(formatReport));
});

app.post("/api/reports/daily-sales/generate", (req, res, next) => {
  try {
    const report = generateDailySalesReport(req.body.report_date || localDateString());
    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

app.get("/api/reports/sales", (req, res) => {
  const period = ["daily", "weekly", "monthly", "quarterly", "yearly"].includes(req.query.period) ? req.query.period : "daily";
  const range = salesReportRange(period);
  const rows = db.prepare(`
    SELECT
      s.sale_date,
      u.full_name AS sales_person,
      p.product_name,
      sd.quantity,
      sd.selling_price AS selling_price_per_product,
      sd.subtotal AS total_amount_sold
    FROM sale_details sd
    JOIN sales s ON s.sale_id = sd.sale_id
    JOIN users u ON u.user_id = s.user_id
    JOIN products p ON p.product_id = sd.product_id
    WHERE s.sale_date BETWEEN ? AND ?
    ORDER BY s.sale_date, s.sale_id, p.product_name
  `).all(range.start, range.end);

  res.json({
    period,
    start_date: range.start,
    end_date: range.end,
    rows
  });
});

app.get("/api/payments", (req, res) => {
  res.json(db.prepare("SELECT * FROM payments ORDER BY payment_id").all());
});

app.post("/api/payments", (req, res, next) => {
  try {
    requireFields(req.body, ["amount", "payment_date", "payment_method"]);
    const result = db.prepare(`
      INSERT INTO payments (sale_id, purchase_id, amount, payment_date, payment_method, payment_reference)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.body.sale_id || null, req.body.purchase_id || null, req.body.amount, req.body.payment_date, req.body.payment_method, paymentReference(req.body));
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    next(err);
  }
});

app.put("/api/payments/:id", (req, res, next) => {
  try {
    requireFields(req.body, ["amount", "payment_date", "payment_method"]);
    const saleId = req.body.sale_id || null;
    const purchaseId = req.body.purchase_id || null;
    if (Boolean(saleId) === Boolean(purchaseId)) throw Object.assign(new Error("Select either a sale or a purchase for this payment"), { status: 400 });
    db.prepare(`
      UPDATE payments
      SET sale_id = ?, purchase_id = ?, amount = ?, payment_date = ?, payment_method = ?, payment_reference = ?
      WHERE payment_id = ?
    `).run(saleId, purchaseId, req.body.amount, req.body.payment_date, req.body.payment_method, paymentReference(req.body), req.params.id);
    res.json({ id: Number(req.params.id) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/payrolls", (req, res) => {
  res.json(db.prepare(`
    SELECT p.*, u.full_name AS employee_name, u.role AS position
    FROM payrolls p
    JOIN users u ON u.user_id = p.user_id
    ORDER BY p.payroll_id
  `).all());
});

app.post("/api/payrolls/generate", (req, res, next) => {
  try {
    const periodMonth = req.body.period_month || localDateString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
      return res.status(400).json({ error: "Payroll month must use YYYY-MM format" });
    }
    const employees = db.prepare("SELECT * FROM users WHERE salary_status = 'active' AND monthly_salary > 0 ORDER BY full_name").all();
    if (!employees.length) return res.status(400).json({ error: "Add monthly salary to at least one active user before generating payroll" });
    const insert = db.prepare(`
      INSERT INTO payrolls (user_id, period_month, basic_salary, bonus, deductions, net_salary, payment_status)
      VALUES (?, ?, ?, 0, 0, ?, 'pending')
      ON CONFLICT(user_id, period_month) DO UPDATE SET
        basic_salary = excluded.basic_salary,
        net_salary = excluded.basic_salary + payrolls.bonus - payrolls.deductions
    `);
    db.transaction(() => {
      employees.forEach((employee) => {
        insert.run(employee.user_id, periodMonth, employee.monthly_salary, employee.monthly_salary);
      });
    })();
    const rows = db.prepare(`
      SELECT p.*, u.full_name AS employee_name, u.role AS position
      FROM payrolls p
      JOIN users u ON u.user_id = p.user_id
      WHERE p.period_month = ?
      ORDER BY p.payroll_id
    `).all(periodMonth);
    res.status(201).json({ period_month: periodMonth, count: rows.length, rows });
  } catch (err) {
    next(err);
  }
});

app.put("/api/payrolls/:id", (req, res, next) => {
  try {
    const bonus = Number(req.body.bonus || 0);
    const deductions = Number(req.body.deductions || 0);
    const status = req.body.payment_status || "pending";
    const row = db.prepare(`
      SELECT p.*, u.full_name
      FROM payrolls p
      JOIN users u ON u.user_id = p.user_id
      WHERE p.payroll_id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: "Payroll record not found" });
    const netSalary = Number(row.basic_salary || 0) + bonus - deductions;
    let expenseId = row.expense_id || null;
    if (status === "paid") {
      if (expenseId) {
        db.prepare("UPDATE expenses SET user_id = ?, expense_name = ?, amount = ?, expense_date = ?, description = ? WHERE expense_id = ?")
          .run(row.user_id, `Salary - ${row.full_name}`, netSalary, localDateString(), `Payroll ${row.period_month}`, expenseId);
      } else {
        const expense = db.prepare("INSERT INTO expenses (user_id, expense_name, amount, expense_date, description) VALUES (?, ?, ?, ?, ?)")
          .run(row.user_id, `Salary - ${row.full_name}`, netSalary, localDateString(), `Payroll ${row.period_month}`);
        expenseId = expense.lastInsertRowid;
      }
    } else if (expenseId) {
      db.prepare("DELETE FROM expenses WHERE expense_id = ?").run(expenseId);
      expenseId = null;
    }
    db.prepare(`
      UPDATE payrolls
      SET bonus = ?, deductions = ?, net_salary = ?, payment_status = ?, paid_at = ?, expense_id = ?
      WHERE payroll_id = ?
    `).run(bonus, deductions, netSalary, status, status === "paid" ? localDateString() : null, expenseId, req.params.id);
    res.json({ id: Number(req.params.id) });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

app.listen(PORT, () => {
  scheduleDailySalesReport();
  console.log(`Shop management system running at http://localhost:${PORT}`);
});
