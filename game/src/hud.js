// hud.js — everything the player reads: health, cash, wanted stars, the
// objective line, the message feed, prompts, banners, and the canvas
// minimap. The minimap is drawn from the same LAYOUT the city is built
// from, so the map can never disagree with the streets.

import { LAYOUT } from './city.js';

const MAP_MIN_X = -190;
const MAP_MAX_X = 340;
const MAP_MIN_Z = -190;
const MAP_MAX_Z = 190;

export class HUD {
  constructor() {
    this.el = {};
    for (const id of [
      'health-fill', 'cash', 'stars', 'objective', 'feed', 'prompt', 'speedo',
      'radio-label', 'banner', 'banner-title', 'banner-sub', 'crosshair',
      'damage-vignette', 'minimap',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.starSpans = [...this.el.stars.children];
    this.lastCash = null;
    this.lastStars = -1;
    this.bannerTimer = 0;
  }

  setHealth(frac) {
    const pct = Math.max(0, Math.min(1, frac)) * 100;
    this.el['health-fill'].style.width = `${pct}%`;
    this.el['health-fill'].style.background = frac < 0.3 ? '#e23b2e' : frac < 0.6 ? '#f2a13d' : '#53d769';
  }

  flashDamage() {
    const v = this.el['damage-vignette'];
    v.style.opacity = '0.55';
    setTimeout(() => { v.style.opacity = '0'; }, 130);
  }

  setCash(amount) {
    if (amount === this.lastCash) return;
    this.lastCash = amount;
    this.el.cash.textContent = `$${amount.toLocaleString('en-US')}`;
  }

  setStars(n) {
    if (n === this.lastStars) return;
    this.lastStars = n;
    this.starSpans.forEach((span, i) => {
      span.classList.toggle('lit', i < n);
    });
    this.el.stars.style.opacity = n > 0 ? '1' : '0.25';
  }

  setObjective(text) {
    // Objective lines carry <b> highlights; every string is the game's own.
    this.el.objective.innerHTML = text ?? '';
    this.el.objective.style.display = text ? 'block' : 'none';
  }

  /** A short-lived line in the bottom-left feed. */
  message(text, accent = '#ffd98a') {
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.style.borderLeftColor = accent;
    line.textContent = text;
    const feed = this.el.feed;
    feed.appendChild(line);
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    setTimeout(() => { line.style.opacity = '0'; }, 4200);
    setTimeout(() => { line.remove(); }, 4900);
  }

  /** The big centre banner: mission titles, completions, warnings. */
  banner(title, sub = '') {
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub;
    this.el.banner.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { this.el.banner.style.opacity = '0'; }, 2800);
  }

  setPrompt(text) {
    this.el.prompt.textContent = text ?? '';
    this.el.prompt.style.display = text ? 'block' : 'none';
  }

  setSpeed(kmh) {
    this.el.speedo.textContent = kmh === null ? '' : `${Math.round(kmh)} km/h`;
  }

  setRadio(name) {
    this.el['radio-label'].textContent = name ? `♪ ${name}` : '';
  }

  setCrosshair(on) {
    this.el.crosshair.style.display = on ? 'block' : 'none';
  }

  // ---- minimap -------------------------------------------------------------
  mapPoint(x, z) {
    const s = this.el.minimap.width / (MAP_MAX_X - MAP_MIN_X);
    return [(x - MAP_MIN_X) * s, (z - MAP_MIN_Z) * s];
  }

  drawMinimap(view, t) {
    const g = this.mapCtx;
    const W = this.el.minimap.width;
    const H = this.el.minimap.height;
    const s = W / (MAP_MAX_X - MAP_MIN_X);
    g.clearRect(0, 0, W, H);

    // Water, then sand, then the city slab.
    g.fillStyle = '#175263';
    g.fillRect(0, 0, W, H);
    let [sx] = this.mapPoint(LAYOUT.beachX, 0);
    g.fillStyle = '#e8c188';
    g.fillRect(sx, 0, W - sx, H);
    const [cx0, cz0] = this.mapPoint(-LAYOUT.cityEdge, -LAYOUT.cityEdge);
    const [cx1, cz1] = this.mapPoint(LAYOUT.cityEdge, LAYOUT.cityEdge);
    g.fillStyle = '#7d7466';
    g.fillRect(cx0, cz0, cx1 - cx0, cz1 - cz0);

    // Roads.
    g.strokeStyle = '#3d3a40';
    g.lineWidth = Math.max(1.5, LAYOUT.roadWidth * s);
    for (const rx of LAYOUT.roadXs) {
      const [px] = this.mapPoint(rx, 0);
      g.beginPath(); g.moveTo(px, cz0); g.lineTo(px, cz1); g.stroke();
    }
    for (const rz of LAYOUT.roadZs) {
      const [, pz] = this.mapPoint(0, rz);
      g.beginPath(); g.moveTo(cx0, pz); g.lineTo(cx1, pz); g.stroke();
    }
    // Pier.
    const [pierX0, pierY] = this.mapPoint(LAYOUT.waterX, LAYOUT.pierZ);
    const [pierX1] = this.mapPoint(LAYOUT.pierEndX, LAYOUT.pierZ);
    g.strokeStyle = '#c9b294';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(pierX0, pierY); g.lineTo(pierX1, pierY); g.stroke();

    // Mission / fare marker: a pulsing gold diamond in a white ring.
    if (view.marker) {
      const [mx, my] = this.mapPoint(view.marker.x, view.marker.z);
      const pulse = 4.5 + Math.sin(t * 5) * 1.4;
      g.fillStyle = view.marker.kind === 'taxi' ? '#53d769' : '#ffd02a';
      g.save();
      g.translate(mx, my);
      g.rotate(Math.PI / 4);
      g.fillRect(-pulse / 1.4, -pulse / 1.4, pulse * 1.4, pulse * 1.4);
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 1.4;
      g.beginPath(); g.arc(mx, my, pulse + 2.6, 0, Math.PI * 2); g.stroke();
    }
    // The fixer's garage: a violet dot.
    if (view.fixer) {
      const [fx, fy] = this.mapPoint(view.fixer.x, view.fixer.z);
      g.fillStyle = '#c77dff';
      g.beginPath(); g.arc(fx, fy, 3, 0, Math.PI * 2); g.fill();
    }
    // Police: blue squares that flash red, as on every good crime HUD.
    for (const cop of view.police) {
      const [px, py] = this.mapPoint(cop.x, cop.z);
      g.fillStyle = Math.sin(t * 9) > 0 ? '#ff4030' : '#3d8bff';
      g.fillRect(px - 2.6, py - 2.6, 5.2, 5.2);
    }
    // Player arrow.
    const [px, py] = this.mapPoint(view.player.x, view.player.z);
    g.save();
    g.translate(px, py);
    // The map's y axis runs with +z, so a world heading turns the arrow by PI - heading.
    g.rotate(Math.PI - view.player.heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.beginPath();
    g.moveTo(0, -6.5);
    g.lineTo(4.4, 5);
    g.lineTo(0, 2.4);
    g.lineTo(-4.4, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
