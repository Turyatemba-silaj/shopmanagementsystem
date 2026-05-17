from django.db import models


class Category(models.Model):
    category_id = models.AutoField(primary_key=True)
    category_name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "categories"

    def __str__(self):
        return self.category_name


class ShopSetting(models.Model):
    setting_id = models.AutoField(primary_key=True)
    setting_key = models.CharField(max_length=120, unique=True)
    setting_value = models.TextField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "shop_settings"


class User(models.Model):
    user_id = models.AutoField(primary_key=True)
    username = models.CharField(max_length=120, unique=True)
    password = models.CharField(max_length=120)
    full_name = models.CharField(max_length=160)
    email = models.EmailField(blank=True, null=True)
    role = models.CharField(max_length=40, default="cashier")
    monthly_salary = models.FloatField(default=0)
    salary_status = models.CharField(max_length=40, default="active")
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "users"

    def __str__(self):
        return self.full_name


class Product(models.Model):
    product_id = models.AutoField(primary_key=True)
    category = models.ForeignKey(Category, models.DO_NOTHING, db_column="category_id")
    product_name = models.CharField(max_length=160)
    barcode = models.CharField(max_length=80, unique=True, blank=True, null=True)
    buying_price = models.FloatField(default=0)
    selling_price = models.FloatField(default=0)
    product_image = models.TextField(blank=True, null=True)
    stock_quantity = models.IntegerField(default=0)
    reorder_level = models.IntegerField(default=0)
    unit = models.CharField(max_length=40, default="pcs")
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "products"

    def __str__(self):
        return self.product_name


class Supplier(models.Model):
    supplier_id = models.AutoField(primary_key=True)
    supplier_name = models.CharField(max_length=160)
    phone = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    company_name = models.CharField(max_length=160, blank=True, null=True)

    class Meta:
        managed = False
        db_table = "suppliers"

    def __str__(self):
        return self.supplier_name


class Customer(models.Model):
    customer_id = models.AutoField(primary_key=True)
    customer_name = models.CharField(max_length=160)
    phone = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    address = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "customers"

    def __str__(self):
        return self.customer_name


class Purchase(models.Model):
    purchase_id = models.AutoField(primary_key=True)
    supplier = models.ForeignKey(Supplier, models.DO_NOTHING, db_column="supplier_id")
    user = models.ForeignKey(User, models.DO_NOTHING, db_column="user_id")
    purchase_date = models.DateField()
    total_amount = models.FloatField()
    payment_status = models.CharField(max_length=40, default="unpaid")
    invoice_number = models.CharField(max_length=80, blank=True, null=True)

    class Meta:
        managed = False
        db_table = "purchases"


class PurchaseDetail(models.Model):
    purchase_detail_id = models.AutoField(primary_key=True)
    purchase = models.ForeignKey(Purchase, models.CASCADE, db_column="purchase_id")
    product = models.ForeignKey(Product, models.DO_NOTHING, db_column="product_id")
    quantity = models.IntegerField()
    unit_price = models.FloatField()
    subtotal = models.FloatField()

    class Meta:
        managed = False
        db_table = "purchase_details"


class Sale(models.Model):
    sale_id = models.AutoField(primary_key=True)
    customer = models.ForeignKey(Customer, models.DO_NOTHING, db_column="customer_id")
    user = models.ForeignKey(User, models.DO_NOTHING, db_column="user_id")
    sale_date = models.DateField()
    total_amount = models.FloatField()
    payment_method = models.CharField(max_length=40)
    payment_reference = models.CharField(max_length=120, blank=True, null=True)
    discount = models.FloatField(default=0)
    tax = models.FloatField(default=0)

    class Meta:
        managed = False
        db_table = "sales"


class SaleDetail(models.Model):
    sale_detail_id = models.AutoField(primary_key=True)
    sale = models.ForeignKey(Sale, models.CASCADE, db_column="sale_id")
    product = models.ForeignKey(Product, models.DO_NOTHING, db_column="product_id")
    quantity = models.IntegerField()
    selling_price = models.FloatField()
    subtotal = models.FloatField()

    class Meta:
        managed = False
        db_table = "sale_details"


class Expense(models.Model):
    expense_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, models.DO_NOTHING, db_column="user_id")
    expense_name = models.CharField(max_length=160)
    amount = models.FloatField()
    expense_date = models.DateField()
    description = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "expenses"


class Payment(models.Model):
    payment_id = models.AutoField(primary_key=True)
    sale = models.ForeignKey(Sale, models.DO_NOTHING, db_column="sale_id", blank=True, null=True)
    purchase = models.ForeignKey(Purchase, models.DO_NOTHING, db_column="purchase_id", blank=True, null=True)
    amount = models.FloatField()
    payment_date = models.DateField()
    payment_method = models.CharField(max_length=40)
    payment_reference = models.CharField(max_length=120, blank=True, null=True)

    class Meta:
        managed = False
        db_table = "payments"


class OnlineOrder(models.Model):
    order_id = models.AutoField(primary_key=True)
    sale = models.ForeignKey(Sale, models.DO_NOTHING, db_column="sale_id")
    customer = models.ForeignKey(Customer, models.DO_NOTHING, db_column="customer_id")
    order_number = models.CharField(max_length=40, unique=True)
    delivery_address = models.TextField()
    delivery_phone = models.CharField(max_length=50)
    delivery_method = models.CharField(max_length=40, default="door delivery")
    order_status = models.CharField(max_length=40, default="pending")
    payment_status = models.CharField(max_length=40, default="unpaid")
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "online_orders"


class OnlineOrderItem(models.Model):
    order_item_id = models.AutoField(primary_key=True)
    order = models.ForeignKey(OnlineOrder, models.CASCADE, db_column="order_id")
    product = models.ForeignKey(Product, models.DO_NOTHING, db_column="product_id")
    quantity = models.IntegerField()
    selling_price = models.FloatField()
    subtotal = models.FloatField()

    class Meta:
        managed = False
        db_table = "online_order_items"


class DailySalesReport(models.Model):
    report_id = models.AutoField(primary_key=True)
    report_date = models.DateField(unique=True)
    generated_at = models.DateTimeField(blank=True, null=True)
    sales_count = models.IntegerField(default=0)
    total_revenue = models.FloatField(default=0)
    total_cost = models.FloatField(default=0)
    gross_profit = models.FloatField(default=0)
    result_status = models.CharField(max_length=40, default="break-even")
    salesperson_summary = models.TextField(default="[]")

    class Meta:
        managed = False
        db_table = "daily_sales_reports"


class Employee(models.Model):
    employee_id = models.AutoField(primary_key=True)
    employee_name = models.CharField(max_length=160)
    phone = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    position = models.CharField(max_length=120)
    monthly_salary = models.FloatField(default=0)
    hire_date = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=40, default="active")

    class Meta:
        managed = False
        db_table = "employees"

    def __str__(self):
        return self.employee_name


class Payroll(models.Model):
    payroll_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, models.DO_NOTHING, db_column="user_id")
    period_month = models.CharField(max_length=7)
    basic_salary = models.FloatField(default=0)
    bonus = models.FloatField(default=0)
    deductions = models.FloatField(default=0)
    net_salary = models.FloatField(default=0)
    payment_status = models.CharField(max_length=40, default="pending")
    generated_at = models.DateTimeField(blank=True, null=True)
    paid_at = models.DateField(blank=True, null=True)
    expense = models.ForeignKey(Expense, models.DO_NOTHING, db_column="expense_id", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "payrolls"
        unique_together = (("user", "period_month"),)


class ActivityLog(models.Model):
    log_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, models.DO_NOTHING, db_column="user_id", blank=True, null=True)
    action = models.CharField(max_length=120)
    details = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "activity_logs"
