# Tailgate - Game Design Document

v0.1 - owner: Craig McCart (Sonofg0tham)
Status: pre-production. Numbers below are starting values, all tunable via data files.

## Pitch

You're a red teamer with a letter of authorisation in one pocket and a rogue device in the other. Get into Meridian Business Park, Building C. Plant the device in the server room. Get out. Write it up. Top-down 2D stealth where every mechanic is a real physical pentest trope.

## Design pillars

1. **Observation beats action.** Watching routines for two minutes should always beat improvising for ten seconds. The game rewards patience with information.
2. **Sound is information, both ways.** The player hears guards through walls. Guards hear the player run. Audio is a mechanic before it's atmosphere.
3. **Every mechanic is a real pentest trope.** Tailgating, the smokers' door, the propped fire exit, the unattended loading dock. If it wouldn't appear in a real engagement report, it doesn't go in the game.
4. **Mistakes are findings.** Getting spotted escalates tension instead of instantly ending the run, and every mistake becomes a line in the end-of-mission report. The game is allowed to be funny about failure.

## Core loop

Moment to moment (60-90 seconds): observe patrol timings, badge schedules and camera sweeps, pick a route, execute, survive the complication, adapt.

Mission: ingress, cross reception and the office floor, reach the restricted corridor, plant the device in the server room, exfil to the van, receive the Engagement Report.

Target mission length: 10-15 minutes for a first clear.

## Player verbs (v1, exactly four)

- **Move** at three speeds: creep (silent), walk (small noise radius), run (large noise radius). Held modifier keys switch speed.
- **Interact**: doors, breaker box, objectives. Context prompt appears when in range.
- **Tailgate**: staff badge through secured doors on schedules. The door stays open 1.6 seconds after they pass. Slipping through in that window is entry without a badge. A guard who sees it happen goes suspicious.
- **Distract**: throw a bolt to create a noise ping guards investigate. Supply of 3 per run.

No combat. No takedowns. If a guard reaches the player, the player is detained.

## Detection model

### Guards

State machine: PATROL, CURIOUS, SEARCHING, ALERT, SWEEP, back to PATROL.

- Vision cone: range 7 tiles, 70 degree field of view, fully blocked by walls and closed doors.
- Player inside a cone fills that guard's suspicion meter. Fill rate scales with proximity and player speed. Creeping at max range takes roughly 3 seconds to fill, running at close range is near-instant.
- CURIOUS: a single noise ping or a partial glimpse. Guard walks to the point of interest, looks around, returns to patrol.
- ALERT: meter full. Guard chases. If the guard touches the player, detained, mission fails, restart at last checkpoint.
- Radio: an ALERT guard raises the building alert level after 3 seconds of alert unless the player breaks line of sight first. Breaking contact fast is always worth it.
- Patrol routes, timings and pause points are data (JSON), not code.

### Cameras

- Fixed sweep arcs, defined in data. Player in an arc for more than 0.8 seconds triggers a CURIOUS ping at that spot. More than 2 seconds raises the building alert level by one.
- The breaker box in the maintenance corridor kills all cameras on its circuit for 20 seconds, with a 60 second cooldown.

### Building alert levels

- **Level 0, calm.** Normal routines.
- **Level 1, cautious.** Guards walk faster and add extra patrol nodes. Decays back to calm after 60 seconds without incident.
- **Level 2, lockdown.** Badge doors deny everyone, guards sweep the floor, exfil only via the loading dock or fire exit. Does not decay.

## The level: Meridian Business Park, Building C

Zones: car park (start, the van), reception with badge gate, open-plan office, kitchen and break room, maintenance corridor with breaker box, loading dock, security office, server room (the goal).

### Ingress routes

Design for five. Build three in v1, all five by v1.0 if time allows.

1. **Smokers' door** (v1): staff prop it open during break windows at fixed times. Wait for the window.
2. **Reception tailgate** (v1): follow a staff member through the badge gate at shift change, when traffic gives cover.
3. **Loading dock** (v1): the driver leaves the shutter half open while wheeling deliveries inside. Timed gaps.
4. **Fire exit** (stretch): alarmed unless the breaker circuit is killed first. Chain two mechanics together.
5. **Ground-floor window** (stretch): always openable, always produces a loud noise ping. The impatient option.

## Objectives

- **Primary**: plant the rogue device on rack 4 in the server room. Hold interact for 3 seconds, uninterrupted.
- **Secondary** (v1 ships two): photograph an unlocked, unattended workstation. Photograph the password sticky note in the office. Each one is a bonus finding in the report.
- **Exfil**: return to the van. Mission ends, report generates.
- Checkpoints: on first entering the building, and immediately after planting the device.

## The Engagement Report (end screen, the signature)

A one-page pentest report generated from the actual run, rendered in IBM Plex Mono. This screen is the game's screenshot magnet and its best joke.

- Findings list drawn from what the player exploited, e.g. "Finding: loading dock unattended at 09:42. Severity: High."
- Player mistakes logged as "client detections", detainments as "consultant detained by client staff".
- Time on site, alert level reached, secondaries completed.
- Rating: **GHOST** (never seen, no alarms), **PROFESSIONAL** (seen but no alarms raised), **NOISY** (alarm raised), **DETAINED** (caught at least once but finished the job).
- Stretch: copy report to clipboard as text so people can share it.

## Audio direction

- Guard footsteps audible through walls, volume by distance, low-pass filtered when occluded. Radio chatter as a proximity cue.
- Player footsteps depend on surface: carpet quiet, tile loud. Surfaces are tile properties in Tiled.
- The alert sting is the game's "!" moment. Make it iconic and legally distinct from Metal Gear.
- Ambience: HVAC hum, a printer, the kettle in the kitchen, server room fan wall.
- Sources: Sonniss GDC bundles and Kenney audio, all logged in CREDITS.md.

## Visual direction

- Top-down, clean and readable. Kenney prototype and top-down packs, reskinned later if it earns it.
- Phase 5 lighting is the glow-up: darkness as cover, guard torches and camera arcs rendered as visible light cones, the server room lit only by rack LEDs. Readability benchmark: Intravenous.
- Identity rules (palette, fonts, access-control UI theme) live in CLAUDE.md and are non-negotiable.

## Accessibility (design constraints, not afterthoughts)

- No twitch inputs. The tailgate window is generous (1.6s) and interactions are hold, not mash.
- Guard and camera states are never communicated by colour alone: cone colour changes AND edge style changes (solid, dashed, pulsing) AND an audio cue fires.
- High-contrast UI, scalable HUD text setting, screen shake has an off toggle.
- Assist option in settings: guard speed 90 percent. No achievement penalty, no shame copy.

## Build phases

Each phase is one branch, one PR, one deployed preview. "Done when" is the acceptance test.

**Phase 0, skeleton.** Vite + Phaser + TypeScript scaffold, ESLint, folder structure, web fonts loaded, placeholder scene, Vercel deployment, README stub with the pitch, empty CREDITS.md, gitignore including `.env`.
Done when: a deployed URL shows a moving rectangle at 60fps and all four npm scripts pass.

**Phase 1, the space.** Tiled greybox map of Building C, collision, camera follow, three movement speeds with a debug view showing the player's current noise radius.
Done when: you can creep, walk and run around the entire floor plan and the noise radius visibly changes.

**Phase 2, being watched.** One guard driven by patrol data, vision cone with wall occlusion, suspicion meter, CURIOUS and ALERT states, detain and restart. Debug overlay showing cones and state.
Done when: getting spotted and detained works end to end, and sneaking past the patrol already feels tense in greybox.

**Phase 3, doors and people.** Badge doors, staff NPCs on schedules, the tailgate window, the smokers' door timing, the distraction throw, noise pings pulling guards to CURIOUS.
Done when: you can get from the van into the office interior three different ways without owning a badge.

**Phase 4, the job.** Server room and plant interaction, two secondary objectives, exfil, building alert levels 0-2, checkpoints, the Engagement Report screen generating from real run data with all four ratings reachable.
Done when: the full mission is playable start to finish and the report accurately describes what actually happened in the run.

**Phase 5, atmosphere.** Lighting pipeline (darkness, torch and camera cones as light, server room LEDs), surface-based footsteps, guard audio and occlusion filter, the alert sting, ambience, juice pass (camera easing, subtle shake on alarm with the off toggle, UI polish to the identity spec).
Done when: a stranger watching 30 seconds of play says it looks and sounds finished.

**Phase 6, ship.** Sign-in kiosk main menu, settings (volume, HUD scale, shake toggle, assist mode), balance pass on all timings, CI pipeline (typecheck, lint, gitleaks), README with GIFs, CREDITS.md audit.
Done when: a public URL and a repo Craig would happily put on his CV.

## v2 parking lot (do not build in v1)

Hi-vis disguise system, takedowns and body management, hijacking the security office camera feed, fire exit and window ingress if cut from v1, a second building, roof ingress, daily-seed leaderboard, gamepad and mobile support, report sharing as an image.
