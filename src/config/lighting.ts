/**
 * Lighting tuning for Phase 5, the atmosphere pass. Two separable concerns live
 * here as plain numbers so Craig retunes without touching code:
 *  - how dark each room reads and how much cover darkness gives from guards,
 *  - the accessibility floor that keeps the game readable.
 *
 * Accessibility note (non-negotiable): darkness-as-cover is analytic, it never
 * hides the game from the human player. A soft aura always lights the player and
 * nearby walls, and visibilityFloorGlobal is a hard minimum brightness. Raise
 * that value if low-contrast scenes are hard to parse.
 */

/** Per-zone base analytic light level, 0 (pitch black) to 1 (fully lit). */
export const AMBIENT_LIGHT: Record<string, number> = {
  carPark: 0.55, // exterior, moonlit-ish, fairly readable
  reception: 0.45,
  office: 0.3, // dim; real light comes from the desk pools
  kitchen: 0.4,
  maintenance: 0.3,
  loadingDock: 0.35, // base low; the flood pool makes it harsh-bright
  securityOffice: 0.45,
  serverRoom: 0.12, // near-dark; only the rack LED pools light it
};

/** Light level outside every zone rectangle. */
export const AMBIENT_FALLBACK = 0.4;

export const LIGHTING = {
  /** Global minimum brightness for the HUMAN player. 0 allows pitch black, 1 removes darkness. */
  visibilityFloorGlobal: 0.22,
  /** Soft readability aura around the player. Render only, NEVER counted for detection. */
  playerAuraRadiusPx: 150,
  playerAuraStrength: 0.9,
  /**
   * Darkness-as-cover: the guard suspicion fill multiplier at pitch black. 1
   * removes the darkness advantage; lower means darkness hides you more.
   */
  concealmentFloor: 0.35,
  /** Per-kind light pool peak brightness (0..1) and reach (px). */
  pool: { intensity: 0.9, radiusPx: 140 },
  flood: { intensity: 1.0, radiusPx: 250 },
  rack: { intensity: 0.85, radiusPx: 70 },
  /** How much light the guard's own sightline adds where it can see. */
  guardTorchIntensity: 0.75,
} as const;
