from django.contrib import admin

from .models import Category, Customer, Expense, OnlineOrder, OnlineOrderItem, Payment, Product, Purchase, Sale, Supplier, User


admin.site.register(Category)
admin.site.register(Customer)
admin.site.register(Expense)
admin.site.register(Payment)
admin.site.register(OnlineOrder)
admin.site.register(OnlineOrderItem)
admin.site.register(Product)
admin.site.register(Purchase)
admin.site.register(Sale)
admin.site.register(Supplier)
admin.site.register(User)
