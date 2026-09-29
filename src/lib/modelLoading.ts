import type { GpuCapabilities } from './gpuDetection';

export type ModelLoadPhase =
  | 'idle'
  | 'validating'
  | 'downloading'
  | 'parsing'
  | 'ready'
  | 'cancelled'
  | 'failed';

export type ModelLoadErrorCode =
  | 'URL_INVALID'
  | 'URL_INSECURE'
  | 'NETWORK_OFFLINE'
  | 'NETWORK_TIMEOUT'
  | 'HTTP_ERROR'
  | 'CORS_BLOCKED'
  | 'SIZE_LIMIT'
  | 'FORMAT_UNSUPPORTED'
  | 'FORMAT_MISMATCH'
  | 'COMPANION_MISSING'
  | 'PARSE_FAILED'
  | 'CANCELLED';

export interface ModelLoadState {
  requestId: string | null;
  phase: ModelLoadPhase;
  source: 'local' | 'remote' | null;
  filename: string | null;
  bytesReceived: number;
  bytesTotal: number | null;
  progress: number;
  cancellable: boolean;
  safeMode: boolean;
  warning: string | null;
  error: { code: ModelLoadErrorCode; message: string; workaround?: string } | null;
}

export interface DeviceLoadProfile {
  name: 'standard' | 'conservative' | 'mobile-safe' | 'legacy';
  softLimitBytes: number;
  hardLimitBytes: number;
  pixelRatioCap: number;
  pollIntervalMs: number;
  maxWaitMs: number;
}

const MB = 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set([
  'stl', 'obj', 'mtl', '3dm', 'gltf', 'glb', 'step', 'stp', 'ply', '3ds',
  'fbx', 'dae', 'iges', 'igs', 'off', 'dxf', '3mf', 'zip', 'bin', 'jpg',
  'jpeg', 'png', 'webp', 'bmp', 'tga'
]);
const PRIMARY_EXTENSIONS = new Set([
  'stl', 'obj', '3dm', 'gltf', 'glb', 'step', 'stp', 'ply', '3ds', 'fbx',
  'dae', 'iges', 'igs', 'off', 'dxf', '3mf', 'zip'
]);

export class ModelLoadException extends Error {
  constructor(
    public code: ModelLoadErrorCode,
    message: string,
    public workaround?: string
  ) {
    super(message);
    this.name = 'ModelLoadException';
  }
}

export function createIdleLoadState(safeMode = false): ModelLoadState {
  return {
    requestId: null, phase: 'idle', source: null, filename: null,
    bytesReceived: 0, bytesTotal: null, progress: 0, cancellable: false,
    safeMode, warning: null, error: null
  };
}

export function getFileExtension(name: string): string {
  const clean = name.split(/[?#]/, 1)[0];
  const dot = clean.lastIndexOf('.');
  return dot < 0 ? '' : clean.slice(dot + 1).toLowerCase();
}

export function getDeviceLoadProfile(capabilities: GpuCapabilities | null, forceSafeMode = false): DeviceLoadProfile {
  if (forceSafeMode || capabilities?.isMobileDevice) {
    return { name: 'mobile-safe', softLimitBytes: 50 * MB, hardLimitBytes: 150 * MB, pixelRatioCap: 1, pollIntervalMs: 800, maxWaitMs: 180_000 };
  }
  if (!capabilities || capabilities.tier === 'unsupported' || capabilities.architecture === 'Legacy WebGL') {
    return { name: 'legacy', softLimitBytes: 25 * MB, hardLimitBytes: 75 * MB, pixelRatioCap: 0.75, pollIntervalMs: 1000, maxWaitMs: 180_000 };
  }
  if (capabilities.isLowMemoryDevice || capabilities.isFallback) {
    return { name: 'conservative', softLimitBytes: 120 * MB, hardLimitBytes: 300 * MB, pixelRatioCap: 1, pollIntervalMs: 700, maxWaitMs: 180_000 };
  }
  return { name: 'standard', softLimitBytes: 300 * MB, hardLimitBytes: 750 * MB, pixelRatioCap: 1.5, pollIntervalMs: 500, maxWaitMs: 120_000 };
}

export function validateRemoteModelUrl(rawUrl: string): URL {
  const value = rawUrl.trim();
  if (!value || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ModelLoadException('URL_INVALID', 'The model URL is empty or malformed.', 'Copy a direct HTTPS download link, or download the model and open it locally.');
  }
  let url: URL;
  try { url = new URL(value, window.location.href); }
  catch { throw new ModelLoadException('URL_INVALID', 'The model URL could not be parsed.', 'Copy a direct HTTPS download link.'); }
  if (url.username || url.password) {
    throw new ModelLoadException('URL_INVALID', 'URLs containing embedded credentials are not allowed.', 'Use a time-limited HTTPS link without embedded username or password.');
  }
  if (!['http:', 'https:', 'blob:'].includes(url.protocol)) {
    throw new ModelLoadException('URL_INVALID', `The ${url.protocol} URL scheme is not allowed.`);
  }
  const localDev = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol === 'http:' && window.location.protocol === 'https:' && !localDev) {
    throw new ModelLoadException('URL_INSECURE', 'An HTTPS page cannot safely load an HTTP model.', 'Use an HTTPS model URL or download the file and open it locally.');
  }
  url.hash = '';
  return url;
}

export async function validateLocalFiles(files: File[], profile: DeviceLoadProfile): Promise<{ primaryName: string; totalBytes: number; warning: string | null }> {
  if (!files.length) throw new ModelLoadException('FORMAT_UNSUPPORTED', 'No files were selected.');
  if (files.length > 512) throw new ModelLoadException('SIZE_LIMIT', 'Too many files were selected.', 'Package the model and its dependencies into a smaller, supported project.');
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (files.some(file => file.size === 0)) throw new ModelLoadException('FORMAT_MISMATCH', 'One or more selected files are empty.', 'Re-export the model and try again.');
  if (totalBytes > profile.hardLimitBytes) {
    throw new ModelLoadException('SIZE_LIMIT', `This ${(totalBytes / MB).toFixed(1)} MB selection exceeds the ${profile.name} device limit of ${Math.round(profile.hardLimitBytes / MB)} MB.`, 'Use binary STL or GLB, decimate the mesh, remove unused textures, or load it on a higher-memory device.');
  }
  for (const file of files) {
    const extension = getFileExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new ModelLoadException('FORMAT_UNSUPPORTED', `.${extension || '(none)'} files are not supported.`);
  }
  const primary = files.find(file => PRIMARY_EXTENSIONS.has(getFileExtension(file.name)));
  if (!primary) throw new ModelLoadException('FORMAT_UNSUPPORTED', 'No supported primary 3D model was selected.');
  await sniffModelFile(primary);
  const warning = totalBytes > profile.softLimitBytes
    ? `Large model: ${(totalBytes / MB).toFixed(1)} MB. ${profile.name} mode will use conservative rendering settings.`
    : null;
  return { primaryName: primary.name, totalBytes, warning };
}

export async function sniffModelFile(file: Blob & { name?: string }): Promise<void> {
  const name = file.name || 'model';
  const extension = getFileExtension(name);
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 4096)).arrayBuffer());
  if (extension === 'glb' && (bytes.length < 12 || String.fromCharCode(...bytes.slice(0, 4)) !== 'glTF')) {
    throw new ModelLoadException('FORMAT_MISMATCH', 'This file does not contain a valid GLB header.', 'Re-export the model as GLB.');
  }
  if (extension === 'zip' && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    throw new ModelLoadException('FORMAT_MISMATCH', 'This file does not contain a valid ZIP header.', 'Recreate the planning bundle.');
  }
  if (extension === 'stl' && file.size >= 84) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length >= 84) {
      const triangles = view.getUint32(80, true);
      const expected = 84 + triangles * 50;
      const prefix = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
      const looksAscii = prefix.startsWith('solid') && prefix.includes('facet');
      if (!looksAscii && expected !== file.size) {
        throw new ModelLoadException('FORMAT_MISMATCH', 'The binary STL header and file length do not agree.', 'Repair or re-export the model as binary STL.');
      }
    }
  }
}

export function asLoadException(error: unknown): ModelLoadException {
  if (error instanceof ModelLoadException) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return new ModelLoadException('CANCELLED', 'Model loading was cancelled.');
  if (!navigator.onLine) return new ModelLoadException('NETWORK_OFFLINE', 'The device is offline.', 'Reconnect, or download the model elsewhere and open it locally.');
  if (error instanceof TypeError) return new ModelLoadException('CORS_BLOCKED', 'The model could not be downloaded. The host may block cross-origin access.', 'Download the model and open it locally, or configure the host to allow this viewer origin.');
  return new ModelLoadException('PARSE_FAILED', error instanceof Error ? error.message : 'The model could not be loaded.', 'Re-export the model as binary STL or GLB and try again.');
}
