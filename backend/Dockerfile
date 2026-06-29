FROM python:3.11-slim

WORKDIR /app

# 1. Install build tools jika ada package python yang butuh compile (gcc, dll)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. Copy requirements duluan biar Docker bisa nge-cache layer ini (Build jadi instan kalau ga ada perubahan package)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copy seluruh source code
COPY . .

# 4. Tambahkan user non-root demi keamanan (Optional tapi sangat disarankan untuk production)
RUN useradd -m appuser && chown -R appuser /app
USER appuser

# 5. Environment variables
ENV PYTHONUNBUFFERED=1

# 6. Dokumentasi Port
EXPOSE 8001

# 7. Jalankan Uvicorn
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
