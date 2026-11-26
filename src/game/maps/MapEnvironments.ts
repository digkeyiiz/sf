import * as THREE from 'three';
import type { MapId } from '../../shared/types';
import { getWeaponTextureSet } from '../textures';
import { mergeStaticChildrenByMaterial } from './StaticMapBatcher';

export interface MapAtmosphereConfig {
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  skyBottom: string;
  fogColor: number;
  fogDensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  rimColor: number;
  rimIntensity: number;
  rimPos: [number, number, number];
  particleColor: number;
  particleOpacity: number;
  hasSkyDome: boolean;
  sunDiscColor?: string;
}

/**
 * Grounded Tactical Realism atmosphere presets per battlefield (Master Prompt Section 8.3):
 * - desert_camp: Midday Arid Sun Outpost (crisp ochre heat haze, cobalt zenith)
 * - warehouse: Dusk Port Depot (twilight teal + warm sodium lamps + wet reflective puddles)
 * - crossroad: Misty Morning SEA Urban (soft cool mist + warm sunrise key + urban landmark towers)
 */
export function getMapAtmosphereConfig(mapId: MapId): MapAtmosphereConfig {
  if (mapId === 'desert_camp') {
    return {
      skyTop: '#245896',
      skyMid: '#5a94c7',
      skyHorizon: '#e8cfa6',
      skyBottom: '#c9aa7c',
      fogColor: 0xdcc59e,
      fogDensity: 0.0085,
      hemiSky: 0xd4e8ff,
      hemiGround: 0xa6875c,
      hemiIntensity: 0.92,
      sunColor: 0xfff0cc,
      sunIntensity: 2.25,
      sunPos: [30, 44, 20],
      rimColor: 0x7cb9f2,
      rimIntensity: 0.42,
      rimPos: [-28, 18, -24],
      particleColor: 0xe6cfa8,
      particleOpacity: 0.34,
      hasSkyDome: true,
      sunDiscColor: 'rgba(255, 248, 224, 0.9)',
    };
  }

  if (mapId === 'warehouse') {
    // Dusk Port Depot: industrial sodium orange + twilight teal sky
    return {
      skyTop: '#101d2e',
      skyMid: '#233b52',
      skyHorizon: '#945b3e',
      skyBottom: '#202630',
      fogColor: 0x202a38,
      fogDensity: 0.0115,
      hemiSky: 0x6b9ac4,
      hemiGround: 0x3b302a,
      hemiIntensity: 0.85,
      sunColor: 0xffa454,
      sunIntensity: 1.45,
      sunPos: [-24, 30, 22],
      rimColor: 0x34d399, // cool industrial fluorescent rim
      rimIntensity: 0.48,
      rimPos: [26, 16, -24],
      particleColor: 0xbfd4e6,
      particleOpacity: 0.24,
      hasSkyDome: true,
      sunDiscColor: 'rgba(255, 164, 88, 0.65)',
    };
  }

  // crossroad: Misty Morning Southeast Asian Urban District
  return {
    skyTop: '#4c7ba8',
    skyMid: '#8cb3d1',
    skyHorizon: '#dce7ef',
    skyBottom: '#8c99a3',
    fogColor: 0xc2d2de,
    fogDensity: 0.011,
    hemiSky: 0xd8ecfa,
    hemiGround: 0x5c666e,
    hemiIntensity: 0.98,
    sunColor: 0xfff1d2,
    sunIntensity: 1.9,
    sunPos: [28, 32, -26],
    rimColor: 0x93c5fd,
    rimIntensity: 0.4,
    rimPos: [-28, 18, 28],
    particleColor: 0xe2eef7,
    particleOpacity: 0.28,
    hasSkyDome: true,
    sunDiscColor: 'rgba(255, 247, 224, 0.82)',
  };
}

export function createAtmosphericSkyTexture(cfg: MapAtmosphereConfig): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, cfg.skyTop);
  grad.addColorStop(0.36, cfg.skyMid);
  grad.addColorStop(0.56, cfg.skyHorizon);
  grad.addColorStop(1.0, cfg.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  if (cfg.sunDiscColor) {
    const sunGrad = ctx.createRadialGradient(368, 72, 2, 368, 72, 58);
    sunGrad.addColorStop(0, cfg.sunDiscColor);
    sunGrad.addColorStop(0.35, 'rgba(255, 224, 172, 0.32)');
    sunGrad.addColorStop(1, 'rgba(255, 224, 172, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(300, 10, 140, 130);
  }

  // Soft distant cloud wisps
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(60 + i * 85, 62 + (i % 3) * 18, 52 + (i % 2) * 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds high-efficiency, batched/instanced environmental landmarks & dressing props per map
 * WITHOUT altering any MapBox[] collision geometry or sightlines!
 */
export function buildBatchedMapDressing(mapId: MapId): THREE.Group {
  const root = new THREE.Group();
  const tex = getWeaponTextureSet();

  const darkSteel = new THREE.MeshStandardMaterial({
    map: tex.gunmetal,
    normalMap: tex.gunmetalNormal,
    color: 0x3b434f,
    metalness: 0.8,
    roughness: 0.36,
  });
  const drumRed = new THREE.MeshStandardMaterial({
    color: 0x8f2c24,
    metalness: 0.45,
    roughness: 0.48,
  });
  const drumOlive = new THREE.MeshStandardMaterial({
    color: 0x3f4f37,
    metalness: 0.4,
    roughness: 0.52,
  });
  const canvasTarp = new THREE.MeshStandardMaterial({
    map: tex.desertCamo,
    color: 0xb0966e,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const coneOrange = new THREE.MeshStandardMaterial({ color: 0xea6815, roughness: 0.52 });
  const coneWhite = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.48 });

  // Instanced Fuel Barrels helper (replaces ~36 separate meshes with 2 InstancedMeshes!)
  const addInstancedBarrels = (clusters: Array<[number, number]>) => {
    const redTransforms: THREE.Matrix4[] = [];
    const oliveTransforms: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    for (const [cx, cz] of clusters) {
      redTransforms.push(m.clone().makeTranslation(cx, 0.46, cz));
      oliveTransforms.push(m.clone().makeTranslation(cx + 0.62, 0.46, cz + 0.25));
      oliveTransforms.push(m.clone().makeTranslation(cx + 0.24, 0.46, cz - 0.58));
    }
    const barrelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.92, 12);
    const redInst = new THREE.InstancedMesh(barrelGeo, drumRed, redTransforms.length);
    redTransforms.forEach((t, i) => redInst.setMatrixAt(i, t));
    redInst.castShadow = true;
    redInst.receiveShadow = true;
    root.add(redInst);

    const oliveGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.92, 12);
    const oliveInst = new THREE.InstancedMesh(oliveGeo, drumOlive, oliveTransforms.length);
    oliveTransforms.forEach((t, i) => oliveInst.setMatrixAt(i, t));
    oliveInst.castShadow = true;
    oliveInst.receiveShadow = true;
    root.add(oliveInst);
  };

  const addInstancedCones = (positions: Array<[number, number]>) => {
    const coneGeo = new THREE.ConeGeometry(0.17, 0.62, 10);
    const stripeGeo = new THREE.CylinderGeometry(0.085, 0.115, 0.14, 10);
    const coneInst = new THREE.InstancedMesh(coneGeo, coneOrange, positions.length);
    const stripeInst = new THREE.InstancedMesh(stripeGeo, coneWhite, positions.length);
    const mtx = new THREE.Matrix4();
    positions.forEach(([x, z], i) => {
      mtx.makeTranslation(x, 0.31, z);
      coneInst.setMatrixAt(i, mtx);
      mtx.makeTranslation(x, 0.38, z);
      stripeInst.setMatrixAt(i, mtx);
    });
    root.add(coneInst, stripeInst);
  };

  const staticGroup = new THREE.Group();

  if (mapId === 'desert_camp') {
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xd6d3cd, roughness: 0.45, metalness: 0.55 });
    for (const [wx, wz] of [
      [-27.2, -22.5],
      [27.2, 22.5],
    ]) {
      for (const [px, pz] of [
        [-1.7, -1.7],
        [1.7, -1.7],
        [-1.7, 1.7],
        [1.7, 1.7],
      ]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.5, 0.22), darkSteel);
        post.position.set(wx + px, 9.0, wz + pz);
        staticGroup.add(post);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.22, 4.8), canvasTarp);
      roof.position.set(wx, 10.3, wz);
      staticGroup.add(roof);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 8), darkSteel);
      pole.position.set(wx + 1.4, 11.8, wz + 1.4);
      staticGroup.add(pole);
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.88, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.38),
        dishMat
      );
      dish.position.set(wx + 1.4, 12.6, wz + 1.4);
      dish.rotation.x = Math.PI * 0.65;
      staticGroup.add(dish);
    }

    // Center Tactical Sunshade Tarps
    for (const tz of [-9.5, 9.5]) {
      const tarp = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.6), canvasTarp);
      tarp.rotation.x = -Math.PI / 2 + (tz < 0 ? 0.14 : -0.14);
      tarp.position.set(0, 4.7, tz);
      staticGroup.add(tarp);
    }

    // Instanced Desert Palms (6 trunks + 48 fronds = only 2 draw calls!)
    const palmSpots: Array<[number, number]> = [
      [-37, -14],
      [-36, 16],
      [37, -15],
      [36, 14],
      [-12, -33],
      [14, 33],
    ];
    const trunkMat = new THREE.MeshStandardMaterial({
      map: tex.woodGrain,
      color: 0x7b6144,
      roughness: 0.92,
    });
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x3e5c2c,
      roughness: 0.82,
      side: THREE.DoubleSide,
    });
    const trunkInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.22, 0.38, 9.4, 8),
      trunkMat,
      palmSpots.length
    );
    const frondGeo = new THREE.PlaneGeometry(0.95, 3.9, 1, 4);
    const fPos = frondGeo.attributes.position;
    for (let vi = 0; vi < fPos.count; vi++) {
      const y = fPos.getY(vi);
      const t = (y + 1.95) / 3.9;
      fPos.setZ(vi, -t * t * 1.05);
    }
    frondGeo.computeVertexNormals();
    const frondInst = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 8);

    const dummy = new THREE.Object3D();
    let fIdx = 0;
    palmSpots.forEach(([tx, tz], ti) => {
      dummy.position.set(tx, 4.7, tz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(ti, dummy.matrix);
      for (let f = 0; f < 8; f++) {
        const ang = (f / 8) * Math.PI * 2;
        dummy.position.set(tx + Math.sin(ang) * 1.75, 9.25, tz + Math.cos(ang) * 1.75);
        dummy.rotation.order = 'YXZ';
        dummy.rotation.set(Math.PI / 2 - 0.12, ang, 0);
        dummy.updateMatrix();
        frondInst.setMatrixAt(fIdx++, dummy.matrix);
      }
    });
    root.add(trunkInst, frondInst);

    addInstancedBarrels([
      [-19.5, -21],
      [19.5, 21],
      [-15.5, 8.2],
      [15.5, -8.2],
    ]);
  } else if (mapId === 'warehouse') {
    // Dusk Port Depot: Giant Yellow Gantry Crane + Subtle Wet Concrete Puddles + Dusk Industrial Beacons
    const craneYellow = new THREE.MeshStandardMaterial({
      color: 0xd9961f,
      metalness: 0.65,
      roughness: 0.34,
    });
    const craneBeam = new THREE.Mesh(new THREE.BoxGeometry(58, 0.9, 1.3), craneYellow);
    craneBeam.position.set(0, 9.4, -7);
    staticGroup.add(craneBeam);
    const craneBeam2 = new THREE.Mesh(new THREE.BoxGeometry(58, 0.7, 0.9), craneYellow);
    craneBeam2.position.set(0, 9.4, 9);
    staticGroup.add(craneBeam2);
    const craneTrolley = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 1.8), darkSteel);
    craneTrolley.position.set(6, 8.8, -7);
    staticGroup.add(craneTrolley);

    // Subtle reflective wet rainwater puddles on port warehouse floor (dusk reflections!)
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x1b2736,
      metalness: 0.82,
      roughness: 0.08,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const puddleSpots: Array<[number, number, number, number]> = [
      [-11, -2, 3.8, 2.4],
      [12, 3, 4.2, 2.8],
      [0, -13, 3.4, 2.2],
      [-4, 12, 3.6, 2.1],
    ];
    for (const [px, pz, rx, rz] of puddleSpots) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(1, 14), puddleMat);
      p.rotation.x = -Math.PI / 2;
      p.scale.set(rx, rz, 1);
      p.position.set(px, 0.015, pz);
      staticGroup.add(p);
    }

    // Cool green fluorescent tube accents along side bays contrasting warm sodium center lights
    const fluorMat = new THREE.MeshBasicMaterial({ color: 0x6ee7b7 });
    for (const fx of [-22, 22]) {
      for (const fz of [-14, 0, 14]) {
        const tube = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, 2.6), fluorMat);
        tube.position.set(fx, 8.6, fz);
        staticGroup.add(tube);
      }
    }

    addInstancedCones([
      [-18, -6],
      [-18, 6],
      [18, -6],
      [18, 6],
    ]);
    addInstancedBarrels([
      [-21, -18.5],
      [21, 18.5],
      [-5.5, 0.5],
      [5.5, -0.5],
    ]);
  } else if (mapId === 'crossroad') {
    // Misty Morning SEA Urban: Armored Tactical BearCat Centerpiece + Shopfront Awnings + Urban Windows
    const vanMat = new THREE.MeshStandardMaterial({
      color: 0x263142,
      metalness: 0.52,
      roughness: 0.34,
    });
    const glassDark = new THREE.MeshStandardMaterial({
      color: 0x162436,
      metalness: 0.9,
      roughness: 0.1,
    });
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.9 });
    const awningTeal = new THREE.MeshStandardMaterial({
      color: 0x2c5c63,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const awningRust = new THREE.MeshStandardMaterial({
      color: 0x8a4530,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const windowMorningMat = new THREE.MeshStandardMaterial({
      color: 0x5c7c96,
      metalness: 0.72,
      roughness: 0.18,
    });

    const upperCab = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.94, 4.05), vanMat);
    upperCab.position.set(0, 2.38, 0.15);
    upperCab.castShadow = true;
    staticGroup.add(upperCab);

    const bullBar = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.42, 0.24), darkSteel);
    bullBar.position.set(0, 1.05, -3.22);
    staticGroup.add(bullBar);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.48, 0.12), glassDark);
    windshield.position.set(0, 2.42, -1.86);
    staticGroup.add(windshield);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.64, 0.42, 12), darkSteel);
    turret.position.set(0, 3.0, 0.6);
    staticGroup.add(turret);
    const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.6, 8), darkSteel);
    mgBarrel.rotation.x = Math.PI / 2;
    mgBarrel.position.set(0, 3.1, -0.35);
    staticGroup.add(mgBarrel);

    // Tactical Amber/Sky Lightbar matching TASK FORCE / VIPER palette
    const lightbarBase = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.14, 0.32), darkSteel);
    lightbarBase.position.set(0, 2.9, -1.1);
    staticGroup.add(lightbarBase);
    const amberBeacon = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.16, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xffb020 })
    );
    amberBeacon.position.set(-0.42, 2.94, -1.1);
    staticGroup.add(amberBeacon);
    const skyBeacon = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.16, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x4fd1ff })
    );
    skyBeacon.position.set(0.42, 2.94, -1.1);
    staticGroup.add(skyBeacon);

    for (const wz of [-2.0, 0.1, 2.1]) {
      for (const wx of [-1.55, 1.55]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.42, 12), rubberMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.58, wz);
        staticGroup.add(wheel);
      }
    }

    // SEA Urban Shophouse Reflective Windows & Sloped Street Awnings
    const bldgs: Array<[number, number]> = [
      [-16, -16],
      [16, -16],
      [-16, 16],
      [16, 16],
    ];
    bldgs.forEach(([bx, bz], idx) => {
      const faceZ = bz < 0 ? bz + 5.04 : bz - 5.04;
      const faceX = bx < 0 ? bx + 5.54 : bx - 5.54;
      const awningMat = idx % 2 === 0 ? awningTeal : awningRust;
      const awning = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 1.7), awningMat);
      awning.position.set(bx, 2.55, faceZ + (bz < 0 ? 0.72 : -0.72));
      awning.rotation.x = bz < 0 ? -Math.PI / 2 + 0.35 : -Math.PI / 2 - 0.35;
      staticGroup.add(awning);

      for (const wy of [3.5, 5.5]) {
        for (const wxOff of [-3.2, 0, 3.2]) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), windowMorningMat);
          win.position.set(bx + wxOff, wy, faceZ);
          if (bz > 0) win.rotation.y = Math.PI;
          staticGroup.add(win);
        }
        for (const wzOff of [-2.6, 2.6]) {
          const win2 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), windowMorningMat);
          win2.position.set(faceX, wy, bz + wzOff);
          win2.rotation.y = bx < 0 ? Math.PI / 2 : -Math.PI / 2;
          staticGroup.add(win2);
        }
      }
    });

    addInstancedCones([
      [-4.5, -5.5],
      [4.5, -5.5],
      [-4.5, 5.5],
      [4.5, 5.5],
    ]);
    addInstancedBarrels([
      [-10.5, -10.5],
      [10.5, 10.5],
    ]);
  }

  // Merge all static dressing parts by material -> turns ~90 meshes into ~6-10 draw calls!
  mergeStaticChildrenByMaterial(staticGroup);
  root.add(staticGroup);

  return root;
}
