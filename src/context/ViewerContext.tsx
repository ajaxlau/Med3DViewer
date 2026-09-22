import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { ViewerManager, FlyThroughState, SplineClippingState } from '../lib/ViewerManager';

export interface MeshInfo {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
}

interface ViewerContextState {
  viewerManager: ViewerManager | null;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  status: string;
  loadingProgress: number;
  isEmpty: boolean;
  meshes: MeshInfo[];
  filename: string | null;
  loadedUrl: string | null;
  
  globalOpacity: number;
  setGlobalOpacity: (op: number) => void;
  
  isClipping: boolean;
  setIsClipping: (val: boolean) => void;
  clipPlanes: Record<'x'|'y'|'z', { active: boolean, invert: boolean, sliderVal: number, alignToCamera?: boolean }>;
  updateClipPlane: (axis: 'x'|'y'|'z', updates: Partial<{ active: boolean, invert: boolean, sliderVal: number, alignToCamera?: boolean }>) => void;
  
  isGhostingMode: boolean;
  setIsGhostingMode: (val: boolean) => void;
  
  explodeValue: number;
  setExplodeValue: (val: number) => void;
  
  toggleMeshVisibility: (id: number) => void;
  toggleAllMeshesVisibility: () => void;
  invertMeshesVisibility: () => void;
  setMeshOpacity: (id: number, opacity: number) => void;
  highlightMesh: (id: number | null) => void;
  highlightedMeshId: number | null;
  
  rulersVisible: boolean;
  toggleRulers: () => void;
  
  gpuTier: 'webgpu' | 'webgl2' | 'unsupported';
  isContextLost: boolean;
  
  isAutoRotating: boolean;
  setIsAutoRotating: (val: boolean) => void;
  // Modals state
  activeModal: 'url' | 'share' | 'snapshot' | 'planning' | 'reset' | 'large-model-guide' | 'gpu-status' | 'info' | null;
  setActiveModal: (modal: 'url' | 'share' | 'snapshot' | 'planning' | 'reset' | 'large-model-guide' | 'gpu-status' | 'info' | null) => void;
  resetWorkspace: () => void;

  // Planning Tools
  planningMode: 'none' | 'plane' | 'cylinder' | 'measure' | 'curve' | 'angle' | 'point' | 'annotation';
  setPlanningMode: (mode: 'none' | 'plane' | 'cylinder' | 'measure' | 'curve' | 'angle' | 'point' | 'annotation') => void;
  resnappingAnnotationId: string | null;
  setResnappingAnnotationId: (id: string | null) => void;
  planningObjects: any[];
  setPlanningObjects: (objects: any[]) => void;
  planningGroups: any[];
  setPlanningGroups: (groups: any[]) => void;
  planningPointsPicked: number;
  measurement: { distance: number, angle: number } | null;

  // Curved Anatomical Fly-Through
  flyThroughState: FlyThroughState;
  startFlyThrough: (curveId?: string, autoPlay?: boolean) => boolean;
  pauseFlyThrough: () => void;
  resumeFlyThrough: () => void;
  stopFlyThrough: () => void;
  setFlyThroughProgress: (progress: number) => void;
  stepFlyThroughDistance: (deltaMm?: number) => void;
  setFlyThroughSpeed: (speed: number) => void;
  setFlyThroughDirection: (dir: 1 | -1) => void;
  setFlyThroughLoop: (loop: boolean) => void;
  setFlyThroughFov: (fov: number) => void;
  setFlyThroughReticle: (show: boolean) => void;
  setFlyThroughLookTrim: (yaw: number, pitch: number) => void;
  setFlyThroughPathOffset: (offsetX: number, offsetY: number) => void;
  generateSampleAnatomicalCurve: (meshId?: number | null) => string | null;

  splineClippingState: SplineClippingState;
  startSplineClipping: (curveId?: string) => boolean;
  stopSplineClipping: () => void;
  setSplineClippingProgress: (progress: number) => void;
  setSplineClippingDistance: (distMm: number) => void;
  stepSplineClippingDistance: (deltaMm?: number) => void;
  setSplineClippingInvert: (invert: boolean) => void;
  setSplineClippingAlignCamera: (align: boolean) => void;
  zoomSplineCrossSection: (action: 'in' | 'out' | number) => void;
  setSplineClippingZoomLevel: (level: number) => void;

  backgroundImage: string | null;
  setBackgroundImage: (url: string | null) => void;
  backgroundOpacity: number;
  setBackgroundOpacity: (opacity: number) => void;

  isTransformActive: boolean;
  transformMode: 'translate' | 'rotate' | 'scale';
  activeTransformObjectId: string | null;

  setContainerRef: (ref: HTMLElement | null) => void;
  setRulerRefs: (topRef?: HTMLCanvasElement | null, leftRef?: HTMLCanvasElement | null) => void;
}

const ViewerContext = createContext<ViewerContextState | null>(null);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [viewerManager, setViewerManager] = useState<ViewerManager | null>(null);
  const [theme, setThemeState] = useState<'light'|'dark'>('light');
  const [status, setStatus] = useState<string>('No model loaded.\nPlease open a file.');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isEmpty, setIsEmpty] = useState(true);
  const [meshes, setMeshes] = useState<MeshInfo[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  
  const [globalOpacity, setGlobalOpacityState] = useState(1);
  const [isClipping, setIsClippingState] = useState(false);
  const [clipPlanes, setClipPlanes] = useState<Record<'x'|'y'|'z', { active: boolean, invert: boolean, sliderVal: number, alignToCamera?: boolean }>>({
    x: { active: true, invert: false, sliderVal: 50, alignToCamera: false },
    y: { active: false, invert: false, sliderVal: 50, alignToCamera: false },
    z: { active: false, invert: false, sliderVal: 50, alignToCamera: false }
  });
  const [explodeValue, setExplodeValueState] = useState(0);
  const [highlightedMeshId, setHighlightedMeshId] = useState<number | null>(null);
  const [isGhostingMode, setIsGhostingModeState] = useState(false);
  const [rulersVisible, setRulersVisible] = useState(false);
  const [gpuTier, setGpuTier] = useState<'webgpu' | 'webgl2' | 'unsupported'>('webgl2');
  const [isContextLost, setIsContextLost] = useState<boolean>(false);
  const [isAutoRotating, setIsAutoRotatingState] = useState(false);
  
  const [activeModal, setActiveModal] = useState<ViewerContextState['activeModal']>(null);
  
  // Planning Tools state
  const [planningMode, setPlanningModeState] = useState<'none' | 'plane' | 'cylinder' | 'measure' | 'curve' | 'angle' | 'point' | 'annotation'>('none');
  const [resnappingAnnotationId, setResnappingAnnotationIdState] = useState<string | null>(null);
  const [planningObjects, setPlanningObjects] = useState<any[]>([]);
  const [planningGroups, setPlanningGroups] = useState<any[]>([]);
  const [planningPointsPicked, setPlanningPointsPicked] = useState(0);
  const [measurement, setMeasurement] = useState<{ distance: number, angle: number } | null>(null);

  const [backgroundImage, setBackgroundImageState] = useState<string | null>(null);
  const [backgroundOpacity, setBackgroundOpacity] = useState<number>(0.5);

  const setBackgroundImage = (url: string | null) => {
    setBackgroundImageState((prev) => {
      if (prev && prev.startsWith('blob:') && prev !== url) {
        try { URL.revokeObjectURL(prev); } catch (e) {}
      }
      return url;
    });
  };

  useEffect(() => {
    return () => {
      if (backgroundImage && backgroundImage.startsWith('blob:')) {
        try { URL.revokeObjectURL(backgroundImage); } catch (e) {}
      }
    };
  }, [backgroundImage]);

  const [isTransformActive, setIsTransformActive] = useState(false);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [activeTransformObjectId, setActiveTransformObjectId] = useState<string | null>(null);

  // Curved Anatomical Fly-Through State
  const [flyThroughState, setFlyThroughState] = useState<FlyThroughState>({
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
  });

  const [splineClippingState, setSplineClippingState] = useState<SplineClippingState>({
    active: false,
    curveId: null,
    curveName: null,
    progress: 0.5,
    totalDistance: 0,
    currentDistance: 0,
    invert: false,
    alignCamera: false,
    zoomLevel: 1.0
  });

  const startSplineClipping = (curveId?: string) => {
    if (!viewerManager) return false;
    const res = viewerManager.startSplineClipping(curveId);
    if (res) {
      setSplineClippingState({ ...viewerManager.splineClippingState });
    }
    return res;
  };

  const stopSplineClipping = () => {
    if (viewerManager) {
      viewerManager.stopSplineClipping();
      setSplineClippingState({ ...viewerManager.splineClippingState });
    }
  };

  const setSplineClippingProgress = (prog: number) => {
    if (viewerManager) {
      viewerManager.setSplineClippingProgress(prog);
      setSplineClippingState({ ...viewerManager.splineClippingState });
    }
  };

  const setSplineClippingDistance = (distMm: number) => {
    if (viewerManager) {
      viewerManager.setSplineClippingDistance(distMm);
      setSplineClippingState({ ...viewerManager.splineClippingState });
    }
  };

  const stepSplineClippingDistance = (deltaMm: number = 0.6) => {
    if (viewerManager) {
      viewerManager.stepSplineClippingDistance(deltaMm);
      setSplineClippingState({ ...viewerManager.splineClippingState });
    }
  };

  const setSplineClippingInvert = (invert: boolean) => {
    if (viewerManager) {
      viewerManager.setSplineClippingInvert(invert);
      setSplineClippingState({ ...viewerManager.splineClippingState });
    }
  };

  const setSplineClippingAlignCamera = (align: boolean) => {
    if (viewerManager) {
      viewerManager.setSplineClippingAlignCamera(align);
      setSplineClippingState({ ...viewerManager.splineClippingState });
    }
  };

  const zoomSplineCrossSection = (action: 'in' | 'out' | number) => {
    if (viewerManager) {
      viewerManager.zoomSplineCrossSection(action);
      setSplineClippingState({ ...viewerManager.splineClippingState });
    }
  };

  const setSplineClippingZoomLevel = (level: number) => {
    if (viewerManager) {
      viewerManager.setSplineClippingZoomLevel(level);
      setSplineClippingState({ ...viewerManager.splineClippingState });
    }
  };

  const startFlyThrough = (curveId?: string, autoPlay: boolean = false) => {
    if (!viewerManager) return false;
    const res = viewerManager.startFlyThrough(curveId, autoPlay);
    if (res) {
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
    return res;
  };

  const pauseFlyThrough = () => {
    if (viewerManager) {
      viewerManager.pauseFlyThrough();
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const resumeFlyThrough = () => {
    if (viewerManager) {
      viewerManager.resumeFlyThrough();
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const stopFlyThrough = () => {
    if (viewerManager) {
      viewerManager.stopFlyThrough();
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const setFlyThroughProgress = (prog: number) => {
    if (viewerManager) {
      viewerManager.setFlyThroughProgress(prog);
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const stepFlyThroughDistance = (deltaMm: number = 0.6) => {
    if (viewerManager) {
      viewerManager.stepFlyThroughDistance(deltaMm);
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const setFlyThroughSpeed = (speed: number) => {
    if (viewerManager) {
      viewerManager.setFlyThroughSpeed(speed);
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const setFlyThroughDirection = (dir: 1 | -1) => {
    if (viewerManager) {
      viewerManager.setFlyThroughDirection(dir);
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const setFlyThroughLoop = (loop: boolean) => {
    if (viewerManager) {
      viewerManager.setFlyThroughLoop(loop);
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const setFlyThroughFov = (fov: number) => {
    if (viewerManager) {
      viewerManager.setFlyThroughFov(fov);
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const setFlyThroughReticle = (show: boolean) => {
    if (viewerManager) {
      viewerManager.setFlyThroughReticle(show);
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const setFlyThroughLookTrim = (yaw: number, pitch: number) => {
    if (viewerManager) {
      viewerManager.setFlyThroughLookTrim(yaw, pitch);
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const setFlyThroughPathOffset = (offsetX: number, offsetY: number) => {
    if (viewerManager) {
      viewerManager.setFlyThroughPathOffset(offsetX, offsetY);
      setFlyThroughState({ ...viewerManager.flyThroughState });
    }
  };

  const generateSampleAnatomicalCurve = (meshId?: number | null) => {
    if (!viewerManager) return null;
    return viewerManager.generateSampleAnatomicalCurve(meshId);
  };

  const setPlanningMode = (mode: 'none' | 'plane' | 'cylinder' | 'measure' | 'curve' | 'angle' | 'point' | 'annotation') => {
    setPlanningModeState(mode);
    if (viewerManager) {
      viewerManager.setPlanningMode(mode);
    }
  };

  const setResnappingAnnotationId = (id: string | null) => {
    setResnappingAnnotationIdState(id);
    if (viewerManager) {
      viewerManager.resnappingAnnotationId = id;
    }
  };

  const containerRef = useRef<HTMLElement | null>(null);
  const topRulerRef = useRef<HTMLCanvasElement | null>(null);
  const leftRulerRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Check initial dark mode from OS or classes
    const isDark = document.documentElement.classList.contains('dark') || 
                  (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (viewerManager) {
        viewerManager.dispose();
      }
    };
  }, [viewerManager]);

  useEffect(() => {
    if (viewerManager) {
      viewerManager.setTheme(theme, backgroundImage !== null);
    }
  }, [backgroundImage, theme, viewerManager]);

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    if (newTheme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    
    if (viewerManager) {
      viewerManager.setTheme(newTheme, backgroundImage !== null);
    }
  };

  const initManagerIfReady = () => {
    if (containerRef.current && !viewerManager) {
      const manager = new ViewerManager(containerRef.current, {
        onStatusChange: (newStatus, empty, name, url) => {
          setStatus(newStatus);
          setIsEmpty(empty);
          if (name !== undefined) setFilename(name);
          if (url !== undefined) setLoadedUrl(url);
        },
        onProgressChange: (p) => setLoadingProgress(p),
        onMeshesChange: (newMeshes) => setMeshes(newMeshes),
        onMeshHighlighted: (id) => setHighlightedMeshId(id),
        onPlanningObjectsChange: (objects) => setPlanningObjects([...objects]),
        onPlanningGroupsChange: (groups) => setPlanningGroups([...groups]),
        onPlanningPointsChange: (count) => setPlanningPointsPicked(count),
        onMeasurementChange: (m) => setMeasurement(m),
        onTransformActiveChange: (active, objId) => {
           setIsTransformActive(active);
           setActiveTransformObjectId(active ? (objId || null) : null);
        },
        onTransformModeChange: (mode) => setTransformMode(mode as any),
        onPlanningModeChange: (mode, resnapId) => {
          setPlanningModeState(mode as any);
          setResnappingAnnotationIdState(resnapId || null);
        },
        onFlyThroughStateChange: (state) => setFlyThroughState({ ...state }),
        onSplineClippingStateChange: (state) => setSplineClippingState({ ...state }),
        onGpuTierChange: (tier) => setGpuTier(tier),
        onContextLostChange: (lost) => setIsContextLost(lost)
      });
      const isDark = document.documentElement.classList.contains('dark') || 
                    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      manager.setTheme(isDark ? 'dark' : 'light', backgroundImage !== null);
      if (topRulerRef.current && leftRulerRef.current) {
        manager.setRulerCanvases(topRulerRef.current, leftRulerRef.current);
      }
      setViewerManager(manager);
      (window as any)._viewerManagerInstance = manager;
      
      // Delay resize to ensure the layout has fully resolved
      setTimeout(() => {
        if (manager && manager.viewer) {
          manager.viewer.Resize();
        }
      }, 50);
    }
  };

  const setContainerRef = (ref: HTMLElement | null) => {
    containerRef.current = ref;
    initManagerIfReady();
  };

  const setRulerRefs = (topRef?: HTMLCanvasElement | null, leftRef?: HTMLCanvasElement | null) => {
    if (topRef !== undefined) topRulerRef.current = topRef;
    if (leftRef !== undefined) leftRulerRef.current = leftRef;
    if (viewerManager && topRulerRef.current && leftRulerRef.current) {
      viewerManager.setRulerCanvases(topRulerRef.current, leftRulerRef.current);
    }
  };

  const setGlobalOpacity = (val: number) => {
    setGlobalOpacityState(val);
    if (viewerManager) viewerManager.setGlobalOpacity(val);
    setMeshes(prev => prev.map(m => ({ ...m, opacity: val })));
  };

  const setIsClipping = (val: boolean) => {
    setIsClippingState(val);
    if (viewerManager) viewerManager.setClippingActive(val, clipPlanes);
  };

  const updateClipPlane = (axis: 'x'|'y'|'z', updates: Partial<{ active: boolean, invert: boolean, sliderVal: number, alignToCamera?: boolean }>) => {
    setClipPlanes(prev => {
      let newPlanes = { ...prev, [axis]: { ...prev[axis], ...updates } };
      // If an axis enables alignToCamera, ensure that axis is active, and deactivate & reset alignToCamera on other axes
      if (updates.alignToCamera === true) {
        newPlanes[axis].active = true;
        (['x', 'y', 'z'] as const).forEach(otherAxis => {
          if (otherAxis !== axis) {
            newPlanes[otherAxis] = {
              ...newPlanes[otherAxis],
              active: false,
              alignToCamera: false
            };
          }
        });
      }
      if (viewerManager && isClipping) viewerManager.updateClippingPlanes(newPlanes);
      return newPlanes;
    });
  };

  const setExplodeValue = (val: number) => {
    setExplodeValueState(val);
    if (viewerManager) viewerManager.setExplode(val);
  };

  const setIsAutoRotating = (val: boolean) => {
    setIsAutoRotatingState(val);
    if (viewerManager) {
        viewerManager.setAutoRotate(val);
    }
  };

  const toggleMeshVisibility = (id: number) => {
    if (viewerManager) viewerManager.toggleMeshVisibility(id);
    setMeshes(prev => prev.map(m => m.id === id ? { ...m, visible: !m.visible } : m));
  };

  const toggleAllMeshesVisibility = () => {
    if (meshes.length === 0) return;
    const allVisible = meshes.every(m => m.visible !== false);
    const newVisible = !allVisible;
    if (viewerManager) viewerManager.setAllMeshesVisibility(newVisible);
    setMeshes(prev => prev.map(m => ({ ...m, visible: newVisible })));
  };

  const invertMeshesVisibility = () => {
    if (meshes.length === 0) return;
    if (viewerManager) viewerManager.invertMeshesVisibility();
    setMeshes(prev => prev.map(m => ({ ...m, visible: !(m.visible !== false) })));
  };

  const setMeshOpacity = (id: number, opacity: number) => {
    if (viewerManager) viewerManager.setMeshOpacity(id, opacity);
    setMeshes(prev => prev.map(m => m.id === id ? { ...m, opacity } : m));
  };

  const highlightMesh = (id: number | null) => {
    if (viewerManager) viewerManager.highlightMesh(id);
    setHighlightedMeshId(id);
  };

  const toggleRulers = () => {
    const val = !rulersVisible;
    setRulersVisible(val);
    if (viewerManager) viewerManager.setRulersVisible(val);
  };

  const setIsGhostingMode = (val: boolean) => {
    setIsGhostingModeState(val);
    if (viewerManager) viewerManager.setGhostingMode(val);
  };

  const resetWorkspace = () => {
    if (viewerManager) {
      viewerManager.resetWorkspace();
    }
    setStatus('No model loaded.\nPlease open a file.');
    setLoadingProgress(0);
    setIsEmpty(true);
    setMeshes([]);
    setFilename(null);
    setLoadedUrl(null);
    setGlobalOpacityState(1);
    setIsClippingState(false);
    setClipPlanes({
      x: { active: true, invert: false, sliderVal: 50 },
      y: { active: false, invert: false, sliderVal: 50 },
      z: { active: false, invert: false, sliderVal: 50 }
    });
    setExplodeValueState(0);
    setHighlightedMeshId(null);
    setIsGhostingModeState(false);
    setIsAutoRotatingState(false);
    setRulersVisible(false);
    setActiveModal(null);
    setPlanningModeState('none');
    setPlanningObjects([]);
    setPlanningGroups([]);
    setPlanningPointsPicked(0);
    setMeasurement(null);
    setBackgroundImage(null);
    setIsTransformActive(false);
    setActiveTransformObjectId(null);
    setFlyThroughState({
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
    });
    setSplineClippingState({
      active: false,
      curveId: null,
      curveName: null,
      progress: 0.5,
      totalDistance: 0,
      currentDistance: 0,
      invert: false,
      alignCamera: false,
      zoomLevel: 1.0
    });
  };

  return (
    <ViewerContext.Provider value={{
      viewerManager, theme, setTheme, status, loadingProgress, isEmpty, meshes, filename, loadedUrl,
      globalOpacity, setGlobalOpacity, isClipping, setIsClipping,
      clipPlanes, updateClipPlane,
      isGhostingMode, setIsGhostingMode,
      explodeValue, setExplodeValue,
      toggleMeshVisibility, toggleAllMeshesVisibility, invertMeshesVisibility, setMeshOpacity, highlightMesh, highlightedMeshId,
      rulersVisible, toggleRulers, gpuTier, isContextLost, isAutoRotating, setIsAutoRotating, activeModal, setActiveModal,
      resetWorkspace,
      planningMode, setPlanningMode, resnappingAnnotationId, setResnappingAnnotationId, planningObjects, setPlanningObjects, planningPointsPicked,
      planningGroups, setPlanningGroups,
      measurement,
      flyThroughState, startFlyThrough, pauseFlyThrough, resumeFlyThrough, stopFlyThrough,
      setFlyThroughProgress, stepFlyThroughDistance, setFlyThroughSpeed, setFlyThroughDirection, setFlyThroughLoop,
      setFlyThroughFov, setFlyThroughReticle, setFlyThroughLookTrim, setFlyThroughPathOffset, generateSampleAnatomicalCurve,
      splineClippingState, startSplineClipping, stopSplineClipping,
      setSplineClippingProgress, setSplineClippingDistance, stepSplineClippingDistance,
      setSplineClippingInvert,
      setSplineClippingAlignCamera, zoomSplineCrossSection, setSplineClippingZoomLevel,
      backgroundImage, setBackgroundImage, backgroundOpacity, setBackgroundOpacity,
      isTransformActive, transformMode, activeTransformObjectId,
      setContainerRef, setRulerRefs
    }}>
      {children}
    </ViewerContext.Provider>
  );
}

export const useViewer = () => {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error('useViewer must be used within a ViewerProvider');
  return ctx;
};
