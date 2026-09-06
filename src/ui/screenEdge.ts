/**
 * Where an off-screen world point should be marked on the screen's border.
 * Pure maths shared by the guard chevrons and the objective marker, so the
 * two never disagree about where "that way" is.
 */
export interface EdgePoint {
  /** Screen position of the marker, on the inset border. */
  x: number;
  y: number;
  /** Direction from the screen centre to the target, radians. */
  angle: number;
  /** True when the target itself is inside the viewport (no marker needed). */
  onScreen: boolean;
}

/** How far in from each screen edge the markers stop. */
export interface EdgeInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Clamps the ray from the screen centre to (sx, sy) onto the border, inset
 * per side so markers stay clear of the HUD chips at the top and the prompt
 * at the bottom. A point already on screen returns itself with onScreen true.
 */
export function projectToScreenEdge(
  sx: number,
  sy: number,
  width: number,
  height: number,
  insets: number | EdgeInsets
): EdgePoint {
  const box: EdgeInsets =
    typeof insets === 'number'
      ? { left: insets, right: insets, top: insets, bottom: insets }
      : insets;
  const onScreen = sx >= 0 && sx <= width && sy >= 0 && sy <= height;
  const cx = width / 2;
  const cy = height / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  // How far the ray may travel from the centre before it meets the inset
  // border on the side it is heading for.
  const limitX = dx >= 0 ? width - box.right - cx : cx - box.left;
  const limitY = dy >= 0 ? height - box.bottom - cy : cy - box.top;
  const scale = Math.min(
    limitX / Math.max(Math.abs(dx), 0.001),
    limitY / Math.max(Math.abs(dy), 0.001),
    1
  );
  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
    angle: Math.atan2(dy, dx),
    onScreen,
  };
}
