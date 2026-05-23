from django.db import migrations


def ensure_product_columns(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(cursor, "products")
        }
        if "specifications" not in columns:
            cursor.execute("ALTER TABLE products ADD COLUMN specifications TEXT")
        if "color" not in columns:
            cursor.execute("ALTER TABLE products ADD COLUMN color TEXT")


class Migration(migrations.Migration):
    dependencies = [
        ("store", "0004_shop_settings"),
    ]

    operations = [
        migrations.RunPython(ensure_product_columns, migrations.RunPython.noop),
    ]
