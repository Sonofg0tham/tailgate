/**
 * Camera hijack tuning. This is the file Craig edits to change how the
 * security office console behaves: how long a looped feed stays frozen, how
 * long a camera takes to re-sync before it can be looped again, and how many
 * loop charges one engagement gets. Console placement lives with the camera
 * wiring in each level's cameras.json.
 */
export const HIJACK = {
  /** The console interactable in the security office. */
  console: {
    /** How close the player must be to the console to use it. */
    interactRangePx: 60,
  },

  /**
   * How long a looped feed keeps its camera from detecting anything.
   * Phase 14 playtest: at 12s, looping the server camera then travelling to
   * the rack left no margin for the 3s plant hold; one hesitation meant a
   * detain. 18s makes the loop a plan rather than a frame-perfect trick.
   */
  freezeDurationMs: 18000,

  /** Per-camera re-sync time after a loop ends before it can be looped again. */
  cameraCooldownMs: 45000,

  /** Loop charges per engagement. Spent charges survive a detain restart. */
  charges: 2,

  /** Building alert level at which the console refuses to serve. */
  lockoutAlertLevel: 2,

  /** The live feed viewport on the multiplexer screen, in screen pixels. */
  feed: { x: 180, y: 110, width: 600, height: 320 },

  /** Cone colour while a camera's feed is looped. Paired with a dashed edge,
   * a halted sweep and a ring pip, so the state is never colour alone. */
  frozenConeColour: 0x555a63,
} as const;
