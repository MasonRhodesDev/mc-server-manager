dev:
    -fuser -k 3001/tcp 5173/tcp 2>/dev/null
    docker compose down --remove-orphans
    docker compose up
