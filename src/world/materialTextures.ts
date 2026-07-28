import {
  CONTACT_SHADOW,
  FLOOR_MATERIALS,
  FLOOR_MATERIAL_FALLBACK,
  ROUTE_MATERIALS,
  ROUTE_MATERIAL_FALLBACK,
  type FloorBlotchSpec,
  type FloorMaterialKind,
  type FloorMaterialSpec,
  type FloorSeamSpec,
} from '../config/materials';

/**
 * The pure half of the Phase 19 material pass: the canvas painting, the seeded
 * randomness and the colour maths. Nothing in here touches Phaser or the
 * display list, which keeps it unit testable and makes it obvious that no
 * randomness leaks into a frame. WorldRenderer owns the Phaser plumbing that
 * turns these painters into textures.
 *
 * Every texture is painted as transparent-plus-grain, never as a solid colour.
 * That means the result is laid OVER the existing Kenney floor tile and simply
 * modulates its luminance, so the venue's colour grading survives and a missing
 * texture degrades to exactly the old flat look.
 */

/** Texture key prefix for the generated floor grains. */
const FLOOR_KEY_PREFIX = 'mat_floor_';

/** The generated gradient strip laid where a wall's south face meets the floor. */
export const WALL_CONTACT_TEXTURE_KEY = 'mat_contact_wall';

/** The generated soft ellipse laid under furniture. */
export const PROP_CONTACT_TEXTURE_KEY = 'mat_contact_prop';

/** Texture key for one material kind. */
export function floorMaterialKey(kind: FloorMaterialKind): string {
  return `${FLOOR_KEY_PREFIX}${kind}`;
}

/** The material a named Tiled zone is built from, with a safe fallback. */
export function zoneMaterialKind(zoneName: string): FloorMaterialKind {
  return FLOOR_MATERIALS[zoneName] ?? FLOOR_MATERIAL_FALLBACK;
}

/** The material for the circulation surface of a venue visual profile. */
export function routeMaterialKind(profileId: string): FloorMaterialKind {
  return ROUTE_MATERIALS[profileId] ?? ROUTE_MATERIAL_FALLBACK;
}

/**
 * Mulberry32, a small deterministic PRNG. The materials must look identical on
 * every boot and must never re-roll per frame, so the generators take one of
 * these seeded from config rather than reaching for Math.random.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mapChannels(colour: number, transform: (channel: number) => number): number {
  const channel = (shift: number): number =>
    Math.min(255, Math.max(0, Math.round(transform((colour >> shift) & 0xff))));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Moves a colour `amount` (0 to 1) of the way towards white. */
export function lightenColour(colour: number, amount: number): number {
  const t = clamp01(amount);
  return mapChannels(colour, (c) => c + (255 - c) * t);
}

/** Moves a colour `amount` (0 to 1) of the way towards black. */
export function darkenColour(colour: number, amount: number): number {
  const t = clamp01(amount);
  return mapChannels(colour, (c) => c * (1 - t));
}

/**
 * Paints one tileable floor grain. Order matters: broad staining first, then
 * the joint grid, then the fine flecks on top, which is how the eye reads a
 * real floor. Everything wraps at the texture edge so zones tile seamlessly.
 */
export function paintFloorMaterial(
  ctx: CanvasRenderingContext2D,
  spec: FloorMaterialSpec
): void {
  const random = createSeededRandom(spec.seed);
  ctx.clearRect(0, 0, spec.size, spec.size);
  if (spec.blotches) {
    paintBlotches(ctx, spec.size, spec.blotches, random);
  }
  if (spec.seam) {
    paintSeams(ctx, spec.size, spec.seam);
  }
  paintGrain(ctx, spec, random);
}

/**
 * Soft stains. Each patch is drawn nine times, once per neighbouring tile
 * offset, so a patch that runs off one edge reappears on the opposite edge and
 * the texture stays seamless.
 */
function paintBlotches(
  ctx: CanvasRenderingContext2D,
  size: number,
  blotches: FloorBlotchSpec,
  random: () => number
): void {
  for (let i = 0; i < blotches.count; i += 1) {
    const cx = random() * size;
    const cy = random() * size;
    const radius =
      blotches.minRadiusPx + random() * (blotches.maxRadiusPx - blotches.minRadiusPx);
    // Half the patches lighten and half darken, so the room's average
    // brightness is unchanged and only its evenness is broken up.
    const tone = random() < 0.5 ? '255,255,255' : '0,0,0';
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        paintSoftDisc(
          ctx,
          cx + ox * size,
          cy + oy * size,
          radius,
          tone,
          blotches.alpha
        );
      }
    }
  }
}

function paintSoftDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  tone: string,
  alpha: number
): void {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, `rgba(${tone},${alpha})`);
  gradient.addColorStop(1, `rgba(${tone},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

/**
 * The joint grid. A line drawn at offset 0 wraps correctly because the tile to
 * its left ends at the last pixel column, so no seam alignment maths is needed
 * here, only in the renderer where the tile position is set.
 */
function paintSeams(
  ctx: CanvasRenderingContext2D,
  size: number,
  seam: FloorSeamSpec
): void {
  for (let offset = 0; offset < size; offset += seam.pitchPx) {
    ctx.fillStyle = `rgba(0,0,0,${seam.alpha})`;
    ctx.fillRect(offset, 0, seam.widthPx, size);
    ctx.fillRect(0, offset, size, seam.widthPx);
    // A single lit pixel on the far side of the joint reads as the edge of the
    // next slab catching light. Without it the joint is just a drawn line.
    ctx.fillStyle = `rgba(255,255,255,${seam.highlightAlpha})`;
    ctx.fillRect(offset + seam.widthPx, 0, 1, size);
    ctx.fillRect(0, offset + seam.widthPx, size, 1);
  }
}

/**
 * The fine flecks. Positions are clamped so a fleck never clips the texture
 * edge, which would show as a hard line once the texture tiles.
 */
function paintGrain(
  ctx: CanvasRenderingContext2D,
  spec: FloorMaterialSpec,
  random: () => number
): void {
  const cells = Math.floor((spec.size * spec.size) / (spec.grainDotPx * spec.grainDotPx));
  const flecks = Math.round(cells * spec.grainDensity);
  const maxOrigin = spec.size - spec.grainDotPx;
  for (let i = 0; i < flecks; i += 1) {
    const x = Math.round(random() * maxOrigin);
    const y = Math.round(random() * maxOrigin);
    ctx.fillStyle =
      random() < 0.5
        ? `rgba(255,255,255,${spec.grainLightAlpha})`
        : `rgba(0,0,0,${spec.grainDarkAlpha})`;
    ctx.fillRect(x, y, spec.grainDotPx, spec.grainDotPx);
  }
}

/**
 * The wall contact strip: opaque white at the top, fading to nothing. It is
 * stretched across a wall's base and tinted with the venue's shadow colour, so
 * the alpha ramp is the only information the texture carries.
 */
export function paintWallContactGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  // The knee keeps the darkest part hugging the wall rather than smearing a
  // uniform grey band across the floor.
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** The soft ellipse under furniture, same brush idea as the character shadows. */
export function paintPropContactGradient(
  ctx: CanvasRenderingContext2D,
  size: number
): void {
  ctx.clearRect(0, 0, size, size);
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
}

/**
 * The prop shadow's on-screen size for a given sprite footprint. Kept here so
 * the clamping rule lives with the rest of the material maths rather than
 * buried in the renderer.
 */
export function propContactShadowSize(
  displayWidth: number,
  displayHeight: number
): { width: number; height: number } {
  const { widthFactor, heightFactor, minSizePx } = CONTACT_SHADOW.prop;
  return {
    width: Math.max(minSizePx, displayWidth * widthFactor),
    height: Math.max(minSizePx, displayHeight * heightFactor),
  };
}
