#!/bin/sh
# Arranca el bot en background y Next.js en foreground
# Railway monitorea el proceso principal (Next.js) en el PORT asignado

npm run start:bot &
BOT_PID=$!
echo "[start.sh] Bot iniciado con PID $BOT_PID"

# Next.js en foreground — Railway hace health check aquí
# Usar PORT de Railway (por defecto 3000)
PORT=${PORT:-3000}
echo "[start.sh] Iniciando Next.js en puerto $PORT"
exec next start -p $PORT
