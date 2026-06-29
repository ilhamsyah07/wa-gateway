"""Iteration 5 - Invitations, webhook, email no-op tests."""
import os
import time
import uuid
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


def _login(email, password):
    last = None
    for _ in range(8):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
        last = r
        if r.status_code == 200:
            return r.json()["access_token"]
        if r.status_code == 429:
            time.sleep(15)
            continue
        break
    pytest.fail(f"Login failed: {last.status_code} {last.text}")


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN_EMAIL, ADMIN_PASSWORD)}"}


# ---------------- Invitation create ----------------

class TestInvitationCreate:
    def test_create_invitation_returns_token(self, admin_headers):
        email = f"test_invite_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/admin/invitations", headers=admin_headers,
                          json={"email": email, "name": "Test Invitee", "role": "user"}, timeout=20)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["email"] == email
        assert d["role"] == "user"
        assert d["status"] == "pending"
        assert "token" in d and len(d["token"]) > 10
        assert "expires_at" in d

    def test_create_invitation_non_admin_forbidden(self):
        # register a random user
        email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
        rr = requests.post(f"{API}/auth/register", json={"name": "U", "email": email, "password": "secret1"}, timeout=20)
        if rr.status_code == 429:
            pytest.skip("rate-limited registration")
        assert rr.status_code == 200, rr.text
        tok = rr.json()["access_token"]
        r = requests.post(f"{API}/admin/invitations",
                          headers={"Authorization": f"Bearer {tok}"},
                          json={"email": "x@example.com", "name": "x"}, timeout=20)
        assert r.status_code == 403


# ---------------- List / revoke / re-create supersedes ----------------

class TestInvitationListRevoke:
    def test_list_and_revoke(self, admin_headers):
        email = f"test_lr_{uuid.uuid4().hex[:8]}@example.com"
        c = requests.post(f"{API}/admin/invitations", headers=admin_headers,
                          json={"email": email, "name": "LR"}, timeout=20)
        inv_id = c.json()["id"]

        lst = requests.get(f"{API}/admin/invitations", headers=admin_headers, timeout=20)
        assert lst.status_code == 200
        ids = [x["id"] for x in lst.json()]
        assert inv_id in ids

        d = requests.delete(f"{API}/admin/invitations/{inv_id}", headers=admin_headers, timeout=20)
        assert d.status_code == 200

        lst2 = requests.get(f"{API}/admin/invitations", headers=admin_headers, timeout=20).json()
        found = next((x for x in lst2 if x["id"] == inv_id), None)
        assert found and found["status"] == "revoked"

    def test_recreate_revokes_previous(self, admin_headers):
        email = f"test_dup_{uuid.uuid4().hex[:8]}@example.com"
        first = requests.post(f"{API}/admin/invitations", headers=admin_headers,
                              json={"email": email}, timeout=20).json()
        second = requests.post(f"{API}/admin/invitations", headers=admin_headers,
                               json={"email": email}, timeout=20).json()
        assert first["id"] != second["id"]

        lst = requests.get(f"{API}/admin/invitations", headers=admin_headers, timeout=20).json()
        first_doc = next(x for x in lst if x["id"] == first["id"])
        second_doc = next(x for x in lst if x["id"] == second["id"])
        assert first_doc["status"] == "revoked"
        assert second_doc["status"] == "pending"


# ---------------- Public read ----------------

class TestInvitationPublicRead:
    def test_public_get_pending(self, admin_headers):
        email = f"test_pub_{uuid.uuid4().hex[:8]}@example.com"
        c = requests.post(f"{API}/admin/invitations", headers=admin_headers,
                          json={"email": email, "name": "Pub", "role": "user"}, timeout=20).json()
        r = requests.get(f"{API}/invitations/{c['token']}", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"] == email
        assert body["role"] == "user"

    def test_public_get_unknown_404(self):
        r = requests.get(f"{API}/invitations/nonexistent_token_xxx", timeout=20)
        assert r.status_code == 404

    def test_public_get_revoked_410(self, admin_headers):
        email = f"test_rev_{uuid.uuid4().hex[:8]}@example.com"
        c = requests.post(f"{API}/admin/invitations", headers=admin_headers,
                          json={"email": email}, timeout=20).json()
        requests.delete(f"{API}/admin/invitations/{c['id']}", headers=admin_headers, timeout=20)
        r = requests.get(f"{API}/invitations/{c['token']}", timeout=20)
        assert r.status_code == 410


# ---------------- Accept happy path & errors ----------------

class TestInvitationAccept:
    def test_accept_happy_path_and_login(self, admin_headers):
        email = f"test_acc_{uuid.uuid4().hex[:8]}@example.com"
        c = requests.post(f"{API}/admin/invitations", headers=admin_headers,
                          json={"email": email, "name": "Acc"}, timeout=20).json()
        token = c["token"]
        pw = "newpass1"
        r = requests.post(f"{API}/invitations/{token}/accept",
                          json={"name": "Acc User", "password": pw}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["email"] == email
        assert body["user"]["status"] == "active"
        assert "access_token" in body

        # immediate login works
        time.sleep(1)
        log = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
        if log.status_code == 429:
            time.sleep(15)
            log = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
        assert log.status_code == 200, log.text

        # public token now returns 410
        r2 = requests.get(f"{API}/invitations/{token}", timeout=20)
        assert r2.status_code == 410

    def test_accept_already_accepted_410(self, admin_headers):
        email = f"test_aa_{uuid.uuid4().hex[:8]}@example.com"
        c = requests.post(f"{API}/admin/invitations", headers=admin_headers,
                          json={"email": email}, timeout=20).json()
        token = c["token"]
        r1 = requests.post(f"{API}/invitations/{token}/accept",
                           json={"name": "X", "password": "pwlong1"}, timeout=20)
        assert r1.status_code == 200
        time.sleep(13)  # avoid rate-limit (5/min)
        r2 = requests.post(f"{API}/invitations/{token}/accept",
                           json={"name": "X", "password": "pwlong1"}, timeout=20)
        assert r2.status_code == 410, r2.text

    def test_accept_short_password_422(self, admin_headers):
        email = f"test_sp_{uuid.uuid4().hex[:8]}@example.com"
        c = requests.post(f"{API}/admin/invitations", headers=admin_headers,
                          json={"email": email}, timeout=20).json()
        time.sleep(13)
        r = requests.post(f"{API}/invitations/{c['token']}/accept",
                          json={"name": "X", "password": "abc"}, timeout=20)
        assert r.status_code == 422


# ---------------- Email no-op ----------------

class TestEmailNoop:
    def test_invitation_succeeds_without_resend_key(self, admin_headers):
        # RESEND_API_KEY is unset in dev env — invitation must still succeed
        email = f"test_noop_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/admin/invitations", headers=admin_headers,
                          json={"email": email}, timeout=20)
        assert r.status_code in (200, 201), r.text


# ---------------- Webhook ----------------

class TestBaileysWebhook:
    def test_webhook_missing_fields_400(self):
        r = requests.post(f"{API}/webhook/baileys", json={}, timeout=20)
        # No BAILEYS_TOKEN configured -> proceeds and returns 400 for missing fields
        assert r.status_code == 400, r.text

    def test_webhook_unknown_session_ok(self):
        r = requests.post(f"{API}/webhook/baileys",
                          json={"event": "connected", "session_id": "no_such_session_xyz"}, timeout=20)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------------- Sessions still simulation ----------------

class TestSimulationStillWorks:
    def test_session_create_returns_qr_png_data_url(self, admin_headers):
        r = requests.post(f"{API}/sessions", headers=admin_headers,
                          json={"name": "TEST_iter5_sess"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "qr"
        assert d["qr_data_url"].startswith("data:image/png;base64,")
