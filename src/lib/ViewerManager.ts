import {
  detectGpuCapabilities,
  GpuCapabilities,
  GpuTier,
} from "./gpuDetection";
import { disposeHierarchy, isSafeModelUrl } from "./utils";
import JSZip from "jszip";

export interface FlyThroughState {
  active: boolean;
  isPlaying: boolean;
  curveId: number | null;
  curveName: string | null;
  progress: number;
  speed: number;
  direction: number;
  loop: boolean;
  fov: number;
  showReticle: boolean;
  totalDistance: number;
  currentDistance: number;
  yawOffset: number;
  pitchOffset: number;
  pathOffsetX: number;
  pathOffsetY: number;
}

export interface SplineClippingState {
  active: boolean;
  curveId: number | null;
  curveName: string | null;
  progress: number;
  totalDistance: number;
  currentDistance: number;
  invert: boolean;
  alignCamera: boolean;
  zoomLevel: number;
}

export interface ModelStats {
  filename: string;
  fileFormat: string;
  triangleCount: number;
  vertexCount: number;
  meshCount: number;
  materialCount: number;
  dimensions: {
    x: number;
    y: number;
    z: number;
  };
  boundingBox?: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

function sanitizeHtml(a) {
  return typeof a != "string"
    ? ""
    : a
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
export class ViewerManager {
  [key: string]: any;
  constructor(i, r) {
    ((this.currentMeshes = []),
      (this.theme = "light"),
      (this.originalColors = new Map()),
      (this.highlightedMesh = null),
      (this.treeParseInterval = null),
      (this.transformControl = null),
      (this.onTransformBlockNav = null),
      (this.planningMode = "none"),
      (this.resnappingAnnotationId = null),
      (this.planningPoints = []),
      (this.planningNormals = []),
      (this.planningPointMarkers = []),
      (this.planningObjects = []),
      (this.planningGroups = []),
      (this.nextPlanningObjectId = 1),
      (this.defaultCamera = null),
      (this.loadedFilename = null),
      (this.loadedUrl = null),
      (this.modelBBox = null),
      (this.topRulerRef = null),
      (this.leftRulerRef = null),
      (this.rulersVisible = !1),
      (this.isAutoRotating = !1),
      (this.rulerAnimationFrame = null),
      (this.lastPlanesState = null),
      (this.lastCameraState = ""),
      (this.forceNextOverlayUpdate = !0),
      (this.gpuCapabilities = null),
      (this.onContextLostHandler = null),
      (this.onContextRestoredHandler = null),
      (this.isRotatingTool = !1),
      (this.rotationCueGroup = null),
      (this.rotationBadgeDiv = null),
      (this.rotationStartQuat = null),
      (this.rotationStartPos = null),
      (this.rotationAxisName = null),
      (this.isTranslatingTool = !1),
      (this.translationCueGroup = null),
      (this.translationBadgeDiv = null),
      (this.translationStartPos = null),
      (this.translationAxisName = null),
      (this.cardTooltipDiv = null),
      (this.hoveredPlanningObject = null),
      (this.isGhostingMode = !1),
      (this.ghostedOriginals = new Map()),
      (this.flyThroughState = {
        active: !1,
        isPlaying: !1,
        curveId: null,
        curveName: null,
        progress: 0,
        speed: 1,
        direction: 1,
        loop: !0,
        fov: 75,
        showReticle: !0,
        totalDistance: 0,
        currentDistance: 0,
        yawOffset: 0,
        pitchOffset: 0,
        pathOffsetX: 0,
        pathOffsetY: 0,
      }),
      (this.preFlyThroughCamera = null),
      (this.preFlyThroughNear = null),
      (this.preFlyThroughFov = null),
      (this.lastFlyThroughTimestamp = 0),
      (this.flyThroughUpVector = null),
      (this.splineClippingState = {
        active: !1,
        curveId: null,
        curveName: null,
        progress: 0.5,
        totalDistance: 0,
        currentDistance: 0,
        invert: !1,
        alignCamera: !1,
        zoomLevel: 1,
      }),
      (this.splineClipPlane = null),
      (this.preSplineClipCamera = null),
      (this.isDisposed = !1),
      (this.resizeObserver = null),
      (this.onPointerDown = null),
      (this.onPointerUp = null),
      (this.annotationSvgOverlay = null),
      (this.highlightedPlanningObj = null),
      (this.domUpdateLoop = () => {
        var l, u, s, c, f, d, h, m, x, b, y;
        if (!this.isDisposed) {
          try {
            if (this.lastPlanesState) {
              let w = !1;
              for (const C of ["x", "y", "z"])
                if (
                  (l = this.lastPlanesState[C]) != null &&
                  l.active &&
                  (u = this.lastPlanesState[C]) != null &&
                  u.alignToCamera
                ) {
                  w = !0;
                  break;
                }
              w && this.updateClippingPlanes(this.lastPlanesState);
            }
            if (
              (c = (s = this.viewer) == null ? void 0 : s.viewer) != null &&
              c.navigation
            ) {
              if (this.flyThroughState.active && window.THREE) {
                const z = performance.now();
                if (this.flyThroughState.isPlaying) {
                  const _ = Math.min(
                      (z - (this.lastFlyThroughTimestamp || z)) / 1e3,
                      0.1,
                    ),
                    N = this.flyThroughState.totalDistance || 100,
                    j =
                      ((25 * this.flyThroughState.speed) / Math.max(1, N)) *
                      _ *
                      this.flyThroughState.direction;
                  let V = this.flyThroughState.progress + j;
                  (V >= 1
                    ? this.flyThroughState.loop
                      ? (V = 0)
                      : ((V = 1), (this.flyThroughState.isPlaying = !1))
                    : V <= 0 &&
                      (this.flyThroughState.loop
                        ? (V = 1)
                        : ((V = 0), (this.flyThroughState.isPlaying = !1))),
                    (this.flyThroughState.progress = V),
                    (this.flyThroughState.currentDistance = V * N),
                    this.updateFlyThroughCamera(),
                    this.config.onFlyThroughStateChange &&
                      this.config.onFlyThroughStateChange({
                        ...this.flyThroughState,
                      }));
                }
                this.lastFlyThroughTimestamp = z;
              } else if (this.isAutoRotating && window.THREE) {
                const z = this.viewer.viewer.navigation;
                let _ = null;
                if (typeof z.GetCamera == "function") _ = z.GetCamera();
                else if (z.camera) {
                  const N = z.camera;
                  _ = new window.OV.Camera(
                    new window.OV.Coord3D(
                      N.position.x,
                      N.position.y,
                      N.position.z,
                    ),
                    new window.OV.Coord3D(
                      ((d = (f = z.controls) == null ? void 0 : f.target) ==
                      null
                        ? void 0
                        : d.x) || 0,
                      ((m = (h = z.controls) == null ? void 0 : h.target) ==
                      null
                        ? void 0
                        : m.y) || 0,
                      ((b = (x = z.controls) == null ? void 0 : x.target) ==
                      null
                        ? void 0
                        : b.z) || 0,
                    ),
                    new window.OV.Coord3D(N.up.x, N.up.y, N.up.z),
                    N.fov || 45,
                  );
                }
                if (_ && _.eye && _.center && _.up) {
                  const N = _.eye,
                    O = _.center,
                    j = _.up,
                    V = new window.THREE.Vector3(
                      N.x - O.x,
                      N.y - O.y,
                      N.z - O.z,
                    ),
                    U = new window.THREE.Vector3(j.x, j.y, j.z).normalize();
                  V.applyAxisAngle(U, 0.005);
                  const q = new window.THREE.Vector3(O.x, O.y, O.z).add(V),
                    G = new window.OV.Camera(
                      new window.OV.Coord3D(q.x, q.y, q.z),
                      new window.OV.Coord3D(O.x, O.y, O.z),
                      new window.OV.Coord3D(j.x, j.y, j.z),
                      _.fov || 45,
                    );
                  (z.SetCamera(G), this.viewer.viewer.Render());
                }
              }
              let w = null;
              typeof this.viewer.viewer.navigation.GetCamera == "function"
                ? (w = this.viewer.viewer.navigation.GetCamera())
                : this.viewer.viewer.navigation.camera &&
                  (w = {
                    eye: this.viewer.viewer.navigation.camera.position,
                    center:
                      ((y = this.viewer.viewer.navigation.controls) == null
                        ? void 0
                        : y.target) || new window.THREE.Vector3(),
                  });
              let C = !1;
              if (w && w.eye && w.center) {
                const z = this.container.clientWidth,
                  _ = this.container.clientHeight,
                  N = `${Math.round(w.eye.x * 50)},${Math.round(w.eye.y * 50)},${Math.round(w.eye.z * 50)},${Math.round(w.center.x * 50)},${Math.round(w.center.y * 50)},${Math.round(w.center.z * 50)},${z},${_}`;
                N !== this.lastCameraState &&
                  ((this.lastCameraState = N), (C = !0));
              }
              const k =
                this.isRotatingTool ||
                this.isTranslatingTool ||
                this.isAutoRotating ||
                this.flyThroughState.isPlaying;
              ((C || k || this.forceNextOverlayUpdate) &&
                this.planningObjects &&
                ((this.forceNextOverlayUpdate = !1),
                this.planningObjects.forEach((z) => {
                  (z.labelDiv || z.leaderLine) &&
                    (z.type === "annotation" ||
                      z.type === "measurement" ||
                      z.type === "angle") &&
                    this.updatePlanningCardLabel(z);
                })),
                this.isRotatingTool && this.updateRotationVisualCue(),
                this.isTranslatingTool && this.updateTranslationVisualCue(),
                this.rulersVisible &&
                  C &&
                  w &&
                  w.eye &&
                  w.center &&
                  (this.resizeRulers(),
                  this.drawRulers(w, this.topRulerRef, this.leftRulerRef)));
            }
          } catch (w) {
            console.error("DOM update error:", w);
          }
          this.isDisposed ||
            (this.rulerAnimationFrame = requestAnimationFrame(
              this.domUpdateLoop,
            ));
        }
      }),
      (this.container = i),
      (this.config = r),
      window.THREE &&
        !window.THREE.Object3D.prototype.removeFromParent &&
        (window.THREE.Object3D.prototype.removeFromParent = function () {
          this.parent !== null && this.parent.remove(this);
        }),
      this.initViewer(),
      this.setupRaycaster());
  }
  setTheme(i, r = !1) {
    if (
      ((this.theme = i),
      (this.lastCameraState = ""),
      this.viewer && this.viewer.viewer)
    )
      if (r)
        try {
          this.viewer.viewer.renderer &&
            (this.viewer.viewer.renderer.setClearAlpha(0),
            this.viewer.viewer.Render());
        } catch {}
      else {
        const l =
          i === "dark"
            ? new window.OV.RGBAColor(2, 6, 23, 255)
            : new window.OV.RGBAColor(255, 255, 255, 255);
        try {
          (this.viewer.viewer.SetBackgroundColor(l),
            this.viewer.viewer.renderer &&
              this.viewer.viewer.renderer.setClearAlpha(1),
            this.viewer.viewer.Render());
        } catch {}
      }
  }
  setRulerCanvases(i, r) {
    ((this.topRulerRef = i), (this.leftRulerRef = r));
  }
  initViewer() {
    if (!this.viewer)
      try {
        window.OV &&
          window.OV.SetExternalLibLocation &&
          window.OV.SetExternalLibLocation(
            "https://cdn.jsdelivr.net/npm/online-3d-viewer@0.18.0/build/libs",
          );
        const i =
          this.theme === "dark"
            ? new window.OV.RGBAColor(2, 6, 23, 255)
            : new window.OV.RGBAColor(255, 255, 255, 255);
        ((this.viewer = new window.OV.EmbeddedViewer(this.container, {
          backgroundColor: i,
          defaultColor: new window.OV.RGBColor(200, 200, 200),
          edgeSettings: new window.OV.EdgeSettings(
            !1,
            new window.OV.RGBColor(0, 0, 0),
            1,
          ),
        })),
          this.enforceFreeOrbit(),
          this.initTransformControls(),
          detectGpuCapabilities()
            .then((r) => {
              ((this.gpuCapabilities = r),
                this.config.onGpuTierChange &&
                  this.config.onGpuTierChange(r.tier),
                this.applyGpuTierSettings());
            })
            .catch((r) => {
              console.warn(
                "[ViewerManager] GPU capability detection error:",
                r,
              );
            }),
          (this.resizeObserver = new ResizeObserver(() => {
            (this.viewer && this.viewer.Resize(),
              this.rulersVisible &&
                (this.resizeRulers(), (this.lastCameraState = "")));
          })),
          this.resizeObserver.observe(this.container),
          this.domUpdateLoop());
      } catch (i) {
        console.error("Viewer initialization failed:", i);
      }
  }
  applyGpuTierSettings() {
    var u, s;
    if (!(
      (s = (u = this.viewer) == null ? void 0 : u.viewer) != null && s.renderer
    ))
      return;
    const i = this.viewer.viewer.renderer,
      r = this.gpuCapabilities;
    if (typeof i.setPixelRatio == "function") {
      let c = 2;
      (!r || r.tier === "unsupported" || r.architecture === "Legacy WebGL"
        ? (c = 1)
        : r.tier === "webgl2" && (c = 1.5),
        i.setPixelRatio(Math.min(window.devicePixelRatio || 1, c)));
    }
    const l = i.domElement;
    l &&
      !this.onContextLostHandler &&
      ((this.onContextLostHandler = (c) => {
        (c.preventDefault(),
          console.warn(
            "[ViewerManager] WebGL context lost. Suspending render operations.",
          ),
          this.config.onContextLostChange &&
            this.config.onContextLostChange(!0));
      }),
      (this.onContextRestoredHandler = () => {
        var c;
        if (
          (console.info(
            "[ViewerManager] WebGL context restored. Re-initializing scene.",
          ),
          this.config.onContextLostChange &&
            this.config.onContextLostChange(!1),
          (c = this.viewer) != null && c.viewer)
        )
          try {
            this.viewer.viewer.Render();
          } catch {}
      }),
      l.addEventListener("webglcontextlost", this.onContextLostHandler, !1),
      l.addEventListener(
        "webglcontextrestored",
        this.onContextRestoredHandler,
        !1,
      ));
  }
  getRadialSegments(i = 32, r = 16, l = 12) {
    return !this.gpuCapabilities ||
      this.gpuCapabilities.tier === "unsupported" ||
      this.gpuCapabilities.architecture === "Legacy WebGL"
      ? l
      : this.gpuCapabilities.isFallback
        ? r
        : i;
  }
  enforceFreeOrbit() {
    if (!(
      !this.viewer ||
      !this.viewer.viewer ||
      !this.viewer.viewer.navigation
    )) {
      try {
        if (
          typeof this.viewer.viewer.navigation.SetNavigationMode == "function"
        ) {
          const i =
            window.OV &&
            window.OV.NavigationMode &&
            window.OV.NavigationMode.FreeOrbit
              ? window.OV.NavigationMode.FreeOrbit
              : 2;
          this.viewer.viewer.navigation.SetNavigationMode(i);
        } else
          ((this.viewer.viewer.navigation.fixUpVector = !1),
            (this.viewer.viewer.navigation.navigationMode = 2));
        ((this.viewer.viewer.navigation.fixUpVector = !1),
          typeof this.viewer.viewer.SetUpVector == "function" &&
            this.viewer.viewer.SetUpVector(3, !1));
      } catch {}
      if (this.viewer.viewer.scene)
        try {
          this.viewer.viewer.Render();
        } catch {}
    }
  }
  initTransformControls() {
    var u, s, c, f, d;
    if (
      !window.THREE ||
      !window.THREE.TransformControls ||
      !(
        (s = (u = this.viewer) == null ? void 0 : u.viewer) != null && s.camera
      ) ||
      !(
        (f = (c = this.viewer) == null ? void 0 : c.viewer) != null &&
        f.renderer
      )
    )
      return;
    const i = this.viewer.viewer,
      r = i.scene || i.mainScene;
    if (!r) return;
    if (this.transformControl) {
      (r.remove(this.transformControl), r.add(this.transformControl));
      return;
    }
    if (i.navigation && !i.navigation._patchedForTransform) {
      i.navigation._patchedForTransform = !0;
      const h = i.navigation.Orbit;
      typeof h == "function" &&
        (i.navigation.Orbit = function (b, y) {
          i.navigation.isTransforming || h.call(this, b, y);
        });
      const m = i.navigation.Pan;
      typeof m == "function" &&
        (i.navigation.Pan = function (b, y) {
          i.navigation.isTransforming || m.call(this, b, y);
        });
      const x = i.navigation.Zoom;
      typeof x == "function" &&
        (i.navigation.Zoom = function (b) {
          i.navigation.isTransforming || x.call(this, b);
        });
    }
    ((this.transformControl = new window.THREE.TransformControls(
      i.camera,
      i.renderer.domElement,
    )),
      this.transformControl.setSpace("local"),
      (this.transformControl.userData = this.transformControl.userData || {}),
      (this.transformControl.userData.isCustomOverlay = !0),
      r.add(this.transformControl),
      this.onTransformBlockNav ||
        (this.onTransformBlockNav = (h) => {
          this.transformControl &&
            this.transformControl.axis !== null &&
            h.stopPropagation();
        }),
      (d = i.renderer) != null &&
        d.domElement &&
        (i.renderer.domElement.addEventListener(
          "mousedown",
          this.onTransformBlockNav,
          !0,
        ),
        i.renderer.domElement.addEventListener(
          "touchstart",
          this.onTransformBlockNav,
          !0,
        )));
    const l = () => {
      var x;
      if (!this.transformControl || !this.transformControl.object) return;
      const h = this.transformControl.object,
        m = this.planningObjects.findIndex((b) => b.mesh === h);
      if (m !== -1) {
        const b = this.planningObjects[m],
          y = window.THREE;
        let w = { x: h.position.x, y: h.position.y, z: h.position.z },
          C = {
            x: h.quaternion.x,
            y: h.quaternion.y,
            z: h.quaternion.z,
            w: h.quaternion.w,
          };
        if (y) {
          const z = this.getModelRoot();
          let _ = h.matrixWorld.clone();
          if (z) {
            (x = z.updateMatrixWorld) == null || x.call(z, !0);
            const V = z.matrixWorld.clone().invert();
            _.premultiply(V);
          }
          const N = new y.Vector3(),
            O = new y.Quaternion(),
            j = new y.Vector3();
          (_.decompose(N, O, j),
            (w = { x: N.x, y: N.y, z: N.z }),
            (C = { x: O.x, y: O.y, z: O.z, w: O.w }));
        }
        const k = {
          ...b,
          posX: w.x,
          posY: w.y,
          posZ: w.z,
          rotQx: C.x,
          rotQy: C.y,
          rotQz: C.z,
          rotQw: C.w,
        };
        this.planningObjects[m] = k;
      }
    };
    (this.transformControl.addEventListener("change", () => {
      var h, m;
      try {
        (this.transformControl &&
          this.transformControl.object &&
          ((m = (h = this.transformControl.object).updateMatrixWorld) == null ||
            m.call(h, !0)),
          i.Render());
      } catch {}
      (l(),
        this.isRotatingTool && this.updateRotationVisualCue(),
        this.isTranslatingTool && this.updateTranslationVisualCue(),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange([...this.planningObjects]));
    }),
      this.transformControl.addEventListener("dragging-changed", (h) => {
        (i.navigation && (i.navigation.isTransforming = h.value),
          h.value
            ? this.transformControl &&
              this.transformControl.object &&
              (this.transformControl.mode === "rotate"
                ? this.startRotationVisualCue()
                : this.transformControl.mode === "translate" &&
                  this.startTranslationVisualCue())
            : (this.clearRotationVisualCue(),
              this.clearTranslationVisualCue(),
              l(),
              this.config.onPlanningObjectsChange &&
                this.config.onPlanningObjectsChange([...this.planningObjects]),
              this.saveToLocalStorage()));
      }));
  }
  fitToWindow() {
    this.viewer && typeof this.viewer.FitToWindow == "function"
      ? this.viewer.FitToWindow()
      : this.viewer &&
        this.viewer.viewer &&
        typeof this.viewer.viewer.FitToWindow == "function" &&
        this.viewer.viewer.FitToWindow();
  }
  tweenCamera(i, r = 400) {
    var f, d, h, m, x, b, y, w;
    if (!(
      (d = (f = this.viewer) == null ? void 0 : f.viewer) != null &&
      d.navigation
    ))
      return;
    const l = this.viewer.viewer.navigation;
    let u = null;
    if (typeof l.GetCamera == "function") u = l.GetCamera();
    else if (l.camera) {
      const C = l.camera;
      u = new window.OV.Camera(
        new window.OV.Coord3D(C.position.x, C.position.y, C.position.z),
        new window.OV.Coord3D(
          ((m = (h = l.controls) == null ? void 0 : h.target) == null
            ? void 0
            : m.x) || 0,
          ((b = (x = l.controls) == null ? void 0 : x.target) == null
            ? void 0
            : b.y) || 0,
          ((w = (y = l.controls) == null ? void 0 : y.target) == null
            ? void 0
            : w.z) || 0,
        ),
        new window.OV.Coord3D(C.up.x, C.up.y, C.up.z),
        C.fov || 45,
      );
    }
    if (!u) {
      if ((l.SetCamera(i), this.viewer.viewer.scene))
        try {
          this.viewer.viewer.Render();
        } catch {}
      return;
    }
    const s = performance.now(),
      c = (C) => {
        const k = C - s;
        let z = Math.min(k / r, 1);
        z = z < 0.5 ? 2 * z * z : 1 - Math.pow(-2 * z + 2, 2) / 2;
        const _ = new window.OV.Coord3D(
            u.eye.x + (i.eye.x - u.eye.x) * z,
            u.eye.y + (i.eye.y - u.eye.y) * z,
            u.eye.z + (i.eye.z - u.eye.z) * z,
          ),
          N = new window.OV.Coord3D(
            u.center.x + (i.center.x - u.center.x) * z,
            u.center.y + (i.center.y - u.center.y) * z,
            u.center.z + (i.center.z - u.center.z) * z,
          ),
          O = new window.OV.Coord3D(
            u.up.x + (i.up.x - u.up.x) * z,
            u.up.y + (i.up.y - u.up.y) * z,
            u.up.z + (i.up.z - u.up.z) * z,
          ),
          j = u.fov + (i.fov - u.fov) * z;
        if (
          (l.SetCamera(new window.OV.Camera(_, N, O, j)),
          this.viewer.viewer.scene)
        )
          try {
            this.viewer.viewer.Render();
          } catch {}
        z < 1 && requestAnimationFrame(c);
      };
    requestAnimationFrame(c);
  }
  resetCamera() {
    if (
      this.viewer &&
      this.viewer.viewer &&
      this.viewer.viewer.navigation &&
      this.defaultCamera
    ) {
      const i = new window.OV.Camera(
        new window.OV.Coord3D(
          this.defaultCamera.eye.x,
          this.defaultCamera.eye.y,
          this.defaultCamera.eye.z,
        ),
        new window.OV.Coord3D(
          this.defaultCamera.center.x,
          this.defaultCamera.center.y,
          this.defaultCamera.center.z,
        ),
        new window.OV.Coord3D(
          this.defaultCamera.up.x,
          this.defaultCamera.up.y,
          this.defaultCamera.up.z,
        ),
        this.defaultCamera.fov || 45,
      );
      this.tweenCamera(i, 500);
    } else this.fitToWindow();
  }
  setView(i) {
    var h, m, x, b, y, w, C, k;
    if (!(
      (m = (h = this.viewer) == null ? void 0 : h.viewer) != null &&
      m.navigation
    ))
      return;
    const r = this.viewer.viewer.navigation;
    let l = new window.OV.Coord3D(0, 0, 0),
      u = 100,
      s = null;
    if (typeof r.GetCamera == "function") s = r.GetCamera();
    else if (r.camera) {
      const z = r.camera;
      s = new window.OV.Camera(
        new window.OV.Coord3D(z.position.x, z.position.y, z.position.z),
        new window.OV.Coord3D(
          ((b = (x = r.controls) == null ? void 0 : x.target) == null
            ? void 0
            : b.x) || 0,
          ((w = (y = r.controls) == null ? void 0 : y.target) == null
            ? void 0
            : w.y) || 0,
          ((k = (C = r.controls) == null ? void 0 : C.target) == null
            ? void 0
            : k.z) || 0,
        ),
        new window.OV.Coord3D(z.up.x, z.up.y, z.up.z),
        z.fov || 45,
      );
    }
    if (s) {
      l = s.center;
      const z = s.eye.x - l.x,
        _ = s.eye.y - l.y,
        N = s.eye.z - l.z;
      u = Math.sqrt(z * z + _ * _ + N * N) || 100;
    }
    let c = new window.OV.Coord3D(0, 0, 0),
      f = new window.OV.Coord3D(0, 0, 1);
    switch (i) {
      case "top":
        ((c = new window.OV.Coord3D(l.x, l.y, l.z + u)),
          (f = new window.OV.Coord3D(0, 1, 0)));
        break;
      case "bottom":
        ((c = new window.OV.Coord3D(l.x, l.y, l.z - u)),
          (f = new window.OV.Coord3D(0, -1, 0)));
        break;
      case "front":
        ((c = new window.OV.Coord3D(l.x, l.y - u, l.z)),
          (f = new window.OV.Coord3D(0, 0, 1)));
        break;
      case "back":
        ((c = new window.OV.Coord3D(l.x, l.y + u, l.z)),
          (f = new window.OV.Coord3D(0, 0, 1)));
        break;
      case "left":
        ((c = new window.OV.Coord3D(l.x - u, l.y, l.z)),
          (f = new window.OV.Coord3D(0, 0, 1)));
        break;
      case "right":
        ((c = new window.OV.Coord3D(l.x + u, l.y, l.z)),
          (f = new window.OV.Coord3D(0, 0, 1)));
        break;
    }
    const d = new window.OV.Camera(c, l, f, (s == null ? void 0 : s.fov) || 45);
    this.tweenCamera(d, 500);
  }
  resetWorkspace() {
    var i, r;
    if (
      (this.flyThroughState.active && this.stopFlyThrough(),
      this.treeParseInterval &&
        (clearInterval(this.treeParseInterval),
        (this.treeParseInterval = null)),
      this.clearRotationVisualCue(),
      this.clearTranslationVisualCue(),
      this.transformControl)
    )
      try {
        this.transformControl.detach();
      } catch {}
    (this.highlightPlanningMesh(null),
      this.config.onTransformActiveChange &&
        this.config.onTransformActiveChange(!1, null));
    try {
      (this.clearAllPlanningObjects(!1), this.clearPlanningPoints());
    } catch (l) {
      console.warn("Disposal of planning items failed:", l);
    }
    ((this.planningGroups = []), this.notifyGroupsChanged());
    try {
      (this.loadedFilename &&
        (localStorage.removeItem(
          `3dpo_planning_objects_${this.loadedFilename}`,
        ),
        localStorage.removeItem(`3dpo_planning_groups_${this.loadedFilename}`)),
        Object.keys(localStorage).forEach((l) => {
          l.startsWith("3dpo_planning_") && localStorage.removeItem(l);
        }));
    } catch {}
    if (
      (this.revertGhostingMode(),
      this.clearHighlight(),
      this.originalColors.clear(),
      this.ghostedOriginals.clear(),
      (this.currentMeshes = []),
      (this.defaultCamera = null),
      (this.lastPlanesState = null),
      (this.modelBBox = null),
      (this.lastCameraState = ""),
      this.setAutoRotate(!1),
      this.viewer)
    ) {
      try {
        typeof this.viewer.Clear == "function" && this.viewer.Clear();
      } catch (l) {
        console.warn("Failed clearing embedded 3d viewer core", l);
      }
      try {
        const l =
          ((i = this.viewer.viewer) == null ? void 0 : i.scene) ||
          ((r = this.viewer.viewer) == null ? void 0 : r.mainScene);
        if (l) {
          const u = [];
          (l.traverse((s) => {
            this.isCustomOverlay(s) && u.push(s);
          }),
            u.forEach((s) => {
              try {
                (l.remove(s),
                  s.geometry &&
                    typeof s.geometry.dispose == "function" &&
                    s.geometry.dispose(),
                  s.material &&
                    (Array.isArray(s.material)
                      ? s.material
                      : [s.material]
                    ).forEach((f) => {
                      f && typeof f.dispose == "function" && f.dispose();
                    }));
              } catch {}
            }));
        }
      } catch {}
      try {
        (this.setTheme(this.theme, !1),
          this.enforceFreeOrbit(),
          this.viewer.viewer && this.viewer.viewer.Render());
      } catch {}
    }
    if (this.topRulerRef && this.leftRulerRef) {
      const l = this.topRulerRef.getContext("2d");
      l && l.clearRect(0, 0, this.topRulerRef.width, this.topRulerRef.height);
      const u = this.leftRulerRef.getContext("2d");
      u && u.clearRect(0, 0, this.leftRulerRef.width, this.leftRulerRef.height);
    }
    ((this.loadedFilename = null),
      (this.loadedUrl = null),
      this.config.onStatusChange(
        `No model loaded.
Please open a file.`,
        !0,
        null,
        null,
      ),
      this.config.onProgressChange && this.config.onProgressChange(0),
      this.config.onMeshesChange && this.config.onMeshesChange([]),
      this.config.onMeshHighlighted && this.config.onMeshHighlighted(null),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange([]),
      this.config.onPlanningGroupsChange &&
        this.config.onPlanningGroupsChange([]),
      this.config.onPlanningPointsChange &&
        this.config.onPlanningPointsChange(0),
      this.config.onMeasurementChange && this.config.onMeasurementChange(null),
      (this.flyThroughState = {
        active: !1,
        isPlaying: !1,
        curveId: null,
        curveName: null,
        progress: 0,
        speed: 1,
        direction: 1,
        loop: !0,
        fov: 75,
        showReticle: !0,
        totalDistance: 0,
        currentDistance: 0,
        yawOffset: 0,
        pitchOffset: 0,
        pathOffsetX: 0,
        pathOffsetY: 0,
      }),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  dispose() {
    var i, r, l;
    ((this.isDisposed = !0),
      this.flyThroughState.active && this.stopFlyThrough(),
      this.treeParseInterval &&
        (clearInterval(this.treeParseInterval),
        (this.treeParseInterval = null)),
      this.rulerAnimationFrame &&
        (cancelAnimationFrame(this.rulerAnimationFrame),
        (this.rulerAnimationFrame = null)),
      this.resizeObserver &&
        (this.resizeObserver.disconnect(), (this.resizeObserver = null)),
      this.container &&
        (this.onPointerDown &&
          (this.container.removeEventListener(
            "pointerdown",
            this.onPointerDown,
            { capture: !0 },
          ),
          (this.onPointerDown = null)),
        this.onPointerUp &&
          (this.container.removeEventListener("pointerup", this.onPointerUp, {
            capture: !0,
          }),
          (this.onPointerUp = null))));
    try {
      (this.clearAllPlanningObjects(), this.clearPlanningPoints());
    } catch (u) {
      console.warn("Disposal failed on custom planning items", u);
    }
    if (
      (this.clearRotationVisualCue(),
      this.clearTranslationVisualCue(),
      this.transformControl)
    ) {
      if (this.viewer && this.viewer.viewer) {
        const u = this.viewer.viewer,
          s = u.scene || u.mainScene;
        (s && s.remove(this.transformControl),
          u.renderer &&
            u.renderer.domElement &&
            this.onTransformBlockNav &&
            (u.renderer.domElement.removeEventListener(
              "mousedown",
              this.onTransformBlockNav,
              !0,
            ),
            u.renderer.domElement.removeEventListener(
              "touchstart",
              this.onTransformBlockNav,
              !0,
            )));
      }
      if (typeof this.transformControl.dispose == "function")
        try {
          this.transformControl.dispose();
        } catch {}
      ((this.transformControl = null), (this.onTransformBlockNav = null));
    }
    if (
      (this.revertGhostingMode(),
      this.originalColors.clear(),
      this.ghostedOriginals.clear(),
      (this.currentMeshes = []),
      (this.defaultCamera = null),
      (this.lastPlanesState = null),
      (this.modelBBox = null),
      (this.topRulerRef = null),
      (this.leftRulerRef = null),
      this.viewer)
    ) {
      if (
        (l =
          (r = (i = this.viewer) == null ? void 0 : i.viewer) == null
            ? void 0
            : r.renderer) != null &&
        l.domElement
      ) {
        const u = this.viewer.viewer.renderer.domElement;
        (this.onContextLostHandler &&
          u.removeEventListener(
            "webglcontextlost",
            this.onContextLostHandler,
            !1,
          ),
          this.onContextRestoredHandler &&
            u.removeEventListener(
              "webglcontextrestored",
              this.onContextRestoredHandler,
              !1,
            ));
      }
      ((this.onContextLostHandler = null),
        (this.onContextRestoredHandler = null));
      try {
        typeof this.viewer.Clear == "function" && this.viewer.Clear();
      } catch (u) {
        console.warn("Disposal failed on embedded 3d viewer core", u);
      }
      this.viewer = null;
    }
    window._viewerManagerInstance === this &&
      (window._viewerManagerInstance = null);
  }
  saveToLocalStorage() {
    if (this.loadedFilename)
      try {
        const i = this.planningObjects.map((r) => {
          var u, s, c, f, d, h, m, x, b, y, w, C, k, z, _, N, O, j, V, U;
          const l = {
            id: r.id,
            name: r.name,
            type: r.type,
            color: r.color,
            groupId: r.groupId,
            visible: r.visible !== !1,
            cardOffset: r.cardOffset
              ? { x: Math.round(r.cardOffset.x), y: Math.round(r.cardOffset.y) }
              : { x: 0, y: 0 },
            posX:
              (s = (u = r.mesh) == null ? void 0 : u.position) == null
                ? void 0
                : s.x,
            posY:
              (f = (c = r.mesh) == null ? void 0 : c.position) == null
                ? void 0
                : f.y,
            posZ:
              (h = (d = r.mesh) == null ? void 0 : d.position) == null
                ? void 0
                : h.z,
            rotQx:
              (x = (m = r.mesh) == null ? void 0 : m.quaternion) == null
                ? void 0
                : x.x,
            rotQy:
              (y = (b = r.mesh) == null ? void 0 : b.quaternion) == null
                ? void 0
                : y.y,
            rotQz:
              (C = (w = r.mesh) == null ? void 0 : w.quaternion) == null
                ? void 0
                : C.z,
            rotQw:
              (z = (k = r.mesh) == null ? void 0 : k.quaternion) == null
                ? void 0
                : z.w,
            scaleX:
              (N = (_ = r.mesh) == null ? void 0 : _.scale) == null
                ? void 0
                : N.x,
            scaleY:
              (j = (O = r.mesh) == null ? void 0 : O.scale) == null
                ? void 0
                : j.y,
            scaleZ:
              (U = (V = r.mesh) == null ? void 0 : V.scale) == null
                ? void 0
                : U.z,
          };
          return r.type === "plane"
            ? {
                ...l,
                p1: r.p1,
                p2: r.p2,
                p3: r.p3,
                extWidth: r.extWidth,
                extLength: r.extLength,
                thickness: r.thickness,
              }
            : r.type === "cylinder"
              ? {
                  ...l,
                  p1: r.p1,
                  p2: r.p2,
                  diameter: r.diameter,
                  extension: r.extension,
                }
              : r.type === "curve"
                ? { ...l, points: r.points, thickness: r.thickness }
                : r.type === "measurement"
                  ? { ...l, p1: r.p1, p2Coord: r.p2Coord, angle: r.angle }
                  : r.type === "angle"
                    ? {
                        ...l,
                        p1: r.p1,
                        p2Coord: r.p2Coord,
                        p3: r.p3,
                        angle: r.angle,
                      }
                    : r.type === "point"
                      ? { ...l, points: r.points, diameter: r.diameter }
                      : r.type === "annotation"
                        ? {
                            ...l,
                            text: r.text,
                            description: r.description,
                            position: r.position,
                            normal: r.normal,
                            pinSize: r.pinSize,
                            cardOffset: r.cardOffset,
                          }
                        : r.type === "custom_model"
                          ? {
                              ...l,
                              fileName: r.fileName,
                              fileDataURL: r.fileDataURL,
                            }
                          : l;
        });
        (localStorage.setItem(
          `3dpo_planning_objects_${this.loadedFilename}`,
          JSON.stringify(i),
        ),
          localStorage.setItem(
            `3dpo_planning_groups_${this.loadedFilename}`,
            JSON.stringify(this.planningGroups),
          ));
      } catch (i) {
        console.warn("Failed to save planning objects to localStorage", i);
      }
  }
  async loadFromLocalStorage() {
    var i;
    if (this.loadedFilename)
      try {
        this.clearAllPlanningObjects(!1);
        const r = localStorage.getItem(
          `3dpo_planning_groups_${this.loadedFilename}`,
        );
        if (r)
          try {
            this.planningGroups = JSON.parse(r);
          } catch {
            this.planningGroups = [];
          }
        else this.planningGroups = [];
        this.notifyGroupsChanged();
        const l = localStorage.getItem(
          `3dpo_planning_objects_${this.loadedFilename}`,
        );
        if (!l) return;
        const u = JSON.parse(l);
        if (!Array.isArray(u)) return;
        const s = window.THREE;
        if (!s) return;
        const c = this.getModelRoot();
        for (const d of u) {
          const h = (m) => {
            m &&
              ((m.id = d.id),
              (m.name = d.name),
              (m.color = d.color),
              (m.groupId = d.groupId),
              (m.visible = d.visible !== !1),
              m.mesh &&
                (m.type !== "custom_model" &&
                  ![
                    "plane",
                    "cylinder",
                    "curve",
                    "measurement",
                    "angle",
                    "point",
                    "annotation",
                  ].includes(m.type) &&
                  (d.posX !== void 0 &&
                    m.mesh.position.set(d.posX, d.posY, d.posZ),
                  d.rotQx !== void 0 &&
                    m.mesh.quaternion.set(d.rotQx, d.rotQy, d.rotQz, d.rotQw),
                  d.scaleX !== void 0 &&
                    m.mesh.scale.set(d.scaleX, d.scaleY, d.scaleZ)),
                (m.mesh.visible = m.visible)),
              this.updateMeshColorAndVisibility(m));
          };
          try {
            if (d.type === "plane") {
              const m = new s.Vector3(d.p1.x, d.p1.y, d.p1.z),
                x = new s.Vector3(d.p2.x, d.p2.y, d.p2.z),
                b = new s.Vector3(d.p3.x, d.p3.y, d.p3.z);
              this.createPlanningPlane(m, x, b, d.extWidth, d.extLength);
              const y = this.planningObjects[this.planningObjects.length - 1];
              (h(y),
                y &&
                  d.thickness !== void 0 &&
                  this.updatePlaneGeometry(y.id, d.extWidth || 0, d.thickness));
            } else if (d.type === "cylinder") {
              const m = new s.Vector3(d.p1.x, d.p1.y, d.p1.z),
                x = new s.Vector3(d.p2.x, d.p2.y, d.p2.z);
              this.createPlanningCylinder(m, x, d.diameter / 2, d.extension);
              const b = this.planningObjects[this.planningObjects.length - 1];
              (b && (b.color = b.color || "#0000ff"), h(b));
            } else if (d.type === "curve") {
              const m = d.points.map((b) => new s.Vector3(b.x, b.y, b.z));
              this.createPlanningCurve(m, d.thickness);
              const x = this.planningObjects[this.planningObjects.length - 1];
              (x && (x.color = x.color || "#db2777"), h(x));
            } else if (d.type === "measurement") {
              const m = new s.Vector3(d.p1.x, d.p1.y, d.p1.z),
                x = new s.Vector3(d.p2Coord.x, d.p2Coord.y, d.p2Coord.z);
              this.createPlanningMeasurement(m, x, d.angle || 0);
              const b = this.planningObjects[this.planningObjects.length - 1];
              if (
                (b && (b.color = b.color || "#10b981"),
                h(b),
                b && b.labelDiv && b.baseDistance !== void 0)
              ) {
                const y = b.name
                  ? `${b.name} (${b.baseDistance.toFixed(2)} mm)`
                  : `${b.baseDistance.toFixed(2)} mm`;
                ((b.labelDiv.innerText = y),
                  (b.labelDiv.style.display = b.visible ? "flex" : "none"),
                  b.visible ||
                    ((b.labelDiv.style.opacity = "0"),
                    b.leaderLine && (b.leaderLine.style.display = "none")));
              }
            } else if (d.type === "angle") {
              const m = new s.Vector3(d.p1.x, d.p1.y, d.p1.z),
                x = new s.Vector3(d.p2Coord.x, d.p2Coord.y, d.p2Coord.z),
                b = new s.Vector3(d.p3.x, d.p3.y, d.p3.z);
              this.createPlanningAngle(m, x, b, d.angle || 0);
              const y = this.planningObjects[this.planningObjects.length - 1];
              if (
                (y && (y.color = y.color || "#d97706"),
                h(y),
                y && y.labelDiv && y.angle !== void 0)
              ) {
                const w = y.name
                  ? `${y.name} (${y.angle.toFixed(1)}°)`
                  : `${y.angle.toFixed(1)}°`;
                ((y.labelDiv.innerText = w),
                  (y.labelDiv.style.display = y.visible ? "flex" : "none"),
                  y.visible ||
                    ((y.labelDiv.style.opacity = "0"),
                    y.leaderLine && (y.leaderLine.style.display = "none")));
              }
            } else if (d.type === "point") {
              const m = new s.Vector3(
                d.points[0].x,
                d.points[0].y,
                d.points[0].z,
              );
              this.createPlanningPoint(m, d.diameter || 0.2);
              const x = this.planningObjects[this.planningObjects.length - 1];
              (x && (x.color = x.color || "#9333ea"), h(x));
            } else if (d.type === "annotation") {
              const m = new s.Vector3(d.position.x, d.position.y, d.position.z),
                x = d.normal
                  ? new s.Vector3(d.normal.x, d.normal.y, d.normal.z)
                  : null;
              this.createPlanningAnnotation(
                m,
                x,
                d.text,
                d.description,
                d.color || "#0284c7",
                d.pinSize || 1.5,
                d.cardOffset,
              );
              const b = this.planningObjects[this.planningObjects.length - 1];
              if (
                (b &&
                  (d.name && (b.name = d.name),
                  d.text && (b.text = d.text),
                  d.description && (b.description = d.description),
                  d.color && (b.color = d.color),
                  d.pinSize && (b.pinSize = d.pinSize)),
                h(b),
                b && b.labelDiv)
              ) {
                const y = b.labelDiv.querySelector(".annotation-label-text");
                (y
                  ? (y.textContent = b.text || b.name)
                  : (b.labelDiv.innerText = b.text || b.name),
                  (b.labelDiv.style.display = b.visible ? "flex" : "none"),
                  b.visible ||
                    ((b.labelDiv.style.opacity = "0"),
                    b.leaderLine && (b.leaderLine.style.display = "none")));
              }
            } else if (d.type === "custom_model" && d.fileDataURL)
              try {
                const m = await fetch(d.fileDataURL);
                if (m.ok) {
                  const x = await m.arrayBuffer(),
                    y = new window.THREE.STLLoader().parse(x);
                  (c && window.THREE && y.applyMatrix4(c.matrixWorld),
                    y.computeBoundingBox(),
                    y.computeBoundingSphere());
                  const w = new window.THREE.Vector3();
                  (y.boundingBox.getCenter(w),
                    y.translate(-w.x, -w.y, -w.z),
                    y.computeBoundingBox(),
                    y.computeBoundingSphere(),
                    y.attributes &&
                      y.attributes.color &&
                      y.deleteAttribute("color"));
                  const C = new s.MeshStandardMaterial({
                      color: d.color
                        ? new s.Color(d.color)
                        : new s.Color(9133302),
                      transparent: !0,
                      opacity: d.opacity !== void 0 ? d.opacity : 0.7,
                      depthTest: !0,
                      depthWrite: !0,
                      side: s.DoubleSide,
                      roughness: 0.35,
                      metalness: 0.1,
                    }),
                    k = new s.Mesh(y, C);
                  if (
                    ((k.renderOrder = 999),
                    k.position.copy(w),
                    (k.userData = { isCustomOverlay: !0 }),
                    this.viewer && this.viewer.viewer)
                  ) {
                    const _ =
                      this.viewer.viewer.scene || this.viewer.viewer.mainScene;
                    _ && _.add(k);
                  }
                  const z = {
                    id: d.id,
                    name: d.name,
                    type: "custom_model",
                    mesh: k,
                    color: d.color || "#8b5cf6",
                    opacity: d.opacity !== void 0 ? d.opacity : 0.7,
                    fileName: d.fileName,
                    fileDataURL: d.fileDataURL,
                  };
                  (this.planningObjects.push(z), h(z));
                }
              } catch (m) {
                console.warn(
                  "Could not reload custom model from stored fileDataURL:",
                  d.name,
                  m,
                );
              }
          } catch (m) {
            console.warn(
              "Failed to reconstruct serialized planning object",
              d,
              m,
            );
          }
        }
        let f = 0;
        if (
          (u.forEach((d) => {
            const h = d.id.split("_");
            if (h.length > 1) {
              const m = parseInt(h[1], 10);
              !isNaN(m) && m > f && (f = m);
            }
          }),
          (this.nextPlanningObjectId = f + 1),
          (i = this.viewer) != null && i.viewer)
        )
          try {
            this.viewer.viewer.Render();
          } catch {}
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects);
      } catch (r) {
        console.warn("Failed to load planning objects from localStorage", r);
      }
  }
  loadFiles(i) {
    if (!i || i.length === 0) return;
    (this.resetWorkspace(), (this.loadedUrl = null));
    const r = Array.from(i) as any[],
      l = r[0].name;
    (this.config.onStatusChange("Loading model data...", !0, l, null),
      this.config.onProgressChange && this.config.onProgressChange(5));
    try {
      this.viewer.LoadModelFromFileList(r);
    } catch (u) {
      console.error(u);
    }
    this.waitForModelAndBuildTree(l);
  }
  loadUrl(i, r) {
    var u;
    if (!i || !isSafeModelUrl(i)) {
      console.warn("[Security] Blocked loadUrl with unsafe or invalid URL:", i);
      return;
    }
    if (this.loadedUrl === i) {
      console.log(
        "Model URL is already loaded or in progress of being loaded:",
        i,
      );
      return;
    }
    (this.resetWorkspace(), (this.loadedUrl = i));
    const l =
      ((u = i.split("/").pop()) == null ? void 0 : u.split("?")[0]) ||
      "Remote Model";
    (this.config.onStatusChange("Loading model from URL...", !0, l, i),
      this.config.onProgressChange && this.config.onProgressChange(5));
    try {
      this.viewer.LoadModelFromUrlList([i]);
    } catch (s) {
      console.error(s);
    }
    this.waitForModelAndBuildTree(l, r);
  }
  waitForModelAndBuildTree(i: any, r?: any) {
    this.treeParseInterval && clearInterval(this.treeParseInterval);
    let l = 0,
      u = -1,
      s = 0,
      c = 5;
    (this.config.onProgressChange && this.config.onProgressChange(c),
      (this.treeParseInterval = setInterval(() => {
        var f, d;
        (l++,
          c < 95 &&
            ((c += Math.max(1, (95 - c) * 0.1)),
            this.config.onProgressChange &&
              this.config.onProgressChange(Math.round(c))));
        try {
          const h =
            this.viewer && this.viewer.viewer
              ? this.viewer.viewer.scene || this.viewer.viewer.mainScene
              : null;
          let m = 0;
          if (
            (h &&
              h.traverse((x) => {
                x.isMesh &&
                  x.type !== "LineSegments" &&
                  x.type !== "EdgesGeometry" &&
                  (this.isCustomOverlay(x) || m++);
              }),
            m > 0 && m === u)
          ) {
            if ((s++, s >= 2 || l >= 120)) {
              if (
                (clearInterval(this.treeParseInterval),
                this.config.onProgressChange &&
                  this.config.onProgressChange(100),
                this.buildModelTree(),
                this.setupExplosion(),
                this.config.onStatusChange(
                  `Model loaded successfully.
**${i}**`,
                  !1,
                ),
                (this.loadedFilename = i),
                (d = (f = this.viewer) == null ? void 0 : f.viewer) != null &&
                  d.navigation &&
                  typeof this.viewer.viewer.navigation.GetCamera == "function")
              )
                try {
                  const x = this.viewer.viewer.navigation.GetCamera();
                  x &&
                    (this.defaultCamera = new window.OV.Camera(
                      new window.OV.Coord3D(x.eye.x, x.eye.y, x.eye.z),
                      new window.OV.Coord3D(x.center.x, x.center.y, x.center.z),
                      new window.OV.Coord3D(x.up.x, x.up.y, x.up.z),
                      x.fov || 45,
                    ));
                } catch (x) {
                  console.warn("Failed to capture default camera", x);
                }
              if (r && this.viewer.viewer.navigation)
                try {
                  const x = r,
                    b = new window.OV.Coord3D(x[0], x[1], x[2]),
                    y = new window.OV.Coord3D(x[3], x[4], x[5]),
                    w = new window.OV.Coord3D(x[6], x[7], x[8]);
                  (this.viewer.viewer.navigation.SetCamera(
                    new window.OV.Camera(b, y, w, x[9] || 45),
                  ),
                    (this.defaultCamera = new window.OV.Camera(
                      new window.OV.Coord3D(b.x, b.y, b.z),
                      new window.OV.Coord3D(y.x, y.y, y.z),
                      new window.OV.Coord3D(w.x, w.y, w.z),
                      x[9] || 45,
                    )));
                } catch (x) {
                  console.warn("Failed to set imported camera", x);
                }
              (this.initTransformControls(),
                this.enforceFreeOrbit(),
                this.loadFromLocalStorage());
            }
          } else
            m > 0
              ? ((u = m), (s = 0))
              : l >= 120 &&
                (clearInterval(this.treeParseInterval),
                this.config.onProgressChange &&
                  this.config.onProgressChange(100),
                this.config.onStatusChange(
                  `Loading finished.
**${i}**`,
                  !1,
                ),
                this.config.onMeshesChange([]));
        } catch {
          (clearInterval(this.treeParseInterval),
            this.config.onProgressChange && this.config.onProgressChange(100),
            this.config.onStatusChange("Error parsing model.", !1));
        }
      }, 500)));
  }
  isCustomOverlay(i) {
    let r = i;
    for (; r;) {
      if (r.userData && r.userData.isCustomOverlay) return !0;
      r = r.parent;
    }
    return !1;
  }
  buildModelTree() {
    var l, u, s, c;
    (this.revertGhostingMode(),
      this.clearHighlight(),
      this.originalColors.clear(),
      this.ghostedOriginals.clear(),
      (this.currentMeshes = []));
    const i =
      ((u = (l = this.viewer) == null ? void 0 : l.viewer) == null
        ? void 0
        : u.scene) ||
      ((c = (s = this.viewer) == null ? void 0 : s.viewer) == null
        ? void 0
        : c.mainScene);
    if (!i) return;
    const r = [];
    (i.traverse((f) => {
      if (f.isMesh && f.type !== "LineSegments" && f.type !== "EdgesGeometry") {
        if (this.isCustomOverlay(f)) return;
        this.currentMeshes.push(f);
        const d = this.currentMeshes.length - 1;
        let h =
          f.name ||
          (f.parent && f.parent.name ? `${f.parent.name} (Mesh)` : null) ||
          `Mesh ${d + 1}`;
        h.length > 25 && (h = h.substring(0, 22) + "...");
        const m =
          f.material && f.material.opacity !== void 0 ? f.material.opacity : 1;
        r.push({ id: d, name: h, visible: f.visible !== !1, opacity: m });
      }
    }),
      this.config.onMeshesChange(r));
  }
  getModelStats() {
    var m;
    if (!this.currentMeshes || this.currentMeshes.length === 0) return null;
    const i = window.THREE;
    let r = 0,
      l = 0;
    const u = new Set();
    let s = null;
    i && (s = new i.Box3());
    for (const x of this.currentMeshes)
      if (x) {
        if (x.geometry) {
          const b = x.geometry;
          if (b.attributes && b.attributes.position) {
            const y = b.attributes.position.count || 0;
            ((r += y),
              b.index && b.index.count
                ? (l += Math.floor(b.index.count / 3))
                : (l += Math.floor(y / 3)));
          }
        }
        if (
          (x.material &&
            (Array.isArray(x.material)
              ? x.material.forEach((b) => u.add(b))
              : u.add(x.material)),
          s && i)
        )
          try {
            const b = new i.Box3().setFromObject(x);
            b.isEmpty() || s.union(b);
          } catch {}
      }
    const c = { x: 0, y: 0, z: 0 };
    let f = null;
    if (s && !s.isEmpty() && i) {
      const x = new i.Vector3();
      (s.getSize(x),
        (c.x = Math.round(x.x * 10) / 10),
        (c.y = Math.round(x.y * 10) / 10),
        (c.z = Math.round(x.z * 10) / 10),
        (f = {
          min: [
            Math.round(s.min.x * 10) / 10,
            Math.round(s.min.y * 10) / 10,
            Math.round(s.min.z * 10) / 10,
          ],
          max: [
            Math.round(s.max.x * 10) / 10,
            Math.round(s.max.y * 10) / 10,
            Math.round(s.max.z * 10) / 10,
          ],
        }));
    }
    const d = this.loadedFilename || null;
    let h = "3D";
    return (
      d &&
        d.includes(".") &&
        (h =
          ((m = d.split(".").pop()) == null ? void 0 : m.toUpperCase()) ||
          "3D"),
      {
        meshCount: this.currentMeshes.length,
        vertexCount: r,
        triangleCount: l,
        dimensions: c,
        boundingBox: f,
        materialCount: u.size || 1,
        fileFormat: h,
        filename: d,
      }
    );
  }
  setGlobalOpacity(i) {
    var l, u, s, c;
    const r =
      ((u = (l = this.viewer) == null ? void 0 : l.viewer) == null
        ? void 0
        : u.scene) ||
      ((c = (s = this.viewer) == null ? void 0 : s.viewer) == null
        ? void 0
        : c.mainScene);
    if (r) {
      r.traverse((f) => {
        var d;
        if (
          f.isMesh &&
          f.type !== "LineSegments" &&
          f.type !== "EdgesGeometry"
        ) {
          if (this.isCustomOverlay(f)) return;
          f.material &&
            !((d = f.userData) != null && d.isEdge) &&
            (Array.isArray(f.material) ? f.material : [f.material]).forEach(
              (m) => {
                (m._originalSide === void 0 && (m._originalSide = m.side),
                  (m.transparent = i < 1),
                  (m.opacity = i),
                  (m.needsUpdate = !0),
                  (m.depthWrite = i === 1),
                  (m.side = i < 1 ? window.THREE.FrontSide : m._originalSide));
              },
            );
        }
      });
      try {
        this.viewer.viewer.Render();
      } catch {}
    }
  }
  setMeshOpacity(i, r) {
    const l = this.currentMeshes[i];
    if (l && l.material) {
      (Array.isArray(l.material) ? l.material : [l.material]).forEach((s) => {
        (s._originalSide === void 0 && (s._originalSide = s.side),
          (s.transparent = r < 1),
          (s.opacity = r),
          (s.needsUpdate = !0),
          (s.depthWrite = r === 1),
          (s.side = r < 1 ? window.THREE.FrontSide : s._originalSide));
      });
      try {
        this.viewer.viewer.Render();
      } catch {}
    }
  }
  toggleMeshVisibility(i) {
    const r = this.currentMeshes[i];
    if (r) {
      r.visible = !r.visible;
      try {
        this.viewer.viewer.Render();
      } catch {}
    }
  }
  setAllMeshesVisibility(i) {
    var r, l;
    if (this.currentMeshes && this.currentMeshes.length > 0) {
      this.currentMeshes.forEach((u) => {
        u && (u.visible = i);
      });
      try {
        (l = (r = this.viewer) == null ? void 0 : r.viewer) == null ||
          l.Render();
      } catch {}
    }
  }
  invertMeshesVisibility() {
    var i, r;
    if (this.currentMeshes && this.currentMeshes.length > 0) {
      this.currentMeshes.forEach((l) => {
        l && (l.visible = !l.visible);
      });
      try {
        (r = (i = this.viewer) == null ? void 0 : i.viewer) == null ||
          r.Render();
      } catch {}
    }
  }
  setupRaycaster() {
    let i = { x: 0, y: 0 };
    ((this.onPointerDown = (r) => {
      i = { x: r.clientX, y: r.clientY };
    }),
      this.container.addEventListener("pointerdown", this.onPointerDown, {
        capture: !0,
      }),
      (this.onPointerUp = (r) => {
        var u, s;
        if (
          !(
            Math.sqrt(
              Math.pow(r.clientX - i.x, 2) + Math.pow(r.clientY - i.y, 2),
            ) > 8
          ) &&
          window.THREE &&
          (s = (u = this.viewer) == null ? void 0 : u.viewer) != null &&
          s.camera
        ) {
          const c = this.container.getBoundingClientRect(),
            f = new window.THREE.Vector2();
          ((f.x = ((r.clientX - c.left) / c.width) * 2 - 1),
            (f.y = -((r.clientY - c.top) / c.height) * 2 + 1));
          const d = new window.THREE.Raycaster();
          if (
            (d.setFromCamera(f, this.viewer.viewer.camera),
            this.transformControl && this.transformControl.axis !== null)
          )
            return;
          const h = (this.planningObjects || [])
            .filter((w) => w.mesh && w.visible !== !1)
            .map((w) => w.mesh)
            .filter(Boolean);
          let m = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
          if (!m) return;
          const b = d
            .intersectObjects(m.children, !0)
            .filter((w) => {
              let C = w.object,
                k = !1,
                z = !1;
              for (; C;) {
                if (
                  (C === this.transformControl && (k = !0),
                  this.planningPointMarkers &&
                    this.planningPointMarkers.includes(C) &&
                    (z = !0),
                  C.userData && C.userData.isCustomOverlay,
                  C.visible === !1)
                )
                  return !1;
                C = C.parent;
              }
              if (k || z) return !1;
              C = w.object;
              let _ = !1,
                N = !1;
              for (; C;)
                ((h.includes(C) ||
                  (C.userData && C.userData.isCustomOverlay)) &&
                  (_ = !0),
                  this.currentMeshes.includes(C) && (N = !0),
                  (C = C.parent));
              return this.planningMode !== "none"
                ? N || _
                  ? !0
                  : !!w.object.isMesh
                : !!(_ || N);
            })
            .sort((w, C) => w.distance - C.distance);
          let y = b.find(
            (w) =>
              w.object.isMesh &&
              w.object.type !== "LineSegments" &&
              w.object.type !== "EdgesGeometry",
          );
          if (
            (!y && b.length > 0 && (y = b[0]), this.planningMode !== "none")
          ) {
            if (y) {
              let w = null;
              (y.face &&
                y.face.normal &&
                window.THREE &&
                ((w = y.face.normal.clone()),
                w.transformDirection(y.object.matrixWorld)),
                this.addPlanningPoint(y.point, w));
            }
            return;
          }
          if (y) {
            let w = null,
              C = null,
              k = y.object;
            for (; k;) {
              if (h.includes(k)) {
                w = k;
                break;
              }
              (this.currentMeshes.includes(k) && (C = k), (k = k.parent));
            }
            if (w) {
              this.highlightMesh(null);
              const z = this.planningObjects.find((N) => N.mesh === w),
                _ = z ? z.id : void 0;
              this.transformControl &&
                (z &&
                (z.type === "plane" ||
                  z.type === "cylinder" ||
                  z.type === "custom_model")
                  ? this.highlightedPlanningObj === z
                    ? (this.transformControl.detach(),
                      this.highlightPlanningMesh(null),
                      this.config.onTransformActiveChange &&
                        this.config.onTransformActiveChange(!1))
                    : (this.transformControl.attach(w),
                      this.highlightPlanningMesh(z),
                      this.config.onTransformActiveChange &&
                        this.config.onTransformActiveChange(!0, _))
                  : (this.transformControl.detach(),
                    this.highlightPlanningMesh(z || null),
                    this.config.onTransformActiveChange &&
                      this.config.onTransformActiveChange(!1)),
                this.viewer.viewer.Render());
            } else {
              this.transformControl &&
                (this.transformControl.detach(),
                this.highlightPlanningMesh(null),
                this.config.onTransformActiveChange &&
                  this.config.onTransformActiveChange(!1),
                this.viewer.viewer.Render());
              const z = C || y.object;
              let _ = this.currentMeshes.indexOf(z);
              (_ === -1 && (_ = this.currentMeshes.findIndex((N) => N === z)),
                this.highlightedMesh === z
                  ? this.highlightMesh(null)
                  : _ !== -1 && this.highlightMesh(_));
            }
          } else
            (this.highlightMesh(null),
              this.transformControl &&
                (this.transformControl.detach(),
                this.highlightPlanningMesh(null),
                this.config.onTransformActiveChange &&
                  this.config.onTransformActiveChange(!1),
                this.viewer.viewer.Render()));
        }
      }),
      this.container.addEventListener("pointerup", this.onPointerUp, {
        capture: !0,
      }));
  }
  setTransformMode(i) {
    var r;
    if (
      (this.clearRotationVisualCue(),
      this.clearTranslationVisualCue(),
      this.transformControl &&
        (this.transformControl.setMode(i),
        this.transformControl.setSpace("local"),
        this.config.onTransformModeChange &&
          this.config.onTransformModeChange(i),
        (r = this.viewer) != null && r.viewer))
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
  }
  setPlanningMode(i) {
    var r;
    ((this.planningMode = i),
      i !== "annotation" && (this.resnappingAnnotationId = null),
      this.clearPlanningPoints(),
      i !== "none" &&
        this.transformControl &&
        (this.transformControl.detach(),
        this.highlightPlanningMesh(null),
        this.config.onTransformActiveChange &&
          this.config.onTransformActiveChange(!1),
        (r = this.viewer) != null && r.viewer && this.viewer.viewer.Render()),
      this.config.onPlanningModeChange &&
        this.config.onPlanningModeChange(i, this.resnappingAnnotationId));
  }
  clearPlanningPoints() {
    if (
      ((this.planningPoints = []),
      (this.planningNormals = []),
      this.config.onMeasurementChange && this.config.onMeasurementChange(null),
      this.viewer && this.viewer.viewer && window.THREE)
    ) {
      const i = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      i &&
        this.planningPointMarkers.forEach((r) => {
          (i.remove(r),
            r.geometry && r.geometry.dispose(),
            r.material && r.material.dispose());
        });
    }
    ((this.planningPointMarkers = []),
      this.config.onPlanningPointsChange &&
        this.config.onPlanningPointsChange(0),
      this.viewer && this.viewer.viewer && this.viewer.viewer.Render());
  }
  startRotationVisualCue() {
    var c;
    if (
      !this.transformControl ||
      !this.transformControl.object ||
      !window.THREE
    )
      return;
    const i = this.transformControl.object,
      r = this.planningObjects.find((f) => f.mesh === i);
    if (
      !r ||
      (r.type !== "plane" && r.type !== "cylinder" && r.type !== "custom_model")
    )
      return;
    ((this.isRotatingTool = !0),
      (this.rotationStartQuat = i.quaternion.clone()),
      (this.rotationStartPos = i.position.clone()));
    const l = (this.transformControl.axis || "Z").toUpperCase();
    this.rotationAxisName = l;
    const u = (c = this.viewer) == null ? void 0 : c.viewer,
      s = (u == null ? void 0 : u.scene) || (u == null ? void 0 : u.mainScene);
    if (s) {
      if (
        (this.rotationCueGroup ||
          ((this.rotationCueGroup = new window.THREE.Group()),
          (this.rotationCueGroup.userData = { isCustomOverlay: !0 }),
          s.add(this.rotationCueGroup)),
        !this.rotationBadgeDiv)
      ) {
        const f = document.createElement("div");
        ((f.className =
          "absolute z-50 pointer-events-none font-mono text-xs font-bold text-white bg-slate-900/90 border rounded-full px-3 py-1.5 shadow-2xl backdrop-blur-md flex items-center gap-2 transition-opacity whitespace-nowrap tracking-tight select-none"),
          (f.style.left = "50%"),
          (f.style.top = "24px"),
          (f.style.transform = "translateX(-50%)"),
          (f.style.opacity = "0"),
          this.container.appendChild(f),
          (this.rotationBadgeDiv = f));
      }
      this.updateRotationVisualCue();
    }
  }
  updateRotationVisualCue() {
    var _, N, O, j;
    if (
      !this.isRotatingTool ||
      !this.transformControl ||
      !this.transformControl.object ||
      !window.THREE
    )
      return;
    const i = window.THREE,
      r = this.transformControl.object,
      l = this.planningObjects.find((V) => V.mesh === r);
    if (!l) return;
    const u = r.quaternion.clone(),
      s = this.rotationStartQuat || u.clone(),
      c = u.clone().multiply(s.clone().invert());
    c.w < 0 && ((c.x = -c.x), (c.y = -c.y), (c.z = -c.z), (c.w = -c.w));
    const f = (this.rotationAxisName || "Z").toUpperCase();
    let d = new i.Vector3(0, 0, 1),
      h = 3900150,
      m = "#3b82f6",
      x = "border-blue-500";
    f.includes("X")
      ? (d.set(1, 0, 0),
        (h = 15680580),
        (m = "#ef4444"),
        (x = "border-red-500"))
      : f.includes("Y")
        ? (d.set(0, 1, 0),
          (h = 2278750),
          (m = "#22c55e"),
          (x = "border-emerald-500"))
        : f.includes("E") &&
          ((N = (_ = this.viewer) == null ? void 0 : _.viewer) != null &&
            N.camera &&
            (this.viewer.viewer.camera.getWorldDirection(d), d.negate()),
          (h = 16096779),
          (m = "#f59e0b"),
          (x = "border-amber-500"));
    const b = d.clone().applyQuaternion(s).normalize(),
      y = new i.Vector3(c.x, c.y, c.z),
      C = y.dot(b) >= 0 ? 1 : -1;
    let k = 2 * Math.atan2(C * y.length(), c.w);
    C < 0 && (k = -Math.abs(k));
    const z = k * (180 / Math.PI);
    if (this.rotationBadgeDiv) {
      l.name && `${sanitizeHtml(l.name)}`;
      const V = `${z >= 0 ? "+" : ""}${z.toFixed(1)}°`;
      ((this.rotationBadgeDiv.className = `absolute z-50 pointer-events-none font-mono text-xs font-bold text-white bg-slate-900/90 border ${x} rounded-full px-3 py-1.5 shadow-2xl backdrop-blur-md flex items-center gap-2 transition-opacity whitespace-nowrap tracking-tight select-none`),
        (this.rotationBadgeDiv.textContent = ""));
      const U = document.createElement("span");
      ((U.className = "w-2.5 h-2.5 rounded-full animate-pulse"),
        (U.style.backgroundColor = m));
      const $ = document.createElement("span");
      (($.className =
        "text-slate-300 font-semibold uppercase text-[10px] tracking-wider"),
        ($.textContent = `${l.name ? `${l.name} • ` : ""}${f}-ROTATION:`));
      const q = document.createElement("span");
      ((q.className = "text-amber-400 font-bold text-sm"),
        (q.textContent = V),
        this.rotationBadgeDiv.appendChild(U),
        this.rotationBadgeDiv.appendChild($),
        this.rotationBadgeDiv.appendChild(q),
        (this.rotationBadgeDiv.style.left = "50%"),
        (this.rotationBadgeDiv.style.top = "24px"),
        (this.rotationBadgeDiv.style.transform = "translateX(-50%)"),
        (this.rotationBadgeDiv.style.opacity = "1"));
    }
    if (this.rotationCueGroup && (O = this.viewer) != null && O.viewer) {
      for (; this.rotationCueGroup.children.length > 0;) {
        const me = this.rotationCueGroup.children[0];
        (this.rotationCueGroup.remove(me),
          me.geometry && me.geometry.dispose(),
          me.material &&
            !((j = me.userData) != null && j.isEdge) &&
            (Array.isArray(me.material)
              ? me.material.forEach((Ae) => Ae.dispose())
              : me.material.dispose()));
      }
      this.rotationCueGroup.position.copy(r.position);
      let V = 25;
      l.type === "plane"
        ? (V = Math.max(l.width || 30, l.height || 30) * 0.6)
        : l.type === "cylinder" &&
          (V = Math.max(l.length || 30, (l.diameter || 2) * 10) * 0.45);
      let U = new i.Vector3();
      Math.abs(b.x) < 0.9
        ? U.set(0, -b.z, b.y).normalize()
        : U.set(-b.y, b.x, 0).normalize();
      const $ = new i.Vector3().crossVectors(b, U).normalize(),
        q = Math.abs(z),
        G = Math.max(12, Math.ceil(q / 4)),
        X = [0, 0, 0],
        R = [];
      for (let me = 0; me <= G; me++) {
        const Ae = k * (me / G),
          De = U.clone()
            .multiplyScalar(Math.cos(Ae))
            .add($.clone().multiplyScalar(Math.sin(Ae)))
            .multiplyScalar(V);
        (X.push(De.x, De.y, De.z), R.push(De));
      }
      const Z = [];
      for (let me = 1; me <= G; me++)
        k >= 0 ? Z.push(0, me, me + 1) : Z.push(0, me + 1, me);
      const S = new i.BufferGeometry();
      (S.setAttribute("position", new i.Float32BufferAttribute(X, 3)),
        S.setIndex(Z));
      const P = new i.MeshBasicMaterial({
          color: h,
          side: i.DoubleSide,
          transparent: !0,
          opacity: 0.3,
          depthTest: !1,
        }),
        H = new i.Mesh(S, P);
      ((H.renderOrder = 9999), this.rotationCueGroup.add(H));
      const I = new i.BufferGeometry().setFromPoints([
          new i.Vector3(0, 0, 0),
          U.clone().multiplyScalar(V * 1.15),
        ]),
        de = new i.LineBasicMaterial({ color: h, linewidth: 3, depthTest: !1 }),
        te = new i.Line(I, de);
      ((te.renderOrder = 9999), this.rotationCueGroup.add(te));
      const D = new i.BufferGeometry().setFromPoints([
          new i.Vector3(0, 0, 0),
          R[R.length - 1].clone().multiplyScalar(1.15),
        ]),
        M = new i.LineBasicMaterial({
          color: 16096779,
          linewidth: 3,
          depthTest: !1,
        }),
        B = new i.Line(D, M);
      ((B.renderOrder = 9999), this.rotationCueGroup.add(B));
      const A = new i.BufferGeometry().setFromPoints(R),
        Q = new i.LineBasicMaterial({ color: h, linewidth: 3, depthTest: !1 }),
        W = new i.Line(A, Q);
      ((W.renderOrder = 9999), this.rotationCueGroup.add(W));
      const oe = new i.SphereGeometry(V * 0.04, 16, 16),
        ze = new i.MeshBasicMaterial({ color: 16777215, depthTest: !1 }),
        ye = new i.Mesh(oe, ze);
      ((ye.renderOrder = 9999), this.rotationCueGroup.add(ye));
      try {
        this.viewer.viewer.Render();
      } catch {}
    }
  }
  clearRotationVisualCue() {
    var i, r;
    if (
      ((this.isRotatingTool = !1),
      (this.rotationStartQuat = null),
      (this.rotationStartPos = null),
      (this.rotationAxisName = null),
      this.rotationCueGroup && (i = this.viewer) != null && i.viewer)
    ) {
      const l = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      l &&
        (l.remove(this.rotationCueGroup),
        this.rotationCueGroup.traverse((u) => {
          var s, c;
          (u.geometry && u.geometry.dispose(),
            u.material &&
              (Array.isArray(u.material)
                ? u.material.forEach((f) => {
                    var d;
                    return (d = f == null ? void 0 : f.dispose) == null
                      ? void 0
                      : d.call(f);
                  })
                : (c = (s = u.material) == null ? void 0 : s.dispose) == null ||
                  c.call(s)));
        }));
    }
    if (
      ((this.rotationCueGroup = null),
      this.rotationBadgeDiv &&
        (this.rotationBadgeDiv.parentElement &&
          this.rotationBadgeDiv.parentElement.removeChild(
            this.rotationBadgeDiv,
          ),
        (this.rotationBadgeDiv = null)),
      (r = this.viewer) != null && r.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
  }
  startTranslationVisualCue() {
    var c;
    if (
      !this.transformControl ||
      !this.transformControl.object ||
      !window.THREE
    )
      return;
    const i = this.transformControl.object,
      r = this.planningObjects.find((f) => f.mesh === i);
    if (
      !r ||
      (r.type !== "plane" && r.type !== "cylinder" && r.type !== "custom_model")
    )
      return;
    ((this.isTranslatingTool = !0),
      (this.translationStartPos = i.position.clone()));
    const l = (this.transformControl.axis || "XYZ").toUpperCase();
    this.translationAxisName = l;
    const u = (c = this.viewer) == null ? void 0 : c.viewer,
      s = (u == null ? void 0 : u.scene) || (u == null ? void 0 : u.mainScene);
    if (s) {
      if (
        (this.translationCueGroup ||
          ((this.translationCueGroup = new window.THREE.Group()),
          (this.translationCueGroup.userData = { isCustomOverlay: !0 }),
          s.add(this.translationCueGroup)),
        !this.translationBadgeDiv)
      ) {
        const f = document.createElement("div");
        ((f.className =
          "absolute z-50 pointer-events-none font-mono text-xs font-bold text-white bg-slate-900/90 border rounded-full px-3 py-1.5 shadow-2xl backdrop-blur-md flex items-center gap-2 transition-opacity whitespace-nowrap tracking-tight select-none"),
          (f.style.left = "50%"),
          (f.style.top = "24px"),
          (f.style.transform = "translateX(-50%)"),
          (f.style.opacity = "0"),
          this.container.appendChild(f),
          (this.translationBadgeDiv = f));
      }
      this.updateTranslationVisualCue();
    }
  }
  updateTranslationVisualCue() {
    var y, w;
    if (
      !this.isTranslatingTool ||
      !this.transformControl ||
      !this.transformControl.object ||
      !window.THREE
    )
      return;
    const i = window.THREE,
      r = this.transformControl.object,
      l = this.planningObjects.find((C) => C.mesh === r);
    if (!l) return;
    const u = this.translationStartPos
        ? this.translationStartPos.clone()
        : r.position.clone(),
      s = r.position.clone(),
      c = s.clone().sub(u),
      f = (this.translationAxisName || "XYZ").toUpperCase();
    let d = 9133302,
      h = "#8b5cf6",
      m = "border-purple-500";
    f === "X"
      ? ((d = 15680580), (h = "#ef4444"), (m = "border-red-500"))
      : f === "Y"
        ? ((d = 2278750), (h = "#22c55e"), (m = "border-emerald-500"))
        : f === "Z" &&
          ((d = 3900150), (h = "#3b82f6"), (m = "border-blue-500"));
    let x = "";
    const b = c.length();
    if (f === "X") {
      const C = c.x;
      x = `${C >= 0 ? "+" : ""}${C.toFixed(2)} mm`;
    } else if (f === "Y") {
      const C = c.y;
      x = `${C >= 0 ? "+" : ""}${C.toFixed(2)} mm`;
    } else if (f === "Z") {
      const C = c.z;
      x = `${C >= 0 ? "+" : ""}${C.toFixed(2)} mm`;
    } else
      x = `${b >= 0 ? "+" : ""}${b.toFixed(2)} mm (ΔX:${c.x >= 0 ? "+" : ""}${c.x.toFixed(1)}, ΔY:${c.y >= 0 ? "+" : ""}${c.y.toFixed(1)}, ΔZ:${c.z >= 0 ? "+" : ""}${c.z.toFixed(1)})`;
    if (this.translationBadgeDiv) {
      (l.name && `${sanitizeHtml(l.name)}`,
        (this.translationBadgeDiv.className = `absolute z-50 pointer-events-none font-mono text-xs font-bold text-white bg-slate-900/90 border ${m} rounded-full px-3 py-1.5 shadow-2xl backdrop-blur-md flex items-center gap-2 transition-opacity whitespace-nowrap tracking-tight select-none`),
        (this.translationBadgeDiv.textContent = ""));
      const C = document.createElement("span");
      ((C.className = "w-2.5 h-2.5 rounded-full animate-pulse"),
        (C.style.backgroundColor = h));
      const k = document.createElement("span");
      ((k.className =
        "text-slate-300 font-semibold uppercase text-[10px] tracking-wider"),
        (k.textContent = `${l.name ? `${l.name} • ` : ""}${f}-TRANSLATION:`));
      const z = document.createElement("span");
      ((z.className = "text-amber-400 font-bold text-sm"),
        (z.textContent = x),
        this.translationBadgeDiv.appendChild(C),
        this.translationBadgeDiv.appendChild(k),
        this.translationBadgeDiv.appendChild(z),
        (this.translationBadgeDiv.style.left = "50%"),
        (this.translationBadgeDiv.style.top = "24px"),
        (this.translationBadgeDiv.style.transform = "translateX(-50%)"),
        (this.translationBadgeDiv.style.opacity = "1"));
    }
    if (this.translationCueGroup && (y = this.viewer) != null && y.viewer) {
      for (; this.translationCueGroup.children.length > 0;) {
        const N = this.translationCueGroup.children[0];
        (this.translationCueGroup.remove(N),
          N.geometry && N.geometry.dispose(),
          N.material &&
            !((w = N.userData) != null && w.isEdge) &&
            (Array.isArray(N.material)
              ? N.material.forEach((O) => O.dispose())
              : N.material.dispose()));
      }
      this.translationCueGroup.position.set(0, 0, 0);
      let C = 10;
      (l.type === "plane"
        ? (C = Math.max(l.width || 30, l.height || 30) * 0.05)
        : l.type === "cylinder" &&
          (C = Math.max(l.length || 30, (l.diameter || 2) * 10) * 0.05),
        (C = Math.max(2, C)));
      const k = new i.SphereGeometry(C, 16, 16),
        z = new i.MeshBasicMaterial({
          color: 16777215,
          depthTest: !1,
          transparent: !0,
          opacity: 0.9,
        }),
        _ = new i.Mesh(k, z);
      if (
        (_.position.copy(u),
        (_.renderOrder = 9999),
        this.translationCueGroup.add(_),
        b > 0.01)
      ) {
        const N = new i.BufferGeometry().setFromPoints([u, s]),
          O = new i.LineBasicMaterial({
            color: d,
            linewidth: 3,
            depthTest: !1,
          }),
          j = new i.Line(N, O);
        ((j.renderOrder = 9999), this.translationCueGroup.add(j));
        const V = new i.SphereGeometry(C * 0.8, 16, 16),
          U = new i.MeshBasicMaterial({ color: 16096779, depthTest: !1 }),
          $ = new i.Mesh(V, U);
        ($.position.copy(s),
          ($.renderOrder = 9999),
          this.translationCueGroup.add($));
      }
      try {
        this.viewer.viewer.Render();
      } catch {}
    }
  }
  clearTranslationVisualCue() {
    var i, r;
    if (
      ((this.isTranslatingTool = !1),
      (this.translationStartPos = null),
      (this.translationAxisName = null),
      this.translationCueGroup && (i = this.viewer) != null && i.viewer)
    ) {
      const l = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      l &&
        (l.remove(this.translationCueGroup),
        this.translationCueGroup.traverse((u) => {
          var s, c;
          (u.geometry && u.geometry.dispose(),
            u.material &&
              (Array.isArray(u.material)
                ? u.material.forEach((f) => {
                    var d;
                    return (d = f == null ? void 0 : f.dispose) == null
                      ? void 0
                      : d.call(f);
                  })
                : (c = (s = u.material) == null ? void 0 : s.dispose) == null ||
                  c.call(s)));
        }));
    }
    if (
      ((this.translationCueGroup = null),
      this.translationBadgeDiv &&
        (this.translationBadgeDiv.parentElement &&
          this.translationBadgeDiv.parentElement.removeChild(
            this.translationBadgeDiv,
          ),
        (this.translationBadgeDiv = null)),
      (r = this.viewer) != null && r.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
  }
  addPlanningPoint(i, r) {
    if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
    const l = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
    if (!l) return;
    const u = window.THREE;
    if (
      (this.planningMode === "plane" && this.planningPoints.length >= 3) ||
      (this.planningMode === "cylinder" && this.planningPoints.length >= 2) ||
      (this.planningMode === "measure" && this.planningPoints.length >= 2) ||
      (this.planningMode === "angle" && this.planningPoints.length >= 3)
    )
      return;
    (this.planningPoints.push(i),
      r
        ? this.planningNormals.push(r)
        : this.planningNormals.push(new u.Vector3(0, 1, 0)));
    const s = new u.SphereGeometry(2, 16, 16),
      c = this.planningMode === "measure",
      f = this.planningMode === "angle";
    let d = 16711680;
    (c && (d = 1096065), f && (d = 14251782));
    const h = new u.MeshBasicMaterial({ color: d, depthTest: !1 }),
      m = new u.Mesh(s, h);
    if (
      (m.position.copy(i),
      (m.renderOrder = 999),
      (m.userData = { isCustomOverlay: !0 }),
      l.add(m),
      this.planningPointMarkers.push(m),
      c && this.planningPoints.length === 2)
    ) {
      const x = this.planningPoints[0],
        b = this.planningPoints[1],
        y = this.calculateMeasurement(),
        w = y ? y.angle : 0;
      (this.createPlanningMeasurement(x, b, w),
        this.clearPlanningPoints(),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects));
      return;
    }
    if (f && this.planningPoints.length === 3) {
      const x = this.planningPoints[0],
        b = this.planningPoints[1],
        y = this.planningPoints[2],
        w = new u.Vector3().subVectors(x, b).normalize(),
        C = new u.Vector3().subVectors(y, b).normalize(),
        k = Math.min(Math.max(w.dot(C), -1), 1),
        _ = Math.acos(k) * (180 / Math.PI);
      (this.createPlanningAngle(x, b, y, _),
        this.clearPlanningPoints(),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects));
      return;
    }
    if (this.planningMode === "point" && this.planningPoints.length === 1) {
      const x = this.planningPoints[0];
      (this.createPlanningPoint(x, 0.2),
        this.clearPlanningPoints(),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects));
      return;
    }
    if (
      this.planningMode === "annotation" &&
      this.planningPoints.length === 1
    ) {
      const x = this.planningPoints[0],
        b =
          this.planningNormals && this.planningNormals[0]
            ? this.planningNormals[0]
            : null;
      if (this.resnappingAnnotationId) {
        const y = this.resnappingAnnotationId;
        ((this.resnappingAnnotationId = null),
          this.updateAnnotationPosition(y, x, b),
          this.clearPlanningPoints(),
          this.setPlanningMode("none"),
          this.config.onPlanningObjectsChange &&
            this.config.onPlanningObjectsChange(this.planningObjects));
        return;
      }
      (this.createPlanningAnnotation(x, b),
        this.clearPlanningPoints(),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects));
      return;
    }
    (this.config.onPlanningPointsChange &&
      this.config.onPlanningPointsChange(this.planningPoints.length),
      this.config.onMeasurementChange &&
        this.config.onMeasurementChange(this.calculateMeasurement()),
      this.viewer.viewer.Render());
  }
  undoPlanningPoint() {
    var i, r, l, u, s, c, f, d;
    if (this.planningPoints.length > 0) {
      (this.planningPoints.pop(), this.planningNormals.pop());
      const h = this.planningPointMarkers.pop();
      if (h) {
        const m =
          ((r = (i = this.viewer) == null ? void 0 : i.viewer) == null
            ? void 0
            : r.scene) ||
          ((u = (l = this.viewer) == null ? void 0 : l.viewer) == null
            ? void 0
            : u.mainScene);
        (m && m.remove(h),
          h.geometry && h.geometry.dispose(),
          h.material && h.material.dispose());
      }
      if (
        this.planningMode === "measure" &&
        this.planningPointMarkers.length > 0
      ) {
        const m = this.planningPointMarkers.pop();
        if (m) {
          const x =
            ((c = (s = this.viewer) == null ? void 0 : s.viewer) == null
              ? void 0
              : c.scene) ||
            ((d = (f = this.viewer) == null ? void 0 : f.viewer) == null
              ? void 0
              : d.mainScene);
          (x && x.remove(m),
            m.geometry && m.geometry.dispose(),
            m.material && m.material.dispose());
        }
      }
      (this.config.onPlanningPointsChange &&
        this.config.onPlanningPointsChange(this.planningPoints.length),
        this.config.onMeasurementChange &&
          this.config.onMeasurementChange(this.calculateMeasurement()),
        this.viewer && this.viewer.viewer && this.viewer.viewer.Render());
    }
  }
  calculateMeasurement() {
    if (!window.THREE || this.planningPoints.length < 2) return null;
    const i = this.planningPoints[0],
      r = this.planningPoints[1],
      l = i.distanceTo(r);
    let u = 0;
    if (this.planningNormals.length >= 2) {
      const s = this.planningNormals[0],
        c = this.planningNormals[1],
        f = Math.min(Math.max(s.dot(c), -1), 1);
      u = Math.acos(f) * (180 / Math.PI);
    }
    return { distance: l, angle: u };
  }
  confirmPlanningObject(i: any = {}) {
    if (this.planningMode === "plane" && this.planningPoints.length === 3)
      (this.createPlanningPlane(
        this.planningPoints[0],
        this.planningPoints[1],
        this.planningPoints[2],
        i.planeExtWidth,
        i.planeExtLength,
      ),
        this.setPlanningMode("none"),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage());
    else if (
      this.planningMode === "cylinder" &&
      this.planningPoints.length === 2
    )
      (this.createPlanningCylinder(
        this.planningPoints[0],
        this.planningPoints[1],
        i.cylinderRadius,
        i.cylinderExtension,
      ),
        this.setPlanningMode("none"),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage());
    else if (
      this.planningMode === "measure" &&
      this.planningPoints.length === 2
    ) {
      const r = this.calculateMeasurement(),
        l = r ? r.angle : 0;
      (this.createPlanningMeasurement(
        this.planningPoints[0],
        this.planningPoints[1],
        l,
      ),
        this.setPlanningMode("none"),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage());
    } else
      this.planningMode === "curve" &&
        this.planningPoints.length >= 2 &&
        (this.createPlanningCurve(
          this.planningPoints,
          i.curveThickness !== void 0 ? i.curveThickness : 0.2,
        ),
        this.setPlanningMode("none"),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage());
  }
  createPlanningPlane(i, r, l, u, s) {
    if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
    const c = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
    if (!c) return;
    const f = window.THREE,
      d = new f.Vector3().addVectors(i, r).add(l).divideScalar(3),
      h = new f.Vector3().subVectors(r, i),
      m = new f.Vector3().subVectors(l, i),
      x = new f.Vector3().crossVectors(h, m).normalize(),
      b = i.distanceTo(r),
      y = new f.Vector3().copy(h).normalize(),
      w = new f.Vector3()
        .crossVectors(new f.Vector3().subVectors(l, i), y)
        .length(),
      C = b + (u !== void 0 ? u : 10),
      k = w + (s !== void 0 ? s : 10),
      z = 0,
      _ = new f.BoxGeometry(C, k, z),
      N = new f.MeshBasicMaterial({
        color: 65280,
        transparent: !0,
        opacity: 0.5,
        depthTest: !1,
      }),
      O = new f.Mesh(_, N);
    O.renderOrder = 999;
    const j = new f.Vector3(0, 0, 1),
      V = new f.Quaternion().setFromUnitVectors(j, x),
      U = new f.Vector3().crossVectors(x, y).normalize(),
      $ = new f.Matrix4().makeBasis(y, U, x);
    (V.setFromRotationMatrix($), O.quaternion.copy(V), O.position.copy(d));
    const q = new f.EdgesGeometry(_),
      G = new f.LineBasicMaterial({
        color: 43520,
        linewidth: 2,
        depthTest: !1,
      }),
      X = new f.LineSegments(q, G);
    ((X.userData.isEdge = !0),
      O.add(X),
      (O.userData = { isCustomOverlay: !0 }),
      c.add(O),
      this.viewer.viewer.Render());
    const R = `Plane_${this.nextPlanningObjectId++}`;
    this.planningObjects.push({
      id: R,
      name: R,
      type: "plane",
      mesh: O,
      width: C,
      height: k,
      thickness: z,
      baseWidth: b,
      baseLength: w,
      extWidth: u !== void 0 ? u : 10,
      extLength: s !== void 0 ? s : 10,
      color: "#00ff00",
      p1: { x: i.x, y: i.y, z: i.z },
      p2: { x: r.x, y: r.y, z: r.z },
      p3: { x: l.x, y: l.y, z: l.z },
    });
  }
  createPlanningCylinder(i, r, l, u) {
    if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
    const s = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
    if (!s) return;
    const c = window.THREE,
      f = i.distanceTo(r),
      d = new c.Vector3().addVectors(i, r).multiplyScalar(0.5),
      h = new c.Vector3().subVectors(r, i).normalize(),
      m = l || 0.5,
      x = u !== void 0 ? u : 20,
      b = f + x * 2,
      y = new c.CylinderGeometry(m, m, b, 32),
      w = new c.MeshBasicMaterial({
        color: 255,
        transparent: !0,
        opacity: 0.5,
        depthTest: !1,
      }),
      C = new c.Mesh(y, w);
    C.renderOrder = 999;
    const k = new c.Vector3(0, 1, 0),
      z = new c.Quaternion().setFromUnitVectors(k, h);
    (C.quaternion.copy(z), C.position.copy(d));
    const _ = new c.EdgesGeometry(y),
      N = new c.LineBasicMaterial({ color: 170, linewidth: 2, depthTest: !1 }),
      O = new c.LineSegments(_, N);
    ((O.userData.isEdge = !0),
      C.add(O),
      (C.userData = { isCustomOverlay: !0 }),
      s.add(C),
      this.viewer.viewer.Render());
    const j = `Cylinder_${this.nextPlanningObjectId++}`;
    this.planningObjects.push({
      id: j,
      name: j,
      type: "cylinder",
      mesh: C,
      radius: m,
      length: b,
      baseDistance: f,
      color: "#0000ff",
      diameter: m * 2,
      extension: x,
      p1: { x: i.x, y: i.y, z: i.z },
      p2: { x: r.x, y: r.y, z: r.z },
    });
  }
  createPlanningCurve(i, r) {
    if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
    const l = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
    if (!l) return;
    const u = window.THREE,
      s = new u.CatmullRomCurve3(i),
      c = r / 2,
      f = Math.max(20, i.length * 10),
      d = 8,
      h = new u.TubeGeometry(s, f, c, d, !1),
      m = new u.MeshBasicMaterial({
        color: 14362487,
        transparent: !0,
        opacity: 0.6,
        depthTest: !1,
      }),
      x = new u.Mesh(h, m);
    x.renderOrder = 999;
    const b = new u.EdgesGeometry(h),
      y = new u.LineBasicMaterial({
        color: 10295117,
        linewidth: 2,
        depthTest: !1,
      }),
      w = new u.LineSegments(b, y);
    ((w.userData.isEdge = !0),
      x.add(w),
      (x.userData = { isCustomOverlay: !0 }),
      l.add(x),
      this.viewer.viewer.Render());
    const C = `Curve_${this.nextPlanningObjectId++}`;
    this.planningObjects.push({
      id: C,
      name: C,
      type: "curve",
      mesh: x,
      thickness: r,
      baseDistance: s.getLength(),
      curvePath: s,
      pointsCount: i.length,
      color: "#db2777",
      points: i.map((k) => ({ x: k.x, y: k.y, z: k.z })),
    });
  }
  projectToScreen(i) {
    if (
      !window.THREE ||
      !this.viewer ||
      !this.viewer.viewer ||
      !this.viewer.viewer.camera
    )
      return null;
    const r = this.viewer.viewer.camera,
      l = this.container;
    if (!r || !l) return null;
    const u = i.clone();
    u.project(r);
    const s = l.getBoundingClientRect(),
      c = (u.x * 0.5 + 0.5) * s.width,
      f = (-(u.y * 0.5) + 0.5) * s.height;
    return { x: c, y: f, z: u.z };
  }
  ensureCardTooltipElement() {
    if (!this.cardTooltipDiv) {
      const i = document.createElement("div");
      ((i.className =
        "card-hover-tooltip absolute z-50 pointer-events-none transition-all duration-150 ease-out select-none shadow-2xl backdrop-blur-md rounded-xl p-3 border border-slate-700/80 bg-slate-900/95 text-white max-w-[280px] min-w-[210px] flex flex-col gap-1.5 opacity-0 scale-95"),
        (i.style.backgroundColor = "rgba(15, 23, 42, 0.96)"),
        (i.style.borderColor = "rgba(51, 65, 85, 0.8)"),
        (i.style.boxShadow =
          "0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5)"),
        (i.style.backdropFilter = "blur(12px)"),
        (i.style.display = "none"),
        this.container && this.container.appendChild(i),
        (this.cardTooltipDiv = i));
    }
    return this.cardTooltipDiv;
  }
  showCardTooltip(i, r) {
    if (!i || i.visible === !1 || !this.container) return;
    this.hoveredPlanningObject = i;
    const l = this.ensureCardTooltipElement();
    let u = "Object",
      s = i.name || "Callout";
    const c = i.description ? String(i.description).trim() : "",
      f =
        i.color ||
        (i.type === "angle"
          ? "#d97706"
          : i.type === "measurement"
            ? "#10b981"
            : "#0284c7");
    if (i.type === "measurement") {
      u = "Distance";
      const d =
        i.baseDistance !== void 0 ? `${i.baseDistance.toFixed(2)} mm` : "";
      s = i.name ? `${i.name}${d ? ` (${d})` : ""}` : d;
    } else if (i.type === "angle") {
      u = "Angle";
      const d = i.angle !== void 0 ? `${i.angle.toFixed(1)}°` : "";
      s = i.name ? `${i.name}${d ? ` (${d})` : ""}` : d;
    } else
      i.type === "annotation" &&
        ((u = "3D Pin"), (s = i.text || i.name || "Annotation"));
    ((l.style.borderTop = `2.5px solid ${f}`),
      (l.innerHTML = `
      <div class="flex items-center justify-between gap-2.5 pb-2 border-b border-slate-800/80">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs" style="background-color: ${f}"></span>
          <span class="font-mono text-xs font-bold text-white tracking-tight truncate">${s}</span>
        </div>
        <span class="text-[9px] uppercase font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60 font-semibold tracking-wider shrink-0">${u}</span>
      </div>
      ${
        c
          ? `
        <div class="text-[11px] text-zinc-300 font-sans leading-relaxed break-words whitespace-pre-wrap py-1">
          ${c}
        </div>
      `
          : ""
      }
    `),
      (l.style.display = "flex"),
      this.updateCardTooltipPosition(r),
      requestAnimationFrame(() => {
        var d;
        this.cardTooltipDiv &&
          ((d = this.hoveredPlanningObject) == null ? void 0 : d.id) === i.id &&
          (this.cardTooltipDiv.classList.remove("opacity-0", "scale-95"),
          this.cardTooltipDiv.classList.add("opacity-100", "scale-100"));
      }));
  }
  updateCardTooltipPosition(i) {
    if (!this.cardTooltipDiv || !this.hoveredPlanningObject) return;
    const r = i || this.hoveredPlanningObject.labelDiv;
    if (!r || !this.container) return;
    const l = this.container.getBoundingClientRect(),
      u = r.getBoundingClientRect();
    if (u.width === 0 || u.height === 0 || r.style.display === "none") {
      this.hideCardTooltip();
      return;
    }
    const s = this.cardTooltipDiv.offsetWidth || 230,
      c = this.cardTooltipDiv.offsetHeight || 80,
      f = u.left + u.width / 2 - l.left,
      d = u.top - l.top;
    let m = u.bottom - l.top + 8;
    m + c > l.height - 12 && (m = Math.max(10, d - c - 8));
    let x = f - s / 2;
    ((x = Math.max(10, Math.min(l.width - s - 10, x))),
      (this.cardTooltipDiv.style.left = `${Math.round(x)}px`),
      (this.cardTooltipDiv.style.top = `${Math.round(m)}px`));
  }
  hideCardTooltip() {
    ((this.hoveredPlanningObject = null),
      this.cardTooltipDiv &&
        (this.cardTooltipDiv.classList.remove("opacity-100", "scale-100"),
        this.cardTooltipDiv.classList.add("opacity-0", "scale-95"),
        setTimeout(() => {
          !this.hoveredPlanningObject &&
            this.cardTooltipDiv &&
            (this.cardTooltipDiv.style.display = "none");
        }, 150)));
  }
  setupCardInteractions(i, r) {
    let l = !1,
      u = 0,
      s = 0,
      c = 0,
      f = 0,
      d = !1;
    (r.removeAttribute("title"),
      r.addEventListener("pointerenter", () => {
        d || l || this.showCardTooltip(i, r);
      }),
      r.addEventListener("pointerleave", () => {
        this.hideCardTooltip();
      }),
      r.addEventListener("pointerdown", (m) => {
        var x, b;
        if (m.button === 0) {
          (m.stopPropagation(),
            this.hideCardTooltip(),
            (l = !0),
            (d = !1),
            (u = m.clientX),
            (s = m.clientY),
            (c = ((x = i.cardOffset) == null ? void 0 : x.x) || 0),
            (f = ((b = i.cardOffset) == null ? void 0 : b.y) || 0),
            (r.style.cursor = "grabbing"));
          try {
            r.setPointerCapture(m.pointerId);
          } catch {}
        }
      }),
      r.addEventListener("pointermove", (m) => {
        if (!l) return;
        m.stopPropagation();
        const x = m.clientX - u,
          b = m.clientY - s;
        (Math.hypot(x, b) > 2 && ((d = !0), this.hideCardTooltip()),
          d &&
            ((i.cardOffset = { x: Math.round(c + x), y: Math.round(f + b) }),
            this.updatePlanningCardLabel(i)));
      }));
    const h = (m) => {
      if (l) {
        ((l = !1), (r.style.cursor = "grab"));
        try {
          r.hasPointerCapture(m.pointerId) &&
            r.releasePointerCapture(m.pointerId);
        } catch {}
        d
          ? (m.stopPropagation(),
            this.saveToLocalStorage(),
            this.config.onPlanningObjectsChange &&
              this.config.onPlanningObjectsChange(this.planningObjects))
          : (this.highlightPlanningMesh(i),
            this.config.onTransformActiveChange &&
              this.config.onTransformActiveChange(!1));
      }
    };
    (r.addEventListener("pointerup", h),
      r.addEventListener("pointercancel", h),
      r.addEventListener("dblclick", (m) => {
        (m.stopPropagation(),
          this.hideCardTooltip(),
          (i.cardOffset = { x: 0, y: 0 }),
          this.updatePlanningCardLabel(i),
          this.saveToLocalStorage(),
          this.config.onPlanningObjectsChange &&
            this.config.onPlanningObjectsChange(this.planningObjects));
      }));
  }
  createPlanningMeasurement(i: any, r: any, l: any = 0, u: any = 0) {
    if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
    const s = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
    if (!s) return;
    const c = window.THREE,
      f = i.distanceTo(r),
      d = new c.Vector3().addVectors(i, r).multiplyScalar(0.5),
      h = new c.Vector3().subVectors(r, i).normalize(),
      m = 0.05,
      x = f,
      b = new c.CylinderGeometry(m, m, x, 16),
      y = new c.MeshBasicMaterial({
        color: 1096065,
        transparent: !0,
        opacity: 0.8,
        depthTest: !1,
      }),
      w = new c.Mesh(b, y);
    w.renderOrder = 999;
    const C = new c.Vector3(0, 1, 0),
      k = new c.Quaternion().setFromUnitVectors(C, h);
    (w.quaternion.copy(k), w.position.copy(d));
    const z = new c.EdgesGeometry(b),
      _ = new c.LineBasicMaterial({
        color: 366185,
        linewidth: 2,
        depthTest: !1,
      }),
      N = new c.LineSegments(z, _);
    ((N.userData.isEdge = !0), w.add(N));
    const O = `Measurement_${this.nextPlanningObjectId++}`,
      j = `${f.toFixed(2)} mm`,
      V = document.createElement("div");
    ((V.className =
      "measurement-callout-pill absolute z-40 cursor-grab active:cursor-grabbing pointer-events-auto select-none font-mono text-[11px] font-semibold text-white bg-slate-900/90 hover:bg-slate-800 border rounded-full px-2.5 py-0.5 shadow-lg whitespace-nowrap flex items-center gap-1.5 backdrop-blur-xs hover:scale-105"),
      (V.style.borderColor = "#10b981"),
      (V.style.transform = "translate(-50%, -100%)"),
      (V.style.opacity = "0"),
      (V.style.touchAction = "none"));
    const U = document.createElement("span");
    ((U.className =
      "measurement-color-dot w-2 h-2 rounded-full shrink-0 shadow-xs pointer-events-none"),
      (U.style.backgroundColor = "#10b981"),
      V.appendChild(U));
    const $ = document.createElement("span");
    (($.className =
      "measurement-label-text tracking-tight pointer-events-none"),
      ($.textContent = j),
      V.appendChild($));
    const q = {
      id: O,
      name: O,
      type: "measurement",
      mesh: w,
      labelSprite: null,
      p2: r,
      labelDiv: V,
      radius: m,
      length: x,
      baseDistance: f,
      angle: l,
      color: "#10b981",
      p1: { x: i.x, y: i.y, z: i.z },
      p2Coord: { x: r.x, y: r.y, z: r.z },
      cardOffset: u
        ? { x: Math.round(u.x), y: Math.round(u.y) }
        : { x: 0, y: 0 },
      leaderLine: null,
      visible: !0,
    };
    return (
      this.setupCardInteractions(q, V),
      this.container.appendChild(V),
      (w.userData = { isCustomOverlay: !0 }),
      s.add(w),
      this.planningObjects.push(q),
      this.updatePlanningCardLabel(q),
      this.viewer.viewer.Render(),
      this.saveToLocalStorage(),
      q
    );
  }
  createPlanningPoint(i, r) {
    if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
    const l = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
    if (!l) return;
    const u = window.THREE,
      s = r / 2,
      c = new u.SphereGeometry(s, 32, 32),
      f = new u.MeshBasicMaterial({
        color: 9647082,
        transparent: !0,
        opacity: 0.9,
        depthTest: !1,
      }),
      d = new u.Mesh(c, f);
    ((d.renderOrder = 999), d.position.copy(i));
    const h = new u.EdgesGeometry(c),
      m = new u.LineBasicMaterial({
        color: 8266446,
        linewidth: 2,
        depthTest: !1,
      }),
      x = new u.LineSegments(h, m);
    (d.add(x),
      (d.userData = { isCustomOverlay: !0 }),
      l.add(d),
      this.viewer.viewer.Render());
    const b = `Point_${this.nextPlanningObjectId++}`;
    this.planningObjects.push({
      id: b,
      name: b,
      type: "point",
      mesh: d,
      labelSprite: null,
      diameter: r,
      color: "#9333ea",
      points: [{ x: i.x, y: i.y, z: i.z }],
    });
  }
  createPlanningAnnotation(i: any, r: any = null, l: any = "", u: any = "", s: any = "#0284c7", c: any = 1.5, f: any = null) {
    if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
    const d = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
    if (!d) return;
    const h = window.THREE,
      m = `Annotation_${this.nextPlanningObjectId++}`,
      x = l || m,
      b = s || "#0284c7",
      y = new h.Group(),
      w = c,
      C = new h.SphereGeometry(w, 24, 24),
      k = new h.MeshBasicMaterial({ color: b, depthTest: !1 }),
      z = new h.Mesh(C, k),
      _ = c * 4;
    ((z.position.y = _), y.add(z));
    const N = new h.SphereGeometry(w * 0.35, 16, 16),
      O = new h.MeshBasicMaterial({ color: 16777215, depthTest: !1 }),
      j = new h.Mesh(N, O);
    ((j.position.y = _), y.add(j));
    const V = new h.ConeGeometry(c * 0.35, _, 16),
      U = new h.MeshBasicMaterial({ color: b, depthTest: !1 }),
      $ = new h.Mesh(V, U);
    (($.position.y = _ / 2), y.add($));
    const q = new h.RingGeometry(c * 0.2, c * 0.6, 24),
      G = new h.MeshBasicMaterial({
        color: b,
        side: h.DoubleSide,
        depthTest: !1,
      }),
      X = new h.Mesh(q, G);
    if (((X.rotation.x = Math.PI / 2), y.add(X), y.position.copy(i), r)) {
      const H = new h.Vector3(r.x, r.y, r.z).normalize(),
        I = new h.Vector3(0, 1, 0),
        de = new h.Quaternion().setFromUnitVectors(I, H);
      y.quaternion.copy(de);
    }
    ((y.renderOrder = 999),
      (y.userData = {
        isCustomOverlay: !0,
        planningObjectId: m,
        isAnnotation: !0,
      }),
      d.add(y));
    const R = document.createElement("div");
    ((R.className =
      "annotation-callout-pill absolute z-40 cursor-grab active:cursor-grabbing pointer-events-auto select-none font-sans text-[11px] font-semibold text-white bg-slate-900/90 hover:bg-slate-800 border rounded-full px-2.5 py-0.5 shadow-lg whitespace-nowrap flex items-center gap-1.5 backdrop-blur-xs hover:scale-105"),
      (R.style.borderColor = b),
      (R.style.transform = "translate(-50%, -100%)"),
      (R.style.opacity = "0"),
      (R.style.touchAction = "none"));
    const Z = document.createElement("span");
    ((Z.className =
      "annotation-color-dot w-2 h-2 rounded-full shrink-0 shadow-xs pointer-events-none"),
      (Z.style.backgroundColor = b),
      R.appendChild(Z));
    const S = document.createElement("span");
    ((S.className = "annotation-label-text tracking-tight pointer-events-none"),
      (S.textContent = x),
      R.appendChild(S));
    const P = {
      id: m,
      name: x,
      text: x,
      description: u || "",
      type: "annotation",
      position: { x: i.x, y: i.y, z: i.z },
      normal: r ? { x: r.x, y: r.y, z: r.z } : null,
      pinSize: c,
      mesh: y,
      labelDiv: R,
      color: b,
      cardOffset: f
        ? { x: Math.round(f.x), y: Math.round(f.y) }
        : { x: 0, y: 0 },
      leaderLine: null,
      visible: !0,
    };
    return (
      this.setupCardInteractions(P, R),
      this.container.appendChild(R),
      this.planningObjects.push(P),
      this.updateSingleAnnotationLabel(P),
      this.viewer.viewer.Render(),
      this.saveToLocalStorage(),
      P
    );
  }
  ensureAnnotationSvgOverlay() {
    if (this.annotationSvgOverlay && this.annotationSvgOverlay.parentElement)
      return this.annotationSvgOverlay;
    const i = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    return (
      i.setAttribute(
        "class",
        "planning-leader-overlay absolute inset-0 pointer-events-none w-full h-full z-30",
      ),
      (i.style.position = "absolute"),
      (i.style.left = "0"),
      (i.style.top = "0"),
      (i.style.width = "100%"),
      (i.style.height = "100%"),
      (i.style.pointerEvents = "none"),
      (i.style.overflow = "visible"),
      this.container.appendChild(i),
      (this.annotationSvgOverlay = i),
      i
    );
  }
  updateCardLeaderLine(i, r, l, u, s) {
    if (i.visible === !1) {
      i.leaderLine && (i.leaderLine.style.display = "none");
      return;
    }
    const c =
        i.cardOffset &&
        (Math.abs(i.cardOffset.x) > 1 || Math.abs(i.cardOffset.y) > 1),
      f = this.ensureAnnotationSvgOverlay(),
      d =
        i.type === "angle"
          ? "#d97706"
          : i.type === "measurement"
            ? "#10b981"
            : "#0284c7";
    if (!i.leaderLine) {
      const h = document.createElementNS("http://www.w3.org/2000/svg", "line");
      (h.setAttribute("stroke", i.color || d),
        h.setAttribute("stroke-width", "1.5"),
        h.setAttribute("stroke-dasharray", "3,3"),
        h.setAttribute("stroke-linecap", "round"),
        f.appendChild(h),
        (i.leaderLine = h));
    }
    c
      ? (i.leaderLine.setAttribute("x1", String(r)),
        i.leaderLine.setAttribute("y1", String(l)),
        i.leaderLine.setAttribute("x2", String(u)),
        i.leaderLine.setAttribute("y2", String(s)),
        i.leaderLine.setAttribute("stroke", i.color || d),
        (i.leaderLine.style.display = "block"))
      : (i.leaderLine.style.display = "none");
  }
  updateAnnotationLeaderLine(i, r, l, u, s) {
    this.updateCardLeaderLine(i, r, l, u, s);
  }
  updatePlanningCardLabel(i) {
    var l, u, s, c, f, d;
    if (!i || !["annotation", "measurement", "angle"].includes(i.type)) return;
    if (i.visible === !1) {
      (i.labelDiv &&
        ((i.labelDiv.style.opacity = "0"), (i.labelDiv.style.display = "none")),
        i.leaderLine && (i.leaderLine.style.display = "none"),
        ((l = this.hoveredPlanningObject) == null ? void 0 : l.id) === i.id &&
          this.hideCardTooltip());
      return;
    }
    if (!i.labelDiv || !window.THREE) return;
    let r = null;
    if (i.type === "annotation")
      i.mesh && i.mesh.position
        ? (r = i.mesh.position)
        : i.position &&
          (r = new window.THREE.Vector3(
            i.position.x,
            i.position.y,
            i.position.z,
          ));
    else if (i.type === "measurement") {
      if (i.mesh && i.mesh.position) r = i.mesh.position;
      else if (i.p1 && (i.p2Coord || i.p2)) {
        const h = i.p2Coord || i.p2;
        r = new window.THREE.Vector3(
          (i.p1.x + h.x) * 0.5,
          (i.p1.y + h.y) * 0.5,
          (i.p1.z + h.z) * 0.5,
        );
      }
    } else if (i.type === "angle") {
      const h = i.p2Coord || i.p2;
      h && (r = new window.THREE.Vector3(h.x, h.y, h.z));
    }
    if (r) {
      const h = this.projectToScreen(r);
      if (h && h.z < 1) {
        const m = ((u = i.cardOffset) == null ? void 0 : u.x) || 0,
          x = ((s = i.cardOffset) == null ? void 0 : s.y) || 0,
          b = i.type === "annotation" ? -18 : -14,
          y = h.x + m,
          w = h.y + b + x;
        ((i.labelDiv.style.left = `${y}px`),
          (i.labelDiv.style.top = `${w}px`),
          (i.labelDiv.style.opacity = "1"),
          (i.labelDiv.style.display = "flex"),
          this.updateCardLeaderLine(i, h.x, h.y, y, w),
          ((c = this.hoveredPlanningObject) == null ? void 0 : c.id) === i.id &&
            this.updateCardTooltipPosition(i.labelDiv));
      } else
        ((i.labelDiv.style.opacity = "0"),
          (i.labelDiv.style.display = "none"),
          i.leaderLine && (i.leaderLine.style.display = "none"),
          ((f = this.hoveredPlanningObject) == null ? void 0 : f.id) === i.id &&
            this.hideCardTooltip());
    } else
      ((i.labelDiv.style.opacity = "0"),
        (i.labelDiv.style.display = "none"),
        i.leaderLine && (i.leaderLine.style.display = "none"),
        ((d = this.hoveredPlanningObject) == null ? void 0 : d.id) === i.id &&
          this.hideCardTooltip());
  }
  updateSingleAnnotationLabel(i) {
    this.updatePlanningCardLabel(i);
  }
  updateAnnotationPosition(i, r, l) {
    var c;
    const u = this.planningObjects.find((f) => f.id === i);
    if (!u || !window.THREE) return;
    const s = window.THREE;
    if (
      ((u.position = { x: r.x, y: r.y, z: r.z }),
      l && (u.normal = { x: l.x, y: l.y, z: l.z }),
      u.mesh && (u.mesh.position.copy(r), l))
    ) {
      const f = new s.Vector3(l.x, l.y, l.z).normalize(),
        d = new s.Vector3(0, 1, 0),
        h = new s.Quaternion().setFromUnitVectors(d, f);
      u.mesh.quaternion.copy(h);
    }
    (this.config.onPlanningObjectsChange &&
      this.config.onPlanningObjectsChange(this.planningObjects),
      this.saveToLocalStorage(),
      (c = this.viewer) != null && c.viewer && this.viewer.viewer.Render());
  }
  updatePlanningAnnotation(i, r) {
    var u, s;
    const l = this.planningObjects.find((c) => c.id === i);
    if (l) {
      if (
        (r.text !== void 0 && ((l.text = r.text), (l.name = r.text)),
        r.description !== void 0 && (l.description = r.description),
        r.color !== void 0 &&
          ((l.color = r.color), this.updateMeshColorAndVisibility(l)),
        r.pinSize !== void 0 && l.mesh)
      ) {
        l.pinSize = r.pinSize;
        const c = r.pinSize / 1.5;
        l.mesh.scale.set(c, c, c);
      }
      if (l.labelDiv) {
        const c = l.labelDiv.querySelector(".annotation-label-text");
        if (
          (c
            ? (c.textContent = l.text || l.name)
            : (l.labelDiv.innerText = l.text || l.name),
          l.color)
        ) {
          l.labelDiv.style.borderColor = l.color;
          const f = l.labelDiv.querySelector(".annotation-color-dot");
          f && (f.style.backgroundColor = l.color);
        }
        (l.labelDiv.removeAttribute("title"),
          ((u = this.hoveredPlanningObject) == null ? void 0 : u.id) === l.id &&
            this.showCardTooltip(l, l.labelDiv));
      }
      (this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage(),
        (s = this.viewer) != null && s.viewer && this.viewer.viewer.Render());
    }
  }
  focusOnPlanningObject(i) {
    const r = this.planningObjects.find((w) => w.id === i);
    if (!r || !this.viewer || !this.viewer.viewer) return;
    const l = this.viewer.viewer.navigation;
    if (!l) return;
    const u = window.THREE;
    if (!u) return;
    let s = new u.Vector3();
    if (r.position) s.set(r.position.x, r.position.y, r.position.z);
    else if (r.mesh) r.mesh.getWorldPosition(s);
    else if (r.points && r.points[0])
      s.set(r.points[0].x, r.points[0].y, r.points[0].z);
    else if (r.p2) s.set(r.p2.x, r.p2.y, r.p2.z);
    else return;
    const c = l.GetCamera();
    if (!c) return;
    const f = new u.Vector3(c.eye.x, c.eye.y, c.eye.z),
      d = new u.Vector3(c.center.x, c.center.y, c.center.z),
      h = new u.Vector3(c.up.x, c.up.y, c.up.z);
    let m = new u.Vector3().subVectors(f, d).normalize();
    m.lengthSq() < 0.001 && m.set(0, 0, 1);
    const x = f.distanceTo(d),
      b = Math.max(25, Math.min(x, 120)),
      y = new u.Vector3().copy(s).addScaledVector(m, b);
    if (l && typeof l.SetCamera == "function") {
      const w = f.clone(),
        C = d.clone(),
        k = performance.now(),
        z = 350,
        _ = (N) => {
          var G;
          const O = N - k,
            j = Math.min(1, O / z),
            V = 0.5 - 0.5 * Math.cos(j * Math.PI),
            U = new u.Vector3().lerpVectors(w, y, V),
            $ = new u.Vector3().lerpVectors(C, s, V),
            q = new window.OV.Camera(
              new window.OV.Coord3D(U.x, U.y, U.z),
              new window.OV.Coord3D($.x, $.y, $.z),
              new window.OV.Coord3D(h.x, h.y, h.z),
              c.fov || 45,
            );
          (l.SetCamera(q),
            (G = this.viewer) != null &&
              G.viewer &&
              this.viewer.viewer.Render(),
            j < 1 && requestAnimationFrame(_));
        };
      requestAnimationFrame(_);
    }
    if ((this.highlightPlanningMesh(r), this.config.onTransformActiveChange)) {
      const w = ["plane", "cylinder", "custom_model"].includes(r.type);
      this.config.onTransformActiveChange(w, w ? r.id : void 0);
    }
  }
  startResnappingAnnotation(i) {
    ((this.resnappingAnnotationId = i), this.setPlanningMode("annotation"));
  }
  createPlanningAngle(i: any, r: any, l: any, u: any = 0, s: any = 0) {
    if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
    const c = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
    if (!c) return;
    const f = window.THREE,
      d = new f.Group(),
      h = (S, P, H) => {
        const I = S.distanceTo(P),
          de = new f.Vector3().addVectors(S, P).multiplyScalar(0.5),
          te = new f.Vector3().subVectors(P, S).normalize(),
          D = 0.05,
          M = new f.CylinderGeometry(D, D, I, 16),
          B = new f.MeshBasicMaterial({
            color: H,
            transparent: !0,
            opacity: 0.8,
            depthTest: !1,
          }),
          A = new f.Mesh(M, B);
        A.renderOrder = 999;
        const Q = new f.Vector3(0, 1, 0),
          W = new f.Quaternion().setFromUnitVectors(Q, te);
        (A.quaternion.copy(W), A.position.copy(de));
        const oe = new f.EdgesGeometry(M),
          ze = new f.LineBasicMaterial({
            color: 14251782,
            linewidth: 2,
            depthTest: !1,
          }),
          ye = new f.LineSegments(oe, ze);
        return (A.add(ye), A);
      },
      m = h(i, r, 14251782),
      x = h(l, r, 14251782);
    (d.add(m), d.add(x));
    const b = new f.Vector3().subVectors(i, r),
      y = new f.Vector3().subVectors(l, r),
      w = new f.Vector3().crossVectors(b, y).normalize(),
      C = b.clone().normalize(),
      k = y.clone().normalize(),
      z = Math.min(b.length(), y.length()) * 0.15 || 5,
      _ = 24,
      N = [];
    for (let S = 0; S <= _; S++) {
      const P = S / _,
        H = C.angleTo(k),
        I = C.clone().applyAxisAngle(w, H * P);
      N.push(new f.Vector3().copy(r).add(I.multiplyScalar(z)));
    }
    const O = new f.CatmullRomCurve3(N),
      j = new f.TubeGeometry(O, _, 0.05, 8, !1),
      V = new f.MeshBasicMaterial({
        color: 14251782,
        transparent: !0,
        opacity: 0.9,
        depthTest: !1,
      }),
      U = new f.Mesh(j, V);
    ((U.renderOrder = 999), d.add(U));
    const $ = `Angle_${this.nextPlanningObjectId++}`,
      q = `${u.toFixed(1)}°`,
      G = document.createElement("div");
    ((G.className =
      "angle-callout-pill absolute z-40 cursor-grab active:cursor-grabbing pointer-events-auto select-none font-mono text-[11px] font-semibold text-white bg-slate-900/90 hover:bg-slate-800 border rounded-full px-2.5 py-0.5 shadow-lg whitespace-nowrap flex items-center gap-1.5 backdrop-blur-xs hover:scale-105"),
      (G.style.borderColor = "#d97706"),
      (G.style.transform = "translate(-50%, -100%)"),
      (G.style.opacity = "0"),
      (G.style.touchAction = "none"));
    const X = document.createElement("span");
    ((X.className =
      "angle-color-dot w-2 h-2 rounded-full shrink-0 shadow-xs pointer-events-none"),
      (X.style.backgroundColor = "#d97706"),
      G.appendChild(X));
    const R = document.createElement("span");
    ((R.className = "angle-label-text tracking-tight pointer-events-none"),
      (R.textContent = q),
      G.appendChild(R));
    const Z = {
      id: $,
      name: $,
      type: "angle",
      mesh: d,
      labelSprite: null,
      p2: r,
      labelDiv: G,
      p1: { x: i.x, y: i.y, z: i.z },
      p2Coord: { x: r.x, y: r.y, z: r.z },
      p3: { x: l.x, y: l.y, z: l.z },
      angle: u,
      color: "#d97706",
      cardOffset: s
        ? { x: Math.round(s.x), y: Math.round(s.y) }
        : { x: 0, y: 0 },
      leaderLine: null,
      visible: !0,
    };
    return (
      this.setupCardInteractions(Z, G),
      this.container.appendChild(G),
      (d.userData = { isCustomOverlay: !0 }),
      c.add(d),
      this.planningObjects.push(Z),
      this.updatePlanningCardLabel(Z),
      this.viewer.viewer.Render(),
      this.saveToLocalStorage(),
      Z
    );
  }
  updatePlanningObjectName(i, r) {
    var u;
    const l = this.planningObjects.find((s) => s.id === i);
    if (l) {
      if (((l.name = r), l.labelDiv)) {
        if ((l.labelDiv.removeAttribute("title"), l.type === "angle")) {
          const s = l.name
              ? `${l.name} (${l.angle.toFixed(1)}°)`
              : `${l.angle.toFixed(1)}°`,
            c = l.labelDiv.querySelector(".angle-label-text");
          c ? (c.textContent = s) : (l.labelDiv.innerText = s);
        } else if (l.type === "annotation") {
          l.text = r;
          const s = l.labelDiv.querySelector(".annotation-label-text");
          s ? (s.textContent = r) : (l.labelDiv.innerText = r);
        } else if (l.baseDistance !== void 0 || l.type === "measurement") {
          const s = l.name
              ? `${l.name} (${l.baseDistance.toFixed(2)} mm)`
              : `${l.baseDistance.toFixed(2)} mm`,
            c = l.labelDiv.querySelector(".measurement-label-text");
          c ? (c.textContent = s) : (l.labelDiv.innerText = s);
        }
        ((u = this.hoveredPlanningObject) == null ? void 0 : u.id) === l.id &&
          this.showCardTooltip(l, l.labelDiv);
      }
      (this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage());
    }
  }
  updatePlanningObjectScale(i, r) {
    const l = this.planningObjects.find((u) => u.id === i);
    l &&
      (r.scaleX !== void 0 &&
        ((l.scaleX = r.scaleX), (l.mesh.scale.x = r.scaleX)),
      r.scaleY !== void 0 &&
        ((l.scaleY = r.scaleY), (l.mesh.scale.y = r.scaleY)),
      r.scaleZ !== void 0 &&
        ((l.scaleZ = r.scaleZ), (l.mesh.scale.z = r.scaleZ)),
      this.viewer && this.viewer.viewer && this.viewer.viewer.Render(),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
      this.saveToLocalStorage());
  }
  updatePlaneGeometry(i, r, l) {
    const u = window.THREE;
    if (!u) return;
    const s = this.planningObjects.find((w) => w.id === i);
    if (
      !s ||
      s.type !== "plane" ||
      s.baseWidth === void 0 ||
      s.baseLength === void 0
    )
      return;
    s.mesh.geometry && s.mesh.geometry.dispose();
    const c = s.baseWidth + r,
      f = s.baseLength + r,
      d = Math.abs(l),
      h = new u.BoxGeometry(c, f, d);
    (h.translate(0, 0, l / 2),
      (s.mesh.geometry = h),
      s.mesh.children
        .filter((w) => w.isLineSegments || w.type === "LineSegments")
        .forEach((w) => {
          if (w.geometry && typeof w.geometry.dispose == "function")
            try {
              w.geometry.dispose();
            } catch {}
          if (w.material && typeof w.material.dispose == "function")
            try {
              w.material.dispose();
            } catch {}
          s.mesh.remove(w);
        }));
    const x = new u.EdgesGeometry(h),
      b = new u.LineBasicMaterial({
        color: 43520,
        linewidth: 2,
        depthTest: !1,
      }),
      y = new u.LineSegments(x, b);
    (s.mesh.add(y),
      (s.extWidth = r),
      (s.extLength = r),
      (s.width = c),
      (s.height = f),
      (s.thickness = l),
      this.viewer && this.viewer.viewer && this.viewer.viewer.Render(),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
      this.saveToLocalStorage());
  }
  updateCylinderGeometry(i, r, l) {
    const u = window.THREE;
    if (!u) return;
    const s = this.planningObjects.find((y) => y.id === i);
    if (!s || s.type !== "cylinder" || s.baseDistance === void 0) return;
    s.mesh.geometry && s.mesh.geometry.dispose();
    const c = r / 2,
      f = s.baseDistance + l * 2,
      d = new u.CylinderGeometry(c, c, f, 32);
    ((s.mesh.geometry = d),
      s.mesh.children
        .filter((y) => y.isLineSegments || y.type === "LineSegments")
        .forEach((y) => {
          if (y.geometry && typeof y.geometry.dispose == "function")
            try {
              y.geometry.dispose();
            } catch {}
          if (y.material && typeof y.material.dispose == "function")
            try {
              y.material.dispose();
            } catch {}
          s.mesh.remove(y);
        }));
    const m = new u.EdgesGeometry(d),
      x = new u.LineBasicMaterial({ color: 170, linewidth: 2, depthTest: !1 }),
      b = new u.LineSegments(m, x);
    (s.mesh.add(b),
      (s.radius = c),
      (s.length = f),
      (s.diameter = r),
      (s.extension = l),
      this.viewer && this.viewer.viewer && this.viewer.viewer.Render(),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
      this.saveToLocalStorage());
  }
  updatePlanningObjectCurveThickness(i, r) {
    const l = this.planningObjects.find((y) => y.id === i);
    if (!l || l.type !== "curve" || !l.curvePath) return;
    const u = window.THREE;
    if (!u) return;
    l.mesh.geometry && l.mesh.geometry.dispose();
    const s = r / 2,
      c = Math.max(20, l.pointsCount * 10),
      f = 8,
      d = new u.TubeGeometry(l.curvePath, c, s, f, !1);
    ((l.mesh.geometry = d),
      l.mesh.children
        .filter((y) => y.isLineSegments || y.type === "LineSegments")
        .forEach((y) => {
          if (y.geometry && typeof y.geometry.dispose == "function")
            try {
              y.geometry.dispose();
            } catch {}
          if (y.material && typeof y.material.dispose == "function")
            try {
              y.material.dispose();
            } catch {}
          l.mesh.remove(y);
        }));
    const m = new u.EdgesGeometry(d),
      x = new u.LineBasicMaterial({
        color: 10295117,
        linewidth: 2,
        depthTest: !1,
      }),
      b = new u.LineSegments(m, x);
    (l.mesh.add(b),
      (l.thickness = r),
      this.viewer && this.viewer.viewer && this.viewer.viewer.Render(),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
      this.saveToLocalStorage());
  }
  updatePlanningPointDiameter(i, r) {
    var x;
    const l = this.planningObjects.find((b) => b.id === i);
    if (!l || l.type !== "point") return;
    const u = window.THREE;
    if (!u) return;
    l.mesh.geometry && l.mesh.geometry.dispose();
    const s = r / 2,
      c = new u.SphereGeometry(s, 32, 32);
    ((l.mesh.geometry = c),
      l.mesh.children
        .filter((b) => b.isLineSegments || b.type === "LineSegments")
        .forEach((b) => {
          if (b.geometry && typeof b.geometry.dispose == "function")
            try {
              b.geometry.dispose();
            } catch {}
          if (b.material && typeof b.material.dispose == "function")
            try {
              b.material.dispose();
            } catch {}
          l.mesh.remove(b);
        }));
    const d = new u.EdgesGeometry(c),
      h = new u.LineBasicMaterial({
        color: 8266446,
        linewidth: 2,
        depthTest: !1,
      }),
      m = new u.LineSegments(d, h);
    if (
      (l.mesh.add(m), (l.diameter = r), (x = this.viewer) != null && x.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
    (this.config.onPlanningObjectsChange &&
      this.config.onPlanningObjectsChange(this.planningObjects),
      this.saveToLocalStorage());
  }
  updatePlanningObjectTransform(i, r) {
    if (!window.THREE) return;
    const l = window.THREE,
      u = this.planningObjects.find((s) => s.id === i);
    if (u) {
      if (
        (r.posX !== void 0 && (u.mesh.position.x = r.posX),
        r.posY !== void 0 && (u.mesh.position.y = r.posY),
        r.posZ !== void 0 && (u.mesh.position.z = r.posZ),
        r.rotX !== void 0 || r.rotY !== void 0 || r.rotZ !== void 0)
      ) {
        const s =
            r.rotX !== void 0
              ? l.MathUtils.degToRad(r.rotX)
              : u.mesh.rotation.x,
          c =
            r.rotY !== void 0
              ? l.MathUtils.degToRad(r.rotY)
              : u.mesh.rotation.y,
          f =
            r.rotZ !== void 0
              ? l.MathUtils.degToRad(r.rotZ)
              : u.mesh.rotation.z;
        u.mesh.rotation.set(s, c, f);
      }
      (this.viewer.viewer.Render(),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage());
    }
  }
  getCurves() {
    return (this.planningObjects || []).filter((i) => i.type === "curve");
  }
  startFlyThrough(i, r = !1) {
    var f, d, h, m, x, b, y, w, C, k, z, _, N;
    if (
      !window.THREE ||
      !(
        (d = (f = this.viewer) == null ? void 0 : f.viewer) != null &&
        d.navigation
      )
    )
      return !1;
    const l = this.getCurves();
    if (l.length === 0) return !1;
    const u = i ? l.find((O) => O.id === i) : l[0];
    if (!u) return !1;
    if (!u.curvePath && u.points && u.points.length >= 2) {
      const O = u.points.map((j) => new window.THREE.Vector3(j.x, j.y, j.z));
      u.curvePath = new window.THREE.CatmullRomCurve3(O);
    }
    if (!u.curvePath) return !1;
    const s = this.viewer.viewer.navigation;
    if (!this.flyThroughState.active) {
      if (typeof s.GetCamera == "function")
        this.preFlyThroughCamera = s.GetCamera();
      else if (s.camera) {
        const j = s.camera;
        this.preFlyThroughCamera = new window.OV.Camera(
          new window.OV.Coord3D(j.position.x, j.position.y, j.position.z),
          new window.OV.Coord3D(
            ((m = (h = s.controls) == null ? void 0 : h.target) == null
              ? void 0
              : m.x) || 0,
            ((b = (x = s.controls) == null ? void 0 : x.target) == null
              ? void 0
              : b.y) || 0,
            ((w = (y = s.controls) == null ? void 0 : y.target) == null
              ? void 0
              : w.z) || 0,
          ),
          new window.OV.Coord3D(j.up.x, j.up.y, j.up.z),
          j.fov || 45,
        );
      }
      const O =
        ((k = (C = this.viewer) == null ? void 0 : C.viewer) == null
          ? void 0
          : k.camera) ||
        ((N =
          (_ = (z = this.viewer) == null ? void 0 : z.viewer) == null
            ? void 0
            : _.navigation) == null
          ? void 0
          : N.camera);
      if (
        O &&
        (typeof O.fov == "number" && (this.preFlyThroughFov = O.fov),
        typeof O.near == "number" &&
          ((this.preFlyThroughNear = O.near), (O.near = 0.05)),
        typeof O.updateProjectionMatrix == "function")
      )
        try {
          O.updateProjectionMatrix();
        } catch {}
    }
    const c = u.curvePath.getLength() || u.baseDistance || 100;
    return (
      (this.flyThroughState = {
        ...this.flyThroughState,
        active: !0,
        isPlaying: r,
        curveId: u.id,
        curveName: u.name || u.id,
        totalDistance: c,
        currentDistance: this.flyThroughState.progress * c,
      }),
      (this.flyThroughUpVector = null),
      (this.lastFlyThroughTimestamp = performance.now()),
      this.updateFlyThroughCamera(),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }),
      !0
    );
  }
  pauseFlyThrough() {
    ((this.flyThroughState.isPlaying = !1),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  resumeFlyThrough() {
    if (!this.flyThroughState.active) {
      this.startFlyThrough(this.flyThroughState.curveId || void 0);
      return;
    }
    ((this.flyThroughState.isPlaying = !0),
      (this.lastFlyThroughTimestamp = performance.now()),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  stopFlyThrough() {
    var i, r, l, u, s, c, f, d;
    if (
      ((this.flyThroughState.active = !1),
      (this.flyThroughState.isPlaying = !1),
      this.preFlyThroughCamera &&
        (r = (i = this.viewer) == null ? void 0 : i.viewer) != null &&
        r.navigation)
    ) {
      this.viewer.viewer.navigation.SetCamera(this.preFlyThroughCamera);
      const h =
        ((u = (l = this.viewer) == null ? void 0 : l.viewer) == null
          ? void 0
          : u.camera) ||
        ((f =
          (c = (s = this.viewer) == null ? void 0 : s.viewer) == null
            ? void 0
            : c.navigation) == null
          ? void 0
          : f.camera);
      if (
        h &&
        (this.preFlyThroughFov !== null &&
          typeof h.fov == "number" &&
          (h.fov = this.preFlyThroughFov),
        this.preFlyThroughNear !== null &&
          typeof h.near == "number" &&
          (h.near = this.preFlyThroughNear),
        typeof h.updateProjectionMatrix == "function")
      )
        try {
          h.updateProjectionMatrix();
        } catch {}
      if ((d = this.viewer) != null && d.viewer)
        try {
          this.viewer.viewer.Render();
        } catch {}
    }
    ((this.preFlyThroughCamera = null),
      (this.preFlyThroughNear = null),
      (this.preFlyThroughFov = null),
      (this.flyThroughUpVector = null),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  setFlyThroughProgress(i) {
    ((this.flyThroughState.progress = Math.max(0, Math.min(1, i))),
      (this.flyThroughState.currentDistance =
        this.flyThroughState.progress *
        (this.flyThroughState.totalDistance || 100)),
      this.updateFlyThroughCamera(),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  stepFlyThroughDistance(i) {
    if (!this.flyThroughState.active) return;
    const r = Math.max(0.6, this.flyThroughState.totalDistance || 100),
      l = i / r,
      u = Math.max(0, Math.min(1, this.flyThroughState.progress + l));
    this.setFlyThroughProgress(u);
  }
  setFlyThroughSpeed(i) {
    ((this.flyThroughState.speed = i),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  setFlyThroughDirection(i) {
    ((this.flyThroughState.direction = i),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  setFlyThroughLoop(i) {
    ((this.flyThroughState.loop = i),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  setFlyThroughFov(i) {
    var r;
    if (
      ((this.flyThroughState.fov = i),
      this.updateFlyThroughCamera(),
      (r = this.viewer) != null && r.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
    this.config.onFlyThroughStateChange &&
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
  }
  setFlyThroughReticle(i) {
    ((this.flyThroughState.showReticle = i),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  setFlyThroughLookTrim(i, r) {
    ((this.flyThroughState.yawOffset = i),
      (this.flyThroughState.pitchOffset = r),
      this.updateFlyThroughCamera(),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  setFlyThroughPathOffset(i, r) {
    ((this.flyThroughState.pathOffsetX = i),
      (this.flyThroughState.pathOffsetY = r),
      this.updateFlyThroughCamera(),
      this.config.onFlyThroughStateChange &&
        this.config.onFlyThroughStateChange({ ...this.flyThroughState }));
  }
  updateFlyThroughCamera() {
    var V, U, $, q, G, X, R, Z;
    if (
      !this.flyThroughState.active ||
      !(
        (U = (V = this.viewer) == null ? void 0 : V.viewer) != null &&
        U.navigation
      ) ||
      !window.THREE ||
      !window.OV
    )
      return;
    const i = this.planningObjects.find(
      (S) => S.id === this.flyThroughState.curveId && S.type === "curve",
    );
    if (!i || !i.curvePath) return;
    const r = window.THREE,
      l = i.curvePath,
      u = Math.max(1e-4, Math.min(0.9999, this.flyThroughState.progress)),
      s = l.getPointAt(u),
      c = l.getTangentAt(u).normalize(),
      f = this.flyThroughState.direction;
    let d = c.clone().multiplyScalar(f);
    if (
      this.flyThroughState.yawOffset !== 0 ||
      this.flyThroughState.pitchOffset !== 0
    ) {
      const S = this.flyThroughUpVector || new r.Vector3(0, 1, 0),
        P = new r.Vector3().crossVectors(d, S).normalize();
      (this.flyThroughState.yawOffset !== 0 &&
        d.applyAxisAngle(S, this.flyThroughState.yawOffset),
        this.flyThroughState.pitchOffset !== 0 &&
          d.applyAxisAngle(P, this.flyThroughState.pitchOffset),
        d.normalize());
    }
    let h = this.flyThroughUpVector
        ? this.flyThroughUpVector.clone()
        : new r.Vector3(0, 1, 0),
      m = new r.Vector3().crossVectors(d, h);
    if (m.lengthSq() < 1e-4) {
      const S =
        Math.abs(d.y) > 0.9 ? new r.Vector3(1, 0, 0) : new r.Vector3(0, 1, 0);
      m = new r.Vector3().crossVectors(d, S);
    }
    m.normalize();
    const x = new r.Vector3().crossVectors(m, d).normalize();
    this.flyThroughUpVector = x;
    const b = this.flyThroughState.pathOffsetX || 0,
      y = this.flyThroughState.pathOffsetY || 0,
      w = s.clone();
    (b !== 0 && w.addScaledVector(m, b), y !== 0 && w.addScaledVector(x, y));
    const C = this.flyThroughState.totalDistance || 100,
      k = Math.max(1.5, Math.min(20, C * 0.04)),
      z = new r.Vector3().copy(w).addScaledVector(d, k),
      _ = this.viewer.viewer.navigation,
      N = this.flyThroughState.fov || 75,
      O = new window.OV.Camera(
        new window.OV.Coord3D(w.x, w.y, w.z),
        new window.OV.Coord3D(z.x, z.y, z.z),
        new window.OV.Coord3D(x.x, x.y, x.z),
        N,
      );
    _.SetCamera(O);
    const j =
      ((q = ($ = this.viewer) == null ? void 0 : $.viewer) == null
        ? void 0
        : q.camera) ||
      ((R =
        (X = (G = this.viewer) == null ? void 0 : G.viewer) == null
          ? void 0
          : X.navigation) == null
        ? void 0
        : R.camera);
    if (
      j &&
      (typeof j.fov == "number" && (j.fov = N),
      typeof j.near == "number" && (j.near = 0.05),
      typeof j.updateProjectionMatrix == "function")
    )
      try {
        j.updateProjectionMatrix();
      } catch {}
    if ((Z = this.viewer) != null && Z.viewer)
      try {
        this.viewer.viewer.Render();
      } catch {}
  }
  startSplineClipping(i) {
    var s, c, f, d, h, m, x;
    if (
      !window.THREE ||
      !(
        (c = (s = this.viewer) == null ? void 0 : s.viewer) != null &&
        c.navigation
      )
    )
      return !1;
    const r = this.getCurves();
    if (r.length === 0) return !1;
    const l = i ? r.find((b) => b.id === i) : r[0];
    if (!l || !l.curvePath) return !1;
    (this.flyThroughState.active && this.stopFlyThrough(),
      (h =
        (d = (f = this.viewer) == null ? void 0 : f.viewer) == null
          ? void 0
          : d.navigation) != null &&
        h.GetCamera &&
        (this.preSplineClipCamera = this.viewer.viewer.navigation.GetCamera()));
    const u = l.curvePath.getLength();
    return (
      (this.splineClippingState.active = !0),
      (this.splineClippingState.curveId = l.id),
      (this.splineClippingState.curveName = l.name || "Spline Path"),
      (this.splineClippingState.totalDistance = u),
      (this.splineClippingState.currentDistance =
        u * this.splineClippingState.progress),
      (x = (m = this.viewer) == null ? void 0 : m.viewer) != null &&
        x.renderer &&
        (this.viewer.viewer.renderer.localClippingEnabled = !0),
      this.updateSplineClipping(),
      this.focusOnSplineCrossSection(),
      this.config.onSplineClippingStateChange &&
        this.config.onSplineClippingStateChange({
          ...this.splineClippingState,
        }),
      !0
    );
  }
  stopSplineClipping() {
    var i, r, l;
    if (
      ((this.splineClippingState.active = !1),
      this.currentMeshes.forEach((u) => {
        u.material &&
          (Array.isArray(u.material) ? u.material : [u.material]).forEach(
            (c) => {
              ((c.clippingPlanes = null), (c.needsUpdate = !0));
            },
          );
      }),
      this.preSplineClipCamera &&
        (r = (i = this.viewer) == null ? void 0 : i.viewer) != null &&
        r.navigation)
    ) {
      try {
        this.viewer.viewer.navigation.SetCamera(this.preSplineClipCamera);
      } catch {}
      this.preSplineClipCamera = null;
    }
    if (
      (this.lastPlanesState && this.updateClippingPlanes(this.lastPlanesState),
      (l = this.viewer) != null && l.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
    this.config.onSplineClippingStateChange &&
      this.config.onSplineClippingStateChange({ ...this.splineClippingState });
  }
  setSplineClippingProgress(i, r = !0) {
    let l = Math.max(1e-4, Math.min(0.9999, i));
    const u = this.splineClippingState.totalDistance || 100;
    if (r && u > 0) {
      const c = l * u,
        f = Math.max(0, Math.min(u, Math.round(c / 0.6) * 0.6));
      ((l = Math.max(1e-4, Math.min(0.9999, f / u))),
        (this.splineClippingState.currentDistance = f));
    } else this.splineClippingState.currentDistance = l * u;
    ((this.splineClippingState.progress = l),
      this.updateSplineClipping(),
      this.splineClippingState.alignCamera
        ? this.alignCameraToSplineCrossSection()
        : this.focusOnSplineCrossSection(),
      this.config.onSplineClippingStateChange &&
        this.config.onSplineClippingStateChange({
          ...this.splineClippingState,
        }));
  }
  setSplineClippingDistance(i) {
    const r = this.splineClippingState.totalDistance || 100,
      l = 0.6,
      u = Math.max(0, Math.min(r, i)),
      s = Math.round(u / l) * l,
      c = r > 0 ? Math.max(1e-4, Math.min(0.9999, s / r)) : 0.5;
    ((this.splineClippingState.progress = c),
      (this.splineClippingState.currentDistance = s),
      this.updateSplineClipping(),
      this.splineClippingState.alignCamera
        ? this.alignCameraToSplineCrossSection()
        : this.focusOnSplineCrossSection(),
      this.config.onSplineClippingStateChange &&
        this.config.onSplineClippingStateChange({
          ...this.splineClippingState,
        }));
  }
  stepSplineClippingDistance(i = 0.6) {
    const r =
      this.splineClippingState.currentDistance !== void 0
        ? this.splineClippingState.currentDistance
        : this.splineClippingState.progress *
          (this.splineClippingState.totalDistance || 100);
    this.setSplineClippingDistance(r + i);
  }
  setSplineClippingInvert(i) {
    ((this.splineClippingState.invert = i),
      this.updateSplineClipping(),
      this.splineClippingState.alignCamera &&
        this.alignCameraToSplineCrossSection(),
      this.config.onSplineClippingStateChange &&
        this.config.onSplineClippingStateChange({
          ...this.splineClippingState,
        }));
  }
  setSplineClippingAlignCamera(i) {
    ((this.splineClippingState.alignCamera = i),
      i && this.alignCameraToSplineCrossSection(),
      this.config.onSplineClippingStateChange &&
        this.config.onSplineClippingStateChange({
          ...this.splineClippingState,
        }));
  }
  zoomSplineCrossSection(i) {
    var C, k, z;
    if (
      !(
        (k = (C = this.viewer) == null ? void 0 : C.viewer) != null &&
        k.navigation
      ) ||
      !window.OV ||
      !window.THREE
    )
      return;
    const r = this.viewer.viewer.navigation,
      l = window.THREE,
      u = typeof r.GetCamera == "function" ? r.GetCamera() : null;
    if (!u) return;
    const s = this.planningObjects.find(
      (_) => _.id === this.splineClippingState.curveId && _.type === "curve",
    );
    let c = null;
    s &&
      s.curvePath &&
      (c = s.curvePath.getPointAt(this.splineClippingState.progress));
    let f = 1;
    i === "in"
      ? (f = 0.8)
      : i === "out"
        ? (f = 1.25)
        : typeof i == "number" && (f = i);
    const d = new l.Vector3(u.eye.x, u.eye.y, u.eye.z),
      h = c
        ? new l.Vector3(c.x, c.y, c.z)
        : new l.Vector3(u.center.x, u.center.y, u.center.z),
      m = new l.Vector3().subVectors(d, h),
      x = m.length(),
      b = Math.max(6, Math.min(2500, x * f));
    m.normalize().multiplyScalar(b);
    const y = new l.Vector3().addVectors(h, m);
    r.SetCamera(
      new window.OV.Camera(
        new window.OV.Coord3D(y.x, y.y, y.z),
        new window.OV.Coord3D(h.x, h.y, h.z),
        u.up,
        u.fov,
      ),
    );
    let w = 150;
    if (this.modelBBox && !this.modelBBox.isEmpty()) {
      const _ = new l.Vector3();
      (this.modelBBox.getSize(_), (w = Math.max(_.x, _.y, _.z)));
    }
    if (
      ((this.splineClippingState.zoomLevel = Math.max(
        0.2,
        Math.min(5, w / Math.max(b, 1)),
      )),
      (z = this.viewer) != null && z.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
    this.config.onSplineClippingStateChange &&
      this.config.onSplineClippingStateChange({ ...this.splineClippingState });
  }
  setSplineClippingZoomLevel(i) {
    var y, w, C;
    if (
      !(
        (w = (y = this.viewer) == null ? void 0 : y.viewer) != null &&
        w.navigation
      ) ||
      !window.OV ||
      !window.THREE
    )
      return;
    const r = this.viewer.viewer.navigation,
      l = window.THREE,
      u = typeof r.GetCamera == "function" ? r.GetCamera() : null;
    if (!u) return;
    const s = this.planningObjects.find(
      (k) => k.id === this.splineClippingState.curveId && k.type === "curve",
    );
    let c = null;
    s &&
      s.curvePath &&
      (c = s.curvePath.getPointAt(this.splineClippingState.progress));
    const f = c
        ? new l.Vector3(c.x, c.y, c.z)
        : new l.Vector3(u.center.x, u.center.y, u.center.z),
      d = new l.Vector3(u.eye.x, u.eye.y, u.eye.z),
      h = new l.Vector3().subVectors(d, f).normalize();
    let m = 150;
    if (this.modelBBox && !this.modelBBox.isEmpty()) {
      const k = new l.Vector3();
      (this.modelBBox.getSize(k), (m = Math.max(k.x, k.y, k.z)));
    }
    const x = Math.max(6, Math.min(2500, m / Math.max(0.1, i))),
      b = new l.Vector3().addVectors(f, h.multiplyScalar(x));
    if (
      (r.SetCamera(
        new window.OV.Camera(
          new window.OV.Coord3D(b.x, b.y, b.z),
          new window.OV.Coord3D(f.x, f.y, f.z),
          u.up,
          u.fov,
        ),
      ),
      (this.splineClippingState.zoomLevel = i),
      this.config.onSplineClippingStateChange &&
        this.config.onSplineClippingStateChange({
          ...this.splineClippingState,
        }),
      (C = this.viewer) != null && C.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
  }
  focusOnSplineCrossSection() {
    var d, h, m;
    if (
      !(
        (h = (d = this.viewer) == null ? void 0 : d.viewer) != null &&
        h.navigation
      ) ||
      !window.OV ||
      !window.THREE
    )
      return;
    const i = this.viewer.viewer.navigation,
      r = window.THREE,
      l = this.planningObjects.find(
        (x) => x.id === this.splineClippingState.curveId && x.type === "curve",
      );
    if (!l || !l.curvePath) return;
    const u = Math.max(
        1e-4,
        Math.min(0.9999, this.splineClippingState.progress),
      ),
      s = l.curvePath.getPointAt(u),
      c = typeof i.GetCamera == "function" ? i.GetCamera() : null;
    if (!c) return;
    const f = new r.Vector3(
      s.x - c.center.x,
      s.y - c.center.y,
      s.z - c.center.z,
    );
    if (
      (i.SetCamera(
        new window.OV.Camera(
          new window.OV.Coord3D(c.eye.x + f.x, c.eye.y + f.y, c.eye.z + f.z),
          new window.OV.Coord3D(s.x, s.y, s.z),
          c.up,
          c.fov,
        ),
      ),
      (m = this.viewer) != null && m.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
  }
  alignCameraToSplineCrossSection() {
    var w, C, k;
    if (
      !(
        (C = (w = this.viewer) == null ? void 0 : w.viewer) != null &&
        C.navigation
      ) ||
      !window.OV ||
      !window.THREE
    )
      return;
    const i = this.viewer.viewer.navigation,
      r = window.THREE,
      l = this.planningObjects.find(
        (z) => z.id === this.splineClippingState.curveId && z.type === "curve",
      );
    if (!l || !l.curvePath) return;
    const u = Math.max(
        1e-4,
        Math.min(0.9999, this.splineClippingState.progress),
      ),
      s = l.curvePath.getPointAt(u),
      c = l.curvePath.getTangentAt(u).normalize(),
      f = this.splineClippingState.invert ? c.clone().negate() : c.clone();
    let d = 120;
    if (this.modelBBox && !this.modelBBox.isEmpty()) {
      const z = new r.Vector3();
      (this.modelBBox.getSize(z), (d = Math.max(z.x, z.y, z.z) * 0.8));
    }
    const h = typeof i.GetCamera == "function" ? i.GetCamera() : null;
    if (h) {
      const z = new r.Vector3(
        h.eye.x - h.center.x,
        h.eye.y - h.center.y,
        h.eye.z - h.center.z,
      ).length();
      z > 10 && (d = z);
    }
    const m = f.clone().negate(),
      x = s.clone().add(m.clone().multiplyScalar(d));
    let b = new r.Vector3(0, 1, 0);
    Math.abs(m.y) > 0.88 && (b = new r.Vector3(0, 0, 1));
    const y = new r.Vector3().crossVectors(m, b).normalize();
    if (
      (b.crossVectors(y, m).normalize(),
      i.SetCamera(
        new window.OV.Camera(
          new window.OV.Coord3D(x.x, x.y, x.z),
          new window.OV.Coord3D(s.x, s.y, s.z),
          new window.OV.Coord3D(b.x, b.y, b.z),
          (h == null ? void 0 : h.fov) || 45,
        ),
      ),
      (k = this.viewer) != null && k.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
  }
  updateSplineClipping() {
    var h;
    if (!this.splineClippingState.active || !window.THREE) return;
    const i = this.planningObjects.find(
      (m) => m.id === this.splineClippingState.curveId && m.type === "curve",
    );
    if (!i || !i.curvePath) return;
    const r = window.THREE,
      l = i.curvePath,
      u = Math.max(1e-4, Math.min(0.9999, this.splineClippingState.progress)),
      s = l.getPointAt(u),
      c = l.getTangentAt(u).normalize(),
      f = this.splineClippingState.invert ? c.clone().negate() : c.clone();
    (this.splineClipPlane || (this.splineClipPlane = new r.Plane()),
      this.splineClipPlane.setFromNormalAndCoplanarPoint(f, s));
    const d = [this.splineClipPlane];
    if (
      (this.currentMeshes.forEach((m) => {
        m.material &&
          (Array.isArray(m.material) ? m.material : [m.material]).forEach(
            (b) => {
              ((b.clippingPlanes = d),
                (b.clipShadows = !0),
                (b.side = r.DoubleSide),
                (b.needsUpdate = !0));
            },
          );
      }),
      (h = this.viewer) != null && h.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
  }
  generateSampleAnatomicalCurve(i) {
    var N, O, j, V;
    if (!window.THREE) return null;
    const r = window.THREE;
    let l = [],
      u = "Model";
    if (i != null && this.currentMeshes && this.currentMeshes[i]) {
      const U = this.currentMeshes[i];
      ((l = [U]), (u = U.name || `Mesh_${i + 1}`));
    } else
      ((l = (this.currentMeshes || []).filter((U) => U && U.visible !== !1)),
        l.length === 0 && (l = this.currentMeshes || []),
        (u = "Displayed_Model"));
    if (l.length === 0) {
      const U = (this.planningObjects || []).filter(
        ($) => $.type === "custom_model" && $.mesh && $.visible !== !1,
      );
      U.length > 0 && ((l = U.map(($) => $.mesh)), (u = "Custom_Model"));
    }
    const s = new r.Box3();
    if (
      (l.forEach((U) => {
        try {
          U.updateWorldMatrix(!0, !1);
          const $ = new r.Box3().setFromObject(U);
          $.isEmpty() || s.union($);
        } catch {}
      }),
      s.isEmpty())
    ) {
      const U =
        ((O = (N = this.viewer) == null ? void 0 : N.viewer) == null
          ? void 0
          : O.scene) ||
        ((V = (j = this.viewer) == null ? void 0 : j.viewer) == null
          ? void 0
          : V.mainScene);
      U &&
        U.traverse(($) => {
          if ($.isMesh && !this.isCustomOverlay($))
            try {
              const q = new r.Box3().setFromObject($);
              q.isEmpty() || s.union(q);
            } catch {}
        });
    }
    let c = new r.Vector3(0, 0, 0),
      f = new r.Vector3(80, 80, 80),
      d = new r.Vector3(-40, -40, -40);
    s.isEmpty() ||
      (s.getCenter(c),
      s.getSize(f),
      (d = s.min.clone()),
      f.x < 1 && (f.x = 20),
      f.y < 1 && (f.y = 20),
      f.z < 1 && (f.z = 20));
    let h = "y";
    f.z >= f.y && f.z >= f.x
      ? (h = "z")
      : f.x >= f.y && f.x >= f.z
        ? (h = "x")
        : (h = "y");
    const m = [];
    l.forEach((U) => {
      try {
        const $ = U.geometry;
        if (!$ || !$.attributes || !$.attributes.position) return;
        const q = $.attributes.position,
          G = q.count;
        if (G === 0) return;
        const X = Math.max(1, Math.floor(G / 15e3)),
          R = new r.Vector3();
        for (let Z = 0; Z < G; Z += X)
          (R.fromBufferAttribute(q, Z),
            R.applyMatrix4(U.matrixWorld),
            m.push(R.clone()));
      } catch {}
    });
    const x = [],
      b = 8,
      y = d[h],
      C = d[h] + f[h] - y,
      k = (C / (b - 1)) * 0.75;
    for (let U = 0; U < b; U++) {
      const $ = (U / (b - 1)) * 0.84 + 0.08,
        q = y + C * $;
      let G = null;
      if (m.length > 20) {
        let X = 0,
          R = 0,
          Z = 0,
          S = 0;
        for (let P = 0; P < m.length; P++) {
          const H = m[P];
          Math.abs(H[h] - q) <= k && ((X += H.x), (R += H.y), (Z += H.z), S++);
        }
        S >= 3 && ((G = new r.Vector3(X / S, R / S, Z / S)), (G[h] = q));
      }
      (G || ((G = c.clone()), (G[h] = q)), x.push(G));
    }
    const z = [];
    for (let U = 0; U < x.length; U++)
      if (U === 0 || U === x.length - 1) z.push(x[U].clone());
      else {
        const $ = x[U - 1],
          q = x[U],
          G = x[U + 1],
          X = new r.Vector3(
            $.x * 0.25 + q.x * 0.5 + G.x * 0.25,
            $.y * 0.25 + q.y * 0.5 + G.y * 0.25,
            $.z * 0.25 + q.z * 0.5 + G.z * 0.25,
          );
        ((X[h] = q[h]), z.push(X));
      }
    this.createPlanningCurve(z, 0.4);
    const _ = this.planningObjects[this.planningObjects.length - 1];
    if (_) {
      const U = u.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 18);
      return (
        (_.name = `Spline_${U}_${this.nextPlanningObjectId - 1}`),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage(),
        _.id
      );
    }
    return null;
  }
  async importCustomPlanningModel(i) {
    if (!window.THREE || !window.THREE.STLLoader) {
      console.error("THREE.STLLoader not found");
      return;
    }
    const r = await new Promise((y) => {
        const w = new FileReader();
        ((w.onload = (C) => {
          var k;
          return y((k = C.target) == null ? void 0 : k.result);
        }),
          w.readAsDataURL(i));
      }),
      l = await i.arrayBuffer(),
      s = new window.THREE.STLLoader().parse(l);
    if (!this.viewer || !this.viewer.viewer) return;
    const c = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
    if (!c) return;
    const f = window.THREE,
      d = this.getModelRoot();
    (d && f && s.applyMatrix4(d.matrixWorld),
      s.computeBoundingBox(),
      s.computeBoundingSphere());
    const h = new window.THREE.Vector3();
    (s.boundingBox.getCenter(h),
      s.translate(-h.x, -h.y, -h.z),
      s.computeBoundingBox(),
      s.computeBoundingSphere(),
      s.attributes && s.attributes.color && s.deleteAttribute("color"));
    const m = new window.THREE.MeshStandardMaterial({
        color: 9133302,
        transparent: !0,
        opacity: 0.7,
        depthTest: !0,
        depthWrite: !0,
        side: window.THREE.DoubleSide,
        roughness: 0.35,
        metalness: 0.1,
      }),
      x = new f.Mesh(s, m);
    ((x.renderOrder = 999),
      x.position.copy(h),
      (x.userData = { isCustomOverlay: !0 }),
      c.add(x),
      this.viewer.viewer.Render());
    const b = i.name.replace(/\.[^/.]+$/, "");
    (this.planningObjects.push({
      id: `CustomModel_${this.nextPlanningObjectId++}`,
      name: b,
      type: "custom_model",
      mesh: x,
      color: "#8b5cf6",
      opacity: 0.7,
      fileName: i.name,
      fileDataURL: r,
    }),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
      this.saveToLocalStorage());
  }
  async duplicateSubmeshToPlanningObjects(i) {
    if (i < 0 || i >= this.currentMeshes.length) return null;
    this.clearHighlight();
    const r = this.currentMeshes[i];
    if (!r || !window.THREE) return null;
    const l = window.THREE;
    if (!this.viewer || !this.viewer.viewer) return null;
    const u = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
    if (!u || !r.geometry) return null;
    r.updateWorldMatrix(!0, !1);
    const s = r.geometry.clone();
    s.computeBoundingBox();
    const c = new l.Vector3();
    (s.boundingBox.getCenter(c),
      s.translate(-c.x, -c.y, -c.z),
      s.attributes && s.attributes.color && s.deleteAttribute("color"));
    const f = new l.MeshStandardMaterial({
        color: 9133302,
        transparent: !0,
        opacity: 0.7,
        depthTest: !0,
        depthWrite: !0,
        side: l.DoubleSide,
        roughness: 0.35,
        metalness: 0.1,
      }),
      d = new l.Mesh(s, f);
    (r.matrixWorld.decompose(d.position, d.quaternion, d.scale),
      d.position.copy(c.clone().applyMatrix4(r.matrixWorld)),
      d.updateMatrixWorld(!0),
      (d.renderOrder = 999),
      (d.userData = { isCustomOverlay: !0 }),
      u.add(d));
    let m = (
      r.name || (r.parent && r.parent.name ? r.parent.name : `Submesh ${i + 1}`)
    )
      .replace(/\.\.\.$/, "")
      .trim();
    m.toLowerCase().includes("copy") || (m = `${m} (Copy)`);
    const x = {
      id: `CustomModel_${this.nextPlanningObjectId++}`,
      name: m,
      type: "custom_model",
      mesh: d,
      color: "#8b5cf6",
      opacity: 0.7,
      fileName: `${m}.stl`,
      fileDataURL: "",
    };
    this.updateMeshColorAndVisibility(x);
    const b = this.generateSTLString(x, !0);
    if (b) {
      const y = new Blob([b], { type: "text/plain" }),
        w = await new Promise((C) => {
          const k = new FileReader();
          ((k.onload = (z) => C(z.target.result)), k.readAsDataURL(y));
        });
      x.fileDataURL = w as string;
    }
    return (
      this.planningObjects.push(x),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
      this.saveToLocalStorage(),
      this.viewer &&
        this.viewer.viewer &&
        typeof this.viewer.viewer.Render == "function" &&
        this.viewer.viewer.Render(),
      x
    );
  }
  removePlanningObject(i) {
    var l;
    ((l = this.hoveredPlanningObject) == null ? void 0 : l.id) === i &&
      this.hideCardTooltip();
    const r = this.planningObjects.findIndex((u) => u.id === i);
    if (r > -1) {
      const u = this.planningObjects[r];
      if (
        u &&
        u.fileDataURL &&
        typeof u.fileDataURL == "string" &&
        u.fileDataURL.startsWith("blob:")
      )
        try {
          URL.revokeObjectURL(u.fileDataURL);
        } catch {}
      if (
        (this.transformControl &&
          this.transformControl.object === u.mesh &&
          (this.transformControl.detach(),
          this.highlightPlanningMesh(null),
          this.config.onTransformActiveChange &&
            this.config.onTransformActiveChange(!1)),
        this.viewer && this.viewer.viewer)
      ) {
        const s = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
        s &&
          (s.remove(u.mesh),
          u.mesh && disposeHierarchy(u.mesh),
          u.labelSprite &&
            (s.remove(u.labelSprite),
            u.labelSprite.material &&
              (u.labelSprite.material.map &&
                u.labelSprite.material.map.dispose(),
              u.labelSprite.material.dispose())),
          u.labelDiv &&
            u.labelDiv.parentElement &&
            u.labelDiv.parentElement.removeChild(u.labelDiv),
          u.leaderLine &&
            u.leaderLine.parentElement &&
            u.leaderLine.parentElement.removeChild(u.leaderLine),
          this.viewer.viewer.Render());
      }
      (this.planningObjects.splice(r, 1),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage());
    }
  }
  addPlanningGroup(i) {
    const r = `group_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    return (
      this.planningGroups.push({
        id: r,
        name: i,
        visible: !0,
        isCollapsed: !1,
      }),
      this.notifyGroupsChanged(),
      this.saveToLocalStorage(),
      r
    );
  }
  renamePlanningGroup(i, r) {
    const l = this.planningGroups.find((u) => u.id === i);
    l && ((l.name = r), this.notifyGroupsChanged(), this.saveToLocalStorage());
  }
  setPlanningGroupCollapsed(i, r) {
    const l = this.planningGroups.find((u) => u.id === i);
    l &&
      ((l.isCollapsed = r),
      this.notifyGroupsChanged(),
      this.saveToLocalStorage());
  }
  duplicatePlanningGroup(i) {
    const r = this.planningGroups.find((h) => h.id === i);
    if (!r) return;
    let l = r.name;
    const u = l.match(/^(.*)_(\d+)$/);
    let s = 1;
    u && ((l = u[1]), (s = parseInt(u[2]) + 1));
    let c = `${l}_${s}`;
    for (; this.planningGroups.some((h) => h.name === c);)
      (s++, (c = `${l}_${s}`));
    const f = this.addPlanningGroup(c),
      d = this.planningObjects.filter((h) => h.groupId === i);
    for (const h of d) {
      const m = this.duplicatePlanningObject(h.id, !0);
      m && (m.groupId = f);
    }
    (this.notifyGroupsChanged(),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange([...this.planningObjects]),
      this.saveToLocalStorage());
  }
  removePlanningGroup(i, r = !1) {
    const l = this.planningGroups.findIndex((u) => u.id === i);
    if (l > -1) {
      this.planningGroups.splice(l, 1);
      const u = this.planningObjects.filter((s) => s.groupId === i);
      (r
        ? u.forEach((s) => this.removePlanningObject(s.id))
        : u.forEach((s) => {
            s.groupId = void 0;
          }),
        this.notifyGroupsChanged(),
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage());
    }
  }
  setPlanningGroupVisibility(i, r) {
    var u, s;
    const l = this.planningGroups.find((c) => c.id === i);
    if (l) {
      if (
        ((l.visible = r),
        !r &&
          ((u = this.hoveredPlanningObject) == null ? void 0 : u.groupId) ===
            i &&
          this.hideCardTooltip(),
        this.planningObjects.forEach((c) => {
          c.groupId === i &&
            ((c.visible = r),
            c.mesh && (c.mesh.visible = r),
            c.labelDiv &&
              ((c.labelDiv.style.display = r ? "flex" : "none"),
              r || (c.labelDiv.style.opacity = "0")),
            c.leaderLine && (r || (c.leaderLine.style.display = "none")),
            r &&
              (c.type === "annotation" ||
                c.type === "measurement" ||
                c.type === "angle") &&
              this.updatePlanningCardLabel(c));
        }),
        (this.forceNextOverlayUpdate = !0),
        this.notifyGroupsChanged(),
        (s = this.viewer) != null && s.viewer)
      )
        try {
          this.viewer.viewer.Render();
        } catch {}
      (this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
        this.saveToLocalStorage());
    }
  }
  setPlanningObjectGroupId(i, r) {
    const l = this.planningObjects.find((u) => u.id === i);
    l &&
      ((l.groupId = r),
      this.saveToLocalStorage(),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects));
  }
  togglePlanningObjectVisibility(i) {
    var l, u;
    const r = this.planningObjects.find((s) => s.id === i);
    if (r) {
      if (
        ((r.visible = r.visible !== void 0 ? !r.visible : !1),
        !r.visible &&
          ((l = this.hoveredPlanningObject) == null ? void 0 : l.id) === r.id &&
          this.hideCardTooltip(),
        r.mesh && (r.mesh.visible = r.visible),
        r.labelDiv &&
          ((r.labelDiv.style.display = r.visible ? "flex" : "none"),
          r.visible || (r.labelDiv.style.opacity = "0")),
        r.leaderLine && (r.visible || (r.leaderLine.style.display = "none")),
        r.visible &&
          (r.type === "annotation" ||
            r.type === "measurement" ||
            r.type === "angle") &&
          this.updatePlanningCardLabel(r),
        (this.forceNextOverlayUpdate = !0),
        this.saveToLocalStorage(),
        (u = this.viewer) != null && u.viewer)
      )
        try {
          this.viewer.viewer.Render();
        } catch {}
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects);
    }
  }
  notifyGroupsChanged() {
    this.config.onPlanningGroupsChange &&
      this.config.onPlanningGroupsChange([...this.planningGroups]);
  }
  clearAllPlanningObjects(i = !0) {
    if (
      (this.hideCardTooltip(),
      this.transformControl &&
        (this.transformControl.detach(),
        this.highlightPlanningMesh(null),
        this.config.onTransformActiveChange &&
          this.config.onTransformActiveChange(!1)),
      this.viewer && this.viewer.viewer)
    ) {
      const r = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (r) {
        this.planningObjects.forEach((l) => {
          if (
            l &&
            l.fileDataURL &&
            typeof l.fileDataURL == "string" &&
            l.fileDataURL.startsWith("blob:")
          )
            try {
              URL.revokeObjectURL(l.fileDataURL);
            } catch {}
          if (
            (r.remove(l.mesh),
            l.mesh && disposeHierarchy(l.mesh),
            l.labelSprite && (r.remove(l.labelSprite), l.labelSprite.material))
          ) {
            if (
              l.labelSprite.material.map &&
              typeof l.labelSprite.material.map.dispose == "function"
            )
              try {
                l.labelSprite.material.map.dispose();
              } catch {}
            if (typeof l.labelSprite.material.dispose == "function")
              try {
                l.labelSprite.material.dispose();
              } catch {}
          }
          (l.labelDiv &&
            l.labelDiv.parentElement &&
            l.labelDiv.parentElement.removeChild(l.labelDiv),
            l.leaderLine &&
              l.leaderLine.parentElement &&
              l.leaderLine.parentElement.removeChild(l.leaderLine));
        });
        try {
          this.viewer.viewer.Render();
        } catch {}
      }
    }
    ((this.planningObjects = []),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
      i && this.saveToLocalStorage());
  }
  getModelRoot() {
    var s, c, f, d;
    if (!window.THREE || !this.currentMeshes || this.currentMeshes.length === 0)
      return null;
    const i = this.currentMeshes[0],
      r =
        ((c = (s = this.viewer) == null ? void 0 : s.viewer) == null
          ? void 0
          : c.scene) ||
        ((d = (f = this.viewer) == null ? void 0 : f.viewer) == null
          ? void 0
          : d.mainScene);
    if (!r) return null;
    let l = i,
      u = i;
    for (; l.parent && l.parent !== r;) ((u = l.parent), (l = l.parent));
    return u;
  }
  generateSTLString(i, r = !0) {
    var O, j;
    if (i.type === "measurement" || i.type === "angle" || !window.THREE)
      return null;
    const l = window.THREE,
      u = i.mesh,
      s = u == null ? void 0 : u.geometry;
    if (!s || !s.isBufferGeometry) return null;
    const c = s.clone();
    u && ((O = u.updateMatrixWorld) == null || O.call(u, !0));
    let f = u.matrixWorld.clone(),
      d = !1;
    if (r) {
      const V = this.getModelRoot();
      if (V) {
        (j = V.updateMatrixWorld) == null || j.call(V, !0);
        const U = new l.Matrix4().copy(V.matrixWorld).invert();
        (f.premultiply(U), (d = !0));
      }
    }
    c.applyMatrix4(f);
    const h = (i.name || i.id).replace(/\s+/g, "_");
    let x = `solid ${h} ${d ? "coordinate_system=Loaded_Model_Space_LPS" : "coordinate_system=Right-Handed_Cartesian"} units=millimeter origin=0,0,0
`;
    const b = c.getAttribute("position"),
      y = c.getIndex(),
      w = new l.Vector3(),
      C = new l.Vector3(),
      k = new l.Vector3(),
      z = new l.Vector3(),
      _ = new l.Vector3(),
      N = (V, U, $) => {
        (w.fromBufferAttribute(b, V),
          C.fromBufferAttribute(b, U),
          k.fromBufferAttribute(b, $),
          z.subVectors(k, C),
          _.subVectors(w, C),
          z.cross(_).normalize(),
          (x += `  facet normal ${z.x} ${z.y} ${z.z}
`),
          (x += `    outer loop
`),
          (x += `      vertex ${w.x} ${w.y} ${w.z}
`),
          (x += `      vertex ${C.x} ${C.y} ${C.z}
`),
          (x += `      vertex ${k.x} ${k.y} ${k.z}
`),
          (x += `    endloop
`),
          (x += `  endfacet
`));
      };
    if (y)
      for (let V = 0; V < y.count; V += 3)
        N(y.getX(V), y.getX(V + 1), y.getX(V + 2));
    else for (let V = 0; V < b.count; V += 3) N(V, V + 1, V + 2);
    return (
      (x += `endsolid ${h}
`),
      x
    );
  }
  duplicatePlanningObject(i, r = !1) {
    var s;
    const l = this.planningObjects.find((c) => c.id === i);
    if (!l || !window.THREE) return null;
    const u = this.planningObjects.length;
    if (l.type === "plane") {
      if (
        (this.createPlanningPlane(
          new window.THREE.Vector3(l.p1.x, l.p1.y, l.p1.z),
          new window.THREE.Vector3(l.p2.x, l.p2.y, l.p2.z),
          new window.THREE.Vector3(l.p3.x, l.p3.y, l.p3.z),
          l.extWidth,
          l.extLength,
        ),
        this.planningObjects.length > u)
      ) {
        const c = this.planningObjects[this.planningObjects.length - 1];
        this.updatePlaneGeometry(c.id, l.extWidth || 0, l.thickness || 0);
      }
    } else if (l.type === "cylinder")
      this.createPlanningCylinder(
        new window.THREE.Vector3(l.p1.x, l.p1.y, l.p1.z),
        new window.THREE.Vector3(l.p2.x, l.p2.y, l.p2.z),
        l.diameter / 2,
        l.extension,
      );
    else if (l.type === "curve")
      this.createPlanningCurve(
        l.points.map((c) => new window.THREE.Vector3(c.x, c.y, c.z)),
        l.thickness,
      );
    else if (l.type === "point" && l.points && l.points.length > 0)
      this.createPlanningPoint(
        new window.THREE.Vector3(l.points[0].x, l.points[0].y, l.points[0].z),
        l.diameter || 0.2,
      );
    else if (l.type === "annotation")
      this.createPlanningAnnotation(
        new window.THREE.Vector3(l.position.x, l.position.y, l.position.z),
        l.normal
          ? new window.THREE.Vector3(l.normal.x, l.normal.y, l.normal.z)
          : null,
        r ? l.text || l.name : `${l.text || l.name} (Copy)`,
        l.description,
        l.color,
        l.pinSize,
      );
    else if (l.type === "custom_model") {
      const c = l.mesh.clone();
      if (
        (c.children &&
          c.children
            .filter((d) => {
              var h;
              return (
                d.isLineSegments ||
                d.type === "LineSegments" ||
                ((h = d.userData) == null ? void 0 : h.isEdge)
              );
            })
            .forEach((d) => c.remove(d)),
        c.material &&
          (Array.isArray(c.material)
            ? (c.material = c.material.map((f) => f.clone()))
            : (c.material = c.material.clone())),
        this.viewer && this.viewer.viewer)
      ) {
        const f = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
        f && f.add(c);
      }
      this.planningObjects.push({
        id: `CustomModel_${this.nextPlanningObjectId++}`,
        name: r ? l.name : `${l.name} (Copy)`,
        type: "custom_model",
        mesh: c,
        color: l.color,
        opacity: l.opacity,
        fileName: l.fileName,
        fileDataURL: l.fileDataURL,
      });
    }
    if (this.planningObjects.length > u) {
      const c = this.planningObjects[this.planningObjects.length - 1];
      if (
        ((c.name = r ? l.name : `${l.name} (Copy)`),
        (c.groupId = l.groupId),
        (c.color = l.color),
        (c.opacity = l.opacity),
        c.mesh &&
          c.mesh.material &&
          window.THREE &&
          this.updateMeshColorAndVisibility(c),
        c.mesh &&
          l.mesh &&
          (c.mesh.position.copy(l.mesh.position),
          c.mesh.quaternion.copy(l.mesh.quaternion),
          c.mesh.scale.copy(l.mesh.scale),
          (c.posX = l.mesh.position.x),
          (c.posY = l.mesh.position.y),
          (c.posZ = l.mesh.position.z),
          (c.rotQx = l.mesh.quaternion.x),
          (c.rotQy = l.mesh.quaternion.y),
          (c.rotQz = l.mesh.quaternion.z),
          (c.rotQw = l.mesh.quaternion.w),
          (c.scaleX = l.mesh.scale.x),
          (c.scaleY = l.mesh.scale.y),
          (c.scaleZ = l.mesh.scale.z),
          c.mesh.updateMatrixWorld(!0)),
        l.visible === !1 && ((c.visible = !1), c.mesh && (c.mesh.visible = !1)),
        c.labelDiv)
      ) {
        if (c.type === "measurement" && c.baseDistance !== void 0) {
          const f = c.name
            ? `${c.name} (${c.baseDistance.toFixed(2)} mm)`
            : `${c.baseDistance.toFixed(2)} mm`;
          c.labelDiv.innerText = f;
        } else if (c.type === "angle" && c.angle !== void 0) {
          const f = c.name
            ? `${c.name} (${c.angle.toFixed(1)}°)`
            : `${c.angle.toFixed(1)}°`;
          c.labelDiv.innerText = f;
        }
        ((c.labelDiv.style.display = c.visible ? "flex" : "none"),
          c.visible
            ? this.updatePlanningCardLabel(c)
            : ((c.labelDiv.style.opacity = "0"),
              c.leaderLine && (c.leaderLine.style.display = "none")));
      }
      if ((s = this.viewer) != null && s.viewer)
        try {
          this.viewer.viewer.Render();
        } catch {}
      return (
        this.config.onPlanningObjectsChange &&
          this.config.onPlanningObjectsChange([...this.planningObjects]),
        this.saveToLocalStorage(),
        c
      );
    }
    return null;
  }
  exportPlanningObjectSTL(i) {
    const r = this.planningObjects.find((d) => d.id === i);
    if (!r) return;
    const l = this.generateSTLString(r, !0);
    if (!l) return;
    const u = new Blob([l], { type: "application/octet-stream" }),
      s = URL.createObjectURL(u),
      c = document.createElement("a");
    c.href = s;
    const f = (r.name || r.id).replace(/\.stl$/i, "");
    ((c.download = `${f}.stl`),
      c.click(),
      setTimeout(() => URL.revokeObjectURL(s), 1e3));
  }
  async exportPlanningGroupZip(i) {
    const r = this.planningGroups.find((w) => w.id === i);
    if (!r) return;
    const l = this.planningObjects.filter((w) => w.groupId === i);
    if (l.length === 0) return;
    const u = JSZip,
      s = new u(),
      c = [];
    l.forEach((w) => {
      var V, U, $, q, G, X, R, Z, S, P, H, I, de, te, D, M, B, A, Q, W, oe, ze;
      const C = this.generateSTLString(w, !0);
      C && s.file(`${w.name || w.id}.stl`, C);
      const k = { ...w };
      (delete k.mesh,
        delete k.labelSprite,
        delete k.labelDiv,
        delete k.curvePath);
      const z = window.THREE;
      let _ = {
          x:
            (U = (V = w.mesh) == null ? void 0 : V.position) == null
              ? void 0
              : U.x,
          y:
            (q = ($ = w.mesh) == null ? void 0 : $.position) == null
              ? void 0
              : q.y,
          z:
            (X = (G = w.mesh) == null ? void 0 : G.position) == null
              ? void 0
              : X.z,
        },
        N = {
          x:
            (Z = (R = w.mesh) == null ? void 0 : R.quaternion) == null
              ? void 0
              : Z.x,
          y:
            (P = (S = w.mesh) == null ? void 0 : S.quaternion) == null
              ? void 0
              : P.y,
          z:
            (I = (H = w.mesh) == null ? void 0 : H.quaternion) == null
              ? void 0
              : I.z,
          w:
            (te = (de = w.mesh) == null ? void 0 : de.quaternion) == null
              ? void 0
              : te.w,
        },
        O = {
          x:
            ((M = (D = w.mesh) == null ? void 0 : D.scale) == null
              ? void 0
              : M.x) || 1,
          y:
            ((A = (B = w.mesh) == null ? void 0 : B.scale) == null
              ? void 0
              : A.y) || 1,
          z:
            ((W = (Q = w.mesh) == null ? void 0 : Q.scale) == null
              ? void 0
              : W.z) || 1,
        },
        j = {
          ...k,
          posX: _.x,
          posY: _.y,
          posZ: _.z,
          rotQx: N.x,
          rotQy: N.y,
          rotQz: N.z,
          rotQw: N.w,
          scaleX: O.x,
          scaleY: O.y,
          scaleZ: O.z,
        };
      if (w.mesh && z) {
        (ze = (oe = w.mesh).updateMatrixWorld) == null || ze.call(oe, !0);
        const ye = this.getModelRoot();
        let me = w.mesh.matrixWorld.clone();
        if (w.type === "cylinder") {
          const Oe = w.baseDistance || 0,
            T = new z.Vector3(0, -Oe / 2, 0),
            ae = new z.Vector3(0, Oe / 2, 0);
          if ((T.applyMatrix4(me), ae.applyMatrix4(me), ye)) {
            const se = ye.matrixWorld.clone().invert();
            (T.applyMatrix4(se), ae.applyMatrix4(se));
          }
          ((j.p1 = { x: T.x, y: T.y, z: T.z }),
            (j.p2 = { x: ae.x, y: ae.y, z: ae.z }));
        } else if (w.type === "plane" && w.p1 && w.p2 && w.p3) {
          const Oe = new z.Vector3()
              .addVectors(
                new z.Vector3(w.p1.x, w.p1.y, w.p1.z),
                new z.Vector3(w.p2.x, w.p2.y, w.p2.z),
              )
              .add(new z.Vector3(w.p3.x, w.p3.y, w.p3.z))
              .divideScalar(3),
            T = new z.Vector3().subVectors(
              new z.Vector3(w.p2.x, w.p2.y, w.p2.z),
              new z.Vector3(w.p1.x, w.p1.y, w.p1.z),
            ),
            ae = new z.Vector3().subVectors(
              new z.Vector3(w.p3.x, w.p3.y, w.p3.z),
              new z.Vector3(w.p1.x, w.p1.y, w.p1.z),
            ),
            se = new z.Vector3().crossVectors(T, ae).normalize(),
            Y = new z.Vector3().copy(T).normalize(),
            F = new z.Vector3().crossVectors(se, Y).normalize(),
            ee = new z.Matrix4().makeBasis(Y, F, se),
            xe = new z.Quaternion().setFromRotationMatrix(ee),
            le = new z.Matrix4()
              .compose(Oe, xe, new z.Vector3(1, 1, 1))
              .invert(),
            ke = (Te) => {
              const Ee = new z.Vector3(Te.x, Te.y, Te.z);
              if ((Ee.applyMatrix4(le), Ee.applyMatrix4(me), ye)) {
                const ie = ye.matrixWorld.clone().invert();
                Ee.applyMatrix4(ie);
              }
              return { x: Ee.x, y: Ee.y, z: Ee.z };
            };
          ((j.p1 = ke(w.p1)), (j.p2 = ke(w.p2)), (j.p3 = ke(w.p3)));
        } else if (w.type === "measurement" && w.p1 && w.p2Coord) {
          const Oe = new z.Vector3()
              .addVectors(
                new z.Vector3(w.p1.x, w.p1.y, w.p1.z),
                new z.Vector3(w.p2Coord.x, w.p2Coord.y, w.p2Coord.z),
              )
              .multiplyScalar(0.5),
            T = new z.Vector3()
              .subVectors(
                new z.Vector3(w.p2Coord.x, w.p2Coord.y, w.p2Coord.z),
                new z.Vector3(w.p1.x, w.p1.y, w.p1.z),
              )
              .normalize(),
            ae = new z.Vector3(0, 1, 0),
            se = new z.Quaternion().setFromUnitVectors(ae, T),
            Y = new z.Matrix4()
              .compose(Oe, se, new z.Vector3(1, 1, 1))
              .invert(),
            F = (ee) => {
              const xe = new z.Vector3(ee.x, ee.y, ee.z);
              return (
                xe.applyMatrix4(Y).applyMatrix4(me),
                ye && xe.applyMatrix4(ye.matrixWorld.clone().invert()),
                { x: xe.x, y: xe.y, z: xe.z }
              );
            };
          ((j.p1 = F(w.p1)), (j.p2Coord = F(w.p2Coord)));
        } else if (w.type === "point" && w.points && w.points.length > 0) {
          const Oe = new z.Matrix4().makeTranslation(
              -w.points[0].x,
              -w.points[0].y,
              -w.points[0].z,
            ),
            T = (ae) => {
              const se = new z.Vector3(ae.x, ae.y, ae.z);
              return (
                se.applyMatrix4(Oe).applyMatrix4(me),
                ye && se.applyMatrix4(ye.matrixWorld.clone().invert()),
                { x: se.x, y: se.y, z: se.z }
              );
            };
          j.points = [T(w.points[0])];
        } else if (w.type === "curve" && w.points) {
          const Oe = (T) => {
            const ae = new z.Vector3(T.x, T.y, T.z);
            return (
              ae.applyMatrix4(me),
              ye && ae.applyMatrix4(ye.matrixWorld.clone().invert()),
              { x: ae.x, y: ae.y, z: ae.z }
            );
          };
          j.points = w.points.map(Oe);
        } else if (w.type === "angle" && w.p1 && w.p2Coord && w.p3) {
          const Oe = (T) => {
            const ae = new z.Vector3(T.x, T.y, T.z);
            return (
              ae.applyMatrix4(me),
              ye && ae.applyMatrix4(ye.matrixWorld.clone().invert()),
              { x: ae.x, y: ae.y, z: ae.z }
            );
          };
          ((j.p1 = Oe(w.p1)), (j.p2Coord = Oe(w.p2Coord)), (j.p3 = Oe(w.p3)));
        } else if (w.type === "annotation" && w.position) {
          const Oe = new z.Vector3(w.position.x, w.position.y, w.position.z);
          (ye && Oe.applyMatrix4(ye.matrixWorld.clone().invert()),
            (j.position = { x: Oe.x, y: Oe.y, z: Oe.z }));
        }
        if (ye) {
          ye.updateMatrixWorld(!0);
          const Oe = ye.matrixWorld.clone().invert();
          me.premultiply(Oe);
        }
        const Ae = new z.Vector3(),
          Ne = new z.Quaternion(),
          De = new z.Vector3();
        (me.decompose(Ae, Ne, De),
          (_ = { x: Ae.x, y: Ae.y, z: Ae.z }),
          (N = { x: Ne.x, y: Ne.y, z: Ne.z, w: Ne.w }),
          (O = { x: De.x, y: De.y, z: De.z }));
      }
      c.push({
        id: w.id,
        name: w.name || w.id,
        type: w.type,
        color: w.color,
        groupId: w.groupId || null,
        groupName: r.name,
        ...j,
        posX: _.x,
        posY: _.y,
        posZ: _.z,
        rotQx: N.x,
        rotQy: N.y,
        rotQz: N.z,
        rotQw: N.w,
        scaleX: O.x,
        scaleY: O.y,
        scaleZ: O.z,
        coordinateSystem: {
          systemType: "Loaded Model Local Coordinate Space",
          units: "millimeters (mm)",
          origin: "Aligned with loaded model origin (local space)",
        },
      });
    });
    const f = {
        coordinateSystem: {
          systemType: "Loaded Model Local Coordinate Space",
          units: "millimeters (mm)",
          origin: "Aligned with loaded model origin (local space)",
          note: "Planning objects coordinates have been exported relative to the same coordinate system as the loaded 3D model.",
        },
        group: r.name,
        objects: c,
      },
      d = this.generateSlicerMarkupsJson(l, r.name, f);
    (d &&
      s.file(`${r.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_Slicer.mrk.json`, d),
      s.file("metadata.json", JSON.stringify(f, null, 2)),
      s.file(
        "coordinate_system_info.txt",
        `COORDINATE SYSTEM DEFINITION & SPECIFICATION
---------------------------------------------
System Type: Loaded Model Local Coordinate Space
Units of Measurement: Millimeters (mm)

Geometry Details:
All exported 3D STL files are saved relative to the loaded model's own local coordinate system.
This ensures precise clinical registration independent of screen view orientation.

Slicer Markup Compatibility:
A companion 3D Slicer markup JSON file (.mrk.json) has been exported ensuring pristine alignment in Slicer.
It contains both Slicer markup properties and the application's internal grouping and metadata.
`,
      ));
    const m = await s.generateAsync({ type: "blob" }),
      x = URL.createObjectURL(m),
      b = document.createElement("a");
    b.href = x;
    const y = this.loadedFilename
      ? this.loadedFilename.split(".").slice(0, -1).join(".")
      : "Model";
    ((b.download = `${y}_${r.name}_Planning.zip`),
      b.click(),
      setTimeout(() => URL.revokeObjectURL(x), 1e3));
  }
  async exportAllPlanningObjectsZip() {
    if (this.planningObjects.length === 0) return;
    const i = JSZip,
      r = new i(),
      l = [];
    this.planningObjects.forEach((x) => {
      var N, O, j, V, U, $, q, G, X, R, Z, S, P, H, I, de, te, D, M, B, A, Q, W;
      const b = this.generateSTLString(x, !0);
      b && r.file(`${x.name || x.id}.stl`, b);
      const y = { ...x };
      (delete y.mesh,
        delete y.labelSprite,
        delete y.labelDiv,
        delete y.curvePath);
      const w = window.THREE;
      let C = {
          x:
            (O = (N = x.mesh) == null ? void 0 : N.position) == null
              ? void 0
              : O.x,
          y:
            (V = (j = x.mesh) == null ? void 0 : j.position) == null
              ? void 0
              : V.y,
          z:
            ($ = (U = x.mesh) == null ? void 0 : U.position) == null
              ? void 0
              : $.z,
        },
        k = {
          x:
            (G = (q = x.mesh) == null ? void 0 : q.quaternion) == null
              ? void 0
              : G.x,
          y:
            (R = (X = x.mesh) == null ? void 0 : X.quaternion) == null
              ? void 0
              : R.y,
          z:
            (S = (Z = x.mesh) == null ? void 0 : Z.quaternion) == null
              ? void 0
              : S.z,
          w:
            (H = (P = x.mesh) == null ? void 0 : P.quaternion) == null
              ? void 0
              : H.w,
        },
        z = {
          x:
            ((de = (I = x.mesh) == null ? void 0 : I.scale) == null
              ? void 0
              : de.x) || 1,
          y:
            ((D = (te = x.mesh) == null ? void 0 : te.scale) == null
              ? void 0
              : D.y) || 1,
          z:
            ((B = (M = x.mesh) == null ? void 0 : M.scale) == null
              ? void 0
              : B.z) || 1,
        },
        _ = {
          ...y,
          posX: C.x,
          posY: C.y,
          posZ: C.z,
          rotQx: k.x,
          rotQy: k.y,
          rotQz: k.z,
          rotQw: k.w,
          scaleX: z.x,
          scaleY: z.y,
          scaleZ: z.z,
        };
      if (x.mesh && w) {
        (Q = (A = x.mesh).updateMatrixWorld) == null || Q.call(A, !0);
        const oe = this.getModelRoot();
        let ze = x.mesh.matrixWorld.clone();
        if (x.type === "cylinder") {
          const Ne = x.baseDistance || 0,
            De = new w.Vector3(0, -Ne / 2, 0),
            Oe = new w.Vector3(0, Ne / 2, 0);
          if ((De.applyMatrix4(ze), Oe.applyMatrix4(ze), oe)) {
            const T = oe.matrixWorld.clone().invert();
            (De.applyMatrix4(T), Oe.applyMatrix4(T));
          }
          ((_.p1 = { x: De.x, y: De.y, z: De.z }),
            (_.p2 = { x: Oe.x, y: Oe.y, z: Oe.z }));
        } else if (x.type === "plane" && x.p1 && x.p2 && x.p3) {
          const Ne = new w.Vector3()
              .addVectors(
                new w.Vector3(x.p1.x, x.p1.y, x.p1.z),
                new w.Vector3(x.p2.x, x.p2.y, x.p2.z),
              )
              .add(new w.Vector3(x.p3.x, x.p3.y, x.p3.z))
              .divideScalar(3),
            De = new w.Vector3().subVectors(
              new w.Vector3(x.p2.x, x.p2.y, x.p2.z),
              new w.Vector3(x.p1.x, x.p1.y, x.p1.z),
            ),
            Oe = new w.Vector3().subVectors(
              new w.Vector3(x.p3.x, x.p3.y, x.p3.z),
              new w.Vector3(x.p1.x, x.p1.y, x.p1.z),
            ),
            T = new w.Vector3().crossVectors(De, Oe).normalize(),
            ae = new w.Vector3().copy(De).normalize(),
            se = new w.Vector3().crossVectors(T, ae).normalize(),
            Y = new w.Matrix4().makeBasis(ae, se, T),
            F = new w.Quaternion().setFromRotationMatrix(Y),
            xe = new w.Matrix4()
              .compose(Ne, F, new w.Vector3(1, 1, 1))
              .invert(),
            we = (le) => {
              const ke = new w.Vector3(le.x, le.y, le.z);
              if ((ke.applyMatrix4(xe), ke.applyMatrix4(ze), oe)) {
                const Te = oe.matrixWorld.clone().invert();
                ke.applyMatrix4(Te);
              }
              return { x: ke.x, y: ke.y, z: ke.z };
            };
          ((_.p1 = we(x.p1)), (_.p2 = we(x.p2)), (_.p3 = we(x.p3)));
        } else if (x.type === "measurement" && x.p1 && x.p2Coord) {
          const Ne = new w.Vector3()
              .addVectors(
                new w.Vector3(x.p1.x, x.p1.y, x.p1.z),
                new w.Vector3(x.p2Coord.x, x.p2Coord.y, x.p2Coord.z),
              )
              .multiplyScalar(0.5),
            De = new w.Vector3()
              .subVectors(
                new w.Vector3(x.p2Coord.x, x.p2Coord.y, x.p2Coord.z),
                new w.Vector3(x.p1.x, x.p1.y, x.p1.z),
              )
              .normalize(),
            Oe = new w.Vector3(0, 1, 0),
            T = new w.Quaternion().setFromUnitVectors(Oe, De),
            ae = new w.Matrix4()
              .compose(Ne, T, new w.Vector3(1, 1, 1))
              .invert(),
            se = (Y) => {
              const F = new w.Vector3(Y.x, Y.y, Y.z);
              return (
                F.applyMatrix4(ae).applyMatrix4(ze),
                oe && F.applyMatrix4(oe.matrixWorld.clone().invert()),
                { x: F.x, y: F.y, z: F.z }
              );
            };
          ((_.p1 = se(x.p1)), (_.p2Coord = se(x.p2Coord)));
        } else if (x.type === "point" && x.points && x.points.length > 0) {
          const Ne = new w.Matrix4().makeTranslation(
              -x.points[0].x,
              -x.points[0].y,
              -x.points[0].z,
            ),
            De = (Oe) => {
              const T = new w.Vector3(Oe.x, Oe.y, Oe.z);
              return (
                T.applyMatrix4(Ne).applyMatrix4(ze),
                oe && T.applyMatrix4(oe.matrixWorld.clone().invert()),
                { x: T.x, y: T.y, z: T.z }
              );
            };
          _.points = [De(x.points[0])];
        } else if (x.type === "curve" && x.points) {
          const Ne = (De) => {
            const Oe = new w.Vector3(De.x, De.y, De.z);
            return (
              Oe.applyMatrix4(ze),
              oe && Oe.applyMatrix4(oe.matrixWorld.clone().invert()),
              { x: Oe.x, y: Oe.y, z: Oe.z }
            );
          };
          _.points = x.points.map(Ne);
        } else if (x.type === "angle" && x.p1 && x.p2Coord && x.p3) {
          const Ne = (De) => {
            const Oe = new w.Vector3(De.x, De.y, De.z);
            return (
              Oe.applyMatrix4(ze),
              oe && Oe.applyMatrix4(oe.matrixWorld.clone().invert()),
              { x: Oe.x, y: Oe.y, z: Oe.z }
            );
          };
          ((_.p1 = Ne(x.p1)), (_.p2Coord = Ne(x.p2Coord)), (_.p3 = Ne(x.p3)));
        } else if (x.type === "annotation" && x.position) {
          const Ne = new w.Vector3(x.position.x, x.position.y, x.position.z);
          (oe && Ne.applyMatrix4(oe.matrixWorld.clone().invert()),
            (_.position = { x: Ne.x, y: Ne.y, z: Ne.z }));
        }
        if (oe) {
          oe.updateMatrixWorld(!0);
          const Ne = oe.matrixWorld.clone().invert();
          ze.premultiply(Ne);
        }
        const ye = new w.Vector3(),
          me = new w.Quaternion(),
          Ae = new w.Vector3();
        (ze.decompose(ye, me, Ae),
          (C = { x: ye.x, y: ye.y, z: ye.z }),
          (k = { x: me.x, y: me.y, z: me.z, w: me.w }),
          (z = { x: Ae.x, y: Ae.y, z: Ae.z }));
      }
      l.push({
        id: x.id,
        name: x.name || x.id,
        type: x.type,
        color: x.color,
        groupId: x.groupId || null,
        groupName:
          (x.groupId &&
            ((W = this.planningGroups.find((oe) => oe.id === x.groupId)) == null
              ? void 0
              : W.name)) ||
          "",
        ..._,
        posX: C.x,
        posY: C.y,
        posZ: C.z,
        rotQx: k.x,
        rotQy: k.y,
        rotQz: k.z,
        rotQw: k.w,
        scaleX: z.x,
        scaleY: z.y,
        scaleZ: z.z,
        coordinateSystem: {
          systemType: "Loaded Model Local Coordinate Space",
          units: "millimeters (mm)",
          origin: "Aligned with loaded model origin (local space)",
        },
      });
    });
    const u = {
        coordinateSystem: {
          systemType: "Loaded Model Local Coordinate Space",
          units: "millimeters (mm)",
          origin: "Aligned with loaded model origin (local space)",
          note: "Planning objects coordinates have been exported relative to the same coordinate system as the loaded 3D model.",
        },
        objects: l,
      },
      s = this.generateSlicerMarkupsJson(
        this.planningObjects,
        "All Planning Objects",
        u,
      );
    (s && r.file("All_Planning.mrk.json", s),
      r.file("metadata.json", JSON.stringify(u, null, 2)),
      r.file(
        "coordinate_system_info.txt",
        `COORDINATE SYSTEM DEFINITION & SPECIFICATION
---------------------------------------------
System Type: Loaded Model Local Coordinate Space
Units of Measurement: Millimeters (mm)

Geometry Details:
All exported 3D STL files are saved relative to the loaded model's own local coordinate system.
This ensures precise clinical registration independent of screen view orientation.

Slicer Markup Compatibility:
A companion 3D Slicer markup JSON file (.mrk.json) has been exported ensuring pristine alignment in Slicer.
It contains both Slicer markup properties and the application's internal grouping and metadata.
`,
      ));
    const f = await r.generateAsync({ type: "blob" }),
      d = URL.createObjectURL(f),
      h = document.createElement("a");
    h.href = d;
    const m = this.loadedFilename
      ? this.loadedFilename.split(".").slice(0, -1).join(".")
      : "Model";
    ((h.download = `${m}_All_Planning.zip`),
      h.click(),
      setTimeout(() => URL.revokeObjectURL(d), 1e3));
  }
  generateSlicerMarkupsJson(i, r = "Planning Group", l = null) {
    const u = [],
      s = window.THREE;
    if (!s) return "";
    const c = this.getModelRoot();
    i.forEach((d, h) => {
      var N;
      const m = [],
        x = d.mesh;
      if (x) {
        (N = x.updateMatrixWorld) == null || N.call(x, !0);
        let O = x.matrixWorld.clone();
        (() => {
          if (d.type === "cylinder") {
            const U = d.baseDistance || 0,
              $ = new s.Vector3(0, -U / 2, 0),
              q = new s.Vector3(0, U / 2, 0);
            if (($.applyMatrix4(O), q.applyMatrix4(O), c)) {
              const G = c.matrixWorld.clone().invert();
              ($.applyMatrix4(G), q.applyMatrix4(G));
            }
            return [$, q];
          } else if (d.type === "plane" && d.p1 && d.p2 && d.p3) {
            const U = new s.Vector3()
                .addVectors(
                  new s.Vector3(d.p1.x, d.p1.y, d.p1.z),
                  new s.Vector3(d.p2.x, d.p2.y, d.p2.z),
                )
                .add(new s.Vector3(d.p3.x, d.p3.y, d.p3.z))
                .divideScalar(3),
              $ = new s.Vector3().subVectors(
                new s.Vector3(d.p2.x, d.p2.y, d.p2.z),
                new s.Vector3(d.p1.x, d.p1.y, d.p1.z),
              ),
              q = new s.Vector3().subVectors(
                new s.Vector3(d.p3.x, d.p3.y, d.p3.z),
                new s.Vector3(d.p1.x, d.p1.y, d.p1.z),
              ),
              G = new s.Vector3().crossVectors($, q).normalize(),
              X = new s.Vector3().copy($).normalize(),
              R = new s.Vector3().crossVectors(G, X).normalize(),
              Z = new s.Matrix4().makeBasis(X, R, G),
              S = new s.Quaternion().setFromRotationMatrix(Z),
              H = new s.Matrix4()
                .compose(U, S, new s.Vector3(1, 1, 1))
                .invert(),
              I = (de) => {
                const te = new s.Vector3(de.x, de.y, de.z);
                if ((te.applyMatrix4(H).applyMatrix4(O), c)) {
                  const D = c.matrixWorld.clone().invert();
                  te.applyMatrix4(D);
                }
                return te;
              };
            return [I(d.p1), I(d.p2), I(d.p3)];
          } else if (d.type === "measurement" && d.p1 && d.p2Coord) {
            const U = new s.Vector3()
                .addVectors(
                  new s.Vector3(d.p1.x, d.p1.y, d.p1.z),
                  new s.Vector3(d.p2Coord.x, d.p2Coord.y, d.p2Coord.z),
                )
                .multiplyScalar(0.5),
              $ = new s.Vector3()
                .subVectors(
                  new s.Vector3(d.p2Coord.x, d.p2Coord.y, d.p2Coord.z),
                  new s.Vector3(d.p1.x, d.p1.y, d.p1.z),
                )
                .normalize(),
              q = new s.Vector3(0, 1, 0),
              G = new s.Quaternion().setFromUnitVectors(q, $),
              X = new s.Matrix4()
                .compose(U, G, new s.Vector3(1, 1, 1))
                .invert(),
              R = (Z) => {
                const S = new s.Vector3(Z.x, Z.y, Z.z);
                return (
                  S.applyMatrix4(X).applyMatrix4(O),
                  c && S.applyMatrix4(c.matrixWorld.clone().invert()),
                  S
                );
              };
            return [R(d.p1), R(d.p2Coord)];
          } else if (d.type === "point" && d.points && d.points.length > 0) {
            const U = new s.Matrix4().makeTranslation(
              -d.points[0].x,
              -d.points[0].y,
              -d.points[0].z,
            );
            return [
              ((q) => {
                const G = new s.Vector3(q.x, q.y, q.z);
                return (
                  G.applyMatrix4(U).applyMatrix4(O),
                  c && G.applyMatrix4(c.matrixWorld.clone().invert()),
                  G
                );
              })(d.points[0]),
            ];
          } else if (d.type === "curve" && d.points) {
            const U = ($) => {
              const q = new s.Vector3($.x, $.y, $.z);
              return (
                q.applyMatrix4(O),
                c && q.applyMatrix4(c.matrixWorld.clone().invert()),
                q
              );
            };
            return d.points.map(U);
          } else if (d.type === "angle" && d.p1 && d.p2Coord && d.p3) {
            const U = ($) => {
              const q = new s.Vector3($.x, $.y, $.z);
              return (
                q.applyMatrix4(O),
                c && q.applyMatrix4(c.matrixWorld.clone().invert()),
                q
              );
            };
            return [U(d.p1), U(d.p2Coord), U(d.p3)];
          } else if (d.type === "annotation" && d.position) {
            const U = new s.Vector3(d.position.x, d.position.y, d.position.z);
            return (c && U.applyMatrix4(c.matrixWorld.clone().invert()), [U]);
          }
          return [];
        })().forEach((U) => m.push({ x: U.x, y: U.y, z: U.z }));
      } else
        d.type === "cylinder" && d.p1 && d.p2
          ? m.push(d.p1, d.p2)
          : d.type === "plane" && d.p1 && d.p2 && d.p3
            ? m.push(d.p1, d.p2, d.p3)
            : d.type === "measurement" && d.p1 && d.p2Coord
              ? m.push(d.p1, d.p2Coord)
              : d.type === "point" && d.points && d.points.length > 0
                ? m.push(d.points[0])
                : d.type === "annotation" && d.position
                  ? m.push(d.position)
                  : d.type === "curve" && d.points
                    ? d.points.forEach((O) => m.push(O))
                    : d.type === "angle" &&
                      d.p1 &&
                      d.p2Coord &&
                      d.p3 &&
                      m.push(d.p1, d.p2Coord, d.p3);
      const b = (O) => [O.x, O.y, O.z];
      let y = "Fiducial",
        w = "F";
      d.type === "cylinder"
        ? ((y = "Line"), (w = "L"))
        : d.type === "measurement"
          ? ((y = "Line"), (w = "M"))
          : d.type === "curve"
            ? ((y = "Curve"), (w = "C"))
            : d.type === "angle"
              ? ((y = "Angle"), (w = "A"))
              : d.type === "plane"
                ? ((y = "Plane"), (w = "P"))
                : d.type === "point"
                  ? ((y = "Fiducial"), (w = "F"))
                  : d.type === "annotation" && ((y = "Fiducial"), (w = "ANN"));
      const C = m.map((O, j) => {
        const V = b(O);
        let U = `${d.name || d.id}`;
        return (
          m.length > 1 &&
            (d.type === "cylinder" || d.type === "measurement"
              ? (U += j === 0 ? "-Start" : "-End")
              : d.type === "angle"
                ? (U += j === 0 ? "-P1" : j === 1 ? "-Vertex" : "-P2")
                : d.type === "plane"
                  ? (U += `-P${j + 1}`)
                  : (U += `-${j + 1}`)),
          {
            id: `${d.id}-cp-${j}`,
            label: U,
            position: V,
            orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            positionStatus: "defined",
            selected: !0,
            locked: !1,
            visibility: d.visible !== !1,
            description: `Object Point for ${d.name}`,
            associatedNodeID: "",
          }
        );
      });
      let k = 0,
        z = 1,
        _ = 0;
      if (d.color && d.color.startsWith("#")) {
        const O = d.color.replace("#", "");
        O.length === 6 &&
          ((k = parseInt(O.substring(0, 2), 16) / 255),
          (z = parseInt(O.substring(2, 4), 16) / 255),
          (_ = parseInt(O.substring(4, 6), 16) / 255));
      }
      u.push({
        type: y,
        coordinateSystem: "LPS",
        labelFormat: `${w + (h + 1)}-%u`,
        controlPoints: C,
        name: d.name || d.id,
        locked: !1,
        display: {
          visibility: d.visible !== !1,
          color: [k, z, _],
          selectedColor: [k, z, _],
          activeColor: [k, z, _],
          opacity: 1,
        },
        measurements: [],
        properties: {
          customType: d.type,
          diameter: d.diameter,
          thickness: d.thickness,
          radius: d.radius,
          length: d.length,
          baseDistance: d.baseDistance,
          extension: d.extension,
          angle: d.angle,
          pinSize: d.pinSize,
          description: d.description,
          text: d.text,
          groupId: d.groupId || null,
        },
      });
    });
    const f = {
      "@schema":
        "https://raw.githubusercontent.com/slicer/slicer/master/Modules/Loadable/Markups/Resources/Schema/markups-schema-v1.0.3.json#",
      coordinateSystem: "LPS",
      groupName: r,
      markups: u,
    };
    return (l && ((f as any).appMetaData = l), JSON.stringify(f, null, 2));
  }
  async loadSlicerMarkupsJson(i) {
    var s, c, f, d, h, m, x, b, y, w, C, k, z, _, N, O, j, V, U, $, q, G;
    if (!i || !i.markups || !window.THREE) return;
    const r = i.groupName || "Imported Slicer Group";
    let l = "",
      u = this.planningGroups.find((X) => X.name === r);
    u ? (l = u.id) : (l = this.addPlanningGroup(r));
    for (const X of i.markups) {
      const R = ((s = X.properties) == null ? void 0 : s.customType) || X.type;
      let Z = X.coordinateSystem || i.coordinateSystem || "LPS";
      Z = Z.toUpperCase();
      const S =
        ((c = X.display) == null ? void 0 : c.visibility) ?? X.visibility ?? !0;
      let P = "#00ff00",
        H = ((f = X.display) == null ? void 0 : f.color) || X.color;
      if (Array.isArray(H) && H.length >= 3) {
        const D = Math.round(H[0] * 255)
            .toString(16)
            .padStart(2, "0"),
          M = Math.round(H[1] * 255)
            .toString(16)
            .padStart(2, "0"),
          B = Math.round(H[2] * 255)
            .toString(16)
            .padStart(2, "0");
        P = `#${D}${M}${B}`;
      } else typeof H == "string" && H.startsWith("#") && (P = H);
      const I = (D) => {
          let M = D[0],
            B = D[1],
            A = D[2];
          return { x: M, y: B, z: A };
        },
        de = (X.controlPoints || []).map((D) => I(D.position));
      if (de.length === 0 && !(X.center && X.orientation && X.size)) continue;
      const te = de;
      if (
        R === "annotation" ||
        ((d = X.properties) == null ? void 0 : d.customType) === "annotation"
      )
        for (let D = 0; D < te.length; D++) {
          const M = te[D],
            B = ((h = X.properties) == null ? void 0 : h.pinSize) || 1.5,
            A =
              te.length > 1
                ? `${X.name || "Annotation"}-${D + 1}`
                : X.name || "Annotation",
            Q =
              X.description ||
              ((m = X.properties) == null ? void 0 : m.description) ||
              "";
          if (
            (this.createPlanningAnnotation(
              new window.THREE.Vector3(M.x, M.y, M.z),
              null,
              A,
              Q,
              P !== "#00ff00" ? P : "#0284c7",
              B,
              (x = X.properties) == null ? void 0 : x.cardOffset,
            ),
            this.planningObjects.length > 0)
          ) {
            const W = this.planningObjects[this.planningObjects.length - 1];
            ((W.groupId = l),
              (W.visible = S),
              (b = X.properties) != null &&
                b.cardOffset &&
                ((W.cardOffset = {
                  x: Math.round(X.properties.cardOffset.x),
                  y: Math.round(X.properties.cardOffset.y),
                }),
                this.updatePlanningCardLabel(W)),
              this.updateMeshColorAndVisibility(W));
          }
        }
      else if (X.type === "Fiducial" || R === "point") {
        const D = ((y = X.properties) == null ? void 0 : y.diameter) || 0.2;
        for (let M = 0; M < te.length; M++) {
          const B = te[M];
          if (
            (this.createPlanningPoint(
              new window.THREE.Vector3(B.x, B.y, B.z),
              D,
            ),
            this.planningObjects.length > 0)
          ) {
            const A = this.planningObjects[this.planningObjects.length - 1];
            ((A.name =
              te.length > 1
                ? `${X.name || "Point"}-${M + 1}`
                : X.name || "Point"),
              (A.groupId = l),
              (A.color = P !== "#00ff00" ? P : "#db2777"),
              (A.visible = S),
              this.updateMeshColorAndVisibility(A));
          }
        }
      } else if (X.type === "Line" || R === "cylinder" || R === "measurement") {
        if (te.length >= 2) {
          const D = te[0],
            M = te[1],
            B = ((w = X.properties) == null ? void 0 : w.diameter) || 2,
            A = ((C = X.properties) == null ? void 0 : C.extension) || 0;
          if (
            (R === "cylinder"
              ? this.createPlanningCylinder(
                  new window.THREE.Vector3(D.x, D.y, D.z),
                  new window.THREE.Vector3(M.x, M.y, M.z),
                  B / 2,
                  A,
                )
              : this.createPlanningMeasurement(
                  new window.THREE.Vector3(D.x, D.y, D.z),
                  new window.THREE.Vector3(M.x, M.y, M.z),
                  ((k = X.properties) == null ? void 0 : k.angle) || 0,
                  (z = X.properties) == null ? void 0 : z.cardOffset,
                ),
            this.planningObjects.length > 0)
          ) {
            const Q = this.planningObjects[this.planningObjects.length - 1];
            ((Q.name = X.name || "Line"),
              (Q.groupId = l),
              (Q.color =
                P !== "#00ff00" ? P : R === "cylinder" ? "#0000ff" : "#10b981"),
              (Q.visible = S),
              (_ = X.properties) != null &&
                _.cardOffset &&
                Q.type === "measurement" &&
                ((Q.cardOffset = {
                  x: Math.round(X.properties.cardOffset.x),
                  y: Math.round(X.properties.cardOffset.y),
                }),
                this.updatePlanningCardLabel(Q)),
              this.updateMeshColorAndVisibility(Q));
          }
        }
      } else if (X.type === "Curve" || R === "curve") {
        const D = ((N = X.properties) == null ? void 0 : N.thickness) || 0.2;
        if (
          (this.createPlanningCurve(
            te.map((M) => new window.THREE.Vector3(M.x, M.y, M.z)),
            D,
          ),
          this.planningObjects.length > 0)
        ) {
          const M = this.planningObjects[this.planningObjects.length - 1];
          ((M.name = X.name || "Curve"),
            (M.groupId = l),
            (M.color = P !== "#00ff00" ? P : "#db2777"),
            (M.visible = S),
            this.updateMeshColorAndVisibility(M));
        }
      } else if (X.type === "Angle" || R === "angle") {
        if (te.length >= 3) {
          const D = te[0],
            M = te[1],
            B = te[2],
            A = ((O = X.properties) == null ? void 0 : O.angle) || 0;
          if (
            (this.createPlanningAngle(
              new window.THREE.Vector3(D.x, D.y, D.z),
              new window.THREE.Vector3(M.x, M.y, M.z),
              new window.THREE.Vector3(B.x, B.y, B.z),
              A,
              (j = X.properties) == null ? void 0 : j.cardOffset,
            ),
            this.planningObjects.length > 0)
          ) {
            const Q = this.planningObjects[this.planningObjects.length - 1];
            ((Q.name = X.name || "Angle"),
              (Q.groupId = l),
              (Q.color = P !== "#00ff00" ? P : "#d97706"),
              (Q.visible = S),
              (V = X.properties) != null &&
                V.cardOffset &&
                ((Q.cardOffset = {
                  x: Math.round(X.properties.cardOffset.x),
                  y: Math.round(X.properties.cardOffset.y),
                }),
                this.updatePlanningCardLabel(Q)),
              this.updateMeshColorAndVisibility(Q));
          }
        }
      } else if (X.type === "Plane" || R === "plane") {
        if (te.length >= 3) {
          const D = te[0],
            M = te[1],
            B = te[2],
            A = ((U = X.properties) == null ? void 0 : U.extWidth) || 10,
            Q = (($ = X.properties) == null ? void 0 : $.extLength) || 10;
          if (
            (this.createPlanningPlane(
              new window.THREE.Vector3(D.x, D.y, D.z),
              new window.THREE.Vector3(M.x, M.y, M.z),
              new window.THREE.Vector3(B.x, B.y, B.z),
              A,
              Q,
            ),
            this.planningObjects.length > 0)
          ) {
            const W = this.planningObjects[this.planningObjects.length - 1];
            ((W.name = X.name || "Plane"),
              (W.groupId = l),
              (W.color = P !== "#00ff00" ? P : "#00ff00"),
              (W.visible = S),
              this.updateMeshColorAndVisibility(W),
              this.updatePlaneGeometry(
                W.id,
                A,
                ((q = X.properties) == null ? void 0 : q.thickness) || 0,
              ));
          }
        } else if (X.center && X.orientation && X.size) {
          let D = { x: X.center[0], y: X.center[1], z: X.center[2] };
          const M = (Ne, De, Oe) => new window.THREE.Vector3(Ne, De, Oe),
            B = X.orientation,
            A = M(B[0], B[3], B[6]),
            Q = M(B[1], B[4], B[7]),
            W = new window.THREE.Vector3(D.x, D.y, D.z),
            oe = X.size[0] || 100,
            ze = X.size[1] || 100,
            ye = new window.THREE.Vector3()
              .copy(W)
              .addScaledVector(A, -oe / 3)
              .addScaledVector(Q, -ze / 3),
            me = new window.THREE.Vector3()
              .copy(W)
              .addScaledVector(A, (2 * oe) / 3)
              .addScaledVector(Q, -ze / 3),
            Ae = new window.THREE.Vector3()
              .copy(W)
              .addScaledVector(A, -oe / 3)
              .addScaledVector(Q, (2 * ze) / 3);
          if (
            (this.createPlanningPlane(
              new window.THREE.Vector3(ye.x, ye.y, ye.z),
              new window.THREE.Vector3(me.x, me.y, me.z),
              new window.THREE.Vector3(Ae.x, Ae.y, Ae.z),
              0,
              0,
            ),
            this.planningObjects.length > 0)
          ) {
            const Ne = this.planningObjects[this.planningObjects.length - 1];
            ((Ne.name = X.name || "Plane"),
              (Ne.groupId = l),
              (Ne.color = P !== "#00ff00" ? P : "#00ff00"),
              (Ne.visible = S),
              this.updateMeshColorAndVisibility(Ne),
              this.updatePlaneGeometry(
                Ne.id,
                0,
                ((G = X.properties) == null ? void 0 : G.thickness) || 0,
              ));
          }
        }
      }
    }
    (this.config.onPlanningObjectsChange &&
      this.config.onPlanningObjectsChange([...this.planningObjects]),
      this.saveToLocalStorage());
  }
  updatePlanningObjectColorAndOpacity(i, r, l) {
    const u = this.planningObjects.find((s) => s.id === i);
    u &&
      ((u.color = r),
      (u.opacity = l),
      this.updateMeshColorAndVisibility(u),
      this.config.onPlanningObjectsChange &&
        this.config.onPlanningObjectsChange(this.planningObjects),
      this.saveToLocalStorage());
  }
  updateMeshColorAndVisibility(i) {
    var r, l;
    if (i.mesh && window.THREE) {
      i.type === "custom_model" &&
        i.mesh.children &&
        i.mesh.children
          .filter((c) => {
            var f;
            return (
              c.isLineSegments ||
              c.type === "LineSegments" ||
              ((f = c.userData) == null ? void 0 : f.isEdge)
            );
          })
          .forEach((c) => {
            if (c.geometry && typeof c.geometry.dispose == "function")
              try {
                c.geometry.dispose();
              } catch {}
            if (c.material && typeof c.material.dispose == "function")
              try {
                c.material.dispose();
              } catch {}
            i.mesh.remove(c);
          });
      const u = (s) => {
        (s.color &&
          (s.color.set(i.color),
          i.type === "custom_model" &&
            (s.vertexColors !== void 0 && (s.vertexColors = !1),
            s.map !== void 0 && (s.map = null))),
          i.opacity !== void 0 &&
            ((s.transparent = i.opacity < 1),
            (s.opacity = i.opacity),
            i.type === "custom_model" &&
              (i.opacity < 1 ? (s.depthWrite = !1) : (s.depthWrite = !0)),
            (s.needsUpdate = !0)),
          this.originalColors &&
            this.originalColors.has(s) &&
            this.originalColors.delete(s));
      };
      if (
        (typeof i.mesh.traverse == "function"
          ? i.mesh.traverse((s) => {
              var c;
              s.material &&
                !((c = s.userData) != null && c.isEdge) &&
                (Array.isArray(s.material)
                  ? s.material.forEach(u)
                  : u(s.material));
            })
          : Array.isArray(i.mesh.material)
            ? i.mesh.material.forEach(u)
            : i.mesh.material && u(i.mesh.material),
        (i.mesh.visible = i.visible),
        i.labelDiv)
      ) {
        if (
          ((i.labelDiv.style.display = i.visible ? "flex" : "none"),
          i.visible
            ? ((l = this.hoveredPlanningObject) == null ? void 0 : l.id) ===
                i.id && this.showCardTooltip(i, i.labelDiv)
            : ((i.labelDiv.style.opacity = "0"),
              ((r = this.hoveredPlanningObject) == null ? void 0 : r.id) ===
                i.id && this.hideCardTooltip()),
          i.color)
        ) {
          i.labelDiv.style.borderColor = i.color;
          const s = i.labelDiv.querySelector(".annotation-color-dot");
          s && (s.style.backgroundColor = i.color);
          const c = i.labelDiv.querySelector(".measurement-color-dot");
          c && (c.style.backgroundColor = i.color);
          const f = i.labelDiv.querySelector(".angle-color-dot");
          f && (f.style.backgroundColor = i.color);
        }
        (i.leaderLine &&
          (i.leaderLine.setAttribute("stroke", i.color || "#0284c7"),
          i.visible || (i.leaderLine.style.display = "none")),
          i.visible &&
            (i.type === "annotation" ||
              i.type === "measurement" ||
              i.type === "angle") &&
            this.updatePlanningCardLabel(i));
      }
      this.viewer &&
        this.viewer.viewer &&
        typeof this.viewer.viewer.Render == "function" &&
        this.viewer.viewer.Render();
    }
  }
  async _recreatePlanningObjects(i: any, r?: any) {
    if (!i) return;
    const l = i.objects || [];
    let u = new Map();
    if (i.group) {
      let f = this.planningGroups.find((d) => d.name === i.group);
      if (f) u.set("export_group", f.id);
      else {
        const d = this.addPlanningGroup(i.group);
        u.set("export_group", d);
      }
    }
    for (const f of l)
      if (f.groupName) {
        let d = this.planningGroups.find((h) => h.name === f.groupName);
        if (d) u.set(f.groupName, d.id);
        else {
          const h = this.addPlanningGroup(f.groupName);
          u.set(f.groupName, h);
        }
      }
    const s = this.getModelRoot(),
      c = (f) => {
        if (s && window.THREE) {
          const d = new window.THREE.Vector3(f.x, f.y, f.z);
          return (d.applyMatrix4(s.matrixWorld), { x: d.x, y: d.y, z: d.z });
        }
        return f;
      };
    for (const f of l)
      try {
        let d = !1;
        if (f.type === "plane" && f.p1 && f.p2 && f.p3) {
          const h = c(f.p1),
            m = c(f.p2),
            x = c(f.p3);
          if (
            (this.createPlanningPlane(
              new window.THREE.Vector3(h.x, h.y, h.z),
              new window.THREE.Vector3(m.x, m.y, m.z),
              new window.THREE.Vector3(x.x, x.y, x.z),
              f.extWidth,
              f.extLength,
            ),
            this.planningObjects.length > 0)
          ) {
            const b = this.planningObjects[this.planningObjects.length - 1];
            this.updatePlaneGeometry(b.id, f.extWidth || 0, f.thickness || 0);
          }
          d = !0;
        } else if (f.type === "cylinder" && f.p1 && f.p2) {
          const h = c(f.p1),
            m = c(f.p2);
          (this.createPlanningCylinder(
            new window.THREE.Vector3(h.x, h.y, h.z),
            new window.THREE.Vector3(m.x, m.y, m.z),
            (f.diameter !== void 0 ? f.diameter : f.radius * 2) / 2,
            f.extension,
          ),
            (d = !0));
        } else if (f.type === "curve" && f.points) {
          const h = f.points.map((m) => c(m));
          (this.createPlanningCurve(
            h.map((m) => new window.THREE.Vector3(m.x, m.y, m.z)),
            f.thickness,
          ),
            (d = !0));
        } else if (f.type === "measurement" && f.p1 && f.p2Coord) {
          const h = c(f.p1),
            m = c(f.p2Coord);
          (this.createPlanningMeasurement(
            new window.THREE.Vector3(h.x, h.y, h.z),
            new window.THREE.Vector3(m.x, m.y, m.z),
            f.angle || 0,
            f.cardOffset,
          ),
            (d = !0));
        } else if (f.type === "angle" && f.p1 && f.p2Coord && f.p3) {
          const h = c(f.p1),
            m = c(f.p2Coord),
            x = c(f.p3);
          (this.createPlanningAngle(
            new window.THREE.Vector3(h.x, h.y, h.z),
            new window.THREE.Vector3(m.x, m.y, m.z),
            new window.THREE.Vector3(x.x, x.y, x.z),
            f.angle || 0,
            f.cardOffset,
          ),
            (d = !0));
        } else if (f.type === "point" && f.points && f.points.length > 0) {
          const h = c(f.points[0]);
          (this.createPlanningPoint(
            new window.THREE.Vector3(h.x, h.y, h.z),
            f.diameter || 0.2,
          ),
            (d = !0));
        } else if (f.type === "annotation" && f.position) {
          const h = c(f.position),
            m = f.normal ? c(f.normal) : null;
          (this.createPlanningAnnotation(
            new window.THREE.Vector3(h.x, h.y, h.z),
            m ? new window.THREE.Vector3(m.x, m.y, m.z) : null,
            f.text || f.name,
            f.description,
            f.color || "#0284c7",
            f.pinSize || 1.5,
            f.cardOffset,
          ),
            (d = !0));
        } else if (f.type === "custom_model") {
          let h = null,
            m = f.fileDataURL || "";
          if (r && r.files) {
            const k = [
              f.fileName,
              f.name ? `${f.name}.stl` : null,
              f.id ? `${f.id}.stl` : null,
              f.name,
              f.id,
            ]
              .filter(Boolean)
              .map((z) => z.toLowerCase().trim());
            for (const z of Object.keys(r.files)) {
              if (z.startsWith("__MACOSX/") || z.includes("/__MACOSX/"))
                continue;
              const _ = (z.split("/").pop() || "").toLowerCase().trim();
              if (
                !_.startsWith(".") &&
                (k.includes(_) ||
                  (_.endsWith(".stl") && k.includes(_.replace(/\.stl$/i, ""))))
              )
                try {
                  h = await r.files[z].async("arraybuffer");
                  const N = new Blob([h], { type: "application/octet-stream" });
                  m = URL.createObjectURL(N);
                  break;
                } catch (N) {
                  console.warn(
                    "Failed reading STL buffer from zip entry:",
                    z,
                    N,
                  );
                }
            }
          }
          if (!h && f.fileDataURL)
            try {
              const k = await fetch(f.fileDataURL);
              k.ok && (h = await k.arrayBuffer());
            } catch (k) {
              console.warn(
                "Could not fetch fileDataURL for custom model:",
                f.name,
                k,
              );
            }
          if (!h) {
            console.warn(
              "Could not retrieve 3D data for custom model:",
              f.name || f.id,
            );
            continue;
          }
          const b = new window.THREE.STLLoader().parse(h);
          (s && window.THREE && b.applyMatrix4(s.matrixWorld),
            b.computeBoundingBox(),
            b.computeBoundingSphere());
          const y = new window.THREE.Vector3();
          (b.boundingBox.getCenter(y),
            b.translate(-y.x, -y.y, -y.z),
            b.computeBoundingBox(),
            b.computeBoundingSphere(),
            b.attributes && b.attributes.color && b.deleteAttribute("color"));
          const w = new window.THREE.MeshStandardMaterial({
              color: f.color
                ? new window.THREE.Color(f.color)
                : new window.THREE.Color(9133302),
              transparent: (f.opacity !== void 0 ? f.opacity : 0.7) < 1,
              opacity: f.opacity !== void 0 ? f.opacity : 0.7,
              depthTest: !0,
              depthWrite: (f.opacity !== void 0 ? f.opacity : 0.7) >= 1,
              side: window.THREE.DoubleSide,
              roughness: 0.35,
              metalness: 0.1,
            }),
            C = new window.THREE.Mesh(b, w);
          if (
            ((C.renderOrder = 999),
            C.position.copy(y),
            (C.userData = { isCustomOverlay: !0 }),
            this.viewer && this.viewer.viewer)
          ) {
            const k = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
            k && k.add(C);
          }
          (this.planningObjects.push({
            id:
              f.id && !this.planningObjects.some((k) => k.id === f.id)
                ? f.id
                : `CustomModel_${this.nextPlanningObjectId++}`,
            name: f.name,
            type: "custom_model",
            mesh: C,
            color: f.color || "#8b5cf6",
            opacity: f.opacity !== void 0 ? f.opacity : 0.7,
            fileName: f.fileName || `${f.name || "Model"}.stl`,
            fileDataURL: m,
          }),
            (d = !0));
        } else {
          console.warn("Unsupported or missing data for planning object:", f);
          continue;
        }
        if (d && this.planningObjects.length > 0) {
          const h = this.planningObjects[this.planningObjects.length - 1];
          if (
            ((h.name = f.name),
            (h.color = f.color),
            (h.visible = typeof f.visible == "boolean" ? f.visible : !0),
            f.groupName && u.has(f.groupName))
          )
            h.groupId = u.get(f.groupName);
          else if (u.has("export_group")) h.groupId = u.get("export_group");
          else if (f.groupId) {
            const m = this.planningGroups.find((x) => x.id === f.groupId);
            m && (h.groupId = m.id);
          }
          (f.cardOffset &&
            ((h.cardOffset = {
              x: Math.round(f.cardOffset.x),
              y: Math.round(f.cardOffset.y),
            }),
            this.updatePlanningCardLabel(h)),
            this.updateMeshColorAndVisibility(h));
        }
      } catch (d) {
        console.error(
          "Error recreating planning object:",
          (f == null ? void 0 : f.name) || (f == null ? void 0 : f.id),
          d,
        );
      }
    (this.config.onPlanningObjectsChange &&
      this.config.onPlanningObjectsChange(this.planningObjects),
      this.saveToLocalStorage());
  }
  async importPlanningObjectsZip(i) {
    if (!window.THREE) return;
    const r = i.name.toLowerCase();
    if (r.endsWith(".json") || r.endsWith(".mrk.json")) {
      try {
        const c = await i.text(),
          f = JSON.parse(c);
        f && f.appMetaData
          ? await this._recreatePlanningObjects(f.appMetaData)
          : f && f.markups
            ? await this.loadSlicerMarkupsJson(f)
            : f && f.objects && (await this._recreatePlanningObjects(f));
      } catch (c) {
        console.error("Failed to parse standalone config JSON:", c);
      }
      return;
    }
    let l;
    try {
      l = await i.arrayBuffer();
    } catch (c) {
      console.error("Failed to read planning ZIP file buffer:", c);
      return;
    }
    let u;
    try {
      const c = JSZip as any;
      u = c.default || c;
    } catch (c) {
      console.error("Failed to load JSZip module:", c);
      return;
    }
    const s = new u();
    try {
      const c = await s.loadAsync(l),
        f = (b) =>
          !(
            b.startsWith("__MACOSX/") ||
            b.includes("/__MACOSX/") ||
            (b.split("/").pop() || "").startsWith(".")
          ),
        d = Object.keys(c.files).filter(f);
      let h = null;
      const m = d.find((b) => {
        var w;
        return (
          ((w = b.split("/").pop()) == null ? void 0 : w.toLowerCase()) ===
          "metadata.json"
        );
      });
      if (m)
        try {
          const b = await c.files[m].async("string");
          h = JSON.parse(b);
        } catch (b) {
          console.warn("Failed to parse metadata.json in zip:", b);
        }
      if (!h) {
        const b = d.find((y) => {
          var C;
          return (
            ((C = y.split("/").pop()) == null ? void 0 : C.toLowerCase()) || ""
          ).endsWith(".mrk.json");
        });
        if (b)
          try {
            const y = await c.files[b].async("string");
            h = JSON.parse(y);
          } catch (y) {
            console.warn("Failed to parse .mrk.json in zip:", y);
          }
      }
      if (!h) {
        const b = d.find((y) => {
          var C;
          return (
            ((C = y.split("/").pop()) == null ? void 0 : C.toLowerCase()) || ""
          ).endsWith(".json");
        });
        if (b)
          try {
            const y = await c.files[b].async("string");
            h = JSON.parse(y);
          } catch (y) {
            console.warn("Failed to parse json file in zip:", y);
          }
      }
      if (h && h.appMetaData) h = h.appMetaData;
      else if (h && h.markups && (!h.objects || h.objects.length === 0)) {
        await this.loadSlicerMarkupsJson(h);
        return;
      }
      if (h && (h.objects || h.group)) {
        await this._recreatePlanningObjects(h, c);
        return;
      }
      const x = d.filter((b) => {
        var w;
        return (
          ((w = b.split("/").pop()) == null ? void 0 : w.toLowerCase()) || ""
        ).endsWith(".stl");
      });
      if (x.length > 0) {
        for (const b of x) {
          const y = (b.split("/").pop() || "").replace(/\.stl$/i, "");
          try {
            const w = await c.files[b].async("arraybuffer"),
              C = new File([w], `${y}.stl`);
            await this.importCustomPlanningModel(C);
          } catch (w) {
            console.error("Failed importing STL from zip:", b, w);
          }
        }
        return;
      }
      console.warn(
        "No compatible planning metadata (.json, .mrk.json) or STL files found in the zip archive.",
      );
    } catch (c) {
      console.error("Failed to parse or load planning ZIP file:", c);
    }
  }
  highlightPlanningMesh(i) {
    if (
      this.highlightedPlanningObj &&
      this.highlightedPlanningObj.mesh &&
      window.THREE
    ) {
      const r = this.highlightedPlanningObj.color,
        l = (u) => {
          if (this.originalColors.has(u)) {
            const s = this.originalColors.get(u);
            (s.color !== null && u.color && u.color.setHex(s.color),
              s.vertexColors !== null && (u.vertexColors = s.vertexColors),
              s.map !== null && (u.map = s.map),
              s.emissive !== null &&
                u.emissive &&
                u.emissive.setHex(s.emissive));
          } else
            (u.color && u.color.set(r), u.emissive && u.emissive.setHex(0));
          (this.highlightedPlanningObj.opacity !== void 0 &&
            ((u.transparent = !0),
            (u.opacity = this.highlightedPlanningObj.opacity)),
            this.originalColors.has(u) && this.originalColors.delete(u),
            (u.needsUpdate = !0));
        };
      typeof this.highlightedPlanningObj.mesh.traverse == "function" &&
        this.highlightedPlanningObj.mesh.traverse((u) => {
          var s;
          u.material &&
            !((s = u.userData) != null && s.isEdge) &&
            (Array.isArray(u.material) ? u.material.forEach(l) : l(u.material));
        });
    }
    if (
      ((this.highlightedPlanningObj = i),
      i && i.type === "custom_model" && i.mesh && window.THREE)
    ) {
      const r = (l) => {
        (this.originalColors.has(l) ||
          this.originalColors.set(l, {
            color: l.color ? l.color.getHex() : null,
            vertexColors: l.vertexColors !== void 0 ? l.vertexColors : null,
            map: l.map !== void 0 ? l.map : null,
            emissive:
              l.emissive !== void 0 && l.emissive.getHex
                ? l.emissive.getHex()
                : null,
          }),
          l.color && l.color.setHex(11458802),
          l.vertexColors !== void 0 &&
            (l.vertexColors = typeof l.vertexColors == "number" ? 0 : !1),
          l.map !== void 0 && (l.map = null),
          l.emissive && l.emissive.setHex(662058),
          (l.needsUpdate = !0));
      };
      typeof i.mesh.traverse == "function" &&
        i.mesh.traverse((l) => {
          var u;
          l.material &&
            !((u = l.userData) != null && u.isEdge) &&
            (Array.isArray(l.material) ? l.material.forEach(r) : r(l.material));
        });
    }
    this.viewer && this.viewer.viewer && this.viewer.viewer.Render();
  }
  highlightMesh(i) {
    var r;
    if ((this.clearHighlight(), i !== null && this.currentMeshes[i])) {
      const l = this.currentMeshes[i];
      ((this.highlightedMesh = l),
        l.material &&
          (Array.isArray(l.material) ? l.material : [l.material]).forEach(
            (s) => {
              if (!this.originalColors.has(s)) {
                const c = this.ghostedOriginals.get(s);
                this.originalColors.set(s, {
                  color:
                    c && c.color !== null
                      ? c.color
                      : s.color
                        ? s.color.getHex()
                        : 13421772,
                  roughness:
                    c && c.roughness !== null
                      ? c.roughness
                      : s.roughness !== void 0
                        ? s.roughness
                        : null,
                  metalness:
                    c && c.metalness !== null
                      ? c.metalness
                      : s.metalness !== void 0
                        ? s.metalness
                        : null,
                  shininess:
                    c && c.shininess !== null
                      ? c.shininess
                      : s.shininess !== void 0
                        ? s.shininess
                        : null,
                  specular:
                    c && c.specular !== null
                      ? c.specular
                      : s.specular !== void 0 && s.specular.getHex
                        ? s.specular.getHex()
                        : null,
                  vertexColors:
                    c && c.vertexColors !== null
                      ? c.vertexColors
                      : s.vertexColors !== void 0
                        ? s.vertexColors
                        : null,
                  map:
                    c && c.map !== void 0
                      ? c.map
                      : s.map !== void 0
                        ? s.map
                        : null,
                  emissive:
                    c && c.emissive !== null
                      ? c.emissive
                      : s.emissive !== void 0 && s.emissive.getHex
                        ? s.emissive.getHex()
                        : null,
                });
              }
              if (!this.isGhostingMode)
                (s.color && s.color.setHex(11458802),
                  s.vertexColors !== void 0 &&
                    (s.vertexColors =
                      typeof s.vertexColors == "number" ? 0 : !1),
                  s.map !== void 0 && (s.map = null),
                  s.emissive !== void 0 &&
                    s.emissive.setHex &&
                    s.emissive.setHex(0),
                  s.roughness !== void 0 && (s.roughness = 0.11),
                  s.metalness !== void 0 && (s.metalness = 0.18),
                  s.shininess !== void 0 && (s.shininess = 80),
                  s.specular !== void 0 &&
                    s.specular.setHex &&
                    s.specular.setHex(16777215));
              else {
                const c = this.originalColors.get(s);
                c &&
                  (s.color && c.color !== null && s.color.setHex(c.color),
                  c.roughness !== null &&
                    s.roughness !== void 0 &&
                    (s.roughness = c.roughness),
                  c.metalness !== null &&
                    s.metalness !== void 0 &&
                    (s.metalness = c.metalness),
                  c.shininess !== null &&
                    s.shininess !== void 0 &&
                    (s.shininess = c.shininess),
                  c.specular !== null &&
                    s.specular !== void 0 &&
                    s.specular.setHex &&
                    s.specular.setHex(c.specular),
                  c.vertexColors !== null &&
                    s.vertexColors !== void 0 &&
                    (s.vertexColors = c.vertexColors),
                  c.map !== null && s.map !== void 0 && (s.map = c.map),
                  c.emissive !== null &&
                    s.emissive !== void 0 &&
                    s.emissive.setHex &&
                    s.emissive.setHex(c.emissive));
              }
              s.needsUpdate = !0;
            },
          ));
    }
    if (
      (this.config.onMeshHighlighted(i),
      this.isGhostingMode && this.applyGhostingMode(),
      (r = this.viewer) != null && r.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
  }
  clearHighlight() {
    (this.highlightedMesh &&
      this.highlightedMesh.material &&
      ((Array.isArray(this.highlightedMesh.material)
        ? this.highlightedMesh.material
        : [this.highlightedMesh.material]
      ).forEach((r) => {
        if (this.originalColors.has(r)) {
          const l = this.originalColors.get(r);
          l &&
            (r.color && l.color !== null && r.color.setHex(l.color),
            l.roughness !== null &&
              r.roughness !== void 0 &&
              (r.roughness = l.roughness),
            l.metalness !== null &&
              r.metalness !== void 0 &&
              (r.metalness = l.metalness),
            l.shininess !== null &&
              r.shininess !== void 0 &&
              (r.shininess = l.shininess),
            l.specular !== null &&
              r.specular !== void 0 &&
              r.specular.setHex &&
              r.specular.setHex(l.specular),
            l.vertexColors !== null &&
              r.vertexColors !== void 0 &&
              (r.vertexColors = l.vertexColors),
            l.map !== null && r.map !== void 0 && (r.map = l.map),
            l.emissive !== null &&
              r.emissive !== void 0 &&
              r.emissive.setHex &&
              r.emissive.setHex(l.emissive));
        }
        r.needsUpdate = !0;
      }),
      (this.highlightedMesh = null)),
      this.isGhostingMode && this.applyGhostingMode());
  }
  setGhostingMode(i) {
    var r;
    if (
      ((this.isGhostingMode = i),
      i
        ? (this.highlightedMesh &&
            this.highlightedMesh.material &&
            (Array.isArray(this.highlightedMesh.material)
              ? this.highlightedMesh.material
              : [this.highlightedMesh.material]
            ).forEach((u) => {
              const s = this.originalColors.get(u);
              s &&
                (s.color !== null && u.color && u.color.setHex(s.color),
                s.roughness !== null &&
                  u.roughness !== void 0 &&
                  (u.roughness = s.roughness),
                s.metalness !== null &&
                  u.metalness !== void 0 &&
                  (u.metalness = s.metalness),
                s.shininess !== null &&
                  u.shininess !== void 0 &&
                  (u.shininess = s.shininess),
                s.specular !== null &&
                  u.specular !== void 0 &&
                  u.specular.setHex &&
                  u.specular.setHex(s.specular),
                s.vertexColors !== null &&
                  u.vertexColors !== void 0 &&
                  (u.vertexColors = s.vertexColors),
                s.map !== null && u.map !== void 0 && (u.map = s.map),
                s.emissive !== null &&
                  u.emissive &&
                  u.emissive.setHex &&
                  u.emissive.setHex(s.emissive),
                (u.needsUpdate = !0));
            }),
          this.applyGhostingMode())
        : (this.revertGhostingMode(),
          this.highlightedMesh &&
            this.highlightedMesh.material &&
            (Array.isArray(this.highlightedMesh.material)
              ? this.highlightedMesh.material
              : [this.highlightedMesh.material]
            ).forEach((u) => {
              (u.color && u.color.setHex(11458802),
                u.vertexColors !== void 0 &&
                  (u.vertexColors = typeof u.vertexColors == "number" ? 0 : !1),
                u.map !== void 0 && (u.map = null),
                u.emissive !== void 0 &&
                  u.emissive.setHex &&
                  u.emissive.setHex(0),
                u.roughness !== void 0 && (u.roughness = 0.11),
                u.metalness !== void 0 && (u.metalness = 0.18),
                u.shininess !== void 0 && (u.shininess = 80),
                u.specular !== void 0 &&
                  u.specular.setHex &&
                  u.specular.setHex(16777215),
                (u.needsUpdate = !0));
            })),
      (r = this.viewer) != null && r.viewer)
    )
      try {
        this.viewer.viewer.Render();
      } catch {}
  }
  applyGhostingMode() {
    !window.THREE ||
      !this.currentMeshes.length ||
      this.currentMeshes.forEach((i, r) => {
        if (!i || !i.material) return;
        const l = this.highlightedMesh ? i === this.highlightedMesh : !0;
        (Array.isArray(i.material) ? i.material : [i.material]).forEach((s) => {
          if (l)
            if (this.ghostedOriginals.has(s)) {
              const c = this.ghostedOriginals.get(s);
              ((s.transparent = c.transparent),
                (s.opacity = c.opacity),
                (s.depthWrite = c.depthWrite),
                c.color !== null && s.color && s.color.setHex(c.color),
                c.emissive !== null &&
                  s.emissive &&
                  s.emissive.setHex &&
                  s.emissive.setHex(c.emissive),
                c.roughness !== null &&
                  s.roughness !== void 0 &&
                  (s.roughness = c.roughness),
                c.metalness !== null &&
                  s.metalness !== void 0 &&
                  (s.metalness = c.metalness),
                c.shininess !== null &&
                  s.shininess !== void 0 &&
                  (s.shininess = c.shininess),
                c.specular !== null &&
                  s.specular !== void 0 &&
                  s.specular.setHex &&
                  s.specular.setHex(c.specular),
                c.vertexColors !== null &&
                  s.vertexColors !== void 0 &&
                  (s.vertexColors = c.vertexColors),
                c.map !== null && s.map !== void 0 && (s.map = c.map),
                this.ghostedOriginals.delete(s),
                (s.needsUpdate = !0));
            } else {
              const c = this.originalColors.get(s);
              c &&
                (c.color !== null && s.color && s.color.setHex(c.color),
                c.emissive !== null &&
                  s.emissive &&
                  s.emissive.setHex &&
                  s.emissive.setHex(c.emissive),
                c.roughness !== null &&
                  s.roughness !== void 0 &&
                  (s.roughness = c.roughness),
                c.metalness !== null &&
                  s.metalness !== void 0 &&
                  (s.metalness = c.metalness),
                c.shininess !== null &&
                  s.shininess !== void 0 &&
                  (s.shininess = c.shininess),
                c.specular !== null &&
                  s.specular !== void 0 &&
                  s.specular.setHex &&
                  s.specular.setHex(c.specular),
                c.vertexColors !== null &&
                  s.vertexColors !== void 0 &&
                  (s.vertexColors = c.vertexColors),
                c.map !== null && s.map !== void 0 && (s.map = c.map),
                (s.needsUpdate = !0));
            }
          else {
            if (!this.ghostedOriginals.has(s)) {
              const c = this.originalColors.get(s);
              this.ghostedOriginals.set(s, {
                color:
                  c && c.color !== null
                    ? c.color
                    : s.color
                      ? s.color.getHex()
                      : null,
                opacity: s.opacity !== void 0 ? s.opacity : 1,
                transparent: !!s.transparent,
                depthWrite: s.depthWrite !== void 0 ? s.depthWrite : !0,
                emissive:
                  c && c.emissive !== null
                    ? c.emissive
                    : s.emissive && s.emissive.getHex
                      ? s.emissive.getHex()
                      : null,
                map:
                  c && c.map !== void 0
                    ? c.map
                    : s.map !== void 0
                      ? s.map
                      : null,
                roughness:
                  c && c.roughness !== null
                    ? c.roughness
                    : s.roughness !== void 0
                      ? s.roughness
                      : null,
                metalness:
                  c && c.metalness !== null
                    ? c.metalness
                    : s.metalness !== void 0
                      ? s.metalness
                      : null,
                shininess:
                  c && c.shininess !== null
                    ? c.shininess
                    : s.shininess !== void 0
                      ? s.shininess
                      : null,
                specular:
                  c && c.specular !== null
                    ? c.specular
                    : s.specular !== void 0 && s.specular.getHex
                      ? s.specular.getHex()
                      : null,
                vertexColors:
                  c && c.vertexColors !== null
                    ? c.vertexColors
                    : s.vertexColors !== void 0
                      ? s.vertexColors
                      : null,
              });
            }
            ((s.transparent = !0),
              (s.opacity = 0.18),
              (s.depthWrite = !1),
              s.color && s.color.setHex(5935028),
              s.emissive && s.emissive.setHex && s.emissive.setHex(1124412),
              (s.needsUpdate = !0));
          }
        });
      });
  }
  revertGhostingMode() {
    (this.ghostedOriginals.forEach((i, r) => {
      ((r.transparent = i.transparent),
        (r.opacity = i.opacity),
        (r.depthWrite = i.depthWrite),
        (this.highlightedMesh &&
          (this.highlightedMesh.material === r ||
            (Array.isArray(this.highlightedMesh.material) &&
              this.highlightedMesh.material.includes(r)))) ||
          (i.color !== null && r.color && r.color.setHex(i.color),
          i.emissive !== null &&
            r.emissive &&
            r.emissive.setHex &&
            r.emissive.setHex(i.emissive),
          i.roughness !== null &&
            r.roughness !== void 0 &&
            (r.roughness = i.roughness),
          i.metalness !== null &&
            r.metalness !== void 0 &&
            (r.metalness = i.metalness),
          i.shininess !== null &&
            r.shininess !== void 0 &&
            (r.shininess = i.shininess),
          i.specular !== null &&
            r.specular !== void 0 &&
            r.specular.setHex &&
            r.specular.setHex(i.specular),
          i.vertexColors !== null &&
            r.vertexColors !== void 0 &&
            (r.vertexColors = i.vertexColors),
          i.map !== null && r.map !== void 0 && (r.map = i.map)),
        (r.needsUpdate = !0));
    }),
      this.ghostedOriginals.clear());
  }
  setClippingActive(i, r) {
    (i &&
      (this.modelBBox || (this.modelBBox = new window.THREE.Box3()),
      this.modelBBox.makeEmpty(),
      this.currentMeshes.forEach((l) => {
        const u = new window.THREE.Box3().setFromObject(l);
        this.modelBBox.union(u);
      })),
      this.updateClippingPlanes(i ? r : null));
  }
  updateClippingPlanes(i) {
    var l, u;
    if (
      ((this.lastPlanesState = i),
      !(
        (u = (l = this.viewer) == null ? void 0 : l.viewer) != null &&
        u.renderer
      ))
    )
      return;
    const r = this.viewer.viewer.renderer;
    if (
      ((r.localClippingEnabled = !0),
      i && this.modelBBox && !this.modelBBox.isEmpty())
    ) {
      const s = [];
      (["x", "y", "z"].forEach((c) => {
        var d, h, m, x, b, y;
        const f = i[c];
        if (f && f.active) {
          f.plane || (f.plane = new window.THREE.Plane());
          let w, C;
          c === "x"
            ? ((w = this.modelBBox.min.x), (C = this.modelBBox.max.x))
            : c === "y"
              ? ((w = this.modelBBox.min.y), (C = this.modelBBox.max.y))
              : c === "z" &&
                ((w = this.modelBBox.min.z), (C = this.modelBBox.max.z));
          const k = w + (C - w) * (f.sliderVal / 100),
            z = new window.THREE.Vector3();
          (c === "x" && z.set(1, 0, 0),
            c === "y" && z.set(0, 1, 0),
            c === "z" && z.set(0, 0, 1));
          const _ = new window.THREE.Vector3();
          if (
            (c === "x" && (_.x = k),
            c === "y" && (_.y = k),
            c === "z" && (_.z = k),
            f.alignToCamera)
          ) {
            if (
              (m =
                (h = (d = this.viewer) == null ? void 0 : d.viewer) == null
                  ? void 0
                  : h.navigation) != null &&
              m.GetCamera
            ) {
              const N = this.viewer.viewer.navigation.GetCamera();
              N &&
                N.eye &&
                N.center &&
                z
                  .set(
                    N.center.x - N.eye.x,
                    N.center.y - N.eye.y,
                    N.center.z - N.eye.z,
                  )
                  .normalize();
            } else
              (y =
                (b = (x = this.viewer) == null ? void 0 : x.viewer) == null
                  ? void 0
                  : b.navigation) != null &&
                y.camera &&
                this.viewer.viewer.navigation.camera.getWorldDirection(z);
            if (!this.modelBBox.isEmpty()) {
              const N = new window.THREE.Vector3();
              this.modelBBox.getCenter(N);
              const O = new window.THREE.Vector3(
                  Math.abs(z.x),
                  Math.abs(z.y),
                  Math.abs(z.z),
                ),
                j = new window.THREE.Vector3();
              this.modelBBox.getSize(j);
              const V = j.x * O.x + j.y * O.y + j.z * O.z,
                U = -V / 2,
                $ = V / 2,
                q = U + ($ - U) * (f.sliderVal / 100);
              _.copy(N).add(z.clone().multiplyScalar(q));
            }
          }
          (f.invert && z.negate(),
            f.plane.normal.copy(z),
            (f.plane.constant = -z.dot(_)),
            s.push(f.plane));
        }
      }),
        this.currentMeshes.forEach((c) => {
          c.material &&
            (Array.isArray(c.material) ? c.material : [c.material]).forEach(
              (d) => {
                let h = !1;
                if (!d.clippingPlanes || d.clippingPlanes.length !== s.length)
                  h = !0;
                else
                  for (let m = 0; m < s.length; m++)
                    if (d.clippingPlanes[m] !== s[m]) {
                      h = !0;
                      break;
                    }
                h &&
                  ((d.clippingPlanes = s),
                  (d.clipShadows = !0),
                  (d.side = window.THREE.DoubleSide),
                  (d.needsUpdate = !0));
              },
            );
        }));
    } else
      this.currentMeshes.forEach((s) => {
        s.material &&
          (Array.isArray(s.material) ? s.material : [s.material]).forEach(
            (f) => {
              f.clippingPlanes !== null &&
                ((f.clippingPlanes = null), (f.needsUpdate = !0));
            },
          );
      });
    try {
      this.viewer.viewer.Render();
    } catch {}
  }
  setupExplosion() {
    var c, f, d, h;
    if (
      !(
        ((f = (c = this.viewer) == null ? void 0 : c.viewer) == null
          ? void 0
          : f.scene) ||
        ((h = (d = this.viewer) == null ? void 0 : d.viewer) == null
          ? void 0
          : h.mainScene)
      ) ||
      this.currentMeshes.length === 0
    )
      return;
    const r = new window.THREE.Box3();
    this.currentMeshes.forEach((m) => {
      if (!m) return;
      const x = new window.THREE.Box3().setFromObject(m);
      r.union(x);
    });
    const l = new window.THREE.Vector3();
    r.isEmpty() ||
      (typeof r.getCenter == "function" && r.getCenter.length === 0
        ? l.copy(r.getCenter())
        : r.getCenter(l));
    const u = new window.THREE.Vector3();
    r.isEmpty() ||
      (typeof r.getSize == "function" && r.getSize.length === 0
        ? u.copy(r.getSize())
        : r.getSize(u));
    const s = Math.max(u.x, u.y, u.z) || 100;
    this.currentMeshes.forEach((m) => {
      ((m.userData = m.userData || {}),
        (m.userData.originalPosition = m.position.clone()));
      const x = new window.THREE.Box3().setFromObject(m),
        b = new window.THREE.Vector3();
      x.isEmpty()
        ? b.copy(m.position)
        : typeof x.getCenter == "function" && x.getCenter.length === 0
          ? b.copy(x.getCenter())
          : x.getCenter(b);
      let y = new window.THREE.Vector3().subVectors(b, l);
      (y.lengthSq() < 1e-4 ? y.set(0, 1, 0) : y.normalize(),
        (m.userData.explosionDir = y),
        (m.userData.maxDim = s));
    });
  }
  setExplode(i) {
    var r;
    if ((r = this.viewer) != null && r.viewer) {
      this.currentMeshes.forEach((l) => {
        if (
          l &&
          l.userData &&
          l.userData.originalPosition &&
          l.userData.explosionDir
        ) {
          const u = i * l.userData.maxDim * 0.5;
          (l.position
            .copy(l.userData.originalPosition)
            .add(l.userData.explosionDir.clone().multiplyScalar(u)),
            l.updateMatrixWorld && l.updateMatrixWorld(!0));
        }
      });
      try {
        this.viewer.viewer.Render();
      } catch {}
    }
  }
  setAutoRotate(i) {
    this.isAutoRotating = i;
  }
  setRulersVisible(i) {
    ((this.rulersVisible = i),
      i && (this.resizeRulers(), (this.lastCameraState = "")));
  }
  resizeRulers() {
    if (this.topRulerRef) {
      const i = this.topRulerRef.getBoundingClientRect();
      (this.topRulerRef.width !== i.width && (this.topRulerRef.width = i.width),
        this.topRulerRef.height !== i.height &&
          (this.topRulerRef.height = i.height));
    }
    if (this.leftRulerRef) {
      const i = this.leftRulerRef.getBoundingClientRect();
      (this.leftRulerRef.width !== i.width &&
        (this.leftRulerRef.width = i.width),
        this.leftRulerRef.height !== i.height &&
          (this.leftRulerRef.height = i.height));
    }
  }
  drawRulers(i, r, l) {
    const u = i.eye.x - i.center.x,
      s = i.eye.y - i.center.y,
      c = i.eye.z - i.center.z,
      f = Math.sqrt(u * u + s * s + c * c),
      d = 45 * (Math.PI / 180),
      h = this.container.getBoundingClientRect();
    if (h.height === 0) return;
    const m = 2 * f * Math.tan(d / 2),
      x = h.height / m,
      y = 60 / x;
    if (y <= 0 || !isFinite(y)) return;
    const w = Math.floor(Math.log10(y)),
      C = Math.pow(10, w),
      k = y / C;
    let z = 1;
    (k > 5 ? (z = 10) : k > 2 ? (z = 5) : k > 1 && (z = 2),
      (z *= C),
      r && this.renderRulerCanvas(r, !0, x, z),
      l && this.renderRulerCanvas(l, !1, x, z));
  }
  renderRulerCanvas(i, r, l, u, s = 1) {
    const c = i.getContext("2d");
    if (!c) return;
    const f = i.width,
      d = i.height;
    (c.clearRect(0, 0, f, d),
      (c.fillStyle = this.theme === "dark" ? "#333333" : "#fafafa"),
      c.fillRect(0, 0, f, d),
      (c.fillStyle = this.theme === "dark" ? "#aaaaaa" : "#555555"),
      (c.strokeStyle = this.theme === "dark" ? "#555555" : "#cccccc"),
      (c.lineWidth = Math.max(1, s * 0.5)),
      (c.font = `${Math.round(10 * s)}px sans-serif`),
      (c.textBaseline = "top"));
    const h = r ? f / 2 : d / 2,
      m = (r ? f : d) / l / 2,
      x = Math.ceil(m / u) * u;
    (c.beginPath(),
      r ? (c.moveTo(0, d), c.lineTo(f, d)) : (c.moveTo(f, 0), c.lineTo(f, d)));
    for (let b = -x; b <= x; b += u) {
      const y = h + b * l,
        w = Math.abs(b).toString();
      r
        ? (c.moveTo(y, d),
          c.lineTo(y, d - 8 * s),
          (c.textAlign = "center"),
          c.fillText(w, y, 4 * s))
        : (c.moveTo(f, y),
          c.lineTo(f - 8 * s, y),
          c.save(),
          c.translate(f - 12 * s, y),
          c.rotate(-Math.PI / 2),
          (c.textAlign = "center"),
          c.fillText(w, 0, -4 * s),
          c.restore());
      const C = u / 10;
      if (C * l > 4 * s)
        for (let z = 1; z < 10; z++) {
          const _ = h + (b + z * C) * l,
            N = z === 5 ? 6 * s : 3 * s;
          r
            ? (c.moveTo(_, d), c.lineTo(_, d - N))
            : (c.moveTo(f, _), c.lineTo(f - N, _));
        }
    }
    c.stroke();
  }
  captureSnapshot(i, r, l) {
    var $, q;
    if (!(
      (q = ($ = this.viewer) == null ? void 0 : $.viewer) != null && q.renderer
    ))
      return null;
    const u = this.viewer.viewer,
      s = u.renderer,
      c = this.container.clientWidth,
      f = this.container.clientHeight;
    if (f === 0) return null;
    const d = u.camera.aspect,
      h = u.camera.left,
      m = u.camera.right,
      x = u.camera.top,
      b = u.camera.bottom,
      y = s.getClearAlpha(),
      w =
        this.theme === "dark"
          ? { r: 20, g: 20, b: 20, a: 255 }
          : { r: 240, g: 240, b: 240, a: 255 },
      C = u.backgroundColor || w,
      k = (C.r << 16) | (C.g << 8) | C.b,
      z = i / r;
    if (
      u.camera.isOrthographicCamera ||
      u.camera.type === "OrthographicCamera"
    ) {
      const G = u.camera.top - u.camera.bottom,
        X = (u.camera.top + u.camera.bottom) / 2,
        R = (u.camera.right + u.camera.left) / 2,
        Z = G / 2;
      ((u.camera.top = X + Z),
        (u.camera.bottom = X - Z),
        (u.camera.left = R - Z * z),
        (u.camera.right = R + Z * z));
    } else u.camera.aspect = z;
    (u.camera.updateProjectionMatrix(),
      s.setSize(i, r, !1),
      l ? s.setClearColor(0, 0) : s.setClearColor(k, C.a / 255));
    const _ = [];
    this.planningPointMarkers.forEach((G) => {
      G.visible && ((G.visible = !1), _.push(G));
    });
    try {
      s.render(u.scene, u.camera);
    } catch (G) {
      console.error(G);
    } finally {
      _.forEach((G) => {
        G.visible = !0;
      });
    }
    const N = document.createElement("canvas");
    ((N.width = i), (N.height = r));
    const O = N.getContext("2d");
    if (!O) return null;
    O.drawImage(s.domElement, 0, 0, i, r);
    const j = Math.max(1, r / f),
      V = (G, X, R, Z) => {
        if (!window.THREE) return null;
        const S = G.clone();
        S.project(Z);
        const P = (S.x * 0.5 + 0.5) * X,
          H = (-(S.y * 0.5) + 0.5) * R;
        return { x: P, y: H, z: S.z };
      };
    if (
      (this.planningObjects.forEach((G) => {
        var X, R, Z, S;
        if (
          (G.type === "measurement" || G.type === "angle") &&
          G.visible !== !1
        ) {
          let P = null;
          if (G.type === "measurement") {
            if (G.mesh && G.mesh.position) P = G.mesh.position;
            else if (G.p1 && (G.p2Coord || G.p2)) {
              const H = G.p2Coord || G.p2;
              P = new window.THREE.Vector3(
                (G.p1.x + H.x) * 0.5,
                (G.p1.y + H.y) * 0.5,
                (G.p1.z + H.z) * 0.5,
              );
            }
          } else if (G.type === "angle") {
            const H = G.p2Coord || G.p2;
            H && (P = new window.THREE.Vector3(H.x, H.y, H.z));
          }
          if (P) {
            const H = V(P, i, r, u.camera);
            if (H && H.z < 1) {
              let I = "",
                de = "#10b981";
              G.type === "angle"
                ? ((I = G.name
                    ? `${G.name} (${G.angle.toFixed(1)}°)`
                    : `${G.angle.toFixed(1)}°`),
                  (de = G.color || "#d97706"))
                : ((I = G.name
                    ? `${G.name} (${G.baseDistance.toFixed(2)} mm)`
                    : `${G.baseDistance.toFixed(2)} mm`),
                  (de = G.color || "#10b981"));
              const te = (((X = G.cardOffset) == null ? void 0 : X.x) || 0) * j,
                D = (((R = G.cardOffset) == null ? void 0 : R.y) || 0) * j,
                M = H.x + te,
                B = H.y - 14 * j + D;
              ((Math.abs(te) > 1 || Math.abs(D) > 1) &&
                (O.save(),
                (O.strokeStyle = de),
                (O.lineWidth = 1.5 * j),
                O.setLineDash([4 * j, 3 * j]),
                O.beginPath(),
                O.moveTo(H.x, H.y),
                O.lineTo(M, B),
                O.stroke(),
                O.restore()),
                O.save(),
                (O.font = `bold ${Math.round(11 * j)}px monospace`));
              const Q = O.measureText(I).width,
                W = 11 * j,
                oe = 8 * j,
                ze = 4 * j,
                ye = Q + oe * 2,
                me = W + ze * 2,
                Ae = M - ye / 2,
                Ne = B - me / 2;
              ((O.fillStyle = "rgba(15, 23, 42, 0.9)"),
                (O.strokeStyle = de),
                (O.lineWidth = 1 * j),
                O.beginPath());
              const De = Math.min(ye, me) / 2;
              (O.roundRect
                ? O.roundRect(Ae, Ne, ye, me, De)
                : O.rect(Ae, Ne, ye, me),
                O.fill(),
                O.stroke(),
                (O.fillStyle = "#ffffff"),
                (O.textAlign = "center"),
                (O.textBaseline = "middle"),
                O.fillText(I, M, B),
                O.restore());
            }
          }
        } else if (G.type === "annotation" && G.visible !== !1) {
          let P = null;
          if (
            (G.mesh && G.mesh.position
              ? (P = G.mesh.position)
              : G.position &&
                (P = new window.THREE.Vector3(
                  G.position.x,
                  G.position.y,
                  G.position.z,
                )),
            P)
          ) {
            const H = V(P, i, r, u.camera);
            if (H && H.z < 1) {
              const I = G.text || G.name || "Annotation",
                de = G.color || "#0284c7",
                te = (((Z = G.cardOffset) == null ? void 0 : Z.x) || 0) * j,
                D = (((S = G.cardOffset) == null ? void 0 : S.y) || 0) * j,
                M = H.x + te,
                B = H.y - 14 * j + D;
              ((Math.abs(te) > 1 || Math.abs(D) > 1) &&
                (O.save(),
                (O.strokeStyle = de),
                (O.lineWidth = 1.5 * j),
                O.setLineDash([4 * j, 3 * j]),
                O.beginPath(),
                O.moveTo(H.x, H.y),
                O.lineTo(M, B),
                O.stroke(),
                O.restore()),
                O.save(),
                (O.font = `bold ${Math.round(11 * j)}px system-ui, sans-serif`));
              const Q = O.measureText(I).width,
                W = 11 * j,
                oe = 8 * j,
                ze = 4 * j,
                ye = Q + oe * 2,
                me = W + ze * 2,
                Ae = M - ye / 2,
                Ne = B - me / 2;
              ((O.fillStyle = "rgba(15, 23, 42, 0.9)"),
                (O.strokeStyle = de),
                (O.lineWidth = 1 * j),
                O.beginPath());
              const De = Math.min(ye, me) / 2;
              (O.roundRect
                ? O.roundRect(Ae, Ne, ye, me, De)
                : O.rect(Ae, Ne, ye, me),
                O.fill(),
                O.stroke(),
                (O.fillStyle = "#ffffff"),
                (O.textAlign = "center"),
                (O.textBaseline = "middle"),
                O.fillText(I, M, B),
                O.restore());
            }
          }
        }
      }),
      this.rulersVisible)
    ) {
      const G = Math.max(1, r / f),
        X = Math.round(24 * G);
      try {
        const R = u.navigation.GetCamera();
        if (R && R.eye && R.center) {
          const Z = R.eye.x - R.center.x,
            S = R.eye.y - R.center.y,
            P = R.eye.z - R.center.z,
            H = Math.sqrt(Z * Z + S * S + P * P),
            I = 45 * (Math.PI / 180),
            de = 2 * H * Math.tan(I / 2),
            te = r / de,
            M = (60 * G) / te;
          if (M > 0 && isFinite(M)) {
            const B = Math.floor(Math.log10(M)),
              A = Math.pow(10, B),
              Q = M / A;
            let W = 1;
            (Q > 5 ? (W = 10) : Q > 2 ? (W = 5) : Q > 1 && (W = 2), (W *= A));
            const oe = document.createElement("canvas");
            ((oe.width = i - X), (oe.height = X));
            const ze = document.createElement("canvas");
            ((ze.width = X),
              (ze.height = r - X),
              this.renderRulerCanvas(oe, !0, te, W, G),
              this.renderRulerCanvas(ze, !1, te, W, G),
              (O.fillStyle = this.theme === "dark" ? "#333333" : "#fafafa"),
              O.fillRect(0, 0, X, X),
              (O.strokeStyle = this.theme === "dark" ? "#555555" : "#e0e0e0"),
              (O.lineWidth = 1 * G),
              O.strokeRect(0, 0, X, X),
              (O.fillStyle = this.theme === "dark" ? "#aaaaaa" : "#888888"),
              (O.font = `bold ${Math.round(9 * G)}px sans-serif`),
              (O.textAlign = "center"),
              (O.textBaseline = "middle"),
              O.fillText("mm", X / 2, X / 2),
              O.drawImage(oe, X, 0),
              O.drawImage(ze, 0, X));
          }
        }
      } catch {}
    }
    const U = N.toDataURL("image/png");
    (u.camera.isOrthographicCamera || u.camera.type === "OrthographicCamera"
      ? ((u.camera.left = h),
        (u.camera.right = m),
        (u.camera.top = x),
        (u.camera.bottom = b))
      : (u.camera.aspect = d),
      u.camera.updateProjectionMatrix(),
      s.setSize(c, f, !1),
      s.setClearColor(k, y));
    try {
      u.Render();
    } catch {}
    return U;
  }
  capture360Snapshots(i, r, l) {
    var b, y, w, C, k, z, _, N;
    if (!(
      (y = (b = this.viewer) == null ? void 0 : b.viewer) != null &&
      y.navigation
    ))
      return [];
    const u = this.viewer.viewer,
      s = u.navigation;
    let c = null;
    if (typeof s.GetCamera == "function") c = s.GetCamera();
    else if (s.camera) {
      const O = s.camera;
      c = new window.OV.Camera(
        new window.OV.Coord3D(O.position.x, O.position.y, O.position.z),
        new window.OV.Coord3D(
          ((C = (w = s.controls) == null ? void 0 : w.target) == null
            ? void 0
            : C.x) || 0,
          ((z = (k = s.controls) == null ? void 0 : k.target) == null
            ? void 0
            : z.y) || 0,
          ((N = (_ = s.controls) == null ? void 0 : _.target) == null
            ? void 0
            : N.z) || 0,
        ),
        new window.OV.Coord3D(O.up.x, O.up.y, O.up.z),
        O.fov || 45,
      );
    }
    if (!c) return [];
    const f = [],
      d = c.eye,
      h = c.center,
      m = c.up,
      x = c.fov || 45;
    if (!window.THREE) return [];
    try {
      for (let O = 0; O < 6; O++) {
        const j = O * 60,
          V = (j * Math.PI) / 180,
          U = new window.THREE.Vector3(d.x - h.x, d.y - h.y, d.z - h.z),
          $ = new window.THREE.Vector3(m.x, m.y, m.z).normalize();
        U.applyAxisAngle($, V);
        const q = new window.THREE.Vector3(h.x, h.y, h.z).add(U),
          G = new window.OV.Camera(
            new window.OV.Coord3D(q.x, q.y, q.z),
            new window.OV.Coord3D(h.x, h.y, h.z),
            new window.OV.Coord3D(m.x, m.y, m.z),
            x,
          );
        (s.SetCamera(G), u.Render());
        const X = this.captureSnapshot(i, r, l);
        X && f.push({ angle: j, dataUrl: X });
      }
    } catch (O) {
      console.error("Failed during 360 snapshots rotation", O);
    } finally {
      try {
        const O = new window.OV.Coord3D(d.x, d.y, d.z),
          j = new window.OV.Coord3D(h.x, h.y, h.z),
          V = new window.OV.Coord3D(m.x, m.y, m.z);
        (s.SetCamera(new window.OV.Camera(O, j, V, x)), u.Render());
      } catch (O) {
        console.warn("Could not restore camera state:", O);
      }
    }
    return f;
  }
}
