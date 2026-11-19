// textures.js — every texture in Solaris Bay is painted on a canvas at load.
//
// No image files ship with the game: facades, road markings, shop signs,
// billboards and the ground plan of the whole city are procedural, drawn with
// the shared seeded generator so a seed always paints the same city.

import * as THREE from 'three';

/** Wrap a canvas in a three.js texture with the game's standard settings. */
function canvasTexture(canvas, { srgb = true, repeat = null } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

/** Paint one building facade: wall colour, a grid of windows, some lit warm. */
export function facadeTexture(rng, palette) {
  const [canvas, g] = makeCanvas(256, 256);
  g.fillStyle = palette.wall;
  g.fillRect(0, 0, 256, 256);
  // Subtle vertical grime so big walls do not read as flat colour.
  for (let i = 0; i < 40; i += 1) {
    g.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.07)})`;
    g.fillRect(rng.range(0, 250), 0, rng.range(2, 7), 256);
  }
  const cols = 6;
  const rows = 8;
  const winW = 256 / cols;
  const winH = 256 / rows;
  for (let x = 0; x < cols; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const lit = rng.chance(0.42);
      g.fillStyle = lit ? palette.lit : palette.glass;
      g.fillRect(x * winW + 6, y * winH + 7, winW - 12, winH - 13);
      if (lit) {
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(x * winW + 6, y * winH + 7, winW - 12, 4);
      }
    }
  }
  // Ground floor: darker band with a shopfront strip.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 256 - winH, 256, winH);
  g.fillStyle = palette.trim;
  g.fillRect(0, 256 - winH - 4, 256, 4);
  return canvasTexture(canvas);
}

/** A rooftop skin: gravel grey with a darker parapet edge. */
export function roofTexture(rng) {
  const [canvas, g] = makeCanvas(128, 128);
  g.fillStyle = '#4c4542';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i += 1) {
    g.fillStyle = `rgba(${rng.int(0, 60)},${rng.int(0, 50)},${rng.int(0, 40)},0.25)`;
    g.fillRect(rng.range(0, 127), rng.range(0, 127), 2, 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 8;
  g.strokeRect(0, 0, 128, 128);
  return canvasTexture(canvas);
}

/** A glowing shop sign: bold lettering on a dark board, drawn to glow. */
export function signTexture(text, hue) {
  const [canvas, g] = makeCanvas(512, 128);
  g.fillStyle = '#14100e';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = `hsl(${hue}, 90%, 60%)`;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.font = 'bold 64px Verdana, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = `hsl(${hue}, 95%, 60%)`;
  g.shadowBlur = 26;
  g.fillStyle = `hsl(${hue}, 95%, 72%)`;
  g.fillText(text, 256, 68);
  g.shadowBlur = 0;
  return canvasTexture(canvas);
}

/** A billboard face: big gradient art, a headline and a smaller strapline. */
export function billboardTexture(rng, headline, strapline, hueA, hueB) {
  const [canvas, g] = makeCanvas(512, 256);
  const grad = g.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, `hsl(${hueA}, 75%, 55%)`);
  grad.addColorStop(1, `hsl(${hueB}, 80%, 38%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  // Sun disc and palm silhouettes: instant coastal mood.
  g.fillStyle = 'rgba(255,236,180,0.9)';
  g.beginPath();
  g.arc(408, 74, 40, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(20,16,30,0.85)';
  for (const baseX of [52, 452]) {
    g.fillRect(baseX, 150, 7, 106);
    for (let f = 0; f < 6; f += 1) {
      const a = (f / 6) * Math.PI * 2 + rng.range(-0.2, 0.2);
      g.beginPath();
      g.ellipse(baseX + 3 + Math.cos(a) * 30, 148 + Math.sin(a) * 10 - 4, 34, 9, a, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.font = 'bold 54px Verdana, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 8;
  g.fillText(headline, 256, 108);
  g.font = 'bold 27px Verdana, sans-serif';
  g.fillText(strapline, 256, 152);
  g.shadowBlur = 0;
  return canvasTexture(canvas);
}

/** The sunset sky dome gradient, painted once: indigo zenith to ember horizon. */
export function skyTexture() {
  const [canvas, g] = makeCanvas(64, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#2c2a55');
  grad.addColorStop(0.42, '#7a4a72');
  grad.addColorStop(0.68, '#c95f4e');
  grad.addColorStop(0.85, '#f59a52');
  grad.addColorStop(1.0, '#ffc978');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 512);
  return canvasTexture(canvas);
}

/**
 * The whole city ground plan on one big canvas: blocks, sidewalks, asphalt
 * roads with lane dashes and crosswalks, the beach and the shallows. Drawn in
 * world space by `layout` so the 3D ground and the minimap agree exactly.
 */
export function groundTexture(layout) {
  const size = 2048;
  const [canvas, g] = makeCanvas(size, size);
  const scale = size / layout.worldSize;
  const toPx = (v) => (v - layout.min) * scale;

  // Base: city block ground (warm concrete).
  g.fillStyle = '#8d8378';
  g.fillRect(0, 0, size, size);

  // Beach sand east of the city edge, then water handled by its own plane;
  // here the sand strip only.
  g.fillStyle = '#e8c188';
  g.fillRect(toPx(layout.beachX), 0, toPx(layout.max) - toPx(layout.beachX), size);
  // Wet sand sheen near the waterline.
  g.fillStyle = 'rgba(255,240,210,0.35)';
  g.fillRect(toPx(layout.waterX) - 26 * scale * 0.14, 0, 4, size);

  // Sidewalk slabs around every block.
  g.fillStyle = '#a89c8c';
  for (const block of layout.blocks) {
    g.fillRect(
      toPx(block.x - layout.blockSize / 2 - 2.4),
      toPx(block.z - layout.blockSize / 2 - 2.4),
      (layout.blockSize + 4.8) * scale,
      (layout.blockSize + 4.8) * scale,
    );
  }
  // Block interiors: plaza paving with a hint of variation.
  for (const block of layout.blocks) {
    g.fillStyle = block.tint;
    g.fillRect(
      toPx(block.x - layout.blockSize / 2),
      toPx(block.z - layout.blockSize / 2),
      layout.blockSize * scale,
      layout.blockSize * scale,
    );
  }

  // Roads: asphalt over everything between blocks.
  g.fillStyle = '#3d3a40';
  for (const x of layout.roadXs) g.fillRect(toPx(x - layout.roadWidth / 2), 0, layout.roadWidth * scale, size);
  for (const z of layout.roadZs) g.fillRect(0, toPx(z - layout.roadWidth / 2), size, layout.roadWidth * scale);

  // Centre dashes.
  g.fillStyle = '#e8c96a';
  const dash = 3 * scale;
  for (const x of layout.roadXs) {
    for (let z = layout.min; z < layout.max; z += dash * 2) g.fillRect(toPx(x) - 1.5, toPx(z), 3, dash);
  }
  for (const z of layout.roadZs) {
    for (let x = layout.min; x < layout.max; x += dash * 2) g.fillRect(toPx(x), toPx(z) - 1.5, dash, 3);
  }

  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(240,240,235,0.75)';
  for (const x of layout.roadXs) {
    for (const z of layout.roadZs) {
      for (let s = -3; s <= 3; s += 1) {
        g.fillRect(toPx(x - layout.roadWidth / 2 + 0.8), toPx(z + s * 1.6 - 0.55), 1.6 * scale, 1.1 * scale);
        g.fillRect(toPx(x + layout.roadWidth / 2 - 2.4), toPx(z + s * 1.6 - 0.55), 1.6 * scale, 1.1 * scale);
        g.fillRect(toPx(x + s * 1.6 - 0.55), toPx(z - layout.roadWidth / 2 + 0.8), 1.1 * scale, 1.6 * scale);
        g.fillRect(toPx(x + s * 1.6 - 0.55), toPx(z + layout.roadWidth / 2 - 2.4), 1.1 * scale, 1.6 * scale);
      }
    }
  }

  // The coast road promenade: a lighter walking strip along the beach.
  g.fillStyle = '#c9b294';
  g.fillRect(toPx(layout.beachX - 3), 0, 3 * scale, size);

  return canvasTexture(canvas);
}

/** A palm frond sprite: full, sunlit leaflets on a curved rib, alpha-tested. */
export function frondTexture() {
  const [canvas, g] = makeCanvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  // Leaflets first, fanned wide and drooping, in two sunlit greens so the
  // crown reads as foliage against the sky instead of dark scratches.
  for (let i = 0; i < 30; i += 1) {
    const t = i / 30;
    const x = 6 + (246 - 6) * t;
    const y = 250 - 208 * t + 34 * t * t;
    g.strokeStyle = i % 3 === 0 ? '#5cb85f' : i % 3 === 1 ? '#43a047' : '#36823c';
    g.lineWidth = 6.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 16, y + 26 - t * 10, x + 10, y + 62 - t * 26);
    g.stroke();
    // A shorter leaflet angled up, for fullness near the rib.
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 22, y + 6, x + 30, y + 26 - t * 8);
    g.stroke();
  }
  // The rib on top, so the leaflets hang from it.
  g.strokeStyle = '#2f7a38';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(6, 250);
  g.quadraticCurveTo(90, 118, 246, 42);
  g.stroke();
  const texture = canvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}
