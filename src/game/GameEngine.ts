import * as THREE from 'three';
import type { MapDefinition } from '../shared/maps';
import { WEAPON_RULES, WEAPONS, resolveWeaponForRule } from '../shared/weapons';
import { DEFAULT_LOADOUT, getRankForExp } from '../shared/progression';
import {
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_EYE_HEIGHT,
  hasLineOfSight,
  raycastMap,
  resolvePlayerMovement,
} from '../shared/collision';
import type {
  CharacterLoadout,
  GameMode,
  GrenadeExplodeEvent,
  HitZone,
  MatchSnapshot,
  PrimaryWeaponId,
  ShotBroadcast,
  ShotHitItem,
  TeamId,
  Vec3,
  WeaponId,
  WeaponRule,
  WeaponSlot,
} from '../shared/types';
import { createMaterialLibrary, type MaterialLibrary } from './textures';
import { buildSupplyCrateMesh } from './models';
import { soundEngine } from './sound';
import { QualityManager } from './render/QualityManager';
import { PerfMonitor, type PerfMetricsSnapshot } from './render/PerfMonitor';
import { RenderPipeline, buildMapEnvironmentIBL } from './render/RenderPipeline';
import { StaticGeometryBatcher, disposeObject3D } from './maps/StaticMapBatcher';
import {
  buildBatchedMapDressing,
  createAtmosphericSkyTexture,
  getMapAtmosphereConfig,
} from './maps/MapEnvironments';
import { EffectsPool } from './vfx/EffectsPool';
import {
  buildOptimizedOperator,
  type OptimizedOperatorHandle,
} from './character/OperatorOptimizer';
import {
  buildOptimizedViewmodel,
  type OptimizedViewmodelHandle,
} from './viewmodel/WeaponOptimizer';
import { TEAM_IDENTITY } from '../ui/designTokens';

import {
  DEFAULT_CONTROL_SETTINGS,
  RADIO_COMMANDS,
  type ControlSettings,
  type GraphicsQuality,
  type KeyAction,
} from '../shared/controls';

// Pre-allocated math helpers outside the render loop (Zero GC)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _centerNDC = new THREE.Vector2(0, 0);

interface RemoteActor {
  id: string;
  name: string;
  team: TeamId;
  handle: OptimizedOperatorHandle;
  targetPos: THREE.Vector3;
  targetYaw: number;
  targetPitch: number;
  targetLean: number;
  crouch: boolean;
  alive: boolean;
  deathTimer: number;
  walkPhase: number;
  stepAccum: number;
}

interface RadarBlip {
  x: number;
  z: number;
  expiresAt: number;
}

export interface HudSnapshot {
  hp: number;
  armor: number;
  alive: boolean;
  respawnTimer: number;
  weaponId: WeaponId;
  slot: WeaponSlot;
  allowedSlots: WeaponSlot[];
  ammo: number;
  reserve: number;
  reloading: boolean;
  reloadProgress: number;
  isScoped: boolean;
  isAds: boolean;
  crouch: boolean;
  sprinting: boolean;
  sliding: boolean;
  lean: number;
  hasGrenade: boolean;
  crosshairSpread: number;
  pointerLocked: boolean;
  yawDeg: number;
  radioOpen: boolean;
  enemyInCrosshair: boolean;
  sprintLocked: boolean;
}

export interface GameEngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onPerfUpdate?: (perf: PerfMetricsSnapshot) => void;
  onTogglePerfHud?: () => void;
  onPointerLockChange: (locked: boolean) => void;
  onSendState: (state: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    crouch: boolean;
    lean: number;
    sprinting: boolean;
    weaponId: WeaponId;
    seq?: number;
  }) => void;
  onShoot: (payload: {
    weaponId: WeaponId;
    origin: Vec3;
    endPoint: Vec3;
    endPoints?: Vec3[];
    hitPlayerId?: string;
    hitZone?: HitZone;
    hits?: ShotHitItem[];
  }) => void;
  onThrowGrenade: (payload: { origin: Vec3; dir: Vec3 }) => void;
  onToggleScoreboard: (show: boolean) => void;
  onOpenChat: () => void;
  onRadioChat?: (text: string) => void;
  onToggleHudHints?: () => void;
}

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

export class GameEngine {
  private container: HTMLElement;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private map: MapDefinition;
  private mode: GameMode;
  private weaponRule: WeaponRule;
  private myId: string;
  private myTeam: TeamId;
  private myLoadout: CharacterLoadout;
  private callbacks: GameEngineCallbacks;

  private isSoftwareGl: boolean;
  private isMobileDevice: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private qualityManager: QualityManager;
  private perfMonitor = new PerfMonitor();
  private pipeline: RenderPipeline;
  private effectsPool: EffectsPool;
  private sunLight: THREE.DirectionalLight | null = null;
  private materialLib: MaterialLibrary;
  private envTexture: THREE.Texture | null = null;
  private skyDomeTex: THREE.CanvasTexture | null = null;
  private ambientParticles: THREE.Points | null = null;
  private sirenRedLight: THREE.PointLight | null = null;
  private sirenBlueLight: THREE.PointLight | null = null;
  private wallMeshes: THREE.Mesh[] = [];
  private inputSeq = 0;

  // Viewmodels (rendered in isolated depth-cleared RenderPipeline pass — zero wall clipping!)
  private weaponHolder: THREE.Group;
  private viewmodels = new Map<WeaponId, OptimizedViewmodelHandle>();
  private activeViewmodel: OptimizedViewmodelHandle | null = null;

  // Remote Players, Grenades, Supplies & Radar
  private remoteActors = new Map<string, RemoteActor>();
  private grenadeMeshes = new Map<string, THREE.Mesh>();
  private supplyMeshes = new Map<string, THREE.Group>();
  private radarBlips: RadarBlip[] = [];

  // Local Player Physics & Tactical State
  private pos = new THREE.Vector3(0, 0, 0);
  private velY = 0;
  private grounded = true;
  private wasGrounded = true;
  private landDip = 0;
  private strafeTilt = 0;
  private yaw = 0;
  private pitch = 0;
  private crouch = false;
  private crouchToggled = false;
  private sprinting = false;
  private slideTimer = 0;
  private slideCooldown = 0;
  private slideDir = new THREE.Vector3();
  private targetLean = 0;
  private currentLean = 0;
  private currentEyeHeight = PLAYER_EYE_HEIGHT;
  private hp = 100;
  private armor = 50;
  private alive = true;
  private respawnTimer = 0;
  private hasSyncedInitialSpawn = false;

  // Weapon & Ammo State
  private primaryWeapon: PrimaryWeaponId;
  private activeSlot: WeaponSlot = 1;
  private activeWeapon: WeaponId;
  private ammoState: Record<WeaponId, { mag: number; reserve: number }>;
  private reloading = false;
  private reloadStartMs = 0;
  private reloadDurMs = 0;
  private lastFireMs = 0;
  private lastQuickMeleeMs = 0;
  private isFiring = false;
  private isAds = false;
  private recoilOffset = 0;
  private recoilPitch = 0;
  private boltKick = 0;
  private muzzleFlashTimer = 0;
  private walkBobTimer = 0;
  private stepSoundTimer = 0;
  private baseFov = 76;
  private currentFov = 76;
  private knifeSwingTimer = 0;
  private pumpTimer = 0;
  private pumpShellEjected = false;
  private cameraShake = 0;
  private inspectTimer = 0;
  private equipAnim = 0;
  private weaponSwayX = 0;
  private weaponSwayY = 0;

  // Controls, Keybinds, Touch Virtual Input & Settings
  private keys: Record<string, boolean> = {};
  public sensitivity = 0.0022;
  private touchSensitivity = 0.0026;
  private controlSettings: ControlSettings = { ...DEFAULT_CONTROL_SETTINGS };
  private virtualMoveX = 0;
  private virtualMoveY = 0;
  private virtualSprintLock = false;
  private virtualAdsFireActive = false;
  private virtualLean = 0;
  private radioOpen = false;
  private pointerLocked = false;
  public chatOpen = false;
  private latestSnapshot: MatchSnapshot | null = null;
  private prevCrouch = false;
  private prevTargetLean = 0;
  private enemyInCrosshair = false;
  private lastTargetScanMs = 0;

  // Loop & Timers
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private lastNetSyncMs = 0;
  private lastHudPushMs = 0;

  // Shared disposable geos/mats for thrown grenades
  private grenadeGeo = new THREE.SphereGeometry(0.11, 10, 10);
  private grenadeMat = new THREE.MeshStandardMaterial({
    color: 0x3b4d2b,
    roughness: 0.55,
    metalness: 0.35,
  });

  constructor(opts: {
    container: HTMLElement;
    minimapCanvas: HTMLCanvasElement | null;
    map: MapDefinition;
    mode: GameMode;
    weaponRule: WeaponRule;
    myId: string;
    myTeam: TeamId;
    myLoadout?: CharacterLoadout;
    primaryWeapon: PrimaryWeaponId;
    callbacks: GameEngineCallbacks;
  }) {
    this.container = opts.container;
    this.minimapCanvas = opts.minimapCanvas;
    this.map = opts.map;
    this.mode = opts.mode;
    this.weaponRule = opts.weaponRule;
    this.myId = opts.myId;
    this.myTeam = opts.myTeam;
    this.myLoadout = opts.myLoadout ?? DEFAULT_LOADOUT;
    const resolvedLoadout = resolveWeaponForRule(opts.weaponRule, opts.primaryWeapon);
    this.primaryWeapon = resolvedLoadout.primaryWeapon;
    this.activeSlot = resolvedLoadout.defaultSlot;
    this.activeWeapon = resolvedLoadout.activeWeapon;
    this.callbacks = opts.callbacks;

    this.ammoState = this.createFreshAmmo();

    this.isSoftwareGl = detectSoftwareGl();
    this.isMobileDevice =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

    this.qualityManager = new QualityManager(
      this.isMobileDevice,
      this.isSoftwareGl,
      this.controlSettings.graphicsQuality
    );
    const initSpec = this.qualityManager.getSpec();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && !this.isMobileDevice,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.qualityManager.currentPixelRatio);
    this.renderer.shadowMap.enabled = initSpec.shadowsEnabled && !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    const atmo = getMapAtmosphereConfig(this.map.id);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(atmo.fogColor);
    this.scene.fog = new THREE.FogExp2(atmo.fogColor, atmo.fogDensity);

    // Per-map Atmospheric PMREM IBL Environment (Midday Desert / Dusk Port / Misty SEA Morning)
    this.envTexture = buildMapEnvironmentIBL(this.renderer, this.map.id);
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = initSpec.envIntensity;

    this.camera = new THREE.PerspectiveCamera(74, w / h, 0.08, 260);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Dual-pass RenderPipeline: World Pass + Depth-Cleared Viewmodel Pass (Zero weapon wall clipping!)
    this.pipeline = new RenderPipeline(
      this.renderer,
      this.scene,
      this.camera,
      this.envTexture,
      w,
      h
    );
    this.pipeline.applyQuality(initSpec, w, h, this.isMobileDevice);

    this.weaponHolder = new THREE.Group();
    this.weaponHolder.position.set(0.24, -0.22, -0.25);
    this.pipeline.viewmodelCamera.add(this.weaponHolder);

    // Pre-allocated Zero-GC Effects Pool (includes pre-mounted explosion PointLight)
    this.effectsPool = new EffectsPool(this.scene, !this.isSoftwareGl);
    this.effectsPool.setQualityBudget(initSpec.maxDecals, !this.isSoftwareGl);

    this.materialLib = createMaterialLibrary(this.renderer);

    this.setupLighting();
    this.buildArena();
    this.equipSlot(this.activeSlot, false);

    const initSp = (this.myTeam === 'red' ? this.map.redSpawns : this.map.blueSpawns)[0];
    if (initSp) {
      this.pos.set(initSp.x, initSp.y, initSp.z);
      this.yaw = initSp.yaw;
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
      this.renderer.compile(this.pipeline.viewmodelScene, this.pipeline.viewmodelCamera);
    }

    soundEngine.setEnvironment(this.map.id, this.map.floorType);
    soundEngine.startAmbience(this.map.id);

    this.bindEvents();
    this.clock.start();
    this.tick();
  }

  private createFreshAmmo(): Record<WeaponId, { mag: number; reserve: number }> {
    const state = {} as Record<WeaponId, { mag: number; reserve: number }>;
    (Object.keys(WEAPONS) as WeaponId[]).forEach((id) => {
      state[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].reserveAmmo };
    });
    return state;
  }

  public refillAmmoFromSupply() {
    this.ammoState = this.createFreshAmmo();
    this.pushHud(true);
  }

  /**
   * Computes relative horizontal screen angle (in degrees, 0 = straight ahead,
   * 90 = right, 180 = behind, -90 = left) toward an attacker position.
   */
  public computeDamageAngleDeg(attackerPos: Vec3): number {
    const dx = attackerPos.x - this.pos.x;
    const dz = attackerPos.z - this.pos.z;
    const worldAngle = Math.atan2(-dx, -dz);
    let diff = this.yaw - worldAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return THREE.MathUtils.radToDeg(diff);
  }

  private setupLighting() {
    const atmo = getMapAtmosphereConfig(this.map.id);
    const spec = this.qualityManager.getSpec();

    const hemi = new THREE.HemisphereLight(atmo.hemiSky, atmo.hemiGround, atmo.hemiIntensity);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(atmo.sunColor, atmo.sunIntensity);
    sun.position.set(atmo.sunPos[0], atmo.sunPos[1], atmo.sunPos[2]);
    if (!this.isSoftwareGl) {
      sun.castShadow = spec.shadowsEnabled;
      const smSize = Math.max(512, spec.shadowMapSize || 1024);
      sun.shadow.mapSize.set(smSize, smSize);
      sun.shadow.camera.near = 2;
      sun.shadow.camera.far = 115;
      const d = 44;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.025;
    }
    this.sunLight = sun;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(atmo.rimColor, atmo.rimIntensity);
    rim.position.set(atmo.rimPos[0], atmo.rimPos[1], atmo.rimPos[2]);
    this.scene.add(rim);

    // Batched overhead fixtures & volumetric light cones per map
    const lightBatcher = new StaticGeometryBatcher();
    if (this.map.id === 'warehouse') {
      const lampPositions = [
        [-14, 9.6, -10],
        [14, 9.6, -10],
        [-14, 9.6, 10],
        [14, 9.6, 10],
        [0, 9.6, 0],
      ];
      const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
      const shaftMat = new THREE.MeshBasicMaterial({
        color: 0xffc878,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mtx = new THREE.Matrix4();
      for (const [lx, ly, lz] of lampPositions) {
        mtx.makeTranslation(lx, ly, lz);
        lightBatcher.addGeometry(new THREE.BoxGeometry(2.6, 0.22, 0.75), fixtureMat, mtx, false, false);
        mtx.makeTranslation(lx, ly - 4.5, lz);
        lightBatcher.addGeometry(new THREE.ConeGeometry(4.4, 8.8, 12, 1, true), shaftMat, mtx, false, false);
      }
      this.scene.add(lightBatcher.buildGroup());
    } else if (this.map.id === 'crossroad') {
      const poleMat = new THREE.MeshStandardMaterial({
        color: 0x262c36,
        metalness: 0.7,
        roughness: 0.4,
      });
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe4aa });
      const glowConeMat = new THREE.MeshBasicMaterial({
        color: 0xffdfa0,
        transparent: true,
        opacity: 0.038,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const poles = [
        [-9.2, -9.2],
        [9.2, -9.2],
        [-9.2, 9.2],
        [9.2, 9.2],
      ];
      const mtx = new THREE.Matrix4();
      for (const [px, pz] of poles) {
        mtx.makeTranslation(px, 2.8, pz);
        lightBatcher.addGeometry(new THREE.CylinderGeometry(0.1, 0.14, 5.6, 8), poleMat, mtx, false, false);
        mtx.makeTranslation(px, 5.6, pz);
        lightBatcher.addGeometry(new THREE.BoxGeometry(0.55, 0.2, 0.55), bulbMat, mtx, false, false);
        mtx.makeTranslation(px, 2.9, pz);
        lightBatcher.addGeometry(new THREE.ConeGeometry(2.8, 5.2, 10, 1, true), glowConeMat, mtx, false, false);
      }
      this.scene.add(lightBatcher.buildGroup());

      // Tactical BearCat amber/sky beacon lights (TASK FORCE #4FD1FF / VIPER #FFB020)
      if (!this.isSoftwareGl) {
        this.sirenRedLight = new THREE.PointLight(TEAM_IDENTITY.red.accentInt, 2.4, 13, 1.8);
        this.sirenRedLight.position.set(-0.42, 3.05, -1.1);
        this.scene.add(this.sirenRedLight);

        this.sirenBlueLight = new THREE.PointLight(TEAM_IDENTITY.blue.accentInt, 2.4, 13, 1.8);
        this.sirenBlueLight.position.set(0.42, 3.05, -1.1);
        this.scene.add(this.sirenBlueLight);
      }
    }

    // Atmospheric drifting dust / mist motes particle field
    const count = this.isSoftwareGl ? 50 : this.isMobileDevice ? 85 : 150;
    const positions = new Float32Array(count * 3);
    const b = this.map.bounds;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = b.minX + Math.random() * (b.maxX - b.minX);
      positions[i * 3 + 1] = 0.6 + Math.random() * 8.2;
      positions[i * 3 + 2] = b.minZ + Math.random() * (b.maxZ - b.minZ);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      color: atmo.particleColor,
      size: this.map.id === 'desert_camp' ? 0.085 : 0.07,
      transparent: true,
      opacity: atmo.particleOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ambientParticles = new THREE.Points(pGeo, pMat);
    this.ambientParticles.visible = spec.particlesEnabled;
    this.scene.add(this.ambientParticles);
  }

  private buildArena() {
    const atmo = getMapAtmosphereConfig(this.map.id);
    // Atmospheric Procedural Sky Dome for all outdoor/semi-open battlefields
    if (!this.map.indoor || atmo.hasSkyDome) {
      this.skyDomeTex = createAtmosphericSkyTexture(atmo);
      const skyDome = new THREE.Mesh(
        new THREE.SphereGeometry(190, 24, 14),
        new THREE.MeshBasicMaterial({
          map: this.skyDomeTex,
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
        })
      );
      this.scene.add(skyDome);
    }

    const floorSize = this.map.indoor ? 68 : 260;
    const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
    const floorMat = this.materialLib.floorMaterials[this.map.floorType];
    if (!this.map.indoor && floorMat.map) {
      floorMat.map.repeat.set(58, 58);
      if (floorMat.normalMap) floorMat.normalMap.repeat.set(58, 58);
      if (floorMat.roughnessMap) floorMat.roughnessMap.repeat.set(58, 58);
    }
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.wallMeshes.push(floor);

    // Batch all solid MapBox[] walls & decor separately so raycasts hit only solid merged geometry!
    const solidBatcher = new StaticGeometryBatcher();
    const decorBatcher = new StaticGeometryBatcher();

    const trimMat =
      this.map.id === 'desert_camp'
        ? this.materialLib.boxMaterials.sandstone_dark
        : this.materialLib.boxMaterials.concrete_dark;

    for (const b of this.map.boxes) {
      const mat = this.materialLib.boxMaterials[b.mat];
      let uvScale = 1 / 2.75;
      if (b.mat === 'sandbag') uvScale = 1 / 1.45;
      else if (b.mat === 'container_red' || b.mat === 'container_blue' || b.mat === 'container_olive') {
        uvScale = 1 / 3.2;
      }

      const targetBatcher = b.decorOnly ? decorBatcher : solidBatcher;
      targetBatcher.addBox(
        b.w,
        b.h,
        b.d,
        mat,
        b.x,
        b.y + b.h * 0.5,
        b.z,
        uvScale,
        !b.decorOnly,
        true
      );

      // Architectural parapet coping ledges batched into decor
      if (
        !b.decorOnly &&
        (b.mat === 'sandstone' || b.mat === 'concrete' || b.mat === 'brick') &&
        b.h >= 2.2 &&
        b.h <= 6.2 &&
        Math.max(b.w, b.d) >= 2.2
      ) {
        decorBatcher.addBox(
          b.w + 0.14,
          0.14,
          b.d + 0.14,
          trimMat,
          b.x,
          b.y + b.h + 0.05,
          b.z,
          1 / 2.5,
          true,
          true
        );
      }
    }

    // Batched Outdoor Perimeter Vistas (Desert Mesas / SEA Urban Skyline Silhouettes)
    if (!this.map.indoor) {
      const isDesert = this.map.id === 'desert_camp';
      const vistaMat = isDesert
        ? this.materialLib.boxMaterials.sandstone_dark
        : this.materialLib.boxMaterials.concrete_dark;
      const ringCount = 26;
      const mtx = new THREE.Matrix4();
      const rot = new THREE.Matrix4();
      for (let i = 0; i < ringCount; i++) {
        const angle = (i / ringCount) * Math.PI * 2;
        const radius = 62 + (i % 3) * 19;
        const vw = isDesert ? 18 + (i % 4) * 7 : 11 + (i % 3) * 5;
        const vh = isDesert ? 11 + (i % 5) * 5.5 : 16 + (i % 4) * 10;
        const vd = isDesert ? 15 + (i % 3) * 6 : 11 + (i % 3) * 4;
        const vGeo = new THREE.BoxGeometry(vw, vh, vd);
        mtx.makeTranslation(Math.cos(angle) * radius, vh * 0.5 - 0.5, Math.sin(angle) * radius);
        rot.makeRotationY(angle + (isDesert ? 0.35 : 0));
        mtx.multiply(rot);
        decorBatcher.addGeometry(vGeo, vistaMat, mtx, false, false);
      }
    }

    const solidGroup = solidBatcher.buildGroup();
    this.scene.add(solidGroup);
    solidGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        this.wallMeshes.push(obj as THREE.Mesh);
      }
    });

    const decorGroup = decorBatcher.buildGroup();
    this.scene.add(decorGroup);

    // Instanced & Batched Map Landmarks / Environmental Dressing (zero collision/sightline changes!)
    const dressing = buildBatchedMapDressing(this.map.id);
    this.scene.add(dressing);

    // Faction spawn floor markings: VIPER UNIT (#FFB020) vs TASK FORCE (#4FD1FF)
    const viperMarkMat = new THREE.MeshStandardMaterial({
      color: TEAM_IDENTITY.red.accentInt,
      roughness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const tfMarkMat = new THREE.MeshStandardMaterial({
      color: TEAM_IDENTITY.blue.accentInt,
      roughness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const viperStrip = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.03, 14), viperMarkMat);
    viperStrip.position.set(this.map.bounds.minX + 5.5, 0.02, 0);
    this.scene.add(viperStrip);
    const tfStrip = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.03, 14), tfMarkMat);
    tfStrip.position.set(this.map.bounds.maxX - 5.5, 0.02, 0);
    this.scene.add(tfStrip);

    // Pre-build Supply Crate meshes
    for (const s of this.map.supplySpawns) {
      const crateMesh = buildSupplyCrateMesh(s.kind);
      crateMesh.position.set(s.x, s.y, s.z);
      this.scene.add(crateMesh);
      this.supplyMeshes.set(s.id, crateMesh);
    }
  }

  public setMinimapCanvas(canvas: HTMLCanvasElement | null) {
    this.minimapCanvas = canvas;
  }

  public setNetworkStats(pingMs: number, packetLossPct: number) {
    this.perfMonitor.setNetworkStats(pingMs, packetLossPct);
  }

  /**
   * Smoothly reconciles local player position when server flags an authoritative correction.
   */
  public applyServerReconciliation(pos: Vec3) {
    const dx = pos.x - this.pos.x;
    const dy = pos.y - this.pos.y;
    const dz = pos.z - this.pos.z;
    const errSq = dx * dx + dy * dy + dz * dz;
    if (errSq > 6.25) {
      // Major desync (>2.5m): snap cleanly
      this.pos.set(pos.x, pos.y, pos.z);
    } else if (errSq > 0.04) {
      // Minor drift: blend smoothly to prevent harsh jitter
      this.pos.x += dx * 0.45;
      this.pos.y += dy * 0.45;
      this.pos.z += dz * 0.45;
    }
  }

  public applyControlSettings(settings: ControlSettings) {
    this.controlSettings = {
      ...settings,
      keybinds: { ...settings.keybinds },
      audioMix: settings.audioMix ? { ...settings.audioMix } : { ...DEFAULT_CONTROL_SETTINGS.audioMix },
    };
    this.sensitivity = settings.sensitivity * 0.001;
    this.touchSensitivity = (settings.touchSensitivity ?? 2.6) * 0.001;
    this.baseFov = settings.fov;
    if (settings.audioMix) {
      soundEngine.applyAudioMix(settings.audioMix);
    } else {
      soundEngine.volume = settings.volume / 100;
    }
    this.applyGraphicsQuality(settings.graphicsQuality);
  }

  private computeSpatialAudio(worldPos: THREE.Vector3): { distance: number; pan: number; occluded: boolean } {
    const dx = worldPos.x - this.camera.position.x;
    const dy = worldPos.y - this.camera.position.y;
    const dz = worldPos.z - this.camera.position.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 0.25) return { distance, pan: 0, occluded: false };
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const horizDist = Math.hypot(dx, dz) || 1;
    const pan = THREE.MathUtils.clamp((dx * rightX + dz * rightZ) / horizDist, -1, 1);
    const occluded =
      distance > 2.0 &&
      !hasLineOfSight(
        { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
        { x: worldPos.x, y: worldPos.y + 1.1, z: worldPos.z },
        this.map
      );
    return { distance, pan, occluded };
  }

  public applyGraphicsQuality(quality: GraphicsQuality) {
    const spec = this.qualityManager.setQuality(quality);
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    this.renderer.setPixelRatio(this.qualityManager.currentPixelRatio);
    this.renderer.shadowMap.enabled = spec.shadowsEnabled && !this.isSoftwareGl;
    if (this.sunLight) {
      this.sunLight.castShadow = spec.shadowsEnabled && !this.isSoftwareGl;
    }
    this.scene.environmentIntensity = spec.envIntensity;
    if (this.ambientParticles) {
      this.ambientParticles.visible = spec.particlesEnabled;
    }
    this.effectsPool.setQualityBudget(spec.maxDecals, !this.isSoftwareGl && spec.tier !== 'low');
    this.pipeline.applyQuality(spec, w, h, this.isMobileDevice);
  }

  // Virtual / Touch & Trackpad Controls API
  public setVirtualMove(x: number, y: number) {
    this.virtualMoveX = Math.max(-1, Math.min(1, x));
    this.virtualMoveY = Math.max(-1, Math.min(1, y));
    if (y < -0.25 && this.virtualSprintLock) {
      this.virtualSprintLock = false;
      this.pushHud(true);
    }
  }

  public setVirtualSprintLock(locked: boolean) {
    if (this.virtualSprintLock !== locked) {
      this.virtualSprintLock = locked;
      this.pushHud(true);
    }
  }

  public applyVirtualLook(dx: number, dy: number) {
    if (!this.alive || this.chatOpen) return;
    const zoomScale = this.isScoped() ? 0.34 : this.isAds ? 0.62 : 1.0;
    // Soft magnetic friction on mobile when reticle passes over an enemy
    const assistFriction =
      this.controlSettings.touchControls &&
      this.controlSettings.aimAssist &&
      this.enemyInCrosshair
        ? 0.56
        : 1.0;
    const scale = this.touchSensitivity * 1.55 * zoomScale * assistFriction;
    this.yaw -= dx * scale;
    this.pitch -= dy * scale;
    this.pitch = Math.max(-1.46, Math.min(1.46, this.pitch));

    // Gentle magnetic pull toward upper torso when thumb is actively tracking an enemy
    if (
      this.controlSettings.touchControls &&
      this.controlSettings.aimAssist &&
      (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2)
    ) {
      this.applyGentleAimAssist(0.11);
    }
  }

  private applyGentleAimAssist(strength: number) {
    let hasBest = false;
    let bestAngle = 0.125; // ~7.2 deg central cone

    const camForward = _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    for (const actor of this.remoteActors.values()) {
      if (!actor.alive) continue;
      if (this.mode === 'tdm' && actor.team === this.myTeam) continue;
      const aimY = actor.crouch ? 0.95 : 1.32;
      _v2.set(actor.handle.root.position.x, actor.handle.root.position.y + aimY, actor.handle.root.position.z);
      _v3.copy(_v2).sub(this.camera.position);
      const dist = _v3.length();
      if (dist < 1.2 || dist > 52) continue;
      _v3.divideScalar(dist);
      const dot = THREE.MathUtils.clamp(camForward.dot(_v3), -1, 1);
      const angle = Math.acos(dot);
      if (angle < bestAngle) {
        const wallT = raycastMap(
          { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
          { x: _v3.x, y: _v3.y, z: _v3.z },
          this.map,
          dist
        );
        if (wallT === null || wallT >= dist - 0.3) {
          bestAngle = angle;
          _v4.copy(_v2);
          hasBest = true;
        }
      }
    }

    if (!hasBest) return;
    const dx = _v4.x - this.camera.position.x;
    const dy = _v4.y - this.camera.position.y;
    const dz = _v4.z - this.camera.position.z;
    const horiz = Math.hypot(dx, dz) || 0.001;
    const desiredYaw = Math.atan2(-dx, -dz);
    const desiredPitch = THREE.MathUtils.clamp(Math.atan2(dy, horiz), -1.45, 1.45);

    let yawDiff = desiredYaw - this.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const pitchDiff = desiredPitch - this.pitch;

    this.yaw += yawDiff * strength;
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitchDiff * strength * 0.75, -1.46, 1.46);
  }

  public setVirtualFire(firing: boolean) {
    this.isFiring = firing;
    if (firing && this.alive && !this.chatOpen) {
      this.virtualSprintLock = false;
      this.fireActiveWeapon();
    }
  }

  public setVirtualFireWithAds(firing: boolean) {
    if (firing && this.alive && !this.chatOpen) {
      this.virtualSprintLock = false;
      if (
        this.controlSettings.adsOnFire &&
        this.activeWeapon !== 'knife' &&
        this.activeWeapon !== 'frag' &&
        !this.reloading &&
        !this.isAds
      ) {
        this.isAds = true;
        this.virtualAdsFireActive = true;
        this.inspectTimer = 0;
        soundEngine.playAds(true);
        this.pushHud(true);
      }
      this.isFiring = true;
      this.fireActiveWeapon();
    } else {
      this.isFiring = false;
      if (this.virtualAdsFireActive) {
        this.virtualAdsFireActive = false;
        if (this.isAds) {
          this.isAds = false;
          soundEngine.playAds(false);
          this.pushHud(true);
        }
      }
    }
  }

  public toggleVirtualAds() {
    if (this.activeWeapon !== 'knife' && this.activeWeapon !== 'frag' && !this.reloading) {
      this.isAds = !this.isAds;
      this.virtualAdsFireActive = false;
      this.inspectTimer = 0;
      soundEngine.playAds(this.isAds);
      this.pushHud(true);
    }
  }

  public triggerVirtualJump() {
    if (this.alive && this.grounded && !this.chatOpen) {
      this.velY = 6.9;
      this.grounded = false;
      this.slideTimer = 0;
      this.crouchToggled = false;
      soundEngine.playJump(this.map.floorType);
    }
  }

  public triggerVirtualCrouchOrSlide() {
    if (!this.alive || this.chatOpen) return;
    if (this.sprinting && this.grounded && this.slideCooldown <= 0) {
      this.startTacticalSlide();
      return;
    }
    this.crouchToggled = !this.crouchToggled;
    this.pushHud(true);
  }

  public setVirtualLean(dir: number) {
    this.virtualLean = this.virtualLean === dir ? 0 : dir;
    this.pushHud(true);
  }

  public triggerVirtualReload() {
    this.startReload();
  }

  public triggerVirtualGrenade() {
    this.throwQuickGrenade();
  }

  public triggerVirtualQuickMelee() {
    this.performQuickMelee();
  }

  public triggerVirtualInspect() {
    if (!this.isAds && !this.reloading) {
      this.inspectTimer = 2.2;
      soundEngine.playInspect();
    }
  }

  public triggerRadioCommand(index: number) {
    const cmd = RADIO_COMMANDS[index];
    if (!cmd) return;
    soundEngine.playRadioChirp();
    this.radioOpen = false;
    this.callbacks.onRadioChat?.(cmd.chatText);
    this.pushHud(true);
  }

  public toggleRadioMenu() {
    this.radioOpen = !this.radioOpen;
    this.pushHud(true);
  }

  public setPrimaryWeapon(weapon: PrimaryWeaponId) {
    const resolved = resolveWeaponForRule(this.weaponRule, weapon);
    this.primaryWeapon = resolved.primaryWeapon;
    if (this.activeSlot === 1 && this.isSlotAllowed(1)) {
      this.equipSlot(1);
    }
  }

  private isSlotAllowed(slot: WeaponSlot): boolean {
    const spec = WEAPON_RULES[this.weaponRule] ?? WEAPON_RULES.all;
    return spec.allowedSlots.includes(slot);
  }

  public requestPointerLock() {
    try {
      this.renderer.domElement.requestPointerLock?.();
    } catch {
      // Ignore iframe restriction
    }
  }

  public exitPointerLock() {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
  }

  private isActionDown(action: KeyAction): boolean {
    const code = this.controlSettings.keybinds[action] || DEFAULT_CONTROL_SETTINGS.keybinds[action];
    if (action === 'crouch' && this.keys['ControlLeft']) return true;
    return Boolean(this.keys[code]);
  }

  private startTacticalSlide() {
    if (!this.alive || !this.grounded || this.slideTimer > 0 || this.slideCooldown > 0) return;
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.slideDir.copy(_forward).normalize();
    this.slideTimer = 0.52;
    this.slideCooldown = 1.15;
    this.isAds = false;
    this.inspectTimer = 0;
    soundEngine.playSlide(this.map.floorType);
    this.pushHud(true);
  }

  private performQuickMelee() {
    const now = performance.now();
    if (!this.alive || this.chatOpen || now - this.lastQuickMeleeMs < 520) return;
    this.lastQuickMeleeMs = now;
    this.knifeSwingTimer = 0.28;
    this.isAds = false;
    this.inspectTimer = 0;
    soundEngine.playGunshot('knife', 0);

    const enemyMeshes: THREE.Mesh[] = [];
    for (const actor of this.remoteActors.values()) {
      if (!actor.alive) continue;
      if (this.mode === 'tdm' && actor.team === this.myTeam) continue;
      enemyMeshes.push(...actor.handle.hitMeshes);
    }

    _centerNDC.set(0, 0);
    _raycaster.setFromCamera(_centerNDC, this.camera);
    _raycaster.far = WEAPONS.knife.range;
    const wallHits = _raycaster.intersectObjects(this.wallMeshes, false);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : WEAPONS.knife.range;
    const enemyHits = _raycaster.intersectObjects(enemyMeshes, false);

    let endPoint: THREE.Vector3;
    let hitPlayerId: string | undefined;
    let hitZone: HitZone | undefined;

    if (enemyHits.length > 0 && enemyHits[0].distance < wallDist) {
      endPoint = enemyHits[0].point.clone();
      hitPlayerId = enemyHits[0].object.userData.playerId as string;
      hitZone = (enemyHits[0].object.userData.hitZone as HitZone) || 'body';
      this.spawnSparks(endPoint, true);
    } else if (wallHits.length > 0) {
      endPoint = wallHits[0].point.clone();
      this.spawnSparks(endPoint, false);
    } else {
      endPoint = _raycaster.ray.origin
        .clone()
        .add(_raycaster.ray.direction.clone().multiplyScalar(WEAPONS.knife.range));
    }

    this.callbacks.onShoot({
      weaponId: 'knife',
      origin: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      endPoint: { x: endPoint.x, y: endPoint.y, z: endPoint.z },
      hitPlayerId,
      hitZone,
      hits: hitPlayerId ? [{ playerId: hitPlayerId, hitZone: hitZone || 'body' }] : undefined,
    });
  }

  private getWeaponForSlot(slot: WeaponSlot): WeaponId {
    if (slot === 1) return this.primaryWeapon;
    if (slot === 2) return 'deagle';
    if (slot === 3) return 'knife';
    return 'frag';
  }

  public equipSlot(slot: WeaponSlot, playFoley = true) {
    if (!this.isSlotAllowed(slot)) return;
    const nextWeapon = this.getWeaponForSlot(slot);
    if (slot === 4 && this.ammoState.frag.mag <= 0) return;

    this.activeSlot = slot;
    this.activeWeapon = nextWeapon;
    this.reloading = false;
    this.isAds = false;
    this.inspectTimer = 0;
    this.pumpTimer = 0;
    this.equipAnim = 1.0;

    if (playFoley) soundEngine.playEquip(this.activeWeapon);

    if (this.activeViewmodel) {
      this.weaponHolder.remove(this.activeViewmodel.group);
    }

    let vm = this.viewmodels.get(nextWeapon);
    if (!vm) {
      vm = buildOptimizedViewmodel(
        nextWeapon,
        this.myLoadout.weaponSkinId,
        this.myLoadout.uniformId
      );
      this.viewmodels.set(nextWeapon, vm);
    }
    this.activeViewmodel = vm;
    this.weaponHolder.add(vm.group);
    this.pushHud(true);
  }

  private startReload() {
    if (this.reloading || !this.alive) return;
    const spec = WEAPONS[this.activeWeapon];
    if (!spec || spec.reloadTimeMs <= 0) return;
    const st = this.ammoState[this.activeWeapon];
    if (st.mag >= spec.magSize || st.reserve <= 0) return;

    this.reloading = true;
    this.isAds = false;
    this.virtualAdsFireActive = false;
    this.inspectTimer = 0;
    this.reloadStartMs = performance.now();
    this.reloadDurMs = spec.reloadTimeMs;
    soundEngine.playReload(this.activeWeapon, spec.reloadTimeMs / 1000);
    this.pushHud(true);
  }

  private throwQuickGrenade() {
    if (!this.alive || !this.isSlotAllowed(4) || this.ammoState.frag.mag <= 0) return;
    this.ammoState.frag.mag -= 1;

    _dir.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const origin: Vec3 = {
      x: this.camera.position.x + _dir.x * 0.6,
      y: this.camera.position.y - 0.1,
      z: this.camera.position.z + _dir.z * 0.6,
    };

    this.callbacks.onThrowGrenade({
      origin,
      dir: { x: _dir.x, y: _dir.y, z: _dir.z },
    });

    soundEngine.playGrenadeThrow();
    if (this.activeSlot === 4) {
      const ruleSpec = WEAPON_RULES[this.weaponRule] ?? WEAPON_RULES.all;
      this.equipSlot(ruleSpec.defaultSlot);
    }
    this.pushHud(true);
  }

  private spawnShellCasing(isShotgunHull = false) {
    if (!this.activeViewmodel) return;
    // Transform local ejection port from isolated viewmodel camera space into world space!
    this.activeViewmodel.group.updateWorldMatrix(true, false);
    _v2
      .copy(this.activeViewmodel.ejectionPortLocal)
      .applyMatrix4(this.activeViewmodel.group.matrixWorld)
      .applyMatrix4(this.camera.matrixWorld);

    _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.effectsPool.spawnShellCasing(_v2, _right, _camUp, _forward, isShotgunHull);
  }

  private spawnBulletDecal(point: THREE.Vector3, faceNormal?: THREE.Vector3) {
    if (!faceNormal) return;
    this.effectsPool.spawnDecal(point, faceNormal);
  }

  private fireActiveWeapon() {
    if (!this.alive || this.reloading) return;
    if (this.activeWeapon === 'frag') {
      this.throwQuickGrenade();
      return;
    }

    const now = performance.now();
    const spec = WEAPONS[this.activeWeapon];
    if (now - this.lastFireMs < spec.fireRateMs) return;

    const st = this.ammoState[this.activeWeapon];
    if (this.activeWeapon !== 'knife') {
      if (st.mag <= 0) {
        if (st.reserve > 0) {
          this.startReload();
        } else {
          this.lastFireMs = now;
          soundEngine.playDryFire();
        }
        return;
      }
      st.mag -= 1;
    } else {
      this.knifeSwingTimer = 0.24;
    }

    this.lastFireMs = now;
    this.inspectTimer = 0;
    this.sprinting = false;
    soundEngine.playGunshot(this.activeWeapon, 0, 0);

    // Recoil, Bolt Blowback, Shotgun Pump & Camera Micro-Shake
    const isShotgun = this.activeWeapon === 'm870';
    this.recoilOffset = Math.min(0.18, this.recoilOffset + spec.recoilKick * 2.2);
    this.recoilPitch = Math.min(0.14, this.recoilPitch + spec.recoilKick);
    this.boltKick = isShotgun ? 0.07 : 0.055;
    this.pitch = Math.min(1.48, this.pitch + spec.recoilKick * (this.isAds ? 0.45 : 0.82));
    if (isShotgun) {
      this.pumpTimer = 0.54;
      this.pumpShellEjected = false;
      this.cameraShake = Math.max(this.cameraShake, 0.022);
    } else if (this.activeWeapon === 'awp') {
      this.cameraShake = Math.max(this.cameraShake, 0.024);
    } else if (this.activeWeapon === 'psg1' || this.activeWeapon === 'deagle') {
      this.cameraShake = Math.max(this.cameraShake, 0.012);
    } else if (this.activeWeapon === 'scar') {
      this.cameraShake = Math.max(this.cameraShake, 0.008);
    }

    if (this.activeViewmodel && this.activeWeapon !== 'knife') {
      this.muzzleFlashTimer = isShotgun ? 0.065 : 0.045;
      this.activeViewmodel.muzzleFlash.visible = !this.isScoped();
      this.activeViewmodel.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
      this.activeViewmodel.muzzleLight.intensity = isShotgun ? 4.2 : 2.8;
      if (!this.isScoped() && !isShotgun) {
        this.spawnShellCasing(false);
      }
    }

    // Collect enemy hit meshes once
    const enemyMeshes: THREE.Mesh[] = [];
    for (const actor of this.remoteActors.values()) {
      if (!actor.alive) continue;
      if (this.mode === 'tdm' && actor.team === this.myTeam) continue;
      enemyMeshes.push(...actor.handle.hitMeshes);
    }

    // Multi-pellet raycast loop (8 pellets for M870 shotgun, 1 for standard guns)
    let spread = this.isAds ? spec.adsSpread : spec.spread;
    if (this.crouch) spread *= 0.68;
    const pellets = Math.max(1, spec.pellets || 1);

    const hits: ShotHitItem[] = [];
    const endPoints: Vec3[] = [];
    let primaryEndPoint = new THREE.Vector3();
    let firstHitPlayerId: string | undefined;
    let firstHitZone: HitZone | undefined;

    _v1.set(0.16, -0.1, -0.6).applyMatrix4(this.camera.matrixWorld);

    for (let p = 0; p < pellets; p++) {
      // Polar disk distribution for realistic circular shotgun spread
      let spreadX: number;
      let spreadY: number;
      if (pellets > 1) {
        const angle = (p / pellets) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
        const radius = p === 0 ? Math.random() * spread * 0.35 : (0.35 + Math.random() * 0.65) * spread;
        spreadX = Math.cos(angle) * radius;
        spreadY = Math.sin(angle) * radius;
      } else {
        spreadX = (Math.random() - 0.5) * spread * 2;
        spreadY = (Math.random() - 0.5) * spread * 2;
      }

      _centerNDC.set(spreadX, spreadY);
      _raycaster.setFromCamera(_centerNDC, this.camera);
      _raycaster.far = spec.range;

      const wallHits = _raycaster.intersectObjects(this.wallMeshes, false);
      const wallDist = wallHits.length > 0 ? wallHits[0].distance : spec.range;
      const enemyHits = _raycaster.intersectObjects(enemyMeshes, false);

      let endPoint: THREE.Vector3;
      if (enemyHits.length > 0 && enemyHits[0].distance < wallDist) {
        const hit = enemyHits[0];
        endPoint = hit.point.clone();
        const pid = hit.object.userData.playerId as string;
        const zone = (hit.object.userData.hitZone as HitZone) || 'body';
        hits.push({ playerId: pid, hitZone: zone });
        const hitActor = this.remoteActors.get(pid);
        hitActor?.handle.triggerHitFlinch(zone === 'head');
        if (!firstHitPlayerId) {
          firstHitPlayerId = pid;
          firstHitZone = zone;
          soundEngine.playBulletImpact(zone === 'head' ? 'headshot' : 'flesh', hit.distance, 0);
        }
        if (p < 4) this.spawnSparks(endPoint, true);
      } else if (wallHits.length > 0) {
        endPoint = wallHits[0].point.clone();
        if (p === 0 && wallHits[0].distance < 24) {
          soundEngine.playBulletImpact(
            this.map.id === 'warehouse' ? 'metal' : 'wall',
            wallHits[0].distance,
            0
          );
        }
        if (p < 4) this.spawnSparks(endPoint, false);
        if (this.activeWeapon !== 'knife' && wallHits[0].face && p < 6) {
          const normal = wallHits[0].face.normal
            .clone()
            .transformDirection(wallHits[0].object.matrixWorld);
          this.spawnBulletDecal(endPoint, normal);
        }
      } else {
        endPoint = _raycaster.ray.origin
          .clone()
          .add(_raycaster.ray.direction.clone().multiplyScalar(spec.range));
      }

      if (p === 0) primaryEndPoint = endPoint;
      endPoints.push({ x: endPoint.x, y: endPoint.y, z: endPoint.z });

      if (this.activeWeapon !== 'knife') {
        this.spawnTracer(_v1, endPoint);
      }
    }

    const origin: Vec3 = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
    };

    this.callbacks.onShoot({
      weaponId: this.activeWeapon,
      origin,
      endPoint: { x: primaryEndPoint.x, y: primaryEndPoint.y, z: primaryEndPoint.z },
      endPoints: pellets > 1 ? endPoints : undefined,
      hitPlayerId: firstHitPlayerId,
      hitZone: firstHitZone,
      hits: hits.length > 0 ? hits : undefined,
    });

    if (this.activeWeapon !== 'knife' && st.mag === 0 && st.reserve > 0) {
      this.startReload();
    }

    this.pushHud(true);
  }

  public handleRemoteShot(shot: ShotBroadcast) {
    const start = _v4.set(shot.origin.x, shot.origin.y, shot.origin.z);
    const { distance, pan, occluded } = this.computeSpatialAudio(start);
    soundEngine.playSpatialGunshot(shot.weaponId, distance, pan, shot.origin, occluded);

    const shooterActor = this.remoteActors.get(shot.shooterId);
    if (shooterActor && shot.weaponId !== 'knife') {
      shooterActor.handle.triggerMuzzleFlash();
    }
    if (shot.hitPlayerId) {
      const victimActor = this.remoteActors.get(shot.hitPlayerId);
      victimActor?.handle.triggerHitFlinch(false);
    }

    if (shot.weaponId !== 'knife') {
      const targets = shot.endPoints && shot.endPoints.length > 0 ? shot.endPoints : [shot.endPoint];
      const isSniper = shot.weaponId === 'awp' || shot.weaponId === 'psg1';
      let whizPlayed = false;
      for (let i = 0; i < targets.length; i++) {
        _v2.set(targets[i].x, targets[i].y, targets[i].z);
        this.effectsPool.spawnTracer(start, _v2, isSniper);
        if (i < 3) {
          this.spawnSparks(_v2, Boolean(shot.hitPlayerId));
        }

        // Supersonic bullet flyby crack/whiz if enemy round zips close to our head
        if (!whizPlayed && shot.shooterId !== this.myId && shot.hitPlayerId !== this.myId) {
          const seg = _v1.copy(_v2).sub(start);
          const segLenSq = seg.lengthSq();
          if (segLenSq > 4) {
            const toCam = _dir.copy(this.camera.position).sub(start);
            const t = THREE.MathUtils.clamp(toCam.dot(seg) / segLenSq, 0, 1);
            if (t > 0.08 && t < 0.96) {
              const closest = _v3.copy(start).addScaledVector(seg, t);
              const flybyDist = closest.distanceTo(this.camera.position);
              if (flybyDist < 2.55) {
                const { pan: whizPan } = this.computeSpatialAudio(closest);
                soundEngine.playBulletWhiz(whizPan);
                whizPlayed = true;
              }
            }
          }
        }

        // Spatial bullet impact crack when round strikes nearby wall/cover
        if (i === 0 && shot.hitPlayerId !== this.myId) {
          const imp = this.computeSpatialAudio(_v2);
          if (imp.distance < 13.5) {
            soundEngine.playBulletImpact(
              shot.hitPlayerId ? 'flesh' : this.map.id === 'warehouse' ? 'metal' : 'wall',
              imp.distance,
              imp.pan
            );
          }
        }
      }
    }

    this.radarBlips.push({
      x: shot.origin.x,
      z: shot.origin.z,
      expiresAt: performance.now() + 2000,
    });
  }

  public handleGrenadeExplosion(ev: GrenadeExplodeEvent) {
    _v1.set(ev.x, ev.y + 0.3, ev.z);
    const { distance: dist, pan, occluded } = this.computeSpatialAudio(_v1);
    soundEngine.playSpatialExplosion(dist, pan, { x: ev.x, y: ev.y + 0.3, z: ev.z }, occluded);
    if (dist < 18) {
      this.cameraShake = Math.max(this.cameraShake, (1 - dist / 18) * 0.055);
    }
    this.effectsPool.spawnExplosion(_v1);
  }

  public applyServerSnapshot(snapshot: MatchSnapshot) {
    this.latestSnapshot = snapshot;
    const seenIds = new Set<string>();

    for (const p of snapshot.players) {
      seenIds.add(p.id);

      if (p.id === this.myId) {
        const wasAlive = this.alive;
        this.hp = p.hp;
        this.armor = p.armor;
        this.alive = p.alive;
        this.respawnTimer = p.respawnTimer;
        this.myTeam = p.team;

        if (!this.hasSyncedInitialSpawn || (!wasAlive && p.alive)) {
          this.hasSyncedInitialSpawn = true;
          this.pos.set(p.x, p.y, p.z);
          this.yaw = p.yaw;
          this.pitch = 0;
          this.velY = 0;
          this.targetLean = 0;
          this.currentLean = 0;
          this.ammoState = this.createFreshAmmo();
          this.reloading = false;
          this.isAds = false;
          const resolved = resolveWeaponForRule(this.weaponRule, p.primaryWeapon);
          this.primaryWeapon = resolved.primaryWeapon;
          this.equipSlot(resolved.defaultSlot, false);
        }
        continue;
      }

      let actor = this.remoteActors.get(p.id);
      if (!actor) {
        const isAlly = this.mode === 'tdm' && p.team === this.myTeam;
        const rankShort = getRankForExp(p.exp || 0).rank.shortCode;
        const handle = buildOptimizedOperator(
          p.id,
          p.name,
          p.team,
          isAlly,
          p.loadout ?? DEFAULT_LOADOUT,
          rankShort,
          true
        );
        handle.root.position.set(p.x, p.y, p.z);
        this.scene.add(handle.root);
        actor = {
          id: p.id,
          name: p.name,
          team: p.team,
          handle,
          targetPos: new THREE.Vector3(p.x, p.y, p.z),
          targetYaw: p.yaw,
          targetPitch: p.pitch,
          targetLean: p.lean || 0,
          crouch: p.crouch,
          alive: p.alive,
          deathTimer: 0,
          walkPhase: Math.random() * 6,
          stepAccum: 0,
        };
        this.remoteActors.set(p.id, actor);
      }

      // Detect elimination transition -> trigger backward collapse animation
      if (actor.alive && !p.alive) {
        actor.deathTimer = 1.25;
      }
      if (!actor.alive && p.alive) {
        actor.deathTimer = 0;
        actor.handle.bodyPivot.rotation.x = 0;
        actor.handle.bodyPivot.position.y = 0;
        actor.handle.root.position.set(p.x, p.y, p.z);
      }

      actor.targetPos.set(p.x, p.y, p.z);
      actor.targetYaw = p.yaw;
      actor.targetPitch = p.pitch;
      actor.targetLean = p.lean || 0;
      actor.crouch = p.crouch;
      actor.alive = p.alive;
      actor.handle.setWeaponVisual(p.weaponId);

      const isAlly = this.mode === 'tdm' && p.team === this.myTeam;
      actor.handle.labelSprite.visible =
        p.alive && (isAlly || actor.targetPos.distanceTo(this.pos) < 17);
    }

    for (const [id, actor] of this.remoteActors.entries()) {
      if (!seenIds.has(id)) {
        this.scene.remove(actor.handle.root);
        actor.handle.dispose();
        this.remoteActors.delete(id);
      }
    }

    // Sync active grenades
    const seenGrenades = new Set<string>();
    for (const g of snapshot.grenades) {
      seenGrenades.add(g.id);
      let mesh = this.grenadeMeshes.get(g.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
        this.scene.add(mesh);
        this.grenadeMeshes.set(g.id, mesh);
      }
      mesh.position.set(g.x, g.y, g.z);
    }
    for (const [id, mesh] of this.grenadeMeshes.entries()) {
      if (!seenGrenades.has(id)) {
        this.scene.remove(mesh);
        this.grenadeMeshes.delete(id);
      }
    }

    // Sync Supply Crates availability
    if (snapshot.supplies) {
      for (const s of snapshot.supplies) {
        const mesh = this.supplyMeshes.get(s.id);
        if (mesh) {
          mesh.visible = s.available;
        }
      }
    }
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3) {
    const isSniper = this.activeWeapon === 'awp' || this.activeWeapon === 'psg1';
    this.effectsPool.spawnTracer(start, end, isSniper);
  }

  private spawnSparks(point: THREE.Vector3, isBlood: boolean) {
    if (isBlood) {
      this.effectsPool.spawnImpact(point, 'blood', 5);
    } else {
      this.effectsPool.spawnImpact(point, 'spark', 4);
      if (!this.isSoftwareGl) {
        this.effectsPool.spawnImpact(point, 'dust', 2);
      }
    }
  }

  private isScoped(): boolean {
    return this.isAds && WEAPONS[this.activeWeapon].hasScope && !this.reloading;
  }

  private pushHud(force = false) {
    const now = performance.now();
    if (!force && now - this.lastHudPushMs < 55) return;
    this.lastHudPushMs = now;

    const st = this.ammoState[this.activeWeapon];
    const reloadProgress = this.reloading
      ? Math.min(1, (now - this.reloadStartMs) / Math.max(1, this.reloadDurMs))
      : 0;

    const ruleSpec = WEAPON_RULES[this.weaponRule] ?? WEAPON_RULES.all;
    const rawDeg = ((-THREE.MathUtils.radToDeg(this.yaw)) % 360 + 360) % 360;

    this.callbacks.onHudUpdate({
      hp: this.hp,
      armor: this.armor,
      alive: this.alive,
      respawnTimer: this.respawnTimer,
      weaponId: this.activeWeapon,
      slot: this.activeSlot,
      allowedSlots: ruleSpec.allowedSlots,
      ammo: st.mag,
      reserve: st.reserve,
      reloading: this.reloading,
      reloadProgress,
      isScoped: this.isScoped(),
      isAds: this.isAds,
      crouch: this.crouch,
      sprinting: this.sprinting,
      sliding: this.slideTimer > 0,
      lean: Math.round(this.targetLean),
      hasGrenade: ruleSpec.allowedSlots.includes(4) && this.ammoState.frag.mag > 0,
      crosshairSpread: Math.min(
        1,
        this.recoilOffset * 7 + (this.sprinting ? 0.45 : this.slideTimer > 0 ? 0.32 : this.isAds ? 0 : this.crouch ? 0.06 : 0.15)
      ),
      pointerLocked: this.pointerLocked,
      yawDeg: Math.round(rawDeg),
      radioOpen: this.radioOpen,
      enemyInCrosshair: this.enemyInCrosshair,
      sprintLocked: this.virtualSprintLock,
    });
  }

  private drawMinimap() {
    const canvas = this.minimapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const b = this.map.bounds;
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;

    const toX = (wx: number) => ((wx - b.minX) / spanX) * (w - 16) + 8;
    const toY = (wz: number) => ((wz - b.minZ) / spanZ) * (h - 16) + 8;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(9, 13, 21, 0.92)';
    ctx.fillRect(0, 0, w, h);

    // Subtle tactical coordinate gridlines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
    ctx.lineWidth = 1;
    for (let gx = 24; gx < w; gx += 24) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 24; gy < h; gy += 24) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Cover blocks with top highlight edge
    for (const box of this.map.boxes) {
      if (box.decorOnly) continue;
      const bx = toX(box.x - box.w * 0.5);
      const by = toY(box.z - box.d * 0.5);
      const bw = Math.max(2, (box.w / spanX) * (w - 16));
      const bh = Math.max(2, (box.d / spanZ) * (h - 16));
      ctx.fillStyle = box.h > 2.5 ? 'rgba(148, 163, 184, 0.42)' : 'rgba(148, 163, 184, 0.24)';
      ctx.fillRect(bx, by, bw, bh);
    }

    // Active supply crates on minimap
    if (this.latestSnapshot?.supplies) {
      for (const s of this.latestSnapshot.supplies) {
        if (!s.available) continue;
        ctx.fillStyle = s.kind === 'medkit' ? '#22c55e' : '#f59e0b';
        ctx.fillRect(toX(s.x) - 2.5, toY(s.z) - 2.5, 5, 5);
      }
    }

    // Enemy gunfire radar pings with expanding ring
    const now = performance.now();
    this.radarBlips = this.radarBlips.filter((bl) => bl.expiresAt > now);
    for (const bl of this.radarBlips) {
      const alpha = (bl.expiresAt - now) / 2000;
      const bx = toX(bl.x);
      const by = toY(bl.z);
      ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.7})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bx, by, 4 + (1 - alpha) * 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.95})`;
      ctx.beginPath();
      ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Teammates (TASK FORCE #4FD1FF / VIPER UNIT #FFB020)
    if (this.latestSnapshot) {
      for (const p of this.latestSnapshot.players) {
        if (!p.alive || p.id === this.myId) continue;
        const isAlly = this.mode === 'tdm' && p.team === this.myTeam;
        if (!isAlly) continue;
        ctx.fillStyle = TEAM_IDENTITY[p.team].accentHex;
        ctx.beginPath();
        ctx.arc(toX(p.x), toY(p.z), 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Local player FOV cone + directional chevron arrow
    const px = toX(this.pos.x);
    const py = toY(this.pos.z);
    const lookX = -Math.sin(this.yaw);
    const lookZ = -Math.cos(this.yaw);
    const angle = Math.atan2(lookZ, lookX);

    ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, 24, angle - 0.55, angle + 0.55);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(5.5, 0);
    ctx.lineTo(-4, -3.6);
    ctx.lineTo(-2.2, 0);
    ctx.lineTo(-4, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private update(dt: number) {
    const safeDt = Math.min(0.05, dt);
    const now = performance.now();
    const elapsed = this.clock.elapsedTime;

    // Reload completion
    if (this.reloading && now - this.reloadStartMs >= this.reloadDurMs) {
      const spec = WEAPONS[this.activeWeapon];
      const st = this.ammoState[this.activeWeapon];
      const needed = spec.magSize - st.mag;
      const take = Math.min(needed, st.reserve);
      st.mag += take;
      st.reserve -= take;
      this.reloading = false;
      this.pushHud(true);
    }

    // Animate Crossroad SWAT Police Siren Lights & Atmospheric Particles
    if (this.sirenRedLight && this.sirenBlueLight) {
      const flash = Math.sin(elapsed * 13);
      this.sirenRedLight.intensity = flash > 0 ? 4.4 : 0.2;
      this.sirenBlueLight.intensity = flash <= 0 ? 4.4 : 0.2;
    }
    if (this.ambientParticles && this.ambientParticles.visible) {
      this.ambientParticles.rotation.y = elapsed * 0.015;
      this.ambientParticles.position.y = Math.sin(elapsed * 0.5) * 0.22;
    }

    // Local Player Movement + Tactical Slide (Shift+C) + Lean (Q/E) + Sprint + Virtual Joystick
    this.slideCooldown = Math.max(0, this.slideCooldown - safeDt);
    let currentStrafe = 0;

    if (this.alive && !this.chatOpen) {
      const spec = WEAPONS[this.activeWeapon];
      const crouchKeyDown = this.isActionDown('crouch');
      this.crouch = this.controlSettings.toggleCrouch
        ? this.crouchToggled || this.slideTimer > 0
        : crouchKeyDown || this.crouchToggled || this.slideTimer > 0;
      const walkQuiet = Boolean(this.keys['AltLeft']);

      const kbFwd = (this.isActionDown('forward') ? 1 : 0) - (this.isActionDown('backward') ? 1 : 0);
      const kbStrafe = (this.isActionDown('right') ? 1 : 0) - (this.isActionDown('left') ? 1 : 0);
      const fwdInput =
        Math.abs(this.virtualMoveY) > 0.08
          ? this.virtualMoveY
          : this.virtualSprintLock
            ? 1
            : kbFwd;
      const strafeInput = Math.abs(this.virtualMoveX) > 0.08 ? this.virtualMoveX : kbStrafe;
      currentStrafe = strafeInput;

      // Crouch cloth foley on stance change
      if (this.crouch !== this.prevCrouch) {
        this.prevCrouch = this.crouch;
        if (this.slideTimer <= 0) {
          soundEngine.playCrouch(this.crouch);
        }
      }

      // Lean Left / Lean Right (Keyboard or Touch)
      const kbLean = (this.isActionDown('leanRight') ? 1 : 0) - (this.isActionDown('leanLeft') ? 1 : 0);
      this.targetLean = kbLean !== 0 ? kbLean : this.virtualLean;
      if (this.targetLean !== this.prevTargetLean) {
        this.prevTargetLean = this.targetLean;
        if (this.targetLean !== 0) {
          soundEngine.playLean();
        }
      }

      // Sprint (Shift, pushed virtual joystick forward, or Auto-Sprint Lock)
      const wantSprint =
        this.isActionDown('sprint') || this.virtualMoveY > 0.84 || this.virtualSprintLock;
      this.sprinting =
        wantSprint &&
        fwdInput > 0.2 &&
        !this.crouch &&
        !this.isAds &&
        !this.isFiring &&
        this.slideTimer <= 0 &&
        this.targetLean === 0;

      _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

      let isMoving = false;
      _v1.set(0, 0, 0);

      if (this.slideTimer > 0) {
        this.slideTimer = Math.max(0, this.slideTimer - safeDt);
        const slideFactor = 0.55 + (this.slideTimer / 0.52) * 1.15;
        const slideSpeed = 7.4 * spec.moveSpeedMult * slideFactor;
        _v1.copy(this.slideDir).multiplyScalar(slideSpeed * safeDt);
        isMoving = true;
      } else {
        let moveSpeed = 6.9 * spec.moveSpeedMult;
        if (this.crouch) moveSpeed *= 0.54;
        else if (walkQuiet) moveSpeed *= 0.58;
        else if (this.sprinting) moveSpeed *= 1.32;
        if (this.isAds) moveSpeed *= 0.66;
        if (this.targetLean !== 0) moveSpeed *= 0.72;

        if (Math.abs(fwdInput) > 0.01) _v1.addScaledVector(_forward, fwdInput);
        if (Math.abs(strafeInput) > 0.01) _v1.addScaledVector(_right, strafeInput);
        isMoving = _v1.lengthSq() > 0.001;
        if (isMoving) {
          const mag = Math.min(1, _v1.length());
          _v1.normalize().multiplyScalar(moveSpeed * mag * safeDt);
        }
      }

      if (this.isActionDown('jump') && this.grounded) {
        this.velY = 6.9;
        this.grounded = false;
        this.slideTimer = 0;
        this.crouchToggled = false;
        soundEngine.playJump(this.map.floorType);
      }

      this.velY -= 19.5 * safeDt;
      const prevVelY = this.velY;
      const nextPos = {
        x: this.pos.x + _v1.x,
        y: this.pos.y + this.velY * safeDt,
        z: this.pos.z + _v1.z,
      };
      const resolved = resolvePlayerMovement(nextPos, this.velY, this.map);
      this.pos.set(resolved.x, resolved.y, resolved.z);
      this.velY = resolved.velY;
      this.wasGrounded = this.grounded;
      this.grounded = resolved.grounded;

      // Tactile Landing Camera Dip & Velocity-Scaled Surface Impact Sound
      if (!this.wasGrounded && this.grounded && prevVelY < -3.0) {
        this.landDip = Math.min(0.18, Math.abs(prevVelY) * 0.018);
        const impactStrength = THREE.MathUtils.clamp(Math.abs(prevVelY) / 9.2, 0.35, 1.5);
        soundEngine.playLand(this.map.floorType, impactStrength);
      }

      if (isMoving && this.grounded && this.slideTimer <= 0) {
        this.walkBobTimer += safeDt * (this.sprinting ? 13.5 : this.crouch ? 5.5 : 9.8);
        this.stepSoundTimer -= safeDt;
        if (this.stepSoundTimer <= 0) {
          const stance = this.crouch || walkQuiet ? 'crouch' : this.sprinting ? 'sprint' : 'walk';
          soundEngine.playFootstep({
            surface: this.map.floorType,
            stance,
          });
          this.stepSoundTimer = stance === 'sprint' ? 0.3 : stance === 'crouch' ? 0.56 : 0.42;
        }
      } else {
        this.walkBobTimer = 0;
      }

      // Throttled ~16Hz Enemy-in-Crosshair Detection (Red Reticle + CoD Mobile Auto-Fire)
      if (now - this.lastTargetScanMs >= 60) {
        this.lastTargetScanMs = now;
        this.enemyInCrosshair = this.checkEnemyInCrosshair();
      }

      const canFire = this.pointerLocked || this.controlSettings.touchControls;
      const mobileAutoFireNow =
        this.controlSettings.touchControls &&
        this.controlSettings.autoFire &&
        this.enemyInCrosshair &&
        !this.reloading &&
        this.activeWeapon !== 'frag';

      if (mobileAutoFireNow) {
        this.fireActiveWeapon();
      } else if (this.isFiring && canFire && WEAPONS[this.activeWeapon].automatic) {
        this.fireActiveWeapon();
      }
    } else {
      this.targetLean = 0;
      this.sprinting = false;
      this.slideTimer = 0;
      this.virtualSprintLock = false;
      this.enemyInCrosshair = false;
    }

    // Smooth Crouch / Slide Eye Height + Landing Dip + Collision-Safe Tactical Lean
    const targetEye =
      this.slideTimer > 0
        ? 0.82
        : this.crouch
          ? PLAYER_CROUCH_EYE_HEIGHT
          : PLAYER_EYE_HEIGHT;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 15, safeDt);
    this.landDip = THREE.MathUtils.damp(this.landDip, 0, 12, safeDt);
    this.currentLean = THREE.MathUtils.damp(this.currentLean, this.targetLean, 14, safeDt);
    const targetStrafeTilt = this.slideTimer > 0 ? -0.075 : -currentStrafe * 0.024;
    this.strafeTilt = THREE.MathUtils.damp(this.strafeTilt, targetStrafeTilt, 10, safeDt);

    // Check lean raycast so camera never clips inside a wall when peeking
    let leanDist = this.currentLean * 0.44;
    if (Math.abs(leanDist) > 0.02) {
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const sign = Math.sign(leanDist);
      const wallT = raycastMap(
        { x: this.pos.x, y: this.pos.y + this.currentEyeHeight, z: this.pos.z },
        { x: _right.x * sign, y: 0, z: _right.z * sign },
        this.map,
        Math.abs(leanDist) + 0.25
      );
      if (wallT !== null) {
        leanDist = sign * Math.max(0, wallT - 0.25);
      }
    }

    this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 12, safeDt);
    const shakeX = this.cameraShake > 0.0004 ? (Math.random() - 0.5) * this.cameraShake : 0;
    const shakeZ = this.cameraShake > 0.0004 ? (Math.random() - 0.5) * this.cameraShake * 1.4 : 0;

    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.set(
      this.pos.x + _right.x * leanDist,
      this.pos.y +
        (this.alive
          ? this.currentEyeHeight - this.landDip - Math.abs(this.currentLean) * 0.06
          : 2.6),
      this.pos.z + _right.z * leanDist
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + shakeX;
    this.camera.rotation.z = -this.currentLean * 0.16 + this.strafeTilt + shakeZ;

    // Update Web Audio 3D HRTF Listener transform every frame
    _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    _camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();
    soundEngine.updateListener(
      { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      { x: _forward.x, y: _forward.y, z: _forward.z },
      { x: _camUp.x, y: _camUp.y, z: _camUp.z }
    );

    // Smooth FOV damping (ADS zoom vs Slide / Sprint wide FOV)
    const spec = WEAPONS[this.activeWeapon];
    const targetFov =
      this.isAds && !this.reloading
        ? spec.adsFov
        : this.slideTimer > 0
          ? Math.min(112, this.baseFov + 9)
          : this.sprinting
            ? Math.min(108, this.baseFov + 5)
            : this.baseFov;
    this.currentFov = THREE.MathUtils.damp(this.currentFov, targetFov, 14, safeDt);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // Viewmodel recoil, bolt blowback, M870 pump rack, mag reload drop, mouse sway, sprint tuck & inspect
    this.recoilOffset = THREE.MathUtils.damp(this.recoilOffset, 0, 16, safeDt);
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 14, safeDt);
    this.boltKick = THREE.MathUtils.damp(this.boltKick, 0, 26, safeDt);
    this.weaponSwayX = THREE.MathUtils.damp(this.weaponSwayX, 0, 10, safeDt);
    this.weaponSwayY = THREE.MathUtils.damp(this.weaponSwayY, 0, 10, safeDt);
    this.equipAnim = THREE.MathUtils.damp(this.equipAnim, 0, 10, safeDt);
    this.knifeSwingTimer = Math.max(0, this.knifeSwingTimer - safeDt);
    this.inspectTimer = Math.max(0, this.inspectTimer - safeDt);

    // M870 Pump-Action Rack Animation + Timed Red 12-Gauge Shell Ejection
    let pumpSlide = 0;
    if (this.pumpTimer > 0) {
      this.pumpTimer = Math.max(0, this.pumpTimer - safeDt);
      const elapsedPump = 0.54 - this.pumpTimer;
      // Start pumping after recoil kick settles (0.16s -> 0.48s)
      if (elapsedPump > 0.16 && elapsedPump < 0.48) {
        const phase = (elapsedPump - 0.16) / 0.32; // 0..1
        pumpSlide = Math.sin(phase * Math.PI); // Smooth pull back & forward
        if (!this.pumpShellEjected && phase >= 0.48) {
          this.pumpShellEjected = true;
          this.spawnShellCasing(true);
        }
      }
    }

    if (this.activeViewmodel?.boltMesh) {
      const boltBaseZ = this.activeWeapon === 'deagle' ? -0.25 : -0.2;
      this.activeViewmodel.boltMesh.position.z =
        boltBaseZ + this.boltKick + (this.activeWeapon === 'm870' ? pumpSlide * 0.085 : 0);
    }

    if (this.activeViewmodel?.pumpMesh && this.activeViewmodel.pumpRestZ !== undefined) {
      this.activeViewmodel.pumpMesh.position.z =
        this.activeViewmodel.pumpRestZ + pumpSlide * 0.115;
    }

    // Multi-stage Magazine Drop & Re-Insert during Reload
    const reloadProgress = this.reloading
      ? Math.min(1, (now - this.reloadStartMs) / Math.max(1, this.reloadDurMs))
      : 0;
    if (this.activeViewmodel?.magMesh && this.activeViewmodel.magRestY !== undefined) {
      let magDrop = 0;
      if (this.reloading) {
        if (reloadProgress < 0.25) {
          magDrop = (reloadProgress / 0.25) * 0.22;
        } else if (reloadProgress < 0.68) {
          magDrop = 0.22;
        } else if (reloadProgress < 0.9) {
          magDrop = (1 - (reloadProgress - 0.68) / 0.22) * 0.22;
        }
      }
      this.activeViewmodel.magMesh.position.y = this.activeViewmodel.magRestY - magDrop;
    }

    const inspectPhase = this.inspectTimer > 0 ? Math.sin((this.inspectTimer / 2.2) * Math.PI) : 0;
    const reloadTilt = this.reloading ? Math.sin(reloadProgress * Math.PI) : 0;

    const adsY =
      this.activeWeapon === 'm4a1'
        ? -0.09
        : this.activeWeapon === 'scar'
          ? -0.094
          : this.activeWeapon === 'ak74'
            ? -0.082
            : this.activeWeapon === 'mp5'
              ? -0.074
              : this.activeWeapon === 'p90'
                ? -0.088
                : this.activeWeapon === 'm870'
                  ? -0.068
                  : this.activeWeapon === 'deagle'
                    ? -0.058
                    : -0.092;

    const targetVmX =
      (this.isAds && !this.reloading ? 0 : this.sprinting ? 0.14 : 0.24) +
      this.weaponSwayX +
      Math.cos(this.walkBobTimer * 0.5) * (this.sprinting ? 0.015 : 0.004) -
      inspectPhase * 0.08 -
      reloadTilt * 0.04;
    const targetVmY =
      (this.reloading
        ? -0.22 - reloadTilt * 0.11
        : this.isAds
          ? adsY
          : this.sprinting
            ? -0.28
            : -0.22) +
      Math.sin(this.walkBobTimer) * (this.sprinting ? 0.016 : 0.008) +
      this.weaponSwayY -
      this.equipAnim * 0.24 +
      inspectPhase * 0.05 +
      pumpSlide * 0.02;
    const targetVmZ = (this.isAds ? -0.155 : -0.25) + this.recoilOffset + inspectPhase * 0.04;

    this.weaponHolder.position.x = THREE.MathUtils.damp(this.weaponHolder.position.x, targetVmX, 16, safeDt);
    this.weaponHolder.position.y = THREE.MathUtils.damp(this.weaponHolder.position.y, targetVmY, 16, safeDt);
    this.weaponHolder.position.z = THREE.MathUtils.damp(this.weaponHolder.position.z, targetVmZ, 18, safeDt);

    const targetRotX = this.reloading
      ? -0.22 - reloadTilt * 0.28
      : this.sprinting
        ? -0.22
        : this.recoilPitch * 1.45 +
          pumpSlide * 0.18 -
          (this.knifeSwingTimer > 0 ? Math.sin(this.knifeSwingTimer * 14) * 0.72 : 0) +
          inspectPhase * 0.22;
    const targetRotY = this.sprinting ? 0.42 : inspectPhase * 0.65;
    const targetRotZ = this.reloading
      ? reloadTilt * 0.46
      : this.sprinting
        ? 0.22
        : pumpSlide * -0.16 + inspectPhase * -0.45;

    this.weaponHolder.rotation.x = THREE.MathUtils.damp(this.weaponHolder.rotation.x, targetRotX, 15, safeDt);
    this.weaponHolder.rotation.y = THREE.MathUtils.damp(this.weaponHolder.rotation.y, targetRotY, 15, safeDt);
    this.weaponHolder.rotation.z = THREE.MathUtils.damp(this.weaponHolder.rotation.z, targetRotZ, 15, safeDt);
    this.weaponHolder.visible = this.alive && !this.isScoped();

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= safeDt;
      if (this.muzzleFlashTimer <= 0 && this.activeViewmodel) {
        this.activeViewmodel.muzzleFlash.visible = false;
        this.activeViewmodel.muzzleLight.intensity = 0;
      }
    }

    // Rotate & gently bob active Supply Crates
    for (const crate of this.supplyMeshes.values()) {
      if (!crate.visible) continue;
      crate.rotation.y = elapsed * 1.1;
      crate.position.y = Math.sin(elapsed * 2.8) * 0.06;
    }

    // Interpolate Remote Actors + LOD + Blob Shadow + 3D HRTF Footsteps + Hit Flinch / Collapse
    const qSpec = this.qualityManager.getSpec();
    for (const actor of this.remoteActors.values()) {
      actor.handle.updateMuzzleFlash(safeDt);

      if (!actor.alive) {
        if (actor.deathTimer > 0) {
          actor.deathTimer = Math.max(0, actor.deathTimer - safeDt);
          actor.handle.root.visible = true;
          actor.handle.updateProceduralExtras(safeDt, false);
        } else {
          actor.handle.root.visible = false;
        }
        continue;
      }

      actor.handle.root.visible = true;
      const distToCam = actor.handle.root.position.distanceTo(this.camera.position);
      actor.handle.updateLOD(distToCam, qSpec.lodBias, qSpec.useBlobShadow);

      const prevX = actor.handle.root.position.x;
      const prevZ = actor.handle.root.position.z;

      actor.handle.root.position.lerp(actor.targetPos, 1 - Math.exp(-15 * safeDt));

      let diff = actor.targetYaw - actor.handle.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      actor.handle.root.rotation.y += diff * (1 - Math.exp(-15 * safeDt));

      const moved = Math.hypot(
        actor.handle.root.position.x - prevX,
        actor.handle.root.position.z - prevZ
      );
      const speedEst = moved / Math.max(0.016, safeDt);
      const isSprinting = !actor.crouch && speedEst > 6.8;

      if (moved > 0.005) {
        actor.walkPhase += safeDt * (isSprinting ? 14.5 : actor.crouch ? 9.5 : 11.5);
        const swing = Math.sin(actor.walkPhase);
        const strideAmp = actor.crouch ? 0.36 : isSprinting ? 0.68 : 0.52;
        const hipBase = actor.crouch ? 0.48 : 0.04;
        const kneeBase = actor.crouch ? -0.94 : -0.12;

        actor.handle.leftLeg.rotation.x = hipBase + swing * strideAmp;
        actor.handle.rightLeg.rotation.x = hipBase - swing * strideAmp;
        actor.handle.leftKnee.rotation.x = kneeBase - Math.max(0, -swing) * (isSprinting ? 0.85 : 0.62);
        actor.handle.rightKnee.rotation.x = kneeBase - Math.max(0, swing) * (isSprinting ? 0.85 : 0.62);

        // 3D HRTF occluded enemy/ally footsteps
        actor.stepAccum += moved;
        const stepThreshold = actor.crouch ? 1.55 : 1.78;
        if (actor.stepAccum >= stepThreshold) {
          actor.stepAccum = 0;
          const spatial = this.computeSpatialAudio(actor.handle.root.position);
          if (spatial.distance > 1.2 && spatial.distance < 21) {
            soundEngine.playSpatialFootstep({
              surface: this.map.floorType,
              stance: actor.crouch ? 'crouch' : isSprinting ? 'sprint' : 'walk',
              distance: spatial.distance,
              pan: spatial.pan,
              pos: {
                x: actor.handle.root.position.x,
                y: actor.handle.root.position.y + 0.15,
                z: actor.handle.root.position.z,
              },
              occluded: spatial.occluded,
            });
          }
        }
      } else {
        const idleHipL = actor.crouch ? 0.56 : 0.06;
        const idleHipR = actor.crouch ? 0.44 : -0.05;
        const idleKneeL = actor.crouch ? -1.06 : -0.1;
        const idleKneeR = actor.crouch ? -0.92 : -0.04;
        actor.handle.leftLeg.rotation.x = THREE.MathUtils.damp(actor.handle.leftLeg.rotation.x, idleHipL, 12, safeDt);
        actor.handle.rightLeg.rotation.x = THREE.MathUtils.damp(actor.handle.rightLeg.rotation.x, idleHipR, 12, safeDt);
        actor.handle.leftKnee.rotation.x = THREE.MathUtils.damp(actor.handle.leftKnee.rotation.x, idleKneeL, 12, safeDt);
        actor.handle.rightKnee.rotation.x = THREE.MathUtils.damp(actor.handle.rightKnee.rotation.x, idleKneeR, 12, safeDt);
      }

      const strideBounce =
        moved > 0.005
          ? Math.abs(Math.sin(actor.walkPhase)) * (isSprinting ? 0.036 : 0.02)
          : Math.sin(elapsed * 2.2 + actor.walkPhase) * 0.006;
      const targetBodyY = (actor.crouch ? 0.64 : 0.88) + strideBounce;
      actor.handle.upperBody.position.y = THREE.MathUtils.damp(
        actor.handle.upperBody.position.y,
        targetBodyY,
        12,
        safeDt
      );
      actor.handle.upperBody.rotation.x = THREE.MathUtils.damp(
        actor.handle.upperBody.rotation.x,
        actor.crouch ? -0.14 : isSprinting ? -0.1 : 0,
        10,
        safeDt
      );
      actor.handle.headGroup.rotation.x = THREE.MathUtils.damp(
        actor.handle.headGroup.rotation.x,
        actor.targetPitch * 0.55,
        12,
        safeDt
      );
      actor.handle.bodyPivot.rotation.z = THREE.MathUtils.damp(
        actor.handle.bodyPivot.rotation.z,
        -actor.targetLean * 0.25,
        12,
        safeDt
      );
      actor.handle.updateProceduralExtras(safeDt, true);
    }

    // Update Zero-GC Pooled VFX (Tracers, Sparks/Blood/Dust, Casings, Explosions)
    this.effectsPool.update(safeDt);

    // Network sync at 30Hz (matching upgraded 30Hz authoritative tick!)
    if (now - this.lastNetSyncMs >= 33) {
      this.lastNetSyncMs = now;
      this.inputSeq++;
      this.callbacks.onSendState({
        x: this.pos.x,
        y: this.pos.y,
        z: this.pos.z,
        yaw: this.yaw,
        pitch: this.pitch,
        crouch: this.crouch,
        lean: this.targetLean,
        sprinting: this.sprinting,
        weaponId: this.activeWeapon,
        seq: this.inputSeq,
      });
    }

    // Performance Monitor + Dynamic Resolution Scaling ('auto' mode)
    const perfSnap = this.perfMonitor.recordFrame(
      safeDt,
      this.renderer,
      this.qualityManager.currentPixelRatio,
      this.qualityManager.resolved
    );
    if (perfSnap) {
      this.callbacks.onPerfUpdate?.(perfSnap);
      const nextDpr = this.qualityManager.tickDynamicResolution(perfSnap.fps, 0.35);
      if (nextDpr !== null) {
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.renderer.setPixelRatio(nextDpr);
        this.pipeline.setSize(w, h);
      }
    }

    this.drawMinimap();
    this.pushHud(false);
  }

  private checkEnemyInCrosshair(): boolean {
    const enemyMeshes: THREE.Mesh[] = [];
    for (const actor of this.remoteActors.values()) {
      if (!actor.alive) continue;
      if (this.mode === 'tdm' && actor.team === this.myTeam) continue;
      enemyMeshes.push(...actor.handle.hitMeshes);
    }
    if (enemyMeshes.length === 0) return false;

    const maxRange = WEAPONS[this.activeWeapon].range;
    _centerNDC.set(0, 0);
    _raycaster.setFromCamera(_centerNDC, this.camera);
    _raycaster.far = maxRange;
    const enemyHits = _raycaster.intersectObjects(enemyMeshes, false);
    if (enemyHits.length === 0) return false;

    const hitDist = enemyHits[0].distance;
    const wallT = raycastMap(
      { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      { x: _raycaster.ray.direction.x, y: _raycaster.ray.direction.y, z: _raycaster.ray.direction.z },
      this.map,
      hitDist
    );
    return wallT === null || wallT >= hitDist - 0.15;
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;
    const dt = this.clock.getDelta();
    this.update(dt);
    this.pipeline.render(this.alive && !this.isScoped());

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.pipeline.setSize(w, h);
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.pointerLocked) {
      this.isFiring = false;
      this.isAds = false;
      this.keys = {};
    }
    this.callbacks.onPointerLockChange(this.pointerLocked);
    this.pushHud(true);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked || !this.alive || this.chatOpen) return;
    const zoomScale = this.isScoped() ? 0.35 : this.isAds ? 0.65 : 1.0;
    this.yaw -= e.movementX * this.sensitivity * zoomScale;
    this.pitch -= e.movementY * this.sensitivity * zoomScale;
    this.pitch = Math.max(-1.46, Math.min(1.46, this.pitch));

    // Tactile inertia weapon sway
    this.weaponSwayX = THREE.MathUtils.clamp(
      this.weaponSwayX - e.movementX * 0.00018,
      -0.025,
      0.025
    );
    this.weaponSwayY = THREE.MathUtils.clamp(
      this.weaponSwayY + e.movementY * 0.00018,
      -0.02,
      0.02
    );
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.pointerLocked || this.chatOpen) return;
    if (e.button === 0) {
      this.isFiring = true;
      this.fireActiveWeapon();
    } else if (e.button === 1) {
      e.preventDefault();
      this.performQuickMelee();
    } else if (e.button === 2) {
      if (this.activeWeapon !== 'knife' && this.activeWeapon !== 'frag' && !this.reloading) {
        const useToggle = this.controlSettings.toggleAds || WEAPONS[this.activeWeapon].hasScope;
        const nextAds = useToggle ? !this.isAds : true;
        if (nextAds !== this.isAds) {
          this.isAds = nextAds;
          soundEngine.playAds(this.isAds);
        }
        this.inspectTimer = 0;
        this.pushHud(true);
      }
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isFiring = false;
    } else if (e.button === 2) {
      const useToggle = this.controlSettings.toggleAds || WEAPONS[this.activeWeapon].hasScope;
      if (!useToggle && this.isAds) {
        this.isAds = false;
        soundEngine.playAds(false);
        this.pushHud(true);
      }
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.pointerLocked || this.chatOpen) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    const ruleSpec = WEAPON_RULES[this.weaponRule] ?? WEAPON_RULES.all;
    const slots = ruleSpec.allowedSlots.filter((s) => s !== 4 || this.ammoState.frag.mag > 0);
    if (slots.length <= 1) return;
    const idx = Math.max(0, slots.indexOf(this.activeSlot));
    const next = slots[(idx + dir + slots.length) % slots.length];
    this.equipSlot(next);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.chatOpen) return;

    if (e.code === 'F3') {
      e.preventDefault();
      this.callbacks.onTogglePerfHud?.();
      return;
    }

    if (e.code === 'Tab') {
      e.preventDefault();
      this.callbacks.onToggleScoreboard(true);
      return;
    }

    if ((e.code === 'KeyT' || e.code === 'Enter') && (this.pointerLocked || this.controlSettings.touchControls)) {
      e.preventDefault();
      this.exitPointerLock();
      this.callbacks.onOpenChat();
      return;
    }

    const wasDown = Boolean(this.keys[e.code]);
    this.keys[e.code] = true;

    const active = this.pointerLocked || this.controlSettings.touchControls;
    if (!active) return;

    const kb = this.controlSettings.keybinds;

    // Radio Quick-Command selection when Radio Menu is open
    if (this.radioOpen && !wasDown) {
      const radioIdx = RADIO_COMMANDS.findIndex((cmd) => cmd.code === e.code);
      if (radioIdx !== -1) {
        this.triggerRadioCommand(radioIdx);
        return;
      }
      if (e.code === 'Escape' || e.code === kb.radio) {
        this.radioOpen = false;
        this.pushHud(true);
        return;
      }
    }

    // Trigger Tactical Slide when pressing Crouch while Sprinting!
    if (!wasDown && (e.code === kb.crouch || e.code === 'ControlLeft')) {
      if (this.sprinting && this.grounded && this.slideCooldown <= 0) {
        this.startTacticalSlide();
      } else if (this.controlSettings.toggleCrouch) {
        this.crouchToggled = !this.crouchToggled;
        this.pushHud(true);
      }
    }

    if (e.code === 'Digit1') this.equipSlot(1);
    else if (e.code === 'Digit2') this.equipSlot(2);
    else if (e.code === 'Digit3') this.equipSlot(3);
    else if (e.code === 'Digit4') this.equipSlot(4);
    else if (e.code === kb.reload) this.startReload();
    else if (e.code === kb.grenade) this.throwQuickGrenade();
    else if (e.code === kb.quickMelee && !wasDown) this.performQuickMelee();
    else if (e.code === kb.radio && !wasDown) {
      this.radioOpen = !this.radioOpen;
      this.pushHud(true);
    } else if (e.code === kb.toggleHud && !wasDown) {
      this.callbacks.onToggleHudHints?.();
    } else if (e.code === kb.quickSwitch) {
      const ruleSpec = WEAPON_RULES[this.weaponRule] ?? WEAPON_RULES.all;
      const quickSlots: WeaponSlot[] = ruleSpec.allowedSlots.filter((s) => s !== 4);
      if (quickSlots.length > 1) {
        const idx = Math.max(0, quickSlots.indexOf(this.activeSlot));
        const nextSlot = quickSlots[(idx + 1) % quickSlots.length];
        this.equipSlot(nextSlot);
      }
    } else if (e.code === kb.inspect && !this.isAds && !this.reloading) {
      this.inspectTimer = 2.2;
      soundEngine.playInspect();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Tab') {
      this.callbacks.onToggleScoreboard(false);
    }
    this.keys[e.code] = false;
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
  };

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  public dispose() {
    this.disposed = true;
    soundEngine.stopAmbience(true);
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.exitPointerLock();

    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);

    for (const actor of this.remoteActors.values()) {
      this.scene.remove(actor.handle.root);
      actor.handle.dispose();
    }
    this.remoteActors.clear();

    for (const vm of this.viewmodels.values()) {
      this.weaponHolder.remove(vm.group);
      vm.dispose();
    }
    this.viewmodels.clear();
    this.activeViewmodel = null;

    this.effectsPool.dispose();
    this.pipeline.dispose();

    // Dispose all batched map geometry, supply crates, sky dome, ambient particles & scene resources cleanly
    const preserveMats = new Set<THREE.Material>([
      ...Object.values(this.materialLib.boxMaterials),
      ...Object.values(this.materialLib.floorMaterials),
      this.grenadeMat,
    ]);
    disposeObject3D(this.scene, preserveMats);

    this.materialLib.dispose();
    this.envTexture?.dispose();
    this.skyDomeTex?.dispose();
    this.grenadeGeo.dispose();
    this.grenadeMat.dispose();
    this.renderer.dispose();
  }
}
