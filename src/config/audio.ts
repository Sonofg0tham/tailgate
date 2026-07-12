/**
 * Audio tuning for Tailgate. Everything the procedural Web Audio subsystem
 * needs lives here as plain numbers and lookups, so Craig can retune the
 * soundscape without touching synthesis code. All durations are in
 * milliseconds, all distances in pixels, matching the rest of the config
 * files.
 *
 * Every sound in this game is synthesised at runtime, there are no audio
 * asset files. That keeps licensing trivial (CC0 by construction) and keeps
 * the repo small.
 */

/** Floor surface underfoot, which decides the footstep synthesis colour. */
export type Surface = 'carpet' | 'tile' | 'concrete';

/** Which ambience bed plays in a given zone, or 'none' for silence. */
export type AmbienceBed = 'hvac' | 'office' | 'kitchen' | 'server' | 'dock' | 'none';

export const AUDIO = {
  /** Category gains, 0 to 1, multiplied under the master gain. */
  volumes: {
    master: 0.8,
    headroom: 0.72,
    sting: 0.9,
    footsteps: 0.5,
    guard: 0.6,
    radio: 0.4,
    ambience: 0.35,
  },

  /** Security console cues: short quiet triangle tones on the sting bus. */
  console: {
    toneType: 'triangle' as OscillatorType,
    openHz: 660,
    freezeHz: 440,
    deniedHz: 220,
    attackMs: 4,
    holdMs: 45,
    releaseMs: 120,
    peakGain: 0.22,
  },

  /** Which floor surface each zone reads as, by ZoneRect name. */
  zoneSurface: {
    // Building C
    office: 'carpet',
    reception: 'carpet',
    securityOffice: 'carpet',
    kitchen: 'tile',
    maintenance: 'tile',
    serverRoom: 'tile',
    loadingDock: 'concrete',
    carPark: 'concrete',
    // Data centre (carPark shared)
    lobby: 'tile',
    noc: 'carpet',
    plantRoom: 'concrete',
    loadingBay: 'concrete',
    corridor: 'tile',
    hallA: 'tile',
    hallB: 'tile',
    cage: 'tile',
    // Warehouse (carPark shared)
    whBreak: 'tile',
    whLobby: 'tile',
    whDock: 'concrete',
    whFloor: 'concrete',
    whOffice: 'carpet',
    whCage: 'tile',
  } as Record<string, Surface>,

  /** Which ambience bed plays in each zone, by ZoneRect name. */
  zoneAmbience: {
    // Building C
    office: 'office',
    reception: 'office',
    securityOffice: 'hvac',
    kitchen: 'kitchen',
    maintenance: 'hvac',
    serverRoom: 'server',
    loadingDock: 'dock',
    carPark: 'none',
    // Data centre (carPark shared)
    lobby: 'office',
    noc: 'hvac',
    plantRoom: 'hvac',
    loadingBay: 'dock',
    corridor: 'hvac',
    hallA: 'server',
    hallB: 'server',
    cage: 'server',
    // Warehouse (carPark shared)
    whBreak: 'kitchen',
    whLobby: 'office',
    whDock: 'dock',
    whFloor: 'hvac',
    whOffice: 'office',
    whCage: 'server',
  } as Record<string, AmbienceBed>,

  /** Player footstep synthesis per surface: a short filtered noise burst. */
  footstep: {
    carpet: { cutoffHz: 900, peakGain: 0.5, decayMs: 90, q: 0.7 },
    tile: { cutoffHz: 5200, peakGain: 1.0, decayMs: 70, q: 1.2 },
    concrete: { cutoffHz: 2200, peakGain: 0.8, decayMs: 110, q: 0.9 },
  } as Record<Surface, { cutoffHz: number; peakGain: number; decayMs: number; q: number }>,

  /** Milliseconds between player footsteps at each speed state. */
  stepIntervalMs: {
    creep: 620,
    walk: 380,
    run: 240,
  } as Record<'creep' | 'walk' | 'run', number>,

  /** Guard footstep cadence, hearing range, and occlusion filtering. */
  guardFootstep: {
    stepIntervalMs: 430,
    hearingRangePx: 520,
    /** Low-pass cutoff, Hz, when nothing blocks the line to the player. */
    occlusionOpenHz: 4200,
    /** Low-pass cutoff, Hz, when a wall or closed door blocks the line. */
    occlusionWallHz: 500,
    peakGain: 0.7,
  },

  /** Guard radio chatter that plays when the player is nearby. */
  radio: {
    proximityRangePx: 360,
    burstEveryMinMs: 3500,
    burstEveryMaxMs: 8000,
    burstMs: 550,
    cutoffHz: 1600,
    q: 6,
    peakGain: 0.6,
  },

  /** Ambience bed cross-fade timing. */
  ambience: {
    crossfadeMs: 800,
  },

  /** The alert sting: two detuned square tones plus a sharp noise tick. */
  sting: {
    toneAHz: 1245,
    toneBHz: 1867,
    toneType: 'square' as OscillatorType,
    attackMs: 4,
    holdMs: 60,
    releaseMs: 260,
    tickCutoffHz: 3000,
    tickMs: 40,
    peakGain: 0.9,
  },
} as const;
