import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Safely normalizes any BufferGeometry (converts to non-indexed, guarantees normal & uv attributes)
 * so mergeGeometries never fails due to attribute mismatches.
 */
export function normalizeForMerge(raw: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = raw.index ? raw.toNonIndexed() : raw.clone();
  if (!g.attributes.normal) {
    g.computeVertexNormals();
  }
  const posCount = g.attributes.position.count;
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(posCount * 2), 2));
  }
  // Keep only position, normal, uv to guarantee identical attribute sets across merged shapes
  for (const attr of Object.keys(g.attributes)) {
    if (attr !== 'position' && attr !== 'normal' && attr !== 'uv') {
      g.deleteAttribute(attr);
    }
  }
  return g;
}

/**
 * Merges static BoxGeometry / ExtrudeGeometry meshes grouped by Material into minimal draw-call meshes.
 * Slashes static map draw calls from ~150-210 down to ~8-14!
 */
export class StaticGeometryBatcher {
  private buckets = new Map<
    THREE.Material,
    { geos: THREE.BufferGeometry[]; castShadow: boolean; receiveShadow: boolean }
  >();

  public addGeometry(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    matrix: THREE.Matrix4,
    castShadow = true,
    receiveShadow = true
  ) {
    const normalized = normalizeForMerge(geo);
    normalized.applyMatrix4(matrix);
    geo.dispose();

    let bucket = this.buckets.get(mat);
    if (!bucket) {
      bucket = { geos: [], castShadow, receiveShadow };
      this.buckets.set(mat, bucket);
    } else {
      bucket.castShadow = bucket.castShadow || castShadow;
      bucket.receiveShadow = bucket.receiveShadow || receiveShadow;
    }
    bucket.geos.push(normalized);
  }

  public addBox(
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    uvScale = 0.25,
    castShadow = true,
    receiveShadow = true
  ) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
    const normAttr = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < uvAttr.count; i++) {
      const nx = Math.abs(normAttr.getX(i));
      const ny = Math.abs(normAttr.getY(i));
      const u = uvAttr.getX(i);
      const v = uvAttr.getY(i);
      if (nx > 0.5) {
        uvAttr.setXY(i, u * d * uvScale, v * h * uvScale);
      } else if (ny > 0.5) {
        uvAttr.setXY(i, u * w * uvScale, v * d * uvScale);
      } else {
        uvAttr.setXY(i, u * w * uvScale, v * h * uvScale);
      }
    }
    uvAttr.needsUpdate = true;

    const mtx = new THREE.Matrix4().makeTranslation(x, y, z);
    this.addGeometry(geo, mat, mtx, castShadow, receiveShadow);
  }

  public buildGroup(): THREE.Group {
    const group = new THREE.Group();
    for (const [mat, bucket] of this.buckets.entries()) {
      if (bucket.geos.length === 0) continue;
      const merged =
        bucket.geos.length === 1
          ? bucket.geos[0]
          : mergeGeometries(bucket.geos, false);

      if (bucket.geos.length > 1) {
        for (const g of bucket.geos) g.dispose();
      }
      if (!merged) continue;

      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}

/**
 * Recursively disposes every BufferGeometry and Material inside an Object3D hierarchy
 * (excluding optional shared materials passed in `preserveMaterials`) to eliminate GPU VRAM leaks.
 */
export function disposeObject3D(
  root: THREE.Object3D,
  preserveMaterials?: Set<THREE.Material>
) {
  const seenGeos = new Set<THREE.BufferGeometry>();
  const seenMats = new Set<THREE.Material>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !seenGeos.has(mesh.geometry)) {
      seenGeos.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    const mat = mesh.material;
    if (mat) {
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        if (!m || seenMats.has(m)) continue;
        if (preserveMaterials && preserveMaterials.has(m)) continue;
        seenMats.add(m);
        if ((m as THREE.SpriteMaterial).isSpriteMaterial) {
          (m as THREE.SpriteMaterial).map?.dispose();
        }
        m.dispose();
      }
    }
  });
}

/**
 * Batches all non-excluded static child meshes inside a THREE.Group by Material into merged meshes,
 * preserving animated/tagged objects (`excludeSet`) in place.
 * Ideal for slashing draw calls on procedural weapons & operator rigs by 75–85%!
 */
export function mergeStaticChildrenByMaterial(
  root: THREE.Group,
  excludeSet: Set<THREE.Object3D> = new Set()
): number {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<
    THREE.Material,
    { geos: THREE.BufferGeometry[]; castShadow: boolean; receiveShadow: boolean }
  >();
  const toRemove: THREE.Mesh[] = [];

  const isExcluded = (obj: THREE.Object3D): boolean => {
    let cur: THREE.Object3D | null = obj;
    while (cur && cur !== root) {
      if (excludeSet.has(cur)) return true;
      cur = cur.parent;
    }
    return false;
  };

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    if (isExcluded(mesh)) return;
    if (Array.isArray(mesh.material)) return;
    if (!mesh.geometry || !mesh.material) return;

    const localMtx = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
    const norm = normalizeForMerge(mesh.geometry);
    norm.applyMatrix4(localMtx);

    let bucket = buckets.get(mesh.material);
    if (!bucket) {
      bucket = {
        geos: [],
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
      };
      buckets.set(mesh.material, bucket);
    } else {
      bucket.castShadow = bucket.castShadow || mesh.castShadow;
      bucket.receiveShadow = bucket.receiveShadow || mesh.receiveShadow;
    }
    bucket.geos.push(norm);
    toRemove.push(mesh);
  });

  if (toRemove.length <= buckets.size) {
    // Nothing worthwhile to merge
    for (const b of buckets.values()) b.geos.forEach((g) => g.dispose());
    return 0;
  }

  for (const mesh of toRemove) {
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
  }

  let mergedCount = 0;
  for (const [mat, bucket] of buckets.entries()) {
    const merged =
      bucket.geos.length === 1
        ? bucket.geos[0]
        : mergeGeometries(bucket.geos, false);
    if (bucket.geos.length > 1) {
      bucket.geos.forEach((g) => g.dispose());
    }
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = bucket.castShadow;
    m.receiveShadow = bucket.receiveShadow;
    root.add(m);
    mergedCount++;
  }
  return toRemove.length - mergedCount;
}
