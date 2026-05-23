import json
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape

from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.db.models import F, OuterRef, Q, Subquery, Sum, Value
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import (
    Category,
    Customer,
    DailySalesReport,
    Expense,
    Payment,
    Payroll,
    Product,
    Purchase,
    PurchaseDetail,
    Sale,
    SaleDetail,
    ShopSetting,
    Supplier,
    User,
    OnlineOrder,
    OnlineOrderItem,
    ActivityLog,
)

VAT_RATE = 0.18
DISCOUNT_THRESHOLD = 400000
DISCOUNT_RATE = 0.10
AUTH_SALT = "shop-staff-auth"
DEFAULT_PRODUCT_CATEGORIES = "Groceries,Clothing,Electronics,Pharmacy,Hardware,Beauty,Stationery,Household"


class StockNotification(Exception):
    pass


CRUD = {
    "categories": {
        "model": Category,
        "pk": "category_id",
        "fields": ["category_name", "description"],
        "optional": ["description"],
    },
    "suppliers": {
        "model": Supplier,
        "pk": "supplier_id",
        "fields": ["supplier_name", "phone", "email", "address", "company_name"],
        "optional": ["phone", "email", "address", "company_name"],
    },
    "customers": {
        "model": Customer,
        "pk": "customer_id",
        "fields": ["customer_name", "phone", "email", "address"],
        "optional": ["phone", "email", "address"],
    },
    "users": {
        "model": User,
        "pk": "user_id",
        "fields": ["username", "password", "full_name", "email", "role", "monthly_salary", "salary_status"],
        "optional": ["email"],
    },
    "expenses": {
        "model": Expense,
        "pk": "expense_id",
        "fields": ["user_id", "expense_name", "amount", "expense_date", "description"],
        "optional": ["description"],
    },
}


def _public_file(name):
    path = Path(settings.BASE_DIR) / "public" / name
    if not path.is_file():
        raise Http404(f"Public file not found: {name}")
    return FileResponse(path.open("rb"))


def home(_request):
    return _public_file("index.html")


def app_js(_request):
    return _public_file("app.js")


def styles(_request):
    return _public_file("styles.css")


def home_supermarket_image(_request):
    return _public_file("home-supermarket.webp")


def _body(request):
    return json.loads(request.body.decode("utf-8") or "{}")


def _error(message, status=400):
    return JsonResponse({"error": str(message)}, status=status)


def _stock_notification(product, quantity):
    return StockNotification(
        f"Stock notification: {product.product_name} has only {product.stock_quantity} available, but {quantity} was ordered."
    )


def _clean(data, fields):
    return {field: (data.get(field) if data.get(field) != "" else None) for field in fields}


def _require(data, fields):
    missing = [field for field in fields if data.get(field) in (None, "")]
    if missing:
        raise ValueError(f"Missing required field(s): {', '.join(missing)}")


def _payment_reference(data):
    method = (data.get("payment_method") or "").lower()
    if method == "mobile money":
        _require(data, ["mobile_number"])
        return data.get("mobile_number")
    if method == "bank":
        _require(data, ["account_number"])
        return data.get("account_number")
    return None


def _require_mobile_money_pin(data):
    pin = str(data.get("mobile_pin") or "")
    if not pin.isdigit() or len(pin) not in range(4, 7):
        raise ValueError("Enter a valid 4 to 6 digit mobile money PIN")


def _require_mobile_money_balance(data, amount):
    _require(data, ["mobile_balance"])
    balance = float(data.get("mobile_balance") or 0)
    if balance < amount:
        raise ValueError(f"Insufficient mobile money balance. Available UGX {balance:,.0f}, required UGX {amount:,.0f}")


def _transaction_totals(subtotal):
    amount = float(subtotal or 0)
    discount = amount * DISCOUNT_RATE if amount >= DISCOUNT_THRESHOLD else 0
    taxable = max(amount - discount, 0)
    tax = taxable * VAT_RATE
    return {"subtotal": amount, "discount": discount, "tax": tax, "total": taxable + tax}


def _generate_invoice_number(supplier_id, purchase_date=None):
    purchase_date = purchase_date or date.today()
    if isinstance(purchase_date, str):
        purchase_date = date.fromisoformat(purchase_date)
    supplier = Supplier.objects.get(supplier_id=supplier_id)
    supplier_code = re.sub(r"[^A-Z0-9]", "", (supplier.supplier_name or "").upper())[:6] or f"SUP{supplier.supplier_id}"
    date_code = purchase_date.strftime("%Y%m%d")
    existing = Purchase.objects.filter(supplier_id=supplier_id, purchase_date=purchase_date).count()
    return f"INV-{supplier_code}-{date_code}-{existing + 1:03d}"


def _xlsx_cell(value):
    if value is None:
        value = ""
    if isinstance(value, (int, float)):
        return f'<c><v>{value}</v></c>'
    return f'<c t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'


def _xlsx_sheet(rows):
    body = []
    for index, row in enumerate(rows, start=1):
        cells = "".join(_xlsx_cell(value) for value in row)
        body.append(f'<row r="{index}">{cells}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetData>'
        + "".join(body)
        + '</sheetData></worksheet>'
    )


def _xlsx_workbook(sheets):
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + "".join(
                f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                for i in range(1, len(sheets) + 1)
            )
            + '</Types>',
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>',
        )
        archive.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets>'
            + "".join(f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>' for i, (name, _rows) in enumerate(sheets, start=1))
            + '</sheets></workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(
                f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
                for i in range(1, len(sheets) + 1)
            )
            + '</Relationships>',
        )
        for i, (_name, rows) in enumerate(sheets, start=1):
            archive.writestr(f"xl/worksheets/sheet{i}.xml", _xlsx_sheet(rows))
    output.seek(0)
    return output


def _rows(queryset):
    return list(queryset)


def _created(pk):
    return JsonResponse({"id": pk}, status=201)


def _setting(key, default=""):
    setting, _created_setting = ShopSetting.objects.get_or_create(
        setting_key=key,
        defaults={"setting_value": default, "updated_at": timezone.now()},
    )
    return setting.setting_value or default


def _category_names_from_setting():
    raw = _setting("product_categories", DEFAULT_PRODUCT_CATEGORIES)
    names = []
    seen = set()
    for name in re.split(r"[\n,]+", raw):
        cleaned = name.strip()
        key = cleaned.lower()
        if cleaned and key not in seen:
            names.append(cleaned)
            seen.add(key)
    return names


def _sync_setting_categories():
    for name in _category_names_from_setting():
        Category.objects.get_or_create(category_name=name, defaults={"description": "Shop setting category"})


def _staff_payload(user):
    return {
        "user_id": user.user_id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
    }


def _require_staff(request):
    header = request.headers.get("Authorization", "")
    token = header.replace("Bearer ", "", 1)
    try:
      signing.loads(token, salt=AUTH_SALT, max_age=8 * 60 * 60)
      return None
    except signing.BadSignature:
      return _error("Staff login required", 401)


def _current_staff(request):
    header = request.headers.get("Authorization", "")
    token = header.replace("Bearer ", "", 1)
    payload = signing.loads(token, salt=AUTH_SALT, max_age=8 * 60 * 60)
    return User.objects.get(user_id=payload["user_id"])


def _log_activity(request, action, details=""):
    try:
        staff = _current_staff(request)
    except (signing.BadSignature, User.DoesNotExist, KeyError):
        staff = None
    ActivityLog.objects.create(user=staff, action=action, details=details, created_at=timezone.now())


def _is_salary_expense(expense):
    name = (expense.expense_name or "").strip().lower()
    description = (expense.description or "").strip().lower()
    return name.startswith("salary") or description.startswith("payroll")


def _salary_expense_period(expense):
    description = (expense.description or "").strip()
    parts = description.split()
    for part in parts:
        if len(part) == 7 and part[4] == "-":
            return part
    return expense.expense_date.strftime("%Y-%m") if expense.expense_date else date.today().strftime("%Y-%m")


def _sync_salary_expense(expense):
    linked = Payroll.objects.filter(expense=expense).first()
    if not _is_salary_expense(expense):
        if linked:
            linked.delete()
        return None

    period_month = _salary_expense_period(expense)
    target = Payroll.objects.filter(user_id=expense.user_id, period_month=period_month).first()
    payroll = target or linked or Payroll(user_id=expense.user_id, period_month=period_month)
    if linked and target and linked.payroll_id != target.payroll_id:
        linked.delete()

    payroll.user_id = expense.user_id
    payroll.period_month = period_month
    payroll.basic_salary = float(expense.amount or 0)
    payroll.bonus = 0
    payroll.deductions = 0
    payroll.net_salary = float(expense.amount or 0)
    payroll.payment_status = "paid"
    payroll.paid_at = expense.expense_date or date.today()
    payroll.generated_at = payroll.generated_at or timezone.now()
    payroll.expense = expense
    payroll.save()
    return payroll


def _sync_salary_expenses(period_month=None):
    filters = Q(expense_name__istartswith="salary") | Q(description__istartswith="payroll")
    expenses = Expense.objects.filter(filters).order_by("expense_date", "expense_id")
    synced = []
    for expense in expenses:
        if period_month and _salary_expense_period(expense) != period_month:
            continue
        synced.append(_sync_salary_expense(expense))
    return [payroll for payroll in synced if payroll]


def _format_report(report, staff=None):
    data = {
        "report_id": report.report_id,
        "report_date": report.report_date.isoformat() if report.report_date else None,
        "generated_at": report.generated_at.isoformat() if report.generated_at else None,
        "sales_count": report.sales_count,
        "total_revenue": report.total_revenue,
        "total_cost": report.total_cost,
        "gross_profit": report.gross_profit,
        "result_status": report.result_status,
        "salesperson_summary": [],
    }
    try:
        data["salesperson_summary"] = json.loads(report.salesperson_summary or "[]")
    except json.JSONDecodeError:
        data["salesperson_summary"] = []
    if staff:
        data["salesperson_summary"] = [row for row in data["salesperson_summary"] if row.get("user_id") == staff.user_id]
        if data["salesperson_summary"]:
            person = data["salesperson_summary"][0]
            data["sales_count"] = person.get("sales_count", 0)
            data["total_revenue"] = person.get("total_revenue", 0)
            data["total_cost"] = person.get("total_cost", 0)
            data["gross_profit"] = person.get("gross_profit", 0)
            data["result_status"] = "profit" if data["gross_profit"] > 0 else "loss" if data["gross_profit"] < 0 else "break-even"
        else:
            data["sales_count"] = 0
            data["total_revenue"] = 0
            data["total_cost"] = 0
            data["gross_profit"] = 0
            data["result_status"] = "break-even"
    return data


def _generate_daily_sales_report(report_date=None):
    report_date = report_date or date.today()
    if isinstance(report_date, str):
        report_date = date.fromisoformat(report_date)

    details = SaleDetail.objects.select_related("sale__user", "product").filter(sale__sale_date=report_date)
    sale_ids = set()
    people = {}
    total_revenue = 0
    total_cost = 0

    for detail in details:
        sale = detail.sale
        user = sale.user
        if sale.sale_id not in sale_ids:
            sale_ids.add(sale.sale_id)
            total_revenue += float(sale.total_amount or 0)

        line_cost = float(detail.quantity or 0) * float(detail.product.buying_price or 0)
        total_cost += line_cost

        current = people.setdefault(
            user.user_id,
            {
                "user_id": user.user_id,
                "full_name": user.full_name,
                "sales_count": 0,
                "total_revenue": 0,
                "total_cost": 0,
                "total_line_sales": 0,
                "product_names": set(),
                "quantity": 0,
                "seen_sales": set(),
            },
        )
        if sale.sale_id not in current["seen_sales"]:
            current["seen_sales"].add(sale.sale_id)
            current["sales_count"] += 1
            current["total_revenue"] += float(sale.total_amount or 0)
        current["total_cost"] += line_cost
        current["total_line_sales"] += float(detail.subtotal or 0)
        current["product_names"].add(detail.product.product_name)
        current["quantity"] += int(detail.quantity or 0)

    gross_profit = total_revenue - total_cost
    result_status = "profit" if gross_profit > 0 else "loss" if gross_profit < 0 else "break-even"
    salesperson_summary = []
    for person in people.values():
        person_profit = person["total_revenue"] - person["total_cost"]
        salesperson_summary.append(
            {
                "user_id": person["user_id"],
                "full_name": person["full_name"],
                "product_name": ", ".join(sorted(person["product_names"])),
                "quantity": person["quantity"],
                "price": person["total_line_sales"] / person["quantity"] if person["quantity"] else 0,
                "sales_count": person["sales_count"],
                "total_revenue": person["total_revenue"],
                "total_cost": person["total_cost"],
                "gross_profit": person_profit,
                "profit": person_profit if person_profit > 0 else 0,
                "loss": abs(person_profit) if person_profit < 0 else 0,
                "result_status": "profit" if person_profit > 0 else "loss" if person_profit < 0 else "break-even",
            }
        )

    report, _created_report = DailySalesReport.objects.update_or_create(
        report_date=report_date,
        defaults={
            "generated_at": timezone.now(),
            "sales_count": len(sale_ids),
            "total_revenue": total_revenue,
            "total_cost": total_cost,
            "gross_profit": gross_profit,
            "result_status": result_status,
            "salesperson_summary": json.dumps(salesperson_summary),
        },
    )
    return report


def _sales_report_range(period):
    today = date.today()
    if period == "weekly":
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
    elif period == "monthly":
        start = today.replace(day=1)
        end = (start.replace(year=start.year + 1, month=1, day=1) if start.month == 12 else start.replace(month=start.month + 1, day=1)) - timedelta(days=1)
    elif period == "quarterly":
        quarter_month = ((today.month - 1) // 3) * 3 + 1
        start = today.replace(month=quarter_month, day=1)
        end = (start.replace(year=start.year + 1, month=1, day=1) if quarter_month == 10 else start.replace(month=quarter_month + 3, day=1)) - timedelta(days=1)
    elif period == "yearly":
        start = today.replace(month=1, day=1)
        end = today.replace(month=12, day=31)
    else:
        start = today
        end = today
    return start, end


def options(_request):
    denied = _require_staff(_request)
    if denied:
        return denied
    _sync_setting_categories()
    return JsonResponse(
        {
            "categories": _rows(Category.objects.filter(category_name__in=_category_names_from_setting()).order_by("category_name").values(id=F("category_id"), name=F("category_name"))),
            "suppliers": _rows(Supplier.objects.order_by("supplier_name").values(id=F("supplier_id"), name=F("supplier_name"))),
            "customers": _rows(Customer.objects.order_by("customer_name").values(id=F("customer_id"), name=F("customer_name"))),
            "users": _rows(User.objects.order_by("full_name").values("monthly_salary", id=F("user_id"), name=F("full_name"))),
            "expense_names": [
                {"id": name, "name": name}
                for name in sorted(
                    set(
                        [
                            "Rent",
                            "Utilities",
                            "Transport",
                            "Supplies",
                            "Maintenance",
                            "Marketing",
                            "Salary",
                        ]
                        + list(Expense.objects.exclude(expense_name="").values_list("expense_name", flat=True))
                    )
                )
            ],
            "products": _rows(
                Product.objects.order_by("product_id").values(
                    "selling_price",
                    "buying_price",
                    "stock_quantity",
                    "specifications",
                    "color",
                    id=F("product_id"),
                    name=F("product_name"),
                )
            ),
        }
    )


def activity_logs(request):
    denied = _require_staff(request)
    if denied:
        return denied
    rows = ActivityLog.objects.select_related("user").order_by("log_id").values(
        "log_id",
        "user_id",
        "action",
        "details",
        "created_at",
        staff_name=F("user__full_name"),
        role=F("user__role"),
    )
    return JsonResponse(_rows(rows), safe=False)


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def shop_settings(request):
    denied = _require_staff(request)
    if denied:
        return denied
    if request.method == "GET":
        categories = _category_names_from_setting()
        _sync_setting_categories()
        return JsonResponse({"product_categories": "\n".join(categories), "categories": categories})
    try:
        data = _body(request)
        categories = data.get("product_categories") or DEFAULT_PRODUCT_CATEGORIES
        setting, _created_setting = ShopSetting.objects.get_or_create(setting_key="product_categories")
        setting.setting_value = categories
        setting.updated_at = timezone.now()
        setting.save(update_fields=["setting_value", "updated_at"])
        _sync_setting_categories()
        _log_activity(request, "update shop settings", "Updated dynamic product categories")
        return JsonResponse({"product_categories": "\n".join(_category_names_from_setting()), "categories": _category_names_from_setting()})
    except (ValueError, IntegrityError) as exc:
        return _error(exc)


def dashboard(_request):
    denied = _require_staff(_request)
    if denied:
        return denied
    revenue = Sale.objects.aggregate(v=Sum("total_amount"))["v"] or 0
    purchase_cost = Purchase.objects.aggregate(v=Sum("total_amount"))["v"] or 0
    expenses = Expense.objects.aggregate(v=Sum("amount"))["v"] or 0
    low_stock = Product.objects.filter(stock_quantity__lt=10).count()
    return JsonResponse(
        {
            "revenue": revenue,
            "purchaseCost": purchase_cost,
            "expenses": expenses,
            "netProfit": revenue - (purchase_cost + expenses),
            "products": Product.objects.count(),
            "sales": Sale.objects.count(),
            "purchases": Purchase.objects.count(),
            "lowStock": low_stock,
            "onlineOrders": OnlineOrder.objects.count(),
            "pendingOrders": OnlineOrder.objects.filter(order_status="pending").count(),
        }
    )


def storefront(request):
    query = request.GET.get("q", "").strip()
    category_id = request.GET.get("category")
    _sync_setting_categories()
    products = Product.objects.select_related("category").filter(stock_quantity__gt=0)
    if query:
        products = products.filter(Q(product_name__icontains=query) | Q(barcode__icontains=query))
    if category_id:
        products = products.filter(category_id=category_id)
    data = products.order_by("product_id").values(
        "product_id",
        "category_id",
        "product_name",
        "barcode",
        "selling_price",
        "product_image",
        "specifications",
        "color",
        "stock_quantity",
        "unit",
        category_name=F("category__category_name"),
    )
    return JsonResponse(
        {
            "categories": _rows(Category.objects.filter(category_name__in=_category_names_from_setting()).order_by("category_name").values("category_id", "category_name")),
            "products": _rows(data),
        }
    )


@require_http_methods(["GET"])
def invoice_number(request):
    denied = _require_staff(request)
    if denied:
        return denied
    supplier_id = request.GET.get("supplier_id")
    purchase_date = request.GET.get("purchase_date") or date.today().isoformat()
    try:
        if not supplier_id:
            raise ValueError("Select a supplier before generating an invoice number")
        return JsonResponse({"invoice_number": _generate_invoice_number(supplier_id, purchase_date)})
    except Supplier.DoesNotExist:
        return _error("Supplier not found", 404)
    except (ValueError, TypeError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["POST"])
def login(request):
    try:
        data = _body(request)
        _require(data, ["username", "password"])
        user = User.objects.filter(username=data["username"], password=data["password"]).first()
        if not user:
            return _error("Invalid username or password", 401)
        payload = _staff_payload(user)
        ActivityLog.objects.create(user=user, action="login", details="Staff logged in", created_at=timezone.now())
        return JsonResponse({"token": signing.dumps(payload, salt=AUTH_SALT), "user": payload})
    except ValueError as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["POST"])
def register(request):
    try:
        data = _body(request)
        _require(data, ["username", "password", "full_name"])
        user = User.objects.create(
            username=str(data["username"]).strip(),
            password=data["password"],
            full_name=str(data["full_name"]).strip(),
            email=data.get("email") or None,
            role=data.get("role") or "cashier",
            monthly_salary=0,
            salary_status="active",
            created_at=timezone.now(),
        )
        payload = _staff_payload(user)
        ActivityLog.objects.create(user=user, action="register", details="Staff account created", created_at=timezone.now())
        return JsonResponse({"token": signing.dumps(payload, salt=AUTH_SALT), "user": payload}, status=201)
    except IntegrityError:
        return _error("That username is already taken.")
    except ValueError as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["POST"])
def forgot_password(request):
    try:
        data = _body(request)
        _require(data, ["username", "email", "new_password"])
        user = User.objects.filter(username=str(data["username"]).strip(), email=str(data["email"]).strip()).first()
        if not user:
            return _error("No account matched that username and email.", 404)
        user.password = data["new_password"]
        user.save(update_fields=["password"])
        ActivityLog.objects.create(user=user, action="reset password", details="Staff password reset", created_at=timezone.now())
        return JsonResponse({"message": "Password updated. You can log in now."})
    except ValueError as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def products(request):
    denied = _require_staff(request)
    if denied:
        return denied
    if request.method == "GET":
        data = Product.objects.select_related("category").order_by("product_id").values(
            "product_id",
            "category_id",
            "product_name",
            "barcode",
            "buying_price",
            "selling_price",
            "product_image",
            "specifications",
            "color",
            "stock_quantity",
            "reorder_level",
            "unit",
            "created_at",
            category_name=F("category__category_name"),
        )
        return JsonResponse(_rows(data), safe=False)

    try:
        data = _body(request)
        fields = ["category_id", "product_name", "barcode", "buying_price", "selling_price", "product_image", "specifications", "color", "stock_quantity", "reorder_level", "unit"]
        _require(data, ["category_id", "product_name", "buying_price", "selling_price", "stock_quantity", "reorder_level", "unit"])
        product = Product.objects.create(**_clean(data, fields), created_at=timezone.now())
        _log_activity(request, "create product", f"Created product #{product.product_id}: {product.product_name}")
        return _created(product.product_id)
    except (ValueError, IntegrityError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["PUT", "DELETE"])
def product_detail(request, pk):
    denied = _require_staff(request)
    if denied:
        return denied
    if request.method == "DELETE":
        usage = (
            SaleDetail.objects.filter(product_id=pk).count()
            + PurchaseDetail.objects.filter(product_id=pk).count()
            + OnlineOrderItem.objects.filter(product_id=pk).count()
        )
        if usage:
            return _error("This product is already used in transactions. Set its stock to 0 instead of deleting it.")
        Product.objects.filter(product_id=pk).delete()
        _log_activity(request, "delete product", f"Deleted product #{pk}")
        return HttpResponse(status=204)

    try:
        data = _body(request)
        fields = ["category_id", "product_name", "barcode", "buying_price", "selling_price", "product_image", "specifications", "color", "stock_quantity", "reorder_level", "unit"]
        _require(data, ["category_id", "product_name", "buying_price", "selling_price", "stock_quantity", "reorder_level", "unit"])
        Product.objects.filter(product_id=pk).update(**_clean(data, fields))
        _log_activity(request, "update product", f"Updated product #{pk}")
        return JsonResponse({"id": pk})
    except (ValueError, IntegrityError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def crud_collection(request, table):
    denied = _require_staff(request)
    if denied:
        return denied
    cfg = CRUD[table]
    model = cfg["model"]
    pk = cfg["pk"]
    if request.method == "GET":
        if table == "expenses":
            data = Expense.objects.select_related("user").order_by("expense_id").values(
                "expense_id",
                "user_id",
                "expense_name",
                "amount",
                "expense_date",
                "description",
                recorded_by=F("user__full_name"),
            )
            return JsonResponse(_rows(data), safe=False)
        return JsonResponse(_rows(model.objects.order_by(pk).values()), safe=False)

    try:
        data = _body(request)
        required = [field for field in cfg["fields"] if field not in cfg["optional"]]
        _require(data, required)
        values = _clean(data, cfg["fields"])
        if table == "users":
            values["created_at"] = timezone.now()
        obj = model.objects.create(**values)
        if table == "expenses":
            _sync_salary_expense(obj)
        _log_activity(request, f"create {table}", f"Created {table} record #{getattr(obj, pk)}")
        return _created(getattr(obj, pk))
    except (ValueError, IntegrityError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["DELETE", "PUT"])
def crud_detail(request, table, pk):
    denied = _require_staff(request)
    if denied:
        return denied
    cfg = CRUD[table]
    if request.method == "DELETE":
        if table == "expenses":
            Payroll.objects.filter(expense_id=pk).delete()
        cfg["model"].objects.filter(**{cfg["pk"]: pk}).delete()
        _log_activity(request, f"delete {table}", f"Deleted {table} record #{pk}")
        return HttpResponse(status=204)
    try:
        data = _body(request)
        required = [field for field in cfg["fields"] if field not in cfg["optional"]]
        _require(data, required)
        cfg["model"].objects.filter(**{cfg["pk"]: pk}).update(**_clean(data, cfg["fields"]))
        if table == "expenses":
            expense = Expense.objects.get(expense_id=pk)
            _sync_salary_expense(expense)
        _log_activity(request, f"update {table}", f"Updated {table} record #{pk}")
        return JsonResponse({"id": pk})
    except (ValueError, IntegrityError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def purchases(request):
    denied = _require_staff(request)
    if denied:
        return denied
    staff = _current_staff(request)
    if request.method == "POST":
        return create_purchase(request)
    latest_payment = Payment.objects.filter(purchase_id=OuterRef("purchase_id")).order_by("-payment_date", "-payment_id")
    data = Purchase.objects.select_related("supplier", "user").filter(user=staff).order_by("purchase_id").values(
        "purchase_id",
        "supplier_id",
        "user_id",
        "purchase_date",
        "total_amount",
        "payment_status",
        "invoice_number",
        supplier_name=F("supplier__supplier_name"),
        full_name=Value(staff.full_name),
        payment_method=Subquery(latest_payment.values("payment_method")[:1]),
        payment_amount=Subquery(latest_payment.values("amount")[:1]),
    )
    return JsonResponse(_rows(data), safe=False)


@csrf_exempt
@require_http_methods(["POST"])
def create_purchase(request):
    try:
        data = _body(request)
        staff = _current_staff(request)
        _require(data, ["supplier_id", "purchase_date", "payment_status"])
        if not data.get("items"):
            raise ValueError("At least one purchase item is required")
        with transaction.atomic():
            items = []
            total = 0
            for item in data["items"]:
                product = Product.objects.select_for_update().get(product_id=item["product_id"])
                quantity = int(item["quantity"])
                unit_price = float(item["unit_price"])
                subtotal = quantity * unit_price
                total += subtotal
                items.append((product, quantity, unit_price, subtotal))
            purchase = Purchase.objects.create(
                supplier_id=data["supplier_id"],
                user=staff,
                purchase_date=data["purchase_date"],
                total_amount=total,
                payment_status=data["payment_status"],
                invoice_number=data.get("invoice_number") or _generate_invoice_number(data["supplier_id"], data["purchase_date"]),
            )
            for product, quantity, unit_price, subtotal in items:
                PurchaseDetail.objects.create(purchase=purchase, product=product, quantity=quantity, unit_price=unit_price, subtotal=subtotal)
                Product.objects.filter(product_id=product.product_id).update(stock_quantity=F("stock_quantity") + quantity)
            if data["payment_status"] != "unpaid":
                _require(data, ["payment_method"])
                amount = total if data["payment_status"] == "paid" else float(data.get("payment_amount") or 0)
                if amount <= 0:
                    raise ValueError("Enter the amount paid for a partial purchase")
                if amount > total:
                    raise ValueError("Payment amount cannot exceed purchase total")
                Payment.objects.create(
                    purchase=purchase,
                    amount=amount,
                    payment_date=data["purchase_date"],
                    payment_method=data["payment_method"],
                    payment_reference=_payment_reference(data),
                )
            _log_activity(request, "create purchase", f"Created purchase #{purchase.purchase_id} for UGX {total:,.0f}")
        return _created(purchase.purchase_id)
    except Product.DoesNotExist:
        return _error("Product not found", 404)
    except (ValueError, IntegrityError, KeyError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def sales(request):
    denied = _require_staff(request)
    if denied:
        return denied
    staff = _current_staff(request)
    if request.method == "POST":
        return create_sale(request)
    data = Sale.objects.select_related("customer", "user").filter(user=staff).order_by("sale_id").values(
        "sale_id",
        "customer_id",
        "user_id",
        "sale_date",
        "total_amount",
        "payment_method",
        "discount",
        "tax",
        customer_name=F("customer__customer_name"),
        full_name=Value(staff.full_name),
    )
    return JsonResponse(_rows(data), safe=False)


@csrf_exempt
@require_http_methods(["POST"])
def create_sale(request):
    try:
        data = _body(request)
        staff = _current_staff(request)
        _require(data, ["customer_id", "sale_date", "payment_method"])
        if not data.get("items"):
            raise ValueError("At least one sale item is required")
        with transaction.atomic():
            items = []
            subtotal = 0
            for item in data["items"]:
                product = Product.objects.select_for_update().get(product_id=item["product_id"])
                quantity = int(item["quantity"])
                if quantity > product.stock_quantity:
                    raise _stock_notification(product, quantity)
                selling_price = float(item["selling_price"])
                line_total = quantity * selling_price
                subtotal += line_total
                items.append((product, quantity, selling_price, line_total))
            totals = _transaction_totals(subtotal)
            sale = Sale.objects.create(
                customer_id=data["customer_id"],
                user=staff,
                sale_date=data["sale_date"],
                total_amount=totals["total"],
                payment_method=data["payment_method"],
                payment_reference=_payment_reference(data),
                discount=totals["discount"],
                tax=totals["tax"],
            )
            for product, quantity, selling_price, line_total in items:
                SaleDetail.objects.create(sale=sale, product=product, quantity=quantity, selling_price=selling_price, subtotal=line_total)
                Product.objects.filter(product_id=product.product_id).update(stock_quantity=F("stock_quantity") - quantity)
            _log_activity(request, "create sale", f"Created sale #{sale.sale_id} for UGX {totals['total']:,.0f}")
        return _created(sale.sale_id)
    except Product.DoesNotExist:
        return _error("Product not found", 404)
    except StockNotification as exc:
        return JsonResponse({"error": str(exc), "notification": str(exc)}, status=409)
    except (ValueError, IntegrityError, KeyError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["POST"])
def walkin_transaction(request):
    denied = _require_staff(request)
    if denied:
        return denied
    try:
        data = _body(request)
        _require(data, ["sale_date", "payment_method"])
        if not data.get("items"):
            raise ValueError("At least one sale item is required")
        with transaction.atomic():
            customer_name = data.get("customer_name") or "Walk-in Customer"
            phone = data.get("phone") or "WALK-IN"
            customer = Customer.objects.filter(phone=phone).order_by("customer_id").first()
            if not customer:
                customer = Customer.objects.create(customer_name=customer_name, phone=phone)
            user = _current_staff(request)

            items = []
            subtotal = 0
            for item in data["items"]:
                product = Product.objects.select_for_update().get(product_id=item["product_id"])
                quantity = int(item["quantity"])
                if quantity <= 0:
                    raise ValueError("Quantity must be greater than zero")
                if quantity > product.stock_quantity:
                    raise _stock_notification(product, quantity)
                selling_price = float(item["selling_price"])
                line_total = quantity * selling_price
                subtotal += line_total
                items.append((product, quantity, selling_price, line_total))

            totals = _transaction_totals(subtotal)
            sale = Sale.objects.create(
                customer=customer,
                user=user,
                sale_date=data["sale_date"],
                total_amount=totals["total"],
                payment_method=data["payment_method"],
                payment_reference=_payment_reference(data),
                discount=totals["discount"],
                tax=totals["tax"],
            )
            for product, quantity, selling_price, line_total in items:
                SaleDetail.objects.create(sale=sale, product=product, quantity=quantity, selling_price=selling_price, subtotal=line_total)
                Product.objects.filter(product_id=product.product_id).update(stock_quantity=F("stock_quantity") - quantity)
            Payment.objects.create(sale=sale, amount=totals["total"], payment_date=data["sale_date"], payment_method=data["payment_method"], payment_reference=_payment_reference(data))
            _log_activity(request, "create walk-in sale", f"Created walk-in sale #{sale.sale_id} for UGX {totals['total']:,.0f}")

        return JsonResponse(
            {
                "sale_id": sale.sale_id,
                "customer_name": customer.customer_name,
                "sale_date": str(sale.sale_date),
                "payment_method": sale.payment_method,
                "payment_reference": sale.payment_reference,
                "subtotal": subtotal,
                "discount": totals["discount"],
                "tax": totals["tax"],
                "total_amount": totals["total"],
                "items": [
                    {
                        "product_name": product.product_name,
                        "quantity": quantity,
                        "selling_price": selling_price,
                        "subtotal": line_total,
                    }
                    for product, quantity, selling_price, line_total in items
                ],
            },
            status=201,
        )
    except Product.DoesNotExist:
        return _error("Product not found", 404)
    except StockNotification as exc:
        return JsonResponse({"error": str(exc), "notification": str(exc)}, status=409)
    except (ValueError, IntegrityError, KeyError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def online_orders(request):
    if request.method == "GET":
        denied = _require_staff(request)
        if denied:
            return denied
        data = OnlineOrder.objects.select_related("customer", "sale").order_by("order_id").values(
            "order_id",
            "order_number",
            "sale_id",
            "customer_id",
            "delivery_address",
            "delivery_phone",
            "delivery_method",
            "order_status",
            "payment_status",
            "notes",
            "created_at",
            customer_name=F("customer__customer_name"),
            total_amount=F("sale__total_amount"),
        )
        return JsonResponse(_rows(data), safe=False)
    return checkout(request)


@csrf_exempt
@require_http_methods(["PUT"])
def online_order_detail(request, pk):
    denied = _require_staff(request)
    if denied:
        return denied
    try:
        data = _body(request)
        _require(data, ["delivery_address", "delivery_phone", "delivery_method", "order_status", "payment_status"])
        OnlineOrder.objects.filter(order_id=pk).update(
            delivery_address=data["delivery_address"],
            delivery_phone=data["delivery_phone"],
            delivery_method=data["delivery_method"],
            order_status=data["order_status"],
            payment_status=data["payment_status"],
            notes=data.get("notes") or None,
        )
        _log_activity(request, "update online order", f"Updated online order #{pk}")
        return JsonResponse({"id": pk})
    except (ValueError, IntegrityError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["GET"])
def daily_sales_reports(_request):
    denied = _require_staff(_request)
    if denied:
        return denied
    reports = DailySalesReport.objects.order_by("report_date")[:30]
    return JsonResponse([_format_report(report) for report in reports], safe=False)


@csrf_exempt
@require_http_methods(["POST"])
def generate_daily_sales_report(request):
    denied = _require_staff(request)
    if denied:
        return denied
    try:
        data = _body(request)
        report = _generate_daily_sales_report(data.get("report_date"))
        return JsonResponse(_format_report(report), status=201)
    except (ValueError, IntegrityError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["GET"])
def sales_report(request):
    denied = _require_staff(request)
    if denied:
        return denied
    period = request.GET.get("period", "daily")
    if period not in ["daily", "weekly", "monthly", "quarterly", "yearly"]:
        period = "daily"
    start, end = _sales_report_range(period)
    details = SaleDetail.objects.select_related("sale__user", "product").filter(
        sale__sale_date__gte=start,
        sale__sale_date__lte=end,
    ).order_by("sale__sale_date", "sale_id", "product__product_name")
    rows = [
        {
            "sale_date": detail.sale.sale_date.isoformat(),
            "sales_person": detail.sale.user.full_name,
            "product_name": detail.product.product_name,
            "quantity": detail.quantity,
            "selling_price_per_product": detail.selling_price,
            "total_amount_sold": detail.subtotal,
        }
        for detail in details
    ]
    return JsonResponse(
        {
            "period": period,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "rows": rows,
        }
    )


def audit_report(request):
    denied = _require_staff(request)
    if denied:
        return denied
    period = request.GET.get("period", "daily")
    if period not in ["daily", "weekly", "monthly", "quarterly", "yearly"]:
        period = "daily"
    start, end = _sales_report_range(period)

    sales = list(Sale.objects.select_related("customer", "user").filter(sale_date__gte=start, sale_date__lte=end).order_by("sale_date", "sale_id"))
    purchases = list(Purchase.objects.select_related("supplier", "user").filter(purchase_date__gte=start, purchase_date__lte=end).order_by("purchase_date", "purchase_id"))
    expenses = list(Expense.objects.select_related("user").filter(expense_date__gte=start, expense_date__lte=end).order_by("expense_date", "expense_id"))
    payments = list(Payment.objects.select_related("sale__user", "purchase__user").filter(payment_date__gte=start, payment_date__lte=end).order_by("payment_date", "payment_id"))
    orders = list(OnlineOrder.objects.select_related("customer", "sale__user").filter(created_at__date__gte=start, created_at__date__lte=end).order_by("created_at", "order_id"))
    payrolls = list(Payroll.objects.select_related("user").filter(paid_at__gte=start, paid_at__lte=end).order_by("paid_at", "payroll_id"))

    sales_subtotal = SaleDetail.objects.filter(sale__sale_date__gte=start, sale__sale_date__lte=end).aggregate(v=Sum("subtotal"))["v"] or 0
    sales_cost = 0
    for detail in SaleDetail.objects.select_related("product").filter(sale__sale_date__gte=start, sale__sale_date__lte=end):
        sales_cost += float(detail.quantity or 0) * float(detail.product.buying_price or 0)

    sales_total = sum(float(sale.total_amount or 0) for sale in sales)
    purchase_total = sum(float(purchase.total_amount or 0) for purchase in purchases)
    expense_total = sum(float(expense.amount or 0) for expense in expenses)
    salary_expenses = sum(float(expense.amount or 0) for expense in expenses if _is_salary_expense(expense))
    operating_expenses = expense_total - salary_expenses
    payments_received = sum(float(payment.amount or 0) for payment in payments if payment.sale_id)
    supplier_payments = sum(float(payment.amount or 0) for payment in payments if payment.purchase_id)
    gross_profit = float(sales_subtotal or 0) - sales_cost
    net_profit = gross_profit - expense_total
    receivables = sales_total - payments_received
    payables = purchase_total - supplier_payments
    stock_cost_value = 0
    stock_retail_value = 0
    for product in Product.objects.all():
        stock_cost_value += float(product.stock_quantity or 0) * float(product.buying_price or 0)
        stock_retail_value += float(product.stock_quantity or 0) * float(product.selling_price or 0)

    ledger = []
    for sale in sales:
        ledger.append({
            "date": sale.sale_date.isoformat(),
            "type": "Sale",
            "reference": f"Sale #{sale.sale_id}",
            "staff": sale.user.full_name,
            "party": sale.customer.customer_name,
            "method": sale.payment_method,
            "status": "recorded",
            "debit": 0,
            "credit": sale.total_amount,
        })
    for purchase in purchases:
        ledger.append({
            "date": purchase.purchase_date.isoformat(),
            "type": "Purchase",
            "reference": purchase.invoice_number or f"Purchase #{purchase.purchase_id}",
            "staff": purchase.user.full_name,
            "party": purchase.supplier.supplier_name,
            "method": "",
            "status": purchase.payment_status,
            "debit": purchase.total_amount,
            "credit": 0,
        })
    for expense in expenses:
        ledger.append({
            "date": expense.expense_date.isoformat(),
            "type": "Expense",
            "reference": f"Expense #{expense.expense_id}",
            "staff": expense.user.full_name,
            "party": expense.expense_name,
            "method": "",
            "status": "salary" if _is_salary_expense(expense) else "operating",
            "debit": expense.amount,
            "credit": 0,
        })
    for payment in payments:
        is_receipt = bool(payment.sale_id)
        staff = payment.sale.user.full_name if payment.sale_id else payment.purchase.user.full_name
        ledger.append({
            "date": payment.payment_date.isoformat(),
            "type": "Payment received" if is_receipt else "Supplier payment",
            "reference": f"Payment #{payment.payment_id}",
            "staff": staff,
            "party": payment.payment_reference or "",
            "method": payment.payment_method,
            "status": "posted",
            "debit": 0 if is_receipt else payment.amount,
            "credit": payment.amount if is_receipt else 0,
        })
    for order in orders:
        ledger.append({
            "date": order.created_at.date().isoformat() if order.created_at else "",
            "type": "Online order",
            "reference": order.order_number,
            "staff": order.sale.user.full_name,
            "party": order.customer.customer_name,
            "method": order.delivery_method,
            "status": f"{order.order_status} / {order.payment_status}",
            "debit": 0,
            "credit": order.sale.total_amount,
        })
    for payroll in payrolls:
        ledger.append({
            "date": payroll.paid_at.isoformat() if payroll.paid_at else "",
            "type": "Payroll",
            "reference": f"Payroll #{payroll.payroll_id}",
            "staff": payroll.user.full_name,
            "party": payroll.period_month,
            "method": "",
            "status": payroll.payment_status,
            "debit": payroll.net_salary,
            "credit": 0,
        })
    ledger.sort(key=lambda row: (row["date"], row["type"], row["reference"]))

    return JsonResponse({
        "period": period,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "statement": {
            "sales_revenue": sales_total,
            "sales_subtotal": sales_subtotal,
            "cost_of_goods_sold": sales_cost,
            "gross_profit": gross_profit,
            "purchases": purchase_total,
            "expenses": expense_total,
            "salary_expenses": salary_expenses,
            "operating_expenses": operating_expenses,
            "net_profit": net_profit,
            "payments_received": payments_received,
            "supplier_payments": supplier_payments,
            "receivables": receivables,
            "payables": payables,
            "stock_cost_value": stock_cost_value,
            "stock_retail_value": stock_retail_value,
            "cash_position": payments_received - supplier_payments - expense_total,
        },
        "counts": {
            "sales": len(sales),
            "purchases": len(purchases),
            "expenses": len(expenses),
            "payments": len(payments),
            "online_orders": len(orders),
            "payrolls": len(payrolls),
            "ledger_entries": len(ledger),
        },
        "ledger": ledger,
    })


def export_audit_report(request):
    denied = _require_staff(request)
    if denied:
        return denied
    response = audit_report(request)
    if response.status_code != 200:
        return response
    data = json.loads(response.content.decode("utf-8"))
    statement = data["statement"]
    counts = data["counts"]
    ledger = data["ledger"]
    statement_rows = [
        ["Audited statement of business", f"{data['start_date']} to {data['end_date']}"],
        ["Metric", "Amount"],
        ["Sales revenue", statement["sales_revenue"]],
        ["Sales subtotal", statement["sales_subtotal"]],
        ["Cost of goods sold", statement["cost_of_goods_sold"]],
        ["Gross profit", statement["gross_profit"]],
        ["Operating expenses", statement["operating_expenses"]],
        ["Salary expenses", statement["salary_expenses"]],
        ["Net profit", statement["net_profit"]],
        ["Payments received", statement["payments_received"]],
        ["Supplier payments", statement["supplier_payments"]],
        ["Receivables", statement["receivables"]],
        ["Payables", statement["payables"]],
        ["Stock at cost", statement["stock_cost_value"]],
        ["Stock at retail", statement["stock_retail_value"]],
        ["Cash position", statement["cash_position"]],
    ]
    count_rows = [["Transaction type", "Count"]] + [[key.replace("_", " "), value] for key, value in counts.items()]
    ledger_rows = [["Date", "Type", "Reference", "Staff", "Party", "Method", "Status", "Debit", "Credit"]]
    ledger_rows += [
        [row["date"], row["type"], row["reference"], row["staff"], row["party"], row["method"], row["status"], row["debit"], row["credit"]]
        for row in ledger
    ]
    workbook = _xlsx_workbook([
        ("Statement", statement_rows),
        ("Counts", count_rows),
        ("Ledger", ledger_rows),
    ])
    filename = f"audit-report-{data['period']}-{data['start_date']}-to-{data['end_date']}.xlsx"
    file_response = HttpResponse(
        workbook.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    file_response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return file_response


@csrf_exempt
@require_http_methods(["POST"])
def checkout(request):
    try:
        data = _body(request)
        _require(data, ["customer_name", "phone", "address", "payment_method", "delivery_method"])
        if not data.get("items"):
            raise ValueError("Your cart is empty")
        mobile_money_paid = (data.get("payment_method") or "").lower() == "mobile money"
        if mobile_money_paid:
            _require(data, ["mobile_number", "mobile_pin", "mobile_balance"])
            _require_mobile_money_pin(data)
        with transaction.atomic():
            customer, _created_customer = Customer.objects.get_or_create(
                phone=data["phone"],
                defaults={
                    "customer_name": data["customer_name"],
                    "email": data.get("email") or None,
                    "address": data["address"],
                },
            )
            if customer.customer_name != data["customer_name"] or customer.address != data["address"]:
                customer.customer_name = data["customer_name"]
                customer.email = data.get("email") or customer.email
                customer.address = data["address"]
                customer.save(update_fields=["customer_name", "email", "address"])

            user = User.objects.order_by("user_id").first()
            if not user:
                raise ValueError("Create at least one staff user before checkout")

            items = []
            subtotal = 0
            for item in data["items"]:
                product = Product.objects.select_for_update().get(product_id=item["product_id"])
                quantity = int(item["quantity"])
                if quantity < 1:
                    raise ValueError("Item quantity must be at least 1")
                if quantity > product.stock_quantity:
                    raise _stock_notification(product, quantity)
                line_total = quantity * float(product.selling_price)
                subtotal += line_total
                items.append((product, quantity, float(product.selling_price), line_total))

            totals = _transaction_totals(subtotal)
            if mobile_money_paid:
                _require_mobile_money_balance(data, totals["total"])
            sale = Sale.objects.create(
                customer=customer,
                user=user,
                sale_date=date.today(),
                total_amount=totals["total"],
                payment_method=data["payment_method"],
                payment_reference=_payment_reference(data),
                discount=totals["discount"],
                tax=totals["tax"],
            )
            order = OnlineOrder.objects.create(
                sale=sale,
                customer=customer,
                order_number=f"ORD-{date.today():%Y%m%d}-{sale.sale_id:04d}",
                delivery_address=data["address"],
                delivery_phone=data["phone"],
                delivery_method=data["delivery_method"],
                payment_status="paid" if data["payment_method"] in ["card", "mobile money"] else "unpaid",
                notes=data.get("notes") or None,
                created_at=timezone.now(),
            )
            for product, quantity, selling_price, line_total in items:
                SaleDetail.objects.create(sale=sale, product=product, quantity=quantity, selling_price=selling_price, subtotal=line_total)
                OnlineOrderItem.objects.create(order=order, product=product, quantity=quantity, selling_price=selling_price, subtotal=line_total)
                Product.objects.filter(product_id=product.product_id).update(stock_quantity=F("stock_quantity") - quantity)
            seller_received = 0
            if mobile_money_paid:
                Payment.objects.create(
                    sale=sale,
                    amount=totals["total"],
                    payment_date=date.today(),
                    payment_method="mobile money",
                    payment_reference=data.get("mobile_number"),
                )
                seller_received = totals["total"]
        return JsonResponse({"id": order.order_id, "order_number": order.order_number, "subtotal": subtotal, "discount": totals["discount"], "tax": totals["tax"], "total": totals["total"], "seller_received": seller_received}, status=201)
    except Product.DoesNotExist:
        return _error("Product not found", 404)
    except StockNotification as exc:
        return JsonResponse({"error": str(exc), "notification": str(exc)}, status=409)
    except (ValueError, IntegrityError, KeyError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def payments(request):
    denied = _require_staff(request)
    if denied:
        return denied
    if request.method == "GET":
        data = Payment.objects.order_by("payment_id").values()
        return JsonResponse(_rows(data), safe=False)
    try:
        data = _body(request)
        _require(data, ["amount", "payment_date", "payment_method"])
        sale_id = data.get("sale_id") or None
        purchase_id = data.get("purchase_id") or None
        if bool(sale_id) == bool(purchase_id):
            raise ValueError("Select either a sale or a purchase for this payment")
        payment = Payment.objects.create(
            sale_id=sale_id,
            purchase_id=purchase_id,
            amount=data["amount"],
            payment_date=data["payment_date"],
            payment_method=data["payment_method"],
            payment_reference=_payment_reference(data),
        )
        _log_activity(request, "create payment", f"Created payment #{payment.payment_id} for UGX {float(data['amount']):,.0f}")
        return _created(payment.payment_id)
    except (ValueError, IntegrityError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["GET"])
def payrolls(request):
    denied = _require_staff(request)
    if denied:
        return denied
    _sync_salary_expenses()
    rows = Payroll.objects.select_related("user").order_by("payroll_id").values(
        "payroll_id",
        "user_id",
        "period_month",
        "basic_salary",
        "bonus",
        "deductions",
        "net_salary",
        "payment_status",
        "generated_at",
        "paid_at",
        employee_name=F("user__full_name"),
        position=F("user__role"),
    )
    return JsonResponse(_rows(rows), safe=False)


@csrf_exempt
@require_http_methods(["POST"])
def generate_payroll(request):
    denied = _require_staff(request)
    if denied:
        return denied
    try:
        data = _body(request)
        period_month = data.get("period_month") or date.today().strftime("%Y-%m")
        if len(period_month) != 7 or period_month[4] != "-":
            raise ValueError("Payroll month must use YYYY-MM format")
        _sync_salary_expenses(period_month)
        employees = list(User.objects.filter(salary_status="active", monthly_salary__gt=0).order_by("full_name"))
        if not employees and not Payroll.objects.filter(period_month=period_month).exists():
            raise ValueError("Add monthly salary to at least one active user before generating payroll")
        with transaction.atomic():
            for employee in employees:
                if Payroll.objects.filter(user=employee, period_month=period_month, expense__isnull=False).exists():
                    continue
                payroll, created = Payroll.objects.get_or_create(
                    user=employee,
                    period_month=period_month,
                    defaults={
                        "basic_salary": employee.monthly_salary,
                        "bonus": 0,
                        "deductions": 0,
                        "net_salary": employee.monthly_salary,
                        "payment_status": "pending",
                        "generated_at": timezone.now(),
                    },
                )
                if not created:
                    payroll.basic_salary = employee.monthly_salary
                    payroll.net_salary = employee.monthly_salary + payroll.bonus - payroll.deductions
                    payroll.save(update_fields=["basic_salary", "net_salary"])
        _log_activity(request, "generate payroll", f"Generated payroll for {period_month}")
        rows = list(Payroll.objects.select_related("user").filter(period_month=period_month).order_by("payroll_id").values(
            "payroll_id",
            "user_id",
            "period_month",
            "basic_salary",
            "bonus",
            "deductions",
            "net_salary",
            "payment_status",
            "generated_at",
            "paid_at",
            employee_name=F("user__full_name"),
            position=F("user__role"),
        ))
        return JsonResponse({"period_month": period_month, "count": len(rows), "rows": rows}, status=201)
    except (ValueError, IntegrityError) as exc:
        return _error(exc)


@csrf_exempt
@require_http_methods(["PUT"])
def payroll_detail(request, pk):
    denied = _require_staff(request)
    if denied:
        return denied
    try:
        data = _body(request)
        payroll = Payroll.objects.get(payroll_id=pk)
        payroll.bonus = float(data.get("bonus") or 0)
        payroll.deductions = float(data.get("deductions") or 0)
        payroll.payment_status = data.get("payment_status") or "pending"
        payroll.net_salary = payroll.basic_salary + payroll.bonus - payroll.deductions
        payroll.paid_at = date.today() if payroll.payment_status == "paid" else None
        if payroll.payment_status == "paid":
            if payroll.expense_id:
                payroll.expense.user_id = payroll.user_id
                payroll.expense.expense_name = f"Salary - {payroll.user.full_name}"
                payroll.expense.amount = payroll.net_salary
                payroll.expense.expense_date = date.today()
                payroll.expense.description = f"Payroll {payroll.period_month}"
                payroll.expense.save(update_fields=["user_id", "expense_name", "amount", "expense_date", "description"])
            else:
                payroll.expense = Expense.objects.create(
                    user_id=payroll.user_id,
                    expense_name=f"Salary - {payroll.user.full_name}",
                    amount=payroll.net_salary,
                    expense_date=date.today(),
                    description=f"Payroll {payroll.period_month}",
                )
        elif payroll.expense_id:
            payroll.expense.delete()
            payroll.expense = None
        payroll.save(update_fields=["bonus", "deductions", "payment_status", "net_salary", "paid_at", "expense"])
        _log_activity(request, "update payroll", f"Updated payroll #{pk}")
        return JsonResponse({"id": pk})
    except Payroll.DoesNotExist:
        return _error("Payroll record not found", 404)
    except (ValueError, IntegrityError) as exc:
        return _error(exc)
