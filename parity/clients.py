"""HTTP clients that drive the two apps like their real front ends do.

OldClient: browser-style form posts with the `_csrf_token` hidden field
(extracted from the rendered HTML exactly like the old tests/conftest.py),
redirects are NOT followed (so a mutation is one request; recurring entries are
only posted by an explicit page load). The outcome of a post is its status plus
the flash messages the route added to the Flask session cookie (decoded, not
verified: the payload is only signed, not encrypted).

NewClient: JSON calls to /api with the X-CSRF-Token header from
/api/auth/session.
"""

from __future__ import annotations

import base64
import json
import zlib

import httpx

TIMEOUT = 120


def _extract_csrf(html: str) -> str:
    for marker in ('name="_csrf_token" value="', 'name="csrf-token" content="'):
        if marker in html:
            start = html.index(marker) + len(marker)
            return html[start : html.index('"', start)]
    raise AssertionError("No CSRF token found in response HTML")


def _untag(v):
    if isinstance(v, dict):
        if len(v) == 1:
            (k, inner), = v.items()
            if k == " t":
                return [_untag(x) for x in inner]
            if k in (" m", " u", " d", " b", " i", " di"):
                return inner
        return {k: _untag(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_untag(x) for x in v]
    return v


def decode_flask_session(cookie: str | None) -> dict:
    if not cookie:
        return {}
    compressed = cookie.startswith(".")
    payload = cookie[1:] if compressed else cookie
    payload = payload.split(".", 1)[0]
    raw = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
    if compressed:
        raw = zlib.decompress(raw)
    return _untag(json.loads(raw))


class Outcome:
    def __init__(self, status: int, messages: list[str], categories: list[str] | None = None, body=None):
        self.status = status
        self.messages = messages
        self.categories = categories or []
        self.body = body

    @property
    def is_error(self) -> bool:
        return self.status >= 400 or "error" in self.categories

    def short(self) -> str:
        msg = " | ".join(self.messages)[:200]
        return f"{self.status} {msg}".strip()


class OldClient:
    kind = "old"

    def __init__(self, base: str):
        self.base = base
        self.http = httpx.Client(base_url=base, follow_redirects=False, timeout=TIMEOUT)
        self.csrf = None

    def _flashes(self):
        sess = decode_flask_session(self.http.cookies.get("session"))
        return [tuple(x) for x in sess.get("_flashes", [])]

    def _refresh_csrf(self, html: str | None = None):
        if html is None:
            html = self.http.get("/login").text
        self.csrf = _extract_csrf(html)

    def register(self, username, password, password2=None) -> Outcome:
        r = self.http.get("/register")
        if r.status_code == 200:
            self._refresh_csrf(r.text)
        elif not self.csrf:  # logged in: /register redirects; take the token from a page
            self.after_auth()
        return self.post("/register", {"username": username, "password": password, "password2": password2 if password2 is not None else password})

    def login(self, username, password) -> Outcome:
        r = self.http.get("/login")
        if r.status_code == 200:
            self._refresh_csrf(r.text)
        return self.post("/login", {"username": username, "password": password})

    def login_as(self, uid: int):
        r = self.http.get(f"/__parity/login_as/{uid}")
        r.raise_for_status()
        self.csrf = _extract_csrf(self.http.get("/", params={"panel": "settings"}).text)

    def logout(self) -> Outcome:
        return self.post("/logout", {})

    def post(self, path, data, files=None) -> Outcome:
        before = self._flashes()
        form = dict(data)
        if self.csrf:
            form["_csrf_token"] = self.csrf
        r = self.http.post(path, data=form, files=files)
        if r.status_code == 200 and "text/html" in r.headers.get("content-type", ""):
            # re-rendered form page (login/register validation): flashes were
            # consumed into the HTML; pick them out of the flash list markup
            msgs = _html_flashes(r.text)
            if "_csrf_token" in r.text:
                self._refresh_csrf(r.text)
            return Outcome(r.status_code, [m for _, m in msgs], [c for c, _ in msgs])
        after = self._flashes()
        new = after[len(before):] if after[: len(before)] == before else after
        if r.status_code == 400:
            return Outcome(400, [_text_of(r.text)], ["error"])
        if r.status_code >= 300 and r.status_code < 400 and not self.csrf_known():
            pass
        return Outcome(r.status_code, [m for _, m in new], [c for c, _ in new])

    def csrf_known(self):
        return bool(self.csrf)

    def after_auth(self):
        """Pick up the session's CSRF token from a page (rendering consumes flashes)."""
        self.csrf = _extract_csrf(self.http.get("/").text)

    def page(self, params: dict) -> tuple[str, dict]:
        r = self.http.get("/", params=params)
        if r.status_code != 200:
            raise RuntimeError(f"old page {params} -> {r.status_code}")
        ctx = self.http.get("/__parity/context").json()
        return r.text, ctx

    def get(self, path, params=None):
        return self.http.get(path, params=params)

    def close(self):
        self.http.close()


def _text_of(html: str) -> str:
    import re

    m = re.search(r"<p>(.*?)</p>", html, re.S)
    return (m.group(1) if m else html[:200]).strip()


def _html_flashes(html: str) -> list[tuple[str, str]]:
    import html as _h
    import re

    out = []
    for m in re.finditer(r'class="[^"]*flash[^"]*\b(error|success|info|warning)\b[^"]*"[^>]*>(.*?)</', html, re.S):
        out.append((m.group(1), _h.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()))
    return out


class NewClient:
    kind = "new"

    def __init__(self, base: str):
        self.base = base
        self.http = httpx.Client(base_url=base, follow_redirects=False, timeout=TIMEOUT)
        self.csrf = None
        self._session()

    def _session(self):
        r = self.http.get("/api/auth/session")
        self.csrf = r.json()["csrf_token"]
        return r.json()

    def register(self, username, password, password2=None) -> Outcome:
        return self.call("POST", "/api/auth/register", {"username": username, "password": password, "password2": password2 if password2 is not None else password})

    def login(self, username, password) -> Outcome:
        return self.call("POST", "/api/auth/login", {"username": username, "password": password})

    def login_as(self, uid: int):
        self.http.get(f"/__parity/login_as/{uid}").raise_for_status()
        self._session()

    def logout(self) -> Outcome:
        return self.call("POST", "/api/auth/logout", {})

    def after_auth(self):
        self._session()

    def call(self, method, path, json_body=None, files=None, data=None) -> Outcome:
        headers = {"X-CSRF-Token": self.csrf} if self.csrf else {}
        if files is not None:
            r = self.http.request(method, path, files=files, data=data, headers=headers)
        elif method in ("GET", "DELETE") and json_body is None:
            r = self.http.request(method, path, headers=headers)
        else:
            r = self.http.request(method, path, json=json_body, headers=headers)
        try:
            body = r.json()
        except ValueError:
            body = None
        msgs = []
        if isinstance(body, dict):
            for k in ("detail", "message"):
                if isinstance(body.get(k), str):
                    msgs.append(body[k])
                elif k == "detail" and body.get(k) is not None:
                    msgs.append(json.dumps(body[k])[:300])
            if isinstance(body.get("csrf_token"), str):
                self.csrf = body["csrf_token"]
        return Outcome(r.status_code, msgs, ["error"] if r.status_code >= 400 else ["success"], body)

    def get_json(self, path, params=None):
        r = self.http.get(path, params=params)
        if r.status_code != 200:
            raise RuntimeError(f"new GET {path} {params} -> {r.status_code} {r.text[:300]}")
        return r.json()

    def get(self, path, params=None):
        return self.http.get(path, params=params)

    def close(self):
        self.http.close()
