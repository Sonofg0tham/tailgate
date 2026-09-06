import Phaser from 'phaser';
import { AWARENESS } from '../config/awareness';
import { BARKS, type BarkEvent } from '../config/barks';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import type { Guard, GuardState } from '../entities/Guard';
import { pickBark } from './barkPicker';

/** Everything drawn for one guard, kept between frames. */
interface GuardVisuals {
  glyph: Phaser.GameObjects.Text;
  glyphState: GuardState;
  bark: Phaser.GameObjects.Text;
  barkShownAt: number;
  barkBaseY: number;
  lastBarkAt: number;
  lastBarkLine: string | null;
}

/**
 * What each guard is thinking, drawn over their head (Phase 21). The cones
 * already say where a guard is looking; this says what they make of it:
 *
 *  - a thin arc that fills as suspicion rises, so a near miss is visible as
 *    a near miss instead of nothing happening until the guard turns red,
 *  - a "?" while curious and a "!" once alert, the classic stealth glyphs,
 *    each popping once and then holding still,
 *  - a short bark line at each state change, picked from config/barks.ts,
 *  - a slowly turning dashed ring at the spot a searching guard is heading
 *    for, so the player knows where the guard thinks they are,
 *  - while an alert guard can see the player, a ring around the "!" that
 *    fills over the radio delay: break line of sight before it closes and
 *    the building never hears about it.
 *
 * Presentation only. Every input is read off the Guard; nothing here writes
 * back. Colour is never the only signal: "?" and "!" are different shapes,
 * the arc and the radio ring are different shapes, and the marker is dashed.
 */
export class GuardAwareness {
  private readonly scene: Phaser.Scene;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly visuals = new Map<Guard, GuardVisuals>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Above the player (40) and the aim reticle (45) is too busy; 44 keeps
    // the arcs over every actor but under the throw trace.
    this.gfx = scene.add.graphics().setDepth(44);
  }

  /**
   * Speaks a line above the guard. Alert and radio barks always land; the
   * quieter ones respect a per-guard cooldown so a twitchy guard does not
   * chatter. Barks out of the player's earshot are skipped entirely.
   */
  bark(guard: Guard, event: BarkEvent, now: number, playerX: number, playerY: number): void {
    const { cooldownMs, rangePx } = AWARENESS.bark;
    if (Phaser.Math.Distance.Between(guard.x, guard.y, playerX, playerY) > rangePx) {
      return;
    }
    const v = this.ensure(guard);
    const urgent = event === 'alert' || event === 'radio';
    if (!urgent && now - v.lastBarkAt < cooldownMs) {
      return;
    }
    const line = pickBark(BARKS[event], v.lastBarkLine);
    if (line === null) {
      return;
    }
    v.lastBarkLine = line;
    v.lastBarkAt = now;
    v.barkShownAt = now;
    v.bark.setText(line).setAlpha(1);
  }

  /**
   * Redraws every guard's readout for this frame. `radioProgress` answers
   * 0..1 for a guard whose radio clock is running, or -1 for no ring.
   */
  update(
    now: number,
    guards: readonly Guard[],
    radioProgress: (guard: Guard) => number
  ): void {
    this.gfx.clear();
    for (const guard of guards) {
      const v = this.ensure(guard);
      this.updateGlyph(guard, v);
      this.updateBark(now, guard, v);
      this.drawArc(guard);
      this.drawLastSeen(now, guard);
      this.drawRadioRing(guard, radioProgress(guard));
    }
  }

  private ensure(guard: Guard): GuardVisuals {
    let v = this.visuals.get(guard);
    if (v) {
      return v;
    }
    const glyph = this.scene.add
      .text(guard.x, guard.y, '', {
        fontFamily: FONTS.display,
        fontSize: `${AWARENESS.glyph.fontSizePx}px`,
        color: PALETTE.amber,
        stroke: PALETTE.base,
        strokeThickness: AWARENESS.glyph.strokePx,
      })
      .setOrigin(0.5)
      .setDepth(46)
      .setVisible(false);
    const bark = this.scene.add
      .text(guard.x, guard.y, '', {
        fontFamily: FONTS.mono,
        fontSize: `${AWARENESS.bark.fontSizePx}px`,
        color: PALETTE.text,
        stroke: PALETTE.base,
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(46)
      .setAlpha(0);
    v = {
      glyph,
      glyphState: 'patrol',
      bark,
      barkShownAt: 0,
      barkBaseY: 0,
      lastBarkAt: Number.NEGATIVE_INFINITY,
      lastBarkLine: null,
    };
    this.visuals.set(guard, v);
    return v;
  }

  /** The "?" or "!" over the guard, popping once when the state changes. */
  private updateGlyph(guard: Guard, v: GuardVisuals): void {
    const state = guard.state;
    v.glyph.setPosition(guard.x, guard.y - AWARENESS.glyph.risePx);
    if (state === v.glyphState) {
      return;
    }
    v.glyphState = state;
    if (state === 'patrol') {
      v.glyph.setVisible(false);
      return;
    }
    const alert = state === 'alert';
    v.glyph
      .setText(alert ? '!' : '?')
      .setColor(alert ? PALETTE.alarm : PALETTE.amber)
      .setVisible(true)
      .setScale(AWARENESS.glyph.popFromScale);
    this.scene.tweens.killTweensOf(v.glyph);
    this.scene.tweens.add({
      targets: v.glyph,
      scale: 1,
      duration: AWARENESS.glyph.popMs,
      ease: 'Back.easeOut',
    });
  }

  /** Holds a bark, then fades it while it drifts up a touch. */
  private updateBark(now: number, guard: Guard, v: GuardVisuals): void {
    if (v.bark.alpha <= 0) {
      return;
    }
    const { holdMs, fadeMs, driftPx, risePx } = AWARENESS.bark;
    const elapsed = now - v.barkShownAt;
    let alpha = 1;
    let drift = 0;
    if (elapsed > holdMs) {
      const t = Phaser.Math.Clamp((elapsed - holdMs) / fadeMs, 0, 1);
      alpha = 1 - t;
      drift = driftPx * t;
    }
    v.bark.setPosition(guard.x, guard.y - risePx - drift).setAlpha(alpha);
  }

  /** The suspicion arc: a 270 degree track with an amber fill rising through it. */
  private drawArc(guard: Guard): void {
    const { risePx, radiusPx, thicknessPx, showAbovePct, trackAlpha, fillAlpha } = AWARENESS.arc;
    if (guard.state === 'alert' || guard.suspicion < showAbovePct) {
      return;
    }
    const cx = guard.x;
    const cy = guard.y - risePx;
    const start = Phaser.Math.DegToRad(135);
    const sweep = Phaser.Math.DegToRad(270);
    this.gfx.lineStyle(thicknessPx, PALETTE_HEX.text, trackAlpha);
    this.gfx.beginPath();
    this.gfx.arc(cx, cy, radiusPx, start, start + sweep, false);
    this.gfx.strokePath();
    const fill = Phaser.Math.Clamp(guard.suspicion / 100, 0, 1);
    this.gfx.lineStyle(thicknessPx, PALETTE_HEX.amber, fillAlpha);
    this.gfx.beginPath();
    this.gfx.arc(cx, cy, radiusPx, start, start + sweep * fill, false);
    this.gfx.strokePath();
  }

  /** The dashed ring at the spot a searching guard is making for. */
  private drawLastSeen(now: number, guard: Guard): void {
    if (guard.state === 'patrol' || guard.canSeePlayer || guard.isLookingAround) {
      return;
    }
    const { radiusPx, thicknessPx, alpha, dashCount, spinMs, hideWithinPx } = AWARENESS.lastSeen;
    const tx = guard.lastSeenX;
    const ty = guard.lastSeenY;
    if (Phaser.Math.Distance.Between(guard.x, guard.y, tx, ty) <= hideWithinPx) {
      return;
    }
    const spin = ((now % spinMs) / spinMs) * Math.PI * 2;
    const step = (Math.PI * 2) / dashCount;
    this.gfx.lineStyle(thicknessPx, PALETTE_HEX.amber, alpha);
    for (let i = 0; i < dashCount; i += 1) {
      const from = spin + i * step;
      this.gfx.beginPath();
      this.gfx.arc(tx, ty, radiusPx, from, from + step * 0.5, false);
      this.gfx.strokePath();
    }
  }

  /** The radio countdown around the "!": red because it means trouble. */
  private drawRadioRing(guard: Guard, progress: number): void {
    if (progress < 0) {
      return;
    }
    const { radiusPx, thicknessPx, trackAlpha, fillAlpha } = AWARENESS.radio;
    const cx = guard.x;
    const cy = guard.y - AWARENESS.glyph.risePx;
    this.gfx.lineStyle(thicknessPx, PALETTE_HEX.text, trackAlpha);
    this.gfx.strokeCircle(cx, cy, radiusPx);
    const from = -Math.PI / 2;
    this.gfx.lineStyle(thicknessPx, PALETTE_HEX.alarm, fillAlpha);
    this.gfx.beginPath();
    this.gfx.arc(cx, cy, radiusPx, from, from + Math.PI * 2 * Phaser.Math.Clamp(progress, 0, 1), false);
    this.gfx.strokePath();
  }
}
