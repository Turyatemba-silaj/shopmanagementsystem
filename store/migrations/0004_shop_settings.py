from django.db import migrations


DEFAULT_CATEGORIES = "Groceries,Clothing,Electronics,Pharmacy,Hardware,Beauty,Stationery,Household"


class Migration(migrations.Migration):
    dependencies = [
        ("store", "0003_activity_logs"),
    ]

    operations = [
        migrations.RunSQL(
            f"""
            CREATE TABLE IF NOT EXISTS shop_settings (
              setting_id INTEGER PRIMARY KEY AUTOINCREMENT,
              setting_key TEXT NOT NULL UNIQUE,
              setting_value TEXT,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT OR IGNORE INTO shop_settings (setting_key, setting_value)
            VALUES ('product_categories', '{DEFAULT_CATEGORIES}');
            """,
            reverse_sql="DROP TABLE IF EXISTS shop_settings;",
        )
    ]
