"""Smoke tests after .gitignore-only fix (iteration 6).
Verifies the 5 critical flows listed in the review request still pass.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://wa-messenger-api.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@wagateway.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no token in response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---- Health ----
def test_health_root():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"


# ---- (a) Login ----
def test_login_admin():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=20)
    assert r.status_code == 200
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token and isinstance(token, str) and len(token) > 20


# ---- (b) GET /api/sessions ----
def test_get_sessions(auth_headers):
    r = requests.get(f"{BASE_URL}/api/sessions", headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
    assert isinstance(r.json(), (list, dict))


# ---- (c) POST /api/api-keys ----
def test_create_api_key(auth_headers):
    payload = {"label": f"TEST_smoke_{int(time.time())}"}
    r = requests.post(f"{BASE_URL}/api/api-keys", headers=auth_headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), f"got {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert "id" in body or "key" in body or "api_key" in body, f"unexpected body: {body}"
    # cleanup if possible
    key_id = body.get("id")
    if key_id:
        requests.delete(f"{BASE_URL}/api/api-keys/{key_id}", headers=auth_headers, timeout=15)


# ---- (d) GET /api/admin/users ----
def test_admin_users(auth_headers):
    r = requests.get(f"{BASE_URL}/api/admin/users", headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert isinstance(body, (list, dict))


# ---- (e) POST /api/admin/invitations ----
def test_create_invitation(auth_headers):
    payload = {"email": f"TEST_smoke_{int(time.time())}@example.com", "role": "user"}
    r = requests.post(f"{BASE_URL}/api/admin/invitations", headers=auth_headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), f"got {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert "id" in body or "token" in body or "email" in body, f"unexpected body: {body}"
