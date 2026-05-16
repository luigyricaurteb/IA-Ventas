# Agente WhatsApp

Bot de WhatsApp local con dashboard de gestión. Conecta un número real vía Baileys (WhatsApp Web), responde mensajes con un LLM (OpenRouter), y permite intervención humana desde el dashboard.

## Requisitos

- Node.js 20+ (recomendado: 22 con `.nvmrc`)
- Cuenta en [OpenRouter](https://openrouter.ai) con API key

## Configuración inicial

```bash
# 1. Clonar e instalar dependencias
npm install

# 2. Crear archivo de variables de entorno
cp .env.example .env.local
```

Edita `.env.local`:

```
OPENROUTER_API_KEY=sk-or-tu-clave-aquí
OPENROUTER_MODEL=openai/gpt-4o-mini
```

> **Nota sobre modelos:** Los modelos `:free` de OpenRouter tienen un límite de ~50 requests/día.
> Para uso real, usa `openai/gpt-4o-mini` (~$0.15 por millón de tokens, centavos por mes).

## Arranque

```bash
# Terminal 1 — Bot de WhatsApp
npm run start:bot

# Terminal 2 — Dashboard
npm run dev
```

O ambos en paralelo:

```bash
npm run start:all
```

Luego abre [http://localhost:3000](http://localhost:3000) y escanea el QR con WhatsApp.

## Flujo de uso

1. **Primera vez:** Aparece pantalla de QR → escanearlo con WhatsApp (Dispositivos vinculados).
2. **Conectado:** La sesión se guarda en `./auth/`. En reinicios, no se pide QR de nuevo.
3. **Mensajes entrantes:** Si el chat está en modo **IA**, el bot responde automáticamente.
4. **Modo Humano:** Desde el dashboard podés escribir mensajes directamente al cliente.
5. **Toggle:** Cada conversación tiene un toggle IA/HUMANO en la parte superior del panel.

## Personalizar el system prompt

Edita [`src/lib/system-prompt.ts`](src/lib/system-prompt.ts) para adaptar el comportamiento del bot a tu negocio:

```typescript
export const SYSTEM_PROMPT = `
Eres el asistente de [TU EMPRESA]. Tu rol es...
`.trim();
```

## Estructura del proyecto

```
src/
├── app/
│   ├── api/              # API routes (Next.js App Router)
│   │   ├── connection/   # status, disconnect
│   │   ├── conversations/ # lista y DELETE
│   │   ├── messages/     # GET y POST por conversación
│   │   └── mode/         # toggle AI/HUMAN
│   └── page.tsx          # Entrada — renderiza ConnectionGate
├── components/           # UI React
└── lib/
    ├── db.ts             # SQLite (better-sqlite3) + helpers
    ├── openrouter.ts     # Cliente LLM
    ├── system-prompt.ts  # Prompt del bot ← editar aquí
    └── baileys/
        ├── client.ts     # Conexión WhatsApp Web
        └── handler.ts    # Procesamiento de mensajes
scripts/
├── env-loader.ts         # Carga .env.local (debe importarse primero)
└── start-bot.ts          # Proceso bot principal
data/                     # Base de datos SQLite (gitignored)
auth/                     # Sesión Baileys (gitignored)
```

## Deploy en producción (EasyPanel / Railway)

> **IMPORTANTE:** El dashboard no tiene autenticación. Si lo exponés a internet,
> configurá **basic auth** a nivel proxy (Caddy/Nginx/EasyPanel) o usá **Cloudflare Access**
> ANTES de hacerlo público. Sin esto, cualquiera con la URL puede leer todas las
> conversaciones y enviar mensajes.

1. Asegurarte de tener **volúmenes persistentes** montados en:
   - `/app/data` — base de datos
   - `/app/auth` — sesión de WhatsApp

   Sin ellos, cada redeploy pierde las conversaciones y obliga a re-escanear el QR.

2. Variables de entorno en el panel de deploy:
   ```
   OPENROUTER_API_KEY=...
   OPENROUTER_MODEL=openai/gpt-4o-mini
   ```

3. El `Procfile` y `nixpacks.toml` incluidos ya configuran el build y arranque.

## Solución de problemas

| Síntoma | Causa | Solución |
|---------|-------|----------|
| Bot tira code 440 en loop | Browser fingerprint custom | Verificar que `Browsers.macOS('Desktop')` esté en `client.ts` |
| QR no aparece en el navegador | Bot no está corriendo | Ejecutar `npm run start:bot` |
| Error 429 del LLM | Modelo `:free` saturó cuota | Cambiar a `openai/gpt-4o-mini` en `.env.local` |
| Error 405 de Baileys | Versión WA desactualizada | `fetchLatestBaileysVersion()` ya lo maneja automáticamente |
| Procesos zombies (Windows) | tsx no cierra hijos | `tasklist` para encontrar PIDs + `taskkill /PID xxx /F` |

## Mejoras pendientes (v2)

- Soporte de imágenes salientes (enviar PNG de productos)
- Function calling real con `tools` de OpenRouter
- Auto-toggle a HUMAN cuando el bot detecta frase específica (regex en `handler.ts`)
- WebSockets en lugar de polling cada 2s
- Autenticación básica integrada en Next.js (middleware)
- Soporte de grupos (actualmente filtrados en `handler.ts`)
