#!/bin/sh
# Arranca el bot en background y Next.js en foreground
# Railway monitorea el proceso principal (Next.js) en el PORT asignado

# Iniciar bot en background con nohup para aislar completamente
nohup npm run start:bot > /tmp/bot.log 2>&1 &
BOT_PID=$!
echo "[start.sh] Bot iniciado con PID $BOT_PID"

# Esperar un poco para que el bot se inicie
sleep 2

# Next.js en foreground — Railway hace health check aquí
# Usar PORT de Railway (por defecto 3000)
PORT=${PORT:-3000}
echo "[start.sh] Iniciando Next.js en puerto $PORT"

# Ejecutar Next.js en foreground
npm run start
