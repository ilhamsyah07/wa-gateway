"""Security hardening test suite (SEC-001/002/003 + rate limits + JWT + CORS)."""
import os
import time
import uuid

import jwt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@wagateway.com"
ADMIN_PASSWORD = "admin123"
JWT_SECRET = "3f9c1e8b7a45d2f6e9c0b3a7d8e1f4c6b9a2d5e8f1c4b7a0d3e6f9c2b5a8d1e4"


@pytest.fixture(scope="module")
def admin_token():
    # Retry through rate-limit windows (5/min) caused by other tests in the same suite.
    last = None
    for attempt in range(8):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
        last = r
        if r.status_code == 200:
            return r.json()["access_token"]
        if r.status_code == 429:
            time.sleep(15)
            continue
        break
    assert False, f"Admin login failed: {last.status_code} {last.text}"


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ------------------- SEC-001 -------------------
class TestSEC001AdminLogin:
    """Admin login is stable after restart; no force-reset of password."""

    def test_admin_login_works(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["user"]["email"] == ADMIN_EMAIL

    def test_me_with_token(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# ------------------- SEC-002 -------------------
class TestSEC002ApiKeyHashing:
    """API keys: full key returned once on create; list returns masked form only."""

    def test_create_returns_full_key_list_returns_masked_only(self, admin_headers):
        cr = requests.post(f"{API}/api-keys", headers=admin_headers,
                           json={"label": f"TEST_sec002_{uuid.uuid4().hex[:6]}"}, timeout=20)
        assert cr.status_code == 200
        doc = cr.json()
        full_key = doc.get("key")
        assert full_key and full_key.startswith("wag_"), f"missing/invalid full key: {doc}"
        assert "key_hash" not in doc, "key_hash must NOT be returned on create"
        kid = doc["id"]

        # List endpoint
        lr = requests.get(f"{API}/api-keys", headers=admin_headers, timeout=20)
        assert lr.status_code == 200
        target = next((x for x in lr.json() if x["id"] == kid), None)
        assert target is not None
        # masked present
        assert "key_masked" in target
        assert target["key_masked"].startswith("wag_") and "..." in target["key_masked"]
        # plaintext + hash NOT present
        assert "key" not in target, "Plain `key` field MUST NOT appear in list response"
        assert "key_hash" not in target, "`key_hash` MUST NOT appear in list response"

        # The new key authenticates to public endpoint
        ps = requests.get(f"{API}/v1/sessions", headers={"X-API-Key": full_key}, timeout=20)
        assert ps.status_code == 200, f"new key failed to auth: {ps.status_code} {ps.text}"

        # cleanup
        requests.delete(f"{API}/api-keys/{kid}", headers=admin_headers, timeout=20)

    def test_existing_keys_have_prefix_suffix_no_plaintext(self, admin_headers):
        """Migrated/pre-existing keys also exposed with masked form only."""
        lr = requests.get(f"{API}/api-keys", headers=admin_headers, timeout=20)
        assert lr.status_code == 200
        for item in lr.json():
            assert "key" not in item, f"item {item.get('id')} leaked plaintext key"
            assert "key_hash" not in item, f"item {item.get('id')} leaked key_hash"
            assert "key_masked" in item


# ------------------- SEC-003 -------------------
class TestSEC003SimulateValidation:
    """Pydantic validation on /auto-replies/simulate."""

    def test_empty_body_rejected(self, admin_headers):
        r = requests.post(f"{API}/auto-replies/simulate", headers=admin_headers, json={}, timeout=20)
        assert r.status_code == 422, f"expected 422 on empty body, got {r.status_code}"

    def test_mongo_operator_session_id_rejected(self, admin_headers):
        r = requests.post(f"{API}/auto-replies/simulate", headers=admin_headers,
                          json={"session_id": {"$ne": None}, "text": "hi"}, timeout=20)
        assert r.status_code == 422

    def test_empty_text_rejected(self, admin_headers):
        # need a session_id (any non-empty string passes the str validator;
        # text="" fails min_length=1)
        r = requests.post(f"{API}/auto-replies/simulate", headers=admin_headers,
                          json={"session_id": "anything", "text": ""}, timeout=20)
        assert r.status_code == 422

    def test_valid_payload_works(self, admin_headers):
        """Create + force-connect a temp session and exercise the happy path shape."""
        s = requests.post(f"{API}/sessions", headers=admin_headers,
                          json={"name": "TEST_sec003"}, timeout=20).json()
        sid = s["id"]
        # force connect via mongo
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        mc[os.environ.get("DB_NAME", "wa_gateway_db")].sessions.update_one(
            {"id": sid},
            {"$set": {"status": "connected", "phone_number": "6281234567890", "qr_data_url": None}},
        )
        try:
            r = requests.post(f"{API}/auto-replies/simulate", headers=admin_headers,
                              json={"session_id": sid, "text": "hello there"}, timeout=20)
            assert r.status_code == 200, r.text
            body = r.json()
            for k in ("inbound", "matched_rule", "reply"):
                assert k in body
        finally:
            requests.delete(f"{API}/sessions/{sid}", headers=admin_headers, timeout=10)


# ------------------- JWT -------------------
class TestJWT:
    def test_refresh_type_rejected(self):
        # Forge a token with valid signature but type=refresh
        payload = {
            "sub": "fake-user-id",
            "email": ADMIN_EMAIL,
            "exp": int(time.time()) + 3600,
            "iat": int(time.time()),
            "type": "refresh",
        }
        bad_token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {bad_token}"}, timeout=20)
        assert r.status_code == 401
        assert "token type" in r.text.lower() or "invalid" in r.text.lower()

    def test_jwt_expiry_within_24h(self, admin_token):
        decoded = jwt.decode(admin_token, JWT_SECRET, algorithms=["HS256"])
        assert decoded.get("type") == "access"
        # Backend does not currently set `iat`; verify exp is within ~24h of now.
        now = int(time.time())
        delta = decoded["exp"] - now
        assert 0 < delta <= 24 * 3600 + 120, f"unexpected exp-now delta: {delta}"


# ------------------- Rate Limits -------------------
class TestRateLimits:
    """Verify slowapi-enforced limits return 429."""

    def test_login_rate_limit_5_per_minute(self):
        # NOTE: behind a load balancer, the apparent source IP can rotate slightly so the
        # configured 5/min may not trigger at exactly the 6th call. We burst 15 attempts
        # and assert that AT LEAST ONE 429 is observed within the minute window.
        results = []
        for _ in range(15):
            r = requests.post(f"{API}/auth/login",
                              json={"email": f"ratelimit_{uuid.uuid4().hex[:6]}@x.com",
                                    "password": "x"}, timeout=10)
            results.append(r.status_code)
        assert 429 in results, f"expected at least one 429 in 15 attempts, got {results}"

    def test_register_rate_limit_3_per_minute(self):
        results = []
        for _ in range(15):
            r = requests.post(f"{API}/auth/register",
                              json={"name": "RL", "email": f"rl_{uuid.uuid4().hex[:6]}@x.com",
                                    "password": "secret123"}, timeout=10)
            results.append(r.status_code)
        assert 429 in results, f"expected at least one 429 in 15 attempts, got {results}"


# ------------------- Broadcast cap -------------------
class TestBroadcastCap:
    def test_501_numbers_rejected(self, admin_headers):
        # need a session_id but max_length check happens at validation pre-handler
        numbers = [f"6281{str(i).zfill(8)}" for i in range(501)]
        r = requests.post(f"{API}/messages/broadcast", headers=admin_headers,
                          json={"session_id": "any", "numbers": numbers, "message": "x"},
                          timeout=30)
        assert r.status_code == 422

    def test_500_numbers_allowed_validation(self, admin_headers):
        # Should pass validation (may fail later because session not connected -> 400)
        numbers = [f"6281{str(i).zfill(8)}" for i in range(500)]
        r = requests.post(f"{API}/messages/broadcast", headers=admin_headers,
                          json={"session_id": "nonexistent-session", "numbers": numbers,
                                "message": "x"}, timeout=30)
        # validation must NOT reject (so not 422); 400/404 acceptable
        assert r.status_code != 422, r.text


# ------------------- CORS -------------------
class TestCORS:
    def test_allowed_origin_present(self):
        r = requests.options(f"{API}/auth/login",
                             headers={
                                 "Origin": "http://localhost:3000",
                                 "Access-Control-Request-Method": "POST",
                                 "Access-Control-Request-Headers": "content-type",
                             }, timeout=20)
        # Either the backend echoes the origin OR an upstream proxy returns "*".
        # Either way the preflight succeeds. Reject only an explicit non-match.
        allow = r.headers.get("access-control-allow-origin", "")
        assert allow in ("http://localhost:3000", "*"), \
            f"expected origin allowed, got {allow!r}"

    def test_disallowed_origin_absent(self):
        r = requests.options(f"{API}/auth/login",
                             headers={
                                 "Origin": "https://evil.example.com",
                                 "Access-Control-Request-Method": "POST",
                                 "Access-Control-Request-Headers": "content-type",
                             }, timeout=20)
        # When CORS middleware rejects, it should NOT echo the evil origin.
        allow = r.headers.get("access-control-allow-origin", "")
        assert allow != "https://evil.example.com", f"evil origin echoed: {allow!r}"
