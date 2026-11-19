// city.js — Solaris Bay itself.
//
// A six-by-six-block coastal city generated from the shared seed: pastel
// towers with lit windows, ground-floor shops with glowing signs, rooftop
// and roadside billboards, palms, streetlights, working traffic lights, a
// beach with umbrellas and a lifeguard tower, and a pier reaching into the
// bay. The same layout object drives the ground texture and the minimap, so
// what the player sees from the street matches the map exactly.

import * as THREE from 'three';
import { Rng } from './rng.js';
import { facadeTexture, roofTexture, signTexture, billboardTexture, groundTexture, frondTexture } from './textures.js';

const BLOCK = 38; // block interior, metres
const ROAD = 14; // road width, metres
const PITCH = BLOCK + ROAD; // 52
const HALF_GRID = (5 * PITCH) / 2; // block centres run -130..130

export const LAYOUT = buildLayout();

function buildLayout() {
  const tintRng = new Rng(90210);
  const tints = ['#9b8f7d', '#a3937f', '#8f8672', '#a89a80', '#968a76', '#9d9083'];
  const blocks = [];
  for (let i = 0; i < 6; i += 1) {
    for (let j = 0; j < 6; j += 1) {
      blocks.push({ x: -HALF_GRID + i * PITCH, z: -HALF_GRID + j * PITCH, tint: tintRng.pick(tints) });
    }
  }
  const roadXs = [];
  const roadZs = [];
  for (let k = 0; k < 7; k += 1) {
    roadXs.push(-HALF_GRID - PITCH / 2 + k * PITCH);
    roadZs.push(-HALF_GRID - PITCH / 2 + k * PITCH);
  }
  return {
    blocks,
    roadXs,
    roadZs,
    blockSize: BLOCK,
    roadWidth: ROAD,
    pitch: PITCH,
    cityEdge: 170, // buildings stop here; the promenade begins
    beachX: 176, // sand starts
    waterX: 202, // waterline
    pierZ: 0,
    pierEndX: 296,
    min: -360,
    max: 400,
    worldSize: 760,
  };
}

/** True when (x, z) sits on any road (not on a block, beach or water). */
export function isOnRoad(x, z) {
  if (x > LAYOUT.cityEdge) return false;
  const onX = LAYOUT.roadXs.some((rx) => Math.abs(x - rx) < ROAD / 2);
  const onZ = LAYOUT.roadZs.some((rz) => Math.abs(z - rz) < ROAD / 2);
  return onX || onZ;
}

const FACADES = [
  { wall: '#eec39f', glass: '#31435c', lit: '#ffd98a', trim: '#b3543f' },
  { wall: '#f2ddab', glass: '#2e4055', lit: '#ffe3a1', trim: '#3f7d8c' },
  { wall: '#b7d8cf', glass: '#2c3e50', lit: '#ffd98a', trim: '#c96f4a' },
  { wall: '#e9dcf2', glass: '#37455e', lit: '#ffdf9e', trim: '#7d5ba6' },
  { wall: '#f4c6c0', glass: '#31435c', lit: '#ffe0a3', trim: '#4a7d5b' },
  { wall: '#cfe0ea', glass: '#2e4055', lit: '#ffd98a', trim: '#b3543f' },
];

const SHOP_NAMES = [
  'VEGA MOTORS', 'BODEGA SOL', 'CAFÉ BRISA', 'TACO MAREA', 'HOTEL LUMEN',
  'FARMACIA MAR', 'GYM TITAN', 'LICORES OLA', 'PANADERÍA SOL', 'BAR NEPTUNO',
  'JOYAS CORAL', 'MERCADO 9', 'CINE BAHÍA', 'FLORISTERÍA LUNA',
];

const BILLBOARDS = [
  ['SOLARIS COLA', 'Taste the sunset', 12, 200],
  ['HOTEL LUMEN', 'Sleep by the sea', 190, 160],
  ['VEGA MOTORS', 'Your next ride awaits', 265, 320],
  ['BANCO DEL MAR', 'Bank on the bay', 150, 20],
  ['OLA ENERGY', 'Fuel the night', 35, 280],
  ['CORAL CLUB', 'Luck lives here', 320, 130],
];

/** Traffic light controller: cycles the two axes and swaps lamp materials. */
class TrafficLights {
  constructor(heads) {
    this.heads = heads; // { lampsNS: [r,y,g], lampsEW: [r,y,g] } per intersection
    this.cycle = 19; // seconds: 8 green, 1.5 yellow, 8 green, 1.5 yellow
  }

  /** 'green' | 'yellow' | 'red' for travel along the z axis (north-south). */
  stateForZAxis(t) {
    const p = t % this.cycle;
    if (p < 8) return 'green';
    if (p < 9.5) return 'yellow';
    return 'red';
  }

  stateForXAxis(t) {
    const p = t % this.cycle;
    if (p < 9.5) return 'red';
    if (p < 17.5) return 'green';
    return 'yellow';
  }

  update(t) {
    const ns = this.stateForZAxis(t);
    const ew = this.stateForXAxis(t);
    for (const head of this.heads) {
      setLamps(head.ns, ns);
      setLamps(head.ew, ew);
    }
  }
}

const LAMP_OFF = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.6 });
const LAMP_RED = new THREE.MeshStandardMaterial({ color: 0x330d0d, emissive: 0xff2a22, emissiveIntensity: 2.4 });
const LAMP_YEL = new THREE.MeshStandardMaterial({ color: 0x332a0d, emissive: 0xffb02a, emissiveIntensity: 2.4 });
const LAMP_GRN = new THREE.MeshStandardMaterial({ color: 0x0d3316, emissive: 0x2aff5e, emissiveIntensity: 2.4 });

function setLamps(lamps, state) {
  lamps[0].material = state === 'red' ? LAMP_RED : LAMP_OFF;
  lamps[1].material = state === 'yellow' ? LAMP_YEL : LAMP_OFF;
  lamps[2].material = state === 'green' ? LAMP_GRN : LAMP_OFF;
}

function makeTrafficHead() {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.7, metalness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.6, 6), poleMat);
  pole.position.y = 2.3;
  group.add(pole);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.34), poleMat);
  box.position.y = 5.1;
  group.add(box);
  const ns = [];
  const ew = [];
  for (let i = 0; i < 3; i += 1) {
    const lampNS = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), LAMP_OFF);
    lampNS.position.set(0, 5.5 - i * 0.4, 0.2);
    group.add(lampNS);
    ns.push(lampNS);
    const lampEW = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), LAMP_OFF);
    lampEW.position.set(0.2, 5.5 - i * 0.4, 0);
    group.add(lampEW);
    ew.push(lampEW);
  }
  return { group, ns, ew };
}

/** Build the whole city into `scene`. Returns colliders and live systems. */
export function buildCity(scene, rng) {
  const colliders = [];
  const addCollider = (cx, cz, w, d, h) => {
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h });
  };

  // ---- ground + water -------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(LAYOUT.worldSize, LAYOUT.worldSize),
    new THREE.MeshStandardMaterial({ map: groundTexture(LAYOUT), roughness: 0.94 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((LAYOUT.min + LAYOUT.max) / 2, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x1a6d7e, specular: 0xffc98a, shininess: 90, transparent: true, opacity: 0.86,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(420, 780), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(LAYOUT.waterX + 190, 0.22, 0);
  scene.add(water);

  // ---- buildings --------------------------------------------------------
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTexture(rng), roughness: 0.95 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x35302c, roughness: 1 });
  const facadeMats = FACADES.map((palette) => {
    const map = facadeTexture(rng, palette);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.85 });
  });
  const signMats = SHOP_NAMES.map((name, i) => new THREE.MeshStandardMaterial({
    map: signTexture(name, (i * 47) % 360),
    emissive: 0xffffff,
    emissiveMap: signTexture(name, (i * 47) % 360),
    emissiveIntensity: 0.85,
    roughness: 0.6,
  }));
  const boxGeoCache = new Map();
  const boxGeo = (w, h, d) => {
    const key = `${w}|${h}|${d}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return boxGeoCache.get(key);
  };

  let signIndex = 0;
  for (const block of LAYOUT.blocks) {
    const distCentre = Math.hypot(block.x, block.z);
    const tall = distCentre < 120;
    const pattern = rng.int(0, 2); // 0 tower, 1 quad, 2 slabs
    const spots = [];
    if (pattern === 0) spots.push([0, 0, BLOCK - 10, BLOCK - 10]);
    if (pattern === 1) {
      const s = BLOCK / 2 - 4;
      spots.push([-s / 2 - 1, -s / 2 - 1, s, s], [s / 2 + 1, -s / 2 - 1, s, s], [-s / 2 - 1, s / 2 + 1, s, s], [s / 2 + 1, s / 2 + 1, s, s]);
    }
    if (pattern === 2) {
      spots.push([0, -BLOCK / 4, BLOCK - 8, BLOCK / 2 - 6], [0, BLOCK / 4, BLOCK - 8, BLOCK / 2 - 6]);
    }
    for (const [ox, oz, w, d] of spots) {
      const h = tall ? rng.range(22, 46) : rng.range(9, 26);
      const mat = rng.pick(facadeMats);
      const mesh = new THREE.Mesh(boxGeo(w, h, d), [mat, mat, roofMat, darkMat, mat, mat]);
      mesh.position.set(block.x + ox, h / 2, block.z + oz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      addCollider(block.x + ox, block.z + oz, w, d, h);

      // Rooftop props on some towers: AC boxes and a water tank.
      if (h > 16 && rng.chance(0.7)) {
        const ac = new THREE.Mesh(boxGeo(rng.range(2, 4), 1.2, rng.range(2, 3)), darkMat);
        ac.position.set(block.x + ox + rng.range(-w / 4, w / 4), h + 0.6, block.z + oz + rng.range(-d / 4, d / 4));
        ac.castShadow = true;
        scene.add(ac);
      }
      if (h > 30 && rng.chance(0.4)) {
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 1.6, 3.4, 10),
          new THREE.MeshStandardMaterial({ color: 0x7a4a38, roughness: 0.9 }),
        );
        tank.position.set(block.x + ox + w / 4, h + 1.7, block.z + oz - d / 4);
        tank.castShadow = true;
        scene.add(tank);
      }

      // Ground-floor shop sign facing the nearest road, on some buildings.
      if (h < 30 && rng.chance(0.55)) {
        const mat2 = signMats[signIndex % signMats.length];
        signIndex += 1;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.8, 11), 2.2), mat2);
        const faceEast = Math.abs(ox) >= Math.abs(oz);
        if (faceEast) {
          sign.position.set(block.x + ox + Math.sign(ox || 1) * (w / 2 + 0.06), 3.6, block.z + oz);
          sign.rotation.y = Math.sign(ox || 1) * Math.PI / 2;
        } else {
          sign.position.set(block.x + ox, 3.6, block.z + oz + Math.sign(oz || 1) * (d / 2 + 0.06));
          sign.rotation.y = Math.sign(oz || 1) > 0 ? 0 : Math.PI;
        }
        scene.add(sign);
        // A striped awning under the sign.
        const awning = new THREE.Mesh(
          boxGeo(Math.min(w * 0.8, 11), 0.18, 1.6),
          new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rng.next(), 0.55, 0.45), roughness: 0.8 }),
        );
        if (faceEast) {
          awning.position.set(block.x + ox + Math.sign(ox || 1) * (w / 2 + 0.8), 2.6, block.z + oz);
        } else {
          awning.position.set(block.x + ox, 2.6, block.z + oz + Math.sign(oz || 1) * (d / 2 + 0.8));
        }
        scene.add(awning);
      }
    }
  }

  // ---- billboards -------------------------------------------------------
  const billboardMats = BILLBOARDS.map(([head, strap, ha, hb]) => new THREE.MeshStandardMaterial({
    map: billboardTexture(rng, head, strap, ha, hb),
    emissive: 0xffffff,
    emissiveMap: billboardTexture(rng, head, strap, ha, hb),
    emissiveIntensity: 0.35,
    roughness: 0.7,
    side: THREE.DoubleSide,
  }));
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.7, metalness: 0.5 });
  const billboardSpots = [
    [166, -120, -Math.PI / 2], [166, 60, -Math.PI / 2], [-60, -166, 0], [80, 166, Math.PI],
    [-166, -40, Math.PI / 2], [166, 140, -Math.PI / 2],
  ];
  billboardSpots.forEach(([x, z, ry], i) => {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 11, 8), poleMat);
    pole.position.y = 5.5;
    pole.castShadow = true;
    group.add(pole);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(13, 6, 0.4), billboardMats[i % billboardMats.length]);
    panel.position.y = 13.5;
    panel.castShadow = true;
    group.add(panel);
    group.position.set(x, 0, z);
    group.rotation.y = ry;
    scene.add(group);
    addCollider(x, z, 1, 1, 11);
  });

  // ---- palms (instanced) --------------------------------------------------
  const palmSpots = [];
  for (let z = -160; z <= 160; z += 16) palmSpots.push([LAYOUT.beachX + rng.range(2, 9), z + rng.range(-3, 3)]);
  for (const rx of LAYOUT.roadXs) for (let z = -150; z <= 150; z += 52) palmSpots.push([rx + 8.6, z + rng.range(-2, 2)]);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 7, 6);
  trunkGeo.translate(0, 3.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const frondGeo = new THREE.PlaneGeometry(4.6, 4.6);
  frondGeo.translate(2.1, 0, 0);
  const frondMat = new THREE.MeshStandardMaterial({
    map: frondTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9,
  });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 6);
  const dummy = new THREE.Object3D();
  palmSpots.forEach(([x, z], i) => {
    const lean = rng.range(0.02, 0.1);
    const leanDir = rng.range(0, Math.PI * 2);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(Math.cos(leanDir) * lean, 0, Math.sin(leanDir) * lean);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    const topX = x + Math.sin(leanDir) * lean * 7 * -1;
    const topZ = z + Math.cos(leanDir) * lean * 7;
    for (let f = 0; f < 6; f += 1) {
      dummy.position.set(topX, 7.1, topZ);
      dummy.rotation.set(-0.5 - rng.range(0, 0.35), (f / 6) * Math.PI * 2 + rng.range(-0.2, 0.2), 0.25);
      dummy.updateMatrix();
      fronds.setMatrixAt(i * 6 + f, dummy.matrix);
    }
  });
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(fronds);

  // ---- streetlights (instanced) ------------------------------------------
  const lampSpots = [];
  for (const rx of LAYOUT.roadXs) for (let z = -156; z <= 156; z += 39) lampSpots.push([rx + 7.6, z, -1]);
  for (const rz of LAYOUT.roadZs) for (let x = -156; x <= 156; x += 39) lampSpots.push([x, rz + 7.6, 0]);
  const lampPoleGeo = new THREE.CylinderGeometry(0.07, 0.09, 5.6, 6);
  lampPoleGeo.translate(0, 2.8, 0);
  const lampPoles = new THREE.InstancedMesh(lampPoleGeo, poleMat, lampSpots.length);
  const lampHeadGeo = new THREE.BoxGeometry(1.5, 0.16, 0.4);
  const lampHeadMat = new THREE.MeshStandardMaterial({
    color: 0x444444, emissive: 0xffc37a, emissiveIntensity: 1.6,
  });
  const lampHeads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lampSpots.length);
  lampSpots.forEach(([x, z, axis], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    lampPoles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x - (axis === -1 ? 0.6 : 0), 5.6, z - (axis === 0 ? 0.6 : 0));
    dummy.rotation.set(0, axis === 0 ? Math.PI / 2 : 0, 0);
    dummy.updateMatrix();
    lampHeads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(lampPoles);
  scene.add(lampHeads);

  // ---- street furniture: hydrants, bus shelters, promenade planters -------
  const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xd23b2e, roughness: 0.55 });
  const hydrantGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.62, 8);
  for (const rx of LAYOUT.roadXs) {
    for (const rz of LAYOUT.roadZs) {
      if (!rng.chance(0.4)) continue;
      const hydrant = new THREE.Mesh(hydrantGeo, hydrantMat);
      hydrant.position.set(rx + 8.3, 0.31, rz - 8.3);
      hydrant.castShadow = true;
      scene.add(hydrant);
    }
  }
  const shelterMat = new THREE.MeshStandardMaterial({ color: 0x2a9db5, roughness: 0.6, metalness: 0.3 });
  for (const sz of [-78, 0, 78]) {
    const shelter = new THREE.Group();
    for (const px of [-2.2, 2.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.5, 0.14), shelterMat);
      post.position.set(px, 1.25, 0);
      shelter.add(post);
    }
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.14, 1.7), shelterMat);
    roofSlab.position.y = 2.55;
    roofSlab.castShadow = true;
    shelter.add(roofSlab);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.5), darkMat);
    bench.position.set(0, 0.62, -0.3);
    shelter.add(bench);
    const adPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.9),
      new THREE.MeshStandardMaterial({ map: billboardTexture(rng, 'BUS SOL', 'Ride the bay', 190, 150), roughness: 0.7 }),
    );
    adPanel.position.set(-2.9, 1.15, 0);
    adPanel.rotation.y = Math.PI / 2;
    shelter.add(adPanel);
    shelter.position.set(163.5, 0, sz);
    scene.add(shelter);
    addCollider(163.5, sz, 1.4, 5.4, 2.5);
  }
  const planterMat = new THREE.MeshStandardMaterial({ color: 0xb8a88e, roughness: 0.95 });
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x3e7d3a, roughness: 1 });
  for (let z = -156; z <= 156; z += 26) {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 1.6), planterMat);
    planter.position.set(173.5, 0.28, z);
    scene.add(planter);
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), shrubMat);
    shrub.position.set(173.5, 0.95, z);
    shrub.castShadow = true;
    scene.add(shrub);
  }

  // ---- traffic lights ------------------------------------------------------
  const heads = [];
  for (const rx of LAYOUT.roadXs) {
    for (const rz of LAYOUT.roadZs) {
      const head = makeTrafficHead();
      head.group.position.set(rx + 8.2, 0, rz + 8.2);
      scene.add(head.group);
      heads.push(head);
    }
  }
  const trafficLights = new TrafficLights(heads);

  // ---- beach + pier ---------------------------------------------------------
  const umbrellaMat = new THREE.MeshStandardMaterial({ color: 0xe2543e, roughness: 0.8 });
  const umbrellaMat2 = new THREE.MeshStandardMaterial({ color: 0x2a9db5, roughness: 0.8 });
  for (let i = 0; i < 14; i += 1) {
    const ux = LAYOUT.beachX + rng.range(4, 18);
    const uz = rng.range(-160, 160);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), poleMat);
    pole.position.set(ux, 1.2, uz);
    scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8), i % 2 ? umbrellaMat : umbrellaMat2);
    top.position.set(ux, 2.5, uz);
    top.castShadow = true;
    scene.add(top);
  }
  // Lifeguard tower.
  const tower = new THREE.Group();
  const legMat = new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.8 });
  for (const [lx, lz] of [[-1.2, -1], [1.2, -1], [-1.2, 1], [1.2, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 0.22), legMat);
    leg.position.set(lx, 1.7, lz);
    tower.add(leg);
  }
  const hut = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 2.6), new THREE.MeshStandardMaterial({ color: 0xe2543e, roughness: 0.8 }));
  hut.position.y = 4.4;
  hut.castShadow = true;
  tower.add(hut);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1, 4), legMat);
  roof.position.y = 5.9;
  roof.rotation.y = Math.PI / 4;
  tower.add(roof);
  tower.position.set(LAYOUT.beachX + 8, 0, -52);
  scene.add(tower);
  addCollider(LAYOUT.beachX + 8, -52, 3.4, 2.8, 5);

  // Pier: deck, posts, rails, lamps and the entrance arch.
  const pier = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x9a7a56, roughness: 0.95 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(LAYOUT.pierEndX - LAYOUT.waterX + 8, 0.5, 11), deckMat);
  deck.position.set((LAYOUT.waterX + LAYOUT.pierEndX) / 2 + 2, 1.05, LAYOUT.pierZ);
  deck.castShadow = true;
  deck.receiveShadow = true;
  pier.add(deck);
  for (let x = LAYOUT.waterX - 2; x < LAYOUT.pierEndX; x += 11) {
    for (const side of [-4.6, 4.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 7), deckMat);
      post.position.set(x, 0, LAYOUT.pierZ + side);
      pier.add(post);
    }
  }
  const railMat = new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.7 });
  for (const side of [-5.3, 5.3]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(LAYOUT.pierEndX - LAYOUT.waterX + 8, 0.12, 0.12), railMat);
    rail.position.set((LAYOUT.waterX + LAYOUT.pierEndX) / 2 + 2, 2.15, LAYOUT.pierZ + side);
    pier.add(rail);
  }
  const archMat = new THREE.MeshStandardMaterial({
    map: signTexture('SOLARIS PIER', 190), emissive: 0xffffff,
    emissiveMap: signTexture('SOLARIS PIER', 190), emissiveIntensity: 0.7,
  });
  const arch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 13), archMat);
  arch.position.set(LAYOUT.waterX - 2, 4.4, LAYOUT.pierZ);
  pier.add(arch);
  for (const side of [-6.2, 6.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 5.4, 7), railMat);
    post.position.set(LAYOUT.waterX - 2, 2.7, LAYOUT.pierZ + side);
    pier.add(post);
  }
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 5), new THREE.MeshStandardMaterial({ color: 0x2a9db5, roughness: 0.8 }));
  kiosk.position.set(LAYOUT.pierEndX - 4, 3, LAYOUT.pierZ);
  kiosk.castShadow = true;
  pier.add(kiosk);
  scene.add(pier);
  addCollider(LAYOUT.pierEndX - 4, LAYOUT.pierZ, 5, 5, 3.4);

  return {
    colliders,
    trafficLights,
    water,
    update(dt, t) {
      water.position.y = 0.22 + Math.sin(t * 0.7) * 0.04;
      trafficLights.update(t);
    },
  };
}
