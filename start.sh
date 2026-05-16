#!/bin/sh
# Bot en background, Next.js en foreground
# Railway hace health check en el PORT que asigna (default 3000)

echo "[start.sh] Iniciando bot en background..."
npm run start:bot &
BOT_PID=$!
echo "[start.sh] Bot PID: $BOT_PID"

echo "[start.sh] Iniciando Next.js en puerto ${PORT:-3000}..."
exec node_modules/.bin/next start -p ${PORT:-3000} -H 0.0.0.0
