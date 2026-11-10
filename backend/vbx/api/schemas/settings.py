"""Settings -> Integrations (local AI, Telegram bot, notifications).

The bot token is never returned: the old page only showed whether one is saved
("Saved — leave blank to keep"), and so does `bot_token_set`.
"""

from __future__ import annotations

from pydantic import BaseModel


class AiSettings(BaseModel):
    ai_enabled: bool
    ai_provider: str  # only "ollama"
    ai_base_url: str
    ai_model: str
    ai_timeout: int  # seconds, 5..120
    ai_ocr_model: str  # blank = receipt photos off


class AiSettingsIn(BaseModel):
    """Lenient like the old form: ai_enabled true or "1" switches AI on;
    ai_timeout may be a number or a string. Omitted fields take the old form
    defaults (provider ollama, timeout 30, the rest blank/off)."""

    ai_enabled: bool | str | None = None
    ai_provider: str | None = None
    ai_base_url: str | None = None
    ai_model: str | None = None
    ai_timeout: int | str | None = None
    ai_ocr_model: str | None = None


class AiSettingsSaved(BaseModel):
    ok: bool = True
    message: str
    settings: AiSettings


class ModelsOut(BaseModel):
    models: list[str]


class TelegramServerIn(BaseModel):
    """Blank or omitted bot_token keeps the saved one."""

    bot_token: str | None = None


class TelegramServerSaved(BaseModel):
    ok: bool = True
    message: str  # "Telegram settings saved. Polling mode — no public URL needed."
    webhook_ok: bool  # result of clearing the webhook (deleteWebhook)
    webhook_message: str
    bot_token_set: bool


class TelegramLink(BaseModel):
    telegram_username: str
    linked_at: str | None
    default_account_id: int | None
    default_account_name: str | None


class TelegramLinkCode(BaseModel):
    code: str
    expires_at: str  # local time, YYYY-MM-DDTHH:MM:SS


class LinkCodeOut(TelegramLinkCode):
    ok: bool = True
    message: str


class NotifyKind(BaseModel):
    kind: str  # budget, cards, bills, weekly, monthly
    label: str


class NotifyPrefs(BaseModel):
    budget: bool
    cards: bool
    bills: bool
    weekly: bool
    monthly: bool
    card_days: int  # 1..14


class NotifyPrefsIn(BaseModel):
    """A kind is on only when true or "1" (an unticked old checkbox was simply
    absent). card_days omitted = 3."""

    budget: bool | str | None = None
    cards: bool | str | None = None
    bills: bool | str | None = None
    weekly: bool | str | None = None
    monthly: bool | str | None = None
    card_days: int | str | None = None


class NotifyPrefsSaved(BaseModel):
    ok: bool = True
    message: str
    prefs: NotifyPrefs


class DefaultAccountIn(BaseModel):
    """null or blank = "First account (auto)"."""

    default_account_id: int | str | None = None


class TelegramStatus(BaseModel):
    bot_token_set: bool
    # A bot token is configured (saved or TELEGRAM_BOT_TOKEN): linking,
    # default account and notifications are only offered then.
    enabled: bool
    bot_username: str | None  # from getMe, only when enabled and reachable
    linked: bool
    link: TelegramLink | None
    link_code: TelegramLinkCode | None  # the active (unexpired) code, when not linked
    notify_prefs: NotifyPrefs
    notify_kinds: list[NotifyKind]  # in display order


class IntegrationsOut(BaseModel):
    ai: AiSettings
    telegram: TelegramStatus
