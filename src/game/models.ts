import * as THREE from 'three';
import type { CharacterLoadout, MapId, TeamId, WeaponId } from '../shared/types';
import { DEFAULT_LOADOUT } from '../shared/progression';
import { getWeaponTextureSet } from './textures';

export interface WeaponViewmodelHandle {
  group: THREE.Group;
  muzzleFlash: THREE.Mesh;
  muzzleLight: THREE.PointLight;
  boltMesh?: THREE.Object3D;
  pumpMesh?: THREE.Object3D;
  pumpRestZ?: number;
  magMesh?: THREE.Object3D;
  magRestY?: number;
  ejectionPortLocal: THREE.Vector3;
}

interface UniformVisualPalette {
  clothTexKey:
    | 'navyRipstop'
    | 'khakiTwill'
    | 'blackRipstop'
    | 'oliveRipstop'
    | 'desertCamo'
    | 'camoCloth'
    | 'arcticCamo'
    | 'jungleTiger'
    | 'commanderCharcoal';
  pantsTexKey:
    | 'navyRipstop'
    | 'blackRipstop'
    | 'oliveRipstop'
    | 'desertCamo'
    | 'camoCloth'
    | 'arcticCamo'
    | 'jungleTiger'
    | 'commanderCharcoal';
  shirtTint: number;
  pantsTint: number;
  sheenColor: number;
  isPolicePatrol?: boolean;
  cuffStripeColor?: number;
}

function getUniformPalette(uniformId: string): UniformVisualPalette {
  switch (uniformId) {
    case 'police_patrol':
      return {
        clothTexKey: 'khakiTwill',
        pantsTexKey: 'navyRipstop',
        shirtTint: 0xddd2c0,
        pantsTint: 0xc2d0e6,
        sheenColor: 0xa8987e,
        isPolicePatrol: true,
        cuffStripeColor: 0xf59e0b,
      };
    case 'commando_black':
      return {
        clothTexKey: 'blackRipstop',
        pantsTexKey: 'blackRipstop',
        shirtTint: 0xd0d6e0,
        pantsTint: 0xc0c6d0,
        sheenColor: 0x475569,
        cuffStripeColor: 0x94a3b8,
      };
    case 'tactical_olive':
      return {
        clothTexKey: 'oliveRipstop',
        pantsTexKey: 'oliveRipstop',
        shirtTint: 0xd8e0d2,
        pantsTint: 0xc6d0be,
        sheenColor: 0x6b7d5e,
      };
    case 'desert_ops':
      return {
        clothTexKey: 'desertCamo',
        pantsTexKey: 'desertCamo',
        shirtTint: 0xf0e8da,
        pantsTint: 0xe6dccb,
        sheenColor: 0xd4be98,
      };
    case 'urban_ghost':
      return {
        clothTexKey: 'camoCloth',
        pantsTexKey: 'camoCloth',
        shirtTint: 0xe8edf5,
        pantsTint: 0xd8e0ea,
        sheenColor: 0x94a3b8,
      };
    case 'thai_narai':
      return {
        clothTexKey: 'navyRipstop',
        pantsTexKey: 'blackRipstop',
        shirtTint: 0xb6c8e4,
        pantsTint: 0xb8c0cc,
        sheenColor: 0xdc2626,
        isPolicePatrol: true,
        cuffStripeColor: 0xdc2626,
      };
    case 'arctic_ops':
      return {
        clothTexKey: 'arcticCamo',
        pantsTexKey: 'arcticCamo',
        shirtTint: 0xf4f8fc,
        pantsTint: 0xe6edf5,
        sheenColor: 0xcbd5e1,
        cuffStripeColor: 0x38bdf8,
      };
    case 'jungle_tiger':
      return {
        clothTexKey: 'jungleTiger',
        pantsTexKey: 'jungleTiger',
        shirtTint: 0xdce8d5,
        pantsTint: 0xcddac5,
        sheenColor: 0x4d7c0f,
      };
    case 'vip_commander':
      return {
        clothTexKey: 'commanderCharcoal',
        pantsTexKey: 'commanderCharcoal',
        shirtTint: 0xe5e7eb,
        pantsTint: 0xd1d5db,
        sheenColor: 0xf59e0b,
        isPolicePatrol: true,
        cuffStripeColor: 0xfbbf24,
      };
    case 'swat_navy':
    default:
      return {
        clothTexKey: 'navyRipstop',
        pantsTexKey: 'navyRipstop',
        shirtTint: 0xd8e4f8,
        pantsTint: 0xcad8ee,
        sheenColor: 0x3b5988,
        cuffStripeColor: 0x38bdf8,
      };
  }
}

/* ============================================================================
 * AAA PROCEDURAL GEOMETRY HELPERS (Chamfered Extrusions, Lathe Profiles, Plates)
 * ============================================================================ */

function makeBeveledBox(
  w: number,
  h: number,
  d: number,
  bevel = 0.004,
  bevelSegments = 2
): THREE.ExtrudeGeometry {
  const bw = Math.max(0.002, w - bevel * 2);
  const bh = Math.max(0.002, h - bevel * 2);
  const bd = Math.max(0.002, d - bevel * 2);
  const shape = new THREE.Shape();
  const hw = bw * 0.5;
  const hh = bh * 0.5;
  const r = Math.min(bevel * 0.9, hw * 0.45, hh * 0.45);
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: bd,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
    curveSegments: 4,
  });
  geo.center();
  return geo;
}

/**
 * Creates a shooter's-cut contoured ballistic armor plate (Crye JPC / SWAT Level IV SAPI)
 * with authentic upper-shoulder diagonal chamfers and normalized 0..1 planar UVs
 * so "POLICE" and "SWAT" vest textures map razor-sharp onto the chest & back!
 */
function makeShooterCutPlate(w: number, h: number, depth: number, bevel = 0.012): THREE.ExtrudeGeometry {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const cutX = w * 0.22;
  const cutY = h * 0.22;

  const shape = new THREE.Shape();
  shape.moveTo(-hw + 0.02, -hh);
  shape.lineTo(hw - 0.02, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + 0.02);
  shape.lineTo(hw, hh - cutY);
  shape.lineTo(hw - cutX, hh);
  shape.lineTo(-hw + cutX, hh);
  shape.lineTo(-hw, hh - cutY);
  shape.lineTo(-hw, -hh + 0.02);
  shape.quadraticCurveTo(-hw, -hh, -hw + 0.02, -hh);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
  });
  geo.center();

  // Normalize planar UVs across bounding box so chest patches map cleanly 0..1
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const sizeX = Math.max(0.001, bb.max.x - bb.min.x);
  const sizeY = Math.max(0.001, bb.max.y - bb.min.y);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    uv.setXY(i, (px - bb.min.x) / sizeX, (py - bb.min.y) / sizeY);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Curved STANAG / AK-74 / MP5 magazine extruded in the YZ plane (then rotated to width X).
 */
function makeCurvedMagGeo(
  width: number,
  height: number,
  depth: number,
  bendZ: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const hd = depth * 0.5;
  shape.moveTo(-hd, 0);
  shape.lineTo(hd, 0);
  shape.quadraticCurveTo(hd + bendZ * 0.45, -height * 0.55, hd + bendZ, -height);
  shape.lineTo(-hd + bendZ, -height);
  shape.quadraticCurveTo(-hd + bendZ * 0.45, -height * 0.55, -hd, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.006, width - 0.004),
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.translate(0, 0, -(width - 0.004) * 0.5);
  // Map shape X -> -Z (forward along gun) and extrusion Z -> X (width)
  geo.rotateY(Math.PI / 2);
  return geo;
}

/**
 * Sculpted EOTech EXPS3 protective aluminum arch hood (hollow frame with curved top).
 */
function makeHoloHoodGeo(
  outerW: number,
  outerH: number,
  wallT: number,
  depth: number
): THREE.ExtrudeGeometry {
  const hw = outerW * 0.5;
  const hh = outerH * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh - 0.009);
  shape.quadraticCurveTo(hw, hh, hw - 0.009, hh);
  shape.lineTo(-hw + 0.009, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - 0.009);
  shape.closePath();

  const hole = new THREE.Path();
  const ihw = hw - wallT;
  const ihh = hh - wallT;
  hole.moveTo(-ihw, -ihh);
  hole.lineTo(ihw, -ihh);
  hole.lineTo(ihw, ihh - 0.006);
  hole.quadraticCurveTo(ihw, ihh, ihw - 0.006, ihh);
  hole.lineTo(-ihw + 0.006, ihh);
  hole.quadraticCurveTo(-ihw, ihh, -ihw, ihh - 0.006);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.0022,
    bevelSize: 0.0018,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.center();
  return geo;
}

/**
 * Curved Officer Police Peaked Cap Visor Brim.
 */
function makeCapVisorGeo(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.115, 0);
  shape.quadraticCurveTo(-0.125, -0.105, 0, -0.145);
  shape.quadraticCurveTo(0.125, -0.105, 0.115, 0);
  shape.quadraticCurveTo(0, -0.025, -0.115, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.009,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * Organic draped cloth brim for the Tactical Boonie Hat (vertex-displaced sinusoidal fold).
 */
function makeDrapedBoonieBrimGeo(): THREE.BufferGeometry {
  const geo = new THREE.RingGeometry(0.128, 0.245, 36, 4);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z);
    const t = Math.max(0, (r - 0.128) / (0.245 - 0.128));
    const ang = Math.atan2(z, x);
    // Natural downward droop + organic front/back wave folds
    const droop = -0.036 * t * t;
    const wave = Math.sin(ang * 3 + 0.6) * 0.015 * t + Math.cos(ang * 2) * 0.012 * t;
    pos.setY(i, droop + wave);
  }
  geo.computeVertexNormals();
  return geo;
}

function createWeaponSkinMaterials(weaponSkinId: string) {
  const tex = getWeaponTextureSet();

  if (weaponSkinId === 'gold_engraved') {
    return {
      gunMetal: new THREE.MeshPhysicalMaterial({
        map: tex.goldEngraved,
        normalMap: tex.goldNormal,
        normalScale: new THREE.Vector2(0.75, 0.75),
        color: 0xffe47a,
        metalness: 0.97,
        roughness: 0.16,
        anisotropy: 0.65,
        clearcoat: 0.8,
        clearcoatRoughness: 0.12,
      }),
      darkMetal: new THREE.MeshPhysicalMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        normalScale: new THREE.Vector2(0.55, 0.55),
        color: 0x332d22,
        metalness: 0.9,
        roughness: 0.25,
        clearcoat: 0.35,
      }),
      accentPolymer: new THREE.MeshStandardMaterial({
        map: tex.polymerStipple,
        normalMap: tex.polymerNormal,
        normalScale: new THREE.Vector2(0.8, 0.8),
        color: 0x2a2319,
        metalness: 0.22,
        roughness: 0.56,
      }),
    };
  }

  if (weaponSkinId === 'police_blue') {
    return {
      gunMetal: new THREE.MeshPhysicalMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughnessMap: tex.gunmetalRough,
        color: 0x3572cc,
        metalness: 0.86,
        roughness: 0.85,
        anisotropy: 0.45,
        clearcoat: 0.65,
        clearcoatRoughness: 0.16,
      }),
      darkMetal: new THREE.MeshPhysicalMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        normalScale: new THREE.Vector2(0.55, 0.55),
        color: 0x263246,
        metalness: 0.88,
        roughness: 0.3,
        clearcoat: 0.25,
      }),
      accentPolymer: new THREE.MeshStandardMaterial({
        map: tex.polymerStipple,
        normalMap: tex.polymerNormal,
        normalScale: new THREE.Vector2(0.8, 0.8),
        color: 0x3e6db0,
        metalness: 0.18,
        roughness: 0.62,
      }),
    };
  }

  if (weaponSkinId === 'desert_tan') {
    return {
      gunMetal: new THREE.MeshPhysicalMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: tex.gunmetalRough,
        color: 0xcab085,
        metalness: 0.42,
        roughness: 0.92,
        clearcoat: 0.15,
      }),
      darkMetal: new THREE.MeshStandardMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        color: 0x5c4f3d,
        metalness: 0.65,
        roughness: 0.38,
      }),
      accentPolymer: new THREE.MeshStandardMaterial({
        map: tex.polymerStipple,
        normalMap: tex.polymerNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        color: 0xb09872,
        metalness: 0.1,
        roughness: 0.72,
      }),
    };
  }

  if (weaponSkinId === 'tiger_camo') {
    return {
      gunMetal: new THREE.MeshPhysicalMaterial({
        map: tex.tigerCamo,
        normalMap: tex.gunmetalNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        color: 0xffffff,
        metalness: 0.48,
        roughness: 0.32,
        clearcoat: 0.45,
      }),
      darkMetal: new THREE.MeshStandardMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        color: 0x38322a,
        metalness: 0.82,
        roughness: 0.34,
      }),
      accentPolymer: new THREE.MeshStandardMaterial({
        map: tex.tigerCamo,
        normalMap: tex.polymerNormal,
        color: 0xead0a8,
        metalness: 0.16,
        roughness: 0.58,
      }),
    };
  }

  if (weaponSkinId === 'crimson_carbon') {
    return {
      gunMetal: new THREE.MeshPhysicalMaterial({
        map: tex.carbonFiber,
        normalMap: tex.carbonNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        color: 0xffffff,
        metalness: 0.62,
        roughness: 0.24,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
      }),
      darkMetal: new THREE.MeshPhysicalMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        color: 0x7a1c22,
        metalness: 0.86,
        roughness: 0.26,
        clearcoat: 0.4,
      }),
      accentPolymer: new THREE.MeshStandardMaterial({
        map: tex.polymerStipple,
        normalMap: tex.polymerNormal,
        color: 0x991f26,
        metalness: 0.22,
        roughness: 0.5,
      }),
    };
  }

  if (weaponSkinId === 'arctic_wolf') {
    return {
      gunMetal: new THREE.MeshPhysicalMaterial({
        map: tex.arcticWeapon,
        normalMap: tex.gunmetalNormal,
        normalScale: new THREE.Vector2(0.45, 0.45),
        color: 0xf4f7fb,
        metalness: 0.32,
        roughness: 0.34,
        clearcoat: 0.48,
        clearcoatRoughness: 0.22,
      }),
      darkMetal: new THREE.MeshPhysicalMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        color: 0x475569,
        metalness: 0.86,
        roughness: 0.28,
        clearcoat: 0.3,
      }),
      accentPolymer: new THREE.MeshStandardMaterial({
        map: tex.polymerStipple,
        normalMap: tex.polymerNormal,
        color: 0xdbe4ef,
        metalness: 0.12,
        roughness: 0.6,
      }),
    };
  }

  if (weaponSkinId === 'emerald_cyber') {
    return {
      gunMetal: new THREE.MeshPhysicalMaterial({
        map: tex.emeraldCarbon,
        normalMap: tex.carbonNormal,
        normalScale: new THREE.Vector2(0.75, 0.75),
        color: 0xcffae5,
        metalness: 0.78,
        roughness: 0.22,
        anisotropy: 0.55,
        clearcoat: 0.9,
        clearcoatRoughness: 0.12,
      }),
      darkMetal: new THREE.MeshPhysicalMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        color: 0x164a3a,
        metalness: 0.88,
        roughness: 0.26,
        clearcoat: 0.45,
      }),
      accentPolymer: new THREE.MeshStandardMaterial({
        map: tex.polymerStipple,
        normalMap: tex.polymerNormal,
        color: 0x10b981,
        metalness: 0.26,
        roughness: 0.46,
      }),
    };
  }

  if (weaponSkinId === 'dragon_obsidian') {
    return {
      gunMetal: new THREE.MeshPhysicalMaterial({
        map: tex.obsidianDragon,
        normalMap: tex.obsidianNormal,
        normalScale: new THREE.Vector2(0.95, 0.95),
        color: 0xffffff,
        emissive: 0x3b2205,
        emissiveIntensity: 0.32,
        metalness: 0.92,
        roughness: 0.2,
        anisotropy: 0.7,
        clearcoat: 0.95,
        clearcoatRoughness: 0.1,
      }),
      darkMetal: new THREE.MeshPhysicalMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        color: 0x261e2e,
        metalness: 0.92,
        roughness: 0.24,
        clearcoat: 0.55,
      }),
      accentPolymer: new THREE.MeshPhysicalMaterial({
        map: tex.goldEngraved,
        normalMap: tex.goldNormal,
        color: 0xf5c852,
        metalness: 0.9,
        roughness: 0.24,
        clearcoat: 0.65,
      }),
    };
  }

  // Factory Forged Anodized Gunmetal AAA PBR
  return {
    gunMetal: new THREE.MeshPhysicalMaterial({
      map: tex.gunmetal,
      normalMap: tex.gunmetalNormal,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughnessMap: tex.gunmetalRough,
      color: 0xd6dee8,
      metalness: 0.9,
      roughness: 0.85,
      anisotropy: 0.55,
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
    }),
    darkMetal: new THREE.MeshPhysicalMaterial({
      map: tex.gunmetal,
      normalMap: tex.gunmetalNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      color: 0x6c7585,
      metalness: 0.88,
      roughness: 0.32,
      anisotropy: 0.4,
    }),
    accentPolymer: new THREE.MeshStandardMaterial({
      map: tex.polymerStipple,
      normalMap: tex.polymerNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      color: 0xa69478,
      metalness: 0.1,
      roughness: 0.72,
    }),
  };
}

/* ============================================================================
 * AAA FIRST-PERSON WEAPON VIEWMODELS + ARTICULATED TACTICAL HANDS & SLEEVES
 * ============================================================================ */

export function buildWeaponViewmodel(
  weaponId: WeaponId,
  weaponSkinId = 'standard',
  uniformId = 'swat_navy'
): WeaponViewmodelHandle {
  const group = new THREE.Group();
  const tex = getWeaponTextureSet();
  const skin = createWeaponSkinMaterials(weaponSkinId);
  const uni = getUniformPalette(uniformId);

  const gunMetal = skin.gunMetal;
  const darkMetal = skin.darkMetal;
  const tanPolymer = skin.accentPolymer;

  const polymerMat = new THREE.MeshStandardMaterial({
    map: tex.polymerStipple,
    normalMap: tex.polymerNormal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    color: 0xd0d6e0,
    metalness: 0.12,
    roughness: 0.72,
  });
  const woodMat = new THREE.MeshPhysicalMaterial({
    map: tex.woodGrain,
    normalMap: tex.woodNormal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0xdca87e,
    metalness: 0.04,
    roughness: 0.58,
    clearcoat: 0.28,
    clearcoatRoughness: 0.35,
  });
  const bakeliteMat = new THREE.MeshPhysicalMaterial({
    map: tex.woodGrain,
    color: 0x993e20,
    metalness: 0.1,
    roughness: 0.42,
    clearcoat: 0.35,
  });
  const chromeSteel = new THREE.MeshPhysicalMaterial({
    color: weaponSkinId === 'gold_engraved' ? 0xf7d466 : 0xd4dde8,
    metalness: 0.96,
    roughness: 0.14,
    anisotropy: 0.7,
    clearcoat: 0.4,
  });
  const oliveMat = new THREE.MeshStandardMaterial({
    map: tex.gunmetal,
    normalMap: tex.gunmetalNormal,
    color: 0x45563b,
    metalness: 0.28,
    roughness: 0.62,
  });
  const brassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe0b052,
    metalness: 0.94,
    roughness: 0.2,
    anisotropy: 0.5,
  });
  const redShellMat = new THREE.MeshPhysicalMaterial({
    color: 0xc8232c,
    metalness: 0.12,
    roughness: 0.36,
    clearcoat: 0.4,
  });
  const opticGlass = new THREE.MeshPhysicalMaterial({
    color: 0x67d4ff,
    emissive: 0x0b3552,
    emissiveIntensity: 0.25,
    metalness: 0.12,
    roughness: 0.06,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const holoReticleMat = new THREE.MeshBasicMaterial({
    map: tex.holoReticle,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const laserGreen = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  const tritiumGlow = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
  const watchDialMat = new THREE.MeshBasicMaterial({ map: tex.watchDial });

  const sleeveMat = new THREE.MeshPhysicalMaterial({
    map: tex[uni.clothTexKey],
    normalMap: tex.fabricNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: tex.fabricRough,
    color: uni.shirtTint,
    metalness: 0.02,
    roughness: 1.0,
    sheen: 0.45,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(uni.sheenColor),
  });
  const cuffTrimMat = new THREE.MeshStandardMaterial({
    color: uni.cuffStripeColor ?? 0x334155,
    metalness: 0.25,
    roughness: 0.55,
  });
  const gloveMat = new THREE.MeshPhysicalMaterial({
    map: tex.polymerStipple,
    normalMap: tex.fabricNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    color: 0x2a2e36,
    metalness: 0.08,
    roughness: 0.78,
    sheen: 0.22,
  });
  const knuckleMat = new THREE.MeshPhysicalMaterial({
    map: tex.carbonFiber,
    normalMap: tex.carbonNormal,
    color: 0x2c323c,
    metalness: 0.48,
    roughness: 0.34,
    clearcoat: 0.55,
  });

  const addBevel = (
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    bevel = 0.0035,
    parent: THREE.Object3D = group
  ) => {
    const m = new THREE.Mesh(makeBeveledBox(w, h, d, bevel, 2), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };

  const addBox = (
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    parent: THREE.Object3D = group
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };

  const addCyl = (
    rTop: number,
    rBot: number,
    len: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = Math.PI / 2,
    rz = 0,
    segs = 18,
    parent: THREE.Object3D = group
  ) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, segs), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    parent.add(m);
    return m;
  };

  /**
   * Sculpted AAA First-Person Tactical Arms & Articulated Mechanix-Style Gloved Hands
   * with individual wrapped fingers, carbon-fiber knuckle shell, Velcro cuff, and tactical digital watch!
   */
  const addArticulatedHand = (
    side: 'left' | 'right',
    pos: [number, number, number],
    parent: THREE.Object3D = group
  ) => {
    const hg = new THREE.Group();
    hg.position.set(pos[0], pos[1], pos[2]);
    const isLeft = side === 'left';

    // Sculpted palm (beveled organic pad)
    const palm = new THREE.Mesh(makeBeveledBox(0.062, 0.052, 0.088, 0.011, 2), gloveMat);
    palm.rotation.set(isLeft ? 0.12 : -0.22, isLeft ? 0.16 : -0.06, isLeft ? 0.12 : 0);
    hg.add(palm);

    // Molded Carbon-Fiber Knuckle Guard across back of hand
    const knuck = new THREE.Mesh(makeBeveledBox(0.058, 0.016, 0.036, 0.004, 2), knuckleMat);
    knuck.position.set(isLeft ? -0.012 : 0.016, isLeft ? 0.024 : 0.012, -0.016);
    knuck.rotation.set(isLeft ? 0.12 : -0.22, isLeft ? 0.16 : 0, isLeft ? 0.2 : -0.15);
    hg.add(knuck);

    // 4 Articulated Curved Fingers gripping foregrip or pistol grip
    for (let f = 0; f < 4; f++) {
      const fz = -0.044 + f * 0.019;
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.034, 4, 8), gloveMat);
      if (isLeft) {
        finger.position.set(0.024, 0.014 - f * 0.003, fz);
        finger.rotation.set(0.2, 0.25, -0.95);
      } else {
        // Index finger (f===0) extended along trigger, lower 3 fingers wrapped around grip
        finger.position.set(-0.016, f === 0 ? 0.028 : 0.005 - f * 0.017, f === 0 ? -0.036 : -0.022);
        finger.rotation.set(f === 0 ? Math.PI / 2 : 0.25, 0, f === 0 ? 0.25 : 1.15);
      }
      hg.add(finger);
    }

    // Articulated Opposable Thumb
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.038, 4, 8), gloveMat);
    if (isLeft) {
      thumb.position.set(-0.03, 0.028, -0.012);
      thumb.rotation.set(0.75, 0.35, 0.35);
    } else {
      thumb.position.set(-0.024, 0.024, 0.01);
      thumb.rotation.set(0.45, -0.4, 0.85);
    }
    hg.add(thumb);

    // Wrist Velcro Tactical Strap
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.041, 0.042, 16), knuckleMat);
    wrist.position.set(isLeft ? -0.022 : 0.016, -0.018, 0.058);
    wrist.rotation.set(1.18, 0, isLeft ? -0.34 : 0.24);
    hg.add(wrist);

    // Tactical Smartwatch on Left Wrist facing the player!
    if (isLeft) {
      const watchCase = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.012, 16), darkMetal);
      watchCase.position.set(-0.028, 0.015, 0.056);
      watchCase.rotation.set(0.35, 0.2, 0.35);
      hg.add(watchCase);
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.0175, 16), watchDialMat);
      dial.position.set(-0.025, 0.022, 0.055);
      dial.rotation.set(-Math.PI / 2 + 0.35, 0.2, 0.35);
      hg.add(dial);
    }

    // Sculpted Ripstop Tactical Forearm Sleeve (tapered organic cylinder with cloth normal + sheen)
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.054, 0.3, 18), sleeveMat);
    forearm.position.set(isLeft ? -0.095 : 0.056, -0.088, 0.165);
    forearm.rotation.set(isLeft ? 1.14 : 1.2, 0, isLeft ? -0.4 : 0.28);
    hg.add(forearm);

    if (uni.cuffStripeColor) {
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.044, 0.015, 16), cuffTrimMat);
      cuff.position.set(isLeft ? -0.048 : 0.03, -0.044, 0.088);
      cuff.rotation.set(isLeft ? 1.14 : 1.2, 0, isLeft ? -0.4 : 0.28);
      hg.add(cuff);
    }

    parent.add(hg);
    return hg;
  };

  let muzzleZ = -0.78;
  let muzzleY = 0.018;
  let boltMesh: THREE.Object3D | undefined;
  let pumpMesh: THREE.Object3D | undefined;
  let pumpRestZ: number | undefined;
  let magMesh: THREE.Object3D | undefined;
  let magRestY: number | undefined;
  const ejectionPortLocal = new THREE.Vector3(0.045, 0.015, -0.2);

  if (weaponId === 'm4a1') {
    // Chamfered Forged Upper & Lower Receiver
    addBevel(0.052, 0.05, 0.24, gunMetal, 0, 0.014, -0.17, 0, 0, 0, 0.005);
    addBevel(0.048, 0.044, 0.2, darkMetal, 0, -0.028, -0.165, 0, 0, 0, 0.004);
    // Magwell flare
    addBevel(0.046, 0.048, 0.082, darkMetal, 0, -0.048, -0.245, 0.08, 0, 0, 0.003);
    // Trigger Guard & Curved Trigger
    addBevel(0.018, 0.006, 0.068, darkMetal, 0, -0.072, -0.145, 0.1, 0, 0, 0.0015);
    addBevel(0.006, 0.026, 0.008, chromeSteel, 0, -0.056, -0.135, 0.25, 0, 0, 0.001);
    // Forward Assist & Brass Deflector on right side
    addCyl(0.008, 0.009, 0.032, darkMetal, 0.031, 0.008, -0.095, 0.45, -0.4, 12);
    addBevel(0.014, 0.018, 0.024, gunMetal, 0.03, 0.016, -0.135, 0, 0.35, 0, 0.002);
    // Charging Handle T-Latch
    addBevel(0.048, 0.012, 0.016, darkMetal, 0, 0.034, -0.048, 0, 0, 0, 0.002);
    // Ejection Port Dust Cover + Bolt Carrier
    addBox(0.008, 0.02, 0.068, brassMat, 0.025, 0.014, -0.19);
    boltMesh = addBevel(0.01, 0.018, 0.062, chromeSteel, 0.027, 0.014, -0.19, 0, 0, 0, 0.0018);

    // Full-Length CNC Top Picatinny Rail with Crisp Slots
    addBevel(0.028, 0.012, 0.48, darkMetal, 0, 0.044, -0.32, 0, 0, 0, 0.002);
    for (let z = -0.08; z >= -0.55; z -= 0.028) {
      addBox(0.034, 0.006, 0.012, gunMetal, 0, 0.051, z);
    }

    // Free-Float Octagonal M-LOK Handguard with Side Rail Covers & Vent Slots
    addCyl(0.03, 0.031, 0.29, gunMetal, 0, 0.012, -0.445, Math.PI / 2, 0, 8);
    addBevel(0.056, 0.02, 0.22, tanPolymer, 0, 0.012, -0.445, 0, 0, 0, 0.003);
    // PEQ-15 Tactical Laser / IR Illuminator Box on right rail + green laser diode
    addBevel(0.03, 0.024, 0.095, tanPolymer, 0.038, 0.028, -0.49, 0, 0, 0, 0.003);
    addCyl(0.006, 0.006, 0.012, darkMetal, 0.044, 0.028, -0.54, Math.PI / 2, 0, 10);
    addCyl(0.004, 0.004, 0.004, laserGreen, 0.044, 0.028, -0.547, Math.PI / 2, 0, 10);

    // Lathe-Turned Fluted Barrel + Gas Block + Birdcage Flash Hider
    const barrelPts = [
      new THREE.Vector2(0.012, 0),
      new THREE.Vector2(0.012, 0.24),
      new THREE.Vector2(0.015, 0.245),
      new THREE.Vector2(0.015, 0.27),
      new THREE.Vector2(0.011, 0.275),
      new THREE.Vector2(0.011, 0.34),
      new THREE.Vector2(0.016, 0.345),
      new THREE.Vector2(0.016, 0.405),
      new THREE.Vector2(0.014, 0.415),
      new THREE.Vector2(0.009, 0.415),
    ];
    const barrelMesh = new THREE.Mesh(new THREE.LatheGeometry(barrelPts, 18), darkMetal);
    barrelMesh.rotation.x = -Math.PI / 2;
    barrelMesh.position.set(0, 0.014, -0.48);
    group.add(barrelMesh);

    // Authentic EOTech EXPS3 Holographic Sight (Sculpted Beveled Hood + Glowing 65-MOA Reticle!)
    addBevel(0.044, 0.018, 0.096, darkMetal, 0, 0.06, -0.175, 0, 0, 0, 0.003);
    // Battery compartment front hump
    addBevel(0.038, 0.024, 0.036, gunMetal, 0, 0.072, -0.205, 0, 0, 0, 0.0035);
    // Sculpted hollow protective aluminum arch hood
    const hoodMesh = new THREE.Mesh(makeHoloHoodGeo(0.05, 0.048, 0.0055, 0.064), gunMetal);
    hoodMesh.position.set(0, 0.09, -0.165);
    group.add(hoodMesh);
    // Tinted anti-reflective optic glass window
    const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.035), opticGlass);
    glassPane.position.set(0, 0.09, -0.175);
    group.add(glassPane);
    // Crisp Glowing 65-MOA EOTech Holographic Reticle (replaces orange cube!)
    const retPane = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.024), holoReticleMat);
    retPane.position.set(0, 0.09, -0.178);
    group.add(retPane);
    // Folded front iron sight post
    addBevel(0.016, 0.022, 0.024, darkMetal, 0, 0.056, -0.56, 0, 0, 0, 0.002);

    // Curved Windowed PMAG Magazine (animated during reload)
    const m4Mag = new THREE.Group();
    const m4MagMesh = new THREE.Mesh(makeCurvedMagGeo(0.028, 0.165, 0.064, -0.034), darkMetal);
    m4MagMesh.position.set(0, -0.045, -0.242);
    m4Mag.add(m4MagMesh);
    const m4Base = new THREE.Mesh(makeBeveledBox(0.033, 0.016, 0.07, 0.003), tanPolymer);
    m4Base.position.set(0, -0.21, -0.275);
    m4Base.rotation.x = 0.22;
    m4Mag.add(m4Base);
    group.add(m4Mag);
    magMesh = m4Mag;
    magRestY = 0;

    // Angled Tactical Foregrip + Stippled Ergonomic Pistol Grip + Magpul CTR Stock
    addBevel(0.03, 0.048, 0.088, tanPolymer, 0, -0.032, -0.45, 0.32, 0, 0, 0.004);
    addBevel(0.032, 0.11, 0.046, polymerMat, 0, -0.082, -0.085, -0.28, 0, 0, 0.005);
    addCyl(0.018, 0.018, 0.19, darkMetal, 0, 0.012, 0.04);
    addBevel(0.044, 0.096, 0.165, tanPolymer, 0, -0.014, 0.1, 0, 0, 0, 0.006);

    addArticulatedHand('left', [-0.022, -0.046, -0.45]);
    addArticulatedHand('right', [0.008, -0.076, -0.082]);
    muzzleZ = -0.9;
    muzzleY = 0.014;
  } else if (weaponId === 'ak74') {
    const akWood = weaponSkinId === 'standard' ? woodMat : gunMetal;
    // Chamfered Stamped AK-74M Receiver + Ribbed Dust Cover
    addBevel(0.05, 0.064, 0.28, darkMetal, 0, 0, -0.17, 0, 0, 0, 0.004);
    addCyl(0.024, 0.026, 0.25, gunMetal, 0, 0.032, -0.17, Math.PI / 2, 0, 14);
    boltMesh = addBevel(0.012, 0.016, 0.085, chromeSteel, 0.027, 0.016, -0.21, 0, 0, 0, 0.002);
    addCyl(0.005, 0.007, 0.024, chromeSteel, 0.038, 0.017, -0.24, 0, Math.PI / 2, 10);

    // Sculpted Laminated Handguard + Upper Gas Tube
    addBevel(0.052, 0.042, 0.22, akWood, 0, -0.004, -0.42, 0, 0, 0, 0.006);
    addCyl(0.018, 0.019, 0.2, akWood, 0, 0.028, -0.42);
    addCyl(0.012, 0.012, 0.24, darkMetal, 0, 0.03, -0.52);

    // Barrel + Front Sight Tower + AK-74 Slotted Muzzle Brake
    const akBarrelPts = [
      new THREE.Vector2(0.011, 0),
      new THREE.Vector2(0.011, 0.3),
      new THREE.Vector2(0.017, 0.305),
      new THREE.Vector2(0.017, 0.35),
      new THREE.Vector2(0.015, 0.355),
      new THREE.Vector2(0.017, 0.39),
      new THREE.Vector2(0.01, 0.39),
    ];
    const akBarrel = new THREE.Mesh(new THREE.LatheGeometry(akBarrelPts, 16), darkMetal);
    akBarrel.rotation.x = -Math.PI / 2;
    akBarrel.position.set(0, 0.008, -0.5);
    group.add(akBarrel);

    // Hooded Front Sight Post + Glowing Tritium Tip
    addBevel(0.016, 0.048, 0.022, darkMetal, 0, 0.036, -0.77, 0, 0, 0, 0.002);
    addBox(0.004, 0.01, 0.004, tritiumGlow, 0, 0.056, -0.77);

    // Side-Rail Tactical Reflex Sight (Kobra / OKP style with crisp reticle)
    addBevel(0.034, 0.014, 0.08, darkMetal, 0, 0.056, -0.18, 0, 0, 0, 0.0025);
    const akHood = new THREE.Mesh(makeHoloHoodGeo(0.042, 0.04, 0.0045, 0.046), gunMetal);
    akHood.position.set(0, 0.082, -0.175);
    group.add(akHood);
    const akGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.028), opticGlass);
    akGlass.position.set(0, 0.082, -0.18);
    group.add(akGlass);
    const akRet = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.02), holoReticleMat);
    akRet.position.set(0, 0.082, -0.182);
    group.add(akRet);

    // Iconic Curved Bakelite Banana Magazine
    const akMag = new THREE.Group();
    const akMagMat = weaponSkinId === 'standard' ? bakeliteMat : tanPolymer;
    const akMagMesh = new THREE.Mesh(makeCurvedMagGeo(0.029, 0.21, 0.066, -0.068), akMagMat);
    akMagMesh.position.set(0, -0.038, -0.245);
    akMag.add(akMagMesh);
    group.add(akMag);
    magMesh = akMag;
    magRestY = 0;

    addBevel(0.032, 0.105, 0.044, bakeliteMat, 0, -0.08, -0.08, -0.26, 0, 0, 0.005);
    addBevel(0.042, 0.09, 0.22, akWood, 0, -0.028, 0.06, -0.08, 0, 0, 0.006);

    addArticulatedHand('left', [-0.018, -0.044, -0.42]);
    addArticulatedHand('right', [0.008, -0.075, -0.08]);
    muzzleZ = -0.9;
    muzzleY = 0.008;
  } else if (weaponId === 'psg1') {
    // Chamfered Precision Sniper Receiver
    addBevel(0.056, 0.08, 0.34, gunMetal, 0, 0, -0.19, 0, 0, 0, 0.005);
    boltMesh = addBevel(0.013, 0.018, 0.075, chromeSteel, 0.03, 0.014, -0.22, 0, 0, 0, 0.002);
    addBevel(0.048, 0.052, 0.34, polymerMat, 0, 0.002, -0.5, 0, 0, 0, 0.006);

    // Folded Twin Bipod Legs with Rubber Feet
    for (const side of [-1, 1] as const) {
      addCyl(0.007, 0.007, 0.26, darkMetal, side * 0.034, -0.03, -0.54, Math.PI / 2, 0, 10);
      addCyl(0.011, 0.011, 0.024, polymerMat, side * 0.034, -0.03, -0.41, Math.PI / 2, 0, 10);
    }

    // Fluted Free-Float Heavy Match Barrel + Slotted Muzzle Brake
    addCyl(0.014, 0.017, 0.48, gunMetal, 0, 0.012, -0.82, Math.PI / 2, 0, 20);
    addBevel(0.034, 0.028, 0.084, darkMetal, 0, 0.012, -1.07, 0, 0, 0, 0.003);

    // Dual CNC Scope Rings + Lathe-Turned Stepped Zeiss Precision Scope
    addBevel(0.03, 0.036, 0.024, gunMetal, 0, 0.058, -0.14, 0, 0, 0, 0.0025);
    addBevel(0.03, 0.036, 0.024, gunMetal, 0, 0.058, -0.32, 0, 0, 0, 0.0025);
    const scopePts = [
      new THREE.Vector2(0.025, 0.0),
      new THREE.Vector2(0.026, 0.07),
      new THREE.Vector2(0.02, 0.095),
      new THREE.Vector2(0.02, 0.32),
      new THREE.Vector2(0.032, 0.39),
      new THREE.Vector2(0.033, 0.47),
      new THREE.Vector2(0.029, 0.47),
    ];
    const scopeMesh = new THREE.Mesh(new THREE.LatheGeometry(scopePts, 24), darkMetal);
    scopeMesh.rotation.x = -Math.PI / 2;
    scopeMesh.position.set(0, 0.092, -0.02);
    group.add(scopeMesh);
    // Knurled Elevation & Windage Turrets
    addCyl(0.011, 0.011, 0.026, brassMat, 0, 0.12, -0.23, 0, 0, 14);
    addCyl(0.01, 0.01, 0.026, brassMat, 0.026, 0.092, -0.23, 0, Math.PI / 2, 14);
    // Multi-coated blue sapphire objective & ocular lenses
    addCyl(0.028, 0.028, 0.004, opticGlass, 0, 0.092, -0.488);
    addCyl(0.022, 0.022, 0.004, opticGlass, 0, 0.092, -0.022);

    magMesh = addBevel(0.03, 0.11, 0.072, darkMetal, 0, -0.078, -0.26, 0, 0, 0, 0.003);
    magRestY = -0.078;
    addBevel(0.036, 0.115, 0.048, woodMat, 0, -0.08, -0.06, -0.22, 0, 0, 0.006);
    addBevel(0.052, 0.014, 0.064, polymerMat, 0, -0.135, -0.05, 0, 0, 0, 0.003);
    addBevel(0.048, 0.105, 0.24, polymerMat, 0, -0.012, 0.08, 0, 0, 0, 0.006);
    addBevel(0.044, 0.028, 0.115, tanPolymer, 0, 0.044, 0.08, 0, 0, 0, 0.005);

    addArticulatedHand('left', [-0.02, -0.046, -0.48]);
    addArticulatedHand('right', [0.008, -0.076, -0.06]);
    muzzleZ = -1.12;
    muzzleY = 0.012;
  } else if (weaponId === 'm870') {
    // Chamfered Steel M870 Tactical Receiver
    addBevel(0.06, 0.082, 0.3, gunMetal, 0, 0, -0.18, 0, 0, 0, 0.006);
    addBevel(0.04, 0.012, 0.24, darkMetal, 0, 0.046, -0.19, 0, 0, 0, 0.002);
    addBox(0.012, 0.026, 0.088, darkMetal, 0.03, 0.01, -0.2);
    boltMesh = addBevel(0.013, 0.023, 0.082, chromeSteel, 0.032, 0.01, -0.2, 0, 0, 0, 0.002);

    // Side-Saddle 5-Round 12-Gauge Shell Carrier (Red Shells + Gleaming Brass Heads)
    addBevel(0.014, 0.048, 0.155, polymerMat, -0.036, -0.004, -0.19, 0, 0, 0, 0.0025);
    for (let i = 0; i < 5; i++) {
      const sz = -0.132 - i * 0.028;
      addCyl(0.01, 0.01, 0.048, redShellMat, -0.045, 0.004, sz, 0, 0, 12);
      addCyl(0.0106, 0.0106, 0.014, brassMat, -0.045, -0.022, sz, 0, 0, 12);
    }

    // Heavy Barrel + Perforated Heat Shield + Under-Barrel Mag Tube + Breacher Choke
    addCyl(0.016, 0.017, 0.62, gunMetal, 0, 0.024, -0.62, Math.PI / 2, 0, 18);
    addCyl(0.021, 0.021, 0.34, darkMetal, 0, 0.026, -0.5, Math.PI / 2, 0, 14);
    addCyl(0.015, 0.015, 0.56, darkMetal, 0, -0.014, -0.59, Math.PI / 2, 0, 16);
    addBevel(0.038, 0.062, 0.024, darkMetal, 0, 0.005, -0.82, 0, 0, 0, 0.003);
    addCyl(0.021, 0.018, 0.06, darkMetal, 0, 0.024, -0.945, Math.PI / 2, 0, 16);

    // Glowing Tritium Ghost-Ring Rear & Front Blade Sights
    const ghostRing = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 18), darkMetal);
    ghostRing.position.set(0, 0.068, -0.1);
    group.add(ghostRing);
    addBox(0.005, 0.005, 0.005, tritiumGlow, -0.014, 0.068, -0.1);
    addBox(0.005, 0.005, 0.005, tritiumGlow, 0.014, 0.068, -0.1);
    addBevel(0.012, 0.032, 0.018, darkMetal, 0, 0.05, -0.89, 0, 0, 0, 0.002);
    addBox(0.005, 0.009, 0.005, tritiumGlow, 0, 0.065, -0.89);

    // Sculpted Ribbed Pump-Action Forend + Articulated Left Hand
    const pumpGroup = new THREE.Group();
    pumpGroup.position.set(0, -0.016, -0.52);
    const pumpBody = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.028, 0.24, 18), polymerMat);
    pumpBody.rotation.x = Math.PI / 2;
    pumpGroup.add(pumpBody);
    for (let rz = -0.088; rz <= 0.088; rz += 0.026) {
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.009, 18), tanPolymer);
      rib.rotation.x = Math.PI / 2;
      rib.position.z = rz;
      pumpGroup.add(rib);
    }
    addArticulatedHand('left', [-0.02, -0.032, 0.01], pumpGroup);
    group.add(pumpGroup);
    pumpMesh = pumpGroup;
    pumpRestZ = -0.52;

    addBevel(0.036, 0.115, 0.052, polymerMat, 0, -0.082, -0.06, -0.28, 0, 0, 0.006);
    addBevel(0.046, 0.092, 0.22, polymerMat, 0, -0.026, 0.07, -0.08, 0, 0, 0.006);
    addArticulatedHand('right', [0.008, -0.076, -0.06]);

    ejectionPortLocal.set(0.048, 0.012, -0.2);
    muzzleZ = -0.98;
    muzzleY = 0.024;
  } else if (weaponId === 'mp5') {
    // Contoured H&K MP5-N Stamped Receiver + Iconic Cocking Tube
    addBevel(0.048, 0.066, 0.25, gunMetal, 0, 0, -0.18, 0, 0, 0, 0.005);
    addCyl(0.014, 0.014, 0.23, darkMetal, 0, 0.035, -0.34);
    // Charging Handle on left side
    addCyl(0.005, 0.006, 0.032, polymerMat, -0.022, 0.038, -0.4, 0, Math.PI / 2.2, 10);
    boltMesh = addBevel(0.011, 0.015, 0.05, chromeSteel, 0.025, 0.014, -0.2, 0, 0, 0, 0.002);

    // Contoured Polymer Forearm Handguard + Tactical Surefire Flashlight
    addBevel(0.046, 0.054, 0.175, polymerMat, 0, -0.004, -0.38, 0, 0, 0, 0.007);
    addCyl(0.014, 0.014, 0.095, darkMetal, 0, -0.029, -0.45);
    addCyl(0.012, 0.012, 0.005, opticGlass, 0, -0.029, -0.498);

    // Lathe-Turned Ribbed Tactical Suppressor
    const supPts = [
      new THREE.Vector2(0.019, 0),
      new THREE.Vector2(0.022, 0.02),
      new THREE.Vector2(0.022, 0.24),
      new THREE.Vector2(0.02, 0.26),
      new THREE.Vector2(0.012, 0.26),
    ];
    const supMesh = new THREE.Mesh(new THREE.LatheGeometry(supPts, 20), polymerMat);
    supMesh.rotation.x = -Math.PI / 2;
    supMesh.position.set(0, 0.012, -0.46);
    group.add(supMesh);

    // Aimpoint Micro T2 Tubular Red-Dot Sight with Crisp Glowing Reticle
    addBevel(0.03, 0.02, 0.054, gunMetal, 0, 0.046, -0.18, 0, 0, 0, 0.0025);
    const t2Tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.072, 20, 1, true),
      darkMetal
    );
    t2Tube.rotation.x = Math.PI / 2;
    t2Tube.position.set(0, 0.074, -0.18);
    group.add(t2Tube);
    const t2Ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, 8, 20), gunMetal);
    t2Ring.position.set(0, 0.074, -0.145);
    group.add(t2Ring);
    const t2Glass = new THREE.Mesh(new THREE.CircleGeometry(0.0175, 18), opticGlass);
    t2Glass.position.set(0, 0.074, -0.16);
    group.add(t2Glass);
    const t2Ret = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.018), holoReticleMat);
    t2Ret.position.set(0, 0.074, -0.162);
    group.add(t2Ret);

    // Curved 9mm MP5 Magazine
    const mp5Mag = new THREE.Group();
    const mp5MagMesh = new THREE.Mesh(makeCurvedMagGeo(0.022, 0.175, 0.04, -0.045), gunMetal);
    mp5MagMesh.position.set(0, -0.036, -0.255);
    mp5Mag.add(mp5MagMesh);
    group.add(mp5Mag);
    magMesh = mp5Mag;
    magRestY = 0;

    addBevel(0.032, 0.095, 0.044, polymerMat, 0, -0.072, -0.08, -0.22, 0, 0, 0.005);
    addCyl(0.0065, 0.0065, 0.19, chromeSteel, -0.024, 0.008, 0.04);
    addCyl(0.0065, 0.0065, 0.19, chromeSteel, 0.024, 0.008, 0.04);

    addArticulatedHand('left', [-0.018, -0.044, -0.37]);
    addArticulatedHand('right', [0.008, -0.072, -0.08]);
    muzzleZ = -0.73;
    muzzleY = 0.012;
  } else if (weaponId === 'scar') {
    // FN SCAR-H 7.62mm Monolithic CNC Upper Receiver (FDE Tan default or custom weapon skin!)
    const scarUpperMat =
      weaponSkinId === 'standard'
        ? new THREE.MeshPhysicalMaterial({
            map: tex.gunmetal,
            normalMap: tex.gunmetalNormal,
            normalScale: new THREE.Vector2(0.5, 0.5),
            color: 0xc9af82,
            metalness: 0.48,
            roughness: 0.4,
            clearcoat: 0.22,
          })
        : gunMetal;
    const scarLowerMat = weaponSkinId === 'standard' ? tanPolymer : darkMetal;

    // Monolithic extruded CNC upper + vented gas-block forend
    addBevel(0.056, 0.054, 0.46, scarUpperMat, 0, 0.022, -0.29, 0, 0, 0, 0.005);
    addBevel(0.048, 0.042, 0.23, scarLowerMat, 0, -0.02, -0.17, 0, 0, 0, 0.004);
    // Continuous top Picatinny rail teeth
    for (let rz = -0.08; rz >= -0.5; rz -= 0.018) {
      addBox(0.024, 0.009, 0.009, darkMetal, 0, 0.053, rz);
    }
    // Side ventilated cooling slots + rail strips
    for (const side of [-1, 1] as const) {
      addBevel(0.007, 0.015, 0.18, darkMetal, side * 0.031, 0.012, -0.4, 0, 0, 0, 0.002);
    }
    // Reciprocating steel charging handle + bolt carrier
    boltMesh = addBevel(0.012, 0.018, 0.06, chromeSteel, 0.028, 0.022, -0.2, 0, 0, 0, 0.002);
    addCyl(0.005, 0.006, 0.034, darkMetal, -0.036, 0.026, -0.34, 0, Math.PI / 2, 10);

    // Heavy 7.62mm Free-Float Barrel + Folding Front Sight + Dual-Chamber PWS Muzzle Brake
    addCyl(0.013, 0.015, 0.24, darkMetal, 0, 0.018, -0.62);
    addBevel(0.016, 0.032, 0.022, darkMetal, 0, 0.052, -0.52, 0, 0, 0, 0.002);
    addBevel(0.03, 0.026, 0.068, darkMetal, 0, 0.018, -0.75, 0, 0, 0, 0.003);

    // Crisp EOTech EXPS3 Holographic Sight aligned at Y = 0.094
    addBevel(0.046, 0.02, 0.078, darkMetal, 0, 0.062, -0.19, 0, 0, 0, 0.003);
    const scarHood = new THREE.Mesh(makeHoloHoodGeo(0.05, 0.046, 0.0055, 0.056), darkMetal);
    scarHood.position.set(0, 0.094, -0.19);
    group.add(scarHood);
    const scarGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.034), opticGlass);
    scarGlass.position.set(0, 0.094, -0.19);
    group.add(scarGlass);
    const scarRet = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.026), holoReticleMat);
    scarRet.position.set(0, 0.094, -0.192);
    group.add(scarRet);

    // Straight 20-Round 7.62mm Steel Box Magazine
    const scarMag = new THREE.Group();
    const smBody = addBevel(0.032, 0.145, 0.072, scarUpperMat, 0, -0.095, -0.24, 0.06, 0, 0, 0.004);
    scarMag.add(smBody);
    const smFloor = addBevel(0.036, 0.014, 0.076, polymerMat, 0, -0.168, -0.236, 0.06, 0, 0, 0.003);
    scarMag.add(smFloor);
    group.add(scarMag);
    magMesh = scarMag;
    magRestY = 0;

    // Angled Foregrip + Ergonomic Pistol Grip + Iconic SCAR Folding Cheek-Rest Stock
    addBevel(0.03, 0.032, 0.1, polymerMat, 0, -0.015, -0.43, 0.12, 0, 0, 0.005);
    addBevel(0.034, 0.105, 0.048, polymerMat, 0, -0.08, -0.08, -0.25, 0, 0, 0.006);
    addBevel(0.044, 0.082, 0.17, scarUpperMat, 0, 0.005, 0.05, 0, 0, 0, 0.006);
    addBevel(0.046, 0.022, 0.11, polymerMat, 0, 0.048, 0.04, 0, 0, 0, 0.005);

    addArticulatedHand('left', [-0.02, -0.034, -0.43]);
    addArticulatedHand('right', [0.008, -0.08, -0.08]);
    ejectionPortLocal.set(0.036, 0.026, -0.2);
    muzzleZ = -0.82;
    muzzleY = 0.018;
  } else if (weaponId === 'awp') {
    // ACCURACY INTERNATIONAL AWM .338 LAPUA MAGNUM BOLT-ACTION SNIPER
    const awmChassisMat =
      weaponSkinId === 'standard'
        ? new THREE.MeshPhysicalMaterial({
            map: tex.polymerStipple,
            normalMap: tex.polymerNormal,
            normalScale: new THREE.Vector2(0.85, 0.85),
            color: 0x45583d,
            metalness: 0.08,
            roughness: 0.68,
          })
        : gunMetal;

    // Signature Thumbhole Tactical Polymer Chassis + Aluminum Bedding Block
    addBevel(0.056, 0.072, 0.56, awmChassisMat, 0, -0.008, -0.28, 0, 0, 0, 0.007);
    addBevel(0.05, 0.046, 0.28, darkMetal, 0, 0.03, -0.2, 0, 0, 0, 0.005);
    // Thumbhole Buttstock + Adjustable Cheek Riser
    addBevel(0.046, 0.095, 0.22, awmChassisMat, 0, -0.015, 0.09, 0, 0, 0, 0.007);
    addBevel(0.042, 0.022, 0.12, polymerMat, 0, 0.042, 0.08, 0, 0, 0, 0.004);
    addBevel(0.034, 0.095, 0.048, awmChassisMat, 0, -0.078, -0.07, -0.22, 0, 0, 0.006);

    // Iconic Bolt-Action Steel Receiver Bolt + Swept Handle & Oversized Knurled Bolt Knob!
    const boltGrp = new THREE.Group();
    boltGrp.position.set(0, 0.032, -0.2);
    const boltBody = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 14), chromeSteel);
    boltBody.rotation.x = Math.PI / 2;
    boltGrp.add(boltBody);
    const boltStem = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.058, 10), chromeSteel);
    boltStem.rotation.z = -Math.PI / 2.6;
    boltStem.position.set(0.032, -0.008, 0.035);
    boltGrp.add(boltStem);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 12), polymerMat);
    boltKnob.position.set(0.058, -0.018, 0.04);
    boltGrp.add(boltKnob);
    group.add(boltGrp);
    boltMesh = boltGrp;

    // Long Heavy Free-Floating Fluted .338 Barrel + Colossal 3-Chamber Muzzle Brake
    addCyl(0.016, 0.02, 0.56, darkMetal, 0, 0.03, -0.78);
    addBevel(0.038, 0.03, 0.092, darkMetal, 0, 0.03, -1.07, 0, 0, 0, 0.003);
    for (const bz of [-1.045, -1.07, -1.095]) {
      addBox(0.042, 0.014, 0.012, polymerMat, 0, 0.03, bz);
    }

    // Folded Twin Tactical Bipod Legs underneath Forend
    for (const side of [-1, 1] as const) {
      addCyl(0.007, 0.008, 0.22, darkMetal, side * 0.034, -0.034, -0.48);
      addCyl(0.011, 0.011, 0.022, polymerMat, side * 0.034, -0.034, -0.37);
    }

    // Schmidt & Bender 5-25x56 High-Power Sniper Scope with Dual Mount Rings & Turrets
    addCyl(0.022, 0.022, 0.36, darkMetal, 0, 0.098, -0.25);
    addCyl(0.035, 0.023, 0.11, gunMetal, 0, 0.098, -0.47);
    addCyl(0.027, 0.023, 0.085, polymerMat, 0, 0.098, -0.05);
    // Turret dials (Elevation & Windage)
    addCyl(0.014, 0.014, 0.024, darkMetal, 0, 0.125, -0.24, Math.PI / 2, 0, 14);
    addCyl(0.012, 0.012, 0.024, darkMetal, 0.028, 0.098, -0.24, 0, Math.PI / 2, 14);
    for (const rz of [-0.15, -0.34]) {
      addBevel(0.032, 0.042, 0.024, gunMetal, 0, 0.068, rz, 0, 0, 0, 0.003);
    }
    const awmLens = new THREE.Mesh(
      new THREE.CircleGeometry(0.024, 20),
      new THREE.MeshPhysicalMaterial({
        color: 0x0b3b2e,
        emissive: 0x05281e,
        emissiveIntensity: 0.4,
        metalness: 0.9,
        roughness: 0.06,
        clearcoat: 1.0,
      })
    );
    awmLens.position.set(0, 0.098, -0.006);
    group.add(awmLens);

    // Detachable 5-Round .338 Box Magazine
    magMesh = addBevel(0.032, 0.1, 0.088, darkMetal, 0, -0.075, -0.26, 0, 0, 0, 0.004);
    magRestY = -0.075;

    addArticulatedHand('left', [-0.022, -0.045, -0.44]);
    addArticulatedHand('right', [0.01, -0.078, -0.07]);
    ejectionPortLocal.set(0.04, 0.034, -0.2);
    muzzleZ = -1.14;
    muzzleY = 0.03;
  } else if (weaponId === 'p90') {
    // FN P90 5.7x28mm FUTURISTIC BULLPUP PDW WITH TRANSLUCENT 50-ROUND TOP MAGAZINE!
    // Contoured Polymer Bullpup Main Body + Integrated Thumbhole Frame
    addBevel(0.056, 0.115, 0.36, gunMetal, 0, -0.015, -0.14, 0, 0, 0, 0.009);
    addBevel(0.052, 0.078, 0.18, polymerMat, 0, -0.038, -0.38, 0, 0, 0, 0.008);
    // Angled Front Grip Shroud & Integrated Trigger Guard
    addBevel(0.042, 0.095, 0.05, polymerMat, 0, -0.068, -0.34, -0.22, 0, 0, 0.006);
    addBevel(0.038, 0.095, 0.046, polymerMat, 0, -0.075, -0.16, -0.28, 0, 0, 0.006);
    // Compact Ported Bullpup Flash Hider protruding from front shroud
    addCyl(0.013, 0.015, 0.095, darkMetal, 0, 0.004, -0.49);
    addBevel(0.022, 0.024, 0.032, darkMetal, 0, 0.004, -0.535, 0, 0, 0, 0.003);

    // ICONIC TOP HORIZONTAL TRANSLUCENT 50-ROUND MAGAZINE WITH VISIBLE BRASS CARTRIDGES!
    const p90Mag = new THREE.Group();
    const smokedMagMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b352c,
      roughness: 0.16,
      metalness: 0.1,
      transparent: true,
      opacity: 0.56,
      clearcoat: 0.85,
    });
    const magShell = new THREE.Mesh(makeBeveledBox(0.048, 0.03, 0.27, 0.004), smokedMagMat);
    magShell.position.set(0, 0.054, -0.2);
    p90Mag.add(magShell);
    // Visible gleaming brass 5.7mm rounds stacked inside the translucent magazine!
    for (let rz = -0.09; rz >= -0.31; rz -= 0.017) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.036, 8), brassMat);
      round.rotation.z = Math.PI / 2;
      round.position.set(0, 0.054, rz);
      p90Mag.add(round);
    }
    group.add(p90Mag);
    magMesh = p90Mag;
    magRestY = 0;

    // Elevated P90 Reflex Optic Bridge + Crisp Glowing Holo Sight aligned at Y = 0.088
    addBevel(0.042, 0.044, 0.095, darkMetal, 0, 0.048, -0.39, 0, 0, 0, 0.005);
    const p90Hood = new THREE.Mesh(makeHoloHoodGeo(0.044, 0.04, 0.005, 0.05), darkMetal);
    p90Hood.position.set(0, 0.088, -0.37);
    group.add(p90Hood);
    const p90Glass = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.028), opticGlass);
    p90Glass.position.set(0, 0.088, -0.37);
    group.add(p90Glass);
    const p90Ret = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.022), holoReticleMat);
    p90Ret.position.set(0, 0.088, -0.372);
    group.add(p90Ret);

    // Side Ambidextrous Charging Knobs
    boltMesh = addBevel(0.064, 0.014, 0.022, chromeSteel, 0, 0.02, -0.38, 0, 0, 0, 0.002);

    addArticulatedHand('left', [-0.02, -0.058, -0.35]);
    addArticulatedHand('right', [0.008, -0.072, -0.15]);
    ejectionPortLocal.set(0.0, -0.07, -0.1);
    muzzleZ = -0.57;
    muzzleY = 0.004;
  } else if (weaponId === 'deagle') {
    const slideMat = weaponSkinId === 'standard' ? chromeSteel : gunMetal;
    // Beveled Heavy Machined .50 AE Slide & Iconic Fixed Barrel Profile
    boltMesh = addBevel(0.042, 0.044, 0.23, slideMat, 0, 0.024, -0.25, 0, 0, 0, 0.005);
    addBevel(0.036, 0.028, 0.21, darkMetal, 0, -0.01, -0.23, 0, 0, 0, 0.004);
    addBevel(0.038, 0.01, 0.15, darkMetal, 0, 0.049, -0.27, 0, 0, 0, 0.002);
    // Slide rear serrations
    for (let sz = -0.145; sz >= -0.195; sz -= 0.01) {
      addBox(0.044, 0.028, 0.003, darkMetal, 0, 0.024, sz);
    }
    // Exposed Hammer
    addBevel(0.01, 0.018, 0.016, chromeSteel, 0, 0.026, -0.125, -0.45, 0, 0, 0.002);
    // 3-Dot Glowing Tritium Iron Sights
    addBevel(0.007, 0.014, 0.014, darkMetal, 0, 0.056, -0.355, 0, 0, 0, 0.0015);
    addBox(0.004, 0.004, 0.004, tritiumGlow, 0, 0.06, -0.35);
    addBox(0.005, 0.01, 0.009, tritiumGlow, -0.012, 0.054, -0.135);
    addBox(0.005, 0.01, 0.009, tritiumGlow, 0.012, 0.054, -0.135);
    // Ergonomic Rubberized Grip + Flared Mag Base
    addBevel(0.036, 0.118, 0.054, polymerMat, 0, -0.075, -0.15, -0.22, 0, 0, 0.006);
    magMesh = addBevel(0.038, 0.02, 0.056, chromeSteel, 0, -0.136, -0.135, -0.22, 0, 0, 0.003);
    magRestY = -0.136;

    addArticulatedHand('left', [-0.024, -0.084, -0.165]);
    addArticulatedHand('right', [0.012, -0.076, -0.14]);
    ejectionPortLocal.set(0.035, 0.03, -0.24);
    muzzleZ = -0.4;
    muzzleY = 0.024;
  } else if (weaponId === 'knife') {
    // Sculpted Tactical Tanto Combat Knife with Fuller Groove & Ribbed G10 Handle
    addBevel(0.024, 0.03, 0.13, polymerMat, 0, -0.02, -0.14, -0.35, 0, 0, 0.005);
    for (let i = 0; i < 5; i++) {
      addBevel(0.028, 0.033, 0.011, tanPolymer, 0, -0.005 - i * 0.007, -0.1 - i * 0.02, -0.35, 0, 0, 0.002);
    }
    addBevel(0.064, 0.016, 0.022, darkMetal, 0, 0.014, -0.205, -0.35, 0, 0, 0.003);
    // Tapered Tanto Blade
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, -0.018);
    bladeShape.lineTo(0.18, -0.016);
    bladeShape.lineTo(0.24, 0.008);
    bladeShape.lineTo(0.21, 0.02);
    bladeShape.lineTo(0, 0.02);
    bladeShape.closePath();
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.004,
      bevelEnabled: true,
      bevelThickness: 0.0022,
      bevelSize: 0.0018,
      bevelSegments: 2,
    });
    bladeGeo.rotateY(Math.PI / 2);
    const blade = new THREE.Mesh(bladeGeo, weaponSkinId === 'standard' ? chromeSteel : gunMetal);
    blade.position.set(-0.002, 0.022, -0.21);
    blade.rotation.x = -0.35;
    group.add(blade);

    addArticulatedHand('right', [0.008, -0.038, -0.13]);
    muzzleZ = -0.45;
  } else {
    // M67 Fragmentation Grenade with Spoon Lever & Safety Pin Ring
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.052, 22, 18), oliveMat);
    body.position.set(0, -0.02, -0.24);
    group.add(body);
    addCyl(0.053, 0.053, 0.012, brassMat, 0, -0.02, -0.24, 0, 0, 20);
    addBevel(0.024, 0.036, 0.024, gunMetal, 0, 0.04, -0.24, 0, 0, 0, 0.003);
    addBevel(0.014, 0.084, 0.011, brassMat, 0.038, 0.008, -0.24, 0, 0, -0.32, 0.002);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.003, 10, 20), chromeSteel);
    ring.position.set(-0.024, 0.044, -0.24);
    group.add(ring);
    addArticulatedHand('right', [0.012, -0.06, -0.21]);
  }

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd578,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
  });
  const muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.072, 0), flashMat);
  muzzleFlash.position.set(0, muzzleY, muzzleZ);
  muzzleFlash.scale.set(1.15, 1.15, 2.5);
  muzzleFlash.visible = false;
  group.add(muzzleFlash);

  const muzzleLight = new THREE.PointLight(0xffb44c, 0, 6.5);
  muzzleLight.position.set(0, muzzleY, muzzleZ - 0.12);
  group.add(muzzleLight);

  return {
    group,
    muzzleFlash,
    muzzleLight,
    boltMesh,
    pumpMesh,
    pumpRestZ,
    magMesh,
    magRestY,
    ejectionPortLocal,
  };
}

/* ============================================================================
 * AAA 3D OPERATOR CHARACTER MODEL (Sculpted Anatomy, Ripstop Cloth, Shooter's-Cut
 * Plate Carrier, Realistic Face, High-Def Headgear & Detailed 3rd-Person Firearms)
 * ============================================================================ */

export interface OperatorModelHandle {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  upperBody: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
  weaponMount: THREE.Group;
  muzzleFlash: THREE.Mesh;
  hitMeshes: THREE.Mesh[];
  labelSprite: THREE.Sprite;
  setWeaponVisual: (weaponId: WeaponId) => void;
  triggerMuzzleFlash: () => void;
  updateMuzzleFlash: (dt: number) => void;
  dispose: () => void;
}

/**
 * Vertex-sculpted anatomical human cranium (local +X faces forward when rotated +PI/2 around Y).
 * Shapes masculine brow ridge, recessed orbital eye sockets, zygomatic cheekbones,
 * strong jaw corner, and tapered athletic chin while keeping clean UV alignment for 512px face maps.
 */
function makeSculptedHeadGeo(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.128, 32, 26);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i); // +X = front of face
    let y = pos.getY(i); // +Y = top of skull
    let z = pos.getZ(i); // ±Z = left/right width

    // Base athletic head proportions
    z *= 0.90;
    y *= 1.13;
    x *= 0.98;

    const absZ = Math.abs(z);

    // Subtle cranial occipital fullness at back of skull
    if (x < -0.02 && y > -0.02) {
      x -= 0.006 * Math.exp(-Math.pow((y - 0.025) / 0.07, 2));
    }

    // Defined brow ridge above eye sockets
    if (x > 0.05) {
      const browW = Math.exp(-Math.pow((y - 0.038) / 0.018, 2)) * Math.exp(-Math.pow(absZ / 0.075, 2));
      x += 0.0085 * browW;
    }

    // Recessed orbital eye sockets for true 3D eye depth
    if (x > 0.06) {
      const eyeY = Math.exp(-Math.pow((y - 0.011) / 0.017, 2));
      const eyeZ = Math.exp(-Math.pow((absZ - 0.043) / 0.021, 2));
      x -= 0.0095 * eyeY * eyeZ;
    }

    // Zygomatic cheekbones
    if (x > 0.02) {
      const cheekY = Math.exp(-Math.pow((y + 0.012) / 0.022, 2));
      const cheekZ = Math.exp(-Math.pow((absZ - 0.076) / 0.024, 2));
      x += 0.0065 * cheekY * cheekZ;
      z += Math.sign(z) * 0.0045 * cheekY * cheekZ;
    }

    // Athletic tapered lower jaw, defined masseter angle & chin projection
    if (y < -0.015) {
      const jawT = Math.min(1, (-0.015 - y) / 0.125);
      // Slight taper toward chin while preserving strong jaw corners near cheeks
      const chinTaper = x > 0 ? 1 - jawT * 0.24 : 1 - jawT * 0.12;
      z *= chinTaper;
      if (x > 0.02) {
        // Subtle chin prominence at center bottom
        const chinW = Math.exp(-Math.pow((y + 0.105) / 0.028, 2)) * Math.exp(-Math.pow(absZ / 0.042, 2));
        x += 0.009 * chinW;
        // Slight hollow beneath lower lip
        const subLip = Math.exp(-Math.pow((y + 0.078) / 0.014, 2)) * Math.exp(-Math.pow(absZ / 0.032, 2));
        x -= 0.004 * subLip;
      }
      // Subtle jaw corner definition
      if (x > -0.02 && x < 0.055) {
        const cornerW = Math.exp(-Math.pow((y + 0.062) / 0.026, 2)) * Math.exp(-Math.pow((absZ - 0.072) / 0.02, 2));
        z += Math.sign(z) * 0.006 * cornerW;
      }
    }

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createNameplateSprite(
  name: string,
  team: TeamId,
  isAlly: boolean,
  rankShort?: string
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 60;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 320, 60);

  ctx.fillStyle = isAlly ? 'rgba(10, 16, 28, 0.84)' : 'rgba(28, 12, 14, 0.78)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 300, 40, 6);
  ctx.fill();

  ctx.strokeStyle = team === 'red' ? '#ef4444' : '#3b82f6';
  ctx.lineWidth = 3;
  ctx.stroke();

  const label = rankShort ? `[${rankShort}] ${name.slice(0, 14)}` : name.slice(0, 16);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 160, 30);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.65, 0.33, 1);
  sprite.position.set(0, 2.26, 0);
  return sprite;
}

export function buildOperatorModel(
  playerId: string,
  name: string,
  team: TeamId,
  isAlly: boolean,
  loadout: CharacterLoadout = DEFAULT_LOADOUT,
  rankShort?: string,
  showNameplate = true
): OperatorModelHandle {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const hitMeshes: THREE.Mesh[] = [];
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const tex = getWeaponTextureSet();

  const trackGeo = <T extends THREE.BufferGeometry>(g: T) => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T) => {
    disposableMats.push(m);
    return m;
  };

  // Grounded Soft Radial Contact Shadow directly under boots
  const shadowDisc = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(1.05, 1.05)),
    trackMat(
      new THREE.MeshBasicMaterial({
        map: tex.contactShadow,
        transparent: true,
        depthWrite: false,
      })
    )
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.015;
  root.add(shadowDisc);

  const uni = getUniformPalette(loadout.uniformId);
  const accentColor = team === 'red' ? 0xef4444 : 0x3b82f6;

  // Authentic Ripstop/Twill Tactical Cloth PBR Materials with Normal Maps + Cloth Sheen!
  const shirtMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex[uni.clothTexKey],
      normalMap: tex.fabricNormal,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughnessMap: tex.fabricRough,
      color: uni.shirtTint,
      roughness: 1.0,
      metalness: 0.03,
      sheen: 0.5,
      sheenRoughness: 0.72,
      sheenColor: new THREE.Color(uni.sheenColor),
    })
  );
  const pantsMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex[uni.pantsTexKey],
      normalMap: tex.fabricNormal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: tex.fabricRough,
      color: uni.pantsTint,
      roughness: 1.0,
      metalness: 0.03,
      sheen: 0.42,
      sheenRoughness: 0.76,
      sheenColor: new THREE.Color(uni.sheenColor),
    })
  );
  const pouchMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex.blackRipstop,
      normalMap: tex.molleNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      color: 0x262c36,
      roughness: 0.78,
      metalness: 0.1,
      sheen: 0.25,
    })
  );
  const leatherMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x16191f,
      normalMap: tex.polymerNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.36,
      metalness: 0.18,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
    })
  );
  const silverMetal = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xd8e0ea,
      roughness: 0.16,
      metalness: 0.94,
      anisotropy: 0.6,
    })
  );
  const goldMetal = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xf6c343,
      roughness: 0.18,
      metalness: 0.95,
      anisotropy: 0.55,
      clearcoat: 0.4,
    })
  );
  const teamBandMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.38,
      roughness: 0.38,
      metalness: 0.22,
    })
  );
  const bootMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x14171d,
      normalMap: tex.polymerNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.42,
      metalness: 0.14,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
    })
  );
  const rubberSoleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f1116,
      roughness: 0.9,
      metalness: 0.04,
    })
  );
  const skinMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xd4a280,
      normalMap: tex.skinNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.62,
      metalness: 0.02,
      sheen: 0.22,
      sheenRoughness: 0.65,
      sheenColor: new THREE.Color(0xefbda0),
    })
  );
  const faceMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex.humanFace,
      normalMap: tex.skinNormal,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.6,
      metalness: 0.02,
      sheen: 0.2,
      sheenRoughness: 0.65,
      sheenColor: new THREE.Color(0xefc0a3),
    })
  );
  const faceWarpaintMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex.faceWarpaint,
      normalMap: tex.skinNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.72,
      metalness: 0.02,
      sheen: 0.14,
      sheenColor: new THREE.Color(0xb6a38a),
    })
  );
  const hairMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1a1614,
      normalMap: tex.fabricNormal,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughness: 0.76,
      metalness: 0.05,
      sheen: 0.32,
      sheenColor: new THREE.Color(0x4b423c),
    })
  );
  const patchMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex.tacticalPatchTex,
      normalMap: tex.fabricNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.78,
      metalness: 0.08,
      sheen: 0.25,
    })
  );
  const balaclavaMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex.balaclavaTex,
      normalMap: tex.fabricNormal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.88,
      metalness: 0.03,
      sheen: 0.35,
    })
  );
  const skullMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex.skullMask,
      normalMap: tex.fabricNormal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.86,
      metalness: 0.03,
      sheen: 0.3,
    })
  );
  const maskNeckMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: tex.blackRipstop,
      normalMap: tex.fabricNormal,
      color: 0x20242c,
      roughness: 0.88,
    })
  );
  const gloveMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex.polymerStipple,
      normalMap: tex.polymerNormal,
      color: 0x262a32,
      roughness: 0.76,
      metalness: 0.12,
    })
  );
  const carbonKnuckleMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex.carbonFiber,
      color: 0x2d333d,
      roughness: 0.32,
      metalness: 0.45,
      clearcoat: 0.5,
    })
  );
  const skinWeaponMats = createWeaponSkinMaterials(loadout.weaponSkinId);
  const gunMat = trackMat(skinWeaponMats.gunMetal);
  const gunDarkMat = trackMat(skinWeaponMats.darkMetal);
  const gunAccentMat = trackMat(skinWeaponMats.accentPolymer);
  const woodGunMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: tex.woodGrain,
      normalMap: tex.woodNormal,
      color: 0xd4a076,
      roughness: 0.62,
      metalness: 0.05,
      clearcoat: 0.25,
    })
  );

  // --- 1. SCULPTED PELVIS + ARTICULATED 2-JOINT LEGS (HIP + KNEE PIVOTS, CARGO PANTS, DROP-LEG HOLSTER & SWAT BOOTS) ---
  // Contoured Pelvis / Hip Saddle bridging torso waist smoothly into upper thighs
  const pelvisPts = [
    new THREE.Vector2(0.085, -0.12),
    new THREE.Vector2(0.165, -0.055),
    new THREE.Vector2(0.196, 0.02),
    new THREE.Vector2(0.188, 0.065),
  ];
  const pelvis = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(pelvisPts, 20)), pantsMat);
  pelvis.scale.set(1.16, 1, 0.72);
  pelvis.position.set(0, 0.85, 0);
  pelvis.castShadow = true;
  pelvis.userData = { playerId, hitZone: 'body' };
  bodyPivot.add(pelvis);
  hitMeshes.push(pelvis);

  // Subtle tactical trouser fly & groin seam detail
  const flyPlacket = new THREE.Mesh(trackGeo(makeBeveledBox(0.042, 0.12, 0.02, 0.004)), pantsMat);
  flyPlacket.position.set(0, 0.835, -0.132);
  bodyPivot.add(flyPlacket);

  const makeLeg = (side: -1 | 1) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.13, 0.87, 0);

    // Sculpted Athletic Thigh (Lathe profile with natural quad & hamstring contour)
    const thighPts = [
      new THREE.Vector2(0.072, -0.43),
      new THREE.Vector2(0.082, -0.34),
      new THREE.Vector2(0.094, -0.2),
      new THREE.Vector2(0.104, -0.06),
      new THREE.Vector2(0.096, 0.02),
    ];
    const thigh = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(thighPts, 18)), pantsMat);
    thigh.scale.set(0.95, 1, 1.08);
    thigh.castShadow = true;
    thigh.userData = { playerId, hitZone: 'limb' };
    legGroup.add(thigh);
    hitMeshes.push(thigh);

    // Pleated Tactical Cargo Pocket + Stitched Top Flap on outer thigh
    const cargoPocket = new THREE.Mesh(
      trackGeo(makeBeveledBox(0.036, 0.158, 0.118, 0.007, 2)),
      pantsMat
    );
    cargoPocket.position.set(side * 0.088, -0.24, 0.006);
    legGroup.add(cargoPocket);
    const pocketFlap = new THREE.Mesh(
      trackGeo(makeBeveledBox(0.042, 0.032, 0.122, 0.004)),
      pantsMat
    );
    pocketFlap.position.set(side * 0.09, -0.165, 0.006);
    legGroup.add(pocketFlap);

    // Vertical Drop-Leg Belt Hanger Strap connecting hip belt down to thigh rig
    const hangerStrap = new THREE.Mesh(
      trackGeo(makeBeveledBox(0.018, 0.19, 0.042, 0.003)),
      leatherMat
    );
    hangerStrap.position.set(side * 0.102, -0.09, 0);
    legGroup.add(hangerStrap);

    if (side === 1) {
      // Right Thigh Safariland Drop-Leg Holster + Dual Nylon Thigh Straps + Seated Tactical Sidearm!
      for (const sy of [-0.175, -0.275]) {
        const strap = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.098, 0.095, 0.026, 18)),
          leatherMat
        );
        strap.scale.set(0.98, 1, 1.08);
        strap.position.set(0, sy, 0);
        legGroup.add(strap);
      }
      const holsterBody = new THREE.Mesh(
        trackGeo(makeBeveledBox(0.056, 0.168, 0.108, 0.008, 2)),
        leatherMat
      );
      holsterBody.position.set(0.104, -0.23, -0.008);
      legGroup.add(holsterBody);
      // Seated Sidearm Pistol Grip, Trigger Hood & Slide peeking cleanly out of holster
      const pGrip = new THREE.Mesh(trackGeo(makeBeveledBox(0.034, 0.078, 0.044, 0.004)), gloveMat);
      pGrip.position.set(0.11, -0.132, 0.026);
      pGrip.rotation.x = 0.32;
      legGroup.add(pGrip);
      const pSlide = new THREE.Mesh(trackGeo(makeBeveledBox(0.03, 0.038, 0.072, 0.003)), gunDarkMat);
      pSlide.position.set(0.108, -0.145, -0.014);
      legGroup.add(pSlide);
    } else {
      // Left Thigh Tactical Drop-Leg Dual Mag Sub-Load Pouches + Elastic Straps
      for (const sy of [-0.18, -0.275]) {
        const strap = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.098, 0.095, 0.024, 18)),
          pouchMat
        );
        strap.scale.set(0.98, 1, 1.08);
        strap.position.set(0, sy, 0);
        legGroup.add(strap);
      }
      for (const pz of [-0.034, 0.034]) {
        const subPouch = new THREE.Mesh(
          trackGeo(makeBeveledBox(0.048, 0.135, 0.054, 0.006, 2)),
          pouchMat
        );
        subPouch.position.set(-0.1, -0.225, pz);
        legGroup.add(subPouch);
      }
    }

    // --- ARTICULATED KNEE / LOWER LEG CHILD PIVOT (allows true realistic knee bend when running & crouching!) ---
    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.43, 0);
    legGroup.add(kneeGroup);

    // Rounded knee-joint ball inside trousers so bending knees never creates a visual gap
    const kneeJoint = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.072, 14, 12)), pantsMat);
    kneeGroup.add(kneeJoint);

    // Contoured Dual-Shell Hard Tactical Knee Pad + Carbon Impact Cap + Dual Straps
    const kneeShell = new THREE.Mesh(
      trackGeo(makeBeveledBox(0.12, 0.142, 0.048, 0.016, 3)),
      leatherMat
    );
    kneeShell.position.set(0, -0.01, -0.072);
    kneeGroup.add(kneeShell);
    const kneeCap = new THREE.Mesh(
      trackGeo(makeBeveledBox(0.09, 0.098, 0.028, 0.01, 2)),
      carbonKnuckleMat
    );
    kneeCap.position.set(0, -0.01, -0.092);
    kneeGroup.add(kneeCap);
    for (const ksy of [0.028, -0.048]) {
      const kneeStrap = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.079, 0.079, 0.022, 16)),
        pouchMat
      );
      kneeStrap.position.set(0, ksy, 0.005);
      kneeGroup.add(kneeStrap);
    }

    // Sculpted Bloused Cargo Shin & Ankle Blousing Fold
    const shinPts = [
      new THREE.Vector2(0.062, -0.285),
      new THREE.Vector2(0.084, -0.235), // bloused fabric fold above boot collar
      new THREE.Vector2(0.077, -0.14),
      new THREE.Vector2(0.079, -0.055),
      new THREE.Vector2(0.072, 0.01),
    ];
    const shin = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(shinPts, 18)), pantsMat);
    shin.castShadow = true;
    shin.userData = { playerId, hitZone: 'limb' };
    kneeGroup.add(shin);
    hitMeshes.push(shin);

    // Sculpted Multi-Part Laced Tactical SWAT Combat Boot (grounded flush at y = -0.44 => world y = 0!)
    const bootShaft = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.064, 0.069, 0.155, 16)),
      bootMat
    );
    bootShaft.position.set(0, -0.315, 0.004);
    kneeGroup.add(bootShaft);
    // Padded collar rim
    const bootCollar = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.064, 0.015, 8, 18)),
      pouchMat
    );
    bootCollar.rotation.x = Math.PI / 2;
    bootCollar.position.set(0, -0.245, 0.004);
    kneeGroup.add(bootCollar);
    // Molded rubber heel counter at back of boot
    const heelCounter = new THREE.Mesh(
      trackGeo(makeBeveledBox(0.116, 0.076, 0.068, 0.012, 2)),
      rubberSoleMat
    );
    heelCounter.position.set(0, -0.386, 0.052);
    kneeGroup.add(heelCounter);
    // Curved leather vamp + rounded reinforced toe cap
    const bootVamp = new THREE.Mesh(
      trackGeo(makeBeveledBox(0.118, 0.076, 0.215, 0.018, 3)),
      bootMat
    );
    bootVamp.position.set(0, -0.384, -0.036);
    bootVamp.castShadow = true;
    kneeGroup.add(bootVamp);
    const bootToe = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.058, 14, 10)), bootMat);
    bootToe.scale.set(1.03, 0.68, 1.18);
    bootToe.position.set(0, -0.394, -0.12);
    kneeGroup.add(bootToe);
    // Heavy Lugged Rubber Outsole sitting flush on y = -0.44 (world y = 0.00)
    const bootSole = new THREE.Mesh(
      trackGeo(makeBeveledBox(0.13, 0.032, 0.278, 0.006, 2)),
      rubberSoleMat
    );
    bootSole.position.set(0, -0.424, -0.044);
    kneeGroup.add(bootSole);
    // Side tread lug notches & metallic lace speed-hooks along front tongue
    for (let ly = 0; ly < 5; ly++) {
      const lace = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.044, 0.006, 0.009)),
        silverMetal
      );
      lace.position.set(0, -0.268 - ly * 0.022, -0.067);
      kneeGroup.add(lace);
    }

    bodyPivot.add(legGroup);
    return { legGroup, kneeGroup };
  };

  const leftLegRig = makeLeg(-1);
  const rightLegRig = makeLeg(1);
  const leftLeg = leftLegRig.legGroup;
  const rightLeg = rightLegRig.legGroup;
  const leftKnee = leftLegRig.kneeGroup;
  const rightKnee = rightLegRig.kneeGroup;

  // --- 2. SCULPTED ATHLETIC TORSO + POLICE DUTY BELT + SHOOTER'S-CUT PLATE CARRIER ---
  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.88, 0);
  bodyPivot.add(upperBody);

  // Sculpted Athletic Torso (Lathe profile: hips -> tapered waist -> broad chest/lats -> neck collar)
  const torsoPts = [
    new THREE.Vector2(0.175, -0.03),
    new THREE.Vector2(0.188, 0.04),
    new THREE.Vector2(0.178, 0.14),
    new THREE.Vector2(0.205, 0.28),
    new THREE.Vector2(0.232, 0.44),
    new THREE.Vector2(0.215, 0.55),
    new THREE.Vector2(0.118, 0.61),
    new THREE.Vector2(0.095, 0.64),
  ];
  const torso = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(torsoPts, 20)), shirtMat);
  torso.scale.set(1.12, 1, 0.68);
  torso.castShadow = true;
  torso.userData = { playerId, hitZone: 'body' };
  upperBody.add(torso);
  hitMeshes.push(torso);

  // Sculpted Trapezius & Clavicle Slope bridging upper torso smoothly into neck & deltoids
  const trapYoke = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.165, 20, 14)), shirtMat);
  trapYoke.scale.set(1.48, 0.42, 0.72);
  trapYoke.position.set(0, 0.568, 0.005);
  upperBody.add(trapYoke);

  // Tactical Mock-Zip Stand Collar + Zip Tab on Uniform Shirt
  const shirtCollar = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.095, 0.118, 0.074, 18)),
    shirtMat
  );
  shirtCollar.position.set(0, 0.612, 0);
  upperBody.add(shirtCollar);
  const zipTab = new THREE.Mesh(trackGeo(makeBeveledBox(0.012, 0.045, 0.01, 0.002)), gunDarkMat);
  zipTab.position.set(0, 0.595, -0.106);
  upperBody.add(zipTab);

  // Police Leather Duty Belt + Cobra Tactical Buckle + Rear Silver Handcuffs + Radio Pouch + Dump Pouch
  const dutyBelt = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.205, 0.208, 0.062, 20)),
    leatherMat
  );
  dutyBelt.scale.set(1.16, 1, 0.72);
  dutyBelt.position.set(0, 0.055, 0);
  upperBody.add(dutyBelt);

  const beltBuckle = new THREE.Mesh(
    trackGeo(makeBeveledBox(0.072, 0.052, 0.024, 0.004)),
    silverMetal
  );
  beltBuckle.position.set(0, 0.055, -0.155);
  upperBody.add(beltBuckle);

  // Tactical Carabiner clipped to right front duty belt
  const carabiner = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.02, 0.0045, 8, 14)), silverMetal);
  carabiner.position.set(0.14, 0.02, -0.14);
  carabiner.rotation.y = 0.4;
  upperBody.add(carabiner);

  // Silver Police Handcuffs clipped to back of Duty Belt
  for (const [cx, cy] of [
    [0.095, 0.032],
    [0.148, 0.022],
  ]) {
    const cuff = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.032, 0.0065, 8, 16)), silverMetal);
    cuff.position.set(cx, cy, 0.16);
    upperBody.add(cuff);
  }
  // Tactical Dump Pouch & Baton Holder on left hip
  const dumpPouch = new THREE.Mesh(trackGeo(makeBeveledBox(0.085, 0.11, 0.065, 0.008)), pouchMat);
  dumpPouch.position.set(-0.21, 0.04, 0.08);
  upperBody.add(dumpPouch);

  // Seamless Rounded Shoulder Deltoids + Embroidered Velcro Unit Patch + High-Vis Team Armbands + Patrol Epaulettes
  for (const side of [-1, 1] as const) {
    const deltoid = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.102, 18, 16)), shirtMat);
    deltoid.scale.set(0.96, 1.08, 0.98);
    deltoid.position.set(side * 0.244, 0.51, -0.004);
    deltoid.userData = { playerId, hitZone: 'body' };
    upperBody.add(deltoid);
    hitMeshes.push(deltoid);

    // Embroidered SF-OPS Velcro Shoulder Patch mounted cleanly on outer sleeve
    const unitPatch = new THREE.Mesh(trackGeo(makeBeveledBox(0.012, 0.072, 0.064, 0.003)), patchMat);
    unitPatch.position.set(side * 0.336, 0.505, -0.008);
    unitPatch.rotation.z = side * -0.1;
    upperBody.add(unitPatch);

    // Shoulder Velcro Team ID Patch (cleanly distinguishes Red vs Blue teams in battle)
    const armband = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.073, 0.071, 0.044, 16)),
      teamBandMat
    );
    armband.position.set(side * 0.272, 0.435, -0.024);
    armband.rotation.z = side * 0.18;
    upperBody.add(armband);

    if (uni.isPolicePatrol) {
      const epaulette = new THREE.Mesh(
        trackGeo(makeBeveledBox(0.11, 0.016, 0.044, 0.003)),
        leatherMat
      );
      epaulette.position.set(side * 0.195, 0.6, 0);
      epaulette.rotation.z = -side * 0.16;
      upperBody.add(epaulette);
      const epPip = new THREE.Mesh(trackGeo(makeBeveledBox(0.022, 0.02, 0.022, 0.003)), goldMetal);
      epPip.position.set(side * 0.205, 0.608, 0);
      upperBody.add(epPip);
    }
  }

  // Helper: 3D Triple Rifle Magazine Pouches WITH Curved PMAG Tops Peeking Out!
  const addTripleMagPouches = (mat: THREE.Material, zPos: number, yPos: number) => {
    for (let i = -1; i <= 1; i++) {
      const mx = i * 0.098;
      const pouch = new THREE.Mesh(trackGeo(makeBeveledBox(0.082, 0.128, 0.048, 0.007)), mat);
      pouch.position.set(mx, yPos, zPos);
      upperBody.add(pouch);
      // Visible PMAG rifle magazine top + bungee pull tab sticking out!
      const magTop = new THREE.Mesh(trackGeo(makeBeveledBox(0.056, 0.042, 0.028, 0.003)), gunDarkMat);
      magTop.position.set(mx, yPos + 0.072, zPos);
      upperBody.add(magTop);
    }
  };

  // Helper: Coiled Shoulder Radio Mic + Cable (`TubeGeometry`)
  const addShoulderRadio = (zFront: number) => {
    const mic = new THREE.Mesh(trackGeo(makeBeveledBox(0.046, 0.068, 0.032, 0.005)), leatherMat);
    mic.position.set(-0.145, 0.49, zFront - 0.015);
    upperBody.add(mic);
    const micBtn = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.012, 0.026, 0.012)), teamBandMat);
    micBtn.position.set(-0.17, 0.49, zFront - 0.015);
    upperBody.add(micBtn);
    const wireCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.145, 0.52, zFront - 0.005),
      new THREE.Vector3(-0.165, 0.585, -0.02),
      new THREE.Vector3(-0.15, 0.56, 0.12),
      new THREE.Vector3(-0.12, 0.44, 0.17),
    ]);
    const wire = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(wireCurve, 16, 0.006, 6, false)),
      leatherMat
    );
    upperBody.add(wire);
  };

  // --- MODULAR AAA SHOOTER'S-CUT TACTICAL VESTS & PLATE CARRIERS ---
  const vestId = loadout.vestId || 'police_kevlar';
  if (
    vestId === 'police_kevlar' ||
    vestId === 'swat_heavy' ||
    vestId === 'plate_tan' ||
    vestId === 'naresuan_jpc' ||
    vestId === 'juggernaut_exo'
  ) {
    const isSwat = vestId === 'swat_heavy';
    const isTan = vestId === 'plate_tan';
    const isCtu = vestId === 'naresuan_jpc';
    const isEod = vestId === 'juggernaut_exo';
    const baseHex = isEod ? 0x262e36 : isCtu ? 0x131b28 : isSwat ? 0x171c25 : isTan ? 0x9b8460 : 0x152338;
    const plateTex = isEod
      ? tex.eodVestPlate
      : isCtu
        ? tex.ctuVestPlate
        : isSwat
          ? tex.swatVestPlate
          : isTan
            ? tex.tanVestPlate
            : tex.policeVestPlate;

    const vestTrimMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: isTan ? tex.desertCamo : tex.blackRipstop,
        normalMap: tex.molleNormal,
        normalScale: new THREE.Vector2(0.95, 0.95),
        color: isTan ? 0xcab590 : baseHex,
        roughness: isEod ? 0.56 : 0.72,
        metalness: isEod ? 0.34 : 0.12,
        sheen: 0.25,
      })
    );
    const vestPlateMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: plateTex,
        normalMap: tex.molleNormal,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughness: isEod ? 0.52 : 0.68,
        metalness: isEod ? 0.32 : 0.12,
        sheen: 0.22,
      })
    );

    const plateW = isEod ? 0.41 : isSwat ? 0.37 : 0.34;
    const plateH = isEod ? 0.44 : isSwat ? 0.42 : 0.39;
    const plateDepth = isEod ? 0.088 : 0.068;
    const plateGeo = trackGeo(makeShooterCutPlate(plateW, plateH, plateDepth, 0.012));

    // Front Contoured Ballistic Armor Plate (facing -Z)
    const frontPlate = new THREE.Mesh(plateGeo, vestPlateMat);
    frontPlate.position.set(0, 0.355, isEod ? -0.145 : -0.135);
    frontPlate.rotation.y = Math.PI;
    frontPlate.castShadow = true;
    frontPlate.userData = { playerId, hitZone: 'body' };
    upperBody.add(frontPlate);
    hitMeshes.push(frontPlate);

    // Rear Contoured Ballistic Armor Plate (facing +Z)
    const backPlate = new THREE.Mesh(plateGeo, vestPlateMat);
    backPlate.position.set(0, 0.355, isEod ? 0.142 : 0.132);
    backPlate.castShadow = true;
    backPlate.userData = { playerId, hitZone: 'body' };
    upperBody.add(backPlate);
    hitMeshes.push(backPlate);

    // Side Elastic MOLLE Cummerbund wrapping waist cleanly
    const cummerbund = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(isEod ? 0.232 : 0.215, isEod ? 0.222 : 0.205, 0.19, 18)),
      vestTrimMat
    );
    cummerbund.scale.set(1.14, 1, 0.76);
    cummerbund.position.set(0, 0.245, 0);
    upperBody.add(cummerbund);

    // Padded Contoured Shoulder Straps + Quick-Release Polymer Buckles
    for (const side of [-1, 1] as const) {
      const strapCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.115, 0.51, -0.135),
        new THREE.Vector3(side * 0.135, 0.615, -0.03),
        new THREE.Vector3(side * 0.13, 0.61, 0.05),
        new THREE.Vector3(side * 0.115, 0.51, 0.132),
      ]);
      const strap = new THREE.Mesh(
        trackGeo(new THREE.TubeGeometry(strapCurve, 12, isEod ? 0.038 : 0.032, 8, false)),
        vestTrimMat
      );
      strap.scale.set(1.35, 0.52, 1);
      upperBody.add(strap);

      const buckle = new THREE.Mesh(
        trackGeo(makeBeveledBox(0.044, 0.032, 0.022, 0.003)),
        isCtu ? goldMetal : leatherMat
      );
      buckle.position.set(side * 0.125, 0.51, -0.16);
      upperBody.add(buckle);
    }

    addShoulderRadio(isEod ? -0.175 : -0.155);

    if (vestId === 'police_kevlar') {
      const goldBadge = new THREE.Mesh(
        trackGeo(makeShooterCutPlate(0.052, 0.062, 0.012, 0.003)),
        goldMetal
      );
      goldBadge.position.set(0.118, 0.455, -0.172);
      upperBody.add(goldBadge);
      addTripleMagPouches(vestTrimMat, -0.178, 0.22);
    } else if (isCtu) {
      // Naresuan CTU-261 Gold-Accented JPC + Dual Glowing Chem-Lights + Tourniquet + Compact Assault Pack
      addTripleMagPouches(pouchMat, -0.18, 0.22);
      const redChem = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.007, 0.007, 0.11, 8)),
        trackMat(new THREE.MeshBasicMaterial({ color: 0xf43f5e }))
      );
      redChem.position.set(0.138, 0.365, -0.176);
      redChem.rotation.z = 0.1;
      upperBody.add(redChem);
      const goldChem = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.007, 0.007, 0.11, 8)),
        trackMat(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }))
      );
      goldChem.position.set(0.156, 0.365, -0.174);
      goldChem.rotation.z = 0.1;
      upperBody.add(goldChem);
      // Gold-trimmed Tactical Tourniquet on chest
      const tq = new THREE.Mesh(trackGeo(makeBeveledBox(0.044, 0.092, 0.036, 0.005)), leatherMat);
      tq.position.set(-0.142, 0.35, -0.174);
      upperBody.add(tq);
      const pack = new THREE.Mesh(trackGeo(makeBeveledBox(0.24, 0.33, 0.1, 0.016, 3)), vestTrimMat);
      pack.position.set(0, 0.36, 0.2);
      upperBody.add(pack);
      const ant = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.005, 0.008, 0.42, 8)), leatherMat);
      ant.position.set(-0.1, 0.68, 0.205);
      upperBody.add(ant);
    } else if (isEod) {
      // Heavy EOD Juggernaut Exo-Armor: Massive Layered Blast Collar, Dual-Tier Shoulder Pauldrons, Groin Armor & Twin Oxygen Tanks!
      const blastCollar = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.162, 0.195, 0.105, 20)),
        vestTrimMat
      );
      blastCollar.position.set(0, 0.605, 0.008);
      upperBody.add(blastCollar);
      // Articulated Ballistic Groin Protector Flap
      const groinPlate = new THREE.Mesh(
        trackGeo(makeShooterCutPlate(0.22, 0.18, 0.048, 0.01)),
        vestTrimMat
      );
      groinPlate.position.set(0, 0.09, -0.175);
      groinPlate.rotation.x = Math.PI; // angled downward taper
      upperBody.add(groinPlate);
      // Dual-Tier Heavy Shoulder Armor Pauldrons
      for (const side of [-1, 1] as const) {
        const upperPauldron = new THREE.Mesh(
          trackGeo(makeBeveledBox(0.088, 0.21, 0.22, 0.018, 3)),
          vestTrimMat
        );
        upperPauldron.position.set(side * 0.305, 0.49, 0);
        upperPauldron.rotation.z = side * 0.22;
        upperBody.add(upperPauldron);
        const lowerRim = new THREE.Mesh(
          trackGeo(makeBeveledBox(0.068, 0.065, 0.19, 0.01, 2)),
          carbonKnuckleMat
        );
        lowerRim.position.set(side * 0.315, 0.39, 0);
        lowerRim.rotation.z = side * 0.12;
        upperBody.add(lowerRim);
      }
      addTripleMagPouches(pouchMat, -0.198, 0.225);
      // Twin Rear Heavy EOD Steel Pressurized Tanks + Breaching Radio Pack
      for (const side of [-1, 1] as const) {
        const tank = new THREE.Mesh(
          trackGeo(new THREE.CapsuleGeometry(0.064, 0.24, 8, 14)),
          gunDarkMat
        );
        tank.position.set(side * 0.082, 0.38, 0.245);
        upperBody.add(tank);
        const valve = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 10)), goldMetal);
        valve.position.set(side * 0.082, 0.56, 0.245);
        upperBody.add(valve);
      }
      const ant = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.006, 0.009, 0.48, 8)), leatherMat);
      ant.position.set(-0.14, 0.72, 0.25);
      upperBody.add(ant);
    } else if (isSwat) {
      const collar = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.138, 0.165, 0.075, 18)),
        vestTrimMat
      );
      collar.position.set(0, 0.595, 0.01);
      upperBody.add(collar);
      for (const side of [-1, 1] as const) {
        const pauldron = new THREE.Mesh(
          trackGeo(makeBeveledBox(0.058, 0.17, 0.175, 0.014, 3)),
          vestTrimMat
        );
        pauldron.position.set(side * 0.285, 0.495, 0);
        pauldron.rotation.z = side * 0.18;
        upperBody.add(pauldron);
      }
      addTripleMagPouches(pouchMat, -0.184, 0.22);
      const chemLight = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.007, 0.007, 0.11, 8)),
        trackMat(new THREE.MeshBasicMaterial({ color: 0x4ade80 }))
      );
      chemLight.position.set(0.135, 0.37, -0.176);
      chemLight.rotation.z = 0.12;
      upperBody.add(chemLight);
      const pack = new THREE.Mesh(trackGeo(makeBeveledBox(0.27, 0.36, 0.125, 0.018, 3)), pouchMat);
      pack.position.set(0, 0.36, 0.215);
      upperBody.add(pack);
      const ant = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.005, 0.008, 0.44, 8)), leatherMat);
      ant.position.set(-0.11, 0.69, 0.22);
      upperBody.add(ant);
    } else {
      addTripleMagPouches(vestTrimMat, -0.18, 0.22);
      const pack = new THREE.Mesh(trackGeo(makeBeveledBox(0.25, 0.32, 0.11, 0.016, 3)), vestTrimMat);
      pack.position.set(0, 0.36, 0.2);
      upperBody.add(pack);
      const ant = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.005, 0.008, 0.38, 8)), leatherMat);
      ant.position.set(-0.1, 0.66, 0.21);
      upperBody.add(ant);
    }
  } else if (vestId === 'ghillie_cape') {
    // Recon Sniper Cloak Rig — Lightweight Chest Rig + Draped Camouflaged Sniper Cape & Foliage Strips!
    const cloakMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.jungleTiger,
        normalMap: tex.fabricNormal,
        normalScale: new THREE.Vector2(1.0, 1.0),
        color: 0xbcd4b0,
        roughness: 0.92,
        metalness: 0.02,
        sheen: 0.55,
        side: THREE.DoubleSide,
      })
    );
    const rigBar = new THREE.Mesh(trackGeo(makeBeveledBox(0.36, 0.14, 0.06, 0.012, 2)), pouchMat);
    rigBar.position.set(0, 0.24, -0.148);
    upperBody.add(rigBar);
    addTripleMagPouches(pouchMat, -0.178, 0.235);
    // Draped Shoulder Mantle covering traps & upper chest
    const mantle = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.16, 0.34, 0.24, 22, 1, true)),
      cloakMat
    );
    mantle.scale.set(1.06, 1, 0.8);
    mantle.position.set(0, 0.52, 0.015);
    upperBody.add(mantle);
    // Flowing Rear Recon Sniper Cloak Panel
    const capeGeo = trackGeo(new THREE.PlaneGeometry(0.56, 0.72, 6, 6));
    const cPos = capeGeo.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const x = cPos.getX(i);
      const y = cPos.getY(i);
      const t = (0.36 - y) / 0.72;
      cPos.setZ(i, Math.sin(x * 8) * 0.028 * t + t * t * 0.085);
    }
    capeGeo.computeVertexNormals();
    const cape = new THREE.Mesh(capeGeo, cloakMat);
    cape.position.set(0, 0.24, 0.195);
    upperBody.add(cape);
    // Layered Sniper Foliage Strip Tufts along shoulders
    for (let f = -2; f <= 2; f++) {
      const tuft = new THREE.Mesh(trackGeo(makeBeveledBox(0.085, 0.04, 0.06, 0.008)), cloakMat);
      tuft.position.set(f * 0.11, 0.61 - Math.abs(f) * 0.02, 0.06);
      tuft.rotation.set(0.25, f * 0.2, f * -0.15);
      upperBody.add(tuft);
    }
    addShoulderRadio(-0.15);
  } else {
    // stealth_rig — Lightweight Spec-Ops Recon Chest Rig + Cross Harness + Sheathed Combat Knife
    const rigBar = new THREE.Mesh(trackGeo(makeBeveledBox(0.38, 0.15, 0.065, 0.012, 2)), pouchMat);
    rigBar.position.set(0, 0.24, -0.148);
    rigBar.userData = { playerId, hitZone: 'body' };
    upperBody.add(rigBar);
    hitMeshes.push(rigBar);
    addTripleMagPouches(pouchMat, -0.18, 0.235);
    for (const side of [-1, 1] as const) {
      const strapCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.125, 0.3, -0.15),
        new THREE.Vector3(side * 0.145, 0.6, -0.02),
        new THREE.Vector3(side * 0.115, 0.32, 0.155),
      ]);
      const strap = new THREE.Mesh(
        trackGeo(new THREE.TubeGeometry(strapCurve, 12, 0.024, 8, false)),
        pouchMat
      );
      strap.scale.set(1.4, 0.45, 1);
      upperBody.add(strap);
    }
    const sheath = new THREE.Mesh(trackGeo(makeBeveledBox(0.042, 0.165, 0.028, 0.005)), leatherMat);
    sheath.position.set(-0.135, 0.44, -0.16);
    sheath.rotation.z = -0.28;
    upperBody.add(sheath);
    const hilt = new THREE.Mesh(trackGeo(makeBeveledBox(0.026, 0.075, 0.022, 0.004)), gunDarkMat);
    hilt.position.set(-0.105, 0.345, -0.165);
    hilt.rotation.z = -0.28;
    upperBody.add(hilt);
    addShoulderRadio(-0.15);
  }

  // --- 3. VERTEX-SCULPTED ANATOMICAL HEAD + RECESSED 3D EYES + 3D HAIR + AAA HEADGEAR & FACEGEAR ---
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.625, 0);
  upperBody.add(headGroup);

  const faceId = loadout.facegearId || 'none';
  const headgearId = loadout.headgearId || 'police_cap';
  const isMasked = faceId === 'balaclava' || faceId === 'skull_mask';

  // Sculpted Muscular Neck (Lathe flare transitioning seamlessly into trapezius/collar)
  const neckPts = [
    new THREE.Vector2(0.092, -0.025),
    new THREE.Vector2(0.074, 0.022),
    new THREE.Vector2(0.065, 0.062),
    new THREE.Vector2(0.062, 0.098),
  ];
  const neck = new THREE.Mesh(
    trackGeo(new THREE.LatheGeometry(neckPts, 18)),
    isMasked ? maskNeckMat : skinMat
  );
  neck.position.set(0, 0.005, 0.004);
  headGroup.add(neck);

  // Vertex-Sculpted Anatomical Cranium (brow ridge, recessed eye sockets, cheekbones, tapered jaw & chin)
  const headBaseMat =
    faceId === 'skull_mask'
      ? skullMat
      : faceId === 'balaclava'
        ? balaclavaMat
        : faceId === 'tactical_warpaint'
          ? faceWarpaintMat
          : faceMat;
  const cranium = new THREE.Mesh(trackGeo(makeSculptedHeadGeo()), headBaseMat);
  cranium.rotation.y = Math.PI / 2; // aligns equirectangular center u=0.5 (+X local) cleanly to -Z!
  cranium.position.set(0, 0.182, 0);
  cranium.castShadow = true;
  cranium.userData = { playerId, hitZone: 'head' };
  headGroup.add(cranium);
  hitMeshes.push(cranium);

  // Refined Multi-Part Sculpted 3D Nose (nasal bridge + soft rounded tip + alae wings)
  const noseMat = isMasked ? maskNeckMat : faceId === 'tactical_warpaint' ? faceWarpaintMat : skinMat;
  const noseBridge = new THREE.Mesh(trackGeo(makeBeveledBox(0.017, 0.044, 0.022, 0.005, 2)), noseMat);
  noseBridge.position.set(0, 0.172, -0.123);
  noseBridge.rotation.x = -0.24;
  headGroup.add(noseBridge);
  const noseTip = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.0125, 12, 10)), noseMat);
  noseTip.scale.set(1.15, 0.85, 0.92);
  noseTip.position.set(0, 0.154, -0.132);
  headGroup.add(noseTip);

  // Recessed Glossy 3D Eyeballs + Subtle Upper Eyelids (when eyes aren't occluded by opaque goggles/visors)
  const eyesOccluded =
    faceId === 'gas_mask' ||
    faceId === 'cyber_visor' ||
    faceId === 'tactical_goggles' ||
    faceId === 'aviator' ||
    headgearId === 'altyn_visor';
  if (!eyesOccluded) {
    const scleraMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xf4f2f0,
        roughness: 0.06,
        metalness: 0.02,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
      })
    );
    const irisMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x2a1b12,
        roughness: 0.05,
        metalness: 0.08,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
      })
    );
    const lidMat = isMasked ? maskNeckMat : skinMat;
    for (const side of [-1, 1] as const) {
      const eyeball = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.014, 14, 12)), scleraMat);
      eyeball.position.set(side * 0.042, 0.192, -0.111);
      headGroup.add(eyeball);
      const iris = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.0072, 12, 10)), irisMat);
      iris.scale.set(1, 1, 0.55);
      iris.position.set(side * 0.042, 0.192, -0.123);
      headGroup.add(iris);
      // Upper eyelid crease framing the eyeball
      const upperLid = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(0.0155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48)),
        lidMat
      );
      upperLid.position.set(side * 0.042, 0.193, -0.111);
      upperLid.rotation.x = 0.25;
      headGroup.add(upperLid);
    }
  }

  // 3D Sculpted Military High-Fade Hair Cap (shown under open/cap/beret/boonie headgear when unmasked)
  const fullEnclosedHelmet =
    headgearId === 'riot_helmet' ||
    headgearId === 'fast_nvg' ||
    headgearId === 'altyn_visor' ||
    headgearId === 'ghillie_hood';
  if (!isMasked && !fullEnclosedHelmet) {
    // Tapered hair volume around crown, sides & nape so head never looks smooth/bald
    const hairCap = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.132, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.56)),
      hairMat
    );
    hairCap.scale.set(0.92, 1.04, 1.02);
    hairCap.position.set(0, 0.194, 0.006);
    hairCap.rotation.x = 0.16;
    headGroup.add(hairCap);
    // Crisp sideburn / temple fade wedges
    for (const side of [-1, 1] as const) {
      const temple = new THREE.Mesh(trackGeo(makeBeveledBox(0.016, 0.056, 0.048, 0.005)), hairMat);
      temple.position.set(side * 0.112, 0.204, -0.014);
      headGroup.add(temple);
    }
  }

  // Multi-Part Anatomical Sculpted Ears (outer helix rim + inner lobe)
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.025, 12, 10)), noseMat);
    ear.scale.set(0.42, 1.24, 0.82);
    ear.position.set(side * 0.116, 0.174, 0.008);
    headGroup.add(ear);
    const earHelix = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.016, 0.0055, 6, 14)), noseMat);
    earHelix.scale.set(0.72, 1.28, 0.72);
    earHelix.rotation.y = Math.PI / 2;
    earHelix.position.set(side * 0.121, 0.176, 0.009);
    headGroup.add(earHelix);
  }

  // --- AAA FACEGEAR ATTACHMENTS ---
  if (faceId === 'aviator') {
    const aviatorLensMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x0d1b2e,
        metalness: 0.96,
        roughness: 0.05,
        clearcoat: 1.0,
        iridescence: 0.55,
      })
    );
    for (const side of [-1, 1] as const) {
      const lens = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.025, 0.007, 16)), aviatorLensMat);
      lens.rotation.x = Math.PI / 2;
      lens.rotation.z = side * 0.12;
      lens.position.set(side * 0.044, 0.19, -0.13);
      headGroup.add(lens);
      const rim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.03, 0.0032, 8, 18)), goldMetal);
      rim.position.set(side * 0.044, 0.19, -0.132);
      headGroup.add(rim);
      // Temple wire arm going back to ears
      const arm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.0022, 0.0022, 0.12, 6)), goldMetal);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(side * 0.095, 0.192, -0.072);
      headGroup.add(arm);
    }
    const bridge1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.034, 0.004, 0.005)), goldMetal);
    bridge1.position.set(0, 0.204, -0.135);
    headGroup.add(bridge1);
    const bridge2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.026, 0.0035, 0.005)), goldMetal);
    bridge2.position.set(0, 0.194, -0.134);
    headGroup.add(bridge2);
  } else if (faceId === 'tactical_goggles') {
    // Curved Wrap-Around ESS Ballistic Goggles with Mirrored Iridescent Lens & Retention Strap
    const goggleLens = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x16447a,
        emissive: 0x0b2444,
        emissiveIntensity: 0.28,
        metalness: 0.92,
        roughness: 0.06,
        clearcoat: 1.0,
        iridescence: 0.7,
      })
    );
    const frameCurve = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.134, 0.134, 0.068, 22, 1, true, Math.PI * 0.68, Math.PI * 0.64)),
      leatherMat
    );
    frameCurve.position.set(0, 0.194, -0.01);
    headGroup.add(frameCurve);
    const lensCurve = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.138, 0.138, 0.052, 22, 1, true, Math.PI * 0.72, Math.PI * 0.56)),
      goggleLens
    );
    lensCurve.position.set(0, 0.194, -0.012);
    headGroup.add(lensCurve);
    // Elastic strap around head
    const strap = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.128, 0.012, 8, 24)), pouchMat);
    strap.rotation.x = Math.PI / 2;
    strap.position.set(0, 0.196, 0.006);
    headGroup.add(strap);
  } else if (faceId === 'gas_mask') {
    // S10 / M50 SWAT Twin-Filter Tactical Gas Mask
    const maskRubber = trackMat(
      new THREE.MeshPhysicalMaterial({ color: 0x14171d, roughness: 0.56, metalness: 0.16, clearcoat: 0.25 })
    );
    const maskLens = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x0c1b2e,
        metalness: 0.94,
        roughness: 0.06,
        clearcoat: 1.0,
        iridescence: 0.5,
      })
    );
    const faceShell = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.132, 20, 16)), maskRubber);
    faceShell.scale.set(0.93, 1.08, 1.02);
    faceShell.position.set(0, 0.172, -0.012);
    headGroup.add(faceShell);
    // Front Voice Diaphragm Snout
    const snout = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.036, 0.048, 0.088, 16)), maskRubber);
    snout.rotation.x = Math.PI / 2 + 0.26;
    snout.position.set(0, 0.122, -0.145);
    headGroup.add(snout);
    const grille = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16)), silverMetal);
    grille.rotation.x = Math.PI / 2 + 0.26;
    grille.position.set(0, 0.11, -0.188);
    headGroup.add(grille);
    // Twin Ribbed Side Filter Canisters + Angled Outsert Eyepieces
    for (const side of [-1, 1] as const) {
      const filter = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.038, 0.038, 0.062, 16)), pouchMat);
      filter.rotation.z = side * 0.52;
      filter.rotation.x = Math.PI / 2;
      filter.position.set(side * 0.078, 0.11, -0.134);
      headGroup.add(filter);
      const lensRim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.034, 0.005, 8, 16)), leatherMat);
      lensRim.position.set(side * 0.045, 0.194, -0.132);
      headGroup.add(lensRim);
      const lens = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.014, 16)), maskLens);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(side * 0.045, 0.194, -0.13);
      headGroup.add(lens);
    }
  } else if (faceId === 'shemagh_wrap') {
    // Desert Tactical Shemagh Scarf wrapping lower face & draped neck folds
    const shemaghMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.shemaghTex,
        normalMap: tex.fabricNormal,
        normalScale: new THREE.Vector2(0.95, 0.95),
        roughness: 0.9,
        metalness: 0.02,
        sheen: 0.45,
      })
    );
    const faceWrap = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.136, 0.128, 0.125, 22)),
      shemaghMat
    );
    faceWrap.scale.set(0.96, 1, 1.06);
    faceWrap.position.set(0, 0.118, -0.01);
    headGroup.add(faceWrap);
    const scarfFold = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.112, 0.034, 10, 22)),
      shemaghMat
    );
    scarfFold.rotation.x = Math.PI / 2 + 0.16;
    scarfFold.position.set(0, 0.045, -0.012);
    headGroup.add(scarfFold);
  } else if (faceId === 'ballistic_mandible') {
    // Ops-Core Carbon Ballistic Lower-Jaw Mandible Mask + Glowing Cyan Tactical HUD Monocle!
    const carbonMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.carbonFiber,
        normalMap: tex.carbonNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        color: 0xc2cbd8,
        metalness: 0.55,
        roughness: 0.28,
        clearcoat: 0.85,
      })
    );
    const jawGuard = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.14, 0.128, 0.115, 20, 1, true, Math.PI * 0.58, Math.PI * 0.84)),
      carbonMat
    );
    jawGuard.position.set(0, 0.112, -0.012);
    headGroup.add(jawGuard);
    const chinPlate = new THREE.Mesh(trackGeo(makeBeveledBox(0.11, 0.075, 0.052, 0.01)), carbonMat);
    chinPlate.position.set(0, 0.095, -0.134);
    headGroup.add(chinPlate);
    for (const side of [-1, 1] as const) {
      const vent = new THREE.Mesh(trackGeo(makeBeveledBox(0.036, 0.022, 0.012, 0.002)), silverMetal);
      vent.position.set(side * 0.052, 0.105, -0.148);
      vent.rotation.y = side * -0.35;
      headGroup.add(vent);
    }
    // Glowing Cyan Tactical HUD Eye Monocle over right eye
    const monocleMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.85,
        transparent: true,
        opacity: 0.72,
        roughness: 0.05,
        metalness: 0.2,
      })
    );
    const monocle = new THREE.Mesh(trackGeo(makeBeveledBox(0.058, 0.034, 0.008, 0.002)), monocleMat);
    monocle.position.set(0.044, 0.194, -0.138);
    headGroup.add(monocle);
    const monoArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.052, 0.012, 0.09)), gunDarkMat);
    monoArm.position.set(0.105, 0.196, -0.085);
    headGroup.add(monoArm);
  } else if (faceId === 'cyber_visor') {
    // Sleek Wrap-Around Glowing Cyan-Amber Holographic Tactical Visor
    const holoVisorMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x0ea5e9,
        emissive: 0x0284c7,
        emissiveIntensity: 0.72,
        metalness: 0.85,
        roughness: 0.06,
        clearcoat: 1.0,
        iridescence: 0.85,
      })
    );
    const visorArc = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.056, 24, 1, true, Math.PI * 0.65, Math.PI * 0.7)),
      holoVisorMat
    );
    visorArc.position.set(0, 0.194, -0.01);
    headGroup.add(visorArc);
    const visorFrame = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.136, 0.136, 0.072, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76)),
      carbonKnuckleMat
    );
    visorFrame.position.set(0, 0.194, -0.008);
    headGroup.add(visorFrame);
    // Amber Telemetry Side Emitters
    const amberGlow = trackMat(new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
    for (const side of [-1, 1] as const) {
      const node = new THREE.Mesh(trackGeo(makeBeveledBox(0.016, 0.024, 0.04, 0.003)), amberGlow);
      node.position.set(side * 0.128, 0.194, -0.055);
      headGroup.add(node);
    }
  } else if (faceId === 'tactical_warpaint') {
    // Spec-Ops Throat-Mic Earpiece + Acoustic Coil Tube along neck
    const earPod = new THREE.Mesh(trackGeo(makeBeveledBox(0.022, 0.042, 0.032, 0.005)), pouchMat);
    earPod.position.set(-0.128, 0.174, 0.006);
    headGroup.add(earPod);
    const boomCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.128, 0.158, -0.006),
      new THREE.Vector3(-0.105, 0.132, -0.095),
      new THREE.Vector3(-0.044, 0.13, -0.125),
    ]);
    headGroup.add(new THREE.Mesh(trackGeo(new THREE.TubeGeometry(boomCurve, 10, 0.0038, 6, false)), leatherMat));
  } else if (faceId === 'comms_headset') {
    // Standalone Peltor ComTac Active Headset (Padded Headband + Dual Earcups + Boom Mic) + Amber Ballistic Glasses
    const peltorMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x3b4232,
        normalMap: tex.polymerNormal,
        roughness: 0.56,
        metalness: 0.16,
      })
    );
    const bandArc = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.142, 0.013, 8, 24, Math.PI)),
      leatherMat
    );
    bandArc.position.set(0, 0.188, 0.008);
    headGroup.add(bandArc);
    for (const side of [-1, 1] as const) {
      const cup = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.036, 0.024, 8, 14)), peltorMat);
      cup.scale.set(0.68, 1.15, 0.94);
      cup.position.set(side * 0.142, 0.172, 0.008);
      headGroup.add(cup);
      const pad = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.034, 0.008, 6, 14)), leatherMat);
      pad.rotation.y = Math.PI / 2;
      pad.position.set(side * 0.124, 0.172, 0.008);
      headGroup.add(pad);
    }
    const boomCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.14, 0.15, -0.01),
      new THREE.Vector3(-0.118, 0.126, -0.102),
      new THREE.Vector3(-0.045, 0.124, -0.132),
    ]);
    headGroup.add(new THREE.Mesh(trackGeo(new THREE.TubeGeometry(boomCurve, 10, 0.0042, 6, false)), leatherMat));
    // Sleek Amber Ballistic Shooting Glasses
    const amberLensMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xf59e0b,
        emissive: 0xb45309,
        emissiveIntensity: 0.18,
        transparent: true,
        opacity: 0.62,
        roughness: 0.06,
        metalness: 0.18,
        clearcoat: 1.0,
      })
    );
    const amberShield = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.134, 0.134, 0.044, 22, 1, true, Math.PI * 0.72, Math.PI * 0.56)),
      amberLensMat
    );
    amberShield.position.set(0, 0.193, -0.012);
    headGroup.add(amberShield);
    const topBar = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.136, 0.136, 0.01, 20, 1, true, Math.PI * 0.68, Math.PI * 0.64)),
      leatherMat
    );
    topBar.position.set(0, 0.214, -0.012);
    headGroup.add(topBar);
  }

  // --- AAA MODULAR POLICE / SWAT / SPECIAL FORCES HEADGEAR ---
  if (headgearId === 'police_cap') {
    const capMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.navyRipstop,
        normalMap: tex.fabricNormal,
        color: 0xc2d2ec,
        roughness: 0.78,
        metalness: 0.06,
        sheen: 0.35,
      })
    );
    const band = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.136, 0.132, 0.056, 22)), leatherMat);
    band.position.set(0, 0.244, 0);
    headGroup.add(band);
    // Sculpted Octagonal Officer Crown flaring upward
    const crownPts = [
      new THREE.Vector2(0.135, 0.0),
      new THREE.Vector2(0.155, 0.045),
      new THREE.Vector2(0.148, 0.078),
      new THREE.Vector2(0.09, 0.088),
      new THREE.Vector2(0.0, 0.09),
    ];
    const crown = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(crownPts, 24)), capMat);
    crown.position.set(0, 0.256, 0.006);
    crown.rotation.x = -0.06;
    crown.userData = { playerId, hitZone: 'head' };
    headGroup.add(crown);
    hitMeshes.push(crown);
    // Curved Glossy Officer Visor Brim
    const brim = new THREE.Mesh(trackGeo(makeCapVisorGeo()), leatherMat);
    brim.position.set(0, 0.232, -0.092);
    brim.rotation.x = 0.18;
    headGroup.add(brim);
    // Golden Officer Chin Braid Cord & Sculpted Police Crest Shield
    const braid = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.134, 0.006, 8, 20, Math.PI)),
      goldMetal
    );
    braid.rotation.x = Math.PI / 2;
    braid.rotation.z = Math.PI;
    braid.position.set(0, 0.238, -0.005);
    headGroup.add(braid);
    const crest = new THREE.Mesh(
      trackGeo(makeShooterCutPlate(0.042, 0.048, 0.01, 0.0025)),
      goldMetal
    );
    crest.position.set(0, 0.295, -0.142);
    crest.rotation.x = -0.14;
    headGroup.add(crest);
  } else if (headgearId === 'riot_helmet') {
    const riotShellMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x151c28,
        roughness: 0.2,
        metalness: 0.34,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
      })
    );
    const dome = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.162, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.64)),
      riotShellMat
    );
    dome.position.set(0, 0.205, 0.006);
    dome.castShadow = true;
    dome.userData = { playerId, hitZone: 'head' };
    headGroup.add(dome);
    hitMeshes.push(dome);
    // Side Visor Pivot Ratchets + Rubber Rim Gasket
    for (const side of [-1, 1] as const) {
      const ratchet = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.018, 12)), leatherMat);
      ratchet.rotation.z = Math.PI / 2;
      ratchet.position.set(side * 0.158, 0.21, -0.01);
      headGroup.add(ratchet);
    }
    const clearVisorMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xbde2ff,
        roughness: 0.06,
        metalness: 0.1,
        transparent: true,
        opacity: 0.38,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        depthWrite: false,
      })
    );
    const shield = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.166, 0.16, 0.15, 24, 1, true, Math.PI * 0.64, Math.PI * 0.72)),
      clearVisorMat
    );
    shield.position.set(0, 0.175, -0.006);
    headGroup.add(shield);
    const gasket = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.17, 0.17, 0.022, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76)),
      leatherMat
    );
    gasket.position.set(0, 0.252, -0.006);
    headGroup.add(gasket);
  } else if (headgearId === 'fast_nvg') {
    // Ops-Core FAST High-Cut Ballistic Helmet + ARC Rails + Peltor ComTac Headset + 4-Tube GPNVG-18!
    const helmetMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.gunmetal,
        normalMap: tex.polymerNormal,
        normalScale: new THREE.Vector2(0.45, 0.45),
        color: 0x2e3540,
        roughness: 0.48,
        metalness: 0.22,
      })
    );
    const dome = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.158, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.56)),
      helmetMat
    );
    dome.scale.set(0.98, 1.04, 1.05);
    dome.position.set(0, 0.205, 0.008);
    dome.castShadow = true;
    dome.userData = { playerId, hitZone: 'head' };
    headGroup.add(dome);
    hitMeshes.push(dome);
    // Side ARC Accessory Rails + Peltor ComTac Active Earcups + Boom Mic
    for (const side of [-1, 1] as const) {
      const rail = new THREE.Mesh(trackGeo(makeBeveledBox(0.018, 0.036, 0.13, 0.003)), leatherMat);
      rail.position.set(side * 0.154, 0.22, -0.008);
      headGroup.add(rail);
      const earCup = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.036, 0.022, 6, 12)), pouchMat);
      earCup.scale.set(0.68, 1.15, 0.92);
      earCup.position.set(side * 0.145, 0.168, 0.006);
      headGroup.add(earCup);
    }
    const boomCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.142, 0.15, -0.01),
      new THREE.Vector3(-0.12, 0.125, -0.105),
      new THREE.Vector3(-0.048, 0.122, -0.135),
    ]);
    headGroup.add(new THREE.Mesh(trackGeo(new THREE.TubeGeometry(boomCurve, 10, 0.0045, 6, false)), leatherMat));
    // Wilcox Metal Shroud + Articulated Mount Arm + 4-Tube GPNVG-18 Panoramic NVG
    const shroud = new THREE.Mesh(trackGeo(makeBeveledBox(0.064, 0.062, 0.03, 0.005)), gunDarkMat);
    shroud.position.set(0, 0.272, -0.148);
    headGroup.add(shroud);
    const nvgBridge = new THREE.Mesh(trackGeo(makeBeveledBox(0.195, 0.028, 0.042, 0.004)), gunAccentMat);
    nvgBridge.position.set(0, 0.268, -0.195);
    headGroup.add(nvgBridge);
    const nvgGlow = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        emissive: 0x10b981,
        emissiveIntensity: 0.75,
        roughness: 0.08,
        metalness: 0.6,
        clearcoat: 1.0,
      })
    );
    for (const [ox, ang] of [
      [-0.078, 0.16],
      [-0.028, 0.03],
      [0.028, -0.03],
      [0.078, -0.16],
    ]) {
      const tube = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.017, 0.019, 0.088, 14)), gunAccentMat);
      tube.rotation.x = Math.PI / 2;
      tube.rotation.z = ang;
      tube.position.set(ox, 0.266, -0.222);
      headGroup.add(tube);
      const lens = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 12)), nvgGlow);
      lens.rotation.x = Math.PI / 2;
      lens.rotation.z = ang;
      lens.position.set(ox - Math.sin(ang) * 0.008, 0.266, -0.267);
      headGroup.add(lens);
    }
    // Rear Battery Counterweight Pack + IR Strobe
    const counterWt = new THREE.Mesh(trackGeo(makeBeveledBox(0.09, 0.056, 0.036, 0.005)), pouchMat);
    counterWt.position.set(0, 0.218, 0.168);
    headGroup.add(counterWt);
  } else if (headgearId === 'beret_navy' || headgearId === 'beret_red') {
    const beretMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        normalMap: tex.fabricNormal,
        normalScale: new THREE.Vector2(0.85, 0.85),
        color: headgearId === 'beret_red' ? 0x9e1b20 : 0x1a2a47,
        roughness: 0.92,
        metalness: 0.02,
        sheen: 0.65,
        sheenColor: new THREE.Color(headgearId === 'beret_red' ? 0xdc4a50 : 0x3b598a),
      })
    );
    const beretBand = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.132, 0.13, 0.022, 22)), leatherMat);
    beretBand.position.set(0, 0.242, 0);
    headGroup.add(beretBand);
    const beretBody = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.156, 24, 16)), beretMat);
    beretBody.scale.set(1.16, 0.44, 1.06);
    beretBody.position.set(-0.032, 0.288, 0.006);
    beretBody.rotation.z = 0.28;
    beretBody.userData = { playerId, hitZone: 'head' };
    headGroup.add(beretBody);
    hitMeshes.push(beretBody);
    const badge = new THREE.Mesh(
      trackGeo(makeShooterCutPlate(0.038, 0.044, 0.009, 0.002)),
      headgearId === 'beret_red' ? goldMetal : silverMetal
    );
    badge.position.set(0.055, 0.278, -0.132);
    headGroup.add(badge);
  } else if (headgearId === 'boonie_hat') {
    // Organic Draped Tactical Boonie Hat (Natural Cloth Wave Brim + Stitched Foliage Loops + Chin Cord!)
    const boonieMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.desertCamo,
        normalMap: tex.fabricNormal,
        normalScale: new THREE.Vector2(1.0, 1.0),
        roughnessMap: tex.fabricRough,
        color: 0xc2b494,
        roughness: 1.0,
        metalness: 0.02,
        sheen: 0.45,
        side: THREE.DoubleSide,
      })
    );
    const crownPts = [
      new THREE.Vector2(0.138, 0),
      new THREE.Vector2(0.134, 0.065),
      new THREE.Vector2(0.122, 0.102),
      new THREE.Vector2(0.08, 0.112),
      new THREE.Vector2(0.0, 0.11),
    ];
    const crown = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(crownPts, 24)), boonieMat);
    crown.position.set(0, 0.23, 0);
    crown.userData = { playerId, hitZone: 'head' };
    headGroup.add(crown);
    hitMeshes.push(crown);

    // Organic Wavy Cloth Brim
    const brim = new THREE.Mesh(trackGeo(makeDrapedBoonieBrimGeo()), boonieMat);
    brim.position.set(0, 0.236, 0);
    headGroup.add(brim);

    // Stitched Foliage Webbing Band + Brass Vent Grommets
    const band = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.138, 0.141, 0.024, 24)), pouchMat);
    band.position.set(0, 0.258, 0);
    headGroup.add(band);

    // Chin Retention Cord
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.115, 0.228, -0.02),
      new THREE.Vector3(-0.085, 0.115, -0.075),
      new THREE.Vector3(0, 0.07, -0.095),
      new THREE.Vector3(0.085, 0.115, -0.075),
      new THREE.Vector3(0.115, 0.228, -0.02),
    ]);
    headGroup.add(new THREE.Mesh(trackGeo(new THREE.TubeGeometry(cordCurve, 16, 0.004, 6, false)), leatherMat));
  } else if (headgearId === 'altyn_visor') {
    // ICONIC ALTYN K6-3 HEAVY TITANIUM BALLISTIC HELMET WITH STEEL ARMORED FACEPLATE & EYE SLIT!
    const altynMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.gunmetal,
        normalMap: tex.gunmetalNormal,
        normalScale: new THREE.Vector2(0.55, 0.55),
        color: 0x4b5a4d,
        roughness: 0.42,
        metalness: 0.62,
        clearcoat: 0.25,
      })
    );
    const dome = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.168, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.66)),
      altynMat
    );
    dome.position.set(0, 0.205, 0.006);
    dome.castShadow = true;
    dome.userData = { playerId, hitZone: 'head' };
    headGroup.add(dome);
    hitMeshes.push(dome);

    // Heavy Flip-Down Titanium Face Shield (Upper Brow + Lower Chin Plate leaving armored eye slit)
    const upperShield = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.175, 0.176, 0.058, 24, 1, true, Math.PI * 0.64, Math.PI * 0.72)),
      altynMat
    );
    upperShield.position.set(0, 0.236, -0.006);
    headGroup.add(upperShield);
    const lowerShield = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.175, 0.166, 0.105, 24, 1, true, Math.PI * 0.64, Math.PI * 0.72)),
      altynMat
    );
    lowerShield.position.set(0, 0.125, -0.006);
    headGroup.add(lowerShield);
    // Thick Armored Ballistic Glass Eye Slit
    const slitGlass = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.172, 0.172, 0.036, 22, 1, true, Math.PI * 0.72, Math.PI * 0.56)),
      trackMat(
        new THREE.MeshPhysicalMaterial({
          color: 0x1e293b,
          metalness: 0.92,
          roughness: 0.08,
          clearcoat: 1.0,
        })
      )
    );
    slitGlass.position.set(0, 0.194, -0.006);
    headGroup.add(slitGlass);
    // Side Pivot Bolts & Radio Comm Pod
    for (const side of [-1, 1] as const) {
      const bolt = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.022, 12)), gunDarkMat);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(side * 0.168, 0.202, -0.005);
      headGroup.add(bolt);
    }
  } else if (headgearId === 'ghillie_hood') {
    // Draped Sniper Recon Ghillie Hood Cowl + Tactical Comms Headset
    const hoodMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.jungleTiger,
        normalMap: tex.fabricNormal,
        normalScale: new THREE.Vector2(1.0, 1.0),
        color: 0xc2d8b6,
        roughness: 0.92,
        metalness: 0.02,
        sheen: 0.55,
        side: THREE.DoubleSide,
      })
    );
    const cowl = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.168, 22, 16, -Math.PI * 0.25, Math.PI * 1.5, 0, Math.PI * 0.85)),
      hoodMat
    );
    cowl.rotation.y = Math.PI / 2;
    cowl.position.set(0, 0.195, 0.015);
    cowl.userData = { playerId, hitZone: 'head' };
    headGroup.add(cowl);
    hitMeshes.push(cowl);
    // Extended Front Sniper Hood Peak shading the eyes
    const hoodPeak = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.155, 0.168, 0.065, 20, 1, true, Math.PI * 0.68, Math.PI * 0.64)),
      hoodMat
    );
    hoodPeak.position.set(0, 0.268, -0.022);
    hoodPeak.rotation.x = 0.22;
    headGroup.add(hoodPeak);
    // Layered Camouflage Foliage Strips draped over crown
    for (const [fx, fy, fz] of [
      [-0.08, 0.34, 0.02],
      [0.07, 0.345, -0.02],
      [0, 0.33, 0.1],
      [-0.12, 0.25, 0.08],
      [0.12, 0.25, 0.08],
    ]) {
      const strip = new THREE.Mesh(trackGeo(makeBeveledBox(0.075, 0.032, 0.068, 0.008)), hoodMat);
      strip.position.set(fx, fy, fz);
      headGroup.add(strip);
    }
  } else if (headgearId === 'commander_cap') {
    // Police Commander Ceremonial/Tactical Peaked Cap with Golden Oak-Leaf Laurel Visor & Tall Crown!
    const cmdMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.commanderCharcoal,
        normalMap: tex.fabricNormal,
        color: 0xd0d8e8,
        roughness: 0.72,
        metalness: 0.08,
        sheen: 0.45,
      })
    );
    const band = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.138, 0.134, 0.058, 24)), leatherMat);
    band.position.set(0, 0.244, 0);
    headGroup.add(band);
    const crownPts = [
      new THREE.Vector2(0.138, 0.0),
      new THREE.Vector2(0.175, 0.058),
      new THREE.Vector2(0.168, 0.095),
      new THREE.Vector2(0.1, 0.105),
      new THREE.Vector2(0.0, 0.106),
    ];
    const crown = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(crownPts, 24)), cmdMat);
    crown.position.set(0, 0.258, 0.006);
    crown.rotation.x = -0.08;
    crown.userData = { playerId, hitZone: 'head' };
    headGroup.add(crown);
    hitMeshes.push(crown);
    // Glossy Black Visor + Twin Golden Laurel Scrambled-Eggs Arcs!
    const brim = new THREE.Mesh(trackGeo(makeCapVisorGeo()), leatherMat);
    brim.position.set(0, 0.232, -0.096);
    brim.rotation.x = 0.2;
    headGroup.add(brim);
    const goldLaurel = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.102, 0.007, 8, 18, Math.PI * 0.75)),
      goldMetal
    );
    goldLaurel.rotation.x = Math.PI / 2 + 0.2;
    goldLaurel.rotation.z = Math.PI * 1.12;
    goldLaurel.position.set(0, 0.228, -0.105);
    headGroup.add(goldLaurel);
    const braid = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.138, 0.0075, 8, 22, Math.PI)),
      goldMetal
    );
    braid.rotation.x = Math.PI / 2;
    braid.rotation.z = Math.PI;
    braid.position.set(0, 0.24, -0.006);
    headGroup.add(braid);
    // Tall Golden Commander Crest Emblem
    const crest = new THREE.Mesh(
      trackGeo(makeShooterCutPlate(0.052, 0.058, 0.012, 0.003)),
      goldMetal
    );
    crest.position.set(0, 0.305, -0.155);
    crest.rotation.x = -0.16;
    headGroup.add(crest);
  }

  // --- 4. ARTICULATED SHOULDER ARMS, TACTICAL ELBOW GUARDS, SCULPTED FINGERED GLOVES, WRISTWATCH & 2-POINT RIFLE SLING ---
  const makeGlovedHand = (isLeft: boolean) => {
    const handGroup = new THREE.Group();
    const s = isLeft ? 1 : -1;
    // Contoured Tactical Glove Palm
    const palm = new THREE.Mesh(trackGeo(makeBeveledBox(0.058, 0.052, 0.072, 0.012, 2)), gloveMat);
    handGroup.add(palm);
    // Molded Carbon-Fiber Knuckle Guard across back of hand
    const knuck = new THREE.Mesh(trackGeo(makeBeveledBox(0.052, 0.014, 0.032, 0.004)), carbonKnuckleMat);
    knuck.position.set(0, 0.024, -0.008);
    handGroup.add(knuck);
    // Velcro Tactical Wrist Cuff Strap
    const cuff = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.036, 0.038, 0.028, 12)), leatherMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -0.002, 0.042);
    handGroup.add(cuff);
    // 4 Sculpted Curled Fingers gripping the weapon rail/pistol grip
    for (let f = 0; f < 4; f++) {
      const fx = -0.02 + f * 0.0135;
      const finger = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.0075, 0.028, 4, 8)), gloveMat);
      finger.position.set(fx, -0.018, -0.036);
      finger.rotation.x = 0.72;
      handGroup.add(finger);
    }
    // Articulated Opposable Thumb wrapping around handguard/grip
    const thumb = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.0085, 0.028, 4, 8)), gloveMat);
    thumb.position.set(s * -0.032, 0.006, -0.018);
    thumb.rotation.set(0.85, 0, s * 0.65);
    handGroup.add(thumb);
    return handGroup;
  };

  // Left Articulated Arm (pivoted cleanly at Left Shoulder)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.245, 0.5, -0.01);
  upperBody.add(leftArm);

  const leftUpper = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.056, 0.215, 8, 16)), shirtMat);
  leftUpper.position.set(-0.008, -0.1, -0.08);
  leftUpper.rotation.set(1.06, 0, -0.34);
  leftUpper.castShadow = true;
  leftArm.add(leftUpper);

  const leftElbow = new THREE.Mesh(trackGeo(makeBeveledBox(0.086, 0.082, 0.068, 0.024, 3)), leatherMat);
  leftElbow.position.set(0.02, -0.18, -0.19);
  leftArm.add(leftElbow);

  const leftFore = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.046, 0.195, 8, 16)), shirtMat);
  leftFore.position.set(0.12, -0.155, -0.3);
  leftFore.rotation.set(1.42, 0, -0.62);
  leftFore.castShadow = true;
  leftArm.add(leftFore);

  // Glowing Tactical Digital Wristwatch on Left Wrist (Suunto / Garmin Foretrex Style!)
  const watchBand = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.044, 0.009, 6, 16)), leatherMat);
  watchBand.position.set(0.215, -0.152, -0.388);
  watchBand.rotation.set(0.25, -0.62, 0);
  leftArm.add(watchBand);
  const watchBezel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.021, 0.022, 0.012, 14)), gunDarkMat);
  watchBezel.position.set(0.215, -0.112, -0.388);
  leftArm.add(watchBezel);
  const watchFace = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.017, 14)),
    trackMat(
      new THREE.MeshBasicMaterial({
        map: tex.watchDial,
      })
    )
  );
  watchFace.rotation.x = -Math.PI / 2;
  watchFace.position.set(0.215, -0.105, -0.388);
  leftArm.add(watchFace);

  const leftHand = makeGlovedHand(true);
  leftHand.position.set(0.28, -0.15, -0.445);
  leftHand.rotation.y = -0.35;
  leftArm.add(leftHand);

  // Right Articulated Arm (pivoted cleanly at Right Shoulder)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.245, 0.5, -0.01);
  upperBody.add(rightArm);

  const rightUpper = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.056, 0.215, 8, 16)), shirtMat);
  rightUpper.position.set(0.004, -0.11, -0.07);
  rightUpper.rotation.set(1.12, 0, 0.22);
  rightUpper.castShadow = true;
  rightArm.add(rightUpper);

  const rightElbow = new THREE.Mesh(trackGeo(makeBeveledBox(0.086, 0.082, 0.068, 0.024, 3)), leatherMat);
  rightElbow.position.set(-0.013, -0.18, -0.18);
  rightArm.add(rightElbow);

  const rightFore = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.046, 0.195, 8, 16)), shirtMat);
  rightFore.position.set(-0.06, -0.155, -0.26);
  rightFore.rotation.set(1.48, 0, 0.22);
  rightFore.castShadow = true;
  rightArm.add(rightFore);

  const rightHand = makeGlovedHand(false);
  rightHand.position.set(-0.11, -0.155, -0.36);
  rightArm.add(rightHand);

  // Curved 2-Point Tactical Rifle Sling draped across left chest/shoulder down to rifle receiver!
  const slingCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.135, 0.565, 0.05),
    new THREE.Vector3(-0.15, 0.555, -0.145),
    new THREE.Vector3(-0.075, 0.44, -0.22),
    new THREE.Vector3(0.045, 0.365, -0.33),
    new THREE.Vector3(0.098, 0.355, -0.43),
  ]);
  const rifleSling = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(slingCurve, 18, 0.014, 8, false)),
    pouchMat
  );
  rifleSling.scale.set(1.35, 0.55, 1);
  upperBody.add(rifleSling);

  // --- 5. HIGH-DEF MULTI-PART 3RD-PERSON SKINNED WEAPON ---
  const weaponMount = new THREE.Group();
  const weaponRestPos = new THREE.Vector3(0.115, 0.365, -0.47);
  weaponMount.position.copy(weaponRestPos);
  upperBody.add(weaponMount);

  const muzzleFlash = new THREE.Mesh(
    trackGeo(new THREE.OctahedronGeometry(0.12, 0)),
    trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffd278,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      })
    )
  );
  muzzleFlash.visible = false;
  weaponMount.add(muzzleFlash);

  let currentWeaponVisual: WeaponId | null = null;
  let weaponPartsGroup: THREE.Group | null = null;
  let flashTimer = 0;
  let recoilKick = 0;

  const setWeaponVisual = (wId: WeaponId) => {
    if (currentWeaponVisual === wId) return;
    currentWeaponVisual = wId;
    if (weaponPartsGroup) {
      weaponMount.remove(weaponPartsGroup);
    }
    const wg = new THREE.Group();
    const addPart = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
      const m = new THREE.Mesh(trackGeo(geo), mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = true;
      wg.add(m);
      return m;
    };

    if (wId === 'psg1') {
      addPart(makeBeveledBox(0.058, 0.08, 0.36, 0.006), gunMat, 0, 0, 0.04);
      addPart(makeBeveledBox(0.048, 0.054, 0.32, 0.006), pouchMat, 0, 0, -0.26);
      addPart(new THREE.CylinderGeometry(0.015, 0.018, 0.44, 14), gunDarkMat, 0, 0.012, -0.56, Math.PI / 2);
      addPart(makeBeveledBox(0.032, 0.026, 0.07, 0.003), gunDarkMat, 0, 0.012, -0.78);
      // Stepped Sniper Scope
      addPart(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 14), gunDarkMat, 0, 0.088, -0.02, Math.PI / 2);
      addPart(new THREE.CylinderGeometry(0.03, 0.022, 0.09, 14), gunMat, 0, 0.088, -0.23, Math.PI / 2);
      addPart(makeBeveledBox(0.044, 0.095, 0.22, 0.006), pouchMat, 0, -0.012, 0.28);
      addPart(makeBeveledBox(0.032, 0.11, 0.068, 0.004), gunDarkMat, 0, -0.075, -0.04);
      muzzleFlash.position.set(0, 0.012, -0.84);
    } else if (wId === 'ak74') {
      const akWood = loadout.weaponSkinId === 'standard' ? woodGunMat : gunMat;
      addPart(makeBeveledBox(0.054, 0.07, 0.3, 0.005), gunMat, 0, 0, 0.02);
      addPart(makeBeveledBox(0.056, 0.05, 0.24, 0.006), akWood, 0, -0.002, -0.24);
      addPart(new THREE.CylinderGeometry(0.013, 0.014, 0.32, 12), gunDarkMat, 0, 0.01, -0.46, Math.PI / 2);
      addPart(makeCurvedMagGeo(0.03, 0.2, 0.064, -0.064), loadout.weaponSkinId === 'standard' ? woodGunMat : gunAccentMat, 0, -0.035, -0.05);
      addPart(makeBeveledBox(0.044, 0.088, 0.22, 0.006), akWood, 0, -0.025, 0.24, -0.08);
      addPart(makeBeveledBox(0.032, 0.095, 0.044, 0.004), pouchMat, 0, -0.075, 0.11, -0.24);
      muzzleFlash.position.set(0, 0.01, -0.64);
    } else if (wId === 'm870') {
      addPart(makeBeveledBox(0.062, 0.084, 0.3, 0.006), gunMat, 0, 0.005, 0.06);
      addPart(new THREE.CylinderGeometry(0.018, 0.019, 0.64, 14), gunMat, 0, 0.025, -0.34, Math.PI / 2);
      addPart(new THREE.CylinderGeometry(0.016, 0.016, 0.56, 12), gunDarkMat, 0, -0.014, -0.3, Math.PI / 2);
      addPart(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 14), pouchMat, 0, -0.016, -0.24, Math.PI / 2);
      addPart(makeBeveledBox(0.046, 0.088, 0.22, 0.006), pouchMat, 0, -0.025, 0.28, -0.08);
      muzzleFlash.position.set(0, 0.025, -0.68);
    } else if (wId === 'deagle') {
      addPart(makeBeveledBox(0.044, 0.05, 0.26, 0.005), gunMat, 0, 0.02, 0.02);
      addPart(makeBeveledBox(0.036, 0.11, 0.052, 0.005), pouchMat, 0, -0.068, 0.1, -0.22);
      muzzleFlash.position.set(0, 0.02, -0.14);
    } else if (wId === 'knife') {
      addPart(makeBeveledBox(0.026, 0.032, 0.12, 0.005), pouchMat, 0, 0, 0.1);
      addPart(makeBeveledBox(0.012, 0.036, 0.22, 0.002), silverMetal, 0, 0.01, -0.06);
      muzzleFlash.position.set(0, 0, -0.16);
    } else if (wId === 'mp5') {
      addPart(makeBeveledBox(0.05, 0.068, 0.26, 0.005), gunMat, 0, 0, 0.02);
      addPart(makeBeveledBox(0.048, 0.054, 0.18, 0.006), pouchMat, 0, -0.004, -0.18);
      addPart(new THREE.CylinderGeometry(0.021, 0.021, 0.25, 14), pouchMat, 0, 0.012, -0.38, Math.PI / 2);
      addPart(new THREE.CylinderGeometry(0.02, 0.02, 0.075, 14), gunDarkMat, 0, 0.065, 0.02, Math.PI / 2);
      addPart(makeCurvedMagGeo(0.024, 0.17, 0.04, -0.04), gunDarkMat, 0, -0.036, -0.06);
      addPart(makeBeveledBox(0.034, 0.09, 0.044, 0.004), pouchMat, 0, -0.07, 0.11, -0.2);
      muzzleFlash.position.set(0, 0.012, -0.52);
    } else if (wId === 'scar') {
      // FN SCAR-H 3rd-Person Monolithic Heavy Rifle
      const scarBody = loadout.weaponSkinId === 'standard' ? gunAccentMat : gunMat;
      addPart(makeBeveledBox(0.058, 0.074, 0.44, 0.006), scarBody, 0, 0.01, -0.12);
      addPart(new THREE.CylinderGeometry(0.014, 0.015, 0.26, 12), gunDarkMat, 0, 0.014, -0.45, Math.PI / 2);
      addPart(makeBeveledBox(0.028, 0.024, 0.06, 0.003), gunDarkMat, 0, 0.014, -0.58);
      addPart(makeHoloHoodGeo(0.048, 0.044, 0.006, 0.06), gunDarkMat, 0, 0.074, -0.02);
      addPart(makeBeveledBox(0.032, 0.14, 0.068, 0.004), scarBody, 0, -0.085, -0.06);
      addPart(makeBeveledBox(0.034, 0.095, 0.046, 0.005), pouchMat, 0, -0.072, 0.11, -0.24);
      addPart(makeBeveledBox(0.046, 0.095, 0.19, 0.006), scarBody, 0, -0.006, 0.24);
      muzzleFlash.position.set(0, 0.014, -0.64);
    } else if (wId === 'awp') {
      // AWM .338 Magnum 3rd-Person Heavy Bolt Sniper
      const awmBody = loadout.weaponSkinId === 'standard' ? pouchMat : gunMat;
      addPart(makeBeveledBox(0.056, 0.074, 0.5, 0.006), awmBody, 0, -0.004, -0.06);
      addPart(new THREE.CylinderGeometry(0.016, 0.019, 0.52, 14), gunDarkMat, 0, 0.024, -0.56, Math.PI / 2);
      addPart(makeBeveledBox(0.036, 0.028, 0.082, 0.003), gunDarkMat, 0, 0.024, -0.84);
      // High-Power Scope + Sunshade
      addPart(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 14), gunDarkMat, 0, 0.09, -0.04, Math.PI / 2);
      addPart(new THREE.CylinderGeometry(0.034, 0.022, 0.1, 14), gunMat, 0, 0.09, -0.26, Math.PI / 2);
      // Bolt knob sticking right + Thumbhole buttstock
      addPart(new THREE.SphereGeometry(0.016, 10, 10), silverMetal, 0.048, 0.016, 0.06);
      addPart(makeBeveledBox(0.046, 0.095, 0.22, 0.006), awmBody, 0, -0.014, 0.28);
      addPart(makeBeveledBox(0.032, 0.095, 0.078, 0.004), gunDarkMat, 0, -0.072, -0.05);
      muzzleFlash.position.set(0, 0.024, -0.9);
    } else if (wId === 'p90') {
      // FN P90 3rd-Person Bullpup PDW with Top Translucent Magazine
      addPart(makeBeveledBox(0.054, 0.11, 0.34, 0.008), gunMat, 0, -0.012, 0.06);
      addPart(makeBeveledBox(0.048, 0.075, 0.16, 0.007), pouchMat, 0, -0.028, -0.17);
      addPart(makeBeveledBox(0.046, 0.028, 0.24, 0.004), gunAccentMat, 0, 0.052, 0.01);
      addPart(makeHoloHoodGeo(0.042, 0.038, 0.005, 0.05), gunDarkMat, 0, 0.072, -0.15);
      addPart(new THREE.CylinderGeometry(0.014, 0.015, 0.1, 12), gunDarkMat, 0, 0.006, -0.28, Math.PI / 2);
      muzzleFlash.position.set(0, 0.006, -0.36);
    } else {
      // M4A1 Tactical SOPMOD 3rd-Person Rifle
      addPart(makeBeveledBox(0.056, 0.072, 0.28, 0.006), gunMat, 0, 0.004, 0.02);
      addPart(new THREE.CylinderGeometry(0.029, 0.03, 0.28, 8), gunDarkMat, 0, 0.01, -0.25, Math.PI / 2);
      addPart(makeBeveledBox(0.054, 0.02, 0.21, 0.003), gunAccentMat, 0, 0.01, -0.25);
      addPart(new THREE.CylinderGeometry(0.012, 0.013, 0.26, 12), gunDarkMat, 0, 0.012, -0.49, Math.PI / 2);
      // Holo sight on rail
      addPart(makeHoloHoodGeo(0.048, 0.044, 0.006, 0.062), gunDarkMat, 0, 0.068, 0.02);
      // Curved PMAG
      addPart(makeCurvedMagGeo(0.03, 0.16, 0.062, -0.032), gunDarkMat, 0, -0.038, -0.04);
      // Pistol grip + CTR Stock
      addPart(makeBeveledBox(0.032, 0.1, 0.046, 0.005), pouchMat, 0, -0.072, 0.11, -0.24);
      addPart(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 12), gunDarkMat, 0, 0.01, 0.22, Math.PI / 2);
      addPart(makeBeveledBox(0.046, 0.095, 0.16, 0.006), gunAccentMat, 0, -0.012, 0.28);
      muzzleFlash.position.set(0, 0.012, -0.64);
    }

    weaponPartsGroup = wg;
    weaponMount.add(wg);
  };

  setWeaponVisual('m4a1');

  const labelSprite = createNameplateSprite(name, team, isAlly, rankShort);
  labelSprite.visible = showNameplate;
  root.add(labelSprite);

  return {
    root,
    bodyPivot,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    upperBody,
    leftArm,
    rightArm,
    headGroup,
    weaponMount,
    muzzleFlash,
    hitMeshes,
    labelSprite,
    setWeaponVisual,
    triggerMuzzleFlash: () => {
      flashTimer = 0.065;
      recoilKick = 1.0;
      muzzleFlash.visible = true;
      muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    },
    updateMuzzleFlash: (dt: number) => {
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) muzzleFlash.visible = false;
      }
      if (recoilKick > 0.001) {
        recoilKick = Math.max(0, recoilKick - dt * 7.5);
        weaponMount.position.z = weaponRestPos.z + recoilKick * 0.065;
        weaponMount.rotation.x = recoilKick * 0.14;
        rightArm.rotation.x = recoilKick * 0.12;
        leftArm.rotation.x = recoilKick * 0.09;
      } else if (recoilKick !== 0) {
        recoilKick = 0;
        weaponMount.position.z = weaponRestPos.z;
        weaponMount.rotation.x = 0;
        rightArm.rotation.x = 0;
        leftArm.rotation.x = 0;
      }
    },
    dispose: () => {
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      (labelSprite.material as THREE.SpriteMaterial).map?.dispose();
      labelSprite.material.dispose();
    },
  };
}

/**
 * Builds glowing composite 3D Medkit & Ammo Supply Crates with chamfered corners & latches.
 */
export function buildSupplyCrateMesh(kind: 'medkit' | 'ammo'): THREE.Group {
  const g = new THREE.Group();
  const isMed = kind === 'medkit';

  const baseMat = new THREE.MeshPhysicalMaterial({
    color: isMed ? 0xeef2f6 : 0x425138,
    roughness: 0.42,
    metalness: 0.28,
    clearcoat: 0.25,
  });
  const latchMat = new THREE.MeshStandardMaterial({
    color: 0x1e242c,
    roughness: 0.35,
    metalness: 0.8,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: isMed ? 0xef4444 : 0xf59e0b,
    emissive: isMed ? 0xef4444 : 0xf59e0b,
    emissiveIntensity: 0.58,
    roughness: 0.3,
    metalness: 0.2,
  });

  const box = new THREE.Mesh(makeBeveledBox(0.74, 0.44, 0.52, 0.025, 2), baseMat);
  box.position.y = 0.34;
  box.castShadow = true;
  g.add(box);

  for (const lx of [-0.22, 0.22]) {
    const latch = new THREE.Mesh(makeBeveledBox(0.06, 0.14, 0.04, 0.006), latchMat);
    latch.position.set(lx, 0.44, 0.26);
    g.add(latch);
  }

  if (isMed) {
    const crossH = new THREE.Mesh(makeBeveledBox(0.28, 0.04, 0.09, 0.005), accentMat);
    crossH.position.set(0, 0.57, 0);
    g.add(crossH);
    const crossV = new THREE.Mesh(makeBeveledBox(0.09, 0.04, 0.28, 0.005), accentMat);
    crossV.position.set(0, 0.57, 0);
    g.add(crossV);
  } else {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.075, 0.53), accentMat);
    stripe.position.set(0, 0.46, 0);
    g.add(stripe);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.46, 0.62, 24),
    new THREE.MeshBasicMaterial({
      color: isMed ? 0x22c55e : 0xf59e0b,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);

  return g;
}

/**
 * Adds composite 3D environmental realism props:
 * - Crossroad: Sculpted SWAT Armored BearCat Van w/ bull-bar, sloped armor & Red/Blue Lightbar
 * - Desert Camp: Multi-frond curved Desert Palms, Comms Radar Dish, watchtower canopies, ribbed fuel barrels
 * - Warehouse: Overhead Gantry Crane, High-Bay Spotlight Fixtures, tactical barricade cones
 */
export function buildMapArchitecturalDetails(mapId: MapId): THREE.Group {
  const details = new THREE.Group();
  const tex = getWeaponTextureSet();

  const darkSteel = new THREE.MeshStandardMaterial({
    map: tex.gunmetal,
    normalMap: tex.gunmetalNormal,
    color: 0x3b434f,
    metalness: 0.82,
    roughness: 0.34,
  });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.05, roughness: 0.92 });
  const swatVanMat = new THREE.MeshPhysicalMaterial({
    color: 0x142238,
    normalMap: tex.gunmetalNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    metalness: 0.48,
    roughness: 0.3,
    clearcoat: 0.6,
  });
  const glassDark = new THREE.MeshPhysicalMaterial({
    color: 0x132030,
    metalness: 0.92,
    roughness: 0.08,
    clearcoat: 1.0,
  });
  const canvasTarp = new THREE.MeshPhysicalMaterial({
    map: tex.desertCamo,
    normalMap: tex.fabricNormal,
    color: 0xb0966e,
    roughness: 0.92,
    metalness: 0.02,
    sheen: 0.3,
    side: THREE.DoubleSide,
  });
  const drumRed = new THREE.MeshPhysicalMaterial({
    color: 0x992b24,
    normalMap: tex.gunmetalNormal,
    metalness: 0.56,
    roughness: 0.44,
    clearcoat: 0.2,
  });
  const drumOlive = new THREE.MeshPhysicalMaterial({
    color: 0x3e4f36,
    normalMap: tex.gunmetalNormal,
    metalness: 0.48,
    roughness: 0.48,
  });
  const warmWindow = new THREE.MeshBasicMaterial({ color: 0xffc875 });
  const coneOrange = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.52, metalness: 0.05 });
  const coneWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 });

  const addBarrelCluster = (x: number, z: number) => {
    const offsets: Array<[number, number, THREE.Material]> = [
      [0, 0, drumRed],
      [0.62, 0.25, drumOlive],
      [0.24, -0.58, drumOlive],
    ];
    for (const [ox, oz, mat] of offsets) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.92, 16), mat);
      barrel.position.set(x + ox, 0.46, z + oz);
      barrel.castShadow = true;
      details.add(barrel);
      // Barrel reinforcing steel ribs
      for (const ry of [0.28, 0.64]) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.016, 6, 16), darkSteel);
        rib.rotation.x = Math.PI / 2;
        rib.position.set(x + ox, ry, z + oz);
        details.add(rib);
      }
    }
  };

  const addTrafficCone = (x: number, z: number) => {
    const base = new THREE.Mesh(makeBeveledBox(0.42, 0.06, 0.42, 0.01), coneOrange);
    base.position.set(x, 0.03, z);
    details.add(base);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 14), coneOrange);
    cone.position.set(x, 0.34, z);
    details.add(cone);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.14, 14), coneWhite);
    stripe.position.set(x, 0.38, z);
    details.add(stripe);
  };

  if (mapId === 'desert_camp') {
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xd6d3cd, roughness: 0.42, metalness: 0.56 });
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
        details.add(post);
      }
      const roof = new THREE.Mesh(makeBeveledBox(4.8, 0.24, 4.8, 0.04), canvasTarp);
      roof.position.set(wx, 10.3, wz);
      details.add(roof);
      const dishPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 10), darkSteel);
      dishPole.position.set(wx + 1.4, 11.8, wz + 1.4);
      details.add(dishPole);
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.88, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.38),
        dishMat
      );
      dish.position.set(wx + 1.4, 12.6, wz + 1.4);
      dish.rotation.x = Math.PI * 0.65;
      details.add(dish);
    }

    // Realistic Curved Desert Palm Trees around outer compound perimeter
    const trunkMat = new THREE.MeshStandardMaterial({
      map: tex.woodGrain,
      normalMap: tex.woodNormal,
      color: 0x7b6144,
      roughness: 0.92,
    });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x3e5c2c, roughness: 0.82, side: THREE.DoubleSide });
    for (const [tx, tz] of [
      [-37, -14],
      [-36, 16],
      [37, -15],
      [36, 14],
      [-12, -33],
      [14, 33],
    ]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 9.4, 10), trunkMat);
      trunk.position.set(tx, 4.7, tz);
      details.add(trunk);
      for (let f = 0; f < 8; f++) {
        const ang = (f / 8) * Math.PI * 2;
        const frondGeo = new THREE.PlaneGeometry(0.95, 3.9, 1, 5);
        const fPos = frondGeo.attributes.position;
        for (let vi = 0; vi < fPos.count; vi++) {
          const y = fPos.getY(vi);
          const t = (y + 1.95) / 3.9;
          fPos.setZ(vi, -t * t * 1.1);
        }
        frondGeo.computeVertexNormals();
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.set(tx + Math.sin(ang) * 1.75, 9.25, tz + Math.cos(ang) * 1.75);
        frond.rotation.order = 'YXZ';
        frond.rotation.y = ang;
        frond.rotation.x = Math.PI / 2 - 0.12;
        details.add(frond);
      }
    }

    for (const tz of [-9.5, 9.5]) {
      const tarp = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.6), canvasTarp);
      tarp.rotation.x = -Math.PI / 2 + (tz < 0 ? 0.14 : -0.14);
      tarp.position.set(0, 4.7, tz);
      details.add(tarp);
    }

    addBarrelCluster(-19.5, -21);
    addBarrelCluster(19.5, 21);
    addBarrelCluster(-15.5, 8.2);
    addBarrelCluster(15.5, -8.2);
  } else if (mapId === 'warehouse') {
    const craneBeam = new THREE.Mesh(
      makeBeveledBox(58, 0.88, 1.25, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xd9961f, metalness: 0.68, roughness: 0.32 })
    );
    craneBeam.position.set(0, 9.4, -7);
    details.add(craneBeam);
    const craneTrolley = new THREE.Mesh(makeBeveledBox(2.4, 1.0, 1.8, 0.06), darkSteel);
    craneTrolley.position.set(6, 8.8, -7);
    details.add(craneTrolley);

    addTrafficCone(-18, -6);
    addTrafficCone(-18, 6);
    addTrafficCone(18, -6);
    addTrafficCone(18, 6);

    addBarrelCluster(-21, -18.5);
    addBarrelCluster(21, 18.5);
    addBarrelCluster(-5.5, 0.5);
    addBarrelCluster(5.5, -0.5);
  } else if (mapId === 'crossroad') {
    // Composite 3D Armored SWAT BearCat Police Van seated over center collision hull (0, 0, 0)
    const apc = new THREE.Group();
    const upperCab = new THREE.Mesh(makeBeveledBox(2.85, 0.94, 4.05, 0.08), swatVanMat);
    upperCab.position.set(0, 2.38, 0.15);
    upperCab.castShadow = true;
    apc.add(upperCab);

    // Front Heavy Steel Bull-Bar Ram Bumper
    const bullBar = new THREE.Mesh(makeBeveledBox(2.45, 0.42, 0.24, 0.03), darkSteel);
    bullBar.position.set(0, 1.05, -3.22);
    apc.add(bullBar);

    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.25 });
    for (const sx of [-1.44, 1.44]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 3.8), stripeMat);
      stripe.position.set(sx, 2.08, 0.15);
      apc.add(stripe);
    }

    const lightbarBase = new THREE.Mesh(makeBeveledBox(1.62, 0.14, 0.32, 0.02), darkSteel);
    lightbarBase.position.set(0, 2.9, -1.1);
    apc.add(lightbarBase);
    const redBeacon = new THREE.Mesh(
      makeBeveledBox(0.68, 0.16, 0.28, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    redBeacon.position.set(-0.42, 2.94, -1.1);
    apc.add(redBeacon);
    const blueBeacon = new THREE.Mesh(
      makeBeveledBox(0.68, 0.16, 0.28, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
    );
    blueBeacon.position.set(0.42, 2.94, -1.1);
    apc.add(blueBeacon);

    const windshield = new THREE.Mesh(makeBeveledBox(2.35, 0.48, 0.12, 0.02), glassDark);
    windshield.position.set(0, 2.42, -1.86);
    apc.add(windshield);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.64, 0.42, 16), darkSteel);
    turret.position.set(0, 3.0, 0.6);
    apc.add(turret);
    const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.6, 10), darkSteel);
    mgBarrel.rotation.x = Math.PI / 2;
    mgBarrel.position.set(0, 3.1, -0.35);
    apc.add(mgBarrel);

    for (const wz of [-2.0, 0.1, 2.1]) {
      for (const wx of [-1.55, 1.55]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.42, 18), rubberMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.58, wz);
        apc.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.46, 12), darkSteel);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(wx, 0.58, wz);
        apc.add(hub);
      }
    }
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffe4a0 });
    for (const hx of [-1.05, 1.05]) {
      const hl = new THREE.Mesh(makeBeveledBox(0.35, 0.2, 0.1, 0.02), headlightMat);
      hl.position.set(hx, 1.3, -3.12);
      apc.add(hl);
    }
    details.add(apc);

    addTrafficCone(-4.5, -5.5);
    addTrafficCone(4.5, -5.5);
    addTrafficCone(-4.5, 5.5);
    addTrafficCone(4.5, 5.5);

    const bldgs = [
      [-16, -16],
      [16, -16],
      [-16, 16],
      [16, 16],
    ];
    for (const [bx, bz] of bldgs) {
      const faceZ = bz < 0 ? bz + 5.04 : bz - 5.04;
      const faceX = bx < 0 ? bx + 5.54 : bx - 5.54;
      for (const wy of [3.2, 5.4]) {
        for (const wxOff of [-3.2, 0, 3.2]) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), warmWindow);
          win.position.set(bx + wxOff, wy, faceZ);
          if (bz > 0) win.rotation.y = Math.PI;
          details.add(win);
        }
        for (const wzOff of [-2.6, 2.6]) {
          const win2 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), warmWindow);
          win2.position.set(faceX, wy, bz + wzOff);
          win2.rotation.y = bx < 0 ? Math.PI / 2 : -Math.PI / 2;
          details.add(win2);
        }
      }
    }

    addBarrelCluster(-10.5, -10.5);
    addBarrelCluster(10.5, 10.5);
  }

  return details;
}
