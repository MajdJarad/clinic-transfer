/* eslint-disable @typescript-eslint/no-explicit-any */
// The alarm for a driver's emergency alert, made with the Web Audio API (no sound files): a loud,
// continuous two-layer police-style wail (sawtooth + square, sweeping 600-1500 Hz) through a compressor, so it
// is as loud as the device allows and cuts through traffic and talking. Browsers only allow audio after the
// person has touched the page once, so the context is also created/resumed on the first touch.
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

/** Can sound actually be heard right now (the browser has allowed audio)? */
export function audioReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** Ask the browser to allow audio (call from a tap). */
export function enableAudio() {
  context();
}

let running: { stop: () => void } | null = null;

/** Start the continuous alarm (does nothing if it is already sounding). */
export function startAlarm() {
  if (running) return;
  const c = context();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = 1;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 6;
  comp.ratio.value = 14;
  comp.attack.value = 0.002;
  comp.release.value = 0.12;
  master.connect(comp).connect(c.destination);

  // Pitch sweeps up and down about twice a second.
  const lfo = c.createOscillator();
  lfo.type = 'triangle';
  lfo.frequency.value = 1.1;
  const depth = c.createGain();
  depth.gain.value = 450;
  lfo.connect(depth);

  const layers = [
    { type: 'sawtooth' as OscillatorType, gain: 0.55, mult: 1 },
    { type: 'square' as OscillatorType, gain: 0.4, mult: 2 },
  ];
  const oscs = layers.map((l) => {
    const o = c.createOscillator();
    o.type = l.type;
    o.frequency.value = 1050 * l.mult;
    const g = c.createGain();
    g.gain.value = l.gain;
    if (l.mult === 1) depth.connect(o.frequency);
    else {
      const d2 = c.createGain();
      d2.gain.value = 450 * l.mult;
      lfo.connect(d2).connect(o.frequency);
    }
    o.connect(g).connect(master);
    o.start();
    return o;
  });
  lfo.start();
  running = {
    stop: () => {
      try {
        master.gain.setTargetAtTime(0, c.currentTime, 0.03);
        window.setTimeout(() => {
          oscs.forEach((o) => o.stop());
          lfo.stop();
          master.disconnect();
        }, 150);
      } catch {
        /* already stopped */
      }
    },
  };
}

export function stopAlarm() {
  running?.stop();
  running = null;
}

/** Unlock audio on the first touch/click, so a later alert can actually be heard. */
export function unlockAudioOnFirstTouch() {
  const unlock = () => {
    context();
    // The alarm can also arrive as a system notification when the tab is in the background.
    try {
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    } catch {
      /* not supported */
    }
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
