# Vibe Budgeting X: one image with the API and the built SPA.
#
#   docker build -t vibe-budgeting-x .
#   docker compose up -d            (see docker-compose.yml)

# ---- 1. build the SPA ---------------------------------------------------------
FROM node:22-slim AS spa
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# tsc -b && vite build -> /src/frontend/dist
RUN npm run build

# ---- 2. runtime: Python 3.12 + backend deps + the SPA ------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DATABASE_PATH=/app/data/database.db \
    VBX_STATIC_DIR=/app/static \
    VBX_ENABLE_JOBS=false \
    TZ=UTC

# tzdata so TZ=Europe/Athens etc. decides what "today" is (as in the old app).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY backend/vbx ./vbx
COPY --from=spa /src/frontend/dist ./static

# Non-root user; the database folder is the only writable place it needs
# (database.db, secret_key, backups/, telegram_poll.lock).
RUN useradd --uid 1000 --user-group --no-create-home --home-dir /app vbx \
    && mkdir -p /app/data \
    && chown vbx:vbx /app/data
USER vbx

VOLUME ["/app/data"]
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5001/api/auth/session', timeout=4).status == 200 else 1)"]

# ONE worker: the price caches and the Telegram poller / backup scheduler live
# in the process (a second worker would double the price-API calls and run a
# second backup scheduler). Uvicorn still serves requests concurrently.
CMD ["python", "-m", "uvicorn", "vbx.api.main:app", "--host", "0.0.0.0", "--port", "5001", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
