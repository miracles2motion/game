import * as THREE from 'three';

/** Gradient sky dome + sun disc + lighting rig (warm desert afternoon). */
export function buildSky(scene, quality) {
  const uniforms = {
    top: { value: new THREE.Color(0x6f9ac4) },
    mid: { value: new THREE.Color(0xc9d3d8) },
    bottom: { value: new THREE.Color(0xd8cdb4) },
    sunDir: { value: new THREE.Vector3(0.45, 0.35, -0.82).normalize() },
    sunColor: { value: new THREE.Color(0xfff1d0) },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 top, mid, bottom, sunDir, sunColor; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -1.0, 1.0);
        vec3 col = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bottom, clamp(-h*4.0,0.0,1.0));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * (pow(s, 900.0) * 1.6 + pow(s, 12.0) * 0.18 + pow(s, 3.0) * 0.05);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
  dome.name = 'sky'; dome.frustumCulled = false; dome.renderOrder = -10;
  scene.add(dome);

  scene.fog = new THREE.Fog(0xd3cbb8, 40, quality.fogFar);
  scene.background = new THREE.Color(0xd3cbb8);

  const hemi = new THREE.HemisphereLight(0x9fb7d1, 0xa08a62, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe9c4, 2.6);
  sun.position.copy(uniforms.sunDir.value).multiplyScalar(120);
  sun.castShadow = quality.shadowMap > 0;
  sun.shadow.mapSize.set(quality.shadowMap || 512, quality.shadowMap || 512);
  const s = 70;
  sun.shadow.camera.left = -s; sun.shadow.camera.right = s; sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);

  return {
    dome, sun, hemi,
    /** Keep shadow frustum centred on player for crisp nearby shadows. */
    follow(pos) {
      sun.target.position.set(pos.x, 0, pos.z);
      sun.position.copy(uniforms.sunDir.value).multiplyScalar(120).add(sun.target.position);
      dome.position.copy(pos);
    },
    setQuality(q) {
      sun.castShadow = q.shadowMap > 0;
      if (q.shadowMap) { sun.shadow.mapSize.set(q.shadowMap, q.shadowMap); sun.shadow.map?.dispose(); sun.shadow.map = null; }
      scene.fog.far = q.fogFar;
    },
  };
}
