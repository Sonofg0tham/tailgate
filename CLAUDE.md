# CLAUDE.md - Tailgate

## What this project is

Tailgate is a top-down 2D stealth game about physical penetration testing. The player is a red teamer with a letter of authorisation and a rogue device, breaking into an office building. One dense level, multiple ways in, Hitman-style freedom with Metal Gear tension.

This is a portfolio piece for Craig McCart (Sonofg0tham). It ships publicly on Vercel with the repo on GitHub, so code quality and licence hygiene matter as much as the game.

The full design lives in GAME_DESIGN.md. Read it before any feature work. If this file and GAME_DESIGN.md ever disagree, ask Craig which wins.

## Who you're working with

Craig is a security professional and vibe coder. He owns design, architecture direction and all decisions. You write all the code. Assume he will not read diffs to understand a change.

- Explain every change in plain English: what was built, why, how to test it by playing.
- When a decision is needed, give one recommendation and one alternative, with a plain reason for each. Not a menu.
- Craig is learning pull requests. Whenever a PR is involved, explain what it is, what to click, and what merging will do, as if it's the first time.
- Craig has dyspraxia and nystagmus. This shapes the game too, see Accessibility in GAME_DESIGN.md. It also means: keep instructions step by step, one thing at a time.
- UK English everywhere: code comments, UI copy, docs, commit messages.
- No em-dashes anywhere in this project. Use a comma, hyphen, or full stop.

## Stack

- Phaser 3 + TypeScript (strict mode) + Vite
- Level maps built in Tiled, exported as JSON
- Hosting: Vercel. Version control: GitHub.
- No backend, no accounts, no analytics, no cookies in v1. localStorage for settings and best ratings only.
- Node LTS, npm. No exotic tooling.

## Commands

Define these in Phase 0 and keep them working forever:

- `npm run dev` - local dev server
- `npm run build` - production build
- `npm run typecheck` - tsc, no emit
- `npm run lint` - ESLint

A phase is not done if typecheck or lint fails.

## Visual identity (never default)

Two decisions that are already made. Do not fall back to Tailwind blue or a generic font under any circumstances.

- Palette: base near-black `#0E1116`, primary accent "clearance amber" `#FFB000`, UI text cool grey `#C7CDD4`. Alarm red `#FF3B30` is reserved exclusively for detection and alarm states. If red appears, the player is in trouble. Nowhere else.
- Display font: Saira Condensed (menus, headings). Monospace: IBM Plex Mono (HUD readouts, the Engagement Report). Load via web fonts in Phase 0.
- Signature detail: all meta UI is styled as corporate access-control artefacts. Main menu is a visitor sign-in kiosk. Pause screen is a lanyard badge. End screen is a one-page pentest engagement report.
- Any new UI element uses this system. If unsure how, ask, do not improvise a default.

## How to work

1. Build one phase at a time, in the order set in GAME_DESIGN.md. Never start a later phase early, even partially.
2. One feature branch per phase, named like `phase-2-guard-ai`. Open a PR to main when the phase's "done when" list is satisfied. The PR description explains in plain English what was built, how to playtest it, and any trade-offs made.
3. Every phase ends with: typecheck and lint clean, the "done when" list met, and a deployed preview Craig can click.
4. Data-driven everything. Guard patrol routes, camera arcs, door permissions, staff schedules and level layout live in JSON or Tiled data, never hardcoded in scene logic. Craig tunes the game by editing data, not code.
5. Greybox first. Coloured rectangles and debug overlays until a mechanic feels right, then swap in real assets.
6. Small commits, conventional commit messages (`feat:`, `fix:`, `chore:`).
7. If Craig asks for something on the v2 parking lot in GAME_DESIGN.md mid-build, remind him it's parked and get explicit confirmation before building it.

## Asset and licence rules (non-negotiable)

- Only CC0 or CC-BY licensed assets. Nothing marked "free for personal use" or "non-commercial".
- Every asset added to the repo gets a line in CREDITS.md in the same commit: filename, source URL, author, licence. Treat CREDITS.md as an SBOM for assets. An asset with no CREDITS.md entry is a bug.
- Approved sources: Kenney.nl (art, CC0), Sonniss GDC audio bundles (SFX), OpenGameArt (check each licence), Kevin MacLeod (music, CC-BY, credit required).
- No paid APIs, no external services, no CDN-hosted game code.

## Security hygiene

- No secrets in the repo, ever. `.env` is gitignored from Phase 0 even though v1 needs no secrets.
- When adding a dependency, prefer well-known maintained packages, state why it's needed, and flag any npm audit findings in the PR.
- Phase 6 adds CI: typecheck, lint and a gitleaks scan on every PR. Craig cannot write YAML, so any workflow file gets a plain-English walkthrough in the PR description.

## Out of scope for v1

Do not build any of these without Craig explicitly confirming, even if a request drifts near them: combat or takedowns, multiple levels, procedural generation, multiplayer, mobile or gamepad controls, cutscenes, dialogue systems, accounts or cloud saves. The full parking lot is in GAME_DESIGN.md.
