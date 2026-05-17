# Shop Management System

Online shop management system developed with Django from the supplied ERD.

## Features

 marketplace page with category filtering and product search
- Cart stored in the browser with quantity updates and checkout
- Customer delivery checkout with payment method and delivery method
- Online order tracking for pending, paid, and delivered orders
- Dashboard with revenue, purchases, expenses, net profit, and low-stock count
- Categories, products, suppliers, customers, users, and expenses
- Purchase recording with purchase details and automatic stock increase
- Sale recording with sale details, stock validation, and automatic stock decrease
- Payments linked to either a sale or a purchase
- SQLite database stored in `shop.db`

## Run

```powershell
py -m pip install -r requirements.txt
py manage.py migrate
py manage.py runserver
```

Open:

```text
http://localhost:8000
```

Default seeded user:

```text
Username: admin
Password: admin123
```

The system stores data in `shop.db`.

## Project structure

```text
manage.py
shopsite/       Django project settings and root URLs
store/          Django models, API views, and app URLs
public/         Browser UI served by Django
shop.db         SQLite database
```

## Marketplace flow

Open `Marketplace`, search or filter products, add items to `Cart`, then place an order from checkout. Checkout creates a customer, sale, sale details, online order, and order items while reducing stock automatically.
