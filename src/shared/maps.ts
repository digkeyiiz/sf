import type { MapId, Vec3 } from './types';

export type BoxMaterialType =
  | 'sandstone'
  | 'sandstone_dark'
  | 'concrete'
  | 'concrete_dark'
  | 'crate_wood'
  | 'crate_olive'
  | 'container_red'
  | 'container_blue'
  | 'container_olive'
  | 'brick'
  | 'sandbag'
  | 'metal_dark'
  | 'metal_yellow';

export interface MapBox {
  x: number; // center x
  y: number; // bottom y
  z: number; // center z
  w: number; // width (x)
  h: number; // height (y)
  d: number; // depth (z)
  mat: BoxMaterialType;
  decorOnly?: boolean;
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface SupplySpawn {
  id: string;
  kind: 'medkit' | 'ammo';
  x: number;
  y: number;
  z: number;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  thaiName: string;
  subtitle: string;
  indoor: boolean;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  floorType: 'sand' | 'concrete' | 'asphalt';
  sunColor: string;
  sunIntensity: number;
  sunPos: Vec3;
  hemiSky: string;
  hemiGround: string;
  boxes: MapBox[];
  redSpawns: SpawnPoint[];
  blueSpawns: SpawnPoint[];
  waypoints: Vec3[];
  supplySpawns: SupplySpawn[];
}

export const MAPS: Record<MapId, MapDefinition> = {
  desert_camp: {
    id: 'desert_camp',
    name: 'Desert Camp',
    thaiName: 'ค่ายทะเลทราย',
    subtitle: 'สนามรบกลางแจ้งแนวสมมาตร พร้อมบังเกอร์กระสอบทราย หอคอยซุ่มยิง และตรอกหลบสองฝั่ง',
    indoor: false,
    bounds: { minX: -32, maxX: 32, minZ: -28, maxZ: 28 },
    skyColor: '#d4b48c',
    fogColor: '#d9bc96',
    fogDensity: 0.0105,
    floorType: 'sand',
    sunColor: '#ffe3b0',
    sunIntensity: 2.15,
    sunPos: { x: 26, y: 38, z: 18 },
    hemiSky: '#a8c8f0',
    hemiGround: '#8c6d46',
    boxes: [
      // Perimeter Compound Walls
      { x: 0, y: 0, z: -28.5, w: 65, h: 4.5, d: 1.4, mat: 'sandstone_dark' },
      { x: 0, y: 0, z: 28.5, w: 65, h: 4.5, d: 1.4, mat: 'sandstone_dark' },
      { x: -32.5, y: 0, z: 0, w: 1.4, h: 4.5, d: 58, mat: 'sandstone_dark' },
      { x: 32.5, y: 0, z: 0, w: 1.4, h: 4.5, d: 58, mat: 'sandstone_dark' },

      // Red Spawn Bunker + Anti-Spawn-Camp L-Walls + Low Peek Cover
      { x: -23, y: 0, z: -8, w: 2.2, h: 3.8, d: 8.2, mat: 'sandstone' },
      { x: -23, y: 0, z: 8, w: 2.2, h: 3.8, d: 8.2, mat: 'sandstone' },
      { x: -23, y: 3.8, z: 0, w: 2.4, h: 1.3, d: 24.4, mat: 'sandstone_dark' },
      { x: -20.0, y: 0, z: 0, w: 1.4, h: 1.2, d: 4.8, mat: 'sandbag' },
      { x: -20.2, y: 0, z: -13.5, w: 3.6, h: 1.25, d: 1.2, mat: 'sandbag' },
      { x: -20.2, y: 0, z: 13.5, w: 3.6, h: 1.25, d: 1.2, mat: 'sandbag' },

      // Blue Spawn Bunker + Anti-Spawn-Camp L-Walls + Low Peek Cover
      { x: 23, y: 0, z: -8, w: 2.2, h: 3.8, d: 8.2, mat: 'sandstone' },
      { x: 23, y: 0, z: 8, w: 2.2, h: 3.8, d: 8.2, mat: 'sandstone' },
      { x: 23, y: 3.8, z: 0, w: 2.4, h: 1.3, d: 24.4, mat: 'sandstone_dark' },
      { x: 20.0, y: 0, z: 0, w: 1.4, h: 1.2, d: 4.8, mat: 'sandbag' },
      { x: 20.2, y: 0, z: -13.5, w: 3.6, h: 1.25, d: 1.2, mat: 'sandbag' },
      { x: 20.2, y: 0, z: 13.5, w: 3.6, h: 1.25, d: 1.2, mat: 'sandbag' },

      // Center Courtyard Monument, Pillars & Multi-Level Cover
      { x: 0, y: 0, z: -5.8, w: 4.6, h: 5.0, d: 2.6, mat: 'sandstone' },
      { x: 0, y: 0, z: 5.8, w: 4.6, h: 5.0, d: 2.6, mat: 'sandstone' },
      { x: 0, y: 3.9, z: 0, w: 4.8, h: 1.2, d: 14.2, mat: 'sandstone_dark' },
      // Mid crouch & peek cover boxes
      { x: -2.4, y: 0, z: -1.4, w: 1.5, h: 1.45, d: 1.5, mat: 'crate_olive' },
      { x: 2.4, y: 0, z: 1.4, w: 1.5, h: 1.45, d: 1.5, mat: 'crate_olive' },
      { x: 0, y: 0, z: 0, w: 1.3, h: 1.1, d: 2.2, mat: 'sandbag' },
      // Mid-lane shoulder peek pillars
      { x: -6.8, y: 0, z: -3.2, w: 1.3, h: 2.6, d: 1.3, mat: 'sandstone_dark' },
      { x: 6.8, y: 0, z: 3.2, w: 1.3, h: 2.6, d: 1.3, mat: 'sandstone_dark' },
      { x: -6.8, y: 0, z: 3.2, w: 1.1, h: 1.15, d: 2.4, mat: 'sandbag' },
      { x: 6.8, y: 0, z: -3.2, w: 1.1, h: 1.15, d: 2.4, mat: 'sandbag' },

      // North Flank Compound Buildings, Sniper Step-Crates & Ambush Alcoves
      { x: -11.5, y: 0, z: -15.2, w: 7.2, h: 5.4, d: 5.4, mat: 'sandstone' },
      { x: 11.5, y: 0, z: -15.2, w: 7.2, h: 5.4, d: 5.4, mat: 'sandstone' },
      // Stepped climbable crates on North buildings
      { x: -15.9, y: 0, z: -15.2, w: 1.6, h: 0.65, d: 1.6, mat: 'crate_wood' },
      { x: -15.9, y: 0, z: -13.5, w: 1.6, h: 1.35, d: 1.6, mat: 'crate_olive' },
      { x: 15.9, y: 0, z: -15.2, w: 1.6, h: 0.65, d: 1.6, mat: 'crate_wood' },
      { x: 15.9, y: 0, z: -13.5, w: 1.6, h: 1.35, d: 1.6, mat: 'crate_olive' },
      // North flank shipping container + sandbag trenches
      { x: 0, y: 0, z: -20.2, w: 6.8, h: 3.0, d: 2.6, mat: 'container_olive' },
      { x: -5.4, y: 0, z: -23.0, w: 1.8, h: 1.25, d: 1.8, mat: 'crate_wood' },
      { x: 5.4, y: 0, z: -23.0, w: 1.8, h: 1.25, d: 1.8, mat: 'crate_wood' },
      { x: 0, y: 0, z: -14.2, w: 3.4, h: 1.2, d: 1.2, mat: 'sandbag' },

      // South Flank Compound Buildings, Sniper Step-Crates & Ambush Alcoves
      { x: -11.5, y: 0, z: 15.2, w: 7.2, h: 5.4, d: 5.4, mat: 'sandstone' },
      { x: 11.5, y: 0, z: 15.2, w: 7.2, h: 5.4, d: 5.4, mat: 'sandstone' },
      { x: -15.9, y: 0, z: 15.2, w: 1.6, h: 0.65, d: 1.6, mat: 'crate_wood' },
      { x: -15.9, y: 0, z: 13.5, w: 1.6, h: 1.35, d: 1.6, mat: 'crate_olive' },
      { x: 15.9, y: 0, z: 15.2, w: 1.6, h: 0.65, d: 1.6, mat: 'crate_wood' },
      { x: 15.9, y: 0, z: 13.5, w: 1.6, h: 1.35, d: 1.6, mat: 'crate_olive' },
      { x: 0, y: 0, z: 20.2, w: 6.8, h: 3.0, d: 2.6, mat: 'container_red' },
      { x: -5.4, y: 0, z: 23.0, w: 1.8, h: 1.25, d: 1.8, mat: 'crate_wood' },
      { x: 5.4, y: 0, z: 23.0, w: 1.8, h: 1.25, d: 1.8, mat: 'crate_wood' },
      { x: 0, y: 0, z: 14.2, w: 3.4, h: 1.2, d: 1.2, mat: 'sandbag' },

      // Mid-Flank Layered Cover Clusters (Standing + Crouching heights)
      { x: -13.0, y: 0, z: -4.2, w: 2.2, h: 2.3, d: 2.2, mat: 'crate_wood' },
      { x: -13.0, y: 0, z: -1.8, w: 1.5, h: 1.15, d: 1.5, mat: 'crate_olive' },
      { x: 13.0, y: 0, z: 4.2, w: 2.2, h: 2.3, d: 2.2, mat: 'crate_wood' },
      { x: 13.0, y: 0, z: 1.8, w: 1.5, h: 1.15, d: 1.5, mat: 'crate_olive' },
      { x: -13.2, y: 0, z: 6.4, w: 1.6, h: 1.2, d: 3.8, mat: 'sandbag' },
      { x: 13.2, y: 0, z: -6.4, w: 1.6, h: 1.2, d: 3.8, mat: 'sandbag' },

      // Corner Watchtower Bases + Side L-Bunkers
      { x: -27.2, y: 0, z: -22.5, w: 4.2, h: 7.8, d: 4.2, mat: 'sandstone_dark' },
      { x: 27.2, y: 0, z: 22.5, w: 4.2, h: 7.8, d: 4.2, mat: 'sandstone_dark' },
      { x: -25.0, y: 0, z: 22.5, w: 4.6, h: 2.4, d: 1.4, mat: 'sandstone' },
      { x: 25.0, y: 0, z: -22.5, w: 4.6, h: 2.4, d: 1.4, mat: 'sandstone' },
    ],
    redSpawns: [
      { x: -27.5, y: 0, z: -10, yaw: -Math.PI / 2 },
      { x: -27.5, y: 0, z: -3, yaw: -Math.PI / 2 },
      { x: -27.5, y: 0, z: 3, yaw: -Math.PI / 2 },
      { x: -27.5, y: 0, z: 10, yaw: -Math.PI / 2 },
      { x: -25.5, y: 0, z: 17, yaw: -Math.PI / 2 },
      { x: -25.5, y: 0, z: -15, yaw: -Math.PI / 2 },
    ],
    blueSpawns: [
      { x: 27.5, y: 0, z: -10, yaw: Math.PI / 2 },
      { x: 27.5, y: 0, z: -3, yaw: Math.PI / 2 },
      { x: 27.5, y: 0, z: 3, yaw: Math.PI / 2 },
      { x: 27.5, y: 0, z: 10, yaw: Math.PI / 2 },
      { x: 25.5, y: 0, z: -17, yaw: Math.PI / 2 },
      { x: 25.5, y: 0, z: 15, yaw: Math.PI / 2 },
    ],
    waypoints: [
      { x: -18, y: 0, z: 0 },
      { x: -18, y: 0, z: -10 },
      { x: -18, y: 0, z: 10 },
      { x: -8.5, y: 0, z: 0 },
      { x: 8.5, y: 0, z: 0 },
      { x: 0, y: 0, z: -11 },
      { x: 0, y: 0, z: 11 },
      { x: -9, y: 0, z: -24 },
      { x: 9, y: 0, z: -24 },
      { x: -9, y: 0, z: 24 },
      { x: 9, y: 0, z: 24 },
      { x: 18, y: 0, z: 0 },
      { x: 18, y: 0, z: -10 },
      { x: 18, y: 0, z: 10 },
    ],
    supplySpawns: [
      { id: 'dc_med_n', kind: 'medkit', x: 0, y: 0, z: -16.8 },
      { id: 'dc_med_s', kind: 'medkit', x: 0, y: 0, z: 16.8 },
      { id: 'dc_ammo_w', kind: 'ammo', x: -16.5, y: 0, z: 0 },
      { id: 'dc_ammo_e', kind: 'ammo', x: 16.5, y: 0, z: 0 },
    ],
  },

  warehouse: {
    id: 'warehouse',
    name: 'Depot Warehouse',
    thaiName: 'โกดังท่าเรือ',
    subtitle: 'สมรภูมิตู้คอนเทนเนอร์ระยะประชิด พร้อมจุดกำบังสองชั้น ลังปีนซุ่ม และช่องยิงทะลุ',
    indoor: true,
    bounds: { minX: -29, maxX: 29, minZ: -24, maxZ: 24 },
    skyColor: '#1a202c',
    fogColor: '#1d2432',
    fogDensity: 0.0115,
    floorType: 'concrete',
    sunColor: '#ffd79a',
    sunIntensity: 1.8,
    sunPos: { x: 12, y: 28, z: 10 },
    hemiSky: '#829fc2',
    hemiGround: '#323842',
    boxes: [
      // Warehouse Outer Concrete Walls
      { x: 0, y: 0, z: -24.6, w: 60, h: 11.4, d: 1.4, mat: 'concrete_dark' },
      { x: 0, y: 0, z: 24.6, w: 60, h: 11.4, d: 1.4, mat: 'concrete_dark' },
      { x: -29.6, y: 0, z: 0, w: 1.4, h: 11.4, d: 50, mat: 'concrete_dark' },
      { x: 29.6, y: 0, z: 0, w: 1.4, h: 11.4, d: 50, mat: 'concrete_dark' },
      // Overhead Steel Roof Trusses
      { x: -16, y: 10.4, z: 0, w: 1.1, h: 1.0, d: 48, mat: 'metal_dark', decorOnly: true },
      { x: 0, y: 10.4, z: 0, w: 1.1, h: 1.0, d: 48, mat: 'metal_dark', decorOnly: true },
      { x: 16, y: 10.4, z: 0, w: 1.1, h: 1.0, d: 48, mat: 'metal_dark', decorOnly: true },
      { x: 0, y: 11.4, z: 0, w: 60, h: 0.6, d: 50, mat: 'metal_dark', decorOnly: true },

      // Center Stacked Shipping Containers (with central CQB peeking corridor)
      { x: 0, y: 0, z: -4.6, w: 7.4, h: 3.1, d: 2.9, mat: 'container_red' },
      { x: 0, y: 3.1, z: -4.6, w: 7.4, h: 3.1, d: 2.9, mat: 'container_blue' },
      { x: 0, y: 0, z: 4.6, w: 7.4, h: 3.1, d: 2.9, mat: 'container_blue' },
      { x: 0, y: 3.1, z: 4.6, w: 7.4, h: 3.1, d: 2.9, mat: 'container_red' },
      // Central low hazard cover block inside mid tunnel
      { x: 0, y: 0, z: 0, w: 1.6, h: 1.2, d: 2.4, mat: 'metal_yellow' },

      // West Containers, Step-Crates & CQB Barricades (Red Side)
      { x: -14.2, y: 0, z: -12.2, w: 2.9, h: 3.1, d: 7.6, mat: 'container_red' },
      { x: -14.2, y: 0, z: 12.2, w: 2.9, h: 3.1, d: 7.6, mat: 'container_olive' },
      { x: -18.2, y: 0, z: 0, w: 2.6, h: 2.9, d: 6.4, mat: 'container_blue' },
      // Stepped climbable cargo crates
      { x: -8.6, y: 0, z: -12.5, w: 2.0, h: 1.45, d: 2.0, mat: 'crate_wood' },
      { x: -8.6, y: 0, z: -14.4, w: 1.6, h: 0.65, d: 1.6, mat: 'crate_olive' },
      { x: -8.6, y: 0, z: 12.5, w: 2.0, h: 1.45, d: 2.0, mat: 'crate_wood' },
      { x: -8.6, y: 0, z: 14.4, w: 1.6, h: 0.65, d: 1.6, mat: 'crate_olive' },
      // Peek shields & forklift barriers
      { x: -10.4, y: 0, z: 0, w: 1.4, h: 1.25, d: 3.4, mat: 'metal_yellow' },
      { x: -6.2, y: 0, z: -7.5, w: 1.2, h: 2.2, d: 1.8, mat: 'crate_olive' },
      { x: -6.2, y: 0, z: 7.5, w: 1.2, h: 1.2, d: 2.4, mat: 'concrete' },
      { x: -21.5, y: 0, z: -9.5, w: 1.4, h: 1.25, d: 3.4, mat: 'concrete' },
      { x: -21.5, y: 0, z: 9.5, w: 1.4, h: 1.25, d: 3.4, mat: 'concrete' },

      // East Containers, Step-Crates & CQB Barricades (Blue Side)
      { x: 14.2, y: 0, z: -12.2, w: 2.9, h: 3.1, d: 7.6, mat: 'container_olive' },
      { x: 14.2, y: 0, z: 12.2, w: 2.9, h: 3.1, d: 7.6, mat: 'container_blue' },
      { x: 18.2, y: 0, z: 0, w: 2.6, h: 2.9, d: 6.4, mat: 'container_red' },
      { x: 8.6, y: 0, z: -12.5, w: 2.0, h: 1.45, d: 2.0, mat: 'crate_wood' },
      { x: 8.6, y: 0, z: -14.4, w: 1.6, h: 0.65, d: 1.6, mat: 'crate_olive' },
      { x: 8.6, y: 0, z: 12.5, w: 2.0, h: 1.45, d: 2.0, mat: 'crate_wood' },
      { x: 8.6, y: 0, z: 14.4, w: 1.6, h: 0.65, d: 1.6, mat: 'crate_olive' },
      { x: 10.4, y: 0, z: 0, w: 1.4, h: 1.25, d: 3.4, mat: 'metal_yellow' },
      { x: 6.2, y: 0, z: 7.5, w: 1.2, h: 2.2, d: 1.8, mat: 'crate_olive' },
      { x: 6.2, y: 0, z: -7.5, w: 1.2, h: 1.2, d: 2.4, mat: 'concrete' },
      { x: 21.5, y: 0, z: -9.5, w: 1.4, h: 1.25, d: 3.4, mat: 'concrete' },
      { x: 21.5, y: 0, z: 9.5, w: 1.4, h: 1.25, d: 3.4, mat: 'concrete' },

      // North & South Corridor Shipping Blocks + Flanking Crates
      { x: 0, y: 0, z: -17.2, w: 5.8, h: 2.9, d: 2.6, mat: 'container_olive' },
      { x: 0, y: 0, z: 17.2, w: 5.8, h: 2.9, d: 2.6, mat: 'container_olive' },
      { x: -5.4, y: 0, z: -20.5, w: 1.7, h: 1.3, d: 1.7, mat: 'crate_wood' },
      { x: 5.4, y: 0, z: -20.5, w: 1.7, h: 1.3, d: 1.7, mat: 'crate_wood' },
      { x: -5.4, y: 0, z: 20.5, w: 1.7, h: 1.3, d: 1.7, mat: 'crate_wood' },
      { x: 5.4, y: 0, z: 20.5, w: 1.7, h: 1.3, d: 1.7, mat: 'crate_wood' },

      // Structural Warehouse Steel Columns
      { x: -16, y: 0, z: -20, w: 1.4, h: 10.5, d: 1.4, mat: 'metal_dark' },
      { x: 16, y: 0, z: -20, w: 1.4, h: 10.5, d: 1.4, mat: 'metal_dark' },
      { x: -16, y: 0, z: 20, w: 1.4, h: 10.5, d: 1.4, mat: 'metal_dark' },
      { x: 16, y: 0, z: 20, w: 1.4, h: 10.5, d: 1.4, mat: 'metal_dark' },
    ],
    redSpawns: [
      { x: -24.5, y: 0, z: -12, yaw: -Math.PI / 2 },
      { x: -24.5, y: 0, z: -4, yaw: -Math.PI / 2 },
      { x: -24.5, y: 0, z: 4, yaw: -Math.PI / 2 },
      { x: -24.5, y: 0, z: 12, yaw: -Math.PI / 2 },
      { x: -23.5, y: 0, z: 18, yaw: -Math.PI / 2 },
      { x: -23.5, y: 0, z: -18, yaw: -Math.PI / 2 },
    ],
    blueSpawns: [
      { x: 24.5, y: 0, z: -12, yaw: Math.PI / 2 },
      { x: 24.5, y: 0, z: -4, yaw: Math.PI / 2 },
      { x: 24.5, y: 0, z: 4, yaw: Math.PI / 2 },
      { x: 24.5, y: 0, z: 12, yaw: Math.PI / 2 },
      { x: 23.5, y: 0, z: 18, yaw: Math.PI / 2 },
      { x: 23.5, y: 0, z: -18, yaw: Math.PI / 2 },
    ],
    waypoints: [
      { x: -20, y: 0, z: -14 },
      { x: -20, y: 0, z: 14 },
      { x: -8, y: 0, z: -4 },
      { x: -8, y: 0, z: 4 },
      { x: 0, y: 0, z: -11 },
      { x: 0, y: 0, z: 11 },
      { x: 0, y: 0, z: -21 },
      { x: 0, y: 0, z: 21 },
      { x: 8, y: 0, z: -4 },
      { x: 8, y: 0, z: 4 },
      { x: 20, y: 0, z: -14 },
      { x: 20, y: 0, z: 14 },
    ],
    supplySpawns: [
      { id: 'wh_med_n', kind: 'medkit', x: 0, y: 0, z: -12.5 },
      { id: 'wh_med_s', kind: 'medkit', x: 0, y: 0, z: 12.5 },
      { id: 'wh_ammo_w', kind: 'ammo', x: -13.2, y: 0, z: 0 },
      { id: 'wh_ammo_e', kind: 'ammo', x: 13.2, y: 0, z: 0 },
    ],
  },

  crossroad: {
    id: 'crossroad',
    name: 'Crossroad Outpost',
    thaiName: 'แยกยุทธการ',
    subtitle: 'เมืองยุทธการยามพลบค่ำ แนวตึกอิฐ รถหุ้มเกราะกลางแยก และด่านคอนกรีตหลบกระสุน',
    indoor: false,
    bounds: { minX: -31, maxX: 31, minZ: -29, maxZ: 29 },
    skyColor: '#223048',
    fogColor: '#25334d',
    fogDensity: 0.012,
    floorType: 'asphalt',
    sunColor: '#ffbe7d',
    sunIntensity: 1.65,
    sunPos: { x: -24, y: 26, z: -18 },
    hemiSky: '#6f8ec2',
    hemiGround: '#2c303a',
    boxes: [
      // Perimeter Urban Compound Walls
      { x: 0, y: 0, z: -29.5, w: 63, h: 4.8, d: 1.4, mat: 'brick' },
      { x: 0, y: 0, z: 29.5, w: 63, h: 4.8, d: 1.4, mat: 'brick' },
      { x: -31.5, y: 0, z: 0, w: 1.4, h: 4.8, d: 60, mat: 'brick' },
      { x: 31.5, y: 0, z: 0, w: 1.4, h: 4.8, d: 60, mat: 'brick' },

      // 4 Quadrant Urban Brick Buildings creating the Crossroad
      { x: -16, y: 0, z: -16, w: 11, h: 7.4, d: 10, mat: 'brick' },
      { x: 16, y: 0, z: -16, w: 11, h: 7.4, d: 10, mat: 'brick' },
      { x: -16, y: 0, z: 16, w: 11, h: 7.4, d: 10, mat: 'brick' },
      { x: 16, y: 0, z: 16, w: 11, h: 7.4, d: 10, mat: 'brick' },

      // Central Armored APC Collision Hull (detailed 3D APC model overlaid in GameEngine!)
      { x: 0, y: 0, z: 0, w: 3.1, h: 2.35, d: 6.2, mat: 'container_olive' },

      // Central Plaza Ring of Jersey Concrete Barriers + Sandbags
      { x: -5.2, y: 0, z: -5.0, w: 3.0, h: 1.2, d: 0.95, mat: 'concrete' },
      { x: 5.2, y: 0, z: 5.0, w: 3.0, h: 1.2, d: 0.95, mat: 'concrete' },
      { x: -5.2, y: 0, z: 5.0, w: 0.95, h: 1.2, d: 3.0, mat: 'concrete' },
      { x: 5.2, y: 0, z: -5.0, w: 0.95, h: 1.2, d: 3.0, mat: 'concrete' },
      { x: -5.4, y: 0, z: 0, w: 1.1, h: 1.15, d: 2.6, mat: 'sandbag' },
      { x: 5.4, y: 0, z: 0, w: 1.1, h: 1.15, d: 2.6, mat: 'sandbag' },

      // 4-Way Roadway Checkpoints (Layered Standing & Crouch Cover)
      { x: -15.5, y: 0, z: -2.2, w: 1.2, h: 1.2, d: 3.8, mat: 'concrete' },
      { x: -15.5, y: 0, z: 3.4, w: 1.6, h: 2.1, d: 1.8, mat: 'crate_olive' },
      { x: 15.5, y: 0, z: 2.2, w: 1.2, h: 1.2, d: 3.8, mat: 'concrete' },
      { x: 15.5, y: 0, z: -3.4, w: 1.6, h: 2.1, d: 1.8, mat: 'crate_olive' },

      { x: -2.4, y: 0, z: -16.2, w: 3.8, h: 1.2, d: 1.2, mat: 'concrete' },
      { x: 3.2, y: 0, z: -16.2, w: 1.8, h: 2.1, d: 1.6, mat: 'crate_wood' },
      { x: 2.4, y: 0, z: 16.2, w: 3.8, h: 1.2, d: 1.2, mat: 'concrete' },
      { x: -3.2, y: 0, z: 16.2, w: 1.8, h: 2.1, d: 1.6, mat: 'crate_wood' },

      // Corner Street Flanking Crates & Climbable Sniper Boxes
      { x: -8.2, y: 0, z: -9.5, w: 1.8, h: 1.5, d: 1.8, mat: 'crate_olive' },
      { x: -8.2, y: 0, z: -7.8, w: 1.4, h: 0.65, d: 1.4, mat: 'crate_wood' },
      { x: 8.2, y: 0, z: 9.5, w: 1.8, h: 1.5, d: 1.8, mat: 'crate_olive' },
      { x: 8.2, y: 0, z: 7.8, w: 1.4, h: 0.65, d: 1.4, mat: 'crate_wood' },
      { x: -8.2, y: 0, z: 9.5, w: 1.8, h: 1.25, d: 1.8, mat: 'sandbag' },
      { x: 8.2, y: 0, z: -9.5, w: 1.8, h: 1.25, d: 1.8, mat: 'sandbag' },

      // Outer Alley Ambush Cover
      { x: -16, y: 0, z: -24.5, w: 3.2, h: 1.25, d: 1.2, mat: 'sandbag' },
      { x: 16, y: 0, z: -24.5, w: 3.2, h: 1.25, d: 1.2, mat: 'sandbag' },
      { x: -16, y: 0, z: 24.5, w: 3.2, h: 1.25, d: 1.2, mat: 'sandbag' },
      { x: 16, y: 0, z: 24.5, w: 3.2, h: 1.25, d: 1.2, mat: 'sandbag' },

      // Spawn Guardhouses + Protective Barriers
      { x: -25.5, y: 0, z: -5.5, w: 3.0, h: 3.5, d: 3.2, mat: 'concrete_dark' },
      { x: -22.2, y: 0, z: 4.5, w: 1.2, h: 1.25, d: 3.4, mat: 'concrete' },
      { x: 25.5, y: 0, z: 5.5, w: 3.0, h: 3.5, d: 3.2, mat: 'concrete_dark' },
      { x: 22.2, y: 0, z: -4.5, w: 1.2, h: 1.25, d: 3.4, mat: 'concrete' },
    ],
    redSpawns: [
      { x: -27, y: 0, z: 2, yaw: -Math.PI / 2 },
      { x: -27, y: 0, z: 7, yaw: -Math.PI / 2 },
      { x: -27, y: 0, z: -12, yaw: -Math.PI / 2 },
      { x: -25, y: 0, z: 23, yaw: -Math.PI / 2 },
      { x: -25, y: 0, z: -23, yaw: -Math.PI / 2 },
    ],
    blueSpawns: [
      { x: 27, y: 0, z: -2, yaw: Math.PI / 2 },
      { x: 27, y: 0, z: -7, yaw: Math.PI / 2 },
      { x: 27, y: 0, z: 12, yaw: Math.PI / 2 },
      { x: 25, y: 0, z: -23, yaw: Math.PI / 2 },
      { x: 25, y: 0, z: 23, yaw: Math.PI / 2 },
    ],
    waypoints: [
      { x: -20, y: 0, z: 0 },
      { x: -9, y: 0, z: 0 },
      { x: 9, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
      { x: 0, y: 0, z: -22 },
      { x: 0, y: 0, z: -10 },
      { x: 0, y: 0, z: 10 },
      { x: 0, y: 0, z: 22 },
      { x: -8, y: 0, z: -14 },
      { x: 8, y: 0, z: -14 },
      { x: -8, y: 0, z: 14 },
      { x: 8, y: 0, z: 14 },
      { x: -24, y: 0, z: -23 },
      { x: 24, y: 0, z: 23 },
    ],
    supplySpawns: [
      { id: 'cr_med_n', kind: 'medkit', x: 0, y: 0, z: -11.5 },
      { id: 'cr_med_s', kind: 'medkit', x: 0, y: 0, z: 11.5 },
      { id: 'cr_ammo_w', kind: 'ammo', x: -11.5, y: 0, z: 0 },
      { id: 'cr_ammo_e', kind: 'ammo', x: 11.5, y: 0, z: 0 },
    ],
  },
};

export const MAP_LIST: MapDefinition[] = [
  MAPS.desert_camp,
  MAPS.warehouse,
  MAPS.crossroad,
];
