#!/bin/sh
set -e

mkdir -p "$(dirname "${DB_PATH}")"

exec bun run src/index.ts
