import * as THREE from 'three';
import type { BoxMaterialType } from '../shared/maps';
import type { MapId } from '../shared/types';

function makeCanvas(w = 512, h = 512): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return [canvas, ctx];
}

// Deterministic fast PRNG so procedural textures stay crisp & consistent
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addFineGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity = 14,
  seed = 1337
) {
  const rng = mulberry32(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * intensity;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
  isColor = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Converts a height/luminance canvas into a true tangent-space RGB Normal Map
 * using a Sobel filter so bevels, fabric weaves, masonry joints, and metal scratches
 * catch realistic raking highlights in Three.js PBR shaders.
 */
function makeNormalMapFromCanvas(
  src: HTMLCanvasElement,
  maxAnisotropy: number,
  strength = 2.2,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const w = src.width;
  const h = src.height;
  const sCtx = src.getContext('2d', { willReadFrequently: true })!;
  const sData = sCtx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    lum[i] = (sData[idx] * 0.299 + sData[idx + 1] * 0.587 + sData[idx + 2] * 0.114) / 255;
  }

  const [nc, nctx] = makeCanvas(w, h);
  const out = nctx.createImageData(w, h);
  const od = out.data;

  const sample = (x: number, y: number) => {
    const wx = (x + w) % w;
    const wy = (y + h) % h;
    return lum[wy * w + wx];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const idx = (y * w + x) * 4;
      od[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      od[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      od[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      od[idx + 3] = 255;
    }
  }
  nctx.putImageData(out, 0, 0);
  return finalizeTexture(nc, maxAnisotropy, repeatX, repeatY, false);
}

/**
 * Generates a linear roughness map from luminance so crevices stay rough/matte
 * while raised worn edges or smooth slabs pick up realistic specular sheen.
 */
function makeRoughnessFromCanvas(
  src: HTMLCanvasElement,
  maxAnisotropy: number,
  minRough: number,
  maxRough: number,
  invert = true,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const w = src.width;
  const h = src.height;
  const sCtx = src.getContext('2d', { willReadFrequently: true })!;
  const sData = sCtx.getImageData(0, 0, w, h).data;
  const [rc, rctx] = makeCanvas(w, h);
  const out = rctx.createImageData(w, h);
  const od = out.data;

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const l = (sData[idx] * 0.299 + sData[idx + 1] * 0.587 + sData[idx + 2] * 0.114) / 255;
    const t = invert ? 1 - l : l;
    const v = Math.round((minRough + t * (maxRough - minRough)) * 255);
    od[idx] = v;
    od[idx + 1] = v;
    od[idx + 2] = v;
    od[idx + 3] = 255;
  }
  rctx.putImageData(out, 0, 0);
  return finalizeTexture(rc, maxAnisotropy, repeatX, repeatY, false);
}

export interface MaterialLibrary {
  boxMaterials: Record<BoxMaterialType, THREE.MeshStandardMaterial>;
  floorMaterials: Record<'sand' | 'concrete' | 'asphalt', THREE.MeshStandardMaterial>;
  dispose: () => void;
}

/**
 * Shared AAA procedural PBR textures for firearms, Police/SWAT tactical uniforms,
 * ballistic vests, human operator faces, optics reticles, weapon skins, and shadows.
 */
export interface WeaponTextureSet {
  gunmetal: THREE.CanvasTexture;
  gunmetalNormal: THREE.CanvasTexture;
  gunmetalRough: THREE.CanvasTexture;
  woodGrain: THREE.CanvasTexture;
  woodNormal: THREE.CanvasTexture;
  polymerStipple: THREE.CanvasTexture;
  polymerNormal: THREE.CanvasTexture;
  fabricNormal: THREE.CanvasTexture;
  fabricRough: THREE.CanvasTexture;
  molleNormal: THREE.CanvasTexture;
  camoCloth: THREE.CanvasTexture;
  desertCamo: THREE.CanvasTexture;
  navyRipstop: THREE.CanvasTexture;
  khakiTwill: THREE.CanvasTexture;
  oliveRipstop: THREE.CanvasTexture;
  blackRipstop: THREE.CanvasTexture;
  arcticCamo: THREE.CanvasTexture;
  jungleTiger: THREE.CanvasTexture;
  commanderCharcoal: THREE.CanvasTexture;
  tigerCamo: THREE.CanvasTexture;
  carbonFiber: THREE.CanvasTexture;
  carbonNormal: THREE.CanvasTexture;
  goldEngraved: THREE.CanvasTexture;
  goldNormal: THREE.CanvasTexture;
  obsidianDragon: THREE.CanvasTexture;
  obsidianNormal: THREE.CanvasTexture;
  arcticWeapon: THREE.CanvasTexture;
  emeraldCarbon: THREE.CanvasTexture;
  policeVestPlate: THREE.CanvasTexture;
  swatVestPlate: THREE.CanvasTexture;
  tanVestPlate: THREE.CanvasTexture;
  ctuVestPlate: THREE.CanvasTexture;
  eodVestPlate: THREE.CanvasTexture;
  shemaghTex: THREE.CanvasTexture;
  humanFace: THREE.CanvasTexture;
  faceWarpaint: THREE.CanvasTexture;
  skinNormal: THREE.CanvasTexture;
  tacticalPatchTex: THREE.CanvasTexture;
  balaclavaTex: THREE.CanvasTexture;
  skullMask: THREE.CanvasTexture;
  holoReticle: THREE.CanvasTexture;
  watchDial: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

let cachedWeaponTex: WeaponTextureSet | null = null;

function drawRipstopBase(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseHex: string,
  gridAlpha = 0.055,
  seed = 42
) {
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  // Authentic military ripstop reinforced grid
  ctx.strokeStyle = `rgba(255,255,255,${gridAlpha})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(0,0,0,${gridAlpha * 1.4})`;
  for (let i = 4; i < size; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Subtle organic cloth fold shadows
  const rng = mulberry32(seed);
  for (let i = 0; i < 18; i++) {
    const y = rng() * size;
    const grad = ctx.createLinearGradient(0, y - 16, 0, y + 16);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.085)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 16, size, 32);
  }
  addFineGrain(ctx, size, size, 11, seed + 17);
}

export function getWeaponTextureSet(): WeaponTextureSet {
  if (cachedWeaponTex) return cachedWeaponTex;
  const maxAniso = 8;

  // 1. 512x512 CNC Forged Anodized Gunmetal + Normal + Roughness
  const [gmC, gmCtx] = makeCanvas(512, 512);
  gmCtx.fillStyle = '#252a33';
  gmCtx.fillRect(0, 0, 512, 512);
  // Fine brushed directional CNC grain
  for (let y = 0; y < 512; y += 2) {
    gmCtx.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.038)' : 'rgba(0,0,0,0.065)';
    gmCtx.fillRect(0, y, 512, 1);
  }
  // Subtle milled panel seams & rivets
  gmCtx.strokeStyle = 'rgba(0,0,0,0.34)';
  gmCtx.lineWidth = 2;
  gmCtx.strokeRect(18, 18, 476, 476);
  gmCtx.strokeStyle = 'rgba(205,218,235,0.14)';
  gmCtx.lineWidth = 1;
  gmCtx.strokeRect(20, 20, 472, 472);
  // Realistic micro edge scratches & handling wear
  const rngGm = mulberry32(101);
  for (let i = 0; i < 65; i++) {
    const sx = rngGm() * 512;
    const sy = rngGm() * 512;
    gmCtx.strokeStyle = rngGm() > 0.35 ? 'rgba(215,228,245,0.11)' : 'rgba(10,12,16,0.22)';
    gmCtx.lineWidth = 0.8 + rngGm() * 0.8;
    gmCtx.beginPath();
    gmCtx.moveTo(sx, sy);
    gmCtx.lineTo(sx + 16 + rngGm() * 48, sy + (rngGm() - 0.5) * 4);
    gmCtx.stroke();
  }
  addFineGrain(gmCtx, 512, 512, 13, 102);
  const gunmetal = finalizeTexture(gmC, maxAniso, 2, 2, true);
  const gunmetalNormal = makeNormalMapFromCanvas(gmC, maxAniso, 1.8, 2, 2);
  const gunmetalRough = makeRoughnessFromCanvas(gmC, maxAniso, 0.2, 0.52, true, 2, 2);

  // 2. 512x512 Laminated Walnut Rifle Wood + Normal
  const [wdC, wdCtx] = makeCanvas(512, 512);
  wdCtx.fillStyle = '#6c3a1c';
  wdCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 2) {
    const wave = Math.sin(y * 0.08) * 18 + Math.sin(y * 0.025) * 12 + Math.cos(y * 0.21) * 6;
    wdCtx.fillStyle = `rgb(${Math.round(108 + wave)}, ${Math.round(58 + wave * 0.56)}, ${Math.round(28 + wave * 0.3)})`;
    wdCtx.fillRect(0, y, 512, 2);
  }
  wdCtx.strokeStyle = 'rgba(34, 14, 5, 0.36)';
  wdCtx.lineWidth = 2.2;
  for (let i = 0; i < 28; i++) {
    const y = i * 18.5;
    wdCtx.beginPath();
    wdCtx.moveTo(0, y);
    wdCtx.bezierCurveTo(160, y + 10, 340, y - 10, 512, y);
    wdCtx.stroke();
  }
  addFineGrain(wdCtx, 512, 512, 14, 203);
  const woodGrain = finalizeTexture(wdC, maxAniso, 1, 1, true);
  const woodNormal = makeNormalMapFromCanvas(wdC, maxAniso, 2.0, 1, 1);

  // 3. 256x256 Magpul Diamond Stippled Polymer + Normal
  const [plC, plCtx] = makeCanvas(256, 256);
  plCtx.fillStyle = '#1b1f26';
  plCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 6) {
    for (let x = 0; x < 256; x += 6) {
      const alt = ((x + y) / 6) % 2 === 0;
      plCtx.fillStyle = alt ? '#282d36' : '#12151b';
      plCtx.beginPath();
      plCtx.moveTo(x + 3, y);
      plCtx.lineTo(x + 6, y + 3);
      plCtx.lineTo(x + 3, y + 6);
      plCtx.lineTo(x, y + 3);
      plCtx.closePath();
      plCtx.fill();
    }
  }
  addFineGrain(plCtx, 256, 256, 10, 304);
  const polymerStipple = finalizeTexture(plC, maxAniso, 3, 3, true);
  const polymerNormal = makeNormalMapFromCanvas(plC, maxAniso, 2.4, 3, 3);

  // 4. Shared High-Def Ripstop Cloth Normal + Roughness Map (gives every uniform real textile creases & thread weave!)
  const [fbC, fbCtx] = makeCanvas(512, 512);
  fbCtx.fillStyle = '#808080';
  fbCtx.fillRect(0, 0, 512, 512);
  // Diagonal twill + ripstop grid weave
  for (let i = 0; i < 512; i += 4) {
    fbCtx.fillStyle = i % 16 === 0 ? '#a8a8a8' : '#707070';
    fbCtx.fillRect(i, 0, 1, 512);
    fbCtx.fillRect(0, i, 512, 1);
  }
  // Sculpted natural fabric wrinkles & seam lines
  const rngFb = mulberry32(405);
  for (let i = 0; i < 24; i++) {
    const sy = rngFb() * 512;
    const grad = fbCtx.createLinearGradient(0, sy - 22, 0, sy + 22);
    grad.addColorStop(0, 'rgba(128,128,128,0)');
    grad.addColorStop(0.35, 'rgba(55,55,55,0.45)');
    grad.addColorStop(0.65, 'rgba(205,205,205,0.42)');
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    fbCtx.fillStyle = grad;
    fbCtx.fillRect(0, sy - 22, 512, 44);
  }
  // Double-stitched seam
  fbCtx.strokeStyle = '#383838';
  fbCtx.setLineDash([6, 4]);
  fbCtx.lineWidth = 2;
  fbCtx.beginPath();
  fbCtx.moveTo(256, 0);
  fbCtx.lineTo(256, 512);
  fbCtx.stroke();
  fbCtx.setLineDash([]);
  addFineGrain(fbCtx, 512, 512, 18, 406);
  const fabricNormal = makeNormalMapFromCanvas(fbC, maxAniso, 2.3, 2, 2);
  const fabricRough = makeRoughnessFromCanvas(fbC, maxAniso, 0.74, 0.96, true, 2, 2);

  // 5. Cordura Ballistic Nylon & MOLLE Webbing Normal Map
  const [mlC, mlCtx] = makeCanvas(256, 256);
  mlCtx.fillStyle = '#707070';
  mlCtx.fillRect(0, 0, 256, 256);
  for (let y = 12; y < 248; y += 36) {
    mlCtx.fillStyle = '#b4b4b4';
    mlCtx.fillRect(8, y, 240, 20);
    mlCtx.fillStyle = '#2d2d2d';
    mlCtx.fillRect(8, y + 20, 240, 4);
    for (let x = 20; x < 240; x += 36) {
      mlCtx.fillStyle = '#404040';
      mlCtx.fillRect(x, y, 4, 20);
    }
  }
  addFineGrain(mlCtx, 256, 256, 16, 407);
  const molleNormal = makeNormalMapFromCanvas(mlC, maxAniso, 3.0, 1, 1);

  // 6. Tactical Uniform Fabrics (512x512)
  // 6a. Digital Urban Ghost Camo
  const [cmC, cmCtx] = makeCanvas(512, 512);
  drawRipstopBase(cmCtx, 512, '#343c47', 0.05, 501);
  const urbanPal = ['#1d232b', '#414c5a', '#5b6776', '#252e3a', '#7c8795'];
  const rngUb = mulberry32(502);
  for (let i = 0; i < 360; i++) {
    cmCtx.fillStyle = urbanPal[i % urbanPal.length];
    const rx = Math.floor(rngUb() * 32) * 16;
    const ry = Math.floor(rngUb() * 32) * 16;
    const rw = (1 + Math.floor(rngUb() * 3)) * 16;
    const rh = (1 + Math.floor(rngUb() * 2)) * 12;
    cmCtx.fillRect(rx, ry, rw, rh);
  }
  drawRipstopBase(cmCtx, 512, 'rgba(0,0,0,0)', 0.055, 503);
  const camoCloth = finalizeTexture(cmC, maxAniso, 2, 2, true);

  // 6b. MultiCam Desert Tactical Fabric
  const [dcC, dcCtx] = makeCanvas(512, 512);
  dcCtx.fillStyle = '#b69f78';
  dcCtx.fillRect(0, 0, 512, 512);
  const desertPal = ['#876f49', '#ceb992', '#645236', '#9a845d', '#6e7351', '#d8c8a6'];
  const rngDc = mulberry32(504);
  for (let i = 0; i < 240; i++) {
    dcCtx.fillStyle = desertPal[i % desertPal.length];
    dcCtx.beginPath();
    dcCtx.ellipse(
      rngDc() * 512,
      rngDc() * 512,
      14 + rngDc() * 34,
      8 + rngDc() * 20,
      rngDc() * Math.PI,
      0,
      Math.PI * 2
    );
    dcCtx.fill();
  }
  drawRipstopBase(dcCtx, 512, 'rgba(0,0,0,0)', 0.05, 505);
  const desertCamo = finalizeTexture(dcC, maxAniso, 2, 2, true);

  // 6c. SWAT Navy Ripstop
  const [nvC, nvCtx] = makeCanvas(512, 512);
  drawRipstopBase(nvCtx, 512, '#1a2942', 0.055, 506);
  const navyRipstop = finalizeTexture(nvC, maxAniso, 2, 2, true);

  // 6d. Police Patrol Khaki Twill
  const [khC, khCtx] = makeCanvas(512, 512);
  drawRipstopBase(khCtx, 512, '#7b6b53', 0.045, 507);
  const khakiTwill = finalizeTexture(khC, maxAniso, 2, 2, true);

  // 6e. Tactical Olive Ripstop
  const [olC, olCtx] = makeCanvas(512, 512);
  drawRipstopBase(olCtx, 512, '#3d4c36', 0.055, 508);
  const oliveRipstop = finalizeTexture(olC, maxAniso, 2, 2, true);

  // 6f. Shadow Commando Black Ripstop
  const [bkC, bkCtx] = makeCanvas(512, 512);
  drawRipstopBase(bkCtx, 512, '#1a1e26', 0.055, 509);
  const blackRipstop = finalizeTexture(bkC, maxAniso, 2, 2, true);

  // 7. Weapon Skin Textures (512x512)
  // 7a. SF Tiger Camo
  const [tgC, tgCtx] = makeCanvas(512, 512);
  const tgGrad = tgCtx.createLinearGradient(0, 0, 512, 512);
  tgGrad.addColorStop(0, '#e08b1b');
  tgGrad.addColorStop(0.5, '#c86a10');
  tgGrad.addColorStop(1, '#e89d28');
  tgCtx.fillStyle = tgGrad;
  tgCtx.fillRect(0, 0, 512, 512);
  tgCtx.fillStyle = '#15161a';
  for (let i = -60; i < 580; i += 44) {
    tgCtx.beginPath();
    tgCtx.moveTo(i, 0);
    tgCtx.bezierCurveTo(i + 44, 160, i - 34, 340, i + 26, 512);
    tgCtx.lineTo(i + 44, 512);
    tgCtx.bezierCurveTo(i - 12, 340, i + 64, 160, i + 22, 0);
    tgCtx.closePath();
    tgCtx.fill();
  }
  addFineGrain(tgCtx, 512, 512, 12, 601);
  const tigerCamo = finalizeTexture(tgC, maxAniso, 2, 2, true);

  // 7b. Woven 3K Crimson Carbon Fiber + Normal
  const [cfC, cfCtx] = makeCanvas(256, 256);
  cfCtx.fillStyle = '#14151a';
  cfCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) {
    for (let x = 0; x < 256; x += 8) {
      const alt = ((x + y) / 8) % 2 === 0;
      const g = cfCtx.createLinearGradient(x, y, x + 8, y + 8);
      if (alt) {
        g.addColorStop(0, '#363945');
        g.addColorStop(1, '#181a20');
      } else {
        g.addColorStop(0, '#16181e');
        g.addColorStop(1, '#2b2e38');
      }
      cfCtx.fillStyle = g;
      cfCtx.fillRect(x, y, 7.5, 7.5);
    }
  }
  // Crimson racing stripe accent
  cfCtx.fillStyle = 'rgba(220, 38, 38, 0.55)';
  cfCtx.fillRect(0, 112, 256, 24);
  cfCtx.fillStyle = 'rgba(252, 165, 165, 0.65)';
  cfCtx.fillRect(0, 120, 256, 4);
  const carbonFiber = finalizeTexture(cfC, maxAniso, 3, 3, true);
  const carbonNormal = makeNormalMapFromCanvas(cfC, maxAniso, 2.5, 3, 3);

  // 7c. Royal 24K Filigree Engraved Gold + Normal
  const [gdC, gdCtx] = makeCanvas(512, 512);
  const goldGrad = gdCtx.createLinearGradient(0, 0, 512, 512);
  goldGrad.addColorStop(0, '#e8b434');
  goldGrad.addColorStop(0.35, '#ffe57f');
  goldGrad.addColorStop(0.7, '#d49a1e');
  goldGrad.addColorStop(1, '#f7cd52');
  gdCtx.fillStyle = goldGrad;
  gdCtx.fillRect(0, 0, 512, 512);
  gdCtx.strokeStyle = 'rgba(84, 52, 6, 0.42)';
  gdCtx.lineWidth = 2.5;
  for (let y = 24; y < 512; y += 48) {
    for (let x = 24; x < 512; x += 48) {
      gdCtx.beginPath();
      gdCtx.arc(x, y, 16, 0, Math.PI * 2);
      gdCtx.stroke();
      gdCtx.beginPath();
      gdCtx.arc(x, y, 7, 0, Math.PI * 2);
      gdCtx.stroke();
    }
  }
  addFineGrain(gdCtx, 512, 512, 9, 603);
  const goldEngraved = finalizeTexture(gdC, maxAniso, 2, 2, true);
  const goldNormal = makeNormalMapFromCanvas(gdC, maxAniso, 2.4, 2, 2);

  // 8. High-Def Ballistic Vest Front/Back Plate Textures (512x512)
  const makeVestPlate = (
    baseColor: string,
    label: string,
    accentHex: string,
    includePoliceShield: boolean
  ) => {
    const [vc, vctx] = makeCanvas(512, 512);
    drawRipstopBase(vctx, 512, baseColor, 0.06, 701);

    // Outer stitched perimeter piping
    vctx.strokeStyle = 'rgba(0,0,0,0.45)';
    vctx.lineWidth = 10;
    vctx.strokeRect(12, 12, 488, 488);
    vctx.strokeStyle = 'rgba(255,255,255,0.08)';
    vctx.lineWidth = 2;
    vctx.strokeRect(20, 20, 472, 472);

    // Heavy MOLLE nylon PALS webbing rows with bar-tack stitching
    for (let y = 215; y < 475; y += 54) {
      vctx.fillStyle = 'rgba(0,0,0,0.28)';
      vctx.fillRect(28, y + 32, 456, 7);
      vctx.fillStyle = 'rgba(255,255,255,0.065)';
      vctx.fillRect(28, y, 456, 30);
      vctx.strokeStyle = 'rgba(0,0,0,0.38)';
      vctx.lineWidth = 2;
      for (let x = 68; x < 460; x += 64) {
        vctx.beginPath();
        vctx.moveTo(x, y);
        vctx.lineTo(x, y + 30);
        vctx.stroke();
      }
    }

    // Upper chest Velcro loop field
    vctx.fillStyle = 'rgba(8,12,20,0.72)';
    vctx.fillRect(58, 92, 396, 102);
    vctx.strokeStyle = accentHex;
    vctx.lineWidth = 3;
    vctx.strokeRect(58, 92, 396, 102);

    if (label) {
      vctx.fillStyle = '#f8fafc';
      vctx.font = 'bold 74px "Chakra Petch", sans-serif';
      vctx.textAlign = 'center';
      vctx.textBaseline = 'middle';
      vctx.fillText(label, 256, 145);
    }

    // Blood-type / unit callsign mini patch
    vctx.fillStyle = '#111827';
    vctx.fillRect(62, 36, 118, 42);
    vctx.strokeStyle = 'rgba(255,255,255,0.25)';
    vctx.lineWidth = 2;
    vctx.strokeRect(62, 36, 118, 42);
    vctx.fillStyle = '#e2e8f0';
    vctx.font = 'bold 22px monospace';
    vctx.textAlign = 'center';
    vctx.fillText('O+ POS', 121, 58);

    if (includePoliceShield) {
      vctx.fillStyle = '#f5b932';
      vctx.beginPath();
      vctx.moveTo(412, 28);
      vctx.lineTo(446, 36);
      vctx.lineTo(442, 66);
      vctx.lineTo(412, 82);
      vctx.lineTo(382, 66);
      vctx.lineTo(378, 36);
      vctx.closePath();
      vctx.fill();
      vctx.strokeStyle = '#92400e';
      vctx.lineWidth = 3;
      vctx.stroke();
    }

    addFineGrain(vctx, 512, 512, 10, 702);
    return finalizeTexture(vc, maxAniso, 1, 1, true);
  };

  const policeVestPlate = makeVestPlate('#142238', 'POLICE', 'rgba(148,163,184,0.55)', true);
  const swatVestPlate = makeVestPlate('#151a23', 'SWAT', 'rgba(56,189,248,0.65)', false);
  const tanVestPlate = makeVestPlate('#9a8460', 'SPEC OPS', 'rgba(217,188,136,0.6)', false);

  // 9. Realistic Sculpted Human Operator Face UV Texture (Equirectangular Sphere Wrap)
  // Note: On Three.js SphereGeometry, the front (-Z when head looks toward -Z) corresponds to u=0.75 (or rotated)
  // We align the cranium rotation so u=0.5 faces directly forward (-Z) for razor-sharp facial painting!
  const [fcC, fcCtx] = makeCanvas(512, 512);
  // Warm realistic skin gradient with subsurface warmth & anatomical forehead/jaw shading
  const skinBase = fcCtx.createLinearGradient(0, 0, 0, 512);
  skinBase.addColorStop(0, '#c69370');
  skinBase.addColorStop(0.28, '#d4a381');
  skinBase.addColorStop(0.5, '#dba987');
  skinBase.addColorStop(0.72, '#c8926f');
  skinBase.addColorStop(1, '#a36e50');
  fcCtx.fillStyle = skinBase;
  fcCtx.fillRect(0, 0, 512, 512);

  // Helper for soft anatomical skin shading/highlights
  const drawSoftShade = (x: number, y: number, rx: number, ry: number, color: string) => {
    fcCtx.save();
    fcCtx.translate(x, y);
    fcCtx.scale(rx, ry);
    const g = fcCtx.createRadialGradient(0, 0, 0.05, 0, 0, 1);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    fcCtx.fillStyle = g;
    fcCtx.beginPath();
    fcCtx.arc(0, 0, 1, 0, Math.PI * 2);
    fcCtx.fill();
    fcCtx.restore();
  };

  // Forehead highlight, brow furrow, orbital eye socket occlusion & zygomatic cheekbone specular
  drawSoftShade(256, 178, 68, 28, 'rgba(248,214,186,0.22)');
  drawSoftShade(256, 212, 18, 12, 'rgba(110,64,42,0.26)');
  drawSoftShade(212, 232, 36, 23, 'rgba(84,46,30,0.42)');
  drawSoftShade(300, 232, 36, 23, 'rgba(84,46,30,0.42)');
  // Cheekbone highlights & subtle healthy subsurface flush
  drawSoftShade(194, 268, 36, 20, 'rgba(246,204,174,0.22)');
  drawSoftShade(318, 268, 36, 20, 'rgba(246,204,174,0.22)');
  drawSoftShade(196, 294, 46, 36, 'rgba(176,98,74,0.22)');
  drawSoftShade(316, 294, 46, 36, 'rgba(176,98,74,0.22)');
  // Nasolabial folds & chin dimple shadow
  drawSoftShade(224, 312, 16, 28, 'rgba(104,62,44,0.18)');
  drawSoftShade(288, 312, 16, 28, 'rgba(104,62,44,0.18)');
  drawSoftShade(256, 362, 26, 12, 'rgba(92,52,36,0.28)');
  // Realistic 5-o'clock tactical stubble beard along jaw, cheeks & upper lip
  drawSoftShade(256, 374, 92, 66, 'rgba(34,25,20,0.3)');
  drawSoftShade(256, 320, 38, 13, 'rgba(34,25,20,0.2)');
  const stRng = mulberry32(805);
  fcCtx.fillStyle = 'rgba(28, 20, 16, 0.34)';
  for (let i = 0; i < 650; i++) {
    const sx = 172 + stRng() * 168;
    const sy = 312 + stRng() * 108;
    const dx = (sx - 256) / 86;
    const dy = (sy - 368) / 58;
    if (dx * dx + dy * dy <= 1.0 && !(Math.abs(sx - 256) < 28 && sy > 328 && sy < 350)) {
      fcCtx.fillRect(sx, sy, 1.5, 1.5);
    }
  }

  // Hyper-Detailed Eyes (orbital shadow, sclera gradient, limbal ring, multi-tone iris, specular catchlight)
  for (const ex of [214, 298]) {
    // Upper lash & deep eyelid fold
    fcCtx.fillStyle = '#20140f';
    fcCtx.beginPath();
    fcCtx.ellipse(ex, 231, 21, 10.5, 0, 0, Math.PI * 2);
    fcCtx.fill();
    // Sclera with subtle warm corner tint
    const scG = fcCtx.createRadialGradient(ex, 234, 4, ex, 234, 19);
    scG.addColorStop(0, '#f3f1ef');
    scG.addColorStop(0.75, '#e2dbd7');
    scG.addColorStop(1, '#c8aba0');
    fcCtx.fillStyle = scG;
    fcCtx.beginPath();
    fcCtx.ellipse(ex, 234, 18, 8.2, 0, 0, Math.PI * 2);
    fcCtx.fill();
    // Dark limbal ring + rich tactical hazel-brown iris
    fcCtx.fillStyle = '#18100b';
    fcCtx.beginPath();
    fcCtx.arc(ex, 234, 7.6, 0, Math.PI * 2);
    fcCtx.fill();
    const irG = fcCtx.createRadialGradient(ex, 234, 1.5, ex, 234, 6.8);
    irG.addColorStop(0, '#5c3c24');
    irG.addColorStop(0.65, '#3b2416');
    irG.addColorStop(1, '#1d120c');
    fcCtx.fillStyle = irG;
    fcCtx.beginPath();
    fcCtx.arc(ex, 234, 6.6, 0, Math.PI * 2);
    fcCtx.fill();
    // Pupil
    fcCtx.fillStyle = '#070709';
    fcCtx.beginPath();
    fcCtx.arc(ex, 234, 3.4, 0, Math.PI * 2);
    fcCtx.fill();
    // Dual studio catchlights
    fcCtx.fillStyle = 'rgba(255,255,255,0.92)';
    fcCtx.beginPath();
    fcCtx.arc(ex + 2.4, 231.4, 1.8, 0, Math.PI * 2);
    fcCtx.fill();
    fcCtx.fillStyle = 'rgba(186,230,253,0.55)';
    fcCtx.beginPath();
    fcCtx.arc(ex - 2.2, 236.2, 1.0, 0, Math.PI * 2);
    fcCtx.fill();
    // Upper eyelid crease & lower lid rim
    fcCtx.strokeStyle = 'rgba(66,34,20,0.65)';
    fcCtx.lineWidth = 2.1;
    fcCtx.beginPath();
    fcCtx.arc(ex, 234, 20.5, Math.PI * 1.12, Math.PI * 1.88);
    fcCtx.stroke();
    fcCtx.strokeStyle = 'rgba(116,68,48,0.42)';
    fcCtx.lineWidth = 1.4;
    fcCtx.beginPath();
    fcCtx.arc(ex, 234, 17, Math.PI * 0.15, Math.PI * 0.85);
    fcCtx.stroke();
  }

  // Expressive determined tactical eyebrows with hair-stroke texture
  fcCtx.fillStyle = '#1b130f';
  fcCtx.beginPath();
  fcCtx.moveTo(184, 211);
  fcCtx.quadraticCurveTo(212, 201, 241, 214);
  fcCtx.lineTo(239, 222);
  fcCtx.quadraticCurveTo(212, 211, 187, 218);
  fcCtx.closePath();
  fcCtx.fill();

  fcCtx.beginPath();
  fcCtx.moveTo(328, 211);
  fcCtx.quadraticCurveTo(300, 201, 271, 214);
  fcCtx.lineTo(273, 222);
  fcCtx.quadraticCurveTo(300, 211, 325, 218);
  fcCtx.closePath();
  fcCtx.fill();

  // Nose bridge highlight, tip contour & nostrils
  drawSoftShade(256, 260, 8, 26, 'rgba(250,218,192,0.22)');
  drawSoftShade(256, 286, 21, 14, 'rgba(94,54,36,0.36)');
  fcCtx.fillStyle = 'rgba(58,32,20,0.6)';
  fcCtx.beginPath();
  fcCtx.ellipse(247, 290, 5.2, 3.1, 0.22, 0, Math.PI * 2);
  fcCtx.ellipse(265, 290, 5.2, 3.1, -0.22, 0, Math.PI * 2);
  fcCtx.fill();

  // Philtrum & Natural Sculpted Lips
  drawSoftShade(256, 312, 6, 12, 'rgba(98,58,40,0.2)');
  fcCtx.fillStyle = '#9c5d4e';
  fcCtx.beginPath();
  fcCtx.moveTo(224, 336);
  fcCtx.quadraticCurveTo(242, 326, 256, 331);
  fcCtx.quadraticCurveTo(270, 326, 288, 336);
  fcCtx.quadraticCurveTo(256, 353, 224, 336);
  fcCtx.fill();
  // Lower lip subtle highlight
  drawSoftShade(256, 342, 16, 4.5, 'rgba(232,175,156,0.32)');
  fcCtx.strokeStyle = 'rgba(58,26,20,0.78)';
  fcCtx.lineWidth = 2.2;
  fcCtx.beginPath();
  fcCtx.moveTo(224, 336);
  fcCtx.quadraticCurveTo(256, 339.5, 288, 336);
  fcCtx.stroke();

  // Military short high-fade hair along top, tapered sides & nape
  const hairGrad = fcCtx.createLinearGradient(0, 118, 0, 152);
  hairGrad.addColorStop(0, '#171412');
  hairGrad.addColorStop(0.7, '#221c18');
  hairGrad.addColorStop(1, 'rgba(28,22,18,0)');
  fcCtx.fillStyle = '#171412';
  fcCtx.fillRect(0, 0, 512, 130);
  fcCtx.fillStyle = hairGrad;
  fcCtx.fillRect(0, 122, 512, 30);
  // Sides & back buzzcut fade
  fcCtx.fillStyle = '#1b1715';
  fcCtx.fillRect(0, 128, 128, 178);
  fcCtx.fillRect(384, 128, 128, 178);
  addFineGrain(fcC.getContext('2d')!, 512, 512, 9, 801);
  const humanFace = finalizeTexture(fcC, maxAniso, 1, 1, true);

  // 9b. Dedicated Skin Pore + Facial Relief Normal Map (512x512 linear)
  const [snC, snCtx] = makeCanvas(512, 512);
  snCtx.fillStyle = '#808080';
  snCtx.fillRect(0, 0, 512, 512);
  // Subtle forehead brow lines, nose ridge, lip fullness & cheek contour in height
  snCtx.fillStyle = '#9a9a9a';
  snCtx.beginPath();
  snCtx.ellipse(256, 206, 62, 10, 0, 0, Math.PI * 2);
  snCtx.fill();
  snCtx.fillStyle = '#626262';
  snCtx.beginPath();
  snCtx.ellipse(214, 234, 22, 12, 0, 0, Math.PI * 2);
  snCtx.ellipse(298, 234, 22, 12, 0, 0, Math.PI * 2);
  snCtx.fill();
  snCtx.fillStyle = '#a0a0a0';
  snCtx.beginPath();
  snCtx.ellipse(256, 340, 28, 9, 0, 0, Math.PI * 2);
  snCtx.fill();
  // Micro skin pores & stubble micro-bumps
  addFineGrain(snCtx, 512, 512, 24, 809);
  const skinNormal = makeNormalMapFromCanvas(snC, maxAniso, 0.9, 1, 1);

  // 9c. Special Forces Tactical Camo War-Paint Face Texture (512x512)
  const [wpC, wpCtx] = makeCanvas(512, 512);
  wpCtx.drawImage(fcC, 0, 0);
  wpCtx.save();
  // Matte tactical black & forest-olive camo streaks across cheekbones, brow & nose
  wpCtx.globalAlpha = 0.78;
  wpCtx.fillStyle = '#1b2219';
  wpCtx.beginPath();
  wpCtx.moveTo(158, 260);
  wpCtx.lineTo(246, 248);
  wpCtx.lineTo(242, 268);
  wpCtx.lineTo(164, 284);
  wpCtx.closePath();
  wpCtx.fill();
  wpCtx.beginPath();
  wpCtx.moveTo(354, 260);
  wpCtx.lineTo(266, 248);
  wpCtx.lineTo(270, 268);
  wpCtx.lineTo(348, 284);
  wpCtx.closePath();
  wpCtx.fill();
  // Olive-drab secondary stripes on cheeks, forehead & chin
  wpCtx.fillStyle = '#3b4d2e';
  wpCtx.beginPath();
  wpCtx.moveTo(166, 290);
  wpCtx.lineTo(234, 276);
  wpCtx.lineTo(230, 294);
  wpCtx.lineTo(174, 312);
  wpCtx.closePath();
  wpCtx.fill();
  wpCtx.beginPath();
  wpCtx.moveTo(346, 290);
  wpCtx.lineTo(278, 276);
  wpCtx.lineTo(282, 294);
  wpCtx.lineTo(338, 312);
  wpCtx.closePath();
  wpCtx.fill();
  wpCtx.fillStyle = '#20261e';
  wpCtx.beginPath();
  wpCtx.ellipse(256, 184, 52, 11, -0.14, 0, Math.PI * 2);
  wpCtx.ellipse(256, 376, 36, 12, 0.12, 0, Math.PI * 2);
  wpCtx.fill();
  wpCtx.restore();
  addFineGrain(wpCtx, 512, 512, 10, 811);
  const faceWarpaint = finalizeTexture(wpC, maxAniso, 1, 1, true);

  // 9d. Embroidered Velcro Tactical Unit Shoulder Patch (256x256)
  const [tpC, tpCtx] = makeCanvas(256, 256);
  tpCtx.fillStyle = '#121720';
  tpCtx.fillRect(0, 0, 256, 256);
  // Shield border in tactical gold
  tpCtx.strokeStyle = '#eab308';
  tpCtx.lineWidth = 10;
  tpCtx.beginPath();
  tpCtx.moveTo(28, 26);
  tpCtx.lineTo(228, 26);
  tpCtx.lineTo(228, 148);
  tpCtx.quadraticCurveTo(228, 214, 128, 236);
  tpCtx.quadraticCurveTo(28, 214, 28, 148);
  tpCtx.closePath();
  tpCtx.fillStyle = '#1a2333';
  tpCtx.fill();
  tpCtx.stroke();
  // Diagonal red-white-blue tactical bar
  tpCtx.fillStyle = '#dc2626';
  tpCtx.fillRect(42, 42, 172, 16);
  tpCtx.fillStyle = '#f8fafc';
  tpCtx.fillRect(42, 58, 172, 10);
  tpCtx.fillStyle = '#1d4ed8';
  tpCtx.fillRect(42, 68, 172, 18);
  // Golden Special Forces Winged Bolt & SF-OPS lettering
  tpCtx.fillStyle = '#fbbf24';
  tpCtx.font = 'bold 42px sans-serif';
  tpCtx.textAlign = 'center';
  tpCtx.textBaseline = 'middle';
  tpCtx.fillText('SF', 128, 134);
  tpCtx.fillStyle = '#e2e8f0';
  tpCtx.font = 'bold 24px monospace';
  tpCtx.fillText('STRIKE OPS', 128, 178);
  addFineGrain(tpCtx, 256, 256, 14, 819);
  const tacticalPatchTex = finalizeTexture(tpC, 4, 1, 1, true);

  // 10. Knitted Tactical Balaclava + Ghost Skull Balaclava (512x512 aligned to u=0.5 front)
  const makeBalaclavaCanvas = (withSkull: boolean) => {
    const [bc, bctx] = makeCanvas(512, 512);
    // Start with human eyes visible through eye cutout
    bctx.drawImage(fcC, 0, 0);
    // Knit black balaclava mask over everything EXCEPT the eye opening
    bctx.fillStyle = '#13161c';
    bctx.fillRect(0, 0, 512, 196);
    bctx.fillRect(0, 268, 512, 244);
    bctx.fillRect(0, 190, 160, 86);
    bctx.fillRect(352, 190, 160, 86);
    // Fine ribbed knit fabric lines & central nose-bridge seam
    bctx.strokeStyle = 'rgba(255,255,255,0.05)';
    bctx.lineWidth = 1.6;
    for (let x = 0; x < 512; x += 5) {
      bctx.beginPath();
      bctx.moveTo(x, 0);
      bctx.lineTo(x, 196);
      bctx.moveTo(x, 268);
      bctx.lineTo(x, 512);
      bctx.stroke();
    }
    bctx.strokeStyle = 'rgba(0,0,0,0.45)';
    bctx.lineWidth = 4;
    bctx.beginPath();
    bctx.moveTo(256, 268);
    bctx.lineTo(256, 460);
    bctx.stroke();
    // Stitched eye-opening border
    bctx.strokeStyle = '#2a303c';
    bctx.lineWidth = 6;
    bctx.beginPath();
    bctx.roundRect(160, 196, 192, 72, 28);
    bctx.stroke();

    if (withSkull) {
      // Weathered Special Forces Ghost Skull print over lower face
      bctx.fillStyle = '#e5e7eb';
      // Cheekbones
      bctx.beginPath();
      bctx.ellipse(206, 294, 36, 25, -0.26, 0, Math.PI * 2);
      bctx.ellipse(306, 294, 36, 25, 0.26, 0, Math.PI * 2);
      bctx.fill();
      // Upper maxilla & jaw
      bctx.beginPath();
      bctx.roundRect(200, 280, 112, 96, 20);
      bctx.fill();
      // Dark nasal cavity
      bctx.fillStyle = '#13161c';
      bctx.beginPath();
      bctx.moveTo(256, 268);
      bctx.lineTo(237, 305);
      bctx.lineTo(275, 305);
      bctx.closePath();
      bctx.fill();
      // Detailed distressed skeleton teeth & jaw cracks
      bctx.fillStyle = '#13161c';
      bctx.fillRect(204, 338, 104, 5);
      for (let tx = 214; tx <= 298; tx += 15) {
        bctx.fillRect(tx, 316, 4.2, 52);
      }
      bctx.strokeStyle = 'rgba(20,24,32,0.48)';
      bctx.lineWidth = 2.5;
      bctx.beginPath();
      bctx.moveTo(192, 286);
      bctx.lineTo(212, 302);
      bctx.moveTo(320, 288);
      bctx.lineTo(298, 306);
      bctx.stroke();
    }
    addFineGrain(bctx, 512, 512, 11, withSkull ? 803 : 802);
    return finalizeTexture(bc, maxAniso, 1, 1, true);
  };

  const balaclavaTex = makeBalaclavaCanvas(false);
  const skullMask = makeBalaclavaCanvas(true);

  // 11. Authentic EOTech EXPS3 65-MOA Holographic Reticle Texture (Transparent Emissive)
  const [hrC, hrCtx] = makeCanvas(256, 256);
  hrCtx.clearRect(0, 0, 256, 256);
  // Subtle red holographic bloom halo
  const halo = hrCtx.createRadialGradient(128, 128, 4, 128, 128, 86);
  halo.addColorStop(0, 'rgba(255, 68, 58, 0.45)');
  halo.addColorStop(0.55, 'rgba(255, 45, 45, 0.14)');
  halo.addColorStop(1, 'rgba(255, 45, 45, 0)');
  hrCtx.fillStyle = halo;
  hrCtx.fillRect(0, 0, 256, 256);

  // Outer 65-MOA crisp glowing circle
  hrCtx.strokeStyle = '#ff3b30';
  hrCtx.lineWidth = 4.5;
  hrCtx.beginPath();
  hrCtx.arc(128, 128, 62, 0, Math.PI * 2);
  hrCtx.stroke();

  // 4 cardinal hash ticks (12, 3, 6, 9 o'clock)
  hrCtx.fillStyle = '#ff4d42';
  hrCtx.fillRect(125.5, 48, 5, 22);
  hrCtx.fillRect(125.5, 186, 5, 22);
  hrCtx.fillRect(48, 125.5, 22, 5);
  hrCtx.fillRect(186, 125.5, 22, 5);

  // Razor-sharp 1-MOA center dot
  hrCtx.fillStyle = '#fff1f0';
  hrCtx.beginPath();
  hrCtx.arc(128, 128, 5.5, 0, Math.PI * 2);
  hrCtx.fill();
  const holoReticle = finalizeTexture(hrC, 4, 1, 1, true);
  holoReticle.wrapS = THREE.ClampToEdgeWrapping;
  holoReticle.wrapT = THREE.ClampToEdgeWrapping;

  // 12. Tactical Military Wristwatch Digital/Lume Dial
  const [wdlC, wdlCtx] = makeCanvas(128, 128);
  wdlCtx.fillStyle = '#090d14';
  wdlCtx.fillRect(0, 0, 128, 128);
  wdlCtx.strokeStyle = '#38bdf8';
  wdlCtx.lineWidth = 4;
  wdlCtx.beginPath();
  wdlCtx.arc(64, 64, 54, 0, Math.PI * 2);
  wdlCtx.stroke();
  wdlCtx.fillStyle = '#4ade80';
  wdlCtx.font = 'bold 26px monospace';
  wdlCtx.textAlign = 'center';
  wdlCtx.textBaseline = 'middle';
  wdlCtx.fillText('06:55', 64, 56);
  wdlCtx.fillStyle = '#38bdf8';
  wdlCtx.font = 'bold 14px monospace';
  wdlCtx.fillText('N 342°', 64, 86);
  const watchDial = finalizeTexture(wdlC, 4, 1, 1, true);

  // 13. Grounded Soft Radial Contact Shadow Disc
  const [csC, csCtx] = makeCanvas(128, 128);
  const csGrad = csCtx.createRadialGradient(64, 64, 8, 64, 64, 60);
  csGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
  csGrad.addColorStop(0.55, 'rgba(0,0,0,0.26)');
  csGrad.addColorStop(1, 'rgba(0,0,0,0)');
  csCtx.fillStyle = csGrad;
  csCtx.fillRect(0, 0, 128, 128);
  const contactShadow = finalizeTexture(csC, 2, 1, 1, true);
  contactShadow.wrapS = THREE.ClampToEdgeWrapping;
  contactShadow.wrapT = THREE.ClampToEdgeWrapping;

  // 14. Arctic Winter Splinter Camo Uniform (512x512)
  const [acC, acCtx] = makeCanvas(512, 512);
  drawRipstopBase(acCtx, 512, '#cfd8e3', 0.04, 701);
  const acRng = mulberry32(702);
  const acColors = ['#e8eef5', '#9aa8b8', '#687689', '#3f4c5e'];
  for (let i = 0; i < 62; i++) {
    acCtx.fillStyle = acColors[Math.floor(acRng() * acColors.length)];
    acCtx.beginPath();
    const cx = acRng() * 512;
    const cy = acRng() * 512;
    acCtx.moveTo(cx, cy);
    acCtx.lineTo(cx + (acRng() - 0.5) * 145, cy + (acRng() - 0.5) * 110);
    acCtx.lineTo(cx + (acRng() - 0.5) * 145, cy + (acRng() - 0.5) * 110);
    acCtx.closePath();
    acCtx.fill();
  }
  addFineGrain(acCtx, 512, 512, 12, 703);
  const arcticCamo = finalizeTexture(acC, 8, 2, 2, true);

  // 15. Special Forces Jungle Tigerstripe Ripstop (512x512)
  const [jtC, jtCtx] = makeCanvas(512, 512);
  drawRipstopBase(jtCtx, 512, '#344732', 0.05, 711);
  const jtRng = mulberry32(712);
  for (let y = 0; y < 512; y += 20) {
    jtCtx.fillStyle = y % 40 === 0 ? '#182118' : '#263623';
    jtCtx.beginPath();
    jtCtx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) {
      jtCtx.lineTo(x, y + Math.sin(x * 0.03 + y * 0.09) * 10 + (jtRng() - 0.5) * 8);
    }
    jtCtx.lineTo(512, y + 12);
    jtCtx.lineTo(0, y + 12);
    jtCtx.closePath();
    jtCtx.fill();
  }
  for (let i = 0; i < 36; i++) {
    jtCtx.fillStyle = jtRng() > 0.5 ? 'rgba(98, 124, 72, 0.52)' : 'rgba(20, 26, 18, 0.58)';
    jtCtx.beginPath();
    jtCtx.ellipse(jtRng() * 512, jtRng() * 512, 26 + jtRng() * 56, 7 + jtRng() * 14, -0.25, 0, Math.PI * 2);
    jtCtx.fill();
  }
  addFineGrain(jtCtx, 512, 512, 14, 713);
  const jungleTiger = finalizeTexture(jtC, 8, 2, 2, true);

  // 16. Executive Commander Charcoal-Gold Uniform Fabric (512x512)
  const [ccC, ccCtx] = makeCanvas(512, 512);
  drawRipstopBase(ccCtx, 512, '#1b1f29', 0.06, 721);
  ccCtx.strokeStyle = 'rgba(245, 188, 52, 0.16)';
  ccCtx.lineWidth = 2;
  for (let y = 0; y < 512; y += 64) {
    ccCtx.beginPath();
    ccCtx.moveTo(0, y);
    ccCtx.lineTo(512, y);
    ccCtx.stroke();
  }
  addFineGrain(ccCtx, 512, 512, 10, 722);
  const commanderCharcoal = finalizeTexture(ccC, 8, 2, 2, true);

  // 17. Black Dragon Obsidian Damascus Weapon Skin + Normal Map (512x512)
  const [obC, obCtx] = makeCanvas(512, 512);
  obCtx.fillStyle = '#121019';
  obCtx.fillRect(0, 0, 512, 512);
  // Damascus forged wave layers
  for (let y = 0; y < 512; y += 8) {
    obCtx.strokeStyle = y % 24 === 0 ? 'rgba(96, 86, 118, 0.45)' : 'rgba(38, 34, 52, 0.6)';
    obCtx.lineWidth = 3;
    obCtx.beginPath();
    for (let x = 0; x <= 512; x += 16) {
      const wy = y + Math.sin(x * 0.035 + y * 0.06) * 14 + Math.cos(x * 0.08 - y * 0.04) * 6;
      if (x === 0) obCtx.moveTo(x, wy);
      else obCtx.lineTo(x, wy);
    }
    obCtx.stroke();
  }
  // Molten gold dragon-vein filigree streaks
  const obRng = mulberry32(731);
  for (let i = 0; i < 14; i++) {
    let vx = obRng() * 512;
    let vy = obRng() * 512;
    obCtx.strokeStyle = i % 3 === 0 ? '#fbbf24' : '#f59e0b';
    obCtx.lineWidth = i % 3 === 0 ? 3.2 : 1.8;
    obCtx.beginPath();
    obCtx.moveTo(vx, vy);
    for (let s = 0; s < 10; s++) {
      vx += 24 + obRng() * 38;
      vy += (obRng() - 0.5) * 44;
      obCtx.lineTo(vx, vy);
    }
    obCtx.stroke();
  }
  addFineGrain(obCtx, 512, 512, 12, 732);
  const obsidianDragon = finalizeTexture(obC, 8, 2, 2, true);
  const obsidianNormal = makeNormalMapFromCanvas(obC, 8, 2.2, 2, 2);

  // 18. Arctic White Cerakote Tactical Weapon Skin (512x512)
  const [awC, awCtx] = makeCanvas(512, 512);
  awCtx.fillStyle = '#dde4ec';
  awCtx.fillRect(0, 0, 512, 512);
  const awRng = mulberry32(741);
  for (let i = 0; i < 28; i++) {
    awCtx.fillStyle = awRng() > 0.5 ? '#c2cddb' : '#4a5768';
    awCtx.beginPath();
    const x = awRng() * 512;
    const y = awRng() * 512;
    awCtx.moveTo(x, y);
    awCtx.lineTo(x + 65 + awRng() * 90, y + (awRng() - 0.5) * 40);
    awCtx.lineTo(x + 25 + awRng() * 60, y + 32 + awRng() * 48);
    awCtx.closePath();
    awCtx.fill();
  }
  awCtx.fillStyle = 'rgba(30, 41, 59, 0.35)';
  awCtx.fillRect(0, 232, 512, 16);
  addFineGrain(awCtx, 512, 512, 10, 742);
  const arcticWeapon = finalizeTexture(awC, 8, 2, 2, true);

  // 19. Spec-Ops Emerald Titanium Carbon Weapon Skin (512x512)
  const [emC, emCtx] = makeCanvas(512, 512);
  emCtx.fillStyle = '#072a20';
  emCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 12) {
    for (let x = 0; x < 512; x += 12) {
      const even = ((x + y) / 12) % 2 === 0;
      emCtx.fillStyle = even ? '#0d6b4e' : '#0a3f30';
      emCtx.fillRect(x, y, 10, 10);
      emCtx.fillStyle = even ? 'rgba(110, 231, 183, 0.3)' : 'rgba(0, 0, 0, 0.3)';
      emCtx.fillRect(x + 1, y + 1, 5, 3);
    }
  }
  emCtx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
  emCtx.lineWidth = 4;
  for (let d = -512; d < 1024; d += 128) {
    emCtx.beginPath();
    emCtx.moveTo(d, 0);
    emCtx.lineTo(d + 512, 512);
    emCtx.stroke();
  }
  const emeraldCarbon = finalizeTexture(emC, 8, 3, 3, true);

  // 20. Naresuan CTU-261 Gold-Trim Plate Carrier Texture (512x512)
  const [ctuC, ctuCtx] = makeCanvas(512, 512);
  drawRipstopBase(ctuCtx, 512, '#141a26', 0.06, 751);
  for (let y = 70; y < 440; y += 46) {
    ctuCtx.fillStyle = '#1f293b';
    ctuCtx.fillRect(28, y, 456, 26);
    ctuCtx.strokeStyle = '#334155';
    ctuCtx.lineWidth = 2;
    ctuCtx.strokeRect(28, y, 456, 26);
  }
  // Gold-bordered CTU-261 Velcro Chest Patch
  ctuCtx.fillStyle = '#0c111b';
  ctuCtx.fillRect(72, 118, 368, 96);
  ctuCtx.strokeStyle = '#f59e0b';
  ctuCtx.lineWidth = 6;
  ctuCtx.strokeRect(72, 118, 368, 96);
  ctuCtx.fillStyle = '#fbbf24';
  ctuCtx.font = 'bold 54px sans-serif';
  ctuCtx.textAlign = 'center';
  ctuCtx.textBaseline = 'middle';
  ctuCtx.fillText('CTU 261', 256, 168);
  const ctuVestPlate = finalizeTexture(ctuC, 8, 1, 1, true);

  // 21. Heavy EOD Juggernaut Armored Vest Texture (512x512)
  const [eodC, eodCtx] = makeCanvas(512, 512);
  drawRipstopBase(eodCtx, 512, '#28313a', 0.05, 761);
  // Heavy riveted ceramic-plate segments
  eodCtx.strokeStyle = '#11161d';
  eodCtx.lineWidth = 8;
  eodCtx.strokeRect(24, 24, 464, 464);
  eodCtx.fillStyle = '#36414d';
  eodCtx.fillRect(46, 54, 420, 150);
  eodCtx.fillRect(46, 230, 420, 210);
  eodCtx.fillStyle = '#b91c1c';
  eodCtx.fillRect(46, 206, 420, 18);
  eodCtx.fillStyle = '#f8fafc';
  eodCtx.font = 'bold 48px monospace';
  eodCtx.textAlign = 'center';
  eodCtx.textBaseline = 'middle';
  eodCtx.fillText('EOD · BOMB SQUAD', 256, 128);
  const eodVestPlate = finalizeTexture(eodC, 8, 1, 1, true);

  // 22. Desert Tactical Shemagh Woven Pattern (256x256)
  const [shC, shCtx] = makeCanvas(256, 256);
  shCtx.fillStyle = '#c5ad84';
  shCtx.fillRect(0, 0, 256, 256);
  shCtx.strokeStyle = '#3d3020';
  shCtx.lineWidth = 4;
  for (let i = 0; i < 256; i += 24) {
    shCtx.beginPath();
    shCtx.moveTo(i, 0);
    shCtx.lineTo(i, 256);
    shCtx.moveTo(0, i);
    shCtx.lineTo(256, i);
    shCtx.stroke();
  }
  shCtx.fillStyle = 'rgba(42, 32, 20, 0.55)';
  for (let y = 8; y < 256; y += 24) {
    for (let x = 8; x < 256; x += 24) {
      shCtx.fillRect(x, y, 8, 8);
    }
  }
  addFineGrain(shCtx, 256, 256, 16, 771);
  const shemaghTex = finalizeTexture(shC, 4, 2, 2, true);

  cachedWeaponTex = {
    gunmetal,
    gunmetalNormal,
    gunmetalRough,
    woodGrain,
    woodNormal,
    polymerStipple,
    polymerNormal,
    fabricNormal,
    fabricRough,
    molleNormal,
    camoCloth,
    desertCamo,
    navyRipstop,
    khakiTwill,
    oliveRipstop,
    blackRipstop,
    arcticCamo,
    jungleTiger,
    commanderCharcoal,
    tigerCamo,
    carbonFiber,
    carbonNormal,
    goldEngraved,
    goldNormal,
    obsidianDragon,
    obsidianNormal,
    arcticWeapon,
    emeraldCarbon,
    policeVestPlate,
    swatVestPlate,
    tanVestPlate,
    ctuVestPlate,
    eodVestPlate,
    shemaghTex,
    humanFace,
    faceWarpaint,
    skinNormal,
    tacticalPatchTex,
    balaclavaTex,
    skullMask,
    holoReticle,
    watchDial,
    contactShadow,
    dispose: () => {
      gunmetal.dispose();
      gunmetalNormal.dispose();
      gunmetalRough.dispose();
      woodGrain.dispose();
      woodNormal.dispose();
      polymerStipple.dispose();
      polymerNormal.dispose();
      fabricNormal.dispose();
      fabricRough.dispose();
      molleNormal.dispose();
      camoCloth.dispose();
      desertCamo.dispose();
      navyRipstop.dispose();
      khakiTwill.dispose();
      oliveRipstop.dispose();
      blackRipstop.dispose();
      arcticCamo.dispose();
      jungleTiger.dispose();
      commanderCharcoal.dispose();
      tigerCamo.dispose();
      carbonFiber.dispose();
      carbonNormal.dispose();
      goldEngraved.dispose();
      goldNormal.dispose();
      obsidianDragon.dispose();
      obsidianNormal.dispose();
      arcticWeapon.dispose();
      emeraldCarbon.dispose();
      policeVestPlate.dispose();
      swatVestPlate.dispose();
      tanVestPlate.dispose();
      ctuVestPlate.dispose();
      eodVestPlate.dispose();
      shemaghTex.dispose();
      humanFace.dispose();
      faceWarpaint.dispose();
      skinNormal.dispose();
      tacticalPatchTex.dispose();
      balaclavaTex.dispose();
      skullMask.dispose();
      holoReticle.dispose();
      watchDial.dispose();
      contactShadow.dispose();
      cachedWeaponTex = null;
    },
  };
  return cachedWeaponTex;
}

/**
 * Generates an atmospheric equirectangular Sky Dome texture with rich zenith-to-horizon
 * Rayleigh scattering, crisp sun halo, layered volumetric-style clouds, and distant haze.
 */
export function createSkyDomeTexture(mapId: MapId): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 512);

  if (mapId === 'desert_camp') {
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#1e4e85');
    grad.addColorStop(0.28, '#4e85b8');
    grad.addColorStop(0.47, '#c7b89c');
    grad.addColorStop(0.54, '#e3c79b');
    grad.addColorStop(0.64, '#c7a474');
    grad.addColorStop(1, '#8c6d45');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    const sunGrad = ctx.createRadialGradient(260, 152, 8, 260, 152, 160);
    sunGrad.addColorStop(0, 'rgba(255, 252, 232, 0.98)');
    sunGrad.addColorStop(0.18, 'rgba(255, 230, 168, 0.72)');
    sunGrad.addColorStop(0.5, 'rgba(255, 206, 130, 0.22)');
    sunGrad.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(80, 0, 380, 340);

    // Layered high-altitude desert cirrus & dust-lit clouds
    const rng = mulberry32(901);
    for (let i = 0; i < 36; i++) {
      const cx = rng() * 1024;
      const cy = 95 + rng() * 115;
      const rw = 55 + rng() * 110;
      const rh = 7 + rng() * 16;
      ctx.fillStyle = 'rgba(255, 246, 228, 0.16)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(180, 150, 115, 0.08)';
      ctx.beginPath();
      ctx.ellipse(cx + 8, cy + 5, rw * 0.85, rh * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Crossroad tactical twilight skyline glow
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#050914');
    grad.addColorStop(0.32, '#101d35');
    grad.addColorStop(0.5, '#2a3752');
    grad.addColorStop(0.58, '#6e423a');
    grad.addColorStop(0.68, '#202634');
    grad.addColorStop(1, '#0e131d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    const glow = ctx.createRadialGradient(680, 265, 12, 680, 265, 240);
    glow.addColorStop(0, 'rgba(255, 162, 86, 0.56)');
    glow.addColorStop(0.45, 'rgba(218, 96, 62, 0.24)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(400, 20, 540, 440);

    ctx.fillStyle = 'rgba(226, 238, 255, 0.58)';
    const rng = mulberry32(902);
    for (let i = 0; i < 140; i++) {
      ctx.fillRect(rng() * 1024, rng() * 145, 1.8, 1.8);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 512x512 AAA PBR Map Material Library with true Sobel Normal Maps + Roughness Maps.
 * Repeat is kept at (1, 1) because world-space UV scaling is applied per box in GameEngine
 * so sandstone blocks, bricks, sandbags, and concrete slabs never stretch on long walls!
 */
export function createMaterialLibrary(renderer: THREE.WebGLRenderer): MaterialLibrary {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const textures: THREE.Texture[] = [];

  const track = (t: THREE.CanvasTexture) => {
    textures.push(t);
    return t;
  };

  // 1. Weathered Ashlar Sandstone Masonry (512x512)
  const makeSandstone = (base: string, mortar: string, seed: number) => {
    const [c, ctx] = makeCanvas(512, 512);
    const rng = mulberry32(seed);
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, 512, 512);
    const rows = 8;
    const rowH = 512 / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const offset = (r % 2) * 64;
      for (let x = -64; x < 512; x += 128) {
        const bx = x + offset;
        ctx.fillStyle = base;
        ctx.fillRect(bx + 3, y + 3, 122, rowH - 6);
        const tint = (rng() - 0.5) * 26;
        ctx.fillStyle = tint > 0 ? `rgba(255,244,220,${tint / 220})` : `rgba(60,40,20,${-tint / 220})`;
        ctx.fillRect(bx + 3, y + 3, 122, rowH - 6);
        // Subtle bevel edge highlight on top & shadow on bottom of each stone
        ctx.fillStyle = 'rgba(255,248,230,0.14)';
        ctx.fillRect(bx + 3, y + 3, 122, 4);
        ctx.fillStyle = 'rgba(40,28,16,0.22)';
        ctx.fillRect(bx + 3, y + rowH - 7, 122, 4);
      }
    }
    // Weathering grime & plaster erosion patches
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(90,68,42,0.1)' : 'rgba(235,216,184,0.08)';
      ctx.beginPath();
      ctx.ellipse(rng() * 512, rng() * 512, 22 + rng() * 44, 14 + rng() * 28, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    addFineGrain(ctx, 512, 512, 24, seed + 1);
    return {
      map: track(finalizeTexture(c, maxAniso, 1, 1, true)),
      normal: track(makeNormalMapFromCanvas(c, maxAniso, 2.8, 1, 1)),
      rough: track(makeRoughnessFromCanvas(c, maxAniso, 0.72, 0.96, true, 1, 1)),
    };
  };

  // 2. Poured Industrial Concrete Panels with Rain Streaks & Formwork Tie Holes
  const makeConcrete = (base: string, dark: boolean, seed: number) => {
    const [c, ctx] = makeCanvas(512, 512);
    const rng = mulberry32(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    // Subtle blotchy concrete aggregate variation
    for (let i = 0; i < 45; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
      ctx.beginPath();
      ctx.arc(rng() * 512, rng() * 512, 24 + rng() * 55, 0, Math.PI * 2);
      ctx.fill();
    }
    // Vertical rain weathering streaks
    for (let i = 0; i < 24; i++) {
      const sx = rng() * 512;
      const g = ctx.createLinearGradient(0, 0, 0, 240 + rng() * 220);
      g.addColorStop(0, 'rgba(0,0,0,0.16)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx, 0, 4 + rng() * 10, 512);
    }
    ctx.strokeStyle = dark ? 'rgba(0,0,0,0.48)' : 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 252);
    ctx.strokeRect(258, 2, 252, 252);
    ctx.strokeRect(2, 258, 252, 252);
    ctx.strokeRect(258, 258, 252, 252);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    for (const [hx, hy] of [
      [34, 34],
      [222, 34],
      [34, 222],
      [222, 222],
      [290, 34],
      [478, 34],
      [290, 290],
      [478, 478],
    ]) {
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    addFineGrain(ctx, 512, 512, 24, seed + 1);
    return {
      map: track(finalizeTexture(c, maxAniso, 1, 1, true)),
      normal: track(makeNormalMapFromCanvas(c, maxAniso, 2.2, 1, 1)),
      rough: track(makeRoughnessFromCanvas(c, maxAniso, 0.65, 0.94, true, 1, 1)),
    };
  };

  // 3. Corrugated Shipping Container with Realistic Painted Steel Ribs & Rust Wear
  const makeContainer = (base: string, stripe: string, seed: number) => {
    const [c, ctx] = makeCanvas(512, 512);
    const rng = mulberry32(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 24) {
      const g = ctx.createLinearGradient(x, 0, x + 24, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.38)');
      g.addColorStop(0.28, 'rgba(0,0,0,0.06)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
      g.addColorStop(0.85, 'rgba(0,0,0,0.14)');
      g.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 24, 512);
    }
    ctx.fillStyle = stripe;
    ctx.fillRect(0, 0, 512, 28);
    ctx.fillRect(0, 484, 512, 28);
    // Stencil logistics markings
    ctx.fillStyle = 'rgba(240,245,250,0.44)';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('SF-CARGO 402', 36, 76);
    ctx.fillRect(36, 90, 110, 5);
    // Edge rust streaks
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = 'rgba(92,42,18,0.18)';
      ctx.fillRect(rng() * 512, 430 + rng() * 60, 12 + rng() * 34, 14 + rng() * 24);
    }
    addFineGrain(ctx, 512, 512, 16, seed + 1);
    return {
      map: track(finalizeTexture(c, maxAniso, 1, 1, true)),
      normal: track(makeNormalMapFromCanvas(c, maxAniso, 3.2, 1, 1)),
      rough: track(makeRoughnessFromCanvas(c, maxAniso, 0.34, 0.68, true, 1, 1)),
    };
  };

  // 4. Heavy Military Supply Crate with Wood Grain, Cross Bracing & Steel Corner Brackets
  const makeCrate = (base: string, trim: string, seed: number) => {
    const [c, ctx] = makeCanvas(512, 512);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.lineWidth = 4;
    for (let y = 64; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    ctx.strokeStyle = trim;
    ctx.lineWidth = 34;
    ctx.strokeRect(17, 17, 478, 478);
    ctx.beginPath();
    ctx.moveTo(28, 28);
    ctx.lineTo(484, 484);
    ctx.stroke();
    // Bolted steel corner plates
    ctx.fillStyle = '#20252c';
    for (const [cx, cy] of [
      [0, 0],
      [456, 0],
      [0, 456],
      [456, 456],
    ]) {
      ctx.fillRect(cx, cy, 56, 56);
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(cx + 28, cy + 28, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#20252c';
    }
    ctx.fillStyle = 'rgba(245,235,200,0.35)';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('NATO 5.56MM', 72, 92);
    addFineGrain(ctx, 512, 512, 20, seed);
    return {
      map: track(finalizeTexture(c, maxAniso, 1, 1, true)),
      normal: track(makeNormalMapFromCanvas(c, maxAniso, 2.5, 1, 1)),
      rough: track(makeRoughnessFromCanvas(c, maxAniso, 0.65, 0.92, true, 1, 1)),
    };
  };

  // 5. Urban Weathered Brick Masonry
  const makeBrick = () => {
    const [c, ctx] = makeCanvas(512, 512);
    const rng = mulberry32(1010);
    ctx.fillStyle = '#2e2420';
    ctx.fillRect(0, 0, 512, 512);
    const rows = 16;
    const h = 512 / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 32;
      for (let x = -32; x < 512; x += 64) {
        const shade = 0.78 + rng() * 0.36;
        ctx.fillStyle = `rgb(${Math.floor(114 * shade)}, ${Math.floor(60 * shade)}, ${Math.floor(48 * shade)})`;
        ctx.fillRect(x + off + 3, r * h + 3, 58, h - 6);
      }
    }
    addFineGrain(ctx, 512, 512, 24, 1011);
    return {
      map: track(finalizeTexture(c, maxAniso, 1, 1, true)),
      normal: track(makeNormalMapFromCanvas(c, maxAniso, 3.0, 1, 1)),
      rough: track(makeRoughnessFromCanvas(c, maxAniso, 0.74, 0.96, true, 1, 1)),
    };
  };

  // 6. Photorealistic Woven Burlap Stacked Sandbags (replaces cartoonish ovals!)
  const makeSandbag = () => {
    const [c, ctx] = makeCanvas(512, 512);
    const rng = mulberry32(1020);
    ctx.fillStyle = '#3b3021';
    ctx.fillRect(0, 0, 512, 512);
    const rows = 8;
    const rh = 512 / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 85;
      for (let x = -85; x < 512; x += 170) {
        const bx = x + off;
        const by = r * rh;
        const grad = ctx.createLinearGradient(bx, by, bx, by + rh);
        const tone = r % 2 === 0 ? 0 : -10;
        grad.addColorStop(0, `rgb(${176 + tone},${154 + tone},${116 + tone})`);
        grad.addColorStop(0.45, `rgb(${156 + tone},${134 + tone},${98 + tone})`);
        grad.addColorStop(0.85, `rgb(${102 + tone},${85 + tone},${60 + tone})`);
        grad.addColorStop(1, `rgb(${64 + tone},${52 + tone},${36 + tone})`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(bx + 3, by + 4, 164, rh - 7, 16);
        ctx.fill();

        // Woven burlap creases & tie-end pinch
        ctx.strokeStyle = 'rgba(42,30,16,0.34)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx + 24, by + 10);
        ctx.quadraticCurveTo(bx + 85, by + rh * 0.55, bx + 146, by + 12);
        ctx.stroke();

        // Coarse burlap cross-weave threads
        ctx.strokeStyle = 'rgba(255,245,220,0.065)';
        ctx.lineWidth = 1;
        for (let wx = bx + 8; wx < bx + 160; wx += 8) {
          ctx.beginPath();
          ctx.moveTo(wx, by + 6);
          ctx.lineTo(wx, by + rh - 6);
          ctx.stroke();
        }
        // Subtle sand dust speck
        if (rng() > 0.5) {
          ctx.fillStyle = 'rgba(218,195,152,0.12)';
          ctx.fillRect(bx + 30, by + 8, 90, 12);
        }
      }
    }
    addFineGrain(ctx, 512, 512, 26, 1021);
    return {
      map: track(finalizeTexture(c, maxAniso, 1, 1, true)),
      normal: track(makeNormalMapFromCanvas(c, maxAniso, 3.6, 1, 1)),
      rough: track(makeRoughnessFromCanvas(c, maxAniso, 0.82, 0.98, true, 1, 1)),
    };
  };

  // 7. Industrial Hazard Steel Plate
  const makeHazardMetal = () => {
    const [c, ctx] = makeCanvas(512, 512);
    ctx.fillStyle = '#303640';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#d99a1e';
    for (let i = -512; i < 1024; i += 84) {
      ctx.beginPath();
      ctx.moveTo(i, 392);
      ctx.lineTo(i + 42, 392);
      ctx.lineTo(i + 114, 512);
      ctx.lineTo(i + 72, 512);
      ctx.closePath();
      ctx.fill();
    }
    addFineGrain(ctx, 512, 512, 18, 1030);
    return {
      map: track(finalizeTexture(c, maxAniso, 1, 1, true)),
      normal: track(makeNormalMapFromCanvas(c, maxAniso, 2.0, 1, 1)),
      rough: track(makeRoughnessFromCanvas(c, maxAniso, 0.32, 0.65, true, 1, 1)),
    };
  };

  // 8. 512x512 Detailed Tactical Ground Floors (Sand, Concrete, Wet-Sheen Night Asphalt)
  const makeFloor = (type: 'sand' | 'concrete' | 'asphalt') => {
    const [c, ctx] = makeCanvas(512, 512);
    const rng = mulberry32(type === 'sand' ? 1101 : type === 'concrete' ? 1102 : 1103);
    if (type === 'sand') {
      ctx.fillStyle = '#bc9c6e';
      ctx.fillRect(0, 0, 512, 512);
      // Wind-swept organic desert sand ripples + gravel patches
      for (let y = 0; y < 512; y += 14) {
        ctx.strokeStyle = y % 28 === 0 ? 'rgba(128,94,52,0.22)' : 'rgba(235,212,172,0.16)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(170, y + 6, 340, y - 6, 512, y);
        ctx.stroke();
      }
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = rng() > 0.5 ? 'rgba(110,82,48,0.22)' : 'rgba(218,195,156,0.18)';
        ctx.beginPath();
        ctx.arc(rng() * 512, rng() * 512, 2 + rng() * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      addFineGrain(ctx, 512, 512, 28, 1104);
      return {
        map: track(finalizeTexture(c, maxAniso, 22, 22, true)),
        normal: track(makeNormalMapFromCanvas(c, maxAniso, 2.0, 22, 22)),
        rough: track(makeRoughnessFromCanvas(c, maxAniso, 0.82, 0.98, true, 22, 22)),
      };
    }
    if (type === 'concrete') {
      ctx.fillStyle = '#525963';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(0,0,0,0.34)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 252);
      ctx.strokeRect(258, 2, 252, 252);
      ctx.strokeRect(2, 258, 252, 252);
      ctx.strokeRect(258, 258, 252, 252);
      ctx.fillStyle = 'rgba(230, 178, 45, 0.34)';
      ctx.fillRect(0, 246, 512, 12);
      for (let i = 0; i < 32; i++) {
        ctx.fillStyle = 'rgba(18,22,28,0.14)';
        ctx.beginPath();
        ctx.arc(rng() * 512, rng() * 512, 14 + rng() * 34, 0, Math.PI * 2);
        ctx.fill();
      }
      addFineGrain(ctx, 512, 512, 24, 1105);
      return {
        map: track(finalizeTexture(c, maxAniso, 14, 14, true)),
        normal: track(makeNormalMapFromCanvas(c, maxAniso, 1.8, 14, 14)),
        rough: track(makeRoughnessFromCanvas(c, maxAniso, 0.56, 0.88, true, 14, 14)),
      };
    }
    ctx.fillStyle = '#232832';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 55; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.14)';
      ctx.fillRect(rng() * 512, rng() * 512, 26 + rng() * 42, 2);
    }
    ctx.fillStyle = 'rgba(235, 198, 78, 0.25)';
    ctx.fillRect(250, 24, 12, 96);
    ctx.fillRect(250, 280, 12, 96);
    addFineGrain(ctx, 512, 512, 30, 1106);
    return {
      map: track(finalizeTexture(c, maxAniso, 18, 18, true)),
      normal: track(makeNormalMapFromCanvas(c, maxAniso, 2.2, 18, 18)),
      rough: track(makeRoughnessFromCanvas(c, maxAniso, 0.45, 0.86, true, 18, 18)),
    };
  };

  const sand1 = makeSandstone('#c8ab80', '#7c623d', 2001);
  const sand2 = makeSandstone('#9e825a', '#594429', 2002);
  const conc1 = makeConcrete('#767e8b', false, 2003);
  const conc2 = makeConcrete('#424955', true, 2004);
  const crWood = makeCrate('#9a7042', '#75522c', 2005);
  const crOlive = makeCrate('#475639', '#313d27', 2006);
  const contR = makeContainer('#8c2a25', '#571815', 2007);
  const contB = makeContainer('#24436b', '#152944', 2008);
  const contO = makeContainer('#3e4e36', '#283322', 2009);
  const brick = makeBrick();
  const sandbag = makeSandbag();
  const hazard = makeHazardMetal();

  const boxMaterials: Record<BoxMaterialType, THREE.MeshStandardMaterial> = {
    sandstone: new THREE.MeshStandardMaterial({
      map: sand1.map,
      normalMap: sand1.normal,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: sand1.rough,
      roughness: 1.0,
      metalness: 0.03,
    }),
    sandstone_dark: new THREE.MeshStandardMaterial({
      map: sand2.map,
      normalMap: sand2.normal,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughnessMap: sand2.rough,
      roughness: 1.0,
      metalness: 0.04,
    }),
    concrete: new THREE.MeshStandardMaterial({
      map: conc1.map,
      normalMap: conc1.normal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: conc1.rough,
      roughness: 1.0,
      metalness: 0.07,
    }),
    concrete_dark: new THREE.MeshStandardMaterial({
      map: conc2.map,
      normalMap: conc2.normal,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: conc2.rough,
      roughness: 1.0,
      metalness: 0.12,
    }),
    crate_wood: new THREE.MeshStandardMaterial({
      map: crWood.map,
      normalMap: crWood.normal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: crWood.rough,
      roughness: 1.0,
      metalness: 0.08,
    }),
    crate_olive: new THREE.MeshStandardMaterial({
      map: crOlive.map,
      normalMap: crOlive.normal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: crOlive.rough,
      roughness: 1.0,
      metalness: 0.16,
    }),
    container_red: new THREE.MeshStandardMaterial({
      map: contR.map,
      normalMap: contR.normal,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughnessMap: contR.rough,
      roughness: 1.0,
      metalness: 0.62,
    }),
    container_blue: new THREE.MeshStandardMaterial({
      map: contB.map,
      normalMap: contB.normal,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughnessMap: contB.rough,
      roughness: 1.0,
      metalness: 0.62,
    }),
    container_olive: new THREE.MeshStandardMaterial({
      map: contO.map,
      normalMap: contO.normal,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughnessMap: contO.rough,
      roughness: 1.0,
      metalness: 0.56,
    }),
    brick: new THREE.MeshStandardMaterial({
      map: brick.map,
      normalMap: brick.normal,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughnessMap: brick.rough,
      roughness: 1.0,
      metalness: 0.04,
    }),
    sandbag: new THREE.MeshStandardMaterial({
      map: sandbag.map,
      normalMap: sandbag.normal,
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughnessMap: sandbag.rough,
      roughness: 1.0,
      metalness: 0.02,
    }),
    metal_dark: new THREE.MeshStandardMaterial({
      color: 0x262c36,
      roughness: 0.34,
      metalness: 0.84,
    }),
    metal_yellow: new THREE.MeshStandardMaterial({
      map: hazard.map,
      normalMap: hazard.normal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: hazard.rough,
      roughness: 1.0,
      metalness: 0.64,
    }),
  };

  const fSand = makeFloor('sand');
  const fConc = makeFloor('concrete');
  const fAsph = makeFloor('asphalt');

  const floorMaterials = {
    sand: new THREE.MeshStandardMaterial({
      map: fSand.map,
      normalMap: fSand.normal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: fSand.rough,
      roughness: 1.0,
      metalness: 0.02,
    }),
    concrete: new THREE.MeshStandardMaterial({
      map: fConc.map,
      normalMap: fConc.normal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: fConc.rough,
      roughness: 1.0,
      metalness: 0.1,
    }),
    asphalt: new THREE.MeshStandardMaterial({
      map: fAsph.map,
      normalMap: fAsph.normal,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughnessMap: fAsph.rough,
      roughness: 1.0,
      metalness: 0.12,
    }),
  };

  return {
    boxMaterials,
    floorMaterials,
    dispose: () => {
      Object.values(boxMaterials).forEach((m) => m.dispose());
      Object.values(floorMaterials).forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
