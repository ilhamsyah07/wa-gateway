"""End-to-end backend tests for WA Gateway."""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@wagateway.com"
ADMIN_PASSWORD = "admin123"


# ------------------ Fixtures ------------------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def connected_session(admin_headers):
    """Create a session and force-connect it via Mongo for deterministic tests."""
    r = requests.post(f"{API}/sessions", headers=admin_headers, json={"name": "TEST_sess"}, timeout=20)
    assert r.status_code == 200
    sid = r.json()["id"]
    # Force connect via Mongo directly
    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    mc[os.environ.get("DB_NAME", "wa_gateway_db")].sessions.update_one(
        {"id": sid},
        {"$set": {"status": "connected", "phone_number": "6281234567890", "qr_data_url": None}},
    )
    yield sid
    requests.delete(f"{API}/sessions/{sid}", headers=admin_headers, timeout=10)


# ------------------ Health ------------------

class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=20)
        assert r.status_code == 200
        assert r.json()["service"] == "wa-gateway"


# ------------------ Auth ------------------

class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body and len(body["access_token"]) > 20
        assert body["user"]["email"] == ADMIN_EMAIL

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrongpw"}, timeout=20)
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid email or password"

    def test_register_and_duplicate(self):
        email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={"name": "Tester", "email": email, "password": "secret123"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["email"] == email.lower()
        assert "access_token" in body
        # duplicate
        r2 = requests.post(f"{API}/auth/register", json={"name": "Tester2", "email": email, "password": "secret123"}, timeout=20)
        assert r2.status_code == 400

    def test_me_with_token(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me", timeout=20)
        assert r.status_code == 401

    def test_sessions_no_auth(self):
        assert requests.get(f"{API}/sessions", timeout=20).status_code == 401

    def test_messages_no_auth(self):
        assert requests.get(f"{API}/messages", timeout=20).status_code == 401


# ------------------ Sessions ------------------

class TestSessions:
    def test_create_list_get_delete_session(self, admin_headers):
        r = requests.post(f"{API}/sessions", headers=admin_headers, json={"name": "TEST_crud"}, timeout=20)
        assert r.status_code == 200
        s = r.json()
        assert s["status"] == "qr"
        assert s["qr_data_url"].startswith("data:image/png;base64,")
        sid = s["id"]
        # list
        lr = requests.get(f"{API}/sessions", headers=admin_headers, timeout=20)
        assert lr.status_code == 200
        assert any(x["id"] == sid for x in lr.json())
        # get
        gr = requests.get(f"{API}/sessions/{sid}", headers=admin_headers, timeout=20)
        assert gr.status_code == 200 and gr.json()["id"] == sid
        # regenerate qr
        rq = requests.post(f"{API}/sessions/{sid}/regenerate-qr", headers=admin_headers, timeout=20)
        assert rq.status_code == 200 and rq.json()["status"] == "qr"
        # disconnect
        dr = requests.post(f"{API}/sessions/{sid}/disconnect", headers=admin_headers, timeout=20)
        assert dr.status_code == 200 and dr.json()["status"] == "disconnected"
        # delete
        ddr = requests.delete(f"{API}/sessions/{sid}", headers=admin_headers, timeout=20)
        assert ddr.status_code == 200
        # verify gone
        assert requests.get(f"{API}/sessions/{sid}", headers=admin_headers, timeout=20).status_code == 404


# ------------------ Messages ------------------

class TestMessages:
    def test_send_requires_connected(self, admin_headers):
        # create session - will be in qr state
        r = requests.post(f"{API}/sessions", headers=admin_headers, json={"name": "TEST_notconn"}, timeout=20)
        sid = r.json()["id"]
        sr = requests.post(f"{API}/messages/send", headers=admin_headers,
                           json={"session_id": sid, "to": "6281234567890", "message": "hi"}, timeout=20)
        assert sr.status_code == 400
        requests.delete(f"{API}/sessions/{sid}", headers=admin_headers, timeout=10)

    def test_send_message(self, admin_headers, connected_session):
        r = requests.post(f"{API}/messages/send", headers=admin_headers,
                          json={"session_id": connected_session, "to": "6281234567890", "message": "hello world"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] in ("sent", "failed")
        assert body["direction"] == "outbound"
        assert body["message"] == "hello world"

    def test_broadcast(self, admin_headers, connected_session):
        r = requests.post(f"{API}/messages/broadcast", headers=admin_headers, json={
            "session_id": connected_session,
            "numbers": ["6281111111111", "6282222222222", "6283333333333"],
            "message": "broadcast test",
        }, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 3
        assert body["sent"] + body["failed"] == 3
        assert len(body["results"]) == 3

    def test_list_messages(self, admin_headers):
        r = requests.get(f"{API}/messages?limit=10", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body
        assert isinstance(body["items"], list)


# ------------------ Auto-Reply ------------------

class TestAutoReply:
    def test_rule_crud_and_simulate(self, admin_headers, connected_session):
        # create
        r = requests.post(f"{API}/auto-replies", headers=admin_headers, json={
            "session_id": connected_session,
            "keyword": "hello",
            "match_type": "contains",
            "reply": "Hi there!",
            "active": True,
        }, timeout=20)
        assert r.status_code == 200
        rule = r.json()
        # list
        lr = requests.get(f"{API}/auto-replies", headers=admin_headers, timeout=20)
        assert lr.status_code == 200
        assert any(x["id"] == rule["id"] for x in lr.json())
        # simulate match
        sim = requests.post(f"{API}/auto-replies/simulate", headers=admin_headers, json={
            "session_id": connected_session,
            "text": "hello world",
        }, timeout=20)
        assert sim.status_code == 200
        sbody = sim.json()
        assert sbody["matched_rule"] is not None
        assert sbody["matched_rule"]["id"] == rule["id"]
        # patch toggle active off
        pr = requests.patch(f"{API}/auto-replies/{rule['id']}", headers=admin_headers, json={
            "session_id": connected_session, "keyword": "hello", "match_type": "contains",
            "reply": "Hi there!", "active": False,
        }, timeout=20)
        assert pr.status_code == 200 and pr.json()["active"] is False
        # delete
        dr = requests.delete(f"{API}/auto-replies/{rule['id']}", headers=admin_headers, timeout=20)
        assert dr.status_code == 200


# ------------------ API Keys + Public API ------------------

class TestApiKeys:
    def test_create_list_and_public_endpoints(self, admin_headers, connected_session):
        cr = requests.post(f"{API}/api-keys", headers=admin_headers, json={"label": "TEST_key"}, timeout=20)
        assert cr.status_code == 200
        key_doc = cr.json()
        key = key_doc["key"]
        assert key.startswith("wag_")
        kid = key_doc["id"]

        # list masked
        lr = requests.get(f"{API}/api-keys", headers=admin_headers, timeout=20)
        assert lr.status_code == 200
        items = lr.json()
        target = next((x for x in items if x["id"] == kid), None)
        assert target and "..." in target["key_masked"]

        # public sessions
        ps = requests.get(f"{API}/v1/sessions", headers={"X-API-Key": key}, timeout=20)
        assert ps.status_code == 200
        assert any(x["id"] == connected_session for x in ps.json())

        # public send
        send = requests.post(f"{API}/v1/send", headers={"X-API-Key": key}, json={
            "session_id": connected_session, "to": "6289999999999", "message": "api send"
        }, timeout=20)
        assert send.status_code == 200
        assert send.json()["source"] == "api"

        # missing key
        nokey = requests.get(f"{API}/v1/sessions", timeout=20)
        assert nokey.status_code == 401

        # revoke
        rv = requests.delete(f"{API}/api-keys/{kid}", headers=admin_headers, timeout=20)
        assert rv.status_code == 200
        # revoked -> 401
        after = requests.get(f"{API}/v1/sessions", headers={"X-API-Key": key}, timeout=20)
        assert after.status_code == 401


# ------------------ Stats ------------------

class TestStats:
    def test_overview_shape(self, admin_headers):
        r = requests.get(f"{API}/stats/overview", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        body = r.json()
        for k in ["total_sessions", "connected_sessions", "total_messages",
                  "sent_messages", "failed_messages", "today_messages", "success_rate", "series"]:
            assert k in body
        assert isinstance(body["series"], list) and len(body["series"]) == 7
        assert all("date" in d and "count" in d for d in body["series"])
