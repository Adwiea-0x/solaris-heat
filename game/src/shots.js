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
  game.setShotCamera([180, 4.2, 50], [152, 2.2, 14]);
  game.showTitleScreen();
}

/** A four-star chase on the coast road: interceptors, helicopter, speed. */
function stageChase(game) {
  const car = game.placeHeroCar(96, 0, Math.PI / 2); // on the z=0 coast road, heading east
  game.enterCarInstant(car);
  game.setWanted(4, true);
  // Two interceptors tucked in behind, one alongside the beach lane.
  const units = [
    game.spawnShotInterceptor(78, -3.4, Math.PI / 2),
    game.spawnShotInterceptor(84, 3.6, Math.PI / 2),
    game.spawnShotInterceptor(66, -3.4, Math.PI / 2),
  ];
  game.hud.setObjective('<b>Lose the heat</b> — break line of sight');
  runSteps(game, 52, (i) => {
    game.scriptInput = { forward: true, steer: i < 8 ? 0.12 : 0 };
  });
  // The pursuit scatters over a long run; re-form it tight behind the car so
  // the frame reads as one chase, then let it settle for a few steps.
  const p = car.mesh.position;
  const h = car.heading;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const rx = Math.cos(h);
  const rz = -Math.sin(h);
  const formation = [[-14, -3.2], [-21, 3.4], [-8.5, 5.4]];
  units.forEach((unit, i) => {
    const [back, side] = formation[i];
    unit.mesh.position.set(p.x + fx * back + rx * side, 0, p.z + fz * back + rz * side);
    unit.heading = h;
    unit.mesh.rotation.y = h;
    unit.speed = car.speed;
  });
  runSteps(game, 5, () => {
    game.scriptInput = { forward: true, steer: 0 };
  });
  game.scriptInput = null;
  game.setShotCameraBehindCar(11.5, 3.6, 0.3);
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
  game.teleportPlayer(2, 44, 0.5);
  poseHandsUp(game.playerMesh);
  game.setWanted(3, true);
  const copA = game.spawnShotInterceptor(8.5, 51, -2.35);
  const copB = game.spawnShotInterceptor(-5.5, 36.5, 0.85);
  const officerA = game.spawnOfficer(5.6, 47.5, -2.1);
  const officerB = game.spawnOfficer(-2.2, 40.8, 0.7);
  poseAim(officerA);
  poseAim(officerB);
  game.police.bustedMeter = 1;
  game.hud.banner('BUSTED', 'Solaris PD got their collar');
  runSteps(game, 24, null);
  // The pursuit steps nudged the units; put the arrest back exactly as staged.
  for (const [unit, x, z, heading] of [[copA, 8.5, 51, -2.35], [copB, -5.5, 36.5, 0.85]]) {
    unit.mesh.position.set(x, 0, z);
    unit.mesh.rotation.y = heading;
    unit.heading = heading;
    unit.speed = 0;
  }
  game.police.bustedMeter = 1;
  poseHandsUp(game.playerMesh);
  game.setShotCamera([6.5, 2.6, 57.5], [1.5, 1.2, 43.5]);
}
