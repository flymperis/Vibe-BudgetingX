"""Reports, ported from the Reports panel of the old routes/dashboard.py::index
(templates/panels/_reports.html). One endpoint per section.

Query parameters keep the old names' meaning: `year` is the old report_year
(blank/invalid/outside 2000-2100 = current year), `account` the old
report_account ("all", blank, invalid or not owned = all accounts), `tag` the
old tag. Only /overview and /investments value portfolios, so only they can
trigger price lookups (stored month-end prices first).
"""

from __future__ import annotations

from fastapi import APIRouter

from vbx.core.config import REPORTS_SECTIONS
from vbx.core.helpers import normalize_reports_section

from ..deps import DB, User
from ..schemas.reports import OverviewOut, ReportInvestmentsOut, SectionOut, SpendingOut, TagsOut
from ..services import reports as svc

router = APIRouter(prefix="/reports", tags=["reports"])

SECTION_ORDER = ["overview", "spending", "tags", "investments"]
assert set(SECTION_ORDER) == set(REPORTS_SECTIONS)


@router.get("/section", response_model=SectionOut)
def resolve_section(user: User, section: str = ""):
    """Old section names (bank -> overview, crypto/stocks -> investments) and
    anything unknown (-> overview), for links and bookmarks."""
    return SectionOut(section=normalize_reports_section(section), sections=SECTION_ORDER)


@router.get("/overview", response_model=OverviewOut)
def overview(user: User, conn: DB, year: str | None = None, account: str | None = None):
    return svc.overview(conn, user.id, year, account)


@router.get("/spending", response_model=SpendingOut)
def spending(user: User, conn: DB, year: str | None = None):
    return svc.spending(conn, user.id, year)


@router.get("/tags", response_model=TagsOut)
def tags(user: User, conn: DB, tag: str | None = None):
    return svc.tags_report(conn, user.id, tag)


@router.get("/investments", response_model=ReportInvestmentsOut)
def investments(user: User, conn: DB, year: str | None = None):
    return svc.investments(conn, user.id, year)
