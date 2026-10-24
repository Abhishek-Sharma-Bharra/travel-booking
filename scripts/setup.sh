#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export npm_config_cache="${npm_config_cache:-/workspace/.npm-cache}"
if [ ! -f .env ]; then
  cp .env.example .env
  node -e 'const fs=require("node:fs"),crypto=require("node:crypto");const file=".env";fs.writeFileSync(file,fs.readFileSync(file,"utf8").replace("replace-with-a-random-secret-at-least-32-characters",crypto.randomBytes(48).toString("base64url")));'
fi
npm ci
if node --env-file=.env -e 'process.exit(["localhost","127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname)?0:1)'; then
  npm run db:start
fi
npm run db:generate
npm run db:migrate
npm run db:seed
