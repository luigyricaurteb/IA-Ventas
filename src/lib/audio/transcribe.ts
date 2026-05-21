/**
 * Transcripción de audio con OpenAI Whisper — nivel plataforma
 * Una sola clave en Railway (WHISPER_API_KEY o OPENAI_API_KEY)
 * Aivox incluye el costo en el plan — las empresas no necesitan configurar nada
 */

import type Database from "better-sqlite3";

const WHISPER_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";

function getWhisperKey(): string | null {
  return process.env.WHISPER_API_KEY ?? process.env.OPENAI_API_KEY ?? null;
}

export function isAudioTranscriptionEnabled(): boolean {
  return !!getWhisperKey();
}

/**
 * Descarga el audio de Meta y lo transcribe con OpenAI Whisper
 * @returns texto transcrito o null si falla
 */
export async function transcribeMetaAudio(
  mediaId: string,
  metaToken: string,
): Promise<string | null> {
  const apiKey = getWhisperKey();
  if (!apiKey) {
    console.warn("[audio] Sin WHISPER_API_KEY configurada en Railway");
    return null;
  }

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
      console.error("[audio] URL de media no encontrada");
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

    // 3. Enviar a OpenAI Whisper para transcripción
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
    formData.append("file", audioBlob, "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "es");
    formData.append("response_format", "text");

    const whisperRes = await fetch(WHISPER_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      console.error("[audio] Error Whisper:", whisperRes.status, err);
      return null;
    }

    const transcription = await whisperRes.text();
    return transcription.trim() || null;

  } catch (e) {
    console.error("[audio] Error en transcripción:", (e as Error).message);
    return null;
  }
}

/**
 * Genera mensaje de confirmación para el cliente
 */
export function buildConfirmationMessage(transcription: string): string {
  const clean = transcription.trim();
  const preview = clean.length > 250 ? clean.slice(0, 250) + "..." : clean;
  return `🎤 Escuché tu mensaje de voz. Entendí lo siguiente:\n\n_"${preview}"_\n\n¿Es correcto? Responde *Sí* para continuar o *No* para repetirlo.`;
}
