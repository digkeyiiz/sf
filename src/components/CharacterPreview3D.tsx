import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type { CharacterLoadout, PrimaryWeaponId, TeamId } from '../shared/types';
import { buildOperatorModel, type OperatorModelHandle } from '../game/models';
import { getWeaponTextureSet } from '../game/textures';

export type CameraPresetId = 'full' | 'head' | 'vest' | 'weapon';
export type ShowcasePoseId = 'combat' | 'inspect' | 'at_ease';

interface CharacterPreview3DProps {
  loadout: CharacterLoadout;
  weaponId: PrimaryWeaponId;
  team?: TeamId;
  name: string;
  rankShort?: string;
  variant?: 'armory' | 'lobby';
  externalPose?: ShowcasePoseId;
  hideOverlayControls?: boolean;
}

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  full: { label: 'เต็มตัว', pos: [0.58, 1.32, 2.85], target: [0, 0.98, 0] },
  head: { label: 'หมวก & หน้า', pos: [0.22, 1.72, 0.96], target: [0, 1.66, 0] },
  vest: { label: 'ชุด & เกราะ', pos: [0.36, 1.32, 1.38], target: [0, 1.24, 0] },
  weapon: { label: 'อาวุธ', pos: [-0.58, 1.25, 1.35], target: [-0.14, 1.2, 0.25] },
};

const LOBBY_CAMERA = {
  pos: [0.28, 1.22, 3.25] as [number, number, number],
  target: [0, 0.98, 0] as [number, number, number],
};

export const SHOWCASE_POSES: Record<
  ShowcasePoseId,
  {
    label: string;
    torsoY: number;
    torsoRotY: number;
    torsoRotX: number;
    headRotY: number;
    headRotX: number;
    leftHip: number;
    leftKnee: number;
    rightHip: number;
    rightKnee: number;
    leftArmX: number;
    rightArmX: number;
    weaponRotX: number;
    weaponRotY: number;
    weaponRotZ: number;
    weaponPosY: number;
  }
> = {
  combat: {
    label: 'พร้อมรบ',
    torsoY: 0.875,
    torsoRotY: 0.14,
    torsoRotX: -0.04,
    headRotY: -0.12,
    headRotX: 0.02,
    leftHip: 0.12,
    leftKnee: -0.18,
    rightHip: -0.08,
    rightKnee: -0.06,
    leftArmX: 0,
    rightArmX: 0,
    weaponRotX: 0,
    weaponRotY: 0,
    weaponRotZ: 0,
    weaponPosY: 0.365,
  },
  inspect: {
    label: 'ตรวจอาวุธ',
    torsoY: 0.88,
    torsoRotY: -0.18,
    torsoRotX: 0.01,
    headRotY: 0.18,
    headRotX: -0.12,
    leftHip: 0.08,
    leftKnee: -0.1,
    rightHip: -0.06,
    rightKnee: -0.04,
    leftArmX: 0.14,
    rightArmX: 0.12,
    weaponRotX: 0.14,
    weaponRotY: 0.42,
    weaponRotZ: -0.26,
    weaponPosY: 0.41,
  },
  at_ease: {
    label: 'ยืนพัก',
    torsoY: 0.885,
    torsoRotY: 0.04,
    torsoRotX: 0.02,
    headRotY: 0.06,
    headRotX: 0.04,
    leftHip: 0.04,
    leftKnee: -0.04,
    rightHip: -0.03,
    rightKnee: -0.02,
    leftArmX: -0.22,
    rightArmX: -0.24,
    weaponRotX: -0.34,
    weaponRotY: 0.12,
    weaponRotZ: 0.08,
    weaponPosY: 0.275,
  },
};

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * Procedural open-air alpine coastal tactical base sky dome (echoes PUBG / AAA shooter lobbies).
 */
function createLobbySkyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#1e4b82');
  grad.addColorStop(0.28, '#4f86be');
  grad.addColorStop(0.48, '#a6c6e2');
  grad.addColorStop(0.56, '#d9e4ee');
  grad.addColorStop(0.62, '#92a3b4');
  grad.addColorStop(0.74, '#4e5963');
  grad.addColorStop(1.0, '#2c3238');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Soft sunlit sky clouds
  const drawCloud = (cx: number, cy: number, rx: number, ry: number, alpha: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1);
    g.addColorStop(0, `rgba(255, 252, 246, ${alpha})`);
    g.addColorStop(0.6, `rgba(232, 240, 250, ${alpha * 0.45})`);
    g.addColorStop(1, 'rgba(232, 240, 250, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  drawCloud(210, 145, 160, 42, 0.48);
  drawCloud(560, 118, 220, 48, 0.42);
  drawCloud(830, 165, 180, 38, 0.46);
  drawCloud(390, 195, 190, 34, 0.36);

  // Distant sunlit mountain ridge panorama along horizon
  ctx.fillStyle = '#60758c';
  ctx.beginPath();
  ctx.moveTo(0, 305);
  const peaks1 = [0, 70, 150, 240, 330, 430, 520, 620, 730, 840, 930, 1024];
  const heights1 = [278, 246, 266, 228, 264, 252, 232, 260, 224, 254, 240, 278];
  for (let i = 0; i < peaks1.length; i++) {
    ctx.lineTo(peaks1[i], heights1[i]);
  }
  ctx.lineTo(1024, 335);
  ctx.lineTo(0, 335);
  ctx.closePath();
  ctx.fill();

  // Closer atmospheric conifer/cliff ridge
  ctx.fillStyle = '#3b4a56';
  ctx.beginPath();
  ctx.moveTo(0, 325);
  const peaks2 = [0, 90, 190, 290, 410, 540, 660, 780, 890, 1024];
  const heights2 = [292, 276, 295, 270, 286, 282, 268, 284, 272, 292];
  for (let i = 0; i < peaks2.length; i++) {
    ctx.lineTo(peaks2[i], heights2[i]);
  }
  ctx.lineTo(1024, 360);
  ctx.lineTo(0, 360);
  ctx.closePath();
  ctx.fill();

  // Subtle coastal water shimmer near horizon
  const waterGrad = ctx.createLinearGradient(0, 285, 0, 325);
  waterGrad.addColorStop(0, 'rgba(182, 212, 236, 0.45)');
  waterGrad.addColorStop(1, 'rgba(72, 96, 118, 0.2)');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, 288, 1024, 32);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural rugged outdoor rocky gravel & weathered tactical staging pad ground texture.
 */
function createStagingGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7b786f';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle earthen/gravel blotches
  let seed = 4219;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 320; i++) {
    const x = rng() * 512;
    const y = rng() * 512;
    const r = 6 + rng() * 34;
    ctx.fillStyle =
      rng() > 0.5 ? 'rgba(92, 88, 76, 0.25)' : 'rgba(155, 150, 138, 0.22)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tire track impressions & subtle pebbles
  ctx.fillStyle = 'rgba(42, 44, 38, 0.22)';
  for (let i = 0; i < 900; i++) {
    ctx.fillRect(rng() * 512, rng() * 512, 2 + rng() * 2, 2 + rng() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural 3D Armored Military 4x4 Tactical Jeep (parked in lobby background like classic military shooters).
 */
function buildTacticalJeep(
  trackG: <T extends THREE.BufferGeometry>(g: T) => T,
  trackM: <T extends THREE.Material>(m: T) => T,
  gunmetalTex: THREE.CanvasTexture
): THREE.Group {
  const jeep = new THREE.Group();

  const bodyMat = trackM(
    new THREE.MeshPhysicalMaterial({
      map: gunmetalTex,
      color: 0x4b533e,
      roughness: 0.68,
      metalness: 0.28,
      clearcoat: 0.12,
    })
  );
  const darkMetalMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x1b1f24,
      roughness: 0.52,
      metalness: 0.65,
    })
  );
  const tireMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x14161a,
      roughness: 0.9,
      metalness: 0.05,
    })
  );
  const glassMat = trackM(
    new THREE.MeshPhysicalMaterial({
      color: 0x203447,
      roughness: 0.12,
      metalness: 0.45,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.85,
    })
  );
  const headlightMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xfff5d6,
      emissive: 0xfde68a,
      emissiveIntensity: 0.45,
      roughness: 0.2,
    })
  );

  // Lower chassis tub & wheel fenders
  const lowerBody = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.76, 0.68, 3.65)), bodyMat);
  lowerBody.position.set(0, 0.78, 0);
  lowerBody.castShadow = true;
  lowerBody.receiveShadow = true;
  jeep.add(lowerBody);

  // Hood slope
  const hood = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.62, 0.22, 1.25)), bodyMat);
  hood.position.set(0, 1.18, 1.12);
  hood.rotation.x = 0.06;
  hood.castShadow = true;
  jeep.add(hood);

  // Cabin roof & pillars
  const cabin = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.66, 0.72, 2.05)), bodyMat);
  cabin.position.set(0, 1.46, -0.45);
  cabin.castShadow = true;
  jeep.add(cabin);

  // Windshield & side windows
  const windshield = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.48, 0.48, 0.08)), glassMat);
  windshield.position.set(0, 1.45, 0.56);
  windshield.rotation.x = -0.22;
  jeep.add(windshield);

  for (const sx of [-0.84, 0.84]) {
    const sideWin = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.05, 0.42, 1.65)), glassMat);
    sideWin.position.set(sx, 1.48, -0.42);
    jeep.add(sideWin);
  }

  // Front grille, bullbar bumper & twin round headlights
  const bumper = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.88, 0.22, 0.26)), darkMetalMat);
  bumper.position.set(0, 0.54, 1.88);
  jeep.add(bumper);

  const bullbar = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.22, 0.42, 0.1)), darkMetalMat);
  bullbar.position.set(0, 0.84, 1.92);
  jeep.add(bullbar);

  for (const hx of [-0.58, 0.58]) {
    const light = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14)), headlightMat);
    light.rotation.x = Math.PI / 2;
    light.position.set(hx, 0.96, 1.83);
    jeep.add(light);
  }

  // Heavy off-road wheels + steel rims
  const wheelGeo = trackG(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 18));
  const rimGeo = trackG(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 14));
  for (const [wx, wz] of [
    [-0.92, 1.18],
    [0.92, 1.18],
    [-0.92, -1.12],
    [0.92, -1.12],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    jeep.add(wheel);

    const rim = new THREE.Mesh(rimGeo, darkMetalMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, 0.42, wz);
    jeep.add(rim);
  }

  // Rear mounted spare wheel + roof cargo rack
  const spare = new THREE.Mesh(wheelGeo, tireMat);
  spare.rotation.x = Math.PI / 2;
  spare.position.set(0, 0.96, -1.94);
  jeep.add(spare);

  const rack = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.48, 0.08, 1.65)), darkMetalMat);
  rack.position.set(0, 1.86, -0.45);
  jeep.add(rack);

  return jeep;
}

/**
 * AAA 360° Tactical Armory Showcase Turntable & Open-Air Command Lobby Backdrop.
 */
export const CharacterPreview3D: React.FC<CharacterPreview3DProps> = ({
  loadout,
  weaponId,
  team = 'blue',
  name,
  rankShort,
  variant = 'armory',
  externalPose,
  hideOverlayControls = false,
}) => {
  const isLobby = variant === 'lobby';
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const operatorRef = useRef<OperatorModelHandle | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const cameraGoalRef = useRef<{
    pos: THREE.Vector3;
    target: THREE.Vector3;
    active: boolean;
  }>({
    pos: new THREE.Vector3(...(isLobby ? LOBBY_CAMERA.pos : CAMERA_PRESETS.full.pos)),
    target: new THREE.Vector3(...(isLobby ? LOBBY_CAMERA.target : CAMERA_PRESETS.full.target)),
    active: false,
  });

  const [activePreset, setActivePreset] = useState<CameraPresetId>('full');
  const [activePose, setActivePose] = useState<ShowcasePoseId>(externalPose ?? 'combat');
  const activePoseRef = useRef<ShowcasePoseId>(externalPose ?? 'combat');
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    if (externalPose) {
      setActivePose(externalPose);
      activePoseRef.current = externalPose;
      requestRenderRef.current();
    }
  }, [externalPose]);

  const selectPreset = (preset: CameraPresetId) => {
    setActivePreset(preset);
    const p = CAMERA_PRESETS[preset];
    cameraGoalRef.current.pos.set(...p.pos);
    cameraGoalRef.current.target.set(...p.target);
    cameraGoalRef.current.active = true;
    requestRenderRef.current();
  };

  const selectPose = (pose: ShowcasePoseId) => {
    setActivePose(pose);
    activePoseRef.current = pose;
    requestRenderRef.current();
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const width = container.clientWidth || 380;
    const height = container.clientHeight || 420;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }
    setWebglUnavailable(false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isLobby ? 1.18 : 1.24;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(width, height);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isLobby ? 0x6f97bf : 0x090d16);
    scene.fog = isLobby
      ? new THREE.FogExp2(0xa4bfd6, 0.032)
      : new THREE.FogExp2(0x090d16, 0.085);
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const defaultCam = isLobby ? LOBBY_CAMERA : CAMERA_PRESETS.full;
    const camera = new THREE.PerspectiveCamera(isLobby ? 36 : 34, width / height, 0.08, 90);
    camera.position.set(...defaultCam.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...defaultCam.target);
    controls.enablePan = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = isLobby ? 1.7 : 0.85;
    controls.maxDistance = isLobby ? 4.8 : 4.4;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.update();

    const onControlStart = () => {
      cameraGoalRef.current.active = false;
    };
    controls.addEventListener('start', onControlStart);

    const tex = getWeaponTextureSet();
    const studioGeos: THREE.BufferGeometry[] = [];
    const studioMats: THREE.Material[] = [];
    const studioTextures: THREE.Texture[] = [];
    const trackG = <T extends THREE.BufferGeometry>(g: T) => {
      studioGeos.push(g);
      return g;
    };
    const trackM = <T extends THREE.Material>(m: T) => {
      studioMats.push(m);
      return m;
    };

    if (isLobby) {
      // Bright Open-Air Daylight Lighting (PUBG Mobile / Tactical Outpost feel)
      const hemi = new THREE.HemisphereLight(0xeef6ff, 0x5c584e, 1.15);
      scene.add(hemi);

      const sunLight = new THREE.DirectionalLight(0xfff4de, 2.75);
      sunLight.position.set(4.2, 6.8, 4.5);
      if (!isSoftwareGl) {
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(1024, 1024);
        sunLight.shadow.bias = -0.0004;
        sunLight.shadow.normalBias = 0.02;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 22;
        const d = 5.5;
        sunLight.shadow.camera.left = -d;
        sunLight.shadow.camera.right = d;
        sunLight.shadow.camera.top = d;
        sunLight.shadow.camera.bottom = -d;
      }
      scene.add(sunLight);

      const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.25);
      rimLight.position.set(-4.0, 3.2, -3.5);
      scene.add(rimLight);

      // Panoramic Open-Air Alpine Coastal Sky Dome
      const skyTex = createLobbySkyTexture();
      studioTextures.push(skyTex);
      const skyDome = new THREE.Mesh(
        trackG(new THREE.SphereGeometry(42, 32, 20)),
        trackM(
          new THREE.MeshBasicMaterial({
            map: skyTex,
            side: THREE.BackSide,
            fog: false,
          })
        )
      );
      skyDome.rotation.y = Math.PI * 0.6;
      scene.add(skyDome);

      // Rugged Rocky Gravel Tactical Outpost Ground
      const groundTex = createStagingGroundTexture();
      studioTextures.push(groundTex);
      const groundMat = trackM(
        new THREE.MeshStandardMaterial({
          map: groundTex,
          roughness: 0.92,
          metalness: 0.04,
        })
      );
      const ground = new THREE.Mesh(trackG(new THREE.CircleGeometry(34, 48)), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      ground.receiveShadow = true;
      scene.add(ground);

      // Subtle Weathered Tactical Concrete Pad under Operator Boots
      const padMat = trackM(
        new THREE.MeshStandardMaterial({
          map: tex.polymerStipple,
          color: 0x5c6066,
          roughness: 0.85,
          metalness: 0.12,
        })
      );
      const stagingPad = new THREE.Mesh(trackG(new THREE.CylinderGeometry(1.1, 1.24, 0.04, 32)), padMat);
      stagingPad.position.y = -0.018;
      stagingPad.receiveShadow = true;
      scene.add(stagingPad);

      // Parked 3D Armored Tactical 4x4 Jeep on Left-Rear Flank (Signature PUBG-Style Lobby Prop!)
      const jeep = buildTacticalJeep(trackG, trackM, tex.gunmetal);
      jeep.position.set(-2.35, 0, -2.05);
      jeep.rotation.y = 0.62;
      scene.add(jeep);

      // Tactical Olive Military Crates on Right-Rear Flank
      const crateMat = trackM(
        new THREE.MeshStandardMaterial({
          map: tex.oliveRipstop,
          color: 0x48543d,
          roughness: 0.78,
          metalness: 0.16,
        })
      );
      const crate1 = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.95, 0.56, 0.65)), crateMat);
      crate1.position.set(2.35, 0.28, -2.4);
      crate1.rotation.y = -0.35;
      crate1.castShadow = true;
      crate1.receiveShadow = true;
      scene.add(crate1);

      const crate2 = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.62, 0.42, 0.52)), crateMat);
      crate2.position.set(2.25, 0.77, -2.42);
      crate2.rotation.y = -0.15;
      crate2.castShadow = true;
      scene.add(crate2);
    } else {
      // Studio Armory Dark Hangar Turntable
      const hemi = new THREE.HemisphereLight(0xdbeafe, 0x151c29, 0.78);
      scene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfff0d6, 2.5);
      keyLight.position.set(2.8, 4.4, 3.2);
      if (!isSoftwareGl) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.bias = -0.0004;
        keyLight.shadow.normalBias = 0.02;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 14;
        const d = 2.4;
        keyLight.shadow.camera.left = -d;
        keyLight.shadow.camera.right = d;
        keyLight.shadow.camera.top = d;
        keyLight.shadow.camera.bottom = -d;
      }
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x4fd1ff, 1.65);
      rimLight.position.set(-3.2, 2.9, -2.5);
      scene.add(rimLight);

      const fillLight = new THREE.DirectionalLight(0xffb020, 0.72);
      fillLight.position.set(2.5, 1.3, -2.2);
      scene.add(fillLight);

      if (!isSoftwareGl) {
        RectAreaLightUniformsLib.init();
        const softboxKey = new THREE.RectAreaLight(0xfff6e5, 3.2, 2.2, 2.8);
        softboxKey.position.set(2.0, 2.4, 2.4);
        softboxKey.lookAt(0, 1.15, 0);
        scene.add(softboxKey);

        const softboxRim = new THREE.RectAreaLight(0x60a5fa, 2.6, 1.8, 2.6);
        softboxRim.position.set(-2.2, 2.1, -1.8);
        softboxRim.lookAt(0, 1.15, 0);
        scene.add(softboxRim);
      }

      const pedSteelMat = trackM(
        new THREE.MeshPhysicalMaterial({
          map: tex.gunmetal,
          normalMap: tex.gunmetalNormal,
          normalScale: new THREE.Vector2(0.45, 0.45),
          color: 0x2a3342,
          metalness: 0.78,
          roughness: 0.34,
          clearcoat: 0.25,
        })
      );
      const pedDeckMat = trackM(
        new THREE.MeshStandardMaterial({
          map: tex.polymerStipple,
          normalMap: tex.polymerNormal,
          color: 0x1b212d,
          metalness: 0.42,
          roughness: 0.58,
        })
      );
      const pedLower = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.92, 1.04, 0.1, 36)), pedSteelMat);
      pedLower.position.y = -0.11;
      pedLower.receiveShadow = true;
      scene.add(pedLower);

      const pedUpper = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.79, 0.84, 0.06, 36)), pedDeckMat);
      pedUpper.position.y = -0.03;
      pedUpper.receiveShadow = true;
      scene.add(pedUpper);

      const outerRing = new THREE.Mesh(
        trackG(new THREE.RingGeometry(0.755, 0.785, 48)),
        trackM(
          new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
          })
        )
      );
      outerRing.rotation.x = -Math.PI / 2;
      outerRing.position.y = 0.003;
      scene.add(outerRing);

      const innerRing = new THREE.Mesh(
        trackG(new THREE.RingGeometry(0.56, 0.575, 48)),
        trackM(
          new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide,
          })
        )
      );
      innerRing.rotation.x = -Math.PI / 2;
      innerRing.position.y = 0.004;
      scene.add(innerRing);

      const floorMat = trackM(
        new THREE.MeshStandardMaterial({
          map: tex.gunmetal,
          normalMap: tex.gunmetalNormal,
          normalScale: new THREE.Vector2(0.3, 0.3),
          color: 0x121824,
          roughness: 0.56,
          metalness: 0.34,
        })
      );
      const floor = new THREE.Mesh(trackG(new THREE.PlaneGeometry(24, 24)), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.16;
      floor.receiveShadow = true;
      scene.add(floor);

      const pillarMat = trackM(
        new THREE.MeshStandardMaterial({
          color: 0x141b28,
          metalness: 0.6,
          roughness: 0.5,
        })
      );
      const stripLightMat = trackM(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      for (const px of [-2.4, 2.4]) {
        const pillar = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.45, 5.2, 0.55)), pillarMat);
        pillar.position.set(px, 2.4, -3.4);
        scene.add(pillar);
        const strip = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.04, 3.2, 0.05)), stripLightMat);
        strip.position.set(px * 0.9, 1.8, -3.11);
        scene.add(strip);
      }
    }

    let disposed = false;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let dampingFrames = 0;
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        let needsMoreFrames = false;

        if (cameraGoalRef.current.active) {
          const factor = 1 - Math.exp(-7.5 * dt);
          camera.position.lerp(cameraGoalRef.current.pos, factor);
          controls.target.lerp(cameraGoalRef.current.target, factor);
          if (
            camera.position.distanceTo(cameraGoalRef.current.pos) < 0.008 &&
            controls.target.distanceTo(cameraGoalRef.current.target) < 0.008
          ) {
            camera.position.copy(cameraGoalRef.current.pos);
            controls.target.copy(cameraGoalRef.current.target);
            cameraGoalRef.current.active = false;
          } else {
            needsMoreFrames = true;
          }
        }

        const op = operatorRef.current;
        if (op) {
          const pose = SHOWCASE_POSES[activePoseRef.current];
          const t = now * 0.001;
          const breath = isSoftwareGl ? 0 : Math.sin(t * 2.05) * 0.006;
          const headScan = isSoftwareGl ? 0 : Math.sin(t * 0.72) * 0.045;
          const dampK = isSoftwareGl ? 60 : 8.5;

          op.upperBody.position.y = THREE.MathUtils.damp(op.upperBody.position.y, pose.torsoY + breath, dampK, dt);
          op.upperBody.rotation.y = THREE.MathUtils.damp(op.upperBody.rotation.y, pose.torsoRotY, dampK, dt);
          op.upperBody.rotation.x = THREE.MathUtils.damp(op.upperBody.rotation.x, pose.torsoRotX, dampK, dt);
          op.headGroup.rotation.y = THREE.MathUtils.damp(op.headGroup.rotation.y, pose.headRotY + headScan, dampK, dt);
          op.headGroup.rotation.x = THREE.MathUtils.damp(op.headGroup.rotation.x, pose.headRotX, dampK, dt);
          op.leftLeg.rotation.x = THREE.MathUtils.damp(op.leftLeg.rotation.x, pose.leftHip, dampK, dt);
          op.leftKnee.rotation.x = THREE.MathUtils.damp(op.leftKnee.rotation.x, pose.leftKnee, dampK, dt);
          op.rightLeg.rotation.x = THREE.MathUtils.damp(op.rightLeg.rotation.x, pose.rightHip, dampK, dt);
          op.rightKnee.rotation.x = THREE.MathUtils.damp(op.rightKnee.rotation.x, pose.rightKnee, dampK, dt);
          op.leftArm.rotation.x = THREE.MathUtils.damp(op.leftArm.rotation.x, pose.leftArmX, dampK, dt);
          op.rightArm.rotation.x = THREE.MathUtils.damp(op.rightArm.rotation.x, pose.rightArmX, dampK, dt);
          op.weaponMount.position.y = THREE.MathUtils.damp(op.weaponMount.position.y, pose.weaponPosY, dampK, dt);
          op.weaponMount.rotation.x = THREE.MathUtils.damp(op.weaponMount.rotation.x, pose.weaponRotX, dampK, dt);
          op.weaponMount.rotation.y = THREE.MathUtils.damp(op.weaponMount.rotation.y, pose.weaponRotY, dampK, dt);
          op.weaponMount.rotation.z = THREE.MathUtils.damp(op.weaponMount.rotation.z, pose.weaponRotZ, dampK, dt);

          if (!isSoftwareGl) {
            needsMoreFrames = true;
          }
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (disposed) return;
          if (!isSoftwareGl && (dampingFrames > 0 || needsMoreFrames)) {
            if (dampingFrames > 0) dampingFrames--;
            requestRender();
          } else if (isSoftwareGl && (renderDirty || needsMoreFrames)) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };
    requestRenderRef.current = requestRender;

    const onControlChange = () => {
      dampingFrames = 14;
      requestRender();
    };
    controls.addEventListener('change', onControlChange);

    const ro = new ResizeObserver(() => {
      if (disposed || !container) return;
      const w = container.clientWidth || 380;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    ro.observe(container);

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controls.removeEventListener('change', onControlChange);
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      if (operatorRef.current) {
        scene.remove(operatorRef.current.root);
        operatorRef.current.dispose();
        operatorRef.current = null;
      }
      studioGeos.forEach((g) => g.dispose());
      studioMats.forEach((m) => m.dispose());
      studioTextures.forEach((t) => t.dispose());
      envTex.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [isLobby]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (operatorRef.current) {
      scene.remove(operatorRef.current.root);
      operatorRef.current.dispose();
      operatorRef.current = null;
    }

    const op = buildOperatorModel(
      'preview',
      name,
      team,
      true,
      loadout,
      rankShort,
      false
    );
    op.setWeaponVisual(weaponId);
    op.root.rotation.y = Math.PI - (isLobby ? 0.14 : 0.28);
    scene.add(op.root);
    operatorRef.current = op;
    requestRenderRef.current();
  }, [
    loadout.uniformId,
    loadout.headgearId,
    loadout.facegearId,
    loadout.vestId,
    loadout.weaponSkinId,
    weaponId,
    team,
    name,
    rankShort,
    isLobby,
  ]);

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${
        isLobby
          ? 'bg-[#2a3848]'
          : 'min-h-[260px] rounded-lg border border-white/10 bg-[#090d16]'
      }`}
    >
      {webglUnavailable ? (
        <div className="w-full h-full flex items-center justify-center p-6 text-center text-xs text-slate-300 bg-gradient-to-b from-[#1e2d3f] to-[#0b0e14]">
          เบราว์เซอร์ไม่รองรับ WebGL สำหรับแสดงโมเดล 3 มิติชั่วคราว (ยังสามารถกดเริ่มเกมและแต่งตัวได้ปกติ)
        </div>
      ) : (
        <>
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          {!hideOverlayControls && (
            <>
              <div className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1">
                <div className="pointer-events-auto flex items-center gap-1 bg-[#090C12]/90 border border-white/12 rounded p-1">
                  {(Object.keys(SHOWCASE_POSES) as ShowcasePoseId[]).map((poseId) => (
                    <button
                      key={poseId}
                      type="button"
                      onClick={() => selectPose(poseId)}
                      className={`px-2 py-0.5 rounded text-[10px] font-display font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        activePose === poseId
                          ? 'bg-sky-500 text-black'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {SHOWCASE_POSES[poseId].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pointer-events-none absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="hidden sm:inline bg-[#090C12]/88 border border-white/10 rounded px-2 py-1 text-[10px] text-slate-300">
                  หมุน 360° · ซูม
                </span>
                <div className="pointer-events-auto flex items-center gap-1 bg-[#090C12]/90 border border-white/12 rounded p-1">
                  {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((pid) => (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => selectPreset(pid)}
                      className={`px-2 py-0.5 rounded text-[10px] font-display font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        activePreset === pid
                          ? 'bg-amber-500 text-black'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {CAMERA_PRESETS[pid].label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
