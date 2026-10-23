// Static batching: merges thousands of small papercraft meshes into a handful of large
// vertex-coloured meshes, bucketed by material signature and by spatial chunk so frustum
// culling still works. Cuts draw calls by an order of magnitude.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type AnyMat = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  roughness?: number;
  metalness?: number;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
};

function signature(m: AnyMat): string {
  return [
    m.type,
    m.map?.uuid ?? '-',
    (m as THREE.MeshStandardMaterial).bumpMap?.uuid ?? '-',
    m.roughness ?? '-',
    m.metalness ?? '-',
    m.emissive ? m.emissive.getHexString() : '-',
    m.emissiveIntensity ?? '-',
    m.transparent,
    m.opacity,
    m.side,
    m.blending,
    m.depthWrite,
    (m as THREE.MeshBasicMaterial).fog,
    (m as THREE.MeshStandardMaterial).flatShading ?? '-',
    (m as THREE.MeshBasicMaterial).wireframe ?? false,
  ].join('|');
}

function extract(src: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = src.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const arr = new Float32Array(count * a.itemSize);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.array[(start + i) * a.itemSize + k] as number;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  return out;
}

function flipWinding(g: THREE.BufferGeometry): void {
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const n = a.itemSize;
    const arr = a.array as Float32Array;
    for (let t = 0; t + 2 < a.count; t += 3) {
      for (let k = 0; k < n; k++) {
        const i1 = (t + 1) * n + k;
        const i2 = (t + 2) * n + k;
        const tmp = arr[i1];
        arr[i1] = arr[i2];
        arr[i2] = tmp;
      }
    }
  }
}

/** Bake the material colour into a vertex colour attribute (multiplying any existing one). */
function bakeColor(sub: THREE.BufferGeometry, mat: AnyMat): void {
  const color = mat.color ? mat.color : new THREE.Color(1, 1, 1);
  const n = sub.getAttribute('position').count;
  const existing = mat.vertexColors ? (sub.getAttribute('color') as THREE.BufferAttribute | undefined) : undefined;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const er = existing ? existing.getX(i) : 1;
    const eg = existing ? existing.getY(i) : 1;
    const eb = existing ? existing.getZ(i) : 1;
    col[i * 3] = color.r * er;
    col[i * 3 + 1] = color.g * eg;
    col[i * 3 + 2] = color.b * eb;
  }
  sub.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

interface Bucket {
  mat: AnyMat;
  geos: THREE.BufferGeometry[];
  cast: boolean;
  receive: boolean;
}

/**
 * Merge every mesh below `root` (except those flagged `userData.noBatch`) into batched meshes.
 * The originals are removed from the scene graph. Returns the group of merged meshes.
 */
export function batchStatic(root: THREE.Object3D, chunkSize = 40): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, Bucket>();
  const remove: THREE.Object3D[] = [];
  const box = new THREE.Box3();
  const center = new THREE.Vector3();

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    let skip = false;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) {
      if (p.userData.noBatch) {
        skip = true;
        break;
      }
    }
    if (skip) return;
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as AnyMat[];
    if (mats.some((mm) => mm.type === 'ShaderMaterial' || mm.type === 'LineBasicMaterial')) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const total = geo.getAttribute('position').count;
    const groups = Array.isArray(m.material) && m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const flip = m.matrixWorld.determinant() < 0;
    for (const g of groups) {
      const mat = mats[g.materialIndex ?? 0] ?? mats[0];
      if (!mat || g.count <= 0) continue;
      const sub = extract(geo, g.start, Math.min(g.count, total - g.start));
      sub.applyMatrix4(m.matrixWorld);
      if (flip) flipWinding(sub);
      bakeColor(sub, mat);
      box.setFromBufferAttribute(sub.getAttribute('position') as THREE.BufferAttribute);
      box.getCenter(center);
      const chunk = Math.floor(center.x / chunkSize);
      const key = `${signature(mat)}#${chunk}#${m.castShadow}#${m.receiveShadow}`;
      let b = buckets.get(key);
      if (!b) {
        b = { mat, geos: [], cast: m.castShadow, receive: m.receiveShadow };
        buckets.set(key, b);
      }
      b.geos.push(sub);
    }
    remove.push(m);
  });

  for (const m of remove) m.parent?.remove(m);

  const out = new THREE.Group();
  out.name = 'batched';
  const matCache = new Map<string, THREE.Material>();
  for (const [key, b] of buckets) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const sig = key.split('#')[0];
    let mat = matCache.get(sig);
    if (!mat) {
      mat = b.mat.clone();
      (mat as AnyMat).color?.set(0xffffff);
      mat.vertexColors = true;
      matCache.set(sig, mat);
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    out.add(mesh);
    for (const g of b.geos) g.dispose();
  }
  return out;
}

/**
 * Merge the rigid mesh children of every node in a model into one vertex-coloured mesh
 * per material signature (and their outlines into one line set), preserving the node
 * hierarchy used by animation. Named meshes are kept separate so they can be animated.
 */
export function compactModel(root: THREE.Object3D): void {
  const nodes: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh && !(o as THREE.LineSegments).isLineSegments) nodes.push(o);
  });
  const matCache = new Map<string, THREE.Material>();
  for (const node of nodes) {
    const candidates = node.children.filter((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.name || m.userData.keep) return false;
      if (m.children.some((cc) => !(cc as THREE.LineSegments).isLineSegments)) return false;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as AnyMat[];
      return !mats.some((mm) => mm.type === 'ShaderMaterial' || (mm as THREE.MeshBasicMaterial).wireframe);
    }) as THREE.Mesh[];
    if (candidates.length < 2) continue;
    const buckets = new Map<string, Bucket>();
    const lineGeos: THREE.BufferGeometry[] = [];
    let lineMat: THREE.Material | null = null;
    for (const m of candidates) {
      m.updateMatrix();
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as AnyMat[];
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const total = geo.getAttribute('position').count;
      const groups = Array.isArray(m.material) && m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
      const flip = m.matrix.determinant() < 0;
      for (const g of groups) {
        const mat = mats[g.materialIndex ?? 0] ?? mats[0];
        if (!mat || g.count <= 0) continue;
        const sub = extract(geo, g.start, Math.min(g.count, total - g.start));
        sub.applyMatrix4(m.matrix);
        if (flip) flipWinding(sub);
        bakeColor(sub, mat);
        const key = `${signature(mat)}#${m.castShadow}#${m.receiveShadow}`;
        let b = buckets.get(key);
        if (!b) {
          b = { mat, geos: [], cast: m.castShadow, receive: m.receiveShadow };
          buckets.set(key, b);
        }
        b.geos.push(sub);
      }
      for (const c of m.children) {
        const l = c as THREE.LineSegments;
        if (!l.isLineSegments) continue;
        l.updateMatrix();
        const lg = l.geometry.clone();
        lg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(m.matrix, l.matrix));
        for (const name of Object.keys(lg.attributes)) if (name !== 'position') lg.deleteAttribute(name);
        lineGeos.push(lg.index ? lg.toNonIndexed() : lg);
        lineMat = l.material as THREE.Material;
      }
      node.remove(m);
    }
    for (const [key, b] of buckets) {
      const merged = mergeGeometries(b.geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const sig = key.split('#')[0];
      let mat = matCache.get(sig);
      if (!mat) {
        mat = b.mat.clone();
        (mat as AnyMat).color?.set(0xffffff);
        mat.vertexColors = true;
        matCache.set(sig, mat);
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      node.add(mesh);
    }
    if (lineGeos.length && lineMat) {
      const merged = mergeGeometries(lineGeos, false);
      if (merged) {
        const ls = new THREE.LineSegments(merged, lineMat);
        ls.raycast = () => {};
        node.add(ls);
      }
    }
  }
}
