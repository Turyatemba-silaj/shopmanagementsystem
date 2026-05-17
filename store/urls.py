from django.urls import path

from . import views


urlpatterns = [
    path("options", views.options, name="options"),
    path("login", views.login, name="login"),
    path("activity-logs", views.activity_logs, name="activity-logs"),
    path("shop-settings", views.shop_settings, name="shop-settings"),
    path("dashboard", views.dashboard, name="dashboard"),
    path("storefront", views.storefront, name="storefront"),
    path("invoice-number", views.invoice_number, name="invoice-number"),
    path("checkout", views.checkout, name="checkout"),
    path("orders", views.online_orders, name="online-orders"),
    path("orders/<int:pk>", views.online_order_detail, name="online-order-detail"),
    path("reports/daily-sales", views.daily_sales_reports, name="daily-sales-reports"),
    path("reports/daily-sales/generate", views.generate_daily_sales_report, name="generate-daily-sales-report"),
    path("reports/sales", views.sales_report, name="sales-report"),
    path("reports/audit", views.audit_report, name="audit-report"),
    path("reports/audit/export", views.export_audit_report, name="export-audit-report"),
    path("products", views.products, name="products"),
    path("products/<int:pk>", views.product_detail, name="product-detail"),
    path("purchases", views.purchases, name="purchases"),
    path("sales", views.sales, name="sales"),
    path("walkin-transactions", views.walkin_transaction, name="walkin-transaction"),
    path("payments", views.payments, name="payments"),
    path("payrolls", views.payrolls, name="payrolls"),
    path("payrolls/generate", views.generate_payroll, name="generate-payroll"),
    path("payrolls/<int:pk>", views.payroll_detail, name="payroll-detail"),
    path("<str:table>", views.crud_collection, name="crud-collection"),
    path("<str:table>/<int:pk>", views.crud_detail, name="crud-detail"),
]
