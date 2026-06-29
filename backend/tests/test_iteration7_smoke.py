"""Iteration 7 smoke tests - verify zero collateral damage from Dockerfile/compose changes."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://wa-messenger-api.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@wagateway.com"
ADMIN_PASSWORD = "admin123"


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=30)
    return r


def test_login_admin():
    r = _login()
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    assert isinstance(data["access_token"], str) and len(data["access_token"]) > 10
    assert data["user"]["email"] == ADMIN_EMAIL


def test_sessions_endpoint():
    token = _login().json()["access_token"]
    r = requests.get(f"{BASE_URL}/api/sessions",
                     headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert r.status_code == 200, f"/api/sessions failed: {r.status_code} {r.text}"
    assert isinstance(r.json(), list)


def test_admin_users():
    token = _login().json()["access_token"]
    r = requests.get(f"{BASE_URL}/api/admin/users",
                     headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert r.status_code == 200, f"/api/admin/users failed: {r.status_code} {r.text}"
    assert isinstance(r.json(), list)


def test_admin_invitations():
    token = _login().json()["access_token"]
    r = requests.get(f"{BASE_URL}/api/admin/invitations",
                     headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert r.status_code == 200, f"/api/admin/invitations failed: {r.status_code} {r.text}"
    assert isinstance(r.json(), list)


def test_auth_me():
    token = _login().json()["access_token"]
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


# --- Static config checks (no docker build required) ---

def test_compose_no_version_key():
    import yaml
    with open("/app/docker-compose.yml") as f:
        cfg = yaml.safe_load(f)
    assert "version" not in cfg, "docker-compose.yml still has obsolete 'version' key"
    assert set(cfg["services"].keys()) == {"mongo", "baileys", "backend", "frontend", "nginx"}


def test_frontend_dockerfile_defensive():
    txt = open("/app/frontend/Dockerfile").read()
    assert "COPY package.json ./" in txt
    assert "COPY yarn.lock* ./" in txt
    assert "if [ -f yarn.lock ]" in txt
    assert "--frozen-lockfile" in txt
    assert "--network-timeout 600000" in txt


def test_baileys_dockerfile_defensive():
    txt = open("/app/baileys-service/Dockerfile").read()
    assert "COPY yarn.lock* ./" in txt
    assert "COPY package-lock.json* ./" in txt
    assert "if [ -f yarn.lock ]" in txt
    assert "npm ci --omit=dev" in txt
    assert "npm install --omit=dev" in txt
