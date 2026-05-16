#!/bin/sh
# Arranca el bot en background y Next.js en foreground
# Railway monitorea el proceso principal (Next.js) en el PORT asignado
npm run start:bot &
BOT_PID=$!
echo "[start.sh] Bot iniciado con PID $BOT_PID"

# Next.js en foreground — Railway hace health check aquí
exec npm run start
