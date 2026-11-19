# SOLARIS HEAT

An original open-world crime game for the desktop browser, built for the
make.fun "Make GTA 6" bounty. Everything — the city of Solaris Bay, its
people, vehicles, story and sounds — is original work made for this entry.
No commercial game's names, characters, art, map or music are used.

## The game

Solaris Bay is a sun-soaked coastal city of six by six blocks at golden hour:
a beach and pier to the east, palm-lined streets, glowing shop signs,
billboards, working traffic lights and streetlights under a sunset sky.

You play a wheelman building a reputation with fixer **Marisol Vega**:

- **Explore** the whole city on foot and by car.
- **Steal and drive** any car you find; about two dozen AI cars run the
  streets and more than forty pedestrians wander the sidewalks.
- **Work the story**: a four-job chain for Marisol (a pickup, a hot delivery,
  a repo job and a pier payoff), plus repeatable timed taxi fares with a
  bonus for fast delivery.
- **Mind the heat**: a five-star wanted system. Solaris PD sends Interceptor
  pursuits, and at four stars a police helicopter joins with a searchlight.
  Get caught standing still next to a unit and you are **BUSTED**; wreck your
  health and you are **WASTED**.
- **Fight**: hitscan pistol with muzzle flash and impact particles.
- **Listen**: two synthesized radio stations (R while driving), synthesized
  engine, horn, siren and collision sounds. No audio files — WebAudio only.
- **Save**: cash and story progress persist in localStorage.

### Controls

| Input | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Orbit camera (click the game to lock the pointer) |
| Shift | Sprint on foot |
| Space | Handbrake in a car |
| F | Enter / exit a car |
| Mouse click | Shoot (on foot) |
| T | Start a taxi fare (in a car, near a fare marker) |
| R | Radio on / change station (in a car) |
| H | Horn (in a car) |
| P or Esc | Pause |
| M | Mute |

## Run it

The game is plain static files under `game/` — serve that folder with any
static file server and open `game/index.html` in desktop Chrome. This
repository ships a tiny one:

```sh
node serve.ts            # http://localhost:8080
```

It plays fully offline: every script, including the vendored three.js build,
is a file in this repository.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored `vendor/makefun-game.ts` library.

## Layout

- `game/index.html` — page, HUD and menus; loads the modules below.
- `game/src/game.js` — the orchestrator: scene, loop, player, driving, combat.
- `game/src/city.js` — Solaris Bay itself: streets, blocks, beach, pier, props.
- `game/src/textures.js` — procedural canvas textures (roads, facades, signs).
- `game/src/vehicles.js` — car factory and traffic AI.
- `game/src/people.js` — character factory and pedestrian AI.
- `game/src/police.js` — wanted system, Interceptor pursuits, helicopter.
- `game/src/missions.js` — Marisol's story chain and the taxi fares.
- `game/src/effects.js` — pooled particles: impacts, smoke, sparks, splashes.
- `game/src/audio.js` — the WebAudio synth: radio, engine, sirens, effects.
- `game/src/hud.js` — HUD readouts and the canvas minimap.
- `game/src/shots.js` — the deterministic `?shot=` scenes behind the screenshots.
- `game/src/rng.js` — the seeded random generator everything shares.
- `game/vendor/three.module.min.js` — three.js r160, vendored (MIT, see its header).

## Screenshots

`screenshots/` holds four JPEG captures of the game itself, staged with the
`?shot=title|chase|mission|busted&seed=7` scenes listed in `shots.json` and
captured at 1280x720. The first by name is the cover.
