from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("store", "0005_product_specifications_color"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
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
            """,
            reverse_sql="DROP TABLE IF EXISTS sale_documents;",
        )
    ]
