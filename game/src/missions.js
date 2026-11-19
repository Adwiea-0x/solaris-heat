// missions.js — Marisol Vega's story chain and the taxi fares.
//
// Four jobs tell the story: a pickup, a delivery made hot on purpose, a
// repo of a coral sports car, and a pier payoff that ends with losing the
// heat. Each job is a list of steps with a place, an objective line and an
// arrival effect; a golden beacon and a minimap diamond mark the way. When
// the story is done (or between jobs) the player can work taxi fares:
// pick up at a green marker, beat the clock to the drop, earn the fare plus
// a speed bonus. Progress is the game's to save; this manager just runs it.

import * as THREE from 'three';
import { clamp } from './rng.js';

export const GARAGE = { x: -47, z: 26 }; // Vega Motors, west face of the central block
const PIER_END = { x: 288, z: 0 };
const HOTEL_ALLEY = { x: 78, z: -101 };
const CORAL_CLUB = { x: 152, z: 78 };
const REPO_SPOT = { x: 171, z: -60 };

const STORY = [
  {
    id: 'pickup',
    title: 'First Pickup',
    intro: 'Marisol: A package is waiting in the Hotel Lumen alley. Bring it to the pier kiosk — no questions.',
    payout: 450,
    steps: [
      { at: HOTEL_ALLEY, radius: 6, text: 'Pick up the package at the <b>Hotel Lumen</b> alley', action: 'pickup' },
      { at: PIER_END, radius: 7, text: 'Drop the package at the <b>pier kiosk</b>', action: 'deliver' },
    ],
  },
  {
    id: 'hot-delivery',
    title: 'Hot Delivery',
    intro: 'Marisol: Collect from my garage, deliver to the Coral Club. Fair warning — I may have mentioned your plate to the PD.',
    payout: 800,
    steps: [
      { at: GARAGE, radius: 7, text: 'Collect the goods at <b>Vega Motors</b>', action: 'pickup-hot' },
      { at: CORAL_CLUB, radius: 7, text: 'Deliver to the <b>Coral Club</b> door', action: 'deliver' },
    ],
  },
  {
    id: 'repo',
    title: 'Repo Job',
    intro: 'Marisol: A coral Comet sports car is parked on the promenade, owing me money. Take it. Bring it home.',
    payout: 1200,
    steps: [
      { at: REPO_SPOT, radius: 9, text: 'Steal the <b>coral Comet</b> on the promenade', action: 'repo-start' },
      { at: GARAGE, radius: 9, text: 'Bring the Comet to <b>Vega Motors</b>', action: 'repo-deliver', needsRepoCar: true },
    ],
  },
  {
    id: 'payoff',
    title: 'The Pier Payoff',
    intro: 'Marisol: The big one. The case is at the end of the pier. Take it, and then make the heat forget your face.',
    payout: 2000,
    steps: [
      { at: PIER_END, radius: 6, text: 'Take the case at the <b>end of the pier</b>', action: 'pickup-heat', onFoot: true },
      { at: null, radius: 0, text: '<b>Lose the police</b> — break their line of sight', action: 'escape' },
    ],
  },
];

const TAXI_STANDS = [
  { x: 168, z: -104 }, { x: 168, z: 104 }, { x: -150, z: -150 },
  { x: 26, z: 152 }, { x: -150, z: 60 }, { x: 104, z: -152 },
];
const TAXI_DROPS = [
  { x: 168, z: 40, name: 'the beachfront' }, { x: -47, z: 26, name: 'Vega Motors' },
  { x: 78, z: -101, name: 'Hotel Lumen' }, { x: 152, z: 78, name: 'the Coral Club' },
  { x: -128, z: 128, name: 'the west market' }, { x: 288, z: 0, name: 'the pier' },
  { x: 0, z: -152, name: 'the north arcade' },
];

export class Missions {
  constructor(scene, game) {
    this.game = game;
    this.storyIndex = game.save.storyIndex ?? 0;
    this.active = null; // { def, stepIndex }
    this.fare = null; // { phase: 'pickup'|'drop', at, drop, timeLeft, fare }
    this.repoCar = null; // set by the game when the repo job spawns its car

    // The beacon: a shaft of golden light and a ground ring at the target.
    this.beacon = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 34, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc93d, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    shaft.position.y = 17;
    this.beacon.add(shaft);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.9, 28),
      new THREE.MeshBasicMaterial({ color: 0xffc93d, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.beacon.add(ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  get storyDone() {
    return this.storyIndex >= STORY.length;
  }

  /** Offer the next story job (called when the player reaches the fixer). */
  startNextJob() {
    if (this.active || this.storyDone) return false;
    const def = STORY[this.storyIndex];
    this.active = { def, stepIndex: 0 };
    this.game.hud.banner(def.title, 'A job from Marisol Vega');
    this.game.hud.message(def.intro, '#c77dff');
    this.game.audio.pickup();
    if (def.id === 'repo') this.game.spawnRepoCar(REPO_SPOT);
    return true;
  }

  currentStep() {
    return this.active ? this.active.def.steps[this.active.stepIndex] : null;
  }

  /** Where the minimap diamond and beacon should sit, if anywhere. */
  currentTarget() {
    const step = this.currentStep();
    if (step && step.at) return { ...step.at, kind: 'mission' };
    if (this.fare) {
      const at = this.fare.phase === 'pickup' ? this.fare.at : this.fare.drop;
      return { ...at, kind: 'taxi' };
    }
    if (!this.active && !this.storyDone) return { ...GARAGE, kind: 'mission' };
    return null;
  }

  /** Start a taxi fare for a driver near a stand. Returns false if busy. */
  startFare(rng, playerPos) {
    if (this.fare) return false;
    let stand = null;
    let best = Infinity;
    for (const s of TAXI_STANDS) {
      const d = Math.hypot(s.x - playerPos.x, s.z - playerPos.z);
      if (d < best) { best = d; stand = s; }
    }
    if (!stand || best > 26) return false;
    const drop = rng.pick(TAXI_DROPS);
    const dist = Math.hypot(drop.x - stand.x, drop.z - stand.z);
    this.fare = {
      phase: 'pickup', at: stand, drop,
      timeLeft: dist / 8.5 + 30, fare: Math.round(40 + dist * 0.55),
    };
    this.game.hud.message(`Fare waiting — pick up, then take them to ${drop.name}.`, '#53d769');
    this.game.hud.banner('Taxi Fare', `$${this.fare.fare} · bonus for a fast run`);
    return true;
  }

  /** Advance story steps and fares. Called every frame by the game. */
  update(dt, t) {
    // Beacon follows the current target, gently rotating.
    const target = this.currentTarget();
    if (target) {
      this.beacon.visible = true;
      this.beacon.position.set(target.x, 0, target.z);
      this.beacon.rotation.y = t * 0.8;
    } else this.beacon.visible = false;

    const game = this.game;
    const p = game.playerPos;

    // ---- story steps ----
    const step = this.currentStep();
    if (this.active && step) {
      game.hud.setObjective(`<b>${this.active.def.title}</b> — ${step.text}`);
      if (step.action === 'escape') {
        if (game.wanted === 0) this.completeStep();
      } else if (step.at) {
        const d = Math.hypot(p.x - step.at.x, p.z - step.at.z);
        const arrived = d < step.radius && (!step.onFoot || !game.playerInCar)
          && (!step.needsRepoCar || game.playerCar === this.repoCar);
        if (arrived) this.arriveAtStep(step);
      }
    } else if (this.fare) {
      const f = this.fare;
      const dest = f.phase === 'pickup' ? f.at : f.drop;
      game.hud.setObjective(f.phase === 'pickup'
        ? '<b>Taxi</b> — pick up your passenger'
        : `<b>Taxi</b> — ${Math.max(0, Math.ceil(f.timeLeft))}s to ${f.drop.name} · $${f.fare}`);
      if (f.phase === 'drop') {
        f.timeLeft -= dt;
        if (f.timeLeft <= 0) {
          game.hud.message('Fare walked away — too slow.', '#ff8a7a');
          this.fare = null;
          game.hud.setObjective('');
        }
      }
      if (this.fare) {
        const d = Math.hypot(p.x - dest.x, p.z - dest.z);
        if (d < 7 && game.playerInCar) {
          if (f.phase === 'pickup') {
            f.phase = 'drop';
            game.audio.pickup();
            game.hud.message('Passenger in. Drive!', '#53d769');
          } else {
            const bonus = Math.round(Math.max(0, f.timeLeft) * 1.2);
            game.earn(f.fare + bonus, bonus > 25 ? `Fare $${f.fare} + $${bonus} speed bonus` : `Fare $${f.fare}`);
            this.fare = null;
            game.hud.setObjective('');
          }
        }
      }
    } else if (!this.storyDone) {
      game.hud.setObjective('See <b>Marisol Vega</b> at Vega Motors for work');
    } else {
      game.hud.setObjective('Free roam — press <b>T</b> in a car near a taxi stand to work fares');
    }
  }

  arriveAtStep(step) {
    const game = this.game;
    switch (step.action) {
      case 'pickup':
        game.audio.pickup();
        game.hud.message('Package in hand. To the pier — move.', '#ffd98a');
        this.completeStep();
        break;
      case 'pickup-hot':
        game.audio.pickup();
        game.addWanted(2, 'The PD were tipped off!');
        game.hud.message('Goods collected — and here come the sirens.', '#ffd98a');
        this.completeStep();
        break;
      case 'pickup-heat':
        game.audio.pickup();
        game.addWanted(3, 'Ambush — the payoff was watched!');
        game.hud.message('Case taken. Now lose them.', '#ffd98a');
        this.completeStep();
        break;
      case 'repo-start':
        game.hud.message('That is the car. Get in and drive it home.', '#ffd98a');
        this.completeStep();
        break;
      case 'deliver':
      case 'repo-deliver':
        this.finishJob();
        break;
      default:
        this.completeStep();
    }
  }

  completeStep() {
    if (!this.active) return;
    this.active.stepIndex += 1;
    if (this.active.stepIndex >= this.active.def.steps.length) this.finishJob();
  }

  finishJob() {
    const game = this.game;
    const def = this.active.def;
    game.earn(def.payout, `Job done: ${def.title}`);
    game.hud.banner('Job Complete', `${def.title} · +$${def.payout}`);
    this.active = null;
    this.storyIndex += 1;
    game.save.storyIndex = this.storyIndex;
    game.persist();
    if (this.storyDone) {
      game.hud.message('Marisol: That is the last of it, partner. The bay is yours now.', '#c77dff');
    } else {
      game.hud.message('Marisol: Good work. Come back to the garage when you want more.', '#c77dff');
    }
  }
}

export { clamp };
