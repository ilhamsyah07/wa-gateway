// Baileys WhatsApp microservice for WA Gateway
// Exposes a tiny HTTP API that the FastAPI backend calls.
//
// Endpoints:
//   POST   /sessions/:id/connect          -> start connection, return initial state
//   GET    /sessions/:id                  -> { status, qr_data_url, phone_number }
//   POST   /sessions/:id/send             -> { to, message, mediaUrl?, mediaType? }
//   POST   /sessions/:id/disconnect       -> logout + remove auth files
//   DELETE /sessions/:id                  -> hard delete (same as disconnect)
//   GET    /health                        -> liveness probe
//
// Inbound messages and connection-state changes are POSTed to WEBHOOK_URL.

import express from "express";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode";
import pino from "pino";
import fs from "fs";
import path from "path";

const PORT = parseInt(process.env.PORT || "3001", 10);
const AUTH_DIR = process.env.AUTH_DIR || "/data/sessions";
const WEBHOOK_URL = process.env.WEBHOOK_URL || ""; // FastAPI inbound webhook
const SHARED_TOKEN = process.env.SHARED_TOKEN || ""; // simple shared-secret HTTP auth

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

fs.mkdirSync(AUTH_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: "10mb" }));

// Simple shared-token auth: every request from FastAPI must include this header.
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (!SHARED_TOKEN) return next(); // dev mode: no token
  if (req.headers["x-internal-token"] !== SHARED_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// In-memory map of active sessions
const sessions = new Map();
// { sock, status: 'qr'|'connecting'|'connected'|'disconnected', qrDataUrl, phoneNumber }

async function notifyWebhook(payload) {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SHARED_TOKEN ? { "X-Internal-Token": SHARED_TOKEN } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.warn({ err: err.message, payload: payload.event }, "webhook failed");
  }
}

async function startSession(sessionId) {
  if (sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    if (s.status === "connected" || s.status === "connecting") return s;
  }

  const authPath = path.join(AUTH_DIR, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "warn" }),
    printQRInTerminal: false,
    browser: ["WA Gateway", "Chrome", "1.0.0"],
  });

  const meta = { sock, status: "connecting", qrDataUrl: null, phoneNumber: null };
  sessions.set(sessionId, meta);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      meta.status = "qr";
      meta.qrDataUrl = await qrcode.toDataURL(qr, { margin: 1, width: 320 });
      await notifyWebhook({ event: "qr", session_id: sessionId, status: "qr" });
    }

    if (connection === "open") {
      meta.status = "connected";
      meta.qrDataUrl = null;
      meta.phoneNumber = sock.user?.id?.split(":")[0] || null;
      logger.info({ sessionId, phone: meta.phoneNumber }, "session connected");
      await notifyWebhook({
        event: "connected",
        session_id: sessionId,
        status: "connected",
        phone_number: meta.phoneNumber,
      });
    }

    if (connection === "close") {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      meta.status = shouldReconnect ? "connecting" : "disconnected";
      meta.qrDataUrl = null;
      logger.warn({ sessionId, code, shouldReconnect }, "connection closed");
      await notifyWebhook({
        event: "disconnected",
        session_id: sessionId,
        status: meta.status,
        code,
      });
      if (!shouldReconnect) {
        sessions.delete(sessionId);
        fs.rmSync(authPath, { recursive: true, force: true });
      } else {
        // Auto-reconnect after a short delay
        setTimeout(() => startSession(sessionId).catch((e) => logger.error(e)), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;
    for (const msg of m.messages) {
      if (msg.key.fromMe) continue;
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        "";
      if (!text) continue;
      await notifyWebhook({
        event: "message",
        session_id: sessionId,
        from: msg.key.remoteJid?.split("@")[0],
        to: meta.phoneNumber,
        text,
        message_id: msg.key.id,
      });
    }
  });

  return meta;
}

app.get("/health", (req, res) => res.json({ status: "ok", sessions: sessions.size }));

app.post("/sessions/:id/connect", async (req, res) => {
  try {
    const meta = await startSession(req.params.id);
    res.json({
      status: meta.status,
      qr_data_url: meta.qrDataUrl,
      phone_number: meta.phoneNumber,
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions/:id", (req, res) => {
  const meta = sessions.get(req.params.id);
  if (!meta) return res.status(404).json({ error: "not_found" });
  res.json({
    status: meta.status,
    qr_data_url: meta.qrDataUrl,
    phone_number: meta.phoneNumber,
  });
});

app.post("/sessions/:id/send", async (req, res) => {
  const meta = sessions.get(req.params.id);
  if (!meta || meta.status !== "connected") {
    return res.status(400).json({ error: "session_not_connected" });
  }
  const { to, message, mediaUrl, mediaType } = req.body;
  if (!to || (!message && !mediaUrl)) {
    return res.status(400).json({ error: "to and message/mediaUrl required" });
  }
  const jid = `${String(to).replace(/\D/g, "")}@s.whatsapp.net`;
  try {
    let payload;
    if (mediaUrl && mediaType === "image") payload = { image: { url: mediaUrl }, caption: message || "" };
    else if (mediaUrl && mediaType === "document") payload = { document: { url: mediaUrl }, fileName: "file", caption: message || "" };
    else if (mediaUrl && mediaType === "video") payload = { video: { url: mediaUrl }, caption: message || "" };
    else payload = { text: message };

    const sent = await meta.sock.sendMessage(jid, payload);
    res.json({ status: "sent", message_id: sent?.key?.id });
  } catch (err) {
    logger.error({ err: err.message, sessionId: req.params.id }, "send failed");
    res.status(500).json({ status: "failed", error: err.message });
  }
});

app.post("/sessions/:id/disconnect", async (req, res) => {
  const meta = sessions.get(req.params.id);
  if (!meta) return res.status(404).json({ error: "not_found" });
  try {
    await meta.sock.logout();
  } catch {}
  sessions.delete(req.params.id);
  fs.rmSync(path.join(AUTH_DIR, req.params.id), { recursive: true, force: true });
  res.json({ status: "disconnected" });
});

app.delete("/sessions/:id", async (req, res) => {
  const meta = sessions.get(req.params.id);
  if (meta) {
    try { await meta.sock.logout(); } catch {}
    sessions.delete(req.params.id);
  }
  fs.rmSync(path.join(AUTH_DIR, req.params.id), { recursive: true, force: true });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  logger.info(`Baileys microservice listening on :${PORT}`);
});
