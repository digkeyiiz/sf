import type { MapId, WeaponId } from '../../shared/types';

export type AssetCategory = 'character' | 'weapon' | 'prop' | 'hdri' | 'texture' | 'audio';

export interface AssetManifestEntry {
  id: string;
  category: AssetCategory;
  url: string;
  fallbackProcedural: boolean;
  budgetTriangles?: number;
  maxTextureSize?: number;
  lodLevels?: number;
}

/**
 * Central asset manifest for STRIKE OPS.
 * Supports optional external GLB (Draco/Meshopt), KTX2 textures, and HDRI probes under /public/assets/.
 * When external files are absent, AssetManager seamlessly falls back to batched Procedural PBR assets.
 */
export const ASSETS_MANIFEST: Record<string, AssetManifestEntry> = {
  // Environment IBL / HDRI presets per battlefield
  'hdri:desert_camp': {
    id: 'hdri:desert_camp',
    category: 'hdri',
    url: '/assets/hdri/desert_midday.hdr',
    fallbackProcedural: true,
  },
  'hdri:warehouse': {
    id: 'hdri:warehouse',
    category: 'hdri',
    url: '/assets/hdri/port_dusk.hdr',
    fallbackProcedural: true,
  },
  'hdri:crossroad': {
    id: 'hdri:crossroad',
    category: 'hdri',
    url: '/assets/hdri/sea_morning.hdr',
    fallbackProcedural: true,
  },

  // Operator Rig LODs
  'character:operator_base': {
    id: 'character:operator_base',
    category: 'character',
    url: '/assets/characters/operator_base.glb',
    fallbackProcedural: true,
    budgetTriangles: 14000,
    lodLevels: 3,
  },
};

export const MAP_ASSET_BUDGETS: Record<
  MapId,
  { maxDrawCallsMobile: number; maxDrawCallsDesktop: number; maxTrianglesMobile: number }
> = {
  desert_camp: { maxDrawCallsMobile: 150, maxDrawCallsDesktop: 300, maxTrianglesMobile: 150000 },
  warehouse: { maxDrawCallsMobile: 150, maxDrawCallsDesktop: 300, maxTrianglesMobile: 150000 },
  crossroad: { maxDrawCallsMobile: 150, maxDrawCallsDesktop: 300, maxTrianglesMobile: 150000 },
};

export function getWeaponAssetId(weaponId: WeaponId): string {
  return `weapon:${weaponId}`;
}
