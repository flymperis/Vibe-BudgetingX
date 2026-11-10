"""Expense and income categories (Settings > Expense categories / Income categories)."""

from __future__ import annotations

from pydantic import BaseModel


class CategoryIn(BaseModel):
    name: str | None = ""


class CategoryOut(BaseModel):
    id: int
    name: str
    # What a delete would be refused for (old routes/categories.py
    # _count_references): ledger rows (expenses or income entries) and
    # recurring rules of the matching type that still use the category.
    entry_count: int
    rule_count: int
    can_delete: bool  # entry_count == 0 and rule_count == 0


class CategoryListOut(BaseModel):
    items: list[CategoryOut]  # ordered by name, like the old settings panel
