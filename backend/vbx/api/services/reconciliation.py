"""Month end reconciliation.

The user types the real balance of some accounts and cards. Each account's
difference (real - recorded) is first evened out with transfers between the
entered accounts: money moves from accounts that have too much on record to
those that have too little. Whatever the transfers cannot cover (the
differences do not add up to zero) is booked on the "Other" category with the
note "balancing input": an expense where money is missing, an income where
there is more than recorded.

All amounts are worked out in whole cents so the plan always lands exactly.
"""

from __future__ import annotations

from dataclasses import dataclass

BALANCING_NOTE = "balancing input"
TRANSFER_NOTE = "Month end reconciliation"
OTHER_CATEGORY = "Other"


@dataclass(frozen=True)
class Move:
    """A transfer from_id -> to_id, or an adjustment on account_id."""

    from_id: int | None
    to_id: int | None
    cents: int


def to_cents(value: float) -> int:
    return int(round(float(value) * 100))


def plan_moves(diffs: dict[int, int], order: dict[int, int] | None = None) -> tuple[list[Move], list[Move]]:
    """(transfers, adjustments) that bring every account to its target.

    diffs: account id -> cents to add (target - recorded). Transfers pair the
    largest surplus with the largest shortfall first, which keeps the number
    of transfers small. `order` (id -> position) breaks ties so the plan is
    the same every time. An adjustment with to_id is an income into that
    account, one with from_id an expense out of it; cents are always > 0."""
    pos = order or {}

    def key(item):
        aid, cents = item
        return (-abs(cents), pos.get(aid, 0), aid)

    needs = sorted(((a, c) for a, c in diffs.items() if c > 0), key=key)  # want money in
    extras = sorted(((a, -c) for a, c in diffs.items() if c < 0), key=key)  # have money to give
    needs = [list(x) for x in needs]
    extras = [list(x) for x in extras]

    transfers: list[Move] = []
    i = j = 0
    while i < len(extras) and j < len(needs):
        amount = min(extras[i][1], needs[j][1])
        transfers.append(Move(extras[i][0], needs[j][0], amount))
        extras[i][1] -= amount
        needs[j][1] -= amount
        if extras[i][1] == 0:
            i += 1
        if needs[j][1] == 0:
            j += 1

    # Income into accounts still short, expenses out of those still over.
    adjustments = [Move(None, aid, c) for aid, c in needs if c > 0]
    adjustments += [Move(aid, None, c) for aid, c in extras if c > 0]
    return transfers, adjustments
