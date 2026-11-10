from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlparse
from . import integrations
import secrets

from .config import ALLOWED_PANELS, INVESTMENTS_SECTIONS, LEGACY_REPORTS_SECTIONS, REPORTS_SECTIONS, SETTINGS_SECTIONS


def get_csrf_token(session) -> str:
    token = session.get("_csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token

def normalize_expense_amount(raw):
    """Signed expense movements: negative = spending, positive = refund/credit."""
    try:
        value = float(str(raw).strip())
    except (TypeError, ValueError):
        value = 0.0
    return value

def normalize_income_amount(raw):
    """Income amounts are stored positive."""
    try:
        value = float(str(raw).strip())
    except (TypeError, ValueError):
        value = 0.0
    return abs(value)

def normalize_list_page(value):
    try:
        return max(1, int(str(value).strip()))
    except (TypeError, ValueError):
        return 1

def normalize_optional_category_id(raw):
    """Positive category id from query/form string, or None."""
    s = (raw or "").strip()
    if not s:
        return None
    try:
        n = int(s)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None

def normalize_day_of_month(value):
    try:
        d = int(str(value).strip())
        return min(31, max(1, d))
    except (TypeError, ValueError):
        return 1

def normalize_optional_positive_int(value):
    """Positive integer from form string, or None when blank/invalid."""
    s = str(value or "").strip()
    if not s:
        return None
    try:
        n = int(s)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None

def normalize_year(value):
    raw = (value or "").strip()
    if not raw:
        return datetime.now().year
    try:
        year_num = int(raw)
        if year_num < 2000 or year_num > 2100:
            raise ValueError
        return year_num
    except ValueError:
        return datetime.now().year

def resolve_month_filter_from_request(args):
    """Primary UI month: ?month=YYYY-MM or ?cal_year=&cal_month= (from dropdowns)."""
    raw = (args.get("month") or "").strip()
    if raw:
        return normalize_month(raw)
    y_raw = (args.get("cal_year") or "").strip()
    m_raw = (args.get("cal_month") or "").strip()
    if y_raw and m_raw:
        try:
            y, m = int(y_raw), int(m_raw)
            if 2000 <= y <= 2100 and 1 <= m <= 12:
                return f"{y:04d}-{m:02d}"
        except ValueError:
            pass
    return normalize_month("")

def resolve_list_month_filter(args, legacy_key, year_key, month_key):
    """Expense/income list month: legacy ?exp_month= or dropdown ?exp_cal_year=&exp_cal_month=."""
    m_raw = (args.get(month_key) or "").strip()
    if not m_raw:
        return parse_optional_month(args.get(legacy_key))
    y_raw = (args.get(year_key) or "").strip()
    if not y_raw:
        return parse_optional_month(args.get(legacy_key))
    try:
        formed = f"{int(y_raw):04d}-{int(m_raw):02d}"
        return parse_optional_month(formed)
    except ValueError:
        return parse_optional_month(args.get(legacy_key))

def parse_optional_month(value):
    """YYYY-MM for list filters, or None when absent / invalid."""
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        parts = raw.split("-", 1)
        if len(parts) != 2:
            return None
        year_num, month_num = int(parts[0]), int(parts[1])
        if year_num < 2000 or year_num > 2100 or month_num < 1 or month_num > 12:
            return None
        return f"{year_num:04d}-{month_num:02d}"
    except ValueError:
        return None

def month_bounds_dates(ym_str):
    """Half-open calendar month as YYYY-MM-DD dates (start inclusive, end exclusive)."""
    ys, ms = ym_str.split("-", 1)
    month_start = datetime(int(ys), int(ms), 1)
    month_end = month_start + timedelta(days=32)
    month_end = month_end.replace(day=1)
    return (month_start.strftime("%Y-%m-%d"), month_end.strftime("%Y-%m-%d"))

def normalize_month(value):
    raw = (value or "").strip()
    if not raw:
        return datetime.now().strftime("%Y-%m")
    try:
        year_str, month_str = raw.split("-", 1)
        month_year = int(year_str)
        month_num = int(month_str)
        if month_num < 1 or month_num > 12:
            raise ValueError
        return f"{month_year:04d}-{month_num:02d}"
    except ValueError:
        return datetime.now().strftime("%Y-%m")

def normalize_settings_section(value):
    section = (value or "").strip().lower()
    return section if section in SETTINGS_SECTIONS else "general"

def coerce_txn_day(raw):
    """Normalize stored/form raw values to YYYY-MM-DD, or '' if empty."""
    if raw is None:
        return ""
    text = str(raw).strip()
    if not text:
        return ""
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        head = text[:10]
        try:
            datetime.strptime(head, "%Y-%m-%d")
            return head
        except ValueError:
            pass
    try:
        normalized = text.replace(" ", "T", 1)
        if len(normalized) == 10:
            normalized = f"{normalized}T00:00:00"
        parsed = datetime.fromisoformat(normalized)
        return parsed.date().isoformat()
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return datetime.strptime(text, fmt).date().isoformat()
            except ValueError:
                continue
    return text[:10] if len(text) >= 10 else ""

def normalize_txn_day_from_form(raw):
    """Form submission: blank date defaults to today (calendar day only)."""
    return coerce_txn_day(raw) or datetime.now().date().isoformat()

def normalize_reports_section(value):
    section = (value or "").strip().lower()
    if section in REPORTS_SECTIONS:
        return section
    return LEGACY_REPORTS_SECTIONS.get(section, "overview")

def normalize_report_account(value, conn, user_id):
    raw = (value or "").strip().lower()
    if not raw or raw == "all":
        return None
    try:
        account_id = int(raw)
    except ValueError:
        return None
    row = conn.execute(
        "SELECT id FROM accounts WHERE id = ? AND user_id = ?",
        (account_id, int(user_id)),
    ).fetchone()
    return int(row["id"]) if row else None

def normalize_investments_section(value):
    section = (value or "").strip().lower()
    return section if section in INVESTMENTS_SECTIONS else "crypto"

def _lookup_category_id(conn, name, user_id, expense=True):
    uid = int(user_id)
    table = "categories" if expense else "income_categories"
    row = conn.execute(
        f"SELECT id FROM {table} WHERE user_id = ? AND name = ?",
        (uid, name.strip()),
    ).fetchone()
    return row["id"] if row else None

def _lookup_account_id(conn, name, user_id):
    uid = int(user_id)
    row = conn.execute(
        "SELECT id FROM accounts WHERE user_id = ? AND name = ?",
        (uid, name.strip()),
    ).fetchone()
    return row["id"] if row else None

def _user_owns_category(conn, category_id, user_id, *, expense):
    table = "categories" if expense else "income_categories"
    return (
        conn.execute(
            f"SELECT 1 FROM {table} WHERE id = ? AND user_id = ?",
            (int(category_id), int(user_id)),
        ).fetchone()
        is not None
    )

def _user_owns_account(conn, account_id, user_id):
    return (
        conn.execute(
            "SELECT 1 FROM accounts WHERE id = ? AND user_id = ?",
            (int(account_id), int(user_id)),
        ).fetchone()
        is not None
    )

def _safe_next_url(raw):
    if not raw or not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text.startswith("/") or text.startswith("//"):
        return None
    return text

def _parse_category_choice(raw):
    """Return ('expense'|'income', category_id) or (None, None)."""
    s = (raw or "").strip()
    if s.startswith("e-"):
        try:
            return "expense", int(s[2:])
        except ValueError:
            return None, None
    if s.startswith("i-"):
        try:
            return "income", int(s[2:])
        except ValueError:
            return None, None
    return None, None

def _recurring_category_ok(conn, entry_type, category_id, user_id):
    uid = int(user_id)
    if entry_type == "expense":
        return conn.execute(
            "SELECT 1 FROM categories WHERE id = ? AND user_id = ?",
            (category_id, uid),
        ).fetchone()
    if entry_type == "income":
        return conn.execute(
            "SELECT 1 FROM income_categories WHERE id = ? AND user_id = ?",
            (category_id, uid),
        ).fetchone()
    return None

def _parse_recurring_duration(form):
    indefinite = form.get("indefinitely") == "1"
    if indefinite:
        return None
    months_to_run = normalize_optional_positive_int(form.get("months_to_run"))
    if months_to_run is None:
        raise ValueError("Choose how many times the recurring rule should run, or enable Indefinitely.")
    return months_to_run

RECURRING_INTERVAL_UNITS = ("week", "month", "year")
RECURRING_MAX_INTERVAL = 99

def _parse_recurring_schedule(form):
    """(interval_unit, interval_count, start_date) from a rule form.

    start_date is a YYYY-MM-DD string, or None when the form has no
    start_date field at all (older clients post only day_of_month). Missing
    unit/count mean the original "every month"."""
    unit = (form.get("interval_unit") or "month").strip().lower()
    if unit not in RECURRING_INTERVAL_UNITS:
        raise ValueError("Repeat unit must be weeks, months or years.")
    count_raw = (form.get("interval_count") or "1").strip() or "1"
    try:
        count = int(count_raw)
    except ValueError:
        raise ValueError("Repeat every must be a whole number.") from None
    if not 1 <= count <= RECURRING_MAX_INTERVAL:
        raise ValueError(f"Repeat every must be between 1 and {RECURRING_MAX_INTERVAL}.")
    if "start_date" not in form:
        return unit, count, None
    raw = (form.get("start_date") or "").strip()
    try:
        start = datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError("Choose the date of the first entry.") from None
    return unit, count, start.isoformat()

def _parse_opening_balance(raw):
    text = (raw or "0").strip() or "0"
    try:
        return float(text)
    except (TypeError, ValueError):
        return None
