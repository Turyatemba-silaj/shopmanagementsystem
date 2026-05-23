import sqlite3


DEFAULT_CATEGORIES = [
    "Groceries",
    "Clothing",
    "Electronics",
    "Pharmacy",
    "Hardware",
    "Beauty",
    "Stationery",
    "Household",
    "Agriculture product",
]


def initialize_sqlite_database(path):
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS categories (
              category_id INTEGER PRIMARY KEY AUTOINCREMENT,
              category_name TEXT NOT NULL UNIQUE,
              description TEXT
            );

            CREATE TABLE IF NOT EXISTS shop_settings (
              setting_id INTEGER PRIMARY KEY AUTOINCREMENT,
              setting_key TEXT NOT NULL UNIQUE,
              setting_value TEXT,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS users (
              user_id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              password TEXT NOT NULL,
              full_name TEXT NOT NULL,
              email TEXT,
              role TEXT NOT NULL DEFAULT 'cashier',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              monthly_salary REAL NOT NULL DEFAULT 0,
              salary_status TEXT NOT NULL DEFAULT 'active'
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
            """
        )
        _ensure_column(connection, "products", "specifications", "TEXT")
        _ensure_column(connection, "products", "color", "TEXT")
        _seed_database(connection)
        connection.commit()
    finally:
        connection.close()


def _ensure_column(connection, table, column, definition):
    columns = [row[1] for row in connection.execute(f"PRAGMA table_info({table})")]
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _seed_database(connection):
    for name in DEFAULT_CATEGORIES:
        connection.execute(
            "INSERT OR IGNORE INTO categories (category_name, description) VALUES (?, ?)",
            (name, "Shop setting category"),
        )
    connection.execute(
        """
        INSERT OR IGNORE INTO shop_settings (setting_key, setting_value)
        VALUES ('product_categories', ?)
        """,
        ("\n".join(DEFAULT_CATEGORIES),),
    )
    connection.execute(
        """
        INSERT OR IGNORE INTO users
          (username, password, full_name, email, role, monthly_salary, salary_status)
        VALUES
          ('admin', 'admin123', 'System Administrator', 'admin@shop.local', 'admin', 0, 'active')
        """
    )
    products = [
        ("shirt", "Clothing", 10000, 40000, 296, 1, "pcs"),
        ("sneaker", "Clothing", 23000, 45000, 575, 5, "pairs"),
        ("perfume", "Beauty", 10000, 30000, 12, 1, "bottles"),
    ]
    for name, category, buying_price, selling_price, stock, reorder_level, unit in products:
        category_id = connection.execute(
            "SELECT category_id FROM categories WHERE category_name = ?",
            (category,),
        ).fetchone()[0]
        connection.execute(
            """
            INSERT OR IGNORE INTO products
              (category_id, product_name, buying_price, selling_price, stock_quantity, reorder_level, unit)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (category_id, name, buying_price, selling_price, stock, reorder_level, unit),
        )
