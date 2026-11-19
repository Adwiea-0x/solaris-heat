// effects.js — pooled particles and flashes.
//
// One THREE.Points cloud with a fixed budget of particles does every burst
// in the game — bullet impacts, crash sparks, dust, smoke, water splashes —
// so effects never allocate in the frame loop. A tiny pool of additive
// sprites covers muzzle flashes and police-light glows.

import * as THREE from 'three';

const MAX = 900;

export class Effects {
  constructor(scene) {
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.velocities = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX); // seconds remaining
    this.maxLife = new Float32Array(MAX);
    this.gravity = new Float32Array(MAX);
    this.head = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.32, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    // Park every particle far underground until it is spawned.
    for (let i = 0; i < MAX; i += 1) this.positions[i * 3 + 1] = -100;

    // Flash sprites.
    this.flashes = [];
    const flashTex = makeGlowTexture();
    for (let i = 0; i < 6; i += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flashTex, color: 0xffd9a0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sprite.scale.set(1.6, 1.6, 1);
      scene.add(sprite);
      this.flashes.push({ sprite, life: 0 });
    }
    this.flashHead = 0;
  }

  spawn(x, y, z, vx, vy, vz, life, r, g, b, gravity = -4) {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.velocities[i * 3] = vx;
    this.velocities[i * 3 + 1] = vy;
    this.velocities[i * 3 + 2] = vz;
    this.colors[i * 3] = r;
    this.colors[i * 3 + 1] = g;
    this.colors[i * 3 + 2] = b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
  }

  /** A radial burst: impacts, sparks, dust, splashes. */
  burst(pos, { count = 12, color = [1, 0.8, 0.4], speed = 4, up = 2.5, life = 0.5, gravity = -5 } = {}) {
    for (let n = 0; n < count; n += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(
        pos.x, pos.y, pos.z,
        Math.cos(a) * s, up * Math.random(), Math.sin(a) * s,
        life * (0.5 + Math.random() * 0.8),
        color[0], color[1], color[2], gravity,
      );
    }
  }

  /** Slow grey smoke that rises and drifts: damaged cars, burnout. */
  smoke(pos, amount = 1) {
    for (let n = 0; n < amount; n += 1) {
      const shade = 0.25 + Math.random() * 0.2;
      this.spawn(
        pos.x + (Math.random() - 0.5) * 0.4, pos.y, pos.z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.5, 1.6 + Math.random(), (Math.random() - 0.5) * 0.5,
        1.4 + Math.random(), shade, shade, shade, 1.2,
      );
    }
  }

  /** A one-frame glow at a point: muzzle flash, a spark hit. */
  flash(pos, color = 0xffd9a0, scale = 1.6) {
    const f = this.flashes[this.flashHead];
    this.flashHead = (this.flashHead + 1) % this.flashes.length;
    f.sprite.position.copy(pos);
    f.sprite.material.color.setHex(color);
    f.sprite.scale.set(scale, scale, 1);
    f.life = 0.07;
    f.sprite.material.opacity = 0.95;
  }

  update(dt) {
    for (let i = 0; i < MAX; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -100;
        continue;
      }
      this.velocities[i * 3 + 1] += this.gravity[i] * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      if (this.positions[i * 3 + 1] < 0.05) this.positions[i * 3 + 1] = 0.05;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        f.sprite.material.opacity = Math.max(0, f.life / 0.07) * 0.95;
      } else f.sprite.material.opacity = 0;
    }
  }
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
