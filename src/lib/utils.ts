/**
 * Utility functions for 3DViewerPlus
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
 * to prevent GPU VRAM and memory leaks.
 */
export function disposeHierarchy(object: any): void {
  if (!object) return;
  
  if (typeof object.traverse === 'function') {
    object.traverse((child: any) => {
      // Dispose Geometry
      if (child.geometry && typeof child.geometry.dispose === 'function') {
        try {
          child.geometry.dispose();
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
