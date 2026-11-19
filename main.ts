// SOLARIS HEAT — entry program for the make.fun "Make GTA 6" bounty (gta6-01).
//
// The game itself is the game/ folder next to this file: plain static files
// (game/index.html plus its ES modules and one vendored three.js build) that a
// desktop browser plays fully offline. This program is only the hand-in: it
// copies game/ and screenshots/ into the output directory and writes
// dossier.json there with buildDossier from the vendored make.fun library, so
// the sealed scorer can rebuild the same dossier and compare it byte for byte.
//
// Run it the way the grader does (output defaults to /output):
//   node main.ts
// or against a scratch directory while developing:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own limits, passed to the dossier builder so an entry the scorer
// would refuse (too many screenshots, an oversized one, a game/ tree past its
// file or byte caps) is refused here first, where the mistake is visible.
const DOSSIER_TEXT_MAX_BYTES = 163_840; // 160 KiB of source text in the dossier
const SCREENSHOT_MAX_COUNT = 4;
const SCREENSHOT_MAX_BYTES = 262_144; // 256 KiB each
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50_331_648; // 48 MiB
const GAME_PATH_MAX_BYTES = 1_000;

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: DOSSIER_TEXT_MAX_BYTES,
  screenshots: { max: SCREENSHOT_MAX_COUNT, max_bytes: SCREENSHOT_MAX_BYTES },
  game_max_files: GAME_MAX_FILES,
  game_max_bytes: GAME_MAX_BYTES,
  game_path_max_bytes: GAME_PATH_MAX_BYTES,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`solaris-heat: wrote ${join(outputDir, 'dossier.json')} (${dossier.length} bytes)`);
