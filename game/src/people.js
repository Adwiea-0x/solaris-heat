// people.js — the character factory and the pedestrians of Solaris Bay.
//
// One factory builds every low-poly person in the game (the player, the
// fixer, police officers and the crowd) from boxes with jointed limbs the
// walk cycle swings. Pedestrians stroll the sidewalk rings around each
// block, the beach promenade and the pier; they flee from gunfire and fast
// cars, and they fall when hit — the crimes the wanted system counts.

import * as THREE from 'three';
import { LAYOUT } from './city.js';
import { clamp } from './rng.js';

const SKIN_TONES = [0xf2c49b, 0xd9a06b, 0xa96f3f, 0x7a4a28, 0xffe0bd];
const SHIRTS = [0xe2543e, 0x2a9db5, 0xf2b13d, 0x53b06a, 0xe8e4da, 0x8c5bb5, 0xef7fb0, 0x3fb5ac];
const PANTS = [0x2b3a55, 0x4a4a4f, 0x7a5c3e, 0xe8e4da, 0x315c46, 0x22242a];

function limb(w, h, d, mat) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0); // pivot at the joint
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Build one person, about 1.78 m tall, facing +Z.
 * options: { skin, shirt, pants, hat: 'cap'|'bun'|null, officer: bool }
 * userData carries the joints the walk cycle and poses drive.
 */
export function createPersonMesh(rng, options = {}) {
  const skin = new THREE.MeshStandardMaterial({ color: options.skin ?? rng.pick(SKIN_TONES), roughness: 0.75 });
  const shirt = new THREE.MeshStandardMaterial({ color: options.shirt ?? rng.pick(SHIRTS), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: options.pants ?? rng.pick(PANTS), roughness: 0.95 });
  const group = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.24), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.1, 0.32),
    new THREE.MeshStandardMaterial({ color: options.hair ?? 0x2a1c12, roughness: 1 }),
  );
  hair.position.y = 1.82;
  group.add(hair);
  if (options.hat === 'cap' || options.officer) {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.2, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: options.officer ? 0x1d2f4a : 0xd94f3d, roughness: 0.8 }),
    );
    cap.position.y = 1.86;
    group.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), cap.material);
    brim.position.set(0, 1.83, 0.22);
    group.add(brim);
  }
  if (options.officer) {
    const vest = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.4, 0.27),
      new THREE.MeshStandardMaterial({ color: 0x1d2f4a, roughness: 0.85 }),
    );
    vest.position.y = 1.16;
    group.add(vest);
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.11, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, emissive: 0xc9a227, emissiveIntensity: 0.4 }),
    );
    badge.position.set(0.13, 1.24, 0.15);
    group.add(badge);
  }

  const armL = limb(0.13, 0.58, 0.13, shirt);
  armL.position.set(-0.31, 1.4, 0);
  group.add(armL);
  const armR = limb(0.13, 0.58, 0.13, shirt);
  armR.position.set(0.31, 1.4, 0);
  group.add(armR);
  const legL = limb(0.16, 0.8, 0.16, pants);
  legL.position.set(-0.12, 0.82, 0);
  group.add(legL);
  const legR = limb(0.16, 0.8, 0.16, pants);
  legR.position.set(0.12, 0.82, 0);
  group.add(legR);

  group.userData.parts = { armL, armR, legL, legR, head, torso };
  return group;
}

/** Swing the limbs for a walk/run cycle; phase advances with distance. */
export function animateWalk(mesh, phase, amount = 1) {
  const { armL, armR, legL, legR } = mesh.userData.parts;
  const swing = Math.sin(phase) * 0.55 * amount;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  armR.rotation.x = swing * 0.8;
  mesh.position.y = Math.abs(Math.sin(phase)) * 0.05 * amount;
}

/** Pose: both arms raised (surrender — the busted scene). */
export function poseHandsUp(mesh) {
  const { armL, armR, legL, legR } = mesh.userData.parts;
  armL.rotation.z = 2.6;
  armR.rotation.z = -2.6;
  armL.rotation.x = 0;
  armR.rotation.x = 0;
  legL.rotation.x = 0;
  legR.rotation.x = 0;
}

/** Pose: one arm aimed straight ahead (an officer covering a suspect). */
export function poseAim(mesh) {
  const { armR } = mesh.userData.parts;
  armR.rotation.x = -Math.PI / 2;
}

/** One pedestrian: a mesh, a walking loop and its panic/fall states. */
class Pedestrian {
  constructor(scene, rng) {
    this.rng = rng;
    this.mesh = createPersonMesh(rng);
    this.state = 'walk'; // walk | flee | down
    this.stateTime = 0;
    this.phase = rng.range(0, 6);
    this.speed = rng.range(1.1, 1.7);
    // A loop to walk: a block's sidewalk ring, the promenade, or the pier.
    const kind = rng.pick(['block', 'block', 'block', 'promenade', 'pier']);
    if (kind === 'block') {
      const block = rng.pick(LAYOUT.blocks);
      const r = LAYOUT.blockSize / 2 + 1.6;
      this.path = [
        [block.x - r, block.z - r], [block.x + r, block.z - r],
        [block.x + r, block.z + r], [block.x - r, block.z + r],
      ];
    } else if (kind === 'promenade') {
      const x = LAYOUT.beachX - 1.6;
      this.path = [[x, -165], [x, 165]];
    } else {
      this.path = [[LAYOUT.waterX + 2, LAYOUT.pierZ - 3.4], [LAYOUT.pierEndX - 8, LAYOUT.pierZ - 3.4],
        [LAYOUT.pierEndX - 8, LAYOUT.pierZ + 3.4], [LAYOUT.waterX + 2, LAYOUT.pierZ + 3.4]];
    }
    this.seg = rng.int(0, this.path.length - 1);
    this.segT = rng.next();
    this.place();
    scene.add(this.mesh);
    this.scene = scene;
  }

  place() {
    const [ax, az] = this.path[this.seg];
    const [bx, bz] = this.path[(this.seg + 1) % this.path.length];
    this.mesh.position.set(ax + (bx - ax) * this.segT, 0, az + (bz - az) * this.segT);
  }

  /** Start running from a point (gunfire, a near miss, a crash). */
  panic(fromX, fromZ) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.stateTime = 0;
    const dx = this.mesh.position.x - fromX;
    const dz = this.mesh.position.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    this.fleeDir = Math.atan2(dx / len, dz / len);
  }

  /** Knock the pedestrian down (a crime, if the player caused it). */
  knockDown() {
    if (this.state === 'down') return false;
    this.state = 'down';
    this.stateTime = 0;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.25;
    return true;
  }

  update(dt) {
    this.stateTime += dt;
    if (this.state === 'down') {
      if (this.stateTime > 7) {
        // Quietly get up somewhere else: the crowd never thins for long.
        this.state = 'walk';
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        this.seg = this.rng.int(0, this.path.length - 1);
        this.segT = this.rng.next();
        this.place();
      }
      return;
    }
    if (this.state === 'flee') {
      const runSpeed = 4.4;
      this.mesh.position.x += Math.sin(this.fleeDir) * runSpeed * dt;
      this.mesh.position.z += Math.cos(this.fleeDir) * runSpeed * dt;
      this.mesh.rotation.y = this.fleeDir;
      this.phase += dt * 11;
      animateWalk(this.mesh, this.phase, 1.2);
      if (this.stateTime > 2.6) this.state = 'walk';
      return;
    }
    // Walk the loop.
    const [ax, az] = this.path[this.seg];
    const [bx, bz] = this.path[(this.seg + 1) % this.path.length];
    const segLen = Math.hypot(bx - ax, bz - az);
    this.segT += (this.speed * dt) / segLen;
    if (this.segT >= 1) {
      this.segT = 0;
      this.seg = (this.seg + 1) % this.path.length;
    }
    this.place();
    this.mesh.rotation.y = Math.atan2(bx - ax, bz - az);
    this.phase += dt * this.speed * 3.4;
    animateWalk(this.mesh, this.phase, 0.8);
  }
}

/** The crowd system: every pedestrian, updated together. */
export class Pedestrians {
  constructor(scene, rng, count = 44) {
    this.list = [];
    for (let i = 0; i < count; i += 1) this.list.push(new Pedestrian(scene, rng));
  }

  /** Panic everyone within radius of a point. Returns how many panicked. */
  panicNear(x, z, radius) {
    let n = 0;
    for (const ped of this.list) {
      const d = Math.hypot(ped.mesh.position.x - x, ped.mesh.position.z - z);
      if (d < radius && ped.state === 'walk') {
        ped.panic(x, z);
        n += 1;
      }
    }
    return n;
  }

  update(dt) {
    for (const ped of this.list) ped.update(dt);
  }
}

/** Keep a ground-level position out of a circle: used for gentle separation. */
export function pushOutOfCircle(pos, cx, cz, radius) {
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d = Math.hypot(dx, dz);
  if (d > 0.001 && d < radius) {
    pos.x = cx + (dx / d) * radius;
    pos.z = cz + (dz / d) * radius;
  }
  return pos;
}

export { clamp };
