import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LessEqualDepth,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  CircleGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { Gobo, Room, ViewSettings } from '../types';
import { footprint, poseCamera, poseOf, rimPoint, surfaceDims, type Rect } from '../lib/geometry';
import { hexToRgb } from '../lib/color';
import { selectArtRect, useStore } from '../store';
import { assets } from './assets';
import { SlideRenderer, createSlideTarget } from './SlideRenderer';
import { layerFrag, overlayFrag, wallFrag, worldVert } from './shaders';

type StoreState = ReturnType<typeof useStore.getState>;

/** Pointer position on the projection wall, published for the HUD. */
export interface WallHover {
  x: number;
  y: number;
  u: number;
  v: number;
}

const BEAM_SEGMENTS = 48;
/** Rim rays drawn as lines from the lens to the wall (every 90°). */
const BEAM_SPOKES = 4;

const rgb = (hex: string) => new Vector3(...hexToRgb(hex).map((c) => c / 255));

/** All scene objects belonging to one gobo. */
class GoboView {
  readonly cam = new PerspectiveCamera();
  readonly slide: WebGLRenderTarget = createSlideTarget();
  slideKey = '';
  readonly icon = new Group();
  readonly target: Mesh;
  readonly layer: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly beam: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly beamEdges: LineSegments<BufferGeometry, LineBasicMaterial>;
  private body: Mesh<CylinderGeometry, MeshStandardMaterial>;
  private lens: Mesh<CircleGeometry, MeshBasicMaterial>;
  private halo: Mesh<SphereGeometry, MeshBasicMaterial>;

  constructor(
    readonly id: string,
    wallGeometry: PlaneGeometry,
  ) {
    const bodyGeo = new CylinderGeometry(0.07, 0.09, 0.34, 24).rotateX(Math.PI / 2).translate(0, 0, 0.17);
    this.body = new Mesh(bodyGeo, new MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.6, roughness: 0.4 }));
    this.lens = new Mesh(new CircleGeometry(0.066, 24).rotateY(Math.PI), new MeshBasicMaterial());
    this.lens.position.z = -0.001;
    this.halo = new Mesh(
      new SphereGeometry(0.3, 16, 12),
      new MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.25 }),
    );
    this.halo.position.z = 0.12;
    this.icon.add(this.body, this.lens, this.halo);
    for (const o of [this.body, this.lens]) o.userData.goboId = id;

    this.target = new Mesh(
      new RingGeometry(0.05, 0.075, 32),
      new MeshBasicMaterial({ transparent: true, depthTest: false }),
    );
    this.target.renderOrder = 10;
    this.target.userData.goboId = id;
    this.target.userData.isTarget = true;

    this.layer = new Mesh(
      wallGeometry,
      new ShaderMaterial({
        vertexShader: worldVert,
        fragmentShader: layerFrag,
        blending: AdditiveBlending,
        depthWrite: false,
        depthFunc: LessEqualDepth,
        uniforms: {
          uViewProj: { value: new Matrix4() },
          uSlide: { value: this.slide.texture },
          uColor: { value: new Vector3(1, 1, 1) },
          uIntensity: { value: 1 },
          uGoboPos: { value: new Vector3() },
          uPhysical: { value: 0 },
          uRefFalloff: { value: 1 },
        },
      }),
    );
    this.layer.renderOrder = 1;

    const beamGeo = new BufferGeometry();
    beamGeo.setAttribute('position', new BufferAttribute(new Float32Array(BEAM_SEGMENTS * 3 * 3), 3));
    this.beam = new Mesh(
      beamGeo,
      new MeshBasicMaterial({ transparent: true, opacity: 0.07, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    );
    const edgeGeo = new BufferGeometry();
    edgeGeo.setAttribute('position', new BufferAttribute(new Float32Array((BEAM_SEGMENTS + BEAM_SPOKES) * 2 * 3), 3));
    this.beamEdges = new LineSegments(edgeGeo, new LineBasicMaterial({ transparent: true, opacity: 0.45 }));
    this.beam.frustumCulled = this.beamEdges.frustumCulled = false;
  }

  update(g: Gobo, view: ViewSettings, selected: boolean) {
    poseCamera(poseOf(g), this.cam);
    const color = new Color(g.color);
    this.icon.position.copy(this.cam.position);
    this.icon.quaternion.copy(this.cam.quaternion);
    this.lens.material.color.copy(color);
    this.body.material.emissive.set(selected ? 0x334455 : 0x000000);
    this.halo.visible = selected;
    this.target.position.set(g.target.x, g.target.y, 0.003);
    (this.target.material as MeshBasicMaterial).color.copy(color);
    this.target.scale.setScalar(selected ? 1.4 : 1);

    const u = this.layer.material.uniforms;
    u.uViewProj.value.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
    u.uColor.value.copy(rgb(g.color));
    u.uIntensity.value = g.intensity;
    u.uGoboPos.value.copy(this.cam.position);
    u.uPhysical.value = view.physicalFalloff ? 1 : 0;
    const d = new Vector3(g.target.x, g.target.y, 0).sub(this.cam.position).negate();
    const dist = Math.max(d.length(), 1e-3);
    u.uRefFalloff.value = Math.max(d.z / dist, 1e-3) / (dist * dist);

    const lit = g.visible && (view.soloId === null || view.soloId === g.id);
    this.layer.visible = lit;
    this.beam.visible = this.beamEdges.visible = lit && view.beams;
    this.beam.material.color.copy(color);
    this.beamEdges.material.color.copy(color);
    this.updateBeam(dist);
  }

  /** Cone from the lens to the beam's elliptical footprint (rim rays that miss the wall are cut short). */
  private updateBeam(dist: number) {
    const o = this.cam.position;
    const rim = footprint(this.cam, BEAM_SEGMENTS).map((p, i) => {
      if (p) return p.setZ(0.002);
      const [x, y] = rimPoint((i / BEAM_SEGMENTS) * Math.PI * 2);
      const dir = new Vector3(x, y, 0.5).unproject(this.cam).sub(o).normalize();
      return o.clone().addScaledVector(dir, dist * 1.5);
    });
    const tri = this.beam.geometry.attributes.position as BufferAttribute;
    const edge = this.beamEdges.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < BEAM_SEGMENTS; i++) {
      const a = rim[i];
      const b = rim[(i + 1) % BEAM_SEGMENTS];
      tri.setXYZ(i * 3, o.x, o.y, o.z);
      tri.setXYZ(i * 3 + 1, a.x, a.y, a.z);
      tri.setXYZ(i * 3 + 2, b.x, b.y, b.z);
      edge.setXYZ(i * 2, a.x, a.y, a.z);
      edge.setXYZ(i * 2 + 1, b.x, b.y, b.z);
    }
    for (let k = 0; k < BEAM_SPOKES; k++) {
      const a = rim[(k * BEAM_SEGMENTS) / BEAM_SPOKES];
      const j = (BEAM_SEGMENTS + k) * 2;
      edge.setXYZ(j, o.x, o.y, o.z);
      edge.setXYZ(j + 1, a.x, a.y, a.z);
    }
    tri.needsUpdate = edge.needsUpdate = true;
  }

  dispose() {
    this.slide.dispose();
    this.layer.material.dispose();
    for (const o of [this.beam, this.beamEdges, this.target, this.body, this.lens, this.halo]) {
      o.geometry.dispose();
      (o.material as { dispose(): void }).dispose();
    }
  }
}

export class SceneController {
  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(50, 1, 0.05, 500);
  private wallCam = new OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  private povCam = new PerspectiveCamera(50, 1, 0.02, 200);
  private orbit: OrbitControls;
  private transform: TransformControls;
  private slides: SlideRenderer;

  private room = new Group();
  private roomSurfaces: Mesh[] = [];
  private wallGeometry = new PlaneGeometry(1, 1);
  private wall: Mesh<PlaneGeometry, ShaderMaterial>;
  private overlay: Mesh<PlaneGeometry, ShaderMaterial>;
  private icons = new Group();
  private beams = new Group();
  private targets = new Group();
  private layers = new Group();
  private views = new Map<string, GoboView>();
  private previewDirty = new Set<string>();
  private previewWatchers = new Map<string, Set<{ size: number; cb: (c: HTMLCanvasElement) => void }>>();

  private roomKey = '';
  private raf = 0;
  private unsubscribe: () => void;
  private resizeObserver: ResizeObserver;
  private raycaster = new Raycaster();
  private pointerDown: Vector2 | null = null;
  private dragging = false;

  onHover: (h: WallHover | null) => void = () => {};

  constructor(private container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000);
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);
    this.slides = new SlideRenderer(this.renderer);

    this.scene.background = new Color(0x0b0c10);
    this.scene.add(new AmbientLight(0xffffff, 0.35), new HemisphereLight(0x8899bb, 0x221a14, 0.5));
    this.scene.add(this.room, this.layers, this.targets, this.icons, this.beams);

    this.wall = new Mesh(
      this.wallGeometry,
      new ShaderMaterial({ vertexShader: worldVert, fragmentShader: wallFrag, uniforms: { uAmbient: { value: 0.1 } } }),
    );
    this.wall.name = 'projection-wall';
    this.overlay = new Mesh(
      this.wallGeometry,
      new ShaderMaterial({
        vertexShader: worldVert,
        fragmentShader: overlayFrag,
        transparent: true,
        depthWrite: false,
        depthFunc: LessEqualDepth,
        uniforms: {
          uRef: { value: null },
          uRefOpacity: { value: 0 },
          uGrid: { value: 1 },
          uArtRect: { value: new Vector4() },
          uWallSize: { value: new Vector2() },
        },
      }),
    );
    this.overlay.renderOrder = 5;
    this.layers.add(this.wall, this.overlay);

    this.camera.position.set(4, 1.5, 9);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.target.set(0, 0, 2);

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setSpace('world');
    this.transform.size = 0.8;
    this.scene.add(this.transform.getHelper());
    this.transform.addEventListener('dragging-changed', (e) => {
      this.dragging = Boolean(e.value);
      this.orbit.enabled = !this.dragging;
    });
    this.transform.addEventListener('objectChange', () => this.onTransform());

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (this.pointerDown = new Vector2(e.clientX, e.clientY)));
    el.addEventListener('pointerup', (e) => this.onClick(e));
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerleave', () => this.onHover(null));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.unsubscribe = useStore.subscribe((s) => this.sync(s));
    this.sync(useStore.getState());
    this.loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.transform.dispose();
    this.orbit.dispose();
    this.views.forEach((v) => v.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------- state sync

  private sync(s: StoreState) {
    this.syncRoom(s.room, s.view);
    const art = selectArtRect(s);

    const ou = this.overlay.material.uniforms;
    ou.uRef.value = assets.reference;
    ou.uRefOpacity.value = s.view.reference && assets.reference ? s.view.referenceOpacity : 0;
    ou.uGrid.value = s.view.grid ? 1 : 0;
    ou.uArtRect.value.set(art.x0, art.y0, art.w, art.h);
    this.wall.material.uniforms.uAmbient.value = s.view.ambient;

    const live = new Set(s.gobos.map((g) => g.id));
    for (const [id, v] of this.views) {
      if (live.has(id)) continue;
      this.layers.remove(v.layer);
      this.icons.remove(v.icon);
      this.targets.remove(v.target);
      this.beams.remove(v.beam, v.beamEdges);
      v.dispose();
      this.views.delete(id);
    }
    for (const g of s.gobos) {
      let v = this.views.get(g.id);
      if (!v) {
        v = new GoboView(g.id, this.wallGeometry);
        this.views.set(g.id, v);
        this.layers.add(v.layer);
        this.icons.add(v.icon);
        this.targets.add(v.target);
        this.beams.add(v.beam, v.beamEdges);
      }
      v.update(g, s.view, g.id === s.selectedId);
      this.renderSlide(v, g, art, s.artwork.aspect, s.assetsVersion);
    }
    this.icons.visible = this.targets.visible = s.view.icons;
    this.syncTransform(s);
  }

  private syncRoom(room: Room, view: ViewSettings) {
    const key = JSON.stringify([room, view.wireframe]);
    if (key === this.roomKey) return;
    const firstBuild = this.roomKey === '';
    this.roomKey = key;
    const { width: W, height: H, depth: D } = surfaceDims(room);

    this.room.traverse((o) => {
      if (o instanceof Mesh || o instanceof LineSegments) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    this.room.clear();
    this.roomSurfaces = [];
    const surface = (w: number, h: number, color: number, place: (o: Object3D) => void) => {
      const m = new Mesh(
        new PlaneGeometry(w, h, view.wireframe ? Math.ceil(w * 2) : 1, view.wireframe ? Math.ceil(h * 2) : 1),
        new MeshStandardMaterial({ color, roughness: 0.95, wireframe: view.wireframe }),
      );
      place(m);
      this.room.add(m);
      this.roomSurfaces.push(m);
    };
    surface(W, D, 0x3a352f, (o) => (o.rotation.x = -Math.PI / 2, o.position.set(0, -H / 2, D / 2)));
    surface(W, D, 0x24262b, (o) => (o.rotation.x = Math.PI / 2, o.position.set(0, H / 2, D / 2)));
    surface(D, H, 0x2c2f36, (o) => (o.rotation.y = Math.PI / 2, o.position.set(-W / 2, 0, D / 2)));
    surface(D, H, 0x2c2f36, (o) => (o.rotation.y = -Math.PI / 2, o.position.set(W / 2, 0, D / 2)));
    surface(W, H, 0x2c2f36, (o) => (o.rotation.y = Math.PI, o.position.set(0, 0, D)));
    const edges = new LineSegments(
      new EdgesGeometry(new BoxGeometry(W, H, D)),
      new LineBasicMaterial({ color: 0x5a6070, transparent: true, opacity: 0.6 }),
    );
    edges.position.z = D / 2;
    this.room.add(edges);

    this.wallGeometry.dispose();
    const wallGeo = new PlaneGeometry(W, H, view.wireframe ? Math.ceil(W * 2) : 1, view.wireframe ? Math.ceil(H * 2) : 1);
    this.wallGeometry = wallGeo;
    this.wall.geometry = wallGeo;
    this.overlay.geometry = wallGeo;
    this.views.forEach((v) => (v.layer.geometry = wallGeo));
    this.overlay.material.uniforms.uWallSize.value.set(W, H);

    if (firstBuild) {
      this.orbit.target.set(0, 0, D * 0.4);
      this.camera.position.set(W * 0.45, H * 0.2, D * 1.6);
    }
  }

  private renderSlide(v: GoboView, g: Gobo, art: Rect, artAspect: number, assetsVersion: number) {
    const key = JSON.stringify([g.layer, g.calibration, g.correction.enabled && g.correction.pose, art, assetsVersion]);
    if (key === v.slideKey) return;
    v.slideKey = key;
    this.slides.render(g, assets.masks.get(g.layer), art, artAspect, v.slide);
    this.previewDirty.add(g.id);
  }

  /**
   * Subscribe to live previews of a gobo's slide. The callback receives a fresh grayscale
   * canvas (`size` px across) right away and again whenever the slide changes.
   */
  watchSlide(id: string, size: number, cb: (slide: HTMLCanvasElement) => void) {
    const entry = { size, cb };
    let set = this.previewWatchers.get(id);
    if (!set) this.previewWatchers.set(id, (set = new Set()));
    set.add(entry);
    this.previewDirty.add(id);
    return () => {
      set.delete(entry);
    };
  }

  /** Read back changed slides for preview watchers, at most once per gobo per frame. */
  private flushPreviews() {
    if (!this.previewDirty.size) return;
    for (const id of this.previewDirty) {
      const watchers = this.previewWatchers.get(id);
      if (!watchers?.size) continue;
      const sizes = new Map<number, HTMLCanvasElement | null>();
      for (const w of watchers) {
        if (!sizes.has(w.size)) sizes.set(w.size, this.slideCanvas(id, w.size));
        const canvas = sizes.get(w.size);
        if (canvas) w.cb(canvas);
      }
    }
    this.previewDirty.clear();
  }

  /** Slide image (what is etched on the gobo) for previews and export. */
  slideCanvas(id: string, longest: number) {
    const s = useStore.getState();
    const g = s.gobos.find((x) => x.id === id);
    if (!g) return null;
    return this.slides.toCanvas(g, assets.masks.get(g.layer), selectArtRect(s), s.artwork.aspect, longest);
  }

  // ---------------------------------------------------------------- interaction

  private syncTransform(s: StoreState) {
    const v = s.selectedId ? this.views.get(s.selectedId) : undefined;
    const enabled = v && s.view.mode === 'room' && s.view.icons;
    const obj = !enabled ? null : s.view.dragMode === 'target' ? v.target : v.icon;
    if (obj !== this.transform.object) {
      if (obj) this.transform.attach(obj);
      else this.transform.detach();
    }
    this.transform.showZ = s.view.dragMode !== 'target';
  }

  private onTransform() {
    const s = useStore.getState();
    const id = s.selectedId;
    const obj = this.transform.object;
    if (!id || !obj) return;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    if (s.view.dragMode === 'target') {
      obj.position.z = 0.003;
      s.updateGobo(id, { target: { x: r(obj.position.x), y: r(obj.position.y) } });
    } else {
      s.updateGobo(id, { position: { x: r(obj.position.x), y: r(obj.position.y), z: r(obj.position.z) } });
    }
  }

  private ndc(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  private onClick(e: PointerEvent) {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || down.distanceTo(new Vector2(e.clientX, e.clientY)) > 4 || this.dragging) return;
    const s = useStore.getState();
    if (s.view.mode !== 'room' || !s.view.icons) return;
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hit = this.raycaster.intersectObjects([this.icons, this.targets], true).find((h) => h.object.userData.goboId);
    if (hit) {
      s.select(hit.object.userData.goboId);
      if (hit.object.userData.isTarget) s.setView({ dragMode: 'target' });
      else if (s.view.dragMode === 'target' && s.selectedId !== hit.object.userData.goboId) s.setView({ dragMode: 'body' });
    } else if (!this.transform.axis) {
      s.select(null);
    }
  }

  private onPointerMove(e: PointerEvent) {
    const s = useStore.getState();
    const cam = this.activeCamera(s.view);
    this.raycaster.setFromCamera(this.ndc(e), cam);
    const hit = this.raycaster.intersectObject(this.wall, false)[0];
    if (!hit) return this.onHover(null);
    const { width, height } = surfaceDims(s.room);
    this.onHover({ x: hit.point.x, y: hit.point.y, u: hit.point.x / width + 0.5, v: hit.point.y / height + 0.5 });
  }

  // ---------------------------------------------------------------- rendering

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  private fitWallCam(aspect: number, room: Room) {
    const { width, height } = surfaceDims(room);
    const m = 1.06;
    let hw = (width / 2) * m;
    let hh = (height / 2) * m;
    if (hw / hh > aspect) hh = hw / aspect;
    else hw = hh * aspect;
    Object.assign(this.wallCam, { left: -hw, right: hw, top: hh, bottom: -hh });
    this.wallCam.position.set(0, 0, 50);
    this.wallCam.lookAt(0, 0, 0);
    this.wallCam.updateProjectionMatrix();
  }

  private activeCamera(view: ViewSettings) {
    if (view.mode === 'wall') return this.wallCam;
    if (view.mode === 'gobo') return this.povCam;
    return this.camera;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.flushPreviews();
    const s = useStore.getState();
    const view = s.view;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new Vector2());
    const [W, H] = [size.x / r.getPixelRatio(), size.y / r.getPixelRatio()];
    if (view.mode === 'room') this.orbit.update();

    const selected = s.gobos.find((g) => g.id === s.selectedId);
    let mainCam: PerspectiveCamera | OrthographicCamera = this.camera;
    if (view.mode === 'wall') {
      this.fitWallCam(W / H, s.room);
      mainCam = this.wallCam;
    } else if (view.mode === 'gobo' && selected) {
      poseCamera(poseOf(selected), this.povCam);
      this.povCam.aspect = W / H;
      this.povCam.updateProjectionMatrix();
      mainCam = this.povCam;
    }

    const showHelpers = view.mode === 'room';
    const povIcon = view.mode === 'gobo' && selected ? this.views.get(selected.id)?.icon : undefined;
    this.beams.visible = showHelpers;
    this.icons.visible = this.targets.visible = view.icons && view.mode !== 'wall';
    if (povIcon) povIcon.visible = false;
    this.transform.getHelper().visible = showHelpers;

    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.clear();
    r.render(this.scene, mainCam);
    if (povIcon) povIcon.visible = true;

    if (view.compositeInset && view.mode !== 'wall') {
      const iw = Math.round(Math.min(W * 0.32, 420));
      const ih = Math.round(iw * 0.62);
      const pad = 12;
      this.fitWallCam(iw / ih, s.room);
      this.beams.visible = this.icons.visible = this.targets.visible = false;
      this.transform.getHelper().visible = false;
      r.setScissorTest(true);
      r.setScissor(W - iw - pad, pad, iw, ih);
      r.setViewport(W - iw - pad, pad, iw, ih);
      r.clear();
      r.render(this.scene, this.wallCam);
      r.setScissorTest(false);
    }
  };
}
