"""Excel export / migration template / import, ported from the old
routes/data_io.py. The workbook logic is vbx.core.excel_io, unchanged."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response
from openpyxl import load_workbook

from vbx.core.excel_io import _build_export_workbook, _build_migration_template_workbook, _run_import_workbook

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.common import OkOut

router = APIRouter(tags=["excel"])

XLSX_MIMETYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx(wb, filename: str) -> Response:
    buffer = BytesIO()
    wb.save(buffer)
    return Response(
        content=buffer.getvalue(),
        media_type=XLSX_MIMETYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # what Flask's send_file(max_age=0) sent
            "Cache-Control": "no-cache, max-age=0",
        },
    )


@router.get("/export/excel", response_class=Response)
def export_excel(user: User, conn: DB):
    """budget-export-YYYYMMDD-HHMM.xlsx with every sheet (format version 2+)."""
    wb = _build_export_workbook(conn, user.id)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    return _xlsx(wb, f"budget-export-{stamp}.xlsx")


@router.get("/export/migration-template", response_class=Response)
def export_migration_template(user: User):
    return _xlsx(_build_migration_template_workbook(), "budget-migration-template.xlsx")


@router.post("/import/excel", response_model=OkOut)
def import_excel(
    user: User,
    file: UploadFile | str | None = File(None),
    replace_movements: str | None = Form(None),
    sync_opening_balances: str | None = Form(None),
):
    """multipart/form-data: file (.xlsx), replace_movements=1,
    sync_opening_balances=1. All or nothing: any error rolls the whole import
    back and is answered 400 "Import failed. ..." (first 8 errors)."""
    # A browser with no file chosen sends an empty part, which arrives as a str.
    if file is None or isinstance(file, str) or (file.filename or "").strip() == "":
        raise ApiError(400, "Choose an Excel file (.xlsx).")

    replace = replace_movements == "1"
    sync = sync_opening_balances == "1"

    raw = file.file.read()
    if not raw:
        raise ApiError(400, "The uploaded file is empty.")

    try:
        workbook = load_workbook(BytesIO(raw), data_only=True)
    except Exception as exc:
        raise ApiError(400, f"Could not read the Excel file: {exc}") from None

    # _run_import_workbook opens (and always closes) its own connection, in
    # one transaction, like the old route.
    errors = _run_import_workbook(workbook, replace, sync, user.id)
    if errors:
        preview = "; ".join(errors[:8])
        extra = f" (+{len(errors) - 8} more)" if len(errors) > 8 else ""
        raise ApiError(400, f"Import failed. {preview}{extra}")

    return OkOut(
        message="Import completed. Accounts/categories from the file were merged (new names added)."
        + (
            " Existing expense and income rows were replaced by the file."
            if replace
            else " Movement rows from the file were added (existing rows kept)."
        )
    )
