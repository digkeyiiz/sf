import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { MapId } from '../../shared/types';
import type { QualityPresetSpec } from './QualityManager';

/**
 * Generates a lightweight atmospheric PMREM IBL cubemap tailored to each battlefield's
 * time-of-day and bounce light (Midday Desert, Dusk Port Depot, Misty SEA Morning).
 */
export function buildMapEnvironmentIBL(
  renderer: THREE.WebGLRenderer,
  mapId: MapId
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();

  const palette =
    mapId === 'desert_camp'
      ? {
          skyTop: 0x2b6cb0,
          horizon: 0xf4d8ad,
          ground: 0xb69566,
          sunColor: 0xfff1cc,
          sunPos: [30, 38, 22] as const,
          fillColor: 0x8ec5ff,
          fillPos: [-28, 16, -24] as const,
        }
      : mapId === 'warehouse'
        ? {
            // Dusk Port Depot: deep twilight teal sky + warm sodium warehouse bounce
            skyTop: 0x162436,
            horizon: 0x6b4c3b,
            ground: 0x2b313a,
            sunColor: 0xffa852,
            sunPos: [-24, 24, 18] as const,
            fillColor: 0x38bdf8,
            fillPos: [26, 18, -22] as const,
          }
        : {
            // Crossroad: Misty Morning Southeast Asian Urban
            skyTop: 0x5c8ab5,
            horizon: 0xdce7ef,
            ground: 0x626b73,
            sunColor: 0xfff3d8,
            sunPos: [26, 26, -28] as const,
            fillColor: 0xbad7ec,
            fillPos: [-25, 18, 25] as const,
          };

  // Gradient dome inside temporary PMREM scene
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.0, `#${palette.skyTop.toString(16).padStart(6, '0')}`);
  g.addColorStop(0.48, `#${palette.horizon.toString(16).padStart(6, '0')}`);
  g.addColorStop(0.55, `#${palette.ground.toString(16).padStart(6, '0')}`);
  g.addColorStop(1.0, `#${palette.ground.toString(16).padStart(6, '0')}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);

  const gradTex = new THREE.CanvasTexture(c);
  gradTex.colorSpace = THREE.SRGBColorSpace;
  const domeGeo = new THREE.SphereGeometry(50, 20, 12);
  const domeMat = new THREE.MeshBasicMaterial({ map: gradTex, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  // Emissive sun & bounce panels to give crisp specular highlights on gunmetal & visors
  const sunGeo = new THREE.SphereGeometry(5, 12, 12);
  const sunMat = new THREE.MeshBasicMaterial({ color: palette.sunColor });
  const sunBall = new THREE.Mesh(sunGeo, sunMat);
  sunBall.position.set(palette.sunPos[0], palette.sunPos[1], palette.sunPos[2]);
  envScene.add(sunBall);

  const fillGeo = new THREE.PlaneGeometry(24, 14);
  const fillMat = new THREE.MeshBasicMaterial({ color: palette.fillColor, side: THREE.DoubleSide });
  const fillCard = new THREE.Mesh(fillGeo, fillMat);
  fillCard.position.set(palette.fillPos[0], palette.fillPos[1], palette.fillPos[2]);
  fillCard.lookAt(0, 0, 0);
  envScene.add(fillCard);

  const rt = pmrem.fromScene(envScene, 0.035);
  domeGeo.dispose();
  domeMat.dispose();
  gradTex.dispose();
  sunGeo.dispose();
  sunMat.dispose();
  fillGeo.dispose();
  fillMat.dispose();
  pmrem.dispose();

  return rt.texture;
}

/**
 * Dual-pass RenderPipeline:
 * 1. World pass (with optional subtle selective Bloom on High/Ultra Desktop)
 * 2. Dedicated Depth-Cleared Viewmodel Pass so first-person weapons NEVER clip into walls!
 */
export class RenderPipeline {
  private renderer: THREE.WebGLRenderer;
  private worldScene: THREE.Scene;
  private worldCamera: THREE.PerspectiveCamera;

  public readonly viewmodelScene = new THREE.Scene();
  public readonly viewmodelCamera: THREE.PerspectiveCamera;

  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private usePostProcessing = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    worldScene: THREE.Scene,
    worldCamera: THREE.PerspectiveCamera,
    envTexture: THREE.Texture,
    width: number,
    height: number
  ) {
    this.renderer = renderer;
    this.worldScene = worldScene;
    this.worldCamera = worldCamera;

    this.viewmodelCamera = new THREE.PerspectiveCamera(
      68,
      Math.max(1, width) / Math.max(1, height),
      0.03,
      6
    );

    // Match IBL & crisp 3-point tactical weapon lighting in the isolated Viewmodel scene
    this.viewmodelScene.environment = envTexture;
    const vmHemi = new THREE.HemisphereLight(0xdceaff, 0x3b4450, 0.95);
    this.viewmodelScene.add(vmHemi);
    const vmKey = new THREE.DirectionalLight(0xfff4e0, 1.45);
    vmKey.position.set(2.5, 4.0, 2.5);
    this.viewmodelScene.add(vmKey);
    const vmRim = new THREE.DirectionalLight(0x7cc4ff, 0.55);
    vmRim.position.set(-2.5, 1.8, -2.5);
    this.viewmodelScene.add(vmRim);
    this.viewmodelScene.add(this.viewmodelCamera);
  }

  public applyQuality(spec: QualityPresetSpec, width: number, height: number, isMobile: boolean) {
    // Enable subtle selective bloom only on high/ultra desktop GPUs
    const wantPost = spec.bloomEnabled && !isMobile;
    if (wantPost && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(this.worldScene, this.worldCamera);
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, width), Math.max(1, height)),
        spec.tier === 'ultra' ? 0.26 : 0.18,
        0.38,
        0.92 // high threshold: only muzzle flash, glowing reticles, lamps & beacons bloom
      );
      const outputPass = new OutputPass();
      this.composer.addPass(renderPass);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(outputPass);
    }
    if (this.bloomPass) {
      this.bloomPass.strength = spec.tier === 'ultra' ? 0.24 : 0.16;
    }
    this.usePostProcessing = wantPost && Boolean(this.composer);
    if (this.composer && this.usePostProcessing) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(Math.max(1, width), Math.max(1, height));
    }
  }

  public setSize(width: number, height: number) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.viewmodelCamera.aspect = w / h;
    this.viewmodelCamera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  public render(renderViewmodel: boolean) {
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = true;

    if (this.usePostProcessing && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.worldScene, this.worldCamera);
    }

    if (renderViewmodel) {
      // Clear ONLY depth buffer and draw weapon/hands cleanly on top with zero wall clipping!
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.viewmodelScene, this.viewmodelCamera);
    }

    this.renderer.autoClear = prevAutoClear;
  }

  public dispose() {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
    }
    // Dispose any remaining geometries/materials attached to viewmodelScene
    this.viewmodelScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
  }
}
