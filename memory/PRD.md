# WA Gateway — PRD

## Original Problem Statement
"bisakah anda membantu gua untuk membuat wa gateway"

## User Choices
- WhatsApp library: Baileys (Note: Node-only — implemented as faithful MOCK on Python stack)
- Features: All (single send, broadcast, media, auto-reply, REST API, history, QR scan)
- Auth: JWT multi-user
- Multi-session per user: yes
- Design: Modern dashboard (Swiss/High-contrast, Vercel/Linear inspired)

## Architecture
- React (frontend, port 3000) + FastAPI (port 8001) + MongoDB
- JWT bearer auth + X-API-Key for public REST API
- WhatsApp behavior is **MOCKED** (real QR PNG generated; status auto-transitions to "connected" ~20s after creation to simulate scan). Send/broadcast simulate ~92% success rate.

## Implemented (Feb 2026)
- Auth (register, login, me) + seeded admin
- Sessions CRUD + QR generation + simulated connect lifecycle
- Send single message + broadcast (multi-number)
- Message history with filters
- Auto-reply rule CRUD + inbound simulator
- API keys CRUD + public `/api/v1/send` and `/api/v1/sessions` endpoints
- Dashboard stats (counts, 7-day chart)
- Frontend pages: Login, Register, Dashboard, Sessions, Send, Broadcast, Auto-Reply, History, API Keys, API Docs, Settings

## Backlog (P1/P2)
- Replace MOCK with real Baileys via Node.js sidecar service (P1)
- Media upload to object storage (currently URL field only) (P1)
- Webhook receiver for inbound messages (P2)
- Scheduled / queued message sending (P2)
- Team/workspace sharing of sessions (P2)
