# Deploy WA Gateway ke VPS Anda

Panduan ini akan membantu Anda menjalankan **WA Gateway lengkap (frontend + backend + MongoDB + Baileys + Nginx + SSL)** di VPS Ubuntu 22.04+ dengan satu perintah `docker compose up -d`.

---

## 1. Persiapan VPS

**Spesifikasi minimum:**
- 1 vCPU, 2 GB RAM (untuk ~5–10 sesi WA aktif)
- 20 GB disk
- Ubuntu 22.04 LTS
- Domain yang sudah diarahkan A-record ke IP VPS (mis. `wagateway.yourdomain.com`)

**Install Docker + Docker Compose:**
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## 2. Clone repo & siapkan environment

```bash
git clone <repo-url> wa-gateway
cd wa-gateway
cp .env.example .env
nano .env
```

Isi `.env` minimal seperti ini:
```env
APP_PUBLIC_URL=https://wagateway.yourdomain.com
CORS_ORIGINS=https://wagateway.yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=                           # kosongkan → auto-generate kuat saat first boot
JWT_SECRET=$(openssl rand -hex 32)        # ganti dengan hasil command
BAILEYS_TOKEN=$(openssl rand -hex 24)     # ganti dengan hasil command
DB_NAME=wa_gateway_db

# Optional — kalau pakai Resend untuk email
RESEND_API_KEY=re_xxxxx
RESEND_FROM=WA Gateway <noreply@yourdomain.com>
```

> **Penting**: Kalau `ADMIN_PASSWORD` dikosongkan, backend akan auto-generate password saat pertama kali jalan dan menampilkan-nya **sekali** di log. Jalankan `docker logs wagw-backend | grep "FIRST-BOOT"` setelah `docker compose up` untuk melihatnya. Simpan password tersebut.

---

## 3. SSL certificate (Let's Encrypt)

Cara cepat — pakai `certbot` standalone:
```bash
sudo apt install certbot
sudo certbot certonly --standalone -d wagateway.yourdomain.com
sudo cp /etc/letsencrypt/live/wagateway.yourdomain.com/fullchain.pem deploy/certs/
sudo cp /etc/letsencrypt/live/wagateway.yourdomain.com/privkey.pem deploy/certs/
sudo chown -R $USER:$USER deploy/certs/
```

Edit `deploy/nginx.conf` ganti `server_name _;` di blok https jadi `server_name wagateway.yourdomain.com;`.

---

## 4. Jalankan!

```bash
docker compose up -d --build
docker compose ps
```

Cek semua container UP:
- `wagw-mongo`
- `wagw-baileys`
- `wagw-backend`
- `wagw-frontend`
- `wagw-nginx`

Cek log backend:
```bash
docker logs -f wagw-backend
```

Buka browser ke `https://wagateway.yourdomain.com` → halaman login muncul.

---

## 5. Login pertama kali

- Email: nilai `ADMIN_EMAIL` di `.env`
- Password: yang Anda isi di `ADMIN_PASSWORD`, atau yang muncul di log kalau dikosongkan

Setelah login:
1. Buka **Sesi** → klik **Sesi baru** → scan QR code dari WhatsApp HP Anda (Pengaturan → Perangkat tertaut → Tautkan perangkat)
2. Setelah connected, buka **Kirim Pesan** untuk test kirim ke nomor Anda sendiri
3. Buka **API Keys** untuk generate key buat REST API integration

---

## 6. Backup MongoDB

Jadwalkan cron daily:
```bash
# /etc/cron.daily/wagw-backup
#!/bin/bash
docker exec wagw-mongo mongodump --archive --gzip --db wa_gateway_db > \
  /var/backups/wagw-$(date +%Y%m%d).gz
find /var/backups -name "wagw-*.gz" -mtime +14 -delete
```

Restore:
```bash
docker exec -i wagw-mongo mongorestore --archive --gzip --drop < wagw-20260101.gz
```

---

## 7. Update kode

```bash
git pull
docker compose up -d --build
```

Mongo + Baileys data tetap aman (di volume Docker).

---

## 8. Troubleshooting

**QR tidak muncul / sesi langsung disconnect?**
- Cek `docker logs wagw-baileys` — biasanya issue Baileys version vs WhatsApp Web protocol. Update `@whiskeysockets/baileys` di `baileys-service/package.json` ke versi terbaru lalu rebuild.

**Backend tidak bisa connect ke Baileys?**
- Pastikan `BAILEYS_URL=http://baileys:3001` (nama service di docker network, BUKAN localhost)
- Cek `BAILEYS_TOKEN` di backend dan baileys-service sama.

**Email tidak terkirim?**
- Kalau `RESEND_API_KEY` kosong → email no-op (sengaja, lihat log `[email no-op]`).
- Kalau di-set tapi tetap gagal → cek log backend, biasanya domain `from` belum diverifikasi di Resend dashboard.

**WhatsApp logout sendiri setelah beberapa jam?**
- Biasanya karena multi-device sync issue. Solusinya: di Sesi list, klik **Refresh QR** untuk re-scan. Untuk reliability lebih tinggi, jalankan tiap sesi di server yang stabil (jangan VPS yang sering restart).

---

## 9. Arsitektur

```
┌──────────────────────────────────────────────────────────┐
│                       VPS Anda                           │
│                                                          │
│  ┌────────┐    ┌─────────┐    ┌─────────┐    ┌────────┐  │
│  │ nginx  │────│ frontend│    │ backend │────│ baileys│  │
│  │  :443  │    │  React  │    │ FastAPI │    │ Node.js│  │
│  │        │────│  static │    │   /api  │    │  :3001 │  │
│  └────────┘    └─────────┘    └────┬────┘    └────┬───┘  │
│                                     │              │     │
│                                ┌────┴──────────────┴───┐ │
│                                │       MongoDB         │ │
│                                │  (users, sessions,    │ │
│                                │   messages, keys...)  │ │
│                                └───────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Semua container di network internal `wagw`; hanya `nginx` yang expose port 80/443 ke publik.
