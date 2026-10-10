// Sound effects made in code with the Web Audio API, so there are no audio
// files to load. Browsers only allow sound after the player has touched the
// page or pressed a key; until then play() does nothing.

import { CONFIG } from './config.js';

let ctx = null;
let master = null;

function unlock() {
  if (!CONFIG.soundVolume) return;
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = CONFIG.soundVolume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}
for (const type of ['pointerdown', 'keydown', 'touchend']) addEventListener(type, unlock, { passive: true });

// One note: starts `at` seconds from now, lasts `dur`, can glide to `slideTo`.
function tone(freq, at, dur, { type = 'sine', vol = 0.5, slideTo } = {}) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  // two quick rising blips
  gem() {
    tone(880, 0, 0.09, { type: 'triangle' });
    tone(1320, 0.07, 0.16, { type: 'triangle' });
  },
  // bright three-note jingle
  key() {
    tone(1319, 0, 0.12, { type: 'triangle', vol: 0.45 });
    tone(1661, 0.08, 0.12, { type: 'triangle', vol: 0.45 });
    tone(1976, 0.16, 0.3, { type: 'triangle', vol: 0.45 });
  },
  // lid thunk, then a rising sparkle
  chest() {
    tone(140, 0, 0.18, { type: 'square', vol: 0.35, slideTo: 60 });
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12 + i * 0.07, 0.22, { type: 'triangle', vol: 0.4 }));
  },
  // two low buzzes: no key
  locked() {
    tone(160, 0, 0.12, { type: 'square', vol: 0.3 });
    tone(120, 0.14, 0.2, { type: 'square', vol: 0.3 });
  },
  // short fanfare for finishing the level
  goal() {
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.13, 0.18, { type: 'triangle' }));
    tone(1047, 0.39, 0.7, { type: 'triangle' });
    tone(784, 0.39, 0.7, { vol: 0.3 });
    tone(523, 0.39, 0.7, { vol: 0.3 });
  },
};

export function play(name) {
  if (!ctx || ctx.state !== 'running') return;
  SOUNDS[name]?.();
}
