// shots.js — the deterministic scenes behind the screenshots.
//
// The kit captures screenshots by loading the game with ?shot=<name>&seed=N.
// Each scene below is set up from a fresh world, then the real simulation is
// stepped forward with fixed steps and scripted inputs, so the frame is a
// moment the game itself produced — traffic mid-flow, a chase mid-pursuit —
// and the same seed always produces the same frame.

import { poseHandsUp, poseAim } from './people.js';
import { GARAGE } from './missions.js';

const FIXED_DT = 1 / 30;

/** Run the game's update n times with a scripted input provider. */
function runSteps(game, n, script) {
  for (let i = 0; i < n; i += 1) {
    if (script) script(i);
    game.update(FIXED_DT);
  }
}

/**
 * Stage the named scene on a freshly built game. Returns nothing; when the
 * scene is ready the game flags window.__shotReady for the capture script.
 */
export function stageShot(game, name) {
  game.beginShotMode();
  switch (name) {
    case 'chase': stageChase(game); break;
    case 'mission': stageMission(game); break;
    case 'busted': stageBusted(game); break;
    case 'title':
    default: stageTitle(game); break;
  }
  game.finishShotMode();
}

/** Cover: the hero car on the promenade, the city and sunset behind it. */
function stageTitle(game) {
  game.placeHeroCar(168, 30, Math.PI); // facing south along the promenade
  game.teleportPlayer(163.5, 35.5, -2.2);
  runSteps(game, 36, null);
  game.setShotCamera([181, 5.2, 52], [150, 2.5, 8]);
  game.showTitleScreen();
}

/** A four-star chase on the coast road: interceptors, helicopter, speed. */
function stageChase(game) {
  const car = game.placeHeroCar(96, 0, Math.PI / 2); // on the z=0 coast road, heading east
  game.enterCarInstant(car);
  game.setWanted(4, true);
  // Two interceptors tucked in behind, one alongside the beach lane.
  game.spawnShotInterceptor(78, -3.4, Math.PI / 2);
  game.spawnShotInterceptor(84, 3.6, Math.PI / 2);
  game.spawnShotInterceptor(66, -3.4, Math.PI / 2);
  game.hud.setObjective('<b>Lose the heat</b> — break line of sight');
  runSteps(game, 52, (i) => {
    game.scriptInput = { forward: true, steer: i < 8 ? 0.12 : 0 };
  });
  game.scriptInput = null;
  game.setShotCameraBehindCar(11, 3.4, 0.35);
}

/** Meeting the fixer: beacon, objective, minimap marker, the garage. */
function stageMission(game) {
  game.teleportPlayer(GARAGE.x - 4.5, GARAGE.z + 2.5, Math.PI / 2 + 0.5);
  game.missions.startNextJob();
  game.missions.update(0.016, 1); // set the objective line and the beacon once
  runSteps(game, 30, null);
  const p = game.playerPos;
  game.setShotCamera([p.x - 6.5, 3.1, p.z + 6.5], [GARAGE.x + 2, 1.4, GARAGE.z]);
}

/** Caught: hands up, two units angled in, officers covering. */
function stageBusted(game) {
  game.teleportPlayer(2, 30, 0.4);
  poseHandsUp(game.playerMesh);
  game.setWanted(3, true);
  const copA = game.spawnShotInterceptor(7.5, 38, -2.5);
  const copB = game.spawnShotInterceptor(-6, 22.5, 0.9);
  const officerA = game.spawnOfficer(4.6, 33.5, -2.2);
  const officerB = game.spawnOfficer(-3.4, 26.5, 0.75);
  poseAim(officerA);
  poseAim(officerB);
  game.police.bustedMeter = 1;
  game.hud.banner('BUSTED', 'Solaris PD got their collar');
  runSteps(game, 24, null);
  // The pursuit steps nudged the units; put the arrest back exactly as staged.
  for (const [unit, x, z, heading] of [[copA, 7.5, 38, -2.5], [copB, -6, 22.5, 0.9]]) {
    unit.mesh.position.set(x, 0, z);
    unit.mesh.rotation.y = heading;
    unit.heading = heading;
    unit.speed = 0;
  }
  game.police.bustedMeter = 1;
  poseHandsUp(game.playerMesh);
  game.setShotCamera([10.5, 3.4, 41], [0, 1.3, 30]);
}
