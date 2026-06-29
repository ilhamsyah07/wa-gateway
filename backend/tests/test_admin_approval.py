"""Tests for Google Auth + Admin approval flow (iteration 2)."""
import os
import uuid

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@wagateway.com"
ADMIN_PASSWORD = "admin123"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "wa_gateway_db")


def now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture(scope="module")
def mongo():
    mc = MongoClient(MONGO_URL)
    yield mc[DB_NAME]
    mc.close()


@pytest.fixture(scope="module")
def admin_headers():
    last = None
    for _ in range(8):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
        last = r
        if r.status_code == 200:
            return {"Authorization": f"Bearer {r.json()['access_token']}"}
        if r.status_code == 429:
            import time as _t
            _t.sleep(15)
            continue
        break
    assert False, f"Admin login failed: {last.text}"


# ------------------ Existing email/password login regression ------------------

class TestExistingAuthRegression:
    def test_admin_login_returns_token_and_user(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["email"] == ADMIN_EMAIL
        assert body["user"]["role"] == "admin"
        assert body["user"].get("status", "active") == "active"
        assert body["user"].get("auth_provider", "password") == "password"
        assert len(body["access_token"]) > 20

    def test_me_with_admin_token(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == ADMIN_EMAIL
        assert body["role"] == "admin"

    def test_register_creates_active_user_and_can_login(self):
        email = f"test_reg_{uuid.uuid4().hex[:8]}@example.com"
        password = "secret123"
        r = requests.post(f"{API}/auth/register",
                          json={"name": "Reg Tester", "email": email, "password": password}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["status"] == "active"
        assert body["user"]["auth_provider"] == "password"
        assert "access_token" in body
        # Can immediately log in
        lr = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
        assert lr.status_code == 200
        assert lr.json()["user"]["email"] == email.lower()
        # cleanup
        MongoClient(MONGO_URL)[DB_NAME].users.delete_one({"email": email.lower()})


# ------------------ Google session endpoint (invalid path only) ------------------

class TestGoogleSessionInvalid:
    def test_invalid_session_id_returns_401(self):
        r = requests.post(f"{API}/auth/google/session",
                          json={"session_id": f"invalid_{uuid.uuid4().hex}"}, timeout=20)
        # Expect 401 (Emergent rejects). Could also be 502 if provider unreachable; flag that.
        assert r.status_code == 401, f"Expected 401 for invalid session_id, got {r.status_code} {r.text}"
        assert "Invalid or expired Google session" in r.json().get("detail", "")

    def test_missing_session_id_validation(self):
        r = requests.post(f"{API}/auth/google/session", json={}, timeout=20)
        assert r.status_code == 422


# ------------------ Admin approval flow (simulated pending google user) ------------------

class TestAdminApproval:
    @pytest.fixture
    def pending_user(self, mongo):
        uid = str(uuid.uuid4())
        email = f"gtest_{uuid.uuid4().hex[:8]}@example.com"
        doc = {
            "id": uid,
            "email": email,
            "name": "GTest Pending",
            "role": "user",
            "status": "pending",
            "auth_provider": "google",
            "created_at": now_iso(),
        }
        mongo.users.insert_one(doc)
        yield {"id": uid, "email": email}
        mongo.users.delete_one({"id": uid})

    def test_list_users_admin_only(self, admin_headers):
        r = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # No _id leakage
        for u in items:
            assert "_id" not in u
            assert "password_hash" not in u

    def test_list_users_no_auth_returns_401(self):
        r = requests.get(f"{API}/admin/users", timeout=20)
        assert r.status_code == 401

    def test_list_users_non_admin_returns_403(self):
        # create a regular user
        email = f"test_nonadmin_{uuid.uuid4().hex[:8]}@example.com"
        rr = requests.post(f"{API}/auth/register",
                           json={"name": "Non Admin", "email": email, "password": "secret123"}, timeout=20)
        assert rr.status_code == 200
        token = rr.json()["access_token"]
        r = requests.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {token}"}, timeout=20)
        assert r.status_code == 403
        assert "Admin access required" in r.json()["detail"]
        # cleanup
        MongoClient(MONGO_URL)[DB_NAME].users.delete_one({"email": email.lower()})

    def test_list_users_filter_pending(self, admin_headers, pending_user):
        r = requests.get(f"{API}/admin/users?status=pending", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert any(u["id"] == pending_user["id"] for u in items)
        # all returned should be pending
        for u in items:
            assert u["status"] == "pending"

    def test_pending_user_cannot_call_me_via_jwt(self, mongo, pending_user):
        """Simulate: if we mint a JWT for the pending user, get_current_user must block with 403."""
        # We need a token. We can't login (no password). Use direct JWT creation via the same secret.
        import jwt as _jwt
        from datetime import datetime, timezone, timedelta
        # Read JWT_SECRET from backend env
        with open("/app/backend/.env") as f:
            env = dict(line.strip().split("=", 1) for line in f if "=" in line and not line.startswith("#"))
        secret = env["JWT_SECRET"].strip().strip('"').strip("'")
        token = _jwt.encode({"sub": pending_user["id"], "email": pending_user["email"],
                             "exp": datetime.now(timezone.utc) + timedelta(days=1), "type": "access"},
                            secret, algorithm="HS256")
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=20)
        assert r.status_code == 403
        assert "awaiting admin approval" in r.json()["detail"].lower()

    def test_approve_pending_user_flips_status(self, admin_headers, pending_user, mongo):
        r = requests.post(f"{API}/admin/users/{pending_user['id']}/approve", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        # verify DB
        u = mongo.users.find_one({"id": pending_user["id"]})
        assert u["status"] == "active"
        assert "approved_at" in u
        assert u["approved_by"]

    def test_approve_nonexistent_returns_404(self, admin_headers):
        r = requests.post(f"{API}/admin/users/{uuid.uuid4()}/approve", headers=admin_headers, timeout=20)
        assert r.status_code == 404

    def test_reject_pending_user_deletes(self, admin_headers, pending_user, mongo):
        r = requests.post(f"{API}/admin/users/{pending_user['id']}/reject", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        # verify deleted
        assert mongo.users.find_one({"id": pending_user["id"]}) is None

    def test_reject_admin_returns_400(self, admin_headers, mongo):
        admin = mongo.users.find_one({"email": ADMIN_EMAIL})
        r = requests.post(f"{API}/admin/users/{admin['id']}/reject", headers=admin_headers, timeout=20)
        assert r.status_code == 400
        assert "Cannot reject an admin" in r.json()["detail"]

    def test_reject_nonexistent_returns_404(self, admin_headers):
        r = requests.post(f"{API}/admin/users/{uuid.uuid4()}/reject", headers=admin_headers, timeout=20)
        assert r.status_code == 404
