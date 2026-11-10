"""Shared expenses (groups, people, bills, settlements), ported from the old
routes/shared.py and the Shared panel (shared.panel_context).

Money in responses is in euros (2 decimals, as shared.cents_to_amount gives
it); the database keeps integer cents. Names are as the *viewer* sees them:
their own person is "You", other users show under the viewer's own contact
name for them, else their login.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from .common import IdName

# --- requests ---------------------------------------------------------------
# Lenient like the old forms: ids may be numbers or strings, amounts may be
# numbers or strings ("12,50" works), flags may be true/false or "1".

Flag = bool | int | str | None
LooseId = int | str | None
LooseAmount = float | int | str | None
NameList = str | list[str] | None


class NameIn(BaseModel):
    """A name, or several comma separated (adding people)."""

    name: str | None = ""


class LinkIn(BaseModel):
    username: str | None = ""


class MembersIn(BaseModel):
    """Who to put in a group: picked contacts (member_ids and/or person_id),
    new plain names and server usernames to invite (comma separated strings or
    lists). Your own person is always in a group you create."""

    member_ids: list[LooseId] = Field(default_factory=list)
    person_id: LooseId = None
    new_members: NameList = None
    usernames: NameList = None


class GroupIn(MembersIn):
    name: str | None = ""


class ExpenseIn(BaseModel):
    """A shared bill. included/values mirror the activity item's payload:
    included = person ids taking part (equal split), values = {person_id:
    raw amount / percentage / share count} for the other methods. Members not
    listed are not included and have a blank value.

    record_personal: also put my side into my own books; then category_id is
    needed when I have a share and account_id (a real account, not Shared
    balances) when I paid."""

    description: str | None = ""
    amount: LooseAmount = None
    paid_by: LooseId = None
    split_method: str | None = "equal"
    spent_on: str | None = ""
    included: list[LooseId] = Field(default_factory=list)
    values: dict[str, str | float | int | None] = Field(default_factory=dict)
    record_personal: Flag = False
    category_id: LooseId = None
    account_id: LooseId = None


class RecordExpenseIn(BaseModel):
    category_id: LooseId = None
    account_id: LooseId = None


class SettlementIn(BaseModel):
    from_person_id: LooseId = None
    to_person_id: LooseId = None
    amount: LooseAmount = None
    paid_on: str | None = ""
    notes: str | None = ""
    record_personal: Flag = False
    account_id: LooseId = None


class RecordSettlementIn(BaseModel):
    account_id: LooseId = None


class SharedActionOut(BaseModel):
    """Answer to every shared mutation. group_id is the group the old app went
    back to after the action (None = the groups overview, e.g. after deleting
    or leaving a group)."""

    ok: bool = True
    message: str
    group_id: int | None = None


# --- overview -----------------------------------------------------------------


class ContactOut(BaseModel):
    id: int
    name: str
    login: str | None  # linked server user, None for a plain name
    group_count: int  # groups this person is in (any status); 0 = removable/unlinkable


class InvitationOut(BaseModel):
    id: int  # group id
    name: str  # group name
    owner: str  # who invited you (display name)


class GroupSummaryOut(BaseModel):
    id: int
    name: str
    member_names: list[str]  # you first, then by name
    my_net: float  # > 0 you get back, < 0 you owe, 0 settled up
    shared_with_users: int  # other active users in the group (> 0 = "shared" tag)


class FriendBalanceOut(BaseModel):
    name: str
    amount: float  # > 0 owes you, < 0 you owe them


class SplitMethodOut(BaseModel):
    key: str
    label: str


class SharedOverviewOut(BaseModel):
    contacts: list[ContactOut]
    invitations: list[InvitationOut]
    groups: list[GroupSummaryOut]
    friend_balances: list[FriendBalanceOut]
    owed_to_me: float
    i_owe: float
    net: float  # owed_to_me - i_owe
    ledger_account_id: int | None  # your "Shared balances" account, once it exists
    own_accounts: list[IdName]  # accounts you can pay from / receive into (not Shared balances)
    split_methods: list[SplitMethodOut]


# --- one group ----------------------------------------------------------------


class MemberOut(BaseModel):
    id: int  # person id
    name: str
    is_me: bool
    is_user: bool  # linked to a server login
    login: str | None
    is_owner: bool  # the group's creator
    status: Literal["active", "invited", "declined"]
    net: float  # > 0 gets back, < 0 owes
    removable: bool  # not the creator and not in any bill/payment ("Leave" when is_me)


class SuggestionOut(BaseModel):
    from_id: int
    to_id: int
    from_name: str
    to_name: str
    amount: float
    involves_me: bool


class SplitOut(BaseModel):
    person_id: int
    name: str
    share: float
    input_value: str  # percentage / share count / exact amount as typed ("" for equal)


class ExpensePayloadOut(BaseModel):
    """The bill as the edit form needs it (send it back as ExpenseIn)."""

    id: int
    description: str
    amount: str  # "12.50"
    spent_on: str
    paid_by: int
    split_method: str
    included: list[int]
    values: dict[str, str]
    record_personal: bool  # you have recorded it in your books
    category_id: int | None  # your recording choice
    account_id: int | None


class ExpenseActivityOut(BaseModel):
    kind: Literal["expense"]
    id: int
    date: str
    description: str
    amount: float
    paid_by_name: str
    added_by: str  # "you" or the user's display name
    split_method: str
    method_label: str
    splits: list[SplitOut]  # you first, then by name
    effect: float  # what the bill did to your balance: > 0 you lent, < 0 you borrowed
    effect_text: str  # "you lent" / "you paid only your share" / "you borrowed" / "not involved"
    involved: bool  # you have a share or paid ("Add to my budget" possible)
    i_paid: bool
    my_share: float
    recorded: bool  # in your budget
    record_incomplete: bool  # recorded, but a category/account it now needs is missing
    payload: ExpensePayloadOut


class SettlementActivityOut(BaseModel):
    kind: Literal["settlement"]
    id: int
    date: str
    from_name: str
    to_name: str
    amount: float
    notes: str
    added_by: str
    effect: float  # > 0 you paid, < 0 you received
    involved: bool
    i_paid: bool
    recorded: bool  # in your accounts


ActivityOut = Annotated[ExpenseActivityOut | SettlementActivityOut, Field(discriminator="kind")]


class ExpenseDefaultsOut(BaseModel):
    """What the old "new shared expense" form started with."""

    paid_by: int | None  # you
    split_method: str  # "equal"
    included: list[int]  # every member
    spent_on: str  # today
    record_personal: bool  # True


class SettlementDefaultsOut(BaseModel):
    """What the old "settle up" form started with: the first suggested payment,
    else you paying the second member in the list."""

    from_person_id: int | None
    to_person_id: int | None
    amount: float | None
    paid_on: str  # today
    record_personal: bool  # True


class GroupDetailOut(GroupSummaryOut):
    is_owner: bool  # you created it (only you can delete it)
    owner_name: str
    me_id: int | None  # your person id in this group
    members: list[MemberOut]  # you first, then by name
    suggestions: list[SuggestionOut]  # fewest payments that settle everyone
    activity: list[ActivityOut]  # newest first; on one day bills before payments
    total_spent: float  # group spending (sum of bills)
    addable_contacts: list[ContactOut]  # your contacts not in the group yet
    expense_defaults: ExpenseDefaultsOut
    settlement_defaults: SettlementDefaultsOut
