FROM oven/bun:1 AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile

COPY frontend/ ./
RUN bun run build

FROM oven/bun:1-slim

WORKDIR /app

COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY backend/src/ ./src/

COPY --from=frontend-builder /app/frontend/dist ./public/

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=3000 \
    DB_PATH=/config/mc-manager.db \
    DATA_PATH=/data \
    BACKUPS_PATH=/backups \
    FRONTEND_URL=http://localhost:3000 \
    JWT_SECRET=change-me-in-production

EXPOSE 3000

VOLUME ["/config"]

ENTRYPOINT ["/entrypoint.sh"]
