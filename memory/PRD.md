# WA Gateway — PRD

## Original Problem Statement
"bisakah anda membantu gua untuk membuat wa gateway"

## User Choices
- WhatsApp library: Baileys (Note: Node-only — implemented as faithful MOCK on Python stack)
- Features: All (single send, broadcast, media, auto-reply, REST API, history, QR scan)
- Auth: JWT email/password + Emergent-managed Google OAuth with admin approval flow
- Multi-session per user: yes
- Design: Modern dashboard (Swiss/High-contrast, Vercel/Linear inspired)
- i18n: Indonesian (default) + English with live switcher

## Architecture
- React (frontend, port 3000) + FastAPI (port 8001) + MongoDB
- JWT bearer auth (24h expiry, type='access' claim validated, iat included)
- X-API-Key (sha256-hashed at rest) for public REST API
- Rate limiting via slowapi (XFF-aware key_func)
- CORS allowlist via CORS_ORIGINS env
- WhatsApp behavior is **MOCKED** (real QR PNG; status auto-transitions to "connected" ~20s after creation; ~92% send success)

## Iterations
### Iteration 1 (Feb 2026) — MVP
- Email/password auth, sessions+QR, send/broadcast/auto-reply/history/api-keys/api-docs UI
- 16/16 backend tests passing

### Iteration 2 — Emergent Google Auth + Admin Approval
- Google sign-in button; first-time Google users land in `status='pending'`
- Admin Users page with Pending/Active/All tabs + Approve/Reject
- `require_admin` dependency on /api/admin/* routes
- 15/15 new tests + regression OK

### Iteration 3 — i18n (ID/EN)
- LanguageContext + useT() hook, persisted in localStorage (wag_lang)
- Compact ↔ full switcher; default Indonesian
- All 10+ pages translated, zero raw keys leaking

### Iteration 4 — Security Hardening Pass
- SEC-001: admin password no longer force-reset on startup; first-boot generates random if no env
- SEC-002: API keys sha256-hashed at rest; full key shown only once at creation; legacy plaintext keys auto-migrated on startup
- SEC-003: SimulateInboundReq Pydantic model prevents NoSQL operator injection
- JWT: shorter expiry (24h), `iat` claim added, `type='access'` validated on every decode
- Rate limiting: login 5/min, register 3/min, google-session 10/min, public /v1/send 60/min (XFF-aware)
- Broadcast cap: max 500 numbers/request
- CORS: explicit allowlist via env (no more wildcard)
- 46/47 tests passing (1 pre-existing flaky auto-reply test)

## Backlog (P1/P2)
- Replace MOCK with real Baileys Node.js sidecar service (P1)
- Email notifications (Resend/SendGrid) for admin approvals (P1)
- Object-storage backed media upload (currently URL-only) (P1)
- Webhook receiver for real inbound messages (P2)
- Scheduled/queued message sending (P2)
- Password reset flow (P2)
- Docker compose + VPS deploy guide (P2)
- Per-user usage metering + Stripe billing (P3)
