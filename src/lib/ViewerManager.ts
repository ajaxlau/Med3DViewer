import { disposeHierarchy, isSafeModelUrl } from './utils';
import { detectGpuCapabilities, GpuCapabilities } from './gpuDetection';

declare global {
  interface Window {
    OV: any;
    THREE: any;
  }
}

export interface FlyThroughState {
  active: boolean;
  isPlaying: boolean;
  curveId: string | null;
  curveName: string | null;
  progress: number;
  speed: number;
  direction: 1 | -1;
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
  curveId: string | null;
  curveName: string | null;
  progress: number;
  totalDistance: number;
  currentDistance: number;
  invert: boolean;
  alignCamera: boolean;
  zoomLevel: number;
}

export interface ModelStats {
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  dimensions: { x: number; y: number; z: number };
  boundingBox: { min: [number, number, number]; max: [number, number, number] } | null;
  materialCount: number;
  fileFormat: string;
  filename: string | null;
}

export interface ViewerManagerConfig {
  onStatusChange: (status: string, isEmpty: boolean, filename?: string, url?: string | null) => void;
  onProgressChange?: (progress: number) => void;
  onMeshesChange: (meshes: { id: number, name: string, visible: boolean, opacity: number }[]) => void;
  onMeshHighlighted: (id: number | null) => void;
  onPlanningObjectsChange?: (objects: any[]) => void;
  onPlanningPointsChange?: (count: number) => void;
  onMeasurementChange?: (measurement: { distance: number, angle: number } | null) => void;
  onPlanningGroupsChange?: (groups: any[]) => void;
  onTransformActiveChange?: (active: boolean, objId?: string) => void;
  onTransformModeChange?: (mode: string) => void;
  onPlanningModeChange?: (mode: string, resnapId?: string | null) => void;
  onFlyThroughStateChange?: (state: FlyThroughState) => void;
  onSplineClippingStateChange?: (state: SplineClippingState) => void;
  onGpuTierChange?: (tier: 'webgpu' | 'webgl2' | 'unsupported') => void;
  onContextLostChange?: (lost: boolean) => void;
}

function escapeHtml(unsafe: string) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

export class ViewerManager {
  container: HTMLElement;
  viewer: any;
  config: ViewerManagerConfig;

  currentMeshes: any[] = [];
  theme: 'light' | 'dark' = 'light';
  originalColors: Map<any, any> = new Map();
  highlightedMesh: any = null;
  treeParseInterval: any = null;
  transformControl: any = null;
  onTransformBlockNav: any = null;

  // Planning Tools state
  planningMode: 'none' | 'plane' | 'cylinder' | 'measure' | 'curve' | 'angle' | 'point' | 'annotation' = 'none';
  resnappingAnnotationId: string | null = null;
  planningPoints: any[] = [];
  planningNormals: any[] = [];
  planningPointMarkers: any[] = [];
  planningObjects: any[] = [];
  planningGroups: any[] = [];
  nextPlanningObjectId: number = 1;
  defaultCamera: any = null;
  loadedFilename: string | null = null;
  loadedUrl: string | null = null;

  // Clipping state
  modelBBox: any = null;

  // Snapshot & Rulers
  topRulerRef: HTMLCanvasElement | null = null;
  leftRulerRef: HTMLCanvasElement | null = null;
  rulersVisible: boolean = false;
  isAutoRotating: boolean = false;
  rulerAnimationFrame: any = null;
  lastPlanesState: any = null;
  lastCameraState: string = '';
  forceNextOverlayUpdate: boolean = true;
  gpuCapabilities: GpuCapabilities | null = null;
  onContextLostHandler: any = null;
  onContextRestoredHandler: any = null;

  // Rotation Visual Cue state
  isRotatingTool: boolean = false;
  rotationCueGroup: any = null;
  rotationBadgeDiv: HTMLDivElement | null = null;
  rotationStartQuat: any = null;
  rotationStartPos: any = null;
  rotationAxisName: string | null = null;

  // Translation Visual Cue state
  isTranslatingTool: boolean = false;
  translationCueGroup: any = null;
  translationBadgeDiv: HTMLDivElement | null = null;
  translationStartPos: any = null;
  translationAxisName: string | null = null;

  // Smart Ghosting / Focus-X-Ray State
  isGhostingMode: boolean = false;
  ghostedOriginals: Map<any, { color: number | null, opacity: number, transparent: boolean, depthWrite: boolean, emissive: number | null, map: any, roughness: number | null, metalness: number | null, shininess?: number | null, specular?: number | null, vertexColors?: any }> = new Map();

  // Curved Anatomical Fly-Through (Virtual Endoscopy / Vessel Probe) State
  flyThroughState: FlyThroughState = {
    active: false,
    isPlaying: false,
    curveId: null,
    curveName: null,
    progress: 0,
    speed: 1.0,
    direction: 1,
    loop: true,
    fov: 75,
    showReticle: true,
    totalDistance: 0,
    currentDistance: 0,
    yawOffset: 0,
    pitchOffset: 0,
    pathOffsetX: 0,
    pathOffsetY: 0
  };
  preFlyThroughCamera: any = null;
  preFlyThroughNear: number | null = null;
  preFlyThroughFov: number | null = null;
  lastFlyThroughTimestamp: number = 0;
  flyThroughUpVector: any = null;

  // Curved Spline Cross-Section Clipping State
  splineClippingState: SplineClippingState = {
    active: false,
    curveId: null,
    curveName: null,
    progress: 0.5,
    totalDistance: 0,
    currentDistance: 0,
    invert: false,
    alignCamera: false,
    zoomLevel: 1.0
  };
  splineClipPlane: any = null;
  preSplineClipCamera: any = null;

  // Memory Leak Prevention & Disposal tracking
  isDisposed: boolean = false;
  resizeObserver: ResizeObserver | null = null;
  onPointerDown: ((e: PointerEvent) => void) | null = null;
  onPointerUp: ((e: PointerEvent) => void) | null = null;
  annotationSvgOverlay: SVGSVGElement | null = null;

  constructor(container: HTMLElement, config: ViewerManagerConfig) {
    this.container = container;
    this.config = config;

    // Polyfill to prevent generic Three.js errors from o3dv conflicts
    if (window.THREE && !window.THREE.Object3D.prototype.removeFromParent) {
      window.THREE.Object3D.prototype.removeFromParent = function () {
        if (this.parent !== null) {
          this.parent.remove(this);
        }
      };
    }

    this.initViewer();
    this.setupRaycaster();
  }

  setTheme(theme: 'light' | 'dark', forceTransparentBg: boolean = false) {
    this.theme = theme;
    this.lastCameraState = '';
    if (this.viewer && this.viewer.viewer) {
      if (forceTransparentBg) {
        try {
          if (this.viewer.viewer.renderer) {
            this.viewer.viewer.renderer.setClearAlpha(0);
            this.viewer.viewer.Render();
          }
        } catch(e) {}
      } else {
        const color = theme === 'dark' 
          ? new window.OV.RGBAColor(2, 6, 23, 255) 
          : new window.OV.RGBAColor(255, 255, 255, 255);
        try { 
          this.viewer.viewer.SetBackgroundColor(color); 
          if (this.viewer.viewer.renderer) {
            this.viewer.viewer.renderer.setClearAlpha(1);
          }
          this.viewer.viewer.Render(); 
        } catch(e) {}
      }
    }
  }

  setRulerCanvases(top: HTMLCanvasElement, left: HTMLCanvasElement) {
    this.topRulerRef = top;
    this.leftRulerRef = left;
  }

  initViewer() {
    if (this.viewer) return;
    try {
      if (window.OV && window.OV.SetExternalLibLocation) {
         window.OV.SetExternalLibLocation('https://cdn.jsdelivr.net/npm/online-3d-viewer@0.18.0/build/libs');
      }
      
      const bgColor = this.theme === 'dark' 
        ? new window.OV.RGBAColor(2, 6, 23, 255) 
        : new window.OV.RGBAColor(255, 255, 255, 255);

      this.viewer = new window.OV.EmbeddedViewer(this.container, {
        backgroundColor: bgColor,
        defaultColor: new window.OV.RGBColor(200, 200, 200),
        edgeSettings: new window.OV.EdgeSettings(false, new window.OV.RGBColor(0, 0, 0), 1),
      });
      this.enforceFreeOrbit();

      this.initTransformControls();

      // Initialize GPU tier adaptation and context loss protection
      detectGpuCapabilities().then((caps) => {
        this.gpuCapabilities = caps;
        if (this.config.onGpuTierChange) {
          this.config.onGpuTierChange(caps.tier);
        }
        this.applyGpuTierSettings();
      }).catch((err) => {
        console.warn('[ViewerManager] GPU capability detection error:', err);
      });

      this.resizeObserver = new ResizeObserver(() => {
        if (this.viewer) this.viewer.Resize();
        if (this.rulersVisible) {
          this.resizeRulers();
          this.lastCameraState = '';
        }
      });
      this.resizeObserver.observe(this.container);

      // Start the DOM overlay rendering loop
      this.domUpdateLoop();
    } catch (e) {
      console.error("Viewer initialization failed:", e);
    }
  }

  applyGpuTierSettings() {
    if (!this.viewer?.viewer?.renderer) return;
    const renderer = this.viewer.viewer.renderer;
    const caps = this.gpuCapabilities;
    
    // Scale device pixel ratio for lower power/legacy hardware to optimize fill-rate and prevent context loss
    if (typeof renderer.setPixelRatio === 'function') {
      let maxDpr = 2.0;
      if (!caps || caps.tier === 'unsupported' || caps.architecture === 'Legacy WebGL') {
        maxDpr = 1.0;
      } else if (caps.tier === 'webgl2') {
        maxDpr = 1.5;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    }

    // Attach WebGL context loss recovery handlers
    const domElement = renderer.domElement;
    if (domElement && !this.onContextLostHandler) {
      this.onContextLostHandler = (event: Event) => {
        event.preventDefault();
        console.warn('[ViewerManager] WebGL context lost. Suspending render operations.');
        if (this.config.onContextLostChange) {
          this.config.onContextLostChange(true);
        }
      };
      this.onContextRestoredHandler = () => {
        console.info('[ViewerManager] WebGL context restored. Re-initializing scene.');
        if (this.config.onContextLostChange) {
          this.config.onContextLostChange(false);
        }
        if (this.viewer?.viewer) {
          try { this.viewer.viewer.Render(); } catch (e) {}
        }
      };

      domElement.addEventListener('webglcontextlost', this.onContextLostHandler, false);
      domElement.addEventListener('webglcontextrestored', this.onContextRestoredHandler, false);
    }
  }

  getRadialSegments(high = 32, medium = 16, low = 12): number {
    if (!this.gpuCapabilities || this.gpuCapabilities.tier === 'unsupported' || this.gpuCapabilities.architecture === 'Legacy WebGL') {
      return low;
    }
    if (this.gpuCapabilities.isFallback) {
      return medium;
    }
    return high;
  }

  enforceFreeOrbit() {
    if (!this.viewer || !this.viewer.viewer || !this.viewer.viewer.navigation) return;
    try {
      if (typeof this.viewer.viewer.navigation.SetNavigationMode === 'function') {
        const freeOrbitMode = (window.OV && window.OV.NavigationMode && window.OV.NavigationMode.FreeOrbit) ? window.OV.NavigationMode.FreeOrbit : 2;
        this.viewer.viewer.navigation.SetNavigationMode(freeOrbitMode);
      } else {
        this.viewer.viewer.navigation.fixUpVector = false;
        this.viewer.viewer.navigation.navigationMode = 2; // Assuming FreeOrbit is 2
      }
      
      // We should ensure fixUpVector is turned off for continuous orbit rotation.
      this.viewer.viewer.navigation.fixUpVector = false;
      
      // Force Z up vector without fixing it so the user can orbit freely continuously
      if (typeof this.viewer.viewer.SetUpVector === 'function') {
         this.viewer.viewer.SetUpVector(3, false); // 3 = Direction.Z
      }
    } catch (error) {}
    if (this.viewer.viewer.scene) {
      try { this.viewer.viewer.Render(); } catch(e) {}
    }
  }

  initTransformControls() {
    if (!window.THREE || !window.THREE.TransformControls || !this.viewer?.viewer?.camera || !this.viewer?.viewer?.renderer) return;
    const v = this.viewer.viewer;
    const scene = v.scene || v.mainScene;
    if (!scene) return;

    if (this.transformControl) {
        scene.remove(this.transformControl);
        scene.add(this.transformControl);
        return;
    }

    if (v.navigation && !v.navigation._patchedForTransform) {
        v.navigation._patchedForTransform = true;
        const origOrbit = v.navigation.Orbit;
        if (typeof origOrbit === 'function') {
            v.navigation.Orbit = function(x: number, y: number) {
                if (v.navigation.isTransforming) return;
                origOrbit.call(this, x, y);
            };
        }
        const origPan = v.navigation.Pan;
        if (typeof origPan === 'function') {
            v.navigation.Pan = function(x: number, y: number) {
                if (v.navigation.isTransforming) return;
                origPan.call(this, x, y);
            };
        }
        const origZoom = v.navigation.Zoom;
        if (typeof origZoom === 'function') {
            v.navigation.Zoom = function(val: number) {
                if (v.navigation.isTransforming) return;
                origZoom.call(this, val);
            };
        }
    }

    this.transformControl = new window.THREE.TransformControls(v.camera, v.renderer.domElement);
    this.transformControl.setSpace('local');
    this.transformControl.userData = this.transformControl.userData || {};
    this.transformControl.userData.isCustomOverlay = true;
    
    scene.add(this.transformControl);

    // Block online3dviewer navigation if hovering over transform gizmo
    if (!this.onTransformBlockNav) {
        this.onTransformBlockNav = (e: Event) => {
            if (this.transformControl && this.transformControl.axis !== null) {
                e.stopPropagation();
            }
        };
    }
    
    if (v.renderer?.domElement) {
        v.renderer.domElement.addEventListener('mousedown', this.onTransformBlockNav, true);
        v.renderer.domElement.addEventListener('touchstart', this.onTransformBlockNav, true);
    }
    
    const broadcastTransformChange = () => {
        if (!this.transformControl || !this.transformControl.object) return;
        const mesh = this.transformControl.object as any;
        const index = this.planningObjects.findIndex(o => o.mesh === mesh);
        if (index !== -1) {
            const oldObj = this.planningObjects[index];
            const THREE = window.THREE;
            let outPos = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
            let outQuat = { x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w };
            
            if (THREE) {
                const modelRoot = this.getModelRoot();
                let m = mesh.matrixWorld.clone();
                if (modelRoot) {
                    modelRoot.updateMatrixWorld?.(true);
                    const invMain = modelRoot.matrixWorld.clone().invert();
                    m.premultiply(invMain);
                }
                const pos = new THREE.Vector3();
                const quat = new THREE.Quaternion();
                const scale = new THREE.Vector3();
                m.decompose(pos, quat, scale);
                outPos = { x: pos.x, y: pos.y, z: pos.z };
                outQuat = { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
            }

            const newObj = {
                ...oldObj,
                posX: outPos.x,
                posY: outPos.y,
                posZ: outPos.z,
                rotQx: outQuat.x,
                rotQy: outQuat.y,
                rotQz: outQuat.z,
                rotQw: outQuat.w
            };
            this.planningObjects[index] = newObj;
        }
    };

    this.transformControl.addEventListener('change', () => {
        try { 
            if (this.transformControl && this.transformControl.object) {
                this.transformControl.object.updateMatrixWorld?.(true);
            }
            v.Render(); 
        } catch(e){}
        broadcastTransformChange();
        if (this.isRotatingTool) {
            this.updateRotationVisualCue();
        }
        if (this.isTranslatingTool) {
            this.updateTranslationVisualCue();
        }
        if (this.config.onPlanningObjectsChange) {
            this.config.onPlanningObjectsChange([...this.planningObjects]);
        }
    });
    this.transformControl.addEventListener('dragging-changed', (event: any) => {
       if (v.navigation) {
           v.navigation.isTransforming = event.value;
       }
       if (event.value) {
           if (this.transformControl && this.transformControl.object) {
               if (this.transformControl.mode === 'rotate') {
                   this.startRotationVisualCue();
               } else if (this.transformControl.mode === 'translate') {
                   this.startTranslationVisualCue();
               }
           }
       } else {
           this.clearRotationVisualCue();
           this.clearTranslationVisualCue();
           broadcastTransformChange();
           if (this.config.onPlanningObjectsChange) {
               this.config.onPlanningObjectsChange([...this.planningObjects]);
           }
           this.saveToLocalStorage();
       }
    });
  }

  fitToWindow() {
    if (this.viewer && typeof this.viewer.FitToWindow === 'function') {
      this.viewer.FitToWindow();
    } else if (this.viewer && this.viewer.viewer && typeof this.viewer.viewer.FitToWindow === 'function') {
      this.viewer.viewer.FitToWindow();
    }
  }

  tweenCamera(targetCamera: any, durationMs: number = 400) {
    if (!this.viewer?.viewer?.navigation) return;
    const nav = this.viewer.viewer.navigation;
    
    let startCam: any = null;
    if (typeof nav.GetCamera === 'function') {
        startCam = nav.GetCamera();
    } else if (nav.camera) {
        const threeCam = nav.camera;
        startCam = new window.OV.Camera(
            new window.OV.Coord3D(threeCam.position.x, threeCam.position.y, threeCam.position.z),
            new window.OV.Coord3D(nav.controls?.target?.x || 0, nav.controls?.target?.y || 0, nav.controls?.target?.z || 0),
            new window.OV.Coord3D(threeCam.up.x, threeCam.up.y, threeCam.up.z),
            threeCam.fov || 45.0
        );
    }
    
    if (!startCam) {
        nav.SetCamera(targetCamera);
        if (this.viewer.viewer.scene) {
            try { this.viewer.viewer.Render(); } catch(e) {}
        }
        return;
    }
    
    const startTime = performance.now();
    const animate = (time: number) => {
        const elapsed = time - startTime;
        let t = Math.min(elapsed / durationMs, 1.0);
        
        // easeInOutQuad
        t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        
        const eye = new window.OV.Coord3D(
            startCam.eye.x + (targetCamera.eye.x - startCam.eye.x) * t,
            startCam.eye.y + (targetCamera.eye.y - startCam.eye.y) * t,
            startCam.eye.z + (targetCamera.eye.z - startCam.eye.z) * t
        );
        const center = new window.OV.Coord3D(
            startCam.center.x + (targetCamera.center.x - startCam.center.x) * t,
            startCam.center.y + (targetCamera.center.y - startCam.center.y) * t,
            startCam.center.z + (targetCamera.center.z - startCam.center.z) * t
        );
        const up = new window.OV.Coord3D(
            startCam.up.x + (targetCamera.up.x - startCam.up.x) * t,
            startCam.up.y + (targetCamera.up.y - startCam.up.y) * t,
            startCam.up.z + (targetCamera.up.z - startCam.up.z) * t
        );
        
        const fov = startCam.fov + (targetCamera.fov - startCam.fov) * t;
        
        nav.SetCamera(new window.OV.Camera(eye, center, up, fov));
        if (this.viewer.viewer.scene) {
            try { this.viewer.viewer.Render(); } catch(e) {}
        }
        
        if (t < 1.0) {
            requestAnimationFrame(animate);
        }
    };
    
    requestAnimationFrame(animate);
  }

  resetCamera() {
    if (this.viewer && this.viewer.viewer && this.viewer.viewer.navigation && this.defaultCamera) {
      const targetCamera = new window.OV.Camera(
          new window.OV.Coord3D(this.defaultCamera.eye.x, this.defaultCamera.eye.y, this.defaultCamera.eye.z),
          new window.OV.Coord3D(this.defaultCamera.center.x, this.defaultCamera.center.y, this.defaultCamera.center.z),
          new window.OV.Coord3D(this.defaultCamera.up.x, this.defaultCamera.up.y, this.defaultCamera.up.z),
          this.defaultCamera.fov || 45.0
      );
      this.tweenCamera(targetCamera, 500);
    } else {
      this.fitToWindow();
    }
  }

  setView(view: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right') {
    if (!this.viewer?.viewer?.navigation) return;
    const nav = this.viewer.viewer.navigation;
    
    let center = new window.OV.Coord3D(0, 0, 0);
    let distance = 100;
    
    let originalCam: any = null;
    if (typeof nav.GetCamera === 'function') {
        originalCam = nav.GetCamera();
    } else if (nav.camera) {
        const threeCam = nav.camera;
        originalCam = new window.OV.Camera(
            new window.OV.Coord3D(threeCam.position.x, threeCam.position.y, threeCam.position.z),
            new window.OV.Coord3D(nav.controls?.target?.x || 0, nav.controls?.target?.y || 0, nav.controls?.target?.z || 0),
            new window.OV.Coord3D(threeCam.up.x, threeCam.up.y, threeCam.up.z),
            threeCam.fov || 45.0
        );
    }
    
    if (originalCam) {
        center = originalCam.center;
        const dx = originalCam.eye.x - center.x;
        const dy = originalCam.eye.y - center.y;
        const dz = originalCam.eye.z - center.z;
        distance = Math.sqrt(dx*dx + dy*dy + dz*dz) || 100;
    }
    
    let eye = new window.OV.Coord3D(0, 0, 0);
    let up = new window.OV.Coord3D(0, 0, 1);
    
    switch (view) {
        case 'top':
            eye = new window.OV.Coord3D(center.x, center.y, center.z + distance);
            up = new window.OV.Coord3D(0, 1, 0);
            break;
        case 'bottom':
            eye = new window.OV.Coord3D(center.x, center.y, center.z - distance);
            up = new window.OV.Coord3D(0, -1, 0);
            break;
        case 'front':
            eye = new window.OV.Coord3D(center.x, center.y - distance, center.z);
            up = new window.OV.Coord3D(0, 0, 1);
            break;
        case 'back':
            eye = new window.OV.Coord3D(center.x, center.y + distance, center.z);
            up = new window.OV.Coord3D(0, 0, 1);
            break;
        case 'left':
            eye = new window.OV.Coord3D(center.x - distance, center.y, center.z);
            up = new window.OV.Coord3D(0, 0, 1);
            break;
        case 'right':
            eye = new window.OV.Coord3D(center.x + distance, center.y, center.z);
            up = new window.OV.Coord3D(0, 0, 1);
            break;
    }
    
    const targetCamera = new window.OV.Camera(eye, center, up, originalCam?.fov || 45.0);
    this.tweenCamera(targetCamera, 500);
  }

  resetWorkspace() {
    // 1. Halt fly-through tour if active
    if (this.flyThroughState.active) {
      this.stopFlyThrough();
    }

    // 2. Clear loaded-model tree builds or parsing polling intervals
    if (this.treeParseInterval) {
      clearInterval(this.treeParseInterval);
      this.treeParseInterval = null;
    }

    // 3. Detach & dispose TransformControls and visual cues
    this.clearRotationVisualCue();
    this.clearTranslationVisualCue();
    if (this.transformControl) {
      try {
        this.transformControl.detach();
      } catch (e) {}
    }
    this.highlightPlanningMesh(null);
    if (this.config.onTransformActiveChange) {
      this.config.onTransformActiveChange(false, null);
    }

    // 4. Clear all custom planning objects, points, labels, and groups
    try {
      this.clearAllPlanningObjects(false);
      this.clearPlanningPoints();
    } catch (e) {
      console.warn("Disposal of planning items failed:", e);
    }
    this.planningGroups = [];
    this.notifyGroupsChanged();

    // 5. Remove persisted localStorage planning objects for the current model
    try {
      if (this.loadedFilename) {
        localStorage.removeItem(`3dpo_planning_objects_${this.loadedFilename}`);
        localStorage.removeItem(`3dpo_planning_groups_${this.loadedFilename}`);
      }
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('3dpo_planning_')) {
          localStorage.removeItem(k);
        }
      });
    } catch (e) {}

    // 6. Revert ghosting mode, clear highlights, reset explode
    this.revertGhostingMode();
    this.clearHighlight();
    this.originalColors.clear();
    this.ghostedOriginals.clear();
    this.currentMeshes = [];
    this.defaultCamera = null;
    this.lastPlanesState = null;
    this.modelBBox = null;
    this.lastCameraState = '';
    this.setAutoRotate(false);

    // 7. Clear general WebGL model in embedded viewer
    if (this.viewer) {
      try {
        if (typeof this.viewer.Clear === 'function') {
          this.viewer.Clear();
        }
      } catch (e) {
        console.warn("Failed clearing embedded 3d viewer core", e);
      }
      
      // Remove any lingering custom objects from scene
      try {
        const scene = this.viewer.viewer?.scene || this.viewer.viewer?.mainScene;
        if (scene) {
          const customObjects: any[] = [];
          scene.traverse((child: any) => {
            if (this.isCustomOverlay(child)) {
              customObjects.push(child);
            }
          });
          customObjects.forEach((obj) => {
            try {
              scene.remove(obj);
              if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
              if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((m: any) => { if (m && typeof m.dispose === 'function') m.dispose(); });
              }
            } catch (e) {}
          });
        }
      } catch (e) {}

      // Re-apply clean theme background & render empty scene
      try {
        this.setTheme(this.theme, false);
        this.enforceFreeOrbit();
        if (this.viewer.viewer) {
          this.viewer.viewer.Render();
        }
      } catch (e) {}
    }

    // 8. Clear ruler canvases
    if (this.topRulerRef && this.leftRulerRef) {
      const topCtx = this.topRulerRef.getContext('2d');
      if (topCtx) topCtx.clearRect(0, 0, this.topRulerRef.width, this.topRulerRef.height);
      const leftCtx = this.leftRulerRef.getContext('2d');
      if (leftCtx) leftCtx.clearRect(0, 0, this.leftRulerRef.width, this.leftRulerRef.height);
    }

    // 9. Reset tracking flags and notify callbacks
    this.loadedFilename = null;
    this.loadedUrl = null;

    this.config.onStatusChange('No model loaded.\nPlease open a file.', true, null, null);
    if (this.config.onProgressChange) this.config.onProgressChange(0);
    if (this.config.onMeshesChange) this.config.onMeshesChange([]);
    if (this.config.onMeshHighlighted) this.config.onMeshHighlighted(null);
    if (this.config.onPlanningObjectsChange) this.config.onPlanningObjectsChange([]);
    if (this.config.onPlanningGroupsChange) this.config.onPlanningGroupsChange([]);
    if (this.config.onPlanningPointsChange) this.config.onPlanningPointsChange(0);
    if (this.config.onMeasurementChange) this.config.onMeasurementChange(null);
    this.flyThroughState = {
      active: false,
      isPlaying: false,
      curveId: null,
      curveName: null,
      progress: 0,
      speed: 1.0,
      direction: 1,
      loop: true,
      fov: 75,
      showReticle: true,
      totalDistance: 0,
      currentDistance: 0,
      yawOffset: 0,
      pitchOffset: 0,
      pathOffsetX: 0,
      pathOffsetY: 0
    };
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  dispose() {
    this.isDisposed = true;

    if (this.flyThroughState.active) {
      this.stopFlyThrough();
    }

    // 1. Clear loaded-model tree builds or parsing polling intervals
    if (this.treeParseInterval) {
      clearInterval(this.treeParseInterval);
      this.treeParseInterval = null;
    }

    // 2. Halt dynamic rulers & measurement overlay drawing loop
    if (this.rulerAnimationFrame) {
      cancelAnimationFrame(this.rulerAnimationFrame);
      this.rulerAnimationFrame = null;
    }

    // 4. Disconnect ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // 5. Clean up pointer events targeting container element
    if (this.container) {
      if (this.onPointerDown) {
        this.container.removeEventListener('pointerdown', this.onPointerDown, { capture: true } as EventListenerOptions);
        this.onPointerDown = null;
      }
      if (this.onPointerUp) {
        this.container.removeEventListener('pointerup', this.onPointerUp, { capture: true } as EventListenerOptions);
        this.onPointerUp = null;
      }
    }

    // 6. Dispose existing planning objects to empty WebGL buffers
    try {
      this.clearAllPlanningObjects();
      this.clearPlanningPoints();
    } catch (e) {
      console.warn("Disposal failed on custom planning items", e);
    }
    
    // 6.5 Dispose TransformControls properly
    this.clearRotationVisualCue();
    this.clearTranslationVisualCue();
    if (this.transformControl) {
        if (this.viewer && this.viewer.viewer) {
            const v = this.viewer.viewer;
            const scene = v.scene || v.mainScene;
            if (scene) {
                scene.remove(this.transformControl);
            }
            if (v.renderer && v.renderer.domElement && this.onTransformBlockNav) {
                v.renderer.domElement.removeEventListener('mousedown', this.onTransformBlockNav, true);
                v.renderer.domElement.removeEventListener('touchstart', this.onTransformBlockNav, true);
            }
        }
        if (typeof this.transformControl.dispose === 'function') {
            try { this.transformControl.dispose(); } catch(e) {}
        }
        this.transformControl = null;
        this.onTransformBlockNav = null;
    }

    // 6.6 Clear cached color maps, meshes, and references
    this.revertGhostingMode();
    this.originalColors.clear();
    this.ghostedOriginals.clear();
    this.currentMeshes = [];
    this.defaultCamera = null;
    this.lastPlanesState = null;
    this.modelBBox = null;
    this.topRulerRef = null;
    this.leftRulerRef = null;

    // 7. Clear general WebGL context and references in embedded viewer
    if (this.viewer) {
      if (this.viewer?.viewer?.renderer?.domElement) {
        const dom = this.viewer.viewer.renderer.domElement;
        if (this.onContextLostHandler) dom.removeEventListener('webglcontextlost', this.onContextLostHandler, false);
        if (this.onContextRestoredHandler) dom.removeEventListener('webglcontextrestored', this.onContextRestoredHandler, false);
      }
      this.onContextLostHandler = null;
      this.onContextRestoredHandler = null;

      try {
        if (typeof this.viewer.Clear === 'function') {
          this.viewer.Clear();
        }
      } catch (e) {
        console.warn("Disposal failed on embedded 3d viewer core", e);
      }
      this.viewer = null;
    }

    // 8. Nullify global window helper binding
    if (window._viewerManagerInstance === this) {
      window._viewerManagerInstance = null;
    }
  }

  saveToLocalStorage() {
    if (!this.loadedFilename) return;
    try {
      const serialized = this.planningObjects.map(obj => {
        const base = {
          id: obj.id,
          name: obj.name,
          type: obj.type,
          color: obj.color,
          groupId: obj.groupId,
          visible: obj.visible !== false,
          cardOffset: obj.cardOffset ? { x: Math.round(obj.cardOffset.x), y: Math.round(obj.cardOffset.y) } : { x: 0, y: 0 },
          posX: obj.mesh?.position?.x,
          posY: obj.mesh?.position?.y,
          posZ: obj.mesh?.position?.z,
          rotQx: obj.mesh?.quaternion?.x,
          rotQy: obj.mesh?.quaternion?.y,
          rotQz: obj.mesh?.quaternion?.z,
          rotQw: obj.mesh?.quaternion?.w,
          scaleX: obj.mesh?.scale?.x,
          scaleY: obj.mesh?.scale?.y,
          scaleZ: obj.mesh?.scale?.z
        };
        if (obj.type === 'plane') {
          return {
            ...base,
            p1: obj.p1,
            p2: obj.p2,
            p3: obj.p3,
            extWidth: obj.extWidth,
            extLength: obj.extLength,
            thickness: obj.thickness
          };
        } else if (obj.type === 'cylinder') {
          return {
            ...base,
            p1: obj.p1,
            p2: obj.p2,
            diameter: obj.diameter,
            extension: obj.extension
          };
        } else if (obj.type === 'curve') {
          return {
            ...base,
            points: obj.points,
            thickness: obj.thickness
          };
        } else if (obj.type === 'measurement') {
          return {
            ...base,
            p1: obj.p1,
            p2Coord: obj.p2Coord,
            angle: obj.angle
          };
        } else if (obj.type === 'angle') {
          return {
            ...base,
            p1: obj.p1,
            p2Coord: obj.p2Coord,
            p3: obj.p3,
            angle: obj.angle
          };
        } else if (obj.type === 'point') {
          return {
            ...base,
            points: obj.points,
            diameter: obj.diameter
          };
        } else if (obj.type === 'annotation') {
          return {
            ...base,
            text: obj.text,
            description: obj.description,
            position: obj.position,
            normal: obj.normal,
            pinSize: obj.pinSize,
            cardOffset: obj.cardOffset
          };
        } else if (obj.type === 'custom_model') {
          return {
            ...base,
            fileName: obj.fileName,
            fileDataURL: obj.fileDataURL
          };
        }
        return base;
      });
      localStorage.setItem(`3dpo_planning_objects_${this.loadedFilename}`, JSON.stringify(serialized));
      localStorage.setItem(`3dpo_planning_groups_${this.loadedFilename}`, JSON.stringify(this.planningGroups));
    } catch (e) {
      console.warn("Failed to save planning objects to localStorage", e);
    }
  }

  async loadFromLocalStorage() {
    if (!this.loadedFilename) return;
    try {
      this.clearAllPlanningObjects(false);

      // Load groups first
      const groupsStr = localStorage.getItem(`3dpo_planning_groups_${this.loadedFilename}`);
      if (groupsStr) {
        try {
          this.planningGroups = JSON.parse(groupsStr);
        } catch (e) {
          this.planningGroups = [];
        }
      } else {
        this.planningGroups = [];
      }
      this.notifyGroupsChanged();

      const dataStr = localStorage.getItem(`3dpo_planning_objects_${this.loadedFilename}`);
      if (!dataStr) return;
      const parsed = JSON.parse(dataStr);
      if (!Array.isArray(parsed)) return;

      const THREE = window.THREE;
      if (!THREE) return;
      const modelRoot = this.getModelRoot();

      for (const obj of parsed) {
        const prepareCreatedObj = (created: any) => {
            if (created) {
              created.id = obj.id;
              created.name = obj.name;
              created.color = obj.color;
              created.groupId = obj.groupId;
              created.visible = obj.visible !== false;
              if (created.mesh) {
                // Do not override mesh transform for custom models or geometry-constructed objects
                // as their geometry is already correctly centered and positioned during parsing
                if (created.type !== 'custom_model' && !['plane', 'cylinder', 'curve', 'measurement', 'angle', 'point', 'annotation'].includes(created.type)) {
                  if (obj.posX !== undefined) created.mesh.position.set(obj.posX, obj.posY, obj.posZ);
                  if (obj.rotQx !== undefined) created.mesh.quaternion.set(obj.rotQx, obj.rotQy, obj.rotQz, obj.rotQw);
                  if (obj.scaleX !== undefined) created.mesh.scale.set(obj.scaleX, obj.scaleY, obj.scaleZ);
                }
                created.mesh.visible = created.visible;
              }
              this.updateMeshColorAndVisibility(created);
            }
        };

        try {
          if (obj.type === 'plane') {
            const p1Val = new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z);
            const p2Val = new THREE.Vector3(obj.p2.x, obj.p2.y, obj.p2.z);
            const p3Val = new THREE.Vector3(obj.p3.x, obj.p3.y, obj.p3.z);
            
            this.createPlanningPlane(p1Val, p2Val, p3Val, obj.extWidth, obj.extLength);
            
            const created = this.planningObjects[this.planningObjects.length - 1];
            prepareCreatedObj(created);
            if (created && obj.thickness !== undefined) {
                this.updatePlaneGeometry(created.id, obj.extWidth || 0, obj.thickness);
            }
          } else if (obj.type === 'cylinder') {
            const p1Val = new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z);
            const p2Val = new THREE.Vector3(obj.p2.x, obj.p2.y, obj.p2.z);
            
            this.createPlanningCylinder(p1Val, p2Val, obj.diameter / 2, obj.extension);
            
            const created = this.planningObjects[this.planningObjects.length - 1];
            if (created) { created.color = created.color || '#0000ff'; }
            prepareCreatedObj(created);
          } else if (obj.type === 'curve') {
            const pts = obj.points.map((p: any) => new THREE.Vector3(p.x, p.y, p.z));
            
            this.createPlanningCurve(pts, obj.thickness);
            
            const created = this.planningObjects[this.planningObjects.length - 1];
            if (created) { created.color = created.color || '#db2777'; }
            prepareCreatedObj(created);
          } else if (obj.type === 'measurement') {
            const p1Val = new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z);
            const p2Val = new THREE.Vector3(obj.p2Coord.x, obj.p2Coord.y, obj.p2Coord.z);
            
            this.createPlanningMeasurement(p1Val, p2Val, obj.angle || 0);
            
            const created = this.planningObjects[this.planningObjects.length - 1];
            if (created) { created.color = created.color || '#10b981'; }
            prepareCreatedObj(created);
            if (created && created.labelDiv && created.baseDistance !== undefined) {
                const text = created.name ? `${created.name} (${created.baseDistance.toFixed(2)} mm)` : `${created.baseDistance.toFixed(2)} mm`;
                created.labelDiv.innerText = text;
                created.labelDiv.style.display = created.visible ? 'block' : 'none';
            }
          } else if (obj.type === 'angle') {
            const p1Val = new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z);
            const p2Val = new THREE.Vector3(obj.p2Coord.x, obj.p2Coord.y, obj.p2Coord.z);
            const p3Val = new THREE.Vector3(obj.p3.x, obj.p3.y, obj.p3.z);
            
            this.createPlanningAngle(p1Val, p2Val, p3Val, obj.angle || 0);
            
            const created = this.planningObjects[this.planningObjects.length - 1];
            if (created) { created.color = created.color || '#d97706'; }
            prepareCreatedObj(created);
            if (created && created.labelDiv && created.angle !== undefined) {
                const text = created.name ? `${created.name} (${created.angle.toFixed(1)}°)` : `${created.angle.toFixed(1)}°`;
                created.labelDiv.innerText = text;
                created.labelDiv.style.display = created.visible ? 'block' : 'none';
            }
          } else if (obj.type === 'point') {
            const pVal = new THREE.Vector3(obj.points[0].x, obj.points[0].y, obj.points[0].z);
            
            this.createPlanningPoint(pVal, obj.diameter || 0.2);
            
            const created = this.planningObjects[this.planningObjects.length - 1];
            if (created) { created.color = created.color || '#9333ea'; }
            prepareCreatedObj(created);
          } else if (obj.type === 'annotation') {
            const pVal = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
            const normVal = obj.normal ? new THREE.Vector3(obj.normal.x, obj.normal.y, obj.normal.z) : null;
            this.createPlanningAnnotation(pVal, normVal, obj.text, obj.description, obj.color || '#0284c7', obj.pinSize || 1.5, obj.cardOffset);
            const created = this.planningObjects[this.planningObjects.length - 1];
            if (created) {
              if (obj.name) created.name = obj.name;
              if (obj.text) created.text = obj.text;
              if (obj.description) created.description = obj.description;
              if (obj.color) created.color = obj.color;
              if (obj.pinSize) created.pinSize = obj.pinSize;
            }
            prepareCreatedObj(created);
            if (created && created.labelDiv) {
              const labelSpan = created.labelDiv.querySelector('.annotation-label-text');
              if (labelSpan) {
                labelSpan.textContent = created.text || created.name;
              } else {
                created.labelDiv.innerText = created.text || created.name;
              }
              created.labelDiv.style.display = created.visible ? 'flex' : 'none';
            }
          } else if (obj.type === 'custom_model' && obj.fileDataURL) {
              try {
                  const res = await fetch(obj.fileDataURL);
                  if (res.ok) {
                      const arrayBuffer = await res.arrayBuffer();
                      const loader = new window.THREE.STLLoader();
                      const geometry = loader.parse(arrayBuffer);
                      if (modelRoot && window.THREE) { geometry.applyMatrix4(modelRoot.matrixWorld); }
                      geometry.computeBoundingBox();
                      geometry.computeBoundingSphere();
                      const center = new window.THREE.Vector3();
                      geometry.boundingBox.getCenter(center);
                      geometry.translate(-center.x, -center.y, -center.z);
                      geometry.computeBoundingBox();
                      geometry.computeBoundingSphere();

                      if (geometry.attributes && geometry.attributes.color) {
                          geometry.deleteAttribute('color');
                      }

                      const material = new THREE.MeshStandardMaterial({
                          color: obj.color ? new THREE.Color(obj.color) : new THREE.Color(0x8b5cf6),
                          transparent: true,
                          opacity: obj.opacity !== undefined ? obj.opacity : 0.7,
                          depthTest: true,
                          depthWrite: true,
                          side: THREE.DoubleSide,
                          roughness: 0.35,
                          metalness: 0.1
                      });
                      const mesh = new THREE.Mesh(geometry, material);
                      mesh.renderOrder = 999;
                      mesh.position.copy(center);
                      mesh.userData = { isCustomOverlay: true };
                      
                      if (this.viewer && this.viewer.viewer) {
                          const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
                          if (scene) scene.add(mesh);
                      }

                      const newObj = {
                          id: obj.id,
                          name: obj.name,
                          type: 'custom_model',
                          mesh,
                          color: obj.color || '#8b5cf6',
                          opacity: obj.opacity !== undefined ? obj.opacity : 0.7,
                          fileName: obj.fileName,
                          fileDataURL: obj.fileDataURL
                      };
                      
                      this.planningObjects.push(newObj);
                      prepareCreatedObj(newObj);
                  }
              } catch (fetchErr) {
                  console.warn("Could not reload custom model from stored fileDataURL:", obj.name, fetchErr);
              }
          }
        } catch (err) {
          console.warn("Failed to reconstruct serialized planning object", obj, err);
        }
      }

      let maxSerial = 0;
      parsed.forEach(o => {
        const parts = o.id.split('_');
        if (parts.length > 1) {
          const num = parseInt(parts[1], 10);
          if (!isNaN(num) && num > maxSerial) maxSerial = num;
        }
      });
      this.nextPlanningObjectId = maxSerial + 1;

      if (this.viewer?.viewer) {
          try { this.viewer.viewer.Render(); } catch (e) {}
      }

      if (this.config.onPlanningObjectsChange) {
        this.config.onPlanningObjectsChange(this.planningObjects);
      }
    } catch (e) {
      console.warn("Failed to load planning objects from localStorage", e);
    }
  }

  loadFiles(files: FileList | File[]) {
    if (!files || files.length === 0) return;
    this.resetWorkspace();
    this.loadedUrl = null;
    const fileArray = Array.from(files);
    const filename = fileArray[0].name;

    this.config.onStatusChange('Loading model data...', true, filename, null);
    if (this.config.onProgressChange) this.config.onProgressChange(5);
    
    try {
      this.viewer.LoadModelFromFileList(fileArray);
    } catch(e) { console.error(e); }
    
    this.waitForModelAndBuildTree(filename);
  }

  loadUrl(url: string, cameraArgs?: number[]) {
    if (!url || !isSafeModelUrl(url)) {
      console.warn("[Security] Blocked loadUrl with unsafe or invalid URL:", url);
      return;
    }
    if (this.loadedUrl === url) {
      console.log("Model URL is already loaded or in progress of being loaded:", url);
      return;
    }
    this.resetWorkspace();
    this.loadedUrl = url;
    const filename = url.split('/').pop()?.split('?')[0] || 'Remote Model';

    this.config.onStatusChange('Loading model from URL...', true, filename, url);
    if (this.config.onProgressChange) this.config.onProgressChange(5);
    
    try {
      this.viewer.LoadModelFromUrlList([url]);
    } catch(e) { console.error(e); }
    
    this.waitForModelAndBuildTree(filename, cameraArgs);
  }

  waitForModelAndBuildTree(filename: string, pendingCamera?: number[]) {
    if (this.treeParseInterval) clearInterval(this.treeParseInterval);
    
    let attempts = 0;
    let lastMeshCount = -1;
    let stableCount = 0;
    
    // reset progress
    let simProgress = 5;
    if (this.config.onProgressChange) this.config.onProgressChange(simProgress);

    this.treeParseInterval = setInterval(() => {
      attempts++;
      
      // simulate progress mapping to exactly 95% over 10 seconds (~20 attempts)
      if (simProgress < 95) {
          simProgress += Math.max(1, (95 - simProgress) * 0.1);
          if (this.config.onProgressChange) this.config.onProgressChange(Math.round(simProgress));
      }

      try {
        const scene = this.viewer && this.viewer.viewer ? (this.viewer.viewer.scene || this.viewer.viewer.mainScene) : null;
        let currentMeshCount = 0;
        
        if (scene) {
          scene.traverse((c: any) => { 
            if (c.isMesh && c.type !== "LineSegments" && c.type !== "EdgesGeometry") {
                if (!this.isCustomOverlay(c)) {
                    currentMeshCount++; 
                }
            }
          });
        }
        
        if (currentMeshCount > 0 && currentMeshCount === lastMeshCount) {
          stableCount++;
          if (stableCount >= 2 || attempts >= 120) {
            clearInterval(this.treeParseInterval);
            
            if (this.config.onProgressChange) this.config.onProgressChange(100);

            this.buildModelTree();
            this.setupExplosion();
            
            this.config.onStatusChange(`Model loaded successfully.\n**${filename}**`, false);

            this.loadedFilename = filename;
            
            // Capture the default camera of the model right after build/zoom
            if (this.viewer?.viewer?.navigation && typeof this.viewer.viewer.navigation.GetCamera === 'function') {
                try {
                    const cam = this.viewer.viewer.navigation.GetCamera();
                    if (cam) {
                        this.defaultCamera = new window.OV.Camera(
                            new window.OV.Coord3D(cam.eye.x, cam.eye.y, cam.eye.z),
                            new window.OV.Coord3D(cam.center.x, cam.center.y, cam.center.z),
                            new window.OV.Coord3D(cam.up.x, cam.up.y, cam.up.z),
                            cam.fov || 45.0
                        );
                    }
                } catch(e) { console.warn("Failed to capture default camera", e); }
            }

            if (pendingCamera && this.viewer.viewer.navigation) {
                try {
                    const c = pendingCamera;
                    const eye = new window.OV.Coord3D(c[0], c[1], c[2]);
                    const center = new window.OV.Coord3D(c[3], c[4], c[5]);
                    const up = new window.OV.Coord3D(c[6], c[7], c[8]);
                    this.viewer.viewer.navigation.SetCamera(new window.OV.Camera(eye, center, up, c[9] || 45.0));
                    // Update default camera to override with the URL parameter if present
                    this.defaultCamera = new window.OV.Camera(
                        new window.OV.Coord3D(eye.x, eye.y, eye.z),
                        new window.OV.Coord3D(center.x, center.y, center.z),
                        new window.OV.Coord3D(up.x, up.y, up.z),
                        c[9] || 45.0
                    );
                } catch(e) { console.warn("Failed to set imported camera", e); }
            }
            this.initTransformControls();
            this.enforceFreeOrbit();
            this.loadFromLocalStorage();
          }
        } else if (currentMeshCount > 0) {
          lastMeshCount = currentMeshCount;
          stableCount = 0;
        } else if (attempts >= 120) {
          clearInterval(this.treeParseInterval);
          if (this.config.onProgressChange) this.config.onProgressChange(100);
          this.config.onStatusChange(`Loading finished.\n**${filename}**`, false);
          this.config.onMeshesChange([]);
        }
      } catch (err) {
        clearInterval(this.treeParseInterval);
        if (this.config.onProgressChange) this.config.onProgressChange(100);
        this.config.onStatusChange(`Error parsing model.`, false);
      }
    }, 500);
  }

  isCustomOverlay(object: any): boolean {
    let current = object;
    while (current) {
        if (current.userData && current.userData.isCustomOverlay) return true;
        current = current.parent;
    }
    return false;
  }

  buildModelTree() {
    this.revertGhostingMode();
    this.clearHighlight();
    this.originalColors.clear();
    this.ghostedOriginals.clear();
    this.currentMeshes = [];

    const scene = this.viewer?.viewer?.scene || this.viewer?.viewer?.mainScene;
    if (!scene) return;

    const meshInfos: any[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh && child.type !== "LineSegments" && child.type !== "EdgesGeometry") {
        if (this.isCustomOverlay(child)) return;
        this.currentMeshes.push(child);
        const meshIndex = this.currentMeshes.length - 1;
        
        let name = child.name || (child.parent && child.parent.name ? `${child.parent.name} (Mesh)` : null) || `Mesh ${meshIndex + 1}`;
        if (name.length > 25) name = name.substring(0, 22) + '...';
        
        const opacity = child.material && child.material.opacity !== undefined ? child.material.opacity : 1;
        
        meshInfos.push({
          id: meshIndex,
          name,
          visible: child.visible !== false,
          opacity: opacity
        });
      }
    });

    this.config.onMeshesChange(meshInfos);
  }

  getModelStats(): ModelStats | null {
    if (!this.currentMeshes || this.currentMeshes.length === 0) return null;
    const THREE = window.THREE;
    let vertexCount = 0;
    let triangleCount = 0;
    const materialsSet = new Set<any>();
    let overallBox: any = null;
    if (THREE) {
      overallBox = new THREE.Box3();
    }

    for (const mesh of this.currentMeshes) {
      if (!mesh) continue;
      if (mesh.geometry) {
        const geom = mesh.geometry;
        if (geom.attributes && geom.attributes.position) {
          const vCount = geom.attributes.position.count || 0;
          vertexCount += vCount;
          if (geom.index && geom.index.count) {
            triangleCount += Math.floor(geom.index.count / 3);
          } else {
            triangleCount += Math.floor(vCount / 3);
          }
        }
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m: any) => materialsSet.add(m));
        } else {
          materialsSet.add(mesh.material);
        }
      }
      if (overallBox && THREE) {
        try {
          const meshBox = new THREE.Box3().setFromObject(mesh);
          if (!meshBox.isEmpty()) {
            overallBox.union(meshBox);
          }
        } catch (e) {}
      }
    }

    const dimensions = { x: 0, y: 0, z: 0 };
    let boundingBox: { min: [number, number, number]; max: [number, number, number] } | null = null;
    if (overallBox && !overallBox.isEmpty() && THREE) {
      const size = new THREE.Vector3();
      overallBox.getSize(size);
      dimensions.x = Math.round(size.x * 10) / 10;
      dimensions.y = Math.round(size.y * 10) / 10;
      dimensions.z = Math.round(size.z * 10) / 10;
      boundingBox = {
        min: [Math.round(overallBox.min.x * 10) / 10, Math.round(overallBox.min.y * 10) / 10, Math.round(overallBox.min.z * 10) / 10],
        max: [Math.round(overallBox.max.x * 10) / 10, Math.round(overallBox.max.y * 10) / 10, Math.round(overallBox.max.z * 10) / 10]
      };
    }

    const fname = this.loadedFilename || null;
    let ext = '3D';
    if (fname && fname.includes('.')) {
      ext = fname.split('.').pop()?.toUpperCase() || '3D';
    }

    return {
      meshCount: this.currentMeshes.length,
      vertexCount,
      triangleCount,
      dimensions,
      boundingBox,
      materialCount: materialsSet.size || 1,
      fileFormat: ext,
      filename: fname
    };
  }

  setGlobalOpacity(val: number) {
    const scene = this.viewer?.viewer?.scene || this.viewer?.viewer?.mainScene;
    if (!scene) return;

    scene.traverse((child: any) => {
        if (child.isMesh && child.type !== "LineSegments" && child.type !== "EdgesGeometry") {
            if (this.isCustomOverlay(child)) return;
            if (child.material && !child.userData?.isEdge) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat: any) => {
                   if (mat._originalSide === undefined) {
                       mat._originalSide = mat.side;
                   }
                   mat.transparent = val < 1.0;
                   mat.opacity = val;
                   mat.needsUpdate = true;
                   mat.depthWrite = val === 1.0;
                   mat.side = val < 1.0 ? window.THREE.FrontSide : mat._originalSide;
                });
            }
        }
    });
    try { this.viewer.viewer.Render(); } catch(e) {}
  }

  setMeshOpacity(id: number, val: number) {
    const mesh = this.currentMeshes[id];
    if (mesh && mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat: any) => { 
        if (mat._originalSide === undefined) {
            mat._originalSide = mat.side;
        }
        mat.transparent = val < 1.0; 
        mat.opacity = val; 
        mat.needsUpdate = true; 
        mat.depthWrite = val === 1.0; 
        mat.side = val < 1.0 ? window.THREE.FrontSide : mat._originalSide;
      });
      try { this.viewer.viewer.Render(); } catch(err) {}
    }
  }

  toggleMeshVisibility(id: number) {
    const mesh = this.currentMeshes[id];
    if (mesh) {
        mesh.visible = !mesh.visible;
        try { this.viewer.viewer.Render(); } catch(err) {}
    }
  }

  setAllMeshesVisibility(visible: boolean) {
    if (this.currentMeshes && this.currentMeshes.length > 0) {
      this.currentMeshes.forEach(mesh => {
        if (mesh) mesh.visible = visible;
      });
      try { this.viewer?.viewer?.Render(); } catch(err) {}
    }
  }

  invertMeshesVisibility() {
    if (this.currentMeshes && this.currentMeshes.length > 0) {
      this.currentMeshes.forEach(mesh => {
        if (mesh) mesh.visible = !mesh.visible;
      });
      try { this.viewer?.viewer?.Render(); } catch(err) {}
    }
  }

  // --- HIGHLIGHTING & RAYCASTING ---
  
  setupRaycaster() {
    let pointerDownPos = { x: 0, y: 0 };
    
    this.onPointerDown = (e: PointerEvent) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    this.container.addEventListener('pointerdown', this.onPointerDown, { capture: true });

    this.onPointerUp = (e: PointerEvent) => {
        const dist = Math.sqrt(Math.pow(e.clientX - pointerDownPos.x, 2) + Math.pow(e.clientY - pointerDownPos.y, 2));
        if (dist > 8) return; 

        if (window.THREE && this.viewer?.viewer?.camera) {
            const rect = this.container.getBoundingClientRect();
            const mouse = new window.THREE.Vector2();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            
            const raycaster = new window.THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.viewer.viewer.camera);
            
            // If we are currently interacting with the transform gizmo, don't change selection
            if (this.transformControl && this.transformControl.axis !== null) {
                return;
            }
            
            // All active meshes in planningObjects (custom models, duplicated submeshes, planes, cylinders, curves, points)
            const planningMeshes = (this.planningObjects || [])
                .filter(o => o.mesh && o.visible !== false)
                .map(o => o.mesh)
                .filter(Boolean);
                
            let scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
            if (!scene) return;
            
            const intersectsScene = raycaster.intersectObjects(scene.children, true);
            const intersects = intersectsScene.filter((intersect: any) => {
                let obj = intersect.object;
                
                let isOverlay = false;
                let isGizmo = false;
                let isTempMarker = false;

                while (obj) {
                    if (obj === this.transformControl) {
                        isGizmo = true;
                    }
                    if (this.planningPointMarkers && this.planningPointMarkers.includes(obj)) {
                        isTempMarker = true;
                    }
                    if (obj.userData && obj.userData.isCustomOverlay) {
                        isOverlay = true;
                    }
                    if (obj.visible === false) return false;
                    obj = obj.parent;
                }
                
                if (isGizmo || isTempMarker) return false; // Ignore gizmo handles and active picker markers
                
                obj = intersect.object;
                let isPlanningMesh = false;
                let isCurrentMesh = false;
                
                while (obj) {
                    if (planningMeshes.includes(obj) || (obj.userData && obj.userData.isCustomOverlay)) {
                        isPlanningMesh = true;
                    }
                    if (this.currentMeshes.includes(obj)) {
                        isCurrentMesh = true;
                    }
                    obj = obj.parent;
                }
                
                if (this.planningMode !== 'none') {
                    if (isCurrentMesh || isPlanningMesh) return true;
                    // Fallback for any visible mesh in scene
                    return !!intersect.object.isMesh;
                } else {
                    if (isPlanningMesh || isCurrentMesh) return true;
                    return false;
                }
            }).sort((a: any, b: any) => a.distance - b.distance);
            
            // Prefer meshes over edges
            let visibleHit = intersects.find((hit: any) => hit.object.isMesh && hit.object.type !== "LineSegments" && hit.object.type !== "EdgesGeometry");
            if (!visibleHit && intersects.length > 0) {
                visibleHit = intersects[0];
            }
            
            if (this.planningMode !== 'none') {
                 if (visibleHit) {
                     let normal = null;
                     if (visibleHit.face && visibleHit.face.normal && window.THREE) {
                         normal = visibleHit.face.normal.clone();
                         normal.transformDirection(visibleHit.object.matrixWorld);
                     }
                     this.addPlanningPoint(visibleHit.point, normal);
                 }
                 return;
            }

            if (visibleHit) {
                // Find if the hit object is part of a planning mesh or current meshes
                let hitPlanningMesh = null;
                let hitCurrentMesh = null;
                let obj = visibleHit.object;
                
                while (obj) {
                    if (planningMeshes.includes(obj)) {
                        hitPlanningMesh = obj;
                        break;
                    }
                    if (this.currentMeshes.includes(obj)) {
                        hitCurrentMesh = obj;
                    }
                    obj = obj.parent;
                }

                if (hitPlanningMesh) {
                    this.highlightMesh(null);
                    
                    const hitObj = this.planningObjects.find(o => o.mesh === hitPlanningMesh);
                    const hitObjId = hitObj ? hitObj.id : undefined;
                    
                    if (this.transformControl) {
                        // BUT only attach transform capabilities and settings overlay to plane, cylinder and custom_model
                        if (hitObj && (hitObj.type === 'plane' || hitObj.type === 'cylinder' || hitObj.type === 'custom_model')) {
                            if (this.highlightedPlanningObj === hitObj) {
                                this.transformControl.detach();
                                this.highlightPlanningMesh(null);
                                if (this.config.onTransformActiveChange) this.config.onTransformActiveChange(false);
                            } else {
                                this.transformControl.attach(hitPlanningMesh);
                                this.highlightPlanningMesh(hitObj);
                                if (this.config.onTransformActiveChange) this.config.onTransformActiveChange(true, hitObjId);
                            }
                        } else {
                            this.transformControl.detach(); // Hide transform handles
                            this.highlightPlanningMesh(hitObj || null);
                            if (this.config.onTransformActiveChange) this.config.onTransformActiveChange(false);
                        }
                        this.viewer.viewer.Render();
                    }
                } else {
                    if (this.transformControl) {
                        this.transformControl.detach();
                    this.highlightPlanningMesh(null);
                    if (this.config.onTransformActiveChange) this.config.onTransformActiveChange(false);
                        this.viewer.viewer.Render();
                    }
                    const hitMesh = hitCurrentMesh || visibleHit.object;
                    let idx = this.currentMeshes.indexOf(hitMesh);
                    
                    // Fallback: If it's still not found, check if it's identical by comparing it directly
                    if (idx === -1) {
                        idx = this.currentMeshes.findIndex(m => m === hitMesh);
                    }
                    
                    if (this.highlightedMesh === hitMesh) {
                        this.highlightMesh(null);
                    } else if (idx !== -1) {
                        this.highlightMesh(idx);
                    }
                }
            } else {
                this.highlightMesh(null);
                if (this.transformControl) {
                    this.transformControl.detach();
                    this.highlightPlanningMesh(null);
                    if (this.config.onTransformActiveChange) this.config.onTransformActiveChange(false);
                    this.viewer.viewer.Render();
                }
            }
        }
    };
    this.container.addEventListener('pointerup', this.onPointerUp, { capture: true });
  }

  setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
    this.clearRotationVisualCue();
    this.clearTranslationVisualCue();
    if (this.transformControl) {
      this.transformControl.setMode(mode);
      this.transformControl.setSpace('local');
      if (this.config.onTransformModeChange) this.config.onTransformModeChange(mode);
      if (this.viewer?.viewer) {
          try { this.viewer.viewer.Render(); } catch(e){}
      }
    }
  }

  setPlanningMode(mode: 'none' | 'plane' | 'cylinder' | 'measure' | 'curve' | 'angle' | 'point' | 'annotation') {
      this.planningMode = mode;
      if (mode !== 'annotation') {
          this.resnappingAnnotationId = null;
      }
      this.clearPlanningPoints();
      if (mode !== 'none' && this.transformControl) {
          this.transformControl.detach();
                    this.highlightPlanningMesh(null);
                    if (this.config.onTransformActiveChange) this.config.onTransformActiveChange(false);
          if (this.viewer?.viewer) this.viewer.viewer.Render();
      }
      if (this.config.onPlanningModeChange) {
          this.config.onPlanningModeChange(mode, this.resnappingAnnotationId);
      }
  }

  clearPlanningPoints() {
      this.planningPoints = [];
      this.planningNormals = [];
      if (this.config.onMeasurementChange) {
          this.config.onMeasurementChange(null);
      }
      if (this.viewer && this.viewer.viewer && window.THREE) {
          const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
          if (scene) {
              this.planningPointMarkers.forEach(marker => {
                  scene.remove(marker);
                  if (marker.geometry) marker.geometry.dispose();
                  if (marker.material) marker.material.dispose();
              });
          }
      }
      this.planningPointMarkers = [];
      if (this.config.onPlanningPointsChange) {
          this.config.onPlanningPointsChange(0);
      }
      if (this.viewer && this.viewer.viewer) {
          this.viewer.viewer.Render();
      }
  }

  // --- ROTATION VISUAL CUE PIPELINE ---

  startRotationVisualCue() {
    if (!this.transformControl || !this.transformControl.object || !window.THREE) return;
    const mesh = this.transformControl.object;
    
    // Find associated planning object (e.g. plane or cylinder)
    const planObj = this.planningObjects.find(o => o.mesh === mesh);
    if (!planObj || (planObj.type !== 'plane' && planObj.type !== 'cylinder' && planObj.type !== 'custom_model')) {
      return;
    }

    this.isRotatingTool = true;
    this.rotationStartQuat = mesh.quaternion.clone();
    this.rotationStartPos = mesh.position.clone();
    
    // Extract axis being rotated ('X', 'Y', 'Z', 'E', etc.)
    const rawAxis = (this.transformControl.axis || 'Z').toUpperCase();
    this.rotationAxisName = rawAxis;

    const v = this.viewer?.viewer;
    const scene = v?.scene || v?.mainScene;
    if (!scene) return;

    // Create container group for 3D overlay arc & rays
    if (!this.rotationCueGroup) {
      this.rotationCueGroup = new window.THREE.Group();
      this.rotationCueGroup.userData = { isCustomOverlay: true };
      scene.add(this.rotationCueGroup);
    }

    // Create 2D DOM badge label if not present
    if (!this.rotationBadgeDiv) {
      const div = document.createElement('div');
      div.className = 'absolute z-50 pointer-events-none font-mono text-xs font-bold text-white bg-slate-900/90 border rounded-full px-3 py-1.5 shadow-2xl backdrop-blur-md flex items-center gap-2 transition-opacity whitespace-nowrap tracking-tight select-none';
      div.style.left = '50%';
      div.style.top = '24px';
      div.style.transform = 'translateX(-50%)';
      div.style.opacity = '0';
      this.container.appendChild(div);
      this.rotationBadgeDiv = div;
    }

    this.updateRotationVisualCue();
  }

  updateRotationVisualCue() {
    if (!this.isRotatingTool || !this.transformControl || !this.transformControl.object || !window.THREE) return;
    const THREE = window.THREE;
    const mesh = this.transformControl.object;
    const planObj = this.planningObjects.find(o => o.mesh === mesh);

    if (!planObj) return;

    const currentQuat = mesh.quaternion.clone();
    const startQuat = this.rotationStartQuat || currentQuat.clone();

    // Compute relative rotation delta quat = Q_current * Q_start^(-1)
    const deltaQuat = currentQuat.clone().multiply(startQuat.clone().invert());
    if (deltaQuat.w < 0) {
      deltaQuat.x = -deltaQuat.x;
      deltaQuat.y = -deltaQuat.y;
      deltaQuat.z = -deltaQuat.z;
      deltaQuat.w = -deltaQuat.w;
    }

    const axisName = (this.rotationAxisName || 'Z').toUpperCase();

    // Define local axis and default axis color
    let localAxis = new THREE.Vector3(0, 0, 1);
    let axisColorHex = 0x3b82f6; // Blue (Z)
    let axisColorCss = '#3b82f6';
    let borderColorCss = 'border-blue-500';

    if (axisName.includes('X')) {
      localAxis.set(1, 0, 0);
      axisColorHex = 0xef4444; // Red (X)
      axisColorCss = '#ef4444';
      borderColorCss = 'border-red-500';
    } else if (axisName.includes('Y')) {
      localAxis.set(0, 1, 0);
      axisColorHex = 0x22c55e; // Green (Y)
      axisColorCss = '#22c55e';
      borderColorCss = 'border-emerald-500';
    } else if (axisName.includes('E')) {
      // Camera view rotation
      if (this.viewer?.viewer?.camera) {
        this.viewer.viewer.camera.getWorldDirection(localAxis);
        localAxis.negate();
      }
      axisColorHex = 0xf59e0b; // Amber
      axisColorCss = '#f59e0b';
      borderColorCss = 'border-amber-500';
    }

    // World axis vector
    const worldAxis = localAxis.clone().applyQuaternion(startQuat).normalize();

    // Calculate signed angle around worldAxis
    const vecPart = new THREE.Vector3(deltaQuat.x, deltaQuat.y, deltaQuat.z);
    const dotWorld = vecPart.dot(worldAxis);
    const sign = dotWorld >= 0 ? 1 : -1;
    let angleRad = 2 * Math.atan2(sign * vecPart.length(), deltaQuat.w);
    if (sign < 0) {
      angleRad = -Math.abs(angleRad);
    }
    const angleDeg = angleRad * (180 / Math.PI);

    // --- Update 2D Floating DOM Badge ---
    if (this.rotationBadgeDiv) {
      const objLabel = planObj.name ? `${escapeHtml(planObj.name)} • ` : '';
      const formattedAngle = `${angleDeg >= 0 ? '+' : ''}${angleDeg.toFixed(1)}°`;
      
      this.rotationBadgeDiv.className = `absolute z-50 pointer-events-none font-mono text-xs font-bold text-white bg-slate-900/90 border ${borderColorCss} rounded-full px-3 py-1.5 shadow-2xl backdrop-blur-md flex items-center gap-2 transition-opacity whitespace-nowrap tracking-tight select-none`;
      this.rotationBadgeDiv.textContent = '';

      const dotSpan = document.createElement('span');
      dotSpan.className = 'w-2.5 h-2.5 rounded-full animate-pulse';
      dotSpan.style.backgroundColor = axisColorCss;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'text-slate-300 font-semibold uppercase text-[10px] tracking-wider';
      labelSpan.textContent = `${planObj.name ? `${planObj.name} • ` : ''}${axisName}-ROTATION:`;

      const valSpan = document.createElement('span');
      valSpan.className = 'text-amber-400 font-bold text-sm';
      valSpan.textContent = formattedAngle;

      this.rotationBadgeDiv.appendChild(dotSpan);
      this.rotationBadgeDiv.appendChild(labelSpan);
      this.rotationBadgeDiv.appendChild(valSpan);

      // Position badge in the middle top of the canvas
      this.rotationBadgeDiv.style.left = '50%';
      this.rotationBadgeDiv.style.top = '24px';
      this.rotationBadgeDiv.style.transform = 'translateX(-50%)';
      this.rotationBadgeDiv.style.opacity = '1';
    }

    // --- Update 3D Overlay Group (Arc & Sector Geometry) ---
    if (this.rotationCueGroup && this.viewer?.viewer) {
      // Clear previous 3D children in cue group
      while (this.rotationCueGroup.children.length > 0) {
        const child = this.rotationCueGroup.children[0];
        this.rotationCueGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material && !child.userData?.isEdge) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }

      this.rotationCueGroup.position.copy(mesh.position);

      // Determine visual arc radius R based on tool dimensions
      let R = 25;
      if (planObj.type === 'plane') {
        R = Math.max(planObj.width || 30, planObj.height || 30) * 0.6;
      } else if (planObj.type === 'cylinder') {
        R = Math.max(planObj.length || 30, (planObj.diameter || 2) * 10) * 0.45;
      }

      // Compute orthonormal vectors u and v perpendicular to worldAxis
      let u = new THREE.Vector3();
      if (Math.abs(worldAxis.x) < 0.9) {
        u.set(0, -worldAxis.z, worldAxis.y).normalize();
      } else {
        u.set(-worldAxis.y, worldAxis.x, 0).normalize();
      }
      const v = new THREE.Vector3().crossVectors(worldAxis, u).normalize();

      // Create Sector Arc Fan Geometry
      const absDeg = Math.abs(angleDeg);
      const numSegments = Math.max(12, Math.ceil(absDeg / 4));
      
      const positions: number[] = [0, 0, 0]; // Center point at (0,0,0)
      const arcPoints: any[] = [];

      for (let i = 0; i <= numSegments; i++) {
        const t = angleRad * (i / numSegments);
        const p = u.clone().multiplyScalar(Math.cos(t)).add(v.clone().multiplyScalar(Math.sin(t)));
        const pt = p.multiplyScalar(R);
        positions.push(pt.x, pt.y, pt.z);
        arcPoints.push(pt);
      }

      const indices: number[] = [];
      for (let i = 1; i <= numSegments; i++) {
        if (angleRad >= 0) {
          indices.push(0, i, i + 1);
        } else {
          indices.push(0, i + 1, i);
        }
      }

      const fanGeom = new THREE.BufferGeometry();
      fanGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      fanGeom.setIndex(indices);

      const fanMat = new THREE.MeshBasicMaterial({
        color: axisColorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3,
        depthTest: false
      });
      const fanMesh = new THREE.Mesh(fanGeom, fanMat);
      fanMesh.renderOrder = 9999;
      this.rotationCueGroup.add(fanMesh);

      // Baseline Ray Line (0 deg)
      const baseRayGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        u.clone().multiplyScalar(R * 1.15)
      ]);
      const baseRayMat = new THREE.LineBasicMaterial({
        color: axisColorHex,
        linewidth: 3,
        depthTest: false
      });
      const baseRay = new THREE.Line(baseRayGeom, baseRayMat);
      baseRay.renderOrder = 9999;
      this.rotationCueGroup.add(baseRay);

      // Rotated Ray Line (Current Angle)
      const rotRayGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        arcPoints[arcPoints.length - 1].clone().multiplyScalar(1.15)
      ]);
      const rotRayMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b, // Amber active pointer line
        linewidth: 3,
        depthTest: false
      });
      const rotRay = new THREE.Line(rotRayGeom, rotRayMat);
      rotRay.renderOrder = 9999;
      this.rotationCueGroup.add(rotRay);

      // Arc Outer Edge Line
      const arcEdgeGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const arcEdgeMat = new THREE.LineBasicMaterial({
        color: axisColorHex,
        linewidth: 3,
        depthTest: false
      });
      const arcEdgeLine = new THREE.Line(arcEdgeGeom, arcEdgeMat);
      arcEdgeLine.renderOrder = 9999;
      this.rotationCueGroup.add(arcEdgeLine);

      // Center Origin Marker Sphere
      const centerGeom = new THREE.SphereGeometry(R * 0.04, 16, 16);
      const centerMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthTest: false
      });
      const centerMesh = new THREE.Mesh(centerGeom, centerMat);
      centerMesh.renderOrder = 9999;
      this.rotationCueGroup.add(centerMesh);

      try {
        this.viewer.viewer.Render();
      } catch (e) {}
    }
  }

  clearRotationVisualCue() {
    this.isRotatingTool = false;
    this.rotationStartQuat = null;
    this.rotationStartPos = null;
    this.rotationAxisName = null;

    if (this.rotationCueGroup && this.viewer?.viewer) {
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (scene) {
        scene.remove(this.rotationCueGroup);
        this.rotationCueGroup.traverse((child: any) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m: any) => m?.dispose?.());
            } else {
              child.material?.dispose?.();
            }
          }
        });
      }
    }
    this.rotationCueGroup = null;

    if (this.rotationBadgeDiv) {
      if (this.rotationBadgeDiv.parentElement) {
        this.rotationBadgeDiv.parentElement.removeChild(this.rotationBadgeDiv);
      }
      this.rotationBadgeDiv = null;
    }

    if (this.viewer?.viewer) {
      try {
        this.viewer.viewer.Render();
      } catch (e) {}
    }
  }

  // --- TRANSLATION VISUAL CUE PIPELINE ---

  startTranslationVisualCue() {
    if (!this.transformControl || !this.transformControl.object || !window.THREE) return;
    const mesh = this.transformControl.object;
    
    // Find associated planning object (e.g. plane or cylinder)
    const planObj = this.planningObjects.find(o => o.mesh === mesh);
    if (!planObj || (planObj.type !== 'plane' && planObj.type !== 'cylinder' && planObj.type !== 'custom_model')) {
      return;
    }

    this.isTranslatingTool = true;
    this.translationStartPos = mesh.position.clone();
    
    // Extract axis being translated ('X', 'Y', 'Z', 'XY', 'XZ', 'YZ', 'XYZ', etc.)
    const rawAxis = (this.transformControl.axis || 'XYZ').toUpperCase();
    this.translationAxisName = rawAxis;

    const v = this.viewer?.viewer;
    const scene = v?.scene || v?.mainScene;
    if (!scene) return;

    // Create container group for 3D overlay guide lines & markers
    if (!this.translationCueGroup) {
      this.translationCueGroup = new window.THREE.Group();
      this.translationCueGroup.userData = { isCustomOverlay: true };
      scene.add(this.translationCueGroup);
    }

    // Create 2D DOM badge label if not present
    if (!this.translationBadgeDiv) {
      const div = document.createElement('div');
      div.className = 'absolute z-50 pointer-events-none font-mono text-xs font-bold text-white bg-slate-900/90 border rounded-full px-3 py-1.5 shadow-2xl backdrop-blur-md flex items-center gap-2 transition-opacity whitespace-nowrap tracking-tight select-none';
      div.style.left = '50%';
      div.style.top = '24px';
      div.style.transform = 'translateX(-50%)';
      div.style.opacity = '0';
      this.container.appendChild(div);
      this.translationBadgeDiv = div;
    }

    this.updateTranslationVisualCue();
  }

  updateTranslationVisualCue() {
    if (!this.isTranslatingTool || !this.transformControl || !this.transformControl.object || !window.THREE) return;
    const THREE = window.THREE;
    const mesh = this.transformControl.object;
    const planObj = this.planningObjects.find(o => o.mesh === mesh);

    if (!planObj) return;

    const startPos = this.translationStartPos ? this.translationStartPos.clone() : mesh.position.clone();
    const currentPos = mesh.position.clone();
    const deltaPos = currentPos.clone().sub(startPos);

    const axisName = (this.translationAxisName || 'XYZ').toUpperCase();

    // Determine color and styling based on axis
    let axisColorHex = 0x8b5cf6; // Purple (Multi-axis/Free)
    let axisColorCss = '#8b5cf6';
    let borderColorCss = 'border-purple-500';

    if (axisName === 'X') {
      axisColorHex = 0xef4444; // Red
      axisColorCss = '#ef4444';
      borderColorCss = 'border-red-500';
    } else if (axisName === 'Y') {
      axisColorHex = 0x22c55e; // Green
      axisColorCss = '#22c55e';
      borderColorCss = 'border-emerald-500';
    } else if (axisName === 'Z') {
      axisColorHex = 0x3b82f6; // Blue
      axisColorCss = '#3b82f6';
      borderColorCss = 'border-blue-500';
    }

    // Format displacement / distance readout
    let valueText = '';
    const totalDist = deltaPos.length();

    if (axisName === 'X') {
      const val = deltaPos.x;
      valueText = `${val >= 0 ? '+' : ''}${val.toFixed(2)} mm`;
    } else if (axisName === 'Y') {
      const val = deltaPos.y;
      valueText = `${val >= 0 ? '+' : ''}${val.toFixed(2)} mm`;
    } else if (axisName === 'Z') {
      const val = deltaPos.z;
      valueText = `${val >= 0 ? '+' : ''}${val.toFixed(2)} mm`;
    } else {
      valueText = `${totalDist >= 0 ? '+' : ''}${totalDist.toFixed(2)} mm (ΔX:${deltaPos.x >= 0 ? '+' : ''}${deltaPos.x.toFixed(1)}, ΔY:${deltaPos.y >= 0 ? '+' : ''}${deltaPos.y.toFixed(1)}, ΔZ:${deltaPos.z >= 0 ? '+' : ''}${deltaPos.z.toFixed(1)})`;
    }

    // --- Update 2D Floating DOM Badge ---
    if (this.translationBadgeDiv) {
      const objLabel = planObj.name ? `${escapeHtml(planObj.name)} • ` : '';
      
      this.translationBadgeDiv.className = `absolute z-50 pointer-events-none font-mono text-xs font-bold text-white bg-slate-900/90 border ${borderColorCss} rounded-full px-3 py-1.5 shadow-2xl backdrop-blur-md flex items-center gap-2 transition-opacity whitespace-nowrap tracking-tight select-none`;
      this.translationBadgeDiv.textContent = '';

      const dotSpan = document.createElement('span');
      dotSpan.className = 'w-2.5 h-2.5 rounded-full animate-pulse';
      dotSpan.style.backgroundColor = axisColorCss;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'text-slate-300 font-semibold uppercase text-[10px] tracking-wider';
      labelSpan.textContent = `${planObj.name ? `${planObj.name} • ` : ''}${axisName}-TRANSLATION:`;

      const valSpan = document.createElement('span');
      valSpan.className = 'text-amber-400 font-bold text-sm';
      valSpan.textContent = valueText;

      this.translationBadgeDiv.appendChild(dotSpan);
      this.translationBadgeDiv.appendChild(labelSpan);
      this.translationBadgeDiv.appendChild(valSpan);

      // Position badge in the middle top of the canvas
      this.translationBadgeDiv.style.left = '50%';
      this.translationBadgeDiv.style.top = '24px';
      this.translationBadgeDiv.style.transform = 'translateX(-50%)';
      this.translationBadgeDiv.style.opacity = '1';
    }

    // --- Update 3D Overlay Group (Guideline Vector & Origin/Target Markers) ---
    if (this.translationCueGroup && this.viewer?.viewer) {
      // Clear previous 3D children in cue group
      while (this.translationCueGroup.children.length > 0) {
        const child = this.translationCueGroup.children[0];
        this.translationCueGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material && !child.userData?.isEdge) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }

      this.translationCueGroup.position.set(0, 0, 0);

      // Determine marker size based on tool dimensions
      let S = 10;
      if (planObj.type === 'plane') {
        S = Math.max(planObj.width || 30, planObj.height || 30) * 0.05;
      } else if (planObj.type === 'cylinder') {
        S = Math.max(planObj.length || 30, (planObj.diameter || 2) * 10) * 0.05;
      }
      S = Math.max(2, S);

      // 1. Origin Marker Sphere at startPos
      const originGeom = new THREE.SphereGeometry(S, 16, 16);
      const originMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthTest: false,
        transparent: true,
        opacity: 0.9
      });
      const originMesh = new THREE.Mesh(originGeom, originMat);
      originMesh.position.copy(startPos);
      originMesh.renderOrder = 9999;
      this.translationCueGroup.add(originMesh);

      // 2. Vector line from startPos to currentPos
      if (totalDist > 0.01) {
        const lineGeom = new THREE.BufferGeometry().setFromPoints([startPos, currentPos]);
        const lineMat = new THREE.LineBasicMaterial({
          color: axisColorHex,
          linewidth: 3,
          depthTest: false
        });
        const vectorLine = new THREE.Line(lineGeom, lineMat);
        vectorLine.renderOrder = 9999;
        this.translationCueGroup.add(vectorLine);

        // 3. Current Target Marker Sphere / Arrow tip at currentPos
        const targetGeom = new THREE.SphereGeometry(S * 0.8, 16, 16);
        const targetMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b, // Amber active tip
          depthTest: false
        });
        const targetMesh = new THREE.Mesh(targetGeom, targetMat);
        targetMesh.position.copy(currentPos);
        targetMesh.renderOrder = 9999;
        this.translationCueGroup.add(targetMesh);
      }

      try {
        this.viewer.viewer.Render();
      } catch (e) {}
    }
  }

  clearTranslationVisualCue() {
    this.isTranslatingTool = false;
    this.translationStartPos = null;
    this.translationAxisName = null;

    if (this.translationCueGroup && this.viewer?.viewer) {
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (scene) {
        scene.remove(this.translationCueGroup);
        this.translationCueGroup.traverse((child: any) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m: any) => m?.dispose?.());
            } else {
              child.material?.dispose?.();
            }
          }
        });
      }
    }
    this.translationCueGroup = null;

    if (this.translationBadgeDiv) {
      if (this.translationBadgeDiv.parentElement) {
        this.translationBadgeDiv.parentElement.removeChild(this.translationBadgeDiv);
      }
      this.translationBadgeDiv = null;
    }

    if (this.viewer?.viewer) {
      try {
        this.viewer.viewer.Render();
      } catch (e) {}
    }
  }

  addPlanningPoint(point: any, normal?: any) {
      if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (!scene) return;
      
      const THREE = window.THREE;

      if (this.planningMode === 'plane' && this.planningPoints.length >= 3) return;
      if (this.planningMode === 'cylinder' && this.planningPoints.length >= 2) return;
      if (this.planningMode === 'measure' && this.planningPoints.length >= 2) return;
      if (this.planningMode === 'angle' && this.planningPoints.length >= 3) return;

      this.planningPoints.push(point);
      if (normal) {
          this.planningNormals.push(normal);
      } else {
          this.planningNormals.push(new THREE.Vector3(0, 1, 0));
      }
      
      const geometry = new THREE.SphereGeometry(2, 16, 16);
      const isMeasure = this.planningMode === 'measure';
      const isAngle = this.planningMode === 'angle';
      
      let markerColor = 0xff0000;
      if (isMeasure) markerColor = 0x10b981;
      if (isAngle) markerColor = 0xd97706;
      
      const material = new THREE.MeshBasicMaterial({ color: markerColor, depthTest: false });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(point);
      marker.renderOrder = 999; 
      marker.userData = { isCustomOverlay: true };
      scene.add(marker);
      this.planningPointMarkers.push(marker);

      if (isMeasure && this.planningPoints.length === 2) {
          const p1 = this.planningPoints[0];
          const p2 = this.planningPoints[1];
          const m = this.calculateMeasurement();
          const angle = m ? m.angle : 0;

          // Automatically create the permanent measurement cylinder object
          this.createPlanningMeasurement(p1, p2, angle);

          // Instantly clear the temporary red/green spheres & lines
          this.clearPlanningPoints();

          // Notify context that the objects list updated
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
          return;
      }

      if (isAngle && this.planningPoints.length === 3) {
          const p1 = this.planningPoints[0];
          const p2 = this.planningPoints[1]; // Vertex point
          const p3 = this.planningPoints[2];

          const v1 = new THREE.Vector3().subVectors(p1, p2).normalize();
          const v2 = new THREE.Vector3().subVectors(p3, p2).normalize();
          const dot = Math.min(Math.max(v1.dot(v2), -1.0), 1.0);
          const angleRad = Math.acos(dot);
          const angleDeg = angleRad * (180 / Math.PI);

          this.createPlanningAngle(p1, p2, p3, angleDeg);
          this.clearPlanningPoints();

          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
          return;
      }

      if (this.planningMode === 'point' && this.planningPoints.length === 1) {
          const p = this.planningPoints[0];
          this.createPlanningPoint(p, 0.2); // default 0.2mm
          this.clearPlanningPoints();
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
          return;
      }

      if (this.planningMode === 'annotation' && this.planningPoints.length === 1) {
          const p = this.planningPoints[0];
          const normal = this.planningNormals && this.planningNormals[0] ? this.planningNormals[0] : null;

          if (this.resnappingAnnotationId) {
              const resnapId = this.resnappingAnnotationId;
              this.resnappingAnnotationId = null;
              this.updateAnnotationPosition(resnapId, p, normal);
              this.clearPlanningPoints();
              this.setPlanningMode('none');
              if (this.config.onPlanningObjectsChange) {
                  this.config.onPlanningObjectsChange(this.planningObjects);
              }
              return;
          }

          this.createPlanningAnnotation(p, normal);
          this.clearPlanningPoints();
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
          return;
      }

      if (this.config.onPlanningPointsChange) {
          this.config.onPlanningPointsChange(this.planningPoints.length);
      }
      if (this.config.onMeasurementChange) {
          this.config.onMeasurementChange(this.calculateMeasurement());
      }
      this.viewer.viewer.Render();
  }

  undoPlanningPoint() {
      if (this.planningPoints.length > 0) {
          this.planningPoints.pop();
          this.planningNormals.pop();
          const marker = this.planningPointMarkers.pop();
          if (marker) {
              const scene = this.viewer?.viewer?.scene || this.viewer?.viewer?.mainScene;
              if (scene) scene.remove(marker);
              if (marker.geometry) marker.geometry.dispose();
              if (marker.material) marker.material.dispose();
          }
          // If measure mode line is also present, pop it too
          if (this.planningMode === 'measure' && this.planningPointMarkers.length > 0) {
              const lineMarker = this.planningPointMarkers.pop();
              if (lineMarker) {
                  const scene = this.viewer?.viewer?.scene || this.viewer?.viewer?.mainScene;
                  if (scene) scene.remove(lineMarker);
                  if (lineMarker.geometry) lineMarker.geometry.dispose();
                  if (lineMarker.material) lineMarker.material.dispose();
              }
          }

          if (this.config.onPlanningPointsChange) {
              this.config.onPlanningPointsChange(this.planningPoints.length);
          }
          if (this.config.onMeasurementChange) {
              this.config.onMeasurementChange(this.calculateMeasurement());
          }
          if (this.viewer && this.viewer.viewer) {
              this.viewer.viewer.Render();
          }
      }
  }

  calculateMeasurement() {
      if (!window.THREE || this.planningPoints.length < 2) return null;
      const p1 = this.planningPoints[0];
      const p2 = this.planningPoints[1];
      const distance = p1.distanceTo(p2);
      
      let angle = 0;
      if (this.planningNormals.length >= 2) {
          const n1 = this.planningNormals[0];
          const n2 = this.planningNormals[1];
          const dot = Math.min(Math.max(n1.dot(n2), -1.0), 1.0);
          const angleRad = Math.acos(dot);
          angle = angleRad * (180 / Math.PI);
      }
      return { distance, angle };
  }

  confirmPlanningObject(options: { planeExtWidth?: number, planeExtLength?: number, cylinderRadius?: number, cylinderExtension?: number, curveThickness?: number } = {}) {
      if (this.planningMode === 'plane' && this.planningPoints.length === 3) {
          this.createPlanningPlane(this.planningPoints[0], this.planningPoints[1], this.planningPoints[2], options.planeExtWidth, options.planeExtLength);
          this.setPlanningMode('none');
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
          this.saveToLocalStorage();
      } else if (this.planningMode === 'cylinder' && this.planningPoints.length === 2) {
          this.createPlanningCylinder(this.planningPoints[0], this.planningPoints[1], options.cylinderRadius, options.cylinderExtension);
          this.setPlanningMode('none');
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
          this.saveToLocalStorage();
      } else if (this.planningMode === 'measure' && this.planningPoints.length === 2) {
          const m = this.calculateMeasurement();
          const angle = m ? m.angle : 0;
          this.createPlanningMeasurement(this.planningPoints[0], this.planningPoints[1], angle);
          this.setPlanningMode('none');
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
          this.saveToLocalStorage();
      } else if (this.planningMode === 'curve' && this.planningPoints.length >= 2) {
          this.createPlanningCurve(this.planningPoints, options.curveThickness !== undefined ? options.curveThickness : 0.2);
          this.setPlanningMode('none');
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
          this.saveToLocalStorage();
      }
  }

  createPlanningPlane(p1: any, p2: any, p3: any, extWidth?: number, extLength?: number) {
      if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (!scene) return;

      const THREE = window.THREE;
      
      const center = new THREE.Vector3().addVectors(p1, p2).add(p3).divideScalar(3);
      const v1 = new THREE.Vector3().subVectors(p2, p1);
      const v2 = new THREE.Vector3().subVectors(p3, p1);
      const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
      
      // Calculate base dimensions from selected points
      const baseWidth = p1.distanceTo(p2);
      
      const lineDir = new THREE.Vector3().copy(v1).normalize();
      // Distance from p3 to line p1-p2
      const baseLength = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(p3, p1), lineDir).length();

      const width = baseWidth + (extWidth !== undefined ? extWidth : 10);
      const height = baseLength + (extLength !== undefined ? extLength : 10);

      // thin BoxGeometry (default 0mm thickness)
      const thickness = 0.0;
      const geometry = new THREE.BoxGeometry(width, height, thickness);
      const material = new THREE.MeshBasicMaterial({ 
          color: 0x00ff00, 
          transparent: true, 
          opacity: 0.5,
          depthTest: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 999;
      
      // Orient the plane
      const testNormal = new THREE.Vector3(0, 0, 1);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(testNormal, normal);
      
      const yAxis = new THREE.Vector3().crossVectors(normal, lineDir).normalize();
      const basis = new THREE.Matrix4().makeBasis(lineDir, yAxis, normal);
      quaternion.setFromRotationMatrix(basis);

      mesh.quaternion.copy(quaternion);
      mesh.position.copy(center);

      // Add a wireframe outline to "illustrate planning"
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00aa00, linewidth: 2, depthTest: false });
      const line = new THREE.LineSegments(edges, lineMaterial);
              line.userData.isEdge = true;
              mesh.add(line);

      mesh.userData = { isCustomOverlay: true };
      scene.add(mesh);
      this.viewer.viewer.Render();

      const defaultIdAndName = `Plane_${this.nextPlanningObjectId++}`;
      this.planningObjects.push({
          id: defaultIdAndName,
          name: defaultIdAndName,
          type: 'plane',
          mesh,
          width,
          height,
          thickness,
          baseWidth,
          baseLength,
          extWidth: extWidth !== undefined ? extWidth : 10,
          extLength: extLength !== undefined ? extLength : 10,
          color: '#00ff00',
          p1: { x: p1.x, y: p1.y, z: p1.z },
          p2: { x: p2.x, y: p2.y, z: p2.z },
          p3: { x: p3.x, y: p3.y, z: p3.z }
      });
  }

  createPlanningCylinder(p1: any, p2: any, customRadius?: number, customExtension?: number) {
      if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (!scene) return;

      const THREE = window.THREE;

      const distance = p1.distanceTo(p2);
      const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const direction = new THREE.Vector3().subVectors(p2, p1).normalize();

      const radius = customRadius || 0.5; // Default diameter 1mm => radius 0.5
      const extension = customExtension !== undefined ? customExtension : 20; // 20mm default extension
      const length = distance + (extension * 2);

      // CylinderGeometry is along Y axis by default
      const geometry = new THREE.CylinderGeometry(radius, radius, length, 32);
      const material = new THREE.MeshBasicMaterial({ 
          color: 0x0000ff, 
          transparent: true, 
          opacity: 0.5,
          depthTest: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 999;

      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
      mesh.quaternion.copy(quaternion);
      mesh.position.copy(center);

      // Add a wireframe outline to "illustrate planning"
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000aa, linewidth: 2, depthTest: false });
      const line = new THREE.LineSegments(edges, lineMaterial);
              line.userData.isEdge = true;
              mesh.add(line);

      mesh.userData = { isCustomOverlay: true };
      scene.add(mesh);
      this.viewer.viewer.Render();

      const defaultIdAndName = `Cylinder_${this.nextPlanningObjectId++}`;
      this.planningObjects.push({
          id: defaultIdAndName,
          name: defaultIdAndName,
          type: 'cylinder',
          mesh,
          radius,
          length,
          baseDistance: distance,
          color: '#0000ff',
          diameter: radius * 2,
          extension,
          p1: { x: p1.x, y: p1.y, z: p1.z },
          p2: { x: p2.x, y: p2.y, z: p2.z }
      });
  }

  createPlanningCurve(points: any[], thickness: number) {
      if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (!scene) return;

      const THREE = window.THREE;
      
      const curve = new THREE.CatmullRomCurve3(points);
      const radius = thickness / 2;
      const tubularSegments = Math.max(20, points.length * 10);
      const radialSegments = 8;
      const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
      
      const material = new THREE.MeshBasicMaterial({ 
          color: 0xdb2777, // pink-600 to match lucide colors normally
          transparent: true, 
          opacity: 0.6,
          depthTest: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 999;

      // Add a wireframe outline to "illustrate planning"
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x9d174d, linewidth: 2, depthTest: false });
      const line = new THREE.LineSegments(edges, lineMaterial);
              line.userData.isEdge = true;
              mesh.add(line);

      mesh.userData = { isCustomOverlay: true };
      scene.add(mesh);
      this.viewer.viewer.Render();

      const defaultIdAndName = `Curve_${this.nextPlanningObjectId++}`;
      this.planningObjects.push({
          id: defaultIdAndName,
          name: defaultIdAndName,
          type: 'curve',
          mesh,
          thickness,
          baseDistance: curve.getLength(),
          curvePath: curve,
          pointsCount: points.length,
          color: '#db2777',
          points: points.map(p => ({ x: p.x, y: p.y, z: p.z }))
      });
  }

  projectToScreen(point: any) {
      if (!window.THREE || !this.viewer || !this.viewer.viewer || !this.viewer.viewer.camera) {
          return null;
      }
      const camera = this.viewer.viewer.camera;
      const canvas = this.container;
      if (!camera || !canvas) return null;

      const vector = point.clone();
      vector.project(camera);

      // Convert from normalized device coordinates (NDC) to pixel coordinates
      const rect = canvas.getBoundingClientRect();
      const x = (vector.x * .5 + .5) * rect.width;
      const y = (-(vector.y * .5) + .5) * rect.height;

      // Also return z so we can tell if it's behind the camera
      return { x, y, z: vector.z };
  }


  createPlanningMeasurement(p1: any, p2: any, angle: number, cardOffset?: { x: number, y: number }) {
      if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (!scene) return;

      const THREE = window.THREE;

      const distance = p1.distanceTo(p2);
      const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const direction = new THREE.Vector3().subVectors(p2, p1).normalize();

      const radius = 0.05; // Sleek 0.1mm diameter tube
      const length = distance;

      // CylinderGeometry is along Y axis by default
      const geometry = new THREE.CylinderGeometry(radius, radius, length, 16);
      const material = new THREE.MeshBasicMaterial({ 
          color: 0x10b981, 
          transparent: true, 
          opacity: 0.8,
          depthTest: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 999;

      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
      mesh.quaternion.copy(quaternion);
      mesh.position.copy(center);

      // Add a line outline too
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x059669, linewidth: 2, depthTest: false });
      const line = new THREE.LineSegments(edges, lineMaterial);
      line.userData.isEdge = true;
      mesh.add(line);

      const defaultIdAndName = `Measurement_${this.nextPlanningObjectId++}`;
      const displayText = `${distance.toFixed(2)} mm`;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'measurement-callout-pill absolute z-40 cursor-grab active:cursor-grabbing pointer-events-auto select-none font-mono text-[11px] font-semibold text-white bg-slate-900/90 hover:bg-slate-800 border rounded-full px-2.5 py-0.5 shadow-lg whitespace-nowrap flex items-center gap-1.5 backdrop-blur-xs hover:scale-105';
      labelDiv.style.borderColor = '#10b981';
      labelDiv.style.transform = 'translate(-50%, -100%)';
      labelDiv.style.opacity = '0';
      labelDiv.style.touchAction = 'none';
      const tooltipSuffix = '\n(Drag to reposition card • Double-click to reset position)';
      labelDiv.title = `${defaultIdAndName} (${displayText})` + tooltipSuffix;

      const dot = document.createElement('span');
      dot.className = 'measurement-color-dot w-2 h-2 rounded-full shrink-0 shadow-xs pointer-events-none';
      dot.style.backgroundColor = '#10b981';
      labelDiv.appendChild(dot);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'measurement-label-text tracking-tight pointer-events-none';
      labelSpan.textContent = displayText;
      labelDiv.appendChild(labelSpan);

      const measurementObj: any = {
          id: defaultIdAndName,
          name: defaultIdAndName,
          type: 'measurement',
          mesh,
          labelSprite: null,
          p2, // Save the second point for 2D overlay use
          labelDiv,
          radius,
          length,
          baseDistance: distance,
          angle: angle,
          color: '#10b981',
          p1: { x: p1.x, y: p1.y, z: p1.z },
          p2Coord: { x: p2.x, y: p2.y, z: p2.z },
          cardOffset: cardOffset ? { x: Math.round(cardOffset.x), y: Math.round(cardOffset.y) } : { x: 0, y: 0 },
          leaderLine: null,
          visible: true
      };

      // Pointer drag interaction for measurement card
      let isPointerDown = false;
      let startX = 0;
      let startY = 0;
      let origOffsetX = 0;
      let origOffsetY = 0;
      let isDraggingCard = false;

      labelDiv.addEventListener('pointerdown', (e: PointerEvent) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          isPointerDown = true;
          isDraggingCard = false;
          startX = e.clientX;
          startY = e.clientY;
          origOffsetX = measurementObj.cardOffset?.x || 0;
          origOffsetY = measurementObj.cardOffset?.y || 0;
          labelDiv.style.cursor = 'grabbing';
          try {
              labelDiv.setPointerCapture(e.pointerId);
          } catch(err) {}
      });

      labelDiv.addEventListener('pointermove', (e: PointerEvent) => {
          if (!isPointerDown) return;
          e.stopPropagation();
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          if (Math.hypot(dx, dy) > 2) {
              isDraggingCard = true;
          }
          if (isDraggingCard) {
              measurementObj.cardOffset = {
                  x: Math.round(origOffsetX + dx),
                  y: Math.round(origOffsetY + dy)
              };
              this.updatePlanningCardLabel(measurementObj);
          }
      });

      const onPointerEnd = (e: PointerEvent) => {
          if (!isPointerDown) return;
          isPointerDown = false;
          labelDiv.style.cursor = 'grab';
          try {
              if (labelDiv.hasPointerCapture(e.pointerId)) {
                  labelDiv.releasePointerCapture(e.pointerId);
              }
          } catch(err) {}

          if (isDraggingCard) {
              e.stopPropagation();
              this.saveToLocalStorage();
              if (this.config.onPlanningObjectsChange) {
                  this.config.onPlanningObjectsChange(this.planningObjects);
              }
          } else {
              this.highlightPlanningMesh(measurementObj);
              if (this.config.onTransformActiveChange) {
                  this.config.onTransformActiveChange(false);
              }
          }
      };

      labelDiv.addEventListener('pointerup', onPointerEnd);
      labelDiv.addEventListener('pointercancel', onPointerEnd);

      labelDiv.addEventListener('dblclick', (e: MouseEvent) => {
          e.stopPropagation();
          measurementObj.cardOffset = { x: 0, y: 0 };
          this.updatePlanningCardLabel(measurementObj);
          this.saveToLocalStorage();
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
      });

      this.container.appendChild(labelDiv);
      mesh.userData = { isCustomOverlay: true };
      scene.add(mesh);
      this.planningObjects.push(measurementObj);
      this.updatePlanningCardLabel(measurementObj);
      this.viewer.viewer.Render();
      this.saveToLocalStorage();
      return measurementObj;
  }

  createPlanningPoint(point: any, diameter: number) {
      if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (!scene) return;

      const THREE = window.THREE;
      const radius = diameter / 2;
      const geometry = new THREE.SphereGeometry(radius, 32, 32);
      const material = new THREE.MeshBasicMaterial({ 
          color: 0x9333ea, // Purple-600 feeling
          transparent: true, 
          opacity: 0.9,
          depthTest: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 999;
      mesh.position.copy(point);

      // Outline
      const edges = new THREE.EdgesGeometry(geometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x7e22ce, linewidth: 2, depthTest: false });
      const line = new THREE.LineSegments(edges, edgeMaterial);
      mesh.add(line);

      mesh.userData = { isCustomOverlay: true };
      scene.add(mesh);
      this.viewer.viewer.Render();

      const defaultIdAndName = `Point_${this.nextPlanningObjectId++}`;
      this.planningObjects.push({
          id: defaultIdAndName,
          name: defaultIdAndName,
          type: 'point',
          mesh: mesh,
          labelSprite: null,
          diameter: diameter,
          color: '#9333ea',
          points: [{ x: point.x, y: point.y, z: point.z }]
      });
  }

  createPlanningAnnotation(point: any, normal?: any, text?: string, description?: string, color: string = '#0284c7', pinSize: number = 1.5, cardOffset?: { x: number, y: number }) {
      if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (!scene) return;

      const THREE = window.THREE;
      const defaultIdAndName = `Annotation_${this.nextPlanningObjectId++}`;
      const actualText = text || defaultIdAndName;
      const actualColor = color || '#0284c7';

      // 3D Pin Group
      const pinGroup = new THREE.Group();

      // Pin Head (bead)
      const headRadius = pinSize;
      const headGeo = new THREE.SphereGeometry(headRadius, 24, 24);
      const headMat = new THREE.MeshBasicMaterial({ color: actualColor, depthTest: false });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      // Position head on top of pointer stem
      const stemHeight = pinSize * 4;
      headMesh.position.y = stemHeight;
      pinGroup.add(headMesh);

      // Inner white dot for contrast
      const eyeGeo = new THREE.SphereGeometry(headRadius * 0.35, 16, 16);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
      const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
      eyeMesh.position.y = stemHeight;
      pinGroup.add(eyeMesh);

      // Slender pointer stem (cone pointing down to (0,0,0))
      const stemGeo = new THREE.ConeGeometry(pinSize * 0.35, stemHeight, 16);
      const stemMat = new THREE.MeshBasicMaterial({ color: actualColor, depthTest: false });
      const stemMesh = new THREE.Mesh(stemGeo, stemMat);
      stemMesh.position.y = stemHeight / 2;
      pinGroup.add(stemMesh);

      // Base landing ring on surface
      const ringGeo = new THREE.RingGeometry(pinSize * 0.2, pinSize * 0.6, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: actualColor, side: THREE.DoubleSide, depthTest: false });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      pinGroup.add(ringMesh);

      pinGroup.position.copy(point);
      if (normal) {
          const normVec = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
          const upAxis = new THREE.Vector3(0, 1, 0);
          const quat = new THREE.Quaternion().setFromUnitVectors(upAxis, normVec);
          pinGroup.quaternion.copy(quat);
      }

      pinGroup.renderOrder = 999;
      pinGroup.userData = { isCustomOverlay: true, planningObjectId: defaultIdAndName, isAnnotation: true };
      scene.add(pinGroup);

      // Interactive DOM callout badge (draggable in viewport)
      const labelDiv = document.createElement('div');
      labelDiv.className = 'annotation-callout-pill absolute z-40 cursor-grab active:cursor-grabbing pointer-events-auto select-none font-sans text-[11px] font-semibold text-white bg-slate-900/90 hover:bg-slate-800 border rounded-full px-2.5 py-0.5 shadow-lg whitespace-nowrap flex items-center gap-1.5 backdrop-blur-xs hover:scale-105';
      labelDiv.style.borderColor = actualColor;
      labelDiv.style.transform = 'translate(-50%, -100%)';
      labelDiv.style.opacity = '0';
      labelDiv.style.touchAction = 'none';
      const tooltipSuffix = '\n(Drag to reposition card • Double-click to reset position)';
      labelDiv.title = (description ? `${actualText}\n${description}` : actualText) + tooltipSuffix;

      const dot = document.createElement('span');
      dot.className = 'annotation-color-dot w-2 h-2 rounded-full shrink-0 shadow-xs pointer-events-none';
      dot.style.backgroundColor = actualColor;
      labelDiv.appendChild(dot);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'annotation-label-text tracking-tight pointer-events-none';
      labelSpan.textContent = actualText;
      labelDiv.appendChild(labelSpan);

      const annotationObj: any = {
          id: defaultIdAndName,
          name: actualText,
          text: actualText,
          description: description || '',
          type: 'annotation',
          position: { x: point.x, y: point.y, z: point.z },
          normal: normal ? { x: normal.x, y: normal.y, z: normal.z } : null,
          pinSize: pinSize,
          mesh: pinGroup,
          labelDiv: labelDiv,
          color: actualColor,
          cardOffset: cardOffset ? { x: Math.round(cardOffset.x), y: Math.round(cardOffset.y) } : { x: 0, y: 0 },
          leaderLine: null,
          visible: true
      };

      // Pointer drag interaction
      let isPointerDown = false;
      let startX = 0;
      let startY = 0;
      let origOffsetX = 0;
      let origOffsetY = 0;
      let isDraggingCard = false;

      labelDiv.addEventListener('pointerdown', (e: PointerEvent) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          isPointerDown = true;
          isDraggingCard = false;
          startX = e.clientX;
          startY = e.clientY;
          origOffsetX = annotationObj.cardOffset?.x || 0;
          origOffsetY = annotationObj.cardOffset?.y || 0;
          labelDiv.style.cursor = 'grabbing';
          try {
              labelDiv.setPointerCapture(e.pointerId);
          } catch(err) {}
      });

      labelDiv.addEventListener('pointermove', (e: PointerEvent) => {
          if (!isPointerDown) return;
          e.stopPropagation();
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          if (Math.hypot(dx, dy) > 2) {
              isDraggingCard = true;
          }
          if (isDraggingCard) {
              annotationObj.cardOffset = {
                  x: Math.round(origOffsetX + dx),
                  y: Math.round(origOffsetY + dy)
              };
              this.updateSingleAnnotationLabel(annotationObj);
          }
      });

      const onPointerEnd = (e: PointerEvent) => {
          if (!isPointerDown) return;
          isPointerDown = false;
          labelDiv.style.cursor = 'grab';
          try {
              if (labelDiv.hasPointerCapture(e.pointerId)) {
                  labelDiv.releasePointerCapture(e.pointerId);
              }
          } catch(err) {}

          if (isDraggingCard) {
              e.stopPropagation();
              this.saveToLocalStorage();
              if (this.config.onPlanningObjectsChange) {
                  this.config.onPlanningObjectsChange(this.planningObjects);
              }
          } else {
              // Clicked without drag: simply highlight
              this.highlightPlanningMesh(annotationObj);
              if (this.config.onTransformActiveChange) {
                  this.config.onTransformActiveChange(false);
              }
          }
      };

      labelDiv.addEventListener('pointerup', onPointerEnd);
      labelDiv.addEventListener('pointercancel', onPointerEnd);

      // Double-click resets card position directly back to the pin tip
      labelDiv.addEventListener('dblclick', (e: MouseEvent) => {
          e.stopPropagation();
          annotationObj.cardOffset = { x: 0, y: 0 };
          this.updateSingleAnnotationLabel(annotationObj);
          this.saveToLocalStorage();
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
      });

      this.container.appendChild(labelDiv);

      this.planningObjects.push(annotationObj);
      this.updateSingleAnnotationLabel(annotationObj);
      this.viewer.viewer.Render();
      this.saveToLocalStorage();
      return annotationObj;
  }

  ensureAnnotationSvgOverlay(): SVGSVGElement {
      if (this.annotationSvgOverlay && this.annotationSvgOverlay.parentElement) {
          return this.annotationSvgOverlay;
      }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'planning-leader-overlay absolute inset-0 pointer-events-none w-full h-full z-30');
      svg.style.position = 'absolute';
      svg.style.left = '0';
      svg.style.top = '0';
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.pointerEvents = 'none';
      svg.style.overflow = 'visible';
      this.container.appendChild(svg);
      this.annotationSvgOverlay = svg;
      return svg;
  }

  updateCardLeaderLine(obj: any, anchorX: number, anchorY: number, cardX: number, cardY: number) {
      const hasOffset = obj.cardOffset && (Math.abs(obj.cardOffset.x) > 1 || Math.abs(obj.cardOffset.y) > 1);
      const svg = this.ensureAnnotationSvgOverlay();
      const defaultColor = obj.type === 'angle' ? '#d97706' : (obj.type === 'measurement' ? '#10b981' : '#0284c7');

      if (!obj.leaderLine) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('stroke', obj.color || defaultColor);
          line.setAttribute('stroke-width', '1.5');
          line.setAttribute('stroke-dasharray', '3,3');
          line.setAttribute('stroke-linecap', 'round');
          svg.appendChild(line);
          obj.leaderLine = line;
      }

      if (hasOffset && obj.visible !== false) {
          obj.leaderLine.setAttribute('x1', String(anchorX));
          obj.leaderLine.setAttribute('y1', String(anchorY));
          obj.leaderLine.setAttribute('x2', String(cardX));
          obj.leaderLine.setAttribute('y2', String(cardY));
          obj.leaderLine.setAttribute('stroke', obj.color || defaultColor);
          obj.leaderLine.style.display = 'block';
      } else {
          obj.leaderLine.style.display = 'none';
      }
  }

  updateAnnotationLeaderLine(obj: any, pinX: number, pinY: number, cardX: number, cardY: number) {
      this.updateCardLeaderLine(obj, pinX, pinY, cardX, cardY);
  }

  updatePlanningCardLabel(obj: any) {
      if (!obj || !obj.labelDiv || !['annotation', 'measurement', 'angle'].includes(obj.type)) return;
      if (!window.THREE) return;

      let targetPos: any = null;
      if (obj.type === 'annotation') {
          if (obj.mesh && obj.mesh.position) {
              targetPos = obj.mesh.position;
          } else if (obj.position) {
              targetPos = new window.THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
          }
      } else if (obj.type === 'measurement') {
          if (obj.mesh && obj.mesh.position) {
              targetPos = obj.mesh.position;
          } else if (obj.p1 && (obj.p2Coord || obj.p2)) {
              const p2 = obj.p2Coord || obj.p2;
              targetPos = new window.THREE.Vector3(
                  (obj.p1.x + p2.x) * 0.5,
                  (obj.p1.y + p2.y) * 0.5,
                  (obj.p1.z + p2.z) * 0.5
              );
          }
      } else if (obj.type === 'angle') {
          const vertex = obj.p2Coord || obj.p2;
          if (vertex) {
              targetPos = new window.THREE.Vector3(vertex.x, vertex.y, vertex.z);
          }
      }

      if (targetPos) {
          const screen = this.projectToScreen(targetPos);
          if (screen && screen.z < 1 && obj.visible !== false) {
              const offsetX = obj.cardOffset?.x || 0;
              const offsetY = obj.cardOffset?.y || 0;
              const yAnchorShift = obj.type === 'annotation' ? -18 : -14;
              const cardX = screen.x + offsetX;
              const cardY = screen.y + yAnchorShift + offsetY;

              obj.labelDiv.style.left = `${cardX}px`;
              obj.labelDiv.style.top = `${cardY}px`;
              obj.labelDiv.style.opacity = '1';
              obj.labelDiv.style.display = 'flex';

              this.updateCardLeaderLine(obj, screen.x, screen.y, cardX, cardY);
          } else {
              obj.labelDiv.style.opacity = '0';
              obj.labelDiv.style.display = 'none';
              if (obj.leaderLine) {
                  obj.leaderLine.style.display = 'none';
              }
          }
      }
  }

  updateSingleAnnotationLabel(obj: any) {
      this.updatePlanningCardLabel(obj);
  }

  updateAnnotationPosition(id: string, newPoint: any, newNormal?: any) {
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj || !window.THREE) return;

      const THREE = window.THREE;
      obj.position = { x: newPoint.x, y: newPoint.y, z: newPoint.z };
      if (newNormal) {
          obj.normal = { x: newNormal.x, y: newNormal.y, z: newNormal.z };
      }

      if (obj.mesh) {
          obj.mesh.position.copy(newPoint);
          if (newNormal) {
              const normalVec = new THREE.Vector3(newNormal.x, newNormal.y, newNormal.z).normalize();
              const upAxis = new THREE.Vector3(0, 1, 0);
              const quat = new THREE.Quaternion().setFromUnitVectors(upAxis, normalVec);
              obj.mesh.quaternion.copy(quat);
          }
      }

      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
      if (this.viewer?.viewer) {
          this.viewer.viewer.Render();
      }
  }

  updatePlanningAnnotation(id: string, updates: { text?: string; description?: string; color?: string; pinSize?: number }) {
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj) return;

      if (updates.text !== undefined) {
          obj.text = updates.text;
          obj.name = updates.text;
      }
      if (updates.description !== undefined) {
          obj.description = updates.description;
      }
      if (updates.color !== undefined) {
          obj.color = updates.color;
          this.updateMeshColorAndVisibility(obj);
      }
      if (updates.pinSize !== undefined && obj.mesh) {
          obj.pinSize = updates.pinSize;
          const scale = updates.pinSize / 1.5;
          obj.mesh.scale.set(scale, scale, scale);
      }

      if (obj.labelDiv) {
          const labelSpan = obj.labelDiv.querySelector('.annotation-label-text');
          if (labelSpan) {
              labelSpan.textContent = obj.text || obj.name;
          } else {
              obj.labelDiv.innerText = obj.text || obj.name;
          }
          if (obj.color) {
              obj.labelDiv.style.borderColor = obj.color;
              const dot = obj.labelDiv.querySelector('.annotation-color-dot') as HTMLElement;
              if (dot) dot.style.backgroundColor = obj.color;
          }
          obj.labelDiv.title = obj.description ? `${obj.text || obj.name}\n${obj.description}` : (obj.text || obj.name);
      }

      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
      if (this.viewer?.viewer) {
          this.viewer.viewer.Render();
      }
  }

  focusOnPlanningObject(id: string) {
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj || !this.viewer || !this.viewer.viewer) return;
      const nav = this.viewer.viewer.navigation;
      if (!nav) return;

      const THREE = window.THREE;
      if (!THREE) return;

      let targetPos = new THREE.Vector3();
      if (obj.position) {
          targetPos.set(obj.position.x, obj.position.y, obj.position.z);
      } else if (obj.mesh) {
          obj.mesh.getWorldPosition(targetPos);
      } else if (obj.points && obj.points[0]) {
          targetPos.set(obj.points[0].x, obj.points[0].y, obj.points[0].z);
      } else if (obj.p2) {
          targetPos.set(obj.p2.x, obj.p2.y, obj.p2.z);
      } else {
          return;
      }

      const curCam = nav.GetCamera();
      if (!curCam) return;

      const eye = new THREE.Vector3(curCam.eye.x, curCam.eye.y, curCam.eye.z);
      const center = new THREE.Vector3(curCam.center.x, curCam.center.y, curCam.center.z);
      const up = new THREE.Vector3(curCam.up.x, curCam.up.y, curCam.up.z);
      
      let dir = new THREE.Vector3().subVectors(eye, center).normalize();
      if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
      const currentDist = eye.distanceTo(center);
      const focusDist = Math.max(25, Math.min(currentDist, 120));
      
      const newEye = new THREE.Vector3().copy(targetPos).addScaledVector(dir, focusDist);

      if (nav && typeof nav.SetCamera === 'function') {
          const startEye = eye.clone();
          const startCenter = center.clone();
          const startTime = performance.now();
          const duration = 350;

          const step = (now: number) => {
              const elapsed = now - startTime;
              const t = Math.min(1, elapsed / duration);
              const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);

              const curE = new THREE.Vector3().lerpVectors(startEye, newEye, ease);
              const curC = new THREE.Vector3().lerpVectors(startCenter, targetPos, ease);

              const animCam = new window.OV.Camera(
                  new window.OV.Coord3D(curE.x, curE.y, curE.z),
                  new window.OV.Coord3D(curC.x, curC.y, curC.z),
                  new window.OV.Coord3D(up.x, up.y, up.z),
                  curCam.fov || 45.0
              );
              nav.SetCamera(animCam);
              if (this.viewer?.viewer) {
                  this.viewer.viewer.Render();
              }

              if (t < 1) {
                  requestAnimationFrame(step);
              }
          };
          requestAnimationFrame(step);
      }
      this.highlightPlanningMesh(obj);
      if (this.config.onTransformActiveChange) {
          const supportsTransform = ['plane', 'cylinder', 'custom_model'].includes(obj.type);
          this.config.onTransformActiveChange(supportsTransform, supportsTransform ? obj.id : undefined);
      }
  }

  startResnappingAnnotation(id: string) {
      this.resnappingAnnotationId = id;
      this.setPlanningMode('annotation');
  }

  createPlanningAngle(p1: any, p2: any, p3: any, angle: number, cardOffset?: { x: number, y: number }) {
      if (!window.THREE || !this.viewer || !this.viewer.viewer) return;
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (!scene) return;

      const THREE = window.THREE;
      const group = new THREE.Group();

      const createArm = (ptStart: any, ptEnd: any, colorHex: number) => {
          const dist = ptStart.distanceTo(ptEnd);
          const center = new THREE.Vector3().addVectors(ptStart, ptEnd).multiplyScalar(0.5);
          const direction = new THREE.Vector3().subVectors(ptEnd, ptStart).normalize();
          
          const radius = 0.05;
          const geometry = new THREE.CylinderGeometry(radius, radius, dist, 16);
          const material = new THREE.MeshBasicMaterial({
              color: colorHex,
              transparent: true,
              opacity: 0.8,
              depthTest: false
          });
          const armMesh = new THREE.Mesh(geometry, material);
          armMesh.renderOrder = 999;

          const up = new THREE.Vector3(0, 1, 0);
          const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
          armMesh.quaternion.copy(quaternion);
          armMesh.position.copy(center);

          const edges = new THREE.EdgesGeometry(geometry);
          const lineMaterial = new THREE.LineBasicMaterial({ color: 0xd97706, linewidth: 2, depthTest: false });
          const line = new THREE.LineSegments(edges, lineMaterial);
          armMesh.add(line);

          return armMesh;
      };

      const arm1 = createArm(p1, p2, 0xd97706);
      const arm2 = createArm(p3, p2, 0xd97706);
      group.add(arm1);
      group.add(arm2);

      const v1 = new THREE.Vector3().subVectors(p1, p2);
      const v2 = new THREE.Vector3().subVectors(p3, p2);
      const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();

      const d1 = v1.clone().normalize();
      const d2 = v2.clone().normalize();
      
      const arcRadius = Math.min(v1.length(), v2.length()) * 0.15 || 5;
      const segmentsCount = 24;
      const arcPoints: any[] = [];
      
      for (let i = 0; i <= segmentsCount; i++) {
          const t = i / segmentsCount;
          const angleBetween = d1.angleTo(d2);
          const dir = d1.clone().applyAxisAngle(normal, angleBetween * t);
          arcPoints.push(new THREE.Vector3().copy(p2).add(dir.multiplyScalar(arcRadius)));
      }

      const curve = new THREE.CatmullRomCurve3(arcPoints);
      const tubeGeom = new THREE.TubeGeometry(curve, segmentsCount, 0.05, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.9, depthTest: false });
      const tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
      tubeMesh.renderOrder = 999;
      group.add(tubeMesh);

      const defaultIdAndName = `Angle_${this.nextPlanningObjectId++}`;
      const displayText = `${angle.toFixed(1)}°`;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'angle-callout-pill absolute z-40 cursor-grab active:cursor-grabbing pointer-events-auto select-none font-mono text-[11px] font-semibold text-white bg-slate-900/90 hover:bg-slate-800 border rounded-full px-2.5 py-0.5 shadow-lg whitespace-nowrap flex items-center gap-1.5 backdrop-blur-xs hover:scale-105';
      labelDiv.style.borderColor = '#d97706';
      labelDiv.style.transform = 'translate(-50%, -100%)';
      labelDiv.style.opacity = '0';
      labelDiv.style.touchAction = 'none';
      const tooltipSuffix = '\n(Drag to reposition card • Double-click to reset position)';
      labelDiv.title = `${defaultIdAndName} (${displayText})` + tooltipSuffix;

      const dot = document.createElement('span');
      dot.className = 'angle-color-dot w-2 h-2 rounded-full shrink-0 shadow-xs pointer-events-none';
      dot.style.backgroundColor = '#d97706';
      labelDiv.appendChild(dot);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'angle-label-text tracking-tight pointer-events-none';
      labelSpan.textContent = displayText;
      labelDiv.appendChild(labelSpan);

      const angleObj: any = {
          id: defaultIdAndName,
          name: defaultIdAndName,
          type: 'angle',
          mesh: group,
          labelSprite: null,
          p2: p2,
          labelDiv,
          p1: { x: p1.x, y: p1.y, z: p1.z },
          p2Coord: { x: p2.x, y: p2.y, z: p2.z },
          p3: { x: p3.x, y: p3.y, z: p3.z },
          angle: angle,
          color: '#d97706',
          cardOffset: cardOffset ? { x: Math.round(cardOffset.x), y: Math.round(cardOffset.y) } : { x: 0, y: 0 },
          leaderLine: null,
          visible: true
      };

      // Pointer drag interaction for angle card
      let isPointerDown = false;
      let startX = 0;
      let startY = 0;
      let origOffsetX = 0;
      let origOffsetY = 0;
      let isDraggingCard = false;

      labelDiv.addEventListener('pointerdown', (e: PointerEvent) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          isPointerDown = true;
          isDraggingCard = false;
          startX = e.clientX;
          startY = e.clientY;
          origOffsetX = angleObj.cardOffset?.x || 0;
          origOffsetY = angleObj.cardOffset?.y || 0;
          labelDiv.style.cursor = 'grabbing';
          try {
              labelDiv.setPointerCapture(e.pointerId);
          } catch(err) {}
      });

      labelDiv.addEventListener('pointermove', (e: PointerEvent) => {
          if (!isPointerDown) return;
          e.stopPropagation();
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          if (Math.hypot(dx, dy) > 2) {
              isDraggingCard = true;
          }
          if (isDraggingCard) {
              angleObj.cardOffset = {
                  x: Math.round(origOffsetX + dx),
                  y: Math.round(origOffsetY + dy)
              };
              this.updatePlanningCardLabel(angleObj);
          }
      });

      const onPointerEnd = (e: PointerEvent) => {
          if (!isPointerDown) return;
          isPointerDown = false;
          labelDiv.style.cursor = 'grab';
          try {
              if (labelDiv.hasPointerCapture(e.pointerId)) {
                  labelDiv.releasePointerCapture(e.pointerId);
              }
          } catch(err) {}

          if (isDraggingCard) {
              e.stopPropagation();
              this.saveToLocalStorage();
              if (this.config.onPlanningObjectsChange) {
                  this.config.onPlanningObjectsChange(this.planningObjects);
              }
          } else {
              this.highlightPlanningMesh(angleObj);
              if (this.config.onTransformActiveChange) {
                  this.config.onTransformActiveChange(false);
              }
          }
      };

      labelDiv.addEventListener('pointerup', onPointerEnd);
      labelDiv.addEventListener('pointercancel', onPointerEnd);

      labelDiv.addEventListener('dblclick', (e: MouseEvent) => {
          e.stopPropagation();
          angleObj.cardOffset = { x: 0, y: 0 };
          this.updatePlanningCardLabel(angleObj);
          this.saveToLocalStorage();
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
      });

      this.container.appendChild(labelDiv);
      group.userData = { isCustomOverlay: true };
      scene.add(group);
      this.planningObjects.push(angleObj);
      this.updatePlanningCardLabel(angleObj);
      this.viewer.viewer.Render();
      this.saveToLocalStorage();
      return angleObj;
  }

  updatePlanningObjectName(id: string, name: string) {
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj) return;
      obj.name = name;
      
      if (obj.labelDiv) {
          const tooltipSuffix = '\n(Drag to reposition card • Double-click to reset position)';
          if (obj.type === 'angle') {
              const text = obj.name ? `${obj.name} (${obj.angle.toFixed(1)}°)` : `${obj.angle.toFixed(1)}°`;
              const labelSpan = obj.labelDiv.querySelector('.angle-label-text');
              if (labelSpan) {
                  labelSpan.textContent = text;
              } else {
                  obj.labelDiv.innerText = text;
              }
              obj.labelDiv.title = text + tooltipSuffix;
          } else if (obj.type === 'annotation') {
              obj.text = name;
              const labelSpan = obj.labelDiv.querySelector('.annotation-label-text');
              if (labelSpan) {
                  labelSpan.textContent = name;
              } else {
                  obj.labelDiv.innerText = name;
              }
              obj.labelDiv.title = (obj.description ? `${name}\n${obj.description}` : name) + tooltipSuffix;
          } else if (obj.baseDistance !== undefined || obj.type === 'measurement') {
              const text = obj.name ? `${obj.name} (${obj.baseDistance.toFixed(2)} mm)` : `${obj.baseDistance.toFixed(2)} mm`;
              const labelSpan = obj.labelDiv.querySelector('.measurement-label-text');
              if (labelSpan) {
                  labelSpan.textContent = text;
              } else {
                  obj.labelDiv.innerText = text;
              }
              obj.labelDiv.title = text + tooltipSuffix;
          }
      }

      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
  }

  updatePlanningObjectScale(id: string, updates: { scaleX?: number, scaleY?: number, scaleZ?: number }) {
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj) return;

      if (updates.scaleX !== undefined) {
          obj.scaleX = updates.scaleX;
          obj.mesh.scale.x = updates.scaleX;
      }
      if (updates.scaleY !== undefined) {
          obj.scaleY = updates.scaleY;
          obj.mesh.scale.y = updates.scaleY;
      }
      if (updates.scaleZ !== undefined) {
          obj.scaleZ = updates.scaleZ;
          obj.mesh.scale.z = updates.scaleZ;
      }

      if (this.viewer && this.viewer.viewer) {
          this.viewer.viewer.Render();
      }
      
      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
  }

  updatePlaneGeometry(id: string, extSize: number, thickness: number) {
      const THREE = window.THREE;
      if (!THREE) return;
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj || obj.type !== 'plane' || obj.baseWidth === undefined || obj.baseLength === undefined) return;

      if (obj.mesh.geometry) obj.mesh.geometry.dispose();

      const width = obj.baseWidth + extSize;
      const height = obj.baseLength + extSize;
      const renderThickness = Math.abs(thickness);

      // Create geometry centered at (0, 0, 0)
      const newGeometry = new THREE.BoxGeometry(width, height, renderThickness);
      // Offset geometry locally by thickness/2 so it sits to one side or the other of the baseline/zero-plane
      newGeometry.translate(0, 0, thickness / 2);
      obj.mesh.geometry = newGeometry;

      // Update line segments (wireframe outline overlay)
      const toRemove = obj.mesh.children.filter((child: any) => child.isLineSegments || child.type === 'LineSegments');
      toRemove.forEach((child: any) => {
          if (child.geometry && typeof child.geometry.dispose === 'function') {
              try { child.geometry.dispose(); } catch(e){}
          }
          if (child.material && typeof child.material.dispose === 'function') {
              try { child.material.dispose(); } catch(e){}
          }
          obj.mesh.remove(child);
      });

      const edges = new THREE.EdgesGeometry(newGeometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00aa00, linewidth: 2, depthTest: false });
      const line = new THREE.LineSegments(edges, lineMaterial);
      obj.mesh.add(line);

      obj.extWidth = extSize;
      obj.extLength = extSize;
      obj.width = width;
      obj.height = height;
      obj.thickness = thickness;

      if (this.viewer && this.viewer.viewer) {
          this.viewer.viewer.Render();
      }

      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
  }

  updateCylinderGeometry(id: string, diameter: number, extension: number) {
      const THREE = window.THREE;
      if (!THREE) return;
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj || obj.type !== 'cylinder' || obj.baseDistance === undefined) return;

      if (obj.mesh.geometry) obj.mesh.geometry.dispose();

      const radius = diameter / 2;
      const length = obj.baseDistance + (extension * 2);

      const newGeometry = new THREE.CylinderGeometry(radius, radius, length, 32);
      obj.mesh.geometry = newGeometry;

      // Update line segments (wireframe outline overlay)
      const toRemove = obj.mesh.children.filter((child: any) => child.isLineSegments || child.type === 'LineSegments');
      toRemove.forEach((child: any) => {
          if (child.geometry && typeof child.geometry.dispose === 'function') {
              try { child.geometry.dispose(); } catch(e){}
          }
          if (child.material && typeof child.material.dispose === 'function') {
              try { child.material.dispose(); } catch(e){}
          }
          obj.mesh.remove(child);
      });

      const edges = new THREE.EdgesGeometry(newGeometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000aa, linewidth: 2, depthTest: false });
      const line = new THREE.LineSegments(edges, lineMaterial);
      obj.mesh.add(line);

      obj.radius = radius;
      obj.length = length;
      obj.diameter = diameter;
      obj.extension = extension;

      if (this.viewer && this.viewer.viewer) {
          this.viewer.viewer.Render();
      }

      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
  }

  updatePlanningObjectCurveThickness(id: string, thickness: number) {
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj || obj.type !== 'curve' || !obj.curvePath) return;
      
      const THREE = window.THREE;
      if (!THREE) return;

      if (obj.mesh.geometry) obj.mesh.geometry.dispose();

      const radius = thickness / 2;
      const tubularSegments = Math.max(20, obj.pointsCount * 10);
      const radialSegments = 8;
      
      const newGeometry = new THREE.TubeGeometry(obj.curvePath, tubularSegments, radius, radialSegments, false);
      obj.mesh.geometry = newGeometry;
      
      const toRemove = obj.mesh.children.filter((child: any) => child.isLineSegments || child.type === 'LineSegments');
      toRemove.forEach((child: any) => {
          if (child.geometry && typeof child.geometry.dispose === 'function') {
              try { child.geometry.dispose(); } catch(e){}
          }
          if (child.material && typeof child.material.dispose === 'function') {
              try { child.material.dispose(); } catch(e){}
          }
          obj.mesh.remove(child);
      });

      const edges = new THREE.EdgesGeometry(newGeometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x9d174d, linewidth: 2, depthTest: false });
      const line = new THREE.LineSegments(edges, lineMaterial);
      obj.mesh.add(line);

      obj.thickness = thickness;

      if (this.viewer && this.viewer.viewer) {
          this.viewer.viewer.Render();
      }
      
      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
  }

  updatePlanningPointDiameter(id: string, diameter: number) {
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj || obj.type !== 'point') return;
      
      const THREE = window.THREE;
      if (!THREE) return;

      if (obj.mesh.geometry) obj.mesh.geometry.dispose();

      const radius = diameter / 2;
      const newGeometry = new THREE.SphereGeometry(radius, 32, 32);
      obj.mesh.geometry = newGeometry;
      
      // Update outline geometry
      const toRemove = obj.mesh.children.filter((child: any) => child.isLineSegments || child.type === 'LineSegments');
      toRemove.forEach((child: any) => {
          if (child.geometry && typeof child.geometry.dispose === 'function') {
              try { child.geometry.dispose(); } catch(e){}
          }
          if (child.material && typeof child.material.dispose === 'function') {
              try { child.material.dispose(); } catch(e){}
          }
          obj.mesh.remove(child);
      });

      const edges = new THREE.EdgesGeometry(newGeometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x7e22ce, linewidth: 2, depthTest: false });
      const line = new THREE.LineSegments(edges, edgeMaterial);
      obj.mesh.add(line);
      
      obj.diameter = diameter;
      
      if (this.viewer?.viewer) {
          try { this.viewer.viewer.Render(); } catch(e) {}
      }
      
      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      
      this.saveToLocalStorage();
  }

  updatePlanningObjectTransform(id: string, updates: { posX?: number, posY?: number, posZ?: number, rotX?: number, rotY?: number, rotZ?: number }) {
      if (!window.THREE) return;
      const THREE = window.THREE;
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj) return;
      
      if (updates.posX !== undefined) obj.mesh.position.x = updates.posX;
      if (updates.posY !== undefined) obj.mesh.position.y = updates.posY;
      if (updates.posZ !== undefined) obj.mesh.position.z = updates.posZ;

      if (updates.rotX !== undefined || updates.rotY !== undefined || updates.rotZ !== undefined) {
          const rx = updates.rotX !== undefined ? THREE.MathUtils.degToRad(updates.rotX) : obj.mesh.rotation.x;
          const ry = updates.rotY !== undefined ? THREE.MathUtils.degToRad(updates.rotY) : obj.mesh.rotation.y;
          const rz = updates.rotZ !== undefined ? THREE.MathUtils.degToRad(updates.rotZ) : obj.mesh.rotation.z;
          obj.mesh.rotation.set(rx, ry, rz);
      }

      this.viewer.viewer.Render();
      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
  }

  // --- Curved Anatomical Fly-Through (Virtual Endoscopy / Vessel Probe) ---

  getCurves(): any[] {
    return (this.planningObjects || []).filter(o => o.type === 'curve');
  }

  startFlyThrough(curveId?: string, autoPlay: boolean = false): boolean {
    if (!window.THREE || !this.viewer?.viewer?.navigation) return false;
    const curves = this.getCurves();
    if (curves.length === 0) return false;

    const target = curveId ? curves.find(c => c.id === curveId) : curves[0];
    if (!target) return false;

    // Ensure CatmullRomCurve3 is constructed
    if (!target.curvePath && target.points && target.points.length >= 2) {
      const pts = target.points.map((p: any) => new window.THREE.Vector3(p.x, p.y, p.z));
      target.curvePath = new window.THREE.CatmullRomCurve3(pts);
    }
    if (!target.curvePath) return false;

    const nav = this.viewer.viewer.navigation;
    if (!this.flyThroughState.active) {
      // Save current camera for clean restoration on exit
      if (typeof nav.GetCamera === 'function') {
        this.preFlyThroughCamera = nav.GetCamera();
      } else if (nav.camera) {
        const threeCam = nav.camera;
        this.preFlyThroughCamera = new window.OV.Camera(
          new window.OV.Coord3D(threeCam.position.x, threeCam.position.y, threeCam.position.z),
          new window.OV.Coord3D(nav.controls?.target?.x || 0, nav.controls?.target?.y || 0, nav.controls?.target?.z || 0),
          new window.OV.Coord3D(threeCam.up.x, threeCam.up.y, threeCam.up.z),
          threeCam.fov || 45.0
        );
      }
      const threeCamera = this.viewer?.viewer?.camera || this.viewer?.viewer?.navigation?.camera;
      if (threeCamera) {
        if (typeof threeCamera.fov === 'number') {
          this.preFlyThroughFov = threeCamera.fov;
        }
        if (typeof threeCamera.near === 'number') {
          this.preFlyThroughNear = threeCamera.near;
          threeCamera.near = 0.05;
        }
        if (typeof threeCamera.updateProjectionMatrix === 'function') {
          try { threeCamera.updateProjectionMatrix(); } catch(e) {}
        }
      }
    }

    const totalDistance = target.curvePath.getLength() || target.baseDistance || 100;
    this.flyThroughState = {
      ...this.flyThroughState,
      active: true,
      isPlaying: autoPlay, // user request: don't automatically start playing when changed to virtual endoscopy
      curveId: target.id,
      curveName: target.name || target.id,
      totalDistance: totalDistance,
      currentDistance: this.flyThroughState.progress * totalDistance,
    };
    this.flyThroughUpVector = null;
    this.lastFlyThroughTimestamp = performance.now();

    this.updateFlyThroughCamera();
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
    return true;
  }

  pauseFlyThrough() {
    this.flyThroughState.isPlaying = false;
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  resumeFlyThrough() {
    if (!this.flyThroughState.active) {
      this.startFlyThrough(this.flyThroughState.curveId || undefined);
      return;
    }
    this.flyThroughState.isPlaying = true;
    this.lastFlyThroughTimestamp = performance.now();
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  stopFlyThrough() {
    this.flyThroughState.active = false;
    this.flyThroughState.isPlaying = false;

    if (this.preFlyThroughCamera && this.viewer?.viewer?.navigation) {
      this.viewer.viewer.navigation.SetCamera(this.preFlyThroughCamera);
      const threeCamera = this.viewer?.viewer?.camera || this.viewer?.viewer?.navigation?.camera;
      if (threeCamera) {
        if (this.preFlyThroughFov !== null && typeof threeCamera.fov === 'number') {
          threeCamera.fov = this.preFlyThroughFov;
        }
        if (this.preFlyThroughNear !== null && typeof threeCamera.near === 'number') {
          threeCamera.near = this.preFlyThroughNear;
        }
        if (typeof threeCamera.updateProjectionMatrix === 'function') {
          try { threeCamera.updateProjectionMatrix(); } catch(e) {}
        }
      }
      if (this.viewer?.viewer) {
        try { this.viewer.viewer.Render(); } catch(e) {}
      }
    }
    this.preFlyThroughCamera = null;
    this.preFlyThroughNear = null;
    this.preFlyThroughFov = null;
    this.flyThroughUpVector = null;

    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  setFlyThroughProgress(prog: number) {
    this.flyThroughState.progress = Math.max(0, Math.min(1, prog));
    this.flyThroughState.currentDistance = this.flyThroughState.progress * (this.flyThroughState.totalDistance || 100);
    this.updateFlyThroughCamera();
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  stepFlyThroughDistance(deltaMm: number) {
    if (!this.flyThroughState.active) return;
    const totalDist = Math.max(0.6, this.flyThroughState.totalDistance || 100);
    const deltaProgress = deltaMm / totalDist;
    const newProgress = Math.max(0.0, Math.min(1.0, this.flyThroughState.progress + deltaProgress));
    this.setFlyThroughProgress(newProgress);
  }

  setFlyThroughSpeed(speed: number) {
    this.flyThroughState.speed = speed;
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  setFlyThroughDirection(dir: 1 | -1) {
    this.flyThroughState.direction = dir;
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  setFlyThroughLoop(loop: boolean) {
    this.flyThroughState.loop = loop;
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  setFlyThroughFov(fov: number) {
    this.flyThroughState.fov = fov;
    this.updateFlyThroughCamera();
    if (this.viewer?.viewer) {
      try { this.viewer.viewer.Render(); } catch(e) {}
    }
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  setFlyThroughReticle(show: boolean) {
    this.flyThroughState.showReticle = show;
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  setFlyThroughLookTrim(yaw: number, pitch: number) {
    this.flyThroughState.yawOffset = yaw;
    this.flyThroughState.pitchOffset = pitch;
    this.updateFlyThroughCamera();
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  setFlyThroughPathOffset(offsetX: number, offsetY: number) {
    this.flyThroughState.pathOffsetX = offsetX;
    this.flyThroughState.pathOffsetY = offsetY;
    this.updateFlyThroughCamera();
    if (this.config.onFlyThroughStateChange) {
      this.config.onFlyThroughStateChange({ ...this.flyThroughState });
    }
  }

  updateFlyThroughCamera() {
    if (!this.flyThroughState.active || !this.viewer?.viewer?.navigation || !window.THREE || !window.OV) return;
    const curveObj = this.planningObjects.find(o => o.id === this.flyThroughState.curveId && o.type === 'curve');
    if (!curveObj || !curveObj.curvePath) return;

    const THREE = window.THREE;
    const curve = curveObj.curvePath;
    const t = Math.max(0.0001, Math.min(0.9999, this.flyThroughState.progress));

    const point = curve.getPointAt(t);
    const rawTangent = curve.getTangentAt(t).normalize();
    const dir = this.flyThroughState.direction;
    let forward = rawTangent.clone().multiplyScalar(dir);

    // Apply look trim (yaw and pitch inspection)
    if (this.flyThroughState.yawOffset !== 0 || this.flyThroughState.pitchOffset !== 0) {
      const tempUp = this.flyThroughUpVector || new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(forward, tempUp).normalize();
      if (this.flyThroughState.yawOffset !== 0) {
        forward.applyAxisAngle(tempUp, this.flyThroughState.yawOffset);
      }
      if (this.flyThroughState.pitchOffset !== 0) {
        forward.applyAxisAngle(right, this.flyThroughState.pitchOffset);
      }
      forward.normalize();
    }

    // Parallel transport up-vector calculation to prevent gimbal lock
    let currentUp = this.flyThroughUpVector ? this.flyThroughUpVector.clone() : new THREE.Vector3(0, 1, 0);
    let right = new THREE.Vector3().crossVectors(forward, currentUp);
    if (right.lengthSq() < 0.0001) {
      const alt = Math.abs(forward.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      right = new THREE.Vector3().crossVectors(forward, alt);
    }
    right.normalize();
    const correctedUp = new THREE.Vector3().crossVectors(right, forward).normalize();
    this.flyThroughUpVector = correctedUp;

    // Apply path offset from 3D spline curve (lateral and vertical/elevation offset)
    const offX = this.flyThroughState.pathOffsetX || 0;
    const offY = this.flyThroughState.pathOffsetY || 0;
    const eyePoint = point.clone();
    if (offX !== 0) {
      eyePoint.addScaledVector(right, offX);
    }
    if (offY !== 0) {
      eyePoint.addScaledVector(correctedUp, offY);
    }

    // Adaptive look ahead distance based on curve length
    const totalDist = this.flyThroughState.totalDistance || 100;
    const lookDistance = Math.max(1.5, Math.min(20.0, totalDist * 0.04));
    const targetPoint = new THREE.Vector3().copy(eyePoint).addScaledVector(forward, lookDistance);

    const nav = this.viewer.viewer.navigation;
    const currentFov = this.flyThroughState.fov || 75.0;
    const camera = new window.OV.Camera(
      new window.OV.Coord3D(eyePoint.x, eyePoint.y, eyePoint.z),
      new window.OV.Coord3D(targetPoint.x, targetPoint.y, targetPoint.z),
      new window.OV.Coord3D(correctedUp.x, correctedUp.y, correctedUp.z),
      currentFov
    );
    nav.SetCamera(camera);

    const threeCamera = this.viewer?.viewer?.camera || this.viewer?.viewer?.navigation?.camera;
    if (threeCamera) {
      if (typeof threeCamera.fov === 'number') {
        threeCamera.fov = currentFov;
      }
      if (typeof threeCamera.near === 'number') {
        threeCamera.near = 0.05;
      }
      if (typeof threeCamera.updateProjectionMatrix === 'function') {
        try { threeCamera.updateProjectionMatrix(); } catch(e) {}
      }
    }

    if (this.viewer?.viewer) {
      try { this.viewer.viewer.Render(); } catch(e) {}
    }
  }

  // --- Curved Spline Cross-Section Clipping (Anatomical Orthogonal Reslice) ---

  startSplineClipping(curveId?: string): boolean {
    if (!window.THREE || !this.viewer?.viewer?.navigation) return false;
    const curves = this.getCurves();
    if (curves.length === 0) return false;

    const target = curveId ? curves.find(c => c.id === curveId) : curves[0];
    if (!target || !target.curvePath) return false;

    // If virtual endoscopy is active, exit it cleanly first
    if (this.flyThroughState.active) {
      this.stopFlyThrough();
    }

    if (this.viewer?.viewer?.navigation?.GetCamera) {
      this.preSplineClipCamera = this.viewer.viewer.navigation.GetCamera();
    }

    const totalLength = target.curvePath.getLength();
    this.splineClippingState.active = true;
    this.splineClippingState.curveId = target.id;
    this.splineClippingState.curveName = target.name || 'Spline Path';
    this.splineClippingState.totalDistance = totalLength;
    this.splineClippingState.currentDistance = totalLength * this.splineClippingState.progress;

    if (this.viewer?.viewer?.renderer) {
      this.viewer.viewer.renderer.localClippingEnabled = true;
    }

    this.updateSplineClipping();
    this.focusOnSplineCrossSection();

    if (this.config.onSplineClippingStateChange) {
      this.config.onSplineClippingStateChange({ ...this.splineClippingState });
    }
    return true;
  }

  stopSplineClipping() {
    this.splineClippingState.active = false;

    // Remove clipping planes from meshes
    this.currentMeshes.forEach(mesh => {
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat: any) => {
          mat.clippingPlanes = null;
          mat.needsUpdate = true;
        });
      }
    });

    if (this.preSplineClipCamera && this.viewer?.viewer?.navigation) {
      try {
        this.viewer.viewer.navigation.SetCamera(this.preSplineClipCamera);
      } catch(e) {}
      this.preSplineClipCamera = null;
    }

    if (this.lastPlanesState) {
      this.updateClippingPlanes(this.lastPlanesState);
    }

    if (this.viewer?.viewer) {
      try { this.viewer.viewer.Render(); } catch(e) {}
    }

    if (this.config.onSplineClippingStateChange) {
      this.config.onSplineClippingStateChange({ ...this.splineClippingState });
    }
  }

  setSplineClippingProgress(progress: number, snapToInterval: boolean = true) {
    let p = Math.max(0.0001, Math.min(0.9999, progress));
    const totalDist = this.splineClippingState.totalDistance || 100;
    
    if (snapToInterval && totalDist > 0) {
      const intervalMm = 0.6;
      const currentDist = p * totalDist;
      const snappedDist = Math.max(0, Math.min(totalDist, Math.round(currentDist / intervalMm) * intervalMm));
      p = Math.max(0.0001, Math.min(0.9999, snappedDist / totalDist));
      this.splineClippingState.currentDistance = snappedDist;
    } else {
      this.splineClippingState.currentDistance = p * totalDist;
    }

    this.splineClippingState.progress = p;
    this.updateSplineClipping();

    if (this.splineClippingState.alignCamera) {
      this.alignCameraToSplineCrossSection();
    } else {
      this.focusOnSplineCrossSection();
    }

    if (this.config.onSplineClippingStateChange) {
      this.config.onSplineClippingStateChange({ ...this.splineClippingState });
    }
  }

  setSplineClippingDistance(distMm: number) {
    const totalDist = this.splineClippingState.totalDistance || 100;
    const intervalMm = 0.6;
    const clampedDist = Math.max(0, Math.min(totalDist, distMm));
    const snappedDist = Math.round(clampedDist / intervalMm) * intervalMm;
    const p = totalDist > 0 ? Math.max(0.0001, Math.min(0.9999, snappedDist / totalDist)) : 0.5;
    
    this.splineClippingState.progress = p;
    this.splineClippingState.currentDistance = snappedDist;
    this.updateSplineClipping();

    if (this.splineClippingState.alignCamera) {
      this.alignCameraToSplineCrossSection();
    } else {
      this.focusOnSplineCrossSection();
    }

    if (this.config.onSplineClippingStateChange) {
      this.config.onSplineClippingStateChange({ ...this.splineClippingState });
    }
  }

  stepSplineClippingDistance(deltaMm: number = 0.6) {
    const currentDist = this.splineClippingState.currentDistance !== undefined 
      ? this.splineClippingState.currentDistance 
      : (this.splineClippingState.progress * (this.splineClippingState.totalDistance || 100));
    this.setSplineClippingDistance(currentDist + deltaMm);
  }

  setSplineClippingInvert(invert: boolean) {
    this.splineClippingState.invert = invert;
    this.updateSplineClipping();
    if (this.splineClippingState.alignCamera) {
      this.alignCameraToSplineCrossSection();
    }
    if (this.config.onSplineClippingStateChange) {
      this.config.onSplineClippingStateChange({ ...this.splineClippingState });
    }
  }

  setSplineClippingAlignCamera(align: boolean) {
    this.splineClippingState.alignCamera = align;
    if (align) {
      this.alignCameraToSplineCrossSection();
    }
    if (this.config.onSplineClippingStateChange) {
      this.config.onSplineClippingStateChange({ ...this.splineClippingState });
    }
  }

  zoomSplineCrossSection(action: 'in' | 'out' | number) {
    if (!this.viewer?.viewer?.navigation || !window.OV || !window.THREE) return;
    const nav = this.viewer.viewer.navigation;
    const THREE = window.THREE;
    const cam = typeof nav.GetCamera === 'function' ? nav.GetCamera() : null;
    if (!cam) return;

    const curveObj = this.planningObjects.find(o => o.id === this.splineClippingState.curveId && o.type === 'curve');
    let targetPoint: any = null;
    if (curveObj && curveObj.curvePath) {
      targetPoint = curveObj.curvePath.getPointAt(this.splineClippingState.progress);
    }

    let factor = 1.0;
    if (action === 'in') {
      factor = 0.8;
    } else if (action === 'out') {
      factor = 1.25;
    } else if (typeof action === 'number') {
      factor = action;
    }

    const eyeVec = new THREE.Vector3(cam.eye.x, cam.eye.y, cam.eye.z);
    const centerVec = targetPoint 
      ? new THREE.Vector3(targetPoint.x, targetPoint.y, targetPoint.z) 
      : new THREE.Vector3(cam.center.x, cam.center.y, cam.center.z);

    const dir = new THREE.Vector3().subVectors(eyeVec, centerVec);
    const currentDist = dir.length();
    
    const newDist = Math.max(6, Math.min(2500, currentDist * factor));
    dir.normalize().multiplyScalar(newDist);
    const newEye = new THREE.Vector3().addVectors(centerVec, dir);

    nav.SetCamera(new window.OV.Camera(
      new window.OV.Coord3D(newEye.x, newEye.y, newEye.z),
      new window.OV.Coord3D(centerVec.x, centerVec.y, centerVec.z),
      cam.up,
      cam.fov
    ));

    let baseDist = 150;
    if (this.modelBBox && !this.modelBBox.isEmpty()) {
      const size = new THREE.Vector3();
      this.modelBBox.getSize(size);
      baseDist = Math.max(size.x, size.y, size.z);
    }
    this.splineClippingState.zoomLevel = Math.max(0.2, Math.min(5.0, baseDist / Math.max(newDist, 1)));

    if (this.viewer?.viewer) {
      try { this.viewer.viewer.Render(); } catch(e) {}
    }

    if (this.config.onSplineClippingStateChange) {
      this.config.onSplineClippingStateChange({ ...this.splineClippingState });
    }
  }

  setSplineClippingZoomLevel(level: number) {
    if (!this.viewer?.viewer?.navigation || !window.OV || !window.THREE) return;
    const nav = this.viewer.viewer.navigation;
    const THREE = window.THREE;
    const cam = typeof nav.GetCamera === 'function' ? nav.GetCamera() : null;
    if (!cam) return;

    const curveObj = this.planningObjects.find(o => o.id === this.splineClippingState.curveId && o.type === 'curve');
    let targetPoint: any = null;
    if (curveObj && curveObj.curvePath) {
      targetPoint = curveObj.curvePath.getPointAt(this.splineClippingState.progress);
    }

    const centerVec = targetPoint 
      ? new THREE.Vector3(targetPoint.x, targetPoint.y, targetPoint.z) 
      : new THREE.Vector3(cam.center.x, cam.center.y, cam.center.z);

    const eyeVec = new THREE.Vector3(cam.eye.x, cam.eye.y, cam.eye.z);
    const dir = new THREE.Vector3().subVectors(eyeVec, centerVec).normalize();

    let baseDist = 150;
    if (this.modelBBox && !this.modelBBox.isEmpty()) {
      const size = new THREE.Vector3();
      this.modelBBox.getSize(size);
      baseDist = Math.max(size.x, size.y, size.z);
    }

    const targetDist = Math.max(6, Math.min(2500, baseDist / Math.max(0.1, level)));
    const newEye = new THREE.Vector3().addVectors(centerVec, dir.multiplyScalar(targetDist));

    nav.SetCamera(new window.OV.Camera(
      new window.OV.Coord3D(newEye.x, newEye.y, newEye.z),
      new window.OV.Coord3D(centerVec.x, centerVec.y, centerVec.z),
      cam.up,
      cam.fov
    ));

    this.splineClippingState.zoomLevel = level;
    if (this.config.onSplineClippingStateChange) {
      this.config.onSplineClippingStateChange({ ...this.splineClippingState });
    }

    if (this.viewer?.viewer) {
      try { this.viewer.viewer.Render(); } catch(e) {}
    }
  }

  focusOnSplineCrossSection() {
    if (!this.viewer?.viewer?.navigation || !window.OV || !window.THREE) return;
    const nav = this.viewer.viewer.navigation;
    const THREE = window.THREE;
    const curveObj = this.planningObjects.find(o => o.id === this.splineClippingState.curveId && o.type === 'curve');
    if (!curveObj || !curveObj.curvePath) return;

    const t = Math.max(0.0001, Math.min(0.9999, this.splineClippingState.progress));
    const point = curveObj.curvePath.getPointAt(t);

    const cam = typeof nav.GetCamera === 'function' ? nav.GetCamera() : null;
    if (!cam) return;

    const delta = new THREE.Vector3(
      point.x - cam.center.x,
      point.y - cam.center.y,
      point.z - cam.center.z
    );

    nav.SetCamera(new window.OV.Camera(
      new window.OV.Coord3D(cam.eye.x + delta.x, cam.eye.y + delta.y, cam.eye.z + delta.z),
      new window.OV.Coord3D(point.x, point.y, point.z),
      cam.up,
      cam.fov
    ));

    if (this.viewer?.viewer) {
      try { this.viewer.viewer.Render(); } catch(e) {}
    }
  }

  alignCameraToSplineCrossSection() {
    if (!this.viewer?.viewer?.navigation || !window.OV || !window.THREE) return;
    const nav = this.viewer.viewer.navigation;
    const THREE = window.THREE;
    const curveObj = this.planningObjects.find(o => o.id === this.splineClippingState.curveId && o.type === 'curve');
    if (!curveObj || !curveObj.curvePath) return;

    const t = Math.max(0.0001, Math.min(0.9999, this.splineClippingState.progress));
    const point = curveObj.curvePath.getPointAt(t);
    const tangent = curveObj.curvePath.getTangentAt(t).normalize();
    const normal = this.splineClippingState.invert ? tangent.clone().negate() : tangent.clone();

    let dist = 120;
    if (this.modelBBox && !this.modelBBox.isEmpty()) {
      const size = new THREE.Vector3();
      this.modelBBox.getSize(size);
      dist = Math.max(size.x, size.y, size.z) * 0.8;
    }
    const currentCam = typeof nav.GetCamera === 'function' ? nav.GetCamera() : null;
    if (currentCam) {
      const d = new THREE.Vector3(currentCam.eye.x - currentCam.center.x, currentCam.eye.y - currentCam.center.y, currentCam.eye.z - currentCam.center.z).length();
      if (d > 10) dist = d;
    }

    // Invert the view vector so camera looks directly into the exposed cross-section face
    const viewNormal = normal.clone().negate();
    const eye = point.clone().add(viewNormal.clone().multiplyScalar(dist));
    let up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(viewNormal.y) > 0.88) {
      up = new THREE.Vector3(0, 0, 1);
    }
    const right = new THREE.Vector3().crossVectors(viewNormal, up).normalize();
    up.crossVectors(right, viewNormal).normalize();

    nav.SetCamera(new window.OV.Camera(
      new window.OV.Coord3D(eye.x, eye.y, eye.z),
      new window.OV.Coord3D(point.x, point.y, point.z),
      new window.OV.Coord3D(up.x, up.y, up.z),
      currentCam?.fov || 45.0
    ));

    if (this.viewer?.viewer) {
      try { this.viewer.viewer.Render(); } catch(e) {}
    }
  }

  updateSplineClipping() {
    if (!this.splineClippingState.active || !window.THREE) return;
    const curveObj = this.planningObjects.find(o => o.id === this.splineClippingState.curveId && o.type === 'curve');
    if (!curveObj || !curveObj.curvePath) return;

    const THREE = window.THREE;
    const curve = curveObj.curvePath;
    const t = Math.max(0.0001, Math.min(0.9999, this.splineClippingState.progress));
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normal = this.splineClippingState.invert ? tangent.clone().negate() : tangent.clone();

    if (!this.splineClipPlane) {
      this.splineClipPlane = new THREE.Plane();
    }
    this.splineClipPlane.setFromNormalAndCoplanarPoint(normal, point);

    const activePlanes = [this.splineClipPlane];
    this.currentMeshes.forEach(mesh => {
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat: any) => {
          mat.clippingPlanes = activePlanes;
          mat.clipShadows = true;
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        });
      }
    });

    if (this.viewer?.viewer) {
      try { this.viewer.viewer.Render(); } catch (e) {}
    }
  }

  generateSampleAnatomicalCurve(selectedMeshId?: number | null): string | null {
    if (!window.THREE) return null;
    const THREE = window.THREE;

    // 1. Identify target meshes based on user selection or displayed models
    let targetMeshes: any[] = [];
    let targetName = 'Model';

    if (selectedMeshId !== undefined && selectedMeshId !== null && this.currentMeshes && this.currentMeshes[selectedMeshId]) {
      const selectedMesh = this.currentMeshes[selectedMeshId];
      targetMeshes = [selectedMesh];
      targetName = selectedMesh.name || `Mesh_${selectedMeshId + 1}`;
    } else {
      // Filter displayed (visible) meshes
      targetMeshes = (this.currentMeshes || []).filter(m => m && m.visible !== false);
      if (targetMeshes.length === 0) {
        targetMeshes = this.currentMeshes || [];
      }
      targetName = 'Displayed_Model';
    }

    // Include custom planning models if no currentMeshes
    if (targetMeshes.length === 0) {
      const customModels = (this.planningObjects || []).filter(o => o.type === 'custom_model' && o.mesh && o.visible !== false);
      if (customModels.length > 0) {
        targetMeshes = customModels.map(o => o.mesh);
        targetName = 'Custom_Model';
      }
    }

    // 2. Compute accurate world-space bounding box of target meshes
    const targetBox = new THREE.Box3();
    targetMeshes.forEach(mesh => {
      try {
        mesh.updateWorldMatrix(true, false);
        const meshBox = new THREE.Box3().setFromObject(mesh);
        if (!meshBox.isEmpty()) {
          targetBox.union(meshBox);
        }
      } catch(e) {}
    });

    // Fallback if targetBox is still empty: scan scene directly
    if (targetBox.isEmpty()) {
      const scene = this.viewer?.viewer?.scene || this.viewer?.viewer?.mainScene;
      if (scene) {
        scene.traverse((child: any) => {
          if (child.isMesh && !this.isCustomOverlay(child)) {
            try {
              const b = new THREE.Box3().setFromObject(child);
              if (!b.isEmpty()) targetBox.union(b);
            } catch(e) {}
          }
        });
      }
    }

    let center = new THREE.Vector3(0, 0, 0);
    let size = new THREE.Vector3(80, 80, 80);
    let min = new THREE.Vector3(-40, -40, -40);

    if (!targetBox.isEmpty()) {
      targetBox.getCenter(center);
      targetBox.getSize(size);
      min = targetBox.min.clone();
      if (size.x < 1) size.x = 20;
      if (size.y < 1) size.y = 20;
      if (size.z < 1) size.z = 20;
    }

    // 3. Determine primary anatomical axis of elongation
    let primaryAxis: 'x' | 'y' | 'z' = 'y';
    if (size.z >= size.y && size.z >= size.x) primaryAxis = 'z';
    else if (size.x >= size.y && size.x >= size.z) primaryAxis = 'x';
    else primaryAxis = 'y';

    // 4. Collect world-space vertices from target meshes to find true anatomical lumen cross-sectional centroids
    const sampledWorldVertices: any[] = [];
    targetMeshes.forEach(mesh => {
      try {
        const geom = mesh.geometry;
        if (!geom || !geom.attributes || !geom.attributes.position) return;
        const posAttr = geom.attributes.position;
        const count = posAttr.count;
        if (count === 0) return;
        // Sample evenly up to 15,000 vertices for instant calculation
        const step = Math.max(1, Math.floor(count / 15000));
        const tempV = new THREE.Vector3();
        for (let i = 0; i < count; i += step) {
          tempV.fromBufferAttribute(posAttr, i);
          tempV.applyMatrix4(mesh.matrixWorld);
          sampledWorldVertices.push(tempV.clone());
        }
      } catch(e) {}
    });

    const points: any[] = [];
    const numPoints = 8;
    const minVal = min[primaryAxis];
    const maxVal = min[primaryAxis] + size[primaryAxis];
    const span = maxVal - minVal;
    const bandHalfWidth = (span / (numPoints - 1)) * 0.75;

    for (let i = 0; i < numPoints; i++) {
      // Stay between 8% and 92% of the structure so the path starts and ends inside the anatomical volume
      const frac = (i / (numPoints - 1)) * 0.84 + 0.08;
      const coordOnAxis = minVal + span * frac;

      let pt: any = null;

      if (sampledWorldVertices.length > 20) {
        let sumX = 0, sumY = 0, sumZ = 0, inSliceCount = 0;
        for (let j = 0; j < sampledWorldVertices.length; j++) {
          const v = sampledWorldVertices[j];
          if (Math.abs(v[primaryAxis] - coordOnAxis) <= bandHalfWidth) {
            sumX += v.x;
            sumY += v.y;
            sumZ += v.z;
            inSliceCount++;
          }
        }

        if (inSliceCount >= 3) {
          pt = new THREE.Vector3(sumX / inSliceCount, sumY / inSliceCount, sumZ / inSliceCount);
          pt[primaryAxis] = coordOnAxis; // maintain steady monotonic progression along primary axis
        }
      }

      // If vertex sampling yielded insufficient vertices for this slice, use geometric centerline
      if (!pt) {
        pt = center.clone();
        pt[primaryAxis] = coordOnAxis;
      }

      points.push(pt);
    }

    // 5. 3-point smoothing filter to prevent any geometric vertex jitter
    const smoothedPoints: any[] = [];
    for (let i = 0; i < points.length; i++) {
      if (i === 0 || i === points.length - 1) {
        smoothedPoints.push(points[i].clone());
      } else {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        const smoothed = new THREE.Vector3(
          prev.x * 0.25 + curr.x * 0.5 + next.x * 0.25,
          prev.y * 0.25 + curr.y * 0.5 + next.y * 0.25,
          prev.z * 0.25 + curr.z * 0.5 + next.z * 0.25
        );
        smoothed[primaryAxis] = curr[primaryAxis];
        smoothedPoints.push(smoothed);
      }
    }

    this.createPlanningCurve(smoothedPoints, 0.4);
    const createdCurve = this.planningObjects[this.planningObjects.length - 1];
    if (createdCurve) {
      const cleanName = targetName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 18);
      createdCurve.name = `Spline_${cleanName}_${this.nextPlanningObjectId - 1}`;
      if (this.config.onPlanningObjectsChange) {
        this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
      return createdCurve.id;
    }
    return null;
  }

  async importCustomPlanningModel(file: File) {
      if (!window.THREE || !window.THREE.STLLoader) {
          console.error('THREE.STLLoader not found');
          return;
      }
      
      const fileDataURL = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
      });

      const arrayBuffer = await file.arrayBuffer();
      const loader = new window.THREE.STLLoader();
      const geometry = loader.parse(arrayBuffer);

      if (!this.viewer || !this.viewer.viewer) return;
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (!scene) return;

      const THREE = window.THREE;
      const modelRoot = this.getModelRoot();
      if (modelRoot && THREE) { geometry.applyMatrix4(modelRoot.matrixWorld); }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const center = new window.THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      if (geometry.attributes && geometry.attributes.color) {
          geometry.deleteAttribute('color');
      }

      const material = new window.THREE.MeshStandardMaterial({
              color: 0x8b5cf6,
              transparent: true,
              opacity: 0.7,
              depthTest: true,
              depthWrite: true,
              side: window.THREE.DoubleSide,
              roughness: 0.35,
              metalness: 0.1
          });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 999;
      
      mesh.position.copy(center);

      mesh.userData = { isCustomOverlay: true };
      scene.add(mesh);
      
      this.viewer.viewer.Render();

      const defaultIdAndName = file.name.replace(/\.[^/.]+$/, "");
      this.planningObjects.push({
          id: `CustomModel_${this.nextPlanningObjectId++}`,
          name: defaultIdAndName,
          type: 'custom_model',
          mesh,
          color: '#8b5cf6',
          opacity: 0.7,
          fileName: file.name,
          fileDataURL
      });

      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
  }

  async duplicateSubmeshToPlanningObjects(meshIndex: number) {
      if (meshIndex < 0 || meshIndex >= this.currentMeshes.length) return null;
      this.clearHighlight();
      const sourceMesh = this.currentMeshes[meshIndex];
      if (!sourceMesh || !window.THREE) return null;

      const THREE = window.THREE;
      if (!this.viewer || !this.viewer.viewer) return null;
      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
      if (!scene) return null;

      if (!sourceMesh.geometry) return null;

      // Update sourceMesh world matrix
      sourceMesh.updateWorldMatrix(true, false);

      // Clone geometry
      const cloneGeo = sourceMesh.geometry.clone();
      
      cloneGeo.computeBoundingBox();
      const center = new THREE.Vector3();
      cloneGeo.boundingBox.getCenter(center);
      cloneGeo.translate(-center.x, -center.y, -center.z);

      if (cloneGeo.attributes && cloneGeo.attributes.color) {
          cloneGeo.deleteAttribute('color');
      }

      // Fresh clean material for overlay to avoid inheriting texture maps or vertex color conflicts
      const material = new THREE.MeshStandardMaterial({
          color: 0x8b5cf6, // purple default
          transparent: true,
          opacity: 0.7,
          depthTest: true,
          depthWrite: true,
          side: THREE.DoubleSide,
          roughness: 0.35,
          metalness: 0.1
      });

      const mesh = new THREE.Mesh(cloneGeo, material);
      sourceMesh.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.position.copy(center.clone().applyMatrix4(sourceMesh.matrixWorld));
      mesh.updateMatrixWorld(true);
      mesh.renderOrder = 999;

      mesh.userData = { isCustomOverlay: true };
      scene.add(mesh);

      let rawName = sourceMesh.name || (sourceMesh.parent && sourceMesh.parent.name ? sourceMesh.parent.name : `Submesh ${meshIndex + 1}`);
      let cleanName = rawName.replace(/\.\.\.$/, '').trim();
      if (!cleanName.toLowerCase().includes('copy')) {
          cleanName = `${cleanName} (Copy)`;
      }

      const newObj: any = {
          id: `CustomModel_${this.nextPlanningObjectId++}`,
          name: cleanName,
          type: 'custom_model',
          mesh,
          color: '#8b5cf6',
          opacity: 0.7,
          fileName: `${cleanName}.stl`,
          fileDataURL: ''
      };
      
      // Align the duplicated model with the rendering effect of all models
      this.updateMeshColorAndVisibility(newObj);
      
      const generatedStl = this.generateSTLString(newObj, true);
      if (generatedStl) {
          const blob = new Blob([generatedStl], { type: 'text/plain' });
          const fileDataURL = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target.result);
              reader.readAsDataURL(blob);
          });
          newObj.fileDataURL = fileDataURL;
      }

      this.planningObjects.push(newObj);

      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();

      if (this.viewer && this.viewer.viewer && typeof this.viewer.viewer.Render === 'function') {
          this.viewer.viewer.Render();
      }

      return newObj;
  }

  removePlanningObject(id: string) {
      const idx = this.planningObjects.findIndex(o => o.id === id);
      if (idx > -1) {
          const obj = this.planningObjects[idx];
          if (obj && obj.fileDataURL && typeof obj.fileDataURL === 'string' && obj.fileDataURL.startsWith('blob:')) {
              try { URL.revokeObjectURL(obj.fileDataURL); } catch(e) {}
          }
          if (this.transformControl && this.transformControl.object === obj.mesh) {
              this.transformControl.detach();
                    this.highlightPlanningMesh(null);
                    if (this.config.onTransformActiveChange) this.config.onTransformActiveChange(false);
          }
          if (this.viewer && this.viewer.viewer) {
             const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
             if (scene) {
                 scene.remove(obj.mesh);
                 if (obj.mesh) {
                     disposeHierarchy(obj.mesh);
                 }

                 if (obj.labelSprite) {
                     scene.remove(obj.labelSprite);
                     if (obj.labelSprite.material) {
                         if (obj.labelSprite.material.map) obj.labelSprite.material.map.dispose();
                         obj.labelSprite.material.dispose();
                     }
                 }

                 if (obj.labelDiv) {
                     if (obj.labelDiv.parentElement) {
                         obj.labelDiv.parentElement.removeChild(obj.labelDiv);
                     }
                 }

                 if (obj.leaderLine && obj.leaderLine.parentElement) {
                     obj.leaderLine.parentElement.removeChild(obj.leaderLine);
                 }

                 this.viewer.viewer.Render();
             }
          }
          this.planningObjects.splice(idx, 1);
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange(this.planningObjects);
          }
          this.saveToLocalStorage();
      }
  }

  addPlanningGroup(name: string) {
    const id = `group_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    this.planningGroups.push({ id, name, visible: true, isCollapsed: false });
    this.notifyGroupsChanged();
    this.saveToLocalStorage();
    return id;
  }

  renamePlanningGroup(groupId: string, name: string) {
    const group = this.planningGroups.find(g => g.id === groupId);
    if (group) {
      group.name = name;
      this.notifyGroupsChanged();
      this.saveToLocalStorage();
    }
  }

  setPlanningGroupCollapsed(groupId: string, collapsed: boolean) {
    const group = this.planningGroups.find(g => g.id === groupId);
    if (group) {
      group.isCollapsed = collapsed;
      this.notifyGroupsChanged();
      this.saveToLocalStorage();
    }
  }

  duplicatePlanningGroup(groupId: string) {
      const group = this.planningGroups.find(g => g.id === groupId);
      if (!group) return;

      // Find the next available suffix
      let baseName = group.name;
      // Strip existing suffix if it matches _N
      const match = baseName.match(/^(.*)_(\d+)$/);
      let nextNum = 1;
      if (match) {
          baseName = match[1];
          nextNum = parseInt(match[2]) + 1;
      }
      
      let newName = `${baseName}_${nextNum}`;
      while (this.planningGroups.some(g => g.name === newName)) {
          nextNum++;
          newName = `${baseName}_${nextNum}`;
      }

      const newGroupId = this.addPlanningGroup(newName);
      
      // Duplicate all objects in the group
      const objectsToDuplicate = this.planningObjects.filter(o => o.groupId === groupId);
      for (const obj of objectsToDuplicate) {
          const newObj = this.duplicatePlanningObject(obj.id, true);
          if (newObj) {
              newObj.groupId = newGroupId;
          }
      }
      
      this.notifyGroupsChanged();
      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange([...this.planningObjects]);
      }
      this.saveToLocalStorage();
  }

  removePlanningGroup(groupId: string, deleteAssociated: boolean = false) {
    const idx = this.planningGroups.findIndex(g => g.id === groupId);
    if (idx > -1) {
      this.planningGroups.splice(idx, 1);
      
      const objectsToHandle = this.planningObjects.filter(o => o.groupId === groupId);
      if (deleteAssociated) {
        // Delete each associated object
        objectsToHandle.forEach(o => this.removePlanningObject(o.id));
      } else {
        // Just move back to default group (unassigned)
        objectsToHandle.forEach(o => {
          o.groupId = undefined;
        });
      }
      
      this.notifyGroupsChanged();
      if (this.config.onPlanningObjectsChange) {
        this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
    }
  }

  setPlanningGroupVisibility(groupId: string, visible: boolean) {
    const group = this.planningGroups.find(g => g.id === groupId);
    if (group) {
      group.visible = visible;
      
      // Affect all planning objects in this group
      this.planningObjects.forEach(o => {
        if (o.groupId === groupId) {
          o.visible = visible;
          if (o.mesh) {
            o.mesh.visible = visible;
          }
          if (o.labelDiv) {
            o.labelDiv.style.display = visible ? 'block' : 'none';
          }
        }
      });
      
      this.notifyGroupsChanged();
      if (this.viewer?.viewer) {
        try { this.viewer.viewer.Render(); } catch(e) {}
      }
      if (this.config.onPlanningObjectsChange) {
        this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
    }
  }

  setPlanningObjectGroupId(id: string, groupId: string | undefined) {
    const obj = this.planningObjects.find(o => o.id === id);
    if (obj) {
      obj.groupId = groupId;
      this.saveToLocalStorage();
      if (this.config.onPlanningObjectsChange) {
        this.config.onPlanningObjectsChange(this.planningObjects);
      }
    }
  }

  togglePlanningObjectVisibility(id: string) {
    const obj = this.planningObjects.find(o => o.id === id);
    if (obj) {
      obj.visible = obj.visible !== undefined ? !obj.visible : false;
      if (obj.mesh) {
        obj.mesh.visible = obj.visible;
      }
      if (obj.labelDiv) {
        obj.labelDiv.style.display = obj.visible ? 'block' : 'none';
      }
      this.saveToLocalStorage();
      if (this.viewer?.viewer) {
        try { this.viewer.viewer.Render(); } catch(e) {}
      }
      if (this.config.onPlanningObjectsChange) {
        this.config.onPlanningObjectsChange(this.planningObjects);
      }
    }
  }

  notifyGroupsChanged() {
    if (this.config.onPlanningGroupsChange) {
      this.config.onPlanningGroupsChange([...this.planningGroups]);
    }
  }

  clearAllPlanningObjects(save: boolean = true) {
      if (this.transformControl) {
          this.transformControl.detach();
                    this.highlightPlanningMesh(null);
                    if (this.config.onTransformActiveChange) this.config.onTransformActiveChange(false);
      }
      if (this.viewer && this.viewer.viewer) {
          const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
          if (scene) {
              this.planningObjects.forEach(obj => {
                  if (obj && obj.fileDataURL && typeof obj.fileDataURL === 'string' && obj.fileDataURL.startsWith('blob:')) {
                      try { URL.revokeObjectURL(obj.fileDataURL); } catch(e) {}
                  }
                  scene.remove(obj.mesh);
                  if (obj.mesh) {
                      disposeHierarchy(obj.mesh);
                  }

                  if (obj.labelSprite) {
                      scene.remove(obj.labelSprite);
                      if (obj.labelSprite.material) {
                          if (obj.labelSprite.material.map && typeof obj.labelSprite.material.map.dispose === 'function') {
                              try { obj.labelSprite.material.map.dispose(); } catch(e){}
                          }
                          if (typeof obj.labelSprite.material.dispose === 'function') {
                              try { obj.labelSprite.material.dispose(); } catch(e){}
                          }
                      }
                  }

                  if (obj.labelDiv) {
                      if (obj.labelDiv.parentElement) {
                          obj.labelDiv.parentElement.removeChild(obj.labelDiv);
                      }
                  }

                  if (obj.leaderLine && obj.leaderLine.parentElement) {
                      obj.leaderLine.parentElement.removeChild(obj.leaderLine);
                  }
              });
              try { this.viewer.viewer.Render(); } catch(e){}
          }
      }
      this.planningObjects = [];
      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      if (save) {
          this.saveToLocalStorage();
      }
  }

  getModelRoot() {
      if (!window.THREE) return null;
      if (!this.currentMeshes || this.currentMeshes.length === 0) return null;
      
      const firstMesh = this.currentMeshes[0];
      const scene = this.viewer?.viewer?.scene || this.viewer?.viewer?.mainScene;
      if (!scene) return null;
      
      let current = firstMesh;
      let modelRoot = firstMesh;
      while (current.parent && current.parent !== scene) {
          modelRoot = current.parent;
          current = current.parent;
      }
      return modelRoot;
  }

  generateSTLString(obj: any, useModelCoordinates: boolean = true): string | null {
      if (obj.type === 'measurement' || obj.type === 'angle') return null;
      if (!window.THREE) return null;
      const THREE = window.THREE;
      const mesh = obj.mesh;
      const geometry = mesh?.geometry;
      if (!geometry || !geometry.isBufferGeometry) return null;
      
      const cloneGeo = geometry.clone();
      
      if (mesh) mesh.updateMatrixWorld?.(true);
      let transformMatrix = mesh.matrixWorld.clone();
      let isModelAligned = false;
      
      if (useModelCoordinates) {
          const modelRoot = this.getModelRoot();
          if (modelRoot) {
              modelRoot.updateMatrixWorld?.(true);
              const invModelMatrix = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert();
              // Apply inverse model so points are in model's local space
              transformMatrix.premultiply(invModelMatrix);
              isModelAligned = true;
          }
      }
      
      cloneGeo.applyMatrix4(transformMatrix);

      // Coordinate System Metadata embedded in the STL solid description line
      const cleanName = (obj.name || obj.id).replace(/\s+/g, '_');
      const csLabel = isModelAligned 
        ? "coordinate_system=Loaded_Model_Space_LPS" 
        : "coordinate_system=Right-Handed_Cartesian";
      let stl = `solid ${cleanName} ${csLabel} units=millimeter origin=0,0,0\n`;

      const positionAttr = cloneGeo.getAttribute('position');
      const indexAttr = cloneGeo.getIndex();
      
      const vA = new THREE.Vector3();
      const vB = new THREE.Vector3();
      const vC = new THREE.Vector3();
      const cb = new THREE.Vector3();
      const ab = new THREE.Vector3();

      const addFacet = (a: number, b: number, c: number) => {
          vA.fromBufferAttribute(positionAttr, a);
          vB.fromBufferAttribute(positionAttr, b);
          vC.fromBufferAttribute(positionAttr, c);

          cb.subVectors(vC, vB);
          ab.subVectors(vA, vB);
          cb.cross(ab).normalize();

          stl += `  facet normal ${cb.x} ${cb.y} ${cb.z}\n`;
          stl += `    outer loop\n`;
          stl += `      vertex ${vA.x} ${vA.y} ${vA.z}\n`;
          stl += `      vertex ${vB.x} ${vB.y} ${vB.z}\n`;
          stl += `      vertex ${vC.x} ${vC.y} ${vC.z}\n`;
          stl += `    endloop\n`;
          stl += `  endfacet\n`;
      };

      if (indexAttr) {
          for (let i = 0; i < indexAttr.count; i += 3) {
              addFacet(indexAttr.getX(i), indexAttr.getX(i+1), indexAttr.getX(i+2));
          }
      } else {
          for (let i = 0; i < positionAttr.count; i += 3) {
              addFacet(i, i+1, i+2);
          }
      }
      
      stl += `endsolid ${cleanName}\n`;
      return stl;
  }

  duplicatePlanningObject(id: string, isGroupDuplicate: boolean = false): any {
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj || !window.THREE) return null;
      
      const prevLength = this.planningObjects.length;

      if (obj.type === 'plane') {
          this.createPlanningPlane(
              new window.THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z),
              new window.THREE.Vector3(obj.p2.x, obj.p2.y, obj.p2.z),
              new window.THREE.Vector3(obj.p3.x, obj.p3.y, obj.p3.z),
              obj.extWidth,
              obj.extLength
          );
          if (this.planningObjects.length > prevLength) {
              const newObj = this.planningObjects[this.planningObjects.length - 1];
              this.updatePlaneGeometry(newObj.id, obj.extWidth || 0, obj.thickness || 0);
          }
      } else if (obj.type === 'cylinder') {
          this.createPlanningCylinder(
              new window.THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z),
              new window.THREE.Vector3(obj.p2.x, obj.p2.y, obj.p2.z),
              obj.diameter / 2,
              obj.extension
          );
      } else if (obj.type === 'curve') {
          this.createPlanningCurve(
              obj.points.map((p: any) => new window.THREE.Vector3(p.x, p.y, p.z)),
              obj.thickness
          );
      } else if (obj.type === 'point' && obj.points && obj.points.length > 0) {
          this.createPlanningPoint(
              new window.THREE.Vector3(obj.points[0].x, obj.points[0].y, obj.points[0].z),
              obj.diameter || 0.2
          );
      } else if (obj.type === 'annotation') {
          this.createPlanningAnnotation(
              new window.THREE.Vector3(obj.position.x, obj.position.y, obj.position.z),
              obj.normal ? new window.THREE.Vector3(obj.normal.x, obj.normal.y, obj.normal.z) : null,
              isGroupDuplicate ? (obj.text || obj.name) : `${obj.text || obj.name} (Copy)`,
              obj.description,
              obj.color,
              obj.pinSize
          );
      } else if (obj.type === 'custom_model') {
          const meshClone = obj.mesh.clone();
          if (meshClone.children) {
              const edgeChildren = meshClone.children.filter((c: any) => c.isLineSegments || c.type === 'LineSegments' || c.userData?.isEdge);
              edgeChildren.forEach((c: any) => meshClone.remove(c));
          }
          if (meshClone.material) {
              if (Array.isArray(meshClone.material)) {
                  meshClone.material = meshClone.material.map((m: any) => m.clone());
              } else {
                  meshClone.material = meshClone.material.clone();
              }
          }
          if (this.viewer && this.viewer.viewer) {
              const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
              if (scene) scene.add(meshClone);
          }
          this.planningObjects.push({
              id: `CustomModel_${this.nextPlanningObjectId++}`,
              name: isGroupDuplicate ? obj.name : `${obj.name} (Copy)`,
              type: 'custom_model',
              mesh: meshClone,
              color: obj.color,
              opacity: obj.opacity,
              fileName: obj.fileName,
              fileDataURL: obj.fileDataURL
          });
      }
      if (this.planningObjects.length > prevLength) {
          const newObj = this.planningObjects[this.planningObjects.length - 1];
          newObj.name = isGroupDuplicate ? obj.name : `${obj.name} (Copy)`;
          newObj.groupId = obj.groupId;
          newObj.color = obj.color;
          newObj.opacity = obj.opacity;
          if (newObj.mesh && newObj.mesh.material && window.THREE) {
              this.updateMeshColorAndVisibility(newObj);
          }
          if (newObj.mesh && obj.mesh) {
              newObj.mesh.position.copy(obj.mesh.position);
              newObj.mesh.quaternion.copy(obj.mesh.quaternion);
              newObj.mesh.scale.copy(obj.mesh.scale);
              newObj.posX = obj.mesh.position.x;
              newObj.posY = obj.mesh.position.y;
              newObj.posZ = obj.mesh.position.z;
              newObj.rotQx = obj.mesh.quaternion.x;
              newObj.rotQy = obj.mesh.quaternion.y;
              newObj.rotQz = obj.mesh.quaternion.z;
              newObj.rotQw = obj.mesh.quaternion.w;
              newObj.scaleX = obj.mesh.scale.x;
              newObj.scaleY = obj.mesh.scale.y;
              newObj.scaleZ = obj.mesh.scale.z;
              newObj.mesh.updateMatrixWorld(true);
          }
          if (obj.visible === false) {
             newObj.visible = false;
             if (newObj.mesh) newObj.mesh.visible = false;
          }
          
          if (newObj.labelDiv) {
              if (newObj.type === 'measurement' && newObj.baseDistance !== undefined) {
                  const text = newObj.name ? `${newObj.name} (${newObj.baseDistance.toFixed(2)} mm)` : `${newObj.baseDistance.toFixed(2)} mm`;
                  newObj.labelDiv.innerText = text;
              } else if (newObj.type === 'angle' && newObj.angle !== undefined) {
                  const text = newObj.name ? `${newObj.name} (${newObj.angle.toFixed(1)}°)` : `${newObj.angle.toFixed(1)}°`;
                  newObj.labelDiv.innerText = text;
              }
              newObj.labelDiv.style.display = newObj.visible ? 'block' : 'none';
          }
          
          if (this.viewer?.viewer) {
              try { this.viewer.viewer.Render(); } catch (e) {}
          }
          if (this.config.onPlanningObjectsChange) {
              this.config.onPlanningObjectsChange([...this.planningObjects]);
          }
          this.saveToLocalStorage();
          return newObj;
      }
      return null;
  }

  exportPlanningObjectSTL(id: string) {
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj) return;
      const stl = this.generateSTLString(obj, true);
      if (!stl) return;

      const blob = new Blob([stl], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = (obj.name || obj.id).replace(/\.stl$/i, '');
      link.download = `${safeName}.stl`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async exportPlanningGroupZip(groupId: string) {
      const group = this.planningGroups.find(g => g.id === groupId);
      if (!group) return;

      const groupObjects = this.planningObjects.filter(obj => obj.groupId === groupId);
      if (groupObjects.length === 0) return;

      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const metadataList: any[] = [];

      groupObjects.forEach(obj => {
          const stl = this.generateSTLString(obj, true);
          if (stl) {
              zip.file(`${obj.name || obj.id}.stl`, stl);
          }
          const serializableObj = { ...obj };
          delete serializableObj.mesh;
          delete serializableObj.labelSprite;
          delete serializableObj.labelDiv;
          delete serializableObj.curvePath;
          
          const THREE = window.THREE;
          let outPos = { x: obj.mesh?.position?.x, y: obj.mesh?.position?.y, z: obj.mesh?.position?.z };
          let outQuat = { x: obj.mesh?.quaternion?.x, y: obj.mesh?.quaternion?.y, z: obj.mesh?.quaternion?.z, w: obj.mesh?.quaternion?.w };
          let outScale = { x: obj.mesh?.scale?.x || 1, y: obj.mesh?.scale?.y || 1, z: obj.mesh?.scale?.z || 1 };
          let exportedObj = { ...serializableObj, posX: outPos.x, posY: outPos.y, posZ: outPos.z, rotQx: outQuat.x, rotQy: outQuat.y, rotQz: outQuat.z, rotQw: outQuat.w, scaleX: outScale.x, scaleY: outScale.y, scaleZ: outScale.z };

          if (obj.mesh && THREE) {
              obj.mesh.updateMatrixWorld?.(true);
              const modelRoot = this.getModelRoot();
              let m = obj.mesh.matrixWorld.clone();
              
              // RE-COMPUTE EXACT p1/p2 ENDPOINTS BASED ON MESH TRANSFORM
              if (obj.type === 'cylinder') {
                  const dist = obj.baseDistance || 0;
                  const lp1 = new THREE.Vector3(0, -dist/2, 0);
                  const lp2 = new THREE.Vector3(0, dist/2, 0);
                  lp1.applyMatrix4(m);
                  lp2.applyMatrix4(m);
                  if (modelRoot) {
                      const invModel = modelRoot.matrixWorld.clone().invert();
                      lp1.applyMatrix4(invModel);
                      lp2.applyMatrix4(invModel);
                  }
                  exportedObj.p1 = { x: lp1.x, y: lp1.y, z: lp1.z };
                  exportedObj.p2 = { x: lp2.x, y: lp2.y, z: lp2.z };
              } else if (obj.type === 'plane' && obj.p1 && obj.p2 && obj.p3) {
                  // Find delta transform from original p1,p2,p3 logic
                  const origCenter = new THREE.Vector3().addVectors(
                      new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z),
                      new THREE.Vector3(obj.p2.x, obj.p2.y, obj.p2.z)
                  ).add(new THREE.Vector3(obj.p3.x, obj.p3.y, obj.p3.z)).divideScalar(3);
                  
                  const v1 = new THREE.Vector3().subVectors(new THREE.Vector3(obj.p2.x, obj.p2.y, obj.p2.z), new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z));
                  const v2 = new THREE.Vector3().subVectors(new THREE.Vector3(obj.p3.x, obj.p3.y, obj.p3.z), new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z));
                  const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
                  const lineDir = new THREE.Vector3().copy(v1).normalize();
                  const yAxis = new THREE.Vector3().crossVectors(normal, lineDir).normalize();
                  const basis = new THREE.Matrix4().makeBasis(lineDir, yAxis, normal);
                  const origQuat = new THREE.Quaternion().setFromRotationMatrix(basis);
                  
                  const mOrig = new THREE.Matrix4().compose(origCenter, origQuat, new THREE.Vector3(1,1,1));
                  const mOrigInv = mOrig.invert();
                  
                  // Now calculate new p1, p2, p3
                  const updateP = (pOrig: any) => {
                      const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                      pt.applyMatrix4(mOrigInv); // to local
                      pt.applyMatrix4(m); // to new world
                      if (modelRoot) {
                          const invModel = modelRoot.matrixWorld.clone().invert();
                          pt.applyMatrix4(invModel);
                      }
                      return { x: pt.x, y: pt.y, z: pt.z };
                  };
                  exportedObj.p1 = updateP(obj.p1);
                  exportedObj.p2 = updateP(obj.p2);
                  exportedObj.p3 = updateP(obj.p3);
              } else if (obj.type === 'measurement' && obj.p1 && obj.p2Coord) {
                  // similar logic might apply, but measurement shouldn't be scaled, just endpoints updated
                  const origCenter = new THREE.Vector3().addVectors(
                      new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z),
                      new THREE.Vector3(obj.p2Coord.x, obj.p2Coord.y, obj.p2Coord.z)
                  ).multiplyScalar(0.5);
                  const dir = new THREE.Vector3().subVectors(new THREE.Vector3(obj.p2Coord.x, obj.p2Coord.y, obj.p2Coord.z), new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z)).normalize();
                  const up = new THREE.Vector3(0,1,0);
                  const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
                  const mOrigInv = new THREE.Matrix4().compose(origCenter, q, new THREE.Vector3(1,1,1)).invert();
                  
                  const updateP = (pOrig: any) => {
                      const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                      pt.applyMatrix4(mOrigInv).applyMatrix4(m);
                      if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                      return { x: pt.x, y: pt.y, z: pt.z };
                  };
                  exportedObj.p1 = updateP(obj.p1);
                  exportedObj.p2Coord = updateP(obj.p2Coord);
              } else if (obj.type === 'point' && obj.points && obj.points.length > 0) {
                  const mOrigInv = new THREE.Matrix4().makeTranslation(-obj.points[0].x, -obj.points[0].y, -obj.points[0].z);
                  const updateP = (pOrig: any) => {
                      const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                      pt.applyMatrix4(mOrigInv).applyMatrix4(m);
                      if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                      return { x: pt.x, y: pt.y, z: pt.z };
                  };
                  exportedObj.points = [updateP(obj.points[0])];
              } else if (obj.type === 'curve' && obj.points) {
                  const updateP = (pOrig: any) => {
                      const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                      pt.applyMatrix4(m);
                      if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                      return { x: pt.x, y: pt.y, z: pt.z };
                  };
                  exportedObj.points = obj.points.map(updateP);
              } else if (obj.type === 'angle' && obj.p1 && obj.p2Coord && obj.p3) {
                  const updateP = (pOrig: any) => {
                      const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                      pt.applyMatrix4(m);
                      if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                      return { x: pt.x, y: pt.y, z: pt.z };
                  };
                  exportedObj.p1 = updateP(obj.p1);
                  exportedObj.p2Coord = updateP(obj.p2Coord);
                  exportedObj.p3 = updateP(obj.p3);
              } else if (obj.type === 'annotation' && obj.position) {
                  const pt = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
                  if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                  exportedObj.position = { x: pt.x, y: pt.y, z: pt.z };
              }

              if (modelRoot) {
                  modelRoot.updateMatrixWorld(true);
                  const invMain = modelRoot.matrixWorld.clone().invert();
                  m.premultiply(invMain);
              }
              const pos = new THREE.Vector3();
              const quat = new THREE.Quaternion();
              const scale = new THREE.Vector3();
              m.decompose(pos, quat, scale);
              outPos = { x: pos.x, y: pos.y, z: pos.z };
              outQuat = { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
              outScale = { x: scale.x, y: scale.y, z: scale.z };
          }
          
          metadataList.push({
              id: obj.id,
              name: obj.name || obj.id,
              type: obj.type,
              color: obj.color,
              groupId: obj.groupId || null,
              groupName: group.name,
              ...exportedObj,
              posX: outPos.x,
              posY: outPos.y,
              posZ: outPos.z,
              rotQx: outQuat.x,
              rotQy: outQuat.y,
              rotQz: outQuat.z,
              rotQw: outQuat.w,
              scaleX: outScale.x,
              scaleY: outScale.y,
              scaleZ: outScale.z,
              coordinateSystem: {
                  systemType: "Loaded Model Local Coordinate Space",
                  units: "millimeters (mm)",
                  origin: "Aligned with loaded model origin (local space)"
              }
          });
      });

      const exportData = {
          coordinateSystem: {
              systemType: "Loaded Model Local Coordinate Space",
              units: "millimeters (mm)",
              origin: "Aligned with loaded model origin (local space)",
              note: "Planning objects coordinates have been exported relative to the same coordinate system as the loaded 3D model."
          },
          group: group.name,
          objects: metadataList
      };

      // Create high-fidelity 3D Slicer (.mrk.json) format which also acts as our metadata file
      const slicerJson = this.generateSlicerMarkupsJson(groupObjects, group.name, exportData);
      if (slicerJson) {
          zip.file(`${group.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Slicer.mrk.json`, slicerJson);
      }
      zip.file('metadata.json', JSON.stringify(exportData, null, 2));

      const readmeText = `COORDINATE SYSTEM DEFINITION & SPECIFICATION
---------------------------------------------
System Type: Loaded Model Local Coordinate Space
Units of Measurement: Millimeters (mm)

Geometry Details:
All exported 3D STL files are saved relative to the loaded model's own local coordinate system.
This ensures precise clinical registration independent of screen view orientation.

Slicer Markup Compatibility:
A companion 3D Slicer markup JSON file (.mrk.json) has been exported ensuring pristine alignment in Slicer.
It contains both Slicer markup properties and the application's internal grouping and metadata.
`;
      zip.file('coordinate_system_info.txt', readmeText);

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      const prefix = this.loadedFilename ? this.loadedFilename.split('.').slice(0, -1).join('.') : 'Model';
      link.download = `${prefix}_${group.name}_Planning.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async exportAllPlanningObjectsZip() {
      if (this.planningObjects.length === 0) return;
      
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const metadataList: any[] = [];

      this.planningObjects.forEach(obj => {
          const stl = this.generateSTLString(obj, true);
          if (stl) {
              zip.file(`${obj.name || obj.id}.stl`, stl);
          }
          const serializableObj = { ...obj };
          delete serializableObj.mesh;
          delete serializableObj.labelSprite;
          delete serializableObj.labelDiv;
          delete serializableObj.curvePath;

          const THREE = window.THREE;
          let outPos = { x: obj.mesh?.position?.x, y: obj.mesh?.position?.y, z: obj.mesh?.position?.z };
          let outQuat = { x: obj.mesh?.quaternion?.x, y: obj.mesh?.quaternion?.y, z: obj.mesh?.quaternion?.z, w: obj.mesh?.quaternion?.w };
          let outScale = { x: obj.mesh?.scale?.x || 1, y: obj.mesh?.scale?.y || 1, z: obj.mesh?.scale?.z || 1 };
          let exportedObj = { ...serializableObj, posX: outPos.x, posY: outPos.y, posZ: outPos.z, rotQx: outQuat.x, rotQy: outQuat.y, rotQz: outQuat.z, rotQw: outQuat.w, scaleX: outScale.x, scaleY: outScale.y, scaleZ: outScale.z };

          if (obj.mesh && THREE) {
              obj.mesh.updateMatrixWorld?.(true);
              const modelRoot = this.getModelRoot();
              let m = obj.mesh.matrixWorld.clone();
              
              // RE-COMPUTE EXACT p1/p2 ENDPOINTS BASED ON MESH TRANSFORM
              if (obj.type === 'cylinder') {
                  const dist = obj.baseDistance || 0;
                  const lp1 = new THREE.Vector3(0, -dist/2, 0);
                  const lp2 = new THREE.Vector3(0, dist/2, 0);
                  lp1.applyMatrix4(m);
                  lp2.applyMatrix4(m);
                  if (modelRoot) {
                      const invModel = modelRoot.matrixWorld.clone().invert();
                      lp1.applyMatrix4(invModel);
                      lp2.applyMatrix4(invModel);
                  }
                  exportedObj.p1 = { x: lp1.x, y: lp1.y, z: lp1.z };
                  exportedObj.p2 = { x: lp2.x, y: lp2.y, z: lp2.z };
              } else if (obj.type === 'plane' && obj.p1 && obj.p2 && obj.p3) {
                  // Find delta transform from original p1,p2,p3 logic
                  const origCenter = new THREE.Vector3().addVectors(
                      new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z),
                      new THREE.Vector3(obj.p2.x, obj.p2.y, obj.p2.z)
                  ).add(new THREE.Vector3(obj.p3.x, obj.p3.y, obj.p3.z)).divideScalar(3);
                  
                  const v1 = new THREE.Vector3().subVectors(new THREE.Vector3(obj.p2.x, obj.p2.y, obj.p2.z), new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z));
                  const v2 = new THREE.Vector3().subVectors(new THREE.Vector3(obj.p3.x, obj.p3.y, obj.p3.z), new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z));
                  const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
                  const lineDir = new THREE.Vector3().copy(v1).normalize();
                  const yAxis = new THREE.Vector3().crossVectors(normal, lineDir).normalize();
                  const basis = new THREE.Matrix4().makeBasis(lineDir, yAxis, normal);
                  const origQuat = new THREE.Quaternion().setFromRotationMatrix(basis);
                  
                  const mOrig = new THREE.Matrix4().compose(origCenter, origQuat, new THREE.Vector3(1,1,1));
                  const mOrigInv = mOrig.invert();
                  
                  // Now calculate new p1, p2, p3
                  const updateP = (pOrig: any) => {
                      const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                      pt.applyMatrix4(mOrigInv); // to local
                      pt.applyMatrix4(m); // to new world
                      if (modelRoot) {
                         const invModel = modelRoot.matrixWorld.clone().invert();
                         pt.applyMatrix4(invModel);
                      }
                      return { x: pt.x, y: pt.y, z: pt.z };
                  };
                  exportedObj.p1 = updateP(obj.p1);
                  exportedObj.p2 = updateP(obj.p2);
                  exportedObj.p3 = updateP(obj.p3);
              } else if (obj.type === 'measurement' && obj.p1 && obj.p2Coord) {
                  // similar logic might apply, but measurement shouldn't be scaled, just endpoints updated
                  const origCenter = new THREE.Vector3().addVectors(
                      new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z),
                      new THREE.Vector3(obj.p2Coord.x, obj.p2Coord.y, obj.p2Coord.z)
                  ).multiplyScalar(0.5);
                  const dir = new THREE.Vector3().subVectors(new THREE.Vector3(obj.p2Coord.x, obj.p2Coord.y, obj.p2Coord.z), new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z)).normalize();
                  const up = new THREE.Vector3(0,1,0);
                  const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
                  const mOrigInv = new THREE.Matrix4().compose(origCenter, q, new THREE.Vector3(1,1,1)).invert();
                  
                  const updateP = (pOrig: any) => {
                      const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                      pt.applyMatrix4(mOrigInv).applyMatrix4(m);
                      if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                      return { x: pt.x, y: pt.y, z: pt.z };
                  };
                  exportedObj.p1 = updateP(obj.p1);
                  exportedObj.p2Coord = updateP(obj.p2Coord);
              } else if (obj.type === 'point' && obj.points && obj.points.length > 0) {
                  const mOrigInv = new THREE.Matrix4().makeTranslation(-obj.points[0].x, -obj.points[0].y, -obj.points[0].z);
                  const updateP = (pOrig: any) => {
                      const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                      pt.applyMatrix4(mOrigInv).applyMatrix4(m);
                      if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                      return { x: pt.x, y: pt.y, z: pt.z };
                  };
                  exportedObj.points = [updateP(obj.points[0])];
              } else if (obj.type === 'curve' && obj.points) {
                  const updateP = (pOrig: any) => {
                      const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                      pt.applyMatrix4(m);
                      if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                      return { x: pt.x, y: pt.y, z: pt.z };
                  };
                  exportedObj.points = obj.points.map(updateP);
              } else if (obj.type === 'angle' && obj.p1 && obj.p2Coord && obj.p3) {
                  const updateP = (pOrig: any) => {
                      const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                      pt.applyMatrix4(m);
                      if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                      return { x: pt.x, y: pt.y, z: pt.z };
                  };
                  exportedObj.p1 = updateP(obj.p1);
                  exportedObj.p2Coord = updateP(obj.p2Coord);
                  exportedObj.p3 = updateP(obj.p3);
              } else if (obj.type === 'annotation' && obj.position) {
                  const pt = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
                  if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                  exportedObj.position = { x: pt.x, y: pt.y, z: pt.z };
              }

              if (modelRoot) {
                  modelRoot.updateMatrixWorld(true);
                  const invMain = modelRoot.matrixWorld.clone().invert();
                  m.premultiply(invMain);
              }
              const pos = new THREE.Vector3();
              const quat = new THREE.Quaternion();
              const scale = new THREE.Vector3();
              m.decompose(pos, quat, scale);
              outPos = { x: pos.x, y: pos.y, z: pos.z };
              outQuat = { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
              outScale = { x: scale.x, y: scale.y, z: scale.z };
          }

          metadataList.push({
              id: obj.id,
              name: obj.name || obj.id,
              type: obj.type,
              color: obj.color,
              groupId: obj.groupId || null,
              groupName: obj.groupId ? (this.planningGroups.find(g => g.id === obj.groupId)?.name || '') : '',
              ...exportedObj,
              posX: outPos.x,
              posY: outPos.y,
              posZ: outPos.z,
              rotQx: outQuat.x,
              rotQy: outQuat.y,
              rotQz: outQuat.z,
              rotQw: outQuat.w,
              scaleX: outScale.x,
              scaleY: outScale.y,
              scaleZ: outScale.z,
              coordinateSystem: {
                  systemType: "Loaded Model Local Coordinate Space",
                  units: "millimeters (mm)",
                  origin: "Aligned with loaded model origin (local space)"
              }
          });
      });
      
      const exportData = {
          coordinateSystem: {
              systemType: "Loaded Model Local Coordinate Space",
              units: "millimeters (mm)",
              origin: "Aligned with loaded model origin (local space)",
              note: "Planning objects coordinates have been exported relative to the same coordinate system as the loaded 3D model."
          },
          objects: metadataList
      };

      // Create Slicer combined markup JSON which also acts as our metadata file
      const slicerJson = this.generateSlicerMarkupsJson(this.planningObjects, "All Planning Objects", exportData);
      if (slicerJson) {
          zip.file(`All_Planning.mrk.json`, slicerJson);
      }
      zip.file('metadata.json', JSON.stringify(exportData, null, 2));

      // Separate explicit README for clarity on standard clinical and engineering coordinate alignment
      const readmeText = `COORDINATE SYSTEM DEFINITION & SPECIFICATION
---------------------------------------------
System Type: Loaded Model Local Coordinate Space
Units of Measurement: Millimeters (mm)

Geometry Details:
All exported 3D STL files are saved relative to the loaded model's own local coordinate system.
This ensures precise clinical registration independent of screen view orientation.

Slicer Markup Compatibility:
A companion 3D Slicer markup JSON file (.mrk.json) has been exported ensuring pristine alignment in Slicer.
It contains both Slicer markup properties and the application's internal grouping and metadata.
`;

      zip.file('coordinate_system_info.txt', readmeText);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const prefix = this.loadedFilename ? this.loadedFilename.split('.').slice(0, -1).join('.') : 'Model';
      link.download = `${prefix}_All_Planning.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  generateSlicerMarkupsJson(objects: any[], groupName: string = "Planning Group", appMetaData: any = null): string {
      const markupsList: any[] = [];
      const THREE = window.THREE;
      if (!THREE) return "";

      const modelRoot = this.getModelRoot();

      objects.forEach((obj, idx) => {
          // Calculate the local model space points for this object
          const pointsInModelSpace: any[] = [];
          
          const objMesh = obj.mesh;
          if (objMesh) {
              objMesh.updateMatrixWorld?.(true);
              let m = objMesh.matrixWorld.clone();
              
              const extractPoints = () => {
                  if (obj.type === 'cylinder') {
                      const dist = obj.baseDistance || 0;
                      const lp1 = new THREE.Vector3(0, -dist/2, 0);
                      const lp2 = new THREE.Vector3(0, dist/2, 0);
                      lp1.applyMatrix4(m);
                      lp2.applyMatrix4(m);
                      if (modelRoot) {
                          const invModel = modelRoot.matrixWorld.clone().invert();
                          lp1.applyMatrix4(invModel);
                          lp2.applyMatrix4(invModel);
                      }
                      return [lp1, lp2];
                  } else if (obj.type === 'plane' && obj.p1 && obj.p2 && obj.p3) {
                      const origCenter = new THREE.Vector3().addVectors(
                          new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z),
                          new THREE.Vector3(obj.p2.x, obj.p2.y, obj.p2.z)
                      ).add(new THREE.Vector3(obj.p3.x, obj.p3.y, obj.p3.z)).divideScalar(3);
                      
                      const v1 = new THREE.Vector3().subVectors(new THREE.Vector3(obj.p2.x, obj.p2.y, obj.p2.z), new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z));
                      const v2 = new THREE.Vector3().subVectors(new THREE.Vector3(obj.p3.x, obj.p3.y, obj.p3.z), new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z));
                      const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
                      const lineDir = new THREE.Vector3().copy(v1).normalize();
                      const yAxis = new THREE.Vector3().crossVectors(normal, lineDir).normalize();
                      const basis = new THREE.Matrix4().makeBasis(lineDir, yAxis, normal);
                      const origQuat = new THREE.Quaternion().setFromRotationMatrix(basis);
                      
                      const mOrig = new THREE.Matrix4().compose(origCenter, origQuat, new THREE.Vector3(1,1,1));
                      const mOrigInv = mOrig.invert();
                      
                      const updateP = (pOrig: any) => {
                          const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                          pt.applyMatrix4(mOrigInv).applyMatrix4(m);
                          if (modelRoot) {
                             const invModel = modelRoot.matrixWorld.clone().invert();
                             pt.applyMatrix4(invModel);
                          }
                          return pt;
                      };
                      return [updateP(obj.p1), updateP(obj.p2), updateP(obj.p3)];
                  } else if (obj.type === 'measurement' && obj.p1 && obj.p2Coord) {
                      const origCenter = new THREE.Vector3().addVectors(
                          new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z),
                          new THREE.Vector3(obj.p2Coord.x, obj.p2Coord.y, obj.p2Coord.z)
                      ).multiplyScalar(0.5);
                      const dir = new THREE.Vector3().subVectors(new THREE.Vector3(obj.p2Coord.x, obj.p2Coord.y, obj.p2Coord.z), new THREE.Vector3(obj.p1.x, obj.p1.y, obj.p1.z)).normalize();
                      const up = new THREE.Vector3(0,1,0);
                      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
                      const mOrigInv = new THREE.Matrix4().compose(origCenter, q, new THREE.Vector3(1,1,1)).invert();
                      
                      const updateP = (pOrig: any) => {
                          const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                          pt.applyMatrix4(mOrigInv).applyMatrix4(m);
                          if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                          return pt;
                      };
                      return [updateP(obj.p1), updateP(obj.p2Coord)];
                  } else if (obj.type === 'point' && obj.points && obj.points.length > 0) {
                      const mOrigInv = new THREE.Matrix4().makeTranslation(-obj.points[0].x, -obj.points[0].y, -obj.points[0].z);
                      const updateP = (pOrig: any) => {
                          const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                          pt.applyMatrix4(mOrigInv).applyMatrix4(m);
                          if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                          return pt;
                      };
                      return [updateP(obj.points[0])];
                  } else if (obj.type === 'curve' && obj.points) {
                      const updateP = (pOrig: any) => {
                          const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                          pt.applyMatrix4(m);
                          if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                          return pt;
                      };
                      return obj.points.map(updateP);
                  } else if (obj.type === 'angle' && obj.p1 && obj.p2Coord && obj.p3) {
                      const updateP = (pOrig: any) => {
                          const pt = new THREE.Vector3(pOrig.x, pOrig.y, pOrig.z);
                          pt.applyMatrix4(m);
                          if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                          return pt;
                      };
                      return [updateP(obj.p1), updateP(obj.p2Coord), updateP(obj.p3)];
                  } else if (obj.type === 'annotation' && obj.position) {
                      const pt = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
                      if (modelRoot) pt.applyMatrix4(modelRoot.matrixWorld.clone().invert());
                      return [pt];
                  }
                  return [];
              };
              
              const pts = extractPoints();
              pts.forEach(p => pointsInModelSpace.push({ x: p.x, y: p.y, z: p.z }));
          } else {
              // Fallback to static values if mesh is missing
              if (obj.type === 'cylinder' && obj.p1 && obj.p2) {
                  pointsInModelSpace.push(obj.p1, obj.p2);
              } else if (obj.type === 'plane' && obj.p1 && obj.p2 && obj.p3) {
                  pointsInModelSpace.push(obj.p1, obj.p2, obj.p3);
              } else if (obj.type === 'measurement' && obj.p1 && obj.p2Coord) {
                  pointsInModelSpace.push(obj.p1, obj.p2Coord);
              } else if (obj.type === 'point' && obj.points && obj.points.length > 0) {
                  pointsInModelSpace.push(obj.points[0]);
              } else if (obj.type === 'annotation' && obj.position) {
                  pointsInModelSpace.push(obj.position);
              } else if (obj.type === 'curve' && obj.points) {
                  obj.points.forEach((p: any) => pointsInModelSpace.push(p));
              } else if (obj.type === 'angle' && obj.p1 && obj.p2Coord && obj.p3) {
                  pointsInModelSpace.push(obj.p1, obj.p2Coord, obj.p3);
              }
          }

          // Keep raw coordinates; STL and JSON should use the same values so they align consistently.
          // Slicer will transform both LPS STL and LPS markups to RAS identically.
          const convertExportPos = (p: any) => {
              return [p.x, p.y, p.z];
          };

          // Determine markup class fields
          let slicerType = "Fiducial";
          let labelPrefix = "F";
          if (obj.type === 'cylinder') {
              slicerType = "Line";
              labelPrefix = "L";
          } else if (obj.type === 'measurement') {
              slicerType = "Line";
              labelPrefix = "M";
          } else if (obj.type === 'curve') {
              slicerType = "Curve";
              labelPrefix = "C";
          } else if (obj.type === 'angle') {
              slicerType = "Angle";
              labelPrefix = "A";
          } else if (obj.type === 'plane') {
              slicerType = "Plane";
              labelPrefix = "P";
          } else if (obj.type === 'point') {
              slicerType = "Fiducial";
              labelPrefix = "F";
          } else if (obj.type === 'annotation') {
              slicerType = "Fiducial";
              labelPrefix = "ANN";
          }

          const controlPoints = pointsInModelSpace.map((pt, pIdx) => {
              const exportPos = convertExportPos(pt);
              let label = `${obj.name || obj.id}`;
              if (pointsInModelSpace.length > 1) {
                  if (obj.type === 'cylinder' || obj.type === 'measurement') {
                      label += pIdx === 0 ? "-Start" : "-End";
                  } else if (obj.type === 'angle') {
                      label += pIdx === 0 ? "-P1" : pIdx === 1 ? "-Vertex" : "-P2";
                  } else if (obj.type === 'plane') {
                      label += `-P${pIdx + 1}`;
                  } else {
                      label += `-${pIdx + 1}`;
                  }
              }
              return {
                  id: `${obj.id}-cp-${pIdx}`,
                  label: label,
                  position: exportPos,
                  orientation: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
                  positionStatus: "defined",
                  selected: true,
                  locked: false,
                  visibility: obj.visible !== false,
                  description: `Object Point for ${obj.name}`,
                  associatedNodeID: ""
              };
          });

          // Convert hex color to rgb array [r, g, b] where each is 0.0 - 1.0
          let r = 0, g = 1, b = 0;
          if (obj.color && obj.color.startsWith('#')) {
              const hex = obj.color.replace('#', '');
              if (hex.length === 6) {
                  r = parseInt(hex.substring(0, 2), 16) / 255;
                  g = parseInt(hex.substring(2, 4), 16) / 255;
                  b = parseInt(hex.substring(4, 6), 16) / 255;
              }
          }

          markupsList.push({
              type: slicerType,
              coordinateSystem: "LPS",
              labelFormat: `${labelPrefix + (idx + 1)}-%u`,
              controlPoints: controlPoints,
              name: obj.name || obj.id,
              locked: false,
              display: {
                  visibility: obj.visible !== false,
                  color: [r, g, b],
                  selectedColor: [r, g, b],
                  activeColor: [r, g, b],
                  opacity: 1.0
              },
              measurements: [],
              properties: {
                  customType: obj.type,
                  diameter: obj.diameter,
                  thickness: obj.thickness,
                  radius: obj.radius,
                  length: obj.length,
                  baseDistance: obj.baseDistance,
                  extension: obj.extension,
                  angle: obj.angle,
                  pinSize: obj.pinSize,
                  description: obj.description,
                  text: obj.text,
                  groupId: obj.groupId || null
              }
          });
      });

      const slicerMarkups: any = {
          "@schema": "https://raw.githubusercontent.com/slicer/slicer/master/Modules/Loadable/Markups/Resources/Schema/markups-schema-v1.0.3.json#",
          coordinateSystem: "LPS",
          groupName: groupName,
          markups: markupsList
      };

      if (appMetaData) {
          slicerMarkups.appMetaData = appMetaData;
      }

      return JSON.stringify(slicerMarkups, null, 2);
  }

  async loadSlicerMarkupsJson(json: any) {
      if (!json || !json.markups) return;
      if (!window.THREE) return;

      const groupName = json.groupName || "Imported Slicer Group";
      let groupId = "";
      let existingGrp = this.planningGroups.find(g => g.name === groupName);
      if (!existingGrp) {
          groupId = this.addPlanningGroup(groupName);
      } else {
          groupId = existingGrp.id;
      }

      for (const markup of json.markups) {
          const type = markup.properties?.customType || markup.type;
          let coordinateSystem = markup.coordinateSystem || json.coordinateSystem || "LPS";
          coordinateSystem = coordinateSystem.toUpperCase();

          const objVisibility = markup.display?.visibility ?? markup.visibility ?? true;
          let objColorHex = "#00ff00"; // fallback

          let rawColor = markup.display?.color || markup.color;
          if (Array.isArray(rawColor) && rawColor.length >= 3) {
              const r = Math.round(rawColor[0] * 255).toString(16).padStart(2, '0');
              const g = Math.round(rawColor[1] * 255).toString(16).padStart(2, '0');
              const b = Math.round(rawColor[2] * 255).toString(16).padStart(2, '0');
              objColorHex = `#${r}${g}${b}`;
          } else if (typeof rawColor === 'string' && rawColor.startsWith('#')) {
              objColorHex = rawColor;
          }

          const convertFromSlicer = (posArray: number[]) => {
              let x = posArray[0];
              let y = posArray[1];
              let z = posArray[2];
              return { x, y, z };
          };

          const rawPoints = (markup.controlPoints || []).map((cp: any) => convertFromSlicer(cp.position));
          
          if (rawPoints.length === 0 && !(markup.center && markup.orientation && markup.size)) continue;

          // Re-create the object using the exact coordinates
          const pts = rawPoints;

          if (type === "annotation" || markup.properties?.customType === "annotation") {
              for (let i = 0; i < pts.length; i++) {
                  const p = pts[i];
                  const pinSize = markup.properties?.pinSize || 1.5;
                  const annName = pts.length > 1 ? `${markup.name || "Annotation"}-${i + 1}` : (markup.name || "Annotation");
                  const annDesc = markup.description || markup.properties?.description || "";
                  this.createPlanningAnnotation(
                      new window.THREE.Vector3(p.x, p.y, p.z),
                      null,
                      annName,
                      annDesc,
                      objColorHex !== "#00ff00" ? objColorHex : "#0284c7",
                      pinSize,
                      markup.properties?.cardOffset
                  );
                  if (this.planningObjects.length > 0) {
                      const newObj = this.planningObjects[this.planningObjects.length - 1];
                      newObj.groupId = groupId;
                      newObj.visible = objVisibility;
                      if (markup.properties?.cardOffset) {
                          newObj.cardOffset = { x: Math.round(markup.properties.cardOffset.x), y: Math.round(markup.properties.cardOffset.y) };
                          this.updatePlanningCardLabel(newObj);
                      }
                      this.updateMeshColorAndVisibility(newObj);
                  }
              }
          } else if (markup.type === "Fiducial" || type === "point") {
              const diameter = markup.properties?.diameter || 0.2;
              for (let i = 0; i < pts.length; i++) {
                  const p = pts[i];
                  this.createPlanningPoint(new window.THREE.Vector3(p.x, p.y, p.z), diameter);
                  if (this.planningObjects.length > 0) {
                      const newObj = this.planningObjects[this.planningObjects.length - 1];
                      newObj.name = pts.length > 1 ? `${markup.name || "Point"}-${i + 1}` : (markup.name || "Point");
                      newObj.groupId = groupId;
                      newObj.color = objColorHex !== "#00ff00" ? objColorHex : "#db2777";
                      newObj.visible = objVisibility;
                      this.updateMeshColorAndVisibility(newObj);
                  }
              }
          } else if (markup.type === "Line" || type === "cylinder" || type === "measurement") {
              if (pts.length >= 2) {
                  const p1 = pts[0];
                  const p2 = pts[1];
                  const diameter = markup.properties?.diameter || 2.0;
                  const extension = markup.properties?.extension || 0.0;
                  
                  if (type === "cylinder") {
                      this.createPlanningCylinder(
                          new window.THREE.Vector3(p1.x, p1.y, p1.z),
                          new window.THREE.Vector3(p2.x, p2.y, p2.z),
                          diameter / 2,
                          extension
                      );
                  } else {
                      this.createPlanningMeasurement(
                          new window.THREE.Vector3(p1.x, p1.y, p1.z),
                          new window.THREE.Vector3(p2.x, p2.y, p2.z),
                          markup.properties?.angle || 0,
                          markup.properties?.cardOffset
                      );
                  }

                  if (this.planningObjects.length > 0) {
                      const newObj = this.planningObjects[this.planningObjects.length - 1];
                      newObj.name = markup.name || "Line";
                      newObj.groupId = groupId;
                      newObj.color = objColorHex !== "#00ff00" ? objColorHex : (type === "cylinder" ? "#0000ff" : "#10b981");
                      newObj.visible = objVisibility;
                      if (markup.properties?.cardOffset && newObj.type === 'measurement') {
                          newObj.cardOffset = { x: Math.round(markup.properties.cardOffset.x), y: Math.round(markup.properties.cardOffset.y) };
                          this.updatePlanningCardLabel(newObj);
                      }
                      this.updateMeshColorAndVisibility(newObj);
                  }
              }
          } else if (markup.type === "Curve" || type === "curve") {
              const thickness = markup.properties?.thickness || 0.2;
              this.createPlanningCurve(
                  pts.map(p => new window.THREE.Vector3(p.x, p.y, p.z)),
                  thickness
              );
              if (this.planningObjects.length > 0) {
                  const newObj = this.planningObjects[this.planningObjects.length - 1];
                  newObj.name = markup.name || "Curve";
                  newObj.groupId = groupId;
                  newObj.color = objColorHex !== "#00ff00" ? objColorHex : "#db2777";
                  newObj.visible = objVisibility;
                  this.updateMeshColorAndVisibility(newObj);
              }
          } else if (markup.type === "Angle" || type === "angle") {
              if (pts.length >= 3) {
                  const p1 = pts[0];
                  const p2 = pts[1]; // vertex
                  const p3 = pts[2];
                  const angle = markup.properties?.angle || 0;
                  
                  this.createPlanningAngle(
                      new window.THREE.Vector3(p1.x, p1.y, p1.z),
                      new window.THREE.Vector3(p2.x, p2.y, p2.z),
                      new window.THREE.Vector3(p3.x, p3.y, p3.z),
                      angle,
                      markup.properties?.cardOffset
                  );
                  if (this.planningObjects.length > 0) {
                      const newObj = this.planningObjects[this.planningObjects.length - 1];
                      newObj.name = markup.name || "Angle";
                      newObj.groupId = groupId;
                      newObj.color = objColorHex !== "#00ff00" ? objColorHex : "#d97706";
                      newObj.visible = objVisibility;
                      if (markup.properties?.cardOffset) {
                          newObj.cardOffset = { x: Math.round(markup.properties.cardOffset.x), y: Math.round(markup.properties.cardOffset.y) };
                          this.updatePlanningCardLabel(newObj);
                      }
                      this.updateMeshColorAndVisibility(newObj);
                  }
              }
          } else if (markup.type === "Plane" || type === "plane") {
              if (pts.length >= 3) {
                  const p1 = pts[0];
                  const p2 = pts[1];
                  const p3 = pts[2];
                  const extWidth = markup.properties?.extWidth || 10;
                  const extLength = markup.properties?.extLength || 10;
                  
                  this.createPlanningPlane(
                      new window.THREE.Vector3(p1.x, p1.y, p1.z),
                      new window.THREE.Vector3(p2.x, p2.y, p2.z),
                      new window.THREE.Vector3(p3.x, p3.y, p3.z),
                      extWidth,
                      extLength
                  );
                  if (this.planningObjects.length > 0) {
                      const newObj = this.planningObjects[this.planningObjects.length - 1];
                      newObj.name = markup.name || "Plane";
                      newObj.groupId = groupId;
                      newObj.color = objColorHex !== "#00ff00" ? objColorHex : "#00ff00";
                      newObj.visible = objVisibility;
                      this.updateMeshColorAndVisibility(newObj);
                      this.updatePlaneGeometry(newObj.id, extWidth, markup.properties?.thickness || 0);
                  }
              } else if (markup.center && markup.orientation && markup.size) {
                  let cPos = {
                      x: markup.center[0],
                      y: markup.center[1],
                      z: markup.center[2]
                  };
                  
                  const convertVecFromSlicer = (vx: number, vy: number, vz: number) => {
                      return new window.THREE.Vector3(vx, vy, vz);
                  };
                  
                  const o = markup.orientation;
                  // Column 1 is X axis
                  const xVec = convertVecFromSlicer(o[0], o[3], o[6]);
                  // Column 2 is Y axis
                  const yVec = convertVecFromSlicer(o[1], o[4], o[7]);
                  
                  const c = new window.THREE.Vector3(cPos.x, cPos.y, cPos.z);
                  const W = markup.size[0] || 100;
                  const H = markup.size[1] || 100;
                  
                  // Compute 3 points to satisfy our createPlanningPlane logic
                  const tp1 = new window.THREE.Vector3().copy(c)
                      .addScaledVector(xVec, -W/3)
                      .addScaledVector(yVec, -H/3);
                      
                  const tp2 = new window.THREE.Vector3().copy(c)
                      .addScaledVector(xVec, 2*W/3)
                      .addScaledVector(yVec, -H/3);
                      
                  const tp3 = new window.THREE.Vector3().copy(c)
                      .addScaledVector(xVec, -W/3)
                      .addScaledVector(yVec, 2*H/3);
                  
                  this.createPlanningPlane(
                      new window.THREE.Vector3(tp1.x, tp1.y, tp1.z),
                      new window.THREE.Vector3(tp2.x, tp2.y, tp2.z),
                      new window.THREE.Vector3(tp3.x, tp3.y, tp3.z),
                      0,
                      0
                  );
                  if (this.planningObjects.length > 0) {
                      const newObj = this.planningObjects[this.planningObjects.length - 1];
                      newObj.name = markup.name || "Plane";
                      newObj.groupId = groupId;
                      newObj.color = objColorHex !== "#00ff00" ? objColorHex : "#00ff00";
                      newObj.visible = objVisibility;
                      this.updateMeshColorAndVisibility(newObj);
                      this.updatePlaneGeometry(newObj.id, 0, markup.properties?.thickness || 0);
                  }
              }
          }
      }

      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange([...this.planningObjects]);
      }
      this.saveToLocalStorage();
  }

  updatePlanningObjectColorAndOpacity(id: string, color: string, opacity: number) {
      const obj = this.planningObjects.find(o => o.id === id);
      if (!obj) return;
      obj.color = color;
      obj.opacity = opacity;
      this.updateMeshColorAndVisibility(obj);
      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
  }

  updateMeshColorAndVisibility(obj: any) {
      if (obj.mesh && window.THREE) {
          // Clean up any legacy wireframe edge segments from custom models
          if (obj.type === 'custom_model' && obj.mesh.children) {
              const edgeChildren = obj.mesh.children.filter((c: any) => c.isLineSegments || c.type === 'LineSegments' || c.userData?.isEdge);
              edgeChildren.forEach((c: any) => {
                  if (c.geometry && typeof c.geometry.dispose === 'function') {
                      try { c.geometry.dispose(); } catch (e) {}
                  }
                  if (c.material && typeof c.material.dispose === 'function') {
                      try { c.material.dispose(); } catch (e) {}
                  }
                  obj.mesh.remove(c);
              });
          }

          const updateMat = (m: any) => {
              if (m.color) {
                  m.color.set(obj.color);
                  if (obj.type === 'custom_model') {
                      if (m.vertexColors !== undefined) m.vertexColors = false;
                      if (m.map !== undefined) m.map = null;
                  }
              }
              if (obj.opacity !== undefined) {
                  m.transparent = obj.opacity < 1.0;
                  m.opacity = obj.opacity;
                  if (obj.type === 'custom_model') {
                      // Avoid self-occlusion artifacts when transparent
                      if (obj.opacity < 1.0) {
                          m.depthWrite = false;
                      } else {
                          m.depthWrite = true;
                      }
                  }
                  m.needsUpdate = true;
              }
              // If we manually change the color/opacity, clear the saved original colors
              // so that un-highlighting doesn't revert to an old color.
              if (this.originalColors && this.originalColors.has(m)) {
                  this.originalColors.delete(m);
              }
          };
          if (typeof obj.mesh.traverse === 'function') {
              obj.mesh.traverse((child: any) => {
                  if (child.material && !child.userData?.isEdge) {
                      if (Array.isArray(child.material)) {
                          child.material.forEach(updateMat);
                      } else {
                          updateMat(child.material);
                      }
                  }
              });
          } else {
              if (Array.isArray(obj.mesh.material)) {
                  obj.mesh.material.forEach(updateMat);
              } else if (obj.mesh.material) {
                  updateMat(obj.mesh.material);
              }
          }
          obj.mesh.visible = obj.visible;
          if (obj.labelDiv) {
              obj.labelDiv.style.display = obj.visible ? 'flex' : 'none';
              if (obj.color) {
                  obj.labelDiv.style.borderColor = obj.color;
                  const annDot = obj.labelDiv.querySelector('.annotation-color-dot') as HTMLElement;
                  if (annDot) annDot.style.backgroundColor = obj.color;
                  const measDot = obj.labelDiv.querySelector('.measurement-color-dot') as HTMLElement;
                  if (measDot) measDot.style.backgroundColor = obj.color;
                  const angDot = obj.labelDiv.querySelector('.angle-color-dot') as HTMLElement;
                  if (angDot) angDot.style.backgroundColor = obj.color;
              }
              if (obj.leaderLine) {
                  obj.leaderLine.setAttribute('stroke', obj.color || '#0284c7');
                  if (!obj.visible) obj.leaderLine.style.display = 'none';
              }
          }
          if (this.viewer && this.viewer.viewer && typeof this.viewer.viewer.Render === 'function') {
              this.viewer.viewer.Render();
          }
      }
  }

  private async _recreatePlanningObjects(json: any, zipContents?: any) {
      if (!json) return;
      
      const objectsToLoad = json.objects || [];
      let groupMap = new Map<string, string>(); // Maps old group ID or name to new group ID
      
      // First, create any new groups, resolving by name if possible
      if (json.group) {
          let existingGrp = this.planningGroups.find(g => g.name === json.group);
          if (!existingGrp) {
              const newId = this.addPlanningGroup(json.group);
              groupMap.set('export_group', newId);
          } else {
              groupMap.set('export_group', existingGrp.id);
          }
      }
      
      for (const obj of objectsToLoad) {
           if (obj.groupName) {
               let existingGrp = this.planningGroups.find(g => g.name === obj.groupName);
               if (!existingGrp) {
                   const newId = this.addPlanningGroup(obj.groupName);
                   groupMap.set(obj.groupName, newId);
               } else {
                   groupMap.set(obj.groupName, existingGrp.id);
               }
           }
      }
      
      const modelRoot = this.getModelRoot();
      const applyModelTransform = (pt: any) => {
          if (modelRoot && window.THREE) {
              const vec = new window.THREE.Vector3(pt.x, pt.y, pt.z);
              vec.applyMatrix4(modelRoot.matrixWorld);
              return { x: vec.x, y: vec.y, z: vec.z };
          }
          return pt;
      };

      for (const obj of objectsToLoad) {
          try {
              let objectCreated = false;

              if (obj.type === 'plane' && obj.p1 && obj.p2 && obj.p3) {
                  const p1 = applyModelTransform(obj.p1);
                  const p2 = applyModelTransform(obj.p2);
                  const p3 = applyModelTransform(obj.p3);
                  this.createPlanningPlane(
                      new window.THREE.Vector3(p1.x, p1.y, p1.z),
                      new window.THREE.Vector3(p2.x, p2.y, p2.z),
                      new window.THREE.Vector3(p3.x, p3.y, p3.z),
                      obj.extWidth,
                      obj.extLength
                  );
                  if (this.planningObjects.length > 0) {
                      const newObj = this.planningObjects[this.planningObjects.length - 1];
                      this.updatePlaneGeometry(newObj.id, obj.extWidth || 0, obj.thickness || 0);
                  }
                  objectCreated = true;
              } else if (obj.type === 'cylinder' && obj.p1 && obj.p2) {
                  const p1 = applyModelTransform(obj.p1);
                  const p2 = applyModelTransform(obj.p2);
                  this.createPlanningCylinder(
                      new window.THREE.Vector3(p1.x, p1.y, p1.z),
                      new window.THREE.Vector3(p2.x, p2.y, p2.z),
                      (obj.diameter !== undefined ? obj.diameter : obj.radius * 2) / 2,
                      obj.extension
                  );
                  objectCreated = true;
              } else if (obj.type === 'curve' && obj.points) {
                  const pts = obj.points.map((p: any) => applyModelTransform(p));
                  this.createPlanningCurve(
                      pts.map((p: any) => new window.THREE.Vector3(p.x, p.y, p.z)),
                      obj.thickness
                  );
                  objectCreated = true;
              } else if (obj.type === 'measurement' && obj.p1 && obj.p2Coord) {
                  const p1 = applyModelTransform(obj.p1);
                  const p2Coord = applyModelTransform(obj.p2Coord);
                  this.createPlanningMeasurement(
                      new window.THREE.Vector3(p1.x, p1.y, p1.z),
                      new window.THREE.Vector3(p2Coord.x, p2Coord.y, p2Coord.z),
                      obj.angle || 0,
                      obj.cardOffset
                  );
                  objectCreated = true;
              } else if (obj.type === 'angle' && obj.p1 && obj.p2Coord && obj.p3) {
                  const p1 = applyModelTransform(obj.p1);
                  const p2Coord = applyModelTransform(obj.p2Coord);
                  const p3 = applyModelTransform(obj.p3);
                  this.createPlanningAngle(
                      new window.THREE.Vector3(p1.x, p1.y, p1.z),
                      new window.THREE.Vector3(p2Coord.x, p2Coord.y, p2Coord.z),
                      new window.THREE.Vector3(p3.x, p3.y, p3.z),
                      obj.angle || 0,
                      obj.cardOffset
                  );
                  objectCreated = true;
              } else if (obj.type === 'point' && obj.points && obj.points.length > 0) {
                  const p0 = applyModelTransform(obj.points[0]);
                  this.createPlanningPoint(
                      new window.THREE.Vector3(p0.x, p0.y, p0.z),
                      obj.diameter || 0.2
                  );
                  objectCreated = true;
              } else if (obj.type === 'annotation' && obj.position) {
                  const p0 = applyModelTransform(obj.position);
                  const norm = obj.normal ? applyModelTransform(obj.normal) : null;
                  this.createPlanningAnnotation(
                      new window.THREE.Vector3(p0.x, p0.y, p0.z),
                      norm ? new window.THREE.Vector3(norm.x, norm.y, norm.z) : null,
                      obj.text || obj.name,
                      obj.description,
                      obj.color || '#0284c7',
                      obj.pinSize || 1.5,
                      obj.cardOffset
                  );
                  objectCreated = true;
              } else if (obj.type === 'custom_model') {
                  let arrayBuffer: ArrayBuffer | null = null;
                  let freshDataURL = obj.fileDataURL || '';

                  // Look for matching STL entry in zipContents if available
                  if (zipContents && zipContents.files) {
                      const candidateNames = [
                          obj.fileName,
                          obj.name ? `${obj.name}.stl` : null,
                          obj.id ? `${obj.id}.stl` : null,
                          obj.name,
                          obj.id
                      ].filter(Boolean).map(n => (n as string).toLowerCase().trim());

                      for (const key of Object.keys(zipContents.files)) {
                          if (key.startsWith('__MACOSX/') || key.includes('/__MACOSX/')) continue;
                          const baseName = (key.split('/').pop() || '').toLowerCase().trim();
                          if (baseName.startsWith('.')) continue;

                          if (candidateNames.includes(baseName) || (baseName.endsWith('.stl') && candidateNames.includes(baseName.replace(/\.stl$/i, '')))) {
                              try {
                                  arrayBuffer = await zipContents.files[key].async("arraybuffer");
                                  const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
                                  freshDataURL = URL.createObjectURL(blob);
                                  break;
                              } catch (zipReadErr) {
                                  console.warn("Failed reading STL buffer from zip entry:", key, zipReadErr);
                              }
                          }
                      }
                  }

                  // Fallback: try fetching from fileDataURL if buffer not in zip
                  if (!arrayBuffer && obj.fileDataURL) {
                      try {
                          const res = await fetch(obj.fileDataURL);
                          if (res.ok) {
                              arrayBuffer = await res.arrayBuffer();
                          }
                      } catch (fetchErr) {
                          console.warn("Could not fetch fileDataURL for custom model:", obj.name, fetchErr);
                      }
                  }

                  if (!arrayBuffer) {
                      console.warn("Could not retrieve 3D data for custom model:", obj.name || obj.id);
                      continue;
                  }

                  const loader = new window.THREE.STLLoader();
                  const geometry = loader.parse(arrayBuffer);
                  if (modelRoot && window.THREE) { geometry.applyMatrix4(modelRoot.matrixWorld); }
                  geometry.computeBoundingBox();
                  geometry.computeBoundingSphere();
                  const center = new window.THREE.Vector3();
                  geometry.boundingBox.getCenter(center);
                  geometry.translate(-center.x, -center.y, -center.z);
                  geometry.computeBoundingBox();
                  geometry.computeBoundingSphere();

                  if (geometry.attributes && geometry.attributes.color) {
                      geometry.deleteAttribute('color');
                  }

                  const material = new window.THREE.MeshStandardMaterial({
                      color: obj.color ? new window.THREE.Color(obj.color) : new window.THREE.Color(0x8b5cf6),
                      transparent: (obj.opacity !== undefined ? obj.opacity : 0.7) < 1.0,
                      opacity: obj.opacity !== undefined ? obj.opacity : 0.7,
                      depthTest: true,
                      depthWrite: (obj.opacity !== undefined ? obj.opacity : 0.7) >= 1.0,
                      side: window.THREE.DoubleSide,
                      roughness: 0.35,
                      metalness: 0.1
                  });
                  const mesh = new window.THREE.Mesh(geometry, material);
                  mesh.renderOrder = 999;
                  mesh.position.copy(center);

                  mesh.userData = { isCustomOverlay: true };
                  
                  if (this.viewer && this.viewer.viewer) {
                      const scene = this.viewer.viewer.scene || this.viewer.viewer.mainScene;
                      if (scene) scene.add(mesh);
                  }

                  this.planningObjects.push({
                      id: (obj.id && !this.planningObjects.some(existing => existing.id === obj.id)) ? obj.id : `CustomModel_${this.nextPlanningObjectId++}`,
                      name: obj.name,
                      type: 'custom_model',
                      mesh,
                      color: obj.color || '#8b5cf6',
                      opacity: obj.opacity !== undefined ? obj.opacity : 0.7,
                      fileName: obj.fileName || `${obj.name || 'Model'}.stl`,
                      fileDataURL: freshDataURL
                  });
                  objectCreated = true;
              } else {
                  console.warn("Unsupported or missing data for planning object:", obj);
                  continue;
              }

              if (objectCreated && this.planningObjects.length > 0) {
                  const newObj = this.planningObjects[this.planningObjects.length - 1];
                  newObj.name = obj.name;
                  newObj.color = obj.color;
                  newObj.visible = typeof obj.visible === 'boolean' ? obj.visible : true;
                  
                  if (obj.groupName && groupMap.has(obj.groupName)) {
                      newObj.groupId = groupMap.get(obj.groupName)!;
                  } else if (groupMap.has('export_group')) {
                      newObj.groupId = groupMap.get('export_group')!;
                  } else if (obj.groupId) {
                      const existingGrp = this.planningGroups.find(g => g.id === obj.groupId);
                      if (existingGrp) {
                          newObj.groupId = existingGrp.id;
                      }
                  }
                  
                  if (obj.cardOffset) {
                      newObj.cardOffset = { x: Math.round(obj.cardOffset.x), y: Math.round(obj.cardOffset.y) };
                      this.updatePlanningCardLabel(newObj);
                  }
                  
                  // Custom models and geometric objects have their positions and matrices accurately configured
                  // during their respective creation steps. Do not overwrite mesh transforms.
                  this.updateMeshColorAndVisibility(newObj);
              }
          } catch (itemErr) {
              console.error("Error recreating planning object:", obj?.name || obj?.id, itemErr);
          }
      }
      if (this.config.onPlanningObjectsChange) {
          this.config.onPlanningObjectsChange(this.planningObjects);
      }
      this.saveToLocalStorage();
  }

  async importPlanningObjectsZip(file: File) {
      if (!window.THREE) return;
      
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.json') || fileName.endsWith('.mrk.json')) {
          try {
              const text = await file.text();
              const json = JSON.parse(text);
              if (json && json.appMetaData) {
                  await this._recreatePlanningObjects(json.appMetaData);
              } else if (json && json.markups) {
                  await this.loadSlicerMarkupsJson(json);
              } else if (json && json.objects) {
                  await this._recreatePlanningObjects(json);
              }
          } catch(err) {
              console.error("Failed to parse standalone config JSON:", err);
          }
          return;
      }

      // Read array buffer immediately while the file handle is active
      let arrayBuffer: ArrayBuffer;
      try {
          arrayBuffer = await file.arrayBuffer();
      } catch (readErr) {
          console.error("Failed to read planning ZIP file buffer:", readErr);
          return;
      }
      
      let JSZip: any;
      try {
          const jszipMod = await import('jszip');
          JSZip = jszipMod.default || jszipMod;
      } catch (importErr) {
          console.error("Failed to load JSZip module:", importErr);
          return;
      }

      const zip = new JSZip();
      try {
          const contents = await zip.loadAsync(arrayBuffer);
          
          const isValidZipEntry = (name: string) => {
              if (name.startsWith('__MACOSX/') || name.includes('/__MACOSX/')) return false;
              const baseName = name.split('/').pop() || '';
              if (baseName.startsWith('.')) return false;
              return true;
          };

          const validFiles = Object.keys(contents.files).filter(isValidZipEntry);

          let json: any = null;

          // Priority 1: metadata.json
          const metadataKey = validFiles.find(name => {
              const b = name.split('/').pop()?.toLowerCase();
              return b === 'metadata.json';
          });
          if (metadataKey) {
              try {
                  const str = await contents.files[metadataKey].async("string");
                  json = JSON.parse(str);
              } catch (e) {
                  console.warn("Failed to parse metadata.json in zip:", e);
              }
          }

          // Priority 2: *.mrk.json
          if (!json) {
              const mrkKey = validFiles.find(name => {
                  const b = name.split('/').pop()?.toLowerCase() || '';
                  return b.endsWith('.mrk.json');
              });
              if (mrkKey) {
                  try {
                      const str = await contents.files[mrkKey].async("string");
                      json = JSON.parse(str);
                  } catch (e) {
                      console.warn("Failed to parse .mrk.json in zip:", e);
                  }
              }
          }

          // Priority 3: any other .json file
          if (!json) {
              const jsonKey = validFiles.find(name => {
                  const b = name.split('/').pop()?.toLowerCase() || '';
                  return b.endsWith('.json');
              });
              if (jsonKey) {
                  try {
                      const str = await contents.files[jsonKey].async("string");
                      json = JSON.parse(str);
                  } catch (e) {
                      console.warn("Failed to parse json file in zip:", e);
                  }
              }
          }

          if (json && json.appMetaData) {
              // We have full app state embedded in the Slicer markups file, use that.
              json = json.appMetaData;
          } else if (json && json.markups && (!json.objects || json.objects.length === 0)) {
              await this.loadSlicerMarkupsJson(json);
              return;
          }

          if (json && (json.objects || json.group)) {
              await this._recreatePlanningObjects(json, contents);
              return;
          }

          // Fallback: Check if the zip contains standalone STL files
          const stlFiles = validFiles.filter(name => {
              const b = name.split('/').pop()?.toLowerCase() || '';
              return b.endsWith('.stl');
          });

          if (stlFiles.length > 0) {
              for (const stlPath of stlFiles) {
                  const baseName = (stlPath.split('/').pop() || '').replace(/\.stl$/i, '');
                  try {
                      const stlBuffer = await contents.files[stlPath].async("arraybuffer");
                      const fakeFile = new File([stlBuffer], `${baseName}.stl`);
                      await this.importCustomPlanningModel(fakeFile);
                  } catch (stlErr) {
                      console.error("Failed importing STL from zip:", stlPath, stlErr);
                  }
              }
              return;
          }

          console.warn("No compatible planning metadata (.json, .mrk.json) or STL files found in the zip archive.");

      } catch (e) {
          console.error("Failed to parse or load planning ZIP file:", e);
      }
  }


  highlightedPlanningObj: any = null;

  highlightPlanningMesh(obj: any | null) {
      if (this.highlightedPlanningObj && this.highlightedPlanningObj.mesh && window.THREE) {
          // Revert to original color using originalColors map
          const matColor = this.highlightedPlanningObj.color;
          const updateMat = (m: any) => {
              if (this.originalColors.has(m)) {
                  const orig = this.originalColors.get(m);
                  if (orig.color !== null && m.color) m.color.setHex(orig.color);
                  if (orig.vertexColors !== null) m.vertexColors = orig.vertexColors;
                  if (orig.map !== null) m.map = orig.map;
                  if (orig.emissive !== null && m.emissive) m.emissive.setHex(orig.emissive);
              } else {
                  if (m.color) m.color.set(matColor);
                  if (m.emissive) m.emissive.setHex(0x000000);
              }
              if (this.highlightedPlanningObj.opacity !== undefined) {
                  m.transparent = true;
                  m.opacity = this.highlightedPlanningObj.opacity;
              }
              if (this.originalColors.has(m)) {
                  this.originalColors.delete(m);
              }
              m.needsUpdate = true;
          };
          if (typeof this.highlightedPlanningObj.mesh.traverse === 'function') {
              this.highlightedPlanningObj.mesh.traverse((child: any) => {
                  if (child.material && !child.userData?.isEdge) {
                      if (Array.isArray(child.material)) {
                          child.material.forEach(updateMat);
                      } else {
                          updateMat(child.material);
                      }
                  }
              });
          }
      }
      this.highlightedPlanningObj = obj;
      if (obj && obj.type === 'custom_model' && obj.mesh && window.THREE) {
          // Highlight it
          const updateMatHighlight = (m: any) => {
              if (!this.originalColors.has(m)) {
                  this.originalColors.set(m, {
                      color: m.color ? m.color.getHex() : null,
                      vertexColors: m.vertexColors !== undefined ? m.vertexColors : null,
                      map: m.map !== undefined ? m.map : null,
                      emissive: (m.emissive !== undefined && m.emissive.getHex) ? m.emissive.getHex() : null,
                  });
              }
              if (m.color) m.color.setHex(0xaed8f2); // highlight color
              if (m.vertexColors !== undefined) m.vertexColors = typeof m.vertexColors === 'number' ? 0 : false;
              if (m.map !== undefined) m.map = null;
              if (m.emissive) m.emissive.setHex(0x0a1a2a);
              m.needsUpdate = true;
          };
          if (typeof obj.mesh.traverse === 'function') {
              obj.mesh.traverse((child: any) => {
                  if (child.material && !child.userData?.isEdge) {
                      if (Array.isArray(child.material)) {
                          child.material.forEach(updateMatHighlight);
                      } else {
                          updateMatHighlight(child.material);
                      }
                  }
              });
          }
      }
      
      if (this.viewer && this.viewer.viewer) {
          this.viewer.viewer.Render();
      }
  }

  highlightMesh(id: number | null) {
    this.clearHighlight();
    if (id !== null && this.currentMeshes[id]) {
        const mesh = this.currentMeshes[id];
        this.highlightedMesh = mesh;
        if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((mat: any) => {
                if (!this.originalColors.has(mat)) {
                    const ghostOrig = this.ghostedOriginals.get(mat);
                    this.originalColors.set(mat, {
                        color: ghostOrig && ghostOrig.color !== null ? ghostOrig.color : (mat.color ? mat.color.getHex() : 0xcccccc),
                        roughness: ghostOrig && ghostOrig.roughness !== null ? ghostOrig.roughness : (mat.roughness !== undefined ? mat.roughness : null),
                        metalness: ghostOrig && ghostOrig.metalness !== null ? ghostOrig.metalness : (mat.metalness !== undefined ? mat.metalness : null),
                        shininess: ghostOrig && ghostOrig.shininess !== null ? ghostOrig.shininess : (mat.shininess !== undefined ? mat.shininess : null),
                        specular: ghostOrig && ghostOrig.specular !== null ? ghostOrig.specular : (mat.specular !== undefined && mat.specular.getHex ? mat.specular.getHex() : null),
                        vertexColors: ghostOrig && ghostOrig.vertexColors !== null ? ghostOrig.vertexColors : (mat.vertexColors !== undefined ? mat.vertexColors : null),
                        map: ghostOrig && ghostOrig.map !== undefined ? ghostOrig.map : (mat.map !== undefined ? mat.map : null),
                        emissive: ghostOrig && ghostOrig.emissive !== null ? ghostOrig.emissive : ((mat.emissive !== undefined && mat.emissive.getHex) ? mat.emissive.getHex() : null),
                    });
                }
                
                if (!this.isGhostingMode) {
                    // Standard selection: Set the reflective light blue color
                    if (mat.color) {
                        mat.color.setHex(0xaed8f2);
                    }
                    
                    // Disable vertex coloring and textures temporarily so the color is exact and not mixed
                    if (mat.vertexColors !== undefined) {
                        mat.vertexColors = typeof mat.vertexColors === 'number' ? 0 : false;
                    }
                    if (mat.map !== undefined) {
                        mat.map = null;
                    }
                    if (mat.emissive !== undefined && mat.emissive.setHex) {
                        mat.emissive.setHex(0x000000);
                    }
                    
                    // Enhance reflectivity and shine
                    if (mat.roughness !== undefined) {
                        mat.roughness = 0.11; // smooth reflective surface
                    }
                    if (mat.metalness !== undefined) {
                        mat.metalness = 0.18; // elegant slight metallic reflection
                    }
                    if (mat.shininess !== undefined) {
                        mat.shininess = 80; // high gloss for Phong material
                    }
                    if (mat.specular !== undefined && mat.specular.setHex) {
                        mat.specular.setHex(0xffffff); // pure white specular reflecting light
                    }
                } else {
                    // Focus X-Ray mode: Display selected mesh in its ORIGINAL color and texture
                    const orig = this.originalColors.get(mat);
                    if (orig) {
                        if (mat.color && orig.color !== null) {
                            mat.color.setHex(orig.color);
                        }
                        if (orig.roughness !== null && mat.roughness !== undefined) {
                            mat.roughness = orig.roughness;
                        }
                        if (orig.metalness !== null && mat.metalness !== undefined) {
                            mat.metalness = orig.metalness;
                        }
                        if (orig.shininess !== null && mat.shininess !== undefined) {
                            mat.shininess = orig.shininess;
                        }
                        if (orig.specular !== null && mat.specular !== undefined && mat.specular.setHex) {
                            mat.specular.setHex(orig.specular);
                        }
                        if (orig.vertexColors !== null && mat.vertexColors !== undefined) {
                            mat.vertexColors = orig.vertexColors;
                        }
                        if (orig.map !== null && mat.map !== undefined) {
                            mat.map = orig.map;
                        }
                        if (orig.emissive !== null && mat.emissive !== undefined && mat.emissive.setHex) {
                            mat.emissive.setHex(orig.emissive);
                        }
                    }
                }
                
                mat.needsUpdate = true;
            });
        }
    }
    this.config.onMeshHighlighted(id);
    if (this.isGhostingMode) {
        this.applyGhostingMode();
    }
    if (this.viewer?.viewer) {
        try { this.viewer.viewer.Render(); } catch(e) {}
    }
  }

  clearHighlight() {
      if (this.highlightedMesh && this.highlightedMesh.material) {
          const materials = Array.isArray(this.highlightedMesh.material) ? this.highlightedMesh.material : [this.highlightedMesh.material];
          materials.forEach((mat: any) => {
              if (this.originalColors.has(mat)) {
                  const orig = this.originalColors.get(mat);
                  if (orig) {
                      if (mat.color && orig.color !== null) {
                          mat.color.setHex(orig.color);
                      }
                      if (orig.roughness !== null && mat.roughness !== undefined) {
                          mat.roughness = orig.roughness;
                       }
                      if (orig.metalness !== null && mat.metalness !== undefined) {
                          mat.metalness = orig.metalness;
                       }
                      if (orig.shininess !== null && mat.shininess !== undefined) {
                          mat.shininess = orig.shininess;
                       }
                      if (orig.specular !== null && mat.specular !== undefined && mat.specular.setHex) {
                          mat.specular.setHex(orig.specular);
                       }
                      if (orig.vertexColors !== null && mat.vertexColors !== undefined) {
                          mat.vertexColors = orig.vertexColors;
                       }
                      if (orig.map !== null && mat.map !== undefined) {
                          mat.map = orig.map;
                       }
                      if (orig.emissive !== null && mat.emissive !== undefined && mat.emissive.setHex) {
                          mat.emissive.setHex(orig.emissive);
                       }
                  }
              }
              mat.needsUpdate = true;
          });
          this.highlightedMesh = null;
      }
      if (this.isGhostingMode) {
          this.applyGhostingMode();
      }
  }

  setGhostingMode(enabled: boolean) {
    this.isGhostingMode = enabled;
    if (enabled) {
      // If a mesh is currently highlighted, ensure its color is rendered in original color
      if (this.highlightedMesh && this.highlightedMesh.material) {
        const materials = Array.isArray(this.highlightedMesh.material) ? this.highlightedMesh.material : [this.highlightedMesh.material];
        materials.forEach((mat: any) => {
          const orig = this.originalColors.get(mat);
          if (orig) {
            if (orig.color !== null && mat.color) mat.color.setHex(orig.color);
            if (orig.roughness !== null && mat.roughness !== undefined) mat.roughness = orig.roughness;
            if (orig.metalness !== null && mat.metalness !== undefined) mat.metalness = orig.metalness;
            if (orig.shininess !== null && mat.shininess !== undefined) mat.shininess = orig.shininess;
            if (orig.specular !== null && mat.specular !== undefined && mat.specular.setHex) mat.specular.setHex(orig.specular);
            if (orig.vertexColors !== null && mat.vertexColors !== undefined) mat.vertexColors = orig.vertexColors;
            if (orig.map !== null && mat.map !== undefined) mat.map = orig.map;
            if (orig.emissive !== null && mat.emissive && mat.emissive.setHex) mat.emissive.setHex(orig.emissive);
            mat.needsUpdate = true;
          }
        });
      }
      this.applyGhostingMode();
    } else {
      this.revertGhostingMode();
      // If a mesh is still selected when exiting Focus X-Ray mode, apply standard reflective highlight
      if (this.highlightedMesh && this.highlightedMesh.material) {
        const materials = Array.isArray(this.highlightedMesh.material) ? this.highlightedMesh.material : [this.highlightedMesh.material];
        materials.forEach((mat: any) => {
          if (mat.color) mat.color.setHex(0xaed8f2);
          if (mat.vertexColors !== undefined) mat.vertexColors = typeof mat.vertexColors === 'number' ? 0 : false;
          if (mat.map !== undefined) mat.map = null;
          if (mat.emissive !== undefined && mat.emissive.setHex) mat.emissive.setHex(0x000000);
          if (mat.roughness !== undefined) mat.roughness = 0.11;
          if (mat.metalness !== undefined) mat.metalness = 0.18;
          if (mat.shininess !== undefined) mat.shininess = 80;
          if (mat.specular !== undefined && mat.specular.setHex) mat.specular.setHex(0xffffff);
          mat.needsUpdate = true;
        });
      }
    }
    if (this.viewer?.viewer) {
      try { this.viewer.viewer.Render(); } catch(e) {}
    }
  }

  applyGhostingMode() {
    if (!window.THREE || !this.currentMeshes.length) return;

    this.currentMeshes.forEach((mesh, index) => {
      if (!mesh || !mesh.material) return;
      const isTarget = this.highlightedMesh ? (mesh === this.highlightedMesh) : true;

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat: any) => {
        if (!isTarget) {
          // Save original properties once (using originalColors if available)
          if (!this.ghostedOriginals.has(mat)) {
            const origColorObj = this.originalColors.get(mat);
            this.ghostedOriginals.set(mat, {
              color: origColorObj && origColorObj.color !== null ? origColorObj.color : (mat.color ? mat.color.getHex() : null),
              opacity: mat.opacity !== undefined ? mat.opacity : 1,
              transparent: !!mat.transparent,
              depthWrite: mat.depthWrite !== undefined ? mat.depthWrite : true,
              emissive: origColorObj && origColorObj.emissive !== null ? origColorObj.emissive : ((mat.emissive && mat.emissive.getHex) ? mat.emissive.getHex() : null),
              map: origColorObj && origColorObj.map !== undefined ? origColorObj.map : (mat.map !== undefined ? mat.map : null),
              roughness: origColorObj && origColorObj.roughness !== null ? origColorObj.roughness : (mat.roughness !== undefined ? mat.roughness : null),
              metalness: origColorObj && origColorObj.metalness !== null ? origColorObj.metalness : (mat.metalness !== undefined ? mat.metalness : null),
              shininess: origColorObj && origColorObj.shininess !== null ? origColorObj.shininess : (mat.shininess !== undefined ? mat.shininess : null),
              specular: origColorObj && origColorObj.specular !== null ? origColorObj.specular : (mat.specular !== undefined && mat.specular.getHex ? mat.specular.getHex() : null),
              vertexColors: origColorObj && origColorObj.vertexColors !== null ? origColorObj.vertexColors : (mat.vertexColors !== undefined ? mat.vertexColors : null),
            });
          }
          // Ghost style: semi-transparent, cyan-tinted x-ray silhouette
          mat.transparent = true;
          mat.opacity = 0.18;
          mat.depthWrite = false;
          if (mat.color) mat.color.setHex(0x5a8fb4);
          if (mat.emissive && mat.emissive.setHex) mat.emissive.setHex(0x11283c);
          mat.needsUpdate = true;
        } else {
          // Target structure: restore to solid full opacity and ORIGINAL COLOR
          if (this.ghostedOriginals.has(mat)) {
            const orig = this.ghostedOriginals.get(mat)!;
            mat.transparent = orig.transparent;
            mat.opacity = orig.opacity;
            mat.depthWrite = orig.depthWrite;
            if (orig.color !== null && mat.color) {
              mat.color.setHex(orig.color);
            }
            if (orig.emissive !== null && mat.emissive && mat.emissive.setHex) {
              mat.emissive.setHex(orig.emissive);
            }
            if (orig.roughness !== null && mat.roughness !== undefined) {
              mat.roughness = orig.roughness;
            }
            if (orig.metalness !== null && mat.metalness !== undefined) {
              mat.metalness = orig.metalness;
            }
            if (orig.shininess !== null && mat.shininess !== undefined) {
              mat.shininess = orig.shininess;
            }
            if (orig.specular !== null && mat.specular !== undefined && mat.specular.setHex) {
              mat.specular.setHex(orig.specular);
            }
            if (orig.vertexColors !== null && mat.vertexColors !== undefined) {
              mat.vertexColors = orig.vertexColors;
            }
            if (orig.map !== null && mat.map !== undefined) {
              mat.map = orig.map;
            }
            this.ghostedOriginals.delete(mat);
            mat.needsUpdate = true;
          } else {
            const orig = this.originalColors.get(mat);
            if (orig) {
              if (orig.color !== null && mat.color) mat.color.setHex(orig.color);
              if (orig.emissive !== null && mat.emissive && mat.emissive.setHex) mat.emissive.setHex(orig.emissive);
              if (orig.roughness !== null && mat.roughness !== undefined) mat.roughness = orig.roughness;
              if (orig.metalness !== null && mat.metalness !== undefined) mat.metalness = orig.metalness;
              if (orig.shininess !== null && mat.shininess !== undefined) mat.shininess = orig.shininess;
              if (orig.specular !== null && mat.specular !== undefined && mat.specular.setHex) mat.specular.setHex(orig.specular);
              if (orig.vertexColors !== null && mat.vertexColors !== undefined) mat.vertexColors = orig.vertexColors;
              if (orig.map !== null && mat.map !== undefined) mat.map = orig.map;
              mat.needsUpdate = true;
            }
          }
        }
      });
    });
  }

  revertGhostingMode() {
    this.ghostedOriginals.forEach((orig: any, mat: any) => {
      mat.transparent = orig.transparent;
      mat.opacity = orig.opacity;
      mat.depthWrite = orig.depthWrite;
      // If this material is not currently highlighted, restore color and emissive
      const isCurrentlyHighlighted = this.highlightedMesh && (
        this.highlightedMesh.material === mat ||
        (Array.isArray(this.highlightedMesh.material) && this.highlightedMesh.material.includes(mat))
      );
      if (!isCurrentlyHighlighted) {
        if (orig.color !== null && mat.color) {
          mat.color.setHex(orig.color);
        }
        if (orig.emissive !== null && mat.emissive && mat.emissive.setHex) {
          mat.emissive.setHex(orig.emissive);
        }
        if (orig.roughness !== null && mat.roughness !== undefined) {
          mat.roughness = orig.roughness;
        }
        if (orig.metalness !== null && mat.metalness !== undefined) {
          mat.metalness = orig.metalness;
        }
        if (orig.shininess !== null && mat.shininess !== undefined) {
          mat.shininess = orig.shininess;
        }
        if (orig.specular !== null && mat.specular !== undefined && mat.specular.setHex) {
          mat.specular.setHex(orig.specular);
        }
        if (orig.vertexColors !== null && mat.vertexColors !== undefined) {
          mat.vertexColors = orig.vertexColors;
        }
        if (orig.map !== null && mat.map !== undefined) {
          mat.map = orig.map;
        }
      }
      mat.needsUpdate = true;
    });
    this.ghostedOriginals.clear();
  }

  // --- CLIPPING ---
  
  setClippingActive(active: boolean, planesState: any) {
    if (active) {
      if (!this.modelBBox) {
        this.modelBBox = new window.THREE.Box3();
      }
      this.modelBBox.makeEmpty();
      this.currentMeshes.forEach(mesh => {
          const meshBox = new window.THREE.Box3().setFromObject(mesh);
          this.modelBBox.union(meshBox);
      });
    }
    this.updateClippingPlanes(active ? planesState : null);
  }

  updateClippingPlanes(planesState: any) {
    this.lastPlanesState = planesState;
    if (!this.viewer?.viewer?.renderer) return;
    const renderer = this.viewer.viewer.renderer;
    renderer.localClippingEnabled = true;

    if (planesState && this.modelBBox && !this.modelBBox.isEmpty()) {
        const activePlanes: any[] = [];
        
        ['x', 'y', 'z'].forEach(axis => {
            const state = planesState[axis];
            if (state && state.active) {
                if (!state.plane) state.plane = new window.THREE.Plane();
                
                let min, max;
                if (axis === 'x') { min = this.modelBBox.min.x; max = this.modelBBox.max.x; }
                else if (axis === 'y') { min = this.modelBBox.min.y; max = this.modelBBox.max.y; }
                else if (axis === 'z') { min = this.modelBBox.min.z; max = this.modelBBox.max.z; }

                const pos = min + (max - min) * (state.sliderVal / 100);

                const normal = new window.THREE.Vector3();
                if (axis === 'x') normal.set(1, 0, 0);
                if (axis === 'y') normal.set(0, 1, 0);
                if (axis === 'z') normal.set(0, 0, 1);

                const pointOnPlane = new window.THREE.Vector3();
                if (axis === 'x') pointOnPlane.x = pos;
                if (axis === 'y') pointOnPlane.y = pos;
                if (axis === 'z') pointOnPlane.z = pos;

                if (state.alignToCamera) {
                    if (this.viewer?.viewer?.navigation?.GetCamera) {
                        const cam = this.viewer.viewer.navigation.GetCamera();
                        if (cam && cam.eye && cam.center) {
                            normal.set(cam.center.x - cam.eye.x, cam.center.y - cam.eye.y, cam.center.z - cam.eye.z).normalize();
                        }
                    } else if (this.viewer?.viewer?.navigation?.camera) {
                        this.viewer.viewer.navigation.camera.getWorldDirection(normal);
                    }
                    
                    if (!this.modelBBox.isEmpty()) {
                        const bboxCenter = new window.THREE.Vector3();
                        this.modelBBox.getCenter(bboxCenter);
                        
                        const absNormal = new window.THREE.Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
                        const boxSize = new window.THREE.Vector3();
                        this.modelBBox.getSize(boxSize);
                        
                        const spanExtents = (boxSize.x * absNormal.x + boxSize.y * absNormal.y + boxSize.z * absNormal.z);
                        const scrubMin = -spanExtents / 2;
                        const scrubMax = spanExtents / 2;
                        
                        const scrubPos = scrubMin + (scrubMax - scrubMin) * (state.sliderVal / 100);
                        
                        pointOnPlane.copy(bboxCenter).add(normal.clone().multiplyScalar(scrubPos));
                    }
                }

                if (state.invert) normal.negate();

                state.plane.normal.copy(normal);
                state.plane.constant = -normal.dot(pointOnPlane);
                
                activePlanes.push(state.plane);
            }
        });

        this.currentMeshes.forEach(mesh => {
            if (mesh.material) {
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                materials.forEach((mat: any) => {
                    let needsAssignment = false;
                    if (!mat.clippingPlanes || mat.clippingPlanes.length !== activePlanes.length) {
                        needsAssignment = true;
                    } else {
                        for (let i = 0; i < activePlanes.length; i++) {
                            if (mat.clippingPlanes[i] !== activePlanes[i]) {
                                needsAssignment = true; break;
                            }
                        }
                    }
                    if (needsAssignment) {
                        mat.clippingPlanes = activePlanes;
                        mat.clipShadows = true;
                        mat.side = window.THREE.DoubleSide;
                        mat.needsUpdate = true;
                    }
                });
            }
        });
    } else {
        this.currentMeshes.forEach(mesh => {
            if (mesh.material) {
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                materials.forEach((mat: any) => {
                    if (mat.clippingPlanes !== null) {
                        mat.clippingPlanes = null;
                        mat.needsUpdate = true;
                    }
                });
            }
        });
    }

    try { this.viewer.viewer.Render(); } catch(e) {}
  }

  // --- EXPLOSION ---
  
  setupExplosion() {
    const scene = this.viewer?.viewer?.scene || this.viewer?.viewer?.mainScene;
    if (!scene || this.currentMeshes.length === 0) return;

    const boundingBox = new window.THREE.Box3();
    this.currentMeshes.forEach(mesh => {
        if (!mesh) return;
        const meshBox = new window.THREE.Box3().setFromObject(mesh);
        boundingBox.union(meshBox);
    });
    
    const modelCenter = new window.THREE.Vector3();
    if (!boundingBox.isEmpty()) {
        if (typeof boundingBox.getCenter === 'function' && boundingBox.getCenter.length === 0) {
            modelCenter.copy(boundingBox.getCenter());
        } else {
            boundingBox.getCenter(modelCenter);
        }
    }

    const size = new window.THREE.Vector3();
    if (!boundingBox.isEmpty()) {
        if (typeof boundingBox.getSize === 'function' && boundingBox.getSize.length === 0) {
            size.copy(boundingBox.getSize());
        } else {
            boundingBox.getSize(size);
        }
    }
    const maxDim = Math.max(size.x, size.y, size.z) || 100;

    this.currentMeshes.forEach(mesh => {
        mesh.userData = mesh.userData || {};
        mesh.userData.originalPosition = mesh.position.clone();
        
        const meshBox = new window.THREE.Box3().setFromObject(mesh);
        const meshCenter = new window.THREE.Vector3();
        if (!meshBox.isEmpty()) {
            if (typeof meshBox.getCenter === 'function' && meshBox.getCenter.length === 0) {
                meshCenter.copy(meshBox.getCenter());
            } else {
                meshBox.getCenter(meshCenter);
            }
        } else {
            meshCenter.copy(mesh.position);
        }
        
        let dir = new window.THREE.Vector3().subVectors(meshCenter, modelCenter);
        if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0); 
        else dir.normalize();
        
        mesh.userData.explosionDir = dir;
        mesh.userData.maxDim = maxDim;
    });
  }

  setExplode(val: number) {
      if (!this.viewer?.viewer) return;
      this.currentMeshes.forEach(mesh => {
          if (mesh && mesh.userData && mesh.userData.originalPosition && mesh.userData.explosionDir) {
              const moveDist = val * mesh.userData.maxDim * 0.5;
              mesh.position.copy(mesh.userData.originalPosition)
                  .add(mesh.userData.explosionDir.clone().multiplyScalar(moveDist));
              if (mesh.updateMatrixWorld) mesh.updateMatrixWorld(true);
          }
      });
      try { this.viewer.viewer.Render(); } catch(err) {}
  }


  setAutoRotate(val: boolean) {
      this.isAutoRotating = val;
  }

  // --- RULERS ---
  
  setRulersVisible(val: boolean) {
      this.rulersVisible = val;
      if (val) {
          this.resizeRulers();
          this.lastCameraState = '';
      }
  }

  resizeRulers() {
      if (this.topRulerRef) {
          const rect = this.topRulerRef.getBoundingClientRect();
          if (this.topRulerRef.width !== rect.width) this.topRulerRef.width = rect.width;
          if (this.topRulerRef.height !== rect.height) this.topRulerRef.height = rect.height;
      }
      if (this.leftRulerRef) {
          const rect = this.leftRulerRef.getBoundingClientRect();
          if (this.leftRulerRef.width !== rect.width) this.leftRulerRef.width = rect.width;
          if (this.leftRulerRef.height !== rect.height) this.leftRulerRef.height = rect.height;
      }
  }

  domUpdateLoop = () => {
    if (this.isDisposed) return;
    try {
        if (this.lastPlanesState) {
            let needsUpdate = false;
            for (const axis of ['x', 'y', 'z']) {
               if (this.lastPlanesState[axis]?.active && this.lastPlanesState[axis]?.alignToCamera) {
                   needsUpdate = true;
                   break;
               }
            }
            if (needsUpdate) {
                this.updateClippingPlanes(this.lastPlanesState);
            }
        }
    
        if (this.viewer?.viewer?.navigation) {
            if (this.flyThroughState.active && window.THREE) {
                const now = performance.now();
                if (this.flyThroughState.isPlaying) {
                    const dt = Math.min((now - (this.lastFlyThroughTimestamp || now)) / 1000, 0.1);
                    const totalDist = this.flyThroughState.totalDistance || 100;
                    const speedMmPerSec = 25 * this.flyThroughState.speed;
                    const progressDelta = (speedMmPerSec / Math.max(1, totalDist)) * dt * this.flyThroughState.direction;

                    let newProgress = this.flyThroughState.progress + progressDelta;
                    if (newProgress >= 1.0) {
                        if (this.flyThroughState.loop) {
                            newProgress = 0.0;
                        } else {
                            newProgress = 1.0;
                            this.flyThroughState.isPlaying = false;
                        }
                    } else if (newProgress <= 0.0) {
                        if (this.flyThroughState.loop) {
                            newProgress = 1.0;
                        } else {
                            newProgress = 0.0;
                            this.flyThroughState.isPlaying = false;
                        }
                    }
                    this.flyThroughState.progress = newProgress;
                    this.flyThroughState.currentDistance = newProgress * totalDist;
                    this.updateFlyThroughCamera();
                    if (this.config.onFlyThroughStateChange) {
                        this.config.onFlyThroughStateChange({ ...this.flyThroughState });
                    }
                }
                this.lastFlyThroughTimestamp = now;
            } else if (this.isAutoRotating && window.THREE) {
                const nav = this.viewer.viewer.navigation;
                let originalCam: any = null;
                if (typeof nav.GetCamera === 'function') {
                    originalCam = nav.GetCamera();
                } else if (nav.camera) {
                    const threeCam = nav.camera;
                    originalCam = new window.OV.Camera(
                        new window.OV.Coord3D(threeCam.position.x, threeCam.position.y, threeCam.position.z),
                        new window.OV.Coord3D(nav.controls?.target?.x || 0, nav.controls?.target?.y || 0, nav.controls?.target?.z || 0),
                        new window.OV.Coord3D(threeCam.up.x, threeCam.up.y, threeCam.up.z),
                        threeCam.fov || 45.0
                    );
                }
                
                if (originalCam && originalCam.eye && originalCam.center && originalCam.up) {
                    const eye = originalCam.eye;
                    const center = originalCam.center;
                    const up = originalCam.up;

                    const offset = new window.THREE.Vector3(eye.x - center.x, eye.y - center.y, eye.z - center.z);
                    const upVec = new window.THREE.Vector3(up.x, up.y, up.z).normalize();
                    const angleRad = 0.005; // Adjust speed as needed
                    offset.applyAxisAngle(upVec, angleRad);
                    
                    const newEye = new window.THREE.Vector3(center.x, center.y, center.z).add(offset);
                    
                    const tempCam = new window.OV.Camera(
                        new window.OV.Coord3D(newEye.x, newEye.y, newEye.z),
                        new window.OV.Coord3D(center.x, center.y, center.z),
                        new window.OV.Coord3D(up.x, up.y, up.z),
                        originalCam.fov || 45.0
                    );
                    nav.SetCamera(tempCam);
                    this.viewer.viewer.Render();
                }
            }

            let cam: any = null;
            if (typeof this.viewer.viewer.navigation.GetCamera === 'function') {
                cam = this.viewer.viewer.navigation.GetCamera();
            } else if (this.viewer.viewer.navigation.camera) {
                const threeCam = this.viewer.viewer.navigation.camera;
                cam = {
                    eye: threeCam.position,
                    center: this.viewer.viewer.navigation.controls?.target || new window.THREE.Vector3()
                };
            }

            let cameraMoved = false;
            if (cam && cam.eye && cam.center) {
                const cw = this.container.clientWidth;
                const ch = this.container.clientHeight;
                const stateStr = `${Math.round(cam.eye.x * 50)},${Math.round(cam.eye.y * 50)},${Math.round(cam.eye.z * 50)},${Math.round(cam.center.x * 50)},${Math.round(cam.center.y * 50)},${Math.round(cam.center.z * 50)},${cw},${ch}`;
                if (stateStr !== this.lastCameraState) { 
                    this.lastCameraState = stateStr;
                    cameraMoved = true;
                }
            }

            // Update Planning Object Overlays only when camera moves, is actively animated, or requested
            const isInteracting = this.isRotatingTool || this.isTranslatingTool || this.isAutoRotating || this.flyThroughState.isPlaying;
            if ((cameraMoved || isInteracting || this.forceNextOverlayUpdate) && this.planningObjects) {
                this.forceNextOverlayUpdate = false;
                this.planningObjects.forEach(obj => {
                    if (obj.labelDiv && (obj.type === 'annotation' || obj.type === 'measurement' || obj.type === 'angle')) {
                        this.updatePlanningCardLabel(obj);
                    }
                });
            }

            if (this.isRotatingTool) {
                this.updateRotationVisualCue();
            }
            if (this.isTranslatingTool) {
                this.updateTranslationVisualCue();
            }

            if (this.rulersVisible && cameraMoved && cam && cam.eye && cam.center) {
                this.resizeRulers(); 
                this.drawRulers(cam, this.topRulerRef, this.leftRulerRef); 
            } // end rulersVisible
        } // end viewer?.viewer?.navigation
    } catch(e) {
        console.error("DOM update error:", e);
    }
    if (this.isDisposed) return;
    this.rulerAnimationFrame = requestAnimationFrame(this.domUpdateLoop);
  }

  drawRulers(cam: any, topRuler: HTMLCanvasElement | null, leftRuler: HTMLCanvasElement | null) {
      const dx = cam.eye.x - cam.center.x, dy = cam.eye.y - cam.center.y, dz = cam.eye.z - cam.center.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const fov = 45 * (Math.PI / 180);
      const canvasRect = this.container.getBoundingClientRect();
      if (canvasRect.height === 0) return;

      const visibleHeight = 2 * dist * Math.tan(fov / 2);
      const pixelsPerUnit = canvasRect.height / visibleHeight;
      const minTickDistancePx = 60;
      const unitsPerMajorTick = minTickDistancePx / pixelsPerUnit;
      if (unitsPerMajorTick <= 0 || !isFinite(unitsPerMajorTick)) return;

      const exp = Math.floor(Math.log10(unitsPerMajorTick));
      const mag = Math.pow(10, exp);
      const norm = unitsPerMajorTick / mag;
      let step = 1;
      if (norm > 5) step = 10; else if (norm > 2) step = 5; else if (norm > 1) step = 2;
      step *= mag;

      if (topRuler) this.renderRulerCanvas(topRuler, true, pixelsPerUnit, step);
      if (leftRuler) this.renderRulerCanvas(leftRuler, false, pixelsPerUnit, step);
  }

  renderRulerCanvas(canvas: HTMLCanvasElement, isHorizontal: boolean, pixelsPerUnit: number, step: number, scale = 1) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h); 
    ctx.fillStyle = this.theme === 'dark' ? '#333333' : '#fafafa'; 
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this.theme === 'dark' ? '#aaaaaa' : '#555555'; 
    ctx.strokeStyle = this.theme === 'dark' ? '#555555' : '#cccccc'; 
    ctx.lineWidth = Math.max(1, scale * 0.5);
    ctx.font = `${Math.round(10 * scale)}px sans-serif`; 
    ctx.textBaseline = 'top';

    const zeroPos = isHorizontal ? w / 2 : h / 2;
    const maxUnits = (isHorizontal ? w : h) / pixelsPerUnit / 2;
    const maxTicks = Math.ceil(maxUnits / step) * step;

    ctx.beginPath();
    if (isHorizontal) { ctx.moveTo(0, h); ctx.lineTo(w, h); } else { ctx.moveTo(w, 0); ctx.lineTo(w, h); }

    for(let i = -maxTicks; i <= maxTicks; i += step) {
        const pos = zeroPos + (i * pixelsPerUnit);
        const label = Math.abs(i).toString();
        if (isHorizontal) {
            ctx.moveTo(pos, h); ctx.lineTo(pos, h - 8 * scale); 
            ctx.textAlign = 'center'; ctx.fillText(label, pos, 4 * scale);
        } else {
            ctx.moveTo(w, pos); ctx.lineTo(w - 8 * scale, pos); 
            ctx.save(); ctx.translate(w - 12 * scale, pos);
            ctx.rotate(-Math.PI/2); ctx.textAlign = 'center'; ctx.fillText(label, 0, -4 * scale); ctx.restore();
        }
        const minorStep = step / 10, minorPx = minorStep * pixelsPerUnit;
        if (minorPx > 4 * scale) {
            for(let j = 1; j < 10; j++) {
                const mpos = zeroPos + ((i + j * minorStep) * pixelsPerUnit);
                const tickLen = (j === 5) ? 6 * scale : 3 * scale;
                if (isHorizontal) { ctx.moveTo(mpos, h); ctx.lineTo(mpos, h - tickLen); } 
                else { ctx.moveTo(w, mpos); ctx.lineTo(w - tickLen, mpos); }
            }
        }
    }
    ctx.stroke();
  }

  captureSnapshot(width: number, height: number, isTransparent: boolean): string | null {
      if (!this.viewer?.viewer?.renderer) return null;
      const v = this.viewer.viewer;
      const renderer = v.renderer;

      const oldWidth = this.container.clientWidth;
      const oldHeight = this.container.clientHeight;
      if (oldHeight === 0) return null;

      const oldAspect = v.camera.aspect;
      const oldLeft = v.camera.left;
      const oldRight = v.camera.right;
      const oldTop = v.camera.top;
      const oldBottom = v.camera.bottom;
      const oldClearAlpha = renderer.getClearAlpha();
      
      const defaultBg = this.theme === 'dark' ? { r: 20, g: 20, b: 20, a: 255 } : { r: 240, g: 240, b: 240, a: 255 };
      const bg = v.backgroundColor || defaultBg;
      const hexColor = (bg.r << 16) | (bg.g << 8) | bg.b;
      
      const targetAspect = width / height;

      if (v.camera.isOrthographicCamera || v.camera.type === 'OrthographicCamera') {
          const currentHeight = v.camera.top - v.camera.bottom;
          const centerH = (v.camera.top + v.camera.bottom) / 2;
          const centerW = (v.camera.right + v.camera.left) / 2;
          const halfH = currentHeight / 2;
          
          v.camera.top = centerH + halfH;
          v.camera.bottom = centerH - halfH;
          v.camera.left = centerW - (halfH * targetAspect);
          v.camera.right = centerW + (halfH * targetAspect);
      } else {
          v.camera.aspect = targetAspect;
      }
      
      v.camera.updateProjectionMatrix();
      renderer.setSize(width, height, false); 
      
      if (isTransparent) {
          renderer.setClearColor(0x000000, 0); 
      } else {
          renderer.setClearColor(hexColor, bg.a / 255);
      }
      
      // Temporarily hide only draft temporary indicator points from the snapshot rendering
      const hiddenObjects: any[] = [];
      this.planningPointMarkers.forEach(marker => {
          if (marker.visible) {
              marker.visible = false;
              hiddenObjects.push(marker);
          }
      });

      try {
          renderer.render(v.scene, v.camera);
      } catch(e) {
          console.error(e);
      } finally {
          // Restore visibility immediately after rendering
          hiddenObjects.forEach(obj => {
              obj.visible = true;
          });
      }

      const masterCanvas = document.createElement('canvas');
      masterCanvas.width = width;
      masterCanvas.height = height;
      const ctx = masterCanvas.getContext('2d');
      if (!ctx) return null;
      
      ctx.drawImage(renderer.domElement, 0, 0, width, height);

      // Draw measurement annotations onto the 2D canvas of the snapshot
      const scaleFactor = Math.max(1, height / oldHeight);
      
      const projectToTargetSize = (point: any, w: number, h: number, camera: any) => {
          if (!window.THREE) return null;
          const vector = point.clone();
          vector.project(camera);
          const x = (vector.x * 0.5 + 0.5) * w;
          const y = (-(vector.y * 0.5) + 0.5) * h;
          return { x, y, z: vector.z };
      };

      this.planningObjects.forEach(obj => {
          if ((obj.type === 'measurement' || obj.type === 'angle') && obj.visible !== false && obj.p2) {
              const proj = projectToTargetSize(obj.p2, width, height, v.camera);
              if (proj && proj.z < 1) {
                  let text = '';
                  let borderColor = '#10b981';
                  if (obj.type === 'angle') {
                      text = obj.name ? `${obj.name} (${obj.angle.toFixed(1)}°)` : `${obj.angle.toFixed(1)}°`;
                      borderColor = '#d97706';
                  } else {
                      text = obj.name ? `${obj.name} (${obj.baseDistance.toFixed(2)} mm)` : `${obj.baseDistance.toFixed(2)} mm`;
                  }
                  
                  ctx.save();
                  ctx.font = `bold ${Math.round(11 * scaleFactor)}px monospace`;
                  
                  // Calculate text metric measurements
                  const textMetrics = ctx.measureText(text);
                  const textWidth = textMetrics.width;
                  const textHeight = 11 * scaleFactor;
                  
                  const padX = 8 * scaleFactor;
                  const padY = 4 * scaleFactor;
                  
                  const pillW = textWidth + padX * 2;
                  const pillH = textHeight + padY * 2;
                  
                  const pillX = proj.x - pillW / 2;
                  const pillY = proj.y - 12 * scaleFactor - pillH / 2; // Draw slightly above
                  
                  // Draw capsule background pill
                  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; // Dark slate-900 background
                  ctx.strokeStyle = borderColor;
                  ctx.lineWidth = 1 * scaleFactor;
                  
                  ctx.beginPath();
                  const r = Math.min(pillW, pillH) / 2;
                  if (ctx.roundRect) {
                      ctx.roundRect(pillX, pillY, pillW, pillH, r);
                  } else {
                      ctx.rect(pillX, pillY, pillW, pillH);
                  }
                  ctx.fill();
                  ctx.stroke();
                  
                  // Center and paint text label
                  ctx.fillStyle = '#ffffff';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(text, proj.x, proj.y - 12 * scaleFactor);
                  ctx.restore();
              }
          } else if (obj.type === 'annotation' && obj.visible !== false) {
              let targetPos = null;
              if (obj.mesh && obj.mesh.position) {
                  targetPos = obj.mesh.position;
              } else if (obj.position) {
                  targetPos = new window.THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
              }
              if (targetPos) {
                  const proj = projectToTargetSize(targetPos, width, height, v.camera);
                  if (proj && proj.z < 1) {
                      const text = obj.text || obj.name || 'Annotation';
                      const borderColor = obj.color || '#0284c7';

                      const offsetX = (obj.cardOffset?.x || 0) * scaleFactor;
                      const offsetY = (obj.cardOffset?.y || 0) * scaleFactor;
                      const cardCenterX = proj.x + offsetX;
                      const cardCenterY = proj.y - 14 * scaleFactor + offsetY;

                      // Draw dashed leader line if card is offset from the pin
                      if (Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1) {
                          ctx.save();
                          ctx.strokeStyle = borderColor;
                          ctx.lineWidth = 1.5 * scaleFactor;
                          ctx.setLineDash([4 * scaleFactor, 3 * scaleFactor]);
                          ctx.beginPath();
                          ctx.moveTo(proj.x, proj.y);
                          ctx.lineTo(cardCenterX, cardCenterY);
                          ctx.stroke();
                          ctx.restore();
                      }
                      
                      ctx.save();
                      ctx.font = `bold ${Math.round(11 * scaleFactor)}px system-ui, sans-serif`;
                      
                      const textMetrics = ctx.measureText(text);
                      const textWidth = textMetrics.width;
                      const textHeight = 11 * scaleFactor;
                      
                      const padX = 8 * scaleFactor;
                      const padY = 4 * scaleFactor;
                      
                      const pillW = textWidth + padX * 2;
                      const pillH = textHeight + padY * 2;
                      
                      const pillX = cardCenterX - pillW / 2;
                      const pillY = cardCenterY - pillH / 2;
                      
                      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                      ctx.strokeStyle = borderColor;
                      ctx.lineWidth = 1 * scaleFactor;
                      
                      ctx.beginPath();
                      const r = Math.min(pillW, pillH) / 2;
                      if (ctx.roundRect) {
                          ctx.roundRect(pillX, pillY, pillW, pillH, r);
                      } else {
                          ctx.rect(pillX, pillY, pillW, pillH);
                      }
                      ctx.fill();
                      ctx.stroke();
                      
                      ctx.fillStyle = '#ffffff';
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillText(text, cardCenterX, cardCenterY);
                      ctx.restore();
                  }
              }
          }
      });

      // Draw Rulers if active
      if (this.rulersVisible) {
          const scaleFactor = Math.max(1, height / oldHeight);
          const rulerThickness = Math.round(24 * scaleFactor);
          
          try {
              const cam = v.navigation.GetCamera();
              if (cam && cam.eye && cam.center) {
                  const dx = cam.eye.x - cam.center.x, dy = cam.eye.y - cam.center.y, dz = cam.eye.z - cam.center.z;
                  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                  const fov = 45 * (Math.PI / 180);

                  const visibleHeight = 2 * dist * Math.tan(fov / 2);
                  const pixelsPerUnit = height / visibleHeight;
                  const minTickDistancePx = 60 * scaleFactor;
                  const unitsPerMajorTick = minTickDistancePx / pixelsPerUnit;
                  
                  if (unitsPerMajorTick > 0 && isFinite(unitsPerMajorTick)) {
                      const exp = Math.floor(Math.log10(unitsPerMajorTick));
                      const mag = Math.pow(10, exp);
                      const norm = unitsPerMajorTick / mag;
                      let step = 1;
                      if (norm > 5) step = 10; else if (norm > 2) step = 5; else if (norm > 1) step = 2;
                      step *= mag;

                      const topCanvas = document.createElement('canvas');
                      topCanvas.width = width - rulerThickness;
                      topCanvas.height = rulerThickness;
                      
                      const leftCanvas = document.createElement('canvas');
                      leftCanvas.width = rulerThickness;
                      leftCanvas.height = height - rulerThickness;

                      this.renderRulerCanvas(topCanvas, true, pixelsPerUnit, step, scaleFactor);
                      this.renderRulerCanvas(leftCanvas, false, pixelsPerUnit, step, scaleFactor);
                      
                      ctx.fillStyle = this.theme === 'dark' ? '#333333' : '#fafafa';
                      ctx.fillRect(0, 0, rulerThickness, rulerThickness);
                      ctx.strokeStyle = this.theme === 'dark' ? '#555555' : '#e0e0e0';
                      ctx.lineWidth = 1 * scaleFactor;
                      ctx.strokeRect(0, 0, rulerThickness, rulerThickness);
                      ctx.fillStyle = this.theme === 'dark' ? '#aaaaaa' : '#888888';
                      ctx.font = `bold ${Math.round(9 * scaleFactor)}px sans-serif`;
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillText('mm', rulerThickness / 2, rulerThickness / 2);
                      
                      ctx.drawImage(topCanvas, rulerThickness, 0);
                      ctx.drawImage(leftCanvas, 0, rulerThickness);
                  }
              }
          } catch(e) {}
      }
      
      const dataUrl = masterCanvas.toDataURL('image/png');
      
      // Restore
      if (v.camera.isOrthographicCamera || v.camera.type === 'OrthographicCamera') {
          v.camera.left = oldLeft;
          v.camera.right = oldRight;
          v.camera.top = oldTop;
          v.camera.bottom = oldBottom;
      } else {
          v.camera.aspect = oldAspect;
      }
      v.camera.updateProjectionMatrix();
      renderer.setSize(oldWidth, oldHeight, false);
      renderer.setClearColor(hexColor, oldClearAlpha);
      
      try { v.Render(); } catch(e) {}
      return dataUrl;
  }

  capture360Snapshots(width: number, height: number, isTransparent: boolean): { angle: number; dataUrl: string }[] {
      if (!this.viewer?.viewer?.navigation) return [];
      
      const v = this.viewer.viewer;
      const nav = v.navigation;
      
      let originalCam: any = null;
      if (typeof nav.GetCamera === 'function') {
          originalCam = nav.GetCamera();
      } else if (nav.camera) {
          const threeCam = nav.camera;
          originalCam = new window.OV.Camera(
              new window.OV.Coord3D(threeCam.position.x, threeCam.position.y, threeCam.position.z),
              new window.OV.Coord3D(nav.controls?.target?.x || 0, nav.controls?.target?.y || 0, nav.controls?.target?.z || 0),
              new window.OV.Coord3D(threeCam.up.x, threeCam.up.y, threeCam.up.z),
              threeCam.fov || 45.0
          );
      }
      
      if (!originalCam) return [];

      const results: { angle: number; dataUrl: string }[] = [];
      const eye = originalCam.eye;
      const center = originalCam.center;
      const up = originalCam.up;
      const fov = originalCam.fov || 45.0;

      if (!window.THREE) return [];

      try {
          for (let i = 0; i < 6; i++) {
              const angleDeg = i * 60;
              const angleRad = (angleDeg * Math.PI) / 180;

              // Calculate camera eye position rotated by angleRad around current up vector
              const offset = new window.THREE.Vector3(eye.x - center.x, eye.y - center.y, eye.z - center.z);
              const upVec = new window.THREE.Vector3(up.x, up.y, up.z).normalize();
              offset.applyAxisAngle(upVec, angleRad);

              const newEye = new window.THREE.Vector3(center.x, center.y, center.z).add(offset);

              const tempCam = new window.OV.Camera(
                  new window.OV.Coord3D(newEye.x, newEye.y, newEye.z),
                  new window.OV.Coord3D(center.x, center.y, center.z),
                  new window.OV.Coord3D(up.x, up.y, up.z),
                  fov
              );

              nav.SetCamera(tempCam);
              v.Render();

              const dataUrl = this.captureSnapshot(width, height, isTransparent);
              if (dataUrl) {
                  results.push({ angle: angleDeg, dataUrl });
              }
          }
      } catch (err) {
          console.error("Failed during 360 snapshots rotation", err);
      } finally {
          // Restore original camera orientation
          try {
              const eyeRestore = new window.OV.Coord3D(eye.x, eye.y, eye.z);
              const centerRestore = new window.OV.Coord3D(center.x, center.y, center.z);
              const upRestore = new window.OV.Coord3D(up.x, up.y, up.z);
              nav.SetCamera(new window.OV.Camera(eyeRestore, centerRestore, upRestore, fov));
              v.Render();
          } catch(e) {
              console.warn("Could not restore camera state:", e);
          }
      }

      return results;
  }
}
