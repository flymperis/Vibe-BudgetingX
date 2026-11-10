"""Settings -> Integrations API: every validation branch and message of the
old routes/settings.py, the read side of the integrations section, and the
rule that the bot token is never handed back. Ollama and Telegram are stubbed."""

import itertools
from urllib.error import HTTPError, URLError

import pytest
from fastapi.testclient import TestClient

from vbx.core import integrations, telegram_bot

from .conftest import ApiClient, csrf_token, get_connection, register_and_login, user_id

SECRET = "123456:SECRET-TOKEN-never-shown"
_users = itertools.count(1)


class FakeTelegram:
    """getMe answers @vbx_bot (or fails), deleteWebhook succeeds; records calls."""

    def __init__(self):
        self.calls = []
        self.fail = None

    def __call__(self, method, payload, token):
        self.calls.append((method, token))
        if self.fail:
            return None, self.fail
        if method == "getMe":
            return {"ok": True, "result": {"username": "vbx_bot"}}, None
        return {"ok": True, "result": {"message_id": 1}}, None


@pytest.fixture
def tg(monkeypatch):
    fake = FakeTelegram()
    monkeypatch.setattr(telegram_bot, "_telegram_api", fake)
    return fake


@pytest.fixture
def bot_token():
    """The bot token is one per server: always clear it after the test."""

    def set_token(value):
        conn = get_connection()
        conn.execute("UPDATE telegram_server_config SET bot_token = ? WHERE id = 1", (value,))
        conn.commit()
        conn.close()

    yield set_token
    set_token("")


def _saved(username):
    conn = get_connection()
    try:
        return integrations.get_user_integrations(conn, user_id(username))
    finally:
        conn.close()


# --- auth ---------------------------------------------------------------------------


def test_everything_needs_login_and_csrf(client):
    assert client.get("/api/settings/integrations").status_code == 401
    assert client.get("/api/settings/integrations/ai/models?base_url=http://x").status_code == 401
    anon = ApiClient(client, csrf_token(client))
    assert anon.put("/api/settings/integrations/ai", json={}).status_code == 401
    register_and_login(client, "set-csrf")
    assert client.put("/api/settings/integrations/ai", json={}).status_code == 403
    assert client.post("/api/settings/telegram/unlink").status_code == 403


# --- read side ------------------------------------------------------------------------


def test_defaults_for_a_new_user(client, tg):
    api = register_and_login(client, "set-defaults")
    body = api.get("/api/settings/integrations").json()
    assert body["ai"] == {
        "ai_enabled": False,
        "ai_provider": "ollama",
        "ai_base_url": "",
        "ai_model": "",
        "ai_timeout": 30,
        "ai_ocr_model": "",
    }
    t = body["telegram"]
    assert (t["bot_token_set"], t["enabled"], t["bot_username"], t["linked"], t["link"], t["link_code"]) == (
        False,
        False,
        None,
        False,
        None,
        None,
    )
    assert t["notify_prefs"] == {
        "budget": True,
        "cards": True,
        "bills": True,
        "weekly": True,
        "monthly": True,
        "card_days": 3,
    }
    assert [k["kind"] for k in t["notify_kinds"]] == ["budget", "cards", "bills", "weekly", "monthly"]
    assert t["notify_kinds"][0]["label"] == "Budget alerts (80% and 100% of a category)"
    assert tg.calls == []  # no bot configured: Telegram is not asked anything


def test_configured_bot_shows_its_name_but_never_the_token(client, tg, bot_token):
    api = register_and_login(client, "set-bot")
    bot_token(SECRET)
    resp = api.get("/api/settings/integrations")
    assert SECRET not in resp.text
    t = resp.json()["telegram"]
    assert (t["bot_token_set"], t["enabled"], t["bot_username"]) == (True, True, "vbx_bot")
    tg.fail = "Could not reach Telegram API: offline"
    assert api.get("/api/settings/integrations").json()["telegram"]["bot_username"] is None


# --- local AI ---------------------------------------------------------------------------


def test_ai_settings_are_saved_normalised(client):
    api = register_and_login(client, "set-ai")
    resp = api.put(
        "/api/settings/integrations/ai",
        json={
            "ai_enabled": True,
            "ai_provider": " Ollama ",
            "ai_base_url": " https://ollama.local:11434/ ",
            "ai_model": " qwen3:8b ",
            "ai_timeout": 45,
            "ai_ocr_model": " glm-ocr ",
        },
    )
    assert resp.status_code == 200, resp.text
    expected = {
        "ai_enabled": True,
        "ai_provider": "ollama",
        "ai_base_url": "https://ollama.local:11434",
        "ai_model": "qwen3:8b",
        "ai_timeout": 45,
        "ai_ocr_model": "glm-ocr",
    }
    assert resp.json() == {"ok": True, "message": "Integration settings saved.", "settings": expected}
    assert _saved("set-ai") == expected
    assert api.get("/api/settings/integrations").json()["ai"] == expected

    # Only true / "1" switches AI on (an unticked checkbox sent nothing); blank
    # base URL and model are fine while off; omitted timeout = 30.
    for off in (False, "0", "true", None):
        resp = api.put("/api/settings/integrations/ai", json={"ai_enabled": off})
        assert resp.status_code == 200, off
        assert resp.json()["settings"] == {
            "ai_enabled": False,
            "ai_provider": "ollama",
            "ai_base_url": "",
            "ai_model": "",
            "ai_timeout": 30,
            "ai_ocr_model": "",
        }


@pytest.mark.parametrize(
    "body,message",
    [
        ({"ai_provider": "openai"}, "Unsupported AI provider"),
        ({"ai_base_url": "ollama:11434"}, "Base URL must start with http:// or https://"),
        ({"ai_timeout": "soon"}, "Timeout must be a number of seconds"),
        ({"ai_timeout": ""}, "Timeout must be a number of seconds"),
        ({"ai_timeout": 4}, "Timeout must be between 5 and 120 seconds"),
        ({"ai_timeout": "121"}, "Timeout must be between 5 and 120 seconds"),
        ({"ai_enabled": "1", "ai_model": "llama3"}, "Base URL is required when AI is enabled"),
        ({"ai_enabled": "1", "ai_base_url": "http://x"}, "Model name is required when AI is enabled"),
    ],
)
def test_ai_settings_validation(client, body, message):
    username = f"set-ai-bad-{next(_users)}"
    api = register_and_login(TestClient(client.app), username)
    good = {"ai_enabled": True, "ai_base_url": "http://ok:11434", "ai_model": "keep", "ai_timeout": 30}
    assert api.put("/api/settings/integrations/ai", json=good).status_code == 200
    for path, method in (("/api/settings/integrations/ai", api.put), ("/api/settings/integrations/ai/test", api.post)):
        resp = method(path, json=body)
        assert resp.status_code == 400, (path, resp.text)
        assert resp.json() == {"detail": message}
    assert _saved(username)["ai_model"] == "keep"  # nothing saved


def test_ai_connection_test_uses_the_typed_settings_and_saves_nothing(client, monkeypatch):
    api = register_and_login(client, "set-ai-test")
    seen = []

    def fake_fetch(url, *, timeout, method="GET", payload=None):
        seen.append((url, timeout))
        return {"models": [{"name": "qwen3:8b"}, {"name": "glm-ocr:latest"}]}

    monkeypatch.setattr(integrations, "_fetch_json", fake_fetch)
    monkeypatch.setattr(integrations, "ollama_chat", lambda base, model, prompt, **kw: "OK")
    resp = api.post(
        "/api/settings/integrations/ai/test",
        json={"ai_enabled": "1", "ai_base_url": "http://gpu:11434/", "ai_model": "qwen3", "ai_timeout": "20"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "message": "Connected. Model 'qwen3:8b' replied: OK"}
    assert seen == [("http://gpu:11434/api/tags", 20)]
    assert _saved("set-ai-test")["ai_base_url"] == ""

    resp = api.post("/api/settings/integrations/ai/test", json={"ai_model": "nope"})
    assert resp.json() == {"ok": False, "message": "Set a Base URL first."}

    def unreachable(url, **kw):
        raise URLError("connection refused")

    monkeypatch.setattr(integrations, "_fetch_json", unreachable)
    resp = api.post("/api/settings/integrations/ai/test", json={"ai_base_url": "http://gpu:11434"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": False, "message": "Could not reach Ollama: connection refused"}


def test_models_list(client, monkeypatch):
    api = register_and_login(client, "set-models")
    calls = []

    def fake_models(base_url, *, timeout):
        calls.append((base_url, timeout))
        return ["glm-ocr:latest", "qwen3:8b"]

    monkeypatch.setattr(integrations, "fetch_ollama_models", fake_models)
    resp = api.get("/api/settings/integrations/ai/models", params={"base_url": " http://gpu:11434/ "})
    assert resp.status_code == 200 and resp.json() == {"models": ["glm-ocr:latest", "qwen3:8b"]}
    assert calls == [("http://gpu:11434", integrations.DEFAULT_AI_TIMEOUT)]

    for params, message in (
        ({}, "Base URL is required."),
        ({"base_url": "  / "}, "Base URL is required."),
        ({"base_url": "gpu:11434"}, "Base URL must start with http:// or https://"),
    ):
        resp = api.get("/api/settings/integrations/ai/models", params=params)
        assert resp.status_code == 400 and resp.json() == {"detail": message}, params

    for exc, message in (
        (HTTPError("http://gpu", 500, "boom", {}, None), "Ollama responded with HTTP 500."),
        (URLError("no route"), "Could not reach Ollama: no route"),
        (TimeoutError("timed out"), "Connection failed: timed out"),
    ):

        def failing(base_url, *, timeout, exc=exc):
            raise exc

        monkeypatch.setattr(integrations, "fetch_ollama_models", failing)
        resp = api.get("/api/settings/integrations/ai/models", params={"base_url": "http://gpu"})
        assert resp.status_code == 502 and resp.json() == {"detail": message}


# --- Telegram server config --------------------------------------------------------------


def test_bot_token_is_required_then_kept_when_left_blank(client, tg, bot_token):
    api = register_and_login(client, "set-token")
    bot_token("")
    for body in ({}, {"bot_token": "   "}):
        for method, path in ((api.put, "/api/settings/telegram/server"), (api.post, "/api/settings/telegram/test")):
            resp = method(path, json=body)
            assert resp.status_code == 400 and resp.json() == {"detail": "Bot token is required"}
    assert tg.calls == []

    resp = api.put("/api/settings/telegram/server", json={"bot_token": f"  {SECRET}  "})
    assert resp.status_code == 200
    assert SECRET not in resp.text
    assert resp.json() == {
        "ok": True,
        "message": "Telegram settings saved. Polling mode — no public URL needed.",
        "webhook_ok": True,
        "webhook_message": "Webhook cleared — polling mode active",
        "bot_token_set": True,
    }
    assert tg.calls == [("deleteWebhook", SECRET)]
    conn = get_connection()
    assert telegram_bot.get_server_config(conn)["bot_token"] == SECRET
    conn.close()

    # Blank keeps the saved token (the field said "Saved — leave blank to keep").
    tg.fail = "Could not reach Telegram API: offline"
    resp = api.put("/api/settings/telegram/server", json={"bot_token": ""})
    assert resp.status_code == 200
    assert (resp.json()["webhook_ok"], resp.json()["webhook_message"]) == (
        False,
        "Could not reach Telegram API: offline",
    )
    conn = get_connection()
    assert telegram_bot.get_server_config(conn)["bot_token"] == SECRET
    conn.close()


def test_bot_token_test(client, tg, bot_token):
    api = register_and_login(client, "set-token-test")
    bot_token(SECRET)
    resp = api.post("/api/settings/telegram/test", json={})
    assert resp.json() == {"ok": True, "message": "Connected to @vbx_bot"}
    assert tg.calls[-1] == ("getMe", SECRET)
    resp = api.post("/api/settings/telegram/test", json={"bot_token": "999:typed"})
    assert tg.calls[-1] == ("getMe", "999:typed")
    tg.fail = "Telegram API HTTP 401: Unauthorized"
    resp = api.post("/api/settings/telegram/test", json={})
    assert resp.status_code == 200
    assert resp.json() == {"ok": False, "message": "Telegram API HTTP 401: Unauthorized"}
    conn = get_connection()
    assert telegram_bot.get_server_config(conn)["bot_token"] == SECRET  # testing saves nothing
    conn.close()


# --- linking ---------------------------------------------------------------------------


def test_link_code_needs_a_bot_then_is_shown_until_linked(client, tg, bot_token):
    api = register_and_login(client, "set-link")
    uid = user_id("set-link")
    bot_token("")
    resp = api.post("/api/settings/telegram/link-code")
    assert resp.status_code == 400 and resp.json() == {"detail": "Configure the Telegram bot below first."}

    bot_token(SECRET)
    first = api.post("/api/settings/telegram/link-code").json()
    code = first["code"]
    assert len(code) == 8 and code.isalnum() and code.upper() == code
    assert first["message"] == f"Link code: {code} (15 min). In Telegram send: /link {code}"
    second = api.post("/api/settings/telegram/link-code").json()
    t = api.get("/api/settings/integrations").json()["telegram"]
    assert t["linked"] is False
    assert t["link_code"] == {"code": second["code"], "expires_at": second["expires_at"]}
    conn = get_connection()
    codes = conn.execute("SELECT code FROM telegram_link_codes WHERE user_id = ?", (uid,)).fetchall()
    conn.close()
    assert [r["code"] for r in codes] == [second["code"]]  # a new code replaces the old one

    # Linking from the chat (/link CODE) shows up as the link status.
    from .helpers_telegram import send

    send(f"/link {second['code']}", chat=4242001)
    t = api.get("/api/settings/integrations").json()["telegram"]
    assert t["linked"] is True
    assert t["link"]["telegram_username"] == "u" and t["link"]["linked_at"]
    assert (t["link"]["default_account_id"], t["link"]["default_account_name"]) == (None, None)

    resp = api.post("/api/settings/telegram/unlink")
    assert resp.json() == {"ok": True, "message": "Telegram unlinked."}
    t = api.get("/api/settings/integrations").json()["telegram"]
    assert (t["linked"], t["link"], t["link_code"]) == (False, None, None)


def _link(uid, chat):
    conn = get_connection()
    conn.execute("INSERT INTO telegram_links (user_id, chat_id) VALUES (?, ?)", (uid, str(chat)))
    conn.commit()
    conn.close()


def test_default_account(client, tg):
    other = register_and_login(TestClient(client.app), "set-default-other")
    del other
    api = register_and_login(client, "set-default")
    uid = user_id("set-default")
    conn = get_connection()
    mine = conn.execute("SELECT id, name FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()
    theirs = conn.execute(
        "SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (user_id("set-default-other"),)
    ).fetchone()["id"]
    conn.close()

    fail = {"detail": "Could not update default account."}
    resp = api.put("/api/settings/telegram/default-account", json={"default_account_id": mine["id"]})
    assert resp.status_code == 400 and resp.json() == fail  # not linked yet

    _link(uid, 4242002)
    for junk in ("abc", "1.5", theirs, 999999):
        resp = api.put("/api/settings/telegram/default-account", json={"default_account_id": junk})
        assert resp.status_code == 400 and resp.json() == fail, junk

    resp = api.put("/api/settings/telegram/default-account", json={"default_account_id": f" {mine['id']} "})
    assert resp.json() == {"ok": True, "message": "Telegram default account updated."}
    link = api.get("/api/settings/integrations").json()["telegram"]["link"]
    assert (link["default_account_id"], link["default_account_name"]) == (mine["id"], mine["name"])

    for auto in ({"default_account_id": ""}, {"default_account_id": None}, {}):
        assert api.put("/api/settings/telegram/default-account", json=auto).status_code == 200
        link = api.get("/api/settings/integrations").json()["telegram"]["link"]
        assert link["default_account_id"] is None


# --- notifications ----------------------------------------------------------------------


def test_notification_prefs(client):
    api = register_and_login(client, "set-notify")
    resp = api.put(
        "/api/settings/telegram/notifications",
        json={"budget": True, "cards": "1", "bills": False, "weekly": "0", "card_days": 14},
    )
    assert resp.status_code == 200
    assert resp.json()["prefs"] == {
        "budget": True,
        "cards": True,
        "bills": False,
        "weekly": False,
        "monthly": False,
        "card_days": 14,
    }
    resp = api.put("/api/settings/telegram/notifications", json={})
    assert resp.json()["prefs"] == {
        "budget": False,
        "cards": False,
        "bills": False,
        "weekly": False,
        "monthly": False,
        "card_days": 3,
    }

    for days, message in (
        ("abc", "Days before the card payment must be a number."),
        ("", "Days before the card payment must be a number."),
        (0, "Days before the card payment must be between 1 and 14."),
        ("15", "Days before the card payment must be between 1 and 14."),
    ):
        resp = api.put("/api/settings/telegram/notifications", json={"budget": True, "card_days": days})
        assert resp.status_code == 400 and resp.json() == {"detail": message}, days
    prefs = api.get("/api/settings/integrations").json()["telegram"]["notify_prefs"]
    assert prefs["budget"] is False and prefs["card_days"] == 3  # nothing saved by a failed form
