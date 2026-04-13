# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM oven/bun:1 AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile

COPY frontend/ ./
RUN bun run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM oven/bun:1-slim

WORKDIR /app

# Install backend dependencies
COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy backend source
COPY backend/src/ ./src/

# Copy built frontend static files (served by Bun/Elysia static plugin)
COPY --from=frontend-builder /app/frontend/dist ./public/

# Copy entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Environment defaults (override via -e or docker-compose)
ENV PORT=3000 \
    DB_PATH=/config/mc-manager.db \
    DATA_PATH=/mnt/user/appdata/minecraft \
    BACKUPS_PATH=/mnt/user/appdata/minecraft-backups \
    FRONTEND_URL=http://localhost:3000 \
    JWT_SECRET=change-me-in-production

EXPOSE 3000

# Volumes
VOLUME ["/config"]

ENTRYPOINT ["/entrypoint.sh"]
