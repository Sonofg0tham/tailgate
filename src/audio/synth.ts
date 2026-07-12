/**
 * Pure Web Audio synthesis helpers for Tailgate. No Phaser imports here, no
 * side effects beyond the audio graph the caller hands in. Everything the
 * game hears is built from these primitives at runtime, there are no audio
 * asset files to license or ship.
 *
 * A recurring gotcha baked into every envelope helper below:
 * exponentialRampToValueAtTime cannot target 0 (it throws, or silently does
 * nothing useful), so releases ramp down to a tiny epsilon and then snap the
 * value to exactly 0 with setValueAtTime.
 */

/** Floor for exponential ramps, since they cannot target 0 directly. */
const RAMP_EPSILON = 0.0001;

/**
 * Builds one shared buffer of white noise, `seconds` long. Every noise-based
 * sound (footsteps, radio static, ambience hum) plays this same buffer
 * through its own filter and gain rather than allocating a fresh buffer per
 * shot, keeping the audio graph cheap.
 */
export function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Schedules an attack-hold-release envelope on a gain node's AudioParam,
 * starting at the node's current context time. Uses linear ramps for the
 * attack and hold-to-peak stages, then an exponential ramp down to
 * RAMP_EPSILON followed by a hard setValueAtTime(0) for the release, since
 * exponentialRampToValueAtTime cannot target 0.
 *
 * Returns the absolute ctx.currentTime at which the sound is fully silent,
 * so callers can schedule node.stop() or cleanup at that time.
 */
export function scheduleGainEnvelope(
  gain: GainNode,
  ctx: AudioContext,
  attackMs: number,
  holdMs: number,
  releaseMs: number,
  peak: number
): number {
  const now = ctx.currentTime;
  const attackEnd = now + Math.max(0, attackMs) / 1000;
  const holdEnd = attackEnd + Math.max(0, holdMs) / 1000;
  const releaseEnd = holdEnd + Math.max(0, releaseMs) / 1000;

  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peak, attackEnd);
  gain.gain.setValueAtTime(peak, holdEnd);

  if (releaseMs > 0) {
    gain.gain.exponentialRampToValueAtTime(RAMP_EPSILON, releaseEnd);
    gain.gain.setValueAtTime(0, releaseEnd);
  } else {
    gain.gain.setValueAtTime(0, holdEnd);
  }

  return releaseEnd;
}

/**
 * Fires a one-shot burst of filtered noise: a buffer source through a
 * low-pass filter and a gain envelope, all self-stopping and disconnecting
 * on completion. Used for footsteps, radio static and the alert tick.
 *
 * `noiseBuffer` should be the single shared buffer from makeNoiseBuffer,
 * reused across every call rather than allocated per shot.
 */
export function playFilteredNoiseBurst(
  ctx: AudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  options: {
    cutoffHz: number;
    q: number;
    peakGain: number;
    decayMs: number;
    attackMs?: number;
    pan?: number;
  }
): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = options.cutoffHz;
  filter.Q.value = options.q;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  source.connect(filter);
  filter.connect(gain);
  const pan = options.pan;
  const panner = pan === undefined ? null : ctx.createStereoPanner();
  if (panner && pan !== undefined) {
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    gain.connect(panner);
    panner.connect(destination);
  } else {
    gain.connect(destination);
  }

  const stopAt = scheduleGainEnvelope(
    gain,
    ctx,
    options.attackMs ?? 2,
    0,
    options.decayMs,
    options.peakGain
  );

  source.start(ctx.currentTime);
  source.stop(stopAt + 0.02);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
    panner?.disconnect();
  };
}

/**
 * Fires a single sharp click: a very short burst of unfiltered-ish noise
 * through a high-pass-leaning low-pass, used for printer clicks and the
 * alert sting's tick.
 */
export function playClick(
  ctx: AudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  options: { cutoffHz: number; peakGain: number; durationMs: number; pan?: number }
): void {
  playFilteredNoiseBurst(ctx, destination, noiseBuffer, {
    cutoffHz: options.cutoffHz,
    q: 0.5,
    peakGain: options.peakGain,
    decayMs: options.durationMs,
    attackMs: 1,
    pan: options.pan,
  });
}

/**
 * Fires a single detuned tone burst (an oscillator through a gain envelope),
 * used by the alert sting. Self-stops and disconnects on completion.
 */
export function playToneBurst(
  ctx: AudioContext,
  destination: AudioNode,
  options: {
    type: OscillatorType;
    frequencyHz: number;
    attackMs: number;
    holdMs: number;
    releaseMs: number;
    peakGain: number;
  }
): void {
  const osc = ctx.createOscillator();
  osc.type = options.type;
  osc.frequency.value = options.frequencyHz;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  osc.connect(gain);
  gain.connect(destination);

  const stopAt = scheduleGainEnvelope(
    gain,
    ctx,
    options.attackMs,
    options.holdMs,
    options.releaseMs,
    options.peakGain
  );

  osc.start(ctx.currentTime);
  osc.stop(stopAt + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
