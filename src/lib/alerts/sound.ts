"use client";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AC();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Two-tone beep used for price-cross alerts. Synthesized via Web Audio (no asset). */
export function playAlertSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;

  function tone(freq: number, start: number, dur: number) {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx!.destination);
    gain.gain.setValueAtTime(0, t0 + start);
    gain.gain.linearRampToValueAtTime(0.25, t0 + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + start + dur);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.02);
  }

  tone(880, 0, 0.18);
  tone(1320, 0.2, 0.22);
}
