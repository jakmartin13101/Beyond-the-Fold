// WebGL renderer, lighting rig, and post-processing (bloom + cinematic grade).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Settings } from '../core/settings';
import { LightPool } from './lights';
import { BillboardBatch, DebrisSystem, ShardBursts } from './particles';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    vignette: { value: 0.32 },
    damage: { value: 0 },
    lowHealth: { value: 0 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    fade: { value: 0 },
    letterbox: { value: 0 },
    chroma: { value: 0 },
    aspect: { value: 1.7 },
    shieldBreak: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, damage, lowHealth, flash, fade, letterbox, chroma, aspect, shieldBreak;
    uniform vec3 flashColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r = length(c * vec2(aspect, 1.0)) / aspect * 1.6;
      vec3 col;
      float ca = chroma * 0.006 + shieldBreak * 0.004;
      if (ca > 0.0001) {
        col.r = texture2D(tDiffuse, uv + c * ca).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - c * ca).b;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      // Gentle filmic grade: warm highlights, cool shadows.
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(1.03, 1.0, 0.95), smoothstep(0.4, 1.0, l));
      col = mix(col, col * vec3(0.94, 0.97, 1.06), 1.0 - smoothstep(0.0, 0.35, l));
      // Low health desaturation + heartbeat.
      float pulse = 0.5 + 0.5 * sin(time * 6.0);
      col = mix(col, vec3(l), lowHealth * 0.55);
      // Vignette (stronger and red when hurt).
      float v = smoothstep(0.55, 1.25, r);
      col *= 1.0 - v * vignette;
      col = mix(col, vec3(0.55, 0.02, 0.02), v * clamp(damage * 0.9 + lowHealth * (0.25 + 0.2 * pulse), 0.0, 0.85));
      // Shield break: cyan edge flash.
      col += vec3(0.2, 0.8, 1.0) * v * shieldBreak * 0.6;
      // Paper grain.
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(time) * 100.0) - 0.5;
      col += g * 0.025;
      col = mix(col, flashColor, flash);
      col *= 1.0 - fade;
      // Letterbox bars.
      float bar = letterbox * 0.115;
      if (uv.y < bar || uv.y > 1.0 - bar) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight;
  readonly lightPool: LightPool;
  readonly heroLight: THREE.PointLight;
  readonly additive: BillboardBatch;
  readonly alpha: BillboardBatch;
  readonly debris: DebrisSystem;
  readonly shards: ShardBursts;
  private width = 1;
  private height = 1;
  private settings: Settings;
  /** Automatic resolution multiplier (lowered when frames run long). */
  dynamicScale = 1;
  /** Disable to pin the resolution (benchmarks, capture). */
  adaptive = true;
  private frameAvg = 1 / 60;
  private slowT = 0;
  private fastT = 0;
  /** World-space anchor that the shadow camera follows. */
  shadowFocus = new THREE.Vector3();

  constructor(
    private container: HTMLElement,
    settings: Settings,
  ) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 1200);
    this.camera.position.set(0, 4, 22);

    // Lighting rig: warm low sun, purple sky fill, cool rim from behind.
    this.hemi = new THREE.HemisphereLight(0x8f8ad8, 0x3a2236, 1.5);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffc48a, 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 22;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 140;
    this.scene.add(this.sun, this.sun.target);
    this.rim = new THREE.DirectionalLight(0x7fd0ff, 1.7);
    this.rim.position.set(-20, 18, -30);
    this.scene.add(this.rim, this.rim.target);

    this.lightPool = new LightPool(this.scene, settings.quality === 'low' ? 4 : 8);
    // Soft "hero" fill that follows the player so the soldier always reads clearly.
    this.heroLight = new THREE.PointLight(0xfff0dc, 7, 9, 1.4);
    this.scene.add(this.heroLight);

    this.additive = new BillboardBatch(settings.quality === 'low' ? 1500 : 3000, true);
    this.alpha = new BillboardBatch(settings.quality === 'low' ? 600 : 1200, false);
    this.scene.add(this.additive.mesh, this.alpha.mesh);
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide, flatShading: true });
    this.debris = new DebrisSystem(settings.quality === 'low' ? 400 : 900, debrisMat);
    this.scene.add(this.debris.mesh);
    this.shards = new ShardBursts();
    this.scene.add(this.shards.group);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.82);
    this.bloom.enabled = settings.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.applySettings(settings);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  applySettings(s: Settings): void {
    const shadowsChanged = this.settings.shadows !== s.shadows;
    this.settings = s;
    this.bloom.enabled = s.bloom;
    this.renderer.shadowMap.enabled = s.shadows;
    this.sun.castShadow = s.shadows;
    const size = s.quality === 'high' ? 2048 : s.quality === 'medium' ? 1536 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (shadowsChanged) {
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((mm) => (mm.needsUpdate = true));
        else if (m) (m as THREE.Material).needsUpdate = true;
      });
    }
    this.resize();
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    const cap = this.settings.quality === 'high' ? 1.75 : this.settings.quality === 'medium' ? 1.25 : 1;
    const pr = Math.min(window.devicePixelRatio || 1, cap) * this.settings.resolutionScale * this.dynamicScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.grade.uniforms.aspect.value = w / h;
  }

  get size(): { w: number; h: number } {
    return { w: this.width, h: this.height };
  }

  /** Keep the sun's shadow frustum centred on the action (texel-snapped to avoid shimmer). */
  private updateSun(): void {
    const f = this.shadowFocus;
    const texel = (this.sun.shadow.camera.right - this.sun.shadow.camera.left) / this.sun.shadow.mapSize.x;
    const fx = Math.round(f.x / texel) * texel;
    const fy = Math.round(f.y / texel) * texel;
    this.sun.target.position.set(fx, fy, -4);
    this.sun.position.set(fx + 26, fy + 38, 34);
    this.rim.target.position.set(fx, fy, 0);
    this.rim.position.set(fx - 22, fy + 16, -34);
  }

  /** Adapt resolution to keep frame pacing smooth on slower GPUs. */
  private adaptResolution(dt: number): void {
    if (!this.adaptive || dt <= 0 || dt > 0.25) return;
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    if (this.frameAvg > 1 / 45) {
      this.slowT += dt;
      this.fastT = 0;
      if (this.slowT > 2.5 && this.dynamicScale > 0.6) {
        this.dynamicScale = Math.max(0.6, this.dynamicScale - 0.1);
        this.slowT = 0;
        this.resize();
      }
    } else if (this.frameAvg < 1 / 58) {
      this.fastT += dt;
      this.slowT = 0;
      if (this.fastT > 6 && this.dynamicScale < 1) {
        this.dynamicScale = Math.min(1, this.dynamicScale + 0.1);
        this.fastT = 0;
        this.resize();
      }
    }
  }

  render(dt: number, time: number): void {
    this.adaptResolution(dt);
    this.updateSun();
    this.lightPool.focusX = this.shadowFocus.x;
    this.lightPool.focusY = this.shadowFocus.y;
    this.lightPool.update(dt);
    this.additive.flush();
    this.alpha.flush();
    this.grade.uniforms.time.value = time;
    this.composer.render(dt);
  }

  /** Project a world point to CSS pixel coordinates. */
  project(x: number, y: number, z: number, out: { x: number; y: number; visible: boolean }): void {
    const v = tmpV.set(x, y, z).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.width;
    out.y = (-v.y * 0.5 + 0.5) * this.height;
    out.visible = v.z < 1 && v.z > -1;
  }

  /** Intersect a screen ray with the plane z = planeZ. */
  unproject(sx: number, sy: number, planeZ: number, out: { x: number; y: number }): void {
    const nx = (sx / this.width) * 2 - 1;
    const ny = -(sy / this.height) * 2 + 1;
    tmpV.set(nx, ny, 0.5).unproject(this.camera);
    const cam = this.camera.position;
    const dir = tmpV.sub(cam).normalize();
    const t = (planeZ - cam.z) / dir.z;
    out.x = cam.x + dir.x * t;
    out.y = cam.y + dir.y * t;
  }
}

const tmpV = new THREE.Vector3();
