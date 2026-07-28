import { NAVIGATION } from '../config/navigation';

/**
 * A rectangle in world space. Structurally identical to the map's WallRect and
 * DoorRect, but declared here so the nav grid never imports Phaser and can be
 * unit tested on its own.
 */
export interface NavRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One world-space waypoint on a path. */
export interface NavPoint {
  x: number;
  y: number;
}

/** Cell flags. Static is the level's walls, dynamic is whichever doors are shut. */
const BLOCKED_STATIC = 1;
const BLOCKED_DYNAMIC = 2;

/** Open-list membership. Stamped per search, so nothing has to be cleared. */
const STATE_OPEN = 1;
const STATE_CLOSED = 2;

/** Neighbour offsets: the four orthogonals first, then the four diagonals. */
const NEIGHBOUR_DX = [1, -1, 0, 0, 1, 1, -1, -1] as const;
const NEIGHBOUR_DY = [0, 0, 1, -1, 1, -1, 1, -1] as const;
const ORTHOGONAL_COUNT = 4;

/** Cost of a diagonal step, in cells. */
const DIAGONAL_COST = Math.SQRT2;

/** Tolerance for "this ray passes exactly through a cell corner". */
const CORNER_EPSILON = 1e-9;

/**
 * The walkable map, as a grid of cells, plus A* over it.
 *
 * Phase 20 playtest fix. Guards had no navigation at all: they pointed
 * themselves at a target and pushed, so a wall in between pinned them there
 * until the episode timed out. This gives them a map to walk.
 *
 * How it works, in order:
 *  - the level's wall rectangles are fattened by the guard's body radius and
 *    stamped onto a grid, so any cell a guard's body could not stand in is
 *    marked unwalkable (this is the standard trick of growing the obstacles
 *    instead of shrinking the walker),
 *  - currently-shut doors are stamped on top as a separate layer that can be
 *    swapped out as doors open and close, without rebuilding the grid,
 *  - findPath runs A* across the free cells and then string-pulls the result,
 *    dropping every waypoint that a straight walk can skip, so guards move in
 *    natural diagonals instead of stepping round a staircase.
 *
 * Everything the search needs is allocated once in the constructor and reused,
 * so a search costs no garbage. Guards only search when they pick a new
 * destination, never per frame.
 */
export class NavGrid {
  /** Cell size in pixels. */
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;

  /** How far walls were fattened when the grid was stamped. */
  private readonly agentRadius: number;

  /** One byte of BLOCKED_ flags per cell. */
  private readonly flags: Uint8Array;

  // A* working memory, allocated once and reused for every search. `stamp`
  // carries the id of the search that last touched a cell, which is how the
  // other arrays are known to hold live values without ever being cleared.
  private readonly gScore: Float64Array;
  private readonly fScore: Float64Array;
  private readonly cameFrom: Int32Array;
  private readonly stamp: Int32Array;
  private readonly state: Uint8Array;
  private readonly heap: Int32Array;
  private readonly heapPos: Int32Array;
  private heapSize = 0;
  private searchId = 0;

  // Path reconstruction scratch, also reused.
  private readonly cellPath: Int32Array;
  private readonly rawX: Float64Array;
  private readonly rawY: Float64Array;

  // The shut-door layer. Cells it has set are remembered so clearing it is
  // proportional to the doors, not to the whole grid.
  private readonly dynamicCells: Int32Array;
  private dynamicCount = 0;
  private dynamicSignature = Number.NaN;
  private blockerVersion = 0;

  constructor(
    worldWidth: number,
    worldHeight: number,
    walls: readonly NavRect[],
    options: { cellSizePx?: number; agentRadiusPx?: number } = {}
  ) {
    this.cellSize = options.cellSizePx ?? NAVIGATION.grid.cellSizePx;
    this.agentRadius = options.agentRadiusPx ?? NAVIGATION.grid.agentRadiusPx;
    this.cols = Math.max(1, Math.ceil(worldWidth / this.cellSize));
    this.rows = Math.max(1, Math.ceil(worldHeight / this.cellSize));

    const count = this.cols * this.rows;
    this.flags = new Uint8Array(count);
    this.gScore = new Float64Array(count);
    this.fScore = new Float64Array(count);
    this.cameFrom = new Int32Array(count);
    this.stamp = new Int32Array(count);
    this.state = new Uint8Array(count);
    this.heap = new Int32Array(count);
    this.heapPos = new Int32Array(count);
    this.cellPath = new Int32Array(count);
    this.rawX = new Float64Array(count);
    this.rawY = new Float64Array(count);
    this.dynamicCells = new Int32Array(count);

    this.markWorldEdge(worldWidth, worldHeight);
    for (const wall of walls) {
      this.markRect(wall, BLOCKED_STATIC, false);
    }
  }

  /**
   * Bumps every time the shut-door layer changes. Guards compare it against
   * their own copy so a door closing in front of them forces a fresh search
   * instead of leaving them following a route that no longer exists.
   */
  get version(): number {
    return this.blockerVersion;
  }

  /**
   * Replaces the shut-door layer. The scene already works out which doors are
   * closed each frame for the vision cones, so the same list is handed here.
   * Identical lists are ignored, so this is free on the frames nothing changed,
   * which is nearly all of them.
   */
  setDynamicBlockers(rects: readonly NavRect[]): void {
    const signature = NavGrid.signatureOf(rects);
    if (signature === this.dynamicSignature) {
      return;
    }
    this.dynamicSignature = signature;
    for (let i = 0; i < this.dynamicCount; i += 1) {
      this.flags[this.dynamicCells[i]] &= ~BLOCKED_DYNAMIC;
    }
    this.dynamicCount = 0;
    for (const rect of rects) {
      this.markRect(rect, BLOCKED_DYNAMIC, true);
    }
    this.blockerVersion += 1;
  }

  /** True when a guard's body could not stand at this world point. */
  isBlockedAt(x: number, y: number): boolean {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) {
      return true;
    }
    return this.flags[cy * this.cols + cx] !== 0;
  }

  /** True when a guard could walk the straight line from A to B without a snag. */
  hasClearLine(ax: number, ay: number, bx: number, by: number): boolean {
    const cell = this.cellSize;
    let cx = Math.floor(ax / cell);
    let cy = Math.floor(ay / cell);
    const endX = Math.floor(bx / cell);
    const endY = Math.floor(by / cell);
    if (this.blockedCell(cx, cy) || this.blockedCell(endX, endY)) {
      return false;
    }

    // Amanatides and Woo grid traversal: step from cell to cell along the ray,
    // always crossing whichever boundary comes first. No sampling gaps, and no
    // allocation, so this is cheap enough to run every frame.
    const dx = bx - ax;
    const dy = by - ay;
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const deltaX = stepX === 0 ? Infinity : Math.abs(cell / dx);
    const deltaY = stepY === 0 ? Infinity : Math.abs(cell / dy);
    let nextX =
      stepX === 0
        ? Infinity
        : (stepX > 0 ? (cx + 1) * cell - ax : ax - cx * cell) / Math.abs(dx);
    let nextY =
      stepY === 0
        ? Infinity
        : (stepY > 0 ? (cy + 1) * cell - ay : ay - cy * cell) / Math.abs(dy);

    // Hard bound on the walk, so a degenerate ray can never spin the frame.
    const maxSteps = this.cols + this.rows + 4;
    for (let step = 0; step < maxSteps; step += 1) {
      if (cx === endX && cy === endY) {
        return true;
      }
      if (nextX < nextY - CORNER_EPSILON) {
        nextX += deltaX;
        cx += stepX;
      } else if (nextY < nextX - CORNER_EPSILON) {
        nextY += deltaY;
        cy += stepY;
      } else {
        // The line goes exactly through a cell corner. Both cells touching that
        // corner count, so a guard can never be routed through the diagonal
        // crack between two blocks.
        if (this.blockedCell(cx + stepX, cy) || this.blockedCell(cx, cy + stepY)) {
          return false;
        }
        nextX += deltaX;
        nextY += deltaY;
        cx += stepX;
        cy += stepY;
      }
      if (this.blockedCell(cx, cy)) {
        return false;
      }
    }
    return false;
  }

  /**
   * Finds a walkable route from one world point to another, as a smoothed list
   * of waypoints. Returns null when there is no route at all, so the caller can
   * fall back rather than walk into a wall.
   *
   * A start or goal sitting inside geometry is snapped out to the nearest cell
   * a body fits in, which is what makes a bolt thrown into a wall, or a guard
   * nudged half into one, still produce something sensible. The returned path
   * ends on the true goal when it is standable, and as close to it as the
   * geometry allows when it is not.
   *
   * The array passed as `out` is filled in place and returned, so a caller that
   * keeps one array around never allocates.
   */
  findPath(
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    out: NavPoint[] = []
  ): NavPoint[] | null {
    const startIndex = this.nearestFreeIndex(startX, startY);
    const goalIndex = this.nearestFreeIndex(goalX, goalY);
    if (startIndex < 0 || goalIndex < 0) {
      return null;
    }

    let length = 0;
    if (startIndex !== goalIndex) {
      if (!this.search(startIndex, goalIndex)) {
        return null;
      }
      length = this.reconstruct(startIndex, goalIndex);
      if (length < 0) {
        return null;
      }
    }
    if (length === 0) {
      // Already standing in the goal cell: one waypoint, the destination itself.
      this.rawX[0] = goalX;
      this.rawY[0] = goalY;
      length = 1;
    }
    // Finish on the real destination when a body fits there. When it does not
    // (a noise thrown inside a wall), the last cell centre stands in for it and
    // the guard gets as close as it can.
    if (!this.isBlockedAt(goalX, goalY)) {
      this.rawX[length - 1] = goalX;
      this.rawY[length - 1] = goalY;
    }
    return this.smooth(startX, startY, length, out);
  }

  // ---------------------------------------------------------------- building

  /**
   * Marks the border cells unwalkable. Arcade clamps a guard's body inside the
   * world bounds, so a cell the body could only half occupy is not somewhere a
   * path may send it.
   */
  private markWorldEdge(worldWidth: number, worldHeight: number): void {
    const cell = this.cellSize;
    const pad = this.agentRadius;
    for (let row = 0; row < this.rows; row += 1) {
      const top = row * cell;
      const rowBase = row * this.cols;
      for (let col = 0; col < this.cols; col += 1) {
        const left = col * cell;
        if (
          left < pad ||
          top < pad ||
          left + cell > worldWidth - pad ||
          top + cell > worldHeight - pad
        ) {
          this.flags[rowBase + col] |= BLOCKED_STATIC;
        }
      }
    }
  }

  /**
   * Stamps one rectangle, fattened by the guard's body radius, onto the grid.
   * `record` remembers the cells so the shut-door layer can be lifted again.
   */
  private markRect(rect: NavRect, flag: number, record: boolean): void {
    const cell = this.cellSize;
    const pad = this.agentRadius;
    const first = Math.max(0, Math.floor((rect.x - pad) / cell));
    const last = Math.min(this.cols - 1, Math.ceil((rect.x + rect.width + pad) / cell) - 1);
    const top = Math.max(0, Math.floor((rect.y - pad) / cell));
    const bottom = Math.min(this.rows - 1, Math.ceil((rect.y + rect.height + pad) / cell) - 1);
    for (let row = top; row <= bottom; row += 1) {
      const rowBase = row * this.cols;
      for (let col = first; col <= last; col += 1) {
        const index = rowBase + col;
        if (record && (this.flags[index] & flag) === 0 && this.dynamicCount < this.dynamicCells.length) {
          this.dynamicCells[this.dynamicCount] = index;
          this.dynamicCount += 1;
        }
        this.flags[index] |= flag;
      }
    }
  }

  /** Cheap fingerprint of a rectangle list, to spot "nothing changed" for free. */
  private static signatureOf(rects: readonly NavRect[]): number {
    let signature = rects.length;
    for (const rect of rects) {
      signature = (Math.imul(signature, 31) + rect.x * 7 + rect.y * 13 + rect.width) | 0;
    }
    return signature;
  }

  // ----------------------------------------------------------------- queries

  private blockedCell(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) {
      return true;
    }
    return this.flags[row * this.cols + col] !== 0;
  }

  /**
   * The cell containing this point, or the closest standable cell to it when
   * the point is inside geometry. Returns -1 when nothing walkable is near.
   */
  private nearestFreeIndex(x: number, y: number): number {
    const cell = this.cellSize;
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / cell)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / cell)));
    if (this.flags[row * this.cols + col] === 0) {
      return row * this.cols + col;
    }

    // Ring search outwards. One extra ring is scanned after the first hit,
    // because a cell on the next ring's edge can still be closer than a corner
    // cell on this one.
    let best = -1;
    let bestDistance = Infinity;
    let foundRing = -1;
    const maxRing = NAVIGATION.grid.snapSearchCells;
    for (let ring = 1; ring <= maxRing; ring += 1) {
      if (foundRing >= 0 && ring > foundRing + 1) {
        break;
      }
      for (let ry = row - ring; ry <= row + ring; ry += 1) {
        if (ry < 0 || ry >= this.rows) {
          continue;
        }
        const onEdgeRow = ry === row - ring || ry === row + ring;
        const step = onEdgeRow ? 1 : ring * 2;
        for (let rx = col - ring; rx <= col + ring; rx += step) {
          if (rx < 0 || rx >= this.cols) {
            continue;
          }
          const index = ry * this.cols + rx;
          if (this.flags[index] !== 0) {
            continue;
          }
          const dx = (rx + 0.5) * cell - x;
          const dy = (ry + 0.5) * cell - y;
          const distance = dx * dx + dy * dy;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
            foundRing = ring;
          }
        }
      }
    }
    return best;
  }

  // -------------------------------------------------------------------- A*

  /** Octile distance in cells: admissible for eight-way movement, so A* stays optimal. */
  private heuristic(from: number, to: number): number {
    const fx = from % this.cols;
    const fy = (from - fx) / this.cols;
    const tx = to % this.cols;
    const ty = (to - tx) / this.cols;
    const dx = Math.abs(fx - tx);
    const dy = Math.abs(fy - ty);
    return dx + dy + (DIAGONAL_COST - 2) * Math.min(dx, dy);
  }

  /** Marks a cell as belonging to the current search, with no cost yet. */
  private touch(index: number, id: number): void {
    this.stamp[index] = id;
    this.state[index] = 0;
    this.heapPos[index] = -1;
    this.gScore[index] = Infinity;
  }

  private search(startIndex: number, goalIndex: number): boolean {
    this.searchId += 1;
    const id = this.searchId;
    this.heapSize = 0;

    this.touch(startIndex, id);
    this.gScore[startIndex] = 0;
    this.fScore[startIndex] = this.heuristic(startIndex, goalIndex);
    this.cameFrom[startIndex] = -1;
    this.state[startIndex] = STATE_OPEN;
    this.heapPush(startIndex);

    let expanded = 0;
    while (this.heapSize > 0) {
      const current = this.heapPop();
      if (current === goalIndex) {
        return true;
      }
      this.state[current] = STATE_CLOSED;
      expanded += 1;
      if (expanded > NAVIGATION.grid.maxExpandedCells) {
        return false;
      }

      const col = current % this.cols;
      const row = (current - col) / this.cols;
      const cost = this.gScore[current];
      for (let n = 0; n < NEIGHBOUR_DX.length; n += 1) {
        const nc = col + NEIGHBOUR_DX[n];
        const nr = row + NEIGHBOUR_DY[n];
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) {
          continue;
        }
        const neighbour = nr * this.cols + nc;
        if (this.flags[neighbour] !== 0) {
          continue;
        }
        const diagonal = n >= ORTHOGONAL_COUNT;
        if (
          diagonal &&
          (this.flags[row * this.cols + nc] !== 0 || this.flags[nr * this.cols + col] !== 0)
        ) {
          // No corner cutting. Squeezing diagonally between two blocked cells
          // would clip the guard's body on the corner it just slipped past.
          continue;
        }

        const seen = this.stamp[neighbour] === id;
        if (seen && this.state[neighbour] === STATE_CLOSED) {
          continue;
        }
        const tentative = cost + (diagonal ? DIAGONAL_COST : 1);
        if (!seen) {
          this.touch(neighbour, id);
        } else if (tentative >= this.gScore[neighbour]) {
          continue;
        }
        this.cameFrom[neighbour] = current;
        this.gScore[neighbour] = tentative;
        this.fScore[neighbour] = tentative + this.heuristic(neighbour, goalIndex);
        if (this.state[neighbour] === STATE_OPEN) {
          this.heapSiftUp(this.heapPos[neighbour]);
        } else {
          this.state[neighbour] = STATE_OPEN;
          this.heapPush(neighbour);
        }
      }
    }
    return false;
  }

  /**
   * Walks the came-from chain into rawX/rawY, front to back, skipping the start
   * cell (the guard is already standing in it). Returns how many points were
   * written, or -1 if the chain was somehow broken.
   */
  private reconstruct(startIndex: number, goalIndex: number): number {
    let count = 0;
    let node = goalIndex;
    while (node !== startIndex) {
      if (node < 0 || count >= this.cellPath.length) {
        return -1;
      }
      this.cellPath[count] = node;
      count += 1;
      node = this.cameFrom[node];
    }
    const cell = this.cellSize;
    for (let i = 0; i < count; i += 1) {
      const index = this.cellPath[count - 1 - i];
      const col = index % this.cols;
      const row = (index - col) / this.cols;
      this.rawX[i] = (col + 0.5) * cell;
      this.rawY[i] = (row + 0.5) * cell;
    }
    return count;
  }

  /**
   * String pulling. Walks the cell-by-cell route and keeps only the waypoints a
   * straight walk cannot skip, so a staircase of cells collapses into a couple
   * of clean diagonals. This is what stops a guard visibly stepping sideways
   * every few pixels, which matters for readability, not just for looks.
   */
  private smooth(startX: number, startY: number, length: number, out: NavPoint[]): NavPoint[] {
    let anchorX = startX;
    let anchorY = startY;
    let kept = 0;
    let i = 0;
    while (i < length) {
      let furthest = i;
      while (
        furthest + 1 < length &&
        this.hasClearLine(anchorX, anchorY, this.rawX[furthest + 1], this.rawY[furthest + 1])
      ) {
        furthest += 1;
      }
      anchorX = this.rawX[furthest];
      anchorY = this.rawY[furthest];
      const existing = out[kept];
      if (existing === undefined) {
        out[kept] = { x: anchorX, y: anchorY };
      } else {
        existing.x = anchorX;
        existing.y = anchorY;
      }
      kept += 1;
      i = furthest + 1;
    }
    out.length = kept;
    return out;
  }

  // ------------------------------------------------------------- binary heap

  private heapPush(index: number): void {
    const position = this.heapSize;
    this.heapSize += 1;
    this.heap[position] = index;
    this.heapPos[index] = position;
    this.heapSiftUp(position);
  }

  private heapPop(): number {
    const top = this.heap[0];
    this.heapPos[top] = -1;
    this.heapSize -= 1;
    if (this.heapSize > 0) {
      const moved = this.heap[this.heapSize];
      this.heap[0] = moved;
      this.heapPos[moved] = 0;
      this.heapSiftDown(0);
    }
    return top;
  }

  private heapSiftUp(position: number): void {
    let at = position;
    const node = this.heap[at];
    const cost = this.fScore[node];
    while (at > 0) {
      const parent = (at - 1) >> 1;
      const parentNode = this.heap[parent];
      if (this.fScore[parentNode] <= cost) {
        break;
      }
      this.heap[at] = parentNode;
      this.heapPos[parentNode] = at;
      at = parent;
    }
    this.heap[at] = node;
    this.heapPos[node] = at;
  }

  private heapSiftDown(position: number): void {
    let at = position;
    const node = this.heap[at];
    const cost = this.fScore[node];
    for (;;) {
      const left = at * 2 + 1;
      if (left >= this.heapSize) {
        break;
      }
      const right = left + 1;
      const child =
        right < this.heapSize && this.fScore[this.heap[right]] < this.fScore[this.heap[left]]
          ? right
          : left;
      const childNode = this.heap[child];
      if (this.fScore[childNode] >= cost) {
        break;
      }
      this.heap[at] = childNode;
      this.heapPos[childNode] = at;
      at = child;
    }
    this.heap[at] = node;
    this.heapPos[node] = at;
  }
}
