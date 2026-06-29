from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import uuid
import base64
import logging
import secrets
import asyncio
import random
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import bcrypt
import jwt
import qrcode
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Header, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# ------------------ Setup ------------------

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="WA Gateway API", version="1.0.0")
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
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

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
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user

async def get_user_by_api_key(x_api_key: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    key_doc = await db.api_keys.find_one({"key": x_api_key, "revoked": False})
    if not key_doc:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")
    user = await db.users.find_one({"id": key_doc["user_id"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
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
    numbers: List[str]
    message: str

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
    await db.api_keys.create_index("key", unique=True)
    await db.auto_replies.create_index("user_id")

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@wagateway.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "name": "Admin",
            "role": "admin",
            "password_hash": hash_password(admin_password),
            "created_at": now_iso(),
        })
        logger.info("Seeded admin user %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ------------------ Auth ------------------

@api_router.post("/auth/register")
async def register(req: RegisterReq):
    email = req.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "id": new_id(),
        "email": email,
        "name": req.name.strip(),
        "role": "user",
        "password_hash": hash_password(req.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_access_token(user["id"], user["email"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "access_token": token, "token_type": "bearer"}

@api_router.post("/auth/login")
async def login(req: LoginReq):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "access_token": token, "token_type": "bearer"}

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
async def simulate_incoming(payload: Dict[str, Any], user=Depends(get_current_user)):
    """Helper to simulate an incoming message and trigger auto-reply rules.
    Used to demonstrate auto-reply flow in UI without a real WA inbound."""
    session_id = payload.get("session_id")
    text = (payload.get("text") or "").strip()
    sender = payload.get("from") or "62" + "".join(str(random.randint(0,9)) for _ in range(10))
    if not session_id or not text:
        raise HTTPException(status_code=400, detail="session_id and text required")
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
        "key": key,
        "revoked": False,
        "created_at": now_iso(),
        "last_used_at": None,
    }
    await db.api_keys.insert_one(doc)
    return clean_doc(doc)

@api_router.get("/api-keys")
async def list_api_keys(user=Depends(get_current_user)):
    cursor = db.api_keys.find({"user_id": user["id"]}).sort("created_at", -1)
    items = []
    async for d in cursor:
        d = clean_doc(d)
        # show masked except for last 4
        d["key_masked"] = d["key"][:8] + "..." + d["key"][-4:]
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
async def public_send(req: PublicSendReq, user=Depends(get_user_by_api_key)):
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
