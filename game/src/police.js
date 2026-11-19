// police.js — Solaris PD: the wanted system, Interceptor pursuits and the
// helicopter that joins at four stars.
//
// The manager owns the police fleet. It spawns Interceptors on roads near
// (but not on top of) the player as the wanted level demands, steers them
// at the player's predicted position with the same arcade physics the
// traffic uses, flashes their lightbars, and runs the searchlight
// helicopter. The game feeds it the player's state each frame and reads
// back the two verdicts that end a chase: a ram that lands, and the busted
// meter that fills when a unit has the player cornered and standing still.

import * as THREE from 'three';
import { LAYOUT } from './city.js';
import { createCarMesh, CAR_SPECS } from './vehicles.js';
import { clamp, turnToward } from './rng.js';

const UNITS_BY_STARS = [0, 1, 2, 3, 4, 5];
const SPAWN_DISTANCE = 78;
const DESPAWN_DISTANCE = 190;

class Interceptor {
  constructor(scene, rng, x, z, heading) {
    this.mesh = createCarMesh(rng, 'police', 0xf0f0f2);
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.mesh.rotation.y = heading;
    this.speed = 0;
    this.spec = CAR_SPECS.police;
    this.stuckTime = 0;
    scene.add(this.mesh);
    this.scene = scene;
  }

  dispose() {
    this.scene.remove(this.mesh);
  }

  update(dt, ctx) {
    const p = this.mesh.position;
    // Aim at where the player will be in half a second, not where they are.
    const tx = ctx.playerPos.x + ctx.playerVel.x * 0.5;
    const tz = ctx.playerPos.z + ctx.playerVel.z * 0.5;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    this.heading = turnToward(this.heading, desired, this.spec.turn * dt * (this.speed < 4 ? 1.6 : 1));
    this.mesh.rotation.y = this.heading;

    // Full throttle in pursuit, easing off only when nearly on top of the player.
    const targetSpeed = dist > 14 ? this.spec.topSpeed : Math.max(6, dist * 1.1);
    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + this.spec.accel * dt);
    else this.speed = Math.max(targetSpeed, this.speed - this.spec.brake * dt);

    const nx = p.x + Math.sin(this.heading) * this.speed * dt;
    const nz = p.z + Math.cos(this.heading) * this.speed * dt;
    // Buildings are walls: slide along them instead of passing through.
    const resolved = resolveCircle(ctx.colliders, nx, nz, 1.6);
    if (resolved.hit && this.speed > 8) {
      this.stuckTime += dt;
      this.speed *= 0.45;
      if (this.stuckTime > 0.7) {
        // Back out and re-aim: a stuck unit reverses briefly, like a driver would.
        this.speed = -6;
        this.stuckTime = 0;
      }
    } else if (this.speed > 0) this.stuckTime = Math.max(0, this.stuckTime - dt);
    p.x = resolved.x;
    p.z = resolved.z;
    // Keep units out of the sea and off the pier deck.
    if (p.x > LAYOUT.cityEdge + 2) p.x = LAYOUT.cityEdge + 2;

    const spin = (this.speed * dt) / 0.36;
    for (const wheel of this.mesh.userData.wheels) wheel.rotation.z -= spin;

    // Lightbar: alternate red and blue strobes.
    const phase = Math.sin(ctx.t * 11) > 0;
    const { redMat, blueMat } = this.mesh.userData.flashers;
    redMat.emissiveIntensity = phase ? 3.2 : 0.05;
    blueMat.emissiveIntensity = phase ? 0.05 : 3.2;
    return dist;
  }
}

/** Push a circle at (x, z) out of every building AABB it overlaps. */
export function resolveCircle(colliders, x, z, radius) {
  let hit = false;
  for (const c of colliders) {
    if (x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius) {
      hit = true;
      const pushLeft = x - (c.minX - radius);
      const pushRight = (c.maxX + radius) - x;
      const pushBack = z - (c.minZ - radius);
      const pushFwd = (c.maxZ + radius) - z;
      const min = Math.min(pushLeft, pushRight, pushBack, pushFwd);
      if (min === pushLeft) x = c.minX - radius;
      else if (min === pushRight) x = c.maxX + radius;
      else if (min === pushBack) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return { x, z, hit };
}

export class Police {
  constructor(scene, rng, effects) {
    this.scene = scene;
    this.rng = rng;
    this.effects = effects;
    this.units = [];
    this.bustedMeter = 0;
    this.spawnCooldown = 0;

    // The helicopter: a simple dark airframe with a spinning rotor and a
    // real spotlight, plus a translucent cone so the beam reads in the air.
    this.heli = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.5, metalness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 5.2), bodyMat);
    this.heli.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 4.6), bodyMat);
    tail.position.set(0, 0.3, -4.6);
    this.heli.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.4, 0.8), bodyMat);
    fin.position.set(0, 0.8, -6.8);
    this.heli.add(fin);
    this.rotor = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.08, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.6 }),
    );
    this.rotor.position.y = 1.25;
    this.heli.add(this.rotor);
    this.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.3), this.rotor.material);
    this.tailRotor.position.set(0.3, 0.8, -6.8);
    this.heli.add(this.tailRotor);
    for (const sx of [-0.9, 0.9]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.6), bodyMat);
      skid.position.set(sx, -1.25, 0);
      this.heli.add(skid);
    }
    this.spot = new THREE.SpotLight(0xfff2cf, 0, 90, 0.32, 0.45, 0.6);
    this.spot.position.set(0, -1, 0);
    this.heli.add(this.spot);
    this.heli.add(this.spot.target);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffeeb8, transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(7.5, 30, 20, 1, true), coneMat);
    this.beam.position.y = -15.8;
    this.heli.add(this.beam);
    this.heli.visible = false;
    scene.add(this.heli);
    this.heliPos = new THREE.Vector3(0, 60, 0);
  }

  /** Place one unit exactly here (screenshot staging). Returns the unit. */
  addStagedUnit(x, z, heading) {
    const unit = new Interceptor(this.scene, this.rng, x, z, heading);
    this.units.push(unit);
    return unit;
  }

  /** Spawn one unit on a road ring around the player, out of direct sight. */
  spawnUnit(playerPos) {
    const rng = this.rng;
    for (let tries = 0; tries < 8; tries += 1) {
      const vertical = rng.chance(0.5);
      const road = vertical ? rng.pick(LAYOUT.roadXs) : rng.pick(LAYOUT.roadZs);
      const along = clamp((vertical ? playerPos.z : playerPos.x) + rng.range(-70, 70), -155, 155);
      const x = vertical ? road : along;
      const z = vertical ? along : road;
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d < 55 || d > 120) continue;
      if (x > LAYOUT.cityEdge) continue;
      const heading = Math.atan2(playerPos.x - x, playerPos.z - z);
      this.units.push(new Interceptor(this.scene, rng, x, z, heading));
      return;
    }
  }

  /**
   * Advance the whole response. ctx carries the player state and the world
   * colliders; returns events { rammed: intensity|null }.
   */
  update(dt, ctx) {
    const events = { rammed: null };
    const wanted = ctx.wanted;
    this.spawnCooldown -= dt;

    const wanted_units = UNITS_BY_STARS[clamp(Math.floor(wanted), 0, 5)];
    if (this.units.length < wanted_units && this.spawnCooldown <= 0) {
      this.spawnUnit(ctx.playerPos);
      this.spawnCooldown = 1.6;
    }
    // Retire units that fell far behind once the heat is off them.
    for (let i = this.units.length - 1; i >= 0; i -= 1) {
      const u = this.units[i];
      const d = Math.hypot(u.mesh.position.x - ctx.playerPos.x, u.mesh.position.z - ctx.playerPos.z);
      if ((wanted === 0 && d > 40) || d > DESPAWN_DISTANCE) {
        u.dispose();
        this.units.splice(i, 1);
      }
    }

    let nearest = Infinity;
    let cornered = false;
    for (const unit of this.units) {
      const before = { x: unit.mesh.position.x, z: unit.mesh.position.z };
      const dist = unit.update(dt, ctx);
      nearest = Math.min(nearest, dist);
      // Ram check: the unit's nose reaches the player's car.
      if (ctx.playerInCar && dist < 3.4 && unit.speed > 9) {
        events.rammed = clamp((unit.speed - 8) / 22, 0.2, 1);
        unit.speed *= 0.35;
        this.effects.burst(ctx.playerPos, { count: 14, color: [1, 0.75, 0.3], speed: 5, life: 0.5 });
        void before;
      }
      if (dist < 8.5) cornered = true;
    }
    this.nearestDistance = nearest;

    // Busted meter: fills while a unit is close and the player is nearly
    // still (on foot, or boxed in a stopped car); drains otherwise.
    const playerSlow = ctx.playerSpeed < 1.1;
    if (wanted > 0 && cornered && playerSlow) this.bustedMeter += dt / (ctx.playerInCar ? 2.4 : 1.5);
    else this.bustedMeter = Math.max(0, this.bustedMeter - dt * 0.7);
    this.bustedMeter = clamp(this.bustedMeter, 0, 1);

    // Helicopter at four stars and up.
    const heliActive = wanted >= 4;
    this.heli.visible = heliActive;
    if (heliActive) {
      const target = new THREE.Vector3(ctx.playerPos.x + 6, 27, ctx.playerPos.z - 6);
      this.heliPos.lerp(target, Math.min(1, dt * 1.4));
      this.heli.position.copy(this.heliPos);
      this.heli.rotation.y = Math.atan2(ctx.playerPos.x - this.heliPos.x, ctx.playerPos.z - this.heliPos.z);
      this.rotor.rotation.y += dt * 28;
      this.tailRotor.rotation.x += dt * 34;
      this.spot.intensity = 900;
      this.spot.target.position.set(ctx.playerPos.x - this.heliPos.x, -27, ctx.playerPos.z - this.heliPos.z);
      this.beam.material.opacity = 0.09 + Math.sin(ctx.t * 7) * 0.02;
    } else {
      this.spot.intensity = 0;
      this.heliPos.set(ctx.playerPos.x, 70, ctx.playerPos.z);
    }
    return events;
  }

  /** Positions for the minimap. */
  blips() {
    return this.units.map((u) => ({ x: u.mesh.position.x, z: u.mesh.position.z }));
  }
}
