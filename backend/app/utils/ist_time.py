"""Platform timezone: Indian Standard Time (Asia/Kolkata). Instants are stored in UTC."""

from datetime import datetime, timezone
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
IST_OFFSET_MINUTES = 5 * 60 + 30


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def now_ist() -> datetime:
    return datetime.now(IST)


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def month_bounds_ist(now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    """UTC range [start, end) for the current calendar month in IST."""
    ref = ensure_utc(now) if now is not None else utc_now()
    ref_ist = ref.astimezone(IST)
    start_ist = datetime(ref_ist.year, ref_ist.month, 1, tzinfo=IST)
    if ref_ist.month == 12:
        end_ist = datetime(ref_ist.year + 1, 1, 1, tzinfo=IST)
    else:
        end_ist = datetime(ref_ist.year, ref_ist.month + 1, 1, tzinfo=IST)
    return start_ist.astimezone(timezone.utc), end_ist.astimezone(timezone.utc)
