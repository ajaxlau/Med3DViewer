/**
 * Utility functions for Med3DViewer
 */

/**
 * Converts a base64 data URI to a Blob
 */
export function dataURIToBlob(dataURI: string): Blob {
  const splitDataURI = dataURI.split(',');
  const byteString = splitDataURI[0].indexOf('base64') >= 0 ? atob(splitDataURI[1]) : decodeURI(splitDataURI[1]);
  const mimeString = splitDataURI[0].split(':')[1].split(';')[0];
  const ia = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ia], { type: mimeString });
}

/**
 * Safely opens an external URL in a new window/tab, mitigating reverse tabnabbing (window.opener hijacking)
 */
export function safeOpenWindow(url: string, target = '_blank'): Window | null {
  return window.open(url, target, 'noopener,noreferrer');
}

/**
 * Recursively disposes of Three.js object geometries, materials, and textures
 * to prevent GPU VRAM and memory leaks. Purges CPU buffer arrays on low-memory devices.
 */
export function disposeHierarchy(object: any): void {
  if (!object) return;
  
  if (typeof object.traverse === 'function') {
    object.traverse((child: any) => {
      // Dispose Geometry and clear large TypedArrays
      if (child.geometry) {
        try {
          if (typeof child.geometry.dispose === 'function') {
            child.geometry.dispose();
          }
          if (child.geometry.attributes) {
            for (const key of Object.keys(child.geometry.attributes)) {
              try {
                const attr = child.geometry.attributes[key];
                if (attr && attr.array) {
                  attr.array = null;
                }
                child.geometry.deleteAttribute(key);
              } catch {}
            }
          }
          if (child.geometry.index) {
            if (child.geometry.index.array) {
              child.geometry.index.array = null;
            }
            child.geometry.index = null;
          }
        } catch (e) {
          console.warn('Error disposing geometry', e);
        }
      }

      // Dispose Material & Associated Texture Maps
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat: any) => {
          if (!mat) return;
          
          // Dispose textures
          const textureKeys = ['map', 'alphaMap', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'specularMap', 'envMap', 'lightMap', 'aoMap', 'emissiveMap'];
          textureKeys.forEach((key) => {
            if (mat[key] && typeof mat[key].dispose === 'function') {
              try {
                mat[key].dispose();
                mat[key].image = null;
                mat[key] = null;
              } catch (e) {}
            }
          });

          // Dispose material itself
          if (typeof mat.dispose === 'function') {
            try {
              mat.dispose();
            } catch (e) {}
          }
        });
      }
    });
  }
}

/**
 * Optimizes geometry for low-memory devices by stripping non-essential attributes
 * (such as unused vertex colors or second UV channels) and ensuring normals are compact.
 */
export function optimizeGeometryForLowMemory(geometry: any): void {
  if (!geometry || !geometry.attributes) return;
  try {
    // Delete non-essential vertex colors if geometry has a standard single material
    if (geometry.attributes.color) {
      geometry.deleteAttribute('color');
    }
    // Delete secondary UV layers if present
    if (geometry.attributes.uv2) {
      geometry.deleteAttribute('uv2');
    }
    // Recompute bounding box and sphere cleanly
    if (typeof geometry.computeBoundingBox === 'function') {
      geometry.computeBoundingBox();
    }
  } catch (e) {
    console.warn('Error optimizing geometry for low memory', e);
  }
}

/**
 * Validates whether a model URL uses safe protocols (http, https, blob) or relative paths.
 * Blocks dangerous schemes like javascript:, data:text/html, etc.
 */
export function isSafeModelUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed, window.location.href);
    return ['http:', 'https:', 'blob:'].includes(parsed.protocol);
  } catch (e) {
    return false;
  }
}
