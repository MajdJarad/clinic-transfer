/* eslint-disable @typescript-eslint/no-explicit-any */
// A short two-tone siren made with the Web Audio API (no sound files). Browsers only allow audio after
// the person has touched the page once, so the context is also created/resumed on the first touch.
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function playSiren() {
  const c = context();
  if (!c) return;
  const t0 = c.currentTime;
  for (let i = 0; i < 6; i++) {
    const start = t0 + i * 0.28;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(i % 2 ? 960 : 700, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.28);
  }
}

/** Unlock audio on the first touch/click, so a later alert can actually be heard. */
export function unlockAudioOnFirstTouch() {
  const unlock = () => {
    context();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}
