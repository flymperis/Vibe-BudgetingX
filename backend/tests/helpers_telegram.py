"""Telegram bot test helpers, ported from the old tests/test_telegram_bot.py:
a fake Telegram API, a fake Ollama, a linked user and helpers that feed the bot
messages and button presses through telegram_bot.handle_update (the same entry
point the poller uses). The database is the real test database.

Network safety: on import, `urlopen` inside vbx.core.telegram_bot and
vbx.core.integrations is replaced for the whole test session by a function
that raises, so a test that forgets a stub fails loudly instead of contacting
Telegram or an Ollama server (this also covers the bot's background "typing"
thread outliving a test's monkeypatch).
"""

from __future__ import annotations

import itertools
import json

import pytest

from vbx.core import integrations, shared, telegram_bot
from vbx.core.finance import fetch_account_balances_through

from .conftest import get_connection, register_and_login


def _no_network(*_args, **_kwargs):
    raise AssertionError("tests must not touch the network (urlopen called)")


telegram_bot.urlopen = _no_network
integrations.urlopen = _no_network

_chat_ids = itertools.count(555000)
_current = {"chat": None}

BOT_CONFIG = {"bot_token": "T"}

AI_ON = {"ai_enabled": True, "ai_base_url": "http://ollama", "ai_model": "qwen3:8b", "ai_timeout": 30}


class FakeTelegram:
    def __init__(self):
        self.calls = []
        self.next_id = 100

    def __call__(self, method, payload, token):
        if method == "sendChatAction":
            return {"ok": True}, None
        self.calls.append((method, payload))
        self.next_id += 1
        return {"ok": True, "result": {"message_id": self.next_id}}, None

    def sent(self, method="sendMessage"):
        return [p for m, p in self.calls if m == method]

    def last_text(self):
        return [p["text"] for m, p in self.calls if m in ("sendMessage", "editMessageText")][-1]

    def last_keyboard(self):
        for _m, p in reversed(self.calls):
            if "reply_markup" in p:
                return p["reply_markup"]["inline_keyboard"]
        return None


@pytest.fixture
def tg(monkeypatch):
    fake = FakeTelegram()
    monkeypatch.setattr(telegram_bot, "_telegram_api", fake)
    return fake


def fake_ai(monkeypatch, replies):
    """replies: list of dicts returned in order; records prompts."""
    prompts = []

    def chat(base, model, prompt, **kw):
        prompts.append(prompt)
        return json.dumps(replies.pop(0)) if replies else None

    monkeypatch.setattr(integrations, "ollama_chat", chat)
    return prompts


def linked_user(client, username, chat=None, ai=None):
    """A registered user linked to a fresh chat, which send/press then use."""
    chat = chat or next(_chat_ids)
    _current["chat"] = chat
    register_and_login(client, username)
    conn = get_connection()
    uid = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()["id"]
    conn.execute("INSERT INTO telegram_links (user_id, chat_id) VALUES (?, ?)", (uid, str(chat)))
    for name in ("Revolut", "Cash"):
        conn.execute("INSERT INTO accounts (user_id, name, opening_balance) VALUES (?, ?, 0)", (uid, name))
    for name in ("Delivery", "Entertainment", "Super Market"):
        conn.execute("INSERT OR IGNORE INTO categories (user_id, name) VALUES (?, ?)", (uid, name))
    integrations.save_user_integrations(
        conn,
        uid,
        {
            "ai_enabled": bool(ai),
            "ai_provider": "ollama",
            "ai_base_url": "http://ollama" if ai else "",
            "ai_model": "qwen3:8b" if ai else "",
            "ai_timeout": 30,
            "ai_ocr_model": "glm-ocr" if ai else "",
        },
    )
    conn.commit()
    conn.close()
    return uid


def next_chat() -> int:
    return next(_chat_ids)


def current_chat():
    return _current["chat"]


def send(text=None, chat=None, **message):
    chat = chat or _current["chat"]
    msg = {"chat": {"id": chat}, "from": {"username": "u"}, **message}
    if text is not None:
        msg["text"] = text
    conn = get_connection()
    try:
        telegram_bot.handle_update({"update_id": 1, "message": msg}, conn, fetch_account_balances_through, BOT_CONFIG)
    finally:
        conn.close()


def press(data, message_id=101, chat=None):
    chat = chat or _current["chat"]
    conn = get_connection()
    try:
        telegram_bot.handle_update(
            {
                "update_id": 2,
                "callback_query": {
                    "id": "cb",
                    "data": data,
                    "message": {"message_id": message_id, "chat": {"id": chat}},
                },
            },
            conn,
            fetch_account_balances_through,
            BOT_CONFIG,
        )
    finally:
        conn.close()


def rows(sql, *params):
    conn = get_connection()
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def button(keyboard, text):
    for row in keyboard:
        for b in row:
            if b["text"] == text:
                return b["callback_data"]
    raise AssertionError(f"no button {text!r} in {keyboard}")


def shared_group(uid, name, members):
    """What the old POST /shared/groups/add did with `new_members` (plain
    names): a group with the user and those contacts as active members."""
    conn = get_connection()
    try:
        gid = shared.create_group(conn, uid, name)
        for member in members:
            shared.add_member(conn, gid, shared.find_or_create_person(conn, uid, member))
        conn.commit()
    finally:
        conn.close()
    return gid
