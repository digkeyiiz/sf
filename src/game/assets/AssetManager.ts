import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSETS_MANIFEST } from './assets.manifest';

interface CacheEntry<T> {
  value: T;
  lastUsed: number;
  dispose?: () => void;
}

/**
 * Lightweight, leak-safe AssetManager with LRU caching for shared geometries, materials,
 * and optional external GLB assets (gracefully falling back to procedural builders).
 */
export class AssetManager {
  private geoCache = new Map<string, CacheEntry<THREE.BufferGeometry>>();
  private matCache = new Map<string, CacheEntry<THREE.Material>>();
  private gltfSceneCache = new Map<string, CacheEntry<THREE.Group | null>>();
  private gltfLoader: GLTFLoader | null = null;
  private readonly maxGeos = 256;
  private readonly maxMats = 128;

  public getOrCreateGeometry(
    key: string,
    factory: () => THREE.BufferGeometry
  ): THREE.BufferGeometry {
    const existing = this.geoCache.get(key);
    if (existing) {
      existing.lastUsed = performance.now();
      return existing.value;
    }
    const geo = factory();
    this.geoCache.set(key, {
      value: geo,
      lastUsed: performance.now(),
      dispose: () => geo.dispose(),
    });
    this.evictIfNeeded(this.geoCache, this.maxGeos);
    return geo;
  }

  public getOrCreateMaterial<T extends THREE.Material>(
    key: string,
    factory: () => T
  ): T {
    const existing = this.matCache.get(key);
    if (existing) {
      existing.lastUsed = performance.now();
      return existing.value as T;
    }
    const mat = factory();
    this.matCache.set(key, {
      value: mat,
      lastUsed: performance.now(),
      dispose: () => mat.dispose(),
    });
    this.evictIfNeeded(this.matCache, this.maxMats);
    return mat;
  }

  /**
   * Attempts to load an external GLB asset listed in ASSETS_MANIFEST.
   * Returns null smoothly if unavailable so callers fall back to batched procedural geometry.
   */
  public async tryLoadGltf(manifestId: string): Promise<THREE.Group | null> {
    const cached = this.gltfSceneCache.get(manifestId);
    if (cached) {
      cached.lastUsed = performance.now();
      return cached.value ? cached.value.clone(true) : null;
    }

    const entry = ASSETS_MANIFEST[manifestId];
    if (!entry) return null;

    try {
      const head = await fetch(entry.url, { method: 'HEAD' });
      if (!head.ok) {
        this.gltfSceneCache.set(manifestId, { value: null, lastUsed: performance.now() });
        return null;
      }
      if (!this.gltfLoader) {
        this.gltfLoader = new GLTFLoader();
      }
      const gltf = await this.gltfLoader.loadAsync(entry.url);
      this.gltfSceneCache.set(manifestId, {
        value: gltf.scene,
        lastUsed: performance.now(),
      });
      return gltf.scene.clone(true);
    } catch {
      this.gltfSceneCache.set(manifestId, { value: null, lastUsed: performance.now() });
      return null;
    }
  }

  public getStats() {
    return {
      cachedGeometries: this.geoCache.size,
      cachedMaterials: this.matCache.size,
    };
  }

  private evictIfNeeded<T>(map: Map<string, CacheEntry<T>>, limit: number) {
    if (map.size <= limit) return;
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of map.entries()) {
      if (v.lastUsed < oldestTime) {
        oldestTime = v.lastUsed;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      const entry = map.get(oldestKey);
      entry?.dispose?.();
      map.delete(oldestKey);
    }
  }

  public disposeAll() {
    for (const entry of this.geoCache.values()) {
      entry.dispose?.();
    }
    this.geoCache.clear();
    for (const entry of this.matCache.values()) {
      entry.dispose?.();
    }
    this.matCache.clear();
    this.gltfSceneCache.clear();
  }
}

export const sharedAssetManager = new AssetManager();
