"""Settings -> Integrations, ported from the old routes/settings.py (writes)
and the integrations part of routes/dashboard.py::index +
templates/panels/_settings.html (read side).

Everything that talks to Ollama or Telegram goes through vbx.core.integrations
/ vbx.core.telegram_bot so tests can stub it.
"""

from __future__ import annotations

import json
from urllib.error import HTTPError, URLError

from fastapi import APIRouter

from vbx.core import integrations, telegram_bot, telegram_notify

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.common import OkOut
from ..schemas.settings import (
    AiSettings,
    AiSettingsIn,
    AiSettingsSaved,
    DefaultAccountIn,
    IntegrationsOut,
    LinkCodeOut,
    ModelsOut,
    NotifyKind,
    NotifyPrefs,
    NotifyPrefsIn,
    NotifyPrefsSaved,
    TelegramLink,
    TelegramLinkCode,
    TelegramServerIn,
    TelegramServerSaved,
    TelegramStatus,
    WhisperSettings,
    WhisperSettingsIn,
    WhisperSettingsSaved,
)

router = APIRouter(prefix="/settings", tags=["settings"])


def _checkbox(value) -> str | None:
    """An old checkbox posted "1" when ticked and nothing otherwise."""
    return "1" if value is True or value == "1" else None


def _form(pairs: dict) -> dict:
    """A form-like mapping for the core parse_*_form functions: fields that
    were not sent are left out, exactly like an absent form field."""
    return {key: value for key, value in pairs.items() if value is not None}


def _ai_form(body: AiSettingsIn) -> dict:
    return _form(
        {
            "ai_provider": body.ai_provider,
            "ai_enabled": _checkbox(body.ai_enabled),
            "ai_base_url": body.ai_base_url,
            "ai_model": body.ai_model,
            "ai_ocr_model": body.ai_ocr_model,
            "ai_timeout": body.ai_timeout,
        }
    )


def _parse_ai(body: AiSettingsIn) -> dict:
    try:
        return integrations.parse_integration_form(_ai_form(body))
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None


def _parse_whisper(body: WhisperSettingsIn) -> dict:
    form = _form(
        {
            "whisper_enabled": _checkbox(body.whisper_enabled),
            "whisper_url": body.whisper_url,
            "whisper_model": body.whisper_model,
            "whisper_language": body.whisper_language,
        }
    )
    try:
        return integrations.parse_whisper_form(form)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None


def _whisper_out(conn, uid: int) -> WhisperSettings:
    return WhisperSettings(
        **integrations.get_whisper_user_settings(conn, uid),
        default_model=integrations.DEFAULT_WHISPER_MODEL,
    )


def _parse_server(conn, body: TelegramServerIn) -> dict:
    existing = telegram_bot.get_server_config(conn)
    try:
        return telegram_bot.parse_server_config_form(_form({"bot_token": body.bot_token}), existing)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None


def _prefs_out(prefs: dict) -> NotifyPrefs:
    return NotifyPrefs(**prefs)


# --- read side ----------------------------------------------------------------------


@router.get("/integrations", response_model=IntegrationsOut)
def get_integrations(user: User, conn: DB):
    """Everything the old Settings -> Integrations section showed. The bot
    token itself is never returned (the old page only said it was saved)."""
    uid = user.id
    user_integrations = integrations.get_user_integrations(conn, uid)
    telegram_server = telegram_bot.server_config_for_form(conn)
    telegram_link = telegram_bot.get_telegram_link(conn, uid)
    telegram_link_code = telegram_bot.get_active_link_code(conn, uid)
    telegram_notify_prefs = telegram_notify.get_prefs(conn, uid)
    telegram_cfg = telegram_bot.get_server_config(conn)
    telegram_enabled = telegram_bot.is_configured(telegram_cfg)
    telegram_bot_username = None
    if telegram_enabled:
        telegram_bot_username = telegram_bot.get_bot_username(telegram_cfg)

    link = None
    if telegram_link is not None:
        linked_at = telegram_link["linked_at"]
        link = TelegramLink(
            telegram_username=telegram_link["telegram_username"] or "",
            linked_at=None if linked_at is None else str(linked_at),
            default_account_id=telegram_link["default_account_id"],
            default_account_name=telegram_link["default_account_name"],
        )
    code = None
    if telegram_link_code is not None:
        code = TelegramLinkCode(code=telegram_link_code["code"], expires_at=str(telegram_link_code["expires_at"]))

    return IntegrationsOut(
        ai=AiSettings(**user_integrations),
        whisper=_whisper_out(conn, uid),
        telegram=TelegramStatus(
            bot_token_set=telegram_server["bot_token_set"],
            enabled=telegram_enabled,
            bot_username=telegram_bot_username,
            linked=link is not None,
            link=link,
            link_code=code,
            notify_prefs=_prefs_out(telegram_notify_prefs),
            notify_kinds=[NotifyKind(kind=k, label=v) for k, v in telegram_notify.KINDS.items()],
        ),
    )


# --- local AI (Ollama) --------------------------------------------------------------


@router.put("/integrations/ai", response_model=AiSettingsSaved)
def save_integrations(body: AiSettingsIn, user: User, conn: DB):
    settings = _parse_ai(body)
    integrations.save_user_integrations(conn, user.id, settings)
    return AiSettingsSaved(
        message="Integration settings saved.",
        settings=AiSettings(**integrations.get_user_integrations(conn, user.id)),
    )


@router.post("/integrations/ai/test", response_model=OkOut)
def test_integrations(body: AiSettingsIn, user: User):
    """Tests the settings as typed (not saved). 200 with ok=false when the
    connection test fails; 400 only when the form itself is invalid."""
    settings = _parse_ai(body)
    ok, message = integrations.test_ai_connection(settings)
    return OkOut(ok=ok, message=message)


@router.get("/integrations/ai/models", response_model=ModelsOut)
def list_integration_models(user: User, base_url: str | None = None):
    base_url = (base_url or "").strip().rstrip("/")
    if not base_url:
        raise ApiError(400, "Base URL is required.")
    try:
        integrations._normalize_base_url(base_url)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None
    timeout = integrations.DEFAULT_AI_TIMEOUT
    try:
        models = integrations.fetch_ollama_models(base_url, timeout=timeout)
    except HTTPError as exc:
        raise ApiError(502, f"Ollama responded with HTTP {exc.code}.") from None
    except URLError as exc:
        raise ApiError(502, f"Could not reach Ollama: {exc.reason}") from None
    except (json.JSONDecodeError, OSError, TimeoutError) as exc:
        raise ApiError(502, f"Connection failed: {exc}") from None
    return ModelsOut(models=models)


# --- voice messages (Whisper) -----------------------------------------------------------


@router.put("/integrations/whisper", response_model=WhisperSettingsSaved)
def save_whisper(body: WhisperSettingsIn, user: User, conn: DB):
    settings = _parse_whisper(body)
    integrations.save_whisper_user_settings(conn, user.id, settings)
    return WhisperSettingsSaved(message="Voice settings saved.", settings=_whisper_out(conn, user.id))


@router.post("/integrations/whisper/test", response_model=OkOut)
def test_whisper(body: WhisperSettingsIn, user: User):
    """Tests the settings as typed (not saved), even while voice is switched off."""
    settings = _parse_whisper(body)
    ok, message = integrations.test_whisper_connection(
        integrations.whisper_config({**settings, "whisper_enabled": True})
    )
    return OkOut(ok=ok, message=message)


# --- Telegram bot ---------------------------------------------------------------------


@router.put("/telegram/server", response_model=TelegramServerSaved)
def save_telegram_server(body: TelegramServerIn, user: User, conn: DB):
    """The bot is one per server (not per user), as in the old app."""
    settings = _parse_server(conn, body)
    telegram_bot.save_server_config(conn, settings)
    ok, message = telegram_bot.clear_webhook(settings)
    return TelegramServerSaved(
        message="Telegram settings saved. Polling mode — no public URL needed.",
        webhook_ok=ok,
        webhook_message=message,
        bot_token_set=telegram_bot.server_config_for_form(conn)["bot_token_set"],
    )


@router.post("/telegram/test", response_model=OkOut)
def test_telegram_server(body: TelegramServerIn, user: User, conn: DB):
    """getMe with the token typed (blank = the saved one). 200 with ok=false
    when Telegram says no."""
    settings = _parse_server(conn, body)
    ok, message = telegram_bot.test_telegram_connection(settings)
    return OkOut(ok=ok, message=message)


@router.post("/telegram/link-code", response_model=LinkCodeOut)
def telegram_generate_code(user: User, conn: DB):
    config = telegram_bot.get_server_config(conn)
    if not telegram_bot.is_configured(config):
        raise ApiError(400, "Configure the Telegram bot below first.")
    code = telegram_bot.create_link_code(conn, user.id)
    row = telegram_bot.get_active_link_code(conn, user.id)
    return LinkCodeOut(
        code=code,
        expires_at=str(row["expires_at"]) if row is not None else "",
        message=f"Link code: {code} (15 min). In Telegram send: /link {code}",
    )


@router.post("/telegram/unlink", response_model=OkOut)
def telegram_unlink(user: User, conn: DB):
    telegram_bot.unlink_telegram(conn, user.id)
    return OkOut(message="Telegram unlinked.")


@router.put("/telegram/default-account", response_model=OkOut)
def telegram_default_account(body: DefaultAccountIn, user: User, conn: DB):
    """Fails (400) for a junk id, someone else's account, or when this user
    has no linked chat."""
    raw = "" if body.default_account_id is None else str(body.default_account_id).strip()
    if raw:
        try:
            account_id = int(raw)
        except (TypeError, ValueError):
            raise ApiError(400, "Could not update default account.") from None
    else:
        account_id = None
    if not telegram_bot.set_default_account(conn, user.id, account_id):
        raise ApiError(400, "Could not update default account.")
    return OkOut(message="Telegram default account updated.")


@router.put("/telegram/notifications", response_model=NotifyPrefsSaved)
def telegram_notifications(body: NotifyPrefsIn, user: User, conn: DB):
    form = _form({f"notify_{kind}": _checkbox(getattr(body, kind)) for kind in telegram_notify.KINDS})
    if body.card_days is not None:
        form["card_days"] = body.card_days
    try:
        prefs = telegram_notify.parse_prefs_form(form)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None
    telegram_notify.save_prefs(conn, user.id, prefs)
    return NotifyPrefsSaved(
        message="Telegram notifications saved.",
        prefs=_prefs_out(telegram_notify.get_prefs(conn, user.id)),
    )
