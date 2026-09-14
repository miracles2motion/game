import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const _tri = new THREE.Triangle();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _seg = new THREE.Line3();
const _box = new THREE.Box3();
const _mat = new THREE.Matrix4();
const _ray = new THREE.Raycaster();

/** Wraps the merged static world mesh with a BVH and offers capsule + ray queries. */
export class WorldCollider {
  constructor(mesh) {
    this.mesh = mesh;
    mesh.updateMatrixWorld(true);
    mesh.geometry.boundsTree = new MeshBVH(mesh.geometry, { maxLeafTris: 8 });
    this.bvh = mesh.geometry.boundsTree;
    this.invMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  }

  /**
   * Resolve a capsule (segment start→end with radius) against the world.
   * Returns the correction vector to push the capsule out of geometry (world space).
   * start/end are the bottom/top sphere centres of the capsule.
   */
  resolveCapsule(start, end, radius, out) {
    _seg.start.copy(start); _seg.end.copy(end);
    _box.makeEmpty(); _box.expandByPoint(start); _box.expandByPoint(end);
    _box.min.addScalar(-radius); _box.max.addScalar(radius);
    out.set(0, 0, 0);
    let hit = false;
    this.bvh.shapecast({
      intersectsBounds: box => box.intersectsBox(_box),
      intersectsTriangle: tri => {
        const dist = tri.closestPointToSegment(_seg, _tmp, _tmp2);
        if (dist < radius) {
          const depth = radius - dist;
          const dir = _tmp2.sub(_tmp).normalize();
          _seg.start.addScaledVector(dir, depth);
          _seg.end.addScaledVector(dir, depth);
          out.addScaledVector(dir, depth);
          hit = true;
        }
      },
    });
    return hit;
  }

  /** Raycast against world. Returns {point, distance, normal} or null. */
  raycast(origin, dir, far = 300) {
    _ray.set(origin, dir); _ray.far = far; _ray.firstHitOnly = true;
    const hits = _ray.intersectObject(this.mesh, false);
    if (!hits.length) return null;
    const h = hits[0];
    return { point: h.point, distance: h.distance, normal: h.face?.normal || _tmp.set(0, 1, 0) };
  }

  /** Line of sight between two points (true if unobstructed). */
  clear(a, b) {
    const d = _tmp.subVectors(b, a); const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    const h = this.raycast(a, d, len);
    return !h;
  }
}
