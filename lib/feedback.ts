'use client';

/**
 * Physical feedback: a short buzz on completion, a double on level-up, and one
 * dry mechanical click. Sound is off until the user turns it on.
 */

export const SOUND_KEY = 'skillunit.sound';
export const HAPTICS_KEY = 'skillunit.haptics';

function enabled(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    return stored === 'on';
  } catch {
    return fallback;
  }
}

export function soundEnabled(): boolean {
  return enabled(SOUND_KEY, false);
}

export function hapticsEnabled(): boolean {
  return enabled(HAPTICS_KEY, true);
}

export function setPreference(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // Storage blocked; the preference simply does not persist.
  }
}

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    // Constructed lazily: creating it before a user gesture leaves it suspended.
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

/**
 * A single relay click: a very short noise burst through a narrow band-pass,
 * with an immediate decay. No tone, no ring.
 */
export function click(): void {
  if (!soundEnabled()) return;
  const ctx = audio();
  if (!ctx) return;

  const duration = 0.03;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // Exponential decay keeps it dry rather than letting it rattle.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 8);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2100;
  band.Q.value = 1.6;

  const gain = ctx.createGain();
  gain.gain.value = 0.22;

  source.connect(band).connect(gain).connect(ctx.destination);
  source.start();
  source.stop(ctx.currentTime + duration);
}

function vibrate(pattern: number | number[]): void {
  if (!hapticsEnabled()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Unsupported; nothing to fall back to.
  }
}

/** Completion: one short pulse. */
export function completed(): void {
  vibrate(18);
  click();
}

/** Level-up: a double pulse, so it is distinguishable without looking. */
export function leveledUp(): void {
  vibrate([18, 60, 28]);
  click();
}
