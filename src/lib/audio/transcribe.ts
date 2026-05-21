/**
 * Transcripción de audio 100% autónoma — sin APIs externas
 * Usa OpenAI Whisper corriendo LOCALMENTE en nuestro servidor Railway
 * El modelo se descarga una vez desde HuggingFace (open-source, gratis)
 * y queda cacheado en DATA_DIR. Sin costos adicionales.
 */

import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const AUDIO_TMP = path.join(DATA_DIR, "audio_tmp");

// Caché del pipeline de Whisper (se inicializa una vez)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let whisperPipeline: any = null;
let initializingWhisper = false;
let whisperReady = false;

async function getWhisperPipeline() {
  if (whisperPipeline) return whisperPipeline;
  if (initializingWhisper) {
    // Esperar a que termine la inicialización
    await new Promise(r => setTimeout(r, 5000));
    return whisperPipeline;
  }

  initializingWhisper = true;
  try {
    console.log("[audio] Cargando modelo Whisper local (primera vez ~250MB)...");
    const { pipeline, env } = await import("@xenova/transformers");

    // Guardar modelo en DATA_DIR para que persista entre deploys
    env.cacheDir = path.join(DATA_DIR, "models");
    env.allowLocalModels = true;

    whisperPipeline = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-small",  // Buen español, 250MB, corre en CPU
      { quantized: true }       // Versión cuantizada: más rápida y liviana
    );

    whisperReady = true;
    console.log("[audio] ✅ Modelo Whisper listo");
    return whisperPipeline;
  } catch (e) {
    console.error("[audio] Error cargando Whisper:", (e as Error).message);
    initializingWhisper = false;
    return null;
  }
}

export function isAudioTranscriptionEnabled(): boolean {
  return true; // Siempre activo — corre localmente
}

/**
 * Convierte OGG/Opus a WAV usando ffmpeg (disponible en Railway)
 * Si ffmpeg no está disponible, retorna el buffer original
 */
async function convertToWav(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", [
      "-i", inputPath,
      "-ar", "16000",   // 16kHz requerido por Whisper
      "-ac", "1",        // mono
      "-f", "wav",
      "-y", outputPath,
    ]);
    return true;
  } catch {
    // ffmpeg no disponible — intentar con el archivo original
    return false;
  }
}

/**
 * Descarga audio de Meta y lo transcribe con Whisper local
 */
export async function transcribeMetaAudio(
  mediaId: string,
  metaToken: string,
): Promise<string | null> {
  if (!fs.existsSync(AUDIO_TMP)) {
    fs.mkdirSync(AUDIO_TMP, { recursive: true });
  }

  const tmpOgg = path.join(AUDIO_TMP, `${mediaId}.ogg`);
  const tmpWav = path.join(AUDIO_TMP, `${mediaId}.wav`);

  try {
    // 1. Obtener URL de descarga desde Meta
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${metaToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!metaRes.ok) { console.error("[audio] Error Meta URL:", metaRes.status); return null; }

    const metaData = await metaRes.json() as { url?: string };
    if (!metaData.url) { console.error("[audio] Sin URL de media"); return null; }

    // 2. Descargar el audio
    const audioRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${metaToken}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!audioRes.ok) { console.error("[audio] Error descarga:", audioRes.status); return null; }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    fs.writeFileSync(tmpOgg, audioBuffer);

    // 3. Convertir a WAV con ffmpeg
    const converted = await convertToWav(tmpOgg, tmpWav);
    const audioPath = converted ? tmpWav : tmpOgg;

    // 4. Transcribir con Whisper local
    const pipe = await getWhisperPipeline();
    if (!pipe) { console.error("[audio] Whisper no disponible"); return null; }

    console.log(`[audio] Transcribiendo ${mediaId}...`);
    const result = await pipe(audioPath, {
      language: "spanish",
      task: "transcribe",
      chunk_length_s: 30,
    });

    const transcription = result?.text?.trim() ?? null;
    console.log(`[audio] ✅ Transcripción: "${transcription?.slice(0, 80)}"`);
    return transcription;

  } catch (e) {
    console.error("[audio] Error transcripción:", (e as Error).message);
    return null;
  } finally {
    // Limpiar archivos temporales
    try { if (fs.existsSync(tmpOgg)) fs.unlinkSync(tmpOgg); } catch {}
    try { if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav); } catch {}
  }
}

/**
 * Precalentar el modelo Whisper al arrancar el bot
 * (evita demora en el primer audio)
 */
export async function warmupWhisper(): Promise<void> {
  if (whisperReady || initializingWhisper) return;
  getWhisperPipeline().catch(() => {});
}

/**
 * Genera mensaje de confirmación para el cliente
 */
export function buildConfirmationMessage(transcription: string): string {
  const clean = transcription.trim();
  const preview = clean.length > 250 ? clean.slice(0, 250) + "..." : clean;
  return `🎤 Escuché tu mensaje de voz. Entendí lo siguiente:\n\n_"${preview}"_\n\n¿Es correcto? Responde *Sí* para continuar o *No* para repetirlo.`;
}
