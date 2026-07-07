import Phaser from 'phaser';
import { ART } from '../config/art';
import { HIJACK } from '../config/hijack';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import type { FeedInfo } from '../systems/CameraSystem';
import { MenuController } from '../ui/MenuController';
import type { BuildingScene } from './BuildingScene';

/** The feed viewport, shared with BuildingScene's secondary camera. */
const FEED = HIJACK.feed;

/** Texture key for the generated CCTV grain, built once at first use. */
const NOISE_KEY = 'cctvNoise';
const NOISE_SIZE = 64;

/**
 * The CCTV multiplexer, launched over a still-running BuildingScene when the
 * player uses the security office console. This scene draws only the chrome:
 * the live picture inside the bezel is the building scene itself, rendered
 * through a second camera scrolled to whichever CCTV is selected. Cycle feeds
 * with left and right, loop the selected feed to freeze its detection, and
 * exit with B or Escape. Fully pad-navigable like every meta screen.
 */
export class HijackScene extends Phaser.Scene {
  private building!: BuildingScene;
  private menu!: MenuController;
  private feeds: FeedInfo[] = [];
  private feedIndex = 0;
  private feedLabel!: Phaser.GameObjects.Text;
  private feedStatus!: Phaser.GameObjects.Text;
  private chargesText!: Phaser.GameObjects.Text;
  private statusLine!: Phaser.GameObjects.Text;
  private grain!: Phaser.GameObjects.TileSprite;
  /** Scene-clock ts of the next grain pattern jump. */
  private nextGrainStepAt = 0;

  constructor() {
    super('hijack');
  }

  create(): void {
    this.building = this.scene.get('building') as BuildingScene;
    this.feeds = this.building.hijackFeeds().feeds;
    this.feedIndex = 0;

    this.drawChrome();
    this.drawCctvTreatment();

    this.feedLabel = this.add.text(FEED.x, FEED.y + FEED.height + 10, '', {
      fontFamily: FONTS.mono,
      fontSize: '12px',
      color: PALETTE.amber,
    });
    this.feedStatus = this.add
      .text(FEED.x + FEED.width, FEED.y + FEED.height + 10, '', {
        fontFamily: FONTS.mono,
        fontSize: '12px',
        color: PALETTE.text,
      })
      .setOrigin(1, 0);
    this.chargesText = this.add
      .text(480, 452, '', { fontFamily: FONTS.mono, fontSize: '12px', color: PALETTE.text })
      .setOrigin(0.5);
    this.statusLine = this.add
      .text(480, 524, '', { fontFamily: FONTS.mono, fontSize: '11px', color: PALETTE.text })
      .setOrigin(0.5);

    this.menu = new MenuController(
      this,
      [
        {
          kind: 'value',
          label: 'FEED',
          repeatable: false,
          getDisplay: () => this.feedDisplay(),
          adjust: (dir) => this.cycleFeed(dir),
        },
        { kind: 'action', label: 'LOOP THIS FEED', onSelect: () => this.loopFeed() },
      ],
      { x: 480, top: 472, rowHeight: 26, width: 440, labelSize: 14, valueSize: 14 },
      { onBack: () => this.building.hijackClose() }
    );

    if (this.feeds.length > 0) {
      this.building.hijackShowFeed(this.feeds[this.feedIndex].id);
    }

    // A blinking REC pip in the bezel corner: the feed is being watched.
    const rec = this.add.circle(FEED.x + FEED.width - 14, FEED.y + 14, 4, PALETTE_HEX.amber);
    this.tweens.add({ targets: rec, alpha: 0.15, duration: 650, yoyo: true, repeat: -1 });
  }

  update(time: number): void {
    const plugin = this.input.gamepad;
    const pad = plugin && plugin.total > 0 ? plugin.getPad(0) : undefined;
    this.menu.update(pad);

    // The grain pattern jumps a few times a second, deliberately not every
    // frame: analogue shimmer without a strobing flicker.
    if (time >= this.nextGrainStepAt) {
      this.nextGrainStepAt = time + ART.cctv.grainStepMs;
      this.grain.setTilePosition(Math.random() * NOISE_SIZE, Math.random() * NOISE_SIZE);
    }

    // Live readouts: loop and re-sync timers tick down while the world runs.
    const info = this.building.hijackFeeds();
    this.feeds = info.feeds;
    const feed = this.feeds[this.feedIndex];
    this.feedLabel.setText(feed ? `CAM ${pad2(this.feedIndex + 1)} / ${feed.id}` : 'NO SIGNAL');
    this.feedStatus.setText(feed ? feedStatusText(feed) : '');
    this.feedStatus.setColor(feed && feed.frozenRemainingMs > 0 ? PALETTE.amber : PALETTE.text);
    this.chargesText.setText(`LOOP CHARGES REMAINING: ${info.chargesRemaining}`);
  }

  private feedDisplay(): string {
    if (this.feeds.length === 0) {
      return 'NO SIGNAL';
    }
    return `${this.feedIndex + 1}/${this.feeds.length}`;
  }

  private cycleFeed(dir: -1 | 1): void {
    if (this.feeds.length === 0) {
      return;
    }
    this.feedIndex = (this.feedIndex + dir + this.feeds.length) % this.feeds.length;
    this.building.hijackShowFeed(this.feeds[this.feedIndex].id);
    this.statusLine.setText('');
  }

  private loopFeed(): void {
    const feed = this.feeds[this.feedIndex];
    if (!feed) {
      return;
    }
    const result = this.building.hijackFreeze(feed.id);
    const line =
      result === 'frozen'
        ? `FEED LOOPED: ${feed.id} IS BLIND FOR ${Math.round(HIJACK.freezeDurationMs / 1000)}s`
        : result === 'no-charges'
          ? 'NO LOOP CHARGES REMAINING'
          : result === 'offline'
            ? 'CAMERA OFFLINE: NOTHING TO LOOP'
            : 'FEED RE-SYNCING: TRY AGAIN LATER';
    this.statusLine.setText(line);
  }

  /** The dark terminal chrome with a hole where the live feed shows through. */
  private drawChrome(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const alpha = 0.94;
    // Four slabs around the feed cut-out; the building renders through the gap.
    this.add.rectangle(w / 2, FEED.y / 2, w, FEED.y, PALETTE_HEX.base, alpha);
    const bottomY = FEED.y + FEED.height;
    this.add.rectangle(w / 2, (h + bottomY) / 2, w, h - bottomY, PALETTE_HEX.base, alpha);
    this.add.rectangle(FEED.x / 2, FEED.y + FEED.height / 2, FEED.x, FEED.height, PALETTE_HEX.base, alpha);
    const rightX = FEED.x + FEED.width;
    this.add.rectangle((w + rightX) / 2, FEED.y + FEED.height / 2, w - rightX, FEED.height, PALETTE_HEX.base, alpha);

    // Bezel, header and the terminal strapline.
    this.add
      .rectangle(FEED.x + FEED.width / 2, FEED.y + FEED.height / 2, FEED.width, FEED.height)
      .setStrokeStyle(2, PALETTE_HEX.amber, 0.9);
    this.add
      .text(480, 44, 'CCTV MULTIPLEXER', {
        fontFamily: FONTS.display,
        fontSize: '30px',
        color: PALETTE.amber,
      })
      .setOrigin(0.5);
    this.add
      .text(480, 78, 'SECURITY OFFICE TERMINAL / AUTHORISED OPERATORS ONLY', {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: PALETTE.text,
      })
      .setOrigin(0.5);
    this.add
      .text(480, 508, 'LEFT/RIGHT CYCLE FEED   A/ENTER SELECT   B/ESC EXIT', {
        fontFamily: FONTS.mono,
        fontSize: '10px',
        color: PALETTE.text,
      })
      .setOrigin(0.5);
  }

  /**
   * The closed-circuit look over the live picture: grain, scanlines, an amber
   * monitor cast, darkened edges and a slow CRT roll bar. All generated, all
   * inside the bezel, and every motion in it is small and slow on purpose.
   */
  private drawCctvTreatment(): void {
    const cctv = ART.cctv;
    const cx = FEED.x + FEED.width / 2;
    const cy = FEED.y + FEED.height / 2;

    // The amber monitor cast: the feed reads as a tube, not a window.
    this.add.rectangle(cx, cy, FEED.width, FEED.height, PALETTE_HEX.amber, cctv.amberCastAlpha);

    // Static grain from the generated noise texture.
    HijackScene.ensureNoise(this);
    this.grain = this.add
      .tileSprite(cx, cy, FEED.width, FEED.height, NOISE_KEY)
      .setAlpha(cctv.grainAlpha);

    // Scanlines: one thin dark line every few pixels.
    const lines = this.add.graphics();
    lines.fillStyle(PALETTE_HEX.base, cctv.scanlineAlpha);
    for (let y = FEED.y; y < FEED.y + FEED.height; y += cctv.scanlineGapPx) {
      lines.fillRect(FEED.x, y, FEED.width, 1);
    }

    // Darkened edges, like a worn tube.
    const v = cctv.vignetteAlpha;
    const edge = cctv.vignettePx;
    this.add.rectangle(cx, FEED.y + edge / 2, FEED.width, edge, PALETTE_HEX.base, v);
    this.add.rectangle(cx, FEED.y + FEED.height - edge / 2, FEED.width, edge, PALETTE_HEX.base, v);
    this.add.rectangle(FEED.x + edge / 2, cy, edge, FEED.height, PALETTE_HEX.base, v);
    this.add.rectangle(FEED.x + FEED.width - edge / 2, cy, edge, FEED.height, PALETTE_HEX.base, v);

    // The roll bar: one soft band crawling down the tube on a loop.
    const bar = this.add.rectangle(
      cx,
      FEED.y + cctv.rollBarPx / 2,
      FEED.width,
      cctv.rollBarPx,
      PALETTE_HEX.text,
      cctv.rollBarAlpha
    );
    this.tweens.add({
      targets: bar,
      y: FEED.y + FEED.height - cctv.rollBarPx / 2,
      duration: cctv.rollDurationMs,
      repeat: -1,
    });
  }

  /** Builds the grain texture once: random grey static, tiled over the feed. */
  private static ensureNoise(scene: Phaser.Scene): void {
    if (scene.textures.exists(NOISE_KEY)) {
      return;
    }
    const tex = scene.textures.createCanvas(NOISE_KEY, NOISE_SIZE, NOISE_SIZE);
    if (!tex) {
      return;
    }
    const ctx = tex.getContext();
    const image = ctx.createImageData(NOISE_SIZE, NOISE_SIZE);
    for (let i = 0; i < image.data.length; i += 4) {
      const shade = Math.floor(Math.random() * 255);
      image.data[i] = shade;
      image.data[i + 1] = shade;
      image.data[i + 2] = shade;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    tex.refresh();
  }
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** The status readout beside the feed label, matching the camera's truth. */
function feedStatusText(feed: FeedInfo): string {
  if (!feed.alive) {
    return 'OFFLINE';
  }
  if (feed.frozenRemainingMs > 0) {
    return `LOOPED ${Math.ceil(feed.frozenRemainingMs / 1000)}s`;
  }
  if (feed.cooldownRemainingMs > 0) {
    return `RE-SYNC ${Math.ceil(feed.cooldownRemainingMs / 1000)}s`;
  }
  return 'LIVE';
}
