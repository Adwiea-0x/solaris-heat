// vehicles.js — the car factory and the traffic that drives Solaris Bay.
//
// One factory builds every car in the game (sedans, sports cars, taxis,
// pickups and the police Interceptor) from boxes and cylinders with painted
// materials, so traffic, parked cars, the player's ride and police units all
// share a look. Traffic cars run the road grid on right-hand lanes, stop for
// red lights and keep their distance from the car ahead.

import * as THREE from 'three';
import { LAYOUT } from './city.js';
import { clamp, turnToward } from './rng.js';
import { signTexture } from './textures.js';

export const CAR_COLORS = [
  0xd94f3d, 0x2a7db5, 0xf2b13d, 0x53b06a, 0xe8e4da, 0x30323a, 0x8c5bb5,
  0xe2703a, 0x3fb5ac, 0xc2c7ce, 0x7a1f2b, 0x2b4c7e,
];

const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2836, roughness: 0.15, metalness: 0.6 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.95 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.35, metalness: 0.8 });
const headMat = new THREE.MeshStandardMaterial({ color: 0x444433, emissive: 0xffe9b0, emissiveIntensity: 1.8 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x330d0d, emissive: 0xff3524, emissiveIntensity: 1.4 });

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
wheelGeo.rotateX(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.28, 8);
hubGeo.rotateX(Math.PI / 2);

/**
 * Build one car. style: 'sedan' | 'sport' | 'taxi' | 'pickup' | 'police'.
 * The group faces +Z. userData carries wheels, and for police the lightbar
 * materials the police system flashes.
 */
export function createCarMesh(rng, style, color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55 });
  const isSport = style === 'sport';
  const isPickup = style === 'pickup';
  const bodyH = isSport ? 0.46 : 0.58;
  const bodyY = isSport ? 0.48 : 0.56;

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.86, bodyH, 4.4), paint);
  body.position.y = bodyY;
  body.castShadow = true;
  group.add(body);

  if (isPickup) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.62, 1.5), paint);
    cab.position.set(0, bodyY + bodyH / 2 + 0.28, 0.75);
    cab.castShadow = true;
    group.add(cab);
    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.2), glassMat);
    cabGlass.position.set(0, bodyY + bodyH / 2 + 0.3, 0.75);
    group.add(cabGlass);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.9), new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.9 }));
    bed.position.set(0, bodyY + 0.18, -1.15);
    group.add(bed);
  } else {
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.66, isSport ? 0.42 : 0.52, isSport ? 1.9 : 2.2),
      glassMat,
    );
    cabin.position.set(0, bodyY + bodyH / 2 + (isSport ? 0.18 : 0.24), isSport ? -0.25 : -0.1);
    cabin.castShadow = true;
    group.add(cabin);
    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, isSport ? 1.5 : 1.8), paint);
    roofPanel.position.set(0, bodyY + bodyH / 2 + (isSport ? 0.42 : 0.53), isSport ? -0.25 : -0.1);
    group.add(roofPanel);
  }

  if (isSport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.42), paint);
    spoiler.position.set(0, 1.06, -2.05);
    group.add(spoiler);
    for (const sx of [-0.7, 0.7]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.1), paint);
      strut.position.set(sx, 0.9, -2.05);
      group.add(strut);
    }
  }

  if (style === 'taxi') {
    const signMat = new THREE.MeshStandardMaterial({
      map: signTexture('TAXI', 46), emissive: 0xffffff,
      emissiveMap: signTexture('TAXI', 46), emissiveIntensity: 0.9,
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.44), signMat);
    sign.position.set(0, 1.62, -0.1);
    group.add(sign);
  }

  if (style === 'police') {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.2, 4.42),
      new THREE.MeshStandardMaterial({ color: 0x1d4e89, roughness: 0.4, metalness: 0.3 }),
    );
    stripe.position.y = 0.62;
    group.add(stripe);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.5), tyreMat);
    barBase.position.set(0, 1.5, -0.1);
    group.add(barBase);
    const redMat = new THREE.MeshStandardMaterial({ color: 0x330d0d, emissive: 0xff2a22, emissiveIntensity: 0 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x0d1a33, emissive: 0x2a6bff, emissiveIntensity: 3 });
    const redLamp = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.44), redMat);
    redLamp.position.set(-0.34, 1.62, -0.1);
    group.add(redLamp);
    const blueLamp = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.44), blueMat);
    blueLamp.position.set(0.34, 1.62, -0.1);
    group.add(blueLamp);
    group.userData.flashers = { redMat, blueMat };
  }

  const wheels = [];
  const wheelAt = (x, z) => {
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.add(tyre);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wheel.add(hub);
    wheel.position.set(x, 0.36, z);
    group.add(wheel);
    wheels.push(wheel);
    return wheel;
  };
  const frontL = wheelAt(-0.85, 1.45);
  const frontR = wheelAt(0.85, 1.45);
  wheelAt(-0.85, -1.45);
  wheelAt(0.85, -1.45);

  for (const sx of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), headMat);
    head.position.set(sx, 0.66, 2.21);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.06), tailMat);
    tail.position.set(sx, 0.7, -2.21);
    group.add(tail);
  }

  group.userData.wheels = wheels;
  group.userData.frontWheels = [frontL, frontR];
  group.userData.style = style;
  group.userData.paint = paint;
  return group;
}

/** Per-style driving character, shared by traffic, police and the player. */
export const CAR_SPECS = {
  sedan: { topSpeed: 26, accel: 9, brake: 22, turn: 1.9 },
  sport: { topSpeed: 38, accel: 15, brake: 26, turn: 2.2 },
  taxi: { topSpeed: 25, accel: 9, brake: 22, turn: 1.9 },
  pickup: { topSpeed: 24, accel: 8, brake: 20, turn: 1.7 },
  police: { topSpeed: 36, accel: 14, brake: 26, turn: 2.15 },
};

const LANE = 3.4; // lane offset from the road centre line
const DIRS = [
  { x: 0, z: 1 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 },
];

/** The lane centre for travelling `dir` along the road whose centre is `centre`. */
function laneCoord(dir, centre) {
  // One lane each way: opposing directions always get opposite offsets, so
  // the two streams pass without meeting, whichever side of the road it is.
  if (dir === 0) return centre + LANE;
  if (dir === 2) return centre - LANE;
  if (dir === 1) return centre - LANE;
  return centre + LANE;
}

/** One traffic car: a mesh, a route along the grid and simple spacing. */
class TrafficCar {
  constructor(scene, rng) {
    this.rng = rng;
    this.style = rng.pick(['sedan', 'sedan', 'sport', 'taxi', 'pickup']);
    this.mesh = createCarMesh(rng, this.style, this.style === 'taxi' ? 0xf2b13d : rng.pick(CAR_COLORS));
    this.spec = CAR_SPECS[this.style];
    this.speed = 0;
    this.cruise = rng.range(10, 15);
    // Start on a random road, mid-block, heading along it.
    this.dir = rng.int(0, 3);
    const vertical = this.dir === 0 || this.dir === 2;
    this.roadCentre = vertical ? rng.pick(LAYOUT.roadXs) : rng.pick(LAYOUT.roadZs);
    const along = rng.range(-150, 150);
    if (vertical) this.mesh.position.set(laneCoord(this.dir, this.roadCentre), 0, along);
    else this.mesh.position.set(along, 0, laneCoord(this.dir, this.roadCentre));
    this.heading = Math.atan2(DIRS[this.dir].x, DIRS[this.dir].z);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
  }

  /** The next intersection coordinate along the direction of travel. */
  nextJunction() {
    const p = this.mesh.position;
    const along = this.dir === 0 || this.dir === 2 ? p.z : p.x;
    const centres = this.dir === 0 || this.dir === 2 ? LAYOUT.roadZs : LAYOUT.roadXs;
    const sign = DIRS[this.dir].z + DIRS[this.dir].x > 0 ? 1 : -1;
    let best = null;
    for (const c of centres) {
      const d = (c - along) * sign;
      if (d > 2 && (best === null || d < best.d)) best = { at: c, d };
    }
    return best;
  }

  update(dt, traffic, lights, t) {
    const p = this.mesh.position;
    const junction = this.nextJunction();
    let targetSpeed = this.cruise;

    // Stop at a red light near the stop line.
    if (junction && junction.d < 9 && junction.d > 2) {
      const alongZ = this.dir === 0 || this.dir === 2;
      const state = alongZ ? lights.stateForZAxis(t) : lights.stateForXAxis(t);
      if (state === 'red' || (state === 'yellow' && junction.d > 5)) targetSpeed = 0;
    }
    // Keep distance from the car ahead.
    for (const other of traffic) {
      if (other === this) continue;
      const dx = other.mesh.position.x - p.x;
      const dz = other.mesh.position.z - p.z;
      const ahead = dx * DIRS[this.dir].x + dz * DIRS[this.dir].z;
      const side = Math.abs(dx * DIRS[this.dir].z - dz * DIRS[this.dir].x);
      if (ahead > 0 && ahead < 8 && side < 2.2) {
        targetSpeed = Math.min(targetSpeed, other.speed * (ahead < 5 ? 0.4 : 0.9));
        if (ahead < 3.6) targetSpeed = 0;
      }
    }

    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + this.spec.accel * 0.6 * dt);
    else this.speed = Math.max(targetSpeed, this.speed - this.spec.brake * dt);

    // At the junction, maybe turn onto the crossing road.
    if (junction && junction.d <= 2.4 && this.speed > 0) {
      const turn = this.rng.pick([0, 0, 1, -1, 0]); // mostly straight on
      if (turn !== 0) {
        this.dir = (this.dir + turn + 4) % 4;
        this.roadCentre = junction.at;
        // Snap the cross-axis coordinate onto the new direction's lane.
        const nowVertical = this.dir === 0 || this.dir === 2;
        if (nowVertical) p.x = laneCoord(this.dir, this.roadCentre);
        else p.z = laneCoord(this.dir, this.roadCentre);
      }
    }

    const targetHeading = Math.atan2(DIRS[this.dir].x, DIRS[this.dir].z);
    this.heading = turnToward(this.heading, targetHeading, 2.4 * dt);
    this.mesh.rotation.y = this.heading;
    p.x += Math.sin(this.heading) * this.speed * dt;
    p.z += Math.cos(this.heading) * this.speed * dt;
    // Ease the cross-axis position onto the lane centre.
    const vertical = this.dir === 0 || this.dir === 2;
    if (vertical) p.x += (laneCoord(this.dir, this.roadCentre) - p.x) * Math.min(1, dt * 2);
    else p.z += (laneCoord(this.dir, this.roadCentre) - p.z) * Math.min(1, dt * 2);

    const spin = (this.speed * dt) / 0.36;
    for (const wheel of this.mesh.userData.wheels) wheel.rotation.z -= spin;
  }
}

/** The traffic system: a fleet of AI cars and their shared update. */
export class Traffic {
  constructor(scene, rng, count = 22) {
    this.cars = [];
    for (let i = 0; i < count; i += 1) this.cars.push(new TrafficCar(scene, rng));
  }

  update(dt, lights, t) {
    for (const car of this.cars) car.update(dt, this.cars, lights, t);
  }
}
