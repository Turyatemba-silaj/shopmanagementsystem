from django.db import migrations


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.RunSQL(
            """
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
            """,
            reverse_sql="""
            DROP TABLE IF EXISTS online_order_items;
            DROP TABLE IF EXISTS online_orders;
            """,
        )
    ]
