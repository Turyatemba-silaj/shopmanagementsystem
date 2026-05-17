from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("store", "0001_online_orders"),
    ]

    operations = [
        migrations.RunSQL(
            """
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
            """,
            reverse_sql="DROP TABLE IF EXISTS daily_sales_reports;",
        )
    ]
