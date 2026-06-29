from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import uuid
import base64
import hashlib
import logging
import secrets
import asyncio
import random
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import bcrypt
import jwt
import qrcode
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Header, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# ------------------ Setup ------------------

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "24"))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

limiter = Limiter(key_func=lambda request: (request.headers.get("x-forwarded-for", "").split(",")[0].strip() or get_remote_address(request)), default_limits=[])

app = FastAPI(title="WA Gateway API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("wa-gateway")

bearer_scheme = HTTPBearer(auto_error=False)

# ------------------ Helpers ------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRE_HOURS),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def hash_api_key(key: str) -> str:
    """One-way hash for API keys at rest. We never store the plaintext key."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Dict[str, Any]:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="Account awaiting admin approval")
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def get_user_by_api_key(x_api_key: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    key_hash = hash_api_key(x_api_key)
    key_doc = await db.api_keys.find_one({"key_hash": key_hash, "revoked": False})
    if not key_doc:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")
    user = await db.users.find_one({"id": key_doc["user_id"]})
    if not user or user.get("status", "active") != "active":
        raise HTTPException(status_code=401, detail="User not found or inactive")
    await db.api_keys.update_one({"id": key_doc["id"]}, {"$set": {"last_used_at": now_iso()}})
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user

def make_qr_data_url(payload: str) -> str:
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

def clean_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc

# ------------------ Models ------------------

class RegisterReq(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)

class LoginReq(BaseModel):
    email: EmailStr
    password: str

class GoogleSessionReq(BaseModel):
    session_id: str

class SessionCreateReq(BaseModel):
    name: str
    phone_label: Optional[str] = None

class SendMessageReq(BaseModel):
    session_id: str
    to: str  # phone number e.g. 6281234567890
    message: str
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # image, document

class BroadcastReq(BaseModel):
    session_id: str
    numbers: List[str] = Field(..., max_length=500)
    message: str

    @field_validator("numbers")
    @classmethod
    def numbers_not_empty(cls, v):
        if len(v) == 0:
            raise ValueError("numbers cannot be empty")
        return v

class SimulateInboundReq(BaseModel):
    session_id: str
    text: str = Field(..., min_length=1, max_length=4096)
    from_: Optional[str] = Field(default=None, alias="from")

    model_config = ConfigDict(populate_by_name=True)

class AutoReplyRuleReq(BaseModel):
    session_id: Optional[str] = None  # null = all sessions
    keyword: str
    match_type: str = "contains"  # contains | exact | starts_with
    reply: str
    active: bool = True

class ApiKeyCreateReq(BaseModel):
    label: str

class PublicSendReq(BaseModel):
    session_id: str
    to: str
    message: str

# ------------------ Startup ------------------

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.sessions.create_index("id", unique=True)
    await db.sessions.create_index("user_id")
    await db.messages.create_index("user_id")
    await db.messages.create_index("created_at")
    await db.api_keys.create_index("id", unique=True)
    await db.api_keys.create_index("key_hash", unique=True, sparse=True)
    await db.auto_replies.create_index("user_id")
    # Drop the obsolete plaintext-key unique index if it exists (SEC-002 migration)
    try:
        await db.api_keys.drop_index("key_1")
    except Exception:
        pass

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@wagateway.com")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        # Use ADMIN_PASSWORD env if provided, else generate a strong random one and log it once.
        admin_password = os.environ.get("ADMIN_PASSWORD")
        generated = False
        if not admin_password:
            admin_password = secrets.token_urlsafe(18)
            generated = True
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "name": "Admin",
            "role": "admin",
            "status": "active",
            "auth_provider": "password",
            "password_hash": hash_password(admin_password),
            "created_at": now_iso(),
        })
        if generated:
            logger.warning("=" * 70)
            logger.warning("FIRST-BOOT ADMIN CREATED — SAVE THIS PASSWORD NOW (shown only once)")
            logger.warning("  email:    %s", admin_email)
            logger.warning("  password: %s", admin_password)
            logger.warning("=" * 70)
        else:
            logger.info("Seeded admin user %s from ADMIN_PASSWORD env", admin_email)
    # NOTE: never force-reset admin password on subsequent startups (SEC-001).
    # Backfill status / auth_provider on existing users (idempotent)
    await db.users.update_many({"status": {"$exists": False}}, {"$set": {"status": "active"}})
    await db.users.update_many({"auth_provider": {"$exists": False}}, {"$set": {"auth_provider": "password"}})

    # One-shot migration: hash any plaintext API keys still in DB (SEC-002).
    async for k in db.api_keys.find({"key_hash": {"$exists": False}, "key": {"$exists": True}}):
        plain = k.get("key", "")
        await db.api_keys.update_one(
            {"id": k["id"]},
            {
                "$set": {
                    "key_hash": hash_api_key(plain),
                    "key_prefix": plain[:8],
                    "key_suffix": plain[-4:] if len(plain) >= 4 else "",
                },
                "$unset": {"key": ""},
            },
        )
    logger.info("API key migration to hashed storage complete")

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ------------------ Auth ------------------

@api_router.post("/auth/register")
@limiter.limit("3/minute")
async def register(request: Request, req: RegisterReq):
    email = req.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "id": new_id(),
        "email": email,
        "name": req.name.strip(),
        "role": "user",
        "status": "active",
        "auth_provider": "password",
        "password_hash": hash_password(req.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_access_token(user["id"], user["email"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "access_token": token, "token_type": "bearer"}

@api_router.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, req: LoginReq):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="Account awaiting admin approval")
    token = create_access_token(user["id"], user["email"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "access_token": token, "token_type": "bearer"}


# ------------------ Google Auth (Emergent-managed) ------------------

EMERGENT_SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

@api_router.post("/auth/google/session")
@limiter.limit("10/minute")
async def google_session(request: Request, req: GoogleSessionReq):
    """Exchange Emergent session_id for our JWT.
    REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    """
    async with httpx.AsyncClient(timeout=10) as http:
        try:
            r = await http.get(EMERGENT_SESSION_DATA_URL, headers={"X-Session-ID": req.session_id})
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Auth provider unreachable: {e}")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Google session")
    data = r.json()
    email = (data.get("email") or "").lower().strip()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    if not email:
        raise HTTPException(status_code=400, detail="Google did not return an email")

    user = await db.users.find_one({"email": email})
    if not user:
        # First time Google sign-in — create as pending, require admin approval
        user = {
            "id": new_id(),
            "email": email,
            "name": name,
            "picture": picture,
            "role": "user",
            "status": "pending",
            "auth_provider": "google",
            "created_at": now_iso(),
        }
        await db.users.insert_one(user)
        raise HTTPException(status_code=403, detail="Account created. Awaiting admin approval before you can sign in.")

    if user.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="Account awaiting admin approval")

    # Update profile fields from Google if changed
    update = {}
    if name and user.get("name") != name:
        update["name"] = name
    if picture and user.get("picture") != picture:
        update["picture"] = picture
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
        user.update(update)

    token = create_access_token(user["id"], user["email"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "access_token": token, "token_type": "bearer"}


# ------------------ Admin: user approval ------------------

@api_router.get("/admin/users")
async def admin_list_users(status: Optional[str] = None, admin=Depends(require_admin)):
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    cursor = db.users.find(q, {"password_hash": 0}).sort("created_at", -1)
    items = []
    async for d in cursor:
        d.pop("_id", None)
        items.append(d)
    return items

@api_router.post("/admin/users/{user_id}/approve")
async def admin_approve_user(user_id: str, admin=Depends(require_admin)):
    res = await db.users.update_one({"id": user_id}, {"$set": {"status": "active", "approved_at": now_iso(), "approved_by": admin["id"]}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}

@api_router.post("/admin/users/{user_id}/reject")
async def admin_reject_user(user_id: str, admin=Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot reject an admin")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: Dict[str, Any] = Depends(get_current_user)):
    return user

# ------------------ Sessions (Multi WA accounts) ------------------

async def simulate_qr_lifecycle(session_id: str):
    """Simulate a Baileys QR scan flow: after ~20s of being in 'qr' state,
    auto-transition to 'connected'. In a real Baileys integration this would
    be driven by actual WA scan events.
    """
    await asyncio.sleep(20)
    sess = await db.sessions.find_one({"id": session_id})
    if sess and sess["status"] == "qr":
        # 75% chance auto-connect to simulate the user scanning
        if random.random() < 0.75:
            phone = "62" + "".join(str(random.randint(0, 9)) for _ in range(10))
            await db.sessions.update_one(
                {"id": session_id},
                {"$set": {
                    "status": "connected",
                    "connected_at": now_iso(),
                    "phone_number": phone,
                    "qr_data_url": None,
                }},
            )

@api_router.post("/sessions")
async def create_session(req: SessionCreateReq, user=Depends(get_current_user)):
    sid = new_id()
    qr_payload = f"wa-gateway:{sid}:{secrets.token_urlsafe(12)}"
    qr = make_qr_data_url(qr_payload)
    doc = {
        "id": sid,
        "user_id": user["id"],
        "name": req.name,
        "phone_label": req.phone_label,
        "status": "qr",  # qr | connecting | connected | disconnected
        "qr_data_url": qr,
        "phone_number": None,
        "created_at": now_iso(),
        "connected_at": None,
    }
    await db.sessions.insert_one(doc)
    asyncio.create_task(simulate_qr_lifecycle(sid))
    return clean_doc(doc)

@api_router.get("/sessions")
async def list_sessions(user=Depends(get_current_user)):
    cursor = db.sessions.find({"user_id": user["id"]}).sort("created_at", -1)
    items = [clean_doc(d) async for d in cursor]
    return items

@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str, user=Depends(get_current_user)):
    sess = await db.sessions.find_one({"id": session_id, "user_id": user["id"]})
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return clean_doc(sess)

@api_router.post("/sessions/{session_id}/regenerate-qr")
async def regenerate_qr(session_id: str, user=Depends(get_current_user)):
    sess = await db.sessions.find_one({"id": session_id, "user_id": user["id"]})
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    qr_payload = f"wa-gateway:{session_id}:{secrets.token_urlsafe(12)}"
    qr = make_qr_data_url(qr_payload)
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "qr", "qr_data_url": qr, "connected_at": None, "phone_number": None}},
    )
    asyncio.create_task(simulate_qr_lifecycle(session_id))
    return {"qr_data_url": qr, "status": "qr"}

@api_router.post("/sessions/{session_id}/disconnect")
async def disconnect_session(session_id: str, user=Depends(get_current_user)):
    sess = await db.sessions.find_one({"id": session_id, "user_id": user["id"]})
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "disconnected", "qr_data_url": None}},
    )
    return {"status": "disconnected"}

@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user=Depends(get_current_user)):
    res = await db.sessions.delete_one({"id": session_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}

# ------------------ Messages ------------------

async def _process_send(user_id: str, session_id: str, to: str, message: str,
                        media_url: Optional[str] = None, media_type: Optional[str] = None,
                        source: str = "ui") -> Dict[str, Any]:
    sess = await db.sessions.find_one({"id": session_id, "user_id": user_id})
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess["status"] != "connected":
        raise HTTPException(status_code=400, detail="Session is not connected. Scan QR first.")
    msg_id = new_id()
    # simulate 92% success rate
    status = "sent" if random.random() < 0.92 else "failed"
    doc = {
        "id": msg_id,
        "user_id": user_id,
        "session_id": session_id,
        "direction": "outbound",
        "to": to,
        "from": sess.get("phone_number"),
        "message": message,
        "media_url": media_url,
        "media_type": media_type,
        "status": status,
        "source": source,  # ui | broadcast | api | auto_reply
        "created_at": now_iso(),
    }
    await db.messages.insert_one(doc)
    return clean_doc(doc)

@api_router.post("/messages/send")
async def send_message(req: SendMessageReq, user=Depends(get_current_user)):
    return await _process_send(user["id"], req.session_id, req.to, req.message,
                               req.media_url, req.media_type, source="ui")

@api_router.post("/messages/broadcast")
async def broadcast(req: BroadcastReq, user=Depends(get_current_user)):
    results = []
    for number in req.numbers:
        num = number.strip()
        if not num:
            continue
        try:
            r = await _process_send(user["id"], req.session_id, num, req.message, source="broadcast")
            results.append({"to": num, "status": r["status"], "id": r["id"]})
        except HTTPException as e:
            results.append({"to": num, "status": "failed", "error": e.detail})
    sent = sum(1 for r in results if r["status"] == "sent")
    failed = len(results) - sent
    return {"total": len(results), "sent": sent, "failed": failed, "results": results}

@api_router.get("/messages")
async def list_messages(
    limit: int = 50,
    skip: int = 0,
    status: Optional[str] = None,
    session_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    q: Dict[str, Any] = {"user_id": user["id"]}
    if status:
        q["status"] = status
    if session_id:
        q["session_id"] = session_id
    cursor = db.messages.find(q).sort("created_at", -1).skip(skip).limit(limit)
    items = [clean_doc(d) async for d in cursor]
    total = await db.messages.count_documents(q)
    return {"items": items, "total": total}

# ------------------ Auto-Reply ------------------

@api_router.post("/auto-replies")
async def create_rule(req: AutoReplyRuleReq, user=Depends(get_current_user)):
    doc = {
        "id": new_id(),
        "user_id": user["id"],
        "session_id": req.session_id,
        "keyword": req.keyword,
        "match_type": req.match_type,
        "reply": req.reply,
        "active": req.active,
        "created_at": now_iso(),
    }
    await db.auto_replies.insert_one(doc)
    return clean_doc(doc)

@api_router.get("/auto-replies")
async def list_rules(user=Depends(get_current_user)):
    cursor = db.auto_replies.find({"user_id": user["id"]}).sort("created_at", -1)
    return [clean_doc(d) async for d in cursor]

@api_router.patch("/auto-replies/{rule_id}")
async def update_rule(rule_id: str, req: AutoReplyRuleReq, user=Depends(get_current_user)):
    res = await db.auto_replies.update_one(
        {"id": rule_id, "user_id": user["id"]},
        {"$set": req.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    doc = await db.auto_replies.find_one({"id": rule_id})
    return clean_doc(doc)

@api_router.delete("/auto-replies/{rule_id}")
async def delete_rule(rule_id: str, user=Depends(get_current_user)):
    res = await db.auto_replies.delete_one({"id": rule_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"ok": True}

@api_router.post("/auto-replies/simulate")
async def simulate_incoming(req: SimulateInboundReq, user=Depends(get_current_user)):
    """Helper to simulate an incoming message and trigger auto-reply rules.
    Used to demonstrate auto-reply flow in UI without a real WA inbound."""
    session_id = req.session_id
    text = req.text.strip()
    sender = req.from_ or "62" + "".join(str(random.randint(0, 9)) for _ in range(10))
    sess = await db.sessions.find_one({"id": session_id, "user_id": user["id"]})
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    inbound = {
        "id": new_id(),
        "user_id": user["id"],
        "session_id": session_id,
        "direction": "inbound",
        "to": sess.get("phone_number"),
        "from": sender,
        "message": text,
        "status": "received",
        "source": "inbound",
        "created_at": now_iso(),
    }
    await db.messages.insert_one(inbound)
    # match rules
    rules = await db.auto_replies.find({
        "user_id": user["id"],
        "active": True,
        "$or": [{"session_id": session_id}, {"session_id": None}],
    }).to_list(100)
    matched = None
    low = text.lower()
    for r in rules:
        kw = r["keyword"].lower().strip()
        mt = r.get("match_type", "contains")
        if mt == "exact" and low == kw:
            matched = r
            break
        if mt == "starts_with" and low.startswith(kw):
            matched = r
            break
        if mt == "contains" and kw in low:
            matched = r
            break
    reply_doc = None
    if matched:
        reply_doc = await _process_send(user["id"], session_id, sender, matched["reply"], source="auto_reply")
    return {"inbound": clean_doc(inbound), "matched_rule": clean_doc(matched), "reply": reply_doc}

# ------------------ API Keys ------------------

@api_router.post("/api-keys")
async def create_api_key(req: ApiKeyCreateReq, user=Depends(get_current_user)):
    key = "wag_" + secrets.token_urlsafe(32)
    doc = {
        "id": new_id(),
        "user_id": user["id"],
        "label": req.label,
        "key_hash": hash_api_key(key),
        "key_prefix": key[:8],
        "key_suffix": key[-4:],
        "revoked": False,
        "created_at": now_iso(),
        "last_used_at": None,
    }
    await db.api_keys.insert_one(doc)
    # Return the FULL key once at creation. Subsequent listings only return masked form.
    out = clean_doc(dict(doc))
    out.pop("key_hash", None)
    out["key"] = key
    return out

@api_router.get("/api-keys")
async def list_api_keys(user=Depends(get_current_user)):
    cursor = db.api_keys.find({"user_id": user["id"]}).sort("created_at", -1)
    items = []
    async for d in cursor:
        d = clean_doc(d)
        prefix = d.get("key_prefix", "wag_")
        suffix = d.get("key_suffix", "")
        d["key_masked"] = f"{prefix}...{suffix}"
        d.pop("key_hash", None)  # never expose the hash
        items.append(d)
    return items

@api_router.delete("/api-keys/{key_id}")
async def revoke_api_key(key_id: str, user=Depends(get_current_user)):
    res = await db.api_keys.update_one(
        {"id": key_id, "user_id": user["id"]},
        {"$set": {"revoked": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"ok": True}

# ------------------ Public REST API (X-API-Key) ------------------

@api_router.post("/v1/send")
@limiter.limit("60/minute")
async def public_send(request: Request, req: PublicSendReq, user=Depends(get_user_by_api_key)):
    return await _process_send(user["id"], req.session_id, req.to, req.message, source="api")

@api_router.get("/v1/sessions")
async def public_sessions(user=Depends(get_user_by_api_key)):
    cursor = db.sessions.find({"user_id": user["id"]})
    return [
        {"id": d["id"], "name": d["name"], "status": d["status"], "phone_number": d.get("phone_number")}
        async for d in cursor
    ]

# ------------------ Stats / Dashboard ------------------

@api_router.get("/stats/overview")
async def stats_overview(user=Depends(get_current_user)):
    user_q = {"user_id": user["id"]}
    total_sessions = await db.sessions.count_documents(user_q)
    connected_sessions = await db.sessions.count_documents({**user_q, "status": "connected"})
    total_messages = await db.messages.count_documents({**user_q, "direction": "outbound"})
    sent_messages = await db.messages.count_documents({**user_q, "direction": "outbound", "status": "sent"})
    failed_messages = await db.messages.count_documents({**user_q, "direction": "outbound", "status": "failed"})

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_messages = await db.messages.count_documents({
        **user_q, "direction": "outbound", "created_at": {"$gte": today_start}
    })

    # 7-day timeseries
    series = []
    for i in range(6, -1, -1):
        day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=i)
        next_day = day + timedelta(days=1)
        count = await db.messages.count_documents({
            **user_q, "direction": "outbound",
            "created_at": {"$gte": day.isoformat(), "$lt": next_day.isoformat()},
        })
        series.append({"date": day.strftime("%b %d"), "count": count})

    success_rate = round((sent_messages / total_messages) * 100, 1) if total_messages else 100.0
    return {
        "total_sessions": total_sessions,
        "connected_sessions": connected_sessions,
        "total_messages": total_messages,
        "sent_messages": sent_messages,
        "failed_messages": failed_messages,
        "today_messages": today_messages,
        "success_rate": success_rate,
        "series": series,
    }

# ------------------ Health ------------------

@api_router.get("/")
async def root():
    return {"service": "wa-gateway", "status": "ok", "ts": now_iso()}

app.include_router(api_router)

_default_cors = "http://localhost:3000"
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", _default_cors).split(",") if o.strip()]
_allow_all = _cors_origins == ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=not _allow_all,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
