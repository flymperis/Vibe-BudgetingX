"""Auth contract (docs/ARCHITECTURE.md) with the old routes/auth.py rules."""

from fastapi.testclient import TestClient
from werkzeug.security import generate_password_hash

from vbx.api.routers import auth as auth_router
from vbx.core import config

from .conftest import DEFAULT_PASSWORD, csrf_token, get_connection, register_and_login, user_id

USERNAME_RULE = "Username must be 3–32 characters (letters, digits, . _ -)."


def _register(client, username, password=DEFAULT_PASSWORD, password2=None):
    return client.post(
        "/api/auth/register",
        json={"username": username, "password": password, "password2": password if password2 is None else password2},
        headers={"X-CSRF-Token": csrf_token(client)},
    )


def _login(client, username, password=DEFAULT_PASSWORD):
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
        headers={"X-CSRF-Token": csrf_token(client)},
    )


def test_session_when_logged_out(client):
    resp = client.get("/api/auth/session")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"] is None
    assert body["allow_registration"] is True
    assert len(body["csrf_token"]) > 20
    # the token is stable for the session
    assert client.get("/api/auth/session").json()["csrf_token"] == body["csrf_token"]


def test_register_logs_in_and_seeds_defaults(client):
    resp = _register(client, "seeded")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["username"] == "seeded"
    assert body["csrf_token"]
    assert client.get("/api/auth/session").json()["user"] == body["user"]

    uid = user_id("seeded")
    assert body["user"]["id"] == uid
    conn = get_connection()
    cats = [r["name"] for r in conn.execute("SELECT name FROM categories WHERE user_id = ? ORDER BY id", (uid,))]
    incs = [r["name"] for r in conn.execute("SELECT name FROM income_categories WHERE user_id = ? ORDER BY id", (uid,))]
    accs = [
        (r["name"], r["opening_balance"])
        for r in conn.execute("SELECT name, opening_balance FROM accounts WHERE user_id = ?", (uid,))
    ]
    conn.close()
    assert cats == ["General", "Other"]
    assert incs == ["General", "Salary", "Other"]
    assert accs == [("Main", 0.0)]


def test_register_validation_messages(client):
    cases = [
        ("ab", DEFAULT_PASSWORD, None, USERNAME_RULE),
        ("bad name!", DEFAULT_PASSWORD, None, USERNAME_RULE),
        ("x" * 33, DEFAULT_PASSWORD, None, USERNAME_RULE),
        ("shortpw", "1234567", None, "Password must be at least 8 characters."),
        ("mismatch", DEFAULT_PASSWORD, "something-else", "Passwords do not match."),
    ]
    for username, password, password2, message in cases:
        resp = _register(client, username, password, password2)
        assert resp.status_code == 400, username
        assert resp.json() == {"detail": message}
    assert client.get("/api/auth/session").json()["user"] is None


def test_register_duplicate_username_case_insensitive(client, app):
    assert _register(client, "Taken.User").status_code == 200
    other = TestClient(app)
    resp = _register(other, "taken.user")
    assert resp.status_code == 400
    assert resp.json() == {"detail": "That username is already taken."}


def test_register_when_logged_in_is_refused(client):
    register_and_login(client, "already-in")
    resp = _register(client, "second-account")
    assert resp.status_code == 400


def test_registration_disabled(client, monkeypatch):
    monkeypatch.setattr(config, "ALLOW_REGISTRATION", False)
    assert client.get("/api/auth/session").json()["allow_registration"] is False
    resp = _register(client, "nobody")
    assert resp.status_code == 403
    assert resp.json() == {"detail": "Registration is disabled."}


def test_login_logout_login(client, app):
    register_and_login(client, "loginuser")
    fresh = TestClient(app)
    resp = _login(fresh, "  loginuser  ")  # username is stripped, as in the old form
    assert resp.status_code == 200
    assert resp.json()["user"]["username"] == "loginuser"
    token = resp.json()["csrf_token"]
    assert fresh.get("/api/bootstrap").status_code == 200
    assert fresh.post("/api/auth/logout", headers={"X-CSRF-Token": token}).status_code == 200
    assert fresh.get("/api/auth/session").json()["user"] is None
    assert fresh.get("/api/bootstrap").status_code == 401


def test_bad_credentials_are_401_with_one_message(client, app):
    register_and_login(client, "realuser")
    fresh = TestClient(app)
    for username, password in (("realuser", "wrong-password"), ("no-such-user", DEFAULT_PASSWORD)):
        resp = _login(fresh, username, password)
        assert resp.status_code == 401
        assert resp.json() == {"detail": "Invalid username or password."}
    assert fresh.get("/api/auth/session").json()["user"] is None


def test_unknown_user_still_runs_a_hash_check(client, monkeypatch):
    """Timing protection: an unknown username is checked against the dummy hash."""
    seen = []
    real = auth_router.check_password_hash

    def spy(pwhash, password):
        seen.append(pwhash)
        return real(pwhash, password)

    monkeypatch.setattr(auth_router, "check_password_hash", spy)
    resp = _login(client, "ghost-user", "whatever-password")
    assert resp.status_code == 401
    assert seen == [config._DUMMY_PASSWORD_HASH]


def test_werkzeug_hashes_from_the_old_app_still_log_in(client):
    """Existing users keep their passwords: hashes are plain werkzeug ones."""
    conn = get_connection()
    conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        ("legacy-user", generate_password_hash("legacy-password-1")),
    )
    conn.commit()
    conn.close()
    assert _login(client, "legacy-user", "legacy-password-1").status_code == 200


def test_every_mutation_needs_the_csrf_header(client):
    api = register_and_login(client, "csrf-user")
    for method, url in (
        ("POST", "/api/auth/login"),
        ("POST", "/api/auth/register"),
        ("POST", "/api/auth/logout"),
        ("POST", "/api/expenses"),
        ("PUT", "/api/expenses/1"),
        ("DELETE", "/api/expenses/1"),
    ):
        for headers in ({}, {"X-CSRF-Token": "wrong"}):
            resp = client.request(method, url, json={}, headers=headers)
            assert resp.status_code == 403, (method, url, headers)
            assert resp.json() == {"detail": "Invalid or missing CSRF token."}
    # logged in and with the right token the same request gets through CSRF
    assert api.post("/api/expenses", json={}).status_code == 400


def test_protected_endpoints_need_login(client):
    token = csrf_token(client)
    assert client.get("/api/bootstrap").status_code == 401
    assert client.get("/api/expenses").json() == {"detail": "Not logged in."}
    resp = client.post("/api/expenses", json={}, headers={"X-CSRF-Token": token})
    assert resp.status_code == 401


def test_tampered_session_cookie_is_ignored(client):
    register_and_login(client, "tamper-user")
    good = client.cookies.get("vbx_session")
    client.cookies.clear()
    client.cookies.set("vbx_session", good[:-4] + ("AAAA" if not good.endswith("AAAA") else "BBBB"))
    assert client.get("/api/auth/session").json()["user"] is None
    assert client.get("/api/bootstrap").status_code == 401
