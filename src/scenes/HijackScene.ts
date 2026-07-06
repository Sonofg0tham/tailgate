import Phaser from 'phaser';
import { HIJACK } from '../config/hijack';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import type { FeedInfo } from '../systems/CameraSystem';
import { MenuController } from '../ui/MenuController';
import type { BuildingScene } from './BuildingScene';

/** The feed viewport, shared with BuildingScene's secondary camera. */
const FEED = HIJACK.feed;

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

  constructor() {
    super('hijack');
  }

  create(): void {
    this.building = this.scene.get('building') as BuildingScene;
    this.feeds = this.building.hijackFeeds().feeds;
    this.feedIndex = 0;

    this.drawChrome();

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

  update(): void {
    const plugin = this.input.gamepad;
    const pad = plugin && plugin.total > 0 ? plugin.getPad(0) : undefined;
    this.menu.update(pad);

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
