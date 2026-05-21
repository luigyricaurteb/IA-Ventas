/**
 * Transcripción de audio con Groq Whisper
 * Cada empresa usa su propia API key — Aivox no asume costos
 */

import type Database from "better-sqlite3";

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export function getGroqApiKey(db: Database.Database): string | null {
  try {
    const cfg = db.prepare("SELECT groq_api_key FROM company_config WHERE id=1").get() as { groq_api_key: string | null } | null;
    return cfg?.groq_api_key ?? null;
  } catch { return null; }
}

/**
 * Descarga el audio de Meta y lo transcribe con Groq Whisper
 * @returns texto transcrito o null si falla
 */
export async function transcribeMetaAudio(
  mediaId: string,
  metaToken: string,
  groqApiKey: string
): Promise<string | null> {
  try {
    // 1. Obtener URL de descarga desde Meta Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${metaToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!metaRes.ok) {
      console.error("[audio] Error obteniendo URL de media:", metaRes.status);
      return null;
    }
    const metaData = await metaRes.json() as { url?: string; error?: unknown };
    if (!metaData.url) {
      console.error("[audio] URL de media no encontrada:", metaData);
      return null;
    }

    // 2. Descargar el archivo de audio
    const audioRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${metaToken}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!audioRes.ok) {
      console.error("[audio] Error descargando audio:", audioRes.status);
      return null;
    }
    const audioBuffer = await audioRes.arrayBuffer();

    // 3. Enviar a Groq Whisper para transcripción
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
    formData.append("file", audioBlob, "audio.ogg");
    formData.append("model", "whisper-large-v3");
    formData.append("language", "es");
    formData.append("response_format", "text");

    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqApiKey}` },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error("[audio] Error Groq Whisper:", groqRes.status, err);
      return null;
    }

    const transcription = await groqRes.text();
    return transcription.trim() || null;

  } catch (e) {
    console.error("[audio] Error en transcripción:", (e as Error).message);
    return null;
  }
}

/**
 * Genera un resumen corto del texto transcrito para confirmar con el cliente
 */
export function buildConfirmationMessage(transcription: string, aiName: string): string {
  const clean = transcription.trim();
  const preview = clean.length > 200 ? clean.slice(0, 200) + "..." : clean;
  return `🎤 Escuché tu mensaje de voz. Entendí lo siguiente:\n\n_"${preview}"_\n\n¿Es correcto lo que dijiste? Responde *Sí* para continuar o *No* para que lo repitas.`;
}
