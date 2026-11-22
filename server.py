import hashlib
import json
import os
import secrets
import sqlite3
import unicodedata
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import regex


ROOT = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get("DATABASE_URL", "")
DATABASE = Path(os.environ.get("BLOOM_DATABASE", ROOT / "data" / "bloom.sqlite3"))
SESSION_COOKIE = "bloom_session"
SESSION_DAYS = 400
MAX_BODY = 2 * 1024 * 1024
EMPTY_STATE = {
    "tasks": [],
    "schedule": [],
    "items": [],
    "notes": [],
    "meals": [],
    "mood": None,
    "moments": [],
    "journal": ["", "", ""],
    "cycle": {"start": "", "end": "", "reminder": False},
    "milestones": [],
}


def execute(connection, query, parameters=()):
    if DATABASE_URL:
        query = query.replace("?", "%s")
    return connection.execute(query, parameters)


@contextmanager
def open_database():
    if DATABASE_URL:
        import psycopg
        from psycopg.rows import dict_row

        connection = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    else:
        DATABASE.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(DATABASE, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    with open_database() as connection:
        tables = [
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS user_state (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
        ]
        if DATABASE_URL:
            tables[0] = tables[0].replace(
                "INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY"
            )
            tables[0] = tables[0].replace("BLOB NOT NULL", "BYTEA NOT NULL")
            tables[1] = tables[1].replace("INTEGER NOT NULL", "BIGINT NOT NULL")
            tables[2] = tables[2].replace("INTEGER PRIMARY KEY", "BIGINT PRIMARY KEY")
        for table in tables:
            execute(connection, table)


def now_utc():
    return datetime.now(timezone.utc)


def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class BloomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        return

    def send_json(self, status, payload, cookie=None, clear_cookie=False):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if clear_cookie:
            self.send_header(
                "Set-Cookie",
                f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
            )
        elif cookie:
            secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
            self.send_header(
                "Set-Cookie",
                f"{SESSION_COOKIE}={cookie}; Path=/; HttpOnly; SameSite=Strict; "
                f"Max-Age={SESSION_DAYS * 86400}{secure}",
            )
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length < 1 or length > MAX_BODY:
            return None
        try:
            value = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        return value if isinstance(value, dict) else None

    def get_user(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            token = cookie[SESSION_COOKIE].value
        except Exception:
            return None
        token_digest = hash_token(token)
        current_time = now_utc().isoformat()
        with open_database() as connection:
            row = execute(connection,
                """
                SELECT users.id, users.username, users.display_name
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ? AND sessions.expires_at > ?
                """,
                (token_digest, current_time),
            ).fetchone()
        return dict(row) if row else None

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/api/health":
            return self.send_json(200, {"ok": True})
        if route == "/api/me":
            user = self.get_user()
            if not user:
                return self.send_json(401, {"error": "请先登录"})
            return self.send_json(200, {"user": user})
        if route == "/api/state":
            user = self.get_user()
            if not user:
                return self.send_json(401, {"error": "请先登录"})
            with open_database() as connection:
                row = execute(connection,
                    "SELECT payload FROM user_state WHERE user_id = ?", (user["id"],)
                ).fetchone()
            if not row:
                return self.send_json(200, {"state": EMPTY_STATE})
            try:
                state = json.loads(row["payload"])
            except json.JSONDecodeError:
                return self.send_json(500, {"error": "个人数据无法读取"})
            return self.send_json(200, {"state": state})
        return super().do_GET()

    def do_POST(self):
        route = urlparse(self.path).path
        body = self.read_json()
        if body is None:
            return self.send_json(400, {"error": "请求内容无效"})

        if route == "/api/auth/register":
            nickname = body.get("nickname")
            if not isinstance(nickname, str):
                return self.send_json(400, {"error": "请填写昵称。"})
            display_name = unicodedata.normalize("NFC", nickname.strip())
            if (
                regex.search(r"[\p{Cc}\p{Cs}]", display_name)
                or len(display_name.encode("utf-8")) > 512
                or len(regex.findall(r"\X", display_name)) > 10
                or not regex.search(r"[\p{L}\p{N}\p{P}\p{S}]", display_name)
            ):
                return self.send_json(400, {"error": "请输入 1–10 个可见字符，可以使用中文、英文、数字或表情。"})
            current = self.get_user()
            if current:
                return self.send_json(200, {"user": current})
            username = unicodedata.normalize("NFC", display_name.lower())
            token = secrets.token_urlsafe(32)
            now = now_utc()
            with open_database() as connection:
                user = execute(
                    connection,
                    """
                    INSERT INTO users (username, display_name, password_salt, password_hash, created_at)
                    SELECT ?, ?, ?, ?, ?
                    WHERE NOT EXISTS (
                        SELECT 1 FROM users WHERE length(password_hash) > 0 AND lower(display_name) = ?
                    )
                    ON CONFLICT(username) DO NOTHING
                    RETURNING id, display_name
                    """,
                    (username, display_name, b"", b"", now.isoformat(), username),
                ).fetchone()
                if not user:
                    return self.send_json(409, {"error": "这个昵称已被使用，请换一个。"})
                execute(
                    connection,
                    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                    (hash_token(token), user["id"], (now + timedelta(days=SESSION_DAYS)).isoformat()),
                )
            return self.send_json(201, {"user": dict(user)}, cookie=token)

        if route == "/api/auth/login":
            return self.send_json(410, {"error": "请刷新页面，使用昵称进入。"})

        if route == "/api/auth/logout":
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get("Cookie", ""))
                token = cookie[SESSION_COOKIE].value
            except Exception:
                token = ""
            if token:
                with open_database() as connection:
                    execute(connection,
                        "DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),)
                    )
            return self.send_json(200, {"ok": True}, clear_cookie=True)

        if route == "/api/state":
            user = self.get_user()
            if not user:
                return self.send_json(401, {"error": "登录状态已过期"})
            payload = json.dumps(body.get("state"), ensure_ascii=False)
            if len(payload.encode("utf-8")) > MAX_BODY:
                return self.send_json(413, {"error": "个人数据超出大小限制"})
            with open_database() as connection:
                execute(connection,
                    """
                    INSERT INTO user_state (user_id, payload, updated_at) VALUES (?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
                    """,
                    (user["id"], payload, now_utc().isoformat()),
                )
            return self.send_json(200, {"ok": True})
        return self.send_json(404, {"error": "接口不存在"})

    def do_PUT(self):
        if urlparse(self.path).path != "/api/state":
            return self.send_json(404, {"error": "接口不存在"})
        user = self.get_user()
        if not user:
            return self.send_json(401, {"error": "登录状态已过期"})
        body = self.read_json()
        if body is None or not isinstance(body.get("state"), dict):
            return self.send_json(400, {"error": "个人数据格式无效"})
        payload = json.dumps(body["state"], ensure_ascii=False)
        if len(payload.encode("utf-8")) > MAX_BODY:
            return self.send_json(413, {"error": "个人数据超出大小限制"})
        with open_database() as connection:
            execute(connection,
                """
                INSERT INTO user_state (user_id, payload, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
                """,
                (user["id"], payload, now_utc().isoformat()),
            )
        return self.send_json(200, {"ok": True})


if __name__ == "__main__":
    if os.environ.get("REQUIRE_DATABASE_URL") == "1" and not DATABASE_URL:
        raise RuntimeError("DATABASE_URL must be set for this deployment")
    initialize_database()
    port = int(os.environ.get("PORT", "4173"))
    host = os.environ.get("BLOOM_HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), BloomHandler)
    server.serve_forever()
