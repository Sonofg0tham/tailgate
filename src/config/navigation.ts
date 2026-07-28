/**
 * Guard navigation tuning. This is the file Craig edits to change how guards
 * find their way around the building.
 *
 * Phase 20 playtest fix. Until now a guard steered in a dead straight line at
 * whatever it was chasing, with no pathfinding at all. Its body collides with
 * walls and shut doors, so anything behind geometry left the guard pressed into
 * a wall until its episode timed out. That is why a camera could raise the
 * alarm on the data centre and the guard would simply never turn up, and why a
 * thrown bolt felt useless: the guard heard it, then walked into a wall.
 *
 * Nothing in here touches detection. A guard that navigates properly is not a
 * guard that sees further, moves faster or reacts sooner, and the numbers in
 * config/detection.ts are deliberately left alone.
 *
 * All distances are pixels, all times are milliseconds.
 */
export const NAVIGATION = {
  /** How the walkable map is carved up. Built once per level, at load. */
  grid: {
    /**
     * Nav cell size. The maps are authored on a 32px grid and run 2400x1600,
     * so 16px gives two cells per authored tile: 150x100, 15,000 cells per
     * level. Fine enough to thread a 64px doorway, coarse enough that a full
     * search is still cheap. Raise it for speed, lower it for accuracy.
     */
    cellSizePx: 16,

    /**
     * Walls are fattened by this much before cells are marked unwalkable, so a
     * path never hugs a corner tighter than the guard's body can actually turn.
     * The guard's Arcade body is a circle of roughly 7.6px radius (a 36x43
     * sprite at 0.62 scale), so 10px keeps it clear of every corner and still
     * leaves 44px of a 64px doorway open.
     */
    agentRadiusPx: 10,

    /**
     * How far, in cells, to hunt for a standable cell when a start or goal
     * lands inside geometry (a noise thrown into a wall, a guard nudged into
     * one). 14 cells is 224px, about a room's width. Beyond that the answer is
     * "nowhere useful", and the caller falls back.
     */
    snapSearchCells: 14,

    /**
     * Safety valve on a single search, in expanded cells. A whole level is
     * 15,000 cells, so this never bites in normal play. It exists so a future,
     * much larger map cannot stall a frame.
     */
    maxExpandedCells: 20000,
  },

  /** How closely a guard follows the waypoints it has been given. */
  follow: {
    /**
     * How close to a waypoint counts as reaching it. Generous on purpose: a
     * tight radius makes a guard overshoot and swing back, and visible
     * wobble is exactly what the accessibility rules ask us to avoid.
     */
    waypointArriveEps: 10,

    /**
     * How close to the final destination counts as arrived. This is the number
     * every existing caller already relied on (patrol nodes, the last-seen
     * spot), so it is unchanged from the pre-pathfinding value.
     */
    goalArriveEps: 6,

    /**
     * Last stretch. Walls are fattened by the body radius, so a destination
     * tucked hard into a corner (a player pressed against a wall, a bolt thrown
     * at one) has no waypoint that lands on it exactly. Once the plan runs out
     * within this distance, the guard closes the rest directly, which keeps a
     * chase ending in a corner exactly as tight as it was before pathfinding.
     * Generous enough to cover the worst snap, short enough that no real wall
     * fits inside it.
     */
    finalApproachPx: 40,
  },

  /** When a guard is allowed to throw away its plan and search again. */
  repath: {
    /**
     * Shortest gap between two searches for one guard. A chase moves its goal
     * every single frame, so without this the guard would search 60 times a
     * second and twitch between slightly different routes. Four searches a
     * second is plenty to keep up with a running player.
     */
    minIntervalMs: 250,

    /**
     * How far the destination must move before the plan is worth redoing. Stops
     * a jittering target (footsteps, a player shuffling on the spot) from
     * triggering a search for no gain.
     */
    goalMovedEps: 24,
  },

  /**
   * The stuck watchdog. Comparing how far the body actually travelled against
   * how far its commanded speed should have carried it catches every flavour of
   * pinned, whatever the cause, without having to guess at the geometry.
   */
  stuck: {
    /** Length of the progress sample window. */
    windowMs: 400,

    /**
     * Below this much expected travel in a window, the guard was not really
     * trying to go anywhere (a patrol pause, a look-around), so no judgement
     * is made.
     */
    minExpectedPx: 8,

    /**
     * Fraction of the expected travel that still counts as making progress.
     * A guard sliding along a wall it is brushing keeps roughly 70 percent of
     * its speed, so 0.35 only fires on something genuinely jammed.
     */
    progressFraction: 0.35,

    /**
     * Consecutive stuck windows before the guard gives up on this destination.
     * The first strike forces a fresh search, which fixes almost everything;
     * three strikes is 1.2 seconds, after which the guard stops shoving and the
     * caller moves on (next patrol node, or straight into the look-around).
     */
    strikesBeforeGiveUp: 3,

    /**
     * After giving up, hold off on searching again for this long. The guard
     * stands and looks at the spot instead of immediately walking back into the
     * same wall, which reads as a guard deciding, not a guard glitching.
     */
    giveUpCooldownMs: 900,
  },
} as const;
