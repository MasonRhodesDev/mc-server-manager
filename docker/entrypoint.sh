#!/bin/sh
set -e

# Ensure config directory exists
mkdir -p "$(dirname "${DB_PATH}")"

# Run backend
exec bun run src/index.ts
