# WA Gateway — PRD

## Original Problem Statement
"bisakah anda membantu gua untuk membuat wa gateway"

## Architecture
- React (frontend) + FastAPI (backend) + MongoDB
- Optional Node.js Baileys microservice (real WA) via `BAILEYS_URL` env switch
- Optional Resend (email) via `RESEND_API_KEY` env
- Optional Emergent-managed Google OAuth alongside JWT email/password auth
- i18n Indonesian (default) + English with live switcher
- Containerized with docker-compose for VPS deploy + Nginx + SSL

## Iterations
### Iteration 1 (Feb 2026) — MVP (mocked Baileys)
- Email/password auth, sessions+QR, send/broadcast/auto-reply/history/api-keys/api-docs

### Iteration 2 — Emergent Google Auth + Admin Approval
- New Google users land status='pending'; admin approves via /admin/users

### Iteration 3 — i18n (ID/EN)
- LanguageContext + t() hook, compact/full switcher in sidebar/login/settings

### Iteration 4 — Security hardening pass
- SEC-001: admin password no longer force-reset (random on first boot if no env)
- SEC-002: API keys sha256-hashed at rest; full key shown once
- SEC-003: Pydantic validation on auto-reply simulate
- JWT iat + type='access' + 24h expiry; rate limiting; CORS allowlist; broadcast cap 500

### Iteration 5 — Production-ready package
- **Real Baileys**: Node.js microservice at /app/baileys-service/ (package.json, server.js, Dockerfile). FastAPI proxies via `BAILEYS_URL` env. Webhook `/api/webhook/baileys` for inbound + state events (X-Internal-Token auth).
- **Resend email**: Graceful no-op when `RESEND_API_KEY` unset. Sends invitation links + admin-approval notifications.
- **Invitation links**: Admin creates → user accepts at `/invite/{token}` → status='active' (no admin approval). Auto-revokes previous pending invites per email. Public read endpoint returns 410 for accepted/revoked/expired.
- **VPS deployment package**: `/app/docker-compose.yml` (mongo + baileys + backend + frontend + nginx), `/app/backend/Dockerfile`, `/app/frontend/Dockerfile`, `/app/baileys-service/Dockerfile`, `/app/deploy/nginx.conf`, `/app/.env.example`, `/app/README-DEPLOY.md` (step-by-step Ubuntu guide)
- Tests: 58/61 (3 known-flaky/rate-collision, not regressions). All 14 new invitation tests pass. Frontend 9/9 invitation flow.

## Backlog
- Email provider key collection (RESEND_API_KEY) when user opts in
- Split server.py into routers/ submodules (now 1100+ lines)
- Webhook receiver for inbound messages
- Scheduled / queued messages
- Per-user usage metering + Stripe billing
- Password reset flow
- Redis-backed slowapi for multi-instance deployments
