// game.js — SOLARIS HEAT, the orchestrator.
//
// Builds the world (city, traffic, crowd, police, missions), owns the
// player on foot and in cars, the camera, combat, the wanted level, health,
// cash and the save — and runs the frame loop. Every other module has one
// job; this one makes them a game. It also exposes the hooks the ?shot=
// staging (shots.js) and the capture script use: window.__game and
// window.__shotReady.

import * as THREE from 'three';
import { Rng, clamp, lerp, turnToward } from './rng.js';
import { skyTexture } from './textures.js';
import { buildCity, LAYOUT } from './city.js';
import { createCarMesh, CAR_SPECS, CAR_COLORS, Traffic } from './vehicles.js';
import { createPersonMesh, animateWalk, Pedestrians } from './people.js';
import { Police, resolveCircle } from './police.js';
import { Effects } from './effects.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { Missions, GARAGE } from './missions.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'solarisHeatSaveV1';
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 7) || 7;
const SHOT = params.get('shot');

export class Game {
  constructor() {
    this.rng = new Rng(SEED * 7919 + 13);
    this.save = this.loadSave();
    this.cash = this.save.cash ?? 120;
    this.wanted = 0;
    this.crimeHeat = 0; // seconds since the last witnessed crime
    this.health = 100;
    this.state = SHOT ? 'shot' : 'title'; // title | play | pause | ended | shot
    this.time = 0;
    this.scriptInput = null;
    this.shotCamera = null;
    this.endedKind = null;

    // ---- renderer / scene / camera ----
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xdd7a52, 120, 460);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
    this.camera.position.set(150, 26, 90);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(880, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
    );
    this.scene.add(sky);
    this.sun = new THREE.DirectionalLight(0xffb36b, 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -95;
    this.sun.shadow.camera.right = 95;
    this.sun.shadow.camera.top = 95;
    this.sun.shadow.camera.bottom = -95;
    this.sun.shadow.camera.far = 520;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xcf9fff, 0x8a5a3a, 0.75));
    // Warm bounce off the bay: a soft shadowless fill from the east, so the
    // faces turned away from the sunset stay readable instead of going black.
    const bounce = new THREE.DirectionalLight(0xff9a6b, 0.55);
    bounce.position.set(190, 90, 80);
    this.scene.add(bounce);
    this.scene.add(bounce.target);

    // ---- world ----
    this.city = buildCity(this.scene, this.rng);
    this.effects = new Effects(this.scene);
    this.traffic = new Traffic(this.scene, this.rng, 22);
    this.peds = new Pedestrians(this.scene, this.rng, 44);
    this.police = new Police(this.scene, this.rng, this.effects);
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.missions = new Missions(this.scene, this);

    // The fixer, Marisol Vega, waits by her garage door.
    this.fixer = createPersonMesh(this.rng, { shirt: 0x8c5bb5, pants: 0x22242a, skin: 0xa96f3f, hat: 'cap' });
    this.fixer.position.set(GARAGE.x, 0, GARAGE.z);
    this.fixer.rotation.y = -Math.PI / 2;
    this.scene.add(this.fixer);

    // ---- player ----
    this.playerMesh = createPersonMesh(this.rng, { shirt: 0xe2543e, pants: 0x2b3a55, skin: 0xd9a06b, hat: 'cap' });
    this.playerMesh.position.set(-49, 0, 44);
    this.scene.add(this.playerMesh);
    this.playerHeading = 2.6;
    this.playerSpeed = 0;
    this.walkPhase = 0;
    this.playerVel = new THREE.Vector3();
    this.playerInCar = false;
    this.playerCar = null;

    // Cars the player can take: parked cars plus, later, stopped traffic.
    this.carPool = [];
    this.parkCars();
    this.heroCar = this.placeCar('sport', 0xd94f3d, 168, 58, Math.PI, { owned: true });

    // ---- input ----
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.camYaw = 2.4;
    this.camPitch = 0.32;
    this.camDist = 7.5;
    this.shake = 0;
    this.shootCooldown = 0;
    this.bindInput(canvas);

    // HUD boot state.
    this.hud.setCash(this.cash);
    this.hud.setHealth(1);
    this.hud.setStars(0);
    if (this.save.storyIndex > 0) this.hud.message('Welcome back to Solaris Bay. Progress restored.', '#7be495');

    window.__game = this;
    if (SHOT) stageShot(this, SHOT);

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---- save ---------------------------------------------------------------
  loadSave() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: this.cash, storyIndex: this.missions?.storyIndex ?? this.save.storyIndex ?? 0 }));
    } catch { /* private mode: play on without a save */ }
  }

  // ---- cars ---------------------------------------------------------------
  placeCar(style, color, x, z, heading, opts = {}) {
    const mesh = createCarMesh(this.rng, style, color);
    mesh.position.set(x, groundHeight(x, z), z);
    mesh.rotation.y = heading;
    this.scene.add(mesh);
    const car = {
      mesh, style, spec: CAR_SPECS[style], speed: 0, heading,
      health: 100, owned: !!opts.owned, trafficRef: null, smokeTimer: 0,
    };
    mesh.userData.carRef = car;
    this.carPool.push(car);
    return car;
  }

  parkCars() {
    const spots = [
      ['sedan', -58, -20], ['sedan', 60, 33], ['pickup', 110, -45], ['sedan', -110, 90],
      ['taxi', 8, -58], ['sedan', -6, 118], ['pickup', -150, -12], ['sedan', 158, -120],
      ['sedan', 45, 84], ['pickup', -88, -118], ['sedan', 120, 140], ['taxi', -140, 140],
    ];
    for (const [style, x, z] of spots) {
      const heading = this.rng.chance(0.5) ? 0 : Math.PI;
      const color = style === 'taxi' ? 0xf2b13d : this.rng.pick(CAR_COLORS);
      this.placeCar(style, color, x, z, heading);
    }
    // Promenade parking, noses to the sea.
    for (let i = 0; i < 4; i += 1) {
      this.placeCar(this.rng.pick(['sedan', 'sport', 'pickup']), this.rng.pick(CAR_COLORS), 171.5, -30 + i * 26, Math.PI / 2);
    }
  }

  /** The coral Comet the repo job sends the player to steal. */
  spawnRepoCar(spot) {
    const car = this.placeCar('sport', 0xff6f61, spot.x, spot.z, Math.PI / 2);
    this.missions.repoCar = car;
    return car;
  }

  nearestDrivableCar() {
    const p = this.playerPos;
    let best = null;
    let bestD = 3.6;
    for (const car of this.carPool) {
      const d = Math.hypot(car.mesh.position.x - p.x, car.mesh.position.z - p.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    // A traffic car standing still can be jacked too.
    for (const tc of this.traffic.cars) {
      if (tc.speed > 1.5) continue;
      const d = Math.hypot(tc.mesh.position.x - p.x, tc.mesh.position.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = {
          mesh: tc.mesh, style: tc.style, spec: tc.spec,
          speed: 0, heading: tc.heading, health: 100, owned: false, trafficRef: tc, smokeTimer: 0,
        };
      }
    }
    return best;
  }

  enterCar(car) {
    if (car.trafficRef) {
      const idx = this.traffic.cars.indexOf(car.trafficRef);
      if (idx >= 0) this.traffic.cars.splice(idx, 1);
      car.trafficRef = null;
      this.carPool.push(car);
      car.mesh.userData.carRef = car;
    }
    this.playerInCar = true;
    this.playerCar = car;
    this.playerMesh.visible = false;
    this.camDist = 10.5;
    this.audio.wake();
    if (!car.owned) {
      const witnessed = this.police.units.length > 0 || this.peds.list.some((ped) => ped.state !== 'down'
        && Math.hypot(ped.mesh.position.x - this.playerPos.x, ped.mesh.position.z - this.playerPos.z) < 13);
      if (witnessed) this.commitCrime(1, 'Car theft witnessed!');
      if (car === this.missions.repoCar) this.commitCrime(1, 'The Comet is reported stolen!');
    }
    this.hud.message(car.owned ? 'Your Comet. Drive.' : 'Car taken. F to get out, R for radio.', '#7be495');
  }

  exitCar() {
    if (!this.playerCar) return;
    const car = this.playerCar;
    const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    this.playerMesh.position.set(
      car.mesh.position.x + side.x * 2.2, 0, car.mesh.position.z + side.z * 2.2,
    );
    this.playerMesh.position.y = groundHeight(this.playerMesh.position.x, this.playerMesh.position.z);
    const resolved = resolveCircle(this.city.colliders, this.playerMesh.position.x, this.playerMesh.position.z, 0.5);
    this.playerMesh.position.x = resolved.x;
    this.playerMesh.position.z = resolved.z;
    this.playerInCar = false;
    this.playerCar = null;
    this.playerMesh.visible = true;
    this.camDist = 7.5;
    this.audio.setEngine(0, false);
    this.audio.setRadio(-1);
    this.hud.setRadio('');
    this.hud.setSpeed(null);
  }

  // ---- input ---------------------------------------------------------------
  bindInput(canvas) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.audio.wake();
      if (e.code === 'KeyF') this.onInteract();
      if (e.code === 'KeyR' && this.playerInCar) this.cycleRadio();
      if (e.code === 'KeyH' && this.playerInCar) this.audio.horn();
      if (e.code === 'KeyT' && this.playerInCar) {
        if (!this.missions.startFare(this.rng, this.playerPos)) {
          this.hud.message('No fare nearby — taxi stands are on the promenade and corners.', '#ff8a7a');
        }
      }
      if (e.code === 'KeyM') {
        this.audio.setMuted(!this.audio.muted);
        this.hud.message(this.audio.muted ? 'Sound off.' : 'Sound on.', '#7be495');
      }
      if (e.code === 'KeyP') this.togglePause();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    canvas.addEventListener('mousedown', () => {
      this.audio.wake();
      if (this.state === 'title') this.startPlay();
      else if (this.state === 'ended') this.respawn();
      else if (this.state === 'pause') this.togglePause();
      else if (this.state === 'play' && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      } else if (this.state === 'play' && !this.playerInCar) this.shoot();
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && this.state === 'play' && !SHOT) {
        this.state = 'pause';
        document.getElementById('pause-screen').classList.remove('hidden');
      }
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas && this.state === 'play') {
        this.camYaw -= e.movementX * 0.0026;
        this.camPitch = clamp(this.camPitch + e.movementY * 0.0022, -0.05, 1.05);
      }
    });
  }

  togglePause() {
    if (this.state === 'play') {
      this.state = 'pause';
      document.getElementById('pause-screen').classList.remove('hidden');
      document.exitPointerLock?.();
    } else if (this.state === 'pause') {
      this.state = 'play';
      document.getElementById('pause-screen').classList.add('hidden');
    }
  }

  startPlay() {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.state = 'play';
    this.hud.message('See Marisol Vega at Vega Motors — west side of the central block.', '#c77dff');
  }

  onInteract() {
    if (this.state !== 'play') return;
    if (this.playerInCar) {
      if (Math.abs(this.playerCar.speed) < 3) this.exitCar();
      return;
    }
    // Talk to the fixer first: she is the story.
    const dFixer = Math.hypot(this.fixer.position.x - this.playerPos.x, this.fixer.position.z - this.playerPos.z);
    if (dFixer < 3.2 && !this.missions.active) {
      if (!this.missions.startNextJob()) {
        this.hud.message('Marisol: Bay is yours, partner. Fares are on T if you want coin.', '#c77dff');
      }
      return;
    }
    const car = this.nearestDrivableCar();
    if (car) this.enterCar(car);
  }

  cycleRadio() {
    const next = ((this.audio.radioStation + 2) % 3) - 1; // -1 -> 0 -> 1 -> -1
    this.audio.setRadio(next);
    this.hud.setRadio(next === 0 ? 'Solana FM' : next === 1 ? 'Bahía Beats' : '');
    if (next >= 0) this.hud.message(next === 0 ? '♪ Solana FM — synthwave for the coast road' : '♪ Bahía Beats — latin groove', '#ffd98a');
  }

  // ---- shared state ---------------------------------------------------------
  get playerPos() {
    return this.playerInCar ? this.playerCar.mesh.position : this.playerMesh.position;
  }

  earn(amount, why) {
    this.cash += amount;
    this.hud.setCash(this.cash);
    this.audio.cashRegister();
    if (why) this.hud.message(`${why} · +$${amount}`, '#7be495');
    this.persist();
  }

  commitCrime(stars, why) {
    this.crimeHeat = 0;
    const before = this.wanted;
    this.wanted = clamp(this.wanted + stars, 0, 5);
    if (this.wanted > before && why) this.hud.message(why, '#ff8a7a');
    this.hud.setStars(this.wanted);
  }

  addWanted(n, why) {
    this.commitCrime(n, why);
  }

  setWanted(n, silent = false) {
    this.wanted = n;
    this.crimeHeat = 0;
    this.hud.setStars(n);
    if (!silent && n > 0) this.hud.message('The heat is on!', '#ff8a7a');
  }

  damage(amount, why) {
    if (this.state !== 'play' && this.state !== 'shot') return;
    this.health -= amount;
    this.hud.setHealth(this.health / 100);
    this.hud.flashDamage();
    if (this.health <= 0 && this.state === 'play') this.endRun('wasted', why ?? 'You wrecked yourself.');
  }

  // ---- frame loop -----------------------------------------------------------
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state !== 'pause') this.update(dt);
    // The sun (and its shadow frustum) follows the player.
    const focus = this.state === 'title' ? this.heroCar.mesh.position : this.playerPos;
    this.sun.position.set(focus.x - 150, 125, focus.z - 65);
    this.sun.target.position.copy(focus);
    this.renderer.render(this.scene, this.camera);
  }

  readInput() {
    if (this.state === 'shot') {
      const s = this.scriptInput ?? {};
      return { forward: !!s.forward, back: !!s.back, left: !!s.left, right: !!s.right, sprint: false, brake: !!s.brake, steer: s.steer ?? 0 };
    }
    const k = this.keys;
    return {
      forward: k.has('KeyW') || k.has('ArrowUp'),
      back: k.has('KeyS') || k.has('ArrowDown'),
      left: k.has('KeyA') || k.has('ArrowLeft'),
      right: k.has('KeyD') || k.has('ArrowRight'),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      brake: k.has('Space'),
      steer: 0,
    };
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.city.update(dt, t);
    this.effects.update(dt);
    this.traffic.update(dt, this.city.trafficLights, t);
    this.peds.update(dt);

    if (this.state === 'title') {
      this.updateCamera(dt);
      return;
    }
    if (this.state !== 'play' && this.state !== 'shot') return;

    const input = this.readInput();
    if (this.playerInCar) this.driveCar(dt, this.playerCar, input);
    else this.walkPlayer(dt, input);
    this.updatePolice(dt);
    this.updateWanted(dt);
    if (this.state === 'play') this.missions.update(dt, t);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.updateCamera(dt);
    this.updateHudBits(dt);

    // Siren loudness follows the nearest unit.
    const nearest = this.police.nearestDistance ?? Infinity;
    this.audio.setSiren(this.wanted > 0 ? clamp(1 - nearest / 70, 0, 1) : 0);
    if (this.playerInCar) {
      const car = this.playerCar;
      this.audio.setEngine(clamp(Math.abs(car.speed) / car.spec.topSpeed, 0, 1), true);
    }
  }

  // ---- on foot ----------------------------------------------------------------
  walkPlayer(dt, input) {
    const mesh = this.playerMesh;
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += fx; mz += fz; }
    if (input.back) { mx -= fx; mz -= fz; }
    if (input.right) { mx += rx; mz += rz; }
    if (input.left) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    const inWater = mesh.position.x > LAYOUT.waterX + 2 && Math.abs(mesh.position.z - LAYOUT.pierZ) > 6;
    const speed = (input.sprint ? 7.2 : 4.3) * (inWater ? 0.4 : 1);
    if (len > 0.01) {
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      this.playerHeading = turnToward(this.playerHeading, targetHeading, 12 * dt);
      mesh.position.x += mx * speed * dt;
      mesh.position.z += mz * speed * dt;
      this.playerSpeed = speed;
      this.walkPhase += dt * speed * 2.3;
      animateWalk(mesh, this.walkPhase, input.sprint ? 1.15 : 0.85);
      if (inWater && Math.random() < dt * 6) {
        this.effects.burst(mesh.position, { count: 3, color: [0.75, 0.9, 1], speed: 1.2, up: 1.4, life: 0.4, gravity: -3 });
      }
    } else {
      this.playerSpeed = 0;
      const parts = mesh.userData.parts;
      for (const part of [parts.armL, parts.armR, parts.legL, parts.legR]) {
        part.rotation.x = lerp(part.rotation.x, 0, Math.min(1, dt * 10));
      }
      mesh.position.y = groundHeight(mesh.position.x, mesh.position.z);
    }
    const resolved = resolveCircle(this.city.colliders, mesh.position.x, mesh.position.z, 0.5);
    mesh.position.x = clamp(resolved.x, -335, 395);
    mesh.position.z = clamp(resolved.z, -335, 335);
    mesh.position.y = groundHeight(mesh.position.x, mesh.position.z);
    mesh.rotation.y = this.playerHeading;
    this.playerVel.set(mx * this.playerSpeed, 0, mz * this.playerSpeed);
    this.hud.setCrosshair(this.state === 'play');
  }

  // ---- driving ------------------------------------------------------------------
  driveCar(dt, car, input) {
    const spec = car.spec;
    const mesh = car.mesh;
    let steer = input.steer;
    if (input.left) steer += 1;
    if (input.right) steer -= 1;
    if (input.forward) car.speed += spec.accel * dt * (1 - Math.max(0, car.speed) / spec.topSpeed * 0.8);
    if (input.back) {
      if (car.speed > 0.6) car.speed -= spec.brake * dt;
      else car.speed = Math.max(-10, car.speed - spec.accel * 0.55 * dt);
    }
    car.speed -= car.speed * 0.32 * dt; // drag
    if (!input.forward && !input.back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 2.2 * dt);
    if (input.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), spec.brake * 1.4 * dt);
    car.speed = clamp(car.speed, -10, spec.topSpeed);

    const turnRate = spec.turn * clamp(car.speed / 7, -1, 1) * (input.brake ? 1.35 : 1);
    car.heading += steer * turnRate * dt;
    mesh.rotation.y = car.heading;

    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let nx = mesh.position.x + fx * car.speed * dt;
    let nz = mesh.position.z + fz * car.speed * dt;

    // Buildings: a hard stop, with damage past a walking pace.
    const resolved = resolveCircle(this.city.colliders, nx, nz, 1.7);
    if (resolved.hit) {
      if (Math.abs(car.speed) > 7) this.carCrash(car, Math.abs(car.speed) / spec.topSpeed);
      car.speed *= -0.18;
      nx = resolved.x;
      nz = resolved.z;
    }
    // The sea: only the pier carries a car past the waterline.
    const onPier = Math.abs(nz - LAYOUT.pierZ) < 5.4 && nx > LAYOUT.waterX - 6;
    if (nx > LAYOUT.waterX + 3 && !onPier) {
      this.effects.burst(new THREE.Vector3(nx, 0.6, nz), { count: 26, color: [0.8, 0.92, 1], speed: 4, up: 3.4, life: 0.7 });
      this.audio.crash(0.7);
      car.speed = 0;
      car.health = 0;
      nx = LAYOUT.waterX + 3;
      this.hud.message('The car is drowned. It is not coming back.', '#ff8a7a');
      if (this.state === 'play') this.exitCar();
    }
    mesh.position.x = clamp(nx, -335, 392);
    mesh.position.z = clamp(nz, -335, 335);
    mesh.position.y = groundHeight(mesh.position.x, mesh.position.z);

    // Other cars: shove apart, trade paint, count the crime if it was hard.
    const others = [...this.carPool, ...this.traffic.cars.map((tc) => ({ mesh: tc.mesh, trafficRef: tc }))];
    for (const other of others) {
      if (other.mesh === mesh) continue;
      const dx = other.mesh.position.x - mesh.position.x;
      const dz = other.mesh.position.z - mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 3.7) {
        const push = (3.7 - d) / 2;
        other.mesh.position.x += (dx / d) * push;
        other.mesh.position.z += (dz / d) * push;
        mesh.position.x -= (dx / d) * push;
        mesh.position.z -= (dz / d) * push;
        if (Math.abs(car.speed) > 8) {
          this.carCrash(car, 0.45);
          if (other.trafficRef) { other.trafficRef.speed *= 0.3; other.trafficRef.cruise = 0; }
          if (this.wanted < 5 && this.police.nearestDistance < 55) this.commitCrime(1, 'Hit and run!');
        }
        car.speed *= 0.55;
      }
    }
    // Pedestrians: the crime that brings real heat.
    for (const ped of this.peds.list) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.mesh.position.x - mesh.position.x, ped.mesh.position.z - mesh.position.z);
      if (d < 1.7 && Math.abs(car.speed) > 2) {
        if (ped.knockDown()) {
          this.audio.thud();
          this.effects.burst(ped.mesh.position, { count: 8, color: [0.9, 0.85, 0.8], speed: 2.4, life: 0.4 });
          this.commitCrime(Math.abs(car.speed) > 9 ? 2 : 1, 'Pedestrian down!');
          this.peds.panicNear(mesh.position.x, mesh.position.z, 16);
          car.speed *= 0.82;
          this.damage(2, 'Impact.');
        }
      } else if (d < 5 && Math.abs(car.speed) > 12) ped.panic(mesh.position.x, mesh.position.z);
    }

    // Wheels and smoke.
    const spin = (car.speed * dt) / 0.36;
    for (const wheel of mesh.userData.wheels) wheel.rotation.z -= spin;
    for (const wheel of mesh.userData.frontWheels) wheel.rotation.y = steer * 0.42;
    if (car.health < 35) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.12;
        this.effects.smoke(new THREE.Vector3(mesh.position.x + fx * 1.6, 1, mesh.position.z + fz * 1.6), 1);
      }
    }
    this.playerVel.set(fx * car.speed, 0, fz * car.speed);
    this.playerSpeed = Math.abs(car.speed);
    // The camera settles in behind the car.
    const behind = car.heading + Math.PI;
    this.camYaw += angleDeltaWrap(this.camYaw, behind) * Math.min(1, dt * 3.2);
    this.hud.setSpeed(Math.abs(car.speed) * 3.6);
    this.hud.setCrosshair(false);
  }

  carCrash(car, intensity) {
    this.audio.crash(intensity);
    this.shake = Math.min(1, this.shake + intensity * 0.9);
    this.effects.burst(car.mesh.position, { count: 16, color: [1, 0.72, 0.3], speed: 5, life: 0.45 });
    car.health -= intensity * 26;
    if (car === this.playerCar) this.damage(intensity * 13, 'Crash.');
  }

  // ---- police & wanted ---------------------------------------------------------
  updatePolice(dt) {
    const events = this.police.update(dt, {
      playerPos: this.playerPos,
      playerVel: this.playerVel,
      playerInCar: this.playerInCar,
      playerSpeed: this.playerSpeed,
      colliders: this.city.colliders,
      wanted: this.wanted,
      t: this.time,
    });
    if (events.rammed) {
      this.audio.crash(0.5);
      this.shake = Math.min(1, this.shake + 0.5);
      if (this.playerCar) this.playerCar.speed *= 0.5;
      this.damage(5 + events.rammed * 9, 'Rammed by an Interceptor.');
    }
    if (this.state === 'play' && this.police.bustedMeter >= 1) {
      this.endRun('busted', 'Solaris PD got their collar.');
    }
  }

  updateWanted(dt) {
    this.crimeHeat += dt;
    if (this.wanted === 0) return;
    const nearest = this.police.nearestDistance ?? Infinity;
    if (this.crimeHeat > 12 && nearest > 55) {
      this.decayTimer = (this.decayTimer ?? 0) + dt;
      if (this.decayTimer > 7) {
        this.decayTimer = 0;
        this.wanted -= 1;
        this.hud.setStars(this.wanted);
        this.hud.message(this.wanted === 0 ? 'You lost the heat.' : 'The heat is cooling off…', '#7be495');
        if (this.wanted === 0) this.police.bustedMeter = 0;
      }
    } else this.decayTimer = 0;
    // Health drifts back once the player is out of trouble.
    if (this.crimeHeat > 6 && this.health > 0 && this.health < 100) {
      this.health = Math.min(100, this.health + dt * 3.5);
      this.hud.setHealth(this.health / 100);
    }
  }

  // ---- combat ---------------------------------------------------------------------
  shoot() {
    if (this.shootCooldown > 0 || this.playerInCar) return;
    this.shootCooldown = 0.24;
    this.audio.wake();
    this.audio.shot();
    if (this.wanted < 1) this.commitCrime(1, 'Shots fired!');
    this.peds.panicNear(this.playerPos.x, this.playerPos.z, 17);

    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const hand = this.playerMesh.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    this.effects.flash(hand.add(dir.clone().multiplyScalar(0.6)), 0xffd9a0, 1.5);

    let best = { dist: 80, kind: 'none', obj: null, point: null };
    const testSphere = (center, radius, kind, obj) => {
      const to = center.clone().sub(origin);
      const along = to.dot(dir);
      if (along < 0 || along > best.dist) return;
      const closest = origin.clone().add(dir.clone().multiplyScalar(along));
      if (closest.distanceTo(center) < radius) {
        best = { dist: along, kind, obj, point: closest };
      }
    };
    for (const ped of this.peds.list) {
      if (ped.state === 'down') continue;
      testSphere(ped.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0.62, 'ped', ped);
    }
    for (const car of this.carPool) testSphere(car.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 2.4, 'car', car);
    for (const tc of this.traffic.cars) testSphere(tc.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 2.4, 'traffic', tc);
    for (const unit of this.police.units) testSphere(unit.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 2.4, 'police', unit);
    // Buildings and ground by marching.
    for (let d = 2; d < best.dist; d += 1.2) {
      const p = origin.clone().add(dir.clone().multiplyScalar(d));
      if (p.y < 0) { best = { dist: d, kind: 'ground', obj: null, point: p }; break; }
      const inside = this.city.colliders.some((c) => p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ && p.y < c.h);
      if (inside) { best = { dist: d, kind: 'building', obj: null, point: p }; break; }
    }
    if (!best.point) return;
    this.effects.burst(best.point, { count: 7, color: [1, 0.85, 0.5], speed: 2.6, life: 0.35 });
    if (best.kind === 'ped') {
      best.obj.knockDown();
      this.commitCrime(1, 'Pedestrian shot!');
    } else if (best.kind === 'car') {
      best.obj.health -= 30;
      this.effects.burst(best.point, { count: 12, color: [1, 0.7, 0.3], speed: 4, life: 0.4 });
    } else if (best.kind === 'traffic') {
      best.obj.speed *= 0.3;
      best.obj.cruise = 0;
      this.effects.burst(best.point, { count: 12, color: [1, 0.7, 0.3], speed: 4, life: 0.4 });
    } else if (best.kind === 'police') {
      best.obj.speed *= 0.45;
      this.commitCrime(1, 'Shot at an officer!');
      if (this.wanted < 3) this.setWanted(3, true);
      this.hud.message('You shot at the PD — big mistake.', '#ff8a7a');
    }
  }

  // ---- run end / respawn ------------------------------------------------------------
  endRun(kind, sub) {
    this.state = 'ended';
    this.endedKind = kind;
    const title = document.getElementById('end-title');
    const subEl = document.getElementById('end-sub');
    title.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    title.className = kind;
    let text = sub;
    if (kind === 'busted') {
      const fine = Math.min(this.cash, 120 + this.wanted * 90);
      this.cash -= fine;
      this.hud.setCash(this.cash);
      text = `${sub} The collar cost you $${fine}.`;
    }
    subEl.textContent = text;
    document.getElementById('end-screen').classList.remove('hidden');
    this.setWanted(0, true);
    this.police.bustedMeter = 0;
    this.audio.sting();
    this.audio.setRadio(-1);
    this.audio.setEngine(0, false);
    this.audio.setSiren(0);
    document.exitPointerLock?.();
    this.persist();
  }

  respawn() {
    document.getElementById('end-screen').classList.add('hidden');
    if (this.playerInCar) {
      this.playerInCar = false;
      this.playerCar = null;
      this.playerMesh.visible = true;
    }
    const at = this.endedKind === 'busted' ? { x: 58, z: -58 } : { x: -106, z: -100 };
    this.playerMesh.position.set(at.x, 0, at.z);
    this.health = 100;
    this.hud.setHealth(1);
    this.state = 'play';
    this.hud.message(this.endedKind === 'busted' ? 'Released. The desk sergeant kept your dignity receipt.' : 'Patched up at Bahía Clinic. The bay awaits.', '#7be495');
  }

  // ---- camera & HUD --------------------------------------------------------------------
  updateCamera(dt) {
    if (this.shotCamera) {
      this.camera.position.copy(this.shotCamera.pos);
      this.camera.lookAt(this.shotCamera.look);
      return;
    }
    if (this.state === 'title') {
      const c = this.heroCar.mesh.position;
      const a = this.time * 0.045 + 2.2;
      this.camera.position.set(c.x + Math.sin(a) * 17, 6.2, c.z + Math.cos(a) * 17);
      this.camera.lookAt(c.x, 1.2, c.z);
      if (this.camera.fov !== 55) { this.camera.fov = 55; this.camera.updateProjectionMatrix(); }
      return;
    }
    const target = this.playerPos.clone().add(new THREE.Vector3(0, this.playerInCar ? 1.3 : 1.6, 0));
    const dist = this.camDist;
    const offset = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch),
    ).multiplyScalar(dist);
    const desired = target.clone().add(offset);
    desired.y = Math.max(desired.y, groundHeight(desired.x, desired.z) + 0.55);
    const blend = this.state === 'shot' ? 1 : 1 - Math.exp(-dt * 9);
    this.camera.position.lerp(desired, blend);
    if (this.shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;
      this.shake *= Math.max(0, 1 - dt * 3.2);
    }
    this.camera.lookAt(target);
    // Speed FOV kick in a car.
    const targetFov = this.playerInCar && this.playerCar
      ? 62 + clamp(Math.abs(this.playerCar.speed) / this.playerCar.spec.topSpeed, 0, 1) * 13
      : 62;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = lerp(this.camera.fov, targetFov, Math.min(1, dt * 5));
      this.camera.updateProjectionMatrix();
    }
  }

  updateHudBits() {
    // Interaction prompt.
    let prompt = '';
    if (this.state === 'play') {
      if (this.playerInCar) {
        if (Math.abs(this.playerCar.speed) < 3) prompt = '<b>F</b> Exit car';
      } else {
        const dFixer = Math.hypot(this.fixer.position.x - this.playerPos.x, this.fixer.position.z - this.playerPos.z);
        if (dFixer < 3.2 && !this.missions.active) prompt = '<b>F</b> Talk to Marisol';
        else if (this.nearestDrivableCar()) prompt = '<b>F</b> Enter car';
      }
    }
    this.hud.setPrompt(prompt || null);
    this.hud.drawMinimap({
      player: {
        x: this.playerPos.x, z: this.playerPos.z,
        heading: this.playerInCar ? this.playerCar.heading : this.playerHeading,
      },
      police: this.police.blips(),
      marker: this.missions.currentTarget(),
      fixer: GARAGE,
    }, this.time);
  }

  // ---- shot staging API (shots.js) -------------------------------------------------------
  beginShotMode() {
    this.state = 'shot';
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
  }

  finishShotMode() {
    window.__shotReady = true;
  }

  showTitleScreen() {
    document.getElementById('title-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
  }

  teleportPlayer(x, z, heading) {
    this.playerMesh.position.set(x, groundHeight(x, z), z);
    this.playerHeading = heading;
    this.playerMesh.rotation.y = heading;
    this.camYaw = heading + Math.PI;
  }

  placeHeroCar(x, z, heading) {
    const car = this.heroCar;
    car.mesh.position.set(x, groundHeight(x, z), z);
    car.mesh.rotation.y = heading;
    car.heading = heading;
    car.speed = 0;
    return car;
  }

  enterCarInstant(car) {
    this.playerInCar = true;
    this.playerCar = car;
    this.playerMesh.visible = false;
    this.camDist = 10.5;
    this.camYaw = car.heading + Math.PI;
  }

  spawnShotInterceptor(x, z, heading) {
    return this.police.addStagedUnit(x, z, heading);
  }

  spawnOfficer(x, z, heading) {
    const officer = createPersonMesh(this.rng, { officer: true, skin: 0xd9a06b });
    officer.position.set(x, groundHeight(x, z), z);
    officer.rotation.y = heading;
    this.scene.add(officer);
    return officer;
  }

  setShotCamera(pos, look) {
    this.shotCamera = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) };
    this.camera.position.copy(this.shotCamera.pos);
    this.camera.lookAt(this.shotCamera.look);
  }

  setShotCameraBehindCar(dist, height, side) {
    const car = this.playerCar ?? this.heroCar;
    const p = car.mesh.position;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    const pos = new THREE.Vector3(
      p.x - fx * dist + rx * side * 10, height, p.z - fz * dist + rz * side * 10,
    );
    const look = new THREE.Vector3(p.x + fx * 9, 1.1, p.z + fz * 9);
    this.setShotCamera(pos.toArray(), look.toArray());
  }
}

/** Ground height at a point: the pier deck, its ramp, and everywhere else 0. */
export function groundHeight(x, z) {
  if (Math.abs(z - LAYOUT.pierZ) < 5.5 && x > LAYOUT.waterX - 6 && x < LAYOUT.pierEndX) {
    const t = clamp((x - (LAYOUT.waterX - 6)) / 14, 0, 1);
    return 1.3 * t;
  }
  return 0;
}

function angleDeltaWrap(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

new Game();
