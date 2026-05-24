/**
 * Bell notification sound generated with Web Audio API.
 * No audio file required — works in all modern browsers.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try { audioCtx = new AudioContext(); } catch { return null; }
  }
  return audioCtx;
}

export type SoundType = "bell" | "ding" | "payment";

export function playNotification(type: SoundType = "bell") {
  const ctx = getCtx();
  if (!ctx) return;

  // Resume if suspended (browser autoplay policy)
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;

  if (type === "bell" || type === "ding") {
    // Two-tone bell: 880 Hz then 660 Hz
    const tones = type === "bell" ? [880, 660] : [1047, 784];
    tones.forEach((freq, i) => {
      const osc    = ctx.createOscillator();
      const gain   = ctx.createGain();
      const start  = now + i * 0.18;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, start);
      osc.type = "sine";
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } else if (type === "payment") {
    // Ascending 3-note jingle for payments
    [523, 659, 784].forEach((freq, i) => {
      const osc   = ctx.createOscillator();
      const gain  = ctx.createGain();
      const start = now + i * 0.13;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, start);
      osc.type = "sine";
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }
}
