# Tailgate

You're a red teamer with a letter of authorisation in one pocket and a rogue device in the other. Get into Meridian Business Park, Building C. Plant the device in the server room. Photograph what you can. Get out. Write it up.

Top-down 2D stealth where every mechanic is a real physical pentest trope: tailgating a badged door, the smokers' door on a break cycle, the loading-dock shutter, a distraction throw to pull a guard off patrol, CCTV arcs and a breaker box to kill them. Hitman-style freedom, Metal Gear tension, and an end-of-mission Engagement Report that turns your run, mistakes included, into a one-page pentest write-up.

**Play it:** https://tailgate-three.vercel.app

Full design document: [GAME_DESIGN.md](GAME_DESIGN.md).

## Screenshots

_Placeholder slots, to be filled in. Drop a PNG at each path and swap the italic line for an image tag, e.g. `![Kiosk](docs/screenshots/kiosk.png)`._

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

## Tech stack

- **Phaser 3.90** with **TypeScript** in strict mode, bundled by **Vite**.
- Level built in **Tiled**, exported as JSON. Guard patrols, staff schedules, door timings, camera arcs and lighting all live in data files, not code.
- **Procedural audio**: the whole soundscape is synthesised at runtime with the Web Audio API. There are no sound files in the repo.
- **No backend, no accounts, no analytics, no cookies.** localStorage holds settings and best ratings, nothing else.
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

The game was built in seven phases (skeleton, the space, being watched, doors and people, the job, atmosphere, ship). Each phase was one feature branch, one pull request to `main`, and one deployed Vercel preview, gated on a clean typecheck and lint and an adversarial code review before merge. Mechanics were greyboxed with coloured rectangles until they felt right, then dressed with CC0 art. Everything a designer would want to tune (detection rates, patrol routes, door windows, lighting, camera timings) is data, so the game is balanced by editing config, not rewriting logic.

## Licence and credits

Every third-party asset is CC0 or CC-BY and logged in [CREDITS.md](CREDITS.md), which doubles as an asset SBOM. The audio is procedurally synthesised, so there are no third-party sound files. Art is from [Kenney](https://kenney.nl) (CC0) and the fonts (Saira Condensed, IBM Plex Mono) are under the SIL Open Font License.
