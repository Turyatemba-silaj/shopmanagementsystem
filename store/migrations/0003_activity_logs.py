from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("store", "0002_daily_sales_reports"),
    ]

    operations = [
        migrations.RunSQL(
            """
            CREATE TABLE IF NOT EXISTS activity_logs (
              log_id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER,
              action TEXT NOT NULL,
              details TEXT,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(user_id)
            );
            """,
            reverse_sql="DROP TABLE IF EXISTS activity_logs;",
        )
    ]
