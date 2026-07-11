# Tailgate

You're a red teamer with a letter of authorisation in one pocket and a rogue device in the other. Three contracts, three sites: Meridian Business Park's Building C, the Halvorsen data centre, and the Trent Valley warehouse. Get in, plant the device, photograph what you can, get out. Write it up.

Top-down 2D stealth where every mechanic is a real physical pentest trope: tailgating a badged door, the smokers' door on a break cycle, the loading-dock shutter, a distraction throw to pull a guard off patrol, CCTV arcs and a breaker box to kill them, a security office console to hijack a camera feed, a hi-vis vest to walk restricted corridors like you belong. Hitman-style freedom, Metal Gear tension, and an end-of-mission Engagement Report for every site that turns your run, mistakes included, into a one-page pentest write-up.

The three contracts unlock in sequence: clear one at any rating and the consultancy countersigns the next. Your best rating and time for each contract are saved between sessions.

**Play it:** https://tailgate-three.vercel.app

Full design document: [GAME_DESIGN.md](GAME_DESIGN.md).

## Screenshots

_Placeholder slots, to be filled in. Drop a PNG at each path and swap the italic line for an image tag, e.g. `![Kiosk](docs/screenshots/kiosk.png)`._ These slots were captured against the Building C contract during v1; the game now also covers the data centre and the warehouse, so treat the shots below as a taster rather than full coverage.

- **Sign-in kiosk** (the main menu): _add `docs/screenshots/kiosk.png`_
- **Building C** (a way in): _add `docs/screenshots/building.png`_
- **Caught** (a guard on alert): _add `docs/screenshots/alert.png`_
- **Engagement Report** (the write-up): _add `docs/screenshots/report.png`_

## Controls

An Xbox-style gamepad is the primary control, the keyboard is a full fallback, and every menu works on either.

### Gamepad

| Control | Action |
| --- | --- |
| Left stick | Move, and set pace by how far you push |
| A | Interact, hold to plant or photograph |
| Right stick / R2 | Aim / throw a bolt |
| Start | Pause |
| D-pad or stick, A, B | Navigate menus, select, back |

### Keyboard and mouse

| Control | Action |
| --- | --- |
| WASD or arrows | Move |
| Shift / C | Creep / run |
| E | Interact, hold to plant or photograph |
| Mouse aim, left click | Aim / throw a bolt |
| Esc | Pause |
| Arrows, Enter, Esc | Navigate menus, select, back |

Accessibility settings (volume, HUD text size, screen-shake off, brightness floor, and an assist mode that slows guards with no score penalty) live on the kiosk and the pause badge, and persist between sessions.

## The campaign

Three contracts, unlocked in order:

1. **Building C** at Meridian Business Park, the original job.
2. **The Halvorsen data centre**, dark and server-lit, CCTV-heavy across several camera circuits, with the breaker taking only one of them.
3. **The Trent Valley warehouse**, open floor with racking for cover, heavy staff traffic, and zones where a disguise won't save you.

Clear a contract at any rating and the next one is countersigned on the consultancy's engagement schedule, a contract-select screen styled like a real scheduling sheet. Your best rating and time for each contract are kept in localStorage alongside your settings, so you can come back and try to beat your own run.

## Field kit

Two tools sit alongside the classic tailgating, distraction and breaker tricks:

- **CCTV multiplexer.** Reach the security office console and you can view every camera feed and spend a limited charge to loop one camera blind for 18 seconds. It locks out once the site alert rises far enough, and any hijack you pull off gets a mention in the Engagement Report.
- **Hi-vis disguise.** Wear it and guards at a distance are slower to get suspicious of you. It buys nothing up close, does nothing in restricted zones or once the site alert is up, and it burns for the rest of the run the moment a guard goes to full alert while you are wearing it.

## Tech stack

- **Phaser 3.90** with **TypeScript** in strict mode, bundled by **Vite**.
- Three levels built in **Tiled**, exported as JSON, driven by a level registry so the same scene code runs every contract. Guard patrols, staff schedules, door timings, camera arcs, lighting and hi-vis restricted zones all live in data files, not code.
- **Procedural audio**: the whole soundscape is synthesised at runtime with the Web Audio API. There are no sound files in the repo.
- **No backend, no accounts, no analytics, no cookies.** localStorage holds settings and per-contract progress (unlocks, best ratings and times, and which briefings and first-run hints you have seen), nothing else.
- Deployed on **Vercel**. **GitHub Actions** runs typecheck, lint and a gitleaks secret scan on every pull request.

## Development

```
npm install
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # TypeScript, no emit
npm run lint       # ESLint
```

## How it was built

Tailgate is a portfolio piece built with a deliberately disciplined AI-assisted workflow. Craig owns the design, architecture and every decision. Claude Code writes the code.

v1 shipped in seven phases (skeleton, the space, being watched, doors and people, the job, atmosphere, ship). v2 added six more on top: multi-level foundation, camera hijack, hi-vis disguise, an art pass, the data centre, and the warehouse, finishing with a campaign ship phase to balance all three contracts together. Each phase was one feature branch, one pull request to `main`, and one deployed Vercel preview, gated on a clean typecheck and lint, with adversarial multi-agent code reviews on the later phases. Mechanics were greyboxed with coloured rectangles until they felt right, then dressed with CC0 art following a written checklist so the new levels match the original. Everything a designer would want to tune (detection rates, patrol routes, door windows, lighting, camera timings, hi-vis perception ranges) is data, so the game is balanced by editing config, not rewriting logic.

## Licence and credits

Every third-party asset is CC0 or CC-BY and logged in [CREDITS.md](CREDITS.md), which doubles as an asset SBOM. The audio is procedurally synthesised, so there are no third-party sound files. Art is from [Kenney](https://kenney.nl) (CC0) and the fonts (Saira Condensed, IBM Plex Mono) are under the SIL Open Font License.
